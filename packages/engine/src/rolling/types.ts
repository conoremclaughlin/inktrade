export interface RollingStrategyConfig {
  entryDte: number;
  rollDte: number;
}

export interface RollingTargetScenario {
  targetPct: number;
  targetDays: number;
  optionValueAtTarget: number;
  optionReturnPct: number;
  leverageMultiple: number;
  efficiencyRatio: number;
}

export interface RollingStrategyResult {
  entryDte: number;
  rollDte: number;
  holdingDays: number;
  rollsPerYear: number;
  entryPrice: number;
  exitPrice: number;
  costPerRoll: number;
  annualThetaCost: number;
  annualCostPct: number;
  dailyTheta: number;
  deltaAtEntry: number;
  gammaAtEntry: number;
  targets: RollingTargetScenario[];
}

export interface RollingAnalysisParams {
  spotPrice: number;
  iv: number;
  riskFreeRate?: number;
  bidAskSpread?: number;
  optionType?: 'call' | 'put';
  targetPcts?: number[];
  targetDays?: number[];
  entryDtes?: number[];
  rollDtes?: number[];
}

export interface RollingAnalysis {
  spotPrice: number;
  iv: number;
  riskFreeRate: number;
  bidAskSpread: number;
  optionType: 'call' | 'put';
  strategies: RollingStrategyResult[];
  optimal: RollingStrategyResult | null;
  frontier: FrontierPoint[];
}

export interface FrontierPoint {
  annualCostPct: number;
  leverage: number;
  entryDte: number;
  rollDte: number;
  efficiency: number;
}
