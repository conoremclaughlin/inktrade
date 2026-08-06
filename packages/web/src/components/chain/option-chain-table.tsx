'use client';

import { useMemo } from 'react';
import type { OptionChain, OptionContract } from '@inktrade/client';

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
  const rows = useMemo(() => pricedRows(toStrikeRows(chain.contracts)), [chain.contracts]);

  // Where the money is. Rendered as a band between rows rather than a
  // highlighted row, because spot sits *between* strikes far more often than
  // it sits on one.
  const spotIndex = useMemo(
    () => (chain.underlyingPrice === null ? -1 : firstStrikeAbove(rows, chain.underlyingPrice)),
    [rows, chain.underlyingPrice],
  );

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
    <div className={`overflow-x-auto transition-opacity ${isFetching ? 'opacity-50' : ''}`}>
      <table className="w-full min-w-[900px] border-collapse text-[12px] font-mono">
        <thead>
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
            <tr
              key={row.strike}
              className={`border-b border-border-subtle/40 hover:bg-surface/40 ${
                i === spotIndex ? 'border-t-2 border-t-accent/60' : ''
              }`}
            >
              <ContractCells contract={row.call} side="call" />
              <td className="px-3 py-1.5 text-center font-semibold text-text-primary tabular-nums">
                {formatStrike(row.strike)}
              </td>
              <ContractCells contract={row.put} side="put" />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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

/**
 * Narrow to the strikes that actually carry a quote.
 *
 * A liquid underlying lists hundreds of strikes and the API prices only a
 * window around spot, so rendering the full ladder opens the table on a
 * screenful of em-dashes hundreds of dollars from the money — the chain looks
 * broken rather than deep. Showing the priced band puts the money on screen,
 * which is where a chain is read from.
 *
 * If nothing is priced at all — a dead expiration, or quotes unavailable — the
 * full ladder is returned rather than an empty table, so the strikes are still
 * legible even when the prices aren't.
 */
export function pricedRows(rows: StrikeRow[]): StrikeRow[] {
  const priced = rows.filter(
    (row) => row.call?.mark !== null && row.call?.mark !== undefined
      || (row.put?.mark !== null && row.put?.mark !== undefined),
  );
  return priced.length > 0 ? priced : rows;
}
