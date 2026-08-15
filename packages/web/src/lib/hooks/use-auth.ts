'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

interface AuthUser {
  id: string;
  email: string;
}

export function useUser() {
  const { data, isLoading } = useQuery<{ user: AuthUser | null }>({
    queryKey: ['auth-user'],
    queryFn: () => fetch('/api/auth/me').then((r) => r.json()),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });

  return {
    user: data?.user ?? null,
    isLoading,
    isAuthenticated: !!data?.user,
  };
}

export function useSignOut() {
  const queryClient = useQueryClient();

  return async () => {
    const { signOut } = await import('@/lib/auth/actions');
    queryClient.setQueryData(['auth-user'], { user: null });
    await signOut();
  };
}
