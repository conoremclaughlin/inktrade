'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  COST_BASIS_LABELS,
  COST_BASIS_STRATEGIES,
  isModeUserControlled,
  type CostBasisDecision,
  type CostBasisStrategy,
  type TradingMode,
  type TradingModeDecision,
} from '@inktrade/client';

/**
 * The two settings that change what actually happens to money.
 *
 * Kept together and away from the connection cards because they aren't
 * preferences — one decides whether orders can be sent at all, the other
 * decides which of your shares get sold. Both are enforced server-side; this
 * card explains them, and must never be the only thing enforcing them.
 */
export function TradingCard() {
  const queryClient = useQueryClient();

  const mode = useQuery<TradingModeDecision>({
    queryKey: ['trading-mode'],
    queryFn: () => fetch('/api/broker/trading-mode').then((r) => r.json()),
  });

  const basis = useQuery<CostBasisDecision>({
    queryKey: ['cost-basis'],
    queryFn: () => fetch('/api/broker/cost-basis').then((r) => r.json()),
  });

  const setMode = useMutation({
    mutationFn: (next: TradingMode) =>
      fetch('/api/broker/trading-mode', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trading-mode'] }),
  });

  const setBasis = useMutation({
    mutationFn: (strategy: CostBasisStrategy) =>
      fetch('/api/broker/cost-basis', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy }),
      }).then((r) => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cost-basis'] }),
  });

  const canToggle = mode.data ? isModeUserControlled(mode.data) : false;
  const reviewOnly = mode.data?.mode === 'REVIEW_ONLY';

  return (
    <section className="mt-6 glass-bright rounded-xl border border-border-subtle overflow-hidden">
      <div className="px-6 py-4 border-b border-border-subtle">
        <h2 className="text-[16px] font-semibold text-text-primary">Trading</h2>
        <p className="text-[12px] text-text-tertiary mt-0.5">
          What Inktrade is allowed to send, and which shares it sells
        </p>
      </div>

      <div className="divide-y divide-border-subtle">
        <div className="p-6">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <h3 className="text-[14px] font-semibold text-text-primary">Order placement</h3>
              <p className="mt-1 text-[12px] leading-relaxed text-text-tertiary">
                {reviewOnly
                  ? 'Orders are priced and checked, never submitted.'
                  : 'Orders you confirm are sent to the brokerage.'}
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={!reviewOnly}
              aria-label="Allow order placement"
              disabled={!canToggle || setMode.isPending}
              onClick={() => setMode.mutate(reviewOnly ? 'ENABLED' : 'REVIEW_ONLY')}
              className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-40 disabled:cursor-default ${
                reviewOnly
                  ? 'border-border-subtle bg-surface'
                  : 'border-emerald/40 bg-emerald/25'
              }`}
            >
              <span
                className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-text-primary transition-transform ${
                  reviewOnly ? 'left-0.5' : 'left-0.5 translate-x-5'
                }`}
              />
            </button>
          </div>

          {mode.data?.reason && (
            <p
              className={`mt-3 rounded-lg border px-3 py-2 text-[12px] leading-relaxed ${
                canToggle
                  ? 'border-border-subtle bg-surface/50 text-text-tertiary'
                  : 'border-amber/30 bg-amber/8 text-amber'
              }`}
            >
              {mode.data.reason}
            </p>
          )}
        </div>

        <div className="p-6">
          <h3 className="text-[14px] font-semibold text-text-primary">Cost basis</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-text-tertiary">
            Which lots a sell consumes when you haven&apos;t picked them by hand. Brokers default
            to FIFO, which closes your oldest — usually cheapest — shares and realizes the
            largest possible gain.
          </p>

          <div className="mt-4 space-y-1.5">
            {COST_BASIS_STRATEGIES.map((strategy) => {
              const active = basis.data?.strategy === strategy;
              return (
                <button
                  key={strategy}
                  type="button"
                  disabled={basis.data?.source === 'env' || setBasis.isPending}
                  onClick={() => setBasis.mutate(strategy)}
                  className={`flex w-full items-center justify-between rounded-lg border px-3.5 py-2.5 text-left transition-colors disabled:cursor-default disabled:opacity-50 ${
                    active
                      ? 'border-accent/40 bg-accent/12'
                      : 'border-border-subtle hover:bg-surface/50'
                  }`}
                >
                  <span
                    className={`text-[13px] ${active ? 'font-semibold text-accent-bright' : 'text-text-secondary'}`}
                  >
                    {COST_BASIS_LABELS[strategy]}
                  </span>
                  {strategy === 'FIFO' && (
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-muted">
                      broker default
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {basis.data?.source === 'env' && (
            <p className="mt-3 rounded-lg border border-amber/30 bg-amber/8 px-3 py-2 text-[12px] text-amber">
              Set by INKTRADE_COST_BASIS for this deployment, so it can&apos;t be changed here.
            </p>
          )}

          <p className="mt-3 text-[11px] leading-relaxed text-text-muted">
            Applies to ordinary sells. Exercise and assignment can&apos;t carry a lot selection at
            all — Inktrade warns you before those instead.
          </p>
        </div>
      </div>
    </section>
  );
}
