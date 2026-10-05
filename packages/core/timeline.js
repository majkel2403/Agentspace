// Graph state of a run as a pure function of its event log.
// createTimeline(events) -> { events, t0, duration, stateAt(t), fxAt(i), between(a, b), append(ev) }
// t is milliseconds since the first event. stateAt() is exact for any t (scrub backwards and forwards):
// it restores the nearest snapshot and re-applies the following events.
import { PULSE } from './events.js';

const SNAP_EVERY = 48;
// optional colour of a message by its intent (message.sent { tone })
export const TONE = { assign: '#F2C14E', question: '#7CC4FF', answer: '#D6BEFF', critique: '#FF8FA3', revision: '#FFB48A', approve: '#34D3BE', handoff: '#D6BEFF', result: '#FFE9A8', brief: '#E8ECF8' };

export function emptyState() {
  return { nodes: {}, edges: {}, order: [], task: { title: '', status: 'idle', startedAt: null, endedAt: null }, counts: { events: 0, errors: 0, tokens: 0 } };
}

function clone(s) {
  return JSON.parse(JSON.stringify(s));
}

const agentId = (a) => (a === 'hermes' ? 'hermes' : 'agent:' + a);
const fileKind = (type) => (type.startsWith('file.') ? 'file' : 'resource');

function ensure(s, id, kind, label, parent, t, extra) {
  let n = s.nodes[id];
  if (!n) {
    n = s.nodes[id] = { id, kind, label: label || id, parent: parent || null, born: t, status: 'idle', last: t, hits: 0, tokens: 0, latencyMs: 0, confidence: null, idx: 0, ext: '', text: '' };
    if (parent && s.nodes[parent]) {
      const p = s.nodes[parent];
      p.kids = (p.kids || 0) + 1;
      n.idx = p.kids - 1;
    }
    s.order.push(id);
    if (parent) edge(s, parent, id, 'tree', t);
  }
  if (extra) Object.assign(n, extra);
  return n;
}

function edge(s, a, b, kind, t) {
  const k = a < b ? a + '|' + b : b + '|' + a;
  let e = s.edges[k];
  if (!e) e = s.edges[k] = { a, b, kind, born: t, uses: 0, last: t };
  e.uses++;
  e.last = t;
  return e;
}

function touch(n, t, ev) {
  n.hits++;
  n.last = t;
  if (ev.tokens) n.tokens += Number(ev.tokens);
  if (ev.latencyMs) n.latencyMs = Number(ev.latencyMs);
  if (ev.confidence != null) n.confidence = Number(ev.confidence);
  if (ev.text) n.text = ev.text;
}

function core(s, t) {
  return ensure(s, 'hermes', 'hermes', 'Hermes', null, t);
}

