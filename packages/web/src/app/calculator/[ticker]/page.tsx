'use client';

import { useState, useCallback, useEffect, useMemo, Suspense } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { Navbar } from '@/components/navbar';
import { useQuote, useChainGrid, useLeverage, useVolatility, useFundamentals } from '@/lib/hooks';
import { LeverageChart } from '@/components/calculator/leverage-chart';
import { LeverageHeatmap, type HeatmapMode } from '@/components/calculator/leverage-heatmap';
import { GreeksPanel } from '@/components/calculator/greeks-panel';
import { ScenarioTable } from '@/components/calculator/scenario-table';
import { IvAnalysis } from '@/components/calculator/iv-analysis';
import { FundamentalsPanel } from '@/components/calculator/fundamentals-panel';
import { RollingAnalyzer } from '@/components/calculator/rolling-analyzer';
import { StrategyTimeline } from '@/components/calculator/strategy-timeline';
import { ThetaGrid } from '@/components/calculator/theta-grid';
import { GlossaryPanel } from '@/components/calculator/glossary-panel';
import type { OptionType, OptionContract } from '@inktrade/engine/math';

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
        placeholder="AAPL"
        className="flex-1 glass rounded-lg px-4 py-2.5 text-[15px] font-mono text-text-primary placeholder:text-text-muted bg-transparent outline-none focus:border-accent/40 transition-colors"
      />
      <button
        type="submit"
        className="px-5 py-2.5 rounded-lg bg-accent/15 text-accent-bright text-[13px] font-semibold border border-accent/30 hover:bg-accent/25 transition-colors"
      >
        Load
      </button>
    </form>
  );
}

function HelpIcon({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center justify-center w-4.5 h-4.5 rounded-full border border-border-subtle text-text-muted hover:text-accent-bright hover:border-accent/40 transition-colors ml-1.5 -translate-y-px"
      title="Open glossary"
    >
      <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
        <path d="M6.5 6.5C6.5 5.67 7.17 5 8 5C8.83 5 9.5 5.67 9.5 6.5C9.5 7.17 9 7.5 8.5 7.75C8.17 7.92 8 8.17 8 8.5V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="8" cy="10.5" r="0.6" fill="currentColor" />
      </svg>
    </button>
  );
}

function LoadingBar() {
  return (
    <div className="h-1 w-full bg-surface-raised rounded-full overflow-hidden">
      <div className="h-full bg-accent/40 rounded-full animate-pulse" style={{ width: '60%' }} />
    </div>
  );
}

function CalculatorLoading() {
  return (
    <div className="min-h-screen bg-void">
      <Navbar />
      <main className="pt-24 pb-16 px-4 sm:px-6">
        <div className="mx-auto max-w-[1400px]">
          <div className="mb-8">
            <h1 className="font-display text-3xl md:text-4xl tracking-[-0.02em] text-text-primary">
              Options Calculator
            </h1>
            <p className="mt-2 text-[14px] text-text-secondary">
              Analyze leverage, Greeks, P&L, and IV across strikes and expirations
            </p>
          </div>
          <div className="glass-bright rounded-xl p-5 mb-6">
            <LoadingBar />
          </div>
        </div>
      </main>
    </div>
  );
}

function CalculatorRouter() {
  const params = useParams();
  const ticker = ((params.ticker as string) ?? 'MU').toUpperCase();
  return <Calculator key={ticker} symbol={ticker} />;
}

