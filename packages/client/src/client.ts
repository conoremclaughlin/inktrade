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
  OptionContract,
  OrderActivity,
  OrderReceipt,
  OrderRequest,
  OrderReview,
  PortfolioSummary,
} from './broker/types.js';
import type { ChainGridQuery, ChainGridResponse } from './analytics.js';
import type {
  LetfHistoryResponse,
  LetfHoldingsResponse,
  LetfPeriod,
  LetfProfileResponse,
} from './letf.js';
import type { EarningsResponse } from './earnings.js';
import type { CostBasisDecision, CostBasisStrategy, SalePlan, TaxLot } from './tax-lots.js';
import type { OversoldCandidate } from './indicators.js';
import type { TradingMode, TradingModeDecision } from './trading-mode.js';

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

  /**
   * Next earnings date for a batch of symbols.
   *
   * Batched rather than per-symbol because every caller is a list — a
   * portfolio, a watchlist, a screener's results. One request for twenty
   * symbols instead of twenty.
   */
  getEarnings(symbols: string[]): Promise<EarningsResponse>;

  // --- Linked brokerage -------------------------------------------------
  //
  // Served by /api/broker/*, which normalizes whichever brokerage is linked
  // into the Inktrade contract. Kept as its own group so the transformation
  // layer can later move to a local client without touching call sites.
  getBrokerQuotes(symbols: string[]): Promise<QuotesResponse>;
  getPortfolio(): Promise<PortfolioResponse>;
  getOptionChain(symbol: string, expiration?: string): Promise<OptionChain>;
  getOptionContracts(ids: string[]): Promise<{ contracts: OptionContract[] }>;
  getTaxLots(accountId: string, symbol: string): Promise<{ symbol: string; lots: TaxLot[] }>;
  getBrokerWatchlists(): Promise<{ watchlists: BrokerWatchlist[] }>;
  getBrokerWatchlist(id: string): Promise<BrokerWatchlistDetail>;
  getOrderActivity(params?: { symbol?: string; limit?: number }): Promise<OrderActivityResponse>;
  getTickerHistory(symbol: string, period: HistoryPeriod): Promise<TickerHistoryResponse>;
  getOIDistribution(symbol: string, expiry?: string): Promise<OIDistributionResponse>;
  getChainGrid(symbol: string, query?: ChainGridQuery): Promise<ChainGridResponse>;

  // --- Leveraged ETFs ---------------------------------------------------
  //
  // Three calls rather than one because they age differently: the registry and
  // fund profile barely move, holdings turn over quarterly, and the history is
  // the only one that changes with the period control.
  getLetfProfile(symbol: string): Promise<LetfProfileResponse>;
  getLetfHoldings(symbol: string): Promise<LetfHoldingsResponse>;
  getLetfHistory(symbol: string, period: LetfPeriod): Promise<LetfHistoryResponse>;

  getWatchlist(): Promise<WatchlistResponse>;
  putWatchlist(symbols: string[]): Promise<WatchlistResponse>;

  // --- Orders -----------------------------------------------------------
  //
  // These deliberately resolve rather than throw on a refusal. An order that
  // the broker rejects still comes back with the sale plan attached, and that
  // plan is often the most useful thing on the screen — which shares would
  // have gone, while you fix whatever was objected to. Throwing would discard
  // it along with the reason.
  reviewOrder(order: OrderRequest): Promise<OrderOutcome>;
  placeOrder(order: OrderRequest): Promise<OrderOutcome>;

  /**
   * Screen symbols for "oversold, near the lows".
   *
   * One call rather than one per symbol: the fan-out happens server-side,
   * because every price source quotes a single symbol per request and doing
   * that from a phone would be N round trips over a mobile link.
   */
  screenOversold(
    symbols: string[],
    options?: { rsi?: number; near?: number },
  ): Promise<OversoldScreen>;

  getTradingMode(): Promise<TradingModeDecision>;
  setTradingMode(mode: TradingMode): Promise<TradingModeDecision>;
  getCostBasis(): Promise<CostBasisDecision>;
  setCostBasis(strategy: CostBasisStrategy): Promise<CostBasisDecision>;
}

export interface OversoldScreen {
  scanned: number;
  /** Symbols whose history couldn't be read. Reported, not silently omitted. */
  skipped: string[];
  /** Symbols beyond the server's per-scan cap. */
  dropped: number;
  threshold: number;
  nearPercent: number;
  candidates: OversoldCandidate[];
}

