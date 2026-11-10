/**
 * A small ZIP writer for files that are already compressed (video, JPEG, PNG): entries are stored
 * as they are, which is fast and keeps memory to one copy of the data. Works in browsers and Node.
 */

let table: Uint32Array | null = null;

function crcTable(): Uint32Array {
  if (table) return table;
  table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}

/** CRC-32 (the ZIP and PNG checksum). Pass the previous value to continue over several chunks. */
export function crc32(data: Uint8Array, previous = 0): number {
  const t = crcTable();
  let c = ~previous >>> 0;
  for (let i = 0; i < data.length; i++) c = t[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return ~c >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
  modified?: Date;
}

/** Largest archive this writer makes (the classic ZIP format stops at 4 GB). */
export const ZIP_MAX_BYTES = 0xffffffff - 1024 * 1024;

function dosTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, Math.min(2107, d.getFullYear()));
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** File names that are safe inside an archive: no folders, no control characters, no duplicates. */
export function zipNames(names: string[]): string[] {
  const seen = new Set<string>();
  return names.map((raw) => {
    const clean = raw.replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '') || 'file';
    const dot = clean.lastIndexOf('.');
    const [base, ext] = dot > 0 ? [clean.slice(0, dot), clean.slice(dot)] : [clean, ''];
    let name = clean;
    for (let i = 2; seen.has(name.toLowerCase()); i++) name = `${base} (${i})${ext}`;
    seen.add(name.toLowerCase());
    return name;
  });
}

/** Builds a ZIP archive and returns it as chunks, ready for `new Blob(chunks)` or writing out in order. */
export function zipStore(entries: ZipEntry[]): Uint8Array[] {
  if (entries.length > 0xffff) throw new Error('Too many files for one ZIP.');
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const crc = crc32(e.data);
    const { time, date } = dosTime(e.modified ?? new Date());
    const size = e.data.length;
    if (offset + 30 + name.length + size > ZIP_MAX_BYTES) throw new Error('These files are too big for one ZIP (over 4 GB).');

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);
    chunks.push(local, e.data);

    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // made by
    cv.setUint16(6, 20, true); // needed
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    // extra, comment, disk start, internal and external attributes stay 0
    cv.setUint32(42, offset, true);
    cd.set(name, 46);
    central.push(cd);
    offset += local.length + size;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  return [...chunks, ...central, end];
}
