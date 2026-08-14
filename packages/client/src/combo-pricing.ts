/**
 * Pricing a multi-leg order against books that are often garbage.
 *
 * Three separate jobs, kept in one place because they all need the same view
 * of the book: what a combo is worth, whether the price you typed is sane, and
 * how to walk toward a fill.
 *
 * The governing fact is that WE CANNOT SEE THE COMBO BOOK. A vertical trades
 * on a complex-order book where market makers quote the spread as a single
 * instrument; the broker gives us the two leg books instead. So the price
 * derived by crossing both legs is a *bound* on something unobservable, not a
 * price anyone would trade at.
 *
 * Measured on RKLB 2026-10-02 82/77, a $5-wide put credit spread:
 *
 *     82P  bid 8.05 x178   ask 11.85 x173   mark 9.95   OI 0
 *     77P  bid 5.45 x226   ask  9.15 x194   mark 7.30   OI 0
 *
 *     natural  8.05 - 9.15 = -1.10   <- pay $1.10 to open a CREDIT spread
 *     mid      9.95 - 7.30 =  2.65
 *
 * The arithmetic is right and the conclusion "this costs $1.10" is wrong: no
 * market maker requires you to cross both books in full, and a combo order
 * would fill somewhere near the middle. Both legs there had zero open interest
 * — a freshly listed weekly quoted defensively wide — while showing 173-226
 * contracts of size on each side. The makers are present. They are just not
 * quoting a price they expect anyone to take.
 *
 * Everything below therefore treats `natural` as a floor and prices from the
 * mid, and flags a book whose width makes the natural meaningless.
 */

import type { OrderSide } from './broker/types.js';
import { roundToTick } from './order-pricing.js';

/** One leg's book. Sizes are contracts resting at the touch. */
export interface LegQuote {
  bid: number | null;
  ask: number | null;
  bidSize?: number | null;
  askSize?: number | null;
  /** The broker's own fair-value estimate, when it publishes one. */
  mark?: number | null;
}

export interface ComboLeg {
  quote: LegQuote;
  side: OrderSide;
  /** Contracts of this leg per unit of the order. Standard verticals are 1. */
  ratio?: number;
}

/**
 * Sign convention, applied everywhere: **positive is a credit you receive,
 * negative is a debit you pay.**
 *
 * Chosen once and stated here because a sign error in this file is a real
 * order at an inverted price.
 */
export interface ComboPrices {
  /** Cross every book in the expensive direction. The worst case, and a bound. */
  natural: number | null;
  /** Midpoint of every leg. The reference price everything else is measured against. */
  mid: number | null;
  /** Cross every book in your favour. Unobtainable; useful only as the other bound. */
  best: number | null;
  /** CREDIT when the mid is positive. Decides which way the walk runs. */
  intent: 'CREDIT' | 'DEBIT' | null;
}

export interface BookQuality {
  /** Widest leg spread as a percent of that leg's mid. */
  worstSpreadPercent: number | null;
  /**
   * Contracts you could trade before exhausting the touch on the binding leg.
   *
   * The minimum across legs, divided by each leg's ratio — a spread is only as
   * deep as its thinnest side. RKLB 80P quoted a one-contract bid, so "sell ten
   * at the bid" clears one and fills the rest lower.
   */
  tradableSize: number | null;
  /** No leg has both sides quoted. Nothing here can be priced. */
  oneSided: boolean;
  /**
   * The natural is a credit spread you would pay to open, or a debit you would
   * be paid to open. Not an arbitrage — it is the cost of crossing two books —
   * but proof the quotes are too wide to execute against directly.
   */
  naturalIsPerverse: boolean;
}

const EPSILON = 1e-9;

