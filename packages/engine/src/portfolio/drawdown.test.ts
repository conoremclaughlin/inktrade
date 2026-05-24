import { describe, it, expect } from 'vitest';
import { computeDrawdownSeries, analyzeDrawdowns } from './drawdown.js';
import type { PricePoint } from './returns.js';

function makeBars(closes: number[], startDate = '2024-01-02'): PricePoint[] {
  return closes.map((close, i) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    return { date: d.toISOString().slice(0, 10), close };
  });
}

describe('computeDrawdownSeries', () => {
  it('returns 0% drawdown at all-time-high', () => {
    const bars = makeBars([100, 105, 110, 115, 120]);
    const series = computeDrawdownSeries(bars);

    series.forEach(point => {
      expect(point.drawdownPct).toBeCloseTo(0, 10);
    });
  });

  it('computes correct drawdown from peak', () => {
    const bars = makeBars([100, 120, 96, 108, 84]);
    const series = computeDrawdownSeries(bars);

    // After peak of 120:
    // 96 → -20%
    // 108 → -10%
    // 84 → -30%
    expect(series[0].drawdownPct).toBeCloseTo(0, 10);
    expect(series[1].drawdownPct).toBeCloseTo(0, 10);
    expect(series[2].drawdownPct).toBeCloseTo(-20, 10);
    expect(series[3].drawdownPct).toBeCloseTo(-10, 10);
    expect(series[4].drawdownPct).toBeCloseTo(-30, 10);
  });

  it('resets after new high', () => {
    const bars = makeBars([100, 90, 110, 99]);
    const series = computeDrawdownSeries(bars);

    expect(series[1].drawdownPct).toBeCloseTo(-10, 10);
    expect(series[2].drawdownPct).toBeCloseTo(0, 10); // new high
    expect(series[3].drawdownPct).toBeCloseTo(-10, 10); // from 110 peak
  });
});

describe('analyzeDrawdowns', () => {
  it('computes max and current drawdown per ticker', () => {
    const a = makeBars([100, 120, 84, 108, 110]); // max dd: -30% (120→84)
    const b = makeBars([50, 55, 50, 48, 52]);      // max dd: ~-12.7% (55→48)

    const result = analyzeDrawdowns(new Map([['A', a], ['B', b]]));

    const tickerA = result.tickers.find(t => t.symbol === 'A')!;
    const tickerB = result.tickers.find(t => t.symbol === 'B')!;

    expect(tickerA.max).toBeCloseTo(-30, 1);
    expect(tickerA.current).toBeCloseTo(-8.33, 0); // 110 vs peak 120
    expect(tickerB.max).toBeCloseTo(-12.7, 0);
  });

  it('detects overlapping drawdowns (>5%)', () => {
    // Both in >5% drawdown on same dates
    const a = makeBars([100, 110, 100, 95, 93, 110]);
    const b = makeBars([50, 55, 50, 48, 46, 55]);

    const result = analyzeDrawdowns(new Map([['A', a], ['B', b]]));

    // Dates where both are >5% below peak
    // A peak=110: 95/110=-13.6%, 93/110=-15.5%
    // B peak=55: 48/55=-12.7%, 46/55=-16.4%
    const overlapDates = result.overlaps.map(o => o.date);
    expect(overlapDates.length).toBeGreaterThanOrEqual(2);

    for (const overlap of result.overlaps) {
      expect(overlap.tickersInDrawdown).toContain('A');
      expect(overlap.tickersInDrawdown).toContain('B');
      expect(overlap.avgDrawdown).toBeLessThan(-5);
    }
  });

  it('no overlaps when only one ticker draws down', () => {
    const a = makeBars([100, 50, 25]); // deep drawdown
    const b = makeBars([100, 110, 120]); // only going up

    const result = analyzeDrawdowns(new Map([['A', a], ['B', b]]));

    expect(result.overlaps).toHaveLength(0);
  });
});
