// Primitive buffer shared by the WebGL and Canvas 2D backends.
// Everything the scene draws is a screen-space sprite or a line segment; blending is additive.
export const SHAPE = { GLOW: 0, DOT: 1, RING: 2, LINE: 3, HEX: 4, DIAMOND: 5, CORE: 6 };

const RGB = {};
export function rgb(hex) {
  let c = RGB[hex];
  if (!c) {
    const n = parseInt(hex.slice(1), 16);
    c = RGB[hex] = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  return c;
}
export function mix(a, b, k) {
  const x = rgb(a);
  const y = rgb(b);
  const h = (i) => ('0' + Math.round((x[i] + (y[i] - x[i]) * k) * 255).toString(16)).slice(-2);
  return '#' + h(0) + h(1) + h(2);
}

// sprites: x, y, radius, r, g, b, a, shape  (8 floats)
// lines:   x1, y1, x2, y2, width, r1, g1, b1, a1, r2, g2, b2, a2 (13 floats)
export function createPrims() {
  let S = new Float32Array(8 * 4096);
  let L = new Float32Array(13 * 4096);
  const P = { ns: 0, nl: 0 };
  P.sprites = () => S;
  P.lines = () => L;
  P.reset = () => { P.ns = 0; P.nl = 0; };
  P.sprite = (x, y, r, hex, a, shape) => {
    if (!(r > 0.2) || !(a > 0.003) || !Number.isFinite(x) || !Number.isFinite(y)) return;
    if (P.ns * 8 + 8 > S.length) { const n = new Float32Array(S.length * 2); n.set(S); S = n; }
    const c = rgb(hex);
    const o = P.ns * 8;
    S[o] = x; S[o + 1] = y; S[o + 2] = r; S[o + 3] = c[0]; S[o + 4] = c[1]; S[o + 5] = c[2]; S[o + 6] = a > 1 ? 1 : a; S[o + 7] = shape || 0;
    P.ns++;
  };
  P.line = (x1, y1, x2, y2, w, hex1, a1, hex2, a2) => {
    if (!(w > 0.05) || !Number.isFinite(x1 + y1 + x2 + y2)) return;
    if ((a1 || 0) < 0.003 && (a2 == null ? a1 : a2) < 0.003) return;
    if (P.nl * 13 + 13 > L.length) { const n = new Float32Array(L.length * 2); n.set(L); L = n; }
    const c1 = rgb(hex1);
    const c2 = rgb(hex2 || hex1);
    const o = P.nl * 13;
    L[o] = x1; L[o + 1] = y1; L[o + 2] = x2; L[o + 3] = y2; L[o + 4] = w;
    L[o + 5] = c1[0]; L[o + 6] = c1[1]; L[o + 7] = c1[2]; L[o + 8] = a1 > 1 ? 1 : a1;
    L[o + 9] = c2[0]; L[o + 10] = c2[1]; L[o + 11] = c2[2]; L[o + 12] = (a2 == null ? a1 : a2) > 1 ? 1 : a2 == null ? a1 : a2;
    P.nl++;
  };
  return P;
}
