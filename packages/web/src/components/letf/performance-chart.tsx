'use client';

import { useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import type { LetfHistoryResponse, TickerHistoryResponse } from '@/lib/hooks';

interface PerformanceChartProps {
  data: LetfHistoryResponse;
  period: string;
  onPeriodChange: (period: string) => void;
  compareData?: TickerHistoryResponse | null;
  compareSymbol?: string;
}

type ChartMode = 'returns' | 'price';
const periods = ['1m', '3m', '6m', '1y', '2y', '5y'] as const;

function formatDate(v: string) {
  const d = new Date(v);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function formatFullDate(v: string) {
  return new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function PerformanceChart({ data, period, onPeriodChange, compareData, compareSymbol }: PerformanceChartProps) {
  const [chartMode, setChartMode] = useState<ChartMode>('returns');
  const factor = Math.abs(data.leverageFactor);
  const isBull = data.leverageFactor > 0;

  const chartPoints = (() => {
    const compareByDate = new Map<string, { cumReturn: number; close: number }>();
    if (compareData?.points?.length) {
      for (const cp of compareData.points) {
        compareByDate.set(cp.date, { cumReturn: cp.cumReturn, close: cp.close });
      }
    }
    return data.points.map((p) => ({
      ...p,
      compareCumReturn: compareByDate.get(p.date)?.cumReturn as number | undefined,
      comparePrice: compareByDate.get(p.date)?.close as number | undefined,
    }));
  })();

  const hasCompare = compareData != null && compareData.points.length > 0;
  const compareLabel = compareSymbol ?? compareData?.symbol ?? 'Compare';

  const startLetf = data.points[0]?.letfPrice;
  const endLetf = data.points[data.points.length - 1]?.letfPrice;
  const startUnderlying = data.points[0]?.underlyingPrice;
  const endUnderlying = data.points[data.points.length - 1]?.underlyingPrice;

  return (
    <div className="space-y-3">
      {/* Controls row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-4 text-[11px] font-mono flex-wrap">
          {chartMode === 'returns' ? (
            <>
              <span className={`font-medium ${data.totalLetfReturn >= 0 ? 'text-emerald' : 'text-rose'}`}>
                LETF: {data.totalLetfReturn >= 0 ? '+' : ''}{data.totalLetfReturn.toFixed(1)}%
              </span>
              <span className={`font-medium ${data.totalUnderlyingReturn >= 0 ? 'text-accent-bright' : 'text-rose'}`}>
                {data.underlying}: {data.totalUnderlyingReturn >= 0 ? '+' : ''}{data.totalUnderlyingReturn.toFixed(1)}%
              </span>
              <span className="text-text-muted">
                Naive {factor}x: {data.totalNaiveReturn >= 0 ? '+' : ''}{data.totalNaiveReturn.toFixed(1)}%
              </span>
              <span className={`font-medium ${data.totalDivergence >= 0 ? 'text-emerald' : 'text-rose'}`}>
                Drift: {data.totalDivergence >= 0 ? '+' : ''}{data.totalDivergence.toFixed(1)}%
              </span>
              {hasCompare && (
                <span className={`font-medium ${compareData.totalReturn >= 0 ? 'text-[#f59e0b]' : 'text-rose'}`}>
                  {compareLabel}: {compareData.totalReturn >= 0 ? '+' : ''}{compareData.totalReturn.toFixed(1)}%
                </span>
              )}
            </>
          ) : (
            <>
              {startLetf != null && endLetf != null && (
                <span className={`font-medium ${endLetf >= startLetf ? 'text-emerald' : 'text-rose'}`}>
                  {data.symbol}: ${startLetf.toFixed(2)} → ${endLetf.toFixed(2)}
                </span>
              )}
              {startUnderlying != null && endUnderlying != null && (
                <span className={`font-medium ${endUnderlying >= startUnderlying ? 'text-accent-bright' : 'text-rose'}`}>
                  {data.underlying}: ${startUnderlying.toFixed(2)} → ${endUnderlying.toFixed(2)}
                </span>
              )}
              {hasCompare && compareData.points.length > 0 && (
                <span className={`font-medium ${compareData.points[compareData.points.length - 1].close >= compareData.points[0].close ? 'text-[#f59e0b]' : 'text-rose'}`}>
                  {compareLabel}: ${compareData.points[0].close.toFixed(2)} → ${compareData.points[compareData.points.length - 1].close.toFixed(2)}
                </span>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 glass rounded-lg p-0.5">
            {(['returns', 'price'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setChartMode(m)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-medium transition-all ${
                  chartMode === m
                    ? 'bg-accent/15 text-accent-bright border border-accent/30'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {m === 'returns' ? '% Returns' : '$ Price'}
              </button>
            ))}
          </div>
          <div className="flex gap-1 glass rounded-lg p-0.5">
            {periods.map((p) => (
              <button
                key={p}
                onClick={() => onPeriodChange(p)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-medium transition-all ${
                  period === p
                    ? 'bg-accent/15 text-accent-bright border border-accent/30'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Max drawdown stats */}
      <div className="flex items-center gap-4 text-[11px] flex-wrap">
        <div className="flex items-center gap-2">
          <span className="font-semibold uppercase tracking-[0.12em] text-text-muted">Max Drawdown:</span>
          <span className="font-mono font-medium text-rose">-{data.maxDrawdownPct.toFixed(1)}%</span>
        </div>
        {hasCompare && (
          <div className="flex items-center gap-2">
            <span className="font-semibold uppercase tracking-[0.12em] text-text-muted">{compareLabel} Drawdown:</span>
            <span className="font-mono font-medium text-rose">-{compareData.maxDrawdownPct.toFixed(1)}%</span>
          </div>
        )}
        {hasCompare && (
          <div className="flex items-center gap-2">
            <span className="font-semibold uppercase tracking-[0.12em] text-text-muted">{compareLabel} Ann.:</span>
            <span className={`font-mono font-medium ${compareData.annualizedReturn >= 0 ? 'text-[#f59e0b]' : 'text-rose'}`}>
              {compareData.annualizedReturn >= 0 ? '+' : ''}{compareData.annualizedReturn.toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="w-full h-[360px]">
        <ResponsiveContainer width="100%" height="100%">
          {chartMode === 'returns' ? (
            <ComposedChart data={chartPoints} margin={{ top: 10, right: 50, bottom: 10, left: 10 }}>
              <defs>
                <linearGradient id="divergenceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="4 4" stroke="var(--color-border-subtle)" vertical={false} />

              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--color-text-muted)' }}
                axisLine={{ stroke: 'var(--color-border-subtle)' }}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={60}
              />

              <YAxis
                tickFormatter={(v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`}
                tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--color-text-muted)' }}
                axisLine={false}
                tickLine={false}
                width={55}
              />

              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload as (typeof chartPoints)[0];
                  if (!d) return null;
                  return (
                    <div className="bg-[#0f1629]/95 backdrop-blur-md rounded-lg px-3 py-2.5 shadow-xl border border-border-subtle">
                      <div className="text-[10px] font-mono text-text-secondary mb-1">
                        {formatFullDate(d.date)}
                      </div>
                      <div className="text-[12px] font-mono">
                        <span className={d.letfCumReturn >= 0 ? 'text-emerald' : 'text-rose'}>
                          LETF: {d.letfCumReturn >= 0 ? '+' : ''}{d.letfCumReturn.toFixed(1)}%
                        </span>
                      </div>
                      <div className="text-[12px] font-mono">
                        <span className="text-accent-bright">
                          {data.underlying}: {d.underlyingCumReturn >= 0 ? '+' : ''}{d.underlyingCumReturn.toFixed(1)}%
                        </span>
                      </div>
                      <div className="text-[12px] font-mono">
                        <span className="text-text-muted">
                          Naive {factor}x: {d.naiveCumReturn >= 0 ? '+' : ''}{d.naiveCumReturn.toFixed(1)}%
                        </span>
                      </div>
                      {d.compareCumReturn != null && (
                        <div className="text-[12px] font-mono">
                          <span className="text-[#f59e0b]">
                            {compareLabel}: {d.compareCumReturn >= 0 ? '+' : ''}{d.compareCumReturn.toFixed(1)}%
                          </span>
                        </div>
                      )}
                      <div className="text-[11px] font-mono text-text-secondary mt-1">
                        Drift: {d.divergence >= 0 ? '+' : ''}{d.divergence.toFixed(1)}%
                      </div>
                    </div>
                  );
                }}
              />

              <ReferenceLine y={0} stroke="var(--color-border-subtle)" strokeWidth={1} />

              <Area
                type="monotone"
                dataKey="divergence"
                fill="url(#divergenceGrad)"
                stroke="none"
              />

              <Line
                type="monotone"
                dataKey="underlyingCumReturn"
                stroke="#60a5fa"
                strokeWidth={1.5}
                dot={false}
                name={data.underlying}
              />

              <Line
                type="monotone"
                dataKey="naiveCumReturn"
                stroke="#94a3b8"
                strokeWidth={1}
                strokeDasharray="6 4"
                dot={false}
                opacity={0.5}
                name={`Naive ${factor}x`}
              />

              <Line
                type="monotone"
                dataKey="letfCumReturn"
                stroke={isBull ? '#10b981' : '#f43f5e'}
                strokeWidth={2.5}
                dot={false}
                name={data.symbol}
              />

              {hasCompare && (
                <Line
                  type="monotone"
                  dataKey="compareCumReturn"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                  name={compareLabel}
                  connectNulls
                />
              )}
            </ComposedChart>
          ) : (
            <ComposedChart data={chartPoints} margin={{ top: 10, right: 60, bottom: 10, left: 10 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="var(--color-border-subtle)" vertical={false} />

              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--color-text-muted)' }}
                axisLine={{ stroke: 'var(--color-border-subtle)' }}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={60}
              />

              <YAxis
                yAxisId="letf"
                tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: isBull ? '#10b981' : '#f43f5e' }}
                axisLine={false}
                tickLine={false}
                width={55}
              />

              <YAxis
                yAxisId="underlying"
                orientation="right"
                tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: '#60a5fa' }}
                axisLine={false}
                tickLine={false}
                width={55}
              />

              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload as (typeof chartPoints)[0];
                  if (!d) return null;
                  return (
                    <div className="bg-[#0f1629]/95 backdrop-blur-md rounded-lg px-3 py-2.5 shadow-xl border border-border-subtle">
                      <div className="text-[10px] font-mono text-text-secondary mb-1">
                        {formatFullDate(d.date)}
                      </div>
                      <div className="text-[12px] font-mono">
                        <span className={isBull ? 'text-emerald' : 'text-rose'}>
                          {data.symbol}: ${d.letfPrice.toFixed(2)}
                        </span>
                      </div>
                      <div className="text-[12px] font-mono">
                        <span className="text-accent-bright">
                          {data.underlying}: ${d.underlyingPrice.toFixed(2)}
                        </span>
                      </div>
                      {d.comparePrice != null && (
                        <div className="text-[12px] font-mono">
                          <span className="text-[#f59e0b]">
                            {compareLabel}: ${d.comparePrice.toFixed(2)}
                          </span>
                        </div>
                      )}
                      <div className="text-[11px] font-mono text-text-secondary mt-1">
                        {d.letfCumReturn >= 0 ? '+' : ''}{d.letfCumReturn.toFixed(1)}% / {d.underlyingCumReturn >= 0 ? '+' : ''}{d.underlyingCumReturn.toFixed(1)}%
                      </div>
                    </div>
                  );
                }}
              />

              <Line
                type="monotone"
                yAxisId="letf"
                dataKey="letfPrice"
                stroke={isBull ? '#10b981' : '#f43f5e'}
                strokeWidth={2.5}
                dot={false}
                name={data.symbol}
              />

              <Line
                type="monotone"
                yAxisId="underlying"
                dataKey="underlyingPrice"
                stroke="#60a5fa"
                strokeWidth={1.5}
                dot={false}
                name={data.underlying}
              />

              {hasCompare && (
                <Line
                  type="monotone"
                  yAxisId="underlying"
                  dataKey="comparePrice"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                  name={compareLabel}
                  connectNulls
                />
              )}
            </ComposedChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0.5 rounded-full" style={{ background: isBull ? '#10b981' : '#f43f5e' }} />
          <span className="text-[10px] text-text-tertiary">
            {data.symbol}{chartMode === 'price' ? ' (left axis)' : ''}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0.5 rounded-full bg-[#60a5fa]" />
          <span className="text-[10px] text-text-tertiary">
            {data.underlying}{chartMode === 'price' ? ' (right axis)' : ''}
          </span>
        </div>
        {chartMode === 'returns' && (
          <>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 rounded-full bg-[#94a3b8] opacity-50" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 3px, var(--color-deep) 3px, var(--color-deep) 5px)' }} />
              <span className="text-[10px] text-text-tertiary">Naive {factor}x</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-[#f59e0b] opacity-15" />
              <span className="text-[10px] text-text-tertiary">Rebalancing Drift</span>
            </div>
          </>
        )}
        {hasCompare && (
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 rounded-full bg-[#f59e0b]" />
            <span className="text-[10px] text-text-tertiary">
              {compareLabel}{chartMode === 'price' ? ' (right axis)' : ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
