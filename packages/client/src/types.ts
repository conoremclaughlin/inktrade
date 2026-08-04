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

export interface OIDistributionResponse {
  symbol: string;
  expiry: string;
  expiries: string[];
  underlyingPrice: number;
  maxPain: number;
  putCallRatio: number;
  totalCallOI: number;
  totalPutOI: number;
  strikes: OIStrike[];
}

export interface WatchlistResponse {
  symbols: string[];
}

/** Periods accepted by the ticker-history endpoint. */
export type HistoryPeriod = '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y';

export const HISTORY_PERIODS: ReadonlyArray<{ value: HistoryPeriod; label: string }> = [
  { value: '1mo', label: '1M' },
  { value: '3mo', label: '3M' },
  { value: '6mo', label: '6M' },
  { value: '1y', label: '1Y' },
  { value: '2y', label: '2Y' },
  { value: '5y', label: '5Y' },
];
