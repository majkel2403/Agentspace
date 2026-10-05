import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

test('server: ingest over HTTP and WebSocket, live fan-out, replay from the store', async () => {
  const port = 47000 + Math.floor(Math.random() * 900);
  const srv = spawn(process.execPath, ['server/server.mjs'], { env: Object.assign({}, process.env, { PORT: String(port) }), stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((r) => srv.stdout.once('data', r));
  const base = 'http://127.0.0.1:' + port;
  const run = 'test-' + Date.now();
  try {
    const live = new WebSocket('ws://127.0.0.1:' + port + '/live?run=' + run);
    await new Promise((r) => live.once('open', r));
    const got = [];
    live.on('message', (m) => got.push(JSON.parse(String(m))));
    const now = Date.now();
    let res = await fetch(base + '/events', { method: 'POST', body: JSON.stringify({ ts: now, run, type: 'task.started', text: 'test' }) });
    assert.equal(res.status, 202);
    res = await fetch(base + '/events', { method: 'POST', body: JSON.stringify({ ts: now + 1, run, type: 'tool.started', agent: 'a' }) });
    assert.equal(res.status, 207, 'invalid event is reported');
    const ing = new WebSocket('ws://127.0.0.1:' + port + '/ingest');
    await new Promise((r) => ing.once('open', r));
    ing.send(JSON.stringify({ ts: now + 2, run, type: 'agent.spawned', agent: 'coder' }));
    ing.send(JSON.stringify({ ts: now + 3, run, type: 'task.completed' }));
    await new Promise((r) => setTimeout(r, 300));
    assert.deepEqual(got.map((e) => e.type), ['task.started', 'agent.spawned', 'task.completed']);
    const list = await (await fetch(base + '/api/runs')).json();
    assert.ok(list.find((r) => r.run === run && r.status === 'done'));
    const log = await (await fetch(base + '/api/runs/' + run)).text();
    assert.equal(log.trim().split('\n').length, 3);
    ing.close(); live.close();
  } finally {
    srv.kill();
    const f = path.join('data', 'runs', run + '.jsonl');
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
});
