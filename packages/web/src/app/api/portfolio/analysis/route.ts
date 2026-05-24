import { NextRequest, NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
import { analyzePortfolio, type PricePoint, type QuoteInfo } from '@inktrade/engine/portfolio';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const MAX_SYMBOLS = 12;

const periodToDays: Record<string, number> = {
  '6m': 180,
  '1y': 365,
  '2y': 730,
  '5y': 1825,
};

export async function GET(request: NextRequest) {
  const symbolsParam = request.nextUrl.searchParams.get('symbols');
  const lookback = request.nextUrl.searchParams.get('lookback') ?? '1y';

  if (!symbolsParam) {
    return NextResponse.json({ error: 'symbols parameter is required' }, { status: 400 });
  }

  const symbols = symbolsParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  if (symbols.length < 2) {
    return NextResponse.json({ error: 'at least 2 symbols required' }, { status: 400 });
  }
  if (symbols.length > MAX_SYMBOLS) {
    return NextResponse.json({ error: `max ${MAX_SYMBOLS} symbols` }, { status: 400 });
  }

  const days = periodToDays[lookback] ?? 365;
  const start = new Date();
  start.setDate(start.getDate() - days - 5);
  const period1 = start.toISOString().slice(0, 10);

  try {
    const [charts, quotesRaw] = await Promise.all([
      Promise.all(symbols.map(async (symbol) => {
        try {
          const chart = await yf.chart(symbol, { period1, interval: '1d' });
          return { symbol, chart };
        } catch {
          return { symbol, chart: null };
        }
      })),
      Promise.all(symbols.map(async (symbol) => {
        try {
          const q = await yf.quote(symbol);
          return { symbol, quote: q };
        } catch {
          return { symbol, quote: null };
        }
      })),
    ]);

    const histories = new Map<string, PricePoint[]>();
    const quotes = new Map<string, QuoteInfo>();
    const errors: string[] = [];

    for (const { symbol, chart } of charts) {
      if (!chart) {
        errors.push(`Failed to fetch history for ${symbol}`);
        continue;
      }
      const bars = chart.quotes
        .filter(q => q.date != null && q.close != null)
        .map(q => ({
          date: q.date instanceof Date
            ? q.date.toISOString().slice(0, 10)
            : String(q.date).slice(0, 10),
          close: q.close!,
        }));
      if (bars.length < 20) {
        errors.push(`Insufficient data for ${symbol}`);
        continue;
      }
      histories.set(symbol, bars);
    }

    for (const { symbol, quote } of quotesRaw) {
      if (quote && histories.has(symbol)) {
        quotes.set(symbol, {
          price: (quote as Record<string, unknown>).regularMarketPrice as number ?? 0,
          changePercent: (quote as Record<string, unknown>).regularMarketChangePercent as number ?? 0,
        });
      }
    }

    if (histories.size < 2) {
      return NextResponse.json(
        { error: 'Need at least 2 symbols with valid data', errors },
        { status: 400 },
      );
    }

    const analysis = analyzePortfolio(histories, quotes);

    return NextResponse.json({ ...analysis, errors: errors.length > 0 ? errors : undefined });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
