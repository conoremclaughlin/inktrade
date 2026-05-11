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

  const t = 1.0 / (1.0 + p * x);
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
