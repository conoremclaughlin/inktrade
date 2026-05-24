import type { MarketDataService } from './market-data.js';
import type {
  Quote,
  OptionChain,
  OptionChainQuery,
  OptionContract,
  OptionGreeks,
  OptionType,
  PriceHistoryBar,
  PriceHistoryQuery,
} from '../types/index.js';

// Read-only: marketdata endpoint only. Trading lives at /trader/v1 — add intentionally.
const SCHWAB_API_BASE = 'https://api.schwabapi.com/marketdata/v1';
const SCHWAB_AUTH_URL = 'https://api.schwabapi.com/v1/oauth/authorize';
const SCHWAB_TOKEN_URL = 'https://api.schwabapi.com/v1/oauth/token';

export interface SchwabCredentials {
  appKey: string;
  appSecret: string;
  redirectUri: string;
}

export interface SchwabTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  refreshExpiresAt: number;
}

export interface SchwabTokenStore {
  load(): Promise<SchwabTokens | null>;
  save(tokens: SchwabTokens): Promise<void>;
}

export class SchwabMarketService implements MarketDataService {
  readonly name = 'schwab';
  private credentials: SchwabCredentials;
  private tokenStore: SchwabTokenStore;
  private tokens: SchwabTokens | null = null;

  constructor(credentials: SchwabCredentials, tokenStore: SchwabTokenStore) {
    this.credentials = credentials;
    this.tokenStore = tokenStore;
  }

