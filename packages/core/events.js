// Event schema of the Neural Workflow.
// One event = one real thing that happened in a run. The renderer animates ONLY these events
// ("zero fake animation"): every node, line, impulse, ripple and wave on screen is derived from them.
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
//   latencyMs, tokens, confidence (0..1) — optional metrics, drive the "5th dimension" (size, light, energy)

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
};

// Visual vocabulary per node kind (also used by the legend).
export const KINDS = {
  user: { label: 'Użytkownik', color: '#C9D3F2' },
  hermes: { label: 'Hermes Core', color: '#F2C14E' },
  planner: { label: 'Planner', color: '#FFD98A' },
  agent: { label: 'Agent', color: '#6DB6FF' },
  tool: { label: 'Narzędzie', color: '#4FF0D8' },
  file: { label: 'Plik', color: '#9FE3FF' },
  resource: { label: 'Zasób', color: '#B7A6FF' },
  memory: { label: 'Pamięć', color: '#FF9FD8' },
  gateway: { label: 'MCP / API', color: '#FFAE5C' },
  test: { label: 'Test', color: '#8CFFB4' },
  result: { label: 'Wynik', color: '#FFF1C2' },
};

// Colour of an impulse by event type (photon colour).
export const PULSE = {
  read: '#9FE3FF', write: '#FFAE5C', create: '#7CFF9A', delete: '#FF6B6B', message: '#D6BEFF',
  tool: '#4FF0D8', result: '#FFE9A8', error: '#FF4D5E', success: '#B8FFD0', reasoning: '#F2C14E',
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
