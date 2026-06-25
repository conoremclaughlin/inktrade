'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import type { Quote } from '@inktrade/engine/math';
import { useWatchlistSymbols, useWatchlistQuotes } from '@/lib/hooks';
import { useUser } from '@/lib/hooks/use-auth';

type SortKey = 'symbol' | 'price' | 'change' | 'changePct' | 'volume' | 'marketCap' | 'dayRange';
type SortDir = 'asc' | 'desc';

function formatPrice(n: number): string {
  if (n >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

function formatVolume(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}

function formatMarketCap(n: number | undefined): string {
  if (!n) return '—';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

function DayRangeBar({ low, high, current }: { low: number; high: number; current: number }) {
  const range = high - low;
  const pct = range > 0 ? ((current - low) / range) * 100 : 50;
  return (
    <div className="flex items-center gap-1.5 min-w-[120px]">
      <span className="text-[10px] font-mono text-text-tertiary w-[52px] text-right">{formatPrice(low)}</span>
      <div className="relative flex-1 h-[3px] rounded-full bg-border-subtle">
        <div
          className="absolute top-1/2 -translate-y-1/2 w-[5px] h-[5px] rounded-full bg-accent-bright"
          style={{ left: `${Math.min(100, Math.max(0, pct))}%`, transform: 'translate(-50%, -50%)' }}
        />
      </div>
      <span className="text-[10px] font-mono text-text-tertiary w-[52px]">{formatPrice(high)}</span>
    </div>
  );
}

function Sparkline({ changePct }: { changePct: number }) {
  const positive = changePct >= 0;
  const width = Math.min(100, Math.abs(changePct) * 8);
  return (
    <div className="w-[60px] h-[18px] flex items-end">
      <div
        className={`h-[14px] rounded-sm ${positive ? 'bg-emerald/30' : 'bg-red-400/30'}`}
        style={{ width: `${Math.max(4, width)}%` }}
      />
    </div>
  );
}

export function WatchlistTable() {
  const { isAuthenticated, isLoading: authLoading } = useUser();
  const { symbols, addSymbol, removeSymbol, moveSymbol } = useWatchlistSymbols();
  const { data, isLoading, error } = useWatchlistQuotes(symbols);
  const [sortKey, setSortKey] = useState<SortKey>('symbol');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [addInput, setAddInput] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const addRef = useRef<HTMLInputElement>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const prevQuotesRef = useRef<Map<string, number>>(new Map());
  const [flashMap, setFlashMap] = useState<Map<string, 'up' | 'down'>>(new Map());

  const quotesMap = useMemo(() => {
    const map = new Map<string, Quote>();
    if (data?.quotes) {
      for (const q of data.quotes) map.set(q.symbol, q);
    }
    return map;
  }, [data]);

  useEffect(() => {
    if (!data?.quotes) return;
    const prev = prevQuotesRef.current;
    const newFlash = new Map<string, 'up' | 'down'>();
    const next = new Map<string, number>();
    for (const q of data.quotes) {
      const old = prev.get(q.symbol);
      if (old !== undefined && old !== q.price) {
        newFlash.set(q.symbol, q.price > old ? 'up' : 'down');
      }
      next.set(q.symbol, q.price);
    }
    prevQuotesRef.current = next;
    if (newFlash.size > 0) {
      setFlashMap(newFlash);
      const timer = setTimeout(() => setFlashMap(new Map()), 800);
      return () => clearTimeout(timer);
    }
  }, [data]);

  useEffect(() => {
    if (showAdd && addRef.current) addRef.current.focus();
  }, [showAdd]);

  const sortedSymbols = useMemo(() => {
    if (sortKey === 'symbol') {
      return sortDir === 'asc' ? [...symbols] : [...symbols].reverse();
    }
    return [...symbols].sort((a, b) => {
      const qa = quotesMap.get(a);
      const qb = quotesMap.get(b);
      if (!qa || !qb) return 0;
      let va = 0, vb = 0;
      switch (sortKey) {
        case 'price': va = qa.price; vb = qb.price; break;
        case 'change': va = qa.change; vb = qb.change; break;
        case 'changePct': va = qa.changePercent; vb = qb.changePercent; break;
        case 'volume': va = qa.volume; vb = qb.volume; break;
        case 'marketCap': va = qa.marketCap ?? 0; vb = qb.marketCap ?? 0; break;
        case 'dayRange': va = qa.high - qa.low; vb = qb.high - qb.low; break;
      }
      return sortDir === 'asc' ? va - vb : vb - va;
    });
  }, [symbols, quotesMap, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'symbol' ? 'asc' : 'desc');
    }
  }

  function handleAdd() {
    const sym = addInput.trim().toUpperCase();
    if (sym) {
      addSymbol(sym);
      setAddInput('');
    }
    setShowAdd(false);
  }

  function handleDragStart(idx: number) {
    setDragIdx(idx);
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== idx) {
      moveSymbol(dragIdx, idx);
      setDragIdx(idx);
    }
  }

  function SortHeader({ label, field, align = 'right' }: { label: string; field: SortKey; align?: 'left' | 'right' }) {
    const active = sortKey === field;
    return (
      <button
        onClick={() => handleSort(field)}
        className={`text-[10px] font-mono font-semibold uppercase tracking-[0.1em] transition-colors ${
          active ? 'text-accent-bright' : 'text-text-muted hover:text-text-secondary'
        } ${align === 'right' ? 'text-right w-full' : ''}`}
      >
        {label}
        {active && (
          <span className="ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>
        )}
      </button>
    );
  }

  if (!authLoading && !isAuthenticated) {
    return (
      <div className="glass-bright rounded-xl p-8 text-center">
        <div className="text-[14px] text-text-secondary mb-4">
          Sign in to track your positions and market movers
        </div>
        <a
          href="/login"
          className="inline-block px-5 py-2.5 rounded-lg bg-accent/15 text-accent-bright text-[13px] font-semibold border border-accent/30 hover:bg-accent/25 transition-colors"
        >
          Sign in
        </a>
      </div>
    );
  }

  return (
    <div className="glass-bright rounded-xl overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
        <div className="flex items-center gap-3">
          <span className="text-[12px] font-mono text-text-muted">
            {symbols.length} symbols
          </span>
          {isLoading && (
            <span className="text-[11px] text-text-tertiary animate-pulse">Loading...</span>
          )}
          {error && (
            <span className="text-[11px] text-red-400">Failed to load quotes</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {showAdd ? (
            <form
              onSubmit={(e) => { e.preventDefault(); handleAdd(); }}
              className="flex items-center gap-1"
            >
              <input
                ref={addRef}
                value={addInput}
                onChange={(e) => setAddInput(e.target.value.toUpperCase())}
                placeholder="AAPL"
                className="w-[80px] px-2 py-1 text-[12px] font-mono bg-bg-secondary border border-border-subtle rounded-md text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent/50"
                onBlur={() => { if (!addInput) setShowAdd(false); }}
              />
              <button
                type="submit"
                className="px-2 py-1 text-[11px] font-mono font-medium bg-accent/15 text-accent-bright rounded-md hover:bg-accent/25 transition-colors"
              >
                Add
              </button>
            </form>
          ) : (
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-mono font-medium text-text-muted hover:text-text-secondary hover:bg-bg-secondary rounded-md transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Add Symbol
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border-subtle">
              <th className="w-[30px] px-2 py-2.5" />
              <th className="px-3 py-2.5 text-left">
                <SortHeader label="Symbol" field="symbol" align="left" />
              </th>
              <th className="px-3 py-2.5 text-right">
                <SortHeader label="Last" field="price" />
              </th>
              <th className="px-3 py-2.5 text-right">
                <SortHeader label="Chg" field="change" />
              </th>
              <th className="px-3 py-2.5 text-right">
                <SortHeader label="Chg%" field="changePct" />
              </th>
              <th className="px-3 py-2.5 text-center w-[70px]" />
              <th className="px-3 py-2.5 text-right">
                <SortHeader label="Volume" field="volume" />
              </th>
              <th className="px-3 py-2.5 text-right">
                <SortHeader label="Mkt Cap" field="marketCap" />
              </th>
              <th className="px-3 py-2.5">
                <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.1em] text-text-muted">
                  Day Range
                </span>
              </th>
              <th className="w-[30px] px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {sortedSymbols.map((sym, idx) => {
              const q = quotesMap.get(sym);
              const flash = flashMap.get(sym);
              const positive = q ? q.changePercent >= 0 : true;
              const colorClass = positive ? 'text-emerald' : 'text-red-400';

              return (
                <tr
                  key={sym}
                  draggable
                  onDragStart={() => handleDragStart(symbols.indexOf(sym))}
                  onDragOver={(e) => handleDragOver(e, symbols.indexOf(sym))}
                  onDragEnd={() => setDragIdx(null)}
                  className={`border-b border-border-subtle/50 hover:bg-bg-secondary/50 transition-colors cursor-pointer group ${
                    flash === 'up' ? 'animate-flash-green' : flash === 'down' ? 'animate-flash-red' : ''
                  }`}
                  onClick={() => { window.location.href = `/stock?symbol=${sym}`; }}
                >
                  {/* Drag handle */}
                  <td className="px-2 py-2">
                    <div className="opacity-0 group-hover:opacity-40 cursor-grab text-text-tertiary">
                      <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
                        <circle cx="3" cy="3" r="1.2" />
                        <circle cx="7" cy="3" r="1.2" />
                        <circle cx="3" cy="7" r="1.2" />
                        <circle cx="7" cy="7" r="1.2" />
                        <circle cx="3" cy="11" r="1.2" />
                        <circle cx="7" cy="11" r="1.2" />
                      </svg>
                    </div>
                  </td>

                  {/* Symbol */}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-[26px] h-[26px] rounded-md bg-bg-secondary flex items-center justify-center">
                        <span className="text-[10px] font-mono font-bold text-text-secondary">
                          {sym.charAt(0)}
                        </span>
                      </div>
                      <span className="text-[13px] font-mono font-semibold text-text-primary">
                        {sym}
                      </span>
                    </div>
                  </td>

                  {/* Price */}
                  <td className="px-3 py-2 text-right">
                    <span className="text-[13px] font-mono font-medium text-text-primary">
                      {q ? formatPrice(q.price) : '—'}
                    </span>
                  </td>

                  {/* Change */}
                  <td className="px-3 py-2 text-right">
                    <span className={`text-[12px] font-mono ${colorClass}`}>
                      {q ? `${q.change >= 0 ? '+' : ''}${q.change.toFixed(2)}` : '—'}
                    </span>
                  </td>

                  {/* Change % */}
                  <td className="px-3 py-2 text-right">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-mono font-medium ${
                      positive ? 'bg-emerald/10 text-emerald' : 'bg-red-400/10 text-red-400'
                    }`}>
                      {q ? `${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%` : '—'}
                    </span>
                  </td>

                  {/* Mini bar */}
                  <td className="px-2 py-2">
                    {q && <Sparkline changePct={q.changePercent} />}
                  </td>

                  {/* Volume */}
                  <td className="px-3 py-2 text-right">
                    <span className="text-[12px] font-mono text-text-secondary">
                      {q ? formatVolume(q.volume) : '—'}
                    </span>
                  </td>

                  {/* Market Cap */}
                  <td className="px-3 py-2 text-right">
                    <span className="text-[12px] font-mono text-text-secondary">
                      {q ? formatMarketCap(q.marketCap) : '—'}
                    </span>
                  </td>

                  {/* Day Range */}
                  <td className="px-3 py-2">
                    {q && q.low > 0 && q.high > 0 ? (
                      <DayRangeBar low={q.low} high={q.high} current={q.price} />
                    ) : (
                      <span className="text-[12px] text-text-tertiary">—</span>
                    )}
                  </td>

                  {/* Remove */}
                  <td className="px-2 py-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); removeSymbol(sym); }}
                      className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-text-tertiary hover:text-red-400 transition-all"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {symbols.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-text-tertiary">
          <p className="text-[14px]">No symbols in your watchlist</p>
          <button
            onClick={() => setShowAdd(true)}
            className="mt-3 px-4 py-2 text-[12px] font-mono font-medium bg-accent/15 text-accent-bright rounded-lg hover:bg-accent/25 transition-colors"
          >
            Add your first symbol
          </button>
        </div>
      )}
    </div>
  );
}