  getAuthorizationUrl(): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.credentials.appKey,
      redirect_uri: this.credentials.redirectUri,
      scope: 'api',
    });
    return `${SCHWAB_AUTH_URL}?${params}`;
  }

  async exchangeCode(code: string): Promise<void> {
    const basic = Buffer.from(
      `${this.credentials.appKey}:${this.credentials.appSecret}`,
    ).toString('base64');

    const resp = await fetch(SCHWAB_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.credentials.redirectUri,
      }),
    });

    if (!resp.ok) {
      throw new Error(`Schwab token exchange failed: ${resp.status} ${await resp.text()}`);
    }

    const data = (await resp.json()) as Record<string, unknown>;
    const now = Date.now();

    this.tokens = {
      accessToken: String(data.access_token),
      refreshToken: String(data.refresh_token),
      expiresAt: now + Number(data.expires_in) * 1000,
      refreshExpiresAt: now + 7 * 24 * 60 * 60 * 1000, // 7 days
    };

    await this.tokenStore.save(this.tokens);
  }

  private async ensureToken(): Promise<string> {
    if (!this.tokens) {
      this.tokens = await this.tokenStore.load();
    }

    if (!this.tokens) {
      throw new Error(
        'No Schwab tokens found. Run `inktrade auth schwab` to authenticate.',
      );
    }

    if (Date.now() >= this.tokens.expiresAt) {
      await this.refreshAccessToken();
    }

    return this.tokens!.accessToken;
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.tokens) throw new Error('No tokens to refresh');

    if (Date.now() >= this.tokens.refreshExpiresAt) {
      throw new Error(
        'Schwab refresh token expired (7-day limit). Run `inktrade auth schwab` to re-authenticate.',
      );
    }

    const basic = Buffer.from(
      `${this.credentials.appKey}:${this.credentials.appSecret}`,
    ).toString('base64');

    const resp = await fetch(SCHWAB_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.tokens.refreshToken,
      }),
    });

    if (!resp.ok) {
      throw new Error(`Schwab token refresh failed: ${resp.status} ${await resp.text()}`);
    }

    const data = (await resp.json()) as Record<string, unknown>;
    const now = Date.now();

    this.tokens = {
      accessToken: String(data.access_token),
      refreshToken: String(data.refresh_token ?? this.tokens.refreshToken),
      expiresAt: now + Number(data.expires_in) * 1000,
      refreshExpiresAt: this.tokens.refreshExpiresAt,
    };

    await this.tokenStore.save(this.tokens);
  }

  // GET-only: this provider is read-only by design. No POST/PUT/DELETE to Schwab.
  private async request<T>(path: string, params?: Record<string, string>): Promise<T> {
    const token = await this.ensureToken();
    const url = new URL(`${SCHWAB_API_BASE}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }

    const resp = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!resp.ok) {
      throw new Error(`Schwab API error: ${resp.status} ${await resp.text()}`);
    }

    return resp.json() as Promise<T>;
  }

  async getQuote(symbol: string): Promise<Quote> {
    const data = await this.request<Record<string, Record<string, unknown>>>(
      `/${encodeURIComponent(symbol)}/quotes`,
    );

    const q = data[symbol]?.quote as Record<string, unknown> | undefined;
    if (!q) throw new Error(`No quote data for ${symbol}`);

    return {
      symbol,
      price: Number(q.lastPrice ?? 0),
      change: Number(q.netChange ?? 0),
      changePercent: Number(q.netPercentChangeInDouble ?? 0),
      volume: Number(q.totalVolume ?? 0),
      high: Number(q.highPrice ?? 0),
      low: Number(q.lowPrice ?? 0),
      open: Number(q.openPrice ?? 0),
      previousClose: Number(q.closePrice ?? 0),
      timestamp: new Date(),
    };
  }

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    const data = await this.request<Record<string, Record<string, unknown>>>(
      '/quotes',
      { symbols: symbols.join(',') },
    );

    return symbols.map((symbol) => {
      const q = data[symbol]?.quote as Record<string, unknown> | undefined;
      return {
        symbol,
        price: Number(q?.lastPrice ?? 0),
        change: Number(q?.netChange ?? 0),
        changePercent: Number(q?.netPercentChangeInDouble ?? 0),
        volume: Number(q?.totalVolume ?? 0),
        high: Number(q?.highPrice ?? 0),
        low: Number(q?.lowPrice ?? 0),
        open: Number(q?.openPrice ?? 0),
        previousClose: Number(q?.closePrice ?? 0),
        timestamp: new Date(),
      };
    });
  }

  async getOptionChain(query: OptionChainQuery): Promise<OptionChain> {
    const params: Record<string, string> = {
      symbol: query.symbol,
      contractType: query.type?.toUpperCase() ?? 'ALL',
      includeUnderlyingQuote: 'TRUE',
      strategy: 'SINGLE',
    };

    if (query.expiration) {
      params.fromDate = query.expiration.toISOString().slice(0, 10);
      params.toDate = query.expiration.toISOString().slice(0, 10);
    }

    if (query.strikeRange) {
      params.strike = String(query.strikeRange.min);
      params.strikeCount = String(
        Math.ceil((query.strikeRange.max - query.strikeRange.min) / 0.5),
      );
    }

    if (query.strikeCount) {
      params.strikeCount = String(query.strikeCount);
    }

    const data = await this.request<Record<string, unknown>>('/chains', params);

    const underlyingPrice = Number(
      (data.underlyingPrice as number) ??
        (data.underlying as Record<string, unknown>)?.last ??
        0,
    );

    const parseContracts = (
      expMap: Record<string, Record<string, unknown[]>> | undefined,
      type: OptionType,
    ): OptionContract[] => {
      if (!expMap) return [];
      const contracts: OptionContract[] = [];

      for (const [, strikes] of Object.entries(expMap)) {
        for (const [, contractList] of Object.entries(strikes)) {
          for (const c of contractList) {
            const raw = c as Record<string, unknown>;
            const exp = new Date(String(raw.expirationDate));
            const greeks: OptionGreeks = {
              delta: Number(raw.delta ?? 0),
              gamma: Number(raw.gamma ?? 0),
              theta: Number(raw.theta ?? 0),
              vega: Number(raw.vega ?? 0),
              rho: Number(raw.rho ?? 0),
              impliedVolatility: Number(raw.volatility ?? 0),
            };

            contracts.push({
              symbol: String(raw.symbol ?? ''),
              underlying: query.symbol,
              type,
              strike: Number(raw.strikePrice ?? 0),
              expiration: exp,
              bid: Number(raw.bid ?? 0),
              ask: Number(raw.ask ?? 0),
              last: Number(raw.last ?? 0),
              mark: Number(raw.mark ?? 0),
              volume: Number(raw.totalVolume ?? 0),
              openInterest: Number(raw.openInterest ?? 0),
              greeks,
              inTheMoney: Boolean(raw.inTheMoney),
              daysToExpiration: Number(raw.daysToExpiration ?? 0),
            });
          }
        }
      }

      return contracts;
    };

    const calls = parseContracts(
      data.callExpDateMap as Record<string, Record<string, unknown[]>>,
      'call',
    );
    const puts = parseContracts(
      data.putExpDateMap as Record<string, Record<string, unknown[]>>,
      'put',
    );

    const expirations = [
      ...new Set([...calls, ...puts].map((c) => c.expiration.toISOString())),
    ].map((d) => new Date(d));

    return {
      underlying: query.symbol,
      underlyingPrice,
      expirations,
      calls,
      puts,
    };
  }

  async getPriceHistory(query: PriceHistoryQuery): Promise<PriceHistoryBar[]> {
    const periodMap: Record<string, { periodType: string; period: string; frequencyType: string; frequency: string }> = {
      '1d': { periodType: 'day', period: '1', frequencyType: 'minute', frequency: '5' },
      '5d': { periodType: 'day', period: '5', frequencyType: 'minute', frequency: '15' },
      '1mo': { periodType: 'month', period: '1', frequencyType: 'daily', frequency: '1' },
      '3mo': { periodType: 'month', period: '3', frequencyType: 'daily', frequency: '1' },
      '6mo': { periodType: 'month', period: '6', frequencyType: 'daily', frequency: '1' },
      '1y': { periodType: 'year', period: '1', frequencyType: 'daily', frequency: '1' },
      '5y': { periodType: 'year', period: '5', frequencyType: 'weekly', frequency: '1' },
    };

    const config = periodMap[query.period] ?? periodMap['3mo'];

    const data = await this.request<Record<string, unknown>>(
      `/pricehistory`,
      {
        symbol: query.symbol,
        periodType: config.periodType,
        period: config.period,
        frequencyType: config.frequencyType,
        frequency: config.frequency,
      },
    );

    const candles = (data.candles ?? []) as Record<string, unknown>[];

    return candles.map((bar) => ({
      timestamp: new Date(Number(bar.datetime)),
      open: Number(bar.open ?? 0),
      high: Number(bar.high ?? 0),
      low: Number(bar.low ?? 0),
      close: Number(bar.close ?? 0),
      volume: Number(bar.volume ?? 0),
    }));
  }
}
