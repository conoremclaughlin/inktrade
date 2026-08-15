import { describe, it, expect } from 'vitest';
import { normalizeYahooQuote } from './yahoo.js';

describe('normalizeYahooQuote', () => {
  it('recomputes a move Yahoo got wrong', () => {
    // Captured live from ^TNX, the 10-year yield. Yahoo reported a change of
    // -4.617 — exactly the negative of the previous close, as if price were
    // zero — which renders as "10Y -49.7%": not a cosmetic error but an
    // alarming and completely false claim.
    const quote = normalizeYahooQuote({
      symbol: '^TNX',
      regularMarketPrice: 4.67,
      regularMarketPreviousClose: 4.6169996,
      regularMarketChange: -4.6169996,
      regularMarketChangePercent: -49.714653,
    });

    expect(quote.change).toBeCloseTo(0.053, 3);
    expect(quote.changePercent).toBeCloseTo(1.148, 2);
  });

  it('agrees with Yahoo when Yahoo is right', () => {
    // ^VIX from the same request, where the vendor's figures are correct.
    const quote = normalizeYahooQuote({
      symbol: '^VIX',
      regularMarketPrice: 15.15,
      regularMarketPreviousClose: 15.81,
      regularMarketChange: -0.6600008,
      regularMarketChangePercent: -4.1745777,
    });

    expect(quote.change).toBeCloseTo(-0.66, 4);
    expect(quote.changePercent).toBeCloseTo(-4.1746, 3);
  });

  it('falls back to the vendor when there is no previous close to work from', () => {
    const quote = normalizeYahooQuote({
      symbol: 'NEW',
      regularMarketPrice: 12,
      regularMarketChange: 1.5,
      regularMarketChangePercent: 14.29,
    });

    expect(quote.change).toBe(1.5);
    expect(quote.changePercent).toBeCloseTo(14.29, 2);
  });

  it('reports a flat day as flat rather than dividing by zero', () => {
    const quote = normalizeYahooQuote({
      symbol: 'FLAT',
      regularMarketPrice: 10,
      regularMarketPreviousClose: 10,
    });

    expect(quote.change).toBe(0);
    expect(quote.changePercent).toBe(0);
  });
});
