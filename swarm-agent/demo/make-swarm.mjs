#!/usr/bin/env node
// Builds the demo swarm runs in demo/runs/*.jsonl (deterministic; rerun after changing the scripts below).
//  - swarm-refaktor: the queen splits a task among scouts, workers, a critic and a tester on a REAL repository tree
//                    (file list of socketio/socket.io, demo/workspaces/socket.io.txt; or --workspace <git dir>)
//  - swarm-zwiad:    scouts read several sources in parallel, workers compare them, the queen writes one report
// These are RECORDED DEMO RUNS: the tree is real, the agents' conversation and results are a demonstration.
// A real producer sends the same event shapes (packages/core/events.js).
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

// ---------------------------------------------------------------- swarm-refaktor
function refaktor() {
  const w = writer('swarm-refaktor');
  const ws = workspace();
  const pick = (re, i = 0) => ws.files.filter((f) => re.test(f))[i] || ws.files[(i * 7919) % ws.files.length];
  const sock = pick(/engine\.io-client\/lib\/socket\.ts$/);
  const trans = pick(/engine\.io-client\/lib\/transport\.ts$/);
  const wsT = pick(/engine\.io-client\/lib\/transports\/websocket\.ts$/);
  const test = 'test/reconnect.test.ts';

  w.at(0, 'task.started', { text: 'Zrefaktoryzuj moduł połączeń i dopisz testy reconnectu.' });
  w.at(1, 'queen.reasoning', { text: 'Rozbijam zlecenie: zwiad po kodzie, dwie zmiany równolegle, test, recenzja.', tokens: 640, step: 0 });
  w.at(2, 'planner.step', { steps: ['Zwiad modułów połączeń', 'Zmiana transportu i gniazda', 'Test reconnectu', 'Recenzja i raport'], step: 0 });
  w.at(3, 'workspace.scanned', { agent: 'scout-a', resource: ws.name, paths: ws.files.slice(0, 400), tool: 'git ls-files' });

  w.at(5, 'agent.spawned', { agent: 'scout-a', parent: 'queen', label: 'Zwiadowca A', text: 'mapuje moduł klienta' });
  w.at(5.4, 'agent.spawned', { agent: 'scout-b', parent: 'queen', label: 'Zwiadowca B', text: 'czyta testy i heartbeat' });
  w.at(5.8, 'agent.spawned', { agent: 'worker-a', parent: 'queen', label: 'Programista A', text: 'transport' });
  w.at(6.2, 'agent.spawned', { agent: 'worker-b', parent: 'queen', label: 'Programista B', text: 'gniazdo i reconnect' });
  w.at(6.6, 'agent.spawned', { agent: 'critic', parent: 'queen', label: 'Recenzent', text: 'sprawdza zmiany' });
  w.at(7, 'agent.spawned', { agent: 'tester', parent: 'queen', label: 'Tester', text: 'uruchamia testy' });

  w.at(8, 'message.sent', { agent: 'queen', to: 'scout-a', tone: 'assign', task: 'Mapa modułów połączeń', text: 'Znajdź, gdzie żyje reconnect i heartbeat.' });
  w.at(7.8, 'message.sent', { agent: 'queen', to: 'worker-a', tone: 'assign', task: 'Zmiana transportu', text: 'Wyczyść timery przy zamknięciu.' });
  w.at(7.9, 'message.sent', { agent: 'queen', to: 'worker-b', tone: 'assign', task: 'Gniazdo i reconnect', text: 'Reset stanu przy ponownym połączeniu.' });
  w.at(8.4, 'message.sent', { agent: 'queen', to: 'scout-b', tone: 'assign', task: 'Testy połączeń', text: 'Co już jest przetestowane?' });

  w.at(9.5, 'tool.started', { agent: 'scout-a', tool: 'grep', command: 'grep -rn "reconnect" lib/', text: 'szukam reconnect' });
  w.at(10.5, 'tool.completed', { agent: 'scout-a', tool: 'grep', text: '11 trafień w 4 plikach' });
  w.at(11, 'file.read', { agent: 'scout-a', resource: sock, text: 'Socket: pętla ponownego połączenia' });
  w.at(12, 'file.read', { agent: 'scout-a', resource: trans, text: 'Transport: zamknięcie gniazda' });
  w.at(12.6, 'tool.started', { agent: 'scout-b', tool: 'read', text: 'testy połączeń' });
  w.at(13.6, 'tool.completed', { agent: 'scout-b', tool: 'read', text: '3 pliki testów' });
  w.at(14, 'file.read', { agent: 'scout-b', resource: wsT, text: 'WebSocket: czyszczenie timera' });

  w.at(16, 'message.sent', { agent: 'scout-a', to: 'queen', tone: 'result', text: 'Heartbeat i reconnect żyją w socket.ts; transport.ts zamyka gniazdo bez czyszczenia timera.' });
  w.at(17, 'result.returned', { agent: 'scout-a', text: 'Mapa: socket.ts (pętla), transport.ts (zamknięcie).' });
  w.at(17.5, 'message.sent', { agent: 'scout-b', to: 'queen', tone: 'result', text: 'Brak testu na ponowne połączenie po zamknięciu transportu.' });

  w.at(15, 'planner.step', { steps: ['Zwiad modułów połączeń', 'Zmiana transportu i gniazda', 'Test reconnectu', 'Recenzja i raport'], step: 1 });
  w.at(19, 'message.sent', { agent: 'worker-a', to: 'worker-b', tone: 'question', text: 'Czy transport może zmienić stan gniazda?' });
  w.at(20, 'message.sent', { agent: 'worker-b', to: 'worker-a', tone: 'answer', text: 'Tak, tylko przez zdarzenie close — wyczyść timer tam.' });

  w.at(21.5, 'file.modified', { agent: 'worker-a', resource: trans, line: 42, patch: '-  this.pingTimeoutTimer = setTimeout(...)\n+  this.clearTimers();\n   this.emit("close", reason);', text: 'transport: czyszczenie timerów przy zamknięciu' });
  w.at(23, 'file.modified', { agent: 'worker-b', resource: sock, line: 118, patch: '+  if (this.io.reconnecting) this.reset();\n   this.connect();', text: 'socket: reset przy ponownym połączeniu' });
  w.at(24, 'file.created', { agent: 'worker-b', resource: test, content: "it('ponowne połączenie nie dziedziczy timera', () => {\n  // zamknięcie transportu czyści pingTimeout\n});", text: 'nowy test regresyjny' });

  w.at(25.5, 'planner.step', { steps: ['Zwiad modułów połączeń', 'Zmiana transportu i gniazda', 'Test reconnectu', 'Recenzja i raport'], step: 2 });
  w.at(26, 'message.sent', { agent: 'worker-b', to: 'tester', tone: 'handoff', text: 'Zmiany gotowe, uruchom test reconnectu.' });
  w.at(27, 'tool.started', { agent: 'tester', tool: 'terminal', command: 'npm test -- reconnect', text: 'test reconnectu' });
  w.at(28, 'test.started', { agent: 'tester', name: 'reconnect' });
  w.at(29.5, 'test.failed', { agent: 'tester', name: 'reconnect', output: 'AssertionError: timer pingTimeout nie został wyczyszczony', text: 'porażka przed poprawką' });
  w.at(30, 'tool.failed', { agent: 'tester', tool: 'terminal', text: '1 test nie przeszedł' });

  w.at(31, 'message.sent', { agent: 'tester', to: 'worker-a', tone: 'critique', text: 'Test pada: timer żyje po zamknięciu transportu.' });
  w.at(32.5, 'file.modified', { agent: 'worker-a', resource: trans, line: 44, patch: '+  this.pingTimeoutTimer = undefined;', text: 'poprawka: zerowanie timera' });
  w.at(34, 'message.sent', { agent: 'worker-a', to: 'critic', tone: 'revision', text: 'Poprawiłem timer w transporcie. Sprawdź diff.' });
  w.at(35.5, 'message.sent', { agent: 'critic', to: 'worker-a', tone: 'critique', text: 'Brakuje zerowania w ścieżce błędu.' });
  w.at(36.5, 'file.modified', { agent: 'worker-a', resource: trans, line: 51, patch: '+  this.pingTimeoutTimer = undefined; // także w błędzie', text: 'zerowanie w ścieżce błędu' });
  w.at(37.5, 'message.sent', { agent: 'critic', to: 'queen', tone: 'approve', text: 'Zatwierdzam: obie ścieżki czyszczą timer.' });

  w.at(38.5, 'planner.step', { steps: ['Zwiad modułów połączeń', 'Zmiana transportu i gniazda', 'Test reconnectu', 'Recenzja i raport'], step: 3 });
  w.at(39, 'tool.started', { agent: 'tester', tool: 'terminal', command: 'npm test', text: 'pełny zestaw' });
  w.at(40, 'test.passed', { agent: 'tester', name: 'reconnect' });
  w.at(40.4, 'test.passed', { agent: 'tester', name: 'transport' });
  w.at(40.8, 'test.passed', { agent: 'tester', name: 'connection' });
  w.at(41.4, 'tool.completed', { agent: 'tester', tool: 'terminal', text: 'wszystkie testy przechodzą' });

  for (const a of ['scout-a', 'scout-b', 'worker-a', 'worker-b', 'critic', 'tester']) w.at(43, 'agent.completed', { agent: a });
  w.at(44, 'result.returned', { agent: 'queen', text: 'Refaktor gotowy: 2 zmienione pliki, 1 nowy test, pełny zestaw zielony.' });
  w.at(45, 'task.completed', { text: 'Zrefaktoryzowano połączenia; reconnect czyści timery.' });
  return w.save();
}

