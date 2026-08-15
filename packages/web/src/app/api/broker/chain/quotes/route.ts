import { NextRequest, NextResponse } from 'next/server';
import { robinhoodBroker } from '@/lib/robinhood';
import { disconnected, brokerError } from '../../shared';

/** Quote limit per upstream call — requesting more silently drops the close. */
const MAX_IDS = 20;

/**
 * Price specific contracts by id.
 *
 * A chain returns every contract definition but prices only a window around
 * the money. This fills in the rest on demand, so scrolling toward a strike
 * pays for that strike rather than for the whole ladder up front.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('ids');
  if (!raw) return NextResponse.json({ error: 'ids is required' }, { status: 400 });

  const ids = raw.split(',').map((id) => id.trim()).filter(Boolean);
  if (ids.length === 0) {
    return NextResponse.json({ error: 'at least one id is required' }, { status: 400 });
  }
  if (ids.length > MAX_IDS) {
    return NextResponse.json({ error: `max ${MAX_IDS} ids` }, { status: 400 });
  }

  try {
    const broker = await robinhoodBroker(request.url);
    if (!broker) return disconnected();
    return NextResponse.json({ contracts: await broker.getOptionContracts(ids) });
  } catch (err) {
    return brokerError(err);
  }
}
