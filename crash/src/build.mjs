import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { engineScript, stageHtml, pageMk2, footHtml } from "../../mk2/shell.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const W = 960, H = 600;

// Truth: a crash is getting rid of kinetic energy (½mv²) over a distance; the longer the distance, the lower the g. A
// modern car crushes a long, controlled front end and keeps a stiff cage round the people; restraints tie the occupant to
// that slowing-down instead of letting them hit the inside at full speed. IIHS crashed a 1959 Chevrolet Bel Air into a
// 2009 Chevrolet Malibu at 40 mph each (2009): the IIHS readings quoted here are from its published crash data.
// Toy: one-dimensional crush and occupant models with made-up force curves, tuned to land near those numbers.
const PLATE = { x: -5.3, y: -2.3, w: 9.9, d: 4.9, r: 0.5 };
const P = k.fitProjection([...k.boxCorners(PLATE, -0.7, 0), [-4.6, -1.8, 1.6], [4.2, 2.2, 1.6], [4.2, -1.8, 1.6]], W, H, { pad: 26, azimuth: 45 });
const DATA = { W, H, P, PLATE };

const LIVE = `
${engineScript()}
const D = __DATA__;
const stage = document.querySelector(".mk-stage");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const E = mk2(stage, D.P, { W: D.W, H: D.H, pivot: [0.3, 0.2, 0.5], plate: { ...D.PLATE, h: 0.45, foot: 0.25, col: document.body.dataset.theme === "light" ? "#74777d" : "#2c2e33" }, shadowBox: [-5.6, -2.6, -1, 5, 2.9, 3] });
const { box, prism, lathe, tube, sphere, loft, roundPoly } = E;
E.bindTools(stage);
const xbtn = stage.querySelector('[data-mk="xray"]');
const setX = (on) => { E.setXray(on); xbtn.setAttribute("aria-pressed", String(on)); };
const gcv = stage.querySelector(".g-cv"), gctx = gcv.getContext("2d");
const sceneG = stage.querySelector('[data-part="scene"]');
let seed = 6; let parts = []; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

// ---------------- the two cars ----------------
const CARS = {
  old: { name: "1959-style sedan", m: 1600, L: 5.35, front: 1.25, gap: 0.42, paint: "#45b5a8", roof: "#eeeae0",
    F: (x) => (x < 0.05 ? 2.4e6 * x : x < 0.38 ? 120e3 + 60e3 * Math.sin(x * 40) * 0.4 : 300e3 + 120e3 * Math.sin(x * 25) * 0.3),
    intr: (x) => Math.max(0, x - 0.38) * 0.92, col: (x) => Math.max(0, x - 0.38) * 0.5 },
  new: { name: "2009-style sedan", m: 1550, L: 4.85, front: 1.05, gap: 0.45, paint: "#b9373a", roof: "#b9373a",
    F: (x) => (x < 0.05 ? 4.4e6 * x : x < 0.6 ? 220e3 + 80e3 * (x - 0.05) / 0.55 : 300e3 + 2.0e6 * (x - 0.6)),
    intr: (x) => Math.max(0, x - 0.66) * 0.35, col: (x) => Math.max(0, x - 0.7) * 0.1 },
};
const IIHS = { old: { chest: 85, hic: 461, intr: 62, femur: 10.9 }, new: { chest: 41, hic: 215, intr: 7, femur: 2.8 } };
let car = "new", C = CARS.new, kmh = 64, belt = true, bag = true;
// state of a run
let phase = "idle", phaseAt = 0, xCar = -6, v = 0, crush = 0, t = 0, u = 0, w = 0, bagT = 0, chestPk = 0, headG = 0, headV = 0, contact = false, femur = 0, trace = [], result = null;
let now = 0, last = 0, frame = 0, visible = false, touring = true, slow = false, tourClock = 0, tourStep = -1, actions = [], lastShot = "", lastEvent = "", lastEventAt = -10, shake = 0;
const event = (tx) => { lastEvent = tx; lastEventAt = now; };
const BAR = 2.6; // barrier face x
function start() { phase = "drive"; phaseAt = now; xCar = -2.9; v = kmh / 3.6; crush = 0; t = 0; u = 0; w = 0; bagT = 0; chestPk = 0; headG = 0; headV = 0; contact = false; femur = 0; trace = []; result = null; parts = []; }
function setCar(c) { car = c; C = CARS[c]; if (c === "old") bag = false; start(); }
// one millisecond-ish step of the crash: the car crushing, the occupant (torso) held back by belt, bag, wheel
function crashStep(h) {
  const F = v > 0 ? C.F(crush) : 0, a = -F / C.m;
  v = Math.max(-0.6, v + a * h); if (v > 0) crush += v * h; else xCar += v * h;
  t += h;
  // occupant moves relative to the car: u is forward travel, w its speed relative to the car
  const intr = C.intr(crush), colIn = C.col(crush), gap = C.gap - colIn;
  let Fr = 0;
  if (belt) { const slack = car === "new" ? 0.01 : 0.05, kb = car === "new" ? 110e3 : 70e3, cap = car === "new" ? 4.5e3 : 11e3; if (u > slack) Fr += Math.min(cap, kb * (u - slack)) + 900 * Math.max(0, w); }
  if (bag && t > 0.02) { bagT = Math.min(1, (t - 0.02) / 0.025); if (u > 0.18 && bagT > 0.6) Fr += Math.min(belt ? 4.2e3 : 7e3, 60e3 * (u - 0.18)) + 600 * Math.max(0, w); }
  if (u > gap) { Fr += Math.min(52e3, 3.0e5 * (u - gap) + 2.5e3 * Math.max(0, w)); if (!contact && w > 1) { contact = true; headV = w; } }
  const mOcc = 50;
  const relA = -a - Fr / mOcc; // car decelerates, occupant carries on unless something pulls it back
  w += relA * h; u = Math.max(0, u + w * h);
  if (u === 0 && w < 0) w = 0;
  const chest = Fr / mOcc / 9.81;
  chestPk = Math.max(chestPk, chest);
  femur = Math.max(femur, (intr > 0.15 ? 2 + (intr - 0.15) * 22 : 1.5 + (contact ? 1.2 : 0)));
  return { carG: F / C.m / 9.81, chest };
}
function finish() {
  const intr = C.intr(crush);
  // head: hits the wheel or dash unless the bag got there first
  if (contact) headG = Math.max(headG, 40 + headV * headV * 9 + (car === "old" ? 60 : 0));
  else headG = Math.max(headG, 30 + chestPk * 0.6);
  const hic = Math.round(Math.pow(headG / 80, 2.5) * 220);
  const sev = chestPk > 60 || hic > 700 || intr > 0.3 ? (chestPk > 80 || hic > 1000 || intr > 0.45 ? "likely fatal" : "serious injuries") : chestPk > 45 ? "hurt, should be OK" : "walks away";
  result = { chest: Math.round(chestPk), hic, intr: Math.round(intr * 100), femur: femur.toFixed(1), sev, crush: Math.round(crush * 100) };
  const ref = kmh === 64 && ((car === "new" && belt && bag) || car === "old") ? IIHS[car] : null;
  event((car === "old" ? "1959-style" : "2009-style") + " at " + kmh + " km/h: " + sev + ". Chest " + result.chest + " g, footwell pushed in " + result.intr + " cm, front crushed " + result.crush + " cm." + (ref ? " (IIHS measured chest " + ref.chest + " g, footwell " + ref.intr + " cm in the real " + (car === "old" ? "Bel Air" : "Malibu") + ".)" : ""));
}
function physics(dt) {
  if (phase === "drive") {
    // driving up to the barrier at a fixed on-screen pace, then into slow motion
    xCar += dt * 2.4;
    if (xCar + C.L / 2 >= BAR) { xCar = BAR - C.L / 2; phase = "crash"; phaseAt = now; for (let i = 0; i < 60; i++) glass(); for (let i = 0; i < 14; i++) dust(); }
  } else if (phase === "crash") {
    // 1 s on screen is 25 ms of crash
    const sim = dt * 0.025;
    const n = Math.max(1, Math.ceil(sim / 0.0002));
    let last2;
    for (let i = 0; i < n; i++) last2 = crashStep(sim / n);
    trace.push([t * 1000, last2.carG, last2.chest]);
    if (t > 0.17 || (v <= 0 && t > 0.1 && w <= 0.05)) { phase = "done"; phaseAt = now; finish(); }
  } else if (phase === "done") { if (now - phaseAt > 7 && !touring) start(); }
}

// ---------------- drawing ----------------
function glass() { const a = rnd() * Math.PI * 2, k = rnd(); parts.push({ p: [BAR - 0.1, 0.3 + rnd() * 0.7, 0.4 + rnd() * 0.5], v: [-0.5 - rnd() * 3, 0.8 + Math.cos(a) * 2.2, Math.abs(Math.sin(a)) * 3 + 0.5], life: 0, max: 2 + rnd() * 2, s: 0.012 + rnd() * 0.02, c: k < 0.5 ? "#cde4f2" : k < 0.75 ? "#faf5dc" : car === "old" ? "#ebebe8" : "#282a2e" }); }
function dust() { parts.push({ dust: true, p: [BAR - 0.1, 0.2 + rnd() * 1.2, 0.2 + rnd() * 0.5], v: [-0.3 - rnd() * 0.4, rnd() * 0.6 - 0.1, 0.15 + rnd() * 0.2], r: 0.15, life: 0, max: 2.5 + rnd() * 2 }); }
// the two shapes. body: stations along the car [x, half width, bottom, top, corner radius]
const SHAPE = {
  old: { body: [[-2.675, 0.78, 0.45, 0.82, 0.06], [-2.55, 0.9, 0.36, 0.9, 0.1], [-1.7, 0.92, 0.3, 0.95, 0.1], [-0.95, 0.92, 0.3, 0.97, 0.1], [1.15, 0.92, 0.3, 0.97, 0.1], [1.425, 0.92, 0.3, 0.96, 0.1], [1.7, 0.92, 0.3, 0.95, 0.1], [1.95, 0.92, 0.3, 0.94, 0.1], [2.2, 0.92, 0.3, 0.92, 0.1], [2.45, 0.91, 0.32, 0.91, 0.09], [2.6, 0.89, 0.36, 0.89, 0.08], [2.675, 0.84, 0.42, 0.84, 0.06]],
    belt: 0.96, gb: 1.12, r1: 0.55, r2: -0.8, gr: -1.32, wheels: [-1.65, 1.6], trim: "#e9e9e6", seat: "#c8bfa6" },
  new: { body: [[-2.425, 0.8, 0.42, 0.92, 0.08], [-2.3, 0.9, 0.34, 1.0, 0.12], [-1.5, 0.92, 0.28, 1.0, 0.12], [-0.9, 0.92, 0.28, 0.98, 0.12], [1.15, 0.92, 0.28, 0.98, 0.12], [1.375, 0.92, 0.28, 0.95, 0.12], [1.6, 0.92, 0.28, 0.9, 0.12], [1.8, 0.92, 0.28, 0.86, 0.12], [2.0, 0.91, 0.28, 0.82, 0.12], [2.2, 0.88, 0.29, 0.77, 0.12], [2.34, 0.84, 0.31, 0.72, 0.11], [2.425, 0.78, 0.36, 0.66, 0.1]],
    belt: 0.97, gb: 1.2, r1: 0.42, r2: -0.78, gr: -1.52, wheels: [-1.4, 1.42], trim: "#2a2c30", seat: "#2b2d32" },
};
const lightTheme = document.body.dataset.theme === "light";
let yaw = 0, cL = 0, cR = 0, intrNow = 0, wr = 0;
// crush the front (the driver's side deeper), push the front of the cabin back, and wrinkle the metal
function deform(p) {
  const Lh = C.L / 2, fw = Lh - C.front; let x = p[0], y = p[1], z = p[2];
  if (x > fw) { const c = cL + ((cR - cL) * (0.92 - y)) / 1.84, f = (x - fw) / C.front, k = wr * f; x = fw + (x - fw) * (1 - (c / C.front) * 0.92) - intrNow; const tent = wr * Math.sin(Math.PI * Math.min(1, f * 1.15)); if (z > 0.5) z += k * 0.13 * Math.sin(p[0] * 19 + y * 5) + tent * 0.16 * (0.4 + 0.6 * (y + 0.92) / 1.84); else z += k * 0.03 * Math.sin(p[0] * 19 + y * 5); y += k * 0.07 * Math.sin(p[0] * 13 + z * 9) + tent * 0.07 * Math.sign(y) * Math.abs(y) / 0.92; }
  else if (x > fw - 1.2) x -= (intrNow * (x - (fw - 1.2))) / 1.2;
  return [x, y, z];
}
const Wr = (p) => { const c = Math.cos(yaw), s = Math.sin(yaw); return [xCar + cL * 0.92 + p[0] * c - p[1] * s, p[1] * c + p[0] * s, p[2]]; };
const W = (p) => Wr(deform(p));
const secOf = (x, hw, zb, zt, r) => roundPoly([[-hw, zb], [hw, zb], [hw, zt], [-hw, zt]], [r * 0.5, r * 0.5, r, r], 3).map(([y, z]) => [x, y, z]);
const ringAt = (c, ax, r, n = 16) => Array.from({ length: n + 1 }, (_, i) => { const a = (i / n) * Math.PI * 2; return ax === "y" ? [c[0] + r * Math.cos(a), c[1], c[2] + r * Math.sin(a)] : [c[0], c[1] + r * Math.cos(a), c[2] + r * Math.sin(a)]; });
function carObjects() {
  const old = car === "old", S = SHAPE[car], Lh = C.L / 2, fw = Lh - C.front, O = [], Pn = { mat: "paint" };
  const add = (parts, o = {}) => O.push({ parts: Array.isArray(parts) ? parts : [parts], xf: W, ...o });
  // body shell: one skin over the stations, then roof, pillars and glass
  add(loft(S.body.map((s) => secOf(...s)), C.paint, Pn), { shell: true });
  const zr = 1.44, rw = 0.72, bz = S.belt;
  add([prism(E.rrect(S.r2, S.r1, -rw, rw, 0.14), "z", zr - 0.03, zr + 0.025, C.roof, Pn)], { shell: true });
  const pil = (x0, x1) => [-1, 1].map((sg) => tube([[x0, sg * 0.86, bz], [x1, sg * (rw - 0.02), zr - 0.02]], 0.035, C.roof, Pn));
  add([...pil(S.gb, S.r1), ...pil(S.gr, S.r2), ...(old ? [] : pil(-0.22, -0.2))], { shell: true });
  add(loft([[S.gb, 0.86, bz, bz + 0.02], [S.r1 + 0.02, rw, bz, zr - 0.03], [S.r2 - 0.02, rw, bz, zr - 0.03], [S.gr, 0.86, bz, bz + 0.02]].map(([x, hw, z0, z1]) => secOf(x, hw, z0, z1, 0.06)), "#a9cbe0", { mat: "glass", opacity: lightTheme ? 0.3 : 0.22, caps: false }));
  // bumpers, grille, lights, fins
  const chrome = { mat: "chrome" }, bc = old ? "#dfe3e6" : "#1e1f22", bm = old ? chrome : { mat: "plastic" };
  add([prism(roundPoly([[Lh - 0.06, -0.95], [Lh + 0.09, -0.9], [Lh + 0.09, 0.9], [Lh - 0.06, 0.95]], 0.05, 2), "z", old ? 0.34 : 0.3, old ? 0.5 : 0.52, bc, bm), prism(roundPoly([[-Lh + 0.06, -0.95], [-Lh - 0.09, -0.9], [-Lh - 0.09, 0.9], [-Lh + 0.06, 0.95]], 0.05, 2), "z", old ? 0.36 : 0.34, old ? 0.52 : 0.54, bc, bm)]);
  if (old) {
    add([box(Lh - 0.01, Lh + 0.025, -0.5, 0.5, 0.54, 0.76, "#cfd4d8", chrome), ...[-1, 1].map((sg) => lathe([[0, 0], [0.1, 0], [0.115, 0.03], [0, 0.05]], "#efe9cf", { c: [Lh - 0.005, sg * 0.66, 0.7], axis: "x", mat: "plastic", emit: ["#fff3c0", 0.04], seg: 16 })),
      ...[-1, 1].flatMap((sg) => [prism([[-Lh + 0.08, 0.95], [-Lh + 1.15, 0.95], [-Lh + 0.02, 1.16]], "y", sg > 0 ? 0.8 : -0.9, sg > 0 ? 0.9 : -0.8, C.paint, Pn), box(-Lh - 0.012, -Lh + 0.01, sg * 0.84 - 0.06, sg * 0.84 + 0.06, 0.84, 1.1, "#7a1010", { emit: ["#ff2a1a", 0.12], bevel: 0 })])]);
    add(box(-0.9, 1.9, 0.921, 0.93, 0.6, 0.63, "#dfe3e6", chrome)); add(box(-0.9, 1.9, -0.93, -0.921, 0.6, 0.63, "#dfe3e6", chrome));
  } else {
    add([...[-1, 1].map((sg) => prism([[Lh - 0.2, sg * 0.5], [Lh - 0.02, sg * 0.5], [Lh - 0.08, sg * 0.86], [Lh - 0.3, sg * 0.88]], "z", 0.6, 0.7, "#e6eaee", { mat: "plastic", emit: ["#eaf4ff", 0.03] })), box(Lh + 0.085, Lh + 0.095, -0.45, 0.45, 0.36, 0.48, "#0c0d0f", { mat: "matte", bevel: 0 }),
      ...[-1, 1].map((sg) => box(-Lh - 0.012, -Lh + 0.01, sg * 0.66 - 0.2, sg * 0.66 + 0.2, 0.78, 0.9, "#7a1010", { emit: ["#ff2a1a", 0.12], bevel: 0 }))]);
  }
  // wheels: a dark arch, tyre (whitewalls on the old one), hubcap
  for (const wx of S.wheels) for (const sg of [-1, 1]) {
    const hub = [wx, sg * 0.845, 0.34], out = sg * 0.1;
    add(prism(Array.from({ length: 15 }, (_, i) => [wx + 0.43 * Math.cos((Math.PI * i) / 14), 0.34 + 0.43 * Math.sin((Math.PI * i) / 14)]), "y", sg * 0.918, sg * 0.926, "#0a0a0b", { mat: "matte", bevel: 0 }));
    add([lathe([[0.2, -0.1], [0.3, -0.105], [0.335, -0.08], [0.34, -0.04], [0.34, 0.04], [0.335, 0.08], [0.3, 0.105], [0.2, 0.1]], "#131416", { c: hub, axis: "y", mat: "rubber", seg: 26 }),
      lathe([[0, out + sg * 0.03], [0.1, out + sg * 0.025], [0.2, out - sg * 0.01], [0.205, out - sg * 0.03]], old ? "#e2e5e8" : "#9aa1a8", { c: hub, axis: "y", mat: old ? "chrome" : "metal", seg: 26 }),
      old ? lathe([[0.225, out + sg * 0.004], [0.3, out + sg * 0.007]], "#f1efe8", { c: hub, axis: "y", mat: "matte", seg: 26 }) : null]);
  }
  // inside, on the rigid floor: seats, dashboard (pushed back by the firewall), steering column and wheel
  const fwI = fw - intrNow, col = C.col(crush), sx = -0.45, yD = 0.45, rb = S.gr + 0.3, seat = S.seat, St = { mat: "matte" };
  const cushion = (x0, y0, y1) => [prism(E.rrect(x0 - 0.3, x0 + 0.26, y0, y1, 0.06), "z", 0.34, 0.56, seat, St), prism(roundPoly([[x0 - 0.36, 0.5], [x0 - 0.2, 0.5], [x0 - 0.3, 1.22], [x0 - 0.46, 1.22]], 0.05, 2), "y", y0, y1, seat, St)];
  const inside = [box(-Lh + 0.5, fwI, -0.86, 0.86, 0.29, 0.34, "#2b2d31", St), ...(old ? cushion(sx, -0.78, 0.78) : [...cushion(sx, 0.16, 0.76), ...cushion(sx, -0.76, -0.16)]), ...cushion(rb + 0.3, -0.78, 0.78),
    prism(roundPoly([[fwI - 0.55, 0.62], [fwI, 0.5], [fwI, 0.95], [fwI - 0.25, 0.98], [fwI - 0.55, 0.88]], 0.04, 2), "y", -0.84, 0.84, S.trim, { mat: "plastic" })];
  const wc = [fwI - 0.52 - col * 0.5, yD, 1.0 + col * 0.35], ax = nrm3([-0.86, 0, 0.5]);
  inside.push(tube([[fwI - 0.2, yD, 0.82 + col * 0.1], wc], 0.03, "#3a3d42", { mat: "steel" }));
  const u1 = [0, 1, 0], u2 = [ax[2], 0, -ax[0]];
  inside.push(tube(Array.from({ length: 19 }, (_, i) => { const a = (i / 18) * Math.PI * 2, c = Math.cos(a) * 0.19, s = Math.sin(a) * 0.19; return [wc[0] + u1[0] * c + u2[0] * s, wc[1] + u1[1] * c + u2[1] * s, wc[2] + u1[2] * c + u2[2] * s]; }), 0.018, old ? "#e8e2cc" : "#17181b", { mat: "gloss", seg: 6 }), tube([[wc[0], wc[1] - 0.18, wc[2]], [wc[0], wc[1] + 0.18, wc[2]]], 0.014, old ? "#e8e2cc" : "#17181b", { mat: "gloss", seg: 6 }));
  O.push({ parts: inside, xf: Wr });
  // the dummy
  const hip = [sx - 0.06 + u * 0.55, yD, 0.66], lean = clamp(u * 1.5, 0, 1.15);
  const sh = [hip[0] + 0.5 * Math.sin(0.18 + lean), yD, hip[2] + 0.5 * Math.cos(0.18 + lean)];
  const hl = 0.18 + lean * 1.1 + (contact ? 0.35 : 0), hd = [sh[0] + 0.26 * Math.sin(hl), yD, sh[2] + 0.26 * Math.cos(hl)];
  const knee = [hip[0] + 0.46, yD, 0.72], foot = [Math.min(fwI - 0.12, hip[0] + 0.9), yD, 0.46 + clamp(intrNow * 0.5, 0, 0.25)];
  const DY = "#e3aa32", DJ = "#1d1e21", Dm = { mat: "plastic" }, body = [];
  body.push(tube([hip, sh], [0.14, 0.16], DY, Dm), sphere(sh, 0.165, DY, { ...Dm, squash: [0.75, 1.25, 0.6] }), tube([sh, hd], 0.05, DJ, Dm), sphere(hd, 0.115, DY, { mat: "plastic", lat: 9, lon: 14 }), lathe([[0, 0], [0.045, 0], [0.045, 0.006], [0, 0.006]], DJ, { c: [hd[0], yD + 0.112, hd[2]], axis: "y", seg: 12, flat: true }));
  for (const sg of [-1, 1]) {
    const o = sg * 0.11, hand = [wc[0] + u2[0] * 0.05, wc[1] + sg * 0.17, wc[2] + u2[2] * 0.05], shs = [sh[0], yD + sg * 0.2, sh[2] - 0.03], el = [(shs[0] + hand[0]) / 2, yD + sg * 0.26, (shs[2] + hand[2]) / 2 - 0.12];
    body.push(tube([[hip[0], yD + o, hip[2]], [knee[0], yD + o, knee[2]]], [0.085, 0.07], DY, Dm), sphere([knee[0], yD + o, knee[2]], 0.075, DJ, Dm), tube([[knee[0], yD + o, knee[2]], [foot[0], yD + o, foot[2]]], [0.06, 0.05], DY, Dm), tube([[foot[0], yD + o, foot[2] - 0.03], [foot[0] + 0.16, yD + o, foot[2] + 0.02]], 0.045, DJ, Dm),
      tube([shs, el], 0.055, DY, Dm), sphere(el, 0.055, DJ, Dm), tube([el, hand], 0.045, DY, Dm));
  }
  if (belt) { const B = "#27467e", Bm = { mat: "matte", seg: 5 }; body.push(tube([[hip[0] - 0.02, yD + 0.26, hip[2] + 0.04], [hip[0] + 0.12, yD + 0.1, hip[2] + 0.16], [hip[0] + 0.12, yD - 0.1, hip[2] + 0.16], [hip[0] - 0.02, yD - 0.24, hip[2] + 0.04]], 0.02, B, Bm)); if (!old) body.push(tube([[sx - 0.3, 0.84, 1.16], [sh[0] + 0.02, yD + 0.15, sh[2] + 0.1], [(sh[0] + hip[0]) / 2 + 0.14, yD, (sh[2] + hip[2]) / 2 + 0.03], [hip[0] + 0.05, yD - 0.24, hip[2] + 0.04]], 0.02, B, Bm)); }
  if (bag && bagT > 0) { const r = 0.3 * bagT * (u > 0.2 ? 0.86 : 1); body.push(sphere([wc[0] + ax[0] * 0.2 * bagT, yD, wc[2] + ax[2] * 0.2 * bagT], r, "#f1f3f5", { mat: "matte", squash: [0.7, 1, 1], lat: 9, lon: 14 })); }
  O.push({ parts: body, xf: Wr });
  return { O, fw, fwI, wc, hd, hip };
}
const nrm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
function draw(dt) {
  const old = car === "old";
  cL = crush * 0.95; cR = crush * clamp(0.15 + crush * 0.3, 0, 0.6); intrNow = C.intr(crush); wr = clamp(crush * 2.6, 0, 1);
  yaw = phase === "drive" ? 0 : clamp(crush * 0.09, 0, 0.12) + (phase === "done" ? 0.02 * Math.min(1, now - phaseAt) : 0);
  const objs = [], X0 = -5;
  // the test track: lane lines, and the barrier with its crushable honeycomb face over the driver's side
  const deco = []; for (let x = X0; x < 2.0; x += 1.4) for (const yy of [-1.6, 1.6]) deco.push(box(x, x + 0.7, yy - 0.03, yy + 0.03, 0.004, 0.004, "#e9e4c8", { mat: "matte" }));
  const hb = phase === "drive" ? 0 : clamp(cL * 0.45, 0, 0.5);
  deco.push(box(BAR + 0.6, BAR + 1.5, 0.15, 2.1, 0, 1.2, "#9a958c", { mat: "concrete" }), box(BAR + hb * 0.9, BAR + 0.6, 0.2, 2.05, 0.2, 0.9, "#cdb54e", { mat: "steel" }));
  for (let n = 0; n < 4; n++) deco.push(box(BAR + hb * 0.9 - 0.004, BAR + hb * 0.9, 0.3 + n * 0.46, 0.5 + n * 0.46, 0.2, 0.9, "#1b1c1e", { mat: "matte", bevel: 0 }));
  objs.push({ parts: deco });
  const cr = carObjects(); for (const o of cr.O) objs.push(o);
  let svg = E.render(objs);
  // glass and dust
  const pdt = phase === "crash" ? dt * 0.08 : dt;
  parts = parts.filter((p) => {
    p.life += pdt; if (p.life > p.max) return false;
    if (p.dust) { p.r += pdt * 0.7; for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * pdt; E.sprite(p.p, p.r, lightTheme ? "#8f877a" : "#beb4a0", 0.17 * (1 - p.life / p.max)); return true; }
    p.v[2] -= 9.8 * pdt; for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * pdt; if (p.p[2] < 0.02) { p.p[2] = 0.02; p.v = [p.v[0] * 0.3, p.v[1] * 0.3, 0]; }
    E.sprite(p.p, p.s, p.c, 0.95, false, 1); return true;
  });
  if (E.xray > 0.02) svg += E.callouts([
    { p: W([cr.fw + C.front * 0.55, -0.5, old ? 0.95 : 0.88]), text: "Front end", sub: old ? "short and soft: it runs out early" : "crumple zone: crushes on purpose" },
    { p: Wr([0.1, -0.74, 1.44]), text: old ? "Cabin" : "Safety cage", sub: old ? "folds once the front is used up" : "stays stiff so the cabin keeps its shape" },
    { p: Wr(cr.wc), text: bag ? "Airbag" : "Steering wheel", sub: bag ? "full in about 45 ms" : old ? "the column comes back at the chest" : "" },
    { p: Wr([cr.hip[0], 0.72, 0.68]), text: belt ? (old ? "Lap belt" : "Seatbelt") : "No belt", sub: belt ? "ties you to the car's slowing-down" : "you carry on at the original speed" },
    { p: Wr([cr.fwI - 0.15, 0.45, 0.42]), text: "Footwell", sub: "pushed in " + Math.round(intrNow * 100) + " cm" },
  ], E.xray, E.fs < 0.62 ? {} : { topL: 210 });
  sceneG.innerHTML = svg;
  drawGraph();
  const text = phase === "crash" ? (t * 1000).toFixed(0) + " ms · " + Math.max(0, v * 3.6).toFixed(0) + " km/h · chest " + Math.round(trace.length ? trace[trace.length - 1][2] : 0) + " g" : phase === "done" && result ? result.sev.toUpperCase() : (old ? "1959-STYLE" : "2009-STYLE") + " · " + kmh + " km/h";
  if (readout.textContent !== text) readout.textContent = text;
}
function drawGraph() {
  const r = gcv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1), w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr)); if (gcv.width !== w || gcv.height !== h) { gcv.width = w; gcv.height = h; }
  const light = document.body.dataset.theme === "light";
  gctx.setTransform(1, 0, 0, 1, 0, 0); gctx.clearRect(0, 0, w, h);
  const X = (ms) => 6 * dpr + (ms / 170) * (w - 12 * dpr), Y = (g) => h - 8 * dpr - (g / 110) * (h - 22 * dpr);
  gctx.strokeStyle = "rgba(255,90,60,0.6)"; gctx.setLineDash([4 * dpr, 4 * dpr]); gctx.beginPath(); gctx.moveTo(X(0), Y(60)); gctx.lineTo(X(170), Y(60)); gctx.stroke(); gctx.setLineDash([]);
  gctx.font = Math.round(9 * dpr) + "px ui-monospace,monospace"; gctx.fillStyle = light ? "#3a4048" : "#aab3bc";
  gctx.fillText("g · car (grey) · chest (orange) · 60 g limit", 6 * dpr, 11 * dpr);
  for (const [k2, col] of [[1, light ? "#7a8088" : "#9aa1a8"], [2, "#ff8a3d"]]) { gctx.strokeStyle = col; gctx.lineWidth = 1.6 * dpr; gctx.beginPath(); trace.forEach((p, i) => (i ? gctx.lineTo(X(p[0]), Y(p[k2])) : gctx.moveTo(X(p[0]), Y(p[k2])))); gctx.stroke(); }
}

// ---------------- UI ----------------
const ui = {
  cars: [...document.querySelectorAll("[data-car]")], spd: document.querySelector("#spd"), spdOut: document.querySelector("#spd-out"), beltB: document.querySelector("#belt"), bagB: document.querySelector("#bag"), go: document.querySelector("#go"),
  slow: document.querySelector("#slow"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"),
  cF: document.querySelector("#c-fill"), cO: document.querySelector("#c-out"), hF: document.querySelector("#h-fill"), hO: document.querySelector("#h-out"), iF: document.querySelector("#i-fill"), iO: document.querySelector("#i-out"), stats: document.querySelector("#stats"),
};
const say = (tx) => { if (tx !== lastShot) { ui.shot.textContent = tx; lastShot = tx; } };
function syncUi() {
  ui.cars.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.car === car)));
  if (document.activeElement !== ui.spd) ui.spd.value = String(kmh); ui.spdOut.textContent = kmh + " km/h";
  ui.beltB.setAttribute("aria-pressed", String(belt)); ui.beltB.textContent = belt ? (car === "old" ? "Lap belt on" : "Seatbelt on") : "No belt";
  ui.bagB.setAttribute("aria-pressed", String(bag)); ui.bagB.textContent = car === "old" ? "No airbag (1959)" : bag ? "Airbag on" : "Airbag off"; ui.bagB.disabled = car === "old";
  const ch = result ? result.chest : chestPk;
  ui.cF.style.width = clamp(ch / 110 * 100, 0, 100).toFixed(1) + "%"; ui.cF.dataset.state = ch > 60 ? "bad" : ch > 45 ? "warn" : "ok"; ui.cO.textContent = Math.round(ch) + " g";
  const hic = result ? result.hic : 0; ui.hF.style.width = clamp(hic / 1200 * 100, 0, 100).toFixed(1) + "%"; ui.hF.dataset.state = hic > 700 ? "bad" : hic > 500 ? "warn" : "ok"; ui.hO.textContent = result ? String(hic) : "-";
  const intr = Math.round(C.intr(crush) * 100); ui.iF.style.width = clamp(intr / 70 * 100, 0, 100).toFixed(1) + "%"; ui.iF.dataset.state = intr > 30 ? "bad" : intr > 15 ? "warn" : "ok"; ui.iO.textContent = intr + " cm";
  const ke = 0.5 * C.m * (kmh / 3.6) ** 2 / 1000;
  ui.stats.innerHTML = "<b>" + C.name + "</b>, " + C.m.toLocaleString("en-AU") + " kg · " + Math.round(ke) + " kJ to get rid of · front crushed <b>" + Math.round(crush * 100) + " cm</b>" + (car === "old" ? " · IIHS Bel Air: chest <b>85 g</b>, footwell <b>62 cm</b>" : " · IIHS Malibu: chest <b>41 g</b>, footwell <b>7 cm</b>");
  ui.slow.setAttribute("aria-pressed", String(slow)); ui.tour.setAttribute("aria-pressed", String(touring));
}
function story() {
  if (now - lastEventAt < 7 && lastEvent) return say(lastEvent);
  if (touring && tourStep >= 0 && TOUR[tourStep].say) return say(TOUR[tourStep].say);
  if (phase === "crash") return say(car === "old" ? "The front's soft and short, then the cabin starts folding: the firewall, the floor and the steering column come back at the driver." : "The front end crushes on purpose, a long, steady crumple that takes the energy, while the cage round the driver stays put.");
  return say("A crash is getting rid of ½mv² over a distance: the more distance, the fewer g. Pick a car and press Crash.");
}
const TOUR = [
  { say: "A 2009-style sedan, belted, airbag, into an offset barrier at 64 km/h: the IIHS test speed.", acts: [[0, () => { setCar("new"); belt = true; bag = true; kmh = 64; start(); }], [15, null]] },
  { say: "Now a 1959-style sedan at the same speed, no belt, no airbag.", acts: [[0, () => { setCar("old"); belt = false; kmh = 64; start(); }], [15, null]] },
  { say: "The modern car again, but no seatbelt. The airbag's designed to work with the belt, not instead of it.", acts: [[0, () => { setCar("new"); belt = false; bag = true; kmh = 64; start(); }], [15, null]] },
  { say: "Belted, airbag, 100 km/h: two and a half times the energy of 64.", acts: [[0, () => { setCar("new"); belt = true; bag = true; kmh = 100; start(); }], [15, null]] },
];
function tourTick() {
  if (tourStep < 0 || !actions.length) { tourStep = (tourStep + 1) % TOUR.length; actions = TOUR[tourStep].acts.map(([w2, fn]) => [tourClock + w2, fn]); }
  while (actions.length && tourClock >= actions[0][0]) { const fn = actions.shift()[1]; if (fn) fn(); else actions = []; }
}
function tick(tm) {
  const dt = last ? Math.min((tm - last) / 1000, 1 / 30) : 1 / 60;
  last = tm;
  const sdt = dt * (slow ? 0.25 : 1);
  now += sdt;
  if (touring) { tourClock += sdt; tourTick(); }
  physics(sdt); draw(sdt); syncUi(); story();
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { if (touring) { touring = false; actions = []; tourStep = -1; } };
const act = (fn) => (...a) => { takeOver(); fn(...a); syncUi(); run(); };
ui.cars.forEach((b) => b.addEventListener("click", act(() => setCar(b.dataset.car))));
ui.spd.addEventListener("input", act(() => { kmh = +ui.spd.value; if (phase !== "crash") start(); }));
ui.beltB.addEventListener("click", act(() => { belt = !belt; start(); }));
ui.bagB.addEventListener("click", act(() => { if (car === "new") { bag = !bag; start(); } }));
ui.go.addEventListener("click", act(() => start()));
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; actions = []; } syncUi(); run(); });
stage.addEventListener("keydown", (ev) => {
  const map = { x: () => setX(!E.xrayOn), " ": () => start(), b: () => { belt = !belt; start(); }, a: () => { if (car === "new") { bag = !bag; start(); } }, o: () => setCar("old"), n: () => setCar("new"), ArrowUp: () => { kmh = Math.min(120, kmh + 5); start(); }, ArrowDown: () => { kmh = Math.max(20, kmh - 5); start(); } };
  if (map[ev.key]) { ev.preventDefault(); act(map[ev.key])(); }
});
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;
window.__fig = { E, freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
setX(true); start(); draw(0); syncUi(); story();
`;

