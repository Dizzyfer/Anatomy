import { writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { kitScript } from "../../scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const SOLID = readFileSync(join(HERE, "solid.mjs"), "utf8").replace(/^export /gm, "");

const W = 680;
const H = 520;

// Truth: lift = ½ρV²S·CL, CL rising with angle of attack until the flow separates and the wing stalls; induced drag going
// with CL²; the flow round the section is real potential flow (a Joukowski aerofoil with the Kutta condition), so the
// timelines show air over the top arriving first, not at the same time. The wing is a cantilever: top skin in compression,
// bottom in tension. Transport certification: limit 2.5 g (25.337), ultimate = 1.5 × limit (25.303), flutter-free past VD
// (25.629). 787 ultimate test, 28 Mar 2010: 150 % of limit, tips up about 7.6 m. 777-9 test wing failed at 148 % (2019).
// Toy: a 787-size wing with made-up numbers, one-dimensional bending, flutter as a single growing mode.
const PLATE = { x: -35, y: -23, w: 44, d: 31, r: 1.4 };
const PLATE_H = 1.6, FOOT_H = 0.8;
const P = k.fitProjection([...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [-32, -20, 20], [8, 8, 10], [-32, 8, 10], [8, -20, 10]], W, H, { pad: 10, azimuth: 45 });
const Sv = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const depth2 = ([x, y]) => k.depthOf([x, y, 0], P);
const byDepth = (pts) => [...pts].sort((a, b) => depth2(a) - depth2(b));
function plate() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 2.4))) {
    out.push(Sv(k.cylinder(x, y, 0.7, -PLATE_H - FOOT_H, 0.16, P, 24), { tone: "lo" }));
    out.push(Sv(k.cylinder(x, y, 0.55, -PLATE_H - FOOT_H + 0.16, FOOT_H - 0.16, P, 24), { tone: "mid" }));
  }
  out.push(Sv(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 0.16), { tone: "mid", inner: L(k.sideSeam(PLATE, -PLATE_H / 2, P), { tone: "faint" }) }));
  return out.join("");
}
const svg = k.figureSvg({
  width: W, height: H,
  label: "One wing of a widebody airliner, about the size of a 787's, on a stand, with a stub of fuselage at the root and an engine underneath. The wing bends up with the load. An inset shows the air flowing round a slice of the wing.",
  body: [plate(), `<g data-part="wing"></g>`, `<g data-part="fly"></g>`],
});
const DATA = { W, H, P };

