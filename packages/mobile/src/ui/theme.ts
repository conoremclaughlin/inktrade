import { Platform } from 'react-native';

/**
 * Inktrade's design tokens, mirrored from packages/web/src/app/globals.css.
 *
 * Kept as a plain object rather than shared with web: web consumes these
 * through Tailwind's @theme, and the two platforms style differently even
 * where the palette is identical.
 */
export const colors = {
  void: '#06080d',
  abyss: '#0a0e18',
  deep: '#0f1422',
  surface: '#151b2e',
  surfaceRaised: '#1a2139',
  surfaceOverlay: '#1f2845',

  borderSubtle: '#1e2640',
  borderDefault: '#2a3355',
  borderBright: '#3d4a70',

  textPrimary: '#e8ecf4',
  textSecondary: '#8892ab',
  textTertiary: '#5a6480',
  textMuted: '#3d4660',

  accent: '#3b82f6',
  accentBright: '#60a5fa',
  accentDim: '#1d4ed8',

  emerald: '#10b981',
  emeraldBright: '#34d399',
  rose: '#f43f5e',
  amber: '#f59e0b',
  violet: '#8b5cf6',
} as const;

export const fonts = {
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) as string,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 6,
  md: 10,
  lg: 14,
} as const;

/** Green for gains, red for losses — matches the web charts. */
export function changeColor(change: number): string {
  return change >= 0 ? colors.emerald : colors.rose;
}

/** Prices need more precision the smaller they get. Mirrors the web formatter. */
export function formatPrice(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1000) {
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

export function formatPercent(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(Math.round(n));
}
