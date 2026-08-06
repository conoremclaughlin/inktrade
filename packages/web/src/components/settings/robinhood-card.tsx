'use client';

import { useRobinhoodDisconnect, useRobinhoodStatus } from '@/lib/hooks';

/**
 * Connect-your-brokerage card for Robinhood.
 *
 * Connecting is a single link to /api/auth/robinhood/start, which begins the
 * flow server-side and redirects — the browser never sees a client id, a PKCE
 * challenge, or a raw authorization URL.
 */
export function RobinhoodCard() {
  const { data: status, isLoading } = useRobinhoodStatus();
  const disconnect = useRobinhoodDisconnect();

  const isConnected = status?.status === 'connected';
  const isUnavailable = status?.status === 'unavailable';

  return (
    <section className="mt-6 glass-bright rounded-xl border border-border-subtle overflow-hidden">
      <div className="px-6 py-4 border-b border-border-subtle flex items-center justify-between gap-4">
        <div>
          <h2 className="text-[16px] font-semibold text-text-primary">Robinhood</h2>
          <p className="text-[12px] text-text-tertiary mt-0.5">
            Positions, options and order history for your portfolio view
          </p>
        </div>
        <StatusBadge status={status?.status} isLoading={isLoading} />
      </div>

      <div className="p-6">
        {isLoading && (
          <div className="flex items-center gap-3 py-1">
            <div className="h-5 w-5 rounded-full border-2 border-accent/40 border-t-accent animate-spin" />
            <span className="text-[13px] text-text-muted">Checking connection...</span>
          </div>
        )}

        {isConnected && (
          <div className="space-y-4">
            <p className="text-[13px] text-text-secondary">
              Reading positions, balances and order history across your accounts.
            </p>
            <button
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
              className="text-[13px] font-medium text-rose hover:text-rose/80 transition-colors disabled:opacity-50"
            >
              {disconnect.isPending ? 'Disconnecting...' : 'Disconnect Robinhood'}
            </button>
          </div>
        )}

        {status?.status === 'disconnected' && (
          <div className="space-y-4">
            <p className="text-[13px] text-text-secondary">
              You&apos;ll approve access on Robinhood&apos;s site. Inktrade never sees your
              password.
            </p>
            <a
              href="/api/auth/robinhood/start"
              className="inline-flex items-center gap-2 text-[13px] font-semibold text-white px-5 py-2.5 rounded-lg bg-gradient-to-r from-accent to-accent-dim hover:from-accent-bright hover:to-accent transition-all duration-300"
            >
              Connect Robinhood
            </a>
          </div>
        )}

        {isUnavailable && (
          <div className="space-y-2">
            <p className="text-[13px] text-amber-400">Can&apos;t link from this address.</p>
            <p className="text-[12px] text-text-tertiary leading-relaxed">
              Robinhood only accepts loopback redirects, so a brokerage can only be linked from
              Inktrade running on your own machine — never from a deployed instance.
            </p>
          </div>
        )}

        {/*
          Stated up front rather than buried: the same grant that reads a
          portfolio can also place orders, and it matters that we don't.
        */}
        {!isLoading && !isUnavailable && (
          <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-border-subtle bg-surface/50 px-3 py-2.5">
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              className="mt-0.5 flex-shrink-0 text-text-muted"
            >
              <path
                d="M5 6V4.5a3 3 0 016 0V6m-7 0h8a1 1 0 011 1v5a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1z"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p className="text-[12px] text-text-tertiary">
              Read-only. Inktrade never places or cancels orders.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function StatusBadge({ status, isLoading }: { status?: string; isLoading: boolean }) {
  if (isLoading) return null;

  const config: Record<string, { label: string; color: string }> = {
    connected: { label: 'Connected', color: 'bg-emerald/20 text-emerald border-emerald/30' },
    disconnected: {
      label: 'Not Linked',
      color: 'bg-surface text-text-muted border-border-subtle',
    },
    unavailable: {
      label: 'Unavailable',
      color: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    },
  };

  const c = config[status ?? 'disconnected'] ?? config.disconnected;

  return (
    <span
      className={`text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full border whitespace-nowrap ${c.color}`}
    >
      {c.label}
    </span>
  );
}
