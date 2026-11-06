import { zipStore, type ZipEntry } from '@adforge/core';
import type { DownloadLink } from '@/lib/types';

/** Largest set the browser gathers in memory for one ZIP. */
export const MAX_BROWSER_ZIP_BYTES = 1.5 * 1024 ** 3;

async function fetchBytes(link: DownloadLink, onBytes: (n: number) => void, signal?: AbortSignal): Promise<Uint8Array> {
  const res = await fetch(link.url, { signal, credentials: 'omit', cache: 'no-store' });
  if (!res.ok || !res.body) throw new Error(`Could not download ${link.name}.`);
  const reader = res.body.getReader();
  let buf = new Uint8Array(link.bytes > 0 ? link.bytes : 1 << 20);
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (size + value.length > buf.length) {
      const bigger = new Uint8Array(Math.max(buf.length * 2, size + value.length));
      bigger.set(buf.subarray(0, size));
      buf = bigger;
    }
    buf.set(value, size);
    size += value.length;
    onBytes(value.length);
  }
  return size === buf.length ? buf : buf.subarray(0, size);
}

/** Downloads the files and saves them as one ZIP, built in the browser. */
export async function saveAsZip(files: DownloadLink[], zipName: string, onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<void> {
  const total = files.reduce((n, f) => n + f.bytes, 0);
  if (total > MAX_BROWSER_ZIP_BYTES) throw new Error('These files are over 1.5 GB together. Download them one at a time.');
  let received = 0;
  const entries: ZipEntry[] = [];
  for (const f of files) {
    const data = await fetchBytes(f, (n) => {
      received += n;
      if (total) onProgress?.(Math.min(0.99, received / total));
    }, signal);
    entries.push({ name: f.name, data });
  }
  const blob = new Blob(zipStore(entries) as BlobPart[], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = /\.zip$/i.test(zipName) ? zipName : `${zipName}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  onProgress?.(1);
}
