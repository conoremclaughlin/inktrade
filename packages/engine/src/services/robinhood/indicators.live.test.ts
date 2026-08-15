/**
 * Cross-check our indicator math against Robinhood's.
 *
 * We compute RSI, MACD, VWAP and EMA locally rather than calling Robinhood for
 * them, because their endpoint takes one symbol and one indicator per call and
 * MCP has no batching — a four-indicator chart would be four round trips
 * before anything draws, and would only work while a brokerage is linked.
 *
 * The trade is only safe if our math is right, so this suite makes their API
 * the oracle: same symbol, same interval, same range, computed both ways,
 * asserted equal. That catches a wrong smoothing constant, which is invisible
 * on a chart because the curve still looks like an indicator.
 *
 * Live-only — it needs a linked account and real bars.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { Client } from '@modelcontextprotocol/client';
import {
  computeEMA,
  computeMACD,
  computeRSI,
  type IndicatorSeries,
} from '@inktrade/client';
import { RobinhoodConnection } from './connection.js';
import { createFileCredentialStore } from '../mcp/credentials.js';
import { callToolJson } from '../mcp/tools.js';
import { asArray, asRecord, num, str } from './shapes.js';

const LIVE = process.env.INKTRADE_LIVE_ROBINHOOD === '1';
const SYMBOL = 'MU';
const INTERVAL = 'day';

/**
 * Bars to skip before comparing.
 *
 * Measured convergence on two years of daily MU bars: RSI was 27.8 apart at
 * the first computable bar, 0.35 at +60, and 0.0000 at +250. 200 is past the
 * knee for every indicator here while leaving 300 bars to compare.
 */
const SETTLED_AFTER = 200;

interface Bar {
  date: string;
  close: number;
}

let client: Client;
let bars: Bar[];

/** A year of daily bars — enough for a 200-period warm-up plus signal. */
function rangeStart(): string {
  const start = new Date();
  start.setFullYear(start.getFullYear() - 2);
  return start.toISOString();
}

beforeAll(async () => {
  if (!LIVE) return;

  const connection = new RobinhoodConnection({
    store: createFileCredentialStore(join(homedir(), '.inktrade', 'robinhood-mcp.json')),
    redirectUri: 'http://localhost:6001/api/auth/robinhood/callback',
  });
  if (!(await connection.isLinked())) throw new Error('Robinhood is not linked');
  client = await connection.connect();

  const raw = await callToolJson<unknown>(client, 'get_equity_historicals', {
    symbols: [SYMBOL],
    interval: INTERVAL,
    start_time: rangeStart(),
    bounds: 'regular',
    adjustment_type: 'split',
  });

  bars = extractBars(raw);
  expect(bars.length, 'no bars returned').toBeGreaterThan(250);
}, 120_000);

/**
 * Their series, aligned to ours by date.
 *
 * Aligning on index would silently compare different days whenever the two
 * ranges differ by a bar — which is precisely the sort of near-miss this suite
 * exists to catch, so it must not be the thing that hides it.
 */
async function theirs(
  type: string,
  extra: Record<string, unknown> = {},
): Promise<Map<string, number>> {
  const raw = await callToolJson<unknown>(client, 'get_equity_technical_indicators', {
    symbol: SYMBOL,
    type,
    interval: INTERVAL,
    start_time: rangeStart(),
    bounds: 'regular',
    adjustment_type: 'split',
    ...extra,
  });

  // Single-output indicators use `value`; multi-output ones (macd, bollinger)
  // name each field, so the indicator's own name is the fallback key.
  const byDate = new Map<string, number>();
  for (const point of indicatorPoints(raw)) {
    const date = dateOf(point);
    const value = num(point, 'value', type);
    if (date && value !== undefined) byDate.set(date, value);
  }
  return byDate;
}

