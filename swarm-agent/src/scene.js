// The swarm in 3D. Everything shown is a function of the state at the log time st.now: a file glows when the log
// says it was touched, an agent walks to the place its last event names, a beam is an action that happened a moment ago,
// an arc is a message. The camera (orbit, follow) is the only thing that is not from the log.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { locate } from './layout.js';
import { QUEEN } from './model.js';
import { colourOf } from './palette.js';
import { heightField, heightColour } from './terrain.js';
import { hiveCells, CELL } from './hive.js';

const APPEAR_S = 0.7;     // a new file or folder grows to full size in this many log seconds
const WALK_S = 1.1;       // an agent walks to its next place in this many log seconds
const BEAM_S = 1.2;       // a beam lives this long after the action
const ARC_S = 2.4;        // a message arc stays this long
const HOT_S = 1.6;        // a file stays bright this long after a touch
const LABEL_S = 4;        // a file name is shown this long after a touch
const TRAIL_S = 12;       // a drone's trail shows where it flew in the last this many log seconds
const TERRAIN_N = 72;     // grid of the landscape of attention
const HIVE_Y = 4;         // the comb lies just above the ground
const HONEY = [0.42, 0.29, 0.12]; // an untouched cell: wax
const GOLD = [1, 0.69, 0.13];     // a well-worked cell

const FILE_COLOUR = { idle: '#8c7456', read: '#ffe49a', created: '#9be36b', modified: '#ffd166', deleted: '#ff5a3c' };
const TONE_COLOUR = { assign: '#ffb020', question: '#ffd166', answer: '#9ad4ff', result: '#9be36b', handoff: '#e8b26b', critique: '#ff9a4a', revision: '#ffd166', approve: '#c6f08a' };
const ease = (x) => { const t = Math.min(1, Math.max(0, x)); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const easeBack = (x) => { const t = Math.min(1, Math.max(0, x)); const c = 1.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const hashN = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 1000) / 1000; };

function labelSprite(text, colour, size = 15) {
  const c = document.createElement('canvas'); const g = c.getContext('2d');
  g.font = '600 ' + size * 2 + 'px "JetBrains Mono", ui-monospace, monospace';
  const w = Math.ceil(g.measureText(text).width) + 24; const h = size * 2 + 14;
  c.width = w; c.height = h;
  g.font = '600 ' + size * 2 + 'px "JetBrains Mono", ui-monospace, monospace';
  g.fillStyle = 'rgba(8,4,14,0.72)'; g.beginPath(); g.roundRect(0, 0, w, h, h / 2); g.fill();
  g.fillStyle = colour; g.textBaseline = 'middle'; g.fillText(text, 12, h / 2 + 1);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.userData.aspect = w / h;
  sp.scale.set(w / h * 9, 9, 1);
  return sp;
}

