import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { OptionChain } from '@inktrade/client';

/*
 * The broker and the earnings route are mocked at their boundaries, so these
 * run offline. What is under test is the fan-out, the ranking, and — most
 * importantly — what the route says when it could NOT answer.
 */
const getOptionChain = vi.fn<(symbol: string, expiration?: string) => Promise<OptionChain>>();

vi.mock('@/lib/robinhood', () => ({
  robinhoodBroker: async () => ({ getOptionChain }),
}));

const { GET } = await import('./route.js');

function chainFor(symbol: string, spot: number, strikes: [number, number, number][]): OptionChain {
  return {
    symbol,
    expiration: '2026-09-18',
    expirations: ['2026-09-18'],
    underlyingPrice: spot,
    contracts: strikes.map(([strike, bid, ask]) => ({
      id: `${symbol}-${strike}`,
      underlyingSymbol: symbol,
      putCall: 'PUT' as const,
      strike,
      expiration: '2026-09-18',
      multiplier: 100,
      bid,
      ask,
      mark: (bid + ask) / 2,
      previousClose: (bid + ask) / 2,
    })),
  };
}

/** A tight, sane book: mid credit 2.00, realistic 1.80 on a $5 spread. */
function healthy(symbol: string) {
  return chainFor(symbol, 100, [
    [95, 1.9, 2.1],
    [100, 3.9, 4.1],
  ]);
}

async function call(query: string) {
  const res = await GET(new NextRequest(`http://localhost/api/screener/premium?${query}`));
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  getOptionChain.mockReset();
  // Earnings is fetched over HTTP from our own origin; default to "none known".
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify({ earnings: [], unknown: [], asOf: '2026-08-14' }), {
        status: 200,
      }),
    ),
  );
});

describe('request handling', () => {
  it('rejects a request with no symbols', async () => {
    expect((await call('')).status).toBe(400);
  });

  it('uppercases and de-duplicates', async () => {
    getOptionChain.mockImplementation(async (s) => healthy(s));
    const { body } = await call('symbols=ko,KO, dal ');
    expect(body.scanned).toBe(2);
  });

  it('caps the scan and reports how many it dropped', async () => {
    // Silently truncating would read as "these are all the candidates".
    getOptionChain.mockImplementation(async (s) => healthy(s));
    const many = Array.from({ length: 30 }, (_, i) => `S${i}`).join(',');
    const { body } = await call(`symbols=${many}`);
    expect(body.scanned).toBe(25);
    expect(body.dropped).toBe(5);
  });

  it('echoes the parameters it actually used', async () => {
    getOptionChain.mockImplementation(async (s) => healthy(s));
    const { body } = await call('symbols=KO&width=10&risk=1000&offset=-5');
    expect(body.targetWidth).toBe(10);
    expect(body.riskBudget).toBe(1000);
    expect(body.offsetPercent).toBe(-5);
  });

  it('ignores unparseable numbers rather than producing NaN prices', async () => {
    getOptionChain.mockImplementation(async (s) => healthy(s));
    const { body } = await call('symbols=KO&width=wide&risk=lots');
    expect(body.targetWidth).toBe(5);
    expect(body.riskBudget).toBe(500);
  });
});

describe('naming what it could not price', () => {
  it('reports a failed chain with its reason instead of omitting the symbol', async () => {
    /*
     * The distinction that makes the screen trustworthy: "nothing here" and
     * "we did not look" are different answers. Robinhood rate-limited 9 of 22
     * symbols in one live call, and a silently short list would have read as
     * a complete result.
     */
    getOptionChain.mockImplementation(async (s) => {
      if (s === 'FCX') throw new Error('RATE_LIMITED: too many requests');
      return healthy(s);
    });

    const { body } = await call('symbols=KO,FCX');
    expect(body.spreads.map((s: { underlying: string }) => s.underlying)).toEqual(['KO']);
    expect(body.skipped).toHaveLength(1);
    expect(body.skipped[0].symbol).toBe('FCX');
    expect(body.skipped[0].reason).toContain('RATE_LIMITED');
  });

  it('distinguishes an unbuildable chain from a failed one', async () => {
    // One strike cannot make a spread. That is a fact about the chain, not an
    // error, and it must not read like the broker fell over.
    getOptionChain.mockImplementation(async (s) =>
      s === 'THIN' ? chainFor('THIN', 100, [[100, 3.9, 4.1]]) : healthy(s),
    );
    const { body } = await call('symbols=KO,THIN');
    expect(body.skipped[0].reason).toContain('no spread constructible');
  });

  it('keeps going when one symbol fails', async () => {
    getOptionChain.mockImplementation(async (s) => {
      if (s === 'BAD') throw new Error('boom');
      return healthy(s);
    });
    const { body } = await call('symbols=A,BAD,C,D');
    expect(body.spreads).toHaveLength(3);
    expect(body.skipped).toHaveLength(1);
  });
});

