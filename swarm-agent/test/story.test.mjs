import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sentence, keyMoments, caption, stepMoment } from '../src/story.js';
import { heightField, heightColour } from '../src/terrain.js';
import { createReplay } from '../src/model.js';

const ev = [
  { ts: 0, type: 'run.started', text: 'napraw' },
  { ts: 2000, type: 'agent.spawned', agent: 'a', label: 'Ala' },
  { ts: 3000, type: 'test', agent: 'a', name: 'x', status: 'failed', output: 'boom' },
  { ts: 5000, type: 'message.sent', from: 'a', to: 'queen', tone: 'approve', text: 'ok' },
  { ts: 9000, type: 'test', agent: 'a', name: 'x', status: 'passed' },
  { ts: 10000, type: 'run.completed', text: 'gotowe' },
];

test('a sentence names only what its event says', () => {
  const st = createReplay(ev).at(2.5);
  assert.equal(sentence(ev[1], st), 'Ala dołącza do roju');
  assert.equal(sentence(ev[2], st), 'Test x pada: boom');
  assert.equal(sentence(ev[4], st), 'Test x przechodzi');
});

test('the key moments are the failure, the approval, the green run and the end', () => {
  const m = keyMoments(ev);
  assert.deepEqual(m.map((x) => x.kind), ['start', 'porażka', 'zatwierdzenie', 'zielony', 'koniec']);
  assert.deepEqual(m.map((x) => x.t), [0, 3, 5, 9, 10]);
});

test('the caption is the latest event up to the clock, and jumps follow the moments', () => {
  const st = createReplay(ev).at(4);
  assert.equal(caption(ev, 0, 4, st).text, 'Test x pada: boom');
  const m = keyMoments(ev);
  assert.equal(stepMoment(m, 3.1, 1).kind, 'zatwierdzenie');
  assert.equal(stepMoment(m, 3.1, -1).kind, 'start');
  assert.equal(stepMoment(m, 10, 1), null);
});

test('the height field grows where files were touched and is flat where nothing happened', () => {
  const box = { x0: -100, x1: 100, z0: -100, z1: 100 };
  const h = heightField([{ x: 0, z: 0, touches: 4 }, { x: 80, z: 80, touches: 0 }], box, 40);
  const mid = h[20 * 40 + 20]; const far = h[39 * 40 + 39];
  assert.ok(mid > 3, 'the hill at the touched file is high');
  assert.equal(far, 0, 'an untouched corner stays flat');
  assert.ok(heightField([{ x: 0, z: 0, touches: 4 }], box, 40)[20 * 40 + 20] === mid, 'pure: the same input gives the same field');
});

test('the colour ramp runs from ground to hot', () => {
  assert.ok(heightColour(0)[0] < 0.1);
  assert.ok(heightColour(1)[1] > 0.7);
});
