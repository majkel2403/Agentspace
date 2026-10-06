#!/usr/bin/env node
// Builds the demo runs in demo/runs/*.jsonl (deterministic; rerun after changing the scenarios).
//  - repo-fix:  the example "przeanalizuj repo, znajdź problem i go napraw" (planner, research, coder, tester,
//               memory, an MCP gateway, a failing then passing test)
//  - medytacja / panel / niemcy: the three scripted Hermes team runs rewritten as workflow events
// These are RECORDED DEMO RUNS, not live output: a real producer sends the same event shapes (see README).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
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
// The example "przeanalizuj repo, znajdź problem i go napraw" on a REAL repository tree (file list of
// socketio/socket.io, demo/workspaces/socket.io.txt — or your own: --workspace <dir> uses `git ls-files`).
// The tree is real; the bug and the fix in the story are a demonstration.
function workspace() {
  const i = process.argv.indexOf('--workspace');
  if (i >= 0) {
    const dir = process.argv[i + 1];
    const files = execFileSync('git', ['-C', dir, 'ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean).slice(0, 5000);
    return { name: path.basename(path.resolve(dir)), files };
  }
  const lines = fs.readFileSync(path.join(DIR, 'workspaces', 'socket.io.txt'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
  return { name: 'socket.io', files: lines };
}
function repoFix() {
  const w = writer('repo-fix');
  const ws = workspace();
  const has = (f) => ws.files.includes(f);
  // pick real paths by pattern (falls back to any file so a custom workspace works too)
  const pickAll = (re, n) => ws.files.filter((f) => re.test(f)).slice(0, n);
  const pick = (re, i = 0) => pickAll(re, i + 1)[i] || ws.files[(i * 7919) % ws.files.length];
  const readme = has('README.md') ? 'README.md' : pick(/readme/i);
  const docs = pickAll(/^docs\/.*\.md$/, 6);
  const core = pick(/engine\.io-client\/lib\/socket\.ts$/);
  const transport = pick(/engine\.io-client\/lib\/transport\.ts$/);
  const ws1 = pick(/engine\.io-client\/lib\/transports\/websocket\.ts$/);
  const server = pick(/packages\/engine\.io\/lib\/socket\.ts$/);
  const srcReads = pickAll(/engine\.io-client\/lib\/.*\.ts$/, 12);
  const serverReads = pickAll(/packages\/engine\.io\/lib\/.*\.ts$/, 8);
  const tests = pickAll(/engine\.io-client\/test\/[^/]+\.js$/, 6);
  const testDir = core.split('/').slice(0, -2).join('/') + '/test/';
  const newTest = testDir + 'heartbeat-reconnect.js';

  w.at(0, 'task.started', { text: 'Przeanalizuj repo, znajdź problem i go napraw.', user: 'Michał' });
  w.at(0.6, 'hermes.reasoning', { text: 'Cel: znaleźć przyczynę zgłoszonego błędu i dostarczyć poprawkę z testem.', tokens: 820 });
  w.at(1.2, 'memory.read', { agent: 'hermes', resource: 'kontekst/ostatnie_zgloszenia', text: 'Zgłoszenie: po ponownym połączeniu klient rozłącza się po ~25 s.' });
  w.at(1.8, 'planner.step', { text: 'Plan: 1) rozpoznanie repo, 2) diagnoza w kodzie, 3) poprawka, 4) testy, 5) raport.', tokens: 640 });
  w.at(2.4, 'agent.spawned', { agent: 'research', label: 'Research', text: 'Rozpoznaje repozytorium i zgłoszenia.' });
  w.at(2.7, 'message.sent', { agent: 'hermes', to: 'research', tone: 'assign', text: 'Zrób mapę repo i znajdź kod odpowiedzialny za heartbeat.' });
  w.at(3.0, 'tool.started', { agent: 'research', tool: 'git ls-files', text: 'Lista plików repozytorium.' });
  // the whole tree arrives through real listing events, one per top-level directory, spread over ~20 s
  const groups = new Map();
  for (const f of ws.files) { const top = f.includes('/') ? f.split('/')[0] : '.'; if (!groups.has(top)) groups.set(top, []); groups.get(top).push(f); }
  const order = [...groups.keys()].sort((a, b) => (a === 'packages' ? -1 : b === 'packages' ? 1 : groups.get(b).length - groups.get(a).length));
  order.forEach((g, i) => w.at(3.3 + i * (20 / Math.max(1, order.length)), 'workspace.scanned', { agent: 'research', tool: 'git ls-files', resource: ws.name, paths: groups.get(g), text: g + ': ' + groups.get(g).length + ' plików' }));
  w.at(24.0, 'tool.completed', { agent: 'research', tool: 'git ls-files', latencyMs: 20700, text: ws.files.length + ' plików' });
  // research reads key files while scan is still happening (interleaved)
  w.at(9.3, 'tool.started', { agent: 'research', tool: 'read' });
  [readme, ...docs].forEach((f, i) => w.at(9.5 + i * 0.8, 'file.read', { agent: 'research', tool: 'read', resource: f }));
  w.at(16.2, 'tool.completed', { agent: 'research', tool: 'read', latencyMs: 6900 });
  w.at(16.8, 'gateway.call', { agent: 'research', name: 'GitHub MCP', resource: 'issues', text: 'Pobranie otwartych zgłoszeń o rozłączeniach.', latencyMs: 640 });
  w.at(17.5, 'tool.started', { agent: 'research', tool: 'web_search', text: 'Specyfikacja ping/pong protokołu Engine.IO.' });
  w.at(18.3, 'resource.read', { agent: 'research', tool: 'web_search', resource: 'https://socket.io/docs/v4/engine-io-protocol/' });
  w.at(18.9, 'resource.read', { agent: 'research', tool: 'web_search', resource: 'https://developer.mozilla.org/docs/Web/API/WebSocket' });
  w.at(19.5, 'tool.completed', { agent: 'research', tool: 'web_search', latencyMs: 2000, tokens: 1900 });
  w.at(25.2, 'agent.spawned', { agent: 'coder', label: 'Coder', text: 'Diagnozuje i poprawia kod.' });
  w.at(25.5, 'message.sent', { agent: 'research', to: 'coder', tone: 'handoff', text: 'Podejrzenie: timer pingTimeout nie jest czyszczony przy ponownym połączeniu (' + core + ').' });
  w.at(26.0, 'tool.started', { agent: 'coder', tool: 'read' });
  [...srcReads, ...serverReads].forEach((f, i) => w.at(26.3 + i * 0.35, 'file.read', { agent: 'coder', tool: 'read', resource: f }));
  w.at(34.5, 'tool.completed', { agent: 'coder', tool: 'read', latencyMs: 8500 });
  w.at(35.0, 'hermes.reasoning', { text: 'Diagnoza: przy ponownym połączeniu stary timer pingTimeout zamyka nowe połączenie.', tokens: 540, confidence: 0.82 });
  w.at(35.5, 'memory.write', { agent: 'coder', resource: 'kontekst/diagnoza', text: 'Przyczyna: niewyczyszczony pingTimeoutTimer.' });
  w.at(36.0, 'tool.started', { agent: 'coder', tool: 'edit' });
  w.at(36.7, 'file.modified', { agent: 'coder', tool: 'edit', resource: core, text: 'clearTimeout(pingTimeoutTimer) przy zamknięciu i ponownym otwarciu.', tokens: 1200 });
  w.at(37.4, 'file.modified', { agent: 'coder', tool: 'edit', resource: transport, text: 'Zdarzenie close przekazuje powód.' });
  w.at(38.0, 'file.created', { agent: 'coder', tool: 'edit', resource: newTest, text: 'Test regresyjny: ponowne połączenie nie dziedziczy timera.' });
  w.at(38.5, 'tool.completed', { agent: 'coder', tool: 'edit', latencyMs: 2500 });
  w.at(38.8, 'agent.spawned', { agent: 'tester', label: 'Tester', text: 'Uruchamia testy i sprawdza regresje.' });
  w.at(39.0, 'message.sent', { agent: 'coder', to: 'tester', tone: 'handoff', text: 'Poprawka gotowa, uruchom testy klienta.' });
  w.at(39.5, 'tool.started', { agent: 'tester', tool: 'terminal', text: 'npm test' });
  const names = [newTest, ...tests.slice(0, 4)];
  names.forEach((f, i) => w.at(39.9 + i * 0.3, 'file.read', { agent: 'tester', tool: 'terminal', resource: f }));
  w.at(41.5, 'test.started', { agent: 'tester', name: 'heartbeat-reconnect' });
  w.at(41.7, 'test.started', { agent: 'tester', name: 'socket' });
  w.at(42.9, 'test.passed', { agent: 'tester', name: 'socket', latencyMs: 1500 });
  w.at(43.6, 'test.failed', { agent: 'tester', name: 'heartbeat-reconnect', text: 'Po zamknięciu transportu timer nadal działa (transport websocket).' });
  w.at(43.8, 'error', { agent: 'tester', text: '1 test nie przechodzi.' });
  w.at(44.1, 'tool.completed', { agent: 'tester', tool: 'terminal', latencyMs: 4600 });
  w.at(44.5, 'message.sent', { agent: 'tester', to: 'coder', tone: 'critique', text: 'heartbeat-reconnect: transport websocket nie czyści timera.' });
  w.at(45.1, 'tool.started', { agent: 'coder', tool: 'edit' });
  w.at(45.7, 'file.read', { agent: 'coder', tool: 'edit', resource: ws1 });
  w.at(46.4, 'file.modified', { agent: 'coder', tool: 'edit', resource: ws1, text: 'onClose czyści timer także dla websocket.' });
  w.at(46.9, 'tool.completed', { agent: 'coder', tool: 'edit', latencyMs: 1800 });
  w.at(47.2, 'message.sent', { agent: 'coder', to: 'tester', tone: 'revision', text: 'Poprawione, proszę o powtórkę.' });
  w.at(47.7, 'tool.started', { agent: 'tester', tool: 'terminal', text: 'npm test' });
  ['heartbeat-reconnect', 'socket', 'connection', 'transport'].forEach((n, i) => { w.at(48.1 + i * 0.3, 'test.started', { agent: 'tester', name: n }); w.at(49.4 + i * 0.45, 'test.passed', { agent: 'tester', name: n }); });
  w.at(51.4, 'tool.completed', { agent: 'tester', tool: 'terminal', latencyMs: 3700 });
  w.at(51.7, 'agent.completed', { agent: 'tester' });
  w.at(52.0, 'result.returned', { agent: 'tester', text: 'Wszystkie testy przechodzą (4/4).' });
  w.at(52.4, 'result.returned', { agent: 'coder', text: 'Poprawka: czyszczenie timera pingTimeout w ' + core.split('/').pop() + ' i ' + ws1.split('/').pop() + '.' });
  w.at(52.7, 'agent.completed', { agent: 'coder' });
  w.at(52.9, 'agent.completed', { agent: 'research' });
  w.at(53.4, 'hermes.reasoning', { text: 'Składam raport: przyczyna, zmiana, dowód z testów.', tokens: 700, confidence: 0.93 });
  w.at(54.2, 'task.completed', { text: 'Naprawiono rozłączanie po ponownym połączeniu; testy 4/4.' });
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
