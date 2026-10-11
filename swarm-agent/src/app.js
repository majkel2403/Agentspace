// The web app: loads the runs, plays them on the log clock, follows live runs over WebSocket and wires the clicks.
// The log clock is app.t (seconds from the start of the run). Everything on screen is drawn from the state at app.t.
import { parseJsonl, validateEvent } from './events.js';
import { createReplay } from './model.js';
import { buildLayout } from './layout.js';
import { createScene } from './scene.js';
import { headerHTML, rosterHTML, deckHTML, timelineHTML, clockHTML } from './ui.js';
import { keyMoments, caption, stepMoment } from './story.js';
import { createSound } from './sound.js';

const sound = createSound();
// the last event at or before t (binary search; the log is sorted)
function lastIndexAt(events, t0, t) {
  let lo = 0; let hi = events.length; const lim = t0 + t * 1000;
  while (lo < hi) { const m = (lo + hi) >> 1; if (events[m].ts <= lim) lo = m + 1; else hi = m; }
  return lo - 1;
}

const $ = (s) => document.querySelector(s);
const app = {
  runs: [], run: null, replay: null, layout: null, pathCount: -1, t: 0, playing: false, speed: 1, follow: true,
  live: false, ws: null, tab: 'msgs', selected: null, scene: null, uiAt: 0, dirty: true,
  director: false, moments: [], momentsFor: -1, soundT: -1, dirAgent: null, dirAt: 0,
};
const SKIP_TAIL = 2; // the clock keeps running this many seconds after the last event, then stops
// a panel is redrawn only when its content changed, and not while the pointer is over it (a button under the pointer
// must not be replaced between press and release); the clock is updated on its own
const last = {}; const hover = new Set();
let force = false; // set by a click: its own redraw is allowed even under the pointer (the click has already happened)
function paint(id, html) {
  if ((hover.has(id) && !force) || last[id] === html) return;
  last[id] = html; $(id).innerHTML = html;
}
for (const id of ['#top', '#roster', '#deck', '#scrub']) {
  const el = document.querySelector(id);
  el.addEventListener('pointerenter', () => hover.add(id));
  el.addEventListener('pointerleave', () => { hover.delete(id); last[id] = null; });
}

function allPaths(events) {
  const set = new Set();
  for (const e of events) {
    if (e.type === 'scan') for (const p of e.paths) set.add(p);
    else if (e.path) set.add(e.path);
  }
  return set;
}
function rebuildLayout() {
  const paths = allPaths(app.replay.events);
  if (paths.size === app.pathCount) return;
  app.pathCount = paths.size;
  app.layout = buildLayout([...paths]);
  app.scene.setLayout(app.layout);
}

async function loadRuns() {
  app.runs = await (await fetch('/api/runs')).json();
  if (!app.runs.length) { $('#stage').insertAdjacentHTML('beforeend', '<p class="hint">Brak przebiegów. Uruchom <code>npm run demo:build</code> albo wyślij zdarzenia do <code>POST /api/runs/:id/events</code>.</p>'); return; }
  const q = new URLSearchParams(location.search).get('run');
  const pick = app.runs.find((r) => r.id === q) || app.runs.find((r) => r.status === 'running') || app.runs[0];
  await openRun(pick.id);
}

async function openRun(id) {
  disconnect();
  const text = await (await fetch('/api/runs/' + encodeURIComponent(id))).text();
  const { events, bad } = parseJsonl(text);
  if (bad.length) console.warn('skipped lines', bad);
  app.replay = createReplay(events);
  app.run = id; app.t = 0; app.playing = false; app.selected = null; app.pathCount = -1; app.soundT = -1; app.momentsFor = -1;
  history.replaceState(null, '', '?run=' + encodeURIComponent(id));
  rebuildLayout();
  const info = app.runs.find((r) => r.id === id);
  if (info && info.source === 'live') connect(id);
  app.dirty = true;
  showCurtain(id);
}

// the opening card: the task and who takes part, for a few seconds before the clock starts
function showCurtain(id) {
  const el = $('#curtain'); if (!el || !app.replay) return;
  const st = app.replay.at(0);
  $('#curtain-task').textContent = st.task || id;
  $('#curtain-who').textContent = (app.replay.events.some((e) => e.type === 'scan') ? 'przestrzeń roboczą: ' : '') + st.order.length + ' agentów w roju';
  el.classList.remove('off'); el.classList.add('on');
  clearTimeout(app.curtainTimer);
  app.curtainTimer = setTimeout(() => { el.classList.remove('on'); el.classList.add('off'); }, 2600);
}

// LIVE: new events are appended as they arrive; the clock follows the head while live and follow is on
function connect(id) {
  const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/live?run=' + encodeURIComponent(id));
  app.ws = ws; app.live = true;
  ws.onmessage = (m) => {
    let r; try { r = validateEvent(JSON.parse(m.data)); } catch { return; }
    if (!r.ok) return;
    if (!app.replay.events.length) app.replay = createReplay([r.event]); else app.replay.append(r.event);
    rebuildLayout();
    app.dirty = true;
  };
  ws.onclose = () => { if (app.ws === ws) { app.live = false; app.ws = null; app.dirty = true; } };
}
function disconnect() { if (app.ws) { const ws = app.ws; app.ws = null; app.live = false; ws.close(); } }

