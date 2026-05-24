'use client';

import type { OptionGreeks } from '@inktrade/engine/math';

interface GreeksPanelProps {
  greeks: OptionGreeks;
  compact?: boolean;
}

const greekConfig = [
  { key: 'delta' as const, label: 'Delta', color: 'text-accent-bright', desc: 'Price sensitivity' },
  { key: 'gamma' as const, label: 'Gamma', color: 'text-emerald', desc: 'Delta acceleration' },
  { key: 'theta' as const, label: 'Theta', color: 'text-rose', desc: 'Time decay / day' },
  { key: 'vega' as const, label: 'Vega', color: 'text-violet', desc: 'IV sensitivity' },
  { key: 'rho' as const, label: 'Rho', color: 'text-amber', desc: 'Rate sensitivity' },
  { key: 'impliedVolatility' as const, label: 'IV', color: 'text-text-primary', desc: 'Implied volatility' },
];

function formatGreek(key: string, value: number): string {
  if (key === 'impliedVolatility') return `${(value * 100).toFixed(1)}%`;
  if (value === 0) return '0';
  if (Math.abs(value) < 0.0001) return value.toFixed(6);
  return value.toFixed(4);
}

export function GreeksPanel({ greeks, compact }: GreeksPanelProps) {
  if (compact) {
    return (
      <div className="grid grid-cols-3 gap-2.5">
        {greekConfig.slice(0, 6).map(({ key, label, color }) => (
          <div key={key} className="flex items-baseline justify-between">
            <span className="text-[11px] text-text-muted uppercase tracking-wider">{label}</span>
            <span className={`text-[13px] font-mono font-medium ${color}`}>
              {formatGreek(key, greeks[key])}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {greekConfig.map(({ key, label, color, desc }) => (
        <div key={key} className="glass rounded-lg px-3 py-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
              {label}
            </span>
          </div>
          <div className={`text-[16px] font-mono font-bold ${color}`}>
            {formatGreek(key, greeks[key])}
          </div>
          <div className="text-[10px] text-text-muted mt-0.5">{desc}</div>
        </div>
      ))}
    </div>
  );
}
