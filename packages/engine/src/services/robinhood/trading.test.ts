import { describe, it, expect } from 'vitest';
import type { OrderRequest } from '@inktrade/client/broker';
import {
  OrderRejectedError,
  assertTradable,
  buildOrderArgs,
  isAgenticAccount,
  normalizeReceipt,
  normalizeReview,
  toRobinhoodType,
} from './trading.js';

const base: OrderRequest = {
  accountId: '859249179',
  symbol: 'mu',
  side: 'BUY',
  type: 'LIMIT',
  quantity: 2,
  limitPrice: 890.5,
};

describe('assertTradable', () => {
  it('permits an account Robinhood flagged agent-tradable', () => {
    expect(() => assertTradable('859249179', ['859249179'])).not.toThrow();
  });

  it('refuses the main account even though it holds the real book', () => {
    // The whole point of the guard: reaching for the funded account is the
    // likely mistake, and it must not depend on Robinhood saying no for us.
    expect(() => assertTradable('730641784', ['859249179'])).toThrow(OrderRejectedError);
  });

  it('names the permitted accounts, since "not permitted" alone is useless', () => {
    expect(() => assertTradable('730641784', ['859249179'])).toThrow(/859249179/);
  });

  it('explains what to do when nothing is tradable at all', () => {
    expect(() => assertTradable('730641784', [])).toThrow(/Agentic account/i);
  });
});

describe('isAgenticAccount', () => {
  it.each([
    [{ agentic_allowed: true }, true],
    [{ agentic_allowed: false }, false],
    // Absent must not read as permitted.
    [{}, false],
    [{ agentic_allowed: 'true' }, false],
    [{ nickname: 'Agentic' }, false],
  ])('%o -> %s', (raw, expected) => {
    expect(isAgenticAccount(raw)).toBe(expected);
  });
});

describe('buildOrderArgs', () => {
  it('renders a limit order onto Robinhood wire fields', () => {
    expect(buildOrderArgs(base)).toEqual({
      account_number: '859249179',
      symbol: 'MU',
      side: 'buy',
      type: 'limit',
      quantity: '2',
      limit_price: '890.5',
      time_in_force: 'gfd',
      market_hours: 'regular_hours',
    });
  });

  it('passes the idempotency key through as ref_id', () => {
    expect(buildOrderArgs({ ...base, clientOrderId: 'abc-123' }).ref_id).toBe('abc-123');
  });

  it.each([
    ['MARKET', 'market'],
    ['LIMIT', 'limit'],
    ['STOP', 'stop_market'],
    ['STOP_LIMIT', 'stop_limit'],
  ] as const)('maps %s to %s', (type, expected) => {
    expect(toRobinhoodType(type)).toBe(expected);
  });

  describe('rejects malformed orders before anything is sent', () => {
    it('requires exactly one of quantity or notional', () => {
      expect(() => buildOrderArgs({ ...base, notional: 100 })).toThrow(/exactly one/);
      expect(() =>
        buildOrderArgs({ ...base, quantity: undefined, type: 'MARKET' }),
      ).toThrow(/exactly one/);
    });

    it.each([0, -1])('refuses a quantity of %s', (quantity) => {
      expect(() => buildOrderArgs({ ...base, quantity })).toThrow(/greater than zero/);
    });

    it('refuses a notional order that is not a market order', () => {
      expect(() =>
        buildOrderArgs({ ...base, quantity: undefined, notional: 50, type: 'LIMIT' }),
      ).toThrow(/market order/);
    });

    it('requires a limit price on limit orders', () => {
      expect(() => buildOrderArgs({ ...base, limitPrice: undefined })).toThrow(/limit price/);
    });

    it('requires a stop price on stop orders', () => {
      expect(() => buildOrderArgs({ ...base, type: 'STOP' })).toThrow(/stop price/);
    });

    it('requires an account and a symbol', () => {
      expect(() => buildOrderArgs({ ...base, accountId: '' })).toThrow(/account/i);
      expect(() => buildOrderArgs({ ...base, symbol: '' })).toThrow(/symbol/i);
    });
  });

  describe('session rules', () => {
    it('allows a limit order in extended hours', () => {
      expect(buildOrderArgs({ ...base, session: 'EXTENDED' }).market_hours).toBe(
        'extended_hours',
      );
    });

    it('refuses a market order outside regular hours', () => {
      // Only limit orders execute then; anything else is rejected, not queued.
      expect(() =>
        buildOrderArgs({ ...base, type: 'MARKET', limitPrice: undefined, session: 'ALL_DAY' }),
      ).toThrow(/only limit orders/i);
    });

    it('refuses a fractional order outside regular hours', () => {
      expect(() => buildOrderArgs({ ...base, quantity: 1.5, session: 'EXTENDED' })).toThrow(
        /Fractional/i,
      );
    });

    it('allows a fractional order during regular hours', () => {
      expect(buildOrderArgs({ ...base, quantity: 1.5 }).quantity).toBe('1.5');
    });
  });

  it('formats a dollar notional to cents', () => {
    const args = buildOrderArgs({
      accountId: '859249179',
      symbol: 'MU',
      side: 'BUY',
      type: 'MARKET',
      notional: 100,
    });
    expect(args.dollar_amount).toBe('100.00');
    expect(args.quantity).toBeUndefined();
  });

  it('marks GTC orders as gtc', () => {
    expect(buildOrderArgs({ ...base, timeInForce: 'GTC' }).time_in_force).toBe('gtc');
  });
});

