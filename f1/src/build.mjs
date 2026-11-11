import { writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { kitScript } from "../../scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const SOLID = readFileSync(join(HERE, "solid.mjs"), "utf8").replace(/^export /gm, "");

const W = 680;
const H = 470;

// Truth: an F1 car is grip-limited, and most of the grip in a fast corner comes from downforce, which grows with speed
// squared and costs drag. The 2026 cars move their front and rear wing flaps between a high-downforce Corner Mode and a
// low-drag Straight Mode (DRS is gone), run about 400 kW of engine and 350 kW of MGU-K, and weigh at least 768 kg.
// Carbon brakes live at several hundred to over 1,000 °C. Following closely costs front downforce in corners.
// Toy: a quasi-steady lap simulation on a made-up circuit with round-number aero and tyre figures.
const PLATE = { x: -6.6, y: -2.8, w: 13.2, d: 5.6, r: 0.5 };
const PLATE_H = 0.45, FOOT_H = 0.25;
const P = k.fitProjection([...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [-5, -2, 1.6], [5, 2, 1.6], [5, -2, 1.6]], W, H, { pad: 10, azimuth: 45 });
const Sv = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const depth2 = ([x, y]) => k.depthOf([x, y, 0], P);
const byDepth = (pts) => [...pts].sort((a, b) => depth2(a) - depth2(b));
function plate() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 0.8))) {
    out.push(Sv(k.cylinder(x, y, 0.24, -PLATE_H - FOOT_H, 0.06, P, 24), { tone: "lo" }));
    out.push(Sv(k.cylinder(x, y, 0.19, -PLATE_H - FOOT_H + 0.06, FOOT_H - 0.06, P, 24), { tone: "mid" }));
  }
  out.push(Sv(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 0.06), { tone: "mid", inner: L(k.sideSeam(PLATE, -PLATE_H / 2, P), { tone: "faint" }) }));
  // tarmac and white track edges
  const tar = [[-6.4, -2.4], [6.4, -2.4], [6.4, 2.4], [-6.4, 2.4]].map(([x, y]) => k.iso([x, y, 0.005], P));
  out.push(`<path class="tarmac" d="M${tar.map((p) => p[0].toFixed(1) + " " + p[1].toFixed(1)).join("L")}Z"/>`);
  out.push(`<path class="edge" d="${k.segment([-6.4, -2.3, 0.01], [6.4, -2.3, 0.01], P)}${k.segment([-6.4, 2.3, 0.01], [6.4, 2.3, 0.01], P)}"/>`);
  return out.join("");
}
const svg = k.figureSvg({
  width: W, height: H,
  label: "A 2026-style Formula 1 car on a strip of track, with air streaming over its wings, downforce arrows on the axles and glowing front brakes, and a track map inset.",
  body: [plate(), `<g data-part="scene"></g>`],
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
const clamp = (a, lo, hi) => Math.min(hi, Math.max(lo, a));
const R = solids((p) => iso(p, PR), (p) => depthOf(p, PR));
const { box, prism } = R;
const svgEl = stage.querySelector("svg"), cv = stage.querySelector(".fx-smoke"), ctx = cv.getContext("2d");
const mcv = stage.querySelector(".m-cv"), mctx = mcv.getContext("2d");
const sceneG = q("scene");
const fx1 = (v) => v.toFixed(1);
const sp = (p) => { const a = iso(p, PR); return fx1(a[0]) + " " + fx1(a[1]); };
const PX = (() => { const a = iso([0, 0, 0], PR), b = iso([1, 0, 0], PR); return Math.hypot(b[0] - a[0], b[1] - a[1]); })();
let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

// ---------------- the circuit: straights and corners (radius m, turn in degrees, + is left) ----------------
const TRACK = [["S", 820, "Main straight"], ["C", 17, 150, "Hairpin"], ["S", 260], ["C", 130, 75, "Fast sweeper"], ["S", 240], ["C", 45, 55, "Esses"], ["C", 45, -55], ["S", 680, "Back straight"], ["C", 24, 45, "Chicane"], ["C", 24, -45], ["S", 210], ["C", 75, 135, "Last corner"], ["S", 140]];
const DS = 2, G = 9.81, RHO = 1.2;
let pts = [];
(function () { let x = 0, y = 0, h = 0, s = 0, seg = 0; for (const t of TRACK) { const len = t[0] === "S" ? t[1] : t[1] * Math.abs(t[2]) * Math.PI / 180; const kap = t[0] === "S" ? 0 : Math.sign(t[2]) / t[1]; const n = Math.round(len / DS); for (let i = 0; i < n; i++) { pts.push({ s, x, y, kap, seg, straight: t[0] === "S" && t[1] > 200 }); h += kap * DS; x += Math.cos(h) * DS; y += Math.sin(h) * DS; s += DS; } seg++; }
  // close the drawing (spread the gap along the lap) for the map
  const ex = x, ey = y, N = pts.length; pts.forEach((p, i) => { p.mx = p.x - ex * i / N; p.my = p.y - ey * i / N; }); })();
const N = pts.length, LAP = N * DS;

// ---------------- the car ----------------
const MASS = 800; // 768 kg minimum plus some fuel
let wing = 0.5, aeroAuto = true, follow = 0, ducts = true, slow = false;
const aero = (straightMode) => { const cla = 2.4 + 1.8 * wing, cda = 0.95 + 0.4 * wing; return straightMode ? { cla: cla * 0.5, cda: cda * 0.62 } : { cla, cda }; };
const MU = 1.7;
function dirtyLoss() { return follow === 0 ? 0 : follow === 1 ? 0.18 : 0.38; }
function power(v, overtake) { const kmh = v * 3.6, top = overtake ? 337 : 290, end = overtake ? 345 : 340; const kK = kmh < top ? 1 : clamp((end - kmh) / (end - top), 0, 1); return 400e3 + 350e3 * kK; }
let prof = null;
function simulate() {
  const loss = dirtyLoss(), tow = follow === 0 ? 0 : follow === 1 ? 0.06 : 0.14, ot = follow > 0;
  const vmax = new Float64Array(N), v = new Float64Array(N), mode = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const p = pts[i]; mode[i] = aeroAuto && p.straight ? 1 : 0; const a = aero(false), cla = a.cla * (p.kap ? 1 - loss * 0.7 : 1); const k = Math.abs(p.kap); if (!k) { vmax[i] = 120; continue; } const den = k - MU * RHO * cla / (2 * MASS); vmax[i] = den <= 0 ? 120 : Math.min(120, Math.sqrt(MU * G / den)); }
  const latFrac = (i, vv) => { const k = Math.abs(pts[i].kap); if (!k) return 0; const a = aero(false); const amax = MU * (G + RHO * a.cla * (1 - loss * 0.7) * vv * vv / (2 * MASS)); return clamp(vv * vv * k / amax, 0, 1); };
  // forward pass (accelerate), twice round so the start speed is right
  let vv = 40;
  for (let lap = 0; lap < 2; lap++) for (let i = 0; i < N; i++) {
    vv = Math.min(vv, vmax[i]); v[i] = vv;
    const a = aero(mode[i] === 1), cda = a.cda * (1 - (pts[i].straight ? tow : 0));
    const drag = 0.5 * RHO * cda * vv * vv + 0.015 * MASS * G;
    const trac = MU * 0.75 * (G + 0.5 * RHO * a.cla * vv * vv / MASS) * Math.sqrt(1 - latFrac(i, vv) ** 2);
    const acc = Math.min(trac, (power(vv, ot && pts[i].straight) / Math.max(vv, 5) - drag) / MASS);
    vv = Math.sqrt(Math.max(1, vv * vv + 2 * acc * DS));
  }
  // backward pass (brake), Corner Mode: the flaps shut as soon as the driver brakes
  const brake = new Float64Array(N);
  vv = v[0];
  for (let lap = 0; lap < 2; lap++) for (let i = N - 1; i >= 0; i--) {
    const a = aero(false), drag = 0.5 * RHO * a.cda * vv * vv;
    const dec = (0.88 * MU * (MASS * G + 0.5 * RHO * a.cla * vv * vv) * Math.sqrt(1 - latFrac(i, vv) ** 2) + drag) / MASS;
    const vb = Math.sqrt(vv * vv + 2 * dec * DS);
    if (vb < v[i]) { v[i] = vb; mode[i] = 0; }
    vv = v[i];
  }
  for (let i = 0; i < N; i++) { const a2 = v[i], b2 = v[(i + 1) % N]; brake[i] = a2 > b2 + 0.01 ? (a2 * a2 - b2 * b2) / (2 * DS) : 0; if (brake[i] > 0.5 * G) mode[i] = 0; }
  const tm = new Float64Array(N + 1); for (let i = 0; i < N; i++) tm[i + 1] = tm[i] + DS / Math.max(1, (v[i] + v[(i + 1) % N]) / 2);
  let top = 0, low = 999, latPk = 0, brPk = 0; for (let i = 0; i < N; i++) { top = Math.max(top, v[i]); low = Math.min(low, v[i]); latPk = Math.max(latPk, v[i] * v[i] * Math.abs(pts[i].kap) / G); brPk = Math.max(brPk, brake[i] / G); }
  prof = { v, mode, brake, tm, lap: tm[N], top, low, latPk, brPk, loss };
}
// ---------------- state ----------------
let sPos = 0, vNow = 40, now = 0, last = 0, frame = 0, visible = false, touring = true, tourClock = 0, tourStep = -1, actions = [], lastShot = "", lastEvent = "", lastEventAt = -10;
let discT = 450, discWear = 0, discGone = false, tyreT = 95, wingGone = false, wingArmed = false, lapCount = 0, lapStart = 0, lastLap = 0;
let bulletUntil = -1, crash = null, flying = [], parts = [], air = [], scroll = 0, yawNow = 0, steer = 0, pitch = 0, latG = 0, lonG = 0, df = 0, dfF = 0, dfR = 0, drag = 0, modeNow = 0;
const event = (tx) => { lastEvent = tx; lastEventAt = now; };
function reset() { sPos = 0; vNow = prof.v[0]; discT = 450; discWear = 0; discGone = false; tyreT = 95; wingGone = false; wingArmed = false; crash = null; flying = []; parts = []; lapCount = 0; lapStart = now; lastEvent = ""; }
const idx = (s) => ((Math.floor(s / DS) % N) + N) % N;
const CX = -1.2; // where the car sits on the plate
function physics(dt) {
  if (crash) return crashStep(dt);
  const i = idx(sPos), j = (i + 1) % N, f = (sPos / DS) % 1;
  let v = prof.v[i] + (prof.v[j] - prof.v[i]) * f;
  const brk = prof.brake[i];
  // what goes wrong
  if (wingArmed && v > 80) { wingArmed = false; wingGone = true; launchWing(v); event("The rear wing's let go at " + Math.round(v * 3.6) + " km/h. Half the rear downforce just left the building, and there's a braking zone coming."); }
  if (wingGone && brk > 1.5 * G) return startCrash("spin", v);
  if (discGone && brk > 1.5 * G) return startCrash("straight", v);
  const old = vNow; vNow = v;
  lonG = dt > 0 ? clamp((v - old) / dt / G, -6, 3) : 0;
  sPos += v * dt; if (sPos >= LAP) { sPos -= LAP; lapCount++; lastLap = now - lapStart; lapStart = now; }
  const p = pts[i]; latG = v * v * p.kap / G; steer = clamp(Math.atan(3.4 * p.kap) * 1.8, -0.35, 0.35);
  modeNow = prof.mode[i];
  const a = aero(modeNow === 1), q2 = 0.5 * RHO * v * v, loss = p.kap ? prof.loss * 0.7 : 0;
  dfF = q2 * a.cla * 0.42 * (1 - loss * 1.6) / G; dfR = q2 * a.cla * 0.58 * (wingGone ? 0.35 : 1) / G; df = dfF + dfR; drag = q2 * a.cda / 1000;
  pitch = clamp(-lonG * 0.006 - df / 2400 * 0.01, -0.04, 0.03);
  // brakes: the front discs take a bit over half the braking that the MGU-K doesn't harvest
  const Pb = brk > 0 ? Math.max(0, (MASS * brk - 0.5 * RHO * a.cda * v * v) * v - 350e3) : 0;
  const heat = Pb * 0.56 / 2, cool = (0.12 + 0.016 * v) * (ducts ? 1 : 0.12);
  discT += (heat / 300 - cool * (discT - 120)) * dt;
  if (discT > 1100) discWear += (discT - 1100) / 100 * dt * 0.5;
  if (!discGone && discWear > 1) { discGone = true; event("The front-left disc has cooked past 1,100 °C for too long and oxidised away. The next big stop is going to be a problem."); }
  // front tyres: heat from cornering load and sliding (worse in dirty air), cooling with speed
  const target = 82 + 7 * Math.abs(latG) * (1 + prof.loss * 4.5);
  tyreT += (target - tyreT) * dt / 5;
  // carbon dust and sparks from the plank
  if (brk > 3 * G && rnd() < 0.5) spawnDust();
  if (v > 75 && rnd() < 0.08 * (df / 1500)) spawnSpark();
}
function startCrash(kind, v) {
  const runoff = kind === "spin" ? 200 : 170, a = kind === "spin" ? 1.6 * G : 2.2 * G;
  const vi = Math.sqrt(Math.max(0, v * v - 2 * a * runoff));
  const gpk = vi * vi / (2 * G * 2.1);
  crash = { kind, t: 0, v0: v, vi, gpk, x: 0, y: 0, yaw: 0, vx: kind === "spin" ? 6.5 : 7.5, hit: false, wallRise: 0, done: false, noHit: vi < 8 };
  event(kind === "spin" ? "No rear wing, so the moment the brakes bite the rear goes light and it swaps ends at " + Math.round(v * 3.6) + " km/h." : "Brake pedal to the floor at " + Math.round(v * 3.6) + " km/h and nothing much happens. Straight on.");
}
function crashStep(dt) {
  const c = crash; c.t += dt; vNow = c.hit ? 0 : Math.max(c.vi, c.v0 - (c.v0 - c.vi) * c.t / 1.6);
  c.wallRise = Math.min(1, c.wallRise + dt * 2.5);
  if (!c.hit) {
    c.x += c.vx * dt; c.vx = c.noHit ? Math.max(0, c.vx - dt * 7.5 * 7.5 / 6) : Math.max(2.5, c.vx - dt * 2.2);
    if (c.noHit && c.vx === 0) { c.hit = true; c.hitAt = c.t; event("Beached in the gravel trap, short of the wall. Lucky: it was a slow corner."); return; }
    if (c.kind === "spin") { c.yaw += dt * (2.2 + c.t * 1.2); c.y += dt * 0.9; if (rnd() < 0.9) spawnSmoke(); }
    else if (rnd() < 0.5) spawnSmoke(0.4);
    if (c.noHit && rnd() < 0.6) spawnGravel();
    if (rnd() < 0.5) spawnSpark();
    // the leading point of the car against the tyre wall
    const ca = Math.cos(c.yaw), sa = Math.sin(c.yaw);
    let lead = -9; for (const [lx, ly] of [[2.9, 0.95], [2.9, -0.95], [-2.7, 0.55], [-2.7, -0.55]]) lead = Math.max(lead, CX + c.x + lx * ca - ly * sa);
    if (lead >= WALL - 0.1) { c.hit = true; c.hitAt = c.t; for (let n = 0; n < 70; n++) spawnDebris(lead); for (let n = 0; n < 12; n++) spawnSmoke(0.6, lead); const sev = c.gpk > 50 ? "a big one" : "a hard one"; event("Into the tyres at about " + Math.round(c.vi * 3.6) + " km/h: " + sev + ", around " + Math.round(c.gpk) + " g. The survival cell and the halo did their job (Grosjean walked away from 67 g at 192 km/h in 2020)."); }
  } else if (c.t - c.hitAt > 6 && !touring) { reset(); }
}
const WALL = 5.6;
// ---------------- particles ----------------
function launchWing(v) { flying.push({ p: [CX - 2.4, 0, 0.9], v: [-2.6, 0.9, 4.2], rot: 0, w: 3.5, life: 0 }); bulletUntil = now + 1.2; for (let n = 0; n < 25; n++) parts.push({ k: "deb", p: [CX - 2.4, (rnd() - 0.5) * 1, 0.9], v: [-5 - rnd() * 6, (rnd() - 0.5) * 4, rnd() * 4], life: 0, max: 2, s: 0.8 + rnd(), c: rnd() < 0.5 ? "#1b1d22" : "#e5e7ea" }); }
function spawnGravel() { const c = crash; parts.push({ k: "deb", p: [CX + c.x + 1.7, c.y + (rnd() - 0.5) * 1.8, 0.05], v: [-1 - rnd() * 2, (rnd() - 0.5) * 3, 1 + rnd() * 2], life: 0, max: 1.2, s: 0.6 + rnd() * 0.6, c: "#b9a27a" }); }
function spawnDust() { for (const yy of [-0.62, 0.62]) parts.push({ k: "dust", p: [CX + 1.7, yy, 0.3], v: [-6 - rnd() * 4, (rnd() - 0.5) * 0.6, 0.3 + rnd() * 0.4], r: 0.08, life: 0, max: 0.5 + rnd() * 0.4 }); }
function spawnSpark() { const c = crash; const cx = CX + (c ? c.x : 0), cy = c ? c.y : 0; parts.push({ k: "spark", p: [cx - 0.5 + rnd() * 1.5, cy + (rnd() - 0.5) * 0.6, 0.03], v: [-9 - rnd() * 6, (rnd() - 0.5) * 2, 0.5 + rnd() * 1.5], life: 0, max: 0.25 + rnd() * 0.25 }); }
function spawnSmoke(a = 1, at) { const c = crash; const cx = at ?? CX + (c ? c.x : 0) - 1.6, cy = c ? c.y : 0; parts.push({ k: "smoke", p: [cx + (rnd() - 0.5), cy + (rnd() - 0.5) * 1.2, 0.2], v: [-0.6 + rnd() * 0.4, (rnd() - 0.5) * 0.6, 0.3 + rnd() * 0.4], r: 0.3, life: 0, max: 2.5 + rnd() * 2, a }); }
function spawnDebris(x) { const c = crash; parts.push({ k: "deb", p: [x - 0.2, c.y + (rnd() - 0.5) * 1.6, 0.2 + rnd() * 0.6], v: [-1 - rnd() * 5, (rnd() - 0.5) * 7, 1 + rnd() * 5], life: 0, max: 3 + rnd() * 2, s: 0.8 + rnd() * 1.6, c: ["#1b1d22", "#20406e", "#f2c230", "#2a2c30", "#e5e7ea"][Math.floor(rnd() * 5)] }); }

// ---------------- the car model (local: x forward, y left, z up) ----------------
const LIV = "#1f4e8c", LIV2 = "#f2c230", CARB = "#1b1d22", RIM = "#2b2e33";
function carParts() {
  const objs = [];
  const add = (parts, key, xf) => objs.push({ parts: Array.isArray(parts) ? parts : [parts], key, xf });
  const a = aero(modeNow === 1);
  const fa = modeNow === 1 ? 0.12 : 0.42, ra = modeNow === 1 ? 0.08 : 0.62; // flap angles
  const c = crash, hitFront = c && c.hit && c.kind === "straight", hitRear = c && c.hit && c.kind === "spin";
  // floor and plank
  add(prism([[1.25, -0.3], [1.25, 0.3], [0.8, 0.88], [-1.3, 0.88], [-1.95, 0.55], [-2.3, 0.5], [-2.3, -0.5], [-1.95, -0.55], [-1.3, -0.88], [0.8, -0.88]], "z", 0.04, 0.08, CARB), -1e6);
  // diffuser
  add(prism([[-1.9, 0.08], [-2.35, 0.32], [-2.35, 0.08]], "y", -0.5, 0.5, CARB), -9e5);
  // sidepods
  for (const sg of [-1, 1]) add(prism([[0.55, 0.33], [0.55, 0.8], [-0.35, 0.82], [-1.45, 0.45], [-1.45, 0.33]].map(([x, y]) => [x, y * sg]), "z", 0.08, 0.52, LIV, { cap: "#2a64ab" }), undefined);
  for (const sg of [-1, 1]) add(box(0.53, 0.56, sg > 0 ? 0.4 : -0.74, sg > 0 ? 0.74 : -0.4, 0.28, 0.48, "#0c0d10"), undefined);
  // survival cell and cockpit
  add(prism([[1.25, 0.12], [1.25, 0.55], [0.75, 0.62], [0.2, 0.66], [-0.38, 0.66], [-0.38, 0.12]], "y", -0.33, 0.33, LIV, { cap: "#173d70" }), undefined);
  // engine cover and airbox, with a yellow stripe
  add(prism([[-0.38, 0.12], [-0.38, 0.95], [-0.56, 1.02], [-0.86, 0.95], [-1.9, 0.5], [-2.05, 0.3], [-2.05, 0.12]], "y", -0.27, 0.27, LIV, { cap: "#173d70" }), undefined);
  add(prism([[-0.4, 0.955], [-0.56, 1.025], [-0.86, 0.955], [-1.9, 0.505], [-1.9, 0.52], [-0.86, 0.97], [-0.56, 1.04], [-0.4, 0.97]], "y", -0.06, 0.06, LIV2), undefined);
  add(prism([[-0.36, 0.84], [-0.36, 0.95], [-0.4, 0.95], [-0.4, 0.84]], "y", -0.1, 0.1, "#0c0d10"), undefined);
  // nose
  if (!hitFront) add(prism([[1.25, 0.16], [2.78, 0.16], [2.78, 0.26], [1.25, 0.55]], "y", -0.17, 0.17, LIV, { cap: "#173d70" }), undefined);
  // front wing: main plane, two flaps, endplates
  if (!hitFront) {
    add(prism([[2.4, 0.1], [2.98, 0.08], [2.98, 0.11], [2.42, 0.13]], "y", -0.95, 0.95, CARB), undefined);
    for (const [lx, lz, ch] of [[2.66, 0.14, 0.3], [2.45, 0.2, 0.26]]) { const ca = Math.cos(fa), sa = Math.sin(fa); const r = [[0, 0], [ch, 0], [ch, 0.025], [0, 0.03]].map(([u, w]) => [lx - u * ca + w * sa * 0, lz + u * sa + w]); add(prism(r, "y", -0.93, 0.93, LIV2), undefined); }
    for (const yy of [-0.97, 0.95]) add(prism([[2.3, 0.07], [2.98, 0.07], [2.98, 0.22], [2.4, 0.34]], "y", yy, yy + 0.02, LIV), undefined);
  }
  // rear wing: endplates, main plane, flap; beam wing and pylon
  if (!wingGone) {
    for (const yy of [-0.53, 0.51]) add(prism([[-1.98, 0.42], [-2.66, 0.42], [-2.66, 1.02], [-2.05, 0.98]], "y", yy, yy + 0.02, LIV), undefined);
    add(prism([[-2.22, 0.84], [-2.6, 0.86], [-2.6, 0.89], [-2.24, 0.88]], "y", -0.51, 0.51, CARB), undefined);
    const ca = Math.cos(ra), sa = Math.sin(ra);
    add(prism([[0, 0], [0.24, 0], [0.24, 0.022], [0, 0.03]].map(([u, w]) => [-2.42 - u * ca, 0.92 + u * sa + w]), "y", -0.51, 0.51, LIV2), undefined);
  }
  add(prism([[-2.2, 0.4], [-2.48, 0.42], [-2.48, 0.45], [-2.22, 0.44]], "y", -0.45, 0.45, CARB), undefined);
  add(prism([[-2.05, 0.3], [-2.3, 0.3], [-2.4, 0.86], [-2.3, 0.86]], "y", -0.03, 0.03, CARB), undefined);
  // wheels: tyre, rim (glows with the brake disc on the front), compound stripe
  const glowT = clamp((discT - 650) / 550, 0, 1);
  for (const [wx, wr, ww] of [[1.7, 0.36, 0.3], [-1.7, 0.36, 0.38]]) for (const sg of [-1, 1]) {
    const y0 = sg > 0 ? 0.95 - ww : -0.95, y1 = y0 + ww, front = wx > 0;
    if (hitFront && front && sg > 0) continue;
    const em = front ? ["#ff6a1a", glowT * (sg > 0 ? 1 : 0.85)] : null;
    const tyre = prism(R.circle(wx, wr, wr, 22), "y", y0, y1, "#16171a");
    const rimY = sg > 0 ? y1 + 0.003 : y0 - 0.003;
    const rim = prism(R.circle(wx, wr, wr * 0.62, 18), "y", rimY, rimY + sg * 0.002, RIM, { flat: true, emit: em || undefined });
    const stripe = prism(R.circle(wx, wr, wr * 0.8, 22), "y", rimY - sg * 0.001, rimY - sg * 0.0005, "#e8c22a", { flat: true });
    const xf = front ? (p) => { const dx = p[0] - wx, dy = p[1]; const cs = Math.cos(steer), sn = Math.sin(steer); return Wc([wx + dx * cs - dy * sn * 0.2, dy + dx * sn, p[2]]); } : Wc;
    add([tyre, stripe, rim], kOf([wx, sg * 0.8, wr]) + (sg > 0 ? 40 : -40), xf);
  }
  return objs;
}
const kOf = (p) => depthOf(Wc(p), PR);
// local to plate, with the crash slide, yaw and a little pitch
function Wc(p) { const c = crash; const yaw = c ? c.yaw : 0, ox = CX + (c ? c.x : 0), oy = c ? c.y : 0; const z = p[2] + p[0] * pitch; const cs = Math.cos(yaw), sn = Math.sin(yaw); return [ox + p[0] * cs - p[1] * sn, oy + p[1] * cs + p[0] * sn, z]; }
function draw(dt) {
  const objs = carParts().map((o) => ({ ...o, xf: o.xf || Wc, key: o.key ?? (() => { const pa = o.parts[0], r = pa.ring; const cu = r.reduce((s, q2) => s + q2[0], 0) / r.length, cv2 = r.reduce((s, q2) => s + q2[1], 0) / r.length; const pp = pa.axis === "z" ? [cu, cv2, (pa.w0 + pa.w1) / 2] : pa.axis === "y" ? [cu, (pa.w0 + pa.w1) / 2, cv2] : [(pa.w0 + pa.w1) / 2, cu, cv2]; return kOf(pp); })() }));
  // driver's helmet, the halo and the suspension, as lines
  let dv = "";
  const H2 = iso(Wc([-0.12, 0, 0.8]), PR);
  dv += '<circle cx="' + fx1(H2[0]) + '" cy="' + fx1(H2[1]) + '" r="' + fx1(0.13 * PX) + '" fill="#f2c230" stroke="#3a2d08" stroke-width=".6"/>';
  const V = iso(Wc([-0.04, 0.02, 0.83]), PR); dv += '<path d="M' + fx1(V[0] - 0.09 * PX) + " " + fx1(V[1]) + "l" + fx1(0.16 * PX) + " " + fx1(0.05 * PX) + '" stroke="#111" stroke-width="' + fx1(0.05 * PX) + '" stroke-linecap="round"/>';
  objs.push({ svg: dv, key: kOf([-0.12, 0, 0.75]) });
  let halo = "M" + sp(Wc([0.42, 0, 0.66])) + "L" + sp(Wc([0.3, 0, 0.88]));
  for (let i = 0; i <= 12; i++) { const a = -Math.PI / 2 + Math.PI * i / 12; halo += "L" + sp(Wc([0.3 - 0.0 - 0.45 * Math.sin(Math.PI * i / 12) * 1, 0.27 * -Math.cos(Math.PI * i / 12) * (i < 6 ? 1 : 1), 0.88 - 0.0 * i])); }
  halo = "M" + sp(Wc([0.42, 0, 0.66])) + "L" + sp(Wc([0.28, 0, 0.88]));
  let ring = ""; for (let i = 0; i <= 16; i++) { const t = Math.PI * i / 16; ring += (i ? "L" : "M") + sp(Wc([0.28 - 0.5 * Math.sin(t), 0.28 * Math.cos(t), 0.88 - 0.05 * Math.sin(t)])); }
  const legs = "M" + sp(Wc([-0.2, 0.28, 0.88])) + "L" + sp(Wc([-0.28, 0.3, 0.66])) + "M" + sp(Wc([-0.2, -0.28, 0.88])) + "L" + sp(Wc([-0.28, -0.3, 0.66]));
  objs.push({ svg: '<path d="' + halo + ring + legs + '" stroke="#2a2c31" stroke-width="' + fx1(0.05 * PX) + '" fill="none" stroke-linecap="round" stroke-linejoin="round"/>', key: kOf([-0.1, 0, 0.88]) + 2 });
  let sus = "";
  for (const [wx, sg] of [[1.7, 1], [1.7, -1], [-1.7, 1], [-1.7, -1]]) { const ox = wx > 0 ? 1.1 : -1.4; sus += "M" + sp(Wc([ox, sg * 0.3, 0.45])) + "L" + sp(Wc([wx, sg * 0.62, 0.42])) + "M" + sp(Wc([ox, sg * 0.3, 0.2])) + "L" + sp(Wc([wx, sg * 0.62, 0.22])); }
  objs.push({ svg: '<path d="' + sus + '" stroke="#26282d" stroke-width="' + fx1(0.025 * PX) + '" fill="none"/>', key: kOf([0, 0.2, 0.3]) - 30 });
  // downforce and drag arrows
  if (!crash) {
    const arr = (x, kg, cls) => { const l = clamp(kg / 900, 0, 1.6); if (l < 0.05) return ""; const a0 = Wc([x, 0, 1.25 + l]), a1 = Wc([x, 0, 1.12]); const P0 = iso(a0, PR), P1 = iso(a1, PR); return '<path class="' + cls + '" d="M' + fx1(P0[0]) + " " + fx1(P0[1]) + "L" + fx1(P1[0]) + " " + fx1(P1[1]) + "M" + fx1(P1[0] - 4) + " " + fx1(P1[1] - 6) + "L" + fx1(P1[0]) + " " + fx1(P1[1]) + "L" + fx1(P1[0] + 4) + " " + fx1(P1[1] - 6) + '"/><text class="arrtx" x="' + fx1(P0[0] + 5) + '" y="' + fx1(P0[1] + 3) + '">' + Math.round(kg) + " kg</text>"; };
    objs.push({ svg: arr(1.7, dfF, "arrF") + arr(-1.8, dfR, "arrR"), key: 1e9 });
  }
  // the rear wing flying off
  for (const fl of flying) {
    const ca = Math.cos(fl.rot), sa = Math.sin(fl.rot);
    const xf = (p) => { const dx = p[0] + 2.4, dz = p[2] - 0.9; return [fl.p[0] + dx * ca - dz * sa, fl.p[1] + p[1], fl.p[2] + dx * sa + dz * ca]; };
    objs.push({ parts: [prism([[-2.22, 0.84], [-2.6, 0.86], [-2.6, 0.89], [-2.24, 0.88]], "y", -0.51, 0.51, CARB), prism([[-2.42, 0.92], [-2.66, 0.94], [-2.66, 0.96], [-2.42, 0.95]], "y", -0.51, 0.51, LIV2), prism([[-1.98, 0.6], [-2.66, 0.6], [-2.66, 1.02], [-2.05, 0.98]], "y", 0.51, 0.53, LIV), prism([[-1.98, 0.6], [-2.66, 0.6], [-2.66, 1.02], [-2.05, 0.98]], "y", -0.53, -0.51, LIV)], xf, key: depthOf(fl.p, PR) });
  }
  let html = "";
  // kerbs on the corners, and the track lines scrolling under the car
  const i0 = idx(sPos), kap = pts[i0].kap;
  scroll = (scroll + (crash ? 0 : vNow * dt * 0.16)) % 2.4;
  let dash = "";
  for (let x = -6.4 - scroll + 2.4; x < 6.4; x += 2.4) { const a = Math.max(-6.4, x), b = Math.min(6.4, x + 1.0); if (b > a) dash += "M" + sp([a, 0, 0.01]) + "L" + sp([b, 0, 0.01]); }
  html += '<path class="dash" d="' + dash + '"/>';
  if (kap && !crash) { const side = kap > 0 ? 1 : -1; for (let x = -6.4 - (scroll % 0.8); x < 6.4; x += 0.8) { const a = Math.max(-6.4, x), b = Math.min(6.4, x + 0.4); if (b <= a) continue; const yy = side * 2.3; const quad = [[a, yy, 0.012], [b, yy, 0.012], [b, yy + side * 0.32, 0.012], [a, yy + side * 0.32, 0.012]]; html += '<path fill="#d8302c" d="M' + quad.map(sp).join("L") + 'Z"/>'; } }
  // tyre wall rising out of the run-off when it all goes wrong
  if (crash) {
    const h = 0.9 * crash.wallRise, push = crash.hit ? Math.min(0.35, (crash.t - crash.hitAt) * 2) : 0, wall = [];
    for (let yy = -2.4; yy <= 2.41; yy += 0.6) { const near = crash.hit && Math.abs(yy - crash.y) < 1.4; for (let zz = 0; zz < 3; zz++) if ((zz + 1) * 0.3 <= h + 0.01) wall.push({ parts: [prism(R.circle(yy, zz * 0.3 + 0.15, 0.28, 14), "x", WALL + (near ? push : 0), WALL + 0.3 + (near ? push : 0), "#1a1b1e")], key: kOf([0, 0, 0]) * 0 + depthOf([WALL, yy, zz * 0.3], PR) - 5 }); }
    wall.push({ parts: [box(WALL - 0.03 + push * 0.5, WALL, -2.6, 2.6, 0.05, Math.max(0.06, h - 0.05), "#c7272b", { opacity: 0.9 })], key: depthOf([WALL, 0, 0.4], PR) });
    objs.push(...wall);
  }
  html += R.render(objs);
  sceneG.innerHTML = html;
  drawFx(dt);
  drawMap();
  const text = crash ? (crash.hit ? "RED FLAG" : Math.round(vNow * 3.6) + " km/h · OFF") : Math.round(vNow * 3.6) + " km/h · " + (modeNow ? "STRAIGHT MODE" : "CORNER MODE") + " · " + Math.abs(latG).toFixed(1) + " g";
  if (readout.textContent !== text) readout.textContent = text;
}
// air: streaks flowing over the car, pushed up by the wings
function flowAt(p) {
  const v = [-1, 0, 0], x = p[0] - (CX), y = p[1], z = p[2];
  const s = clamp(df / 1500, 0.2, 1.6), fl = modeNow ? 0.4 : 1;
  if (Math.abs(y) < 1 && z < 0.5 && x > 2.2 && x < 3.2) v[2] += 0.35 * s * fl;
  if (Math.abs(y) < 0.5 && z > 0.6 && z < 1.25 && x < -2.2 && x > -3.4) v[2] += 0.55 * s * fl;
  if (Math.abs(y) < 0.5 && z < 0.35 && x < -1.9 && x > -2.9) v[2] += 0.25 * s;
  if (x < 0.8 && x > -2.3 && Math.abs(y) < 0.9 && z < 1.05) v[2] += 0.18 * (x > -0.4 ? 1 : -0.6);
  for (const sg of [-1, 1]) { const dy = y - sg * 0.52, dz = z - 0.98; const r2 = dy * dy + dz * dz; if (x < -2.4 && r2 < 0.12) { v[1] += -dz * 1.6 * sg * s; v[2] += dy * 1.6 * sg * s; } }
  return v;
}
function drawFx(dt) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const r2 = svgEl.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1), cw = Math.max(1, Math.round(r2.width * dpr)), ch = Math.max(1, Math.round(r2.height * dpr)); if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
  ctx.clearRect(0, 0, cv.width, cv.height); ctx.setTransform(cv.width / D.W, 0, 0, cv.height / D.H, 0, 0);
  const light = document.body.dataset.theme === "light";
  // the air
  const U = crash ? 0 : 3 + vNow * 0.09, dirty = follow > 0;
  const fill = air.length === 0; if (U > 0) while (air.length < 110) air.push({ p: [6.4 - rnd() * (fill ? 12.8 : 0.4), (rnd() - 0.5) * 2.6, 0.06 + rnd() * 1.3], tr: [] });
  ctx.lineCap = "round";
  air = air.filter((a) => {
    if (!U) return false;
    const f = flowAt(a.p), jit = dirty ? (follow === 2 ? 1.6 : 0.8) : 0;
    a.p[0] += f[0] * U * dt; a.p[1] += (f[1] * U + (rnd() - 0.5) * jit * 3) * dt; a.p[2] = Math.max(0.03, a.p[2] + (f[2] * U + (rnd() - 0.5) * jit * 2) * dt);
    a.tr.push(iso(a.p, PR)); if (a.tr.length > 7) a.tr.shift();
    if (a.p[0] < -6.4) return false;
    ctx.strokeStyle = dirty ? (light ? "rgba(214,110,40,.5)" : "rgba(255,160,90,.45)") : light ? "rgba(40,110,190,.45)" : "rgba(150,205,255,.42)"; ctx.lineWidth = 1;
    ctx.beginPath(); a.tr.forEach((q2, i) => (i ? ctx.lineTo(q2[0], q2[1]) : ctx.moveTo(q2[0], q2[1]))); ctx.stroke();
    return true;
  });
  // brake glow round the front wheels
  if (discT > 600 && !(crash && crash.hit && crash.kind === "straight")) for (const sg of [1, -1]) { const P2 = iso(Wc([1.7, sg * 0.75, 0.36]), PR), g = clamp((discT - 600) / 600, 0, 1), r = 0.45 * PX * (0.6 + g * 0.6); const gr = ctx.createRadialGradient(P2[0], P2[1], 0, P2[0], P2[1], r); gr.addColorStop(0, "rgba(255,150,60," + (0.55 * g * (sg > 0 ? 1 : 0.4)) + ")"); gr.addColorStop(1, "rgba(255,90,20,0)"); ctx.fillStyle = gr; ctx.fillRect(P2[0] - r, P2[1] - r, r * 2, r * 2); }
  // particles
  for (const fl of flying) { fl.life += dt; fl.v[2] -= 9.8 * dt * 0.35; for (let i = 0; i < 3; i++) fl.p[i] += fl.v[i] * dt; fl.rot += fl.w * dt; }
  flying = flying.filter((fl) => fl.p[0] > -9 && fl.life < 4 && fl.p[2] > -0.5);
  parts = parts.filter((p) => {
    p.life += dt; if (p.life > p.max) return false;
    if (p.k === "smoke" || p.k === "dust") { p.r += dt * (p.k === "dust" ? 0.5 : 0.7); for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * dt; const P2 = iso(p.p, PR), a = (p.k === "dust" ? 0.35 : 0.3 * (p.a || 1)) * (1 - p.life / p.max), R2 = p.r * PX; const gr = ctx.createRadialGradient(P2[0], P2[1], 0, P2[0], P2[1], R2); const col = p.k === "dust" ? "40,36,34" : light ? "150,150,150" : "215,215,215"; gr.addColorStop(0, "rgba(" + col + "," + a + ")"); gr.addColorStop(1, "rgba(" + col + ",0)"); ctx.fillStyle = gr; ctx.fillRect(P2[0] - R2, P2[1] - R2, R2 * 2, R2 * 2); return true; }
    p.v[2] -= 9.8 * dt; const o = iso(p.p, PR); for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * dt; if (p.p[2] < 0.01) { p.p[2] = 0.01; p.v = [p.v[0] * 0.5, p.v[1] * 0.5, -p.v[2] * 0.3]; }
    const P2 = iso(p.p, PR);
    if (p.k === "spark") { ctx.strokeStyle = "rgba(255," + Math.round(200 - 120 * p.life / p.max) + ",80," + (1 - p.life / p.max) + ")"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(P2[0], P2[1]); ctx.stroke(); return true; }
    ctx.fillStyle = p.c; ctx.fillRect(P2[0] - p.s, P2[1] - p.s * 0.6, p.s * 2, p.s * 1.2); return true;
  });
}
// inset: track map coloured by speed, with the car on it, and the lap's speed trace
function drawMap() {
  const r = mcv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1), w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr)); if (mcv.width !== w || mcv.height !== h) { mcv.width = w; mcv.height = h; }
  const light = document.body.dataset.theme === "light";
  mctx.setTransform(1, 0, 0, 1, 0, 0); mctx.fillStyle = light ? "#eef2f6" : "#0f1418"; mctx.fillRect(0, 0, w, h);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const p of pts) { x0 = Math.min(x0, p.mx); x1 = Math.max(x1, p.mx); y0 = Math.min(y0, p.my); y1 = Math.max(y1, p.my); }
  const box2 = h - 10 * dpr, sc = Math.min(box2 / (x1 - x0), box2 / (y1 - y0)), ox = 5 * dpr + (box2 - (x1 - x0) * sc) / 2, oy = 5 * dpr + (box2 - (y1 - y0) * sc) / 2;
  const M = (p) => [ox + (p.mx - x0) * sc, oy + (y1 - p.my) * sc];
  mctx.lineWidth = 2.6 * dpr; mctx.lineCap = "round";
  for (let i = 0; i < N; i += 3) { const a = M(pts[i]), b = M(pts[(i + 3) % N]); const t = clamp((prof.v[i] - 18) / 75, 0, 1); mctx.strokeStyle = "hsl(" + Math.round(10 + 190 * t) + ",75%," + (light ? 45 : 58) + "%)"; mctx.beginPath(); mctx.moveTo(a[0], a[1]); mctx.lineTo(b[0], b[1]); mctx.stroke(); }
  const c = M(pts[idx(sPos)]); mctx.fillStyle = light ? "#111" : "#fff"; mctx.beginPath(); mctx.arc(c[0], c[1], 3.5 * dpr, 0, 7); mctx.fill();
  // speed trace
  const gx = h + 4 * dpr, gw = w - gx - 6 * dpr, gy = 14 * dpr, gh = h - gy - 6 * dpr;
  mctx.font = Math.round(9 * dpr) + "px ui-monospace,monospace"; mctx.fillStyle = light ? "#3a4048" : "#aab3bc"; mctx.fillText("speed round the lap", gx, 10 * dpr);
  mctx.strokeStyle = light ? "#2a6db0" : "#8cc8ff"; mctx.lineWidth = 1.4 * dpr; mctx.beginPath();
  for (let i = 0; i < N; i += 4) { const X = gx + gw * i / N, Y = gy + gh * (1 - prof.v[i] / 100); i ? mctx.lineTo(X, Y) : mctx.moveTo(X, Y); } mctx.stroke();
  mctx.strokeStyle = light ? "#111" : "#fff"; mctx.lineWidth = 1 * dpr; const cx2 = gx + gw * idx(sPos) / N; mctx.beginPath(); mctx.moveTo(cx2, gy); mctx.lineTo(cx2, gy + gh); mctx.stroke();
}

