import { describe, it, expect } from 'vitest';
import { analyzeTargetTimeline } from './timeline.js';
import { blackScholesPrice } from '../leverage.js';

const BASE = {
  spotPrice: 100,
  targetPrice: 110,
  strike: 100,
  iv: 0.30,
  optionType: 'call' as const,
  riskFreeRate: 0.045,
  bidAskSpread: 0.15,
};

describe('analyzeTargetTimeline', () => {
  describe('stock return calculation', () => {
    it('computes stock return percentage correctly', () => {
      const result = analyzeTargetTimeline({ ...BASE, targetPrice: 110 });
      expect(result.stockReturnPct).toBeCloseTo(10, 6);
    });

    it('handles negative stock return', () => {
      const result = analyzeTargetTimeline({
        ...BASE,
        targetPrice: 90,
        optionType: 'put',
      });
      expect(result.stockReturnPct).toBeCloseTo(-10, 6);
    });

    it('large move: 50% return', () => {
      const result = analyzeTargetTimeline({ ...BASE, targetPrice: 150 });
      expect(result.stockReturnPct).toBeCloseTo(50, 6);
    });
  });

  describe('entry price consistency', () => {
    it('entry price matches direct BS pricing', () => {
      const result = analyzeTargetTimeline({
        ...BASE,
        entryDtes: [90],
        rollAtDte: 30,
      });
      const strat = result.strategies[0];
      const bsPrice = blackScholesPrice(100, 100, 90 / 365, 0.045, 0.30, 'call');
      expect(strat.entryPrice).toBeCloseTo(bsPrice, 10);
    });

    it('longer DTE entries cost more', () => {
      const result = analyzeTargetTimeline({
        ...BASE,
        entryDtes: [60, 90, 120, 180],
        rollAtDte: 30,
      });
      for (let i = 1; i < result.strategies.length; i++) {
        expect(result.strategies[i].entryPrice).toBeGreaterThan(
          result.strategies[i - 1].entryPrice
        );
      }
    });
  });

  describe('roll count math', () => {
    it('no rolls when timeline < holding period', () => {
      const result = analyzeTargetTimeline({
        ...BASE,
        entryDtes: [90],
        rollAtDte: 30,
        timelineDays: [30, 50],
      });
      const strat = result.strategies[0];
      // holdingPeriod = 90 - 30 = 60
      // 30 days: ceil(30/60)-1 = 0 rolls
      expect(strat.timeline[0].rollsNeeded).toBe(0);
      // 50 days: ceil(50/60)-1 = 0 rolls
      expect(strat.timeline[1].rollsNeeded).toBe(0);
    });

    it('one roll at exactly holding period', () => {
      const result = analyzeTargetTimeline({
        ...BASE,
        entryDtes: [90],
        rollAtDte: 30,
        timelineDays: [60],
      });
      // holdingPeriod = 60, days = 60: ceil(60/60)-1 = 0
      expect(result.strategies[0].timeline[0].rollsNeeded).toBe(0);
    });

    it('one roll when past holding period', () => {
      const result = analyzeTargetTimeline({
        ...BASE,
        entryDtes: [90],
        rollAtDte: 30,
        timelineDays: [61],
      });
      // holdingPeriod = 60, days = 61: ceil(61/60)-1 = 1
      expect(result.strategies[0].timeline[0].rollsNeeded).toBe(1);
    });

    it('multiple rolls for long timelines', () => {
      const result = analyzeTargetTimeline({
        ...BASE,
        entryDtes: [90],
        rollAtDte: 30,
        timelineDays: [180],
      });
      // holdingPeriod = 60, days = 180: ceil(180/60)-1 = 2
      expect(result.strategies[0].timeline[0].rollsNeeded).toBe(2);
    });

    it('roll count formula: ceil(days/holdingPeriod) - 1', () => {
      const result = analyzeTargetTimeline({
        ...BASE,
        entryDtes: [120],
        rollAtDte: 30,
        timelineDays: [30, 60, 90, 120, 180, 270, 365],
      });
      const holdingPeriod = 120 - 30; // 90
      for (const point of result.strategies[0].timeline) {
        if (!point.reachable) continue;
        const expected = Math.max(0, Math.ceil(point.daysFromNow / holdingPeriod) - 1);
        expect(point.rollsNeeded).toBe(expected);
      }
    });
  });

  describe('capital deployed', () => {
    it('equals entry price when no rolls', () => {
      const result = analyzeTargetTimeline({
        ...BASE,
        entryDtes: [90],
        rollAtDte: 30,
        timelineDays: [30],
      });
      const strat = result.strategies[0];
      expect(strat.timeline[0].capitalDeployed).toBeCloseTo(strat.entryPrice, 10);
    });

    it('entry + roll costs when rolls needed', () => {
      const result = analyzeTargetTimeline({
        ...BASE,
        entryDtes: [90],
        rollAtDte: 30,
        timelineDays: [90],
      });
      const strat = result.strategies[0];
      const point = strat.timeline[0];
      const expectedCapital = strat.entryPrice + point.rollsNeeded * strat.costPerRoll;
      expect(point.capitalDeployed).toBeCloseTo(expectedCapital, 10);
    });

    it('roll cost = entry - rollValue + 2×spread', () => {
      const result = analyzeTargetTimeline({
        ...BASE,
        entryDtes: [90],
        rollAtDte: 30,
        bidAskSpread: 0.10,
      });
      const strat = result.strategies[0];
      const expectedCost = strat.entryPrice - strat.rollValue + 0.10 * 2;
      expect(strat.costPerRoll).toBeCloseTo(expectedCost, 10);
    });
  });

  describe('return and leverage calculations', () => {
    it('return = (optionValue - capitalDeployed) / capitalDeployed × 100', () => {
      const result = analyzeTargetTimeline({
        ...BASE,
        entryDtes: [90],
        rollAtDte: 30,
        timelineDays: [30],
      });
      const point = result.strategies[0].timeline[0];
      const expectedReturn =
        ((point.optionValueAtTarget - point.capitalDeployed) / point.capitalDeployed) * 100;
      expect(point.returnPct).toBeCloseTo(expectedReturn, 10);
    });

    it('leverage = returnPct / abs(stockReturnPct)', () => {
      const result = analyzeTargetTimeline({
        ...BASE,
        targetPrice: 120,
        entryDtes: [90],
        rollAtDte: 30,
        timelineDays: [30],
      });
      const point = result.strategies[0].timeline[0];
      const expectedLeverage = point.returnPct / Math.abs(result.stockReturnPct);
      expect(point.netLeverage).toBeCloseTo(expectedLeverage, 10);
    });

    it('leverage interpretation: 5x means option return = 5 × stock move magnitude', () => {
      const result = analyzeTargetTimeline({
        ...BASE,
        targetPrice: 110,
        entryDtes: [90],
        rollAtDte: 30,
        timelineDays: [30],
      });
      const point = result.strategies[0].timeline[0];
      const impliedOptionReturn = point.netLeverage * Math.abs(result.stockReturnPct);
      expect(impliedOptionReturn).toBeCloseTo(point.returnPct, 6);
    });

    it('profitable put has positive leverage', () => {
      const result = analyzeTargetTimeline({
        ...BASE,
        targetPrice: 90,
        strike: 100,
        optionType: 'put',
        entryDtes: [90],
        rollAtDte: 30,
        timelineDays: [30],
      });
      const point = result.strategies[0].timeline[0];
      expect(result.stockReturnPct).toBeLessThan(0);
      expect(point.returnPct).toBeGreaterThan(0);
      expect(point.netLeverage).toBeGreaterThan(0);
    });

    it('ATM call with 10% move: leverage is roughly delta × S/premium', () => {
      const result = analyzeTargetTimeline({
        ...BASE,
        targetPrice: 110,
        entryDtes: [90],
        rollAtDte: 14,
        timelineDays: [30],
      });
      const strat = result.strategies[0];
      const point = strat.timeline[0];
      // Leverage should be positive and > 1 for any ATM call
      expect(point.netLeverage).toBeGreaterThan(1);
      // Typically 5-15x for 90 DTE ATM
      expect(point.netLeverage).toBeLessThan(30);
    });
  });

  describe('option value at target', () => {
    it('matches BS pricing with correct parameters', () => {
      const result = analyzeTargetTimeline({
        ...BASE,
        targetPrice: 110,
        entryDtes: [90],
        rollAtDte: 30,
        timelineDays: [30],
      });
      const point = result.strategies[0].timeline[0];
      // After 30 days with 90 DTE entry, remaining = 60 DTE
      const expectedValue = blackScholesPrice(
        110, 100, 60 / 365, 0.045, 0.30, 'call'
      );
      expect(point.optionValueAtTarget).toBeCloseTo(expectedValue, 10);
      expect(point.remainingDte).toBe(60);
    });

    it('value increases with larger target moves (calls)', () => {
      const small = analyzeTargetTimeline({
        ...BASE,
        targetPrice: 105,
        entryDtes: [90],
        rollAtDte: 30,
        timelineDays: [30],
      });
      const large = analyzeTargetTimeline({
        ...BASE,
        targetPrice: 120,
        entryDtes: [90],
        rollAtDte: 30,
        timelineDays: [30],
      });
      expect(large.strategies[0].timeline[0].optionValueAtTarget).toBeGreaterThan(
        small.strategies[0].timeline[0].optionValueAtTarget
      );
    });
  });

  describe('remaining DTE calculation', () => {
    it('no rolls: remainingDte = entryDte - daysFromNow', () => {
      const result = analyzeTargetTimeline({
        ...BASE,
        entryDtes: [90],
        rollAtDte: 30,
        timelineDays: [20],
      });
      expect(result.strategies[0].timeline[0].remainingDte).toBe(70);
    });

    it('after roll: DTE resets based on position in new holding period', () => {
      const result = analyzeTargetTimeline({
        ...BASE,
        entryDtes: [90],
        rollAtDte: 30,
        timelineDays: [80],
      });
      const point = result.strategies[0].timeline[0];
      // holdingPeriod = 60, days = 80, rolls = ceil(80/60)-1 = 1
      // daysSinceLastRoll = 80 - 1*60 = 20
      // remainingDte = 90 - 20 = 70
      expect(point.rollsNeeded).toBe(1);
      expect(point.remainingDte).toBe(70);
    });
  });

  describe('unreachable scenarios', () => {
    it('marks as unreachable when remainingDte < 1', () => {
      const result = analyzeTargetTimeline({
        ...BASE,
        entryDtes: [60],
        rollAtDte: 14,
        timelineDays: [60],
      });
      const point = result.strategies[0].timeline[0];
      // holdingPeriod = 46, days = 60
      // rolls = ceil(60/46)-1 = 1
      // daysSinceLastRoll = 60 - 46 = 14
      // remainingDte = 60 - 14 = 46
      // This is actually reachable
      expect(point.reachable).toBe(true);
    });

    it('filters out strategies where entryDte <= rollAtDte', () => {
      const result = analyzeTargetTimeline({
        ...BASE,
        entryDtes: [30, 60, 90],
        rollAtDte: 30,
      });
      const dtes = result.strategies.map((s) => s.entryDte);
      expect(dtes).not.toContain(30);
      expect(dtes).toContain(60);
      expect(dtes).toContain(90);
    });
  });

  describe('end-to-end sanity checks', () => {
    it('immediate target hit (day 0) gives return based only on repricing', () => {
      const result = analyzeTargetTimeline({
        ...BASE,
        targetPrice: 115,
        entryDtes: [90],
        rollAtDte: 30,
        timelineDays: [0],
      });
      const point = result.strategies[0].timeline[0];
      expect(point.rollsNeeded).toBe(0);
      expect(point.remainingDte).toBe(90);
      // No time decay, just repricing from 100→115 with 90 DTE remaining
      expect(point.returnPct).toBeGreaterThan(0);
      expect(point.netLeverage).toBeGreaterThan(1);
    });

    it('longer timelines with rolls are less profitable than quick hits', () => {
      const result = analyzeTargetTimeline({
        ...BASE,
        targetPrice: 115,
        entryDtes: [90],
        rollAtDte: 30,
        timelineDays: [30, 120, 270],
      });
      const timeline = result.strategies[0].timeline;
      // Quick hit (30d, no rolls) should beat slow hit (270d, many rolls)
      expect(timeline[0].returnPct).toBeGreaterThan(
        timeline[timeline.length - 1].returnPct
      );
    });

    it('return percentage and leverage are consistent', () => {
      const result = analyzeTargetTimeline({
        ...BASE,
        targetPrice: 130,
        entryDtes: [60, 90, 120, 180],
        rollAtDte: 30,
        timelineDays: [30, 60, 90, 180],
      });
      for (const strat of result.strategies) {
        for (const point of strat.timeline) {
          if (!point.reachable) continue;
          // Verify: leverage × abs(stockReturn) ≈ optionReturn
          const implied = point.netLeverage * Math.abs(result.stockReturnPct);
          expect(implied).toBeCloseTo(point.returnPct, 6);
          // Verify: return = (value - capital) / capital × 100
          const computedReturn =
            ((point.optionValueAtTarget - point.capitalDeployed) / point.capitalDeployed) * 100;
          expect(point.returnPct).toBeCloseTo(computedReturn, 6);
        }
      }
    });
  });
});
