import { describe, it, expect } from 'vitest';
import type { Client } from '@modelcontextprotocol/client';
import { RobinhoodBroker, normalizeOrder, normalizePosition } from './broker.js';
import { assertLoopback, isLoopbackRedirect } from './connection.js';

/** A stand-in MCP client that answers tools from a fixture map. */
function fakeClient(
  tools: Record<string, unknown>,
  onCall?: (name: string, args: Record<string, unknown>) => void,
): Client {
  return {
    async callTool({ name, arguments: args }: { name: string; arguments?: Record<string, unknown> }) {
      onCall?.(name, args ?? {});
      if (!(name in tools)) throw new Error(`unexpected tool ${name}`);
      const payload = tools[name];
      if (payload instanceof Error) throw payload;
      return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
    },
  } as unknown as Client;
}

const PORTFOLIO = {
  data: { equity: '125000.00', adjusted_previous_close_equity: '120000.00' },
  guide: 'portfolio',
};

const POSITIONS = {
  data: {
    results: [
      { symbol: 'MU', quantity: '100', average_buy_price: '80.00', market_value: '89267.00' },
      { symbol: 'NVDA', quantity: '50', average_buy_price: '400.00', market_value: '25000.00' },
    ],
  },
  guide: 'positions',
};

const QUOTES = {
  data: {
    results: [
      { symbol: 'MU', last_trade_price: '892.67', previous_close: '829.50' },
      { symbol: 'NVDA', last_trade_price: '500.00', previous_close: '505.00' },
    ],
  },
  guide: 'quotes',
};

describe('RobinhoodBroker.getPortfolio', () => {
  const broker = () =>
    new RobinhoodBroker({
      client: fakeClient({
        get_accounts: { data: { results: [] }, guide: '' },
        get_portfolio: PORTFOLIO,
        get_equity_positions: POSITIONS,
        get_equity_quotes: QUOTES,
      }),
    });

  it('reports total value and the day move against the previous close', async () => {
    const summary = await broker().getPortfolio();
    expect(summary.totalValue).toBe(125000);
    expect(summary.dayChange).toBe(5000);
    expect(summary.dayChangePercent).toBeCloseTo(4.1667, 3);
  });

  it('derives per-position day change from quotes when positions omit it', async () => {
    const summary = await broker().getPortfolio();
    const positions = summary.accounts.flatMap((a) => a.positions);

    const mu = positions.find((p) => p.symbol === 'MU');
    expect(mu?.dayChange).toBeCloseTo((892.67 - 829.5) * 100, 6);
    expect(mu?.dayChangePercent).toBeCloseTo(7.6154, 3);

    // A down day has to stay negative rather than being reported as absolute.
    const nvda = positions.find((p) => p.symbol === 'NVDA');
    expect(nvda?.dayChange).toBeCloseTo(-250, 6);
  });

  it('still renders positions when the quote call fails', async () => {
    // Losing the day-change column is acceptable; losing the whole portfolio
    // screen because a secondary call failed is not.
    const broker = new RobinhoodBroker({
      client: fakeClient({
        get_accounts: { data: { results: [] }, guide: '' },
        get_portfolio: PORTFOLIO,
        get_equity_positions: POSITIONS,
        get_equity_quotes: new Error('rate limited'),
      }),
    });

    const summary = await broker.getPortfolio();
    expect(summary.accounts.flatMap((a) => a.positions)).toHaveLength(2);
    expect(summary.totalValue).toBe(125000);
  });

  it('synthesises a single account when Robinhood returns none', async () => {
    const summary = await broker().getPortfolio();
    expect(summary.accounts).toHaveLength(1);
    expect(summary.accounts[0].positions).toHaveLength(2);
  });
});

describe('RobinhoodBroker.getPortfolioHistory', () => {
  it('returns an empty series rather than inventing a curve', async () => {
    // Robinhood exposes no portfolio-value-history tool. Empty points is the
    // signal that history must come from our own snapshots.
    const broker = new RobinhoodBroker({ client: fakeClient({}) });
    const history = await broker.getPortfolioHistory('1M');
    expect(history).toEqual({ period: '1M', points: [], approximate: false });
  });
});

