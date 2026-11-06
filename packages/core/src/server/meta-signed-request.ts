import { createHmac, timingSafeEqual } from 'node:crypto';
import { isRecord } from '../utils';

export interface MetaSignedRequest {
  /** The app-scoped Facebook user ID. */
  userId: string;
  issuedAt: number | null;
}

/**
 * Verifies a Meta `signed_request` (sent to the data deletion and deauthorize callbacks) and returns
 * its payload, or null when the signature or format is wrong. The signature is an HMAC-SHA256 of the
 * encoded payload with the app secret.
 */
export function parseMetaSignedRequest(signedRequest: string, appSecret: string): MetaSignedRequest | null {
  const parts = signedRequest.trim().split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1] || !appSecret) return null;
  const [sig, payload] = parts as [string, string];
  const expected = createHmac('sha256', appSecret).update(payload).digest();
  const actual = Buffer.from(sig, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  let data: unknown;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!isRecord(data) || String(data.algorithm).toUpperCase() !== 'HMAC-SHA256') return null;
  const userId = typeof data.user_id === 'string' || typeof data.user_id === 'number' ? String(data.user_id) : '';
  if (!/^\d{1,40}$/.test(userId)) return null;
  return { userId, issuedAt: typeof data.issued_at === 'number' ? data.issued_at : null };
}
