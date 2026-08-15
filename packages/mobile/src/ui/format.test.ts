import { describe, it, expect } from 'vitest';
import { formatCompact, formatMoney, formatPercent, formatPrice } from './format';

describe('formatPrice', () => {
  it('gives sub-dollar instruments four places', () => {
    // Penny options are quoted to the cent and below; two places would round a
    // $0.0250 contract to $0.03, a 20% error.
    expect(formatPrice(0.025)).toBe('0.0250');
    expect(formatPrice(0.5)).toBe('0.5000');
  });

  it('gives ordinary prices two', () => {
    expect(formatPrice(13.785)).toBe('13.79');
    expect(formatPrice(1)).toBe('1.00');
  });

  it('separates thousands', () => {
    expect(formatPrice(17300)).toBe('17,300.00');
  });

  it('reads a negative by its magnitude, not its sign', () => {
    // The bug this replaces: the thresholds compared the raw value, so every
    // negative number fell through to the sub-dollar branch. A short position
    // worth -$17,300 rendered as -17300.0000.
    expect(formatPrice(-17300)).toBe('-17,300.00');
    expect(formatPrice(-45.08)).toBe('-45.08');
    expect(formatPrice(-0.025)).toBe('-0.0250');
  });

  it('says so when there is no number', () => {
    expect(formatPrice(NaN)).toBe('—');
    expect(formatPrice(Infinity)).toBe('—');
  });
});

describe('formatMoney', () => {
  it('always gives two places and separators', () => {
    // Money is not an instrument price: a portfolio line reading $0.1000 is a
    // formatter leaking through.
    expect(formatMoney(0.1)).toBe('$0.10');
    expect(formatMoney(17300)).toBe('$17,300.00');
    expect(formatMoney(134)).toBe('$134.00');
  });

  it('puts the sign before the currency', () => {
    expect(formatMoney(-17300)).toBe('-$17,300.00');
    expect(formatMoney(-72.99)).toBe('-$72.99');
  });

  it('says so when there is no number', () => {
    expect(formatMoney(NaN)).toBe('—');
  });
});

describe('formatPercent', () => {
  it('signs a gain and keeps two places', () => {
    expect(formatPercent(6.49)).toBe('+6.49%');
    expect(formatPercent(-8.04)).toBe('-8.04%');
  });
});

describe('formatCompact', () => {
  it('scales past millions', () => {
    // TQQQ's real AUM. Before billions existed this printed "32831.2M", which
    // is a number you have to count the digits of to understand.
    expect(formatCompact(32_831_200_000)).toBe('32.8B');
    expect(formatCompact(2_400_000_000_000)).toBe('2.4T');
  });

  it('still handles the volume range it was written for', () => {
    expect(formatCompact(45_300_000)).toBe('45.3M');
    expect(formatCompact(8_400)).toBe('8K');
    expect(formatCompact(742)).toBe('742');
  });

  it('switches unit exactly at each threshold', () => {
    expect(formatCompact(999_999_999)).toBe('1000.0M');
    expect(formatCompact(1_000_000_000)).toBe('1.0B');
  });

  it('keeps the sign on a negative', () => {
    expect(formatCompact(-32_831_200_000)).toBe('-32.8B');
  });

  it('says so when there is no number', () => {
    expect(formatCompact(NaN)).toBe('—');
  });
});
