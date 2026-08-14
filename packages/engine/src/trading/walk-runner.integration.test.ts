/**
 * Integration: a price walk driven through a real MCP connection.
 *
 * The unit tests hand the runner a book directly. These make it earn the book
 * the way production does — through a real {@link Client}, a real transport, a
 * real tools/call, and the broker's own normalizer. A field renamed upstream,
 * a size dropped in normalization, or a malformed tool argument fails here
 * rather than at a venue.
 *
 * Nothing touches the network or a real account.
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  depthView,
  resolveTradingMode,
  walkPlan,
  type ComboLeg,
  type OptionContract,
} from '@inktrade/client';
import { RobinhoodBroker } from '../services/robinhood/broker.js';
import { startFakeRobinhood, type FakeServer } from '../services/robinhood/fake-server.js';
import { WalkNotPermittedError, runWalk } from './walk-runner.js';

const AGENTIC = '859249179';

const ACCOUNTS = {
  data: {
    accounts: [
      {
        account_number: AGENTIC,
        rhs_account_number: AGENTIC,
        brokerage_account_type: 'individual',
        agentic_allowed: true,
        option_level: 'option_level_3',
        state: 'active',
        deactivated: false,
      },
    ],
  },
  guide: '',
};

const SHORT_ID = 'short-82p';
const LONG_ID = 'long-77p';

function instrument(id: string, strike: string) {
  return {
    id,
    chain_symbol: 'RKLB',
    type: 'put',
    strike_price: strike,
    expiration_date: '2026-10-02',
    trade_value_multiplier: '100.0000',
    state: 'active',
    tradability: 'tradable',
  };
}

/**
 * The real RKLB book, in the shape Robinhood actually returns it.
 * Wide, zero open interest, and deep on both sides.
 */
function quoteFor(id: string, bid: string, ask: string, bidSize: number, askSize: number, mark: string) {
  return {
    quote: {
      instrument_id: id,
      bid_price: bid,
      ask_price: ask,
      bid_size: bidSize,
      ask_size: askSize,
      mark_price: mark,
      adjusted_mark_price: mark,
      previous_close_price: mark,
      open_interest: 0,
      volume: 2,
    },
    close: { instrument_id: id, price: mark },
  };
}

let server: FakeServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function brokerWith(results: unknown[]) {
  server = await startFakeRobinhood({
    tools: {
      get_accounts: ACCOUNTS,
      get_option_instruments: {
        data: { instruments: [instrument(SHORT_ID, '82.0000'), instrument(LONG_ID, '77.0000')] },
        guide: '',
      },
      get_option_quotes: { data: { results }, guide: '' },
    },
  });
  /*
   * cache: null, deliberately.
   *
   * The broker memoizes tool calls and get_option_quotes carries a 5-second
   * TTL. A walk polling on roughly that period against a cached broker would
   * concede rung after rung without re-reading the book — the first version of
   * this test made ONE wire call across an entire simulated walk, which is
   * exactly the production bug it would have hidden.
   */
  return new RobinhoodBroker({ client: server.client, cache: null });
}

/** Map broker contracts onto the legs of a put credit spread. */
function legsFrom(contracts: OptionContract[]): ComboLeg[] {
  const short = contracts.find((c) => c.strike === 82)!;
  const long = contracts.find((c) => c.strike === 77)!;
  return [
    {
      side: 'SELL',
      quote: { bid: short.bid, ask: short.ask, bidSize: short.bidSize, askSize: short.askSize, mark: short.mark },
    },
    {
      side: 'BUY',
      quote: { bid: long.bid, ask: long.ask, bidSize: long.bidSize, askSize: long.askSize, mark: long.mark },
    },
  ];
}

const PAPER = resolveTradingMode({ setting: 'PAPER' });

describe('quotes survive the round trip', () => {
  it('carries bid and ask SIZE through the broker normalizer', async () => {
    // This is the field that was being dropped. Without it every depth
    // display renders empty against live data and the whole feature is a lie.
    const broker = await brokerWith([
      quoteFor(SHORT_ID, '8.050000', '11.850000', 178, 173, '9.950000'),
      quoteFor(LONG_ID, '5.450000', '9.150000', 226, 194, '7.300000'),
    ]);

    const contracts = await broker.getOptionContracts([SHORT_ID, LONG_ID]);
    const short = contracts.find((c) => c.strike === 82)!;

    expect(short.bid).toBeCloseTo(8.05, 2);
    expect(short.ask).toBeCloseTo(11.85, 2);
    expect(short.bidSize).toBe(178);
    expect(short.askSize).toBe(173);
  });

  it('reads the real book as wide, through the whole stack', async () => {
    const broker = await brokerWith([
      quoteFor(SHORT_ID, '8.050000', '11.850000', 178, 173, '9.950000'),
      quoteFor(LONG_ID, '5.450000', '9.150000', 226, 194, '7.300000'),
    ]);
    const contracts = await broker.getOptionContracts([SHORT_ID, LONG_ID]);
    const short = contracts.find((c) => c.strike === 82)!;

    const view = depthView({
      bid: short.bid,
      ask: short.ask,
      bidSize: short.bidSize,
      askSize: short.askSize,
    });
    // 3.80 wide on a 9.95 mid.
    expect(view.spreadPercent).toBeCloseTo(38.19, 1);
    expect(view.notes.join(' ')).toContain('38%');
  });

  it('surfaces a one-contract touch as thin', async () => {
    const broker = await brokerWith([
      quoteFor(SHORT_ID, '7.500000', '7.800000', 1, 13, '7.650000'),
      quoteFor(LONG_ID, '5.450000', '5.600000', 200, 200, '5.525000'),
    ]);
    const contracts = await broker.getOptionContracts([SHORT_ID, LONG_ID]);
    const short = contracts.find((c) => c.strike === 82)!;

    const view = depthView({
      bid: short.bid,
      ask: short.ask,
      bidSize: short.bidSize,
      askSize: short.askSize,
    });
    // Four cents wide — reads as a market — with one contract behind it.
    expect(view.spreadPercent).toBeLessThan(5);
    expect(view.notes.join(' ')).toContain('Only 1 on the bid');
  });
});

