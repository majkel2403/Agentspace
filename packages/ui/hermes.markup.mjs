// The Hermes app as one template (Design Component markup: {{holes}}, sc-if, sc-for). The web app (web/dc-lite.js)
// and the canvas boards (artifact/build-app.mjs) both render exactly this, with hermes.logic.js and hermes.css, so
// the two can never drift apart. One breakpoint switch (data-bp = xl | m | s) drives the layout.
const I = (d, size = 16) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICON = {
  mark: '<svg viewBox="0 0 32 32" width="24" height="24" fill="none" stroke="#F2C14E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="16" cy="16" r="5"/><path d="M11 15C8 14.5 5.5 12.8 3.5 9.5"/><path d="M11 18C8.5 18.2 6 17.5 4 15.5"/><path d="M21 15C24 14.5 26.5 12.8 28.5 9.5"/><path d="M21 18C23.5 18.2 26 17.5 28 15.5"/><path d="M16 21v7"/></svg>',
  play: '<svg viewBox="0 0 24 24" width="20" height="20" fill="#1A1300" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" width="20" height="20" fill="#1A1300" aria-hidden="true"><rect x="6.5" y="5.5" width="4" height="13" rx="1"/><rect x="13.5" y="5.5" width="4" height="13" rx="1"/></svg>',
  restart: I('<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/>', 18),
  close: I('<path d="M6 6l12 12M18 6L6 18"/>'),
  upload: I('<path d="M12 15V4"/><path d="M7.5 8.5L12 4l4.5 4.5"/><path d="M5 15v4h14v-4"/>'),
  report: I('<path d="M7 3.5h7l4 4V20.5H7z"/><path d="M14 3.5v4h4"/><path d="M10 12h5M10 15.5h5"/>'),
  follow: I('<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>', 18),
  fit: I('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', 18),
  launch: '<svg viewBox="0 0 24 24" width="18" height="18" fill="#1A1300" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
};

const body = (inner) => `<div class="hx-body">${inner}</div>`;

const order = `
      <section class="hx-pane p-order" aria-label="Zlecenie">
        <div class="hx-ph"><span class="d">◆</span>Zlecenie<span class="m">{{status}}</span></div>
        <div class="hx-body hx-scroll">
          <label for="hx-task" class="hx-cap">Zadanie dla Hermesa</label>
          <textarea id="hx-task" class="hx-task" rows="3" value="{{taskText}}" onChange="{{onTask}}" placeholder="Opisz, co ma zostać zrobione…"></textarea>
          <div class="hx-launch"><button type="button" class="hx-btn hx-pri" onClick="{{launch}}">${ICON.launch}Uruchom Hermesa</button><span class="hx-note">{{matchNote}}</span></div>
          <span class="hx-cap">Przebiegi</span>
          <div class="hx-runs hx-scroll">
            <sc-for list="{{runs}}" as="r" hint-placeholder-count="4">
              <button type="button" class="hx-run" aria-pressed="{{r.active}}" onClick="{{r.pick}}" style="--c:{{r.dot}}"><span class="dot"></span><b class="hx-ellip">{{r.name}}</b><small>{{r.meta}}</small></button>
            </sc-for>
          </div>
        </div>
      </section>`;

const log = `
      <section class="hx-pane p-log" aria-label="Dziennik">
        <div class="hx-ph"><span class="d">◆</span>Dziennik<span class="m">{{logMeta}}</span></div>
        <div class="hx-scroll hx-fill">
          <ol><sc-for list="{{log}}" as="l" hint-placeholder-count="6"><li class="hx-row" data-fresh="{{l.fresh}}" style="--c:{{l.color}}"><span class="hx-k"><span>{{l.time}}</span><span>{{l.type}}</span><span class="hx-ellip">{{l.who}}</span></span>{{l.text}}</li></sc-for></ol>
          <sc-if value="{{logEmpty}}" hint-placeholder-val="{{ false }}"><div class="hx-empty">Przebieg jeszcze się nie zaczął.</div></sc-if>
        </div>
      </section>`;

