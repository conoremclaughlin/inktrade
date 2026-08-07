import { NextRequest, NextResponse } from 'next/server';
import { getTickerHistory } from '@/lib/ticker-history';

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.toUpperCase();
  const period = request.nextUrl.searchParams.get('period') ?? '1y';

  if (!symbol) {
    return NextResponse.json({ error: 'symbol is required' }, { status: 400 });
  }

  try {
    return NextResponse.json(await getTickerHistory(symbol, period));
  } catch (err) {
    const message = (err as Error).message;
    // "Insufficient historical data" is the caller's problem (a bad symbol);
    // anything else is ours.
    const status = message.includes('Insufficient') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
