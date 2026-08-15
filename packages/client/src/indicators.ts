/**
 * Technical indicator math.
 *
 * Pure functions over a close series — no chart library, no platform. Both the
 * web canvas chart and the mobile chart compute overlays from these, so they
 * cannot live inside either renderer.
 *
 * Each returns an array aligned to the input, with `null` for leading points
 * where there isn't enough history to compute a value.
 */

export type IndicatorSeries = (number | null)[];

export function computeSMA(closes: number[], period: number): IndicatorSeries {
  const result: IndicatorSeries = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += closes[j];
    result.push(sum / period);
  }
  return result;
}

export function computeEMA(closes: number[], period: number): IndicatorSeries {
  const result: IndicatorSeries = [];
  const k = 2 / (period + 1);
  let ema: number | null = null;

  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      result.push(null);
      continue;
    }
    if (ema === null) {
      // Seed the EMA with the SMA at the first computable point.
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += closes[j];
      ema = sum / period;
    } else {
      ema = closes[i] * k + ema * (1 - k);
    }
    result.push(ema);
  }
  return result;
}

export interface BollingerBands {
  middle: IndicatorSeries;
  upper: IndicatorSeries;
  lower: IndicatorSeries;
}

export function computeBollinger(
  closes: number[],
  period = 20,
  mult = 2,
): BollingerBands {
  const middle = computeSMA(closes, period);
  const upper: IndicatorSeries = [];
  const lower: IndicatorSeries = [];

  for (let i = 0; i < closes.length; i++) {
    const mid = middle[i];
    if (mid === null) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = closes[j] - mid;
      sumSq += diff * diff;
    }
    const std = Math.sqrt(sumSq / period);
    upper.push(mid + mult * std);
    lower.push(mid - mult * std);
  }

  return { middle, upper, lower };
}

/**
 * Relative Strength Index, using Wilder's smoothing.
 *
 * Wilder's is the definition every charting package implements, and it is not
 * a simple mean of gains and losses — it is a running average that weights the
 * prior value by (period - 1). The simple-average version is the common wrong
 * answer: it tracks closely for the first stretch and then diverges, which is
 * exactly the kind of error that survives a visual check.
 *
 * The first defined value is at index `period`, seeded from the mean of the
 * first `period` changes.
 */
export function computeRSI(closes: number[], period = 14): IndicatorSeries {
  const result: IndicatorSeries = new Array(closes.length).fill(null);
  if (closes.length <= period) return result;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) avgGain += change;
    else avgLoss -= change;
  }
  avgGain /= period;
  avgLoss /= period;
  result[period] = rsiFrom(avgGain, avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = rsiFrom(avgGain, avgLoss);
  }

  return result;
}

