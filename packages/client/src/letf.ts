/**
 * Leveraged ETF wire types and the arithmetic both platforms read them with.
 *
 * Declared here rather than imported from @inktrade/engine/letf for the same
 * reason as ./analytics.ts: the dependency arrow runs engine -> client, so
 * importing back would close a cycle. The engine owns the *models* (decay,
 * Monte Carlo, the red-day table); this file owns the shapes that cross the
 * wire and the summary arithmetic that reads them.
 */

export type LetfDirection = 'bull' | 'bear';

export interface LetfRegistryWire {
  ticker: string;
  /** Signed: +3 for a 3x bull fund, -3 for a 3x inverse. */
  leverageFactor: number;
  direction: LetfDirection;
  underlyingTicker: string;
  underlyingIndex: string;
  issuer: string;
}

export interface LetfProfileResponse {
  registry: LetfRegistryWire;
  expenseRatio: number | null;
  totalAssets: number | null;
  inceptionDate: string | null;
  ytdReturn: number | null;
  beta: number | null;
  fundFamily: string | null;
  categoryName: string | null;
  price: number;
  change: number;
  changePercent: number;
  trailingReturns: {
    oneMonth: number | null;
    threeMonth: number | null;
    oneYear: number | null;
    threeYear: number | null;
    fiveYear: number | null;
  };
  riskStats: {
    alpha: number;
    beta: number;
    stdDev: number;
    sharpeRatio: number;
  } | null;
}

export interface LetfHoldingWire {
  symbol: string;
  name: string;
  /** Percent of fund, 0-100. */
  weight: number;
  change1D: number | null;
  change1W: number | null;
  change1M: number | null;
}

export interface LetfHoldingsResponse {
  holdings: LetfHoldingWire[];
  /** Yahoo's sector keys mapped to percent, 0-100. */
  sectorWeightings: Record<string, number>;
  topConcentration: { top5: number; top10: number };
}

export interface LetfHistoryPointWire {
  /** ISO day. */
  date: string;
  letfPrice: number;
  underlyingPrice: number;
  /** Cumulative percent return since the window opened. */
  letfCumReturn: number;
  underlyingCumReturn: number;
  /** What `leverageFactor x underlying` would have returned with no decay. */
  naiveCumReturn: number;
  /** letfCumReturn - naiveCumReturn. */
  divergence: number;
}

export interface LetfHistoryResponse {
  symbol: string;
  underlying: string;
  leverageFactor: number;
  period: string;
  points: LetfHistoryPointWire[];
  maxDrawdownPct: number;
  totalLetfReturn: number;
  totalUnderlyingReturn: number;
  totalNaiveReturn: number;
  totalDivergence: number;
}

export type LetfPeriod = '1m' | '3m' | '6m' | '1y' | '2y' | '5y';

export const LETF_PERIODS: ReadonlyArray<{ value: LetfPeriod; label: string }> = [
  { value: '1m', label: '1M' },
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: '1y', label: '1Y' },
  { value: '2y', label: '2Y' },
  { value: '5y', label: '5Y' },
];

/** "3× NASDAQ-100", or "−3× NASDAQ-100" for an inverse fund. */
export function describeLetf(registry: LetfRegistryWire): string {
  const sign = registry.leverageFactor < 0 ? '−' : '';
  return `${sign}${Math.abs(registry.leverageFactor)}× ${registry.underlyingIndex}`;
}

/**
 * How little the underlying can move before a leverage ratio stops meaning
 * anything, in percentage points.
 *
 * The ratio is letfReturn / underlyingReturn, so a near-zero denominator makes
 * it explode: with the index up 0.2%, a fund up 0.9% prints as 4.5x and the
 * same fund up 1.1% prints as 5.5x. Neither is a fact about the fund — it is a
 * fact about dividing by something close to zero.
 */
export const MIN_MEANINGFUL_MOVE_PCT = 1;

export interface RealizedLeverage {
  /** What the prospectus says, signed. */
  stated: number;
  /** What the fund actually delivered over the window. Null when degenerate. */
  realized: number | null;
  /** letf − naive, percentage points. Negative means decay took a bite. */
  divergence: number;
  /** The underlying barely moved, so no ratio is computable. */
  degenerate: boolean;
  /** The fund moved opposite to its stated direction over the window. */
  inverted: boolean;
}

/**
 * The multiple the fund actually delivered, against the one on the label.
 *
 * This is the whole argument of the LETF screen in one number. A 3x fund is
 * sold as 3x, and is 3x for exactly one day at a time; across any longer window
 * the daily reset compounds into something else. Quoting the realized multiple
 * says that directly, and it's scale-free — unlike raw divergence points, which
 * can't be compared between a 4% year and a 40% one.
 *
 * Divergence is carried alongside rather than replaced by it, because the ratio
 * hides magnitude: 2.8x of a 2% move and 2.8x of a 60% move are the same
 * number and very different amounts of money.
 */
export function realizedLeverage(history: LetfHistoryResponse): RealizedLeverage {
  const stated = history.leverageFactor;
  const underlying = history.totalUnderlyingReturn;
  const letf = history.totalLetfReturn;

  if (Math.abs(underlying) < MIN_MEANINGFUL_MOVE_PCT) {
    return {
      stated,
      realized: null,
      divergence: history.totalDivergence,
      degenerate: true,
      inverted: false,
    };
  }

  const realized = letf / underlying;
  return {
    stated,
    realized,
    divergence: history.totalDivergence,
    degenerate: false,
    // Opposite signs mean the fund went the way it was built not to. Rare, and
    // worth saying out loud rather than rendering as a negative multiple the
    // reader has to decode.
    inverted: realized < 0 !== stated < 0,
  };
}

/** Sector weightings as a sorted, human-labelled list. */
export function sectorEntries(
  weightings: Record<string, number>,
): Array<{ key: string; label: string; weight: number }> {
  return Object.entries(weightings)
    .filter(([, weight]) => weight > 0)
    .map(([key, weight]) => ({ key, label: humanizeSector(key), weight }))
    .sort((a, b) => b.weight - a.weight);
}

/** Yahoo ships sector keys like `realestate` and `consumer_cyclical`. */
export function humanizeSector(key: string): string {
  const special: Record<string, string> = {
    realestate: 'Real Estate',
    healthcare: 'Healthcare',
    consumer_cyclical: 'Consumer Cyclical',
    consumer_defensive: 'Consumer Defensive',
    financial_services: 'Financial Services',
    basic_materials: 'Basic Materials',
    communication_services: 'Communication Services',
    industrials: 'Industrials',
    technology: 'Technology',
    utilities: 'Utilities',
    energy: 'Energy',
  };
  if (special[key]) return special[key];
  return key
    .split(/[_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
