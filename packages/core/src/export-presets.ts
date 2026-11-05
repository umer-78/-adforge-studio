export type RenderFormat = 'mp4' | 'mov' | 'gif' | 'webm';

export interface ExportPreset {
  id: string;
  label: string;
  group: 'Social' | 'Web' | 'Master' | 'Preview';
  format: RenderFormat;
  /** null keeps the timeline size. */
  width: number | null;
  height: number | null;
  fps: number | null;
  /** Remotion codec id. */
  codec: 'h264' | 'h265' | 'prores' | 'gif' | 'vp9';
  crf?: number;
  videoBitrate?: string;
  proresProfile?: 'standard' | 'hq' | '4444';
  maxDurationS?: number;
  description: string;
}

export const EXPORT_PRESETS: ExportPreset[] = [
  { id: 'source-1080', label: 'Original size · H.264', group: 'Master', format: 'mp4', width: null, height: null, fps: null, codec: 'h264', crf: 18, description: 'Best for downloads and most platforms.' },
  { id: 'tiktok-reels', label: 'TikTok / Reels / Shorts', group: 'Social', format: 'mp4', width: 1080, height: 1920, fps: 30, codec: 'h264', crf: 19, description: '1080×1920 vertical, 30 fps.' },
  { id: 'feed-4x5', label: 'Feed 4:5', group: 'Social', format: 'mp4', width: 1080, height: 1350, fps: 30, codec: 'h264', crf: 19, description: '1080×1350 for Instagram and Facebook feeds.' },
  { id: 'square', label: 'Square 1:1', group: 'Social', format: 'mp4', width: 1080, height: 1080, fps: 30, codec: 'h264', crf: 19, description: '1080×1080.' },
  { id: 'youtube-1080', label: 'YouTube 1080p', group: 'Social', format: 'mp4', width: 1920, height: 1080, fps: null, codec: 'h264', crf: 17, description: '1920×1080 landscape.' },
  { id: 'youtube-4k', label: 'YouTube 4K', group: 'Social', format: 'mp4', width: 3840, height: 2160, fps: null, codec: 'h264', crf: 17, description: '3840×2160 landscape. Slow to render.' },
  { id: 'x-video', label: 'X video', group: 'Social', format: 'mp4', width: 1280, height: 720, fps: 30, codec: 'h264', crf: 21, maxDurationS: 140, description: '720p, 2:20 max for standard accounts.' },
  { id: 'web-hevc', label: 'Web · HEVC', group: 'Web', format: 'mp4', width: null, height: null, fps: null, codec: 'h265', crf: 24, description: 'Smaller files for modern browsers.' },
  { id: 'web-webm', label: 'Web · WebM', group: 'Web', format: 'webm', width: null, height: null, fps: null, codec: 'vp9', crf: 30, description: 'VP9 for websites and landing pages.' },
  { id: 'gif', label: 'GIF', group: 'Web', format: 'gif', width: 540, height: null, fps: 15, codec: 'gif', maxDurationS: 15, description: 'Looping GIF, 540 px wide.' },
  { id: 'prores-hq', label: 'ProRes 422 HQ', group: 'Master', format: 'mov', width: null, height: null, fps: null, codec: 'prores', proresProfile: 'hq', description: 'Mastering quality for further editing. Large files.' },
  { id: 'prores-4444', label: 'ProRes 4444 (alpha)', group: 'Master', format: 'mov', width: null, height: null, fps: null, codec: 'prores', proresProfile: '4444', description: 'Keeps transparency for overlays.' },
  { id: 'preview-540', label: 'Quick preview', group: 'Preview', format: 'mp4', width: 540, height: null, fps: 30, codec: 'h264', crf: 28, description: 'Fast low-resolution check.' },
];

export const EXPORT_PRESETS_BY_ID: Record<string, ExportPreset> = Object.fromEntries(EXPORT_PRESETS.map((p) => [p.id, p]));

/** Output size for a preset, keeping aspect when only one side is fixed and rounding to even pixels. */
export function presetSize(preset: ExportPreset, timeline: { width: number; height: number }): { width: number; height: number } {
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  if (preset.width && preset.height) return { width: even(preset.width), height: even(preset.height) };
  if (preset.width) return { width: even(preset.width), height: even((preset.width / timeline.width) * timeline.height) };
  if (preset.height) return { width: even((preset.height / timeline.height) * timeline.width), height: even(preset.height) };
  return { width: even(timeline.width), height: even(timeline.height) };
}
