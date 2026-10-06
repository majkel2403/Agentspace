// Hermes · Centrum dowodzenia: one app for ordering a task, watching the agents work (REPLAY of recorded runs from
// the Event Store, LIVE following of a running one) and reading the report. The panels are laid out from the shared
// app model (packages/core/app.js), the same one the canvas boards use.
import { parseJsonl, validateEvent, createTimeline, runFacts, appState, matchTask, mmss } from '/packages/core/index.js';
import { createViewer } from '/packages/core/render/viewer.js';

const $ = (id) => document.getElementById(id);
const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const params = new URLSearchParams(location.search);
const wide = () => window.innerWidth > 900;
// ?compat=1: draw exactly what the real Gource can show (for side-by-side comparison); ?chrome=0: no panels
const compat = params.get('compat') === '1';
const bare = params.get('chrome') === '0';
if (bare) document.body.classList.add('bare');
const viewer = createViewer({ gl: $('gl'), overlay: $('ov'), compat, caption: !compat, autoRotate: false, date: false, ...insets() });
window.__NW = viewer;

const DEMO_NAMES = { 'repo-fix': 'Naprawa repo', panel: 'Panel sprzedaży', medytacja: 'Premiera aplikacji', niemcy: 'Wejście do Niemiec' };
const S = { run: null, runs: [], tab: 'log', T: null, F: null, ws: null, custom: null, pushed: 0, idx: -2, listKey: '', note: '' };

function insets() {
  if (bare) return { legend: true, insetLeft: 0, insetTop: 0, insetBottom: 0, legendX: 20, legendY: 22, captionBottom: 34 };
  return wide()
    ? { legend: true, insetLeft: 360, insetTop: 6, insetBottom: 6, legendX: 382, legendY: 30, captionBottom: 22 }
    : { legend: false, insetLeft: 0, insetTop: 4, insetBottom: 4, captionBottom: 10 };
}
const runName = (id) => (id === 'custom' ? 'Własny log' : DEMO_NAMES[id] || ((S.runs.find((r) => r.run === id) || {}).title || id || ''));

// ---- loading runs
function load(events, run, opts) {
  S.T = createTimeline(events);
  S.F = runFacts(S.T);
  S.run = run;
  S.idx = -2;
  viewer.setTimeline(S.T);
  viewer.setTime(0);
  viewer.select(null);
  $('report').hidden = true;
  if (!opts || opts.task == null) $('task').value = S.F.title;
  else $('task').value = opts.task;
  drawTicks();
  renderRuns();
  viewer.play();
  render(true);
}

async function openRun(run, task) {
  if (S.ws) { S.ws.close(); S.ws = null; }
  if (run !== 'custom') S.note = '';
  if (run === 'custom') { load(S.custom, 'custom', { task }); setLive(false); return; }
  const txt = await (await fetch('/api/runs/' + encodeURIComponent(run))).text();
  const info = S.runs.find((r) => r.run === run);
  const isLive = !!info && info.status === 'running' && info.source === 'recorded';
  load(parseJsonl(txt).events, run, { task });
  setLive(isLive);
  if (isLive) followLive(run);
  const u = new URL(location.href);
  u.searchParams.set('run', run);
  history.replaceState(null, '', u);
}
function setLive(on) { $('live').hidden = !on; viewer.setLive(on); }

function followLive(run) {
  S.ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/live?run=' + encodeURIComponent(run));
  S.ws.onmessage = (m) => {
    const r = validateEvent(JSON.parse(m.data));
    if (!r.ok) return;
    const T = S.T;
    if (!T || !T.events.length) return load([r.event], run);
    if (r.event.ts < T.events[T.events.length - 1].ts) return;
    const atEnd = viewer.t >= T.duration - 50;
    T.append(r.event);
    S.F = runFacts(T);
    if (atEnd) viewer.setTime(T.duration);
    drawTicks();
  };
}

