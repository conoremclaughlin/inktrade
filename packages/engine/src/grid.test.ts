import { describe, it, expect } from 'vitest';
import {
  analyzeLeverage,
  blackScholesPrice,
  estimateLeverage,
  impliedVolatility,
  isPlausibleIV,
  leverageBand,
  probabilityBand,
  probabilityOfProfit,
} from './leverage.js';
import type { OptionContract } from './types/market.js';

function contract(overrides: Partial<OptionContract> = {}): OptionContract {
  const days = overrides.daysToExpiration ?? 90;
  return {
    symbol: 'TEST',
    underlying: 'TEST',
    type: 'call',
    strike: 100,
    expiration: new Date(Date.now() + days * 86_400_000),
    bid: 4.9,
    ask: 5.1,
    last: 5,
    mark: 5,
    volume: 100,
    openInterest: 1000,
    inTheMoney: false,
    daysToExpiration: days,
    greeks: {
      delta: 0.5,
      gamma: 0.02,
      theta: -0.05,
      vega: 0.2,
      rho: 0.1,
      impliedVolatility: 0.35,
    },
    ...overrides,
  };
}

describe('estimateLeverage', () => {
  it('reports how much harder the option moves than the stock', () => {
    // A 10% move in a $100 stock, against an ATM call at $5.
    const leverage = estimateLeverage(contract(), 100, 110);
    expect(leverage).toBeGreaterThan(1);
  });

  it('falls back to delta leverage when the target is the current price', () => {
    // 0/0 otherwise. delta * S / premium = 0.5 * 100 / 5 = 10.
    expect(estimateLeverage(contract(), 100, 100)).toBeCloseTo(10, 6);
  });

  it('treats a target within a tenth of a percent as at-the-money', () => {
    expect(estimateLeverage(contract(), 100, 100.05)).toBeCloseTo(10, 6);
  });

  it('gives a cheaper, further OTM call more leverage than a near one', () => {
    const near = estimateLeverage(contract({ strike: 100, mark: 5 }), 100, 115);
    const far = estimateLeverage(contract({ strike: 115, mark: 1.2 }), 100, 115);
    expect(far).toBeGreaterThan(near);
  });

  it('returns 0 for a worthless contract rather than dividing by zero', () => {
    expect(estimateLeverage(contract({ mark: 0, last: 0 }), 100, 110)).toBe(0);
  });

  it('returns 0 once expired', () => {
    expect(estimateLeverage(contract({ daysToExpiration: 0 }), 100, 110)).toBe(0);
  });

  it('is positive for a put when the stock falls', () => {
    // Both returns are negative for the stock and positive for the put, so the
    // ratio must not come out signed.
    const put = contract({ type: 'put', strike: 100, greeks: { ...contract().greeks, delta: -0.5 } });
    expect(estimateLeverage(put, 100, 90)).toBeGreaterThan(0);
  });
});

describe('probabilityOfProfit', () => {
  it('measures against breakeven, not the strike', () => {
    // ATM call at $5: the strike is reachable far more often than strike+premium.
    const p = probabilityOfProfit(contract(), 100);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(0.5);
  });

  it('rises as the stock moves toward the breakeven', () => {
    const atm = probabilityOfProfit(contract(), 100);
    const itm = probabilityOfProfit(contract(), 115);
    expect(itm).toBeGreaterThan(atm);
  });

  it('is near certain once the stock is already well past breakeven', () => {
    // strike 10 + $90 premium = breakeven 100, and the stock is at 130.
    expect(probabilityOfProfit(contract({ strike: 10, mark: 90 }), 130)).toBeGreaterThan(0.9);
  });

  it('a deep ITM call bought at intrinsic is a coin flip, not a sure thing', () => {
    // strike 10, premium 90, stock 100: breakeven is exactly spot, so the trade
    // needs the stock to rise at all. Depth in the money buys delta, not odds —
    // and reading "deep ITM" as "safe" is how that gets misunderstood.
    const p = probabilityOfProfit(contract({ strike: 10, mark: 90 }), 100);
    expect(p).toBeGreaterThan(0.45);
    expect(p).toBeLessThan(0.55);
  });

  it('returns 0 once expired', () => {
    expect(probabilityOfProfit(contract({ daysToExpiration: 0 }), 100)).toBe(0);
  });

  it('returns 0 rather than NaN when a put breakeven falls below zero', () => {
    // strike 5, premium 8 — breakeven -3, which the stock cannot reach.
    const put = contract({ type: 'put', strike: 5, mark: 8, last: 8 });
    expect(probabilityOfProfit(put, 100)).toBe(0);
  });

  it('calls and puts on the same strike do not both win', () => {
    const call = probabilityOfProfit(contract({ strike: 100 }), 100);
    const put = probabilityOfProfit(contract({ type: 'put', strike: 100 }), 100);
    expect(call + put).toBeLessThan(1);
  });
});

