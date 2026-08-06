/**
 * Robinhood as a BrokerProvider, spoken over its agentic MCP server.
 *
 * Robinhood ships no REST API for this — the agentic surface is an MCP server
 * at agent.robinhood.com/mcp/trading — so the vendor call is a `tools/call`
 * rather than a path. Everything is normalized to the Inktrade broker contract
 * before it leaves this file, so screens never learn that this brokerage
 * happens to be MCP-shaped, and our own API can proxy it like any other source.
 *
 * Reading is the bulk of this file. Order placement lives in ./trading.ts and
 * is reached only through `reviewOrder`, `placeOrder` and `cancelOrder`, each
 * of which refuses any account Robinhood hasn't flagged agent-tradable. Option
 * orders and `exercise_option` are not wired at all.
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
  BrokerWatchlist,
  BrokerWatchlistDetail,
  BrokerageAccount,
  MarketDataProvider,
  OptionChain,
  OptionContract,
  OptionDetail,
  OrderActivity,
  OrderReceipt,
  OrderRequest,
  OrderReview,
  OrderSide,
  OrderStatus,
  PortfolioHistory,
  PortfolioPeriod,
  PortfolioSummary,
  Position,
  TradingProvider,
} from '@inktrade/client/broker';
import type { Quote } from '@inktrade/client';
import type { Client } from '@modelcontextprotocol/client';
import { randomUUID } from 'node:crypto';
import { callToolJson } from '../mcp/tools.js';
import { ToolCache } from '../mcp/cache.js';
import {
  chainExpirations,
  chainIdFor,
  nearestExpiration,
  normalizeContract,
  normalizeQuote,
  normalizeWatchlist,
  watchlistSymbols,
} from './market-data.js';
import { asArray, asRecord, isoTimestamp, nested, num, str } from './shapes.js';
import {
  assertTradable,
  buildOrderArgs,
  isAgenticAccount,
  normalizeReceipt,
  normalizeReview,
} from './trading.js';

/** Read tools. Enumerated so a live smoke test can assert the server has them. */
export const ROBINHOOD_READ_TOOLS = [
  'get_accounts',
  'get_portfolio',
  'get_equity_positions',
  'get_equity_quotes',
  'get_option_positions',
  'get_option_instruments',
  'get_option_quotes',
  'get_equity_orders',
  'get_option_chains',
  'get_watchlists',
  'get_watchlist_items',
] as const;

/**
 * Write tools. Listed so it is auditable which of them we are willing to call
 * — option orders and exercise are deliberately not among them.
 */
export const ROBINHOOD_WRITE_TOOLS = [
  'review_equity_order',
  'place_equity_order',
  'cancel_equity_order',
] as const;

/**
 * Quote calls silently drop the official close above 20 symbols (`closes_error`
 * is set instead), so batches stay at the documented limit.
 */
const QUOTE_BATCH = 20;

/** Pages guarded so a pagination bug can't spin forever. */
const MAX_PAGES = 20;

/**
 * Strikes either side of spot to price by default.
 *
 * A liquid underlying lists hundreds of contracts per expiry and quoting them
 * all costs one round trip per 20. Nobody reads a chain that far out; 25 each
 * way covers what a screen shows with room to scroll.
 */
const STRIKE_WINDOW = 25;

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
  /**
   * Cache tool responses. Supply a shared instance to reuse immutable data —
   * contract definitions especially — across requests. Pass null to disable.
   */
  cache?: ToolCache | null;
}

export class RobinhoodBroker implements BrokerProvider, TradingProvider, MarketDataProvider {
  readonly name = 'robinhood';
  readonly isMock = false;

  private readonly client: Client;
  private readonly resolveOptionDetail: boolean;
  private readonly cache: ToolCache | null;

  constructor(options: RobinhoodBrokerOptions) {
    this.client = options.client;
    this.resolveOptionDetail = options.resolveOptionDetail ?? true;
    this.cache = options.cache === undefined ? new ToolCache() : options.cache;
  }

