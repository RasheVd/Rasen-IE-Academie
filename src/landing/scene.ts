/**
 * Adegan WebGL halaman depan IE.Academie: satu buku terbuka di atas meja.
 * Sampul hardcover, halaman melengkung ke lipatan tengah, tepi kertas berlapis, baris teks, grafik kecil,
 * pita pembatas, dan satu halaman yang membalik. Cahaya utama + isi + kilau + cahaya tepi, bayangan lembut.
 * Tanpa pustaka luar. Seret untuk memutar; klik, Enter, atau Spasi untuk membalik halaman.
 */
type V3 = [number, number, number];

export function mountScene(canvas: HTMLCanvasElement, stage: HTMLElement, opts: { reduced: boolean; accent?: string }): (() => void) | null {
  const ctx = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'low-power' }) as WebGLRenderingContext | null;
  if (!ctx) return null;
  const gl: WebGLRenderingContext = ctx;
  const reduced = opts.reduced;

  /* ── Shader ─────────────────────────────────────────────── */
  const VS = `attribute vec3 aP;attribute vec3 aN;attribute vec3 aC;uniform mat4 uProj;uniform mat4 uView;uniform mat4 uModel;
varying vec3 vN;varying vec3 vP;varying vec3 vC;
void main(){vec4 w=uModel*vec4(aP,1.0);vP=w.xyz;vN=mat3(uModel)*aN;vC=aC;gl_Position=uProj*uView*w;}`;
  const FS = `precision mediump float;varying vec3 vN;varying vec3 vP;varying vec3 vC;uniform vec3 uEye;uniform vec3 uRim;
void main(){vec3 n=normalize(vN);vec3 v=normalize(uEye-vP);if(dot(n,v)<0.0)n=-n;
vec3 L1=normalize(vec3(-0.55,1.0,0.75));vec3 L2=normalize(vec3(0.8,0.45,-0.35));
float d1=max(dot(n,L1),0.0);float d2=max(dot(n,L2),0.0);
float sp=pow(max(dot(n,normalize(L1+v)),0.0),48.0)*0.16;
float rim=pow(1.0-max(dot(n,v),0.0),3.0)*0.16;
vec3 c=vC*(0.32+0.68*d1+0.16*d2)+vec3(sp)+uRim*rim;
gl_FragColor=vec4(pow(min(c,vec3(1.0)),vec3(0.92)),1.0);}`;
  const SVS = `attribute vec3 aP;uniform mat4 uProj;uniform mat4 uView;uniform mat4 uModel;varying vec2 vU;
void main(){vU=aP.xz;gl_Position=uProj*uView*uModel*vec4(aP,1.0);}`;
  const SFS = `precision mediump float;varying vec2 vU;uniform vec2 uSize;
void main(){vec2 q=vU/uSize;float d=length(q);float a=(1.0-smoothstep(0.3,1.0,d))*0.55;gl_FragColor=vec4(0.0,0.0,0.0,a);}`;

  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    return s;
  };
  const link = (vs: string, fs: string) => {
    const p = gl.createProgram()!; gl.attachShader(p, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
    return p;
  };
  let prog: WebGLProgram, sprog: WebGLProgram;
  try { prog = link(VS, FS); sprog = link(SVS, SFS); } catch { return null; }
  const U = (p: WebGLProgram, n: string) => gl.getUniformLocation(p, n);
  const loc = { P: gl.getAttribLocation(prog, 'aP'), N: gl.getAttribLocation(prog, 'aN'), C: gl.getAttribLocation(prog, 'aC'), proj: U(prog, 'uProj'), view: U(prog, 'uView'), model: U(prog, 'uModel'), eye: U(prog, 'uEye'), rim: U(prog, 'uRim') };
  const sloc = { P: gl.getAttribLocation(sprog, 'aP'), proj: U(sprog, 'uProj'), view: U(sprog, 'uView'), model: U(sprog, 'uModel'), size: U(sprog, 'uSize') };

  /* ── Warna ──────────────────────────────────────────────── */
  const hex = (h: string | undefined, fb: V3): V3 => (h && /^#[0-9a-f]{6}$/i.test(h) ? ([1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as V3) : fb);
  const red = hex(opts.accent, [0.85, 0.08, 0.17]);
  const mix = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const K = {
    cover: mix(red, [0.1, 0.02, 0.03], 0.3), coverEdge: mix(red, [0, 0, 0], 0.55),
    paper: [0.97, 0.94, 0.87] as V3, paperB: [0.86, 0.81, 0.71] as V3, paperC: [0.95, 0.91, 0.82] as V3,
    ink: [0.16, 0.16, 0.19] as V3, red, sheet: [0.99, 0.97, 0.91] as V3,
  };

  /* ── Geometri ───────────────────────────────────────────── */
  const W = 1.42, D = 2.0, T = 0.15, G = 0.012; // lebar halaman, panjang, tebal tumpukan, celah lipatan
  const prof = (u: number) => 0.012 + T * (1 - Math.pow(1 - u, 3.2)) * (1 - 0.1 * u * u);
  const slope = (u: number) => { const e = 1e-3; return (prof(Math.min(1, u + e)) - prof(Math.max(0, u - e))) / (2 * e) / W; };
  const X = (u: number, side: number) => side * (G + u * W);

  type Buf = number[];
  const vtx = (b: Buf, p: V3, n: V3, c: V3) => { b.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2]); };
  const norm = (v: V3): V3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const quadN = (b: Buf, a: V3, bb: V3, c: V3, d: V3, na: V3, nb: V3, nc: V3, nd: V3, col: V3 | V3[]) => {
    const cs = Array.isArray(col[0]) ? (col as V3[]) : [col as V3, col as V3, col as V3, col as V3];
    vtx(b, a, na, cs[0]); vtx(b, bb, nb, cs[1]); vtx(b, c, nc, cs[2]);
    vtx(b, a, na, cs[0]); vtx(b, c, nc, cs[2]); vtx(b, d, nd, cs[3]);
  };
  const quad = (b: Buf, a: V3, bb: V3, c: V3, d: V3, col: V3) => {
    const u: V3 = [bb[0] - a[0], bb[1] - a[1], bb[2] - a[2]], v: V3 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const n = norm([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]);
    quadN(b, a, bb, c, d, n, n, n, n, col);
  };
  const box = (b: Buf, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, top: V3, side: V3) => {
    quad(b, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], top);
    quad(b, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], side);
    quad(b, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], side);
    quad(b, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], side);
    quad(b, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], side);
    quad(b, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], side);
  };
  const S: Buf = [];
  const N = 40;
  // Sampul kiri-kanan dan punggung buku.
  box(S, -(G + W + 0.06), -0.004, -0.045, 0, -D / 2 - 0.07, D / 2 + 0.07, K.cover, K.coverEdge);
  box(S, 0.004, G + W + 0.06, -0.045, 0, -D / 2 - 0.07, D / 2 + 0.07, K.cover, K.coverEdge);
  box(S, -0.07, 0.07, -0.075, -0.02, -D / 2 - 0.07, D / 2 + 0.07, K.coverEdge, K.coverEdge);
  for (const side of [-1, 1]) {
    for (let i = 0; i < N; i++) {
      const u0 = i / N, u1 = (i + 1) / N;
      const p0 = prof(u0), p1 = prof(u1);
      const n0 = norm([-side * slope(u0), 1, 0]), n1 = norm([-side * slope(u1), 1, 0]);
      const c0 = mix(K.paperC, K.paper, Math.min(1, u0 * 3)), c1 = mix(K.paperC, K.paper, Math.min(1, u1 * 3));
      // Permukaan halaman melengkung.
      quadN(S, [X(u0, side), p0, D / 2], [X(u1, side), p1, D / 2], [X(u1, side), p1, -D / 2], [X(u0, side), p0, -D / 2], n0, n1, n1, n0, [c0, c1, c1, c0]);
      // Sisi depan dan belakang tumpukan kertas, berlapis.
      const L = 6;
      for (let k = 0; k < L; k++) {
        const col = k % 2 ? K.paperB : K.paperC;
        for (const zs of [1, -1]) {
          const z = zs * D / 2;
          quad(S, [X(u0, side), (p0 * k) / L, z], [X(u1, side), (p1 * k) / L, z], [X(u1, side), (p1 * (k + 1)) / L, z], [X(u0, side), (p0 * (k + 1)) / L, z], col);
        }
      }
    }
    // Tepi luar tumpukan kertas, berlapis.
    const top = prof(1), L = 8;
    for (let k = 0; k < L; k++) {
      const x = X(1, side);
      quad(S, [x, (top * k) / L, D / 2], [x, (top * k) / L, -D / 2], [x, (top * (k + 1)) / L, -D / 2], [x, (top * (k + 1)) / L, D / 2], k % 2 ? K.paperB : K.paperC);
    }
  }
  // Baris teks dan grafik mengikuti lengkung halaman.
  const strip = (side: number, ua: number, ub: number, z0: number, z1: number, col: V3, lift = 0.003) => {
    const steps = Math.max(2, Math.ceil((ub - ua) * 30));
    for (let i = 0; i < steps; i++) {
      const u0 = ua + ((ub - ua) * i) / steps, u1 = ua + ((ub - ua) * (i + 1)) / steps;
      const n0 = norm([-side * slope(u0), 1, 0]), n1 = norm([-side * slope(u1), 1, 0]);
      quadN(S, [X(u0, side), prof(u0) + lift, z1], [X(u1, side), prof(u1) + lift, z1], [X(u1, side), prof(u1) + lift, z0], [X(u0, side), prof(u0) + lift, z0], n0, n1, n1, n0, col);
    }
  };
  // Halaman kiri: judul merah, dua paragraf, subjudul.
  strip(-1, 0.16, 0.7, -0.78, -0.7, K.red);
  [0.92, 0.84, 0.88, 0.62].forEach((len, i) => strip(-1, 0.16, 0.16 + 0.7 * len, -0.58 + i * 0.13, -0.545 + i * 0.13, K.ink));
  [0.86, 0.9, 0.5].forEach((len, i) => strip(-1, 0.16, 0.16 + 0.7 * len, 0.0 + i * 0.13, 0.035 + i * 0.13, K.ink));
  strip(-1, 0.16, 0.42, 0.52, 0.58, K.red);
  // Halaman kanan: judul, paragraf, grafik batang naik.
  strip(1, 0.14, 0.6, -0.78, -0.7, K.red);
  [0.9, 0.78].forEach((len, i) => strip(1, 0.14, 0.14 + 0.72 * len, -0.58 + i * 0.13, -0.545 + i * 0.13, K.ink));
  strip(1, 0.14, 0.86, 0.66, 0.672, K.ink, 0.0035);
  ([[0.2, 0.18, K.ink], [0.36, 0.32, K.ink], [0.52, 0.48, K.red], [0.68, 0.64, K.red]] as [number, number, V3][])
    .forEach(([u, h, c]) => strip(1, u, u + 0.1, 0.66 - h * 1.4, 0.66, c, 0.0045));
  // Pita pembatas menjuntai dari tepi bawah.
  const ribbon: V3[] = [];
  const ru = 0.12;
  for (let i = 0; i <= 20; i++) { const z = -D / 2 + 0.02 + ((D - 0.02) * i) / 20; ribbon.push([X(ru, 1), prof(ru) + 0.006, z]); }
  for (let i = 1; i <= 8; i++) { const t = i / 8; ribbon.push([X(ru, 1) + 0.01 * t, prof(ru) + 0.006 - 0.32 * t * t, D / 2 + 0.06 * Math.sin(t * 1.4)]); }
  for (let i = 0; i < ribbon.length - 1; i++) {
    const a = ribbon[i], b = ribbon[i + 1], w = 0.035;
    quad(S, [a[0] - w, a[1], a[2]], [a[0] + w, a[1], a[2]], [b[0] + w, b[1], b[2]], [b[0] - w, b[1], b[2]], K.red);
  }
  const STATIC_COUNT = S.length / 9;

  const sbuf = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, sbuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(S), gl.STATIC_DRAW);
  const fbuf = gl.createBuffer()!;
  const SH = 1.25 * (G + W + 0.06), SD = 0.75 * D;
  const shadowBuf = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, shadowBuf);
  const sw = SH * 1.6, sd = SD * 1.6;
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-sw, -0.08, -sd, sw, -0.08, -sd, sw, -0.08, sd, -sw, -0.08, -sd, sw, -0.08, sd, -sw, -0.08, sd]), gl.STATIC_DRAW);

  // Halaman yang membalik: θ 0 (berbaring di kanan) sampai π (berbaring di kiri), melengkung saat terangkat.
  const SEG = 36;
  const flipGeo = (theta: number) => {
    const b: Buf = [];
    const pts: { x: number; y: number; phi: number }[] = [];
    let x = G, y = prof(0) + 0.006;
    const lift = Math.sin(theta);
    const wR = 1 - Math.min(1, theta / 0.35), wL = 1 - Math.min(1, (Math.PI - theta) / 0.35);
    for (let i = 0; i <= SEG; i++) {
      const s = i / SEG;
      const restR = Math.atan(slope(s)), restL = Math.PI - Math.atan(slope(s));
      const free = theta - 0.75 * lift * s * (theta < Math.PI / 2 ? 1 : -1);
      const phi = restR * wR + restL * wL + free * (1 - wR - wL);
      pts.push({ x, y, phi });
      if (i < SEG) { x += Math.cos(phi) * (W / SEG); y += Math.sin(phi) * (W / SEG); }
    }
    for (let i = 0; i < SEG; i++) {
      const a = pts[i], c = pts[i + 1];
      const na = norm([-Math.sin(a.phi), Math.cos(a.phi), 0]), nc = norm([-Math.sin(c.phi), Math.cos(c.phi), 0]);
      const z0 = -D / 2 + 0.015, z1 = D / 2 - 0.015;
      quadN(b, [a.x, a.y, z1], [c.x, c.y, z1], [c.x, c.y, z0], [a.x, a.y, z0], na, nc, nc, na, K.sheet);
    }
    return new Float32Array(b);
  };

  /* ── Matriks ────────────────────────────────────────────── */
  type M = number[];
  const ry = (a: number): M => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; };
  const persp = (f0: number, asp: number, n: number, f: number): M => { const f1 = 1 / Math.tan(f0 / 2), nf = 1 / (n - f); return [f1 / asp, 0, 0, 0, 0, f1, 0, 0, 0, 0, (f + n) * nf, -1, 0, 0, 2 * f * n * nf, 0]; };
  const lookAt = (e: V3, t: V3): M => {
    const z = norm([e[0] - t[0], e[1] - t[1], e[2] - t[2]]), x = norm([z[2], 0, -z[0]]), y: V3 = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]), -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]), -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]), 1];
  };

  /* ── Interaksi ──────────────────────────────────────────── */
  const BASE_PITCH = 0.66;
  let yaw = 0, pitch = BASE_PITCH, tYaw = 0, tPitch = BASE_PITCH;
  let drag = false, moved = 0, lx = 0, ly = 0, lastTouch = 0;
  let flipT = -1, flipFrom = 0, flipDir = 1, nextAuto = 3000;
  const flip = () => { if (flipT >= 0 || reduced) return; flipFrom = flipDir > 0 ? 0 : Math.PI; flipT = 0; flipDir = -flipDir; };
  const onDown = (e: PointerEvent) => { drag = true; moved = 0; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture?.(e.pointerId); lastTouch = performance.now(); };
  const onMove = (e: PointerEvent) => {
    if (drag) {
      const dx = e.clientX - lx, dy = e.clientY - ly; moved += Math.abs(dx) + Math.abs(dy); lx = e.clientX; ly = e.clientY;
      tYaw = Math.max(-0.9, Math.min(0.9, tYaw + dx * 0.008)); tPitch = Math.max(0.34, Math.min(1.05, tPitch + dy * 0.004));
      lastTouch = performance.now();
    } else if (!reduced && e.pointerType === 'mouse') {
      const r = stage.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1, ny = ((e.clientY - r.top) / r.height) * 2 - 1;
      tYaw = Math.max(-0.9, Math.min(0.9, nx * 0.16)); tPitch = BASE_PITCH + ny * 0.05;
    }
  };
  const onUp = () => { if (drag && moved < 6) flip(); drag = false; };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') flip();
    else if (e.key === 'ArrowLeft') tYaw = Math.max(-0.9, tYaw - 0.15);
    else if (e.key === 'ArrowRight') tYaw = Math.min(0.9, tYaw + 0.15);
    else if (e.key === 'ArrowUp') tPitch = Math.min(1.05, tPitch + 0.08);
    else if (e.key === 'ArrowDown') tPitch = Math.max(0.34, tPitch - 0.08);
    else return;
    e.preventDefault(); lastTouch = performance.now();
    if (reduced) { yaw = tYaw; pitch = tPitch; draw(performance.now()); }
  };
  stage.addEventListener('pointermove', onMove); canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp); canvas.addEventListener('keydown', onKey);

  let visible = true;
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; }, { threshold: 0.01 });
  io.observe(canvas);

  /* ── Gambar ─────────────────────────────────────────────── */
  const resize = () => {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.floor(r.width * dpr)), h = Math.max(2, Math.floor(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  const bindMesh = (buf: WebGLBuffer) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc.P); gl.vertexAttribPointer(loc.P, 3, gl.FLOAT, false, 36, 0);
    gl.enableVertexAttribArray(loc.N); gl.vertexAttribPointer(loc.N, 3, gl.FLOAT, false, 36, 12);
    gl.enableVertexAttribArray(loc.C); gl.vertexAttribPointer(loc.C, 3, gl.FLOAT, false, 36, 24);
  };
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  let last = 0;
  function draw(now: number) {
    resize();
    const dt = last ? Math.min(64, now - last) : 16; last = now;
    yaw += (tYaw - yaw) * (reduced ? 1 : 0.06); pitch += (tPitch - pitch) * (reduced ? 1 : 0.06);
    const sway = reduced ? 0 : Math.sin(now * 0.00035) * 0.07;
    const aspect = canvas.width / canvas.height;
    const fov = 0.6;
    // Jarak kamera menyesuaikan lebar kanvas supaya buku selalu muat.
    const halfW = G + W + 0.12;
    const dist = Math.max(4.6, (halfW / Math.tan(fov / 2) / aspect) * 1.34, (D * 0.8) / Math.tan(fov / 2));
    const target: V3 = [0, 0.0, 0.12];
    const eye: V3 = [0, target[1] + dist * Math.sin(pitch), target[2] + dist * Math.cos(pitch)];
    const proj = persp(fov, aspect, 0.1, 50), view = lookAt(eye, target);
    const model = ry(yaw + sway);

    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // Bayangan lembut di bawah buku.
    gl.useProgram(sprog); gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniformMatrix4fv(sloc.proj, false, new Float32Array(proj)); gl.uniformMatrix4fv(sloc.view, false, new Float32Array(view)); gl.uniformMatrix4fv(sloc.model, false, new Float32Array(model));
    gl.uniform2f(sloc.size, sw, sd);
    gl.disableVertexAttribArray(loc.N); gl.disableVertexAttribArray(loc.C);
    gl.bindBuffer(gl.ARRAY_BUFFER, shadowBuf); gl.enableVertexAttribArray(sloc.P); gl.vertexAttribPointer(sloc.P, 3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    // Buku.
    gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.useProgram(prog);
    gl.uniformMatrix4fv(loc.proj, false, new Float32Array(proj)); gl.uniformMatrix4fv(loc.view, false, new Float32Array(view)); gl.uniformMatrix4fv(loc.model, false, new Float32Array(model));
    gl.uniform3f(loc.eye, eye[0], eye[1], eye[2]); gl.uniform3f(loc.rim, Math.min(1, K.red[0] + 0.15), K.red[1] + 0.2, K.red[2] + 0.25);
    bindMesh(sbuf); gl.drawArrays(gl.TRIANGLES, 0, STATIC_COUNT);
    // Halaman membalik.
    if (!reduced) {
      if (flipT < 0 && now - lastTouch > 4000 && now > nextAuto) { flip(); nextAuto = now + 7000; }
      if (flipT >= 0) {
        flipT = Math.min(1, flipT + dt / 1500);
        const e = ease(flipT), theta = flipFrom === 0 ? e * Math.PI : Math.PI - e * Math.PI;
        const geo = flipGeo(Math.max(0.0001, Math.min(Math.PI - 0.0001, theta)));
        gl.bindBuffer(gl.ARRAY_BUFFER, fbuf); gl.bufferData(gl.ARRAY_BUFFER, geo, gl.DYNAMIC_DRAW);
        bindMesh(fbuf); gl.drawArrays(gl.TRIANGLES, 0, geo.length / 9);
        if (flipT >= 1) flipT = -1;
      }
    }
  }

  let raf = 0, stopped = false;
  const frame = (t: number) => { if (stopped) return; if (!document.hidden && visible) draw(t); raf = requestAnimationFrame(frame); };
  const ro = new ResizeObserver(() => { if (reduced) draw(performance.now()); });
  ro.observe(canvas);
  if (reduced) draw(performance.now()); else raf = requestAnimationFrame(frame);

  return () => {
    stopped = true; cancelAnimationFrame(raf); io.disconnect(); ro.disconnect();
    stage.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointerup', onUp); canvas.removeEventListener('keydown', onKey);
    [sbuf, fbuf, shadowBuf].forEach((b) => gl.deleteBuffer(b));
    gl.deleteProgram(prog); gl.deleteProgram(sprog);
  };
}
