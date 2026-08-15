'use client';

import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import type { FundamentalsData } from '@/lib/hooks';
import { currencySymbol, formatLargeNumber } from '@/lib/format';

interface FundamentalsPanelProps {
  data: FundamentalsData;
  targetPrice: number | null;
  symbol: string;
}

function formatQuarter(dateStr: string): string {
  const d = new Date(dateStr);
  const q = Math.ceil((d.getMonth() + 1) / 3);
  const y = d.getFullYear().toString().slice(-2);
  return `Q${q}'${y}`;
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

export function FundamentalsPanel({
  data,
  targetPrice,
  symbol,
}: FundamentalsPanelProps) {
  const fc = data.financialCurrency ?? 'USD';
  const fxRate = data.exchangeRateToUSD;
  const canConvert = fc !== 'USD' && fxRate != null;
  const [showUSD, setShowUSD] = useState(false);

  const activeCurrency = showUSD && canConvert ? 'USD' : fc;
  const fcs = currencySymbol(activeCurrency);
  const convert = (n: number) => showUSD && fxRate != null ? n * fxRate : n;
  const fmt = (n: number) => formatLargeNumber(convert(n), activeCurrency);

  const displayQuarters = useMemo(() => data.quarters.slice(-6), [data.quarters]);

  const incomeData = useMemo(
    () => {
      const c = (n: number) => showUSD && fxRate != null ? n * fxRate : n;
      return displayQuarters.map((q) => ({
        label: formatQuarter(q.endDate),
        revenue: c(q.revenue),
        grossProfit: c(q.grossProfit),
        operatingIncome: c(q.operatingIncome),
        netIncome: c(q.netIncome),
        freeCashFlow: c(q.freeCashFlow),
        grossMarginPct: +q.grossMarginPct.toFixed(1),
        eps: c(q.eps),
      }));
    },
    [displayQuarters, showUSD, fxRate],
  );

  const balanceData = useMemo(
    () => {
      const c = (n: number) => showUSD && fxRate != null ? n * fxRate : n;
      return displayQuarters
        .filter((q) => q.totalAssets > 0)
        .map((q) => ({
          label: formatQuarter(q.endDate),
          totalAssets: c(q.totalAssets),
          totalEquity: c(q.totalEquity),
          totalDebt: c(q.totalDebt),
          cash: c(q.cash),
          currentRatio: q.currentLiabilities > 0 ? +(q.currentAssets / q.currentLiabilities).toFixed(2) : 0,
        }));
    },
    [displayQuarters, showUSD, fxRate],
  );

  const yoyData = useMemo(() => {
    const allQs = data.quarters;
    return displayQuarters.map((q) => {
      const qDate = new Date(q.endDate);
      const targetYear = qDate.getFullYear() - 1;
      const prev = allQs.find((p) => {
        const pDate = new Date(p.endDate);
        return pDate.getFullYear() === targetYear && Math.abs(pDate.getMonth() - qDate.getMonth()) <= 1;
      });
      if (!prev) return null;
      const pct = (curr: number, old: number) => old !== 0 ? ((curr / old) - 1) * 100 : null;
      return {
        label: formatQuarter(q.endDate),
        revenue: pct(q.revenue, prev.revenue),
        grossProfit: pct(q.grossProfit, prev.grossProfit),
        netIncome: pct(q.netIncome, prev.netIncome),
        eps: pct(q.eps, prev.eps),
        grossMarginPct: q.grossMarginPct,
        prevGrossMarginPct: prev.grossMarginPct,
        marginDelta: q.grossMarginPct - prev.grossMarginPct,
      };
    });
  }, [data.quarters, displayQuarters]);

  const { ttmRevenue, latestNetMarginPct, runRateEps, runRatePe } = useMemo(() => {
    const last4 = displayQuarters.slice(-4);
    const rev = last4.reduce((sum, q) => sum + q.revenue, 0);
    const latest = displayQuarters[displayQuarters.length - 1];
    if (!latest || data.sharesOutstanding <= 0) {
      return { ttmRevenue: rev, latestNetMarginPct: 0, runRateEps: 0, runRatePe: null as number | null };
    }
    const latestMargin = latest.revenue > 0 ? (latest.netIncome / latest.revenue) * 100 : 0;
    const annualizedNi = latest.netIncome * 4;
    const eps = annualizedNi / data.sharesOutstanding;
    const currentPrice = data.marketCap / data.sharesOutstanding;
    const pe = eps > 0 ? currentPrice / eps : null;
    return { ttmRevenue: rev, latestNetMarginPct: latestMargin, runRateEps: eps, runRatePe: pe };
  }, [displayQuarters, data.sharesOutstanding, data.marketCap]);

  const targetMarketCap =
    targetPrice !== null ? targetPrice * data.sharesOutstanding : null;
  const targetDelta =
    targetMarketCap !== null ? targetMarketCap - data.marketCap : null;
  const targetDeltaPct =
    targetDelta !== null && data.marketCap > 0
      ? (targetDelta / data.marketCap) * 100
      : null;

  const priceRevenue = ttmRevenue > 0 ? data.marketCap / ttmRevenue : 0;
  const targetPriceRevenue =
    targetMarketCap !== null && ttmRevenue > 0
      ? targetMarketCap / ttmRevenue
      : null;

  const targetCurrentFyPe =
    targetPrice !== null && data.currentFyEps > 0
      ? targetPrice / data.currentFyEps
      : null;

  const { earnings } = data;

  return (
    <div className="space-y-4">
      {/* Next earnings banner */}
      {earnings.nextDate && (
        <div className="rounded-lg border border-border-subtle bg-surface/30 px-4 py-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-0.5">
                Next Earnings
              </div>
              <div className="text-[14px] font-mono font-bold text-text-primary">
                {new Date(earnings.nextDate).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
                {earnings.isEstimate && (
                  <span className="text-[10px] font-normal text-text-tertiary ml-1.5">(est.)</span>
                )}
                <span className="text-[12px] font-medium text-text-secondary ml-2">
                  {daysUntil(earnings.nextDate)}d away
                </span>
              </div>
            </div>
            {earnings.epsEstimate && (
              <div className="flex gap-4">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-0.5">
                    EPS Est.
                  </div>
                  <div className="text-[14px] font-mono font-bold text-text-primary">
                    ${earnings.epsEstimate.avg.toFixed(2)}
                  </div>
                  <div className="text-[10px] font-mono text-text-tertiary">
                    ${earnings.epsEstimate.low.toFixed(2)} – ${earnings.epsEstimate.high.toFixed(2)}
                  </div>
                </div>
                {earnings.revenueEstimate && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-0.5">
                      Rev Est.
                    </div>
                    <div className="text-[14px] font-mono font-bold text-text-primary">
                      {fmt(earnings.revenueEstimate.avg)}
                    </div>
                    <div className="text-[10px] font-mono text-text-tertiary">
                      {fmt(earnings.revenueEstimate.low)} – {fmt(earnings.revenueEstimate.high)}
                    </div>
                  </div>
                )}
                {earnings.epsEstimate.yearAgoEps != null && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-0.5">
                      YoY EPS
                    </div>
                    <div className={`text-[14px] font-mono font-bold ${
                      earnings.epsEstimate.avg > earnings.epsEstimate.yearAgoEps ? 'text-emerald' : 'text-rose'
                    }`}>
                      {earnings.epsEstimate.yearAgoEps > 0
                        ? `${(((earnings.epsEstimate.avg / earnings.epsEstimate.yearAgoEps) - 1) * 100).toFixed(0)}%`
                        : 'N/A'}
                    </div>
                    <div className="text-[10px] font-mono text-text-tertiary">
                      vs ${earnings.epsEstimate.yearAgoEps.toFixed(2)} yr ago
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          {earnings.epsEstimate && (
            <div className="text-[10px] text-text-tertiary mt-1.5">
              {earnings.epsEstimate.analysts} analysts
              {earnings.revenueEstimate ? ` (EPS), ${earnings.revenueEstimate.analysts} (revenue)` : ''}
            </div>
          )}
        </div>
      )}

      {/* Valuation + Market Cap cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <div className="glass rounded-lg px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-1">
            Market Cap
          </div>
          <div className="text-[16px] font-mono font-bold text-text-primary">
            {formatLargeNumber(data.marketCap)}
          </div>
        </div>

        <div className="glass rounded-lg px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-1">
            Shares Out.
          </div>
          <div className="text-[16px] font-mono font-bold text-text-primary">
            {data.sharesOutstanding >= 1e9
              ? `${(data.sharesOutstanding / 1e9).toFixed(2)}B`
              : data.sharesOutstanding >= 1e6
                ? `${(data.sharesOutstanding / 1e6).toFixed(0)}M`
                : data.sharesOutstanding.toLocaleString()}
          </div>
        </div>

        <div className="glass rounded-lg px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-1">
            Trailing P/E
          </div>
          <div className="text-[16px] font-mono font-bold text-text-primary">
            {data.trailingPe ? `${data.trailingPe.toFixed(1)}x` : '—'}
          </div>
          <div className="text-[10px] font-mono text-text-tertiary mt-0.5">
            TTM EPS ${data.trailingEps.toFixed(2)}
          </div>
        </div>

        <div className="glass rounded-lg px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-1">
            Run-Rate P/E
          </div>
          <div className="text-[16px] font-mono font-bold text-[#f59e0b]">
            {runRatePe ? `${runRatePe.toFixed(1)}x` : '—'}
          </div>
          <div className="text-[10px] font-mono text-text-tertiary mt-0.5">
            Latest Q ×4 ${runRateEps.toFixed(2)}
          </div>
        </div>

        <div className="glass rounded-lg px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-1">
            Forward P/E
          </div>
          <div className="text-[16px] font-mono font-bold text-accent-bright">
            {data.currentFyPe ? `${data.currentFyPe.toFixed(1)}x` : '—'}
          </div>
          <div className="text-[10px] font-mono text-text-tertiary mt-0.5">
            NTM Est. ${data.currentFyEps.toFixed(2)}
          </div>
        </div>

        <div className="glass rounded-lg px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-1">
            At Target
          </div>
          {targetMarketCap !== null && targetDelta !== null && targetDeltaPct !== null ? (
            <>
              <div className="text-[16px] font-mono font-bold text-text-primary">
                {formatLargeNumber(targetMarketCap)}
              </div>
              <div className={`text-[10px] font-mono font-medium mt-0.5 ${targetDelta >= 0 ? 'text-emerald' : 'text-rose'}`}>
                {targetDelta >= 0 ? '+' : ''}{formatLargeNumber(targetDelta)} ({targetDelta >= 0 ? '+' : ''}{targetDeltaPct.toFixed(1)}%)
              </div>
            </>
          ) : (
            <div className="text-[14px] font-mono text-text-muted">—</div>
          )}
        </div>

        <div className="glass rounded-lg px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-1">
            P/S (TTM)
          </div>
          <div className="text-[16px] font-mono font-bold text-text-primary">
            {priceRevenue.toFixed(1)}x
          </div>
          {targetPriceRevenue !== null && (
            <div className="text-[10px] font-mono text-text-tertiary mt-0.5">
              {targetPriceRevenue.toFixed(1)}x at target
            </div>
          )}
        </div>
      </div>

      {/* P/E explanation */}
      <div className="rounded-lg border border-border-subtle bg-surface/30 px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">
          P/E Comparison
        </div>
        <p className="text-[12px] text-text-secondary leading-relaxed">
          {data.trailingPe !== null && (
            <><span className="font-mono font-medium text-text-primary">Trailing {data.trailingPe.toFixed(1)}x</span> — price / last 4 reported quarters of EPS (${data.trailingEps.toFixed(2)}). The standard backward-looking P/E. </>
          )}
          {runRatePe !== null && (
            <><span className="font-mono font-medium text-[#f59e0b]">Run-Rate {runRatePe.toFixed(1)}x</span> — latest quarter&apos;s net income annualized (×4) at {latestNetMarginPct.toFixed(1)}% net margin → ${runRateEps.toFixed(2)} EPS. What you&apos;re paying if current profitability holds. </>
          )}
          {data.currentFyPe !== null && (
            <><span className="font-mono font-medium text-accent-bright">Forward {data.currentFyPe.toFixed(1)}x</span> — next-twelve-months (NTM) rolling consensus EPS estimate (${data.currentFyEps.toFixed(2)}). </>
          )}
        </p>
        {data.currentFyPe !== null && runRatePe !== null && Math.abs(data.currentFyPe - runRatePe) > 0.5 && (
          <p className="text-[12px] text-text-secondary leading-relaxed mt-1.5">
            {data.currentFyPe < runRatePe
              ? `Forward P/E is ${(runRatePe - data.currentFyPe).toFixed(1)}x lower than run-rate — analysts expect earnings to grow beyond the latest quarter's pace.`
              : `Forward P/E is ${(data.currentFyPe - runRatePe).toFixed(1)}x higher than run-rate — analysts expect margins or revenue to pull back from the latest quarter.`
            }
          </p>
        )}
        {targetCurrentFyPe !== null && runRateEps > 0 && (
          <p className="text-[12px] text-text-secondary leading-relaxed mt-1.5">
            At ${targetPrice?.toFixed(0)} target: forward P/E <span className="font-mono font-medium text-text-primary">{targetCurrentFyPe.toFixed(1)}x</span>, run-rate P/E <span className="font-mono font-medium text-text-primary">{(targetPrice! / runRateEps).toFixed(1)}x</span>.
          </p>
        )}
      </div>

      {/* Income statement chart */}
      <div className="rounded-xl border border-border-subtle bg-deep/30 p-4">
        <div className="mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-semibold text-text-primary">
              Income Statement — {symbol}
            </h3>
            {canConvert && (
              <div className="flex gap-0.5 glass rounded-md p-0.5">
                <button
                  onClick={() => setShowUSD(false)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-all ${
                    !showUSD ? 'bg-accent/15 text-accent-bright border border-accent/30' : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  {fc}
                </button>
                <button
                  onClick={() => setShowUSD(true)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-all ${
                    showUSD ? 'bg-accent/15 text-accent-bright border border-accent/30' : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  USD
                </button>
              </div>
            )}
          </div>
          <p className="text-[11px] text-text-tertiary mt-0.5">
            Revenue, gross profit, operating income, net income, FCF (bars) · EPS (line)
          </p>
        </div>

        <div className="w-full h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={incomeData}
              margin={{ top: 10, right: 50, bottom: 10, left: 10 }}
            >
              <CartesianGrid strokeDasharray="4 4" stroke="var(--color-border-subtle)" vertical={false} />

              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--color-text-muted)' }}
                axisLine={{ stroke: 'var(--color-border-subtle)' }}
                tickLine={false}
              />

              <YAxis
                yAxisId="left"
                tickFormatter={(v: number) => {
                  const abs = Math.abs(v);
                  if (abs >= 1e9) return `${fcs}${(v / 1e9).toFixed(1)}B`;
                  if (abs >= 1e6) return `${fcs}${(v / 1e6).toFixed(0)}M`;
                  return `${fcs}${v}`;
                }}
                tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--color-text-muted)' }}
                axisLine={false}
                tickLine={false}
                width={70}
              />

              <YAxis
                yAxisId="right"
                orientation="right"
                tickFormatter={(v: number) => `${fcs}${v.toFixed(0)}`}
                tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--color-text-muted)' }}
                axisLine={false}
                tickLine={false}
                width={50}
              />

              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0]?.payload as (typeof incomeData)[0];
                  if (!d) return null;
                  return (
                    <div className="bg-[#0f1629]/95 backdrop-blur-md rounded-lg px-3 py-2 shadow-xl border border-border-subtle">
                      <div className="text-[10px] font-mono text-text-secondary mb-1">{d.label}</div>
                      <div className="text-[12px] font-mono"><span className="text-[#60a5fa]">Revenue:</span> {formatLargeNumber(d.revenue, activeCurrency)}</div>
                      <div className="text-[12px] font-mono"><span className="text-[#38bdf8]">Gross Profit:</span> {formatLargeNumber(d.grossProfit, activeCurrency)}</div>
                      <div className="text-[12px] font-mono"><span className="text-[#22d3ee]">Operating Inc:</span> {formatLargeNumber(d.operatingIncome, activeCurrency)}</div>
                      <div className="text-[12px] font-mono"><span className={d.netIncome >= 0 ? 'text-[#10b981]' : 'text-[#f43f5e]'}>Net Income:</span> {formatLargeNumber(d.netIncome, activeCurrency)}</div>
                      <div className="text-[12px] font-mono"><span className={d.freeCashFlow >= 0 ? 'text-[#f59e0b]' : 'text-[#f43f5e]'}>FCF:</span> {formatLargeNumber(d.freeCashFlow, activeCurrency)}</div>
                      <div className="text-[12px] font-mono"><span className="text-[#a78bfa]">EPS:</span> {fcs}{d.eps.toFixed(2)}</div>
                      <div className="text-[11px] font-mono text-text-secondary mt-1">Gross Margin: {d.grossMarginPct}%</div>
                    </div>
                  );
                }}
              />

              <Bar yAxisId="left" dataKey="revenue" fill="#60a5fa" radius={[3, 3, 0, 0]} barSize={18} opacity={0.85} />
              <Bar yAxisId="left" dataKey="grossProfit" fill="#38bdf8" radius={[3, 3, 0, 0]} barSize={18} opacity={0.7} />
              <Bar yAxisId="left" dataKey="operatingIncome" fill="#22d3ee" radius={[3, 3, 0, 0]} barSize={18} opacity={0.65} />
              <Bar yAxisId="left" dataKey="netIncome" fill="#10b981" radius={[3, 3, 0, 0]} barSize={18} opacity={0.85} />
              <Bar yAxisId="left" dataKey="freeCashFlow" fill="#f59e0b" radius={[3, 3, 0, 0]} barSize={18} opacity={0.75} />

              <Line
                yAxisId="right"
                type="monotone"
                dataKey="eps"
                stroke="#a78bfa"
                strokeWidth={2}
                dot={{ fill: '#a78bfa', r: 3, strokeWidth: 0 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="flex items-center gap-4 mt-2 flex-wrap">
          {[
            { color: '#60a5fa', label: 'Revenue' },
            { color: '#38bdf8', label: 'Gross Profit' },
            { color: '#22d3ee', label: 'Operating Inc.' },
            { color: '#10b981', label: 'Net Income' },
            { color: '#f59e0b', label: 'FCF' },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ background: item.color, opacity: 0.85 }} />
              <span className="text-[10px] text-text-tertiary">{item.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 rounded-full" style={{ background: '#a78bfa' }} />
            <span className="text-[10px] text-text-tertiary">EPS</span>
          </div>
        </div>

        {/* YoY growth table */}
        {yoyData.some((d) => d !== null) && (
          <div className="mt-4 border-t border-border-subtle pt-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2">
              Year-over-Year Growth
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] font-mono">
                <thead>
                  <tr className="text-text-muted">
                    <th className="text-left font-medium pb-1.5 pr-3">Quarter</th>
                    <th className="text-right font-medium pb-1.5 px-2">Revenue</th>
                    <th className="text-right font-medium pb-1.5 px-2">Gross Profit</th>
                    <th className="text-right font-medium pb-1.5 px-2">Net Income</th>
                    <th className="text-right font-medium pb-1.5 px-2">EPS</th>
                    <th className="text-right font-medium pb-1.5 pl-2">Gross Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {yoyData.map((d, i) => {
                    if (!d) return null;
                    const fmtPct = (v: number | null) => {
                      if (v === null) return <span className="text-text-tertiary">—</span>;
                      const color = v > 0 ? 'text-emerald' : v < 0 ? 'text-rose' : 'text-text-secondary';
                      return <span className={color}>{v > 0 ? '+' : ''}{v.toFixed(1)}%</span>;
                    };
                    return (
                      <tr key={i} className="border-t border-border-subtle/50">
                        <td className="text-text-secondary py-1.5 pr-3">{d.label}</td>
                        <td className="text-right py-1.5 px-2">{fmtPct(d.revenue)}</td>
                        <td className="text-right py-1.5 px-2">{fmtPct(d.grossProfit)}</td>
                        <td className="text-right py-1.5 px-2">{fmtPct(d.netIncome)}</td>
                        <td className="text-right py-1.5 px-2">{fmtPct(d.eps)}</td>
                        <td className="text-right py-1.5 pl-2">
                          <span className="text-text-secondary">{d.grossMarginPct.toFixed(1)}%</span>
                          {' '}
                          <span className={`text-[10px] ${d.marginDelta > 0 ? 'text-emerald' : d.marginDelta < 0 ? 'text-rose' : 'text-text-tertiary'}`}>
                            ({d.marginDelta > 0 ? '+' : ''}{d.marginDelta.toFixed(1)}pp)
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Balance sheet chart */}
      {balanceData.length > 0 && (
        <div className="rounded-xl border border-border-subtle bg-deep/30 p-4">
          <div className="mb-3">
            <h3 className="text-[13px] font-semibold text-text-primary">
              Balance Sheet — {symbol}
              {canConvert && (
                <span className="ml-2 text-[10px] font-mono text-text-tertiary">
                  {showUSD ? 'USD' : fc}
                </span>
              )}
            </h3>
            <p className="text-[11px] text-text-tertiary mt-0.5">
              Total assets, equity, debt, and cash · Current ratio (line)
            </p>
          </div>

          <div className="w-full h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={balanceData}
                margin={{ top: 10, right: 50, bottom: 10, left: 10 }}
              >
                <CartesianGrid strokeDasharray="4 4" stroke="var(--color-border-subtle)" vertical={false} />

                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--color-text-muted)' }}
                  axisLine={{ stroke: 'var(--color-border-subtle)' }}
                  tickLine={false}
                />

                <YAxis
                  yAxisId="left"
                  tickFormatter={(v: number) => {
                    const abs = Math.abs(v);
                    if (abs >= 1e9) return `${fcs}${(v / 1e9).toFixed(1)}B`;
                    if (abs >= 1e6) return `${fcs}${(v / 1e6).toFixed(0)}M`;
                    return `${fcs}${v}`;
                  }}
                  tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--color-text-muted)' }}
                  axisLine={false}
                  tickLine={false}
                  width={70}
                />

                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickFormatter={(v: number) => `${v.toFixed(1)}x`}
                  tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--color-text-muted)' }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />

                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload as (typeof balanceData)[0];
                    if (!d) return null;
                    return (
                      <div className="bg-[#0f1629]/95 backdrop-blur-md rounded-lg px-3 py-2 shadow-xl border border-border-subtle">
                        <div className="text-[10px] font-mono text-text-secondary mb-1">{d.label}</div>
                        <div className="text-[12px] font-mono"><span className="text-[#60a5fa]">Assets:</span> {formatLargeNumber(d.totalAssets, activeCurrency)}</div>
                        <div className="text-[12px] font-mono"><span className="text-[#10b981]">Equity:</span> {formatLargeNumber(d.totalEquity, activeCurrency)}</div>
                        <div className="text-[12px] font-mono"><span className="text-[#f43f5e]">Debt:</span> {formatLargeNumber(d.totalDebt, activeCurrency)}</div>
                        <div className="text-[12px] font-mono"><span className="text-[#fbbf24]">Cash:</span> {formatLargeNumber(d.cash, activeCurrency)}</div>
                        <div className="text-[12px] font-mono"><span className="text-[#a78bfa]">Current Ratio:</span> {d.currentRatio}x</div>
                      </div>
                    );
                  }}
                />

                <Bar yAxisId="left" dataKey="totalAssets" fill="#60a5fa" radius={[3, 3, 0, 0]} barSize={20} opacity={0.6} />
                <Bar yAxisId="left" dataKey="totalEquity" fill="#10b981" radius={[3, 3, 0, 0]} barSize={20} opacity={0.7} />
                <Bar yAxisId="left" dataKey="totalDebt" fill="#f43f5e" radius={[3, 3, 0, 0]} barSize={20} opacity={0.6} />
                <Bar yAxisId="left" dataKey="cash" fill="#fbbf24" radius={[3, 3, 0, 0]} barSize={20} opacity={0.7} />

                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="currentRatio"
                  stroke="#a78bfa"
                  strokeWidth={2}
                  dot={{ fill: '#a78bfa', r: 3, strokeWidth: 0 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center gap-4 mt-2 flex-wrap">
            {[
              { color: '#60a5fa', label: 'Total Assets' },
              { color: '#10b981', label: 'Equity' },
              { color: '#f43f5e', label: 'Debt' },
              { color: '#fbbf24', label: 'Cash' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm" style={{ background: item.color, opacity: 0.7 }} />
                <span className="text-[10px] text-text-tertiary">{item.label}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-0.5 rounded-full" style={{ background: '#a78bfa' }} />
              <span className="text-[10px] text-text-tertiary">Current Ratio</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
