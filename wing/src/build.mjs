import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { engineScript, stageHtml, pageMk2, footHtml } from "../../mk2/shell.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const W = 960, H = 600;

// Truth: lift = ½ρV²S·CL, CL rising with angle of attack until the flow separates and the wing stalls; induced drag going
// with CL²; the flow round the section is real potential flow (a Joukowski aerofoil with the Kutta condition), so the
// timelines show air over the top arriving first, not at the same time. The wing is a cantilever: top skin in compression,
// bottom in tension. Transport certification: limit 2.5 g (25.337), ultimate = 1.5 × limit (25.303), flutter-free past VD
// (25.629). 787 ultimate test, 28 Mar 2010: 150 % of limit, tips up about 7.6 m. 777-9 test wing failed at 148 % (2019).
// Toy: a 787-size wing with made-up numbers, one-dimensional bending, flutter as a single growing mode.
const PLATE = { x: -34, y: -21, w: 42, d: 29, r: 1.4 };
const P = k.fitProjection([...k.boxCorners(PLATE, -0.8, 0), [-31, -19, 16], [7, 7, 10], [-31, 7, 10], [7, -19, 10]], W, H, { pad: 16, azimuth: 118, elevation: 28 });
const DATA = { W, H, P, PLATE };

const LIVE = `
${engineScript()}
const D = __DATA__;
const stage = document.querySelector(".mk-stage");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lightTheme = document.body.dataset.theme === "light";
const E = mk2(stage, D.P, { W: D.W, H: D.H, pivot: [-9, -5, 4], plate: { ...D.PLATE, h: 1.6, foot: 0.8 }, shadowBox: [-36, -24, -3, 10, 10, 22] });
const { box, cyl, prism, circle, lathe, tube, sphere, loft, roundPoly, rrect, tris } = E;
E.bindTools(stage);
const xbtn = stage.querySelector('[data-mk="xray"]');
const setX = (on) => { E.setXray(on); if (xbtn) xbtn.setAttribute("aria-pressed", String(on)); };
const sceneG = stage.querySelector('[data-part="scene"]');
const iso = (p) => E.project(p), depthOf = (p) => E.depthOf(p);
const shakeEls = [stage.querySelector(".mk-gl"), stage.querySelector(".mk-over")];
const setShake = (x, y) => { const t = x || y ? "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px)" : ""; for (const e of shakeEls) if (e.style.transform !== t) e.style.transform = t; };
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
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
// ---------------- particles (3D, on the main canvas) ----------------
let parts = [], vortT = 0;
function spark(p, s) { const a = rnd() * Math.PI * 2; parts.push({ k: "spark", p: [...p], v: [Math.cos(a) * 6 * s, Math.sin(a) * 6 * s - 4, 4 + rnd() * 8 * s], life: 0, max: 0.5 + rnd() * 0.6 }); }
function fuel(p) { parts.push({ k: "fuel", p: [...p], v: [(rnd() - 0.5) * 3, -6 - rnd() * 8, (rnd() - 0.3) * 3], life: 0, max: 1.6 + rnd() * 1.2 }); }
function vapour(p) { parts.push({ k: "vap", p: [...p], v: [0, -10 - rnd() * 4, 0.2], life: 0, max: 0.7 + rnd() * 0.5 }); }
function sizeCanvas(c) { const r = c.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); const w = Math.max(1, Math.round(r.width * dpr)), hh = Math.max(1, Math.round(r.height * dpr)); if (c.width !== w || c.height !== hh) { c.width = w; c.height = hh; } }
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
  sctx.clearRect(0, 0, w2, h2);
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

// ---------------- drawing ----------------
const flashEl = stage.querySelector(".fx-flash"), sec = stage.querySelector(".sec-cv"), sctx = sec.getContext("2d");
let shakeOff = [0, 0];
const L3 = (c) => c.map((v) => Math.pow(clamp(v, 0, 255) / 255, 2.2));
const SKIN = rgb("#d8dde2"), BLUE = rgb("#3d8bff"), RED = rgb("#ff4a3d"), ALU = rgb("#9aa1a8");
const US = [0, 0.025, 0.08, 0.18, 0.3, 0.45, 0.62, 0.8, 1];
function skinRing(s, dz, piece) { const r = []; for (const u of US) r.push(wingPoint(s, u, 1, dz, piece)); for (let k = US.length - 2; k >= 1; k--) r.push(wingPoint(s, US[k], -1, dz, piece)); return r; }
const BOX = [0.15, 0.3, 0.45, 0.6];
function boxRing(s, dz, piece, v) { const r = []; for (const u of BOX) r.push(wingPoint(s, u, v, dz, piece)); for (let k = BOX.length - 1; k >= 0; k--) r.push(wingPoint(s, BOX[k], -v, dz, piece)); return r; }
function nacelle(x, ew) {
  const c = [x, ew[1], ew[2] - 1.95];
  return [lathe([[0, -4.3], [0.45, -3.5], [0.95, -3.4], [1.35, -2.3], [1.72, -0.6], [1.8, 1.9], [1.72, 2.8], [1.52, 3.15], [1.36, 3.0], [1.32, 2.5]], "#c9ced4", { c, axis: "y", mat: "paint", seg: 28 }),
    lathe([[0, 2.5], [1.32, 2.5]], "#22262b", { c, axis: "y", mat: "matte", seg: 28 }), lathe([[0, 3.05], [0.2, 2.9], [0.42, 2.5]], "#e8eaec", { c, axis: "y", mat: "gloss", seg: 16 }),
    prism([[ew[1] - 2.6, ew[2] - 0.35], [ew[1] + 2.2, ew[2] - 0.35], [ew[1] + 1.2, ew[2] + 0.25], [ew[1] - 2.2, ew[2] + 0.25]], "x", x - 0.22, x + 0.22, "#b0b6bd", { mat: "paint" })];
}
function drawWing(dt) {
  const def = deflection(), wob = flut * 1.6 * Math.sin(flutPh) * 7.6 / 3.75 + (buffet ? (rnd() - 0.5) * buffet * 0.25 : 0);
  if (broken) { const b = broken, t = now - b.t; b.r = Math.min(2.4, t * t * 1.4 + t * 1.2); b.x = -t * 2; b.y = -t * t * 6; b.z = 1.5 * t - 4.9 * t * t * 0.6; }
  const comp = clamp(Math.abs(n) / nBreak, 0, 1), objs = [];
  // the rig: plinth under the root, a stub of fuselage, the stand
  objs.push({ cache: "rig", rev: 0, parts: () => [box(-4.5, -0.6, -9, 5, 0, 1.2, "#5a6068", { mat: "steel" }), box(-4, -1, -7.5, 3.5, 1.2, 2.4, "#6a7078", { mat: "steel" }), prism(circle(-3, 3.2, 2.9, 36), "x", 0.2, 6, "#e4e7ea", { cap: "#d9c9a6", mat: "paint" }), box(1.5, 4.5, -4.5, -1.5, 0, 0.6, "#5a6068", { mat: "steel" }), box(2.6, 3.4, -3.4, -2.6, 0.6, 1.1, "#4a5058", { mat: "steel" }),
    ...[1.0, 2.3, 3.6, 4.9].map((x) => box(x, x + 0.5, -0.2, -0.1, 3.75, 4.3, "#2a3038", { mat: "gloss", bevel: 0 }))] });
  const sb = broken ? broken.s : 2, stations = Array.from({ length: NS + 1 }, (_, i) => i / NS);
  const pieces = broken ? [[...stations.filter((s) => s < sb - 1e-6), sb], [sb, ...stations.filter((s) => s > sb + 1e-6)]] : [stations];
  pieces.forEach((list, piece) => {
    const dz = (s) => (piece ? 0 : (def + wob) * bendShape(s)), stress = (s) => (piece ? 0 : clamp(comp * (1 - s) ** 2 * 1.2, 0, 1));
    const topC = (s) => L3(mix(SKIN, n >= 0 ? BLUE : RED, stress(s))), botC = (s) => L3(mix(SKIN, n >= 0 ? RED : BLUE, stress(s))), iceC = L3(rgb("#f4f9ff"));
    // skin: one loft over the stations, coloured by what the bending is doing to it
    objs.push({ shell: true, parts: [loft(list.map((s) => skinRing(s, dz(s), piece)), "#d8dde2", { mat: "paint", cap: "#d9c9a6", vcol: list.map((s) => { const t = topC(s), b = botC(s); return Array.from({ length: 16 }, (_, j) => (ice && (j < 2 || j > 14) ? iceC : j < 9 ? t : b)); }) })] });
    // inside: two spars, a rib at every station, fuel between them
    const inner = [];
    for (const u0 of [0.15, 0.6]) inner.push(loft(list.map((s) => [wingPoint(s, u0, 0.9, dz(s), piece), wingPoint(s, u0 + 0.014, 0.9, dz(s), piece), wingPoint(s, u0 + 0.014, -0.9, dz(s), piece), wingPoint(s, u0, -0.9, dz(s), piece)]), "#9aa1a8", { mat: "metal", crease: 2, vcol: list.map((s) => { const t = L3(mix(ALU, n >= 0 ? BLUE : RED, stress(s))), b = L3(mix(ALU, n >= 0 ? RED : BLUE, stress(s))); return [t, t, b, b]; }) }));
    for (const s of list) if (s < 0.999) inner.push(loft([boxRing(s, dz(s), piece, 0.86), boxRing(Math.min(1, s + 0.006), dz(s), piece, 0.86)], "#aeb5bc", { mat: "metal", crease: 2 }));
    const wet = list.filter((s) => s <= 0.72);
    if (wet.length > 1) inner.push(loft(wet.map((s) => { const r = []; for (const u of [0.17, 0.3, 0.45, 0.58]) r.push(wingPoint(s, u, 0.55, dz(s), piece)); for (const u of [0.58, 0.45, 0.3, 0.17]) r.push(wingPoint(s, u, -0.8, dz(s), piece)); return r; }), "#e0a63a", { mat: "glass", opacity: lightTheme ? 0.3 : 0.22, rough: 0.4 }));
    objs.push({ parts: inner });
    // flaps and slats hanging off the back and front of the inboard wing
    if (flaps) { const fl = []; for (let i = 0; i < list.length - 1; i++) { const s0 = list[i], s1 = list[i + 1]; if (s1 > 0.75) continue; const a = wingPoint(s0, 1, 0, dz(s0), piece), b2 = wingPoint(s1, 1, 0, dz(s1), piece), a2 = [a[0], a[1] - 1.7, a[2] - 2.1], b3 = [b2[0], b2[1] - 1.7, b2[2] - 2.1]; fl.push([a, b2, b3], [a, b3, a2]); const c = wingPoint(s0, 0, 0, dz(s0), piece), d = wingPoint(s1, 0, 0, dz(s1), piece), c2 = [c[0], c[1] + 0.9, c[2] - 0.7], d2 = [d[0], d[1] + 0.9, d[2] - 0.7]; fl.push([c, d, d2], [c, d2, c2]); } objs.push({ parts: [tris(fl, "#9aa2aa", { mat: "paint" })] }); }
  });
  // the engine hangs at a third of the span
  const se = 0.32, ez = (def + wob) * bendShape(se);
  if (!(broken && broken.s < se)) { const ew = wingPoint(se, 0.15, -1, ez, 0); objs.push({ parts: nacelle(station(se).x, [ew[0], ew[1] + 0.2, ew[2]]) }); }
  let svg = E.render(objs);
  // the fatigue crack in the bottom skin
  if (crack && !broken) { let p = wingPoint(0.2, 0.25, -1.02, def * bendShape(0.2), 0); for (let i = 1; i <= 6; i++) { const q = wingPoint(0.2 + 0.012 * Math.sin(i * 2.1), 0.25 + i * 0.05, -1.02, def * bendShape(0.2), 0); E.line(p, q, 2.2, "#ff3b2e", 0.95, !lightTheme); p = q; } }
  if (E.xray > 0.02 && !broken) { const P1 = (s, u, v) => wingPoint(s, u, v, def * bendShape(s), 0); svg += E.callouts([
    { p: P1(0.45, 0.15, 0.5), text: "Front spar", sub: "" }, { p: P1(0.62, 0.6, 0.5), text: "Rear spar", sub: "the two spars carry the bending" }, { p: P1(0.3, 0.38, 0.9), text: "Ribs", sub: "keep the skin in shape" },
    { p: P1(0.12, 0.4, -0.2), text: "Fuel", sub: "the wing box is the tank" }, { p: P1(0.2, 0.3, 1), text: "Top skin", sub: n >= 0 ? "squeezed when the wing bends up" : "stretched when the wing bends down" }, { p: P1(0.85, 0.5, 0), text: "Tip", sub: "up " + (def * bendShape(1)).toFixed(1) + " m" },
  ], E.xray, E.fs < 0.62 ? {} : { topR: 250 }); }
  return svg;
}
function drawParticles(dt) {
  parts = parts.filter((p) => {
    p.life += dt; if (p.life > p.max) return false;
    const t = p.life / p.max;
    if (p.k === "vort") { p.a += dt * 9 * Math.sign(p.s || 1); p.y -= dt * 9; const r = 0.4 + 1.6 * t; p.p = [p.c[0] + Math.cos(p.a) * r, p.c[1] + p.y, p.c[2] + Math.sin(p.a) * r - t * 0.8]; E.sprite(p.p, 0.22, lightTheme ? "#3a78c0" : "#dcebff", 0.7 * (1 - t), !lightTheme, 1); return true; }
    if (p.k === "spark") p.v[2] -= 12 * dt;
    const o = [p.p[0], p.p[1], p.p[2]];
    for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * dt;
    if (p.k === "fuel") E.sprite(p.p, 0.5 + 1.9 * t, lightTheme ? "#aeb6bd" : "#ebf0f5", 0.5 * (1 - t));
    if (p.k === "vap") E.sprite(p.p, 0.4 + 0.9 * t, lightTheme ? "#b8c4d0" : "#f0f6ff", 0.32 * (1 - t));
    if (p.k === "spark") E.line(o, p.p, 1.8, t < 0.5 ? "#ffe6a0" : "#ff8a3a", 1 - t, true);
    return true;
  });
}

// ---------------- frame ----------------
function draw(dt) {
  const svg = drawWing(dt);
  if (!broken && Math.abs(CL) > 0.2) { vortT += dt * (6 + 14 * Math.abs(CL)); while (vortT > 1) { vortT -= 1; const tp = wingPoint(1, 0.95, 0, (deflection()) * bendShape(1), 0); parts.push({ k: "vort", c: [...tp], a: rnd() * 6.28, y: 0, life: 0, max: 2.2, s: CL }); } }
  if (!broken && Math.abs(n) > 2.2 && rnd() < dt * 20) { const s2 = rnd() * 0.8; const p = wingPoint(s2, 0.1 + rnd() * 0.4, 1, deflection() * bendShape(s2), 0); vapour(p); }
  if (broken && now - broken.t < 3 && rnd() < 0.7) { const s2 = broken.s; fuel(wingPoint(s2, 0.3 + rnd() * 0.3, 0, deflection() * bendShape(s2), 0)); }
  shake = Math.max(0, shake - dt * 0.8);
  const amp = shake * 6 + buffet * 2.2 + Math.min(4, flut * 3);
  shakeOff = amp > 0.05 ? [(rnd() - 0.5) * amp, (rnd() - 0.5) * amp] : [0, 0];
  setShake(shakeOff[0], shakeOff[1]);
  const ft = now - flashT; flashEl.style.opacity = ft < 0.4 ? String((1 - ft / 0.4) * 0.7) : "0";
  drawParticles(dt);
  sceneG.innerHTML = svg;
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
  const map = { x: () => setX(!E.xrayOn), ArrowUp: () => { mode = "manual"; alpha = clamp(alpha + 1, -6, 24); }, ArrowDown: () => { mode = "manual"; alpha = clamp(alpha - 1, -6, 24); }, ArrowRight: () => { V = Math.min(520, V + 10); }, ArrowLeft: () => { V = Math.max(110, V - 10); }, f: () => { flaps = !flaps; setShape(); }, g: () => { gust = 1.6; }, i: () => { ice = !ice; } };
  if (map[ev.key]) { ev.preventDefault(); act(map[ev.key])(); }
  if (ev.key === "s") { slow = !slow; run(); }
});
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;
window.__fig = { E, freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
setShape(); physics(0.5); draw(0); syncUi(); story();
`;

