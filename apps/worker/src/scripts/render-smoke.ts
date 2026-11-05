/**
 * Renders a small timeline that exercises every clip type, effect engine and a
 * pair transition, plus a motion template still. Writes to ./.tmp/render-smoke.
 *
 *   pnpm --filter @adforge/worker smoke:render
 */
import { execFileSync } from 'node:child_process';
import { createReadStream, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { createTimeline, makeClip, makeTrack, makeTransition, type AssetMap, type TimelineData } from '@adforge/core';
import { encodeLutStripPng, parseCube } from '@adforge/core/server';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../../.tmp/render-smoke');
const media = path.join(out, 'media');
mkdirSync(media, { recursive: true });

const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const browserExecutable = process.env.REMOTION_CHROME_PATH || undefined;
const run = (args: string[]) => execFileSync(ffmpeg, ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });

console.log('Generating test media…');
run(['-f', 'lavfi', '-i', 'testsrc2=s=1080x1920:r=30:d=5', '-f', 'lavfi', '-i', 'sine=f=440:d=5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path.join(media, 'a.mp4')]);
run([
  '-f', 'lavfi', '-i', 'color=c=0x00FF00:s=1080x1920:r=30:d=4',
  '-f', 'lavfi', '-i', 'testsrc=s=520x520:r=30:d=4',
  '-filter_complex', "[0][1]overlay=x='280+160*sin(t*2)':y=700",
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(media, 'green.mp4'),
]);
run(['-f', 'lavfi', '-i', 'mandelbrot=s=1080x1350', '-frames:v', '1', path.join(media, 'photo.png')]);
run(['-f', 'lavfi', '-i', 'sine=f=220:d=3', '-c:a', 'libmp3lame', path.join(media, 'voice.mp3')]);
run(['-f', 'lavfi', '-i', 'sine=f=330:d=7', '-c:a', 'libmp3lame', path.join(media, 'music.mp3')]);

// A warm custom grade, imported through the same .cube path users use.
const size = 9;
const lines = ['TITLE "Smoke warm"', `LUT_3D_SIZE ${size}`];
for (let b = 0; b < size; b++)
  for (let g = 0; g < size; g++)
    for (let r = 0; r < size; r++) lines.push([Math.min(1, (r / 8) * 1.1), g / 8, (b / 8) * 0.85].map((v) => v.toFixed(4)).join(' '));
writeFileSync(path.join(media, 'warm-lut.png'), encodeLutStripPng(parseCube(lines.join('\n'))));

const server = createServer((req, res) => {
  const file = path.join(media, path.basename(decodeURIComponent((req.url ?? '/').split('?')[0]!)));
  let stat;
  try {
    stat = statSync(file);
  } catch {
    res.writeHead(404).end();
    return;
  }
  const type = file.endsWith('.mp4') ? 'video/mp4' : file.endsWith('.mp3') ? 'audio/mpeg' : 'image/png';
  const headers = { 'Access-Control-Allow-Origin': '*', 'Accept-Ranges': 'bytes', 'Content-Type': type };
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Number(range[2]) : stat.size - 1;
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
    createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { ...headers, 'Content-Length': stat.size });
  createReadStream(file).pipe(res);
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const assets: AssetMap = {
  a: { id: 'a', type: 'video', src: `${base}/a.mp4`, width: 1080, height: 1920, durationS: 5, fps: 30, hasAudio: true },
  green: { id: 'green', type: 'video', src: `${base}/green.mp4`, width: 1080, height: 1920, durationS: 4, fps: 30, hasAudio: false },
  photo: { id: 'photo', type: 'image', src: `${base}/photo.png`, width: 1080, height: 1350 },
  voice: { id: 'voice', type: 'audio', src: `${base}/voice.mp3`, durationS: 3, role: 'voice' },
  music: { id: 'music', type: 'audio', src: `${base}/music.mp3`, durationS: 7, role: 'music' },
  lut: { id: 'lut', type: 'image', src: `${base}/warm-lut.png`, width: size * size, height: size },
};

const tl: TimelineData = createTimeline({ fps: 30, width: 1080, height: 1920, background: '#05050A' });
tl.aiLabel = true;
const [text, video, voice, music] = tl.tracks as [TimelineData['tracks'][number], TimelineData['tracks'][number], TimelineData['tracks'][number], TimelineData['tracks'][number]];
const captions = makeTrack('text', 'Captions');
const overlay = makeTrack('overlay', 'Overlay');
const grade = makeTrack('overlay', 'Grade');
const back = makeTrack('video', 'Background');
tl.tracks = [text, captions, overlay, grade, video, back, voice, music];

text.clips.push(
  makeClip({ type: 'text', start: 0, duration: 90, text: 'MEET THE *NEW*\nBOTTLE', transform: { y: -0.3, width: 0.9 }, style: { fontSize: 110, strokeColor: '#000000', strokeWidth: 8, highlightColor: '#FACC15' }, animation: { in: 'pop', out: 'fade', loop: 'float' } }),
  makeClip({ type: 'text', start: 95, duration: 85, text: 'Word by word reveal', transform: { y: -0.3, width: 0.86 }, style: { fontFamily: 'Geist', fontSize: 80, backgroundColor: 'rgba(124,92,255,0.9)' }, animation: { in: 'wordByWord', inDuration: 20 } }),
);
captions.clips.push(
  makeClip({
    type: 'captions',
    start: 0,
    duration: 180,
    styleId: 'pop',
    words: ['This', 'is', 'how', 'captions', 'look', 'when', 'every', 'word', 'lands', 'right', 'on', 'time.'].map((w, i) => ({ text: w, start: i * 0.45, end: i * 0.45 + 0.4 })),
  }),
);
overlay.clips.push(
  makeClip({ type: 'motion', start: 0, duration: 75, templateId: 'sale-badge', props: { text: '30% OFF' }, transform: { x: 0.28, y: -0.08, scale: 0.55 } }),
  makeClip({ type: 'shape', start: 30, duration: 60, shape: 'star', fill: '#22D3EE', transform: { x: -0.32, y: 0.12, width: 0.18, height: 0.1, rotation: 12 }, effects: [{ id: 'g', type: 'glow', params: { radius: 30, intensity: 0.9 } }] }),
  makeClip({ type: 'motion', start: 120, duration: 60, templateId: 'cta-button', props: { text: 'Shop now' } }),
);
grade.clips.push(
  makeClip({
    type: 'adjustment',
    start: 0,
    duration: 180,
    effects: [
      { id: 'adj', type: 'adjust', params: { contrast: 1.08, saturation: 1.1 } },
      { id: 'vig', type: 'vignette', params: { strength: 0.6 } },
      { id: 'grn', type: 'grain', params: { amount: 0.18 } },
    ],
  }),
);
video.clips.push(
  makeClip({ type: 'video', assetId: 'a', start: 0, duration: 90, trimStart: 0.5, effects: [{ id: 'lut', type: 'lut', params: { preset: 'teal-orange', intensity: 1 } }] }),
  makeClip({
    type: 'video',
    assetId: 'green',
    start: 90,
    duration: 90,
    transitionIn: makeTransition('crossfade', 15),
    effects: [{ id: 'key', type: 'chromaKey', params: { keyColor: '#00FF00' } }],
  }),
);
back.clips.push(
  makeClip({
    type: 'image',
    assetId: 'photo',
    start: 0,
    duration: 180,
    keyframes: { scale: [{ frame: 0, value: 1, easing: 'linear' }, { frame: 180, value: 1.15, easing: 'linear' }] },
    effects: [{ id: 'cl', type: 'lut', params: { cubeAssetId: 'lut', intensity: 1 } }],
  }),
);
voice.clips.push(makeClip({ type: 'audio', assetId: 'voice', start: 15, duration: 75 }));
music.clips.push(makeClip({ type: 'audio', assetId: 'music', start: 0, duration: 180, audio: { volume: 0.8, fadeOut: 1 } }));

console.log('Bundling compositions…');
const entryPoint = fileURLToPath(import.meta.resolve('@adforge/compositions/entry'));
const serveUrl = await bundle({ entryPoint, onProgress: () => undefined });

const inputProps = { timeline: tl, assets, options: { showPlaceholders: false } };
const chromiumOptions = { gl: 'swangle' as const };
const composition = await selectComposition({ serveUrl, id: 'Timeline', inputProps, browserExecutable, chromiumOptions });
console.log(`Rendering ${composition.durationInFrames} frames at ${composition.width}×${composition.height}…`);
const started = Date.now();
if (process.env.SMOKE_STILLS_ONLY !== '1') await renderMedia({
  composition,
  serveUrl,
  codec: 'h264',
  outputLocation: path.join(out, 'timeline.mp4'),
  inputProps,
  browserExecutable,
  chromiumOptions,
  concurrency: Number(process.env.RENDER_CONCURRENCY || 2),
  onProgress: ({ progress }) => process.stdout.write(`\r  ${(progress * 100).toFixed(0)}%`),
});
console.log(`\nTimeline rendered in ${((Date.now() - started) / 1000).toFixed(1)}s`);

for (const frame of [20, 100, 150]) {
  await renderStill({ composition, serveUrl, frame, output: path.join(out, `timeline-${frame}.png`), inputProps, browserExecutable, chromiumOptions });
}
const motionProps = { templateId: 'product-showcase', props: {}, background: '#0B0B12' };
const motion = await selectComposition({ serveUrl, id: 'MotionTemplate', inputProps: motionProps, browserExecutable, chromiumOptions });
await renderStill({ composition: motion, serveUrl, frame: 60, output: path.join(out, 'motion-product-showcase.png'), inputProps: motionProps, browserExecutable, chromiumOptions });

server.close();
console.log(`Done. Output in ${out}`);
