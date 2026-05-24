'use client';

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

const periods = ['1m', '3m', '6m', '1y', '2y', '5y'] as const;

export function PerformanceChart({ data, period, onPeriodChange, compareData, compareSymbol }: PerformanceChartProps) {
  const factor = Math.abs(data.leverageFactor);
  const isBull = data.leverageFactor > 0;

  // Merge compare data into chart points via inner-join on date
  const chartPoints = (() => {
    if (!compareData?.points?.length) {
      return data.points.map((p) => ({ ...p, compareCumReturn: undefined as number | undefined }));
    }
    const compareByDate = new Map<string, number>();
    for (const cp of compareData.points) {
      compareByDate.set(cp.date, cp.cumReturn);
    }
    return data.points.map((p) => ({
      ...p,
      compareCumReturn: compareByDate.get(p.date) as number | undefined,
    }));
  })();

  const hasCompare = compareData != null && compareData.points.length > 0;
  const compareLabel = compareSymbol ?? compareData?.symbol ?? 'Compare';

  return (
    <div className="space-y-3">
      {/* Period selector */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-4 text-[11px] font-mono flex-wrap">
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
              tickFormatter={(v: string) => {
                const d = new Date(v);
                return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
              }}
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
                      {new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
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
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0.5 rounded-full" style={{ background: isBull ? '#10b981' : '#f43f5e' }} />
          <span className="text-[10px] text-text-tertiary">{data.symbol}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0.5 rounded-full bg-[#60a5fa]" />
          <span className="text-[10px] text-text-tertiary">{data.underlying}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0.5 rounded-full bg-[#94a3b8] opacity-50" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 3px, var(--color-deep) 3px, var(--color-deep) 5px)' }} />
          <span className="text-[10px] text-text-tertiary">Naive {factor}x</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-[#f59e0b] opacity-15" />
          <span className="text-[10px] text-text-tertiary">Rebalancing Drift</span>
        </div>
        {hasCompare && (
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 rounded-full bg-[#f59e0b]" />
            <span className="text-[10px] text-text-tertiary">{compareLabel}</span>
          </div>
        )}
      </div>
    </div>
  );
}
