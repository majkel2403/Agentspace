#!/usr/bin/env node
// Jarvis relay: reads the agent events of Jarvis's bridge (SSE `event: agent`) and posts them to this server as
// workflow events, so Hermes work from Telegram, cron or the console shows up in the command deck, live.
//   JARVIS_BRIDGE_URL   default http://127.0.0.1:8651
//   JARVIS_BRIDGE_TOKEN default: ~/.jarvis-os/bridge-token (or $JARVIS_HOME/bridge-token)
//   AGENTSPACE_URL      default http://127.0.0.1:4777
//   INGEST_TOKEN        the server's ingest token, when it has one
//   node tools/jarvis-relay.mjs            (keeps reconnecting; Ctrl+C stops)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { jarvisToEvent, sseMessages } from '../adapters/jarvis.mjs';

const BRIDGE = (process.env.JARVIS_BRIDGE_URL || 'http://127.0.0.1:8651').replace(/\/$/, '');
const AGENTSPACE = (process.env.AGENTSPACE_URL || 'http://127.0.0.1:4777').replace(/\/$/, '');

function bridgeToken() {
  if (process.env.JARVIS_BRIDGE_TOKEN) return process.env.JARVIS_BRIDGE_TOKEN.trim();
  const home = process.env.JARVIS_HOME || path.join(os.homedir(), '.jarvis-os');
  try { return fs.readFileSync(path.join(home, 'bridge-token'), 'utf8').trim(); } catch (e) { return ''; }
}

async function post(evs) {
  const headers = { 'content-type': 'application/json' };
  if (process.env.INGEST_TOKEN) headers.authorization = 'Bearer ' + process.env.INGEST_TOKEN;
  const res = await fetch(AGENTSPACE + '/events', { method: 'POST', headers, body: evs.map((e) => JSON.stringify(e)).join('\n') });
  if (!res.ok) console.warn('server refused events: HTTP ' + res.status);
}

async function follow() {
  const token = bridgeToken();
  if (!token) throw new Error('no bridge token: set JARVIS_BRIDGE_TOKEN or create ~/.jarvis-os/bridge-token');
  const res = await fetch(BRIDGE + '/bridge/events?token=' + encodeURIComponent(token), { headers: { accept: 'text/event-stream' } });
  if (!res.ok || !res.body) throw new Error('bridge answered HTTP ' + res.status);
  console.log('connected to ' + BRIDGE + ', relaying to ' + AGENTSPACE);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) throw new Error('bridge stream closed');
    buf += decoder.decode(value, { stream: true });
    const { messages, rest } = sseMessages(buf);
    buf = rest;
    const evs = [];
    for (const m of messages) {
      if (m.event !== 'agent') continue;
      let raw; try { raw = JSON.parse(m.data); } catch (e) { continue; }
      const ev = jarvisToEvent(raw);
      if (ev) evs.push(ev);
    }
    if (evs.length) await post(evs).catch((e) => console.warn('post failed: ' + e.message));
  }
}

let delay = 1000;
for (;;) {
  try { await follow(); } catch (e) { console.warn(e.message + ' — retry in ' + Math.round(delay / 1000) + ' s'); }
  await new Promise((r) => setTimeout(r, delay));
  delay = Math.min(delay * 2, 30000);
}
