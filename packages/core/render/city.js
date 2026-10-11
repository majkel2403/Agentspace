// The city view: the same workspace as the tree, drawn as a city. Every folder is a district, every file a building whose
// footprint is its size (the lines of the content the log gave it), and every agent stands on the building it touched
// last. Buildings rise as the log writes them; files only read show as small lots. The layout is a fixed world box, so
// the whole city is always in view and only the camera moves: wheel or pinch zooms at the pointer, drag pans, a double
// click zooms in, and "fit" returns to the whole city. Canvas 2D; everything is derived from the event log, so it
// scrubs exactly like the tree.
//   const city = createCity(canvas); city.draw(T, idx, t, { colour(id), label(id) }); city.onPick = (path) => {}
import { gFileColour } from '../gource/colour.js';
import { projector, anchorCentre } from '../gource/frame.js';

const WORLD_W = 1000; const WORLD_H = 640;
// a building's share of the district: the square root of its lines, so a big file does not swallow the city
const cityWeight = (f) => (f.read ? 1 : 1 + Math.sqrt(f.w) * 2.5);
const CITY_WRITE = /^file\.(created|modified|deleted)$|^resource\.written$/;
const CITY_READ = /^file\.read$|^resource\.read$/;
const RISE_MS = 700; const RECENT_MS = 1600;
// 3D: buildings stand up to a height from their size; the ground tilts (same pitch and fit as the tree scene)
const CITY_PITCH = 0.95; const CITY_FIT = 0.3;
const cityHeight = (f) => (f.read ? 2 : Math.min(90, 6 + Math.sqrt(f.w) * 5));
// is a point inside a polygon (even-odd rule)
const cityIn = (q, x, y) => { let s = false; for (let i = 0, j = q.length - 1; i < q.length; j = i++) { const [xi, yi] = q[i]; const [xj, yj] = q[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) s = !s; } return s; };
const cityClamp = (x, a, b) => Math.max(a, Math.min(b, x));
const cityEase = (x) => 1 - Math.pow(1 - cityClamp(x, 0, 1), 3);
const cityRgb = (c, a) => 'rgba(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ',' + cityClamp(a, 0, 1).toFixed(3) + ')';
const CITY_MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";
const CITY_SANS = "'Inter', 'Segoe UI', system-ui, sans-serif";

// what the log says about each file up to event idx: size (lines), when it appeared and last changed, and who touched it
function cityFiles(T, idx) {
  const files = new Map(); const agents = new Map();
  for (let i = 0; i <= idx && i < T.events.length; i++) {
    const e = T.events[i]; const t = T.rel[i];
    const path = e.resource ? String(e.resource) : '';
    if (CITY_WRITE.test(e.type) && path) {
      const lines = e.content != null ? String(e.content).split('\n').length : e.patch != null ? String(e.patch).split('\n').filter((l) => l[0] === '+' || l[0] === '-').length : 4;
      const f = files.get(path) || { path, w: 0, born: t, last: t, read: false, who: e.agent || 'hermes', kind: e.type, changes: 0 };
      f.w = Math.max(f.w, lines, 1); f.last = t; f.kind = e.type; f.changes++; f.read = false;
      files.set(path, f);
    } else if (CITY_READ.test(e.type) && path) {
      const f = files.get(path);
      if (f) f.last = Math.max(f.last, t); else files.set(path, { path, w: 1, born: t, last: t, read: true, who: e.agent || 'hermes', kind: e.type, changes: 0 });
    }
    if (e.agent && path) agents.set(e.agent, { file: path, t });
  }
  return { files, agents };
}

// folder tree from the paths: every folder knows its total size, so it gets room in proportion
function cityTree(files) {
  const root = { name: '', path: '', kids: new Map(), files: [], w: 0 };
  for (const f of files.values()) {
    const parts = f.path.split('/');
    let node = root; node.w += cityWeight(f);
    for (let k = 0; k < parts.length - 1; k++) {
      const seg = parts[k];
      if (!node.kids.has(seg)) node.kids.set(seg, { name: seg, path: parts.slice(0, k + 1).join('/') + '/', kids: new Map(), files: [], w: 0 });
      node = node.kids.get(seg); node.w += cityWeight(f);
    }
    node.files.push(f);
  }
  return root;
}

