/**
 * Adegan WebGL halaman depan IE.Academie: buku terbuka, pecahan grafis bersudut, bintang, dan cincin pita kertas.
 * Diadaptasi dari "Academie Interactive 3D Starter Kit" (geometri orisinal, tanpa pustaka luar).
 * Mengikuti pointer, bisa diseret, dan panah keyboard; berhenti saat tab tersembunyi atau kanvas di luar layar.
 */
type V3 = [number, number, number];
type Geo = { pos: number[]; nor: number[]; col: number[] };

export function mountScene(canvas: HTMLCanvasElement, stage: HTMLElement, opts: { reduced: boolean; accent?: string }): (() => void) | null {
  const gl = (canvas.getContext('webgl2', { alpha: true, antialias: true, powerPreference: 'low-power' })
    || canvas.getContext('webgl', { alpha: true, antialias: true, powerPreference: 'low-power' })) as WebGLRenderingContext | null;
  if (!gl) return null;
  const reduced = opts.reduced;

  const vs = 'attribute vec3 a_position;attribute vec3 a_normal;attribute vec3 a_color;uniform mat4 u_projection;uniform mat4 u_model;varying vec3 v_color;varying float v_lit;void main(){vec3 n=normalize((u_model*vec4(a_normal,0.0)).xyz);v_lit=.74+.26*max(dot(n,normalize(vec3(-.35,.8,.7))),0.0);v_color=a_color;gl_Position=u_projection*u_model*vec4(a_position,1.0);}';
  const fs = 'precision mediump float;varying vec3 v_color;varying float v_lit;void main(){gl_FragColor=vec4(v_color*v_lit,1.0);}';
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    return s;
  };
  let program: WebGLProgram;
  try {
    program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'link');
    gl.useProgram(program);
  } catch { return null; }
  const A = {
    pos: gl.getAttribLocation(program, 'a_position'), normal: gl.getAttribLocation(program, 'a_normal'), color: gl.getAttribLocation(program, 'a_color'),
    proj: gl.getUniformLocation(program, 'u_projection'), model: gl.getUniformLocation(program, 'u_model'),
  };
  const hex = (h: string | undefined, fb: V3): V3 => (h && /^#[0-9a-f]{6}$/i.test(h) ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as V3 : fb);
  const red = hex(opts.accent, [0.9, 0.06, 0.16]);
  const C: Record<string, V3> = { red, deepRed: red.map((c) => c * 0.5) as V3, white: [1, 0.99, 0.95], black: [0.02, 0.02, 0.03], grey: [0.27, 0.24, 0.27] };

  const E = (): Geo => ({ pos: [], nor: [], col: [] });
  const tri = (g: Geo, a: V3, b: V3, c: V3, col: V3) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(n[0], n[1], n[2]) || 1; n = n.map((x) => x / l);
    for (const p of [a, b, c]) { g.pos.push(...p); g.nor.push(...n); g.col.push(...col); }
  };
  const quad = (g: Geo, a: V3, b: V3, c: V3, d: V3, col: V3) => { tri(g, a, b, c, col); tri(g, a, c, d, col); };
  const box = (w: number, h: number, d: number, color: V3, other?: V3) => {
    const g = E(), x = w / 2, y = h / 2, z = d / 2;
    const f: V3[] = [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]], r: V3[] = [[-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z]];
    quad(g, f[0], f[1], f[2], f[3], color); quad(g, r[1], r[0], r[3], r[2], other ?? color);
    for (let i = 0; i < 4; i++) { const k = (i + 1) % 4; quad(g, r[i], r[k], f[k], f[i], other ?? color); }
    return g;
  };
  const polygon = (pts: [number, number][], depth: number, col: V3, side: V3 = col) => {
    const g = E(), cx = pts.reduce((a, p) => a + p[0] / pts.length, 0), cy = pts.reduce((a, p) => a + p[1] / pts.length, 0);
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length, h = depth / 2;
      tri(g, [cx, cy, h], [pts[i][0], pts[i][1], h], [pts[j][0], pts[j][1], h], col);
      tri(g, [cx, cy, -h], [pts[j][0], pts[j][1], -h], [pts[i][0], pts[i][1], -h], side);
      quad(g, [pts[i][0], pts[i][1], h], [pts[i][0], pts[i][1], -h], [pts[j][0], pts[j][1], -h], [pts[j][0], pts[j][1], h], side);
    }
    return g;
  };
  const star = (n = 5, r = 1, ri = 0.47) => {
    const p: [number, number][] = [];
    for (let i = 0; i < n * 2; i++) { const a = Math.PI / 2 + (i * Math.PI) / n, rr = i % 2 ? ri : r; p.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
    return p.reverse();
  };
  type M = number[];
  const I = (): M => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const mul = (a: M, b: M) => { const r = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let row = 0; row < 4; row++) for (let k = 0; k < 4; k++) r[c * 4 + row] += a[k * 4 + row] * b[c * 4 + k]; return r; };
  const tr = (x: number, y: number, z: number) => { const m = I(); m[12] = x; m[13] = y; m[14] = z; return m; };
  const rx = (a: number) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; };
  const ry = (a: number) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; };
  const rz = (a: number) => { const c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; };
  const persp = (f0: number, asp: number, n: number, f: number) => { const f1 = 1 / Math.tan(f0 / 2), nf = 1 / (n - f); return [f1 / asp, 0, 0, 0, 0, f1, 0, 0, 0, 0, (f + n) * nf, -1, 0, 0, 2 * f * n * nf, 0]; };

  const buffers: WebGLBuffer[] = [];
  const upload = (g: Geo) => {
    const bs = [g.pos, g.nor, g.col].map((d) => { const b = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(d), gl.STATIC_DRAW); buffers.push(b); return b; });
    return { bs, count: g.pos.length / 3 };
  };
  const world: { mesh: ReturnType<typeof upload>; x: number; y: number; z: number; rz: number; ry: number; rx: number; bob: number }[] = [];
  const add = (g: Geo, x: number, y: number, z: number, rZ = 0, rY = 0, rX = 0, bob = 0) => world.push({ mesh: upload(g), x, y, z, rz: rZ, ry: rY, rx: rX, bob });

  // Buku terbuka sebagai pusat, dengan baris "teks" merah dan hitam.
  add(box(1.23, 1.66, 0.14, C.white, C.black), -0.6, 0.05, 0.62, -0.12, -0.48, 0.07, 1);
  add(box(1.23, 1.66, 0.14, C.white, C.black), 0.6, 0.05, 0.62, 0.12, 0.48, -0.07, 1);
  add(box(0.13, 1.91, 0.25, C.red, C.red), 0, 0.06, 0.72, 0, 0, 0, 1);
  add(box(1, 0.09, 0.035, C.red), -0.63, 0.5, 0.78, -0.1, -0.46, 0, 1);
  add(box(0.88, 0.08, 0.035, C.black), -0.61, 0.22, 0.8, -0.1, -0.46, 0, 1);
  add(box(0.73, 0.08, 0.035, C.black), -0.6, 0.02, 0.82, -0.1, -0.46, 0, 1);
  add(box(0.97, 0.09, 0.035, C.red), 0.59, 0.45, 0.82, 0.12, 0.49, 0, 1);
  add(box(0.85, 0.08, 0.035, C.black), 0.62, 0.19, 0.8, 0.12, 0.48, 0, 1);
  add(box(0.63, 0.08, 0.035, C.black), 0.64, -0.02, 0.81, 0.12, 0.48, 0, 1);
  // Grafik naik di halaman kanan: tiga batang (progres belajar).
  add(box(0.12, 0.2, 0.04, C.red), 0.42, -0.42, 0.84, 0.12, 0.48, 0, 1);
  add(box(0.12, 0.34, 0.04, C.red), 0.6, -0.35, 0.84, 0.12, 0.48, 0, 1);
  add(box(0.12, 0.5, 0.04, C.black), 0.78, -0.27, 0.84, 0.12, 0.48, 0, 1);
  // Pecahan grafis bersudut di sekeliling.
  add(polygon([[-1.2, -0.18], [-0.83, -0.32], [0.17, 0.24], [0.7, 0.72], [0.49, 0.92], [-0.2, 0.68]], 0.2, C.red, C.deepRed), -1.9, 1.05, -0.75, -0.48, 0.1, 0, 1);
  add(polygon([[-0.83, -0.16], [0.83, -0.29], [1.23, 0.11], [0.5, 0.39], [0.11, 0.14]], 0.18, C.black, C.grey), 1.7, -1.25, -0.66, 0.38, -0.15, 0, 1);
  add(polygon([[-0.9, -0.17], [0.8, -0.4], [1, 0.14], [0.05, 0.42]], 0.18, C.white, C.black), 1.55, 1.55, -0.9, -0.25, -0.3, 0, 2);
  add(polygon([[-0.7, -0.17], [0.8, -0.3], [0.93, 0.17], [-0.07, 0.4]], 0.14, C.red, C.black), -1.65, -1.6, -0.9, 0.2, 0.14, 0, 2);
  add(polygon(star(5, 0.82, 0.42), 0.18, C.white, C.black), 1.82, 0.5, -0.45, 0.28, 0.18, 0, 2);
  add(polygon(star(5, 0.52, 0.36), 0.2, C.red, C.black), -1.75, 0.15, 0.2, -0.36, 0.15, 0, 2);
  // Cincin pita kertas di belakang.
  for (let i = 0; i < 14; i++) {
    const a = (i * Math.PI * 2) / 14, co = i % 4 === 0 ? C.white : i % 3 === 0 ? C.black : C.red;
    add(box(i % 3 ? 0.1 : 0.16, i % 3 ? 0.61 : 0.88, 0.13, co, C.black), Math.cos(a) * 2.42, Math.sin(a) * 2.42, -1.2, a + Math.PI / 2, 0.12, 0, 0);
  }
  for (let i = 0; i < 7; i++) {
    const a = (i * Math.PI * 2) / 7 + 0.2;
    add(polygon([[0, -0.12], [0.68, -0.24], [0.52, 0.24]], 0.11, i % 2 ? C.white : C.black, C.red), Math.cos(a) * 3.05, Math.sin(a) * 3.05, -1.6, a, 0, 0, 0);
  }

  // Interaksi: ikuti pointer, seret untuk memutar, panah keyboard saat kanvas fokus.
  const target = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
  let drag = false, dx = 0, dy = 0, ox = 0, oy = 0;
  const onMove = (e: PointerEvent) => {
    if (reduced) return;
    if (drag) { ox = Math.max(-0.6, Math.min(0.6, ox + (e.clientX - dx) * 0.006)); oy = Math.max(-0.35, Math.min(0.35, oy + (e.clientY - dy) * 0.006)); dx = e.clientX; dy = e.clientY; }
    const r = stage.getBoundingClientRect();
    const nx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1)), ny = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
    target.x = nx * 0.27 + ox; target.y = -ny * 0.17 + oy;
  };
  const onDown = (e: PointerEvent) => { if (e.target === canvas) { drag = true; dx = e.clientX; dy = e.clientY; canvas.setPointerCapture?.(e.pointerId); } };
  const onUp = () => { drag = false; };
  const onKey = (e: KeyboardEvent) => {
    const k = e.key;
    if (k === 'ArrowLeft') ox = Math.max(-0.6, ox - 0.15); else if (k === 'ArrowRight') ox = Math.min(0.6, ox + 0.15);
    else if (k === 'ArrowUp') oy = Math.min(0.35, oy + 0.12); else if (k === 'ArrowDown') oy = Math.max(-0.35, oy - 0.12); else return;
    e.preventDefault(); target.x = ox; target.y = oy;
  };
  stage.addEventListener('pointermove', onMove); stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointerup', onUp); stage.addEventListener('pointercancel', onUp);
  canvas.addEventListener('keydown', onKey);

  let visible = true;
  const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; }, { threshold: 0.01 });
  io.observe(canvas);

  const resize = () => {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 1.65);
    const w = Math.max(2, Math.floor(r.width * dpr)), h = Math.max(2, Math.floor(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
  };
  const locs = [A.pos, A.normal, A.color];
  const draw = (t: number) => {
    resize();
    const time = t * 0.001;
    cur.x += (target.x - cur.x) * 0.045; cur.y += (target.y - cur.y) * 0.045;
    const aspect = canvas.width / canvas.height;
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const dist = aspect < 0.85 ? 8.2 : 6.9;
    gl.uniformMatrix4fv(A.proj, false, new Float32Array(mul(persp(Math.PI / 3.25, aspect, 0.1, 60), tr(0, 0, -dist))));
    const spin = reduced ? 0 : Math.sin(time * 0.35) * 0.1, tilt = reduced ? 0 : Math.sin(time * 0.45) * 0.046;
    const group = mul(rx(cur.y + 0.1 + tilt), ry(cur.x + spin - 0.24));
    world.forEach((o, i) => {
      const by = reduced || !o.bob ? 0 : Math.sin(time * (o.bob === 1 ? 0.75 : 0.55) + i * 0.7) * 0.08;
      const local = mul(tr(o.x, o.y + by, o.z), mul(rz(o.rz), mul(ry(o.ry), rx(o.rx))));
      gl.uniformMatrix4fv(A.model, false, new Float32Array(mul(group, local)));
      o.mesh.bs.forEach((b, j) => { gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(locs[j]); gl.vertexAttribPointer(locs[j], 3, gl.FLOAT, false, 0, 0); });
      gl.drawArrays(gl.TRIANGLES, 0, o.mesh.count);
    });
  };
  let raf = 0, last = 0, stopped = false;
  const frame = (t: number) => {
    if (stopped) return;
    if (!document.hidden && visible && (t - last > 24 || last === 0)) { draw(t); last = t; }
    raf = requestAnimationFrame(frame);
  };
  // Tanpa animasi: gambar sekali, dan gambar ulang saat ukuran berubah.
  const ro = new ResizeObserver(() => { if (reduced) draw(0); });
  ro.observe(canvas);
  if (reduced) draw(0); else raf = requestAnimationFrame(frame);

  return () => {
    stopped = true; cancelAnimationFrame(raf); io.disconnect(); ro.disconnect();
    stage.removeEventListener('pointermove', onMove); stage.removeEventListener('pointerdown', onDown);
    stage.removeEventListener('pointerup', onUp); stage.removeEventListener('pointercancel', onUp);
    canvas.removeEventListener('keydown', onKey);
    buffers.forEach((b) => gl.deleteBuffer(b));
    gl.deleteProgram(program);
  };
}
