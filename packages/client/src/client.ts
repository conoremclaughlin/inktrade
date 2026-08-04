import type {
  HistoryPeriod,
  OIDistributionResponse,
  QuotesResponse,
  TickerHistoryResponse,
  WatchlistResponse,
} from './types.js';

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
