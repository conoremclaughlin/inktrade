export type {
  LetfRegistryEntry,
  LetfProfile,
  LetfHolding,
  LetfHoldingsData,
  LetfHistoryPoint,
  DecaySimResult,
  MonteCarloPercentiles,
  RedDayCell,
} from './types.js';

export { lookupLetf, isLetf, allLetfTickers } from './registry.js';
export { simulateDecay, annualizedDrag } from './decay.js';
export { runMonteCarlo } from './monte-carlo.js';
export { computeRedDayTable } from './red-day-table.js';
