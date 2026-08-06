import { NextRequest, NextResponse } from 'next/server';
import { robinhoodBroker } from '@/lib/robinhood';
import { disconnected, brokerError } from '../shared';

/** The brokerage's own watchlists, or one list's symbols when `id` is given. */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')?.trim();

  try {
    const broker = await robinhoodBroker(request.url);
    if (!broker) return disconnected();

    if (id) return NextResponse.json(await broker.getWatchlist(id));
    return NextResponse.json({ watchlists: await broker.getWatchlists() });
  } catch (err) {
    return brokerError(err);
  }
}
