// The game on a canvas: the comb, the bugs, the robots flying in arcs, and the menus. The game logic is in game.js;
// this file only draws it and turns clicks into moves. When a game ends, its log is saved as a run, and the deck can
// replay it (obserwuj.html?run=…).
import { createGame, LEVELS, COST } from './game.js';
import { createSound } from './sound.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#board'); const ctx = canvas.getContext('2d');
const sound = createSound();
const SQ3 = Math.sqrt(3); const R = 4;
let files = []; let game = null; let saved = false; let runId = null;
let S = 40; let ox = 0; let oy = 0; let W = 0; let H = 0;
let hover = null; let toastText = ''; let toastT = 0; let seenEvents = 0; let seenFixed = 0;
const particles = [];
const pos = (q, r) => ({ x: ox + S * SQ3 * (q + r / 2), y: oy + S * 1.5 * r });
const dpr = () => Math.min(window.devicePixelRatio || 1, 2);

function resize() {
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * dpr()); canvas.height = Math.round(H * dpr());
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(dpr(), 0, 0, dpr(), 0, 0);
  // the hexagon of cells fits the window, with room for the hud and the menus
  S = Math.min((W * 0.92) / (SQ3 * (2 * R + 1)), (H * 0.78) / (1.5 * 2 * R + 2));
  ox = W / 2; oy = H / 2 + 6;
}
window.addEventListener('resize', resize);

// the cell under a pixel (pointy-top axial coordinates, rounded through cube coordinates)
function keyAt(px, py) {
  const dx = px - ox; const dy = py - oy;
  const q = (SQ3 / 3 * dx - dy / 3) / S; const r = (2 / 3 * dy) / S;
  let x = q; let z = r; let y = -x - z;
  let rx = Math.round(x); let ry = Math.round(y); let rz = Math.round(z);
  const ex = Math.abs(rx - x); const ey = Math.abs(ry - y); const ez = Math.abs(rz - z);
  if (ex > ey && ex > ez) rx = -ry - rz; else if (ey > ez) ry = -rx - rz; else rz = -rx - ry;
  return rx + ',' + rz;
}

