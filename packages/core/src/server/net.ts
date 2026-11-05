import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';
import type { Readable } from 'node:stream';
import zlib from 'node:zlib';
import { AppError } from '../utils';

/**
 * Fetching user-supplied URLs (product pages, competitor sites, imported media) must never reach
 * private networks or cloud metadata. Every address is checked at connect time, which also covers
 * DNS rebinding, and every redirect hop is re-validated.
 */

const v4 = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  v4.addSubnet(net, prefix, 'ipv4');
}

const v6 = new BlockList();
v6.addAddress('::', 'ipv6');
v6.addAddress('::1', 'ipv6');
for (const [net, prefix] of [
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 32],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
] as const) {
  v6.addSubnet(net, prefix, 'ipv6');
}

/** Embedded IPv4 of an IPv4-mapped or IPv4-compatible IPv6 address, if any. */
function embeddedV4(address: string): string | null {
  const lower = address.toLowerCase();
  const dotted = lower.match(/^(?:0{0,4}:){0,5}(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) return dotted[1]!;
  const hex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1]!, 16);
    const lo = parseInt(hex[2]!, 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return null;
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !v4.check(address, 'ipv4');
  if (family === 6) {
    const mapped = embeddedV4(address);
    if (mapped) return isIP(mapped) === 4 && !v4.check(mapped, 'ipv4');
    return !v6.check(address, 'ipv6');
  }
  return false;
}

const ALLOWED_PORTS = new Set(['', '80', '443', '8080', '8443']);
const BLOCKED_HOST_SUFFIXES = ['.local', '.localhost', '.internal', '.lan', '.home.arpa', '.intranet', '.corp'];

export class UnsafeUrlError extends AppError {
  constructor(message: string) {
    super('unsafe_url', message, 400);
  }
}

/** Parses and checks a URL's shape. Addresses are checked again when the socket connects. */
export function assertSafeUrl(input: string | URL): URL {
  let url: URL;
  try {
    url = new URL(input.toString());
  } catch {
    throw new UnsafeUrlError('That is not a valid URL.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new UnsafeUrlError('Only http and https links are supported.');
  if (url.username || url.password) throw new UnsafeUrlError('Links with embedded credentials are not allowed.');
  if (!ALLOWED_PORTS.has(url.port)) throw new UnsafeUrlError('Links to non-standard ports are not allowed.');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host) throw new UnsafeUrlError('That link has no host.');
  if (isIP(host)) {
    if (!isPublicAddress(host)) throw new UnsafeUrlError('Links to private network addresses are not allowed.');
  } else {
    if (!host.includes('.') || host === 'localhost' || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
      throw new UnsafeUrlError('Links to internal hosts are not allowed.');
    }
  }
  return url;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** DNS lookup that refuses to hand a private address to the socket. */
function guardedLookup(hostname: string, options: { family?: number | string; all?: boolean } | number, callback: LookupCallback) {
  const opts = typeof options === 'number' ? { family: options } : (options ?? {});
  const family = opts.family === 'IPv4' ? 4 : opts.family === 'IPv6' ? 6 : Number(opts.family) || 0;
  dnsLookup(hostname, { all: true, family: family as 0 | 4 | 6 }, (err, addresses) => {
    if (err) return callback(err, '');
    const list = (addresses as LookupAddress[]) ?? [];
    if (!list.length) return callback(Object.assign(new Error(`No address for ${hostname}`), { code: 'ENOTFOUND' }), '');
    if (list.some((a) => !isPublicAddress(a.address))) {
      return callback(Object.assign(new UnsafeUrlError('That link points to a private network address.'), { errno: undefined }) as NodeJS.ErrnoException, '');
    }
    if (opts.all) return callback(null, list);
    return callback(null, list[0]!.address, list[0]!.family);
  });
}

export const DEFAULT_USER_AGENT = 'Mozilla/5.0 (compatible; AdForgeStudio/1.0; product-import)';

export interface SafeFetchOptions {
  method?: 'GET' | 'HEAD';
  headers?: Record<string, string>;
  /** Whole request deadline, including redirects and body. */
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

export interface SafeStream {
  url: string;
  status: number;
  headers: Record<string, string>;
  contentType: string;
  contentLength: number | null;
  body: Readable;
  /** Stops the request and frees the socket. */
  abort(): void;
}

function flatHeaders(raw: http.IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) if (v != null) out[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
  return out;
}

function requestOnce(url: URL, opts: SafeFetchOptions, signal: AbortSignal): Promise<{ res: http.IncomingMessage; req: http.ClientRequest }> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(
      url,
      {
        method: opts.method ?? 'GET',
        agent: false,
        lookup: guardedLookup as never,
        signal,
        headers: {
          'user-agent': DEFAULT_USER_AGENT,
          accept: '*/*',
          'accept-encoding': 'gzip, deflate, br',
          'accept-language': 'en-US,en;q=0.9',
          ...opts.headers,
        },
      },
      (res) => resolve({ res, req }),
    );
    req.on('error', (err) => reject(err instanceof AppError ? err : new AppError('fetch_failed', `Could not reach ${url.hostname}: ${err.message}`, 502)));
    req.end();
  });
}

