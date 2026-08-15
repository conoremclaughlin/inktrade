'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  COST_BASIS_LABELS,
  COST_BASIS_STRATEGIES,
  selectLots,
  taxLotsQuery,
  unrealizedGain,
  type CostBasisStrategy,
  type TaxLot,
} from '@inktrade/client';
import { brokerApi } from '@/lib/broker-api';

interface Props {
  accountId: string;
  symbol: string;
  /** Shares the sale would close. */
  quantity: number;
  price: number;
  onSelectionChange?: (lots: { lotId: string; quantity: number }[]) => void;
}

/**
 * Which lots a sale consumes, and what that realizes.
 *
 * Brokers default to FIFO and never ask. This makes the choice visible before
 * the order exists, because the difference is real money: on a live SOXL
 * position, harvesting the highest-cost lot versus FIFO differs by over
 * $12,000 on a hundred shares.
 *
 * Read-only. Nothing here places an order.
 */
export function LotSelector({ accountId, symbol, quantity, price, onSelectionChange }: Props) {
  // No default. The strategy that silently applies to every sale is exactly
  // the thing the user should choose rather than inherit.
  const [strategy, setStrategy] = useState<CostBasisStrategy | null>(null);

  const { data, isLoading, error } = useQuery(taxLotsQuery(brokerApi, accountId, symbol));
  const lots = data?.lots ?? [];

  const selection = useMemo(() => {
    if (!strategy || lots.length === 0) return null;
    const result = selectLots(lots, quantity, strategy, price);
    onSelectionChange?.(result.lots.map((l) => ({ lotId: l.lotId, quantity: l.quantity })));
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lots, quantity, strategy, price]);

  const chosen = useMemo(
    () => new Set(selection?.lots.map((l) => l.lotId) ?? []),
    [selection],
  );

  if (isLoading) {
    return <p className="text-[12px] text-text-muted">Loading lots…</p>;
  }

  if (error) {
    return (
      <p className="text-[12px] text-rose">
        Couldn&apos;t load tax lots — a sale would use the broker default (FIFO).
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-tertiary mb-2">
          Cost basis
        </label>
        <div className="flex gap-1.5 flex-wrap">
          {COST_BASIS_STRATEGIES.map((option) => (
            <button
              key={option}
              onClick={() => setStrategy(option)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${
                option === strategy
                  ? 'bg-accent/15 text-accent-bright border-accent/30'
                  : 'border-border-subtle text-text-muted hover:text-text-secondary'
              }`}
            >
              {COST_BASIS_LABELS[option]}
            </button>
          ))}
        </div>
        {!strategy && (
          <p className="mt-2 text-[11px] text-amber-400">
            Nothing selected — this sale would use the broker default, FIFO, which sells
            your oldest shares first.
          </p>
        )}
      </div>

      {selection && <SelectionSummary selection={selection} />}

      <LotTable lots={lots} chosen={chosen} price={price} />
    </div>
  );
}

function SelectionSummary({ selection }: { selection: ReturnType<typeof selectLots> }) {
  const { realizedGain, shortTermGain, longTermGain, shortfall, lots } = selection;

  return (
    <div className="rounded-lg border border-border-subtle bg-surface/50 px-4 py-3 space-y-1.5">
      {shortfall > 0 && (
        // Never silently sell less or let the rest fall to FIFO — that is the
        // failure the whole feature exists to prevent.
        <p className="text-[12px] text-rose">
          {shortfall} shares can&apos;t be covered by selectable lots. Reduce the quantity or
          choose lots manually.
        </p>
      )}

      {selection.unselectableQuantity > 0 && (
        <p className="text-[11px] text-text-tertiary">
          {selection.unselectableQuantity} shares are in lots acquired too recently for the
          broker to accept in a specified-lot sale.
        </p>
      )}

      {realizedGain === null ? (
        <p className="text-[12px] text-text-tertiary">
          Realized gain unknown — one of these lots has a cost basis the broker
          hasn&apos;t settled yet.
        </p>
      ) : (
        <>
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] text-text-secondary">Realized</span>
            <span
              className={`text-[16px] font-mono font-bold tabular-nums ${
                realizedGain >= 0 ? 'text-emerald' : 'text-rose'
              }`}
            >
              {realizedGain >= 0 ? '+' : '−'}${Math.abs(realizedGain).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
          <div className="flex justify-between text-[11px] text-text-tertiary">
            <span>
              {lots.length} lot{lots.length === 1 ? '' : 's'}
            </span>
            <span className="font-mono tabular-nums">
              short {money(shortTermGain)} · long {money(longTermGain)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function LotTable({
  lots,
  chosen,
  price,
}: {
  lots: TaxLot[];
  chosen: Set<string>;
  price: number;
}) {
  if (lots.length === 0) {
    return <p className="text-[12px] text-text-muted">No open lots for this holding.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px] font-mono border-collapse">
        <thead>
          <tr className="border-b border-border-subtle text-[10px] uppercase tracking-wider text-text-muted">
            <th className="px-2 py-1.5 text-left font-medium">Acquired</th>
            <th className="px-2 py-1.5 text-right font-medium">Shares</th>
            <th className="px-2 py-1.5 text-right font-medium">Cost</th>
            <th className="px-2 py-1.5 text-right font-medium">Unrealized</th>
            <th className="px-2 py-1.5 text-left font-medium">Term</th>
          </tr>
        </thead>
        <tbody>
          {lots.map((lot) => {
            const gain = unrealizedGain(lot, price);
            return (
              <tr
                key={lot.id}
                className={`border-b border-border-subtle/40 ${
                  chosen.has(lot.id) ? 'bg-accent/10' : ''
                } ${lot.selectable ? '' : 'opacity-50'}`}
              >
                <td className="px-2 py-1.5 text-text-secondary">
                  {lot.openDate}
                  {/* Worth calling out: these arrived at a basis nobody chose. */}
                  {lot.origin === 'ASSIGNMENT' && (
                    <span className="ml-1.5 text-[9px] uppercase tracking-wider text-amber-400">
                      assigned
                    </span>
                  )}
                  {!lot.selectable && (
                    <span className="ml-1.5 text-[9px] uppercase tracking-wider text-text-muted">
                      syncing
                    </span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-text-secondary">
                  {lot.quantity}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-text-secondary">
                  {lot.costPerShare === null ? 'pending' : `$${lot.costPerShare.toFixed(2)}`}
                </td>
                <td
                  className={`px-2 py-1.5 text-right tabular-nums ${
                    gain === null ? 'text-text-muted' : gain >= 0 ? 'text-emerald' : 'text-rose'
                  }`}
                >
                  {gain === null ? '—' : money(gain)}
                </td>
                <td className="px-2 py-1.5 text-text-tertiary">
                  {lot.term === 'LONG' ? 'Long' : 'Short'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function money(value: number | null): string {
  if (value === null) return '—';
  const sign = value >= 0 ? '+' : '−';
  return `${sign}$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
