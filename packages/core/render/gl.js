// WebGL backend: one shader, screen-space quads, additive blending. No libraries.
import { SHAPE } from './prims.js';

const VS = `
attribute vec2 aPos; attribute vec2 aUv; attribute vec4 aCol; attribute float aShape;
uniform vec2 uRes;
varying vec2 vUv; varying vec4 vCol; varying float vShape;
void main(){ vUv=aUv; vCol=aCol; vShape=aShape; vec2 c=(aPos/uRes)*2.0-1.0; gl_Position=vec4(c.x,-c.y,0.0,1.0); }`;
const FS = `
precision mediump float;
varying vec2 vUv; varying vec4 vCol; varying float vShape;
void main(){
  float d=length(vUv); float a=0.0; vec3 col=vCol.rgb;
  if(vShape<0.5){ a=exp(-d*d*4.2)*(1.0-smoothstep(0.85,1.0,d)); }
  else if(vShape<1.5){ float core=1.0-smoothstep(0.30,0.42,d); float halo=exp(-d*d*6.0)*0.55*(1.0-smoothstep(0.9,1.0,d)); a=max(core,halo); col=mix(col,vec3(1.0),core*0.35*(1.0-d)); }
  else if(vShape<2.5){ a=(1.0-smoothstep(0.0,0.09,abs(d-0.86)))+exp(-pow((d-0.86)*7.0,2.0))*0.35; }
  else if(vShape<3.5){ float v=abs(vUv.y); a=1.0-smoothstep(0.35,1.0,v); }
  else if(vShape<4.5){ vec2 p=abs(vUv); float h=max(p.x*0.866+p.y*0.5,p.y); float body=1.0-smoothstep(0.52,0.6,h); float edge=1.0-smoothstep(0.0,0.06,abs(h-0.56)); float halo=exp(-d*d*5.0)*0.35; a=max(max(body*0.55,edge),halo); col=mix(col,vec3(1.0),edge*0.5); }
  else if(vShape<5.5){ float h=abs(vUv.x)+abs(vUv.y); float body=1.0-smoothstep(0.55,0.62,h); float halo=exp(-d*d*5.0)*0.4; a=max(body*0.85,halo); col=mix(col,vec3(1.0),body*0.25); }
  else { float core=1.0-smoothstep(0.18,0.34,d); float halo=exp(-d*d*3.0)*0.8*(1.0-smoothstep(0.92,1.0,d)); a=max(core,halo); col=mix(col,vec3(1.0),core*0.8); }
  a*=vCol.a; if(a<0.002) discard; gl_FragColor=vec4(col*a,a);
}`;

export function createGL(canvas) {
  let gl = null;
  try { gl = canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: false }); } catch (e) { gl = null; }
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = gl.createProgram();
  try {
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) { return null; }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  const loc = { pos: gl.getAttribLocation(prog, 'aPos'), uv: gl.getAttribLocation(prog, 'aUv'), col: gl.getAttribLocation(prog, 'aCol'), shape: gl.getAttribLocation(prog, 'aShape'), res: gl.getUniformLocation(prog, 'uRes') };
  let V = new Float32Array(9 * 6 * 8192);
  const STRIDE = 9 * 4;
  return {
    kind: 'webgl',
    draw(P, W, H, dpr, bg) {
      const cw = Math.round(W * dpr);
      const ch = Math.round(H * dpr);
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      gl.viewport(0, 0, cw, ch);
      gl.clearColor(bg[0], bg[1], bg[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const need = (P.ns + P.nl) * 6 * 9;
      if (need > V.length) V = new Float32Array(need * 1.5);
      let o = 0;
      const put = (x, y, u, v, r, g, b, a, s) => { V[o++] = x * dpr; V[o++] = y * dpr; V[o++] = u; V[o++] = v; V[o++] = r; V[o++] = g; V[o++] = b; V[o++] = a; V[o++] = s; };
      const L = P.lines();
      for (let i = 0; i < P.nl; i++) {
        const k = i * 13;
        const x1 = L[k]; const y1 = L[k + 1]; const x2 = L[k + 2]; const y2 = L[k + 3]; const w = L[k + 4] * 0.5 + 0.6;
        let nx = y1 - y2; let ny = x2 - x1; const len = Math.hypot(nx, ny) || 1; nx = (nx / len) * w; ny = (ny / len) * w;
        const r1 = L[k + 5]; const g1 = L[k + 6]; const b1 = L[k + 7]; const a1 = L[k + 8]; const r2 = L[k + 9]; const g2 = L[k + 10]; const b2 = L[k + 11]; const a2 = L[k + 12];
        put(x1 + nx, y1 + ny, 0, 1, r1, g1, b1, a1, SHAPE.LINE); put(x1 - nx, y1 - ny, 0, -1, r1, g1, b1, a1, SHAPE.LINE); put(x2 + nx, y2 + ny, 1, 1, r2, g2, b2, a2, SHAPE.LINE);
        put(x1 - nx, y1 - ny, 0, -1, r1, g1, b1, a1, SHAPE.LINE); put(x2 - nx, y2 - ny, 1, -1, r2, g2, b2, a2, SHAPE.LINE); put(x2 + nx, y2 + ny, 1, 1, r2, g2, b2, a2, SHAPE.LINE);
      }
      const S = P.sprites();
      for (let i = 0; i < P.ns; i++) {
        const k = i * 8;
        const x = S[k]; const y = S[k + 1]; const r = S[k + 2]; const cr = S[k + 3]; const cg = S[k + 4]; const cb = S[k + 5]; const a = S[k + 6]; const s = S[k + 7];
        put(x - r, y - r, -1, -1, cr, cg, cb, a, s); put(x + r, y - r, 1, -1, cr, cg, cb, a, s); put(x + r, y + r, 1, 1, cr, cg, cb, a, s);
        put(x - r, y - r, -1, -1, cr, cg, cb, a, s); put(x + r, y + r, 1, 1, cr, cg, cb, a, s); put(x - r, y + r, -1, 1, cr, cg, cb, a, s);
      }
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, V.subarray(0, o), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(loc.pos); gl.vertexAttribPointer(loc.pos, 2, gl.FLOAT, false, STRIDE, 0);
      gl.enableVertexAttribArray(loc.uv); gl.vertexAttribPointer(loc.uv, 2, gl.FLOAT, false, STRIDE, 8);
      gl.enableVertexAttribArray(loc.col); gl.vertexAttribPointer(loc.col, 4, gl.FLOAT, false, STRIDE, 16);
      gl.enableVertexAttribArray(loc.shape); gl.vertexAttribPointer(loc.shape, 1, gl.FLOAT, false, STRIDE, 32);
      gl.uniform2f(loc.res, cw, ch);
      gl.drawArrays(gl.TRIANGLES, 0, o / 9);
    },
  };
}
