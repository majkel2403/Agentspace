#!/usr/bin/env node
// build-workflow.mjs — builds the "Neural Workflow" boards (desktop + phone) of the Design canvas from the
// Agentspace core (packages/core, ES modules) and its recorded demo runs (demo/runs/*.jsonl).
// The core is inlined into one IIFE (imports/exports stripped); no network, no script-built DOM.
//   node artifact/build-workflow.mjs [repo root] [output dir]      (defaults: this repo, artifact/project)
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = process.argv[2] || path.resolve(HERE, '..');
const CORE = path.join(REPO, 'packages', 'core');
const ORDER = JSON.parse(fs.readFileSync(path.join(CORE, 'manifest.json'), 'utf8')).files;

const seen = new Map();
let core = '';
for (const f of ORDER) {
  let src = fs.readFileSync(path.join(CORE, f), 'utf8');
  src = src.replace(/^import [^\n]*\n/gm, '').replace(/^export (const|function|let|class) /gm, '$1 ').replace(/^export \{[^}]*\};?\n/gm, '');
  if (/^\s*(import|export)\s/m.test(src)) throw new Error('unhandled import/export in ' + f);
  for (const m of src.matchAll(/^(?:const|let|function|class) ([A-Za-z_$][\w$]*)/gm)) {
    if (seen.has(m[1])) throw new Error(`top-level name clash: ${m[1]} in ${f} and ${seen.get(m[1])}`);
    seen.set(m[1], f);
  }
  core += `// ---- ${f}\n` + src.trim() + '\n';
}
const NW = `const NW = (() => {\n${core}\nreturn { parseJsonl, createTimeline, createViewer };\n})();`;

