import type {
  Quote,
  OptionChain,
  OptionChainQuery,
  PriceHistoryBar,
  PriceHistoryQuery,
} from '../types/index.js';

// Read-only data layer — no trading, order placement, or account mutations.
export interface MarketDataService {
  readonly name: string;

  getQuote(symbol: string): Promise<Quote>;

  getQuotes(symbols: string[]): Promise<Quote[]>;

  getOptionChain(query: OptionChainQuery): Promise<OptionChain>;

  getPriceHistory(query: PriceHistoryQuery): Promise<PriceHistoryBar[]>;
}
