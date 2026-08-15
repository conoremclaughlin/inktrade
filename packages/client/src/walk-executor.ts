/**
 * Working an order down the price ladder, one rung at a time.
 *
 * Written as a pure state machine rather than a timer loop, for two reasons.
 * A machine that takes `now` as an argument can be tested exhaustively without
 * waiting for wall-clock seconds. And a machine that returns its next state,
 * rather than mutating and firing callbacks, cannot half-advance — every
 * transition is one value that either happened or did not.
 *
 * The safety properties, stated once and enforced by the transitions below:
 *
 *   - It NEVER prices past the floor. Running out of rungs ends the walk.
 *   - A cancel is honoured immediately, from any state, and is terminal.
 *   - A terminal state never advances again, however many times it is called.
 *   - It only re-prices when the interval has actually elapsed, so a caller
 *     polling every second cannot accidentally sprint down the ladder.
 *
 * The caller supplies fills. In paper mode that is `simulateFill`; live it is
 * the broker's order status. This file does not know the difference, which is
 * what lets the walk be developed and proven entirely on paper.
 */

import type { WalkPlan } from './combo-pricing.js';
import type { PaperFill } from './paper-fill.js';

export type WalkStatus =
  /** Resting or partially filled at a rung, still working. */
  | 'WORKING'
  /** The full quantity filled. */
  | 'FILLED'
  /** Reached the floor without filling the remainder. */
  | 'EXHAUSTED'
  /** Stopped by the user. */
  | 'CANCELLED';

export interface WalkEvent {
  at: number;
  kind: 'PLACED' | 'REPRICED' | 'FILL' | 'EXHAUSTED' | 'CANCELLED';
  price: number;
  /** Units filled by this event, when it was a fill. */
  quantity?: number;
  note: string;
}

export interface WalkState {
  plan: WalkPlan;
  status: WalkStatus;
  /** The limit currently resting at the venue. */
  currentPrice: number;
  quantity: number;
  filledQuantity: number;
  /** Weighted average of everything filled so far, or null if nothing has. */
  averagePrice: number | null;
  /** When the current rung was placed, epoch seconds. */
  rungStartedAt: number;
  history: WalkEvent[];
}

export function startWalk(input: { plan: WalkPlan; quantity: number; now: number }): WalkState {
  const { plan, quantity, now } = input;
  return {
    plan,
    status: 'WORKING',
    currentPrice: plan.start,
    quantity,
    filledQuantity: 0,
    averagePrice: null,
    rungStartedAt: now,
    history: [
      {
        at: now,
        kind: 'PLACED',
        price: plan.start,
        note: `Working ${quantity} at ${plan.start.toFixed(2)}, conceding toward ${plan.floor.toFixed(2)}.`,
      },
    ],
  };
}

export function isTerminal(state: WalkState): boolean {
  return state.status !== 'WORKING';
}

/**
 * Stop the walk. Honoured from any state, and never reversible.
 *
 * Separate from `advance` so a cancel cannot be delayed behind an interval or
 * lost to a race with a reprice — the user pressing stop is the one input that
 * must always take effect on the spot.
 */
export function cancelWalk(state: WalkState, now: number): WalkState {
  if (isTerminal(state)) return state;
  return {
    ...state,
    status: 'CANCELLED',
    history: [
      ...state.history,
      {
        at: now,
        kind: 'CANCELLED',
        price: state.currentPrice,
        note: `Stopped at ${state.currentPrice.toFixed(2)} with ${state.quantity - state.filledQuantity} unfilled.`,
      },
    ],
  };
}

export interface AdvanceInput {
  /** The outcome of the resting order as of `now`. */
  fill: PaperFill;
  now: number;
}

/**
 * Apply a fill result and, if the rung has had its time, concede one step.
 *
 * Returns the state unchanged when nothing has happened yet — a caller may
 * poll as often as it likes without disturbing the walk.
 */
export function advanceWalk(state: WalkState, input: AdvanceInput): WalkState {
  if (isTerminal(state)) return state;

  const { fill, now } = input;
  let next = state;

  if (fill.filledQuantity > 0 && fill.fillPrice !== null) {
    const filledQuantity = state.filledQuantity + fill.filledQuantity;
    // Weighted across rungs: a walk that fills in pieces at conceding prices
    // must report what it averaged, not the price of the last piece.
    const averagePrice =
      state.averagePrice === null
        ? fill.fillPrice
        : (state.averagePrice * state.filledQuantity + fill.fillPrice * fill.filledQuantity) /
          filledQuantity;

    next = {
      ...next,
      filledQuantity,
      averagePrice: round2(averagePrice),
      history: [
        ...next.history,
        {
          at: now,
          kind: 'FILL',
          price: fill.fillPrice,
          quantity: fill.filledQuantity,
          note: fill.explanation,
        },
      ],
    };

    if (filledQuantity >= state.quantity) {
      return { ...next, status: 'FILLED' };
    }
  }

  // Not yet time to concede. Rest.
  if (now - next.rungStartedAt < next.plan.intervalSeconds) return next;

  const index = next.plan.rungs.findIndex((r) => Math.abs(r - next.currentPrice) < 1e-9);
  const following = index === -1 ? undefined : next.plan.rungs[index + 1];

  if (following === undefined) {
    /*
     * The floor, reached. The order is NOT cancelled here — it rests at the
     * floor, which is the price the user said they would accept. Pulling it
     * would be a decision they did not make.
     */
    return {
      ...next,
      status: 'EXHAUSTED',
      history: [
        ...next.history,
        {
          at: now,
          kind: 'EXHAUSTED',
          price: next.currentPrice,
          note: `Reached the floor at ${next.currentPrice.toFixed(2)} with ${next.quantity - next.filledQuantity} unfilled. The order rests there.`,
        },
      ],
    };
  }

  return {
    ...next,
    currentPrice: following,
    rungStartedAt: now,
    history: [
      ...next.history,
      {
        at: now,
        kind: 'REPRICED',
        price: following,
        note: `Conceding to ${following.toFixed(2)}.`,
      },
    ],
  };
}

/** How far through the ladder, for a progress indicator. */
export function walkProgress(state: WalkState): { rung: number; of: number } {
  const index = state.plan.rungs.findIndex((r) => Math.abs(r - state.currentPrice) < 1e-9);
  return { rung: index === -1 ? 0 : index + 1, of: state.plan.rungs.length };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
