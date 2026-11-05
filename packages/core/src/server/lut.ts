import { crc32, deflateSync } from 'node:zlib';
import { AppError } from '../utils';

export interface CubeLut {
  title: string | null;
  size: number;
  /** RGB triples, red changing fastest, then green, then blue. */
  data: Float32Array;
}

const MAX_CUBE_SIZE = 65;

/** Parses an Adobe/Resolve .cube 3D LUT. 1D LUTs are rejected. */
export function parseCube(text: string): CubeLut {
  let title: string | null = null;
  let size = 0;
  let min: [number, number, number] = [0, 0, 0];
  let max: [number, number, number] = [1, 1, 1];
  const values: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const upper = line.toUpperCase();
    if (upper.startsWith('TITLE')) {
      title = line.slice(5).trim().replace(/^"|"$/g, '') || null;
    } else if (upper.startsWith('LUT_3D_SIZE')) {
      size = Number.parseInt(line.split(/\s+/)[1] ?? '', 10);
    } else if (upper.startsWith('LUT_1D_SIZE')) {
      throw new AppError('lut_unsupported', 'Only 3D .cube LUTs are supported.');
    } else if (upper.startsWith('DOMAIN_MIN')) {
      const p = line.split(/\s+/).slice(1).map(Number);
      min = [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0];
    } else if (upper.startsWith('DOMAIN_MAX')) {
      const p = line.split(/\s+/).slice(1).map(Number);
      max = [p[0] ?? 1, p[1] ?? 1, p[2] ?? 1];
    } else if (/^[-+.\d]/.test(line)) {
      const p = line.split(/\s+/).map(Number);
      if (p.length < 3 || p.slice(0, 3).some((v) => !Number.isFinite(v))) throw new AppError('lut_invalid', `Invalid LUT line: ${line.slice(0, 40)}`);
      values.push(p[0]!, p[1]!, p[2]!);
    }
  }
  if (!Number.isInteger(size) || size < 2 || size > MAX_CUBE_SIZE) throw new AppError('lut_invalid', 'The .cube file needs a LUT_3D_SIZE between 2 and 65.');
  if (values.length !== size ** 3 * 3) throw new AppError('lut_invalid', `Expected ${size ** 3} entries, found ${values.length / 3}.`);
  const data = new Float32Array(values.length);
  for (let i = 0; i < values.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      const span = max[c]! - min[c]! || 1;
      data[i + c] = Math.min(1, Math.max(0, (values[i + c]! - min[c]!) / span));
    }
  }
  return { title, size, data };
}

function chunk(type: string, body: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, body])) >>> 0);
  return Buffer.concat([len, typeBuf, body, crc]);
}

/**
 * Encodes a LUT as the strip PNG the renderer samples: width size², height size,
 * pixel (r + b·size, g) holds the output colour for input (r, g, b).
 */
export function encodeLutStripPng(lut: CubeLut): Buffer {
  const n = lut.size;
  const width = n * n;
  const height = n;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let g = 0; g < n; g++) {
    const row = g * (width * 4 + 1);
    raw[row] = 0;
    for (let b = 0; b < n; b++) {
      for (let r = 0; r < n; r++) {
        const src = (r + g * n + b * n * n) * 3;
        const dst = row + 1 + (r + b * n) * 4;
        raw[dst] = Math.round(lut.data[src]! * 255);
        raw[dst + 1] = Math.round(lut.data[src + 1]! * 255);
        raw[dst + 2] = Math.round(lut.data[src + 2]! * 255);
        raw[dst + 3] = 255;
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
