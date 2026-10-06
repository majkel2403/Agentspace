// Drawing the studio layer (story.js) over the scene: the team board with the plan, editor and terminal windows
// tied to the file or agent they belong to, speech / thought bubbles, messages travelling between agents and the
// moment an agent creates another one. Canvas 2D, screen space; positions come from the frame (F.users, F.files).
import { STORY } from './story.js';
import { TONE_COLOUR } from './actions.js';

const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace";
const SANS = "'Instrument Sans', FreeSans, 'Helvetica Neue', Arial, sans-serif";
const C = {
  glass: 'rgba(11,13,22,0.88)', line: 'rgba(140,160,220,0.22)', text: '#E8ECF8', mut: '#97A3C7', dim: '#6E7AA0',
  gold: '#F2C14E', ok: '#8CFFB4', bad: '#FF7A88', wait: '#FFC979',
  add: 'rgba(80,220,140,0.13)', del: 'rgba(255,90,110,0.14)',
  kw: '#C9A2FF', str: '#B8E986', com: '#6F7AA0', num: '#FFAD7A', fn: '#7FD3FF', code: '#D9E1F2',
};
const crgb = (c, a) => 'rgba(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ',' + (a == null ? 1 : Math.max(0, Math.min(1, a))).toFixed(3) + ')';
const ease = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const KW = new Set('const let var function return if else for while do switch case break continue new this class extends import export from default async await try catch finally throw typeof instanceof in of null undefined true false private public protected readonly static interface type void describe it expect before after beforeEach afterEach'.split(' '));

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
function panel(ctx, x, y, w, h, a, border) {
  ctx.globalAlpha = a;
  rrect(ctx, x, y, w, h, 9);
  ctx.fillStyle = C.glass; ctx.fill();
  ctx.strokeStyle = border || C.line; ctx.lineWidth = 1; ctx.stroke();
  ctx.globalAlpha = 1;
}
function wrap(ctx, text, maxW, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const out = []; let cur = '';
  for (const w of words) {
    const tryS = cur ? cur + ' ' + w : w;
    if (ctx.measureText(tryS).width <= maxW || !cur) cur = tryS;
    else { out.push(cur); cur = w; if (out.length === maxLines) break; }
  }
  if (out.length < maxLines && cur) out.push(cur);
  else if (cur && out.length === maxLines) {
    let last = out[maxLines - 1];
    while (last.length > 1 && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
    out[maxLines - 1] = last + '…';
  }
  return out;
}
function fit(ctx, s, maxW) {
  s = String(s);
  if (ctx.measureText(s).width <= maxW) return s;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}
// tiny highlighter for code lines (JS/TS-like; markdown headings)
function tokens(s, md) {
  if (md) return [[s, /^#/.test(s) ? C.gold : /^[-*] /.test(s) ? C.code : C.code]];
  const out = [];
  const re = /(\/\/.*$)|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`(?:[^`\\]|\\.)*`?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)(?=\s*\()|([A-Za-z_$][\w$]*)/g;
  let last = 0; let m;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push([s.slice(last, m.index), C.code]);
    const col = m[1] ? C.com : m[2] ? C.str : m[3] ? C.num : m[4] ? (KW.has(m[4]) ? C.kw : C.fn) : KW.has(m[5]) ? C.kw : C.code;
    out.push([m[0], col]);
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push([s.slice(last), C.code]);
  return out;
}

export function drawStory(ctx, S, F, W, H, o) {
  o = o || {};
  const compact = !!o.compact;
  const fs = o.fontScale || 1;
  const ins = o.inset || { l: 0, r: 0, t: 0, b: 0 };
  const t = o.t || 0;
  const users = new Map(); for (const u of F.users) users.set(u.id, u);
  const files = new Map(); for (const f of F.files) files.set(f.path, f);
  const head = (id) => { const u = users.get(id); return u ? { x: u.x, y: u.y - u.h * 0.5, u } : null; };
  ctx.save();
  ctx.textBaseline = 'alphabetic';

  // ---- an agent creating another: a golden thread from creator to the new agent, a ring, and its role
  for (const sp of S.spawns) {
    const a = head(sp.parent); const b = head(sp.child);
    if (!a || !b) continue;
    const p = ease(sp.age / 0.9); const fade = 1 - ease((sp.age - STORY.SPAWN + 0.6) / 0.6);
    ctx.globalAlpha = fade;
    const mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.25; const my = (a.y + b.y) / 2 - (b.x - a.x) * 0.25;
    ctx.strokeStyle = C.gold; ctx.lineWidth = 2; ctx.setLineDash([]);
    ctx.beginPath();
    for (let k = 0; k <= 24; k++) {
      const s = (k / 24) * p; const q = 1 - s;
      const x = q * q * a.x + 2 * q * s * mx + s * s * b.x; const y = q * q * a.y + 2 * q * s * my + s * s * b.y;
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    if (sp.age > 0.6) {
      const r = 10 + (sp.age - 0.6) * 26;
      ctx.globalAlpha = fade * Math.max(0, 1 - (sp.age - 0.6) / 1.6);
      ctx.beginPath(); ctx.arc(b.x, b.u.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = fade;
      ctx.font = '600 ' + 11 * fs + 'px ' + MONO; ctx.fillStyle = C.gold; ctx.textAlign = 'center';
      ctx.fillText('NOWY AGENT', b.x, b.u.y + b.u.h * 0.5 + 16 * fs);
      ctx.font = 12 * fs + 'px ' + SANS; ctx.fillStyle = C.text;
      if (sp.role && !compact) ctx.fillText(fit(ctx, sp.role, 220), b.x, b.u.y + b.u.h * 0.5 + 31 * fs);
    }
  }
  ctx.globalAlpha = 1; ctx.textAlign = 'left';

  // ---- messages in flight
  for (const m of S.packets) {
    const a = head(m.from); const b = head(m.to);
    if (!a || !b) continue;
    const col = TONE_COLOUR[m.tone] || [0.9, 0.92, 1];
    const p = ease(m.age / STORY.PACKET);
    const mx = (a.x + b.x) / 2 - (b.y - a.y) * 0.18; const my = (a.y + b.y) / 2 + (b.x - a.x) * 0.18 - 18;
    const at = (s) => { const q = 1 - s; return [q * q * a.x + 2 * q * s * mx + s * s * b.x, q * q * a.y + 2 * q * s * my + s * s * b.y]; };
    ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]);
    ctx.strokeStyle = crgb(col, 0.35);
    ctx.beginPath(); for (let k = 0; k <= 20; k++) { const [x, y] = at(k / 20); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.stroke();
    ctx.setLineDash([]);
    const [x, y] = at(p);
    ctx.fillStyle = crgb(col, 1);
    ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = crgb(col, 0.25);
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
    if (m.task) {
      ctx.font = '600 ' + 10.5 * fs + 'px ' + MONO;
      const label = 'ZADANIE'; const w = ctx.measureText(label).width + 10;
      ctx.fillStyle = C.gold; rrect(ctx, x + 8, y - 20, w, 16, 4); ctx.fill();
      ctx.fillStyle = '#1A1300'; ctx.fillText(label, x + 13, y - 8);
    }
  }

  // ---- new folders
  for (const g of S.tags) {
    const f = files.get(g.path);
    if (!f) continue;
    ctx.globalAlpha = 1 - ease((g.age - STORY.TAG + 0.7) / 0.7);
    ctx.font = '600 ' + 11 * fs + 'px ' + MONO;
    const w = ctx.measureText(g.text).width + 12;
    ctx.fillStyle = 'rgba(80,220,140,0.9)'; rrect(ctx, f.x + 10, f.y + 8, w, 18, 5); ctx.fill();
    ctx.fillStyle = '#062012'; ctx.fillText(g.text, f.x + 16, f.y + 21);
    ctx.globalAlpha = 1;
  }

  // ---- studio column (team board + windows) or compact strip
  const col = o.studio || null;
  let wy = null;
  if (col && S.agents.length) wy = board(ctx, S, col, fs, compact, t);
  if (col) windows(ctx, S, col, wy, users, files, fs, compact, t);

  // ---- bubbles last, above everything in the scene
  bubbles(ctx, S, users, ins, W, H, fs, compact);
  ctx.restore();
}

function statusOf(a) {
  if (a.status === 'done') return ['✓ gotowe', C.ok];
  if (a.status === 'fail') return ['✗ błąd', C.bad];
  if (a.status === 'wait') return ['czeka', C.wait];
  if (a.status === 'work') return ['● ' + (a.tool || 'pracuje'), C.ok];
  return [a.id === 'hermes' ? 'koordynuje' : 'wolny', C.dim];
}

// team board: who created whom, roles, current task and status; then the plan. Returns the y below it.
function board(ctx, S, col, fs, compact, t) {
  if (compact) return chips(ctx, S, col, fs);
  const x = col.x; const w = col.w; let y = col.y;
  const rowH = compact ? 22 * fs : 40 * fs;
  const planH = S.plan && !compact ? 26 * fs + S.plan.steps.length * 18 * fs : 0;
  const briefLines = S.brief && !compact ? 2 : 0;
  const h = 30 * fs + briefLines * 16 * fs + S.agents.length * rowH + planH + 8;
  panel(ctx, x, y, w, h, 1);
  ctx.font = '600 ' + 11 * fs + 'px ' + MONO; ctx.fillStyle = C.mut;
  ctx.fillText('ZESPÓŁ HERMESA', x + 12, y + 19 * fs);
  ctx.textAlign = 'right'; ctx.fillText(String(S.agents.length - 1) + (S.agents.length - 1 === 1 ? ' AGENT' : ' AGENTÓW'), x + w - 12, y + 19 * fs); ctx.textAlign = 'left';
  y += 28 * fs;
  if (briefLines) {
    ctx.font = 12.5 * fs + 'px ' + SANS; ctx.fillStyle = C.text;
    const ls = wrap(ctx, 'Zlecenie: ' + S.brief.text, w - 24, 2);
    ls.forEach((l, i) => ctx.fillText(l, x + 12, y + 11 * fs + i * 16 * fs));
    y += briefLines * 16 * fs + 2;
  }
  S.agents.forEach((a, i) => {
    const fresh = a.id !== 'hermes' && a.age < STORY.SPAWN;
    const k = fresh ? ease(a.age / 0.5) : 1;
    const ry = y + i * rowH;
    const ix = x + 12 + a.depth * 16 * fs - (1 - k) * 18;
    ctx.globalAlpha = k;
    if (fresh) { ctx.fillStyle = 'rgba(242,193,78,' + (0.16 * (1 - a.age / STORY.SPAWN)).toFixed(3) + ')'; ctx.fillRect(x + 1, ry, w - 2, rowH); ctx.fillStyle = C.gold; ctx.fillRect(x + 1, ry, 3, rowH); }
    if (a.depth > 0) {
      ctx.strokeStyle = C.line; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ix - 9 * fs, ry - 4); ctx.lineTo(ix - 9 * fs, ry + rowH * 0.42); ctx.lineTo(ix - 2, ry + rowH * 0.42); ctx.stroke();
    }
    const c = a.col || [1, 1, 1];
    ctx.fillStyle = crgb(c); ctx.beginPath(); ctx.arc(ix + 5, ry + (compact ? rowH / 2 : 14 * fs), 5 * fs, 0, Math.PI * 2); ctx.fill();
    ctx.font = '600 ' + 13 * fs + 'px ' + SANS; ctx.fillStyle = C.text;
    const nameY = ry + (compact ? rowH / 2 + 4 * fs : 18 * fs);
    ctx.fillText(a.label, ix + 15, nameY);
    const [st, sc] = statusOf(a);
    ctx.font = 11.5 * fs + 'px ' + MONO; ctx.fillStyle = sc; ctx.textAlign = 'right';
    ctx.fillText(fit(ctx, st, 120), x + w - 12, nameY); ctx.textAlign = 'left';
    if (!compact) {
      ctx.font = 12 * fs + 'px ' + SANS;
      const task = a.task && t - a.taskT >= 0 ? '→ ' + a.task : a.role;
      ctx.fillStyle = a.task ? '#CDD5EE' : C.dim;
      ctx.fillText(fit(ctx, task || '', w - (ix - x) - 28), ix + 15, ry + 34 * fs);
    }
    ctx.globalAlpha = 1;
  });
  y += S.agents.length * rowH;
  if (planH) {
    ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(x + 12, y + 4); ctx.lineTo(x + w - 12, y + 4); ctx.stroke();
    ctx.font = '600 ' + 11 * fs + 'px ' + MONO; ctx.fillStyle = C.mut;
    ctx.fillText('PLAN', x + 12, y + 20 * fs);
    y += 26 * fs;
    S.plan.steps.forEach((s, i) => {
      const done = i < S.plan.cur; const cur = i === S.plan.cur;
      ctx.font = (cur ? '600 ' : '') + 12.5 * fs + 'px ' + SANS;
      ctx.fillStyle = done ? C.ok : cur ? C.gold : C.dim;
      ctx.fillText(done ? '✓' : cur ? '▸' : '○', x + 14, y + 12 * fs + i * 18 * fs);
      ctx.fillStyle = done ? C.mut : cur ? C.text : C.dim;
      ctx.fillText(fit(ctx, s, w - 50), x + 32, y + 12 * fs + i * 18 * fs);
    });
  }
  return col.y + h + 10;
}

// phone: the team as a wrapped row of chips (colour, name, status) under the header
function chips(ctx, S, col, fs) {
  let x = col.x; let y = col.y; const rowH = 22 * fs;
  ctx.font = '600 ' + 12 * fs + 'px ' + SANS;
  for (const a of S.agents) {
    const [st, sc] = statusOf(a);
    const sym = a.status === 'work' ? '●' : st.split(' ')[0];
    const label = (a.depth > 1 ? '↳' : '') + a.label;
    const w = ctx.measureText(label).width + 34 * fs;
    if (x + w > col.x + col.w) { x = col.x; y += rowH + 4; }
    const fresh = a.id !== 'hermes' && a.age < STORY.SPAWN;
    panel(ctx, x, y, w, rowH, ease(a.age / 0.4), fresh ? C.gold : null);
    ctx.fillStyle = crgb(a.col || [1, 1, 1]); ctx.beginPath(); ctx.arc(x + 9 * fs, y + rowH / 2, 4 * fs, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.text; ctx.fillText(label, x + 17 * fs, y + rowH / 2 + 4 * fs);
    ctx.fillStyle = sc; ctx.fillText(sym === 'wolny' || sym === 'koordynuje' ? '' : sym, x + w - 12 * fs, y + rowH / 2 + 4 * fs);
    x += w + 5;
  }
  return y + rowH + 8;
}

// editor and terminal windows, newest at the bottom, each tied by a line to its file or agent
function windows(ctx, S, col, y0, users, files, fs, compact, t) {
  if (!S.windows.length) return;
  const x = col.x; const w = col.w;
  const lh = 16 * fs;
  const space = col.bottom - (y0 == null ? col.y : y0);
  const maxLines = compact ? 5 : Math.max(4, Math.min(11, Math.floor((space / S.windows.length - 44 * fs) / lh)));
  let y = y0 == null ? col.y : y0;
  if (compact) y = col.bottom - S.windows.slice(-1).length * (36 * fs + maxLines * lh) - 6;
  const list = compact ? S.windows.slice(-1) : S.windows;
  for (const win of list) {
    const h = 34 * fs + maxLines * lh + 8;
    const a = win.a;
    const u = users.get(win.who);
    const agentCol = u ? u.ucol : [0.9, 0.9, 1];
    // tie the window to what it works on
    const f = win.kind === 'code' ? files.get(win.path) : null;
    const anchor = f ? [f.x, f.y] : u ? [u.x, u.y] : null;
    if (anchor) {
      ctx.globalAlpha = a * 0.8; ctx.strokeStyle = crgb(agentCol, 0.7); ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      const sx = anchor[0] < x ? x : x + w; const sy = y + 16 * fs;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.bezierCurveTo(sx - 60, sy, anchor[0] + 40, anchor[1], anchor[0], anchor[1]); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(anchor[0], anchor[1], f ? 7 + Math.sin(t * 6) * (win.typing ? 2 : 0) : 4, 0, Math.PI * 2); ctx.stroke();
    }
    panel(ctx, x, y, w, h, a, crgb(agentCol, 0.45));
    ctx.globalAlpha = a;
    // title bar
    ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(x + 1, y + 1, w - 2, 26 * fs);
    ctx.fillStyle = crgb(agentCol); ctx.beginPath(); ctx.arc(x + 14, y + 14 * fs, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.font = '600 ' + 12 * fs + 'px ' + MONO; ctx.fillStyle = C.text;
    const who = u ? u.label : win.who;
    if (win.kind === 'code') {
      const right = (win.created ? 'nowy · ' : '') + '+' + win.add + (win.del ? ' −' + win.del : '');
      ctx.font = 11.5 * fs + 'px ' + MONO; const rw = ctx.measureText(right).width;
      ctx.fillStyle = C.ok; ctx.textAlign = 'right'; ctx.fillText(right, x + w - 10, y + 18 * fs); ctx.textAlign = 'left';
      ctx.font = '600 ' + 12 * fs + 'px ' + MONO; ctx.fillStyle = C.text;
      ctx.fillText(fit(ctx, who + ' · ' + win.file, w - rw - 44), x + 25, y + 18 * fs);
      ctx.font = 10.5 * fs + 'px ' + MONO; ctx.fillStyle = C.dim;
      ctx.fillText(fit(ctx, win.full, w - 24), x + 12, y + 38 * fs);
      code(ctx, win, x, y + 44 * fs, w, maxLines - 1, lh, fs, t);
    } else {
      ctx.fillText(fit(ctx, 'terminal · ' + who, w - 120), x + 25, y + 18 * fs);
      ctx.font = 11.5 * fs + 'px ' + MONO; ctx.textAlign = 'right';
      const state = win.end == null ? 'działa ' + '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'[Math.floor(win.age * 10) % 10] : win.fail ? '✗ błąd' : '✓ ok';
      ctx.fillStyle = win.end == null ? C.wait : win.fail ? C.bad : C.ok;
      ctx.fillText(state, x + w - 10, y + 18 * fs); ctx.textAlign = 'left';
      term(ctx, win, x, y + 34 * fs, w, maxLines, lh, fs, t);
    }
    ctx.globalAlpha = 1;
    y += h + 10;
  }
}

function code(ctx, win, x, y, w, maxLines, lh, fs, t) {
  const md = /\.(md|txt)$/i.test(win.file);
  // where the cursor is: added lines are revealed in order as their characters are typed
  let left = win.typed; let cursor = -1; let cursorCol = 0;
  const vis = win.lines.map((l, i) => {
    if (l.t !== '+') return l.s;
    if (left >= l.s.length + 1) { left -= l.s.length + 1; return l.s; }
    if (cursor < 0) { cursor = i; cursorCol = Math.max(0, left); const s = l.s.slice(0, cursorCol); left = -1; return s; }
    return null;
  });
  if (cursor < 0 && win.typing) cursor = win.lines.length - 1;
  const last = cursor >= 0 ? cursor : win.lines.length - 1;
  const start = Math.max(0, Math.min(last - maxLines + 2, win.lines.length - maxLines));
  ctx.font = 12 * fs + 'px ' + MONO;
  const cw = ctx.measureText('m').width;
  const gx = x + 8; const tx = x + 44 * fs;
  for (let r = 0; r < maxLines; r++) {
    const i = start + r;
    const l = win.lines[i];
    if (!l) break;
    const s = vis[i];
    if (s == null) continue;
    const ly = y + r * lh;
    if (l.t !== ' ') { ctx.fillStyle = l.t === '+' ? C.add : C.del; ctx.fillRect(x + 1, ly, w - 2, lh); }
    ctx.fillStyle = C.dim; ctx.textAlign = 'right';
    ctx.fillText(l.n != null ? String(l.n) : '', gx + 26 * fs, ly + 12 * fs); ctx.textAlign = 'left';
    ctx.fillStyle = l.t === '+' ? C.ok : l.t === '-' ? C.bad : C.dim;
    ctx.fillText(l.t === ' ' ? ' ' : l.t === '-' ? '−' : '+', gx + 30 * fs, ly + 12 * fs);
    let px = tx;
    const maxX = x + w - 10;
    for (const [txt, c] of tokens(s, md)) {
      if (px > maxX) break;
      ctx.fillStyle = l.t === '-' ? C.bad : c;
      const fitTxt = px + txt.length * cw > maxX ? txt.slice(0, Math.max(0, Math.floor((maxX - px) / cw))) : txt;
      ctx.fillText(fitTxt, px, ly + 12 * fs);
      px += fitTxt.length * cw;
    }
    if (l.t === '-') { ctx.strokeStyle = 'rgba(255,122,136,0.7)'; ctx.beginPath(); ctx.moveTo(tx, ly + 8 * fs); ctx.lineTo(Math.min(px, maxX), ly + 8 * fs); ctx.stroke(); }
    if (i === cursor && win.typing && Math.floor(t * 2.5) % 2 === 0) { ctx.fillStyle = C.gold; ctx.fillRect(Math.min(tx + cursorCol * cw, maxX), ly + 2, 2, lh - 3); }
  }
}

function term(ctx, win, x, y, w, maxLines, lh, fs, t) {
  ctx.font = 12 * fs + 'px ' + MONO;
  const rows = [{ s: '$ ' + win.command.slice(0, win.typed), c: C.text, cmd: true }];
  if (!win.typing) for (const l of win.lines) rows.push({ s: l.s, c: l.bad ? C.bad : /✓|passing|ok\b|zalicz/i.test(l.s) ? C.ok : /failing|✗|error|×/i.test(l.s) ? C.bad : '#C9D1E8' });
  const start = Math.max(0, rows.length - maxLines);
  for (let r = 0; r < maxLines && start + r < rows.length; r++) {
    const row = rows[start + r];
    ctx.fillStyle = row.c;
    const s = fit(ctx, row.s, w - 22);
    ctx.fillText(s, x + 10, y + r * lh + 13 * fs);
    if (row.cmd && win.typing && Math.floor(t * 2.5) % 2 === 0) { ctx.fillStyle = C.gold; ctx.fillRect(x + 10 + ctx.measureText(s).width + 1, y + r * lh + 3, 7 * fs, lh - 4); }
  }
}

// speech (solid) and thought (dashed) bubbles above avatars; text appears as it is "said"
function bubbles(ctx, S, users, ins, W, H, fs, compact) {
  const placed = [];
  const maxW = (compact ? 170 : 240) * fs;
  const L = ins.l + 8; const R = W - ins.r - 8; const Tp = ins.t + 8;
  const list = S.bubbles.slice().sort((a, b) => a.age - b.age).slice(0, compact ? 2 : 4);
  for (const b of list) {
    const u = users.get(b.who);
    if (!u) continue;
    ctx.font = (b.kind === 'think' ? 'italic ' : '') + 12.5 * fs + 'px ' + SANS;
    const lines = wrap(ctx, b.text.slice(0, b.shown) || ' ', maxW - 20, compact ? 3 : 4);
    const to = b.kind === 'say' && b.to && users.get(b.to) ? users.get(b.to).label : b.to === 'user' ? 'Użytkownik' : '';
    const headTxt = b.kind === 'think' ? 'myśli' : b.tone === 'assign' ? 'zleca → ' + to : to ? '→ ' + to : '';
    const tw = Math.max(...lines.map((l) => ctx.measureText(l).width), 60);
    const w = Math.min(maxW, tw + 20); const h = 14 * fs + lines.length * 16 * fs + (headTxt ? 14 * fs : 0);
    let x = Math.max(L, Math.min(R - w, u.x - w / 2));
    let y = u.y - u.h * 0.5 - 30 * fs - h;
    for (const p of placed) if (x < p.x + p.w && x + w > p.x && y < p.y + p.h + 6 && y + h > p.y) y = p.y - h - 8;
    y = Math.max(Tp, y);
    placed.push({ x, y, w, h });
    const c = u.ucol || [1, 1, 1];
    ctx.globalAlpha = b.a;
    rrect(ctx, x, y, w, h, 8);
    ctx.fillStyle = b.kind === 'think' ? 'rgba(14,16,28,0.82)' : 'rgba(16,20,34,0.94)'; ctx.fill();
    ctx.strokeStyle = b.tone === 'assign' ? C.gold : crgb(c, 0.8); ctx.lineWidth = 1.2;
    if (b.kind === 'think') ctx.setLineDash([3, 3]);
    ctx.stroke(); ctx.setLineDash([]);
    // tail
    const tx = Math.max(x + 10, Math.min(x + w - 10, u.x));
    ctx.fillStyle = b.kind === 'think' ? 'rgba(14,16,28,0.82)' : 'rgba(16,20,34,0.94)';
    ctx.beginPath(); ctx.moveTo(tx - 6, y + h - 1); ctx.lineTo(tx, y + h + 8); ctx.lineTo(tx + 6, y + h - 1); ctx.fill();
    let ty = y + 15 * fs;
    if (headTxt) { ctx.font = '600 ' + 10.5 * fs + 'px ' + MONO; ctx.fillStyle = b.tone === 'assign' ? C.gold : C.mut; ctx.fillText(fit(ctx, headTxt.toUpperCase(), w - 20), x + 10, ty - 2); ty += 14 * fs; }
    ctx.font = (b.kind === 'think' ? 'italic ' : '') + 12.5 * fs + 'px ' + SANS;
    ctx.fillStyle = b.kind === 'think' ? '#B9C2DE' : C.text;
    lines.forEach((l, i) => ctx.fillText(l, x + 10, ty + i * 16 * fs));
    ctx.globalAlpha = 1;
  }
}
