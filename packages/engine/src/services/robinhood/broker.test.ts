import { describe, it, expect } from 'vitest';
import type { Client } from '@modelcontextprotocol/client';
import {
  RobinhoodBroker,
  currentEquityPrice,
  nextCursor,
  normalizeEquityPosition,
  normalizeOptionDetail,
  normalizeOptionPosition,
  normalizeOrder,
} from './broker.js';
import { assertLoopback, isLoopbackRedirect } from './connection.js';

/**
 * Fixtures below are trimmed from live Robinhood MCP responses (account
 * numbers replaced). Robinhood publishes no output reference, so captured
 * payloads are the only specification these normalizers have.
 */

const ACCOUNTS = {
  data: {
    accounts: [
      {
        account_number: '000000001',
        rhs_account_number: '000000001',
        type: 'margin',
        brokerage_account_type: 'individual',
        is_default: true,
        deactivated: false,
      },
      {
        account_number: '000000002',
        brokerage_account_type: 'ira_roth',
        deactivated: true,
      },
    ],
  },
  guide: 'accounts',
};

const PORTFOLIO = {
  data: {
    total_value: '230565.44250089',
    equity_value: '270037.39250089',
    options_value: '-37943',
    cash: '-1528.95',
    currency: 'USD',
    buying_power: { buying_power: '64278.5316', unleveraged_buying_power: '16069.6329' },
  },
  guide: 'portfolio',
};

const EQUITY_POSITIONS = {
  data: {
    positions: [
      { symbol: 'NVDA', quantity: '8.089263', average_buy_price: '199.930000', type: 'long' },
      { symbol: 'MU', quantity: '5.000739', average_buy_price: '1055.800000', type: 'long' },
      // Not in the quote fixture — exercises the unquoted path.
      { symbol: 'RITM', quantity: '0.114678', average_buy_price: '10.900000', type: 'long' },
    ],
  },
  guide: 'positions',
};

const EQUITY_QUOTES = {
  data: {
    results: [
      {
        quote: {
          symbol: 'NVDA',
          last_trade_price: '219.210000',
          venue_last_trade_time: '2026-08-05T19:59:59.998996868Z',
          last_non_reg_trade_price: '219.640000',
          venue_last_non_reg_trade_time: '2026-08-06T00:57:25.676Z',
          adjusted_previous_close: '219.220000',
        },
        close: { symbol: 'NVDA', date: '2026-08-05', price: '219.22' },
      },
      {
        quote: {
          symbol: 'MU',
          last_trade_price: '892.820000',
          venue_last_trade_time: '2026-08-05T19:59:59.998440133Z',
          last_non_reg_trade_price: '874.690000',
          venue_last_non_reg_trade_time: '2026-08-06T00:57:31.439Z',
          adjusted_previous_close: '893.190000',
        },
        close: { symbol: 'MU', date: '2026-08-05', price: '893.19' },
      },
    ],
  },
  guide: 'quotes',
};

const OPTION_POSITIONS = {
  data: {
    positions: [
      {
        option_id: 'opt-short',
        chain_symbol: 'GOOG',
        type: 'short',
        quantity: '3.0000',
        average_price: '-1423.3333',
        expiration_date: '2026-09-11',
        trade_value_multiplier: '100.0000',
      },
      {
        option_id: 'opt-long',
        chain_symbol: 'GOOG',
        type: 'long',
        quantity: '3.0000',
        average_price: '1194.3333',
        expiration_date: '2026-09-11',
        trade_value_multiplier: '100.0000',
      },
    ],
  },
  guide: 'option positions',
};

const OPTION_INSTRUMENTS = {
  data: {
    instruments: [
      {
        id: 'opt-short',
        chain_symbol: 'GOOG',
        expiration_date: '2026-09-11',
        strike_price: '360.0000',
        type: 'put',
        trade_value_multiplier: '100.0000',
      },
      {
        id: 'opt-long',
        chain_symbol: 'GOOG',
        expiration_date: '2026-09-11',
        strike_price: '355.0000',
        type: 'put',
        trade_value_multiplier: '100.0000',
      },
    ],
  },
  guide: 'instruments',
};

const OPTION_QUOTES = {
  data: {
    results: [
      {
        quote: {
          instrument_id: 'opt-short',
          mark_price: '14.050000',
          adjusted_mark_price: '14.050000',
          previous_close_price: '8.580000',
          delta: '-0.466784',
        },
        close: { instrument_id: 'opt-short', price: '8.58' },
      },
      {
        quote: {
          instrument_id: 'opt-long',
          mark_price: '11.750000',
          adjusted_mark_price: '11.750000',
          previous_close_price: '6.680000',
        },
        close: { instrument_id: 'opt-long', price: '6.68' },
      },
    ],
  },
  guide: 'option quotes',
};

