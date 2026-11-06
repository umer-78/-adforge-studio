'use client';

import type { QueryClient } from '@tanstack/react-query';
import * as tus from 'tus-js-client';
import { create } from 'zustand';
import type { UploadTicket } from '@adforge/core/server';
import { api, errorMessage } from '@/lib/api-client';
import { supabaseBrowser } from '@/lib/supabase/browser';
import type { AssetView } from '@/lib/types';

export interface UploadItem {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: 'queued' | 'uploading' | 'finishing' | 'done' | 'error' | 'canceled';
  error?: string;
  assetId?: string;
}

interface UploadState {
  items: UploadItem[];
  patch: (id: string, patch: Partial<UploadItem>) => void;
  push: (items: UploadItem[]) => void;
  clearFinished: () => void;
}

export const useUploads = create<UploadState>((set) => ({
  items: [],
  patch: (id, patch) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),
  push: (items) => set((s) => ({ items: [...s.items, ...items] })),
  clearFinished: () => set((s) => ({ items: s.items.filter((i) => !['done', 'error', 'canceled'].includes(i.status)) })),
}));

const aborts = new Map<string, () => void>();

export function cancelUpload(id: string) {
  aborts.get(id)?.();
}

async function headHex(file: File): Promise<string> {
  const buf = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

function xhrPut(url: string, body: Blob, contentType: string | null, onProgress: (loaded: number) => void, signal: AbortSignal): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    if (contentType) xhr.setRequestHeader('content-type', contentType);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve(xhr.getResponseHeader('ETag')) : reject(new Error(`Upload failed (HTTP ${xhr.status})`)));
    xhr.onerror = () => reject(new Error('Network error while uploading. Check your connection and the storage CORS settings.'));
    signal.addEventListener('abort', () => {
      xhr.abort();
      reject(new DOMException('Canceled', 'AbortError'));
    });
    xhr.send(body);
  });
}

async function sendTus(file: File, ticket: Extract<UploadTicket, { kind: 'tus' }>, onProgress: (p: number) => void, signal: AbortSignal) {
  const sb = supabaseBrowser();
  const apikey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: ticket.endpoint,
      retryDelays: [0, 2000, 5000, 10000, 20000],
      chunkSize: ticket.chunkSize,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      headers: { apikey, 'x-upsert': 'true' },
      metadata: { bucketName: ticket.bucket, objectName: ticket.objectName, contentType: ticket.contentType, cacheControl: '3600' },
      // Long uploads outlive the access token: attach a fresh one to every request.
      onBeforeRequest: async (req) => {
        const { data } = await sb.auth.getSession();
        if (data.session) req.setHeader('authorization', `Bearer ${data.session.access_token}`);
      },
      onProgress: (sent, total) => onProgress(total ? sent / total : 0),
      onSuccess: () => resolve(),
      onError: (err) => reject(err),
    });
    signal.addEventListener('abort', () => {
      void upload.abort(true);
      reject(new DOMException('Canceled', 'AbortError'));
    });
    upload.findPreviousUploads().then((prev) => {
      if (prev[0]) upload.resumeFromPreviousUpload(prev[0]);
      upload.start();
    }, reject);
  });
}

