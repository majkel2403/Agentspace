// The Hermes app logic, shared by the web app and the canvas boards (classic script, no modules: the board pastes it
// after the core bundle `NW`). The host supplies the data through the global HX_HOST:
//   HX_HOST.runs()                      -> [{ id, name, meta, live }]   the run list (may change between calls)
//   HX_HOST.load(id)                    -> events[] | Promise<events[]> the recorded events of a run
//   HX_HOST.live(id, onEvent)           -> stop()                        optional: follow a running task
//   HX_HOST.onRuns(cb)                  optional: cb() when the list changed
// Everything the panels show comes from NW.app (the event log), so the scene and the panels stay in step.
const HX_SPEEDS = [0.25, 1, 4, 10];
const { runFacts, appState, matchTask, mmss, studioState, legendOf, cssRgb } = NW.app;
const HX_TABS = {
  scene: ['Scena', 'M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
  order: ['Zlecenie', 'M5 19l1-4L16.5 4.5a2 2 0 0 1 3 3L9 18zM14.5 6.5l3 3'],
  team: ['Zespół', 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3.5 19a5.5 5.5 0 0 1 11 0M16 9a2.5 2.5 0 1 0 0-5M17 14a5 5 0 0 1 3.5 5'],
  code: ['Kod', 'M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14'],
  talk: ['Rozmowy', 'M4 5h16v11H9l-5 4z'],
  log: ['Dziennik', 'M5 6h14M5 12h14M5 18h9'],
  files: ['Pliki', 'M3.5 7a1.5 1.5 0 0 1 1.5-1.5h4l2 2.5h8A1.5 1.5 0 0 1 20.5 9.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z'],
  ins: ['Inspektor', 'M12 3v4M12 17v4M3 12h4M17 12h4M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
  report: ['Raport', 'M7 3.5h7l4 4V20.5H7zM14 3.5v4h4M10 12h5M10 15.5h5'],
};
const hxTabsFor = (bp) => (bp === 'xl' ? ['team', 'code', 'talk', 'files', 'ins', 'report'] : bp === 'm' ? ['order', 'log', 'team', 'code', 'talk', 'files', 'ins', 'report'] : ['scene', 'order', 'log', 'team', 'code', 'talk', 'files', 'ins', 'report']);
const hxBp = (w) => (w >= 1180 ? 'xl' : w >= 720 ? 'm' : 's');
const hxReduce = () => { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } };

class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = { run: null, runsTick: 0, playing: true, speed: 1, tick: 0, idx: -1, sel: null, hl: null, tab: 'team', follow: true, task: '', note: '', bp: 'xl' };
    this._v = null; this._T = null; this._F = null; this._timelines = {}; this._lastPush = 0; this._custom = null; this._stopLive = null;
  }

  open(run, task) {
    if (this._stopLive) { this._stopLive(); this._stopLive = null; }
    const events = run === 'custom' ? this._custom : HX_HOST.load(run);
    Promise.resolve(events).then((ev) => {
      if (!ev || !ev.length || !this._v) return;
      const T = NW.createTimeline(ev);
      this._timelines[run] = T;
      this._T = T;
      this._F = runFacts(T);
      this._v.setTimeline(T);
      this._v.setTime(0);
      const live = (HX_HOST.runs().find((r) => r.id === run) || {}).live;
      this._v.setLive(!!live);
      this._v.play();
      if (live && HX_HOST.live) {
        this._stopLive = HX_HOST.live(run, (e) => {
          const atEnd = this._v.t >= T.duration - 50;
          T.append(e);
          this._F = runFacts(T);
          if (atEnd) this._v.setTime(T.duration);
          this.drawTicks();
        });
      }
      this.drawTicks();
      this.setState({ run, idx: -1, sel: null, playing: true, task: task != null ? task : this._F.title, note: run === 'custom' ? this.state.note : '', tab: this.state.tab === 'ins' ? this.defaultTab() : this.state.tab });
    });
  }

  defaultTab() { return this.state.bp === 's' ? 'scene' : 'team'; }

  match(text) { return matchTask(text, HX_HOST.runs().map((r) => r.id)); }

  drawTicks() {
    const c = typeof document !== 'undefined' && typeof document.getElementById === 'function' ? document.getElementById('hx-ticks') : null;
    const T = this._T;
    if (!c || !c.getContext || !T) return;
    const W = c.clientWidth; const H = c.clientHeight;
    if (W < 10) return;
    c.width = W * 2; c.height = H * 2;
    const g = c.getContext('2d');
    g.setTransform(2, 0, 0, 2, 0, 0);
    g.clearRect(0, 0, W, H);
    if (!T.duration) return;
    const X = (ms) => 5 + (ms / T.duration) * (W - 10);
    (this._F ? this._F.phases : []).forEach((p, k) => {
      g.fillStyle = k % 2 ? 'rgba(42,53,96,0.55)' : 'rgba(26,35,64,0.75)';
      g.fillRect(X(p.start), H / 2 - 1, Math.max(1, X(p.end) - X(p.start)), 3);
      if (k) { g.fillStyle = 'rgba(242,193,78,0.6)'; g.fillRect(X(p.start), H / 2 - 5, 1, 11); }
    });
    for (let i = 0; i < T.events.length; i++) {
      const ev = T.events[i];
      const b = ev.type.indexOf('fail') >= 0 || ev.type === 'error';
      const sp = ev.type === 'agent.spawned';
      g.fillStyle = b ? '#FF5A6A' : sp ? '#F2C14E' : ev.type === 'message.sent' ? 'rgba(214,190,255,0.75)' : ev.type.indexOf('file.') === 0 ? '#9FE3FF' : 'rgba(232,236,248,0.28)';
      const h = b || sp ? 22 : 12;
      g.fillRect(X(T.rel[i]), H / 2 - h / 2 - 9, 1, h);
    }
  }

  measure() {
    const root = typeof document !== 'undefined' ? document.getElementById('hx-root') : null;
    if (!root) return;
    const bp = hxBp(root.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1440));
    if (bp !== this.state.bp || !this._measured) {
      const tabs = hxTabsFor(bp);
      const first = !this._measured;
      this._measured = true;
      this.setState({ bp, tab: first || tabs.indexOf(this.state.tab) < 0 ? (bp === 's' ? 'scene' : 'team') : this.state.tab });
    }
    this.drawTicks();
  }

  componentDidMount() {
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
    const gl = document.getElementById('hx-gl');
    const ov = document.getElementById('hx-ov');
    if (!gl || !ov) return;
    // the canvas shows the world only; the panels, legend and ticker are HTML around it
    this._v = NW.createViewer({ gl, overlay: ov, autoRotate: false, hud: false, focus: true });
    if (typeof window !== 'undefined') { window.__NW = this._v; if (window.__HM_TEST) window.__HM_TEST.logic = this; }
    this._v.onSelect = (id) => { this.setState({ sel: id || null, tab: id ? 'ins' : (this.state.tab === 'ins' ? this.defaultTab() : this.state.tab) }); };
    this._v.onHover = (id) => { this.setState({ hl: id }); };
    this._v.onTick = (v) => {
      const T = this._T;
      if (!T) return;
      const idx = T.indexAt(v.t);
      const now = Date.now();
      const st = v.story;
      const typing = !!(st && ((st.lastCode && st.lastCode.typing) || (st.lastTerm && st.lastTerm.typing)));
      if (idx !== this.state.idx || v.playing !== this.state.playing || now - this._lastPush > (typing && !hxReduce() ? 90 : 250)) {
        this._lastPush = now;
        this.setState({ idx, playing: v.playing, tick: Math.round(v.t / 100) });
      }
    };
    if (typeof ResizeObserver !== 'undefined') { this._ro = new ResizeObserver(() => this.measure()); this._ro.observe(document.getElementById('hx-root')); }
    else if (typeof window !== 'undefined') { this._onResize = () => this.measure(); window.addEventListener('resize', this._onResize); }
    if (HX_HOST.onRuns) HX_HOST.onRuns(() => this.setState({ runsTick: this.state.runsTick + 1 }));
    this.measure();
    const first = HX_HOST.initial ? HX_HOST.initial() : (HX_HOST.runs()[0] || {}).id;
    if (first) this.open(first);
  }

  componentWillUnmount() {
    if (this._stopLive) this._stopLive();
    if (this._ro) this._ro.disconnect();
    if (this._v) this._v.destroy();
    if (typeof window !== 'undefined' && this._onResize) window.removeEventListener('resize', this._onResize);
  }

  renderVals() {
    const S = this.state;
    const v = this._v;
    const T = this._T;
    const bp = S.bp;
    const F = this._F || { phases: [], title: '', by: '' };
    const t = v ? Math.min(v.t, T ? T.duration : 0) : 0;
    const dur = T ? T.duration : 0;
    const label = (id) => (v ? v.player.label(id) : id);
    const runs = HX_HOST.runs();
    const runInfo = runs.find((r) => r.id === S.run) || { name: '', live: false };
    const A = T ? appState(T, F, t, label, v ? v.player.actions() : []) : { idx: -1, done: false, failed: false, phases: [], kpis: [], log: [], talk: [], files: [], report: { kpis: [], results: [], status: '', title: '', summary: '', doc: '', docPath: '' } };
    const St = T ? studioState(v ? v.story : null, { reduce: hxReduce(), maxLines: bp === 's' ? 9 : 26 }) : { brief: null, team: [], plan: null, code: null, term: null };
    const done = A.done;
    const fresh = (ms) => t - ms < 1500 && t >= ms;
    const relOf = (i) => (T ? T.rel[i] : 0);
    const hl = S.hl;

    const phases = A.phases.map((p) => ({ label: p.label, title: p.num + ' ' + p.name, fill: p.fill, state: p.cur ? 'cur' : p.fill >= 100 ? 'done' : 'todo' }));
    const kpis = A.kpis.map((k) => ({ label: k.label, value: k.value, color: k.colour }));
    const log = A.log.map((l) => ({ time: l.time, type: l.type, who: l.who, text: l.text, color: l.colour, fresh: fresh(relOf(l.i)) }));
    const talk = A.talk.map((m) => ({ time: m.time, from: m.from, to: m.to, tone: m.tone, color: m.colour, text: m.text, fresh: fresh(relOf(m.i)) }));
    const files = A.files.map((f) => ({
      time: f.time, name: f.name, dir: f.dir, who: f.who, kind: f.kind, color: f.colour, diff: f.diff, fresh: fresh(relOf(f.i)),
      pick: () => { if (v && f.id) v.select(f.id); },
      enter: () => { if (v && f.id) v.highlight(f.id); }, leave: () => { if (v) v.highlight(null); },
    }));
    const team = St.team.map((a) => ({
      name: a.name, role: a.role, task: a.task, hasTask: !!a.task, status: a.status, working: a.working, fresh: a.fresh,
      hl: hl === 'user:' + a.id, style: '--depth:' + a.depth + ';--c:' + a.colour + ';--sc:' + a.statusColour,
      pick: () => { if (v) v.select('user:' + a.id); },
      enter: () => { if (v) v.highlight('user:' + a.id); }, leave: () => { if (v) v.highlight(null); },
    }));
    const plan = St.plan ? St.plan.steps.map((p) => ({ text: p.text, state: p.state, mark: p.state === 'done' ? '✓' : p.state === 'cur' ? '▸' : p.n })) : [];

    let code = { file: '', badge: '', badgeColor: '#7F8BB3', who: '', diff: '', lines: [] };
    if (St.code) {
      const c = St.code;
      code = { file: c.file, badge: c.created ? 'NOWY' : c.typing ? 'PISZE' : 'ZMIANA', badgeColor: c.created ? '#8CFFB4' : '#FFB48A', who: c.who, diff: '+' + c.add + (c.del ? ' −' + c.del : ''), lines: c.lines };
    }
    let term = { who: '', state: '', stateColor: '#7F8BB3', command: '', typing: false, lines: [] };
    if (St.term) {
      const m = St.term;
      term = { who: m.who, state: m.running ? 'działa' : m.fail ? 'błąd' : 'koniec', stateColor: m.running ? '#FFC979' : m.fail ? '#FF8F9A' : '#8CFFB4', command: m.command, typing: m.typing, lines: m.lines.map((l) => ({ s: l.s, cls: l.bad ? 'bad' : '' })) };
    }

    // inspector
    let ins = { kind: '', status: '', label: '', sub: '', hasSub: false, stats: [], events: [] };
    const info = S.sel && v ? v.inspect(S.sel) : null;
    if (info) {
      ins = {
        kind: info.kind === 'file' ? 'plik' : info.sub, status: info.status, label: info.label, sub: info.kind === 'file' ? info.sub : '', hasSub: info.kind === 'file',
        stats: info.stats.map(([k, val]) => ({ k, v: val })),
        events: info.events.map((e) => ({ time: mmss(e.rel), type: e.type + (e.who ? ' · ' + e.who : ''), text: e.text, color: e.type.indexOf('fail') >= 0 || e.type === 'error' ? '#FF8F9A' : e.type.indexOf('passed') >= 0 || e.type.indexOf('completed') >= 0 ? '#8CFFB4' : '#7F8BB3' })),
      };
    }
    const R = A.report;
    const report = { run: runInfo.name, status: R.status, statusColor: A.failed ? '#FF8F9A' : '#8CFFB4', title: R.title, summary: R.summary, kpis: R.kpis, hasDoc: !!R.doc, doc: R.doc, docPath: R.docPath, results: R.results };

    // tabs: only those the layout offers; counts where they mean something
    const counts = { log: log.length, talk: talk.length, files: files.length, team: team.length };
    const tabIds = hxTabsFor(bp);
    const tab = tabIds.indexOf(S.tab) >= 0 ? S.tab : (bp === 's' ? 'scene' : 'team');
    const tabs = tabIds.map((id) => ({
      name: HX_TABS[id][0], d: HX_TABS[id][1], on: tab === id, count: counts[id] != null ? String(counts[id]) : id === 'report' && done ? '●' : '',
      pick: () => this.setState({ tab: id }),
    }));

    const playing = v ? v.playing : false;
    const matched = S.task && S.task !== F.title ? this.match(S.task) : null;
    const mname = matched ? (runs.find((r) => r.id === matched) || {}).name : '';
    const statusTxt = done ? 'zakończony' : A.failed ? 'błąd' : t > 0 ? (playing ? 'w toku' : 'pauza') : 'gotowy';

    // scene overlays kept inside the stage: extension legend, readouts on narrow screens, the current event
    const chips = legendOf(v ? v.frame() : null, bp === 's' ? 3 : 6).map((c) => ({ cls: 'ext', colour: c.colour, text: c.ext, n: c.n }));
    if (bp !== 'xl') for (const k of A.kpis) chips.push({ cls: '', colour: k.colour, text: k.label, n: k.value });
    const top = A.log[0];
    const ticker = top ? { color: top.colour, text: (top.who ? top.who + ' · ' : '') + top.type + (top.text ? ' — ' + top.text : '') } : { color: '#2A3560', text: '' };

    const runRows = runs.map((r) => ({ name: r.name, active: S.run === r.id, dot: S.run === r.id ? (done ? '#7CFF9A' : '#F2C14E') : r.live ? '#FF6B7A' : '#2A3560', meta: r.live ? 'LIVE' : r.id === S.run && T ? mmss(dur) : r.meta || '', pick: () => this.open(r.id) }));
    if (this._custom) runRows.push({ name: 'Własny log', active: S.run === 'custom', dot: '#9FE3FF', meta: S.run === 'custom' && T ? mmss(dur) : 'plik', pick: () => this.open('custom') });

    return {
      bp, sheet: bp === 's' && tab !== 'scene',
      sceneAria: 'Przestrzeń robocza przebiegu: ' + F.title + '. Przeciągnij, aby przesunąć; kliknij plik lub agenta, aby zobaczyć, co robił.',
      runLine: 'Agentspace · ' + runInfo.name,
      phases, kpis, clockNow: mmss(t), clockDur: mmss(dur), status: statusTxt,
      chips, isLive: !!runInfo.live, hasTicker: !!ticker.text, ticker,
      tabs,
      showOrder: bp === 'xl' || tab === 'order', showLog: bp === 'xl' || tab === 'log',
      runs: runRows, taskText: S.task,
      onTask: (e) => this.setState({ task: e && e.target ? e.target.value : '' }),
      matchNote: !S.task.trim() ? 'Wpisz zadanie albo wybierz zapisany przebieg.' : S.task === F.title ? 'Odtwarzam zapisany przebieg tego zadania.' : matched ? 'Najbliższy zapisany przebieg: ' + mname + '.' : 'Brak podobnego przebiegu — wybierz jeden z listy.',
      launch: () => { const m = S.task === F.title ? S.run : this.match(S.task); if (m) { this.open(m, S.task); if (bp === 's') this.setState({ tab: 'scene' }); } else this.setState({ note: 'Brak podobnego przebiegu' }); },
      log, logMeta: (A.idx + 1) + ' / ' + (T ? T.events.length : 0), logEmpty: !log.length,
      paneTeam: tab === 'team', paneCode: tab === 'code', paneTalk: tab === 'talk', paneFiles: tab === 'files', paneIns: tab === 'ins', paneReport: tab === 'report',
      team, teamMeta: team.length + (team.length === 1 ? ' agent' : ' agentów'), noTeam: !team.length,
      hasBrief: !!St.brief, briefText: St.brief ? St.brief.text : '', briefBy: St.brief ? St.brief.by : '',
      hasPlan: plan.length > 0, plan, planMeta: St.plan ? St.plan.done + ' / ' + St.plan.total : '',
      hasCode: !!St.code, code, hasTerm: !!St.term, term, noCode: !St.code && !St.term, codeMeta: St.code ? St.code.who : '',
      talk, talkMeta: talk.length + ' wiad.', noTalk: !talk.length,
      files, filesMeta: files.length + ' plików', noFiles: !files.length,
      hasSel: !!info, noSel: !info, ins, closeSel: () => { if (v) v.select(null); },
      report, reportReady: done, reportPending: !done,
      openReport: () => this.setState({ tab: 'report' }),
      onFile: (e) => {
        const f = e && e.target && e.target.files && e.target.files[0];
        if (!f) return;
        const rd = new FileReader();
        rd.onload = () => {
          const res = NW.parseJsonl(String(rd.result || ''));
          if (!res.events.length) { this.setState({ note: 'Brak poprawnych zdarzeń w pliku' }); return; }
          this._custom = res.events;
          this.setState({ note: res.events.length + ' zdarzeń' + (res.errors.length ? ', odrzucono ' + res.errors.length : '') });
          this.open('custom');
        };
        rd.readAsText(f);
      },
      note: S.note || (done ? 'Przebieg zakończony · raport gotowy' : T ? (A.idx + 1) + ' / ' + T.events.length + ' zdarzeń' : ''),
      isPlaying: playing, notPlaying: !playing, playAria: playing ? 'Wstrzymaj' : 'Odtwórz',
      togglePlay: () => { if (!v) return; if (v.playing) v.pause(); else v.play(); this.setState({ playing: v.playing }); },
      restart: () => { if (!v) return; v.setTime(0); v.play(); this.setState({ playing: true, idx: -1 }); },
      speeds: HX_SPEEDS.map((s) => ({ label: (s === 0.25 ? '0.25' : String(s)) + '×', active: S.speed === s, pick: () => { if (v) v.setSpeed(s); this.setState({ speed: s }); } })),
      scrub: String(dur ? Math.round((t / dur) * 1000) : 0),
      onScrub: (e) => { if (!v || !T) return; v.setLive(false); v.pause(); v.setTime((Number(e.target.value) / 1000) * dur); this.setState({ playing: false, tick: Math.round(v.t / 100) }); },
      follow: S.follow,
      toggleFollow: () => { if (!v) return; const on = !S.follow; v.setFocus(on); this.setState({ follow: on }); },
      zoomIn: () => v && v.zoom(1.2), zoomOut: () => v && v.zoom(1 / 1.2),
      resetCam: () => { if (v) v.reset(); },
    };
  }
}
