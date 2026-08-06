import { useQuery } from '@tanstack/react-query';
import {
  brokerWatchlistQuery,
  brokerWatchlistsQuery,
  quotesQuery,
} from '@inktrade/client';
import { api } from '../lib/api';

/**
 * The brokerage's own watchlists.
 *
 * Names and counts only — one request. Symbols are fetched per list when it is
 * opened, because a book of seventeen lists would otherwise cost seventeen
 * round trips to render a screen where all but one is collapsed.
 */
export function useBrokerWatchlists() {
  return useQuery(brokerWatchlistsQuery(api));
}

/** Symbols for one list. Disabled until the list is actually opened. */
export function useBrokerWatchlist(id: string | null) {
  return useQuery(brokerWatchlistQuery(api, id));
}

/**
 * Quotes for the symbols on screen.
 *
 * Scoped to the open list rather than every list's contents — quotes refetch
 * on an interval, so widening this would put a recurring cost on symbols
 * nobody is looking at.
 */
export function useWatchlistQuotes(symbols: string[]) {
  return useQuery(quotesQuery(api, symbols));
}
