// The honeycomb: every file is a cell of a hexagonal comb, placed as near as possible to where the workspace layout
// puts it. Pointy-top axial coordinates; cells are taken in path order, so the same workspace always gives the same
// comb. A folder keeps its neighbours together because the layout puts them together.
export const CELL = 9; // distance from a cell centre to a corner, world units

const SQ3 = Math.sqrt(3);
// world (x, z) to fractional axial (q, r)
function toAxial(x, z) { return { q: (SQ3 / 3 * x - z / 3) / CELL, r: (2 / 3 * z) / CELL }; }
// round fractional axial to the nearest cell (through cube coordinates)
function roundAxial(q, r) {
  let x = q; let z = r; let y = -x - z;
  let rx = Math.round(x); let ry = Math.round(y); let rz = Math.round(z);
  const dx = Math.abs(rx - x); const dy = Math.abs(ry - y); const dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
  return { q: rx, r: rz };
}
// the world centre of a cell
export function cellCentre(q, r) { return { x: CELL * SQ3 * (q + r / 2), z: CELL * 1.5 * r }; }
const SPIRAL = [[0, 0]];
for (let k = 1; k <= 12; k++) { // rings of the hexagonal spiral around a cell
  let q = -k; let r = k;
  for (const [dq, dr] of [[1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1]]) for (let i = 0; i < k; i++) { SPIRAL.push([q, r]); q += dq; r += dr; }
}

// files (path -> world place) to cells: returns Map path -> { q, r, x, z }
export function hiveCells(placeOf, paths) {
  const taken = new Set(); const out = new Map();
  const order = [...paths].sort();
  for (const p of order) {
    const pl = placeOf(p);
    if (!pl) continue;
    const a = roundAxial(toAxial(pl.x, pl.z).q, toAxial(pl.x, pl.z).r);
    let placed = null;
    for (const [dq, dr] of SPIRAL) {
      const q = a.q + dq; const r = a.r + dr; const key = q + ',' + r;
      if (!taken.has(key)) { taken.add(key); placed = { q, r }; break; }
    }
    const c = cellCentre(placed.q, placed.r);
    out.set(p, { q: placed.q, r: placed.r, x: c.x, z: c.z });
  }
  return out;
}
