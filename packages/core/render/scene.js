// Scene: turns (timeline, time, camera) into screen-space primitives + labels + pick targets.
// Every visual element is derived from the state at time t and from the events in a short window
// before t — nothing is animated that did not happen (ambient motion only breathes/rotates).
import { KINDS, PULSE } from '../events.js';
import { layout, hash } from '../layout.js';
import { createPrims, mix } from './prims.js';
import { SHAPE } from './prims.js';

const EXT_COL = { md: '#9FE3FF', js: '#FFE16B', ts: '#6DB6FF', json: '#CDBBFF', py: '#FFD98A', pdf: '#FFA6B8', xlsx: '#8CFFD9', zip: '#FFC2D4', html: '#FF9F6B', css: '#7CC4FF', txt: '#C9D3F2', csv: '#8CFFD9', png: '#FF9FD8', resource: '#B7A6FF', file: '#9FE3FF' };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
const STAR = [];
(function () {
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 520; i++) {
    const u = r() * 2 - 1; const a = r() * 6.2832; const q = Math.sqrt(1 - u * u);
    STAR.push([q * Math.cos(a), u, q * Math.sin(a), 0.25 + r() * 0.9, 0.12 + r() * 0.4, r() * 6.28]);
  }
})();

export function nodeColor(n) {
  if (n.kind === 'file') return EXT_COL[n.ext] || EXT_COL.file;
  if (n.kind === 'agent' && n.color) return n.color;
  return (KINDS[n.kind] || KINDS.file).color;
}
const AGENT_COLS = ['#6DB6FF', '#FFAE5C', '#4FF0D8', '#D6BEFF', '#FF8FA3', '#8CFFB4', '#FFD98A', '#9FE3FF'];

