import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jarvisToEvent, sseMessages } from '../adapters/jarvis.mjs';
import { validateEvent, parseJsonl, createTimeline, runFacts } from '../packages/core/index.js';

const T0 = 1_700_000_000;
test('jarvis: every bridge event becomes a valid workflow event of one run per task', () => {
  const raws = [
    { v: 1, type: 'task.created', task_id: 'h-1', ts: T0, platform: 'telegram', title: 'Sprawdź pogodę' },
    { v: 1, type: 'tool.started', task_id: 'h-1', ts: T0 + 1, tool: 'web_search', label: 'pogoda Kraków' },
    { v: 1, type: 'tool.started', task_id: 'h-1', ts: T0 + 2, tool: 'terminal', label: 'npm test' },
    { v: 1, type: 'tool.completed', task_id: 'h-1', ts: T0 + 3, tool: 'terminal', ms: 840 },
    { v: 1, type: 'tool.failed', task_id: 'h-1', ts: T0 + 4, tool: 'web_search', error: 'timeout' },
    { v: 1, type: 'task.completed', task_id: 'h-1', ts: T0 + 5, result: 'Będzie słonecznie.' },
  ];
  const evs = raws.map(jarvisToEvent);
  evs.forEach((e) => assert.ok(e, 'mapped'));
  evs.forEach((e) => { const r = validateEvent(e); assert.ok(r.ok, r.error); assert.equal(e.run, 'jarvis-h-1'); });
  assert.equal(evs[0].type, 'task.started');
  assert.equal(evs[0].text, 'Sprawdź pogodę');
  assert.equal(evs[0].user, 'telegram');
  assert.equal(evs[2].command, 'npm test', 'a terminal tool shows its command in the terminal window');
  assert.equal(evs[1].command, undefined, 'a search is not a terminal');
  assert.equal(evs[3].text, '840 ms');
  assert.equal(evs[4].type, 'tool.failed');
  assert.equal(evs[5].text, 'Będzie słonecznie.');
});

test('jarvis: malformed or unknown events are dropped, not crashing', () => {
  assert.equal(jarvisToEvent(null), null);
  assert.equal(jarvisToEvent({ type: 'task.created' }), null, 'no task_id');
  assert.equal(jarvisToEvent({ type: 'rm -rf', task_id: 'x' }), null);
  assert.equal(jarvisToEvent({ type: 'tool.started', task_id: 'x', ts: 'nie' }).ts > 0, true, 'bad ts falls back to now');
});

test('jarvis: a relayed task forms a timeline with phases and readable facts', () => {
  const raws = [
    { type: 'task.created', task_id: 'h-2', ts: T0, title: 'Raport' },
    { type: 'tool.started', task_id: 'h-2', ts: T0 + 1, tool: 'search', label: 'x' },
    { type: 'task.completed', task_id: 'h-2', ts: T0 + 3, result: 'gotowe' },
  ].map((r, i) => jarvisToEvent(r));
  const T = createTimeline(raws);
  assert.equal(T.events.length, 3);
  assert.ok(T.duration >= 2000);
  const F = runFacts(T);
  assert.equal(F.title, 'Raport');
});

test('jarvis: the bridge stream is parsed incrementally, across chunk boundaries', () => {
  const chunk1 = 'retry: 3000\nevent: hello\ndata: {"client":"a"}\n\nevent: agent\ndata: {"type":"task.created",';
  const a = sseMessages(chunk1);
  assert.deepEqual(a.messages.map((m) => m.event), ['hello']);
  const b = sseMessages(a.rest + '"task_id":"t"}\n\n');
  assert.equal(b.messages[0].event, 'agent');
  assert.equal(JSON.parse(b.messages[0].data).task_id, 't');
  assert.equal(b.rest, '');
});

test('jarvis: relayed events survive the Event Store file format', () => {
  const ev = jarvisToEvent({ type: 'task.created', task_id: 'h-3', ts: T0, title: 'A' });
  const r = parseJsonl(JSON.stringify(ev) + '\n');
  assert.equal(r.events.length, 1);
  assert.equal(r.events[0].run, 'jarvis-h-3');
});
