import { NextRequest, NextResponse } from 'next/server';
import { findPutCreditSpread, rankByRealCredit, type PutCreditSpread } from '@inktrade/client';
import { robinhoodBroker } from '@/lib/robinhood';
import { disconnected, brokerError } from '../../broker/shared';

/**
 * Price a put credit spread on every symbol given, and rank by what you'd
 * actually collect per dollar of collateral.
 *
 * Server-side for the same reason the oversold screen is: one option chain per
 * symbol is one upstream request, and doing twenty of them from a phone is
 * twenty round trips over a mobile link.
 *
 * Priced from the broker chain rather than the modelled grid, because the
 * number that decides this is the bid/ask. Ranking on midpoints is ranking on
 * illiquidity — measured live, CEG showed the second-fattest mid credit on the
 * board and the thinnest realistic one, since only 41% of it survived the
 * spread.
 */

/** Symbols per scan. Each is an upstream chain fetch, and they are not cheap. */
const MAX_SYMBOLS = 25;

/** Concurrent chain fetches. Above this the broker starts refusing. */
const CONCURRENCY = 4;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const raw = params.get('symbols') ?? '';

  const requested = [
    ...new Set(
      raw
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];

  if (requested.length === 0) {
    return NextResponse.json({ error: 'symbols is required' }, { status: 400 });
  }

  const symbols = requested.slice(0, MAX_SYMBOLS);
  const dropped = requested.length - symbols.length;

  const expiration = params.get('expiration')?.trim() || undefined;
  const targetWidth = numberParam(params.get('width')) ?? 5;
  const riskBudget = numberParam(params.get('risk')) ?? 500;
  const offsetPercent = numberParam(params.get('offset')) ?? 0;

  try {
    const broker = await robinhoodBroker(request.url);
    if (!broker) return disconnected();

    const priced: PutCreditSpread[] = [];
    /*
     * Named, not silently omitted.
     *
     * A symbol can fail here for two very different reasons — the chain didn't
     * load, or it loaded and can't support the spread (no strike below the
     * short leg, no quotable puts). Collapsing those into an absence from the
     * results makes a screen you can't trust: you can't tell "nothing here" from
     * "we didn't look".
     */
    const skipped: { symbol: string; reason: string }[] = [];

    await mapWithConcurrency(symbols, CONCURRENCY, async (symbol) => {
      try {
        const chain = await broker.getOptionChain(symbol, expiration);
        const spread = findPutCreditSpread(chain, { targetWidth, riskBudget, offsetPercent });
        if (spread) priced.push(spread);
        else skipped.push({ symbol, reason: 'no spread constructible from this chain' });
      } catch (err) {
        skipped.push({ symbol, reason: (err as Error).message });
      }
    });

    return NextResponse.json({
      scanned: symbols.length,
      dropped,
      skipped,
      targetWidth,
      riskBudget,
      offsetPercent,
      spreads: rankByRealCredit(priced),
    });
  } catch (err) {
    return brokerError(err);
  }
}

function numberParam(raw: string | null): number | undefined {
  if (raw === null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await fn(items[index]);
    }
  });
  await Promise.all(workers);
}
