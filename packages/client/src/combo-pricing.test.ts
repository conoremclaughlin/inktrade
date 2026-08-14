import { describe, it, expect } from 'vitest';
import {
  BLOCK_DEVIATION_PERCENT,
  CAUTION_DEVIATION_PERCENT,
  WIDE_SPREAD_PERCENT,
  bookQuality,
  checkLimitPrice,
  comboPrices,
  depthView,
  nextRung,
  walkPlan,
  type ComboLeg,
} from './combo-pricing.js';

/*
 * The live book behind the incident that motivated this file.
 * RKLB 2026-10-02 82/77 put credit spread, measured 2026-08-13.
 */
const RKLB_82_77: ComboLeg[] = [
  {
    side: 'SELL',
    quote: { bid: 8.05, ask: 11.85, bidSize: 178, askSize: 173, mark: 9.95 },
  },
  {
    side: 'BUY',
    quote: { bid: 5.45, ask: 9.15, bidSize: 226, askSize: 194, mark: 7.3 },
  },
];

function leg(side: 'BUY' | 'SELL', bid: number, ask: number, extra = {}): ComboLeg {
  return { side, quote: { bid, ask, ...extra } };
}

describe('comboPrices', () => {
  it('prices the motivating spread the way the book actually reads', () => {
    const p = comboPrices(RKLB_82_77);
    expect(p.mid).toBeCloseTo(2.65, 2); // 9.95 - 7.30
    expect(p.natural).toBeCloseTo(-1.1, 2); // sell 8.05, buy 9.15
    expect(p.best).toBeCloseTo(6.4, 2); // sell 11.85, buy 5.45
    expect(p.intent).toBe('CREDIT');
  });

  it('keeps the sign convention: credit positive, debit negative', () => {
    // Buy the expensive leg, sell the cheap one — a debit spread.
    const debit = comboPrices([leg('BUY', 9.9, 10.0), leg('SELL', 4.9, 5.0)]);
    expect(debit.mid).toBeCloseTo(-5, 2);
    expect(debit.intent).toBe('DEBIT');
  });

  it('honours ratio quantities', () => {
    const p = comboPrices([
      { side: 'SELL', quote: { bid: 2.0, ask: 2.0 }, ratio: 2 },
      { side: 'BUY', quote: { bid: 1.0, ask: 1.0 } },
    ]);
    expect(p.mid).toBeCloseTo(3, 2); // 2*2 - 1
  });

  it('refuses to invent a midpoint from a one-sided book', () => {
    const p = comboPrices([leg('SELL', 8.05, 11.85), { side: 'BUY', quote: { bid: 5.45, ask: null } }]);
    expect(p.natural).toBeNull();
    // The buy leg has no ask and no mark, so no midpoint exists either.
    expect(p.mid).toBeNull();
    expect(p.intent).toBeNull();
  });

  it('falls back to the mark only when the book is one-sided', () => {
    const p = comboPrices([
      { side: 'SELL', quote: { bid: null, ask: null, mark: 9.95 } },
      { side: 'BUY', quote: { bid: null, ask: null, mark: 7.3 } },
    ]);
    expect(p.mid).toBeCloseTo(2.65, 2);
    expect(p.natural).toBeNull(); // still unknowable
  });

  it('prefers a real two-sided quote over the mark', () => {
    // A mark that disagrees with the book must not win — it is an estimate.
    const p = comboPrices([{ side: 'SELL', quote: { bid: 1.0, ask: 3.0, mark: 99 } }]);
    expect(p.mid).toBeCloseTo(2, 2);
  });

  it('returns nulls for an empty order rather than zero', () => {
    // Zero is a price. Nothing is not.
    const p = comboPrices([]);
    expect(p.mid).toBeNull();
    expect(p.intent).toBeNull();
  });
});