// Apply one event; returns the visual side-effects it causes (impulses + effects), deterministic.
export function apply(s, ev, t) {
  const fx = { pulses: [], effects: [] };
  const pulse = (from, to, color, w) => { if (from && to && from !== to) fx.pulses.push({ from, to, color, w: w || 1 }); };
  const effect = (node, kind) => fx.effects.push({ node, kind });
  s.counts.events++;
  if (ev.tokens) s.counts.tokens += Number(ev.tokens);
  const A = ev.agent ? agentId(ev.agent) : null;
  const actor = () => {
    if (A === 'hermes') return core(s, t).id;
    if (A && !s.nodes[A]) ensure(s, A, 'agent', ev.agent, s.nodes.planner ? 'planner' : 'hermes', t);
    return A || 'hermes';
  };
  switch (ev.type) {
    case 'task.started': {
      ensure(s, 'user', 'user', ev.user || 'Użytkownik', null, t);
      const h = core(s, t);
      edge(s, 'user', 'hermes', 'tree', t);
      s.task.title = ev.text || s.task.title;
      s.task.status = 'running';
      s.task.startedAt = t;
      h.status = 'active';
      touch(h, t, ev);
      pulse('user', 'hermes', PULSE.reasoning, 2);
      effect('hermes', 'spawn');
      break;
    }
    case 'hermes.reasoning': {
      const h = core(s, t);
      h.status = 'thinking';
      touch(h, t, ev);
      effect('hermes', 'reasoning');
      break;
    }
    case 'planner.step': {
      core(s, t);
      const p = ensure(s, 'planner', 'planner', 'Planner', 'hermes', t);
      p.status = 'active';
      touch(p, t, ev);
      pulse('hermes', 'planner', PULSE.reasoning);
      break;
    }
    case 'agent.spawned': {
      core(s, t);
      const parent = ev.parent ? agentId(ev.parent) : s.nodes.planner ? 'planner' : 'hermes';
      const n = ensure(s, A, 'agent', ev.label || ev.agent, s.nodes[parent] ? parent : 'hermes', t, { role: ev.text || '' });
      n.status = 'active';
      touch(n, t, ev);
      pulse(n.parent, A, PULSE.reasoning, 1.5);
      effect(A, 'spawn');
      break;
    }
    case 'agent.waiting': { const n = s.nodes[actor()]; n.status = 'waiting'; touch(n, t, ev); break; }
    case 'agent.completed': { const n = s.nodes[actor()]; n.status = 'done'; touch(n, t, ev); effect(A, 'success'); break; }
    case 'agent.failed': { const n = s.nodes[actor()]; n.status = 'error'; touch(n, t, ev); s.counts.errors++; effect(A, 'error'); break; }
    case 'tool.started':
    case 'tool.completed':
    case 'tool.failed': {
      const a = actor();
      const id = 'tool:' + ev.agent + ':' + ev.tool;
      const n = ensure(s, id, 'tool', ev.tool, a, t);
      n.status = ev.type === 'tool.started' ? 'active' : ev.type === 'tool.completed' ? 'done' : 'error';
      touch(n, t, ev);
      s.nodes[a].status = 'active';
      if (ev.type === 'tool.started') { pulse(a, id, PULSE.tool); effect(id, 'spawn'); }
      else if (ev.type === 'tool.completed') pulse(id, a, PULSE.success);
      else { s.counts.errors++; effect(id, 'error'); }
      break;
    }
    case 'resource.read':
    case 'resource.written':
    case 'file.read':
    case 'file.created':
    case 'file.modified':
    case 'file.deleted': {
      const a = actor();
      const via = ev.tool && s.nodes['tool:' + ev.agent + ':' + ev.tool] ? 'tool:' + ev.agent + ':' + ev.tool : a;
      const kind = fileKind(ev.type);
      const id = (kind === 'file' ? 'file:' : 'res:') + ev.resource;
      const base = String(ev.resource).split(/[\\/]/).pop();
      const ext = kind === 'file' && base.includes('.') ? base.split('.').pop().toLowerCase() : kind;
      const n = ensure(s, id, kind, base, via, t, { ext });
      touch(n, t, ev);
      edge(s, via, id, 'touch', t);
      if (ev.type === 'file.deleted') { n.status = 'deleted'; pulse(via, id, PULSE.delete); }
      else if (ev.type.endsWith('read')) { n.status = n.status === 'idle' ? 'read' : n.status; pulse(id, via, PULSE.read); }
      else { n.status = ev.type === 'file.created' ? 'created' : 'modified'; n.rev = (n.rev || 0) + 1; pulse(via, id, ev.type === 'file.created' ? PULSE.create : PULSE.write); }
      break;
    }
    case 'memory.read':
    case 'memory.write': {
      core(s, t);
      const m = ensure(s, 'memory', 'memory', 'Pamięć', 'hermes', t);
      touch(m, t, ev);
      const a = actor();
      edge(s, a, 'memory', 'touch', t);
      if (ev.type === 'memory.read') pulse('memory', a, PULSE.read); else pulse(a, 'memory', PULSE.write);
      break;
    }
    case 'gateway.call': {
      const a = actor();
      const id = 'gw:' + ev.name;
      const n = ensure(s, id, 'gateway', ev.name, 'hermes', t);
      touch(n, t, ev);
      edge(s, a, id, 'touch', t);
      pulse(a, id, PULSE.tool, 1.2);
      break;
    }
    case 'test.started':
    case 'test.passed':
    case 'test.failed': {
      const a = actor();
      const id = 'test:' + (ev.agent || 'hermes') + ':' + ev.name;
      const n = ensure(s, id, 'test', ev.name, a, t);
      n.status = ev.type === 'test.started' ? 'active' : ev.type === 'test.passed' ? 'done' : 'error';
      touch(n, t, ev);
      if (ev.type === 'test.started') pulse(a, id, PULSE.tool);
      else if (ev.type === 'test.passed') { pulse(id, a, PULSE.success); effect(id, 'success'); }
      else { s.counts.errors++; effect(id, 'error'); }
      break;
    }
    case 'message.sent': {
      const a = actor();
      const to = ev.to === 'hermes' ? core(s, t).id : ev.to === 'user' ? 'user' : agentId(ev.to);
      if (!s.nodes[to]) ensure(s, to, 'agent', ev.to, s.nodes.planner ? 'planner' : 'hermes', t);
      edge(s, a, to, 'talk', t);
      touch(s.nodes[a], t, ev);
      pulse(a, to, (ev.tone && TONE[ev.tone]) || PULSE.message, 1.2);
      break;
    }
    case 'result.returned': {
      const a = actor();
      touch(s.nodes[a], t, ev);
      core(s, t);
      pulse(a, 'hermes', PULSE.result, 1.6);
      break;
    }
    case 'task.completed':
    case 'task.failed': {
      const h = core(s, t);
      const ok = ev.type === 'task.completed';
      const r = ensure(s, 'result', 'result', ok ? 'Wynik' : 'Przerwano', 'hermes', t);
      touch(r, t, ev);
      r.status = ok ? 'done' : 'error';
      h.status = ok ? 'done' : 'error';
      s.task.status = ok ? 'done' : 'error';
      s.task.endedAt = t;
      pulse('hermes', 'result', ok ? PULSE.result : PULSE.error, 2);
      if (s.nodes.user) pulse('result', 'user', ok ? PULSE.result : PULSE.error, 2);
      effect('result', ok ? 'success' : 'error');
      effect('hermes', ok ? 'success' : 'error');
      if (!ok) s.counts.errors++;
      break;
    }
    case 'error': {
      const id = A && s.nodes[A] ? A : core(s, t).id;
      s.counts.errors++;
      touch(s.nodes[id], t, ev);
      effect(id, 'error');
      break;
    }
    default:
      break;
  }
  return fx;
}

