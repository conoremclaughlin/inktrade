'use client';

import { Suspense, useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { useLetfProfile, useLetfHoldings, useLetfHistory, useTickerHistory } from '@/lib/hooks';
import { LetfMetadataCard } from '@/components/letf/letf-metadata-card';
import { HoldingsTable } from '@/components/letf/holdings-table';
import { PerformanceChart } from '@/components/letf/performance-chart';
import { DecaySimulator } from '@/components/letf/decay-simulator';
import { MonteCarloChart } from '@/components/letf/monte-carlo-chart';
import { RedDayTable } from '@/components/letf/red-day-table';

function SymbolInput({ value, onSubmit }: { value: string; onSubmit: (v: string) => void }) {
  const [input, setInput] = useState(value);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (input.trim()) onSubmit(input.trim().toUpperCase());
      }}
      className="flex gap-2"
    >
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value.toUpperCase())}
        placeholder="TQQQ"
        className="flex-1 glass rounded-lg px-4 py-2.5 text-[15px] font-mono text-text-primary placeholder:text-text-muted bg-transparent outline-none focus:border-accent/40 transition-colors"
      />
      <button
        type="submit"
        className="px-5 py-2.5 rounded-lg bg-accent/15 text-accent-bright text-[13px] font-semibold border border-accent/30 hover:bg-accent/25 transition-colors"
      >
        Analyze
      </button>
    </form>
  );
}

function LoadingBar() {
  return (
    <div className="h-1 w-full bg-surface-raised rounded-full overflow-hidden">
      <div className="h-full bg-accent/40 rounded-full animate-pulse" style={{ width: '60%' }} />
    </div>
  );
}

function QuickPicks({ onSelect }: { onSelect: (s: string) => void }) {
  const picks = [
    { ticker: 'TQQQ', label: 'TQQQ', desc: '3x NASDAQ-100' },
    { ticker: 'SOXL', label: 'SOXL', desc: '3x Semiconductors' },
    { ticker: 'UPRO', label: 'UPRO', desc: '3x S&P 500' },
    { ticker: 'TNA', label: 'TNA', desc: '3x Russell 2000' },
    { ticker: 'TECL', label: 'TECL', desc: '3x Technology' },
    { ticker: 'FAS', label: 'FAS', desc: '3x Financials' },
    { ticker: 'TMF', label: 'TMF', desc: '3x 20Y Treasury' },
    { ticker: 'SQQQ', label: 'SQQQ', desc: '-3x NASDAQ-100' },
  ];

  return (
    <div className="flex gap-2 flex-wrap">
      {picks.map((p) => (
        <button
          key={p.ticker}
          onClick={() => onSelect(p.ticker)}
          className="px-3 py-1.5 rounded-lg glass text-[11px] font-mono hover:bg-surface/40 transition-colors"
        >
          <span className="font-bold text-text-primary">{p.label}</span>
          <span className="text-text-muted ml-1.5">{p.desc}</span>
        </button>
      ))}
    </div>
  );
}

function CompareInput({ onSubmit, onClear, activeSymbol }: {
  onSubmit: (v: string) => void;
  onClear: () => void;
  activeSymbol: string | null;
}) {
  const [input, setInput] = useState('');
  return (
    <div className="flex items-center gap-2">
      {activeSymbol ? (
        <>
          <span className="text-[13px] font-mono font-medium text-[#f59e0b]">{activeSymbol}</span>
          <button
            onClick={onClear}
            className="px-2.5 py-1 rounded-md text-[11px] font-mono text-text-muted hover:text-rose border border-border-subtle hover:border-rose/30 transition-colors"
          >
            Remove
          </button>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim()) {
              onSubmit(input.trim().toUpperCase());
              setInput('');
            }
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            placeholder="SPY, QQQ, AAPL..."
            className="w-40 glass rounded-lg px-4 py-2.5 text-[15px] font-mono text-text-primary placeholder:text-text-muted bg-transparent outline-none focus:border-accent/40 transition-colors"
          />
          <button
            type="submit"
            className="px-4 py-2.5 rounded-lg bg-[#f59e0b]/10 text-[#f59e0b] text-[13px] font-semibold border border-[#f59e0b]/30 hover:bg-[#f59e0b]/20 transition-colors"
          >
            Add
          </button>
        </form>
      )}
    </div>
  );
}

