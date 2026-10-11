// Frame description: turns a simulation state into what Gource draws, in screen pixels, in Gource's order:
// edges (shadow, then line), file shadows, action beams, files, user shadows, users, bloom; then text.
// Backends (WebGL, Canvas 2D) only rasterise this description.
import { SIM, fileAlpha, fileColour, userAlpha, nameAlpha, dirVisible, camDistance } from './sim.js';
import { ACTION_COLOUR } from './actions.js';

const lerp = (a, b, k) => a + (b - a) * k;

// camera: Gource looks straight down with a 90° vertical field of view, so the visible world height is 2·distance
// eases 0..1 over 0.7 s of wall time from the moment the blend started (a presentation effect, never simulated)
const BLEND_MS = 700;
export function blendEase(b) {
  const x = Math.min(1, Math.max(0, (performance.now() - b.t0) / BLEND_MS));
  return 1 - Math.pow(1 - x, 3);
}

// 3D: the tree stands up. A folder rises by its depth, its files sit on its disc, agents hover above the tree. The eye
// looks at the ground from a pitch and a yaw with a 50° field of view. The amount k3 (0 = flat as in Gource, 1 = full
// 3D) scales every height and the perspective, so the flat view is exactly the plain 2D projection.
export const DIR_LIFT = 70; // world units a folder rises per level of depth
const FILE_LIFT = 10; // a file sits just above its folder's disc
const AVATAR_H = 90; // agents hover above the tree, their shadows fall on the ground
const FOV_T = Math.tan(25 * Math.PI / 180);
const FIT_3D = 0.3; // how much smaller the full 3D frame is, so the raised tree still fits the screen
export const dirHeight = (d) => d.depth * DIR_LIFT;

// The projection shared by the tree and the city: world (x, y, z) to screen [x, y, scale, depth towards the eye].
// k3 is the amount of 3D (0 flat, 1 full), pitch tilts the ground towards the eye, yaw turns it around the centre (cx, cy),
// K is pixels per world unit at the centre, (ox, oy) the screen centre of the free area and span its height in pixels.
// The eye keeps the centre's scale at K (50° field of view), so flat (k3 0) is the plain 2D projection.
export function projector(cx, cy, K, ox, oy, span, k3, pitch, yaw) {
  const P = pitch * k3; const cP = Math.cos(P); const sP = Math.sin(P); const cY = Math.cos(yaw); const sY = Math.sin(yaw);
  const D = (Math.max(40, span) / 2) / K / FOV_T;
  const pt = (x, y, z) => {
    const X = x - cx; const Y = y - cy; const Z = z * k3;
    const X1 = X * cY - Y * sY; const Y1 = X * sY + Y * cY;
    const zv = Y1 * sP + Z * cP;
    const sc = k3 > 0 ? D / Math.max(D * 0.25, D - zv) : 1;
    return [ox + X1 * K * sc, oy + (Y1 * cP - Z * sP) * K * sc, sc, zv];
  };
  // the ground point under a screen pixel (zoom and pan keep the point under the pointer in place)
  const unproj = (px, py) => {
    const a = (py - oy) / (K * cP);
    const Y1 = a * D / (D + a * sP);
    const sc = k3 > 0 ? D / (D - Y1 * sP) : 1;
    const X1 = (px - ox) / (K * sc);
    return { x: cx + X1 * cY + Y1 * sY, y: cy - X1 * sY + Y1 * cY };
  };
  return { pt, unproj };
}

// the camera centre that keeps the ground point w under the pixel (px, py) at scale K. The perspective depends on the
// scale, so the centre is found by a few steps instead of a plain offset. fit is the 3D fit (K is the flat scale).
export function anchorCentre(w, px, py, K, ox, oy, span, k3, pitch, yaw, fit) {
  let x = w.x; let y = w.y;
  for (let i = 0; i < 5; i++) {
    const u = projector(x, y, K * fit, ox, oy, span, k3, pitch, yaw).unproj(px, py);
    x += w.x - u.x; y += w.y - u.y;
  }
  return { x, y };
}

