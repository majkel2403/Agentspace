// The command deck as HTML, drawn from the state at the log time. No state is kept here: every render is a function
// of (state, view), where view holds what the reader chose (run, speed, tab, selection). Clicks come back as data-act.
import { QUEEN } from './model.js';
import { colourOf as paint } from './palette.js';

export const TABS = [['msgs', 'Rozmowy'], ['files', 'Pliki'], ['plan', 'Plan'], ['tests', 'Testy'], ['log', 'Dziennik'], ['ins', 'Inspektor']];
const TONE_LABEL = { assign: 'ZLECENIE', question: 'PYTANIE', answer: 'ODPOWIEDŹ', result: 'WYNIK', handoff: 'PRZEKAZANIE', critique: 'UWAGA', revision: 'POPRAWKA', approve: 'ZATWIERDZONE' };
const STATE_LABEL = { idle: 'bezczynny', working: 'pracuje', done: 'skończył', failed: 'błąd' };
const FILE_LABEL = { idle: 'znany', read: 'czytany', created: 'nowy', modified: 'zmieniony', deleted: 'usunięty' };

export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const clock = (sec) => { const s = Math.max(0, Math.floor(sec)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const base = (p) => p.split('/').pop();

function labelOf(st, id) { if (!id) return ''; if (id === 'user') return 'Zlecający'; const a = st.agents.get(id); return a ? a.label : id; }

export const clockHTML = (v) => `${clock(v.t)}<span> / ${clock(v.duration)}</span>`;

export function headerHTML(st, v) {
  const status = v.live ? 'na żywo' : st.failed ? 'błąd' : st.done ? 'zakończony' : st.now > 0 ? 'w toku' : 'gotowy';
  const cls = v.live ? 'live' : st.failed ? 'failed' : st.done ? 'done' : 'run';
  return `
    <div class="brand"><span class="mark"></span><div><b>UL</b><small>plaster agentów</small></div></div>
    <div class="task"><span class="eyebrow">zlecenie</span><div class="title">${esc(st.task || v.run || 'brak przebiegu')}</div></div>
    <span class="pill ${cls}">${esc(status)}</span>
    <div class="clock" id="clock">${clockHTML(v)}</div>
    <div class="ctl">
      <button data-act="play" class="btn ${v.playing ? 'on' : ''}" title="Odtwórz / pauza (spacja)">${v.playing ? 'Pauza' : 'Odtwórz'}</button>
      ${[0.5, 1, 2, 4].map((s) => `<button data-act="speed" data-v="${s}" class="btn sm ${v.speed === s ? 'on' : ''}">${s}×</button>`).join('')}
      <button data-act="follow" class="btn ${v.follow ? 'on' : ''}" title="Kamera podąża za pracą (F)">Śledź</button>
      <button data-act="view" class="btn" title="Ul (plaster miodu) i Krajobraz uwagi (V)">${v.mode === 'land' ? 'Widok: krajobraz' : 'Widok: ul'}</button>
      <button data-act="director" class="btn ${v.director ? 'on' : ''}" title="Reżyser: kamera sama prowadzi do tego, kto teraz działa (D)">Reżyser</button>
      <button data-act="sound" class="btn ${v.sound ? 'on' : ''}" title="Dźwięk zdarzeń (M)">${v.sound ? 'Dźwięk: wł.' : 'Dźwięk: wył.'}</button>
      <button data-act="reset" class="btn" title="Cały rój w kadrze">Dopasuj</button>
    </div>
    <label class="runpick"><span>przebieg</span><select data-act="run">${v.runs.map((r) => `<option value="${esc(r.id)}" ${r.id === v.run ? 'selected' : ''}>${esc(r.title)}${r.source === 'live' ? ' · na żywo' : ''}</option>`).join('')}</select></label>`;
}

export function rosterHTML(st, v) {
  const rows = st.order.map((id) => st.agents.get(id)).filter(Boolean);
  const working = rows.filter((a) => a.status === 'working').length;
  return `<div class="sect"><span>zespół</span><b>${rows.length} agentów · ${working} pracuje</b></div>` +
    rows.map((a) => {
      const sel = v.selected === 'agent:' + a.id ? ' sel' : '';
      const where = a.at && st.files.has(a.at) ? 'przy ' + base(a.at) : a.at && st.agents.has(a.at) ? 'przy ' + labelOf(st, a.at) : '';
      const tool = a.tool ? `<div class="tool">${esc(a.tool)}${a.command ? ' · <code>' + esc(a.command) + '</code>' : ''}</div>` : '';
      return `<button class="agent${sel} ${esc(a.status)}" data-act="agent" data-id="${esc(a.id)}" style="--c:${paint(a.id, st.order)}">
        <span class="dot"></span>
        <span class="who"><b>${esc(a.label)}</b><small>${esc(a.role)}${a.parent && a.id !== QUEEN ? ' · z ' + esc(labelOf(st, a.parent)) : ''}</small></span>
        <span class="state">${esc(STATE_LABEL[a.status] || a.status)}</span>
        ${a.task ? `<div class="task-line">${esc(a.task)}</div>` : ''}
        ${tool}
        <div class="meta"><span>${esc(where)}</span><span>${a.touches} dotknięć</span></div>
      </button>`;
    }).join('');
}


export function deckHTML(st, v, events) {
  const tab = v.tab;
  const tabs = `<nav class="tabs">${TABS.map(([k, label]) => `<button class="tab ${tab === k ? 'on' : ''}" data-act="tab" data-v="${k}">${label}</button>`).join('')}</nav>`;
  let body = '';
  if (tab === 'msgs') {
    const list = st.messages.slice().reverse();
    body = list.length ? list.map((m) => `<article class="msg tone-${esc(m.tone)}" data-act="agent" data-id="${esc(m.from)}">
        <header><span class="tag">${esc(TONE_LABEL[m.tone] || m.tone)}</span><b>${esc(labelOf(st, m.from))}</b><span class="arrow">→</span><b>${esc(labelOf(st, m.to))}</b><time>${clock(m.t)}</time></header>
        <p>${esc(m.text)}</p>${m.task ? `<small>zadanie: ${esc(m.task)}</small>` : ''}</article>`).join('')
      : '<p class="empty">Jeszcze nikt do nikogo nie pisał.</p>';
  } else if (tab === 'files') {
    const list = [...st.files.values()].filter((f) => f.known && f.lastT >= 0).sort((a, b) => b.lastT - a.lastT || b.touches - a.touches);
    body = list.length ? `<table class="files"><thead><tr><th>plik</th><th>stan</th><th>dotknięć</th><th>ostatnio</th></tr></thead><tbody>${list.map((f) => `
      <tr class="st-${esc(f.state)} ${v.selected === 'file:' + f.path ? 'sel' : ''}" data-act="file" data-id="${esc(f.path)}">
        <td><b>${esc(base(f.path))}</b><small>${esc(f.path)}</small></td><td>${esc(FILE_LABEL[f.state])}</td><td>${f.touches}</td><td>${esc(labelOf(st, f.lastBy))} · ${clock(f.lastT)}</td></tr>`).join('')}</tbody></table>`
      : `<p class="empty">Żaden plik nie został jeszcze dotknięty. Znane pliki: ${[...st.files.values()].length}.</p>`;
  } else if (tab === 'plan') {
    const steps = st.plan.steps;
    body = steps.length ? `<ol class="plan">${steps.map((s, i) => `<li class="${i < st.plan.cur ? 'ok' : i === st.plan.cur ? 'now' : 'todo'}"><span>${i < st.plan.cur ? '✓' : i + 1}</span>${esc(s)}</li>`).join('')}</ol>`
      : '<p class="empty">Królowa jeszcze nie ułożyła planu.</p>';
  } else if (tab === 'tests') {
    const list = [...st.tests.entries()];
    body = list.length ? `<ul class="tests">${list.map(([name, t]) => `<li class="${esc(t.status)}"><b>${esc(name)}</b><span>${esc(t.status === 'passed' ? 'przeszedł' : 'nie przeszedł')} · ${esc(labelOf(st, t.by))} · ${clock(t.t)}</span>${t.output ? `<pre>${esc(t.output)}</pre>` : ''}</li>`).join('')}</ul>`
      : '<p class="empty">Testy jeszcze nie ruszyły.</p>';
  } else if (tab === 'log') {
    const upto = events.filter((e) => (e.ts - events[0].ts) / 1000 <= v.t + 1e-6).slice(-80).reverse();
    body = `<ol class="log">${upto.map((e) => `<li><time>${clock((e.ts - events[0].ts) / 1000)}</time><code>${esc(e.type)}</code><span>${esc(e.agent || e.from || '')}</span><em>${esc(e.text || e.path || e.name || e.command || '')}</em></li>`).join('')}</ol>`;
  } else {
    body = inspectorHTML(st, v, events);
  }
  return `${tabs}<div class="pane">${body}</div>`;
}

function inspectorHTML(st, v, events) {
  const sel = v.selected;
  if (!sel) return '<p class="empty">Kliknij agenta albo plik w scenie, albo w zespole, żeby zobaczyć, co robił.</p>';
  if (sel.startsWith('agent:')) {
    const a = st.agents.get(sel.slice(6));
    if (!a) return '<p class="empty">Ten agent jeszcze nie pojawił się w przebiegu.</p>';
    const msgs = st.messages.filter((m) => m.from === a.id || m.to === a.id).slice(-6).reverse();
    return `<div class="ins"><span class="eyebrow">${esc(a.role || 'agent')}</span><h3 style="color:${paint(a.id, st.order)}">${esc(a.label)}</h3>
      <dl><dt>stan</dt><dd>${esc(STATE_LABEL[a.status] || a.status)}</dd><dt>zadanie</dt><dd>${esc(a.task || '—')}</dd>
      <dt>narzędzie</dt><dd>${esc(a.tool || (a.toolOk === false ? 'ostatnie: błąd' : a.toolOk ? 'ostatnie: ok' : '—'))}</dd>
      <dt>czytał / zmieniał</dt><dd>${a.reads} / ${a.writes}</dd><dt>ostatnio</dt><dd>${esc(a.note || '—')}</dd></dl>
      <h4>rozmowy</h4>${msgs.length ? msgs.map((m) => `<p class="mini"><b>${esc(labelOf(st, m.from))}</b> → ${esc(labelOf(st, m.to))}: ${esc(m.text)}</p>`).join('') : '<p class="empty">brak</p>'}</div>`;
  }
  const path = sel.slice(5);
  const f = st.files.get(path);
  const hist = events.filter((e) => e.path === path && (e.ts - events[0].ts) / 1000 <= v.t + 1e-6).slice(-12).reverse();
  return `<div class="ins"><span class="eyebrow">plik</span><h3>${esc(base(path))}</h3><small class="path">${esc(path)}</small>
    <dl><dt>stan</dt><dd>${esc(f ? FILE_LABEL[f.state] : 'jeszcze nieznany')}</dd><dt>dotknięć</dt><dd>${f ? f.touches : 0}</dd>
    <dt>ostatnio</dt><dd>${f && f.lastBy ? esc(labelOf(st, f.lastBy)) + ' · ' + clock(f.lastT) : '—'}</dd></dl>
    <h4>historia</h4>${hist.length ? `<ul class="hist">${hist.map((e) => `<li><time>${clock((e.ts - events[0].ts) / 1000)}</time> ${esc(e.type)} · ${esc(labelOf(st, e.agent))}${e.action ? ' · ' + esc(e.action) : ''}</li>`).join('')}</ul>` : '<p class="empty">brak zdarzeń</p>'}</div>`;
}

export function timelineHTML(v, events, moments = []) {
  const next = v.nextMoment; const prev = v.prevMoment;
  const jump = `<div class="moments">
    <button class="btn sm" data-act="moment" data-v="-1" ${prev ? '' : 'disabled'} title="Poprzedni moment (P)">‹ ${prev ? esc(prev.kind) + ' · ' + clock(prev.t) : 'moment'}</button>
    <span class="now">${v.caption ? esc(v.caption.text) : ''}</span>
    <button class="btn sm" data-act="moment" data-v="1" ${next ? '' : 'disabled'} title="Następny moment (N)">${next ? esc(next.kind) + ' · ' + clock(next.t) : 'moment'} ›</button>
  </div>`;
  const marks = events.filter((e) => ['test', 'file.write', 'run.completed', 'run.failed', 'agent.finished'].includes(e.type))
    .map((e) => { const p = v.duration ? (e.ts - events[0].ts) / 1000 / v.duration * 100 : 0; return `<i class="mk ${esc(e.type.replace('.', '-'))}" style="left:${p.toFixed(2)}%"></i>`; }).join('');
  return `${jump}<div class="scrub"><input type="range" min="0" max="${v.duration.toFixed(3)}" step="0.05" value="${v.t.toFixed(3)}" data-act="seek" aria-label="Czas przebiegu"><div class="marks">${marks}</div></div>`;
}