describe('bookQuality', () => {
  it('measures the widest leg and flags the perverse natural', () => {
    const q = bookQuality(RKLB_82_77);
    // 77P: (9.15-5.45)/7.30 = 50.7%, wider than the 82P's 38.2%.
    expect(q.worstSpreadPercent).toBeCloseTo(50.68, 1);
    expect(q.naturalIsPerverse).toBe(true);
    expect(q.oneSided).toBe(false);
  });

  it('binds tradable size to the thinnest side you have to hit', () => {
    // Selling consumes the bid; buying consumes the ask.
    const q = bookQuality([
      leg('SELL', 7.5, 7.8, { bidSize: 1, askSize: 13 }),
      leg('BUY', 5.0, 5.2, { bidSize: 54, askSize: 500 }),
    ]);
    // The one-contract bid is the binding constraint, not the 500-lot ask.
    expect(q.tradableSize).toBe(1);
  });

  it('divides available size by the leg ratio', () => {
    const q = bookQuality([
      { side: 'SELL', quote: { bid: 1, ask: 2, bidSize: 10 }, ratio: 2 },
      { side: 'BUY', quote: { bid: 1, ask: 2, askSize: 10 } },
    ]);
    // Ten contracts on a 2-ratio leg is five whole spreads.
    expect(q.tradableSize).toBe(5);
  });

  it('does not call a healthy natural perverse', () => {
    const q = bookQuality([leg('SELL', 5.0, 5.1), leg('BUY', 2.0, 2.1)]);
    expect(q.naturalIsPerverse).toBe(false);
  });

  it('flags a one-sided book', () => {
    const q = bookQuality([{ side: 'SELL', quote: { bid: 5, ask: null } }]);
    expect(q.oneSided).toBe(true);
  });
});

describe('depthView', () => {
  it('measures the spread against the mid', () => {
    // RKLB 85P: 9.50/11.35, a $1.85 spread on a $10.43 mid.
    const v = depthView({ bid: 9.5, ask: 11.35, bidSize: 501, askSize: 381 });
    expect(v.spread).toBeCloseTo(1.85, 2);
    expect(v.spreadPercent).toBeCloseTo(17.75, 1);
    // The sentence rounds to whole percent; the field keeps the precision.
    expect(v.notes.join(' ')).toContain('18%');
  });

  it('calls out a one-contract bid — the whole reason this exists', () => {
    // RKLB 80P: looks tight at 7.50/7.80, one contract behind the bid.
    const v = depthView({ bid: 7.5, ask: 7.8, bidSize: 1, askSize: 13 });
    expect(v.spreadPercent).toBeLessThan(WIDE_SPREAD_PERCENT); // reads tight
    expect(v.notes.join(' ')).toContain('Only 1 on the bid');
  });

  it('computes a depth share for the bar', () => {
    const v = depthView({ bid: 5, ask: 5.2, bidSize: 54, askSize: 1 });
    expect(v.bidDepthShare).toBeCloseTo(54 / 55, 2);
  });

  it('refuses to invent a balanced bar when no size is published', () => {
    // A 50/50 bar drawn from nothing would assert a market that may not exist.
    const v = depthView({ bid: 5, ask: 5.2 });
    expect(v.bidDepthShare).toBeNull();
  });

  it('flags a one-sided book', () => {
    const v = depthView({ bid: 5, ask: null });
    expect(v.spread).toBeNull();
    expect(v.spreadPercent).toBeNull();
    expect(v.notes.join(' ')).toContain('One-sided');
  });

  it('says nothing about a tight, deep book', () => {
    const v = depthView({ bid: 5.0, ask: 5.05, bidSize: 200, askSize: 200 });
    expect(v.notes).toEqual([]);
  });
});

