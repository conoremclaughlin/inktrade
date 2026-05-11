export function CalculatorPreview() {
  return (
    <section id="calculator" className="relative py-32 overflow-hidden">
      {/* Background glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] rounded-full bg-accent/[0.03] blur-[120px] pointer-events-none"
        aria-hidden="true"
      />

      <div className="mx-auto max-w-7xl px-6">
        {/* Section header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-[13px] font-semibold uppercase tracking-[0.15em] text-emerald-bright mb-4">
            Calculator
          </p>
          <h2 className="font-display text-4xl md:text-5xl tracking-[-0.02em] leading-[1.1] text-text-primary">
            Precision at{' '}
            <span className="italic text-text-secondary">every strike</span>
          </h2>
          <p className="mt-5 text-lg text-text-secondary leading-relaxed">
            Our options calculator doesn&apos;t just compute P&amp;L &mdash; it
            maps the full leverage surface so you see exactly how your edge
            evolves.
          </p>
        </div>

        {/* Calculator Mockup */}
        <div className="relative animate-fade-up">
          <div className="glass-bright rounded-2xl overflow-hidden shadow-2xl shadow-black/40">
            {/* Title bar */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle bg-surface/40">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose/60" />
                  <div className="w-2.5 h-2.5 rounded-full bg-amber/60" />
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald/60" />
                </div>
                <span className="ml-3 text-[12px] font-mono text-text-tertiary">
                  inktrade / options-calculator
                </span>
              </div>
              <div className="flex items-center gap-3 text-text-muted">
                <span className="text-[11px] font-mono">LIVE</span>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald" />
                </span>
              </div>
            </div>

            {/* Main calculator content */}
            <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] min-h-[480px]">
              {/* Left sidebar - inputs */}
              <div className="border-r border-border-subtle p-6 space-y-5 bg-deep/40">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-tertiary mb-2">
                    Underlying
                  </label>
                  <div className="flex items-center gap-3 glass rounded-lg px-4 py-2.5">
                    <span className="text-[15px] font-semibold font-mono text-text-primary">
                      NVDA
                    </span>
                    <span className="text-[13px] font-mono text-emerald">
                      $131.28
                    </span>
                    <span className="ml-auto text-[11px] font-mono text-emerald">
                      +2.14%
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-tertiary mb-2">
                      Strike
                    </label>
                    <div className="glass rounded-lg px-4 py-2.5">
                      <span className="text-[14px] font-mono text-text-primary">$135.00</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-tertiary mb-2">
                      Expiry
                    </label>
                    <div className="glass rounded-lg px-4 py-2.5">
                      <span className="text-[14px] font-mono text-text-primary">Jul 18</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-tertiary mb-2">
                    Strategy
                  </label>
                  <div className="glass rounded-lg px-4 py-2.5 flex items-center justify-between">
                    <span className="text-[14px] font-mono text-text-primary">Long Call</span>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-text-muted">
                      <path d="M3.5 5.25L7 8.75L10.5 5.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>

                <div className="hr-gradient" />

                {/* Greeks display */}
                <div>
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-tertiary mb-3">
                    Greeks
                  </span>
                  <div className="grid grid-cols-2 gap-2.5">
                    {[
                      { label: 'Delta', value: '0.42', color: 'text-accent-bright' },
                      { label: 'Gamma', value: '0.031', color: 'text-emerald' },
                      { label: 'Theta', value: '-0.18', color: 'text-rose' },
                      { label: 'Vega', value: '0.24', color: 'text-violet' },
                    ].map((g) => (
                      <div key={g.label} className="flex items-baseline justify-between">
                        <span className="text-[11px] text-text-muted uppercase tracking-wider">
                          {g.label}
                        </span>
                        <span className={`text-[13px] font-mono font-medium ${g.color}`}>
                          {g.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="hr-gradient" />

                {/* Key stats */}
                <div className="space-y-2.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[12px] text-text-tertiary">Effective Leverage</span>
                    <span className="text-[15px] font-mono font-bold text-accent-bright">
                      6.8x
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[12px] text-text-tertiary">Breakeven</span>
                    <span className="text-[14px] font-mono text-text-primary">$141.32</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[12px] text-text-tertiary">Max Risk</span>
                    <span className="text-[14px] font-mono text-rose">-$632</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[12px] text-text-tertiary">Prob. ITM</span>
                    <span className="text-[14px] font-mono text-amber">38.2%</span>
                  </div>
                </div>
              </div>

              {/* Right panel - chart */}
              <div className="relative p-6 flex flex-col">
                {/* Chart header */}
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-[14px] font-semibold text-text-primary">
                      Leverage Surface
                    </h3>
                    <p className="text-[12px] text-text-tertiary mt-0.5">
                      NVDA $135C &middot; Jul 18 &middot; Effective leverage vs. underlying price
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    {['1D', '1W', '1M', 'Exp'].map((t, i) => (
                      <button
                        key={t}
                        className={`px-3 py-1 rounded-md text-[11px] font-mono font-medium transition-colors ${
                          i === 2
                            ? 'bg-accent/15 text-accent-bright border border-accent/30'
                            : 'text-text-muted hover:text-text-secondary'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Chart area */}
                <div className="flex-1 relative rounded-xl overflow-hidden border border-border-subtle bg-deep/30 min-h-[300px]">
                  {/* Y-axis labels */}
                  <div className="absolute left-3 top-4 bottom-10 flex flex-col justify-between pointer-events-none z-10">
                    {['12x', '9x', '6x', '3x', '0x'].map((v) => (
                      <span key={v} className="text-[10px] font-mono text-text-muted">
                        {v}
                      </span>
                    ))}
                  </div>

                  {/* SVG Chart */}
                  <svg className="absolute inset-0 w-full h-full" viewBox="0 0 600 300" preserveAspectRatio="none">
                    {/* Grid lines */}
                    {[60, 120, 180, 240].map((y) => (
                      <line
                        key={y}
                        x1="40"
                        y1={y}
                        x2="580"
                        y2={y}
                        className="calc-grid-line"
                        strokeDasharray="4 4"
                      />
                    ))}
                    {[140, 240, 340, 440].map((x) => (
                      <line
                        key={x}
                        x1={x}
                        y1="20"
                        x2={x}
                        y2="270"
                        className="calc-grid-line"
                        strokeDasharray="4 4"
                      />
                    ))}

                    {/* Leverage curve area fill */}
                    <path
                      d="M40,260 C100,255 160,240 220,200 C280,160 320,100 360,60 C400,35 440,30 500,28 L500,270 L40,270 Z"
                      className="calc-area"
                      fill="url(#leverageGrad)"
                    />

                    {/* Leverage curve */}
                    <path
                      d="M40,260 C100,255 160,240 220,200 C280,160 320,100 360,60 C400,35 440,30 500,28"
                      className="calc-data-line"
                      stroke="url(#lineGrad)"
                      strokeWidth="2.5"
                    />

                    {/* P&L line (secondary) */}
                    <path
                      d="M40,230 C100,235 160,238 220,240 C260,240 300,230 340,190 C380,140 420,90 500,40"
                      className="calc-data-line"
                      stroke="#10b981"
                      strokeWidth="1.5"
                      strokeDasharray="6 4"
                      opacity="0.6"
                    />

                    {/* Current price marker */}
                    <line
                      x1="260"
                      y1="20"
                      x2="260"
                      y2="270"
                      stroke="#3b82f6"
                      strokeWidth="1"
                      strokeDasharray="4 2"
                      opacity="0.5"
                    />
                    <circle cx="260" cy="185" r="5" fill="#3b82f6" stroke="#0a0e18" strokeWidth="2" />

                    {/* Breakeven marker */}
                    <line
                      x1="360"
                      y1="20"
                      x2="360"
                      y2="270"
                      stroke="#f59e0b"
                      strokeWidth="1"
                      strokeDasharray="4 2"
                      opacity="0.4"
                    />

                    {/* Gradients */}
                    <defs>
                      <linearGradient id="leverageGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2" />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                      </linearGradient>
                      <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#60a5fa" />
                        <stop offset="60%" stopColor="#3b82f6" />
                        <stop offset="100%" stopColor="#10b981" />
                      </linearGradient>
                    </defs>
                  </svg>

                  {/* Floating tooltip */}
                  <div className="absolute top-[120px] left-[240px] glass rounded-lg px-3 py-2 shadow-xl pointer-events-none animate-float" style={{ animationDuration: '4s' }}>
                    <div className="text-[10px] font-mono text-text-tertiary">@ $131.28</div>
                    <div className="text-[13px] font-mono font-bold text-accent-bright">
                      6.8x leverage
                    </div>
                  </div>

                  {/* X-axis labels */}
                  <div className="absolute bottom-2 left-10 right-4 flex justify-between pointer-events-none">
                    {['$115', '$120', '$125', '$131', '$135', '$140', '$145'].map((v) => (
                      <span key={v} className="text-[10px] font-mono text-text-muted">
                        {v}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Chart legend */}
                <div className="flex items-center gap-6 mt-4">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5 rounded-full bg-accent-bright" />
                    <span className="text-[11px] text-text-tertiary">Effective Leverage</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5 rounded-full bg-emerald" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 3px, var(--color-deep) 3px, var(--color-deep) 5px)' }} />
                    <span className="text-[11px] text-text-tertiary">P&L Curve</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber" />
                    <span className="text-[11px] text-text-tertiary">Breakeven</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Reflection / glow under the card */}
          <div
            className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-3/4 h-16 bg-accent/5 rounded-full blur-2xl pointer-events-none"
            aria-hidden="true"
          />
        </div>
      </div>
    </section>
  );
}
