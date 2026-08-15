import { describe, it, expect } from 'vitest';
import { applyFill, paperPnl, simulateFill, type PaperPosition } from './paper-fill.js';
import type { ComboLeg } from './combo-pricing.js';

/** A healthy, tight, deep book. Credit spread: mid 2.00, natural 1.80. */
const TIGHT: ComboLeg[] = [
  { side: 'SELL', quote: { bid: 3.9, ask: 4.1, bidSize: 100, askSize: 100 } },
  { side: 'BUY', quote: { bid: 1.9, ask: 2.1, bidSize: 100, askSize: 100 } },
];

/** The RKLB book: natural is perverse, mid is 2.65. */
const RKLB: ComboLeg[] = [
  { side: 'SELL', quote: { bid: 8.05, ask: 11.85, bidSize: 178, askSize: 173, mark: 9.95 } },
  { side: 'BUY', quote: { bid: 5.45, ask: 9.15, bidSize: 226, askSize: 194, mark: 7.3 } },
];

describe('simulateFill — marketability', () => {
  it('fills a credit order priced at or below the touch', () => {
    // Natural is 1.80. Asking 1.50 is marketable.
    const f = simulateFill({ legs: TIGHT, limit: 1.5, quantity: 1 });
    expect(f.status).toBe('FILLED');
    expect(f.filledQuantity).toBe(1);
  });

  it('rests a credit order priced above the touch', () => {
    // Asking 2.00 (the mid) when crossing only pays 1.80.
    const f = simulateFill({ legs: TIGHT, limit: 2.0, quantity: 1 });
    expect(f.status).toBe('WORKING');
    expect(f.fillPrice).toBeNull();
    expect(f.explanation).toContain('Resting');
  });

  it('fills at the TOUCH, not at the limit — this is the whole point', () => {
    // Offering to sell for 0.50 when the book pays 1.80 does not sell for 0.50.
    const f = simulateFill({ legs: TIGHT, limit: 0.5, quantity: 1 });
    expect(f.status).toBe('FILLED');
    expect(f.fillPrice).toBeCloseTo(1.8, 2);
    expect(f.limitPrice).toBe(0.5);
    expect(f.explanation).toContain('better per unit');
  });

  it('rests everything on the RKLB book unless you accept the perverse natural', () => {
    // Natural is -1.10: crossing PAYS 1.10 rather than collecting. No positive
    // credit limit is marketable, which is exactly right — the combo would
    // have to be worked, and that is what the walk is for.
    const f = simulateFill({ legs: RKLB, limit: 2.65, quantity: 1 });
    expect(f.status).toBe('WORKING');
    const evenCheap = simulateFill({ legs: RKLB, limit: 0.7, quantity: 1 });
    expect(evenCheap.status).toBe('WORKING');
  });

  it('handles a debit order in the mirror direction', () => {
    const debit: ComboLeg[] = [
      { side: 'BUY', quote: { bid: 3.9, ask: 4.1, bidSize: 50, askSize: 50 } },
      { side: 'SELL', quote: { bid: 1.9, ask: 2.1, bidSize: 50, askSize: 50 } },
    ];
    // Natural is -(4.1) + 1.9 = -2.20; crossing costs 2.20.
    const pays = simulateFill({ legs: debit, limit: 2.5, quantity: 1 });
    expect(pays.status).toBe('FILLED');
    expect(pays.fillPrice).toBeCloseTo(-2.2, 2); // filled cheaper than offered

    const lowball = simulateFill({ legs: debit, limit: 2.0, quantity: 1 });
    expect(lowball.status).toBe('WORKING');
  });
});

describe('simulateFill — size binds', () => {
  it('partially fills against a thin touch', () => {
    const thin: ComboLeg[] = [
      { side: 'SELL', quote: { bid: 3.9, ask: 4.1, bidSize: 3, askSize: 100 } },
      { side: 'BUY', quote: { bid: 1.9, ask: 2.1, bidSize: 100, askSize: 100 } },
    ];
    const f = simulateFill({ legs: thin, limit: 1.5, quantity: 10 });
    expect(f.status).toBe('PARTIAL');
    expect(f.filledQuantity).toBe(3);
    expect(f.remainingQuantity).toBe(7);
  });

  it('binds on the leg you have to hit, not the other one', () => {
    // The sell leg consumes the BID. A deep ask on that leg is irrelevant.
    const f = simulateFill({
      legs: [
        { side: 'SELL', quote: { bid: 3.9, ask: 4.1, bidSize: 1, askSize: 999 } },
        { side: 'BUY', quote: { bid: 1.9, ask: 2.1, bidSize: 999, askSize: 999 } },
      ],
      limit: 1.5,
      quantity: 10,
    });
    expect(f.filledQuantity).toBe(1);
  });

  it('treats unknown size as sufficient rather than as zero', () => {
    // A broker that omits size must not make everything silently unfillable.
    const noSize: ComboLeg[] = [
      { side: 'SELL', quote: { bid: 3.9, ask: 4.1 } },
      { side: 'BUY', quote: { bid: 1.9, ask: 2.1 } },
    ];
    const f = simulateFill({ legs: noSize, limit: 1.5, quantity: 25 });
    expect(f.status).toBe('FILLED');
    expect(f.filledQuantity).toBe(25);
  });

  it('divides available size by the leg ratio', () => {
    const f = simulateFill({
      legs: [
        { side: 'SELL', quote: { bid: 4.0, ask: 4.0, bidSize: 10 }, ratio: 2 },
        { side: 'BUY', quote: { bid: 1.0, ask: 1.0, bidSize: 99, askSize: 99 } },
      ],
      limit: 1.0,
      quantity: 10,
    });
    // Ten contracts on a 2-ratio leg is five whole strategies.
    expect(f.filledQuantity).toBe(5);
  });
});