const team = `
    <sc-if value="{{paneTeam}}" hint-placeholder-val="{{ true }}">
      <section class="hx-pane" aria-label="Zespół">
        <div class="hx-ph"><span class="d">◆</span>Zespół<span class="m">{{teamMeta}}</span></div>
        <div class="hx-body hx-scroll hx-fill">
          <sc-if value="{{hasBrief}}" hint-placeholder-val="{{ true }}"><div class="hx-brief"><span class="hx-cap">Zlecenie · {{briefBy}}</span><p>{{briefText}}</p></div></sc-if>
          <ul>
            <sc-for list="{{team}}" as="a" hint-placeholder-count="3">
              <li><button type="button" class="hx-agent" data-hl="{{a.hl}}" data-fresh="{{a.fresh}}" style="{{a.style}}" onClick="{{a.pick}}" onMouseEnter="{{a.enter}}" onMouseLeave="{{a.leave}}"><span class="av"></span><span class="tx"><span class="nm"><b>{{a.name}}</b><sc-if value="{{a.fresh}}" hint-placeholder-val="{{ false }}"><span class="hx-new">NOWY</span></sc-if></span><span class="rl">{{a.role}}</span><sc-if value="{{a.hasTask}}" hint-placeholder-val="{{ true }}"><span class="tk">{{a.task}}</span></sc-if></span><span class="st" data-work="{{a.working}}">{{a.status}}</span></button></li>
            </sc-for>
          </ul>
          <sc-if value="{{hasPlan}}" hint-placeholder-val="{{ true }}">
            <span class="hx-cap" style="margin-top:8px">Plan · {{planMeta}}</span>
            <ol class="hx-steps"><sc-for list="{{plan}}" as="p" hint-placeholder-count="4"><li data-state="{{p.state}}"><span class="mk">{{p.mark}}</span><span>{{p.text}}</span></li></sc-for></ol>
          </sc-if>
          <sc-if value="{{noTeam}}" hint-placeholder-val="{{ false }}"><div class="hx-empty">Zespół powstaje, gdy Hermes zacznie tworzyć agentów.</div></sc-if>
        </div>
      </section>
    </sc-if>`;

const code = `
    <sc-if value="{{paneCode}}" hint-placeholder-val="{{ false }}">
      <section class="hx-pane" aria-label="Kod i terminal">
        <div class="hx-ph"><span class="d">◆</span>Kod i terminal<span class="m">{{codeMeta}}</span></div>
        <div class="hx-body hx-fill" style="min-height:0">
          <sc-if value="{{hasCode}}" hint-placeholder-val="{{ true }}">
            <div class="hx-win" style="flex:1 1 55%;min-height:0">
              <div class="hx-win-h"><b class="hx-ellip">{{code.file}}</b><span class="hx-badge" style="--c:{{code.badgeColor}}">{{code.badge}}</span><span class="m">{{code.who}} · {{code.diff}}</span></div>
              <div class="hx-code hx-scroll hx-fill"><sc-for list="{{code.lines}}" as="ln" hint-placeholder-count="5"><div class="hx-ln" data-kind="{{ln.kind}}"><span class="no">{{ln.n}}</span><span class="sg">{{ln.sign}}</span><span><sc-for list="{{ln.tokens}}" as="tk" hint-placeholder-count="3"><span style="color:{{tk.c}}">{{tk.s}}</span></sc-for><sc-if value="{{ln.caret}}" hint-placeholder-val="{{ false }}"><span class="hx-caret"></span></sc-if></span></div></sc-for></div>
            </div>
          </sc-if>
          <sc-if value="{{hasTerm}}" hint-placeholder-val="{{ true }}">
            <div class="hx-win" style="flex:1 1 45%;min-height:0">
              <div class="hx-win-h"><b>terminal</b><span class="hx-badge" style="--c:{{term.stateColor}}">{{term.state}}</span><span class="m">{{term.who}}</span></div>
              <div class="hx-term hx-scroll hx-fill"><div class="cmd">{{term.command}}<sc-if value="{{term.typing}}" hint-placeholder-val="{{ false }}"><span class="hx-caret"></span></sc-if></div><sc-for list="{{term.lines}}" as="tl" hint-placeholder-count="3"><div class="{{tl.cls}}">{{tl.s}}</div></sc-for></div>
            </div>
          </sc-if>
          <sc-if value="{{noCode}}" hint-placeholder-val="{{ false }}"><div class="hx-empty">Tu pojawi się kod pisany przez agentów i polecenia, które uruchamiają.</div></sc-if>
        </div>
      </section>
    </sc-if>`;

