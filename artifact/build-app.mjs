#!/usr/bin/env node
// build-app.mjs — the Hermes app boards of the Design canvas (desktop Hermes.dc.html, phone HermesMobile.dc.html):
// one application for the whole story — the order and the run picker, the Gource-style workspace with the studio
// (team, plan, editor, terminal, conversations), the process log / conversations / files, the inspector, the
// final report, and the transport. Visual language of the command centre ("night dispatch room"): ink panels,
// hairlines, gold for Hermes, Bricolage Grotesque / Instrument Sans / IBM Plex Mono.
//   node artifact/build-app.mjs [repo root] [output dir]      (defaults: this repo, artifact/project)
import fs from 'node:fs';
import path from 'node:path';
import { coreBundle, runsScript } from './bundle-core.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = process.argv[2] || path.resolve(HERE, '..');
const NW = coreBundle(REPO);
const RUNS_JS = runsScript(REPO, [
  ['repo-fix', 'Naprawa repo'],
  ['panel', 'Panel sprzedaży'],
  ['medytacja', 'Premiera aplikacji'],
  ['niemcy', 'Wejście do Niemiec'],
]);

const FONTS = '<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Instrument+Sans:wght@400..700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">';

const I = (d, size = 18, extra = '') => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${d}</svg>`;
const ICON = {
  mark: '<svg viewBox="0 0 32 32" width="24" height="24" fill="none" stroke="#F2C14E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="16" cy="16" r="5"/><path d="M11 15C8 14.5 5.5 12.8 3.5 9.5"/><path d="M11 18C8.5 18.2 6 17.5 4 15.5"/><path d="M21 15C24 14.5 26.5 12.8 28.5 9.5"/><path d="M21 18C23.5 18.2 26 17.5 28 15.5"/><path d="M16 21v7"/></svg>',
  play: '<svg viewBox="0 0 24 24" width="20" height="20" fill="#1A1300" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="20" height="20" fill="#1A1300" aria-hidden="true"><rect x="6.5" y="5.5" width="4" height="13" rx="1"/><rect x="13.5" y="5.5" width="4" height="13" rx="1"/></svg>',
  launch: '<svg viewBox="0 0 24 24" width="18" height="18" fill="#1A1300" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
  restart: I('<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/>'),
  close: I('<path d="M6 6l12 12M18 6L6 18"/>', 16),
  upload: I('<path d="M12 15V4"/><path d="M7.5 8.5L12 4l4.5 4.5"/><path d="M5 15v4h14v-4"/>', 16),
  report: I('<path d="M7 3.5h7l4 4V20.5H7z"/><path d="M14 3.5v4h4"/><path d="M10 12h5M10 15.5h5"/>', 16),
  follow: I('<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>'),
  fit: I('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
};

const CSS = `
body{margin:0;background:#04060D}
.hx{position:relative;overflow:hidden;background:#03050E;color:#E8ECF8;font:13.5px/1.45 'Instrument Sans','Segoe UI',system-ui,sans-serif}
.hx *{box-sizing:border-box}
.hx button{font-family:inherit;color:inherit}
.hx :focus-visible{outline:2px solid #F2C14E;outline-offset:2px}
.hx textarea::placeholder{color:#7F8BB3}
.hx-cv{position:absolute;left:0;width:100%;display:block}
.hx-ov{cursor:grab;touch-action:none}
.hx-bar{position:absolute;left:0;right:0;display:flex;align-items:center;background:#05080F;z-index:2}
.hx-mono{font-family:'IBM Plex Mono',ui-monospace,monospace}
.hx-panel{position:relative;display:flex;flex-direction:column;min-width:0;min-height:0;background:rgba(7,11,24,0.9);border:1px solid #1A2340;border-radius:6px;box-shadow:inset 0 0 0 1px rgba(109,182,255,0.03);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
.hx-ph{display:flex;align-items:center;gap:8px;flex:none;min-height:32px;padding:0 10px;border-bottom:1px solid #1A2340;font:500 12px 'IBM Plex Mono',ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;color:#C5CEE8;white-space:nowrap;overflow:hidden}
.hx-ph .d{color:#F2C14E}
.hx-ph .m{margin-left:auto;font-weight:400;letter-spacing:.04em;color:#7F8BB3;text-transform:none;overflow:hidden;text-overflow:ellipsis}
.hx-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:36px;padding:0 12px;margin:0;background:#0D1430;border:1px solid #2A3560;border-radius:6px;color:#E8ECF8;font:500 12px 'IBM Plex Mono',ui-monospace,monospace;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;white-space:nowrap}
.hx-btn:hover{background:#1D2850}
.hx-btn[aria-pressed="true"]{border-color:#F2C14E;color:#F2C14E;background:rgba(242,193,78,.08)}
.hx .hx-pri{background:#F2C14E;border:0;color:#1A1300}
.hx .hx-pri:hover{background:#FFD36B}
.hx-ico{width:44px;min-height:44px;padding:0}
.hx-file{position:relative}
.hx-file input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
.hx-file:focus-within{outline:2px solid #F2C14E;outline-offset:2px}
.hx-scroll{overflow:auto;scrollbar-width:thin;scrollbar-color:#2A3560 transparent}
.hx-row{display:block;width:100%;text-align:left;padding:7px 10px;margin:0;background:transparent;border:0;border-left:2px solid #2A3560;border-bottom:1px solid rgba(26,35,64,.7);color:#E8ECF8;font:inherit;cursor:default}
button.hx-row{cursor:pointer}
button.hx-row:hover{background:rgba(232,236,248,0.06)}
.hx-k{display:flex;gap:6px;font:12px 'IBM Plex Mono',ui-monospace,monospace;color:#7F8BB3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hx-tab{flex:1;min-height:36px;padding:0 6px;background:transparent;border:0;border-bottom:2px solid transparent;color:#A3AED0;font:500 12px 'IBM Plex Mono',ui-monospace,monospace;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;white-space:nowrap}
.hx-tab[aria-selected="true"]{color:#F2C14E;border-bottom-color:#F2C14E}
.hx-tab:hover{color:#E8ECF8}
.hx-run{display:flex;align-items:center;gap:8px;width:100%;min-height:40px;padding:6px 10px;margin:0;background:#070B18;border:1px solid #1A2340;border-radius:6px;color:#E8ECF8;font:inherit;text-align:left;cursor:pointer}
.hx-run:hover{background:#0D1430}
.hx-run[aria-pressed="true"]{border-color:#F2C14E;box-shadow:inset 3px 0 0 #F2C14E}
.hx-scrub{position:relative;flex:1 1 auto;min-width:120px;height:44px}
.hx-scrub canvas{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none}
.hx-range{-webkit-appearance:none;appearance:none;position:absolute;left:0;top:0;width:100%;height:44px;margin:0;background:transparent;cursor:pointer}
.hx-range::-webkit-slider-runnable-track{height:2px;background:transparent}
.hx-range::-moz-range-track{height:2px;background:transparent}
.hx-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:10px;height:26px;margin-top:-12px;border-radius:2px;background:#F2C14E;border:0;box-shadow:0 0 10px rgba(242,193,78,.8)}
.hx-range::-moz-range-thumb{width:10px;height:26px;border-radius:2px;background:#F2C14E;border:0}
.hx-dl{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;margin:10px 0;font-size:13px}
.hx-dl dt{color:#7F8BB3;font:12px 'IBM Plex Mono',ui-monospace,monospace;padding-top:1px}.hx-dl dd{margin:0}
.hx-md{white-space:pre-wrap;font:13px/1.55 'IBM Plex Mono',ui-monospace,monospace;color:#D9E1F2;margin:0}
.hx-in{animation:hx-in .35s ease-out both}
@keyframes hx-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes hx-blink{0%,100%{opacity:1}50%{opacity:.35}}
.hx-live{animation:hx-blink 1.6s ease-in-out infinite}
@media (prefers-reduced-motion: reduce){.hx-in,.hx-live{animation:none}}
`;

// ---------------------------------------------------------------------------------------------- shared pieces
const runList = (mobile) => `
      <div style="display:flex;flex-direction:column;gap:6px">
        <sc-for list="{{runs}}" as="r" hint-placeholder-count="4">
          <button type="button" class="hx-run" aria-pressed="{{r.active}}" onClick="{{r.pick}}">
            <span style="width:8px;height:8px;border-radius:50%;background:{{r.dot}};flex:none"></span>
            <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600">{{r.name}}</span>
            <span class="hx-mono" style="font-size:12px;color:#7F8BB3;flex:none">{{r.meta}}</span>
          </button>
        </sc-for>
      </div>`;

const composer = (mobile) => `
      <label for="hx-task-${mobile ? 'm' : 'd'}" class="hx-mono" style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#7F8BB3">Zadanie dla Hermesa</label>
      <textarea id="hx-task-${mobile ? 'm' : 'd'}" rows="3" value="{{taskText}}" onChange="{{onTask}}" placeholder="Opisz, co ma zostać zrobione…" style="width:100%;min-height:74px;padding:8px 10px;background:#04060D;border:1px solid #2A3560;border-radius:4px;color:#E8ECF8;font:13.5px/1.45 'Instrument Sans','Segoe UI',system-ui,sans-serif;resize:none"></textarea>
      <div style="display:flex;align-items:center;gap:10px">
        <button type="button" class="hx-btn hx-pri" onClick="{{launch}}" style="min-height:44px;padding:0 16px;font-size:12.5px">${ICON.launch}Uruchom Hermesa</button>
        <span style="font-size:12.5px;color:#A3AED0;line-height:1.35;min-width:0">{{matchNote}}</span>
      </div>`;

const lists = `
        <sc-if value="{{tabLog}}" hint-placeholder-val="{{ true }}">
          <ol style="list-style:none;margin:0;padding:0">
            <sc-for list="{{log}}" as="l" hint-placeholder-count="8">
              <li class="hx-row" style="border-left-color:{{l.color}}"><span class="hx-k"><span>{{l.time}}</span><span style="color:#A3AED0">{{l.type}}</span><span>{{l.who}}</span></span>{{l.text}}</li>
            </sc-for>
          </ol>
        </sc-if>
        <sc-if value="{{tabTalk}}" hint-placeholder-val="{{ false }}">
          <ol style="list-style:none;margin:0;padding:0">
            <sc-for list="{{talk}}" as="m" hint-placeholder-count="6">
              <li class="hx-row" style="border-left-color:{{m.color}}"><span class="hx-k"><span>{{m.time}}</span><span style="color:#E8ECF8;font-weight:600">{{m.from}}</span><span>→</span><span style="color:#E8ECF8;font-weight:600">{{m.to}}</span><span style="margin-left:auto;color:{{m.color}};text-transform:uppercase;letter-spacing:.06em">{{m.tone}}</span></span>{{m.text}}</li>
            </sc-for>
            <sc-if value="{{talkEmpty}}" hint-placeholder-val="{{ false }}"><li style="padding:12px 10px;color:#7F8BB3">Jeszcze nikt nie rozmawiał.</li></sc-if>
          </ol>
        </sc-if>
        <sc-if value="{{tabFiles}}" hint-placeholder-val="{{ false }}">
          <ol style="list-style:none;margin:0;padding:0">
            <sc-for list="{{files}}" as="f" hint-placeholder-count="6">
              <li><button type="button" class="hx-row" onClick="{{f.pick}}" style="border-left-color:{{f.color}}"><span class="hx-k"><span>{{f.time}}</span><span style="color:{{f.color}};text-transform:uppercase;letter-spacing:.06em">{{f.kind}}</span><span>{{f.who}}</span><span style="margin-left:auto;color:#8CFFB4">{{f.diff}}</span></span><span style="font-weight:600">{{f.name}}</span><span class="hx-mono" style="display:block;font-size:12px;color:#7F8BB3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{f.dir}}</span></button></li>
            </sc-for>
            <sc-if value="{{filesEmpty}}" hint-placeholder-val="{{ false }}"><li style="padding:12px 10px;color:#7F8BB3">Żaden plik nie został jeszcze utworzony ani zmieniony.</li></sc-if>
          </ol>
        </sc-if>`;

const tabs = `
        <div role="tablist" aria-label="Widok listy" style="display:flex;border-bottom:1px solid #1A2340;flex:none">
          <sc-for list="{{tabs}}" as="tb" hint-placeholder-count="3">
            <button type="button" role="tab" class="hx-tab" aria-selected="{{tb.on}}" onClick="{{tb.pick}}">{{tb.label}}</button>
          </sc-for>
        </div>`;

const inspector = (mobile) => `
  <sc-if value="{{hasSel}}" hint-placeholder-val="{{ false }}">
  <aside class="hx-panel hx-in" aria-live="polite" aria-label="Inspektor" style="position:absolute;z-index:3;${mobile ? 'left:10px;right:10px;bottom:166px;max-height:360px' : 'right:12px;top:70px;bottom:76px;width:380px'}">
    <div class="hx-ph" style="padding-right:44px"><span class="d">◆</span>Inspektor<span class="m">{{ins.kind}}</span></div>
    <button type="button" class="hx-btn hx-ico" onClick="{{closeSel}}" aria-label="Zamknij inspektor" style="position:absolute;right:4px;top:0;min-height:32px;width:36px;border:0;background:transparent">${ICON.close}</button>
    <div class="hx-scroll" style="padding:12px 14px;min-height:0;flex:1">
      <div class="hx-mono" style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#F2C14E">{{ins.status}}</div>
      <h3 style="margin:4px 0 0;font:700 20px/1.2 'Bricolage Grotesque','Segoe UI',system-ui,sans-serif;word-break:break-word">{{ins.label}}</h3>
      <sc-if value="{{ins.hasSub}}" hint-placeholder-val="{{ true }}"><p class="hx-mono" style="margin:2px 0 0;font-size:12px;color:#7F8BB3;word-break:break-all">{{ins.sub}}</p></sc-if>
      <dl class="hx-dl"><sc-for list="{{ins.stats}}" as="st" hint-placeholder-count="3"><dt>{{st.k}}</dt><dd>{{st.v}}</dd></sc-for></dl>
      <div class="hx-mono" style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#7F8BB3;margin:8px 0 2px">Co robił · ostatnie zdarzenia</div>
      <sc-for list="{{ins.events}}" as="e" hint-placeholder-count="4">
        <div style="padding:6px 0;border-top:1px solid #1A2340;font-size:13px"><span class="hx-mono" style="font-size:12px;color:{{e.color}}">{{e.time}} · {{e.type}}</span><br>{{e.text}}</div>
      </sc-for>
    </div>
  </aside>
  </sc-if>`;

const report = (mobile) => `
  <sc-if value="{{reportOpen}}" hint-placeholder-val="{{ false }}">
  <section class="hx-panel hx-in" role="dialog" aria-label="Raport z przebiegu" style="position:absolute;z-index:4;${mobile ? 'left:10px;right:10px;top:70px;bottom:10px' : 'left:372px;right:404px;top:84px;bottom:90px'};border-color:#3A4674;box-shadow:0 24px 80px rgba(0,0,0,.6)">
    <div class="hx-ph" style="padding-right:44px"><span class="d">◆</span>Raport<span class="m">{{report.run}}</span></div>
    <button type="button" class="hx-btn hx-ico" onClick="{{closeReport}}" aria-label="Zamknij raport" style="position:absolute;right:4px;top:0;min-height:32px;width:36px;border:0;background:transparent">${ICON.close}</button>
    <div class="hx-scroll" style="padding:16px 18px;min-height:0;flex:1;display:flex;flex-direction:column;gap:14px">
      <div>
        <div class="hx-mono" style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#8CFFB4">{{report.status}}</div>
        <h2 style="margin:4px 0 0;font:800 ${mobile ? 20 : 24}px/1.2 'Bricolage Grotesque','Segoe UI',system-ui,sans-serif">{{report.title}}</h2>
        <p style="margin:6px 0 0;color:#A3AED0">{{report.summary}}</p>
      </div>
      <ul style="list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(${mobile ? 2 : 4},minmax(0,1fr));gap:8px">
        <sc-for list="{{report.kpis}}" as="k" hint-placeholder-count="4">
          <li style="padding:8px 10px;background:#070B18;border:1px solid #1A2340;border-radius:6px"><span class="hx-mono" style="display:block;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#7F8BB3">{{k.label}}</span><span class="hx-mono" style="font-size:20px;font-weight:600">{{k.value}}</span></li>
        </sc-for>
      </ul>
      <sc-if value="{{report.hasDoc}}" hint-placeholder-val="{{ false }}">
        <div style="padding:12px 14px;background:#04060D;border:1px solid #1A2340;border-radius:6px"><div class="hx-mono" style="font-size:12px;color:#7F8BB3;margin-bottom:6px">{{report.docPath}}</div><pre class="hx-md">{{report.doc}}</pre></div>
      </sc-if>
      <div>
        <div class="hx-mono" style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#7F8BB3;margin-bottom:4px">Wyniki zespołu</div>
        <sc-for list="{{report.results}}" as="rr" hint-placeholder-count="3">
          <div style="padding:6px 0;border-top:1px solid #1A2340"><span style="font-weight:600">{{rr.who}}</span> <span style="color:#A3AED0">— {{rr.text}}</span></div>
        </sc-for>
      </div>
    </div>
  </section>
  </sc-if>`;

const transport = (mobile) => `
    <button type="button" class="hx-btn hx-pri hx-ico" onClick="{{togglePlay}}" aria-label="{{playAria}}"><sc-if value="{{isPlaying}}" hint-placeholder-val="{{ false }}">${ICON.pause}</sc-if><sc-if value="{{notPlaying}}" hint-placeholder-val="{{ true }}">${ICON.play}</sc-if></button>
    <button type="button" class="hx-btn hx-ico" onClick="{{restart}}" aria-label="Od początku">${ICON.restart}</button>
    <div role="group" aria-label="Prędkość odtwarzania" style="display:flex;gap:3px;padding:3px;background:#0D1430;border:1px solid #2A3560;border-radius:6px${mobile ? ';flex:1' : ''}">
      <sc-for list="{{speeds}}" as="sp" hint-placeholder-count="4">
        <button type="button" class="hx-btn" aria-pressed="{{sp.active}}" onClick="{{sp.pick}}" style="min-height:38px;border-color:transparent;${mobile ? 'flex:1;padding:0 4px' : 'padding:0 10px'}">{{sp.label}}</button>
      </sc-for>
    </div>`;

const camera = `
    <div role="group" aria-label="Kamera" style="display:flex;gap:4px">
      <button type="button" class="hx-btn" aria-pressed="{{follow}}" onClick="{{toggleFollow}}" title="Kamera podąża za pracą agentów" style="min-height:44px">${ICON.follow}<span>Śledź pracę</span></button>
      <button type="button" class="hx-btn hx-ico" onClick="{{zoomOut}}" aria-label="Oddal" style="font-size:18px">−</button>
      <button type="button" class="hx-btn hx-ico" onClick="{{zoomIn}}" aria-label="Przybliż" style="font-size:18px">+</button>
      <button type="button" class="hx-btn hx-ico" onClick="{{resetCam}}" aria-label="Dopasuj widok">${ICON.fit}</button>
    </div>`;

// ---------------------------------------------------------------------------------------------- desktop
function desktop() {
  return `
<div class="hx" style="width:100%;height:100vh;min-height:640px">
  <canvas id="hx-gl" class="hx-cv" aria-hidden="true" style="top:58px;bottom:64px;height:calc(100% - 122px)"></canvas>
  <canvas id="hx-ov" class="hx-cv hx-ov" role="img" aria-label="{{sceneAria}}" style="top:58px;bottom:64px;height:calc(100% - 122px)"></canvas>

  <header class="hx-bar" style="top:0;height:58px;padding:0 14px;gap:22px;border-bottom:1px solid #1A2340">
    <div style="display:flex;align-items:center;gap:10px;min-width:0;flex:none">
      <span style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:8px;background:#0D1430;border:1px solid #2A3560">${ICON.mark}</span>
      <div style="min-width:0">
        <h1 style="margin:0;font:800 18px/1.1 'Bricolage Grotesque','Segoe UI',system-ui,sans-serif;letter-spacing:.02em;white-space:nowrap">HERMES <span style="color:#5C6894;font-weight:600">//</span> CENTRUM DOWODZENIA</h1>
        <div class="hx-mono" style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#7F8BB3;white-space:nowrap;max-width:330px;overflow:hidden;text-overflow:ellipsis">{{runLine}}</div>
      </div>
    </div>
    <ol aria-label="Fazy przebiegu" style="list-style:none;margin:0;padding:0;display:flex;gap:12px;flex:1 1 300px;min-width:0;overflow:hidden">
      <sc-for list="{{phases}}" as="ph" hint-placeholder-count="5">
        <li title="{{ph.name}}" style="flex:{{ph.grow}} 1 34px;min-width:0;display:flex;flex-direction:column;gap:4px">
          <span class="hx-mono" style="font-size:12px;letter-spacing:.05em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:{{ph.color}}">{{ph.label}}</span>
          <span style="height:2px;background:#1A2340;overflow:hidden;display:block"><span style="display:block;height:100%;width:{{ph.fill}}%;background:#F2C14E;box-shadow:0 0 8px #F2C14E"></span></span>
        </li>
      </sc-for>
    </ol>
    <ul aria-label="Odczyty" class="hx-mono" style="list-style:none;margin:0;padding:0;flex:none;display:flex;gap:16px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#7F8BB3;white-space:nowrap">
      <sc-for list="{{kpis}}" as="k" hint-placeholder-count="4">
        <li style="display:flex;flex-direction:column;gap:1px"><span>{{k.label}}</span><span style="font-size:14px;font-weight:600;color:{{k.color}}">{{k.value}}</span></li>
      </sc-for>
    </ul>
    <div class="hx-mono" style="flex:none;font-size:24px;font-weight:600;letter-spacing:.02em;white-space:nowrap;text-shadow:0 0 14px rgba(232,236,248,0.35)">{{clockNow}}<span style="font-size:12px;color:#7F8BB3;margin-left:6px">/ {{clockDur}}</span></div>
    <div style="display:flex;align-items:center;gap:8px;flex:none">
      <button type="button" class="hx-btn" onClick="{{openReport}}" disabled="{{noReport}}" style="border-color:{{reportBorder}};color:{{reportColor}};opacity:{{reportOpacity}}">${ICON.report}Raport</button>
      <label class="hx-btn hx-file">${ICON.upload}Wczytaj log<input type="file" accept=".jsonl,.json,.ndjson,.txt" onChange="{{onFile}}" aria-label="Wczytaj log zdarzeń w formacie JSONL"></label>
    </div>
  </header>

  <aside aria-label="Zlecenie i przebieg" style="position:absolute;z-index:2;left:12px;top:70px;bottom:76px;width:336px;display:flex;flex-direction:column;gap:10px">
    <section class="hx-panel" style="flex:none">
      <div class="hx-ph"><span class="d">◆</span>Zlecenie<span class="m">{{status}}</span></div>
      <div style="padding:10px;display:flex;flex-direction:column;gap:8px">
${composer(false)}
      </div>
      <div style="padding:0 10px 10px;display:flex;flex-direction:column;gap:6px">
        <span class="hx-mono" style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#7F8BB3">Zapisane przebiegi</span>
${runList(false)}
      </div>
    </section>
    <section class="hx-panel" style="flex:1;min-height:0">
${tabs}
      <div class="hx-scroll" style="flex:1;min-height:0">
${lists}
      </div>
    </section>
  </aside>
${inspector(false)}
${report(false)}
  <footer class="hx-bar" style="bottom:0;height:64px;padding:0 14px;gap:10px;border-top:1px solid #1A2340">
${transport(false)}
    <div class="hx-scrub"><canvas id="hx-ticks" aria-hidden="true"></canvas><input type="range" class="hx-range" min="0" max="1000" step="1" value="{{scrub}}" onChange="{{onScrub}}" aria-label="Oś czasu przebiegu" aria-valuetext="{{clockNow}}"></div>
    <span class="hx-mono" style="font-size:12px;color:#7F8BB3;min-width:150px;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{note}}</span>
${camera}
  </footer>
</div>`;
}

// ---------------------------------------------------------------------------------------------- phone
function mobile() {
  return `
<div class="hx" style="width:100%;height:100vh;min-height:640px">
  <canvas id="hx-gl" class="hx-cv" aria-hidden="true" style="top:74px;height:calc(100% - 234px)"></canvas>
  <canvas id="hx-ov" class="hx-cv hx-ov" role="img" aria-label="{{sceneAria}}" style="top:74px;height:calc(100% - 234px)"></canvas>

  <header class="hx-bar" style="top:0;height:74px;padding:8px 10px;gap:8px;border-bottom:1px solid #1A2340;flex-wrap:wrap;align-content:center">
    <span style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:8px;background:#0D1430;border:1px solid #2A3560;flex:none">${ICON.mark}</span>
    <div style="min-width:0;flex:1">
      <h1 style="margin:0;font:800 16px/1.1 'Bricolage Grotesque','Segoe UI',system-ui,sans-serif;letter-spacing:.02em;white-space:nowrap">HERMES</h1>
      <div class="hx-mono" style="font-size:12px;color:#7F8BB3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{runName}} · {{clockNow}} / {{clockDur}}</div>
    </div>
    <button type="button" class="hx-btn hx-ico" onClick="{{openReport}}" disabled="{{noReport}}" aria-label="Raport" style="border-color:{{reportBorder}};color:{{reportColor}};opacity:{{reportOpacity}}">${ICON.report}</button>
    <label class="hx-btn hx-file hx-ico" aria-label="Wczytaj log">${ICON.upload}<input type="file" accept=".jsonl,.json,.ndjson,.txt" onChange="{{onFile}}" aria-label="Wczytaj log zdarzeń w formacie JSONL"></label>
    <ol aria-label="Fazy przebiegu" style="list-style:none;margin:0;padding:0;display:flex;gap:4px;width:100%">
      <sc-for list="{{phases}}" as="ph" hint-placeholder-count="5">
        <li style="flex:1;height:3px;background:#1A2340;overflow:hidden"><span style="display:block;height:100%;width:{{ph.fill}}%;background:#F2C14E"></span></li>
      </sc-for>
    </ol>
  </header>

  <sc-if value="{{sheetOpen}}" hint-placeholder-val="{{ false }}">
  <section class="hx-panel hx-in" style="position:absolute;z-index:2;left:10px;right:10px;top:80px;bottom:166px">
    <sc-if value="{{tabOrder}}" hint-placeholder-val="{{ false }}">
      <div class="hx-ph"><span class="d">◆</span>Zlecenie<span class="m">{{status}}</span></div>
      <div class="hx-scroll" style="padding:10px;display:flex;flex-direction:column;gap:8px;min-height:0;flex:1">
${composer(true)}
        <span class="hx-mono" style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#7F8BB3;margin-top:4px">Zapisane przebiegi</span>
${runList(true)}
      </div>
    </sc-if>
    <sc-if value="{{tabLists}}" hint-placeholder-val="{{ false }}">
      <div class="hx-ph"><span class="d">◆</span>{{sheetTitle}}<span class="m">{{sheetMeta}}</span></div>
      <div class="hx-scroll" style="flex:1;min-height:0">
${lists}
      </div>
    </sc-if>
  </section>
  </sc-if>
${inspector(true)}
${report(true)}
  <footer class="hx-bar" style="bottom:0;height:160px;flex-direction:column;align-items:stretch;justify-content:center;padding:6px 10px 10px;gap:4px;border-top:1px solid #1A2340">
    <div role="tablist" aria-label="Widok" style="display:flex">
      <sc-for list="{{mtabs}}" as="tb" hint-placeholder-count="4">
        <button type="button" role="tab" class="hx-tab" aria-selected="{{tb.on}}" onClick="{{tb.pick}}" style="min-height:44px">{{tb.label}}</button>
      </sc-for>
    </div>
    <div class="hx-scrub" style="flex:none"><canvas id="hx-ticks" aria-hidden="true"></canvas><input type="range" class="hx-range" min="0" max="1000" step="1" value="{{scrub}}" onChange="{{onScrub}}" aria-label="Oś czasu przebiegu" aria-valuetext="{{clockNow}}"></div>
    <div style="display:flex;align-items:center;gap:6px">
${transport(true)}
      <button type="button" class="hx-btn hx-ico" aria-pressed="{{follow}}" onClick="{{toggleFollow}}" aria-label="Śledź pracę">${ICON.follow}</button>
    </div>
  </footer>
</div>`;
}

// ---------------------------------------------------------------------------------------------- logic
const LOGIC = (MOBILE) => `
${NW}
${RUNS_JS}
const HX_MOBILE = ${MOBILE};
const HX_SPEEDS = [0.25, 1, 4, 10];
const { runFacts, appState, matchTask, mmss } = NW.app;

class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = { run: 'repo-fix', playing: true, speed: 1, tick: 0, idx: -1, sel: null, tab: 'log', mtab: 'scene', report: false, follow: true, task: '', note: '' };
    this._v = null;
    this._T = null;
    this._F = null;
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

  open(run, task) {
    const T = this.timeline(run);
    if (!T || !this._v) return;
    this._T = T;
    this._F = runFacts(T);
    this._v.setTimeline(T);
    this._v.setTime(0);
    this._v.play();
    this.drawTicks();
    this.setState({ run, idx: -1, sel: null, playing: true, report: false, task: task != null ? task : this._F.title });
  }

  match(text) {
    return matchTask(text, NW_RUNS.map((r) => r.id));
  }

  drawTicks() {
    const c = typeof document !== 'undefined' && typeof document.getElementById === 'function' ? document.getElementById('hx-ticks') : null;
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
    const X = (ms) => 5 + (ms / T.duration) * (W - 10);
    // phase bands under the ticks, alternating, with a gold seam between phases
    (this._F ? this._F.phases : []).forEach((p, k) => {
      g.fillStyle = k % 2 ? 'rgba(42,53,96,0.55)' : 'rgba(26,35,64,0.75)';
      g.fillRect(X(p.start), H / 2 - 1, Math.max(1, X(p.end) - X(p.start)), 3);
      if (k) { g.fillStyle = 'rgba(242,193,78,0.6)'; g.fillRect(X(p.start), H / 2 - 5, 1, 11); }
    });
    for (let i = 0; i < T.events.length; i++) {
      const ev = T.events[i];
      const x = X(T.rel[i]);
      const b = ev.type.indexOf('fail') >= 0 || ev.type === 'error';
      const sp = ev.type === 'agent.spawned';
      g.fillStyle = b ? '#FF5A6A' : sp ? '#F2C14E' : ev.type === 'message.sent' ? 'rgba(214,190,255,0.75)' : ev.type.indexOf('file.') === 0 ? '#9FE3FF' : 'rgba(232,236,248,0.28)';
      const h = b || sp ? 22 : 12;
      g.fillRect(x, H / 2 - h / 2 - 9, 1, h);
    }
  }

  componentDidMount() {
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
    const gl = document.getElementById('hx-gl');
    const ov = document.getElementById('hx-ov');
    if (!gl || !ov) return;
    this._v = NW.createViewer(HX_MOBILE
      ? { gl, overlay: ov, autoRotate: false, legend: false, date: false, focus: true, insetTop: 4, insetBottom: 4, captionBottom: 10 }
      : { gl, overlay: ov, autoRotate: false, date: false, focus: true, insetLeft: 360, insetTop: 6, insetBottom: 6, legendX: 382, legendY: 30, captionBottom: 22 });
    if (typeof window !== 'undefined') { window.__NW = this._v; if (window.__HM_TEST) window.__HM_TEST.logic = this; }
    this._v.onSelect = (id) => { this.setState({ sel: id || null }); };
    this._v.onTick = (v) => {
      const T = this._T;
      if (!T) return;
      const idx = T.indexAt(v.t);
      const now = Date.now();
      if (idx !== this.state.idx || v.playing !== this.state.playing || now - this._lastPush > 250) {
        this._lastPush = now;
        this.setState({ idx, playing: v.playing, tick: Math.round(v.t / 100) });
      }
    };
    this._onResize = () => this.drawTicks();
    if (typeof window !== 'undefined') window.addEventListener('resize', this._onResize);
    this.open('repo-fix');
  }

  componentWillUnmount() {
    if (this._v) this._v.destroy();
    if (typeof window !== 'undefined' && this._onResize) window.removeEventListener('resize', this._onResize);
  }

  renderVals() {
    const S = this.state;
    const v = this._v;
    const T = this._T;
    const F = this._F || { phases: [], title: '', by: '' };
    const t = v ? v.t : 0;
    const dur = T ? T.duration : 0;
    const idx = T ? T.indexAt(t) : -1;
    const evs = T ? T.events : [];
    const label = (id) => (v ? v.player.label(id) : id);
    const runName = S.run === 'custom' ? 'Własny log' : (NW_RUNS.find((r) => r.id === S.run) || {}).name || '';
    const A = T ? appState(T, F, t, label, v ? v.player.actions() : []) : { idx: -1, done: false, failed: false, phases: [], kpis: [], log: [], talk: [], files: [], report: { kpis: [], results: [] } };
    const done = A.done;
    const failed = A.failed;
    const phases = A.phases.map((p) => ({ num: p.num, name: p.name, label: p.label, grow: p.cur ? 6 : 1, fill: p.fill, color: p.colour }));
    const kpis = A.kpis.map((k) => ({ label: k.label, value: k.value, color: k.colour }));
    const log = A.log.map((l) => ({ time: l.time, type: l.type, who: l.who, text: l.text, color: l.colour }));
    const talk = A.talk.map((m) => ({ time: m.time, from: m.from, to: m.to, tone: m.tone, color: m.colour, text: m.text }));
    const files = A.files.map((f) => ({ time: f.time, name: f.name, dir: f.dir, who: f.who, kind: f.kind, color: f.colour, diff: f.diff, pick: () => { if (v && f.id) { v.select(f.id); this.setState({ sel: f.id, mtab: 'scene' }); } } }));

    // inspector
    let ins = { kind: '', status: '', label: '', sub: '', hasSub: false, stats: [], events: [] };
    let hasSel = false;
    const info = S.sel && v ? v.inspect(S.sel) : null;
    if (info) {
      hasSel = true;
      ins = {
        kind: info.kind === 'file' ? 'plik' : info.sub, status: info.status, label: info.label, sub: info.kind === 'file' ? info.sub : '', hasSub: info.kind === 'file',
        stats: info.stats.map(([k, val]) => ({ k, v: val })),
        events: info.events.map((e) => ({ time: mmss(e.rel), type: e.type + (e.who ? ' · ' + e.who : ''), text: e.text, color: e.type.indexOf('fail') >= 0 || e.type === 'error' ? '#FF8F9A' : e.type.indexOf('passed') >= 0 || e.type.indexOf('completed') >= 0 ? '#8CFFB4' : '#7F8BB3' })),
      };
    }

    const R = A.report;
    const report = { run: runName, status: R.status, title: R.title, summary: R.summary, kpis: R.kpis, hasDoc: !!R.doc, doc: R.doc, docPath: R.docPath, results: R.results };

    const playing = v ? v.playing : false;
    const matched = S.task && S.task !== F.title ? this.match(S.task) : null;
    const mname = matched ? (NW_RUNS.find((r) => r.id === matched) || {}).name : '';
    const statusTxt = done ? 'zakończony' : failed ? 'błąd' : t > 0 ? (playing ? 'w toku' : 'pauza') : 'gotowy';
    const tabDefs = [['log', 'Dziennik', log.length], ['talk', 'Rozmowy', talk.length], ['files', 'Pliki', files.length]];
    const listTab = HX_MOBILE ? (S.mtab === 'talk' ? 'talk' : S.mtab === 'log' ? 'log' : S.tab) : S.tab;
    return {
      sceneAria: 'Przestrzeń robocza przebiegu: ' + F.title + '. Przeciągnij, aby przesunąć; kliknij plik lub agenta, aby zobaczyć, co robił.',
      runLine: 'Agentspace · ' + runName,
      runName,
      phases,
      kpis,
      clockNow: mmss(Math.min(t, dur)),
      clockDur: mmss(dur),
      status: statusTxt,
      runs: NW_RUNS.map((r) => {
        const TT = this._timelines[r.id];
        return { name: r.name, active: S.run === r.id, dot: S.run === r.id ? (done ? '#7CFF9A' : '#F2C14E') : '#2A3560', meta: TT ? mmss(TT.duration) : '', pick: () => this.open(r.id) };
      }).concat(this._custom ? [{ name: 'Własny log', active: S.run === 'custom', dot: '#9FE3FF', meta: mmss(this._custom.duration), pick: () => this.open('custom') }] : []),
      taskText: S.task,
      onTask: (e) => this.setState({ task: e && e.target ? e.target.value : '' }),
      matchNote: !S.task.trim() ? 'Wpisz zadanie albo wybierz zapisany przebieg.' : S.task === F.title ? 'Odtwarzam zapisany przebieg tego zadania.' : matched ? 'Najbliższy zapisany przebieg: ' + mname + '.' : 'Brak podobnego przebiegu — wybierz jeden z listy.',
      launch: () => { const m = S.task === F.title ? S.run : this.match(S.task); if (m) this.open(m, S.task); else this.setState({ note: 'Brak podobnego przebiegu' }); },
      tabs: tabDefs.map(([id, name, n]) => ({ label: name + ' ' + n, on: S.tab === id, pick: () => this.setState({ tab: id }) })),
      tabLog: listTab === 'log', tabTalk: listTab === 'talk', tabFiles: listTab === 'files',
      log, talk, files, talkEmpty: !talk.length, filesEmpty: !files.length,
      mtabs: [['scene', 'Scena'], ['order', 'Zlecenie'], ['log', 'Dziennik'], ['talk', 'Rozmowy']].map(([id, name]) => ({ label: name, on: S.mtab === id, pick: () => this.setState({ mtab: id }) })),
      sheetOpen: S.mtab !== 'scene', tabOrder: S.mtab === 'order', tabLists: S.mtab === 'log' || S.mtab === 'talk',
      sheetTitle: S.mtab === 'talk' ? 'Rozmowy' : 'Dziennik', sheetMeta: S.mtab === 'talk' ? talk.length + ' wiadomości' : (idx + 1) + ' / ' + evs.length + ' zdarzeń',
      hasSel, ins,
      closeSel: () => { if (v) v.select(null); this.setState({ sel: null }); },
      reportOpen: S.report && done, report,
      openReport: () => { if (done) this.setState({ report: true, sel: null }); },
      closeReport: () => this.setState({ report: false }),
      noReport: !done, reportBorder: done ? '#F2C14E' : '#2A3560', reportColor: done ? '#F2C14E' : '#7F8BB3', reportOpacity: done ? '1' : '0.6',
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
      note: S.note || (done ? 'Przebieg zakończony · raport gotowy' : ''),
      isPlaying: playing, notPlaying: !playing, playAria: playing ? 'Wstrzymaj' : 'Odtwórz',
      togglePlay: () => { if (!v) return; if (v.playing) v.pause(); else v.play(); this.setState({ playing: v.playing }); },
      restart: () => { if (!v) return; v.setTime(0); v.play(); this.setState({ playing: true, idx: -1, report: false }); },
      speeds: HX_SPEEDS.map((s) => ({ label: (s === 0.25 ? '0.25' : String(s)) + '×', active: S.speed === s, pick: () => { if (v) v.setSpeed(s); this.setState({ speed: s }); } })),
      scrub: String(dur ? Math.round((Math.min(t, dur) / dur) * 1000) : 0),
      onScrub: (e) => { if (!v || !T) return; v.pause(); v.setTime((Number(e.target.value) / 1000) * dur); this.setState({ playing: false, tick: Math.round(v.t / 100) }); },
      follow: S.follow,
      toggleFollow: () => { if (!v) return; const on = !S.follow; v.setFocus(on); this.setState({ follow: on }); },
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
fs.writeFileSync(path.join(out, 'Hermes.dc.html'), page('Hermes', 1440, 900, desktop(), false));
fs.writeFileSync(path.join(out, 'HermesMobile.dc.html'), page('Hermes na telefonie', 390, 844, mobile(), true));
console.log('built Hermes.dc.html', fs.statSync(path.join(out, 'Hermes.dc.html')).size, 'HermesMobile.dc.html', fs.statSync(path.join(out, 'HermesMobile.dc.html')).size);
