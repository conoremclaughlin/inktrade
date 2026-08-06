/**
 * Robinhood as a BrokerProvider, spoken over its agentic MCP server.
 *
 * Robinhood ships no REST API for this — the agentic surface is an MCP server
 * at agent.robinhood.com/mcp/trading — so the vendor call is a `tools/call`
 * rather than a path. Everything is normalized to the Inktrade broker contract
 * before it leaves this file, so screens never learn that this brokerage
 * happens to be MCP-shaped, and our own API can proxy it like any other source.
 *
 * **Read-only by construction.** The server also exposes `place_equity_order`,
 * `place_option_order`, `exercise_option` and the cancel tools; none are wired
 * here. Trading is a deliberate, separately-reviewed step, not something that
 * arrives as a side effect of rendering a portfolio.
 *
 * ## What Robinhood does and doesn't give you
 *
 * Shapes here were captured from live responses, because Robinhood publishes
 * no output reference. Four facts drive the whole design:
 *
 *   1. **Positions carry no market value and no price.** `get_equity_positions`
 *      returns quantity and average cost only; its own guide says to call
 *      `get_equity_quotes` and multiply. So a position is worthless — literally
 *      $0.00 — until joined against a quote.
 *   2. **Options are a separate call, and carry no strike or call/put.**
 *      `get_option_positions` gives `chain_symbol`, direction and expiry;
 *      strike and right require `get_option_instruments`. Skipping that join
 *      would render every option as an unlabelled row.
 *   3. **Quantity is always positive.** Direction lives in `type`
 *      ('long' | 'short'), so a short read naively becomes a long.
 *   4. **There is no portfolio-level previous close**, so the day's move has to
 *      be summed from positions rather than read off the account.
 */

import type {
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
  'get_option_positions',
  'get_option_instruments',
  'get_option_quotes',
  'get_equity_orders',
] as const;

/**
 * Quote calls silently drop the official close above 20 symbols (`closes_error`
 * is set instead), so batches stay at the documented limit.
 */
const QUOTE_BATCH = 20;

/** Pages guarded so a pagination bug can't spin forever. */
const MAX_PAGES = 20;

export interface RobinhoodBrokerOptions {
  /** A connected MCP client — see RobinhoodConnection.connect(). */
  client: Client;
  /**
   * Resolve option strike and call/put via `get_option_instruments`.
   *
   * On by default. Turning it off saves a round trip per 20 contracts at the
   * cost of unlabelled option rows — worth it only for a value-total view.
   */
  resolveOptionDetail?: boolean;
}

export class RobinhoodBroker implements BrokerProvider {
  readonly name = 'robinhood';
  readonly isMock = false;

  private readonly client: Client;
  private readonly resolveOptionDetail: boolean;

  constructor(options: RobinhoodBrokerOptions) {
    this.client = options.client;
    this.resolveOptionDetail = options.resolveOptionDetail ?? true;
  }

  async getPortfolio(): Promise<PortfolioSummary> {
    const accountsRaw = asArray(
      await callToolJson<unknown>(this.client, 'get_accounts'),
      'accounts',
    ).filter(isUsableAccount);

    const accounts = await Promise.all(
      accountsRaw.map((raw) => this.loadAccount(raw)),
    );

    const totalValue = accounts.reduce((sum, a) => sum + a.balances.liquidationValue, 0);
    // No portfolio-level previous close exists, so the day's move is the sum of
    // the positions' — which also means it excludes anything we couldn't quote.
    const dayChange = accounts
      .flatMap((a) => a.positions)
      .reduce((sum, p) => sum + p.dayChange, 0);
    const openingValue = totalValue - dayChange;

    return {
      totalValue,
      dayChange,
      dayChangePercent: openingValue === 0 ? 0 : (dayChange / openingValue) * 100,
      accounts,
    };
  }

  /**
   * Robinhood's MCP exposes no portfolio-value-history tool — the graph in
   * their own app is not something they hand to agents.
   *
   * Rather than invent a curve, this returns an empty series. History is a
   * snapshot concern: Inktrade records values over time and serves them
   * separately, the same conclusion Schwab forced. An empty `points` array is
   * the signal that this provider has nothing to contribute.
   */
  async getPortfolioHistory(period: PortfolioPeriod): Promise<PortfolioHistory> {
    return { period, points: [], approximate: false };
  }

