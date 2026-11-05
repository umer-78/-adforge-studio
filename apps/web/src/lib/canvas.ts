/** Loads a cross-origin image so it can be drawn to a canvas or used as a WebGL texture. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load the image. Check the storage CORS settings.'));
    img.src = src;
  });
}

export function canvasBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not export the image.'))), type, quality));
}

/** Width and height scaled down so the long side is at most `max`. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const s = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * s), height: Math.round(height * s) };
}

export function aspectNumber(aspect: string): number {
  const [w, h] = aspect.split(':').map(Number);
  return w && h ? w / h : 1;
}

/** The first recording format this browser supports, preferring MP4. */
export function recorderMime(): { mime: string; ext: 'mp4' | 'webm' } | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const [mime, ext] of [
    ['video/mp4;codecs=avc1', 'mp4'],
    ['video/mp4', 'mp4'],
    ['video/webm;codecs=vp9', 'webm'],
    ['video/webm;codecs=vp8', 'webm'],
    ['video/webm', 'webm'],
  ] as const) {
    if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  }
  return null;
}
