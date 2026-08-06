import { describe, it, expect } from 'vitest';
import type { OrderRequest } from '@inktrade/client/broker';
import {
  OrderRejectedError,
  assertTradable,
  buildOrderArgs,
  isAgenticAccount,
  normalizeReceipt,
  normalizeReview,
  normalizeTaxLot,
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

/**
 * Captured from a live `review_equity_order` on 2026-08-06, trimmed only of
 * the venue timestamps. Every earlier version of these tests was written from
 * the tool description and asserted field names that do not exist.
 */
const QUOTE_DATA = {
  symbol: 'F',
  last_trade_price: '13.785000',
  last_non_reg_trade_price: '13.790100',
  adjusted_previous_close: '14.130000',
  previous_close: '14.130000',
  bid_price: '13.780000',
  ask_price: '13.790000',
  has_traded: true,
  state: 'active',
};

const DISCLOSURE = 'Bid $13.78 × 3100 Q · Ask $13.79 × 100 Q · Last $13.79 × 258. Updated 5:01 PM ET.';

const fordBuy: OrderRequest = {
  accountId: '859249179',
  symbol: 'F',
  side: 'BUY',
  type: 'LIMIT',
  quantity: 1,
  limitPrice: 13.7,
};

function reviewPayload(orderChecks: Record<string, unknown> = {}) {
  return {
    data: {
      symbol: 'F',
      side: 'buy',
      type: 'limit',
      quantity: '1',
      order_checks: orderChecks,
      quote_data: QUOTE_DATA,
      market_data_disclosure: DISCLOSURE,
    },
    guide: '',
  };
}

describe('normalizeReview', () => {
  it('reads the quote out of quote_data, which is where it actually lives', () => {
    const review = normalizeReview(reviewPayload(), fordBuy);

    expect(review.quotePrice).toBe(13.785);
    expect(review.bid).toBe(13.78);
    expect(review.ask).toBe(13.79);
    expect(review.previousClose).toBe(14.13);
  });

  it('carries the compliance disclosure through untouched', () => {
    // Robinhood requires this string be shown verbatim wherever their market
    // data is displayed. Any edit here is a compliance problem, not a style one.
    expect(normalizeReview(reviewPayload(), fordBuy).disclosure).toBe(DISCLOSURE);
  });

  it('treats an empty order_checks as no alerts', () => {
    const review = normalizeReview(reviewPayload({}), fordBuy);
    expect(review.warnings).toEqual([]);
    expect(review.alertType).toBeUndefined();
    expect(review.acceptable).toBe(true);
  });

  describe('estimated cost — the number shown before real money moves', () => {
    it('prices a limit order at the limit the user chose', () => {
      const review = normalizeReview(reviewPayload(), fordBuy);
      expect(review.estimatedCost).toBeCloseTo(13.7, 10);
      expect(review.estimateBasis).toBe('LIMIT');
    });

    it('prices a market buy at the ask it would have to cross', () => {
      const review = normalizeReview(reviewPayload(), {
        ...fordBuy,
        type: 'MARKET',
        quantity: 100,
        limitPrice: undefined,
      });
      expect(review.estimatedCost).toBeCloseTo(1379, 10);
      expect(review.estimateBasis).toBe('ASK');
    });

    it('prices a market sell at the bid, not the last trade', () => {
      // Using the last trade for both sides would understate every buy and
      // overstate every sell — always in the direction that flatters the order.
      const review = normalizeReview(reviewPayload(), {
        ...fordBuy,
        side: 'SELL',
        type: 'MARKET',
        quantity: 100,
        limitPrice: undefined,
      });
      expect(review.estimatedCost).toBeCloseTo(1378, 10);
      expect(review.estimateBasis).toBe('BID');
    });

    it('takes a dollar order at its word', () => {
      const review = normalizeReview(reviewPayload(), {
        ...fordBuy,
        type: 'MARKET',
        quantity: undefined,
        notional: 250,
        limitPrice: undefined,
      });
      expect(review.estimatedCost).toBe(250);
      expect(review.estimateBasis).toBe('NOTIONAL');
    });

    it('anchors a stop order to its trigger', () => {
      const review = normalizeReview(reviewPayload(), {
        ...fordBuy,
        type: 'STOP',
        stopPrice: 12.5,
        quantity: 10,
        limitPrice: undefined,
      });
      expect(review.estimatedCost).toBeCloseTo(125, 10);
      expect(review.estimateBasis).toBe('STOP');
    });

    it('reports null rather than zero when nothing can be priced', () => {
      // A zero would render as a real, free order.
      const review = normalizeReview({ data: {}, guide: '' }, {
        ...fordBuy,
        type: 'MARKET',
        limitPrice: undefined,
      });
      expect(review.estimatedCost).toBeNull();
      expect(review.estimateBasis).toBeNull();
      expect(review.quotePrice).toBeNull();
    });
  });

  describe('alerts', () => {
    it('explains an insufficient-buying-power alert with its number intact', () => {
      const review = normalizeReview(
        reviewPayload({
          alertType: 'EQUITY_NOT_ENOUGH_BP',
          equityNotEnoughBpAlertDetails: {
            depositAmount: { amount: '144695.0300', currency: 'USD' },
            brokerageAccountType: 'INDIVIDUAL',
          },
        }),
        fordBuy,
      );

      expect(review.alertType).toBe('EQUITY_NOT_ENOUGH_BP');
      expect(review.warnings[0]).toMatch(/\$144,695\.03/);
      expect(review.acceptable).toBe(false);
    });

    it('explains an unmarketable limit without blocking it', () => {
      // Robinhood will happily accept this order; it just won't fill. Refusing
      // it ourselves would be us overruling the user on their own limit price.
      const review = normalizeReview(
        reviewPayload({
          alertType: 'EQUITY_EXTREMELY_UNMARKETABLE_LIMIT_PRICE',
          equityExtremelyUnmarketableLimitPriceAlertDetails: {
            enteredPrice: { amount: '1.0000', currency: 'USD' },
            lastTradePrice: { amount: '13.7901', currency: 'USD' },
            side: 'BUY',
          },
        }),
        { ...fordBuy, limitPrice: 1 },
      );

      expect(review.warnings[0]).toMatch(/\$1\.00/);
      expect(review.warnings[0]).toMatch(/\$13\.79/);
      expect(review.acceptable).toBe(true);
    });

    it('surfaces an alert it has never seen rather than dropping it', () => {
      // The failure mode being prevented: a new alert type ships, we don't
      // recognise it, and the one thing the broker went out of its way to say
      // silently disappears.
      const review = normalizeReview(
        reviewPayload({
          alertType: 'EQUITY_SOMETHING_BRAND_NEW',
          equitySomethingBrandNewAlertDetails: {
            shortfall: { amount: '42.5000', currency: 'USD' },
            reason: 'HALTED',
          },
        }),
        fordBuy,
      );

      expect(review.warnings[0]).toContain('EQUITY_SOMETHING_BRAND_NEW');
      expect(review.warnings[0]).toContain('$42.50');
      expect(review.warnings[0]).toContain('HALTED');
      // Unknown means unknown — surfaced, not treated as a refusal.
      expect(review.acceptable).toBe(true);
    });

    it('still reports an alert that arrives with no details', () => {
      const review = normalizeReview(
        reviewPayload({ alertType: 'EQUITY_MYSTERY' }),
        fordBuy,
      );
      expect(review.warnings).toEqual(['EQUITY_MYSTERY']);
    });
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

describe('normalizeTaxLot', () => {
  it('reads a live lot', () => {
    expect(
      normalizeTaxLot({
        open_lot_id: 'lot-1',
        open_tran_type: 'buy',
        quantity: '60.000000',
        quantity_available: '60.000000',
        is_selectable: true,
        cost_per_share: '128.800000',
        tax_cost_basis: '7727.980000',
        open_date: '2026-07-31',
        term: 'st',
      }),
    ).toEqual({
      id: 'lot-1',
      quantity: 60,
      costPerShare: 128.8,
      openDate: '2026-07-31',
      term: 'SHORT',
      selectable: true,
      origin: 'BUY',
    });
  });

  it('marks an assignment lot, which is the case lot selection exists for', () => {
    // Shares delivered at a basis nobody chose.
    expect(
      normalizeTaxLot({
        open_lot_id: 'lot-2',
        open_tran_type: 'assignbuy',
        quantity_available: '300',
        is_selectable: true,
        cost_per_share: '176.680000',
        open_date: '2026-07-31',
        term: 'st',
      })?.origin,
    ).toBe('ASSIGNMENT');
  });

  it('keeps a pending basis null rather than zero', () => {
    // A zero basis would report the whole proceeds as gain.
    const lot = normalizeTaxLot({
      open_lot_id: 'lot-3',
      quantity_available: '6',
      is_selectable: false,
      open_date: '2026-08-05',
      term: 'st',
    });
    expect(lot?.costPerShare).toBeNull();
    expect(lot?.selectable).toBe(false);
  });

  it('treats a missing is_selectable as not selectable', () => {
    // Assuming selectable produces an order the broker rejects at submit.
    expect(normalizeTaxLot({ open_lot_id: 'x', quantity: '1', open_date: '2026-01-01' })?.selectable)
      .toBe(false);
  });

  it('prefers available quantity over total, since some may be held', () => {
    expect(
      normalizeTaxLot({
        open_lot_id: 'x',
        quantity: '100',
        quantity_available: '40',
        open_date: '2026-01-01',
        is_selectable: true,
      })?.quantity,
    ).toBe(40);
  });

  it('reads long-term lots', () => {
    expect(
      normalizeTaxLot({ open_lot_id: 'x', quantity: '1', open_date: '2025-01-01', term: 'lt' })?.term,
    ).toBe('LONG');
  });
});

describe('tax lots on an order', () => {
  const sell: OrderRequest = {
    accountId: '859249179',
    symbol: 'SOXL',
    side: 'SELL',
    type: 'LIMIT',
    quantity: 100,
    limitPrice: 131.6,
  };

  it('sends the chosen lots', () => {
    const args = buildOrderArgs({
      ...sell,
      taxLots: [{ lotId: 'a', quantity: 60 }, { lotId: 'b', quantity: 40 }],
    });
    expect(args.tax_lots).toEqual([
      { open_lot_id: 'a', quantity: '60' },
      { open_lot_id: 'b', quantity: '40' },
    ]);
  });

  it('omits the field entirely when no lots were chosen', () => {
    // Absent means the broker default, which is FIFO.
    expect(buildOrderArgs(sell).tax_lots).toBeUndefined();
  });

  it('refuses a selection that does not sum to the order quantity', () => {
    // A mismatch means the selection is stale — shares moved since it was made.
    expect(() =>
      buildOrderArgs({ ...sell, taxLots: [{ lotId: 'a', quantity: 60 }] }),
    ).toThrow(/total 60 shares but the order is for 100/);
  });

  it('refuses more lots than the broker accepts', () => {
    const many = Array.from({ length: 31 }, (_, i) => ({ lotId: `l${i}`, quantity: 100 / 31 }));
    expect(() => buildOrderArgs({ ...sell, taxLots: many })).toThrow(/At most 30 lots/);
  });

  it.each([
    [{ side: 'BUY' as const }, /sells only/i],
    [{ type: 'STOP' as const, stopPrice: 120 }, /stop orders/i],
    [{ session: 'ALL_DAY' as const }, /overnight/i],
  ])('refuses lot selection on an order shape the broker rejects: %o', (over, pattern) => {
    // Better here than as a rejection at submit, after the user has already
    // reviewed a realized-gain figure.
    expect(() =>
      buildOrderArgs({ ...sell, ...over, taxLots: [{ lotId: 'a', quantity: 100 }] }),
    ).toThrow(pattern);
  });
});
