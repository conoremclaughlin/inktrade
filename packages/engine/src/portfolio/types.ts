export interface CorrelationPair {
  symbolA: string;
  symbolB: string;
  correlation: number;
}

export interface CorrelationMatrix {
  symbols: string[];
  matrix: number[][];
  pairs: CorrelationPair[];
}

export interface DrawdownPoint {
  date: string;
  drawdownPct: number;
}

export interface DrawdownSeries {
  symbol: string;
  current: number;
  max: number;
  series: DrawdownPoint[];
}

export interface DrawdownOverlap {
  date: string;
  tickersInDrawdown: string[];
  avgDrawdown: number;
}

export interface DrawdownAnalysis {
  tickers: DrawdownSeries[];
  overlaps: DrawdownOverlap[];
}

export type VolRegime = 'low' | 'normal' | 'elevated' | 'high';

export interface MomentumScore {
  raw: number;
  percentile: number;
}

export type StrategyType =
  | 'directional-calls'
  | 'put-credit-spread'
  | 'letf-hold'
  | 'momentum-stock'
  | 'caution';

export interface TickerAnalysis {
  symbol: string;
  price: number;
  changePercent: number;
  annualizedReturn: number;
  maxDrawdownPct: number;
  currentDrawdownPct: number;
  volatility: number;
  volRegime: VolRegime;
  momentumScore: MomentumScore;
  suggestedStrategy: StrategyType;
}

export interface RiskWarning {
  type: 'high-correlation' | 'sector-concentration' | 'drawdown-cluster' | 'vol-regime';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  tickers: string[];
}

export interface PortfolioAnalysis {
  tickers: TickerAnalysis[];
  correlation: CorrelationMatrix;
  drawdown: DrawdownAnalysis;
  warnings: RiskWarning[];
  computedAt: string;
}
