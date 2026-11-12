import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { engineScript, stageHtml, pageMk2, footHtml } from "../../mk2/shell.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const W = 960, H = 600;

// Truth (GE9X, GE Aerospace / Key Aero): 3.4 m (134 in) fan, 16 composite blades, 3-stage booster, 11-stage HPC at 27:1,
// CMC combustor liners, 2-stage HPT, 6-stage TiAl LPT, bypass about 10:1, overall pressure ratio 60:1, about 100,000 lbf
// take-off, 134,300 lbf (597 kN) record on test. Certification needs a fan blade released at full power to stay inside the
// case, and bird ingestion. Toy: the engine model (spool times, EGT, thrust curve), the failure behaviour and the stand.
const ZC = 300;
const PLATE = { x: -300, y: -200, w: 620, d: 400, r: 16 };
const P = k.fitProjection([...k.boxCorners(PLATE, -0.8, 0), [-270, -210, 512], [300, -210, 512], [300, 210, 512], [-270, 210, 512]], W, H, { pad: 16, azimuth: 45, elevation: 30 });
const DATA = { W, H, P, PLATE };

const LIVE = `
${engineScript()}
const D = __DATA__;
const stage = document.querySelector(".mk-stage");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lightTheme = document.body.dataset.theme === "light";
const E = mk2(stage, D.P, { W: D.W, H: D.H, pivot: [20, 0, 300], plate: { ...D.PLATE, h: 16, foot: 6 }, shadowBox: [-320, -230, -25, 340, 230, 520] });
const { box, cyl, prism, circle, lathe, tube, sphere, loft, roundPoly, rrect, tris } = E;
E.bindTools(stage);
const xbtn = stage.querySelector('[data-mk="xray"]');
const setX = (on) => { E.setXray(on); if (xbtn) xbtn.setAttribute("aria-pressed", String(on)); };
const sceneG = stage.querySelector('[data-part="scene"]');
const iso = (p) => E.project(p), depthOf = (p) => E.depthOf(p);
const shakeEls = [stage.querySelector(".mk-gl"), stage.querySelector(".mk-over")];
const setShake = (x, y) => { const t = x || y ? "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px)" : ""; for (const e of shakeEls) if (e.style.transform !== t) e.style.transform = t; };
const ZC = 300, flashEl = stage.querySelector(".fx-flash");
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const pt = (x, r, f) => [x, r * Math.cos(f), ZC + r * Math.sin(f)];
const lerpProf = (prof, x) => { for (let i = 0; i < prof.length - 1; i++) { const [x0, r0] = prof[i], [x1, r1] = prof[i + 1]; if ((x <= x0 && x >= x1) || (x >= x0 && x <= x1)) return r0 + (r1 - r0) * ((x - x0) / (x1 - x0 || 1)); } return prof[x > prof[0][0] ? 0 : prof.length - 1][1]; };
// ---------------- geometry (cm, x forward, inlet at +x) ----------------
const NAC_OUT = [[300, 186], [292, 198], [270, 205], [210, 208], [120, 204], [40, 195], [-40, 181]];
const NAC_IN = [[300, 186], [292, 176], [270, 172], [220, 171], [200, 170], [150, 170], [60, 168], [-40, 166]];
const CORE_OUT = [[160, 74], [140, 82], [100, 92], [60, 96], [10, 94], [-60, 86], [-130, 76], [-185, 67]];
const CORE_IN = [[160, 72], [150, 70], [130, 68], [112, 62], [60, 54], [2, 46], [-8, 52], [-25, 58], [-60, 58], [-68, 54], [-90, 56], [-120, 62], [-160, 66], [-185, 65]];
const HUB = [[200, 55], [175, 52], [160, 50], [130, 48], [112, 39], [2, 36], [-8, 34], [-60, 34], [-68, 38], [-90, 40], [-120, 42], [-185, 44], [-200, 40], [-265, 2]];
const COWL_IN = CORE_OUT.map(([x, r], i) => [x, i === 0 ? r : r - 3.5]);
const CASE_OUT = CORE_IN.map(([x, r], i) => [x, i === 0 ? r : r + 3.5]);
const SPIN = [[274, 0], [262, 22], [240, 40], [215, 52], [200, 55]];
const ROWS = [];
// fan exit guide vanes (still), booster, HPC, HPT, LPT
for (let i = 0; i < 3; i++) ROWS.push({ kind: "boost", x: 155 - 14 * i, n: 13, col: "#9aa3ad", chord: 8, tw: 0.25, spool: 1 });
for (let i = 0; i < 11; i++) ROWS.push({ kind: "hpc", x: 106 - 10.4 * i, n: 13, col: i < 6 ? "#b4bac1" : "#b8ab98", chord: 6, tw: 0.3, spool: 2 });
for (let i = 0; i < 2; i++) ROWS.push({ kind: "hpt", x: -70 - 13 * i, n: 12, col: "#c49a6c", chord: 8, tw: -0.35, spool: 2 });
for (let i = 0; i < 6; i++) ROWS.push({ kind: "lpt", x: -98 - 14.5 * i, n: 14, col: "#8d8780", chord: 7, tw: -0.3, spool: 1 });
ROWS.forEach((r) => { r.rIn = lerpProf(HUB, r.x) + 1; r.rOut = lerpProf(CORE_IN, r.x) - 1; });
const OGV = { x: 128, n: 14, rIn: lerpProf(CORE_OUT, 128) + 1, rOut: lerpProf(NAC_IN, 128) - 1 };
// ---------------- the engine model (toy, scaled to a GE9X-class engine) ----------------
let ab = false, abLit = 0, abBang = -9, thr = 0.0, fadec = true, n1 = 0.2, n2 = 0.62, egt = 480, egtSpike = 0, F = 0, vib = 0.03, dmgFan = 0, hpt = 0;
let state = "run", stateAt = 0, lastShot = "", lastEvent = "", lastEventAt = -10, fanA = 0, coreA = 0, lpA = 0;
let now = 0, last = 0, frame = 0, visible = false, touring = true, slow = false, tourClock = 0, tourStep = -1, actions = [];
let birds = [], bladeOff = null, burst = null, surges = [], dent = null, tips = new Array(16).fill(1), shake = 0, flashT = -9, fireT = -9;
const event = (t) => { lastEvent = t; lastEventAt = now; };
const setState = (s) => { state = s; stateAt = now; };
let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const kOf = (n) => Math.max(0, (n - 0.2) / 0.8);
function step(dt) {
  const running = state === "run" || state === "surging";
  const cmd = state === "run" ? 0.2 + 0.8 * thr : state === "surging" ? 0.2 + 0.8 * thr * 0.7 : 0.0;
  const tau = cmd > n1 ? 2.2 : state === "seized" ? 0.9 : 1.6;
  n1 += (cmd - n1) * Math.min(1, dt / tau);
  n2 += ((running ? 0.62 + 0.38 * kOf(n1) : n1 * 0.9) - n2) * Math.min(1, dt / 1.2);
  const k = kOf(n1);
  let egtT = running ? 470 + 480 * Math.pow(k, 1.25) : 120 + 200 * n1;
  if (fadec && egtT > 1060) egtT = 1060;
  egt += (egtT + egtSpike - egt) * Math.min(1, dt / 1.4);
  egtSpike *= Math.exp(-dt * 1.2);
  const abOn = ab && running && n1 > 0.85 ? 1 : 0;
  if (abOn && abLit < 0.05 && now - abBang > 1) { abBang = now; flashT = now; shake = Math.max(shake, 0.35); }
  abLit += (abOn - abLit) * Math.min(1, dt / 0.35);
  F = running ? 445 * (0.03 + 0.97 * Math.pow(k, 1.8)) * (1 - dmgFan * 0.25) * (1 + 0.5 * abLit) : 0;
  vib += ((0.03 + dmgFan * 1.6 * n1 + (bladeOff ? 6 * n1 : 0)) - vib) * Math.min(1, dt / 0.4);
  // too hot for too long with the FADEC switched off: the HP turbine lets go
  if (running && !fadec && egt > 1090) { hpt += dt * (egt - 1090) / 45; if (hpt > 1) turbineBurst(); }
  // surges come in pairs and threes after a flock
  surges = surges.filter((s) => { if (now >= s) { surge(); return false; } return true; });
  if (state === "surging" && now - stateAt > 0.9) setState("run");
  if ((state === "shutdown" || state === "seized") && now - stateAt > (state === "seized" ? 8.5 : 6.5)) newEngine();
}
function newEngine() { ab = false; abLit = 0; setState("run"); dmgFan = 0; hpt = 0; bladeOff = null; burst = null; dent = null; tips = new Array(16).fill(1); egtSpike = 0; vib = 0.03; fadec = true; thr = Math.min(thr, 1); n1 = 0.2; n2 = 0.62; egt = 480; event("Fresh engine on the stand. FADEC back on."); }
function surge() {
  if (state !== "run" && state !== "surging") return;
  setState("surging"); egtSpike += 260; n1 *= 0.86; flashT = now; shake = Math.max(shake, 0.5);
  for (let i = 0; i < 40; i++) flame(190 + rnd() * 90, (rnd() - 0.5) * 100, (rnd() - 0.5) * 100, 220 + rnd() * 260, 1);
  for (let i = 0; i < 40; i++) flame(-200, (rnd() - 0.5) * 60, (rnd() - 0.5) * 60, -300 - rnd() * 260, 1.2);
}
function birdHit(b) {
  const big = b.flock;
  dmgFan = Math.min(1, dmgFan + (big ? 0.25 : 0.12));
  const bl = Math.floor(rnd() * 16); tips[bl] = Math.min(tips[bl], 0.93 - (big ? 0.06 : 0));
  for (let i = 0; i < 26; i++) feather(200, b.y + (rnd() - 0.5) * 30, b.z + (rnd() - 0.5) * 30);
  if (Math.abs(b.z) + Math.abs(b.y) < 70 && rnd() < 0.6) egtSpike += 60;
  if (big && dmgFan > 0.6 && state === "run") { surges.push(now + 0.25, now + 1.1, now + 1.9); setTimeout(() => {}, 0); shutdownAt = now + 2.6; }
}
let shutdownAt = null;
function bladeRelease() {
  if (state !== "run" && state !== "surging") return;
  // release the blade that's on the far, upper side so you can see it hit the case
  const a = Math.PI * 0.82, idx = ((Math.round(((a - fanA) / (Math.PI * 2)) * 16) % 16) + 16) % 16;
  bladeOff = { t: now, idx, a: fanA + (idx / 16) * Math.PI * 2, r: 110, frags: [] };
  tips[idx] = 0;
  setState("seized"); shake = 1.6; flashT = now;
  dent = { a: bladeOff.a + 0.25, x: 200 };
  for (let i = 0; i < 16; i++) if (i !== idx) tips[i] = Math.min(tips[i], 0.45 + rnd() * 0.4);
  for (let i = 0; i < 14; i++) bladeOff.frags.push({ x: 200 + (rnd() - 0.5) * 30, r: 140 + rnd() * 25, a: bladeOff.a + rnd() * 0.6, va: 9 + rnd() * 9, vx: -(120 + rnd() * 200), s: 6 + rnd() * 12, rot: rnd() * 6 });
  for (let i = 0; i < 90; i++) { const p = pt(205, 168, dent.a + (rnd() - 0.5) * 0.3); spark(p, 1.4); }
  event("Fan blade off at full power. It hits the case at well over 1,000 km/h, the carbon case holds it, and the next blades chew the rest. Contained: that's the certification test passed. Engine's scrap.");
}
function turbineBurst() {
  if (burst) return;
  burst = { t: now, chunks: [] };
  setState("shutdown"); shake = 1.4; flashT = now; fireT = now; egtSpike = 0;
  for (let i = 0; i < 9; i++) { const a = Math.PI / 2 + rnd() * Math.PI; burst.chunks.push({ p: pt(-76, 56, a), v: [(rnd() - 0.5) * 300, Math.cos(a) * (500 + rnd() * 400), Math.sin(a) * (500 + rnd() * 400)], s: 4 + rnd() * 6 }); }
  for (let i = 0; i < 70; i++) spark(pt(-76, 60, Math.PI / 2 + rnd() * Math.PI), 1.2);
  event("HP turbine burst. With the FADEC off nothing trimmed the fuel, the blades crept and let go, and a disc that size is too heavy to contain. That's why the limits exist.");
}

// ---------------- particles ----------------
let parts = [], showLabels = true;
const TAU = Math.PI * 2, HALF = Math.PI / 2;
function flow(kind) { parts.push({ kind, x: 430 + rnd() * 40, s: rnd(), f: rnd() < 0.55 ? (rnd() < 0.5 ? HALF : -HALF) : rnd() * TAU, life: 0, max: 99 }); }
function flame(x, y, z, vx, s) { parts.push({ kind: "flame", p: [x, y, ZC + z], v: [vx, (rnd() - 0.5) * 60, (rnd() - 0.5) * 60], life: 0, max: 0.5 + rnd() * 0.5, s }); }
function feather(x, y, z) { parts.push({ kind: "feather", p: [x, y, ZC + z], v: [-(200 + rnd() * 300), (rnd() - 0.5) * 120, (rnd() - 0.5) * 120], life: 0, max: 1.2 + rnd(), s: 1 }); }
function spark(p, s) { const a = rnd() * TAU; parts.push({ kind: "spark", p: [...p], v: [(rnd() - 0.5) * 400, Math.cos(a) * 400 * s, Math.sin(a) * 400 * s + 100], life: 0, max: 0.5 + rnd() * 0.7, s }); }
function smoke(p, s) { parts.push({ kind: "smoke", p: [...p], v: [(rnd() - 0.5) * 30, (rnd() - 0.5) * 30, 60 + rnd() * 50], life: 0, max: 2 + rnd() * 1.5, s }); }
function bounds(kind, x) {
  if (kind === "byp") { if (x > 300) return [0, 172]; if (x > 160) return [lerpProf(HUB, Math.min(x, 200)), lerpProf(NAC_IN, x)]; if (x > -40) return [lerpProf(CORE_OUT, x), lerpProf(NAC_IN, x)]; const g = (-40 - x) / 260; return [lerpProf(CORE_OUT, Math.max(x, -185)) * (1 - g), 166 + 30 * g]; }
  if (x > 160) return [lerpProf(HUB, Math.min(x, 200)), 72];
  if (x > -185) return [lerpProf(HUB, x), lerpProf(CORE_IN, x)];
  const g = (-185 - x) / 300; return [Math.max(0, 44 - 44 * g * 3), 65 + 60 * g];
}
const hex = (r, g, b) => "#" + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");
function drawParticles(dt) {
  const v = 160 + 900 * n1 * (state === "run" || state === "surging" ? 1 : 0.4);
  const spawn = (state === "run" || state === "surging" ? 150 : 25) * (0.3 + n1);
  for (let i = 0; i < spawn * dt; i++) flow(rnd() < 0.82 ? "byp" : "core");
  const add = !lightTheme;
  parts = parts.filter((p) => {
    p.life += dt;
    if (p.kind === "byp" || p.kind === "core") {
      const core = p.kind === "core", sp2 = core ? (p.x < -10 ? v * 1.7 : v) : v * (p.x < 160 ? 1.1 : 1);
      p.x -= sp2 * dt;
      if (p.x < (core ? -520 : -330)) return false;
      const [a, b] = bounds(p.kind, p.x), r = a + (b - a) * (0.1 + 0.8 * p.s), cf = Math.cos(p.f), sf = Math.sin(p.f);
      let col, al = lightTheme ? 0.85 : 0.7;
      if (!core) { col = lightTheme ? hex(40, 120, 200) : hex(150, 215, 255); if (p.x < -40) al *= clamp(1 - (-40 - p.x) / 290, 0, 1); }
      else if (p.x > 160) col = lightTheme ? hex(40, 120, 200) : hex(150, 215, 255);
      else if (p.x > 10) { const t = clamp((160 - p.x) / 150, 0, 1); col = hex(150 + 105 * t, 215 + 20 * t, 255 - 60 * t); if (lightTheme) col = hex(40 + 190 * t, 120 + 30 * t, 200 - 150 * t); }
      else if (p.x > -60) col = lightTheme ? hex(240, 150, 30) : hex(255, 236, 170);
      else { const t = clamp((-60 - p.x) / 160, 0, 1); col = hex(255, 200 - 110 * t, 90 - 60 * t); if (p.x < -185) al *= clamp(1 - (-185 - p.x) / 330, 0, 1); }
      if (p.x > 300) al *= clamp((470 - p.x) / 120, 0, 1);
      const len = sp2 * 0.022;
      E.line([p.x, r * cf, ZC + r * sf], [p.x + len, r * cf, ZC + r * sf], core ? 2 : 1.6, col, al, add);
      return true;
    }
    if (p.life > p.max) return false;
    const t = p.life / p.max, o = [p.p[0], p.p[1], p.p[2]];
    if (p.kind === "spark") p.v[2] -= 900 * dt;
    if (p.kind === "feather") { p.v[2] -= 120 * dt; p.v[0] *= 0.99; }
    for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * dt;
    if (p.p[2] < 0) { p.p[2] = 0; p.v[2] *= -0.3; }
    if (p.kind === "flame") E.sprite(p.p, (9 + 28 * t) * p.s, t < 0.3 ? "#ffe9a8" : t < 0.65 ? "#ff9a2e" : "#e2501a", 0.85 * (1 - t), true, 1);
    if (p.kind === "smoke") E.sprite(p.p, (12 + 44 * t) * p.s, "#343236", 0.5 * (1 - t));
    if (p.kind === "spark") E.line(o, p.p, 2.2, t < 0.5 ? "#ffe6a0" : "#ff8a3a", 1 - t, true);
    if (p.kind === "feather") E.sprite(p.p, t < 0.15 ? 7 : 3.4, t < 0.15 ? "#b42828" : "#ebe8e1", (t < 0.15 ? 0.6 : 0.95) * (1 - t));
    return true;
  });
}

// ---------------- the engine, in real 3D ----------------
const rh = (prof) => prof.map(([x, r]) => [r, x]);
const ringOf = (outer, inner) => rh([...outer, ...inner.slice().reverse()]);
const C0 = [0, 0, ZC];
// smooth a profile (Catmull-Rom through the points) so big shells don't show their facets
function fine(prof, n = 4) {
  const out = [], m = prof.length, P = (i) => prof[Math.max(0, Math.min(m - 1, i))];
  for (let i = 0; i < m - 1; i++) for (let j = 0; j < n; j++) { const t = j / n, a = P(i - 1), b = P(i), c = P(i + 1), d = P(i + 2); out.push([0, 1].map((k2) => 0.5 * (2 * b[k2] + (c[k2] - a[k2]) * t + (2 * a[k2] - 5 * b[k2] + 4 * c[k2] - d[k2]) * t * t + (3 * b[k2] - a[k2] - 3 * c[k2] + d[k2]) * t * t * t))); }
  out.push(prof[m - 1]);
  return out;
}
const NO = fine(NAC_OUT), NI = fine(NAC_IN), CO = fine(CORE_OUT), CI = fine(COWL_IN);
const rotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c, 0, ZC * s, ZC - c * ZC]; };
const quad = (p) => [[p[0], p[1], p[2]], [p[0], p[2], p[3]]];
function engineStatic() {
  const o = [], FAR = { c: C0, axis: "x", a0: HALF, a1: 3 * HALF, seg: 96 }, NEAR = { c: C0, axis: "x", a0: -HALF, a1: HALF, seg: 96, caps: false };
  // the half you always see: thick shells with the cut faces showing what they're made of
  o.push(lathe(ringOf(NO, NI), "#d7dbe0", { ...FAR, closed: true, cap: "#e2d3b4", mat: "paint" }));
  o.push(lathe(ringOf(CO, CI), "#7b828a", { ...FAR, closed: true, cap: "#b5573c", mat: "metal" }));
  o.push(lathe(ringOf(CASE_OUT, CORE_IN), "#59606a", { ...FAR, closed: true, cap: "#b5573c", mat: "metal" }));
  // the near half: a whole engine until the x-ray comes on, then the skin goes to glass and the rest gets out of the way
  o.push(lathe(rh(NO), "#d7dbe0", { ...NEAR, mat: "paint", shell: true }));
  o.push(lathe(rh(NI), "#4f565e", { ...NEAR, mat: "satin", xhide: true }), lathe([[181, -40], [166, -40]], "#aab0b8", { ...NEAR, xhide: true }));
  o.push(lathe(ringOf(CO, CI), "#7b828a", { ...NEAR, closed: true, mat: "metal", xhide: true }));
  o.push(lathe(ringOf(CASE_OUT, CORE_IN), "#59606a", { ...NEAR, closed: true, mat: "metal", xhide: true }));
  // polished inlet lip, and the seams where the cowl doors and the reverser split
  const lipO = fine([[300.4, 186], [292.4, 198.5], [270, 205.6], [262, 206.6]]), lipI = fine([[300.4, 186], [292.4, 175.5], [270, 171.5], [262, 171.2]]);
  for (const pr of [lipO, lipI]) o.push(lathe(rh(pr), "#c9ced4", { ...FAR, caps: false, mat: "chrome" }), lathe(rh(pr), "#c9ced4", { ...NEAR, mat: "chrome", shell: true }));
  for (const x of [118, 36]) { const r = lerpProf(NAC_OUT, x) + 0.5, band = [[r, x + 1.2], [r, x - 1.2]]; o.push(lathe(band, "#8f959d", { ...FAR, caps: false, mat: "matte" }), lathe(band, "#8f959d", { ...NEAR, mat: "matte", xhide: true })); }
  // the acoustic liner and the abradable strip the fan tips run against
  o.push(lathe([[171.4, 232], [171.4, 180]], "#8a6f4a", { ...FAR, caps: false, mat: "matte" }));
  // hub, shaft and tail cone
  o.push(lathe(rh(HUB), "#585e66", { c: C0, axis: "x", seg: 40, mat: "metal" }));
  // outlet guide vanes in the bypass duct: they hold the core in the middle of the nacelle
  const vanes = [];
  for (let j = 0; j < OGV.n * 2; j++) { const a = (j + 0.5) * Math.PI / OGV.n; vanes.push(...quad([pt(OGV.x + 10, OGV.rIn, a), pt(OGV.x + 10, OGV.rOut, a), pt(OGV.x - 8, OGV.rOut, a + 0.05), pt(OGV.x - 8, OGV.rIn, a + 0.05)])); }
  o.push(tris(vanes, "#8b929a", { mat: "metal" }));
  // combustor liner (far half), fuel nozzles
  o.push(lathe([[54, -56], [52, -6]], "#d9c9a8", { ...FAR, caps: false, seg: 36, mat: "matte" }), lathe([[39, -56], [39, -6]], "#d9c9a8", { ...FAR, caps: false, seg: 36, mat: "matte" }));
  for (let j = 0; j < 12; j++) { const a = (j + 0.5) * TAU / 12; o.push(tube([pt(6, 60, a), pt(2, 46, a), pt(-7, 45.5, a)], 1.3, "#aeb4bb", { mat: "steel", seg: 6 })); }
  // the stand: a bed, two yokes, and the thrust frame that takes the push
  const ST = { mat: "paint" };
  o.push(box(-110, 190, -120, 120, 0, 10, "#3b4047", { mat: "concrete" }));
  for (const x of [-70, 150]) {
    const top = x < 0 ? ZC - lerpProf(CORE_OUT, x) : ZC - lerpProf(NAC_OUT, x);
    if (x > 0) { o.push(box(x - 11, x + 11, -96, -74, 10, top + 6, "#c9962e", ST), box(x - 11, x + 11, 74, 96, 10, top + 6, "#c9962e", ST), box(x - 13, x + 13, -98, 98, top - 12, top - 1, "#b8862a", ST)); }
    else { o.push(box(x - 9, x + 9, -40, -24, 10, top - 1, "#c9962e", ST), box(x - 9, x + 9, 24, 40, 10, top - 1, "#c9962e", ST), box(x - 11, x + 11, -44, 44, top - 10, top - 1, "#b8862a", ST)); }
  }
  o.push(tube([[150, -85, 60], [20, -85, 12]], 4, "#8a8f96", { mat: "steel", seg: 8 }), tube([[150, 85, 60], [20, 85, 12]], 4, "#8a8f96", { mat: "steel", seg: 8 }));
  for (const y of [-112, 112]) for (const x of [-100, 180]) o.push(cyl(x, y, 3.2, 10, 12.5, "#aeb4bb", 10, { mat: "steel" }));
  return o;
}
function fanParts() {
  const blades = [], edges = [];
  for (let i = 0; i < 16; i++) {
    const base = (i / 16) * TAU, tip = tips[i];
    if (tip <= 0) continue;
    const rT = 55 + (168 - 55) * tip, hub = 54, LE = (r) => 226 - (r - 55) * 0.03, TE = (r) => 186 + (r - 55) * 0.07, tw = (r) => 0.42 - 0.2 * ((r - 55) / 113), sw = (r) => 0.06 * Math.pow((r - 55) / 113, 2);
    const N = 8, le = [], mi = [], te = [];
    for (let s = 0; s <= N; s++) { const r = hub + ((rT - hub) * s) / N, a0 = base + sw(r), w = tw(r) * 1.5; le.push(pt(LE(r), r, a0)); mi.push(pt((LE(r) + TE(r)) / 2 + 3, r, a0 + w * 0.58)); te.push(pt(TE(r), r, a0 + w)); }
    const t3 = [];
    for (let s = 0; s < N; s++) t3.push([le[s], le[s + 1], mi[s + 1]], [le[s], mi[s + 1], mi[s]], [mi[s], mi[s + 1], te[s + 1]], [mi[s], te[s + 1], te[s]]);
    blades.push(tris(t3, tip < 1 ? "#3b3330" : "#3a4049", { mat: "satin" }));
    edges.push(tube(le, 1.3, tip < 1 ? "#8a8078" : "#c9ced4", { mat: "steel", seg: 5 }));
  }
  // the spinner with its swirl, so you can see it turning
  const sp = [lathe(rh(fine(SPIN, 3)), "#cfd3d8", { c: C0, axis: "x", seg: 28, mat: "paint" })], sw2 = [];
  for (let s = 0; s <= 14; s++) { const u = s / 14, x = 270 - 62 * u, r = lerpProf(SPIN, x) + 0.6; sw2.push(pt(x, r, u * 5.2)); }
  sp.push(tube(sw2, 1.6, "#f4f4f0", { seg: 5, mat: "paint" }));
  return [...blades, ...edges, ...sp];
}
function rowParts(kinds, heat) {
  const o = [];
  for (const r of ROWS) {
    if (!kinds.includes(r.kind)) continue;
    const t3 = [], n = r.n * 2;
    for (let j = 0; j < n; j++) {
      if (burst && r.kind === "hpt" && j % 3 === 0) continue;
      const a = (j * TAU) / n;
      t3.push(...quad([pt(r.x + r.chord / 2, r.rIn - 1.5, a), pt(r.x + r.chord / 2, r.rOut, a), pt(r.x - r.chord / 2, r.rOut, a + r.tw * 0.3), pt(r.x - r.chord / 2, r.rIn - 1.5, a + r.tw * 0.3)]));
    }
    o.push(tris(t3, r.col, { mat: "metal", emit: heat > 0.02 ? ["#ff6a1a", heat] : undefined, emitK: 1.5 }));
  }
  return o;
}
function gooseParts(b) {
  const c = [b.x, b.y, ZC + b.z], fl = Math.sin(now * 14 + b.ph) * 16, o = [];
  o.push(sphere(c, 7, "#5a4d3f", { squash: [2.1, 1, 0.9], lat: 6, lon: 10, mat: "matte" }));
  o.push(tube([[c[0] - 10, c[1], c[2] + 1], [c[0] - 20, c[1], c[2] + 5], [c[0] - 27, c[1], c[2] + 6]], [2.6, 1.8, 2.2], "#2b2622", { seg: 6, mat: "matte" }));
  o.push(tris([[[c[0] - 6, c[1] + 3, c[2] + 2], [c[0] + 8, c[1] + 3, c[2] + 2], [c[0] + 4, c[1] + 34, c[2] + 4 + fl]], [[c[0] - 6, c[1] - 3, c[2] + 2], [c[0] + 8, c[1] - 3, c[2] + 2], [c[0] + 4, c[1] - 34, c[2] + 4 + fl]]], "#4a4036", { mat: "matte" }));
  return o;
}
const LABELS = [
  { x: 205, r: 150, text: "Fan", sub: "3.4 m, 16 carbon blades" }, { x: 142, r: 64, text: "Booster", sub: "3 stages" }, { x: 55, r: 54, text: "HP compressor", sub: "11 stages, 27 to 1" },
  { x: -30, r: 52, text: "Combustor", sub: "CMC liners" }, { x: -76, r: 56, text: "HP turbine", sub: "2 stages" }, { x: -134, r: 62, text: "LP turbine", sub: "6 stages" }, { x: 40, r: 130, text: "Bypass duct", sub: "ten parts in eleven go round" },
];
function draw(dt) {
  const spin = state === "run" || state === "surging" ? 1 : state === "seized" ? 0.6 : 0.8, running = state === "run" || state === "surging";
  fanA += dt * n1 * 5.2 * spin; coreA += dt * n2 * 7.0 * spin; lpA += dt * n1 * 6.1 * spin;
  const hH = clamp((egt - 700) / 450, 0, 1), hL = clamp((egt - 850) / 500, 0, 0.6), q = (v) => Math.round(v * 12);
  const objs = [
    { cache: "eng", rev: 0, parts: engineStatic },
    { cache: "fan", rev: tips.join(","), m: rotX(fanA), parts: fanParts },
    { cache: "boost", rev: 0, m: rotX(lpA), parts: () => rowParts(["boost"], 0) },
    { cache: "hpc", rev: 0, m: rotX(coreA), parts: () => rowParts(["hpc"], 0) },
    { cache: "hpt", rev: q(hH) + (burst ? 100 : 0), m: rotX(coreA), parts: () => rowParts(["hpt"], q(hH) / 12) },
    { cache: "lpt", rev: q(hL), m: rotX(lpA), parts: () => rowParts(["lpt"], q(hL) / 12) },
  ];
  const live = [];
  // the fire in the combustor
  const fl = running ? clamp(0.25 + 0.75 * kOf(n1), 0, 1) : 0;
  if (fl > 0) { const len = 26 + 22 * fl + Math.sin(now * 40) * 3; live.push(lathe([[44, -8], [50, -8 - len * 0.5], [46, -8 - len], [41, -8 - len * 0.6], [44, -8]], "#ffb040", { c: C0, axis: "x", a0: HALF, a1: 3 * HALF, seg: 36, closed: true, flat: true, emit: ["#ffb648", 0.55 + 0.45 * fl], emitK: 2.4, cap: "#ffe2a0" })); }
  // where the blade hit the case
  if (dent) live.push(sphere(pt(205, 172, dent.a), 15, "#1d1f23", { squash: [1.3, 1, 1], lat: 6, lon: 10, mat: "matte" }));
  for (const b of birds) live.push(...gooseParts(b));
  // the afterburner: a long flame out the back with shock diamonds in it
  if (abLit > 0.02) {
    const len = 420 * abLit, x0 = -200, fk = 1 + Math.sin(now * 37) * 0.04 + Math.sin(now * 23) * 0.03;
    const rad = (u) => (58 - 30 * u) * (u < 0.85 ? 1 : (1 - u) / 0.15) * fk;
    const prof = (k2) => Array.from({ length: 13 }, (_, i) => [Math.max(0.01, rad(i / 12) * k2), x0 - (len * i) / 12 * (k2 < 1 ? 0.8 : 1)]);
    live.push(lathe(prof(1), "#ff8a3a", { c: C0, axis: "x", seg: 20, flat: true, opacity: 0.2 * abLit, emit: ["#ff7a30", 1], emitK: 1.2, smooth: true }));
    live.push(lathe(prof(0.55), "#ffe2a8", { c: C0, axis: "x", seg: 16, flat: true, opacity: 0.4 * abLit, emit: ["#ffd9a0", 1], emitK: 1.8, smooth: true }));
  }
  // flying bits: the released blade, what's left of it, and turbine chunks
  if (bladeOff) {
    const t = now - bladeOff.t;
    if (t < 0.25) { const r = 110 + t * 300, a = bladeOff.a + t * 4; live.push(tris(quad([pt(215, r - 50, a), pt(215, Math.min(169, r + 55), a), pt(195, Math.min(169, r + 55), a + 0.25), pt(195, r - 50, a + 0.2)]), "#2c2f35", { mat: "carbon" })); }
    for (const f of bladeOff.frags) {
      if (t < 0.12) continue;
      f.x += f.vx * dt; f.a += f.va * dt; f.va *= Math.exp(-dt * 0.8); f.rot += dt * 9;
      let p = f.x > -40 ? pt(f.x, Math.min(164, f.r), f.a) : null;
      if (!p) { f.free = f.free || { p: pt(-40, 160, f.a), v: [-300, Math.cos(f.a) * 80, -100] }; f.free.v[2] -= 900 * dt; for (let i = 0; i < 3; i++) f.free.p[i] += f.free.v[i] * dt; if (f.free.p[2] < 3) { f.free.p[2] = 3; f.free.v = [f.free.v[0] * 0.5, f.free.v[1] * 0.5, Math.abs(f.free.v[2]) * 0.25]; } p = f.free.p; }
      const s = f.s * 0.8, c = Math.cos(f.rot), sn = Math.sin(f.rot), P0 = p;
      objs.push({ mat: "carbon", bevel: 0, parts: [box(-s, s, -s * 0.5, s * 0.5, -1.2, 1.2, "#2c2f35")], xf: (v) => [P0[0] + v[0] * c - v[2] * sn, P0[1] + v[1], P0[2] + v[0] * sn + v[2] * c] });
    }
  }
  if (burst) for (const c of burst.chunks) { c.v[2] -= 900 * dt; for (let i = 0; i < 3; i++) c.p[i] += c.v[i] * dt; if (c.p[2] < 3) { c.p[2] = 3; c.v = c.v.map((v, i) => (i === 2 ? Math.abs(v) * 0.3 : v * 0.5)); } const s = c.s * 0.9, hot = clamp(1 - (now - burst.t) / 5, 0, 1); live.push(box(c.p[0] - s, c.p[0] + s, c.p[1] - s, c.p[1] + s, c.p[2] - s * 0.6, c.p[2] + s * 0.6, "#6b4a36", { mat: "metal", bevel: 0, emit: hot > 0.02 ? ["#ff7a2a", hot] : undefined })); }
  objs.push({ parts: live });
  let svg = E.render(objs);
  if (abLit > 0.02) for (let i = 0; i < 5; i++) { const x = -240 - i * 62 * (0.6 + 0.4 * abLit); if (-200 - x > 420 * abLit * 0.85) break; E.sprite([x, 0, ZC], (24 - i * 3) * abLit, "#fff4d8", 0.75 - i * 0.12, true, 1); }
  // fire after a burst, smoke after a blade-off
  if (now - fireT < 6) { for (let i = 0; i < 3; i++) flame(-60 - rnd() * 60, (rnd() - 0.5) * 60, (rnd() - 0.5) * 120 + 60, -80, 1.3); if (rnd() < 0.5) smoke(pt(-80, 90, HALF + rnd()), 1.2); }
  if (bladeOff && now - bladeOff.t < 5 && rnd() < 0.6) smoke(pt(150 - rnd() * 200, 120, HALF + rnd() * Math.PI), 1);
  drawParticles(dt);
  if (showLabels && E.xray > 0.02) svg += E.callouts(LABELS.map((l) => ({ p: [l.x, 0, ZC + l.r], text: l.text, sub: l.sub })), E.xray, E.fs < 0.62 ? {} : { topL: 70, topR: 70 });
  if (sceneG.innerHTML !== svg) sceneG.innerHTML = svg;
  // shake
  shake = Math.max(0, shake - dt * 0.6);
  const amp = shake * 7 + clamp(vib, 0, 8) * n1 * 0.6;
  if (amp > 0.05) setShake((rnd() - 0.5) * amp, (rnd() - 0.5) * amp); else setShake(0, 0);
  const ft = now - flashT;
  flashEl.style.opacity = ft < 0.4 ? String((1 - ft / 0.4) * 0.8) : "0";
  const text = running ? "N1 " + Math.round(n1 * 100) + " % · EGT " + Math.round(egt) + " °C · " + Math.round(F) + " kN" : state === "seized" ? "BLADE OFF · CONTAINED" : burst ? "HPT BURST · ENGINE FIRE" : "SHUT DOWN";
  if (readout.textContent !== text) readout.textContent = text;
}

function birdsStep(dt) {
  birds = birds.filter((b) => {
    b.x -= b.v * dt; b.z += Math.sin(now * 2 + b.ph) * 10 * dt;
    if (b.x <= 215) { if (state === "run" || state === "surging") birdHit(b); return false; }
    return true;
  });
  if (shutdownAt !== null && now >= shutdownAt) { shutdownAt = null; if (state === "run" || state === "surging") { setState("shutdown"); event("Three surges and a shaking fan: the crew shuts it down. Nothing came out the side, so it did its job."); } }
}
function goose(flock) {
  const n = flock ? 6 : 1;
  for (let i = 0; i < n; i++) birds.push({ x: 520 + i * 45 + rnd() * 30, y: (rnd() - 0.5) * (flock ? 200 : 60), z: (rnd() - 0.5) * (flock ? 180 : 60), v: 520, ph: rnd() * 6, flock });
}

// ---------------- UI ----------------
const ui = {
  thr: document.querySelector("#thr"), thrOut: document.querySelector("#thr-out"), presets: [...document.querySelectorAll("[data-thr]")], fadec: document.querySelector("#fadec"),
  goose: document.querySelector("#goose"), flock: document.querySelector("#flock"), blade: document.querySelector("#blade"), surgeB: document.querySelector("#surge"), fresh: document.querySelector("#fresh"),
  slow: document.querySelector("#slow"), tour: document.querySelector("#tour"), labels: document.querySelector("#labels"), ab: document.querySelector("#ab"), shot: document.querySelector("#shot"),
  n1F: document.querySelector("#n1-fill"), n1O: document.querySelector("#n1-out"), eF: document.querySelector("#egt-fill"), eO: document.querySelector("#egt-out"), fF: document.querySelector("#f-fill"), fO: document.querySelector("#f-out"), vF: document.querySelector("#v-fill"), vO: document.querySelector("#v-out"), stats: document.querySelector("#stats"),
};
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };
function syncUi() {
  ui.thr.max = fadec ? "114" : "130";
  ui.thr.value = String(Math.round(thr * 100)); ui.thrOut.textContent = Math.round(thr * 100) + " %";
  ui.ab.setAttribute("aria-pressed", String(ab));
  ui.fadec.setAttribute("aria-pressed", String(!fadec)); ui.fadec.textContent = fadec ? "FADEC on" : "FADEC OFF";
  ui.n1F.style.width = clamp(n1 / 1.3 * 100, 0, 100).toFixed(1) + "%"; ui.n1O.textContent = Math.round(n1 * 100) + " % · N2 " + Math.round(n2 * 100);
  ui.eF.style.width = clamp((egt - 0) / 1300 * 100, 0, 100).toFixed(1) + "%"; ui.eF.dataset.state = egt > 1090 ? "bad" : egt > 1000 ? "warn" : "ok"; ui.eO.textContent = Math.round(egt) + " °C";
  ui.fF.style.width = clamp(F / 650 * 100, 0, 100).toFixed(1) + "%"; ui.fO.textContent = Math.round(F) + " kN";
  ui.vF.style.width = clamp(vib / 4 * 100, 0, 100).toFixed(1) + "%"; ui.vF.dataset.state = vib > 1.5 ? "bad" : vib > 0.5 ? "warn" : "ok"; ui.vO.textContent = vib.toFixed(1);
  const lbf = F * 224.8, t = F / 9.81;
  ui.stats.innerHTML = (abLit > 0.5 ? "<b>reheat lit</b>, fuel burn about <b>4×</b> · " : "") + "<b>" + Math.round(lbf / 100) * 100 + " lbf</b>, enough to hold up <b>" + Math.round(t) + " t</b>" + (t > 4 ? ", or about <b>" + Math.round(t / 2.1) + " Hiluxes</b>" : "") + (dmgFan > 0 ? " · fan damage <b>" + Math.round(dmgFan * 100) + " %</b>" : "") + (hpt > 0.05 && !burst ? " · HPT life used <b>" + Math.round(hpt * 100) + " %</b>" : "");
  ui.slow.setAttribute("aria-pressed", String(slow)); ui.tour.setAttribute("aria-pressed", String(touring));
}
function story() {
  if (now - lastEventAt < 6 && lastEvent) return say(lastEvent);
  if (touring && tourStep >= 0 && TOUR[tourStep].say) return say(TOUR[tourStep].say);
  if (state !== "run") return;
  if (abLit > 0.5) return say("Afterburner: fuel sprayed into the exhaust behind the turbine and lit. No airliner engine has one (Concorde aside): it burns three to four times the fuel for about half as much thrust again. Pure toy here.");
  if (ab && n1 < 0.85) return say("Afterburner armed. It only lights near full power: throttle up.");
  if (!fadec && egt > 1000) return say("FADEC off: nothing is holding the EGT back now. Past about 1,090 °C the HP turbine blades start to creep. Watch the HPT life.");
  if (n1 > 1.05) return say("Record territory. The certified engine did 134,300 lbf (597 kN) in a test cell, the most thrust any commercial jet engine has made.");
  if (n1 > 0.85) return say("Take-off power. Around 90 % of the air goes round the core through the bypass duct, and that cold, slow, huge flow makes most of the thrust.");
  if (n1 < 0.3) return say("Idle. The biggest fan on any airliner engine: 3.4 m across, taller than a basketball hoop, 16 carbon-fibre blades. Push the throttle.");
  return say("Air in the front: about one part in eleven goes into the core, gets squeezed 60 to 1, burnt, and spins the turbines that drive everything. The rest is bypass.");
}
const TOUR = [
  { say: "Idle. The biggest fan on any airliner engine: 3.4 m across, 16 carbon-fibre blades. X-ray's on so you can see in: press X for the whole engine.", acts: [[0, () => { newEngine(); thr = 0; }], [5, null]] },
  { say: "Take-off power: about 445 kN, 100,000 lbf. Most of it comes from the fan's bypass air, not the hot core.", acts: [[0, () => { thr = 1; }], [8, null]] },
  { say: "Record run: 134,300 lbf in a test cell, more than any commercial jet engine has ever made.", acts: [[0, () => { thr = 1.14; }], [7, null]] },
  { say: "The afterburner. Not a thing on any airliner engine, but you asked. Fuel straight into the exhaust, lit.", acts: [[0, () => { thr = 1; ab = true; }], [7, () => { ab = false; }], [8.5, null]] },
  { say: "One goose at take-off power. Most of it goes out the bypass. The fan gets a nick and keeps running, which is what certification asks.", acts: [[0, () => { thr = 1; goose(false); }], [6, null]] },
  { say: "A flock of geese.", acts: [[0, () => { goose(true); }], [9.5, null]] },
  { say: "Blade-off test: an explosive bolt releases a fan blade at full power. The case has to hold it.", acts: [[0, () => { newEngine(); thr = 1; }], [3.5, () => bladeRelease()], [12, null]] },
  { say: "Last one: FADEC off and the throttle firewalled. Nothing is protecting the turbine now.", acts: [[0, () => { newEngine(); thr = 1; }], [1, () => { fadec = false; thr = 1.3; }], [13, null]] },
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
  step(sdt); birdsStep(sdt); draw(sdt); syncUi(); story();
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { if (touring) { touring = false; actions = []; tourStep = -1; } };
const act = (fn) => (...a) => { takeOver(); fn(...a); syncUi(); run(); };
const alive = () => state === "run" || state === "surging";
ui.thr.addEventListener("input", act(() => { thr = +ui.thr.value / 100; }));
ui.presets.forEach((b) => b.addEventListener("click", act(() => { thr = +b.dataset.thr; if (thr > 1.14) fadec = false; })));
ui.ab.addEventListener("click", act(() => { ab = !ab; if (ab && thr < 1) thr = 1; }));
ui.fadec.addEventListener("click", act(() => { fadec = !fadec; if (fadec) thr = Math.min(thr, 1.14); }));
ui.goose.addEventListener("click", act(() => { if (alive()) goose(false); }));
ui.flock.addEventListener("click", act(() => { if (alive()) goose(true); }));
ui.blade.addEventListener("click", act(() => { if (alive()) { if (n1 < 0.8) { thr = 1; event("Spooling up first: the test's done at full power."); setTimeout(() => {}, 0); pendingBlade = true; } else bladeRelease(); } }));
ui.surgeB.addEventListener("click", act(() => { if (alive()) surge(); }));
ui.fresh.addEventListener("click", act(() => newEngine()));
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; actions = []; } syncUi(); run(); });
ui.labels.addEventListener("click", () => { const on = ui.labels.getAttribute("aria-pressed") !== "true"; ui.labels.setAttribute("aria-pressed", String(on)); showLabels = on; run(); });
let pendingBlade = false;
const _step = step;
step = function (dt) { _step(dt); if (pendingBlade && n1 > 0.95) { pendingBlade = false; bladeRelease(); } };
stage.addEventListener("keydown", (ev) => {
  const map = { x: () => setX(!E.xrayOn), ArrowUp: () => { thr = Math.min(fadec ? 1.14 : 1.3, thr + 0.05); }, ArrowDown: () => { thr = Math.max(0, thr - 0.05); }, g: () => alive() && goose(false), f: () => alive() && goose(true), b: () => alive() && bladeRelease(), a: () => { ab = !ab; if (ab && thr < 1) thr = 1; } };
  if (map[ev.key]) { ev.preventDefault(); act(map[ev.key])(); }
  if (ev.key === "s") { slow = !slow; run(); }
});
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;
window.__fig = { E, freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
setX(true); draw(0); syncUi(); story();
`;

