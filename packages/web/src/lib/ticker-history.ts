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

/**
 * Window length per period.
 *
 * These keys MUST match HistoryPeriod in @inktrade/client. They did not: the
 * table was keyed '1m'/'3m'/'6m' while every caller sends '1mo'/'3mo'/'6mo',
 * so three of the six selectors missed the lookup, fell through to the 365-day
 * default, and served a full year. Measured on NVDA 2026-08-13, 1mo/3mo/6mo/1y
 * returned byte-identical series — 255 bars from 2025-08-08, all reporting a
 * 23.32% "period return". The chart simply did not move when you pressed the
 * buttons.
 *
 * 'ytd' is absent on purpose; it is calendar-anchored, not a fixed span, and
 * is resolved in windowStart below.
 */
export const PERIOD_TO_DAYS: Record<string, number> = {
  '1mo': 30,
  '3mo': 90,
  '6mo': 180,
  '1y': 365,
  '2y': 730,
  '5y': 1825,
};

/** Trading days a year, for annualising. */
const TRADING_DAYS_PER_YEAR = 252;

/** First day of the window being measured. */
function windowStart(period: string, today: Date): Date {
  if (period === 'ytd') {
    // January 1st. The base close is the prior year's final session, resolved
    // separately below — a YTD move that ignored the turn-of-year gap would
    // start the year at the wrong price.
    return new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
  }
  const days = PERIOD_TO_DAYS[period] ?? 365;
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - days);
  return start;
}

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
  const from = windowStart(period, new Date());

  /*
   * Fetch a week wider than the window, then trim.
   *
   * The extra week does two jobs. It stops the first requested day being lost
   * to a weekend or holiday, and it guarantees at least one bar BEFORE the
   * window — which is the bar the return has to be measured from. Starting the
   * measurement at the first bar inside the window silently discards the move
   * that happened overnight into it, and for YTD that is exactly the
   * turn-of-year gap.
   */
  const fetchFrom = new Date(from);
  fetchFrom.setUTCDate(fetchFrom.getUTCDate() - 7);

  const chart = await yf.chart(symbol, {
    period1: fetchFrom.toISOString().slice(0, 10),
    interval: '1d',
  });

  const quotes = chart.quotes.filter((q) => q.date != null && q.close != null);
  if (quotes.length < 2) {
    throw new Error('Insufficient historical data');
  }

  const fromDay = from.toISOString().slice(0, 10);
  const dayOf = (q: (typeof quotes)[number]): string =>
    q.date instanceof Date ? q.date.toISOString().slice(0, 10) : String(q.date).slice(0, 10);

  const inWindow = quotes.filter((q) => dayOf(q) >= fromDay);
  // A symbol that listed inside the window has no prior bar, so it is measured
  // from its own first session — the honest baseline for something that didn't
  // exist earlier.
  const priorBars = quotes.filter((q) => dayOf(q) < fromDay);
  const measured = inWindow.length >= 2 ? inWindow : quotes;

  const baseClose = (priorBars.length > 0 && inWindow.length >= 2
    ? priorBars[priorBars.length - 1].close
    : measured[0].close)!;

  let peak = baseClose;
  let maxDrawdownPct = 0;

  const points = measured.map((q): HistoryBar => {
    const close = q.close!;
    const cumReturn = (close / baseClose - 1) * 100;

    if (close > peak) peak = close;
    const drawdown = ((peak - close) / peak) * 100;
    if (drawdown > maxDrawdownPct) maxDrawdownPct = drawdown;

    return {
      date: dayOf(q),
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

  /*
   * Annualise from the bars actually returned, not from the period's nominal
   * length. YTD has no nominal length, and a window trimmed by a listing date
   * or a data gap is shorter than it claims — dividing by the label rather
   * than the data would overstate the rate in both cases.
   */
  const years = points.length / TRADING_DAYS_PER_YEAR;
  const growthFactor = 1 + totalReturn / 100;
  const annualizedReturn =
    years > 0 && growthFactor > 0 ? (Math.pow(growthFactor, 1 / years) - 1) * 100 : 0;

  return { symbol, period, points, totalReturn, maxDrawdownPct, annualizedReturn };
}