describe('checkLimitPrice — the fat-finger guard', () => {
  const prices = comboPrices(RKLB_82_77);

  it('blocks the exact typo that caused this', () => {
    // 0.70 typed instead of 2.70, against a 2.65 mid.
    const c = checkLimitPrice({ limit: 0.7, prices, width: 5 });
    expect(c.verdict).toBe('blocked');
    expect(c.deviationPercent).toBeCloseTo(73.58, 1);
    expect(c.costPerContract).toBeCloseTo(195, 0);
    expect(c.reasons[0]).toContain('195');
  });

  it('passes the price that was intended', () => {
    const c = checkLimitPrice({ limit: 2.7, prices, width: 5 });
    expect(c.verdict).toBe('ok');
    expect(c.reasons).toEqual([]);
  });

  it('measures against the mid, not the natural', () => {
    // The natural here is -1.10. Priced off that, 0.70 would look generous and
    // the guard would wave through the very order it exists to stop.
    const c = checkLimitPrice({ limit: 0.7, prices });
    expect(c.verdict).toBe('blocked');
  });

  it('gets the direction right on a debit — high is the dangerous side', () => {
    const debit = comboPrices([leg('BUY', 4.9, 5.1), leg('SELL', 1.9, 2.1)]);
    expect(debit.intent).toBe('DEBIT');
    // Mid is -3.00. Paying 5.00 is a 67% overpay.
    const bad = checkLimitPrice({ limit: 5, prices: debit });
    expect(bad.verdict).toBe('blocked');
    // Paying 2.00 is better than the mid, so it is not a concession at all.
    const good = checkLimitPrice({ limit: 2, prices: debit });
    expect(good.verdict).toBe('ok');
  });

  it('does not penalise asking for MORE than the mid on a credit', () => {
    // Greedy is not dangerous. It just may not fill — and best is 6.40 here,
    // so 3.50 is still inside what someone is quoting.
    const c = checkLimitPrice({ limit: 3.5, prices });
    expect(c.verdict).toBe('ok');
  });

  it('warns when the price is better than anyone is quoting', () => {
    const c = checkLimitPrice({ limit: 7.0, prices });
    expect(c.verdict).toBe('caution');
    expect(c.reasons.join(' ')).toContain('rest unfilled');
  });

  it('blocks a credit larger than the spread width', () => {
    // A $5-wide vertical cannot pay $27 — a decimal slip in the other direction.
    const c = checkLimitPrice({ limit: 27, prices, width: 5 });
    expect(c.verdict).toBe('blocked');
    expect(c.reasons.join(' ')).toContain('cannot pay more than');
  });

  it('blocks a negative limit outright', () => {
    const c = checkLimitPrice({ limit: -1, prices, width: 5 });
    expect(c.verdict).toBe('blocked');
  });

  it('cautions rather than blocks at the caution threshold', () => {
    // Exactly on the boundary should warn, not stop.
    const mid = 2.65;
    const limit = mid * (1 - CAUTION_DEVIATION_PERCENT / 100);
    const c = checkLimitPrice({ limit, prices });
    expect(c.verdict).toBe('caution');
  });

  it('blocks exactly at the block threshold', () => {
    const mid = 2.65;
    const limit = mid * (1 - BLOCK_DEVIATION_PERCENT / 100);
    const c = checkLimitPrice({ limit, prices });
    expect(c.verdict).toBe('blocked');
  });

  it('cautions, rather than passing, when there is no midpoint to check against', () => {
    const noBook = comboPrices([{ side: 'SELL', quote: { bid: null, ask: null } }]);
    const c = checkLimitPrice({ limit: 0.7, prices: noBook });
    expect(c.verdict).toBe('caution');
    expect(c.reasons.join(' ')).toContain('cannot be checked');
  });

  it('scales the warning with contract multiplier, not raw dollars', () => {
    // The same percentage concession on a cheap contract is a small loss.
    const cheap = comboPrices([leg('SELL', 0.3, 0.34), leg('BUY', 0.1, 0.12)]);
    const c = checkLimitPrice({ limit: 0.05, prices: cheap });
    expect(c.verdict).toBe('blocked'); // still a 76% concession
    expect(c.costPerContract).toBeLessThan(20); // but only ~$16
  });
});

