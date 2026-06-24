'use client';

import { useMemo, useState } from 'react';
import { analyzeTargetTimeline, type TimelineResult, type RollMode } from '@inktrade/engine/rolling';

interface StrategyTimelineProps {
  spotPrice: number;
  targetPrice: number;
  strike: number;
  iv: number;
  optionType: 'call' | 'put';
}

const ROLL_OPTIONS = [
  { label: '14d', value: 14 },
  { label: '30d', value: 30 },
  { label: '60d', value: 60 },
  { label: '90d', value: 90 },
];

function dteLabel(dte: number): string {
  if (dte >= 365) return `${(dte / 365).toFixed(1)}yr`;
  if (dte >= 30) return `${Math.round(dte / 30)}mo`;
  return `${dte}d`;
}

function timelineLabel(days: number): string {
  if (days >= 365) return `${(days / 365).toFixed(1)}yr`;
  if (days >= 30) return `${Math.round(days / 30)}mo`;
  return `${days}d`;
}

function cellColor(result: TimelineResult): string {
  if (!result.reachable) return 'rgba(30, 38, 64, 0.15)';
  const lev = result.netLeverage;
  if (lev <= 0) return 'rgba(244, 63, 94, 0.2)';
  if (lev < 1) return 'rgba(244, 63, 94, 0.1)';
  if (lev < 2) return 'rgba(59, 130, 246, 0.15)';
  if (lev < 3) return 'rgba(59, 130, 246, 0.25)';
  if (lev < 5) return 'rgba(59, 130, 246, 0.35)';
  if (lev < 8) return 'rgba(96, 165, 250, 0.45)';
  if (lev < 12) return 'rgba(16, 185, 129, 0.4)';
  return 'rgba(52, 211, 153, 0.55)';
}

function cellTextColor(result: TimelineResult): string {
  if (!result.reachable) return 'text-text-muted';
  const lev = result.netLeverage;
  if (lev <= 0) return 'text-rose';
  if (lev < 1) return 'text-rose/70';
  if (lev < 3) return 'text-text-secondary';
  if (lev < 5) return 'text-accent-bright';
  return 'text-emerald-bright';
}

