import { describe, it, expect } from 'vitest';
import { computeSMA, computeEMA, computeBollinger } from './indicators.js';

const closes = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

describe('computeSMA', () => {
  it('returns null until the period is filled, then the mean', () => {
    const sma = computeSMA(closes, 3);
    expect(sma.slice(0, 2)).toEqual([null, null]);
    expect(sma[2]).toBe(11); // (10+11+12)/3
    expect(sma[9]).toBe(18); // (17+18+19)/3
  });

  it('aligns output length to input', () => {
    expect(computeSMA(closes, 5)).toHaveLength(closes.length);
  });

  it('yields all nulls when the period exceeds the series', () => {
    expect(computeSMA([1, 2], 5)).toEqual([null, null]);
  });
});

describe('computeEMA', () => {
  it('seeds from the SMA at the first computable point', () => {
    const ema = computeEMA(closes, 3);
    expect(ema.slice(0, 2)).toEqual([null, null]);
    expect(ema[2]).toBe(11); // seeded with SMA
  });

  it('reacts faster than an SMA to a recent move', () => {
    // Flat, then a jump. The EMA weights the jump more heavily, so it should
    // sit above the SMA. (On a perfectly linear series the two converge, so a
    // steady ramp would not distinguish them.)
    const jump = [10, 10, 10, 10, 10, 20];
    expect(computeEMA(jump, 3)[5]!).toBeGreaterThan(computeSMA(jump, 3)[5]!);
  });
});

describe('computeBollinger', () => {
  it('places bands symmetrically around the middle band', () => {
    const { middle, upper, lower } = computeBollinger(closes, 3, 2);
    const i = 9;
    expect(upper[i]! - middle[i]!).toBeCloseTo(middle[i]! - lower[i]!, 10);
  });

  it('collapses the bands to the mean when there is no variance', () => {
    const flat = [5, 5, 5, 5, 5];
    const { middle, upper, lower } = computeBollinger(flat, 3, 2);
    expect(upper[4]).toBeCloseTo(5, 10);
    expect(lower[4]).toBeCloseTo(5, 10);
    expect(middle[4]).toBeCloseTo(5, 10);
  });

  it('nulls all three bands before the period fills', () => {
    const { middle, upper, lower } = computeBollinger(closes, 4);
    expect(middle[2]).toBeNull();
    expect(upper[2]).toBeNull();
    expect(lower[2]).toBeNull();
  });
});
