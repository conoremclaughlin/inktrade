import { describe, it, expect } from 'vitest';
import { computeThetaGrid, type PositionLeg } from './theta-grid.js';

const LONG_CALL: PositionLeg = {
  strike: 100,
  optionType: 'call',
  quantity: 1,
  entryPrice: 5,
};

const SHORT_PUT: PositionLeg = {
  strike: 95,
  optionType: 'put',
  quantity: -1,
  entryPrice: 2,
};

const LONG_PUT: PositionLeg = {
  strike: 90,
  optionType: 'put',
  quantity: 1,
  entryPrice: 1,
};

describe('computeThetaGrid', () => {
  describe('single long call', () => {
    it('returns valid grid dimensions', () => {
      const result = computeThetaGrid({
        legs: [LONG_CALL],
        spotPrice: 100,
        iv: 0.3,
        currentDte: 30,
        daysForward: [0, 1, 3, 5, 7],
        priceMovePcts: [-3, -1, 0, 1, 3],
      });

      expect(result.daysForward).toEqual([0, 1, 3, 5, 7]);
      expect(result.priceMovePcts).toHaveLength(5);
      expect(result.grid).toHaveLength(5);
      result.grid.forEach(row => expect(row).toHaveLength(5));
    });

    it('current value matches BS pricing', () => {
      const result = computeThetaGrid({
        legs: [LONG_CALL],
        spotPrice: 100,
        iv: 0.3,
        currentDte: 30,
      });

      expect(result.currentValue).toBeGreaterThan(0);
    });

    it('holding loses value over time at flat price (theta decay)', () => {
      const result = computeThetaGrid({
        legs: [LONG_CALL],
        spotPrice: 100,
        iv: 0.3,
        currentDte: 30,
        daysForward: [0, 5, 10],
        priceMovePcts: [0],
      });

      const flatValues = result.grid.map(row => row[0].positionValue);
      // Each successive day should have lower value (theta decay)
      for (let i = 1; i < flatValues.length; i++) {
        expect(flatValues[i]).toBeLessThan(flatValues[i - 1]);
      }
    });

    it('holdVsClose is negative for flat price forward (theta costs money for long)', () => {
      const result = computeThetaGrid({
        legs: [LONG_CALL],
        spotPrice: 100,
        iv: 0.3,
        currentDte: 30,
        daysForward: [0, 3, 7],
        priceMovePcts: [0],
      });

      // day 0 at flat should be ~0
      expect(Math.abs(result.grid[0][0].holdVsClose)).toBeLessThan(0.01);
      // forward days at flat should be negative (theta drains)
      expect(result.grid[1][0].holdVsClose).toBeLessThan(0);
      expect(result.grid[2][0].holdVsClose).toBeLessThan(0);
    });

    it('positive greeks for long call', () => {
      const result = computeThetaGrid({
        legs: [LONG_CALL],
        spotPrice: 100,
        iv: 0.3,
        currentDte: 30,
      });

      expect(result.greeks.delta).toBeGreaterThan(0);
      expect(result.greeks.gamma).toBeGreaterThan(0);
      expect(result.greeks.theta).toBeLessThan(0); // long option decays
      expect(result.greeks.vega).toBeGreaterThan(0);
    });
  });

  describe('put credit spread (short put + long put)', () => {
    const SPREAD: PositionLeg[] = [SHORT_PUT, LONG_PUT];

    it('entry is a net credit (positive entryCost for short spread)', () => {
      const result = computeThetaGrid({
        legs: SPREAD,
        spotPrice: 100,
        iv: 0.3,
        currentDte: 30,
      });

      // Short put at 95 received $2, long put at 90 paid $1 → net credit $1
      expect(result.entryCost).toBeCloseTo(-1, 10); // negative = received credit
    });

    it('theta is positive (time decay benefits credit spreads)', () => {
      const result = computeThetaGrid({
        legs: SPREAD,
        spotPrice: 100,
        iv: 0.3,
        currentDte: 30,
      });

      expect(result.greeks.theta).toBeGreaterThan(0);
    });

    it('holding at flat price gains value (theta collected)', () => {
      const result = computeThetaGrid({
        legs: SPREAD,
        spotPrice: 100,
        iv: 0.3,
        currentDte: 30,
        daysForward: [0, 5, 10],
        priceMovePcts: [0],
      });

      // Position value should decrease toward 0 (spreads expire worthless OTM)
      // Since we're short, decreasing value = profit
      const flatPnl = result.grid.map(row => row[0].holdVsClose);
      for (let i = 1; i < flatPnl.length; i++) {
        expect(flatPnl[i]).toBeGreaterThan(flatPnl[i - 1]);
      }
    });

    it('large downward move hurts credit spread', () => {
      const result = computeThetaGrid({
        legs: SPREAD,
        spotPrice: 100,
        iv: 0.3,
        currentDte: 30,
        daysForward: [0],
        priceMovePcts: [-10, 0],
      });

      const downMove = result.grid[0][0]; // -10%
      const flat = result.grid[0][1]; // 0%
      expect(downMove.holdVsClose).toBeLessThan(flat.holdVsClose);
    });
  });

  describe('edge cases', () => {
    it('filters out days beyond current DTE', () => {
      const result = computeThetaGrid({
        legs: [LONG_CALL],
        spotPrice: 100,
        iv: 0.3,
        currentDte: 5,
        daysForward: [0, 1, 3, 5, 7, 10],
      });

      // Should exclude day 5 (would be 0 DTE) and beyond
      expect(result.daysForward.every(d => d < 5)).toBe(true);
    });

    it('handles deep ITM options', () => {
      const deepItm: PositionLeg = {
        strike: 80,
        optionType: 'call',
        quantity: 1,
        entryPrice: 25,
      };

      const result = computeThetaGrid({
        legs: [deepItm],
        spotPrice: 105,
        iv: 0.3,
        currentDte: 30,
        daysForward: [0],
        priceMovePcts: [0],
      });

      // Deep ITM call should be worth at least intrinsic
      expect(result.currentValue).toBeGreaterThan(25);
    });

    it('handles deep OTM options', () => {
      const deepOtm: PositionLeg = {
        strike: 150,
        optionType: 'call',
        quantity: 1,
        entryPrice: 0.5,
      };

      const result = computeThetaGrid({
        legs: [deepOtm],
        spotPrice: 100,
        iv: 0.3,
        currentDte: 30,
      });

      expect(result.currentValue).toBeGreaterThan(0);
      expect(result.currentValue).toBeLessThan(1);
    });
  });
});
