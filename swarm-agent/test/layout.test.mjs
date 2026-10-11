import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout, RING } from '../src/layout.js';

const PATHS = ['a/x.js', 'a/b/y.js', 'a/b/c/z.ts', 'top.md', 'a/q/w.md', 'a/x.js'];

test('every path gets exactly one place, every folder on the way gets one too', () => {
  const L = buildLayout(PATHS);
  assert.deepEqual([...L.files.keys()].sort(), ['a/b/c/z.ts', 'a/b/y.js', 'a/q/w.md', 'a/x.js', 'top.md']);
  assert.deepEqual([...L.dirs.keys()].sort(), ['a', 'a/b', 'a/b/c', 'a/q']);
});

test('the layout depends only on the set of paths, not on their order', () => {
  const a = buildLayout(PATHS); const b = buildLayout([...PATHS].reverse());
  assert.deepEqual([...a.files.entries()], [...b.files.entries()]);
  assert.deepEqual([...a.dirs.entries()], [...b.dirs.entries()]);
});

test('folders sit on rings by depth, and a file is near its own folder', () => {
  const L = buildLayout(PATHS);
  const r = (d) => Math.hypot(d.x, d.z);
  assert.ok(Math.abs(r(L.dirs.get('a')) - RING) < 1e-6);
  assert.ok(Math.abs(r(L.dirs.get('a/b')) - 2 * RING) < 1e-6);
  const f = L.files.get('a/b/y.js'); const d = L.dirs.get('a/b');
  assert.ok(Math.hypot(f.x - d.x, f.z - d.z) < 40, 'file ring is small around its folder');
});

test('an empty workspace has no places but does not fail', () => {
  const L = buildLayout([]);
  assert.equal(L.files.size, 0);
  assert.equal(L.dirs.size, 0);
});
