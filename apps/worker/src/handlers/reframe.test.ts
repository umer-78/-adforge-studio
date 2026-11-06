import { describe, expect, it } from 'vitest';
import { cameraPath, cropBox, fitFilter, pathExpression, sameAspect } from './reframe';

describe('sizes', () => {
  it('cuts the widest frame that fits each shape', () => {
    expect(cropBox(1920, 1080, '9:16')).toEqual({ horizontal: true, cropW: 606, cropH: 1080, outW: 606, outH: 1076 });
    expect(cropBox(1920, 1080, '1:1')).toMatchObject({ horizontal: true, cropW: 1080, cropH: 1080, outW: 1080, outH: 1080 });
    expect(cropBox(1080, 1920, '16:9')).toMatchObject({ horizontal: false, cropW: 1080, cropH: 606, outW: 1080, outH: 606 });
    expect(cropBox(3840, 2160, '4:5')).toMatchObject({ cropW: 1728, cropH: 2160, outW: 1080, outH: 1350 });
    expect(cropBox(1080, 1920, '1.91:1')).toMatchObject({ horizontal: false, cropW: 1080, cropH: 564, outW: 1080, outH: 564 });
    expect(cropBox(1920, 1080, '2:3')).toMatchObject({ horizontal: true, cropW: 720, cropH: 1080, outW: 720, outH: 1080 });
  });

  it('knows when a file already has a shape', () => {
    expect(sameAspect(1080, 1920, '9:16')).toBe(true);
    expect(sameAspect(1280, 720, '16:9')).toBe(true);
    expect(sameAspect(1080, 1350, '4:5')).toBe(true);
    expect(sameAspect(1080, 1350, '1:1')).toBe(false);
  });

  it('fits the whole frame over a blurred fill of the target size', () => {
    const f = fitFilter(1080, 1920, 'yuv420p');
    expect(f).toContain('[0:v]split=2[bg][fg]');
    expect(f).toContain('scale=1080:1920:force_original_aspect_ratio=decrease');
    expect(f).toContain('scale=1080:1920:flags=bicubic[b]');
    expect(f).toMatch(/overlay=\(W-w\)\/2:\(H-h\)\/2,setsar=1,format=yuv420p\[v\]$/);
  });

  it('pans smoothly, holds through doubt and jumps at cuts', () => {
    const samples = [
      { t: 0, c: 500, confidence: 1 },
      { t: 1, c: 1500, confidence: 1 },
      { t: 2, c: 100, confidence: 0.1 },
      { t: 3, c: 1700, confidence: 1 },
    ];
    const path = cameraPath(samples, 600, 1920, [2.5], 400);
    expect(path[0]!.offset).toBe(200);
    expect(path[1]!.offset).toBe(600); // capped at 400 px per second
    expect(path[2]!.offset).toBe(600); // low confidence: hold
    expect(path[3]!.offset).toBe(1320); // a cut: jump straight there (clamped to the frame)
    const expr = pathExpression(path);
    expect(expr.startsWith('if(lt(t,0.000),200,')).toBe(true);
    expect(pathExpression([{ t: 0, offset: 42 }])).toBe('42');
  });
});
