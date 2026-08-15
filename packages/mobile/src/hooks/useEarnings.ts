import { useQuery } from '@tanstack/react-query';
import { earningsQuery } from '@inktrade/client';
import { api } from '../lib/api';

/**
 * Next earnings date for a set of symbols.
 *
 * One request for the whole list — a portfolio screen asking per symbol would
 * be twenty round trips over a mobile link to render one row of badges.
 *
 * Binds to the shared query definition, so the phone and the desktop cache
 * this under the same key with the same stale time and can't drift.
 */
export function useEarnings(symbols: string[]) {
  return useQuery(earningsQuery(api, symbols));
}
