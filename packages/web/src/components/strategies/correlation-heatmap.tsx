'use client';

import { Fragment, useState } from 'react';
import type { CorrelationMatrix } from '@inktrade/engine/portfolio';

interface CorrelationHeatmapProps {
  correlation: CorrelationMatrix;
}

function cellColor(corr: number, isDiagonal: boolean): string {
  if (isDiagonal) return 'rgba(59, 130, 246, 0.08)';
  const abs = Math.abs(corr);
  if (abs > 0.85) return 'rgba(244, 63, 94, 0.35)';
  if (abs > 0.7) return 'rgba(244, 63, 94, 0.2)';
  if (abs > 0.5) return 'rgba(251, 191, 36, 0.2)';
  if (abs > 0.3) return 'rgba(59, 130, 246, 0.15)';
  return 'rgba(30, 38, 64, 0.1)';
}

function cellTextColor(corr: number, isDiagonal: boolean): string {
  if (isDiagonal) return 'text-text-muted';
  const abs = Math.abs(corr);
  if (abs > 0.7) return 'text-rose';
  if (abs > 0.5) return 'text-amber';
  if (abs > 0.3) return 'text-accent-bright';
  return 'text-text-muted';
}

export function CorrelationHeatmap({ correlation }: CorrelationHeatmapProps) {
  const { symbols, matrix } = correlation;
  const n = symbols.length;
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <div
          className="inline-grid gap-1"
          style={{
            gridTemplateColumns: `80px repeat(${n}, minmax(60px, 1fr))`,
          }}
        >
          {/* Header row */}
          <div />
          {symbols.map(s => (
            <div
              key={`h-${s}`}
              className="text-center text-[10px] font-mono font-semibold text-text-muted uppercase tracking-wider py-1"
            >
              {s}
            </div>
          ))}

          {/* Data rows */}
          {symbols.map((rowSymbol, i) => (
            <Fragment key={`row-${rowSymbol}`}>
              <div
                className="flex items-center text-[11px] font-mono font-medium text-text-secondary pr-2"
              >
                {rowSymbol}
              </div>
              {symbols.map((colSymbol, j) => {
                const corr = matrix[i][j];
                const isDiag = i === j;
                const key = `${i}:${j}`;
                const isHovered = hoveredCell === key;

                return (
                  <div
                    key={key}
                    className={`relative flex items-center justify-center rounded-sm py-3 px-1 transition-all duration-150 cursor-default ${
                      isHovered && !isDiag ? 'scale-[1.08] z-10 shadow-lg' : ''
                    }`}
                    style={{ backgroundColor: cellColor(corr, isDiag) }}
                    onMouseEnter={() => setHoveredCell(key)}
                    onMouseLeave={() => setHoveredCell(null)}
                  >
                    <span className={`text-[12px] font-mono font-medium ${cellTextColor(corr, isDiag)}`}>
                      {isDiag ? '—' : corr.toFixed(2)}
                    </span>

                    {isHovered && !isDiag && (
                      <div className="absolute -top-[50px] left-1/2 -translate-x-1/2 rounded-lg px-3 py-1.5 shadow-xl z-30 whitespace-nowrap pointer-events-none border border-border-subtle bg-[#0f1629]/95 backdrop-blur-md">
                        <div className="text-[10px] font-mono text-text-secondary">
                          {rowSymbol} × {colSymbol}:{' '}
                          <span className={cellTextColor(corr, false)}>
                            {corr.toFixed(3)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap">
        <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider">Correlation:</span>
        {[
          { label: '<0.3', color: 'rgba(30, 38, 64, 0.1)' },
          { label: '0.3–0.5', color: 'rgba(59, 130, 246, 0.15)' },
          { label: '0.5–0.7', color: 'rgba(251, 191, 36, 0.2)' },
          { label: '0.7–0.85', color: 'rgba(244, 63, 94, 0.2)' },
          { label: '>0.85', color: 'rgba(244, 63, 94, 0.35)' },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div className="w-3.5 h-3.5 rounded-sm" style={{ backgroundColor: item.color }} />
            <span className="text-[10px] font-mono text-text-muted">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
