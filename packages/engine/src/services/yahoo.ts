import YahooFinance from 'yahoo-finance2';
import type { MarketDataService } from './market-data.js';
import type {
  Quote,
  OptionChain,
  OptionChainQuery,
  OptionContract,
  OptionGreeks,
  PriceHistoryBar,
  PriceHistoryQuery,
} from '../types/index.js';

interface YFCallOrPut {
  contractSymbol: string;
  strike: number;
  lastPrice: number;
  bid?: number;
  ask?: number;
  volume?: number;
  openInterest?: number;
  impliedVolatility: number;
  inTheMoney: boolean;
  expiration: Date;
  [key: string]: unknown;
}

function toGreeks(raw: YFCallOrPut): OptionGreeks {
  return {
    delta: 0,
    gamma: 0,
    theta: 0,
    vega: 0,
    rho: 0,
    impliedVolatility: raw.impliedVolatility ?? 0,
  };
}

function mapContract(
  raw: YFCallOrPut,
  underlying: string,
  type: 'call' | 'put',
): OptionContract {
  const expDate = raw.expiration instanceof Date ? raw.expiration : new Date(String(raw.expiration));
  const now = new Date();
  const dte = Math.max(0, Math.ceil((expDate.getTime() - now.getTime()) / 86_400_000));
  const bid = raw.bid ?? 0;
  const ask = raw.ask ?? 0;
  const last = raw.lastPrice ?? 0;

  return {
    symbol: raw.contractSymbol,
    underlying,
    type,
    strike: raw.strike,
    expiration: expDate,
    bid,
    ask,
    last,
    mark: bid && ask ? (bid + ask) / 2 : last,
    volume: raw.volume ?? 0,
    openInterest: raw.openInterest ?? 0,
    greeks: toGreeks(raw),
    inTheMoney: raw.inTheMoney,
    daysToExpiration: dte,
  };
}

/**
 * A Yahoo quote, with the day's move recomputed rather than trusted.
 *
 * Yahoo's own change fields are wrong for some symbols. Measured on ^TNX (the
 * 10-year yield): price 4.67, previous close 4.617, and a reported change of
 * -4.617 — exactly the negative of the previous close, i.e. computed against a
 * price of zero. That renders as "10Y -49.7%", which on a macro strip is not a
 * small cosmetic error but an alarming and completely false claim.
 *
 * Price and previous close are two numbers we can see and sanity-check;
 * `regularMarketChange` is one we cannot. So the move is derived from the two
 * when both are usable, and the vendor's figure is the fallback rather than
 * the source.
 */
export function normalizeYahooQuote(
  raw: Record<string, unknown>,
  /**
   * The symbol we asked for.
   *
   * Authoritative: Yahoo's response union includes rows that carry no symbol
   * at all, and a quote that can't say what it's a quote of is worse than
   * useless on a screen full of them.
   */
  requestedSymbol?: string,
): Quote {
  const price = numberAt(raw, 'regularMarketPrice') ?? 0;
  const previousClose = numberAt(raw, 'regularMarketPreviousClose') ?? 0;

  const derivable = Number.isFinite(price) && previousClose > 0;
  const change = derivable
    ? price - previousClose
    : (numberAt(raw, 'regularMarketChange') ?? 0);
  const changePercent = derivable
    ? ((price - previousClose) / previousClose) * 100
    : (numberAt(raw, 'regularMarketChangePercent') ?? 0);

  return {
    symbol: (typeof raw.symbol === 'string' ? raw.symbol : undefined) ?? requestedSymbol ?? '',
    price,
    change,
    changePercent,
    volume: numberAt(raw, 'regularMarketVolume') ?? 0,
    high: numberAt(raw, 'regularMarketDayHigh') ?? 0,
    low: numberAt(raw, 'regularMarketDayLow') ?? 0,
    open: numberAt(raw, 'regularMarketOpen') ?? 0,
    previousClose,
    marketCap: numberAt(raw, 'marketCap'),
    timestamp: new Date(),
  };
}

/**
 * Read a numeric field, tolerating a response union that TypeScript can't
 * narrow — yahoo-finance2's quote() can return rows with none of these fields.
 */
function numberAt(raw: Record<string, unknown>, key: string): number | undefined {
  const value = raw[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export class YahooMarketService implements MarketDataService {
  readonly name = 'yahoo-finance';
  private yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

  async getQuote(symbol: string): Promise<Quote> {
    return normalizeYahooQuote(
      (await this.yf.quote(symbol)) as unknown as Record<string, unknown>,
      symbol,
    );
  }

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    return Promise.all(symbols.map((s) => this.getQuote(s)));
  }

  async getOptionChain(query: OptionChainQuery): Promise<OptionChain> {
    const opts: { date?: Date } = {};
    if (query.expiration) {
      opts.date = query.expiration;
    }

    const result = await this.yf.options(query.symbol, opts);

    const firstOption = result.options?.[0];
    const rawCalls = (firstOption?.calls ?? []) as unknown as YFCallOrPut[];
    const rawPuts = (firstOption?.puts ?? []) as unknown as YFCallOrPut[];

    let calls = rawCalls.map((c: YFCallOrPut) => mapContract(c, query.symbol, 'call'));
    let puts = rawPuts.map((p: YFCallOrPut) => mapContract(p, query.symbol, 'put'));

    const expirations = (result.expirationDates ?? []).map((d: Date | string) =>
      d instanceof Date ? d : new Date(String(d)),
    );

    if (query.strikeRange) {
      const { min, max } = query.strikeRange;
      calls = calls.filter((c: OptionContract) => c.strike >= min && c.strike <= max);
      puts = puts.filter((p: OptionContract) => p.strike >= min && p.strike <= max);
    }

    if (query.type === 'call') puts = [];
    if (query.type === 'put') calls = [];

    return {
      underlying: query.symbol,
      underlyingPrice: result.quote?.regularMarketPrice ?? 0,
      expirations,
      calls,
      puts,
    };
  }

  async getPriceHistory(query: PriceHistoryQuery): Promise<PriceHistoryBar[]> {
    const ms: Record<string, number> = {
      '1d': 86_400_000,
      '5d': 5 * 86_400_000,
      '1mo': 30 * 86_400_000,
      '3mo': 90 * 86_400_000,
      '6mo': 180 * 86_400_000,
      '1y': 365 * 86_400_000,
      '5y': 5 * 365 * 86_400_000,
    };

    const period1 = new Date(Date.now() - (ms[query.period] ?? 90 * 86_400_000));
    const interval = query.period === '1d' ? '5m' as const
      : query.period === '5d' ? '15m' as const
      : '1d' as const;

    const result = await this.yf.chart(query.symbol, { period1, interval });

    return (result.quotes ?? []).map((bar: Record<string, unknown>): PriceHistoryBar => ({
      timestamp: bar.date instanceof Date ? bar.date : new Date(String(bar.date)),
      open: Number(bar.open ?? 0),
      high: Number(bar.high ?? 0),
      low: Number(bar.low ?? 0),
      close: Number(bar.close ?? 0),
      volume: Number(bar.volume ?? 0),
    }));
  }
}
