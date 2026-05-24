'use client';

import { useMemo, useState } from 'react';
import type { OptionContract, OptionType } from '@inktrade/engine/math';
import { blackScholesPrice } from '@inktrade/engine/math';

export type HeatmapMode = 'leverage' | 'probability';

interface LeverageHeatmapProps {
  contracts: OptionContract[];
  underlyingPrice: number;
  targetPrice: number;
  optionType: OptionType;
  mode: HeatmapMode;
  onSelectContract: (contract: OptionContract) => void;
  selectedStrike: number | null;
  selectedExpiry: string | null;
  allExpirations: string[];
  expOffset: number;
  onExpOffsetChange: (offset: number) => void;
  isLoadingExps?: boolean;
}

function leverageColor(leverage: number): string {
  if (leverage <= 0) return 'rgba(244, 63, 94, 0.15)';
  if (leverage < 3) return 'rgba(59, 130, 246, 0.12)';
  if (leverage < 5) return 'rgba(59, 130, 246, 0.22)';
  if (leverage < 8) return 'rgba(59, 130, 246, 0.35)';
  if (leverage < 10) return 'rgba(96, 165, 250, 0.45)';
  if (leverage < 15) return 'rgba(16, 185, 129, 0.4)';
  return 'rgba(52, 211, 153, 0.55)';
}

function leverageTextColor(leverage: number): string {
  if (leverage <= 0) return 'text-rose';
  if (leverage < 5) return 'text-text-secondary';
  if (leverage < 10) return 'text-accent-bright';
  return 'text-emerald-bright';
}

function probabilityColor(prob: number): string {
  if (prob >= 0.7) return 'rgba(16, 185, 129, 0.45)';
  if (prob >= 0.5) return 'rgba(16, 185, 129, 0.3)';
  if (prob >= 0.35) return 'rgba(59, 130, 246, 0.25)';
  if (prob >= 0.2) return 'rgba(59, 130, 246, 0.15)';
  return 'rgba(244, 63, 94, 0.12)';
}

function probabilityTextColor(prob: number): string {
  if (prob >= 0.5) return 'text-emerald-bright';
  if (prob >= 0.35) return 'text-accent-bright';
  if (prob >= 0.2) return 'text-text-secondary';
  return 'text-rose';
}

function normalCDF(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1.0 / (1.0 + p * ax);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax / 2);
  return 0.5 * (1.0 + sign * y);
}

function estimateLeverage(contract: OptionContract, underlyingPrice: number, targetPrice: number): number {
  const optionPrice = contract.mark || contract.last;
  if (optionPrice <= 0) return 0;

  const stockReturn = (targetPrice - underlyingPrice) / underlyingPrice;
  if (Math.abs(stockReturn) < 0.001) {
    const delta = contract.greeks.delta || 0.5;
    return Math.abs(delta * underlyingPrice / optionPrice);
  }

  const t = contract.daysToExpiration / 365;
  if (t <= 0) return 0;

  const iv = contract.greeks.impliedVolatility || 0.3;
  const type = contract.type === 'call' ? 'call' as const : 'put' as const;
  const valueAtTarget = blackScholesPrice(targetPrice, contract.strike, t, 0.045, iv, type);
  const optionReturn = (valueAtTarget - optionPrice) / optionPrice;

  return Math.abs(optionReturn / stockReturn);
}

function estimateProbabilityOfProfit(
  contract: OptionContract,
  underlyingPrice: number,
  r: number = 0.05,
): number {
  const optionPrice = contract.mark || contract.last;
  const T = contract.daysToExpiration / 365;
  if (T <= 0 || optionPrice <= 0) return 0;

  const sigma = contract.greeks.impliedVolatility || 0.3;
  const breakeven = contract.type === 'call'
    ? contract.strike + optionPrice
    : contract.strike - optionPrice;

  const d2 = (Math.log(underlyingPrice / breakeven) + (r - 0.5 * sigma * sigma) * T)
    / (sigma * Math.sqrt(T));

  return contract.type === 'call' ? normalCDF(d2) : normalCDF(-d2);
}

