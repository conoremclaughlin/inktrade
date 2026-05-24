import { describe, it, expect } from 'vitest';
import { computeMomentumScore } from './momentum.js';
import type { PricePoint } from './returns.js';

function makeBars(n: number, trend: 'up' | 'down' | 'flat', startPrice = 100): PricePoint[] {
  const bars: PricePoint[] = [];
  const d = new Date('2023-01-02');
  let price = startPrice;

  for (let i = 0; i < n; i++) {
    bars.push({ date: d.toISOString().slice(0, 10), close: price });
    d.setDate(d.getDate() + 1);
    if (trend === 'up') price *= 1.002;
    else if (trend === 'down') price *= 0.998;
    // flat: price stays the same
  }
  return bars;
}

describe('computeMomentumScore', () => {
  it('returns positive score for uptrending stock', () => {
    const bars = makeBars(300, 'up');
    const score = computeMomentumScore(bars);

    expect(score.raw).toBeGreaterThan(0);
  });

  it('returns negative score for downtrending stock', () => {
    const bars = makeBars(300, 'down');
    const score = computeMomentumScore(bars);

    expect(score.raw).toBeLessThan(0);
  });

  it('returns ~0 score for flat stock', () => {
    const bars = makeBars(300, 'flat');
    const score = computeMomentumScore(bars);

    expect(Math.abs(score.raw)).toBeLessThan(1);
  });

  it('returns percentile of 50 when insufficient data', () => {
    const bars = makeBars(100, 'up');
    const score = computeMomentumScore(bars);

    expect(score.percentile).toBe(50);
  });

  it('returns valid percentile with sufficient data', () => {
    const bars = makeBars(400, 'up');
    const score = computeMomentumScore(bars);

    expect(score.percentile).toBeGreaterThanOrEqual(0);
    expect(score.percentile).toBeLessThanOrEqual(100);
  });

  it('handles minimal input gracefully', () => {
    const bars: PricePoint[] = [{ date: '2024-01-01', close: 100 }];
    const score = computeMomentumScore(bars);

    expect(score.raw).toBe(0);
    expect(score.percentile).toBe(50);
  });
});
