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
import type { VolatilityData } from '@/lib/hooks';

interface IvAnalysisProps {
  volatility: VolatilityData;
  currentIv: number;
  symbol: string;
}

function describeIvContext(
  currentIv: number,
  latestHv20: number,
  latestHv60: number,
  ivRank: number,
  ivHvSpread: number,
  hvLow: number,
  hvHigh: number,
  symbol: string,
): string[] {
  const iv = (currentIv * 100).toFixed(1);
  const hv20 = (latestHv20 * 100).toFixed(1);
  const hv60 = (latestHv60 * 100).toFixed(1);
  const spreadAbs = Math.abs(ivHvSpread * 100).toFixed(1);
  const rangeLow = (hvLow * 100).toFixed(0);
  const rangeHigh = (hvHigh * 100).toFixed(0);

  const sentences: string[] = [];

  if (ivRank >= 80) {
    sentences.push(`${symbol}'s implied volatility (${iv}%) is in the ${ivRank.toFixed(0)}th percentile of its 1-year range (${rangeLow}%–${rangeHigh}%), meaning it has been lower than this ${ivRank.toFixed(0)}% of the time over the past year.`);
  } else if (ivRank <= 20) {
    sentences.push(`${symbol}'s implied volatility (${iv}%) is in the ${ivRank.toFixed(0)}th percentile of its 1-year range (${rangeLow}%–${rangeHigh}%), meaning it has been higher than this ${(100 - ivRank).toFixed(0)}% of the time over the past year.`);
  } else {
    sentences.push(`${symbol}'s implied volatility (${iv}%) sits at the ${ivRank.toFixed(0)}th percentile of its 1-year range (${rangeLow}%–${rangeHigh}%).`);
  }

  if (ivHvSpread > 0.01) {
    sentences.push(`IV is currently ${spreadAbs}% above the 20-day realized volatility (${hv20}%), which means options are priced for more movement than the stock has recently delivered.`);
  } else if (ivHvSpread < -0.01) {
    sentences.push(`IV is currently ${spreadAbs}% below the 20-day realized volatility (${hv20}%), which means options are priced for less movement than the stock has recently shown.`);
  } else {
    sentences.push(`IV (${iv}%) and 20-day realized volatility (${hv20}%) are closely aligned, meaning options are priced roughly in line with recent actual movement.`);
  }

  const hvDiff = latestHv20 - latestHv60;
  if (hvDiff > 0.03) {
    sentences.push(`Short-term realized vol (${hv20}%) is running above the 60-day trend (${hv60}%), suggesting the stock has been more volatile recently than its longer-term pattern.`);
  } else if (hvDiff < -0.03) {
    sentences.push(`Short-term realized vol (${hv20}%) is below the 60-day trend (${hv60}%), suggesting recent price action has been calmer than the longer-term pattern.`);
  }

  return sentences;
}

