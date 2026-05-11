import { MarketService, getDefaultProvider } from '@inktrade/engine';

let service: MarketService | null = null;

export async function getService(): Promise<MarketService> {
  if (!service) {
    const provider = await getDefaultProvider();
    service = new MarketService(provider);
  }
  return service;
}
