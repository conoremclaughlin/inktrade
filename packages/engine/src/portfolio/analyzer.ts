import type { PricePoint } from './returns.js';
import type {
  PortfolioAnalysis,
  TickerAnalysis,
  RiskWarning,
  VolRegime,
  StrategyType,
} from './types.js';
import { computeAlignedReturns } from './returns.js';
import { computeCorrelationMatrix } from './correlation.js';
import { analyzeDrawdowns } from './drawdown.js';
import { computeMomentumScore } from './momentum.js';

export interface QuoteInfo {
  price: number;
  changePercent: number;
}

function computeHv20(bars: PricePoint[]): number {
  if (bars.length < 21) return 0;
  const recent = bars.slice(-21);
  const logReturns: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    logReturns.push(Math.log(recent[i].close / recent[i - 1].close));
  }
  const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
  const variance = logReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / (logReturns.length - 1);
  return Math.sqrt(variance * 252) * 100;
}

function classifyVolRegime(hv20: number): VolRegime {
  if (hv20 < 15) return 'low';
  if (hv20 < 30) return 'normal';
  if (hv20 < 50) return 'elevated';
  return 'high';
}

function suggestStrategy(
  volRegime: VolRegime,
  momentumRaw: number,
  isLetf: boolean,
): StrategyType {
  if (isLetf) return 'letf-hold';
  if ((volRegime === 'elevated' || volRegime === 'high') && momentumRaw > 5) return 'directional-calls';
  if (volRegime === 'low' && momentumRaw > 0) return 'put-credit-spread';
  if (momentumRaw > 10) return 'momentum-stock';
  return 'caution';
}

const KNOWN_LETFS = new Set([
  'TQQQ', 'SQQQ', 'SOXL', 'SOXS', 'UPRO', 'SPXU', 'TNA', 'TZA',
  'TECL', 'TECS', 'FAS', 'FAZ', 'TMF', 'TMV', 'LABU', 'LABD',
  'FNGU', 'FNGD', 'UDOW', 'SDOW', 'BULZ', 'BERZ', 'NAIL', 'CURE',
]);

export function analyzePortfolio(
  histories: Map<string, PricePoint[]>,
  quotes: Map<string, QuoteInfo>,
): PortfolioAnalysis {
  const symbols = [...histories.keys()];

  const { dates, returns: alignedReturns } = computeAlignedReturns(histories);
  const correlation = computeCorrelationMatrix(alignedReturns, symbols);
  const drawdown = analyzeDrawdowns(histories);

  const tickers: TickerAnalysis[] = symbols.map(symbol => {
    const bars = histories.get(symbol)!;
    const quote = quotes.get(symbol);
    const hv20 = computeHv20(bars);
    const volRegime = classifyVolRegime(hv20);
    const momentumScore = computeMomentumScore(bars);

    const firstClose = bars[0]?.close ?? 0;
    const lastClose = bars[bars.length - 1]?.close ?? 0;
    const totalReturn = firstClose > 0 ? ((lastClose / firstClose) - 1) * 100 : 0;
    const years = bars.length / 252;
    const growthFactor = 1 + totalReturn / 100;
    const annualizedReturn = years > 0 && growthFactor > 0
      ? (Math.pow(growthFactor, 1 / years) - 1) * 100
      : 0;

    const ddSeries = drawdown.tickers.find(t => t.symbol === symbol);

    return {
      symbol,
      price: quote?.price ?? lastClose,
      changePercent: quote?.changePercent ?? 0,
      annualizedReturn,
      maxDrawdownPct: ddSeries ? Math.abs(ddSeries.max) : 0,
      currentDrawdownPct: ddSeries ? Math.abs(ddSeries.current) : 0,
      volatility: hv20,
      volRegime,
      momentumScore,
      suggestedStrategy: suggestStrategy(volRegime, momentumScore.raw, KNOWN_LETFS.has(symbol)),
    };
  });

  const warnings = generateWarnings(correlation, drawdown, tickers, dates);

  return {
    tickers,
    correlation,
    drawdown,
    warnings,
    computedAt: new Date().toISOString(),
  };
}

function generateWarnings(
  correlation: ReturnType<typeof computeCorrelationMatrix>,
  drawdown: ReturnType<typeof analyzeDrawdowns>,
  tickers: TickerAnalysis[],
  dates: string[],
): RiskWarning[] {
  const warnings: RiskWarning[] = [];

  for (const pair of correlation.pairs) {
    if (pair.correlation > 0.85) {
      warnings.push({
        type: 'high-correlation',
        severity: 'critical',
        message: `${pair.symbolA} and ${pair.symbolB} are highly correlated (${(pair.correlation * 100).toFixed(0)}%). A drawdown in one will likely hit both.`,
        tickers: [pair.symbolA, pair.symbolB],
      });
    } else if (pair.correlation > 0.7) {
      warnings.push({
        type: 'high-correlation',
        severity: 'warning',
        message: `${pair.symbolA} and ${pair.symbolB} show elevated correlation (${(pair.correlation * 100).toFixed(0)}%).`,
        tickers: [pair.symbolA, pair.symbolB],
      });
    }
  }

  const recentDates = dates.slice(-20);
  const recentOverlaps = drawdown.overlaps.filter(o => recentDates.includes(o.date));
  if (recentOverlaps.length > 10) {
    const affectedTickers = [...new Set(recentOverlaps.flatMap(o => o.tickersInDrawdown))];
    warnings.push({
      type: 'drawdown-cluster',
      severity: 'warning',
      message: `${affectedTickers.length} positions have been in simultaneous drawdown for ${recentOverlaps.length} of the last 20 trading days.`,
      tickers: affectedTickers,
    });
  }

  const highVol = tickers.filter(t => t.volRegime === 'high' || t.volRegime === 'elevated');
  if (highVol.length > tickers.length / 2) {
    warnings.push({
      type: 'vol-regime',
      severity: 'warning',
      message: `${highVol.length} of ${tickers.length} positions are in elevated or high volatility regimes.`,
      tickers: highVol.map(t => t.symbol),
    });
  }

  return warnings.sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity];
  });
}
