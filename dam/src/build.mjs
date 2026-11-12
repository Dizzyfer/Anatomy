import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { engineScript, stageHtml, pageMk2, footHtml } from "../../mk2/shell.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const W = 960, H = 600;

// Truth: hydro power is P = ρ·g·Q·H·η. A concrete gravity dam holds the water back by its own weight: water pushes it
// sideways (½ρgH²) and seeps under it pushing up (uplift), and drains in the foundation exist to bleed that uplift off.
// Sliding safety = friction × (weight − uplift) ÷ water push. Overtopping scours the toe. Shut the turbines too fast after a
// load rejection and the water column slams into the gates (water hammer); too slow and the unit overspeeds. Toy: the
// reservoir is tiny and time is sped up, the river is one-dimensional, and every number is picked to make it fail on cue.
const PLATE = { x: -360, y: -240, w: 920, d: 480, r: 16 };
const P = k.fitProjection([...k.boxCorners(PLATE, -0.8, 0), [-360, -240, 140], [0, -240, 140], [0, 160, 112], [-360, 160, 112]], W, H, { pad: 14, azimuth: 45, elevation: 30 });
const DATA = { W, H, P, PLATE };

const LIVE = `
${engineScript()}
const D = __DATA__;
const stage = document.querySelector(".mk-stage");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lightTheme = document.body.dataset.theme === "light";
const E = mk2(stage, D.P, { W: D.W, H: D.H, pivot: [80, 0, 30], plate: { ...D.PLATE, h: 14, foot: 6 }, shadowBox: [-370, -250, -25, 570, 250, 160] });
const { box, cyl, prism, circle, lathe, tube, sphere, loft, roundPoly, rrect, tris } = E;
E.bindTools(stage);
const xbtn = stage.querySelector('[data-mk="xray"]');
const setX = (on) => { E.setXray(on); if (xbtn) xbtn.setAttribute("aria-pressed", String(on)); };
const sceneG = stage.querySelector('[data-part="scene"]');
const iso = (p) => E.project(p), depthOf = (p) => E.depthOf(p);
const shakeEls = [stage.querySelector(".mk-gl"), stage.querySelector(".mk-over")];
const setShake = (x, y) => { const t = x || y ? "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px)" : ""; for (const e of shakeEls) if (e.style.transform !== t) e.style.transform = t; };
let seed = 5; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
// ---------------- the site (metres) ----------------
const YW = 150, CREST = 102, SPILL = 88, TOE = 82, X0 = -350, XE = 555, FLOOR = 7, CH = 40;
const ROCK = "#6f665c", ROCK2 = "#82786c", CONC = "#bdb8ae", CONC2 = "#a9a398", SEC = "#d9c9a6";
// monoliths: 10 blocks across the canyon, the middle three carry the gated spillway
const MONO = [];
for (let i = 0; i < 10; i++) { const y0 = -YW + 30 * i; MONO.push({ y0, y1: y0 + 30, spill: i >= 4 && i <= 6, gone: false }); }
const prof = (spill) => spill ? [[0, 0], [0, SPILL], [5, SPILL + 1.2], [11, SPILL - 1], [TOE - 6, 3], [TOE + 8, 0]] : [[0, 0], [0, CREST], [10, CREST], [10, CREST - 10], [TOE, 0]];
function monoObj(m, xf) {
  const parts = [prism(prof(m.spill), "y", m.y0, m.y1, CONC, { cap: SEC })];
  if (m.spill) { parts.push(box(0, 8, m.y0, m.y0 + 2.5, SPILL, CREST + 4, CONC2)); if (m.y1 === -YW + 210) parts.push(box(0, 8, m.y1 - 2.5, m.y1, SPILL, CREST + 4, CONC2)); }
  else parts.push(box(0, 10, m.y0, m.y1, CREST, CREST + 1.4, "#8d887f"));
  return { parts, xf };
}
// ---------------- the town ----------------
const HOUSES = [];
[[290, -110], [318, -82], [350, -120], [395, -95], [300, 80], [335, 112], [372, 74], [420, 105], [460, -110], [480, 90]].forEach(([x, y], i) => HOUSES.push({ x, y, w: 12 + (i % 3) * 3, d: 10, h: 6 + (i % 2) * 2, col: ["#c8b79a", "#b9c4c9", "#d2c2a1", "#a9b8a0"][i % 4], roof: ["#8c3b2e", "#5c6670", "#7a4a2e"][i % 3], gone: null }));
const BRIDGE = { x: 252, gone: null };
function houseParts(h, lit) {
  const z0 = FLOOR, x0 = h.x - h.w / 2, x1 = h.x + h.w / 2, y0 = h.y - h.d / 2, y1 = h.y + h.d / 2;
  const p = [box(x0, x1, y0, y1, z0, z0 + h.h, h.col), prism([[y0 - 1, z0 + h.h], [h.y, z0 + h.h + 5], [y1 + 1, z0 + h.h]], "x", x0 - 1, x1 + 1, h.roof)];
  for (const xw of [x0 + 2.5, x1 - 5]) p.push(box(xw, xw + 2.5, y1, y1 + 0.2, z0 + 2, z0 + 4, lit ? "#ffd97a" : "#3a4048", { layer: 2, emit: lit ? ["#ffd97a", 0.8] : undefined }));
  return p;
}
function bridgeParts() { return [box(BRIDGE.x, BRIDGE.x + 12, -YW, YW, 13, 15.5, "#9a958c"), box(BRIDGE.x, BRIDGE.x + 12, -YW, YW, 15.5, 16.2, "#55524d"), ...[-80, 0, 80].map((y) => box(BRIDGE.x + 3, BRIDGE.x + 9, y - 3, y + 3, -2, 13, "#8b867d"))]; }

// ---------------- plant state ----------------
let level = 96, Qin = 1500, gateCmd = 0, gateOpen = 0, jam = false, drains = true, scour = 0, fsLow = 0, failed = null;
let turb = 1, ga = 1, omega = 1, grid = true, Tc = 6, closing = false, v0 = 0, dH = 0, burst = null, wreck = null, tripAt = -9, peakW = 1, peakP = 1;
let Qt = 0, Qs = 0, Qo = 0, Qb = 0, Pmw = 0, FS = 1.8;
let now = 0, last = 0, frame = 0, visible = false, touring = true, slow = false, tourClock = 0, tourStep = -1, actions = [], lastShot = "", lastEvent = "", lastEventAt = -10, flashT = -9, shake = 0;
const event = (t) => { lastEvent = t; lastEventAt = now; };
const A_RES = 2.6e4, TAIL = 3, QTMAX = 1200, B = 150;

// 1D river below the dam: shallow water, Rusanov fluxes, Manning friction
const N = 118, XS = TOE + 4, DX = (XE - XS) / N, S0 = 0.003, NMAN = 0.035;
let h = new Float64Array(N).fill(2.5), hu = new Float64Array(N).fill(4);
function river(dt, qin) {
  let t = 0;
  while (t < dt) {
    let smax = 1;
    for (let i = 0; i < N; i++) { const hh = Math.max(h[i], 1e-3); smax = Math.max(smax, Math.abs(hu[i] / hh) + Math.sqrt(9.81 * hh)); }
    const d = Math.min(dt - t, 0.4 * DX / smax);
    const hg = Math.max(Math.pow(qin * qin / 9.81, 1 / 3), 0.05), F = new Float64Array(N + 1), Fm = new Float64Array(N + 1);
    for (let i = 0; i <= N; i++) {
      const hl = i === 0 ? hg : h[i - 1], ql = i === 0 ? qin : hu[i - 1], hr = i === N ? h[N - 1] : h[i], qr = i === N ? Math.max(0, hu[N - 1]) : hu[i];
      const ul = hl > 1e-3 ? ql / hl : 0, ur = hr > 1e-3 ? qr / hr : 0, a = Math.max(Math.abs(ul) + Math.sqrt(9.81 * hl), Math.abs(ur) + Math.sqrt(9.81 * hr));
      F[i] = 0.5 * (ql + qr) - 0.5 * a * (hr - hl);
      Fm[i] = 0.5 * (ql * ul + 4.905 * hl * hl + qr * ur + 4.905 * hr * hr) - 0.5 * a * (qr - ql);
    }
    for (let i = 0; i < N; i++) {
      h[i] = Math.max(0, h[i] - d / DX * (F[i + 1] - F[i]));
      let m = hu[i] - d / DX * (Fm[i + 1] - Fm[i]) + d * 9.81 * h[i] * S0;
      if (h[i] < 1e-3) { m = 0; } else { const u = m / h[i], fr = 9.81 * NMAN * NMAN * Math.abs(u) / Math.pow(h[i], 4 / 3); m = m / (1 + d * fr); }
      hu[i] = m;
    }
    t += d;
  }
}
const depthAt = (x) => { const i = clamp(Math.floor((x - XS) / DX), 0, N - 1); return { h: h[i], u: h[i] > 0.01 ? hu[i] / h[i] : 0 }; };

// ---------------- physics ----------------
function physics(dt) {
  const head = Math.max(0, level - TAIL);
  // turbines and the governor
  const plantOk = !burst && !wreck && !failed;
  if (grid && plantOk) { const target = turb; ga += clamp(target - ga, -dt / 8, dt / 8); omega += (1 - omega) * Math.min(1, dt * 2); dH = 0; }
  else if (plantOk) {
    const before = ga; ga = Math.max(0, ga - dt / Tc); closing = ga < before;
    const pt = ga * Math.sqrt(head / 93);
    omega += dt * (pt * 1.05 - (omega - 1) * 0.08) / 7;
    if (ga === 0) omega += (0 - omega) * Math.min(1, dt / 9);
    // water hammer from closing: Michaud for slow closure, capped at Joukowsky
    dH = closing ? Math.min(2 * 180 * v0 / (9.81 * Tc), 1000 * v0 / 9.81) : dH * Math.exp(-dt * 4);
    peakW = Math.max(peakW, omega); peakP = Math.max(peakP, (head + dH) / Math.max(head, 1));
    if ((head + dH) / Math.max(1, head) > 1.9) penstockBurst();
    else if (omega > 1.8) runaway();
    if (ga === 0 && omega < 0.05 && now - tripAt > 4 && !touring) reconnect();
  } else { ga = Math.max(0, ga - dt / 3); omega += (0 - omega) * Math.min(1, dt / 4); }
  Qt = QTMAX * ga * Math.sqrt(head / 93) * (failed ? 0 : 1);
  Pmw = grid && plantOk ? 9.81 * Qt * head * 0.92 / 1000 : 0;
  // spillway gates
  gateOpen += clamp((jam ? gateOpen : gateCmd) - gateOpen, -dt / 6, dt / 6);
  const op = gateOpen * 14, hs = level - SPILL;
  Qs = hs <= 0 ? 0 : op <= 0.01 ? 0 : hs <= op ? 2.1 * 75 * Math.pow(hs, 1.5) : 0.62 * 75 * op * Math.sqrt(2 * 9.81 * Math.max(0, hs - op / 2));
  Qo = level > CREST && !failed ? 1.7 * 270 * Math.pow(level - CREST, 1.5) : 0;
  if (failed) { const t = now - failed.t, bottom = Math.max(0, CREST - t * 30); Qb = level > bottom ? 0.296 * Math.sqrt(9.81) * 90 * Math.pow(level - bottom, 1.5) : 0; } else Qb = 0;
  const Qburst = burst ? 400 * Math.sqrt(head / 93) : 0;
  level = Math.max(0, level + dt * (Qin - Qt - Qs - Qo - Qb * 2 - Qburst) / A_RES);
  // stability of a monolith, per metre of width
  const Wt = 2400 * 9.81 * 5000 * (1 - scour), U = 0.5 * 1000 * 9.81 * level * 80 * (drains ? 0.35 : 1), Fh = 0.5 * 1000 * 9.81 * level * level;
  FS = 0.75 * (Wt - U) / Math.max(1, Fh);
  if (Qo > 0) scour = Math.min(0.4, scour + dt * 0.0005 * Qo / 270);
  if (!failed && FS < 1) { fsLow += dt; if (fsLow > 1.2) breach(); } else fsLow = Math.max(0, fsLow - dt);
  river(dt, (Qt + Qs + Qo + Qb + Qburst) / B);
  // the flood takes the town
  HOUSES.forEach((hs2) => { if (hs2.gone) return; const w = depthAt(hs2.x); if (w.h > FLOOR + 3.5 && Math.abs(w.u) > 3) { hs2.gone = { t: now, x: 0, y: 0, z: 0, r: 0, vr: (rnd() - 0.5) * 3 }; } });
  if (!BRIDGE.gone) { const w = depthAt(BRIDGE.x); if (w.h > 13 && Math.abs(w.u) > 3) BRIDGE.gone = { t: now }; }
  HOUSES.forEach((hs2) => { const g2 = hs2.gone; if (!g2) return; const w = depthAt(hs2.x + g2.x); g2.x += Math.max(w.u, 2) * dt * 0.8; g2.r += g2.vr * dt; g2.z = Math.max(-6, w.h - FLOOR - 3 - (now - g2.t) * 0.6); });
  shake = Math.max(0, shake - dt * 0.7);
}
function tripGrid() {
  if (!grid || burst || wreck || failed) return;
  grid = false; tripAt = now; v0 = 7 * ga; peakW = 1; peakP = 1; closing = true;
  event("Grid trip: the line breaker opens and the generators suddenly have nothing to push against. The governor starts closing the wicket gates over " + Tc.toFixed(1) + " s.");
}
function reconnect() { if (burst || wreck || failed) return; grid = true; event("Back on the grid. Peak speed was " + Math.round(peakW * 100) + " %, peak penstock pressure " + Math.round(peakP * 100) + " % of normal."); }
function penstockBurst() {
  burst = { t: now }; grid = false; shake = 1.2; flashT = now;
  for (let i = 0; i < 80; i++) spray([45, 90, 50], 1.6);
  event("Water hammer. The gates slammed shut in " + Tc.toFixed(1) + " s and 180 m of moving water had nowhere to go: the pressure spike split the penstock. Close slower.");
}
function runaway() {
  wreck = { t: now }; grid = false; shake = 1.3; flashT = now;
  for (let i = 0; i < 60; i++) spark([105, 100, 30]);
  for (let i = 0; i < 20; i++) smokeP([105, 100, 32], 1.4);
  event("Runaway. The gates took " + Tc.toFixed(1) + " s to close, the unit hit " + Math.round(omega * 100) + " % speed and the generator rotor came apart. Close faster.");
}
function breach() {
  failed = { t: now }; shake = 2; flashT = now;
  const mid = [3, 4, 5, 6];
  for (const i of mid) { const m = MONO[i]; m.gone = { t: now, x: 0, z: 0, r: 0, vx: 6 + rnd() * 6, vr: 0.12 + rnd() * 0.2, dz: 0 }; }
  for (let i = 0; i < 120; i++) spray([60, -60 + rnd() * 120, 70], 2);
  event("It's going. The water was pushing harder than friction could hold" + (drains ? "" : ", the blocked drains let the uplift build") + (scour > 0.05 ? ", the overtopping scoured out the toe" : "") + ", and four monoliths slid off their foundation.");
}
function resetSite() {
  level = 96; scour = 0; fsLow = 0; failed = null; burst = null; wreck = null; grid = true; ga = turb; omega = 1; jam = false; drains = true; gateOpen = gateCmd; dH = 0;
  MONO.forEach((m) => (m.gone = false)); HOUSES.forEach((hh) => (hh.gone = null)); BRIDGE.gone = null;
  h.fill(2.5); hu.fill(4);
  event("Rebuilt. Same dam, same river, nobody learned anything.");
}

// ---------------- particles ----------------
let parts = [];
function spray(p, s) { const a = rnd() * Math.PI * 2; parts.push({ k: "spray", p: [...p], v: [20 + rnd() * 40 * s, Math.cos(a) * 30 * s, 20 + rnd() * 40 * s], life: 0, max: 1 + rnd(), s }); }
function spark(p) { const a = rnd() * Math.PI * 2; parts.push({ k: "spark", p: [...p], v: [Math.cos(a) * 60, Math.sin(a) * 60, 30 + rnd() * 60], life: 0, max: 0.6 + rnd() * 0.6, s: 1 }); }
function smokeP(p, s) { parts.push({ k: "smoke", p: [...p], v: [(rnd() - 0.5) * 6, (rnd() - 0.5) * 6, 10 + rnd() * 8], life: 0, max: 3 + rnd() * 2, s }); }
function mist(p, s) { parts.push({ k: "mist", p: [...p], v: [8 + rnd() * 12, (rnd() - 0.5) * 10, 4 + rnd() * 8], life: 0, max: 1.5 + rnd(), s }); }
// ---------------- drawing ----------------
const flashEl = stage.querySelector(".fx-flash");
let shakeOff = [0, 0], flowA = 0, spin = 0;
function drawParticles(dt) {
  parts = parts.filter((p) => {
    p.life += dt; if (p.life > p.max) return false;
    const t = p.life / p.max;
    if (p.k !== "smoke" && p.k !== "mist") p.v[2] -= 30 * dt;
    const o = [p.p[0], p.p[1], p.p[2]];
    for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * dt;
    if (p.k === "spray") E.sprite(p.p, 4 + 8 * t * p.s, lightTheme ? "#c4d4e2" : "#ebf5ff", 0.7 * (1 - t));
    if (p.k === "mist") E.sprite(p.p, 7 + 16 * t * p.s, lightTheme ? "#c4d0dc" : "#e6f0fa", 0.3 * Math.sin(Math.PI * t));
    if (p.k === "smoke") E.sprite(p.p, (8 + 26 * t) * p.s, "#3c3c40", 0.5 * (1 - t));
    if (p.k === "spark") E.line(o, p.p, 2, t < 0.5 ? "#ffe6a0" : "#ff8a3a", 1 - t, true);
    return true;
  });
}
function siteStatic() {
  const o = [], Rk = { mat: "matte" };
  // canyon floor upstream and downstream, the far wall in terraces, the near bank cut low
  o.push(box(X0, XE, -YW, YW, -3, 0, "#5b5146", Rk));
  [[X0, 0, 135], [0, 160, 118], [160, 340, 78], [340, XE, 46]].forEach(([x0, x1, ht], i) => {
    o.push(box(x0, x1, -235, -YW, 0, ht, i % 2 ? ROCK : "#776d61", { ...Rk, cap: "#7c7a58" }));
    for (let z = 14; z < ht - 4; z += 17) o.push(box(x0, x1, -YW, -YW + 1.2, z, z + 1.6, "#5d554b", { ...Rk, bevel: 0 }));
  });
  o.push(box(TOE + 8, XE, -YW, -CH, 0, FLOOR, "#6b7a4f", { ...Rk, cap: "#7d8f5a" }), box(TOE + 8, XE, CH, YW, 0, FLOOR, "#6b7a4f", { ...Rk, cap: "#7d8f5a" }));
  o.push(box(X0, 0, YW, 235, -3, 10, ROCK, { ...Rk, cap: ROCK2 }), box(TOE, XE, YW, 235, -3, 4, ROCK, { ...Rk, cap: ROCK2 }));
  o.push(box(0, TOE, YW, 235, -3, 1.2, "#4f463d", { ...Rk, cap: "#5f564b" }));
  // a few trees on the terraces, because a town has trees
  for (let n = 0; n < 16; n++) { const x = 270 + ((n * 61) % 250), y = (n % 2 ? 1 : -1) * (58 + ((n * 37) % 80)); o.push(lathe([[0, 0], [0.8, 0], [0.8, 3], [3.4, 3.4], [2.2, 7], [0, 10.5]], "#4f7a45", { c: [x, y, FLOOR], mat: "matte", seg: 8 })); }
  return o;
}
function draw(dt) {
  flowA += dt; spin += dt * omega * 9;
  const objs = [{ cache: "site", rev: 0, parts: siteStatic }], lv = Math.max(0.5, level), wet = [];
  // the dam: standing monoliths, sliding ones, gates
  MONO.forEach((m) => {
    if (!m.gone) { const ob = monoObj(m); ob.shell = true; ob.mat = "concrete"; objs.push(ob); return; }
    const g2 = m.gone, t = now - g2.t;
    g2.x = Math.min(160, g2.vx * t * t * 0.5 + t * 4); g2.r = Math.min(1.1, g2.vr * t * t); g2.dz = -Math.min(40, 8 * t * t * 0.3);
    const c = [TOE, 0, 0], cr = Math.cos(g2.r), sr = Math.sin(g2.r);
    const ob = monoObj(m, (p) => { const dx = p[0] - c[0], dz = p[2] - c[2]; return [c[0] + dx * cr + dz * sr + g2.x, p[1], c[2] - dx * sr + dz * cr + g2.dz]; }); ob.mat = "concrete"; objs.push(ob);
  });
  const gz = SPILL + gateOpen * 14, kit = [];
  for (let b = 0; b < 3; b++) { const y0 = -YW + 120 + 2.5 + b * 30, y1 = y0 + 25; if (!MONO[4 + b].gone) kit.push(box(3, 5, y0, y1, gz, gz + 12, jam ? "#a0522d" : "#3f6f8f", { mat: jam ? "matte" : "paint" })); }
  // penstocks down the face, from the intakes to the powerhouse
  for (const y of [72, 94, 116, 138]) kit.push(tube([[9, y, 80], [16, y, 76], [TOE - 6, y, 16], [TOE + 4, y, 10]], 2.4, "#5d6b74", { mat: "steel", seg: 10 }));
  // inside the dam: the drainage gallery and its drains, and what the water is doing underneath
  if (!failed) { kit.push(box(8, 12, -YW + 4, YW - 4, 8, 12.5, "#3a3d42", { mat: "matte", emit: ["#ffd97a", 0.25] })); for (let y = -135; y <= 135; y += 30) kit.push(tube([[10, y, 8], [10, y, -2.5]], 0.5, drains ? "#5aa0d8" : "#7a4a2e", { mat: "steel", seg: 5 })); }
  objs.push({ parts: kit });
  // powerhouse (the casing goes to glass in x-ray), and the four units inside: generator on top, turbine runner below
  const ph = [];
  if (wreck) ph.push(box(TOE, TOE + 44, 62, 146, 0, 20, "#7d776c", { cap: "#3b3732", mat: "concrete" }));
  else { ph.push(box(TOE, TOE + 44, 62, 146, 0, 26, "#c9c3b5", { cap: "#8f897d", mat: "concrete", shell: true }), ...[70, 92, 114, 136].map((y) => box(TOE + 44, TOE + 50, y - 6, y + 6, 0, 3, "#5d6b74", { mat: "steel" })));
    for (const y of [72, 94, 116, 138]) { const c = [TOE + 22, y, 0], on = grid && Pmw > 5; ph.push(lathe([[0, 14], [6.5, 14], [6.5, 21], [5, 22.5], [0, 22.5]], "#c9a43a", { c, mat: "paint", seg: 18, emit: on ? ["#ffd97a", 0.25] : undefined }), tube([[c[0], y, 5], [c[0], y, 14]], 0.9, "#aeb4bb", { mat: "steel", seg: 8 }), lathe([[0, 3], [4.6, 3.6], [3.4, 7], [1.2, 8], [0, 8]], "#7f8b96", { c, mat: "metal", seg: 14 }));
      for (let b2 = 0; b2 < 3; b2++) { const a = spin + (b2 * Math.PI * 2) / 3, mx = c[0] + Math.cos(a) * 4, my = y + Math.sin(a) * 4; ph.push(box(mx - 0.6, mx + 0.6, my - 0.6, my + 0.6, 22.6, 23.6, "#e2501a", { mat: "paint", bevel: 0 })); } } }
  objs.push({ parts: ph });
  // town: houses (lit if the plant's feeding the grid), the bridge, and whatever's floating away
  const lit = Pmw > 50;
  HOUSES.forEach((hs2) => { const g2 = hs2.gone; if (g2 && now - g2.t > 9) return; objs.push(g2 ? { mat: "matte", parts: houseParts(hs2, false), xf: (p) => { const dx = p[0] - hs2.x, dy = p[1] - hs2.y, c = Math.cos(g2.r), s2 = Math.sin(g2.r); return [hs2.x + g2.x + dx * c - dy * s2, hs2.y + dx * s2 + dy * c, p[2] + g2.z]; } } : { mat: "matte", parts: houseParts(hs2, lit) }); });
  if (!BRIDGE.gone || now - BRIDGE.gone.t < 6) { const g2 = BRIDGE.gone, t = g2 ? now - g2.t : 0; objs.push({ mat: "concrete", parts: bridgeParts(), xf: g2 ? (p) => [p[0] + t * 14 + Math.abs(p[1]) * 0.05 * t, p[1], p[2] - t * 3] : undefined }); }
  // water. The reservoir is a block of it; anything spilling is a sheet down the face; the river is a strip per cell of the flood model
  const WAT = { mat: "water", rough: 0.08 };
  wet.push(box(X0, 0, -YW, YW, 0.2, lv, "#2f6f9c", { ...WAT, opacity: lightTheme ? 0.72 : 0.62 }));
  const sheet = (y0, y1, q, top) => { const tk = clamp(q / 3000, 0.25, 1), a = [8, y0, top + 0.6], b = [8, y1, top + 0.6], c = [TOE + 6, y1, 2 + 3 * tk], d = [TOE + 6, y0, 2 + 3 * tk]; wet.push(tris([[a, b, c], [a, c, d]], "#d6ecf8", { ...WAT, opacity: 0.5 + 0.4 * tk })); for (let n = 0; n < 5; n++) { const y = y0 + ((n + 0.5) * (y1 - y0)) / 5, f = (flowA * 1.3 + n * 0.37) % 1, g = Math.min(1, f + 0.18); E.line([8 + (TOE - 2) * f, y, top + 1.2 - (top - 3) * f], [8 + (TOE - 2) * g, y, top + 1.2 - (top - 3) * g], 2, "#ffffff", 0.7); } };
  if (Qs > 20) sheet(-30 + 2.5, 60 - 2.5, Qs, SPILL + 1);
  if (Qo > 5) for (const m of MONO) if (!m.gone) sheet(m.y0 + 0.5, m.y1 - 0.5, Qo / 9, m.spill ? SPILL + 1 : CREST);
  if (failed) { const bottom = Math.max(0, CREST - (now - failed.t) * 30), lv2 = Math.max(level, 2), z1 = Math.max(4, bottom * 0.3); wet.push(tris([[[-20, -60, lv2], [-20, 60, lv2], [TOE + 40, 60, z1]], [[-20, -60, lv2], [TOE + 40, 60, z1], [TOE + 40, -60, z1]]], "#bcd8ea", { ...WAT, opacity: 0.85 })); }
  if (burst) wet.push(tris([[[50, 88, 45], [50, 100, 45], [70, 106, 75 + Math.sin(now * 20) * 4]], [[50, 88, 45], [70, 106, 75 + Math.sin(now * 20) * 4], [62, 84, 72]]], "#d6ecf8", { ...WAT, opacity: 0.8 }));
  const hex = (r, g, b) => "#" + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");
  for (let i = 0; i < N - 1; i++) {
    const xa = XS + i * DX, xb = xa + DX, ha = h[i], hb = h[i + 1];
    if (ha < 0.05 && hb < 0.05) continue;
    const u = Math.abs(hu[i] / Math.max(h[i], 0.05)), fr = u / Math.sqrt(9.81 * Math.max(h[i], 0.05)), foam = clamp((fr - 1.1) * 0.5, 0, 0.55) + clamp((h[i] - 12) / 60, 0, 0.15);
    const col = hex(60 + 160 * foam, 115 + 110 * foam, 150 + 80 * foam), over = ha > FLOOR || hb > FLOOR, yw = over ? YW - 2 : CH, za = over ? Math.max(ha, FLOOR + 0.1) : ha, zb = over ? Math.max(hb, FLOOR + 0.1) : hb;
    const q = [[xa, -yw, za], [xb, -yw, zb], [xb, yw, zb], [xa, yw, za]];
    wet.push(tris([[q[0], q[1], q[2]], [q[0], q[2], q[3]]].concat(over ? [[[xa, yw, FLOOR], [xb, yw, FLOOR], q[2]], [[xa, yw, FLOOR], q[2], q[3]]] : []), col, { mat: "gloss", rough: 0.12 + foam }));
  }
  objs.push({ parts: wet });
  let svg = E.render(objs);
  // ripples on the reservoir; pressure under the dam (short and blue with the drains working, long and red without)
  for (let i = 0; i < 8; i++) { const x = X0 + 30 + ((i * 97 + flowA * 12) % 300), y = -YW + 20 + ((i * 53) % 260); E.line([x, y, lv + 0.3], [x + 18, y, lv + 0.3], 1.2, "#ffffff", 0.3); }
  if (E.xray > 0.05 && !failed) for (let x = 6; x < TOE; x += 12) { const up = drains ? Math.max(1.5, 14 * (1 - x / 30)) : 6 + 16 * (1 - x / TOE) * (lv / 100); E.line([x, YW - 6, -2], [x, YW - 6, -2 + up], 2.5, drains ? "#5aa0d8" : "#ff5a2a", E.xray, !lightTheme); }
  if (E.xray > 0.02 && !failed) svg += E.callouts([
    { p: [-120, 100, lv], text: "Reservoir", sub: "its weight is trying to push the dam downstream" }, { p: [4, -15, CREST + 4], text: "Spillway gates", sub: "the only safe way over the top" }, { p: [40, 94, 50], text: "Penstocks", sub: "water down to the turbines" },
    { p: [TOE + 22, 138, 20], text: "Powerhouse", sub: "four units: generator over turbine" }, { p: [10, 60, 10], text: "Drainage gallery", sub: drains ? "bleeds off the water pressure under the dam" : "blocked: uplift is prising the dam off its base" }, { p: [300, 0, 3], text: "Tailrace", sub: "" },
  ], E.xray);
  sceneG.innerHTML = svg;
  // spray at the bottom of anything falling
  if (Qs > 200 && rnd() < dt * (4 + Qs / 800)) mist([TOE + 10, -10 + rnd() * 70, 4], 1 + Qs / 4000);
  if (Qo > 50 && rnd() < dt * 10) mist([TOE + 8, -YW + rnd() * 300, 4], 1.5);
  if (failed && now - failed.t < 8) for (let i = 0; i < 4; i++) spray([TOE + rnd() * 40, -60 + rnd() * 120, 10 + rnd() * 20], 1.5);
  if (burst) spray([62, 92, 70], 1);
  if (wreck && rnd() < dt * 6) smokeP([105, 100, 28], 1);
  const amp = shake * 6;
  shakeOff = amp > 0.05 ? [(rnd() - 0.5) * amp, (rnd() - 0.5) * amp] : [0, 0];
  setShake(shakeOff[0], shakeOff[1]);
  const ft = now - flashT; flashEl.style.opacity = ft < 0.4 ? String((1 - ft / 0.4) * 0.6) : "0";
  drawParticles(dt);
  const text = failed ? "DAM FAILED" : burst ? "PENSTOCK BURST" : wreck ? "UNIT DESTROYED" : (grid ? Math.round(Pmw) + " MW" : "TRIPPED · " + Math.round(omega * 100) + " % speed") + " · level " + level.toFixed(1) + " m · FS " + FS.toFixed(2);
  if (readout.textContent !== text) readout.textContent = text;
}

// ---------------- UI ----------------
const ui = {
  inflow: document.querySelector("#inflow"), inOut: document.querySelector("#in-out"), pres: [...document.querySelectorAll("[data-q]")],
  turb: document.querySelector("#turb"), turbOut: document.querySelector("#turb-out"), gates: document.querySelector("#gates"), gatesOut: document.querySelector("#gates-out"),
  tc: document.querySelector("#tc"), tcOut: document.querySelector("#tc-out"), trip: document.querySelector("#trip"), jamB: document.querySelector("#jam"), drainB: document.querySelector("#drains"),
  fresh: document.querySelector("#fresh"), slow: document.querySelector("#slow"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"),
  lF: document.querySelector("#l-fill"), lO: document.querySelector("#l-out"), pF: document.querySelector("#p-fill"), pO: document.querySelector("#p-out"), fF: document.querySelector("#fs-fill"), fO: document.querySelector("#fs-out"), sF: document.querySelector("#s-fill"), sO: document.querySelector("#s-out"), stats: document.querySelector("#stats"),
};
const qFromSlider = (v) => Math.round(100 * Math.pow(150, v / 100));
const sliderFromQ = (qq) => 100 * Math.log(qq / 100) / Math.log(150);
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };
function syncUi() {
  ui.inflow.value = String(sliderFromQ(Qin).toFixed(0)); ui.inOut.textContent = Qin.toLocaleString("en-AU") + " m³/s";
  ui.turb.value = String(Math.round(turb * 100)); ui.turbOut.textContent = Math.round(turb * 100) + " %";
  ui.gates.value = String(Math.round(gateCmd * 100)); ui.gatesOut.textContent = Math.round(gateOpen * 100) + " % open";
  ui.tc.value = String(Tc); ui.tcOut.textContent = Tc.toFixed(1) + " s";
  ui.jamB.setAttribute("aria-pressed", String(jam)); ui.drainB.setAttribute("aria-pressed", String(!drains)); ui.drainB.textContent = drains ? "Drains clear" : "Drains blocked";
  ui.lF.style.width = clamp(level / 125 * 100, 0, 100).toFixed(1) + "%"; ui.lF.dataset.state = level > CREST ? "bad" : level > 99 ? "warn" : "ok"; ui.lO.textContent = level.toFixed(1) + " m";
  ui.pF.style.width = clamp(Pmw / 1100 * 100, 0, 100).toFixed(1) + "%"; ui.pO.textContent = Math.round(Pmw) + " MW";
  ui.fF.style.width = clamp(FS / 2.5 * 100, 0, 100).toFixed(1) + "%"; ui.fF.dataset.state = FS < 1.1 ? "bad" : FS < 1.4 ? "warn" : "ok"; ui.fO.textContent = failed ? "gone" : FS.toFixed(2);
  const sp2 = grid ? 1 : omega, pr = burst ? 2 : grid ? 1 : (Math.max(level - TAIL, 1) + dH) / Math.max(level - TAIL, 1);
  ui.sF.style.width = clamp((sp2 - 0.5) / 1.5 * 100, 0, 100).toFixed(1) + "%"; ui.sF.dataset.state = sp2 > 1.6 || pr > 1.7 ? "bad" : sp2 > 1.3 || pr > 1.4 ? "warn" : "ok";
  ui.sO.textContent = Math.round(sp2 * 100) + " % · " + Math.round(pr * 100) + " %";
  ui.stats.innerHTML = "in <b>" + Math.round(Qin).toLocaleString("en-AU") + "</b> · turbines <b>" + Math.round(Qt) + "</b> · spillway <b>" + Math.round(Qs) + "</b>" + (Qo > 1 ? " · <b>over the top " + Math.round(Qo).toLocaleString("en-AU") + "</b>" : "") + (Qb > 1 ? " · <b>breach " + Math.round(Qb).toLocaleString("en-AU") + "</b>" : "") + " m³/s · enough for about <b>" + (Pmw * 1.4 >= 1000 ? (Pmw * 1.4 / 1000).toFixed(1) + " million" : Math.round(Pmw * 1.4) + " thousand") + "</b> homes";
  ui.slow.setAttribute("aria-pressed", String(slow)); ui.tour.setAttribute("aria-pressed", String(touring));
}
function story() {
  if (now - lastEventAt < 6 && lastEvent) return say(lastEvent);
  if (touring && tourStep >= 0 && TOUR[tourStep].say) return say(TOUR[tourStep].say);
  if (failed) return;
  if (FS < 1.2) return say("Factor of safety " + FS.toFixed(2) + ". The water's pushing almost as hard as friction can hold" + (drains ? "" : ", and with the drains blocked the uplift is lifting the dam off its own foundation") + ".");
  if (Qo > 0) return say("Overtopping. A concrete dam can take some water over the crest, but it's scouring the rock at the toe, and every metre it digs out takes grip away.");
  if (level > CREST - 3 && Qin > Qt + Qs) return say("The lake's still rising: " + Math.round(Qin).toLocaleString("en-AU") + " m³/s coming in, " + Math.round(Qt + Qs).toLocaleString("en-AU") + " going out. Open the spillway gates.");
  if (!grid) return say("Tripped: closing the gates fast means a pressure spike in the penstock (water hammer), closing them slowly means the unit overspeeds. Somewhere in between is the answer.");
  return say("Power is ρ·g·Q·H: " + Math.round(Qt) + " m³/s falling " + Math.round(level - TAIL) + " m makes " + Math.round(Pmw) + " MW. The dam stays put by its own weight against the water's push.");
}
const TOUR = [
  { say: "A 100 m concrete gravity dam making power: water falls down the penstocks, spins four turbines, and the town's lights are on.", acts: [[0, () => { resetSite(); Qin = 1500; turb = 1; gateCmd = 0; Tc = 6; }], [8, null]] },
  { say: "The grid trips. The governor closes the turbine gates over 6 s: a bit of overspeed, a bit of pressure, no harm done.", acts: [[0, () => { Tc = 6; tripGrid(); }], [7, () => reconnect()], [9, null]] },
  { say: "Again, but the gates slam shut in 1.5 s.", acts: [[0, () => { resetSite(); Tc = 1.5; }], [1, () => tripGrid()], [9, null]] },
  { say: "Again, but the gates take 18 s to close.", acts: [[0, () => { resetSite(); Tc = 18; }], [1, () => tripGrid()], [12, null]] },
  { say: "Now a flood: 9,000 m³/s coming down the river. Spillway gates wide open.", acts: [[0, () => { resetSite(); Tc = 6; Qin = 9000; gateCmd = 1; }], [12, null]] },
  { say: "Same flood, but one spillway gate's jammed and the foundation drains are blocked.", acts: [[0, () => { gateCmd = 0; gateOpen = 0; jam = true; drains = false; Qin = 14000; }], [32, null]] },
];
function tourTick() {
  if (tourStep < 0 || !actions.length) { tourStep = (tourStep + 1) % TOUR.length; actions = TOUR[tourStep].acts.map(([w, fn]) => [tourClock + w, fn]); }
  while (actions.length && tourClock >= actions[0][0]) { const fn = actions.shift()[1]; if (fn) fn(); else actions = []; }
  if (failed && now - failed.t > 12) actions = [];
}
function tick(t) {
  const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
  last = t;
  const sdt = dt * (slow ? 0.2 : 1);
  now += sdt;
  if (touring) { tourClock += sdt; tourTick(); }
  physics(sdt); draw(sdt); syncUi(); story();
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { if (touring) { touring = false; actions = []; tourStep = -1; } };
const act = (fn) => (...a) => { takeOver(); fn(...a); syncUi(); run(); };
ui.inflow.addEventListener("input", act(() => { Qin = qFromSlider(+ui.inflow.value); }));
ui.pres.forEach((b) => b.addEventListener("click", act(() => { Qin = +b.dataset.q; })));
ui.turb.addEventListener("input", act(() => { turb = +ui.turb.value / 100; }));
ui.gates.addEventListener("input", act(() => { gateCmd = +ui.gates.value / 100; }));
ui.tc.addEventListener("input", act(() => { Tc = +ui.tc.value; }));
ui.trip.addEventListener("click", act(() => { if (grid) tripGrid(); else reconnect(); }));
ui.jamB.addEventListener("click", act(() => { jam = !jam; }));
ui.drainB.addEventListener("click", act(() => { drains = !drains; }));
ui.fresh.addEventListener("click", act(() => resetSite()));
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; actions = []; } syncUi(); run(); });
stage.addEventListener("keydown", (ev) => {
  const map = { x: () => setX(!E.xrayOn), t: () => (grid ? tripGrid() : reconnect()), f: () => { Qin = 14000; }, g: () => { gateCmd = gateCmd > 0.5 ? 0 : 1; }, j: () => { jam = !jam; }, d: () => { drains = !drains; }, r: () => resetSite() };
  if (map[ev.key]) { ev.preventDefault(); act(map[ev.key])(); }
  if (ev.key === "s") { slow = !slow; run(); }
});
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;
window.__fig = { E, freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
for (let i = 0; i < 400; i++) river(0.1, 1500 / B);
draw(0); syncUi(); story();
`;

