// The city view: the same workspace as the tree, drawn as a city. Every folder is a district, every file a building whose
// footprint is its size (the lines of the content the log gave it), and every agent stands on the building it touched
// last. Buildings rise as the log writes them; files only read show as small lots. The layout is a fixed world box, so
// the whole city is always in view and only the camera moves: wheel or pinch zooms at the pointer, drag pans, a double
// click zooms in, and "fit" returns to the whole city. Canvas 2D; everything is derived from the event log, so it
// scrubs exactly like the tree.
//   const city = createCity(canvas); city.draw(T, idx, t, { colour(id), label(id) }); city.onPick = (path) => {}
import { gFileColour } from '../gource/colour.js';

const WORLD_W = 1000; const WORLD_H = 640;
// a building's share of the district: the square root of its lines, so a big file does not swallow the city
const cityWeight = (f) => (f.read ? 1 : 1 + Math.sqrt(f.w) * 2.5);
const CITY_WRITE = /^file\.(created|modified|deleted)$|^resource\.written$/;
const CITY_READ = /^file\.read$|^resource\.read$/;
const RISE_MS = 700; const RECENT_MS = 1600;
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
  const cam = { cx: WORLD_W / 2, cy: WORLD_H / 2, K: 1, free: false };
  const pointers = new Map();
  let drag = null; let pinch = null; let model = null; let lay = null; let layKey = ''; let W = 0; let H = 0; let dpr = 1;
  // the screen area the city fills: the stage minus the panels around it (insets), so nothing starts under a panel
  let ins = { l: 0, r: 0, t: 0, b: 0 };
  const area = () => ({ ox: ins.l + (W - ins.l - ins.r) / 2, oy: ins.t + (H - ins.t - ins.b) / 2, wf: Math.max(40, W - ins.l - ins.r), hf: Math.max(40, H - ins.t - ins.b) });
  let lastIdx = -2; let agentPos = new Map(); let lastDraw = 0;
  const api = { onPick: null, hover: null, free: false };

  const autoK = () => { const a = area(); return Math.min(a.wf / (WORLD_W + 40), a.hf / (WORLD_H + 40)); };
  const view = () => {
    if (!cam.free) { const K = autoK(); return { cx: WORLD_W / 2, cy: WORLD_H / 2, K }; }
    return cam;
  };
  const toWorld = (px, py) => { const v = view(); const a = area(); return { x: v.cx + (px - a.ox) / v.K, y: v.cy + (py - a.oy) / v.K }; };
  const ensureFree = () => { if (!cam.free) { const v = view(); cam.cx = v.cx; cam.cy = v.cy; cam.K = v.K; cam.free = true; api.free = true; } };
  const zoomAt = (factor, px, py) => {
    ensureFree();
    const a = autoK();
    const before = toWorld(px, py);
    cam.K = cityClamp(cam.K * factor, a * 0.2, a * 80);
    const A = area(); cam.cx = before.x - (px - A.ox) / cam.K; cam.cy = before.y - (py - A.oy) / cam.K;
  };
  const fit = () => { cam.free = false; api.free = false; };

  const hitBlock = (px, py) => {
    if (!lay) return null;
    const w = toWorld(px, py);
    for (let i = lay.blocks.length - 1; i >= 0; i--) {
      const b = lay.blocks[i];
      if (w.x >= b.x && w.x <= b.x + b.w && w.y >= b.y && w.y <= b.y + b.h) return b;
    }
    return null;
  };
  const local = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    try { canvas.setPointerCapture(e.pointerId); } catch (x) { /* optional */ }
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      ensureFree();
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
      drag = null;
    } else drag = { x: p.x, y: p.y, moved: 0, start: p };
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
      if (drag.moved > 4) { ensureFree(); cam.cx -= dx / cam.K; cam.cy -= dy / cam.K; }
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

  // one frame: layout (only when the set of files changed), buildings with their rise, agents, names
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
    const v = view(); const K = v.K; const A = area();
    const sx = (x) => A.ox + (x - v.cx) * K; const sy = (y) => A.oy + (y - v.cy) * K;
    // a soft grid on the ground, so the city has a scale when zoomed in
    ctx.strokeStyle = 'rgba(51,214,255,0.05)'; ctx.lineWidth = 1;
    const step = 40 * K;
    if (step > 6) {
      const ox = (sx(0) % step + step) % step; const oy = (sy(0) % step + step) % step;
      ctx.beginPath();
      for (let x = ox; x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (let y = oy; y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
    }
    // districts
    ctx.font = '600 ' + cityClamp(11 * Math.sqrt(K), 9, 13) + 'px ' + CITY_MONO;
    for (const d of lay.dirs) {
      const x = sx(d.x); const y = sy(d.y); const w = d.w * K; const h = d.h * K;
      if (w < 2 || h < 2 || x > W || y > H || x + w < 0 || y + h < 0) continue;
      ctx.fillStyle = 'rgba(14,22,48,' + (0.35 + d.depth * 0.08).toFixed(2) + ')';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(132,152,255,' + (0.18 + d.depth * 0.04).toFixed(2) + ')'; ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      if (w > 70) { ctx.fillStyle = 'rgba(197,206,232,0.75)'; ctx.fillText(d.name + '/', x + 6, y + 15); }
    }
    // buildings: footprint = file rectangle, height from its size; a finished one stands, a new one rises
    ctx.font = '500 ' + cityClamp(10 * Math.sqrt(K), 8, 12) + 'px ' + CITY_MONO;
    for (const b of lay.blocks) {
      const f = b.file;
      if (f.born > t) continue;
      const grow = cityEase((t - f.born) / RISE_MS);
      const hue = f.read ? [0.4, 0.45, 0.55] : gFileColour(f.path);
      const pad = 1.5; const bx = b.x + pad; const by = b.y + pad; const bw = b.w - 2 * pad; const bh = b.h - 2 * pad;
      const cxw = bx + bw / 2; const cyw = by + bh / 2;
      const gw = bw * (0.25 + 0.75 * grow); const gh = bh * (0.25 + 0.75 * grow);
      const x = sx(cxw - gw / 2); const y = sy(cyw - gh / 2); const w = gw * K; const h = gh * K;
      if (x > W || y > H || x + w < 0 || y + h < 0) continue;
      const recent = t - f.last < RECENT_MS; const hover = api.hover === f.path;
      if (!f.read) { const off = Math.min(9, 2 + Math.sqrt(f.w) * 0.9) * grow * Math.min(1, K * 2); ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.fillRect(x + off, y + off, w, h); }
      ctx.fillStyle = cityRgb(hue, f.read ? 0.22 : 0.55 * grow + 0.12);
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = cityRgb(hue, f.read ? 0.4 : 0.85);
      ctx.fillRect(x, y, w, Math.min(3, h));
      ctx.strokeStyle = hover ? 'rgba(255,255,255,0.95)' : recent ? cityRgb(hue, 1) : 'rgba(10,14,30,0.9)';
      ctx.lineWidth = hover || recent ? 1.5 : 1;
      ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));
      if (recent) { ctx.strokeStyle = cityRgb(hue, 0.5 * (1 - (t - f.last) / RECENT_MS)); ctx.lineWidth = 3; ctx.strokeRect(x - 2, y - 2, w + 4, h + 4); }
      if (w > 56 && h > 16) { ctx.fillStyle = 'rgba(234,246,255,0.85)'; ctx.fillText(f.path.split('/').pop(), x + 5, y + 14); }
    }
    // agents: glide to the building they touched last, a ring while they work
    const seen = new Set();
    for (const [id, a] of model.agents) {
      const f = model.files.get(a.file);
      if (!f) continue;
      const blk = lay.blocks.find((bb) => bb.file.path === a.file);
      if (!blk) continue;
      seen.add(id);
      const tx = blk.x + blk.w / 2; const ty = blk.y + blk.h / 2;
      const p = agentPos.get(id) || { x: tx, y: ty };
      p.x += (tx - p.x) * 0.18; p.y += (ty - p.y) * 0.18;
      agentPos.set(id, p);
      const col = who ? who.colour(id) : [0.9, 0.9, 1];
      const px = sx(p.x); const py = sy(p.y); const working = t - a.t < RECENT_MS;
      if (working) { ctx.strokeStyle = cityRgb(col, 0.8); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, 9 + 5 * Math.sin(t / 180), 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = cityRgb(col, 1); ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();
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
