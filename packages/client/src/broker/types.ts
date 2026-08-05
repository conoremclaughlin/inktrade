/**
 * The Inktrade-shaped brokerage contract.
 *
 * Every broker — Schwab first, a mock second, whatever comes third — is
 * normalized to these types before anything renders. Screens bind to this
 * contract and never to a vendor's response shape, so adding a brokerage is
 * a new BrokerProvider rather than a change to every view.
 */

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

export interface BrokerProvider {
  readonly name: string;
  /** True for the mock — lets the UI say so rather than quietly showing fiction. */
  readonly isMock: boolean;
  getPortfolio(): Promise<PortfolioSummary>;
  getPortfolioHistory(period: PortfolioPeriod): Promise<PortfolioHistory>;
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