const LIVE = `
${SOLID}
const D = __DATA__;
const PR = D.P;
const stage = document.querySelector(".fx-stage");
const q = (n) => stage.querySelector('[data-part="' + n + '"]');
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const R = solids((p) => iso(p, PR), (p) => depthOf(p, PR));
const { box, cyl, prism } = R;
const svgEl = stage.querySelector("svg"), cv = stage.querySelector(".fx-smoke"), ctx = cv.getContext("2d"), flashEl = stage.querySelector(".fx-flash");
const sec = stage.querySelector(".sec-cv"), sctx = sec.getContext("2d");
const wingG = q("wing"), flyG = q("fly");
const sp = (p) => { const a = iso(p, PR); return a[0].toFixed(1) + " " + a[1].toFixed(1); };
const VIEW = R.VIEW, dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const LIGHT = (() => { const v = [0.4, 0.6, 1]; const n = Math.hypot(...v); return v.map((a) => a / n); })();
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function normalOf(pts) { let n = [0, 0, 0]; for (let i = 0; i < pts.length; i++) { const p = pts[i], q2 = pts[(i + 1) % pts.length]; n[0] += (p[1] - q2[1]) * (p[2] + q2[2]); n[1] += (p[2] - q2[2]) * (p[0] + q2[0]); n[2] += (p[0] - q2[0]) * (p[1] + q2[1]); } const l = Math.hypot(...n) || 1; return n.map((v) => v / l); }
const shade = (c, n) => { const k2 = 0.5 + 0.6 * Math.max(0, dot(n, LIGHT)); return "rgb(" + c.map((v) => Math.round(clamp(v * k2, 0, 255))).join(",") + ")"; };
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
let seed = 9; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

// ---------------- the aeroplane (toy numbers, 787-ish size) ----------------
const MASS = 230000, G0 = 9.81, WT = MASS * G0, S = 360, RHO = 1.225, KT = 0.5144, SEMI = 30;
const N_LIM = 2.5, N_ULT = 3.75, VF = 470, VD = 400, VMO = 340;
let V = 300, alpha = 2, nCmd = 1, mode = "hold", flaps = false, ice = false, crack = false;
let CL = 0, CD = 0, n = 1, nDyn = 1, Lkn = 0, Dkn = 0, stalled = false, buffet = 0, gust = 0, flut = 0.01, flutPh = 0;
let broken = null, nBreak = 3.8;
let now = 0, last = 0, frame = 0, visible = false, touring = true, slow = false, tourClock = 0, tourStep = -1, actions = [], lastShot = "", lastEvent = "", lastEventAt = -10, flashT = -9, shake = 0;
const event = (t) => { lastEvent = t; lastEventAt = now; };
function aero(a) {
  const cl0 = (flaps ? 0.95 : 0.25) - (ice ? 0.05 : 0), slope = 0.095, as = (flaps ? 15 : 13) - (ice ? 5 : 0);
  const clmax = cl0 + slope * as;
  let cl, st = false;
  if (a <= as) cl = cl0 + slope * a; else { st = true; cl = clmax - 0.07 * (a - as); cl = Math.max(cl, clmax * 0.55); }
  const cd = 0.016 + (flaps ? 0.05 : 0) + (ice ? 0.02 : 0) + 0.04 * cl * cl + (st ? 0.04 * (a - as) : 0);
  return { cl, cd, st, as, clmax };
}
function physics(dt) {
  const q = 0.5 * RHO * (V * KT) ** 2;
  if (broken) { flut *= Math.exp(-dt * 2); return; }
  const A = aero(alpha);
  if (mode === "hold") {
    const need = nCmd * WT / (q * S), cl0 = (flaps ? 0.95 : 0.25) - (ice ? 0.05 : 0), a0 = (need - cl0) / 0.095;
    const tgt = clamp(a0, -6, 24);
    alpha += (tgt - alpha) * Math.min(1, dt * 2.5);
  }
  const B = aero(alpha);
  CL = B.cl; CD = B.cd; stalled = B.st;
  gust *= Math.exp(-dt * 2.5);
  n = q * S * CL / WT + gust;
  Lkn = n * WT / 1000; Dkn = q * S * CD / 1000;
  buffet = stalled ? Math.min(1, buffet + dt * 2) : Math.max(0, buffet - dt * 3);
  // flutter: one mode, damped below the flutter speed, growing above it
  const g2 = V > VF ? (V - VF) / 22 : -1.2;
  flut = clamp(flut * Math.exp(g2 * dt) + (rnd() - 0.5) * 0.002, 0.004, 3);
  flutPh += dt * 2 * Math.PI * 2.2;
  nDyn = n + flut * 1.6 * Math.sin(flutPh);
  nBreak = crack ? 2.3 : 3.8;
  if (nDyn > nBreak || nDyn < -nBreak * 0.62) snap(nDyn > 0 ? "up" : "down");
}
function snap(dir) {
  if (broken) return;
  const s0 = crack ? 0.22 : 0.3;
  broken = { t: now, s: s0, dir, r: 0, vx: 0, vz: 0, x: 0, z: 0 };
  flashT = now; shake = 1.8;
  const xb = -SEMI * s0;
  for (let i = 0; i < 70; i++) spark([xb, -2 + rnd() * 6, 2 + rnd()], 1.2);
  for (let i = 0; i < 60; i++) fuel([xb, -3 + rnd() * 7, 2]);
  const pct = Math.round(Math.abs(nDyn) / N_LIM * 100);
  if (V > VF && flut > 0.4) event("Flutter. Past " + VF + " kt the air feeds energy into the wing's bending and twisting instead of soaking it up, and every swing is bigger than the last. It came off.");
  else if (crack) event("Snapped at " + nDyn.toFixed(1) + " g, below the 2.5 g it's meant to take every day: the fatigue crack in the bottom skin did the rest. That's why wings get inspected.");
  else event("Gone at " + nDyn.toFixed(1) + " g, " + pct + " % of limit load. The " + (dir === "up" ? "top skin buckled under compression" : "bottom skin buckled") + " and the spar went with it. Certification only asks for 150 %, held for three seconds.");
}
function reset() { broken = null; flut = 0.01; gust = 0; shake = 0; parts = []; }

// ---------------- the wing ----------------
// planform: root chord 11 m, tip 2.6 m, swept 32°, dihedral 6°, x = -span (root at 0, tip at -30), y = chordwise (LE at +)
const NS = 14;
const station = (s) => { const le = 4 - s * SEMI * Math.tan(32 * Math.PI / 180), c = 11 - 8.4 * s, t = c * (0.14 - 0.04 * s); return { x: -s * SEMI, le, c, t }; };
const bendShape = (s) => (6 * s * s - 4 * s ** 3 + s ** 4) / 3;
function deflection() { const nn = broken ? 0 : nDyn; return 7.6 * nn / 3.75; }
function wingPoint(s, u, v, dz, piece) {
  // u: 0 at LE to 1 at TE along the chord; v: -1 bottom, +1 top surface (thickness)
  const st = station(s), y = st.le - u * st.c, th = st.t * (u < 0.3 ? Math.sqrt(u / 0.3) : (1 - u) / 0.7) * 0.5;
  let z = 3.2 + Math.tan(6 * Math.PI / 180) * (-st.x) + v * th + dz;
  let x = st.x;
  if (broken && piece === 1) {
    const b = broken, xb = -SEMI * b.s, zb = 3.2 + Math.tan(6 * Math.PI / 180) * (SEMI * b.s);
    const dx = x - xb, dzz = z - zb, cr = Math.cos(b.r), sr = Math.sin(b.r) * (b.dir === "up" ? 1 : -1);
    x = xb + dx * cr - dzz * sr + b.x; z = zb + dx * sr + dzz * cr + b.z; return [x, y + b.y, z];
  }
  return [x, y, z];
}
const SKIN = rgb("#d8dde2"), BLUE = rgb("#3d8bff"), RED = rgb("#ff4a3d");
function drawWing(dt) {
  const def = deflection(), wob = flut * 1.6 * Math.sin(flutPh) * 7.6 / 3.75 + (buffet ? (rnd() - 0.5) * buffet * 0.25 : 0);
  const sb = broken ? broken.s : 2;
  if (broken) { const b = broken, t = now - b.t; b.r = Math.min(2.4, t * t * 1.4 + t * 1.2); b.x = -t * 2; b.y = -t * t * 6; b.z = 1.5 * t - 4.9 * t * t * 0.6; }
  const out = [];
  const comp = clamp(Math.abs(n) / nBreak, 0, 1);
  for (let i = 0; i < NS; i++) {
    const s0 = i / NS, s1 = (i + 1) / NS;
    if (broken && s0 < sb && s1 > sb) { /* split the panel at the break */ }
    const piece = broken && s0 >= sb - 1e-6 ? 1 : 0;
    const z0 = piece ? 0 : (def + wob) * bendShape(s0), z1 = piece ? 0 : (def + wob) * bendShape(s1);
    // stress fades out along the span (bending moment falls off towards the tip)
    const st = comp * (1 - s0) ** 2, col = mix(SKIN, n >= 0 ? BLUE : RED, piece ? 0 : clamp(st * 1.2, 0, 1));
    for (let j = 0; j < 6; j++) {
      const u0 = j / 6, u1 = (j + 1) / 6;
      for (const v of [1, -1]) {
        const pts = [wingPoint(s0, u0, v, z0, piece), wingPoint(s1, u0, v, z1, piece), wingPoint(s1, u1, v, z1, piece), wingPoint(s0, u1, v, z0, piece)];
        let nn = normalOf(pts); if (dot(nn, [0, 0, v]) < 0) nn = nn.map((x) => -x);
        if (dot(nn, VIEW) <= 0) continue;
        const c = pts.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4, a[2] + p[2] / 4], [0, 0, 0]);
        out.push({ d: dot(c, VIEW), s: '<path d="M' + pts.map(sp).join("L") + 'Z" fill="' + shade(v > 0 ? col : mix(SKIN, n >= 0 ? RED : BLUE, piece ? 0 : clamp(st * 1.2, 0, 1)), nn) + '"/>' });
      }
    }
    // leading edge strip and the trailing edge (flaps down if they're out)
    const le = [wingPoint(s0, 0, 1, z0, piece), wingPoint(s1, 0, 1, z1, piece), wingPoint(s1, 0, -1, z1, piece), wingPoint(s0, 0, -1, z0, piece)];
    out.push({ d: dot(le[0], VIEW) - 0.01, s: '<path d="M' + le.map(sp).join("L") + 'Z" fill="' + (ice ? "#eef6ff" : "#aeb5bc") + '"/>' });
    if (flaps && s1 <= 0.75) {
      const a = wingPoint(s0, 1, 0, z0, piece), b = wingPoint(s1, 1, 0, z1, piece);
      const dn = 2.2, back = 1.6;
      out.push({ d: dot(a, VIEW) - 0.5, s: '<path d="M' + [a, b, [b[0], b[1] - back, b[2] - dn], [a[0], a[1] - back, a[2] - dn]].map(sp).join("L") + 'Z" fill="#9aa2aa"/>' });
    }
  }
  out.sort((a, b) => a.d - b.d);
  let s2 = "";
  // fuselage stub (cut), the stand, the engine
  const fus = [{ parts: [prism(R.circle(-3, 3.2, 2.9, 24), "x", 0.2, 6, "#e4e7ea", { cap: "#d9c9a6" })], key: 1e6 }, { parts: [box(1.5, 4.5, -4.5, -1.5, 0, 0.6, "#5a6068"), box(2.5, 3.5, -3.5, -2.5, 0.6, 0.6 + 0.4, "#5a6068")], key: -1e6 }];
  const stand = R.render([{ parts: [box(2, 4, -4, -2, 0, 0.5, "#4a5058"), box(2.6, 3.4, -3.4, -2.6, 0.5, 0.5, "#4a5058")] }]);
  s2 += '<path class="post" d="M' + sp([3, -3, 0.4]) + "L" + sp([3, -3, 0.6]) + '"/>';
  // engine hangs at a third of the span
  const se = 0.32, ste = station(se), ez = (def + wob) * bendShape(se), ew = wingPoint(se, 0.15, -1, ez, 0);
  const eng = { parts: [prism(R.circle(ew[1] + 1.5, ew[2] - 1.9, 1.7, 20), "x", ste.x - 1.3, ste.x + 1.3, "#c9ced4"), prism(R.circle(ew[1] + 1.5, ew[2] - 1.9, 1.75, 20), "x", ste.x + 1.25, ste.x + 1.35, "#aab1b8")] };
  // the engine is really oriented along the flight path (y): draw it as a pod along y
  const pod = { parts: [prism(R.circle(ste.x, ew[2] - 1.9, 1.7, 20).map(([a, b2]) => [a, b2]), "y", ew[1] - 3.5, ew[1] + 3.2, "#c9ced4", { cap: "#3a3f45" })] };
  wingG.innerHTML = R.render([{ parts: [box(-4.5, -0.6, -9, 5, 0, 1.2, "#5a6068"), box(-4, -1, -7.5, 3.5, 1.2, 2.4, "#6a7078")], key: -1e9 }]) + out.map((f) => f.s).join("") + (broken && broken.s < se ? "" : R.render([podToY(ste.x, ew)])) ;
  // root section (cut face): wing box with the skins coloured by stress
  const rs = station(0), cut = [];
  for (let u = 0; u <= 1.0001; u += 0.1) cut.push(wingPoint(0, u, 1, 0, 0));
  for (let u = 1; u >= -0.0001; u -= 0.1) cut.push(wingPoint(0, u, -1, 0, 0));
  let rsec = '<path class="rootsec" d="M' + cut.map(sp).join("L") + 'Z"/>';
  const top = (u) => wingPoint(0, u, 1, 0, 0), bot = (u) => wingPoint(0, u, -1, 0, 0);
  const tc = mix(rgb("#8a9097"), n >= 0 ? BLUE : RED, comp), bc = mix(rgb("#8a9097"), n >= 0 ? RED : BLUE, comp);
  rsec += '<path stroke="rgb(' + tc.map(Math.round).join(",") + ')" class="skin" d="M' + [0.15, 0.3, 0.45, 0.6].map((u) => sp(top(u))).join("L") + '"/>';
  rsec += '<path stroke="rgb(' + bc.map(Math.round).join(",") + ')" class="skin" d="M' + [0.15, 0.3, 0.45, 0.6].map((u) => sp(bot(u))).join("L") + '"/>';
  for (const u of [0.15, 0.6]) rsec += '<path class="spar" d="M' + sp(top(u)) + "L" + sp(bot(u)) + '"/>';
  if (crack) { const c0 = bot(0.42); rsec += '<path class="crack" d="M' + sp(c0) + 'l3 -1.5l-2 -1l3 -1.6"/>'; }
  wingG.innerHTML += rsec;
}
function podToY(x, ew) {
  const ring = R.circle(x, ew[2] - 1.9, 1.7, 20);
  return { parts: [prism(ring, "y", ew[1] - 3.4, ew[1] + 3.2, "#c9ced4", { cap: "#33383e" }), prism(R.circle(x, ew[2] - 1.9, 1.78, 20), "y", ew[1] + 2.4, ew[1] + 3.3, "#aab1b8", { cap: "#2b2f34" }), box(x - 0.25, x + 0.25, ew[1] - 2.5, ew[1] + 1.5, ew[2] - 0.4, ew[2] + 0.2, "#b0b6bd")] };
}

// ---------------- particles (3D, on the main canvas) ----------------
let parts = [], vortT = 0;
function spark(p, s) { const a = rnd() * Math.PI * 2; parts.push({ k: "spark", p: [...p], v: [Math.cos(a) * 6 * s, Math.sin(a) * 6 * s - 4, 4 + rnd() * 8 * s], life: 0, max: 0.5 + rnd() * 0.6 }); }
function fuel(p) { parts.push({ k: "fuel", p: [...p], v: [(rnd() - 0.5) * 3, -6 - rnd() * 8, (rnd() - 0.3) * 3], life: 0, max: 1.6 + rnd() * 1.2 }); }
function vapour(p) { parts.push({ k: "vap", p: [...p], v: [0, -10 - rnd() * 4, 0.2], life: 0, max: 0.7 + rnd() * 0.5 }); }
function sizeCanvas(c) { const r = c.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); const w = Math.max(1, Math.round(r.width * dpr)), hh = Math.max(1, Math.round(r.height * dpr)); if (c.width !== w || c.height !== hh) { c.width = w; c.height = hh; } }
let shakeOff = [0, 0];
function drawParticles(dt) {
  sizeCanvas(cv);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.setTransform(cv.width / D.W, 0, 0, cv.height / D.H, shakeOff[0] * cv.width / D.W, shakeOff[1] * cv.height / D.H);
  parts = parts.filter((p) => {
    p.life += dt; if (p.life > p.max) return false;
    const t = p.life / p.max;
    if (p.k === "vort") { p.a += dt * 9 * Math.sign(p.s || 1); p.y -= dt * 9; const r = 0.4 + 1.6 * t; p.p = [p.c[0] + Math.cos(p.a) * r, p.c[1] + p.y, p.c[2] + Math.sin(p.a) * r - t * 0.8]; const P3 = iso(p.p, PR); ctx.fillStyle = "rgba(220,235,255," + (0.6 * (1 - t)).toFixed(2) + ")"; ctx.fillRect(P3[0] - 0.8, P3[1] - 0.8, 1.6, 1.6); return true; }
    if (p.k === "spark") p.v[2] -= 12 * dt;
    for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * dt;
    const P2 = iso(p.p, PR);
    const soft = (r, c, a) => { const g = ctx.createRadialGradient(P2[0], P2[1], 0, P2[0], P2[1], r); g.addColorStop(0, "rgba(" + c + "," + a.toFixed(3) + ")"); g.addColorStop(1, "rgba(" + c + ",0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(P2[0], P2[1], r, 0, 7); ctx.fill(); };
    if (p.k === "fuel") soft(4 + 14 * t, "235,240,245", 0.55 * (1 - t));
    if (p.k === "vap") soft(3 + 6 * t, "240,246,255", 0.35 * (1 - t));
    if (p.k === "spark") { ctx.fillStyle = "rgba(255," + Math.round(220 - 120 * t) + ",90," + (1 - t).toFixed(2) + ")"; ctx.fillRect(P2[0] - 1, P2[1] - 1, 2, 2); }
    return true;
  });
}

// ---------------- the section: potential flow round a Joukowski aerofoil ----------------
const cm = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdv = (a, b) => { const d2 = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d2, (a[1] * b[0] - a[0] * b[1]) / d2]; };
const csq = (a) => { const r = Math.hypot(a[0], a[1]), th = Math.atan2(a[1], a[0]) / 2; return [Math.sqrt(r) * Math.cos(th), Math.sqrt(r) * Math.sin(th)]; };
let MU = [-0.08, 0.06], RAD = Math.hypot(1 - MU[0], MU[1]);
function setShape() { MU = flaps ? [-0.09, 0.15] : [-0.08, 0.06]; RAD = Math.hypot(1 - MU[0], MU[1]); }
const zOf = (zt) => { const inv = cdv([1, 0], zt); return [zt[0] + inv[0], zt[1] + inv[1]]; };
function zetaOf(z) {
  const s2 = csq([z[0] * z[0] - z[1] * z[1] - 4, 2 * z[0] * z[1]]);
  let a = [(z[0] + s2[0]) / 2, (z[1] + s2[1]) / 2], b = [(z[0] - s2[0]) / 2, (z[1] - s2[1]) / 2];
  return Math.hypot(a[0] - MU[0], a[1] - MU[1]) >= Math.hypot(b[0] - MU[0], b[1] - MU[1]) ? a : b;
}
let gammaK = 1;
function vel(z, al) {
  const zt = zetaOf(z), d = [zt[0] - MU[0], zt[1] - MU[1]];
  if (Math.hypot(d[0], d[1]) < RAD * 1.001) return null;
  const e = [Math.cos(al), -Math.sin(al)], e2 = [Math.cos(al), Math.sin(al)];
  const beta = Math.asin(MU[1] / RAD), G = 4 * Math.PI * RAD * Math.sin(al + beta) * gammaK;
  const d2 = cm(d, d), t1 = e, t2 = cdv([RAD * RAD * e2[0], RAD * RAD * e2[1]], d2), t3 = cdv([0, G / (2 * Math.PI)], d);
  const Wz = [t1[0] - t2[0] + t3[0], t1[1] - t2[1] + t3[1]];
  const dzd = [1 - cdv([1, 0], cm(zt, zt))[0], -cdv([1, 0], cm(zt, zt))[1]];
  const w = cdv(Wz, dzd);
  return [w[0], -w[1]];
}
let flow = [], lines = [], lineT = 0, streakT = 0;
let CA = 1, SA = 0;
const PT = (x, y) => { const X = x * CA + y * SA, Y = -x * SA + y * CA; return [(X + 2.9) / 6.2 * sec.width, (1 - (Y + 1.45) / 2.9) * sec.height]; };
const Z2 = (X, Y) => [X * CA - Y * SA, X * SA + Y * CA];
const DSP = (p) => [p[0] * CA + p[1] * SA, -p[0] * SA + p[1] * CA];
function drawSection(dt) {
  sizeCanvas(sec);
  const w2 = sec.width, h2 = sec.height;
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.fillStyle = document.body.dataset.theme === "light" ? "#eef2f6" : "#0f1418"; sctx.fillRect(0, 0, w2, h2);
  const al = alpha * Math.PI / 180, A = aero(alpha); CA = Math.cos(al); SA = Math.sin(al);
  gammaK = broken ? 0 : A.st ? clamp(A.cl / (A.clmax), 0.4, 1) * 0.85 : 1;
  const U = 0.9 * (broken ? 0.6 : 1), sc = w2 / 6.2;
  // timelines: lines of particles released together; the top half gets to the back first
  lineT += dt;
  if (lineT > 0.85) { lineT = 0; const ln = []; for (let i = 0; i < 26; i++) ln.push({ p: Z2(-2.8, -1.35 + i * 0.108), dead: false }); lines.push(ln); if (lines.length > 5) lines.shift(); }
  streakT += dt;
  if (!flow.length) for (let i = 0; i < 140; i++) flow.push({ p: Z2(-2.8 + rnd() * 6, -1.45 + rnd() * 2.9), tr: [] });
  while (flow.length < 140) flow.push({ p: Z2(-2.8 - rnd() * 0.4, -1.45 + rnd() * 2.9), tr: [] });
  const sepX = A.st ? clamp(0.9 - (alpha - A.as) * 0.15, -0.6, 0.9) : 2;
  const step = (pt) => {
    let v = vel(pt.p, al);
    if (!v) { pt.dead = true; return; }
    let vx = v[0] * U, vy = v[1] * U;
    // separated flow behind the separation point above the wing: slow, churning
    if (A.st && pt.p[0] > sepX && pt.p[1] > -0.1 && pt.p[1] < 0.2 + (pt.p[0] - sepX) * Math.tan(al + 0.25)) { vx = vx * 0.25 + (rnd() - 0.5) * 1.2; vy = vy * 0.25 + (rnd() - 0.5) * 1.2; pt.sep = true; }
    if (ice && !A.st && pt.p[0] > -1.95 && pt.p[0] < -0.5 && pt.p[1] > 0 && pt.p[1] < 0.35) { vx *= 0.9; vy += (rnd() - 0.5) * 0.25; }
    pt.p[0] += vx * dt; pt.p[1] += vy * dt; pt.sp = Math.hypot(v[0], v[1]);
  };
  flow.forEach((f) => { step(f); f.tr.push([f.p[0], f.p[1]]); if (f.tr.length > 9) f.tr.shift(); });
  flow = flow.filter((f) => { const d = DSP(f.p); return !f.dead && d[0] < 3.3 && Math.abs(d[1]) < 1.6; });
  for (const f of flow) {
    const s2 = clamp(((f.sp || 1) - 0.6) / 1.2, 0, 1), c = f.sep ? "255,150,90" : Math.round(90 + 165 * s2) + "," + Math.round(160 + 80 * s2) + "," + Math.round(255 - 60 * s2);
    sctx.strokeStyle = "rgba(" + c + ",0.75)"; sctx.lineWidth = 1.3; sctx.beginPath();
    f.tr.forEach((p, i) => (i ? sctx.lineTo(...PT(p[0], p[1])) : sctx.moveTo(...PT(p[0], p[1])))); sctx.stroke();
  }
  for (const ln of lines) {
    ln.forEach((pt) => { if (!pt.dead) step(pt); });
    sctx.strokeStyle = "rgba(255,214,90,0.85)"; sctx.lineWidth = 1.6; sctx.beginPath(); let on = false;
    for (const pt of ln) { if (pt.dead || DSP(pt.p)[0] > 3.3) { on = false; continue; } const [x, y] = PT(pt.p[0], pt.p[1]); if (!on) { sctx.moveTo(x, y); on = true; } else sctx.lineTo(x, y); }
    sctx.stroke();
  }
  // the aerofoil, pressure arrows on it, ice on the nose
  const surf = []; for (let i = 0; i <= 80; i++) { const th = (i / 80) * Math.PI * 2; surf.push(zOf([MU[0] + RAD * Math.cos(th), MU[1] + RAD * Math.sin(th)])); }
  sctx.fillStyle = broken ? "rgba(120,120,120,0.3)" : "#c9ced4"; sctx.strokeStyle = "#1c1f23"; sctx.lineWidth = 1;
  sctx.beginPath(); surf.forEach((p, i) => (i ? sctx.lineTo(...PT(p[0], p[1])) : sctx.moveTo(...PT(p[0], p[1])))); sctx.closePath(); sctx.fill(); sctx.stroke();
  if (!broken) for (let i = 2; i < 80; i += 4) {
    const th = (i / 80) * Math.PI * 2, zt = [MU[0] + RAD * 1.02 * Math.cos(th), MU[1] + RAD * 1.02 * Math.sin(th)], p = zOf(zt), v = vel(p, al);
    if (!v) continue;
    let cp = 1 - (v[0] * v[0] + v[1] * v[1]); if (A.st && p[0] > sepX && p[1] > 0) cp = Math.max(cp, -0.6);
    const p2 = zOf([MU[0] + RAD * Math.cos(th), MU[1] + RAD * Math.sin(th)]), nx = p[0] - p2[0], ny = p[1] - p2[1], nl = Math.hypot(nx, ny) || 1;
    const L2 = clamp(-cp, -1.2, 4) * 0.22;
    sctx.strokeStyle = cp < 0 ? "rgba(90,170,255,0.9)" : "rgba(255,110,80,0.9)"; sctx.lineWidth = 1.4; sctx.beginPath();
    sctx.moveTo(...PT(p2[0], p2[1])); sctx.lineTo(...PT(p2[0] + nx / nl * L2, p2[1] + ny / nl * L2)); sctx.stroke();
  }
  if (ice) { sctx.fillStyle = "#eef6ff"; const le = zOf([MU[0] - RAD, MU[1]]); for (let i = 0; i < 6; i++) { sctx.beginPath(); sctx.arc(...PT(le[0] - 0.02 + (i % 2) * 0.03, le[1] - 0.06 + i * 0.03), sc * 0.03, 0, 7); sctx.fill(); } }
  // free-stream arrow and labels
  sctx.fillStyle = document.body.dataset.theme === "light" ? "#3a4048" : "#aab3bc"; sctx.font = Math.round(h2 * 0.055) + "px ui-monospace,monospace";
  sctx.fillText("slice of the wing · α " + alpha.toFixed(1) + "°" + (A.st ? " · STALLED" : ""), 8, h2 * 0.09);
  sctx.fillText("blue suction · red push · yellow: let go together", 8, h2 * 0.96);
}

// ---------------- frame ----------------
function draw(dt) {
  drawWing(dt);
  flyG.innerHTML = "";
  if (!broken && Math.abs(CL) > 0.2) { vortT += dt * (6 + 14 * Math.abs(CL)); while (vortT > 1) { vortT -= 1; const tp = wingPoint(1, 0.95, 0, (deflection()) * bendShape(1), 0); parts.push({ k: "vort", c: [...tp], a: rnd() * 6.28, y: 0, life: 0, max: 2.2, s: CL }); } }
  if (!broken && Math.abs(n) > 2.2 && rnd() < dt * 20) { const s2 = rnd() * 0.8; const p = wingPoint(s2, 0.1 + rnd() * 0.4, 1, deflection() * bendShape(s2), 0); vapour(p); }
  if (broken && now - broken.t < 3 && rnd() < 0.7) { const s2 = broken.s; fuel(wingPoint(s2, 0.3 + rnd() * 0.3, 0, deflection() * bendShape(s2), 0)); }
  shake = Math.max(0, shake - dt * 0.8);
  const amp = shake * 6 + buffet * 2.2 + Math.min(4, flut * 3);
  shakeOff = amp > 0.05 ? [(rnd() - 0.5) * amp, (rnd() - 0.5) * amp] : [0, 0];
  svgEl.style.transform = amp > 0.05 ? "translate(" + shakeOff[0].toFixed(1) + "px," + shakeOff[1].toFixed(1) + "px)" : "";
  const ft = now - flashT; flashEl.style.opacity = ft < 0.4 ? String((1 - ft / 0.4) * 0.7) : "0";
  drawParticles(dt);
  drawSection(dt);
  const text = broken ? "WING SEPARATED" : V + " kt · α " + alpha.toFixed(1) + "° · " + n.toFixed(2) + " g" + (stalled ? " · STALL" : "");
  if (readout.textContent !== text) readout.textContent = text;
}

// ---------------- UI ----------------
const ui = {
  spd: document.querySelector("#spd"), spdOut: document.querySelector("#spd-out"), aoa: document.querySelector("#aoa"), aoaOut: document.querySelector("#aoa-out"),
  g: [...document.querySelectorAll("[data-g]")], flapsB: document.querySelector("#flaps"), iceB: document.querySelector("#ice"), crackB: document.querySelector("#crack"), gustB: document.querySelector("#gust"),
  fresh: document.querySelector("#fresh"), slow: document.querySelector("#slow"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"),
  lF: document.querySelector("#l-fill"), lO: document.querySelector("#l-out"), dF: document.querySelector("#d-fill"), dO: document.querySelector("#d-out"), sF: document.querySelector("#s-fill"), sO: document.querySelector("#s-out"), fF: document.querySelector("#f-fill"), fO: document.querySelector("#f-out"), stats: document.querySelector("#stats"),
};
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };
function syncUi() {
  if (document.activeElement !== ui.spd) ui.spd.value = String(V); ui.spdOut.textContent = V + " kt";
  if (document.activeElement !== ui.aoa) ui.aoa.value = alpha.toFixed(1); ui.aoaOut.textContent = alpha.toFixed(1) + "°" + (mode === "hold" ? " (auto)" : "");
  ui.g.forEach((b) => b.setAttribute("aria-pressed", String(mode === "hold" && +b.dataset.g === nCmd)));
  ui.flapsB.setAttribute("aria-pressed", String(flaps)); ui.iceB.setAttribute("aria-pressed", String(ice)); ui.crackB.setAttribute("aria-pressed", String(crack));
  ui.lF.style.width = clamp((n + 1) / 5.5 * 100, 0, 100).toFixed(1) + "%"; ui.lF.dataset.state = n > N_LIM ? "bad" : n > 2 ? "warn" : "ok"; ui.lO.textContent = n.toFixed(2) + " g · " + Math.round(Lkn).toLocaleString("en-AU") + " kN";
  const ld = CD > 0 ? CL / CD : 0; ui.dF.style.width = clamp(ld / 22 * 100, 0, 100).toFixed(1) + "%"; ui.dO.textContent = Math.round(Dkn) + " kN · L/D " + ld.toFixed(1);
  const st = Math.abs(nDyn) / N_ULT; ui.sF.style.width = clamp(st / 1.1 * 100, 0, 100).toFixed(1) + "%"; ui.sF.dataset.state = st > 1 ? "bad" : st > 0.66 ? "warn" : "ok"; ui.sO.textContent = broken ? "broken" : Math.round(st * 100) + " % · tip " + deflection().toFixed(1) + " m";
  ui.fF.style.width = clamp(flut / 1.5 * 100, 0, 100).toFixed(1) + "%"; ui.fF.dataset.state = V > VF ? "bad" : V > VD ? "warn" : "ok"; ui.fO.textContent = V > VF ? "growing" : flut > 0.05 ? "settling" : "damped";
  const A = aero(alpha), vs = Math.sqrt(2 * WT / (RHO * S * A.clmax)) / KT;
  ui.stats.innerHTML = "1 g stall speed <b>" + Math.round(vs) + " kt</b> · stalls at <b>" + A.as + "°</b> · CL <b>" + CL.toFixed(2) + "</b> · limit <b>2.5 g</b>, ultimate <b>3.75 g</b>" + (crack ? " · <b>cracked: good for about 2.3 g</b>" : "");
  ui.slow.setAttribute("aria-pressed", String(slow)); ui.tour.setAttribute("aria-pressed", String(touring));
}
function story() {
  if (now - lastEventAt < 6 && lastEvent) return say(lastEvent);
  if (touring && tourStep >= 0 && TOUR[tourStep].say) return say(TOUR[tourStep].say);
  if (broken) return;
  if (V > VF) return say("Past the flutter speed. Each oscillation pumps energy in instead of out. Certification wants the wing flutter-free comfortably beyond the design dive speed for exactly this reason.");
  if (stalled) return say("Stalled. The air can't follow the curve of the top surface any more, it breaks away and churns, and the lift collapses. Lower the nose, or add speed or flaps.");
  if (Math.abs(n) > N_LIM) return say("Past limit load. Between 2.5 g and 3.75 g the wing's allowed to bend permanently but not break; past that, nobody promised anything.");
  if (n > 1.8) return say("Pulling " + n.toFixed(1) + " g: the wing's carrying " + Math.round(n * MASS / 1000) + " t of lift, the tip's up " + deflection().toFixed(1) + " m, the top skin's being squashed and the bottom stretched.");
  if (V < 190) return say("Slow: to hold 1 g the wing needs a bigger angle of attack. Lift goes with speed squared, so half the speed needs four times the CL.");
  return say("Watch the yellow lines: air released together reaches the back of the top surface first. The wing turns the air downwards, and the low pressure on top (blue) does most of the lifting.");
}
const TOUR = [
  { say: "Cruising at 1 g. The yellow lines were released together: the top half gets to the back first, so 'equal transit time' is a myth. Blue arrows are suction, and most of the lift is the top surface being sucked up.", acts: [[0, () => { reset(); V = 300; mode = "hold"; nCmd = 1; flaps = false; ice = false; crack = false; setShape(); }], [9, null]] },
  { say: "Slow right down, still holding 1 g. Less speed means more angle of attack, until the flow can't hang on.", acts: [[0, () => { V = 200; }], [2.5, () => { V = 165; }], [5, () => { V = 150; }], [10, null]] },
  { say: "Flaps and slats out: more camber, more area, and the same wing flies happily at that speed.", acts: [[0, () => { flaps = true; setShape(); }], [7, null]] },
  { say: "Ice on the leading edge: the flow trips early, it stalls at a lower angle, and the drag goes up.", acts: [[0, () => { flaps = false; setShape(); V = 210; ice = true; }], [3, () => { V = 175; }], [9, null]] },
  { say: "Clean and fast: pull 2.5 g, the limit load. The tip goes up about 5 m.", acts: [[0, () => { reset(); ice = false; V = 330; nCmd = 2.5; }], [7, null]] },
  { say: "Now 4 g. That's past 1.5 times limit, the ultimate load.", acts: [[0, () => { nCmd = 4; }], [10, null]] },
  { say: "New wing. Dive it past the flutter speed.", acts: [[0, () => { reset(); nCmd = 1; V = 360; }], [2, () => { V = 430; }], [4, () => { V = 495; }], [14, null]] },
];
function tourTick() {
  if (tourStep < 0 || !actions.length) { tourStep = (tourStep + 1) % TOUR.length; actions = TOUR[tourStep].acts.map(([w, fn]) => [tourClock + w, fn]); }
  while (actions.length && tourClock >= actions[0][0]) { const fn = actions.shift()[1]; if (fn) fn(); else actions = []; }
}
function tick(t) {
  const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
  last = t;
  const sdt = dt * (slow ? 0.2 : 1);
  now += sdt;
  if (touring) { tourClock += sdt; tourTick(); }
  physics(sdt); draw(sdt); syncUi(); story();
  if (broken && !touring && now - broken.t > 7) reset();
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { if (touring) { touring = false; actions = []; tourStep = -1; } };
const act = (fn) => (...a) => { takeOver(); fn(...a); syncUi(); run(); };
ui.spd.addEventListener("input", act(() => { V = +ui.spd.value; }));
ui.aoa.addEventListener("input", act(() => { mode = "manual"; alpha = +ui.aoa.value; }));
ui.g.forEach((b) => b.addEventListener("click", act(() => { mode = "hold"; nCmd = +b.dataset.g; })));
ui.flapsB.addEventListener("click", act(() => { flaps = !flaps; setShape(); }));
ui.iceB.addEventListener("click", act(() => { ice = !ice; }));
ui.crackB.addEventListener("click", act(() => { crack = !crack; }));
ui.gustB.addEventListener("click", act(() => { if (!broken) { gust = 1.6; event("A gust: the wing suddenly meets the air at a steeper angle and the load jumps by about 1.5 g for a moment."); } }));
ui.fresh.addEventListener("click", act(() => reset()));
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; actions = []; } syncUi(); run(); });
stage.addEventListener("keydown", (ev) => {
  const map = { ArrowUp: () => { mode = "manual"; alpha = clamp(alpha + 1, -6, 24); }, ArrowDown: () => { mode = "manual"; alpha = clamp(alpha - 1, -6, 24); }, ArrowRight: () => { V = Math.min(520, V + 10); }, ArrowLeft: () => { V = Math.max(110, V - 10); }, f: () => { flaps = !flaps; setShape(); }, g: () => { gust = 1.6; }, i: () => { ice = !ice; } };
  if (map[ev.key]) { ev.preventDefault(); act(map[ev.key])(); }
  if (ev.key === "s") { slow = !slow; run(); }
});
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;
window.__fig = { freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
setShape(); physics(0.5); draw(0); syncUi(); story();
`;

