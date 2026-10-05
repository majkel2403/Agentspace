// A deterministic re-implementation of Gource's simulation (the behaviour of Gource 0.54, written from its
// formulas): a directory tree that only branches where paths diverge, files on rings around their
// directory, users (here: Hermes and the agents) that fly to the files they act on and beam at them,
// and the overview camera. Fixed step (STEP), no Math.random, plain data only, so a state can be
// cloned (checkpoints) and the same log always gives the same picture at the same time.
import { gStringHash, gFileColour, gUserColour, gExtension } from './colour.js';
import { ACTION_COLOUR, TONE_COLOUR } from './actions.js';

export const STEP = 1 / 60;
const PI = Math.PI;
const FILE_D = 8;
const FILE_SIZE = FILE_D * 1.05;
const FILE_AREA = (FILE_D * 0.5) * (FILE_D * 0.5) * PI;
const DIR_PAD = 1.5;
const GRAVITY = 10;
export const USER_SIZE = 20;
export const USER_RATIO = 512 / 384;
const BEAM_DIST = 100;
const ACTION_DIST = 50;
const PERSONAL = 100;
const MAX_FILE_LAG = 5;
const USER_IDLE = 3;
const USER_GONE = 10;
const FILENAME_TIME = 4;
const NAME_TIME = 5;
const MAX_USER_SPEED = 500;
const PADDING = 1.1;
const ZOOM_MIN = 100;
const ZOOM_MAX = 10000;
export const SIM = { FILE_SIZE, USER_SIZE, USER_RATIO, FILENAME_TIME, NAME_TIME, USER_IDLE };

const len = (x, y) => Math.sqrt(x * x + y * y);
function hashVec(str) {
  const h = gStringHash(str);
  const x = (Math.floor(h / 7) % 255) - 127;
  const y = (Math.floor(h / 3) % 255) - 127;
  const l = len(x, y);
  return l > 0 ? [x / l, y / l] : [x, y];
}
// Gource breaks ties (two things on the same spot) with rand(), never seeded, i.e. glibc's generator with seed 1.
// The same sequence here reproduces which way the first branches grow. State lives in the sim (cloned with it).
function rngSeed1() {
  const r = [1];
  for (let i = 1; i < 31; i++) {
    const hi = Math.floor(r[i - 1] / 127773); const lo = r[i - 1] % 127773;
    let w = 16807 * lo - 2836 * hi;
    if (w < 0) w += 2147483647;
    r.push(w);
  }
  for (let i = 31; i < 34; i++) r.push(r[i - 31]);
  for (let i = 34; i < 344; i++) r.push((r[i - 31] + r[i - 3]) >>> 0);
  return { r: r.slice(-34), i: 0 };
}
export function gRand(s) {
  const g = s.rng; const r = g.r; const n = r.length;
  const v = (r[(g.i + n - 31) % n] + r[(g.i + n - 3) % n]) >>> 0;
  r[g.i] = v; g.i = (g.i + 1) % n;
  return v >>> 1;
}
// normalise(vec2((rand() % 100) - 50, (rand() % 100) - 50)); GCC evaluates the second argument first
function nudge(s) {
  const y = (gRand(s) % 100) - 50; const x = (gRand(s) % 100) - 50;
  const l = len(x, y);
  return l > 0 ? [x / l, y / l] : [x, y];
}

export function createSim(opts) {
  return {
    tick: 0, t: 0, next: 0, nextNote: 0, aspect: (opts && opts.aspect) || 16 / 9,
    dirs: [], dirByPath: {}, root: -1,
    files: [], fileByPath: {}, removed: [],
    users: [], userById: {},
    acts: [], msgs: [],
    key: {},
    cam: { x: 0, y: 0, z: -300, dx: 0, dy: 0, dz: -300, px: 0, py: 0, pz: -300 },
    rot: 0, rotLeft: 0, idle: 0, rng: rngSeed1(), keyT: 1, keyEnt: {},
    dirBounds: null, userBounds: null,
  };
}

