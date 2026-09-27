import { isGood } from '../sim/levels';
import { radius, type World } from '../sim/world';

/** Half-width of the enemy base (lane units), for the no-art fallback box. */
const TOWER_HALF = 0.5;
import atlas from './atlas.json';
import { lookAt, multiply, perspective, project, type Mat4 } from './math';

/** Sim lane x ∈ [-1, 1] is drawn this many world units wide on each side. */
export const LANE = 1.9;
/** Gate panel height (world units). */
export const GATE_H = 1.0;
const MAX_INSTANCES = 9000;
const FLOATS = 8; // ball instances: x, y, z, size, r, g, b, a
const SPRITE_FLOATS = 6; // sprite instances: x, y, z, size, frame, flash
const TEX_FLOATS = 9; // textured mesh vertices: x, y, z, u, v, r, g, b, a

/** Characters are drawn this much wider than their collision diameter (reads better on a phone). */
const UNIT_VIS = 1.45;
/** Champions and brutes are already big; they get less of a boost. */
const BIG_VIS = 1.1;
/** World width of the cannon's footprint and of the castle's walls. */
const TOWER_W = 2.0;
const CANNON_W = 0.95;
const CANNON_ANCHOR_Z = 0.02;
const RECOIL_MS = 70;

const MESH_VS = `#version 300 es
in vec3 a_pos; in vec4 a_color;
uniform mat4 u_vp;
out vec4 v_color; out float v_dist;
void main() {
  v_color = a_color;
  gl_Position = u_vp * vec4(a_pos, 1.0);
  v_dist = gl_Position.w; // view depth
}`;

const MESH_FS = `#version 300 es
precision highp float;
precision highp int;
in vec4 v_color; in float v_dist;
uniform vec3 u_fog; uniform vec2 u_fogRange;
out vec4 o;
void main() {
  float f = smoothstep(u_fogRange.x, u_fogRange.y, v_dist);
  o = vec4(mix(v_color.rgb, u_fog, f * 0.55), v_color.a);
}`;

// Textured mesh (lane, grass, gate glass): texture × vertex colour, same fog as the mesh.
const TEX_VS = `#version 300 es
in vec3 a_pos; in vec2 a_uv; in vec4 a_color;
uniform mat4 u_vp;
out vec2 v_uv; out vec4 v_color; out float v_dist;
void main() {
  v_uv = a_uv; v_color = a_color;
  gl_Position = u_vp * vec4(a_pos, 1.0);
  v_dist = gl_Position.w;
}`;

const TEX_FS = `#version 300 es
precision highp float;
in vec2 v_uv; in vec4 v_color; in float v_dist;
uniform sampler2D u_tex; uniform vec3 u_fog; uniform vec2 u_fogRange;
out vec4 o;
void main() {
  vec4 t = texture(u_tex, v_uv) * v_color;
  float f = smoothstep(u_fogRange.x, u_fogRange.y, v_dist);
  o = vec4(mix(t.rgb, u_fog, f * 0.55), t.a);
}`;

// Camera-facing billboards. u_shape: 0 = shaded ball, 1 = ground shadow, 2 = soft particle.
const BALL_VS = `#version 300 es
in vec2 a_corner; in vec4 a_inst; in vec4 a_color;
uniform mat4 u_view; uniform mat4 u_proj; uniform int u_shape;
out vec2 v_uv; out vec4 v_color;
void main() {
  v_uv = a_corner; v_color = a_color;
  vec4 vp = u_view * vec4(a_inst.xyz, 1.0);
  vec2 c = a_corner * a_inst.w;
  if (u_shape == 1) c.y *= 0.42; // flattened: reads as a disc on the ground
  vp.xy += c;
  gl_Position = u_proj * vp;
}`;

const BALL_FS = `#version 300 es
precision highp float;
precision highp int;
in vec2 v_uv; in vec4 v_color;
uniform int u_shape;
out vec4 o;
void main() {
  float d = dot(v_uv, v_uv);
  if (d > 1.0) discard;
  if (u_shape == 1) { o = vec4(0.0, 0.0, 0.0, 0.22 * (1.0 - d)); return; }
  if (u_shape == 2) { float a = v_color.a * (1.0 - d); o = vec4(v_color.rgb * a, a); return; }
  vec3 n = vec3(v_uv.x, v_uv.y, sqrt(1.0 - d));
  vec3 l = normalize(vec3(-0.45, 0.65, 0.62));
  float diff = 0.55 + 0.55 * max(dot(n, l), 0.0);
  float spec = pow(max(dot(reflect(-l, n), vec3(0, 0, 1)), 0.0), 24.0) * 0.45;
  float rim = smoothstep(0.75, 1.0, d) * 0.25;
  o = vec4(v_color.rgb * diff * (1.0 - rim) + spec, 1.0);
}`;

