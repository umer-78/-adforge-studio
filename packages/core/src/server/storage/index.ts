import { features } from '../env';
import { S3Storage } from './s3';
import { SupabaseStorage } from './supabase';
import type { StorageDriver } from './types';

export type { StorageDriver, UploadTicket, ObjectInfo } from './types';

const drivers: Partial<Record<'supabase' | 's3', StorageDriver>> = {};

/** Storage driver by name, or the configured default for new uploads. */
export function storage(name?: 'supabase' | 's3' | string | null): StorageDriver {
  const driver = (name === 's3' || name === 'supabase' ? name : features().storage) as 'supabase' | 's3';
  if (!drivers[driver]) drivers[driver] = driver === 's3' ? new S3Storage() : new SupabaseStorage();
  return drivers[driver]!;
}
