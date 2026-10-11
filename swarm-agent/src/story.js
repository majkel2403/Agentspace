// The story of a run, told from the log only: a caption for what is happening now, and the moments worth jumping to.
// Nothing here invents an event; every sentence is built from a field of the event it names.
import { QUEEN } from './model.js';

const name = (st, id) => { if (!id) return ''; if (id === 'user') return 'Zlecający'; const a = st.agents.get(id); return a ? a.label : id; };
const base = (p) => String(p || '').split('/').pop();

// the sentence for one event, given the state after it
export function sentence(ev, st) {
  switch (ev.type) {
    case 'run.started': return 'Zlecenie przyjęte: ' + (ev.text || '');
    case 'run.completed': return 'Rój kończy. ' + (ev.text || '');
    case 'run.failed': return 'Zlecenie upadło. ' + (ev.text || '');
    case 'queen.thought': return 'Królowa: ' + (ev.text || '');
    case 'plan.updated': return 'Plan: krok ' + ((ev.step || 0) + 1) + ' z ' + (ev.steps || []).length;
    case 'agent.spawned': return name(st, ev.agent) + ' dołącza do roju' + (ev.text ? ': ' + ev.text : '');
    case 'agent.finished': return name(st, ev.agent) + ' skończył pracę';
    case 'agent.failed': return name(st, ev.agent) + ' zawiódł' + (ev.text ? ': ' + ev.text : '');
    case 'message.sent': return name(st, ev.from) + ' → ' + name(st, ev.to) + ': ' + (ev.text || '');
    case 'tool.started': return name(st, ev.agent) + ' uruchamia ' + ev.tool + (ev.command ? ' (' + ev.command + ')' : '');
    case 'tool.finished': return name(st, ev.agent) + (ev.ok === false ? ' — narzędzie zawiodło' : ' — gotowe');
    case 'file.read': return name(st, ev.agent) + ' czyta ' + base(ev.path);
    case 'file.write': return name(st, ev.agent) + ' ' + ({ created: 'tworzy', modified: 'zmienia', deleted: 'usuwa' }[ev.action] || 'zmienia') + ' ' + base(ev.path);
    case 'scan': return name(st, ev.agent) + ' mapuje przestrzeń roboczą: ' + (ev.paths || []).length + ' plików';
    case 'test': return ev.status === 'passed' ? 'Test ' + ev.name + ' przechodzi' : 'Test ' + ev.name + ' pada: ' + (ev.output || '');
    case 'result': return name(st, ev.agent) + ' zwraca wynik';
    default: return ev.type;
  }
}

// the moments a reader wants to jump to: a failing or passing test, an approval or a critique, the start and the end
const KEY = (e) => {
  if (e.type === 'test') return e.status === 'failed' ? 'porażka' : 'zielony';
  if (e.type === 'message.sent' && (e.tone === 'approve' || e.tone === 'critique')) return e.tone === 'approve' ? 'zatwierdzenie' : 'uwaga';
  if (e.type === 'run.completed' || e.type === 'run.failed') return 'koniec';
  if (e.type === 'run.started') return 'start';
  return null;
};
export function keyMoments(events) {
  if (!events.length) return [];
  const t0 = events[0].ts; const out = [];
  for (const e of events) {
    const kind = KEY(e);
    if (kind) out.push({ t: (e.ts - t0) / 1000, kind, text: sentence(e, { agents: new Map(), order: [] }) });
  }
  return out;
}

// the caption at time t: the last sentence from the log up to t, with the moment kind (for its colour)
export function caption(events, t0, t, st) {
  let last = null;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if ((e.ts - t0) / 1000 <= t + 1e-9) { last = e; break; }
  }
  if (!last) return null;
  return { text: sentence(last, st), kind: KEY(last) || last.type, t: (last.ts - t0) / 1000 };
}

// the next or previous moment relative to t (eps keeps the one we are on out of the way)
export function stepMoment(moments, t, dir) {
  const eps = 0.25;
  if (dir > 0) return moments.find((m) => m.t > t + eps) || null;
  for (let i = moments.length - 1; i >= 0; i--) if (moments[i].t < t - eps) return moments[i];
  return null;
}

export { QUEEN };