export function view(s, k, W, H, user, inset) {
  const c = s.cam;
  // the scene is framed inside the free area between panels (insets), like Gource framing its whole window
  const L = inset ? inset.l || 0 : 0; const R = inset ? inset.r || 0 : 0; const Tp = inset ? inset.t || 0 : 0; const B = inset ? inset.b || 0 : 0;
  // distance from the tracked half extents and this screen's free area, so any window size frames the tree
  const aspect = Math.max(0.2, Math.max(40, W - L - R) / Math.max(40, H - Tp - B));
  const ox = L + (W - L - R) / 2; const oy = Tp + (H - Tp - B) / 2;
  let cx; let cy; let K;
  // 3D stands the tree up, so the same frame shows it a little smaller (fit): free camera scales are kept without it
  const k3 = user && user.k3 != null ? user.k3 : 0;
  const fit = 1 - FIT_3D * k3;
  if (user && user.free) {
    // a free camera (the reader moved or zoomed): it no longer follows the work until "follow" is switched on again
    cx = user.free.cx; cy = user.free.cy; K = user.free.K * fit;
  } else if (user && user.blend) {
    // handing the camera back to the work: ease from where the reader left it (UI-only, not part of the simulation)
    const z = camDistance(lerp(c.pex, c.ex, k), lerp(c.pey, c.ey, k), aspect) * (user.zoom || 1);
    const ax = lerp(c.px, c.x, k); const ay = lerp(c.py, c.y, k);
    const aK = (Math.max(40, H - Tp - B) / 2) / Math.max(1, z) * ((user.fill) || 1);
    const f = blendEase(user.blend);
    cx = ax + (user.blend.cx - ax) * (1 - f); cy = ay + (user.blend.cy - ay) * (1 - f);
    K = Math.exp(Math.log(aK) + (Math.log(user.blend.K) - Math.log(aK)) * (1 - f)) * fit;
  } else {
    const z = camDistance(lerp(c.pex, c.ex, k), lerp(c.pey, c.ey, k), aspect) * (user ? user.zoom : 1);
    cx = lerp(c.px, c.x, k) + (user ? user.panX : 0);
    cy = lerp(c.py, c.y, k) + (user ? user.panY : 0);
    // "fill" frames the tree larger than the simulation's own margin, so the structures read at a glance
    K = (Math.max(40, H - Tp - B) / 2) / Math.max(1, z) * ((user && user.fill) || 1) * fit;
  }
  // 3D terms: the pitch only applies with k3, and the yaw turns the map around the centre
  const pr = projector(cx, cy, K, ox, oy, H - Tp - B, k3, user && user.pitch ? user.pitch : 0, user && user.yaw ? user.yaw : 0);
  // flat helpers for the ground plane without tilt (tests and the comparison harness)
  return { cx, cy, K, fit, W, H, k3, ox, oy, span: H - Tp - B, pitch: user && user.pitch ? user.pitch : 0, yaw: user && user.yaw ? user.yaw : 0,
    pt: pr.pt, unproj: pr.unproj, sx: (x) => ox + (x - cx) * K, sy: (y) => oy + (y - cy) * K };
}