const CSS = `.fx-stage{position:relative;overflow:hidden}
.fx-stage svg{display:block;position:relative}
.fx-smoke{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.fx-flash{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(circle 50% at 45% 45%,#fff6dc 0%,#ffcf8a 40%,rgba(255,160,80,0) 100%)}
.sec-wrap{position:absolute;right:2.5%;top:3%;width:42%;aspect-ratio:2/1;border:1px solid var(--anatomy-lo);border-radius:6px;overflow:hidden;box-shadow:0 4px 14px rgba(0,0,0,.3);pointer-events:none}
.sec-cv{width:100%;height:100%;display:block}
.rootsec{fill:#d9c9a6;stroke:rgba(0,0,0,.45);stroke-width:.5}.skin{fill:none;stroke-width:2.4;stroke-linecap:round}.spar{stroke:#6d6458;stroke-width:1.4}.crack{fill:none;stroke:#111;stroke-width:1.2}
.post{stroke:#4a5058;stroke-width:3}
.fx-stage path{stroke-linejoin:round}
.ctl{display:grid;gap:12px;margin:14px 0 6px;font-family:var(--anatomy-mono);font-size:12px;color:var(--anatomy-mid)}
.ctl-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ctl-label{min-width:72px;text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:var(--anatomy-lo)}
.ctl button{font:inherit;color:var(--anatomy-mid);background:transparent;border:1px solid var(--anatomy-lo);border-radius:6px;padding:7px 10px;cursor:pointer;line-height:1.15;text-align:left;min-height:36px}
.ctl button:hover{border-color:var(--anatomy-mid)}
.ctl button[aria-pressed="true"]{color:var(--anatomy-lit);border-color:var(--anatomy-lit)}
.ctl #crack[aria-pressed="true"],.ctl [data-g="4"],.ctl #ice[aria-pressed="true"]{color:#ff6a3d;border-color:#ff6a3d}
.ctl button small{display:block;font-size:10px;color:var(--anatomy-lo)}
.ctl output{min-width:96px;text-align:right;color:var(--anatomy-hi,var(--anatomy-mid))}
.slide{position:relative;flex:1;min-width:120px}.slide input{width:100%;accent-color:var(--anatomy-lit);margin:0}
.meter{position:relative;flex:1;min-width:110px;height:10px;margin-top:14px;border:1px solid var(--anatomy-lo);border-radius:5px}
.meter .fill{position:absolute;left:0;top:0;bottom:0;border-radius:4px;transition:width .1s;background:#3ddc84}
.meter .fill[data-state="warn"]{background:#ffb347}.meter .fill[data-state="bad"]{background:#ff5a2a}
.mark{position:absolute;top:-14px;bottom:-3px;width:0;border-left:1px dashed #ff6a3d;pointer-events:none}
.mark::after{content:attr(data-label);position:absolute;top:0;left:4px;font-size:10px;white-space:nowrap;color:#ff6a3d}
.mark.l::after{left:auto;right:4px}
#stats{font-size:12px;color:var(--anatomy-mid);line-height:1.5}#stats b{color:var(--anatomy-hi,var(--anatomy-mid));font-weight:600}
#shot{min-height:3.6em;font-size:12px;line-height:1.4}
@media (max-width:520px){.ctl-label{min-width:52px}.ctl button{padding:7px 8px}.ctl output{min-width:80px}.ctl button small{display:none}.sec-wrap{width:56%}}`;