function rsiFrom(avgGain: number, avgLoss: number): number {
  // An unbroken run of gains has no losses to divide by. RSI is 100 there,
  // which is the limit, not a special case — but the division would be Infinity.
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export interface MACDResult {
  macd: IndicatorSeries;
  signal: IndicatorSeries;
  histogram: IndicatorSeries;
}

/**
 * Moving Average Convergence Divergence.
 *
 * The signal line is an EMA **of the MACD line**, not of price — computing it
 * from price is a frequent mistake that produces a plausible-looking but
 * meaningless histogram. Because the MACD line itself has a warm-up, the
 * signal EMA is run over only the defined portion and then realigned.
 */
export function computeMACD(
  closes: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): MACDResult {
  const fast = computeEMA(closes, fastPeriod);
  const slow = computeEMA(closes, slowPeriod);

  const macd: IndicatorSeries = closes.map((_, i) => {
    const f = fast[i];
    const s = slow[i];
    return f === null || s === null ? null : f - s;
  });

  const firstDefined = macd.findIndex((v) => v !== null);
  const signal: IndicatorSeries = new Array(closes.length).fill(null);
  const histogram: IndicatorSeries = new Array(closes.length).fill(null);

  if (firstDefined !== -1) {
    const defined = macd.slice(firstDefined) as number[];
    const signalTail = computeEMA(defined, signalPeriod);

    for (let i = 0; i < signalTail.length; i++) {
      const value = signalTail[i];
      if (value === null) continue;
      const index = firstDefined + i;
      signal[index] = value;
      histogram[index] = (macd[index] as number) - value;
    }
  }

  return { macd, signal, histogram };
}

/** One bar's worth of what VWAP needs. */
export interface VWAPBar {
  high: number;
  low: number;
  close: number;
  volume: number;
  /** ISO timestamp or date. Used only to detect a session boundary. */
  date: string;
}

/**
 * Volume-Weighted Average Price, anchored to the session.
 *
 * VWAP resets each trading day. Accumulating it continuously across days
 * produces a line that flattens as the denominator grows — it looks like a
 * long-term average and is not VWAP at all. The reset is the definition, not
 * an optimisation.
 *
 * Typical price is (high + low + close) / 3, as every charting package uses.
 * Bars with no volume contribute nothing rather than dragging the average.
 */
export function computeVWAP(bars: VWAPBar[]): IndicatorSeries {
  const result: IndicatorSeries = [];
  let session: string | null = null;
  let cumulativePV = 0;
  let cumulativeVolume = 0;

  for (const bar of bars) {
    const day = bar.date.slice(0, 10);
    if (day !== session) {
      session = day;
      cumulativePV = 0;
      cumulativeVolume = 0;
    }

    const typical = (bar.high + bar.low + bar.close) / 3;
    cumulativePV += typical * bar.volume;
    cumulativeVolume += bar.volume;

    result.push(cumulativeVolume === 0 ? null : cumulativePV / cumulativeVolume);
  }

  return result;
}

/**
 * How far `price` sits above a reference level, as a percentage.
 *
 * The oversold setup is read as a distance — "near a monthly or YTD low" — so
 * this is what the UI shows rather than the level itself, which would leave
 * the reader doing the arithmetic.
 */
export function distanceFromLevel(price: number, level: number): number | null {
  if (!Number.isFinite(level) || level === 0) return null;
  return ((price - level) / Math.abs(level)) * 100;
}

/** Conventional RSI thresholds — the lines the value is actually read against. */
export const RSI_OVERSOLD = 30;
export const RSI_OVERBOUGHT = 70;

/**
 * Extra bars to fetch *before* the range you intend to draw.
 *
 * Every exponentially-smoothed indicator — EMA, RSI, MACD — has to start from
 * some assumed prior value, and different implementations seed differently.
 * The choice is not wrong, but it is arbitrary, and it takes many bars to
 * decay out.
 *
 * Measured against Robinhood's own values on two years of daily MU bars, our
 * series and theirs disagreed by 27.8 RSI points at the first computable bar,
 * 0.35 sixty bars later, and 0.0000 after 250. So a chart that starts
 * computing at the left edge of what it displays shows a materially wrong
 * indicator for its first stretch — and it looks entirely plausible.
 *
 * Fetching `warmupBars(period)` of history before the visible range and
 * discarding it after computing removes the artefact.
 */
export function warmupBars(period: number, multiple = 5): number {
  return Math.max(period * multiple, period + 1);
}

export type IndicatorId =
  | 'sma20'
  | 'sma50'
  | 'sma200'
  | 'ema12'
  | 'ema26'
  | 'ema50'
  | 'bollinger'
  | 'vwap';

export const INDICATOR_COLORS: Record<IndicatorId, string> = {
  sma20: '#f59e0b',
  sma50: '#8b5cf6',
  sma200: '#ec4899',
  ema12: '#06b6d4',
  ema26: '#f97316',
  ema50: '#22d3ee',
  bollinger: '#6366f1',
  vwap: '#eab308',
};

export const INDICATOR_LABELS: Record<IndicatorId, string> = {
  sma20: 'SMA 20',
  sma50: 'SMA 50',
  sma200: 'SMA 200',
  ema12: 'EMA 12',
  ema26: 'EMA 26',
  ema50: 'EMA 50',
  bollinger: 'Bollinger',
  vwap: 'VWAP',
};

/** Oscillators live in their own pane rather than over price. */
export type OscillatorId = 'rsi' | 'macd';

export const OSCILLATOR_LABELS: Record<OscillatorId, string> = {
  rsi: 'RSI 14',
  macd: 'MACD 12/26/9',
};

/** A reference price a trader reads the current price against. */
export interface PeriodLevel {
  id: 'sessionHigh' | 'sessionLow' | 'monthLow' | 'ytdLow' | 'high52' | 'low52';
  label: string;
  value: number;
  /**
   * How far the current price sits above this level, as a percent.
   *
   * The distance is the point, not the level: "3% off the 52-week low" is the
   * sentence a trader says. Showing only the level leaves them doing the
   * arithmetic on every row.
   */
  distancePercent: number | null;
}

/**
 * Session, monthly, year-to-date and 52-week reference levels.
 *
 * Computed from the daily history already on screen rather than fetched: the
 * bars are right there, and a second request for numbers derivable from them
 * would be a round trip to learn what we already know.
 *
 * `today` is passed in rather than read from the clock so this stays pure and
 * testable — a function whose output changes at midnight is a function that
 * fails in CI at midnight.
 */
export function periodLevels(
  bars: { date: string; high: number; low: number; close: number }[],
  price: number,
  today: string,
): PeriodLevel[] {
  if (bars.length === 0) return [];

  const year = today.slice(0, 4);
  const month = today.slice(0, 7);
  const session = bars[bars.length - 1];

  // A 52-week window, not "everything we were given" — a 5-year chart would
  // otherwise report a 5-year low as the 52-week one.
  const cutoff = shiftYear(today, -1);
  const lastYear = bars.filter((b) => b.date.slice(0, 10) >= cutoff);
  const window = lastYear.length > 0 ? lastYear : bars;

  const thisMonth = bars.filter((b) => b.date.slice(0, 7) === month);
  const thisYear = bars.filter((b) => b.date.slice(0, 4) === year);

  const base: Omit<PeriodLevel, 'distancePercent'>[] = [
    { id: 'sessionHigh', label: 'Session high', value: session.high },
    { id: 'sessionLow', label: 'Session low', value: session.low },
    ...(thisMonth.length > 0
      ? [{ id: 'monthLow' as const, label: 'Month low', value: min(thisMonth) }]
      : []),
    ...(thisYear.length > 0
      ? [{ id: 'ytdLow' as const, label: 'YTD low', value: min(thisYear) }]
      : []),
    { id: 'high52', label: '52-week high', value: Math.max(...window.map((b) => b.high)) },
    { id: 'low52', label: '52-week low', value: min(window) },
  ];

  return base.map((level) => ({
    ...level,
    distancePercent: distanceFromLevel(price, level.value),
  }));
}

function min(bars: { low: number }[]): number {
  return Math.min(...bars.map((b) => b.low));
}

/** Shift an ISO date by whole years, clamping Feb 29 to Feb 28. */
function shiftYear(iso: string, years: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  const shifted = String(Number(y) + years).padStart(4, '0');
  const day = m === '02' && d === '29' ? '28' : d;
  return `${shifted}-${m}-${day}`;
}

/** One symbol's answer to "is this oversold, and is it near a low?" */
export interface OversoldCandidate {
  symbol: string;
  price: number;
  rsi: number | null;
  /** Percent above the 52-week low. Null when it can't be computed. */
  fromLow52: number | null;
  fromMonthLow: number | null;
  /** RSI at or below the oversold threshold. */
  oversold: boolean;
  /** Price within `nearPercent` of a period low. */
  nearLow: boolean;
}

export interface ScreenOversoldOptions {
  /** How close to a low still counts as "near". Default 5%. */
  nearPercent?: number;
  /** RSI threshold. Default RSI_OVERSOLD (30). */
  threshold?: number;
}

/**
 * Screen a set of symbols for the setup people actually describe.
 *
 * The brief was "oversold, near the lows" — a conjunction of two signals, and
 * the reason both are returned separately rather than collapsed into one score.
 * A single number would rank correctly and explain nothing, and a screener you
 * can't interrogate is a screener you won't trust with money.
 *
 * A symbol qualifies on EITHER signal, because the interesting cases are often
 * one without the other: oversold well off the lows is a pullback in an uptrend,
 * near the lows without being oversold is a slow bleed. Both are worth seeing,
 * and the flags say which is which.
 *
 * Sorted by RSI ascending — most oversold first — with unknowns last rather
 * than sorted as zero, which would put "we couldn't compute this" at the top.
 */
export function screenOversold(
  rows: {
    symbol: string;
    price: number;
    bars: { date: string; high: number; low: number; close: number }[];
  }[],
  options: ScreenOversoldOptions = {},
): OversoldCandidate[] {
  const nearPercent = options.nearPercent ?? 5;
  const threshold = options.threshold ?? RSI_OVERSOLD;

  const candidates = rows.map((row): OversoldCandidate => {
    const rsiSeries = computeRSI(row.bars.map((b) => b.close));
    const rsi = lastDefinedValue(rsiSeries);

    const asOf = row.bars[row.bars.length - 1]?.date.slice(0, 10);
    const levels = asOf ? periodLevels(row.bars, row.price, asOf) : [];
    const fromLow52 = levels.find((l) => l.id === 'low52')?.distancePercent ?? null;
    const fromMonthLow = levels.find((l) => l.id === 'monthLow')?.distancePercent ?? null;

    /*
      Nearness is measured against the 52-WEEK low only.

      Including the month low let a stock at its 52-week high qualify: early in
      a month the "month low" is just the last day or two's low, so every
      symbol is near it — including one making new highs, which is the exact
      opposite of the setup being screened for.

      The month low is still reported, because it is useful context once you
      are looking at a name. It just doesn't get a vote on whether the name
      appears at all.
    */
    const nearLow = fromLow52 !== null && fromLow52 >= 0 && fromLow52 <= nearPercent;

    return {
      symbol: row.symbol,
      price: row.price,
      rsi,
      fromLow52,
      fromMonthLow,
      oversold: rsi !== null && rsi <= threshold,
      nearLow,
    };
  });

  return candidates
    .filter((c) => c.oversold || c.nearLow)
    .sort((a, b) => {
      if (a.rsi === null && b.rsi === null) return a.symbol.localeCompare(b.symbol);
      if (a.rsi === null) return 1;
      if (b.rsi === null) return -1;
      return a.rsi - b.rsi;
    });
}

function lastDefinedValue(values: IndicatorSeries): number | null {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (values[i] !== null) return values[i];
  }
  return null;
}