export function buildFrame(s, k, W, H, o) {
  o = o || {};
  const V = view(s, k, W, H, o.camera, o.inset);
  const K = V.K;
  // nodeScale: files and avatars are drawn larger than their true size, so the structure stays readable zoomed out
  const NODE = (o.camera && o.camera.node) || 1;
  const F = { V, edges: [], files: [], users: [], beams: [], blooms: [], labels: [], picks: [], key: [], counts: { files: 0, dirs: 0, users: 0 } };
  if (s.root < 0) return F;
  const dirs = s.dirs;
  const P = (d) => V.pt(lerp(d.px, d.x, k), lerp(d.py, d.y, k), dirHeight(d));

  // edges and bloom, walking the tree like Gource (an edge is drawn for a visible child of a drawn node)
  const walk = (d) => {
    const vis = dirVisible(s, d);
    if (vis) {
      F.counts.dirs++;
      const p = P(d);
      // with the studio on the camera comes close, where full-strength glow of big directories would wash out the scene
      const bl = o.agentNames ? 0.32 : 0.75;
      F.blooms.push({ x: p[0], y: p[1], R: d.r * 2 * K * p[2], Rw: d.r * 2, col: [d.col[0] * bl, d.col[1] * bl, d.col[2] * bl] });
      if (d.parent >= 0) {
        const par = dirs[d.parent];
        const p1 = P(par);
        const sp = V.pt(lerp(d.psx, d.sx, k), lerp(d.psy, d.sy, k), dirHeight(d));
        F.edges.push(spline(p1, par.col, p, d.col, sp));
        if (d.sinceNode < 5 && !o.hideDirNames) {
          F.labels.push({ kind: 'dir', text: d.token, x: p1[0] * 0.25 + p[0] * 0.25 + sp[0] * 0.5, y: p1[1] * 0.25 + p[1] * 0.25 + sp[1] * 0.5, a: Math.max(0, 5 - d.sinceNode) / 5 });
        }
      }
    }
    for (const c of d.children) { const ch = dirs[c]; if (dirVisible(s, ch)) walk(ch); }
  };
  walk(dirs[s.root]);

  // files: each sits on its folder's disc; its shadow falls on that disc, offset as a drop shadow
  const fs = SIM.FILE_SIZE;
  for (const d of dirs) {
    if (d.dead) continue;
    const dx = lerp(d.px, d.x, k); const dy = lerp(d.py, d.y, k); const dz = dirHeight(d);
    for (const fi of d.files) {
      const f = s.files[fi];
      if (f.hidden) continue;
      const wx = dx + lerp(f.px, f.x, k); const wy = dy + lerp(f.py, f.y, k);
      const a = fileAlpha(f);
      const sel = o.selected === 'file:' + f.path;
      const hl = sel || o.highlight === 'file:' + f.path;
      const col = sel ? [1, 1, 1] : fileColour(f);
      const q = V.pt(wx, wy, dz + FILE_LIFT);
      const g = V.pt(wx, wy, dz);
      const size = Math.max(2.5, fs * K * NODE * q[2]);
      F.files.push({ x: q[0], y: q[1], size, col, a, shx: g[0] + 2 * K, shy: g[1] + 2 * K, zv: q[3], path: f.path });
      F.counts.files++;
      F.picks.push({ id: 'file:' + f.path, x: q[0], y: q[1], r: Math.max(6, fs * K * NODE * 0.6 * q[2]) });
      const na = hl ? 1 : f.nameInt > 0 && fs * K >= 4 ? nameAlpha(f.nameInt, SIM.FILENAME_TIME) : 0;
      if (na > 0.01 && !o.hideFileNames) {
        const t = V.pt(wx + 5.5, wy - (hl ? 2 : 1), dz + FILE_LIFT);
        F.labels.push({ kind: hl ? 'file-sel' : 'file', text: f.name, x: t[0], y: t[1], a: na });
      }
    }
  }

  // users and their beams: an agent hovers above the tree, its beams run from there to the file it works on
  const uw = SIM.USER_SIZE; const uh = uw * SIM.USER_RATIO;
  for (const u of s.users) {
    if (u.dead) continue;
    const ux = lerp(u.px, u.x, k); const uy = lerp(u.py, u.y, k);
    const ua = V.pt(ux, uy, AVATAR_H);
    for (const ai of u.active) {
      const ac = s.acts[ai];
      if (ac.progress >= 1) continue;
      const f = s.files[ac.f]; const d = dirs[f.dir];
      const fx = lerp(d.px, d.x, k) + lerp(f.px, f.x, k); const fy = lerp(d.py, d.y, k) + lerp(f.py, f.y, k);
      const fp = V.pt(fx, fy, dirHeight(d) + FILE_LIFT);
      const kind = o.compat && (ac.kind === 'R' || ac.kind === 'P' || ac.kind === 'F') ? 'M' : ac.kind;
      F.beams.push(beam(ua, fp, Math.max(fs * 0.5, 0.9 / K) * K * fp[2], ACTION_COLOUR[kind] || ACTION_COLOUR.M, 1 - ac.progress));
    }
    const a = userAlpha(u);
    const sel = o.selected === 'user:' + u.id;
    const hl = sel || o.highlight === 'user:' + u.id;
    const x = ua[0]; const y = ua[1]; const sc = ua[2];
    const g = V.pt(ux, uy, 0);
    const minW = o.agentNames ? 22 : 14;
    const w = Math.max(minW, uw * K * NODE * sc);
    F.users.push({ x, y, w, h: w * SIM.USER_RATIO, col: sel ? [1, 1, 1] : u.col, a, shx: g[0] + 2 * K, shy: g[1] + 2 * K, zv: ua[3], id: u.id, label: u.label, ucol: u.col });
    F.counts.users++;
    F.picks.push({ id: 'user:' + u.id, x, y, r: Math.max(9, uw * K * NODE * 0.6 * sc) });
    // with the studio on, agents are always named (they are the story); otherwise names fade as in Gource
    const na = hl ? 1 : o.agentNames ? a : u.nameInt > 0 ? nameAlpha(u.nameInt, SIM.NAME_TIME) : 0;
    if (na > 0.01) F.labels.push({ kind: hl ? 'user-sel' : 'user', text: u.label, x, y: y - Math.max(minW, uw * K * sc) * SIM.USER_RATIO * 0.5, a: na });
    // tool in use (our addition): a small tag under the avatar while the tool runs
    if (u.tool && u.toolT >= 0 && !o.compat) {
      const age = s.t - u.toolT;
      const ta = u.toolState === 'run' ? Math.min(1, age * 2) : Math.max(0, 1 - age / 1.5);
      if (ta > 0.02 && a > 0.05) F.labels.push({ kind: u.toolState === 'fail' ? 'tool-fail' : 'tool', text: u.tool, x, y: y + uh * K * sc * 0.5 + 2, a: ta * a });
    }
  }
  // messages between agents (our addition): a thin beam from sender to receiver
  if (!o.compat) {
    for (const m of s.msgs) {
      const A = s.users[m.a]; const B = s.users[m.b];
      if (!A || !B || A.dead || B.dead) continue;
      const age = s.t - m.t0;
      const pa = V.pt(lerp(A.px, A.x, k), lerp(A.py, A.y, k), AVATAR_H);
      const pb = V.pt(lerp(B.px, B.x, k), lerp(B.py, B.y, k), AVATAR_H);
      F.beams.push(beam(pa, pb, 3 * K * pb[2], m.col, Math.max(0, 1 - age / 1.5) * 0.85));
    }
  }
  // far first, so nearer files and agents cover them (only matters with 3D; the flat sort keeps the order)
  if (V.k3 > 0) { F.files.sort((a, b) => a.zv - b.zv); F.users.sort((a, b) => a.zv - b.zv); }

  // file extension key (animated in the simulation like Gource's: rows slide, entries fade)
  F.key = Object.values(s.keyEnt).filter((e) => e.dest > 0 && e.alpha > 0)
    .map((e) => ({ ext: e.ext, n: Math.max(0, s.key[e.ext] || 0), col: e.ext ? colourOf(e.ext, s) : [1, 1, 1], alpha: e.alpha, row: e.y }));
  return F;
}

