import type { MarketDataService } from './market-data.js';
import type {
  Quote,
  OptionChain,
  OptionChainQuery,
  OptionType,
  PriceHistoryBar,
  PriceHistoryPeriod,
} from '../types/index.js';
import type { LeverageAnalysis } from '../types/leverage.js';
import { analyzeLeverage } from '../leverage.js';

export class OptionsService {
  constructor(private dataService: MarketDataService) {}

  get serviceName(): string {
    return this.dataService.name;
  }

  async quote(symbol: string): Promise<Quote> {
    return this.dataService.getQuote(symbol.toUpperCase());
  }

  async quotes(symbols: string[]): Promise<Quote[]> {
    return this.dataService.getQuotes(symbols.map((s) => s.toUpperCase()));
  }

  async chain(params: {
    symbol: string;
    type?: OptionType;
    expiry?: string | Date;
    minStrike?: number;
    maxStrike?: number;
    strikeCount?: number;
  }): Promise<OptionChain> {
    const query: OptionChainQuery = {
      symbol: params.symbol.toUpperCase(),
      type: params.type,
      strikeCount: params.strikeCount ?? 20,
    };

    if (params.expiry) {
      query.expiration =
        params.expiry instanceof Date ? params.expiry : new Date(params.expiry);
    }

    if (params.minStrike !== undefined || params.maxStrike !== undefined) {
      query.strikeRange = {
        min: params.minStrike ?? 0,
        max: params.maxStrike ?? Infinity,
      };
    }

    return this.dataService.getOptionChain(query);
  }

  async leverage(params: {
    symbol: string;
    strike: number;
    type: OptionType;
    expiry?: string | Date;
    targets?: number[];
    rangePct?: number;
  }): Promise<LeverageAnalysis> {
    const chain = await this.chain({
      symbol: params.symbol,
      type: params.type,
      expiry: params.expiry,
    });

    const contracts = params.type === 'call' ? chain.calls : chain.puts;
    const contract = contracts.reduce((best, c) => {
      if (!best) return c;
      return Math.abs(c.strike - params.strike) < Math.abs(best.strike - params.strike)
        ? c
        : best;
    }, contracts[0]);

    if (!contract) {
      throw new Error(
        `No ${params.type} contract found near $${params.strike} for ${params.symbol}`,
      );
    }

    const rangePct = (params.rangePct ?? 20) / 100;
    const targets = (
      params.targets ?? [
        chain.underlyingPrice * 1.05,
        chain.underlyingPrice * 1.1,
        chain.underlyingPrice * 1.15,
        chain.underlyingPrice * 1.2,
      ]
    ).map((price) => ({ price }));

    return analyzeLeverage({
      underlying: params.symbol.toUpperCase(),
      underlyingPrice: chain.underlyingPrice,
      contract,
      targets,
      priceRange: {
        min: chain.underlyingPrice * (1 - rangePct),
        max: chain.underlyingPrice * (1 + rangePct),
      },
    });
  }

  async history(
    symbol: string,
    period: PriceHistoryPeriod = '3mo',
  ): Promise<PriceHistoryBar[]> {
    return this.dataService.getPriceHistory({
      symbol: symbol.toUpperCase(),
      period,
    });
  }
}