function tick(now) {
  requestAnimationFrame(tick);
  if (!app.last) app.last = now;
  const dt = Math.min(0.1, (now - app.last) / 1000); app.last = now;
  if (app.replay && app.replay.events.length) {
    const end = app.replay.duration;
    if (app.live) { if (app.follow) app.t = end; }
    else if (app.playing) {
      app.t += dt * app.speed;
      if (app.t >= end + SKIP_TAIL) { app.t = end + SKIP_TAIL; app.playing = false; app.dirty = true; }
    }
    const at = Math.min(app.t, end + SKIP_TAIL);
    const st = app.replay.at(at);
    const evs = app.replay.events;
    // sound: the events the clock has just passed (never when scrubbing back)
    if (sound.on && app.playing && app.soundT >= 0 && app.t > app.soundT && app.t - app.soundT < 1) {
      let k = 0;
      for (let i = lastIndexAt(evs, app.replay.t0, app.soundT) + 1; i < evs.length && (evs[i].ts - app.replay.t0) / 1000 <= app.t && k < 8; i++, k++) sound.play(evs[i], k);
    }
    app.soundT = app.t;
    // the director: the camera goes to whoever acted last (never a cut: it glides there)
    if (app.director) {
      if (now - app.dirAt > 900) {
        app.dirAt = now;
        const i = lastIndexAt(evs, app.replay.t0, at);
        const e = i >= 0 ? evs[i] : null;
        const who = e && (e.agent || e.from);
        if (who) app.dirAgent = who;
      }
      app.scene.setDirector(app.dirAgent ? app.scene.positionOf(app.dirAgent) : null);
    } else app.scene.setDirector(null);
    if (app.moments.length === 0 || app.momentsFor !== evs.length) { app.moments = keyMoments(evs); app.momentsFor = evs.length; }
    app.caption = caption(evs, app.replay.t0, at, st);
    app.scene.setSelected(app.selected);
    app.scene.update(st);
    app.scene.frame(st, dt);
    if (app.dirty || now - app.uiAt > 200) {
      app.uiAt = now; const forced = app.dirty; app.dirty = false; force = forced;
      const v = view(end);
      v.director = app.director; v.sound = sound.on; v.caption = app.caption;
      v.nextMoment = stepMoment(app.moments, app.t, 1); v.prevMoment = stepMoment(app.moments, app.t, -1);
      paint('#top', headerHTML(st, v));
      paint('#roster', rosterHTML(st, v));
      paint('#deck', deckHTML(st, v, app.replay.events));
      paint('#scrub', timelineHTML(v, app.replay.events, app.moments));
      force = false;
      const c = $('#clock'); if (c) c.innerHTML = clockHTML(v);
    }
  } else if (app.dirty) {
    app.dirty = false;
    paint('#top', headerHTML({ now: 0, task: '', agents: new Map(), order: [] }, view(0)));
    paint('#roster', '');
  }
}
function view(end) {
  return { run: app.run, runs: app.runs, live: app.live, playing: app.playing, speed: app.speed, follow: app.follow, t: Math.min(app.t, end), duration: end, tab: app.tab, selected: app.selected };
}

// jumps to the next or previous key moment (the clock stops there so the reader can look)
function jump(dir) {
  if (!app.replay) return;
  const m = stepMoment(app.moments, app.t, dir);
  if (m) { app.t = m.t; app.playing = false; app.dirty = true; }
}
// clicks, keys and the timeline
function act(el, e) {
  const k = el.dataset.act;
  if (k === 'play') { app.playing = !app.playing; if (app.playing && app.replay && app.t >= app.replay.duration + SKIP_TAIL) app.t = 0; }
  else if (k === 'speed') app.speed = Number(el.dataset.v);
  else if (k === 'follow') { app.follow = !app.follow; app.scene.setFollow(app.follow); }
  else if (k === 'reset') app.scene.resetView();
  else if (k === 'tab') app.tab = el.dataset.v;
  else if (k === 'agent') { app.selected = 'agent:' + el.dataset.id; app.tab = 'ins'; }
  else if (k === 'file') { app.selected = 'file:' + el.dataset.id; app.tab = 'ins'; }
  else if (k === 'director') app.director = !app.director;
  else if (k === 'sound') sound.toggle();
  else if (k === 'moment') jump(Number(el.dataset.v));
  app.dirty = true; // redrawn on the next frame, even under the pointer
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el && el.tagName !== 'INPUT' && el.tagName !== 'SELECT') act(el, e);
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-act="run"]');
  if (el) openRun(el.value);
});
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-act="seek"]');
  if (el && app.replay) { app.playing = false; app.t = Number(el.value); app.dirty = true; }
});
document.addEventListener('keydown', (e) => {
  if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  if (e.code === 'Space') { e.preventDefault(); app.playing = !app.playing; app.dirty = true; }
  if (e.key === 'Escape') { app.selected = null; app.dirty = true; }
  if (e.key === 'f') { app.follow = !app.follow; app.scene.setFollow(app.follow); app.dirty = true; }
  if (e.key === 'd') { app.director = !app.director; app.dirty = true; }
  if (e.key === 'm') { sound.toggle(); app.dirty = true; }
  if (e.key === 'n') jump(1);
  if (e.key === 'p') jump(-1);
});
// clicks in the 3D scene select the thing and open the inspector
app.scene = createScene($('#stage'), {
  onPick: (id) => { if (id) { app.selected = id; app.tab = 'ins'; } else app.selected = null; app.dirty = true; },
});
app.scene.setFollow(true);
requestAnimationFrame(tick);
loadRuns().catch((err) => { $('#stage').insertAdjacentHTML('beforeend', '<p class="hint">Nie udało się wczytać przebiegów: ' + String(err && err.message || err) + '</p>'); });
