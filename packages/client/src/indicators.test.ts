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
  periodLevels,
  findPivots,
  screenOversold,
  supportResistance,
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

describe('periodLevels', () => {
  const bar = (date: string, low: number, high: number) => ({
    date,
    low,
    high,
    close: (low + high) / 2,
  });

  const bars = [
    bar('2024-09-01', 50, 60), // genuinely outside the 52-week window
    bar('2026-01-05', 80, 90),
    bar('2026-06-01', 70, 130),
    bar('2026-08-05', 95, 105),
    bar('2026-08-06', 98, 108), // today
  ];

  it('reads the session from the most recent bar', () => {
    const levels = periodLevels(bars, 100, '2026-08-06');
    expect(levels.find((l) => l.id === 'sessionHigh')?.value).toBe(108);
    expect(levels.find((l) => l.id === 'sessionLow')?.value).toBe(98);
  });

  it('keeps the 52-week window to 52 weeks', () => {
    // The 2025-09-01 bar has the lowest low of all, and must NOT be the
    // 52-week low — otherwise a 5-year chart reports a 5-year low as one.
    const levels = periodLevels(bars, 100, '2026-08-06');
    expect(levels.find((l) => l.id === 'low52')?.value).toBe(70);
    expect(levels.find((l) => l.id === 'high52')?.value).toBe(130);
  });

  it('scopes month and year lows to the calendar period', () => {
    const levels = periodLevels(bars, 100, '2026-08-06');
    expect(levels.find((l) => l.id === 'monthLow')?.value).toBe(95);
    expect(levels.find((l) => l.id === 'ytdLow')?.value).toBe(70);
  });

  it('reports distance, because that is the sentence a trader says', () => {
    const levels = periodLevels(bars, 77, '2026-08-06');
    // 77 against a 70 low is +10%.
    expect(levels.find((l) => l.id === 'low52')?.distancePercent).toBeCloseTo(10, 6);
  });

  it('falls back to the whole series when nothing is inside the window', () => {
    const old = [bar('2020-01-01', 10, 20)];
    const levels = periodLevels(old, 15, '2026-08-06');
    // Better a level from stale bars, labelled, than no level at all.
    expect(levels.find((l) => l.id === 'low52')?.value).toBe(10);
  });

  it('returns nothing rather than throwing on an empty series', () => {
    expect(periodLevels([], 100, '2026-08-06')).toEqual([]);
  });
});

describe('screenOversold', () => {
  /** A series that ends deeply oversold: one long slide. */
  const falling = (start: number, n = 60) =>
    Array.from({ length: n }, (_, i) => {
      const close = start - i;
      return { date: isoDay(i), high: close + 1, low: close - 1, close };
    });

  /** A series that ends strong. */
  const rising = (start: number, n = 60) =>
    Array.from({ length: n }, (_, i) => {
      const close = start + i;
      return { date: isoDay(i), high: close + 1, low: close - 1, close };
    });

  function isoDay(i: number): string {
    return new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
  }

  it('finds the falling symbol and leaves the rising one out', () => {
    const out = screenOversold([
      { symbol: 'DOWN', price: 41, bars: falling(100) },
      { symbol: 'UP', price: 159, bars: rising(100) },
    ]);

    expect(out.map((c) => c.symbol)).toEqual(['DOWN']);
    expect(out[0].oversold).toBe(true);
  });

  it('keeps the two signals separate rather than collapsing them to a score', () => {
    // A screener you can't interrogate is one you won't trust with money.
    const [candidate] = screenOversold([{ symbol: 'DOWN', price: 41, bars: falling(100) }]);
    expect(candidate).toMatchObject({
      oversold: expect.any(Boolean),
      nearLow: expect.any(Boolean),
    });
    expect(candidate.rsi).not.toBeNull();
  });

  it('qualifies on nearness alone, without being oversold', () => {
    // A slow bleed to the lows that never triggers RSI is still worth seeing.
    const flat = Array.from({ length: 60 }, (_, i) => ({
      date: isoDay(i),
      high: 101,
      low: 100,
      close: 100,
    }));
    const [candidate] = screenOversold([{ symbol: 'FLAT', price: 100, bars: flat }]);
    expect(candidate.nearLow).toBe(true);
    expect(candidate.oversold).toBe(false);
  });

  it('sorts most oversold first', () => {
    const out = screenOversold([
      { symbol: 'MILD', price: 71, bars: falling(100).slice(0, 30) },
      { symbol: 'DEEP', price: 41, bars: falling(100) },
    ]);
    expect(out[0].rsi! <= out[1].rsi!).toBe(true);
  });

  it('puts unknown RSI last rather than treating it as zero', () => {
    // Too few bars to compute RSI. Sorting it as 0 would rank "we don't know"
    // as the most oversold thing on the screen.
    const out = screenOversold([
      { symbol: 'SHORT', price: 100, bars: [{ date: '2026-01-01', high: 101, low: 100, close: 100 }] },
      { symbol: 'DEEP', price: 41, bars: falling(100) },
    ]);
    expect(out[out.length - 1].symbol).toBe('SHORT');
  });

  it('returns nothing for an empty input', () => {
    expect(screenOversold([])).toEqual([]);
  });
});

