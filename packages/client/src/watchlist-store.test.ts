import { describe, it, expect } from 'vitest';
import {
  normalizeSymbols,
  createLocalWatchlistStore,
  MAX_WATCHLIST_SYMBOLS,
  WATCHLIST_STORAGE_KEY,
  type KeyValueStorage,
} from './watchlist-store.js';

function memoryStorage(initial?: Record<string, string>): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
  };
}

describe('normalizeSymbols', () => {
  it('uppercases and trims', () => {
    expect(normalizeSymbols([' nvda ', 'spy'])).toEqual(['NVDA', 'SPY']);
  });

  it('drops duplicates while preserving first-seen order', () => {
    expect(normalizeSymbols(['SPY', 'nvda', 'spy', 'NVDA'])).toEqual(['SPY', 'NVDA']);
  });

  it('drops blanks and non-strings', () => {
    expect(normalizeSymbols(['SPY', '', '   ', 42, null, 'QQQ'])).toEqual(['SPY', 'QQQ']);
  });

  it('caps the list length', () => {
    const many = Array.from({ length: 150 }, (_, i) => `S${i}`);
    expect(normalizeSymbols(many)).toHaveLength(MAX_WATCHLIST_SYMBOLS);
  });

  it('returns empty for non-array input', () => {
    expect(normalizeSymbols('SPY')).toEqual([]);
    expect(normalizeSymbols(undefined)).toEqual([]);
  });
});

describe('createLocalWatchlistStore', () => {
  it('falls back to defaults when nothing is stored', async () => {
    const store = createLocalWatchlistStore(memoryStorage(), ['SPY', 'QQQ']);
    expect(await store.load()).toEqual(['SPY', 'QQQ']);
  });

  it('round-trips saved symbols', async () => {
    const storage = memoryStorage();
    const store = createLocalWatchlistStore(storage, ['SPY']);
    await store.save([' nvda ', 'amd', 'nvda']);
    expect(await store.load()).toEqual(['NVDA', 'AMD']);
  });

  it('treats a stored empty list as intentional, not missing', async () => {
    const storage = memoryStorage({ [WATCHLIST_STORAGE_KEY]: '[]' });
    const store = createLocalWatchlistStore(storage, ['SPY']);
    expect(await store.load()).toEqual([]);
  });

  it('falls back to defaults on corrupt stored data', async () => {
    const storage = memoryStorage({ [WATCHLIST_STORAGE_KEY]: 'not json{' });
    const store = createLocalWatchlistStore(storage, ['SPY']);
    expect(await store.load()).toEqual(['SPY']);
  });
});
