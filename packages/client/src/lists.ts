import { normalizeSymbols, type KeyValueStorage } from './watchlist-store.js';

/**
 * Named symbol lists.
 *
 * The current `watchlists` table allows exactly one list per user
 * (unique constraint on user_id). The product needs several — Holdings, Semis,
 * LEAPS — so this is the shape the schema migration lands on, defined here
 * first so screens can be built against it before the table changes.
 */
export interface SymbolList {
  id: string;
  name: string;
  symbols: string[];
}

export interface ListsStore {
  load(): Promise<SymbolList[]>;
  save(lists: SymbolList[]): Promise<SymbolList[]>;
}

export const DEFAULT_LISTS: SymbolList[] = [
  { id: 'memory', name: 'Memory', symbols: ['MU', 'SNDK', 'WDC', 'STX'] },
  { id: 'semis', name: 'Semis', symbols: ['NVDA', 'AVGO', 'TSM', 'AMD', 'SOXX'] },
  { id: 'index', name: 'Index', symbols: ['SPY', 'QQQ', 'IWM'] },
];

export const LISTS_STORAGE_KEY = 'inktrade:lists';

/** Trim names, drop empty ones, normalize symbols, and keep ids unique. */
export function normalizeLists(input: unknown): SymbolList[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: SymbolList[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const candidate = raw as Partial<SymbolList>;
    const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
    const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
    if (!name || !id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name, symbols: normalizeSymbols(candidate.symbols) });
  }
  return out;
}

export function createLocalListsStore(
  storage: KeyValueStorage,
  defaults: SymbolList[] = DEFAULT_LISTS,
): ListsStore {
  return {
    async load() {
      try {
        const raw = await storage.getItem(LISTS_STORAGE_KEY);
        // Nothing stored means a first run; an empty array means the user
        // deleted everything, which we must not silently undo.
        if (raw === null) return defaults.map((l) => ({ ...l, symbols: [...l.symbols] }));
        return normalizeLists(JSON.parse(raw));
      } catch {
        return defaults.map((l) => ({ ...l, symbols: [...l.symbols] }));
      }
    },
    async save(lists) {
      const normalized = normalizeLists(lists);
      await storage.setItem(LISTS_STORAGE_KEY, JSON.stringify(normalized));
      return normalized;
    },
  };
}

/** Every symbol across every list, deduped — one quotes request covers them all. */
export function allListSymbols(lists: SymbolList[]): string[] {
  return normalizeSymbols(lists.flatMap((l) => l.symbols));
}
