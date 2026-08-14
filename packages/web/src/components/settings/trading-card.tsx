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
 * The three placement modes, in increasing order of consequence.
 *
 * Ordered deliberately: review-only first, paper second, live last, so the
 * rightmost option is the one that spends money. Colour follows the same
 * logic — only live is green, because only live is real.
 */
const MODE_CHOICES: ReadonlyArray<{
  value: TradingMode;
  label: string;
  detail: string;
  onClass: string;
  labelClass: string;
}> = [
  {
    value: 'REVIEW_ONLY',
    label: 'Review only',
    detail: 'Priced and checked. Nothing is ever submitted.',
    onClass: 'border-border-bright bg-surface',
    labelClass: 'text-text-primary',
  },
  {
    value: 'PAPER',
    label: 'Paper',
    detail: 'Filled against a simulation of the live book. No money moves.',
    onClass: 'border-accent/40 bg-accent/12',
    labelClass: 'text-accent-bright',
  },
  {
    value: 'ENABLED',
    label: 'Live',
    detail: 'Orders you confirm are sent to the brokerage.',
    onClass: 'border-emerald/40 bg-emerald/12',
    labelClass: 'text-emerald',
  },
];

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
  const current = mode.data?.mode ?? 'ENABLED';

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
          <h3 className="text-[14px] font-semibold text-text-primary">Order placement</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-text-tertiary">
            Three states, not a switch. Paper is not "off" — orders are priced against the live
            market and filled against a simulation, which is a different thing from not sending
            them at all.
          </p>

          {/*
            Radios rather than a toggle. A two-state switch cannot express
            three modes, and the one in the middle is the one where someone
            most needs to be certain which state they are in.
          */}
          <div
            role="radiogroup"
            aria-label="Order placement mode"
            className="mt-3 grid gap-2 sm:grid-cols-3"
          >
            {MODE_CHOICES.map((choice) => {
              const on = current === choice.value;
              return (
                <button
                  key={choice.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={!canToggle || setMode.isPending}
                  onClick={() => setMode.mutate(choice.value)}
                  className={`rounded-lg border px-3 py-2.5 text-left transition-colors disabled:cursor-default disabled:opacity-40 ${
                    on ? choice.onClass : 'border-border-subtle hover:border-border-default'
                  }`}
                >
                  <span
                    className={`block text-[13px] font-semibold ${on ? choice.labelClass : 'text-text-secondary'}`}
                  >
                    {choice.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-text-tertiary">
                    {choice.detail}
                  </span>
                </button>
              );
            })}
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
