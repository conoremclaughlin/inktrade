'use client';

import { useEffect, useRef } from 'react';

interface GlossaryPanelProps {
  open: boolean;
  onClose: () => void;
}

const glossary = [
  {
    category: 'Volatility',
    terms: [
      {
        term: 'IV (Implied Volatility)',
        definition: 'The market\'s forecast of the stock\'s future movement, derived from option prices. Higher IV means options are more expensive. It\'s forward-looking — what the market expects will happen.',
      },
      {
        term: 'HV (Historical Volatility)',
        definition: 'Also called realized volatility. The actual movement of the stock over a past window, measured from daily log returns. HV20 uses the last 20 trading days, HV60 uses the last 60 trading days. It\'s backward-looking — what actually happened. When IV is higher than HV, options are priced for more movement than the stock has recently delivered.',
      },
      {
        term: 'Realized Volatility',
        definition: 'How much the stock actually moved over a given period, calculated as the annualized standard deviation of daily log returns. "Realized" because it measures what already happened, unlike implied volatility which is a forecast. HV20 and HV60 on the charts are realized volatility over 20-day and 60-day windows.',
      },
      {
        term: 'IV Crush',
        definition: 'A sharp drop in implied volatility, typically after an anticipated event (earnings, FDA decision). Options lose value even if the stock moves in your favor. Most common risk for option buyers.',
      },
      {
        term: 'IV Percentile Rank',
        definition: 'Where current volatility sits compared to its own 1-year range. 90th percentile means IV is higher than 90% of the past year — options are relatively expensive.',
      },
      {
        term: 'IV − HV Spread',
        definition: 'The gap between implied and historical volatility. Positive means options are priced above realized movement (overpriced). Negative means they\'re cheap relative to how the stock actually moves.',
      },
    ],
  },
  {
    category: 'Greeks',
    terms: [
      {
        term: 'Delta (Δ)',
        definition: 'How much the option price changes per $1 move in the stock. A 0.40 delta call gains ~$0.40 when the stock rises $1. Also approximates probability of finishing in-the-money.',
      },
      {
        term: 'Gamma (Γ)',
        definition: 'How fast delta changes. High gamma means delta shifts rapidly — your exposure accelerates as the stock moves. Highest for at-the-money, near-expiration options.',
      },
      {
        term: 'Theta (Θ)',
        definition: 'Time decay per day. A theta of -0.15 means the option loses $0.15/day just from time passing. Accelerates as expiration approaches. The cost of holding an option.',
      },
      {
        term: 'Vega (ν)',
        definition: 'Sensitivity to IV changes. A vega of 0.20 means the option gains $0.20 for each 1% increase in IV. Why IV crush hurts — vega tells you how much.',
      },
      {
        term: 'Rho (ρ)',
        definition: 'Sensitivity to interest rate changes. Usually the least important Greek for short-dated options, but matters for LEAPS.',
      },
    ],
  },
  {
    category: 'Leverage & Risk',
    terms: [
      {
        term: 'Effective Leverage',
        definition: 'How much the option amplifies the stock\'s return. 10x leverage means a 1% stock move produces a 10% option return. Calculated as |Δ| × Stock Price / Option Price.',
      },
      {
        term: 'Probability of Profit (PoP)',
        definition: 'The probability that the option will be worth more than the premium paid at expiration. Derived from the Black-Scholes model. Higher leverage typically means lower PoP.',
      },
      {
        term: 'Breakeven',
        definition: 'The stock price where P&L = 0 at expiration. For calls: Strike + Premium paid. For puts: Strike − Premium paid.',
      },
      {
        term: 'Max Risk',
        definition: 'The most you can lose. For long options, it\'s the premium paid (per contract = price × 100 shares).',
      },
    ],
  },
  {
    category: 'Options Basics',
    terms: [
      {
        term: 'ATM (At-The-Money)',
        definition: 'An option whose strike price equals (or is nearest to) the current stock price.',
      },
      {
        term: 'ITM (In-The-Money)',
        definition: 'A call with strike below the stock price, or a put with strike above. Has intrinsic value.',
      },
      {
        term: 'OTM (Out-of-The-Money)',
        definition: 'A call with strike above the stock price, or a put with strike below. Higher leverage but lower probability of profit.',
      },
      {
        term: 'Open Interest (OI)',
        definition: 'Total number of outstanding contracts. Higher OI means better liquidity and tighter bid-ask spreads.',
      },
      {
        term: 'Mark Price',
        definition: 'The midpoint between bid and ask. Better estimate of fair value than last traded price, especially for illiquid options.',
      },
    ],
  },
  {
    category: 'Fundamentals',
    terms: [
      {
        term: 'Market Cap',
        definition: 'Total market value of a company: share price × shares outstanding. A $100 stock with 1B shares = $100B market cap. Your price target implies a specific market cap.',
      },
      {
        term: 'Revenue',
        definition: 'Total sales before any costs. The top line of the income statement. Revenue growth is the primary driver of long-term stock price appreciation.',
      },
      {
        term: 'Gross Margin',
        definition: 'Gross profit as a percentage of revenue: (Revenue − Cost of Goods Sold) / Revenue. Measures how efficiently a company produces its products. For semiconductors like MU, gross margin expands in upcycles and contracts in downcycles.',
      },
      {
        term: 'Net Income',
        definition: 'Profit after all expenses, taxes, and interest. The bottom line. A company can have growing revenue but shrinking net income if costs rise faster.',
      },
      {
        term: 'Price/Revenue (P/S)',
        definition: 'Market cap divided by trailing twelve months of revenue. A valuation multiple — lower means cheaper relative to sales. Useful for comparing across cycles or to historical averages.',
      },
    ],
  },
];

export function GlossaryPanel({ open, onClose }: GlossaryPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (open) {
      document.addEventListener('keydown', handleKey);
      return () => document.removeEventListener('keydown', handleKey);
    }
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-void/60 backdrop-blur-sm transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={`fixed top-0 right-0 z-50 h-full w-full max-w-md glass-bright border-l border-border-subtle shadow-2xl transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <div>
            <h2 className="text-[16px] font-semibold text-text-primary">Glossary</h2>
            <p className="text-[12px] text-text-tertiary mt-0.5">Options terminology reference</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-overlay transition-colors text-text-muted hover:text-text-primary"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto h-[calc(100%-65px)] px-6 py-4 space-y-6">
          {glossary.map((group) => (
            <div key={group.category}>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-accent-bright mb-3">
                {group.category}
              </h3>
              <div className="space-y-3">
                {group.terms.map((item) => (
                  <div key={item.term} className="glass rounded-lg px-4 py-3">
                    <dt className="text-[13px] font-semibold text-text-primary mb-1">
                      {item.term}
                    </dt>
                    <dd className="text-[12px] text-text-secondary leading-relaxed">
                      {item.definition}
                    </dd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
