import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { S3_MAX_PARTS, S3_PART_BYTES } from '../../constants';
import { env } from '../env';
import type { StorageDriver, UploadTicket } from './types';

export class S3Storage implements StorageDriver {
  readonly name = 's3' as const;
  private client: S3Client;
  private bucket: string;

  constructor() {
    const e = env();
    if (!e.S3_BUCKET || !e.S3_ACCESS_KEY_ID || !e.S3_SECRET_ACCESS_KEY) throw new Error('S3 storage needs S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY');
    this.bucket = e.S3_BUCKET;
    this.client = new S3Client({
      region: e.S3_REGION,
      ...(e.S3_ENDPOINT ? { endpoint: e.S3_ENDPOINT } : {}),
      forcePathStyle: e.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY },
    });
  }

  async signedReadUrl(key: string, expiresIn: number, opts: { download?: string } = {}) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ...(opts.download ? { ResponseContentDisposition: `attachment; filename="${opts.download.replace(/"/g, '')}"` } : {}),
      }),
      { expiresIn: Math.max(60, Math.round(expiresIn)) },
    );
  }

  async signedReadUrls(keys: string[], expiresIn: number) {
    const entries = await Promise.all([...new Set(keys.filter(Boolean))].map(async (k) => [k, await this.signedReadUrl(k, expiresIn)] as const));
    return Object.fromEntries(entries);
  }

  async signedUploadUrl(key: string, contentType: string) {
    return getSignedUrl(this.client, new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }), { expiresIn: 3600 });
  }

  async createUpload(key: string, contentType: string, size: number): Promise<UploadTicket> {
    const partSize = Math.max(S3_PART_BYTES, Math.ceil(size / S3_MAX_PARTS / (1024 * 1024)) * 1024 * 1024);
    const res = await this.client.send(new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }));
    if (!res.UploadId) throw new Error('Could not start multipart upload');
    return { kind: 's3', key, uploadId: res.UploadId, partSize, partCount: Math.max(1, Math.ceil(size / partSize)), contentType };
  }

  async signParts(key: string, uploadId: string, partNumbers: number[]) {
    return Promise.all(
      partNumbers.map(async (partNumber) => ({
        partNumber,
        url: await getSignedUrl(this.client, new UploadPartCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }), { expiresIn: 3600 }),
      })),
    );
  }

  async listParts(key: string, uploadId: string) {
    const parts: { PartNumber: number; ETag: string; Size: number }[] = [];
    let marker: string | undefined;
    for (;;) {
      const res = await this.client.send(new ListPartsCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId, ...(marker ? { PartNumberMarker: marker } : {}) }));
      for (const p of res.Parts ?? []) if (p.PartNumber && p.ETag) parts.push({ PartNumber: p.PartNumber, ETag: p.ETag, Size: p.Size ?? 0 });
      if (!res.IsTruncated) break;
      marker = res.NextPartNumberMarker;
    }
    return parts;
  }

  async completeUpload(key: string, uploadId: string, parts: { PartNumber: number; ETag: string }[]) {
    const sorted = [...parts].sort((a, b) => a.PartNumber - b.PartNumber);
    await this.client.send(new CompleteMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId, MultipartUpload: { Parts: sorted } }));
  }

  async abortUpload(key: string, uploadId: string) {
    await this.client.send(new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId })).catch(() => undefined);
  }

  async putObject(key: string, body: Buffer | Uint8Array | string, contentType: string, opts: { cacheControl?: string } = {}) {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType, CacheControl: `max-age=${opts.cacheControl ?? '3600'}` }));
  }

  async putFile(key: string, filePath: string, contentType: string, opts: { cacheControl?: string } = {}) {
    const { size } = await stat(filePath);
    if (size > 5 * 1024 ** 3) throw new Error('Files over 5 GB need multipart upload');
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: createReadStream(filePath), ContentLength: size, ContentType: contentType, CacheControl: `max-age=${opts.cacheControl ?? '3600'}` }),
    );
    return size;
  }

  async getStream(key: string) {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!res.Body) throw new Error(`Empty object ${key}`);
    return res.Body as Readable;
  }

  async getBuffer(key: string) {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!res.Body) throw new Error(`Empty object ${key}`);
    return Buffer.from(await res.Body.transformToByteArray());
  }

  async downloadToFile(key: string, filePath: string) {
    await pipeline(await this.getStream(key), createWriteStream(filePath));
    return (await stat(filePath)).size;
  }

  async head(key: string) {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: res.ContentLength ?? 0, ...(res.ContentType ? { contentType: res.ContentType } : {}) };
    } catch (err) {
      if ((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
      throw err;
    }
  }

  async readHead(key: string, bytes: number) {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=0-${bytes - 1}` }));
    if (!res.Body) return Buffer.alloc(0);
    return Buffer.from(await res.Body.transformToByteArray());
  }

  async deleteObjects(keys: string[]) {
    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000);
      if (!batch.length) continue;
      await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true } }));
    }
  }

  async list(prefix: string) {
    const out: { key: string; size: number }[] = [];
    let token: string | undefined;
    for (;;) {
      const res = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ...(token ? { ContinuationToken: token } : {}) }));
      for (const o of res.Contents ?? []) if (o.Key) out.push({ key: o.Key, size: o.Size ?? 0 });
      if (!res.IsTruncated) break;
      token = res.NextContinuationToken;
    }
    return out;
  }

  async deletePrefix(prefix: string) {
    const items = await this.list(prefix);
    await this.deleteObjects(items.map((i) => i.key));
    return items.length;
  }
}
