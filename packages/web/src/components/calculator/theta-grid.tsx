'use client';

import { useMemo, useState } from 'react';
import { computeThetaGrid, type PositionLeg, type ThetaGridCell } from '@inktrade/engine/portfolio';
import { blackScholesPrice } from '@inktrade/engine/math';

interface ThetaGridProps {
  spotPrice: number;
  strike: number;
  optionType: 'call' | 'put';
  iv: number;
  dte: number;
  mark: number;
}

type PositionMode = 'long' | 'credit-spread';

function cellColor(pctOfPosition: number): string {
  if (pctOfPosition > 20) return 'rgba(16, 185, 129, 0.4)';
  if (pctOfPosition > 10) return 'rgba(16, 185, 129, 0.25)';
  if (pctOfPosition > 3) return 'rgba(16, 185, 129, 0.12)';
  if (pctOfPosition > -3) return 'rgba(30, 38, 64, 0.15)';
  if (pctOfPosition > -10) return 'rgba(244, 63, 94, 0.12)';
  if (pctOfPosition > -20) return 'rgba(244, 63, 94, 0.25)';
  return 'rgba(244, 63, 94, 0.4)';
}

function cellTextColor(pctOfPosition: number): string {
  if (pctOfPosition > 10) return 'text-emerald';
  if (pctOfPosition > 3) return 'text-emerald/70';
  if (pctOfPosition > -3) return 'text-text-muted';
  if (pctOfPosition > -10) return 'text-rose/70';
  return 'text-rose';
}

