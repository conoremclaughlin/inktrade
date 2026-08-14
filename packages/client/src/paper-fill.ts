/**
 * Simulated fills, priced off the real book.
 *
 * The whole value of paper mode is that it teaches the same lessons the market
 * would. A simulator that fills everything at the midpoint instantly would
 * teach the opposite of the truth — it would make the price walk look free,
 * make a one-contract bid look like a market, and send someone into a live
 * order having learned nothing except confidence.
 *
 * So the rules here are deliberately unkind:
 *
 *   1. A limit only fills if it is marketable — at or through the touch.
 *   2. It fills at the TOUCH, not at your limit. Offering to sell for less
 *      than the bid does not mean you sold for less; it means you sold at the
 *      bid. This is also what makes the fat-finger case survivable in paper
 *      and expensive in reality, which is worth feeling.
 *   3. Size binds. The touch holds what it holds; the rest does not fill.
 *   4. A resting order does not fill until the market comes to it.
 *
 * Rule 2 has one important consequence: a fat-finger in paper costs less than
 * the same fat-finger live, because the venue would have filled the sell at
 * the bid too. The guard, not the simulator, is what makes that case safe.
 */

import type { ComboLeg, ComboPrices } from './combo-pricing.js';
import { comboPrices, bookQuality } from './combo-pricing.js';

export type FillStatus =
  /** Nothing filled; the order rests at its limit. */
  | 'WORKING'
  /** Some quantity filled; the remainder rests. */
  | 'PARTIAL'
  /** The whole order filled. */
  | 'FILLED'
  /** Cannot be simulated — no book to price against. */
  | 'UNPRICEABLE';

export interface PaperFill {
  status: FillStatus;
  /** Units of the strategy filled, never more than requested. */
  filledQuantity: number;
  /** Units still working. */
  remainingQuantity: number;
  /**
   * Net price per unit actually achieved, signed like ComboPrices — positive
   * is a credit received. Null when nothing filled.
   */
  fillPrice: number | null;
  /**
   * What the limit would have been worth had it filled at the limit itself.
   * Carried so a caller can show the difference between asking and getting.
   */
  limitPrice: number;
  /** Plain sentence explaining the outcome, safe to render. */
  explanation: string;
}

export interface PaperFillInput {
  legs: ComboLeg[];
  /** Always a positive magnitude; `intent` decides paid or received. */
  limit: number;
  quantity: number;
  /** Omit to derive from the book. Pass explicitly for an order already open. */
  intent?: 'CREDIT' | 'DEBIT';
}

const EPSILON = 1e-9;

/**
 * Would this order fill right now, and for how much?
 *
 * Evaluated as a snapshot against one book. A caller working an order over
 * time calls this repeatedly with fresh quotes; nothing here remembers
 * anything, which keeps it pure and makes the walk trivially testable.
 */
