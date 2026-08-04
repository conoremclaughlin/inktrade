'use client';

import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  Quote,
  OptionChain,
  OptionType,
  LeverageAnalysis,
} from '@inktrade/engine/math';
import type {
  LetfProfile,
  LetfHoldingsData,
  LetfHistoryPoint,
} from '@inktrade/engine/letf';
import type { PortfolioAnalysis, SpreadProjection } from '@inktrade/engine/portfolio';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export function useQuote(symbol: string | null) {
  return useQuery<Quote>({
    queryKey: ['quote', symbol],
    queryFn: () => fetchJson(`/api/quote?symbol=${symbol}`),
    enabled: !!symbol,
    refetchInterval: 30_000,
  });
}

export function useOptionChain(symbol: string | null, opts?: {
  type?: OptionType;
  expiry?: string;
  strikeCount?: number;
}) {
  const params = new URLSearchParams();
  if (symbol) params.set('symbol', symbol);
  if (opts?.type) params.set('type', opts.type);
  if (opts?.expiry) params.set('expiry', opts.expiry);
  if (opts?.strikeCount) params.set('strikeCount', String(opts.strikeCount));

  return useQuery<OptionChain>({
    queryKey: ['chain', symbol, opts?.type, opts?.expiry, opts?.strikeCount],
    queryFn: () => fetchJson(`/api/chain?${params}`),
    enabled: !!symbol,
  });
}

export interface ChainGridData extends OptionChain {
  allExpirations: string[];
}

export function useChainGrid(symbol: string | null, opts?: {
  type?: OptionType;
  offset?: number;
  limit?: number;
}) {
  const params = new URLSearchParams();
  if (symbol) params.set('symbol', symbol);
  if (opts?.type) params.set('type', opts.type);
  if (opts?.offset != null) params.set('offset', String(opts.offset));
  if (opts?.limit != null) params.set('limit', String(opts.limit));

  return useQuery<ChainGridData>({
    queryKey: ['chain-grid', symbol, opts?.type, opts?.offset, opts?.limit],
    queryFn: () => fetchJson(`/api/chain-grid?${params}`),
    enabled: !!symbol,
    placeholderData: (prev) => prev,
  });
}

export interface VolatilityData {
  series: Array<{
    timestamp: string;
    close: number;
    hv20: number | null;
    hv60: number | null;
  }>;
  latestHv20: number;
  latestHv60: number;
  hvPercentileRank: number;
  hvHigh: number;
  hvLow: number;
}

export function useVolatility(symbol: string | null) {
  return useQuery<VolatilityData>({
    queryKey: ['volatility', symbol],
    queryFn: () => fetchJson(`/api/volatility?symbol=${symbol}`),
    enabled: !!symbol,
  });
}

export interface FundamentalsData {
  symbol: string;
  financialCurrency: string;
  exchangeRateToUSD: number | null;
  sharesOutstanding: number;
  marketCap: number;
  trailingEps: number;
  currentFyEps: number;
  nextFyEps: number;
  trailingPe: number | null;
  currentFyPe: number | null;
  nextFyPe: number | null;
  currentFyGrowth: number | null;
  nextFyGrowth: number | null;
  quarters: Array<{
    endDate: string;
    revenue: number;
    grossProfit: number;
    operatingIncome: number;
    netIncome: number;
    grossMarginPct: number;
    eps: number;
    freeCashFlow: number;
    totalAssets: number;
    totalDebt: number;
    totalEquity: number;
    cash: number;
    currentAssets: number;
    currentLiabilities: number;
  }>;
  earnings: {
    nextDate: string | null;
    isEstimate: boolean;
    epsEstimate: {
      avg: number;
      low: number;
      high: number;
      yearAgoEps: number;
      analysts: number;
    } | null;
    revenueEstimate: {
      avg: number;
      low: number;
      high: number;
      analysts: number;
    } | null;
  };
}

export function useFundamentals(symbol: string | null) {
  return useQuery<FundamentalsData>({
    queryKey: ['fundamentals', symbol],
    queryFn: () => fetchJson(`/api/fundamentals?symbol=${symbol}`),
    enabled: !!symbol,
  });
}

