'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { oversoldQuery, RSI_OVERSOLD, type OversoldCandidate } from '@inktrade/client';
import { brokerApi } from '@/lib/broker-api';

/**
 * Scan a set of symbols for "oversold, near the lows".
 *
 * Explicitly triggered. A scan is one history fetch per symbol upstream, so
 * running it because a page mounted would spend forty requests answering a
 * question nobody asked.
 *
 * Both signals stay as separate badges rather than one score: "RSI 36.9 and 7%
 * off the low" is a reason to look, "score 82" is not.
 */
export function OversoldScan({ symbols }: { symbols: string[] }) {
  const [requested, setRequested] = useState(false);
  const scan = useQuery(oversoldQuery(brokerApi, symbols, requested));

  if (symbols.length === 0) return null;

  return (
    <section className="glass-bright mb-6 rounded-xl overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-5 py-3">
        <div>
          <h2 className="text-[14px] font-semibold text-text-primary">Oversold scan</h2>
          <p className="mt-0.5 text-[11px] text-text-tertiary">
            {scan.data
              ? `${scan.data.candidates.length} of ${scan.data.scanned} · RSI ≤ ${scan.data.threshold} or within ${scan.data.nearPercent}% of the 52-week low`
              : `RSI and distance from the lows across ${symbols.length} symbols`}
          </p>
        </div>

        <button
          onClick={() => (requested ? scan.refetch() : setRequested(true))}
          disabled={scan.isFetching}
          className="rounded-lg border border-border-subtle px-3.5 py-2 text-[12px] font-semibold text-text-secondary transition-colors hover:bg-surface/60 disabled:opacity-50"
        >
          {scan.isFetching ? 'Scanning…' : requested ? 'Rescan' : 'Run scan'}
        </button>
      </div>

      {scan.isFetching && (
        <p className="px-5 py-4 text-[12px] text-text-tertiary">
          Reading a year of bars for {symbols.length} symbols…
        </p>
      )}

      {scan.error && !scan.isFetching && (
        <p className="px-5 py-4 text-[12px] text-rose">
          Couldn&apos;t run the scan. Try again in a moment.
        </p>
      )}

      {scan.data && !scan.isFetching && scan.data.candidates.length === 0 && (
        // A real answer, and worth distinguishing from a scan that failed.
        <p className="px-5 py-4 text-[12px] text-text-muted">
          Nothing on this list is oversold or near its low right now.
        </p>
      )}

      {scan.data && !scan.isFetching && (
        <>
          <div className="divide-y divide-border-subtle">
            {scan.data.candidates.map((candidate) => (
              <CandidateRow key={candidate.symbol} candidate={candidate} />
            ))}
          </div>

          {scan.data.skipped.length > 0 && (
            <p className="px-5 pb-3 pt-2 text-[10px] text-text-muted">
              No history for {scan.data.skipped.join(', ')} — skipped rather than counted as
              clear.
            </p>
          )}
          {scan.data.dropped > 0 && (
            <p className="px-5 pb-3 text-[10px] text-text-muted">
              {scan.data.dropped} more weren&apos;t scanned — over the per-scan cap.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function CandidateRow({ candidate }: { candidate: OversoldCandidate }) {
  const deeply = candidate.rsi !== null && candidate.rsi <= RSI_OVERSOLD;

  return (
    <div className="flex items-center justify-between gap-4 px-5 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="font-mono text-[13px] font-bold text-text-primary">
          {candidate.symbol}
        </span>
        <span className="flex gap-1.5">
          {candidate.oversold && (
            <span className="rounded bg-violet/20 px-1.5 py-0.5 font-mono text-[8px] tracking-[0.08em] text-violet">
              OVERSOLD
            </span>
          )}
          {candidate.nearLow && (
            <span className="rounded bg-accent/20 px-1.5 py-0.5 font-mono text-[8px] tracking-[0.08em] text-accent-bright">
              NEAR LOW
            </span>
          )}
        </span>
      </div>

      <div className="whitespace-nowrap text-right">
        <p className="font-mono text-[13px] tabular-nums text-text-secondary">
          {candidate.price.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
        </p>
        <p className="font-mono text-[10px] tabular-nums text-text-tertiary">
          RSI{' '}
          <span className={deeply ? 'text-violet' : undefined}>
            {candidate.rsi === null ? '—' : candidate.rsi.toFixed(1)}
          </span>
          {candidate.fromLow52 !== null && ` · ${candidate.fromLow52.toFixed(1)}% off low`}
        </p>
      </div>
    </div>
  );
}