// ------------------------------------------------------------------------------------------- tree
function newDir(s, path) {
  const p = path.endsWith('/') ? path : path + '/';
  const d = {
    i: s.dirs.length, path: p, parent: -1, children: [], files: [], x: 0, y: 0, px: 0, py: 0, ax: 0, ay: 0,
    sx: 0, sy: 0, psx: 0, psy: 0, r: DIR_PAD, pr: DIR_PAD, area: 0, vis: 0, visible: false, init: false,
    depth: 1, tokenOff: p.length, token: '', sinceNode: 0, sinceFile: 0, col: [1, 1, 1, 1], dead: false, qb: null,
  };
  s.dirs.push(d);
  s.dirByPath[p] = d.i;
  return d;
}
function setParent(s, d, parent) {
  if (parent && d.parent === parent.i) return;
  d.parent = parent ? parent.i : -1;
  d.tokenOff = d.path.length;
  d.token = parent ? d.path.slice(parent.tokenOff, d.path.length - 1) : '';
  adjustDepth(s, d);
}
function adjustDepth(s, d) {
  d.depth = d.parent < 0 ? 1 : s.dirs[d.parent].depth + 1;
  for (const c of d.children) adjustDepth(s, s.dirs[c]);
}
const prefixedBy = (d, path) => d.path.indexOf(path.endsWith('/') ? path : path + '/') === 0;
function commonPrefix(a, b) {
  let c = 0; let slash = -1;
  while (c < a.length && c < b.length && a[c] === b[c]) { if (a[c] === '/') slash = c; c++; }
  return slash < 0 ? '' : b.slice(0, slash + 1);
}
function calcRadius(s, d) {
  const own = FILE_AREA * d.vis;
  let area = own;
  for (const c of d.children) area += s.dirs[c].area;
  d.area = area;
  d.r = Math.max(1, Math.sqrt(area)) * DIR_PAD;
  d.pr = Math.max(1, Math.sqrt(own) * DIR_PAD);
}
function updateFilePositions(s, d) {
  let maxFiles = 1; let diameter = 1; let no = 0; let dist = 0; let left = d.vis;
  for (const fi of d.files) {
    const f = s.files[fi];
    if (f.hidden) { f.destx = 0; f.desty = 0; f.dist = 0; continue; }
    const arc = 1 / maxFiles; const frac = arc * 0.5 + arc * no;
    f.destx = Math.sin(frac * PI * 2); f.desty = Math.cos(frac * PI * 2); f.dist = dist;
    left--; no++;
    if (no >= maxFiles) {
      diameter++; dist += FILE_D;
      maxFiles = Math.floor(Math.max(1, diameter * PI));
      if (left < maxFiles) maxFiles = left;
      no = 0;
    }
  }
}
function nodeUpdated(s, d, user) {
  if (user) d.sinceNode = 0;
  calcRadius(s, d);
  updateFilePositions(s, d);
  if (d.visible && !d.children.length && !d.files.length) d.visible = false;
  if (d.parent >= 0) nodeUpdated(s, s.dirs[d.parent], true);
}
function fileUpdated(s, d, user) {
  calcRadius(s, d);
  d.sinceFile = 0;
  nodeUpdated(s, d, user);
}
function addNode(s, d, node) {
  for (let k = 0; k < d.children.length;) {
    const c = s.dirs[d.children[k]];
    if (prefixedBy(c, node.path)) { d.children.splice(k, 1); addNode(s, node, c); } else k++;
  }
  d.children.push(node.i);
  setParent(s, node, d);
  nodeUpdated(s, d, false);
}
function dirAddFile(s, d, f) {
  if (f.dirPath.indexOf(d.path) !== 0) {
    if (d.parent >= 0) return false;
    const common = commonPrefix(d.path, f.dirPath) || '/';
    const np = newDir(s, common);
    addNode(s, np, d);
    return dirAddFile(s, np, f);
  }
  if (d.parent < 0 && d.path === '/' && f.dirPath !== d.path && !d.files.length && !d.children.length) {
    delete s.dirByPath[d.path];
    d.path = f.dirPath; d.tokenOff = d.path.length;
    s.dirByPath[d.path] = d.i;
  }
  if (f.dirPath === d.path) {
    d.files.push(f.i);
    if (!f.hidden) d.vis++;
    f.dir = d.i;
    fileUpdated(s, d, false);
    return true;
  }
  let added = false;
  for (const c of d.children) { if (dirAddFile(s, s.dirs[c], f)) { added = true; break; } }
  if (added && d.parent >= 0) return true;
  if (added) return true;
  const node = newDir(s, f.dirPath);
  dirAddFile(s, node, f);
  addNode(s, d, node);
  // where two children share a deeper prefix, insert the shared directory between
  let cpath = ''; let cx = 0; let cy = 0;
  for (const ci of d.children) {
    const c = s.dirs[ci];
    const common = commonPrefix(c.path, f.dirPath);
    if (common.length > d.path.length && common !== f.dirPath) { cpath = common; cx = c.x; cy = c.y; break; }
  }
  if (cpath.length > d.path.length) {
    const cn = newDir(s, cpath);
    cn.x = cx; cn.y = cy; cn.px = cx; cn.py = cy;
    for (let k = 0; k < d.children.length;) {
      const c = s.dirs[d.children[k]];
      if (prefixedBy(c, cpath)) { d.children.splice(k, 1); addNode(s, cn, c); } else k++;
    }
    addNode(s, d, cn);
  }
  return true;
}
function dirRemoveFile(s, d, f) {
  if (f.dirPath.indexOf(d.path) !== 0) return false;
  if (f.dirPath === d.path) {
    const k = d.files.indexOf(f.i);
    if (k < 0) return false;
    d.files.splice(k, 1);
    if (!f.hidden) d.vis--;
    fileUpdated(s, d, false);
    return true;
  }
  for (let k = 0; k < d.children.length; k++) {
    const c = s.dirs[d.children[k]];
    if (dirRemoveFile(s, c, f)) {
      if (!c.files.length && !c.children.length) {
        d.children.splice(k, 1);
        killDir(s, c);
        nodeUpdated(s, d, false);
      }
      return true;
    }
  }
  return false;
}
function killDir(s, d) {
  d.dead = true;
  if (s.dirByPath[d.path] === d.i) delete s.dirByPath[d.path];
  for (const c of d.children) killDir(s, s.dirs[c]);
}
function isVisible(s, d) {
  if (d.visible) return true;
  for (const c of d.children) if (isVisible(s, s.dirs[c])) { d.visible = true; return true; }
  return false;
}
const emptyDir = (d) => d.vis === 0 && !d.children.length;
function isAncestor(s, a, d) { // is a an ancestor of d
  let p = d.parent;
  while (p >= 0) { if (p === a.i) return true; p = s.dirs[p].parent; }
  return false;
}

