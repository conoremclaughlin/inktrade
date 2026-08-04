import type { ApiClient } from './client.js';

export const DEFAULT_WATCHLIST = [
  'SPY', 'QQQ', 'IWM', 'VIX', 'NVDA', 'AMD', 'AVGO', 'TSM',
  'AAPL', 'GOOG', 'AMZN', 'MSFT', 'TSLA', 'SOXL', 'NFLX', 'NET',
];

export const MAX_WATCHLIST_SYMBOLS = 100;

/** Uppercase, trim, drop blanks and duplicates, cap length. Order is preserved. */
export function normalizeSymbols(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const sym = raw.trim().toUpperCase();
    if (!sym || seen.has(sym)) continue;
    seen.add(sym);
    out.push(sym);
    if (out.length >= MAX_WATCHLIST_SYMBOLS) break;
  }
  return out;
}

/**
 * Where a user's watchlist lives.
 *
 * Web is server-backed via the authed API. Mobile has no auth yet, so it uses
 * a local store with the same shape — swapping to the server impl once mobile
 * auth lands should not touch any screen code.
 */
export interface WatchlistStore {
  load(): Promise<string[]>;
  save(symbols: string[]): Promise<string[]>;
}

export function createServerWatchlistStore(api: ApiClient): WatchlistStore {
  return {
    async load() {
      const { symbols } = await api.getWatchlist();
      return normalizeSymbols(symbols);
    },
    async save(symbols) {
      const { symbols: saved } = await api.putWatchlist(normalizeSymbols(symbols));
      return normalizeSymbols(saved);
    },
  };
}

/** Minimal storage contract — satisfied by AsyncStorage and by localStorage. */
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
}

export const WATCHLIST_STORAGE_KEY = 'inktrade:watchlist';

export function createLocalWatchlistStore(
  storage: KeyValueStorage,
  defaults: string[] = DEFAULT_WATCHLIST,
): WatchlistStore {
  return {
    async load() {
      try {
        const raw = await storage.getItem(WATCHLIST_STORAGE_KEY);
        if (!raw) return [...defaults];
        const parsed = normalizeSymbols(JSON.parse(raw));
        // An empty stored list is a real state (user removed everything) —
        // only fall back to defaults when nothing was ever stored.
        return parsed;
      } catch {
        return [...defaults];
      }
    },
    async save(symbols) {
      const normalized = normalizeSymbols(symbols);
      await storage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(normalized));
      return normalized;
    },
  };
}
