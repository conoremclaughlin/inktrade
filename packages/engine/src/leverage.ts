import type {
  OptionContract,
  OptionGreeks,
  OptionType,
} from './types/market.js';
import type {
  LeverageAnalysis,
  LeveragePoint,
  LeverageScenario,
  LeverageSurface,
} from './types/leverage.js';

function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);

  const t = 1.0 / (1.0 + p * x / Math.SQRT2);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x / 2);

  return 0.5 * (1.0 + sign * y);
}

function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function d1(S: number, K: number, T: number, r: number, sigma: number): number {
  return (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
}

function d2(S: number, K: number, T: number, r: number, sigma: number): number {
  return d1(S, K, T, r, sigma) - sigma * Math.sqrt(T);
}

export function blackScholesPrice(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  type: OptionType,
): number {
  if (T <= 0) {
    return type === 'call' ? Math.max(S - K, 0) : Math.max(K - S, 0);
  }

  const D1 = d1(S, K, T, r, sigma);
  const D2 = d2(S, K, T, r, sigma);

  if (type === 'call') {
    return S * normalCDF(D1) - K * Math.exp(-r * T) * normalCDF(D2);
  }
  return K * Math.exp(-r * T) * normalCDF(-D2) - S * normalCDF(-D1);
}

export function computeGreeks(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  type: OptionType,
): OptionGreeks {
  if (T <= 0) {
    const itm = type === 'call' ? S > K : S < K;
    return {
      delta: itm ? (type === 'call' ? 1 : -1) : 0,
      gamma: 0,
      theta: 0,
      vega: 0,
      rho: 0,
      impliedVolatility: sigma,
    };
  }

  const D1 = d1(S, K, T, r, sigma);
  const D2 = d2(S, K, T, r, sigma);
  const sqrtT = Math.sqrt(T);
  const pdf = normalPDF(D1);
  const expRt = Math.exp(-r * T);

  let delta: number;
  let theta: number;
  let rho: number;

  if (type === 'call') {
    delta = normalCDF(D1);
    theta =
      (-S * pdf * sigma) / (2 * sqrtT) -
      r * K * expRt * normalCDF(D2);
    rho = K * T * expRt * normalCDF(D2) / 100;
  } else {
    delta = normalCDF(D1) - 1;
    theta =
      (-S * pdf * sigma) / (2 * sqrtT) +
      r * K * expRt * normalCDF(-D2);
    rho = -K * T * expRt * normalCDF(-D2) / 100;
  }

  const gamma = pdf / (S * sigma * sqrtT);
  const vega = S * pdf * sqrtT / 100;

  // theta per day
  const thetaPerDay = theta / 365;

  return {
    delta,
    gamma,
    theta: thetaPerDay,
    vega,
    rho,
    impliedVolatility: sigma,
  };
}

/**
 * The volatility that reprices the contract to what it actually trades at.
 *
 * Providers quote an IV of their own, and it cannot be taken on trust: measured
 * against Yahoo's MU chain, illiquid strikes came back at exactly 1/128, 1/64,
 * 1/32, 1/16 and 1/8 — the signature of a solver stopping at its bracket rather
 * than converging. An IV of 1.5% on a semiconductor name is not a slightly
 * wrong number, it collapses the whole log-normal distribution to a spike and
 * every probability computed from it reads 0% or 100%.
 *
 * Bisection rather than Newton-Raphson. Price is monotonically increasing in
 * volatility, so bisection cannot diverge; Newton's derivative is vega, which
 * goes to zero deep in and deep out of the money — precisely the contracts
 * where the vendor's number is worst and ours would need to be good.
 *
 * Returns null rather than a guess when there is no answer: below intrinsic
 * value no volatility reproduces the price, and quoting 0.3 there would put a
 * fabricated number under every Greek on the screen.
 */
export function impliedVolatility(
  marketPrice: number,
  S: number,
  K: number,
  T: number,
  r: number,
  type: OptionType,
  { lower = 1e-4, upper = 5, tolerance = 1e-6, maxIterations = 100 } = {},
): number | null {
  if (!Number.isFinite(marketPrice) || marketPrice <= 0) return null;
  if (T <= 0 || S <= 0 || K <= 0) return null;

  // The no-arbitrage floor. A price under it isn't a low-volatility quote, it's
  // a stale or crossed one, and no sigma solves for it.
  const intrinsic =
    type === 'call'
      ? Math.max(S - K * Math.exp(-r * T), 0)
      : Math.max(K * Math.exp(-r * T) - S, 0);
  if (marketPrice < intrinsic - 1e-8) return null;

  let lo = lower;
  let hi = upper;

  // Out of bracket above: even 500% volatility doesn't reach this price.
  if (blackScholesPrice(S, K, T, r, hi, type) < marketPrice) return null;
  if (blackScholesPrice(S, K, T, r, lo, type) > marketPrice) return null;

  for (let i = 0; i < maxIterations; i += 1) {
    const mid = (lo + hi) / 2;
    const price = blackScholesPrice(S, K, T, r, mid, type);

    if (Math.abs(price - marketPrice) < tolerance || hi - lo < tolerance) return mid;

    if (price < marketPrice) lo = mid;
    else hi = mid;
  }

  return (lo + hi) / 2;
}

/**
 * Is a provider-supplied IV usable at all?
 *
 * Only a sanity bound, and deliberately wide: a real earnings-week weekly can
 * print over 300%, so this rejects nothing but the impossible.
 *
 * It is not a way to detect a bad vendor number. Yahoo's stalled values on MU
 * included 1/32 and 1/8, and 3% and 12.5% are perfectly ordinary volatilities
 * for a quiet name — no threshold separates the two. That is why the solved
 * value is preferred over the vendor's rather than chosen between them.
 */
export function isPlausibleIV(iv: number | undefined | null): iv is number {
  return typeof iv === 'number' && Number.isFinite(iv) && iv > 0 && iv <= 5;
}

export interface LeverageSurfaceParams {
  underlying: string;
  underlyingPrice: number;
  contract: OptionContract;
  riskFreeRate?: number;
  priceRange?: { min: number; max: number };
  steps?: number;
}

export function computeLeverageSurface(params: LeverageSurfaceParams): LeverageSurface {
  const {
    underlying,
    underlyingPrice,
    contract,
    riskFreeRate = 0.05,
    steps = 50,
  } = params;

  const entryPrice = contract.mark || contract.last;
  const sigma = contract.greeks.impliedVolatility || 0.3;
  const T = contract.daysToExpiration / 365;

  const range = params.priceRange ?? {
    min: underlyingPrice * 0.8,
    max: underlyingPrice * 1.2,
  };

  const stepSize = (range.max - range.min) / steps;
  const points: LeveragePoint[] = [];

  for (let i = 0; i <= steps; i++) {
    const price = range.min + i * stepSize;
    const optionPrice = blackScholesPrice(price, contract.strike, T, riskFreeRate, sigma, contract.type);
    const greeks = computeGreeks(price, contract.strike, T, riskFreeRate, sigma, contract.type);

    const pnl = contract.type === 'call'
      ? optionPrice - entryPrice
      : optionPrice - entryPrice;
    const pnlPercent = entryPrice > 0 ? (pnl / entryPrice) * 100 : 0;

    const underlyingPnlPercent = ((price - underlyingPrice) / underlyingPrice) * 100;
    const leverage = underlyingPnlPercent !== 0 ? pnlPercent / underlyingPnlPercent : 0;

    points.push({
      underlyingPrice: price,
      optionPrice,
      leverage: Math.abs(leverage) > 100 ? 0 : leverage,
      pnl,
      pnlPercent,
      greeks,
    });
  }

  return {
    underlying,
    strike: contract.strike,
    type: contract.type,
    expiration: contract.expiration,
    entryPrice,
    underlyingEntryPrice: underlyingPrice,
    points,
  };
}

export interface LeverageAnalysisParams extends LeverageSurfaceParams {
  targets?: Array<{ price: number; date?: Date }>;
}

export function analyzeLeverage(params: LeverageAnalysisParams): LeverageAnalysis {
  const surface = computeLeverageSurface(params);
  const { contract, underlyingPrice, riskFreeRate = 0.05 } = params;
  const entryPrice = contract.mark || contract.last;
  const sigma = contract.greeks.impliedVolatility || 0.3;

  const scenarios: LeverageScenario[] = (params.targets ?? []).map((target) => {
    const targetDate = target.date ?? contract.expiration;
    const daysToTarget = Math.max(
      0,
      (targetDate.getTime() - Date.now()) / 86_400_000,
    );
    const T = daysToTarget / 365;

    const optPrice = blackScholesPrice(
      target.price,
      contract.strike,
      T,
      riskFreeRate,
      sigma,
      contract.type,
    );
    const pnl = optPrice - entryPrice;
    const pnlPercent = entryPrice > 0 ? (pnl / entryPrice) * 100 : 0;
    const underlyingPnlPercent =
      ((target.price - underlyingPrice) / underlyingPrice) * 100;
    const leverage = underlyingPnlPercent !== 0 ? pnlPercent / underlyingPnlPercent : 0;

    // probability of reaching target (simple log-normal)
    const fullT = contract.daysToExpiration / 365;
    const prob =
      fullT > 0
        ? normalCDF(
            (Math.log(target.price / underlyingPrice) -
              (riskFreeRate - 0.5 * sigma * sigma) * fullT) /
              (sigma * Math.sqrt(fullT)),
          )
        : target.price <= underlyingPrice
          ? 1
          : 0;

    return {
      targetPrice: target.price,
      targetDate,
      leverage,
      pnl,
      pnlPercent,
      probability: contract.type === 'call' ? 1 - prob : prob,
    };
  });

  const breakeven =
    contract.type === 'call'
      ? contract.strike + entryPrice
      : contract.strike - entryPrice;

  const maxLeverage = surface.points.reduce(
    (max, p) => (Math.abs(p.leverage) > Math.abs(max) ? p.leverage : max),
    0,
  );

  return {
    surface,
    scenarios,
    maxLeverage,
    breakeven,
    maxRisk: -entryPrice * 100, // per contract (100 shares)
  };
}

/**
 * The default short rate for grid estimates.
 *
 * Deliberately the same 0.05 the surface and the analysis use. The grid and
 * the detail panel below it describe the same contract, so a cell reading 8.2x
 * and a panel reading something else after you click it is a bug, not a
 * rounding difference.
 */
export const GRID_RISK_FREE_RATE = 0.05;

/**
 * How much harder the option moves than the stock, if the stock reaches
 * `targetPrice`.
 *
 * This is the fast per-cell estimate — one Black-Scholes evaluation, no
 * surface. It answers "what do I get for being right" rather than "what is
 * this worth now", which is why it is quoted against a target rather than a
 * spot.
 *
 * Time is held at today's expiry distance rather than decayed to the target
 * date: the grid ranks contracts against each other, and giving each cell a
 * different amount of theta would rank them on how far away they expire
 * instead of on how much leverage they carry.
 */
export function estimateLeverage(
  contract: OptionContract,
  underlyingPrice: number,
  targetPrice: number,
  riskFreeRate: number = GRID_RISK_FREE_RATE,
): number {
  const optionPrice = contract.mark || contract.last;
  if (optionPrice <= 0) return 0;

  const stockReturn = (targetPrice - underlyingPrice) / underlyingPrice;

  // At (or effectively at) the money the ratio is 0/0. Delta-based leverage is
  // the limit of that ratio, so it's the right answer rather than a fallback.
  if (Math.abs(stockReturn) < 0.001) {
    const delta = contract.greeks.delta || 0.5;
    return Math.abs((delta * underlyingPrice) / optionPrice);
  }

  const T = contract.daysToExpiration / 365;
  if (T <= 0) return 0;

  const sigma = contract.greeks.impliedVolatility || 0.3;
  const valueAtTarget = blackScholesPrice(
    targetPrice,
    contract.strike,
    T,
    riskFreeRate,
    sigma,
    contract.type,
  );
  const optionReturn = (valueAtTarget - optionPrice) / optionPrice;

  return Math.abs(optionReturn / stockReturn);
}

/**
 * Probability the contract finishes past its breakeven at expiration.
 *
 * Breakeven, not strike — a call that expires a cent in the money still loses
 * you the premium, and reporting that as a win is the number most option
 * screens get wrong.
 */
export function probabilityOfProfit(
  contract: OptionContract,
  underlyingPrice: number,
  riskFreeRate: number = GRID_RISK_FREE_RATE,
): number {
  const optionPrice = contract.mark || contract.last;
  const T = contract.daysToExpiration / 365;
  if (T <= 0 || optionPrice <= 0) return 0;

  const sigma = contract.greeks.impliedVolatility || 0.3;
  const breakeven =
    contract.type === 'call'
      ? contract.strike + optionPrice
      : contract.strike - optionPrice;

  // A put whose breakeven sits at or below zero can't be reached at all.
  if (breakeven <= 0) return 0;

  const D2 =
    (Math.log(underlyingPrice / breakeven) + (riskFreeRate - 0.5 * sigma * sigma) * T) /
    (sigma * Math.sqrt(T));

  return contract.type === 'call' ? normalCDF(D2) : normalCDF(-D2);
}

export type LeverageBand =
  | 'negative'
  | 'minimal'
  | 'low'
  | 'moderate'
  | 'high'
  | 'strong'
  | 'extreme';

/**
 * Bucket leverage onto a shared scale.
 *
 * The buckets live here rather than in each platform's styling so web and
 * mobile agree on what counts as "high" — the colour is a rendering choice,
 * where the boundary sits is a judgement about the data, and only the first
 * of those is allowed to differ per platform.
 */
export function leverageBand(leverage: number): LeverageBand {
  if (leverage <= 0) return 'negative';
  if (leverage < 3) return 'minimal';
  if (leverage < 5) return 'low';
  if (leverage < 8) return 'moderate';
  if (leverage < 10) return 'high';
  if (leverage < 15) return 'strong';
  return 'extreme';
}

export type ProbabilityBand = 'remote' | 'unlikely' | 'even' | 'likely' | 'strong';

export function probabilityBand(probability: number): ProbabilityBand {
  if (probability >= 0.7) return 'strong';
  if (probability >= 0.5) return 'likely';
  if (probability >= 0.35) return 'even';
  if (probability >= 0.2) return 'unlikely';
  return 'remote';
}