describe('simulateFill — degenerate inputs', () => {
  it('reports UNPRICEABLE on a one-sided book rather than guessing', () => {
    const f = simulateFill({
      legs: [{ side: 'SELL', quote: { bid: 4.0, ask: null } }],
      limit: 1,
      quantity: 1,
    });
    expect(f.status).toBe('UNPRICEABLE');
    expect(f.fillPrice).toBeNull();
  });

  it('fills nothing for zero or negative quantity', () => {
    expect(simulateFill({ legs: TIGHT, limit: 1.5, quantity: 0 }).filledQuantity).toBe(0);
    expect(simulateFill({ legs: TIGHT, limit: 1.5, quantity: -5 }).filledQuantity).toBe(0);
  });

  it('never fills more than requested even on a deep book', () => {
    const f = simulateFill({ legs: TIGHT, limit: 1.0, quantity: 2 });
    expect(f.filledQuantity).toBe(2);
    expect(f.remainingQuantity).toBe(0);
  });

  it('respects an explicit intent over the one derived from the book', () => {
    // An order opened when the book looked different keeps its own direction.
    const f = simulateFill({ legs: TIGHT, limit: 5, quantity: 1, intent: 'DEBIT' });
    // Natural is +1.80 (a credit), so a DEBIT order can never cross it.
    expect(f.status).toBe('WORKING');
  });
});

describe('applyFill', () => {
  const meta = { id: 'rklb-82-77', symbol: 'RKLB', label: 'RKLB 82/77P 10/2', at: '2026-08-14' };

  it('opens a position from the first fill', () => {
    const fill = simulateFill({ legs: TIGHT, limit: 1.5, quantity: 2 });
    const positions = applyFill([], fill, meta);
    expect(positions).toHaveLength(1);
    expect(positions[0].quantity).toBe(2);
    expect(positions[0].averagePrice).toBeCloseTo(1.8, 2);
  });

  it('weights the average across adds, not just the last rung', () => {
    // The walk fills two at 1.80, then the book moves and three fill at 1.40.
    const first = simulateFill({ legs: TIGHT, limit: 1.5, quantity: 2 });
    let positions = applyFill([], first, meta);

    const worse: ComboLeg[] = [
      { side: 'SELL', quote: { bid: 3.7, ask: 3.9, bidSize: 100, askSize: 100 } },
      { side: 'BUY', quote: { bid: 2.1, ask: 2.3, bidSize: 100, askSize: 100 } },
    ];
    const second = simulateFill({ legs: worse, limit: 1.0, quantity: 3 });
    expect(second.fillPrice).toBeCloseTo(1.4, 2);

    positions = applyFill(positions, second, meta);
    expect(positions[0].quantity).toBe(5);
    // (1.80*2 + 1.40*3) / 5 = 1.56
    expect(positions[0].averagePrice).toBeCloseTo(1.56, 2);
  });

  it('ignores a fill that filled nothing', () => {
    const resting = simulateFill({ legs: TIGHT, limit: 3.0, quantity: 1 });
    expect(applyFill([], resting, meta)).toEqual([]);
  });

  it('does not mutate the array it was given', () => {
    const original: PaperPosition[] = [];
    const fill = simulateFill({ legs: TIGHT, limit: 1.5, quantity: 1 });
    const next = applyFill(original, fill, meta);
    expect(original).toHaveLength(0);
    expect(next).not.toBe(original);
  });

  it('keeps unrelated positions untouched', () => {
    const other: PaperPosition = {
      id: 'other',
      symbol: 'KO',
      label: 'KO 87.5/82.5P',
      quantity: 1,
      averagePrice: 1.5,
      openedAt: '2026-08-01',
    };
    const fill = simulateFill({ legs: TIGHT, limit: 1.5, quantity: 1 });
    const next = applyFill([other], fill, meta);
    expect(next).toHaveLength(2);
    expect(next.find((p) => p.id === 'other')).toEqual(other);
  });
});

describe('paperPnl', () => {
  const position: PaperPosition = {
    id: 'x',
    symbol: 'RKLB',
    label: 'RKLB 82/77P',
    quantity: 2,
    averagePrice: 2.0,
    openedAt: '2026-08-14',
  };

  it('profits as a sold spread gets cheaper to close', () => {
    // Collected 2.00, now costs 1.20 to buy back: 0.80 x 2 x 100.
    expect(paperPnl(position, 1.2)).toBeCloseTo(160, 2);
  });

  it('loses as it gets more expensive', () => {
    expect(paperPnl(position, 3.0)).toBeCloseTo(-200, 2);
  });

  it('is flat at the entry price', () => {
    expect(paperPnl(position, 2.0)).toBe(0);
  });
});
