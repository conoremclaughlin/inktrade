'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  countdownLabel,
  daysUntil,
  earningsBeforeExpiration,
  timingLabel,
  type EarningsDate,
} from '@inktrade/client';
import { AppShell } from '@/components/app-shell';
import { OptionChainTable } from '@/components/chain/option-chain-table';
import { useEarnings, useOptionChain } from '@/lib/broker-hooks';

/**
 * useSearchParams opts its subtree out of prerendering, so the page body sits
 * behind a Suspense boundary — see the default export below.
 */
function ChainContent() {
  const searchParams = useSearchParams();
  const [symbol, setSymbol] = useState(
    () => searchParams.get('symbol')?.toUpperCase() || 'MU',
  );
  const [input, setInput] = useState(symbol);
  const [expiration, setExpiration] = useState<string | undefined>(
    () => searchParams.get('expiration') ?? undefined,
  );

  const { data, isLoading, isFetching, error } = useOptionChain(symbol, expiration);
  const { data: earningsData } = useEarnings([symbol]);
  const earnings = earningsData?.earnings.find((e) => e.symbol === symbol) ?? null;

  const selectSymbol = (next: string) => {
    const upper = next.trim().toUpperCase();
    if (!upper) return;
    setSymbol(upper);
    setInput(upper);
    // The old expiration almost certainly isn't listed on the new underlying;
    // clearing it falls back to the nearest, which is what a chain opens on.
    setExpiration(undefined);
  };

  return (
    <AppShell activeSymbol={symbol} onSymbolClick={selectSymbol}>
      <div className="pb-16 px-4 sm:px-6 pt-8">
        <div className="mx-auto max-w-[1200px]">
          <div className="mb-8">
            <h1 className="font-display text-3xl md:text-4xl tracking-[-0.02em] text-text-primary">
              Option Chain
            </h1>
            <p className="mt-2 text-[14px] text-text-secondary">
              Live marks and greeks, straight from your linked brokerage
            </p>
          </div>

          <div className="glass-bright rounded-xl p-5 mb-6">
            <div className="flex items-end gap-4 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-tertiary mb-2">
                  Underlying
                </label>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    selectSymbol(input);
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value.toUpperCase())}
                    placeholder="MU"
                    className="flex-1 glass rounded-lg px-4 py-2.5 text-[15px] font-mono text-text-primary placeholder:text-text-muted bg-transparent outline-none focus:border-accent/40 transition-colors"
                  />
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-lg bg-accent/15 text-accent-bright text-[13px] font-semibold border border-accent/30 hover:bg-accent/25 transition-colors"
                  >
                    Load
                  </button>
                </form>
              </div>

              {data?.underlyingPrice !== null && data?.underlyingPrice !== undefined && (
                <div className="text-right">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-tertiary mb-1">
                    {data.symbol}
                  </div>
                  <div className="text-[22px] font-mono font-bold text-text-primary tabular-nums">
                    ${data.underlyingPrice.toFixed(2)}
                  </div>
                </div>
              )}
            </div>

            {data && data.expirations.length > 0 && (
              <ExpirationLadder
                expirations={data.expirations}
                selected={data.expiration}
                onSelect={setExpiration}
                earnings={earnings}
                asOf={earningsData?.asOf ?? ''}
              />
            )}
          </div>

          {error && (
            <div className="glass-bright rounded-xl p-5 mb-6 border border-rose/20">
              <p className="text-[13px] font-mono text-rose">{(error as Error).message}</p>
              <p className="text-[12px] text-text-tertiary mt-2">
                Chains come from your linked brokerage — check the connection in Settings.
              </p>
            </div>
          )}

          <div className="glass-bright rounded-xl overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center h-[300px]">
                <div className="text-center">
                  <div className="inline-block w-6 h-6 border-2 border-accent/30 border-t-accent-bright rounded-full animate-spin mb-3" />
                  <div className="text-[13px] text-text-tertiary font-mono">Loading chain...</div>
                </div>
              </div>
            ) : data ? (
              <OptionChainTable chain={data} isFetching={isFetching} />
            ) : null}
          </div>

          {data && (
            <p className="mt-3 text-[11px] text-text-muted">
              {data.contracts.length} contracts across {data.expirations.length} expirations.
              Opens at the money; prices load as you scroll.
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}

/**
 * The expiration ladder.
 *
 * Horizontal and scrollable rather than a select, because the gap between
 * expiries is information — weeklies bunched at the front, then monthlies,
 * then LEAPS — and a dropdown flattens that into an undifferentiated list.
 *
 * Expirations that hold through an earnings report are marked. That line
 * through the ladder is the single most useful thing on the screen for anyone
 * selling premium: the contracts on its far side are priced for a gap, and the
 * ones on the near side aren't.
 */
function ExpirationLadder({
  expirations,
  selected,
  onSelect,
  earnings,
  asOf,
}: {
  expirations: string[];
  selected: string;
  onSelect: (expiration: string) => void;
  earnings: EarningsDate | null;
  asOf: string;
}) {
  const selectedSpans = earningsBeforeExpiration(earnings, selected, asOf);

  return (
    <div className="mt-4">
      <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-tertiary mb-2">
        Expiration
      </label>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {expirations.map((date) => {
          const spans = earningsBeforeExpiration(earnings, date, asOf) === true;
          return (
            <button
              key={date}
              onClick={() => onSelect(date)}
              title={spans ? `Holds through earnings on ${earnings!.date}` : undefined}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-mono font-medium whitespace-nowrap transition-all border ${
                date === selected
                  ? 'bg-accent/15 text-accent-bright border-accent/30'
                  : 'border-border-subtle text-text-muted hover:text-text-secondary'
              }`}
            >
              {formatExpiration(date)}
              <span className="ml-1.5 text-text-tertiary">{daysToExpiry(date)}d</span>
              {spans && (
                <span aria-hidden className="ml-1 text-amber">
                  ◆
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedSpans && earnings && (
        <p className="mt-2 text-[11px] text-amber">
          ◆ {earnings.symbol} reports {countdownLabel(daysUntil(earnings.date, asOf))}
          {timingLabel(earnings.timing) && ` ${timingLabel(earnings.timing)}`}
          {earnings.isEstimate && ' (estimated)'} — these contracts have to live through it.
        </p>
      )}
    </div>
  );
}

function formatExpiration(date: string): string {
  const [, month, day] = date.split('-');
  return `${Number(month)}/${Number(day)}`;
}

/** Days to expiry — the number that actually drives an options decision. */
function daysToExpiry(date: string): number {
  const ms = Date.parse(`${date}T00:00:00Z`) - Date.now();
  return Math.max(0, Math.round(ms / 86_400_000));
}

export default function ChainPage() {
  return (
    <Suspense fallback={null}>
      <ChainContent />
    </Suspense>
  );
}
