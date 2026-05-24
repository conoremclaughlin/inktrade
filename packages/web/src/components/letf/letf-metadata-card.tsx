'use client';

import type { LetfProfile } from '@inktrade/engine/letf';

function formatLargeNumber(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

function formatPct(n: number | null): string {
  if (n == null) return '—';
  return `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`;
}

export function LetfMetadataCard({ data }: { data: LetfProfile }) {
  const { registry } = data;
  const isBull = registry.direction === 'bull';
  const factor = Math.abs(registry.leverageFactor);

  return (
    <div className="space-y-4">
      {/* Top banner */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className={`px-3 py-1.5 rounded-lg text-[14px] font-mono font-bold border ${
          isBull
            ? 'bg-emerald/10 text-emerald-bright border-emerald/30'
            : 'bg-rose/10 text-rose border-rose/30'
        }`}>
          {isBull ? '' : '-'}{factor}x {isBull ? 'Bull' : 'Bear'}
        </div>
        <div>
          <div className="text-[13px] text-text-secondary">
            {registry.issuer} · {registry.underlyingIndex}
          </div>
          <div className="text-[11px] text-text-tertiary">
            Tracks {registry.underlyingTicker} at {factor}x daily leverage
          </div>
        </div>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="glass rounded-lg px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-1">
            Expense Ratio
          </div>
          <div className="text-[16px] font-mono font-bold text-text-primary">
            {data.expenseRatio != null ? `${(data.expenseRatio * 100).toFixed(2)}%` : '—'}
          </div>
        </div>

        <div className="glass rounded-lg px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-1">
            Total Assets
          </div>
          <div className="text-[16px] font-mono font-bold text-text-primary">
            {data.totalAssets ? formatLargeNumber(data.totalAssets) : '—'}
          </div>
        </div>

        <div className="glass rounded-lg px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-1">
            YTD Return
          </div>
          <div className={`text-[16px] font-mono font-bold ${
            (data.ytdReturn ?? 0) >= 0 ? 'text-emerald' : 'text-rose'
          }`}>
            {formatPct(data.ytdReturn)}
          </div>
        </div>

        <div className="glass rounded-lg px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-1">
            Beta
          </div>
          <div className="text-[16px] font-mono font-bold text-text-primary">
            {data.beta != null ? data.beta.toFixed(2) : '—'}
          </div>
        </div>

        <div className="glass rounded-lg px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-1">
            Inception
          </div>
          <div className="text-[14px] font-mono font-bold text-text-primary">
            {data.inceptionDate
              ? new Date(data.inceptionDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
              : '—'}
          </div>
        </div>

        {data.riskStats && (
          <div className="glass rounded-lg px-3 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-1">
              Sharpe Ratio
            </div>
            <div className="text-[16px] font-mono font-bold text-text-primary">
              {data.riskStats.sharpeRatio.toFixed(2)}
            </div>
          </div>
        )}
      </div>

      {/* Trailing returns */}
      <div className="flex items-center gap-4 flex-wrap">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">Returns:</span>
        {([
          ['1M', data.trailingReturns.oneMonth],
          ['3M', data.trailingReturns.threeMonth],
          ['1Y', data.trailingReturns.oneYear],
          ['3Y', data.trailingReturns.threeYear],
          ['5Y', data.trailingReturns.fiveYear],
        ] as const).map(([label, val]) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono text-text-tertiary">{label}</span>
            <span className={`text-[12px] font-mono font-medium ${
              (val ?? 0) >= 0 ? 'text-emerald' : 'text-rose'
            }`}>
              {formatPct(val)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
