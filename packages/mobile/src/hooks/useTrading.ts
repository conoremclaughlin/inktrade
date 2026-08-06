import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  brokerQuotesQuery,
  costBasisQuery,
  optionChainQuery,
  orderActivityQuery,
  tradingModeQuery,
  type CostBasisStrategy,
  type OrderRequest,
  type TradingMode,
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

/** What you did in a name — or everything, when no symbol is given. */
export function useOrderActivity(symbol?: string, limit?: number) {
  return useQuery(orderActivityQuery(api, symbol, limit));
}

export function useTradingMode() {
  return useQuery(tradingModeQuery(api));
}

export function useCostBasis() {
  return useQuery(costBasisQuery(api));
}

/**
 * Turn order placement on or off.
 *
 * Refused server-side while a deployment-level override is active, so the
 * mutation can fail even when the switch looks available — the response is the
 * source of truth, not the toggle.
 */
export function useSetTradingMode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mode: TradingMode) => api.setTradingMode(mode),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['broker', 'trading-mode'] }),
  });
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
