export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      {/* Background layers */}
      <div className="hero-mesh" aria-hidden="true" />
      <div className="grid-bg absolute inset-0" aria-hidden="true" />

      {/* Radial fade at bottom */}
      <div
        className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-void to-transparent z-10"
        aria-hidden="true"
      />

      <div className="relative z-20 mx-auto max-w-5xl px-6 text-center">
        {/* Badge */}
        <div className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface/60 px-4 py-1.5 mb-8">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald" />
          </span>
          <span className="text-[12px] font-medium tracking-wide uppercase text-text-secondary">
            Now in Private Beta
          </span>
        </div>

        {/* Headline */}
        <h1 className="animate-fade-up stagger-1">
          <span className="block font-display text-[clamp(2.75rem,7vw,5.5rem)] leading-[0.95] tracking-[-0.03em] text-text-primary">
            See the leverage
          </span>
          <span className="block font-display text-[clamp(2.75rem,7vw,5.5rem)] leading-[0.95] tracking-[-0.03em] mt-1">
            <span className="gradient-text-animated">others miss</span>
          </span>
        </h1>

        {/* Subheadline */}
        <p className="animate-fade-up stagger-2 mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-text-secondary md:text-xl">
          Inktrade models how leverage shifts across strikes, expirations, and
          targets&mdash;so you can size positions with clarity, not conviction.
        </p>

        {/* CTA row */}
        <div className="animate-fade-up stagger-3 mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <button className="group relative px-8 py-3.5 rounded-xl text-[15px] font-semibold text-white bg-gradient-to-r from-accent to-blue-600 hover:from-accent-bright hover:to-accent transition-all duration-300 shadow-[0_0_30px_rgba(59,130,246,0.25)] hover:shadow-[0_0_50px_rgba(59,130,246,0.35)]">
            <span className="relative z-10 flex items-center gap-2">
              Start Analyzing
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                className="transition-transform duration-200 group-hover:translate-x-0.5"
              >
                <path
                  d="M3 8H13M13 8L9 4M13 8L9 12"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>
          <button className="glass px-8 py-3.5 rounded-xl text-[15px] font-medium text-text-secondary hover:text-text-primary hover:border-border-default transition-all duration-300">
            View Live Demo
          </button>
        </div>

        {/* Social proof */}
        <div className="animate-fade-up stagger-4 mt-16 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          <div className="flex items-center gap-2 text-[13px] text-text-tertiary">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-emerald">
              <path
                d="M13.3 4L6 11.3L2.7 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            No credit card required
          </div>
          <div className="flex items-center gap-2 text-[13px] text-text-tertiary">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-emerald">
              <path
                d="M13.3 4L6 11.3L2.7 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Real-time options data
          </div>
          <div className="flex items-center gap-2 text-[13px] text-text-tertiary">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-emerald">
              <path
                d="M13.3 4L6 11.3L2.7 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Built for serious traders
          </div>
        </div>
      </div>
    </section>
  );
}