describe('RobinhoodBroker.getOrders', () => {
  it('pushes the symbol filter down to the tool instead of filtering locally', async () => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    const broker = new RobinhoodBroker({
      client: fakeClient({ get_equity_orders: { data: { results: [] }, guide: '' } }, (name, args) =>
        calls.push({ name, args }),
      ),
    });

    await broker.getOrders({ symbol: 'mu' });
    expect(calls).toEqual([{ name: 'get_equity_orders', args: { symbol: 'MU' } }]);
  });

  it('returns newest first', async () => {
    const broker = new RobinhoodBroker({
      client: fakeClient({
        get_equity_orders: {
          data: {
            results: [
              { id: 'a', symbol: 'MU', state: 'filled', created_at: '2026-01-01T00:00:00Z' },
              { id: 'b', symbol: 'MU', state: 'filled', created_at: '2026-06-01T00:00:00Z' },
            ],
          },
          guide: '',
        },
      }),
    });

    expect((await broker.getOrders()).map((o) => o.id)).toEqual(['b', 'a']);
  });
});

describe('normalizePosition', () => {
  const noQuotes = new Map();

  it('computes market value from price when the field is missing', () => {
    const position = normalizePosition(
      { symbol: 'mu', quantity: '10', price: '100' },
      noQuotes,
    );
    expect(position?.marketValue).toBe(1000);
    expect(position?.symbol).toBe('MU');
  });

  it('drops a row with no symbol or no quantity', () => {
    expect(normalizePosition({ quantity: '10' }, noQuotes)).toBeNull();
    expect(normalizePosition({ symbol: 'MU' }, noQuotes)).toBeNull();
  });

  it('keeps a short position negative', () => {
    expect(normalizePosition({ symbol: 'MU', quantity: '-5' }, noQuotes)?.quantity).toBe(-5);
  });
});

describe('normalizeOrder', () => {
  it('leaves an unfilled order with a null price rather than zero', () => {
    // A zero would render as a free trade.
    const order = normalizeOrder({
      id: '1',
      symbol: 'MU',
      state: 'queued',
      created_at: '2026-08-04T00:00:00Z',
    });
    expect(order?.price).toBeNull();
    expect(order?.status).toBe('OPEN');
  });

  it('recognises an option leg and files it under the underlying', () => {
    const order = normalizeOrder({
      id: '2',
      symbol: 'NVDA',
      state: 'filled',
      side: 'sell',
      average_price: '4.20',
      quantity: '2',
      last_transaction_at: '2026-08-04T15:00:00Z',
      option: {
        strike_price: '210.00',
        expiration_date: '2026-08-21',
        option_type: 'call',
        chain_symbol: 'NVDA',
      },
    });

    expect(order?.assetType).toBe('OPTION');
    expect(order?.side).toBe('SELL');
    expect(order?.option).toEqual({
      underlyingSymbol: 'NVDA',
      putCall: 'CALL',
      strike: 210,
      expiration: '2026-08-21',
      multiplier: 100,
    });
  });

  it('prefers the execution time over the submission time', () => {
    const order = normalizeOrder({
      id: '3',
      symbol: 'MU',
      state: 'filled',
      created_at: '2026-08-01T00:00:00Z',
      last_transaction_at: '2026-08-04T15:00:00Z',
    });
    expect(order?.timestamp).toBe('2026-08-04T15:00:00.000Z');
  });

  it('drops a row with no usable timestamp', () => {
    expect(normalizeOrder({ id: '4', symbol: 'MU', created_at: 'nonsense' })).toBeNull();
  });

  it.each([
    ['partially_filled', 'PARTIAL'],
    ['cancelled', 'CANCELLED'],
    ['canceled', 'CANCELLED'],
    ['rejected', 'REJECTED'],
    ['filled', 'FILLED'],
  ])('maps state %s to %s', (state, expected) => {
    const order = normalizeOrder({
      id: '5',
      symbol: 'MU',
      state,
      created_at: '2026-08-04T00:00:00Z',
    });
    expect(order?.status).toBe(expected);
  });
});

describe('loopback guard', () => {
  it.each([
    ['http://localhost:6001/api/auth/robinhood/callback', true],
    ['http://127.0.0.1:6001/callback', true],
    ['https://inktrade.vercel.app/api/auth/robinhood/callback', false],
    ['https://localhost.evil.com/callback', false],
    ['not a url', false],
  ])('%s -> %s', (uri, expected) => {
    expect(isLoopbackRedirect(uri)).toBe(expected);
  });

  it('explains why a hosted callback cannot work', () => {
    expect(() => assertLoopback('https://inktrade.vercel.app/cb')).toThrow(/loopback/i);
  });
});
