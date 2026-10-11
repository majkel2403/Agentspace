// Runs as files: one .jsonl per run. Recorded (demo) runs are read-only; live runs are appended to data/runs.
import fs from 'node:fs';
import path from 'node:path';
import { validateEvent } from '../src/events.js';

export const RUN_ID = /^[a-z0-9][a-z0-9-]{0,62}$/;
const LIVE_WINDOW_MS = 5 * 60 * 1000;

export function createStore({ dataDir, demoDir }) {
  const dirs = [{ dir: dataDir, source: 'live' }, { dir: demoDir, source: 'demo' }];
  const find = (id) => {
    if (!RUN_ID.test(id)) return null;
    for (const d of dirs) {
      const file = path.join(d.dir, id + '.jsonl');
      if (fs.existsSync(file)) return { file, source: d.source };
    }
    return null;
  };
  // a summary of each run from its events: title, times, and whether it is still going
  const summarise = (id, source, text) => {
    const lines = text.split('\n').filter((l) => l.trim());
    let first = null; let last = null; let title = ''; let ended = false; let failed = false; let count = 0;
    for (const line of lines) {
      let e; try { e = JSON.parse(line); } catch { continue; }
      const r = validateEvent(e);
      if (!r.ok) continue;
      count++;
      const ts = r.event.ts;
      if (first == null || ts < first) first = ts;
      if (last == null || ts > last) last = ts;
      if (!title && (r.event.type === 'run.started')) title = r.event.text || '';
      if (r.event.type === 'run.completed') ended = true;
      if (r.event.type === 'run.failed') { ended = true; failed = true; }
    }
    const recent = last != null && Date.now() - last < LIVE_WINDOW_MS;
    const status = ended ? (failed ? 'failed' : 'done') : source === 'live' && recent ? 'running' : 'stopped';
    return { id, source, events: count, startedAt: first, endedAt: last, title: title || id, status };
  };
  return {
    list() {
      const out = [];
      for (const d of dirs) {
        if (!fs.existsSync(d.dir)) continue;
        for (const f of fs.readdirSync(d.dir).sort()) {
          if (!f.endsWith('.jsonl')) continue;
          const id = f.slice(0, -6);
          if (!RUN_ID.test(id) || out.some((r) => r.id === id)) continue; // a live run shadows a demo of the same id
          out.push(summarise(id, d.source, fs.readFileSync(path.join(d.dir, f), 'utf8')));
        }
      }
      return out.sort((a, b) => (a.source === b.source ? (b.startedAt || 0) - (a.startedAt || 0) : a.source === 'live' ? -1 : 1));
    },
    read(id) { const f = find(id); return f ? fs.readFileSync(f.file, 'utf8') : null; },
    // one event (or an array); a missing ts is the arrival time; returns what was kept and what was refused
    append(id, input) {
      if (!RUN_ID.test(id)) return { ok: false, error: 'bad run id' };
      const list = Array.isArray(input) ? input : [input];
      const kept = []; const refused = [];
      for (const raw of list) {
        const e = { ts: Date.now(), ...raw, run: id };
        const r = validateEvent(e);
        if (r.ok) kept.push(r.event); else refused.push({ type: raw && raw.type, errors: r.errors });
      }
      if (kept.length) {
        fs.mkdirSync(dataDir, { recursive: true });
        fs.appendFileSync(path.join(dataDir, id + '.jsonl'), kept.map((e) => JSON.stringify(e)).join('\n') + '\n');
      }
      return { ok: refused.length === 0, kept, refused };
    },
  };
}
