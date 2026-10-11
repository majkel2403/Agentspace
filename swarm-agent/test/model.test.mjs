import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseJsonl } from '../src/events.js';
import { createReplay, QUEEN } from '../src/model.js';

const load = (id) => parseJsonl(fs.readFileSync(fileURLToPath(new URL('../demo/runs/' + id + '.jsonl', import.meta.url)), 'utf8')).events;
// the parts of a state the screen shows, as plain data, to compare two states
const snap = (st) => JSON.stringify({
  agents: [...st.agents.values()].map((a) => [a.id, a.status, a.at, a.task, a.tool, a.touches]),
  files: [...st.files.values()].map((f) => [f.path, f.state, f.touches, f.lastBy]).sort(),
  messages: st.messages.length, tests: [...st.tests.entries()], plan: st.plan.cur, done: st.done,
});

test('scrubbing back and forth gives exactly the state a fresh replay gives', () => {
  const ev = load('swarm-refaktor');
  const R = createReplay(ev);
  const fresh = (t) => snap(createReplay(ev).at(t));
  for (const t of [5, 20, 33, 12, 40, 3, 45]) assert.equal(snap(R.at(t)), fresh(t), 'at ' + t);
});

test('a live run appended one event at a time equals the same run loaded at once', () => {
  const ev = load('swarm-zwiad');
  const bulk = createReplay(ev);
  const live = createReplay([ev[0]]);
  for (const e of ev.slice(1)) live.append(e);
  assert.equal(snap(live.at(30)), snap(bulk.at(30)));
  assert.equal(snap(live.at(60)), snap(bulk.at(60)));
});

test('the log says what the picture shows: spawns, messages, files, tests, plan, end', () => {
  const R = createReplay(load('swarm-refaktor'));
  const st = R.at(45);
  assert.equal(st.done, true);
  assert.equal(st.agents.get(QUEEN).status, 'done');
  assert.equal(st.agents.get('worker-a').parent, QUEEN);
  assert.equal(st.agents.get('worker-a').label, 'Programista A');
  assert.equal(st.agents.get('worker-a').task, 'Zmiana transportu');
  assert.equal(st.tests.get('reconnect').status, 'passed');
  assert.equal(st.plan.cur, 3);
  const trans = [...st.files.values()].find((f) => /transport\.ts$/.test(f.path));
  assert.equal(trans.state, 'modified');
  assert.ok(trans.touches >= 3);
  // before the first test run nothing has passed yet
  assert.equal(R.at(20).tests.size, 0);
  assert.equal(R.at(35).tests.get('reconnect').status, 'failed');
});

test('a message is in the state from its time on, and an agent stands by the file it works on', () => {
  const R = createReplay(load('swarm-refaktor'));
  assert.equal(R.at(7.5).messages.length, 0);
  assert.ok(R.at(8.2).messages.length >= 1);
  const st = R.at(21.8);
  assert.equal(st.agents.get('worker-a').at.endsWith('transport.ts'), true);
});

test('an agent keeps the trail of where it stood, in time order', () => {
  const st = createReplay(load('swarm-refaktor')).at(45);
  const w = st.agents.get('worker-a');
  assert.ok(w.path.length >= 3);
  assert.ok(w.path.every((p, i) => i === 0 || p.t >= w.path[i - 1].t));
});
