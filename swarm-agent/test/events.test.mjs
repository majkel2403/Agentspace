import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEvent, parseJsonl, TYPES } from '../src/events.js';

test('a valid event is kept, with its timestamp as a number', () => {
  const r = validateEvent({ ts: '2026-10-06T10:00:00Z', type: 'agent.spawned', agent: 'a', label: 'A' });
  assert.equal(r.ok, true);
  assert.equal(typeof r.event.ts, 'number');
});

test('missing or unknown fields are reported by name', () => {
  assert.deepEqual(validateEvent({ ts: 1, type: 'message.sent', from: 'a' }).errors, ['to']);
  assert.deepEqual(validateEvent({ ts: 1, type: 'nope' }).errors, ['type']);
  assert.deepEqual(validateEvent({ type: 'run.started' }).errors, ['ts']);
  assert.ok(validateEvent({ ts: 1, type: 'message.sent', from: 'a', to: 'b', tone: 'shout' }).errors.includes('tone'));
  assert.ok(validateEvent({ ts: 1, type: 'file.write', agent: 'a', path: 'x', action: 'burned' }).errors.includes('action'));
  assert.ok(validateEvent({ ts: 1, type: 'scan', agent: 'a', paths: 'x' }).errors.includes('paths'));
});

test('every type in the schema has a list of required fields', () => {
  for (const [type, spec] of Object.entries(TYPES)) assert.ok(Array.isArray(spec.need), type);
});

test('a JSONL text keeps the good lines, sorted by time, and reports the bad ones', () => {
  const text = [
    JSON.stringify({ ts: 5, type: 'run.completed' }),
    '{not json',
    JSON.stringify({ ts: 1, type: 'run.started', text: 'go' }),
    JSON.stringify({ ts: 3, type: 'test', agent: 't', name: 'x', status: 'maybe' }),
    '',
  ].join('\n');
  const { events, bad } = parseJsonl(text);
  assert.deepEqual(events.map((e) => e.type), ['run.started', 'run.completed']);
  assert.deepEqual(bad.map((b) => b.line), [2, 4]);
});
