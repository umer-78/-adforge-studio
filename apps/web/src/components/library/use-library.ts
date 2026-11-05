'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  archived_at: string | null;
  updated_at: string;
}
export interface FolderRow {
  id: string;
  name: string;
  parent_id: string | null;
  project_id: string | null;
}
export interface Stats {
  storage_bytes: number;
  asset_count: number;
  video_count: number;
  image_count: number;
  audio_count: number;
  trash_count: number;
  generation_count: number;
  month_spend_usd: number;
  monthly_budget_usd: number;
  active_jobs: number;
  scheduled_posts: number;
  published_posts: number;
  /** Bytes by asset type, plus `versions` for older versions of edited files. */
  storage_by_type?: Record<string, number>;
  /** Generations started per UTC day, oldest first, over the last two weeks. */
  generations_daily?: { date: string; count: number }[];
}

export const useProjects = () => useQuery({ queryKey: ['projects'], queryFn: () => api.get<{ items: ProjectRow[] }>('/projects').then((r) => r.items), staleTime: 30_000 });
export const useFolders = () => useQuery({ queryKey: ['folders'], queryFn: () => api.get<{ items: FolderRow[] }>('/folders').then((r) => r.items), staleTime: 30_000 });
export const useStats = () => useQuery({ queryKey: ['stats'], queryFn: () => api.get<Stats>('/stats'), staleTime: 15_000 });
export const useTags = () => useQuery({ queryKey: ['tags'], queryFn: () => api.get<{ items: { tag: string; uses: number }[] }>('/tags').then((r) => r.items), staleTime: 30_000 });
