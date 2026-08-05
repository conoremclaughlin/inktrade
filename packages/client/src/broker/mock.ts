import type {
  BrokerProvider,
  BrokerageAccount,
  PortfolioHistory,
  PortfolioPeriod,
  PortfolioSummary,
  Position,
} from './types.js';

/**
 * A mock brokerage, implementing the real contract.
 *
 * This exists so the mobile screens can be built and carried before Schwab
 * credentials and auth land. It is deliberately an implementation of
 * BrokerProvider rather than fixture data pasted into components — swapping it
 * for the Schwab provider should not touch a single screen.
 *
 * Values are deterministic. A seeded generator rather than Math.random means
 * the same portfolio appears on every reload, so a chart that looks wrong
 * stays wrong long enough to debug.
 */

/** Mulberry32 — small, fast, good enough for plausible-looking series. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Holding {
  symbol: string;
  assetType: 'EQUITY' | 'ETF';
  quantity: number;
  averagePrice: number;
  price: number;
  dayChangePercent: number;
}

/** A memory/semis-weighted book, matching the names Inktrade is actually built around. */
const HOLDINGS: Holding[] = [
  { symbol: 'MU',   assetType: 'EQUITY', quantity: 300, averagePrice: 88.40,  price: 121.06, dayChangePercent: 2.884 },
  { symbol: 'NVDA', assetType: 'EQUITY', quantity: 142, averagePrice: 131.28, price: 211.94, dayChangePercent: -1.39 },
  { symbol: 'SNDK', assetType: 'EQUITY', quantity: 220, averagePrice: 45.20,  price: 58.77,  dayChangePercent: 4.12 },
  { symbol: 'AVGO', assetType: 'EQUITY', quantity: 45,  averagePrice: 288.10, price: 360.45, dayChangePercent: -2.41 },
  { symbol: 'TSM',  assetType: 'EQUITY', quantity: 80,  averagePrice: 301.55, price: 434.16, dayChangePercent: -2.27 },
  { symbol: 'SOXX', assetType: 'ETF',    quantity: 60,  averagePrice: 242.00, price: 268.31, dayChangePercent: -1.08 },
];

interface OptionHolding {
  underlyingSymbol: string;
  putCall: 'CALL' | 'PUT';
  strike: number;
  expiration: string;
  contracts: number;
  averagePrice: number;
  price: number;
  dayChangePercent: number;
}

const OPTIONS: OptionHolding[] = [
  { underlyingSymbol: 'NVDA', putCall: 'CALL', strike: 210, expiration: '2026-08-21', contracts: 4,  averagePrice: 5.83, price: 8.42, dayChangePercent: 8.41 },
  { underlyingSymbol: 'MU',   putCall: 'CALL', strike: 130, expiration: '2026-09-18', contracts: 6,  averagePrice: 4.10, price: 5.36, dayChangePercent: 11.20 },
  { underlyingSymbol: 'SOXX', putCall: 'PUT',  strike: 250, expiration: '2026-08-21', contracts: -3, averagePrice: 6.40, price: 4.18, dayChangePercent: -6.75 },
];

function buildPositions(): Position[] {
  const equities: Position[] = HOLDINGS.map((h) => {
    const marketValue = h.quantity * h.price;
    // Day change is derived from the percentage so the two can never disagree.
    const prevValue = marketValue / (1 + h.dayChangePercent / 100);
    return {
      symbol: h.symbol,
      assetType: h.assetType,
      quantity: h.quantity,
      averagePrice: h.averagePrice,
      marketValue,
      dayChange: marketValue - prevValue,
      dayChangePercent: h.dayChangePercent,
    };
  });

  const options: Position[] = OPTIONS.map((o) => {
    const multiplier = 100;
    const marketValue = o.contracts * o.price * multiplier;
    const prevValue = marketValue / (1 + o.dayChangePercent / 100);
    const right = o.putCall === 'CALL' ? 'C' : 'P';
    return {
      symbol: `${o.underlyingSymbol} ${o.strike}${right}`,
      assetType: 'OPTION' as const,
      quantity: o.contracts,
      averagePrice: o.averagePrice,
      marketValue,
      dayChange: marketValue - prevValue,
      dayChangePercent: o.dayChangePercent,
      option: {
        underlyingSymbol: o.underlyingSymbol,
        putCall: o.putCall,
        strike: o.strike,
        expiration: o.expiration,
        multiplier,
      },
    };
  });

  return [...equities, ...options];
}

const CASH_BALANCE = 18_430.55;

