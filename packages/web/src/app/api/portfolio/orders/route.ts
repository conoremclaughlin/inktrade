import { NextRequest, NextResponse } from 'next/server';
import { robinhoodBroker } from '@/lib/robinhood';

/**
 * Actions taken, newest first — narrowed to one ticker when asked.
 *
 * The filter goes to the brokerage rather than being applied here, so a ticker
 * screen asks for its own history instead of pulling a global feed and sifting
 * it client-side.
 */
export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.trim().toUpperCase();
  const limitParam = request.nextUrl.searchParams.get('limit');
  const limit = limitParam ? Number(limitParam) : undefined;

  if (limit !== undefined && (!Number.isFinite(limit) || limit <= 0)) {
    return NextResponse.json({ error: 'limit must be a positive number' }, { status: 400 });
  }

  try {
    const broker = await robinhoodBroker(request.url);
    if (!broker) {
      return NextResponse.json(
        { error: 'No brokerage is linked', status: 'disconnected' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      provider: broker.name,
      orders: await broker.getOrders({ symbol, limit }),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
