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

// Truth: point kinetics with delayed neutrons (prompt critical at one dollar of reactivity), fuel Doppler feedback, the
// void coefficient (positive in an RBMK at low power with the rods out, strongly negative in a PWR), xenon building up
// after a power cut, the RBMK's graphite displacers adding reactivity at the bottom of the core when a fully withdrawn rod
// starts to go in (the positive scram), decay heat after shutdown. Chernobyl 4 timeline from World Nuclear Association.
// Toy: one delayed group, every coefficient, the xenon clock sped up, decay heat and melting sped up, the geometry.
const PLATE = { x: -24, y: -24, w: 48, d: 48, r: 2 };
const PLATE_H = 2, FOOT_H = 1;
const P = k.fitProjection([...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [-22, -22, 46], [22, -22, 46], [-22, 22, 46], [0, 0, 48]], W, H, { pad: 10, azimuth: 45 });
const Sv = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const depth2 = ([x, y]) => k.depthOf([x, y, 0], P);
const byDepth = (pts) => [...pts].sort((a, b) => depth2(a) - depth2(b));
function plate() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 3))) {
    out.push(Sv(k.cylinder(x, y, 0.9, -PLATE_H - FOOT_H, 0.2, P, 24), { tone: "lo" }));
    out.push(Sv(k.cylinder(x, y, 0.7, -PLATE_H - FOOT_H + 0.2, FOOT_H - 0.2, P, 24), { tone: "mid" }));
  }
  out.push(Sv(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 0.2), { tone: "mid", inner: L(k.sideSeam(PLATE, -PLATE_H / 2, P), { tone: "faint" }) }));
  return out.join("");
}
const svg = k.figureSvg({
  width: W, height: H,
  label: "A nuclear power plant reactor cut in half. In one mode it's an RBMK-1000 like Chernobyl 4: a graphite core with fuel and control rod channels, the upper shield, steam drums and pumps in an ordinary building. In the other it's a modern pressurised water reactor: a steel pressure vessel with steam generators inside a concrete containment.",
  body: [plate(), `<g data-part="scene"></g>`, `<g data-part="fly"></g>`],
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
const sceneG = q("scene"), flyG = q("fly");
const sp = (p) => { const a = iso(p, PR); return a[0].toFixed(1) + " " + a[1].toFixed(1); };
const VIEW = R.VIEW, dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const LIGHT = (() => { const v = [0.45, 0.6, 1]; const n = Math.hypot(...v); return v.map((a) => a / n); })();
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const shadeHex = (hex, n, k2 = 1) => "rgb(" + rgb(hex).map((v) => Math.round(clamp(v * (0.45 + 0.65 * Math.max(0, dot(n, LIGHT))) * k2, 0, 255))).join(",") + ")";
function normalOf(pts) { let n = [0, 0, 0]; for (let i = 0; i < pts.length; i++) { const p = pts[i], q2 = pts[(i + 1) % pts.length]; n[0] += (p[1] - q2[1]) * (p[2] + q2[2]); n[1] += (p[2] - q2[2]) * (p[0] + q2[0]); n[2] += (p[0] - q2[0]) * (p[1] + q2[1]); } const l = Math.hypot(...n) || 1; return n.map((v) => v / l); }
const face = (pts, fill, extra = "") => '<path d="M' + pts.map(sp).join("L") + 'Z" fill="' + fill + '"' + extra + "/>";
let seed = 3; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

// a vertical body of revolution cut in half by the plane x + y = 0 (the near half is removed)
const F0 = Math.PI * 0.75, F1 = Math.PI * 1.75;
const at = (cx, cy, r, f, z) => [cx + r * Math.cos(f), cy + r * Math.sin(f), z];
function half(cx, cy, prof, side, col, n = 16, glow) {
  const out = [];
  for (let i = 0; i < prof.length - 1; i++) for (let j = 0; j < n; j++) {
    const a = F0 + ((F1 - F0) * j) / n, b = F0 + ((F1 - F0) * (j + 1)) / n, fm = (a + b) / 2;
    const [z0, r0] = prof[i], [z1, r1] = prof[i + 1];
    const pts = [at(cx, cy, r0, a, z0), at(cx, cy, r1, a, z1), at(cx, cy, r1, b, z1), at(cx, cy, r0, b, z0)];
    let nn = normalOf(pts);
    if (dot(nn, [Math.cos(fm), Math.sin(fm), 0]) * side < 0) nn = nn.map((v) => -v);
    if (Math.abs(nn[0]) + Math.abs(nn[1]) < 0.05 && dot(nn, [0, 0, side]) < 0) nn = nn.map((v) => -v);
    if (dot(nn, VIEW) <= 0) continue;
    const c = pts.reduce((s2, p) => [s2[0] + p[0] / 4, s2[1] + p[1] / 4, s2[2] + p[2] / 4], [0, 0, 0]);
    out.push({ d: dot(c, VIEW), s: face(pts, glow ? glow : shadeHex(col, nn)) });
  }
  return out;
}
// the cut face of a ring between outer and inner profiles, both sides of the axis
function sect(cx, cy, outer, inner, fill, cls = "sec") {
  let s2 = "";
  for (const f of [F0, F1]) s2 += face([...outer.map(([z, r]) => at(cx, cy, r, f, z)), ...inner.slice().reverse().map(([z, r]) => at(cx, cy, r, f, z))], fill, ' class="' + cls + '"');
  return s2;
}
// a solid disk/slab across the whole cut (both halves of the section joined through the axis)
function sectFull(cx, cy, z0, z1, r, fill, cls = "sec") { return face([at(cx, cy, r, F0, z0), at(cx, cy, r, F1, z0), at(cx, cy, r, F1, z1), at(cx, cy, r, F0, z1)], fill, ' class="' + cls + '"'); }
const sectPt = (cx, cy, s, z) => [cx - 0.7071 * s, cy + 0.7071 * s, z];

// ---------------- physics (toy point kinetics, one delayed group, in dollars) ----------------
const BETA = 0.0065, LAM = 1e-3, LD = 0.08;
const TYPES = {
  rbmk: { name: "RBMK-1000", mwt: 3200, W: 12, rho0: 9.28, rate: 0.08, dopp: -0.0018, tf0: 300, mtc: 0, tipMax: 1.1, scramT: 18, voidK: 0.35, voidA: (r) => 1.0 + 3.6 * clamp(1 - r / 0.5, 0, 1) },
  pwr: { name: "PWR", mwt: 3400, W: 10, rho0: 9.75, rate: 0.05, dopp: -0.003, tf0: 300, mtc: -0.03, tipMax: 0, scramT: 2.2, voidK: 0, voidA: () => -20 },
};
let type = "rbmk", T = TYPES.rbmk;
let n = 1, C = 1, rods = 0.5, rodT = 0.5, rodEff = 0.5, flow = 1, Tf = 900, Tc = 320, voidF = 0.3, I = 1, X = 0.395, rho = 0, tip = 0, scramAt = null, scramFrom = 0;
let vgain = 1, safety = true, eccs = true, subcool = 0.1, auto = null, Pset = 1, dead = null, melt = 0, cpress = 1, h2 = 0, fireT = -9, energy = 0, tripped = false, decayT = 0, Tcore = 600;
let now = 0, last = 0, frame = 0, visible = false, touring = true, slow = false, tourClock = 0, tourStep = -1, actions = [], lastShot = "", lastEvent = "", lastEventAt = -10, flashT = -9, shake = 0;
let test = null;
const event = (t) => { lastEvent = t; lastEventAt = now; };
const XSC = 6.33; // xenon in dollars per normalised unit
function equilibrium() {
  n = 1; C = 1; rods = 0.5; rodT = 0.5; rodEff = 0.5; flow = 1; Tf = 900; Tc = 320; voidF = type === "rbmk" ? 0.3 : 0; I = 1; X = 0.395; tip = 0; scramAt = null; auto = null; subcool = 0.05;
  dead = null; melt = 0; cpress = 1; h2 = 0; energy = 0; tripped = false; decayT = 0; Tcore = 600; test = null; safety = true; eccs = true; Pset = 1; vgain = 1;
}
function xenon(dt, p) { const lI = 2.9e-5, lX = 2.1e-5, b = 6e-5, g = 3e-6; I += dt * lI * (p - I); X += dt * (g * p + lI * I - lX * X - b * p * X); }
function reactivity() {
  const Tc2 = Tc;
  return T.rho0 - T.W * rodEff + T.voidA(rods) * voidF + T.dopp * (Tf - T.tf0) + T.mtc * (Tc2 - 305) - X * XSC + tip + (type === "pwr" && voidF > 0 ? 0 : 0);
}
function physics(dt) {
  if (dead && dead.kind === "boom") { n = Math.max(0, n * Math.exp(-dt * 3)); return; }
  // control rods: scram drives them in; the RBMK's graphite displacers add reactivity at the bottom for the first few seconds
  if (scramAt !== null) {
    const t = now - scramAt;
    rods = Math.min(1, scramFrom + t / T.scramT); rodT = rods;
    // in the RBMK the absorbers start in the top of the core where the flux was low, so for the first few seconds they barely bite
    const bite = type === "rbmk" ? (t < 4 ? 0.12 : Math.min(1, 0.12 + (t - 4) / 2)) : 1;
    rodEff = scramFrom + (rods - scramFrom) * bite;
    const out = clamp(1 - scramFrom / 0.4, 0, 1);
    tip = T.tipMax * out * (t < 3 ? Math.sin(Math.PI * t / 6) * 1 : Math.max(0, 1 - (t - 3) / 2));
  } else { tip = 0; if (auto) rodT = clamp(rodT + dt * clamp((n - auto.p) * 2, -0.04, 0.04), 0, 1); rods += clamp(rodT - rods, -T.rate * dt, T.rate * dt); rodEff = rods; }
  // flow, boiling, coolant temperature
  Tc += ((type === "pwr" ? 290 + 30 * n / Math.max(flow, 0.03) : 270 + 14 * n / Math.max(flow, 0.05)) - Tc) * Math.min(1, dt / 1.5);
  let vT;
  if (type === "rbmk") vT = clamp(T.voidK * vgain * n / Math.max(flow, 0.05) - subcool, 0, 0.85);
  else vT = clamp((Tc - 345) / 60, 0, 0.8);
  voidF += (vT - voidF) * Math.min(1, dt / 0.8);
  Tf += (T.tf0 + 600 * n - Tf) * Math.min(1, dt / 2.5);
  // kinetics in 2 ms steps
  const steps = Math.ceil(dt / 0.002), h = dt / steps;
  for (let i = 0; i < steps; i++) {
    rho = reactivity();
    const r = rho * BETA;
    const dn = ((r - BETA) / LAM) * n + (BETA / LAM) * C, dC = LD * (n - C);
    n = Math.max(1e-6, n + h * dn); C = Math.max(0, C + h * dC);
    if (n > 150) n = 150;
  }
  xenon(dt * 150, n);
  // decay heat after shutdown
  if (n < 0.08) decayT += dt; else decayT = 0;
  const decay = n < 0.08 ? 0.066 * Math.pow(Math.max(1, decayT * 600), -0.2) : 0;
  // protection system
  if (safety && !tripped && scramAt === null && (n > 1.12 || (type === "pwr" && flow < 0.6 && n > 0.2))) { scram(true); }
  // excursion: energy into the fuel
  if (n > 3) energy += (n - 3) * dt;
  if (type === "rbmk" && !dead && (energy > 3 || n > 40 || (rho > 1.1 && n > 1.5))) boom();
  if (type === "pwr" && !dead && energy > 6) { dead = { kind: "fuel", t: now }; event("Fuel damage from overpower with the protection switched off. Even so, the negative feedback held the power down; the vessel and containment are intact."); }
  // core heat-up with no cooling (decay heat keeps going after shutdown)
  const cooling = Math.max(flow, eccs && safety ? 0.35 : 0);
  if (cooling < 0.05) Tcore += dt * (n + decay * 14) * 600; else Tcore += ((600 + n * 300 / cooling) - Tcore) * Math.min(1, dt / 3);
  if (Tcore > 2200) melt = Math.min(1, melt + dt * 0.08);
  if (type === "pwr") { cpress += ((1 + melt * 2.6 + (Tcore > 1200 ? (Tcore - 1200) / 1500 : 0)) - cpress) * Math.min(1, dt / 4); h2 = Math.min(1, h2 + (Tcore > 1200 ? dt * 0.05 : 0)); if (h2 > 0.6 && !dead) { dead = { kind: "melt", t: now }; flashT = now; shake = 0.4; event("Meltdown inside the vessel and a hydrogen burn in the containment, like Three Mile Island in 1979. The containment held: the steel and concrete shell is the whole point."); } }
  if (type === "rbmk" && melt > 0.5 && !dead) boom();
  // the 1986 test
  if (test) testStep(dt);
}
function scram(auto2) {
  if (scramAt !== null) return;
  scramAt = now; scramFrom = rods; tripped = true; auto = null;
  if (type === "rbmk") event(auto2 ? "Automatic trip: the rods start in at 0.4 m/s and take 18 s." : "AZ-5 pressed. The rods take 18 s to go in, and the ones that were right out push water out of the bottom of the core with their graphite tips first." + (scramFrom < 0.2 ? " With almost every rod pulled, that's a lot of reactivity, right where it hurts." : ""));
  else event((auto2 ? "Reactor trip: " : "SCRAM: ") + "the rods are held up by electromagnets; cut the power and they fall in by gravity in about 2 s.");
}
function boom() {
  dead = { kind: "boom", t: now }; flashT = now; shake = 2.4; fireT = now;
  els.lid = { t: now, z: 0, vz: 34, r: 0, vr: 1.6 };
  els.chunks = []; for (let i = 0; i < 40; i++) { const a = rnd() * Math.PI * 2, s2 = 6 + rnd() * 14; els.chunks.push({ p: [rnd() * 4 - 2, rnd() * 4 - 2, 10], v: [Math.cos(a) * s2, Math.sin(a) * s2, 18 + rnd() * 26], s: 0.5 + rnd() * 0.9, r: rnd() * 6, gr: rnd() < 0.7 }); }
  for (let i = 0; i < 80; i++) spark([0, 0, 11], 1.8);
  event("Prompt critical. Power went to about " + Math.round(n * 100) + " % in a second or two, the fuel shattered, the water flashed to steam, and the 2,000 t upper shield went up through the roof. The graphite's on fire. There is no containment.");
}
function testStep(dt) {
  const t = now - test.t;
  if (t < 0.1 && !test.set) { test.set = true; safety = false; eccs = false; n = 0.07; C = 0.07; I = 1.1; X = 1.15; rods = 0.165; rodT = 0.165; rodEff = 0.165; Tf = 340; voidF = 0; flow = 1.15; subcool = 0.005; vgain = 3.5; auto = { p: 0.07 }; Pset = 0.07; tripped = true; }
  if (t > 4 && !test.started) { test.started = true; auto = null; event("01:23:04, the test starts. The turbine's cut off and four of the pumps start coasting down. Less flow, more boiling, and in this reactor more steam means more power."); }
  if (test.started && !dead) flow = Math.max(0.55, flow - dt * 0.02);
  if (t > 4 && (n > 0.25 || t > 40) && !test.az5) { test.az5 = true; scram(false); }
}

// ---------------- particles ----------------
let parts = [];
function spark(p, s) { const a = rnd() * Math.PI * 2; parts.push({ k: "spark", p: [...p], v: [Math.cos(a) * 10 * s, Math.sin(a) * 10 * s, 6 + rnd() * 14 * s], life: 0, max: 0.6 + rnd() * 0.8 }); }
function smokeP(p, s) { parts.push({ k: "smoke", p: [...p], v: [(rnd() - 0.5) * 1.5, (rnd() - 0.5) * 1.5, 5 + rnd() * 4], life: 0, max: 4 + rnd() * 3, s }); }
function flameP(p) { parts.push({ k: "flame", p: [...p], v: [(rnd() - 0.5) * 2, (rnd() - 0.5) * 2, 4 + rnd() * 5], life: 0, max: 0.6 + rnd() * 0.6 }); }
function fogP(p) { parts.push({ k: "fog", p: [...p], v: [(rnd() - 0.5) * 3, (rnd() - 0.5) * 3, 1 + rnd() * 2], life: 0, max: 2.5 + rnd() * 2 }); }
let neutrons = [];
function sizeCanvas() { const r = svgEl.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); const w = Math.max(1, Math.round(r.width * dpr)), hh = Math.max(1, Math.round(r.height * dpr)); if (cv.width !== w || cv.height !== hh) { cv.width = w; cv.height = hh; } }
let shakeOff = [0, 0];
function drawParticles(dt) {
  sizeCanvas();
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.setTransform(cv.width / D.W, 0, 0, cv.height / D.H, shakeOff[0] * cv.width / D.W, shakeOff[1] * cv.height / D.H);
  // neutrons darting about in the cut face of the core
  const want = dead && dead.kind === "boom" ? 0 : Math.round(clamp(8 + 14 * Math.log10(Math.max(n, 1e-3)) + 14, 0, 70));
  while (neutrons.length < want) neutrons.push({ s: (rnd() - 0.5) * 2 * (type === "rbmk" ? 5.6 : 2.5), z: (type === "rbmk" ? 2.4 + rnd() * 6.2 : 10.6 + rnd() * 5), a: rnd() * 7, life: 0 });
  neutrons.length = Math.min(neutrons.length, want);
  ctx.fillStyle = type === "rbmk" ? "rgba(255,220,150,0.9)" : "rgba(150,210,255,0.95)";
  for (const nt of neutrons) {
    nt.a += (rnd() - 0.5) * 2; nt.s += Math.cos(nt.a) * dt * 6; nt.z += Math.sin(nt.a) * dt * 6;
    const lim = type === "rbmk" ? 5.6 : 2.5, z0 = type === "rbmk" ? 2.2 : 10.4, z1 = type === "rbmk" ? 8.8 : 16;
    if (Math.abs(nt.s) > lim || nt.z < z0 || nt.z > z1) { nt.s = (rnd() - 0.5) * 2 * lim; nt.z = z0 + rnd() * (z1 - z0); }
    const P2 = iso(sectPt(0, 0, nt.s, nt.z), PR); ctx.fillRect(P2[0] - 0.8, P2[1] - 0.8, 1.6, 1.6);
  }
  parts = parts.filter((p) => {
    p.life += dt; if (p.life > p.max) return false;
    const t = p.life / p.max;
    if (p.k === "spark") p.v[2] -= 20 * dt;
    for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * dt;
    const P2 = iso(p.p, PR);
    const soft = (r, c, a) => { const g = ctx.createRadialGradient(P2[0], P2[1], 0, P2[0], P2[1], r); g.addColorStop(0, "rgba(" + c + "," + a.toFixed(3) + ")"); g.addColorStop(1, "rgba(" + c + ",0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(P2[0], P2[1], r, 0, 7); ctx.fill(); };
    if (p.k === "smoke") soft((6 + 26 * t) * p.s, "52,50,50", 0.55 * (1 - t));
    if (p.k === "flame") soft(4 + 10 * t, t < 0.4 ? "255,220,140" : "255,110,40", 0.8 * (1 - t));
    if (p.k === "fog") soft(6 + 14 * t, "235,240,245", 0.3 * Math.sin(Math.PI * t));
    if (p.k === "spark") { ctx.fillStyle = "rgba(255," + Math.round(220 - 120 * t) + ",90," + (1 - t).toFixed(2) + ")"; ctx.fillRect(P2[0] - 1, P2[1] - 1, 2, 2); }
    return true;
  });
  // the glow over the open core afterwards
  if (dead && dead.kind === "boom" && now - dead.t > 1.5) { const A = iso([0, 0, 10], PR), B = iso([0, 0, 60], PR), g = ctx.createLinearGradient(A[0], A[1], B[0], B[1]); g.addColorStop(0, "rgba(140,170,255,0.28)"); g.addColorStop(1, "rgba(140,170,255,0)"); ctx.fillStyle = g; ctx.fillRect(A[0] - 10, B[1], 20, A[1] - B[1]); }
}

// ---------------- drawing ----------------
const els = { lid: null, chunks: [] };
const powerCol = () => { const L2 = clamp((Math.log10(Math.max(n, 1e-3)) + 2) / 3.5, 0, 1); return L2; };
function hot(base, k2) { const b = rgb(base), hcol = k2 < 0.6 ? [255, 120, 40] : [255, 240, 200], t = clamp(k2, 0, 1); return "rgb(" + b.map((v, i) => Math.round(v + (hcol[i] - v) * t)).join(",") + ")"; }
function drawRbmk(dt) {
  const fs = [], boomed = dead && dead.kind === "boom", bt = boomed ? now - dead.t : 0;
  // building: floor and the two back walls (cut low at the front), roof gone after the blast
  const obj = [{ parts: [box(-21, 21, -21, 21, -0.6, 0, "#5f646a")], key: -1e9 }];
  obj.push({ parts: [box(-21, -19.5, -21, 21, 0, boomed ? 26 : 34, "#a9a49a", { cap: "#8c877d" })], key: -9e8 });
  obj.push({ parts: [box(-19.5, 21, -21, -19.5, 0, boomed ? 22 : 34, "#b5b0a5", { cap: "#8c877d" })], key: -8.9e8 });
  if (!boomed) obj.push({ parts: [box(-21, 21, -21, -12, 34, 35.2, "#77726a")], key: -8.8e8 });
  // steam separator drums, the pump room, the refuelling machine
  obj.push({ parts: [prism(R.circle(-15, 15, 1.5, 16), "x", -12, 5, "#9ca3aa")], key: -5e5 });
  obj.push({ parts: [prism(R.circle(-15, 15, 1.5, 16), "y", -12, 5, "#9ca3aa")], key: -5e5 + 1 });
  for (const [x, y] of [[-17, -5], [-17, 2], [-5, -17], [2, -17]]) obj.push({ parts: [cyl(x, y, 1.4, 0, 3.4, "#5e7f9a", 14), cyl(x, y, 0.9, 3.4, 4.6, "#47525c", 12)] });
  if (!boomed) obj.push({ parts: [box(-11, -8, -11, -8, 22, 29, "#d9b54a"), box(-19, 5, -10.5, -8.5, 29, 30.3, "#9c8a4a"), box(-10.5, -8.5, -19, 5, 29, 30.3, "#9c8a4a")], key: -4e5 });
  sceneHtml = R.render(obj);
  // the concrete vault, lower shield, graphite core, upper shield ("Elena")
  const vault = [[0, 10], [14, 10]], vaultIn = [[0, 7.6], [14, 7.6]];
  fs.push(...half(0, 0, vault, 1, "#9b968c"), ...half(0, 0, vaultIn, -1, "#7d786f"));
  const pc = powerCol(), coreGlow = boomed ? hot("#2a2622", 0.6 + 0.3 * Math.sin(now * 3)) : hot("#2a2622", pc * 0.55);
  fs.push(...half(0, 0, [[2, 5.9], [9, 5.9]], -1, "#2a2622", 16, coreGlow));
  fs.push(...half(0, 0, [[0, 7.6], [2, 7.6]], 1, "#6d6a66"));
  fs.sort((a, b) => a.d - b.d);
  let s2 = fs.map((f) => f.s).join("");
  // pipe forest from the channel tops to the drums
  if (!boomed) for (let i = 0; i < 14; i++) { const a = F0 + (F1 - F0) * (i + 0.5) / 14, p0 = at(0, 0, 4 + (i % 3), a, 12), p1 = i % 2 ? [-15, -2 + (i % 5) * 1.5, 15] : [-2 + (i % 5) * 1.5, -15, 15]; s2 += '<path class="pipe" d="M' + sp(p0) + "L" + sp([p0[0], p0[1], 14]) + "L" + sp(p1) + '"/>'; }
  // the cut face: vault ring, lower shield, core with its channels, the upper shield
  s2 += sect(0, 0, vault, vaultIn, "#d9c9a6");
  s2 += sectFull(0, 0, 0, 2, 7.6, "#a39d93");
  s2 += sectFull(0, 0, 2, 9, 5.9, coreGlow, "sec core");
  for (let i = 0; i < 19; i++) {
    const s3 = -5.4 + i * 0.6, rodCh = i % 3 === 1;
    if (rodCh) {
      const ins = scramAt === null ? rods : rods, zt = 9, zb = 9 - 7 * ins;
      s2 += '<path class="rod" d="M' + sp(sectPt(0, 0, s3, zt)) + "L" + sp(sectPt(0, 0, s3, zb)) + '"/>';
      const dz0 = zb - 0.3, dz1 = Math.max(2, zb - 4.5);
      if (dz0 > 2) s2 += '<path class="disp" d="M' + sp(sectPt(0, 0, s3, dz0)) + "L" + sp(sectPt(0, 0, s3, dz1)) + '"/>';
    } else s2 += '<path class="fuel" style="stroke:' + hot("#5a3d2a", pc) + '" d="M' + sp(sectPt(0, 0, s3, 2.2)) + "L" + sp(sectPt(0, 0, s3, 8.8)) + '"/>';
  }
  if (!els.lid || !boomed) s2 += sectFull(0, 0, 9, 12, 8.4, "#b9b3a8");
  // a few channel tops (fuel blue-grey, rods orange) on the shield, for the look of the "pentachoron" floor
  sceneHtml += s2;
  // near walls, cut low
  sceneHtml += R.render([{ parts: [box(-21, 21, 19.5, 21, 0, 2.5, "#a9a49a", { cap: "#d9c9a6" })], key: 1e9 }, { parts: [box(19.5, 21, -21, 19.5, 0, 2.5, "#a9a49a", { cap: "#d9c9a6" })], key: 1e9 + 1 }]);
  // flying things
  let fl = "";
  if (els.lid) {
    const L2 = els.lid; if (bt < 6) { L2.vz -= 14 * dt; L2.z = Math.max(0, L2.z + L2.vz * dt); L2.r = Math.min(1.35, L2.r + L2.vr * dt); if (L2.z <= 0 && L2.vz < 0) { L2.vz = 0; L2.vr = 0; } }
    const c = [0, 0, 10.5], cr = Math.cos(L2.r), sr = Math.sin(L2.r);
    fl += R.render([{ parts: [cyl(0, 0, 8.4, 9, 12, "#b9b3a8", 28, { cap: "#8a857c" })], xf: (p) => { const y = p[1] - c[1], z = p[2] - c[2]; return [p[0] + L2.z * 0.15, c[1] + y * cr - z * sr, c[2] + y * sr + z * cr + L2.z]; } }]);
  }
  if (els.chunks.length) {
    const objs = els.chunks.map((ch) => { if (ch.p[2] > 0.3) { ch.v[2] -= 14 * dt; for (let i = 0; i < 3; i++) ch.p[i] += ch.v[i] * dt; ch.r += dt * 4; } else { ch.p[2] = 0.3; } const s4 = ch.s; return { parts: [box(-s4, s4, -s4, s4, -s4 * 1.6, s4 * 1.6, ch.gr ? "#2b2826" : "#8d887f", ch.gr && now - dead.t < 20 ? { emit: ["#ff6a2a", 0.4] } : undefined)], xf: (p) => { const c2 = Math.cos(ch.r), s5 = Math.sin(ch.r); return [ch.p[0] + p[0] * c2 - p[2] * s5, ch.p[1] + p[1], ch.p[2] + p[0] * s5 + p[2] * c2]; } }; });
    fl += R.render(objs);
  }
  flyG.innerHTML = fl;
  if (boomed && rnd() < dt * 18) flameP([rnd() * 6 - 3, rnd() * 6 - 3, 9 + rnd() * 2]);
  if (boomed && rnd() < dt * 8) smokeP([rnd() * 4 - 2, rnd() * 4 - 2, 12], 1.4);
}
function drawPwr(dt) {
  const fs = [], pc = powerCol(), melted = melt > 0.05;
  // containment: cylinder + dome, steel liner inside concrete, cut in half
  const cOut = [[0, 21.5], [30, 21.5], [36, 19.8], [41, 15.2], [44.5, 8.2], [46, 0.1]], cIn = [[0, 20], [30, 20], [35.5, 18.5], [40, 14.2], [43.2, 7.6], [44.5, 0.1]];
  fs.push(...half(0, 0, cOut, 1, "#c9c4b9"), ...half(0, 0, cIn, -1, "#8d949b"));
  fs.sort((a, b) => a.d - b.d);
  let s2 = fs.map((f) => f.s).join("");
  // floor, steam generators, pressuriser, pumps, the polar crane
  const obj = [{ parts: [box(-20, 20, -20, 20, 0, 1.5, "#8a8f94")], key: -1e9 }];
  for (const [x, y] of [[-10, 3], [3, -10]]) obj.push({ parts: [cyl(x, y, 2.2, 3, 18, "#c8ccd1", 18), cyl(x, y, 3, 18, 26, "#c8ccd1", 18), cyl(x, y, 3.05, 25.5, 27, "#b2b7bd", 18, { cap: "#d7dbe0" })] });
  obj.push({ parts: [cyl(-8, -8, 1.3, 6, 22, "#c8ccd1", 14, { cap: "#e0e3e7" })] });
  for (const [x, y] of [[-12, -2], [-2, -12]]) obj.push({ parts: [cyl(x, y, 1, 1.5, 5, "#5e7f9a", 12)] });
  obj.push({ parts: [box(-14, 14, -15.5, -13, 32, 33.5, "#c9a43a"), box(-15.5, -13, -14, 14, 32, 33.5, "#c9a43a")], key: -3e5 });
  s2 += R.render(obj);
  // hot and cold legs
  for (const [x, y] of [[-10, 3], [3, -10]]) s2 += '<path class="leg" d="M' + sp([0, 0, 12]) + "L" + sp([x, y, 6]) + '"/>';
  // the pressure vessel, cut: steel shell, the core, water
  const VZ = (z) => 4 + (z - 6.2) * 1.4, VP = (r, z) => sectPt(0, 0, r * 1.6, VZ(z)), VM = (a) => a.map(([z, r]) => [VZ(z), r * 1.6]);
  const vOut = [[6.2, 0.1], [6.6, 1.2], [7.6, 2.1], [9, 2.3], [17, 2.3], [18.4, 2.1], [19.4, 1.3], [19.8, 0.1]], vIn = [[6.6, 0.1], [7.0, 1.0], [7.9, 1.85], [9, 2.05], [17, 2.05], [18.1, 1.85], [19, 1.1], [19.4, 0.1]];
  const vv = [...half(0, 0, VM(vOut), 1, "#8f969d"), ...half(0, 0, VM(vIn), -1, "#5c646c")]; vv.sort((a, b) => a.d - b.d);
  s2 += vv.map((f) => f.s).join("");
  const boil = clamp(voidF * 1.6, 0, 1), wcol = melted ? "rgba(120,110,100,0.4)" : "rgba(" + Math.round(40 + 90 * pc) + "," + Math.round(110 + 110 * pc) + "," + Math.round(200 + 55 * pc) + "," + (0.55 - 0.4 * boil).toFixed(2) + ")";
  s2 += face([VP(-2.05, 9), VP(2.05, 9), VP(2.05, 17), VP(-2.05, 17)], wcol, ' class="water"');
  // fuel assemblies, control rods from the top, corium if it melts
  if (melt < 0.9) for (let i = 0; i < 9; i++) { const s3 = -1.6 + i * 0.4, rodCh = i % 2 === 1, mz = 14.6 - melt * 4; if (rodCh) { const zb = 14.8 - 3.8 * rods; s2 += '<path class="rod" d="M' + sp(VP(s3, 18.5)) + "L" + sp(VP(s3, zb)) + '"/>'; } s2 += '<path class="fuel thin" style="stroke:' + (melted ? hot("#5a3d2a", 0.5 + melt * 0.5) : hot("#5a5048", pc * 0.4)) + '" d="M' + sp(VP(s3, 11)) + "L" + sp(VP(s3, mz)) + '"/>'; }
  if (melted) { const r = 0.6 + melt * 1.3; s2 += face([VP(-r, 7.2), VP(r, 7.2), VP(r * 0.8, 7.2 + melt * 1.5), VP(-r * 0.8, 7.2 + melt * 1.5)], hot("#7a3a1a", 0.7 + 0.2 * Math.sin(now * 4)), ' class="corium"'); }
  s2 += sect(0, 0, VM(vOut), VM(vIn), "#b9bfc6");
  for (let i = 0; i < 5; i++) s2 += '<path class="crdm" d="M' + sp(VP(-0.8 + i * 0.4, 19.6)) + "L" + sp(VP(-0.8 + i * 0.4, 22.5)) + '"/>';
  // the containment's cut face last
  s2 += sect(0, 0, cOut, cIn, "#d9c9a6");
  sceneHtml = s2;
  flyG.innerHTML = "";
  if (h2 > 0.05 && rnd() < dt * 10 * h2) fogP([rnd() * 20 - 14, rnd() * 20 - 14, 6 + rnd() * 26]);
  if (voidF > 0.05 && rnd() < dt * 10) fogP([rnd() * 2 - 1, rnd() * 2 - 1, 16]);
}
let sceneHtml = "";
function draw(dt) {
  if (type === "rbmk") drawRbmk(dt); else drawPwr(dt);
  sceneG.innerHTML = sceneHtml;
  shake = Math.max(0, shake - dt * 0.7);
  const amp = shake * 6 + (n > 2 && !dead ? Math.min(3, n * 0.15) : 0);
  shakeOff = amp > 0.05 ? [(rnd() - 0.5) * amp, (rnd() - 0.5) * amp] : [0, 0];
  svgEl.style.transform = amp > 0.05 ? "translate(" + shakeOff[0].toFixed(1) + "px," + shakeOff[1].toFixed(1) + "px)" : "";
  const ft = now - flashT; flashEl.style.opacity = ft < 0.6 ? String((1 - ft / 0.6) * 0.85) : "0";
  drawParticles(dt);
  const text = dead ? (dead.kind === "boom" ? "UNIT 4 DESTROYED" : dead.kind === "melt" ? "MELTDOWN · CONTAINED" : "FUEL DAMAGED") : (n * 100 < 10 ? (n * 100).toFixed(1) : Math.round(n * 100)) + " % · " + Math.round(n * T.mwt) + " MWt · ρ " + (rho >= 0 ? "+" : "") + rho.toFixed(2) + " $";
  if (readout.textContent !== text) readout.textContent = text;
}

// ---------------- UI ----------------
const ui = {
  types: [...document.querySelectorAll("[data-type]")], rods: document.querySelector("#rods"), rodsOut: document.querySelector("#rods-out"), pump: document.querySelector("#pump"), pumpOut: document.querySelector("#pump-out"),
  scramB: document.querySelector("#scram"), trip: document.querySelector("#trippumps"), wait: document.querySelector("#wait"), safe: document.querySelector("#safe"), test: document.querySelector("#test"), fresh: document.querySelector("#fresh"),
  slow: document.querySelector("#slow"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"),
  pF: document.querySelector("#pw-fill"), pO: document.querySelector("#pw-out"), rF: document.querySelector("#rho-fill"), rO: document.querySelector("#rho-out"), tF: document.querySelector("#tf-fill"), tO: document.querySelector("#tf-out"),
  vF: document.querySelector("#v-fill"), vO: document.querySelector("#v-out"), xF: document.querySelector("#x-fill"), xO: document.querySelector("#x-out"), oF: document.querySelector("#o-fill"), oO: document.querySelector("#o-out"), oL: document.querySelector("#o-label"), stats: document.querySelector("#stats"),
};
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };
function syncUi() {
  ui.types.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.type === type)));
  if (document.activeElement !== ui.rods) ui.rods.value = String(Math.round(rodT * 100)); ui.rodsOut.textContent = Math.round(rods * 100) + " % in";
  ui.pump.value = String(Math.round(flow * 100)); ui.pumpOut.textContent = Math.round(flow * 100) + " %";
  ui.scramB.textContent = type === "rbmk" ? "AZ-5" : "SCRAM"; ui.test.hidden = type !== "rbmk";
  ui.safe.setAttribute("aria-pressed", String(!safety)); ui.safe.textContent = safety ? "Safety systems on" : "Safety systems OFF";
  const lp = clamp((Math.log10(Math.max(n, 1e-3)) + 3) / 5, 0, 1);
  ui.pF.style.width = (lp * 100).toFixed(1) + "%"; ui.pF.dataset.state = n > 1.12 ? "bad" : n > 1.02 ? "warn" : "ok"; ui.pO.textContent = (n * 100 < 10 ? (n * 100).toFixed(1) : Math.round(n * 100)) + " %";
  ui.rF.style.width = clamp((rho + 2) / 4 * 100, 0, 100).toFixed(1) + "%"; ui.rF.dataset.state = rho >= 1 ? "bad" : rho > 0.3 ? "warn" : "ok"; ui.rO.textContent = (rho >= 0 ? "+" : "") + rho.toFixed(2) + " $";
  ui.tF.style.width = clamp(Tf / 3000 * 100, 0, 100).toFixed(1) + "%"; ui.tF.dataset.state = Tf > 2000 ? "bad" : Tf > 1300 ? "warn" : "ok"; ui.tO.textContent = Math.round(Tf) + " °C";
  ui.vF.style.width = (voidF * 100).toFixed(1) + "%"; ui.vO.textContent = Math.round(voidF * 100) + " % · " + (T.voidA(rods) >= 0 ? "+" : "") + (T.voidA(rods) / 100).toFixed(2) + " $/%";
  ui.xF.style.width = clamp(X * XSC / 10 * 100, 0, 100).toFixed(1) + "%"; ui.xO.textContent = (X * XSC).toFixed(1) + " $";
  if (type === "rbmk") { const v = clamp(rods / 0.5 * 30, 0, 60); ui.oL.textContent = "ORM"; ui.oF.style.width = clamp(v / 60 * 100, 0, 100).toFixed(1) + "%"; ui.oF.dataset.state = v < 15 ? "bad" : v < 26 ? "warn" : "ok"; ui.oO.textContent = Math.round(v) + " rods"; }
  else { ui.oL.textContent = "Contain"; ui.oF.style.width = clamp(cpress / 5 * 100, 0, 100).toFixed(1) + "%"; ui.oF.dataset.state = cpress > 3 ? "bad" : cpress > 1.6 ? "warn" : "ok"; ui.oO.textContent = cpress.toFixed(1) + " bar"; }
  ui.stats.innerHTML = "<b>" + T.name + "</b> · " + Math.round(n * T.mwt).toLocaleString("en-AU") + " MW of heat, about <b>" + Math.round(n * T.mwt / 3.2).toLocaleString("en-AU") + " MW</b> of power · core " + Math.round(Tcore) + " °C" + (melt > 0.01 ? " · <b>" + Math.round(melt * 100) + " % melted</b>" : "") + (decayT > 0 && n < 0.08 ? " · decay heat still <b>" + Math.round(0.066 * Math.pow(Math.max(1, decayT * 600), -0.2) * T.mwt) + " MW</b>" : "");
  ui.slow.setAttribute("aria-pressed", String(slow)); ui.tour.setAttribute("aria-pressed", String(touring));
}
function story() {
  if (now - lastEventAt < 6.5 && lastEvent) return say(lastEvent);
  if (touring && tourStep >= 0 && TOUR[tourStep].say) return say(TOUR[tourStep].say);
  if (dead) return;
  if (rho > 0.9) return say("Nearly a dollar of reactivity: that's prompt critical, where the chain reaction no longer waits for the delayed neutrons. Power doubles in milliseconds.");
  if (type === "rbmk" && rods < 0.25) return say("Operating reactivity margin down to " + Math.round(clamp(rods / 0.5 * 30, 0, 60)) + " rods. The rule was never below 15: with the rods out, the void coefficient goes strongly positive, and AZ-5 itself becomes dangerous.");
  if (type === "rbmk" && voidF > 0.4 && T.voidA(rods) > 2) return say("More steam, more power, more steam. In an RBMK the water absorbs neutrons and the graphite does the moderating, so boiling the water off speeds the reaction up.");
  if (type === "pwr" && voidF > 0.05) return say("Boiling in the core. In a PWR the water is the moderator: steam slows fewer neutrons, so the reaction backs itself off. That's the opposite of the RBMK.");
  if (X * XSC > 4) return say("Xenon-135 piles up for hours after you cut power and eats neutrons. Fighting it by pulling rods is how Chernobyl's operators got into trouble.");
  if (n < 0.08 && decayT > 0) return say("Shut down, but not cold: the fission products are still making several percent of full power as heat. That's why you need the cooling to keep running.");
  return say(type === "rbmk" ? "An RBMK-1000 at full power: 3,200 MW of heat from uranium in channels through a graphite block, cooled by boiling water. Most of the time, a perfectly good power station." : "A modern PWR: water under 155 bar is both the coolant and the moderator, the rods fall in by gravity, and the whole thing sits in a steel and concrete containment.");
}
function setType(t) { type = t; T = TYPES[t]; equilibrium(); els.lid = null; els.chunks = []; parts = []; neutrons = []; }
const TOUR = [
  { say: "Chernobyl 4, an RBMK-1000, at full power: a graphite block with uranium and water in 1,661 channels, 211 control rods, in a plain industrial building.", acts: [[0, () => setType("rbmk")], [7, null]] },
  { say: "The night of 25-26 April 1986: power cut for a turbine test, xenon builds up, the operators pull almost every rod to keep it going, extra pumps on, the emergency cooling isolated.", acts: [[0, () => { test = { t: now }; }], [40, null]] },
  { say: "Same abuse, modern PWR. Pull the rods out:", acts: [[0, () => setType("pwr")], [2, () => { rodT = 0.1; }], [10, null]] },
  { say: "Trip the coolant pumps: the core boils, the void coefficient is negative, the power falls, the rods drop.", acts: [[0, () => { equilibrium(); }], [2, () => { flow = 0.15; }], [10, null]] },
  { say: "Station blackout with the emergency cooling off: no pumps, no water. The reactor's shut down but the decay heat keeps cooking the core.", acts: [[0, () => { equilibrium(); }], [1, () => { flow = 0; eccs = false; safety = false; scram(true); }], [28, null]] },
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
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { if (touring) { touring = false; actions = []; tourStep = -1; } };
const act = (fn) => (...a) => { takeOver(); fn(...a); syncUi(); run(); };
const live = () => !dead || dead.kind === "fuel";
ui.types.forEach((b) => b.addEventListener("click", act(() => setType(b.dataset.type))));
ui.rods.addEventListener("input", act(() => { if (!live()) return; scramAt = null; tip = 0; auto = null; rodT = +ui.rods.value / 100; }));
ui.pump.addEventListener("input", act(() => { if (!live()) return; flow = +ui.pump.value / 100; }));
ui.scramB.addEventListener("click", act(() => live() && scram(false)));
ui.trip.addEventListener("click", act(() => { if (live()) { flow = type === "rbmk" ? 0.2 : 0.1; event("Pumps tripped: the flow's coasting down."); } }));
ui.wait.addEventListener("click", act(() => { for (let i = 0; i < 360; i++) xenon(10, n); event("An hour later: xenon now worth " + (X * XSC).toFixed(1) + " $ against you."); }));
ui.safe.addEventListener("click", act(() => { safety = !safety; eccs = safety; }));
ui.test.addEventListener("click", act(() => { setType("rbmk"); test = { t: now }; }));
ui.fresh.addEventListener("click", act(() => setType(type)));
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; actions = []; } syncUi(); run(); });
stage.addEventListener("keydown", (ev) => {
  const map = { ArrowUp: () => { rodT = clamp(rodT - 0.05, 0, 1); scramAt = null; }, ArrowDown: () => { rodT = clamp(rodT + 0.05, 0, 1); }, s: () => scram(false), p: () => { flow = 0.15; }, t: () => setType(type === "rbmk" ? "pwr" : "rbmk") };
  if (map[ev.key] && live()) { ev.preventDefault(); act(map[ev.key])(); }
});
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;
window.__fig = { freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
setType("rbmk"); draw(0); syncUi(); story();
`;

const CSS = `.fx-stage{position:relative;overflow:hidden}
.fx-stage svg{display:block;position:relative}
.fx-smoke{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.fx-flash{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(circle 55% at 50% 45%,#ffffff 0%,#dfe8ff 35%,rgba(200,215,255,0) 100%)}
.sec{stroke:rgba(0,0,0,.35);stroke-width:.4}.sec.core{stroke:#000}
.rod{stroke:#1b1d20;stroke-width:2;stroke-linecap:butt}.disp{stroke:#8e8a84;stroke-width:2;stroke-linecap:butt}
.fuel{stroke-width:1.6;stroke-linecap:butt}.fuel.thin{stroke-width:2.2}
.crdm{stroke:#7f878f;stroke-width:1.6}
.pipe{fill:none;stroke:#8a9097;stroke-width:.7;opacity:.85}
.leg{fill:none;stroke:#7c858d;stroke-width:4;stroke-linecap:round}
.water{stroke:none}.corium{stroke:#ffcf7a;stroke-width:.6}
.fx-stage path{stroke-linejoin:round}
.ctl{display:grid;gap:12px;margin:14px 0 6px;font-family:var(--anatomy-mono);font-size:12px;color:var(--anatomy-mid)}
.ctl-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ctl-label{min-width:72px;text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:var(--anatomy-lo)}
.ctl button{font:inherit;color:var(--anatomy-mid);background:transparent;border:1px solid var(--anatomy-lo);border-radius:6px;padding:7px 10px;cursor:pointer;line-height:1.15;text-align:left;min-height:36px}
.ctl button[hidden]{display:none}
.ctl button:hover{border-color:var(--anatomy-mid)}
.ctl button[aria-pressed="true"]{color:var(--anatomy-lit);border-color:var(--anatomy-lit)}
.ctl #safe[aria-pressed="true"],.ctl #test,.ctl #scram{color:#ff6a3d;border-color:#ff6a3d}
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
@media (max-width:520px){.ctl-label{min-width:52px}.ctl button{padding:7px 8px}.ctl output{min-width:80px}.ctl button small{display:none}}`;

const stageHtml = `<div class="iso-stage fx-stage" tabindex="0" role="group" aria-label="Nuclear reactor: up and down move the rods, S scrams, P trips the pumps, T swaps RBMK and PWR">${svg}<canvas class="fx-smoke" aria-hidden="true"></canvas><div class="fx-flash" aria-hidden="true"></div></div>`;

const CONTROLS = `<div class="ctl" role="group" aria-label="Controls">
  <div class="ctl-row"><span class="ctl-label">Reactor</span><button type="button" data-type="rbmk" aria-pressed="true">RBMK-1000<small>Chernobyl</small></button><button type="button" data-type="pwr" aria-pressed="false">PWR<small>modern, AP1000-style</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Rods</span><div class="slide"><input id="rods" type="range" min="0" max="100" step="1" value="50" aria-label="Control rods, percent inserted"></div><output id="rods-out">50 % in</output></div>
  <div class="ctl-row"><span class="ctl-label">Pumps</span><div class="slide"><input id="pump" type="range" min="0" max="120" step="1" value="100" aria-label="Coolant flow, percent"></div><output id="pump-out">100 %</output></div>
  <div class="ctl-row"><span class="ctl-label">Do</span><button type="button" id="scram">AZ-5</button><button type="button" id="trippumps">Trip pumps</button><button type="button" id="wait">Wait an hour<small>xenon</small></button><button type="button" id="safe" aria-pressed="false">Safety systems on</button><button type="button" id="test">Run the 1986 test<small>01:23:04</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Power</span><div class="meter"><span id="pw-fill" class="fill"></span><span class="mark" style="left:60%" data-label="100 %"></span></div><output id="pw-out">100 %</output></div>
  <div class="ctl-row"><span class="ctl-label">React.</span><div class="meter"><span id="rho-fill" class="fill"></span><span class="mark" style="left:75%" data-label="prompt critical"></span></div><output id="rho-out">0 $</output></div>
  <div class="ctl-row"><span class="ctl-label">Fuel</span><div class="meter"><span id="tf-fill" class="fill"></span><span class="mark" style="left:${(2800 / 3000 * 100).toFixed(1)}%" data-label="melts"></span></div><output id="tf-out">900 °C</output></div>
  <div class="ctl-row"><span class="ctl-label">Steam</span><div class="meter"><span id="v-fill" class="fill"></span></div><output id="v-out">30 %</output></div>
  <div class="ctl-row"><span class="ctl-label">Xenon</span><div class="meter"><span id="x-fill" class="fill"></span></div><output id="x-out">2.5 $</output></div>
  <div class="ctl-row"><span class="ctl-label" id="o-label">ORM</span><div class="meter"><span id="o-fill" class="fill"></span></div><output id="o-out">30 rods</output></div>
  <div class="ctl-row"><span class="ctl-label">Plant</span><span id="stats"></span></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="fresh">Reset</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
  <div id="shot" aria-live="polite"></div>
</div>`;

const card = k.plateHtml({
  fig: "Fig 23",
  title: "Nuclear reactor",
  hint: "Same abuse, two reactors",
  readout: "",
  keys: [
    { mark: "lit", label: "Live: neutrons in the cut core, rod positions, glow with power, steam, the aftermath" },
    { mark: "raised", label: "Chernobyl-style RBMK in a plain building, or a modern PWR in its containment, cut in half" },
  ],
  caption: "A reactor runs on a chain reaction: each uranium fission frees neutrons, a moderator slows them down, and slow ones split the next atoms. Control rods soak up neutrons to hold it steady. A fraction of a percent of the neutrons come out seconds late, and that's what makes it controllable; add more than that fraction's worth of reactivity (one dollar) and it's prompt critical, running away in milliseconds. What keeps it safe is feedback: in a PWR, water is both coolant and moderator, so heat or steam slows the reaction down. In Chernobyl's RBMK graphite did the moderating and water only absorbed, so at low power with the rods out, steam sped it up. And the emergency rods made it worse for the first few seconds.",
  body: stageHtml,
});

const other = theme === "light" ? ["index.html", "Dark version"] : ["light.html", "Light version"];
const FOOT = `<p style="font-family:var(--anatomy-mono);font-size:11px;color:var(--anatomy-lo);margin:28px 0 8px;line-height:1.6">A toy, not a reactor simulator. Real: point kinetics with delayed neutrons and the one-dollar prompt-critical line, Doppler feedback, the RBMK's positive void coefficient at low power and low margin against a PWR's negative one, xenon-135 piling up after a power cut, the RBMK's graphite displacers adding reactivity at the bottom of the core when AZ-5 drives in rods that were fully out (the positive scram), decay heat, and containment. The 1986 sequence follows World Nuclear Association's timeline (30 MWt, back to 200 MWt, margin at 8 rods against a minimum of 15, emergency cooling isolated, test at 01:23:04, AZ-5 at 01:23:40). Three Mile Island (1979) was a meltdown that the containment held. Made up: one delayed group and every coefficient, the sped-up xenon, decay heat and melting, the geometry and the explosion.<br>Built with <a href="https://github.com/wheresryan22/anatomy" style="color:inherit">Anatomy</a> by Ryan (MIT). · <a href="${other[0]}" style="color:inherit">${other[1]}</a> · <a href="../" style="color:inherit">More figures</a> · <a href="https://github.com/Dizzyfer/Anatomy/tree/main/reactor" style="color:inherit">Source</a></p>`;
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "Nuclear reactor", theme, body: `<style>${CSS}</style>${card.replace("<figcaption", CONTROLS + "<figcaption")}${FOOT}`, script: kitScript() + LIVE.replace("__DATA__", JSON.stringify(DATA)), width: 720 }));
console.log("wrote", name);
