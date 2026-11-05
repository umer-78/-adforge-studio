import { createHash, createHmac, createPublicKey, verify } from 'node:crypto';
import { safeEqual } from './crypto';

const FAL_JWKS_URL = 'https://rest.fal.ai/.well-known/jwks.json';
let falKeys: { keys: { x: string }[]; at: number } | null = null;

async function falJwks(force = false) {
  if (!force && falKeys && Date.now() - falKeys.at < 12 * 3600_000) return falKeys.keys;
  const res = await fetch(FAL_JWKS_URL);
  if (!res.ok) throw new Error(`Could not fetch fal JWKS: ${res.status}`);
  const body = (await res.json()) as { keys: { x: string }[] };
  falKeys = { keys: body.keys ?? [], at: Date.now() };
  return falKeys.keys;
}

/** Verifies fal's ED25519 webhook signature over requestId, userId, timestamp and the body hash. */
export async function verifyFalWebhook(headers: Headers, rawBody: Buffer): Promise<boolean> {
  const requestId = headers.get('x-fal-webhook-request-id');
  const userId = headers.get('x-fal-webhook-user-id');
  const timestamp = headers.get('x-fal-webhook-timestamp');
  const signature = headers.get('x-fal-webhook-signature');
  if (!requestId || !userId || !timestamp || !signature) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const message = Buffer.from([requestId, userId, timestamp, createHash('sha256').update(rawBody).digest('hex')].join('\n'), 'utf8');
  const sig = Buffer.from(signature, 'hex');
  const check = (keys: { x: string }[]) =>
    keys.some((k) => {
      try {
        return verify(null, message, createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: k.x }, format: 'jwk' }), sig);
      } catch {
        return false;
      }
    });
  if (check(await falJwks())) return true;
  return check(await falJwks(true));
}

/** Standard Webhooks (used by Replicate): HMAC-SHA256 of id.timestamp.body with a whsec_ secret. */
export function verifyStandardWebhook(headers: Headers, rawBody: string, secret: string | undefined): boolean {
  if (!secret) return false;
  const id = headers.get('webhook-id');
  const timestamp = headers.get('webhook-timestamp');
  const signatures = headers.get('webhook-signature');
  if (!id || !timestamp || !signatures) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64');
  return signatures.split(' ').some((s) => {
    const [, sig] = s.split(',');
    return !!sig && safeEqual(sig, expected);
  });
}
