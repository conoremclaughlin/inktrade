import { useCallback, useMemo, useRef, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { OPTION_QUOTE_BATCH, optionContractsQuery } from './queries.js';
import type { ApiClient } from './client.js';
import type { OptionContract } from './broker/types.js';

/**
 * Fill in option prices as their strikes come into view.
 *
 * A chain returns every contract definition — hundreds of them — but prices
 * only a window around the money, because each batch of 20 quotes is its own
 * upstream round trip. Rather than choosing between a slow full load and an
 * arbitrary cap, the ladder renders complete and unpriced rows fetch their own
 * quotes when someone actually scrolls to them.
 *
 * Chunks are sized to the upstream batch limit so a visible chunk is exactly
 * one request, and each is its own query — so React Query handles caching,
 * deduplication and in-flight collapsing rather than this hook.
 *
 * Shared rather than per-platform because only the *trigger* differs: web
 * observes rows with an IntersectionObserver, React Native reports viewable
 * items off a FlatList. Both end up calling {@link revealContract}, and the
 * decision about what that costs belongs in one place.
 */
export function useChainQuotes(api: ApiClient, contracts: OptionContract[]) {
  const [visibleChunks, setVisibleChunks] = useState<ReadonlySet<number>>(new Set());

  // Contracts that arrived without a price, grouped into request-sized chunks.
  const chunks = useMemo(() => {
    const unpriced = contracts.filter((c) => c.mark === null).map((c) => c.id);
    const grouped: string[][] = [];
    for (let i = 0; i < unpriced.length; i += OPTION_QUOTE_BATCH) {
      grouped.push(unpriced.slice(i, i + OPTION_QUOTE_BATCH));
    }
    return grouped;
  }, [contracts]);

  /** Which chunk a contract belongs to, so a row can announce itself. */
  const chunkOf = useMemo(() => {
    const index = new Map<string, number>();
    chunks.forEach((ids, i) => ids.forEach((id) => index.set(id, i)));
    return index;
  }, [chunks]);

  const results = useQueries({
    queries: chunks.map((ids, i) => optionContractsQuery(api, ids, visibleChunks.has(i))),
  });

  const priced = useMemo(() => {
    const byId = new Map<string, OptionContract>();
    for (const result of results) {
      for (const contract of result.data?.contracts ?? []) byId.set(contract.id, contract);
    }
    return byId;
  }, [results]);

  // Chunks already seen stay requested — scrolling back up should not refetch,
  // and React Query's cache would serve it anyway.
  const seen = useRef<Set<number>>(new Set());

  const revealContract = useCallback(
    (id: string) => {
      const chunk = chunkOf.get(id);
      if (chunk === undefined || seen.current.has(chunk)) return;
      seen.current.add(chunk);
      setVisibleChunks(new Set(seen.current));
    },
    [chunkOf],
  );

  const isLoadingContract = useCallback(
    (id: string) => {
      const chunk = chunkOf.get(id);
      return chunk !== undefined && results[chunk]?.isFetching === true;
    },
    [chunkOf, results],
  );

  return { priced, revealContract, isLoadingContract, pendingChunks: chunks.length };
}
