/**
 * Robinhood as a BrokerProvider, spoken over its agentic MCP server.
 *
 * Robinhood exposes no REST API for this — the agentic surface is an MCP
 * server at https://agent.robinhood.com/mcp/trading — so the vendor call is a
 * `tools/call` rather than a path. Everything is normalized to the Inktrade
 * broker contract before it leaves this file, so screens never learn that this
 * particular brokerage happens to be MCP-shaped.
 *
 * **Read-only by construction.** The server also exposes `place_equity_order`,
 * `review_equity_order` and `cancel_equity_order`; none of them are wired here.
 * Placing orders is a deliberate, separately-reviewed step, not something that
 * arrives as a side effect of rendering a portfolio.
 *
 * Two limits are worth knowing before reading further:
 *   - Robinhood grants *read* access across every account but only allows
 *     writes in the ring-fenced Agentic account. That asymmetry is exactly
 *     what a portfolio view wants.
 *   - There is no portfolio-value-history tool, so `getPortfolioHistory`
 *     cannot be answered from the brokerage. See the method for what that
 *     means.
 */

import type {
  AccountBalances,
  BrokerProvider,
  BrokerageAccount,
  OptionDetail,
  OrderActivity,
  OrderSide,
  OrderStatus,
  PortfolioHistory,
  PortfolioPeriod,
  PortfolioSummary,
  Position,
} from '@inktrade/client/broker';
import type { Client } from '@modelcontextprotocol/client';
import { callToolJson } from '../mcp/tools.js';
import { asArray, asRecord, isoTimestamp, nested, num, str } from './shapes.js';

/** The tools this provider calls. Trading tools are intentionally absent. */
export const ROBINHOOD_READ_TOOLS = [
  'get_accounts',
  'get_portfolio',
  'get_equity_positions',
  'get_equity_quotes',
  'get_equity_orders',
] as const;

export interface RobinhoodBrokerOptions {
  /** A connected MCP client — see RobinhoodConnection.connect(). */
  client: Client;
  /** Cap on symbols per quote call, to stay clear of undocumented limits. */
  quoteBatchSize?: number;
}

export class RobinhoodBroker implements BrokerProvider {
  readonly name = 'robinhood';
  readonly isMock = false;

  private readonly client: Client;
  private readonly quoteBatchSize: number;

  constructor(options: RobinhoodBrokerOptions) {
    this.client = options.client;
    this.quoteBatchSize = options.quoteBatchSize ?? 50;
  }

  async getPortfolio(): Promise<PortfolioSummary> {
    const [accountsRaw, portfolioRaw, positionsRaw] = await Promise.all([
      callToolJson<unknown>(this.client, 'get_accounts'),
      callToolJson<unknown>(this.client, 'get_portfolio'),
      callToolJson<unknown>(this.client, 'get_equity_positions'),
    ]);

    const rawPositions = asArray(positionsRaw, 'positions');
    const symbols = [
      ...new Set(rawPositions.map((p) => symbolOf(p)).filter((s): s is string => Boolean(s))),
    ];

    // Positions don't reliably carry today's move, so quotes supply it. A
    // failure here costs the day-change column, not the whole screen.
    const quotes = await this.fetchQuotes(symbols).catch(() => new Map<string, DayMove>());

    const positions = rawPositions
      .map((raw) => normalizePosition(raw, quotes))
      .filter((p): p is Position => p !== null);

    const accounts = buildAccounts(asArray(accountsRaw, 'accounts'), asRecord(portfolioRaw), positions);
    const portfolio = asRecord(portfolioRaw);

    const totalValue =
      num(portfolio, 'equity', 'total_equity', 'market_value', 'portfolio_value') ??
      accounts.reduce((sum, a) => sum + a.balances.liquidationValue, 0);

    const previousClose = num(
      portfolio,
      'adjusted_previous_close_equity',
      'previous_close_equity',
      'equity_previous_close',
      'previous_close',
    );

    const dayChange = previousClose !== undefined ? totalValue - previousClose : sumDayChange(positions);
    const dayChangePercent =
      previousClose && previousClose !== 0 ? (dayChange / previousClose) * 100 : 0;

    return { totalValue, dayChange, dayChangePercent, accounts };
  }