const stageHtml = `<div class="iso-stage fx-stage" tabindex="0" role="group" aria-label="Wing: left and right for speed, up and down for angle of attack, F flaps, G gust, I ice">${svg}<canvas class="fx-smoke" aria-hidden="true"></canvas><div class="sec-wrap" aria-hidden="true"><canvas class="sec-cv"></canvas></div><div class="fx-flash" aria-hidden="true"></div></div>`;

const CONTROLS = `<div class="ctl" role="group" aria-label="Controls">
  <div class="ctl-row"><span class="ctl-label">Speed</span><div class="slide"><input id="spd" type="range" min="110" max="520" step="5" value="300" aria-label="Airspeed, knots"></div><output id="spd-out">300 kt</output></div>
  <div class="ctl-row"><span class="ctl-label">AoA</span><div class="slide"><input id="aoa" type="range" min="-6" max="24" step="0.5" value="2" aria-label="Angle of attack, degrees"></div><output id="aoa-out">2°</output></div>
  <div class="ctl-row"><span class="ctl-label">Hold</span><button type="button" data-g="1" aria-pressed="true">1 g<small>level flight</small></button><button type="button" data-g="2.5">2.5 g<small>limit load</small></button><button type="button" data-g="4">4 g<small>past ultimate</small></button><button type="button" data-g="-1">-1 g<small>push over</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Add</span><button type="button" id="flaps" aria-pressed="false">Flaps + slats</button><button type="button" id="ice" aria-pressed="false">Ice</button><button type="button" id="gust">Gust<small>+1.5 g</small></button><button type="button" id="crack" aria-pressed="false">Fatigue crack</button></div>
  <div class="ctl-row"><span class="ctl-label">Lift</span><div class="meter"><span id="l-fill" class="fill"></span><span class="mark" style="left:${(3.5 / 5.5 * 100).toFixed(1)}%" data-label="2.5 g limit"></span></div><output id="l-out">1 g</output></div>
  <div class="ctl-row"><span class="ctl-label">Drag</span><div class="meter"><span id="d-fill" class="fill"></span></div><output id="d-out">0 kN</output></div>
  <div class="ctl-row"><span class="ctl-label">Bending</span><div class="meter"><span id="s-fill" class="fill"></span><span class="mark" style="left:${(100 / 1.1).toFixed(1)}%" data-label="ultimate"></span></div><output id="s-out">27 %</output></div>
  <div class="ctl-row"><span class="ctl-label">Flutter</span><div class="meter"><span id="f-fill" class="fill"></span></div><output id="f-out">damped</output></div>
  <div class="ctl-row"><span class="ctl-label">Wing</span><span id="stats"></span></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="fresh">New wing</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
  <div id="shot" aria-live="polite"></div>
</div>`;

