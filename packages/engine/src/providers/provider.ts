import type {
  Quote,
  OptionChain,
  OptionChainQuery,
  PriceHistoryBar,
  PriceHistoryQuery,
} from '../types/index.js';

// Read-only interface — no trading, order placement, or account mutations.
export interface MarketDataProvider {
  readonly name: string;

  getQuote(symbol: string): Promise<Quote>;

  getQuotes(symbols: string[]): Promise<Quote[]>;

  getOptionChain(query: OptionChainQuery): Promise<OptionChain>;

  getPriceHistory(query: PriceHistoryQuery): Promise<PriceHistoryBar[]>;
}
