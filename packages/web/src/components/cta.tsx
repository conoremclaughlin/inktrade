export function CTA() {
  return (
    <section id="pricing" className="relative py-32 overflow-hidden">
      {/* Background glow */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-emerald/[0.04] blur-[100px] pointer-events-none"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-3xl px-6 text-center">
        <p className="text-[13px] font-semibold uppercase tracking-[0.15em] text-emerald-bright mb-4 animate-fade-up">
          Early Access
        </p>
        <h2 className="font-display text-4xl md:text-6xl tracking-[-0.03em] leading-[1.05] text-text-primary animate-fade-up stagger-1">
          Stop guessing leverage.
          <br />
          <span className="text-text-secondary italic">Start modeling it.</span>
        </h2>
        <p className="mt-6 text-lg text-text-secondary leading-relaxed max-w-xl mx-auto animate-fade-up stagger-2">
          Join the private beta and get lifetime access at our founding
          member rate. Limited to the first 500 traders.
        </p>

        {/* Email capture */}
        <div className="animate-fade-up stagger-3 mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 max-w-md mx-auto">
          <div className="relative flex-1 w-full">
            <input
              type="email"
              placeholder="you@trading.com"
              className="w-full glass rounded-xl px-5 py-3.5 text-[15px] text-text-primary placeholder:text-text-muted bg-surface/50 focus:outline-none focus:border-accent/50 focus:shadow-[0_0_20px_rgba(59,130,246,0.1)] transition-all duration-300 font-mono"
            />
          </div>
          <button className="w-full sm:w-auto px-7 py-3.5 rounded-xl text-[15px] font-semibold text-white bg-gradient-to-r from-emerald-dim to-emerald hover:from-emerald hover:to-emerald-bright transition-all duration-300 shadow-[0_0_30px_rgba(16,185,129,0.2)] hover:shadow-[0_0_50px_rgba(16,185,129,0.3)] whitespace-nowrap">
            Join the Beta
          </button>
        </div>

        {/* Trust indicators */}
        <div className="animate-fade-up stagger-4 mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[12px] text-text-muted">
          <span>No spam, ever</span>
          <span className="hidden sm:inline text-text-muted/30">|</span>
          <span>Cancel anytime</span>
          <span className="hidden sm:inline text-text-muted/30">|</span>
          <span>Founding member pricing</span>
        </div>
      </div>
    </section>
  );
}
