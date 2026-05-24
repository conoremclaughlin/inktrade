'use client';

import { useMemo } from 'react';
import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import type { DrawdownAnalysis } from '@inktrade/engine/portfolio';

interface DrawdownChartProps {
  drawdown: DrawdownAnalysis;
}

const COLORS = [
  '#60a5fa', '#10b981', '#f43f5e', '#f59e0b',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
  '#6366f1', '#84cc16', '#06b6d4', '#e11d48',
];

export function DrawdownChart({ drawdown }: DrawdownChartProps) {
  const data = useMemo(() => {
    const dateMap = new Map<string, Record<string, number>>();

    for (const ticker of drawdown.tickers) {
      for (const point of ticker.series) {
        if (!dateMap.has(point.date)) dateMap.set(point.date, {});
        dateMap.get(point.date)![ticker.symbol] = point.drawdownPct;
      }
    }

    return [...dateMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({ date, ...values }));
  }, [drawdown]);

  const symbols = drawdown.tickers.map(t => t.symbol);

  if (data.length === 0) return null;

  return (
    <div className="space-y-3">
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.08)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fontFamily: 'monospace', fill: '#64748b' }}
            tickFormatter={(d: string) => {
              const [, m, day] = d.split('-');
              return `${m}/${day}`;
            }}
            interval="preserveStartEnd"
            minTickGap={40}
          />
          <YAxis
            tick={{ fontSize: 10, fontFamily: 'monospace', fill: '#64748b' }}
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            domain={['dataMin', 0]}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(15, 22, 41, 0.95)',
              border: '1px solid rgba(148, 163, 184, 0.15)',
              borderRadius: '8px',
              fontFamily: 'monospace',
              fontSize: '11px',
            }}
            labelFormatter={(label) => String(label)}
            formatter={(value, name) => [
              `${Number(value).toFixed(1)}%`,
              String(name),
            ]}
          />
          <Legend
            wrapperStyle={{ fontSize: '10px', fontFamily: 'monospace' }}
          />
          {symbols.map((symbol, i) => (
            <Area
              key={symbol}
              type="monotone"
              dataKey={symbol}
              stroke={COLORS[i % COLORS.length]}
              fill={COLORS[i % COLORS.length]}
              fillOpacity={0.08}
              strokeWidth={1.5}
              dot={false}
              connectNulls
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>

      {drawdown.overlaps.length > 0 && (
        <p className="text-[11px] text-text-tertiary leading-relaxed">
          <span className="text-rose font-medium">{drawdown.overlaps.length} days</span> of simultaneous drawdown
          ({'>'} 5%) detected across multiple positions. Overlapping drawdowns indicate correlated risk
          that diversification alone won&apos;t mitigate.
        </p>
      )}
    </div>
  );
}