/** Worst absolute disagreement, starting `skip` bars after the first value. */
function worstDiff(
  ours: IndicatorSeries,
  them: Map<string, number>,
  skip: number,
): { worst: number; worstDate: string; compared: number } {
  const paired: { date: string; diff: number }[] = [];

  for (let i = 0; i < bars.length; i++) {
    const mine = ours[i];
    const theirValue = them.get(bars[i].date);
    if (mine === null || mine === undefined || theirValue === undefined) continue;
    paired.push({ date: bars[i].date, diff: Math.abs(mine - theirValue) });
  }

  const settled = paired.slice(skip);
  let worst = 0;
  let worstDate = '';
  for (const { date, diff } of settled) {
    if (diff > worst) {
      worst = diff;
      worstDate = date;
    }
  }

  return { worst, worstDate, compared: paired.length };
}

/**
 * Assert the two series agree once the seed has decayed.
 *
 * They will NOT agree at the start, and that is not a bug in either. Every
 * exponentially-smoothed indicator starts from an assumed prior value, the
 * choice is arbitrary, and it takes many bars to forget. Asserting from the
 * first computable bar would fail on a correct implementation.
 */
function expectAgreement(
  ours: IndicatorSeries,
  them: Map<string, number>,
  tolerance: number,
  label: string,
  skip = SETTLED_AFTER,
) {
  const { worst, worstDate, compared } = worstDiff(ours, them, skip);
  expect(compared, `${label}: no overlapping dates to compare`).toBeGreaterThan(300);
  expect(worst, `${label}: worst disagreement ${worst} on ${worstDate}`).toBeLessThan(tolerance);
}

describe.runIf(LIVE)('our indicators vs Robinhood', () => {
  const closes = () => bars.map((b) => b.close);

  it('computes the same RSI', async () => {
    // The assertion that matters most: Wilder's smoothing is easy to get
    // subtly wrong and impossible to spot by eye.
    expectAgreement(computeRSI(closes(), 14), await theirs('rsi', { period: 14 }), 0.01, 'RSI');
  });

  it('computes the same EMA', async () => {
    expectAgreement(computeEMA(closes(), 50), await theirs('ema', { period: 50 }), 0.05, 'EMA 50');
  });

  it('computes the same MACD line', async () => {
    const { macd } = computeMACD(closes(), 12, 26, 9);
    expectAgreement(macd, await theirs('macd'), 0.01, 'MACD');
  });

  it('disagrees early, which is the seed decaying rather than a defect', async () => {
    // Documents why the assertions above skip a warm-up, and pins the
    // behaviour: if this ever stops disagreeing, the seeding changed and the
    // warmupBars guidance in @inktrade/client should be revisited.
    const them = await theirs('rsi', { period: 14 });
    const early = worstDiff(computeRSI(closes(), 14), them, 0);
    const settled = worstDiff(computeRSI(closes(), 14), them, SETTLED_AFTER);

    expect(early.worst).toBeGreaterThan(1);
    expect(settled.worst).toBeLessThan(0.01);
  });
});

/**
 * Bars from `data.results[].bars[]`, excluding gap-fill.
 *
 * Robinhood marks synthesized bars `interpolated: true` — flat OHLC, zero
 * volume — and says to ignore them for analytics. They are not neutral: a
 * flat bar is a zero price change, which drags RSI toward 50 and pins VWAP,
 * so including them would make our series disagree with theirs for a reason
 * that has nothing to do with the math.
 */
function extractBars(payload: unknown): Bar[] {
  return asArray(payload, 'results')
    .flatMap((result) => asArray(result, 'bars'))
    .filter((raw) => raw.interpolated !== true)
    .map((raw) => {
      const date = dateOf(raw);
      const close = num(raw, 'close_price');
      return date && close !== undefined ? { date, close } : null;
    })
    .filter((b): b is Bar => b !== null);
}

/** Points from `data.indicators[].series[]`. */
function indicatorPoints(payload: unknown): Record<string, unknown>[] {
  return asArray(payload, 'indicators').flatMap((indicator) => asArray(indicator, 'series'));
}

/** Normalize whatever timestamp field is present to a YYYY-MM-DD key. */
function dateOf(raw: Record<string, unknown>): string | undefined {
  const value = str(raw, 'begins_at', 'timestamp', 'date', 'time', 't');
  return value?.slice(0, 10);
}