// ------------------------------------------------------------------------------------------- files
function addFile(s, path) {
  const slash = path.lastIndexOf('/');
  const f = {
    i: s.files.length, path, name: path.slice(slash + 1), dirPath: path.slice(0, slash + 1), ext: gExtension(path),
    dir: -1, x: 0, y: 0, px: 0, py: 0, destx: 0, desty: 0, dist: 0, elapsed: 0, hidden: true, last: 0, fade: -1,
    removing: false, removedT: 0, expired: false, forced: false, col: gFileColour(path), tcol: [1, 1, 1], tkind: '',
    nameInt: FILENAME_TIME, dead: false,
  };
  s.files.push(f);
  s.fileByPath[path] = f.i;
  if (s.root < 0) s.root = newDir(s, '/').i;
  dirAddFile(s, s.dirs[s.root], f);
  while (s.dirs[s.root].parent >= 0) s.root = s.dirs[s.root].parent;
  s.key[f.ext] = (s.key[f.ext] || 0) + 1;
  return f;
}
function touchFile(s, f, t, kind) {
  if (f.forced || (f.removing && t < f.removedT)) return;
  f.fade = -1; f.removing = false; f.removedT = 0;
  f.last = f.elapsed;
  f.tcol = ACTION_COLOUR[kind] || ACTION_COLOUR.M; f.tkind = kind;
  if (f.expired) { const k = s.removed.indexOf(f.i); if (k >= 0) s.removed.splice(k, 1); f.expired = false; }
  if (f.nameInt <= 0) f.nameInt = FILENAME_TIME;
  if (f.hidden) {
    f.hidden = false;
    const d = s.dirs[f.dir];
    d.vis++; d.visible = true;
  }
  fileUpdated(s, s.dirs[f.dir], true);
}
function removeFileLater(s, f, t) {
  f.last = f.elapsed; f.fade = f.elapsed; f.removing = true; f.removedT = t;
}
function deleteFile(s, f) {
  if (f.dead) return;
  dirRemoveFile(s, s.dirs[s.root], f);
  for (const u of s.users) {
    if (u.dead) continue;
    u.pending = u.pending.filter((ai) => s.acts[ai].f !== f.i);
    u.active = u.active.filter((ai) => s.acts[ai].f !== f.i);
  }
  delete s.fileByPath[f.path];
  s.key[f.ext] = (s.key[f.ext] || 1) - 1;
  f.dead = true;
}
function fileLogic(s, f, dt) {
  f.elapsed += dt;
  if (!f.hidden && f.nameInt > 0) f.nameInt -= dt;
  const tx = f.destx * f.dist; const ty = f.desty * f.dist;
  let ax = tx - f.x; let ay = ty - f.y;
  let bx = ax * 5 * dt; let by = ay * 5 * dt;
  if (bx * bx + by * by > ax * ax + ay * ay) { bx = ax; by = ay; }
  f.x += bx; f.y += by;
  if (f.fade > 0 && !f.expired && f.elapsed - f.fade >= 1) {
    f.expired = true;
    if (s.removed.indexOf(f.i) < 0) s.removed.push(f.i);
  }
  if (f.hidden && !f.forced) f.elapsed = 0;
}
export function fileAlpha(f) {
  if (f.fade > 0) return 1 - Math.max(0, Math.min(1, f.elapsed - f.fade));
  return Math.min(f.elapsed / 1, 1);
}
export function fileColour(f) {
  const lc = f.elapsed - f.last;
  if (lc < 1) return [f.tcol[0] * (1 - lc) + f.col[0] * lc, f.tcol[1] * (1 - lc) + f.col[1] * lc, f.tcol[2] * (1 - lc) + f.col[2] * lc];
  return f.col;
}
// alpha of a name label that is shown for `total` seconds (1 s fade in / out), Gource's Pawn::drawName
export function nameAlpha(interval, total) {
  if (interval < 0) return 0;
  const done = total - interval;
  if (done < 1) return Math.max(0, done);
  if (done < total - 1) return 1;
  return Math.max(0, total - done);
}

