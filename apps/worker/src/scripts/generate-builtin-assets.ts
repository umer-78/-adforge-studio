/**
 * Generates the files the web app ships for built-in content, using the same renderer as exports:
 *   - sound effects from the FFmpeg recipes in BUILTIN_SFX → apps/web/public/sfx/<id>.mp3
 *   - timeline template thumbnails → apps/web/public/templates/<id>.jpg
 *   - motion template thumbnails → apps/web/public/motion/<id>.jpg
 *   - landing page loops (muted H.264), posters and an all-keyframe copy for scroll scrubbing → apps/web/public/landing/
 *
 *   pnpm --filter @adforge/worker assets:generate [--only=sfx,thumbs,loops]
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { BUILTIN_SFX, DEFAULT_BRAND, MOTION_TEMPLATES, motionDefaults, TIMELINE_TEMPLATES, type ResolvedAsset } from '@adforge/core';
import { MOTION_COMPOSITION_ID, TIMELINE_COMPOSITION_ID } from '../lib/remotion';
import { SAMPLE_BOTTLE_SVG } from './sample-bottle';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, '../../../web/public');
const ffmpegBin = process.env.FFMPEG_PATH || 'ffmpeg';
const browserExecutable = process.env.REMOTION_CHROME_PATH || null;
const chromiumOptions = { gl: 'swangle' as const };
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const only = new Set((onlyArg?.slice('--only='.length) ?? 'sfx,thumbs,loops').split(','));

const PEAK_DBFS = -3;

function generateSfx() {
  const outDir = path.join(publicDir, 'sfx');
  const tmp = path.join(os.tmpdir(), `adforge-sfx-${process.pid}`);
  mkdirSync(outDir, { recursive: true });
  mkdirSync(tmp, { recursive: true });
  for (const sfx of BUILTIN_SFX) {
    const wav = path.join(tmp, `${sfx.id}.wav`);
    execFileSync(ffmpegBin, ['-y', '-loglevel', 'error', '-filter_complex', sfx.recipe, '-map', '[out]', '-t', String(sfx.durationS), '-ar', '44100', wav]);
    // Peak-normalize so every effect lands at the same level in the editor.
    const probe = spawnSync(ffmpegBin, ['-hide_banner', '-i', wav, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
    const peak = Number(/max_volume:\s*(-?[\d.]+) dB/.exec(probe.stderr)?.[1] ?? NaN);
    const gain = Number.isFinite(peak) ? PEAK_DBFS - peak : 0;
    execFileSync(ffmpegBin, ['-y', '-loglevel', 'error', '-i', wav, '-af', `volume=${gain.toFixed(2)}dB`, '-c:a', 'libmp3lame', '-q:a', '2', path.join(outDir, `${sfx.id}.mp3`)]);
    console.log(`sfx ${sfx.id}: peak ${Number.isFinite(peak) ? peak.toFixed(1) : '?'} dB → ${PEAK_DBFS} dBFS`);
  }
  rmSync(tmp, { recursive: true, force: true });
}

async function still(url: string, id: string, inputProps: Record<string, unknown>, output: string, at: number, scale: number) {
  const composition = await selectComposition({ serveUrl: url, id, inputProps, browserExecutable, chromiumOptions });
  const frame = Math.min(composition.durationInFrames - 1, Math.max(0, Math.round(composition.durationInFrames * at)));
  await renderStill({ composition, serveUrl: url, inputProps, output, frame, imageFormat: 'jpeg', jpegQuality: 82, scale, browserExecutable, chromiumOptions, overwrite: true });
}

async function generateThumbnails(url: string) {
  const templatesDir = path.join(publicDir, 'templates');
  const motionDir = path.join(publicDir, 'motion');
  mkdirSync(templatesDir, { recursive: true });
  mkdirSync(motionDir, { recursive: true });
  for (const t of TIMELINE_TEMPLATES) {
    const timeline = t.build({ aspect: '9:16', brand: DEFAULT_BRAND, fps: 30 });
    await still(url, TIMELINE_COMPOSITION_ID, { timeline, assets: {} }, path.join(templatesDir, `${t.id}.jpg`), 0.4, 0.5);
    console.log(`template ${t.id}`);
  }
  for (const m of MOTION_TEMPLATES) {
    const inputProps = { templateId: m.id, props: motionDefaults(m.id), background: '#0B0B12', width: 1080, height: 1080 };
    await still(url, MOTION_COMPOSITION_ID, inputProps, path.join(motionDir, `${m.id}.jpg`), 0.6, 0.5);
    console.log(`motion ${m.id}`);
  }
}

const sampleBottle = `data:image/svg+xml;base64,${Buffer.from(SAMPLE_BOTTLE_SVG).toString('base64')}`;

/** Short muted loops for the landing page, rendered from the built-in motion templates. */
const LOOPS: { name: string; templateId: string; props?: Record<string, unknown>; assets?: Record<string, ResolvedAsset>; scrub?: boolean }[] = [
  { name: 'kinetic', templateId: 'kinetic-title', props: { text: 'ADS THAT\nSTOP THE SCROLL' } },
  {
    name: 'showcase',
    templateId: 'product-showcase',
    props: { imageAssetId: 'sample-bottle' },
    assets: { 'sample-bottle': { id: 'sample-bottle', type: 'image', src: sampleBottle, width: 400, height: 400 } },
    scrub: true,
  },
  { name: 'compare', templateId: 'comparison' },
];

/** Every frame a keyframe, so the page can seek to any scroll position without stutter. */
function scrubCopy(input: string, output: string) {
  execFileSync(ffmpegBin, ['-y', '-loglevel', 'error', '-i', input, '-an', '-vf', 'scale=540:-2', '-c:v', 'libx264', '-preset', 'slow', '-crf', '33', '-g', '1', '-keyint_min', '1', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output]);
}

async function generateLoops(url: string) {
  const outDir = path.join(publicDir, 'landing');
  mkdirSync(outDir, { recursive: true });
  for (const loop of LOOPS) {
    const inputProps = { templateId: loop.templateId, props: { ...motionDefaults(loop.templateId), ...loop.props }, assets: loop.assets ?? {}, background: '#0B0B12', width: 720, height: 1280 };
    const composition = await selectComposition({ serveUrl: url, id: MOTION_COMPOSITION_ID, inputProps, browserExecutable, chromiumOptions });
    await renderMedia({
      composition,
      serveUrl: url,
      inputProps,
      codec: 'h264',
      crf: 24,
      muted: true,
      outputLocation: path.join(outDir, `${loop.name}.mp4`),
      browserExecutable,
      chromiumOptions,
      overwrite: true,
    });
    await still(url, MOTION_COMPOSITION_ID, inputProps, path.join(outDir, `${loop.name}.jpg`), 0.6, 1);
    if (loop.scrub) scrubCopy(path.join(outDir, `${loop.name}.mp4`), path.join(outDir, `${loop.name}-scrub.mp4`));
    console.log(`loop ${loop.name}`);
  }
}

if (only.has('sfx')) generateSfx();
if (only.has('thumbs') || only.has('loops')) {
  // Bundled here (not via the worker's serveUrl) so no database settings are needed.
  const url = await bundle({ entryPoint: fileURLToPath(import.meta.resolve('@adforge/compositions/entry')), outDir: path.join(os.tmpdir(), `adforge-bundle-${process.pid}`) });
  if (only.has('thumbs')) await generateThumbnails(url);
  if (only.has('loops')) await generateLoops(url);
}
console.log(`Done. Files are in ${publicDir}`);