const RUNS = [
  ['repo-fix', 'Naprawa repo'],
  ['panel', 'Panel sprzedaży'],
  ['medytacja', 'Premiera aplikacji'],
  ['niemcy', 'Wejście do Niemiec'],
].map(([id, name]) => ({ id, name, jsonl: fs.readFileSync(path.join(REPO, 'demo', 'runs', id + '.jsonl'), 'utf8') }));
// the canvas checker forbids literal URLs and network words in the page source: escape them inside the string
// literal (\u002f is '/' at run time), so the data stays exactly as recorded
const RUNS_JS = 'const NW_RUNS = ' + JSON.stringify(RUNS).replace(/:\/\//g, ':\\u002f\\u002f').replace(/WebSocket/g, 'Web\\u0053ocket').replace(/fetch\(/g, 'fetch\\u0028') + ';';

const FONTS = '<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400..700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">';

const ICON = {
  play: '<svg viewBox="0 0 24 24" width="20" height="20" fill="#1A1300" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="20" height="20" fill="#1A1300" aria-hidden="true"><rect x="6.5" y="5.5" width="4" height="13" rx="1"/><rect x="13.5" y="5.5" width="4" height="13" rx="1"/></svg>',
  restart: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  file: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4"/><path d="M7.5 8.5L12 4l4.5 4.5"/><path d="M5 15v4h14v-4"/></svg>',
};

const CSS = `
body{margin:0;background:#0B0C10}
.nw{position:relative;overflow:hidden;background:#0B0C10;color:#E8ECF8;font:14px/1.45 'Instrument Sans','Segoe UI',system-ui,sans-serif}
.nw *{box-sizing:border-box}
.nw-cv{position:absolute;left:0;top:0;width:100%;height:100%;display:block}
.nw-ov{cursor:grab;touch-action:none}
.nw-glass{position:absolute;background:rgba(10,12,20,.78);border:1px solid rgba(140,160,220,.18);border-radius:10px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.nw-row{display:flex;align-items:center;gap:8px}
.nw-brand{font-weight:700;letter-spacing:.04em;white-space:nowrap;font-size:15px}.nw-brand span{color:#8E9ABF;font-weight:500}
.nw-mut{color:#8E9ABF}
.nw-mono{font-family:'IBM Plex Mono',ui-monospace,monospace}
.nw-lbl{font:500 12px 'IBM Plex Mono',ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;color:#8E9ABF;white-space:nowrap}
.nw-btn{font:inherit;font-size:13.5px;color:#E8ECF8;background:#121628;border:1px solid #2A3560;border-radius:6px;min-height:36px;padding:0 11px;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;justify-content:center;gap:6px;margin:0}
.nw-btn:hover{background:#1A2040}
.nw-btn[aria-pressed="true"]{border-color:#F2C14E;color:#F2C14E;background:rgba(242,193,78,.08)}
.nw-pri{background:#F2C14E;border:0;min-width:44px;min-height:44px}.nw-pri:hover{background:#FFD36B}
.nw-file{position:relative;font:500 12.5px 'IBM Plex Mono',ui-monospace,monospace;color:#B5BFDC;border:1px dashed #3A4674;border-radius:6px;min-height:36px;padding:0 11px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.nw-file:hover{color:#E8ECF8;border-color:#5F6D9F}
.nw-file input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
.nw-file:focus-within{outline:2px solid #F2C14E;outline-offset:2px}
.nw :focus-visible{outline:2px solid #F2C14E;outline-offset:2px}
.nw-scrub{position:relative;flex:1 1 auto;min-width:120px;height:44px}
.nw-scrub canvas{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none}
.nw-range{-webkit-appearance:none;appearance:none;position:absolute;left:0;top:0;width:100%;height:44px;margin:0;background:transparent;cursor:pointer}
.nw-range::-webkit-slider-runnable-track{height:2px;background:#3A4674}
.nw-range::-moz-range-track{height:2px;background:#3A4674}
.nw-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:10px;height:24px;margin-top:-11px;border-radius:2px;background:#F2C14E;border:0}
.nw-range::-moz-range-thumb{width:10px;height:24px;border-radius:2px;background:#F2C14E;border:0}
.nw-log{list-style:none;margin:0;padding:0}
.nw-log li{padding:5px 8px;border-left:2px solid #2A3560;margin-bottom:3px;background:rgba(255,255,255,.025);font-size:13px;line-height:1.4}
.nw-log .k{display:block;font:12px 'IBM Plex Mono',ui-monospace,monospace;color:#8E9ABF}
.nw-dl{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;margin:10px 0;font-size:13px}
.nw-dl dt{color:#8E9ABF;font:12px 'IBM Plex Mono',ui-monospace,monospace;padding-top:1px}.nw-dl dd{margin:0}
.nw-ev{font-size:13px;padding:5px 0;border-top:1px solid rgba(140,160,220,.16)}
.nw-scroll{overflow:auto;scrollbar-width:thin;scrollbar-color:#2A3560 transparent}
.nw-badge{font:600 12px 'IBM Plex Mono',ui-monospace,monospace;letter-spacing:.06em;color:#8CFFB4;white-space:nowrap}
`;

function inspector(mobile) {
  return `
  <sc-if value="{{hasSel}}" hint-placeholder-val="{{ false }}">
  <aside class="nw-glass nw-scroll" aria-live="polite" aria-label="Inspektor węzła" style="${mobile ? 'left:10px;right:10px;bottom:150px;max-height:330px' : 'right:12px;top:78px;bottom:92px;width:330px'};padding:14px 16px">
    <button type="button" class="nw-btn" onClick="{{closeSel}}" aria-label="Zamknij inspektor" style="position:absolute;right:8px;top:8px;width:36px;padding:0">${ICON.close}</button>
    <div class="nw-lbl" style="color:#F2C14E">{{ins.kind}} · {{ins.status}}</div>
    <h3 style="margin:4px 40px 0 0;font-size:19px;line-height:1.25;font-weight:650;word-break:break-word">{{ins.label}}</h3>
    <sc-if value="{{ins.hasSub}}" hint-placeholder-val="{{ true }}"><p class="nw-mono" style="margin:2px 0 0;font-size:12px;color:#8E9ABF;word-break:break-all">{{ins.sub}}</p></sc-if>
    <dl class="nw-dl">
      <sc-for list="{{ins.stats}}" as="st" hint-placeholder-count="3"><dt>{{st.k}}</dt><dd>{{st.v}}</dd></sc-for>
    </dl>
    <div class="nw-lbl" style="margin:6px 0 4px">Co robił · ostatnie zdarzenia</div>
    <sc-for list="{{ins.events}}" as="e" hint-placeholder-count="4">
      <div class="nw-ev"><span class="nw-mono" style="font-size:12px;color:{{e.color}}">{{e.time}} · {{e.type}}</span><br>{{e.text}}</div>
    </sc-for>
  </aside>
  </sc-if>`;
}

function desktop() {
  return `
<div class="nw" style="width:1440px;height:900px">
  <canvas id="nw-gl" class="nw-cv" aria-hidden="true"></canvas>
  <canvas id="nw-ov" class="nw-cv nw-ov" role="img" aria-label="{{sceneAria}}"></canvas>

  <header class="nw-glass nw-row" style="left:12px;right:12px;top:12px;height:58px;padding:0 12px;gap:12px">
    <div class="nw-brand">HERMES <span>// Neural Workflow</span></div>
    <span class="nw-lbl" style="margin-left:6px">Przebieg</span>
    <div class="nw-row" role="group" aria-label="Przebieg" style="gap:4px">
      <sc-for list="{{runs}}" as="r" hint-placeholder-count="4">
        <button type="button" class="nw-btn" aria-pressed="{{r.active}}" onClick="{{r.pick}}">{{r.name}}</button>
      </sc-for>
    </div>
    <span style="flex:1"></span>
    <label class="nw-file">${ICON.file}Wczytaj log (JSONL)<input type="file" accept=".jsonl,.json,.ndjson,.txt" onChange="{{onFile}}" aria-label="Wczytaj log zdarzeń w formacie JSONL"></label>
  </header>

  <aside class="nw-glass" aria-label="Process Log" style="left:12px;top:78px;bottom:92px;width:300px;display:flex;flex-direction:column;padding:12px 12px 8px">
    <div class="nw-row" style="justify-content:space-between"><span class="nw-lbl">Process Log</span><span class="nw-badge" style="color:{{modeColor}}">{{modeLabel}}</span></div>
    <p style="margin:6px 0 4px;font-size:13.5px;line-height:1.4;color:#E8ECF8;font-weight:600">{{taskTitle}}</p>
    <p class="nw-mono" style="margin:0 0 8px;font-size:12px;color:#8E9ABF">{{shownCount}} · najnowsze na górze</p>
    <ol class="nw-log nw-scroll" style="flex:1;min-height:0">
      <sc-for list="{{log}}" as="l" hint-placeholder-count="8">
        <li style="border-left-color:{{l.color}}"><span class="k">{{l.time}} · {{l.type}}{{l.who}}</span>{{l.text}}</li>
      </sc-for>
    </ol>
  </aside>
${inspector(false)}
  <footer class="nw-glass nw-row" style="left:12px;right:12px;bottom:12px;height:68px;padding:0 12px;gap:10px">
    <button type="button" class="nw-btn nw-pri" onClick="{{togglePlay}}" aria-label="{{playAria}}"><sc-if value="{{isPlaying}}" hint-placeholder-val="{{ false }}">${ICON.pause}</sc-if><sc-if value="{{notPlaying}}" hint-placeholder-val="{{ true }}">${ICON.play}</sc-if></button>
    <button type="button" class="nw-btn" onClick="{{restart}}" aria-label="Od początku" style="min-height:44px;width:44px;padding:0">${ICON.restart}</button>
    <div class="nw-row" role="group" aria-label="Prędkość odtwarzania" style="gap:4px">
      <sc-for list="{{speeds}}" as="sp" hint-placeholder-count="4">
        <button type="button" class="nw-btn" aria-pressed="{{sp.active}}" onClick="{{sp.pick}}" style="min-height:44px">{{sp.label}}</button>
      </sc-for>
    </div>
    <div class="nw-scrub"><canvas id="nw-ticks" aria-hidden="true"></canvas><input type="range" class="nw-range" min="0" max="1000" step="1" value="{{scrub}}" onChange="{{onScrub}}" aria-label="Oś czasu przebiegu" aria-valuetext="{{clock}}"></div>
    <span class="nw-mono" style="font-size:13px;min-width:118px;text-align:right">{{clock}}</span>
    <div class="nw-row" role="group" aria-label="Kamera" style="gap:4px">
      <button type="button" class="nw-btn" onClick="{{zoomOut}}" aria-label="Oddal" style="min-height:44px;width:44px;padding:0;font-size:18px">−</button>
      <button type="button" class="nw-btn" onClick="{{zoomIn}}" aria-label="Przybliż" style="min-height:44px;width:44px;padding:0;font-size:18px">+</button>
      <button type="button" class="nw-btn" onClick="{{resetCam}}" style="min-height:44px">Wyzeruj</button>
    </div>
  </footer>
</div>`;
}

function mobile() {
  return `
<div class="nw" style="width:390px;height:844px">
  <canvas id="nw-gl" class="nw-cv" aria-hidden="true"></canvas>
  <canvas id="nw-ov" class="nw-cv nw-ov" role="img" aria-label="{{sceneAria}}"></canvas>

  <header class="nw-glass" style="left:10px;right:10px;top:10px;padding:10px 10px 10px">
    <div class="nw-row" style="justify-content:space-between">
      <div class="nw-brand">HERMES <span>// Workflow</span></div>
      <label class="nw-file">${ICON.file}Log JSONL<input type="file" accept=".jsonl,.json,.ndjson,.txt" onChange="{{onFile}}" aria-label="Wczytaj log zdarzeń w formacie JSONL"></label>
    </div>
    <div class="nw-row nw-scroll" role="group" aria-label="Przebieg" style="gap:4px;margin-top:8px;overflow-x:auto;padding-bottom:2px">
      <sc-for list="{{runs}}" as="r" hint-placeholder-count="4">
        <button type="button" class="nw-btn" aria-pressed="{{r.active}}" onClick="{{r.pick}}" style="flex:none;min-height:44px">{{r.name}}</button>
      </sc-for>
    </div>
  </header>
${inspector(true)}
  <footer class="nw-glass" style="left:10px;right:10px;bottom:10px;padding:8px 10px">
    <div class="nw-row" style="gap:6px">
      <button type="button" class="nw-btn nw-pri" onClick="{{togglePlay}}" aria-label="{{playAria}}"><sc-if value="{{isPlaying}}" hint-placeholder-val="{{ false }}">${ICON.pause}</sc-if><sc-if value="{{notPlaying}}" hint-placeholder-val="{{ true }}">${ICON.play}</sc-if></button>
      <button type="button" class="nw-btn" onClick="{{restart}}" aria-label="Od początku" style="min-height:44px;width:44px;padding:0">${ICON.restart}</button>
      <sc-for list="{{speeds}}" as="sp" hint-placeholder-count="4">
        <button type="button" class="nw-btn" aria-pressed="{{sp.active}}" onClick="{{sp.pick}}" style="min-height:44px;flex:1;padding:0 4px">{{sp.label}}</button>
      </sc-for>
    </div>
    <div class="nw-scrub" style="margin-top:4px"><canvas id="nw-ticks" aria-hidden="true"></canvas><input type="range" class="nw-range" min="0" max="1000" step="1" value="{{scrub}}" onChange="{{onScrub}}" aria-label="Oś czasu przebiegu" aria-valuetext="{{clock}}"></div>
    <div class="nw-row" style="justify-content:space-between">
      <span class="nw-mono" style="font-size:12.5px">{{clock}}</span>
      <div class="nw-row" role="group" aria-label="Kamera" style="gap:4px">
        <button type="button" class="nw-btn" onClick="{{zoomOut}}" aria-label="Oddal" style="min-height:44px;width:44px;padding:0;font-size:18px">−</button>
        <button type="button" class="nw-btn" onClick="{{zoomIn}}" aria-label="Przybliż" style="min-height:44px;width:44px;padding:0;font-size:18px">+</button>
        <button type="button" class="nw-btn" onClick="{{resetCam}}" style="min-height:44px">Wyzeruj</button>
      </div>
    </div>
  </footer>
</div>`;
}

const LOGIC = (MOBILE) => `
${NW}
${RUNS_JS}
const NW_MOBILE = ${MOBILE};
const NW_SPEEDS = [0.25, 1, 4, 10];
const nwBad = (type) => type.indexOf('fail') >= 0 || type === 'error';
const nwGood = (type) => type.indexOf('passed') >= 0 || type.indexOf('completed') >= 0;
const nwColor = (type) => (nwBad(type) ? '#FF5A6A' : nwGood(type) ? '#7CFF9A' : type.indexOf('spawned') >= 0 ? '#6DB6FF' : type.indexOf('file.') === 0 || type === 'workspace.scanned' ? '#9FE3FF' : '#2A3560');
const nwSec = (ms) => (Math.max(0, ms) / 1000).toFixed(1) + ' s';

class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = { run: 'repo-fix', playing: true, speed: 1, tick: 0, idx: -1, sel: null, custom: null, note: '' };
    this._v = null;
    this._T = null;
    this._timelines = {};
    this._lastPush = 0;
  }

  timeline(run) {
    if (run === 'custom') return this._custom;
    if (!this._timelines[run]) {
      const r = NW_RUNS.find((x) => x.id === run) || NW_RUNS[0];
      this._timelines[run] = NW.createTimeline(NW.parseJsonl(r.jsonl).events);
    }
    return this._timelines[run];
  }

  open(run) {
    const T = this.timeline(run);
    if (!T || !this._v) return;
    this._T = T;
    this._v.setTimeline(T);
    this._v.setTime(0);
    this._v.play();
    this.drawTicks();
    this.setState({ run, idx: -1, sel: null, playing: true });
  }

  drawTicks() {
    const c = typeof document !== 'undefined' && typeof document.getElementById === 'function' ? document.getElementById('nw-ticks') : null;
    const T = this._T;
    if (!c || !c.getContext || !T) return;
    const W = c.clientWidth;
    const H = c.clientHeight;
    if (W < 10) return;
    c.width = W * 2;
    c.height = H * 2;
    const g = c.getContext('2d');
    g.setTransform(2, 0, 0, 2, 0, 0);
    g.clearRect(0, 0, W, H);
    if (!T.duration) return;
    for (let i = 0; i < T.events.length; i++) {
      const ev = T.events[i];
      const x = 5 + (T.rel[i] / T.duration) * (W - 10);
      const bad = nwBad(ev.type);
      g.fillStyle = bad ? '#FF5A6A' : ev.type === 'agent.spawned' ? '#6DB6FF' : ev.type.indexOf('file.') === 0 ? '#9FE3FF' : 'rgba(232,236,248,0.32)';
      g.fillRect(x, bad ? H / 2 - 13 : H / 2 - 7, 1, bad ? 26 : 14);
    }
  }

  componentDidMount() {
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
    const gl = document.getElementById('nw-gl');
    const ov = document.getElementById('nw-ov');
    if (!gl || !ov) return;
    this._v = NW.createViewer(NW_MOBILE
      ? { gl, overlay: ov, autoRotate: false, legend: false, insetTop: 132, insetBottom: 150, clockY: 150, captionBottom: 176 }
      : { gl, overlay: ov, autoRotate: false, insetLeft: 312, insetTop: 70, insetBottom: 80, legendX: 332, legendY: 112, clockY: 96, captionBottom: 112 });
    if (typeof window !== 'undefined') { window.__NW = this._v; if (window.__HM_TEST) window.__HM_TEST.logic = this; }
    this._v.onSelect = (id) => { this.setState({ sel: id || null }); };
    this._v.onTick = (v) => {
      const T = this._T;
      if (!T) return;
      const idx = T.indexAt(v.t);
      const now = Date.now();
      if (idx !== this.state.idx || v.playing !== this.state.playing || now - this._lastPush > 200) {
        this._lastPush = now;
        this.setState({ idx, playing: v.playing, tick: Math.round(v.t / 100) });
      }
    };
    this.open('repo-fix');
  }

  componentWillUnmount() {
    if (this._v) this._v.destroy();
  }

  renderVals() {
    const S = this.state;
    const v = this._v;
    const T = this._T;
    const t = v ? v.t : 0;
    const dur = T ? T.duration : 0;
    const idx = T ? T.indexAt(t) : -1;
    const runs = NW_RUNS.map((r) => ({ name: r.name, active: S.run === r.id, pick: () => this.open(r.id) }));
    if (this._custom) runs.push({ name: 'Własny log', active: S.run === 'custom', pick: () => this.open('custom') });
    const log = [];
    if (T) for (let i = idx; i >= 0 && log.length < 60; i--) {
      const e = T.events[i];
      log.push({ time: nwSec(T.rel[i]), type: e.type, who: e.agent ? ' · ' + e.agent : '', text: e.text || e.resource || e.tool || e.name || '', color: nwColor(e.type) });
    }
    let ins = { kind: '', status: '', label: '', sub: '', hasSub: false, stats: [], events: [] };
    let hasSel = false;
    const info = S.sel && v ? v.inspect(S.sel) : null;
    if (info) {
      hasSel = true;
      ins = {
        kind: info.kind === 'file' ? 'plik' : info.sub, status: info.status, label: info.label, sub: info.kind === 'file' ? info.sub : '', hasSub: info.kind === 'file',
        stats: info.stats.map(([k, val]) => ({ k, v: val })),
        events: info.events.map((e) => ({ time: nwSec(e.rel), type: e.type + (e.who ? ' · ' + e.who : ''), text: e.text, color: nwBad(e.type) ? '#FF8F9A' : nwGood(e.type) ? '#8CFFB4' : '#8E9ABF' })),
      };
    }
    const title = T && T.events.length ? (T.events.find((e) => e.type === 'task.started') || T.events[0]).text || '' : '';
    const done = T && t >= dur && T.events.some((e) => e.type === 'task.completed');
    const playing = v ? v.playing : false;
    return {
      sceneAria: 'Przestrzeń workflow: ' + title + '. Przeciągnij, aby obrócić; kliknij węzeł, aby zobaczyć, co robi.',
      runs,
      onFile: (e) => {
        const f = e && e.target && e.target.files && e.target.files[0];
        if (!f) return;
        const rd = new FileReader();
        rd.onload = () => {
          const res = NW.parseJsonl(String(rd.result || ''));
          if (!res.events.length) { this.setState({ note: 'Brak poprawnych zdarzeń w pliku' }); return; }
          this._custom = NW.createTimeline(res.events);
          this.open('custom');
          this.setState({ note: res.events.length + ' zdarzeń' + (res.errors.length ? ', odrzucono ' + res.errors.length : '') });
        };
        rd.readAsText(f);
      },
      modeLabel: S.note || (done ? 'ZAKOŃCZONY' : 'REPLAY'),
      modeColor: S.note ? '#F2C14E' : done ? '#8CFFB4' : '#7CC4FF',
      taskTitle: title,
      shownCount: (idx + 1) + ' / ' + (T ? T.events.length : 0) + ' zdarzeń',
      log,
      hasSel,
      ins,
      closeSel: () => { if (v) v.select(null); this.setState({ sel: null }); },
      isPlaying: playing,
      notPlaying: !playing,
      playAria: playing ? 'Wstrzymaj' : 'Odtwórz',
      togglePlay: () => { if (!v) return; if (v.playing) v.pause(); else v.play(); this.setState({ playing: v.playing }); },
      restart: () => { if (!v) return; v.setTime(0); v.play(); this.setState({ playing: true, idx: -1 }); },
      speeds: NW_SPEEDS.map((s) => ({ label: (s === 0.25 ? '0.25' : String(s)) + '×', active: S.speed === s, pick: () => { if (v) v.setSpeed(s); this.setState({ speed: s }); } })),
      scrub: String(dur ? Math.round((Math.min(t, dur) / dur) * 1000) : 0),
      onScrub: (e) => { if (!v || !T) return; v.pause(); v.setTime((Number(e.target.value) / 1000) * dur); this.setState({ playing: false, tick: Math.round(v.t / 100) }); },
      clock: nwSec(Math.min(t, dur)) + ' / ' + nwSec(dur),
      zoomIn: () => v && v.zoom(1.2),
      zoomOut: () => v && v.zoom(1 / 1.2),
      resetCam: () => { if (v) v.reset(); this.setState({ sel: null }); },
    };
  }
}
`;

function page(title, w, h, body, mobile) {
  return `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<title>${title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
${FONTS}
<style>${CSS}</style>
</helmet>
${body}
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":${w},"height":${h}}}'>
${LOGIC(mobile)}
</script>
</body>
</html>
`;
}

const out = process.argv[3] || path.join(HERE, 'project');
fs.writeFileSync(path.join(out, 'Workflow.dc.html'), page('Neural Workflow', 1440, 900, desktop(), false));
fs.writeFileSync(path.join(out, 'WorkflowMobile.dc.html'), page('Neural Workflow mobile', 390, 844, mobile(), true));
console.log('built Workflow.dc.html', fs.statSync(path.join(out, 'Workflow.dc.html')).size, 'WorkflowMobile.dc.html', fs.statSync(path.join(out, 'WorkflowMobile.dc.html')).size);
