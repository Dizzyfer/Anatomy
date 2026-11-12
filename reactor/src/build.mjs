import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { engineScript, stageHtml, pageMk2, footHtml } from "../../mk2/shell.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const W = 960, H = 640;

// Truth: point kinetics with delayed neutrons (prompt critical at one dollar of reactivity), fuel Doppler feedback, the
// void coefficient (positive in an RBMK at low power with the rods out, strongly negative in a PWR), xenon building up
// after a power cut, the RBMK's graphite displacers adding reactivity at the bottom of the core when a fully withdrawn rod
// starts to go in (the positive scram), decay heat after shutdown. Chernobyl 4 timeline from World Nuclear Association.
// Toy: one delayed group, every coefficient, the xenon clock sped up, decay heat and melting sped up, the geometry.
const PLATE = { x: -24, y: -24, w: 48, d: 48, r: 2 };
const P = k.fitProjection([...k.boxCorners(PLATE, -0.8, 0), [-22, -22, 44], [22, -22, 30], [-22, 22, 30], [0, 0, 47]], W, H, { pad: 14, azimuth: 45, elevation: 30 });
const DATA = { W, H, P, PLATE };

const LIVE = `
${engineScript()}
const D = __DATA__;
const stage = document.querySelector(".mk-stage");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lightTheme = document.body.dataset.theme === "light";
const E = mk2(stage, D.P, { W: D.W, H: D.H, pivot: [0, 0, 12], plate: { ...D.PLATE, h: 2, foot: 1 }, shadowBox: [-26, -26, -4, 26, 26, 50] });
const { box, cyl, prism, circle, lathe, tube, sphere, loft, roundPoly, rrect, tris } = E;
E.bindTools(stage);
const xbtn = stage.querySelector('[data-mk="xray"]');
const setX = (on) => { E.setXray(on); if (xbtn) xbtn.setAttribute("aria-pressed", String(on)); };
const sceneG = stage.querySelector('[data-part="scene"]');
const iso = (p) => E.project(p), depthOf = (p) => E.depthOf(p);
const shakeEls = [stage.querySelector(".mk-gl"), stage.querySelector(".mk-over")];
const setShake = (x, y) => { const t = x || y ? "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px)" : ""; for (const e of shakeEls) if (e.style.transform !== t) e.style.transform = t; };
let seed = 3; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
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

let parts = [];
function spark(p, s) { const a = rnd() * Math.PI * 2; parts.push({ k: "spark", p: [...p], v: [Math.cos(a) * 10 * s, Math.sin(a) * 10 * s, 6 + rnd() * 14 * s], life: 0, max: 0.6 + rnd() * 0.8 }); }
function smokeP(p, s) { parts.push({ k: "smoke", p: [...p], v: [(rnd() - 0.5) * 1.5, (rnd() - 0.5) * 1.5, 5 + rnd() * 4], life: 0, max: 4 + rnd() * 3, s }); }
function flameP(p) { parts.push({ k: "flame", p: [...p], v: [(rnd() - 0.5) * 2, (rnd() - 0.5) * 2, 4 + rnd() * 5], life: 0, max: 0.6 + rnd() * 0.6 }); }
function fogP(p) { parts.push({ k: "fog", p: [...p], v: [(rnd() - 0.5) * 3, (rnd() - 0.5) * 3, 1 + rnd() * 2], life: 0, max: 2.5 + rnd() * 2 }); }
let neutrons = [];
// ---------------- particles ----------------
const flashEl = stage.querySelector(".fx-flash");
let shakeOff = [0, 0];
const CORE = { rbmk: { r: 5.4, z0: 2.3, z1: 8.7 }, pwr: { r: 2.7, z0: 10.9, z1: 15.6 } };
function drawParticles(dt) {
  // neutrons darting about in the core
  const want = dead && dead.kind === "boom" ? 0 : Math.round(clamp(8 + 14 * Math.log10(Math.max(n, 1e-3)) + 14, 0, 70)), K = CORE[type];
  const fresh = () => { const a = rnd() * 7, r = Math.sqrt(rnd()) * K.r; return { p: [Math.cos(a) * r, Math.sin(a) * r, K.z0 + rnd() * (K.z1 - K.z0)], a: rnd() * 7, b: rnd() * 7 }; };
  while (neutrons.length < want) neutrons.push(fresh());
  neutrons.length = Math.min(neutrons.length, want);
  for (let i = 0; i < neutrons.length; i++) {
    const nt = neutrons[i]; if (!nt.p) { neutrons[i] = fresh(); continue; }
    nt.a += (rnd() - 0.5) * 2; nt.b += (rnd() - 0.5) * 2; const o = [nt.p[0], nt.p[1], nt.p[2]];
    nt.p[0] += Math.cos(nt.a) * Math.cos(nt.b) * dt * 7; nt.p[1] += Math.sin(nt.a) * Math.cos(nt.b) * dt * 7; nt.p[2] += Math.sin(nt.b) * dt * 7;
    if (Math.hypot(nt.p[0], nt.p[1]) > K.r || nt.p[2] < K.z0 || nt.p[2] > K.z1) { neutrons[i] = fresh(); continue; }
    E.line(o, nt.p, 1.8, type === "rbmk" ? "#ffe0a0" : "#a8d8ff", 0.9, !lightTheme);
  }
  parts = parts.filter((p) => {
    p.life += dt; if (p.life > p.max) return false;
    const t = p.life / p.max;
    if (p.k === "spark") p.v[2] -= 20 * dt;
    const o = [p.p[0], p.p[1], p.p[2]];
    for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * dt;
    if (p.k === "smoke") E.sprite(p.p, (1.6 + 7 * t) * p.s, "#343232", 0.55 * (1 - t));
    if (p.k === "flame") E.sprite(p.p, 2.2 + 3 * t, t < 0.3 ? "#ffe9a8" : t < 0.65 ? "#ff9a2e" : "#e2501a", 0.9 * (1 - t * t), true, 2);
    if (p.k === "fog") E.sprite(p.p, 1.6 + 3.6 * t, lightTheme ? "#aab4be" : "#ebf0f5", 0.3 * Math.sin(Math.PI * t));
    if (p.k === "spark") E.line(o, p.p, 2, t < 0.5 ? "#ffe6a0" : "#ff8a3a", 1 - t, true);
    return true;
  });
  // the glow over the open core afterwards
  if (dead && dead.kind === "boom" && now - dead.t > 1.5) for (let z = 10; z < 60; z += 4) E.sprite([0, 0, z], 5 + z * 0.04, "#8caaff", 0.16 * (1 - (z - 10) / 50), true, 1);
}

// ---------------- drawing ----------------
const els = { lid: null, chunks: [] };
const powerCol = () => clamp((Math.log10(Math.max(n, 1e-3)) + 2) / 3.5, 0, 1);
// a wedge is cut out of everything round, facing the viewer, so you can see in
const A0 = Math.PI * 0.62, A1 = Math.PI * 1.88, CUT = "#d9c9a6";
const inWedge = (x, y) => { let f = Math.atan2(y, x); if (f < -0.12 * Math.PI) f += 2 * Math.PI; return f < 0.62 * Math.PI; };
const wedge = (profile, col, o = {}) => lathe(profile, col, { a0: A0, a1: A1, cap: CUT, seg: 40, ...o });
const hotOf = (k2) => (k2 < 0.6 ? "#ff7828" : "#fff0c8");
// the channels standing in the cut-away part of the RBMK core: fuel, and control rods with their graphite followers
const CHAN = []; for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) { const x = i * 1.05 + (j % 2 ? 0.52 : 0), y = j * 0.95; if (Math.hypot(x, y) < 5.5 && inWedge(x, y)) CHAN.push({ x, y, rod: (i * 3 + j * 5 + 100) % 3 === 0 }); }
function rbmkStatic(boomed) {
  const out = [], Cn = { mat: "concrete" }, S = { shell: true };
  out.push(box(-21, 21, -21, 21, -0.6, 0, "#5f646a", Cn));
  out.push(box(-21, -19.5, -21, 21, 0, boomed ? 26 : 34, "#a9a49a", { ...Cn, cap: "#8c877d", ...S }), box(-19.5, 21, -21, -19.5, 0, boomed ? 22 : 34, "#b5b0a5", { ...Cn, cap: "#8c877d", ...S }));
  if (!boomed) out.push(box(-21, 21, -21, -12, 34, 35.2, "#77726a", { ...Cn, ...S }), box(-21, -12, -12, 21, 34, 35.2, "#77726a", { ...Cn, ...S }));
  out.push(box(-21, 21, 19.5, 21, 0, 2.5, "#a9a49a", { ...Cn, cap: CUT }), box(19.5, 21, -21, 19.5, 0, 2.5, "#a9a49a", { ...Cn, cap: CUT }));
  // steam separator drums, main circulation pumps, the refuelling machine on its gantry
  const drum = [[0, -8.6], [1.2, -8.6], [1.5, -8.1], [1.5, 8.1], [1.2, 8.6], [0, 8.6]];
  out.push(lathe(drum, "#9ca3aa", { c: [-3.5, -15, 15], axis: "x", mat: "paint", seg: 20 }), lathe(drum, "#9ca3aa", { c: [-15, -3.5, 15], axis: "y", mat: "paint", seg: 20 }));
  for (const [x, y] of [[-3.5, -15], [-15, -3.5]]) for (const d of [-6, 6]) out.push(box((y < -10 ? x + d : x) - 0.4, (y < -10 ? x + d : x) + 0.4, (y < -10 ? y : y + d) - 0.4, (y < -10 ? y : y + d) + 0.4, 0, 13.6, "#6f757b", { mat: "steel" }));
  for (const [x, y] of [[-17, -5], [-17, 2], [-5, -17], [2, -17]]) out.push(lathe([[0, 0], [1.4, 0], [1.4, 3.2], [1.0, 3.5], [0.9, 4.6], [0, 4.7]], "#5e7f9a", { c: [x, y, 0], mat: "paint", seg: 16 }));
  if (!boomed) out.push(box(-11, -8, -11, -8, 22, 29, "#d9b54a", { mat: "paint" }), box(-19, 5, -10.5, -8.5, 29, 30.3, "#9c8a4a", { mat: "paint" }), box(-10.5, -8.5, -19, 5, 29, 30.3, "#9c8a4a", { mat: "paint" }));
  // the concrete vault round the core, and the lower shield it sits on
  out.push(wedge([[10, 0], [10, 14], [7.6, 14], [7.6, 0], [10, 0]], "#9b968c", { ...Cn, closed: true }), wedge([[0, 0], [7.6, 0], [7.6, 2], [0, 2]], "#a39d93", Cn));
  // pipes from the channel tops to the drums
  if (!boomed) for (let i = 0; i < 14; i++) { const a = A0 + ((A1 - A0) * (i + 0.5)) / 14, r = 4 + (i % 3), p0 = [r * Math.cos(a), r * Math.sin(a), 12], p1 = i % 2 ? [-15, -2 + (i % 5) * 1.5, 15] : [-2 + (i % 5) * 1.5, -15, 15]; out.push(tube([p0, [p0[0], p0[1], 14], [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, 15.5], p1], 0.13, "#8d939b", { mat: "steel", seg: 5 })); }
  return out;
}
function drawRbmk(dt) {
  const boomed = !!(dead && dead.kind === "boom"), bt = boomed ? now - dead.t : 0, objs = [], pc = powerCol();
  objs.push({ cache: "rbmk", rev: boomed ? 1 : 0, parts: () => rbmkStatic(boomed) });
  const live = [], glow = boomed ? 0.6 + 0.3 * Math.sin(now * 3) : pc * 0.55;
  // the graphite stack, glowing with the power
  live.push(wedge([[0, 2], [5.9, 2], [5.9, 9], [0, 9]], "#2a2622", { mat: "matte", emit: [hotOf(glow), boomed ? glow * 0.8 : glow * 0.3], cap: "#3a3430" }));
  if (!boomed) {
    for (const c of CHAN) {
      if (c.rod) {
        // absorber from the top; below it, on a thin link, the graphite displacer that did the damage
        const zb = 9 - 7 * rods; live.push(tube([[c.x, c.y, zb], [c.x, c.y, zb + 7]], 0.15, "#17181b", { mat: "steel", seg: 6 }));
        const dz0 = zb - 0.3, dz1 = Math.max(2, zb - 4.5); if (dz0 > 2.05) live.push(tube([[c.x, c.y, dz1], [c.x, c.y, dz0]], 0.13, "#6a655e", { mat: "matte", seg: 6 }));
      } else live.push(tube([[c.x, c.y, 2.2], [c.x, c.y, 8.8]], 0.16, "#5a3d2a", { mat: "metal", seg: 6, emit: [hotOf(pc), pc * 0.7], emitK: 1.1 }));
    }
    // the upper shield, with a pattern of channel caps
    live.push(wedge([[0, 9], [8.4, 9], [8.4, 12], [0, 12]], "#b9b3a8", { mat: "concrete" }));
  }
  objs.push({ parts: live });
  // flying things
  if (els.lid) {
    const L2 = els.lid; if (bt < 6) { L2.vz -= 14 * dt; L2.z = Math.max(0, L2.z + L2.vz * dt); L2.r = Math.min(1.35, L2.r + L2.vr * dt); if (L2.z <= 0 && L2.vz < 0) { L2.vz = 0; L2.vr = 0; } }
    const c = [0, 0, 10.5], cr = Math.cos(L2.r), sr = Math.sin(L2.r);
    objs.push({ parts: [lathe([[0, 9], [8.4, 9], [8.4, 12], [0, 12]], "#b9b3a8", { mat: "concrete", seg: 32 })], xf: (p) => { const y = p[1] - c[1], z = p[2] - c[2]; return [p[0] + L2.z * 0.15, c[1] + y * cr - z * sr, c[2] + y * sr + z * cr + L2.z]; } });
  }
  for (const ch of els.chunks) {
    if (ch.p[2] > 0.3) { ch.v[2] -= 14 * dt; for (let i = 0; i < 3; i++) ch.p[i] += ch.v[i] * dt; ch.r += dt * 4; } else ch.p[2] = 0.3;
    const s4 = ch.s, c2 = Math.cos(ch.r), s5 = Math.sin(ch.r);
    objs.push({ parts: [box(-s4, s4, -s4, s4, -s4 * 1.6, s4 * 1.6, ch.gr ? "#2b2826" : "#8d887f", { mat: "matte", emit: ch.gr && now - dead.t < 20 ? ["#ff6a2a", 0.35] : undefined, emitK: 1 })], xf: (p) => [ch.p[0] + p[0] * c2 - p[2] * s5, ch.p[1] + p[1], ch.p[2] + p[0] * s5 + p[2] * c2] });
  }
  if (boomed && rnd() < dt * 26) flameP([rnd() * 8 - 4, rnd() * 8 - 4, 8 + rnd() * 3]);
  if (boomed && rnd() < dt * 8) smokeP([rnd() * 4 - 2, rnd() * 4 - 2, 12], 1.4);
  let svg = E.render(objs);
  if (E.xray > 0.02 && !boomed) svg += E.callouts([
    { p: [4.2, 4.2, 6], text: "Graphite stack", sub: "the moderator: 1,700 t of it" }, { p: [CHAN[1].x, CHAN[1].y, 5], text: "Fuel channel", sub: "uranium and boiling water" }, { p: [3, 0.4, 12.6], text: "Control rod", sub: "boron on top, graphite tip below" },
    { p: [6.5, 6.5, 10.5], text: "Upper shield", sub: "2,000 t, nothing holding it down" }, { p: [-3.5, -13.6, 15], text: "Steam drums", sub: "" }, { p: [-17, 2, 4], text: "Main pumps", sub: "" }, { p: [8, -5.5, 13], text: "Vault", sub: "concrete, but no containment" },
  ], E.xray);
  return svg;
}
// the PWR: fuel assemblies in a square grid, rods from the top in some of them
const ASSY = []; for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) { const x = i * 0.72, y = j * 0.72; if (Math.hypot(x, y) < 3.0) ASSY.push({ x, y, rod: (i + j * 2 + 40) % 4 === 0 }); }
const VZ = (z) => 4 + (z - 6.2) * 1.4;
function pwrStatic() {
  const out = [], Cn = { mat: "concrete" }, S = { shell: true }, Wp = { mat: "paint" };
  // containment: concrete cylinder and dome with a steel liner, cut open
  const cOut = [[21.5, 0], [21.5, 30], [19.8, 36], [15.2, 41], [8.2, 44.5], [0.1, 46]], cIn = [[0.1, 44.5], [7.6, 43.2], [14.2, 40], [18.5, 35.5], [20, 30], [20, 0]];
  out.push(wedge([...cOut, ...cIn, cOut[0]], "#c9c4b9", { ...Cn, closed: true, ...S }), wedge(cIn.map(([r, z]) => [Math.max(0.05, r - 0.06), z - 0.05]).reverse(), "#8d949b", { mat: "steel", ...S, caps: false }));
  out.push(lathe([[0, 0], [20, 0], [20, 1.5], [0, 1.5]], "#8a8f94", { ...Cn, seg: 40 }));
  // steam generators, pressuriser, coolant pumps, the polar crane, hot and cold legs
  for (const [x, y] of [[-10, 3], [3, -10]]) { out.push(lathe([[0, 1.5], [2.2, 1.5], [2.2, 17.4], [3, 18.6], [3, 25.4], [2.5, 26.5], [1.2, 27.1], [0, 27.2]], "#c8ccd1", { c: [x, y, 0], ...Wp, seg: 22 })); for (const dz of [0.7, -0.7]) out.push(tube([[0, 0, 13 + dz], [x * 0.45, y * 0.45, 9 + dz * 0.5], [x * 0.85, y * 0.85, 5.5 + dz]], 0.55, "#aab0b6", { mat: "steel", seg: 8 })); }
  out.push(lathe([[0, 6], [1.3, 6], [1.3, 21.2], [0.9, 22], [0, 22.3]], "#c8ccd1", { c: [-8, -8, 0], ...Wp, seg: 18 }), box(-8.4, -7.6, -8.4, -7.6, 1.5, 6, "#6f757b", { mat: "steel" }));
  for (const [x, y] of [[-12, -2], [-2, -12]]) out.push(lathe([[0, 1.5], [1, 1.5], [1, 4.4], [0.7, 4.8], [0.7, 6.4], [0, 6.5]], "#5e7f9a", { c: [x, y, 0], ...Wp, seg: 14 }));
  out.push(box(-14, 14, -15.5, -13, 32, 33.5, "#c9a43a", Wp), box(-15.5, -13, -14, 14, 32, 33.5, "#c9a43a", Wp), box(-9.5, -6.5, -15.8, -12.7, 33.5, 35, "#8d939b", { mat: "steel" }));
  // the pressure vessel: thick steel, cut open
  const vOut = [[6.2, 0.1], [6.6, 1.2], [7.6, 2.1], [9, 2.3], [17, 2.3], [18.4, 2.1], [19.4, 1.3], [19.8, 0.1]], vIn = [[19.4, 0.1], [19, 1.1], [18.1, 1.85], [17, 2.05], [9, 2.05], [7.9, 1.85], [7.0, 1.0], [6.6, 0.1]];
  const M = (a) => a.map(([z, r]) => [r * 1.6, VZ(z)]);
  out.push(wedge([...M(vOut), ...M(vIn), M(vOut)[0]], "#8f969d", { mat: "steel", closed: true, cap: "#b9bfc6", ...S }));
  for (let i = 0; i < 4; i++) { const a = 0.3 + i * 1.57; out.push(box(Math.cos(a) * 3.3 - 0.25, Math.cos(a) * 3.3 + 0.25, Math.sin(a) * 3.3 - 0.25, Math.sin(a) * 3.3 + 0.25, 1.5, 6.5, "#6f757b", { mat: "steel" })); }
  return out;
}
function drawPwr(dt) {
  const pc = powerCol(), melted = melt > 0.05, objs = [{ cache: "pwr", rev: 0, parts: pwrStatic }], live = [];
  // fuel assemblies (sinking into a pool of corium if it melts), control rods from the top
  const top = 15.8 - melt * 5.4;
  if (melt < 0.9) for (const a of ASSY) {
    live.push(box(a.x - 0.3, a.x + 0.3, a.y - 0.3, a.y + 0.3, 10.7 - melt * 1.5, top, melted ? "#5a3d2a" : "#6a6259", { mat: "metal", bevel: 0.04, emit: melted ? ["#ff7828", 0.5 + melt * 0.5] : [hotOf(pc * 0.5), pc * 0.45] }));
    if (a.rod) { const zb = VZ(14.8 - 3.8 * rods); live.push(tube([[a.x, a.y, zb], [a.x, a.y, zb + 6.2]], 0.1, "#17181b", { mat: "steel", seg: 5 })); }
  }
  if (melted) { const r = (0.6 + melt * 1.3) * 1.6; live.push(lathe([[0, 4.5], [r, 4.7], [r * 0.9, 4.7 + melt * 2.2], [0, 4.9 + melt * 2.4]], "#7a3a1a", { mat: "matte", emit: ["#ff7a2a", 0.75 + 0.2 * Math.sin(now * 4)], emitK: 2, seg: 20 })); }
  for (let i = 0; i < 9; i++) { const a = i * 0.7, r = i ? 1.5 : 0; live.push(tube([[Math.cos(a) * r, Math.sin(a) * r, 22.6], [Math.cos(a) * r, Math.sin(a) * r, 26.5]], 0.16, "#aeb4bb", { mat: "steel", seg: 5 })); }
  // the water, bluer the harder the core is working, thinner as it boils
  const boil = clamp(voidF * 1.6, 0, 1), wc = melted ? "#786e64" : "rgb(" + Math.round(40 + 90 * pc) + "," + Math.round(110 + 110 * pc) + "," + Math.round(200 + 55 * pc) + ")";
  live.push(lathe([[0, 7.9], [3.2, 7.9], [3.2, 19.1 - boil * 3], [0, 19.1 - boil * 3]], melted ? "#786e64" : "#" + [40 + 90 * pc, 110 + 110 * pc, 200 + 55 * pc].map((v) => Math.round(v).toString(16).padStart(2, "0")).join(""), { mat: "glass", opacity: melted ? 0.3 : 0.42 - 0.28 * boil, rough: 0.3, seg: 28, emit: melted ? undefined : ["#3d8bff", pc * 0.25] }));
  objs.push({ parts: live });
  if (h2 > 0.05 && rnd() < dt * 10 * h2) fogP([rnd() * 20 - 14, rnd() * 20 - 14, 6 + rnd() * 26]);
  if (voidF > 0.05 && rnd() < dt * 10) fogP([rnd() * 2 - 1, rnd() * 2 - 1, 19]);
  let svg = E.render(objs);
  if (E.xray > 0.02) svg += E.callouts([
    { p: [2.2, 2.2, 13], text: "Core", sub: "fuel assemblies under water" }, { p: [0, 0, 24.5], text: "Control rods", sub: "held up by magnets: lose power, they drop" }, { p: [3.6, -1, 18], text: "Pressure vessel", sub: "20 cm of steel" },
    { p: [3, -10, 22], text: "Steam generator", sub: "the reactor water never leaves the building" }, { p: [-8, -8, 20], text: "Pressuriser", sub: "" }, { p: [15, -15, 30], text: "Containment", sub: "steel-lined concrete, built to hold a meltdown" }, { p: [-14, 0, 33.5], text: "Polar crane", sub: "" },
  ], E.xray);
  return svg;
}
function draw(dt) {
  const svg = type === "rbmk" ? drawRbmk(dt) : drawPwr(dt);
  shake = Math.max(0, shake - dt * 0.7);
  const amp = shake * 6 + (n > 2 && !dead ? Math.min(3, n * 0.15) : 0);
  shakeOff = amp > 0.05 ? [(rnd() - 0.5) * amp, (rnd() - 0.5) * amp] : [0, 0];
  setShake(shakeOff[0], shakeOff[1]);
  const ft = now - flashT; flashEl.style.opacity = ft < 0.6 ? String((1 - ft / 0.6) * 0.85) : "0";
  drawParticles(dt);
  sceneG.innerHTML = svg;
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
  const map = { x: () => setX(!E.xrayOn), ArrowUp: () => { rodT = clamp(rodT - 0.05, 0, 1); scramAt = null; }, ArrowDown: () => { rodT = clamp(rodT + 0.05, 0, 1); }, s: () => scram(false), p: () => { flow = 0.15; }, t: () => setType(type === "rbmk" ? "pwr" : "rbmk") };
  if (map[ev.key] && live()) { ev.preventDefault(); act(map[ev.key])(); }
});
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;
window.__fig = { E, freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
setType("rbmk"); draw(0); syncUi(); story();
`;