const TOOLS: Record<string, unknown> = {
  get_accounts: ACCOUNTS,
  get_portfolio: PORTFOLIO,
  get_equity_positions: EQUITY_POSITIONS,
  get_equity_quotes: EQUITY_QUOTES,
  get_option_positions: OPTION_POSITIONS,
  get_option_instruments: OPTION_INSTRUMENTS,
  get_option_quotes: OPTION_QUOTES,
};

function fakeClient(
  overrides: Record<string, unknown> = {},
  onCall?: (name: string, args: Record<string, unknown>) => void,
): Client {
  const tools = { ...TOOLS, ...overrides };
  return {
    async callTool({
      name,
      arguments: args,
    }: {
      name: string;
      arguments?: Record<string, unknown>;
    }) {
      onCall?.(name, args ?? {});
      const payload = tools[name];
      if (payload === undefined) throw new Error(`unexpected tool ${name}`);
      if (payload instanceof Error) throw payload;
      return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
    },
  } as unknown as Client;
}

describe('RobinhoodBroker.getPortfolio', () => {
  it('skips deactivated accounts', async () => {
    const summary = await new RobinhoodBroker({ client: fakeClient() }).getPortfolio();
    expect(summary.accounts).toHaveLength(1);
    expect(summary.accounts[0].accountId).toBe('000000001');
    expect(summary.accounts[0].nickname).toBe('Individual');
  });

  it('reads balances from the portfolio payload', async () => {
    const summary = await new RobinhoodBroker({ client: fakeClient() }).getPortfolio();
    expect(summary.accounts[0].balances).toEqual({
      liquidationValue: 230565.44250089,
      cashBalance: -1528.95,
      buyingPower: 64278.5316,
    });
    expect(summary.totalValue).toBe(230565.44250089);
  });

  it('passes the account number to every per-account tool', async () => {
    // These tools reject a call without it, so omitting it returns nothing at all.
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    await new RobinhoodBroker({ client: fakeClient({}, (name, args) => calls.push({ name, args })) })
      .getPortfolio();

    for (const tool of ['get_portfolio', 'get_equity_positions', 'get_option_positions']) {
      const call = calls.find((c) => c.name === tool);
      expect(call?.args.account_number, tool).toBe('000000001');
    }
  });

  it('values equity positions from quotes, since positions carry no price', async () => {
    const summary = await new RobinhoodBroker({ client: fakeClient() }).getPortfolio();
    const nvda = summary.accounts[0].positions.find((p) => p.symbol === 'NVDA');

    // Extended-hours print is newer than the regular one, so it wins.
    expect(nvda?.marketValue).toBeCloseTo(219.64 * 8.089263, 6);
    expect(nvda?.dayChange).toBeCloseTo((219.64 - 219.22) * 8.089263, 6);
  });

  it('leaves an unquoted position at zero rather than inventing a value', async () => {
    const summary = await new RobinhoodBroker({ client: fakeClient() }).getPortfolio();
    const ritm = summary.accounts[0].positions.find((p) => p.symbol === 'RITM');
    expect(ritm?.marketValue).toBe(0);
    expect(ritm?.dayChange).toBe(0);
  });

  it('sums the day move from positions, since no portfolio previous close exists', async () => {
    const summary = await new RobinhoodBroker({ client: fakeClient() }).getPortfolio();
    const fromPositions = summary.accounts[0].positions.reduce((s, p) => s + p.dayChange, 0);
    expect(summary.dayChange).toBeCloseTo(fromPositions, 6);
  });

  it('still renders positions when the quote call fails', async () => {
    const summary = await new RobinhoodBroker({
      client: fakeClient({ get_equity_quotes: new Error('rate limited') }),
    }).getPortfolio();

    expect(summary.accounts[0].positions.filter((p) => p.assetType === 'EQUITY')).toHaveLength(3);
    expect(summary.totalValue).toBe(230565.44250089);
  });

  it('includes options, which live behind a separate tool', async () => {
    const summary = await new RobinhoodBroker({ client: fakeClient() }).getPortfolio();
    const options = summary.accounts[0].positions.filter((p) => p.assetType === 'OPTION');
    expect(options).toHaveLength(2);
  });
});

describe('normalizeEquityPosition', () => {
  const quotes = new Map([['MU', { price: 100, previousClose: 80 }]]);

  it('applies direction from type, since quantity is always positive', () => {
    // Reading quantity alone turns every short into a long.
    const short = normalizeEquityPosition(
      { symbol: 'MU', quantity: '5', type: 'short' },
      quotes,
    );
    expect(short?.quantity).toBe(-5);
    expect(short?.marketValue).toBe(-500);
  });

  it('drops a row with no symbol or quantity', () => {
    expect(normalizeEquityPosition({ quantity: '10' }, quotes)).toBeNull();
    expect(normalizeEquityPosition({ symbol: 'MU' }, quotes)).toBeNull();
  });
});

