import { describe, it, expect } from 'vitest';
import { analyzePortfolio, type QuoteInfo } from './analyzer.js';
import type { PricePoint } from './returns.js';

function makeHistory(
  n: number,
  dailyReturn: number,
  startPrice = 100,
  startDate = '2024-01-02',
): PricePoint[] {
  const bars: PricePoint[] = [];
  const d = new Date(startDate);
  let price = startPrice;

  for (let i = 0; i < n; i++) {
    bars.push({ date: d.toISOString().slice(0, 10), close: price });
    d.setDate(d.getDate() + 1);
    price *= 1 + dailyReturn;
  }
  return bars;
}

function makeSyntheticHistories() {
  // A: steady uptrend (low vol, positive momentum)
  const a = makeHistory(260, 0.001, 100);
  // B: identical to A scaled (perfectly correlated)
  const b = makeHistory(260, 0.001, 200);
  // C: downtrend (negative momentum)
  const c = makeHistory(260, -0.002, 150);

  return new Map([['STEADY', a], ['CLONE', b], ['DOWN', c]]);
}

function makeQuotes(histories: Map<string, PricePoint[]>): Map<string, QuoteInfo> {
  const quotes = new Map<string, QuoteInfo>();
  for (const [symbol, bars] of histories) {
    const last = bars[bars.length - 1].close;
    const prev = bars[bars.length - 2].close;
    quotes.set(symbol, {
      price: last,
      changePercent: ((last - prev) / prev) * 100,
    });
  }
  return quotes;
}

describe('analyzePortfolio', () => {
  it('returns analysis for all tickers', () => {
    const histories = makeSyntheticHistories();
    const quotes = makeQuotes(histories);
    const result = analyzePortfolio(histories, quotes);

    expect(result.tickers).toHaveLength(3);
    expect(result.tickers.map(t => t.symbol).sort()).toEqual(['CLONE', 'DOWN', 'STEADY']);
  });

  it('computes correlation matrix with correct dimensions', () => {
    const histories = makeSyntheticHistories();
    const quotes = makeQuotes(histories);
    const result = analyzePortfolio(histories, quotes);

    expect(result.correlation.symbols).toHaveLength(3);
    expect(result.correlation.matrix).toHaveLength(3);
    result.correlation.matrix.forEach(row => expect(row).toHaveLength(3));
  });

  it('detects high correlation between identical-trend tickers', () => {
    const histories = makeSyntheticHistories();
    const quotes = makeQuotes(histories);
    const result = analyzePortfolio(histories, quotes);

    const steadyIdx = result.correlation.symbols.indexOf('STEADY');
    const cloneIdx = result.correlation.symbols.indexOf('CLONE');
    const corr = result.correlation.matrix[steadyIdx][cloneIdx];

    expect(corr).toBeGreaterThan(0.9);
  });

  it('assigns positive momentum to uptrending ticker', () => {
    const histories = makeSyntheticHistories();
    const quotes = makeQuotes(histories);
    const result = analyzePortfolio(histories, quotes);

    const steady = result.tickers.find(t => t.symbol === 'STEADY')!;
    expect(steady.momentumScore.raw).toBeGreaterThan(0);
  });

  it('assigns negative momentum to downtrending ticker', () => {
    const histories = makeSyntheticHistories();
    const quotes = makeQuotes(histories);
    const result = analyzePortfolio(histories, quotes);

    const down = result.tickers.find(t => t.symbol === 'DOWN')!;
    expect(down.momentumScore.raw).toBeLessThan(0);
  });

  it('suggests caution for downtrending ticker', () => {
    const histories = makeSyntheticHistories();
    const quotes = makeQuotes(histories);
    const result = analyzePortfolio(histories, quotes);

    const down = result.tickers.find(t => t.symbol === 'DOWN')!;
    expect(down.suggestedStrategy).toBe('caution');
  });

  it('generates high-correlation warning for correlated pair', () => {
    const histories = makeSyntheticHistories();
    const quotes = makeQuotes(histories);
    const result = analyzePortfolio(histories, quotes);

    const corrWarnings = result.warnings.filter(w => w.type === 'high-correlation');
    const hasSteadyClone = corrWarnings.some(
      w => w.tickers.includes('STEADY') && w.tickers.includes('CLONE'),
    );
    expect(hasSteadyClone).toBe(true);
  });

  it('includes drawdown analysis', () => {
    const histories = makeSyntheticHistories();
    const quotes = makeQuotes(histories);
    const result = analyzePortfolio(histories, quotes);

    expect(result.drawdown.tickers).toHaveLength(3);
    result.drawdown.tickers.forEach(t => {
      expect(t.series.length).toBeGreaterThan(0);
    });
  });

  it('classifies LETF tickers correctly', () => {
    const tqqq = makeHistory(260, 0.003, 50);
    const spy = makeHistory(260, 0.001, 400);
    const histories = new Map([['TQQQ', tqqq], ['SPY', spy]]);
    const quotes = makeQuotes(histories);
    const result = analyzePortfolio(histories, quotes);

    const tqqqTicker = result.tickers.find(t => t.symbol === 'TQQQ')!;
    expect(tqqqTicker.suggestedStrategy).toBe('letf-hold');
  });

  it('sets computedAt timestamp', () => {
    const histories = makeSyntheticHistories();
    const quotes = makeQuotes(histories);
    const result = analyzePortfolio(histories, quotes);

    expect(result.computedAt).toBeTruthy();
    expect(new Date(result.computedAt).getTime()).toBeGreaterThan(0);
  });
});
