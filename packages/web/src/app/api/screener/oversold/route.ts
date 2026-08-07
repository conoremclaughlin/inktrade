import { NextRequest, NextResponse } from 'next/server';
import { screenOversold } from '@inktrade/client';
import { getTickerHistory } from '@/lib/ticker-history';

/**
 * Screen a set of symbols for "oversold, near the lows".
 *
 * Server-side deliberately. RSI needs price history and every source prices
 * one symbol per call — Robinhood's indicator tool says so explicitly — so a
 * watchlist scan is inherently N upstream requests. Doing that from the phone
 * would be N round trips over a mobile connection; doing it here is one
 * request from the client and N parallel ones from a machine on a fast link.
 *
 * Bounded on purpose. An unbounded scan of a 69-symbol list is a minute of
 * fan-out that nobody asked to wait for, so this caps the batch and says what
 * it dropped rather than silently truncating.
 */

/** Symbols per scan. Enough for a real watchlist, small enough to stay quick. */
const MAX_SYMBOLS = 40;

/** Concurrent history fetches. Above this the upstream starts refusing. */
const CONCURRENCY = 6;

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('symbols') ?? '';
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

  // Tunable, because "oversold" is a judgement rather than a constant. The
  // defaults are the conventional ones; a quiet market is a reason to loosen
  // them, not a reason to conclude the screen is broken.
  const threshold = numberParam(request, 'rsi');
  const nearPercent = numberParam(request, 'near');

  const rows = await mapWithConcurrency(symbols, CONCURRENCY, async (symbol) => {
    try {
      const history = await getTickerHistory(symbol, '1y');
      const bars = history.points.map((p) => ({
        date: p.date,
        high: p.high,
        low: p.low,
        close: p.close,
      }));
      const price = bars[bars.length - 1]?.close;
      if (price === undefined) return null;
      return { symbol, price, bars };
    } catch {
      // One unreachable symbol shouldn't void the whole scan; it's reported as
      // skipped rather than silently treated as "not a candidate".
      return null;
    }
  });

  const usable = rows.filter((r): r is NonNullable<typeof r> => r !== null);
  const skipped = symbols.filter((s) => !usable.some((r) => r.symbol === s));

  return NextResponse.json({
    scanned: usable.length,
    skipped,
    dropped,
    threshold: threshold ?? 30,
    nearPercent: nearPercent ?? 5,
    candidates: screenOversold(usable, {
      ...(threshold !== undefined ? { threshold } : {}),
      ...(nearPercent !== undefined ? { nearPercent } : {}),
    }),
  });
}

function numberParam(request: NextRequest, name: string): number | undefined {
  const raw = request.nextUrl.searchParams.get(name);
  if (raw === null) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

/** Run `work` over `items`, at most `limit` at a time, preserving order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index]);
    }
  });

  await Promise.all(workers);
  return results;
}
