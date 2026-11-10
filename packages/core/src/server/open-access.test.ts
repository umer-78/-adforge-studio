import { describe, expect, it } from 'vitest';
import { openAccessEmail } from './env';

describe('openAccessEmail', () => {
  it('is null while sign-in is on', () => {
    expect(openAccessEmail({ OPEN_ACCESS: false, APP_OWNER_EMAILS: 'owner@example.com' })).toBeNull();
  });

  it('uses the first owner email, lowercased', () => {
    expect(openAccessEmail({ OPEN_ACCESS: true, APP_OWNER_EMAILS: ' Owner@Example.com , second@example.com' })).toBe('owner@example.com');
  });

  it('is null when no owner email is set', () => {
    expect(openAccessEmail({ OPEN_ACCESS: true, APP_OWNER_EMAILS: ' , ' })).toBeNull();
  });
});
