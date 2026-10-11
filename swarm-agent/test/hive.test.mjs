import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hiveCells, cellCentre, CELL } from '../src/hive.js';

const place = (p) => ({ x: (p.length * 7) % 60 - 30, z: (p.charCodeAt(0) % 40) - 20 });
const paths = ['a.js', 'b.js', 'src/c.ts', 'src/d.ts', 'src/e.ts', 'doc/x.md', 'doc/y.md', 'z.json'];

test('every file gets its own cell, and no two files share one', () => {
  const cells = hiveCells(place, paths);
  assert.equal(cells.size, paths.length);
  const keys = new Set([...cells.values()].map((c) => c.q + ',' + c.r));
  assert.equal(keys.size, paths.length);
});

test('the comb is deterministic and does not depend on the order of the paths', () => {
  const a = hiveCells(place, paths); const b = hiveCells(place, [...paths].reverse());
  assert.deepEqual([...a.entries()], [...b.entries()]);
});

test('a cell sits close to where its file is placed', () => {
  const cells = hiveCells(place, paths);
  for (const p of paths) {
    const pl = place(p); const c = cells.get(p);
    assert.ok(Math.hypot(c.x - pl.x, c.z - pl.z) < CELL * 6, p);
  }
});

test('cell centres are CELL*sqrt3 apart for neighbours', () => {
  const a = cellCentre(0, 0); const b = cellCentre(1, 0);
  assert.ok(Math.abs(Math.hypot(b.x - a.x, b.z - a.z) - CELL * Math.sqrt(3)) < 1e-9);
});
