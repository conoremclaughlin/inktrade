import { describe, it, expect } from 'vitest';
import {
  RSI_OVERSOLD,
  computeBollinger,
  computeEMA,
  computeMACD,
  computeRSI,
  computeSMA,
  computeVWAP,
  distanceFromLevel,
  warmupBars,
} from './indicators.js';

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

describe('computeRSI', () => {
  /**
   * Wilder's canonical worked example — the series from New Concepts in
   * Technical Trading Systems, whose 14-period RSI is a published value.
   * Checking against a known-good number is the only way to catch a wrong
   * smoothing constant, which otherwise draws a perfectly plausible curve.
   */
  const WILDER = [
    44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08,
    45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41, 46.22, 45.64,
  ];

  it('matches the published value for the canonical series', () => {
    const rsi = computeRSI(WILDER, 14);
    expect(rsi[14]).toBeCloseTo(70.46, 1);
  });

  it('stays flat-lined at 50 for an unchanging series', () => {
    // No gains and no losses is genuinely neutral, and must not divide by zero.
    const rsi = computeRSI(new Array(30).fill(100), 14);
    expect(rsi[20]).toBe(50);
  });

  it('reaches 100 on an unbroken advance without dividing by zero', () => {
    const rising = Array.from({ length: 30 }, (_, i) => 100 + i);
    expect(computeRSI(rising, 14)[20]).toBe(100);
  });

  it('goes low on an unbroken decline', () => {
    const falling = Array.from({ length: 30 }, (_, i) => 200 - i);
    expect(computeRSI(falling, 14)[20]).toBeLessThan(RSI_OVERSOLD);
  });

  it('leaves the warm-up undefined rather than seeding a value', () => {
    // A fabricated leading value draws a line where there is no data.
    const rsi = computeRSI(WILDER, 14);
    expect(rsi.slice(0, 14).every((v) => v === null)).toBe(true);
    expect(rsi[14]).not.toBeNull();
  });

  it('returns all nulls when there is not enough history', () => {
    expect(computeRSI([1, 2, 3], 14).every((v) => v === null)).toBe(true);
  });

  it('differs from a simple-average RSI, which is the common wrong answer', () => {
    // Guards the smoothing itself: a naive mean of gains/losses over the
    // window tracks closely at first and then drifts.
    const closes = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 10 + i * 0.4);
    const wilder = computeRSI(closes, 14)[50] as number;

    let gains = 0;
    let losses = 0;
    for (let i = 37; i <= 50; i++) {
      const change = closes[i] - closes[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    const simple = 100 - 100 / (1 + gains / 14 / (losses / 14));

    expect(Math.abs(wilder - simple)).toBeGreaterThan(0.5);
  });
});

describe('computeMACD', () => {
  const closes = Array.from({ length: 120 }, (_, i) => 100 + Math.sin(i / 8) * 12 + i * 0.3);

  it('is the difference of the fast and slow EMAs', () => {
    const { macd } = computeMACD(closes);
    const fast = computeEMA(closes, 12);
    const slow = computeEMA(closes, 26);
    expect(macd[80]).toBeCloseTo((fast[80] as number) - (slow[80] as number), 10);
  });

  it('derives the signal from the MACD line, not from price', () => {
    // Signalling off price is a frequent mistake that yields a plausible but
    // meaningless histogram.
    const { macd, signal } = computeMACD(closes);
    const firstDefined = macd.findIndex((v) => v !== null);
    const fromMacd = computeEMA(macd.slice(firstDefined) as number[], 9);

    const offset = fromMacd.findIndex((v) => v !== null);
    expect(signal[firstDefined + offset]).toBeCloseTo(fromMacd[offset] as number, 10);

    const fromPrice = computeEMA(closes, 9);
    expect(signal[100]).not.toBeCloseTo(fromPrice[100] as number, 2);
  });

  it('has a histogram equal to macd minus signal', () => {
    const { macd, signal, histogram } = computeMACD(closes);
    for (let i = 0; i < closes.length; i++) {
      if (macd[i] === null || signal[i] === null) {
        expect(histogram[i]).toBeNull();
      } else {
        expect(histogram[i]).toBeCloseTo((macd[i] as number) - (signal[i] as number), 10);
      }
    }
  });

  it('leaves the signal undefined while the MACD line is still warming up', () => {
    const { signal } = computeMACD(closes);
    // Slow EMA needs 26 bars, then the signal EMA needs 9 more.
    expect(signal[30]).toBeNull();
    expect(signal[40]).not.toBeNull();
  });

  it('survives a series shorter than the slow period', () => {
    const { macd, signal, histogram } = computeMACD([1, 2, 3]);
    expect(macd.every((v) => v === null)).toBe(true);
    expect(signal.every((v) => v === null)).toBe(true);
    expect(histogram.every((v) => v === null)).toBe(true);
  });
});

describe('computeVWAP', () => {
  const bar = (date: string, price: number, volume: number) => ({
    date,
    high: price,
    low: price,
    close: price,
    volume,
  });

  it('weights by volume rather than averaging price', () => {
    const vwap = computeVWAP([
      bar('2026-08-05T14:30:00Z', 10, 100),
      bar('2026-08-05T14:31:00Z', 20, 900),
    ]);
    // A plain mean would be 15; the heavy second bar pulls it to 19.
    expect(vwap[1]).toBeCloseTo(19, 6);
  });

  it('resets at the session boundary', () => {
    // Accumulating across days produces a slowly-flattening line that looks
    // like a long-term average and is not VWAP.
    const vwap = computeVWAP([
      bar('2026-08-05T14:30:00Z', 10, 1000),
      bar('2026-08-05T20:00:00Z', 10, 1000),
      bar('2026-08-06T14:30:00Z', 50, 100),
    ]);
    expect(vwap[2]).toBeCloseTo(50, 6);
  });

  it('uses the typical price, not the close', () => {
    const vwap = computeVWAP([
      { date: '2026-08-05', high: 30, low: 10, close: 20, volume: 100 },
    ]);
    expect(vwap[0]).toBeCloseTo(20, 6);
  });

  it('is null before any volume has traded', () => {
    // Zero volume has no weighted average; zero would read as a real price.
    expect(computeVWAP([bar('2026-08-05', 10, 0)])[0]).toBeNull();
  });

  it('ignores a zero-volume bar rather than letting it drag the average', () => {
    const vwap = computeVWAP([bar('2026-08-05', 10, 100), bar('2026-08-05', 999, 0)]);
    expect(vwap[1]).toBeCloseTo(10, 6);
  });
});

describe('distanceFromLevel', () => {
  it('reports how far price sits above a level', () => {
    expect(distanceFromLevel(103.2, 100)).toBeCloseTo(3.2, 6);
  });

  it('is negative below the level', () => {
    expect(distanceFromLevel(96.8, 100)).toBeCloseTo(-3.2, 6);
  });

  it('is null for a level it cannot measure against', () => {
    expect(distanceFromLevel(100, 0)).toBeNull();
    expect(distanceFromLevel(100, Number.NaN)).toBeNull();
  });
});

describe('warmupBars', () => {
  it('asks for several times the period', () => {
    // Verified against Robinhood: RSI-14 was 27.8 points off at the first
    // computable bar and 0.0000 after 250. Starting computation at the left
    // edge of a chart shows a wrong indicator that looks entirely plausible.
    expect(warmupBars(14)).toBe(70);
    expect(warmupBars(50)).toBe(250);
  });

  it('never asks for less than the period itself', () => {
    expect(warmupBars(14, 0)).toBe(15);
  });
});
