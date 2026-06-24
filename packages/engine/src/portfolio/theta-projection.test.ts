import { describe, it, expect } from 'vitest';
import { computeSpreadProjection } from './theta-projection.js';

const BASE = {
  shortStrike: 95,
  longStrike: 90,
  spotPrice: 100,
  iv: 0.30,
  currentDte: 30,
  netCreditReceived: 1.50,
};

describe('computeSpreadProjection', () => {
  describe('basic structure', () => {
    it('returns days array from 0 to currentDte', () => {
      const result = computeSpreadProjection(BASE);
      expect(result.days.length).toBe(31);
      expect(result.days[0].day).toBe(0);
      expect(result.days[0].dte).toBe(30);
      expect(result.days[30].day).toBe(30);
      expect(result.days[30].dte).toBe(0);
    });

    it('max profit equals net credit × 100', () => {
      const result = computeSpreadProjection(BASE);
      expect(result.maxProfit).toBe(150);
    });

    it('max loss equals (spread width - credit) × 100', () => {
      const result = computeSpreadProjection(BASE);
      expect(result.maxLoss).toBe(350);
    });

    it('scales with contracts', () => {
      const result = computeSpreadProjection({ ...BASE, contracts: 5 });
      expect(result.maxProfit).toBe(750);
      expect(result.maxLoss).toBe(1750);
    });
  });

  describe('theta decay behavior at flat price', () => {
    it('P&L increases over time (theta works for credit spread seller)', () => {
      const result = computeSpreadProjection(BASE);
      const pnls = result.days.map((d) => d.positionPnl);
      for (let i = 1; i < pnls.length; i++) {
        expect(pnls[i]).toBeGreaterThanOrEqual(pnls[i - 1] - 0.01);
      }
    });

    it('remaining premium decreases over time', () => {
      const result = computeSpreadProjection(BASE);
      const first = result.days[0].remainingPremiumPct;
      const last = result.days[result.days.length - 1].remainingPremiumPct;
      expect(last).toBeLessThan(first);
    });

    it('pnlPctOfMaxProfit approaches 100% near expiry for OTM spread', () => {
      const result = computeSpreadProjection(BASE);
      const lastDay = result.days[result.days.length - 1];
      expect(lastDay.pnlPctOfMaxProfit).toBeGreaterThan(90);
    });
  });

  describe('Greeks behavior', () => {
    it('daily theta is positive for short credit spread', () => {
      const result = computeSpreadProjection(BASE);
      expect(result.days[0].dailyTheta).toBeGreaterThan(0);
    });

    it('gamma risk increases as DTE decreases', () => {
      const result = computeSpreadProjection({
        ...BASE,
        shortStrike: 100,
        spotPrice: 100,
        currentDte: 30,
      });
      const earlyGamma = result.days[0].gammaRiskDollars;
      const lateGamma = result.days[25].gammaRiskDollars;
      expect(lateGamma).toBeGreaterThan(earlyGamma);
    });

    it('delta is near zero for far-OTM spread', () => {
      const result = computeSpreadProjection({
        ...BASE,
        shortStrike: 80,
        longStrike: 75,
        spotPrice: 100,
      });
      expect(Math.abs(result.days[0].delta)).toBeLessThan(10);
    });
  });

  describe('closing zone', () => {
    it('identifies a closing zone for ATM spread', () => {
      const result = computeSpreadProjection({
        ...BASE,
        shortStrike: 100,
        longStrike: 95,
        spotPrice: 100,
        currentDte: 45,
      });
      expect(result.closingZone).not.toBeNull();
      if (result.closingZone) {
        expect(result.closingZone.startDte).toBeGreaterThanOrEqual(0);
        expect(result.closingZone.startDte).toBeLessThan(45);
      }
    });

    it('closing zone may be null for deep OTM spread', () => {
      const result = computeSpreadProjection({
        ...BASE,
        shortStrike: 70,
        longStrike: 65,
        spotPrice: 100,
        currentDte: 30,
      });
      // Deep OTM — theta/gamma ratio stays favorable throughout
      // closingZone could be null or very late
    });
  });

  describe('summary stats', () => {
    it('theta/gamma ratio is positive', () => {
      const result = computeSpreadProjection(BASE);
      expect(result.summary.thetaGammaRatio).toBeGreaterThan(0);
    });

    it('remaining premium pct is between 0 and 100', () => {
      const result = computeSpreadProjection(BASE);
      expect(result.summary.remainingPremiumPct).toBeGreaterThanOrEqual(0);
      expect(result.summary.remainingPremiumPct).toBeLessThanOrEqual(100);
    });

    it('current P&L pct matches day 0', () => {
      const result = computeSpreadProjection(BASE);
      expect(result.currentPnlPct).toBeCloseTo(result.days[0].pnlPctOfMaxProfit, 6);
    });
  });

  describe('edge cases', () => {
    it('handles 1 DTE', () => {
      const result = computeSpreadProjection({ ...BASE, currentDte: 1 });
      expect(result.days.length).toBe(2);
      expect(result.days[0].dte).toBe(1);
      expect(result.days[1].dte).toBe(0);
    });

    it('handles very small credit', () => {
      const result = computeSpreadProjection({ ...BASE, netCreditReceived: 0.05 });
      expect(result.maxProfit).toBe(5);
      expect(result.days.length).toBe(31);
    });
  });
});
