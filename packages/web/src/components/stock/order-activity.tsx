'use client';

import { optionLabel, type OrderActivity } from '@inktrade/client';
import { useOrderActivity } from '@/lib/broker-hooks';

/**
 * What you actually did in this name.
 *
 * Equity and option orders in one feed, newest first — "what have I done in
 * MU" doesn't distinguish between them.
 *
 * A multi-leg strategy is labelled as one rather than shown as its first leg
 * pretending to be the whole trade: a short put spread rendered as "305P sell"
 * is a different position from the one that was opened.
 */
export function OrderActivityPanel({ symbol }: { symbol: string }) {
  const { data, isLoading, error } = useOrderActivity(symbol, 25);
  const orders = data?.orders ?? [];

  // A brokerage that isn't linked isn't an error worth shouting about on a
  // page that works fine without it.
  if (error) return null;

  return (
    <section className="glass-bright rounded-xl overflow-hidden">
      <div className="border-b border-border-subtle px-5 py-3">
        <h2 className="text-[14px] font-semibold text-text-primary">Your activity</h2>
      </div>

      {isLoading && <p className="px-5 py-4 text-[13px] text-text-muted">Loading…</p>}

      {!isLoading && orders.length === 0 && (
        <p className="px-5 py-4 text-[13px] text-text-muted">No orders in {symbol}.</p>
      )}

      <div className="divide-y divide-border-subtle">
        {orders.map((order) => (
          <OrderRow key={order.id} order={order} />
        ))}
      </div>
    </section>
  );
}

function OrderRow({ order }: { order: OrderActivity }) {
  const isOption = order.assetType === 'OPTION';
  const spread = (order.legCount ?? 1) > 1;

  const title = spread
    ? `${order.symbol} ${(order.strategy ?? 'spread').replace(/_/g, ' ')}`
    : isOption && order.option
      ? optionLabel(order.option)
      : order.symbol;

  const unit = isOption ? (order.quantity === 1 ? 'contract' : 'contracts') : 'shares';

  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-mono text-[13px]">
          <span
            className={`text-[10px] font-bold tracking-[0.06em] ${
              order.side === 'BUY' ? 'text-emerald' : 'text-rose'
            }`}
          >
            {order.side}
          </span>
          <span className="truncate text-text-primary">{title}</span>
        </p>
        <p className="mt-0.5 text-[11px] text-text-tertiary">
          {order.quantity} {unit}
          {spread ? ` · ${order.legCount} legs` : ''} · {stamp(order.timestamp)}
        </p>
      </div>

      <div className="whitespace-nowrap text-right">
        {/*
          A dash, never a zero. An order that never filled has no fill price,
          and $0.00 reads as a free trade.
        */}
        <p className="font-mono text-[13px] tabular-nums text-text-secondary">
          {order.price === null
            ? '—'
            : order.price.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
        </p>
        <p className={`font-mono text-[9px] tracking-[0.08em] ${statusColor(order.status)}`}>
          {order.status}
        </p>
      </div>
    </div>
  );
}

function statusColor(status: OrderActivity['status']): string {
  switch (status) {
    case 'FILLED':
      return 'text-text-tertiary';
    case 'REJECTED':
      return 'text-rose';
    case 'OPEN':
    case 'PARTIAL':
      return 'text-amber';
    default:
      return 'text-text-muted';
  }
}

/** Time within today, date beyond it. */
function stamp(iso: string): string {
  const then = new Date(iso);
  const sameDay = new Date().toDateString() === then.toDateString();
  return sameDay
    ? then.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
