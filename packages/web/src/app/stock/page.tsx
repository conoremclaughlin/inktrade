'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { TradingChart } from '@/components/stock/trading-chart';
import { OIDistributionChart } from '@/components/stock/oi-chart';
import { OrderActivityPanel } from '@/components/stock/order-activity';
import { LevelsPanel } from '@/components/stock/levels-panel';
import { ThetaDecayChart } from '@/components/stock/theta-decay-chart';
import { useQuote, useTickerHistory } from '@/lib/hooks';

const PERIODS = ['1M', '3M', '6M', '1Y', '2Y', '5Y'] as const;
const PERIOD_MAP: Record<string, string> = {
  '1M': '1mo', '3M': '3mo', '6M': '6mo', '1Y': '1y', '2Y': '2y', '5Y': '5y',
};

const POPULAR = [
  { symbol: 'SPY', label: 'S&P 500' },
  { symbol: 'QQQ', label: 'NASDAQ-100' },
  { symbol: 'NVDA', label: 'NVIDIA' },
  { symbol: 'AAPL', label: 'Apple' },
  { symbol: 'MU', label: 'Micron' },
  { symbol: 'FMTM', label: 'Momentum' },
  { symbol: 'SOXX', label: 'Semis' },
  { symbol: 'SMH', label: 'VanEck Semis' },
];

function formatPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

/**
 * useSearchParams opts its subtree out of prerendering, so the page body sits
 * behind a Suspense boundary — see the default export below.
 */
