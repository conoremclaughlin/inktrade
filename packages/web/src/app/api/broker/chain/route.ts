import { NextRequest, NextResponse } from 'next/server';
import { robinhoodBroker } from '@/lib/robinhood';
import { disconnected, brokerError } from '../shared';

/**
 * A priced option chain, greeks included.
 *
 * Omit `expiration` for the nearest un-expired one, which is what an option
 * screen opens on. The response carries every available expiration so the UI
 * can render the ladder without a second request.
 */
export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.trim().toUpperCase();
  const expiration = request.nextUrl.searchParams.get('expiration')?.trim() || undefined;

  if (!symbol) return NextResponse.json({ error: 'symbol is required' }, { status: 400 });

  try {
    const broker = await robinhoodBroker(request.url);
    if (!broker) return disconnected();
    return NextResponse.json(await broker.getOptionChain(symbol, expiration));
  } catch (err) {
    return brokerError(err);
  }
}
