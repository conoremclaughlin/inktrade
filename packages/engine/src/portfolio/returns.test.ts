import { describe, it, expect } from 'vitest';
import { computeAlignedReturns, type PricePoint } from './returns.js';

function makeBars(closes: number[], startDate = '2024-01-02'): PricePoint[] {
  return closes.map((close, i) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    return { date: d.toISOString().slice(0, 10), close };
  });
}

describe('computeAlignedReturns', () => {
  it('computes log returns for aligned bars', () => {
    const a = makeBars([100, 110, 121]);
    const b = makeBars([50, 55, 52]);
    const histories = new Map([['A', a], ['B', b]]);

    const { dates, returns } = computeAlignedReturns(histories);

    expect(dates).toHaveLength(2);
    expect(returns.get('A')).toHaveLength(2);
    expect(returns.get('B')).toHaveLength(2);

    const aReturns = returns.get('A')!;
    expect(aReturns[0]).toBeCloseTo(Math.log(110 / 100), 10);
    expect(aReturns[1]).toBeCloseTo(Math.log(121 / 110), 10);
  });

  it('inner-joins on dates, dropping unmatched', () => {
    const a: PricePoint[] = [
      { date: '2024-01-02', close: 100 },
      { date: '2024-01-03', close: 105 },
      { date: '2024-01-04', close: 110 },
    ];
    const b: PricePoint[] = [
      { date: '2024-01-02', close: 50 },
      // missing 01-03
      { date: '2024-01-04', close: 48 },
    ];

    const { dates, returns } = computeAlignedReturns(new Map([['A', a], ['B', b]]));

    // Only date 01-04 has returns for both (A: 01-03→01-04, B: 01-02→01-04)
    // But B's return on 01-04 is computed from 01-02→01-04 (consecutive in B's series)
    // and A has returns on both 01-03 and 01-04
    // The alignment only includes dates where BOTH have a return entry
    expect(dates).toHaveLength(1);
    expect(dates[0]).toBe('2024-01-04');
  });

  it('returns empty for single-bar histories', () => {
    const a = makeBars([100]);
    const b = makeBars([50]);
    const { dates, returns } = computeAlignedReturns(new Map([['A', a], ['B', b]]));

    expect(dates).toHaveLength(0);
    expect(returns.get('A')).toHaveLength(0);
  });

  it('handles empty input', () => {
    const { dates, returns } = computeAlignedReturns(new Map());
    expect(dates).toHaveLength(0);
    expect(returns.size).toBe(0);
  });
});