async function sendS3(file: File, assetId: string, ticket: Extract<UploadTicket, { kind: 's3' }>, onProgress: (p: number) => void, signal: AbortSignal) {
  const loaded = new Map<number, number>();
  const report = () => onProgress([...loaded.values()].reduce((a, b) => a + b, 0) / file.size);
  const parts: { PartNumber: number; ETag: string }[] = [];
  const numbers = Array.from({ length: ticket.partCount }, (_, i) => i + 1);
  for (let i = 0; i < numbers.length; i += 50) {
    const batch = numbers.slice(i, i + 50);
    const { parts: signed } = await api.post<{ parts: { partNumber: number; url: string }[] }>('/uploads/parts', { assetId, partNumbers: batch });
    const queue = [...signed];
    const worker = async () => {
      while (queue.length) {
        if (signal.aborted) throw new DOMException('Canceled', 'AbortError');
        const part = queue.shift()!;
        const start = (part.partNumber - 1) * ticket.partSize;
        const blob = file.slice(start, Math.min(file.size, start + ticket.partSize));
        let etag: string | null = null;
        for (let attempt = 0; attempt < 4 && !etag; attempt++) {
          try {
            etag = await xhrPut(part.url, blob, null, (n) => {
              loaded.set(part.partNumber, n);
              report();
            }, signal);
          } catch (err) {
            if ((err as Error).name === 'AbortError' || attempt === 3) throw err;
            await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
          }
        }
        if (!etag) throw new Error('Storage did not return an ETag. Expose the ETag header in the bucket CORS rules.');
        parts.push({ PartNumber: part.partNumber, ETag: etag });
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
  }
  return parts.sort((a, b) => a.PartNumber - b.PartNumber);
}

async function uploadOne(item: UploadItem, file: File, opts: UploadOptions) {
  const { patch } = useUploads.getState();
  const controller = new AbortController();
  let assetId: string | undefined;
  aborts.set(item.id, () => controller.abort());
  try {
    patch(item.id, { status: 'uploading' });
    const { asset, ticket } = await api.post<{ asset: AssetView; ticket: UploadTicket }>('/uploads', {
      name: file.name,
      size: file.size,
      type: file.type,
      head: await headHex(file),
      projectId: opts.projectId ?? null,
      folderId: opts.folderId ?? null,
      source: opts.source ?? 'upload',
      ...(opts.parentAssetId ? { parentAssetId: opts.parentAssetId } : {}),
      ...(opts.isAiGenerated ? { isAiGenerated: true } : {}),
    });
    assetId = asset.id;
    patch(item.id, { assetId });
    const onProgress = (p: number) => patch(item.id, { progress: Math.min(0.99, p) });
    let parts: { PartNumber: number; ETag: string }[] | undefined;
    if (ticket.kind === 'tus') await sendTus(file, ticket, onProgress, controller.signal);
    else if (ticket.kind === 's3') parts = await sendS3(file, asset.id, ticket, onProgress, controller.signal);
    else await xhrPut(ticket.url, file, ticket.contentType, (n) => onProgress(n / file.size), controller.signal);
    patch(item.id, { status: 'finishing', progress: 0.995 });
    const done = await api.post<AssetView>('/uploads/complete', { assetId: asset.id, parts });
    patch(item.id, { status: 'done', progress: 1 });
    opts.onUploaded?.(done);
    void opts.queryClient?.invalidateQueries({ queryKey: ['assets'] });
  } catch (err) {
    const canceled = (err as Error).name === 'AbortError';
    patch(item.id, { status: canceled ? 'canceled' : 'error', error: canceled ? undefined : errorMessage(err) });
    if (assetId) await api.delete(`/uploads?assetId=${assetId}`).catch(() => undefined);
  } finally {
    aborts.delete(item.id);
  }
}

export interface UploadOptions {
  projectId?: string | null;
  folderId?: string | null;
  source?: 'upload' | 'recording' | 'derived' | 'render';
  parentAssetId?: string;
  isAiGenerated?: boolean;
  queryClient?: QueryClient;
  onUploaded?: (asset: AssetView) => void;
}

/** Uploads files straight to storage, three at a time, and reports progress in the upload tray. */
export async function startUploads(files: File[], opts: UploadOptions = {}) {
  const items: UploadItem[] = files.map((f) => ({ id: crypto.randomUUID(), name: f.name, size: f.size, progress: 0, status: 'queued' }));
  useUploads.getState().push(items);
  const queue = items.map((item, i) => ({ item, file: files[i]! }));
  const run = async () => {
    while (queue.length) {
      const next = queue.shift()!;
      await uploadOne(next.item, next.file, opts);
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, queue.length) }, run));
}

/** Uploads one file and resolves once it is processed and ready to use as a model input. */
export async function uploadAndWait(file: File, opts: Omit<UploadOptions, 'onUploaded'> = {}, timeoutMs = 120_000): Promise<AssetView> {
  let uploaded: AssetView | null = null;
  await startUploads([file], { ...opts, onUploaded: (a) => (uploaded = a) });
  const first = uploaded as AssetView | null;
  if (!first) throw new Error('Upload failed. Check the upload tray for details.');
  return waitUntilReady(first, timeoutMs);
}

/** Polls an asset until processing finishes; throws when it fails or takes too long. */
export async function waitUntilReady(asset: AssetView, timeoutMs = 120_000, signal?: AbortSignal): Promise<AssetView> {
  const started = Date.now();
  let current = asset;
  while (current.status !== 'ready') {
    if (current.status === 'failed') throw new Error(current.processingError ?? 'Processing failed.');
    if (Date.now() - started > timeoutMs) throw new Error('Processing is taking longer than usual. Try again in a minute.');
    if (signal?.aborted) throw new DOMException('Canceled', 'AbortError');
    await new Promise((r) => setTimeout(r, 1500));
    current = (await api.get<{ asset: AssetView }>(`/assets/${asset.id}`)).asset;
  }
  return current;
}
