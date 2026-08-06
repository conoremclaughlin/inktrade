'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { OptionChain, OptionContract } from '@inktrade/client';
import { useChainQuotes } from '@/lib/use-chain-quotes';

interface Props {
  chain: OptionChain;
  /** Dims the table while a new expiration loads, without blanking it. */
  isFetching?: boolean;
}

interface StrikeRow {
  strike: number;
  call?: OptionContract;
  put?: OptionContract;
}

/**
 * The option chain, laid out the way it is read: strikes down the centre with
 * calls to the left and puts to the right.
 *
 * The centre column is the anchor — traders scan down the strikes and across
 * to whichever side they're trading. A flat list of contracts sorted by strike
 * would contain the same data and be unusable, because it destroys the
 * left/right symmetry that makes a chain scannable.
 */
export function OptionChainTable({ chain, isFetching }: Props) {
  const { priced, revealContract, isLoadingContract } = useChainQuotes(chain.contracts);

  // The full ladder, with scroll-loaded prices merged over the ones the chain
  // arrived with. Rendering every strike is the point — the ladder is the map,
  // and hiding the parts we haven't priced yet would hide where you can go.
  const rows = useMemo(
    () => toStrikeRows(chain.contracts.map((c) => priced.get(c.id) ?? c)),
    [chain.contracts, priced],
  );

  // Where the money is. Rendered as a band between rows rather than a
  // highlighted row, because spot sits *between* strikes far more often than
  // it sits on one.
  const spotIndex = useMemo(
    () => (chain.underlyingPrice === null ? -1 : firstStrikeAbove(rows, chain.underlyingPrice)),
    [rows, chain.underlyingPrice],
  );

  // Open at the money. Spot is where a chain is read from, and with hundreds
  // of strikes listed the default scroll position would otherwise be a screen
  // of deep out-of-the-money contracts hundreds of dollars away.
  const scrollBox = useRef<HTMLDivElement>(null);
  const anchored = useRef(false);
  useEffect(() => {
    if (anchored.current || spotIndex < 0 || !scrollBox.current) return;
    const target = scrollBox.current.querySelector<HTMLElement>('[data-at-the-money="true"]');
    if (!target) return;
    scrollBox.current.scrollTop = Math.max(
      0,
      target.offsetTop - scrollBox.current.clientHeight / 2,
    );
    anchored.current = true;
  }, [spotIndex, rows.length]);

  if (rows.length === 0) {
    return (
      <div className="px-5 py-12 text-center">
        <p className="text-[13px] text-text-tertiary">
          No contracts for this expiration.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={scrollBox}
      className={`max-h-[70vh] overflow-auto transition-opacity ${isFetching ? 'opacity-50' : ''}`}
    >
      <table className="w-full min-w-[900px] border-collapse text-[12px] font-mono">
        <thead className="sticky top-0 z-10 bg-void">
          <tr className="border-b border-border-subtle">
            <th colSpan={5} className="py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald">
              Calls
            </th>
            <th className="py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-tertiary">
              Strike
            </th>
            <th colSpan={5} className="py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-rose">
              Puts
            </th>
          </tr>
          <tr className="border-b border-border-subtle text-[10px] uppercase tracking-wider text-text-muted">
            <Th>OI</Th>
            <Th>Vol</Th>
            <Th>IV</Th>
            <Th>Δ</Th>
            <Th>Mark</Th>
            <Th center>—</Th>
            <Th>Mark</Th>
            <Th>Δ</Th>
            <Th>IV</Th>
            <Th>Vol</Th>
            <Th>OI</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <StrikeRowView
              key={row.strike}
              row={row}
              atTheMoney={i === spotIndex}
              onVisible={revealContract}
              isLoading={isLoadingContract}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * One strike, which asks for its own prices when it scrolls into view.
 *
 * The observer is per-row rather than per-chunk so the request fires on what
 * the reader is actually looking at, with a generous rootMargin so prices are
 * usually already there by the time the row is on screen.
 */
function StrikeRowView({
  row,
  atTheMoney,
  onVisible,
  isLoading,
}: {
  row: StrikeRow;
  atTheMoney: boolean;
  onVisible: (id: string) => void;
  isLoading: (id: string) => boolean;
}) {
  const ref = useRef<HTMLTableRowElement>(null);
  const ids = [row.call?.id, row.put?.id].filter((id): id is string => Boolean(id));
  const needsQuote = row.call?.mark === null || row.put?.mark === null;

  useEffect(() => {
    if (!needsQuote || !ref.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) ids.forEach(onVisible);
      },
      { rootMargin: '400px' },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsQuote, ids.join(','), onVisible]);

  const loading = ids.some(isLoading);

  return (
    <tr
      ref={ref}
      data-at-the-money={atTheMoney || undefined}
      className={`border-b border-border-subtle/40 hover:bg-surface/40 ${
        atTheMoney ? 'border-t-2 border-t-accent/60' : ''
      } ${loading ? 'animate-pulse' : ''}`}
    >
      <ContractCells contract={row.call} side="call" />
      <td className="px-3 py-1.5 text-center font-semibold text-text-primary tabular-nums">
        {formatStrike(row.strike)}
      </td>
      <ContractCells contract={row.put} side="put" />
    </tr>
  );
}

function ContractCells({ contract, side }: { contract?: OptionContract; side: 'call' | 'put' }) {
  // A contract with no quote is real but unpriced — far out of the money,
  // nothing resting. Em-dashes say that; zeros would read as free.
  const cells = [
    format(contract?.openInterest, 0),
    format(contract?.volume, 0),
    contract?.impliedVolatility === undefined
      ? '—'
      : `${(contract.impliedVolatility * 100).toFixed(0)}%`,
    format(contract?.delta, 2),
    contract?.mark === null || contract?.mark === undefined
      ? '—'
      : contract.mark.toFixed(2),
  ];

  const ordered = side === 'call' ? cells : [...cells].reverse();

  return (
    <>
      {ordered.map((value, i) => (
        <td
          key={i}
          className={`px-3 py-1.5 tabular-nums ${
            // The mark is what the eye goes to; the rest is supporting detail.
            (side === 'call' && i === 4) || (side === 'put' && i === 0)
              ? 'font-semibold text-text-primary'
              : 'text-text-tertiary'
          } ${side === 'call' ? 'text-right' : 'text-left'}`}
        >
          {value}
        </td>
      ))}
    </>
  );
}

function Th({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return <th className={`px-3 py-1.5 font-medium ${center ? 'text-center' : ''}`}>{children}</th>;
}

function format(value: number | undefined, digits: number): string {
  return value === undefined ? '—' : value.toFixed(digits);
}

/** Whole numbers stay whole — "360" reads faster than "360.00" down a ladder. */
function formatStrike(strike: number): string {
  return Number.isInteger(strike) ? String(strike) : strike.toFixed(2);
}

/** Pair calls and puts by strike into one row each. */
export function toStrikeRows(contracts: OptionContract[]): StrikeRow[] {
  const byStrike = new Map<number, StrikeRow>();

  for (const contract of contracts) {
    const row = byStrike.get(contract.strike) ?? { strike: contract.strike };
    if (contract.putCall === 'CALL') row.call = contract;
    else row.put = contract;
    byStrike.set(contract.strike, row);
  }

  return [...byStrike.values()].sort((a, b) => a.strike - b.strike);
}

/** Index of the first strike above spot — where the money band is drawn. */
export function firstStrikeAbove(rows: StrikeRow[], price: number): number {
  return rows.findIndex((row) => row.strike > price);
}


