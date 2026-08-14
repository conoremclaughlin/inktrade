import { describe, it, expect } from 'vitest';
import { walkPlan, type ComboLeg } from './combo-pricing.js';
import { simulateFill } from './paper-fill.js';
import {
  advanceWalk,
  cancelWalk,
  isTerminal,
  startWalk,
  walkProgress,
  type WalkState,
} from './walk-executor.js';

const PLAN = walkPlan({
  mid: 2.0,
  config: { startPercent: 25, floorPercent: 25, steps: 5, intervalSeconds: 30 },
})!;

/** A book that pays `natural` to cross, with plenty of size. */
function bookPaying(natural: number, size = 100): ComboLeg[] {
  return [
    { side: 'SELL', quote: { bid: natural + 2, ask: natural + 2.2, bidSize: size, askSize: size } },
    { side: 'BUY', quote: { bid: 1.8, ask: 2.0, bidSize: size, askSize: size } },
  ];
}

/** Nothing filled — the order rests. */
const NO_FILL = {
  status: 'WORKING' as const,
  filledQuantity: 0,
  remainingQuantity: 1,
  fillPrice: null,
  limitPrice: 0,
  explanation: 'Resting.',
};

describe('startWalk', () => {
  it('opens at the greedy end of the ladder', () => {
    const s = startWalk({ plan: PLAN, quantity: 5, now: 0 });
    expect(s.currentPrice).toBe(PLAN.start);
    expect(s.status).toBe('WORKING');
    expect(s.filledQuantity).toBe(0);
    expect(s.history[0].kind).toBe('PLACED');
  });
});

describe('advanceWalk — pacing', () => {
  it('does not concede before the interval has elapsed', () => {
    const s = startWalk({ plan: PLAN, quantity: 1, now: 1000 });
    const polled = advanceWalk(s, { fill: NO_FILL, now: 1029 });
    expect(polled.currentPrice).toBe(PLAN.start);
    expect(polled.history).toHaveLength(1);
  });

  it('concedes one rung once the interval passes', () => {
    const s = startWalk({ plan: PLAN, quantity: 1, now: 1000 });
    const next = advanceWalk(s, { fill: NO_FILL, now: 1030 });
    expect(next.currentPrice).toBe(PLAN.rungs[1]);
    expect(next.currentPrice).toBeLessThan(PLAN.start);
    expect(next.history.at(-1)!.kind).toBe('REPRICED');
  });

  it('concedes only ONE rung however long the caller waited', () => {
    // A caller that was asleep for ten minutes must not sprint to the floor —
    // each rung is a price the market deserves a chance to meet.
    const s = startWalk({ plan: PLAN, quantity: 1, now: 0 });
    const next = advanceWalk(s, { fill: NO_FILL, now: 100_000 });
    expect(next.currentPrice).toBe(PLAN.rungs[1]);
  });

  it('resets the clock at each new rung', () => {
    const s = startWalk({ plan: PLAN, quantity: 1, now: 0 });
    const second = advanceWalk(s, { fill: NO_FILL, now: 30 });
    expect(second.rungStartedAt).toBe(30);
    const tooSoon = advanceWalk(second, { fill: NO_FILL, now: 59 });
    expect(tooSoon.currentPrice).toBe(second.currentPrice);
  });

  it('is a no-op when polled repeatedly with nothing happening', () => {
    let s = startWalk({ plan: PLAN, quantity: 1, now: 0 });
    for (let t = 1; t < 30; t += 1) s = advanceWalk(s, { fill: NO_FILL, now: t });
    expect(s.currentPrice).toBe(PLAN.start);
    expect(s.history).toHaveLength(1);
  });
});

