#!/usr/bin/env node
// Builds the demo runs in demo/runs/*.jsonl (deterministic; rerun after changing the scenarios).
//  - repo-fix:  the example "przeanalizuj repo, znajdź problem i go napraw" (planner, research, coder, tester,
//               memory, an MCP gateway, a failing then passing test)
//  - medytacja / panel / niemcy: the three scripted Hermes team runs rewritten as workflow events
// These are RECORDED DEMO RUNS, not live output: a real producer sends the same event shapes (see README).
import fs from 'node:fs';
import path from 'node:path';
const DIR = path.dirname(new URL(import.meta.url).pathname);
const T0 = Date.parse('2026-10-06T10:00:00Z');

function writer(run) {
  const evs = [];
  return {
    at(t, type, o) { evs.push(Object.assign({ ts: T0 + Math.round(t * 1000), run, type }, o || {})); },
    save() {
      evs.sort((a, b) => a.ts - b.ts);
      fs.writeFileSync(path.join(DIR, 'runs', run + '.jsonl'), evs.map((e) => JSON.stringify(e)).join('\n') + '\n');
      return evs.length;
    },
  };
}

// ---------------------------------------------------------------- repo-fix
function repoFix() {
  const w = writer('repo-fix');
  w.at(0, 'task.started', { text: 'Przeanalizuj repo, znajdź problem i go napraw.', user: 'Michał' });
  w.at(0.8, 'hermes.reasoning', { text: 'Cel: znaleźć przyczynę błędu i dostarczyć poprawkę z testem.', tokens: 820 });
  w.at(1.6, 'memory.read', { agent: 'hermes', resource: 'kontekst/ostatnie_zgloszenia', text: 'Przypomnienie: zgłoszenie o zrywaniu połączenia mostu.' });
  w.at(2.4, 'planner.step', { text: 'Plan: 1) rozpoznanie repo i zgłoszeń, 2) diagnoza w kodzie, 3) poprawka, 4) testy, 5) raport.', tokens: 640 });
  w.at(3.2, 'agent.spawned', { agent: 'research', label: 'Research', text: 'Zbiera kontekst: README, zgłoszenia, dokumentacja.' });
  w.at(3.6, 'message.sent', { agent: 'hermes', to: 'research', tone: 'assign', text: 'Zbierz kontekst: co robi most i co mówią zgłoszenia.' });
  w.at(4.3, 'tool.started', { agent: 'research', tool: 'repo_search', text: 'Przeszukanie repozytorium.' });
  ['README.md', 'docs/architecture.md', 'docs/events.md', 'docs/deploy.md', 'package.json', 'CHANGELOG.md', '.env.example', 'src/index.js', 'src/bridge.js', 'src/server.js', 'src/events/bus.js', 'src/transport/ws.js', 'scripts/start.sh', 'docker-compose.yml'].forEach((f, i) => w.at(4.6 + i * 0.12, 'file.read', { agent: 'research', tool: 'repo_search', resource: f }));
  w.at(6.4, 'tool.completed', { agent: 'research', tool: 'repo_search', latencyMs: 2100 });
  w.at(6.8, 'gateway.call', { agent: 'research', name: 'GitHub MCP', text: 'Pobranie otwartych zgłoszeń.', latencyMs: 640 });
  w.at(7.4, 'resource.read', { agent: 'research', resource: 'github/issues/41', text: 'Most zrywa połączenie po 30 s bezczynności.' });
  w.at(7.9, 'resource.read', { agent: 'research', resource: 'github/issues/44' });
  w.at(8.5, 'tool.started', { agent: 'research', tool: 'web_search', text: 'Dokumentacja keep-alive dla WebSocket.' });
  w.at(9.4, 'resource.read', { agent: 'research', tool: 'web_search', resource: 'https://developer.mozilla.org/WebSocket' });
  w.at(10.0, 'resource.read', { agent: 'research', tool: 'web_search', resource: 'https://github.com/websockets/ws#ping' });
  w.at(10.6, 'tool.completed', { agent: 'research', tool: 'web_search', latencyMs: 2100, tokens: 1900 });
  w.at(11.2, 'agent.spawned', { agent: 'coder', label: 'Coding', text: 'Diagnozuje i poprawia kod.' });
  w.at(11.5, 'message.sent', { agent: 'research', to: 'coder', tone: 'handoff', text: 'Podejrzenie: brak ping/pong w bridge.js, timeout proxy 30 s.' });
  w.at(12.3, 'tool.started', { agent: 'coder', tool: 'read' });
  ['src/bridge.js', 'src/server.js', 'src/events/bus.js', 'src/config.js', 'src/transport/ws.js', 'src/transport/http.js', 'src/events/schema.js', 'src/util/timer.js', 'src/util/log.js', 'test/bridge.test.js', 'test/server.test.js'].forEach((f, i) => w.at(12.6 + i * 0.27, 'file.read', { agent: 'coder', tool: 'read', resource: f }));
  w.at(15.6, 'tool.completed', { agent: 'coder', tool: 'read', latencyMs: 3300 });
  w.at(16.1, 'hermes.reasoning', { text: 'Diagnoza potwierdzona: połączenie bez heartbeat, proxy zamyka je po 30 s.', tokens: 540, confidence: 0.82 });
  w.at(16.8, 'memory.write', { agent: 'coder', resource: 'kontekst/diagnoza', text: 'Przyczyna: brak heartbeat w bridge.js.' });
  w.at(17.4, 'tool.started', { agent: 'coder', tool: 'edit' });
  w.at(18.2, 'file.modified', { agent: 'coder', tool: 'edit', resource: 'src/bridge.js', text: 'Dodano ping co 15 s i obsługę pong.', tokens: 1200 });
  w.at(19.0, 'file.modified', { agent: 'coder', tool: 'edit', resource: 'src/config.js', text: 'Nowa opcja heartbeatMs.' });
  w.at(19.6, 'file.created', { agent: 'coder', tool: 'edit', resource: 'test/bridge.heartbeat.test.js', text: 'Test regresyjny.' });
  w.at(20.2, 'tool.completed', { agent: 'coder', tool: 'edit', latencyMs: 2800 });
  w.at(20.8, 'agent.spawned', { agent: 'tester', label: 'Tester', text: 'Uruchamia testy i sprawdza regresje.' });
  w.at(21.0, 'message.sent', { agent: 'coder', to: 'tester', tone: 'handoff', text: 'Poprawka gotowa, uruchom testy mostu.' });
  w.at(21.6, 'tool.started', { agent: 'tester', tool: 'terminal', text: 'npm test' });
  w.at(22.1, 'test.started', { agent: 'tester', name: 'bridge.heartbeat' });
  w.at(22.3, 'test.started', { agent: 'tester', name: 'bridge.reconnect' });
  w.at(23.6, 'test.passed', { agent: 'tester', name: 'bridge.heartbeat', latencyMs: 1500 });
  w.at(24.4, 'test.failed', { agent: 'tester', name: 'bridge.reconnect', text: 'Po ponownym połączeniu timer ping nie jest czyszczony.' });
  w.at(24.6, 'error', { agent: 'tester', text: '1 test nie przechodzi.' });
  w.at(25.0, 'tool.completed', { agent: 'tester', tool: 'terminal', latencyMs: 3400 });
  w.at(25.4, 'message.sent', { agent: 'tester', to: 'coder', tone: 'critique', text: 'reconnect: wyciek timera po zerwaniu połączenia.' });
  w.at(26.2, 'tool.started', { agent: 'coder', tool: 'edit' });
  w.at(27.0, 'file.modified', { agent: 'coder', tool: 'edit', resource: 'src/bridge.js', text: 'Czyszczenie timera w on("close").' });
  w.at(27.6, 'tool.completed', { agent: 'coder', tool: 'edit', latencyMs: 1400 });
  w.at(28.0, 'message.sent', { agent: 'coder', to: 'tester', tone: 'revision', text: 'Poprawione, proszę o powtórkę.' });
  w.at(28.6, 'tool.started', { agent: 'tester', tool: 'terminal', text: 'npm test' });
  ['bridge.heartbeat', 'bridge.reconnect', 'bus.dispatch', 'server.health'].forEach((n, i) => { w.at(29 + i * 0.3, 'test.started', { agent: 'tester', name: n }); w.at(30.4 + i * 0.5, 'test.passed', { agent: 'tester', name: n }); });
  w.at(32.6, 'tool.completed', { agent: 'tester', tool: 'terminal', latencyMs: 4000 });
  w.at(33.0, 'agent.completed', { agent: 'tester' });
  w.at(33.4, 'result.returned', { agent: 'tester', text: 'Wszystkie testy przechodzą (4/4).' });
  w.at(33.9, 'result.returned', { agent: 'coder', text: 'Poprawka: heartbeat + czyszczenie timera.' });
  w.at(34.2, 'agent.completed', { agent: 'coder' });
  w.at(34.4, 'agent.completed', { agent: 'research' });
  w.at(35.0, 'hermes.reasoning', { text: 'Składam raport: przyczyna, zmiana, dowód z testów.', tokens: 700, confidence: 0.93 });
  w.at(36.0, 'task.completed', { text: 'Naprawiono zrywanie połączenia mostu; testy 4/4.' });
  return w.save();
}

