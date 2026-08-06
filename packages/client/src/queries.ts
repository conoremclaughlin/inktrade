import type { ApiClient } from './client.js';
import type { HistoryPeriod } from './types.js';
import type { OptionChain } from './broker/types.js';

/** Upstream quote batch limit — chunk sizing must match it. */
export const OPTION_QUOTE_BATCH = 20;

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

// --- Linked brokerage ------------------------------------------------------
//
// One set of query definitions for web and mobile. Cache identity and
// refetch behaviour should not differ by platform — a portfolio is the same
// query wherever it's drawn — so only the rendering lives downstream.

export const brokerKeys = {
  portfolio: () => ['broker', 'portfolio'] as const,
  quotes: (symbols: string[]) => ['broker', 'quotes', [...symbols].sort().join(',')] as const,
  chain: (symbol: string, expiration?: string) =>
    ['broker', 'chain', symbol, expiration ?? 'nearest'] as const,
  contracts: (ids: string[]) => ['broker', 'contracts', [...ids].sort().join(',')] as const,
  watchlists: () => ['broker', 'watchlists'] as const,
  watchlist: (id: string) => ['broker', 'watchlist', id] as const,
  orders: (symbol?: string) => ['broker', 'orders', symbol ?? 'all'] as const,
};

/** Holdings move only on a fill, so they tolerate more staleness than quotes. */
export const PORTFOLIO_STALE_MS = 30_000;
export const PORTFOLIO_REFETCH_MS = 60_000;
/** Chains are heavy — three upstream calls joined — so refetch on demand only. */
export const CHAIN_STALE_MS = 30_000;
/** Watchlist membership changes only when someone edits it. */
export const WATCHLIST_STALE_MS = 5 * 60_000;

export function portfolioQuery(api: ApiClient) {
  return {
    queryKey: brokerKeys.portfolio(),
    queryFn: () => api.getPortfolio(),
    staleTime: PORTFOLIO_STALE_MS,
    refetchInterval: PORTFOLIO_REFETCH_MS,
  };
}

export function brokerQuotesQuery(api: ApiClient, symbols: string[]) {
  return {
    queryKey: brokerKeys.quotes(symbols),
    queryFn: () => api.getBrokerQuotes(symbols),
    enabled: symbols.length > 0,
    staleTime: QUOTES_STALE_MS,
    refetchInterval: QUOTES_REFETCH_MS,
  };
}

export function optionChainQuery(api: ApiClient, symbol: string | null, expiration?: string) {
  return {
    queryKey: brokerKeys.chain(symbol ?? '', expiration),
    queryFn: () => api.getOptionChain(symbol!, expiration),
    enabled: !!symbol,
    staleTime: CHAIN_STALE_MS,
    // Keep the previous expiration on screen while the next one loads, so
    // stepping through the ladder doesn't blank the table each time.
    placeholderData: (prev: OptionChain | undefined) => prev,
  };
}

/**
 * Prices for one batch of contracts, fetched when its strikes come into view.
 *
 * Keyed by the sorted id list so two chunks that happen to overlap share a
 * cache entry, and gated on `enabled` so nothing is requested until the reader
 * actually scrolls there.
 */
export function optionContractsQuery(api: ApiClient, ids: string[], enabled: boolean) {
  return {
    queryKey: brokerKeys.contracts(ids),
    queryFn: () => api.getOptionContracts(ids),
    enabled: enabled && ids.length > 0,
    staleTime: CHAIN_STALE_MS,
  };
}

export function brokerWatchlistsQuery(api: ApiClient) {
  return {
    queryKey: brokerKeys.watchlists(),
    queryFn: () => api.getBrokerWatchlists(),
    staleTime: WATCHLIST_STALE_MS,
  };
}

export function brokerWatchlistQuery(api: ApiClient, id: string | null) {
  return {
    queryKey: brokerKeys.watchlist(id ?? ''),
    queryFn: () => api.getBrokerWatchlist(id!),
    enabled: !!id,
    staleTime: WATCHLIST_STALE_MS,
  };
}

export function orderActivityQuery(api: ApiClient, symbol?: string, limit?: number) {
  return {
    queryKey: brokerKeys.orders(symbol),
    queryFn: () => api.getOrderActivity({ symbol, limit }),
    staleTime: PORTFOLIO_STALE_MS,
  };
}