describe('advanceWalk — the floor is absolute', () => {
  function runToFloor(): WalkState {
    let s = startWalk({ plan: PLAN, quantity: 1, now: 0 });
    let t = 0;
    // Enough iterations to exhaust the ladder several times over.
    for (let i = 0; i < 50; i += 1) {
      t += 30;
      s = advanceWalk(s, { fill: NO_FILL, now: t });
    }
    return s;
  }

  it('stops at the floor and never prices past it', () => {
    const s = runToFloor();
    expect(s.status).toBe('EXHAUSTED');
    expect(s.currentPrice).toBe(PLAN.floor);
  });

  it('never visits a price outside the plan', () => {
    let s = startWalk({ plan: PLAN, quantity: 1, now: 0 });
    const visited = [s.currentPrice];
    let t = 0;
    for (let i = 0; i < 20; i += 1) {
      t += 30;
      s = advanceWalk(s, { fill: NO_FILL, now: t });
      visited.push(s.currentPrice);
    }
    for (const p of visited) expect(PLAN.rungs).toContain(p);
  });

  it('leaves the order resting at the floor rather than cancelling it', () => {
    // The floor is a price the user said they would accept. Pulling the order
    // would be a decision they never made.
    const s = runToFloor();
    expect(s.history.at(-1)!.kind).toBe('EXHAUSTED');
    expect(s.history.at(-1)!.note).toContain('rests there');
  });

  it('stays terminal once exhausted', () => {
    const s = runToFloor();
    const again = advanceWalk(s, { fill: NO_FILL, now: 999_999 });
    expect(again).toBe(s);
  });
});

describe('advanceWalk — fills', () => {
  it('completes on a full fill and stops advancing', () => {
    const legs = bookPaying(2.5);
    const fill = simulateFill({ legs, limit: PLAN.start, quantity: 3 });
    expect(fill.status).toBe('FILLED');

    const s = startWalk({ plan: PLAN, quantity: 3, now: 0 });
    const done = advanceWalk(s, { fill, now: 5 });
    expect(done.status).toBe('FILLED');
    expect(done.filledQuantity).toBe(3);
    expect(isTerminal(done)).toBe(true);

    const after = advanceWalk(done, { fill, now: 500 });
    expect(after).toBe(done);
  });

  it('keeps working the remainder after a partial', () => {
    const thin = bookPaying(2.5, 2);
    const partial = simulateFill({ legs: thin, limit: PLAN.start, quantity: 5 });
    expect(partial.status).toBe('PARTIAL');

    const s = startWalk({ plan: PLAN, quantity: 5, now: 0 });
    const working = advanceWalk(s, { fill: partial, now: 5 });
    expect(working.status).toBe('WORKING');
    expect(working.filledQuantity).toBe(2);

    // ...and still concedes on schedule with the remainder outstanding.
    const conceded = advanceWalk(working, { fill: NO_FILL, now: 30 });
    expect(conceded.currentPrice).toBe(PLAN.rungs[1]);
    expect(conceded.filledQuantity).toBe(2);
  });

  it('weights the average across fills at different rungs', () => {
    const s = startWalk({ plan: PLAN, quantity: 4, now: 0 });
    const first = advanceWalk(s, {
      fill: { ...NO_FILL, status: 'PARTIAL', filledQuantity: 2, fillPrice: 2.5, limitPrice: 2.5 },
      now: 1,
    });
    expect(first.averagePrice).toBeCloseTo(2.5, 2);

    const second = advanceWalk(first, {
      fill: { ...NO_FILL, status: 'PARTIAL', filledQuantity: 2, fillPrice: 1.5, limitPrice: 1.5 },
      now: 2,
    });
    // (2.50*2 + 1.50*2) / 4 = 2.00
    expect(second.averagePrice).toBeCloseTo(2.0, 2);
    expect(second.status).toBe('FILLED');
  });

  it('completes when a partial finishes the quantity exactly', () => {
    const s = startWalk({ plan: PLAN, quantity: 2, now: 0 });
    const done = advanceWalk(s, {
      fill: { ...NO_FILL, filledQuantity: 2, fillPrice: 2.4, limitPrice: 2.4 },
      now: 1,
    });
    expect(done.status).toBe('FILLED');
    expect(done.filledQuantity).toBe(2);
  });

  it('records every fill in the history', () => {
    const s = startWalk({ plan: PLAN, quantity: 4, now: 0 });
    const one = advanceWalk(s, {
      fill: { ...NO_FILL, filledQuantity: 1, fillPrice: 2.4, limitPrice: 2.4 },
      now: 1,
    });
    const fills = one.history.filter((h) => h.kind === 'FILL');
    expect(fills).toHaveLength(1);
    expect(fills[0].quantity).toBe(1);
  });
});

