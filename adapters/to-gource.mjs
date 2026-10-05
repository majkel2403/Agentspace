#!/usr/bin/env node
// Convert a Neural Workflow event log (JSONL) into a Gource custom log.
//   node adapters/to-gource.mjs demo/runs/repo-fix.jsonl > repo-fix.gource.log
//   gource --log-format custom repo-fix.gource.log
// Live:  tail -f data/runs/<run>.jsonl | node adapters/to-gource.mjs --stream | gource --log-format custom --realtime -
import fs from 'node:fs';
import readline from 'node:readline';
import { parseJsonl, validateEvent, toGourceLines } from '../packages/core/index.js';

const args = process.argv.slice(2);
if (args.includes('--stream')) {
  const rl = readline.createInterface({ input: process.stdin });
  const all = [];
  let printed = 0;
  rl.on('line', (line) => {
    if (!line.trim()) return;
    let raw;
    try { raw = JSON.parse(line); } catch (e) { return; }
    const r = validateEvent(raw);
    if (!r.ok) return;
    all.push(r.event);
    const lines = toGourceLines(all);
    for (; printed < lines.length; printed++) process.stdout.write(lines[printed] + '\n');
  });
} else {
  const file = args[0];
  if (!file) { console.error('usage: to-gource.mjs <run.jsonl> | --stream'); process.exit(2); }
  const { events, errors } = parseJsonl(fs.readFileSync(file, 'utf8'));
  errors.forEach((e) => console.error('line ' + e.line + ': ' + e.error));
  process.stdout.write(toGourceLines(events).join('\n') + '\n');
}
