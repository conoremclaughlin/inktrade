/**
 * Number formatting for display.
 *
 * Split out from theme.ts because these are pure functions and that file
 * imports react-native for Platform — which made them untestable without
 * standing up the whole RN module graph. Formatting rules that decide whether
 * a portfolio line reads -17,300.00 or -17300.0000 deserve tests.
 */

/**
 * Prices need more precision the smaller they get. Mirrors the web formatter.
 *
 * Thresholds compare the magnitude: a short position at -17300 is not "under a
 * dollar", and reading the sign as smallness rendered it as -17300.0000.
 */
export function formatPrice(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const magnitude = Math.abs(n);
  if (magnitude >= 1000) {
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (magnitude >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

/**
 * A dollar amount — a value, a cost, a realized gain.
 *
 * Distinct from {@link formatPrice}, which prices an *instrument* and earns its
 * extra decimals on penny options. Money is always two places with separators:
 * a portfolio line reading $0.1000 is a formatter leaking through.
 */
export function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPercent(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

/**
 * Large numbers at a glance — volume, open interest, assets under management.
 *
 * Runs to trillions rather than stopping at millions. It was written for
 * volume, where millions is a natural ceiling, and a fund's AUM then rendered
 * as "32831.2M" — technically correct and unreadable, which for a figure whose
 * only job is to be read at a glance is the same as wrong.
 */
export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000_000) return `${(n / 1_000_000_000_000).toFixed(1)}T`;
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(Math.round(n));
}