describe('cancelWalk', () => {
  it('stops immediately, mid-ladder', () => {
    const s = startWalk({ plan: PLAN, quantity: 5, now: 0 });
    const cancelled = cancelWalk(s, 10);
    expect(cancelled.status).toBe('CANCELLED');
    expect(isTerminal(cancelled)).toBe(true);
  });

  it('is honoured even in the same instant a reprice was due', () => {
    const s = startWalk({ plan: PLAN, quantity: 5, now: 0 });
    const cancelled = cancelWalk(s, 30);
    const after = advanceWalk(cancelled, { fill: NO_FILL, now: 30 });
    expect(after.status).toBe('CANCELLED');
    expect(after.currentPrice).toBe(PLAN.start);
  });

  it('cannot be undone by further advances', () => {
    let s = cancelWalk(startWalk({ plan: PLAN, quantity: 1, now: 0 }), 5);
    for (let t = 10; t < 300; t += 30) s = advanceWalk(s, { fill: NO_FILL, now: t });
    expect(s.status).toBe('CANCELLED');
  });

  it('reports what was left unfilled', () => {
    const s = startWalk({ plan: PLAN, quantity: 5, now: 0 });
    const partial = advanceWalk(s, {
      fill: { ...NO_FILL, filledQuantity: 2, fillPrice: 2.4, limitPrice: 2.4 },
      now: 1,
    });
    const cancelled = cancelWalk(partial, 2);
    expect(cancelled.history.at(-1)!.note).toContain('3 unfilled');
  });

  it('leaves a terminal walk alone', () => {
    const s = startWalk({ plan: PLAN, quantity: 1, now: 0 });
    const filled = advanceWalk(s, {
      fill: { ...NO_FILL, filledQuantity: 1, fillPrice: 2.4, limitPrice: 2.4 },
      now: 1,
    });
    expect(cancelWalk(filled, 2)).toBe(filled);
  });
});

describe('walkProgress', () => {
  it('counts from one', () => {
    const s = startWalk({ plan: PLAN, quantity: 1, now: 0 });
    expect(walkProgress(s)).toEqual({ rung: 1, of: PLAN.rungs.length });
  });

  it('tracks the rung as it concedes', () => {
    const s = advanceWalk(startWalk({ plan: PLAN, quantity: 1, now: 0 }), {
      fill: NO_FILL,
      now: 30,
    });
    expect(walkProgress(s).rung).toBe(2);
  });
});

describe('end to end against the paper fill engine', () => {
  it('walks down until the book meets it, then stops', () => {
    // The book pays 2.10 to cross. The ladder starts at 2.50 and concedes.
    const legs = bookPaying(2.1);
    let s = startWalk({ plan: PLAN, quantity: 1, now: 0 });
    let t = 0;

    while (!isTerminal(s) && t < 600) {
      const fill = simulateFill({ legs, limit: s.currentPrice, quantity: s.quantity - s.filledQuantity });
      s = advanceWalk(s, { fill, now: t });
      t += 30;
    }

    expect(s.status).toBe('FILLED');
    // Filled at the touch the book was actually paying, not at the rung.
    expect(s.averagePrice).toBeCloseTo(2.1, 2);
    // And it did concede at least once before getting there.
    expect(s.history.some((h) => h.kind === 'REPRICED')).toBe(true);
  });

  it('exhausts without filling when the book never comes', () => {
    // Crossing pays only 0.50, far below even the floor of 1.50.
    const legs = bookPaying(0.5);
    let s = startWalk({ plan: PLAN, quantity: 1, now: 0 });
    let t = 0;

    while (!isTerminal(s) && t < 600) {
      const fill = simulateFill({ legs, limit: s.currentPrice, quantity: 1 });
      s = advanceWalk(s, { fill, now: t });
      t += 30;
    }

    expect(s.status).toBe('EXHAUSTED');
    expect(s.filledQuantity).toBe(0);
    expect(s.currentPrice).toBe(PLAN.floor);
  });
});
