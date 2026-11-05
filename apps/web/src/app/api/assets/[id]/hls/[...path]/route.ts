import { SIGNED_URL_TTL, storageKeys } from '@adforge/core';
import { storage } from '@adforge/core/server';
import { NextResponse } from 'next/server';
import { notFound, owned, route } from '@/lib/server/api';

const SAFE = /^(master\.m3u8|v\d{1,2}\/index\.m3u8)$/;

/**
 * Serves the self-hosted HLS ladder of a private asset. Playlists are rewritten so every segment
 * points at a short-lived signed URL; the bucket itself stays private.
 */
export const GET = route({}, async ({ sb, caller, params }) => {
  const asset = await owned(sb, 'assets', params.id!, caller, 'This video');
  const rel = params.path ?? '';
  if (!asset.hls_key || !SAFE.test(rel)) throw notFound('This stream');
  const driver = storage(asset.storage_driver);
  const base = `${storageKeys.derivedPrefix(asset.workspace_id, asset.id)}hls/`;
  const text = (await driver.getBuffer(base + rel)).toString('utf8');
  let body = text;
  if (rel !== 'master.m3u8') {
    const dir = base + rel.slice(0, rel.lastIndexOf('/') + 1);
    const lines = text.split('\n');
    const segments = lines.map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !/^https?:/.test(l));
    const signed = await driver.signedReadUrls(
      segments.map((s) => dir + s),
      SIGNED_URL_TTL.preview,
    );
    body = lines
      .map((line) => {
        const t = line.trim();
        if (!t || t.startsWith('#') || /^https?:/.test(t)) return line;
        return signed[dir + t] ?? line;
      })
      .join('\n');
  }
  return new NextResponse(body, { headers: { 'content-type': 'application/vnd.apple.mpegurl', 'cache-control': 'private, max-age=60' } });
});