const CSS = `.fx-flash{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(circle 50% at 45% 45%,#fff6dc 0%,#ffcf8a 40%,rgba(255,160,80,0) 100%)}.sec-wrap{left:auto;right:14px;top:52px;width:38%;aspect-ratio:2/1}@media (max-width:560px){.sec-wrap{width:54%;right:auto;left:10px;top:auto}}`;

const stage = stageHtml({
  W, H, fig: "Fig 24", title: "Aeroplane wing", xray: true,
  label: "An airliner wing on a test rig, bending under load with its skin coloured by stress, an engine hanging under it, and an inset showing the air flowing round the wing section. An x-ray mode shows the spars, ribs and fuel inside.",
  keysHelp: "Wing: drag to rotate, X for x-ray, left and right for speed, up and down for angle of attack, F flaps, G gust, I ice",
  extra: `<div class="fx-flash" aria-hidden="true"></div><div class="mk-inset sec-wrap" aria-hidden="true"><canvas class="sec-cv"></canvas></div>`,
});

const CONTROLS = `<div class="ctl" role="group" aria-label="Controls">
  <div class="ctl-row"><span class="ctl-label">Speed</span><div class="slide"><input id="spd" type="range" min="110" max="520" step="5" value="300" aria-label="Airspeed, knots"></div><output id="spd-out">300 kt</output></div>
  <div class="ctl-row"><span class="ctl-label">AoA</span><div class="slide"><input id="aoa" type="range" min="-6" max="24" step="0.5" value="2" aria-label="Angle of attack, degrees"></div><output id="aoa-out">2°</output></div>
  <div class="ctl-row"><span class="ctl-label">Hold</span><button type="button" data-g="1" aria-pressed="true">1 g<small>level flight</small></button><button type="button" data-g="2.5">2.5 g<small>limit load</small></button><button type="button" data-g="4">4 g<small>past ultimate</small></button><button type="button" data-g="-1">-1 g<small>push over</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Add</span><button type="button" id="flaps" aria-pressed="false">Flaps + slats</button><button type="button" id="ice" aria-pressed="false">Ice</button><button type="button" id="gust">Gust<small>+1.5 g</small></button><button type="button" id="crack" aria-pressed="false">Fatigue crack</button></div>
  <div class="ctl-row"><span class="ctl-label">Lift</span><div class="meter"><span id="l-fill" class="fill"></span><span class="mark" style="left:${(3.5 / 5.5 * 100).toFixed(1)}%" data-label="2.5 g limit"></span></div><output id="l-out">1 g</output></div>
  <div class="ctl-row"><span class="ctl-label">Drag</span><div class="meter"><span id="d-fill" class="fill"></span></div><output id="d-out">0 kN</output></div>
  <div class="ctl-row"><span class="ctl-label">Bending</span><div class="meter"><span id="s-fill" class="fill"></span><span class="mark" style="left:${(100 / 1.1).toFixed(1)}%" data-label="ultimate"></span></div><output id="s-out">27 %</output></div>
  <div class="ctl-row"><span class="ctl-label">Flutter</span><div class="meter"><span id="f-fill" class="fill"></span></div><output id="f-out">damped</output></div>
  <div class="ctl-row wide"><span class="ctl-label">Wing</span><span id="stats"></span></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="fresh">New wing</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
</div>`;


