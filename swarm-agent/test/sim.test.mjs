import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSwarm } from '../server/sim.mjs';
import { parseJsonl } from '../src/events.js';
import { createReplay } from '../src/model.js';

const FILES = ['packages/a/socket.ts', 'packages/a/transport.ts', 'docs/readme.md', 'test/x.test.ts'];
function run(seed, commands = []) {
  const out = [];
  const sw = createSwarm({ id: 't', task: 'Napraw timer.', files: FILES, emit: (e) => out.push({ ts: 1000 + out.length * 1000, ...e }), seed, tickMs: 1e9, steps: 30 });
  const plan = new Map(commands);
  for (let i = 0; i < 200 && !sw.done; i++) { if (plan.has(i)) sw.command(plan.get(i)); sw.advance(); }
  return { out, sw };
}

test('a swarm plays a whole run: start, spawns, scan, work, tests, finish', () => {
  const { out, sw } = run(7);
  assert.equal(sw.done, true);
  const types = out.map((e) => e.type);
  assert.equal(types[0], 'run.started');
  assert.equal(types.filter((t) => t === 'agent.spawned').length, 4);
  assert.ok(types.includes('scan'));
  assert.ok(types.includes('file.write'));
  assert.ok(types.includes('test'));
  assert.equal(types[types.length - 1], 'run.completed');
  // every event the swarm writes is valid for the log
  assert.equal(parseJsonl(out.map((e) => JSON.stringify(e)).join('\n')).bad.length, 0);
});

test('the same seed gives the same run', () => {
  assert.deepEqual(run(7).out, run(7).out);
  assert.notDeepEqual(run(7).out, run(8).out);
});

test('a conductor command is recorded, answered, and changes what the swarm does', () => {
  const { out } = run(7, [[10, 'skup transport']]);
  const cmd = out.find((e) => e.type === 'user.command');
  assert.equal(cmd.text, 'skup transport');
  const answer = out.find((e) => e.type === 'message.sent' && e.from === 'queen' && e.to === 'user' && /transport/.test(e.text));
  assert.ok(answer, 'the queen answers the conductor');
  // from the focus on, the work touches that file
  const after = out.slice(out.indexOf(cmd)).filter((e) => e.type === 'file.write' || e.type === 'file.read');
  assert.ok(after.length && after.every((e) => e.path === 'packages/a/transport.ts'));
});

test('an unknown command gets a question back, and the log replays with the conductor in it', () => {
  const { out } = run(7, [[5, 'zrób kawę']]);
  assert.ok(out.some((e) => e.type === 'message.sent' && /Nie rozumiem/.test(e.text)));
  const R = createReplay(out.map((e) => ({ ...e })));
  const st = R.at(R.duration);
  assert.equal(st.commands.length, 1);
  assert.equal(st.messages.find((m) => m.from === 'user').text, 'zrób kawę');
  assert.equal(st.agents.has('user'), false, 'the conductor is not an agent');
});
