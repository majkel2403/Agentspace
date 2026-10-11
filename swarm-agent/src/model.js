// The state of a run at any moment. It is only ever computed by applying the events in order: applyEvent() is the
// one place where the log changes the picture. createReplay() gives the state at a time t (seconds from the start);
// going forward it applies the new events, going back it starts again, so every time has exactly one state.
import { TYPES } from './events.js';

export const QUEEN = 'queen';

export function newState(t0) {
  const st = {
    t0, now: 0, task: '', done: false, failed: false, thoughts: [],
    agents: new Map(), order: [],
    files: new Map(),
    messages: [], actions: [], results: [],
    plan: { steps: [], cur: 0 },
    tests: new Map(),
    last: -1,
  };
  addAgent(st, { agent: QUEEN, label: 'Królowa', role: 'orkiestrator', parent: null, status: 'idle' }, 0);
  return st;
}

function addAgent(st, o, now) {
  const a = {
    id: o.agent, label: o.label || o.agent, role: o.role || '', parent: o.parent || null,
    status: o.status || 'idle', task: '', tool: null, command: '', toolOk: null, note: '',
    at: null, from: null, atSince: now, touches: 0, spawnedAt: now, reads: 0, writes: 0,
  };
  st.agents.set(a.id, a);
  st.order.push(a.id);
  return a;
}

// where an agent is: a file path, another agent's id (it stands next to them), or null (back at its parent)
function setAt(a, key, now) {
  if (a.at === key) return;
  a.from = a.at; a.at = key; a.atSince = now;
}

function touchFile(st, path, now) {
  let f = st.files.get(path);
  if (!f) { f = { path, known: true, knownAt: now, state: 'idle', touches: 0, lastBy: null, lastT: -1, lines: 0 }; st.files.set(path, f); }
  return f;
}

// the one function that changes the state: applies event ev (index k of the log) at time now (seconds)
export function applyEvent(st, ev, k) {
  const now = (ev.ts - st.t0) / 1000;
  st.now = now;
  st.last = k;
  const agent = (id) => st.agents.get(id) || (id ? addAgent(st, { agent: id, label: id, parent: QUEEN, status: 'idle' }, now) : null);
  switch (ev.type) {
    case 'run.started': st.task = ev.text || ''; agent(QUEEN).status = 'working'; break;
    case 'run.completed': st.done = true; agent(QUEEN).status = 'done'; break;
    case 'run.failed': st.failed = true; agent(QUEEN).status = 'failed'; break;
    case 'queen.thought': st.thoughts.push({ t: now, text: ev.text || '' }); agent(QUEEN).note = ev.text || ''; break;
    case 'plan.updated': st.plan = { steps: ev.steps, cur: Number.isInteger(ev.step) ? ev.step : st.plan.cur }; break;
    case 'agent.spawned': {
      const a = st.agents.get(ev.agent) || addAgent(st, { agent: ev.agent, parent: ev.parent || QUEEN }, now);
      a.label = ev.label || a.label; a.role = ev.role || a.role; a.parent = ev.parent || a.parent || QUEEN;
      a.status = 'idle'; a.note = ev.text || ''; a.spawnedAt = now;
      setAt(a, a.parent, now);
      break;
    }
    case 'agent.finished': { const a = agent(ev.agent); a.status = 'done'; setAt(a, null, now); break; }
    case 'agent.failed': { const a = agent(ev.agent); a.status = 'failed'; a.note = ev.text || ''; break; }
    case 'message.sent': {
      agent(ev.from); agent(ev.to);
      st.messages.push({ t: now, from: ev.from, to: ev.to, tone: ev.tone || 'result', text: ev.text || '', task: ev.task || '' });
      if (ev.tone === 'assign' && ev.task) agent(ev.to).task = ev.task;
      break;
    }
    case 'tool.started': { const a = agent(ev.agent); a.status = 'working'; a.tool = ev.tool; a.command = ev.command || ''; a.toolOk = null; break; }
    case 'tool.finished': { const a = agent(ev.agent); a.toolOk = ev.ok !== false; a.tool = null; a.command = ''; a.note = ev.text || a.note; break; }
    case 'file.read': {
      const a = agent(ev.agent); const f = touchFile(st, ev.path, now);
      if (f.state === 'idle') f.state = 'read';
      f.touches++; f.lastBy = a.id; f.lastT = now; a.reads++; a.touches++; a.status = 'working';
      setAt(a, ev.path, now); st.actions.push({ t: now, agent: a.id, path: ev.path, kind: 'read' });
      break;
    }
    case 'file.write': {
      const a = agent(ev.agent); const f = touchFile(st, ev.path, now);
      f.state = ev.action || 'modified'; f.lines = ev.lines != null ? ev.lines : f.lines;
      f.touches++; f.lastBy = a.id; f.lastT = now; a.writes++; a.touches++; a.status = 'working';
      setAt(a, ev.path, now); st.actions.push({ t: now, agent: a.id, path: ev.path, kind: f.state });
      break;
    }
    case 'scan': {
      for (const p of ev.paths) { const f = st.files.get(p); if (!f) { st.files.set(p, { path: p, known: true, knownAt: now, state: 'idle', touches: 0, lastBy: null, lastT: -1, lines: 0 }); } }
      break;
    }
    case 'test': {
      st.tests.set(ev.name, { status: ev.status, by: ev.agent, t: now, output: ev.output || '' });
      break;
    }
    case 'result': { const a = agent(ev.agent); st.results.push({ t: now, agent: a.id, text: ev.text || '' }); a.note = ev.text || a.note; break; }
    default: break;
  }
  // the agent who acted is on the way: an event that is not a finish keeps it working
  if (ev.agent && st.agents.has(ev.agent)) {
    const a = st.agents.get(ev.agent);
    if (a.status === 'idle' && ['tool.started', 'file.read', 'file.write', 'message.sent'].includes(ev.type)) a.status = 'working';
  }
  // scanned paths were registered above as known; a path touched first by the log is known from its first event
  return st;
}

// the replay of a run: state(seconds) with a forward cache. events may grow (live): append() keeps the order
export function createReplay(events) {
  const ev = events.slice();
  const t0 = ev.length ? ev[0].ts : 0;
  let st = newState(t0);
  let k = -1;
  const reset = () => { st = newState(t0); k = -1; };
  return {
    get events() { return ev; },
    t0,
    get duration() { return ev.length ? (ev[ev.length - 1].ts - t0) / 1000 : 0; },
    append(e) { ev.push(e); return ev.length - 1; },
    at(seconds) {
      const limit = t0 + seconds * 1000;
      // the last index with ts <= limit (ev is sorted by ts)
      let lo = 0; let hi = ev.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (ev[m].ts <= limit) lo = m + 1; else hi = m; }
      const target = lo - 1;
      if (target < k) reset();
      while (k < target) { k++; applyEvent(st, ev[k], k); }
      if (target < 0 && st.now === 0 && k < 0) st.now = Math.max(0, seconds);
      return st;
    },
    // rule-of-the-deck: which tool names and types the log uses (for the legend)
    types() { return Object.keys(TYPES).filter((t) => ev.some((e) => e.type === t)); },
  };
}