export function useLeverage(params: {
  symbol: string | null;
  strike: number | null;
  type: OptionType;
  expiry?: string;
  rangePct?: number;
}) {
  const qs = new URLSearchParams();
  if (params.symbol) qs.set('symbol', params.symbol);
  if (params.strike != null) qs.set('strike', String(params.strike));
  qs.set('type', params.type);
  if (params.expiry) qs.set('expiry', params.expiry);
  if (params.rangePct) qs.set('rangePct', String(params.rangePct));

  return useQuery<LeverageAnalysis>({
    queryKey: ['leverage', params.symbol, params.strike, params.type, params.expiry],
    queryFn: () => fetchJson(`/api/leverage?${qs}`),
    enabled: !!params.symbol && params.strike != null,
  });
}

// --- LETF hooks ---

export interface LetfHistoryResponse {
  symbol: string;
  underlying: string;
  leverageFactor: number;
  period: string;
  points: LetfHistoryPoint[];
  maxDrawdownPct: number;
  totalLetfReturn: number;
  totalUnderlyingReturn: number;
  totalNaiveReturn: number;
  totalDivergence: number;
}

export function useLetfProfile(symbol: string | null) {
  return useQuery<LetfProfile>({
    queryKey: ['letf-profile', symbol],
    queryFn: () => fetchJson(`/api/letf/profile?symbol=${symbol}`),
    enabled: !!symbol,
  });
}

export function useLetfHoldings(symbol: string | null) {
  return useQuery<LetfHoldingsData>({
    queryKey: ['letf-holdings', symbol],
    queryFn: () => fetchJson(`/api/letf/holdings?symbol=${symbol}`),
    enabled: !!symbol,
  });
}

export function useLetfHistory(symbol: string | null, period: string = '1y') {
  return useQuery<LetfHistoryResponse>({
    queryKey: ['letf-history', symbol, period],
    queryFn: () => fetchJson(`/api/letf/history?symbol=${symbol}&period=${period}`),
    enabled: !!symbol,
  });
}

// --- Ticker history (general-purpose) ---

export interface TickerHistoryPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  cumReturn: number;
  volume: number;
}

export interface TickerHistoryResponse {
  symbol: string;
  period: string;
  points: TickerHistoryPoint[];
  totalReturn: number;
  maxDrawdownPct: number;
  annualizedReturn: number;
}

export function useTickerHistory(symbol: string | null, period: string = '1y') {
  return useQuery<TickerHistoryResponse>({
    queryKey: ['ticker-history', symbol, period],
    queryFn: () => fetchJson(`/api/ticker-history?symbol=${symbol}&period=${period}`),
    enabled: !!symbol,
  });
}

// --- Portfolio analysis ---

// --- OI distribution ---

export interface OIStrike {
  strike: number;
  callOI: number;
  putOI: number;
  callVolume: number;
  putVolume: number;
}

export interface OIDistribution {
  symbol: string;
  underlyingPrice: number;
  expirations: string[];
  strikes: OIStrike[];
  maxPainStrike: number;
  totalCallOI: number;
  totalPutOI: number;
  pcRatio: number;
}

export function useOIDistribution(symbol: string | null, expiry?: string) {
  const qs = new URLSearchParams();
  if (symbol) qs.set('symbol', symbol);
  if (expiry) qs.set('expiry', expiry);

  return useQuery<OIDistribution>({
    queryKey: ['oi-distribution', symbol, expiry],
    queryFn: () => fetchJson(`/api/oi-distribution?${qs}`),
    enabled: !!symbol,
    staleTime: 60_000,
  });
}

// --- Schwab auth ---

export interface SchwabStatus {
  status: 'unconfigured' | 'disconnected' | 'expired' | 'connected' | 'configured';
  message?: string;
  authUrl?: string;
  provider?: string;
  credentialSource?: 'env' | 'config';
  redirectUri?: string;
  tokenExpiresAt?: number;
  refreshExpiresAt?: number;
}

