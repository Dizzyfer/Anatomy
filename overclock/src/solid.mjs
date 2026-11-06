// Tiny solid renderer: prisms (a 2D ring pushed out along one axis), shaded by face normal, painter-sorted.
// Shared by the build (static parts) and the page (anything that moves or changes colour).
export function solids(project, depthOf) {
  const o = depthOf([0, 0, 0]);
  const VIEW = [depthOf([1, 0, 0]) - o, depthOf([0, 1, 0]) - o, depthOf([0, 0, 1]) - o];
  const LIGHT = (() => { const v = [0.35, 0.7, 1]; const n = Math.hypot(...v); return v.map((a) => a / n); })();
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const fx = (v) => (Math.round(v * 10) / 10).toString();
  // ring in its own 2D plane, axis is the direction it is pushed out along
  const toXYZ = (axis, u, v, w) => (axis === "z" ? [u, v, w] : axis === "y" ? [u, w, v] : [w, u, v]);
  function prism(ring, axis, w0, w1, col, opts = {}) {
    return { ring, axis, w0, w1, col, ...opts };
  }
  const box = (x0, x1, y0, y1, z0, z1, col, opts) => prism([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], "z", z0, z1, col, opts);
  const circle = (cu, cv, r, n = 24, a0 = 0) => Array.from({ length: n }, (_, i) => [cu + r * Math.cos(a0 + (i / n) * Math.PI * 2), cv + r * Math.sin(a0 + (i / n) * Math.PI * 2)]);
  const cyl = (cx, cy, r, z0, z1, col, n = 24, opts) => prism(circle(cx, cy, r, n), "z", z0, z1, col, opts);
  function faces(part, xf) {
    const n = part.ring.length;
    const A = part.ring.map(([u, v]) => xf(toXYZ(part.axis, u, v, part.w0))), B = part.ring.map(([u, v]) => xf(toXYZ(part.axis, u, v, part.w1)));
    const c = [0, 1, 2].map((k) => (A.reduce((s, p) => s + p[k], 0) + B.reduce((s, p) => s + p[k], 0)) / (2 * n));
    const out = [];
    const add = (pts, cap) => {
      const cf = [0, 1, 2].map((k) => pts.reduce((s, p) => s + p[k], 0) / pts.length);
      let nn = [0, 0, 0];
      for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; nn[0] += (p[1] - q[1]) * (p[2] + q[2]); nn[1] += (p[2] - q[2]) * (p[0] + q[0]); nn[2] += (p[0] - q[0]) * (p[1] + q[1]); }
      const len = Math.hypot(...nn); if (len < 1e-9) return;
      nn = nn.map((v) => v / len);
      if (dot(nn, [cf[0] - c[0], cf[1] - c[1], cf[2] - c[2]]) < 0) nn = nn.map((v) => -v);
      if (dot(nn, VIEW) <= 1e-4) return;
      out.push({ pts, n: nn, depth: dot(cf, VIEW), cap });
    };
    add(A, true); add(B, true);
    if (part.w1 !== part.w0) for (let i = 0; i < n; i++) { const j = (i + 1) % n; add([A[i], A[j], B[j], B[i]], false); }
    return out;
  }
  function shade(part, f) {
    let base = rgb(f.cap && part.cap ? part.cap : part.col);
    if (part.glow) base = mix(base, rgb(part.glow[0]), part.glow[1]);
    const d = Math.max(0, dot(f.n, LIGHT)), k = part.flat ? 1 : 0.48 + 0.62 * d;
    let c = base.map((v) => v * k);
    if (part.emit) c = mix(c, rgb(part.emit[0]), part.emit[1]);
    return "rgb(" + c.map((v) => Math.round(Math.min(255, Math.max(0, v)))).join(",") + ")";
  }
  // objects: { parts, xf?, key? } — sorted back to front by key (default: depth of the first part's centre)
  function render(objects, { stroke = "rgba(0,0,0,.35)", width = 0.35 } = {}) {
    const items = objects.map((ob) => {
      const xf = ob.xf || ((p) => p);
      let key = ob.key;
      if (key === undefined) { const p = ob.parts[0]; const r = p.ring; const cu = r.reduce((s, q) => s + q[0], 0) / r.length, cv = r.reduce((s, q) => s + q[1], 0) / r.length; key = dot(xf(toXYZ(p.axis, cu, cv, (p.w0 + p.w1) / 2)), VIEW); }
      return { ob, xf, key };
    }).sort((a, b) => a.key - b.key);
    let s = "";
    for (const { ob, xf } of items) {
      if (ob.svg !== undefined) { s += ob.svg; continue; }
      const fs = [];
      ob.parts.forEach((part, pi) => { for (const f of faces(part, xf)) fs.push({ f, part, layer: part.layer || 0, pi }); });
      fs.sort((a, b) => a.layer - b.layer || a.f.depth - b.f.depth);
      let g = "";
      for (const { f, part } of fs) g += '<path d="M' + f.pts.map((p) => { const q = project(p); return fx(q[0]) + " " + fx(q[1]); }).join("L") + 'Z" fill="' + shade(part, f) + '"' + (part.opacity !== undefined ? ' fill-opacity="' + part.opacity + '"' : "") + "/>";
      s += ob.cls ? '<g class="' + ob.cls + '">' + g + "</g>" : g;
    }
    return '<g stroke="' + stroke + '" stroke-width="' + width + '" stroke-linejoin="round">' + s + "</g>";
  }
  return { prism, box, cyl, circle, render, VIEW, rgb };
}