export function simulateFill(input: PaperFillInput): PaperFill {
  const { legs, limit, quantity } = input;
  const prices = comboPrices(legs);
  const quality = bookQuality(legs);

  if (quantity <= 0) {
    return unfillable(limit, 0, 'No quantity to fill.');
  }

  const intent = input.intent ?? prices.intent;

  if (prices.natural === null || intent === null) {
    return {
      status: 'UNPRICEABLE',
      filledQuantity: 0,
      remainingQuantity: quantity,
      fillPrice: null,
      limitPrice: limit,
      explanation:
        'No two-sided book on every leg, so a fill cannot be simulated. A real order would rest.',
    };
  }

  /*
   * The touch, as a magnitude: what you get right now by crossing.
   *
   * `natural` is already signed — positive for a credit received. A credit
   * order is marketable when the limit asks for no MORE than the touch pays;
   * a debit is marketable when the limit offers no LESS than the touch costs.
   */
  const touch = prices.natural;
  const touchMagnitude = Math.abs(touch);

  const marketable =
    intent === 'CREDIT'
      ? touch > 0 && limit <= touch + EPSILON
      : touch < 0 && limit >= touchMagnitude - EPSILON;

  if (!marketable) {
    return {
      status: 'WORKING',
      filledQuantity: 0,
      remainingQuantity: quantity,
      fillPrice: null,
      limitPrice: limit,
      explanation:
        intent === 'CREDIT'
          ? `Resting. The book pays ${formatSigned(touch)} to cross right now, and this asks ${limit.toFixed(2)} — it fills only if the market comes to it.`
          : `Resting. Crossing costs ${touchMagnitude.toFixed(2)} right now, and this offers ${limit.toFixed(2)} — it fills only if the market comes to it.`,
    };
  }

  /*
   * Marketable, so it fills at the TOUCH rather than at the limit. Offering to
   * sell below the bid does not sell below the bid.
   */
  const fillPrice = intent === 'CREDIT' ? touchMagnitude : -touchMagnitude;

  // Size binds. An unknown size is treated as sufficient rather than as zero:
  // a broker that omits size should not silently make everything unfillable.
  const available = quality.tradableSize;
  const filled = available === null ? quantity : Math.min(quantity, Math.max(available, 0));

  if (filled <= 0) {
    return {
      status: 'WORKING',
      filledQuantity: 0,
      remainingQuantity: quantity,
      fillPrice: null,
      limitPrice: limit,
      explanation: 'Marketable, but there is no size at the touch to trade against.',
    };
  }

  const improvement = intent === 'CREDIT' ? touchMagnitude - limit : limit - touchMagnitude;
  const improvementNote =
    improvement > EPSILON
      ? ` Filled at the touch (${touchMagnitude.toFixed(2)}) rather than the limit, ${improvement.toFixed(2)} better per unit.`
      : '';

  if (filled < quantity) {
    return {
      status: 'PARTIAL',
      filledQuantity: filled,
      remainingQuantity: quantity - filled,
      fillPrice: round2(fillPrice),
      limitPrice: limit,
      explanation:
        `Only ${filled} of ${quantity} filled — the touch held ${filled}, and the rest rests.` +
        improvementNote,
    };
  }

  return {
    status: 'FILLED',
    filledQuantity: filled,
    remainingQuantity: 0,
    fillPrice: round2(fillPrice),
    limitPrice: limit,
    explanation: `Filled ${filled} at ${touchMagnitude.toFixed(2)}.` + improvementNote,
  };
}

function unfillable(limit: number, quantity: number, explanation: string): PaperFill {
  return {
    status: 'WORKING',
    filledQuantity: 0,
    remainingQuantity: quantity,
    fillPrice: null,
    limitPrice: limit,
    explanation,
  };
}

function formatSigned(n: number): string {
  return n >= 0 ? n.toFixed(2) : `-${Math.abs(n).toFixed(2)}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// --- Paper positions -------------------------------------------------------

export interface PaperPosition {
  id: string;
  symbol: string;
  /** Human label for the strategy, e.g. "RKLB 82/77P 10/2". */
  label: string;
  quantity: number;
  /** Average net price per unit, signed: positive was a credit received. */
  averagePrice: number;
  openedAt: string;
}

/**
 * Fold a fill into a position book.
 *
 * Returns a NEW array — paper positions are stored separately from broker
 * positions and must never be merged into them. A blended view is how someone
 * eventually places a real order believing it was paper.
 */
export function applyFill(
  positions: PaperPosition[],
  fill: PaperFill,
  meta: { id: string; symbol: string; label: string; at: string },
): PaperPosition[] {
  if (fill.filledQuantity <= 0 || fill.fillPrice === null) return positions;

  const existing = positions.find((p) => p.id === meta.id);
  if (!existing) {
    return [
      ...positions,
      {
        id: meta.id,
        symbol: meta.symbol,
        label: meta.label,
        quantity: fill.filledQuantity,
        averagePrice: fill.fillPrice,
        openedAt: meta.at,
      },
    ];
  }

  // Weighted average across adds, so a walk that fills in pieces at conceding
  // prices reports what it actually averaged rather than the last rung.
  const total = existing.quantity + fill.filledQuantity;
  const averagePrice =
    (existing.averagePrice * existing.quantity + fill.fillPrice * fill.filledQuantity) / total;

  return positions.map((p) =>
    p.id === meta.id ? { ...p, quantity: total, averagePrice: round2(averagePrice) } : p,
  );
}

/** Mark-to-market against a current price, signed the same way. */
export function paperPnl(position: PaperPosition, currentPrice: number, multiplier = 100): number {
  // A credit position profits as the spread gets cheaper to close.
  return round2((position.averagePrice - currentPrice) * position.quantity * multiplier);
}

export type { ComboPrices };
