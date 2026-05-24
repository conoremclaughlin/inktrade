'use client';

import { useMemo } from 'react';
import { computeRedDayTable } from '@inktrade/engine/letf';

interface RedDayTableProps {
  leverageFactor: number;
}

function cellColor(remainingPct: number): string {
  if (remainingPct >= 90) return 'rgba(16, 185, 129, 0.08)';
  if (remainingPct >= 70) return 'rgba(16, 185, 129, 0.15)';
  if (remainingPct >= 50) return 'rgba(59, 130, 246, 0.15)';
  if (remainingPct >= 30) return 'rgba(245, 158, 11, 0.2)';
  if (remainingPct >= 10) return 'rgba(244, 63, 94, 0.25)';
  return 'rgba(244, 63, 94, 0.4)';
}

function cellTextColor(remainingPct: number): string {
  if (remainingPct >= 70) return 'text-emerald';
  if (remainingPct >= 50) return 'text-accent-bright';
  if (remainingPct >= 30) return 'text-[#f59e0b]';
  return 'text-rose';
}

export function RedDayTable({ leverageFactor }: RedDayTableProps) {
  const dropPcts = [1, 2, 3, 5, 7, 10];
  const maxDays = 10;

  const table = useMemo(
    () => computeRedDayTable(leverageFactor, dropPcts, maxDays),
    [leverageFactor],
  );

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full">
          <thead>
            <tr>
              <th className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted px-2 py-2 text-left sticky left-0 bg-deep/80 backdrop-blur-sm z-10">
                Daily Drop
              </th>
              {Array.from({ length: maxDays }, (_, i) => (
                <th key={i} className="text-[10px] font-mono font-medium text-text-muted px-2 py-2 text-center min-w-[52px]">
                  {i + 1}d
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.map((row, rowIdx) => (
              <tr key={rowIdx}>
                <td className="text-[11px] font-mono font-semibold text-rose px-2 py-1.5 sticky left-0 bg-deep/80 backdrop-blur-sm z-10">
                  -{dropPcts[rowIdx]}%
                </td>
                {row.map((cell, colIdx) => (
                  <td
                    key={colIdx}
                    className="px-1 py-1"
                  >
                    <div
                      className={`text-[11px] font-mono font-medium text-center py-1.5 rounded-sm ${cellTextColor(cell.remainingPct)}`}
                      style={{ backgroundColor: cellColor(cell.remainingPct) }}
                    >
                      {cell.remainingPct.toFixed(0)}%
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-border-subtle bg-surface/30 px-4 py-3">
        <p className="text-[12px] text-text-secondary leading-relaxed">
          Each cell shows the percentage of your investment remaining after N consecutive days
          of the underlying dropping by X%. At {Math.abs(leverageFactor)}x leverage, a -5% daily
          underlying drop means a -{Math.abs(leverageFactor) * 5}% daily LETF drop. After 3
          consecutive -5% days, a {Math.abs(leverageFactor)}x LETF retains only{' '}
          <span className="font-mono font-medium text-text-primary">
            {(Math.pow(1 - Math.abs(leverageFactor) * 0.05, 3) * 100).toFixed(0)}%
          </span>{' '}
          of its value.
        </p>
      </div>
    </div>
  );
}
