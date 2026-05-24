import type { PricePoint } from './returns.js';
import type { DrawdownPoint, DrawdownSeries, DrawdownOverlap, DrawdownAnalysis } from './types.js';

export function computeDrawdownSeries(bars: PricePoint[]): DrawdownPoint[] {
  let peak = -Infinity;
  return bars.map(bar => {
    if (bar.close > peak) peak = bar.close;
    const drawdownPct = -((peak - bar.close) / peak) * 100;
    return { date: bar.date, drawdownPct };
  });
}

export function analyzeDrawdowns(
  histories: Map<string, PricePoint[]>,
): DrawdownAnalysis {
  const symbols = [...histories.keys()];
  const tickers: DrawdownSeries[] = [];

  const allSeries = new Map<string, DrawdownPoint[]>();

  for (const symbol of symbols) {
    const bars = histories.get(symbol)!;
    const series = computeDrawdownSeries(bars);
    allSeries.set(symbol, series);

    const max = Math.min(...series.map(p => p.drawdownPct));
    const current = series.length > 0 ? series[series.length - 1].drawdownPct : 0;

    tickers.push({ symbol, current, max, series });
  }

  const overlaps: DrawdownOverlap[] = [];
  const dateSet = new Set<string>();
  for (const series of allSeries.values()) {
    for (const point of series) dateSet.add(point.date);
  }

  const byDate = new Map<string, Map<string, number>>();
  for (const [symbol, series] of allSeries) {
    for (const point of series) {
      if (!byDate.has(point.date)) byDate.set(point.date, new Map());
      byDate.get(point.date)!.set(symbol, point.drawdownPct);
    }
  }

  for (const [date, ddMap] of [...byDate.entries()].sort()) {
    const inDrawdown: string[] = [];
    let totalDd = 0;
    for (const [symbol, dd] of ddMap) {
      if (dd < -5) {
        inDrawdown.push(symbol);
        totalDd += dd;
      }
    }
    if (inDrawdown.length >= 2) {
      overlaps.push({
        date,
        tickersInDrawdown: inDrawdown,
        avgDrawdown: totalDd / inDrawdown.length,
      });
    }
  }

  return { tickers, overlaps };
}