function finite(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function legMid(q: LegQuote): number | null {
  const bid = finite(q.bid);
  const ask = finite(q.ask);
  if (bid !== null && ask !== null) return (bid + ask) / 2;
  // Fall back to the broker's mark only when the book is one-sided. It is an
  // estimate, not a quote, so it must never override a real two-sided market.
  return finite(q.mark);
}

/**
 * What the combo is worth, from the leg books.
 *
 * Returns nulls rather than guesses when a leg has no book. An order ticket
 * showing a made-up price is worse than one showing none.
 */
export function comboPrices(legs: ComboLeg[]): ComboPrices {
  if (legs.length === 0) return { natural: null, mid: null, best: null, intent: null };

  let natural = 0;
  let mid = 0;
  let best = 0;
  let naturalOk = true;
  let midOk = true;

  for (const leg of legs) {
    const ratio = leg.ratio ?? 1;
    const bid = finite(leg.quote.bid);
    const ask = finite(leg.quote.ask);
    const m = legMid(leg.quote);

    if (m === null) midOk = false;
    else mid += (leg.side === 'SELL' ? m : -m) * ratio;

    // Selling receives the bid and is paid the ask at best; buying is the
    // mirror. A missing side on either makes the bound unknowable.
    if (leg.side === 'SELL') {
      if (bid === null || ask === null) naturalOk = false;
      else {
        natural += bid * ratio;
        best += ask * ratio;
      }
    } else {
      if (bid === null || ask === null) naturalOk = false;
      else {
        natural -= ask * ratio;
        best -= bid * ratio;
      }
    }
  }

  const midValue = midOk ? round2(mid) : null;

  return {
    natural: naturalOk ? round2(natural) : null,
    mid: midValue,
    best: naturalOk ? round2(best) : null,
    intent: midValue === null ? null : midValue >= 0 ? 'CREDIT' : 'DEBIT',
  };
}

/** How tradeable the book is, separate from what it says the price is. */
export function bookQuality(legs: ComboLeg[]): BookQuality {
  let worstSpreadPercent: number | null = null;
  let tradableSize: number | null = null;
  let oneSided = false;

  for (const leg of legs) {
    const ratio = leg.ratio ?? 1;
    const bid = finite(leg.quote.bid);
    const ask = finite(leg.quote.ask);

    if (bid === null || ask === null) {
      oneSided = true;
    } else {
      const m = (bid + ask) / 2;
      if (m > 0) {
        const pct = ((ask - bid) / m) * 100;
        if (worstSpreadPercent === null || pct > worstSpreadPercent) {
          worstSpreadPercent = round2(pct);
        }
      }
    }

    // The side that matters is the one you hit: a seller consumes the bid.
    const size = finite(leg.side === 'SELL' ? leg.quote.bidSize : leg.quote.askSize);
    if (size !== null && ratio > 0) {
      const units = Math.floor(size / ratio);
      if (tradableSize === null || units < tradableSize) tradableSize = units;
    }
  }

  const { natural, intent } = comboPrices(legs);
  const naturalIsPerverse =
    natural !== null &&
    intent !== null &&
    ((intent === 'CREDIT' && natural < -EPSILON) || (intent === 'DEBIT' && natural > EPSILON));

  return { worstSpreadPercent, tradableSize, oneSided, naturalIsPerverse };
}

// --- Fat-finger guard ------------------------------------------------------

export type PriceVerdict = 'ok' | 'caution' | 'blocked';

export interface PriceCheck {
  verdict: PriceVerdict;
  /** How far from the mid, as a percent, in the direction that costs you money. */
  deviationPercent: number | null;
  /** What that deviation is worth per contract, at a 100 multiplier. */
  costPerContract: number | null;
  /** Plain sentences, safe to render directly. */
  reasons: string[];
}

/**
 * Concessions beyond this are worth a second look. Wide books make a 15%
 * concession ordinary, so this warns rather than blocks.
 */
export const CAUTION_DEVIATION_PERCENT = 15;

/**
 * Beyond this, treat it as a typo until told otherwise.
 *
 * Set from the incident that motivated this: 0.70 typed against a 2.65 mid is
 * a 74% concession. A threshold of 35% catches that with room to spare while
 * still permitting a genuinely desperate exit.
 */
export const BLOCK_DEVIATION_PERCENT = 35;

/**
 * Is this limit price sane for this book?
 *
 * Measured against the MID, never the natural. The natural on a wide book is
 * an artefact — pricing the guard off it would wave through exactly the orders
 * this exists to stop.
 *
 * `width` is the vertical's strike distance, when known. A credit above the
 * width is impossible to collect and is almost always a decimal slip.
 */
export function checkLimitPrice(input: {
  limit: number;
  prices: ComboPrices;
  width?: number | null;
  multiplier?: number;
}): PriceCheck {
  const { limit, prices } = input;
  const multiplier = input.multiplier ?? 100;
  const reasons: string[] = [];
  let verdict: PriceVerdict = 'ok';

  const mid = prices.mid;
  if (mid === null || Math.abs(mid) < EPSILON) {
    return {
      verdict: 'caution',
      deviationPercent: null,
      costPerContract: null,
      reasons: ['No midpoint available — the book is one-sided, so this price cannot be checked.'],
    };
  }

  const intent = prices.intent;

  /*
   * A limit price is ALWAYS a positive magnitude; the order's direction says
   * whether it is paid or received. The broker's own contract is explicit
   * about this, and our mid is signed, so the two have to be reconciled before
   * they can be compared.
   *
   * Comparing the raw signed mid against the magnitude was a real bug: on a
   * debit with a mid of -3.00, offering to pay 2.00 computed a concession of
   * 2 - (-3) = 5 and blocked a price that is BETTER than the midpoint.
   */
  const midMagnitude = Math.abs(mid);

  /*
   * Which direction costs you money depends on the order. On a credit you are
   * collecting, so a LOWER limit concedes. On a debit you are paying, so a
   * HIGHER limit concedes. Backwards, this flags every good price and passes
   * every bad one.
   */
  const concession = intent === 'CREDIT' ? midMagnitude - limit : limit - midMagnitude;
  const deviationPercent = round2((concession / midMagnitude) * 100);
  const costPerContract = round2(Math.abs(concession) * multiplier);

  if (deviationPercent >= BLOCK_DEVIATION_PERCENT) {
    verdict = 'blocked';
    reasons.push(
      intent === 'CREDIT'
        ? `You are offering to sell at ${limit.toFixed(2)} against a midpoint of ${mid.toFixed(2)} — ${deviationPercent.toFixed(0)}% below, giving up about $${costPerContract.toFixed(0)} per contract.`
        : `You are offering to pay ${limit.toFixed(2)} against a midpoint of ${midMagnitude.toFixed(2)} — ${deviationPercent.toFixed(0)}% above, about $${costPerContract.toFixed(0)} per contract more than it is worth.`,
    );
  } else if (deviationPercent >= CAUTION_DEVIATION_PERCENT) {
    verdict = 'caution';
    reasons.push(
      `This concedes ${deviationPercent.toFixed(0)}% against the midpoint — about $${costPerContract.toFixed(0)} per contract.`,
    );
  }

  // A price better than anyone is quoting will simply never fill. Not
  // dangerous, but silently sitting unfilled is its own kind of failure.
  if (prices.best !== null && intent === 'CREDIT' && limit > prices.best + EPSILON) {
    if (verdict === 'ok') verdict = 'caution';
    reasons.push(
      `No one is quoting ${limit.toFixed(2)} — the best price on the book is ${prices.best.toFixed(2)}, so this will rest unfilled.`,
    );
  }

  const width = finite(input.width ?? null);
  if (width !== null && width > 0 && intent === 'CREDIT' && limit > width + EPSILON) {
    verdict = 'blocked';
    reasons.push(
      `A ${width.toFixed(2)}-wide spread cannot pay more than ${width.toFixed(2)} — check for a misplaced decimal.`,
    );
  }

  if (limit < 0) {
    verdict = 'blocked';
    reasons.push('A limit price cannot be negative. Use the order direction to say credit or debit.');
  }

  return { verdict, deviationPercent, costPerContract, reasons };
}

// --- The price walk --------------------------------------------------------

export interface WalkConfig {
  /**
   * Where to open, as a percent BEYOND the mid in your favour. 20 on a credit
   * asks 20% more than the midpoint.
   */
  startPercent: number;
  /**
   * How far past the mid you will concede before giving up, as a percent. 15 on
   * a credit accepts down to 15% below the midpoint.
   */
  floorPercent: number;
  /** Number of price steps from start to floor, inclusive of both. */
  steps: number;
  /** Seconds to rest at each rung before conceding. */
  intervalSeconds: number;
}

export const DEFAULT_WALK: WalkConfig = {
  // Opens above the mid because a wide book often meets you there, and costs
  // only time to find out.
  startPercent: 20,
  floorPercent: 15,
  steps: 8,
  intervalSeconds: 30,
};

export interface WalkPlan {
  /** Prices in the order they should be worked, greediest first. */
  rungs: number[];
  start: number;
  floor: number;
  intent: 'CREDIT' | 'DEBIT';
  intervalSeconds: number;
}

/**
 * The ladder of prices to work, from greedy to resigned.
 *
 * Anchored to the MID and expressed as percentages of it, deliberately, rather
 * than to the broker's own high/low fill-rate bands. Those bands are
 * conservative — measured on RKLB they sat 25% and 74% of the way across the
 * bid/ask, so the "likely to fill" end already concedes a quarter of the spread
 * before any negotiation. Anchoring to them would donate that quarter on every
 * order.
 *
 * Every rung is rounded to a tick the venue will accept, then de-duplicated:
 * on a narrow spread several steps can round to the same price, and re-sending
 * an identical limit is a cancel/replace that buys nothing and loses queue
 * position.
 */
export function walkPlan(input: {
  mid: number;
  config?: Partial<WalkConfig>;
  kind?: 'EQUITY' | 'OPTION';
}): WalkPlan | null {
  const config = { ...DEFAULT_WALK, ...input.config };
  const kind = input.kind ?? 'OPTION';
  const mid = input.mid;

  if (!Number.isFinite(mid) || Math.abs(mid) < EPSILON) return null;
  if (config.steps < 1) return null;

  const intent: 'CREDIT' | 'DEBIT' = mid >= 0 ? 'CREDIT' : 'DEBIT';
  const magnitude = Math.abs(mid);

  // Greedy end and concession end, in magnitude. The sign is reapplied after,
  // so a debit walks the same shape in the opposite direction.
  const startMag = magnitude * (1 + config.startPercent / 100);
  const floorMag = magnitude * (1 - config.floorPercent / 100);

  const rungs: number[] = [];
  const span = config.steps === 1 ? 0 : (startMag - floorMag) / (config.steps - 1);

  for (let i = 0; i < config.steps; i += 1) {
    const raw = startMag - span * i;
    // Never cross zero: a credit order must not turn into a debit because the
    // floor percentage was set above 100.
    const clamped = Math.max(raw, 0);
    const price = round2(roundToTick(clamped, kind));
    if (rungs.length === 0 || Math.abs(rungs[rungs.length - 1] - price) > EPSILON) {
      rungs.push(price);
    }
  }

  return {
    rungs,
    start: rungs[0],
    floor: rungs[rungs.length - 1],
    intent,
    intervalSeconds: config.intervalSeconds,
  };
}

/**
 * The next rung after this one, or null when the floor has been reached.
 *
 * Explicit rather than an index so the caller cannot walk past the floor by
 * incrementing carelessly — the terminal condition is this function returning
 * null, and there is no other way to advance.
 */
export function nextRung(plan: WalkPlan, current: number): number | null {
  const i = plan.rungs.findIndex((r) => Math.abs(r - current) < EPSILON);
  if (i === -1 || i >= plan.rungs.length - 1) return null;
  return plan.rungs[i + 1];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
