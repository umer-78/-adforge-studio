import 'server-only';
import { AppError } from '@adforge/core';
import { env, parseMetaSignedRequest, type MetaSignedRequest } from '@adforge/core/server';
import type { NextRequest } from 'next/server';

/** Reads and verifies the `signed_request` form field Meta posts to the app's callbacks. */
export async function readSignedRequest(req: NextRequest): Promise<MetaSignedRequest> {
  const secret = env().META_APP_SECRET;
  if (!secret) throw new AppError('not_configured', 'Meta is not set up on this site.', 503);
  const form = await req.formData().catch(() => null);
  const value = form?.get('signed_request');
  const parsed = typeof value === 'string' && value.length < 4096 ? parseMetaSignedRequest(value, secret) : null;
  if (!parsed) throw new AppError('invalid_request', 'The signed request is missing or not valid.', 400);
  return parsed;
}