  /**
   * Order history, newest first, optionally for one symbol.
   *
   * Robinhood's tool takes a symbol filter, so a per-ticker feed is a narrowed
   * query rather than a filtered global list.
   *
   * Unlike the portfolio path, these field names have not been checked against
   * a live response — the readers are deliberately forgiving as a result.
   */
  async getOrders(params: { symbol?: string; limit?: number } = {}): Promise<OrderActivity[]> {
    const accounts = asArray(
      await callToolJson<unknown>(this.client, 'get_accounts'),
      'accounts',
    ).filter(isUsableAccount);

    const args: Record<string, unknown> = {};
    const accountNumber = accountNumberOf(accounts[0]);
    if (accountNumber) args.account_number = accountNumber;
    if (params.symbol) args.symbol = params.symbol.toUpperCase();

    const raw = await callToolJson<unknown>(this.client, 'get_equity_orders', args);

    const orders = asArray(raw, 'orders')
      .map(normalizeOrder)
      .filter((o): o is OrderActivity => o !== null)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    return params.limit ? orders.slice(0, params.limit) : orders;
  }

  private async loadAccount(raw: Record<string, unknown>): Promise<BrokerageAccount> {
    const accountNumber = accountNumberOf(raw) ?? '';

    const [portfolioRaw, equityRaw, optionRaw] = await Promise.all([
      callToolJson<unknown>(this.client, 'get_portfolio', { account_number: accountNumber }),
      this.paginate('get_equity_positions', { account_number: accountNumber }, 'positions'),
      this.paginate(
        'get_option_positions',
        { account_number: accountNumber, nonzero: true },
        'positions',
      ),
    ]);

    const [equityPositions, optionPositions] = await Promise.all([
      this.buildEquityPositions(equityRaw),
      this.buildOptionPositions(optionRaw),
    ]);

    const portfolio = asRecord(portfolioRaw);
    const buyingPower = nested(portfolio, 'buying_power');

    return {
      accountId: accountNumber,
      nickname:
        str(raw, 'nickname') ?? labelForAccountType(str(raw, 'brokerage_account_type')),
      balances: {
        liquidationValue: num(portfolio, 'total_value') ?? 0,
        cashBalance: num(portfolio, 'cash') ?? 0,
        buyingPower: num(buyingPower, 'buying_power') ?? 0,
      },
      positions: [...equityPositions, ...optionPositions],
    };
  }

  private async buildEquityPositions(
    rawPositions: Record<string, unknown>[],
  ): Promise<Position[]> {
    const symbols = [
      ...new Set(rawPositions.map(symbolOf).filter((s): s is string => Boolean(s))),
    ];

    // A quote failure costs prices, not the whole screen — but the positions
    // that come back are then explicitly value-less rather than zero-valued.
    const quotes = await this.fetchEquityQuotes(symbols).catch(() => new Map<string, Mark>());

    return rawPositions
      .map((raw) => normalizeEquityPosition(raw, quotes))
      .filter((p): p is Position => p !== null);
  }

  private async buildOptionPositions(
    rawPositions: Record<string, unknown>[],
  ): Promise<Position[]> {
    const ids = [
      ...new Set(
        rawPositions.map((p) => str(p, 'option_id')).filter((id): id is string => Boolean(id)),
      ),
    ];

    const [quotes, instruments] = await Promise.all([
      this.fetchOptionQuotes(ids).catch(() => new Map<string, Mark>()),
      this.resolveOptionDetail
        ? this.fetchOptionInstruments(ids).catch(() => new Map<string, OptionDetail>())
        : Promise.resolve(new Map<string, OptionDetail>()),
    ]);

    return rawPositions
      .map((raw) => normalizeOptionPosition(raw, quotes, instruments))
      .filter((p): p is Position => p !== null);
  }

  private async fetchEquityQuotes(symbols: string[]): Promise<Map<string, Mark>> {
    const marks = new Map<string, Mark>();

    for (const batch of chunk(symbols, QUOTE_BATCH)) {
      const raw = await callToolJson<unknown>(this.client, 'get_equity_quotes', {
        symbols: batch,
      });

      for (const entry of asArray(raw, 'results')) {
        const quote = nested(entry, 'quote');
        const symbol = symbolOf(quote);
        if (!symbol) continue;

        const price = currentEquityPrice(quote);
        // The official settled close is preferred; the quote's own copy is the
        // documented fallback when a batch comes back without closes.
        const previous =
          num(nested(entry, 'close'), 'price') ??
          num(quote, 'adjusted_previous_close', 'previous_close');

        if (price === undefined || previous === undefined) continue;
        marks.set(symbol, { price, previousClose: previous });
      }
    }

    return marks;
  }

