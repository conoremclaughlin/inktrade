/**
 * Integration tests: a real MCP Client against a fake Robinhood server.
 *
 * These exercise the whole stack below the network — protocol handshake,
 * request framing, tool dispatch, argument serialization and normalization —
 * so a malformed tool argument fails here rather than at a broker.
 *
 * Nothing in this file touches the network or a real account.
 */

import { describe, it, expect, afterEach } from 'vitest';
import type { OrderRequest } from '@inktrade/client/broker';
import { RobinhoodBroker } from './broker.js';
import { OrderRejectedError } from './trading.js';
import { startFakeRobinhood, type FakeServer } from './fake-server.js';

const AGENTIC = '859249179';
const MAIN = '730641784';

const ACCOUNTS = {
  data: {
    accounts: [
      {
        account_number: MAIN,
        brokerage_account_type: 'individual',
        type: 'margin',
        agentic_allowed: false,
        deactivated: false,
      },
      {
        account_number: AGENTIC,
        nickname: 'Agentic',
        type: 'cash',
        agentic_allowed: true,
        deactivated: false,
      },
    ],
  },
  guide: '',
};

/** Shaped like a real review response — no cost field, quote under quote_data. */
const REVIEW = {
  data: {
    symbol: 'MU',
    side: 'buy',
    type: 'limit',
    quantity: '2',
    order_checks: {},
    quote_data: {
      symbol: 'MU',
      last_trade_price: '89.050000',
      bid_price: '89.000000',
      ask_price: '89.100000',
      previous_close: '88.000000',
    },
    market_data_disclosure: 'Bid $89.00 × 100 Q · Ask $89.10 × 100 Q · Last $89.05 × 50.',
  },
  guide: '',
};

const PLACED = {
  data: {
    order: { id: 'order-abc', state: 'queued', symbol: 'MU', side: 'buy', quantity: '2.0000' },
  },
  guide: '',
};

const order: OrderRequest = {
  accountId: AGENTIC,
  symbol: 'MU',
  side: 'BUY',
  type: 'LIMIT',
  quantity: 2,
  limitPrice: 89.05,
};

let server: FakeServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function broker(overrides: Record<string, unknown> = {}) {
  server = await startFakeRobinhood({
    tools: {
      get_accounts: ACCOUNTS,
      review_equity_order: REVIEW,
      place_equity_order: PLACED,
      cancel_equity_order: { data: { ok: true }, guide: '' },
      ...overrides,
    },
  });
  return new RobinhoodBroker({ client: server.client });
}

