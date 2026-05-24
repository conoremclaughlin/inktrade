import type { MarketDataService } from './services/market-data.js';
import { YahooMarketService } from './services/yahoo.js';
import { SchwabMarketService } from './services/schwab.js';
import { loadConfig, createTokenStore, type InktradeConfig } from './config.js';

let cachedService: MarketDataService | null = null;

export function createMarketDataService(config: InktradeConfig): MarketDataService {
  if (config.provider === 'schwab' && config.schwab) {
    return new SchwabMarketService(config.schwab, createTokenStore());
  }
  return new YahooMarketService();
}

export async function getDefaultMarketDataService(): Promise<MarketDataService> {
  if (cachedService) return cachedService;
  const config = await loadConfig();
  cachedService = createMarketDataService(config);
  return cachedService;
}

export function resetMarketDataService(): void {
  cachedService = null;
}