// squarified treemap (Bruls, Huizing, van Wijk): rectangles with areas in proportion to the values, as square as possible
function cityTreemap(items, x, y, w, h) {
  const total = items.reduce((n, o) => n + o.v, 0);
  if (!total || w <= 0 || h <= 0) return [];
  const k = (w * h) / total;
  const list = items.map((o) => ({ o, a: Math.max(1e-6, o.v * k) }));
  const worst = (row, side) => {
    const s = row.reduce((n, r) => n + r.a, 0); const mx = Math.max(...row.map((r) => r.a)); const mn = Math.min(...row.map((r) => r.a));
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
  };
  const out = []; let rx = x; let ry = y; let rw = w; let rh = h; let i = 0;
  while (i < list.length) {
    const side = Math.min(rw, rh);
    const row = [list[i]]; let j = i + 1;
    while (j < list.length && worst(row.concat(list[j]), side) <= worst(row, side)) { row.push(list[j]); j++; }
    const area = row.reduce((n, r) => n + r.a, 0);
    if (rw >= rh) {
      const cw = area / rh; let yy = ry;
      for (const r of row) { const hh = r.a / cw; out.push({ o: r.o, x: rx, y: yy, w: cw, h: hh }); yy += hh; }
      rx += cw; rw -= cw;
    } else {
      const rhh = area / rw; let xx = rx;
      for (const r of row) { const ww = r.a / rhh; out.push({ o: r.o, x: xx, y: ry, w: ww, h: rhh }); xx += ww; }
      ry += rhh; rh -= rhh;
    }
    i = j;
  }
  return out;
}

// lay the tree out in the world box: returns district rectangles and building rectangles
function cityLayout(root) {
  const dirs = []; const blocks = [];
  const place = (node, x, y, w, h, depth) => {
    const items = [];
    for (const k of node.kids.values()) items.push({ v: k.w, kind: 'dir', node: k });
    for (const f of node.files) items.push({ v: cityWeight(f), kind: 'file', file: f });
    items.sort((a, b) => b.v - a.v);
    const pad = depth === 0 ? 0 : Math.max(3, 9 - depth * 2);
    for (const r of cityTreemap(items, x, y, w, h)) {
      const rect = { x: r.x, y: r.y, w: r.w, h: r.h };
      if (r.o.kind === 'dir') {
        const inner = { x: rect.x + pad, y: rect.y + pad + 12, w: rect.w - 2 * pad, h: rect.h - 2 * pad - 12 };
        dirs.push({ ...rect, name: r.o.node.name, path: r.o.node.path, depth });
        if (inner.w > 4 && inner.h > 4) place(r.o.node, inner.x, inner.y, inner.w, inner.h, depth + 1);
      } else blocks.push({ ...rect, file: r.o.file });
    }
  };
  place(root, 0, 0, WORLD_W, WORLD_H, 0);
  return { dirs, blocks };
}

