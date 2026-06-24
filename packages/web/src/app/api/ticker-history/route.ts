import { NextRequest, NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

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

  const days = periodToDays[period] ?? 365;
  const start = new Date();
  start.setDate(start.getDate() - days - 5);
  const period1 = start.toISOString().slice(0, 10);

  try {
    const chart = await yf.chart(symbol, { period1, interval: '1d' });

    const quotes = chart.quotes.filter(
      (q) => q.date != null && q.close != null,
    );

    if (quotes.length < 2) {
      return NextResponse.json(
        { error: 'Insufficient historical data' },
        { status: 400 },
      );
    }

    const baseClose = quotes[0].close!;

    let peak = baseClose;
    let maxDrawdownPct = 0;

    const points = quotes.map((q) => {
      const date =
        q.date instanceof Date
          ? q.date.toISOString().slice(0, 10)
          : String(q.date).slice(0, 10);
      const open = q.open ?? q.close!;
      const high = q.high ?? q.close!;
      const low = q.low ?? q.close!;
      const close = q.close!;
      const cumReturn = ((close / baseClose) - 1) * 100;

      if (close > peak) peak = close;
      const dd = ((peak - close) / peak) * 100;
      if (dd > maxDrawdownPct) maxDrawdownPct = dd;

      const volume = Number(q.volume ?? 0);
      return { date, open, high, low, close, cumReturn, volume };
    });

    const totalReturn = points[points.length - 1]?.cumReturn ?? 0;

    // Annualized return
    const years = days / 365;
    const growthFactor = 1 + totalReturn / 100;
    const annualizedReturn =
      years > 0 && growthFactor > 0
        ? (Math.pow(growthFactor, 1 / years) - 1) * 100
        : 0;

    return NextResponse.json({
      symbol,
      period,
      points,
      totalReturn,
      maxDrawdownPct,
      annualizedReturn,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
