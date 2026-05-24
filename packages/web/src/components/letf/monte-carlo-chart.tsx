'use client';

import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { runMonteCarlo } from '@inktrade/engine/letf';

interface MonteCarloChartProps {
  defaultLeverage?: number;
}

export function MonteCarloChart({ defaultLeverage = 3 }: MonteCarloChartProps) {
  const [leverage, setLeverage] = useState(defaultLeverage);
  const [annualReturn, setAnnualReturn] = useState(0.10);
  const [annualVol, setAnnualVol] = useState(0.20);
  const [days, setDays] = useState(252);

  const data = useMemo(
    () => runMonteCarlo(leverage, annualReturn, annualVol, days, 1000),
    [leverage, annualReturn, annualVol, days],
  );

  const final = data[data.length - 1];

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-4 flex-wrap">
        {([
          { label: 'Leverage', value: leverage, set: setLeverage, opts: [2, 3, 5] },
        ] as const).map(({ label, value, set, opts }) => (
          <div key={label} className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">{label}:</span>
            <div className="flex gap-1 glass rounded-lg p-0.5">
              {opts.map((v) => (
                <button
                  key={v}
                  onClick={() => set(v)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-medium transition-all ${
                    value === v
                      ? 'bg-accent/15 text-accent-bright border border-accent/30'
                      : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  {v}x
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">Vol:</span>
          <div className="flex gap-1 glass rounded-lg p-0.5">
            {[0.15, 0.20, 0.30, 0.40].map((v) => (
              <button
                key={v}
                onClick={() => setAnnualVol(v)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-medium transition-all ${
                  annualVol === v
                    ? 'bg-accent/15 text-accent-bright border border-accent/30'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {(v * 100).toFixed(0)}%
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">Return:</span>
          <div className="flex gap-1 glass rounded-lg p-0.5">
            {[0.05, 0.10, 0.15, 0.20].map((v) => (
              <button
                key={v}
                onClick={() => setAnnualReturn(v)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-medium transition-all ${
                  annualReturn === v
                    ? 'bg-accent/15 text-accent-bright border border-accent/30'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {(v * 100).toFixed(0)}%
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">Period:</span>
          <div className="flex gap-1 glass rounded-lg p-0.5">
            {[{ d: 126, l: '6mo' }, { d: 252, l: '1Y' }, { d: 504, l: '2Y' }, { d: 1260, l: '5Y' }].map(({ d, l }) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-medium transition-all ${
                  days === d
                    ? 'bg-accent/15 text-accent-bright border border-accent/30'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Percentile stats */}
      {final && (
        <div className="flex items-center gap-6 flex-wrap text-[11px] font-mono">
          <span className="text-text-muted">1000 simulations →</span>
          <span className="text-rose">p5: {((final.p5 - 1) * 100).toFixed(0)}%</span>
          <span className="text-[#f59e0b]">p25: {((final.p25 - 1) * 100).toFixed(0)}%</span>
          <span className="text-emerald font-medium">p50: {((final.p50 - 1) * 100).toFixed(0)}%</span>
          <span className="text-[#f59e0b]">p75: {((final.p75 - 1) * 100).toFixed(0)}%</span>
          <span className="text-accent-bright">p95: {((final.p95 - 1) * 100).toFixed(0)}%</span>
          <span className="text-text-muted">naive: {((final.naive - 1) * 100).toFixed(0)}%</span>
        </div>
      )}

      {/* Fan chart */}
      <div className="w-full h-[360px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 50, bottom: 10, left: 10 }}>
            <CartesianGrid strokeDasharray="4 4" stroke="var(--color-border-subtle)" vertical={false} />

            <XAxis
              dataKey="day"
              tickFormatter={(v: number) => v >= 252 ? `${(v / 252).toFixed(1)}y` : `${Math.round(v / 21)}mo`}
              tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--color-text-muted)' }}
              axisLine={{ stroke: 'var(--color-border-subtle)' }}
              tickLine={false}
            />

            <YAxis
              tickFormatter={(v: number) => `${((v - 1) * 100).toFixed(0)}%`}
              tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--color-text-muted)' }}
              axisLine={false}
              tickLine={false}
              width={55}
            />

            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload as (typeof data)[0];
                if (!d) return null;
                const dayLabel = d.day >= 252 ? `${(d.day / 252).toFixed(1)}y` : `${Math.round(d.day / 21)}mo`;
                return (
                  <div className="bg-[#0f1629]/95 backdrop-blur-md rounded-lg px-3 py-2 shadow-xl border border-border-subtle">
                    <div className="text-[10px] font-mono text-text-secondary mb-1">Day {d.day} ({dayLabel})</div>
                    <div className="text-[12px] font-mono text-rose">p5: {((d.p5 - 1) * 100).toFixed(1)}%</div>
                    <div className="text-[12px] font-mono text-[#f59e0b]">p25: {((d.p25 - 1) * 100).toFixed(1)}%</div>
                    <div className="text-[12px] font-mono text-emerald font-medium">p50: {((d.p50 - 1) * 100).toFixed(1)}%</div>
                    <div className="text-[12px] font-mono text-[#f59e0b]">p75: {((d.p75 - 1) * 100).toFixed(1)}%</div>
                    <div className="text-[12px] font-mono text-accent-bright">p95: {((d.p95 - 1) * 100).toFixed(1)}%</div>
                    <div className="text-[11px] font-mono text-text-muted mt-0.5">naive: {((d.naive - 1) * 100).toFixed(1)}%</div>
                  </div>
                );
              }}
            />

            {/* p5-p95 band */}
            <Area dataKey="p95" stroke="none" fill="#3b82f6" fillOpacity={0.06} />
            <Area dataKey="p5" stroke="none" fill="var(--color-deep)" fillOpacity={1} />

            {/* p25-p75 band */}
            <Area dataKey="p75" stroke="none" fill="#3b82f6" fillOpacity={0.1} />
            <Area dataKey="p25" stroke="none" fill="var(--color-deep)" fillOpacity={1} />

            {/* Naive line */}
            <Line type="monotone" dataKey="naive" stroke="#94a3b8" strokeWidth={1} strokeDasharray="6 4" dot={false} opacity={0.4} />

            {/* Median */}
            <Line type="monotone" dataKey="p50" stroke="#10b981" strokeWidth={2.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center gap-5 flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0.5 rounded-full bg-emerald" />
          <span className="text-[10px] text-text-tertiary">Median (p50)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-[#3b82f6] opacity-10" />
          <span className="text-[10px] text-text-tertiary">p25–p75</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-[#3b82f6] opacity-[0.06]" />
          <span className="text-[10px] text-text-tertiary">p5–p95</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0.5 rounded-full bg-[#94a3b8] opacity-40" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 3px, var(--color-deep) 3px, var(--color-deep) 5px)' }} />
          <span className="text-[10px] text-text-tertiary">Naive {leverage}x</span>
        </div>
      </div>
    </div>
  );
}
