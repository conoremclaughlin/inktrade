export type {
  Quote,
  OptionGreeks,
  OptionType,
  OptionContract,
  OptionChain,
  OptionChainQuery,
  PriceHistoryBar,
  PriceHistoryPeriod,
  PriceHistoryQuery,
  LeveragePoint,
  LeverageSurface,
  LeverageScenario,
  LeverageAnalysis,
} from './types/index.js';

export type { MarketDataProvider } from './providers/provider.js';
export { YahooFinanceProvider } from './providers/yahoo.js';
export {
  SchwabProvider,
  type SchwabCredentials,
  type SchwabTokens,
  type SchwabTokenStore,
} from './providers/schwab.js';

export {
  blackScholesPrice,
  computeGreeks,
  computeLeverageSurface,
  analyzeLeverage,
  type LeverageSurfaceParams,
  type LeverageAnalysisParams,
} from './leverage.js';

// Services
export { MarketService } from './services/index.js';

// Config & factory
export {
  loadConfig,
  saveConfig,
  FileTokenStore,
  type InktradeConfig,
  type ProviderType,
} from './config.js';
export { createProvider, getDefaultProvider, resetProvider } from './factory.js';
