import { YahooFinanceProvider, type MarketDataProvider } from '@inktrade/core';

let provider: MarketDataProvider | null = null;

export function getProvider(): MarketDataProvider {
  if (!provider) {
    // Default to Yahoo Finance — swap to Schwab when credentials are configured
    provider = new YahooFinanceProvider();
  }
  return provider;
}

export function setProvider(p: MarketDataProvider): void {
  provider = p;
}