// Atlas sprites: camera-facing quads anchored at the feet. Frame rects and sizes come from
// uniform tables, so an instance is just position, size, frame index and a hit flash.
// The whole quad gets the depth of its anchor (nudged toward the camera), so crowds sort by
// where they stand and an upright sprite never cuts into the ground or the gate posts.
const FRAME_COUNT = Object.keys(atlas.frames).length;
const SPRITE_VS = `#version 300 es
in vec2 a_corner; in vec4 a_inst; in vec2 a_meta;
uniform mat4 u_view; uniform mat4 u_proj;
uniform vec4 u_uv[${FRAME_COUNT}]; uniform vec4 u_geo[${FRAME_COUNT}];
out vec2 v_uv; out float v_flash; out float v_dist;
void main() {
  int f = int(a_meta.x + 0.5);
  vec4 g = u_geo[f];
  vec4 r = u_uv[f];
  vec4 vp = u_view * vec4(a_inst.xyz, 1.0);
  vec4 anchor = u_proj * vec4(vp.xy, vp.z + 0.05, 1.0);
  vp.xy += vec2((a_corner.x - g.z) * g.x, (g.w - a_corner.y) * g.y) * a_inst.w;
  gl_Position = u_proj * vp;
  gl_Position.z = anchor.z / anchor.w * gl_Position.w;
  v_uv = mix(r.xy, r.zw, a_corner);
  v_flash = a_meta.y;
  v_dist = gl_Position.w;
}`;

const SPRITE_FS = `#version 300 es
precision highp float;
in vec2 v_uv; in float v_flash; in float v_dist;
uniform sampler2D u_tex; uniform float u_cut; uniform vec3 u_fog; uniform vec2 u_fogRange;
out vec4 o;
void main() {
  vec4 t = texture(u_tex, v_uv); // premultiplied
  if (t.a < u_cut) discard;
  vec3 c = mix(t.rgb / t.a, vec3(1.0), v_flash);
  float f = smoothstep(u_fogRange.x, u_fogRange.y, v_dist) * 0.3;
  o = vec4(mix(c, u_fog, f), t.a);
}`;

function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  for (const [type, src] of [
    [gl.VERTEX_SHADER, vs],
    [gl.FRAGMENT_SHADER, fs],
  ] as const) {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
  return p;
}

type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as RGB;
const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as RGB;
const WHITE: RGB = [1, 1, 1];
const GREY: RGB = [0.72, 0.72, 0.74];

interface Palette {
  sky: RGB;
  grass: RGB;
  lane: RGB;
  laneAlt: RGB;
  edge: RGB;
  player: RGB;
  champion: RGB;
  enemy: RGB;
  brute: RGB;
  good: RGB;
  goodDeep: RGB;
  bad: RGB;
  badDeep: RGB;
  tower: RGB;
  towerSide: RGB;
  cannon: RGB;
  /** Multipliers for the (light) lane and grass textures. */
  laneTint: RGB;
  grassTint: RGB;
}

// Colours follow docs/mob-art.md.
const LIGHT: Palette = {
  sky: hex('#f6f3ee'),
  grass: hex('#cfe3b8'),
  lane: hex('#eee7da'),
  laneAlt: hex('#e6ddcc'),
  edge: hex('#d9c49b'),
  player: hex('#3d8bff'),
  champion: hex('#2459e0'),
  enemy: hex('#ff4d5e'),
  brute: hex('#b01d38'),
  good: hex('#2ed3ee'),
  goodDeep: hex('#14a4c8'),
  bad: hex('#ff4f86'),
  badDeep: hex('#e0306a'),
  tower: hex('#b91c1c'),
  towerSide: hex('#7f1d1d'),
  cannon: hex('#1e40af'),
  laneTint: [1, 1, 1],
  grassTint: [1, 1, 1],
};
const DARK: Palette = {
  ...LIGHT,
  sky: hex('#16161a'),
  grass: hex('#1f2a1c'),
  lane: hex('#2a2a30'),
  laneAlt: hex('#25252b'),
  edge: hex('#4a4652'),
  cannon: hex('#3b82f6'),
  // Light textures × these ≈ the dark lane (#2a2a30) and dark grass (#1f2a1c).
  laneTint: [0.19, 0.19, 0.235],
  grassTint: [0.24, 0.22, 0.28],
};

