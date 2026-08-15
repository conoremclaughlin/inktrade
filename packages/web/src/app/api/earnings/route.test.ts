import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const quote = vi.fn();
vi.mock('yahoo-finance2', () => ({
  default: class {
    quote = quote;
  },
}));

const { GET } = await import('./route.js');

/** 2026-08-13, mid-session in New York. */
const TODAY = new Date('2026-08-13T18:00:00Z');

function request(query: string) {
  return new NextRequest(`http://localhost/api/earnings?${query}`);
}

async function call(query: string) {
  const res = await GET(request(query));
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
  quote.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('picking the NEXT report', () => {
  it('ignores a stale earningsTimestamp in favour of the upcoming one', async () => {
    /*
     * The trap this route exists to avoid. Measured live on 2026-08-13, GOOG
     * carried earningsTimestamp 2026-07-22 — three weeks past — alongside an
     * earningsTimestampStart of 2026-10-28. Reading the obvious field would
     * put a date in the past on the badge and label it "next".
     */
    quote.mockResolvedValue([
      {
        symbol: 'GOOG',
        earningsTimestamp: new Date('2026-07-22T20:00:00Z'),
        earningsTimestampStart: new Date('2026-10-28T20:00:00Z'),
        earningsTimestampEnd: new Date('2026-10-28T20:00:00Z'),
        isEarningsDateEstimate: true,
      },
    ]);

    const { body } = await call('symbols=GOOG');
    expect(body.earnings).toHaveLength(1);
    expect(body.earnings[0].date).toBe('2026-10-28');
    expect(body.earnings[0].isEstimate).toBe(true);
  });

  it('takes the soonest date that has not passed when all three agree', async () => {
    quote.mockResolvedValue([
      {
        symbol: 'NVDA',
        earningsTimestamp: new Date('2026-08-26T20:00:00Z'),
        earningsTimestampStart: new Date('2026-08-26T20:00:00Z'),
        earningsTimestampEnd: new Date('2026-08-26T20:00:00Z'),
        isEarningsDateEstimate: false,
      },
    ]);
    const { body } = await call('symbols=NVDA');
    expect(body.earnings[0].date).toBe('2026-08-26');
    expect(body.earnings[0].isEstimate).toBe(false);
  });

  it('keeps a report landing TODAY', async () => {
    // The number is out and the stock is moving on it — the moment it matters
    // most, and the easiest one to drop by comparing against "now".
    quote.mockResolvedValue([
      {
        symbol: 'RKLB',
        earningsTimestamp: new Date('2026-08-13T20:00:00Z'),
        earningsTimestampStart: new Date('2026-08-13T20:00:00Z'),
        earningsTimestampEnd: new Date('2026-08-13T20:00:00Z'),
        isEarningsDateEstimate: false,
      },
    ]);
    const { body } = await call('symbols=RKLB');
    expect(body.earnings[0].date).toBe('2026-08-13');
  });

  it('reports nothing when every date has passed', async () => {
    quote.mockResolvedValue([
      {
        symbol: 'CEG',
        earningsTimestamp: new Date('2026-08-06T12:30:00Z'),
        earningsTimestampStart: new Date('2026-08-06T12:30:00Z'),
        earningsTimestampEnd: new Date('2026-08-06T12:30:00Z'),
      },
    ]);
    const { body } = await call('symbols=CEG');
    expect(body.earnings).toHaveLength(0);
    expect(body.unknown).toEqual(['CEG']);
  });
});

describe('session timing', () => {
  it('reads 8:30am Eastern as before the open', async () => {
    quote.mockResolvedValue([
      { symbol: 'KO', earningsTimestampStart: new Date('2026-10-20T12:30:00Z') },
    ]);
    const { body } = await call('symbols=KO');
    expect(body.earnings[0].timing).toBe('before-open');
  });

  it('reads 4:00pm Eastern as after the close', async () => {
    quote.mockResolvedValue([
      { symbol: 'NVDA', earningsTimestampStart: new Date('2026-08-26T20:00:00Z') },
    ]);
    const { body } = await call('symbols=NVDA');
    expect(body.earnings[0].timing).toBe('after-close');
  });

  it('absorbs the daylight-saving shift on a projected date', async () => {
    /*
     * RKLB reported at 20:00Z — 4:00pm EDT, safely after the close. The
     * provider carried the same UTC instant into its November estimate, where
     * it reads as 3:00pm EST. Without the widened window this reports as
     * mid-session, which is both wrong and alarming.
     */
    quote.mockResolvedValue([
      { symbol: 'RKLB', earningsTimestampStart: new Date('2026-11-09T20:00:00Z') },
    ]);
    const { body } = await call('symbols=RKLB');
    expect(body.earnings[0].date).toBe('2026-11-09');
    expect(body.earnings[0].timing).toBe('after-close');
  });
});

describe('naming what it could not answer', () => {
  it('lists symbols with no earnings rather than dropping them', async () => {
    // An ETF has no earnings and a typo has none we can see. A screen that
    // renders both as an empty cell teaches you to read blank as "nothing
    // coming" — which is how you hold through a report you were never shown.
    quote.mockResolvedValue([
      { symbol: 'NVDA', earningsTimestampStart: new Date('2026-08-26T20:00:00Z') },
      { symbol: 'SOXL' },
    ]);
    const { body } = await call('symbols=NVDA,SOXL,ZZZZ');
    expect(body.earnings.map((e: { symbol: string }) => e.symbol)).toEqual(['NVDA']);
    expect(body.unknown.sort()).toEqual(['SOXL', 'ZZZZ']);
  });

  it('reports the market day it resolved against', async () => {
    quote.mockResolvedValue([{ symbol: 'X' }]);
    const { body } = await call('symbols=X');
    expect(body.asOf).toBe('2026-08-13');
  });
});

describe('request handling', () => {
  it('rejects a request with no symbols', async () => {
    const { status } = await call('');
    expect(status).toBe(400);
  });

  it('rejects more than the batch limit', async () => {
    const many = Array.from({ length: 101 }, (_, i) => `S${i}`).join(',');
    const { status, body } = await call(`symbols=${many}`);
    expect(status).toBe(400);
    expect(body.error).toContain('max 100');
  });

  it('uppercases and de-duplicates before asking upstream', async () => {
    quote.mockResolvedValue([]);
    await call('symbols=nvda,NVDA, ko ');
    expect(quote).toHaveBeenCalledWith(['NVDA', 'KO']);
  });

  it('normalises a single-object response into a list', async () => {
    // yahoo-finance2 returns an object for one symbol and an array for many.
    quote.mockResolvedValue({
      symbol: 'NVDA',
      earningsTimestampStart: new Date('2026-08-26T20:00:00Z'),
    });
    const { body } = await call('symbols=NVDA');
    expect(body.earnings).toHaveLength(1);
  });

  it('returns 502 rather than a partial answer when upstream fails', async () => {
    quote.mockRejectedValue(new Error('upstream exploded'));
    const { status, body } = await call('symbols=NVDA');
    expect(status).toBe(502);
    expect(body.error).toContain('upstream exploded');
  });

  it('lets the response be cached briefly', async () => {
    quote.mockResolvedValue([]);
    const res = await GET(request('symbols=NVDA'));
    expect(res.headers.get('Cache-Control')).toContain('s-maxage');
  });
});
