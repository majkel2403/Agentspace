#!/usr/bin/env node
// Swarm command deck server: the web app, the runs (REST), new events from producers (POST) and the LIVE stream (WebSocket).
//   GET  /api/runs                 list of runs (recorded and live)
//   GET  /api/runs/:id             the run's JSONL text
//   POST /api/runs/:id/events      one event or an array; stored in data/runs and sent to LIVE viewers
//   POST /api/sim                  start a live swarm on a task; returns its run id
//   POST /api/runs/:id/command     the conductor speaks to a live swarm: {text}
//   WS   /live?run=:id             new events of a run, as they arrive
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createStore, RUN_ID } from './store.mjs';
import { createSwarm } from './sim.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.map': 'application/json', '.svg': 'image/svg+xml' };
const MAX_BODY = 1 << 20;

// static files: the app (public/, src/) and three.js from node_modules; nothing else is served
function staticFile(urlPath) {
  const map = [
    ['/vendor/three/', path.join(ROOT, 'node_modules/three/')],
    ['/src/', path.join(ROOT, 'src/')],
    ['/public/', path.join(ROOT, 'public/')],
  ];
  if (urlPath === '/') urlPath = '/public/index.html';
  for (const [prefix, base] of map) {
    if (!urlPath.startsWith(prefix)) continue;
    const file = path.normalize(path.join(base, urlPath.slice(prefix.length)));
    if (!file.startsWith(base)) return null;
    return file;
  }
  return null;
}

export function createServer({ port = 4777, host = '127.0.0.1', dataDir = path.join(ROOT, 'data/runs'), demoDir = path.join(ROOT, 'demo/runs') } = {}) {
  const store = createStore({ dataDir, demoDir });
  const subs = new Map(); // run id -> Set of sockets
  const swarms = new Map(); // run id -> live swarm
  const workspace = fs.readFileSync(path.join(ROOT, 'demo/workspaces/socket.io.txt'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
  const broadcast = (id, e) => { for (const ws of subs.get(id) || []) if (ws.readyState === 1) ws.send(JSON.stringify(e)); };
  const send = (res, code, body, type = 'application/json; charset=utf-8') => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-cache' }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
  const readBody = (req) => new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (req.method === 'GET' && url.pathname === '/api/runs') return send(res, 200, store.list());
      if (req.method === 'POST' && url.pathname === '/api/sim') {
        let body = {}; try { const raw = await readBody(req); body = raw ? JSON.parse(raw) : {}; } catch (e) { return send(res, 400, { error: 'json' }); }
        const id = 'roj-' + Date.now().toString(36);
        const task = String(body.task || 'Przejrzyj moduł połączeń i napraw timer reconnectu.').slice(0, 300);
        const swarm = createSwarm({
          id, task, files: workspace, seed: Date.now() % 100000,
          emit: (e) => { const r = store.append(id, { ts: Date.now(), ...e }); for (const k of r.kept) broadcast(id, k); },
        });
        swarms.set(id, swarm); swarm.start();
        return send(res, 200, { run: id });
      }
      const c = url.pathname.match(/^\/api\/runs\/([^/]+)\/command$/);
      if (c && req.method === 'POST') {
        const id = decodeURIComponent(c[1]);
        const swarm = swarms.get(id);
        if (!swarm) return send(res, 404, { error: 'no live swarm in this run' });
        let body; try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, 400, { error: 'json' }); }
        return send(res, 200, swarm.command(body.text));
      }
      const m = url.pathname.match(/^\/api\/runs\/([^/]+)(\/events)?$/);
      if (m) {
        const id = decodeURIComponent(m[1]);
        if (!RUN_ID.test(id)) return send(res, 400, { error: 'bad run id' });
        if (req.method === 'GET' && !m[2]) {
          const text = store.read(id);
          return text == null ? send(res, 404, { error: 'no such run' }) : send(res, 200, text, 'application/x-ndjson; charset=utf-8');
        }
        if (req.method === 'POST' && m[2]) {
          let body; try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, 400, { error: 'json: ' + e.message }); }
          const out = store.append(id, body);
          for (const e of out.kept) for (const ws of subs.get(id) || []) if (ws.readyState === 1) ws.send(JSON.stringify(e));
          return send(res, out.ok ? 200 : 207, out);
        }
        return send(res, 405, { error: 'method' });
      }
      if (req.method !== 'GET') return send(res, 405, { error: 'method' });
      const file = staticFile(url.pathname);
      if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'not found', 'text/plain; charset=utf-8');
      return send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
    } catch (e) {
      return send(res, 500, { error: String(e && e.message || e) });
    }
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname !== '/live') { socket.destroy(); return; }
    const id = url.searchParams.get('run') || '';
    if (!RUN_ID.test(id)) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => {
      if (!subs.has(id)) subs.set(id, new Set());
      subs.get(id).add(ws);
      ws.on('close', () => subs.get(id) && subs.get(id).delete(ws));
    });
  });

  return {
    server,
    listen: () => new Promise((resolve) => server.listen(port, host, () => resolve(server.address()))),
    close: () => new Promise((resolve) => { for (const sw of swarms.values()) sw.stop(); for (const set of subs.values()) for (const ws of set) ws.terminate(); wss.close(); server.close(() => resolve()); }),
  };
}

// run directly: npm start
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const port = Number(process.env.PORT || 4777);
  const s = createServer({ port });
  s.listen().then((a) => console.log('swarm deck on http://127.0.0.1:' + a.port));
}
