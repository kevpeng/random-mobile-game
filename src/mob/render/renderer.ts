import { isGood } from '../sim/levels';
import { radius, type World } from '../sim/world';
import { lookAt, multiply, perspective, project, type Mat4 } from './math';

/** Sim lane x ∈ [-1, 1] is drawn this many world units wide on each side. */
export const LANE = 1.9;
/** Gate panel height (world units). */
export const GATE_H = 1.0;
const MAX_INSTANCES = 9000;
const FLOATS = 8; // x, y, z, size, r, g, b, a

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
  bad: RGB;
  tower: RGB;
  towerSide: RGB;
  cannon: RGB;
}

const LIGHT: Palette = {
  sky: hex('#f6f3ee'),
  grass: hex('#cfe3b8'),
  lane: hex('#eee7da'),
  laneAlt: hex('#e6ddcc'),
  edge: hex('#b9ad98'),
  player: hex('#3b82f6'),
  champion: hex('#1e40af'),
  enemy: hex('#ef4444'),
  brute: hex('#991b1b'),
  good: hex('#22c3ee'),
  bad: hex('#f43f5e'),
  tower: hex('#b91c1c'),
  towerSide: hex('#7f1d1d'),
  cannon: hex('#1e40af'),
};
const DARK: Palette = {
  ...LIGHT,
  sky: hex('#16161a'),
  grass: hex('#1f2a1c'),
  lane: hex('#2a2a30'),
  laneAlt: hex('#25252b'),
  edge: hex('#45454d'),
  cannon: hex('#3b82f6'),
};

const FOV = 44;
const PITCH = (63 * Math.PI) / 180;
/** Where the lane should start and end on screen (fractions of height, top = 0). */
const FRAME = { top: 0.17, bottom: 0.86 };
const eyeFor = (tz: number, dist: number) => [0, Math.sin(PITCH) * dist, tz - Math.cos(PITCH) * dist];
/**
 * The lane is drawn with depth compressed (sim units stay the same), so on a
 * portrait phone it reads wide and chunky like Mob Control, not a thin strip.
 */