describe('trading over a real MCP connection', () => {
  it('discovers only the agentic account as tradable', async () => {
    expect(await (await broker()).tradableAccountIds()).toEqual([AGENTIC]);
  });

  it('places an order and reports the receipt', async () => {
    const receipt = await (await broker()).placeOrder(order);
    expect(receipt).toMatchObject({ id: 'order-abc', status: 'OPEN', symbol: 'MU', quantity: 2 });
  });

  it('sends exactly the arguments Robinhood expects', async () => {
    await (await broker()).placeOrder(order);
    const [call] = server!.callsTo('place_equity_order');

    expect(call.args).toMatchObject({
      account_number: AGENTIC,
      symbol: 'MU',
      side: 'buy',
      type: 'limit',
      quantity: '2',
      limit_price: '89.05',
      time_in_force: 'gfd',
      market_hours: 'regular_hours',
    });
  });

  it('always sends an idempotency key, even when the caller omits one', async () => {
    // Without ref_id a retry after a dropped response places a second order.
    await (await broker()).placeOrder(order);
    const [call] = server!.callsTo('place_equity_order');
    expect(call.args.ref_id).toEqual(expect.any(String));
    expect(String(call.args.ref_id).length).toBeGreaterThan(10);
  });

  it('preserves a caller-supplied key so retries deduplicate', async () => {
    await (await broker()).placeOrder({ ...order, clientOrderId: 'retry-me' });
    expect(server!.callsTo('place_equity_order')[0].args.ref_id).toBe('retry-me');
  });

  it('gives each order its own key', async () => {
    const b = await broker();
    await b.placeOrder(order);
    await b.placeOrder(order);
    const [first, second] = server!.callsTo('place_equity_order');
    expect(first.args.ref_id).not.toBe(second.args.ref_id);
  });

  it('reviews without placing', async () => {
    const review = await (await broker()).reviewOrder(order);

    expect(review).toEqual({
      // 2 shares at the $89.05 limit the order carries — computed here, since
      // the broker returns no cost of its own.
      estimatedCost: 178.1,
      estimateBasis: 'LIMIT',
      quotePrice: 89.05,
      bid: 89,
      ask: 89.1,
      previousClose: 88,
      warnings: [],
      disclosure: 'Bid $89.00 × 100 Q · Ask $89.10 × 100 Q · Last $89.05 × 50.',
      acceptable: true,
    });
    expect(server!.callsTo('place_equity_order')).toHaveLength(0);
  });

  it('cancels through the owning account', async () => {
    await (await broker()).cancelOrder(AGENTIC, 'order-abc');
    expect(server!.callsTo('cancel_equity_order')[0].args).toEqual({
      account_number: AGENTIC,
      order_id: 'order-abc',
    });
  });

  it('surfaces a broker-side rejection rather than reporting success', async () => {
    const b = await broker({ place_equity_order: new Error('Insufficient buying power') });
    await expect(b.placeOrder(order)).rejects.toThrow(/Insufficient buying power/);
  });
});

describe('the agentic guard, end to end', () => {
  it('refuses to trade the main account', async () => {
    await expect((await broker()).placeOrder({ ...order, accountId: MAIN })).rejects.toThrow(
      OrderRejectedError,
    );
  });

  it('sends nothing to the broker when the account is refused', async () => {
    // The guard is only worth having if it stops the request, not just the
    // return value.
    const b = await broker();
    await b.placeOrder({ ...order, accountId: MAIN }).catch(() => {});
    expect(server!.callsTo('place_equity_order')).toHaveLength(0);
  });

  it.each([
    ['reviewOrder', (b: RobinhoodBroker) => b.reviewOrder({ ...order, accountId: MAIN })],
    ['placeOrder', (b: RobinhoodBroker) => b.placeOrder({ ...order, accountId: MAIN })],
    ['cancelOrder', (b: RobinhoodBroker) => b.cancelOrder(MAIN, 'order-abc')],
  ])('guards %s', async (_name, act) => {
    await expect(act(await broker())).rejects.toThrow(OrderRejectedError);
  });

  it('refuses everything when no account is agent-enabled', async () => {
    const b = await broker({
      get_accounts: {
        data: { accounts: [{ account_number: MAIN, agentic_allowed: false }] },
        guide: '',
      },
    });
    await expect(b.placeOrder(order)).rejects.toThrow(/Agentic account/i);
  });

  it('rejects a malformed order without contacting the broker at all', async () => {
    const b = await broker();
    await expect(b.placeOrder({ ...order, limitPrice: undefined })).rejects.toThrow(
      /limit price/,
    );
    expect(server!.calls).toHaveLength(0);
  });
});