export function StrategyTimeline({
  spotPrice,
  targetPrice,
  strike,
  iv,
  optionType,
}: StrategyTimelineProps) {
  const [rollAtDte, setRollAtDte] = useState(30);
  const [rollMode, setRollMode] = useState<RollMode>('dte');
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

  const analysis = useMemo(() =>
    analyzeTargetTimeline({
      spotPrice,
      targetPrice,
      strike,
      iv,
      optionType,
      rollAtDte,
      rollMode,
    }),
  [spotPrice, targetPrice, strike, iv, optionType, rollAtDte, rollMode]);

  const movePct = ((targetPrice - spotPrice) / spotPrice * 100).toFixed(1);
  const moveDir = targetPrice >= spotPrice ? 'above' : 'below';

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="flex gap-1 glass rounded-lg p-0.5">
            {(['dte', 'interval'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setRollMode(m)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-mono font-medium transition-all ${
                  rollMode === m
                    ? 'bg-accent/15 text-accent-bright border border-accent/30'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {m === 'dte' ? 'At DTE' : 'Every Nd'}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {ROLL_OPTIONS.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setRollAtDte(value)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-medium transition-all ${
                  rollAtDte === value
                    ? 'bg-accent/15 text-accent-bright border border-accent/30'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="text-[11px] font-mono text-text-tertiary">
          Target: <span className="text-violet font-medium">${targetPrice.toFixed(0)}</span>
          <span className="text-text-muted ml-1">({movePct}% {moveDir})</span>
          {' · '}Strike: <span className="text-text-secondary">${strike.toFixed(0)}</span>
          {' · '}Stock return: <span className="text-emerald font-medium">+{analysis.stockReturnPct.toFixed(1)}%</span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="text-left text-[10px] font-mono font-semibold text-text-muted uppercase tracking-wider px-2 py-2 w-[100px]">
                Entry
              </th>
              <th className="text-right text-[10px] font-mono font-semibold text-text-muted uppercase tracking-wider px-2 py-2 w-[70px]">
                Cost
              </th>
              {analysis.timelineDays.map((d) => (
                <th
                  key={d}
                  className="text-center text-[10px] font-mono font-semibold text-text-muted uppercase tracking-wider px-1 py-2"
                >
                  {timelineLabel(d)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {analysis.strategies.map((strat) => (
              <tr key={strat.entryDte}>
                <td className="px-2 py-1">
                  <div className="text-[12px] font-mono text-text-secondary font-medium">
                    {dteLabel(strat.entryDte)}
                  </div>
                  <div className="text-[9px] font-mono text-text-muted">
                    Δ{strat.deltaAtEntry.toFixed(2)}
                  </div>
                </td>
                <td className="text-right px-2 py-1">
                  <div className="text-[12px] font-mono text-text-secondary">
                    ${strat.entryPrice.toFixed(0)}
                  </div>
                </td>
                {strat.timeline.map((result, i) => {
                  const key = `${strat.entryDte}:${result.daysFromNow}`;
                  const isHovered = hoveredCell === key;

                  return (
                    <td
                      key={i}
                      className="relative px-1 py-1"
                      onMouseEnter={() => setHoveredCell(key)}
                      onMouseLeave={() => setHoveredCell(null)}
                    >
                      <div
                        className={`flex flex-col items-center justify-center rounded-sm py-2 px-1 transition-all duration-150 ${
                          isHovered ? 'scale-[1.06] z-20 shadow-lg' : ''
                        }`}
                        style={{ backgroundColor: cellColor(result) }}
                      >
                        {result.reachable ? (
                          <>
                            <span className={`text-[12px] font-mono font-medium ${cellTextColor(result)}`}>
                              {result.returnPct >= 0 ? '+' : ''}{result.returnPct.toFixed(0)}%
                            </span>
                            <span className={`text-[9px] font-mono ${
                              result.netLeverage >= 1 ? 'text-text-secondary' : 'text-text-muted'
                            }`}>
                              {result.netLeverage.toFixed(1)}x
                            </span>
                            {result.rollsNeeded > 0 && (
                              <span className="text-[8px] font-mono text-amber/70 mt-0.5">
                                {result.rollsNeeded}r
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-[10px] text-text-muted">—</span>
                        )}
                      </div>

                      {/* Tooltip */}
                      {isHovered && result.reachable && (
                        <div className="absolute -top-[110px] left-1/2 -translate-x-1/2 rounded-lg px-3 py-2 shadow-xl z-30 whitespace-nowrap pointer-events-none border border-border-subtle bg-[#0f1629]/95 backdrop-blur-md">
                          <div className="text-[10px] font-mono text-text-secondary mb-1">
                            Buy {dteLabel(strat.entryDte)} · Target hit at {timelineLabel(result.daysFromNow)}
                          </div>
                          <div className="space-y-0.5 text-[10px] font-mono">
                            <div className="flex justify-between gap-4">
                              <span className="text-text-muted">Entry:</span>
                              <span className="text-text-secondary">${strat.entryPrice.toFixed(2)}</span>
                            </div>
                            {result.rollsNeeded > 0 && (
                              <>
                                <div className="flex justify-between gap-4">
                                  <span className="text-text-muted">Rolls:</span>
                                  <span className="text-amber">{result.rollsNeeded} × ${strat.costPerRoll.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                  <span className="text-text-muted">Roll cost:</span>
                                  <span className="text-rose">-${result.totalRollCost.toFixed(2)}</span>
                                </div>
                              </>
                            )}
                            <div className="flex justify-between gap-4">
                              <span className="text-text-muted">Capital:</span>
                              <span className="text-text-secondary">${result.capitalDeployed.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-text-muted">Value at target:</span>
                              <span className="text-emerald">${result.optionValueAtTarget.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between gap-4 border-t border-border-subtle pt-0.5 mt-0.5">
                              <span className="text-text-muted">DTE remaining:</span>
                              <span className="text-text-secondary">{result.remainingDte}d</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-text-muted">Net P&L:</span>
                              <span className={result.netPnl >= 0 ? 'text-emerald' : 'text-rose'}>
                                {result.netPnl >= 0 ? '+' : ''}${result.netPnl.toFixed(2)}
                              </span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-text-muted">Return:</span>
                              <span className={`font-medium ${result.returnPct >= 0 ? 'text-emerald' : 'text-rose'}`}>
                                {result.returnPct >= 0 ? '+' : ''}{result.returnPct.toFixed(1)}%
                              </span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-text-muted">vs Stock:</span>
                              <span className={`font-bold ${result.netLeverage >= 1 ? 'text-accent-bright' : 'text-text-muted'}`}>
                                {result.netLeverage.toFixed(2)}x
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap">
        <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider">Net leverage:</span>
        {[
          { label: '<1x', color: 'rgba(244, 63, 94, 0.1)' },
          { label: '1-3x', color: 'rgba(59, 130, 246, 0.15)' },
          { label: '3-5x', color: 'rgba(59, 130, 246, 0.35)' },
          { label: '5-8x', color: 'rgba(96, 165, 250, 0.45)' },
          { label: '8-12x', color: 'rgba(16, 185, 129, 0.4)' },
          { label: '12x+', color: 'rgba(52, 211, 153, 0.55)' },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div className="w-3.5 h-3.5 rounded-sm" style={{ backgroundColor: item.color }} />
            <span className="text-[10px] font-mono text-text-muted">{item.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-2">
          <span className="text-[8px] font-mono text-amber/70">Nr</span>
          <span className="text-[10px] font-mono text-text-muted">= rolls needed</span>
        </div>
      </div>

      {/* Explanation */}
      <p className="text-[11px] text-text-tertiary leading-relaxed">
        Each cell shows your <span className="text-text-secondary">net return</span> and{' '}
        <span className="text-text-secondary">leverage vs stock</span> if ${targetPrice.toFixed(0)} is hit at that
        time horizon. Returns account for rolling costs ({rollMode === 'dte'
          ? `selling at ${rollAtDte}d to expiry, rebuying at the same DTE`
          : `selling every ${rollAtDte}d and rebuying at the same DTE`
        }). {rollMode === 'dte'
          ? 'Shorter-dated entries roll more often (less time between roll triggers). Longer-dated entries hold longer before each roll.'
          : 'All entries roll on the same cadence. Longer-dated entries retain more time value at each sell, so per-roll cost is lower.'
        }
      </p>
    </div>
  );
}
