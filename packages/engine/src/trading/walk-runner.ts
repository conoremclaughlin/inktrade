/**
 * Driving a price walk against a live book.
 *
 * The pure state machine lives in @inktrade/client and knows nothing about
 * time, quotes or brokers. This is the thin layer that gives it those three,
 * and it is deliberately the only place where a walk touches the outside
 * world — so the blast radius of "the walk did something unexpected" is one
 * file with no arithmetic in it.
 *
 * Every dependency is injected: the clock, the sleep, the quote source. Tests
 * therefore run a hundred rungs in microseconds with no wall-clock waiting and
 * no network, while the same code path drives a real broker in production.
 *
 * SAFETY: this refuses to run outside PAPER mode. The live adapter — placing,
 * cancelling and replacing real orders — does not exist yet, and a runner that
 * silently degraded to "simulate against a live account" would be the worst
 * possible failure. Live support is a deliberate future change to this guard,
 * not an omission to be filled in by accident.
 */

import {
  advanceWalk,
  isTerminal,
  simulateFill,
  startWalk,
  type ComboLeg,
  type TradingModeDecision,
  type WalkPlan,
  type WalkState,
} from '@inktrade/client';

export class WalkNotPermittedError extends Error {
  constructor(mode: string) {
    super(
      `A price walk can only be run in paper mode; this session is ${mode}. ` +
        'Live order working is not implemented.',
    );
    this.name = 'WalkNotPermittedError';
  }
}

export interface WalkRunnerDeps {
  /**
   * The current book for the legs being worked. Called once per poll.
   *
   * MUST NOT be served from a cache. RobinhoodBroker memoizes tool calls by
   * default and `get_option_quotes` carries a 5-second TTL — correct for a
   * page render, wrong for an order being worked, because a walk polling on
   * roughly that period would repeatedly concede against a book it has not
   * actually re-read. Build the broker for a walk with `cache: null`.
   */
  quote: () => Promise<ComboLeg[]>;
  /** Seconds since some fixed origin. Injected so tests need no real clock. */
  now: () => number;
  /** Yield for this many seconds. Injected so tests need no real waiting. */
  wait: (seconds: number) => Promise<void>;
  mode: TradingModeDecision;
  /**
   * Seconds between polls. Independent of the plan's rung interval: the walk
   * should notice a fill long before it is due to concede.
   *
   * Kept conservative by default — the broker rate-limits above roughly five
   * concurrent requests, and a walk hammering the quote endpoint would starve
   * everything else on the page.
   */
  pollSeconds?: number;
  /** Called after every state change, for progress display. */
  onChange?: (state: WalkState) => void;
  /**
   * Hard ceiling on iterations. A backstop against a bug in the terminal
   * conditions turning into an unbounded loop against a live broker.
   */
  maxPolls?: number;
}

export const DEFAULT_POLL_SECONDS = 5;
export const DEFAULT_MAX_POLLS = 500;

export interface WalkRunResult {
  state: WalkState;
  polls: number;
  /** True when maxPolls stopped it rather than a terminal state. */
  hitPollLimit: boolean;
}

/**
 * Work the plan until it fills, exhausts, or is stopped.
 *
 * Returns the final state rather than throwing on an unfilled walk — running
 * out of rungs is a normal outcome, not an error, and the caller needs the
 * history either way.
 */
export async function runWalk(input: {
  plan: WalkPlan;
  quantity: number;
  deps: WalkRunnerDeps;
  /** Consulted before every poll; true stops the walk where it stands. */
  shouldStop?: () => boolean;
}): Promise<WalkRunResult> {
  const { plan, quantity, deps } = input;

  if (deps.mode.mode !== 'PAPER') {
    throw new WalkNotPermittedError(deps.mode.mode);
  }

  const pollSeconds = deps.pollSeconds ?? DEFAULT_POLL_SECONDS;
  const maxPolls = deps.maxPolls ?? DEFAULT_MAX_POLLS;

  let state = startWalk({ plan, quantity, now: deps.now() });
  deps.onChange?.(state);

  let polls = 0;

  while (!isTerminal(state)) {
    if (input.shouldStop?.()) {
      // Not a cancel — the caller owns that decision and calls cancelWalk
      // itself so the reason is recorded. This just stops driving.
      break;
    }

    if (polls >= maxPolls) {
      return { state, polls, hitPollLimit: true };
    }
    polls += 1;

    const legs = await deps.quote();
    const outstanding = state.quantity - state.filledQuantity;
    const fill = simulateFill({ legs, limit: state.currentPrice, quantity: outstanding });

    const next = advanceWalk(state, { fill, now: deps.now() });
    if (next !== state) {
      state = next;
      deps.onChange?.(state);
    }

    if (isTerminal(state)) break;
    await deps.wait(pollSeconds);
  }

  return { state, polls, hitPollLimit: false };
}
