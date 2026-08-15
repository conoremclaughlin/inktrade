import { NextRequest, NextResponse } from 'next/server';
import {
  canPlaceOrders,
  planSale,
  type CostBasisStrategy,
  type OrderRequest,
  type SalePlan,
} from '@inktrade/client';
import { robinhoodBroker } from '@/lib/robinhood';
import { tradingMode } from '@/lib/trading-mode';
import { costBasisStrategy } from '@/lib/cost-basis';
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

  // Hoisted so a broker rejection still returns it. The plan is computed from
  // our own lot data, so it stays true and useful even when the order itself
  // is refused — and which shares would have been sold is exactly what someone
  // wants to see while fixing whatever the broker objected to.
  let plan: SalePlan | undefined;

  try {
    const broker = await robinhoodBroker(request.url);
    if (!broker) return disconnected();

    const applied = await applyCostBasis(broker, order, request);
    plan = applied.plan;

    if (review) {
      return NextResponse.json({ review: await broker.reviewOrder(applied.order), plan });
    }
    return NextResponse.json({ receipt: await broker.placeOrder(applied.order), plan });
  } catch (err) {
    // Order rejections are the caller's to fix — a bad quantity, a forbidden
    // account — so they read as 400 rather than an upstream failure.
    const message = (err as Error).message;
    if ((err as Error).name === 'OrderRejectedError') {
      return NextResponse.json({ error: message, plan }, { status: 400 });
    }
    return brokerError(err);
  }
}

export async function GET() {
  return NextResponse.json(await tradingMode());
}

type Broker = NonNullable<Awaited<ReturnType<typeof robinhoodBroker>>>;

/**
 * Choose which shares a sell consumes, before it reaches the broker.
 *
 * Omitting `tax_lots` means FIFO — the oldest, usually lowest-basis shares get
 * closed for the largest possible gain. Nobody picks that; it is simply what
 * happens when nothing else does. So a sell that arrives without an explicit
 * selection gets the user's strategy applied here, at the last point we
 * control, rather than being handed to the broker to decide.
 *
 * The resulting plan is returned alongside the review or receipt so the UI can
 * show which lots went. Choosing lots silently would fix the tax outcome while
 * keeping the thing that makes FIFO so damaging: nobody being told.
 *
 * An explicit `taxLots` on the request always wins — a user who picked lots by
 * hand has already made this decision.
 */
async function applyCostBasis(
  broker: Broker,
  order: OrderRequest,
  request: NextRequest,
): Promise<{ order: OrderRequest; plan?: SalePlan }> {
  if (order.side !== 'SELL' || (order.taxLots && order.taxLots.length > 0)) return { order };

  const override = request.nextUrl.searchParams.get('strategy');
  const strategy: CostBasisStrategy = override
    ? ((override.toUpperCase() as CostBasisStrategy) ?? undefined)
    : (await costBasisStrategy()).strategy;

  let lots;
  try {
    lots = await broker.getTaxLots(order.accountId, order.symbol);
  } catch {
    // A lot lookup that fails must not take the order down with it. The sale
    // still works; it just falls to the broker's default, which is said out
    // loud rather than hidden.
    return {
      order,
      plan: {
        strategy,
        taxLots: [],
        selection: null,
        fallback: {
          reason:
            "Couldn't read your tax lots, so this sale uses the broker's default (FIFO).",
          realizedGain: null,
          additionalGain: null,
        },
      },
    };
  }

  if (lots.length === 0) return { order };

  const plan = planSale({
    lots,
    quantity: order.quantity ?? 0,
    // A limit order's price is known; a market order's is not until it fills,
    // and the selection doesn't depend on it either way.
    salePrice: order.limitPrice ?? null,
    strategy,
    order,
  });

  if (plan.taxLots.length === 0) return { order, plan };
  return { order: { ...order, taxLots: plan.taxLots }, plan };
}
