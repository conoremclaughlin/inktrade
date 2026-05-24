'use client';

import type { RiskWarning } from '@inktrade/engine/portfolio';

interface RiskWarningsProps {
  warnings: RiskWarning[];
}

const SEVERITY_STYLES = {
  critical: {
    border: 'border-rose/30',
    bg: 'bg-rose/5',
    icon: '⚠',
    iconColor: 'text-rose',
  },
  warning: {
    border: 'border-amber/30',
    bg: 'bg-amber/5',
    icon: '⚡',
    iconColor: 'text-amber',
  },
  info: {
    border: 'border-accent/30',
    bg: 'bg-accent/5',
    icon: 'ℹ',
    iconColor: 'text-accent-bright',
  },
};

export function RiskWarnings({ warnings }: RiskWarningsProps) {
  if (warnings.length === 0) {
    return (
      <div className="rounded-xl glass-bright border border-emerald/20 bg-emerald/5 p-4">
        <div className="flex items-center gap-2">
          <span className="text-emerald text-[14px]">✓</span>
          <span className="text-[12px] font-mono text-emerald">
            No significant risk concentrations detected.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {warnings.map((warning, i) => {
        const style = SEVERITY_STYLES[warning.severity];
        return (
          <div
            key={i}
            className={`rounded-lg border ${style.border} ${style.bg} p-3 flex items-start gap-3`}
          >
            <span className={`text-[14px] ${style.iconColor} mt-0.5`}>{style.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-mono text-text-secondary leading-relaxed">
                {warning.message}
              </p>
              <div className="flex gap-1.5 mt-1.5 flex-wrap">
                {warning.tickers.map(t => (
                  <span
                    key={t}
                    className="text-[9px] font-mono font-medium px-1.5 py-0.5 rounded bg-surface-raised text-text-muted"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