  /**
   * Every read goes through here so caching and coalescing are automatic
   * rather than something each call site has to remember.
   */
  private read<T>(tool: string, args: Record<string, unknown> = {}): Promise<T> {
    const load = () => callToolJson<T>(this.client, tool, args);
    return this.cache ? this.cache.resolve(tool, args, load) : load();
  }

  /**
   * Forget what an order just made stale.
   *
   * Holdings, balances and order history all change on a fill; contract
   * definitions and the account list do not, so those are left alone.
   */
  private invalidateAfterTrade(): void {
    for (const tool of [
      'get_portfolio',
      'get_equity_positions',
      'get_option_positions',
      'get_equity_orders',
    ]) {
      this.cache?.invalidate(tool);
    }
  }

  async getPortfolio(): Promise<PortfolioSummary> {
    const accountsRaw = await this.accounts();

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
    const accounts = await this.accounts();

    const args: Record<string, unknown> = {};
    const accountNumber = accountNumberOf(accounts[0]);
    if (accountNumber) args.account_number = accountNumber;
    if (params.symbol) args.symbol = params.symbol.toUpperCase();

    const raw = await this.read<unknown>('get_equity_orders', args);

    const orders = asArray(raw, 'orders')
      .map(normalizeOrder)
      .filter((o): o is OrderActivity => o !== null)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    return params.limit ? orders.slice(0, params.limit) : orders;
  }

  // --- Market data -------------------------------------------------------

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    const wanted = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
    const quotes: Quote[] = [];

    for (const batch of chunk(wanted, QUOTE_BATCH)) {
      const raw = await this.read<unknown>('get_equity_quotes', { symbols: batch });
      for (const entry of asArray(raw, 'results')) {
        const quote = normalizeQuote(entry);
        if (quote) quotes.push(quote);
      }
    }