const keyCache = {};
function colourOf(ext, s) {
  if (!keyCache[ext]) {
    for (const f of s.files) if (f.ext === ext) { keyCache[ext] = f.col; break; }
  }
  return keyCache[ext] || [1, 1, 1];
}

// quadratic spline from parent (p1) to child (p2) through the lagging control point, 1..10 segments
function spline(p1, c1, p2, c2, sp) {
  const mx = (p1[0] - p2[0]) * 0.5; const my = (p1[1] - p2[1]) * 0.5;
  const tx = p1[0] - sp[0]; const ty = p1[1] - sp[1];
  const lm = Math.hypot(mx, my) || 1; const lt = Math.hypot(tx, ty) || 1;
  const dp = Math.min(1, (tx * mx + ty * my) / (lm * lt));
  let n = Math.min(10, Math.floor(Math.acos(Math.max(-1, dp)) / Math.PI * 100));
  if (n < 1) n = 1;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n; const tt = 1 - t;
    const ax = p1[0] * t + sp[0] * tt; const ay = p1[1] * t + sp[1] * tt;
    const bx = sp[0] * t + p2[0] * tt; const by = sp[1] * t + p2[1] * tt;
    pts.push(ax * t + bx * tt, ay * t + by * tt,
      c1[0] * t + c2[0] * tt, c1[1] * t + c2[1] * tt, c1[2] * t + c2[2] * tt, c1[3] * t + c2[3] * tt);
  }
  return pts; // [x, y, r, g, b, a] per point, child first
}

// tapered beam between two projected points ([x, y, …]), half width in pixels at the source's end
function beam(p1, p2, half, col, a) {
  let nx = p2[0] - p1[0]; let ny = p2[1] - p1[1]; const l = Math.hypot(nx, ny) || 1;
  nx /= l; ny /= l;
  const px = -ny * half; const py = nx * half;
  const sx = p1[0]; const sy = p1[1]; const tx = p2[0]; const ty = p2[1];
  return {
    q: [sx - px * 0.3, sy - py * 0.3, sx + px * 0.3, sy + py * 0.3, tx + px, ty + py, tx - px, ty - py],
    col, a,
  };
}
