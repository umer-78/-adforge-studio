/** WebGL renderer for 2.5D parallax: shifts each pixel by its depth to fake a moving camera. */

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uImage;
uniform sampler2D uDepth;
uniform vec2 uOffset;
uniform float uZoom;
uniform float uDolly;
uniform float uFocus;
uniform vec2 uCover;
void main() {
  vec2 uv = (vUv - 0.5) * uCover / uZoom + 0.5;
  vec2 p = uv;
  // A few fixed-point steps approximate where this pixel came from, so near objects occlude far ones.
  for (int i = 0; i < 5; i++) {
    float k = texture2D(uDepth, p).r - uFocus;
    p = uv - uOffset * k - (uv - 0.5) * uDolly * k;
  }
  gl_FragColor = texture2D(uImage, clamp(p, vec2(0.001), vec2(0.999)));
}`;

export type Motion = 'dolly' | 'orbit' | 'pan' | 'zoomout';

export interface Camera {
  offset: [number, number];
  zoom: number;
  dolly: number;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Camera at time t (0..1). Strength 0..1 scales the move. */
export function cameraAt(motion: Motion, t: number, strength: number): Camera {
  const e = smooth(Math.min(1, Math.max(0, t)));
  const s = strength;
  switch (motion) {
    case 'dolly':
      return { offset: [0, -0.01 * s * e], zoom: 1.06 + 0.1 * s * e, dolly: 0.14 * s * e };
    case 'orbit':
      return { offset: [Math.sin(t * Math.PI * 2) * 0.035 * s, Math.cos(t * Math.PI * 2) * 0.018 * s], zoom: 1.1, dolly: 0 };
    case 'pan':
      return { offset: [(e * 2 - 1) * 0.045 * s, 0], zoom: 1.12, dolly: 0 };
    case 'zoomout':
      return { offset: [0, 0.008 * s * e], zoom: 1.2 - 0.12 * s * e, dolly: -0.12 * s * e };
  }
}

function texture(gl: WebGLRenderingContext, source: TexImageSource): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return tex;
}

function shader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'Shader failed to compile');
  return s;
}

/** Downscales very large images so they fit in GPU texture limits. */
function capped(img: HTMLImageElement, max = 2048): TexImageSource {
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  if (scale === 1) return img;
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

export class ParallaxRenderer {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private textures: WebGLTexture[] = [];
  private imageAspect = 1;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL is not available in this browser.');
    this.gl = gl;
    const p = gl.createProgram()!;
    gl.attachShader(p, shader(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, shader(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'Shader failed to link');
    this.program = p;
    gl.useProgram(p);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(p, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    for (const n of ['uImage', 'uDepth', 'uOffset', 'uZoom', 'uDolly', 'uFocus', 'uCover']) this.u[n] = gl.getUniformLocation(p, n);
  }

  setImages(image: HTMLImageElement, depth: HTMLImageElement) {
    const gl = this.gl;
    this.textures.forEach((t) => gl.deleteTexture(t));
    gl.activeTexture(gl.TEXTURE0);
    const a = texture(gl, capped(image));
    gl.activeTexture(gl.TEXTURE1);
    const b = texture(gl, capped(depth));
    this.textures = [a, b];
    gl.uniform1i(this.u.uImage!, 0);
    gl.uniform1i(this.u.uDepth!, 1);
    this.imageAspect = image.naturalWidth / image.naturalHeight;
  }

  draw(cam: Camera, focus: number) {
    const gl = this.gl;
    const ca = this.canvas.width / this.canvas.height;
    const cover: [number, number] = this.imageAspect > ca ? [ca / this.imageAspect, 1] : [1, this.imageAspect / ca];
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.u.uOffset!, cam.offset[0], cam.offset[1]);
    gl.uniform1f(this.u.uZoom!, cam.zoom);
    gl.uniform1f(this.u.uDolly!, cam.dolly);
    gl.uniform1f(this.u.uFocus!, focus);
    gl.uniform2f(this.u.uCover!, cover[0], cover[1]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  dispose() {
    this.textures.forEach((t) => this.gl.deleteTexture(t));
    this.gl.deleteProgram(this.program);
  }
}