describe('normalizeOptionPosition', () => {
  const quotes = new Map([['opt-short', { price: 14.05, previousClose: 8.58 }]]);
  const instruments = new Map([
    [
      'opt-short',
      {
        underlyingSymbol: 'GOOG',
        putCall: 'PUT' as const,
        strike: 360,
        expiration: '2026-09-11',
        multiplier: 100,
      },
    ],
  ]);

  const raw = {
    option_id: 'opt-short',
    chain_symbol: 'GOOG',
    type: 'short',
    quantity: '3.0000',
    average_price: '-1423.3333',
    trade_value_multiplier: '100.0000',
  };

  it('scales by the contract multiplier and keeps a short negative', () => {
    const position = normalizeOptionPosition(raw, quotes, instruments);
    expect(position?.quantity).toBe(-3);
    expect(position?.marketValue).toBeCloseTo(14.05 * 100 * -3, 6);
    expect(position?.dayChange).toBeCloseTo((14.05 - 8.58) * 100 * -3, 6);
  });

  it('converts whole-contract cost to a per-share premium', () => {
    // average_price is the full contract cost; the app quotes options per share.
    expect(normalizeOptionPosition(raw, quotes, instruments)?.averagePrice).toBeCloseTo(
      14.233333,
      5,
    );
  });

  it('labels the contract once the instrument lookup resolves it', () => {
    const position = normalizeOptionPosition(raw, quotes, instruments);
    expect(position?.symbol).toBe('GOOG 360P');
    expect(position?.option?.strike).toBe(360);
  });

  it('falls back to the underlying when strike and right are unknown', () => {
    // Option positions carry no strike or call/put, so without the instrument
    // join the best available label is the underlying.
    const position = normalizeOptionPosition(raw, quotes, new Map());
    expect(position?.symbol).toBe('GOOG');
    expect(position?.option).toBeUndefined();
  });
});

describe('currentEquityPrice', () => {
  it('prefers the more recent of the regular and extended-hours prints', () => {
    expect(
      currentEquityPrice({
        last_trade_price: '100',
        venue_last_trade_time: '2026-08-05T20:00:00Z',
        last_non_reg_trade_price: '101',
        venue_last_non_reg_trade_time: '2026-08-06T00:57:00Z',
      }),
    ).toBe(101);
  });

  it('keeps the regular print when it is the newer one', () => {
    expect(
      currentEquityPrice({
        last_trade_price: '100',
        venue_last_trade_time: '2026-08-05T20:00:00Z',
        last_non_reg_trade_price: '99',
        venue_last_non_reg_trade_time: '2026-08-05T09:00:00Z',
      }),
    ).toBe(100);
  });

  it('falls back when a timestamp is missing or unparseable', () => {
    expect(currentEquityPrice({ last_trade_price: '100', last_non_reg_trade_price: '101' })).toBe(
      100,
    );
    expect(currentEquityPrice({ last_non_reg_trade_price: '101' })).toBe(101);
  });
});

describe('normalizeOptionDetail', () => {
  it('reads a live instrument payload', () => {
    expect(
      normalizeOptionDetail({
        chain_symbol: 'GOOG',
        expiration_date: '2026-09-11',
        strike_price: '355.0000',
        type: 'put',
        trade_value_multiplier: '100.0000',
      }),
    ).toEqual({
      underlyingSymbol: 'GOOG',
      putCall: 'PUT',
      strike: 355,
      expiration: '2026-09-11',
      multiplier: 100,
    });
  });

  it('returns undefined when strike or right is missing', () => {
    expect(normalizeOptionDetail({ chain_symbol: 'GOOG', expiration_date: '2026-09-11' })).toBeUndefined();
  });
});

describe('nextCursor', () => {
  it('extracts the cursor from a next URL', () => {
    expect(nextCursor({ next: 'https://api.robinhood.com/positions/?cursor=abc123' })).toBe(
      'abc123',
    );
  });

  it('is undefined at the last page', () => {
    expect(nextCursor({ next: null })).toBeUndefined();
    expect(nextCursor({})).toBeUndefined();
  });
});

describe('normalizeOrder', () => {
  it('leaves an unfilled order with a null price rather than zero', () => {
    const order = normalizeOrder({
      id: '1',
      symbol: 'MU',
      state: 'queued',
      created_at: '2026-08-04T00:00:00Z',
    });
    expect(order?.price).toBeNull();
    expect(order?.status).toBe('OPEN');
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
