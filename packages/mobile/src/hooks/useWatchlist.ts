import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys, quotesQuery } from '@inktrade/client';
import { api } from '../lib/api';
import { watchlistStore } from '../lib/storage';

/**
 * Watchlist symbols plus mutators, mirroring the web hook's public shape so
 * the two platforms stay conceptually identical. Persistence is delegated to
 * the injected store, which is local on mobile and server-backed on web.
 */
export function useWatchlistSymbols() {
  const queryClient = useQueryClient();

  const { data: symbols = [], isLoading } = useQuery({
    queryKey: queryKeys.watchlist(),
    queryFn: () => watchlistStore.load(),
    staleTime: Infinity,
  });

  const mutation = useMutation({
    mutationFn: (next: string[]) => watchlistStore.save(next),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.watchlist() });
      const previous = queryClient.getQueryData<string[]>(queryKeys.watchlist());
      queryClient.setQueryData(queryKeys.watchlist(), next);
      return { previous };
    },
    onError: (_err, _next, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.watchlist(), context.previous);
      }
    },
    onSuccess: (saved) => {
      // The store normalizes (uppercase/dedup/cap) — take its word over ours.
      queryClient.setQueryData(queryKeys.watchlist(), saved);
    },
  });

  const setSymbols = useCallback((next: string[]) => mutation.mutate(next), [mutation]);

  const addSymbol = useCallback(
    (symbol: string) => {
      const sym = symbol.trim().toUpperCase();
      if (!sym || symbols.includes(sym)) return;
      mutation.mutate([...symbols, sym]);
    },
    [symbols, mutation],
  );

  const removeSymbol = useCallback(
    (symbol: string) => mutation.mutate(symbols.filter((s) => s !== symbol)),
    [symbols, mutation],
  );

  return { symbols, isLoading, setSymbols, addSymbol, removeSymbol };
}

export function useWatchlistQuotes(symbols: string[]) {
  return useQuery(quotesQuery(api, symbols));
}
