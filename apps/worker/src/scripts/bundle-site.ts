/**
 * Pre-bundles the Remotion compositions into apps/worker/.remotion-bundle so workers start
 * rendering without bundling first. Upload the folder to static hosting and set
 * REMOTION_SERVE_URL to share one bundle across machines.
 *
 *   pnpm --filter @adforge/worker bundle:site
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '../../.remotion-bundle');
const entryPoint = fileURLToPath(import.meta.resolve('@adforge/compositions/entry'));
const started = Date.now();
let lastReported = -1;
await bundle({
  entryPoint,
  outDir,
  onProgress: (pct) => {
    const step = Math.floor(pct / 25) * 25;
    if (step !== lastReported) {
      lastReported = step;
      console.log(`Bundling… ${step}%`);
    }
  },
});
console.log(`Bundle written to ${outDir} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