const FOV = 44;
const PITCH = (63 * Math.PI) / 180;
/** Where the lane should start and end on screen (fractions of height, top = 0). */
const FRAME = { top: 0.17, bottom: 0.86 };
const eyeFor = (tz: number, dist: number) => [0, Math.sin(PITCH) * dist, tz - Math.cos(PITCH) * dist];
/**
 * Applied to the world before the camera:
 * - depth is compressed (sim units stay the same), so on a portrait phone the
 *   lane reads wide and chunky like Mob Control, not a thin strip;
 * - x is mirrored, because a camera looking down +z with +y up draws +x on the
 *   LEFT of the screen. Without this, dragging right moved the cannon left.
 */
const DEPTH = 0.55;
// prettier-ignore
const VIEW_FIX = new Float32Array([-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, DEPTH, 0, 0, 0, 0, 1]);

// ---- atlas tables (src/mob/render/atlas.json, generated by `npm run assets:mob`) ----------
type FrameName = keyof typeof atlas.frames;
const FRAME_NAMES = Object.keys(atlas.frames) as FrameName[];
const frameIndex = (name: FrameName) => FRAME_NAMES.indexOf(name);
const FRAME_UV = new Float32Array(FRAME_NAMES.flatMap((n) => atlas.frames[n].uv));
// Per frame: quad size in multiples of the instance size (frame px / reference px), then the anchor.
const FRAME_GEO = new Float32Array(
  FRAME_NAMES.flatMap((n) => {
    const f = atlas.frames[n];
    return [f.w / f.unit, f.h / f.unit, f.anchor[0], f.anchor[1]];
  }),
);
const SHEET = {
  player: frameIndex('player_0'),
  champion: frameIndex('champion_0'),
  enemy: frameIndex('enemy_0'),
  brute: frameIndex('brute_0'),
  cannon: frameIndex('cannon_0'),
  tower: frameIndex('tower_0'),
};
const asset = (path: string) => import.meta.env.BASE_URL + path;