const DEPTH = 0.55;
// prettier-ignore
const SQUASH = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, DEPTH, 0, 0, 0, 0, 1]);

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  private mesh: WebGLProgram;
  private ball: WebGLProgram;
  private meshBuf: WebGLBuffer;
  private meshVao: WebGLVertexArrayObject;
  private ballVao: WebGLVertexArrayObject;
  private instBuf: WebGLBuffer;
  private inst = new Float32Array(MAX_INSTANCES * FLOATS);
  private verts: number[] = [];
  pal: Palette = LIGHT;
  vp: Mat4 = new Float32Array(16);
  width = 1;
  height = 1;

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, premultipliedAlpha: true });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    this.mesh = compile(gl, MESH_VS, MESH_FS);
    this.ball = compile(gl, BALL_VS, BALL_FS);

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
    gl.bindVertexArray(null);
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
        const vp = multiply(proj, multiply(lookAt(eyeFor(tz, dist), [0, 0, tz]), SQUASH));
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
    const view = multiply(lookAt(eye, [0, 0, this.fit.tz]), SQUASH);
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

  private box(x: number, z: number, w: number, h: number, dpt: number, top: RGB, side: RGB, front: RGB): void {
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - dpt / 2, z1 = z + dpt / 2;
    this.quad([x0, h, z0], [x1, h, z0], [x1, h, z1], [x0, h, z1], top);
    this.quad([x0, 0, z0], [x1, 0, z0], [x1, h, z0], [x0, h, z0], front);
    this.quad([x0, 0, z0], [x0, 0, z1], [x0, h, z1], [x0, h, z0], side);
    this.quad([x1, 0, z0], [x1, 0, z1], [x1, h, z1], [x1, h, z0], side);
  }

  render(w: World, fx: { shake: number; particles: { x: number; z: number; y: number; s: number; c: RGB; a: number }[] }): void {
    const { gl, pal } = this;
    const { view, proj } = this.camera(w, fx.shake);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(pal.sky[0], pal.sky[1], pal.sky[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // ---- static-ish meshes: ground, lane, tower, cannon (opaque) ----
    this.verts.length = 0;
    const L = w.length;
    const zFar = L + 3;
    this.quad([-8, -0.01, -4], [8, -0.01, -4], [8, -0.01, zFar + 8], [-8, -0.01, zFar + 8], pal.grass);
    for (let z = -2, k = 0; z < zFar; z += 1, k++) {
      this.quad([-LANE, 0, z], [LANE, 0, z], [LANE, 0, z + 1], [-LANE, 0, z + 1], k % 2 ? pal.laneAlt : pal.lane);
    }
    const e = 0.07;
    this.box(-LANE - e / 2, zFar / 2 - 1, e, 0.08, zFar + 2, pal.edge, pal.edge, pal.edge);
    this.box(LANE + e / 2, zFar / 2 - 1, e, 0.08, zFar + 2, pal.edge, pal.edge, pal.edge);
    if (!w.endless) {
      const hit = w.towerFlash < 0.08;
      const shake = w.towerFlash < 0.25 ? Math.sin(w.towerFlash * 90) * 0.04 * (1 - w.towerFlash / 0.25) : 0;
      const face = hit ? (pal.tower.map((c) => c + (1 - c) * 0.45) as RGB) : pal.tower;
      this.box(shake, L + 0.2, 1.5, 1.5, 0.9, pal.towerSide, pal.towerSide, face);
      // Battlements
      for (let i = -2; i <= 2; i++) this.box(shake + i * 0.3, L - 0.1, 0.18, 1.72, 0.3, pal.towerSide, pal.towerSide, face);
    }
    const cx = w.cannonX * LANE;
    this.box(cx, 0.05, 0.42, 0.22, 0.42, pal.cannon, pal.cannon, pal.cannon);
    this.box(cx, 0.32, 0.14, 0.16, 0.5, pal.cannon, pal.cannon, pal.cannon);
    const opaque = this.verts.length;

    // ---- gates (translucent, drawn after opaque) ----
    for (const g of w.gates) {
      if (g.broken) continue;
      const col = isGood(g.kind) ? pal.good : pal.bad;
      const pulse = g.flash < 0.15 ? 0.25 * (1 - g.flash / 0.15) : 0;
      const dim = g.cool > 0 ? 0.45 : 1;
      const x0 = g.x0 * LANE + 0.03, x1 = g.x1 * LANE - 0.03;
      const h = GATE_H;
      this.quad([x0, 0, g.z], [x1, 0, g.z], [x1, h, g.z], [x0, h, g.z], col, (0.32 + pulse) * dim);
      this.quad([x0, h - 0.06, g.z], [x1, h - 0.06, g.z], [x1, h, g.z], [x0, h, g.z], col, 0.9 * dim);
      this.quad([x0, 0, g.z], [x0 + 0.06, 0, g.z], [x0 + 0.06, h, g.z], [x0, h, g.z], col, 0.9 * dim);
      this.quad([x1 - 0.06, 0, g.z], [x1, 0, g.z], [x1, h, g.z], [x1 - 0.06, h, g.z], col, 0.9 * dim);
    }

    gl.useProgram(this.mesh);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.mesh, 'u_vp'), false, this.vp);
    gl.uniform3fv(gl.getUniformLocation(this.mesh, 'u_fog'), pal.sky);
    gl.uniform2f(gl.getUniformLocation(this.mesh, 'u_fogRange'), this.fit.dist * 0.9, this.fit.dist * 2.6);
    gl.bindVertexArray(this.meshVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.meshBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.verts), gl.STREAM_DRAW);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLES, 0, opaque / 7);

    // ---- units: shadows, then balls, then gates on top, then particles ----
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
      for (let i = 0; i < p.n; i++) {
        const r = radius(p.hp[i]) * LANE * Math.min(1, 0.4 + p.age[i] * 6);
        const bob = flat ? 0 : Math.abs(Math.sin(p.age[i] * 14 + i)) * 0.03;
        put(p.x[i] * LANE, flat ? 0.01 : r + bob, p.z[i], r, p.hp[i] > 1 ? pal.champion : pal.player);
      }
      for (let i = 0; i < en.n; i++) {
        const r = radius(en.hp[i]) * LANE;
        const bob = flat ? 0 : Math.abs(Math.sin(en.age[i] * 12 + i)) * 0.03;
        put(en.x[i] * LANE, flat ? 0.01 : r + bob, en.z[i], r, en.hp[i] > 1 ? pal.brute : pal.enemy);
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
    const balls = units(false);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.inst, 0, balls * FLOATS);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, balls);

    // Gates: translucent, depth-tested against units but not writing depth.
    gl.useProgram(this.mesh);
    gl.bindVertexArray(this.meshVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.meshBuf);
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLES, opaque / 7, (this.verts.length - opaque) / 7);

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
}
