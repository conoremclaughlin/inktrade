import { describe, it, expect } from 'vitest';
import { blackScholesPrice, computeGreeks } from './leverage.js';

describe('blackScholesPrice', () => {
  describe('ATM calls', () => {
    it('prices ATM call correctly against known value', () => {
      // S=100, K=100, T=1yr, r=5%, σ=20%
      // Known BS: ~$10.45
      const price = blackScholesPrice(100, 100, 1, 0.05, 0.20, 'call');
      expect(price).toBeCloseTo(10.45, 1);
    });

    it('ATM call with higher vol costs more', () => {
      const lowVol = blackScholesPrice(100, 100, 0.5, 0.05, 0.20, 'call');
      const highVol = blackScholesPrice(100, 100, 0.5, 0.05, 0.40, 'call');
      expect(highVol).toBeGreaterThan(lowVol);
    });

    it('ATM call with longer expiry costs more', () => {
      const short = blackScholesPrice(100, 100, 0.25, 0.05, 0.30, 'call');
      const long = blackScholesPrice(100, 100, 1.0, 0.05, 0.30, 'call');
      expect(long).toBeGreaterThan(short);
    });
  });

  describe('ITM / OTM options', () => {
    it('deep ITM call is worth at least intrinsic', () => {
      const price = blackScholesPrice(150, 100, 0.5, 0.05, 0.30, 'call');
      expect(price).toBeGreaterThan(50);
    });

    it('deep OTM call is cheap but positive', () => {
      const price = blackScholesPrice(100, 150, 0.5, 0.05, 0.30, 'call');
      expect(price).toBeGreaterThan(0);
      expect(price).toBeLessThan(5);
    });

    it('deep ITM put is worth at least PV of intrinsic', () => {
      const S = 50, K = 100, T = 0.5, r = 0.05;
      const price = blackScholesPrice(S, K, T, r, 0.30, 'put');
      // European put lower bound is K*e^(-rT) - S, not K - S (no early exercise)
      expect(price).toBeGreaterThan(K * Math.exp(-r * T) - S - 0.01);
    });

    it('deep OTM put is cheap but positive', () => {
      const price = blackScholesPrice(100, 50, 0.5, 0.05, 0.30, 'put');
      expect(price).toBeGreaterThan(0);
      expect(price).toBeLessThan(1);
    });
  });

  describe('put-call parity', () => {
    it('C - P = S - K*e^(-rT) for same strike/expiry', () => {
      const S = 100, K = 105, T = 0.5, r = 0.05, sigma = 0.30;
      const call = blackScholesPrice(S, K, T, r, sigma, 'call');
      const put = blackScholesPrice(S, K, T, r, sigma, 'put');
      const parity = S - K * Math.exp(-r * T);
      expect(call - put).toBeCloseTo(parity, 6);
    });

    it('put-call parity holds for ITM case', () => {
      const S = 120, K = 100, T = 1.0, r = 0.03, sigma = 0.25;
      const call = blackScholesPrice(S, K, T, r, sigma, 'call');
      const put = blackScholesPrice(S, K, T, r, sigma, 'put');
      const parity = S - K * Math.exp(-r * T);
      expect(call - put).toBeCloseTo(parity, 6);
    });

    it('put-call parity holds for OTM case', () => {
      const S = 80, K = 100, T = 0.25, r = 0.04, sigma = 0.35;
      const call = blackScholesPrice(S, K, T, r, sigma, 'call');
      const put = blackScholesPrice(S, K, T, r, sigma, 'put');
      const parity = S - K * Math.exp(-r * T);
      expect(call - put).toBeCloseTo(parity, 6);
    });
  });

  describe('expiration (T=0)', () => {
    it('call at expiration = max(S-K, 0)', () => {
      expect(blackScholesPrice(110, 100, 0, 0.05, 0.30, 'call')).toBe(10);
      expect(blackScholesPrice(90, 100, 0, 0.05, 0.30, 'call')).toBe(0);
    });

    it('put at expiration = max(K-S, 0)', () => {
      expect(blackScholesPrice(90, 100, 0, 0.05, 0.30, 'put')).toBe(10);
      expect(blackScholesPrice(110, 100, 0, 0.05, 0.30, 'put')).toBe(0);
    });
  });

  describe('boundary behaviors', () => {
    it('call price increases with spot price', () => {
      const p1 = blackScholesPrice(95, 100, 0.5, 0.05, 0.30, 'call');
      const p2 = blackScholesPrice(100, 100, 0.5, 0.05, 0.30, 'call');
      const p3 = blackScholesPrice(105, 100, 0.5, 0.05, 0.30, 'call');
      expect(p2).toBeGreaterThan(p1);
      expect(p3).toBeGreaterThan(p2);
    });

    it('put price decreases with spot price', () => {
      const p1 = blackScholesPrice(95, 100, 0.5, 0.05, 0.30, 'put');
      const p2 = blackScholesPrice(100, 100, 0.5, 0.05, 0.30, 'put');
      const p3 = blackScholesPrice(105, 100, 0.5, 0.05, 0.30, 'put');
      expect(p2).toBeLessThan(p1);
      expect(p3).toBeLessThan(p2);
    });

    it('call price never exceeds spot', () => {
      const price = blackScholesPrice(100, 50, 2, 0.05, 0.50, 'call');
      expect(price).toBeLessThanOrEqual(100);
    });

    it('put price never exceeds strike * e^(-rT)', () => {
      const K = 100, T = 1, r = 0.05;
      const price = blackScholesPrice(50, K, T, r, 0.50, 'put');
      expect(price).toBeLessThanOrEqual(K * Math.exp(-r * T));
    });
  });
});

