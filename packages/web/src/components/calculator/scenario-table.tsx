'use client';

import type { LeverageAnalysis } from '@inktrade/engine/math';

interface ScenarioTableProps {
  analysis: LeverageAnalysis;
}

export function ScenarioTable({ analysis }: ScenarioTableProps) {
  const { surface, scenarios, breakeven, maxRisk, maxLeverage } = analysis;

  return (
    <div className="space-y-4">
      {/* Key metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass rounded-lg px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-1">
            Max Leverage
          </div>
          <div className="text-[18px] font-mono font-bold text-accent-bright">
            {maxLeverage.toFixed(1)}x
          </div>
        </div>
        <div className="glass rounded-lg px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-1">
            Breakeven
          </div>
          <div className="text-[18px] font-mono font-bold text-text-primary">
            ${breakeven.toFixed(2)}
          </div>
        </div>
        <div className="glass rounded-lg px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-1">
            Entry (Premium)
          </div>
          <div className="text-[18px] font-mono font-bold text-text-primary">
            ${surface.entryPrice.toFixed(2)}
          </div>
        </div>
        <div className="glass rounded-lg px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-1">
            Max Risk
          </div>
          <div className="text-[18px] font-mono font-bold text-rose">
            -${Math.abs(maxRisk).toFixed(2)}
          </div>
        </div>
      </div>

      {/* Scenario table */}
      {scenarios.length > 0 && (
        <div className="glass-bright rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted px-4 py-2.5">
                  Target Price
                </th>
                <th className="text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted px-4 py-2.5">
                  Leverage
                </th>
                <th className="text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted px-4 py-2.5">
                  P&L
                </th>
                <th className="text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted px-4 py-2.5">
                  Return %
                </th>
                <th className="text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted px-4 py-2.5">
                  Prob.
                </th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((s, i) => (
                <tr
                  key={i}
                  className="border-b border-border-subtle/50 last:border-0 hover:bg-surface/30 transition-colors"
                >
                  <td className="text-[13px] font-mono text-text-primary px-4 py-2.5">
                    ${s.targetPrice.toFixed(2)}
                  </td>
                  <td className="text-right text-[13px] font-mono font-medium text-accent-bright px-4 py-2.5">
                    {s.leverage.toFixed(1)}x
                  </td>
                  <td className={`text-right text-[13px] font-mono font-medium px-4 py-2.5 ${
                    s.pnl >= 0 ? 'text-emerald' : 'text-rose'
                  }`}>
                    {s.pnl >= 0 ? '+' : ''}${s.pnl.toFixed(2)}
                  </td>
                  <td className={`text-right text-[13px] font-mono font-medium px-4 py-2.5 ${
                    s.pnlPercent >= 0 ? 'text-emerald-bright' : 'text-rose'
                  }`}>
                    {s.pnlPercent >= 0 ? '+' : ''}{s.pnlPercent.toFixed(1)}%
                  </td>
                  <td className={`text-right text-[13px] font-mono font-medium px-4 py-2.5 ${
                    (s.probability ?? 0) >= 0.5 ? 'text-emerald' : (s.probability ?? 0) >= 0.3 ? 'text-amber' : 'text-rose'
                  }`}>
                    {s.probability != null ? `${(s.probability * 100).toFixed(0)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