// ------------------------------------------------------------------------------------------- users
function addUser(s, id, label) {
  const b = s.dirBounds;
  const x = b && (b.x1 - b.x0) * (b.y1 - b.y0) > 0 ? (b.x0 + b.x1) / 2 : 0;
  const y = b && (b.x1 - b.x0) * (b.y1 - b.y0) > 0 ? (b.y0 + b.y1) / 2 : 0;
  const u = {
    i: s.users.length, id, label, col: gUserColour(label), x, y, px: x, py: y, ax: 0, ay: 0, elapsed: 0, last: 0,
    actInt: 0.2, nameInt: NAME_TIME, pending: [], active: [], tool: '', toolT: -1, toolState: '', flagT: -1, flag: '', dead: false,
  };
  s.users.push(u);
  s.userById[id] = u.i;
  return u;
}
const userIdle = (u) => !u.active.length && !u.pending.length;
export function userAlpha(u) {
  let a = Math.min(u.elapsed / 1, 1);
  if (u.elapsed - u.last > USER_IDLE) a = 1 - Math.min(u.elapsed - u.last - USER_IDLE, 1);
  return a;
}
function userAddAction(s, u, ai) {
  if (userIdle(u) && u.nameInt <= 0) u.nameInt = NAME_TIME;
  u.pending.push(ai);
}
function forceToFile(s, u, f) {
  const d = s.dirs[f.dir];
  const fx = f.x + d.x; const fy = f.y + d.y;
  const dx = fx - u.x; const dy = fy - u.y;
  const dist = len(dx, dy);
  if (dist < 0.001) { const n = nudge(s); u.ax += n[0]; u.ay += n[1]; return; }
  if (dist < ACTION_DIST) { u.ax -= (ACTION_DIST - dist) * dx / dist; u.ay -= (ACTION_DIST - dist) * dy / dist; return; }
  if (dist > BEAM_DIST) { u.ax += (dist - BEAM_DIST) * dx / dist; u.ay += (dist - BEAM_DIST) * dy / dist; }
}
// Gource finds users to push away with a quadtree of avatar bounds (one item per leaf, depth 1 while the tree is
// small, 6 later) and pushes every user found in the leaves that touch this avatar, so busy users keep space.
function userTree(s, list) {
  const hw = USER_SIZE * 0.5; const hh = hw * USER_RATIO;
  const b = s.userBounds;
  const db = s.dirBounds;
  const maxDepth = db && (db.x1 - db.x0) * (db.y1 - db.y0) > 10000 ? 6 : 1;
  const root = { x0: b.x0 - 1, y0: b.y0 - 1, x1: b.x1 + 1, y1: b.y1 + 1, depth: 0, items: [], kids: null };
  const over = (n, u) => !(u.x - hw > n.x1 || u.x + hw < n.x0 || u.y - hh > n.y1 || u.y + hh < n.y0);
  const add = (n, u) => {
    if (!n.kids && (n.depth >= maxDepth || n.items.length < 1)) { n.items.push(u); return; }
    if (!n.kids) {
      const mx = (n.x0 + n.x1) / 2; const my = (n.y0 + n.y1) / 2; const d = n.depth + 1;
      n.kids = [{ x0: n.x0, y0: n.y0, x1: mx, y1: my }, { x0: mx, y0: n.y0, x1: n.x1, y1: my }, { x0: n.x0, y0: my, x1: mx, y1: n.y1 }, { x0: mx, y0: my, x1: n.x1, y1: n.y1 }]
        .map((k) => Object.assign(k, { depth: d, items: [], kids: null }));
      const old = n.items; n.items = [];
      for (const o of old) for (const k of n.kids) if (over(k, o)) add(k, o);
    }
    for (const k of n.kids) if (over(k, u)) add(k, u);
  };
  for (const u of list) add(root, u);
  return (u) => {
    const out = new Set();
    const visit = (n) => {
      if (n.items.length) { for (const o of n.items) out.add(o); return; }
      if (n.kids) for (const k of n.kids) if ((k.items.length || k.kids) && over(k, u)) visit(k);
    };
    visit(root);
    return out;
  };
}
function userForces(s, u, near) {
  const count = u.pending.length + u.active.length;
  const want = count === 0 ? PERSONAL : (u.pending.length && !u.active.length) ? PERSONAL * 0.1 : PERSONAL * 0.5;
  for (const v of near(u)) {
    if (v === u) continue;
    const dx = v.x - u.x; const dy = v.y - u.y; const dist = len(dx, dy);
    if (dist < 0.001) { const n = nudge(s); u.ax += n[0]; u.ay += n[1]; continue; }
    if (dist < want) { u.ax -= (want - dist) * dx / dist; u.ay -= (want - dist) * dy / dist; }
  }
  if (!u.active.length && !u.pending.length) return;
  u.last = u.elapsed;
  let n = 0;
  for (const ai of u.active) { forceToFile(s, u, s.files[s.acts[ai].f]); if (++n >= 3) break; }
  if (u.active.length) return;
  if (u.pending.length) forceToFile(s, u, s.files[s.acts[u.pending[0]].f]);
}
function userLogic(s, u, dt) {
  u.elapsed += dt;
  if (u.nameInt > 0) u.nameInt -= dt;
  u.actInt -= dt;
  const find = u.pending.length > 0 && u.actInt <= 0;
  for (let k = 0; k < u.pending.length;) {
    const a = s.acts[u.pending[k]];
    if (a.t < s.t - MAX_FILE_LAG) { u.pending.splice(k, 1); a.rate = 2; u.active.push(a.i); continue; }
    if (!find) break;
    const f = s.files[a.f]; const d = s.dirs[f.dir];
    if (len(f.x + d.x - u.x, f.y + d.y - u.y) < BEAM_DIST) { u.pending.splice(k, 1); u.active.push(a.i); break; }
    k++;
  }
  if (u.actInt <= 0) { const tot = u.pending.length + u.active.length; u.actInt = tot ? 1 / tot : 1; }
  for (let k = 0; k < u.active.length;) {
    const a = s.acts[u.active[k]];
    actionLogic(s, u, a, dt);
    if (a.progress >= 1) { u.active.splice(k, 1); continue; }
    k++;
  }
  const l2 = u.ax * u.ax + u.ay * u.ay;
  if (l2 > MAX_USER_SPEED * MAX_USER_SPEED) { const l = Math.sqrt(l2); u.ax = u.ax / l * MAX_USER_SPEED; u.ay = u.ay / l * MAX_USER_SPEED; }
  u.x += u.ax * dt; u.y += u.ay * dt;
  const fr = Math.max(0, 1 - dt);
  u.ax *= fr; u.ay *= fr;
}
function actionLogic(s, u, a, dt) {
  if (a.progress >= 1) return;
  const f = s.files[a.f];
  if (a.progress === 0) touchFile(s, f, a.t, a.kind);
  const rate = Math.min(10, a.rate * Math.max(1, u.pending.length));
  const old = a.progress;
  a.progress = Math.min(a.progress + rate * dt, 1);
  if (a.kind === 'D' && old < 1 && a.progress >= 1) removeFileLater(s, f, a.t);
}

