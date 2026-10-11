// The landscape of attention: a height field over the workspace. Every file adds a soft hill whose height is how many
// times the swarm touched it up to the log time. It is a pure function of the state, so scrubbing shows the same land.
const SIGMA = 28; // hill radius in world units

// heights for an n×n grid covering the box (x0..x1, z0..z1); files: [{x, z, touches}]
export function heightField(files, box, n = 72) {
  const h = new Float32Array(n * n);
  const sx = (box.x1 - box.x0) / (n - 1) || 1; const sz = (box.z1 - box.z0) / (n - 1) || 1;
  const reach = SIGMA * 2.5;
  for (const f of files) {
    if (!f.touches) continue;
    const gi = Math.round((f.x - box.x0) / sx); const gj = Math.round((f.z - box.z0) / sz);
    const ri = Math.ceil(reach / sx); const rj = Math.ceil(reach / sz);
    for (let j = Math.max(0, gj - rj); j <= Math.min(n - 1, gj + rj); j++) {
      for (let i = Math.max(0, gi - ri); i <= Math.min(n - 1, gi + ri); i++) {
        const dx = box.x0 + i * sx - f.x; const dz = box.z0 + j * sz - f.z;
        h[j * n + i] += f.touches * Math.exp(-(dx * dx + dz * dz) / (2 * SIGMA * SIGMA));
      }
    }
  }
  return h;
}

// a colour for a height, from the ground (dark plum) through violet to the accent pink and hot yellow
export function heightColour(v) {
  const t = Math.min(1, Math.max(0, v));
  const stops = [[0.03, 0.02, 0.06], [0.28, 0.12, 0.45], [1, 0.18, 0.43], [1, 0.82, 0.4]];
  const k = t * (stops.length - 1); const i = Math.min(stops.length - 2, Math.floor(k)); const f = k - i;
  return stops[i].map((c, j) => c + (stops[i + 1][j] - c) * f);
}
