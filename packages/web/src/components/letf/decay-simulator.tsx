'use client';

import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { simulateDecay, annualizedDrag } from '@inktrade/engine/letf';

interface DecaySimulatorProps {
  defaultLeverage?: number;
}

function Slider({ label, value, min, max, step, format, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">{label}</span>
        <span className="text-[14px] font-mono font-bold text-text-primary">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none bg-surface-raised cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-bright
          [&::-webkit-slider-thumb]:shadow-[0_0_8px_rgba(59,130,246,0.4)] [&::-webkit-slider-thumb]:cursor-pointer"
      />
    </div>
  );
}

export function DecaySimulator({ defaultLeverage = 3 }: DecaySimulatorProps) {
  const [leverage, setLeverage] = useState(defaultLeverage);
  const [annualReturn, setAnnualReturn] = useState(0.10);
  const [annualVol, setAnnualVol] = useState(0.20);
  const [days, setDays] = useState(252);

  const data = useMemo(
    () => simulateDecay(leverage, annualReturn, annualVol, days),
    [leverage, annualReturn, annualVol, days],
  );

  const drag = annualizedDrag(leverage, annualVol);
  const finalExpected = data[data.length - 1]?.expectedValue ?? 1;
  const finalNaive = data[data.length - 1]?.naiveValue ?? 1;

  return (
    <div className="space-y-4">
      {/* Sliders */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Slider
          label="Leverage"
          value={leverage}
          min={1}
          max={5}
          step={0.5}
          format={(v) => `${v}x`}
          onChange={setLeverage}
        />
        <Slider
          label="Annual Return"
          value={annualReturn}
          min={-0.3}
          max={0.5}
          step={0.01}
          format={(v) => `${(v * 100).toFixed(0)}%`}
          onChange={setAnnualReturn}
        />
        <Slider
          label="Annual Volatility"
          value={annualVol}
          min={0.05}
          max={0.8}
          step={0.01}
          format={(v) => `${(v * 100).toFixed(0)}%`}
          onChange={setAnnualVol}
        />
        <Slider
          label="Holding Period"
          value={days}
          min={21}
          max={1260}
          step={21}
          format={(v) => v >= 252 ? `${(v / 252).toFixed(1)}y` : `${Math.round(v / 21)}mo`}
          onChange={setDays}
        />
      </div>

      {/* Key stats */}
      <div className="flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">Annual Drag:</span>
          <span className="text-[13px] font-mono font-bold text-rose">-{(drag * 100).toFixed(1)}%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">Expected Return:</span>
          <span className={`text-[13px] font-mono font-bold ${finalExpected >= 1 ? 'text-emerald' : 'text-rose'}`}>
            {((finalExpected - 1) * 100).toFixed(1)}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">Naive Return:</span>
          <span className="text-[13px] font-mono font-bold text-text-secondary">
            {((finalNaive - 1) * 100).toFixed(1)}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">Drag Cost:</span>
          <span className="text-[13px] font-mono font-bold text-[#f59e0b]">
            {((finalNaive - finalExpected) * 100).toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="w-full h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 50, bottom: 10, left: 10 }}>
            <defs>
              <linearGradient id="decayDragGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>

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
              width={50}
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
                    <div className="text-[12px] font-mono">
                      <span className={d.expectedValue >= 1 ? 'text-emerald' : 'text-rose'}>
                        Expected: {((d.expectedValue - 1) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-[12px] font-mono">
                      <span className="text-text-muted">
                        Naive: {((d.naiveValue - 1) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-[#f59e0b] mt-0.5">
                      Drag: {((d.naiveValue - d.expectedValue) * 100).toFixed(1)}%
                    </div>
                  </div>
                );
              }}
            />

            <Area
              type="monotone"
              dataKey="naiveValue"
              fill="url(#decayDragGrad)"
              stroke="none"
            />

            <Line
              type="monotone"
              dataKey="naiveValue"
              stroke="#94a3b8"
              strokeWidth={1.5}
              strokeDasharray="6 4"
              dot={false}
              opacity={0.5}
            />

            <Line
              type="monotone"
              dataKey="expectedValue"
              stroke="#10b981"
              strokeWidth={2.5}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Explanation */}
      <div className="rounded-lg border border-border-subtle bg-surface/30 px-4 py-3">
        <p className="text-[12px] text-text-secondary leading-relaxed">
          At {leverage}x leverage with {(annualVol * 100).toFixed(0)}% annual volatility,
          daily rebalancing creates <span className="font-mono font-medium text-[#f59e0b]">{(drag * 100).toFixed(1)}%</span> annualized
          drag. This comes from the formula: L(L−1)/2 × σ². Higher volatility compounds the
          drag exponentially — doubling vol quadruples the drag. The gap between the green line
          (expected path) and dashed line (naive {leverage}x) is pure rebalancing cost.
        </p>
      </div>
    </div>
  );
}
