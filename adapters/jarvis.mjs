// Jarvis OS -> Neural Workflow. Jarvis's bridge carries the work of Hermes that happens outside the Jarvis card
// (Telegram, cron, console) as agent events (hermes/plugins/jarvis-events, POST /bridge/agent-event, SSE `event: agent`).
// This turns each of them into a workflow event of one run per task, so the same command deck shows the real work.
//   jarvisToEvent(raw)            -> workflow event | null   (unknown or malformed events are dropped)
//   sseMessages(buffer)           -> { messages: [{ event, data }], rest }   incremental parser for the bridge stream

const TERMINAL = /terminal|shell|bash|cmd|powershell/i;

export function jarvisToEvent(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.task_id !== 'string' || !raw.task_id) return null;
  const run = 'jarvis-' + raw.task_id;
  const ts = typeof raw.ts === 'number' && Number.isFinite(raw.ts) ? raw.ts * 1000 : Date.now();
  const tool = typeof raw.tool === 'string' && raw.tool ? raw.tool : 'narzędzie';
  const label = typeof raw.label === 'string' ? raw.label : '';
  const base = { ts, run };
  switch (raw.type) {
    case 'task.created':
      return { ...base, type: 'task.started', text: typeof raw.title === 'string' && raw.title ? raw.title : 'Zadanie', user: typeof raw.platform === 'string' && raw.platform ? raw.platform : 'Jarvis' };
    case 'tool.started': {
      const ev = { ...base, type: 'tool.started', agent: 'hermes', tool, text: label };
      if (TERMINAL.test(tool) && label) ev.command = label;
      return ev;
    }
    case 'tool.completed':
      return { ...base, type: 'tool.completed', agent: 'hermes', tool, text: typeof raw.ms === 'number' ? raw.ms + ' ms' : '' };
    case 'tool.failed':
      return { ...base, type: 'tool.failed', agent: 'hermes', tool, text: typeof raw.error === 'string' ? raw.error : 'błąd narzędzia' };
    case 'task.completed':
      return { ...base, type: 'task.completed', text: typeof raw.result === 'string' && raw.result ? raw.result : 'Zadanie wykonane' };
    case 'task.failed':
      return { ...base, type: 'task.failed', text: typeof raw.error === 'string' && raw.error ? raw.error : 'Zadanie przerwane' };
    default:
      return null;
  }
}

// the bridge stream is `event: <name>` + `data: <json>` blocks separated by a blank line
export function sseMessages(buffer) {
  const messages = [];
  let rest = String(buffer);
  let cut;
  while ((cut = rest.indexOf('\n\n')) >= 0) {
    const block = rest.slice(0, cut);
    rest = rest.slice(cut + 2);
    let event = 'message'; const data = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    if (data.length) messages.push({ event, data: data.join('\n') });
  }
  return { messages, rest };
}
