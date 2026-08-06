import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  brokerQuotesQuery,
  costBasisQuery,
  optionChainQuery,
  tradingModeQuery,
  type CostBasisStrategy,
  type OrderRequest,
} from '@inktrade/client';
import { api } from '../lib/api';

/**
 * Trading, over the same query definitions web uses.
 *
 * Thin on purpose. Every decision that matters — which lots a sell consumes,
 * whether placement is allowed at all, what an order will cost — is made on
 * the server and shared through @inktrade/client. Mobile renders it.
 */

export function useBrokerQuotes(symbols: string[]) {
  return useQuery(brokerQuotesQuery(api, symbols));
}

/** The option ladder for one underlying, at one expiration. */
export function useOptionChain(symbol: string | null, expiration?: string) {
  return useQuery(optionChainQuery(api, symbol, expiration));
}

export function useTradingMode() {
  return useQuery(tradingModeQuery(api));
}

export function useCostBasis() {
  return useQuery(costBasisQuery(api));
}

export function useSetCostBasis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (strategy: CostBasisStrategy) => api.setCostBasis(strategy),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['broker', 'cost-basis'] }),
  });
}

export function useReviewOrder() {
  return useMutation({ mutationFn: (order: OrderRequest) => api.reviewOrder(order) });
}

export function usePlaceOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (order: OrderRequest) => api.placeOrder(order),
    onSuccess: (outcome) => {
      // Only on an actual fill: a refusal comes back on the same path, and
      // refetching the portfolio because an order was rejected is noise.
      if (!outcome.receipt) return;
      queryClient.invalidateQueries({ queryKey: ['broker', 'portfolio'] });
      queryClient.invalidateQueries({ queryKey: ['broker', 'orders'] });
      queryClient.invalidateQueries({ queryKey: ['broker', 'tax-lots'] });
    },
  });
}
