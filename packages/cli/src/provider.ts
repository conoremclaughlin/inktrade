import { OptionsService, getDefaultMarketDataService } from '@inktrade/engine';

let service: OptionsService | null = null;

export async function getService(): Promise<OptionsService> {
  if (!service) {
    const dataService = await getDefaultMarketDataService();
    service = new OptionsService(dataService);
  }
  return service;
}
