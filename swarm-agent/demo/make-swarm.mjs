#!/usr/bin/env node
// Builds the recorded demo runs in demo/runs/*.jsonl (deterministic; rerun after changing the scripts).
//   swarm-refaktor  the queen splits a refactor among scouts, workers, a critic and a tester. The file list is REAL
//                   (socket.io, demo/workspaces/socket.io.txt; --workspace <git dir> uses another repository).
//   swarm-zwiad     three scouts read six sources, workers compare them, the queen writes one report.
// Recorded demos: the tree is real, the conversation and the results are a demonstration. A real producer sends the
// same events (src/events.js) to POST /api/runs/:id/events.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const T0 = Date.parse('2026-10-06T10:00:00Z');

function writer(run) {
  const evs = [];
  return {
    at(t, type, o) { evs.push({ ts: T0 + Math.round(t * 1000), type, ...(o || {}) }); },
    save() {
      evs.sort((a, b) => a.ts - b.ts);
      fs.writeFileSync(path.join(HERE, 'runs', run + '.jsonl'), evs.map((e) => JSON.stringify(e)).join('\n') + '\n');
      return evs.length;
    },
  };
}

function workspace() {
  const i = process.argv.indexOf('--workspace');
  if (i >= 0) {
    const dir = process.argv[i + 1];
    const files = execFileSync('git', ['-C', dir, 'ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean).slice(0, 5000);
    return { name: path.basename(path.resolve(dir)), files };
  }
  const files = fs.readFileSync(path.join(HERE, 'workspaces', 'socket.io.txt'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
  return { name: 'socket.io', files };
}

const PLAN = ['Zwiad modułów połączeń', 'Zmiana transportu i gniazda', 'Test reconnectu', 'Recenzja i raport'];

function refaktor() {
  const w = writer('swarm-refaktor');
  const ws = workspace();
  const pick = (re, i = 0) => ws.files.filter((f) => re.test(f))[i] || ws.files[(i * 7919) % ws.files.length];
  const sock = pick(/engine\.io-client\/lib\/socket\.ts$/);
  const trans = pick(/engine\.io-client\/lib\/transport\.ts$/);
  const wsT = pick(/engine\.io-client\/lib\/transports\/websocket\.ts$/);
  const test = 'test/reconnect.test.ts';

  w.at(0, 'run.started', { text: 'Zrefaktoryzuj moduł połączeń i dopisz testy reconnectu.' });
  w.at(1, 'queen.thought', { text: 'Rozbijam zlecenie: zwiad po kodzie, dwie zmiany równolegle, test, recenzja.' });
  w.at(2, 'plan.updated', { steps: PLAN, step: 0 });
  w.at(3, 'scan', { agent: 'scout-a', paths: ws.files.slice(0, 400) });

  const spawn = (t, agent, label, text) => w.at(t, 'agent.spawned', { agent, parent: 'queen', label, role: label.split(' ')[0], text });
  spawn(5, 'scout-a', 'Zwiadowca A', 'mapuje moduł klienta');
  spawn(5.4, 'scout-b', 'Zwiadowca B', 'czyta testy i heartbeat');
  spawn(5.8, 'worker-a', 'Programista A', 'transport');
  spawn(6.2, 'worker-b', 'Programista B', 'gniazdo i reconnect');
  spawn(6.6, 'critic', 'Recenzent', 'sprawdza zmiany');
  spawn(7, 'tester', 'Tester', 'uruchamia testy');

  w.at(7.8, 'message.sent', { from: 'queen', to: 'worker-a', tone: 'assign', task: 'Zmiana transportu', text: 'Wyczyść timery przy zamknięciu.' });
  w.at(7.9, 'message.sent', { from: 'queen', to: 'worker-b', tone: 'assign', task: 'Gniazdo i reconnect', text: 'Reset stanu przy ponownym połączeniu.' });
  w.at(8, 'message.sent', { from: 'queen', to: 'scout-a', tone: 'assign', task: 'Mapa modułów połączeń', text: 'Znajdź, gdzie żyje reconnect i heartbeat.' });
  w.at(8.4, 'message.sent', { from: 'queen', to: 'scout-b', tone: 'assign', task: 'Testy połączeń', text: 'Co już jest przetestowane?' });

  w.at(9.5, 'tool.started', { agent: 'scout-a', tool: 'grep', command: 'grep -rn "reconnect" lib/' });
  w.at(10.5, 'tool.finished', { agent: 'scout-a', tool: 'grep', ok: true, text: '11 trafień w 4 plikach' });
  w.at(11, 'file.read', { agent: 'scout-a', path: sock });
  w.at(12, 'file.read', { agent: 'scout-a', path: trans });
  w.at(12.6, 'tool.started', { agent: 'scout-b', tool: 'read' });
  w.at(13.6, 'tool.finished', { agent: 'scout-b', tool: 'read', ok: true, text: '3 pliki testów' });
  w.at(14, 'file.read', { agent: 'scout-b', path: wsT });

  w.at(16, 'message.sent', { from: 'scout-a', to: 'queen', tone: 'result', text: 'Heartbeat i reconnect żyją w socket.ts; transport.ts zamyka gniazdo bez czyszczenia timera.' });
  w.at(17, 'result', { agent: 'scout-a', text: 'Mapa: socket.ts (pętla), transport.ts (zamknięcie).' });
  w.at(17.5, 'message.sent', { from: 'scout-b', to: 'queen', tone: 'result', text: 'Brak testu na ponowne połączenie po zamknięciu transportu.' });

  w.at(19, 'message.sent', { from: 'worker-a', to: 'worker-b', tone: 'question', text: 'Czy transport może zmienić stan gniazda?' });
  w.at(20, 'message.sent', { from: 'worker-b', to: 'worker-a', tone: 'answer', text: 'Tak, tylko przez zdarzenie close — wyczyść timer tam.' });
  w.at(20.5, 'plan.updated', { steps: PLAN, step: 1 });

  w.at(21.5, 'file.write', { agent: 'worker-a', path: trans, action: 'modified', lines: 3 });
  w.at(23, 'file.write', { agent: 'worker-b', path: sock, action: 'modified', lines: 2 });
  w.at(24, 'file.write', { agent: 'worker-b', path: test, action: 'created', lines: 3 });

  w.at(25.5, 'plan.updated', { steps: PLAN, step: 2 });
  w.at(26, 'message.sent', { from: 'worker-b', to: 'tester', tone: 'handoff', text: 'Zmiany gotowe, uruchom test reconnectu.' });
  w.at(27, 'tool.started', { agent: 'tester', tool: 'terminal', command: 'npm test -- reconnect' });
  w.at(29.5, 'test', { agent: 'tester', name: 'reconnect', status: 'failed', output: 'AssertionError: timer pingTimeout nie został wyczyszczony' });
  w.at(30, 'tool.finished', { agent: 'tester', tool: 'terminal', ok: false, text: '1 test nie przeszedł' });
  w.at(31, 'message.sent', { from: 'tester', to: 'worker-a', tone: 'critique', text: 'Test pada: timer żyje po zamknięciu transportu.' });
  w.at(32.5, 'file.write', { agent: 'worker-a', path: trans, action: 'modified', lines: 1 });
  w.at(34, 'message.sent', { from: 'worker-a', to: 'critic', tone: 'revision', text: 'Poprawiłem timer w transporcie. Sprawdź diff.' });
  w.at(35.5, 'message.sent', { from: 'critic', to: 'worker-a', tone: 'critique', text: 'Brakuje zerowania w ścieżce błędu.' });
  w.at(36.5, 'file.write', { agent: 'worker-a', path: trans, action: 'modified', lines: 1 });
  w.at(37.5, 'message.sent', { from: 'critic', to: 'queen', tone: 'approve', text: 'Zatwierdzam: obie ścieżki czyszczą timer.' });

  w.at(38.5, 'plan.updated', { steps: PLAN, step: 3 });
  w.at(39, 'tool.started', { agent: 'tester', tool: 'terminal', command: 'npm test' });
  w.at(40, 'test', { agent: 'tester', name: 'reconnect', status: 'passed' });
  w.at(40.4, 'test', { agent: 'tester', name: 'transport', status: 'passed' });
  w.at(40.8, 'test', { agent: 'tester', name: 'connection', status: 'passed' });
  w.at(41.4, 'tool.finished', { agent: 'tester', tool: 'terminal', ok: true, text: 'wszystkie testy przechodzą' });

  for (const a of ['scout-a', 'scout-b', 'worker-a', 'worker-b', 'critic', 'tester']) w.at(43, 'agent.finished', { agent: a });
  w.at(44, 'result', { agent: 'queen', text: 'Refaktor gotowy: 2 zmienione pliki, 1 nowy test, pełny zestaw zielony.' });
  w.at(45, 'run.completed', { text: 'Zrefaktoryzowano połączenia; reconnect czyści timery.' });
  return w.save();
}

function zwiad() {
  const w = writer('swarm-zwiad');
  const ws = workspace();
  const docs = ws.files.filter((f) => /\.md$/.test(f));
  const doc = (i) => docs[i % docs.length] || ws.files[i];
  const PLAN2 = ['Zebranie źródeł', 'Porównanie', 'Mapa i raport'];

  w.at(0, 'run.started', { text: 'Zbadaj sześć źródeł o protokole i zbuduj wspólną mapę.' });
  w.at(1, 'queen.thought', { text: 'Dzielę źródła między zwiadowców; porównanie robią programiści, wynik składam ja.' });
  w.at(2, 'plan.updated', { steps: PLAN2, step: 0 });
  const scouts = ['scout-a', 'scout-b', 'scout-c'];
  scouts.forEach((id, i) => w.at(4 + i * 0.4, 'agent.spawned', { agent: id, parent: 'queen', label: 'Zwiadowca ' + 'ABC'[i], role: 'Zwiadowca', text: 'źródła ' + (2 * i + 1) + '–' + (2 * i + 2) }));
  w.at(5.5, 'agent.spawned', { agent: 'worker-a', parent: 'queen', label: 'Programista A', role: 'Programista', text: 'porównanie' });
  w.at(5.9, 'agent.spawned', { agent: 'worker-b', parent: 'queen', label: 'Programista B', role: 'Programista', text: 'mapa' });
  w.at(6.3, 'agent.spawned', { agent: 'critic', parent: 'queen', label: 'Recenzent', role: 'Recenzent', text: 'sprawdza wnioski' });
  scouts.forEach((id, i) => w.at(8 + i * 0.3, 'message.sent', { from: 'queen', to: id, tone: 'assign', task: 'Źródła ' + (2 * i + 1) + '–' + (2 * i + 2), text: 'Przeczytaj i streść.' }));
  scouts.forEach((id, i) => {
    const t = 10 + i * 0.6;
    w.at(t, 'tool.started', { agent: id, tool: 'web_search', command: 'szukam źródeł' });
    w.at(t + 1.2, 'tool.finished', { agent: id, tool: 'web_search', ok: true, text: '2 źródła' });
    w.at(t + 2, 'file.read', { agent: id, path: doc(2 * i) });
    w.at(t + 3, 'file.read', { agent: id, path: doc(2 * i + 1) });
    w.at(t + 4.5, 'message.sent', { from: id, to: 'queen', tone: 'result', text: 'Streszczenie gotowe: ' + (2 * i + 2) + ' źródeł.' });
    w.at(t + 5, 'result', { agent: id, text: 'Streszczenie ' + (i + 1) + ' z 3' });
  });
  w.at(20, 'plan.updated', { steps: PLAN2, step: 1 });
  w.at(20.5, 'message.sent', { from: 'worker-a', to: 'scout-a', tone: 'question', text: 'Które źródło mówi o czasie oczekiwania?' });
  w.at(21, 'message.sent', { from: 'scout-a', to: 'worker-a', tone: 'answer', text: 'Źródło 2, sekcja o heartbeat.' });
  w.at(22.5, 'file.write', { agent: 'worker-a', path: 'raport/porownanie.md', action: 'created', lines: 3 });
  w.at(24, 'file.write', { agent: 'worker-b', path: 'raport/mapa.md', action: 'modified', lines: 1 });
  w.at(26, 'message.sent', { from: 'worker-b', to: 'critic', tone: 'handoff', text: 'Tabela i mapa gotowe.' });
  w.at(27.5, 'message.sent', { from: 'critic', to: 'worker-a', tone: 'critique', text: 'Dodaj źródło dla wartości domyślnej.' });
  w.at(29, 'file.write', { agent: 'worker-a', path: 'raport/porownanie.md', action: 'modified', lines: 1 });
  w.at(30.5, 'message.sent', { from: 'critic', to: 'queen', tone: 'approve', text: 'Wnioski zgodne ze źródłami.' });
  w.at(32, 'plan.updated', { steps: PLAN2, step: 2 });
  for (const a of [...scouts, 'worker-a', 'worker-b', 'critic']) w.at(33, 'agent.finished', { agent: a });
  w.at(34, 'file.write', { agent: 'queen', path: 'raport/raport.md', action: 'created', lines: 2 });
  w.at(35, 'result', { agent: 'queen', text: 'Raport gotowy: mapa, tabela i wnioski ze wszystkich źródeł.' });
  w.at(36, 'run.completed', { text: 'Zebrano i porównano sześć źródeł.' });
  return w.save();
}

const counts = [refaktor(), zwiad()];
console.log('swarm runs written:', counts.join(' + '), 'events');
