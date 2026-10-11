// Viewer: canvases, clock, input and the animation loop around the Gource-style player.
// Works in a plain page and inside the Design artifact (no modules there: the build inlines these files).
//   const v = createViewer({ gl: canvas, overlay: canvas2 })
//   v.setTimeline(T); v.setTime(ms); v.play(); v.setSpeed(4); v.setLive(true); v.onSelect = (id, info) => {}
import { createPlayer } from '../gource/player.js';
import { buildFrame, blendEase, anchorCentre } from '../gource/frame.js';
import { createGL } from '../gource/gl.js';
import { createC2D } from '../gource/c2d.js';
import { drawText, formatDate } from '../gource/text.js';
import { inspect } from '../gource/inspect.js';
import { storyAt } from '../gource/story.js';
import { drawStory } from '../gource/cards.js';

const BG0 = [0.1, 0.1, 0.1];
// the floor under the tree in 3D: a faint grid projected with the scene's own camera, so the tilt reads as depth
function drawFloor(ctx, F, W, H, dpr) {
  const V = F.V;
  if (V.k3 < 0.02) return;
  const c = [V.unproj(0, 0), V.unproj(W, 0), V.unproj(0, H), V.unproj(W, H)];
  const x0 = Math.min(...c.map((p) => p.x)); const x1 = Math.max(...c.map((p) => p.x));
  const y0 = Math.min(...c.map((p) => p.y)); const y1 = Math.max(...c.map((p) => p.y));
  // the spacing doubles until a few hundred lines at most cover the view, and is about 90 px on screen
  let G = 40;
  while (G * V.K < 90) G *= 2;
  while ((x1 - x0) / G > 40 || (y1 - y0) / G > 40) G *= 2;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(200,170,255,' + (0.09 * V.k3).toFixed(3) + ')';
  ctx.beginPath();
  for (let x = Math.floor(x0 / G) * G; x <= x1 + G; x += G) {
    const a = V.pt(x, y0 - G, 0); const b = V.pt(x, y1 + G, 0);
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
  }
  for (let y = Math.floor(y0 / G) * G; y <= y1 + G; y += G) {
    const a = V.pt(x0 - G, y, 0); const b = V.pt(x1 + G, y, 0);
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
  }
  ctx.stroke();
}
export const TAIL_MS = 6000;
// The canvas shows the world only: the tree, the agents, and what happens between them (creation threads, messages,
// bubbles). Panels are the app's (HTML) — the canvas sits in its own layout cell and is never covered by them;
// insets are only for small overlays the app keeps inside the scene (legend, ticker).
// opts.hud: false hides the Gource text overlay (extension key, date, caption) when the app shows its own.
export function createViewer(opts) {
  const glc = opts.gl;
  const ovc = opts.overlay;
  const backend = (opts.forceCanvas2D ? null : createGL(glc)) || createC2D(glc);
  const octx = ovc.getContext('2d');
  const inset = () => ({ l: opts.insetLeft || 0, r: opts.insetRight || 0, t: opts.insetTop || 0, b: opts.insetBottom || 0 });
  const studioOn = () => !opts.compat && opts.studio !== false;
  // aspect ratio of the free area the camera frames
  const aspectOf = (W, H) => { const i = inset(); return Math.max(0.2, Math.max(40, W - i.l - i.r) / Math.max(40, H - i.t - i.b)); };
  const aspectNow = () => aspectOf(glc.clientWidth || 16, glc.clientHeight || 9);
  const v = {
    backend: backend ? backend.kind : 'none', T: null, t: 0, playing: false, speed: 1, live: false, sel: null, hover: null,
    onSelect: null, onTick: null, onHover: null, compat: !!opts.compat, ft: 0, hl: null, story: null,
    // with the studio on, the camera follows the agents' work; focus: false keeps the whole tree in view
    player: createPlayer({ aspect: aspectNow(), autoRotate: opts.autoRotate, focus: opts.focus != null ? !!opts.focus : studioOn() }),
  };
  // the camera: follows the work until the reader moves or zooms (then `free` holds centre and scale, and only the
  // "follow" switch or "fit" gives the work back); fill and node scale make the structures read at a glance
  // 3D: k3 is the amount of 3D (eased 0..1), pitch the tilt and yaw the turn of the map; the T fields are the targets
  // that render() eases toward. Flat (k3 0) is the Gource view; the default for the swarm scene is full 3D.
  const PITCH_3D = 0.95;
  const on3 = opts.threeD ? 1 : 0;
  const cam = { zoom: 1, panX: 0, panY: 0, free: null, fill: opts.fill != null ? opts.fill : 1.25, node: opts.nodeScale != null ? opts.nodeScale : 1.5,
    k3: on3, k3T: on3, pitch: on3 * PITCH_3D, pitchT: on3 * PITCH_3D, yaw: 0, yawT: 0 };
  // the free camera keeps the flat scale (K without the 3D fit), so turning 3D on or off never double-counts it
  const rawK = () => F.V.K / F.V.fit;
  const freeze = () => { if (!cam.free && F) cam.free = { cx: F.V.cx, cy: F.V.cy, K: rawK(), tx: F.V.cx, ty: F.V.cy, tk: rawK() }; };
  // hand the camera back to the work: the current view becomes the start of an eased blend
  const release = () => { if (F && cam.free) cam.blend = { cx: cam.free.cx, cy: cam.free.cy, K: cam.free.K, t0: performance.now() }; cam.free = null; };
  const zoomAt = (factor, px, py) => {
    if (!F) return;
    freeze();
    // zoom is eased: the target moves now, the view follows it in render(), anchored on the same point
    const K0 = cam.free.tk; const K1 = Math.max(rawK() * 0.05, Math.min(rawK() * 400, K0 * factor));
    // the ground point under the pointer stays under the pointer (also when tilted)
    const V = F.V;
    const c = anchorCentre(V.unproj(px, py), px, py, K1, V.ox, V.oy, V.span, V.k3, V.pitch, V.yaw, V.fit);
    cam.free.tk = K1; cam.free.tx = c.x; cam.free.ty = c.y;
  };
  // the tilt on or off, eased; turning it off also turns the map back to north
  v.setTilt = (on) => {
    cam.k3T = on ? 1 : 0; cam.pitchT = on ? PITCH_3D : 0;
    if (!on) cam.yawT = 0;
  };
  v.tilt = () => cam.k3T > 0.5;
  v.setBubbles = (on) => { opts.bubbles = !!on; };
  v.following = () => !cam.free;
  v.cam = cam;
  let last = null;
  let dtS = 0;
  let raf = 0;
  let F = null;
  let caption = '';
  let captionColor = [1, 1, 1];
  let resizeAt = 0;

  const onAppend = (ev) => v.player.append(ev);
  // what the studio needs from the action stream: agent names and colours, tree paths per event
  let pathsKey = -1; let paths = new Map();
  const storyInfo = () => {
    const acts = v.player.actions();
    if (acts.length !== pathsKey) {
      paths = new Map();
      for (const a of acts) { if (!paths.has(a.ev)) paths.set(a.ev, []); paths.get(a.ev).push(a.path); }
      pathsKey = acts.length;
    }
    return { label: (id) => v.player.label(id), colour: (id) => v.player.colour(id), pathsOfEv: (i) => paths.get(i) || [] };
  };
  v.setTimeline = (T) => {
    if (v.T && v.T.listeners) v.T.listeners.delete(onAppend);
    v.T = T;
    v.player.load(T.events);
    if (T.listeners) T.listeners.add(onAppend);
    v.t = Math.min(v.t, T.duration);
    v.sel = null;
  };
  v.setTime = (t) => { v.t = Math.max(0, Math.min(v.T ? v.T.duration + TAIL_MS : 0, t)); };
  v.play = () => { if (v.T && v.t >= v.T.duration + TAIL_MS - 100 && !v.live) v.t = 0; v.playing = true; };
  v.pause = () => { v.playing = false; };
  v.setSpeed = (s) => { v.speed = s; };
  v.setLive = (on) => { v.live = !!on; if (on) v.playing = true; };
  v.setInsets = (o) => { Object.assign(opts, o); };
  // follow the work on / off: the camera is part of the simulation, so the history is re-run with the new mode
  v.setFocus = (on) => {
    opts.focus = !!on;
    if (!on) freeze(); else release();
    v.player = createPlayer({ aspect: aspectNow(), autoRotate: opts.autoRotate, focus: !!on });
    if (v.T) v.player.load(v.T.events);
  };
  v.focus = () => (opts.focus != null ? !!opts.focus : studioOn());
  // highlight an agent or file from outside (hovering it in a panel): named and marked like a selection
  v.highlight = (id) => { v.hl = id || null; };
  v.zoom = (k) => { if (F) zoomAt(k, F.V.sx(F.V.cx), F.V.sy(F.V.cy)); };
  v.zoomAt = zoomAt;
  v.freeze = freeze;
  v.reset = () => { release(); cam.zoom = 1; cam.panX = 0; cam.panY = 0; cam.yawT = 0; v.select(null); };
  v.suspended = false;
  v.suspend = (on) => { v.suspended = !!on; };
  v.select = (id) => { v.sel = id; if (v.onSelect) v.onSelect(id, id ? v.inspect(id) : null); };
  v.inspect = (id) => inspect(v.player, v.T, id, v.t / 1000);
  v.frame = () => F;
  // render one exact moment synchronously (used by the comparison harness)
  v.renderAt = (ms) => { v.playing = false; v.t = ms; cam.k3 = cam.k3T; cam.pitch = cam.pitchT; cam.yaw = cam.yawT; render(0, true); return F ? F.counts : null; };

  function step(now) {
    raf = requestAnimationFrame(step);
    if (last == null) last = now;
    // smoothed frame time: a single slow frame does not make the animation lurch forward or stall
    const raw = Math.min(0.1, (now - last) / 1000);
    dtS = dtS ? dtS * 0.8 + raw * 0.2 : raw;
    const dt = Math.min(0.05, dtS);
    last = now;
    if (!v.T) return;
    if (v.playing) {
      // LIVE: the clock is the producer's wall clock (events carry real timestamps)
      if (v.live) v.t = Math.max(0, Math.min(Date.now() - v.T.t0, v.T.duration + TAIL_MS));
      else {
        v.t += dt * 1000 * v.speed;
        if (v.t >= v.T.duration + TAIL_MS) { v.t = v.T.duration + TAIL_MS; v.playing = false; }
      }
    }
    if (!v.suspended) render(dt, false);
    if (v.onTick) v.onTick(v);
  }

  function render(dt, sync) {
    // a free camera eases toward its zoom target (frame-rate independent); renderAt(sync) stays exact
    if (!sync && cam.free && cam.free.tk) {
      const a = 1 - Math.exp(-Math.min(0.1, dt) * 12);
      cam.free.cx += (cam.free.tx - cam.free.cx) * a; cam.free.cy += (cam.free.ty - cam.free.cy) * a;
      cam.free.K = Math.exp(Math.log(cam.free.K) + (Math.log(cam.free.tk) - Math.log(cam.free.K)) * a);
    }
    // the 3D amount, the tilt and the turn ease toward their targets (a presentation effect, like the camera blend)
    if (!sync) {
      const a3 = 1 - Math.exp(-Math.min(0.1, dt) * 6);
      cam.k3 += (cam.k3T - cam.k3) * a3; cam.pitch += (cam.pitchT - cam.pitch) * a3; cam.yaw += (cam.yawT - cam.yaw) * a3;
    }
    if (cam.blend && blendEase(cam.blend) >= 1) cam.blend = null;
    const W = glc.clientWidth;
    const H = glc.clientHeight;
    if (W < 20 || H < 20 || !v.T) return;
    // the tree is dense at any zoom: a pixel ratio above 1.5 costs fill rate without showing more of it
    const dpr = Math.min(window.devicePixelRatio || 1, opts.maxDpr || 1.5);
    if (ovc.width !== Math.round(W * dpr) || ovc.height !== Math.round(H * dpr)) { ovc.width = Math.round(W * dpr); ovc.height = Math.round(H * dpr); }
    // the camera framing depends on the aspect ratio: re-run the history when it changes a lot (debounced)
    const asp = aspectOf(W, H);
    if (Math.abs(asp - v.player.aspect) / v.player.aspect > 0.04) {
      if (!resizeAt) resizeAt = Date.now();
      if (sync || Date.now() - resizeAt > 250) { v.player.setAspect(asp); resizeAt = 0; }
    } else resizeAt = 0;
    const t0 = performance.now();
    const { s, k } = v.player.at(v.t / 1000);
    const studio = studioOn();
    F = buildFrame(s, k, W, H, { camera: cam, selected: v.sel, highlight: v.hl || v.hover, compat: v.compat, hideDirNames: opts.hideDirNames, inset: inset(), agentNames: studio });
    if (backend) backend.draw(F, W, H, dpr, opts.bg || BG0);
    const i = v.T.indexAt(v.t);
    const hud = opts.hud !== false;
    if (i >= 0 && hud && opts.caption !== false && !v.compat) {
      const ev = v.T.events[i];
      caption = (ev.agent ? ev.agent + ' · ' : '') + ev.type + (ev.text ? ' — ' + ev.text : ev.resource ? ' — ' + ev.resource : ev.tool ? ' — ' + ev.tool : '');
      captionColor = ev.type.includes('fail') || ev.type === 'error' ? [1, 0.6, 0.62] : ev.type.includes('passed') || ev.type.includes('completed') ? [0.75, 1, 0.82] : [1, 1, 1];
    } else caption = '';
    drawText(octx, F, W, H, dpr, {
      date: !hud || v.compat || opts.date === false ? '' : v.T.t0 != null ? formatDate(v.T.t0 + Math.min(v.t, v.T.duration + TAIL_MS)) : '',
      dateY: opts.clockY, keyX: opts.legendX != null ? opts.legendX - 20 : 0, keyY: opts.legendY != null ? opts.legendY - 22 : 0,
      key: hud && opts.legend !== false, keyMax: studio ? 6 : 0, keyBottom: H - (opts.insetBottom || 0) - 8, caption, captionColor, captionBottom: opts.captionBottom || 34, fontScale: opts.fontScale, font: opts.font,
    });
    drawFloor(octx, F, W, H, dpr);
    if (studio) {
      v.story = storyAt(v.T, storyInfo(), v.t);
      drawStory(octx, v.story, F, W, H, { inset: inset(), compact: W < 640, fontScale: opts.fontScale, bubbles: opts.bubbles === true });
    }
    // spend spare time computing checkpoints ahead, so scrubbing stays instant
    if (!sync) v.player.bakeAhead(v.T.duration / 1000 + TAIL_MS / 1000, v.ft < 10 ? 3 : 1);
    v.ft = v.ft * 0.9 + (performance.now() - t0) * 0.1;
  }

  // ---- input: drag pans, wheel zooms, click selects a file or an avatar
  let drag = null;
  const pick = (x, y) => {
    if (!F) return null;
    let best = null; let bd = 1e9;
    for (const p of F.picks) { const d = Math.hypot(p.x - x, p.y - y); if (d < p.r && d < bd) { bd = d; best = p.id; } }
    return best;
  };
  const rect = () => glc.getBoundingClientRect();
  // pointers in play: two of them are a pinch (zoom about their midpoint)
  const touches = new Map();
  ovc.addEventListener('contextmenu', (e) => e.preventDefault());
  ovc.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.button !== 2 && e.pointerType === 'mouse') return;
    try { ovc.setPointerCapture(e.pointerId); } catch (x) { /* optional */ }
    const r = rect();
    touches.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });
    if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y) || 1; drag = null; return; }
    // right button or shift turns the map (orbit); a plain drag pans
    drag = { x: e.clientX, y: e.clientY, moved: 0, px: e.clientX - r.left, py: e.clientY - r.top, orbit: e.button === 2 || e.shiftKey };
  });
  let pinch = 0;
  ovc.addEventListener('pointermove', (e) => {
    const r0 = rect();
    if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX - r0.left, y: e.clientY - r0.top });
    if (touches.size >= 2 && pinch) {
      const [a, b] = [...touches.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      zoomAt(pinch / d, (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch = d; return;
    }
    if (drag) {
      const dx = e.clientX - drag.x; const dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.orbit && drag.moved > 4) {
        // orbit: horizontal turns the map, vertical tilts it (3D comes on with the first turn)
        cam.k3T = 1; cam.pitchT = cam.pitchT || PITCH_3D;
        cam.yawT = cam.yaw = cam.yaw + dx * 0.006;
        cam.pitchT = cam.pitch = Math.max(0.1, Math.min(1.45, cam.pitch - dy * 0.005));
        cam.k3 = cam.k3T;
      } else if (drag.moved > 4 && F) {
        // pan: the drag follows the screen, so it runs along the turned axes and foreshortened by the tilt
        freeze();
        const K = cam.free.K * F.V.fit; const cP = Math.cos(cam.pitch * cam.k3); const cY = Math.cos(cam.yaw); const sY = Math.sin(cam.yaw);
        cam.free.cx -= dx / K * cY + dy / (K * cP) * sY;
        cam.free.cy -= -dx / K * sY + dy / (K * cP) * cY;
        cam.free.tx = cam.free.cx; cam.free.ty = cam.free.cy; cam.free.tk = cam.free.K;
      }
    } else {
      const r = rect();
      const h = pick(e.clientX - r.left, e.clientY - r.top);
      if (h !== v.hover) { v.hover = h; if (v.onHover) v.onHover(h); }
      ovc.style.cursor = v.hover ? 'pointer' : 'grab';
    }
  });
  const up = (e) => {
    touches.delete(e.pointerId);
    if (touches.size < 2) pinch = 0;
    const d = drag;
    drag = null;
    if (d && d.moved < 6 && e.type === 'pointerup') v.select(pick(d.px, d.py));
  };
  ovc.addEventListener('pointerup', up);
  ovc.addEventListener('pointerleave', () => { if (v.hover) { v.hover = null; if (v.onHover) v.onHover(null); } });
  ovc.addEventListener('pointercancel', up);
  ovc.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = rect();
    zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  ovc.addEventListener('dblclick', (e) => { const r = rect(); zoomAt(2.2, e.clientX - r.left, e.clientY - r.top); });

  raf = requestAnimationFrame(step);
  v.destroy = () => cancelAnimationFrame(raf);
  return v;
}
