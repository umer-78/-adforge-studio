import { extForMime, SIGNED_URL_TTL } from '@adforge/core';
import { storage } from '@adforge/core/server';
import { NextResponse } from 'next/server';
import { owned, route } from '@/lib/server/api';

/** Redirects to a short-lived download URL with a friendly file name. */
export const GET = route({}, async ({ sb, caller, params }) => {
  const asset = await owned(sb, 'assets', params.id!, caller, 'This file');
  const filename = `${asset.name.replace(/[^\w\- .]+/g, '').trim() || 'download'}.${extForMime(asset.mime_type)}`;
  const url = await storage(asset.storage_driver).signedReadUrl(asset.storage_key, SIGNED_URL_TTL.download, { download: filename });
  return NextResponse.redirect(url, { status: 302, headers: { 'cache-control': 'no-store' } });
});
