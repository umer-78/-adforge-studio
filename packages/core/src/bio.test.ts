import { describe, expect, it } from 'vitest';
import { bioPageSaveSchema, bioSlugSchema, bioUrlSchema, isLikelyBot, parseBioTheme, readableOn } from './bio';

describe('bio pages', () => {
  it('accepts tidy handles and rejects reserved or malformed ones', () => {
    expect(bioSlugSchema.parse(' Everyday-Bottle ')).toBe('everyday-bottle');
    for (const bad of ['ab', '-shop', 'shop-', 'my shop', 'login', 'a'.repeat(41)]) expect(bioSlugSchema.safeParse(bad).success).toBe(false);
  });

  it('only allows web links and adds https when missing', () => {
    expect(bioUrlSchema.parse('example.com/spring')).toBe('https://example.com/spring');
    expect(bioUrlSchema.parse('http://shop.example.com')).toBe('http://shop.example.com');
    for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'mailto:a@b.co', 'https://user:pw@example.com', 'localhost', 'https://']) {
      expect(bioUrlSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it('fills defaults and keeps the theme valid', () => {
    const page = bioPageSaveSchema.parse({ slug: 'shop', links: [{ label: 'Store', url: 'example.com' }] });
    expect(page.theme).toEqual({ mode: 'light', accent: '#7c3aed', buttons: 'rounded' });
    expect(page.links[0]).toMatchObject({ url: 'https://example.com', enabled: true });
    expect(parseBioTheme({ mode: 'neon', accent: 'red' })).toEqual({ mode: 'light', accent: '#7c3aed', buttons: 'rounded' });
  });

  it('picks readable text and skips crawler visits', () => {
    expect(readableOn('#ffffff')).toBe('#000000');
    expect(readableOn('#1e1b4b')).toBe('#ffffff');
    expect(readableOn('#facc15')).toBe('#000000');
    expect(isLikelyBot('facebookexternalhit/1.1')).toBe(true);
    expect(isLikelyBot('Mozilla/5.0 (Linux; Android 14) Instagram 300.0')).toBe(false);
    expect(isLikelyBot(null)).toBe(true);
  });
});
