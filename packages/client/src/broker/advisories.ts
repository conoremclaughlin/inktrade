/**
 * Broker-specific warnings that a generic contract can't express.
 *
 * Most of Inktrade normalizes brokerages into one shape deliberately. This file
 * is the exception, and it exists because some of the most expensive facts about
 * a brokerage are operational rather than structural — not "what fields does the
 * API return" but "what will happen to you, and what can you still do about it".
 *
 * The one that prompted this: Robinhood has no account-level cost basis setting,
 * and `exercise_option` accepts no lot selection. So an exercise or an assignment
 * allocates FIFO, and the *only* remedy is to call Robinhood support **the same
 * day** and ask them to change it. Miss the day and the allocation is final.
 *
 * That is not a footnote. It is a deadline, and a warning that arrives the next
 * morning is worth nothing.
 */

import type { OptionDetail, OrderSide, Position } from './types.js';

export type BrokerId = 'robinhood' | 'schwab' | 'mock';

export type AdvisoryTone =
  /** Something is about to go wrong and there is still time to act. */
  | 'critical'
  /** Worth knowing before continuing. */
  | 'warning'
  /** Context, no action needed. */
  | 'info';

export interface Advisory {
  id: string;
  tone: AdvisoryTone;
  title: string;
  body: string;
  /** What to actually do, when there's something to do. */
  action?: string;
  /** True when acting has a same-day deadline. */
  timeCritical?: boolean;
}

/** Normalize a provider name to an id. Providers report display names. */
export function brokerIdOf(providerName: string | undefined): BrokerId {
  const name = providerName?.toLowerCase() ?? '';
  if (name.includes('robinhood')) return 'robinhood';
  if (name.includes('schwab') || name.includes('thinkorswim')) return 'schwab';
  return 'mock';
}

/**
 * Does this event dispose of shares?
 *
 * Only disposals have a cost-basis consequence, and half of these events don't
 * dispose of anything:
 *
 *   - exercising a long CALL, or being assigned on a short PUT, *acquires*
 *     shares — a new lot appears, nothing is sold, nothing is realized.
 *   - exercising a long PUT, or being assigned on a short CALL, *sells* shares
 *     at the strike, and that sale is allocated FIFO.
 *
 * Warning on all four would train people to ignore the warning by the time it
 * matters.
 */
export function disposesShares(input: {
  putCall: OptionDetail['putCall'];
  /** BUY = long position, SELL = short position. */
  side: OrderSide;
}): boolean {
  return input.side === 'BUY' ? input.putCall === 'PUT' : input.putCall === 'CALL';
}

/**
 * The warning shown before exercising, or after an assignment is detected.
 *
 * Returns null when the event doesn't dispose of shares, or when the broker
 * handles specified-lot selling properly — a warning nobody needs is a warning
 * everybody learns to skip.
 */
export function exerciseAdvisory(input: {
  broker: BrokerId;
  putCall: OptionDetail['putCall'];
  side: OrderSide;
  /** True once it has already happened, which changes what can be done. */
  assigned?: boolean;
}): Advisory | null {
  if (!disposesShares(input)) return null;
  if (input.broker !== 'robinhood') return null;

  const event = input.assigned ? 'assignment' : 'exercise';

  if (input.assigned) {
    return {
      id: 'rh-assignment-fifo',
      tone: 'critical',
      timeCritical: true,
      title: 'Call Robinhood today to fix the cost basis',
      body:
        `This ${event} sold shares, and Robinhood allocated them first-in-first-out — the ` +
        'oldest, usually cheapest shares, which realizes the largest possible gain. There is ' +
        'no setting for this and no way to specify lots on an assignment.',
      action:
        'Contact Robinhood support TODAY and ask them to reallocate the lots. This can only ' +
        'be changed on the day it happened — after that the FIFO allocation is final.',
    };
  }

  return {
    id: 'rh-exercise-fifo',
    tone: 'critical',
    timeCritical: true,
    title: 'Exercising sells your oldest shares',
    body:
      'Robinhood allocates an exercise first-in-first-out and accepts no lot selection, so ' +
      'this will close your oldest — usually lowest-basis — shares and realize the largest ' +
      'gain available.',
    action:
      'Selling the contract and then selling the shares as a normal order lets you choose the ' +
      'lots, and keeps any remaining time value that exercising would forfeit. If you do ' +
      'exercise, contact Robinhood support the same day to have the lots reallocated — it ' +
      "can't be changed afterwards.",
  };
}

/**
 * Why closing the contract usually beats exercising it.
 *
 * Stated as a comparison rather than a recommendation because the two sides
 * genuinely differ: closing a long put *collects* the remaining time value,
 * while closing a short call *pays* it. One is free, the other has a price, and
 * presenting them as the same thing would be dishonest.
 */
export function alternativeToExercise(input: {
  putCall: OptionDetail['putCall'];
  side: OrderSide;
}): { steps: string[]; tradeoff: string } | null {
  if (!disposesShares(input)) return null;

  if (input.side === 'BUY') {
    return {
      steps: ['Sell the put to close it', 'Sell the shares as a normal order, choosing the lots'],
      tradeoff:
        'Usually strictly better: you keep any time value left in the contract instead of ' +
        'forfeiting it, and you choose which shares to sell.',
    };
  }

  return {
    steps: [
      'Buy the call back to close it',
      'Sell the shares as a normal order, choosing the lots',
    ],
    tradeoff:
      'Closing the call costs its remaining time value. Worth it when the tax saved on the ' +
      'share sale is larger than that cost — compare the two before deciding.',
  };
}

/** Option positions whose exercise or assignment would sell shares. */
export interface AssignmentExposure {
  positions: Position[];
  /** Soonest expiration among them (ISO date), or null when there are none. */
  nextExpiration: string | null;
}

/**
 * Which holdings carry FIFO exposure, soonest first.
 *
 * Aggregated deliberately. Attaching a full advisory to each affected position
 * produced THIRTY-SEVEN identical red cards on one portfolio — which is not a
 * warning, it is wallpaper, and it teaches people to scroll past the thing
 * that has a same-day deadline. One summary that counts them, sorted by what
 * expires first, is the version somebody actually reads.
 *
 * Sorted by expiration because that is when the risk becomes real: a put
 * expiring Friday matters more than one expiring in March.
 */
export function assignmentExposure(
  positions: Position[],
  broker: BrokerId,
): AssignmentExposure {
  if (broker !== 'robinhood') return { positions: [], nextExpiration: null };

  const exposed = positions
    .filter(
      (p) =>
        p.assetType === 'OPTION' &&
        p.option !== undefined &&
        p.quantity !== 0 &&
        disposesShares({
          putCall: p.option.putCall,
          side: p.quantity >= 0 ? 'BUY' : 'SELL',
        }),
    )
    .sort((a, b) => (a.option?.expiration ?? '').localeCompare(b.option?.expiration ?? ''));

  return {
    positions: exposed,
    nextExpiration: exposed[0]?.option?.expiration ?? null,
  };
}