const talk = `
    <sc-if value="{{paneTalk}}" hint-placeholder-val="{{ false }}">
      <section class="hx-pane" aria-label="Rozmowy">
        <div class="hx-ph"><span class="d">◆</span>Rozmowy<span class="m">{{talkMeta}}</span></div>
        <div class="hx-scroll hx-fill">
          <ol><sc-for list="{{talk}}" as="m" hint-placeholder-count="4"><li class="hx-row" data-fresh="{{m.fresh}}" style="--c:{{m.color}}"><span class="hx-k"><span>{{m.time}}</span><span class="who">{{m.from}}</span><span>→</span><span class="who">{{m.to}}</span><span class="r">{{m.tone}}</span></span>{{m.text}}</li></sc-for></ol>
          <sc-if value="{{noTalk}}" hint-placeholder-val="{{ false }}"><div class="hx-empty">Agenci jeszcze ze sobą nie rozmawiali.</div></sc-if>
        </div>
      </section>
    </sc-if>`;

const files = `
    <sc-if value="{{paneFiles}}" hint-placeholder-val="{{ false }}">
      <section class="hx-pane" aria-label="Pliki">
        <div class="hx-ph"><span class="d">◆</span>Pliki<span class="m">{{filesMeta}}</span></div>
        <div class="hx-scroll hx-fill">
          <ol><sc-for list="{{files}}" as="f" hint-placeholder-count="4"><li><button type="button" class="hx-row" data-fresh="{{f.fresh}}" style="--c:{{f.color}}" onClick="{{f.pick}}" onMouseEnter="{{f.enter}}" onMouseLeave="{{f.leave}}"><span class="hx-k"><span class="who hx-ellip">{{f.name}}</span><span style="color:var(--ok)">{{f.diff}}</span><span class="r">{{f.kind}}</span></span><span class="hx-path hx-ellip">{{f.dir}} · {{f.who}} · {{f.time}}</span></button></li></sc-for></ol>
          <sc-if value="{{noFiles}}" hint-placeholder-val="{{ false }}"><div class="hx-empty">Żaden plik nie został jeszcze utworzony ani zmieniony.</div></sc-if>
        </div>
      </section>
    </sc-if>`;

const inspector = `
    <sc-if value="{{paneIns}}" hint-placeholder-val="{{ false }}">
      <section class="hx-pane" aria-label="Inspektor" aria-live="polite">
        <div class="hx-ph"><span class="d">◆</span>Inspektor<span class="m">{{ins.kind}}</span><button type="button" class="hx-btn hx-ghost hx-ico" style="min-height:30px;width:30px;min-width:30px" onClick="{{closeSel}}" aria-label="Zamknij inspektor">${ICON.close}</button></div>
        <div class="hx-body hx-scroll hx-fill">
          <sc-if value="{{hasSel}}" hint-placeholder-val="{{ true }}">
            <div class="hx-st">{{ins.status}}</div>
            <h3 class="hx-h3">{{ins.label}}</h3>
            <sc-if value="{{ins.hasSub}}" hint-placeholder-val="{{ true }}"><p class="hx-path" style="word-break:break-all">{{ins.sub}}</p></sc-if>
            <dl class="hx-dl"><sc-for list="{{ins.stats}}" as="st" hint-placeholder-count="3"><dt>{{st.k}}</dt><dd>{{st.v}}</dd></sc-for></dl>
            <span class="hx-cap">Co robił · ostatnie zdarzenia</span>
            <sc-for list="{{ins.events}}" as="e" hint-placeholder-count="3"><div class="hx-ev" style="--c:{{e.color}}"><span class="k">{{e.time}} · {{e.type}}</span><br>{{e.text}}</div></sc-for>
          </sc-if>
          <sc-if value="{{noSel}}" hint-placeholder-val="{{ false }}"><div class="hx-empty" style="padding:0">Kliknij plik albo agenta na scenie, aby zobaczyć, co robił.</div></sc-if>
        </div>
      </section>
    </sc-if>`;

