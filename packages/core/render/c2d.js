// Canvas 2D fallback backend for the same primitives (used when WebGL is unavailable).
import { SHAPE } from './prims.js';

const SPR = {};
function spriteFor(shape) {
  if (SPR[shape] !== undefined) return SPR[shape];
  let c = null;
  try {
    if (typeof OffscreenCanvas === 'function') {
      c = new OffscreenCanvas(64, 64);
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      if (shape === SHAPE.DOT || shape === SHAPE.CORE) { gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.36, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); }
      else { gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); }
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    }
  } catch (e) { c = null; }
  SPR[shape] = c;
  return c;
}

export function createC2D(canvas) {
  const ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) return null;
  const css = (r, g, b, a) => 'rgba(' + ((r * 255) | 0) + ',' + ((g * 255) | 0) + ',' + ((b * 255) | 0) + ',' + a.toFixed(3) + ')';
  return {
    kind: 'canvas2d',
    draw(P, W, H, dpr, bg) {
      const cw = Math.round(W * dpr);
      const ch = Math.round(H * dpr);
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = css(bg[0], bg[1], bg[2], 1);
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      const L = P.lines();
      for (let i = 0; i < P.nl; i++) {
        const k = i * 13;
        ctx.strokeStyle = css(L[k + 5], L[k + 6], L[k + 7], (L[k + 8] + L[k + 12]) * 0.5);
        ctx.lineWidth = L[k + 4];
        ctx.beginPath(); ctx.moveTo(L[k], L[k + 1]); ctx.lineTo(L[k + 2], L[k + 3]); ctx.stroke();
      }
      const S = P.sprites();
      for (let i = 0; i < P.ns; i++) {
        const k = i * 8;
        const x = S[k]; const y = S[k + 1]; const r = S[k + 2]; const a = S[k + 6]; const s = S[k + 7];
        if (s === SHAPE.RING) { ctx.strokeStyle = css(S[k + 3], S[k + 4], S[k + 5], a); ctx.lineWidth = Math.max(1, r * 0.08); ctx.beginPath(); ctx.arc(x, y, r * 0.86, 0, 6.2832); ctx.stroke(); continue; }
        const sp = spriteFor(s === SHAPE.DOT || s === SHAPE.CORE ? SHAPE.DOT : SHAPE.GLOW);
        if (sp) {
          // tint: draw the white sprite and a coloured copy (cheap approximation)
          ctx.globalAlpha = a;
          ctx.fillStyle = css(S[k + 3], S[k + 4], S[k + 5], 1);
          ctx.beginPath(); ctx.arc(x, y, r * (s === SHAPE.GLOW ? 0.55 : 0.4), 0, 6.2832); ctx.globalAlpha = a * (s === SHAPE.GLOW ? 0.18 : 0.8); ctx.fill();
          ctx.globalAlpha = a * (s === SHAPE.GLOW ? 0.25 : 0.6);
          ctx.drawImage(sp, x - r, y - r, r * 2, r * 2);
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = css(S[k + 3], S[k + 4], S[k + 5], a * 0.6);
          ctx.beginPath(); ctx.arc(x, y, Math.max(0.5, r * 0.45), 0, 6.2832); ctx.fill();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}