    return quotes;
  }

  async getOptionExpirations(symbol: string): Promise<string[]> {
    const raw = await this.read<unknown>('get_option_chains', {
      underlying_symbol: symbol.toUpperCase(),
    });
    return chainExpirations(raw, symbol);
  }

  /**
   * A priced option chain for one expiration.
   *
   * Three calls joined: the chain gives expirations and a chain id, the
   * instruments give contract definitions, and the quotes give prices and
   * greeks. Robinhood returns greeks directly, so nothing here is modelled.
   */
  async getOptionChain(
    symbol: string,
    expiration?: string,
    options: { strikeWindow?: number } = {},
  ): Promise<OptionChain> {
    const upper = symbol.toUpperCase();
    const chainRaw = await this.read<unknown>('get_option_chains', {
      underlying_symbol: upper,
    });

    const expirations = chainExpirations(chainRaw, upper);
    const chainId = chainIdFor(chainRaw, upper);
    const target =
      expiration && expirations.includes(expiration)
        ? expiration
        : nearestExpiration(expirations, today());

    const [underlying] = await this.getQuotes([upper]).catch(() => []);
    const underlyingPrice = underlying?.price ?? null;

    if (!chainId || !target) {
      return { symbol: upper, expiration: target ?? '', expirations, underlyingPrice, contracts: [] };
    }

    const instruments = await this.paginate(
      'get_option_instruments',
      { chain_id: chainId, expiration_dates: target, state: 'active' },
      'instruments',
    );

    // Quoting every contract is what makes a chain slow: a liquid underlying
    // lists hundreds, and each batch of 20 is its own round trip. A chain is
    // read around the money, so only that window is priced — the rest are
    // returned as definitions with a null mark, which the UI already knows how
    // to render as "no quote" rather than as free.
    const ids = idsToQuote(instruments, underlyingPrice, options.strikeWindow ?? STRIKE_WINDOW);
    const priced = await this.fetchContractQuotes(ids).catch(
      () => new Map<string, { quote: Record<string, unknown>; close?: Record<string, unknown> }>(),
    );

    const contracts = instruments
      .map((instrument) => {
        const entry = priced.get(str(instrument, 'id') ?? '');
        return normalizeContract(instrument, entry?.quote, entry?.close);
      })
      .filter((c): c is OptionContract => c !== null)
      // Strike order, calls before puts — how an option chain is read.
      .sort((a, b) => a.strike - b.strike || a.putCall.localeCompare(b.putCall));

    return { symbol: upper, expiration: target, expirations, underlyingPrice, contracts };
  }

  /**
   * Price contracts by id, for strikes outside the window a chain priced.
   *
   * Instrument definitions are immutable and cached for a day, so the marginal
   * cost of a scroll-in is the quote call alone.
   */
  async getOptionContracts(ids: string[]): Promise<OptionContract[]> {
    const wanted = [...new Set(ids.filter(Boolean))];
    if (wanted.length === 0) return [];

    const [instruments, priced] = await Promise.all([
      this.fetchOptionInstrumentsById(wanted),
      this.fetchContractQuotes(wanted),
    ]);

    return wanted
      .map((id) => {
        const instrument = instruments.get(id);
        if (!instrument) return null;
        const entry = priced.get(id);
        return normalizeContract(instrument, entry?.quote, entry?.close);
      })
      .filter((c): c is OptionContract => c !== null);
  }

  private async fetchOptionInstrumentsById(
    ids: string[],
  ): Promise<Map<string, Record<string, unknown>>> {
    const byId = new Map<string, Record<string, unknown>>();

    for (const batch of chunk(ids, QUOTE_BATCH)) {
      const raw = await this.read<unknown>('get_option_instruments', { ids: batch.join(',') });
      for (const instrument of asArray(raw, 'instruments')) {
        const id = str(instrument, 'id');
        if (id) byId.set(id, instrument);
      }
    }

    return byId;
  }

  async getWatchlists(): Promise<BrokerWatchlist[]> {
    const raw = await this.read<unknown>('get_watchlists');
    return asArray(raw, 'watchlists')
      .map(normalizeWatchlist)
      .filter((w): w is BrokerWatchlist => w !== null);
  }

  async getWatchlist(id: string): Promise<BrokerWatchlistDetail> {
    const [lists, itemsRaw] = await Promise.all([
      this.getWatchlists(),
      this.read<unknown>('get_watchlist_items', { list_id: id }),
    ]);

    const meta = lists.find((l) => l.id === id);
    const symbols = watchlistSymbols(asArray(itemsRaw, 'items'));

    return {
      id,
      name: meta?.name ?? 'Watchlist',
      ...(meta?.emoji ? { emoji: meta.emoji } : {}),
      // The list's own count includes non-equity rows we filter out, so the
      // resolved symbol count is the honest one.
      symbolCount: symbols.length,
      editable: meta?.editable ?? false,
      symbols,
    };
  }

  private async fetchContractQuotes(
    ids: string[],
  ): Promise<Map<string, { quote: Record<string, unknown>; close?: Record<string, unknown> }>> {
    const byId = new Map<
      string,
      { quote: Record<string, unknown>; close?: Record<string, unknown> }
    >();

    for (const batch of chunk(ids, QUOTE_BATCH)) {
      const raw = await this.read<unknown>('get_option_quotes', { instrument_ids: batch });
      for (const entry of asArray(raw, 'results')) {
        const quote = nested(entry, 'quote');
        const id = str(quote, 'instrument_id');
        if (id) byId.set(id, { quote, close: nested(entry, 'close') });
      }
    }

    return byId;
  }

  /** Accounts Robinhood has flagged as agent-tradable — usually a strict subset. */
  async tradableAccountIds(): Promise<string[]> {
    return (await this.accounts())
      .filter(isAgenticAccount)
      .map((raw) => accountNumberOf(raw))
      .filter((id): id is string => Boolean(id));
  }

  /**
   * Simulate an order. Returns the estimated cost and Robinhood's pre-trade
   * alerts without placing anything.
   */
  async reviewOrder(request: OrderRequest): Promise<OrderReview> {
    const args = buildOrderArgs(request);
    assertTradable(request.accountId, await this.tradableAccountIds());
    return normalizeReview(
      await callToolJson<unknown>(this.client, 'review_equity_order', args),
    );
  }

  /**
   * Place a real order for real money.
   *
   * Deliberately does not review first — that would double the requests and
   * hide a decision the caller should be making explicitly. Callers that want
   * a pre-trade check call {@link reviewOrder} and act on the result.
   *
   * An idempotency key is always sent, generated when the caller didn't supply
   * one. Without it, a retry after a dropped response places a second order.
   */
  async placeOrder(request: OrderRequest): Promise<OrderReceipt> {
    // Build first: a malformed request should fail on its own terms rather
    // than after a round trip that only exists to check permissions.
    const args = buildOrderArgs({
      ...request,
      clientOrderId: request.clientOrderId ?? randomUUID(),
    });
    assertTradable(request.accountId, await this.tradableAccountIds());

    const receipt = normalizeReceipt(
      await callToolJson<unknown>(this.client, 'place_equity_order', args),
      request,
    );
    this.invalidateAfterTrade();
    return receipt;
  }

  async cancelOrder(accountId: string, orderId: string): Promise<void> {
    assertTradable(accountId, await this.tradableAccountIds());
    await callToolJson<unknown>(this.client, 'cancel_equity_order', {
      account_number: accountId,
      order_id: orderId,
    });
    this.invalidateAfterTrade();
  }

  private async accounts(): Promise<Record<string, unknown>[]> {
    return asArray(await this.read<unknown>('get_accounts'), 'accounts').filter(isUsableAccount);
  }

  private async loadAccount(raw: Record<string, unknown>): Promise<BrokerageAccount> {
    const accountNumber = accountNumberOf(raw) ?? '';

    const [portfolioRaw, equityRaw, optionRaw] = await Promise.all([
      this.read<unknown>('get_portfolio', { account_number: accountNumber }),
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
      const raw = await this.read<unknown>('get_equity_quotes', { symbols: batch });

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
      const raw = await this.read<unknown>('get_option_quotes', { instrument_ids: batch });

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
      const raw = await this.read<unknown>('get_option_instruments', { ids: batch.join(',') });

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
      const raw = await this.read<unknown>(tool, { ...args, ...(cursor ? { cursor } : {}) });

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

/**
 * Contract ids worth quoting: those whose strike is within `window` strikes of
 * spot, counted per side so a skewed ladder doesn't crowd out one direction.
 *
 * With no underlying price there is no "around the money", so everything is
 * quoted rather than an arbitrary slice being chosen.
 */
export function idsToQuote(
  instruments: Record<string, unknown>[],
  underlyingPrice: number | null,
  window: number,
): string[] {
  const idOf = (i: Record<string, unknown>) => str(i, 'id');

  if (underlyingPrice === null || window <= 0) {
    return instruments.map(idOf).filter((id): id is string => Boolean(id));
  }

  const strikes = [
    ...new Set(
      instruments
        .map((i) => num(i, 'strike_price'))
        .filter((s): s is number => s !== undefined),
    ),
  ].sort((a, b) => a - b);

  const below = strikes.filter((s) => s <= underlyingPrice).slice(-window);
  const above = strikes.filter((s) => s > underlyingPrice).slice(0, window);
  const keep = new Set([...below, ...above]);

  return instruments
    .filter((i) => {
      const strike = num(i, 'strike_price');
      return strike !== undefined && keep.has(strike);
    })
    .map(idOf)
    .filter((id): id is string => Boolean(id));
}

/** Today in ISO date form, for choosing the nearest un-expired expiration. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
