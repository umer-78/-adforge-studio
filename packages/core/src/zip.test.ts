import { describe, expect, it } from 'vitest';
import { crc32, zipNames, zipStore } from './zip';

const enc = new TextEncoder();

function join(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** Reads a stored ZIP back through its central directory, the way unzip tools do. */
function readZip(zip: Uint8Array) {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const eocd = zip.length - 22;
  expect(v.getUint32(eocd, true)).toBe(0x06054b50);
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const files: { name: string; data: Uint8Array; crc: number; flags: number }[] = [];
  for (let i = 0; i < count; i++) {
    expect(v.getUint32(p, true)).toBe(0x02014b50);
    const crc = v.getUint32(p + 16, true);
    const size = v.getUint32(p + 24, true);
    const nameLen = v.getUint16(p + 28, true);
    const local = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(zip.subarray(p + 46, p + 46 + nameLen));
    expect(v.getUint32(local, true)).toBe(0x04034b50);
    expect(v.getUint32(local + 14, true)).toBe(crc);
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    files.push({ name, data: zip.subarray(start, start + size), crc, flags: v.getUint16(p + 8, true) });
    p += 46 + nameLen;
  }
  return files;
}

describe('zip', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(enc.encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
    const whole = crc32(enc.encode('hello world'));
    expect(crc32(enc.encode(' world'), crc32(enc.encode('hello')))).toBe(whole);
  });

  it('stores files that read back byte for byte', () => {
    const a = enc.encode('first file');
    const b = new Uint8Array(70_000).map((_, i) => (i * 31) % 256);
    const files = readZip(join(zipStore([
      { name: 'Ad (9:16).mp4'.replace(':', 'x'), data: a, modified: new Date(2026, 10, 6, 12, 30, 10) },
      { name: 'Größe 1x1.jpg', data: b },
    ])));
    expect(files.map((f) => f.name)).toEqual(['Ad (9x16).mp4', 'Größe 1x1.jpg']);
    expect(files[0]!.data).toEqual(a);
    expect(files[1]!.data).toEqual(b);
    expect(files[1]!.crc).toBe(crc32(b));
    expect(files[1]!.flags & 0x0800).toBe(0x0800);
  });

  it('makes an empty archive', () => {
    expect(readZip(join(zipStore([])))).toEqual([]);
  });

  it('cleans names and de-duplicates them ignoring case, as Windows and macOS do', () => {
    expect(zipNames(['a/b.mp4', 'A:B.mp4', 'clip.mp4', 'clip.mp4', '.hidden', '  '])).toEqual(['a b.mp4', 'A B (2).mp4', 'clip.mp4', 'clip (2).mp4', 'hidden', 'file']);
  });
});