export function createCity(canvas) {
  const ctx = canvas.getContext('2d');
  const cam = { cx: WORLD_W / 2, cy: WORLD_H / 2, K: 1, free: false, tx: 0, ty: 0, tk: 0, blend: null };
  // the 3D state, eased like the camera: k3 (amount of 3D), pitch (tilt), yaw (turn); the city starts in 3D
  const t3 = { k3: 1, k3T: 1, pitch: CITY_PITCH, pitchT: CITY_PITCH, yaw: 0, yawT: 0 };
  const fitNow = () => 1 - CITY_FIT * t3.k3;
  let lastNow = performance.now();
  const pointers = new Map();
  let drag = null; let pinch = null; let model = null; let lay = null; let layKey = ''; let W = 0; let H = 0; let dpr = 1;
  // the screen area the city fills: the stage minus the panels around it (insets), so nothing starts under a panel
  let ins = { l: 0, r: 0, t: 0, b: 0 };
  const area = () => ({ ox: ins.l + (W - ins.l - ins.r) / 2, oy: ins.t + (H - ins.t - ins.b) / 2, wf: Math.max(40, W - ins.l - ins.r), hf: Math.max(40, H - ins.t - ins.b) });
  let lastIdx = -2; let agentPos = new Map(); let lastDraw = 0;
  let hits = []; // the drawn top faces, far to near, for picking
  const api = { onPick: null, hover: null, free: false };

  const autoK = () => { const a = area(); return Math.min(a.wf / (WORLD_W + 40), a.hf / (WORLD_H + 40)); };
  // the auto view is the whole city; after the reader zooms or pans, the view eases back into it (fit) instead of snapping
  const view = () => {
    const fit = fitNow();
    if (!cam.free) {
      let cx = WORLD_W / 2; let cy = WORLD_H / 2; let K = autoK();
      if (cam.blend) {
        const x = Math.min(1, (performance.now() - cam.blend.t0) / 700); const f = 1 - Math.pow(1 - x, 3);
        if (x >= 1) cam.blend = null;
        else { cx = cam.blend.cx + (cx - cam.blend.cx) * f; cy = cam.blend.cy + (cy - cam.blend.cy) * f; K = Math.exp(Math.log(cam.blend.K) + (Math.log(K) - Math.log(cam.blend.K)) * f); }
      }
      return { cx, cy, K: K * fit };
    }
    return { cx: cam.cx, cy: cam.cy, K: cam.K * fit };
  };
  // the projection of the current view: the same maths as the tree scene
  const proj = () => { const v = view(); const A = area(); return projector(v.cx, v.cy, v.K, A.ox, A.oy, A.hf, t3.k3, t3.pitch, t3.yaw); };
  const toWorld = (px, py) => proj().unproj(px, py);
  // the free camera keeps the flat scale (K without the 3D fit), so turning 3D on or off never double-counts it
  const ensureFree = () => { if (!cam.free) { const v = view(); cam.cx = v.cx; cam.cy = v.cy; cam.K = v.K / fitNow(); cam.tx = cam.cx; cam.ty = cam.cy; cam.tk = cam.K; cam.blend = null; cam.free = true; api.free = true; } };
  // zoom is eased: the target moves now and the view follows it in draw(), anchored on the same world point
  const zoomAt = (factor, px, py) => {
    ensureFree();
    const a = autoK();
    const K = cityClamp(cam.tk * factor, a * 0.2, a * 80);
    const A = area();
    const c = anchorCentre(toWorld(px, py), px, py, K, A.ox, A.oy, A.hf, t3.k3, t3.pitch, t3.yaw, fitNow());
    cam.tk = K; cam.tx = c.x; cam.ty = c.y;
  };
  // back to the whole city: the current view becomes the start of an eased blend, and the map turns back to north
  const fit = () => {
    if (cam.free) cam.blend = { cx: cam.cx, cy: cam.cy, K: cam.K, t0: performance.now() };
    cam.free = false; api.free = false; t3.yawT = 0;
  };

  // the building under the pointer: the nearest drawn top face that holds it
  const hitBlock = (px, py) => {
    for (let i = hits.length - 1; i >= 0; i--) if (cityIn(hits[i].q, px, py)) return hits[i].b;
    return null;
  };
  const local = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.button !== 2 && e.pointerType === 'mouse') return;
    try { canvas.setPointerCapture(e.pointerId); } catch (x) { /* optional */ }
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      ensureFree();
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
      drag = null;
    } else drag = { x: p.x, y: p.y, moved: 0, start: p, orbit: e.button === 2 || e.shiftKey };
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = local(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
    if (pointers.size >= 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      zoomAt(d / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch.d = d;
      return;
    }
    if (drag && pointers.has(e.pointerId)) {
      const dx = p.x - drag.x; const dy = p.y - drag.y;
      drag.x = p.x; drag.y = p.y; drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.orbit && drag.moved > 4) {
        // orbit: horizontal turns the map, vertical tilts it (the 3D view comes on with the first turn)
        t3.k3T = 1; t3.k3 = 1; t3.yawT = t3.yaw = t3.yaw + dx * 0.006;
        t3.pitchT = t3.pitch = Math.max(0.1, Math.min(1.45, t3.pitch - dy * 0.005));
      } else if (drag.moved > 4) {
        // pan along the turned axes, foreshortened by the tilt, so the ground keeps up with the pointer
        ensureFree();
        const K = cam.K * fitNow(); const cP = Math.cos(t3.pitch * t3.k3); const cY = Math.cos(t3.yaw); const sY = Math.sin(t3.yaw);
        cam.cx -= dx / K * cY + dy / (K * cP) * sY; cam.cy -= -dx / K * sY + dy / (K * cP) * cY;
        cam.tx = cam.cx; cam.ty = cam.cy; cam.tk = cam.K;
      }
    }
    const b = hitBlock(p.x, p.y);
    api.hover = b ? b.file.path : null;
    canvas.style.cursor = b ? 'pointer' : drag ? 'grabbing' : 'grab';
  });
  const up = (e) => {
    const was = drag;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) drag = null;
    if (was && was.moved < 6 && e.type === 'pointerup' && pointers.size === 0) {
      const b = hitBlock(was.start.x, was.start.y);
      if (b && api.onPick) api.onPick(b.file.path);
    }
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', () => { api.hover = null; });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); const p = local(e); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y); }, { passive: false });
  canvas.addEventListener('dblclick', (e) => { const p = local(e); zoomAt(2.2, p.x, p.y); });

  api.zoom = (k) => { const a = area(); zoomAt(k, a.ox, a.oy); };
  api.setInsets = (o) => { ins = { l: o.l || 0, r: o.r || 0, t: o.t || 0, b: o.b || 0 }; };
  api.fit = fit;
  // the tilt on or off, eased like the camera (the same switch as the tree scene)
  api.setTilt = (on) => { t3.k3T = on ? 1 : 0; t3.pitchT = on ? CITY_PITCH : 0; if (!on) t3.yawT = 0; };
  api.tilt = () => t3.k3T > 0.5;

  // one frame: layout (only when the set of files changed), the ground, buildings as boxes that rise, agents, names
  api.draw = (T, idx, t, who) => {
    if (!T || !canvas.clientWidth) return;
    const cw = canvas.clientWidth; const ch = canvas.clientHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) { canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr); }
    W = cw; H = ch;
    if (idx !== lastIdx) { model = cityFiles(T, idx); lastIdx = idx; }
    let total = 0; for (const f of model.files.values()) total += f.w;
    const key = model.files.size + ':' + total;
    if (!lay || key !== layKey) { lay = cityLayout(cityTree(model.files)); layKey = key; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#03060f'; ctx.fillRect(0, 0, W, H);
    // ease a free camera toward its zoom target, and the 3D state toward its targets (frame-rate independent)
    const now = performance.now(); const dt = Math.min(0.1, (now - lastNow) / 1000); lastNow = now;
    if (cam.free && cam.tk) {
      const k = 1 - Math.exp(-dt * 12);
      cam.cx += (cam.tx - cam.cx) * k; cam.cy += (cam.ty - cam.cy) * k;
      cam.K = Math.exp(Math.log(cam.K) + (Math.log(cam.tk) - Math.log(cam.K)) * k);
    }
    const a3 = 1 - Math.exp(-dt * 6);
    t3.k3 += (t3.k3T - t3.k3) * a3; t3.pitch += (t3.pitchT - t3.pitch) * a3; t3.yaw += (t3.yawT - t3.yaw) * a3;
    const v = view(); const A = area();
    const P = projector(v.cx, v.cy, v.K, A.ox, A.oy, A.hf, t3.k3, t3.pitch, t3.yaw);
    const pt = P.pt;
    // the eye's direction in world terms (x, y, up): faces turned away from it are not drawn
    const sP = Math.sin(t3.pitch * t3.k3); const cP = Math.cos(t3.pitch * t3.k3);
    const eye = [sP * Math.sin(t3.yaw), sP * Math.cos(t3.yaw), cP];
    const onScreen = (q) => { let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity; for (const p of q) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); } return x1 >= 0 && y1 >= 0 && x0 <= W && y0 <= H; };
    const poly = (q, fill) => { ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); for (let i = 1; i < q.length; i++) ctx.lineTo(q[i][0], q[i][1]); ctx.closePath(); if (fill) ctx.fill(); };
    // a soft grid on the ground, so the city has a scale when zoomed in (and the tilt reads as depth)
    ctx.strokeStyle = 'rgba(255,46,110,0.06)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = -400; x <= WORLD_W + 400; x += 40) { const a = pt(x, -400, 0); const b = pt(x, WORLD_H + 400, 0); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    for (let y = -400; y <= WORLD_H + 400; y += 40) { const a = pt(-400, y, 0); const b = pt(WORLD_W + 400, y, 0); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.stroke();
    // districts: flat areas on the ground, their name on the top-left corner
    ctx.font = '600 ' + cityClamp(11 * Math.sqrt(v.K), 9, 13) + 'px ' + CITY_MONO;
    for (const d of lay.dirs) {
      const q = [pt(d.x, d.y, 0), pt(d.x + d.w, d.y, 0), pt(d.x + d.w, d.y + d.h, 0), pt(d.x, d.y + d.h, 0)];
      if (!onScreen(q)) continue;
      ctx.fillStyle = 'rgba(14,22,48,' + (0.35 + d.depth * 0.08).toFixed(2) + ')'; poly(q, true);
      ctx.strokeStyle = 'rgba(132,152,255,' + (0.18 + d.depth * 0.04).toFixed(2) + ')'; ctx.lineWidth = 1; poly(q, false);
      if (q[1][0] - q[0][0] > 70) { ctx.fillStyle = 'rgba(197,206,232,0.75)'; ctx.fillText(d.name + '/', q[0][0] + 6, q[0][1] + 15); }
    }
    // buildings: a footprint, a height from its size; a finished one stands, a new one rises out of the ground
    const items = [];
    for (const b of lay.blocks) {
      const f = b.file;
      if (f.born > t) continue;
      const grow = cityEase((t - f.born) / RISE_MS);
      const pad = 1.5; const bx = b.x + pad; const by = b.y + pad; const bw = b.w - 2 * pad; const bh = b.h - 2 * pad;
      const cxw = bx + bw / 2; const cyw = by + bh / 2;
      const gw = bw * (0.25 + 0.75 * grow); const gh = bh * (0.25 + 0.75 * grow);
      const x0 = cxw - gw / 2; const y0 = cyw - gh / 2; const x1 = x0 + gw; const y1 = y0 + gh;
      const hgt = cityHeight(f) * grow;
      const base = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
      const bq = base.map(([x, y]) => pt(x, y, 0)); const tq = base.map(([x, y]) => pt(x, y, hgt));
      if (!onScreen(tq.concat(bq))) continue;
      items.push({ b, f, grow, hgt, base, bq, tq, zv: tq[0][3] + tq[2][3], hue: f.read ? [0.4, 0.45, 0.55] : gFileColour(f.path) });
    }
    // far to near, so the nearer buildings cover the farther ones
    items.sort((p, q) => p.zv - q.zv);
    // shadows first: each footprint thrown onto the ground away from the light
    for (const it of items) {
      if (it.hgt < 1 || it.f.read) continue;
      const dx = it.hgt * 0.22; const dy = it.hgt * 0.3;
      ctx.fillStyle = 'rgba(0,0,0,' + (0.42 * it.grow).toFixed(3) + ')';
      poly(it.base.map(([x, y]) => pt(x + dx, y + dy, 0)), true);
    }
    hits = [];
    const topOf = new Map();
    ctx.font = '500 ' + cityClamp(10 * Math.sqrt(v.K), 8, 12) + 'px ' + CITY_MONO;
    for (const it of items) {
      const { b, f, hue, tq, bq, grow } = it;
      const recent = t - f.last < RECENT_MS; const hover = api.hover === f.path;
      // the sides turned to the eye, shaded by the light from the upper left; flat (no height) draws none
      const sides = [[0, -1, 0.74], [1, 0, 0.52], [0, 1, 0.5], [-1, 0, 0.7]];
      for (let i = 0; i < 4; i++) {
        const [nx, ny, shade] = sides[i];
        // a flat building has no sides; a side is seen when its normal points at the eye
        if (it.hgt < 1 || nx * eye[0] + ny * eye[1] <= 1e-6) continue;
        const j = (i + 1) % 4;
        const q = [bq[i], bq[j], tq[j], tq[i]];
        ctx.fillStyle = cityRgb([hue[0] * shade, hue[1] * shade, hue[2] * shade], f.read ? 0.2 : 0.5 * grow + 0.2);
        poly(q, true);
        ctx.strokeStyle = 'rgba(10,14,30,0.6)'; ctx.lineWidth = 1; poly(q, false);
      }
      // the top face: the building's colour, lit at its edge
      ctx.fillStyle = cityRgb(hue, f.read ? 0.26 : 0.6 * grow + 0.16);
      poly(tq, true);
      ctx.fillStyle = cityRgb(hue, f.read ? 0.4 : 0.85);
      poly([tq[0], tq[1], [(tq[1][0] + tq[2][0]) / 2, (tq[1][1] + tq[2][1]) / 2], [(tq[0][0] + tq[3][0]) / 2, (tq[0][1] + tq[3][1]) / 2]], true);
      ctx.strokeStyle = hover ? 'rgba(255,255,255,0.95)' : recent ? cityRgb(hue, 1) : 'rgba(10,14,30,0.9)';
      ctx.lineWidth = hover || recent ? 1.5 : 1; poly(tq, false);
      if (recent) { ctx.strokeStyle = cityRgb(hue, 0.5 * (1 - (t - f.last) / RECENT_MS)); ctx.lineWidth = 3; poly(tq, false); }
      const tx0 = tq[0][0]; const tx1 = tq[1][0]; const ty0 = tq[0][1];
      if (tx1 - tx0 > 56 && (tq[2][1] - ty0) > 16) { ctx.fillStyle = 'rgba(234,246,255,0.85)'; ctx.fillText(f.path.split('/').pop(), tx0 + 5, ty0 + 14); }
      hits.push({ q: tq, b });
      topOf.set(f.path, { x: (tq[0][0] + tq[2][0]) / 2, y: (tq[0][1] + tq[2][1]) / 2, z: it.hgt, sc: tq[0][2] });
    }
    // agents: glide to the building they touched last and hover above it, a ring while they work
    const seen = new Set();
    for (const [id, a] of model.agents) {
      const f = model.files.get(a.file);
      if (!f) continue;
      const blk = lay.blocks.find((bb) => bb.file.path === a.file);
      if (!blk) continue;
      seen.add(id);
      const tx = blk.x + blk.w / 2; const ty = blk.y + blk.h / 2;
      const top = topOf.get(a.file);
      const tz = top ? top.z + 14 : 0;
      const p = agentPos.get(id) || { x: tx, y: ty, z: tz };
      p.x += (tx - p.x) * 0.18; p.y += (ty - p.y) * 0.18; p.z = (p.z == null ? tz : p.z) + (tz - (p.z == null ? tz : p.z)) * 0.18;
      agentPos.set(id, p);
      const col = who ? who.colour(id) : [0.9, 0.9, 1];
      const q = pt(p.x, p.y, p.z); const sc = q[2];
      const px = q[0]; const py = q[1]; const working = t - a.t < RECENT_MS;
      const g = pt(p.x, p.y, 0);
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(g[0], g[1], 6 * sc, 3 * sc, 0, 0, Math.PI * 2); ctx.fill();
      if (working) { ctx.strokeStyle = cityRgb(col, 0.8); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, (9 + 5 * Math.sin(t / 180)) * sc, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = cityRgb(col, 1); ctx.beginPath(); ctx.arc(px, py, 6 * sc, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(3,6,15,0.9)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.font = '600 12px ' + CITY_SANS; ctx.fillStyle = 'rgba(234,246,255,0.95)';
      ctx.fillText(who ? who.label(id) : id, px + 10, py + 4);
    }
    for (const id of [...agentPos.keys()]) if (!seen.has(id)) agentPos.delete(id);
    lastDraw = t;
  };
  api.free = false;
  return api;
}

// what the inspector shows for a building: its size, who wrote it and what happened to it up to time t (ms)
export function cityFileInfo(T, path, t) {
  const idx = T.indexAt(t);
  const f = cityFiles(T, idx).files.get(path);
  const events = [];
  for (let i = idx; i >= 0 && events.length < 12; i--) {
    const e = T.events[i];
    if (String(e.resource || '') !== path) continue;
    events.push({ rel: T.rel[i], type: e.type, who: e.agent || '', text: e.text || '' });
  }
  return {
    kind: 'file', label: path.split('/').pop(), sub: path, status: f ? (f.read ? 'tylko odczyt' : f.kind === 'file.deleted' ? 'usunięty' : f.changes > 1 ? 'zmieniany ' + f.changes + '×' : 'utworzony') : 'nie istnieje jeszcze',
    stats: [['rozmiar', f ? f.w + ' linii' : '—'], ['kto', f ? f.who : '—']], events,
  };
}
