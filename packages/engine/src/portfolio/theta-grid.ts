import { blackScholesPrice, computeGreeks } from '../leverage.js';

export interface PositionLeg {
  strike: number;
  optionType: 'call' | 'put';
  quantity: number;
  entryPrice: number;
}

export interface ThetaGridParams {
  legs: PositionLeg[];
  spotPrice: number;
  iv: number;
  currentDte: number;
  riskFreeRate?: number;
  daysForward?: number[];
  priceMovePcts?: number[];
}

export interface ThetaGridCell {
  daysForward: number;
  priceMovePct: number;
  spotAtMove: number;
  remainingDte: number;
  positionValue: number;
  pnlFromEntry: number;
  pnlFromNow: number;
  holdVsClose: number;
}

export interface PositionGreeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
}

export interface ThetaGridAnalysis {
  currentValue: number;
  entryCost: number;
  pnlFromEntry: number;
  daysForward: number[];
  priceMovePcts: number[];
  grid: ThetaGridCell[][];
  greeks: PositionGreeks;
}

const DEFAULT_DAYS_FORWARD = [0, 1, 2, 3, 4, 5, 7, 10, 14];
const DEFAULT_PRICE_MOVES = [-5, -3, -2, -1, -0.5, 0, 0.5, 1, 2, 3, 5];

function valuePosition(
  legs: PositionLeg[],
  spot: number,
  dte: number,
  r: number,
  iv: number,
): number {
  if (dte <= 0) {
    return legs.reduce((total, leg) => {
      const intrinsic = leg.optionType === 'call'
        ? Math.max(0, spot - leg.strike)
        : Math.max(0, leg.strike - spot);
      return total + intrinsic * leg.quantity;
    }, 0);
  }

  const t = dte / 365;
  return legs.reduce((total, leg) => {
    const price = blackScholesPrice(spot, leg.strike, t, r, iv, leg.optionType);
    return total + price * leg.quantity;
  }, 0);
}

function computePositionGreeks(
  legs: PositionLeg[],
  spot: number,
  dte: number,
  r: number,
  iv: number,
): PositionGreeks {
  const t = dte / 365;
  const agg: PositionGreeks = { delta: 0, gamma: 0, theta: 0, vega: 0 };

  for (const leg of legs) {
    const g = computeGreeks(spot, leg.strike, t, r, iv, leg.optionType);
    agg.delta += g.delta * leg.quantity;
    agg.gamma += g.gamma * leg.quantity;
    agg.theta += g.theta * leg.quantity;
    agg.vega += g.vega * leg.quantity;
  }

  return agg;
}

export function computeThetaGrid(params: ThetaGridParams): ThetaGridAnalysis {
  const {
    legs,
    spotPrice,
    iv,
    currentDte,
    riskFreeRate = 0.045,
    daysForward = DEFAULT_DAYS_FORWARD,
    priceMovePcts = DEFAULT_PRICE_MOVES,
  } = params;

  const r = riskFreeRate;
  const currentValue = valuePosition(legs, spotPrice, currentDte, r, iv);
  const entryCost = legs.reduce((total, leg) => total + leg.entryPrice * leg.quantity, 0);
  const pnlFromEntry = currentValue - entryCost;
  const greeks = computePositionGreeks(legs, spotPrice, currentDte, r, iv);

  const activeDays = daysForward.filter(d => d < currentDte);

  const grid: ThetaGridCell[][] = activeDays.map(days => {
    const remainingDte = currentDte - days;

    return priceMovePcts.map(movePct => {
      const spotAtMove = spotPrice * (1 + movePct / 100);
      const positionValue = valuePosition(legs, spotAtMove, remainingDte, r, iv);
      const pnlFromNow = positionValue - currentValue;
      const pnlTotal = positionValue - entryCost;

      return {
        daysForward: days,
        priceMovePct: movePct,
        spotAtMove,
        remainingDte,
        positionValue,
        pnlFromEntry: pnlTotal,
        pnlFromNow,
        holdVsClose: pnlFromNow,
      };
    });
  });

  return {
    currentValue,
    entryCost,
    pnlFromEntry,
    daysForward: activeDays,
    priceMovePcts,
    grid,
    greeks,
  };
}
