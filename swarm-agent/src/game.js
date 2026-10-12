// Ul under fire: a game on a honeycomb. Bugs (red cells) spread across the comb; you send worker bees to clear them
// before the clock or the pollen runs out. Every move is written as an event of the swarm's log (a bug is a test that
// fails, a fix is a test that passes, a robot's work is a file change), so each game can be replayed in the deck.
// Pure logic with a seeded random generator: the same seed and the same moves give the same game.

export const LEVELS = [
  { id: 'lagodny', name: 'Łagodny ul', bugs: 4, time: 110, pollen: 14, spread: 14, robots: 3, flight: 1.2 },
  { id: 'presja', name: 'Ul pod presją', bugs: 7, time: 95, pollen: 11, spread: 9, robots: 3, flight: 1.0 },
  { id: 'burza', name: 'Burza błędów', bugs: 10, time: 85, pollen: 9, spread: 6, robots: 4, flight: 0.9 },
];
export const COST = 2;        // pollen for one robot trip
export const PAYOUT = 100;    // score for a fix (multiplied by the combo)
const STEP = 0.1;             // the game moves in fixed steps of this many seconds
const RADIUS = 4;             // the comb is a hexagon of cells this far from the centre
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];

export function seeded(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }

// the comb: cells of a hexagon of radius RADIUS, each with a file name from the workspace (shuffled by the seed)
export function makeCombCells(files, seed) {
  const rnd = seeded(seed);
  const names = files.slice();
  for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [names[i], names[j]] = [names[j], names[i]]; }
  const cells = [];
  for (let q = -RADIUS; q <= RADIUS; q++) for (let r = -RADIUS; r <= RADIUS; r++) {
    if (Math.abs(q + r) > RADIUS) continue;
    const i = cells.length;
    cells.push({ key: q + ',' + r, q, r, file: names[i % names.length] });
  }
  cells.sort((a, b) => (a.q - b.q) || (a.r - b.r));
  return cells;
}

export function createGame({ seed = 1, level = LEVELS[0], files, id = 'gra', t0 = Date.now() }) {
  const T0 = t0;
  const rnd = seeded(seed * 7919 + 13);
  const cells = makeCombCells(files, seed);
  const byKey = new Map(cells.map((c) => [c.key, c]));
  const bugs = new Set(); // keys of cells with a failing test
  const fixed = new Set(); // keys of cells a robot has cleared
  // the first bugs: random cells, never two next to each other at the start
  while (bugs.size < level.bugs) {
    const c = cells[Math.floor(rnd() * cells.length)];
    if ([...bugs].some((k) => neighbourKeys(c).includes(k))) continue;
    bugs.add(c.key);
  }
  const robots = Array.from({ length: level.robots }, (_, i) => ({ id: 'robot-' + (i + 1), label: 'Robotnica ' + (i + 1), busy: null, start: 0, arrive: 0 }));
  const log = []; const score = { points: 0, fixed: 0, combo: 1, lastFixAt: -99 };
  let t = 0; let pending = 0; let pollen = level.pollen; let sinceSpread = 0; let sinceRegen = 0; let over = null;
  const emit = (e) => log.push({ ts: T0 + Math.round(t * 1000), ...e });
  const name = (key) => byKey.get(key).file;
  emit({ type: 'run.started', text: 'Ul pod ostrzałem: ' + level.name });
  for (const r of robots) emit({ type: 'agent.spawned', agent: r.id, parent: 'queen', label: r.label, role: 'robotnica', text: 'gotowa' });
  emit({ type: 'scan', agent: 'queen', paths: cells.map((c) => c.file) });
  for (const k of bugs) emit({ type: 'test', agent: 'queen', name: name(k), status: 'failed', output: 'błąd w ' + name(k) });

  function neighbourKeys(c) { return DIRS.map(([dq, dr]) => (c.q + dq) + ',' + (c.r + dr)).filter((k) => byKey.has(k)); }

  function arrive(r) {
    const key = r.busy; r.busy = null;
    if (!bugs.has(key)) return; // someone else fixed it on the way
    bugs.delete(key); fixed.add(key);
    score.combo = t - score.lastFixAt <= 4 ? Math.min(5, score.combo + 1) : 1;
    score.lastFixAt = t; score.fixed++;
    score.points += PAYOUT * score.combo;
    const lines = 1 + Math.floor(rnd() * 5);
    emit({ type: 'file.write', agent: r.id, path: name(key), action: 'modified', lines });
    emit({ type: 'test', agent: r.id, name: name(key), status: 'passed' });
  }

  function step() {
    if (over) return;
    t = Math.round((t + STEP) * 100) / 100;
    for (const r of robots) if (r.busy && t >= r.arrive) arrive(r);
    sinceRegen += STEP; if (sinceRegen >= 2 && pollen < level.pollen) { pollen++; sinceRegen = 0; }
    sinceSpread += STEP;
    if (sinceSpread >= level.spread && bugs.size) {
      sinceSpread = 0;
      // a bug seeds a neighbour that is clean now
      const from = [...bugs][Math.floor(rnd() * bugs.size)];
      const free = neighbourKeys(byKey.get(from)).filter((k) => !bugs.has(k) && !robots.some((r) => r.busy === k));
      if (free.length) {
        const k = free[Math.floor(rnd() * free.length)];
        bugs.add(k);
        emit({ type: 'test', agent: 'queen', name: name(k), status: 'failed', output: 'błąd rozprzestrzenia się z ' + name(from) });
      }
    }
    if (!bugs.size) finish(true, 'Ul wolny od błędów.');
    else if (t >= level.time) finish(false, 'Czas minął.');
    else if (bugs.size >= cells.length * 0.45) finish(false, 'Błędy zajęły ul.');
  }
  function finish(won, text) {
    over = won ? 'won' : 'lost';
    const bonus = won ? Math.round(Math.max(0, level.time - t) * 5 + pollen * 10) : 0;
    score.points += bonus; score.bonus = bonus;
    emit({ type: won ? 'run.completed' : 'run.failed', text: text + ' Wynik: ' + score.points });
  }
  return {
    id, level, cells, byKey, robots, bugs, fixed,
    get time() { return t; }, get pollen() { return pollen; }, get score() { return score; }, get over() { return over; },
    get events() { return log; },
    // advance the clock by dt seconds in fixed steps
    // time passes in fixed steps: leftover time is kept, so frame rate never changes the speed of the game
    advance(dt) { pending += dt; while (pending >= STEP - 1e-9) { step(); pending -= STEP; } },
    // send the nearest free robot to a bug cell
    send(key) {
      if (over) return { ok: false, reason: 'koniec gry' };
      if (!bugs.has(key)) return { ok: false, reason: 'to pole jest czyste' };
      if (robots.some((r) => r.busy === key)) return { ok: false, reason: 'już lecimy' };
      if (pollen < COST) return { ok: false, reason: 'brak pyłku' };
      const r = robots.find((x) => !x.busy);
      if (!r) return { ok: false, reason: 'wszystkie robotnice są w drodze' };
      pollen -= COST; r.busy = key; r.start = t; r.arrive = t + level.flight;
      emit({ type: 'user.command', text: 'wyślij robotnicę na ' + name(key) });
      emit({ type: 'tool.started', agent: r.id, tool: 'naprawa', command: 'napraw ' + name(key) });
      return { ok: true, robot: r };
    },
  };
}