const foot = footHtml({
  theme, slug: "wing",
  real: "lift = ½ρV²S·CL, the stall, induced drag, ice and flaps changing the stall, the flow in the inset (potential flow round a Joukowski aerofoil with the Kutta condition, so the timelines really do show the top arriving first), a wing as a cantilever with the top skin in compression and the bottom in tension, and flutter. Real rules: limit load 2.5 g (14 CFR 25.337), ultimate = 1.5 × limit (25.303), free from flutter beyond the dive speed (25.629). Real tests: the 787's ultimate load test (March 2010, 150 %, tips up about 7.6 m) and the 777-9 test wing that failed at 148 % (2019).",
  made: "the aeroplane's numbers, the flutter speed, the stall model, the separation picture, the fatigue crack, and where it breaks.",
});
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), pageMk2({
  k, title: "Aeroplane wing", fig: "Fig 24", hint: "Fly it slow, pull hard, dive fast", theme, W, H, stage, controls: CONTROLS, css: CSS, foot,
  caption: "A wing makes lift by turning air downwards. Tilt it to the oncoming air (angle of attack) and the air over the curved top speeds up and its pressure drops, the air underneath slows and pushes up, and the whole flow leaves the trailing edge heading down. Lift goes with the speed squared, so slow down and the wing has to tilt more, until the air can't follow the top surface any more and the wing stalls. All that lift bends the wing up like a diving board: the top skin is squashed, the bottom skin is stretched, and the root carries the lot. Go too fast and a different thing can happen: the air starts pumping energy into the wing's own wobble, and that's flutter.",
  script: LIVE.replace("__DATA__", JSON.stringify(DATA)),
}));
console.log("wrote", name);
