import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, LEVELS, COST, makeCombCells } from '../src/game.js';
import { validateEvent } from '../src/events.js';

const FILES = Array.from({ length: 80 }, (_, i) => 'pkg/f' + i + '.ts');

test('the comb is a hexagon of 61 cells, each with a file', () => {
  const cells = makeCombCells(FILES, 3);
  assert.equal(cells.length, 61);
  assert.equal(new Set(cells.map((c) => c.key)).size, 61);
  assert.ok(cells.every((c) => c.file));
});

test('a new game starts with the level bugs, none of them next to each other', () => {
  const g = createGame({ seed: 5, level: LEVELS[2], files: FILES });
  assert.equal(g.bugs.size, LEVELS[2].bugs);
  const keys = [...g.bugs];
  for (const k of keys) {
    const [q, r] = k.split(',').map(Number);
    for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]]) assert.ok(!g.bugs.has((q + dq) + ',' + (r + dr)));
  }
});

test('a robot trip costs pollen, arrives, and clears the bug', () => {
  const g = createGame({ seed: 5, level: LEVELS[0], files: FILES, t0: 0 });
  const key = [...g.bugs][0];
  const before = g.pollen;
  assert.equal(g.send(key).ok, true);
  assert.equal(g.pollen, before - COST);
  g.advance(LEVELS[0].flight + 0.2);
  assert.equal(g.bugs.has(key), false);
  assert.equal(g.score.fixed, 1);
  assert.ok(g.score.points >= 100);
});

test('sending to a clean cell or with no pollen is refused with a reason', () => {
  const g = createGame({ seed: 5, level: LEVELS[0], files: FILES });
  const clean = g.cells.find((c) => !g.bugs.has(c.key)).key;
  assert.equal(g.send(clean).ok, false);
  const broke = createGame({ seed: 5, level: { ...LEVELS[0], pollen: 1 }, files: FILES });
  assert.equal(broke.send([...broke.bugs][0]).ok, false);
});

test('clearing every bug wins; running out of time loses', () => {
  const g = createGame({ seed: 9, level: { ...LEVELS[0], pollen: 999, spread: 999 }, files: FILES });
  while (!g.over) {
    const key = [...g.bugs][0];
    if (key && !g.robots.some((r) => r.busy)) g.send(key);
    g.advance(0.5);
  }
  assert.equal(g.over, 'won');
  assert.equal(g.events.at(-1).type, 'run.completed');
  const lost = createGame({ seed: 9, level: { ...LEVELS[2], time: 3 }, files: FILES });
  lost.advance(5);
  assert.equal(lost.over, 'lost');
  assert.equal(lost.events.at(-1).type, 'run.failed');
});

test('bugs spread when nothing is done, and the same seed plays the same game', () => {
  const a = createGame({ seed: 4, level: LEVELS[1], files: FILES, t0: 0 });
  const n0 = a.bugs.size; a.advance(LEVELS[1].spread * 2 + 0.5);
  assert.ok(a.bugs.size > n0, 'the bugs grew');
  const b = createGame({ seed: 4, level: LEVELS[1], files: FILES, t0: 0 });
  b.advance(LEVELS[1].spread * 2 + 0.5);
  assert.deepEqual(a.events, b.events);
});

test('every game event is valid for the swarm log', () => {
  const g = createGame({ seed: 2, level: LEVELS[0], files: FILES });
  for (let i = 0; i < 30; i++) { const k = [...g.bugs][0]; if (k) g.send(k); g.advance(0.7); }
  for (const e of g.events) assert.equal(validateEvent(e).ok, true, e.type);
});

test('time passes at the same speed whatever the frame rate', () => {
  const fast = createGame({ seed: 3, level: LEVELS[0], files: FILES, t0: 0 });
  const slow = createGame({ seed: 3, level: LEVELS[0], files: FILES, t0: 0 });
  for (let i = 0; i < 600; i++) fast.advance(1 / 60);
  for (let i = 0; i < 10; i++) slow.advance(1);
  assert.ok(Math.abs(fast.time - 10) < 0.11, 'fast ' + fast.time);
  assert.ok(Math.abs(slow.time - 10) < 0.11, 'slow ' + slow.time);
});
