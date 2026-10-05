// Deterministic 3D placement of workflow nodes.
// A node's target position depends only on its parent's position, its kind and its birth order among
// its siblings (n.idx) — never on later events — so a node never jumps when the graph grows or when
// the timeline is scrubbed. Leaves (files, resources, tests) form "dandelion" spheres around their
// parent, like the radial clusters of Gource; agents spread around Hermes; tools fan out from agents.

export function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const GA = Math.PI * (3 - Math.sqrt(5)); // golden angle
const PHI = 0.6180339887498949;

// well spread directions for agents: a golden spiral biased towards the horizontal plane
function agentDir(i, out) {
  const y = Math.sin(((i * PHI) % 1 - 0.5) * 1.6) * 0.55;
  const r = Math.sqrt(1 - y * y);
  const a = i * GA * 1.0 + 0.6;
  out[0] = Math.cos(a) * r; out[1] = y; out[2] = Math.sin(a) * r;
  return out;
}
// i-th point of an unbounded low-discrepancy sequence on the unit sphere
function sphereDir(i, seed, out) {
  const y = 1 - 2 * ((i * PHI + (seed % 997) / 997) % 1);
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const a = i * GA + (seed % 628) / 100;
  out[0] = Math.cos(a) * r; out[1] = y; out[2] = Math.sin(a) * r;
  return out;
}
function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  v[0] /= l; v[1] /= l; v[2] /= l;
  return v;
}

export const DIST = { planner: 70, agent: 190, tool: 78, file: 30, resource: 34, test: 30, memory: 120, gateway: 230, result: 95, user: 260 };

/**
 * layout(state, cache) -> { [id]: [x, y, z] } (targets). Pass the previous cache to reuse positions.
 */
export function layout(state, cache) {
  const P = cache || {};
  const T = [0, 0, 0];
  const U = [0, 0, 0];
  for (const id of state.order) {
    if (P[id]) continue;
    const n = state.nodes[id];
    const par = n.parent && P[n.parent] ? P[n.parent] : null;
    const h = hash(id);
    if (n.kind === 'hermes' || !par) {
      if (n.kind === 'user') P[id] = [-150, 215, -130];
      else P[id] = [0, 0, 0];
      continue;
    }
    const px = par[0]; const py = par[1]; const pz = par[2];
    if (n.kind === 'planner') { P[id] = [px + 10, py + DIST.planner, pz - 20]; continue; }
    if (n.kind === 'memory') { P[id] = [px - 40, py - DIST.memory, pz + 50]; continue; }
    if (n.kind === 'result') { P[id] = [px + 20, py + DIST.result + 40, pz + 30]; continue; }
    if (n.kind === 'agent') {
      agentDir(n.idx + (state.nodes[n.parent] && state.nodes[n.parent].kind === 'planner' ? 0 : 3), T);
      const d = DIST.agent * (1 + 0.12 * ((h % 7) / 7));
      // agents hang around the core (the planner is just above it)
      P[id] = [T[0] * d, T[1] * d * 0.7, T[2] * d];
      continue;
    }
    if (n.kind === 'gateway') {
      agentDir(n.idx + 7, T);
      const ga = 2.4 + n.idx * 0.9;
      P[id] = [Math.cos(ga) * DIST.gateway * 0.8, -150, Math.sin(ga) * DIST.gateway * 0.8];
      continue;
    }
    // outward direction from the grandparent (or the core) through the parent
    const gp = state.nodes[n.parent] && state.nodes[n.parent].parent && P[state.nodes[n.parent].parent] ? P[state.nodes[n.parent].parent] : [0, 0, 0];
    U[0] = px - gp[0]; U[1] = py - gp[1]; U[2] = pz - gp[2];
    norm(U);
    if (n.kind === 'tool') {
      // fan inside a cone around the outward direction
      sphereDir(n.idx, h, T);
      const k = 0.62;
      T[0] = U[0] + T[0] * k; T[1] = U[1] + T[1] * k; T[2] = U[2] + T[2] * k;
      norm(T);
      const d = DIST.tool * (1 + 0.15 * (n.idx % 3));
      P[id] = [px + T[0] * d, py + T[1] * d, pz + T[2] * d];
      continue;
    }
    // leaves: dandelion shell around the parent, slightly pushed outwards
    sphereDir(n.idx, hash(n.parent), T);
    T[0] += U[0] * 0.55; T[1] += U[1] * 0.55; T[2] += U[2] * 0.55;
    norm(T);
    const shell = Math.floor(n.idx / 28);
    const d = (DIST[n.kind] || 30) + shell * 9;
    P[id] = [px + T[0] * d, py + T[1] * d, pz + T[2] * d];
  }
  return P;
}
