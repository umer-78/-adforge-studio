import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useDelayRender } from 'remotion';
import { useRenderEnv } from '../context';
import { parseColor } from '../utils';
import { GlRenderer, sourceSize, type GlPass } from './gl';
import type { GlPassSpec } from './stack';

/** Longest side the WebGL canvas uses in the editor, to keep previews smooth. */
const PREVIEW_MAX = 1920;
const RENDER_MAX = 4096;

/** Loads images (custom LUT strips) with CORS so they can be uploaded to WebGL; holds rendering until loaded. */
function useCorsImages(srcs: readonly string[]): Record<string, HTMLImageElement> {
  const key = srcs.join('|');
  const [state, setState] = useState<{ key: string; images: Record<string, HTMLImageElement> }>({ key: '', images: {} });
  const { delayRender, continueRender } = useDelayRender();
  const pending = useRef<{ key: string; handle: number } | null>(null);
  useLayoutEffect(() => {
    if (!key) return;
    const handle = delayRender(`Loading LUT ${key.slice(0, 80)}`);
    pending.current = { key, handle };
    let cancelled = false;
    Promise.all(
      key.split('|').map(
        (src) =>
          new Promise<[string, HTMLImageElement | null]>((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve([src, img]);
            img.onerror = () => resolve([src, null]);
            img.src = src;
          }),
      ),
    ).then((list) => {
      if (cancelled) return;
      const images: Record<string, HTMLImageElement> = {};
      for (const [src, img] of list) if (img) images[src] = img;
      setState({ key, images });
    });
    return () => {
      cancelled = true;
      if (pending.current?.handle === handle) {
        pending.current = null;
        continueRender(handle);
      }
    };
  }, [key, delayRender, continueRender]);
  // Released after the commit that stored the images, so layout effects have redrawn the canvas first.
  useEffect(() => {
    const p = pending.current;
    if (p && state.key === p.key) {
      pending.current = null;
      continueRender(p.handle);
    }
  }, [state, continueRender]);
  return state.key === key ? state.images : {};
}

/**
 * WebGL passes for a video or image layer. `draw` is handed to onVideoFrame /
 * onImageFrame; the canvas shows the processed frame. Falls back to the plain
 * media when WebGL is missing or the frame is not CORS-readable.
 */
export function useGlEffects(specs: readonly GlPassSpec[]) {
  const { assets, rendering } = useRenderEnv();
  const lutSrcs = specs.flatMap((s) => (s.kind === 'lut' && s.lutAssetId && assets[s.lutAssetId] ? [assets[s.lutAssetId]!.src] : []));
  const images = useCorsImages(lutSrcs);
  const passes: GlPass[] = specs.map((s) => {
    if (s.kind === 'lut') {
      const src = s.lutAssetId ? assets[s.lutAssetId]?.src : undefined;
      return { kind: 'lut', preset: s.preset, image: (src && images[src]) || null, intensity: s.intensity };
    }
    if (s.kind === 'chromaKey') {
      const [r, g, b] = parseColor(s.key);
      return { kind: 'chromaKey', key: [r, g, b], similarity: s.similarity, smoothness: s.smoothness, spill: s.spill };
    }
    return s;
  });
  const passesRef = useRef(passes);
  passesRef.current = passes;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderer = useRef<GlRenderer | null>(null);
  const lastSource = useRef<CanvasImageSource | null>(null);
  const [failed, setFailed] = useState(false);
  const enabled = specs.length > 0 && !failed;

  const draw = useCallback(
    (source: CanvasImageSource) => {
      lastSource.current = source;
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        const size = sourceSize(source);
        if (!size?.width || !size.height) return;
        const max = rendering ? RENDER_MAX : PREVIEW_MAX;
        const k = Math.min(1, max / Math.max(size.width, size.height));
        renderer.current ??= new GlRenderer(canvas);
        renderer.current.render(source as TexImageSource, Math.round(size.width * k), Math.round(size.height * k), passesRef.current);
      } catch (err) {
        console.warn('WebGL effects disabled for this layer:', err);
        setFailed(true);
      }
    },
    [rendering],
  );

  const passKey = JSON.stringify(specs) + Object.keys(images).join('|');
  useLayoutEffect(() => {
    if (enabled && lastSource.current) draw(lastSource.current);
  }, [passKey, enabled, draw]);

  useEffect(
    () => () => {
      renderer.current?.dispose();
      renderer.current = null;
    },
    [],
  );

  return { enabled, canvasRef, draw };
}
