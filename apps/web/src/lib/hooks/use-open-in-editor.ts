'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { AspectRatio } from '@adforge/core';
import { api, errorMessage } from '@/lib/api-client';

/** Creates an edit with the given files on the timeline and opens it. */
export function useOpenInEditor() {
  const router = useRouter();
  return useMutation({
    mutationFn: (v: { assetIds: string[]; name?: string; aspect?: AspectRatio }) => api.post<{ id: string }>('/timelines', { name: v.name ?? 'Untitled edit', aspect: v.aspect ?? '9:16', assetIds: v.assetIds }),
    onSuccess: (t) => router.push(`/editor/${t.id}`),
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export const toAspect = (v: unknown): AspectRatio => (v === '1:1' || v === '4:5' || v === '16:9' || v === '9:16' ? v : '9:16');
