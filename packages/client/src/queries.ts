import type { ApiClient } from './client.js';
import type { HistoryPeriod } from './types.js';

/**
 * Query keys and options shared by web and mobile.
 *
 * Rendering differs per platform, but cache identity and fetching behaviour
 * should not — a symbol's history is the same query wherever it's drawn.
 */
export const queryKeys = {
  quotes: (symbols: string[]) => ['quotes', [...symbols].sort().join(',')] as const,
  tickerHistory: (symbol: string, period: HistoryPeriod) =>
    ['ticker-history', symbol, period] as const,
  oiDistribution: (symbol: string, expiry?: string) =>
    ['oi-distribution', symbol, expiry ?? 'nearest'] as const,
  watchlist: () => ['watchlist'] as const,
};

/** Quotes move constantly; refetch on an interval but keep them briefly fresh. */
export const QUOTES_STALE_MS = 15_000;
export const QUOTES_REFETCH_MS = 30_000;
/** Daily bars only change after the close. */
export const HISTORY_STALE_MS = 5 * 60_000;

export function quotesQuery(api: ApiClient, symbols: string[]) {
  return {
    queryKey: queryKeys.quotes(symbols),
    queryFn: () => api.getQuotes(symbols),
    enabled: symbols.length > 0,
    staleTime: QUOTES_STALE_MS,
    refetchInterval: QUOTES_REFETCH_MS,
  };
}

export function tickerHistoryQuery(
  api: ApiClient,
  symbol: string | null,
  period: HistoryPeriod,
) {
  return {
    queryKey: queryKeys.tickerHistory(symbol ?? '', period),
    queryFn: () => api.getTickerHistory(symbol!, period),
    enabled: !!symbol,
    staleTime: HISTORY_STALE_MS,
  };
}

export function oiDistributionQuery(api: ApiClient, symbol: string | null, expiry?: string) {
  return {
    queryKey: queryKeys.oiDistribution(symbol ?? '', expiry),
    queryFn: () => api.getOIDistribution(symbol!, expiry),
    enabled: !!symbol,
    staleTime: HISTORY_STALE_MS,
  };
}