export function createTimeline(inputEvents) {
  const events = [];
  const fx = [];
  const rel = [];
  const snaps = [];
  let t0 = null;
  let live = emptyState();
  const push = (ev) => {
    if (t0 == null) t0 = ev.ts;
    const t = Math.max(0, ev.ts - t0);
    if (events.length && t < rel[rel.length - 1]) throw new Error('events must be appended in time order');
    if (events.length % SNAP_EVERY === 0) snaps.push({ i: events.length, s: clone(live) });
    events.push(ev);
    rel.push(t);
    fx.push(apply(live, ev, t));
  };
  (inputEvents || []).forEach(push);

  // index of the last event with rel <= t, or -1
  const lastAt = (t) => {
    let lo = 0;
    let hi = rel.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (rel[mid] <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  };
  let cache = { upto: -2, s: null };
  return {
    events,
    rel,
    get t0() { return t0; },
    get duration() { return rel.length ? rel[rel.length - 1] : 0; },
    append(ev) { push(ev); },
    stateAt(t) {
      const upto = lastAt(t);
      if (cache.upto === upto) return cache.s;
      if (upto === events.length - 1) { cache = { upto, s: live }; return live; }
      let snap = snaps[0];
      for (let k = snaps.length - 1; k >= 0; k--) if (snaps[k].i <= upto + 1) { snap = snaps[k]; break; }
      const s = snap ? clone(snap.s) : emptyState();
      for (let i = snap ? snap.i : 0; i <= upto; i++) apply(s, events[i], rel[i]);
      cache = { upto, s };
      return s;
    },
    indexAt: lastAt,
    fxAt(i) { return fx[i]; },
    // events with a <= rel < b (indices)
    between(a, b) {
      const out = [];
      for (let i = Math.max(0, lastAt(a - 1e-6) + 1); i < rel.length && rel[i] < b; i++) out.push(i);
      return out;
    },
  };
}
