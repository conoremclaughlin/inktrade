'use client';

import { useState } from 'react';
import {
  countdownLabel,
  daysUntil,
  earningsExposure,
  earningsProximity,
  exposedSymbols,
  timingLabel,
  type EarningsExposure,
  type Position,
} from '@inktrade/client';
import { useEarnings } from '@/lib/broker-hooks';

/**
 * What you hold that reports soon.
 *
 * The failure this exists to prevent is specific and had already happened by
 * the time it was built: two positions reported on the same afternoon and the
 * first anyone knew of it was the price move. Nothing in the app had said a
 * word, because the earnings date lived on a calculator panel you had to go
 * looking for — and you only go looking when you already suspect.
 *
 * So it is unconditional and it sits above the holdings. A report is a known,
 * dated event; there is no excuse for it to arrive as a surprise.
 *
 * Filtered to positions on purpose. A calendar of everything reporting this
 * month is a different feature, and mixing them would bury the four rows that
 * are actually yours.
 */
export function EarningsAhead({
  positions,
  onSymbolClick,
}: {
  positions: Position[];
  onSymbolClick: (symbol: string) => void;
}) {
  const symbols = exposedSymbols(positions);
  const { data } = useEarnings(symbols);
  const [expanded, setExpanded] = useState(false);

  const asOf = data?.asOf ?? '';
  const rows = data ? earningsExposure(positions, data.earnings, asOf) : [];

  // Nothing coming, still loading, or the provider is down — all render as
  // absence. A skeleton here would be a permanent empty box for anyone whose
  // holdings simply have no report in the next two months.
  if (rows.length === 0) return null;

  const urgent = rows.filter((r) => daysUntil(r.earnings.date, asOf) <= 7);
  // Show the pressing ones always; the rest are a click away. Four rows is a
  // glance, twelve is a list you skim past.
  const visible = expanded ? rows : rows.slice(0, Math.max(urgent.length, 4));
  const hidden = rows.length - visible.length;

  return (
    <section
      className={`rounded-xl border ${
        urgent.length > 0 ? 'border-amber/40 bg-amber/6' : 'border-border-subtle bg-abyss'
      }`}
    >
      <header className="flex items-baseline gap-3 px-4 pt-3">
        <h2
          className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
            urgent.length > 0 ? 'text-amber' : 'text-text-tertiary'
          }`}
        >
          Earnings ahead
        </h2>
        <span className="text-[11px] text-text-tertiary">
          {rows.length} of your {rows.length === 1 ? 'position reports' : 'positions report'} within
          two months
        </span>
      </header>

      <div className="mt-2 divide-y divide-border-subtle/60">
        {visible.map((row) => (
          <ExposureRow
            key={row.symbol}
            row={row}
            asOf={asOf}
            onClick={() => onSymbolClick(row.symbol)}
          />
        ))}
      </div>

      {hidden > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="w-full px-4 py-2 text-left text-[11px] text-text-tertiary hover:text-text-secondary"
        >
          {hidden} more ▾
        </button>
      )}
      {expanded && rows.length > 4 && (
        <button
          onClick={() => setExpanded(false)}
          className="w-full px-4 py-2 text-left text-[11px] text-text-tertiary hover:text-text-secondary"
        >
          Show less ▴
        </button>
      )}
    </section>
  );
}

function ExposureRow({
  row,
  asOf,
  onClick,
}: {
  row: EarningsExposure;
  asOf: string;
  onClick: () => void;
}) {
  const days = daysUntil(row.earnings.date, asOf);
  const proximity = earningsProximity(days);
  const soon = proximity === 'today' || proximity === 'imminent';
  const session = timingLabel(row.earnings.timing);

  const shorts = row.optionsThrough.filter((o) => o.isShort);

  return (
    <button
      onClick={onClick}
      className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 text-left hover:bg-surface/40"
    >
      <span className="w-[62px] shrink-0 font-mono text-[13px] font-semibold text-text-primary">
        {row.symbol}
      </span>

      <span
        className={`w-[92px] shrink-0 font-mono text-[12px] tabular-nums ${
          soon ? 'font-semibold text-amber' : 'text-text-secondary'
        }`}
      >
        {countdownLabel(days)}
      </span>

      <span className="w-[130px] shrink-0 text-[11px] text-text-tertiary">
        {formatDay(row.earnings.date)}
        {session && ` · ${session}`}
      </span>

      {row.earnings.isEstimate && (
        <span
          title="Inferred from the reporting cadence, not confirmed by the company."
          className="text-[10px] uppercase tracking-[0.08em] text-text-muted"
        >
          est.
        </span>
      )}

      {/*
        The exposure, not just the date. A short contract that expires after
        the report is the position that can gap through its strikes overnight,
        and it's the reason to be reading this at all.
      */}
      <span className="min-w-0 flex-1 text-right text-[11px] text-text-tertiary">
        {shorts.length > 0 && (
          <span className={soon ? 'text-amber' : 'text-text-secondary'}>
            {shorts.length} short {shorts.length === 1 ? 'contract' : 'contracts'} through it
            {' · '}
          </span>
        )}
        {row.optionsThrough.length > shorts.length &&
          `${row.optionsThrough.length - shorts.length} long · `}
        {row.shares !== 0 && `${Math.abs(row.shares).toLocaleString()} shares`}
      </span>
    </button>
  );
}

/** UTC-pinned: a date-only day must not shift backwards west of Greenwich. */
function formatDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
