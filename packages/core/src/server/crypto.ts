import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { env } from './env';

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number, opts: { N: number; r: number; p: number }) => Promise<Buffer>;

function decodeKey(value: string | undefined, name: string): Buffer | null {
  if (!value) return null;
  const buf = Buffer.from(value, 'base64');
  if (buf.length !== 32) throw new Error(`${name} must be 32 bytes encoded as base64 (openssl rand -base64 32)`);
  return buf;
}

interface Key {
  kid: string;
  key: Buffer;
}

const kidOf = (key: Buffer) => createHash('sha256').update(key).digest('base64url').slice(0, 8);

function keys(): { current: Key; previous: Key | null } {
  const e = env();
  const current = decodeKey(e.APP_ENCRYPTION_KEY, 'APP_ENCRYPTION_KEY');
  if (!current) throw new Error('APP_ENCRYPTION_KEY is required to store tokens and API keys');
  const previous = decodeKey(e.APP_ENCRYPTION_KEY_PREVIOUS, 'APP_ENCRYPTION_KEY_PREVIOUS');
  return { current: { kid: kidOf(current), key: current }, previous: previous ? { kid: kidOf(previous), key: previous } : null };
}

/** AES-256-GCM. Output: {keyId}.{iv}.{tag}.{ciphertext}, base64url parts; the key id lets old values decrypt after rotation. */
export function encryptSecret(plaintext: string): string {
  const { current } = keys();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', current.key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [current.kid, iv.toString('base64url'), tag.toString('base64url'), enc.toString('base64url')].join('.');
}

export function decryptSecret(payload: string): string {
  const [kid, ivB, tagB, dataB] = payload.split('.');
  if (!kid || !ivB || !tagB || dataB == null) throw new Error('Malformed encrypted value');
  const k = keys();
  const key = kid === k.current.kid ? k.current.key : kid === k.previous?.kid ? k.previous.key : null;
  if (!key) throw new Error('This value was encrypted with a key that is no longer configured');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataB, 'base64url')), decipher.final()]).toString('utf8');
}

/** True when a value was encrypted with the previous key and should be re-encrypted. */
export function needsReencrypt(payload: string): boolean {
  return payload.split('.')[0] !== keys().current.kid;
}

export const sha256Hex = (input: string | Buffer) => createHash('sha256').update(input).digest('hex');
export const hmacSha256Hex = (secret: string | Buffer, input: string | Buffer) => createHmac('sha256', secret).update(input).digest('hex');

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function randomToken(length = 32): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

/** API keys are high-entropy, so a fast hash is enough for lookups. */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = `afk_${randomToken(40)}`;
  return { key, prefix: key.slice(0, 12), hash: sha256Hex(key) };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltB, hashB] = stored.split('$');
  if (algo !== 'scrypt' || !saltB || !hashB) return false;
  const expected = Buffer.from(hashB, 'base64url');
  const actual = await scrypt(password, Buffer.from(saltB, 'base64url'), expected.length, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(actual, expected);
}

export function keyHint(secret: string): string {
  return secret.length <= 8 ? '••••' : `${secret.slice(0, 4)}…${secret.slice(-4)}`;
}

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}
