import { describe, it, expect } from 'vitest';
import {
  allListSymbols,
  createLocalListsStore,
  normalizeLists,
  LISTS_STORAGE_KEY,
  type SymbolList,
} from './lists.js';
import type { KeyValueStorage } from './watchlist-store.js';

function memoryStorage(initial?: Record<string, string>): KeyValueStorage {
  const data = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v); },
  };
}

describe('normalizeLists', () => {
  it('normalizes symbols within each list', () => {
    expect(normalizeLists([{ id: 'a', name: 'A', symbols: [' mu ', 'nvda', 'MU'] }])).toEqual([
      { id: 'a', name: 'A', symbols: ['MU', 'NVDA'] },
    ]);
  });

  it('drops lists missing an id or name', () => {
    const input = [
      { id: 'a', name: '', symbols: [] },
      { id: '', name: 'B', symbols: [] },
      { id: 'c', name: 'C', symbols: [] },
    ];
    expect(normalizeLists(input).map((l) => l.id)).toEqual(['c']);
  });

  it('drops duplicate ids, keeping the first', () => {
    const input = [
      { id: 'a', name: 'First', symbols: [] },
      { id: 'a', name: 'Second', symbols: [] },
    ];
    expect(normalizeLists(input)).toHaveLength(1);
    expect(normalizeLists(input)[0].name).toBe('First');
  });

  it('trims whitespace from names', () => {
    expect(normalizeLists([{ id: 'a', name: '  Semis  ', symbols: [] }])[0].name).toBe('Semis');
  });

  it('returns empty for non-array input', () => {
    expect(normalizeLists('nope')).toEqual([]);
    expect(normalizeLists(undefined)).toEqual([]);
  });
});

describe('createLocalListsStore', () => {
  it('returns defaults on first run', async () => {
    const store = createLocalListsStore(memoryStorage());
    const lists = await store.load();
    expect(lists.length).toBeGreaterThan(0);
    expect(lists.some((l) => l.name === 'Memory')).toBe(true);
  });

  it('does not hand out a reference to the defaults', async () => {
    const defaults: SymbolList[] = [{ id: 'a', name: 'A', symbols: ['MU'] }];
    const store = createLocalListsStore(memoryStorage(), defaults);
    const loaded = await store.load();
    loaded[0].symbols.push('NVDA');
    // Mutating what load() returned must not corrupt the defaults for the
    // next caller.
    expect(defaults[0].symbols).toEqual(['MU']);
  });

  it('round-trips saved lists', async () => {
    const storage = memoryStorage();
    const store = createLocalListsStore(storage);
    await store.save([{ id: 'x', name: 'Mine', symbols: ['nvda', 'mu'] }]);
    expect(await store.load()).toEqual([{ id: 'x', name: 'Mine', symbols: ['NVDA', 'MU'] }]);
  });

  it('treats a stored empty array as intentional, not missing', async () => {
    const storage = memoryStorage({ [LISTS_STORAGE_KEY]: '[]' });
    expect(await createLocalListsStore(storage).load()).toEqual([]);
  });

  it('falls back to defaults on corrupt data', async () => {
    const storage = memoryStorage({ [LISTS_STORAGE_KEY]: '{{{' });
    expect((await createLocalListsStore(storage).load()).length).toBeGreaterThan(0);
  });
});

describe('allListSymbols', () => {
  it('flattens and dedupes across lists', () => {
    const lists: SymbolList[] = [
      { id: 'a', name: 'A', symbols: ['MU', 'NVDA'] },
      { id: 'b', name: 'B', symbols: ['NVDA', 'AVGO'] },
    ];
    expect(allListSymbols(lists)).toEqual(['MU', 'NVDA', 'AVGO']);
  });
});