const CSS = `.g-wrap{width:33%;aspect-ratio:2.1/1}@media (max-width:560px){.g-wrap{width:52%}}`;

const stage = stageHtml({
  W, H, fig: "Fig 26", title: "Car crash",
  label: "A sedan driving into an offset crash barrier on a test track, with a crash dummy at the wheel. The car can be a 1959-style sedan or a 2009-style one, and an x-ray mode turns the bodywork to glass to show the dummy, the seatbelt, the airbag and the cabin.",
  keysHelp: "Car crash: drag to rotate, X for x-ray, space to crash, O and N pick the old or new car, B the belt, A the airbag, up and down the speed",
  extra: `<div class="mk-inset g-wrap" aria-hidden="true"><canvas class="g-cv"></canvas></div>`,
});

const CONTROLS = `<div class="ctl" role="group" aria-label="Controls">
  <div class="ctl-row"><span class="ctl-label">Car</span><button type="button" data-car="old">1959-style<small>big, chrome, no plan</small></button><button type="button" data-car="new" aria-pressed="true">2009-style<small>crumple zone + cage</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Speed</span><div class="slide"><input id="spd" type="range" min="20" max="120" step="2" value="64" aria-label="Impact speed, km/h"></div><output id="spd-out">64 km/h</output></div>
  <div class="ctl-row"><span class="ctl-label">Restraint</span><button type="button" id="belt" aria-pressed="true">Seatbelt on</button><button type="button" id="bag" aria-pressed="true">Airbag on</button><button type="button" id="go" class="danger">Crash<small>space</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Chest</span><div class="meter"><span id="c-fill" class="fill"></span><span class="mark" style="left:${(60 / 110 * 100).toFixed(1)}%" data-label="60 g"></span></div><output id="c-out">0 g</output></div>
  <div class="ctl-row"><span class="ctl-label">Head</span><div class="meter"><span id="h-fill" class="fill"></span><span class="mark" style="left:${(700 / 1200 * 100).toFixed(1)}%" data-label="HIC 700"></span></div><output id="h-out">-</output></div>
  <div class="ctl-row"><span class="ctl-label">Intrusion</span><div class="meter"><span id="i-fill" class="fill"></span></div><output id="i-out">0 cm</output></div>
  <div class="ctl-row wide"><span class="ctl-label">Numbers</span><span id="stats"></span></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="slow" aria-pressed="false">Even slower</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
</div>`;