// ---------------------------------------------------------------- scripted Hermes teams
const TONE = { brief: 'assign', assign: 'assign', question: 'question', answer: 'answer', handoff: 'handoff', critique: 'critique', revision: 'revision', approve: 'approve', result: 'result' };
function slug(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); }

const POOL = {
  R: [{ src: 'zrodlo', draft: 'notatka', ext: 'md' }, { src: 'raport_branzowy', draft: 'zestawienie', ext: 'csv' }, { src: 'wpis_forum', draft: 'cytaty', ext: 'txt' }, { src: 'opinia', draft: 'tabela', ext: 'csv' }, { src: 'dane', draft: 'wykres', ext: 'png' }],
  C: [{ src: 'brief', draft: 'szkic', ext: 'md' }, { src: 'wzor', draft: 'wariant', ext: 'md' }, { src: 'referencja', draft: 'makieta', ext: 'png' }, { src: 'notatka', draft: 'fragment', ext: 'txt' }, { src: 'kod', draft: 'modul', ext: 'js' }],
  Q: [{ src: 'wymaganie', draft: 'checklista', ext: 'md' }, { src: 'przypadek', draft: 'uwagi', ext: 'txt' }, { src: 'log', draft: 'raport_testu', ext: 'json' }],
  D: [{ src: 'sekcja', draft: 'rozdzial', ext: 'md' }, { src: 'zalacznik', draft: 'pakiet', ext: 'zip' }, { src: 'uwaga', draft: 'spis', ext: 'md' }],
};
function team(id) {
  const sc = JSON.parse(fs.readFileSync(path.join(DIR, 'scenarios', id + '.json'), 'utf8'));
  const ex = JSON.parse(fs.readFileSync(path.join(DIR, 'scenarios', id + '.extra.json'), 'utf8'));
  const w = writer(id);
  w.at(0, 'task.started', { text: sc.task });
  const an = sc.analysis || {};
  w.at(0.6, 'hermes.reasoning', { text: 'Cel: ' + an.goal, tokens: 600 });
  (an.constraints || []).forEach((c, i) => w.at(1.7 + i * 0.5, 'hermes.reasoning', { text: 'Ograniczenie: ' + c }));
  (an.success || []).forEach((c, i) => w.at(3.1 + i * 0.5, 'hermes.reasoning', { text: 'Kryterium: ' + c }));
  (an.risks || []).forEach((c, i) => w.at(4.5 + i * 0.45, 'hermes.reasoning', { text: 'Ryzyko: ' + c }));
  w.at(6, 'planner.step', { text: 'Skład zespołu: ' + sc.agents.map((a) => a.short).join(', ') + '.' });
  sc.agents.forEach((a) => w.at(a.spawn, 'agent.spawned', { agent: a.id, label: a.short, text: a.name + ' — ' + a.why }));
  // each task -> tool session; tool name from the agent's tool list
  const used = {};
  (sc.tasks || []).forEach((k) => {
    const a = sc.agents.find((x) => x.id === k.agent);
    if (!a) return;
    const n = (used[a.id] = (used[a.id] || 0) + 1);
    const tool = slug(a.tools[(n - 1) % a.tools.length]);
    w.at(k.from, 'tool.started', { agent: a.id, tool, text: k.label });
    // the agent's working steps while the tool runs: sources read and drafts written (~1 per 0.7 s)
    const steps = Math.max(2, Math.round((k.to - k.from) / 0.7));
    const pool = POOL[a.line] || POOL.R;
    for (let i = 0; i < steps; i++) {
      const tt = k.from + ((i + 0.5) * (k.to - k.from)) / steps;
      const p = pool[(i + n) % pool.length];
      if (i % 3 === 2) w.at(tt, i % 6 === 5 ? 'file.modified' : 'file.created', { agent: a.id, tool, resource: a.id + '/' + tool + '/' + p.draft + '_' + n + '_' + Math.ceil(i / 3) + '.' + p.ext, text: k.label });
      else w.at(tt, 'resource.read', { agent: a.id, tool, resource: a.id + '/' + tool + '/' + p.src + '_' + n + '_' + (i + 1), text: k.label });
    }
    w.at(k.to, k.review ? 'test.passed' : 'tool.completed', k.review ? { agent: a.id, name: slug(k.label) } : { agent: a.id, tool, latencyMs: Math.round((k.to - k.from) * 1000) });
    if (k.review) w.at(k.from + 0.1, 'test.started', { agent: a.id, name: slug(k.label) });
  });
  const born = new Set();
  sc.events.forEach((e) => {
    const from = e.from === 'hermes' ? 'hermes' : e.from;
    if (e.to === 'user') w.at(e.t, 'result.returned', { agent: from === 'hermes' ? 'hermes' : from, text: e.text });
    else w.at(e.t, 'message.sent', { agent: from, to: e.to, tone: TONE[e.kind] || 'handoff', text: e.text });
    if (e.attach && from !== 'hermes') {
      w.at(e.t - 0.3, born.has(e.attach) ? 'file.modified' : 'file.created', { agent: from, resource: 'projekt/' + e.attach, text: e.text });
      born.add(e.attach);
      if (e.to !== 'hermes' && e.to !== 'user') w.at(e.t + 1.4, 'file.read', { agent: e.to, resource: 'projekt/' + e.attach });
    }
    if (e.kind === 'approve') w.at(e.t + 0.2, 'agent.completed', { agent: from });
  });
  (ex.decisions || []).forEach((d) => w.at(d.t, 'memory.write', { agent: d.agents[0], resource: 'decyzje/' + d.id, text: d.title + ' — ' + d.why }));
  const last = {};
  (sc.tasks || []).forEach((k) => { last[k.agent] = Math.max(last[k.agent] || 0, k.to); });
  Object.entries(last).forEach(([a, t]) => w.at(Math.min(t + 0.4, 57), 'agent.completed', { agent: a }));
  w.at(58.5, 'task.completed', { text: sc.report.title });
  return w.save();
}

fs.mkdirSync(path.join(DIR, 'runs'), { recursive: true });
console.log('repo-fix', repoFix());
for (const id of ['medytacja', 'panel', 'niemcy']) console.log(id, team(id));
