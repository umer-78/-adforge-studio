import { MAX_UPLOAD_BYTES, type AssetType } from './constants';

export const MIME_BY_EXT: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  qt: 'video/quicktime',
  webm: 'video/webm',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
};

const EXT_BY_MIME: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  'audio/flac': 'flac',
  'model/gltf-binary': 'glb',
  'model/gltf+json': 'gltf',
};

const MIME_ALIASES: Record<string, string> = {
  'audio/x-m4a': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
  'audio/x-flac': 'audio/flac',
  'audio/vnd.wave': 'audio/wav',
  'video/x-m4v': 'video/mp4',
  'image/jpg': 'image/jpeg',
  'application/octet-stream': '',
};

export const UPLOAD_MIME_TYPES = Object.keys(EXT_BY_MIME);

export function extensionOf(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i >= 0 ? filename.slice(i + 1).toLowerCase() : '';
}

export function normalizeMime(mime: string | null | undefined, filename = ''): string {
  let m = (mime ?? '').toLowerCase().split(';')[0]!.trim();
  if (m in MIME_ALIASES) m = MIME_ALIASES[m]!;
  if (!m || !(m in EXT_BY_MIME)) {
    const fromExt = MIME_BY_EXT[extensionOf(filename)];
    if (fromExt) m = fromExt;
  }
  return m;
}

export function extForMime(mime: string): string {
  return EXT_BY_MIME[mime] ?? 'bin';
}

export function assetTypeForMime(mime: string): AssetType | null {
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('model/')) return 'model3d';
  return null;
}

export type UploadValidation =
  | { ok: true; mime: string; ext: string; assetType: AssetType }
  | { ok: false; error: string };

export function validateUpload(
  file: { name: string; size: number; type?: string | null },
  { maxBytes = MAX_UPLOAD_BYTES }: { maxBytes?: number } = {},
): UploadValidation {
  if (!file.name || file.name.length > 300) return { ok: false, error: 'File name must be 1–300 characters.' };
  if (!Number.isFinite(file.size) || file.size <= 0) return { ok: false, error: 'File is empty.' };
  if (file.size > maxBytes) return { ok: false, error: `File is larger than the ${Math.round(maxBytes / 1024 ** 2)} MB limit.` };
  const mime = normalizeMime(file.type, file.name);
  const assetType = assetTypeForMime(mime);
  if (!mime || !assetType || !(mime in EXT_BY_MIME)) {
    return { ok: false, error: 'Unsupported file type. Use MP4, MOV, WebM, JPG, PNG, WebP, GIF, MP3, WAV, M4A, AAC, OGG, FLAC, GLB or GLTF.' };
  }
  return { ok: true, mime, ext: extForMime(mime), assetType };
}

/** Checks the leading bytes of a file against its claimed type. */
export function sniffMatches(mime: string, head: Uint8Array): boolean {
  const ascii = (from: number, to: number) => String.fromCharCode(...head.slice(from, to));
  if (head.length < 12) return false;
  switch (mime) {
    case 'image/jpeg':
      return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    case 'image/png':
      return head[0] === 0x89 && ascii(1, 4) === 'PNG';
    case 'image/gif':
      return ascii(0, 3) === 'GIF';
    case 'image/webp':
      return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
    case 'video/mp4':
    case 'video/quicktime':
    case 'audio/mp4':
      return ascii(4, 8) === 'ftyp' || ascii(4, 8) === 'moov' || ascii(4, 8) === 'wide' || ascii(4, 8) === 'mdat' || ascii(4, 8) === 'free';
    case 'video/webm':
    case 'audio/webm':
      return head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
    case 'audio/mpeg':
    case 'audio/mp3':
      return ascii(0, 3) === 'ID3' || (head[0] === 0xff && (head[1]! & 0xe0) === 0xe0);
    case 'audio/wav':
    case 'audio/x-wav':
    case 'audio/wave':
      return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE';
    case 'audio/ogg':
      return ascii(0, 4) === 'OggS';
    case 'audio/flac':
      return ascii(0, 4) === 'fLaC';
    case 'audio/aac':
      return head[0] === 0xff && (head[1]! & 0xf6) === 0xf0;
    case 'model/gltf-binary':
      return ascii(0, 4) === 'glTF';
    case 'model/gltf+json':
      return ascii(0, 1) === '{';
    default:
      return false;
  }
}

export const storageKeys = {
  original: (workspaceId: string, assetId: string, ext: string) => `${workspaceId}/${assetId}/original.${ext}`,
  derived: (workspaceId: string, assetId: string, file: string) => `${workspaceId}/${assetId}/derived/${file}`,
  version: (workspaceId: string, assetId: string, version: number, ext: string) =>
    `${workspaceId}/${assetId}/versions/v${version}.${ext}`,
  derivedPrefix: (workspaceId: string, assetId: string) => `${workspaceId}/${assetId}/derived/`,
  assetPrefix: (workspaceId: string, assetId: string) => `${workspaceId}/${assetId}/`,
};

export function displayName(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '');
  return base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300) || 'Untitled';
}