function StockContent() {
  const searchParams = useSearchParams();

  const [symbol, setSymbol] = useState(
    () => searchParams.get('symbol')?.toUpperCase() || 'SPY'
  );
  const [input, setInput] = useState(
    () => searchParams.get('symbol')?.toUpperCase() || 'SPY'
  );
  const [period, setPeriod] = useState<string>(
    () => searchParams.get('period')?.toUpperCase() || '1Y'
  );

  useEffect(() => {
    const params = new URLSearchParams();
    if (symbol !== 'SPY') params.set('symbol', symbol);
    if (period !== '1Y') params.set('period', period);
    const qs = params.toString();
    window.history.replaceState(null, '', `/stock${qs ? `?${qs}` : ''}`);
  }, [symbol, period]);

  const quote = useQuote(symbol);
  const history = useTickerHistory(symbol, PERIOD_MAP[period] ?? '1y');

  const handleSubmit = (s?: string) => {
    const val = (s ?? input).trim().toUpperCase();
    if (val) {
      setSymbol(val);
      setInput(val);
    }
  };

  return (
    <AppShell activeSymbol={symbol} onSymbolClick={handleSubmit}>
      <div className="pb-16 px-4 sm:px-6 pt-8">
        <div className="mx-auto max-w-[1200px]">
          {/* Header */}
          <div className="mb-8">
            <h1 className="font-display text-3xl md:text-4xl tracking-[-0.02em] text-text-primary">
              Stock Performance
            </h1>
            <p className="mt-2 text-[14px] text-text-secondary">
              Historical price, returns, and drawdowns for any ticker
            </p>
          </div>

          {/* Symbol input + quote */}
          <div className="glass-bright rounded-xl p-5 mb-6">
            <div className="flex items-end gap-4 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-tertiary mb-2">
                  Ticker
                </label>
                <form
                  onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value.toUpperCase())}
                    placeholder="SPY"
                    className="flex-1 glass rounded-lg px-4 py-2.5 text-[15px] font-mono text-text-primary placeholder:text-text-muted bg-transparent outline-none focus:border-accent/40 transition-colors"
                  />
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-lg bg-accent/15 text-accent-bright text-[13px] font-semibold border border-accent/30 hover:bg-accent/25 transition-colors"
                  >
                    Load
                  </button>
                </form>
              </div>

              {/* Quote display */}
              {quote.data && (
                <div className="text-right">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-tertiary mb-1">
                    {symbol}
                  </div>
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

            {/* Quick picks */}
            <div className="flex items-center gap-2 mt-4 flex-wrap">
              {POPULAR.map(({ symbol: s, label }) => (
                <button
                  key={s}
                  onClick={() => handleSubmit(s)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-mono font-medium transition-all border ${
                    symbol === s
                      ? 'bg-accent/15 text-accent-bright border-accent/30'
                      : 'border-border-subtle text-text-muted hover:text-text-secondary hover:border-border-subtle/80'
                  }`}
                >
                  <span className="font-semibold">{s}</span>
                  <span className="text-text-tertiary ml-1">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Performance chart */}
          <div className="glass-bright rounded-xl overflow-hidden mb-6">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
              <div>
                <h2 className="text-[14px] font-semibold text-text-primary">
                  {symbol} — Price History
                </h2>
                <p className="text-[11px] text-text-tertiary mt-0.5">
                  Closing price and cumulative return
                </p>
              </div>
              <div className="flex gap-1 glass rounded-lg p-0.5">
                {PERIODS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-medium transition-all ${
                      period === p
                        ? 'bg-accent/15 text-accent-bright border border-accent/30'
                        : 'text-text-muted hover:text-text-secondary'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-4">
              {history.data ? (
                <TradingChart data={history.data} symbol={symbol} height={500} />
              ) : history.isLoading ? (
                <div className="flex items-center justify-center h-[400px]">
                  <div className="text-center">
                    <div className="inline-block w-6 h-6 border-2 border-accent/30 border-t-accent-bright rounded-full animate-spin mb-3" />
                    <div className="text-[13px] text-text-tertiary font-mono">Loading history...</div>
                  </div>
                </div>
              ) : history.error ? (
                <div className="flex items-center justify-center h-[200px] text-rose text-[13px] font-mono">
                  {(history.error as Error).message}
                </div>
              ) : null}
            </div>
          </div>

          {/* Stats grid */}
          {history.data && quote.data && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              <div className="glass rounded-xl px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-1">
                  Period Return
                </div>
                <div className={`text-[18px] font-mono font-bold ${
                  history.data.totalReturn >= 0 ? 'text-emerald' : 'text-rose'
                }`}>
                  {formatPct(history.data.totalReturn)}
                </div>
              </div>

              <div className="glass rounded-xl px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-1">
                  Annualized
                </div>
                <div className={`text-[18px] font-mono font-bold ${
                  history.data.annualizedReturn >= 0 ? 'text-emerald' : 'text-rose'
                }`}>
                  {formatPct(history.data.annualizedReturn)}
                </div>
              </div>

              <div className="glass rounded-xl px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-1">
                  Max Drawdown
                </div>
                <div className="text-[18px] font-mono font-bold text-rose">
                  -{history.data.maxDrawdownPct.toFixed(1)}%
                </div>
              </div>

              <div className="glass rounded-xl px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-1">
                  Current Price
                </div>
                <div className="text-[18px] font-mono font-bold text-text-primary">
                  ${quote.data.price.toFixed(2)}
                </div>
              </div>

              <div className="glass rounded-xl px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-1">
                  Today
                </div>
                <div className={`text-[18px] font-mono font-bold ${
                  quote.data.change >= 0 ? 'text-emerald' : 'text-rose'
                }`}>
                  {formatPct(quote.data.changePercent)}
                </div>
              </div>

              <div className="glass rounded-xl px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted mb-1">
                  Data Points
                </div>
                <div className="text-[18px] font-mono font-bold text-text-primary">
                  {history.data.points.length}
                </div>
              </div>
            </div>
          )}

          {/*
            Your own orders in this name, above the market-wide charts: what
            you did matters more than what everyone else did.
          */}
          {/*
            Levels read as a summary of the chart above, so they sit directly
            under it — before your own orders and well before the market-wide
            open-interest charts.
          */}
          {history.data && (
            <div className="mt-6">
              <LevelsPanel
                points={history.data.points}
                price={history.data.points[history.data.points.length - 1]?.close ?? null}
              />
            </div>
          )}

          <div className="mt-6">
            <OrderActivityPanel symbol={symbol} />
          </div>

          {/* Theta Decay Projection */}
          {quote.data && (
            <div className="glass-bright rounded-xl overflow-hidden mt-6">
              <div className="px-5 py-3 border-b border-border-subtle">
                <h2 className="text-[14px] font-semibold text-text-primary">
                  {symbol} — Credit Spread Theta Decay
                </h2>
                <p className="text-[11px] text-text-tertiary mt-0.5">
                  Close or hold? Project daily theta gain vs gamma risk through expiration
                </p>
              </div>
              <div className="p-4">
                <ThetaDecayChart spotPrice={quote.data.price} />
              </div>
            </div>
          )}

          {/* OI Distribution */}
          <div className="glass-bright rounded-xl overflow-hidden mt-6">
            <div className="px-5 py-3 border-b border-border-subtle">
              <h2 className="text-[14px] font-semibold text-text-primary">
                {symbol} — Options Open Interest
              </h2>
              <p className="text-[11px] text-text-tertiary mt-0.5">
                Call and put positioning by strike — see where the market is concentrated
              </p>
            </div>
            <div className="p-4">
              <OIDistributionChart symbol={symbol} />
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export default function StockPage() {
  return (
    <Suspense fallback={null}>
      <StockContent />
    </Suspense>
  );
}