describe('screenOversold — nearness is measured against the 52-week low', () => {
  function isoDay(i: number): string {
    return new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
  }

  it('does not call a stock at its 52-week high "near the lows"', () => {
    // Early in a calendar month the month low IS the last day or two's low, so
    // including it made every symbol qualify — a stock making new highs most
    // of all, which is the exact opposite of the setup.
    const rising = Array.from({ length: 60 }, (_, i) => {
      const close = 100 + i;
      return { date: isoDay(i), high: close + 1, low: close - 1, close };
    });

    const out = screenOversold([{ symbol: 'UP', price: 159, bars: rising }]);
    expect(out).toEqual([]);
  });
});

describe('findPivots', () => {
  const bars = (highs: number[]) =>
    highs.map((h, i) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, high: h, low: h - 1 }));

  it('finds a turn, not just the tallest bar so far', () => {
    // 100 is the peak of a tent — higher than everything within the window on
    // BOTH sides, which is what makes it a turn.
    const series = bars([90, 92, 95, 97, 99, 100, 99, 97, 95, 92, 90]);
    const highs = findPivots(series, 5).filter((p) => p.kind === 'high');
    expect(highs).toHaveLength(1);
    expect(highs[0].price).toBe(100);
  });

  it('does not call the newest bar of a rally a pivot', () => {
    // A steady climb: the last bar is the highest, but nothing has turned. If
    // this counted, every rally would be reported as blocked by resistance.
    const series = bars([90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100]);
    expect(findPivots(series, 5).filter((p) => p.kind === 'high')).toHaveLength(0);
  });

  it('cannot see pivots inside the window at either edge', () => {
    // The right side of a recent bar hasn't happened yet, so it can't be known
    // to be a turn. Honest rather than unfortunate.
    const series = bars([100, 90, 90, 90, 90, 90, 90, 90, 90, 90, 100]);
    expect(findPivots(series, 5)).toHaveLength(0);
  });
});

