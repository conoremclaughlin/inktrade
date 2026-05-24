import { NextRequest, NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
import { lookupLetf } from '@inktrade/engine';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const periodToDays: Record<string, number> = {
  '1m': 30,
  '3m': 90,
  '6m': 180,
  '1y': 365,
  '2y': 730,
  '5y': 1825,
};

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.toUpperCase();
  const period = request.nextUrl.searchParams.get('period') ?? '1y';

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

  const days = periodToDays[period] ?? 365;
  const start = new Date();
  start.setDate(start.getDate() - days - 5);
  const period1 = start.toISOString().slice(0, 10);

  try {
    const [letfChart, underlyingChart] = await Promise.all([
      yf.chart(symbol, { period1, interval: '1d' }),
      yf.chart(registry.underlyingTicker, { period1, interval: '1d' }),
    ]);

    const letfByDate = new Map<string, number>();
    for (const q of letfChart.quotes) {
      if (q.date && q.close != null) {
        const d = q.date instanceof Date
          ? q.date.toISOString().slice(0, 10)
          : String(q.date).slice(0, 10);
        letfByDate.set(d, q.close);
      }
    }

    const underlyingByDate = new Map<string, number>();
    for (const q of underlyingChart.quotes) {
      if (q.date && q.close != null) {
        const d = q.date instanceof Date
          ? q.date.toISOString().slice(0, 10)
          : String(q.date).slice(0, 10);
        underlyingByDate.set(d, q.close);
      }
    }

    // Inner join on dates
    const commonDates = [...letfByDate.keys()]
      .filter((d) => underlyingByDate.has(d))
      .sort();

    if (commonDates.length < 2) {
      return NextResponse.json({ error: 'Insufficient historical data' }, { status: 400 });
    }

    const letfBase = letfByDate.get(commonDates[0])!;
    const underlyingBase = underlyingByDate.get(commonDates[0])!;

    const points = commonDates.map((date) => {
      const letfPrice = letfByDate.get(date)!;
      const underlyingPrice = underlyingByDate.get(date)!;

      const letfCumReturn = ((letfPrice / letfBase) - 1) * 100;
      const underlyingCumReturn = ((underlyingPrice / underlyingBase) - 1) * 100;
      const naiveCumReturn = underlyingCumReturn * registry.leverageFactor;
      const divergence = letfCumReturn - naiveCumReturn;

      return { date, letfCumReturn, underlyingCumReturn, naiveCumReturn, divergence };
    });

    // Compute summary stats
    let maxDrawdownPct = 0;
    let peak = letfBase;
    for (const date of commonDates) {
      const price = letfByDate.get(date)!;
      if (price > peak) peak = price;
      const dd = ((peak - price) / peak) * 100;
      if (dd > maxDrawdownPct) maxDrawdownPct = dd;
    }

    return NextResponse.json({
      symbol,
      underlying: registry.underlyingTicker,
      leverageFactor: registry.leverageFactor,
      period,
      points,
      maxDrawdownPct,
      totalLetfReturn: points[points.length - 1]?.letfCumReturn ?? 0,
      totalUnderlyingReturn: points[points.length - 1]?.underlyingCumReturn ?? 0,
      totalNaiveReturn: points[points.length - 1]?.naiveCumReturn ?? 0,
      totalDivergence: points[points.length - 1]?.divergence ?? 0,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
