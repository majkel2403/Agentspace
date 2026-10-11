import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../server/server.mjs';
import { WebSocket } from 'ws';

let srv; let base; let dir; let demo;
before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-data-'));
  demo = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-demo-'));
  fs.writeFileSync(path.join(demo, 'demo-run.jsonl'), JSON.stringify({ ts: 1000, type: 'run.started', text: 'Zadanie demo' }) + '\n' + JSON.stringify({ ts: 2000, type: 'run.completed', text: 'koniec' }) + '\n');
  srv = createServer({ port: 0, dataDir: dir, demoDir: demo });
  const a = await srv.listen();
  base = 'http://127.0.0.1:' + a.port;
});
after(async () => { await srv.close(); fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(demo, { recursive: true, force: true }); });

test('the run list shows recorded runs with a title and status', async () => {
  const runs = await (await fetch(base + '/api/runs')).json();
  const r = runs.find((x) => x.id === 'demo-run');
  assert.ok(r);
  assert.equal(r.title, 'Zadanie demo');
  assert.equal(r.status, 'done');
  assert.equal(r.source, 'demo');
});

test('a run is served as its JSONL text; unknown or bad ids are refused', async () => {
  const ok = await fetch(base + '/api/runs/demo-run');
  assert.equal(ok.status, 200);
  assert.match(await ok.text(), /run\.started/);
  assert.equal((await fetch(base + '/api/runs/nope')).status, 404);
  assert.equal((await fetch(base + '/api/runs/..%2Fetc')).status, 400);
});

test('an event posted to a run is stored, checked, and pushed to LIVE viewers', async () => {
  const ws = new WebSocket(base.replace('http', 'ws') + '/live?run=live-1');
  const got = [];
  ws.on('message', (m) => got.push(JSON.parse(m.toString())));
  await new Promise((resolve) => ws.on('open', resolve));
  const good = await fetch(base + '/api/runs/live-1/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'run.started', text: 'na żywo' }) });
  assert.equal(good.status, 200);
  const bad = await fetch(base + '/api/runs/live-1/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'message.sent', from: 'a' }) });
  assert.equal(bad.status, 207);
  assert.deepEqual((await bad.json()).refused[0].errors, ['to']);
  await new Promise((resolve) => setTimeout(resolve, 150));
  ws.close();
  assert.equal(got.length, 1);
  assert.equal(got[0].text, 'na żywo');
  assert.match(fs.readFileSync(path.join(dir, 'live-1.jsonl'), 'utf8'), /na żywo/);
  const runs = await (await fetch(base + '/api/runs')).json();
  assert.equal(runs.find((x) => x.id === 'live-1').status, 'running');
});

test('only the app, src and three.js are served; no path escapes', async () => {
  assert.equal((await fetch(base + '/')).status, 200);
  assert.equal((await fetch(base + '/src/events.js')).status, 200);
  assert.equal((await fetch(base + '/vendor/three/build/three.module.js')).status, 200);
  assert.equal((await fetch(base + '/src/../package.json')).status, 404);
  assert.equal((await fetch(base + '/server/server.mjs')).status, 404);
});
