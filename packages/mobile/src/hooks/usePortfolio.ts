import { useQuery } from '@tanstack/react-query';
import { portfolioQuery } from '@inktrade/client';
import type { PortfolioHistory, PortfolioPeriod, PortfolioSummary } from '@inktrade/client';
import { api } from '../lib/api';
import { broker } from '../lib/broker';

export const portfolioKeys = {
  history: (period: PortfolioPeriod) => ['portfolio', 'history', period] as const,
};

/**
 * The portfolio, from the linked brokerage via our own API.
 *
 * The query definition comes from @inktrade/client, so this shares cache
 * identity, stale time and refetch behaviour with the web app exactly. The two
 * platforms differ only in what they draw.
 */
export function usePortfolio() {
  const query = useQuery(portfolioQuery(api));

  return {
    ...query,
    /** Unwrapped, so screens bind to the contract rather than the envelope. */
    summary: query.data?.summary as PortfolioSummary | undefined,
    isMock: query.data?.isMock ?? false,
    provider: query.data?.provider,
  };
}

/**
 * The value curve.
 *
 * Still the mock, and deliberately so: no brokerage we support returns
 * portfolio value history — Robinhood has no such tool, Schwab no such
 * endpoint — so a real curve requires our own snapshots, which don't exist
 * yet. Screens must keep labelling this as sample data until they do.
 */
export function usePortfolioHistory(period: PortfolioPeriod) {
  return useQuery<PortfolioHistory>({
    queryKey: portfolioKeys.history(period),
    queryFn: () => broker.getPortfolioHistory(period),
    // Keep the previous curve on screen while the next period loads, so
    // switching periods doesn't blink the chart away.
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });
}