function hexPath(x, y, s) {
  ctx.beginPath();
  for (let k = 0; k < 6; k++) { const a = (Math.PI / 180) * (60 * k - 30); const px = x + s * Math.cos(a); const py = y + s * Math.sin(a); k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
  ctx.closePath();
}

function bee(x, y, s, flap, col = '#ffb020') {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  const w = Math.abs(Math.sin(flap)) * 0.6 + 0.25;
  ctx.beginPath(); ctx.ellipse(-s * 0.2, -s * 0.55, s * 0.5, s * 0.22 * w, -0.4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(s * 0.2, -s * 0.55, s * 0.5, s * 0.22 * w, 0.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.ellipse(0, 0, s * 0.62, s * 0.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = '#2a1600';
  ctx.fillRect(-s * 0.28, -s * 0.5, s * 0.12, s); ctx.fillRect(s * 0.1, -s * 0.5, s * 0.12, s);
  ctx.restore();
}

function render(now) {
  ctx.fillStyle = '#120b04'; ctx.fillRect(0, 0, W, H);
  const g0 = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, Math.max(W, H) * 0.7);
  g0.addColorStop(0, 'rgba(255,176,32,0.10)'); g0.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g0; ctx.fillRect(0, 0, W, H);
  if (!game) return;
  const s = S * 0.93;
  const pulse = 0.6 + 0.4 * Math.sin(now / 180);
  for (const c of game.cells) {
    const p = pos(c.q, c.r);
    const bug = game.bugs.has(c.key); const fixed = game.fixed.has(c.key);
    hexPath(p.x, p.y, s);
    if (bug) {
      ctx.fillStyle = 'rgba(255,90,60,' + (0.45 + 0.35 * pulse).toFixed(3) + ')';
      ctx.shadowColor = '#ff5a3c'; ctx.shadowBlur = 16 * pulse;
    } else if (fixed) { ctx.fillStyle = '#c98a1a'; ctx.shadowColor = '#ffb020'; ctx.shadowBlur = 8; }
    else { ctx.fillStyle = '#3a2812'; ctx.shadowBlur = 0; }
    ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = hover === c.key && bug ? '#fff3d6' : 'rgba(255,220,150,0.16)';
    ctx.lineWidth = hover === c.key && bug ? 2 : 1; ctx.stroke();
    if (bug && S > 26) {
      ctx.fillStyle = 'rgba(255,243,214,0.9)'; ctx.font = Math.max(9, Math.round(S * 0.24)) + 'px "JetBrains Mono", monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(c.file.split('/').pop(), p.x, p.y, s * 1.7); // the name never leaves its cell
    }
  }
  // the robots: idle ones hover around the hub, busy ones fly an arc to their cell and back
  const hub = pos(0, 0);
  game.robots.forEach((r, i) => {
    const flap = now / 45 + i;
    if (!r.busy) {
      const a = i * (Math.PI * 2 / game.robots.length) + now / 2600;
      bee(hub.x + Math.cos(a) * S * 0.45, hub.y + Math.sin(a) * S * 0.45, S * 0.3, flap);
      return;
    }
    const target = game.byKey.get(r.busy); const tp = pos(target.q, target.r);
    const k = Math.min(1, Math.max(0, (game.time - r.start) / Math.max(0.01, r.arrive - r.start)));
    const x = hub.x + (tp.x - hub.x) * k; const y = hub.y + (tp.y - hub.y) * k - Math.sin(Math.PI * k) * S * 0.7;
    ctx.strokeStyle = 'rgba(255,220,150,0.35)'; ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.moveTo(hub.x, hub.y); ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]);
    bee(x, y, S * 0.34, flap);
  });
  // particles of a fix
  for (let i = particles.length - 1; i >= 0; i--) {
    const q = particles[i]; q.life -= 1 / 60; q.x += q.vx; q.y += q.vy; q.vy += 0.05;
    if (q.life <= 0) { particles.splice(i, 1); continue; }
    ctx.globalAlpha = Math.max(0, q.life); ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(q.x, q.y, 2.5, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  }
  if (toastT > 0) {
    toastT -= 1 / 60;
    ctx.globalAlpha = Math.min(1, toastT); ctx.fillStyle = '#fff3d6'; ctx.font = '15px "Inter", system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(toastText, W / 2, H - 46); ctx.globalAlpha = 1;
  }
}

function hud() {
  if (!game) return;
  const left = Math.max(0, game.level.time - game.time);
  $('#s-time').textContent = Math.ceil(left) + ' s';
  $('#s-pollen').textContent = game.pollen + ' / ' + game.level.pollen;
  $('#s-bugs').textContent = game.bugs.size;
  $('#s-score').textContent = game.score.points;
  $('#s-combo').textContent = 'x' + game.score.combo;
}
function toast(text) { toastText = text; toastT = 2.2; }

// new events of the game: tones for them, and particles where a bug was cleared
function sync() {
  for (let i = seenEvents; i < game.events.length; i++) sound.play(game.events[i]);
  seenEvents = game.events.length;
  if (game.fixed.size !== seenFixed) {
    seenFixed = game.fixed.size;
    const last = [...game.fixed].at(-1); if (last) { const p = pos(game.byKey.get(last).q, game.byKey.get(last).r); for (let i = 0; i < 16; i++) particles.push({ x: p.x, y: p.y, vx: Math.cos(i) * (1 + Math.random() * 2), vy: Math.sin(i) * (1 + Math.random() * 2) - 1, life: 0.9 }); }
  }
}

async function finish() {
  saved = true;
  runId = 'gra-' + Date.now().toString(36);
  try { await fetch('/api/runs/' + runId + '/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(game.events) }); } catch (e) { runId = null; }
  const won = game.over === 'won';
  $('#end-title').textContent = won ? 'Ul wolny od błędów' : 'Ul przegrał';
  $('#end-score').textContent = 'Wynik: ' + game.score.points + ' · naprawy: ' + game.score.fixed + (game.score.bonus ? ' · premia za czas: ' + game.score.bonus : '');
  $('#end-replay').href = runId ? '/public/obserwuj.html?run=' + encodeURIComponent(runId) : '#';
  $('#end-replay').style.display = runId ? '' : 'none';
  $('#end').classList.add('on');
  if (won) for (const n of [0, 0.15, 0.3]) setTimeout(() => sound.play({ type: 'run.completed' }), n * 1000);
  else sound.play({ type: 'run.failed' });
}

function start(level) {
  if (!files.length) return toast('Lista plików się jeszcze wczytuje.');
  const seed = Math.floor(Math.random() * 99999) + 1;
  game = createGame({ seed, level, files, id: 'gra' });
  saved = false; seenEvents = 0; seenFixed = 0; particles.length = 0; toastT = 0;
  $('#menu').classList.remove('on'); $('#end').classList.remove('on');
  toast('Wyślij robotnicę na czerwoną komórkę. Lot kosztuje ' + COST + ' pyłku.');
}

function menu() {
  game = null; $('#end').classList.remove('on'); $('#menu').classList.add('on');
}

function buildMenu() {
  $('#levels').innerHTML = LEVELS.map((l) => `<button class="level" data-level="${l.id}">
    <b>${l.name}</b><small>${l.bugs} błędów na start · ${l.time} s · ${l.pollen} pyłku · ${l.robots} robotnice</small></button>`).join('');
  $('#levels').addEventListener('click', (e) => {
    const b = e.target.closest('[data-level]'); if (!b) return;
    start(LEVELS.find((l) => l.id === b.dataset.level));
  });
}

canvas.addEventListener('pointermove', (e) => { hover = keyAt(e.clientX, e.clientY); if (game && !game.over) canvas.style.cursor = game.bugs.has(hover) ? 'pointer' : 'default'; });
canvas.addEventListener('pointerdown', (e) => {
  if (!game || game.over) return;
  const key = keyAt(e.clientX, e.clientY);
  if (!game.byKey.has(key)) return;
  if (!game.bugs.has(key)) { toast('To pole jest czyste. Czerwone komórki to błędy.'); return; }
  const r = game.send(key);
  if (r.ok) { toast('Robotnica leci na ' + game.byKey.get(key).file.split('/').pop()); sound.play({ type: 'tool.started' }); }
  else toast(r.reason);
});

$('#b-new').addEventListener('click', menu);
$('#b-sound').addEventListener('click', (e) => { const on = sound.toggle(); e.currentTarget.textContent = on ? 'Dźwięk: wł.' : 'Dźwięk: wył.'; });
$('#end-again').addEventListener('click', menu);
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') menu(); if (e.key === 'n' && !game) menu(); });

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (game && !game.over) game.advance(dt);
  if (game) { sync(); hud(); if (game.over && !saved) finish(); }
  render(now);
}
let last = performance.now();

resize();
buildMenu();
fetch('/api/workspace').then((r) => r.json()).then((j) => { files = j.files; $('#menu-note').textContent = files.length + ' plików przestrzeni roboczej — prawdziwa lista z repozytorium socket.io.'; })
  .catch(() => { $('#menu-note').textContent = 'Nie udało się wczytać listy plików.'; });
requestAnimationFrame(frame);

// for tests and the smoke check: the game state and the pixel of a cell
window.UL = { get game() { return game; }, pixelOf: (key) => { const c = game.byKey.get(key); return pos(c.q, c.r); } };