// ---------------- UI ----------------
const ui = {
  wing: document.querySelector("#wing"), wingOut: document.querySelector("#wing-out"), aero: document.querySelector("#aero"), fol: [...document.querySelectorAll("[data-follow]")], ducts: document.querySelector("#ducts"), snap: document.querySelector("#snap"), reset: document.querySelector("#reset"),
  slow: document.querySelector("#slow"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"), stats: document.querySelector("#stats"),
  sF: document.querySelector("#s-fill"), sO: document.querySelector("#s-out"), dF: document.querySelector("#d-fill"), dO: document.querySelector("#d-out"), bF: document.querySelector("#b-fill"), bO: document.querySelector("#b-out"), tF: document.querySelector("#t-fill"), tO: document.querySelector("#t-out"),
};
const say = (tx) => { if (tx !== lastShot) { ui.shot.textContent = tx; lastShot = tx; } };
const lapStr = (t) => Math.floor(t / 60) + ":" + (t % 60).toFixed(1).padStart(4, "0");
function syncUi() {
  if (document.activeElement !== ui.wing) ui.wing.value = String(Math.round(wing * 100));
  ui.wingOut.textContent = wing < 0.25 ? "Monza (low)" : wing > 0.75 ? "Monaco (high)" : "Medium";
  ui.aero.setAttribute("aria-pressed", String(aeroAuto)); ui.aero.firstChild.textContent = aeroAuto ? "Active aero on" : "Stuck in Corner Mode";
  ui.fol.forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.follow === follow)));
  ui.ducts.setAttribute("aria-pressed", String(!ducts)); ui.ducts.firstChild.textContent = ducts ? "Brake ducts open" : "Brake ducts taped";
  ui.snap.disabled = wingGone || !!crash; ui.snap.firstChild.textContent = wingArmed ? "Rear wing: waiting for 290 km/h" : wingGone ? "Rear wing: gone" : "Snap the rear wing";
  const kmh = vNow * 3.6; ui.sF.style.width = clamp(kmh / 360 * 100, 0, 100).toFixed(1) + "%"; ui.sF.dataset.state = "ok"; ui.sO.textContent = Math.round(kmh) + " km/h";
  ui.dF.style.width = clamp(df / 2200 * 100, 0, 100).toFixed(1) + "%"; ui.dF.dataset.state = df > 768 ? "lit" : "ok"; ui.dO.textContent = Math.round(df).toLocaleString("en-AU") + " kg";
  ui.bF.style.width = clamp(discT / 1300 * 100, 0, 100).toFixed(1) + "%"; ui.bF.dataset.state = discT > 1100 ? "bad" : discT > 950 ? "warn" : "ok"; ui.bO.textContent = discGone ? "gone" : Math.round(discT) + " °C";
  ui.tF.style.width = clamp((tyreT - 50) / 100 * 100, 0, 100).toFixed(1) + "%"; ui.tF.dataset.state = tyreT > 120 ? "bad" : tyreT > 110 ? "warn" : "ok"; ui.tO.textContent = Math.round(tyreT) + " °C";
  const v250 = 250 / 3.6, dfk = 0.5 * RHO * aero(false).cla * v250 * v250 / G;
  ui.stats.innerHTML = "Lap <b>" + lapStr(prof.lap) + "</b> · top <b>" + Math.round(prof.top * 3.6) + " km/h</b> · slowest " + Math.round(prof.low * 3.6) + " km/h · " + prof.latPk.toFixed(1) + " g cornering, " + prof.brPk.toFixed(1) + " g braking · " + Math.round(dfk).toLocaleString("en-AU") + " kg downforce at 250 km/h";
  ui.slow.setAttribute("aria-pressed", String(slow)); ui.tour.setAttribute("aria-pressed", String(touring));
}
function story() {
  if (now - lastEventAt < 7 && lastEvent) return say(lastEvent);
  if (touring && tourStep >= 0 && TOUR[tourStep].say) return say(TOUR[tourStep].say);
  const kmh = vNow * 3.6, seg = TRACK[pts[idx(sPos)].seg], nm = seg[seg.length - 1];
  if (crash) return say("Red flag. Press Reset.");
  if (prof.brake[idx(sPos)] > 2 * G) return say("Braking: " + (prof.brake[idx(sPos)] / G).toFixed(1) + " g. The flaps snap shut into Corner Mode for the grip, the MGU-K harvests up to 350 kW, and the carbon discs take the rest and glow.");
  if (modeNow) return say("Straight Mode: front and rear flaps flatten out to dump drag" + (follow ? ", and being within a second of the car ahead gives Overtake Mode: the MGU-K keeps pushing to 337 km/h." : ". The MGU-K's 350 kW tapers off from about 290 km/h."));
  if (follow && pts[idx(sPos)].kap) return say("Dirty air: the wake of the car ahead robs the front wing, so the front washes wide and the front tyres slide and cook.");
  if (typeof nm === "string" && pts[idx(sPos)].kap) return say(nm + ": " + Math.round(kmh) + " km/h, " + Math.abs(latG).toFixed(1) + " g sideways. " + (df > 768 ? "It's making more downforce than it weighs." : "Slow enough that most grip here is mechanical, not aero."));
  return say("Downforce grows with speed squared: at 250 km/h this car is pushed into the track with about twice its own weight. It costs drag, which is why the wings open up on the straights.");
}
const TOUR = [
  { say: "A lap in clean air, medium wing. Watch the flaps flatten on the straights (Straight Mode) and snap shut for the corners.", acts: [[0, () => { set({ wing: 0.5, aeroAuto: true, follow: 0, ducts: true }); }], [22, null]] },
  { say: "Active aero switched off: stuck in Corner Mode. Same grip in the corners, but all that drag on the straights costs top speed and lap time.", acts: [[0, () => set({ aeroAuto: false })], [16, null]] },
  { say: "Now 0.4 s behind another car. The front wing is eating dirty air: less front grip, slower corners, cooking front tyres. Overtake Mode gives a bit back on the straights.", acts: [[0, () => set({ aeroAuto: true, follow: 2 })], [20, null]] },
  { say: "Clean air again, but someone's taped over the brake ducts. Watch the front discs.", acts: [[0, () => set({ follow: 0, ducts: false })], [32, null]] },
  { say: "Fixed the ducts. Now let's see what happens when the rear wing lets go at the end of the main straight.", acts: [[0, () => { set({ ducts: true }); }], [6, () => { wingArmed = true; }], [26, null]] },
];
function set(o) { if ("wing" in o) wing = o.wing; if ("aeroAuto" in o) aeroAuto = o.aeroAuto; if ("follow" in o) follow = o.follow; if ("ducts" in o) ducts = o.ducts; simulate(); if (crash || discGone || wingGone) { const s0 = sPos; reset(); sPos = s0 * 0; } }
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
  const map = { a: () => set({ aeroAuto: !aeroAuto }), d: () => set({ ducts: !ducts }), w: () => { if (!wingGone && !crash) wingArmed = true; }, f: () => set({ follow: (follow + 1) % 3 }), r: () => reset(), ArrowUp: () => set({ wing: clamp(wing + 0.1, 0, 1) }), ArrowDown: () => set({ wing: clamp(wing - 0.1, 0, 1) }) };
  if (map[ev.key]) { ev.preventDefault(); act(map[ev.key])(); }
});
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;
window.__fig = { freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
simulate(); reset(); draw(0); syncUi(); story();
`;

const CSS = `.fx-stage{position:relative;overflow:hidden}
.fx-stage svg{display:block;position:relative}
.fx-smoke{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.m-wrap{position:absolute;right:2.5%;top:3%;width:40%;aspect-ratio:2.4/1;border:1px solid var(--anatomy-lo);border-radius:6px;overflow:hidden;pointer-events:none}
.m-cv{width:100%;height:100%;display:block}
.tarmac{fill:#2a2c30}.edge{fill:none;stroke:#e8e8e8;stroke-width:1.6}.dash{fill:none;stroke:#e8e8e8;stroke-width:1.2;opacity:.55}
body[data-theme="light"] .tarmac{fill:#5a5d63}
.arrF,.arrR{fill:none;stroke:#3ddc84;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.arrtx{font:600 10px var(--anatomy-mono);fill:#3ddc84}
body[data-theme="light"] .arrF,body[data-theme="light"] .arrR{stroke:#13985a}body[data-theme="light"] .arrtx{fill:#13985a}
.fx-stage path{stroke-linejoin:round}
.ctl{display:grid;gap:12px;margin:14px 0 6px;font-family:var(--anatomy-mono);font-size:12px;color:var(--anatomy-mid)}
.ctl-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ctl-label{min-width:72px;text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:var(--anatomy-lo)}
.ctl button{font:inherit;color:var(--anatomy-mid);background:transparent;border:1px solid var(--anatomy-lo);border-radius:6px;padding:7px 10px;cursor:pointer;line-height:1.15;text-align:left;min-height:36px}
.ctl button:disabled{opacity:.5;cursor:default}
.ctl button:hover{border-color:var(--anatomy-mid)}
.ctl button[aria-pressed="true"]{color:var(--anatomy-lit);border-color:var(--anatomy-lit)}
.ctl #snap{color:#ff6a3d;border-color:#ff6a3d}
.ctl button small{display:block;font-size:10px;color:var(--anatomy-lo)}
.ctl output{min-width:110px;text-align:right;color:var(--anatomy-hi,var(--anatomy-mid))}
.slide{position:relative;flex:1;min-width:120px}.slide input{width:100%;accent-color:var(--anatomy-lit);margin:0}
.meter{position:relative;flex:1;min-width:110px;height:10px;margin-top:14px;border:1px solid var(--anatomy-lo);border-radius:5px}
.meter .fill{position:absolute;left:0;top:0;bottom:0;border-radius:4px;transition:width .1s;background:#3ddc84}
.meter .fill[data-state="warn"]{background:#ffb347}.meter .fill[data-state="bad"]{background:#ff5a2a}.meter .fill[data-state="lit"]{background:#4fb3ff}
.mark{position:absolute;top:-14px;bottom:-3px;width:0;border-left:1px dashed #ff6a3d;pointer-events:none}
.mark::after{content:attr(data-label);position:absolute;top:0;left:4px;font-size:10px;white-space:nowrap;color:#ff6a3d}
#stats{font-size:12px;color:var(--anatomy-mid);line-height:1.5;flex:1}#stats b{color:var(--anatomy-hi,var(--anatomy-mid));font-weight:600}
#shot{min-height:3.6em;font-size:12px;line-height:1.4}
@media (max-width:520px){.ctl-label{min-width:52px}.ctl button{padding:7px 8px}.ctl output{min-width:84px}.ctl button small{display:none}.m-wrap{width:52%}}`;

const stageHtml = `<div class="iso-stage fx-stage" tabindex="0" role="group" aria-label="F1 car: A toggles active aero, F the car ahead, D the brake ducts, W snaps the rear wing, R resets, up and down change the wing level">${svg}<canvas class="fx-smoke" aria-hidden="true"></canvas><div class="m-wrap" aria-hidden="true"><canvas class="m-cv"></canvas></div></div>`;

const CONTROLS = `<div class="ctl" role="group" aria-label="Controls">
  <div class="ctl-row"><span class="ctl-label">Wing</span><div class="slide"><input id="wing" type="range" min="0" max="100" step="5" value="50" aria-label="Wing level, low to high downforce"></div><output id="wing-out">Medium</output></div>
  <div class="ctl-row"><span class="ctl-label">Aero</span><button type="button" id="aero" aria-pressed="true">Active aero on<small>Straight Mode on the straights</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Traffic</span><button type="button" data-follow="0" aria-pressed="true">Clean air</button><button type="button" data-follow="1">1 s behind</button><button type="button" data-follow="2">0.4 s behind<small>dirty air</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Break it</span><button type="button" id="ducts" aria-pressed="false">Brake ducts open<small>D</small></button><button type="button" id="snap">Snap the rear wing<small>W</small></button><button type="button" id="reset">Reset<small>R</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Speed</span><div class="meter"><span id="s-fill" class="fill"></span></div><output id="s-out">0 km/h</output></div>
  <div class="ctl-row"><span class="ctl-label">Downforce</span><div class="meter"><span id="d-fill" class="fill"></span><span class="mark" style="left:${(768 / 2200 * 100).toFixed(1)}%" data-label="its weight"></span></div><output id="d-out">0 kg</output></div>
  <div class="ctl-row"><span class="ctl-label">Brakes</span><div class="meter"><span id="b-fill" class="fill"></span><span class="mark" style="left:${(1000 / 1300 * 100).toFixed(1)}%" data-label="1,000 °C"></span></div><output id="b-out">0 °C</output></div>
  <div class="ctl-row"><span class="ctl-label">Tyres</span><div class="meter"><span id="t-fill" class="fill"></span><span class="mark" style="left:70%" data-label="too hot"></span></div><output id="t-out">0 °C</output></div>
  <div class="ctl-row"><span class="ctl-label">Lap</span><span id="stats"></span></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
  <div id="shot" aria-live="polite"></div>
</div>`;

const card = k.plateHtml({
  fig: "Fig 27",
  title: "F1 car",
  hint: "Grip you buy with drag",
  readout: "",
  keys: [
    { mark: "lit", label: "Live: a lap of a made-up circuit, the airflow, downforce on each axle (green), the flaps, brake and tyre heat" },
    { mark: "raised", label: "2026-style car on a strip of track; the track scrolls, the car stays put" },
  ],
  caption: "An F1 car is limited by grip, and in a fast corner most of that grip is downforce: the wings and floor push the car into the track with a force that grows with speed squared. It costs drag, so the 2026 cars flatten their front and rear wing flaps on the straights (Straight Mode) and snap them shut for the corners (Corner Mode); DRS is gone. Stopping from over 300 km/h takes the brakes past 1,000 °C. Following close behind another car robs the front wing of clean air, which is why it's hard to pass.",
  body: stageHtml,
});

const other = theme === "light" ? ["index.html", "Dark version"] : ["light.html", "Light version"];
const FOOT = `<p style="font-family:var(--anatomy-mono);font-size:11px;color:var(--anatomy-lo);margin:28px 0 8px;line-height:1.6">A toy, not a lap-time simulator. Real: downforce and drag growing with speed squared, the 2026 rules (Straight Mode and Corner Mode active aero instead of DRS, about 400 kW of engine and 350 kW of MGU-K that tapers off at high speed, Overtake Mode within a second of the car ahead, a 768 kg minimum weight), carbon brakes running past 1,000 °C, braking at around 5 g, dirty air, the survival cell and halo, and Grosjean's 67 g impact at 192 km/h in Bahrain in 2020 (FIA). Made up: the circuit, the car, its livery, the aero and tyre numbers, the brake and tyre heat models, the failures and the crash.<br>Built with <a href="https://github.com/wheresryan22/anatomy" style="color:inherit">Anatomy</a> by Ryan (MIT). · <a href="${other[0]}" style="color:inherit">${other[1]}</a> · <a href="../" style="color:inherit">More figures</a> · <a href="https://github.com/Dizzyfer/Anatomy/tree/main/f1" style="color:inherit">Source</a></p>`;
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "F1 car", theme, body: `<style>${CSS}</style>${card.replace("<figcaption", CONTROLS + "<figcaption")}${FOOT}`, script: kitScript() + LIVE.replace("__DATA__", JSON.stringify(DATA)), width: 720 }));
console.log("wrote", name);