// ------------------------------------------------------------------------------------------- dirs
function applyDirForce(s, d, o, tick) {
  const dx = o.x - d.x; const dy = o.y - d.y;
  const d2 = dx * dx + dy * dy; const sum = d.r + o.r;
  if (d2 - sum * sum > 0) return;
  const pd = Math.sqrt(d2);
  if (pd < 0.00001) { const n = nudge(s); d.ax += n[0]; d.ay += n[1]; return; }
  const dist = pd - d.r - o.r;
  d.ax += dist * dx / pd; d.ay += dist * dy / pd;
}
// pairs of directories whose bounds overlap (sweep and prune on x), like Gource's quadtree query
function overlapPairs(cand) {
  const list = cand.filter((d) => d.qb).sort((a, b) => a.qb.x0 - b.qb.x0 || a.i - b.i);
  const near = new Map();
  const active = [];
  for (const d of list) {
    for (let k = active.length - 1; k >= 0; k--) if (active[k].qb.x1 < d.qb.x0) active.splice(k, 1);
    for (const o of active) {
      if (o.qb.y0 > d.qb.y1 || o.qb.y1 < d.qb.y0) continue;
      if (!near.has(d.i)) near.set(d.i, []);
      if (!near.has(o.i)) near.set(o.i, []);
      near.get(d.i).push(o); near.get(o.i).push(d);
    }
    active.push(d);
  }
  return near;
}
function dirForces(s, d, near) {
  for (const c of d.children) dirForces(s, s.dirs[c], near);
  if (d.parent < 0) return;
  const p = s.dirs[d.parent];
  // overlap with any unrelated directory
  const list = near.get(d.i);
  if (list) {
    for (const o of list) {
      if (o === p || o.parent === d.i) continue;
      if (isAncestor(s, o, d) || isAncestor(s, d, o)) continue;
      applyDirForce(s, d, o, s.tick);
    }
  }
  applyDirForce(s, d, p, s.tick);
  // gravity towards the edge of the parent's own file ring
  {
    const dx = p.x - d.x; const dy = p.y - d.y; const l = len(dx, dy);
    const pdist = l - (d.r + p.pr);
    if (l > 0) { d.ax += GRAVITY * pdist * dx / l; d.ay += GRAVITY * pdist * dy / l; }
  }
  if (p.parent >= 0) {
    const pp = s.dirs[p.parent];
    let ex = p.x - pp.x; let ey = p.y - pp.y; const el = len(ex, ey);
    if (el > 0) { ex /= el; ey /= el; }
    d.ax += p.x + (p.r + d.r) * ex - d.x;
    d.ay += p.y + (p.r + d.r) * ey - d.y;
  }
  if (p.children.length) {
    let sx = 0; let sy = 0; let vis = 1;
    for (const ci of p.children) {
      const o = s.dirs[ci];
      if (o === d || !isVisible(s, o)) continue;
      vis++;
      const dx = o.x - d.x; const dy = o.y - d.y; const l = len(dx, dy);
      if (l > 0) { sx -= dx / l; sy -= dy / l; }
    }
    if (vis > 1) { const slice = (p.r * PI) / (vis + 1); d.ax += sx * slice; d.ay += sy * slice; }
  }
}
function dirLogic(s, d, dt) {
  if (d.parent >= 0) {
    const p = s.dirs[d.parent];
    if (!emptyDir(d) && !d.init) {
      const hv = hashVec(d.path);
      d.x = p.x; d.y = p.y;
      if (p.parent >= 0) {
        const pp = s.dirs[p.parent];
        let ex = p.x - pp.x; let ey = p.y - pp.y; const el = len(ex, ey);
        if (el > 0) { ex /= el; ey /= el; }
        let nx = ex * 2 + hv[0]; let ny = ey * 2 + hv[1]; const nl = len(nx, ny);
        if (nl > 0) { nx /= nl; ny /= nl; }
        d.x += nx; d.y += ny;
      } else { d.x += hv[0]; d.y += hv[1]; }
      d.sx = d.x - (p.x - d.x) * 0.5; d.sy = d.y - (p.y - d.y) * 0.5;
      d.px = d.x; d.py = d.y; d.psx = d.sx; d.psy = d.sy;
      d.init = true;
    }
    d.x += d.ax * dt; d.y += d.ay * dt;
    d.ax = 0; d.ay = 0;
    // spline control point lags behind the midpoint of the edge
    const tdx = (p.x - d.x) * 0.5; const tdy = (p.y - d.y) * 0.5;
    const mx = d.x + tdx; const my = d.y + tdy;
    let ex = mx - d.sx; let ey = my - d.sy;
    const el = len(ex, ey); const tl = len(tdx, tdy);
    if (el > tl && el > 0) { d.sx += ex / el * (el - tl); d.sy += ey / el * (el - tl); ex = mx - d.sx; ey = my - d.sy; }
    const k = Math.min(1, dt * 2);
    d.sx += ex * k; d.sy += ey * k;
  }
  for (const fi of d.files) fileLogic(s, s.files[fi], dt);
  for (const c of d.children) dirLogic(s, s.dirs[c], dt);
  // colour: grey brightness that decays after a change, mixed with the files' colours
  const br = Math.max(0.6, 1 - Math.min(1, d.sinceNode / 3));
  let r = br; let g = br; let b = br; let a = 1; let n = 0;
  for (const fi of d.files) {
    const f = s.files[fi];
    if (f.hidden) continue;
    const c = fileColour(f);
    r += c[0] * br; g += c[1] * br; b += c[2] * br; a += fileAlpha(f); n++;
  }
  d.col[0] = r / (n + 1); d.col[1] = g / (n + 1); d.col[2] = b / (n + 1); d.col[3] = a / (n + 1);
  d.sinceFile += dt; d.sinceNode += dt;
}

