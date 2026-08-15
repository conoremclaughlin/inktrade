import { describe, it, expect } from 'vitest';
import {
  describeLetf,
  humanizeSector,
  realizedLeverage,
  realizedLeverageAt,
  sectorEntries,
  type LetfHistoryResponse,
  type LetfRegistryWire,
} from './letf.js';

function registry(overrides: Partial<LetfRegistryWire> = {}): LetfRegistryWire {
  return {
    ticker: 'TQQQ',
    leverageFactor: 3,
    direction: 'bull',
    underlyingTicker: 'QQQ',
    underlyingIndex: 'NASDAQ-100',
    issuer: 'ProShares',
    ...overrides,
  };
}

function history(overrides: Partial<LetfHistoryResponse> = {}): LetfHistoryResponse {
  const base: LetfHistoryResponse = {
    symbol: 'TQQQ',
    underlying: 'QQQ',
    leverageFactor: 3,
    period: '1y',
    points: [],
    maxDrawdownPct: 30,
    totalLetfReturn: 30,
    totalUnderlyingReturn: 12,
    totalNaiveReturn: 36,
    totalDivergence: -6,
    ...overrides,
  };
  return base;
}

describe('describeLetf', () => {
  it('names a bull fund by its multiple and index', () => {
    expect(describeLetf(registry())).toBe('3× NASDAQ-100');
  });

  it('carries the sign for an inverse fund', () => {
    expect(describeLetf(registry({ ticker: 'SQQQ', leverageFactor: -3, direction: 'bear' })))
      .toBe('−3× NASDAQ-100');
  });

  it('handles a 2x fund', () => {
    expect(describeLetf(registry({ ticker: 'QLD', leverageFactor: 2 }))).toBe('2× NASDAQ-100');
  });
});

describe('realizedLeverage', () => {
  it('reports the multiple actually delivered', () => {
    // +12% index, +30% fund -> 2.5x, not the 3x on the label.
    const r = realizedLeverage(history());
    expect(r.realized).toBeCloseTo(2.5, 5);
    expect(r.stated).toBe(3);
    expect(r.divergence).toBe(-6);
    expect(r.degenerate).toBe(false);
    expect(r.inverted).toBe(false);
  });

  it('shows leverage BEATING its label in a smooth trend', () => {
    // The counterpoint that keeps this screen honest. Daily reset is not a tax;
    // it compounds. In a steady uptrend with little chop it compounds in your
    // favour, and a screen that only ever shows decay would be selling a
    // different lie from the one it set out to correct.
    const r = realizedLeverage(history({
      totalUnderlyingReturn: 20,
      totalLetfReturn: 72,
      totalNaiveReturn: 60,
      totalDivergence: 12,
    }));
    expect(r.realized).toBeCloseTo(3.6, 5);
    expect(r.realized!).toBeGreaterThan(r.stated);
    expect(r.divergence).toBeGreaterThan(0);
  });

  it('refuses a ratio when the underlying barely moved', () => {
    // +0.3% index: a ratio here measures the denominator, not the fund.
    const r = realizedLeverage(history({
      totalUnderlyingReturn: 0.3,
      totalLetfReturn: 0.7,
      totalNaiveReturn: 0.9,
      totalDivergence: -0.2,
    }));
    expect(r.degenerate).toBe(true);
    expect(r.realized).toBeNull();
    // Divergence still survives — it doesn't divide by anything.
    expect(r.divergence).toBe(-0.2);
  });

  it('holds the ratio at the threshold rather than just past it', () => {
    const at = realizedLeverage(history({
      totalUnderlyingReturn: 1,
      totalLetfReturn: 2.7,
    }));
    expect(at.degenerate).toBe(false);
    expect(at.realized).toBeCloseTo(2.7, 5);

    const under = realizedLeverage(history({ totalUnderlyingReturn: 0.99 }));
    expect(under.degenerate).toBe(true);
  });

  it('treats a working inverse fund as tracking, not inverted', () => {
    // SQQQ: index +12%, fund -25%. Both the realized multiple and the stated
    // one are negative, so the fund did exactly what it says on the tin.
    const r = realizedLeverage(history({
      symbol: 'SQQQ',
      leverageFactor: -3,
      totalUnderlyingReturn: 12,
      totalLetfReturn: -25,
      totalNaiveReturn: -36,
      totalDivergence: 11,
    }));
    expect(r.realized).toBeCloseTo(-25 / 12, 5);
    expect(r.inverted).toBe(false);
  });

  it('flags a bull fund that fell while its index rose', () => {
    const r = realizedLeverage(history({
      totalUnderlyingReturn: 8,
      totalLetfReturn: -4,
      totalNaiveReturn: 24,
      totalDivergence: -28,
    }));
    expect(r.inverted).toBe(true);
    expect(r.realized).toBeLessThan(0);
  });

  it('handles a falling index without calling it inverted', () => {
    // Index -10%, 3x fund -34%. Both negative, ratio positive at 3.4.
    const r = realizedLeverage(history({
      totalUnderlyingReturn: -10,
      totalLetfReturn: -34,
      totalNaiveReturn: -30,
      totalDivergence: -4,
    }));
    expect(r.realized).toBeCloseTo(3.4, 5);
    expect(r.inverted).toBe(false);
  });
});

describe('realizedLeverageAt', () => {
  it('measures a point on the curve, not the whole window', () => {
    // The mismatch found by scrubbing TQQQ's 1Y chart: the window realized
    // 2.50x, but on 2025-10-10 it stood at 2.44x. The headline read the window
    // figure under an "AS OF <date>" label — two periods, one heading.
    const at = realizedLeverageAt(11.0, 4.5, 3, -2.5);
    expect(at.realized).toBeCloseTo(2.444, 2);
    expect(at.divergence).toBe(-2.5);
  });

  it('goes degenerate near the start of a window, where nothing has moved', () => {
    const at = realizedLeverageAt(0.9, 0.4, 3, -0.3);
    expect(at.degenerate).toBe(true);
    expect(at.realized).toBeNull();
  });

  it('agrees with realizedLeverage when handed the window totals', () => {
    const h = history();
    expect(
      realizedLeverageAt(h.totalLetfReturn, h.totalUnderlyingReturn, h.leverageFactor, h.totalDivergence),
    ).toEqual(realizedLeverage(h));
  });
});

describe('sectorEntries', () => {
  it('sorts weightings heaviest first', () => {
    const entries = sectorEntries({ technology: 48.2, healthcare: 6.1, energy: 12.5 });
    expect(entries.map((e) => e.key)).toEqual(['technology', 'energy', 'healthcare']);
  });

  it('drops the zero-weight sectors Yahoo pads the object with', () => {
    const entries = sectorEntries({ technology: 48.2, utilities: 0, energy: 0 });
    expect(entries).toHaveLength(1);
  });

  it('is empty rather than throwing on no data', () => {
    expect(sectorEntries({})).toEqual([]);
  });
});

describe('humanizeSector', () => {
  it('expands the keys Yahoo runs together', () => {
    expect(humanizeSector('realestate')).toBe('Real Estate');
    expect(humanizeSector('consumer_cyclical')).toBe('Consumer Cyclical');
  });

  it('falls back to title case for a key it has never seen', () => {
    expect(humanizeSector('quantum_widgets')).toBe('Quantum Widgets');
  });
});
