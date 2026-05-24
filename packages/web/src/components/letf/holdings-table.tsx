'use client';

import type { LetfHoldingsData } from '@inktrade/engine/letf';

function PctCell({ value }: { value: number | null }) {
  if (value == null) return <span className="text-text-muted">—</span>;
  return (
    <span className={`font-mono font-medium ${value >= 0 ? 'text-emerald' : 'text-rose'}`}>
      {value >= 0 ? '+' : ''}{value.toFixed(2)}%
    </span>
  );
}

export function HoldingsTable({ data }: { data: LetfHoldingsData }) {
  return (
    <div className="space-y-4">
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border-subtle">
              <th className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted px-3 py-2">#</th>
              <th className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted px-3 py-2">Symbol</th>
              <th className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted px-3 py-2">Name</th>
              <th className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted px-3 py-2 text-right">Weight</th>
              <th className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted px-3 py-2 text-right">1D</th>
            </tr>
          </thead>
          <tbody>
            {data.holdings.map((h, i) => (
              <tr key={h.symbol || i} className="border-b border-border-subtle/50 hover:bg-surface/20 transition-colors">
                <td className="text-[11px] font-mono text-text-muted px-3 py-2">{i + 1}</td>
                <td className="text-[12px] font-mono font-semibold text-accent-bright px-3 py-2">{h.symbol || '—'}</td>
                <td className="text-[12px] text-text-secondary px-3 py-2 max-w-[200px] truncate">{h.name}</td>
                <td className="text-[12px] font-mono font-medium text-text-primary px-3 py-2 text-right">{h.weight.toFixed(1)}%</td>
                <td className="text-[12px] px-3 py-2 text-right"><PctCell value={h.change1D} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Concentration bars */}
      <div className="flex items-center gap-6">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">Top 5</span>
            <span className="text-[12px] font-mono font-medium text-text-primary">{data.topConcentration.top5.toFixed(1)}%</span>
          </div>
          <div className="h-2 rounded-full bg-surface-raised overflow-hidden">
            <div
              className="h-full rounded-full bg-accent/60 transition-all duration-500"
              style={{ width: `${Math.min(100, data.topConcentration.top5)}%` }}
            />
          </div>
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">Top 10</span>
            <span className="text-[12px] font-mono font-medium text-text-primary">{data.topConcentration.top10.toFixed(1)}%</span>
          </div>
          <div className="h-2 rounded-full bg-surface-raised overflow-hidden">
            <div
              className="h-full rounded-full bg-accent/40 transition-all duration-500"
              style={{ width: `${Math.min(100, data.topConcentration.top10)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Sector breakdown */}
      {Object.keys(data.sectorWeightings).length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-2">
            Sector Allocation
          </div>
          <div className="space-y-1.5">
            {Object.entries(data.sectorWeightings)
              .sort(([, a], [, b]) => b - a)
              .map(([sector, weight]) => (
                <div key={sector} className="flex items-center gap-3">
                  <span className="text-[11px] text-text-secondary w-32 capitalize truncate">
                    {sector.replace(/_/g, ' ')}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-surface-raised overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent/50"
                      style={{ width: `${Math.min(100, weight)}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-mono text-text-muted w-12 text-right">
                    {weight.toFixed(1)}%
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