const CSS = `.fx-flash{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(circle 60% at 50% 50%,#ffffff 0%,#dfe8ff 30%,rgba(150,180,255,0) 100%)}`;

const stage = stageHtml({
  W, H, fig: "Fig 23", title: "Nuclear reactor", xray: true,
  label: "A nuclear reactor cut open: either an RBMK-1000 in its plain building, with the graphite core, fuel channels and control rods, or a pressurised water reactor inside its containment dome, with the pressure vessel, steam generators and pressuriser.",
  keysHelp: "Nuclear reactor: drag to rotate, X for x-ray, up and down move the rods, S scrams, P trips the pumps, T swaps RBMK and PWR",
  extra: `<div class="fx-flash" aria-hidden="true"></div>`,
});

const CONTROLS = `<div class="ctl" role="group" aria-label="Controls">
  <div class="ctl-row"><span class="ctl-label">Reactor</span><button type="button" data-type="rbmk" aria-pressed="true">RBMK-1000<small>Chernobyl</small></button><button type="button" data-type="pwr" aria-pressed="false">PWR<small>modern, AP1000-style</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Rods</span><div class="slide"><input id="rods" type="range" min="0" max="100" step="1" value="50" aria-label="Control rods, percent inserted"></div><output id="rods-out">50 % in</output></div>
  <div class="ctl-row"><span class="ctl-label">Pumps</span><div class="slide"><input id="pump" type="range" min="0" max="120" step="1" value="100" aria-label="Coolant flow, percent"></div><output id="pump-out">100 %</output></div>
  <div class="ctl-row"><span class="ctl-label">Do</span><button type="button" id="scram" class="danger">AZ-5</button><button type="button" id="trippumps">Trip pumps</button><button type="button" id="wait">Wait an hour<small>xenon</small></button><button type="button" id="safe" aria-pressed="false">Safety systems on</button><button type="button" id="test">Run the 1986 test<small>01:23:04</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Power</span><div class="meter"><span id="pw-fill" class="fill"></span><span class="mark" style="left:60%" data-label="100 %"></span></div><output id="pw-out">100 %</output></div>
  <div class="ctl-row"><span class="ctl-label">React.</span><div class="meter"><span id="rho-fill" class="fill"></span><span class="mark" style="left:75%" data-label="prompt critical"></span></div><output id="rho-out">0 $</output></div>
  <div class="ctl-row"><span class="ctl-label">Fuel</span><div class="meter"><span id="tf-fill" class="fill"></span><span class="mark" style="left:${(2800 / 3000 * 100).toFixed(1)}%" data-label="melts"></span></div><output id="tf-out">900 °C</output></div>
  <div class="ctl-row"><span class="ctl-label">Steam</span><div class="meter"><span id="v-fill" class="fill"></span></div><output id="v-out">30 %</output></div>
  <div class="ctl-row"><span class="ctl-label">Xenon</span><div class="meter"><span id="x-fill" class="fill"></span></div><output id="x-out">2.5 $</output></div>
  <div class="ctl-row"><span class="ctl-label" id="o-label">ORM</span><div class="meter"><span id="o-fill" class="fill"></span></div><output id="o-out">30 rods</output></div>
  <div class="ctl-row wide"><span class="ctl-label">Plant</span><span id="stats"></span></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="fresh">Reset</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
</div>`;


