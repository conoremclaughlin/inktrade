'use client';

import { useQuery } from '@tanstack/react-query';
import {
  brokerQuotesQuery,
  brokerWatchlistQuery,
  brokerWatchlistsQuery,
  earningsQuery,
  optionChainQuery,
  orderActivityQuery,
  portfolioQuery,
} from '@inktrade/client';
import { brokerApi } from './broker-api';

/**
 * Hooks over the linked brokerage.
 *
 * Thin by design — the query definitions live in @inktrade/client so mobile
 * binds to exactly the same keys, stale times and refetch behaviour. Anything
 * that belongs in both platforms belongs upstream of this file.
 *
 * Kept separate from lib/hooks.ts, which serves the Yahoo/Schwab-backed
 * endpoints and has its own OptionChain type meaning something different.
 */

export function usePortfolio() {
  return useQuery(portfolioQuery(brokerApi));
}

export function useOptionChain(symbol: string | null, expiration?: string) {
  return useQuery(optionChainQuery(brokerApi, symbol, expiration));
}

export function useBrokerWatchlists() {
  return useQuery(brokerWatchlistsQuery(brokerApi));
}

export function useBrokerWatchlist(id: string | null) {
  return useQuery(brokerWatchlistQuery(brokerApi, id));
}

/** Live prices for a set of symbols. Idle until there is something to price. */
export function useBrokerQuotes(symbols: string[]) {
  return useQuery(brokerQuotesQuery(brokerApi, symbols));
}

/**
 * Next earnings date for a set of symbols.
 *
 * Not broker-backed — it comes from the market data provider, so it works
 * before anyone links an account. It lives here anyway because it binds to the
 * shared query definition like everything else in this file, and splitting it
 * out by data source would just make callers import from two places.
 */
export function useEarnings(symbols: string[]) {
  return useQuery(earningsQuery(brokerApi, symbols));
}

export function useOrderActivity(symbol?: string, limit?: number) {
  return useQuery(orderActivityQuery(brokerApi, symbol, limit));
}
