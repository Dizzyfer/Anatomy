import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { engineScript, stageHtml, pageMk2, footHtml } from "../../mk2/shell.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const W = 960, H = 600;

// Truth: an F1 car is grip-limited, and most of the grip in a fast corner comes from downforce, which grows with speed
// squared and costs drag. The 2026 cars move their front and rear wing flaps between a high-downforce Corner Mode and a
// low-drag Straight Mode (DRS is gone), run about 400 kW of engine and 350 kW of MGU-K, and weigh at least 768 kg.
// The battery only has what the car harvested, so the electric push runs out on long straights. Carbon brakes live at
// several hundred to over 1,000 °C. Following closely costs front downforce in corners.
// Toy: a quasi-steady lap simulation on a made-up circuit with round-number aero, tyre and energy figures.
const PLATE = { x: -5.7, y: -2.55, w: 11.4, d: 5.1, r: 0.5 };
const P = k.fitProjection([...k.boxCorners(PLATE, -0.7, 0), [-4.6, -2, 1.5], [4.6, 2, 1.5], [4.6, -2, 1.5]], W, H, { pad: 30, azimuth: 45 });
const DATA = { W, H, P, PLATE };

const LIVE = `
${engineScript()}
const D = __DATA__;
const stage = document.querySelector(".mk-stage");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (a, lo, hi) => Math.min(hi, Math.max(lo, a));
const CX = -0.7; // where the car sits on the plate
const E = mk2(stage, D.P, { W: D.W, H: D.H, pivot: [CX, 0, 0.3], plate: { ...D.PLATE, h: 0.45, foot: 0.25, col: "#2c2e33", side: "#17181b" }, shadowBox: [-6.2, -3.2, -1, 6.2, 3.2, 3] });
const { box, prism, circle, lathe, tube, sphere, loft, roundPoly } = E;
const lightTheme = document.body.dataset.theme === "light";
if (lightTheme) { E.plate.col = "#6a6d74"; E.plate.side = "#c9c9c4"; }
E.bindTools(stage);
const mcv = stage.querySelector(".m-cv"), mctx = mcv.getContext("2d");
const sceneG = stage.querySelector('[data-part="scene"]');
const fx1 = (v) => v.toFixed(1);
let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

// ---------------- the circuit: straights and corners (radius m, turn in degrees, + is left) ----------------
const TRACK = [["S", 820, "Main straight"], ["C", 17, 150, "Hairpin"], ["S", 260], ["C", 130, 75, "Fast sweeper"], ["S", 240], ["C", 45, 55, "Esses"], ["C", 45, -55], ["S", 680, "Back straight"], ["C", 24, 45, "Chicane"], ["C", 24, -45], ["S", 210], ["C", 75, 135, "Last corner"], ["S", 140]];
const DS = 2, G = 9.81, RHO = 1.2;
let pts = [];
(function () { let x = 0, y = 0, h = 0, s = 0, seg = 0; for (const t of TRACK) { const len = t[0] === "S" ? t[1] : t[1] * Math.abs(t[2]) * Math.PI / 180; const kap = t[0] === "S" ? 0 : Math.sign(t[2]) / t[1]; const n = Math.round(len / DS); for (let i = 0; i < n; i++) { pts.push({ s, x, y, kap, seg, straight: t[0] === "S" && t[1] > 200 }); h += kap * DS; x += Math.cos(h) * DS; y += Math.sin(h) * DS; s += DS; } seg++; }
  const ex = x, ey = y, N = pts.length; pts.forEach((p, i) => { p.mx = p.x - ex * i / N; p.my = p.y - ey * i / N; }); })();
const N = pts.length, LAP = N * DS;

// ---------------- the car's numbers ----------------
const MASS = 800; // 768 kg minimum plus some fuel
let wing = 0.5, aeroAuto = true, follow = 0, ducts = true, slow = false;
const aero = (straightMode) => { const cla = 2.4 + 1.8 * wing, cda = 0.95 + 0.4 * wing; return straightMode ? { cla: cla * 0.5, cda: cda * 0.62 } : { cla, cda }; };
const MU = 1.7;
const dirtyLoss = () => (follow === 0 ? 0 : follow === 1 ? 0.18 : 0.38);
// MGU-K: full 350 kW up to 290 km/h, tapering to nothing by 340 (Overtake Mode: full to 337). vCut is where the battery budget runs out.
function kPower(v, overtake, vCut) { const kmh = v * 3.6; if (v >= vCut) return 0; const top = overtake ? 337 : 290, end = overtake ? 345 : 340; return 350e3 * (kmh < top ? 1 : clamp((end - kmh) / (end - top), 0, 1)); }
let prof = null;
function runLap(vCut) {
  const loss = dirtyLoss(), tow = follow === 0 ? 0 : follow === 1 ? 0.06 : 0.14, ot = follow > 0;
  const vmax = new Float64Array(N), v = new Float64Array(N), mode = new Uint8Array(N), dP = new Float64Array(N), hP = new Float64Array(N);
  for (let i = 0; i < N; i++) { const p = pts[i]; mode[i] = aeroAuto && p.straight ? 1 : 0; const a = aero(false), cla = a.cla * (p.kap ? 1 - loss * 0.7 : 1); const kk = Math.abs(p.kap); if (!kk) { vmax[i] = 120; continue; } const den = kk - MU * RHO * cla / (2 * MASS); vmax[i] = den <= 0 ? 120 : Math.min(120, Math.sqrt(MU * G / den)); }
  const latFrac = (i, vv) => { const kk = Math.abs(pts[i].kap); if (!kk) return 0; const a = aero(false); const amax = MU * (G + RHO * a.cla * (1 - loss * 0.7) * vv * vv / (2 * MASS)); return clamp(vv * vv * kk / amax, 0, 1); };
  let vv = 40;
  for (let lap = 0; lap < 2; lap++) for (let i = 0; i < N; i++) {
    vv = Math.min(vv, vmax[i]); v[i] = vv;
    const a = aero(mode[i] === 1), cda = a.cda * (1 - (pts[i].straight ? tow : 0));
    const drag = 0.5 * RHO * cda * vv * vv + 0.015 * MASS * G;
    const trac = MU * 0.75 * (G + 0.5 * RHO * a.cla * vv * vv / MASS) * Math.sqrt(1 - latFrac(i, vv) ** 2);
    const kAvail = kPower(vv, ot && pts[i].straight, vCut), accP = (400e3 + kAvail) / Math.max(vv, 5) - drag;
    const acc = Math.min(trac, accP / MASS);
    // how much of the electric power this bit of track actually used
    const need = (acc * MASS + drag) * Math.max(vv, 5); dP[i] = vv >= vmax[i] - 0.01 ? 0 : clamp(need - 400e3, 0, kAvail);
    hP[i] = vv >= vmax[i] - 0.01 && pts[i].kap ? Math.min(ot ? 150e3 : 110e3, Math.max(0, 400e3 - drag * vv)) : 0;
    vv = Math.sqrt(Math.max(1, vv * vv + 2 * acc * DS));
  }
  vv = v[0];
  for (let lap = 0; lap < 2; lap++) for (let i = N - 1; i >= 0; i--) {
    const a = aero(false), drag = 0.5 * RHO * a.cda * vv * vv;
    const dec = (0.88 * MU * (MASS * G + 0.5 * RHO * a.cla * vv * vv) * Math.sqrt(1 - latFrac(i, vv) ** 2) + drag) / MASS;
    const vb = Math.sqrt(vv * vv + 2 * dec * DS);
    if (vb < v[i]) { v[i] = vb; mode[i] = 0; dP[i] = 0; }
    vv = v[i];
  }
  const brake = new Float64Array(N);
  let dep = 0, har = 0;
  for (let i = 0; i < N; i++) {
    const a2 = v[i], b2 = v[(i + 1) % N]; brake[i] = a2 > b2 + 0.01 ? (a2 * a2 - b2 * b2) / (2 * DS) : 0; if (brake[i] > 0.5 * G) mode[i] = 0;
    if (brake[i] > 0.3 * G) { const a = aero(false); hP[i] = Math.min(350e3, Math.max(0, (MASS * brake[i] - 0.5 * RHO * a.cda * a2 * a2) * a2)); dP[i] = 0; }
    const dt = DS / Math.max(5, a2); dep += dP[i] * dt; har += hP[i] * dt;
  }
  return { v, mode, brake, dP, hP, dep, har };
}
function simulate() {
  // the lap has to be energy neutral: the MGU-K can only spend what was harvested. Find the speed where it has to stop pushing.
  let lo = 40, hi = 100, r = runLap(hi);
  if (r.dep > r.har) { for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; r = runLap(mid); if (r.dep > r.har) hi = mid; else lo = mid; } r = runLap(lo); r.vCut = lo; } else r.vCut = 999;
  const { v, brake } = r;
  const tm = new Float64Array(N + 1), soc = new Float64Array(N); let cum = 0, cmin = 0;
  for (let i = 0; i < N; i++) { tm[i + 1] = tm[i] + DS / Math.max(1, (v[i] + v[(i + 1) % N]) / 2); cum += (r.hP[i] - r.dP[i]) * DS / Math.max(5, v[i]); soc[i] = cum; cmin = Math.min(cmin, cum); }
  for (let i = 0; i < N; i++) soc[i] = (soc[i] - cmin) / 1e6 + 0.5;
  let top = 0, low = 999, latPk = 0, brPk = 0; for (let i = 0; i < N; i++) { top = Math.max(top, v[i]); low = Math.min(low, v[i]); latPk = Math.max(latPk, v[i] * v[i] * Math.abs(pts[i].kap) / G); brPk = Math.max(brPk, brake[i] / G); }
  prof = { ...r, tm, soc, lap: tm[N], top, low, latPk, brPk, loss: dirtyLoss() };
}
// ---------------- state ----------------
let sPos = 0, vNow = 40, now = 0, last = 0, frame = 0, visible = false, touring = true, tourClock = 0, tourStep = -1, actions = [], lastShot = "", lastEvent = "", lastEventAt = -10;
let discT = 450, discWear = 0, discGone = false, tyreT = 95, wingGone = false, wingArmed = false, lapCount = 0, lapStart = 0;
let bulletUntil = -1, crash = null, flying = [], parts = [], debris = [], air = [], scroll = 0, steer = 0, pitch = 0, roll = 0, latG = 0, lonG = 0, df = 0, dfF = 0, dfR = 0, modeNow = 0, flapF = 0.42, flapR = 0.62, socNow = 2, depNow = 0, harNow = 0, clipNow = false;
const event = (tx) => { lastEvent = tx; lastEventAt = now; };
function reset() { sPos = 0; vNow = prof.v[0]; discT = 450; discWear = 0; discGone = false; tyreT = 95; wingGone = false; wingArmed = false; crash = null; flying = []; parts = []; debris = []; lapCount = 0; lapStart = now; lastEvent = ""; }
const idx = (s) => ((Math.floor(s / DS) % N) + N) % N;
function physics(dt) {
  if (crash) return crashStep(dt);
  const i = idx(sPos), j = (i + 1) % N, f = (sPos / DS) % 1;
  const v = prof.v[i] + (prof.v[j] - prof.v[i]) * f, brk = prof.brake[i];
  if (wingArmed && v > 80) { wingArmed = false; wingGone = true; launchWing(); event("The rear wing's let go at " + Math.round(v * 3.6) + " km/h. Most of the rear downforce just left the building, and there's a braking zone coming."); }
  if (wingGone && brk > 1.5 * G) return startCrash("spin", v);
  if (discGone && brk > 1.5 * G) return startCrash("straight", v);
  const old = vNow; vNow = v;
  lonG = dt > 0 ? clamp((v - old) / dt / G, -6, 3) : 0;
  sPos += v * dt; if (sPos >= LAP) { sPos -= LAP; lapCount++; lapStart = now; }
  const p = pts[i]; latG = v * v * p.kap / G; steer += (clamp(Math.atan(3.4 * p.kap) * 1.8, -0.35, 0.35) - steer) * Math.min(1, dt * 8);
  modeNow = prof.mode[i]; socNow = prof.soc[i]; depNow = prof.dP[i]; harNow = prof.hP[i]; clipNow = p.straight && brk === 0 && v >= prof.vCut - 0.5 && prof.vCut < 200;
  flapF += ((modeNow ? 0.1 : 0.42) - flapF) * Math.min(1, dt * 14); flapR += ((modeNow ? 0.06 : 0.62) - flapR) * Math.min(1, dt * 14);
  const a = aero(modeNow === 1), q2 = 0.5 * RHO * v * v, loss = p.kap ? prof.loss * 0.7 : 0;
  dfF = q2 * a.cla * 0.42 * (1 - loss * 1.6) / G; dfR = q2 * a.cla * 0.58 * (wingGone ? 0.35 : 1) / G; df = dfF + dfR;
  pitch += (clamp(-lonG * 0.007, -0.03, 0.02) - pitch) * Math.min(1, dt * 6); roll += (clamp(-latG * 0.006, -0.03, 0.03) - roll) * Math.min(1, dt * 6);
  // brakes: the front discs take a bit over half the braking that the MGU-K doesn't harvest
  const Pb = brk > 0 ? Math.max(0, (MASS * brk - 0.5 * RHO * a.cda * v * v) * v - 350e3) : 0;
  const heat = Pb * 0.56 / 2, cool = (0.12 + 0.016 * v) * (ducts ? 1 : 0.12);
  discT += (heat / 300 - cool * (discT - 120)) * dt;
  if (discT > 1100) discWear += (discT - 1100) / 100 * dt * 0.5;
  if (!discGone && discWear > 1) { discGone = true; event("The front discs have cooked past 1,100 °C for too long and oxidised away. The next big stop is going to be a problem."); }
  const target = 82 + 7 * Math.abs(latG) * (1 + prof.loss * 4.5);
  tyreT += (target - tyreT) * dt / 5;
  if (brk > 3 * G && rnd() < 0.5) for (const yy of [-0.72, 0.72]) parts.push({ k: "dust", p: [CX + 1.7, yy, 0.3], v: [-6 - rnd() * 4, (rnd() - 0.5) * 0.6, 0.3 + rnd() * 0.4], r: 0.1, life: 0, max: 0.5 + rnd() * 0.4 });
  if (brk > 2.5 * G && rnd() < 0.12) parts.push({ k: "flame", p: [CX - 2.32, 0, 0.5], v: [-3 - rnd() * 2, 0, 0.2], r: 0.16 + rnd() * 0.1, life: 0, max: 0.18 });
  if (v > 75 && rnd() < 0.1 * (df / 1500)) spawnSpark();
}
function startCrash(kind, v) {
  const runoff = kind === "spin" ? 200 : 170, a = kind === "spin" ? 1.6 * G : 2.2 * G;
  const vi = Math.sqrt(Math.max(0, v * v - 2 * a * runoff)), gpk = vi * vi / (2 * G * 2.1);
  crash = { kind, t: 0, v0: v, vi, gpk, y: 0, yaw: 0, ws: 7.5, wallX: 8.6, wall0: 8.6, hit: false, noHit: vi < 8, pop: 0 };
  event(kind === "spin" ? "No rear wing, so the moment the brakes bite the rear goes light and it swaps ends at " + Math.round(v * 3.6) + " km/h." : "Brake pedal to the floor at " + Math.round(v * 3.6) + " km/h and nothing much happens. Straight on.");
}
const leadOf = (yaw) => { const ca = Math.cos(yaw), sa = Math.sin(yaw); let lead = -9; for (const [lx, ly] of [[2.95, 0.95], [2.95, -0.95], [-2.7, 0.55], [-2.7, -0.55]]) lead = Math.max(lead, lx * ca - ly * sa); return lead; };
function crashStep(dt) {
  const c = crash; c.t += dt;
  if (c.hit) { c.pop = Math.min(1, c.pop + dt * 3); if (c.t - c.hitAt > 7 && !touring) reset(); return; }
  const stopAt = CX + leadOf(c.yaw) + 0.05, total = c.wall0 - stopAt, left = c.wallX - stopAt;
  vNow = c.vi + (c.v0 - c.vi) * clamp(left / total, 0, 1);
  if (c.noHit) c.ws = Math.max(0, c.ws - dt * 7.5 * 7.5 / (2 * (total - 1.6))); else c.ws = Math.max(2.8, c.ws - dt * 1.7);
  c.wallX -= c.ws * dt; scroll += c.ws * dt;
  if (c.kind === "spin") { c.yaw += dt * (2.0 + c.t * 1.1); c.y = Math.min(0.9, c.y + dt * 0.5); if (rnd() < 0.9) spawnSmoke(1); } else if (rnd() < 0.4) spawnSmoke(0.5);
  if (rnd() < 0.5) spawnSpark();
  const inGravel = c.wallX - 5 < CX;
  if (inGravel && rnd() < 0.7) parts.push({ k: "grit", p: [CX + (rnd() - 0.5) * 3, c.y + (rnd() - 0.5) * 1.8, 0.05], v: [-c.ws * 0.6 - rnd() * 2, (rnd() - 0.5) * 3, 1 + rnd() * 2.5], life: 0, max: 1.1, s: 0.03 + rnd() * 0.03 });
  if (c.noHit && c.ws === 0) { c.hit = true; c.hitAt = c.t; vNow = 0; event("Beached in the gravel trap, short of the wall. Lucky: it was a slow corner."); return; }
  if (c.wallX <= stopAt) {
    c.hit = true; c.hitAt = c.t; vNow = 0;
    for (let n = 0; n < 46; n++) { const s = 0.04 + rnd() * 0.09; debris.push({ p: [c.wallX - 0.2, c.y + (rnd() - 0.5) * 1.6, 0.2 + rnd() * 0.6], v: [-1 - rnd() * 5, (rnd() - 0.5) * 7, 1.5 + rnd() * 5], rot: rnd() * 6, w: (rnd() - 0.5) * 20, s, c: ["#1b1d22", "#1f4e8c", "#f2c230", "#2a2c30", "#e5e7ea"][Math.floor(rnd() * 5)], life: 0 }); }
    for (let n = 0; n < 12; n++) spawnSmoke(0.6, c.wallX - 0.3);
    event("Into the tyres at about " + Math.round(c.vi * 3.6) + " km/h: " + (c.gpk > 50 ? "a big one" : "a hard one") + ", around " + Math.round(c.gpk) + " g. The survival cell and the halo did their job (Grosjean walked away from 67 g at 192 km/h in 2020).");
  }
}
// ---------------- particles ----------------
function launchWing() { flying.push({ p: [CX - 2.4, 0, 0.9], v: [-2.6, 0.9, 4.2], rot: 0, w: 3.5, life: 0 }); bulletUntil = now + 1.2; for (let n = 0; n < 16; n++) { const s = 0.03 + rnd() * 0.05; debris.push({ p: [CX - 2.4, (rnd() - 0.5) * 1, 0.9], v: [-4 - rnd() * 5, (rnd() - 0.5) * 4, rnd() * 4], rot: 0, w: (rnd() - 0.5) * 20, s, c: rnd() < 0.5 ? "#1b1d22" : "#f2c230", life: 0 }); } }
function spawnSpark() { const cy = crash ? crash.y : 0; parts.push({ k: "spark", p: [CX - 0.5 + rnd() * 1.5, cy + (rnd() - 0.5) * 0.6, 0.04], v: [-9 - rnd() * 6, (rnd() - 0.5) * 2, 0.5 + rnd() * 1.5], life: 0, max: 0.25 + rnd() * 0.25 }); }
function spawnSmoke(a = 1, at) { const c = crash, cy = c ? c.y : 0; parts.push({ k: "smoke", p: [(at ?? CX - 1.4) + (rnd() - 0.5), cy + (rnd() - 0.5) * 1.2, 0.2], v: [-(c ? c.ws : 0) * 0.55 + rnd() * 0.4, (rnd() - 0.5) * 0.6, 0.3 + rnd() * 0.5], r: 0.3, life: 0, max: 2.2 + rnd() * 1.8, a }); }

// ---------------- the car (local: x forward, y left, z up) ----------------
const LIV = "#1f4e8c", LIV2 = "#f2c230", CARB = "#1b1d22";
const sec = (x, hw0, hw1, zb, zt, r) => roundPoly([[-hw0, zb], [hw0, zb], [hw1, zt], [-hw1, zt]], [r * 0.45, r * 0.45, r, r], 3).map(([y, z]) => [x, y, z]);
const sec6 = (x, hw0, hwS, zS, hw1, zb, zt, r) => roundPoly([[-hw0, zb], [hw0, zb], [hwS, zS], [hw1, zt], [-hw1, zt], [-hwS, zS]], [r * 0.45, r * 0.45, r * 1.6, r, r, r * 1.6], 3).map(([y, z]) => [x, y, z]);
const podSec = (x, sg, yi, yo, zb, zt, r) => roundPoly([[yi, zb], [yo, zb], [yo, zt], [yi, zt]], [0.02, r * 0.6, r, r * 0.5], 3).map(([y, z]) => [x, y * sg, z]);
// an aerofoil section in the x-z plane: leading edge at le, chord pointing backwards and tilted up by ang
function foil(le, chord, thick, ang) { const ca = Math.cos(ang), sa = Math.sin(ang); return [[0, 0], [0.06, 0.55], [0.28, 1], [0.6, 0.75], [1, 0.12], [1, -0.12], [0.6, -0.3], [0.28, -0.4], [0.06, -0.3]].map(([u, w]) => [le[0] - u * chord * ca + w * thick * 0.5 * sa, le[1] + u * chord * sa + w * thick * 0.5 * ca]); }
// local to plate: crash yaw and drift, plus a little pitch and roll
let yawVis = 0;
function Wc(p) { const c = crash, yaw = c ? c.yaw : yawVis, oy = c ? c.y : 0; const z = p[2] + p[0] * pitch + p[1] * roll, cs = Math.cos(yaw), sn = Math.sin(yaw); return [CX + p[0] * cs - p[1] * sn, oy + p[1] * cs + p[0] * sn, z]; }
const TYRE = (ww) => [[0.235, -ww / 2 + 0.012], [0.3, -ww / 2], [0.345, -ww / 2 + 0.026], [0.36, -ww / 2 + 0.075], [0.36, ww / 2 - 0.075], [0.345, ww / 2 - 0.026], [0.3, ww / 2], [0.235, ww / 2 - 0.012]];
// the same thing as a matrix, for the cached parts
const mul = (A, B) => [A[0] * B[0] + A[1] * B[3] + A[2] * B[6], A[0] * B[1] + A[1] * B[4] + A[2] * B[7], A[0] * B[2] + A[1] * B[5] + A[2] * B[8], A[3] * B[0] + A[4] * B[3] + A[5] * B[6], A[3] * B[1] + A[4] * B[4] + A[5] * B[7], A[3] * B[2] + A[4] * B[5] + A[5] * B[8], A[6] * B[0] + A[7] * B[3] + A[8] * B[6], A[6] * B[1] + A[7] * B[4] + A[8] * B[7], A[6] * B[2] + A[7] * B[5] + A[8] * B[8], A[0] * B[9] + A[1] * B[10] + A[2] * B[11] + A[9], A[3] * B[9] + A[4] * B[10] + A[5] * B[11] + A[10], A[6] * B[9] + A[7] * B[10] + A[8] * B[11] + A[11]];
function Wm() { const c = crash, yaw = c ? c.yaw : yawVis, cs = Math.cos(yaw), sn = Math.sin(yaw); return [cs, -sn, 0, sn, cs, 0, pitch, roll, 1, CX, c ? c.y : 0, 0]; }
const WHEELS = [[1.7, 0.3, true, 1], [1.7, 0.3, true, -1], [-1.7, 0.38, false, 1], [-1.7, 0.38, false, -1]].map(([wx, ww, front, sg]) => ({ wx, ww, front, sg, yc: sg * (0.95 - ww / 2), out: sg * (ww / 2 - 0.02) }));
const rimOf = (w, emit) => lathe([[0, w.out - w.sg * 0.05], [0.07, w.out - w.sg * 0.05], [0.09, w.out - w.sg * 0.035], [0.21, w.out - w.sg * 0.02], [0.236, w.out]], "#2a2d32", { c: [w.wx, w.yc, 0.36], axis: "y", mat: "metal", seg: 30, emit, shell: true });
// everything on the car that never changes shape or colour: meshed once, then just moved
function bodyParts(hitFront, noWing) {
  const S = { shell: true }, Pn = { mat: "paint" }, Cb = { mat: "carbon" }, out = [];
  // floor and diffuser
  out.push(prism([[1.25, -0.3], [1.25, 0.3], [0.8, 0.88], [-1.3, 0.88], [-1.95, 0.55], [-2.3, 0.5], [-2.3, -0.5], [-1.95, -0.55], [-1.3, -0.88], [0.8, -0.88]], "z", 0.04, 0.085, CARB, Cb), prism([[-1.9, 0.085], [-2.35, 0.32], [-2.35, 0.085]], "y", -0.5, 0.5, CARB, Cb));
  // nose and survival cell: one skin over a row of sections
  const tub = [[0.25, 0.34, 0.3, 0.09, 0.66, 0.09], [-0.38, 0.34, 0.3, 0.09, 0.66, 0.09]];
  const nose = [[2.82, 0.06, 0.05, 0.16, 0.22, 0.03], [2.4, 0.11, 0.1, 0.14, 0.28, 0.045], [1.8, 0.19, 0.17, 0.12, 0.41, 0.06], [1.25, 0.27, 0.24, 0.1, 0.55, 0.08], [0.75, 0.32, 0.28, 0.09, 0.63, 0.09]];
  out.push(loft((hitFront ? [[1.25, 0.2, 0.17, 0.14, 0.4, 0.05], nose[3], nose[4]] : nose).concat(tub).map((s) => sec(...s)), LIV, { ...Pn, ...S }));
  // cockpit opening and headrest
  out.push(prism(E.rrect(-0.32, 0.42, -0.2, 0.2, 0.12), "z", 0.655, 0.668, "#0b0c0e", { mat: "matte", bevel: 0 }), prism(roundPoly([[-0.36, -0.22], [-0.2, -0.24], [-0.2, 0.24], [-0.36, 0.22]], 0.04, 2), "z", 0.66, 0.8, "#15171a", { mat: "rubber" }));
  // engine cover and airbox, with its stripe and intake
  out.push(loft([[-0.38, 0.33, 0.3, 0.6, 0.14, 0.09, 0.98, 0.1], [-0.6, 0.33, 0.3, 0.58, 0.13, 0.09, 1.0, 0.1], [-1.0, 0.31, 0.28, 0.52, 0.1, 0.09, 0.86, 0.09], [-1.5, 0.26, 0.2, 0.44, 0.07, 0.09, 0.64, 0.06], [-1.95, 0.16, 0.11, 0.36, 0.05, 0.12, 0.46, 0.04], [-2.12, 0.1, 0.07, 0.3, 0.04, 0.16, 0.36, 0.03]].map((s) => sec6(...s)), LIV, { ...Pn, ...S }));
  out.push(prism(roundPoly([[-0.1, 0.84], [0.1, 0.84], [0.07, 0.96], [-0.07, 0.96]], 0.03, 2), "x", -0.375, -0.368, "#08090a", { mat: "matte", bevel: 0 }));
  out.push(loft([[-0.5, 1.005], [-0.9, 0.9], [-1.5, 0.66], [-1.95, 0.48]].map(([x, z]) => roundPoly([[-0.035, z - 0.01], [0.035, z - 0.01], [0.03, z + 0.022], [-0.03, z + 0.022]], 0.008, 1).map(([y, zz]) => [x, y, zz])), LIV2, Pn));
  // sidepods with their inlets, and the radiators inside them
  for (const sg of [-1, 1]) {
    out.push(loft([[0.55, 0.33, 0.8, 0.1, 0.52, 0.1], [0.2, 0.33, 0.85, 0.09, 0.55, 0.12], [-0.4, 0.33, 0.85, 0.09, 0.5, 0.12], [-1.0, 0.3, 0.68, 0.09, 0.37, 0.1], [-1.5, 0.26, 0.5, 0.09, 0.25, 0.07], [-1.95, 0.2, 0.36, 0.09, 0.16, 0.04]].map(([x, yi, yo, zb, zt, r]) => podSec(x, sg, yi, yo, zb, zt, r)), LIV, { ...Pn, ...S }));
    out.push(prism(roundPoly([[sg * 0.4, 0.22], [sg * 0.74, 0.22], [sg * 0.74, 0.46], [sg * 0.4, 0.46]], 0.05, 2), "x", 0.548, 0.556, "#08090a", { mat: "matte", bevel: 0 }));
    out.push(prism([[0.36, 0.13], [0.42, 0.14], [0.1, 0.5], [0.04, 0.49]], "y", sg > 0 ? 0.4 : -0.78, sg > 0 ? 0.78 : -0.4, "#7d848c", { mat: "steel" }));
  }
  // front wing main plane, endplates and pylons (the flaps move, so they are drawn live)
  if (!hitFront) {
    out.push(prism(foil([2.99, 0.09], 0.56, 0.05, 0.07), "y", -0.95, 0.95, CARB, Cb));
    for (const yy of [-0.97, 0.95]) out.push(prism([[2.3, 0.06], [3.0, 0.06], [3.0, 0.2], [2.45, 0.35], [2.3, 0.3]], "y", yy, yy + 0.02, LIV, Pn));
    for (const yy of [-0.09, 0.07]) out.push(prism([[2.5, 0.11], [2.72, 0.11], [2.66, 0.18], [2.48, 0.2]], "y", yy, yy + 0.02, CARB, Cb));
  }
  // rear wing endplates and main plane; beam wing, pylon and crash structure
  if (!noWing) { for (const yy of [-0.53, 0.51]) out.push(prism([[-1.98, 0.38], [-2.68, 0.38], [-2.68, 1.02], [-2.08, 1.0], [-1.98, 0.8]], "y", yy, yy + 0.02, LIV, Pn)); out.push(prism(foil([-2.2, 0.86], 0.4, 0.05, 0.1), "y", -0.51, 0.51, CARB, Cb)); }
  out.push(prism(foil([-2.2, 0.42], 0.28, 0.035, 0.12), "y", -0.45, 0.45, CARB, Cb), prism([[-2.05, 0.3], [-2.3, 0.3], [-2.42, 0.86], [-2.3, 0.86]], "y", -0.025, 0.025, CARB, Cb), box(-2.36, -2.12, -0.07, 0.07, 0.24, 0.36, CARB, Cb));
  // suspension, driveshafts, calipers
  for (const w of WHEELS) {
    if (hitFront && w.front && w.sg > 0) continue;
    const { wx, ww, front, sg } = w, ox = front ? 1.0 : -1.45, oy = sg * (front ? 0.27 : 0.2), hy = sg * (0.95 - ww) + sg * 0.02, R = 0.014;
    out.push(tube([[ox + (front ? 0.3 : 0.25), oy, 0.5], [wx, hy, 0.47]], R, CARB, Cb), tube([[ox + (front ? 0.95 : -0.5), oy * 0.8, 0.44], [wx, hy, 0.47]], R, CARB, Cb), tube([[ox + (front ? 0.3 : 0.25), oy, 0.16], [wx, hy, 0.22]], R, CARB, Cb), tube([[ox + (front ? 0.95 : -0.5), oy * 0.7, 0.17], [wx, hy, 0.22]], R, CARB, Cb), tube([[wx, hy, 0.24], [wx - (front ? 0.1 : -0.1), oy, 0.5]], R * 0.9, CARB, Cb));
    if (!front) out.push(tube([[wx, sg * 0.14, 0.36], [wx, hy, 0.36]], 0.024, "#8d939b", { mat: "steel" }));
  }
  // halo
  const hp = [[-0.34, -0.3, 0.66]]; for (let i = 0; i <= 14; i++) { const t = -Math.PI / 2 + (Math.PI * i) / 14; hp.push([-0.28 + 0.58 * Math.cos(t), 0.3 * Math.sin(t), 0.82 + 0.06 * Math.cos(t)]); } hp.push([-0.34, 0.3, 0.66]);
  out.push(tube(hp, 0.027, "#1a1b1e", { mat: "gloss", seg: 8 }), tube([[0.44, 0, 0.64], [0.31, 0, 0.87]], 0.026, "#1a1b1e", { mat: "gloss", seg: 8 }));
  // the driver: helmet and visor above the tub, the rest inside it
  const suit = "#e9eef5", Mt = { mat: "matte" };
  out.push(sphere([-0.1, 0, 0.79], 0.125, LIV2, { mat: "gloss", lat: 10, lon: 16 }), tube(Array.from({ length: 9 }, (_, i) => { const a = -1.05 + (2.1 * i) / 8; return [-0.1 + 0.118 * Math.cos(a), 0.118 * Math.sin(a), 0.805]; }), 0.026, "#0d0e10", { mat: "chrome", seg: 6 }));
  out.push(tube([[0.08, 0, 0.22], [-0.14, 0, 0.6]], [0.13, 0.15], suit, Mt), sphere([-0.13, 0, 0.62], 0.16, suit, { mat: "matte", squash: [0.8, 1.25, 0.7] }));
  for (const sg of [-1, 1]) out.push(tube([[0.1, sg * 0.09, 0.22], [0.62, sg * 0.1, 0.36], [1.12, sg * 0.08, 0.26]], [0.075, 0.06, 0.045], suit, Mt), tube([[-0.12, sg * 0.2, 0.58], [0.12, sg * 0.22, 0.46], [0.33, sg * 0.11, 0.56]], 0.042, suit, Mt));
  out.push(prism(roundPoly([[-0.13, 0.5], [0.13, 0.5], [0.13, 0.62], [-0.13, 0.62]], 0.03, 2), "x", 0.34, 0.36, "#15171a", Cb), tube([[0.36, 0, 0.56], [0.75, 0, 0.5]], 0.014, "#8d939b", { mat: "steel" }));
  // what the bodywork hides: fuel cell, the V6 and its turbo, gearbox (the bits that glow are drawn live)
  const bank = (sg) => { const dx = Math.SQRT1_2 * sg, dz = Math.SQRT1_2, px = dz, pz = -dx; return [[0.02 * sg + px * 0.065, 0.22 + pz * 0.065], [0.02 * sg + px * 0.065 + dx * 0.19, 0.22 + pz * 0.065 + dz * 0.19], [0.02 * sg - px * 0.065 + dx * 0.19, 0.22 - pz * 0.065 + dz * 0.19], [0.02 * sg - px * 0.065, 0.22 - pz * 0.065]]; };
  const head = (sg) => { const b = bank(sg), dx = Math.SQRT1_2 * sg * 0.035, dz = Math.SQRT1_2 * 0.035; return [b[1], [b[1][0] + dx, b[1][1] + dz], [b[2][0] + dx, b[2][1] + dz], b[2]]; };
  out.push(prism(E.rrect(-0.82, -0.44, -0.27, 0.27, 0.07), "z", 0.27, 0.62, "#3a3f47", { mat: "plastic" }), box(-1.4, -0.88, -0.12, 0.12, 0.11, 0.26, "#9aa1a9", { mat: "metal" }));
  for (const sg of [-1, 1]) out.push(prism(bank(sg), "x", -1.38, -0.9, "#b4bac1", { mat: "metal" }), prism(head(sg), "x", -1.37, -0.91, "#c7272b", Pn));
  out.push(prism(roundPoly([[-0.09, 0.4], [0.09, 0.4], [0.07, 0.49], [-0.07, 0.49]], 0.03, 2), "x", -1.34, -0.92, "#15171a", Cb), lathe([[0, -0.1], [0.07, -0.1], [0.11, -0.05], [0.11, 0.04], [0.06, 0.1], [0, 0.1]], "#aeb4bb", { c: [-1.6, 0, 0.42], axis: "x", mat: "metal", seg: 18 }), prism([[-1.42, -0.15], [-1.42, 0.15], [-2.1, 0.07], [-2.1, -0.07]], "z", 0.13, 0.4, "#5b6068", { mat: "metal" }));
  return out;
}
function carObjects() {
  const O = [], c = crash, hitFront = !!(c && c.hit && !c.noHit && c.kind === "straight"), M = Wm();
  O.push({ cache: "body", rev: (hitFront ? 1 : 0) + (wingGone ? 2 : 0), m: M, parts: () => bodyParts(hitFront, wingGone) });
  // wheels: tyre, stripe and nut cached; rims and discs glow with the brakes, so they are live
  const glowT = clamp((discT - 650) / 550, 0, 1), cs = Math.cos(steer), sn = Math.sin(steer);
  WHEELS.forEach((w, n) => {
    if (hitFront && w.front && w.sg > 0) return;
    const hub = [w.wx, w.yc, 0.36], mW = w.front ? mul(M, [cs, -sn, 0, sn, cs, 0, 0, 0, 1, w.wx - (w.wx * cs - w.yc * sn), w.yc - (w.yc * cs + w.wx * sn), 0]) : M;
    O.push({ cache: "wheel" + n, rev: 0, m: mW, parts: () => [lathe(TYRE(w.ww), "#131416", { c: hub, axis: "y", mat: "rubber", seg: 30, shell: true }), lathe([[0, w.out - w.sg * 0.065], [0.045, w.out - w.sg * 0.065], [0.045, w.out - w.sg * 0.03], [0, w.out - w.sg * 0.03]], LIV2, { c: hub, axis: "y", mat: "paint", seg: 12, shell: true }), lathe([[0.302, w.sg * (w.ww / 2 + 0.003)], [0.34, w.sg * (w.ww / 2 - 0.02)]], "#e8c22a", { c: hub, axis: "y", mat: "paint", seg: 30, shell: true }), prism([[w.wx - 0.09, 0.47], [w.wx + 0.09, 0.47], [w.wx + 0.11, 0.56], [w.wx - 0.11, 0.56]], "y", w.yc - w.sg * 0.06 - 0.045, w.yc - w.sg * 0.06 + 0.045, "#c7272b", { mat: "paint" })].concat(w.front ? [] : [rimOf(w)]) });
    const xf = w.front ? (p) => { const dx = p[0] - w.wx, dy = p[1] - w.yc; return Wc([w.wx + dx * cs - dy * sn, w.yc + dy * cs + dx * sn, p[2]]); } : Wc, din = -w.sg * 0.06;
    O.push({ xf, parts: [w.front ? rimOf(w, ["#ff5a14", glowT * 0.55]) : null, lathe([[0.05, din - 0.016], [0.175, din - 0.016], [0.175, din + 0.016], [0.05, din + 0.016]], "#3b3d42", { c: hub, axis: "y", mat: "carbon", seg: 24, emit: ["#ff6a1a", w.front ? glowT : glowT * 0.4], emitK: 2.6 })] });
  });
  const live = [];
  // flaps, front and rear
  if (!hitFront) live.push(prism(foil([2.66, 0.135], 0.3, 0.035, flapF), "y", -0.93, -0.2, LIV2, { mat: "paint" }), prism(foil([2.66, 0.135], 0.3, 0.035, flapF), "y", 0.2, 0.93, LIV2, { mat: "paint" }), prism(foil([2.45, 0.2], 0.26, 0.03, flapF * 1.25), "y", -0.93, -0.22, LIV2, { mat: "paint" }), prism(foil([2.45, 0.2], 0.26, 0.03, flapF * 1.25), "y", 0.22, 0.93, LIV2, { mat: "paint" }));
  if (!wingGone) live.push(prism(foil([-2.43, 0.93], 0.25, 0.03, flapR), "y", -0.51, 0.51, LIV2, { mat: "paint" }));
  // rain light: flashes when the car is harvesting or has run out of electric boost
  const blink = (clipNow || harNow > 50e3) && Math.floor(now * 8) % 2 === 0;
  live.push(box(-2.375, -2.36, -0.05, 0.05, 0.26, 0.34, "#3a0a0a", { emit: ["#ff2a1a", blink ? 1 : 0.12], emitK: 2.4, bevel: 0 }));
  // battery and MGU-K: blue when spending, green when harvesting. Exhausts glow on the throttle.
  const kFlow = depNow > 1e3 ? ["#4fb3ff", clamp(depNow / 350e3, 0.25, 1)] : harNow > 1e3 ? ["#3ddc84", clamp(harNow / 350e3, 0.3, 1)] : ["#3ddc84", 0.06];
  const thr = (!crash && prof.brake[idx(sPos)] === 0 ? 1 : 0) * clamp(vNow / 60, 0.3, 1), hotEx = ["#ff7a1a", 0.15 + 0.6 * thr];
  live.push(prism(E.rrect(-0.82, -0.44, -0.26, 0.26, 0.04), "z", 0.105, 0.25, "#1d6b4a", { mat: "plastic", emit: kFlow, emitK: 1.4 }), lathe([[0, -0.11], [0.075, -0.11], [0.075, 0.11], [0, 0.11]], "#c98a3b", { c: [-1.02, -0.215, 0.2], axis: "x", mat: "copper", seg: 16, emit: kFlow, emitK: 1.2 }),
    tube([[-1.68, 0, 0.42], [-2.0, 0, 0.43], [-2.26, 0, 0.5]], [0.045, 0.045, 0.052], "#6f5a48", { mat: "steel", emit: hotEx, emitK: 1.2 }));
  for (const sg of [-1, 1]) for (let n = 0; n < 3; n++) live.push(tube([[-0.98 - n * 0.15, sg * 0.17, 0.33], [-1.04 - n * 0.15, sg * 0.215, 0.27], [-1.44, sg * 0.17, 0.3], [-1.56, sg * 0.08, 0.42]], 0.02, "#8a5a3a", { mat: "copper", emit: hotEx, emitK: 1.8, seg: 6 }));
  O.push({ xf: Wc, parts: live });
  return O;
}
const LABELS = [
  { p: [-1.14, 0.08, 0.4], text: "1.6 L V6 turbo", sub: "about 400 kW, sustainable fuel" }, { p: [-1.02, -0.215, 0.2], text: "MGU-K", sub: "350 kW motor and generator" }, { p: [-0.63, 0, 0.16], text: "Battery", sub: "harvest it, then spend it" },
  { p: [-0.63, 0.15, 0.55], text: "Fuel cell", sub: "behind the driver" }, { p: [-1.8, 0, 0.3], text: "Gearbox", sub: "8 speeds, carries the rear suspension" }, { p: [0.2, 0.6, 0.35], text: "Radiator", sub: "one in each sidepod" },
  { p: [1.7, 0.72, 0.36], text: "Carbon brake disc", sub: "happy past 1,000 °C" }, { p: [0.6, -0.2, 0.4], text: "Survival cell", sub: "carbon tub round the driver" }, { p: [-1.6, 0, 0.46], text: "Turbocharger", sub: "" },
];
const TYRE_WALL = [[0.15, 0], [0.27, 0], [0.3, 0.05], [0.3, 0.21], [0.27, 0.26], [0.15, 0.26]];
function draw(dt) {
  const kap = pts[idx(sPos)].kap, objs = [], X0 = -5.5, X1 = 5.5;
  yawVis += ((crash ? 0 : steer * 0.3) - yawVis) * Math.min(1, dt * 6);
  if (!crash) scroll += vNow * dt * 0.16;
  // track furniture scrolling under the car: edge lines, seams, kerbs on the inside of corners
  const deco = [box(X0, X1, -2.11, -2.05, 0.004, 0.004, "#e9e9e6", { mat: "matte" }), box(X0, X1, 2.05, 2.11, 0.004, 0.004, "#e9e9e6", { mat: "matte" })];
  const ph = scroll % 3.2;
  for (let x = X0 - ph + 3.2; x < X1; x += 3.2) { const a = Math.max(X0, x), b = Math.min(X1, x + 0.05); if (b > a) deco.push(box(a, b, -2.05, 2.05, 0.003, 0.003, lightTheme ? "#585b61" : "#232529", { flat: true })); }
  for (let x = X0 - (scroll % 1.6) + 1.6; x < X1; x += 1.6) { const a = Math.max(X0, x), b = Math.min(X1, x + 0.7); if (b > a) deco.push(box(a, b, -0.03, 0.03, 0.004, 0.004, lightTheme ? "#9a9da3" : "#5c5f66", { flat: true })); }
  if (kap && !crash) { const side = kap > 0 ? 1 : -1; let n = Math.floor(scroll / 0.5); for (let x = X0 - (scroll % 0.5); x < X1; x += 0.5, n--) { const a = Math.max(X0, x), b = Math.min(X1, x + 0.5); if (b <= a) continue; deco.push(box(a, b, side > 0 ? 2.11 : -2.45, side > 0 ? 2.45 : -2.11, 0, 0.035, ((n % 2) + 2) % 2 ? "#d8302c" : "#ededea", { mat: "paint", bevel: 0 })); } }
  // run-off: gravel, then the tyre wall coming to meet the car
  if (crash) {
    const c = crash, g0 = Math.max(X0, c.wallX - 5), g1 = Math.min(X1, c.wallX);
    if (g1 > g0) { deco.push(box(g0, g1, -2.5, 2.5, 0.006, 0.006, "#b39b6e", { mat: "matte" })); for (let n = 0; n < 110; n++) { const gx = c.wallX - 5 + ((n * 0.6180339) % 1) * 5, gy = -2.4 + ((n * 0.7548777) % 1) * 4.8, gs = 0.012 + ((n * 0.37) % 1) * 0.022; if (gx > g0 + 0.1 && gx < g1 - 0.1) deco.push(box(gx - gs, gx + gs, gy - gs, gy + gs, 0, gs * 0.9, n % 3 ? "#a18a5f" : "#c7b189", { mat: "matte", bevel: 0 })); } }
    if (c.wallX < 5.35) {
      const wall = [];
      for (let yy = -2.1, n = 0; yy <= 2.11; yy += 0.6, n++) for (let zz = 0; zz < 3; zz++) { const near = c.hit && Math.abs(yy - c.y) < 1.3, f = near ? c.pop : 0; wall.push(lathe(TYRE_WALL, "#17181a", { c: [c.wallX + 0.32 + f * (0.25 + 0.1 * zz + 0.1 * ((n * 7) % 3)), yy + f * 0.1 * (((n + zz) % 3) - 1), zz * 0.26 + f * 0.05 * zz], mat: "rubber", seg: 14 })); }
      for (let yy = -2.4, n = 0; yy < 2.39; yy += 0.6, n++) { const push = c.hit && Math.abs(yy + 0.3 - c.y) < 1.2 ? c.pop * 0.2 : 0; wall.push(box(c.wallX - 0.03 + push, c.wallX + push, yy, yy + 0.6, 0.04, 0.7, n % 2 ? "#c7272b" : "#ededea", { mat: "plastic", bevel: 0 })); }
      // debris fence behind the tyres: posts, and wire you can see through
      const fx = c.wallX + 0.74;
      if (fx < 5.5) { for (let yy = -2.4; yy <= 2.41; yy += 1.2) wall.push(tube([[fx, yy, 0], [fx, yy, 1.5], [fx - 0.18, yy, 1.72]], 0.025, "#8d939b", { mat: "steel", seg: 6 })); for (let zz = 0.15; zz < 1.5; zz += 0.15) E.line([fx, -2.4, zz], [fx, 2.4, zz], 0.8, lightTheme ? "#5a5f66" : "#aab0b8", 0.35); for (let yy = -2.4; yy <= 2.41; yy += 0.2) E.line([fx, yy, 0], [fx, yy, 1.5], 0.8, lightTheme ? "#5a5f66" : "#aab0b8", 0.3); }
      objs.push({ parts: wall });
    }
  }
  objs.push({ parts: deco });
  for (const o of carObjects()) objs.push(o);
  // downforce arrows: one over each axle, as long as the load
  if (!crash) for (const [x, kg] of [[1.7, dfF], [-1.75, dfR]]) { const l = clamp(kg / 900, 0, 1.6); if (l < 0.06) continue; objs.push({ xf: Wc, parts: [lathe([[0, 0], [0.085, 0.16], [0.03, 0.16], [0.03, 0.16 + l], [0, 0.16 + l]], "#3ddc84", { c: [x, 0, 1.18], flat: true, emit: ["#3ddc84", 0.5], seg: 12 })] }); }
  // the rear wing flying off, and the bits
  for (const fl of flying) {
    const ca = Math.cos(fl.rot), sa = Math.sin(fl.rot);
    const xf = (p) => { const dx = p[0] + 2.4, dz = p[2] - 0.9; return [fl.p[0] + dx * ca - dz * sa, fl.p[1] + p[1], fl.p[2] + dx * sa + dz * ca]; };
    objs.push({ xf, parts: [prism(foil([-2.2, 0.86], 0.4, 0.05, 0.1), "y", -0.51, 0.51, CARB, { mat: "carbon" }), prism(foil([-2.43, 0.93], 0.25, 0.03, 0.5), "y", -0.51, 0.51, LIV2, { mat: "paint" }), ...[-0.53, 0.51].map((yy) => prism([[-1.98, 0.6], [-2.68, 0.6], [-2.68, 1.02], [-2.08, 1.0]], "y", yy, yy + 0.02, LIV, { mat: "paint" }))] });
    fl.life += dt; fl.v[2] -= 9.8 * dt * 0.35; for (let i = 0; i < 3; i++) fl.p[i] += fl.v[i] * dt; fl.rot += fl.w * dt;
  }
  flying = flying.filter((fl) => fl.p[0] > -8 && fl.life < 4 && fl.p[2] > -0.5);
  for (const d of debris) {
    d.life += dt; d.v[2] -= 9.8 * dt; for (let i = 0; i < 3; i++) d.p[i] += d.v[i] * dt; d.rot += d.w * dt;
    if (d.p[2] < d.s * 0.3) { d.p[2] = d.s * 0.3; d.v = [d.v[0] * 0.5, d.v[1] * 0.5, -d.v[2] * 0.3]; d.w *= 0.6; }
    const cs = Math.cos(d.rot), sn = Math.sin(d.rot);
    objs.push({ xf: (p) => [d.p[0] + p[0] * cs - p[2] * sn, d.p[1] + p[1], d.p[2] + p[0] * sn + p[2] * cs], parts: [box(-d.s, d.s, -d.s * 0.7, d.s * 0.7, -d.s * 0.25, d.s * 0.25, d.c, { mat: "carbon", bevel: 0 })] });
  }
  debris = debris.filter((d) => d.life < 6 && Math.abs(d.p[0]) < 5.6 && Math.abs(d.p[1]) < 2.5);
  let svg = E.render(objs);
  // the air: streaks flowing over the car, pushed up by the wings
  const U = crash ? 0 : 3 + vNow * 0.09, dirty = follow > 0;
  if (U > 0) { const fill = air.length === 0; while (air.length < 90) air.push({ p: [5.5 - rnd() * (fill ? 11 : 0.4), (rnd() - 0.5) * 2.6, 0.06 + rnd() * 1.3], tr: [] }); }
  const airCol = dirty ? (lightTheme ? "#c2571a" : "#ffa05a") : lightTheme ? "#1f6fc0" : "#a8d6ff";
  air = air.filter((a) => {
    if (!U) return false;
    const f = flowAt(a.p), jit = dirty ? (follow === 2 ? 1.6 : 0.8) : 0;
    a.p[0] += f[0] * U * dt; a.p[1] += (f[1] * U + (rnd() - 0.5) * jit * 3) * dt; a.p[2] = Math.max(0.03, a.p[2] + (f[2] * U + (rnd() - 0.5) * jit * 2) * dt);
    a.tr.push([a.p[0], a.p[1], a.p[2]]); if (a.tr.length > 9) a.tr.shift();
    if (a.p[0] < -5.6) return false;
    for (let i = 1; i < a.tr.length; i++) E.line(a.tr[i - 1], a.tr[i], 1.1, airCol, (lightTheme ? 0.45 : 0.26) * (i / a.tr.length), !lightTheme);
    return true;
  });
  // glows and particles
  if (discT > 600 && !(crash && crash.hit && crash.kind === "straight")) for (const sg of [1, -1]) E.sprite(Wc([1.7, sg * 0.8, 0.36]), 0.55, "#ff7a2a", clamp((discT - 600) / 600, 0, 1) * 0.5, true, 1);
  parts = parts.filter((p) => {
    p.life += dt; if (p.life > p.max) return false;
    const u = p.life / p.max;
    if (p.k === "smoke") { p.r += dt * 0.7; for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * dt; E.sprite(p.p, p.r, lightTheme ? "#8f8f8f" : "#d8d8d8", 0.34 * (p.a || 1) * (1 - u)); return true; }
    if (p.k === "dust") { p.r += dt * 0.5; for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * dt; E.sprite(p.p, p.r, "#2a2523", 0.4 * (1 - u)); return true; }
    if (p.k === "flame") { p.r += dt * 0.6; for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * dt; E.sprite(p.p, p.r, u < 0.4 ? "#ffd27a" : "#ff6a1a", 0.9 * (1 - u), true, 1); return true; }
    const o = [p.p[0], p.p[1], p.p[2]]; p.v[2] -= 9.8 * dt; for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * dt; if (p.p[2] < 0.01) { p.p[2] = 0.01; p.v = [p.v[0] * 0.5, p.v[1] * 0.5, -p.v[2] * 0.3]; }
    if (p.k === "spark") { E.line(o, p.p, 1.6, u < 0.5 ? "#ffd9a0" : "#ff8a3a", 1 - u, true); return true; }
    E.sprite(p.p, p.s, "#b39b6e", 1 - u * 0.5); return true;
  });
  // labels: downforce numbers, and the callouts when the x-ray is on
  if (!crash) for (const [x, kg] of [[1.7, dfF], [-1.75, dfR]]) { const l = clamp(kg / 900, 0, 1.6); if (l < 0.06) continue; const q = E.project(Wc([x, 0, 1.4 + l])); svg += '<text class="mk-lab dfl" x="' + fx1(q[0] + 8) + '" y="' + fx1(q[1] + 4) + '">' + Math.round(kg) + " kg</text>"; }
  if (E.xray > 0.02) svg += E.callouts(LABELS.map((l) => ({ ...l, p: Wc(l.p) })), E.xray, E.fs < 0.62 ? {} : { topL: 196 });
  sceneG.innerHTML = svg;
  drawMap();
  const text = crash ? (crash.hit ? "RED FLAG" : Math.round(vNow * 3.6) + " km/h · OFF") : Math.round(vNow * 3.6) + " km/h · " + (modeNow ? "STRAIGHT MODE" : "CORNER MODE") + " · " + Math.abs(latG).toFixed(1) + " g";
  if (readout.textContent !== text) readout.textContent = text;
}
function flowAt(p) {
  const v = [-1, 0, 0], x = p[0] - CX, y = p[1], z = p[2];
  const s = clamp(df / 1500, 0.2, 1.6), fl = modeNow ? 0.4 : 1;
  if (Math.abs(y) < 1 && z < 0.5 && x > 2.2 && x < 3.2) v[2] += 0.35 * s * fl;
  if (Math.abs(y) < 0.5 && z > 0.6 && z < 1.25 && x < -2.2 && x > -3.4) v[2] += 0.55 * s * fl * (wingGone ? 0.1 : 1);
  if (Math.abs(y) < 0.5 && z < 0.35 && x < -1.9 && x > -2.9) v[2] += 0.25 * s;
  if (x < 0.8 && x > -2.3 && Math.abs(y) < 0.9 && z < 1.05) v[2] += 0.18 * (x > -0.4 ? 1 : -0.6);
  if (!wingGone) for (const sg of [-1, 1]) { const dy = y - sg * 0.52, dz = z - 0.98; if (x < -2.4 && dy * dy + dz * dz < 0.12) { v[1] += -dz * 1.6 * sg * s; v[2] += dy * 1.6 * sg * s; } }
  return v;
}
// inset: track map coloured by speed, with the car on it, and the lap's speed trace
function drawMap() {
  const r = mcv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1), w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr)); if (mcv.width !== w || mcv.height !== h) { mcv.width = w; mcv.height = h; }
  mctx.setTransform(1, 0, 0, 1, 0, 0); mctx.clearRect(0, 0, w, h);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const p of pts) { x0 = Math.min(x0, p.mx); x1 = Math.max(x1, p.mx); y0 = Math.min(y0, p.my); y1 = Math.max(y1, p.my); }
  const box2 = h - 12 * dpr, sc = Math.min(box2 / (x1 - x0), box2 / (y1 - y0)), ox = 6 * dpr + (box2 - (x1 - x0) * sc) / 2, oy = 6 * dpr + (box2 - (y1 - y0) * sc) / 2;
  const M = (p) => [ox + (p.mx - x0) * sc, oy + (y1 - p.my) * sc];
  mctx.lineWidth = 2.6 * dpr; mctx.lineCap = "round";
  for (let i = 0; i < N; i += 3) { const a = M(pts[i]), b = M(pts[(i + 3) % N]); const t = clamp((prof.v[i] - 18) / 75, 0, 1); mctx.strokeStyle = "hsl(" + Math.round(10 + 190 * t) + ",75%," + (lightTheme ? 45 : 58) + "%)"; mctx.beginPath(); mctx.moveTo(a[0], a[1]); mctx.lineTo(b[0], b[1]); mctx.stroke(); }
  const c = M(pts[idx(sPos)]); mctx.fillStyle = lightTheme ? "#111" : "#fff"; mctx.beginPath(); mctx.arc(c[0], c[1], 3.5 * dpr, 0, 7); mctx.fill();
  const gx = h + 4 * dpr, gw = w - gx - 8 * dpr, gy = 16 * dpr, gh = h - gy - 8 * dpr;
  mctx.font = Math.round(9 * dpr) + "px ui-monospace,monospace"; mctx.fillStyle = lightTheme ? "#3a4048" : "#aab3bc"; mctx.fillText("SPEED ROUND THE LAP", gx, 11 * dpr);
  mctx.strokeStyle = lightTheme ? "#1769d6" : "#8cc8ff"; mctx.lineWidth = 1.4 * dpr; mctx.beginPath();
  for (let i = 0; i < N; i += 4) { const X = gx + gw * i / N, Y = gy + gh * (1 - prof.v[i] / 100); i ? mctx.lineTo(X, Y) : mctx.moveTo(X, Y); } mctx.stroke();
  mctx.strokeStyle = lightTheme ? "#111" : "#fff"; mctx.lineWidth = dpr; const cx2 = gx + gw * idx(sPos) / N; mctx.beginPath(); mctx.moveTo(cx2, gy); mctx.lineTo(cx2, gy + gh); mctx.stroke();
}

// ---------------- UI ----------------
const $ = (s) => document.querySelector(s);
const ui = {
  wing: $("#wing"), wingOut: $("#wing-out"), aero: $("#aero"), fol: [...document.querySelectorAll("[data-follow]")], ducts: $("#ducts"), snap: $("#snap"), reset: $("#reset"), slow: $("#slow"), tour: $("#tour"), shot: $("#shot"), stats: $("#stats"),
  sF: $("#s-fill"), sO: $("#s-out"), dF: $("#d-fill"), dO: $("#d-out"), bF: $("#b-fill"), bO: $("#b-out"), tF: $("#t-fill"), tO: $("#t-out"), eF: $("#e-fill"), eO: $("#e-out"),
};
const say = (tx) => { if (tx !== lastShot) { ui.shot.textContent = tx; lastShot = tx; } };
const lapStr = (t) => Math.floor(t / 60) + ":" + (t % 60).toFixed(1).padStart(4, "0");
const setBar = (el, pct, state) => { const w = clamp(pct, 0, 100).toFixed(1) + "%"; if (el.style.width !== w) el.style.width = w; if (el.dataset.state !== state) el.dataset.state = state; };
const setTx = (el, tx) => { if (el.textContent !== tx) el.textContent = tx; };
let lastStats = "";
function syncUi() {
  if (document.activeElement !== ui.wing) ui.wing.value = String(Math.round(wing * 100));
  setTx(ui.wingOut, wing < 0.25 ? "Monza (low)" : wing > 0.75 ? "Monaco (high)" : "Medium");
  ui.aero.setAttribute("aria-pressed", String(aeroAuto)); setTx(ui.aero.firstChild, aeroAuto ? "Active aero on" : "Stuck in Corner Mode");
  ui.fol.forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.follow === follow)));
  ui.ducts.setAttribute("aria-pressed", String(!ducts)); setTx(ui.ducts.firstChild, ducts ? "Tape the brake ducts" : "Brake ducts taped");
  ui.snap.disabled = wingGone || !!crash; setTx(ui.snap.firstChild, wingArmed ? "Waiting for 290 km/h" : wingGone ? "Rear wing: gone" : "Snap the rear wing");
  const kmh = vNow * 3.6; setBar(ui.sF, kmh / 360 * 100, "lit"); setTx(ui.sO, Math.round(kmh) + " km/h");
  setBar(ui.dF, df / 2200 * 100, df > 768 ? "lit" : "ok"); setTx(ui.dO, Math.round(df).toLocaleString("en-AU") + " kg");
  setBar(ui.bF, discT / 1300 * 100, discT > 1100 ? "bad" : discT > 950 ? "warn" : "ok"); setTx(ui.bO, discGone ? "gone" : Math.round(discT) + " °C");
  setBar(ui.tF, tyreT - 50, tyreT > 120 ? "bad" : tyreT > 110 ? "warn" : "ok"); setTx(ui.tO, Math.round(tyreT) + " °C");
  setBar(ui.eF, socNow / 4 * 100, depNow > 1e3 ? "lit" : harNow > 1e3 ? "ok" : "warn"); setTx(ui.eO, depNow > 1e3 ? "boost " + Math.round(depNow / 1000) + " kW" : harNow > 1e3 ? "harvest " + Math.round(harNow / 1000) + " kW" : clipNow ? "spent" : socNow.toFixed(1) + " MJ");
  const v250 = 250 / 3.6, dfk = 0.5 * RHO * aero(false).cla * v250 * v250 / G;
  const st = "Lap <b>" + lapStr(prof.lap) + "</b> · top <b>" + Math.round(prof.top * 3.6) + " km/h</b> · slowest " + Math.round(prof.low * 3.6) + " km/h · " + prof.latPk.toFixed(1) + " g cornering, " + prof.brPk.toFixed(1) + " g braking · " + Math.round(dfk).toLocaleString("en-AU") + " kg downforce at 250 km/h · harvests " + (prof.har / 1e6).toFixed(1) + " MJ a lap" + (prof.vCut < 200 ? ", so the electric push stops at <b>" + Math.round(prof.vCut * 3.6) + " km/h</b>" : "");
  if (st !== lastStats) { ui.stats.innerHTML = st; lastStats = st; }
  ui.slow.setAttribute("aria-pressed", String(slow)); ui.tour.setAttribute("aria-pressed", String(touring));
}
function story() {
  if (now - lastEventAt < 7 && lastEvent) return say(lastEvent);
  if (touring && tourStep >= 0 && TOUR[tourStep].say) return say(TOUR[tourStep].say);
  const kmh = vNow * 3.6, i = idx(sPos), seg = TRACK[pts[i].seg], nm = seg[seg.length - 1];
  if (crash) return say("Red flag. Press Reset.");
  if (prof.brake[i] > 2 * G) return say("Braking: " + (prof.brake[i] / G).toFixed(1) + " g. The flaps snap shut into Corner Mode for the grip, the MGU-K harvests up to 350 kW into the battery, and the carbon discs take the rest and glow.");
  if (clipNow) return say("Out of electric boost: the battery only has what the car harvested, so from here it's the engine alone (and the rain light flashes to warn the car behind).");
  if (modeNow) return say("Straight Mode: front and rear flaps flatten out to dump drag" + (follow ? ", and being within a second of the car ahead gives Overtake Mode: the MGU-K keeps pushing to 337 km/h." : ". The MGU-K's 350 kW tapers off from about 290 km/h."));
  if (follow && pts[i].kap) return say("Dirty air: the wake of the car ahead robs the front wing, so the front washes wide and the front tyres slide and cook.");
  if (typeof nm === "string" && pts[i].kap) return say(nm + ": " + Math.round(kmh) + " km/h, " + Math.abs(latG).toFixed(1) + " g sideways. " + (df > 768 ? "It's making more downforce than it weighs." : "Slow enough that most grip here is mechanical, not aero."));
  return say("Downforce grows with speed squared: at 250 km/h this car is pushed into the track with about twice its own weight. It costs drag, which is why the wings open up on the straights.");
}
const xbtn = stage.querySelector('[data-mk="xray"]');
const setX = (on) => { E.setXray(on); xbtn.setAttribute("aria-pressed", String(on)); };
const TOUR = [
  { say: "A lap in clean air, medium wing. Watch the flaps flatten on the straights (Straight Mode) and snap shut for the corners.", acts: [[0, () => { setX(false); set({ wing: 0.5, aeroAuto: true, follow: 0, ducts: true }); }], [20, null]] },
  { say: "X-ray on. Blue is the MGU-K spending the battery, green is harvesting it back under braking. The exhausts glow on throttle and the discs glow on the brakes.", acts: [[0, () => setX(true)], [18, null]] },
  { say: "Active aero switched off: stuck in Corner Mode. Same grip in the corners, but all that drag on the straights costs top speed and lap time.", acts: [[0, () => { setX(false); set({ aeroAuto: false }); }], [14, null]] },
  { say: "Now 0.4 s behind another car. The front wing is eating dirty air: less front grip, slower corners, cooking front tyres. Overtake Mode gives a bit back on the straights.", acts: [[0, () => set({ aeroAuto: true, follow: 2 })], [18, null]] },
  { say: "Clean air again, but someone's taped over the brake ducts. Watch the front discs.", acts: [[0, () => set({ follow: 0, ducts: false })], [32, null]] },
  { say: "Fixed the ducts. Now let's see what happens when the rear wing lets go at the end of the main straight.", acts: [[0, () => { set({ ducts: true }); }], [6, () => { wingArmed = true; }], [26, null]] },
];
function set(o) { if ("wing" in o) wing = o.wing; if ("aeroAuto" in o) aeroAuto = o.aeroAuto; if ("follow" in o) follow = o.follow; if ("ducts" in o) ducts = o.ducts; simulate(); if (crash || discGone || wingGone) reset(); }
function tourTick() {
  if (tourStep < 0 || !actions.length) { tourStep = (tourStep + 1) % TOUR.length; actions = TOUR[tourStep].acts.map(([w2, fn]) => [tourClock + w2, fn]); }
  while (actions.length && tourClock >= actions[0][0]) { const fn = actions.shift()[1]; if (fn) fn(); else actions = []; }
}
function tick(tm) {
  const dt = last ? Math.min((tm - last) / 1000, 1 / 30) : 1 / 60;
  last = tm;
  const sdt = dt * (slow ? 0.25 : 1) * (crash && !crash.hit ? 0.5 : 1) * (now < bulletUntil ? 0.3 : 1);
  now += sdt;
  if (touring) { tourClock += sdt; tourTick(); }
  physics(sdt); draw(sdt); syncUi(); story();
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { if (touring) { touring = false; actions = []; tourStep = -1; } };
const act = (fn) => (...a) => { takeOver(); fn(...a); syncUi(); run(); };
ui.wing.addEventListener("input", act(() => set({ wing: +ui.wing.value / 100 })));
ui.aero.addEventListener("click", act(() => set({ aeroAuto: !aeroAuto })));
ui.fol.forEach((b) => b.addEventListener("click", act(() => set({ follow: +b.dataset.follow }))));
ui.ducts.addEventListener("click", act(() => set({ ducts: !ducts })));
ui.snap.addEventListener("click", act(() => { if (!wingGone && !crash) wingArmed = true; }));
ui.reset.addEventListener("click", act(() => reset()));
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; actions = []; } syncUi(); run(); });
stage.addEventListener("keydown", (ev) => {
  const map = { a: () => set({ aeroAuto: !aeroAuto }), d: () => set({ ducts: !ducts }), w: () => { if (!wingGone && !crash) wingArmed = true; }, f: () => set({ follow: (follow + 1) % 3 }), r: () => reset(), x: () => setX(!E.xrayOn), ArrowUp: () => set({ wing: clamp(wing + 0.1, 0, 1) }), ArrowDown: () => set({ wing: clamp(wing - 0.1, 0, 1) }) };
  if (map[ev.key]) { ev.preventDefault(); act(map[ev.key])(); }
});
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;
window.__fig = { E, freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
simulate(); reset(); draw(0); syncUi(); story();
`;

