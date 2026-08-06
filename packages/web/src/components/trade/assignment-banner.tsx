'use client';

import { useState } from 'react';
import { assignmentExposure, optionLabel, type BrokerId, type Position } from '@inktrade/client';

/**
 * One banner for every position that would sell shares FIFO.
 *
 * Deliberately aggregated. A real book has 77 option positions, 37 of them
 * exposed — a card each would be thirty-seven identical red boxes, which stops
 * being a warning and becomes wallpaper. The count goes in the headline and
 * the detail waits until it's asked for.
 *
 * Sorted by expiration: that's when the risk stops being theoretical.
 */
export function AssignmentBanner({
  positions,
  broker,
}: {
  positions: Position[];
  broker: BrokerId;
}) {
  const [open, setOpen] = useState(false);
  const exposure = assignmentExposure(positions, broker);
  const count = exposure.positions.length;

  if (count === 0) return null;

  const soonest = exposure.positions.slice(0, 5);

  return (
    <section className="rounded-xl border border-rose/40 bg-rose/8" role="alert">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span aria-hidden className="text-[13px] leading-none text-rose">
          ▲
        </span>
        <span className="flex-1 text-[13px] font-semibold text-rose">
          {count} {count === 1 ? 'position' : 'positions'} would sell your oldest shares
        </span>
        <span aria-hidden className="text-[11px] text-rose">
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <div className="space-y-3 px-4 pb-4">
          <p className="text-[12px] leading-relaxed text-text-secondary">
            If these are exercised or assigned, Robinhood allocates the shares
            first-in-first-out — the oldest and usually cheapest, realizing the largest possible
            gain. There is no setting for it and no way to specify lots.
          </p>

          <p className="rounded-lg border border-rose/25 px-3 py-2 text-[12px] leading-relaxed text-rose">
            Closing the contract and selling the shares as a normal order lets you choose the
            lots. If one is exercised or assigned, contact Robinhood support the same day —
            after that the allocation is final.
          </p>

          <div>
            <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
              Soonest to expire
            </p>
            <ul className="space-y-1">
              {soonest.map((p) => (
                <li
                  key={`${p.symbol}-${p.option?.expiration}`}
                  className="flex items-center justify-between font-mono text-[12px] tabular-nums"
                >
                  <span className="text-text-secondary">
                    {p.option ? optionLabel(p.option) : p.symbol}
                  </span>
                  <span className="text-text-tertiary">
                    {p.quantity > 0 ? '+' : ''}
                    {p.quantity}
                  </span>
                </li>
              ))}
            </ul>
            {count > soonest.length && (
              <p className="mt-1.5 text-[11px] text-text-muted">
                and {count - soonest.length} more
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
