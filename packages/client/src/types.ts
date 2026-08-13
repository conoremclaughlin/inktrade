/**
 * Wire types for the Inktrade HTTP API.
 *
 * These live here rather than in a platform package because web and mobile
 * consume the same endpoints — only the rendering differs.
 */

export interface Quote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  marketCap?: number;
  /**
   * Top of book. Optional because not every source quotes both sides, and an
   * order ticket must show a blank rather than a fabricated price — undefined
   * reads as "unknown", a zero reads as "free".
   */
  bid?: number;
  ask?: number;
}

export interface QuotesResponse {
  quotes: Quote[];
}

export interface TickerHistoryPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  cumReturn: number;
  volume: number;
}

export interface TickerHistoryResponse {
  symbol: string;
  period: string;
  points: TickerHistoryPoint[];
  totalReturn: number;
  maxDrawdownPct: number;
  annualizedReturn: number;
}

export interface OIStrike {
  strike: number;
  callOI: number;
  putOI: number;
  callVolume: number;
  putVolume: number;
}

/**
 * Open interest by strike.
 *
 * Field names here were wrong for a long time — the type declared `maxPain`,
 * `putCallRatio`, `expiry` and `expiries`; the route has always returned
 * `maxPainStrike`, `pcRatio` and `expirations`. Web read the real names and was
 * fine. Mobile trusted the type and crashed with "Cannot read property
 * 'toFixed' of undefined" on every ticker.
 *
 * A shared type that doesn't match the endpoint is worse than no type: it
 * turns a wrong field into a compile-time guarantee.
 */
export interface OIDistributionResponse {
  symbol: string;
  underlyingPrice: number;
  /** ISO dates (YYYY-MM-DD) for every expiration on the underlying. */
  expirations: string[];
  strikes: OIStrike[];
  /** Strike where the most option value expires worthless. */
  maxPainStrike: number;
  totalCallOI: number;
  totalPutOI: number;
  /** Put open interest over call open interest. Zero when there are no calls. */
  pcRatio: number;
}

export interface WatchlistResponse {
  symbols: string[];
}

/** Periods accepted by the ticker-history endpoint. */
export type HistoryPeriod = '1mo' | '3mo' | '6mo' | 'ytd' | '1y' | '2y' | '5y';

/**
 * YTD sits between 6M and 1Y because that is where it usually falls, and it is
 * the only calendar-anchored window here — every other period is a fixed span
 * measured back from today, so none of them can answer "how has this done this
 * year", which is the frame most people actually think in.
 */
export const HISTORY_PERIODS: ReadonlyArray<{ value: HistoryPeriod; label: string }> = [
  { value: '1mo', label: '1M' },
  { value: '3mo', label: '3M' },
  { value: '6mo', label: '6M' },
  { value: 'ytd', label: 'YTD' },
  { value: '1y', label: '1Y' },
  { value: '2y', label: '2Y' },
  { value: '5y', label: '5Y' },
];
