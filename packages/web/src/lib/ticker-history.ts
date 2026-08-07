import YahooFinance from 'yahoo-finance2';

/**
 * Daily bars for one symbol.
 *
 * Extracted from the /api/ticker-history route so the screener can reuse it
 * without going back out over HTTP to our own server — a scan of forty symbols
 * would otherwise be forty loopback requests to fetch data this process can
 * just ask for directly.
 */

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export const PERIOD_TO_DAYS: Record<string, number> = {
  '1m': 30,
  '3m': 90,
  '6m': 180,
  '1y': 365,
  '2y': 730,
  '5y': 1825,
};

export interface HistoryBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  cumReturn: number;
  volume: number;
}

export interface TickerHistory {
  symbol: string;
  period: string;
  points: HistoryBar[];
  totalReturn: number;
  maxDrawdownPct: number;
  annualizedReturn: number;
}

export async function getTickerHistory(
  symbol: string,
  period = '1y',
): Promise<TickerHistory> {
  const days = PERIOD_TO_DAYS[period] ?? 365;
  const start = new Date();
  // A few days of slack so the first requested day isn't lost to a weekend.
  start.setDate(start.getDate() - days - 5);

  const chart = await yf.chart(symbol, {
    period1: start.toISOString().slice(0, 10),
    interval: '1d',
  });

  const quotes = chart.quotes.filter((q) => q.date != null && q.close != null);
  if (quotes.length < 2) {
    throw new Error('Insufficient historical data');
  }

  const baseClose = quotes[0].close!;
  let peak = baseClose;
  let maxDrawdownPct = 0;

  const points = quotes.map((q): HistoryBar => {
    const date =
      q.date instanceof Date
        ? q.date.toISOString().slice(0, 10)
        : String(q.date).slice(0, 10);
    const close = q.close!;
    const cumReturn = (close / baseClose - 1) * 100;

    if (close > peak) peak = close;
    const drawdown = ((peak - close) / peak) * 100;
    if (drawdown > maxDrawdownPct) maxDrawdownPct = drawdown;

    return {
      date,
      // Yahoo omits OHLC on some bars; the close is the only value always
      // present, and substituting it keeps a bar rather than dropping it.
      open: q.open ?? close,
      high: q.high ?? close,
      low: q.low ?? close,
      close,
      cumReturn,
      volume: Number(q.volume ?? 0),
    };
  });

  const totalReturn = points[points.length - 1]?.cumReturn ?? 0;
  const years = days / 365;
  const growthFactor = 1 + totalReturn / 100;
  const annualizedReturn =
    years > 0 && growthFactor > 0 ? (Math.pow(growthFactor, 1 / years) - 1) * 100 : 0;

  return { symbol, period, points, totalReturn, maxDrawdownPct, annualizedReturn };
}
