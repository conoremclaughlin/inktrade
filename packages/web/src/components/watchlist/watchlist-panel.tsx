'use client';

import { useState, useCallback, useEffect } from 'react';
import type { Quote } from '@inktrade/engine/math';
import { useWatchlistSymbols, useWatchlistQuotes } from '@/lib/hooks';

const PANEL_KEY = 'inktrade:watchlist-panel';

function loadPanelOpen(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const stored = localStorage.getItem(PANEL_KEY);
    if (stored !== null) return stored === 'true';
  } catch { /* ignore */ }
  return true;
}

function formatPrice(n: number): string {
  if (n >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

interface WatchlistPanelProps {
  activeSymbol?: string;
  onSymbolClick: (symbol: string) => void;
}

export function WatchlistPanel({ activeSymbol, onSymbolClick }: WatchlistPanelProps) {
  const [isOpen, setIsOpen] = useState(loadPanelOpen);
  const { symbols, addSymbol, removeSymbol } = useWatchlistSymbols();
  const { data: quotesData } = useWatchlistQuotes(symbols);
  const [addInput, setAddInput] = useState('');

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      localStorage.setItem(PANEL_KEY, String(next));
      return next;
    });
  }, []);

  const quoteMap = new Map<string, Quote>();
  if (quotesData?.quotes) {
    for (const q of quotesData.quotes) quoteMap.set(q.symbol, q);
  }

  const handleAdd = () => {
    const sym = addInput.trim().toUpperCase();
    if (sym) {
      addSymbol(sym);
      setAddInput('');
    }
  };

  return (
    <div className="flex h-full">
      {/* Toggle tab */}
      <button
        onClick={toggle}
        className="flex items-center justify-center w-5 h-full border-l border-border-subtle bg-bg-secondary/50 hover:bg-bg-secondary transition-colors flex-shrink-0"
        title={isOpen ? 'Collapse watchlist' : 'Expand watchlist'}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          className={`text-text-muted transition-transform duration-200 ${isOpen ? 'rotate-0' : 'rotate-180'}`}
        >
          <path d="M6.5 2L3.5 5L6.5 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Panel content */}
      {isOpen && (
        <div className="w-[220px] flex-shrink-0 border-l border-border-subtle bg-bg-primary/80 backdrop-blur-sm flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className="px-3 py-2.5 border-b border-border-subtle">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-tertiary">
              Watchlist
            </div>
          </div>

          {/* Add input */}
          <form
            onSubmit={(e) => { e.preventDefault(); handleAdd(); }}
            className="flex gap-1 px-2 py-1.5 border-b border-border-subtle"
          >
            <input
              type="text"
              value={addInput}
              onChange={(e) => setAddInput(e.target.value.toUpperCase())}
              placeholder="Add symbol..."
              className="flex-1 min-w-0 bg-transparent text-[11px] font-mono text-text-primary placeholder:text-text-muted outline-none px-1.5 py-0.5 rounded border border-transparent focus:border-accent/30"
            />
            <button
              type="submit"
              disabled={!addInput.trim()}
              className="text-[10px] font-semibold text-accent-bright px-1.5 py-0.5 rounded hover:bg-accent/10 disabled:opacity-30 disabled:cursor-default transition-colors"
            >
              +
            </button>
          </form>

          {/* Symbol list */}
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {symbols.map((sym) => {
              const q = quoteMap.get(sym);
              const isActive = sym === activeSymbol;
              const changeColor = q
                ? q.changePercent >= 0 ? 'text-emerald' : 'text-rose'
                : 'text-text-muted';

              return (
                <button
                  key={sym}
                  onClick={() => onSymbolClick(sym)}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-left transition-colors group ${
                    isActive
                      ? 'bg-accent/10 border-l-2 border-accent'
                      : 'hover:bg-bg-secondary/60 border-l-2 border-transparent'
                  }`}
                >
                  <div className="min-w-0">
                    <div className={`text-[12px] font-mono font-semibold truncate ${
                      isActive ? 'text-accent-bright' : 'text-text-primary'
                    }`}>
                      {sym}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    {q ? (
                      <>
                        <div className="text-[11px] font-mono text-text-primary">
                          {formatPrice(q.price)}
                        </div>
                        <div className={`text-[10px] font-mono ${changeColor}`}>
                          {q.changePercent >= 0 ? '+' : ''}{q.changePercent.toFixed(2)}%
                        </div>
                      </>
                    ) : (
                      <div className="text-[10px] font-mono text-text-muted">...</div>
                    )}
                  </div>
                  {/* Remove button on hover */}
                  <button
                    onClick={(e) => { e.stopPropagation(); removeSymbol(sym); }}
                    className="absolute right-1 opacity-0 group-hover:opacity-60 hover:!opacity-100 text-text-muted hover:text-rose text-[10px] p-0.5 transition-opacity"
                    title={`Remove ${sym}`}
                  >
                    ×
                  </button>
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-3 py-1.5 border-t border-border-subtle">
            <a
              href="/watchlist"
              className="text-[10px] text-text-muted hover:text-accent-bright transition-colors font-mono"
            >
              Full watchlist →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
