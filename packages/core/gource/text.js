// Text over the scene, as Gource draws it: directory, file and user names with a drop shadow, the date at the
// top centre (16 px), the file extension key on the left (gradient bars), plus our caption at the bottom.
export const FONT = "FreeSans, 'Liberation Sans', 'Helvetica Neue', Helvetica, sans-serif";

const DAYS = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];
const MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
const p2 = (n) => String(n).padStart(2, '0');
// Gource's "%A, %d %B, %Y %X" in Polish
export function formatDate(ms) {
  const d = new Date(ms);
  return DAYS[d.getDay()] + ', ' + p2(d.getDate()) + ' ' + MONTHS[d.getMonth()] + ', ' + d.getFullYear() + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds());
}

const rgb = (c, a) => 'rgba(' + Math.round(c[0] * 255) + ',' + Math.round(c[1] * 255) + ',' + Math.round(c[2] * 255) + ',' + a.toFixed(3) + ')';

export function drawText(ctx, F, W, H, dpr, o) {
  o = o || {};
  const fs = o.fontScale || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const shadowText = (text, x, y, a, col) => {
    ctx.fillStyle = 'rgba(0,0,0,' + (0.7 * a).toFixed(3) + ')';
    ctx.fillText(text, x + 1, y + 1);
    ctx.fillStyle = rgb(col || [1, 1, 1], a);
    ctx.fillText(text, x, y);
  };
  ctx.textBaseline = 'top';
  // names (directory names, then users, then files; selections on top)
  const order = { dir: 0, file: 1, tool: 2, 'tool-fail': 2, user: 3, 'file-sel': 4, 'user-sel': 4 };
  const labels = F.labels.slice().sort((a, b) => order[a.kind] - order[b.kind]);
  for (const l of labels) {
    const a = Math.max(0, Math.min(1, l.a));
    if (a < 0.01) continue;
    if (l.kind === 'dir') { ctx.font = 14 * fs + 'px ' + FONT; ctx.textAlign = 'left'; shadowText(l.text, l.x, l.y, a); }
    else if (l.kind === 'file' || l.kind === 'file-sel') {
      const sel = l.kind === 'file-sel';
      ctx.font = (sel ? 18 : 14) * fs + 'px ' + FONT; ctx.textAlign = 'left';
      shadowText(l.text, l.x, l.y - (sel ? 9 : 7) * fs, a, sel ? [1, 1, 0.3] : null);
    } else if (l.kind === 'user' || l.kind === 'user-sel') {
      const sel = l.kind === 'user-sel';
      ctx.font = (sel ? 18 : 14) * fs + 'px ' + FONT; ctx.textAlign = 'center';
      shadowText(l.text, l.x, l.y - (sel ? 20 : 16) * fs, a, sel ? [1, 1, 0.3] : null);
    } else {
      ctx.font = 12 * fs + 'px ' + FONT; ctx.textAlign = 'center';
      shadowText(l.text, l.x, l.y, a * 0.9, l.kind === 'tool-fail' ? [1, 0.45, 0.45] : [0.78, 0.86, 1]);
    }
  }
  ctx.textAlign = 'left';
  // date
  if (o.date) {
    ctx.font = 16 * fs + 'px ' + FONT;
    ctx.textAlign = 'center';
    shadowText(o.date, W / 2, (o.dateY != null ? o.dateY : 20) - 8 * fs, 1);
    ctx.textAlign = 'left';
  }
  // file extension key
  if (o.key !== false && F.key.length) {
    const rowH = 16 * fs + 6; const w = 90 * fs; const h = 16 * fs + 4;
    const x0 = (o.keyX != null ? o.keyX : 0) + 16 * fs + 4;
    let y = (o.keyY != null ? o.keyY : 0) + rowH;
    // Gource shows (height - 150) / 20 entries; inside panels we also stop at the free area's bottom
    const max = Math.max(1, Math.min(Math.floor((H - 150) / 20), Math.floor(((o.keyBottom != null ? o.keyBottom : H) - y) / rowH)));
    ctx.font = 16 * fs + 'px ' + FONT;
    for (const k of F.key.slice(0, max)) {
      ctx.fillStyle = 'rgba(0,0,0,0.333)';
      ctx.fillRect(x0 + 3, y + 3, w, h);
      const g = ctx.createLinearGradient(x0, 0, x0 + w, 0);
      g.addColorStop(0, rgb([k.col[0] * 0.5, k.col[1] * 0.5, k.col[2] * 0.5], 1));
      g.addColorStop(1, rgb(k.col, 1));
      ctx.fillStyle = g;
      ctx.fillRect(x0, y, w, h);
      let label = k.ext;
      while (label.length > 1 && ctx.measureText(label).width > w - 15 * fs) label = label.slice(0, -1);
      if (!k.ext) label = '';
      if (k.ext && label !== k.ext) label += '...';
      ctx.fillStyle = '#fff';
      ctx.fillText(label, x0 + 2, y + 3);
      shadowText(String(k.n), x0 + w + 4, y + 3, 1);
      y += rowH;
    }
  }
  // caption: what the latest event says (our addition, bottom centre like Gource's captions)
  if (o.caption) {
    ctx.font = 14 * fs + 'px ' + FONT;
    ctx.textAlign = 'center';
    let text = o.caption;
    const maxW = W - 40;
    while (ctx.measureText(text).width > maxW && text.length > 4) text = text.slice(0, -2);
    if (text !== o.caption) text = text.slice(0, -1) + '…';
    shadowText(text, W / 2, H - (o.captionBottom || 34), 0.95, o.captionColor || [1, 1, 1]);
    ctx.textAlign = 'left';
  }
}
