import type { MarketDataProvider } from './providers/provider.js';
import { YahooFinanceProvider } from './providers/yahoo.js';
import { SchwabProvider } from './providers/schwab.js';
import { loadConfig, FileTokenStore, type InktradeConfig } from './config.js';

let cachedProvider: MarketDataProvider | null = null;

export function createProvider(config: InktradeConfig): MarketDataProvider {
  if (config.provider === 'schwab' && config.schwab) {
    return new SchwabProvider(config.schwab, new FileTokenStore());
  }
  return new YahooFinanceProvider();
}

export async function getDefaultProvider(): Promise<MarketDataProvider> {
  if (cachedProvider) return cachedProvider;
  const config = await loadConfig();
  cachedProvider = createProvider(config);
  return cachedProvider;
}

export function resetProvider(): void {
  cachedProvider = null;
}
