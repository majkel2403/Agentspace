// The event log of a swarm run. One event is one thing that really happened: the scene and the deck are derived
// from these events only (nothing is animated that the log does not say). One event per line in a .jsonl file.
//
//   ts    number, ms since epoch (ISO strings are accepted and converted)     required
//   type  one of TYPES                                                        required
//   …     fields the type needs (see TYPES): agent, from/to, path, …
//
// Agent ids are chosen by the producer; "queen" is the orchestrator. Labels shown on screen come from agent.spawned.

export const TONES = ['assign', 'question', 'answer', 'result', 'handoff', 'critique', 'revision', 'approve'];
export const ACTIONS = ['created', 'modified', 'deleted'];

// need: required fields; kind: the type of each optional field that is checked when present
export const TYPES = {
  'run.started': { need: [] },
  'run.completed': { need: [] },
  'run.failed': { need: [] },
  'queen.thought': { need: [] },
  'plan.updated': { need: ['steps'] },
  'agent.spawned': { need: ['agent'] },
  'agent.finished': { need: ['agent'] },
  'agent.failed': { need: ['agent'] },
  'message.sent': { need: ['from', 'to'] },
  'tool.started': { need: ['agent', 'tool'] },
  'tool.finished': { need: ['agent', 'tool'] },
  'file.read': { need: ['agent', 'path'] },
  'file.write': { need: ['agent', 'path'] },
  'scan': { need: ['agent', 'paths'] },
  'test': { need: ['agent', 'name', 'status'] },
  'result': { need: ['agent'] },
  'user.command': { need: ['text'] },
};

const isStr = (v) => typeof v === 'string';

// checks one event; returns { ok, errors, event } where event is normalised (numeric ts, strings trimmed)
export function validateEvent(raw) {
  const errors = [];
  const e = { ...raw };
  if (typeof e.ts === 'string') e.ts = Date.parse(e.ts);
  if (!Number.isFinite(e.ts)) errors.push('ts');
  if (!TYPES[e.type]) errors.push('type');
  if (errors.length) return { ok: false, errors, event: e };
  for (const k of TYPES[e.type].need) if (e[k] == null || e[k] === '') errors.push(k);
  for (const k of ['agent', 'from', 'to', 'parent', 'path', 'tool', 'name', 'text', 'label', 'role']) if (e[k] != null && !isStr(e[k])) errors.push(k);
  if (e.paths != null && (!Array.isArray(e.paths) || !e.paths.every(isStr))) errors.push('paths');
  if (e.steps != null && (!Array.isArray(e.steps) || !e.steps.every(isStr))) errors.push('steps');
  if (e.tone != null && !TONES.includes(e.tone)) errors.push('tone');
  if (e.action != null && !ACTIONS.includes(e.action)) errors.push('action');
  if (e.status != null && !['passed', 'failed'].includes(e.status)) errors.push('status');
  return { ok: errors.length === 0, errors, event: e };
}

// a JSONL text to a sorted list of valid events; bad lines are reported, not thrown
export function parseJsonl(text) {
  const events = []; const bad = [];
  text.split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    let raw;
    try { raw = JSON.parse(line); } catch { bad.push({ line: i + 1, error: 'json' }); return; }
    const r = validateEvent(raw);
    if (r.ok) events.push(r.event); else bad.push({ line: i + 1, error: r.errors.join(',') });
  });
  events.sort((a, b) => a.ts - b.ts);
  return { events, bad };
}