// ------------------------------------------------------------------------------------------- step
function updateBounds(s) {
  let ub = null;
  const hw = USER_SIZE * 0.5; const hh = hw * USER_RATIO;
  for (const u of s.users) {
    if (u.dead) continue;
    ub = grow(ub, u.x - hw, u.y - hh, u.x + hw, u.y + hh);
  }
  s.userBounds = ub;
  let db = null;
  for (const d of s.dirs) {
    if (d.dead) continue;
    if (isVisible(s, d)) {
      d.qb = { x0: d.x - d.r, y0: d.y - d.r, x1: d.x + d.r, y1: d.y + d.r };
      db = grow(db, d.qb.x0, d.qb.y0, d.qb.x1, d.qb.y1);
    }
  }
  s.dirBounds = db;
}
function grow(b, x0, y0, x1, y1) {
  if (!b) return { x0, y0, x1, y1 };
  if (x0 < b.x0) b.x0 = x0; if (y0 < b.y0) b.y0 = y0; if (x1 > b.x1) b.x1 = x1; if (y1 > b.y1) b.y1 = y1;
  return b;
}
function processAction(s, ctx, a) {
  // a path ending in '/' is a directory: Gource only deletes everything under it, other actions are ignored
  if (a.path.endsWith('/')) {
    if (a.kind !== 'D') return;
    const under = s.files.filter((f) => !f.dead && f.dirPath.indexOf(a.path) === 0);
    for (const f of under) processAction(s, ctx, { t: a.t, user: a.user, path: f.path, kind: 'D', ev: a.ev });
    return;
  }
  let fi = s.fileByPath[a.path];
  if (fi === undefined) {
    if (a.kind === 'D') return;
    const asDir = a.path + '/';
    if (s.dirs.some((d) => !d.dead && d.path.indexOf(asDir) === 0)) return;
    fi = addFile(s, a.path).i;
  }
  let ui = s.userById[a.user];
  if (ui === undefined || s.users[ui].dead) ui = addUser(s, a.user, ctx.label(a.user)).i;
  const act = { i: s.acts.length, u: ui, f: fi, t: s.t, kind: a.kind, progress: 0, rate: 0.5, ev: a.ev };
  s.acts.push(act);
  userAddAction(s, s.users[ui], act.i);
}
function processNote(s, ctx, n) {
  const ui = s.userById[n.user];
  const u = ui !== undefined && !s.users[ui].dead ? s.users[ui] : null;
  if (n.kind === 'msg') {
    const bi = s.userById[n.to];
    if (u && bi !== undefined && !s.users[bi].dead) s.msgs.push({ a: u.i, b: bi, t0: s.t, col: TONE_COLOUR[n.tone] || [0.9, 0.92, 1] });
    return;
  }
  if (!u) return;
  if (n.kind === 'tool') { u.tool = n.text || ''; u.toolT = s.t; u.toolState = 'run'; }
  else if (n.kind === 'tool-end') { u.toolState = 'done'; u.toolT = s.t; }
  else if (n.kind === 'tool-fail') { u.toolState = 'fail'; u.toolT = s.t; }
  else { u.flag = n.kind; u.flagT = s.t; }
}