const foot = footHtml({
  theme, slug: "reactor",
  real: "point kinetics with delayed neutrons and the one-dollar prompt-critical line, Doppler feedback, the RBMK's positive void coefficient at low power and low margin against a PWR's negative one, xenon-135 piling up after a power cut, the RBMK's graphite displacers adding reactivity at the bottom of the core when AZ-5 drives in rods that were fully out (the positive scram), decay heat, and containment. The 1986 sequence follows World Nuclear Association's timeline (30 MWt, back to 200 MWt, margin at 8 rods against a minimum of 15, emergency cooling isolated, test at 01:23:04, AZ-5 at 01:23:40). Three Mile Island (1979) was a meltdown that the containment held.",
  made: "one delayed group and every coefficient, the sped-up xenon, decay heat and melting, the geometry and the explosion.",
});
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), pageMk2({
  k, title: "Nuclear reactor", fig: "Fig 23", hint: "Same abuse, two reactors", theme, W, H, stage, controls: CONTROLS, css: CSS, foot,
  caption: "A reactor runs on a chain reaction: each uranium fission frees neutrons, a moderator slows them down, and slow ones split the next atoms. Control rods soak up neutrons to hold it steady. A fraction of a percent of the neutrons come out seconds late, and that's what makes it controllable; add more than that fraction's worth of reactivity (one dollar) and it's prompt critical, running away in milliseconds. What keeps it safe is feedback: in a PWR, water is both coolant and moderator, so heat or steam slows the reaction down. In Chernobyl's RBMK graphite did the moderating and water only absorbed, so at low power with the rods out, steam sped it up. And the emergency rods made it worse for the first few seconds.",
  script: LIVE.replace("__DATA__", JSON.stringify(DATA)),
}));
console.log("wrote", name);
