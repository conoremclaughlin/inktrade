import { describe, it, expect } from 'vitest';
import { currencySymbol, formatLargeNumber } from './format';

describe('currencySymbol', () => {
  it('returns $ for USD', () => {
    expect(currencySymbol('USD')).toBe('$');
  });

  it('returns NT$ for TWD', () => {
    expect(currencySymbol('TWD')).toBe('NT$');
  });

  it('returns € for EUR', () => {
    expect(currencySymbol('EUR')).toBe('€');
  });

  it('returns ¥ for JPY', () => {
    expect(currencySymbol('JPY')).toBe('¥');
  });

  it('falls back to code prefix for unknown currencies', () => {
    expect(currencySymbol('XYZ')).toBe('XYZ ');
  });
});

describe('formatLargeNumber', () => {
  describe('USD (default)', () => {
    it('formats trillions', () => {
      expect(formatLargeNumber(1.13e12)).toBe('$1.13T');
    });

    it('formats billions', () => {
      expect(formatLargeNumber(96.43e9)).toBe('$96.43B');
    });

    it('formats millions', () => {
      expect(formatLargeNumber(500e6)).toBe('$500M');
    });

    it('formats small numbers with locale string', () => {
      expect(formatLargeNumber(1234)).toBe('$1,234');
    });

    it('handles negative billions', () => {
      expect(formatLargeNumber(-5.5e9)).toBe('-$5.50B');
    });

    it('handles zero', () => {
      expect(formatLargeNumber(0)).toBe('$0');
    });
  });

  describe('TWD currency — regression for TSM', () => {
    it('formats TWD trillions with NT$ prefix', () => {
      expect(formatLargeNumber(1.13e12, 'TWD')).toBe('NT$1.13T');
    });

    it('formats TWD billions with NT$ prefix', () => {
      expect(formatLargeNumber(751.3e9, 'TWD')).toBe('NT$751.30B');
    });

    it('formats TWD millions with NT$ prefix', () => {
      expect(formatLargeNumber(347e6, 'TWD')).toBe('NT$347M');
    });

    it('does NOT show $ for TWD values', () => {
      const result = formatLargeNumber(933.79e9, 'TWD');
      expect(result).not.toMatch(/^\$\d/);
      expect(result).toMatch(/^NT\$/);
    });
  });

  describe('other currencies', () => {
    it('formats EUR with €', () => {
      expect(formatLargeNumber(50e9, 'EUR')).toBe('€50.00B');
    });

    it('formats GBP with £', () => {
      expect(formatLargeNumber(10e9, 'GBP')).toBe('£10.00B');
    });

    it('formats JPY with ¥', () => {
      expect(formatLargeNumber(5e12, 'JPY')).toBe('¥5.00T');
    });

    it('formats unknown currency with code prefix', () => {
      expect(formatLargeNumber(100e9, 'ZAR')).toBe('ZAR 100.00B');
    });
  });
});
