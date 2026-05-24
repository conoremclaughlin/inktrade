import type { LetfRegistryEntry } from './types.js';

const entries: LetfRegistryEntry[] = [
  // NASDAQ-100
  { ticker: 'TQQQ', leverageFactor: 3, direction: 'bull', underlyingTicker: 'QQQ', underlyingIndex: 'NASDAQ-100', issuer: 'ProShares' },
  { ticker: 'SQQQ', leverageFactor: -3, direction: 'bear', underlyingTicker: 'QQQ', underlyingIndex: 'NASDAQ-100', issuer: 'ProShares' },
  { ticker: 'QLD', leverageFactor: 2, direction: 'bull', underlyingTicker: 'QQQ', underlyingIndex: 'NASDAQ-100', issuer: 'ProShares' },
  { ticker: 'QID', leverageFactor: -2, direction: 'bear', underlyingTicker: 'QQQ', underlyingIndex: 'NASDAQ-100', issuer: 'ProShares' },

  // S&P 500
  { ticker: 'UPRO', leverageFactor: 3, direction: 'bull', underlyingTicker: 'SPY', underlyingIndex: 'S&P 500', issuer: 'ProShares' },
  { ticker: 'SPXU', leverageFactor: -3, direction: 'bear', underlyingTicker: 'SPY', underlyingIndex: 'S&P 500', issuer: 'ProShares' },
  { ticker: 'SPXL', leverageFactor: 3, direction: 'bull', underlyingTicker: 'SPY', underlyingIndex: 'S&P 500', issuer: 'Direxion' },
  { ticker: 'SPXS', leverageFactor: -3, direction: 'bear', underlyingTicker: 'SPY', underlyingIndex: 'S&P 500', issuer: 'Direxion' },
  { ticker: 'SSO', leverageFactor: 2, direction: 'bull', underlyingTicker: 'SPY', underlyingIndex: 'S&P 500', issuer: 'ProShares' },
  { ticker: 'SDS', leverageFactor: -2, direction: 'bear', underlyingTicker: 'SPY', underlyingIndex: 'S&P 500', issuer: 'ProShares' },

  // Semiconductors
  { ticker: 'SOXL', leverageFactor: 3, direction: 'bull', underlyingTicker: 'SOXX', underlyingIndex: 'PHLX Semiconductor', issuer: 'Direxion' },
  { ticker: 'SOXS', leverageFactor: -3, direction: 'bear', underlyingTicker: 'SOXX', underlyingIndex: 'PHLX Semiconductor', issuer: 'Direxion' },

  // Russell 2000
  { ticker: 'TNA', leverageFactor: 3, direction: 'bull', underlyingTicker: 'IWM', underlyingIndex: 'Russell 2000', issuer: 'Direxion' },
  { ticker: 'TZA', leverageFactor: -3, direction: 'bear', underlyingTicker: 'IWM', underlyingIndex: 'Russell 2000', issuer: 'Direxion' },
  { ticker: 'UWM', leverageFactor: 2, direction: 'bull', underlyingTicker: 'IWM', underlyingIndex: 'Russell 2000', issuer: 'ProShares' },

  // Financials
  { ticker: 'FAS', leverageFactor: 3, direction: 'bull', underlyingTicker: 'XLF', underlyingIndex: 'Financial Select', issuer: 'Direxion' },
  { ticker: 'FAZ', leverageFactor: -3, direction: 'bear', underlyingTicker: 'XLF', underlyingIndex: 'Financial Select', issuer: 'Direxion' },

  // Biotech
  { ticker: 'LABU', leverageFactor: 3, direction: 'bull', underlyingTicker: 'XBI', underlyingIndex: 'S&P Biotech', issuer: 'Direxion' },
  { ticker: 'LABD', leverageFactor: -3, direction: 'bear', underlyingTicker: 'XBI', underlyingIndex: 'S&P Biotech', issuer: 'Direxion' },

  // Technology
  { ticker: 'TECL', leverageFactor: 3, direction: 'bull', underlyingTicker: 'XLK', underlyingIndex: 'Technology Select', issuer: 'Direxion' },
  { ticker: 'TECS', leverageFactor: -3, direction: 'bear', underlyingTicker: 'XLK', underlyingIndex: 'Technology Select', issuer: 'Direxion' },

  // Home Construction
  { ticker: 'NAIL', leverageFactor: 3, direction: 'bull', underlyingTicker: 'ITB', underlyingIndex: 'Home Construction', issuer: 'Direxion' },

  // FANG+
  { ticker: 'FNGU', leverageFactor: 3, direction: 'bull', underlyingTicker: '^NYFANG', underlyingIndex: 'NYSE FANG+', issuer: 'MicroSectors' },
  { ticker: 'FNGD', leverageFactor: -3, direction: 'bear', underlyingTicker: '^NYFANG', underlyingIndex: 'NYSE FANG+', issuer: 'MicroSectors' },

  // Dow Jones
  { ticker: 'UDOW', leverageFactor: 3, direction: 'bull', underlyingTicker: 'DIA', underlyingIndex: 'Dow Jones 30', issuer: 'ProShares' },
  { ticker: 'SDOW', leverageFactor: -3, direction: 'bear', underlyingTicker: 'DIA', underlyingIndex: 'Dow Jones 30', issuer: 'ProShares' },

  // Energy
  { ticker: 'ERX', leverageFactor: 2, direction: 'bull', underlyingTicker: 'XLE', underlyingIndex: 'Energy Select', issuer: 'Direxion' },
  { ticker: 'ERY', leverageFactor: -2, direction: 'bear', underlyingTicker: 'XLE', underlyingIndex: 'Energy Select', issuer: 'Direxion' },

  // Gold miners
  { ticker: 'NUGT', leverageFactor: 2, direction: 'bull', underlyingTicker: 'GDX', underlyingIndex: 'Gold Miners', issuer: 'Direxion' },
  { ticker: 'DUST', leverageFactor: -2, direction: 'bear', underlyingTicker: 'GDX', underlyingIndex: 'Gold Miners', issuer: 'Direxion' },
  { ticker: 'JNUG', leverageFactor: 2, direction: 'bull', underlyingTicker: 'GDXJ', underlyingIndex: 'Junior Gold Miners', issuer: 'Direxion' },

  // Treasuries
  { ticker: 'TMF', leverageFactor: 3, direction: 'bull', underlyingTicker: 'TLT', underlyingIndex: '20+ Year Treasury', issuer: 'Direxion' },
  { ticker: 'TMV', leverageFactor: -3, direction: 'bear', underlyingTicker: 'TLT', underlyingIndex: '20+ Year Treasury', issuer: 'Direxion' },

  // Real estate
  { ticker: 'DRN', leverageFactor: 3, direction: 'bull', underlyingTicker: 'IYR', underlyingIndex: 'Real Estate', issuer: 'Direxion' },

  // China
  { ticker: 'YINN', leverageFactor: 3, direction: 'bull', underlyingTicker: 'FXI', underlyingIndex: 'FTSE China 50', issuer: 'Direxion' },
  { ticker: 'YANG', leverageFactor: -3, direction: 'bear', underlyingTicker: 'FXI', underlyingIndex: 'FTSE China 50', issuer: 'Direxion' },

  // Healthcare
  { ticker: 'CURE', leverageFactor: 3, direction: 'bull', underlyingTicker: 'XLV', underlyingIndex: 'Healthcare Select', issuer: 'Direxion' },

  // Retail
  { ticker: 'RETL', leverageFactor: 3, direction: 'bull', underlyingTicker: 'XRT', underlyingIndex: 'S&P Retail', issuer: 'Direxion' },
];

const registry = new Map<string, LetfRegistryEntry>();
for (const e of entries) {
  registry.set(e.ticker.toUpperCase(), e);
}

export function lookupLetf(ticker: string): LetfRegistryEntry | null {
  return registry.get(ticker.toUpperCase()) ?? null;
}

export function isLetf(ticker: string): boolean {
  return registry.has(ticker.toUpperCase());
}

export function allLetfTickers(): string[] {
  return [...registry.keys()];
}
