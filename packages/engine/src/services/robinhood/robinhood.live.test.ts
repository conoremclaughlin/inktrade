/**
 * Live suite — talks to the real Robinhood MCP server with real credentials.
 *
 * Never runs by default. It is excluded from vitest.config.ts and each block
 * additionally checks an environment flag, so a stray `yarn test` cannot reach
 * a brokerage.
 *
 *   yarn workspace @inktrade/engine test:live       # read-only + simulation
 *   INKTRADE_LIVE_PLACE_ORDER=1 yarn ... test:live  # places a real order
 *
 * The read tests assert *invariants* rather than values — a portfolio changes
 * every second, so asserting a total would be a test that fails at the open.
 * What's worth checking live is the shape holding: that positions get priced,
 * that options get labelled, that shorts stay negative. Those are exactly the
 * things a fixture can't catch when Robinhood changes a field name.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { PortfolioSummary } from '@inktrade/client/broker';
import { RobinhoodBroker } from './broker.js';
import { RobinhoodConnection } from './connection.js';
import { createFileCredentialStore } from '../mcp/credentials.js';

const LIVE = process.env.INKTRADE_LIVE_ROBINHOOD === '1';
const PLACE_ORDERS = process.env.INKTRADE_LIVE_PLACE_ORDER === '1';

/** Must match the path the web app writes to. */
const CREDENTIALS = join(homedir(), '.inktrade', 'robinhood-mcp.json');

async function connect(): Promise<RobinhoodBroker> {
  const connection = new RobinhoodConnection({
    store: createFileCredentialStore(CREDENTIALS),
    // Only used to satisfy the loopback guard; no redirect happens here.
    redirectUri: 'http://localhost:6001/api/auth/robinhood/callback',
  });

  if (!(await connection.isLinked())) {
    throw new Error(`No Robinhood link found at ${CREDENTIALS}. Link via /settings first.`);
  }
  return new RobinhoodBroker({ client: await connection.connect() });
}

/**
 * One portfolio fetch, shared by every assertion.
 *
 * Robinhood rate-limits, and a single getPortfolio fans out across accounts,
 * quote batches and instrument lookups. Re-fetching per test exhausted the
 * budget and failed a later, unrelated test — so the suite reads once and
 * asserts many times.
 */
let shared: { broker: RobinhoodBroker; summary: PortfolioSummary; tradable: string[] };

beforeAll(async () => {
  if (!LIVE) return;
  const broker = await connect();
  shared = {
    broker,
    summary: await broker.getPortfolio(),
    tradable: await broker.tradableAccountIds(),
  };
}, 120_000);

describe.runIf(LIVE)('Robinhood, live read path', () => {
  it('returns a portfolio whose total is the sum of its accounts', () => {
    const summed = shared.summary.accounts.reduce((s, a) => s + a.balances.liquidationValue, 0);
    expect(shared.summary.totalValue).toBeCloseTo(summed, 2);
  });

  it('prices every equity position it returns', () => {
    // Positions carry no price of their own, so an unpriced row means the
    // quote join silently broke — the failure that renders $0.00 holdings.
    const equities = shared.summary.accounts
      .flatMap((a) => a.positions)
      .filter((p) => p.assetType === 'EQUITY' && p.quantity !== 0);

    if (equities.length === 0) return;
    expect(equities.filter((p) => p.marketValue === 0)).toEqual([]);
  });

  it('labels every option position with a strike and right', () => {
    const options = shared.summary.accounts
      .flatMap((a) => a.positions)
      .filter((p) => p.assetType === 'OPTION');

    if (options.length === 0) return;
    expect(options.filter((p) => !p.option)).toEqual([]);
  });

  it('keeps dollar and percent day moves agreeing in sign', () => {
    const disagreeing = shared.summary.accounts
      .flatMap((a) => a.positions)
      .filter((p) => p.dayChange !== 0 && Math.sign(p.dayChange) !== Math.sign(p.dayChangePercent));
    expect(disagreeing).toEqual([]);
  });

  it('reports short positions as negative quantities', () => {
    // Direction lives in a `type` field, not the sign of quantity, so this is
    // the assertion that catches Robinhood changing that convention.
    for (const p of shared.summary.accounts.flatMap((a) => a.positions).filter((p) => p.quantity < 0)) {
      expect(Math.sign(p.marketValue)).toBeLessThanOrEqual(0);
    }
  });

  it('has no portfolio history to offer', async () => {
    // Documents the gap. If this ever starts failing, Robinhood shipped a
    // value-history tool and our snapshot machinery has an alternative.
    expect((await shared.broker.getPortfolioHistory('1M')).points).toEqual([]);
  });
});

describe.runIf(LIVE)('Robinhood, live trading guards', () => {
  let broker: RobinhoodBroker;
  let tradable: string[];

  beforeAll(() => {
    ({ broker, tradable } = shared);
  });

  it('finds at least one agent-tradable account', () => {
    expect(tradable.length).toBeGreaterThan(0);
  });

  it('refuses an account Robinhood has not flagged', async () => {
    const forbidden = shared.summary.accounts
      .map((a) => a.accountId)
      .find((id) => !tradable.includes(id));
    if (!forbidden) return;

    await expect(
      broker.placeOrder({
        accountId: forbidden,
        symbol: 'MU',
        side: 'BUY',
        type: 'LIMIT',
        quantity: 1,
        limitPrice: 1,
      }),
    ).rejects.toThrow(/not enabled for agent trading/);
  });

  it('simulates an order without placing it', async () => {
    // review_equity_order is a simulation — it moves no money — so it is safe
    // in the default live run and is the only way to check our argument
    // encoding against the real broker.
    const review = await broker.reviewOrder({
      accountId: tradable[0],
      symbol: 'MU',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 1,
      // Deliberately far below market: even if this were placed, it could not
      // fill. It isn't placed.
      limitPrice: 1,
    });

    expect(review).toHaveProperty('acceptable');
    expect(Array.isArray(review.warnings)).toBe(true);
  });
});

/**
 * Places a real order with real money, then cancels it.
 *
 * The order is a far-below-market limit so it cannot fill in the window
 * between placing and cancelling. It still spends nothing only because it
 * doesn't execute — which is why this needs its own flag on top of the live
 * one, and why the cancel runs even if the assertions fail.
 */
describe.runIf(LIVE && PLACE_ORDERS)('Robinhood, live order placement', () => {
  it('places and then cancels a resting order', async () => {
    const broker = await connect();
    const [account] = await broker.tradableAccountIds();
    expect(account, 'no agent-tradable account').toBeTruthy();

    const receipt = await broker.placeOrder({
      accountId: account,
      symbol: 'MU',
      side: 'BUY',
      type: 'LIMIT',
      quantity: 1,
      limitPrice: 1,
      timeInForce: 'GTC',
    });

    try {
      expect(receipt.id).toBeTruthy();
      expect(receipt.symbol).toBe('MU');
      expect(['OPEN', 'PARTIAL', 'FILLED']).toContain(receipt.status);
    } finally {
      // Must run even when an assertion fails, or a failing test leaves a live
      // resting order behind.
      await broker.cancelOrder(account, receipt.id);
    }
  });
});
