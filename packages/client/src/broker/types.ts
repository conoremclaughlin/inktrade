/**
 * The Inktrade-shaped brokerage contract.
 *
 * Every broker — Schwab first, a mock second, whatever comes third — is
 * normalized to these types before anything renders. Screens bind to this
 * contract and never to a vendor's response shape, so adding a brokerage is
 * a new BrokerProvider rather than a change to every view.
 */

import type { Quote } from '../types.js';

export type AssetType = 'EQUITY' | 'ETF' | 'OPTION' | 'CASH';

export interface OptionDetail {
  underlyingSymbol: string;
  putCall: 'PUT' | 'CALL';
  strike: number;
  /** ISO date (YYYY-MM-DD). */
  expiration: string;
  /** Shares per contract — 100 except after a corporate action. */
  multiplier: number;
}

export interface Position {
  /** Display symbol. For options this is the readable form, e.g. "NVDA 210C". */
  symbol: string;
  assetType: AssetType;
  /** Negative for short positions. */
  quantity: number;
  averagePrice: number;
  marketValue: number;
  /** Today's P/L in dollars — Schwab's currentDayProfitLoss. */
  dayChange: number;
  dayChangePercent: number;
  /** Present only when assetType is OPTION. */
  option?: OptionDetail;
}

export interface AccountBalances {
  /** Total account value — the number at the top of the portfolio screen. */
  liquidationValue: number;
  cashBalance: number;
  buyingPower: number;
}

export interface BrokerageAccount {
  /** Schwab returns a hash here, never a raw account number. */
  accountId: string;
  nickname: string;
  balances: AccountBalances;
  positions: Position[];
}

export type PortfolioPeriod = '1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL';

export const PORTFOLIO_PERIODS: readonly PortfolioPeriod[] = [
  '1D', '1W', '1M', '3M', '1Y', 'ALL',
];

export interface PortfolioPoint {
  /** ISO timestamp. */
  t: string;
  value: number;
}

export interface PortfolioHistory {
  period: PortfolioPeriod;
  points: PortfolioPoint[];
  /**
   * True when any part of the series was reconstructed rather than recorded.
   *
   * Schwab has no portfolio-value-history endpoint, so history before we
   * started snapshotting has to be derived from transactions and price
   * history — and options positions can't be faithfully back-priced. The UI
   * must label an approximate curve rather than present it as fact.
   */
  approximate: boolean;
}

/** Everything the portfolio screen needs, in one shape. */
export interface PortfolioSummary {
  totalValue: number;
  dayChange: number;
  dayChangePercent: number;
  accounts: BrokerageAccount[];
}

export type OrderSide = 'BUY' | 'SELL';

export type OrderStatus = 'FILLED' | 'PARTIAL' | 'OPEN' | 'CANCELLED' | 'REJECTED';

/**
 * One action taken on a symbol — a share trade, an option trade, a future.
 *
 * This is the per-ticker history: rather than filtering one global activity
 * feed, a ticker screen asks for its own actions and gets only those.
 */
export interface OrderActivity {
  id: string;
  /** Underlying ticker, so an option order files under its underlying. */
  symbol: string;
  assetType: AssetType;
  side: OrderSide;
  status: OrderStatus;
  quantity: number;
  /** Average fill price. Null while an order is still working. */
  price: number | null;
  /** ISO timestamp of the fill, or of submission when unfilled. */
  timestamp: string;
  /** Present for option orders — lets the UI show strike and expiry. */
  option?: OptionDetail;
}

/**
 * One option contract, priced.
 *
 * Greeks are part of the contract rather than a separate lookup because the
 * brokerage returns them with the quote — computing them locally from a spot
 * price and an IV guess would be strictly worse than the market's own numbers.
 * They are optional because not every source provides them; a provider that
 * can't must leave them undefined rather than send zeros, which read as real.
 */
export interface OptionContract {
  /** Provider-specific contract id, used to request a fresh quote. */
  id: string;
  underlyingSymbol: string;
  putCall: 'PUT' | 'CALL';
  strike: number;
  /** ISO date (YYYY-MM-DD). */
  expiration: string;
  multiplier: number;

  bid: number | null;
  ask: number | null;
  /** Mid/mark — the price to value a position at. */
  mark: number | null;
  previousClose: number | null;

  impliedVolatility?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  rho?: number;

  openInterest?: number;
  volume?: number;
  breakEvenPrice?: number;
  /** Provider's own probability estimate, when it offers one. */
  chanceOfProfitLong?: number;
  chanceOfProfitShort?: number;
}

export interface OptionChain {
  symbol: string;
  /** The expiration these contracts belong to. */
  expiration: string;
  /** Every expiration available for the underlying, ascending. */
  expirations: string[];
  underlyingPrice: number | null;
  contracts: OptionContract[];
}

