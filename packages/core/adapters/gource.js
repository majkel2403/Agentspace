// Neural Workflow events -> Gource custom log (one line per change):
//   timestamp|username|type|file|colour      (type: A = added, M = modified, D = deleted; timestamp in seconds)
// Paths mirror the workflow: /<run>/hermes/<agent>/<tool>/<resource>, so `gource --log-format custom`
// (or `--realtime` with stdin) can be used as a quick prototype of the dynamics.
const COL = { agent: 'F2C14E', tool: '4FF0D8', file: '9FE3FF', resource: 'B7A6FF', test: '8CFFB4', memory: 'FF9FD8', gateway: 'FFAE5C', result: 'FFF1C2' };

const clean = (s) => String(s).replace(/[|\n\r]/g, ' ').replace(/^\/+/, '');

export function toGourceLines(events) {
  const seen = new Set();
  const out = [];
  const add = (ts, user, path, colour, kind) => {
    const t = Math.floor(ts / 1000);
    const type = kind || (seen.has(path) ? 'M' : 'A');
    seen.add(path);
    out.push(t + '|' + clean(user || 'hermes') + '|' + type + '|' + path + '|' + colour);
  };
  for (const ev of events) {
    const root = '/' + clean(ev.run) + '/hermes';
    const a = ev.agent ? root + '/' + clean(ev.agent) : root;
    const who = ev.agent || 'hermes';
    switch (ev.type) {
      case 'agent.spawned': add(ev.ts, who, a + '/.agent', COL.agent); break;
      case 'tool.started': case 'tool.completed': case 'tool.failed': add(ev.ts, who, a + '/' + clean(ev.tool) + '/.tool', COL.tool); break;
      case 'file.created': case 'file.modified': case 'file.read': case 'resource.read': case 'resource.written': {
        const base = (ev.tool ? a + '/' + clean(ev.tool) : a) + '/' + clean(ev.resource);
        if (ev.type.endsWith('read') && seen.has(base)) break;
        add(ev.ts, who, base, ev.type.startsWith('file') ? COL.file : COL.resource);
        break;
      }
      case 'file.deleted': {
        const base = (ev.tool ? a + '/' + clean(ev.tool) : a) + '/' + clean(ev.resource);
        if (seen.has(base)) add(ev.ts, who, base, COL.file, 'D');
        break;
      }
      case 'test.started': case 'test.passed': case 'test.failed': add(ev.ts, who, a + '/tests/' + clean(ev.name), COL.test); break;
      case 'memory.read': case 'memory.write': add(ev.ts, who, root + '/memory/' + clean(ev.resource || 'context'), COL.memory); break;
      case 'gateway.call': add(ev.ts, who, root + '/gateways/' + clean(ev.name), COL.gateway); break;
      case 'task.completed': case 'task.failed': add(ev.ts, 'hermes', root + '/result', COL.result); break;
      default: break;
    }
  }
  return out;
}
