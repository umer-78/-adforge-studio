import type { Readable } from 'node:stream';

export type UploadTicket =
  | {
      kind: 'tus';
      endpoint: string;
      bucket: string;
      objectName: string;
      chunkSize: number;
      contentType: string;
    }
  | {
      kind: 's3';
      key: string;
      uploadId: string;
      partSize: number;
      partCount: number;
      contentType: string;
    }
  | {
      kind: 'put';
      key: string;
      url: string;
      contentType: string;
    };

export interface ObjectInfo {
  size: number;
  contentType?: string;
}

export interface StorageDriver {
  readonly name: 'supabase' | 's3';
  /** Short-lived GET URL. Pass `download` to force a download with that file name. */
  signedReadUrl(key: string, expiresIn: number, opts?: { download?: string }): Promise<string>;
  signedReadUrls(keys: string[], expiresIn: number): Promise<Record<string, string>>;
  /** Single-request upload URL (for small files the browser or a provider pushes). */
  signedUploadUrl(key: string, contentType: string): Promise<string>;
  createUpload(key: string, contentType: string, size: number): Promise<UploadTicket>;
  signParts(key: string, uploadId: string, partNumbers: number[]): Promise<{ partNumber: number; url: string }[]>;
  listParts(key: string, uploadId: string): Promise<{ PartNumber: number; ETag: string; Size: number }[]>;
  completeUpload(key: string, uploadId: string, parts: { PartNumber: number; ETag: string }[]): Promise<void>;
  abortUpload(key: string, uploadId: string): Promise<void>;
  putObject(key: string, body: Buffer | Uint8Array | string, contentType: string, opts?: { cacheControl?: string }): Promise<void>;
  putFile(key: string, filePath: string, contentType: string, opts?: { cacheControl?: string }): Promise<number>;
  getStream(key: string): Promise<Readable>;
  getBuffer(key: string): Promise<Buffer>;
  downloadToFile(key: string, filePath: string): Promise<number>;
  head(key: string): Promise<ObjectInfo | null>;
  readHead(key: string, bytes: number): Promise<Buffer>;
  deleteObjects(keys: string[]): Promise<void>;
  deletePrefix(prefix: string): Promise<number>;
  list(prefix: string): Promise<{ key: string; size: number }[]>;
}
