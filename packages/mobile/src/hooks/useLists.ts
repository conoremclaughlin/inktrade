import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  allListSymbols,
  createLocalListsStore,
  quotesQuery,
  type KeyValueStorage,
  type SymbolList,
} from '@inktrade/client';
import { api } from '../lib/api';

const storage: KeyValueStorage = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
};

/**
 * Named lists, stored on-device.
 *
 * Mobile has no auth yet, so this is the local implementation of ListsStore.
 * When the lists migration and auth land, only this binding changes.
 */
const listsStore = createLocalListsStore(storage);

const LISTS_KEY = ['lists'] as const;

export function useLists() {
  const queryClient = useQueryClient();

  const { data: lists = [], isLoading } = useQuery({
    queryKey: LISTS_KEY,
    queryFn: () => listsStore.load(),
    staleTime: Infinity,
  });

  const mutation = useMutation({
    mutationFn: (next: SymbolList[]) => listsStore.save(next),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: LISTS_KEY });
      const previous = queryClient.getQueryData<SymbolList[]>(LISTS_KEY);
      queryClient.setQueryData(LISTS_KEY, next);
      return { previous };
    },
    onError: (_e, _next, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(LISTS_KEY, ctx.previous);
    },
    onSuccess: (saved) => queryClient.setQueryData(LISTS_KEY, saved),
  });

  const addSymbol = useCallback(
    (listId: string, symbol: string) => {
      const sym = symbol.trim().toUpperCase();
      if (!sym) return;
      mutation.mutate(
        lists.map((l) =>
          l.id === listId && !l.symbols.includes(sym)
            ? { ...l, symbols: [...l.symbols, sym] }
            : l,
        ),
      );
    },
    [lists, mutation],
  );

  const removeSymbol = useCallback(
    (listId: string, symbol: string) => {
      mutation.mutate(
        lists.map((l) =>
          l.id === listId ? { ...l, symbols: l.symbols.filter((s) => s !== symbol) } : l,
        ),
      );
    },
    [lists, mutation],
  );

  return { lists, isLoading, addSymbol, removeSymbol };
}

/** One quotes request covering every symbol across every list. */
export function useListQuotes(lists: SymbolList[]) {
  return useQuery(quotesQuery(api, allListSymbols(lists)));
}