/**
 * useSearchParams opts its subtree out of prerendering, so the page body sits
 * behind a Suspense boundary — see the default export below.
 */
function LetfContent() {
  const searchParams = useSearchParams();

  const [symbol, setSymbol] = useState<string>(
    () => searchParams.get('symbol')?.toUpperCase() || 'TQQQ'
  );
  const [period, setPeriod] = useState(
    () => searchParams.get('period') || '1y'
  );
  const [compareSymbol, setCompareSymbol] = useState<string | null>(
    () => searchParams.get('compare')?.toUpperCase() || null
  );

  useEffect(() => {
    const params = new URLSearchParams();
    if (symbol !== 'TQQQ') params.set('symbol', symbol);
    if (period !== '1y') params.set('period', period);
    if (compareSymbol) params.set('compare', compareSymbol);
    const qs = params.toString();
    window.history.replaceState(null, '', `/letf${qs ? `?${qs}` : ''}`);
  }, [symbol, period, compareSymbol]);

  const profile = useLetfProfile(symbol);
  const holdings = useLetfHoldings(symbol);
  const history = useLetfHistory(symbol, period);
  const compareHistory = useTickerHistory(compareSymbol, period);

  const handleSymbolChange = useCallback((s: string) => {
    setSymbol(s);
    setPeriod('1y');
  }, []);

  const leverageFactor = profile.data?.registry.leverageFactor ?? 3;

  return (
    <AppShell activeSymbol={symbol} onSymbolClick={handleSymbolChange}>
      <div className="pb-16 px-4 sm:px-6 pt-8">
        <div className="mx-auto max-w-[1400px]">
          {/* Page header */}
          <div className="mb-8">
            <h1 className="font-display text-3xl md:text-4xl tracking-[-0.02em] text-text-primary">
              LETF Analysis
            </h1>
            <p className="mt-2 text-[14px] text-text-secondary">
              Leveraged ETF performance, decay modeling, and risk analysis
            </p>
          </div>

          {/* Top bar */}
          <div className="glass-bright rounded-xl p-5 mb-6 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 items-end">
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-tertiary mb-2">
                    Leveraged ETF
                  </label>
                  <SymbolInput value={symbol} onSubmit={handleSymbolChange} />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-tertiary mb-2">
                    Compare with
                  </label>
                  <CompareInput
                    onSubmit={setCompareSymbol}
                    onClear={() => setCompareSymbol(null)}
                    activeSymbol={compareSymbol}
                  />
                </div>
              </div>

              {profile.data && (
                <div className="text-right">
                  <div className="text-[22px] font-mono font-bold text-text-primary">
                    ${profile.data.price.toFixed(2)}
                  </div>
                  <div className={`text-[13px] font-mono font-medium ${
                    profile.data.change >= 0 ? 'text-emerald' : 'text-rose'
                  }`}>
                    {profile.data.change >= 0 ? '+' : ''}{profile.data.change.toFixed(2)}{' '}
                    ({profile.data.changePercent >= 0 ? '+' : ''}{profile.data.changePercent.toFixed(2)}%)
                  </div>
                </div>
              )}
            </div>

            <QuickPicks onSelect={handleSymbolChange} />

            {profile.isLoading && <LoadingBar />}

            {profile.error && (
              <div className="text-[13px] font-mono text-rose">
                {(profile.error as Error).message}
              </div>
            )}

            {compareHistory.error && (
              <div className="text-[13px] font-mono text-rose">
                Compare: {(compareHistory.error as Error).message}
              </div>
            )}
          </div>

          {/* Main content */}
          <div className="space-y-6">
            {/* Profile / Metadata */}
            {profile.data && (
              <div className="glass-bright rounded-xl overflow-hidden animate-fade-up">
                <div className="px-5 py-3 border-b border-border-subtle">
                  <h2 className="text-[14px] font-semibold text-text-primary">
                    {symbol} — {profile.data.registry.underlyingIndex}
                  </h2>
                  <p className="text-[11px] text-text-tertiary mt-0.5">
                    Fund profile and trailing returns
                  </p>
                </div>
                <div className="p-4">
                  <LetfMetadataCard data={profile.data} />
                </div>
              </div>
            )}

            {/* Historical Performance */}
            {history.data && (
              <div className="glass-bright rounded-xl overflow-hidden animate-fade-up">
                <div className="px-5 py-3 border-b border-border-subtle">
                  <h2 className="text-[14px] font-semibold text-text-primary">
                    Historical Performance
                  </h2>
                  <p className="text-[11px] text-text-tertiary mt-0.5">
                    {symbol} vs {history.data.underlying} vs naive {Math.abs(history.data.leverageFactor)}x return
                    {compareSymbol && ` vs ${compareSymbol}`}
                  </p>
                </div>
                <div className="p-4">
                  <PerformanceChart
                    data={history.data}
                    period={period}
                    onPeriodChange={setPeriod}
                    compareData={compareHistory.data}
                    compareSymbol={compareSymbol ?? undefined}
                  />
                </div>
              </div>
            )}

            {history.isLoading && (
              <div className="glass-bright rounded-xl p-8 flex items-center justify-center">
                <div className="text-center">
                  <div className="inline-block w-6 h-6 border-2 border-accent/30 border-t-accent-bright rounded-full animate-spin mb-3" />
                  <div className="text-[13px] text-text-tertiary font-mono">Loading historical data...</div>
                </div>
              </div>
            )}

            {/* Holdings */}
            {holdings.data && (
              <div className="glass-bright rounded-xl overflow-hidden animate-fade-up">
                <div className="px-5 py-3 border-b border-border-subtle">
                  <h2 className="text-[14px] font-semibold text-text-primary">
                    Underlying Holdings
                  </h2>
                  <p className="text-[11px] text-text-tertiary mt-0.5">
                    Top holdings, concentration, and sector allocation
                  </p>
                </div>
                <div className="p-4">
                  <HoldingsTable data={holdings.data} />
                </div>
              </div>
            )}

            {/* Decay Simulator */}
            <div className="glass-bright rounded-xl overflow-hidden animate-fade-up">
              <div className="px-5 py-3 border-b border-border-subtle">
                <h2 className="text-[14px] font-semibold text-text-primary">
                  Volatility Decay Simulator
                </h2>
                <p className="text-[11px] text-text-tertiary mt-0.5">
                  Model the rebalancing drag from daily leverage reset — drag = L(L−1)/2 × σ²
                </p>
              </div>
              <div className="p-4">
                <DecaySimulator defaultLeverage={Math.abs(leverageFactor)} />
              </div>
            </div>

            {/* Monte Carlo */}
            <div className="glass-bright rounded-xl overflow-hidden animate-fade-up">
              <div className="px-5 py-3 border-b border-border-subtle">
                <h2 className="text-[14px] font-semibold text-text-primary">
                  Path Dependency — Monte Carlo
                </h2>
                <p className="text-[11px] text-text-tertiary mt-0.5">
                  1,000 simulated paths showing the distribution of LETF outcomes vs. naive expectation
                </p>
              </div>
              <div className="p-4">
                <MonteCarloChart defaultLeverage={Math.abs(leverageFactor)} />
              </div>
            </div>

            {/* Red Day Table */}
            <div className="glass-bright rounded-xl overflow-hidden animate-fade-up">
              <div className="px-5 py-3 border-b border-border-subtle">
                <h2 className="text-[14px] font-semibold text-text-primary">
                  Red Day Threshold
                </h2>
                <p className="text-[11px] text-text-tertiary mt-0.5">
                  Percentage of investment remaining after consecutive down days at {Math.abs(leverageFactor)}x leverage
                </p>
              </div>
              <div className="p-4">
                <RedDayTable leverageFactor={leverageFactor} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export default function LetfPage() {
  return (
    <Suspense fallback={null}>
      <LetfContent />
    </Suspense>
  );
}
