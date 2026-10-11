// The web app: loads the runs, plays them on the log clock, follows live runs over WebSocket and wires the clicks.
// The log clock is app.t (seconds from the start of the run). Everything on screen is drawn from the state at app.t.
import { parseJsonl, validateEvent } from './events.js';
import { createReplay } from './model.js';
import { buildLayout } from './layout.js';
import { createScene } from './scene.js';
import { headerHTML, rosterHTML, deckHTML, timelineHTML, clockHTML } from './ui.js';

const $ = (s) => document.querySelector(s);
const app = {
  runs: [], run: null, replay: null, layout: null, pathCount: -1, t: 0, playing: false, speed: 1, follow: true,
  live: false, ws: null, tab: 'msgs', selected: null, scene: null, uiAt: 0, dirty: true,
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
  app.run = id; app.t = 0; app.playing = false; app.selected = null; app.pathCount = -1;
  history.replaceState(null, '', '?run=' + encodeURIComponent(id));
  rebuildLayout();
  const info = app.runs.find((r) => r.id === id);
  if (info && info.source === 'live') connect(id);
  app.dirty = true;
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
    const st = app.replay.at(Math.min(app.t, end + SKIP_TAIL));
    app.scene.setSelected(app.selected);
    app.scene.update(st);
    app.scene.frame(st, dt);
    if (app.dirty || now - app.uiAt > 200) {
      app.uiAt = now; const forced = app.dirty; app.dirty = false; force = forced;
      const v = view(end);
      paint('#top', headerHTML(st, v));
      paint('#roster', rosterHTML(st, v));
      paint('#deck', deckHTML(st, v, app.replay.events));
      paint('#scrub', timelineHTML(v, app.replay.events));
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
});
// clicks in the 3D scene select the thing and open the inspector
app.scene = createScene($('#stage'), {
  onPick: (id) => { if (id) { app.selected = id; app.tab = 'ins'; } else app.selected = null; app.dirty = true; },
});
app.scene.setFollow(true);
requestAnimationFrame(tick);
loadRuns().catch((err) => { $('#stage').insertAdjacentHTML('beforeend', '<p class="hint">Nie udało się wczytać przebiegów: ' + String(err && err.message || err) + '</p>'); });