const report = `
    <sc-if value="{{paneReport}}" hint-placeholder-val="{{ false }}">
      <section class="hx-pane" aria-label="Raport">
        <div class="hx-ph"><span class="d">◆</span>Raport<span class="m">{{report.run}}</span></div>
        <div class="hx-body hx-scroll hx-fill" style="gap:14px">
          <sc-if value="{{reportReady}}" hint-placeholder-val="{{ false }}">
            <div><div class="hx-st" style="--c:{{report.statusColor}}">◆ {{report.status}}</div><h2 class="hx-h2">{{report.title}}</h2><p style="margin-top:6px;color:var(--mut)">{{report.summary}}</p></div>
            <ul class="hx-rk"><sc-for list="{{report.kpis}}" as="k" hint-placeholder-count="4"><li><span class="hx-cap">{{k.label}}</span><b>{{k.value}}</b></li></sc-for></ul>
            <sc-if value="{{report.hasDoc}}" hint-placeholder-val="{{ false }}"><div><span class="hx-cap">{{report.docPath}}</span><div class="hx-doc" style="margin-top:6px"><pre>{{report.doc}}</pre></div></div></sc-if>
            <div><span class="hx-cap">Wyniki zespołu</span><sc-for list="{{report.results}}" as="rr" hint-placeholder-count="3"><div class="hx-ev"><b>{{rr.who}}</b> <span style="color:var(--mut)">— {{rr.text}}</span></div></sc-for></div>
          </sc-if>
          <sc-if value="{{reportPending}}" hint-placeholder-val="{{ false }}"><div class="hx-empty" style="padding:0">Raport pojawi się, gdy przebieg się zakończy.</div></sc-if>
        </div>
      </section>
    </sc-if>`;

