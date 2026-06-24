'use client';

import { useState, useMemo } from 'react';
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
  ReferenceArea,
} from 'recharts';
import { useThetaProjection, type ThetaProjectionParams } from '@/lib/hooks';

interface ThetaDecayChartProps {
  spotPrice: number;
}

function makePresets(spot: number) {
  const r5 = (n: number) => Math.round(n / 5) * 5;
  return [
    { label: '5% OTM · 21d', short: r5(spot * 0.95), width: 5, iv: 0.30, dte: 21, creditPct: 0.30 },
    { label: '3% OTM · 30d', short: r5(spot * 0.97), width: 5, iv: 0.30, dte: 30, creditPct: 0.30 },
    { label: '5% OTM · 45d', short: r5(spot * 0.95), width: 5, iv: 0.30, dte: 45, creditPct: 0.35 },
    { label: 'ATM · 14d', short: r5(spot), width: 5, iv: 0.30, dte: 14, creditPct: 0.40 },
  ];
}

export function ThetaDecayChart({ spotPrice }: ThetaDecayChartProps) {
  const defaultShort = Math.round(spotPrice * 0.95 / 5) * 5;
  const [shortStrike, setShortStrike] = useState(defaultShort);
  const [longStrike, setLongStrike] = useState(defaultShort - 5);
  const [iv, setIv] = useState(0.30);
  const [currentDte, setCurrentDte] = useState(30);
  const [netCredit, setNetCredit] = useState(1.50);
  const [contracts, setContracts] = useState(1);

  const params = useMemo<ThetaProjectionParams | null>(() => {
    if (shortStrike <= longStrike || currentDte < 1 || netCredit <= 0) return null;
    return {
      shortStrike,
      longStrike,
      spotPrice,
      iv,
      currentDte,
      netCreditReceived: netCredit,
      contracts,
    };
  }, [shortStrike, longStrike, spotPrice, iv, currentDte, netCredit, contracts]);

  const { data, isLoading, error } = useThetaProjection(params);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.days.map((d) => ({
      dte: d.dte,
      day: d.day,
      remainingPremiumPct: d.remainingPremiumPct,
      pnlPct: d.pnlPctOfMaxProfit,
      theta: d.dailyTheta,
      gammaRisk: d.gammaRiskDollars,
      delta: d.delta,
      vega: d.vega,
    }));
  }, [data]);

  const presets = useMemo(() => makePresets(spotPrice), [spotPrice]);

  const applyPreset = (p: ReturnType<typeof makePresets>[number]) => {
    setShortStrike(p.short);
    setLongStrike(p.short - p.width);
    setIv(p.iv);
    setCurrentDte(p.dte);
    setNetCredit(+(p.width * p.creditPct).toFixed(2));
  };

  return (
    <div className="space-y-5">
      {/* Input form */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <InputField label="Short Strike" value={shortStrike} onChange={setShortStrike} prefix="$" step={0.5} />
        <InputField label="Long Strike" value={longStrike} onChange={setLongStrike} prefix="$" step={0.5} />
        <InputField label="IV" value={iv} onChange={setIv} suffix="%" displayMult={100} step={0.01} />
        <InputField label="DTE" value={currentDte} onChange={setCurrentDte} step={1} />
        <InputField label="Net Credit" value={netCredit} onChange={setNetCredit} prefix="$" step={0.05} />
        <InputField label="Contracts" value={contracts} onChange={setContracts} step={1} />
      </div>

      {/* Presets */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider">Presets:</span>
        {presets.map((p, i) => (
          <button
            key={i}
            onClick={() => applyPreset(p)}
            className="px-2.5 py-1 rounded-md text-[10px] font-mono text-text-muted hover:text-text-secondary border border-border-subtle hover:border-accent/30 transition-all"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <SummaryCard
            label="Max Profit"
            value={`$${data.maxProfit.toFixed(0)}`}
            color="text-emerald"
          />
          <SummaryCard
            label="Max Loss"
            value={`$${data.maxLoss.toFixed(0)}`}
            color="text-rose"
          />
          <SummaryCard
            label="Current P&L"
            value={`${data.currentPnl >= 0 ? '+' : ''}$${data.currentPnl.toFixed(0)}`}
            sub={`${data.currentPnlPct.toFixed(0)}% of max`}
            color={data.currentPnl >= 0 ? 'text-emerald' : 'text-rose'}
          />
          <SummaryCard
            label="Daily Theta"
            value={`$${data.summary.thetaPerDayNow.toFixed(2)}`}
            color="text-accent-bright"
          />
          <SummaryCard
            label="Gamma Risk"
            value={`$${data.summary.gammaRiskNow.toFixed(2)}`}
            sub="per 1% move"
            color="text-amber"
          />
          <SummaryCard
            label="Θ/Γ Ratio"
            value={data.summary.thetaGammaRatio >= 100 ? '99+' : data.summary.thetaGammaRatio.toFixed(1)}
            sub={data.summary.thetaGammaRatio >= 2 ? 'favorable' : data.summary.thetaGammaRatio >= 1 ? 'neutral' : 'risky'}
            color={data.summary.thetaGammaRatio >= 2 ? 'text-emerald' : data.summary.thetaGammaRatio >= 1 ? 'text-text-secondary' : 'text-rose'}
          />
        </div>
      )}

      {/* Closing zone callout */}
      {data?.closingZone && (
        <div className="glass rounded-xl px-4 py-3 border-l-2 border-emerald/50">
          <div className="text-[11px] font-mono font-semibold text-emerald">
            Close at {data.closingZone.startDte} DTE
          </div>
          <div className="text-[11px] font-mono text-text-tertiary mt-0.5">
            {data.closingZone.rationale}
          </div>
        </div>
      )}

      {/* Charts */}
      {isLoading && (
        <div className="flex items-center justify-center h-[300px]">
          <div className="inline-block w-6 h-6 border-2 border-accent/30 border-t-accent-bright rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="flex items-center justify-center h-[200px] text-rose text-[13px] font-mono">
          {(error as Error).message}
        </div>
      )}

      {data && chartData.length > 0 && (
        <>
          {/* P&L / Premium chart */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-3">
              Premium Decay & P&L
            </div>
            <div className="w-full h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 30, bottom: 0, left: 10 }}>
                  <defs>
                    <linearGradient id="premiumGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.15} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid strokeDasharray="4 4" stroke="var(--color-border-subtle)" vertical={false} />

                  <XAxis
                    dataKey="dte"
                    tickFormatter={(v: number) => `${v}d`}
                    tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--color-text-muted)' }}
                    axisLine={{ stroke: 'var(--color-border-subtle)' }}
                    tickLine={false}
                  />

                  <YAxis
                    yAxisId="pct"
                    tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                    tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--color-text-muted)' }}
                    axisLine={false}
                    tickLine={false}
                    width={45}
                  />

                  {data.closingZone && (
                    <ReferenceArea
                      yAxisId="pct"
                      x1={data.closingZone.startDte}
                      x2={0}
                      fill="#10b981"
                      fillOpacity={0.06}
                    />
                  )}

                  {data.closingZone && (
                    <ReferenceLine
                      yAxisId="pct"
                      x={data.closingZone.startDte}
                      stroke="#10b981"
                      strokeDasharray="4 4"
                      strokeOpacity={0.5}
                    />
                  )}

                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]?.payload as (typeof chartData)[0];
                      if (!d) return null;
                      return (
                        <div className="bg-[#0f1629]/95 backdrop-blur-md rounded-lg px-3 py-2 shadow-xl border border-border-subtle">
                          <div className="text-[10px] font-mono text-text-secondary mb-1">
                            {d.dte} DTE (day {d.day})
                          </div>
                          <div className="space-y-0.5 text-[10px] font-mono">
                            <div className="flex justify-between gap-4">
                              <span className="text-text-muted">P&L:</span>
                              <span className="text-emerald font-medium">{d.pnlPct.toFixed(1)}% of max</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-text-muted">Remaining:</span>
                              <span className="text-violet">{d.remainingPremiumPct.toFixed(1)}%</span>
                            </div>
                          </div>
                        </div>
                      );
                    }}
                  />

                  <Area
                    yAxisId="pct"
                    type="monotone"
                    dataKey="remainingPremiumPct"
                    stroke="#8b5cf6"
                    strokeWidth={1.5}
                    fill="url(#premiumGrad)"
                    fillOpacity={1}
                    name="Remaining Premium"
                  />

                  <Line
                    yAxisId="pct"
                    type="monotone"
                    dataKey="pnlPct"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                    name="P&L % of Max"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Theta vs Gamma chart */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-3">
              Theta Gain vs Gamma Risk
            </div>
            <div className="w-full h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 30, bottom: 0, left: 10 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="var(--color-border-subtle)" vertical={false} />

                  <XAxis
                    dataKey="dte"
                    tickFormatter={(v: number) => `${v}d`}
                    tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--color-text-muted)' }}
                    axisLine={{ stroke: 'var(--color-border-subtle)' }}
                    tickLine={false}
                  />

                  <YAxis
                    tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                    tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--color-text-muted)' }}
                    axisLine={false}
                    tickLine={false}
                    width={50}
                  />

                  {data.closingZone && (
                    <ReferenceLine
                      x={data.closingZone.startDte}
                      stroke="#10b981"
                      strokeDasharray="4 4"
                      strokeOpacity={0.5}
                    />
                  )}

                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]?.payload as (typeof chartData)[0];
                      if (!d) return null;
                      return (
                        <div className="bg-[#0f1629]/95 backdrop-blur-md rounded-lg px-3 py-2 shadow-xl border border-border-subtle">
                          <div className="text-[10px] font-mono text-text-secondary mb-1">
                            {d.dte} DTE (day {d.day})
                          </div>
                          <div className="space-y-0.5 text-[10px] font-mono">
                            <div className="flex justify-between gap-4">
                              <span className="text-text-muted">Theta/day:</span>
                              <span className="text-accent-bright">${d.theta.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-text-muted">Gamma risk:</span>
                              <span className="text-amber">${d.gammaRisk.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-text-muted">Delta:</span>
                              <span className="text-text-secondary">{d.delta.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    }}
                  />

                  <Line
                    type="monotone"
                    dataKey="theta"
                    stroke="#60a5fa"
                    strokeWidth={2}
                    dot={false}
                    name="Daily Theta ($)"
                  />

                  <Line
                    type="monotone"
                    dataKey="gammaRisk"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={false}
                    name="Gamma Risk ($)"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-5 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 rounded-full bg-emerald" />
              <span className="text-[10px] text-text-tertiary">P&L % of max</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-violet opacity-20" />
              <span className="text-[10px] text-text-tertiary">Remaining premium</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 rounded-full bg-blue-400" />
              <span className="text-[10px] text-text-tertiary">Daily theta ($)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 rounded-full bg-amber" />
              <span className="text-[10px] text-text-tertiary">Gamma risk (1% move)</span>
            </div>
            {data.closingZone && (
              <div className="flex items-center gap-1.5">
                <div className="w-4 h-0 border-t border-dashed border-emerald" />
                <span className="text-[10px] text-text-tertiary">Closing zone</span>
              </div>
            )}
          </div>

          {/* Explanation */}
          <p className="text-[11px] text-text-tertiary leading-relaxed">
            Projection assumes <span className="text-text-secondary">flat price</span> and{' '}
            <span className="text-text-secondary">constant IV</span> through expiration.
            Daily theta shows how much premium you capture per day. Gamma risk estimates your loss
            from a 1% adverse move. The closing zone marks where 80% of max profit has been captured
            — remaining premium isn&apos;t worth the tail risk.
          </p>
        </>
      )}
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  displayMult,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  displayMult?: number;
  step: number;
}) {
  const displayed = displayMult ? value * displayMult : value;

  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-1.5">
        {label}
      </label>
      <div className="flex items-center glass rounded-lg px-3 py-2">
        {prefix && <span className="text-[12px] font-mono text-text-muted mr-1">{prefix}</span>}
        <input
          type="number"
          value={displayed}
          onChange={(e) => {
            const raw = parseFloat(e.target.value);
            if (!isNaN(raw)) onChange(displayMult ? raw / displayMult : raw);
          }}
          step={displayMult ? step * displayMult : step}
          className="flex-1 bg-transparent text-[13px] font-mono text-text-primary outline-none w-full [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        {suffix && <span className="text-[12px] font-mono text-text-muted ml-1">{suffix}</span>}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="glass rounded-xl px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-1">
        {label}
      </div>
      <div className={`text-[18px] font-mono font-bold ${color}`}>
        {value}
      </div>
      {sub && (
        <div className="text-[10px] font-mono text-text-tertiary">{sub}</div>
      )}
    </div>
  );
}
