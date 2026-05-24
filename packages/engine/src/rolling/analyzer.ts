import { blackScholesPrice, computeGreeks } from '../leverage.js';
import type {
  RollingAnalysis,
  RollingAnalysisParams,
  RollingStrategyResult,
  RollingTargetScenario,
  FrontierPoint,
} from './types.js';

const DEFAULT_ENTRY_DTES = [30, 45, 60, 75, 90, 105, 120, 150, 180, 210, 240, 270, 300, 365];
const DEFAULT_ROLL_DTES = [7, 14, 21, 30, 45, 60, 75, 90, 105, 120, 150, 180];
const DEFAULT_TARGET_PCTS = [0.05, 0.10, 0.15, 0.20];
const DEFAULT_TARGET_DAYS = [30, 60, 90];

function evaluateStrategy(
  spotPrice: number,
  iv: number,
  riskFreeRate: number,
  bidAskSpread: number,
  optionType: 'call' | 'put',
  entryDte: number,
  rollDte: number,
  targetPcts: number[],
  targetDays: number[],
): RollingStrategyResult | null {
  if (rollDte >= entryDte) return null;

  const holdingDays = entryDte - rollDte;
  if (holdingDays < 7) return null;

  const rollsPerYear = 365 / holdingDays;
  const strike = spotPrice; // ATM

  const tEntry = entryDte / 365;
  const tRoll = rollDte / 365;

  const entryPrice = blackScholesPrice(spotPrice, strike, tEntry, riskFreeRate, iv, optionType);
  const exitPrice = blackScholesPrice(spotPrice, strike, tRoll, riskFreeRate, iv, optionType);

  if (entryPrice <= 0) return null;

  const costPerRoll = entryPrice - exitPrice;
  const frictionPerRoll = bidAskSpread * 2;
  const annualThetaCost = rollsPerYear * (costPerRoll + frictionPerRoll);
  const annualCostPct = (annualThetaCost / spotPrice) * 100;

  const greeks = computeGreeks(spotPrice, strike, tEntry, riskFreeRate, iv, optionType);
  const dailyTheta = greeks.theta;

  const targets: RollingTargetScenario[] = [];

  for (const targetPct of targetPcts) {
    for (const targetDay of targetDays) {
      if (targetDay > entryDte) continue;

      const targetPrice = optionType === 'call'
        ? spotPrice * (1 + targetPct)
        : spotPrice * (1 - targetPct);

      const remainingDte = entryDte - targetDay;
      const tRemaining = Math.max(remainingDte, 0) / 365;

      const optionValueAtTarget = blackScholesPrice(
        targetPrice, strike, tRemaining, riskFreeRate, iv, optionType,
      );

      const optionReturnPct = ((optionValueAtTarget - entryPrice) / entryPrice) * 100;
      const leverageMultiple = targetPct !== 0 ? optionReturnPct / (targetPct * 100) : 0;
      const efficiencyRatio = annualCostPct > 0 ? leverageMultiple / annualCostPct : 0;

      targets.push({
        targetPct,
        targetDays: targetDay,
        optionValueAtTarget,
        optionReturnPct,
        leverageMultiple,
        efficiencyRatio,
      });
    }
  }

  return {
    entryDte,
    rollDte,
    holdingDays,
    rollsPerYear,
    entryPrice,
    exitPrice,
    costPerRoll,
    annualThetaCost,
    annualCostPct,
    dailyTheta,
    deltaAtEntry: greeks.delta,
    gammaAtEntry: greeks.gamma,
    targets,
  };
}

export function analyzeRollingStrategies(params: RollingAnalysisParams): RollingAnalysis {
  const {
    spotPrice,
    iv,
    riskFreeRate = 0.045,
    bidAskSpread = 0.15,
    optionType = 'call',
    targetPcts = DEFAULT_TARGET_PCTS,
    targetDays = DEFAULT_TARGET_DAYS,
    entryDtes = DEFAULT_ENTRY_DTES,
    rollDtes = DEFAULT_ROLL_DTES,
  } = params;

  const strategies: RollingStrategyResult[] = [];

  for (const entryDte of entryDtes) {
    for (const rollDte of rollDtes) {
      const result = evaluateStrategy(
        spotPrice, iv, riskFreeRate, bidAskSpread, optionType,
        entryDte, rollDte, targetPcts, targetDays,
      );
      if (result) strategies.push(result);
    }
  }

  // Build efficient frontier for the primary target (first targetPct + first targetDay)
  const primaryTargetPct = targetPcts[0] ?? 0.10;
  const primaryTargetDays = targetDays[0] ?? 60;

  const frontier: FrontierPoint[] = strategies
    .map((s) => {
      const target = s.targets.find(
        (t) => t.targetPct === primaryTargetPct && t.targetDays === primaryTargetDays,
      );
      if (!target || target.leverageMultiple <= 0) return null;
      return {
        annualCostPct: s.annualCostPct,
        leverage: target.leverageMultiple,
        entryDte: s.entryDte,
        rollDte: s.rollDte,
        efficiency: target.efficiencyRatio,
      };
    })
    .filter((p): p is FrontierPoint => p !== null)
    .sort((a, b) => a.annualCostPct - b.annualCostPct);

  // Find Pareto-optimal frontier (max leverage for each cost level)
  const paretoFrontier: FrontierPoint[] = [];
  let maxLeverage = -Infinity;
  for (const point of [...frontier].sort((a, b) => b.annualCostPct - a.annualCostPct)) {
    if (point.leverage > maxLeverage) {
      maxLeverage = point.leverage;
      paretoFrontier.push(point);
    }
  }
  paretoFrontier.reverse();

  // Find optimal: highest efficiency ratio
  let optimal: RollingStrategyResult | null = null;
  let bestEfficiency = -Infinity;
  for (const s of strategies) {
    const target = s.targets.find(
      (t) => t.targetPct === primaryTargetPct && t.targetDays === primaryTargetDays,
    );
    if (target && target.efficiencyRatio > bestEfficiency && target.leverageMultiple > 0) {
      bestEfficiency = target.efficiencyRatio;
      optimal = s;
    }
  }

  return {
    spotPrice,
    iv,
    riskFreeRate,
    bidAskSpread,
    optionType,
    strategies,
    optimal,
    frontier: paretoFrontier,
  };
}
