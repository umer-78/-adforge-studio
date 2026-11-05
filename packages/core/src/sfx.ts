/**
 * Built-in sound effects. They are synthesized with FFmpeg by the worker's
 * `generate-builtins` script, so they are original and free to use commercially.
 * Each recipe is a filter graph that ends in the label [out].
 */
export interface BuiltinSfx {
  id: string;
  name: string;
  category: 'transition' | 'impact' | 'riser' | 'ui' | 'notification' | 'glitch' | 'foley';
  tags: string[];
  durationS: number;
  recipe: string;
}

const tone = (freq: number, decay: number, start = 0, amp = 0.5) => `${amp}*sin(2*PI*${freq}*(t-${start}))*exp(-${decay}*(t-${start}))*gte(t,${start})`;

export const BUILTIN_SFX: BuiltinSfx[] = [
  {
    id: 'whoosh',
    name: 'Whoosh',
    category: 'transition',
    tags: ['transition', 'swoosh', 'air'],
    durationS: 0.9,
    recipe:
      'anoisesrc=d=0.9:c=pink:a=0.9:r=44100,bandpass=f=1200:width_type=o:w=2.5,aphaser=type=t:speed=1.8:decay=0.6,afade=t=in:d=0.45:curve=exp,afade=t=out:st=0.45:d=0.45:curve=exp,volume=2.2[out]',
  },
  {
    id: 'swipe',
    name: 'Fast swipe',
    category: 'transition',
    tags: ['transition', 'swipe', 'quick'],
    durationS: 0.4,
    recipe: 'anoisesrc=d=0.4:c=white:a=0.8:r=44100,highpass=f=1800,lowpass=f=9000,afade=t=in:d=0.12:curve=exp,afade=t=out:st=0.12:d=0.28:curve=exp,volume=1.6[out]',
  },
  {
    id: 'riser',
    name: 'Riser',
    category: 'riser',
    tags: ['build', 'tension', 'reveal'],
    durationS: 2.5,
    recipe:
      "aevalsrc='0.35*sin(2*PI*(180*t+260*t*t))*(t/2.5)':d=2.5:s=44100[a];anoisesrc=d=2.5:c=white:a=0.5:r=44100,highpass=f=2500,afade=t=in:d=2.4:curve=exp[b];[a][b]amix=inputs=2:normalize=0,afade=t=out:st=2.4:d=0.1[out]",
  },
  {
    id: 'downlifter',
    name: 'Downlifter',
    category: 'riser',
    tags: ['drop', 'release', 'transition'],
    durationS: 1.8,
    recipe:
      "aevalsrc='0.4*sin(2*PI*(900*t-220*t*t))*exp(-1.2*t)':d=1.8:s=44100[a];anoisesrc=d=1.8:c=pink:a=0.5:r=44100,lowpass=f=3000,afade=t=out:d=1.8:curve=exp[b];[a][b]amix=inputs=2:normalize=0[out]",
  },
  {
    id: 'impact',
    name: 'Impact',
    category: 'impact',
    tags: ['hit', 'boom', 'reveal'],
    durationS: 1.4,
    recipe:
      "aevalsrc='0.9*sin(2*PI*(70*t-12*t*t))*exp(-4*t)':d=1.4:s=44100[a];anoisesrc=d=0.25:c=brown:a=0.9:r=44100,lowpass=f=1800,afade=t=out:d=0.25:curve=exp,apad=whole_dur=1.4[b];[a][b]amix=inputs=2:normalize=0,alimiter=limit=0.9[out]",
  },
  {
    id: 'sub-drop',
    name: 'Sub drop',
    category: 'impact',
    tags: ['bass', 'drop', 'boom'],
    durationS: 1.6,
    recipe: "aevalsrc='0.95*sin(2*PI*(90*t-22*t*t))*exp(-2.2*t)':d=1.6:s=44100,alimiter=limit=0.9[out]",
  },
  {
    id: 'pop',
    name: 'Pop',
    category: 'ui',
    tags: ['pop', 'bubble', 'appear'],
    durationS: 0.18,
    recipe: "aevalsrc='0.8*sin(2*PI*(950*t-2400*t*t))*exp(-32*t)':d=0.18:s=44100[out]",
  },
  {
    id: 'click',
    name: 'Click',
    category: 'ui',
    tags: ['click', 'tap', 'button'],
    durationS: 0.05,
    recipe: 'anoisesrc=d=0.05:c=white:a=0.9:r=44100,highpass=f=2500,afade=t=out:d=0.05:curve=exp[out]',
  },
  {
    id: 'tick',
    name: 'Tick',
    category: 'ui',
    tags: ['tick', 'counter', 'timer'],
    durationS: 0.08,
    recipe: `aevalsrc='${tone(3200, 90, 0, 0.6)}':d=0.08:s=44100[out]`,
  },
  {
    id: 'ding',
    name: 'Ding',
    category: 'notification',
    tags: ['ding', 'bell', 'highlight'],
    durationS: 1.6,
    recipe: `aevalsrc='${tone(1318.5, 3, 0, 0.45)}+${tone(2637, 5, 0, 0.18)}+${tone(3955.5, 8, 0, 0.08)}':d=1.6:s=44100[out]`,
  },
  {
    id: 'chime',
    name: 'Chime',
    category: 'notification',
    tags: ['chime', 'positive', 'reveal'],
    durationS: 1.6,
    recipe: `aevalsrc='${tone(1046.5, 3.5, 0, 0.4)}+${tone(1568, 3.5, 0.14, 0.4)}':d=1.6:s=44100,aecho=0.8:0.5:60:0.3[out]`,
  },
  {
    id: 'success',
    name: 'Success',
    category: 'notification',
    tags: ['success', 'win', 'unlock'],
    durationS: 1.2,
    recipe: `aevalsrc='${tone(523.25, 5, 0, 0.35)}+${tone(659.25, 5, 0.09, 0.35)}+${tone(783.99, 3.5, 0.18, 0.4)}+${tone(1046.5, 3, 0.27, 0.3)}':d=1.2:s=44100[out]`,
  },
  {
    id: 'error',
    name: 'Error buzz',
    category: 'notification',
    tags: ['error', 'wrong', 'no'],
    durationS: 0.5,
    recipe: "aevalsrc='0.3*sgn(sin(2*PI*140*t))*(lt(t,0.18)+between(t,0.24,0.46))':d=0.5:s=44100,lowpass=f=2200,afade=t=out:st=0.4:d=0.1[out]",
  },
  {
    id: 'glitch',
    name: 'Glitch',
    category: 'glitch',
    tags: ['glitch', 'digital', 'tech'],
    durationS: 0.7,
    recipe:
      "aevalsrc='0.5*sgn(sin(2*PI*(220+660*floor(mod(t*23,4)))*t))*lt(mod(t,0.07),0.045)':d=0.7:s=44100,acrusher=bits=6:mode=lin:samples=6,afade=t=out:st=0.6:d=0.1[out]",
  },
  {
    id: 'typewriter',
    name: 'Typing',
    category: 'foley',
    tags: ['typing', 'keyboard', 'text'],
    durationS: 1.4,
    recipe: "aevalsrc='0.9*(random(0)*2-1)*exp(-260*mod(t+0.02*sin(9*t),0.115))':d=1.4:s=44100,highpass=f=1200,lowpass=f=7000[out]",
  },
  {
    id: 'shutter',
    name: 'Camera shutter',
    category: 'foley',
    tags: ['camera', 'photo', 'snap'],
    durationS: 0.3,
    recipe: "aevalsrc='0.9*(random(0)*2-1)*(exp(-80*t)+0.8*exp(-90*(t-0.09))*gte(t,0.09))':d=0.3:s=44100,bandpass=f=3500:width_type=o:w=2[out]",
  },
  {
    id: 'cash',
    name: 'Coin',
    category: 'notification',
    tags: ['coin', 'sale', 'price', 'money'],
    durationS: 0.9,
    recipe: `aevalsrc='${tone(1975.5, 7, 0, 0.35)}+${tone(2637, 6, 0.07, 0.4)}':d=0.9:s=44100[out]`,
  },
  {
    id: 'heartbeat',
    name: 'Heartbeat',
    category: 'impact',
    tags: ['tension', 'suspense', 'pulse'],
    durationS: 1.6,
    recipe: `aevalsrc='${tone(55, 18, 0, 0.9)}+${tone(50, 18, 0.22, 0.7)}+${tone(55, 18, 0.8, 0.9)}+${tone(50, 18, 1.02, 0.7)}':d=1.6:s=44100,lowpass=f=300,volume=1.6,alimiter=limit=0.9[out]`,
  },
];

export const BUILTIN_SFX_BY_ID = Object.fromEntries(BUILTIN_SFX.map((s) => [s.id, s])) as Record<string, BuiltinSfx>;

/** Public path the web app serves the file from. */
export const builtinSfxPath = (id: string) => `/sfx/${id}.mp3`;
