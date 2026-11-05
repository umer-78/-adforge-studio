/**
 * Animated line icons in the Lottie format, built from code so they stay small, editable and
 * consistent. Strokes are recolored with CSS (`currentColor`), so one file works in both themes.
 * Each icon draws itself in once (frames 0–60) and then idles on a seamless loop (60–180).
 */

type Vec = number[];
type Ease = [number, number, number, number];
interface Key {
  t: number;
  s: Vec | number;
}

const FPS = 60;
const DRAW_END = 60;
const LOOP_END = 180;
const EASE_OUT: Ease = [0.16, 1, 0.3, 1];
const EASE_IN_OUT: Ease = [0.45, 0, 0.55, 1];
const BACK_OUT: Ease = [0.34, 1.56, 0.64, 1];

const fixed = (k: unknown) => ({ a: 0, k });

function keys(frames: Key[], ease: Ease = EASE_IN_OUT) {
  return {
    a: 1,
    k: frames.map((f, i) => ({
      t: f.t,
      s: Array.isArray(f.s) ? f.s : [f.s],
      ...(i < frames.length - 1 ? { o: { x: [ease[0]], y: [ease[1]] }, i: { x: [ease[2]], y: [ease[3]] } } : {}),
    })),
  };
}

/**
 * Straight segments through the points. The in and out tangents must be separate arrays: the player
 * turns them into absolute points in place, so shared arrays would be offset twice.
 */
function path(points: Vec[], closed = false) {
  return { ty: 'sh', ks: fixed({ i: points.map(() => [0, 0]), o: points.map(() => [0, 0]), v: points.map((pt) => [...pt]), c: closed }) };
}

const rect = (center: Vec, size: Vec, radius: number) => ({ ty: 'rc', d: 1, p: fixed(center), s: fixed(size), r: fixed(radius) });
const ellipse = (center: Vec, size: Vec) => ({ ty: 'el', d: 1, p: fixed(center), s: fixed(size) });
const stroke = (width = 2.5) => ({ ty: 'st', c: fixed([1, 1, 1, 1]), o: fixed(100), w: fixed(width), lc: 2, lj: 2, ml: 4 });
const fill = () => ({ ty: 'fl', c: fixed([1, 1, 1, 1]), o: fixed(100), r: 1 });
/** Draws the group's paths in from start to end between two frames. */
const drawOn = (from: number, to: number) => ({ ty: 'tm', s: fixed(0), e: keys([{ t: from, s: 0 }, { t: to, s: 100 }], EASE_OUT), o: fixed(0), m: 1 });

type Prop = ReturnType<typeof fixed> | ReturnType<typeof keys>;

interface GroupTransform {
  p?: Prop;
  a?: Vec;
  s?: Prop;
  r?: Prop;
  o?: Prop;
}

function group(items: object[], t: GroupTransform = {}) {
  return {
    ty: 'gr',
    it: [
      ...items,
      { ty: 'tr', p: t.p ?? fixed([0, 0]), a: fixed(t.a ?? [0, 0]), s: t.s ?? fixed([100, 100]), r: t.r ?? fixed(0), o: t.o ?? fixed(100), sk: fixed(0), sa: fixed(0) },
    ],
  };
}

/** Scales in from nothing around a point, with a little overshoot. */
const popIn = (at: Vec, from: number, to: number): GroupTransform => ({
  a: [...at],
  p: fixed([...at]),
  s: keys([{ t: from, s: [0, 0] }, { t: to, s: [100, 100] }], BACK_OUT),
});

function layer(shapes: object[], transform: GroupTransform = {}) {
  return {
    ddd: 0,
    ind: 1,
    ty: 4,
    nm: 'icon',
    sr: 1,
    ks: { o: transform.o ?? fixed(100), r: transform.r ?? fixed(0), p: transform.p ?? fixed([24, 24, 0]), a: fixed([24, 24, 0]), s: transform.s ?? fixed([100, 100, 100]) },
    ao: 0,
    shapes,
    ip: 0,
    op: LOOP_END,
    st: 0,
    bm: 0,
  };
}

function animation(name: string, layers: object[]) {
  return { v: '5.12.0', fr: FPS, ip: 0, op: LOOP_END, w: 48, h: 48, nm: name, ddd: 0, assets: [], layers: layers.map((l, i) => ({ ...l, ind: i + 1 })) };
}

/** A gentle up-and-down float that starts and ends at rest, so the idle loop is seamless. */
const bob = (amount: number) =>
  keys([
    { t: 0, s: [24, 24, 0] },
    { t: DRAW_END, s: [24, 24, 0] },
    { t: 120, s: [24, 24 - amount, 0] },
    { t: LOOP_END, s: [24, 24, 0] },
  ]);