// rootStyle: the board gives the root its height; the web app lets it fill the page
export function markup(rootStyle = '') {
  return `
<div class="hx" id="hx-root" data-bp="{{bp}}" data-sheet="{{sheet}}" style="${rootStyle}">
  <header class="hx-top">
    <div class="hx-brand">
      <span class="hx-mark">${ICON.mark}</span>
      <div style="min-width:0"><h1>HERMES <span class="sl">//</span> <span class="long">CENTRUM DOWODZENIA</span></h1><div class="hx-sub hx-mono hx-ellip">{{runLine}}</div></div>
    </div>
    <ol class="hx-phases" aria-label="Fazy przebiegu"><sc-for list="{{phases}}" as="ph" hint-placeholder-count="5"><li class="hx-phase" data-state="{{ph.state}}" title="{{ph.title}}"><span class="n hx-ellip">{{ph.label}}</span><span class="b"><i style="width:{{ph.fill}}%"></i></span></li></sc-for></ol>
    <ul class="hx-kpis" aria-label="Odczyty"><sc-for list="{{kpis}}" as="k" hint-placeholder-count="4"><li style="--c:{{k.color}}">{{k.label}}<b>{{k.value}}</b></li></sc-for></ul>
    <div class="hx-clock">{{clockNow}}<small>/ {{clockDur}}</small></div>
    <div class="hx-actions">
      <button type="button" class="hx-btn" data-ready="{{reportReady}}" onClick="{{openReport}}" aria-label="Raport">${ICON.report}<span class="lbl">Raport</span></button>
      <label class="hx-btn hx-file" aria-label="Wczytaj log">${ICON.upload}<span class="lbl">Wczytaj log</span><input type="file" accept=".jsonl,.json,.ndjson,.txt" onChange="{{onFile}}" aria-label="Wczytaj log zdarzeń w formacie JSONL"></label>
    </div>
  </header>

  <main class="hx-main">
    <div class="hx-stage">
      <canvas id="hx-gl" class="hx-cv" aria-hidden="true"></canvas>
      <canvas id="hx-ov" class="hx-cv hx-ov" role="img" aria-label="{{sceneAria}}"></canvas>
      <div class="hx-hud top">
        <sc-for list="{{chips}}" as="c" hint-placeholder-count="3"><span class="hx-chip {{c.cls}}" style="--c:{{c.colour}}"><i></i><span>{{c.text}}</span><b>{{c.n}}</b></span></sc-for>
        <sc-if value="{{isLive}}" hint-placeholder-val="{{ false }}"><span class="hx-chip live">LIVE</span></sc-if>
      </div>
      <div class="hx-hud bot"><sc-if value="{{hasTicker}}" hint-placeholder-val="{{ true }}"><span class="hx-chip hx-ticker" style="--c:{{ticker.color}}"><span>{{ticker.text}}</span></span></sc-if></div>
    </div>
    <nav class="hx-tabs" role="tablist" aria-label="Panele">
      <sc-for list="{{tabs}}" as="tb" hint-placeholder-count="6"><button type="button" role="tab" class="hx-tab" aria-selected="{{tb.on}}" aria-label="{{tb.name}}" title="{{tb.name}}" onClick="{{tb.pick}}"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="{{tb.d}}"/></svg><span class="lbl">{{tb.name}}</span><span class="ct">{{tb.count}}</span></button></sc-for>
    </nav>
    <div class="hx-left">
      <sc-if value="{{showOrder}}" hint-placeholder-val="{{ true }}">${order}</sc-if>
      <sc-if value="{{showLog}}" hint-placeholder-val="{{ true }}">${log}</sc-if>
    </div>
${team}${code}${talk}${files}${inspector}${report}
  </main>

  <footer class="hx-bot">
    <button type="button" class="hx-btn hx-pri hx-ico" onClick="{{togglePlay}}" aria-label="{{playAria}}"><sc-if value="{{isPlaying}}" hint-placeholder-val="{{ false }}">${ICON.pause}</sc-if><sc-if value="{{notPlaying}}" hint-placeholder-val="{{ true }}">${ICON.play}</sc-if></button>
    <button type="button" class="hx-btn hx-ico" onClick="{{restart}}" aria-label="Od początku">${ICON.restart}</button>
    <div class="hx-seg" role="group" aria-label="Prędkość odtwarzania"><sc-for list="{{speeds}}" as="sp" hint-placeholder-count="4"><button type="button" class="hx-btn" aria-pressed="{{sp.active}}" onClick="{{sp.pick}}">{{sp.label}}</button></sc-for></div>
    <div class="hx-scrub"><canvas id="hx-ticks" aria-hidden="true"></canvas><input type="range" class="hx-range" min="0" max="1000" step="1" value="{{scrub}}" onChange="{{onScrub}}" aria-label="Oś czasu przebiegu" aria-valuetext="{{clockNow}}"></div>
    <span class="hx-bnote">{{note}}</span>
    <div class="hx-cam" role="group" aria-label="Kamera">
      <button type="button" class="hx-btn" aria-pressed="{{follow}}" onClick="{{toggleFollow}}" title="Kamera podąża za pracą agentów">${ICON.follow}<span class="lbl">Śledź pracę</span></button>
      <button type="button" class="hx-btn hx-ico zoom" onClick="{{zoomOut}}" aria-label="Oddal">−</button>
      <button type="button" class="hx-btn hx-ico zoom" onClick="{{zoomIn}}" aria-label="Przybliż">+</button>
      <button type="button" class="hx-btn hx-ico" onClick="{{resetCam}}" aria-label="Dopasuj widok">${ICON.fit}</button>
    </div>
  </footer>
</div>`;
}