describe('walkPlan', () => {
  it('walks a credit from above the mid down through it', () => {
    const plan = walkPlan({ mid: 2.65, config: { startPercent: 20, floorPercent: 15, steps: 5 } })!;
    expect(plan.intent).toBe('CREDIT');
    // 2.65 * 1.20 = 3.18, which is not a sendable price: options quote in
    // nickels above $3.00, so the rung is the tick, not the raw arithmetic.
    expect(plan.start).toBeCloseTo(3.2, 2);
    expect(plan.floor).toBeCloseTo(2.25, 2); // 2.65 * 0.85, penny-ticked below $3
    // Monotonically conceding, and passing through the mid on the way.
    for (let i = 1; i < plan.rungs.length; i += 1) {
      expect(plan.rungs[i]).toBeLessThan(plan.rungs[i - 1]);
    }
    expect(Math.min(...plan.rungs)).toBeLessThan(2.65);
    expect(Math.max(...plan.rungs)).toBeGreaterThan(2.65);
  });

  it('runs the same shape for a debit, in magnitude', () => {
    const plan = walkPlan({ mid: -3.0, config: { startPercent: 20, floorPercent: 15, steps: 4 } })!;
    expect(plan.intent).toBe('DEBIT');
    // Starts by offering to pay LESS than the mid, concedes upward.
    expect(plan.start).toBeCloseTo(3.6, 2);
    expect(plan.floor).toBeCloseTo(2.55, 2);
  });

  it('rounds every rung to a tick the venue accepts', () => {
    const plan = walkPlan({ mid: 4.13, config: { steps: 6 }, kind: 'OPTION' })!;
    for (const r of plan.rungs) {
      // Above $3.00 options quote in nickels, so a 4.37 rung is unsendable.
      // Round to cents FIRST — (4.65 * 100) is 464.99999999999994 in binary
      // floating point, and taking the modulo of that yields 5, not 0.
      expect(Math.round(r * 100) % 5).toBe(0);
    }
  });

  it('uses penny ticks below the $3 cutoff', () => {
    const plan = walkPlan({ mid: 1.0, config: { steps: 5 }, kind: 'OPTION' })!;
    for (const r of plan.rungs) {
      expect(Math.abs(r * 100 - Math.round(r * 100))).toBeLessThan(1e-6);
    }
  });

  it('de-duplicates rungs that round to the same tick', () => {
    // A tight walk over many steps collapses; re-sending the same limit is a
    // cancel/replace that loses queue position and gains nothing.
    const plan = walkPlan({
      mid: 3.0,
      config: { startPercent: 2, floorPercent: 2, steps: 20 },
      kind: 'OPTION',
    })!;
    expect(new Set(plan.rungs).size).toBe(plan.rungs.length);
  });

  it('never crosses zero, however wide the floor', () => {
    const plan = walkPlan({ mid: 1.0, config: { startPercent: 10, floorPercent: 500, steps: 6 } })!;
    for (const r of plan.rungs) expect(r).toBeGreaterThanOrEqual(0);
  });

  it('handles a single-step plan as a fixed price', () => {
    const plan = walkPlan({ mid: 2.65, config: { steps: 1, startPercent: 0, floorPercent: 0 } })!;
    expect(plan.rungs).toHaveLength(1);
    expect(plan.start).toBe(plan.floor);
  });

  it('refuses to plan without a usable midpoint', () => {
    expect(walkPlan({ mid: 0 })).toBeNull();
    expect(walkPlan({ mid: Number.NaN })).toBeNull();
    expect(walkPlan({ mid: 2.65, config: { steps: 0 } })).toBeNull();
  });
});

describe('nextRung', () => {
  const plan = walkPlan({ mid: 2.65, config: { startPercent: 20, floorPercent: 15, steps: 5 } })!;

  it('advances one rung at a time', () => {
    const second = nextRung(plan, plan.rungs[0]);
    expect(second).toBe(plan.rungs[1]);
  });

  it('returns null at the floor — the only way the walk ends', () => {
    expect(nextRung(plan, plan.floor)).toBeNull();
  });

  it('returns null for a price that is not on the ladder', () => {
    // Guards against a caller drifting off-plan and walking somewhere arbitrary.
    expect(nextRung(plan, 99)).toBeNull();
  });

  it('never returns a price beyond the floor', () => {
    let current: number | null = plan.start;
    const seen: number[] = [];
    while (current !== null) {
      seen.push(current);
      current = nextRung(plan, current);
    }
    expect(seen[seen.length - 1]).toBe(plan.floor);
    expect(seen).toHaveLength(plan.rungs.length);
  });
});