function formatDayLabel(days: number, today: Date): string {
  if (days === 0) return 'Now';
  const d = new Date(today);
  d.setDate(d.getDate() + days);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${dayNames[d.getDay()]} +${days}d`;
}

export function ThetaGrid({ spotPrice, strike, optionType, iv, dte, mark }: ThetaGridProps) {
  const [mode, setMode] = useState<PositionMode>('long');
  const [entryPrice, setEntryPrice] = useState(mark.toFixed(2));
  const [shortStrikeOffset, setShortStrikeOffset] = useState(5);
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);

  const maxDays = Math.min(dte - 1, 14);
  const daysForward = useMemo(() => {
    const days: number[] = [];
    for (let d = 0; d <= maxDays; d++) {
      const date = new Date(today);
      date.setDate(date.getDate() + d);
      const dow = date.getDay();
      if (dow !== 0 && dow !== 6) days.push(d);
      if (days.length >= 8) break;
    }
    return days;
  }, [maxDays, today]);

  const analysis = useMemo(() => {
    const entry = parseFloat(entryPrice) || mark;

    let legs: PositionLeg[];
    if (mode === 'long') {
      legs = [{ strike, optionType, quantity: 1, entryPrice: entry }];
    } else {
      const shortStrike = strike;
      const longStrike = strike - shortStrikeOffset;
      const t = dte / 365;
      const shortPrice = entry;
      const longPrice = blackScholesPrice(spotPrice, longStrike, t, 0.045, iv, 'put');
      legs = [
        { strike: shortStrike, optionType: 'put', quantity: -1, entryPrice: shortPrice },
        { strike: longStrike, optionType: 'put', quantity: 1, entryPrice: longPrice },
      ];
    }

    return computeThetaGrid({
      legs,
      spotPrice,
      iv,
      currentDte: dte,
      daysForward,
      priceMovePcts: [-5, -3, -2, -1, 0, 1, 2, 3, 5],
    });
  }, [spotPrice, strike, optionType, iv, dte, mark, entryPrice, mode, shortStrikeOffset, daysForward]);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-semibold text-text-muted uppercase tracking-wider">
            Position:
          </span>
          <div className="flex gap-1">
            {([
              { key: 'long' as const, label: 'Long' },
              { key: 'credit-spread' as const, label: 'Credit Spread' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setMode(key)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-medium transition-all ${
                  mode === key
                    ? 'bg-accent/15 text-accent-bright border border-accent/30'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-text-muted">Entry:</span>
          <input
            type="number"
            step="0.01"
            value={entryPrice}
            onChange={e => setEntryPrice(e.target.value)}
            className="w-[80px] px-2 py-1 rounded-md glass text-[11px] font-mono text-text-primary bg-transparent outline-none focus:border-accent/40 border border-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>

        {mode === 'credit-spread' && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-text-muted">Width:</span>
            <div className="flex gap-1">
              {[5, 10, 15, 20].map(w => (
                <button
                  key={w}
                  onClick={() => setShortStrikeOffset(w)}
                  className={`px-2 py-1 rounded-md text-[11px] font-mono font-medium transition-all ${
                    shortStrikeOffset === w
                      ? 'bg-accent/15 text-accent-bright border border-accent/30'
                      : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  ${w}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="text-[11px] font-mono text-text-tertiary">
          Position: <span className="text-text-secondary">${analysis.currentValue.toFixed(2)}</span>
          {' · '}P&L: <span className={analysis.pnlFromEntry >= 0 ? 'text-emerald' : 'text-rose'}>
            {analysis.pnlFromEntry >= 0 ? '+' : ''}${analysis.pnlFromEntry.toFixed(2)}
          </span>
          {' · '}<span className="text-text-muted">
            Θ {analysis.greeks.theta >= 0 ? '+' : ''}{analysis.greeks.theta.toFixed(3)}/day
            {' · '}Δ {analysis.greeks.delta >= 0 ? '+' : ''}{analysis.greeks.delta.toFixed(3)}
          </span>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="text-left text-[10px] font-mono font-semibold text-text-muted uppercase tracking-wider px-2 py-2 w-[90px]">
                Close on
              </th>
              {analysis.priceMovePcts.map(pct => (
                <th
                  key={pct}
                  className={`text-center text-[10px] font-mono font-semibold uppercase tracking-wider px-1 py-2 ${
                    pct === 0 ? 'text-text-secondary' : 'text-text-muted'
                  }`}
                >
                  {pct === 0 ? 'Flat' : `${pct > 0 ? '+' : ''}${pct}%`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {analysis.grid.map((row, ri) => (
              <tr key={analysis.daysForward[ri]}>
                <td className="px-2 py-1">
                  <div className="text-[11px] font-mono text-text-secondary font-medium">
                    {formatDayLabel(analysis.daysForward[ri], today)}
                  </div>
                  <div className="text-[9px] font-mono text-text-muted">
                    {analysis.daysForward[ri] > 0
                      ? `${dte - analysis.daysForward[ri]}d left`
                      : `${dte}d left`}
                  </div>
                </td>
                {row.map((cell, ci) => {
                  const key = `${ri}:${ci}`;
                  const isHovered = hoveredCell === key;
                  const isFlat = cell.priceMovePct === 0;
                  const absVal = Math.abs(analysis.currentValue);
                  const pctOfPos = absVal > 0.01 ? (cell.holdVsClose / absVal) * 100 : 0;

                  return (
                    <td
                      key={ci}
                      className="relative px-0.5 py-0.5"
                      onMouseEnter={() => setHoveredCell(key)}
                      onMouseLeave={() => setHoveredCell(null)}
                    >
                      <div
                        className={`flex flex-col items-center justify-center rounded-sm py-2 px-1 transition-all duration-150 ${
                          isHovered ? 'scale-[1.06] z-20 shadow-lg' : ''
                        } ${isFlat ? 'border-l border-r border-border-subtle/30' : ''}`}
                        style={{ backgroundColor: cellColor(pctOfPos) }}
                      >
                        <span className={`text-[11px] font-mono font-medium ${cellTextColor(pctOfPos)}`}>
                          {cell.holdVsClose >= 0 ? '+' : ''}{cell.holdVsClose.toFixed(2)}
                        </span>
                        <span className="text-[8px] font-mono text-text-muted">
                          ${cell.positionValue.toFixed(1)}
                        </span>
                      </div>

                      {/* Tooltip */}
                      {isHovered && (
                        <div className="absolute -top-[130px] left-1/2 -translate-x-1/2 rounded-lg px-3 py-2 shadow-xl z-30 whitespace-nowrap pointer-events-none border border-border-subtle bg-[#0f1629]/95 backdrop-blur-md">
                          <div className="text-[10px] font-mono text-text-secondary mb-1">
                            {formatDayLabel(cell.daysForward, today)} · {cell.priceMovePct === 0 ? 'Flat' : `${cell.priceMovePct > 0 ? '+' : ''}${cell.priceMovePct}%`}
                          </div>
                          <div className="space-y-0.5 text-[10px] font-mono">
                            <div className="flex justify-between gap-4">
                              <span className="text-text-muted">Underlying:</span>
                              <span className="text-text-secondary">${cell.spotAtMove.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-text-muted">DTE remaining:</span>
                              <span className="text-text-secondary">{cell.remainingDte}d</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-text-muted">Position value:</span>
                              <span className="text-text-secondary">${cell.positionValue.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between gap-4 border-t border-border-subtle pt-0.5 mt-0.5">
                              <span className="text-text-muted">Hold vs close now:</span>
                              <span className={`font-medium ${cell.holdVsClose >= 0 ? 'text-emerald' : 'text-rose'}`}>
                                {cell.holdVsClose >= 0 ? '+' : ''}${cell.holdVsClose.toFixed(2)}
                              </span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-text-muted">Total P&L:</span>
                              <span className={cell.pnlFromEntry >= 0 ? 'text-emerald' : 'text-rose'}>
                                {cell.pnlFromEntry >= 0 ? '+' : ''}${cell.pnlFromEntry.toFixed(2)}
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
        <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider">Hold vs close:</span>
        {[
          { label: 'Lose >$5', color: 'rgba(244, 63, 94, 0.4)' },
          { label: 'Lose $2–5', color: 'rgba(244, 63, 94, 0.25)' },
          { label: '~Neutral', color: 'rgba(30, 38, 64, 0.15)' },
          { label: 'Gain $2–5', color: 'rgba(16, 185, 129, 0.25)' },
          { label: 'Gain >$5', color: 'rgba(16, 185, 129, 0.4)' },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div className="w-3.5 h-3.5 rounded-sm" style={{ backgroundColor: item.color }} />
            <span className="text-[10px] font-mono text-text-muted">{item.label}</span>
          </div>
        ))}
      </div>

      {/* Explanation */}
      <p className="text-[11px] text-text-tertiary leading-relaxed">
        Each cell shows how much you <span className="text-text-secondary">gain or lose by holding</span> vs.
        closing now. Green = theta works for you at that price/time combo.
        Red = the delta move against you outweighs theta collected.
        {mode === 'long'
          ? ' For long options, the flat column shows pure theta decay — the cost of waiting.'
          : ' For credit spreads, the flat column shows theta collected — the reward for patience.'}
      </p>
    </div>
  );
}
