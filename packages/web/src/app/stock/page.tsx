'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Bar,
} from 'recharts';
import { useSearchParams } from 'next/navigation';
import { Navbar } from '@/components/navbar';
import { OIDistributionChart } from '@/components/stock/oi-chart';
import { ThetaDecayChart } from '@/components/stock/theta-decay-chart';
import { useQuote, useTickerHistory, type TickerHistoryResponse } from '@/lib/hooks';

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

function formatLargeNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

function formatVolume(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}

function PriceChart({ data, symbol }: { data: TickerHistoryResponse; symbol: string }) {
  const chartData = useMemo(() => {
    return data.points.map((p, i) => {
      const prevClose = i > 0 ? data.points[i - 1].close : p.close;
      return {
        date: p.date,
        close: p.close,
        cumReturn: p.cumReturn,
        volume: p.volume,
        volumeUp: p.close >= prevClose,
      };
    });
  }, [data.points]);

  const isPositive = data.totalReturn >= 0;

  return (
    <div className="space-y-4">
      {/* Return stats */}
      <div className="flex items-center gap-6 flex-wrap text-[12px] font-mono">
        <div className="flex items-center gap-1.5">
          <span className="text-text-muted">Return:</span>
          <span className={`font-medium ${isPositive ? 'text-emerald' : 'text-rose'}`}>
            {formatPct(data.totalReturn)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-text-muted">Annualized:</span>
          <span className={`font-medium ${data.annualizedReturn >= 0 ? 'text-emerald' : 'text-rose'}`}>
            {formatPct(data.annualizedReturn)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-text-muted">Max Drawdown:</span>
          <span className="font-medium text-rose">-{data.maxDrawdownPct.toFixed(1)}%</span>
        </div>
      </div>

      {/* Price chart */}
      <div className="w-full h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 30, bottom: 0, left: 10 }}>
            <defs>
              <linearGradient id="returnGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={isPositive ? '#10b981' : '#f43f5e'} stopOpacity={0.15} />
                <stop offset="100%" stopColor={isPositive ? '#10b981' : '#f43f5e'} stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="4 4" stroke="var(--color-border-subtle)" vertical={false} />

            <XAxis dataKey="date" hide />

            <YAxis
              yAxisId="price"
              orientation="right"
              tickFormatter={(v: number) => `$${v.toFixed(0)}`}
              tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--color-text-muted)' }}
              axisLine={false}
              tickLine={false}
              width={60}
            />

            <YAxis
              yAxisId="return"
              orientation="left"
              tickFormatter={(v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`}
              tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--color-text-muted)' }}
              axisLine={false}
              tickLine={false}
              width={55}
            />

            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload as (typeof chartData)[0];
                if (!d) return null;
                const dateStr = new Date(d.date).toLocaleDateString('en-US', {
                  month: 'short', day: 'numeric', year: 'numeric',
                });
                return (
                  <div className="bg-[#0f1629]/95 backdrop-blur-md rounded-lg px-3 py-2 shadow-xl border border-border-subtle">
                    <div className="text-[10px] font-mono text-text-secondary mb-1">{dateStr}</div>
                    <div className="text-[12px] font-mono text-text-primary font-medium">
                      {symbol}: ${d.close.toFixed(2)}
                    </div>
                    <div className={`text-[12px] font-mono font-medium ${d.cumReturn >= 0 ? 'text-emerald' : 'text-rose'}`}>
                      {formatPct(d.cumReturn)}
                    </div>
                    <div className="text-[11px] font-mono text-text-muted mt-0.5">
                      Vol: {formatVolume(d.volume)}
                    </div>
                  </div>
                );
              }}
            />

            <Area
              yAxisId="return"
              type="monotone"
              dataKey="cumReturn"
              stroke="none"
              fill="url(#returnGrad)"
              fillOpacity={1}
            />

            <Line
              yAxisId="price"
              type="monotone"
              dataKey="close"
              stroke={isPositive ? '#10b981' : '#f43f5e'}
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Volume chart */}
      <div className="w-full h-[100px] -mt-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 0, right: 30, bottom: 10, left: 10 }}>
            <XAxis
              dataKey="date"
              tickFormatter={(v: string) => {
                const d = new Date(v);
                return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
              }}
              tick={{ fontSize: 10, fontFamily: 'var(--font-mono)', fill: 'var(--color-text-muted)' }}
              axisLine={{ stroke: 'var(--color-border-subtle)' }}
              tickLine={false}
              minTickGap={40}
            />

            <YAxis
              orientation="right"
              tickFormatter={formatVolume}
              tick={{ fontSize: 9, fontFamily: 'var(--font-mono)', fill: 'var(--color-text-muted)' }}
              axisLine={false}
              tickLine={false}
              width={60}
            />

            <YAxis
              yAxisId="spacer"
              orientation="left"
              width={55}
              tick={false}
              axisLine={false}
              tickLine={false}
            />

            <Bar
              dataKey="volume"
              fill="#3b82f6"
              opacity={0.4}
              radius={[1, 1, 0, 0]}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className={`w-4 h-0.5 rounded-full ${isPositive ? 'bg-emerald' : 'bg-rose'}`} />
          <span className="text-[10px] text-text-tertiary">Price</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`w-3 h-3 rounded-sm ${isPositive ? 'bg-emerald' : 'bg-rose'} opacity-15`} />
          <span className="text-[10px] text-text-tertiary">Cumulative Return</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-accent opacity-40" />
          <span className="text-[10px] text-text-tertiary">Volume</span>
        </div>
      </div>
    </div>
  );
}

export default function StockPage() {
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
    <div className="min-h-screen bg-void">
      <Navbar />

      <main className="pt-24 pb-16 px-4 sm:px-6">
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
                <PriceChart data={history.data} symbol={symbol} />
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
      </main>
    </div>
  );
}