export function createScene(container, { onPick } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x120b04, 1);
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x120b04, 0.00045);
  const camera = new THREE.PerspectiveCamera(48, 1, 1, 8000);
  camera.position.set(0, 330, 470);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 60; controls.maxDistance = 1800; controls.maxPolarAngle = Math.PI * 0.49;
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const sun = new THREE.DirectionalLight(0xffffff, 0.9); sun.position.set(-200, 400, 200); scene.add(sun);

  const dirGroup = new THREE.Group(); const fileGroup = new THREE.Group(); const labelGroup = new THREE.Group(); const hiveGroup = new THREE.Group();
  const agentGroup = new THREE.Group(); const fxGroup = new THREE.Group();
  scene.add(dirGroup, fileGroup, agentGroup, fxGroup, labelGroup, hiveGroup);
  // the two views: 'hive' (the honeycomb of files) or 'land' (folders and the landscape of attention)
  let mode = 'hive'; let cellMap = null; let cellPaths = []; let hiveMesh = null; let rawLayout = null;
  const hexGeometry = new THREE.CylinderGeometry(CELL * 0.9, CELL * 0.9, 1, 6, 1); hexGeometry.rotateY(Math.PI / 6);
  const dummy = new THREE.Object3D();

  const mats = new Map();
  const mat = (colour, emissive = 0, opacity = 1) => {
    const key = colour + ':' + emissive + ':' + opacity;
    if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: emissive, roughness: 0.5, transparent: opacity < 1, opacity }));
    return mats.get(key);
  };
  const sphere = new THREE.SphereGeometry(1, 14, 10);

  let layout = null; let files = []; let dirMeshes = new Map(); let edges = null; let agentMeshes = new Map();
  let fileLabels = new Map(); let selected = null; let follow = true;
  let known = -1; let dirFirst = new Map();
  let terrain = null; let terrainKey = ''; let box = null;
  let director = null; // a point the camera glides to when the director is on (presentation only)
  let posCache = new Map();
  const colourOfAgent = (id, st) => colourOf(id, st ? st.order : []);

  function clearGroup(g) { while (g.children.length) { const o = g.children.pop(); if (o.geometry && o.geometry !== sphere) o.geometry.dispose(); if (o.material && o.material.map) o.material.map.dispose(); } }

  // the layout is rebuilt when the set of places changes (live runs): folders and files become meshes once
  function setLayout(L) {
    layout = L; rawLayout = L;
    clearGroup(dirGroup); clearGroup(fileGroup); clearGroup(agentGroup); clearGroup(fxGroup); clearGroup(labelGroup);
    if (hiveMesh) { hiveGroup.remove(hiveMesh); hiveMesh.dispose(); hiveMesh = null; }
    dirMeshes = new Map(); files = []; fileLabels = new Map(); agentMeshes = new Map(); posCache = new Map(); known = -1;
    for (const d of L.dirs.values()) {
      const m = new THREE.Mesh(sphere, mat(hashColour(d.key), 0.35));
      m.position.set(d.x, d.y, d.z); m.scale.setScalar(0.0001);
      m.userData = { kind: 'dir', key: d.key };
      dirGroup.add(m); dirMeshes.set(d.key, { mesh: m, depth: d.depth });
    }
    for (const f of L.files.values()) {
      const m = new THREE.Mesh(sphere, mat(FILE_COLOUR.idle, 0));
      m.position.set(f.x, f.y, f.z); m.scale.setScalar(0.0001);
      m.userData = { kind: 'file', path: f.path };
      fileGroup.add(m); files.push({ path: f.path, mesh: m, dir: f.dir });
    }
    cellMap = hiveCells((path) => L.files.get(path), [...L.files.keys()]);
    cellPaths = [...L.files.keys()].filter((path) => cellMap.has(path)).sort();
    hiveMesh = new THREE.InstancedMesh(hexGeometry, new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.05, emissive: 0x2a1500, emissiveIntensity: 0.5 }), Math.max(1, cellPaths.length));
    hiveMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    hiveGroup.add(hiveMesh);
    edges = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x6d5aa0, transparent: true, opacity: 0.45 }));
    dirGroup.add(edges);
    // the landscape under the workspace: a grid over the box the files span, raised by attention
    const xs = [...L.files.values()].map((f) => f.x); const zs = [...L.files.values()].map((f) => f.z);
    const pad = 70;
    box = xs.length ? { x0: Math.min(...xs) - pad, x1: Math.max(...xs) + pad, z0: Math.min(...zs) - pad, z1: Math.max(...zs) + pad } : { x0: -200, x1: 200, z0: -200, z1: 200 };
    if (terrain) { terrain.geometry.dispose(); terrain.material.dispose(); scene.remove(terrain); }
    const N = TERRAIN_N; const g = new THREE.BufferGeometry();
    const pos = new Float32Array(N * N * 3); const col = new Float32Array(N * N * 3);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const o = (j * N + i) * 3;
      pos[o] = box.x0 + (box.x1 - box.x0) * i / (N - 1); pos[o + 1] = -12; pos[o + 2] = box.z0 + (box.z1 - box.z0) * j / (N - 1);
    }
    const idx = [];
    for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
      const a = j * N + i; const b = a + 1; const c = a + N; const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    g.setIndex(idx);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    terrain = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    terrainKey = ''; scene.add(terrain);
  }
  // the land follows the touches: a hill grows at every file the swarm has touched, as often as the log says
  function updateTerrain(st) {
    if (!terrain) return;
    let total = 0; const pts = [];
    for (const f of layout.files.values()) {
      const s = st.files.get(f.path); const t = s ? s.touches : 0;
      total += t; pts.push({ x: f.x, z: f.z, touches: t });
    }
    const key = total + ':' + st.files.size;
    if (key === terrainKey) return;
    terrainKey = key;
    const h = heightField(pts, box, TERRAIN_N);
    let peak = 1; for (let i = 0; i < h.length; i++) if (h[i] > peak) peak = h[i];
    const pos = terrain.geometry.attributes.position; const col = terrain.geometry.attributes.color;
    for (let i = 0; i < h.length; i++) {
      const v = h[i] / peak;
      pos.array[i * 3 + 1] = -12 + h[i] * 3.2;
      const c = heightColour(v); col.array[i * 3] = c[0]; col.array[i * 3 + 1] = c[1]; col.array[i * 3 + 2] = c[2];
    }
    pos.needsUpdate = true; col.needsUpdate = true;
  }
  function hashColour(key) { const h = hashN(key); return `hsl(${Math.round(300 + h * 60)} 70% ${Math.round(62 + hashN(key + 'l') * 12)}%)`; }

  // visible folders: those with a known file below them
  function updateTree(st) {
    if (st.files.size === known) return;
    known = st.files.size;
    // a folder is shown from the first moment a file below it is known; its growth starts then
    const shown = new Set(); dirFirst = new Map();
    for (const f of files) {
      const s = st.files.get(f.path);
      if (!s) continue;
      let k = f.dir;
      while (k != null) {
        if (!dirFirst.has(k) || s.knownAt < dirFirst.get(k)) dirFirst.set(k, s.knownAt);
        shown.add(k); const d = layout.dirs.get(k); k = d ? d.parent : null;
      }
    }
    const pts = [];
    for (const [key, { mesh }] of dirMeshes) {
      const d = layout.dirs.get(key);
      mesh.userData.shown = shown.has(key);
      if (shown.has(key) && d) { pts.push(layout.dirs.get(d.parent) || { x: 0, y: 0, z: 0 }, d); }
    }
    const pos = []; for (const p of pts) pos.push(p.x, p.y, p.z);
    edges.geometry.dispose(); edges.geometry = new THREE.BufferGeometry();
    edges.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  }

  // where an agent stands: next to the file, or next to its own colleague, or by its parent when idle
  // where a file is drawn: its cell in the comb, or its place in the landscape
  function fileAt(path) {
    if (mode === 'hive') { const c = cellMap && cellMap.get(path); return c ? { x: c.x, y: HIVE_Y, z: c.z } : null; }
    return layout.files.get(path) || null;
  }
  function home(a, st) {
    const p = a.parent && st.agents.get(a.parent);
    const base = a.parent === QUEEN || !p ? { x: 0, y: 14, z: 0 } : agentWhere(p, st);
    const ang = hashN(a.id) * Math.PI * 2;
    return { x: base.x + Math.cos(ang) * 24, y: base.y + 10, z: base.z + Math.sin(ang) * 24 };
  }
  function keyPlace(key, st, self) {
    if (!key) return null;
    const f = fileAt(key);
    if (f) return { x: f.x, y: f.y + (mode === 'hive' ? 6 : 9), z: f.z };
    const other = st.agents.get(key);
    if (other && other.id !== self.id) return home(other, st);
    return null;
  }
  function agentWhere(a, st) {
    if (posCache.has(a.id) && posCache.get(a.id).now === st.now) return posCache.get(a.id).p;
    const to = keyPlace(a.at, st, a) || home(a, st);
    const from = keyPlace(a.from, st, a) || home(a, st);
    const k = ease((st.now - a.atSince) / WALK_S);
    const p = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k + Math.sin(Math.min(1, k) * Math.PI) * 14, z: from.z + (to.z - from.z) * k };
    posCache.set(a.id, { now: st.now, p });
    return p;
  }

  function agentMesh(a, st) {
    let g = agentMeshes.get(a.id);
    if (g) return g;
    g = new THREE.Group();
    const c = colourOf(a.id, st.order);
    const body = new THREE.Mesh(sphere, mat(c, 0.5));
    body.scale.setScalar(a.id === QUEEN ? 9 : 5.5);
    body.userData = { kind: 'agent', id: a.id };
    const label = labelSprite(a.label, c, a.id === QUEEN ? 16 : 13);
    label.position.set(0, a.id === QUEEN ? 16 : 11, 0);
    g.add(body, label);
    g.userData = { body, label, id: a.id };
    agentGroup.add(g); agentMeshes.set(a.id, g);
    return g;
  }

  function fxLines(points, colour, opacity) {
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity, depthWrite: false }));
  }

  let lastSt = null;
  function updateHive(st) {
    if (!hiveMesh) return;
    const now = st.now;
    cellPaths.forEach((path, i) => {
      const c = cellMap.get(path); const s = st.files.get(path);
      dummy.position.set(c.x, HIVE_Y, c.z);
      if (!s) { dummy.scale.set(0.0001, 0.0001, 0.0001); }
      else {
        const grow = easeBack((now - s.knownAt) / APPEAR_S);
        const worked = Math.min(1, s.touches / 8);
        const h = Math.max(0.2, grow * (0.8 + Math.min(4, Math.sqrt(s.touches)) * 1.3));
        dummy.scale.set(Math.max(0.0001, grow), h, Math.max(0.0001, grow));
        const hot = s.lastT >= 0 && now - s.lastT < HOT_S;
        const base = s.state === 'deleted' ? [1, 0.35, 0.24] : [HONEY[0] + (GOLD[0] - HONEY[0]) * worked, HONEY[1] + (GOLD[1] - HONEY[1]) * worked, HONEY[2] + (GOLD[2] - HONEY[2]) * worked];
        const k = hot ? 1.35 : 1;
        const isSel = selected === 'file:' + path;
        hiveMesh.setColorAt(i, new THREE.Color(isSel ? 1 : Math.min(1, base[0] * k), isSel ? 1 : Math.min(1, base[1] * k), isSel ? 1 : Math.min(1, base[2] * k)));
      }
      dummy.updateMatrix(); hiveMesh.setMatrixAt(i, dummy.matrix);
    });
    hiveMesh.instanceMatrix.needsUpdate = true;
    if (hiveMesh.instanceColor) hiveMesh.instanceColor.needsUpdate = true;
  }
  function setMode(m) {
    if (m === mode || !rawLayout) { mode = m; return; }
    mode = m;
    terrain.visible = m === 'land'; dirGroup.visible = m === 'land'; fileGroup.visible = m === 'land';
    hiveGroup.visible = m === 'hive';
    if (m === 'hive') { camera.position.set(0, 420, 330); controls.target.set(0, 0, 0); }
    else { camera.position.set(0, 330, 470); controls.target.set(0, 0, 0); }
    setLayout(rawLayout); // the places of the agents and the trails follow the new view
  }
  function update(st) {
    lastSt = st;
    updateTree(st);
    updateTerrain(st);
    updateHive(st);
    terrain.visible = mode === 'land'; dirGroup.visible = mode === 'land'; fileGroup.visible = mode === 'land';
    const now = st.now;
    // files: grow in when first known, colour by their state, bright while recently touched
    for (const f of files) {
      const s = st.files.get(f.path);
      if (!s) { f.mesh.scale.setScalar(0.0001); continue; }
      const grow = easeBack((now - s.knownAt) / APPEAR_S);
      const hot = s.lastT >= 0 && now - s.lastT < HOT_S;
      const isSel = selected === 'file:' + f.path;
      const colour = FILE_COLOUR[s.state] || FILE_COLOUR.idle;
      f.mesh.material = mat(isSel ? '#ffffff' : colour, isSel ? 1 : hot ? 0.9 : 0.12);
      f.mesh.scale.setScalar(Math.max(0.0001, 2.2 * grow * (isSel ? 1.6 : 1)));
    }
    for (const [key, { mesh, depth }] of dirMeshes) {
      const shown = mesh.userData.shown;
      const grow = shown ? easeBack((now - (dirFirst.get(key) || 0)) / APPEAR_S) : 0;
      mesh.scale.setScalar(Math.max(0.0001, (7 - depth * 0.6) * grow));
    }
    // agents: walk to their place
    for (const a of st.agents.values()) {
      const g = agentMesh(a, st);
      const p = agentWhere(a, st);
      g.position.set(p.x, p.y, p.z);
      const isSel = selected === 'agent:' + a.id;
      g.userData.body.material = mat(colourOfAgent(a.id, st), isSel ? 1.2 : a.status === 'working' ? 0.75 : 0.25);
      g.userData.label.visible = true;
    }
    // effects: beams from agents to the files they act on, arcs for messages
    clearGroup(fxGroup);
    for (const act of st.actions) {
      const age = now - act.t;
      if (age < 0 || age > BEAM_S) continue;
      const a = st.agents.get(act.agent); const f = fileAt(act.path);
      if (!a || !f) continue;
      const A = agentWhere(a, st);
      const colour = FILE_COLOUR[act.kind] || FILE_COLOUR.read;
      fxGroup.add(fxLines([new THREE.Vector3(A.x, A.y, A.z), new THREE.Vector3(f.x, f.y + (mode === 'hive' ? 6 : 9), f.z)], colour, 1 - age / BEAM_S));
    }
    for (const a of st.agents.values()) {
      const pts = [];
      for (const q of a.path) {
        if (now - q.t > TRAIL_S || now - q.t < 0) continue;
        const place = keyPlace(q.key, st, a) || home(a, st);
        pts.push(new THREE.Vector3(place.x, place.y, place.z));
      }
      const cur = agentWhere(a, st);
      if (pts.length) { pts.push(new THREE.Vector3(cur.x, cur.y, cur.z)); fxGroup.add(fxLines(pts, colourOfAgent(a.id, st), 0.55)); }
    }
    for (const m of st.messages) {
      const age = now - m.t;
      if (age < 0 || age > ARC_S) continue;
      const a = st.agents.get(m.from); const b = st.agents.get(m.to);
      if (!a || !b) continue;
      const P = agentWhere(a, st); const Q = agentWhere(b, st);
      const mid = { x: (P.x + Q.x) / 2, y: Math.max(P.y, Q.y) + 40, z: (P.z + Q.z) / 2 };
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(P.x, P.y, P.z), new THREE.Vector3(mid.x, mid.y, mid.z), new THREE.Vector3(Q.x, Q.y, Q.z));
      fxGroup.add(fxLines(curve.getPoints(28), TONE_COLOUR[m.tone] || '#ffffff', 0.9 * (1 - age / ARC_S)));
    }
    // names of recently touched files (and the selected one) float above them
    const named = new Set();
    for (const f of files) {
      const s = st.files.get(f.path);
      if (!s || s.lastT < 0) continue;
      if (now - s.lastT < LABEL_S || selected === 'file:' + f.path) named.add(f.path);
    }
    for (const path of named) {
      let sp = fileLabels.get(path);
      const L = fileAt(path);
      if (!L) continue;
      if (!sp) { sp = labelSprite(path.split('/').pop(), '#f6e6c4', 11); fileLabels.set(path, sp); labelGroup.add(sp); }
      sp.position.set(L.x, L.y + (mode === 'hive' ? 16 : 14), L.z); sp.visible = true;
    }
    for (const [path, sp] of fileLabels) if (!named.has(path)) sp.visible = false;
  }

  // which thing a pixel shows: an agent body or a file (the one nearest the pointer wins)
  const ray = new THREE.Raycaster(); const ndc = new THREE.Vector2();
  function pick(clientX, clientY) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const targets = [];
    for (const g of agentMeshes.values()) targets.push(g.userData.body);
    if (mode === 'hive' && hiveMesh) {
      targets.push(hiveMesh);
      const agent = ray.intersectObjects(targets, false)[0];
      if (!agent) return null;
      if (agent.object === hiveMesh) return agent.instanceId != null && cellPaths[agent.instanceId] ? 'file:' + cellPaths[agent.instanceId] : null;
      return 'agent:' + agent.object.userData.id;
    }
    for (const f of files) if (f.mesh.scale.x > 0.5) targets.push(f.mesh);
    const hit = ray.intersectObjects(targets, false)[0];
    if (!hit) return null;
    const u = hit.object.userData;
    return u.kind === 'agent' ? 'agent:' + u.id : u.kind === 'file' ? 'file:' + u.path : null;
  }
  renderer.domElement.addEventListener('click', (e) => { const id = pick(e.clientX, e.clientY); if (onPick) onPick(id, e); });

  function resize() {
    const w = container.clientWidth || 800; const h = container.clientHeight || 500;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  // follow: the camera eases its target toward the work (presentation only, not part of the log)
  function frame(st, dt) {
    if (director && st) {
      // the director glides to the point it was given, keeping the reader's distance and angle
      const k = 1 - Math.exp(-dt * 1.6);
      const want = new THREE.Vector3(director.x, director.y, director.z);
      const step = want.clone().sub(controls.target).multiplyScalar(k);
      controls.target.add(step); camera.position.add(step);
    } else if (follow && st) {
      let x = 0; let y = 0; let z = 0; let n = 0;
      for (const a of st.agents.values()) { if (a.status !== 'working' && a.id !== QUEEN) continue; const p = agentWhere(a, st); x += p.x; y += p.y; z += p.z; n++; }
      if (n) { const k = 1 - Math.exp(-dt * 2); controls.target.lerp(new THREE.Vector3(x / n, y / n, z / n), k); }
    }
    controls.update();
    renderer.render(scene, camera);
  }

  window.addEventListener('resize', resize);
  resize();
  return {
    setLayout, update, frame, resize, pick, setMode, get mode() { return mode; },
    setSelected(id) { selected = id; },
    // where an agent is right now (the director and the caption use it)
    positionOf(id) { const a = lastSt && lastSt.agents.get(id); return a ? agentWhere(a, lastSt) : null; },
    setDirector(p) { director = p || null; },
    get directing() { return !!director; },
    setFollow(on) { follow = !!on; },
    get follow() { return follow; },
    resetView() { controls.target.set(0, 0, 0); camera.position.set(0, 330, 470); },
    dispose() { renderer.dispose(); },
  };
}