  private async fetchOptionQuotes(ids: string[]): Promise<Map<string, Mark>> {
    const marks = new Map<string, Mark>();

    for (const batch of chunk(ids, QUOTE_BATCH)) {
      const raw = await callToolJson<unknown>(this.client, 'get_option_quotes', {
        instrument_ids: batch,
      });

      for (const entry of asArray(raw, 'results')) {
        const quote = nested(entry, 'quote');
        const id = str(quote, 'instrument_id');
        // adjusted_mark_price is the one to compare against cost basis.
        const price = num(quote, 'adjusted_mark_price', 'mark_price');
        const previous =
          num(nested(entry, 'close'), 'price') ?? num(quote, 'previous_close_price');

        if (!id || price === undefined || previous === undefined) continue;
        marks.set(id, { price, previousClose: previous });
      }
    }

    return marks;
  }

  private async fetchOptionInstruments(ids: string[]): Promise<Map<string, OptionDetail>> {
    const details = new Map<string, OptionDetail>();

    for (const batch of chunk(ids, QUOTE_BATCH)) {
      const raw = await callToolJson<unknown>(this.client, 'get_option_instruments', {
        ids: batch.join(','),
      });

      for (const instrument of asArray(raw, 'instruments')) {
        const id = str(instrument, 'id');
        const detail = normalizeOptionDetail(instrument);
        if (id && detail) details.set(id, detail);
      }
    }

    return details;
  }

  /** Walk a cursor-paginated tool to the end, bounded. */
  private async paginate(
    tool: string,
    args: Record<string, unknown>,
    key: string,
  ): Promise<Record<string, unknown>[]> {
    const all: Record<string, unknown>[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < MAX_PAGES; page++) {
      const raw = await callToolJson<unknown>(this.client, tool, {
        ...args,
        ...(cursor ? { cursor } : {}),
      });

      all.push(...asArray(raw, key));

      cursor = nextCursor(asRecord(raw));
      if (!cursor) break;
    }

    return all;
  }
}

/** A current price and the close to measure today's move against. */
interface Mark {
  price: number;
  previousClose: number;
}

/**
 * Robinhood reports two last-trade prices — regular session and extended
 * hours — and says to take whichever is more recent. Picking wrong shows a
 * stale price after hours.
 */
export function currentEquityPrice(quote: Record<string, unknown>): number | undefined {
  const regular = num(quote, 'last_trade_price');
  const extended = num(quote, 'last_non_reg_trade_price');
  if (regular === undefined) return extended;
  if (extended === undefined) return regular;

  const regularAt = Date.parse(str(quote, 'venue_last_trade_time') ?? '');
  const extendedAt = Date.parse(str(quote, 'venue_last_non_reg_trade_time') ?? '');
  if (!Number.isFinite(extendedAt)) return regular;
  if (!Number.isFinite(regularAt)) return extended;

  return extendedAt > regularAt ? extended : regular;
}

function symbolOf(raw: Record<string, unknown>): string | undefined {
  return str(raw, 'symbol', 'chain_symbol', 'ticker')?.toUpperCase();
}

function accountNumberOf(raw: Record<string, unknown> | undefined): string | undefined {
  return raw ? str(raw, 'account_number', 'rhs_account_number') : undefined;
}

/** Skip closed accounts — they carry no positions and would render as empty rows. */
function isUsableAccount(raw: Record<string, unknown>): boolean {
  return raw.deactivated !== true && raw.permanently_deactivated !== true;
}

function labelForAccountType(type: string | undefined): string {
  switch (type) {
    case 'ira_roth':
      return 'Roth IRA';
    case 'ira_traditional':
      return 'Traditional IRA';
    case 'individual':
      return 'Individual';
    default:
      return type ?? 'Robinhood';
  }
}

/**
 * Direction, as a sign.
 *
 * Robinhood reports `quantity` as a positive magnitude and puts the direction
 * in `type`, so reading quantity alone turns every short into a long.
 */
function directionSign(raw: Record<string, unknown>): number {
  return str(raw, 'type')?.toLowerCase() === 'short' ? -1 : 1;
}

export function normalizeEquityPosition(
  raw: Record<string, unknown>,
  quotes: Map<string, Mark>,
): Position | null {
  const symbol = symbolOf(raw);
  const magnitude = num(raw, 'quantity');
  if (!symbol || magnitude === undefined) return null;

  const quantity = magnitude * directionSign(raw);
  const mark = quotes.get(symbol);

  return {
    symbol,
    // Robinhood doesn't distinguish ETFs from common stock on a position, and
    // guessing from the ticker would be wrong often enough to matter.
    assetType: 'EQUITY',
    quantity,
    averagePrice: num(raw, 'average_buy_price') ?? 0,
    // Zero when unquoted. The caller can tell it apart from a genuinely
    // worthless holding because dayChange is zero too and the quote is absent.
    marketValue: mark ? mark.price * quantity : 0,
    dayChange: mark ? (mark.price - mark.previousClose) * quantity : 0,
    dayChangePercent: mark ? positionReturn(mark, quantity, 1) : 0,
  };
}

