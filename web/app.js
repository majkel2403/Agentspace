// Viewer page: REPLAY of recorded runs (from the Event Store) and LIVE following of a running task.
import { parseJsonl, validateEvent, createTimeline, KINDS } from '/packages/core/index.js';
import { createViewer } from '/packages/core/render/viewer.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const wide = () => window.innerWidth > 900;
const viewer = createViewer({ gl: $('gl'), overlay: $('ov'), opening: params.get('opening') || 'orb', title: 'Hermes · Neural Workflow', hideTitle: true, insetLeft: wide() ? 300 : 0, legendX: wide() ? 310 : 14, legendY: 132, clockY: 128 });
window.__NW = viewer;
let T = null;
let ws = null;
let logShown = -1;

function setOpening(o) {
  viewer.setOpening(o);
  $('op-orb').setAttribute('aria-pressed', String(o === 'orb'));
  $('op-graph').setAttribute('aria-pressed', String(o === 'graph'));
}
$('op-orb').onclick = () => { setOpening('orb'); viewer.setTime(0); viewer.play(); };
$('op-graph').onclick = () => { setOpening('graph'); viewer.setTime(0); viewer.play(); };
setOpening(viewer.opening);

function load(events, opts) {
  T = createTimeline(events);
  viewer.setTimeline(T);
  viewer.setTime(opts && opts.at != null ? opts.at : 0);
  logShown = -1;
  $('log-list').innerHTML = '';
  drawTicks();
  if (!opts || opts.play !== false) viewer.play();
}

async function openRun(run) {
  if (ws) { ws.close(); ws = null; }
  const txt = await (await fetch('/api/runs/' + encodeURIComponent(run))).text();
  const { events } = parseJsonl(txt);
  const live = (await (await fetch('/api/runs')).json()).find((r) => r.run === run);
  const isLive = live && live.status === 'running' && live.source === 'recorded';
  load(events, { play: true });
  $('live').hidden = !isLive;
  viewer.setLive(isLive);
  if (isLive) followLive(run);
}

function followLive(run) {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/live?run=' + encodeURIComponent(run));
  ws.onmessage = (m) => {
    const r = validateEvent(JSON.parse(m.data));
    if (!r.ok) return;
    if (!T) return load([r.event]);
    if (T.events.length && r.event.ts < T.events[T.events.length - 1].ts) return;
    const atEnd = viewer.t >= T.duration - 50;
    T.append(r.event);
    if (atEnd) viewer.setTime(T.duration);
    drawTicks();
  };
}

async function refreshRuns(select) {
  const runs = await (await fetch('/api/runs')).json();
  const sel = $('run');
  sel.innerHTML = '';
  runs.sort((a, b) => b.startedAt - a.startedAt).forEach((r) => {
    const o = document.createElement('option');
    o.value = r.run;
    o.textContent = (r.status === 'running' ? '● ' : '') + r.title.slice(0, 60) + ' · ' + r.source;
    sel.appendChild(o);
  });
  if (select) sel.value = select;
  return runs;
}
$('run').onchange = () => openRun($('run').value);

$('file').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const { events, errors } = parseJsonl(await f.text());
  $('status').textContent = events.length + ' zdarzeń' + (errors.length ? ', odrzucono ' + errors.length : '');
  if (events.length) { if (ws) ws.close(); $('live').hidden = true; load(events); }
};