describe('bands', () => {
  it('buckets leverage on the shared scale', () => {
    expect(leverageBand(-1)).toBe('negative');
    expect(leverageBand(0)).toBe('negative');
    expect(leverageBand(2.9)).toBe('minimal');
    expect(leverageBand(3)).toBe('low');
    expect(leverageBand(5)).toBe('moderate');
    expect(leverageBand(8)).toBe('high');
    expect(leverageBand(10)).toBe('strong');
    expect(leverageBand(15)).toBe('extreme');
  });

  it('buckets probability on the shared scale', () => {
    expect(probabilityBand(0.1)).toBe('remote');
    expect(probabilityBand(0.2)).toBe('unlikely');
    expect(probabilityBand(0.35)).toBe('even');
    expect(probabilityBand(0.5)).toBe('likely');
    expect(probabilityBand(0.7)).toBe('strong');
  });
});

describe('grid and detail agree', () => {
  /**
   * The grid estimate and the full analysis describe the same contract at the
   * same target. They use different machinery — one Black-Scholes call versus a
   * 50-point surface — so this is the test that catches them drifting apart,
   * which is exactly what a cell reading one number and the panel below it
   * reading another would look like to a user.
   */
  it('the fast estimate matches the full analysis for the same target', () => {
    const c = contract({ daysToExpiration: 90 });
    const target = 115;

    const fast = estimateLeverage(c, 100, target);

    const analysis = analyzeLeverage({
      underlying: 'TEST',
      underlyingPrice: 100,
      contract: c,
      targets: [{ price: target, date: c.expiration }],
    });

    // The analysis decays to the target date; the estimate holds time constant.
    // On a target dated at expiration they should be within a few percent.
    const full = Math.abs(analysis.scenarios[0].leverage);
    expect(fast).toBeGreaterThan(full * 0.9);
    expect(fast).toBeLessThan(full * 1.1);
  });
});

describe('impliedVolatility', () => {
  it('recovers the volatility a price was generated from', () => {
    const price = blackScholesPrice(100, 100, 0.5, 0.05, 0.42, 'call');
    expect(impliedVolatility(price, 100, 100, 0.5, 0.05, 'call')).toBeCloseTo(0.42, 4);
  });

  it('recovers it for puts too', () => {
    const price = blackScholesPrice(100, 110, 0.25, 0.05, 0.6, 'put');
    expect(impliedVolatility(price, 100, 110, 0.25, 0.05, 'put')).toBeCloseTo(0.6, 4);
  });

  it('works far out of the money, where Newton would stall on vega', () => {
    const price = blackScholesPrice(100, 200, 0.5, 0.05, 0.8, 'call');
    expect(impliedVolatility(price, 100, 200, 0.5, 0.05, 'call')).toBeCloseTo(0.8, 3);
  });

  it('works deep in the money', () => {
    const price = blackScholesPrice(200, 100, 0.5, 0.05, 0.35, 'call');
    expect(impliedVolatility(price, 200, 100, 0.5, 0.05, 'call')).toBeCloseTo(0.35, 3);
  });

  it('returns null below intrinsic rather than a fabricated number', () => {
    // A $200 stock, a $100 strike, priced at $50 — under the arbitrage floor.
    expect(impliedVolatility(50, 200, 100, 0.5, 0.05, 'call')).toBeNull();
  });

  it('returns null above what any volatility can reach', () => {
    // A call cannot be worth more than the stock.
    expect(impliedVolatility(500, 100, 100, 0.5, 0.05, 'call')).toBeNull();
  });

  it('returns null on or after expiration', () => {
    expect(impliedVolatility(5, 100, 100, 0, 0.05, 'call')).toBeNull();
  });

  it('returns null for a worthless or missing price', () => {
    expect(impliedVolatility(0, 100, 100, 0.5, 0.05, 'call')).toBeNull();
    expect(impliedVolatility(NaN, 100, 100, 0.5, 0.05, 'call')).toBeNull();
  });
});

describe('isPlausibleIV', () => {
  it('cannot tell a stalled solver value from a genuinely quiet option', () => {
    // 1/32 and 1/8 are exactly what Yahoo returned on illiquid MU strikes, and
    // also exactly what a quiet utility or a bond-ETF LEAP really trades at.
    // This is why the provider solves from the mark instead of filtering.
    expect(isPlausibleIV(1 / 32)).toBe(true);
    expect(isPlausibleIV(1 / 8)).toBe(true);
  });

  it('rejects zero, negatives and non-numbers', () => {
    expect(isPlausibleIV(0)).toBe(false);
    expect(isPlausibleIV(-0.3)).toBe(false);
    expect(isPlausibleIV(undefined)).toBe(false);
    expect(isPlausibleIV(NaN)).toBe(false);
  });

  it('accepts a genuinely high earnings-week volatility', () => {
    // 300% on a weekly is real, and rejecting it would throw away good data.
    expect(isPlausibleIV(3)).toBe(true);
  });

  it('accepts ordinary equity volatility', () => {
    expect(isPlausibleIV(0.35)).toBe(true);
  });
});
