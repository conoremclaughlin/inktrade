/**
 * The analytics chain — strikes across several expirations at once, priced by
 * our own model rather than read off a broker.
 *
 * A different animal from the broker chain in ./broker/types.ts, and
 * deliberately not merged with it: the broker chain is what you can trade and
 * carries contract ids and a live book, while this one is what you can reason
 * about and carries Greeks we computed. A single type would have to make every
 * field on both sides optional, which is how you end up with a UI that can't
 * tell "the broker didn't say" from "we didn't model it".
 *
 * These shapes are declared here rather than imported from @inktrade/engine.
 * The arrow between those packages already points engine → client (the
 * Robinhood services import the broker wire types from here), so importing
 * back would close a cycle. Wire types are this package's job; the engine
 * consumes them.
 */

export type OptionSide = 'call' | 'put';

/** Greeks as they arrive over the wire. All zero means "unknown", not "zero". */
export interface WireOptionGreeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  impliedVolatility: number;
}

/**
 * A modelled contract as it arrives over the wire.
 *
 * Structurally the engine's OptionContract except that `expiration` is an ISO
 * string, because JSON has no Date. Naming that difference in the type is the
 * point — the web calculator previously typed these responses as the engine
 * shape outright, which happened to work only because every reader passed the
 * value straight to `new Date()`.
 */
export interface WireOptionContract {
  symbol: string;
  underlying: string;
  type: OptionSide;
  strike: number;
  /** ISO timestamp. */
  expiration: string;
  bid: number;
  ask: number;
  last: number;
  /** Mid when there's a book, last when there isn't. */
  mark: number;
  volume: number;
  openInterest: number;
  greeks: WireOptionGreeks;
  inTheMoney: boolean;
  daysToExpiration: number;
}

export interface ChainGridResponse {
  underlying: string;
  underlyingPrice: number;
  /** Every expiration the underlying has, ascending. */
  allExpirations: string[];
  /** The window actually fetched — a slice of allExpirations. */
  expirations: string[];
  calls: WireOptionContract[];
  puts: WireOptionContract[];
}

export interface ChainGridQuery {
  type?: OptionSide;
  /** Index into allExpirations — how far out the visible window starts. */
  offset?: number;
  limit?: number;
}

/** The ISO day a contract expires, as the grid keys it. */
export function expiryKey(expiration: string | Date): string {
  return new Date(expiration).toISOString().slice(0, 10);
}

/**
 * Contracts for one expiration, ascending by strike.
 *
 * A phone shows one expiration at a time rather than the whole grid, so this
 * is the mobile equivalent of picking a column out of the heatmap.
 */
export function contractsForExpiry(
  contracts: WireOptionContract[],
  expiry: string,
): WireOptionContract[] {
  return contracts
    .filter((c) => expiryKey(c.expiration) === expiry)
    .sort((a, b) => a.strike - b.strike);
}

/** The listed strike nearest the underlying — where the ladder should open. */
export function atmIndex(contracts: WireOptionContract[], underlyingPrice: number): number {
  if (contracts.length === 0) return 0;

  let best = 0;
  for (let i = 1; i < contracts.length; i += 1) {
    if (
      Math.abs(contracts[i].strike - underlyingPrice) <
      Math.abs(contracts[best].strike - underlyingPrice)
    ) {
      best = i;
    }
  }
  return best;
}

/**
 * A default price target: a move of `percent` in the direction the contract
 * profits from.
 *
 * Signing it by option type rather than asking the user which way they mean is
 * the small thing that stops a put's target defaulting upward, where every
 * number on the screen would then read as a loss.
 */
export function defaultTarget(
  underlyingPrice: number,
  type: OptionSide,
  percent = 10,
): number {
  const signed = type === 'put' ? -percent : percent;
  return Math.round(underlyingPrice * (1 + signed / 100) * 100) / 100;
}

/**
 * Is the modelled data on this contract usable?
 *
 * All-zero Greeks are the provider's way of saying it couldn't value the
 * contract — no price, or a price below intrinsic. Every downstream number
 * (leverage, probability, the Greeks themselves) is meaningless there, and
 * showing 0.000 instead of nothing is how a gap becomes a claim.
 */
export function isModelled(contract: WireOptionContract): boolean {
  return contract.greeks.impliedVolatility > 0;
}
