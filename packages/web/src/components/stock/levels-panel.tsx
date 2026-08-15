'use client';

import { useMemo } from 'react';
import {
  periodLevels,
  supportResistance,
  type SwingLevel,
  type TickerHistoryPoint,
} from '@inktrade/client';

/**
 * Where price sits, and what it has reacted to.
 *
 * Two different questions, so two sections. Period levels are facts about the
 * range — the 52-week high is the 52-week high. Support and resistance are
 * claims about behaviour: prices the market turned at more than once.
 *
 * Both use the same functions as mobile, so the two platforms cannot disagree
 * about where a level is.
 */
export function LevelsPanel({
  points,
  price,
}: {
  points: TickerHistoryPoint[];
  price: number | null;
}) {
  const levels = useMemo(() => {
    if (points.length === 0 || price === null) return [];
    // The last bar's date, not the wall clock: on a weekend the clock says
    // Sunday while the newest session is Friday's.
    return periodLevels(points, price, points[points.length - 1].date.slice(0, 10));
  }, [points, price]);

  const swings = useMemo(
    () => (price === null ? [] : supportResistance(points, price)),
    [points, price],
  );

  if (points.length === 0 || price === null) return null;

  const resistance = swings.filter((l) => l.kind === 'resistance');
  const support = swings.filter((l) => l.kind === 'support');

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="glass-bright rounded-xl overflow-hidden">
        <div className="border-b border-border-subtle px-5 py-3">
          <h2 className="text-[14px] font-semibold text-text-primary">Levels</h2>
          <p className="mt-0.5 text-[11px] text-text-tertiary">
            Where price sits in its own range
          </p>
        </div>

        <div className="grid grid-cols-2 gap-px bg-border-subtle sm:grid-cols-3">
          {levels.map((level) => {
            const distance = level.distancePercent;
            // Within 3% either way: close enough that the level is acting on
            // price rather than sitting in the background.
            const near = distance !== null && Math.abs(distance) <= 3;

            return (
              <div
                key={level.id}
                className={`p-3 ${near ? 'bg-accent/10' : 'bg-void'}`}
              >
                <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-text-tertiary">
                  {level.label}
                </p>
                <p className="mt-1 font-mono text-[14px] font-semibold text-text-primary tabular-nums">
                  {money(level.value)}
                </p>
                <p
                  className={`font-mono text-[11px] tabular-nums ${
                    near
                      ? 'text-accent-bright'
                      : distance !== null && distance < 0
                        ? 'text-rose'
                        : 'text-text-muted'
                  }`}
                >
                  {distance === null
                    ? '—'
                    : `${distance >= 0 ? '+' : ''}${distance.toFixed(1)}%`}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="glass-bright rounded-xl overflow-hidden">
        <div className="border-b border-border-subtle px-5 py-3">
          <h2 className="text-[14px] font-semibold text-text-primary">Support &amp; resistance</h2>
          <p className="mt-0.5 text-[11px] text-text-tertiary">
            Prices the market has turned at more than once
          </p>
        </div>

        <div className="divide-y divide-border-subtle">
          <Side
            title="Resistance"
            levels={resistance}
            // At all-time highs there genuinely is nothing above, and saying so
            // beats an empty box the reader has to interpret.
            empty="Nothing overhead within 25% — price is at or near its highs."
            tone="text-rose"
          />
          <Side
            title="Support"
            levels={support}
            empty="No tested level within 25% below."
            tone="text-emerald"
          />
        </div>
      </section>
    </div>
  );
}

function Side({
  title,
  levels,
  empty,
  tone,
}: {
  title: string;
  levels: SwingLevel[];
  empty: string;
  tone: string;
}) {
  return (
    <div className="px-5 py-3">
      <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-text-tertiary">
        {title}
      </p>

      {levels.length === 0 ? (
        <p className="text-[11px] leading-relaxed text-text-muted">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {levels.map((level) => (
            <li key={`${level.kind}-${level.price}`} className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className={`block font-mono text-[14px] font-semibold tabular-nums ${tone}`}>
                  {money(level.price)}
                </span>
                {/*
                  Touches and the date are the argument. A level tested five
                  times is a different claim from one tested twice.
                */}
                <span className="block text-[10px] text-text-muted">
                  {level.touches} {level.touches === 1 ? 'touch' : 'touches'} · last{' '}
                  {shortDate(level.lastTouch)}
                </span>
              </span>
              <span className="font-mono text-[12px] tabular-nums text-text-secondary">
                {level.distancePercent >= 0 ? '+' : ''}
                {level.distancePercent.toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function money(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function shortDate(iso: string): string {
  const [, month, day] = iso.slice(0, 10).split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[Number(month) - 1]} ${Number(day)}`;
}
