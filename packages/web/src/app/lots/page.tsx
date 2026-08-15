'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { LotSelector } from '@/components/trade/lot-selector';
import { usePortfolio } from '@/lib/broker-hooks';

/**
 * useSearchParams opts its subtree out of prerendering, so the page body sits
 * behind a Suspense boundary — see the default export below.
 */
function LotsContent() {
  const searchParams = useSearchParams();
  const { data, isLoading } = usePortfolio();

  const [symbol, setSymbol] = useState(() => searchParams.get('symbol')?.toUpperCase() ?? '');
  const [quantity, setQuantity] = useState(100);

  const accounts = data?.summary.accounts ?? [];
  const [accountId, setAccountId] = useState<string>('');
  const account = accounts.find((a) => a.accountId === accountId) ?? accounts[0];

  // Equity holdings only — tax lots are tracked per instrument, and options
  // don't have them in the sense this page means.
  const holdings = (account?.positions ?? [])
    .filter((p) => p.assetType === 'EQUITY' && p.quantity > 0)
    .sort((a, b) => b.marketValue - a.marketValue);

  const holding = holdings.find((h) => h.symbol === symbol);
  const price = holding && holding.quantity !== 0 ? holding.marketValue / holding.quantity : 0;

  return (
    <AppShell activeSymbol={symbol} onSymbolClick={setSymbol}>
      <div className="pb-16 px-4 sm:px-6 pt-8">
        <div className="mx-auto max-w-[900px]">
          <div className="mb-8">
            <h1 className="font-display text-3xl md:text-4xl tracking-[-0.02em] text-text-primary">
              Cost Basis
            </h1>
            <p className="mt-2 text-[14px] text-text-secondary">
              Which shares a sale would close, and what it would realize
            </p>
          </div>

          <div className="glass-bright rounded-xl p-5 mb-6 space-y-4">
            {accounts.length > 1 && (
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-tertiary mb-2">
                  Account
                </label>
                <div className="flex gap-1.5 flex-wrap">
                  {accounts.map((a) => (
                    <button
                      key={a.accountId}
                      onClick={() => setAccountId(a.accountId)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                        a.accountId === account?.accountId
                          ? 'bg-accent/15 text-accent-bright border-accent/30'
                          : 'border-border-subtle text-text-muted hover:text-text-secondary'
                      }`}
                    >
                      {a.nickname}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-tertiary mb-2">
                Holding
              </label>
              {isLoading ? (
                <p className="text-[12px] text-text-muted">Loading positions…</p>
              ) : holdings.length === 0 ? (
                <p className="text-[12px] text-text-muted">No equity positions in this account.</p>
              ) : (
                <div className="flex gap-1.5 flex-wrap">
                  {holdings.map((h) => (
                    <button
                      key={h.symbol}
                      onClick={() => setSymbol(h.symbol)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-mono font-medium border transition-all ${
                        h.symbol === symbol
                          ? 'bg-accent/15 text-accent-bright border-accent/30'
                          : 'border-border-subtle text-text-muted hover:text-text-secondary'
                      }`}
                    >
                      {h.symbol}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {symbol && (
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-tertiary mb-2">
                  Shares to sell
                </label>
                <input
                  type="number"
                  min={0}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(0, Number(e.target.value)))}
                  className="w-40 glass rounded-lg px-4 py-2 text-[14px] font-mono text-text-primary bg-transparent outline-none focus:border-accent/40 transition-colors"
                />
              </div>
            )}
          </div>

          {symbol && account && (
            <div className="glass-bright rounded-xl p-5">
              <LotSelector
                accountId={account.accountId}
                symbol={symbol}
                quantity={quantity}
                price={price}
              />
            </div>
          )}

          <p className="mt-4 text-[11px] text-text-muted">
            Nothing on this page places an order. Figures are informational, not tax advice.
          </p>
        </div>
      </div>
    </AppShell>
  );
}

export default function LotsPage() {
  return (
    <Suspense fallback={null}>
      <LotsContent />
    </Suspense>
  );
}