export function step(s, ctx) {
  const dt = STEP;
  // keep the previous positions for smooth drawing between steps
  for (const d of s.dirs) { d.px = d.x; d.py = d.y; d.psx = d.sx; d.psy = d.sy; }
  for (const f of s.files) { f.px = f.x; f.py = f.y; }
  for (const u of s.users) { u.px = u.x; u.py = u.y; }
  s.cam.px = s.cam.x; s.cam.py = s.cam.y; s.cam.pz = s.cam.z;
  s.tick++;
  s.t = s.tick * STEP;
  for (const fi of s.removed) deleteFile(s, s.files[fi]);
  s.removed.length = 0;
  const A = ctx.actions;
  while (s.next < A.length && A[s.next].t <= s.t + 1e-9) processAction(s, ctx, A[s.next++]);
  const N = ctx.notes;
  while (s.nextNote < N.length && N[s.nextNote].t <= s.t + 1e-9) processNote(s, ctx, N[s.nextNote++]);
  s.msgs = s.msgs.filter((m) => s.t - m.t0 < 1.5);
  updateBounds(s);
  // Gource keeps users in a map ordered by name
  const live = s.users.filter((u) => !u.dead).sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : a.i - b.i));
  if (live.length) {
    const near = userTree(s, live);
    for (const u of live) userForces(s, u, near);
  }
  for (const u of live) {
    userLogic(s, u, dt);
    if (userIdle(u) && u.elapsed - u.last > USER_GONE) { u.dead = true; s.userById[u.id] = undefined; }
  }
  if (s.root >= 0) {
    const cand = [];
    for (const d of s.dirs) if (!d.dead && !emptyDir(d)) cand.push(d);
    dirForces(s, s.dirs[s.root], overlapPairs(cand));
    dirLogic(s, s.dirs[s.root], dt);
  }
  camera(s, dt);
  keyLogic(s, dt);
  const idle = s.users.every((u) => u.dead || userIdle(u));
  s.idle = idle ? s.idle + dt : 0;
}

