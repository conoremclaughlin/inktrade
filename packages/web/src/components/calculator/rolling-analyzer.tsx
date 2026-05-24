'use client';

import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from 'recharts';
import {
  analyzeRollingStrategies,
  type RollingAnalysis,
  type RollingStrategyResult,
} from '@inktrade/engine/rolling';

interface RollingAnalyzerProps {
  spotPrice: number;
  iv: number;
  optionType: 'call' | 'put';
}

function fmt(n: number, decimals = 1): string {
  return n.toFixed(decimals);
}

function dteLabel(dte: number): string {
  if (dte >= 365) return `${(dte / 365).toFixed(1)}y`;
  if (dte >= 30) return `${Math.round(dte / 30)}mo`;
  return `${dte}d`;
}

function efficiencyColor(efficiency: number, maxEfficiency: number): string {
  const pct = maxEfficiency > 0 ? efficiency / maxEfficiency : 0;
  if (pct >= 0.9) return '#10b981';
  if (pct >= 0.7) return '#3b82f6';
  if (pct >= 0.5) return '#8b5cf6';
  if (pct >= 0.3) return '#f59e0b';
  return '#64748b';
}

export function RollingAnalyzer({ spotPrice, iv, optionType }: RollingAnalyzerProps) {
  const [targetPct, setTargetPct] = useState(0.10);
  const [targetDays, setTargetDays] = useState(60);
  const [bidAsk, setBidAsk] = useState(0.15);

  const analysis = useMemo<RollingAnalysis>(
    () => analyzeRollingStrategies({
      spotPrice,
      iv,
      optionType,
      bidAskSpread: bidAsk,
      targetPcts: [targetPct],
      targetDays: [targetDays],
    }),
    [spotPrice, iv, optionType, bidAsk, targetPct, targetDays],
  );

  const scatterData = useMemo(() => {
    return analysis.strategies
      .map((s) => {
        const t = s.targets[0];
        if (!t || t.leverageMultiple <= 0) return null;
        return {
          annualCost: s.annualCostPct,
          leverage: t.leverageMultiple,
          efficiency: t.efficiencyRatio,
          entryDte: s.entryDte,
          rollDte: s.rollDte,
          holdingDays: s.holdingDays,
          entryPrice: s.entryPrice,
          costPerRoll: s.costPerRoll,
          dailyTheta: s.dailyTheta,
          delta: s.deltaAtEntry,
          optionReturn: t.optionReturnPct,
        };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);
  }, [analysis]);

  const maxEfficiency = useMemo(
    () => Math.max(...scatterData.map((d) => d.efficiency), 0),
    [scatterData],
  );

  const optimalTarget = analysis.optimal?.targets[0];
  const optimalPoint = analysis.optimal && optimalTarget ? {
    annualCost: analysis.optimal.annualCostPct,
    leverage: optimalTarget.leverageMultiple,
  } : null;

  // Top 5 strategies by efficiency
  const topStrategies = useMemo(() => {
    return [...scatterData]
      .sort((a, b) => b.efficiency - a.efficiency)
      .slice(0, 5);
  }, [scatterData]);

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">Target Move:</span>
          <div className="flex gap-1 glass rounded-lg p-0.5">
            {[0.05, 0.10, 0.15, 0.20].map((v) => (
              <button
                key={v}
                onClick={() => setTargetPct(v)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-medium transition-all ${
                  targetPct === v
                    ? 'bg-accent/15 text-accent-bright border border-accent/30'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {optionType === 'put' ? '-' : '+'}{(v * 100).toFixed(0)}%
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">By:</span>
          <div className="flex gap-1 glass rounded-lg p-0.5">
            {[30, 60, 90, 120].map((d) => (
              <button
                key={d}
                onClick={() => setTargetDays(d)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-medium transition-all ${
                  targetDays === d
                    ? 'bg-accent/15 text-accent-bright border border-accent/30'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {dteLabel(d)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">Spread:</span>
          <div className="flex gap-1 glass rounded-lg p-0.5">
            {[0.05, 0.10, 0.15, 0.30].map((s) => (
              <button
                key={s}
                onClick={() => setBidAsk(s)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-medium transition-all ${
                  bidAsk === s
                    ? 'bg-accent/15 text-accent-bright border border-accent/30'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                ${s.toFixed(2)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Optimal strategy callout */}
      {analysis.optimal && optimalTarget && (
        <div className="rounded-lg border border-emerald/30 bg-emerald/5 px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-emerald animate-pulse" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald">
              Optimal Strategy
            </span>
          </div>
          <div className="flex items-center gap-6 flex-wrap text-[13px] font-mono">
            <span className="text-text-primary font-semibold">
              Buy {dteLabel(analysis.optimal.entryDte)} → Roll at {dteLabel(analysis.optimal.rollDte)}
            </span>
            <span className="text-text-secondary">
              Hold {analysis.optimal.holdingDays}d · {fmt(analysis.optimal.rollsPerYear, 1)} rolls/yr
            </span>
            <span className="text-emerald">
              {fmt(optimalTarget.leverageMultiple)}x leverage
            </span>
            <span className="text-text-muted">
              ${fmt(analysis.optimal.annualThetaCost, 2)}/yr theta ({fmt(analysis.optimal.annualCostPct)}% of spot)
            </span>
          </div>
          <div className="mt-1.5 text-[11px] text-text-tertiary">
            Entry: ${fmt(analysis.optimal.entryPrice, 2)} · Roll value: ${fmt(analysis.optimal.exitPrice, 2)} · Cost per roll: ${fmt(analysis.optimal.costPerRoll, 2)} · Delta: {fmt(analysis.optimal.deltaAtEntry, 3)}
          </div>
        </div>
      )}

      {/* Scatter chart: cost vs leverage */}
      <div className="w-full h-[380px]">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 30, bottom: 20, left: 15 }}>
            <CartesianGrid strokeDasharray="4 4" stroke="var(--color-border-subtle)" />

            <XAxis
              dataKey="annualCost"
              type="number"
              name="Annual Theta Cost"
              tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--color-text-muted)' }}
              axisLine={{ stroke: 'var(--color-border-subtle)' }}
              tickLine={false}
              label={{
                value: 'Annual Theta Cost (% of spot)',
                position: 'insideBottom',
                offset: -10,
                style: { fontSize: 10, fill: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' },
              }}
            />

            <YAxis
              dataKey="leverage"
              type="number"
              name="Leverage"
              tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--color-text-muted)' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `${v.toFixed(1)}x`}
              label={{
                value: 'Leverage Multiple',
                angle: -90,
                position: 'insideLeft',
                offset: 5,
                style: { fontSize: 10, fill: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' },
              }}
            />

            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload as (typeof scatterData)[0];
                if (!d) return null;
                return (
                  <div className="bg-[#0f1629]/95 backdrop-blur-md rounded-lg px-3 py-2.5 shadow-xl border border-border-subtle max-w-[260px]">
                    <div className="text-[12px] font-mono font-semibold text-text-primary mb-1.5">
                      Buy {dteLabel(d.entryDte)} → Roll at {dteLabel(d.rollDte)}
                    </div>
                    <div className="space-y-0.5 text-[11px] font-mono">
                      <div className="flex justify-between gap-4">
                        <span className="text-text-muted">Hold period:</span>
                        <span className="text-text-secondary">{d.holdingDays}d ({fmt(d.holdingDays / 30, 1)}mo)</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-text-muted">Rolls/year:</span>
                        <span className="text-text-secondary">{fmt(365 / d.holdingDays, 1)}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-text-muted">Entry price:</span>
                        <span className="text-text-secondary">${fmt(d.entryPrice, 2)}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-text-muted">Cost/roll:</span>
                        <span className="text-text-secondary">${fmt(d.costPerRoll, 2)}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-text-muted">Annual cost:</span>
                        <span className="text-rose">{fmt(d.annualCost)}% of spot</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-text-muted">Leverage:</span>
                        <span className="text-emerald font-medium">{fmt(d.leverage)}x</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-text-muted">Option return:</span>
                        <span className="text-accent-bright">{fmt(d.optionReturn)}%</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-text-muted">Delta:</span>
                        <span className="text-text-secondary">{fmt(d.delta, 3)}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-text-muted">Daily theta:</span>
                        <span className="text-text-secondary">${fmt(d.dailyTheta, 3)}</span>
                      </div>
                      <div className="flex justify-between gap-4 mt-1 pt-1 border-t border-border-subtle">
                        <span className="text-text-muted">Efficiency:</span>
                        <span className="text-[#f59e0b] font-medium">{fmt(d.efficiency, 3)}</span>
                      </div>
                    </div>
                  </div>
                );
              }}
            />

            {optimalPoint && (
              <>
                <ReferenceLine
                  x={optimalPoint.annualCost}
                  stroke="#10b981"
                  strokeDasharray="4 4"
                  strokeOpacity={0.3}
                />
                <ReferenceLine
                  y={optimalPoint.leverage}
                  stroke="#10b981"
                  strokeDasharray="4 4"
                  strokeOpacity={0.3}
                />
              </>
            )}

            <Scatter data={scatterData} shape="circle">
              {scatterData.map((entry, idx) => (
                <Cell
                  key={idx}
                  fill={efficiencyColor(entry.efficiency, maxEfficiency)}
                  fillOpacity={0.7}
                  r={
                    analysis.optimal &&
                    entry.entryDte === analysis.optimal.entryDte &&
                    entry.rollDte === analysis.optimal.rollDte
                      ? 7
                      : 4
                  }
                  stroke={
                    analysis.optimal &&
                    entry.entryDte === analysis.optimal.entryDte &&
                    entry.rollDte === analysis.optimal.rollDte
                      ? '#10b981'
                      : 'none'
                  }
                  strokeWidth={2}
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 flex-wrap text-[10px]">
        <span className="text-text-muted">Efficiency (leverage per % cost):</span>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald" />
          <span className="text-text-tertiary">Optimal</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#3b82f6]" />
          <span className="text-text-tertiary">Good</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#8b5cf6]" />
          <span className="text-text-tertiary">Fair</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#f59e0b]" />
          <span className="text-text-tertiary">Low</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#64748b]" />
          <span className="text-text-tertiary">Poor</span>
        </div>
      </div>

      {/* Top strategies table */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-2">
          Top 5 Strategies by Efficiency
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border-subtle">
                {['Strategy', 'Hold', 'Rolls/yr', 'Entry', 'Cost/Roll', 'Annual Cost', 'Leverage', 'Return', 'Efficiency'].map((h) => (
                  <th key={h} className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted px-2 py-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topStrategies.map((s, i) => (
                <tr key={i} className={`border-b border-border-subtle/50 ${i === 0 ? 'bg-emerald/5' : 'hover:bg-surface/20'} transition-colors`}>
                  <td className="text-[12px] font-mono font-semibold text-text-primary px-2 py-2">
                    {dteLabel(s.entryDte)} → {dteLabel(s.rollDte)}
                  </td>
                  <td className="text-[11px] font-mono text-text-secondary px-2 py-2">{s.holdingDays}d</td>
                  <td className="text-[11px] font-mono text-text-secondary px-2 py-2">{fmt(365 / s.holdingDays, 1)}</td>
                  <td className="text-[11px] font-mono text-text-secondary px-2 py-2">${fmt(s.entryPrice, 2)}</td>
                  <td className="text-[11px] font-mono text-text-secondary px-2 py-2">${fmt(s.costPerRoll, 2)}</td>
                  <td className="text-[11px] font-mono text-rose px-2 py-2">{fmt(s.annualCost)}%</td>
                  <td className="text-[11px] font-mono font-medium text-emerald px-2 py-2">{fmt(s.leverage)}x</td>
                  <td className="text-[11px] font-mono text-accent-bright px-2 py-2">{fmt(s.optionReturn)}%</td>
                  <td className="text-[11px] font-mono font-medium text-[#f59e0b] px-2 py-2">{fmt(s.efficiency, 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Explanation */}
      <div className="rounded-lg border border-border-subtle bg-surface/30 px-4 py-3">
        <p className="text-[12px] text-text-secondary leading-relaxed">
          Each point represents a rolling strategy: buy an ATM {optionType} at X DTE, then roll
          when it reaches Y DTE. The <span className="text-text-primary font-medium">x-axis</span> is
          your annual theta cost (the &quot;rent&quot; for continuous exposure), and the{' '}
          <span className="text-text-primary font-medium">y-axis</span> is the leverage multiple
          if {spotPrice > 0 && <>${(spotPrice * (1 + (optionType === 'call' ? targetPct : -targetPct))).toFixed(0)} </>}
          is hit within {targetDays} days. The sweet spot maximizes leverage per dollar of theta —
          shorter-dated options give more gamma but burn faster, while longer-dated options
          are cheaper to maintain but less responsive.
        </p>
      </div>
    </div>
  );
}
