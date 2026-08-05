import { useQuery } from '@tanstack/react-query';
import type { PortfolioPeriod } from '@inktrade/client';
import { broker } from '../lib/broker';

export const portfolioKeys = {
  summary: () => ['portfolio', 'summary'] as const,
  history: (period: PortfolioPeriod) => ['portfolio', 'history', period] as const,
};

export function usePortfolio() {
  return useQuery({
    queryKey: portfolioKeys.summary(),
    queryFn: () => broker.getPortfolio(),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function usePortfolioHistory(period: PortfolioPeriod) {
  return useQuery({
    queryKey: portfolioKeys.history(period),
    queryFn: () => broker.getPortfolioHistory(period),
    // Keep the previous curve on screen while the next period loads, so
    // switching periods doesn't blink the chart away.
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });
}