describe('the read path over a real connection', () => {
  it('joins positions, quotes and instruments into a portfolio', async () => {
    const b = await broker({
      get_portfolio: { data: { total_value: '100.00', cash: '100.00' }, guide: '' },
      get_equity_positions: ({ account_number }: Record<string, unknown>) => ({
        data: {
          positions:
            account_number === MAIN
              ? [{ symbol: 'MU', quantity: '2', average_buy_price: '800', type: 'long' }]
              : [],
        },
        guide: '',
      }),
      get_option_positions: { data: { positions: [] }, guide: '' },
      get_equity_quotes: {
        data: {
          results: [
            {
              quote: { symbol: 'MU', last_trade_price: '900', adjusted_previous_close: '800' },
              close: { symbol: 'MU', price: '800' },
            },
          ],
        },
        guide: '',
      },
      get_option_instruments: { data: { instruments: [] }, guide: '' },
      get_option_quotes: { data: { results: [] }, guide: '' },
    });

    const summary = await b.getPortfolio();
    const mu = summary.accounts.flatMap((a) => a.positions).find((p) => p.symbol === 'MU');

    expect(mu?.marketValue).toBe(1800);
    expect(mu?.dayChange).toBe(200);
    expect(mu?.dayChangePercent).toBeCloseTo(12.5, 6);
  });

  it('does not call a quote tool when there are no positions to price', async () => {
    const b = await broker({
      get_portfolio: { data: { total_value: '0' }, guide: '' },
      get_equity_positions: { data: { positions: [] }, guide: '' },
      get_option_positions: { data: { positions: [] }, guide: '' },
      get_equity_quotes: { data: { results: [] }, guide: '' },
      get_option_instruments: { data: { instruments: [] }, guide: '' },
      get_option_quotes: { data: { results: [] }, guide: '' },
    });

    await b.getPortfolio();
    expect(server!.callsTo('get_equity_quotes')).toHaveLength(0);
    expect(server!.callsTo('get_option_quotes')).toHaveLength(0);
  });
});

describe('caching over a real MCP connection', () => {
  const readTools = {
    get_portfolio: { data: { total_value: '100.00', cash: '100.00' }, guide: '' },
    get_equity_positions: { data: { positions: [] }, guide: '' },
    get_option_positions: { data: { positions: [] }, guide: '' },
    get_equity_quotes: { data: { results: [] }, guide: '' },
    get_option_instruments: { data: { instruments: [] }, guide: '' },
    get_option_quotes: { data: { results: [] }, guide: '' },
  };

  it('does not re-issue tool calls for a repeated read', async () => {
    const b = await broker(readTools);
    await b.getPortfolio();
    const first = server!.calls.length;
    await b.getPortfolio();

    expect(first).toBeGreaterThan(0);
    expect(server!.calls.length).toBe(first);
  });

  it('coalesces concurrent reads into a single set of calls', async () => {
    const b = await broker(readTools);
    await Promise.all([b.getPortfolio(), b.getPortfolio(), b.getPortfolio()]);

    // Every account is read once despite three overlapping callers.
    expect(server!.callsTo('get_accounts')).toHaveLength(1);
    expect(server!.callsTo('get_portfolio')).toHaveLength(2);
  });

  it('re-reads positions after an order, since a fill changes them', async () => {
    const b = await broker(readTools);
    await b.getPortfolio();
    const before = server!.callsTo('get_equity_positions').length;

    await b.placeOrder(order);
    await b.getPortfolio();

    expect(server!.callsTo('get_equity_positions').length).toBeGreaterThan(before);
  });

  it('keeps immutable contract definitions cached across a trade', async () => {
    // Placing an order cannot change a contract's strike or expiry, so
    // invalidating those would be pure waste on the largest batch we make.
    const b = await broker({
      ...readTools,
      get_option_positions: {
        data: {
          positions: [
            {
              option_id: 'opt-1',
              chain_symbol: 'MU',
              type: 'long',
              quantity: '1',
              average_price: '100',
              trade_value_multiplier: '100',
            },
          ],
        },
        guide: '',
      },
    });

    await b.getPortfolio();
    const before = server!.callsTo('get_option_instruments').length;
    await b.placeOrder(order);
    await b.getPortfolio();

    expect(before).toBeGreaterThan(0);
    expect(server!.callsTo('get_option_instruments')).toHaveLength(before);
  });

  it('never serves a trading call from cache', async () => {
    const b = await broker();
    await b.reviewOrder(order);
    await b.reviewOrder(order);
    // Two identical reviews must both reach the broker — a cached quote or
    // buying-power check would be a stale answer to a money question.
    expect(server!.callsTo('review_equity_order')).toHaveLength(2);
  });
});
