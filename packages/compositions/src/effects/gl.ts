import { LUT_SIZE, presetLutStrip } from './luts';

/** A per-pixel pass run on decoded video or image frames. */
export type GlPass =
  | { kind: 'lut'; preset: string; image: HTMLImageElement | null; intensity: number }
  | { kind: 'pixelate'; size: number }
  | { kind: 'chromaKey'; key: [number, number, number]; similarity: number; smoothness: number; spill: number };

const VERTEX = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const HEADER = `precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_res;
`;

const FRAGMENTS = {
  copy: `${HEADER}
void main() { gl_FragColor = texture2D(u_tex, v_uv); }`,
  lut: `${HEADER}
uniform sampler2D u_lut;
uniform float u_size;
uniform float u_intensity;
vec3 lookup(vec3 c) {
  float n = u_size;
  float b = clamp(c.b, 0.0, 1.0) * (n - 1.0);
  float b0 = floor(b);
  float b1 = min(b0 + 1.0, n - 1.0);
  float x = clamp(c.r, 0.0, 1.0) * (n - 1.0) + 0.5;
  float y = (clamp(c.g, 0.0, 1.0) * (n - 1.0) + 0.5) / n;
  vec3 s0 = texture2D(u_lut, vec2((b0 * n + x) / (n * n), y)).rgb;
  vec3 s1 = texture2D(u_lut, vec2((b1 * n + x) / (n * n), y)).rgb;
  return mix(s0, s1, b - b0);
}
void main() {
  vec4 c = texture2D(u_tex, v_uv);
  gl_FragColor = vec4(mix(c.rgb, lookup(c.rgb), u_intensity), c.a);
}`,
  pixelate: `${HEADER}
uniform float u_block;
void main() {
  vec2 cell = vec2(u_block) / u_res;
  gl_FragColor = texture2D(u_tex, (floor(v_uv / cell) + 0.5) * cell);
}`,
  chromaKey: `${HEADER}
uniform vec3 u_key;
uniform float u_similarity;
uniform float u_smoothness;
uniform float u_spill;
vec2 chroma(vec3 c) {
  return vec2(c.r * -0.169 + c.g * -0.331 + c.b * 0.5 + 0.5, c.r * 0.5 + c.g * -0.419 + c.b * -0.081 + 0.5);
}
void main() {
  vec4 c = texture2D(u_tex, v_uv);
  float base = distance(chroma(c.rgb), chroma(u_key)) - u_similarity;
  float alpha = pow(clamp(base / max(u_smoothness, 0.0001), 0.0, 1.0), 1.5);
  float spill = pow(clamp(base / max(u_spill, 0.0001), 0.0, 1.0), 1.5);
  float grey = clamp(dot(c.rgb, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
  gl_FragColor = vec4(mix(vec3(grey), c.rgb, spill), c.a * alpha);
}`,
} as const;

type ProgramName = keyof typeof FRAGMENTS;

interface Program {
  program: WebGLProgram;
  uniforms: Map<string, WebGLUniformLocation | null>;
}