const CSS = `.fx-flash{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(circle 60% at 50% 50%,#ffffff 0%,#dfefff 40%,rgba(200,225,255,0) 100%)}`;

const stage = stageHtml({
  W, H, fig: "Fig 22", title: "Hydro dam", xray: true,
  label: "A concrete gravity dam across a canyon with a gated spillway, penstocks and a powerhouse, a reservoir behind it and a small town on the river below. An x-ray mode shows the drainage gallery, the pressure under the dam and the generators.",
  keysHelp: "Hydro dam: drag to rotate, X for x-ray, T trips the grid, F brings a flood, G opens the spillway gates, J jams a gate, D blocks the drains",
  extra: `<div class="fx-flash" aria-hidden="true"></div>`,
});

const CONTROLS = `<div class="ctl" role="group" aria-label="Controls">
  <div class="ctl-row"><span class="ctl-label">River</span><div class="slide"><input id="inflow" type="range" min="0" max="100" step="1" value="58" aria-label="Inflow to the reservoir"></div><output id="in-out">1,500 m³/s</output></div>
  <div class="ctl-row"><span class="ctl-label">Weather</span><button type="button" data-q="300">Dry<small>300</small></button><button type="button" data-q="1500">Wet season<small>1,500</small></button><button type="button" data-q="9000">Flood<small>9,000</small></button><button type="button" data-q="14000">Monster flood<small>14,000 m³/s</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Turbines</span><div class="slide"><input id="turb" type="range" min="0" max="100" step="1" value="100" aria-label="Turbine gate opening"></div><output id="turb-out">100 %</output></div>
  <div class="ctl-row"><span class="ctl-label">Spillway</span><div class="slide"><input id="gates" type="range" min="0" max="100" step="1" value="0" aria-label="Spillway gate opening"></div><output id="gates-out">0 % open</output></div>
  <div class="ctl-row"><span class="ctl-label">Close in</span><div class="slide"><input id="tc" type="range" min="0.5" max="25" step="0.5" value="6" aria-label="Turbine gate closing time after a trip, seconds"></div><output id="tc-out">6.0 s</output></div>
  <div class="ctl-row"><span class="ctl-label">Break it</span><button type="button" id="trip" class="danger">Trip the grid<small>load rejection</small></button><button type="button" id="jam" aria-pressed="false">Jam the gates<small>spillway stuck</small></button><button type="button" id="drains" aria-pressed="false">Drains clear</button></div>
  <div class="ctl-row"><span class="ctl-label">Lake</span><div class="meter"><span id="l-fill" class="fill"></span><span class="mark" style="left:${(102 / 125 * 100).toFixed(1)}%" data-label="crest"></span></div><output id="l-out">96 m</output></div>
  <div class="ctl-row"><span class="ctl-label">Power</span><div class="meter"><span id="p-fill" class="fill"></span></div><output id="p-out">0 MW</output></div>
  <div class="ctl-row"><span class="ctl-label">Holding</span><div class="meter"><span id="fs-fill" class="fill"></span><span class="mark" style="left:40%" data-label="1.0 = slides"></span></div><output id="fs-out">1.8</output></div>
  <div class="ctl-row"><span class="ctl-label">Unit</span><div class="meter"><span id="s-fill" class="fill"></span></div><output id="s-out">speed · pressure</output></div>
  <div class="ctl-row wide"><span class="ctl-label">Flows</span><span id="stats"></span></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="fresh">Rebuild</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
</div>`;