/** A review, a receipt, or a refusal — the plan rides along with all three. */
export interface OrderOutcome {
  review?: OrderReview;
  receipt?: OrderReceipt;
  plan?: SalePlan;
  error?: string;
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

    getEarnings(symbols) {
      if (symbols.length === 0) {
        // `asOf` has to be something; an empty result is never rendered, and
        // the alternative is making every consumer handle a null day.
        return Promise.resolve({ earnings: [], unknown: [], asOf: '' });
      }
      return request<EarningsResponse>(`/api/earnings?symbols=${symbols.join(',')}`);
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

    getOptionContracts(ids) {
      if (ids.length === 0) return Promise.resolve({ contracts: [] });
      return request<{ contracts: OptionContract[] }>(
        `/api/broker/chain/quotes?ids=${ids.join(',')}`,
      );
    },

    getTaxLots(accountId, symbol) {
      const params = new URLSearchParams({ accountId, symbol });
      return request<{ symbol: string; lots: TaxLot[] }>(`/api/broker/tax-lots?${params}`);
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

    getChainGrid(symbol, query) {
      const params = new URLSearchParams({ symbol });
      if (query?.type) params.set('type', query.type);
      if (query?.offset != null) params.set('offset', String(query.offset));
      if (query?.limit != null) params.set('limit', String(query.limit));
      return request<ChainGridResponse>(`/api/chain-grid?${params}`);
    },

    getLetfProfile(symbol) {
      return request<LetfProfileResponse>(
        `/api/letf/profile?symbol=${encodeURIComponent(symbol)}`,
      );
    },

    getLetfHoldings(symbol) {
      return request<LetfHoldingsResponse>(
        `/api/letf/holdings?symbol=${encodeURIComponent(symbol)}`,
      );
    },

    getLetfHistory(symbol, period) {
      return request<LetfHistoryResponse>(
        `/api/letf/history?symbol=${encodeURIComponent(symbol)}&period=${period}`,
      );
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

    reviewOrder(order) {
      return sendOrder(order, true);
    },

    placeOrder(order) {
      return sendOrder(order, false);
    },

    screenOversold(symbols, options = {}) {
      if (symbols.length === 0) {
        return Promise.resolve({
          scanned: 0,
          skipped: [],
          dropped: 0,
          threshold: 30,
          nearPercent: 5,
          candidates: [],
        });
      }
      const params = new URLSearchParams({ symbols: symbols.join(',') });
      if (options.rsi !== undefined) params.set('rsi', String(options.rsi));
      if (options.near !== undefined) params.set('near', String(options.near));
      return request<OversoldScreen>(`/api/screener/oversold?${params}`);
    },

    getTradingMode() {
      return request<TradingModeDecision>('/api/broker/trading-mode');
    },

    setTradingMode(mode) {
      return request<TradingModeDecision>('/api/broker/trading-mode', {
        method: 'PUT',
        body: JSON.stringify({ mode }),
      });
    },

    getCostBasis() {
      return request<CostBasisDecision>('/api/broker/cost-basis');
    },

    setCostBasis(strategy) {
      return request<CostBasisDecision>('/api/broker/cost-basis', {
        method: 'PUT',
        body: JSON.stringify({ strategy }),
      });
    },
  };

  /**
   * Send an order, and read the body whatever the status.
   *
   * Unlike every other call here, a refusal is not an exception — a rejected
   * order still carries the sale plan and the broker's reason, and both belong
   * on screen. Throwing would leave the caller with a message and nothing to
   * act on.
   */
  async function sendOrder(order: OrderRequest, review: boolean): Promise<OrderOutcome> {
    const authHeaders = getAuthHeaders ? await getAuthHeaders() : {};
    try {
      const res = await doFetch(`${baseUrl}/api/broker/orders${review ? '?review=1' : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(order),
      });
      return (await res.json()) as OrderOutcome;
    } catch {
      // A transport failure on a PLACE is the dangerous case: the order may
      // have reached the broker. Say so rather than implying nothing happened.
      return {
        error: review
          ? 'Could not reach the brokerage.'
          : 'Could not reach the brokerage — check your orders before retrying, in case this one went through.',
      };
    }
  }
}