describe('the walk, end to end over MCP', () => {
  it('refuses to run against a live account before touching the broker', async () => {
    const broker = await brokerWith([
      quoteFor(SHORT_ID, '8.050000', '11.850000', 178, 173, '9.950000'),
      quoteFor(LONG_ID, '5.450000', '9.150000', 226, 194, '7.300000'),
    ]);
    const plan = walkPlan({ mid: 2.65, config: { steps: 4 } })!;

    await expect(
      runWalk({
        plan,
        quantity: 1,
        deps: {
          quote: async () => legsFrom(await broker.getOptionContracts([SHORT_ID, LONG_ID])),
          now: () => 0,
          wait: async () => {},
          mode: resolveTradingMode({}),
        },
      }),
    ).rejects.toBeInstanceOf(WalkNotPermittedError);

    expect(server!.callsTo('get_option_quotes')).toHaveLength(0);
  });

  it('exhausts against the real RKLB book, because crossing it pays nothing', async () => {
    // Natural on this spread is -1.10: no positive credit limit is marketable,
    // so a walk correctly works all the way down and still does not fill.
    const broker = await brokerWith([
      quoteFor(SHORT_ID, '8.050000', '11.850000', 178, 173, '9.950000'),
      quoteFor(LONG_ID, '5.450000', '9.150000', 226, 194, '7.300000'),
    ]);
    const plan = walkPlan({
      mid: 2.65,
      config: { startPercent: 20, floorPercent: 15, steps: 5, intervalSeconds: 30 },
    })!;

    let t = 0;
    const result = await runWalk({
      plan,
      quantity: 1,
      deps: {
        quote: async () => legsFrom(await broker.getOptionContracts([SHORT_ID, LONG_ID])),
        now: () => t,
        wait: async (s) => {
          t += s;
        },
        mode: PAPER,
        pollSeconds: 10,
      },
    });

    expect(result.state.status).toBe('EXHAUSTED');
    expect(result.state.filledQuantity).toBe(0);
    expect(result.state.currentPrice).toBe(plan.floor);
    // And it really did go out over the wire, repeatedly.
    expect(server!.callsTo('get_option_quotes').length).toBeGreaterThan(1);
  });

  it('fills when the book is tight enough to cross', async () => {
    // Natural here is 4.00 - 1.20 = 2.80, above the opening rung.
    const broker = await brokerWith([
      quoteFor(SHORT_ID, '4.000000', '4.100000', 100, 100, '4.050000'),
      quoteFor(LONG_ID, '1.100000', '1.200000', 100, 100, '1.150000'),
    ]);
    const plan = walkPlan({
      mid: 2.9,
      config: { startPercent: 10, floorPercent: 10, steps: 4, intervalSeconds: 30 },
    })!;

    let t = 0;
    const result = await runWalk({
      plan,
      quantity: 2,
      deps: {
        quote: async () => legsFrom(await broker.getOptionContracts([SHORT_ID, LONG_ID])),
        now: () => t,
        wait: async (s) => {
          t += s;
        },
        mode: PAPER,
      },
    });

    expect(result.state.status).toBe('FILLED');
    expect(result.state.filledQuantity).toBe(2);
    expect(result.state.averagePrice).toBeCloseTo(2.8, 2);
  });

  it('partially fills against a thin touch and keeps working', async () => {
    const broker = await brokerWith([
      quoteFor(SHORT_ID, '4.000000', '4.100000', 3, 100, '4.050000'),
      quoteFor(LONG_ID, '1.100000', '1.200000', 100, 100, '1.150000'),
    ]);
    const plan = walkPlan({
      mid: 2.9,
      config: { startPercent: 10, floorPercent: 10, steps: 3, intervalSeconds: 30 },
    })!;

    let t = 0;
    const result = await runWalk({
      plan,
      quantity: 10,
      deps: {
        quote: async () => legsFrom(await broker.getOptionContracts([SHORT_ID, LONG_ID])),
        now: () => t,
        wait: async (s) => {
          t += s;
        },
        mode: PAPER,
      },
    });

    // Three contracts a poll against a three-lot bid, never more.
    expect(result.state.filledQuantity).toBeGreaterThan(0);
    expect(result.state.filledQuantity).toBeLessThanOrEqual(10);
    for (const event of result.state.history.filter((h) => h.kind === 'FILL')) {
      expect(event.quantity).toBeLessThanOrEqual(3);
    }
  });

  it('never sends an order tool — paper mode reaches the broker for quotes only', async () => {
    const broker = await brokerWith([
      quoteFor(SHORT_ID, '4.000000', '4.100000', 100, 100, '4.050000'),
      quoteFor(LONG_ID, '1.100000', '1.200000', 100, 100, '1.150000'),
    ]);
    const plan = walkPlan({ mid: 2.9, config: { steps: 3 } })!;

    let t = 0;
    await runWalk({
      plan,
      quantity: 1,
      deps: {
        quote: async () => legsFrom(await broker.getOptionContracts([SHORT_ID, LONG_ID])),
        now: () => t,
        wait: async (s) => {
          t += s;
        },
        mode: PAPER,
      },
    });

    // The property that makes paper mode trustworthy, asserted at the
    // protocol boundary rather than taken on faith.
    const written = server!.calls.filter((c) => /place|cancel|replace|review/.test(c.tool));
    expect(written).toEqual([]);
  });
});