const CSS = `.m-wrap{width:31%;aspect-ratio:2.4/1}
.dfl{fill:#3ddc84}body[data-theme="light"] .dfl{fill:#13985a}
@media (max-width:560px){.m-wrap{width:50%}}`;

const stage = stageHtml({
  W, H, fig: "Fig 27", title: "F1 car",
  label: "A 2026-style Formula 1 car on a strip of track, with air streaming over its wings, downforce arrows on the axles and glowing front brakes. An x-ray mode shows the engine, battery and brakes inside. A track map is inset.",
  keysHelp: "F1 car: drag to rotate, X for x-ray, A toggles active aero, F the car ahead, D the brake ducts, W snaps the rear wing, R resets, up and down change the wing level",
  extra: `<div class="mk-inset m-wrap" aria-hidden="true"><canvas class="m-cv"></canvas></div>`,
});

const CONTROLS = `<div class="ctl" role="group" aria-label="Controls">
  <div class="ctl-row"><span class="ctl-label">Wing</span><div class="slide"><input id="wing" type="range" min="0" max="100" step="5" value="50" aria-label="Wing level, low to high downforce"></div><output id="wing-out">Medium</output></div>
  <div class="ctl-row"><span class="ctl-label">Speed</span><div class="meter"><span id="s-fill" class="fill"></span></div><output id="s-out">0 km/h</output></div>
  <div class="ctl-row"><span class="ctl-label">Aero</span><button type="button" id="aero" aria-pressed="true">Active aero on<small>Straight Mode on the straights</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Downforce</span><div class="meter"><span id="d-fill" class="fill"></span><span class="mark" style="left:${(768 / 2200 * 100).toFixed(1)}%" data-label="its weight"></span></div><output id="d-out">0 kg</output></div>
  <div class="ctl-row"><span class="ctl-label">Traffic</span><button type="button" data-follow="0" aria-pressed="true">Clean air</button><button type="button" data-follow="1">1 s behind</button><button type="button" data-follow="2">0.4 s behind<small>dirty air</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Battery</span><div class="meter"><span id="e-fill" class="fill"></span></div><output id="e-out">0 MJ</output></div>
  <div class="ctl-row"><span class="ctl-label">Break it</span><button type="button" id="ducts" class="danger" aria-pressed="false">Tape the brake ducts<small>D</small></button><button type="button" id="snap" class="danger">Snap the rear wing<small>W</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Brakes</span><div class="meter"><span id="b-fill" class="fill"></span><span class="mark" style="left:${(1000 / 1300 * 100).toFixed(1)}%" data-label="1,000 °C"></span></div><output id="b-out">0 °C</output></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="reset">Reset<small>R</small></button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
  <div class="ctl-row"><span class="ctl-label">Tyres</span><div class="meter"><span id="t-fill" class="fill"></span><span class="mark" style="left:70%" data-label="too hot"></span></div><output id="t-out">0 °C</output></div>
  <div class="ctl-row wide"><span class="ctl-label">Lap</span><span id="stats"></span></div>
</div>`;