  /**
   * Robinhood's MCP exposes no portfolio-value-history tool — the graph in
   * their own app is not something they hand to agents.
   *
   * Rather than invent a curve, this returns an empty series. History is a
   * snapshot concern: Inktrade records values over time and serves them
   * separately, which is the same conclusion Schwab forced. An empty `points`
   * array is the signal that this provider has nothing to contribute.
   */
  async getPortfolioHistory(period: PortfolioPeriod): Promise<PortfolioHistory> {
    return { period, points: [], approximate: false };
  }

  /**
   * Order history, newest first. Robinhood's tool takes a symbol filter, so a
   * per-ticker feed is a narrowed query rather than a filtered global list.
   */
  async getOrders(params: { symbol?: string; limit?: number } = {}): Promise<OrderActivity[]> {
    const args: Record<string, unknown> = {};
    if (params.symbol) args.symbol = params.symbol.toUpperCase();
    if (params.limit) args.limit = params.limit;

    const raw = await callToolJson<unknown>(this.client, 'get_equity_orders', args);

    return asArray(raw, 'orders')
      .map(normalizeOrder)
      .filter((o): o is OrderActivity => o !== null)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  private async fetchQuotes(symbols: string[]): Promise<Map<string, DayMove>> {
    const moves = new Map<string, DayMove>();
    if (symbols.length === 0) return moves;

    for (let i = 0; i < symbols.length; i += this.quoteBatchSize) {
      const batch = symbols.slice(i, i + this.quoteBatchSize);
      const raw = await callToolJson<unknown>(this.client, 'get_equity_quotes', { symbols: batch });

      for (const quote of asArray(raw, 'quotes')) {
        const symbol = symbolOf(quote);
        const last = num(quote, 'last_trade_price', 'last_extended_hours_trade_price', 'price');
        const previous = num(quote, 'previous_close', 'adjusted_previous_close');
        if (!symbol || last === undefined || previous === undefined || previous === 0) continue;

        moves.set(symbol, {
          changePerShare: last - previous,
          changePercent: ((last - previous) / previous) * 100,
        });
      }
    }

    return moves;
  }
}

interface DayMove {
  changePerShare: number;
  changePercent: number;
}

function symbolOf(raw: Record<string, unknown>): string | undefined {
  return str(raw, 'symbol', 'ticker', 'instrument_symbol')?.toUpperCase();
}

function sumDayChange(positions: Position[]): number {
  return positions.reduce((sum, p) => sum + p.dayChange, 0);
}

export function normalizePosition(
  raw: Record<string, unknown>,
  quotes: Map<string, DayMove>,
): Position | null {
  const symbol = symbolOf(raw);
  if (!symbol) return null;

  const quantity = num(raw, 'quantity', 'shares', 'shares_held');
  if (quantity === undefined) return null;

  const averagePrice = num(raw, 'average_buy_price', 'average_price', 'avg_cost') ?? 0;
  const price = num(raw, 'price', 'last_trade_price', 'current_price');
  const marketValue =
    num(raw, 'market_value', 'equity', 'value') ?? (price !== undefined ? price * quantity : 0);

  const move = quotes.get(symbol);
  const dayChange =
    num(raw, 'day_change', 'todays_return') ??
    (move ? move.changePerShare * quantity : 0);
  const dayChangePercent =
    num(raw, 'day_change_percent', 'todays_return_percent') ?? move?.changePercent ?? 0;

  return {
    symbol,
    // Robinhood does not distinguish ETFs from common stock on a position, and
    // guessing from the ticker would be wrong often enough to matter.
    assetType: 'EQUITY',
    quantity,
    averagePrice,
    marketValue,
    dayChange,
    dayChangePercent,
  };
}

export function normalizeOrder(raw: Record<string, unknown>): OrderActivity | null {
  const symbol = symbolOf(raw);
  const id = str(raw, 'id', 'order_id', 'ref_id');
  if (!symbol || !id) return null;

  const timestamp =
    isoTimestamp(str(raw, 'last_transaction_at', 'executed_at', 'filled_at')) ??
    isoTimestamp(str(raw, 'created_at', 'updated_at', 'timestamp'));
  if (!timestamp) return null;

  const quantity = num(raw, 'filled_quantity', 'cumulative_quantity', 'quantity') ?? 0;
  const price = num(raw, 'average_price', 'price', 'executed_price');
  const option = normalizeOptionDetail(raw, symbol);

  return {
    id,
    symbol,
    assetType: option ? 'OPTION' : 'EQUITY',
    side: normalizeSide(str(raw, 'side', 'direction', 'transaction_type')),
    status: normalizeStatus(str(raw, 'state', 'status')),
    quantity,
    // Null rather than 0 while unfilled — an unfilled order has no fill price,
    // and zero would render as a free trade.
    price: price ?? null,
    timestamp,
    ...(option ? { option } : {}),
  };
}

function normalizeOptionDetail(
  raw: Record<string, unknown>,
  symbol: string,
): OptionDetail | undefined {
  const leg = nested(raw, 'option') ?? {};
  const source = Object.keys(leg).length > 0 ? leg : raw;

  const strike = num(source, 'strike_price', 'strike');
  const expiration = str(source, 'expiration_date', 'expiration');
  const type = str(source, 'option_type', 'put_call', 'type')?.toUpperCase();
  if (strike === undefined || !expiration || (type !== 'PUT' && type !== 'CALL')) return undefined;

  return {
    underlyingSymbol: str(source, 'chain_symbol', 'underlying_symbol') ?? symbol,
    putCall: type,
    strike,
    expiration: expiration.slice(0, 10),
    multiplier: num(source, 'multiplier', 'trade_value_multiplier') ?? 100,
  };
}

function normalizeSide(value: string | undefined): OrderSide {
  return value?.toLowerCase().startsWith('s') ? 'SELL' : 'BUY';
}

function normalizeStatus(value: string | undefined): OrderStatus {
  switch (value?.toLowerCase()) {
    case 'filled':
      return 'FILLED';
    case 'partially_filled':
    case 'partial':
      return 'PARTIAL';
    case 'cancelled':
    case 'canceled':
      return 'CANCELLED';
    case 'rejected':
    case 'failed':
      return 'REJECTED';
    default:
      return 'OPEN';
  }
}

function buildAccounts(
  rawAccounts: Record<string, unknown>[],
  portfolio: Record<string, unknown>,
  positions: Position[],
): BrokerageAccount[] {
  const balances = (source: Record<string, unknown>): AccountBalances => ({
    liquidationValue:
      num(source, 'total_equity', 'equity', 'market_value', 'portfolio_value') ??
      num(portfolio, 'equity', 'market_value') ??
      0,
    cashBalance: num(source, 'cash', 'cash_balance', 'buying_power') ?? 0,
    buyingPower: num(source, 'buying_power', 'cash_available_for_withdrawal') ?? 0,
  });

  if (rawAccounts.length === 0) {
    return [
      {
        accountId: 'robinhood',
        nickname: 'Robinhood',
        balances: balances(portfolio),
        positions,
      },
    ];
  }

  // Positions are not reliably tagged with an account, so they hang off the
  // first one rather than being split on a guess.
  return rawAccounts.map((raw, index) => ({
    accountId: str(raw, 'account_number', 'id', 'url') ?? `robinhood-${index}`,
    nickname: str(raw, 'nickname', 'brokerage_account_type', 'type') ?? 'Robinhood',
    balances: balances({ ...nested(raw, 'balances'), ...raw }),
    positions: index === 0 ? positions : [],
  }));
}