describe('computeGreeks', () => {
  describe('call delta', () => {
    it('ATM call delta is near 0.5', () => {
      const g = computeGreeks(100, 100, 0.5, 0.05, 0.30, 'call');
      expect(g.delta).toBeGreaterThan(0.45);
      expect(g.delta).toBeLessThan(0.65);
    });

    it('deep ITM call delta approaches 1', () => {
      const g = computeGreeks(150, 100, 0.5, 0.05, 0.30, 'call');
      expect(g.delta).toBeGreaterThan(0.95);
    });

    it('deep OTM call delta approaches 0', () => {
      const g = computeGreeks(50, 100, 0.5, 0.05, 0.30, 'call');
      expect(g.delta).toBeLessThan(0.01);
    });

    it('call delta is always between 0 and 1', () => {
      for (const S of [50, 80, 100, 120, 150]) {
        const g = computeGreeks(S, 100, 0.5, 0.05, 0.30, 'call');
        expect(g.delta).toBeGreaterThanOrEqual(0);
        expect(g.delta).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('put delta', () => {
    it('ATM put delta is near -0.5', () => {
      const g = computeGreeks(100, 100, 0.5, 0.05, 0.30, 'put');
      expect(g.delta).toBeGreaterThan(-0.55);
      expect(g.delta).toBeLessThan(-0.35);
    });

    it('put delta = call delta - 1', () => {
      const callG = computeGreeks(100, 100, 0.5, 0.05, 0.30, 'call');
      const putG = computeGreeks(100, 100, 0.5, 0.05, 0.30, 'put');
      expect(putG.delta).toBeCloseTo(callG.delta - 1, 10);
    });
  });

  describe('gamma', () => {
    it('gamma is positive for all options', () => {
      const g = computeGreeks(100, 100, 0.5, 0.05, 0.30, 'call');
      expect(g.gamma).toBeGreaterThan(0);
    });

    it('gamma is same for call and put at same strike', () => {
      const callG = computeGreeks(100, 100, 0.5, 0.05, 0.30, 'call');
      const putG = computeGreeks(100, 100, 0.5, 0.05, 0.30, 'put');
      expect(callG.gamma).toBeCloseTo(putG.gamma, 10);
    });

    it('gamma is highest ATM', () => {
      const atm = computeGreeks(100, 100, 0.25, 0.05, 0.30, 'call');
      const itm = computeGreeks(120, 100, 0.25, 0.05, 0.30, 'call');
      const otm = computeGreeks(80, 100, 0.25, 0.05, 0.30, 'call');
      expect(atm.gamma).toBeGreaterThan(itm.gamma);
      expect(atm.gamma).toBeGreaterThan(otm.gamma);
    });
  });

  describe('theta', () => {
    it('long call theta is negative (daily)', () => {
      const g = computeGreeks(100, 100, 0.5, 0.05, 0.30, 'call');
      expect(g.theta).toBeLessThan(0);
    });

    it('long put theta is negative (daily)', () => {
      const g = computeGreeks(100, 100, 0.5, 0.05, 0.30, 'put');
      expect(g.theta).toBeLessThan(0);
    });

    it('theta magnitude increases as expiry approaches', () => {
      const far = computeGreeks(100, 100, 1.0, 0.05, 0.30, 'call');
      const near = computeGreeks(100, 100, 0.05, 0.05, 0.30, 'call');
      expect(Math.abs(near.theta)).toBeGreaterThan(Math.abs(far.theta));
    });
  });

  describe('vega', () => {
    it('vega is positive for all options', () => {
      const g = computeGreeks(100, 100, 0.5, 0.05, 0.30, 'call');
      expect(g.vega).toBeGreaterThan(0);
    });

    it('vega is same for call and put', () => {
      const callG = computeGreeks(100, 100, 0.5, 0.05, 0.30, 'call');
      const putG = computeGreeks(100, 100, 0.5, 0.05, 0.30, 'put');
      expect(callG.vega).toBeCloseTo(putG.vega, 10);
    });
  });

  describe('expiration (T=0)', () => {
    it('ITM call at expiry: delta=1, gamma=0, theta=0, vega=0', () => {
      const g = computeGreeks(110, 100, 0, 0.05, 0.30, 'call');
      expect(g.delta).toBe(1);
      expect(g.gamma).toBe(0);
      expect(g.theta).toBe(0);
      expect(g.vega).toBe(0);
    });

    it('OTM call at expiry: delta=0', () => {
      const g = computeGreeks(90, 100, 0, 0.05, 0.30, 'call');
      expect(g.delta).toBe(0);
    });

    it('ITM put at expiry: delta=-1', () => {
      const g = computeGreeks(90, 100, 0, 0.05, 0.30, 'put');
      expect(g.delta).toBe(-1);
    });
  });
});
