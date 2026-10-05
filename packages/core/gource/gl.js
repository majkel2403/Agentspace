// WebGL backend for a Gource frame: one textured-quad program (normal alpha blending, like Gource's
// GL_SRC_ALPHA / GL_ONE_MINUS_SRC_ALPHA) and one bloom program (additive GL_ONE / GL_ONE).
// Textures are generated here (a shaded sphere for files, an avatar for users, a beam profile).

export const ATLAS = 512;
// regions in the atlas (pixels): [x, y, w, h]
export const REG = { file: [0, 0, 256, 256], user: [256, 0, 192, 256], beam: [0, 264, 128, 4], solid: [140, 264, 4, 4] };

// RGBA pixels of the atlas, also used by the Canvas 2D backend
export function makeAtlas() {
  const N = ATLAS;
  const px = new Uint8ClampedArray(N * N * 4);
  const put = (x, y, v, a) => { const o = (y * N + x) * 4; px[o] = px[o + 1] = px[o + 2] = Math.round(v * 255); px[o + 3] = Math.round(a * 255); };
  // a shaded ball lit from the upper left, with a soft edge
  const ball = (cx, cy, R, x, y) => {
    const dx = (x - cx) / R; const dy = (y - cy) / R; const d = Math.hypot(dx, dy);
    const edge = Math.max(0, Math.min(1, (1 - d) * R * 0.9));
    const shade = 0.9 - 0.19 * Math.hypot(dx + 0.25, dy + 0.3);
    return [Math.max(0.5, shade), edge];
  };
  { // file
    const [X, Y, W] = REG.file;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const [v, a] = ball(W / 2, W / 2, W * 0.47, x + 0.5, y + 0.5); put(X + x, Y + y, v, a); }
  }
  { // user: a head and rounded shoulders
    const [X, Y, W, H] = REG.user;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const fx = x + 0.5; const fy = y + 0.5;
      let [v, a] = ball(W * 0.5, H * 0.3, W * 0.29, fx, fy);
      // body: trapezoid from 0.47 to 0.86 of the height, corners rounded, shaded from the left
      const ty = (fy / H - 0.47) / 0.39;
      if (ty >= 0 && ty <= 1) {
        const half = (0.22 + 0.17 * Math.min(1, ty * 1.6)) * W;
        const dx = Math.abs(fx - W * 0.5);
        let ba = Math.max(0, Math.min(1, half - dx));
        const cr = 0.08 * W;
        if (ty > 1 - cr / (0.39 * H)) { const ry = (ty - (1 - cr / (0.39 * H))) * 0.39 * H; const rx = Math.max(0, dx - (half - cr)); ba = Math.min(ba, Math.max(0, Math.min(1, cr - Math.hypot(rx, ry)))); }
        if (ty < 0.12) ba *= Math.max(0, Math.min(1, ty / 0.12 + 0.4));
        const bv = 0.78 - 0.32 * (fx / W) - 0.12 * ty;
        // the head sits in front of the body
        const na = a + ba * (1 - a);
        if (na > 0) { v = (v * a + bv * ba * (1 - a)) / na; a = na; }
      }
      put(X + x, Y + y, v, a);
    }
  }
  { // beam profile: alpha rises and falls across (edges) / along (actions) the quad
    const [X, Y, W, H] = REG.beam;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const u = (x + 0.5) / W; put(X + x, Y + y, 1, 1 - Math.abs(u * 2 - 1)); }
  }
  { const [X, Y, W, H] = REG.solid; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(X + x, Y + y, 1, 1); }
  return px;
}

const VS = `attribute vec2 p; attribute vec2 uv; attribute vec4 c; uniform vec2 res; varying vec2 vuv; varying vec4 vc;
void main(){ vuv = uv; vc = c; gl_Position = vec4(p.x / res.x * 2.0 - 1.0, 1.0 - p.y / res.y * 2.0, 0.0, 1.0); }`;
const FS = `precision mediump float; uniform sampler2D tex; varying vec2 vuv; varying vec4 vc;
void main(){ vec4 t = texture2D(tex, vuv); gl_FragColor = vec4(vc.rgb * t.rgb, vc.a * t.a); }`;
// Gource's bloom: a dithered cosine falloff around each directory, added on top
const BVS = `attribute vec2 p; attribute vec3 l; attribute vec3 c; uniform vec2 res; varying vec3 vl; varying vec3 vc;
void main(){ vl = l; vc = c; gl_Position = vec4(p.x / res.x * 2.0 - 1.0, 1.0 - p.y / res.y * 2.0, 0.0, 1.0); }`;
const BFS = `precision highp float; varying vec3 vl; varying vec3 vc;
void main(){
  vec2 pos = vl.xy; float R = vl.z;
  float r = fract(sin(dot(pos, vec2(11.3713, 67.3219))) * 2351.3718);
  float offset = (0.5 - r) * R * 0.045;
  float intensity = min(1.0, cos((length(pos * 2.0) + offset) / R));
  float g = intensity * smoothstep(0.0, 2.0, intensity);
  g *= smoothstep(1.0, 0.67 + r * 0.33, 1.0 - intensity);
  gl_FragColor = vec4(vc * max(g, 0.0), 1.0);
}`;

