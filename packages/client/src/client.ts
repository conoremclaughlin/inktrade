import type {
  HistoryPeriod,
  OIDistributionResponse,
  QuotesResponse,
  TickerHistoryResponse,
  WatchlistResponse,
} from './types.js';
import type {
  BrokerWatchlist,
  BrokerWatchlistDetail,
  OptionChain,
  OrderActivity,
  PortfolioSummary,
} from './broker/types.js';

/** What /api/portfolio returns — the summary plus which brokerage produced it. */
export interface PortfolioResponse {
  provider: string;
  isMock: boolean;
  summary: PortfolioSummary;
}

export interface OrderActivityResponse {
  provider: string;
  orders: OrderActivity[];
}

export interface ApiClientOptions {
  /**
   * Base URL for the Inktrade API.
   *
   * Web passes '' so requests stay relative to the current origin. React
   * Native has no origin, so it must pass an absolute URL reachable from the
   * device — the dev machine's LAN address, not localhost.
   */
  baseUrl?: string;
  /** Injected on platforms that carry auth outside cookies (i.e. mobile). */
  getAuthHeaders?: () => Promise<Record<string, string>> | Record<string, string>;
  fetchImpl?: typeof fetch;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClient {
  getQuotes(symbols: string[]): Promise<QuotesResponse>;

  // --- Linked brokerage -------------------------------------------------
  //
  // Served by /api/broker/*, which normalizes whichever brokerage is linked
  // into the Inktrade contract. Kept as its own group so the transformation
  // layer can later move to a local client without touching call sites.
  getBrokerQuotes(symbols: string[]): Promise<QuotesResponse>;
  getPortfolio(): Promise<PortfolioResponse>;
  getOptionChain(symbol: string, expiration?: string): Promise<OptionChain>;
  getBrokerWatchlists(): Promise<{ watchlists: BrokerWatchlist[] }>;
  getBrokerWatchlist(id: string): Promise<BrokerWatchlistDetail>;
  getOrderActivity(params?: { symbol?: string; limit?: number }): Promise<OrderActivityResponse>;
  getTickerHistory(symbol: string, period: HistoryPeriod): Promise<TickerHistoryResponse>;
  getOIDistribution(symbol: string, expiry?: string): Promise<OIDistributionResponse>;
  getWatchlist(): Promise<WatchlistResponse>;
  putWatchlist(symbols: string[]): Promise<WatchlistResponse>;
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const { baseUrl = '', getAuthHeaders, fetchImpl } = options;
  // Bind late so React Native's polyfilled global fetch is picked up.
  const doFetch: typeof fetch = fetchImpl ?? ((...args) => globalThis.fetch(...args));

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const authHeaders = getAuthHeaders ? await getAuthHeaders() : {};
    const res = await doFetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...authHeaders,
        ...init?.headers,
      },
    });

    if (!res.ok) {
      // Endpoints return { error } on failure; fall back to the status text
      // when the body isn't JSON (proxies, network errors).
      let message = res.statusText;
      try {
        const body = (await res.json()) as { error?: string };
        if (body?.error) message = body.error;
      } catch {
        /* keep statusText */
      }
      throw new ApiError(message || `Request failed: ${res.status}`, res.status);
    }

    return (await res.json()) as T;
  }

  return {
    getQuotes(symbols) {
      if (symbols.length === 0) return Promise.resolve({ quotes: [] });
      return request<QuotesResponse>(`/api/quotes?symbols=${symbols.join(',')}`);
    },

    getBrokerQuotes(symbols) {
      if (symbols.length === 0) return Promise.resolve({ quotes: [] });
      return request<QuotesResponse>(`/api/broker/quotes?symbols=${symbols.join(',')}`);
    },

    getPortfolio() {
      return request<PortfolioResponse>('/api/portfolio');
    },

    getOptionChain(symbol, expiration) {
      const params = new URLSearchParams({ symbol });
      if (expiration) params.set('expiration', expiration);
      return request<OptionChain>(`/api/broker/chain?${params}`);
    },

    getBrokerWatchlists() {
      return request<{ watchlists: BrokerWatchlist[] }>('/api/broker/watchlists');
    },

    getBrokerWatchlist(id) {
      return request<BrokerWatchlistDetail>(
        `/api/broker/watchlists?id=${encodeURIComponent(id)}`,
      );
    },

    getOrderActivity(params = {}) {
      const search = new URLSearchParams();
      if (params.symbol) search.set('symbol', params.symbol);
      if (params.limit) search.set('limit', String(params.limit));
      const qs = search.toString();
      return request<OrderActivityResponse>(`/api/portfolio/orders${qs ? `?${qs}` : ''}`);
    },

    getTickerHistory(symbol, period) {
      return request<TickerHistoryResponse>(
        `/api/ticker-history?symbol=${encodeURIComponent(symbol)}&period=${period}`,
      );
    },

    getOIDistribution(symbol, expiry) {
      const params = new URLSearchParams({ symbol });
      if (expiry) params.set('expiry', expiry);
      return request<OIDistributionResponse>(`/api/oi-distribution?${params}`);
    },

    getWatchlist() {
      return request<WatchlistResponse>('/api/watchlist');
    },

    putWatchlist(symbols) {
      return request<WatchlistResponse>('/api/watchlist', {
        method: 'PUT',
        body: JSON.stringify({ symbols }),
      });
    },
  };
}
