'use client';

import { useState } from 'react';

interface PortfolioInputProps {
  symbols: string[];
  onChange: (symbols: string[]) => void;
}

const PRESETS: { label: string; symbols: string[] }[] = [
  { label: 'Semiconductors', symbols: ['MU', 'NVDA', 'AVGO', 'ANET'] },
  { label: 'LETF Core', symbols: ['TQQQ', 'SOXL', 'UPRO'] },
  { label: 'Diversified', symbols: ['MU', 'GOOG', 'TQQQ', 'SOXL', 'XLF'] },
];

export function PortfolioInput({ symbols, onChange }: PortfolioInputProps) {
  const [input, setInput] = useState('');

  function addSymbol() {
    const ticker = input.trim().toUpperCase();
    if (ticker && !symbols.includes(ticker)) {
      onChange([...symbols, ticker]);
    }
    setInput('');
  }

  function removeSymbol(symbol: string) {
    onChange(symbols.filter(s => s !== symbol));
  }

  function applyPreset(preset: string[]) {
    onChange(preset);
  }

  return (
    <div className="space-y-3">
      {/* Current symbols */}
      <div className="flex items-center gap-2 flex-wrap">
        {symbols.map(symbol => (
          <span
            key={symbol}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/10 border border-accent/20 text-[12px] font-mono font-medium text-accent-bright"
          >
            {symbol}
            <button
              onClick={() => removeSymbol(symbol)}
              className="text-text-muted hover:text-rose transition-colors ml-0.5"
            >
              ×
            </button>
          </span>
        ))}

        {/* Add input */}
        <form
          onSubmit={(e) => { e.preventDefault(); addSymbol(); }}
          className="inline-flex items-center gap-1"
        >
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Add ticker..."
            className="w-[100px] px-2.5 py-1.5 rounded-lg glass text-[12px] font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/40 border border-transparent"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-mono font-medium bg-accent/15 text-accent-bright border border-accent/30 hover:bg-accent/25 transition-all disabled:opacity-30"
          >
            +
          </button>
        </form>
      </div>

      {/* Presets */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-mono font-semibold text-text-muted uppercase tracking-wider">
          Presets:
        </span>
        {PRESETS.map(preset => (
          <button
            key={preset.label}
            onClick={() => applyPreset(preset.symbols)}
            className="px-2.5 py-1 rounded-md text-[11px] font-mono text-text-tertiary hover:text-text-secondary hover:bg-surface-raised/50 transition-all"
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
