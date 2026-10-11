// A live swarm: a queen and her agents work on a task in real time and the server writes what they do to the run's log.
// It is a rule-based simulation, not a language model: it chooses files and steps with a seeded random generator, so the
// same seed gives the same run. The conductor can speak to it (commands), and every command and every reaction is an
// event in the log, so the scene and the deck show them exactly as they show a recorded run.
//   skup <fragment>   all workers turn to the file whose path contains the fragment
//   testuj            the tester runs the tests now
//   zatrzymaj         the swarm finishes its work and reports
import { QUEEN } from '../src/model.js';

export function seeded(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }

const WORKERS = [
  { agent: 'scout', label: 'Zwiadowca', role: 'zwiad' },
  { agent: 'coder', label: 'Programista', role: 'kod' },
  { agent: 'reviewer', label: 'Recenzent', role: 'recenzja' },
  { agent: 'tester', label: 'Tester', role: 'testy' },
];
const PLAN = ['Zwiad przestrzeni roboczej', 'Zmiany w kodzie', 'Testy', 'Recenzja i raport'];

export function createSwarm({ id, task, files, emit, seed = 7, tickMs = 1100, steps = 48 }) {
  const rnd = seeded(seed);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const commands = []; let focus = null; let testNow = false; let stopNow = false;
  let tick = 0; let timer = null; let done = false;
  const say = (agent, text, extra = {}) => emit({ type: 'message.sent', from: agent, to: agent === QUEEN ? 'user' : QUEEN, tone: 'result', text, ...extra });
  const reply = (text) => emit({ type: 'message.sent', from: QUEEN, to: 'user', tone: 'answer', text });
  const work = files.filter((f) => !/^(\.|node_modules)/.test(f));
  // a file by a fragment: the file name first (so "transport" is transport.ts), then any part of the path
  const byFragment = (frag) => {
    const q = frag.toLowerCase();
    return work.find((f) => f.split('/').pop().toLowerCase().includes(q)) || work.find((f) => f.toLowerCase().includes(q)) || null;
  };

  // the conductor's words, parsed with a few rules; anything else gets a question back
  function handle(text) {
    const t = String(text || '').trim();
    const low = t.toLowerCase();
    if (low.startsWith('skup ')) {
      const f = byFragment(t.slice(5).trim());
      if (f) { focus = f; reply('Skupiam rój na ' + f + '.'); }
      else reply('Nie znam pliku „' + t.slice(5).trim() + '”. Podaj fragment ścieżki.');
    } else if (low.startsWith('testuj')) { testNow = true; reply('Tester uruchamia testy po następnym kroku.'); }
    else if (low.startsWith('zatrzymaj')) { stopNow = true; reply('Kończymy po bieżącym kroku.'); }
    else reply('Nie rozumiem. Mogę: „skup <fragment ścieżki>”, „testuj”, „zatrzymaj”.');
  }
  function command(text) {
    if (done) return { ok: false, error: 'the run is over' };
    emit({ type: 'user.command', text: String(text || '') });
    commands.push(text);
    handle(text);
    return { ok: true };
  }

  function step() {
    if (done) return;
    tick++;
    if (tick === 1) { emit({ type: 'run.started', text: task }); emit({ type: 'queen.thought', text: 'Rozbijam zlecenie na zwiad, kod, testy i recenzję.' }); emit({ type: 'plan.updated', steps: PLAN, step: 0 }); return; }
    if (tick <= 1 + WORKERS.length) {
      const w = WORKERS[tick - 2];
      emit({ type: 'agent.spawned', agent: w.agent, parent: QUEEN, label: w.label, role: w.role, text: 'gotowy' });
      return;
    }
    if (tick === 2 + WORKERS.length) { emit({ type: 'scan', agent: 'scout', paths: files.slice(0, 400) }); emit({ type: 'plan.updated', steps: PLAN, step: 1 }); return; }
    const k = tick - 3 - WORKERS.length;
    if (stopNow || k >= steps) return finish();
    // the work: one agent acts each tick, in turn; a focus pulls everyone to the same file
    const w = WORKERS[k % WORKERS.length];
    const f = focus || pick(work);
    if (k === 6 || testNow) {
      testNow = false;
      emit({ type: 'plan.updated', steps: PLAN, step: 2 });
      emit({ type: 'tool.started', agent: 'tester', tool: 'terminal', command: 'npm test' });
      if (rnd() < 0.3) emit({ type: 'test', agent: 'tester', name: 'testy: ' + f.split('/').pop(), status: 'failed', output: 'AssertionError: oczekiwano innego wyniku' });
      else emit({ type: 'test', agent: 'tester', name: 'testy: ' + f.split('/').pop(), status: 'passed' });
      emit({ type: 'tool.finished', agent: 'tester', tool: 'terminal', ok: true, text: 'zakończone' });
      return;
    }
    if (w.agent === 'scout') emit({ type: 'file.read', agent: 'scout', path: f });
    else if (w.agent === 'coder') emit({ type: 'file.write', agent: 'coder', path: f, action: rnd() < 0.2 ? 'created' : 'modified', lines: 1 + Math.floor(rnd() * 8) });
    else if (w.agent === 'reviewer') { emit({ type: 'file.read', agent: 'reviewer', path: f }); if (k % 9 === 4) say('reviewer', 'Sprawdzam ' + f.split('/').pop() + ': ok.', { to: QUEEN }); }
    else { emit({ type: 'file.read', agent: 'tester', path: f }); }
    if (k % 7 === 3) emit({ type: 'message.sent', from: 'coder', to: 'reviewer', tone: 'handoff', text: 'Zmiana w ' + f.split('/').pop() + ' gotowa do przeglądu.' });
  }
  function finish() {
    done = true;
    clearInterval(timer);
    for (const w of WORKERS) emit({ type: 'agent.finished', agent: w.agent });
    emit({ type: 'result', agent: QUEEN, text: 'Rój skończył: ' + commands.length + ' poleceń od dyrygenta.' });
    emit({ type: 'run.completed', text: 'Zlecenie wykonane.' });
  }
  return {
    id, start() { timer = setInterval(step, tickMs); step(); },
    advance: step, // one tick by hand (tests)
    stop() { clearInterval(timer); },
    command,
    get done() { return done; },
  };
}