const CSS = `.fx-flash{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(circle 60% at 50% 50%,#ffffff 0%,#ffe9c8 40%,rgba(255,200,140,0) 100%)}`;

const stage = stageHtml({
  W, H, fig: "Fig 21", title: "Jet engine", xray: true,
  label: "A big turbofan jet engine on a test stand. An x-ray mode turns the near half of the nacelle to glass to show the fan, the compressor and turbine stages, the combustor, and the air flowing through the bypass duct and the core.",
  keysHelp: "Jet engine: drag to rotate, X for x-ray, up and down for throttle, A for the afterburner, G throws a goose, F a flock, B releases a fan blade",
  extra: `<div class="fx-flash" aria-hidden="true"></div>`,
});

const CONTROLS = `<div class="ctl" role="group" aria-label="Controls">
  <div class="ctl-row"><span class="ctl-label">Throttle</span><div class="slide"><input id="thr" type="range" min="0" max="114" step="1" value="0" aria-label="Throttle, percent of take-off"></div><output id="thr-out">0 %</output></div>
  <div class="ctl-row"><span class="ctl-label">Set</span><button type="button" data-thr="0">Idle</button><button type="button" data-thr="1">Take-off<small>445 kN</small></button><button type="button" data-thr="1.14">Record run<small>597 kN</small></button><button type="button" id="ab" aria-pressed="false">Afterburner<small>not on a 777</small></button><button type="button" data-thr="1.3">Firewall it<small>FADEC off</small></button><button type="button" id="fadec" aria-pressed="false">FADEC on</button></div>
  <div class="ctl-row"><span class="ctl-label">Test</span><button type="button" id="goose">Goose<small>one bird</small></button><button type="button" id="flock">Flock<small>six geese</small></button><button type="button" id="surge">Surge<small>compressor stall</small></button><button type="button" id="blade" class="danger">Blade-off<small>containment test</small></button></div>
  <div class="ctl-row"><span class="ctl-label">N1</span><div class="meter"><span id="n1-fill" class="fill"></span><span class="mark" style="left:${(100 / 130 * 100).toFixed(1)}%" data-label="100"></span></div><output id="n1-out">20 %</output></div>
  <div class="ctl-row"><span class="ctl-label">EGT</span><div class="meter"><span id="egt-fill" class="fill"></span><span class="mark" style="left:${(1090 / 1300 * 100).toFixed(1)}%" data-label="limit"></span></div><output id="egt-out">480 °C</output></div>
  <div class="ctl-row"><span class="ctl-label">Thrust</span><div class="meter"><span id="f-fill" class="fill"></span><span class="mark l" style="left:${(445 / 650 * 100).toFixed(1)}%" data-label="take-off"></span><span class="mark" style="left:${(597 / 650 * 100).toFixed(1)}%" data-label="record"></span></div><output id="f-out">0 kN</output></div>
  <div class="ctl-row"><span class="ctl-label">Vibes</span><div class="meter"><span id="v-fill" class="fill"></span></div><output id="v-out">0.0</output></div>
  <div class="ctl-row wide"><span class="ctl-label">That's</span><span id="stats"></span></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="fresh">New engine</button><button type="button" id="labels" aria-pressed="true">Labels</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
</div>`;


