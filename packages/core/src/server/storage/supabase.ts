import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { MEDIA_BUCKET, TUS_CHUNK_BYTES } from '../../constants';
import { env, supabaseSecretKey } from '../env';
import { serviceClient } from '../supabase';
import type { StorageDriver, UploadTicket } from './types';

const encodeKey = (key: string) => key.split('/').map(encodeURIComponent).join('/');

export class SupabaseStorage implements StorageDriver {
  readonly name = 'supabase' as const;
  private bucket = MEDIA_BUCKET;

  private get api() {
    return serviceClient().storage.from(this.bucket);
  }

  private get base() {
    return `${env().NEXT_PUBLIC_SUPABASE_URL}/storage/v1`;
  }

  private headers(extra: Record<string, string> = {}) {
    const key = supabaseSecretKey();
    return { apikey: key, Authorization: `Bearer ${key}`, ...extra };
  }

  async signedReadUrl(key: string, expiresIn: number, opts: { download?: string } = {}) {
    const { data, error } = await this.api.createSignedUrl(key, Math.max(60, Math.round(expiresIn)), opts.download ? { download: opts.download } : undefined);
    if (error || !data) throw new Error(`Could not sign ${key}: ${error?.message}`);
    return data.signedUrl;
  }

  async signedReadUrls(keys: string[], expiresIn: number) {
    const out: Record<string, string> = {};
    const unique = [...new Set(keys.filter(Boolean))];
    for (let i = 0; i < unique.length; i += 500) {
      const batch = unique.slice(i, i + 500);
      const { data, error } = await this.api.createSignedUrls(batch, Math.max(60, Math.round(expiresIn)));
      if (error) throw new Error(`Could not sign URLs: ${error.message}`);
      for (const row of data ?? []) if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
    }
    return out;
  }

  async signedUploadUrl(key: string) {
    const { data, error } = await this.api.createSignedUploadUrl(key, { upsert: true });
    if (error || !data) throw new Error(`Could not create upload URL: ${error?.message}`);
    return data.signedUrl;
  }

  async createUpload(key: string, contentType: string): Promise<UploadTicket> {
    return { kind: 'tus', endpoint: `${this.base}/upload/resumable`, bucket: this.bucket, objectName: key, chunkSize: TUS_CHUNK_BYTES, contentType };
  }

  async signParts(): Promise<never> {
    throw new Error('Supabase storage uses resumable TUS uploads, not multipart parts');
  }

  async listParts() {
    return [];
  }

  async completeUpload() {
    // TUS uploads finish on the client.
  }

  async abortUpload(key: string) {
    await this.deleteObjects([key]);
  }

  async putObject(key: string, body: Buffer | Uint8Array | string, contentType: string, opts: { cacheControl?: string } = {}) {
    const { error } = await this.api.upload(key, body, { contentType, upsert: true, cacheControl: opts.cacheControl ?? '3600' });
    if (error) throw new Error(`Upload of ${key} failed: ${error.message}`);
  }

  /** Streams a file from disk without buffering it in memory. */
  async putFile(key: string, filePath: string, contentType: string, opts: { cacheControl?: string } = {}) {
    const { size } = await stat(filePath);
    const res = await fetch(`${this.base}/object/${this.bucket}/${encodeKey(key)}`, {
      method: 'POST',
      headers: this.headers({ 'content-type': contentType, 'x-upsert': 'true', 'cache-control': `max-age=${opts.cacheControl ?? '3600'}`, 'content-length': String(size) }),
      body: Readable.toWeb(createReadStream(filePath)) as unknown as NonNullable<RequestInit['body']>,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    if (!res.ok) throw new Error(`Upload of ${key} failed: ${res.status} ${await res.text().catch(() => '')}`);
    return size;
  }

  async getStream(key: string) {
    const res = await fetch(`${this.base}/object/authenticated/${this.bucket}/${encodeKey(key)}`, { headers: this.headers() });
    if (!res.ok || !res.body) throw new Error(`Download of ${key} failed: ${res.status}`);
    return Readable.fromWeb(res.body as unknown as WebReadableStream);
  }

  async getBuffer(key: string) {
    const { data, error } = await this.api.download(key);
    if (error || !data) throw new Error(`Download of ${key} failed: ${error?.message}`);
    return Buffer.from(await data.arrayBuffer());
  }

  async downloadToFile(key: string, filePath: string) {
    await pipeline(await this.getStream(key), createWriteStream(filePath));
    return (await stat(filePath)).size;
  }

  async head(key: string) {
    const { data, error } = await this.api.info(key);
    if (error || !data) return null;
    const info = data as { size?: number | null; contentType?: string | null; metadata?: { size?: number; mimetype?: string } | null };
    const contentType = info.contentType ?? info.metadata?.mimetype;
    return { size: Number(info.size ?? info.metadata?.size ?? 0), ...(contentType ? { contentType } : {}) };
  }

  async readHead(key: string, bytes: number) {
    const res = await fetch(`${this.base}/object/authenticated/${this.bucket}/${encodeKey(key)}`, { headers: this.headers({ Range: `bytes=0-${bytes - 1}` }) });
    if (!res.ok) throw new Error(`Could not read ${key}: ${res.status}`);
    return Buffer.from(await res.arrayBuffer()).subarray(0, bytes);
  }

  async deleteObjects(keys: string[]) {
    for (let i = 0; i < keys.length; i += 1000) {
      const { error } = await this.api.remove(keys.slice(i, i + 1000));
      if (error) throw new Error(`Delete failed: ${error.message}`);
    }
  }

  async list(prefix: string) {
    const out: { key: string; size: number }[] = [];
    const walk = async (folder: string) => {
      let offset = 0;
      for (;;) {
        const { data, error } = await this.api.list(folder, { limit: 1000, offset });
        if (error) throw new Error(`List failed: ${error.message}`);
        for (const item of data ?? []) {
          const path = folder ? `${folder}/${item.name}` : item.name;
          if (item.id == null) await walk(path);
          else out.push({ key: path, size: Number((item.metadata as { size?: number } | null)?.size ?? 0) });
        }
        if (!data || data.length < 1000) break;
        offset += 1000;
      }
    };
    await walk(prefix.replace(/\/+$/, ''));
    return out;
  }

  async deletePrefix(prefix: string) {
    const items = await this.list(prefix);
    await this.deleteObjects(items.map((i) => i.key));
    return items.length;
  }
}
