export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-void flex items-center justify-center px-4">
      <div className="w-full max-w-[400px]">
        <a href="/" className="flex items-center justify-center gap-2.5 mb-8 group">
          <div className="relative flex h-8 w-8 items-center justify-center">
            <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-accent to-emerald opacity-20 group-hover:opacity-40 transition-opacity duration-300" />
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="relative z-10">
              <path d="M2 14L9 4L16 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent-bright" />
              <path d="M5 14L9 7L13 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald" />
            </svg>
          </div>
          <span className="text-[15px] font-semibold tracking-[-0.02em] text-text-primary">
            Inktrade
          </span>
        </a>
        <div className="glass-bright rounded-xl p-6 border border-border-subtle">
          {children}
        </div>
      </div>
    </div>
  );
}