function Calculator({ symbol }: { symbol: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [optionType, setOptionType] = useState<OptionType>(
    () => (searchParams.get('type') as OptionType) || 'call'
  );
  const [selectedStrike, setSelectedStrike] = useState<number | null>(null);
  const [selectedExpiry, setSelectedExpiry] = useState<string | undefined>();
  const [targetPrice, setTargetPrice] = useState<number | null>(
    () => {
      const t = searchParams.get('target');
      return t ? parseFloat(t) : null;
    }
  );
  const [targetInput, setTargetInput] = useState<string>(
    () => searchParams.get('target') ?? ''
  );
  const [heatmapMode, setHeatmapMode] = useState<HeatmapMode>('leverage');
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [expOffset, setExpOffset] = useState(0);

  const quote = useQuote(symbol);
  const chain = useChainGrid(symbol, { type: optionType, offset: expOffset, limit: 6 });
  const volatility = useVolatility(symbol);
  const fundamentals = useFundamentals(symbol);
  const leverage = useLeverage({
    symbol: selectedStrike ? symbol : null,
    strike: selectedStrike,
    type: optionType,
    expiry: selectedExpiry,
    rangePct: 30,
  });

  // Sync state to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (optionType !== 'call') params.set('type', optionType);
    if (targetPrice !== null) params.set('target', String(Math.round(targetPrice * 100) / 100));
    const qs = params.toString();
    window.history.replaceState(null, '', `/calculator/${symbol}${qs ? `?${qs}` : ''}`);
  }, [symbol, optionType, targetPrice]);

  useEffect(() => {
    if (quote.data && targetPrice === null) {
      const defaultTarget = Math.round(quote.data.price * 1.1 * 100) / 100;
      setTargetPrice(defaultTarget);
      setTargetInput(defaultTarget.toFixed(2));
    }
  }, [quote.data, targetPrice]);

  const contracts = optionType === 'call'
    ? (chain.data?.calls ?? [])
    : (chain.data?.puts ?? []);

  const selectedContract = selectedStrike
    ? contracts.find((c) => {
        if (c.strike !== selectedStrike) return false;
        if (selectedExpiry) {
          return new Date(c.expiration).toISOString().slice(0, 10) === selectedExpiry;
        }
        return true;
      })
    : null;

  const atmContract = useMemo(() => {
    if (!contracts.length || !chain.data) return null;
    const price = chain.data.underlyingPrice;
    return contracts.reduce((best, c) =>
      Math.abs(c.strike - price) < Math.abs(best.strike - price) ? c : best
    );
  }, [contracts, chain.data]);

  const currentIv = selectedContract?.greeks.impliedVolatility
    ?? atmContract?.greeks.impliedVolatility
    ?? 0.3;

  const handleSelectContract = useCallback((contract: OptionContract) => {
    setSelectedStrike(contract.strike);
    const expStr = new Date(contract.expiration).toISOString().slice(0, 10);
    setSelectedExpiry(expStr);
  }, []);

  const handleSymbolChange = useCallback((s: string) => {
    router.push(`/calculator/${s.toUpperCase()}`);
  }, [router]);

  const handleTargetSubmit = useCallback(() => {
    const parsed = parseFloat(targetInput);
    if (!isNaN(parsed) && parsed > 0) {
      setTargetPrice(parsed);
    }
  }, [targetInput]);

  const applyTargetPreset = useCallback((pct: number) => {
    if (!quote.data) return;
    const price = Math.round(quote.data.price * (1 + pct / 100) * 100) / 100;
    setTargetPrice(price);
    setTargetInput(price.toFixed(2));
  }, [quote.data]);

  return (
    <div className="min-h-screen bg-void">
      <Navbar />

      <main className="pt-24 pb-16 px-4 sm:px-6">
        <div className="mx-auto max-w-[1400px]">
          {/* Page header */}
          <div className="mb-8 flex items-start justify-between">
            <div>
              <h1 className="font-display text-3xl md:text-4xl tracking-[-0.02em] text-text-primary">
                Options Calculator
              </h1>
              <p className="mt-2 text-[14px] text-text-secondary">
                Analyze leverage, Greeks, P&L, and IV across strikes and expirations
              </p>
            </div>
            <button
              onClick={() => setGlossaryOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg glass text-[12px] font-medium text-text-secondary hover:text-text-primary transition-colors mt-1"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
                <path d="M6.5 6.5C6.5 5.67 7.17 5 8 5C8.83 5 9.5 5.67 9.5 6.5C9.5 7.17 9 7.5 8.5 7.75C8.17 7.92 8 8.17 8 8.5V9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                <circle cx="8" cy="10.5" r="0.5" fill="currentColor" />
              </svg>
              Glossary
            </button>
          </div>

          {/* Top bar: symbol + quote + target + controls */}
          <div className="glass-bright rounded-xl p-5 mb-6">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_auto_auto] gap-4 items-end">
              {/* Symbol input */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-tertiary mb-2">
                  Underlying
                </label>
                <SymbolInput value={symbol} onSubmit={handleSymbolChange} />
              </div>

              {/* Target price input */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-tertiary mb-2">
                  Price Target
                  <span className="text-text-muted font-normal normal-case tracking-normal ml-1">
                    — leverage calculated at this price
                  </span>
                </label>
                <div className="flex gap-2">
                  <div className="flex-1 flex items-center glass rounded-lg px-3">
                    <span className="text-text-muted text-[14px] font-mono mr-1">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={targetInput}
                      onChange={(e) => setTargetInput(e.target.value)}
                      onBlur={handleTargetSubmit}
                      onKeyDown={(e) => e.key === 'Enter' && handleTargetSubmit()}
                      placeholder={quote.data ? (quote.data.price * 1.1).toFixed(2) : '0.00'}
                      className="flex-1 py-2.5 text-[15px] font-mono text-text-primary placeholder:text-text-muted bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                  <div className="flex gap-1">
                    {[5, 10, 15, 20].map((pct) => (
                      <button
                        key={pct}
                        onClick={() => applyTargetPreset(optionType === 'put' ? -pct : pct)}
                        className={`px-2 py-2.5 rounded-md text-[11px] font-mono font-medium transition-colors ${
                          quote.data && targetPrice && Math.abs(
                            targetPrice / quote.data.price - 1 - (optionType === 'put' ? -pct : pct) / 100
                          ) < 0.001
                            ? 'bg-violet/15 text-violet border border-violet/30'
                            : 'text-text-muted hover:text-text-secondary hover:bg-surface/40'
                        }`}
                      >
                        {optionType === 'put' ? '-' : '+'}{pct}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Call / Put toggle */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-tertiary mb-2">
                  Type
                </label>
                <div className="flex gap-1 glass rounded-lg p-1">
                  {(['call', 'put'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => {
                        setOptionType(t);
                        setSelectedStrike(null);
                        setExpOffset(0);
                        if (quote.data) {
                          const pct = t === 'put' ? 0.9 : 1.1;
                          const price = Math.round(quote.data.price * pct * 100) / 100;
                          setTargetPrice(price);
                          setTargetInput(price.toFixed(2));
                        }
                      }}
                      className={`px-4 py-2 rounded-md text-[13px] font-mono font-medium transition-all ${
                        optionType === t
                          ? t === 'call'
                            ? 'bg-emerald/15 text-emerald-bright border border-emerald/30'
                            : 'bg-rose/15 text-rose border border-rose/30'
                          : 'text-text-muted hover:text-text-secondary'
                      }`}
                    >
                      {t === 'call' ? 'Call' : 'Put'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quote display */}
              {quote.data && (
                <div className="text-right">
                  <div className="text-[22px] font-mono font-bold text-text-primary">
                    ${quote.data.price.toFixed(2)}
                  </div>
                  <div className={`text-[13px] font-mono font-medium ${
                    quote.data.change >= 0 ? 'text-emerald' : 'text-rose'
                  }`}>
                    {quote.data.change >= 0 ? '+' : ''}{quote.data.change.toFixed(2)}{' '}
                    ({quote.data.changePercent >= 0 ? '+' : ''}{quote.data.changePercent.toFixed(2)}%)
                  </div>
                </div>
              )}
            </div>

            {(quote.isLoading || chain.isLoading) && <div className="mt-3"><LoadingBar /></div>}

            {quote.error && (
              <div className="mt-3 text-[13px] font-mono text-rose">
                {(quote.error as Error).message}
              </div>
            )}
          </div>

          {/* Main content */}
          <div className="space-y-6">
              {/* Leverage Heatmap — primary view */}
              <div className="glass-bright rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
                  <div>
                    <h2 className="text-[14px] font-semibold text-text-primary inline-flex items-center">
                      {heatmapMode === 'leverage' ? 'Leverage Grid' : 'Probability of Profit Grid'}
                      <HelpIcon onClick={() => setGlossaryOpen(true)} />
                    </h2>
                    <p className="text-[11px] text-text-tertiary mt-0.5">
                      {heatmapMode === 'leverage' ? (
                        <>
                          Leverage at{' '}
                          <span className="text-violet font-medium">
                            ${targetPrice?.toFixed(0) ?? '—'} target
                          </span>
                          {quote.data && targetPrice && (
                            <span className="text-text-muted">
                              {' '}({((targetPrice / quote.data.price - 1) * 100).toFixed(1)}% {targetPrice >= quote.data.price ? 'above' : 'below'} current)
                            </span>
                          )}
                        </>
                      ) : (
                        'Black-Scholes probability of profit at expiration'
                      )}
                      {' · '}Click a cell to drill in
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {chain.isLoading && (
                      <span className="text-[11px] font-mono text-text-muted animate-pulse">Loading...</span>
                    )}
                    {/* Mode toggle */}
                    <div className="flex gap-1 glass rounded-lg p-0.5">
                      {([
                        { key: 'leverage' as const, label: 'Leverage' },
                        { key: 'probability' as const, label: 'Prob.' },
                      ]).map(({ key, label }) => (
                        <button
                          key={key}
                          onClick={() => setHeatmapMode(key)}
                          className={`px-3 py-1.5 rounded-md text-[11px] font-mono font-medium transition-all ${
                            heatmapMode === key
                              ? 'bg-accent/15 text-accent-bright border border-accent/30'
                              : 'text-text-muted hover:text-text-secondary'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="p-4">
                  {chain.data && targetPrice ? (
                    <LeverageHeatmap
                      contracts={contracts}
                      underlyingPrice={chain.data.underlyingPrice}
                      targetPrice={targetPrice}
                      optionType={optionType}
                      mode={heatmapMode}
                      onSelectContract={handleSelectContract}
                      selectedStrike={selectedStrike}
                      selectedExpiry={selectedExpiry ?? null}
                      allExpirations={chain.data.allExpirations ?? chain.data.expirations}
                      expOffset={expOffset}
                      onExpOffsetChange={setExpOffset}
                      isLoadingExps={chain.isFetching}
                    />
                  ) : chain.error ? (
                    <div className="flex items-center justify-center h-48 text-rose text-[13px] font-mono">
                      {(chain.error as Error).message}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-48 text-text-muted text-[13px]">
                      {chain.isLoading ? 'Loading chain data...' : 'Enter a symbol to load the chain'}
                    </div>
                  )}
                </div>
              </div>

              {/* Selected Contract + Leverage Surface — side by side */}
              {selectedContract && (
                <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-6 animate-fade-up">
                  {/* Contract details card */}
                  <div className="glass-bright rounded-xl p-5 space-y-4">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-tertiary mb-1">
                        Selected Contract
                      </div>
                      <div className="text-[16px] font-mono font-bold text-text-primary">
                        {symbol} ${selectedContract.strike.toFixed(selectedContract.strike % 1 === 0 ? 0 : 2)}{optionType === 'call' ? 'C' : 'P'}
                      </div>
                      <div className="text-[12px] font-mono text-text-secondary mt-0.5">
                        Exp: {new Date(selectedContract.expiration).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                        {' · '}{selectedContract.daysToExpiration}d
                      </div>
                    </div>

                    <div className="hr-gradient" />

                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-[12px] text-text-tertiary">Bid</span>
                        <span className="text-[13px] font-mono text-text-primary">${selectedContract.bid.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[12px] text-text-tertiary">Ask</span>
                        <span className="text-[13px] font-mono text-text-primary">${selectedContract.ask.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[12px] text-text-tertiary">Mark</span>
                        <span className="text-[13px] font-mono font-semibold text-text-primary">${selectedContract.mark.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[12px] text-text-tertiary">Last</span>
                        <span className="text-[13px] font-mono text-text-primary">${selectedContract.last.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="hr-gradient" />

                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-[12px] text-text-tertiary">Volume</span>
                        <span className="text-[13px] font-mono text-text-primary">
                          {selectedContract.volume.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[12px] text-text-tertiary">Open Interest</span>
                        <span className="text-[13px] font-mono text-text-primary">
                          {selectedContract.openInterest.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[12px] text-text-tertiary">ITM</span>
                        <span className={`text-[13px] font-mono font-medium ${
                          selectedContract.inTheMoney ? 'text-emerald' : 'text-text-muted'
                        }`}>
                          {selectedContract.inTheMoney ? 'Yes' : 'No'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[12px] text-text-tertiary">IV</span>
                        <span className="text-[13px] font-mono font-medium text-violet">
                          {(selectedContract.greeks.impliedVolatility * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>

                    <div className="hr-gradient" />

                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-tertiary mb-3">
                        Greeks
                      </div>
                      <GreeksPanel greeks={
                        leverage.data
                          ? leverage.data.surface.points[Math.floor(leverage.data.surface.points.length / 2)]?.greeks ?? selectedContract.greeks
                          : selectedContract.greeks
                      } compact />
                    </div>
                  </div>

                  {/* Leverage Surface chart */}
                  <div className="glass-bright rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
                      <div>
                        <h2 className="text-[14px] font-semibold text-text-primary">
                          Leverage Surface
                        </h2>
                        <p className="text-[11px] text-text-tertiary mt-0.5">
                          {symbol} ${selectedStrike}{optionType === 'call' ? 'C' : 'P'}
                          {selectedExpiry && ` · ${new Date(selectedExpiry + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                          {' · '}Effective leverage vs. underlying price
                        </p>
                      </div>
                    </div>
                    {leverage.data ? (
                      <>
                        <div className="p-4">
                          <LeverageChart analysis={leverage.data} targetPrice={targetPrice ?? undefined} />
                        </div>
                        <div className="flex items-center gap-6 px-5 pb-4">
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-0.5 rounded-full bg-accent-bright" />
                            <span className="text-[11px] text-text-tertiary">Effective Leverage</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-0.5 rounded-full bg-emerald opacity-70" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 3px, var(--color-deep) 3px, var(--color-deep) 5px)' }} />
                            <span className="text-[11px] text-text-tertiary">P&L %</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber" />
                            <span className="text-[11px] text-text-tertiary">Breakeven</span>
                          </div>
                          {targetPrice && (
                            <div className="flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-violet" />
                              <span className="text-[11px] text-text-tertiary">Target ${targetPrice.toFixed(0)}</span>
                            </div>
                          )}
                        </div>
                      </>
                    ) : leverage.isLoading ? (
                      <div className="flex items-center justify-center h-[300px]">
                        <div className="text-center">
                          <div className="inline-block w-6 h-6 border-2 border-accent/30 border-t-accent-bright rounded-full animate-spin mb-3" />
                          <div className="text-[13px] text-text-tertiary font-mono">Computing leverage surface...</div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}

              {!selectedContract && (
                <div className="glass rounded-xl p-6 text-center">
                  <div className="text-text-muted mb-2">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="mx-auto opacity-40">
                      <path d="M3 12L12 3L21 12M5 10V20H19V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <p className="text-[13px] text-text-tertiary">
                    Select a contract from the grid to see details and leverage analysis
                  </p>
                </div>
              )}

              {/* Scenario Analysis */}
              {leverage.data && (
                <div className="glass-bright rounded-xl overflow-hidden animate-fade-up">
                  <div className="px-5 py-3 border-b border-border-subtle">
                    <h2 className="text-[14px] font-semibold text-text-primary">
                      Scenario Analysis
                    </h2>
                    <p className="text-[11px] text-text-tertiary mt-0.5">
                      Leverage, P&L, and probability at target prices
                    </p>
                  </div>
                  <div className="p-4">
                    <ScenarioTable analysis={leverage.data} />
                  </div>
                </div>
              )}

              {/* Theta Decay Grid */}
              {selectedContract && quote.data && (
                <div className="glass-bright rounded-xl overflow-hidden animate-fade-up">
                  <div className="px-5 py-3 border-b border-border-subtle">
                    <h2 className="text-[14px] font-semibold text-text-primary inline-flex items-center">
                      Theta Decay
                      <HelpIcon onClick={() => setGlossaryOpen(true)} />
                    </h2>
                    <p className="text-[11px] text-text-tertiary mt-0.5">
                      Hold vs. close — how much theta you collect against adverse delta moves over the next week
                    </p>
                  </div>
                  <div className="p-4">
                    <ThetaGrid
                      spotPrice={quote.data.price}
                      strike={selectedContract.strike}
                      optionType={optionType}
                      iv={selectedContract.greeks.impliedVolatility}
                      dte={selectedContract.daysToExpiration}
                      mark={selectedContract.mark}
                    />
                  </div>
                </div>
              )}

              {/* IV Analysis */}
              {volatility.data && (
                <div className="glass-bright rounded-xl overflow-hidden animate-fade-up">
                  <div className="px-5 py-3 border-b border-border-subtle">
                    <h2 className="text-[14px] font-semibold text-text-primary inline-flex items-center">
                      Volatility Analysis
                      <HelpIcon onClick={() => setGlossaryOpen(true)} />
                    </h2>
                    <p className="text-[11px] text-text-tertiary mt-0.5">
                      Historical vs. implied volatility
                    </p>
                  </div>
                  <div className="p-4">
                    <IvAnalysis
                      volatility={volatility.data}
                      currentIv={currentIv}
                      symbol={symbol}
                    />
                  </div>
                </div>
              )}

              {/* Rolling Strategy Analyzer */}
              {quote.data && (
                <div className="glass-bright rounded-xl overflow-hidden animate-fade-up">
                  <div className="px-5 py-3 border-b border-border-subtle">
                    <h2 className="text-[14px] font-semibold text-text-primary inline-flex items-center">
                      Rolling Strategy Optimizer
                      <HelpIcon onClick={() => setGlossaryOpen(true)} />
                    </h2>
                    <p className="text-[11px] text-text-tertiary mt-0.5">
                      Find the optimal entry DTE and roll point — maximize leverage per dollar of theta
                    </p>
                  </div>
                  <div className="p-4">
                    <RollingAnalyzer
                      spotPrice={quote.data.price}
                      iv={currentIv}
                      optionType={optionType}
                    />
                  </div>
                </div>
              )}

              {/* Strategy Timeline — target-aware comparison */}
              {quote.data && targetPrice && (
                <div className="glass-bright rounded-xl overflow-hidden animate-fade-up">
                  <div className="px-5 py-3 border-b border-border-subtle">
                    <h2 className="text-[14px] font-semibold text-text-primary inline-flex items-center">
                      Strategy Timeline
                      <HelpIcon onClick={() => setGlossaryOpen(true)} />
                    </h2>
                    <p className="text-[11px] text-text-tertiary mt-0.5">
                      If {symbol} hits ${targetPrice.toFixed(0)}, what's your return at each time horizon — net of rolling costs
                    </p>
                  </div>
                  <div className="p-4">
                    <StrategyTimeline
                      spotPrice={quote.data.price}
                      targetPrice={targetPrice}
                      strike={selectedStrike ?? Math.round(targetPrice)}
                      iv={currentIv}
                      optionType={optionType}
                    />
                  </div>
                </div>
              )}

              {fundamentals.data && quote.data && (
                <div className="glass-bright rounded-xl overflow-hidden animate-fade-up">
                  <div className="px-5 py-3 border-b border-border-subtle">
                    <h2 className="text-[14px] font-semibold text-text-primary inline-flex items-center">
                      Fundamentals
                      <HelpIcon onClick={() => setGlossaryOpen(true)} />
                    </h2>
                    <p className="text-[11px] text-text-tertiary mt-0.5">
                      Quarterly financials and market cap analysis
                    </p>
                  </div>
                  <div className="p-4">
                    <FundamentalsPanel
                      data={fundamentals.data}
                      targetPrice={targetPrice}
                      symbol={symbol}
                    />
                  </div>
                </div>
              )}
          </div>
        </div>
      </main>

      <GlossaryPanel open={glossaryOpen} onClose={() => setGlossaryOpen(false)} />
    </div>
  );
}

export default function CalculatorPage() {
  return (
    <Suspense fallback={<CalculatorLoading />}>
      <CalculatorRouter />
    </Suspense>
  );
}