export function IvAnalysis({ volatility, currentIv, symbol }: IvAnalysisProps) {
  const { series, latestHv20, latestHv60, hvPercentileRank, hvHigh, hvLow } = volatility;

  const ivHvSpread = currentIv - latestHv20;
  const ivRank = hvPercentileRank;

  const narrative = describeIvContext(currentIv, latestHv20, latestHv60, ivRank, ivHvSpread, hvLow, hvHigh, symbol);

  const chartData = useMemo(() => {
    return series
      .filter((d) => d.hv20 !== null)
      .map((d) => ({
        date: new Date(d.timestamp).getTime(),
        hv20: d.hv20 != null ? +(d.hv20 * 100).toFixed(1) : null,
        hv60: d.hv60 != null ? +(d.hv60 * 100).toFixed(1) : null,
      }));
  }, [series]);

  return (
    <div className="space-y-4">
      {/* IV context narrative */}
      <div className="rounded-lg border border-border-subtle bg-surface/30 px-4 py-3">
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Volatility Context
          </span>
        </div>
        <div className="space-y-1.5">
          {narrative.map((sentence, i) => (
            <p key={i} className="text-[12px] text-text-secondary leading-relaxed">
              {sentence}
            </p>
          ))}
        </div>
      </div>

      {/* IV stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass rounded-lg px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-1">
            Current IV
          </div>
          <div className="text-[16px] font-mono font-bold text-violet">
            {(currentIv * 100).toFixed(1)}%
          </div>
        </div>
        <div className="glass rounded-lg px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-1">
            HV 20-day
          </div>
          <div className="text-[16px] font-mono font-bold text-accent-bright">
            {(latestHv20 * 100).toFixed(1)}%
          </div>
        </div>
        <div className="glass rounded-lg px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-1">
            IV − HV Spread
          </div>
          <div className={`text-[16px] font-mono font-bold ${
            ivHvSpread > 0.05 ? 'text-amber' : ivHvSpread < -0.05 ? 'text-emerald' : 'text-text-primary'
          }`}>
            {ivHvSpread >= 0 ? '+' : ''}{(ivHvSpread * 100).toFixed(1)}%
          </div>
        </div>
        <div className="glass rounded-lg px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-1">
            IV Percentile
          </div>
          <div className={`text-[16px] font-mono font-bold ${
            ivRank > 70 ? 'text-amber' : ivRank < 30 ? 'text-emerald' : 'text-text-primary'
          }`}>
            {ivRank.toFixed(0)}th
          </div>
          {/* Percentile bar */}
          <div className="mt-1.5 h-1.5 bg-surface-raised rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                ivRank > 70 ? 'bg-amber' : ivRank < 30 ? 'bg-emerald' : 'bg-accent'
              }`}
              style={{ width: `${ivRank}%` }}
            />
          </div>
        </div>
      </div>

      {/* Historical volatility chart */}
      <div className="rounded-xl border border-border-subtle bg-deep/30 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-[13px] font-semibold text-text-primary">
              Historical Volatility — {symbol}
            </h3>
            <p className="text-[11px] text-text-tertiary mt-0.5">
              20-day and 60-day realized vol vs. current IV ({(currentIv * 100).toFixed(0)}%)
            </p>
          </div>
        </div>

        <div className="w-full h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 50, bottom: 10, left: 10 }}>
              <defs>
                <linearGradient id="hv20AreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.15} />
                  <stop offset="100%" stopColor="#60a5fa" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="4 4"
                stroke="var(--color-border-subtle)"
                vertical={false}
              />

              <XAxis
                dataKey="date"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(v: number) => {
                  const d = new Date(v);
                  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                }}
                tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--color-text-muted)' }}
                axisLine={{ stroke: 'var(--color-border-subtle)' }}
                tickLine={false}
              />

              <YAxis
                tickFormatter={(v: number) => `${v}%`}
                tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--color-text-muted)' }}
                axisLine={false}
                tickLine={false}
                width={45}
              />

              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload as (typeof chartData)[0];
                  if (!d) return null;
                  return (
                    <div className="bg-[#0f1629]/95 backdrop-blur-md rounded-lg px-3 py-2 shadow-xl border border-border-subtle">
                      <div className="text-[10px] font-mono text-text-secondary mb-1">
                        {new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                      {d.hv20 != null && (
                        <div className="text-[12px] font-mono">
                          <span className="text-accent-bright">HV20:</span> {d.hv20.toFixed(1)}%
                        </div>
                      )}
                      {d.hv60 != null && (
                        <div className="text-[12px] font-mono">
                          <span className="text-emerald">HV60:</span> {d.hv60.toFixed(1)}%
                        </div>
                      )}
                    </div>
                  );
                }}
              />

              <ReferenceLine
                y={currentIv * 100}
                stroke="#8b5cf6"
                strokeDasharray="6 3"
                strokeOpacity={0.7}
                label={{
                  value: `IV ${(currentIv * 100).toFixed(0)}%`,
                  position: 'right',
                  fill: '#8b5cf6',
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                }}
              />

              <Area
                type="monotone"
                dataKey="hv20"
                fill="url(#hv20AreaGrad)"
                stroke="none"
              />

              <Line
                type="monotone"
                dataKey="hv20"
                stroke="#60a5fa"
                strokeWidth={2}
                dot={false}
                name="HV 20-day"
              />

              <Line
                type="monotone"
                dataKey="hv60"
                stroke="#10b981"
                strokeWidth={1.5}
                dot={false}
                opacity={0.7}
                name="HV 60-day"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-5 mt-2">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 rounded-full bg-accent-bright" />
            <span className="text-[10px] text-text-tertiary">HV 20-day</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 rounded-full bg-emerald opacity-70" />
            <span className="text-[10px] text-text-tertiary">HV 60-day</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 rounded-full bg-violet" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 3px, var(--color-deep) 3px, var(--color-deep) 5px)' }} />
            <span className="text-[10px] text-text-tertiary">Current IV</span>
          </div>
        </div>
      </div>

      {/* Heuristics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="glass rounded-lg px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-1">
            HV Range (1Y)
          </div>
          <div className="text-[13px] font-mono text-text-primary">
            {(hvLow * 100).toFixed(0)}% — {(hvHigh * 100).toFixed(0)}%
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">5th to 95th percentile</div>
        </div>
        <div className="glass rounded-lg px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-1">
            HV 60-day
          </div>
          <div className="text-[13px] font-mono text-text-primary">
            {(latestHv60 * 100).toFixed(1)}%
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">Longer-term trend</div>
        </div>
        <div className="glass rounded-lg px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-1">
            IV vs HV20
          </div>
          <div className="text-[13px] font-mono font-medium text-text-primary">
            {ivHvSpread >= 0 ? '+' : ''}{(ivHvSpread * 100).toFixed(1)}%
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">
            IV {ivHvSpread >= 0 ? 'above' : 'below'} realized vol
          </div>
        </div>
      </div>
    </div>
  );
}
