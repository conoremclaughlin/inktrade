'use client';

import { useUser, useSignOut } from '@/lib/hooks/use-auth';

export function Navbar() {
  const { user, isAuthenticated, isLoading } = useUser();
  const handleSignOut = useSignOut();

  return (
    <nav className="nav-blur fixed top-0 left-0 right-0 z-50 border-b border-border-subtle">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        {/* Logo */}
        <a href="/" className="flex items-center gap-2.5 group">
          <div className="relative flex h-8 w-8 items-center justify-center">
            <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-accent to-emerald opacity-20 group-hover:opacity-40 transition-opacity duration-300" />
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              className="relative z-10"
            >
              <path
                d="M2 14L9 4L16 14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-accent-bright"
              />
              <path
                d="M5 14L9 7L13 14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-emerald"
              />
            </svg>
          </div>
          <span className="text-[15px] font-semibold tracking-[-0.02em] text-text-primary">
            Inktrade
          </span>
        </a>

        {/* Nav Links */}
        <div className="hidden md:flex items-center gap-8">
          <a
            href="#features"
            className="text-[13px] font-medium text-text-secondary hover:text-text-primary transition-colors duration-200"
          >
            Features
          </a>
          <a
            href="/watchlist"
            className="text-[13px] font-medium text-text-secondary hover:text-text-primary transition-colors duration-200"
          >
            Watchlist
          </a>
          <a
            href="/calculator"
            className="text-[13px] font-medium text-text-secondary hover:text-text-primary transition-colors duration-200"
          >
            Calculator
          </a>
          <a
            href="/letf"
            className="text-[13px] font-medium text-text-secondary hover:text-text-primary transition-colors duration-200"
          >
            LETF
          </a>
          <a
            href="/stock"
            className="text-[13px] font-medium text-text-secondary hover:text-text-primary transition-colors duration-200"
          >
            Stock
          </a>
          <a
            href="/chain"
            className="text-[13px] font-medium text-text-secondary hover:text-text-primary transition-colors duration-200"
          >
            Chain
          </a>
          <a
            href="/strategies"
            className="text-[13px] font-medium text-text-secondary hover:text-text-primary transition-colors duration-200"
          >
            Strategies
          </a>
          <a
            href="/settings"
            className="text-[13px] font-medium text-text-secondary hover:text-text-primary transition-colors duration-200"
          >
            Settings
          </a>
        </div>

        {/* Auth */}
        <div className="flex items-center gap-3">
          {isLoading ? (
            <div className="h-4 w-20 rounded bg-surface-raised animate-pulse" />
          ) : isAuthenticated ? (
            <>
              <span className="hidden sm:block text-[12px] font-mono text-text-muted truncate max-w-[160px]">
                {user?.email}
              </span>
              <button
                onClick={handleSignOut}
                className="text-[13px] font-medium text-text-secondary hover:text-text-primary transition-colors duration-200 px-3 py-1.5"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <a
                href="/login"
                className="hidden sm:block text-[13px] font-medium text-text-secondary hover:text-text-primary transition-colors duration-200 px-3 py-1.5"
              >
                Sign in
              </a>
              <a
                href="/signup"
                className="relative group text-[13px] font-semibold text-white px-4 py-2 rounded-lg bg-gradient-to-r from-accent to-accent-dim hover:from-accent-bright hover:to-accent transition-all duration-300 shadow-[0_0_20px_rgba(59,130,246,0.2)] hover:shadow-[0_0_30px_rgba(59,130,246,0.3)]"
              >
                Get Early Access
              </a>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