export function LeverageHeatmap({
  contracts,
  underlyingPrice,
  targetPrice,
  optionType,
  mode,
  onSelectContract,
  selectedStrike,
  selectedExpiry,
  allExpirations,
  expOffset,
  onExpOffsetChange,
  isLoadingExps,
}: LeverageHeatmapProps) {
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

  const { strikes, expirations, grid } = useMemo(() => {
    const expMap = new Map<string, Map<number, OptionContract>>();
    const strikeSet = new Set<number>();

    for (const c of contracts) {
      const expKey = new Date(c.expiration).toISOString().slice(0, 10);
      strikeSet.add(c.strike);
      if (!expMap.has(expKey)) expMap.set(expKey, new Map());
      expMap.get(expKey)!.set(c.strike, c);
    }

    const sortedStrikes = [...strikeSet].sort((a, b) => a - b);
    const sortedExps = [...expMap.keys()].sort();

    const grid = new Map<string, { contract: OptionContract; leverage: number; probability: number }>();
    for (const [exp, strikeMap] of expMap) {
      for (const [strike, contract] of strikeMap) {
        const lev = estimateLeverage(contract, underlyingPrice, targetPrice);
        const prob = estimateProbabilityOfProfit(contract, underlyingPrice);
        grid.set(`${exp}:${strike}`, { contract, leverage: lev, probability: prob });
      }
    }

    return { strikes: sortedStrikes, expirations: sortedExps, grid };
  }, [contracts, underlyingPrice, targetPrice]);

  if (strikes.length === 0 || expirations.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-text-tertiary text-[13px]">
        No contracts available for heatmap
      </div>
    );
  }

  const formatExp = (iso: string) => {
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatExpFull = (iso: string) => {
    const d = new Date(iso + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  };

  const daysToExp = (iso: string) => {
    const d = new Date(iso + 'T12:00:00');
    const now = new Date();
    return Math.max(0, Math.ceil((d.getTime() - now.getTime()) / 86_400_000));
  };

  const atmStrike = strikes.reduce((best, s) =>
    Math.abs(s - underlyingPrice) < Math.abs(best - underlyingPrice) ? s : best
  , strikes[0]);
  const nearestStrikeIdx = strikes.indexOf(atmStrike);
  const windowSize = 8;
  const defaultStart = Math.max(0, nearestStrikeIdx - windowSize);
  const [strikeOffset, setStrikeOffset] = useState(0);
  const startIdx = Math.max(0, Math.min(defaultStart + strikeOffset, strikes.length - windowSize * 2 - 1));
  const endIdx = Math.min(strikes.length, startIdx + windowSize * 2 + 1);
  const visibleStrikes = strikes.slice(startIdx, endIdx);

  const canScrollUp = startIdx > 0;
  const canScrollDown = endIdx < strikes.length;

  const canScrollLeft = expOffset > 0;
  const canScrollRight = expOffset + expirations.length < allExpirations.length;

  const getCellColor = (cell: { leverage: number; probability: number }) =>
    mode === 'probability' ? probabilityColor(cell.probability) : leverageColor(cell.leverage);
  const getCellTextColor = (cell: { leverage: number; probability: number }) =>
    mode === 'probability' ? probabilityTextColor(cell.probability) : leverageTextColor(cell.leverage);
  const getCellValue = (cell: { leverage: number; probability: number }) =>
    mode === 'probability' ? `${(cell.probability * 100).toFixed(0)}%` : `${cell.leverage.toFixed(1)}x`;

  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <div className="relative" style={{ minWidth: `${80 + expirations.length * 76 + (canScrollLeft ? 36 : 0) + (canScrollRight ? 36 : 0)}px` }}>
        {isLoadingExps && (
          <div className="absolute inset-0 z-30 bg-void/40 backdrop-blur-[1px] rounded-lg flex items-center justify-center transition-opacity duration-200">
            <div className="flex items-center gap-2 glass rounded-lg px-4 py-2">
              <div className="w-4 h-4 border-2 border-accent/30 border-t-accent-bright rounded-full animate-spin" />
              <span className="text-[11px] font-mono text-text-secondary">Loading dates...</span>
            </div>
          </div>
        )}
        {/* Strike navigation — scroll up */}
        {canScrollUp && (
          <button
            onClick={() => setStrikeOffset((o) => o - 4)}
            className="w-full flex items-center justify-center gap-2 py-2 mb-1.5 rounded-lg text-[11px] font-mono font-medium text-accent-bright bg-accent/8 border border-accent/20 hover:bg-accent/15 hover:border-accent/35 hover:text-accent-bright active:scale-[0.99] transition-all cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 7.5L6 4L9.5 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Lower strikes (${strikes[startIdx - 1]?.toFixed(0) ?? '...'})
          </button>
        )}

        {/* Header row */}
        <div
          className="grid gap-px mb-1"
          style={{ gridTemplateColumns: `80px ${canScrollLeft ? '28px ' : ''}repeat(${expirations.length}, minmax(68px, 1fr))${canScrollRight ? ' 28px' : ''}` }}
        >
          <div className="text-[10px] font-mono text-text-muted uppercase tracking-wider px-2 py-2 flex items-end">
            Strike ↓
          </div>
          {canScrollLeft && (
            <button
              onClick={() => onExpOffsetChange(Math.max(0, expOffset - 6))}
              disabled={isLoadingExps}
              className="flex items-center justify-center rounded-md text-accent-bright bg-accent/8 border border-accent/20 hover:bg-accent/15 hover:border-accent/35 active:scale-95 transition-all cursor-pointer my-0.5 disabled:opacity-40"
              title={`Earlier dates (${formatExp(allExpirations[expOffset - 1] ?? '')})`}
            >
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
                <path d="M7.5 2.5L4 6L7.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          {expirations.map((exp) => (
            <div key={exp} className="text-center px-1 py-1">
              <div className="text-[11px] font-mono text-text-secondary font-medium">
                {formatExp(exp)}
              </div>
              <div className="text-[9px] font-mono text-text-muted">
                {daysToExp(exp)}d
              </div>
            </div>
          ))}
          {canScrollRight && (
            <button
              onClick={() => onExpOffsetChange(expOffset + 6)}
              disabled={isLoadingExps}
              className="flex items-center justify-center rounded-md text-accent-bright bg-accent/8 border border-accent/20 hover:bg-accent/15 hover:border-accent/35 active:scale-95 transition-all cursor-pointer my-0.5 disabled:opacity-40"
              title={`Later dates (${formatExp(allExpirations[expOffset + expirations.length] ?? '')})`}
            >
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
                <path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>

        {/* Grid rows */}
        {visibleStrikes.map((strike) => {
          const isAtm = strike === atmStrike;
          const isSelected = strike === selectedStrike;

          return (
            <div
              key={strike}
              className={`grid gap-px mb-px ${isAtm ? 'relative z-10' : ''}`}
              style={{ gridTemplateColumns: `80px ${canScrollLeft ? '28px ' : ''}repeat(${expirations.length}, minmax(68px, 1fr))${canScrollRight ? ' 28px' : ''}` }}
            >
              <div className={`flex items-center px-2 py-1 text-[12px] font-mono rounded-l-sm ${
                isAtm
                  ? 'text-accent-bright font-semibold bg-accent/5'
                  : isSelected
                    ? 'text-text-primary bg-accent/5'
                    : 'text-text-secondary'
              }`}>
                ${strike.toFixed(strike % 1 === 0 ? 0 : 2)}
                {isAtm && (
                  <span className="ml-1.5 text-[8px] px-1 py-px rounded bg-accent/15 text-accent/70 font-normal uppercase">
                    ATM
                  </span>
                )}
              </div>

              {canScrollLeft && <div />}

              {expirations.map((exp) => {
                const key = `${exp}:${strike}`;
                const cell = grid.get(key);
                const isHovered = hoveredCell === key;

                return (
                  <button
                    key={key}
                    className={`relative flex items-center justify-center py-2 px-1 rounded-sm transition-all duration-150 cursor-pointer ${
                      isSelected && selectedExpiry === exp && cell ? 'ring-1 ring-accent/50' : ''
                    } ${isHovered ? 'scale-[1.06] z-20 shadow-lg' : ''}`}
                    style={{ backgroundColor: cell ? getCellColor(cell) : 'rgba(30, 38, 64, 0.15)' }}
                    onMouseEnter={() => setHoveredCell(key)}
                    onMouseLeave={() => setHoveredCell(null)}
                    onClick={() => cell && onSelectContract(cell.contract)}
                  >
                    {cell ? (
                      <span className={`text-[12px] font-mono font-medium ${getCellTextColor(cell)}`}>
                        {getCellValue(cell)}
                      </span>
                    ) : (
                      <span className="text-[10px] text-text-muted">—</span>
                    )}

                    {isHovered && cell && (
                      <div className="absolute -top-[82px] left-1/2 -translate-x-1/2 rounded-lg px-3 py-2 shadow-xl z-30 whitespace-nowrap pointer-events-none border border-border-subtle bg-[#0f1629]/95 backdrop-blur-md">
                        <div className="text-[10px] font-mono text-text-secondary">
                          ${strike} · {formatExpFull(exp)} · {daysToExp(exp)}d
                        </div>
                        <div className="text-[12px] font-mono mt-0.5 flex items-center gap-2">
                          <span className={`font-bold ${leverageTextColor(cell.leverage)}`}>
                            {cell.leverage.toFixed(1)}x
                          </span>
                          <span className="text-text-muted">·</span>
                          <span className={`font-medium ${probabilityTextColor(cell.probability)}`}>
                            {(cell.probability * 100).toFixed(0)}% PoP
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-text-secondary mt-0.5">
                          Mark ${cell.contract.mark.toFixed(2)}
                          <span className="text-text-muted mx-1">·</span>
                          IV {(cell.contract.greeks.impliedVolatility * 100).toFixed(0)}%
                          <span className="text-text-muted mx-1">·</span>
                          Vol {cell.contract.volume.toLocaleString()}
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}

              {canScrollRight && <div />}
            </div>
          );
        })}

        {/* Strike navigation — scroll down */}
        {canScrollDown && (
          <button
            onClick={() => setStrikeOffset((o) => o + 4)}
            className="w-full flex items-center justify-center gap-2 py-2 mt-1.5 rounded-lg text-[11px] font-mono font-medium text-accent-bright bg-accent/8 border border-accent/20 hover:bg-accent/15 hover:border-accent/35 hover:text-accent-bright active:scale-[0.99] transition-all cursor-pointer"
          >
            Higher strikes (${strikes[endIdx]?.toFixed(0) ?? '...'})
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}

        {/* Legend */}
        <div className="flex items-center gap-4 mt-4 px-2 flex-wrap">
          {mode === 'leverage' ? (
            <>
              <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider">Leverage:</span>
              {[
                { label: '<3x', color: 'rgba(59, 130, 246, 0.12)' },
                { label: '3-5x', color: 'rgba(59, 130, 246, 0.22)' },
                { label: '5-8x', color: 'rgba(59, 130, 246, 0.35)' },
                { label: '8-10x', color: 'rgba(96, 165, 250, 0.45)' },
                { label: '10-15x', color: 'rgba(16, 185, 129, 0.4)' },
                { label: '15x+', color: 'rgba(52, 211, 153, 0.55)' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <div className="w-3.5 h-3.5 rounded-sm" style={{ backgroundColor: item.color }} />
                  <span className="text-[10px] font-mono text-text-muted">{item.label}</span>
                </div>
              ))}
            </>
          ) : (
            <>
              <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider">Prob. of Profit:</span>
              {[
                { label: '<20%', color: 'rgba(244, 63, 94, 0.12)' },
                { label: '20-35%', color: 'rgba(59, 130, 246, 0.15)' },
                { label: '35-50%', color: 'rgba(59, 130, 246, 0.25)' },
                { label: '50-70%', color: 'rgba(16, 185, 129, 0.3)' },
                { label: '70%+', color: 'rgba(16, 185, 129, 0.45)' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <div className="w-3.5 h-3.5 rounded-sm" style={{ backgroundColor: item.color }} />
                  <span className="text-[10px] font-mono text-text-muted">{item.label}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
