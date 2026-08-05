import { describe, it, expect } from 'vitest';
import { createMockBroker } from './mock.js';
import { allPositions, optionLabel, PORTFOLIO_PERIODS } from './types.js';

const FIXED_NOW = Date.parse('2026-08-05T20:00:00.000Z');
const broker = createMockBroker({ now: () => FIXED_NOW });

describe('mock portfolio', () => {
  it('totals to the sum of positions plus cash', async () => {
    const p = await broker.getPortfolio();
    const positionValue = allPositions(p).reduce((s, x) => s + x.marketValue, 0);
    const cash = p.accounts[0].balances.cashBalance;
    expect(p.totalValue).toBeCloseTo(positionValue + cash, 6);
  });

  it('derives day change consistently with each position percentage', async () => {
    const p = await broker.getPortfolio();
    for (const pos of allPositions(p)) {
      const prev = pos.marketValue - pos.dayChange;
      expect((pos.dayChange / prev) * 100).toBeCloseTo(pos.dayChangePercent, 6);
    }
  });

  it('carries option detail on option positions only', async () => {
    const positions = allPositions(await broker.getPortfolio());
    for (const pos of positions) {
      expect(Boolean(pos.option)).toBe(pos.assetType === 'OPTION');
    }
    expect(positions.some((p) => p.assetType === 'OPTION')).toBe(true);
  });

  it('represents a short option as negative quantity and negative value', async () => {
    const positions = allPositions(await broker.getPortfolio());
    const short = positions.find((p) => p.quantity < 0);
    expect(short).toBeDefined();
    expect(short!.marketValue).toBeLessThan(0);
  });

  it('is deterministic across calls', async () => {
    const a = await broker.getPortfolio();
    const b = await broker.getPortfolio();
    expect(a.totalValue).toBe(b.totalValue);
  });
});

describe('mock portfolio history', () => {
  it.each(PORTFOLIO_PERIODS)('%s ends exactly at the current total value', async (period) => {
    const [summary, history] = await Promise.all([
      broker.getPortfolio(),
      broker.getPortfolioHistory(period),
    ]);
    const last = history.points[history.points.length - 1];
    // A mismatch between the chart's last point and the header reads as a bug.
    expect(last.value).toBeCloseTo(summary.totalValue, 0);
  });

  it.each(PORTFOLIO_PERIODS)('%s returns chronologically ordered points', async (period) => {
    const { points } = await broker.getPortfolioHistory(period);
    expect(points.length).toBeGreaterThan(1);
    for (let i = 1; i < points.length; i++) {
      expect(Date.parse(points[i].t)).toBeGreaterThan(Date.parse(points[i - 1].t));
    }
  });

  it('flags long horizons as approximate and short ones as recorded', async () => {
    expect((await broker.getPortfolioHistory('1Y')).approximate).toBe(true);
    expect((await broker.getPortfolioHistory('1D')).approximate).toBe(false);
  });

  it('produces a different shape per period', async () => {
    const a = await broker.getPortfolioHistory('1M');
    const b = await broker.getPortfolioHistory('3M');
    expect(a.points.length).not.toBe(b.points.length);
  });

  it('is deterministic for a fixed clock', async () => {
    const a = await broker.getPortfolioHistory('1M');
    const b = await broker.getPortfolioHistory('1M');
    expect(a.points.map((p) => p.value)).toEqual(b.points.map((p) => p.value));
  });
});

describe('optionLabel', () => {
  it('renders a readable contract label', () => {
    expect(
      optionLabel({
        underlyingSymbol: 'NVDA',
        putCall: 'CALL',
        strike: 210,
        expiration: '2026-08-21',
        multiplier: 100,
      }),
    ).toBe('NVDA 210C 8/21');
  });
});
