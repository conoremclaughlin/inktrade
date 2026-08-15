'use client';

import {
  countdownLabel,
  daysUntil,
  describeEarnings,
  earningsProximity,
  timingLabel,
  type EarningsDate,
  type EarningsProximity,
} from '@inktrade/client';

/**
 * "Earnings in 12 days" as an inline marker.
 *
 * Colour tracks urgency rather than sentiment, so it must not reuse the
 * green/red the rest of the app spends on gains and losses — an earnings date
 * is neither good nor bad news, only near or far. Amber for the week of, a
 * quiet neutral beyond that.
 *
 * Beyond the horizon it renders nothing. A date three months out is true and
 * useless, and a badge on every row is a badge you stop reading.
 */

const TONE: Record<EarningsProximity, string> = {
  past: 'border-border-subtle text-text-tertiary',
  today: 'border-amber/50 bg-amber/12 text-amber',
  imminent: 'border-amber/40 bg-amber/8 text-amber',
  near: 'border-border-default text-text-secondary',
  horizon: 'border-border-subtle text-text-tertiary',
  distant: '',
};

export function EarningsBadge({
  earnings,
  asOf,
  className = '',
}: {
  earnings: EarningsDate | null | undefined;
  asOf: string;
  className?: string;
}) {
  if (!earnings || !asOf) return null;

  const days = daysUntil(earnings.date, asOf);
  const proximity = earningsProximity(days);
  if (proximity === 'distant' || proximity === 'past') return null;

  return (
    <span
      title={describeEarnings(earnings, asOf)}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] tabular-nums ${TONE[proximity]} ${className}`}
    >
      <span aria-hidden>◆</span>
      {/*
        The word "earnings" carries on its own; "ER" saves four characters and
        costs anyone who doesn't already know the abbreviation the whole point.
      */}
      Earnings {countdownLabel(days)}
      {earnings.isEstimate && <span className="font-normal opacity-70">est.</span>}
    </span>
  );
}

/**
 * The same fact with room to breathe — for a symbol's own page, where there is
 * space to say the day and the session out loud rather than abbreviating.
 */
export function EarningsLine({
  earnings,
  asOf,
}: {
  earnings: EarningsDate | null | undefined;
  asOf: string;
}) {
  if (!earnings || !asOf) return null;

  const days = daysUntil(earnings.date, asOf);
  const proximity = earningsProximity(days);
  if (proximity === 'distant') return null;

  const urgent = proximity === 'today' || proximity === 'imminent';
  const session = timingLabel(earnings.timing);

  return (
    <div
      className={`flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border px-3 py-2 ${
        urgent ? 'border-amber/40 bg-amber/8' : 'border-border-subtle'
      }`}
    >
      <span
        className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
          urgent ? 'text-amber' : 'text-text-tertiary'
        }`}
      >
        {days < 0 ? 'Reported' : 'Next earnings'}
      </span>
      <span className="font-mono text-[13px] text-text-primary tabular-nums">
        {formatDay(earnings.date)}
      </span>
      <span className="text-[12px] text-text-secondary">
        {countdownLabel(days)}
        {session && ` · ${session}`}
        {earnings.windowEnd && ` · through ${formatDay(earnings.windowEnd)}`}
      </span>
      {earnings.isEstimate && (
        <span
          title="The provider inferred this from the reporting cadence — the company has not confirmed it."
          className="text-[11px] text-text-tertiary"
        >
          estimated
        </span>
      )}
    </div>
  );
}

/**
 * Parsed as UTC on purpose. `new Date('2026-08-26')` is already UTC midnight,
 * but rendering it with the viewer's locale shifts it a day backwards for
 * anyone west of Greenwich — which is most of the people this is for.
 */
function formatDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
