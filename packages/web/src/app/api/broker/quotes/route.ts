import { NextRequest, NextResponse } from 'next/server';
import { robinhoodBroker } from '@/lib/robinhood';
import { disconnected, brokerError } from '../shared';

/** Quotes from the linked brokerage, in Inktrade's wire shape. */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('symbols');
  if (!raw) return NextResponse.json({ error: 'symbols is required' }, { status: 400 });

  const symbols = raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (symbols.length === 0) {
    return NextResponse.json({ error: 'at least one symbol is required' }, { status: 400 });
  }
  if (symbols.length > 100) {
    return NextResponse.json({ error: 'max 100 symbols' }, { status: 400 });
  }

  try {
    const broker = await robinhoodBroker(request.url);
    if (!broker) return disconnected();
    return NextResponse.json({ quotes: await broker.getQuotes(symbols) });
  } catch (err) {
    return brokerError(err);
  }
}
