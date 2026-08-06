'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { allPositions, brokerIdOf, type Position } from '@inktrade/client';
import { Navbar } from '@/components/navbar';
import { OrderTicket } from '@/components/trade/order-ticket';
import { ExerciseAdvisory } from '@/components/trade/exercise-advisory';
import { useBrokerQuotes, usePortfolio } from '@/lib/broker-hooks';

/**
 * The trading screen: ticket on the left, what you already hold on the right.
 *
 * The two belong together because the option positions are what create the
 * exercise and assignment exposure the advisories warn about — showing the
 * warning next to the position it concerns is the difference between a notice
 * and a nag.
 */
export default function TradePage() {
  return (
    <div className="min-h-screen bg-void">
      <Navbar />
      <Suspense fallback={null}>
        <TradeBody />
      </Suspense>
    </div>
  );
}

function TradeBody() {
  const searchParams = useSearchParams();
  const [symbol, setSymbol] = useState(
    () => searchParams.get('symbol')?.toUpperCase() || 'SOXL',
  );
  const [draft, setDraft] = useState(symbol);

  const portfolio = usePortfolio();
  const summary = portfolio.data?.summary;
  const broker = brokerIdOf(portfolio.data?.provider);

  const accounts = summary?.accounts ?? [];
  const [accountId, setAccountId] = useState<string | null>(null);
  const account = accountId ?? accounts[0]?.accountId ?? null;

  const quotes = useBrokerQuotes([symbol]);
  const quote = quotes.data?.quotes?.[0];

  const positions = summary ? allPositions(summary) : [];
  const related = useMemo(
    () =>
      positions.filter(
        (p) =>
          p.symbol === symbol ||
          (p.assetType === 'OPTION' && p.option?.underlyingSymbol === symbol),
      ),
    [positions, symbol],
  );
  const optionPositions = related.filter((p) => p.assetType === 'OPTION' && p.option);

  return (
    <main className="mx-auto max-w-6xl px-5 pb-16 pt-24">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-[-0.02em] text-text-primary">Trade</h1>
          <p className="mt-1 text-[13px] text-text-tertiary">
            Review before you place. Lots are chosen for you and shown before anything is sent.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSymbol(draft.trim().toUpperCase());
          }}
          className="flex gap-2"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Symbol"
            className="w-28 rounded-lg border border-border-subtle bg-transparent px-3 py-2 font-mono text-[14px] uppercase text-text-primary outline-none focus:border-accent/40"
          />
          <button
            type="submit"
            className="rounded-lg border border-accent/30 bg-accent/15 px-4 py-2 text-[13px] font-semibold text-accent-bright transition-colors hover:bg-accent/25"
          >
            Load
          </button>
        </form>
      </div>

      {accounts.length > 1 && (
        <div className="mb-5 flex flex-wrap gap-1.5">
          {accounts.map((a) => (
            <button
              key={a.accountId}
              onClick={() => setAccountId(a.accountId)}
              className={`rounded-lg border px-3 py-1.5 font-mono text-[12px] transition-colors ${
                account === a.accountId
                  ? 'border-accent/40 bg-accent/12 text-accent-bright'
                  : 'border-border-subtle text-text-tertiary hover:bg-surface/50'
              }`}
            >
              {a.nickname || a.accountId}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start">
        {account ? (
          <OrderTicket
            symbol={symbol}
            accountId={account}
            quote={
              quote
                ? { bid: quote.bid ?? null, ask: quote.ask ?? null, price: quote.price }
                : undefined
            }
          />
        ) : (
          <section className="glass-bright rounded-xl border border-border-subtle p-6 text-center">
            <p className="text-[13px] text-text-tertiary">
              {portfolio.isLoading
                ? 'Loading accounts…'
                : 'Link a brokerage in Settings to place orders.'}
            </p>
          </section>
        )}

        <div className="space-y-4">
          {optionPositions.map((p) => (
            <div key={`${p.symbol}-${p.option!.expiration}`} className="space-y-2">
              <PositionSummary position={p} />
              <ExerciseAdvisory
                broker={broker}
                option={p.option!}
                // Quantity carries the direction: a short position is the one
                // that can be assigned.
                side={p.quantity >= 0 ? 'BUY' : 'SELL'}
              />
            </div>
          ))}

          {related.length === 0 && !portfolio.isLoading && (
            <section className="rounded-xl border border-border-subtle p-6 text-center">
              <p className="text-[13px] text-text-tertiary">
                No position in <span className="font-mono">{symbol}</span>.
              </p>
            </section>
          )}

          {related
            .filter((p) => p.assetType !== 'OPTION')
            .map((p) => (
              <PositionSummary key={p.symbol} position={p} />
            ))}
        </div>
      </div>
    </main>
  );
}

function PositionSummary({ position }: { position: Position }) {
  const money = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const isOption = position.assetType === 'OPTION';

  return (
    <section className="rounded-xl border border-border-subtle bg-surface/30 px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-mono text-[13px] font-semibold text-text-primary">
            {position.symbol}
          </p>
          <p className="mt-0.5 text-[11px] text-text-tertiary">
            {position.quantity > 0 ? '+' : ''}
            {position.quantity} {isOption ? 'contracts' : 'shares'} · avg{' '}
            {money(position.averagePrice)}
          </p>
        </div>
        <div className="text-right font-mono tabular-nums">
          <p className="text-[13px] text-text-secondary">{money(position.marketValue)}</p>
          <p
            className={`text-[11px] ${position.dayChangePercent >= 0 ? 'text-emerald' : 'text-rose'}`}
          >
            {position.dayChangePercent >= 0 ? '+' : ''}
            {position.dayChangePercent.toFixed(2)}%
          </p>
        </div>
      </div>
    </section>
  );
}
