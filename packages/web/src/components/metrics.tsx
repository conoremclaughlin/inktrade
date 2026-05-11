const metrics = [
  {
    value: '< 50ms',
    label: 'Calculation latency',
    detail: 'Real-time leverage computation',
  },
  {
    value: '4,200+',
    label: 'Underlyings covered',
    detail: 'US equities & ETFs',
  },
  {
    value: '99.97%',
    label: 'Uptime SLA',
    detail: 'Enterprise-grade reliability',
  },
  {
    value: '∞',
    label: 'Strategies supported',
    detail: 'Any combination of legs',
  },
];

export function Metrics() {
  return (
    <section className="relative py-28 border-y border-border-subtle">
      {/* Background */}
      <div
        className="absolute inset-0 bg-gradient-to-b from-deep/50 via-abyss to-deep/50 pointer-events-none"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-7xl px-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-0 lg:divide-x lg:divide-border-subtle">
          {metrics.map((m, i) => (
            <div
              key={m.label}
              className={`text-center lg:px-8 animate-fade-up stagger-${i + 1}`}
            >
              <div className="text-4xl md:text-5xl font-display tracking-[-0.02em] text-text-primary mb-2">
                {m.value}
              </div>
              <div className="text-[14px] font-semibold text-text-secondary mb-1">
                {m.label}
              </div>
              <div className="text-[12px] text-text-muted">{m.detail}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