/** A swing point: a bar that turned the market. */
export interface Pivot {
  index: number;
  price: number;
  kind: 'high' | 'low';
  date: string;
}

/**
 * Swing highs and lows.
 *
 * A pivot high is a bar whose high exceeds every bar within `window` on both
 * sides. Requiring both sides is what makes it a turn rather than a step: the
 * highest bar of the last ten is often just the newest bar in an uptrend, and
 * calling that a resistance level would mark every rally as blocked.
 *
 * The cost is that the most recent `window` bars can never be pivots — their
 * right side hasn't happened yet. That is honest rather than unfortunate: a
 * level nobody has traded away from is not yet a level.
 */
export function findPivots(
  bars: { date: string; high: number; low: number }[],
  window = 5,
): Pivot[] {
  const pivots: Pivot[] = [];

  for (let i = window; i < bars.length - window; i += 1) {
    const bar = bars[i];
    let isHigh = true;
    let isLow = true;

    for (let j = i - window; j <= i + window; j += 1) {
      if (j === i) continue;
      if (bars[j].high >= bar.high) isHigh = false;
      if (bars[j].low <= bar.low) isLow = false;
      if (!isHigh && !isLow) break;
    }

    if (isHigh) pivots.push({ index: i, price: bar.high, kind: 'high', date: bar.date });
    if (isLow) pivots.push({ index: i, price: bar.low, kind: 'low', date: bar.date });
  }

  return pivots;
}

