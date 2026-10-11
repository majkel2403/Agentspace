// The shared projection of the tree and the city: flat must equal the plain 2D mapping, 3D must lift and anchor exactly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projector, anchorCentre } from '../packages/core/gource/frame.js';

const OX = 500; const OY = 300; const SPAN = 600; const K = 1.7;

test('flat projection is the plain 2D mapping (no height, no scale change)', () => {
  const P = projector(10, -20, K, OX, OY, SPAN, 0, 0.9, 0);
  for (const [x, y, z] of [[0, 0, 0], [40, -10, 300], [-120, 75, 90]]) {
    const [sx, sy, sc, zv] = P.pt(x, y, z);
    assert.ok(Math.abs(sx - (OX + (x - 10) * K)) < 1e-9, 'x');
    assert.ok(Math.abs(sy - (OY + (y + 20) * K)) < 1e-9, 'y');
    assert.equal(sc, 1);
    assert.equal(zv, 0);
  }
});

test('3D lifts a raised point above the ground point under it', () => {
  const P = projector(0, 0, K, OX, OY, SPAN, 1, 0.9, 0);
  const ground = P.pt(50, 50, 0); const raised = P.pt(50, 50, 120);
  assert.ok(raised[1] < ground[1], 'a raised point sits higher on screen');
  assert.ok(raised[2] > 1, 'and nearer to the eye it is drawn larger');
});

test('unproj inverts pt on the ground, with and without tilt', () => {
  for (const pitch of [0, 0.95]) {
    const P = projector(30, -15, K, OX, OY, SPAN, 1, pitch, 0.4);
    for (const [x, y] of [[100, 40], [-60, 210], [30, -15]]) {
      const [sx, sy] = P.pt(x, y, 0);
      const back = P.unproj(sx, sy);
      assert.ok(Math.abs(back.x - x) < 1e-6 && Math.abs(back.y - y) < 1e-6, 'pitch ' + pitch);
    }
  }
});

test('anchorCentre keeps the ground point under the pointer when the scale changes', () => {
  const pitch = 0.95; const yaw = 0.3; const fit = 0.7;
  const P = projector(0, 0, K * fit, OX, OY, SPAN, 1, pitch, yaw);
  const px = 720; const py = 410;
  const w = P.unproj(px, py);
  const K1 = K * 2.6;
  const c = anchorCentre(w, px, py, K1, OX, OY, SPAN, 1, pitch, yaw, fit);
  const back = projector(c.x, c.y, K1 * fit, OX, OY, SPAN, 1, pitch, yaw).unproj(px, py);
  assert.ok(Math.abs(back.x - w.x) < 0.01 && Math.abs(back.y - w.y) < 0.01, 'anchored within 0.01 world units');
});
