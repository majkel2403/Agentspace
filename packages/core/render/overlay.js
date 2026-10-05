// 2D overlay on top of the WebGL canvas: labels (with collision avoidance), date/time, legend, caption.
import { KINDS } from '../events.js';

const DAYS = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
const MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
const two = (n) => (n < 10 ? '0' : '') + n;
export function formatClock(ms) {
  const d = new Date(ms);
  return DAYS[d.getUTCDay()] + ', ' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear() + ' · ' + two(d.getUTCHours()) + ':' + two(d.getUTCMinutes()) + ':' + two(d.getUTCSeconds());
}

function pill(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

export function drawOverlay(ctx, W, H, dpr, F, o) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const MONO = "'IBM Plex Mono', ui-monospace, monospace";
  const SANS = "'Instrument Sans', 'Segoe UI', system-ui, sans-serif";
  // labels
  const placed = [];
  const L = F.labels.slice().sort((a, b) => b.prio - a.prio);
  ctx.textBaseline = 'middle';
  for (const l of L) {
    const big = l.prio >= 7;
    ctx.font = (big ? '600 13px ' : '500 12px ') + SANS;
    const tw = ctx.measureText(l.text).width;
    const h = big ? 20 : 17;
    const w = tw + (big ? 16 : 12);
    const tries = [[0, l.r + 6 + h / 2], [0, -l.r - 6 - h / 2], [l.r + 6 + w / 2, 0], [-l.r - 6 - w / 2, 0]];
    let box = null;
    for (const [ox, oy] of tries) {
      const b = { x: l.x + ox - w / 2, y: l.y + oy - h / 2, w, h };
      if (b.x < 4 || b.y < 4 || b.x + w > W - 4 || b.y + h > H - 4) continue;
      if (!placed.some((p) => b.x < p.x + p.w && p.x < b.x + b.w && b.y < p.y + p.h && p.y < b.y + b.h)) { box = b; break; }
    }
    if (!box) { if (l.prio < 7) continue; const b = { x: l.x - w / 2, y: l.y + l.r + 6, w, h }; box = b; }
    placed.push(box);
    ctx.globalAlpha = Math.max(0.35, Math.min(1, l.alpha));
    pill(ctx, box.x, box.y, box.w, box.h, h / 2);
    ctx.fillStyle = 'rgba(8,10,16,0.72)';
    ctx.fill();
    if (big) { ctx.strokeStyle = l.color; ctx.globalAlpha *= 0.55; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = Math.max(0.35, Math.min(1, l.alpha)); }
    ctx.fillStyle = l.kind === 'agent' ? '#FFB27A' : big ? '#F4F6FB' : '#D5DCEE';
    ctx.textAlign = 'center';
    ctx.fillText(l.text, box.x + box.w / 2, box.y + box.h / 2 + 0.5);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
  if (o.chrome === false) return;
  // date & time (top centre), legend (top left), title (bottom left), caption (bottom centre)
  ctx.font = '500 14px ' + SANS;
  ctx.fillStyle = '#E8ECF8';
  ctx.textAlign = 'center';
  if (o.clock) ctx.fillText(o.clock, W / 2, o.clockY || 22);
  ctx.textAlign = 'left';
  ctx.font = '500 12px ' + MONO;
  let y = o.legendY || 16;
  const lx = o.legendX || 14;
  const order = ['hermes', 'planner', 'agent', 'tool', 'file', 'resource', 'test', 'memory', 'gateway', 'result'];
  for (const k of order) {
    const n = F.counts[k];
    if (!n) continue;
    ctx.fillStyle = KINDS[k].color;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(lx, y - 6, 96, 12);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#0B0C10';
    ctx.fillText(KINDS[k].label.toUpperCase().slice(0, 13), lx + 3, y + 0.5);
    ctx.fillStyle = '#E8ECF8';
    ctx.fillText(String(n), lx + 102, y + 0.5);
    y += 16;
  }
  if (o.title) { ctx.font = '500 13px ' + SANS; ctx.fillStyle = '#C5CEE8'; ctx.fillText(o.title, 14, H - 14); }
  if (o.caption) {
    ctx.font = '500 13px ' + SANS;
    const tw = Math.min(W - 40, ctx.measureText(o.caption).width + 24);
    pill(ctx, W / 2 - tw / 2, H - 42, tw, 26, 13);
    ctx.fillStyle = 'rgba(8,10,16,0.7)'; ctx.fill();
    ctx.fillStyle = o.captionColor || '#E8ECF8';
    ctx.textAlign = 'center';
    let text = o.caption;
    while (ctx.measureText(text).width > tw - 24 && text.length > 4) text = text.slice(0, -2);
    if (text !== o.caption) text = text.slice(0, -1) + '…';
    ctx.fillText(text, W / 2, H - 28.5);
    ctx.textAlign = 'left';
  }
}