const foot = footHtml({
  theme, slug: "jet",
  real: "3.4 m fan, 16 carbon-fibre composite blades, a 3-stage booster, an 11-stage high-pressure compressor at 27:1, CMC combustor liners, a 2-stage HP turbine, a 6-stage low-pressure turbine, bypass about 10:1, overall pressure ratio 60:1, about 100,000 lbf (445 kN) take-off, and the 134,300 lbf (597 kN) record. Also real: certification needs a fan blade released at full power to stay inside the case, and the engine has to take bird strikes. The afterburner is not real for this engine: no airliner engine has one, Concorde aside. Figures are for the GE9X, from GE Aerospace and Key Aero.",
  made: "the afterburner, the spool times, EGT numbers and limit, the thrust curve, how the failures play out, the stand, and the proportions inside are simplified.",
});
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), pageMk2({
  k, title: "Jet engine", fig: "Fig 21", hint: "Throttle up, then feed it a goose", theme, W, H, stage, controls: CONTROLS, css: CSS, foot,
  caption: "A turbofan is a small jet engine driving a giant fan. Air comes in the front and most of it, about ten parts in eleven here, goes round the outside through the bypass duct, pushed by the fan. The rest goes into the core: squeezed 60 to 1 by the booster and the high-pressure compressor, burnt with fuel in the combustor, then expanded through the high-pressure turbine (which drives the compressor) and the low-pressure turbine (which drives the fan). The huge, slow, cold bypass flow makes most of the thrust, and making it bigger is how engines got more efficient. This one's the size of the GE9X on the Boeing 777X, the biggest and most powerful airliner engine built.",
  script: LIVE.replace("__DATA__", JSON.stringify(DATA)),
}));
console.log("wrote", name);
