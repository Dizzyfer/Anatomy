// planar truss, direct stiffness. Units: m, kN.
function trussGeom(kind) {
  const N = 6, Lp = 8, Ht = 7, J = [];
  for (let i = 0; i <= N; i++) J.push([i * Lp, 0]);          // bottom 0..6
  for (let i = 1; i < N; i++) J.push([i * Lp, Ht]);          // top 7..11 (t1..t5)
  const b = (i) => i, t = (i) => N + i;                      // t(1) = 7
  const M = [];
  const add = (a, c, type) => M.push({ a, b: c, type });
  for (let i = 0; i < N; i++) add(b(i), b(i + 1), "bottom");
  for (let i = 1; i < N - 1; i++) add(t(i), t(i + 1), "top");
  add(b(0), t(1), "end"); add(b(N), t(N - 1), "end");
  for (let i = 1; i < N; i++) add(b(i), t(i), "vert");
  if (kind === "pratt") { add(t(1), b(2), "diag"); add(t(2), b(3), "diag"); add(t(4), b(3), "diag"); add(t(5), b(4), "diag"); }
  else { add(b(1), t(2), "diag"); add(b(2), t(3), "diag"); add(b(4), t(3), "diag"); add(b(5), t(4), "diag"); }
  return { J, M, N, Lp, Ht };
}
const SECT = { bottom: { A: 0.0026, r: 0.13 }, top: { A: 0.0034, r: 0.15 }, end: { A: 0.0034, r: 0.15 }, vert: { A: 0.0024, r: 0.09 }, diag: { A: 0.0022, r: 0.098 } };
const E = 200e6, FY = 350e3; // kPa
function capOf(m, len) { const s = SECT[m.type]; const ten = s.A * FY; const eul = Math.PI * Math.PI * E * s.A * s.r * s.r / (len * len); return { ten, comp: Math.min(ten, eul) }; }
// solve: loads = array of [fx, fy] per joint (kN, fy negative = down); broken = Set of member indices
function solveTruss(g, loads, broken) {
  const n = g.J.length, dof = 2 * n;
  const K = Array.from({ length: dof }, () => new Float64Array(dof));
  const info = g.M.map((m, k) => {
    const [x1, y1] = g.J[m.a], [x2, y2] = g.J[m.b], L = Math.hypot(x2 - x1, y2 - y1), c = (x2 - x1) / L, s = (y2 - y1) / L;
    return { L, c, s, EA: E * SECT[m.type].A };
  });
  g.M.forEach((m, k) => {
    if (broken.has(k)) return;
    const { L, c, s, EA } = info[k], kk = EA / L, d = [2 * m.a, 2 * m.a + 1, 2 * m.b, 2 * m.b + 1], v = [-c, -s, c, s];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) K[d[i]][d[j]] += kk * v[i] * v[j];
  });
  const fixed = new Set([0, 1, 2 * g.N + 1]); // pin at b0, roller at b6
  const free = []; for (let i = 0; i < dof; i++) if (!fixed.has(i)) free.push(i);
  const nf = free.length, A = free.map((i) => free.map((j) => K[i][j])), F = free.map((i) => loads[i >> 1][i & 1]);
  // gaussian elimination with pivot check
  const scale = Math.max(...A.map((r, i) => Math.abs(r[i])));
  for (let col = 0; col < nf; col++) {
    let piv = col; for (let r = col + 1; r < nf; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < scale * 1e-9) return { mech: true };
    [A[col], A[piv]] = [A[piv], A[col]]; [F[col], F[piv]] = [F[piv], F[col]];
    for (let r = col + 1; r < nf; r++) { const f = A[r][col] / A[col][col]; if (!f) continue; for (let c2 = col; c2 < nf; c2++) A[r][c2] -= f * A[col][c2]; F[r] -= f * F[col]; }
  }
  const x = new Float64Array(nf);
  for (let r = nf - 1; r >= 0; r--) { let s = F[r]; for (let c2 = r + 1; c2 < nf; c2++) s -= A[r][c2] * x[c2]; x[r] = s / A[r][r]; }
  const u = new Float64Array(dof); free.forEach((i, k) => (u[i] = x[k]));
  const forces = g.M.map((m, k) => {
    if (broken.has(k)) return { N: 0, util: 0 };
    const { L, c, s, EA } = info[k];
    const N = (EA / L) * (c * (u[2 * m.b] - u[2 * m.a]) + s * (u[2 * m.b + 1] - u[2 * m.a + 1])); // + tension
    const cap = capOf(m, L);
    return { N, util: N >= 0 ? N / cap.ten : -N / cap.comp };
  });
  return { mech: false, u, forces };
}
const VEH = {
  car: { name: "Car", t: 1.5, len: 4.5, axles: [[0, 0.5], [2.7, 0.5]] },
  bus: { name: "Bus", t: 18, len: 12.5, axles: [[0, 0.35], [6.5, 0.65]] },
  bdouble: { name: "B-double", t: 62.5, len: 26, axles: [[0, 0.1], [3.5, 0.13], [4.8, 0.13], [11.5, 0.106], [12.8, 0.106], [14.1, 0.106], [21.5, 0.106], [22.8, 0.106], [24.1, 0.106]] },
  roadtrain: { name: "Road train", t: 120, len: 53, axles: [[0, 0.05], [4, 0.14], [12, 0.17], [19, 0.135], [27, 0.17], [34, 0.135], [42, 0.2]] },
  haul: { name: "Haul truck", t: 620, len: 15, axles: [[0, 0.33], [7.2, 0.67]] },
};
// loads on ONE truss: half of each axle, shared to the bottom joints either side; plus dead load
const DEAD = 70; // kN per bottom joint per truss
function loadsFor(g, vehicles) {
  const L = g.J.map(() => [0, 0]);
  for (let i = 0; i <= g.N; i++) L[i][1] -= DEAD * (i === 0 || i === g.N ? 0.5 : 1);
  for (const v of vehicles) {
    const spec = VEH[v.kind];
    for (const [off, frac] of spec.axles) {
      const x = v.x - off; if (x < 0 || x > g.N * g.Lp) continue;
      const P = spec.t * 9.81 * frac / 2, i = Math.min(g.N - 1, Math.floor(x / g.Lp)), f = x / g.Lp - i;
      L[i][1] -= P * (1 - f); L[i + 1][1] -= P * f;
    }
  }
  return L;
}
if (typeof module !== "undefined") module.exports = { trussGeom, solveTruss, loadsFor, VEH, SECT, capOf };