function buildAccount(): BrokerageAccount {
  const positions = buildPositions();
  const positionValue = positions.reduce((sum, p) => sum + p.marketValue, 0);
  return {
    accountId: 'mock-account-1',
    nickname: 'Individual',
    balances: {
      liquidationValue: positionValue + CASH_BALANCE,
      cashBalance: CASH_BALANCE,
      buyingPower: CASH_BALANCE * 2,
    },
    positions,
  };
}

/** Points per period. 1D is hourly, matching the snapshot cadence we'll actually run. */
const POINTS: Record<PortfolioPeriod, number> = {
  '1D': 7, '1W': 5, '1M': 22, '3M': 65, '1Y': 252, 'ALL': 500,
};

const STEP_MS: Record<PortfolioPeriod, number> = {
  '1D': 60 * 60 * 1000,
  '1W': 24 * 60 * 60 * 1000,
  '1M': 24 * 60 * 60 * 1000,
  '3M': 24 * 60 * 60 * 1000,
  '1Y': 24 * 60 * 60 * 1000,
  'ALL': 24 * 60 * 60 * 1000,
};

/** Total drift across the window — longer horizons have grown more. */
const DRIFT: Record<PortfolioPeriod, number> = {
  '1D': 0.014, '1W': 0.031, '1M': 0.068, '3M': 0.142, '1Y': 0.412, 'ALL': 0.735,
};

const VOL: Record<PortfolioPeriod, number> = {
  '1D': 0.0022, '1W': 0.006, '1M': 0.009, '3M': 0.011, '1Y': 0.013, 'ALL': 0.015,
};

/**
 * Periods reaching back further than we could plausibly have been snapshotting
 * are flagged approximate, so the "reconstructed" UI path is exercised rather
 * than only existing in theory.
 */
const APPROXIMATE: PortfolioPeriod[] = ['1Y', 'ALL'];

/** Stable per-period offset so each series has its own shape. */
function periodSeed(period: PortfolioPeriod): number {
  let h = 0;
  for (let i = 0; i < period.length; i++) h = (h * 31 + period.charCodeAt(i)) | 0;
  return Math.abs(h) * 7919;
}

function buildHistory(period: PortfolioPeriod, endValue: number, nowMs: number): PortfolioHistory {
  const count = POINTS[period];
  const step = STEP_MS[period];
  // Seed varies per period so each series looks distinct, but is fixed across
  // reloads so a chart bug stays reproducible.
  const rand = seeded(20260805 + periodSeed(period));

  // Walk backwards from today's value so the chart's last point always equals
  // the number in the header — a mismatch there reads as a bug in the app.
  const startValue = endValue / (1 + DRIFT[period]);
  const values: number[] = new Array(count);
  values[count - 1] = endValue;

  for (let i = count - 2; i >= 0; i--) {
    const progress = i / (count - 1);
    const trend = startValue + (endValue - startValue) * progress;
    const noise = (rand() - 0.5) * 2 * VOL[period] * trend;
    values[i] = trend + noise;
  }

  const points = values.map((value, i) => ({
    t: new Date(nowMs - (count - 1 - i) * step).toISOString(),
    value: Math.round(value * 100) / 100,
  }));

  return { period, points, approximate: APPROXIMATE.includes(period) };
}

export interface MockBrokerOptions {
  /** Injected so callers control the clock — tests pass a fixed timestamp. */
  now?: () => number;
  /** Simulated network delay, ms. Zero in tests. */
  latencyMs?: number;
}

export function createMockBroker(options: MockBrokerOptions = {}): BrokerProvider {
  const now = options.now ?? (() => Date.now());
  const latency = options.latencyMs ?? 0;
  const wait = () => (latency > 0 ? new Promise((r) => setTimeout(r, latency)) : Promise.resolve());

  return {
    name: 'mock',
    isMock: true,

    async getPortfolio(): Promise<PortfolioSummary> {
      await wait();
      const account = buildAccount();
      const dayChange = account.positions.reduce((sum, p) => sum + p.dayChange, 0);
      const totalValue = account.balances.liquidationValue;
      const prevValue = totalValue - dayChange;
      return {
        totalValue,
        dayChange,
        dayChangePercent: prevValue > 0 ? (dayChange / prevValue) * 100 : 0,
        accounts: [account],
      };
    },

    async getPortfolioHistory(period: PortfolioPeriod): Promise<PortfolioHistory> {
      await wait();
      const account = buildAccount();
      return buildHistory(period, account.balances.liquidationValue, now());
    },
  };
}