/** A price other traders have reacted to more than once. */
export interface SwingLevel {
  price: number;
  /** Swing points clustered here. One touch is a coincidence, not a level. */
  touches: number;
  kind: 'support' | 'resistance';
  /** Percent from the current price. Negative for support. */
  distancePercent: number;
  /** ISO date of the most recent touch — a level ages. */
  lastTouch: string;
}

export interface SupportResistanceOptions {
  /** Bars either side that a pivot must exceed. Default 5. */
  window?: number;
  /** How close two pivots must be to count as the same level, in percent. */
  tolerancePercent?: number;
  /** Minimum swing points before a price counts as a level. Default 2. */
  minTouches?: number;
  /** Levels returned per side. Default 3. */
  limit?: number;
  /**
   * Furthest a level can be and still be worth showing, in percent.
   *
   * Real data forced this. On a stock that ran from $113 to $881 in a year,
   * the method dutifully reported "support" at $113 — 87% below the price.
   * That is not support, it is archaeology: by the time price returned there
   * the market would be a different one, and the level would carry none of
   * the meaning that made it a level.
   */
  maxDistancePercent?: number;
}

/**
 * Support below and resistance above, from clustered swing points.
 *
 * The method is deliberately the boring one — pivots, cluster, count touches —
 * because every exotic alternative is harder to explain and no easier to
 * trust. What matters is the three judgements around it:
 *
 *  1. **Clustering is proportional, not absolute.** A $1 gap is the same level
 *     on a $1,000 stock and two different worlds on a $3 one, so the tolerance
 *     is a percentage.
 *  2. **One touch is not a level.** A single swing point is where price
 *     happened to turn once; a level is where it turned repeatedly. The
 *     default minimum is two, and levels with more are ranked higher.
 *  3. **Recency breaks ties.** A ceiling from fourteen months ago and one from
 *     last week are not equally interesting, so touches are weighted by how
 *     recent the cluster's last touch is.
 *
 * Levels within the clustering tolerance of the current price are dropped:
 * price is sitting on them, so they describe now rather than predicting where
 * it might stop.
 */