export function createGL(canvas) {
  let gl = null;
  try { gl = canvas.getContext('webgl', { alpha: false, antialias: true, premultipliedAlpha: false, preserveDrawingBuffer: true }); } catch (e) { gl = null; }
  if (!gl) return null;
  const prog = (vs, fs) => {
    const sh = (type, src) => { const x = gl.createShader(type); gl.shaderSource(x, src); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  };
  let P1; let P2;
  try { P1 = prog(VS, FS); P2 = prog(BVS, BFS); } catch (e) { return null; }
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, ATLAS, ATLAS, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(makeAtlas().buffer));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const buf = gl.createBuffer();
  const bbuf = gl.createBuffer();
  const loc = { p: gl.getAttribLocation(P1, 'p'), uv: gl.getAttribLocation(P1, 'uv'), c: gl.getAttribLocation(P1, 'c'), res: gl.getUniformLocation(P1, 'res'), tex: gl.getUniformLocation(P1, 'tex') };
  const bloc = { p: gl.getAttribLocation(P2, 'p'), l: gl.getAttribLocation(P2, 'l'), c: gl.getAttribLocation(P2, 'c'), res: gl.getUniformLocation(P2, 'res') };
  let V = new Float32Array(8 * 6 * 4096);
  let B = new Float32Array(8 * 6 * 512);
  let n = 0;
  const uvOf = (r) => [r[0] / ATLAS, r[1] / ATLAS, (r[0] + r[2]) / ATLAS, (r[1] + r[3]) / ATLAS];
  const UV = { file: uvOf(REG.file), user: uvOf(REG.user), beam: uvOf(REG.beam), solid: uvOf(REG.solid) };
  const vtx = (x, y, u, v, r, g, b, a) => {
    if (n * 8 + 8 > V.length) { const nv = new Float32Array(V.length * 2); nv.set(V); V = nv; }
    const o = n * 8; V[o] = x; V[o + 1] = y; V[o + 2] = u; V[o + 3] = v; V[o + 4] = r; V[o + 5] = g; V[o + 6] = b; V[o + 7] = a; n++;
  };
  // quad from 4 corners (a b c d in order) with per-corner uv and colour
  const quad = (q, uv, c) => {
    vtx(q[0], q[1], uv[0], uv[1], c[0], c[1], c[2], c[3]); vtx(q[2], q[3], uv[2], uv[3], c[4], c[5], c[6], c[7]); vtx(q[4], q[5], uv[4], uv[5], c[8], c[9], c[10], c[11]);
    vtx(q[0], q[1], uv[0], uv[1], c[0], c[1], c[2], c[3]); vtx(q[4], q[5], uv[4], uv[5], c[8], c[9], c[10], c[11]); vtx(q[6], q[7], uv[6], uv[7], c[12], c[13], c[14], c[15]);
  };
  const rect = (x, y, w, h, t, r, g, b, a) => {
    const u = UV[t];
    quad([x, y, x + w, y, x + w, y + h, x, y + h], [u[0], u[1], u[2], u[1], u[2], u[3], u[0], u[3]], [r, g, b, a, r, g, b, a, r, g, b, a, r, g, b, a]);
  };
  const bu = UV.beam; const bv = (bu[1] + bu[3]) / 2;

  function draw(F, W, H, dpr, bg) {
    const cw = Math.round(W * dpr); const ch = Math.round(H * dpr);
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    gl.viewport(0, 0, cw, ch);
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    n = 0;
    // edges: shadow pass (+2 px), then the lines, 2.5 px half width with the beam profile across
    for (let pass = 0; pass < 2; pass++) {
      for (const e of F.edges) {
        for (let i = 0; i + 6 < e.length; i += 6) {
          const x1 = e[i]; const y1 = e[i + 1]; const x2 = e[i + 6]; const y2 = e[i + 7];
          let px = -(y1 - y2); let py = x1 - x2; const l = Math.hypot(px, py) || 1;
          px = px / l * 2.5; py = py / l * 2.5;
          const o = pass === 0 ? 2 : 0;
          const c1 = pass === 0 ? [0, 0, 0, e[i + 5] * 0.5] : [e[i + 2], e[i + 3], e[i + 4], e[i + 5]];
          const c2 = pass === 0 ? [0, 0, 0, e[i + 11] * 0.5] : [e[i + 8], e[i + 9], e[i + 10], e[i + 11]];
          quad([x1 + px + o, y1 + py + o, x1 - px + o, y1 - py + o, x2 - px + o, y2 - py + o, x2 + px + o, y2 + py + o],
            [bu[2], bv, bu[0], bv, bu[0], bv, bu[2], bv], [...c1, ...c1, ...c2, ...c2]);
        }
      }
    }
    for (const f of F.files) rect(f.x - f.size / 2 + f.shadow, f.y - f.size / 2 + f.shadow, f.size, f.size, 'file', 0, 0, 0, f.a * 0.5);
    for (const b of F.beams) {
      const [r, g, bb] = b.col; const a = b.a; const a2 = a * 0.1;
      quad(b.q, [bu[0], bv, bu[0], bv, bu[2], bv, bu[2], bv], [r, g, bb, a2, r, g, bb, a2, r, g, bb, a, r, g, bb, a]);
    }
    for (const f of F.files) rect(f.x - f.size / 2, f.y - f.size / 2, f.size, f.size, 'file', f.col[0], f.col[1], f.col[2], f.a);
    for (const u of F.users) rect(u.x - u.w / 2 + u.shadow, u.y - u.h / 2 + u.shadow, u.w, u.h, 'user', 0, 0, 0, u.a * 0.5);
    for (const u of F.users) rect(u.x - u.w / 2, u.y - u.h / 2, u.w, u.h, 'user', u.col[0], u.col[1], u.col[2], u.a);

    gl.enable(gl.BLEND);
    gl.useProgram(P1);
    gl.uniform2f(loc.res, W, H);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(loc.tex, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, V.subarray(0, n * 8), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(loc.p); gl.vertexAttribPointer(loc.p, 2, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(loc.uv); gl.vertexAttribPointer(loc.uv, 2, gl.FLOAT, false, 32, 8);
    gl.enableVertexAttribArray(loc.c); gl.vertexAttribPointer(loc.c, 4, gl.FLOAT, false, 32, 16);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, n);
    gl.disableVertexAttribArray(loc.uv);

    // bloom
    let m = 0;
    const need = F.blooms.length * 6 * 8;
    if (B.length < need) B = new Float32Array(need * 2);
    const bv8 = (x, y, lx, ly, R, c) => { const o = m * 8; B[o] = x; B[o + 1] = y; B[o + 2] = lx; B[o + 3] = ly; B[o + 4] = R; B[o + 5] = c[0]; B[o + 6] = c[1]; B[o + 7] = c[2]; m++; };
    for (const b of F.blooms) {
      const R = b.R; const Rw = b.Rw;
      const c = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
      for (const [i, j] of c) bv8(b.x + i * R, b.y + j * R, i * Rw, j * Rw, Rw, b.col);
    }
    if (m) {
      gl.useProgram(P2);
      gl.uniform2f(bloc.res, W, H);
      gl.bindBuffer(gl.ARRAY_BUFFER, bbuf);
      gl.bufferData(gl.ARRAY_BUFFER, B.subarray(0, m * 8), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(bloc.p); gl.vertexAttribPointer(bloc.p, 2, gl.FLOAT, false, 32, 0);
      gl.enableVertexAttribArray(bloc.l); gl.vertexAttribPointer(bloc.l, 3, gl.FLOAT, false, 32, 8);
      gl.enableVertexAttribArray(bloc.c); gl.vertexAttribPointer(bloc.c, 3, gl.FLOAT, false, 32, 20);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.drawArrays(gl.TRIANGLES, 0, m);
      gl.disableVertexAttribArray(bloc.l);
    }
  }
  return { kind: 'webgl', draw };
}
