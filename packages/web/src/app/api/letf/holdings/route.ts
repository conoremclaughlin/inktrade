import { NextRequest, NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
import { lookupLetf } from '@inktrade/engine';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.toUpperCase();
  if (!symbol) {
    return NextResponse.json({ error: 'symbol is required' }, { status: 400 });
  }

  const registry = lookupLetf(symbol);
  if (!registry) {
    return NextResponse.json(
      { error: `${symbol} is not a recognized leveraged ETF` },
      { status: 404 },
    );
  }

  try {
    /*
     * Ask about the INDEX, not the leveraged fund.
     *
     * Both clients label this section as the underlying — "Underlying
     * Holdings" on web, "Inside QQQ" on mobile — but this used to query
     * topHoldings for the LETF itself. A swap-based fund doesn't hold the
     * index; it holds collateral. TQQQ came back as a money-market fund at
     * 15.2% and three token equity positions, presented as though it were
     * what QQQ is made of.
     */
    const summary = await yf.quoteSummary(registry.underlyingTicker, {
      modules: ['topHoldings'],
    });

    const topHoldings = summary.topHoldings;
    const rawHoldings = topHoldings?.holdings ?? [];

    const holdingSymbols = rawHoldings
      .map((h) => h.symbol)
      .filter((s): s is string => !!s && s.length > 0)
      .slice(0, 10);

    let quotes: Map<string, { change1D: number }> = new Map();
    if (holdingSymbols.length > 0) {
      try {
        const quoteResults = await yf.quote(holdingSymbols);
        const arr = Array.isArray(quoteResults) ? quoteResults : [quoteResults];
        for (const q of arr) {
          if (q.symbol) {
            quotes.set(q.symbol, {
              change1D: (q as Record<string, unknown>).regularMarketChangePercent as number ?? 0,
            });
          }
        }
      } catch {
        // Non-critical: holdings table still works without performance data
      }
    }

    const holdings = rawHoldings.slice(0, 15).map((h) => {
      const q = h.symbol ? quotes.get(h.symbol) : null;
      return {
        symbol: h.symbol ?? '',
        name: h.holdingName ?? h.symbol ?? '',
        weight: (h.holdingPercent ?? 0) * 100,
        change1D: q?.change1D ?? null,
        change1W: null,
        change1M: null,
      };
    });

    const sectorWeightings: Record<string, number> = {};
    if (topHoldings?.sectorWeightings) {
      for (const sw of topHoldings.sectorWeightings) {
        for (const [key, val] of Object.entries(sw)) {
          if (typeof val === 'number' && val > 0) {
            sectorWeightings[key] = val * 100;
          }
        }
      }
    }

    const sortedWeights = holdings.map((h) => h.weight).sort((a, b) => b - a);
    const top5 = sortedWeights.slice(0, 5).reduce((s, w) => s + w, 0);
    const top10 = sortedWeights.slice(0, 10).reduce((s, w) => s + w, 0);

    return NextResponse.json({
      holdings,
      sectorWeightings,
      topConcentration: { top5, top10 },
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
