import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseJsonl, validateEvent, createTimeline, layout, toGourceLines } from '../packages/core/index.js';

const runs = fs.readdirSync(new URL('../demo/runs/', import.meta.url)).filter((f) => f.endsWith('.jsonl'));
const load = (f) => parseJsonl(fs.readFileSync(new URL('../demo/runs/' + f, import.meta.url), 'utf8'));

test('schema rejects malformed events', () => {
  assert.equal(validateEvent({ type: 'nope', run: 'r', ts: 1 }).ok, false);
  assert.equal(validateEvent({ type: 'tool.started', run: 'r', ts: 1, agent: 'a' }).ok, false);
  assert.equal(validateEvent({ type: 'task.started', run: 'r', ts: 'not a date' }).ok, false);
  assert.equal(validateEvent({ type: 'task.started', run: 'r', ts: '2026-10-06T10:00:00Z' }).ok, true);
  const { events, errors } = parseJsonl('{"type":"task.started","run":"r","ts":2}\nnot json\n{"type":"task.completed","run":"r","ts":1}\n');
  assert.equal(errors.length, 1);
  assert.deepEqual(events.map((e) => e.ts), [1, 2]);
});

for (const f of runs) {
  test('demo run ' + f + ' parses cleanly and ends completed', () => {
    const { events, errors } = load(f);
    assert.equal(errors.length, 0);
    const T = createTimeline(events);
    const s = T.stateAt(T.duration);
    assert.equal(s.task.status, 'done');
    assert.ok(s.nodes.hermes && s.nodes.result);
  });

  test('stateAt is exact when scrubbing backwards (' + f + ')', () => {
    const { events } = load(f);
    const T = createTimeline(events);
    for (const t of [T.duration, T.duration * 0.7, 1200, T.duration * 0.33, 0, T.duration * 0.9]) {
      const scrubbed = JSON.stringify(T.stateAt(t));
      const fresh = createTimeline(events.filter((e) => e.ts - events[0].ts <= t));
      assert.equal(scrubbed, JSON.stringify(fresh.stateAt(t)), 'state differs at t=' + t);
    }
  });

  test('layout is stable as the graph grows and finite (' + f + ')', () => {
    const { events } = load(f);
    const T = createTimeline(events);
    const early = layout(T.stateAt(T.duration * 0.4));
    const late = layout(T.stateAt(T.duration));
    for (const id of Object.keys(early)) assert.deepEqual(early[id], late[id], id + ' moved');
    for (const p of Object.values(late)) p.forEach((v) => assert.ok(Number.isFinite(v)));
  });

  test('gource adapter writes valid custom-log lines (' + f + ')', () => {
    const { events } = load(f);
    const lines = toGourceLines(events);
    assert.ok(lines.length > 5);
    for (const l of lines) assert.match(l, /^\d+\|[^|]+\|[AMD]\|\/[^|]+\|[0-9A-F]{6}$/);
  });
}

test('impulses only come from events (every pulse references existing nodes)', () => {
  const { events } = load('repo-fix.jsonl');
  const T = createTimeline(events);
  for (let i = 0; i < events.length; i++) {
    const s = T.stateAt(T.rel[i]);
    for (const p of T.fxAt(i).pulses) { assert.ok(s.nodes[p.from], p.from); assert.ok(s.nodes[p.to], p.to); }
  }
});