export function normalizeOptionPosition(
  raw: Record<string, unknown>,
  quotes: Map<string, Mark>,
  instruments: Map<string, OptionDetail>,
): Position | null {
  const underlying = symbolOf(raw);
  const magnitude = num(raw, 'quantity');
  if (!underlying || magnitude === undefined) return null;

  const quantity = magnitude * directionSign(raw);
  const multiplier = num(raw, 'trade_value_multiplier') ?? 100;
  const id = str(raw, 'option_id');
  const mark = id ? quotes.get(id) : undefined;
  const detail = id ? instruments.get(id) : undefined;

  // average_price is the whole-contract cost, so dividing by the multiplier
  // gives the per-share premium the rest of the app quotes options in.
  const averagePrice = Math.abs(num(raw, 'average_price') ?? 0) / multiplier;

  return {
    symbol: detail ? optionSymbol(detail) : underlying,
    assetType: 'OPTION',
    quantity,
    averagePrice,
    marketValue: mark ? mark.price * multiplier * quantity : 0,
    dayChange: mark ? (mark.price - mark.previousClose) * multiplier * quantity : 0,
    dayChangePercent: mark ? positionReturn(mark, quantity, multiplier) : 0,
    ...(detail
      ? { option: { ...detail, underlyingSymbol: detail.underlyingSymbol || underlying } }
      : {}),
  };
}

/**
 * The day's return on the *position*, not on the instrument.
 *
 * These differ in sign whenever the position is short: a contract that rises
 * 64% is a 64% loss to whoever sold it. Reporting the instrument's move would
 * put a red dollar figure next to a green percentage on the same row, so this
 * is measured against the position's own opening value and always agrees in
 * sign with dayChange.
 */
function positionReturn(mark: Mark, quantity: number, multiplier: number): number {
  const openingValue = mark.previousClose * multiplier * quantity;
  if (openingValue === 0) return 0;
  const change = (mark.price - mark.previousClose) * multiplier * quantity;
  return (change / Math.abs(openingValue)) * 100;
}

/** "GOOG 360P" — expiry is carried separately by the contract's option detail. */
function optionSymbol(detail: OptionDetail): string {
  return `${detail.underlyingSymbol} ${detail.strike}${detail.putCall === 'CALL' ? 'C' : 'P'}`;
}

export function normalizeOptionDetail(
  raw: Record<string, unknown>,
): OptionDetail | undefined {
  const strike = num(raw, 'strike_price', 'strike');
  const expiration = str(raw, 'expiration_date', 'expiration');
  const type = str(raw, 'type', 'option_type', 'put_call')?.toUpperCase();
  if (strike === undefined || !expiration || (type !== 'PUT' && type !== 'CALL')) {
    return undefined;
  }

  return {
    underlyingSymbol: str(raw, 'chain_symbol', 'underlying_symbol') ?? '',
    putCall: type,
    strike,
    expiration: expiration.slice(0, 10),
    multiplier: num(raw, 'trade_value_multiplier', 'multiplier') ?? 100,
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

  const price = num(raw, 'average_price', 'price', 'executed_price');
  const legDetail = normalizeOptionDetail(nested(raw, 'option'));

  return {
    id,
    symbol,
    assetType: legDetail ? 'OPTION' : 'EQUITY',
    side: normalizeSide(str(raw, 'side', 'direction', 'transaction_type')),
    status: normalizeStatus(str(raw, 'state', 'status')),
    quantity: num(raw, 'filled_quantity', 'cumulative_quantity', 'quantity') ?? 0,
    // Null rather than 0 while unfilled — an unfilled order has no fill price,
    // and zero would render as a free trade.
    price: price ?? null,
    timestamp,
    ...(legDetail
      ? { option: { ...legDetail, underlyingSymbol: legDetail.underlyingSymbol || symbol } }
      : {}),
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

/** Pull the `cursor` query param out of a `next` URL, if there is one. */
export function nextCursor(payload: Record<string, unknown>): string | undefined {
  const direct = str(payload, 'next_cursor', 'cursor');
  if (direct) return direct;

  const next = str(payload, 'next');
  if (!next) return undefined;
  try {
    return new URL(next).searchParams.get('cursor') ?? undefined;
  } catch {
    return undefined;
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