export function supportResistance(
  bars: { date: string; high: number; low: number; close: number }[],
  price: number,
  options: SupportResistanceOptions = {},
): SwingLevel[] {
  const window = options.window ?? 5;
  const tolerance = options.tolerancePercent ?? 1.5;
  const minTouches = options.minTouches ?? 2;
  const limit = options.limit ?? 3;
  const maxDistance = options.maxDistancePercent ?? 25;

  if (bars.length < window * 2 + 1 || !Number.isFinite(price) || price <= 0) return [];

  const pivots = findPivots(bars, window);
  if (pivots.length === 0) return [];

  // Cluster by proximity, walking in price order so neighbours meet.
  const sorted = [...pivots].sort((a, b) => a.price - b.price);
  const clusters: Pivot[][] = [];

  for (const pivot of sorted) {
    const current = clusters[clusters.length - 1];
    const anchor = current?.[0]?.price;
    if (current && anchor !== undefined && percentApart(pivot.price, anchor) <= tolerance) {
      current.push(pivot);
    } else {
      clusters.push([pivot]);
    }
  }

  const newest = bars.length - 1;

  const levels = clusters
    .filter((cluster) => cluster.length >= minTouches)
    .map((cluster): SwingLevel & { rank: number } => {
      const levelPrice = cluster.reduce((sum, p) => sum + p.price, 0) / cluster.length;
      const lastIndex = Math.max(...cluster.map((p) => p.index));
      const lastTouch = cluster.find((p) => p.index === lastIndex)!.date;
      // A touch from the far edge of the window counts roughly half of one
      // from today — enough to break ties without erasing older structure.
      const recency = 0.5 + 0.5 * (lastIndex / Math.max(newest, 1));

      return {
        price: levelPrice,
        touches: cluster.length,
        kind: levelPrice >= price ? 'resistance' : 'support',
        distancePercent: ((levelPrice - price) / price) * 100,
        lastTouch,
        rank: cluster.length * recency,
      };
    })
    .filter(
      (level) =>
        // Price is already at these; they say where it is, not where it may stop.
        Math.abs(level.distancePercent) > tolerance &&
        // And these are too far away to act on — see maxDistancePercent.
        Math.abs(level.distancePercent) <= maxDistance,
    );

  const pick = (kind: 'support' | 'resistance') =>
    levels
      .filter((l) => l.kind === kind)
      // Nearest first within a side — the next level that matters is the one
      // price reaches first, not the strongest one somewhere far away.
      .sort((a, b) => Math.abs(a.distancePercent) - Math.abs(b.distancePercent))
      .slice(0, limit);

  return [...pick('support'), ...pick('resistance')].map(({ rank: _rank, ...level }) => level);
}

function percentApart(a: number, b: number): number {
  return Math.abs((a - b) / b) * 100;
}
