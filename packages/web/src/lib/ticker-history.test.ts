import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/*
 * Yahoo is mocked at the module boundary so these run offline and
 * deterministically. What is under test is the windowing, the baseline and the
 * annualisation — none of which depend on the network, and all of which were
 * silently wrong until 2026-08-13.
 */
const chart = vi.fn();
vi.mock('yahoo-finance2', () => ({
  default: class {
    chart = chart;
  },
}));

const { getTickerHistory, PERIOD_TO_DAYS } = await import('./ticker-history.js');

/** Today, pinned. Every window below is measured back from here. */
const TODAY = new Date('2026-08-13T20:00:00Z');

interface Bar {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Weekday bars from `from` to today, priced by a caller-supplied function.
 *
 * Weekdays only, because the trading-day arithmetic (252 bars a year) is part
 * of what is being asserted.
 */
function bars(from: string, priceAt: (day: string, i: number) => number): Bar[] {
  const out: Bar[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date('2026-08-13T00:00:00Z');
  let i = 0;

  while (cursor <= end) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      const day = cursor.toISOString().slice(0, 10);
      const close = priceAt(day, i);
      out.push({ date: new Date(cursor), open: close, high: close, low: close, close, volume: 1000 });
      i += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/** Yahoo returns everything from period1 onward; the lib does the trimming. */
function serve(all: Bar[]) {
  chart.mockImplementation(async (_symbol: string, opts: { period1: string }) => ({
    quotes: all.filter((b) => b.date.toISOString().slice(0, 10) >= opts.period1),
  }));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
  chart.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('period windows are distinct — the regression that motivated this', () => {
  /*
   * PERIOD_TO_DAYS was keyed '1m'/'3m'/'6m' while every caller sends
   * '1mo'/'3mo'/'6mo'. Three of six periods missed the lookup, fell through to
   * the 365-day default, and served a year of bars. Measured on NVDA before
   * the fix, 1mo/3mo/6mo/1y returned byte-identical series.
   */
  it('keys match what callers actually send', () => {
    for (const key of ['1mo', '3mo', '6mo', '1y', '2y', '5y']) {
      expect(PERIOD_TO_DAYS[key], `${key} must be a known period`).toBeDefined();
    }
  });

  it('returns a different window for every period', async () => {
    serve(bars('2020-01-01', (_d, i) => 100 + i * 0.05));

    const results = await Promise.all(
      ['1mo', '3mo', '6mo', '1y', '2y'].map((p) => getTickerHistory('TEST', p)),
    );
    const counts = results.map((r) => r.points.length);

    // Strictly increasing: no two periods may return the same series.
    for (let i = 1; i < counts.length; i += 1) {
      expect(counts[i]).toBeGreaterThan(counts[i - 1]);
    }
  });

  it('gives roughly a month of trading days for 1mo, not a year', async () => {
    serve(bars('2020-01-01', (_d, i) => 100 + i * 0.05));
    const r = await getTickerHistory('TEST', '1mo');
    expect(r.points.length).toBeGreaterThan(15);
    expect(r.points.length).toBeLessThan(28);
  });

  it('gives about a trading year for 1y', async () => {
    serve(bars('2020-01-01', (_d, i) => 100 + i * 0.05));
    const r = await getTickerHistory('TEST', '1y');
    expect(r.points.length).toBeGreaterThan(240);
    expect(r.points.length).toBeLessThan(265);
  });

  it('falls back to a year for an unrecognised period rather than throwing', async () => {
    serve(bars('2020-01-01', (_d, i) => 100 + i * 0.05));
    const r = await getTickerHistory('TEST', 'nonsense');
    expect(r.points.length).toBeGreaterThan(240);
  });
});

describe('the baseline is the bar BEFORE the window', () => {
  it('measures from the prior close, not the first bar inside', async () => {
    // Flat at 100 until the window opens, then a single step to 110.
    serve(
      bars('2025-01-01', (day) => (day < '2026-07-14' ? 100 : 110)),
    );
    const r = await getTickerHistory('TEST', '1mo');
    // Measured from the 100 outside the window, the move is 10%. Measured from
    // the first bar inside it, the move would be zero — the whole point.
    expect(r.totalReturn).toBeCloseTo(10, 1);
  });

  it('puts the turn-of-year gap inside the YTD number', async () => {
    // 100 through the end of 2025, gaps to 120 on the first session of 2026.
    serve(bars('2024-01-01', (day) => (day < '2026-01-01' ? 100 : 120)));
    const r = await getTickerHistory('TEST', 'ytd');
    expect(r.totalReturn).toBeCloseTo(20, 1);
  });

  it('starts the YTD series in January', async () => {
    serve(bars('2024-01-01', (_d, i) => 100 + i * 0.01));
    const r = await getTickerHistory('TEST', 'ytd');
    expect(r.points[0].date >= '2026-01-01').toBe(true);
    expect(r.points[0].date < '2026-01-08').toBe(true);
  });

  it('measures a symbol that listed mid-window from its own first session', async () => {
    // No bar exists before the window, so there is nothing to measure from
    // except the first one it has.
    serve(bars('2026-07-20', (_d, i) => 100 + i));
    const r = await getTickerHistory('TEST', '1mo');
    expect(r.points[0].cumReturn).toBe(0);
    expect(r.totalReturn).toBeGreaterThan(0);
  });
});

describe('derived figures', () => {
  it('annualises from the bars returned, not the period label', async () => {
    // Doubling over one year annualises to roughly 100%.
    //
    // Not exactly: this fixture emits every weekday, ~261 a year, where the
    // 252 convention already discounts market holidays. Real Yahoo data lands
    // near 252 — the drift here is the fixture's, and asserting an exact
    // figure would be asserting that markets never close.
    serve(bars('2024-01-01', (day) => (day < '2025-08-13' ? 100 : 200)));
    const r = await getTickerHistory('TEST', '1y');
    expect(r.totalReturn).toBeCloseTo(100, 0);
    expect(r.annualizedReturn).toBeGreaterThan(90);
    expect(r.annualizedReturn).toBeLessThan(110);
  });

  it('does not overstate the rate on a short window', async () => {
    // A 10% month must not be reported as a 10% year.
    serve(bars('2025-01-01', (day) => (day < '2026-07-14' ? 100 : 110)));
    const r = await getTickerHistory('TEST', '1mo');
    expect(r.annualizedReturn).toBeGreaterThan(r.totalReturn);
  });

  it('measures drawdown from the running peak', async () => {
    // Up to 120, down to 90: a 25% drawdown from the peak.
    serve(
      bars('2025-01-01', (day) => {
        if (day < '2026-07-14') return 100;
        if (day < '2026-08-01') return 120;
        return 90;
      }),
    );
    const r = await getTickerHistory('TEST', '1mo');
    expect(r.maxDrawdownPct).toBeCloseTo(25, 0);
  });

  it('substitutes the close when Yahoo omits OHLC on a bar', async () => {
    const all = bars('2025-01-01', () => 100);
    // A real gap in Yahoo's data: close present, the rest missing.
    const holed = all.map((b, i) =>
      i === all.length - 2 ? { ...b, open: undefined, high: undefined, low: undefined } : b,
    );
    serve(holed as never);
    const r = await getTickerHistory('TEST', '1mo');
    const bar = r.points.at(-2)!;
    // The bar survives rather than being dropped, priced at its close.
    expect(bar.open).toBe(bar.close);
    expect(bar.high).toBe(bar.close);
  });
});

describe('failure modes', () => {
  it('refuses a series too short to measure anything', async () => {
    chart.mockResolvedValue({ quotes: [{ date: new Date('2026-08-12'), close: 100 }] });
    await expect(getTickerHistory('TEST', '1y')).rejects.toThrow('Insufficient historical data');
  });

  it('drops bars with no date or no close rather than pricing off a null', async () => {
    const good = bars('2026-01-01', () => 100);
    chart.mockResolvedValue({
      quotes: [...good, { date: null, close: 5 }, { date: new Date('2026-08-13'), close: null }],
    });
    const r = await getTickerHistory('TEST', 'ytd');
    for (const p of r.points) {
      expect(p.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isFinite(p.close)).toBe(true);
    }
  });

  it('asks Yahoo for a window wider than the one requested', async () => {
    // The extra week is what guarantees a bar before the window to measure
    // from; without it the baseline silently becomes the first bar inside.
    serve(bars('2020-01-01', () => 100));
    await getTickerHistory('TEST', '1mo');
    const asked = chart.mock.calls[0][1].period1;
    expect(asked < '2026-07-14').toBe(true);
  });
});