// ---- transport
$('play').onclick = () => (viewer.playing ? viewer.pause() : viewer.play());
$('restart').onclick = () => { viewer.setTime(0); viewer.play(); };
document.querySelectorAll('[data-speed]').forEach((b) => { b.onclick = () => { viewer.setSpeed(Number(b.dataset.speed)); document.querySelectorAll('[data-speed]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }; });
$('t').oninput = (e) => { if (!T) return; viewer.setLive(false); viewer.pause(); viewer.setTime((Number(e.target.value) / 1000) * T.duration); };
$('zi').onclick = () => viewer.zoom(1.2);
$('zo').onclick = () => viewer.zoom(1 / 1.2);
$('reset').onclick = () => viewer.reset();
$('close-ins').onclick = () => { $('inspector').hidden = true; viewer.sel = null; };
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.code === 'Space') { e.preventDefault(); $('play').click(); }
  if (e.key === 'Escape') $('close-ins').click();
});

function drawTicks() {
  const c = $('ticks');
  const W = c.clientWidth; const H = c.clientHeight;
  c.width = W * 2; c.height = H * 2;
  const g = c.getContext('2d');
  g.scale(2, 2);
  if (!T || !T.duration) return;
  T.events.forEach((ev, i) => {
    const x = 5 + (T.rel[i] / T.duration) * (W - 10);
    const bad = ev.type.includes('fail') || ev.type === 'error';
    g.fillStyle = bad ? '#FF5A6A' : ev.type.startsWith('agent.spawned') ? '#6DB6FF' : ev.type.startsWith('file') ? '#9FE3FF' : 'rgba(232,236,248,0.35)';
    g.fillRect(x, bad ? 4 : 10, 1, bad ? 26 : 14);
  });
}
function fitChrome() {
  const top = document.querySelector('.bar.top').getBoundingClientRect().bottom;
  const w = wide();
  viewer.setInsets({ insetLeft: w ? 300 : 0, legendX: w ? 310 : 14, legendY: w ? Math.max(132, top + 40) : top + 42, clockY: w ? Math.max(128, top + 36) : top + 22, captionBottom: (window.innerHeight - document.querySelector('.bar.bottom').getBoundingClientRect().top) + 40 });
}
fitChrome();
window.addEventListener('resize', () => { drawTicks(); fitChrome(); });

// ---- inspector + process log
viewer.onSelect = (id, n) => {
  if (!id || !n || !T) { $('inspector').hidden = true; return; }
  const evs = T.events.map((e, i) => ({ e, i })).filter(({ e }) => {
    const ids = [e.agent && 'agent:' + e.agent, e.tool && 'tool:' + e.agent + ':' + e.tool, e.resource && ('file:' + e.resource), e.resource && ('res:' + e.resource), e.name && ('test:' + e.agent + ':' + e.name)];
    return ids.includes(id) || (id === 'hermes' && (e.type.startsWith('hermes') || e.type.startsWith('task') || e.agent === 'hermes'));
  }).slice(-12);
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  $('ins').innerHTML = '<div class="kind">' + esc((KINDS[n.kind] || {}).label || n.kind) + ' · ' + esc(n.status) + '</div><h3>' + esc(n.label) + '</h3>' +
    '<dl><dt>zdarzenia</dt><dd>' + n.hits + '</dd><dt>tokeny</dt><dd>' + n.tokens + '</dd><dt>latencja</dt><dd>' + (n.latencyMs ? n.latencyMs + ' ms' : '—') + '</dd><dt>pewność</dt><dd>' + (n.confidence != null ? Math.round(n.confidence * 100) + '%' : '—') + '</dd></dl>' +
    (n.text ? '<p>' + esc(n.text) + '</p>' : '') + evs.map(({ e, i }) => '<div class="ev"><span class="k">' + (T.rel[i] / 1000).toFixed(1) + ' s · ' + esc(e.type) + '</span><br>' + esc(e.text || e.resource || e.tool || '') + '</div>').join('');
  $('inspector').hidden = false;
};

viewer.onTick = (v) => {
  if (!T) return;
  $('t').value = String(Math.round((Math.min(v.t, T.duration) / (T.duration || 1)) * 1000));
  $('play').textContent = v.playing ? '❚❚' : '▶';
  $('play').setAttribute('aria-label', v.playing ? 'Wstrzymaj' : 'Odtwórz');
  $('clock').textContent = (Math.min(v.t, T.duration) / 1000).toFixed(1) + ' / ' + (T.duration / 1000).toFixed(1) + ' s';
  const upto = T.indexAt(v.t);
  if (upto !== logShown) {
    const list = $('log-list');
    if (upto < logShown) { list.innerHTML = ''; logShown = -1; }
    for (let i = logShown + 1; i <= upto; i++) {
      const e = T.events[i];
      const li = document.createElement('li');
      li.className = e.type.includes('fail') || e.type === 'error' ? 'err' : e.type.includes('passed') || e.type.includes('completed') ? 'ok' : '';
      li.innerHTML = '<span class="k">' + (T.rel[i] / 1000).toFixed(1) + ' s · ' + e.type + (e.agent ? ' · ' + e.agent : '') + '</span><br>';
      li.appendChild(document.createTextNode(e.text || e.resource || e.tool || e.name || ''));
      list.appendChild(li);
    }
    logShown = upto;
    list.parentElement.scrollTop = list.parentElement.scrollHeight;
  }
};

(async () => {
  const runs = await refreshRuns();
  const want = params.get('run') || (runs.find((r) => r.run === 'repo-fix') || runs[0] || {}).run;
  if (want) { $('run').value = want; await openRun(want); }
  setInterval(() => refreshRuns($('run').value), 5000);
})();
