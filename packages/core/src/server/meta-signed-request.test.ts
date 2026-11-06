import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseMetaSignedRequest } from './meta-signed-request';

const SECRET = 'test-app-secret';

function sign(payload: unknown, secret = SECRET): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${sig}.${body}`;
}

describe('parseMetaSignedRequest', () => {
  it('returns the user of a correctly signed request', () => {
    expect(parseMetaSignedRequest(sign({ algorithm: 'HMAC-SHA256', user_id: '1234567890', issued_at: 1_762_400_000 }), SECRET)).toEqual({ userId: '1234567890', issuedAt: 1_762_400_000 });
  });

  it('accepts a numeric user ID and a lowercase algorithm', () => {
    expect(parseMetaSignedRequest(sign({ algorithm: 'hmac-sha256', user_id: 42 }), SECRET)).toEqual({ userId: '42', issuedAt: null });
  });

  it('rejects a request signed with another secret', () => {
    expect(parseMetaSignedRequest(sign({ algorithm: 'HMAC-SHA256', user_id: '1' }, 'other-secret'), SECRET)).toBeNull();
  });

  it('rejects a payload changed after signing', () => {
    const [sig] = sign({ algorithm: 'HMAC-SHA256', user_id: '1' }).split('.');
    const forged = Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: '2' })).toString('base64url');
    expect(parseMetaSignedRequest(`${sig}.${forged}`, SECRET)).toBeNull();
  });

  it('rejects other algorithms, bad user IDs and malformed input', () => {
    expect(parseMetaSignedRequest(sign({ algorithm: 'NONE', user_id: '1' }), SECRET)).toBeNull();
    expect(parseMetaSignedRequest(sign({ algorithm: 'HMAC-SHA256', user_id: 'abc' }), SECRET)).toBeNull();
    expect(parseMetaSignedRequest(sign({ algorithm: 'HMAC-SHA256' }), SECRET)).toBeNull();
    expect(parseMetaSignedRequest('not-a-signed-request', SECRET)).toBeNull();
    expect(parseMetaSignedRequest('a.b.c', SECRET)).toBeNull();
    expect(parseMetaSignedRequest(sign({ algorithm: 'HMAC-SHA256', user_id: '1' }), '')).toBeNull();
  });
});
