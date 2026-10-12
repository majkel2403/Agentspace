#!/usr/bin/env node
// Balance check for the game: plays many games per level with a simple bot (it sends a robot to the nearest bug
// whenever it can afford it) and reports how often the bot wins, how long it takes, and how many bugs it leaves.
//   node tools/balance.mjs [games per level]
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createGame, LEVELS } from '../src/game.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const files = fs.readFileSync(path.join(HERE, '..', 'demo/workspaces/socket.io.txt'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
const N = Number(process.argv[2] || 200);
const STEP = 0.1;

function play(level, seed) {
  const g = createGame({ seed, level, files, t0: 0 });
  // the bot aims at the bug nearest to the hive's centre, and never asks while a robot is already flying
  for (let guard = 0; guard < 100000 && !g.over; guard++) {
    if (g.robots.some((r) => !r.busy)) {
      const target = [...g.bugs].filter((k) => !g.robots.some((r) => r.busy === k))
        .sort((a, b) => dist(g.byKey.get(a)) - dist(g.byKey.get(b)))[0];
      if (target) g.send(target);
    }
    g.advance(STEP);
  }
  return g;
}
const dist = (c) => Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(c.q + c.r));

console.log('level'.padEnd(18), 'wins'.padStart(6), 'avg time'.padStart(10), 'left bugs'.padStart(10), 'fixes'.padStart(7));
for (const level of LEVELS) {
  let wins = 0; let time = 0; let left = 0; let fixes = 0;
  for (let s = 1; s <= N; s++) {
    const g = play(level, s * 31 + 7);
    if (g.over === 'won') { wins++; time += g.time; }
    left += g.bugs.size; fixes += g.score.fixed;
  }
  console.log(level.name.padEnd(18), ((100 * wins / N).toFixed(0) + '%').padStart(6),
    (wins ? (time / wins).toFixed(1) + ' s' : '—').padStart(10), (left / N).toFixed(1).padStart(10), (fixes / N).toFixed(1).padStart(7));
}