const card = k.plateHtml({
  fig: "Fig 24",
  title: "Aeroplane wing",
  hint: "Fly it slow, pull hard, dive fast",
  readout: "",
  keys: [
    { mark: "lit", label: "Inset: real potential flow round a slice of the wing; skins coloured blue for squashed, red for stretched" },
    { mark: "raised", label: "A 787-size wing on a stand, bending with the load; cut face at the root shows the wing box" },
  ],
  caption: "A wing makes lift by turning air downwards. Tilt it to the oncoming air (angle of attack) and the air over the curved top speeds up and its pressure drops, the air underneath slows and pushes up, and the whole flow leaves the trailing edge heading down. Lift goes with the speed squared, so slow down and the wing has to tilt more, until the air can't follow the top surface any more and the wing stalls. All that lift bends the wing up like a diving board: the top skin is squashed, the bottom skin is stretched, and the root carries the lot. Go too fast and a different thing can happen: the air starts pumping energy into the wing's own wobble, and that's flutter.",
  body: stageHtml,
});

const other = theme === "light" ? ["index.html", "Dark version"] : ["light.html", "Light version"];
const FOOT = `<p style="font-family:var(--anatomy-mono);font-size:11px;color:var(--anatomy-lo);margin:28px 0 8px;line-height:1.6">A toy, not a structural analysis. Real: lift = ½ρV²S·CL, the stall, induced drag, ice and flaps changing the stall, the flow in the inset (potential flow round a Joukowski aerofoil with the Kutta condition, so the timelines really do show the top arriving first), a wing as a cantilever with the top skin in compression and the bottom in tension, and flutter. Real rules: limit load 2.5 g (14 CFR 25.337), ultimate = 1.5 × limit (25.303), free from flutter beyond the dive speed (25.629). Real tests: the 787's ultimate load test (March 2010, 150 %, tips up about 7.6 m) and the 777-9 test wing that failed at 148 % (2019). Made up: the aeroplane's numbers, the flutter speed, the stall model, the separation picture, the fatigue crack, and where it breaks.<br>Built with <a href="https://github.com/wheresryan22/anatomy" style="color:inherit">Anatomy</a> by Ryan (MIT). · <a href="${other[0]}" style="color:inherit">${other[1]}</a> · <a href="../" style="color:inherit">More figures</a> · <a href="https://github.com/Dizzyfer/Anatomy/tree/main/wing" style="color:inherit">Source</a></p>`;
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "Aeroplane wing", theme, body: `<style>${CSS}</style>${card.replace("<figcaption", CONTROLS + "<figcaption")}${FOOT}`, script: kitScript() + LIVE.replace("__DATA__", JSON.stringify(DATA)), width: 720 }));
console.log("wrote", name);
