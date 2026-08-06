'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  COST_BASIS_LABELS,
  orderPrices,
  priceAt,
  type OrderRequest,
  type OrderReceipt,
  type OrderReview,
  type OrderSide,
  type OrderType,
  type PriceLevel,
  type SalePlan,
} from '@inktrade/client';

interface Quote {
  bid: number | null;
  ask: number | null;
  price: number | null;
}

interface ReviewResponse {
  review?: OrderReview;
  plan?: SalePlan;
  receipt?: OrderReceipt;
  error?: string;
  mode?: string;
}

/**
 * The order ticket.
 *
 * Two-step by construction: nothing can be submitted that hasn't been reviewed,
 * because the review is where the cost, the broker's alerts and the lot plan
 * become visible. Skipping straight to submit would hide exactly the
 * information the review exists to surface.
 *
 * Every guard here is a courtesy. The API refuses a blocked order on its own —
 * a disabled button is not a control.
 */
export function OrderTicket({
  symbol,
  accountId,
  quote,
}: {
  symbol: string;
  accountId: string;
  quote?: Quote;
}) {
  const [side, setSide] = useState<OrderSide>('BUY');
  const [type, setType] = useState<OrderType>('LIMIT');
  const [quantity, setQuantity] = useState('1');
  const [limitPrice, setLimitPrice] = useState('');
  const [level, setLevel] = useState<PriceLevel | null>(null);
  const [chosePrice, setChosePrice] = useState(false);

  const [result, setResult] = useState<ReviewResponse | null>(null);
  const [pending, setPending] = useState<null | 'review' | 'place'>(null);

  const prices = useMemo(
    () => orderPrices({ bid: quote?.bid, ask: quote?.ask, side }),
    [quote?.bid, quote?.ask, side],
  );

  // Arrive at the marketable price — the ask to buy, the bid to sell.
  //
  // A placeholder is not a value: an empty field showing a greyed price looks
  // filled, leaves Review disabled, and gives no hint why. Prefilling also
  // means flipping Buy to Sell moves the price to the other side of the book,
  // which is what the flip means.
  useEffect(() => {
    if (chosePrice) return;
    setLevel(prices.marketable);
  }, [prices.marketable, chosePrice]);

  // Follow the book while the user hasn't typed a price of their own: a limit
  // pinned to a stale quote is how an order silently stops being marketable.
  useEffect(() => {
    if (!level) return;
    const next = priceAt(prices, level);
    if (next !== null) setLimitPrice(next.toFixed(2));
  }, [level, prices]);

  // Any edit invalidates the review — showing a cost for a different order than
  // the one about to be sent is the worst possible failure here.
  useEffect(() => {
    setResult(null);
  }, [side, type, quantity, limitPrice]);

  const qty = Number(quantity);
  const validQty = Number.isFinite(qty) && qty > 0;
  const needsLimit = type === 'LIMIT';
  const validLimit = !needsLimit || Number(limitPrice) > 0;
  const ready = validQty && validLimit;

  const order: OrderRequest = {
    accountId,
    symbol,
    side,
    type,
    quantity: qty,
    ...(needsLimit ? { limitPrice: Number(limitPrice) } : {}),
    timeInForce: 'DAY',
    session: 'REGULAR',
  };

  const submit = async (mode: 'review' | 'place') => {
    setPending(mode);
    try {
      const response = await fetch(`/api/broker/orders${mode === 'review' ? '?review=1' : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order),
      });
      setResult((await response.json()) as ReviewResponse);
    } catch {
      setResult({ error: 'Could not reach the brokerage.' });
    } finally {
      setPending(null);
    }
  };

  const review = result?.review;
  const plan = result?.plan;

  return (
    <section className="glass-bright rounded-xl border border-border-subtle overflow-hidden">
      <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3">
        <h2 className="text-[14px] font-semibold text-text-primary">
          Trade <span className="font-mono">{symbol}</span>
        </h2>
        {prices.spread !== null && (
          <span className="font-mono text-[11px] text-text-tertiary tabular-nums">
            spread ${prices.spread.toFixed(2)} · {prices.spreadPercent?.toFixed(2)}%
          </span>
        )}
      </div>

      <div className="space-y-4 p-5">
        <Segmented
          options={[
            { value: 'BUY', label: 'Buy' },
            { value: 'SELL', label: 'Sell' },
          ]}
          value={side}
          onChange={(v) => setSide(v as OrderSide)}
          tone={side === 'BUY' ? 'emerald' : 'rose'}
        />

        <Segmented
          options={[
            { value: 'LIMIT', label: 'Limit' },
            { value: 'MARKET', label: 'Market' },
          ]}
          value={type}
          onChange={(v) => setType(v as OrderType)}
        />

        <Field label="Quantity">
          <input
            type="number"
            min="0"
            step="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-full bg-transparent py-2.5 font-mono text-[15px] text-text-primary outline-none tabular-nums"
          />
        </Field>

        {needsLimit && (
          <div className="space-y-2">
            <Field label="Limit price">
              <span className="mr-1 font-mono text-[14px] text-text-muted">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={limitPrice}
                onChange={(e) => {
                  setLimitPrice(e.target.value);
                  setLevel(null);
                  setChosePrice(true);
                }}
                placeholder={prices.mid?.toFixed(2) ?? '0.00'}
                className="w-full bg-transparent py-2.5 font-mono text-[15px] text-text-primary outline-none tabular-nums"
              />
            </Field>

            {/*
              The ToS convention. Prefilling one price and calling it "the"
              price is wrong half the time: the bid never fills a buy, the ask
              pays the whole spread on every one. Three buttons make it a
              decision instead of a default.
            */}
            <div className="flex gap-1.5">
              {(['BID', 'MID', 'ASK'] as PriceLevel[]).map((l) => {
                const price = priceAt(prices, l);
                const marketable = prices.marketable === l;
                return (
                  <button
                    key={l}
                    type="button"
                    disabled={price === null}
                    onClick={() => {
                      setLevel(l);
                      setChosePrice(true);
                    }}
                    className={`flex-1 rounded-md border px-2 py-2 font-mono text-[11px] transition-colors disabled:opacity-30 disabled:cursor-default ${
                      level === l
                        ? 'border-accent/40 bg-accent/15 text-accent-bright'
                        : 'border-border-subtle text-text-tertiary hover:bg-surface/50'
                    }`}
                    title={marketable ? 'Fills immediately' : undefined}
                  >
                    <span className="block font-semibold tracking-[0.1em]">
                      {l}
                      {marketable && ' •'}
                    </span>
                    <span className="block tabular-nums">
                      {price === null ? '—' : `$${price.toFixed(2)}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            disabled={!ready || pending !== null}
            onClick={() => submit('review')}
            className="flex-1 rounded-lg border border-border-subtle py-2.5 text-[13px] font-semibold text-text-secondary transition-colors hover:bg-surface/60 disabled:opacity-40 disabled:cursor-default"
          >
            {pending === 'review' ? 'Reviewing…' : 'Review'}
          </button>
          <button
            type="button"
            // Placing is gated on a review of THIS order — see the effect that
            // clears the result on any edit.
            disabled={!review || pending !== null || review.acceptable === false}
            onClick={() => submit('place')}
            className={`flex-1 rounded-lg border py-2.5 text-[13px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-default ${
              side === 'BUY'
                ? 'border-emerald/30 bg-emerald/15 text-emerald-bright hover:bg-emerald/25'
                : 'border-rose/30 bg-rose/15 text-rose hover:bg-rose/25'
            }`}
          >
            {pending === 'place' ? 'Placing…' : `${side === 'BUY' ? 'Buy' : 'Sell'} ${symbol}`}
          </button>
        </div>

        {result?.error && (
          <p className="rounded-lg border border-rose/30 bg-rose/8 px-3 py-2.5 text-[12px] leading-relaxed text-rose">
            {result.error}
          </p>
        )}

        {result?.receipt && (
          <div className="rounded-lg border border-emerald/30 bg-emerald/8 px-3 py-2.5">
            <p className="text-[13px] font-semibold text-emerald-bright">
              Order {result.receipt.status.toLowerCase()}
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-text-tertiary">
              {result.receipt.quantity} {result.receipt.symbol} · {result.receipt.id}
            </p>
          </div>
        )}

        {review && <ReviewPanel review={review} />}
        {plan && <PlanPanel plan={plan} />}
      </div>
    </section>
  );
}

function ReviewPanel({ review }: { review: OrderReview }) {
  return (
    <div className="space-y-3 rounded-lg border border-border-subtle bg-surface/40 p-3.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
          Estimated cost
        </span>
        <span className="font-mono text-[18px] font-bold text-text-primary tabular-nums">
          {review.estimatedCost === null
            ? '—'
            : review.estimatedCost.toLocaleString('en-US', {
                style: 'currency',
                currency: 'USD',
              })}
        </span>
      </div>

      {/*
        The basis is not decoration. The broker returns no cost at all, so this
        number is ours — computed at the limit, or at the side of the book a
        market order would cross. Saying which keeps it an estimate rather than
        a promise.
      */}
      {review.estimateBasis && (
        <p className="text-[11px] text-text-muted">
          At the {review.estimateBasis.toLowerCase()}. Excludes fees; a market order fills at
          whatever the book offers.
        </p>
      )}

      {review.warnings.map((warning) => (
        <p
          key={warning}
          className={`rounded-md border px-3 py-2 text-[12px] leading-relaxed ${
            review.acceptable
              ? 'border-amber/30 bg-amber/8 text-amber'
              : 'border-rose/30 bg-rose/8 text-rose'
          }`}
        >
          {warning}
        </p>
      ))}

      {/*
        Robinhood requires this be shown verbatim wherever their market data is
        displayed. Not ours to paraphrase or restyle.
      */}
      {review.disclosure && (
        <p className="border-t border-border-subtle pt-2.5 font-mono text-[10px] leading-relaxed text-text-muted">
          {review.disclosure}
        </p>
      )}
    </div>
  );
}

function PlanPanel({ plan }: { plan: SalePlan }) {
  const money = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  if (plan.fallback) {
    return (
      <div className="rounded-lg border border-rose/30 bg-rose/8 p-3.5">
        <p className="text-[13px] font-semibold text-rose">Lots can&apos;t be chosen here</p>
        <p className="mt-1 text-[12px] leading-relaxed text-rose/90">{plan.fallback.reason}</p>
        {plan.fallback.additionalGain !== null && plan.fallback.additionalGain > 0 && (
          <p className="mt-2 text-[12px] leading-relaxed text-rose">
            The broker&apos;s FIFO default realizes{' '}
            <strong className="font-mono tabular-nums">
              {money(plan.fallback.additionalGain)}
            </strong>{' '}
            more gain than {COST_BASIS_LABELS[plan.strategy].toLowerCase()} would.
          </p>
        )}
      </div>
    );
  }

  if (!plan.selection || plan.selection.lots.length === 0) return null;

  return (
    <div className="rounded-lg border border-border-subtle bg-surface/40 p-3.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
          Lots sold
        </span>
        <span className="text-[11px] text-text-muted">{COST_BASIS_LABELS[plan.strategy]}</span>
      </div>

      <div className="mt-2.5 space-y-1">
        {plan.selection.lots.map((lot) => (
          <div key={lot.lotId} className="flex items-center justify-between gap-3 text-[12px]">
            <span className="font-mono text-text-secondary tabular-nums">
              {lot.quantity} @ {lot.costPerShare === null ? '—' : money(lot.costPerShare)}
            </span>
            <span className="flex items-center gap-2">
              {lot.origin === 'ASSIGNMENT' && (
                <span className="rounded bg-amber/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-amber">
                  assigned
                </span>
              )}
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-text-muted">
                {lot.term === 'LONG' ? 'long' : 'short'}
              </span>
              <span
                className={`w-20 text-right font-mono tabular-nums ${
                  (lot.realizedGain ?? 0) >= 0 ? 'text-emerald' : 'text-rose'
                }`}
              >
                {lot.realizedGain === null ? '—' : money(lot.realizedGain)}
              </span>
            </span>
          </div>
        ))}
      </div>

      {plan.selection.realizedGain !== null && (
        <div className="mt-2.5 flex items-baseline justify-between border-t border-border-subtle pt-2.5">
          <span className="text-[12px] text-text-secondary">Realized</span>
          <span
            className={`font-mono text-[14px] font-semibold tabular-nums ${
              plan.selection.realizedGain >= 0 ? 'text-emerald' : 'text-rose'
            }`}
          >
            {money(plan.selection.realizedGain)}
          </span>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-tertiary">
        {label}
      </span>
      <span className="flex items-center rounded-lg border border-border-subtle px-3">
        {children}
      </span>
    </label>
  );
}

function Segmented({
  options,
  value,
  onChange,
  tone,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  tone?: 'emerald' | 'rose';
}) {
  const active =
    tone === 'emerald'
      ? 'border-emerald/30 bg-emerald/15 text-emerald-bright'
      : tone === 'rose'
        ? 'border-rose/30 bg-rose/15 text-rose'
        : 'border-accent/40 bg-accent/15 text-accent-bright';

  return (
    <div className="flex gap-1 rounded-lg border border-border-subtle p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`flex-1 rounded-md border px-3 py-2 text-[13px] font-medium transition-colors ${
            value === option.value
              ? active
              : 'border-transparent text-text-muted hover:text-text-secondary'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
