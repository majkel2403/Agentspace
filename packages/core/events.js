// Event schema of the Neural Workflow.
// One event = one real thing that happened in a run. The viewer animates ONLY these events
// ("zero fake animation"): every file, directory, beam and avatar move on screen is derived from them
// (through the Gource-style action stream, gource/actions.js).
//
// Shape (JSON, one object per line in a .jsonl file):
//   ts          number (ms since epoch) or ISO string                       required
//   run         string — run / task id                                       required
//   type        string — one of EVENT_TYPES                                  required
//   agent       string — agent id (research, coder, …)                       for agent.*, tool.*, file.*, …
//   tool        string — tool name (web_search, edit, terminal, …)           for tool.*
//   resource    string — path / url / key of the touched resource            for resource.*, file.*, memory.*
//   to          string — receiver agent id (message.sent) or "hermes"
//   parent      string — explicit parent agent id (agent.spawned)
//   name        string — test / gateway name
//   text        string — human-readable description (shown in the log and the inspector)
//   paths       string[] — workspace.scanned: paths listed in the workspace (e.g. `git ls-files`), max 5000
//   latencyMs, tokens, confidence (0..1) — optional metrics (shown in the inspector)

export const EVENT_TYPES = {
  'task.started': { need: [] },
  'task.completed': { need: [] },
  'task.failed': { need: [] },
  'hermes.reasoning': { need: [] },
  'planner.step': { need: [] },
  'agent.spawned': { need: ['agent'] },
  'agent.waiting': { need: ['agent'] },
  'agent.completed': { need: ['agent'] },
  'agent.failed': { need: ['agent'] },
  'tool.started': { need: ['agent', 'tool'] },
  'tool.completed': { need: ['agent', 'tool'] },
  'tool.failed': { need: ['agent', 'tool'] },
  'resource.read': { need: ['resource'] },
  'resource.written': { need: ['resource'] },
  'file.read': { need: ['resource'] },
  'file.created': { need: ['resource'] },
  'file.modified': { need: ['resource'] },
  'file.deleted': { need: ['resource'] },
  'memory.read': { need: [] },
  'memory.write': { need: [] },
  'gateway.call': { need: ['name'] },
  'test.started': { need: ['name'] },
  'test.passed': { need: ['name'] },
  'test.failed': { need: ['name'] },
  'message.sent': { need: ['agent', 'to'] },
  'result.returned': { need: ['agent'] },
  'error': { need: [] },
  'workspace.scanned': { need: ['agent', 'resource'] },
};


/** Normalise one raw event; returns { ok, event, error }. */
export function validateEvent(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'event is not an object' };
  const spec = EVENT_TYPES[raw.type];
  if (!spec) return { ok: false, error: 'unknown type: ' + raw.type };
  if (raw.run == null || raw.run === '') return { ok: false, error: 'missing run' };
  const ts = typeof raw.ts === 'number' ? raw.ts : Date.parse(raw.ts);
  if (!Number.isFinite(ts)) return { ok: false, error: 'bad ts: ' + raw.ts };
  for (const k of spec.need) if (raw[k] == null || raw[k] === '') return { ok: false, error: raw.type + ' needs ' + k };
  const ev = Object.assign({}, raw, { ts, run: String(raw.run) });
  for (const k of ['latencyMs', 'tokens', 'confidence']) if (ev[k] != null && !Number.isFinite(Number(ev[k]))) delete ev[k];
  if (ev.type === 'workspace.scanned') {
    if (!Array.isArray(ev.paths) || ev.paths.length > 5000 || ev.paths.some((p) => typeof p !== 'string' || !p)) return { ok: false, error: 'workspace.scanned needs paths: string[] (max 5000)' };
  }
  return { ok: true, event: ev };
}

/** Parse JSONL text into valid events (sorted by ts, stable) + list of rejected lines. */
export function parseJsonl(text) {
  const events = [];
  const errors = [];
  String(text).split(/\r?\n/).forEach((line, i) => {
    const s = line.trim();
    if (!s || s[0] === '#') return;
    let raw;
    try { raw = JSON.parse(s); } catch (e) { errors.push({ line: i + 1, error: 'invalid JSON' }); return; }
    const r = validateEvent(raw);
    if (r.ok) events.push(r.event); else errors.push({ line: i + 1, error: r.error });
  });
  events.forEach((e, i) => { e._seq = i; });
  events.sort((a, b) => a.ts - b.ts || a._seq - b._seq);
  events.forEach((e) => { delete e._seq; });
  return { events, errors };
}
