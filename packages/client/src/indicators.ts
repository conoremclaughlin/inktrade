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

export type IndicatorId = 'sma20' | 'sma50' | 'sma200' | 'ema12' | 'ema26' | 'bollinger';

export const INDICATOR_COLORS: Record<IndicatorId, string> = {
  sma20: '#f59e0b',
  sma50: '#8b5cf6',
  sma200: '#ec4899',
  ema12: '#06b6d4',
  ema26: '#f97316',
  bollinger: '#6366f1',
};

export const INDICATOR_LABELS: Record<IndicatorId, string> = {
  sma20: 'SMA 20',
  sma50: 'SMA 50',
  sma200: 'SMA 200',
  ema12: 'EMA 12',
  ema26: 'EMA 26',
  bollinger: 'Bollinger',
};
