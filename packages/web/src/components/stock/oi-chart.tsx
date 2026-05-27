'use client';

import { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  Cell,
} from 'recharts';
import { useOIDistribution, type OIDistribution } from '@/lib/hooks';

type Mode = 'oi' | 'volume';

function formatNumber(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}

function OIBarChart({ data, mode }: { data: OIDistribution; mode: Mode }) {
  const chartData = useMemo(() => {
    const callKey = mode === 'oi' ? 'callOI' : 'callVolume';
    const putKey = mode === 'oi' ? 'putOI' : 'putVolume';

    return data.strikes
      .filter((s) => s[callKey] > 0 || s[putKey] > 0)
      .map((s) => ({
        strike: s.strike,
        calls: s[callKey],
        puts: -s[putKey],
        callRaw: s[callKey],
        putRaw: s[putKey],
        isATM: Math.abs(s.strike - data.underlyingPrice) <=
          (data.strikes.length > 1
            ? Math.abs(data.strikes[1].strike - data.strikes[0].strike) / 2
            : 1),
      }));
  }, [data, mode]);

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-[13px] text-text-muted font-mono">
        No {mode === 'oi' ? 'open interest' : 'volume'} data available
      </div>
    );
  }

  return (
    <div className="w-full h-[400px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 10, right: 30, bottom: 10, left: 10 }}
          barGap={0}
          barCategoryGap={1}
        >
          <XAxis
            type="number"
            tickFormatter={(v: number) => formatNumber(Math.abs(v))}
            tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--color-text-muted)' }}
            axisLine={{ stroke: 'var(--color-border-subtle)' }}
            tickLine={false}
          />

          <YAxis
            type="category"
            dataKey="strike"
            tickFormatter={(v: number) => `$${v}`}
            tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--color-text-muted)' }}
            axisLine={false}
            tickLine={false}
            width={65}
            interval={chartData.length > 30 ? Math.floor(chartData.length / 15) : 0}
          />

          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0]?.payload;
              if (!d) return null;
              return (
                <div className="bg-[#0f1629]/95 backdrop-blur-md rounded-lg px-3 py-2 shadow-xl border border-border-subtle">
                  <div className="text-[11px] font-mono font-semibold text-text-primary mb-1">
                    ${d.strike} Strike
                  </div>
                  <div className="flex items-center gap-3">
                    <div>
                      <span className="text-[10px] text-text-muted">Calls: </span>
                      <span className="text-[11px] font-mono font-medium text-emerald">
                        {formatNumber(d.callRaw)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-text-muted">Puts: </span>
                      <span className="text-[11px] font-mono font-medium text-rose">
                        {formatNumber(d.putRaw)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            }}
          />

          <ReferenceLine x={0} stroke="var(--color-border-subtle)" strokeWidth={1} />

          <Bar dataKey="calls" isAnimationActive={false} radius={[0, 3, 3, 0]}>
            {chartData.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.isATM ? '#10b981' : '#10b981'}
                fillOpacity={entry.isATM ? 0.8 : 0.5}
              />
            ))}
          </Bar>

          <Bar dataKey="puts" isAnimationActive={false} radius={[3, 0, 0, 3]}>
            {chartData.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.isATM ? '#f43f5e' : '#f43f5e'}
                fillOpacity={entry.isATM ? 0.8 : 0.5}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function OIDistributionChart({ symbol }: { symbol: string }) {
  const [selectedExpiry, setSelectedExpiry] = useState<string | undefined>();
  const [mode, setMode] = useState<Mode>('oi');
  const { data, isLoading, error } = useOIDistribution(symbol, selectedExpiry);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          {/* Mode toggle */}
          <div className="flex gap-1 glass rounded-lg p-0.5">
            {(['oi', 'volume'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1 rounded-md text-[11px] font-mono font-medium transition-all ${
                  mode === m
                    ? 'bg-accent/15 text-accent-bright border border-accent/30'
                    : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {m === 'oi' ? 'Open Interest' : 'Volume'}
              </button>
            ))}
          </div>
        </div>

        {/* Expiry selector */}
        {data?.expirations && data.expirations.length > 0 && (
          <select
            value={selectedExpiry ?? ''}
            onChange={(e) => setSelectedExpiry(e.target.value || undefined)}
            className="glass rounded-lg px-3 py-1.5 text-[11px] font-mono text-text-primary bg-transparent border border-border-subtle focus:outline-none focus:border-accent/40"
          >
            <option value="">Nearest expiry</option>
            {data.expirations.slice(0, 12).map((exp) => (
              <option key={exp} value={exp}>
                {new Date(exp + 'T00:00:00').toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric',
                })}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Stats row */}
      {data && (
        <div className="flex items-center gap-6 flex-wrap text-[12px] font-mono">
          <div className="flex items-center gap-1.5">
            <span className="text-text-muted">Price:</span>
            <span className="font-medium text-text-primary">${data.underlyingPrice.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-text-muted">Max Pain:</span>
            <span className="font-medium text-amber-400">${data.maxPainStrike}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-text-muted">P/C Ratio:</span>
            <span className={`font-medium ${data.pcRatio > 1 ? 'text-rose' : 'text-emerald'}`}>
              {data.pcRatio.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-text-muted">Total Call OI:</span>
            <span className="font-medium text-emerald">{formatNumber(data.totalCallOI)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-text-muted">Total Put OI:</span>
            <span className="font-medium text-rose">{formatNumber(data.totalPutOI)}</span>
          </div>
        </div>
      )}

      {/* Chart */}
      {isLoading && (
        <div className="flex items-center justify-center h-[300px]">
          <div className="text-center">
            <div className="inline-block w-6 h-6 border-2 border-accent/30 border-t-accent-bright rounded-full animate-spin mb-3" />
            <div className="text-[13px] text-text-tertiary font-mono">Loading options data...</div>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-center h-[200px] text-rose text-[13px] font-mono">
          {(error as Error).message}
        </div>
      )}

      {data && <OIBarChart data={data} mode={mode} />}

      {/* Legend */}
      {data && (
        <div className="flex items-center gap-5 flex-wrap">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-emerald opacity-50" />
            <span className="text-[10px] text-text-tertiary">Calls (right)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-rose opacity-50" />
            <span className="text-[10px] text-text-tertiary">Puts (left)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1 h-3 bg-amber-400 opacity-60" />
            <span className="text-[10px] text-text-tertiary">Max Pain</span>
          </div>
        </div>
      )}
    </div>
  );
}
