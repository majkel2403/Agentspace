// Viewer: canvases, clock, input and the animation loop around the Gource-style player.
// Works in a plain page and inside the Design artifact (no modules there: the build inlines these files).
//   const v = createViewer({ gl: canvas, overlay: canvas2 })
//   v.setTimeline(T); v.setTime(ms); v.play(); v.setSpeed(4); v.setLive(true); v.onSelect = (id, info) => {}
import { createPlayer } from '../gource/player.js';
import { buildFrame } from '../gource/frame.js';
import { createGL } from '../gource/gl.js';
import { createC2D } from '../gource/c2d.js';
import { drawText, formatDate } from '../gource/text.js';
import { inspect } from '../gource/inspect.js';

const BG = [0.1, 0.1, 0.1];
export const TAIL_MS = 6000;

export function createViewer(opts) {
  const glc = opts.gl;
  const ovc = opts.overlay;
  const backend = (opts.forceCanvas2D ? null : createGL(glc)) || createC2D(glc);
  const octx = ovc.getContext('2d');
  const rm = (() => { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } })();
  const inset = () => ({ l: opts.insetLeft || 0, r: opts.insetRight || 0, t: opts.insetTop || 0, b: opts.insetBottom || 0 });
  // aspect ratio of the free area the camera frames
  const aspectOf = (W, H) => { const i = inset(); return Math.max(0.2, Math.max(40, W - i.l - i.r) / Math.max(40, H - i.t - i.b)); };
  const aspectNow = () => aspectOf(glc.clientWidth || 16, glc.clientHeight || 9);
  const v = {
    backend: backend ? backend.kind : 'none', T: null, t: 0, playing: false, speed: 1, live: false, sel: null, hover: null,
    onSelect: null, onTick: null, compat: !!opts.compat, rm, ft: 0, q: 2,
    player: createPlayer({ aspect: aspectNow() }),
  };
  const cam = { zoom: 1, panX: 0, panY: 0 };
  v.cam = cam;
  let last = null;
  let raf = 0;
  let F = null;
  let caption = '';
  let captionColor = [1, 1, 1];
  let resizeAt = 0;

  const onAppend = (ev) => v.player.append(ev);
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
  v.setOpening = () => {};
  v.setInsets = (o) => { Object.assign(opts, o); };
  v.zoom = (k) => { cam.zoom = Math.max(0.15, Math.min(8, cam.zoom / k)); };
  v.reset = () => { cam.zoom = 1; cam.panX = 0; cam.panY = 0; v.select(null); };
  v.select = (id) => { v.sel = id; if (v.onSelect) v.onSelect(id, id ? v.inspect(id) : null); };
  v.inspect = (id) => inspect(v.player, v.T, id, v.t / 1000);
  v.frame = () => F;
  // render one exact moment synchronously (used by the comparison harness)
  v.renderAt = (ms) => { v.playing = false; v.t = ms; render(0, true); return F ? F.counts : null; };

  function step(now) {
    raf = requestAnimationFrame(step);
    if (last == null) last = now;
    const dt = Math.min(0.1, (now - last) / 1000);
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
    render(dt, false);
    if (v.onTick) v.onTick(v);
  }

  function render(dt, sync) {
    const W = glc.clientWidth;
    const H = glc.clientHeight;
    if (W < 20 || H < 20 || !v.T) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (ovc.width !== Math.round(W * dpr) || ovc.height !== Math.round(H * dpr)) { ovc.width = Math.round(W * dpr); ovc.height = Math.round(H * dpr); }
    // the camera framing depends on the aspect ratio: re-run the history when it changes a lot (debounced)
    const asp = aspectOf(W, H);
    if (Math.abs(asp - v.player.aspect) / v.player.aspect > 0.04) {
      if (!resizeAt) resizeAt = Date.now();
      if (sync || Date.now() - resizeAt > 250) { v.player.setAspect(asp); resizeAt = 0; }
    } else resizeAt = 0;
    const t0 = performance.now();
    const { s, k } = v.player.at(v.t / 1000);
    F = buildFrame(s, k, W, H, { camera: cam, selected: v.sel, compat: v.compat, hideDirNames: opts.hideDirNames, inset: inset() });
    if (backend) backend.draw(F, W, H, dpr, BG);
    const i = v.T.indexAt(v.t);
    if (i >= 0 && opts.caption !== false && !v.compat) {
      const ev = v.T.events[i];
      caption = (ev.agent ? ev.agent + ' · ' : '') + ev.type + (ev.text ? ' — ' + ev.text : ev.resource ? ' — ' + ev.resource : ev.tool ? ' — ' + ev.tool : '');
      captionColor = ev.type.includes('fail') || ev.type === 'error' ? [1, 0.6, 0.62] : ev.type.includes('passed') || ev.type.includes('completed') ? [0.75, 1, 0.82] : [1, 1, 1];
    } else caption = '';
    drawText(octx, F, W, H, dpr, {
      date: v.compat || opts.date === false ? '' : v.T.t0 != null ? formatDate(v.T.t0 + Math.min(v.t, v.T.duration + TAIL_MS)) : '',
      dateY: opts.clockY, keyX: opts.legendX != null ? opts.legendX - 20 : 0, keyY: opts.legendY != null ? opts.legendY - 22 : 0,
      key: opts.legend !== false, keyBottom: H - (opts.insetBottom || 0) - 8, caption, captionColor, captionBottom: opts.captionBottom, fontScale: opts.fontScale,
    });
    // spend spare time computing checkpoints ahead, so scrubbing stays instant
    if (!sync) v.player.bakeAhead(v.T.duration / 1000 + TAIL_MS / 1000, 3);
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
  ovc.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    try { ovc.setPointerCapture(e.pointerId); } catch (x) { /* optional */ }
    const r = rect();
    drag = { x: e.clientX, y: e.clientY, moved: 0, px: e.clientX - r.left, py: e.clientY - r.top };
  });
  ovc.addEventListener('pointermove', (e) => {
    if (drag) {
      const dx = e.clientX - drag.x; const dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.moved > 4 && F) { cam.panX -= dx / F.V.K; cam.panY -= dy / F.V.K; }
    } else {
      const r = rect();
      v.hover = pick(e.clientX - r.left, e.clientY - r.top);
      ovc.style.cursor = v.hover ? 'pointer' : 'grab';
    }
  });
  const up = (e) => {
    const d = drag;
    drag = null;
    if (d && d.moved < 6 && e.type === 'pointerup') v.select(pick(d.px, d.py));
  };
  ovc.addEventListener('pointerup', up);
  ovc.addEventListener('pointercancel', up);
  ovc.addEventListener('wheel', (e) => { e.preventDefault(); v.zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });

  raf = requestAnimationFrame(step);
  v.destroy = () => cancelAnimationFrame(raf);
  return v;
}