// ---------------------------------------------------------------- swarm-zwiad
function zwiad() {
  const w = writer('swarm-zwiad');
  const ws = workspace();
  const pick = (re, i = 0) => ws.files.filter((f) => re.test(f))[i] || ws.files[(i * 7919) % ws.files.length];
  const docs = ws.files.filter((f) => /\.md$/.test(f)).slice(0, 6);

  w.at(0, 'task.started', { text: 'Zbadaj sześć źródeł o protokole i zbuduj wspólną mapę.' });
  w.at(1, 'queen.reasoning', { text: 'Dzielę źródła między zwiadowców; porównanie robią programiści, wynik składam ja.', tokens: 520, step: 0 });
  w.at(2, 'planner.step', { steps: ['Zebranie źródeł', 'Porównanie', 'Mapa i raport'], step: 0 });
  for (let i = 0; i < 3; i++) {
    const id = 'scout-' + 'abc'[i];
    w.at(4 + i * 0.4, 'agent.spawned', { agent: id, parent: 'queen', label: 'Zwiadowca ' + 'ABC'[i], text: 'źródła ' + (2 * i + 1) + '–' + (2 * i + 2) });
  }
  w.at(5.5, 'agent.spawned', { agent: 'worker-a', parent: 'queen', label: 'Programista A', text: 'porównanie' });
  w.at(5.9, 'agent.spawned', { agent: 'worker-b', parent: 'queen', label: 'Programista B', text: 'mapa' });
  w.at(6.3, 'agent.spawned', { agent: 'critic', parent: 'queen', label: 'Recenzent', text: 'sprawdza wnioski' });

  const scouts = ['scout-a', 'scout-b', 'scout-c'];
  scouts.forEach((id, i) => {
    w.at(8 + i * 0.3, 'message.sent', { agent: 'queen', to: id, tone: 'assign', task: 'Źródła ' + (2 * i + 1) + '–' + (2 * i + 2), text: 'Przeczytaj i streść.' });
  });
  scouts.forEach((id, i) => {
    const t = 10 + i * 0.6;
    w.at(t, 'tool.started', { agent: id, tool: 'web_search', text: 'szukam źródeł' });
    w.at(t + 1.2, 'tool.completed', { agent: id, tool: 'web_search', text: '2 źródła' });
    w.at(t + 2, 'resource.read', { agent: id, resource: docs[2 * i] || pick(/readme/i), text: 'czytam' });
    w.at(t + 3, 'resource.read', { agent: id, resource: docs[2 * i + 1] || pick(/readme/i, 1), text: 'czytam' });
    w.at(t + 4.5, 'message.sent', { agent: id, to: 'queen', tone: 'result', text: 'Streszczenie gotowe: ' + (2 * i + 2) + ' źródeł.' });
    w.at(t + 5, 'result.returned', { agent: id, text: 'Streszczenie ' + (i + 1) + ' z 3' });
  });
  w.at(20, 'message.sent', { agent: 'worker-a', to: 'scout-a', tone: 'question', text: 'Które źródło mówi o czasie oczekiwania?' });
  w.at(21, 'message.sent', { agent: 'scout-a', to: 'worker-a', tone: 'answer', text: 'Źródło 2, sekcja o heartbeat.' });
  w.at(22.5, 'file.created', { agent: 'worker-a', resource: 'raport/porownanie.md', content: '# Porównanie\n| źródło | czas oczekiwania |\n|---|---|', text: 'tabela porównania' });
  w.at(24, 'file.modified', { agent: 'worker-b', resource: 'raport/mapa.md', patch: '+ mapa połączeń: klient → transport → serwer', text: 'mapa połączeń' });
  w.at(26, 'message.sent', { agent: 'worker-b', to: 'critic', tone: 'handoff', text: 'Tabela i mapa gotowe.' });
  w.at(27.5, 'message.sent', { agent: 'critic', to: 'worker-a', tone: 'critique', text: 'Dodaj źródło dla wartości domyślnej.' });
  w.at(29, 'file.modified', { agent: 'worker-a', resource: 'raport/porownanie.md', patch: '+ domyślnie 25 s (źródło 4)', text: 'uzupełnienie' });
  w.at(30.5, 'message.sent', { agent: 'critic', to: 'queen', tone: 'approve', text: 'Wnioski zgodne ze źródłami.' });
  for (const a of ['scout-a', 'scout-b', 'scout-c', 'worker-a', 'worker-b', 'critic']) w.at(32, 'agent.completed', { agent: a });
  w.at(33, 'file.created', { agent: 'queen', resource: 'raport/raport.md', content: '# Raport roju\nMapa, porównanie, wnioski.', text: 'raport końcowy' });
  w.at(34, 'result.returned', { agent: 'queen', text: 'Raport gotowy: mapa, tabela i wnioski ze wszystkich źródeł.' });
  w.at(35, 'task.completed', { text: 'Zebrano i porównano sześć źródeł.' });
  return w.save();
}

const n = [refaktor(), zwiad()];
console.log('swarm runs written:', n.join(' + '), 'events');
