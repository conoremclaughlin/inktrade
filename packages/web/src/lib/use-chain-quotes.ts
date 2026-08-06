'use client';

import { useChainQuotes as useSharedChainQuotes } from '@inktrade/client/hooks';
import type { OptionContract } from '@inktrade/client';
import { brokerApi } from './broker-api';

/**
 * Chain prices, filled in as strikes scroll into view.
 *
 * The chunking and caching now live in @inktrade/client so mobile gets the
 * same behaviour rather than a second implementation of it — only the trigger
 * differs, and that stays in the view (IntersectionObserver here, FlatList
 * viewability there). This binds the web API client and nothing else.
 */
export function useChainQuotes(contracts: OptionContract[]) {
  return useSharedChainQuotes(brokerApi, contracts);
}