// file extension key: Gource re-sorts it once a second; entries fade and slide in, move to their new row over 1 s
function keyLogic(s, dt) {
  const E = s.keyEnt;
  for (const ext in s.key) if (s.key[ext] > 0 && !E[ext]) E[ext] = { ext, alpha: 0, y: -1, src: -1, dest: -1, move: 1 };
  s.keyT -= dt;
  if (s.keyT <= 0) {
    const list = Object.values(E).filter((e) => !((s.key[e.ext] || 0) <= 0 && e.alpha <= 0));
    for (const ext in E) if (list.indexOf(E[ext]) < 0) delete E[ext];
    list.sort((a, b) => (s.key[b.ext] || 0) - (s.key[a.ext] || 0) || (a.ext < b.ext ? -1 : a.ext > b.ext ? 1 : 0));
    let row = 0;
    for (const e of list) {
      if ((s.key[e.ext] || 0) <= 0) continue;
      row++;
      if (e.dest !== row) { e.dest = row; e.src = e.y; e.move = 0; }
    }
    s.keyT = 1;
  }
  for (const ext in E) {
    const e = E[ext];
    const n = s.key[ext] || 0;
    e.alpha = n <= 0 ? Math.max(0, e.alpha - dt) : Math.min(1, e.alpha + dt);
    if (e.y !== e.dest) {
      if (e.y < 0) e.y = e.dest;
      else { e.move += dt; e.y = e.move >= 1 ? e.dest : e.src + (e.dest - e.src) * e.move; }
    }
  }
}

function camera(s, dt) {
  const c = s.cam;
  const b = s.dirBounds;
  if (b) {
    c.dx = (b.x0 + b.x1) / 2; c.dy = (b.y0 + b.y1) / 2;
    let w = (b.x1 - b.x0) * PADDING; let h = (b.y1 - b.y0) * PADDING;
    if (s.aspect < 1) h /= s.aspect; else w /= s.aspect;
    let dist = Math.max(w, h) / 2; // tan(45°) * 2 = 2
    dist = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, dist));
    c.dz = -dist;
  } else { c.dx = 0; c.dy = 0; c.dz = -ZOOM_MIN; }
  let ex = (c.dx - c.x) * dt; let ey = (c.dy - c.y) * dt; let ez = (c.dz - c.z) * dt;
  const full2 = (c.dx - c.x) ** 2 + (c.dy - c.y) ** 2 + (c.dz - c.z) ** 2;
  if (ex * ex + ey * ey + ez * ez > full2) { ex = c.dx - c.x; ey = c.dy - c.y; ez = c.dz - c.z; }
  c.x += ex; c.y += ey; c.z += ez;
  // automatic 90° turn when the tree grows long in the wrong direction for the screen
  if (s.rotLeft > 0) {
    const rate = Math.max(dt, 1 - Math.abs(s.rotLeft / 90 - 0.5) * 2) * dt;
    const ang = Math.min(s.rotLeft, 90 * rate);
    s.rotLeft -= ang;
    rotateWorld(s, ang * PI / 180);
  } else if (b && (b.x1 - b.x0) * (b.y1 - b.y0) > 10000) {
    const ratio = s.aspect > 1 ? (b.x1 - b.x0) / (b.y1 - b.y0) : (b.y1 - b.y0) / (b.x1 - b.x0);
    if (ratio < 0.67) s.rotLeft = 90;
  }
}
function rotateWorld(s, a) {
  const sn = Math.sin(a); const cs = Math.cos(a);
  const rot = (x, y) => [x * cs - y * sn, x * sn + y * cs];
  for (const d of s.dirs) {
    if (d.dead) continue;
    let r = rot(d.x, d.y); d.x = r[0]; d.y = r[1];
    r = rot(d.px, d.py); d.px = r[0]; d.py = r[1];
    r = rot(d.sx, d.sy); d.sx = r[0]; d.sy = r[1];
    r = rot(d.psx, d.psy); d.psx = r[0]; d.psy = r[1];
  }
  for (const u of s.users) {
    if (u.dead) continue;
    let r = rot(u.x, u.y); u.x = r[0]; u.y = r[1];
    r = rot(u.px, u.py); u.px = r[0]; u.py = r[1];
  }
}

export const dirVisible = isVisible;
