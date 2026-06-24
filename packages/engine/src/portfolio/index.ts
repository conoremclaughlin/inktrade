export type {
  CorrelationPair,
  CorrelationMatrix,
  DrawdownPoint,
  DrawdownSeries,
  DrawdownOverlap,
  DrawdownAnalysis,
  VolRegime,
  MomentumScore,
  StrategyType,
  TickerAnalysis,
  RiskWarning,
  PortfolioAnalysis,
} from './types.js';

export type { PricePoint, AlignedReturns } from './returns.js';
export type { QuoteInfo } from './analyzer.js';

export { computeAlignedReturns } from './returns.js';
export { computeCorrelationMatrix } from './correlation.js';
export { computeDrawdownSeries, analyzeDrawdowns } from './drawdown.js';
export { computeMomentumScore } from './momentum.js';
export { analyzePortfolio } from './analyzer.js';

export type {
  PositionLeg,
  ThetaGridParams,
  ThetaGridCell,
  ThetaGridAnalysis,
  PositionGreeks,
} from './theta-grid.js';

export { computeThetaGrid } from './theta-grid.js';

export type {
  SpreadProjectionParams,
  ProjectionDay,
  SpreadProjection,
} from './theta-projection.js';

export { computeSpreadProjection } from './theta-projection.js';