// the run list is rebuilt only when it changed
let runsKey = '';
async function refreshRuns() {
  try { S.runs = await (await fetch('/api/runs')).json(); } catch { return S.runs; }
  const key = JSON.stringify(S.runs.map((r) => [r.run, r.status, r.title, r.source]));
  if (key !== runsKey) { runsKey = key; renderRuns(); }
  return S.runs;
}
function renderRuns() {
  const order = Object.keys(DEMO_NAMES);
  const runs = [...S.runs].sort((a, b) => {
    const ia = order.indexOf(a.run); const ib = order.indexOf(b.run);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return b.startedAt - a.startedAt;
  });
  const rows = runs.map((r) => {
    const live = r.status === 'running' && r.source === 'recorded';
    const stale = r.status === 'stale' && r.source === 'recorded';
    const on = r.run === S.run;
    const dot = live ? '#FF6B7A' : on ? (S.T && S.idx >= 0 && appDone() ? '#7CFF9A' : '#F2C14E') : '#2A3560';
    const meta = live ? 'LIVE' : stale ? 'przerwany' : on && S.T ? mmss(S.T.duration) : r.source === 'demo' ? 'demo' : 'zapis';
    return { id: r.run, on, dot, name: runName(r.run), meta };
  });
  if (S.custom) rows.push({ id: 'custom', on: S.run === 'custom', dot: '#9FE3FF', name: 'Własny log', meta: S.T && S.run === 'custom' ? mmss(S.T.duration) : 'plik' });
  $('runs').innerHTML = rows.length
    ? rows.map((r) => '<button class="run" type="button" data-run="' + esc(r.id) + '" aria-pressed="' + r.on + '"><i style="background:' + r.dot + ';box-shadow:0 0 8px ' + r.dot + '"></i><b>' + esc(r.name) + '</b><small>' + esc(r.meta) + '</small></button>').join('')
    : '<div class="empty">Brak zapisanych przebiegów.</div>';
}
$('runs').onclick = (e) => { const b = e.target.closest('[data-run]'); if (b) openRun(b.dataset.run); };
let lastDone = false;
const appDone = () => lastDone;

// ---- the order composer: a typed task replays the closest recorded run (the demo has no model behind it)
function matchNote() {
  const txt = $('task').value;
  const ids = S.runs.map((r) => r.run);
  if (!txt.trim()) return ['Wpisz zadanie albo wybierz zapisany przebieg.', null];
  if (S.F && txt === S.F.title) return ['Odtwarzam zapisany przebieg tego zadania.', S.run];
  const m = matchTask(txt, ids);
  return m ? ['Najbliższy zapisany przebieg: ' + runName(m) + '.', m] : ['Brak podobnego przebiegu — wybierz jeden z listy.', null];
}
function renderMatch() { $('match').textContent = matchNote()[0]; }
$('task').oninput = renderMatch;
$('task').onkeydown = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('launch').click(); } };
$('launch').onclick = () => {
  const m = matchNote()[1];
  if (!m) { renderMatch(); $('task').focus(); return; }
  openRun(m, $('task').value);
  if (!wide()) setMtab('scene');
};

// ---- own JSONL log
$('file').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const { events, errors } = parseJsonl(await f.text());
  e.target.value = '';
  S.note = events.length ? events.length + ' zdarzeń' + (errors.length ? ', odrzucono ' + errors.length : '') : 'Brak poprawnych zdarzeń w pliku';
  if (!events.length) { $('note').textContent = S.note; return; }
  S.custom = events;
  openRun('custom');
};

// ---- tabs (wide: list tabs; narrow: view tabs in the bottom bar)
function setMtab(id) {
  document.body.dataset.mtab = id;
  if (id === 'log' || id === 'talk') S.tab = id;
  S.listKey = '';
  render(true);
}
$('tabs').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) { S.tab = b.dataset.tab; S.listKey = ''; render(true); } };
$('mtabs').onclick = (e) => { const b = e.target.closest('[data-mtab]'); if (b) setMtab(b.dataset.mtab); };
$('list').onclick = (e) => {
  const b = e.target.closest('[data-pick]');
  if (!b) return;
  viewer.select(b.dataset.pick);
  if (!wide()) setMtab('scene');
};

