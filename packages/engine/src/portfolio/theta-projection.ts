import { blackScholesPrice, computeGreeks } from '../leverage.js';

export interface SpreadProjectionParams {
  shortStrike: number;
  longStrike: number;
  spotPrice: number;
  iv: number;
  currentDte: number;
  netCreditReceived: number;
  riskFreeRate?: number;
  contracts?: number;
}

export interface ProjectionDay {
  day: number;
  dte: number;
  spreadValue: number;
  positionPnl: number;
  pnlPctOfMaxProfit: number;
  remainingPremium: number;
  remainingPremiumPct: number;
  dailyTheta: number;
  gamma: number;
  gammaRiskDollars: number;
  delta: number;
  vega: number;
}

export interface SpreadProjection {
  maxProfit: number;
  maxLoss: number;
  currentPnl: number;
  currentPnlPct: number;
  days: ProjectionDay[];
  closingZone: {
    startDay: number;
    startDte: number;
    rationale: string;
  } | null;
  summary: {
    thetaPerDayNow: number;
    gammaRiskNow: number;
    thetaGammaRatio: number;
    remainingPremiumPct: number;
  };
}

function spreadValue(
  spotPrice: number,
  shortStrike: number,
  longStrike: number,
  dte: number,
  r: number,
  iv: number,
): number {
  const t = Math.max(dte, 0.5) / 365;
  if (dte <= 0) {
    const shortIntrinsic = Math.max(0, shortStrike - spotPrice);
    const longIntrinsic = Math.max(0, longStrike - spotPrice);
    return shortIntrinsic - longIntrinsic;
  }
  const shortPut = blackScholesPrice(spotPrice, shortStrike, t, r, iv, 'put');
  const longPut = blackScholesPrice(spotPrice, longStrike, t, r, iv, 'put');
  return shortPut - longPut;
}

function spreadGreeks(
  spotPrice: number,
  shortStrike: number,
  longStrike: number,
  dte: number,
  r: number,
  iv: number,
) {
  const t = Math.max(dte, 0.5) / 365;
  const shortG = computeGreeks(spotPrice, shortStrike, t, r, iv, 'put');
  const longG = computeGreeks(spotPrice, longStrike, t, r, iv, 'put');
  return {
    delta: -shortG.delta + longG.delta,
    gamma: -shortG.gamma + longG.gamma,
    theta: -shortG.theta + longG.theta,
    vega: -shortG.vega + longG.vega,
  };
}

export function computeSpreadProjection(params: SpreadProjectionParams): SpreadProjection {
  const {
    shortStrike,
    longStrike,
    spotPrice,
    iv,
    currentDte,
    netCreditReceived,
    riskFreeRate = 0.045,
    contracts = 1,
  } = params;

  const multiplier = 100 * contracts;
  const spreadWidth = shortStrike - longStrike;
  const maxProfit = netCreditReceived * multiplier;
  const maxLoss = (spreadWidth - netCreditReceived) * multiplier;

  const days: ProjectionDay[] = [];

  for (let day = 0; day <= currentDte; day++) {
    const dte = currentDte - day;
    const sv = spreadValue(spotPrice, shortStrike, longStrike, dte, riskFreeRate, iv);
    const positionPnl = (netCreditReceived - sv) * multiplier;
    const pnlPctOfMaxProfit = maxProfit > 0 ? (positionPnl / maxProfit) * 100 : 0;
    const remainingPremium = maxProfit - positionPnl;
    const remainingPremiumPct = maxProfit > 0 ? (remainingPremium / maxProfit) * 100 : 0;

    const greeks = spreadGreeks(spotPrice, shortStrike, longStrike, dte, riskFreeRate, iv);
    const dailyTheta = greeks.theta * multiplier;
    const dS = spotPrice * 0.01;
    const gammaRiskDollars = 0.5 * Math.abs(greeks.gamma) * dS * dS * multiplier;

    days.push({
      day,
      dte,
      spreadValue: sv,
      positionPnl,
      pnlPctOfMaxProfit,
      remainingPremium,
      remainingPremiumPct,
      dailyTheta,
      gamma: greeks.gamma * multiplier,
      gammaRiskDollars,
      delta: greeks.delta * multiplier,
      vega: greeks.vega * multiplier,
    });
  }

  const today = days[0];
  const currentPnl = today.positionPnl;
  const currentPnlPct = maxProfit > 0 ? (currentPnl / maxProfit) * 100 : 0;

  let closingZone: SpreadProjection['closingZone'] = null;
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    if (d.pnlPctOfMaxProfit >= 80) {
      closingZone = {
        startDay: d.day,
        startDte: d.dte,
        rationale: `80% of max profit captured at ${d.dte} DTE — remaining ${d.remainingPremiumPct.toFixed(0)}% not worth the tail risk`,
      };
      break;
    }
  }

  const thetaPerDayNow = today.dailyTheta;
  const gammaRiskNow = today.gammaRiskDollars;
  const thetaGammaRatio = gammaRiskNow > 0.001
    ? Math.abs(thetaPerDayNow) / gammaRiskNow
    : 999;

  return {
    maxProfit,
    maxLoss,
    currentPnl,
    currentPnlPct,
    days,
    closingZone,
    summary: {
      thetaPerDayNow,
      gammaRiskNow,
      thetaGammaRatio,
      remainingPremiumPct: today.remainingPremiumPct,
    },
  };
}
