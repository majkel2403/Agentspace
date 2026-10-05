// Viewer: owns the canvases, camera, input and the animation loop. Works in a plain page and inside the
// Design artifact (no modules there: the build inlines these files).
//   const v = createViewer({ gl: canvas, overlay: canvas2, opening: 'orb' | 'graph' })
//   v.setTimeline(T); v.setTime(ms); v.play(); v.setSpeed(4); v.setLive(true); v.onSelect = (id, node) => {}
import { createScene } from './scene.js';
import { createGL } from './gl.js';
import { createC2D } from './c2d.js';
import { drawOverlay, formatClock } from './overlay.js';

export function createViewer(opts) {
  const glc = opts.gl;
  const ovc = opts.overlay;
  const backend = (opts.forceCanvas2D ? null : createGL(glc)) || createC2D(glc);
  const octx = ovc.getContext('2d');
  const scene = createScene();
  const rm = (() => { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } })();
  const v = {
    backend: backend ? backend.kind : 'none', T: null, t: 0, playing: false, speed: 1, live: false, opening: opts.opening || 'orb',
    q: 2, sel: null, hover: null, onSelect: null, onTick: null, title: opts.title || '', chrome: opts.chrome !== false, rm,
  };
  const cam = { yaw: 0.6, pitch: 0.38, dist: 520, tx: 0, ty: 0, tz: 0, zoomU: 1, dyaw: 0, dpitch: 0, auto: true, ox: 0, oy: 0 };
  v.cam = cam;
  let clock = 0;
  let last = null;
  let raf = 0;
  let F = null;
  let ft = 4;
  let fi = 0.016;
  let n = 0;
  let qLock = 0;
  let caption = '';
  let captionColor = '#E8ECF8';

  v.setTimeline = (T) => { v.T = T; v.t = Math.min(v.t, T.duration); };
  v.setTime = (t) => { v.t = Math.max(0, Math.min(v.T ? v.T.duration : 0, t)); };
  v.play = () => { if (v.T && v.t >= v.T.duration && !v.live) v.t = 0; v.playing = true; };
  v.pause = () => { v.playing = false; };
  v.setSpeed = (s) => { v.speed = s; };
  v.setLive = (on) => { v.live = !!on; if (on) v.playing = true; };
  v.setOpening = (o) => { v.opening = o; };
  v.setInsets = (o) => { Object.assign(opts, o); };
  v.zoom = (k) => { cam.zoomU = Math.max(0.35, Math.min(3, cam.zoomU * k)); };
  v.reset = () => { cam.zoomU = 1; cam.dyaw = 0; cam.dpitch = 0; cam.tx = cam.ty = cam.tz = 0; v.sel = null; if (v.onSelect) v.onSelect(null, null); };
  v.frame = () => F;

  function step(now) {
    raf = requestAnimationFrame(step);
    if (last == null) last = now;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    clock += dt;
    fi = fi * 0.95 + dt * 0.05;
    if (!v.T) return;
    if (v.playing) {
      // LIVE: the scene clock is the wall clock of the producer (events carry real timestamps)
      if (v.live) v.t = Math.max(0, Math.min(Date.now() - v.T.t0, v.T.duration + 6000));
      else {
        v.t += dt * 1000 * v.speed;
        if (v.t >= v.T.duration + 4500) { v.t = v.T.duration + 4500; v.playing = false; }
      }
    }
    render(dt);
    if (v.onTick) v.onTick(v);
  }

  function render(dt) {
    const W = glc.clientWidth;
    const H = glc.clientHeight;
    if (W < 20 || H < 20) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (ovc.width !== Math.round(W * dpr) || ovc.height !== Math.round(H * dpr)) { ovc.width = Math.round(W * dpr); ovc.height = Math.round(H * dpr); }
    // camera: auto-fit the graph, slow orbit, user offsets; the orb opening starts far away
    const t = v.t;
    if (!rm && cam.auto) cam.dyaw += dt * 0.05;
    cam.yaw = 0.6 + cam.dyaw;
    cam.pitch = Math.max(-1.2, Math.min(1.25, 0.38 + cam.dpitch));
    const fitR = F ? F.fit : 120;
    const want = (fitR * 2.15) / cam.zoomU;
    const comp = F ? F.compression : 0;
    // orb opening: frame the orb (it fills ~1/3 of the screen) and dolly in while it unfolds into the graph
    const target = v.opening === 'orb' ? want + (300 - want) * comp : want;
    cam.dist += (Math.max(140, target) - cam.dist) * Math.min(1, dt * 2.2);
    const bx = opts.insetLeft || 0;
    const bxR = opts.insetRight || 0;
    if (v.sel && F && F.state.nodes[v.sel]) {
      const p = F.picks.find((p) => p.id === v.sel);
      if (p) { cam.ox += ((glc.clientWidth / 2 - p.x) * 0.15 - cam.ox) * dt * 2; cam.oy += ((glc.clientHeight / 2 - p.y) * 0.15 - cam.oy) * dt * 2; }
    } else { cam.ox += ((bx - bxR) / 2 - cam.ox) * Math.min(1, dt * 2); cam.oy *= 1 - Math.min(1, dt * 2); }
    const t0 = performance.now();
    F = scene.frame({ T: v.T, t, fx: clock, W, H, cam, opening: v.opening, q: v.q, rm, sel: v.sel, hover: v.hover });
    if (backend) backend.draw(F.prims, W, H, dpr, [0.043, 0.047, 0.063]);
    // caption = the latest event text (what is happening now)
    const i = v.T.indexAt(t);
    if (i >= 0) {
      const ev = v.T.events[i];
      caption = (ev.agent ? ev.agent + ' · ' : '') + ev.type + (ev.text ? ' — ' + ev.text : ev.resource ? ' — ' + ev.resource : ev.tool ? ' — ' + ev.tool : '');
      captionColor = ev.type.includes('fail') || ev.type === 'error' ? '#FF8F9A' : ev.type.includes('passed') || ev.type.includes('completed') ? '#B8FFD0' : '#E8ECF8';
    }
    drawOverlay(octx, W, H, dpr, F, { legendX: opts.legendX, legendY: opts.legendY, clockY: opts.clockY, captionBottom: opts.captionBottom, legend: opts.legend, chrome: v.chrome, clock: v.T.t0 != null ? formatClock(v.T.t0 + Math.min(t, v.T.duration)) : '', title: opts.hideTitle ? '' : v.title, caption: v.chrome ? caption : '', captionColor });
    ft = ft * 0.92 + (performance.now() - t0) * 0.08;
    n++;
    if (n % 60 === 0) {
      if ((ft > 14 || fi > 0.036) && v.q > 0) { v.q--; qLock = n + 900; }
      else if (ft < 6 && fi < 0.02 && v.q < 2 && n > qLock) v.q++;
    }
    v.ft = ft;
  }

  // ---- input: drag rotates, wheel/pinch zoom, click selects
  let drag = null;
  const pick = (x, y) => {
    if (!F) return null;
    let best = null; let bz = 1e9;
    for (const p of F.picks) if (Math.hypot(p.x - x, p.y - y) < p.r && p.z < bz) { bz = p.z; best = p.id; }
    return best;
  };
  const rect = () => glc.getBoundingClientRect();
  const target = ovc;
  target.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    try { target.setPointerCapture(e.pointerId); } catch (x) { /* optional */ }
    const r = rect();
    drag = { x: e.clientX, y: e.clientY, moved: 0, px: e.clientX - r.left, py: e.clientY - r.top };
  });
  target.addEventListener('pointermove', (e) => {
    if (drag) {
      const dx = e.clientX - drag.x; const dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
      cam.dyaw -= dx * 0.006; cam.dpitch += dy * 0.004;
    } else {
      const r = rect();
      v.hover = pick(e.clientX - r.left, e.clientY - r.top);
      target.style.cursor = v.hover ? 'pointer' : 'grab';
    }
  });
  const up = (e) => {
    const d = drag;
    drag = null;
    if (d && d.moved < 6 && e.type === 'pointerup') {
      const id = pick(d.px, d.py);
      v.sel = id;
      if (v.onSelect) v.onSelect(id, id && F ? F.state.nodes[id] : null);
    }
  };
  target.addEventListener('pointerup', up);
  target.addEventListener('pointercancel', up);
  target.addEventListener('wheel', (e) => { e.preventDefault(); v.zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1); }, { passive: false });

  raf = requestAnimationFrame(step);
  v.destroy = () => cancelAnimationFrame(raf);
  return v;
}