/** Runs a chain of shader passes from a frame source into a canvas. WebGL 1 so it works in software GL too. */
export class GlRenderer {
  private gl: WebGLRenderingContext;
  private programs = new Map<ProgramName, Program>();
  private quad: WebGLBuffer;
  private source: WebGLTexture;
  private targets: { tex: WebGLTexture; fbo: WebGLFramebuffer }[] = [];
  private targetSize = { width: 0, height: 0 };
  private lutTextures = new Map<string, WebGLTexture>();
  private lutImages = new WeakMap<HTMLImageElement, WebGLTexture>();

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true, alpha: true, antialias: false });
    if (!gl) throw new Error('WebGL is not available');
    this.gl = gl;
    this.quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.source = this.texture();
  }

  private texture(): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  private program(name: ProgramName): Program {
    const hit = this.programs.get(name);
    if (hit) return hit;
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`Shader ${name}: ${gl.getShaderInfoLog(s)}`);
      return s;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENTS[name]));
    gl.bindAttribLocation(program, 0, 'a_pos');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Program ${name}: ${gl.getProgramInfoLog(program)}`);
    const p = { program, uniforms: new Map<string, WebGLUniformLocation | null>() };
    this.programs.set(name, p);
    return p;
  }

  private uniform(p: Program, key: string): WebGLUniformLocation | null {
    if (!p.uniforms.has(key)) p.uniforms.set(key, this.gl.getUniformLocation(p.program, key));
    return p.uniforms.get(key) ?? null;
  }

  private ensureTargets(width: number, height: number) {
    if (this.targetSize.width === width && this.targetSize.height === height && this.targets.length) return;
    const gl = this.gl;
    for (const t of this.targets) {
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fbo);
    }
    this.targets = [0, 1].map(() => {
      const tex = this.texture();
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const fbo = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      return { tex, fbo };
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.targetSize = { width, height };
  }

  private lutTexture(pass: Extract<GlPass, { kind: 'lut' }>): { tex: WebGLTexture; size: number } {
    const gl = this.gl;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    if (pass.image) {
      let tex = this.lutImages.get(pass.image);
      if (!tex) {
        tex = this.texture();
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pass.image);
        this.lutImages.set(pass.image, tex);
      }
      return { tex, size: pass.image.naturalHeight };
    }
    let tex = this.lutTextures.get(pass.preset);
    if (!tex) {
      tex = this.texture();
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, LUT_SIZE * LUT_SIZE, LUT_SIZE, 0, gl.RGBA, gl.UNSIGNED_BYTE, presetLutStrip(pass.preset));
      this.lutTextures.set(pass.preset, tex);
    }
    return { tex, size: LUT_SIZE };
  }

  /** Draws `source` through `passes` into the canvas, sized to the source. */
  render(source: TexImageSource, width: number, height: number, passes: readonly GlPass[]) {
    const gl = this.gl;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    if (passes.length > 1) this.ensureTargets(width, height);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.BLEND);

    const list: readonly (GlPass | null)[] = passes.length ? passes : [null];
    let input = this.source;
    list.forEach((pass, i) => {
      const last = i === list.length - 1;
      const target = last ? null : this.targets[i % 2]!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
      const p = this.program(pass ? pass.kind : 'copy');
      gl.useProgram(p.program);
      if (pass?.kind === 'lut') {
        // Creating a texture binds it to the active unit, so pick unit 1 before touching the LUT.
        gl.activeTexture(gl.TEXTURE1);
        const lut = this.lutTexture(pass);
        gl.bindTexture(gl.TEXTURE_2D, lut.tex);
        gl.uniform1i(this.uniform(p, 'u_lut'), 1);
        gl.uniform1f(this.uniform(p, 'u_size'), lut.size);
        gl.uniform1f(this.uniform(p, 'u_intensity'), pass.intensity);
      } else if (pass?.kind === 'pixelate') {
        gl.uniform1f(this.uniform(p, 'u_block'), Math.max(1, pass.size));
      } else if (pass?.kind === 'chromaKey') {
        gl.uniform3f(this.uniform(p, 'u_key'), pass.key[0], pass.key[1], pass.key[2]);
        gl.uniform1f(this.uniform(p, 'u_similarity'), pass.similarity);
        gl.uniform1f(this.uniform(p, 'u_smoothness'), pass.smoothness);
        gl.uniform1f(this.uniform(p, 'u_spill'), pass.spill);
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, input);
      gl.uniform1i(this.uniform(p, 'u_tex'), 0);
      gl.uniform2f(this.uniform(p, 'u_res'), width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (target) input = target.tex;
    });
  }

  dispose() {
    const gl = this.gl;
    for (const p of this.programs.values()) gl.deleteProgram(p.program);
    for (const t of this.targets) {
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fbo);
    }
    for (const t of this.lutTextures.values()) gl.deleteTexture(t);
    gl.deleteTexture(this.source);
    gl.deleteBuffer(this.quad);
  }
}

/** Natural pixel size of a frame source. */
export function sourceSize(source: CanvasImageSource): { width: number; height: number } | null {
  if (typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement) return { width: source.videoWidth, height: source.videoHeight };
  if (typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement) return { width: source.naturalWidth, height: source.naturalHeight };
  if (typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement) return { width: source.width, height: source.height };
  if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) return { width: source.width, height: source.height };
  if (typeof VideoFrame !== 'undefined' && source instanceof VideoFrame) return { width: source.displayWidth, height: source.displayHeight };
  return null;
}
