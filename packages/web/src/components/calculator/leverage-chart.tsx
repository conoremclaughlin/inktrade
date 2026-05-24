'use client';

import { useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import type { LeverageAnalysis } from '@inktrade/engine/math';

interface LeverageChartProps {
  analysis: LeverageAnalysis;
  targetPrice?: number;
}

export function LeverageChart({ analysis, targetPrice }: LeverageChartProps) {
  const { surface, breakeven } = analysis;
  const currentPrice = surface.underlyingEntryPrice;

  const data = useMemo(() => {
    const raw = surface.points.map((p) => ({
      price: p.underlyingPrice,
      leverage: Math.max(0, p.leverage),
      pnl: p.pnl,
      pnlPct: p.pnlPercent,
    }));

    const validLevs = raw.map((d) => d.leverage).filter((v) => v > 0 && isFinite(v));
    const sorted = [...validLevs].sort((a, b) => a - b);
    const cap = Math.ceil((sorted[Math.floor(sorted.length * 0.85)] ?? 20) * 1.3);

    return { points: raw.map((d) => ({ ...d, leverage: Math.min(d.leverage, cap) })), cap };
  }, [surface]);

  const leverageCap = data.cap;

  return (
    <div className="w-full h-[420px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data.points} margin={{ top: 30, right: 60, bottom: 20, left: 10 }}>
          <defs>
            <linearGradient id="leverageAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid
            strokeDasharray="4 4"
            stroke="var(--color-border-subtle)"
            vertical={false}
          />

          <XAxis
            dataKey="price"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(v: number) => `$${v.toFixed(0)}`}
            tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: 'var(--color-text-muted)' }}
            axisLine={{ stroke: 'var(--color-border-subtle)' }}
            tickLine={false}
          />

          <YAxis
            yAxisId="leverage"
            orientation="left"
            domain={[0, leverageCap]}
            tickFormatter={(v: number) => `${v.toFixed(0)}x`}
            tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: 'var(--color-text-muted)' }}
            axisLine={false}
            tickLine={false}
            width={50}
          />

          <YAxis
            yAxisId="pnl"
            orientation="right"
            tickFormatter={(v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`}
            tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: 'var(--color-text-muted)' }}
            axisLine={false}
            tickLine={false}
            width={60}
          />

          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0]?.payload as (typeof data.points)[0];
              if (!d) return null;
              return (
                <div className="bg-[#0f1629]/95 backdrop-blur-md rounded-lg px-4 py-3 shadow-xl border border-border-subtle">
                  <div className="text-[11px] font-mono text-text-secondary mb-1.5">
                    @ ${d.price.toFixed(2)}
                  </div>
                  <div className="flex items-baseline gap-3">
                    <span className="text-[14px] font-mono font-bold text-accent-bright">
                      {`${d.leverage.toFixed(1)}x`}
                    </span>
                    <span className={`text-[13px] font-mono font-medium ${d.pnl >= 0 ? 'text-emerald' : 'text-rose'}`}>
                      {d.pnl >= 0 ? '+' : ''}{d.pnlPct.toFixed(1)}%
                    </span>
                  </div>
                  <div className={`text-[12px] font-mono mt-0.5 ${d.pnl >= 0 ? 'text-emerald-bright' : 'text-rose'}`}>
                    {d.pnl >= 0 ? '+' : ''}${d.pnl.toFixed(2)}
                  </div>
                </div>
              );
            }}
          />

          <ReferenceLine
            x={currentPrice}
            yAxisId="leverage"
            stroke="#3b82f6"
            strokeDasharray="4 2"
            strokeOpacity={0.6}
            label={{
              value: `Current $${currentPrice.toFixed(0)}`,
              position: 'insideTopLeft',
              fill: 'var(--color-text-tertiary)',
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              offset: 8,
            }}
          />

          <ReferenceLine
            x={breakeven}
            yAxisId="leverage"
            stroke="#f59e0b"
            strokeDasharray="4 2"
            strokeOpacity={0.5}
            label={{
              value: `B/E $${breakeven.toFixed(0)}`,
              position: 'insideTopRight',
              fill: '#f59e0b',
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              offset: 8,
            }}
          />

          {targetPrice && (
            <ReferenceLine
              x={targetPrice}
              yAxisId="leverage"
              stroke="#8b5cf6"
              strokeDasharray="6 3"
              strokeOpacity={0.7}
              label={{
                value: `Target $${targetPrice.toFixed(0)}`,
                position: 'insideTopRight',
                fill: '#8b5cf6',
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                offset: 8,
              }}
            />
          )}

          <Area
            yAxisId="leverage"
            type="monotone"
            dataKey="leverage"
            fill="url(#leverageAreaGrad)"
            stroke="none"
            connectNulls
          />

          <Line
            yAxisId="leverage"
            type="monotone"
            dataKey="leverage"
            stroke="#60a5fa"
            strokeWidth={2.5}
            dot={false}
            connectNulls
            activeDot={{ r: 4, fill: '#3b82f6', stroke: '#0a0e18', strokeWidth: 2 }}
          />

          <Line
            yAxisId="pnl"
            type="monotone"
            dataKey="pnlPct"
            stroke="#10b981"
            strokeWidth={1.5}
            strokeDasharray="6 4"
            dot={false}
            opacity={0.7}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