const foot = footHtml({
  theme, slug: "f1",
  real: "downforce and drag growing with speed squared, the 2026 rules (Straight Mode and Corner Mode active aero instead of DRS, about 400 kW of engine and 350 kW of MGU-K that tapers off at high speed, a battery that can only spend what the car harvested, Overtake Mode within a second of the car ahead, a 768 kg minimum weight), carbon brakes running past 1,000 °C, braking at around 5 g, dirty air, the rain light flashing when the car stops deploying, the survival cell and halo, and Grosjean's 67 g impact at 192 km/h in Bahrain in 2020 (FIA).",
  made: "the circuit, the car, its livery and what's where inside it, the aero, tyre and energy numbers, the brake and tyre heat models, the failures and the crash. The track scrolls slower than real so you can see it.",
});
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), pageMk2({
  k, title: "F1 car", fig: "Fig 27", hint: "Grip you buy with drag", theme, W, H, stage, controls: CONTROLS, css: CSS, foot,
  caption: "An F1 car is limited by grip, and in a fast corner most of that grip is downforce: the wings and floor push the car into the track with a force that grows with speed squared. It costs drag, so the 2026 cars flatten their front and rear wing flaps on the straights (Straight Mode) and snap them shut for the corners (Corner Mode); DRS is gone. Half the power is electric, and the battery only holds what the car harvested under braking, so on a long straight the push runs out. Stopping from over 300 km/h takes the brakes past 1,000 °C. Following close behind another car robs the front wing of clean air, which is why it's hard to pass.",
  script: LIVE.replace("__DATA__", JSON.stringify(DATA)),
}));
console.log("wrote", name);
