import { YahooMarketService, OptionsService } from '@inktrade/engine';

let service: OptionsService | null = null;

export function getOptionsService(): OptionsService {
  if (!service) {
    service = new OptionsService(new YahooMarketService());
  }
  return service;
}
