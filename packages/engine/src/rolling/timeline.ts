import { blackScholesPrice, computeGreeks } from '../leverage.js';

export type RollMode = 'dte' | 'interval';

export interface TimelineParams {
  spotPrice: number;
  targetPrice: number;
  strike: number;
  iv: number;
  optionType: 'call' | 'put';
  riskFreeRate?: number;
  bidAskSpread?: number;
  rollAtDte?: number;
  rollMode?: RollMode;
  entryDtes?: number[];
  timelineDays?: number[];
}

export interface TimelineAnalysis {
  spotPrice: number;
  targetPrice: number;
  strike: number;
  iv: number;
  stockReturnPct: number;
  strategies: TimelineStrategy[];
  timelineDays: number[];
  rollAtDte: number;
  rollMode: RollMode;
}

export interface TimelineStrategy {
  entryDte: number;
  entryPrice: number;
  deltaAtEntry: number;
  costPerRoll: number;
  rollValue: number;
  timeline: TimelineResult[];
}

export interface TimelineResult {
  daysFromNow: number;
  rollsNeeded: number;
  totalRollCost: number;
  capitalDeployed: number;
  remainingDte: number;
  optionValueAtTarget: number;
  netPnl: number;
  returnPct: number;
  netLeverage: number;
  reachable: boolean;
}

const DEFAULT_ENTRY_DTES = [30, 60, 90, 120, 150, 180, 270, 365, 545, 730];
const DEFAULT_TIMELINE_DAYS = [30, 60, 90, 120, 180, 270, 365];

export function analyzeTargetTimeline(params: TimelineParams): TimelineAnalysis {
  const {
    spotPrice,
    targetPrice,
    strike,
    iv,
    optionType,
    riskFreeRate = 0.045,
    bidAskSpread = 0.15,
    rollAtDte = 30,
    rollMode = 'dte',
    entryDtes = DEFAULT_ENTRY_DTES,
    timelineDays = DEFAULT_TIMELINE_DAYS,
  } = params;

  const stockReturnPct = ((targetPrice - spotPrice) / spotPrice) * 100;
  const strategies: TimelineStrategy[] = [];

  for (const entryDte of entryDtes) {
    if (entryDte <= rollAtDte) continue;

    const tEntry = entryDte / 365;
    const entryPrice = blackScholesPrice(spotPrice, strike, tEntry, riskFreeRate, iv, optionType);
    if (entryPrice < 0.01) continue;

    let holdingPeriod: number;
    let rollValue: number;

    if (rollMode === 'interval') {
      holdingPeriod = rollAtDte;
      const dteAtSell = entryDte - rollAtDte;
      rollValue = dteAtSell > 0
        ? blackScholesPrice(spotPrice, strike, dteAtSell / 365, riskFreeRate, iv, optionType)
        : 0;
    } else {
      holdingPeriod = entryDte - rollAtDte;
      rollValue = rollAtDte > 0
        ? blackScholesPrice(spotPrice, strike, rollAtDte / 365, riskFreeRate, iv, optionType)
        : 0;
    }

    const costPerRoll = (entryPrice - rollValue) + bidAskSpread * 2;

    const greeks = computeGreeks(spotPrice, strike, tEntry, riskFreeRate, iv, optionType);


    const timeline: TimelineResult[] = [];

    for (const days of timelineDays) {
      const rollsNeeded = Math.floor(days / holdingPeriod);
      const daysSinceLastRoll = days - rollsNeeded * holdingPeriod;
      const remainingDte = entryDte - daysSinceLastRoll;

      if (remainingDte < 1) {
        timeline.push({
          daysFromNow: days,
          rollsNeeded,
          totalRollCost: 0,
          capitalDeployed: entryPrice,
          remainingDte: 0,
          optionValueAtTarget: 0,
          netPnl: -entryPrice,
          returnPct: -100,
          netLeverage: 0,
          reachable: false,
        });
        continue;
      }

      const totalRollCost = rollsNeeded * costPerRoll;
      const capitalDeployed = entryPrice + totalRollCost;

      const tRemaining = remainingDte / 365;
      const optionValueAtTarget = blackScholesPrice(
        targetPrice, strike, tRemaining, riskFreeRate, iv, optionType,
      );

      const netPnl = optionValueAtTarget - capitalDeployed;
      const returnPct = capitalDeployed > 0 ? (netPnl / capitalDeployed) * 100 : -100;
      const netLeverage = stockReturnPct !== 0 ? returnPct / Math.abs(stockReturnPct) : 0;

      timeline.push({
        daysFromNow: days,
        rollsNeeded,
        totalRollCost,
        capitalDeployed,
        remainingDte,
        optionValueAtTarget,
        netPnl,
        returnPct,
        netLeverage,
        reachable: true,
      });
    }

    strategies.push({
      entryDte,
      entryPrice,
      deltaAtEntry: greeks.delta,
      costPerRoll,
      rollValue,
      timeline,
    });
  }

  return {
    spotPrice,
    targetPrice,
    strike,
    iv,
    stockReturnPct,
    strategies,
    timelineDays,
    rollAtDte,
    rollMode,
  };
}