interface Art {
  atlas: WebGLTexture;
  lane: WebGLTexture;
  grass: WebGLTexture;
  gate: WebGLTexture;
}

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  private mesh: WebGLProgram;
  private ball: WebGLProgram;
  private sprite: WebGLProgram;
  private texProg: WebGLProgram;
  private meshBuf: WebGLBuffer;
  private meshVao: WebGLVertexArrayObject;
  private texBuf: WebGLBuffer;
  private texVao: WebGLVertexArrayObject;
  private ballVao: WebGLVertexArrayObject;
  private spriteVao: WebGLVertexArrayObject;
  private instBuf: WebGLBuffer;
  private spriteBuf: WebGLBuffer;
  private inst = new Float32Array(MAX_INSTANCES * FLOATS);
  private spriteInst = new Float32Array(MAX_INSTANCES * SPRITE_FLOATS);
  private verts: number[] = [];
  private tverts: number[] = [];
  /** Textures, once loaded. Until then (or if loading fails) the plain ball/box look is drawn. */
  private art: Art | null = null;
  private alphaToCoverage: boolean;
  pal: Palette = LIGHT;
  vp: Mat4 = new Float32Array(16);
  width = 1;
  height = 1;
  /** Screen point just above the castle (for its health bar); updated every frame. */
  private lastShots = -1;
  private recoilUntil = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, premultipliedAlpha: true });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    this.mesh = compile(gl, MESH_VS, MESH_FS);
    this.ball = compile(gl, BALL_VS, BALL_FS);
    this.sprite = compile(gl, SPRITE_VS, SPRITE_FS);
    this.texProg = compile(gl, TEX_VS, TEX_FS);
    // With MSAA, alpha-to-coverage gives the alpha-tested sprites soft edges at no sorting cost.
    this.alphaToCoverage = (gl.getParameter(gl.SAMPLES) as number) > 1;

    // Mesh: interleaved pos(3) + color(4), rebuilt each frame (a few hundred vertices).
    this.meshVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.meshVao);
    this.meshBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.meshBuf);
    const mp = gl.getAttribLocation(this.mesh, 'a_pos'), mc = gl.getAttribLocation(this.mesh, 'a_color');
    gl.enableVertexAttribArray(mp);
    gl.vertexAttribPointer(mp, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(mc);
    gl.vertexAttribPointer(mc, 4, gl.FLOAT, false, 28, 12);

    // Textured mesh: pos(3) + uv(2) + color(4).
    this.texVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.texVao);
    this.texBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texBuf);
    const tp = gl.getAttribLocation(this.texProg, 'a_pos'),
      tu = gl.getAttribLocation(this.texProg, 'a_uv'),
      tc = gl.getAttribLocation(this.texProg, 'a_color');
    gl.enableVertexAttribArray(tp);
    gl.vertexAttribPointer(tp, 3, gl.FLOAT, false, TEX_FLOATS * 4, 0);
    gl.enableVertexAttribArray(tu);
    gl.vertexAttribPointer(tu, 2, gl.FLOAT, false, TEX_FLOATS * 4, 12);
    gl.enableVertexAttribArray(tc);
    gl.vertexAttribPointer(tc, 4, gl.FLOAT, false, TEX_FLOATS * 4, 20);

    // Billboards: a unit quad, instanced.
    this.ballVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.ballVao);
    const quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const bc = gl.getAttribLocation(this.ball, 'a_corner');
    gl.enableVertexAttribArray(bc);
    gl.vertexAttribPointer(bc, 2, gl.FLOAT, false, 0, 0);
    this.instBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.inst.byteLength, gl.DYNAMIC_DRAW);
    const bi = gl.getAttribLocation(this.ball, 'a_inst'), bcol = gl.getAttribLocation(this.ball, 'a_color');
    gl.enableVertexAttribArray(bi);
    gl.vertexAttribPointer(bi, 4, gl.FLOAT, false, FLOATS * 4, 0);
    gl.vertexAttribDivisor(bi, 1);
    gl.enableVertexAttribArray(bcol);
    gl.vertexAttribPointer(bcol, 4, gl.FLOAT, false, FLOATS * 4, 16);
    gl.vertexAttribDivisor(bcol, 1);

    // Sprites: a 0..1 quad (y down, like the atlas), instanced.
    this.spriteVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.spriteVao);
    const squad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, squad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]), gl.STATIC_DRAW);
    const sc = gl.getAttribLocation(this.sprite, 'a_corner');
    gl.enableVertexAttribArray(sc);
    gl.vertexAttribPointer(sc, 2, gl.FLOAT, false, 0, 0);
    this.spriteBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.spriteInst.byteLength, gl.DYNAMIC_DRAW);
    const si = gl.getAttribLocation(this.sprite, 'a_inst'), sm = gl.getAttribLocation(this.sprite, 'a_meta');
    gl.enableVertexAttribArray(si);
    gl.vertexAttribPointer(si, 4, gl.FLOAT, false, SPRITE_FLOATS * 4, 0);
    gl.vertexAttribDivisor(si, 1);
    gl.enableVertexAttribArray(sm);
    gl.vertexAttribPointer(sm, 2, gl.FLOAT, false, SPRITE_FLOATS * 4, 16);
    gl.vertexAttribDivisor(sm, 1);
    gl.bindVertexArray(null);

    gl.useProgram(this.sprite);
    gl.uniform4fv(gl.getUniformLocation(this.sprite, 'u_uv'), FRAME_UV);
    gl.uniform4fv(gl.getUniformLocation(this.sprite, 'u_geo'), FRAME_GEO);
    gl.uniform1f(gl.getUniformLocation(this.sprite, 'u_cut'), this.alphaToCoverage ? 0.08 : 0.5);

    void this.loadArt();
  }

  /** True once the sprite atlas and textures are on the GPU. */
  get artReady(): boolean {
    return this.art !== null;
  }

  private async loadArt(): Promise<void> {
    const load = (path: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`failed to load ${path}`));
        img.src = asset(path);
      });
    try {
      const t = atlas.textures;
      const [a, l, g, gt] = await Promise.all([load(atlas.image), load(t.lane.image), load(t.grass.image), load(t.gate.image)]);
      if (this.gl.isContextLost()) return;
      this.art = {
        atlas: this.texture(a, true, false),
        lane: this.texture(l, false, true),
        grass: this.texture(g, false, true),
        gate: this.texture(gt, false, true),
      };
    } catch {
      // Keep the fallback look; the game is fully playable without textures.
    }
  }

  private texture(img: HTMLImageElement, premultiply: boolean, repeat: boolean): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    if (aniso && repeat) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 4);
    return t;
  }

  setDark(dark: boolean): void {
    this.pal = dark ? DARK : LIGHT;
  }

  resize(cssW: number, cssH: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = cssW;
    this.height = cssH;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
  }

  private fit = { key: '', dist: 12, tz: 6 };

  /**
   * Behind and above the cannon at a fixed downward angle. Distance and aim are
   * solved so the cannon sits just above the bottom HUD and the tower top just
   * below the header, whatever the screen shape or lane length.
   */
  private camera(w: World, shake: number) {
    const aspect = this.width / this.height;
    const proj = perspective((FOV * Math.PI) / 180, aspect, 0.1, 120);
    const key = `${aspect.toFixed(3)}:${w.length}`;
    if (this.fit.key !== key) {
      let { dist, tz } = this.fit;
      for (let k = 0; k < 60; k++) {
        const vp = multiply(proj, multiply(lookAt(eyeFor(tz, dist), [0, 0, tz]), VIEW_FIX));
        const bottom = project(vp, 0, 0, -0.9, 1, 1);
        const top = project(vp, 0, 2.0, w.length + 0.4, 1, 1);
        if (!bottom || !top) {
          dist *= 1.2;
          continue;
        }
        const span = bottom.y - top.y;
        dist *= span / (FRAME.bottom - FRAME.top);
        tz -= ((bottom.y + top.y) / 2 - (FRAME.bottom + FRAME.top) / 2) * w.length * DEPTH * 0.6;
      }
      this.fit = { key, dist, tz };
    }
    const eye = eyeFor(this.fit.tz, this.fit.dist);
    eye[0] += shake * 0.04;
    const view = multiply(lookAt(eye, [0, 0, this.fit.tz]), VIEW_FIX);
    this.vp = multiply(proj, view);
    return { eye, view, proj };
  }

  /** World-space point → CSS pixel position on the canvas. */
  toScreen(x: number, y: number, z: number) {
    return project(this.vp, x * LANE, y, z, this.width, this.height);
  }

  private quad(a: number[], b: number[], c: number[], d: number[], col: RGB, alpha = 1): void {
    for (const p of [a, b, c, a, c, d]) this.verts.push(p[0], p[1], p[2], col[0], col[1], col[2], alpha);
  }

  /** Textured quad; each corner is [x, y, z, u, v]. */
  private tquad(a: number[], b: number[], c: number[], d: number[], col: RGB, alpha = 1): void {
    for (const p of [a, b, c, a, c, d]) this.tverts.push(p[0], p[1], p[2], p[3], p[4], col[0], col[1], col[2], alpha);
  }

  private box(x: number, z: number, w: number, h: number, dpt: number, top: RGB, side: RGB, front: RGB, y0 = 0): void {
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - dpt / 2, z1 = z + dpt / 2;
    this.quad([x0, h, z0], [x1, h, z0], [x1, h, z1], [x0, h, z1], top);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, h, z0], [x0, h, z0], front);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, h, z1], [x0, h, z0], side);
    this.quad([x1, y0, z0], [x1, y0, z1], [x1, h, z1], [x1, h, z0], side);
  }

  /** Candy gate frame: striped posts and a glossy top bar (opaque mesh). */
  private gateFrame(x0: number, x1: number, z: number, col: RGB, deep: RGB, dim: boolean): void {
    const c = dim ? mix(col, GREY, 0.55) : col;
    const d = dim ? mix(deep, GREY, 0.55) : deep;
    const light = mix(c, WHITE, 0.45);
    // The camera looks down steeply, so the tops of the bar and posts carry most of the look.
    const h = GATE_H, pw = 0.15, bar = 0.12, bd = 0.2;
    // top bar: bright top face with a glossy stripe, deeper front
    this.box((x0 + x1) / 2, z, x1 - x0, h + 0.02, bd, c, d, d, h - bar);
    const yt = h + 0.021, zt = z - bd / 2;
    this.quad([x0, yt, zt + 0.04], [x1, yt, zt + 0.04], [x1, yt, zt + 0.09], [x0, yt, zt + 0.09], light);
    // posts with candy stripes
    for (const px of [x0, x1]) {
      this.box(px, z, pw, h + 0.04, bd, light, d, d);
      for (let y = 0.08; y < h - bar; y += 0.2) {
        this.quad([px - pw / 2, y, zt - 0.001], [px + pw / 2, y, zt - 0.001], [px + pw / 2, y + 0.08, zt - 0.001], [px - pw / 2, y + 0.08, zt - 0.001], WHITE);
      }
    }
  }

  render(w: World, fx: { shake: number; particles: { x: number; z: number; y: number; s: number; c: RGB; a: number }[] }): void {
    const { gl, pal, art } = this;
    const { view, proj } = this.camera(w, fx.shake);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(pal.sky[0], pal.sky[1], pal.sky[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // The track scrolls toward the camera as the crowd runs: texture coordinates move with it.
    const sc = w.belt;

    // ---- static-ish meshes: ground, lane, tower, cannon (opaque) ----
    this.verts.length = 0;
    this.tverts.length = 0;
    const L = w.length;
    const zFar = L + 3;
    // The mobs' castle stands at the far end, where the belt comes from.
    const TZ = w.length;
    if (art) {
      // Grass: tiles come out roughly square on screen despite the depth squash.
      const gs = 2.4, gz = gs / DEPTH, X0 = -8, X1 = 8, Z0 = -4, Z1 = zFar + 8;
      // (v runs against z so the texture's "up" points up the screen)
      this.tquad([X0, -0.01, Z0, X0 / gs, -(Z0 + sc) / gz], [X1, -0.01, Z0, X1 / gs, -(Z0 + sc) / gz], [X1, -0.01, Z1, X1 / gs, -(Z1 + sc) / gz], [X0, -0.01, Z1, X0 / gs, -(Z1 + sc) / gz], pal.grassTint);
      // Lane: u across the lane (curbs at both edges), v repeats every 2 world units (2 bands).
      const v0 = (-2 + sc) / 2, v1 = (zFar + sc) / 2;
      this.tquad([-LANE, 0, -2, 0, v0], [LANE, 0, -2, 1, v0], [LANE, 0, zFar, 1, v1], [-LANE, 0, zFar, 0, v1], pal.laneTint);
    } else {
      this.quad([-8, -0.01, -4], [8, -0.01, -4], [8, -0.01, zFar + 8], [-8, -0.01, zFar + 8], pal.grass);
      for (let k = Math.floor(sc) - 2; k - sc < zFar; k++) {
        const z0 = Math.max(-2, k - sc), z1 = k + 1 - sc;
        if (z1 <= -2) continue;
        this.quad([-LANE, 0, z0], [LANE, 0, z0], [LANE, 0, z1], [-LANE, 0, z1], k & 1 ? pal.laneAlt : pal.lane);
      }
    }
    const e = 0.07;
    this.box(-LANE - e / 2, zFar / 2 - 1, e, 0.08, zFar + 2, pal.edge, pal.edge, pal.edge);
    this.box(LANE + e / 2, zFar / 2 - 1, e, 0.08, zFar + 2, pal.edge, pal.edge, pal.edge);
    // Cannon recoil: the sim counts shots, so a change means it just fired.
    const now = performance.now();
    if (w.shots !== this.lastShots) {
      if (w.shots > this.lastShots && this.lastShots >= 0) this.recoilUntil = now + RECOIL_MS;
      this.lastShots = w.shots;
    }
    const cx = w.cannonX * LANE;
    const knobs: { x: number; z: number; c: RGB }[] = [];
    if (art) {
      for (const g of w.gates) {
        if (g.broken || g.z < -2 || g.z > zFar) continue;
        const good = isGood(g.kind);
        const col = good ? pal.good : pal.bad;
        const x0 = g.x0 * LANE + 0.03, x1 = g.x1 * LANE - 0.03;
        this.gateFrame(x0, x1, g.z, col, good ? pal.goodDeep : pal.badDeep, g.cool > 0);
        const kc = g.cool > 0 ? mix(col, GREY, 0.55) : mix(col, WHITE, 0.2);
        knobs.push({ x: x0, z: g.z, c: kc }, { x: x1, z: g.z, c: kc });
      }
    } else {
      this.box(0, TZ + 0.2, TOWER_HALF * 2 * LANE, 1.5, 0.9, pal.towerSide, pal.towerSide, pal.tower);
      // Battlements
      for (let i = -2; i <= 2; i++) this.box(i * 0.3, TZ - 0.1, 0.18, 1.72, 0.3, pal.towerSide, pal.towerSide, pal.tower);
      this.box(cx, 0.05, 0.42, 0.22, 0.42, pal.cannon, pal.cannon, pal.cannon);
      this.box(cx, 0.32, 0.14, 0.16, 0.5, pal.cannon, pal.cannon, pal.cannon);
    }
    const opaque = this.verts.length;

    // ---- gates (translucent, drawn after opaque) ----
    const groundVerts = this.tverts.length;
    for (const g of w.gates) {
      if (g.broken || g.z < -2 || g.z > zFar) continue;
      const col = isGood(g.kind) ? pal.good : pal.bad;
      const pulse = g.flash < 0.15 ? 0.25 * (1 - g.flash / 0.15) : 0;
      const dim = g.cool > 0 ? 0.45 : 1;
      const x0 = g.x0 * LANE + 0.03, x1 = g.x1 * LANE - 0.03;
      const h = GATE_H;
      if (art) {
        // Candy glass: the gate texture (white stripes + alpha), tinted; one tile per gate height.
        const u1 = (x1 - x0) / GATE_H;
        this.tquad([x0, 0, g.z, 0, 1], [x1, 0, g.z, u1, 1], [x1, h, g.z, u1, 0], [x0, h, g.z, 0, 0], mix(col, WHITE, pulse * 1.5), (0.95 + pulse) * dim);
      } else {
        this.quad([x0, 0, g.z], [x1, 0, g.z], [x1, h, g.z], [x0, h, g.z], col, (0.32 + pulse) * dim);
        this.quad([x0, h - 0.06, g.z], [x1, h - 0.06, g.z], [x1, h, g.z], [x0, h, g.z], col, 0.9 * dim);
        this.quad([x0, 0, g.z], [x0 + 0.06, 0, g.z], [x0 + 0.06, h, g.z], [x0, h, g.z], col, 0.9 * dim);
        this.quad([x1 - 0.06, 0, g.z], [x1, 0, g.z], [x1, h, g.z], [x1 - 0.06, h, g.z], col, 0.9 * dim);
      }
    }

    const fog0 = this.fit.dist * 0.9, fog1 = this.fit.dist * 2.6;
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    if (art) {
      gl.useProgram(this.texProg);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.texProg, 'u_vp'), false, this.vp);
      gl.uniform3fv(gl.getUniformLocation(this.texProg, 'u_fog'), pal.sky);
      gl.uniform2f(gl.getUniformLocation(this.texProg, 'u_fogRange'), fog0, fog1);
      gl.uniform1i(gl.getUniformLocation(this.texProg, 'u_tex'), 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindVertexArray(this.texVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.texBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.tverts), gl.STREAM_DRAW);
      gl.bindTexture(gl.TEXTURE_2D, art.grass);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindTexture(gl.TEXTURE_2D, art.lane);
      gl.drawArrays(gl.TRIANGLES, 6, 6);
    }

    gl.useProgram(this.mesh);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.mesh, 'u_vp'), false, this.vp);
    gl.uniform3fv(gl.getUniformLocation(this.mesh, 'u_fog'), pal.sky);
    gl.uniform2f(gl.getUniformLocation(this.mesh, 'u_fogRange'), fog0, fog1);
    gl.bindVertexArray(this.meshVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.meshBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.verts), gl.STREAM_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, opaque / 7);

    // ---- units: shadows, then bodies, then gates on top, then particles ----
    gl.useProgram(this.ball);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.ball, 'u_view'), false, view);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.ball, 'u_proj'), false, proj);
    const shapeLoc = gl.getUniformLocation(this.ball, 'u_shape');
    gl.bindVertexArray(this.ballVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);

    let n = 0;
    const put = (x: number, y: number, z: number, s: number, c: RGB, a = 1) => {
      if (n >= MAX_INSTANCES) return;
      const o = n++ * FLOATS;
      const f = this.inst;
      f[o] = x; f[o + 1] = y; f[o + 2] = z; f[o + 3] = s;
      f[o + 4] = c[0]; f[o + 5] = c[1]; f[o + 6] = c[2]; f[o + 7] = a;
    };
    const units = (flat: boolean) => {
      n = 0;
      const p = w.players, en = w.enemies;
      const k = art ? 0.8 : 1; // sprite shadows: a little narrower than the body
      for (let i = 0; i < p.n; i++) {
        const vis = art ? (p.hp[i] > 1 ? BIG_VIS : UNIT_VIS) : 1;
        const r = radius(p.hp[i]) * LANE * Math.min(1, 0.4 + p.age[i] * 6) * k * vis;
        const bob = flat ? 0 : Math.abs(Math.sin(p.age[i] * 14 + i)) * 0.03;
        put(p.x[i] * LANE, flat ? 0.01 : r + bob, p.z[i], r, p.hp[i] > 1 ? pal.champion : pal.player);
      }
      for (let i = 0; i < en.n; i++) {
        const r = radius(en.hp[i]) * LANE * k * (art ? (en.hp[i] > 1 ? BIG_VIS : UNIT_VIS) : 1);
        const bob = flat ? 0 : Math.abs(Math.sin(en.age[i] * 12 + i)) * 0.03;
        put(en.x[i] * LANE, flat ? 0.01 : r + bob, en.z[i], r, en.hp[i] > 1 ? pal.brute : pal.enemy);
      }
      if (flat && art) {
        put(cx, 0.01, CANNON_ANCHOR_Z + 0.1, CANNON_W * 0.6, pal.player);
        put(0, 0.01, TZ + 0.3, TOWER_W * 0.6, pal.enemy);
      }
      return n;
    };

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.uniform1i(shapeLoc, 1);
    const shadows = units(true);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.inst, 0, shadows * FLOATS);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, shadows);

    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.uniform1i(shapeLoc, 0);
    if (art) {
      // Gate post knobs: shiny candy balls.
      n = 0;
      for (const kn of knobs) put(kn.x, GATE_H + 0.1, kn.z, 0.11, kn.c);
    } else {
      units(false);
    }
    if (n) {
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.inst, 0, n * FLOATS);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    }

    if (art) this.drawSprites(w, art.atlas, view, proj, now);

    // Gates: translucent, depth-tested against units but not writing depth.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    if (art) {
      gl.useProgram(this.texProg);
      gl.bindVertexArray(this.texVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.texBuf);
      gl.bindTexture(gl.TEXTURE_2D, art.gate);
      gl.drawArrays(gl.TRIANGLES, groundVerts / TEX_FLOATS, (this.tverts.length - groundVerts) / TEX_FLOATS);
    } else {
      gl.useProgram(this.mesh);
      gl.bindVertexArray(this.meshVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.meshBuf);
      gl.drawArrays(gl.TRIANGLES, opaque / 7, (this.verts.length - opaque) / 7);
    }

    // Particles (additive-ish soft discs).
    if (fx.particles.length) {
      gl.useProgram(this.ball);
      gl.bindVertexArray(this.ballVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
      gl.uniform1i(shapeLoc, 2);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      n = 0;
      for (const q of fx.particles) put(q.x * LANE, q.y, q.z, q.s, q.c, q.a);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.inst, 0, n * FLOATS);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    }
    gl.depthMask(true);
    gl.bindVertexArray(null);
  }

  /** Units, cannon and castle from the atlas: one instanced, alpha-tested draw. */
  private drawSprites(w: World, tex: WebGLTexture, view: Mat4, proj: Mat4, now: number): void {
    const gl = this.gl;
    const f = this.spriteInst;
    let n = 0;
    const put = (x: number, y: number, z: number, size: number, frame: number, flash = 0) => {
      const o = n++ * SPRITE_FLOATS;
      f[o] = x; f[o + 1] = y; f[o + 2] = z; f[o + 3] = size; f[o + 4] = frame; f[o + 5] = flash;
    };
    const p = w.players, en = w.enemies;
    for (let i = 0; i < p.n; i++) {
      const big = p.hp[i] > 1;
      const size = 2 * radius(p.hp[i]) * LANE * (big ? BIG_VIS : UNIT_VIS) * Math.min(1, 0.4 + p.age[i] * 6);
      const frame = (big ? SHEET.champion : SHEET.player) + ((Math.floor(p.age[i] * (big ? 8 : 11)) + i) & 3);
      put(p.x[i] * LANE, 0, p.z[i], size, frame);
    }
    for (let i = 0; i < en.n; i++) {
      const big = en.hp[i] > 1;
      const size = 2 * radius(en.hp[i]) * LANE * (big ? BIG_VIS : UNIT_VIS);
      const frame = (big ? SHEET.brute : SHEET.enemy) + ((Math.floor(en.age[i] * (big ? 7 : 9)) + i) & 3);
      put(en.x[i] * LANE, 0, en.z[i], size, frame);
    }
    put(w.cannonX * LANE, 0, CANNON_ANCHOR_Z, CANNON_W, SHEET.cannon + (now < this.recoilUntil ? 1 : 0));
    put(0, 0, w.length + 0.2, TOWER_W, SHEET.tower);

    gl.useProgram(this.sprite);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.sprite, 'u_view'), false, view);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.sprite, 'u_proj'), false, proj);
    gl.uniform3fv(gl.getUniformLocation(this.sprite, 'u_fog'), this.pal.sky);
    gl.uniform2f(gl.getUniformLocation(this.sprite, 'u_fogRange'), this.fit.dist * 0.9, this.fit.dist * 2.6);
    gl.uniform1i(gl.getUniformLocation(this.sprite, 'u_tex'), 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.bindVertexArray(this.spriteVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, f, 0, n * SPRITE_FLOATS);
    if (this.alphaToCoverage) gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
  }
}
