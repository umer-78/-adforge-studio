'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { BrandKitView } from '@/lib/types';

/** The workspace's brand kits, default first. */
export function useBrandKits() {
  return useQuery({ queryKey: ['brand-kits'], queryFn: () => api.get<{ items: BrandKitView[] }>('/brand-kits').then((r) => r.items), staleTime: 60_000 });
}

/** Hex colors of the default kit, for quick swatches next to color pickers. */
export function useBrandColors(): string[] {
  const kits = useBrandKits();
  const kit = kits.data?.find((k) => k.isDefault) ?? kits.data?.[0];
  return kit?.colors ?? [];
}
