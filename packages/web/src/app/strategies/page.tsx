'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { PortfolioInput } from '@/components/strategies/portfolio-input';
import { TickerGrid } from '@/components/strategies/ticker-grid';
import { CorrelationHeatmap } from '@/components/strategies/correlation-heatmap';
import { DrawdownChart } from '@/components/strategies/drawdown-chart';
import { RiskWarnings } from '@/components/strategies/risk-warnings';
import { usePortfolioAnalysis } from '@/lib/hooks';

const DEFAULT_SYMBOLS = ['MU', 'GOOG', 'TQQQ', 'SOXL'];

export default function StrategiesPage() {
  const searchParams = useSearchParams();

  const [symbols, setSymbols] = useState<string[]>(() => {
    const s = searchParams.get('symbols');
    if (s) return s.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean);
    return DEFAULT_SYMBOLS;
  });

  useEffect(() => {
    const params = new URLSearchParams();
    const joined = symbols.join(',');
    if (joined !== DEFAULT_SYMBOLS.join(',')) params.set('symbols', joined);
    const qs = params.toString();
    window.history.replaceState(null, '', `/strategies${qs ? `?${qs}` : ''}`);
  }, [symbols]);

  const { data, isLoading, error } = usePortfolioAnalysis(symbols);

  return (
    <AppShell onSymbolClick={(s) => setSymbols((prev) => prev.includes(s) ? prev : [...prev, s])}>
      <div className="mx-auto max-w-[1400px] pb-16 px-4 sm:px-6 pt-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-text-primary">
            Strategy Analysis
          </h1>
          <p className="text-[14px] text-text-tertiary mt-1">
            Compare strategies across your portfolio — find correlated risk before it finds you
          </p>
        </div>

        {/* Input panel */}
        <div className="glass-bright rounded-xl p-5 mb-6 border border-border-subtle">
          <PortfolioInput symbols={symbols} onChange={setSymbols} />
        </div>

        {/* Loading / Error states */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <div className="h-7 w-7 rounded-full border-2 border-accent/40 border-t-accent animate-spin" />
              <span className="text-[12px] font-mono text-text-muted">
                Analyzing {symbols.length} positions...
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="glass-bright rounded-xl p-5 mb-6 border border-rose/20">
            <p className="text-[13px] font-mono text-rose">{(error as Error).message}</p>
          </div>
        )}

        {data && (
          <div className="space-y-6">
            {/* Risk warnings */}
            {data.warnings.length > 0 && (
              <section className="glass-bright rounded-xl overflow-hidden animate-fade-up border border-border-subtle">
                <div className="px-5 py-3 border-b border-border-subtle">
                  <h2 className="text-[14px] font-semibold text-text-primary">Risk Alerts</h2>
                  <p className="text-[11px] text-text-tertiary mt-0.5">
                    Concentration and correlation warnings for your current selection
                  </p>
                </div>
                <div className="p-4">
                  <RiskWarnings warnings={data.warnings} />
                </div>
              </section>
            )}

            {/* Ticker grid */}
            <section className="glass-bright rounded-xl overflow-hidden animate-fade-up border border-border-subtle">
              <div className="px-5 py-3 border-b border-border-subtle">
                <h2 className="text-[14px] font-semibold text-text-primary">Position Analysis</h2>
                <p className="text-[11px] text-text-tertiary mt-0.5">
                  Per-ticker metrics with strategy suggestions based on vol regime and momentum
                </p>
              </div>
              <div className="p-4">
                <TickerGrid tickers={data.tickers} />
              </div>
            </section>

            {/* Correlation matrix */}
            <section className="glass-bright rounded-xl overflow-hidden animate-fade-up border border-border-subtle">
              <div className="px-5 py-3 border-b border-border-subtle">
                <h2 className="text-[14px] font-semibold text-text-primary">Correlation Matrix</h2>
                <p className="text-[11px] text-text-tertiary mt-0.5">
                  Pairwise return correlations over 1 year of daily data — red cells indicate positions that move together
                </p>
              </div>
              <div className="p-4">
                <CorrelationHeatmap correlation={data.correlation} />
              </div>
            </section>

            {/* Drawdown chart */}
            <section className="glass-bright rounded-xl overflow-hidden animate-fade-up border border-border-subtle">
              <div className="px-5 py-3 border-b border-border-subtle">
                <h2 className="text-[14px] font-semibold text-text-primary">Drawdown Overlap</h2>
                <p className="text-[11px] text-text-tertiary mt-0.5">
                  When multiple positions draw down simultaneously, your portfolio risk compounds
                </p>
              </div>
              <div className="p-4">
                <DrawdownChart drawdown={data.drawdown} />
              </div>
            </section>

            {/* No warnings state */}
            {data.warnings.length === 0 && (
              <section className="glass-bright rounded-xl overflow-hidden animate-fade-up border border-border-subtle">
                <div className="p-4">
                  <RiskWarnings warnings={[]} />
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
