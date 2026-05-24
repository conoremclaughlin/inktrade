export interface LetfRegistryEntry {
  ticker: string;
  leverageFactor: number;
  direction: 'bull' | 'bear';
  underlyingTicker: string;
  underlyingIndex: string;
  issuer: string;
}

export interface LetfProfile {
  registry: LetfRegistryEntry;
  expenseRatio: number | null;
  totalAssets: number | null;
  inceptionDate: string | null;
  ytdReturn: number | null;
  beta: number | null;
  fundFamily: string | null;
  categoryName: string | null;
  price: number;
  change: number;
  changePercent: number;
  trailingReturns: {
    oneMonth: number | null;
    threeMonth: number | null;
    oneYear: number | null;
    threeYear: number | null;
    fiveYear: number | null;
  };
  riskStats: {
    alpha: number;
    beta: number;
    stdDev: number;
    sharpeRatio: number;
  } | null;
}

export interface LetfHolding {
  symbol: string;
  name: string;
  weight: number;
  change1D: number | null;
  change1W: number | null;
  change1M: number | null;
}

export interface LetfHoldingsData {
  holdings: LetfHolding[];
  sectorWeightings: Record<string, number>;
  topConcentration: { top5: number; top10: number };
}

export interface LetfHistoryPoint {
  date: string;
  letfCumReturn: number;
  underlyingCumReturn: number;
  naiveCumReturn: number;
  divergence: number;
}

export interface DecaySimResult {
  day: number;
  expectedValue: number;
  naiveValue: number;
}

export interface MonteCarloPercentiles {
  day: number;
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  naive: number;
}

export interface RedDayCell {
  dailyDropPct: number;
  consecutiveDays: number;
  remainingPct: number;
}