export function createScene() {
  const prims = createPrims();
  let cacheFor = null;
  let posCache = {};
  const cur = {}; // current world positions this frame
  const scr = {}; // screen data this frame
  const depth = {};

  function frame(o) {
    const { T, t, W, H, cam } = o;
    const fx = o.rm ? 0 : o.fx;
    const q = o.q == null ? 2 : o.q;
    prims.reset();
    const labels = [];
    const picks = [];
    if (cacheFor !== T) { cacheFor = T; posCache = {}; }
    const s = T.stateAt(t);
    layout(s, posCache);
    // agent colours by birth order
    let ai = 0;
    for (const id of s.order) { const n = s.nodes[id]; if (n.kind === 'agent') n.color = AGENT_COLS[ai++ % AGENT_COLS.length]; }

    // ---- orb compression ("from afar the orb, up close the workflow")
    let c = 0;
    if (o.opening === 'orb') {
      c = 1 - ease((t - 2200) / 11000);
      if (s.task.endedAt != null) c = Math.max(c, 0.72 * ease((t - s.task.endedAt) / 2600));
    }
    const ORB = 34;

    // ---- current positions (growth from the parent, compression, breathing)
    for (const id of s.order) {
      const n = s.nodes[id];
      const tg = posCache[id];
      const par = n.parent ? cur[n.parent] : null;
      const ptg = n.parent ? posCache[n.parent] : null;
      let x = tg[0]; let y = tg[1]; let z = tg[2];
      if (par && ptg) {
        const k = ease((t - n.born) / 750);
        x = par[0] + (tg[0] - ptg[0]) * k; y = par[1] + (tg[1] - ptg[1]) * k; z = par[2] + (tg[2] - ptg[2]) * k;
      }
      const h = hash(id);
      if (n.kind !== 'hermes') {
        const amp = n.kind === 'agent' ? 2.2 : n.kind === 'tool' ? 1.6 : 1.1;
        x += Math.sin(fx * 0.5 + (h % 97)) * amp; y += Math.cos(fx * 0.43 + (h % 89)) * amp; z += Math.sin(fx * 0.37 + (h % 83)) * amp;
      }
      if (c > 0.001 && n.kind !== 'hermes') {
        const l = Math.hypot(x, y, z) || 1;
        const rr = ORB * (0.32 + 0.68 * ((h % 1000) / 1000));
        x += ((x / l) * rr - x) * c; y += ((y / l) * rr - y) * c; z += ((z / l) * rr - z) * c;
      }
      cur[id] = cur[id] && cur[id].length === 3 ? (cur[id][0] = x, cur[id][1] = y, cur[id][2] = z, cur[id]) : [x, y, z];
      depth[id] = n.parent ? (depth[n.parent] || 0) + 1 : 0;
    }

    // ---- camera
    const cyw = Math.cos(cam.yaw); const syw = Math.sin(cam.yaw); const cpt = Math.cos(cam.pitch); const spt = Math.sin(cam.pitch);
    const f = Math.min(W, H) * 0.95;
    const cx = W * 0.5 + (cam.ox || 0); const cy = H * 0.5 + (cam.oy || 0);
    const PR = [0, 0, 0, 0];
    const proj = (x, y, z) => {
      x -= cam.tx; y -= cam.ty; z -= cam.tz;
      const x1 = x * cyw - z * syw; const z1 = x * syw + z * cyw;
      const y2 = y * cpt - z1 * spt; const z2 = y * spt + z1 * cpt;
      const zc = z2 + cam.dist; const k = f / Math.max(zc, 30);
      PR[0] = cx + x1 * k; PR[1] = cy - y2 * k; PR[2] = k; PR[3] = zc;
      return PR;
    };
    const kref = f / cam.dist;
    let fit = 60;
    for (const id of s.order) {
      const p = cur[id];
      const pp = proj(p[0], p[1], p[2]);
      const fog = clamp(1.2 - (pp[3] - cam.dist) / (cam.dist * 1.6), 0.35, 1);
      scr[id] = scr[id] || {};
      const d = scr[id]; d.x = pp[0]; d.y = pp[1]; d.k = pp[2]; d.z = pp[3]; d.fog = pp[3] < 30 ? 0 : fog;
      fit = Math.max(fit, Math.hypot(p[0] - cam.tx, p[1] - cam.ty, p[2] - cam.tz));
    }
    const act = (n, tau) => Math.exp(-Math.max(0, t - n.last) / (tau || 2600));
    const ext = {};
    const tint = {};
    for (const id of s.order) {
      const n = s.nodes[id];
      if (!n.parent || !scr[n.parent] || !scr[id].fog) continue;
      const a = scr[n.parent]; const b = scr[id];
      const dd = Math.hypot(a.x - b.x, a.y - b.y);
      ext[n.parent] = Math.max(ext[n.parent] || 0, dd);
      (tint[n.parent] = tint[n.parent] || []).push(nodeColor(n));
    }

    // ---- background stars
    const ns = q >= 2 ? STAR.length : q === 1 ? 300 : 160;
    const fs = Math.min(W, H) * 0.75;
    for (let i = 0; i < ns; i++) {
      const st = STAR[i];
      const x1 = st[0] * cyw - st[2] * syw; const z1 = st[0] * syw + st[2] * cyw;
      const y2 = st[1] * cpt - z1 * spt; const z2 = st[1] * spt + z1 * cpt;
      if (z2 < 0.1) continue;
      prims.sprite(W / 2 + (x1 / z2) * fs, H / 2 - (y2 / z2) * fs, st[3] + 0.4, '#AFC0E8', st[4] * (0.75 + 0.25 * Math.sin(fx * 1.3 + st[5])), SHAPE.DOT);
    }

    // ---- haze (Gource-like bloom behind clusters)
    for (const id of s.order) {
      const n = s.nodes[id];
      const kids = n.kids || 0;
      if (!(n.kind === 'hermes' || n.kind === 'agent' || (n.kind === 'tool' && kids >= 2) || n.kind === 'planner')) continue;
      const d = scr[id];
      if (!d.fog) continue;
      const tc = tint[id] && tint[id].length ? tint[id][(tint[id].length * 0.5) | 0] : nodeColor(n);
      const col = mix(mix(nodeColor(n), tc, 0.5), '#D8DEEC', n.kind === 'hermes' ? 0.35 : 0.5);
      const rad = Math.max(40 * d.k / kref, (ext[id] || 0) * 1.55 + 26);
      const al = (0.07 + 0.14 * act(n, 6000) + Math.min(0.08, kids * 0.008)) * d.fog * (1 - c * 0.5);
      prims.sprite(d.x, d.y, rad, col, al, SHAPE.GLOW);
      if (q >= 1) prims.sprite(d.x, d.y, rad * 2.2, col, al * 0.45, SHAPE.GLOW);
    }

    // ---- edges
    const edges = s.edges;
    for (const key in edges) {
      const e = edges[key];
      const A = s.nodes[e.a]; const B = s.nodes[e.b];
      if (!A || !B) continue;
      const a = scr[e.a]; const b = scr[e.b];
      if (!a.fog || !b.fog) continue;
      const g = ease((t - e.born) / 700);
      if (g <= 0) continue;
      const bx = a.x + (b.x - a.x) * g; const by = a.y + (b.y - a.y) * g;
      const fog = Math.min(a.fog, b.fog);
      const recent = Math.exp(-Math.max(0, t - e.last) / 1800);
      if (e.kind === 'talk') {
        // fibre bundle: strands fan out of each agent's cluster and pinch together in between
        const strands = Math.min(10, 2 + e.uses * 2) * (q >= 1 ? 1 : 0.5);
        const ca = nodeColor(A); const cb = nodeColor(B);
        const dx = bx - a.x; const dy = by - a.y; const len = Math.hypot(dx, dy) || 1; const nx = -dy / len; const ny = dx / len;
        for (let k = 0; k < strands; k++) {
          const hk = hash(key + k);
          const sa = (((hk % 1000) / 1000) - 0.5) * 26 * a.k / kref; const sb = ((((hk >> 10) % 1000) / 1000) - 0.5) * 26 * b.k / kref;
          const pinch = ((((hk >> 20) % 100) / 100) - 0.5) * 4;
          let px = a.x + nx * sa; let py = a.y + ny * sa;
          for (let sgm = 1; sgm <= 8; sgm++) {
            const u = sgm / 8; const w0 = (1 - u) * (1 - u); const w1 = 2 * (1 - u) * u; const w2 = u * u;
            const mx = (a.x + bx) / 2 + nx * pinch; const my = (a.y + by) / 2 + ny * pinch;
            const qx = w0 * (a.x + nx * sa) + w1 * mx + w2 * (bx + nx * sb); const qy = w0 * (a.y + ny * sa) + w1 * my + w2 * (by + ny * sb);
            prims.line(px, py, qx, qy, 0.8, mix(ca, cb, (sgm - 1) / 8), (0.08 + 0.3 * recent) * fog, mix(ca, cb, u), (0.08 + 0.3 * recent) * fog);
            px = qx; py = qy;
          }
        }
        continue;
      }
      const hub = A.kind === 'hermes' || A.kind === 'planner' || B.kind === 'hermes';
      const w = hub ? 2.6 : A.kind === 'agent' ? 1.6 : A.kind === 'tool' ? 0.9 : 0.8;
      const tree = e.kind === 'tree';
      const ca = mix(nodeColor(A), '#FFFFFF', 0.55); const cb = mix(nodeColor(B), '#FFFFFF', 0.25);
      const al = (tree ? (hub ? 0.55 : 0.38) + 0.4 * recent : 0.07 + 0.42 * recent) * fog;
      prims.line(a.x, a.y, bx, by, w, ca, al, cb, al * 0.8);
      if (q >= 1 && (hub || recent > 0.05)) prims.line(a.x, a.y, bx, by, w * 5, ca, (hub ? 0.06 : 0) + 0.08 * recent * fog, cb, (hub ? 0.04 : 0) + 0.08 * recent * fog);
    }

    // ---- nodes
    for (const id of s.order) {
      const n = s.nodes[id];
      const d = scr[id];
      if (!d.fog) continue;
      const col = nodeColor(n);
      const sp = ease((t - n.born) / 600);
      const a0 = d.fog * (0.25 + 0.75 * sp);
      const at = act(n);
      const kk = d.k / kref;
      let r = 2;
      if (n.kind === 'hermes') {
        // the Orb: particles on a sphere that swirl faster while Hermes reasons
        const R = 16 + (ORB + 4 - 16) * c;
        const reason = act(n, 1800);
        const N = q >= 2 ? 900 : q === 1 ? 450 : 200;
        const spin = fx * (0.25 + 1.4 * reason);
        const p0 = cur[id];
        for (let i = 0; i < N; i++) {
          const y = 1 - (2 * (i + 0.5)) / N; const rr = Math.sqrt(1 - y * y);
          const th = i * 2.39996 + spin * (0.6 + 0.4 * ((i % 7) / 7));
          const shell = R * (0.55 + 0.45 * (((i * 7919) % 101) / 101));
          const pp = proj(p0[0] + Math.cos(th) * rr * shell, p0[1] + y * shell, p0[2] + Math.sin(th) * rr * shell);
          prims.sprite(pp[0], pp[1], 0.9 + 0.7 * (pp[2] / kref), i % 5 ? '#FFD98A' : '#FFFFFF', (0.35 + 0.4 * reason) * a0, SHAPE.DOT);
        }
        r = 13 * d.k;
        prims.sprite(d.x, d.y, R * d.k * 2.6, '#F2C14E', (0.16 + 0.22 * reason) * a0, SHAPE.GLOW);
        prims.sprite(d.x, d.y, r * 1.1, '#FFE6A0', 0.9 * a0, SHAPE.CORE);
      } else if (n.kind === 'agent') {
        const energy = Math.log2(2 + n.hits) + Math.log2(1 + n.tokens / 400);
        r = (6 + energy * 1.4) * d.k;
        const dim = n.status === 'waiting' ? 0.45 : 1;
        const c2 = n.status === 'error' ? '#FF5A6A' : col;
        prims.sprite(d.x, d.y, r * 3.4, c2, (0.12 + 0.25 * at) * a0 * dim, SHAPE.GLOW);
        prims.sprite(d.x, d.y, r * 1.5, c2, 0.95 * a0 * dim, SHAPE.DOT);
        // the agent's own orbit: particle count = 5th-dimension energy
        const N = Math.min(60, 10 + n.hits * 3) * (q >= 1 ? 1 : 0.4);
        const p0 = cur[id];
        const tilt = ((hash(id) % 100) / 100) * 1.2 - 0.6;
        for (let i = 0; i < N; i++) {
          const th = (i / N) * 6.2832 + fx * (0.4 + 0.9 * at);
          const R = 11 + (i % 3) * 2.5;
          const pp = proj(p0[0] + Math.cos(th) * R, p0[1] + Math.sin(th) * R * tilt, p0[2] + Math.sin(th) * R);
          prims.sprite(pp[0], pp[1], 1.1, mix(c2, '#FFFFFF', 0.4), (0.25 + 0.5 * at) * a0 * dim, SHAPE.DOT);
        }
        if (n.status === 'done') prims.sprite(d.x, d.y, r * 2.4, '#B8FFD0', 0.35 * a0, SHAPE.RING);
      } else if (n.kind === 'tool') {
        r = (4 + Math.log2(1 + n.hits) * 1.2) * d.k;
        const c2 = n.status === 'error' ? '#FF5A6A' : col;
        prims.sprite(d.x, d.y, r * 3, c2, 0.18 * at * a0, SHAPE.GLOW);
        prims.sprite(d.x, d.y, r * 1.9, c2, 0.9 * a0, SHAPE.HEX);
      } else if (n.kind === 'planner') {
        r = 7 * d.k;
        prims.sprite(d.x, d.y, r * 3, col, 0.2 * a0, SHAPE.GLOW);
        prims.sprite(d.x, d.y, r * 1.8, col, 0.95 * a0, SHAPE.DIAMOND);
      } else if (n.kind === 'gateway') {
        r = 7 * d.k;
        prims.sprite(d.x, d.y, r * 2.2, col, (0.6 + 0.4 * at) * a0, SHAPE.RING);
        prims.sprite(d.x, d.y, r * 1.5, col, (0.5 + 0.4 * Math.sin(fx * 2)) * 0.6 * a0, SHAPE.RING);
        prims.sprite(d.x, d.y, r * 3, col, 0.2 * a0, SHAPE.GLOW);
      } else if (n.kind === 'memory') {
        r = 7 * d.k;
        prims.sprite(d.x, d.y, r * 3.2, col, (0.15 + 0.25 * at) * a0, SHAPE.GLOW);
        prims.sprite(d.x, d.y, r * 1.4, col, 0.9 * a0, SHAPE.CORE);
        prims.sprite(d.x, d.y, r * 2.3, col, 0.4 * a0, SHAPE.RING);
      } else if (n.kind === 'result') {
        r = 11 * d.k;
        prims.sprite(d.x, d.y, r * 5, '#FFE6A0', 0.3 * a0, SHAPE.GLOW);
        prims.sprite(d.x, d.y, r * 1.8, n.status === 'error' ? '#FF5A6A' : '#FFF1C2', a0, SHAPE.DIAMOND);
      } else if (n.kind === 'user') {
        r = 7 * d.k;
        prims.sprite(d.x, d.y, r * 2.6, col, 0.15 * a0, SHAPE.GLOW);
        prims.sprite(d.x, d.y, r * 1.4, col, 0.9 * a0, SHAPE.DOT);
      } else if (n.kind === 'test') {
        r = 3.2 * d.k;
        const c2 = n.status === 'error' ? '#FF5A6A' : n.status === 'done' ? '#8CFFB4' : '#E8ECF8';
        prims.sprite(d.x, d.y, r * 2, c2, 0.95 * a0, SHAPE.DIAMOND);
        prims.sprite(d.x, d.y, r * 4, c2, 0.15 * a0, SHAPE.GLOW);
      } else {
        // file / resource leaves
        r = (n.kind === 'file' ? 2.6 + Math.min(2, (n.rev || 0) * 0.6) : 2) * d.k;
        const c2 = n.status === 'deleted' ? '#FF6B6B' : col;
        const pop = 1 + 1.2 * Math.exp(-Math.max(0, t - n.born) / 450);
        prims.sprite(d.x, d.y, r * 1.6 * pop, c2, (n.status === 'deleted' ? 0.4 : 0.9) * a0, SHAPE.DOT);
        if (at > 0.05) prims.sprite(d.x, d.y, r * 5, c2, 0.22 * at * a0, SHAPE.GLOW);
      }
      picks.push({ id, x: d.x, y: d.y, r: Math.max(10, r * 1.8), z: d.z });
      const prio = id === o.sel ? 10 : id === o.hover ? 9 : n.kind === 'hermes' ? 8 : n.kind === 'agent' ? 7 : n.kind === 'result' ? 7 : n.kind === 'planner' || n.kind === 'gateway' || n.kind === 'memory' || n.kind === 'user' ? 5 : n.kind === 'tool' ? (at > 0.2 ? 4 : 0) : n.kind === 'file' && at > 0.45 ? 2 : n.kind === 'test' && at > 0.3 ? 3 : 0;
      if (prio > 0 && sp > 0.5 && c < 0.6) labels.push({ id, x: d.x, y: d.y, r: Math.max(r * 1.6, 6), text: n.label, kind: n.kind, color: col, prio, alpha: d.fog * (prio >= 5 ? 1 : 0.5 + 0.5 * at) });
      if (id === o.sel) prims.sprite(d.x, d.y, Math.max(14, r * 3), '#FFFFFF', 0.7, SHAPE.RING);
    }

    // ---- impulses (photons) and effects from the recent events
    const win = 2600;
    const idx = T.between(t - win, t + 1);
    for (const i of idx) {
      const te = T.rel[i];
      const ev = T.events[i];
      const efx = T.fxAt(i);
      const age = t - te;
      const dur = 650 + Math.min(900, (ev.latencyMs || 0) / 8);
      for (const p of efx.pulses) {
        const A = scr[p.from]; const B = scr[p.to];
        if (!A || !B || !A.fog || !B.fog || !s.nodes[p.from] || !s.nodes[p.to]) continue;
        const u = age / dur;
        if (u >= 0 && u <= 1) {
          const e = ease(u);
          for (let k = 0; k < 7; k++) {
            const uk = Math.max(0, e - k * 0.035);
            const x = A.x + (B.x - A.x) * uk; const y = A.y + (B.y - A.y) * uk;
            if (k === 0) { prims.sprite(x, y, 13 * p.w, p.color, 0.5, SHAPE.GLOW); prims.sprite(x, y, 3.2 * p.w, p.color, 1, SHAPE.CORE); }
            else prims.sprite(x, y, (2.6 - k * 0.3) * p.w, p.color, 0.7 - k * 0.09, SHAPE.DOT);
          }
        } else if (u > 1 && u < 1.6) {
          const v = (u - 1) / 0.6;
          prims.sprite(B.x, B.y, (8 + 26 * v) * p.w, p.color, (1 - v) * 0.6, SHAPE.RING);
        }
      }
      for (const ef of efx.effects) {
        const D = scr[ef.node];
        if (!D || !D.fog) continue;
        if (ef.kind === 'error') {
          for (let k = 0; k < 3; k++) {
            const v = (age - k * 180) / 1500;
            if (v > 0 && v < 1) prims.sprite(D.x, D.y, 10 + 90 * ease(v), '#FF3B4E', (1 - v) * 0.85, SHAPE.RING);
          }
          if (age < 1400) prims.sprite(D.x, D.y, 70, '#FF3B4E', 0.35 * (1 - age / 1400), SHAPE.GLOW);
        } else if (ef.kind === 'success') {
          const v = age / 1300;
          if (v > 0 && v < 1) { prims.sprite(D.x, D.y, 8 + 60 * ease(v), '#C8FFE0', (1 - v) * 0.7, SHAPE.RING); prims.sprite(D.x, D.y, 40, '#B8FFD0', 0.25 * (1 - v), SHAPE.GLOW); }
        } else if (ef.kind === 'spawn') {
          const v = age / 1000;
          if (v > 0 && v < 1) prims.sprite(D.x, D.y, 6 + 40 * ease(v), nodeColor(s.nodes[ef.node]), (1 - v) * 0.7, SHAPE.RING);
        }
      }
    }
    // the success (or failure) wave travels back through the whole graph, level by level
    if (s.task.endedAt != null) {
      const ok = s.task.status === 'done';
      const age = t - s.task.endedAt;
      if (age < 4500) {
        for (const id of s.order) {
          const D = scr[id];
          if (!D.fog) continue;
          const v = (age - depth[id] * 160) / 1100;
          if (v > 0 && v < 1) prims.sprite(D.x, D.y, 6 + 26 * ease(v), ok ? '#D8FFE8' : '#FF4D5E', (1 - v) * 0.65, SHAPE.RING);
        }
        const H0 = scr.hermes;
        if (H0) { const v = age / 3200; if (v < 1) prims.sprite(H0.x, H0.y, 30 + Math.max(W, H) * 0.7 * ease(v), ok ? '#FFF1C2' : '#FF4D5E', (1 - v) * 0.5, SHAPE.RING); }
      }
    }

    // legend counts
    const counts = {};
    for (const id of s.order) { const k = s.nodes[id].kind; counts[k] = (counts[k] || 0) + 1; }
    return { prims, labels, picks, state: s, fit, counts, compression: c };
  }
  return { frame };
}
