'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Navbar } from '@/components/navbar';
import { useSchwabStatus, useSchwabConfigure, useSchwabDisconnect } from '@/lib/hooks';

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const linked = searchParams.get('linked');
  const error = searchParams.get('error');

  const { data: status, isLoading } = useSchwabStatus();
  const configure = useSchwabConfigure();
  const disconnect = useSchwabDisconnect();

  const [appKey, setAppKey] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [showCredentials, setShowCredentials] = useState(false);

  useEffect(() => {
    if (linked === 'true') {
      window.history.replaceState(null, '', '/settings');
    }
  }, [linked]);

  const handleConfigure = () => {
    if (!appKey.trim() || !appSecret.trim()) return;
    configure.mutate({ appKey: appKey.trim(), appSecret: appSecret.trim() });
  };

  const handleDisconnect = () => {
    disconnect.mutate();
  };

  const isConnected = status?.status === 'connected';
  const isConfigured = status?.status === 'configured' || status?.status === 'disconnected' || status?.status === 'expired';
  const needsReauth = status?.status === 'expired';
  // Env credentials take precedence over the config file, so editing the form
  // there would be a no-op — hide it and say where the values came from.
  const isEnvConfigured = status?.credentialSource === 'env';

  return (
    <div className="min-h-screen bg-void">
      <Navbar />
      <main className="mx-auto max-w-[800px] pt-24 pb-16 px-4 sm:px-6">
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-text-primary">
            Settings
          </h1>
          <p className="text-[14px] text-text-tertiary mt-1">
            Manage your data providers and account connections
          </p>
        </div>

        {/* Success banner */}
        {linked === 'true' && (
          <div className="mb-6 rounded-xl border border-emerald/30 bg-emerald/5 p-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-emerald/20 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald" />
                </svg>
              </div>
              <div>
                <p className="text-[14px] font-semibold text-emerald">Schwab Account Linked</p>
                <p className="text-[12px] text-text-tertiary">Your account is connected and set as the active data provider.</p>
              </div>
            </div>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="mb-6 rounded-xl border border-rose/30 bg-rose/5 p-4">
            <p className="text-[13px] font-mono text-rose">
              {error === 'no_code' ? 'No authorization code received from Schwab.' :
               error === 'not_configured' ? 'Schwab credentials not configured. Add them below.' :
               decodeURIComponent(error)}
            </p>
          </div>
        )}

        {/* Schwab Connection Card */}
        <section className="glass-bright rounded-xl border border-border-subtle overflow-hidden">
          <div className="px-6 py-4 border-b border-border-subtle flex items-center justify-between">
            <div>
              <h2 className="text-[16px] font-semibold text-text-primary">Schwab Account</h2>
              <p className="text-[12px] text-text-tertiary mt-0.5">
                Connect your Charles Schwab account for real-time market data and option chains
              </p>
            </div>
            <StatusBadge status={status?.status} isLoading={isLoading} />
          </div>

          <div className="p-6">
            {isLoading && (
              <div className="flex items-center gap-3 py-4">
                <div className="h-5 w-5 rounded-full border-2 border-accent/40 border-t-accent animate-spin" />
                <span className="text-[13px] text-text-muted">Checking connection...</span>
              </div>
            )}

            {/* Connected state */}
            {isConnected && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="glass rounded-lg px-4 py-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">Provider</div>
                    <div className="text-[14px] font-mono font-bold text-emerald">Schwab</div>
                  </div>
                  <div className="glass rounded-lg px-4 py-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1">Refresh Expires</div>
                    <div className="text-[14px] font-mono font-bold text-text-primary">
                      {status?.refreshExpiresAt
                        ? formatTimeRemaining(status.refreshExpiresAt)
                        : '—'}
                    </div>
                  </div>
                </div>
                <p className="text-[12px] text-text-tertiary">
                  Schwab refresh tokens expire after 7 days. You&apos;ll need to re-authenticate when the token expires.
                </p>
                <button
                  onClick={handleDisconnect}
                  disabled={disconnect.isPending}
                  className="text-[13px] font-medium text-rose hover:text-rose/80 transition-colors"
                >
                  {disconnect.isPending ? 'Disconnecting...' : 'Disconnect Account'}
                </button>
              </div>
            )}

            {/* Needs reauth */}
            {needsReauth && status?.authUrl && (
              <div className="space-y-4">
                <p className="text-[13px] text-amber-400">
                  Your Schwab refresh token has expired. Re-authenticate to continue using Schwab data.
                </p>
                <a
                  href={status.authUrl}
                  className="inline-flex items-center gap-2 text-[13px] font-semibold text-white px-5 py-2.5 rounded-lg bg-gradient-to-r from-accent to-accent-dim hover:from-accent-bright hover:to-accent transition-all duration-300"
                >
                  Re-authenticate with Schwab
                </a>
              </div>
            )}

            {/* Configured but not connected */}
            {status?.status === 'disconnected' && status?.authUrl && (
              <div className="space-y-4">
                <p className="text-[13px] text-text-secondary">
                  Credentials are configured. Click below to authorize with Schwab.
                </p>
                <a
                  href={status.authUrl}
                  className="inline-flex items-center gap-2 text-[13px] font-semibold text-white px-5 py-2.5 rounded-lg bg-gradient-to-r from-accent to-accent-dim hover:from-accent-bright hover:to-accent transition-all duration-300"
                >
                  Link Schwab Account
                </a>
              </div>
            )}

            {/* App credentials supplied by the environment */}
            {isEnvConfigured && (
              <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-border-subtle bg-surface/50 px-3 py-2.5">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="mt-0.5 flex-shrink-0 text-text-muted">
                  <path d="M5 6V4.5a3 3 0 016 0V6m-7 0h8a1 1 0 011 1v5a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <p className="text-[12px] text-text-tertiary">
                  App credentials loaded from{' '}
                  <code className="font-mono text-text-secondary">SCHWAB_APP_KEY</code> /{' '}
                  <code className="font-mono text-text-secondary">SCHWAB_APP_SECRET</code>. Edit{' '}
                  <code className="font-mono text-text-secondary">.env.local</code> to change them.
                </p>
              </div>
            )}

            {/* Unconfigured — show credential form */}
            {!isEnvConfigured && (status?.status === 'unconfigured' || showCredentials) && (
              <div className="space-y-4">
                {!showCredentials && (
                  <p className="text-[13px] text-text-secondary">
                    To connect Schwab, you&apos;ll need an app registered at{' '}
                    <a href="https://developer.schwab.com" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-bright underline">
                      developer.schwab.com
                    </a>
                    {' '}with callback URL:{' '}
                    <code className="text-[12px] font-mono text-text-primary bg-surface px-1.5 py-0.5 rounded">
                      https://127.0.0.1:6001/api/auth/schwab/callback
                    </code>
                  </p>
                )}
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">
                      App Key
                    </label>
                    <input
                      type="text"
                      value={appKey}
                      onChange={(e) => setAppKey(e.target.value)}
                      placeholder="Your Schwab app key"
                      className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-2 text-[13px] font-mono text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent/50"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">
                      App Secret
                    </label>
                    <input
                      type="password"
                      value={appSecret}
                      onChange={(e) => setAppSecret(e.target.value)}
                      placeholder="Your Schwab app secret"
                      className="w-full bg-surface border border-border-subtle rounded-lg px-3 py-2 text-[13px] font-mono text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent/50"
                    />
                  </div>
                  <button
                    onClick={handleConfigure}
                    disabled={configure.isPending || !appKey.trim() || !appSecret.trim()}
                    className="text-[13px] font-semibold text-white px-5 py-2.5 rounded-lg bg-gradient-to-r from-accent to-accent-dim hover:from-accent-bright hover:to-accent transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {configure.isPending ? 'Saving...' : 'Save & Continue'}
                  </button>

                  {configure.isSuccess && configure.data?.authUrl && (
                    <div className="mt-3 p-3 rounded-lg border border-emerald/30 bg-emerald/5">
                      <p className="text-[13px] text-text-secondary mb-2">Credentials saved. Now authorize with Schwab:</p>
                      <a
                        href={configure.data.authUrl}
                        className="inline-flex items-center gap-2 text-[13px] font-semibold text-white px-5 py-2.5 rounded-lg bg-gradient-to-r from-accent to-accent-dim hover:from-accent-bright hover:to-accent transition-all duration-300"
                      >
                        Link Schwab Account
                      </a>
                    </div>
                  )}

                  {configure.isError && (
                    <p className="text-[13px] text-rose">{(configure.error as Error).message}</p>
                  )}
                </div>
              </div>
            )}

            {/* Toggle credentials form when already configured */}
            {isConfigured && !showCredentials && !isEnvConfigured && (
              <button
                onClick={() => setShowCredentials(true)}
                className="mt-3 text-[12px] text-text-tertiary hover:text-text-secondary transition-colors"
              >
                Update credentials
              </button>
            )}
          </div>
        </section>

        {/* Current Provider Info */}
        <section className="mt-6 glass-bright rounded-xl border border-border-subtle overflow-hidden">
          <div className="px-6 py-4 border-b border-border-subtle">
            <h2 className="text-[16px] font-semibold text-text-primary">Data Provider</h2>
          </div>
          <div className="p-6">
            <div className="flex items-center gap-4">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${isConnected ? 'bg-emerald/10' : 'bg-accent/10'}`}>
                <span className="text-[16px] font-bold font-mono">
                  {isConnected ? 'S' : 'Y'}
                </span>
              </div>
              <div>
                <p className="text-[14px] font-semibold text-text-primary">
                  {isConnected ? 'Charles Schwab' : 'Yahoo Finance'}
                </p>
                <p className="text-[12px] text-text-tertiary">
                  {isConnected
                    ? 'Real-time quotes, option chains with greeks, price history'
                    : 'Free delayed quotes and historical data (default)'}
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function StatusBadge({ status, isLoading }: { status?: string; isLoading: boolean }) {
  if (isLoading) return null;

  const config: Record<string, { label: string; color: string }> = {
    connected: { label: 'Connected', color: 'bg-emerald/20 text-emerald border-emerald/30' },
    disconnected: { label: 'Not Linked', color: 'bg-surface text-text-muted border-border-subtle' },
    expired: { label: 'Expired', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
    unconfigured: { label: 'Not Set Up', color: 'bg-surface text-text-muted border-border-subtle' },
    configured: { label: 'Ready', color: 'bg-accent/20 text-accent border-accent/30' },
  };

  const c = config[status ?? 'unconfigured'] ?? config.unconfigured;

  return (
    <span className={`text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full border ${c.color}`}>
      {c.label}
    </span>
  );
}

function formatTimeRemaining(expiresAt: number): string {
  const diff = expiresAt - Date.now();
  if (diff <= 0) return 'Expired';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  return `${hours}h`;
}
