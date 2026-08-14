import { describe, it, expect, vi } from 'vitest';
import {
  cancelWalk,
  resolveTradingMode,
  walkPlan,
  type ComboLeg,
  type TradingModeDecision,
} from '@inktrade/client';
import { WalkNotPermittedError, runWalk } from './walk-runner.js';

const PAPER: TradingModeDecision = resolveTradingMode({ setting: 'PAPER' });
const LIVE: TradingModeDecision = resolveTradingMode({});
const REVIEW: TradingModeDecision = resolveTradingMode({ setting: 'REVIEW_ONLY' });

const PLAN = walkPlan({
  mid: 2.0,
  config: { startPercent: 25, floorPercent: 25, steps: 5, intervalSeconds: 30 },
})!;

/** A book whose natural credit is `pays`, with plenty of size. */
function bookPaying(pays: number, size = 100): ComboLeg[] {
  return [
    { side: 'SELL', quote: { bid: pays + 2, ask: pays + 2.2, bidSize: size, askSize: size } },
    { side: 'BUY', quote: { bid: 1.8, ask: 2.0, bidSize: size, askSize: size } },
  ];
}

/**
 * A clock the test drives. `wait` advances it rather than sleeping, so a walk
 * spanning ten simulated minutes completes in microseconds.
 */
function fakeClock(start = 0) {
  let t = start;
  return {
    now: () => t,
    wait: async (seconds: number) => {
      t += seconds;
    },
    advance: (seconds: number) => {
      t += seconds;
    },
  };
}

describe('runWalk — the paper-only guard', () => {
  it('refuses to run against a live account', async () => {
    const clock = fakeClock();
    await expect(
      runWalk({
        plan: PLAN,
        quantity: 1,
        deps: { quote: async () => bookPaying(2.5), ...clock, mode: LIVE },
      }),
    ).rejects.toBeInstanceOf(WalkNotPermittedError);
  });

  it('refuses in review-only mode too', async () => {
    const clock = fakeClock();
    await expect(
      runWalk({
        plan: PLAN,
        quantity: 1,
        deps: { quote: async () => bookPaying(2.5), ...clock, mode: REVIEW },
      }),
    ).rejects.toBeInstanceOf(WalkNotPermittedError);
  });

  it('never fetches a quote when it refuses', async () => {
    // The refusal has to come before any side effect, not after.
    const quote = vi.fn(async () => bookPaying(2.5));
    const clock = fakeClock();
    await expect(
      runWalk({ plan: PLAN, quantity: 1, deps: { quote, ...clock, mode: LIVE } }),
    ).rejects.toThrow();
    expect(quote).not.toHaveBeenCalled();
  });
});

describe('runWalk — filling', () => {
  it('fills immediately when the book already meets the opening rung', async () => {
    const clock = fakeClock();
    const result = await runWalk({
      plan: PLAN,
      quantity: 2,
      deps: { quote: async () => bookPaying(3.0), ...clock, mode: PAPER },
    });
    expect(result.state.status).toBe('FILLED');
    expect(result.state.filledQuantity).toBe(2);
    expect(result.polls).toBe(1);
  });

  it('walks down until the book meets it', async () => {
    const clock = fakeClock();
    const result = await runWalk({
      plan: PLAN,
      quantity: 1,
      deps: { quote: async () => bookPaying(2.1), ...clock, mode: PAPER, pollSeconds: 5 },
    });
    expect(result.state.status).toBe('FILLED');
    // Filled at the touch the book pays, not at whichever rung was resting.
    expect(result.state.averagePrice).toBeCloseTo(2.1, 2);
    expect(result.state.history.some((h) => h.kind === 'REPRICED')).toBe(true);
  });

  it('exhausts at the floor when the book never comes', async () => {
    const clock = fakeClock();
    const result = await runWalk({
      plan: PLAN,
      quantity: 1,
      deps: { quote: async () => bookPaying(0.5), ...clock, mode: PAPER },
    });
    expect(result.state.status).toBe('EXHAUSTED');
    expect(result.state.filledQuantity).toBe(0);
    expect(result.state.currentPrice).toBe(PLAN.floor);
    expect(result.hitPollLimit).toBe(false);
  });

  it('accumulates partial fills across rungs as the book thickens', async () => {
    const clock = fakeClock();
    let call = 0;
    const result = await runWalk({
      plan: PLAN,
      quantity: 5,
      deps: {
        // First a thin touch that fills two, then a deep one.
        quote: async () => {
          call += 1;
          return call <= 2 ? bookPaying(2.6, 2) : bookPaying(1.6, 100);
        },
        ...clock,
        mode: PAPER,
      },
    });
    expect(result.state.status).toBe('FILLED');
    expect(result.state.filledQuantity).toBe(5);
    // Averaged across the two prices rather than reporting the last one.
    expect(result.state.averagePrice).toBeGreaterThan(1.6);
    expect(result.state.averagePrice).toBeLessThan(2.6);
  });
});

describe('runWalk — stopping', () => {
  it('stops driving when shouldStop turns true', async () => {
    const clock = fakeClock();
    let polls = 0;
    const result = await runWalk({
      plan: PLAN,
      quantity: 1,
      deps: {
        quote: async () => {
          polls += 1;
          return bookPaying(0.5);
        },
        ...clock,
        mode: PAPER,
      },
      shouldStop: () => polls >= 2,
    });
    // Left WORKING — stopping the driver is not the same as cancelling the
    // order, and inventing a cancel here would record a reason nobody gave.
    expect(result.state.status).toBe('WORKING');
    expect(polls).toBe(2);
  });

  it('honours a cancel recorded by the caller', async () => {
    const clock = fakeClock();
    const result = await runWalk({
      plan: PLAN,
      quantity: 1,
      deps: { quote: async () => bookPaying(0.5), ...clock, mode: PAPER },
    });
    const cancelled = cancelWalk(result.state, clock.now());
    // EXHAUSTED is terminal, so a later cancel changes nothing.
    expect(cancelled.status).toBe('EXHAUSTED');
  });

  it('stops at the poll ceiling rather than looping forever', async () => {
    const clock = fakeClock();
    const result = await runWalk({
      plan: PLAN,
      quantity: 1,
      deps: {
        quote: async () => bookPaying(0.5),
        now: clock.now,
        // A clock that never advances means the walk never concedes and never
        // terminates — exactly the bug the ceiling exists to bound.
        wait: async () => {},
        mode: PAPER,
        maxPolls: 7,
      },
    });
    expect(result.hitPollLimit).toBe(true);
    expect(result.polls).toBe(7);
    expect(result.state.status).toBe('WORKING');
  });
});

describe('runWalk — observation', () => {
  it('reports every state change once', async () => {
    const clock = fakeClock();
    const seen: string[] = [];
    await runWalk({
      plan: PLAN,
      quantity: 1,
      deps: {
        quote: async () => bookPaying(2.1),
        ...clock,
        mode: PAPER,
        onChange: (s) => seen.push(`${s.status}@${s.currentPrice}`),
      },
    });
    expect(seen[0]).toContain('WORKING');
    expect(seen.at(-1)).toContain('FILLED');
    // No duplicate emissions for polls where nothing happened.
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('polls at the configured interval, not the rung interval', async () => {
    const clock = fakeClock();
    const times: number[] = [];
    await runWalk({
      plan: PLAN,
      quantity: 1,
      deps: {
        quote: async () => {
          times.push(clock.now());
          return bookPaying(0.5);
        },
        ...clock,
        mode: PAPER,
        pollSeconds: 10,
      },
    });
    expect(times[1] - times[0]).toBe(10);
  });
});
