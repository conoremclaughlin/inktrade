const features = [
  {
    title: 'Options Calculator',
    description:
      'Model any single-leg or multi-leg strategy. See exact P&L, breakevens, and max risk before you commit capital.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 8H16M8 12H13M8 16H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    accent: 'accent',
  },
  {
    title: 'Leverage Visualization',
    description:
      'Interactive charts that reveal how effective leverage changes with price, time, and volatility. See the full surface, not just a snapshot.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M3 20L9 13L13 17L21 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M17 8H21V12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    accent: 'emerald',
  },
  {
    title: 'Greeks Analysis',
    description:
      'Delta, gamma, theta, vega, and rho displayed as intuitive heatmaps. Understand sensitivity at a glance across your entire portfolio.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 3C16.97 3 21 7.03 21 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="3 3" />
        <path d="M8 12C8 9.79 9.79 8 12 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      </svg>
    ),
    accent: 'violet',
  },
  {
    title: 'Watchlist Monitoring',
    description:
      'Track leverage-adjusted positions in real time. Get alerted when gamma exposure spikes or when theta decay accelerates before expiry.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M2 12C2 12 5 5 12 5C19 5 22 12 22 12C22 12 19 19 12 19C5 19 2 12 2 12Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
    accent: 'amber',
  },
];

const accentMap: Record<string, { border: string; bg: string; text: string; glow: string }> = {
  accent: {
    border: 'border-accent/30',
    bg: 'bg-accent/10',
    text: 'text-accent-bright',
    glow: 'shadow-[0_0_20px_rgba(59,130,246,0.08)]',
  },
  emerald: {
    border: 'border-emerald/30',
    bg: 'bg-emerald/10',
    text: 'text-emerald-bright',
    glow: 'shadow-[0_0_20px_rgba(16,185,129,0.08)]',
  },
  violet: {
    border: 'border-violet/30',
    bg: 'bg-violet/10',
    text: 'text-violet',
    glow: 'shadow-[0_0_20px_rgba(139,92,246,0.08)]',
  },
  amber: {
    border: 'border-amber/30',
    bg: 'bg-amber/10',
    text: 'text-amber',
    glow: 'shadow-[0_0_20px_rgba(245,158,11,0.08)]',
  },
};

export function Features() {
  return (
    <section id="features" className="relative py-32">
      <div className="mx-auto max-w-7xl px-6">
        {/* Section header */}
        <div className="max-w-2xl mb-20">
          <p className="text-[13px] font-semibold uppercase tracking-[0.15em] text-accent-bright mb-4">
            Platform
          </p>
          <h2 className="font-display text-4xl md:text-5xl tracking-[-0.02em] leading-[1.1] text-text-primary">
            Every edge,{' '}
            <span className="text-text-secondary italic">quantified</span>
          </h2>
          <p className="mt-5 text-lg text-text-secondary leading-relaxed">
            Four integrated modules that transform how you evaluate options
            trades. Each one built from the ground up for leverage-first
            thinking.
          </p>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {features.map((f, i) => {
            const a = accentMap[f.accent];
            return (
              <div
                key={f.title}
                className={`feature-card glass rounded-2xl p-8 ${a.glow} animate-fade-up stagger-${i + 1}`}
              >
                <div
                  className={`inline-flex items-center justify-center w-11 h-11 rounded-xl ${a.bg} ${a.border} border ${a.text} mb-5`}
                >
                  {f.icon}
                </div>
                <h3 className="text-lg font-semibold tracking-[-0.01em] text-text-primary mb-3">
                  {f.title}
                </h3>
                <p className="text-[15px] leading-relaxed text-text-secondary">
                  {f.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