describe('supportResistance', () => {
  /** A market that bounces between 100 and 120 three times, ending at 110. */
  function oscillating() {
    const shape = [110, 104, 100, 104, 110, 116, 120, 116, 110, 104, 100, 104, 110, 116, 120, 116, 110, 104, 100, 104, 110, 116, 120, 116, 110];
    return shape.map((close, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      high: close + 0.2,
      low: close - 0.2,
      close,
    }));
  }

  it('finds the floor below and the ceiling above', () => {
    const levels = supportResistance(oscillating(), 110, { window: 2 });

    const support = levels.filter((l) => l.kind === 'support');
    const resistance = levels.filter((l) => l.kind === 'resistance');

    expect(support.length).toBeGreaterThan(0);
    expect(resistance.length).toBeGreaterThan(0);
    expect(support[0].price).toBeCloseTo(99.8, 0);
    expect(resistance[0].price).toBeCloseTo(120.2, 0);
  });

  it('counts repeated visits as strength', () => {
    // The floor is touched three times in this series, and one touch is a
    // coincidence rather than a level.
    const [support] = supportResistance(oscillating(), 110, { window: 2 });
    expect(support.touches).toBeGreaterThanOrEqual(2);
  });

  it('ignores a price only ever visited once', () => {
    const once = [
      ...oscillating(),
      { date: '2026-02-01', high: 200, low: 199, close: 199.5 },
      ...oscillating().map((b, i) => ({ ...b, date: `2026-03-${String(i + 1).padStart(2, '0')}` })),
    ];
    const levels = supportResistance(once, 110, { window: 2 });
    expect(levels.some((l) => l.price > 150)).toBe(false);
  });

  it('drops levels price is already sitting on', () => {
    // A level at the current price describes now; it does not predict where
    // price might stop.
    const levels = supportResistance(oscillating(), 120, { window: 2, tolerancePercent: 3 });
    expect(levels.every((l) => Math.abs(l.distancePercent) > 3)).toBe(true);
  });

  it('clusters proportionally, so $1 means different things at $3 and $1000', () => {
    const cheap = [98, 100, 98, 100.5, 98, 100.2, 98].flatMap((p, i) =>
      Array.from({ length: 3 }, (_, j) => ({
        date: `2026-01-${String(i * 3 + j + 1).padStart(2, '0')}`,
        high: p + (j === 1 ? 0.3 : -0.5),
        low: p - (j === 1 ? 0.5 : 0.1),
        close: p,
      })),
    );
    const levels = supportResistance(cheap, 99, { window: 1, tolerancePercent: 1.5 });
    // 100, 100.5 and 100.2 are within 1.5% of each other and must be one level.
    expect(levels.filter((l) => l.price > 99 && l.price < 102).length).toBeLessThanOrEqual(1);
  });

  it('returns nothing rather than throwing on a short or broken series', () => {
    expect(supportResistance([], 100)).toEqual([]);
    expect(supportResistance(oscillating(), 0)).toEqual([]);
    expect(supportResistance(oscillating(), Number.NaN)).toEqual([]);
  });
});

describe('supportResistance — distance cap', () => {
  it('drops levels too far away to act on', () => {
    // Found against live MU, which ran from ~$113 to ~$881 in a year. The
    // method reported "support" at $113 — 87% below price. By the time price
    // returned there it would be a different market, and the level would carry
    // none of the meaning that made it one.
    const climb = Array.from({ length: 120 }, (_, i) => {
      // A staircase: repeated pauses that each form a real level, far apart.
      const base = 100 + Math.floor(i / 20) * 200;
      const wobble = i % 20 < 10 ? 0 : 4;
      const close = base + wobble;
      return {
        date: `2026-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
        high: close + 1,
        low: close - 1,
        close,
      };
    });

    const price = climb[climb.length - 1].close;
    const levels = supportResistance(climb, price, { window: 3 });

    expect(levels.every((l) => Math.abs(l.distancePercent) <= 25)).toBe(true);
  });

  it('respects a caller-supplied cap', () => {
    const climb = Array.from({ length: 120 }, (_, i) => {
      const close = 100 + i * 5;
      return { date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`, high: close + 1, low: close - 1, close };
    });
    const price = climb[climb.length - 1].close;
    expect(
      supportResistance(climb, price, { window: 3, maxDistancePercent: 5 }).every(
        (l) => Math.abs(l.distancePercent) <= 5,
      ),
    ).toBe(true);
  });
});
