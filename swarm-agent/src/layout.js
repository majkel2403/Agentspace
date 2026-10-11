// Where things stand in the scene. The whole workspace is laid out once from every path the run mentions (a scan or
// a touch), so the tree never jumps as files appear: a file appearing is an event, its place was always there.
//   folders: a radial tree, the root in the middle, each folder's sector in proportion to the files below it
//   files: on a ring around their folder, so a folder reads as a hub with its files around it
// The layout depends only on the set of paths and is deterministic (same paths, same picture).

export const RING = 70;      // distance between folder levels
const FILE_R = (n) => 7 + 1.9 * Math.sqrt(n); // ring radius for n files in one folder

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 1000) / 1000; }

export function buildLayout(paths) {
  const root = { key: '', name: '', parent: null, depth: 0, dirs: new Map(), files: [], leaves: 0 };
  const dirOf = new Map(); // key -> node
  dirOf.set('', root);
  for (const p of [...new Set(paths)].sort()) {
    const parts = p.split('/').filter(Boolean);
    if (!parts.length) continue;
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts.slice(0, i + 1).join('/');
      let d = dirOf.get(key);
      if (!d) { d = { key, name: parts[i], parent: node, depth: node.depth + 1, dirs: new Map(), files: [], leaves: 0 }; dirOf.set(key, d); node.dirs.set(parts[i], d); }
      node = d;
    }
    node.files.push(p);
  }
  // leaves: how many files lie below each folder (its share of the circle)
  const count = (n) => { let c = n.files.length; for (const d of n.dirs.values()) c += count(d); n.leaves = Math.max(1, c); return n.leaves; };
  count(root);
  const dirs = new Map(); const files = new Map();
  const place = (n, a0, a1) => {
    const mid = (a0 + a1) / 2;
    const r = n.depth * RING;
    n.x = r * Math.cos(mid); n.z = r * Math.sin(mid); n.y = n.depth ? -2 - hash(n.key) * 5 : 0;
    if (n.key) dirs.set(n.key, { key: n.key, name: n.name, parent: n.parent.key, depth: n.depth, x: n.x, y: n.y, z: n.z, files: n.files.length });
    // its files on a ring around it, starting at the side facing the parent
    const k = n.files.length;
    const fr = FILE_R(k);
    n.files.sort().forEach((p, i) => {
      const ang = mid + (k > 1 ? (i / k) * Math.PI * 2 : 0) + (k === 1 ? 0 : 0.2);
      const x = n.x + fr * Math.cos(ang); const z = n.z + fr * Math.sin(ang);
      files.set(p, { path: p, dir: n.key, x, y: n.y + 3 + hash(p) * 3, z });
    });
    // sub-folders split the sector by their share of the files
    let a = a0;
    const kids = [...n.dirs.values()].sort((u, v) => (u.name < v.name ? -1 : u.name > v.name ? 1 : 0));
    const total = kids.reduce((s, c) => s + c.leaves, 0) || 1;
    for (const c of kids) { const b = a + (a1 - a0) * c.leaves / total; place(c, a, b); a = b; }
  };
  place(root, 0, Math.PI * 2);
  root.x = 0; root.z = 0; root.y = 0;
  return { root: { key: '', x: 0, y: 0, z: 0 }, dirs, files };
}

// the place of a location key: a file path, an agent's id (next to it), or null (not computed here)
export function locate(layout, key, agentPos) {
  if (!key) return null;
  const f = layout.files.get(key);
  if (f) return { x: f.x, y: f.y, z: f.z };
  if (agentPos) return agentPos(key);
  return null;
}
