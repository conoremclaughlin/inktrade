/**
 * The three prices an order ticket offers: bid, mid, ask.
 *
 * The convention thinkorswim and Schwab use, and it's the right one — because
 * the alternative is a single "price" field prefilled with something, and
 * whatever that something is will be wrong half the time. Prefill the bid and a
 * buy silently never fills. Prefill the ask and every buy pays the whole spread.
 * Showing all three, with the spread visible, makes it a decision instead of a
 * default.
 */

import type { OrderSide } from './broker/types.js';

export type PriceLevel = 'BID' | 'MID' | 'ASK';

export interface OrderPrices {
  bid: number | null;
  mid: number | null;
  ask: number | null;
  /**
   * The level that fills immediately for this side — ask to buy, bid to sell.
   *
   * A marketable limit is also the only way to get an immediate fill outside
   * regular hours, where market orders don't execute at all.
   */
  marketable: PriceLevel;
  /** Absolute spread, and as a percent of the mid. Null when a side is missing. */
  spread: number | null;
  spreadPercent: number | null;
}

/**
 * Minimum price increment.
 *
 * Equities quote in pennies. Options quote in pennies below $3.00 and nickels
 * at $3.00 and above, per the penny pilot — so a raw midpoint of $3.075 is not
 * a price you can send, and submitting it is a rejected order rather than a
 * rounding annoyance.
 */
export function tickSize(price: number, kind: 'EQUITY' | 'OPTION'): number {
  if (kind === 'EQUITY') return 0.01;
  return price < 3 ? 0.01 : 0.05;
}

/** Round to a tick the venue will accept. */
export function roundToTick(price: number, kind: 'EQUITY' | 'OPTION'): number {
  const tick = tickSize(price, kind);
  return Math.round(price / tick) * tick;
}

export function orderPrices(input: {
  bid: number | null | undefined;
  ask: number | null | undefined;
  side: OrderSide;
  kind?: 'EQUITY' | 'OPTION';
}): OrderPrices {
  const kind = input.kind ?? 'EQUITY';
  const bid = finite(input.bid);
  const ask = finite(input.ask);
  const marketable: PriceLevel = input.side === 'BUY' ? 'ASK' : 'BID';

  if (bid === null || ask === null) {
    // A one-sided book gives no midpoint. Inventing one from the side that does
    // exist would be a made-up price on an order ticket.
    return { bid, ask, mid: null, marketable, spread: null, spreadPercent: null };
  }

  const rawMid = (bid + ask) / 2;
  const mid = round(roundToTick(rawMid, kind));
  const spread = round(ask - bid);

  return {
    bid,
    ask,
    mid,
    marketable,
    spread,
    // Against the mid, not the last trade: a spread is a property of the book.
    spreadPercent: rawMid > 0 ? round((spread / rawMid) * 100) : null,
  };
}

/** The price for a level, or null when it isn't available. */
export function priceAt(prices: OrderPrices, level: PriceLevel): number | null {
  return level === 'BID' ? prices.bid : level === 'ASK' ? prices.ask : prices.mid;
}

function finite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function round(value: number): number {
  // Float noise from the tick division would otherwise surface as 3.0500000004
  // in a price field.
  return Math.round(value * 1e6) / 1e6;
}