describe('ranking', () => {
  it('ranks by what survives the book, not the quoted midpoint', async () => {
    getOptionChain.mockImplementation(async (s) => {
      // WIDE quotes a fatter mid credit and keeps far less of it.
      if (s === 'WIDE') {
        return chainFor('WIDE', 100, [
          [95, 1.0, 3.0],
          [100, 3.0, 6.0],
        ]);
      }
      return healthy(s);
    });

    const { body } = await call('symbols=TIGHT,WIDE');
    const wide = body.spreads.find((s: { underlying: string }) => s.underlying === 'WIDE');
    const tight = body.spreads.find((s: { underlying: string }) => s.underlying === 'TIGHT');

    // Ahead on the midpoint...
    expect(wide.creditMid).toBeGreaterThan(tight.creditMid);
    // ...behind once the spread is paid, and ranked accordingly.
    expect(body.spreads[0].underlying).toBe('TIGHT');
  });

  it('sorts spreads it could not price realistically to the bottom', async () => {
    /*
     * A mark with no book behind it — overnight, or a thin strike. The
     * midpoint survives and the realistic price does not, and saying so is
     * the point: "we could not price this" is a different answer from "this
     * pays badly", and only one of them is about the trade.
     */
    const noBook: OptionChain = {
      symbol: 'NOBOOK',
      expiration: '2026-09-18',
      expirations: ['2026-09-18'],
      underlyingPrice: 100,
      contracts: [
        { strike: 95, mark: 2.0 },
        { strike: 100, mark: 4.0 },
      ].map(({ strike, mark }) => ({
        id: `NOBOOK-${strike}`,
        underlyingSymbol: 'NOBOOK',
        putCall: 'PUT' as const,
        strike,
        expiration: '2026-09-18',
        multiplier: 100,
        bid: null,
        ask: null,
        mark,
        previousClose: mark,
      })),
    };

    getOptionChain.mockImplementation(async (s) => (s === 'NOBOOK' ? noBook : healthy(s)));
    const { body } = await call('symbols=KO,NOBOOK');

    expect(body.spreads).toHaveLength(2);
    // Priced at the mid, unpriceable in reality, and therefore last.
    expect(body.spreads.at(-1).underlying).toBe('NOBOOK');
    expect(body.spreads.at(-1).creditMid).toBeCloseTo(2.0, 2);
    expect(body.spreads.at(-1).creditPerRiskReal).toBeNull();
  });
});

describe('the earnings join', () => {
  it('flags a spread whose expiry spans a report', async () => {
    getOptionChain.mockImplementation(async (s) => healthy(s));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            earnings: [
              {
                symbol: 'NVDA',
                date: '2026-08-26',
                timestamp: null,
                timing: 'after-close',
                isEstimate: false,
                windowEnd: null,
              },
            ],
            unknown: [],
            asOf: '2026-08-14',
          }),
          { status: 200 },
        ),
      ),
    );

    const { body } = await call('symbols=NVDA');
    expect(body.earningsChecked).toBe(true);
    expect(body.spreads[0].earnings).toEqual({ date: '2026-08-26', isEstimate: false });
  });

  it('does not let the flag change the ranking', async () => {
    // An earnings spread pays more BECAUSE it is more dangerous. Demoting it
    // would hide the trade rather than describe it.
    getOptionChain.mockImplementation(async (s) => healthy(s));
    const withReport = await call('symbols=KO');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            earnings: [
              { symbol: 'KO', date: '2026-08-26', timing: 'after-close', isEstimate: false },
            ],
            unknown: [],
            asOf: '2026-08-14',
          }),
          { status: 200 },
        ),
      ),
    );
    const flagged = await call('symbols=KO');
    expect(flagged.body.spreads[0].creditPerRiskReal).toBe(
      withReport.body.spreads[0].creditPerRiskReal,
    );
  });

  it('leaves the flag null for a symbol with no report — an ETF, say', async () => {
    getOptionChain.mockImplementation(async (s) => healthy(s));
    const { body } = await call('symbols=TLT');
    expect(body.spreads[0].earnings).toBeNull();
  });

  it('degrades honestly when the earnings lookup fails', async () => {
    /*
     * earningsChecked false is the difference between "no report in the
     * window" and "we never got the dates". A row alone cannot say which, so
     * the response has to.
     */
    getOptionChain.mockImplementation(async (s) => healthy(s));
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));

    const { body } = await call('symbols=KO');
    expect(body.earningsChecked).toBe(false);
    // And it still returns the spreads rather than failing the whole scan.
    expect(body.spreads).toHaveLength(1);
  });

  it('survives the earnings request throwing outright', async () => {
    getOptionChain.mockImplementation(async (s) => healthy(s));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    const { body } = await call('symbols=KO');
    expect(body.earningsChecked).toBe(false);
    expect(body.spreads).toHaveLength(1);
  });
});
