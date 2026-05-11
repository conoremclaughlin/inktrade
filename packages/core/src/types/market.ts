export interface Quote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  marketCap?: number;
  timestamp: Date;
}

export interface OptionGreeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  impliedVolatility: number;
}

export type OptionType = 'call' | 'put';

export interface OptionContract {
  symbol: string;
  underlying: string;
  type: OptionType;
  strike: number;
  expiration: Date;
  bid: number;
  ask: number;
  last: number;
  mark: number;
  volume: number;
  openInterest: number;
  greeks: OptionGreeks;
  inTheMoney: boolean;
  daysToExpiration: number;
}

export interface OptionChain {
  underlying: string;
  underlyingPrice: number;
  expirations: Date[];
  calls: OptionContract[];
  puts: OptionContract[];
}

export interface OptionChainQuery {
  symbol: string;
  expiration?: Date;
  strikeRange?: {
    min: number;
    max: number;
  };
  type?: OptionType;
  strikeCount?: number;
}

export interface PriceHistoryBar {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type PriceHistoryPeriod = '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y' | '5y';

export interface PriceHistoryQuery {
  symbol: string;
  period: PriceHistoryPeriod;
}
