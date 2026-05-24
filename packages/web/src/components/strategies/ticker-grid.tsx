'use client';

import type { TickerAnalysis, VolRegime, StrategyType } from '@inktrade/engine/portfolio';

interface TickerGridProps {
  tickers: TickerAnalysis[];
}

const VOL_BADGE: Record<VolRegime, { label: string; color: string }> = {
  low: { label: 'Low Vol', color: 'text-emerald bg-emerald/10 border-emerald/20' },
  normal: { label: 'Normal', color: 'text-accent-bright bg-accent/10 border-accent/20' },
  elevated: { label: 'Elevated', color: 'text-amber bg-amber/10 border-amber/20' },
  high: { label: 'High Vol', color: 'text-rose bg-rose/10 border-rose/20' },
};

const STRATEGY_LABEL: Record<StrategyType, { label: string; color: string }> = {
  'directional-calls': { label: 'Directional Calls', color: 'text-violet bg-violet/10 border-violet/20' },
  'put-credit-spread': { label: 'Put Credit Spread', color: 'text-emerald bg-emerald/10 border-emerald/20' },
  'letf-hold': { label: 'LETF Hold', color: 'text-accent-bright bg-accent/10 border-accent/20' },
  'momentum-stock': { label: 'Momentum', color: 'text-amber bg-amber/10 border-amber/20' },
  'caution': { label: 'Caution', color: 'text-rose bg-rose/10 border-rose/20' },
};

function MomentumBar({ score, percentile }: { score: number; percentile: number }) {
  const clampedPct = Math.max(0, Math.min(100, percentile));
  const barColor = score > 10 ? 'bg-emerald' : score > 0 ? 'bg-accent' : 'bg-rose';

  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[9px] font-mono">
        <span className="text-text-muted">Momentum</span>
        <span className={score > 0 ? 'text-emerald' : 'text-rose'}>
          {score >= 0 ? '+' : ''}{score.toFixed(1)}%
        </span>
      </div>
      <div className="h-1 w-full bg-surface-raised rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${clampedPct}%` }} />
      </div>
      <div className="text-[8px] font-mono text-text-muted text-right">{percentile.toFixed(0)}th pctile</div>
    </div>
  );
}

export function TickerGrid({ tickers }: TickerGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {tickers.map(ticker => {
        const volBadge = VOL_BADGE[ticker.volRegime];
        const stratLabel = STRATEGY_LABEL[ticker.suggestedStrategy];

        return (
          <div
            key={ticker.symbol}
            className="glass-bright rounded-xl p-4 space-y-3 border border-border-subtle"
          >
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[15px] font-mono font-semibold text-text-primary">
                  {ticker.symbol}
                </div>
                <div className="text-[13px] font-mono text-text-secondary">
                  ${ticker.price.toFixed(2)}
                  <span className={`ml-1.5 text-[11px] ${ticker.changePercent >= 0 ? 'text-emerald' : 'text-rose'}`}>
                    {ticker.changePercent >= 0 ? '+' : ''}{ticker.changePercent.toFixed(2)}%
                  </span>
                </div>
              </div>
              <span className={`text-[9px] font-mono font-medium px-2 py-0.5 rounded-md border ${volBadge.color}`}>
                {volBadge.label}
              </span>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
              <div>
                <div className="text-text-muted">Ann. Return</div>
                <div className={ticker.annualizedReturn >= 0 ? 'text-emerald' : 'text-rose'}>
                  {ticker.annualizedReturn >= 0 ? '+' : ''}{ticker.annualizedReturn.toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-text-muted">HV20</div>
                <div className="text-text-secondary">{ticker.volatility.toFixed(1)}%</div>
              </div>
              <div>
                <div className="text-text-muted">Max Drawdown</div>
                <div className="text-rose">-{ticker.maxDrawdownPct.toFixed(1)}%</div>
              </div>
              <div>
                <div className="text-text-muted">Current DD</div>
                <div className={ticker.currentDrawdownPct > 5 ? 'text-rose' : 'text-text-secondary'}>
                  -{ticker.currentDrawdownPct.toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Momentum */}
            <MomentumBar score={ticker.momentumScore.raw} percentile={ticker.momentumScore.percentile} />

            {/* Strategy tag */}
            <div className="pt-1 border-t border-border-subtle">
              <span className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded-md border ${stratLabel.color}`}>
                {stratLabel.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
