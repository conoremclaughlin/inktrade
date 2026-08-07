import { describe, it, expect } from 'vitest';
import {
  atmIndex,
  bookCoverage,
  contractsForExpiry,
  defaultTarget,
  expiryKey,
  hasBook,
  isModelled,
  strikesNearTheMoney,
  type WireOptionContract,
} from './analytics.js';

function wire(overrides: Partial<WireOptionContract> = {}): WireOptionContract {
  return {
    symbol: 'TEST',
    underlying: 'TEST',
    type: 'call',
    strike: 100,
    expiration: '2026-09-18T00:00:00.000Z',
    bid: 4.9,
    ask: 5.1,
    last: 5,
    mark: 5,
    volume: 10,
    openInterest: 100,
    inTheMoney: false,
    daysToExpiration: 42,
    greeks: {
      delta: 0.5,
      gamma: 0.02,
      theta: -0.05,
      vega: 0.2,
      rho: 0.1,
      impliedVolatility: 0.35,
    },
    ...overrides,
  };
}

describe('isModelled', () => {
  it('accepts a contract the provider could value', () => {
    expect(isModelled(wire())).toBe(true);
  });

  it('rejects the all-zero Greeks that mean "couldn\'t value it"', () => {
    // What Yahoo returns when the mark is missing or below intrinsic. Rendering
    // those as 0.000 turns a gap in the data into a claim about the contract.
    const unpriced = wire({
      greeks: { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0, impliedVolatility: 0 },
    });
    expect(isModelled(unpriced)).toBe(false);
  });
});

describe('expiryKey', () => {
  it('reduces a wire timestamp to its ISO day', () => {
    expect(expiryKey('2026-09-18T00:00:00.000Z')).toBe('2026-09-18');
  });

  it('accepts a Date too, so grid and engine shapes key the same', () => {
    expect(expiryKey(new Date('2026-09-18T00:00:00.000Z'))).toBe('2026-09-18');
  });
});

describe('contractsForExpiry', () => {
  const contracts = [
    wire({ strike: 110, expiration: '2026-09-18T00:00:00.000Z' }),
    wire({ strike: 90, expiration: '2026-09-18T00:00:00.000Z' }),
    wire({ strike: 100, expiration: '2026-10-16T00:00:00.000Z' }),
    wire({ strike: 100, expiration: '2026-09-18T00:00:00.000Z' }),
  ];

  it('picks one expiration out of the mixed grid', () => {
    const column = contractsForExpiry(contracts, '2026-09-18');
    expect(column).toHaveLength(3);
  });

  it('returns them ascending by strike', () => {
    const column = contractsForExpiry(contracts, '2026-09-18');
    expect(column.map((c) => c.strike)).toEqual([90, 100, 110]);
  });

  it('is empty for an expiration not in the window', () => {
    expect(contractsForExpiry(contracts, '2027-01-15')).toEqual([]);
  });
});

describe('atmIndex', () => {
  const ladder = [wire({ strike: 80 }), wire({ strike: 90 }), wire({ strike: 100 }), wire({ strike: 110 })];

  it('finds the strike nearest the money', () => {
    expect(atmIndex(ladder, 97)).toBe(2);
  });

  it('works below the listed range', () => {
    expect(atmIndex(ladder, 10)).toBe(0);
  });

  it('works above the listed range', () => {
    expect(atmIndex(ladder, 500)).toBe(3);
  });

  it('returns 0 for an empty ladder rather than -1', () => {
    // -1 would be handed straight to a list as a scroll index.
    expect(atmIndex([], 100)).toBe(0);
  });
});

describe('defaultTarget', () => {
  it('points a call target upward', () => {
    expect(defaultTarget(100, 'call')).toBe(110);
  });

  it('points a put target downward', () => {
    // A put defaulting to +10% would render every number on the screen as a
    // loss, which reads as the calculator being broken rather than the target
    // being backwards.
    expect(defaultTarget(100, 'put')).toBe(90);
  });

  it('honours a custom percentage', () => {
    expect(defaultTarget(200, 'call', 5)).toBe(210);
    expect(defaultTarget(200, 'put', 5)).toBe(190);
  });

  it('rounds to the cent', () => {
    expect(defaultTarget(33.333, 'call')).toBe(36.67);
  });
});

describe('hasBook / bookCoverage', () => {
  it('accepts a contract with either side quoted', () => {
    expect(hasBook(wire({ bid: 4.9, ask: 0 }))).toBe(true);
    expect(hasBook(wire({ bid: 0, ask: 5.1 }))).toBe(true);
  });

  it('rejects an empty book, where the mark is a stale print', () => {
    expect(hasBook(wire({ bid: 0, ask: 0 }))).toBe(false);
  });

  it('measures how much of a ladder is live', () => {
    const ladder = [
      wire({ strike: 90, bid: 1, ask: 2 }),
      wire({ strike: 95, bid: 0, ask: 0 }),
      wire({ strike: 100, bid: 0, ask: 0 }),
      wire({ strike: 105, bid: 0, ask: 0 }),
    ];
    expect(bookCoverage(ladder)).toBe(0.25);
  });

  it('reports 0 for an empty ladder rather than dividing by zero', () => {
    expect(bookCoverage([])).toBe(0);
  });
});

describe('strikesNearTheMoney', () => {
  const ladder = Array.from({ length: 60 }, (_, i) => wire({ strike: 400 + i * 20 }));
  // strikes 400 .. 1580, spot 881

  it('trims a long ladder to the strikes people choose between', () => {
    const near = strikesNearTheMoney(ladder, 881);
    expect(near.length).toBeLessThan(ladder.length);
    for (const c of near) {
      expect(Math.abs(c.strike - 881) / 881).toBeLessThanOrEqual(0.2);
    }
  });

  it('keeps them in strike order', () => {
    const near = strikesNearTheMoney(ladder, 881);
    expect(near.map((c) => c.strike)).toEqual([...near.map((c) => c.strike)].sort((a, b) => a - b));
  });

  it('leaves a short ladder alone', () => {
    const short = [wire({ strike: 100 }), wire({ strike: 110 })];
    expect(strikesNearTheMoney(short, 105)).toHaveLength(2);
  });

  it('widens rather than returning two rows on a coarse ladder', () => {
    // $50 steps around a $100 stock: +-20% is one strike either side.
    const coarse = Array.from({ length: 20 }, (_, i) => wire({ strike: 50 + i * 50 }));
    const near = strikesNearTheMoney(coarse, 100);
    expect(near.length).toBeGreaterThanOrEqual(12);
    expect(near.map((c) => c.strike)).toEqual([...near.map((c) => c.strike)].sort((a, b) => a - b));
  });

  it('returns everything when the spot is unknown', () => {
    expect(strikesNearTheMoney(ladder, 0)).toHaveLength(ladder.length);
  });
});
