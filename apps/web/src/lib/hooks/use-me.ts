'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { Me } from '@/lib/types';
import { useHydrated } from './use-hydrated';

/**
 * The signed-in user, workspace, features and budget. Shared by many components, so a boundary
 * that hydrates after the first fetch would otherwise render data the server never had.
 */
export function useMe(): UseQueryResult<Me> {
  const query = useQuery({ queryKey: ['me'], queryFn: () => api.get<Me>('/me'), staleTime: 60_000 });
  const hydrated = useHydrated();
  return hydrated ? query : ({ ...query, data: undefined, isSuccess: false, isPending: true, status: 'pending' } as UseQueryResult<Me>);
}
