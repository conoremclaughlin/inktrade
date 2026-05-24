import type { PricePoint } from './returns.js';
import type { MomentumScore } from './types.js';

const LOOKBACK_WEIGHTS: [number, number][] = [
  [21, 0.2],   // ~1 month
  [63, 0.2],   // ~3 months
  [126, 0.3],  // ~6 months
  [252, 0.3],  // ~12 months
];

function trailingReturn(bars: PricePoint[], days: number): number | null {
  if (bars.length <= days) return null;
  const recent = bars[bars.length - 1].close;
  const past = bars[bars.length - 1 - days].close;
  return (recent - past) / past;
}

export function computeMomentumScore(bars: PricePoint[]): MomentumScore {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [days, weight] of LOOKBACK_WEIGHTS) {
    const ret = trailingReturn(bars, days);
    if (ret !== null) {
      weightedSum += ret * weight;
      totalWeight += weight;
    }
  }

  const raw = totalWeight > 0 ? (weightedSum / totalWeight) * 100 : 0;

  // Percentile: compute rolling momentum scores and rank current
  const minBars = 252 + 63;
  if (bars.length < minBars) {
    return { raw, percentile: 50 };
  }

  const historicalScores: number[] = [];
  for (let end = minBars; end <= bars.length; end++) {
    const slice = bars.slice(0, end);
    let s = 0;
    let w = 0;
    for (const [days, weight] of LOOKBACK_WEIGHTS) {
      const r = trailingReturn(slice, days);
      if (r !== null) {
        s += r * weight;
        w += weight;
      }
    }
    if (w > 0) historicalScores.push((s / w) * 100);
  }

  const belowCount = historicalScores.filter(s => s < raw).length;
  const percentile = (belowCount / historicalScores.length) * 100;

  return { raw, percentile };
}
