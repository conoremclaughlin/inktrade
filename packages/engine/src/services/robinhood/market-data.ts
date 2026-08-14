/**
 * Market data normalization for Robinhood — quotes, option chains, watchlists.
 *
 * Shapes captured from live responses. Two are worth knowing before reading:
 *
 *   - `get_option_chains` returns *expiration dates and a chain id*, not
 *     contracts. Contracts come from `get_option_instruments`, and their
 *     prices and greeks from `get_option_quotes`. A chain is therefore a
 *     three-call join, not a fetch.
 *   - Watchlist items carry a symbol and an `object_type`. Only
 *     `instrument` rows are equities; the rest are crypto pairs, futures and
 *     indexes that would otherwise be presented as tickers that don't quote.
 */

import type { OptionContract, BrokerWatchlist } from '@inktrade/client/broker';
import type { Quote } from '@inktrade/client';
import { asRecord, nested, num, str } from './shapes.js';

/**
 * Robinhood reports two last-trade prices — regular session and extended
 * hours — and says to take whichever is more recent.
 */
export function pickLatestPrice(quote: Record<string, unknown>): number | undefined {
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

/**
 * A `results[]` entry — `{ quote, close }` — as an Inktrade Quote.
 *
 * Returns null rather than a zero-filled Quote when there's no usable price:
 * a $0.00 row with a 0% change reads as a real, flat instrument.
 */
export function normalizeQuote(entry: Record<string, unknown>): Quote | null {
  const quote = nested(entry, 'quote');
  const symbol = str(quote, 'symbol')?.toUpperCase();
  const price = pickLatestPrice(quote);

  // The official settled close is preferred; the quote's copy is the
  // documented fallback when a batch comes back without closes.
  const previousClose =
    num(nested(entry, 'close'), 'price') ??
    num(quote, 'adjusted_previous_close', 'previous_close');

  if (!symbol || price === undefined || previousClose === undefined) return null;

  const change = price - previousClose;

  return {
    symbol,
    price,
    change,
    changePercent: previousClose === 0 ? 0 : (change / previousClose) * 100,
    // Robinhood's quote payload carries no session OHLCV; those come from
    // get_equity_fundamentals. Zero is wrong but the field is required, so
    // callers needing them should ask for fundamentals explicitly.
    volume: 0,
    high: 0,
    low: 0,
    open: 0,
    previousClose,
    // Top of book, when the venue is quoting one. Omitted rather than zeroed:
    // an order ticket offering a $0.00 bid would be worse than offering none.
    ...spread(quote),
  };
}

function spread(quote: Record<string, unknown>): { bid?: number; ask?: number } {
  const bid = num(quote, 'bid_price');
  const ask = num(quote, 'ask_price');
  return {
    ...(bid !== undefined && bid > 0 ? { bid } : {}),
    ...(ask !== undefined && ask > 0 ? { ask } : {}),
  };
}

/** Merge an instrument definition with its quote into a priced contract. */
export function normalizeContract(
  instrument: Record<string, unknown>,
  quote: Record<string, unknown> | undefined,
  close: Record<string, unknown> | undefined,
): OptionContract | null {
  const id = str(instrument, 'id');
  const strike = num(instrument, 'strike_price');
  const expiration = str(instrument, 'expiration_date');
  const type = str(instrument, 'type')?.toUpperCase();

  if (!id || strike === undefined || !expiration || (type !== 'PUT' && type !== 'CALL')) {
    return null;
  }

  const q = quote ?? {};

  return {
    id,
    underlyingSymbol: str(instrument, 'chain_symbol')?.toUpperCase() ?? '',
    putCall: type,
    strike,
    expiration: expiration.slice(0, 10),
    multiplier: num(instrument, 'trade_value_multiplier') ?? 100,

    bid: num(q, 'bid_price') ?? null,
    ask: num(q, 'ask_price') ?? null,
    mark: num(q, 'adjusted_mark_price', 'mark_price') ?? null,
    previousClose: num(close ?? {}, 'price') ?? num(q, 'previous_close_price') ?? null,

    // Size was being dropped, which made every depth display render empty
    // against live data. Optional, because a zero size is meaningful and
    // absence is not the same thing.
    ...defined('bidSize', num(q, 'bid_size')),
    ...defined('askSize', num(q, 'ask_size')),

    // Straight from the market rather than computed from a spot price and an
    // IV guess. Left undefined when absent — a zero delta is a real value.
    ...defined('impliedVolatility', num(q, 'implied_volatility')),
    ...defined('delta', num(q, 'delta')),
    ...defined('gamma', num(q, 'gamma')),
    ...defined('theta', num(q, 'theta')),
    ...defined('vega', num(q, 'vega')),
    ...defined('rho', num(q, 'rho')),
    ...defined('openInterest', num(q, 'open_interest')),
    ...defined('volume', num(q, 'volume')),
    ...defined('breakEvenPrice', num(q, 'break_even_price')),
    ...defined('chanceOfProfitLong', num(q, 'chance_of_profit_long')),
    ...defined('chanceOfProfitShort', num(q, 'chance_of_profit_short')),
  };
}

function defined<K extends string>(key: K, value: number | undefined) {
  return value === undefined ? {} : ({ [key]: value } as Record<K, number>);
}

export function normalizeWatchlist(raw: Record<string, unknown>): BrokerWatchlist | null {
  const id = str(raw, 'id');
  const name = str(raw, 'display_name', 'name');
  if (!id || !name) return null;

  return {
    id,
    name,
    ...(str(raw, 'icon_emoji') ? { emoji: str(raw, 'icon_emoji') } : {}),
    symbolCount: num(raw, 'item_count') ?? 0,
    // Robinhood-curated lists can only be followed, not edited.
    editable: str(raw, 'owner_type') === 'custom',
  };
}

/**
 * Tickers from a watchlist's items.
 *
 * Only `instrument` rows are equities. Crypto pairs, futures and indexes share
 * the shape but would fail an equity quote lookup, so presenting them as
 * tickers would produce rows that never price.
 */
export function watchlistSymbols(items: Record<string, unknown>[]): string[] {
  return items
    .filter((item) => str(item, 'object_type') === 'instrument')
    .map((item) => str(item, 'symbol')?.toUpperCase())
    .filter((symbol): symbol is string => Boolean(symbol));
}

/**
 * The expiration to show when the caller didn't pick one.
 *
 * The nearest expiry that hasn't passed — which is what an option screen opens
 * on. Falls back to the last available rather than nothing, so a chain whose
 * expirations are all historical still renders.
 */
export function nearestExpiration(expirations: string[], today: string): string | undefined {
  if (expirations.length === 0) return undefined;
  const sorted = [...expirations].sort();
  return sorted.find((date) => date >= today) ?? sorted[sorted.length - 1];
}

/** Chain id for an underlying, from a get_option_chains payload. */
export function chainIdFor(payload: unknown, symbol: string): string | undefined {
  const chains = asRecord(payload).chains;
  if (!Array.isArray(chains)) return undefined;

  const wanted = symbol.toUpperCase();
  const matching = chains
    .map((c) => asRecord(c))
    .filter((c) => str(c, 'symbol')?.toUpperCase() === wanted);

  // An underlying can have several chains; the tradable one is the useful one.
  const tradable = matching.find((c) => c.can_open_position === true);
  return str(tradable ?? matching[0] ?? {}, 'id');
}

export function chainExpirations(payload: unknown, symbol: string): string[] {
  const chains = asRecord(payload).chains;
  if (!Array.isArray(chains)) return [];

  const wanted = symbol.toUpperCase();
  const dates = new Set<string>();

  for (const entry of chains) {
    const chain = asRecord(entry);
    if (str(chain, 'symbol')?.toUpperCase() !== wanted) continue;
    const list = chain.expiration_dates;
    if (Array.isArray(list)) for (const d of list) if (typeof d === 'string') dates.add(d);
  }

  return [...dates].sort();
}
