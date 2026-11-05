import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

const TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.m4v': 'video/mp4',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
};

export interface MediaServer {
  base: string;
  url(file: string): string;
  close(): Promise<void>;
}

/**
 * Serves a render's media from local disk with CORS and range support, so the
 * headless browser reads files fast and WebGL effects can sample them.
 */
export async function serveDirectory(dir: string): Promise<MediaServer> {
  const root = path.resolve(dir);
  const server: Server = createServer(async (req, res) => {
    const name = decodeURIComponent((req.url ?? '/').split('?')[0]!.replace(/^\/+/, ''));
    const file = path.resolve(root, name);
    if (!file.startsWith(root + path.sep)) return void res.writeHead(403).end();
    let size: number;
    try {
      const s = await stat(file);
      if (!s.isFile()) throw new Error('not a file');
      size = s.size;
    } catch {
      return void res.writeHead(404).end();
    }
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Accept-Ranges': 'bytes',
      'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    };
    if (req.method === 'OPTIONS') return void res.writeHead(204, { ...headers, 'Access-Control-Allow-Headers': 'Range' }).end();
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
    if (range && (range[1] || range[2])) {
      let start = range[1] ? Number(range[1]) : size - Number(range[2]);
      let end = range[1] && range[2] ? Number(range[2]) : size - 1;
      start = Math.max(0, start);
      end = Math.min(size - 1, end);
      if (start > end) return void res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
      if (req.method === 'HEAD') return void res.end();
      createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { ...headers, 'Content-Length': size });
    if (req.method === 'HEAD') return void res.end();
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    base,
    url: (file: string) => `${base}/${encodeURIComponent(path.basename(file))}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
