import type { ApiClient } from './client.js';
import type { HistoryPeriod } from './types.js';
import type { OptionChain } from './broker/types.js';
import type { ChainGridQuery } from './analytics.js';
import type { LetfPeriod } from './letf.js';

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
  chainGrid: (symbol: string, query?: ChainGridQuery) =>
    ['chain-grid', symbol, query?.type ?? 'call', query?.offset ?? 0, query?.limit ?? 6] as const,
  letfProfile: (symbol: string) => ['letf-profile', symbol] as const,
  letfHoldings: (symbol: string) => ['letf-holdings', symbol] as const,
  letfHistory: (symbol: string, period: LetfPeriod) => ['letf-history', symbol, period] as const,
  earnings: (symbols: string[]) => ['earnings', [...symbols].sort().join(',')] as const,
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

/**
 * Earnings dates barely move — a company announces one and it stands for
 * weeks. Refetching on focus would spend a request to learn nothing.
 */
export const EARNINGS_STALE_MS = 60 * 60_000;

export function earningsQuery(api: ApiClient, symbols: string[]) {
  return {
    queryKey: queryKeys.earnings(symbols),
    queryFn: () => api.getEarnings(symbols),
    enabled: symbols.length > 0,
    staleTime: EARNINGS_STALE_MS,
    // A missing badge is a smaller failure than a broken page. Every consumer
    // renders nothing when this query has no data.
    retry: 1,
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

/**
 * A grid load is many chained upstream requests — one chain call per
 * expiration in the window — so it is expensive in a way quotes are not.
 * Hold it far longer than a quote, and never on an interval: the strikes and
 * the model don't move fast enough to justify re-paying that.
 */
export const CHAIN_GRID_STALE_MS = 5 * 60_000;

export function chainGridQuery(
  api: ApiClient,
  symbol: string | null,
  query?: ChainGridQuery,
) {
  return {
    queryKey: queryKeys.chainGrid(symbol ?? '', query),
    queryFn: () => api.getChainGrid(symbol!, query),
    enabled: !!symbol,
    staleTime: CHAIN_GRID_STALE_MS,
    // Keep the previous window on screen while the next one loads. Paging
    // expirations otherwise blanks the grid on every step.
    placeholderData: <T,>(prev: T) => prev,
  };
}

/**
 * A fund's registry entry, expense ratio and holdings are close to static, and
 * its daily-bar history only changes after the close. Nothing here justifies
 * an interval — the price on the profile is the one number that moves, and a
 * stale quote on a decay screen misleads nobody.
 */
export const LETF_STALE_MS = 5 * 60_000;

export function letfProfileQuery(api: ApiClient, symbol: string | null) {
  return {
    queryKey: queryKeys.letfProfile(symbol ?? ''),
    queryFn: () => api.getLetfProfile(symbol!),
    enabled: !!symbol,
    staleTime: LETF_STALE_MS,
    // A symbol outside the registry 404s, and retrying can't add it.
    retry: false,
  };
}

export function letfHoldingsQuery(api: ApiClient, symbol: string | null) {
  return {
    queryKey: queryKeys.letfHoldings(symbol ?? ''),
    queryFn: () => api.getLetfHoldings(symbol!),
    enabled: !!symbol,
    staleTime: LETF_STALE_MS,
    retry: false,
  };
}

export function letfHistoryQuery(api: ApiClient, symbol: string | null, period: LetfPeriod) {
  return {
    queryKey: queryKeys.letfHistory(symbol ?? '', period),
    queryFn: () => api.getLetfHistory(symbol!, period),
    enabled: !!symbol,
    staleTime: LETF_STALE_MS,
    retry: false,
    // Hold the drawn curve while a new period loads, so switching 1Y -> 5Y
    // redraws rather than blanking.
    placeholderData: <T,>(prev: T) => prev,
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
  taxLots: (accountId: string, symbol: string) =>
    ['broker', 'tax-lots', accountId, symbol] as const,
  watchlists: () => ['broker', 'watchlists'] as const,
  watchlist: (id: string) => ['broker', 'watchlist', id] as const,
  orders: (symbol?: string) => ['broker', 'orders', symbol ?? 'all'] as const,
  tradingMode: () => ['broker', 'trading-mode'] as const,
  costBasis: () => ['broker', 'cost-basis'] as const,
  oversold: (symbols: string[]) =>
    ['screener', 'oversold', [...symbols].sort().join(',')] as const,
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

/**
 * Open lots for a holding.
 *
 * Short stale time: lots change on every fill, and a stale set would produce a
 * selection the broker rejects because the shares have already moved.
 */
export function taxLotsQuery(api: ApiClient, accountId: string | null, symbol: string | null) {
  return {
    queryKey: brokerKeys.taxLots(accountId ?? '', symbol ?? ''),
    queryFn: () => api.getTaxLots(accountId!, symbol!),
    enabled: !!accountId && !!symbol,
    staleTime: 15_000,
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

/**
 * The trading settings, shared by both platforms.
 *
 * Long stale times on purpose: these change when someone opens settings and
 * changes them, not on their own. Both are enforced server-side regardless of
 * what a cached copy says, so a stale read is a cosmetic problem rather than a
 * correctness one.
 */
export const SETTINGS_STALE_MS = 5 * 60_000;

export function tradingModeQuery(api: ApiClient) {
  return {
    queryKey: brokerKeys.tradingMode(),
    queryFn: () => api.getTradingMode(),
    staleTime: SETTINGS_STALE_MS,
  };
}

export function costBasisQuery(api: ApiClient) {
  return {
    queryKey: brokerKeys.costBasis(),
    queryFn: () => api.getCostBasis(),
    staleTime: SETTINGS_STALE_MS,
  };
}

/**
 * An oversold scan over a set of symbols.
 *
 * Disabled until asked for. A scan is N upstream history fetches, so it runs
 * when someone presses the button — not because a screen happened to mount.
 */
export function oversoldQuery(api: ApiClient, symbols: string[], enabled: boolean) {
  return {
    queryKey: brokerKeys.oversold(symbols),
    queryFn: () => api.screenOversold(symbols),
    enabled: enabled && symbols.length > 0,
    // Indicators move on daily bars; rescanning every minute would cost a lot
    // to learn nothing.
    staleTime: 10 * 60_000,
  };
}