const pulse = (peak: number) =>
  keys([
    { t: 0, s: [100, 100, 100] },
    { t: DRAW_END, s: [100, 100, 100] },
    { t: 120, s: [peak, peak, 100] },
    { t: LOOP_END, s: [100, 100, 100] },
  ]);

const generate = animation('generate', [
  layer([group([path([[38, 6], [38, 14]]), path([[34, 10], [42, 10]]), stroke(2)], popIn([38, 10], 30, 50))]),
  layer(
    [group([path([[22, 8], [26, 20], [38, 24], [26, 28], [22, 40], [18, 28], [6, 24], [18, 20]], true), drawOn(0, 40), stroke()])],
    { s: pulse(108) },
  ),
]);

const edit = animation('edit', [
  layer([
    group([path([[0, 8], [0, 40]]), stroke(2)], {
      p: keys([
        { t: 0, s: [8, 0] },
        { t: DRAW_END, s: [8, 0] },
        { t: 150, s: [40, 0] },
        { t: LOOP_END, s: [8, 0] },
      ]),
    }),
  ]),
  layer([
    group([rect([19, 14], [22, 6], 2), drawOn(0, 30), stroke()]),
    group([rect([27, 24], [26, 6], 2), drawOn(10, 40), stroke()]),
    group([rect([16, 34], [16, 6], 2), drawOn(20, 50), stroke()]),
  ]),
]);

function bar(x: number, i: number) {
  const low = [100, 35 + ((i * 23) % 40)];
  return group([path([[x, 15], [x, 33]]), stroke(3)], {
    a: [x, 24],
    p: fixed([x, 24]),
    s: keys([
      { t: 0, s: [100, 0] },
      { t: 12 + i * 6, s: [100, 100] },
      { t: DRAW_END + i * 8, s: low },
      { t: 120 + i * 6, s: [100, 100] },
      { t: LOOP_END, s: [100, 100] },
    ]),
  });
}

const voice = animation('voice', [layer([12, 18, 24, 30, 36].map((x, i) => bar(x, i)))]);

const photo = animation('photo', [
  layer([group([ellipse([31, 17], [6, 6]), fill()], popIn([31, 17], 40, 58))]),
  layer([
    group([rect([24, 24], [32, 28], 5), drawOn(0, 34), stroke()]),
    group([path([[12, 34], [20, 25], [26, 31], [30, 27], [36, 34]]), drawOn(18, 48), stroke()]),
  ]),
]);

const motion3d = animation('motion3d', [
  layer(
    [
      group([path([[24, 7], [39, 15.5], [24, 24], [9, 15.5]], true), drawOn(0, 30), stroke()]),
      group([path([[9, 15.5], [9, 32.5], [24, 41], [24, 24]]), drawOn(12, 42), stroke()]),
      group([path([[24, 41], [39, 32.5], [39, 15.5]]), drawOn(24, 54), stroke()]),
    ],
    { p: bob(2) },
  ),
]);

const publish = animation('publish', [
  layer(
    [
      group([path([[6, 22], [42, 8], [30, 40], [22, 28]], true), drawOn(0, 36), stroke()]),
      group([path([[22, 28], [42, 8]]), drawOn(24, 50), stroke()]),
    ],
    {
      p: keys([
        { t: 0, s: [24, 24, 0] },
        { t: DRAW_END, s: [24, 24, 0] },
        { t: 120, s: [26.5, 21.5, 0] },
        { t: LOOP_END, s: [24, 24, 0] },
      ]),
    },
  ),
]);

const agent = animation('agent', [
  layer([
    group([ellipse([24, 11], [9, 9]), stroke()], popIn([24, 11], 0, 18)),
    group([ellipse([11, 35], [9, 9]), stroke()], popIn([11, 35], 8, 26)),
    group([ellipse([37, 35], [9, 9]), stroke()], popIn([37, 35], 16, 34)),
  ]),
  layer(
    [
      group([path([[21.5, 15], [13.5, 31]]), drawOn(22, 44), stroke(2)]),
      group([path([[26.5, 15], [34.5, 31]]), drawOn(28, 50), stroke(2)]),
      group([path([[15.5, 35], [32.5, 35]]), drawOn(34, 56), stroke(2)]),
    ],
    { s: pulse(104) },
  ),
]);

export const LOTTIE_ICONS = { generate, edit, voice, photo, motion3d, publish, agent } as const;
export type LottieIconName = keyof typeof LOTTIE_ICONS;
export const LOTTIE_DRAW_END = DRAW_END;
export const LOTTIE_LOOP_END = LOOP_END;
