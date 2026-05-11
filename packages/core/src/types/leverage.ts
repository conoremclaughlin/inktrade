import type { OptionGreeks, OptionType } from './market.js';

export interface LeveragePoint {
  underlyingPrice: number;
  optionPrice: number;
  leverage: number;
  pnl: number;
  pnlPercent: number;
  greeks: OptionGreeks;
}

export interface LeverageSurface {
  underlying: string;
  strike: number;
  type: OptionType;
  expiration: Date;
  entryPrice: number;
  underlyingEntryPrice: number;
  points: LeveragePoint[];
}

export interface LeverageScenario {
  targetPrice: number;
  targetDate: Date;
  leverage: number;
  pnl: number;
  pnlPercent: number;
  probability?: number;
}

export interface LeverageAnalysis {
  surface: LeverageSurface;
  scenarios: LeverageScenario[];
  maxLeverage: number;
  breakeven: number;
  maxRisk: number;
}