const foot = footHtml({
  theme, slug: "dam",
  real: "P = ρgQH, the forces on a gravity dam (water pressure, uplift, weight) and the sliding check, foundation drains to cut uplift, weir and gate flow, overtopping scouring the toe, the dam-break outflow, shallow-water flood waves, water hammer (Joukowsky and Michaud) against overspeed after a load rejection. Real failures: St Francis (1928, a gravity dam that failed at its foundation) and Teton (1976).",
  made: "the dam, the site, the tiny reservoir and the sped-up time, every coefficient, the town, and failure picked to happen on cue.",
});
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), pageMk2({
  k, title: "Hydro dam", fig: "Fig 22", hint: "Make power, then make a flood", theme, W, H, stage, controls: CONTROLS, css: CSS, foot,
  caption: "A hydro dam turns height into power: water falls down the penstocks, spins the turbines, and the power is ρ·g·Q·H, the flow times the fall. A concrete gravity dam stays put by being heavy. The lake pushes it sideways, water seeping underneath pushes it up (uplift), and the only thing holding it is friction on the rock under its own weight. Drains in the foundation bleed off the uplift. In a flood the spillway passes the extra water; if it can't, the lake goes over the top and starts digging out the rock at the toe. And when the grid trips, the turbines suddenly have nothing to push against: close their gates too fast and the moving water slams into them, too slow and they run away.",
  script: LIVE.replace("__DATA__", JSON.stringify(DATA)),
}));
console.log("wrote", name);