// ---- transport + camera
$('play').onclick = () => (viewer.playing ? viewer.pause() : viewer.play());
$('restart').onclick = () => { viewer.setTime(0); viewer.play(); $('report').hidden = true; };
document.querySelectorAll('[data-speed]').forEach((b) => { b.onclick = () => { viewer.setSpeed(Number(b.dataset.speed)); document.querySelectorAll('[data-speed]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }; });
$('t').oninput = (e) => { if (!S.T) return; setLive(false); viewer.pause(); viewer.setTime((Number(e.target.value) / 1000) * S.T.duration); };
$('follow').onclick = () => { const on = $('follow').getAttribute('aria-pressed') !== 'true'; viewer.setFocus(on); $('follow').setAttribute('aria-pressed', String(on)); };
$('zi').onclick = () => viewer.zoom(1.2);
$('zo').onclick = () => viewer.zoom(1 / 1.2);
$('reset').onclick = () => viewer.reset();
$('close-ins').onclick = () => viewer.select(null);
$('report-btn').onclick = () => { if (!lastDone) return; viewer.select(null); $('report').hidden = false; render(true); $('close-report').focus(); };
$('close-report').onclick = () => { $('report').hidden = true; $('report-btn').focus(); };
window.addEventListener('keydown', (e) => {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if (e.code === 'Space') { e.preventDefault(); $('play').click(); }
  if (e.key === 'Escape') { if (!$('report').hidden) $('close-report').click(); else viewer.select(null); }
});

function drawTicks() {
  const c = $('ticks');
  const W = c.clientWidth; const H = c.clientHeight;
  if (W < 10) return;
  c.width = W * 2; c.height = H * 2;
  const g = c.getContext('2d');
  g.setTransform(2, 0, 0, 2, 0, 0);
  const T = S.T;
  if (!T || !T.duration) return;
  const X = (ms) => 5 + (ms / T.duration) * (W - 10);
  // phase bands under the ticks, alternating, with a gold seam between phases
  S.F.phases.forEach((p, k) => {
    g.fillStyle = k % 2 ? 'rgba(42,53,96,0.55)' : 'rgba(26,35,64,0.75)';
    g.fillRect(X(p.start), H / 2 - 1, Math.max(1, X(p.end) - X(p.start)), 3);
    if (k) { g.fillStyle = 'rgba(242,193,78,0.6)'; g.fillRect(X(p.start), H / 2 - 5, 1, 11); }
  });
  T.events.forEach((ev, i) => {
    const bad = ev.type.indexOf('fail') >= 0 || ev.type === 'error';
    const sp = ev.type === 'agent.spawned';
    g.fillStyle = bad ? '#FF5A6A' : sp ? '#F2C14E' : ev.type === 'message.sent' ? 'rgba(214,190,255,0.75)' : ev.type.indexOf('file.') === 0 ? '#9FE3FF' : 'rgba(232,236,248,0.28)';
    const h = bad || sp ? 22 : 12;
    g.fillRect(X(T.rel[i]), H / 2 - h / 2 - 9, 1, h);
  });
}
window.addEventListener('resize', () => { viewer.setInsets(insets()); drawTicks(); S.listKey = ''; render(true); });

// ---- inspector: what the picked file or agent did
viewer.onSelect = (id, info) => {
  if (!id || !info || !S.T) { $('inspector').hidden = true; return; }
  $('report').hidden = true;
  const tone = (t) => (t.indexOf('fail') >= 0 || t === 'error' ? '#FF8F9A' : t.indexOf('passed') >= 0 || t.indexOf('completed') >= 0 ? '#8CFFB4' : '#7F8BB3');
  $('ins-kind').textContent = info.kind === 'file' ? 'plik' : info.sub;
  $('ins').innerHTML = '<div class="st">' + esc(info.status) + '</div><h3>' + esc(info.label) + '</h3>' +
    (info.kind === 'file' ? '<p class="path">' + esc(info.sub) + '</p>' : '') +
    '<dl class="hx-dl">' + info.stats.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('') + '</dl>' +
    '<div class="cap">Co robił · ostatnie zdarzenia</div>' +
    info.events.map((e) => '<div class="ev"><span class="k" style="color:' + tone(e.type) + '">' + mmss(e.rel) + ' · ' + esc(e.type) + (e.who ? ' · ' + esc(e.who) : '') + '</span><br>' + esc(e.text) + '</div>').join('');
  $('inspector').hidden = false;
};

// ---- the panels, from the app model at the viewer's time
// the DOM is touched only when the markup changed, so buttons under the pointer or in focus are never replaced
const setHtml = (id, html) => { const el = $(id); if (el._html !== html) { el._html = html; el.innerHTML = html; } };
const setText = (id, txt) => { const el = $(id); if (el.textContent !== txt) el.textContent = txt; };
function render(force) {
  const T = S.T;
  if (!T) return;
  const t = Math.min(viewer.t, T.duration);
  const idx = T.indexAt(viewer.t);
  const now = performance.now();
  if (!force && idx === S.idx && now - S.pushed < 250) return;
  S.pushed = now;
  const A = appState(T, S.F, t, (id) => viewer.player.label(id), viewer.player.actions());
  const changed = idx !== S.idx;
  S.idx = idx;
  if (A.done !== lastDone) { lastDone = A.done; renderRuns(); }

  setText('runline', 'Agentspace · ' + runName(S.run));
  setHtml('phases', A.phases.map((p) => '<li style="flex:' + (p.cur ? 6 : 1) + ' 1 0"' + (p.cur ? ' aria-current="step"' : '') + ' title="' + esc(p.num + ' ' + p.name) + '"><span class="n" style="color:' + p.colour + '">' + esc(p.label) + '</span><span class="b"><i style="width:' + p.fill + '%"></i></span></li>').join(''));
  setHtml('kpis', A.kpis.map((k) => '<li>' + esc(k.label) + '<b style="color:' + k.colour + '">' + esc(k.value) + '</b></li>').join(''));
  setHtml('clock', esc(mmss(t)) + '<small>/ ' + esc(mmss(T.duration)) + '</small>');
  setText('status', A.done ? 'zakończony' : A.failed ? 'błąd' : t > 0 ? (viewer.playing ? 'w toku' : 'pauza') : 'gotowy');
  $('t').value = String(Math.round((t / (T.duration || 1)) * 1000));
  setText('play', viewer.playing ? '❚❚' : '▶');
  $('play').setAttribute('aria-label', viewer.playing ? 'Wstrzymaj' : 'Odtwórz');
  setText('note', S.note || (A.done ? 'Przebieg zakończony · raport gotowy' : (idx + 1) + ' / ' + T.events.length + ' zdarzeń'));
  const rb = $('report-btn');
  rb.disabled = !A.done;
  rb.classList.toggle('ready', A.done);
  renderMatch();

  const tabs = [['log', 'Dziennik', A.log.length], ['talk', 'Rozmowy', A.talk.length], ['files', 'Pliki', A.files.length]];
  setHtml('tabs', tabs.map(([id, n]) => '<button class="tab" type="button" role="tab" data-tab="' + id + '" aria-selected="' + (S.tab === id) + '">' + n + ' <span class="hx-mono"></span></button>').join(''));
  tabs.forEach(([, , c], k) => { const sp = $('tabs').children[k].lastChild; if (sp.textContent !== String(c)) sp.textContent = String(c); });
  const mt = document.body.dataset.mtab;
  setHtml('mtabs', [['scene', 'Scena'], ['order', 'Zlecenie'], ['log', 'Dziennik'], ['talk', 'Rozmowy']].map(([id, n]) => '<button class="tab" type="button" role="tab" data-mtab="' + id + '" aria-selected="' + (mt === id) + '">' + n + '</button>').join(''));

  const key = S.tab + '|' + idx + '|' + S.run;
  if (changed || force || key !== S.listKey) {
    S.listKey = key;
    const el = $('list');
    const top = el.scrollTop;
    el.innerHTML = listHtml(A);
    el.scrollTop = top;
  }
  if (!$('report').hidden) renderReport(A);
}

function listHtml(A) {
  if (S.tab === 'talk') {
    return A.talk.length
      ? '<ol>' + A.talk.map((m) => '<li class="it" style="border-left-color:' + m.colour + '"><span class="k"><b style="color:var(--txt);font-weight:600">' + esc(m.from) + '</b>→ ' + esc(m.to) + '<span class="r" style="color:' + m.colour + '">' + esc(m.tone) + '</span></span>' + esc(m.text) + '<span class="p">' + esc(m.time) + '</span></li>').join('') + '</ol>'
      : '<div class="empty">Agenci jeszcze ze sobą nie rozmawiali.</div>';
  }
  if (S.tab === 'files') {
    return A.files.length
      ? '<ol>' + A.files.map((f) => {
        const tag = f.id ? 'button' : 'div';
        return '<li><' + tag + ' class="it"' + (f.id ? ' type="button" data-pick="' + esc(f.id) + '"' : '') + ' style="border-left-color:' + f.colour + '"><span class="k"><b style="color:var(--txt);font-weight:600">' + esc(f.name) + '</b>' + esc(f.diff) + '<span class="r" style="color:' + f.colour + '">' + esc(f.kind) + '</span></span><span class="p">' + esc(f.dir) + ' · ' + esc(f.who) + ' · ' + esc(f.time) + '</span></' + tag + '></li>';
      }).join('') + '</ol>'
      : '<div class="empty">Nic jeszcze nie zostało zapisane.</div>';
  }
  return A.log.length
    ? '<ol>' + A.log.map((l) => '<li class="it" style="border-left-color:' + l.colour + '"><span class="k">' + esc(l.time) + ' · ' + esc(l.type) + (l.who ? ' · ' + esc(l.who) : '') + '</span>' + esc(l.text) + '</li>').join('') + '</ol>'
    : '<div class="empty">Przebieg jeszcze się nie zaczął.</div>';
}

function renderReport(A) {
  const R = A.report;
  $('report-run').textContent = runName(S.run);
  $('report-body').innerHTML = '<div><div class="ok"' + (A.failed ? ' style="color:#FF8F9A"' : '') + '>◆ ' + esc(R.status) + '</div><h2>' + esc(R.title) + '</h2></div>' +
    (R.summary ? '<p style="margin:0;color:var(--mut)">' + esc(R.summary) + '</p>' : '') +
    '<ul class="rk">' + R.kpis.map((k) => '<li><span>' + esc(k.label) + '</span><b>' + esc(k.value) + '</b></li>').join('') + '</ul>' +
    (R.doc ? '<div><div class="cap" style="margin-bottom:6px">' + esc(R.docPath) + '</div><div class="doc"><pre>' + esc(R.doc) + '</pre></div></div>' : '') +
    (R.results.length ? '<div><div class="cap" style="margin-bottom:4px">Wyniki agentów</div>' + R.results.map((r) => '<div class="ev"><span class="k" style="color:var(--gold)">' + esc(r.who) + '</span><br>' + esc(r.text) + '</div>').join('') + '</div>' : '');
}

viewer.onTick = () => render(false);

(async () => {
  const runs = await refreshRuns();
  const want = params.get('run') || (runs.find((r) => r.run === 'repo-fix') || runs[0] || {}).run;
  if (want) await openRun(want);
  else renderMatch();
  setInterval(refreshRuns, 5000);
})();