/** A watchlist as the brokerage holds it. */
export interface BrokerWatchlist {
  id: string;
  name: string;
  emoji?: string;
  symbolCount: number;
  /** False for provider-curated lists, which can only be followed. */
  editable: boolean;
}

export interface BrokerWatchlistDetail extends BrokerWatchlist {
  symbols: string[];
}

/**
 * Market data, separate from the portfolio contract.
 *
 * A brokerage that reports holdings does not necessarily serve chains, and a
 * market-data source serves chains without holding anything. Splitting them
 * lets each provider implement only what it actually has.
 */
export interface MarketDataProvider {
  getQuotes(symbols: string[]): Promise<Quote[]>;
  /** Available expirations for an underlying, ascending. */
  getOptionExpirations(symbol: string): Promise<string[]>;
  /** Omit `expiration` for the nearest one. */
  getOptionChain(symbol: string, expiration?: string): Promise<OptionChain>;
  /**
   * Price specific contracts by id.
   *
   * A chain returns every contract definition but prices only a window, so
   * this fills in the rest as the reader scrolls toward it — paying for the
   * strikes actually looked at rather than the whole ladder up front.
   */
  getOptionContracts(ids: string[]): Promise<OptionContract[]>;
  getWatchlists(): Promise<BrokerWatchlist[]>;
  getWatchlist(id: string): Promise<BrokerWatchlistDetail>;
}

export function hasMarketData(
  provider: BrokerProvider,
): provider is BrokerProvider & MarketDataProvider {
  return typeof (provider as Partial<MarketDataProvider>).getOptionChain === 'function';
}

export type OrderType = 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT';

export type TimeInForce = 'DAY' | 'GTC';

/** Which trading session an order is tagged for. */
export type MarketSession = 'REGULAR' | 'EXTENDED' | 'ALL_DAY';

export interface OrderRequest {
  accountId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  /** Share count. Exactly one of quantity or notional. */
  quantity?: number;
  /** Dollar notional — market orders only; the broker computes the shares. */
  notional?: number;
  /** Required for LIMIT and STOP_LIMIT. */
  limitPrice?: number;
  /** Required for STOP and STOP_LIMIT. */
  stopPrice?: number;
  timeInForce?: TimeInForce;
  session?: MarketSession;
  /**
   * Idempotency key. Re-send the same value when retrying a request that may
   * have reached the broker, so a network failure can't place a second order.
   */
  clientOrderId?: string;
}

/** A pre-trade check: what it would cost and what the broker objects to. */
export interface OrderReview {
  estimatedCost: number | null;
  /** Broker-side alerts — buying power, pattern day trading, halts. */
  warnings: string[];
  /** False when the broker says it would refuse the order outright. */
  acceptable: boolean;
  quotePrice: number | null;
}

export interface OrderReceipt {
  id: string;
  status: OrderStatus;
  symbol: string;
  side: OrderSide;
  quantity: number;
  /** Echo of the idempotency key, when the broker returns one. */
  clientOrderId?: string;
}

/**
 * Order placement, kept separate from {@link BrokerProvider}.
 *
 * A provider that can only read is the common case and should not have to
 * stub out methods that would place trades. Callers narrow with
 * {@link canTrade} rather than assuming.
 */
export interface TradingProvider {
  /** Accounts this provider is permitted to trade in. Often a subset. */
  tradableAccountIds(): Promise<string[]>;
  reviewOrder(request: OrderRequest): Promise<OrderReview>;
  placeOrder(request: OrderRequest): Promise<OrderReceipt>;
  cancelOrder(accountId: string, orderId: string): Promise<void>;
}

export function canTrade(
  provider: BrokerProvider,
): provider is BrokerProvider & TradingProvider {
  return typeof (provider as Partial<TradingProvider>).placeOrder === 'function';
}

export interface BrokerProvider {
  readonly name: string;
  /** True for the mock — lets the UI say so rather than quietly showing fiction. */
  readonly isMock: boolean;
  getPortfolio(): Promise<PortfolioSummary>;
  getPortfolioHistory(period: PortfolioPeriod): Promise<PortfolioHistory>;
  /**
   * Actions taken, newest first — optionally narrowed to one symbol.
   *
   * Optional because not every brokerage exposes order history, and a provider
   * that can't should be missing the method rather than returning a lie.
   */
  getOrders?(params?: { symbol?: string; limit?: number }): Promise<OrderActivity[]>;
}

/** Flatten positions across accounts — most views don't care which account. */
export function allPositions(summary: PortfolioSummary): Position[] {
  return summary.accounts.flatMap((a) => a.positions);
}

/** Readable label for an option position, e.g. "NVDA 210C 8/21". */
export function optionLabel(option: OptionDetail): string {
  const [, month, day] = option.expiration.split('-');
  const right = option.putCall === 'CALL' ? 'C' : 'P';
  return `${option.underlyingSymbol} ${option.strike}${right} ${Number(month)}/${Number(day)}`;
}