/**
 * Opens a validated request and follows redirects. The deadline also covers reading the body,
 * so pass a longer `timeoutMs` for big downloads. Call `abort()` once done with the body.
 */
export async function safeStream(input: string | URL, opts: SafeFetchOptions = {}): Promise<SafeStream> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new AppError('fetch_timeout', 'The site took too long to respond.', 504)), opts.timeoutMs ?? 20_000);
  timer.unref?.();
  let url = assertSafeUrl(input);
  try {
    for (let hop = 0; hop <= (opts.maxRedirects ?? 5); hop++) {
      const { res, req } = await requestOnce(url, opts, controller.signal);
      const status = res.statusCode ?? 0;
      const location = res.headers.location;
      if (status >= 300 && status < 400 && location) {
        res.resume();
        req.destroy();
        url = assertSafeUrl(new URL(location, url));
        continue;
      }
      const headers = flatHeaders(res.headers);
      const encoding = (headers['content-encoding'] ?? '').toLowerCase();
      let body: Readable = res;
      if (encoding === 'gzip' || encoding === 'x-gzip') body = res.pipe(zlib.createGunzip());
      else if (encoding === 'br') body = res.pipe(zlib.createBrotliDecompress());
      else if (encoding === 'deflate') body = res.pipe(zlib.createInflate());
      if (body !== res) res.on('error', (e) => body.destroy(e));
      const length = Number(headers['content-length']);
      return {
        url: url.toString(),
        status,
        headers,
        contentType: (headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase(),
        contentLength: encoding || !Number.isFinite(length) ? null : length,
        body,
        abort: () => {
          clearTimeout(timer);
          req.destroy();
          body.destroy();
        },
      };
    }
    throw new AppError('too_many_redirects', 'The link redirected too many times.', 400);
  } catch (err) {
    clearTimeout(timer);
    if (controller.signal.aborted && controller.signal.reason instanceof AppError) throw controller.signal.reason;
    throw err;
  }
}

export interface SafeResponse {
  url: string;
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  contentType: string;
  body: Buffer;
  text(): string;
  json<T = unknown>(): T;
}

/** Reads a whole response into memory, capped at `maxBytes` (default 8 MB). */
export async function safeFetch(input: string | URL, opts: SafeFetchOptions = {}): Promise<SafeResponse> {
  const maxBytes = opts.maxBytes ?? 8 * 1024 ** 2;
  const stream = await safeStream(input, opts);
  if (stream.contentLength != null && stream.contentLength > maxBytes) {
    stream.abort();
    throw new AppError('response_too_large', `The file is larger than ${Math.round(maxBytes / 1024 ** 2)} MB.`, 413);
  }
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of stream.body) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      size += buf.length;
      if (size > maxBytes) throw new AppError('response_too_large', `The file is larger than ${Math.round(maxBytes / 1024 ** 2)} MB.`, 413);
      chunks.push(buf);
    }
  } catch (err) {
    stream.abort();
    if (err instanceof AppError) throw err;
    if ((err as { name?: string }).name === 'AbortError') throw new AppError('fetch_timeout', 'The site took too long to respond.', 504);
    throw new AppError('fetch_failed', `Could not read ${new URL(stream.url).hostname}: ${(err as Error).message}`, 502);
  }
  stream.abort();
  const body = Buffer.concat(chunks);
  const charset = /charset=([\w-]+)/i.exec(stream.headers['content-type'] ?? '')?.[1]?.toLowerCase();
  return {
    url: stream.url,
    status: stream.status,
    ok: stream.status >= 200 && stream.status < 300,
    headers: stream.headers,
    contentType: stream.contentType,
    body,
    text: () => {
      try {
        return new TextDecoder(charset && charset !== 'utf8' ? charset : 'utf-8').decode(body);
      } catch {
        return body.toString('utf8');
      }
    },
    json: <T>() => JSON.parse(body.toString('utf8')) as T,
  };
}
