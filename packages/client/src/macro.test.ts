import { describe, it, expect } from 'vitest';
import { formatMacro, isInverted, MACRO_SYMBOLS, MACRO_TICKERS } from './macro.js';

describe('formatMacro', () => {
  it('renders a yield as a percentage, not a dollar price', () => {
    // ^TNX at 4.67 means 4.67%. Rendered as $4.67 beside real dollar prices it
    // reads as a bond costing four dollars.
    expect(formatMacro(4.67, 'yield')).toBe('4.67%');
  });

  it('renders an index without a currency symbol, because it is not money', () => {
    expect(formatMacro(7709.96, 'index')).toBe('7,709.96');
  });

  it('renders a price as money', () => {
    expect(formatMacro(78.31, 'price')).toBe('$78.31');
    expect(formatMacro(4333.2, 'price')).toBe('$4,333.20');
  });

  it('says so when there is no number', () => {
    expect(formatMacro(Number.NaN, 'price')).toBe('—');
  });
});

describe('isInverted', () => {
  it('marks the VIX, where up is bad', () => {
    // Painting a rising VIX green would invert the meaning of the one
    // instrument on the strip that measures fear.
    expect(isInverted('^VIX')).toBe(true);
    expect(isInverted('^GSPC')).toBe(false);
  });
});

describe('MACRO_TICKERS', () => {
  it('exposes its symbols in the same order', () => {
    expect(MACRO_SYMBOLS).toEqual(MACRO_TICKERS.map((t) => t.symbol));
  });

  it('gives the yield its own format', () => {
    expect(MACRO_TICKERS.find((t) => t.symbol === '^TNX')?.format).toBe('yield');
  });
});