const foot = footHtml({
  theme, slug: "crash",
  real: "½mv² against crush distance, crumple zones and safety cages, belts with pretensioners and load limiters, airbags timed to fire in about 20 ms, the 60 g chest and HIC 700 head limits (FMVSS 208), and the IIHS 2009 test of a 1959 Chevrolet Bel Air against a 2009 Chevrolet Malibu at 40 mph each. The IIHS figures quoted (chest 85 g against 41 g, footwell intrusion 62 cm against 7 cm) are from its published crash data.",
  made: "the cars, the force curves, the one-dimensional dummy, the injury labels and the head numbers; the barrier here stands in for the other car.",
});
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), pageMk2({
  k, title: "Car crash", fig: "Fig 26", hint: "Same crash, fifty years apart", theme, W, H, stage, controls: CONTROLS, css: CSS, foot,
  caption: "A crash is just getting rid of the car's energy, ½mv², over some distance. Stop over a metre and it's a few tens of g; stop over a few centimetres and it's hundreds. A modern car crushes a long front end on purpose, at a steady force, while keeping a stiff cage round the people so the dashboard and footwell don't come to meet them. The seatbelt ties you to that slowing-down from the first moment, and the airbag spreads the last of it over your chest and head. Without them you keep going at the original speed until you hit the inside of the car.",
  script: LIVE.replace("__DATA__", JSON.stringify(DATA)),
}));
console.log("wrote", name);