export function useSchwabStatus() {
  return useQuery<SchwabStatus>({
    queryKey: ['schwab-status'],
    queryFn: () => fetchJson('/api/auth/schwab'),
    staleTime: 30_000,
  });
}

export function useSchwabConfigure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (creds: { appKey: string; appSecret: string; redirectUri?: string }) => {
      const res = await fetch('/api/auth/schwab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json() as Promise<SchwabStatus>;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schwab-status'] }),
  });
}

export function useSchwabDisconnect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/auth/schwab', { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to disconnect');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schwab-status'] }),
  });
}

// --- Portfolio analysis ---

// --- Theta projection ---

export interface ThetaProjectionParams {
  shortStrike: number;
  longStrike: number;
  spotPrice: number;
  iv: number;
  currentDte: number;
  netCreditReceived: number;
  contracts?: number;
}

export function useThetaProjection(params: ThetaProjectionParams | null) {
  const qs = new URLSearchParams();
  if (params) {
    qs.set('shortStrike', String(params.shortStrike));
    qs.set('longStrike', String(params.longStrike));
    qs.set('spotPrice', String(params.spotPrice));
    qs.set('iv', String(params.iv));
    qs.set('currentDte', String(params.currentDte));
    qs.set('netCreditReceived', String(params.netCreditReceived));
    if (params.contracts) qs.set('contracts', String(params.contracts));
  }

  return useQuery<SpreadProjection>({
    queryKey: ['theta-projection', params],
    queryFn: () => fetchJson(`/api/theta-projection?${qs}`),
    enabled: !!params,
  });
}

// --- Watchlist ---

import { useUser } from '@/lib/hooks/use-auth';

export function useWatchlistSymbols() {
  const { isAuthenticated } = useUser();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ symbols: string[] }>({
    queryKey: ['watchlist'],
    queryFn: () => fetchJson('/api/watchlist'),
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: (symbols: string[]) =>
      fetch('/api/watchlist', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols }),
      }).then((r) => {
        if (!r.ok) throw new Error('Failed to update watchlist');
        return r.json() as Promise<{ symbols: string[] }>;
      }),
    onMutate: async (newSymbols) => {
      await queryClient.cancelQueries({ queryKey: ['watchlist'] });
      const previous = queryClient.getQueryData<{ symbols: string[] }>(['watchlist']);
      queryClient.setQueryData(['watchlist'], { symbols: newSymbols });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['watchlist'], context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });

  const symbols = data?.symbols ?? [];

  const setSymbols = useCallback((next: string[] | ((prev: string[]) => string[])) => {
    const resolved = typeof next === 'function' ? next(symbols) : next;
    mutation.mutate(resolved);
  }, [symbols, mutation]);

  const addSymbol = useCallback((sym: string) => {
    const upper = sym.toUpperCase().trim();
    if (!upper || symbols.includes(upper)) return;
    mutation.mutate([...symbols, upper]);
  }, [symbols, mutation]);

  const removeSymbol = useCallback((sym: string) => {
    mutation.mutate(symbols.filter((s) => s !== sym.toUpperCase()));
  }, [symbols, mutation]);

  const moveSymbol = useCallback((from: number, to: number) => {
    const next = [...symbols];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    mutation.mutate(next);
  }, [symbols, mutation]);

  return { symbols, setSymbols, addSymbol, removeSymbol, moveSymbol, isLoading };
}

export function useWatchlistQuotes(symbols: string[]) {
  const joined = symbols.join(',');
  return useQuery<{ quotes: Quote[] }>({
    queryKey: ['watchlist-quotes', joined],
    queryFn: () => fetchJson(`/api/quotes?symbols=${joined}`),
    enabled: symbols.length > 0,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}

export function usePortfolioAnalysis(symbols: string[], lookback: string = '1y') {
  const sorted = [...symbols].sort().join(',');
  return useQuery<PortfolioAnalysis>({
    queryKey: ['portfolio-analysis', sorted, lookback],
    queryFn: () => fetchJson(`/api/portfolio/analysis?symbols=${sorted}&lookback=${lookback}`),
    enabled: symbols.length >= 2,
    staleTime: 5 * 60_000,
  });
}
