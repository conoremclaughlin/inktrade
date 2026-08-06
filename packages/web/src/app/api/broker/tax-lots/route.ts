import { NextRequest, NextResponse } from 'next/server';
import { robinhoodBroker } from '@/lib/robinhood';
import { disconnected, brokerError } from '../shared';

/**
 * Open tax lots for one holding.
 *
 * Read-only. Nothing here places an order — it exists so a sale can be shown
 * with the lots it would consume and the gain it would realize, before any
 * button that spends money.
 */
export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.trim().toUpperCase();
  const accountId = request.nextUrl.searchParams.get('accountId')?.trim();

  if (!symbol) return NextResponse.json({ error: 'symbol is required' }, { status: 400 });
  if (!accountId) return NextResponse.json({ error: 'accountId is required' }, { status: 400 });

  try {
    const broker = await robinhoodBroker(request.url);
    if (!broker) return disconnected();
    return NextResponse.json({ symbol, lots: await broker.getTaxLots(accountId, symbol) });
  } catch (err) {
    return brokerError(err);
  }
}