describe('normalizeReview', () => {
  it('reads cost, quote and alerts', () => {
    const review = normalizeReview({
      data: {
        estimated_cost: '1781.00',
        quote: { last_trade_price: '890.50' },
        alerts: [{ message: 'Insufficient buying power' }, 'Pattern day trading'],
      },
      guide: '',
    });

    expect(review.estimatedCost).toBe(1781);
    expect(review.quotePrice).toBe(890.5);
    expect(review.warnings).toEqual(['Insufficient buying power', 'Pattern day trading']);
  });

  it('treats an alert as information, not a block', () => {
    // "You are using margin" should not stop an order the user meant to place.
    expect(normalizeReview({ data: { alerts: ['Using margin'] }, guide: '' }).acceptable).toBe(
      true,
    );
  });

  it('marks an explicit refusal as unacceptable', () => {
    expect(normalizeReview({ data: { acceptable: false }, guide: '' }).acceptable).toBe(false);
    expect(normalizeReview({ data: { rejected: true }, guide: '' }).acceptable).toBe(false);
  });

  it('reports missing figures as null rather than zero', () => {
    const review = normalizeReview({ data: {}, guide: '' });
    expect(review.estimatedCost).toBeNull();
    expect(review.quotePrice).toBeNull();
  });
});

describe('normalizeReceipt', () => {
  it('reads an order out of a wrapped payload', () => {
    const receipt = normalizeReceipt(
      {
        data: {
          order: {
            id: 'order-1',
            state: 'queued',
            symbol: 'MU',
            side: 'buy',
            quantity: '2.0000',
            ref_id: 'abc-123',
          },
        },
        guide: '',
      },
      base,
    );

    expect(receipt).toEqual({
      id: 'order-1',
      status: 'OPEN',
      symbol: 'MU',
      side: 'BUY',
      quantity: 2,
      clientOrderId: 'abc-123',
    });
  });

  it('throws when the broker returns no id', () => {
    // Reporting success would leave a live order the user cannot see or cancel.
    expect(() => normalizeReceipt({ data: { state: 'queued' }, guide: '' }, base)).toThrow(
      /cannot be tracked/,
    );
  });

  it('falls back to the request when the response omits fields', () => {
    const receipt = normalizeReceipt({ data: { id: 'order-2' }, guide: '' }, base);
    expect(receipt.symbol).toBe('MU');
    expect(receipt.side).toBe('BUY');
    expect(receipt.quantity).toBe(2);
  });
});
