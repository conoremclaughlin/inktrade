import { describe, it, expect } from 'vitest';
import { orderPrices, priceAt, roundToTick, tickSize } from './order-pricing.js';

describe('tickSize', () => {
  it('quotes equities in pennies', () => {
    expect(tickSize(13.79, 'EQUITY')).toBe(0.01);
    expect(tickSize(900, 'EQUITY')).toBe(0.01);
  });

  it('quotes cheap options in pennies and the rest in nickels', () => {
    // The penny pilot boundary. A midpoint of $3.075 is not a price that can be
    // sent — submitting it is a rejected order, not a rounding annoyance.
    expect(tickSize(2.99, 'OPTION')).toBe(0.01);
    expect(tickSize(3, 'OPTION')).toBe(0.05);
    expect(tickSize(12.5, 'OPTION')).toBe(0.05);
  });
});

describe('roundToTick', () => {
  it('snaps an option midpoint to the nickel it must be', () => {
    expect(roundToTick(3.075, 'OPTION')).toBeCloseTo(3.1, 6);
    expect(roundToTick(4.52, 'OPTION')).toBeCloseTo(4.5, 6);
  });

  it('leaves a penny-quoted price alone', () => {
    expect(roundToTick(2.47, 'OPTION')).toBeCloseTo(2.47, 6);
    expect(roundToTick(13.785, 'EQUITY')).toBeCloseTo(13.79, 6);
  });
});

describe('orderPrices', () => {
  const book = { bid: 13.78, ask: 13.79 };

  it('gives all three prices and the spread', () => {
    const prices = orderPrices({ ...book, side: 'BUY' });
    expect(prices.bid).toBe(13.78);
    expect(prices.ask).toBe(13.79);
    expect(prices.mid).toBeCloseTo(13.79, 6); // 13.785 rounds to the penny
    expect(prices.spread).toBeCloseTo(0.01, 6);
    expect(prices.spreadPercent).toBeCloseTo(0.0726, 3);
  });

  it('marks the ask marketable for a buy and the bid for a sell', () => {
    // Buying crosses to the ask; selling hits the bid. Getting this backwards
    // produces a limit that silently never fills.
    expect(orderPrices({ ...book, side: 'BUY' }).marketable).toBe('ASK');
    expect(orderPrices({ ...book, side: 'SELL' }).marketable).toBe('BID');
  });

  it('rounds an option midpoint to a sendable price', () => {
    const prices = orderPrices({ bid: 3.05, ask: 3.1, side: 'BUY', kind: 'OPTION' });
    // Raw midpoint is 3.075, which no venue accepts.
    expect(prices.mid).toBeCloseTo(3.1, 6);
  });

  it('refuses to invent a midpoint from a one-sided book', () => {
    const prices = orderPrices({ bid: 13.78, ask: null, side: 'BUY' });
    expect(prices.mid).toBeNull();
    expect(prices.spread).toBeNull();
    expect(prices.bid).toBe(13.78);
  });

  it('treats zero and nonsense as absent, not as a price', () => {
    // A $0.00 bid on an order ticket is worse than a blank one.
    expect(orderPrices({ bid: 0, ask: 13.79, side: 'BUY' }).bid).toBeNull();
    expect(orderPrices({ bid: NaN, ask: 13.79, side: 'BUY' }).bid).toBeNull();
    expect(orderPrices({ bid: undefined, ask: undefined, side: 'BUY' }).mid).toBeNull();
  });

  it('shows a wide option spread for what it is', () => {
    const prices = orderPrices({ bid: 1.0, ask: 1.6, side: 'BUY', kind: 'OPTION' });
    expect(prices.mid).toBeCloseTo(1.3, 6);
    // 46% of the mid — the number that tells you paying the ask is expensive.
    expect(prices.spreadPercent).toBeCloseTo(46.15, 1);
  });
});

describe('priceAt', () => {
  it('reads back the level chosen', () => {
    const prices = orderPrices({ bid: 10, ask: 11, side: 'BUY' });
    expect(priceAt(prices, 'BID')).toBe(10);
    expect(priceAt(prices, 'MID')).toBeCloseTo(10.5, 6);
    expect(priceAt(prices, 'ASK')).toBe(11);
  });
});
