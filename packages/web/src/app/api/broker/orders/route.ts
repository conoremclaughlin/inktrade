import { NextRequest, NextResponse } from 'next/server';
import { canPlaceOrders, type OrderRequest } from '@inktrade/client';
import { robinhoodBroker } from '@/lib/robinhood';
import { tradingMode } from '@/lib/trading-mode';
import { disconnected, brokerError } from '../shared';

/**
 * Review an order, or place it.
 *
 * `?review=1` simulates and never submits. Without it, this spends real money.
 *
 * The review-only check happens HERE, before the broker is even constructed,
 * because this route is the last place we control. Anything that only guarded
 * the button would be bypassed by a direct request.
 */
export async function POST(request: NextRequest) {
  const review = request.nextUrl.searchParams.get('review') === '1';

  let order: OrderRequest;
  try {
    order = (await request.json()) as OrderRequest;
  } catch {
    return NextResponse.json({ error: 'A JSON order body is required' }, { status: 400 });
  }

  const mode = await tradingMode();
  if (!review && !canPlaceOrders(mode)) {
    // 403 rather than 400: the request is well-formed, we are refusing it.
    return NextResponse.json(
      { error: mode.reason, mode: mode.mode, source: mode.source },
      { status: 403 },
    );
  }

  try {
    const broker = await robinhoodBroker(request.url);
    if (!broker) return disconnected();

    if (review) {
      return NextResponse.json({ review: await broker.reviewOrder(order) });
    }
    return NextResponse.json({ receipt: await broker.placeOrder(order) });
  } catch (err) {
    // Order rejections are the caller's to fix — a bad quantity, a forbidden
    // account — so they read as 400 rather than an upstream failure.
    const message = (err as Error).message;
    if ((err as Error).name === 'OrderRejectedError') {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return brokerError(err);
  }
}

export async function GET() {
  return NextResponse.json(await tradingMode());
}
