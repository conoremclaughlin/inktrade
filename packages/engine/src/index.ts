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

// Services
export type { MarketDataService } from './services/index.js';
export {
  YahooMarketService,
  SchwabMarketService,
  type SchwabCredentials,
  type SchwabTokens,
  type SchwabTokenStore,
  OptionsService,
} from './services/index.js';

export {
  blackScholesPrice,
  computeGreeks,
  computeLeverageSurface,
  analyzeLeverage,
  estimateLeverage,
  probabilityOfProfit,
  impliedVolatility,
  isPlausibleIV,
  leverageBand,
  probabilityBand,
  GRID_RISK_FREE_RATE,
  type LeverageSurfaceParams,
  type LeverageAnalysisParams,
  type LeverageBand,
  type ProbabilityBand,
} from './leverage.js';

// LETF
export type {
  LetfRegistryEntry,
  LetfProfile,
  LetfHolding,
  LetfHoldingsData,
  LetfHistoryPoint,
  DecaySimResult,
  MonteCarloPercentiles,
  RedDayCell,
} from './letf/index.js';
export {
  lookupLetf,
  isLetf,
  allLetfTickers,
  simulateDecay,
  annualizedDrag,
  runMonteCarlo,
  computeRedDayTable,
} from './letf/index.js';

// Config & factory
export {
  loadConfig,
  saveConfig,
  FileTokenStore,
  KeychainTokenStore,
  createTokenStore,
  type InktradeConfig,
  type ProviderType,
} from './config.js';
export {
  createMarketDataService,
  getDefaultMarketDataService,
  resetMarketDataService,
} from './factory.js';

export { reviveContract } from './wire.js';
