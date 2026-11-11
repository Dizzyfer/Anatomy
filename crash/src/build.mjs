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

// Truth: a crash is getting rid of kinetic energy (½mv²) over a distance; the longer the distance, the lower the g. A
// modern car crushes a long, controlled front end and keeps a stiff cage round the people; restraints tie the occupant to
// that slowing-down instead of letting them hit the inside at full speed. IIHS crashed a 1959 Chevrolet Bel Air into a
// 2009 Chevrolet Malibu at 40 mph each (2009): the IIHS readings quoted here are from its published crash data.
// Toy: one-dimensional crush and occupant models with made-up force curves, tuned to land near those numbers.
const PLATE = { x: -6.6, y: -2.6, w: 12, d: 6.2, r: 0.5 };
const PLATE_H = 0.5, FOOT_H = 0.25;
const P = k.fitProjection([...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [-6, -2, 1.6], [5, 3, 1.6], [5, -2, 1.6]], W, H, { pad: 10, azimuth: 45 });
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
  // lane markings on the test track
  const m = [];
  for (let x = -6.2; x < 2.6; x += 1.4) { m.push(k.segment([x, -1.6, 0.01], [x + 0.7, -1.6, 0.01], P)); m.push(k.segment([x, 1.6, 0.01], [x + 0.7, 1.6, 0.01], P)); }
  out.push(`<path class="lane" d="${m.join("")}"/>`);
  return out.join("");
}
const svg = k.figureSvg({
  width: W, height: H,
  label: "A sedan driving into an offset crash barrier on a test track, with its side cut away to show the crash dummy, the seat, the steering wheel and the dashboard. The car can be a 1959-style sedan or a 2009-style one.",
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
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const R = solids((p) => iso(p, PR), (p) => depthOf(p, PR));
const { box, cyl, prism } = R;
const svgEl = stage.querySelector("svg"), cv = stage.querySelector(".fx-smoke"), ctx = cv.getContext("2d");
const gcv = stage.querySelector(".g-cv"), gctx = gcv.getContext("2d");
const sceneG = q("scene");
const sp = (p) => { const a = iso(p, PR); return a[0].toFixed(1) + " " + a[1].toFixed(1); };
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
const BAR = 2.9; // barrier face x
function start() { phase = "drive"; phaseAt = now; xCar = -3.6; v = kmh / 3.6; crush = 0; t = 0; u = 0; w = 0; bagT = 0; chestPk = 0; headG = 0; headV = 0; contact = false; femur = 0; trace = []; result = null; parts = []; }
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
function glass() { const a = rnd() * Math.PI * 2, k = rnd(); parts.push({ p: [BAR - 0.1, 0.3 + rnd() * 0.7, 0.4 + rnd() * 0.5], v: [-0.5 - rnd() * 3, 0.8 + Math.cos(a) * 2.2, Math.abs(Math.sin(a)) * 3 + 0.5], life: 0, max: 2 + rnd() * 2, s: 0.7 + rnd() * 1.1, c: k < 0.5 ? "rgba(205,228,242,.9)" : k < 0.75 ? "rgba(250,245,220,.9)" : car === "old" ? "rgba(235,235,232,.95)" : "rgba(40,42,46,.95)" }); }
function dust() { parts.push({ dust: true, p: [BAR - 0.1, rnd() * 1.4, 0.2 + rnd() * 0.5], v: [-0.3 - rnd() * 0.4, rnd() * 0.6 - 0.1, 0.15 + rnd() * 0.2], r: 0.15, life: 0, max: 2.5 + rnd() * 2 }); }
function carObj() {}
// local car coords: x forward (front +x), y left (driver at +y), z up. W() takes them to the world, with the car's yaw.
let yaw = 0;
const W = (p) => { const c = Math.cos(yaw), s = Math.sin(yaw); return [xCar + p[0] * c - p[1] * s, p[1] * c + p[0] * s, p[2]]; };
const PX = (() => { const a = iso([0, 0, 0], PR), b = iso([1, 0, 0], PR); return Math.hypot(b[0] - a[0], b[1] - a[1]); })();
const sp2 = (p) => sp(W(p));
function draw(dt) {
  const old = car === "old", Lh = C.L / 2, fw = Lh - C.front, rw = old ? -1.2 : -1.35;
  const intr = C.intr(crush), col = C.col(crush);
  // offset hit: the driver's side (+y) takes most of the crush, the far side less
  const cL = crush * 0.95, cR = crush * clamp(0.15 + crush * 0.3, 0, 0.6);
  yaw = phase === "drive" ? 0 : clamp(crush * 0.09, 0, 0.12) + (phase === "done" ? 0.02 * Math.min(1, (now - phaseAt)) : 0);
  const fx = (y) => Lh - (cL + (cR - cL) * (0.9 - y) / 1.8); // front face x at width y
  const glassC = "#9fc4dc", trim = old ? "#e9e9e6" : "#2a2c30", cutC = "#e7d6ad";
  const fwI = fw - intr; // firewall, pushed back
  const objs = [];
  const add = (parts, key) => objs.push({ parts: Array.isArray(parts) ? parts : [parts], xf: W, key });
  const kAt = (p) => depthOf(W(p), PR);
  // floor pan and sills (the tub), whole width
  add(prism([[rw, 0.28], [fwI, 0.28], [fwI, 0.42], [rw, 0.42]], "y", -0.9, 0.9, "#34373c", { cap: "#3c4046" }), -1e6);
  // rear end: boot and rear wings, full width, beltline height
  const rear = old ? [[-Lh, 0.32], [rw, 0.32], [rw, 0.92], [-Lh + 0.3, 0.98], [-Lh, 0.85]] : [[-Lh, 0.35], [rw, 0.35], [rw, 0.95], [-Lh + 0.35, 1.0], [-Lh, 0.88]];
  add(prism(rear, "y", -0.9, 0.9, C.paint), kAt([rw - 0.6, 0, 0.6]));
  if (old) for (const yy of [-0.9, 0.82]) add(prism([[-Lh + 0.1, 0.98], [-Lh + 0.9, 0.98], [-Lh + 0.05, 1.12]], "y", yy, yy + 0.08, C.paint), kAt([-Lh + 0.4, yy, 1]));
  // far door, full height up to the beltline
  add(prism([[rw, 0.42], [fwI, 0.42], [fwI, 0.92], [rw, 0.92]], "y", -0.9, -0.8, C.paint, { cap: cutC }), kAt([0, -0.85, 0.6]) - 50);
  // near side: only the rear door survives the cutaway, plus the sill
  add(prism([[rw, 0.42], [-0.85, 0.42], [-0.85, 0.92], [rw, 0.92]], "y", 0.8, 0.9, C.paint, { cap: cutC }), kAt([-1.1, 0.85, 0.6]));
  // greenhouse: far half of the roof, far glass, pillars
  const rf0 = old ? -0.95 : -1.05, rf1 = old ? 0.55 : 0.4, zr = old ? 1.42 : 1.45;
  add(prism([[rf0, zr - 0.05], [rf1, zr - 0.05], [rf1, zr], [rf0, zr]], "y", -0.9, 0.05, C.roof, { cap: cutC }), kAt([0, -0.4, zr]) + 30);
  add(prism([[rw + 0.15, 0.92], [rf0, zr - 0.05], [rf1, zr - 0.05], [fwI - 0.15, 0.92]], "y", -0.86, -0.84, glassC, { opacity: 0.35 }), kAt([0, -0.85, 1.2]) - 40);
  for (const yy of [-0.9, 0.8]) add(prism([[rw + 0.05, 0.92], [rw + 0.3, 0.92], [rf0 + 0.15, zr - 0.05], [rf0 - 0.05, zr - 0.05]], "y", yy, yy + 0.1, C.roof), kAt([rw, yy, 1.2]));
  add(prism([[fwI - 0.3, 0.92], [fwI - 0.15, 0.92], [rf1, zr - 0.05], [rf1 - 0.12, zr - 0.05]], "y", -0.9, -0.8, C.roof), kAt([fwI - 0.2, -0.85, 1.2]) - 30);
  // windscreen, far half
  add(prism([[fwI - 0.15, 0.92], [rf1, zr - 0.05], [rf1 + 0.02, zr - 0.07], [fwI - 0.1, 0.92]], "y", -0.84, 0.05, glassC, { opacity: 0.3 }), kAt([fwI, -0.4, 1.1]) - 20);
  // rear window and parcel shelf
  add(prism([[rw + 0.15, 0.92], [rf0, zr - 0.05], [rf0 + 0.04, zr - 0.07], [rw + 0.22, 0.92]], "y", -0.84, 0.8, glassC, { opacity: 0.3 }), kAt([rw, 0, 1.1]) - 60);
  // seats: rear bench, driver and passenger
  add([prism([[rw + 0.05, 0.42], [rw + 0.6, 0.42], [rw + 0.6, 0.6], [rw + 0.05, 0.6]], "y", -0.8, 0.8, old ? "#c8bfa6" : "#2b2d32"), prism([[rw + 0.05, 0.6], [rw + 0.22, 0.6], [rw + 0.22, 1.05], [rw + 0.08, 1.05]], "y", -0.8, 0.8, old ? "#c8bfa6" : "#2b2d32")], kAt([rw + 0.3, 0, 0.6]) - 80);
  const sx = -0.45;
  const seat = (y0, y1) => [prism([[sx - 0.3, 0.42], [sx + 0.25, 0.42], [sx + 0.25, 0.6], [sx - 0.3, 0.6]], "y", y0, y1, old ? "#c8bfa6" : "#2b2d32"), prism([[sx - 0.34, 0.6], [sx - 0.2, 0.6], [sx - 0.3, 1.2], [sx - 0.44, 1.2]], "y", y0, y1, old ? "#c8bfa6" : "#2b2d32")];
  add(seat(-0.75, -0.15), kAt([sx, -0.45, 0.6]));
  if (!old) add(seat(0.18, 0.72), kAt([sx - 0.3, 0.45, 0.6]) - 1); else add(seat(-0.15, 0.72), kAt([sx - 0.3, 0.45, 0.6]) - 1);
  // dashboard and firewall
  add(prism([[fwI - 0.55, 0.62], [fwI, 0.5], [fwI, 0.95], [fwI - 0.25, 0.98], [fwI - 0.55, 0.88]], "y", -0.8, 0.8, trim, { cap: cutC }), kAt([fwI - 0.3, -0.2, 0.8]));
  // engine bay / bonnet: plan-view prism so the driver's corner can crush deeper than the far one
  const zb = old ? 0.86 : 0.92, fold = clamp(crush * 0.9, 0, 0.3);
  const nose = [[fw, -0.9], [fx(-0.9), -0.9], [fx(-0.3), -0.3], [fx(0.3), 0.3], [fx(0.9), 0.9], [fw, 0.9]];
  add(prism(nose, "z", 0.3, zb, C.paint, { cap: C.paint }), kAt([fw + 0.6, 0, 0.6]) + 40);
  // the crumpled bonnet rising in a peak over the driver's side
  if (fold > 0.02) { const mx = (fw + fx(0.6)) / 2; add(prism([[fw + 0.05, zb], [mx, zb + fold], [fx(0.6) - 0.02, zb]], "y", 0.0, 0.88, C.paint), kAt([mx, 0.4, zb + 0.2]) + 41); }
  // bumper and grille
  const bz0 = old ? 0.3 : 0.32, bz1 = old ? 0.48 : 0.55;
  add(prism([[fx(-0.92) - 0.02, -0.92], [fx(-0.92) + 0.08, -0.92], [fx(0.92) + 0.08, 0.92], [fx(0.92) - 0.02, 0.92]], "z", bz0, bz1, old ? "#e8ebee" : "#1e1f22", { cap: old ? "#ffffff" : "#2a2b2e" }), kAt([Lh, 0, 0.4]) + 43);
  // headlights
  for (const yy of [-0.65, 0.65]) add(prism([[fx(yy) - 0.02, yy - 0.18], [fx(yy) + 0.01, yy - 0.18], [fx(yy) + 0.01, yy + 0.18], [fx(yy) - 0.02, yy + 0.18]], "z", 0.62, 0.74, "#f4f0d8", { flat: true }), kAt([Lh, yy, 0.7]) + 44);
  // wheels; the front driver's wheel gets shoved back into the footwell
  const wb = old ? [-1.65, 1.55] : [-1.4, 1.4];
  for (const wx0 of wb) for (const yy of [-0.92, 0.78]) {
    const wx = wx0 > 0 ? wx0 - (yy > 0 ? Math.max(0, cL - 0.6) * 0.8 : Math.max(0, cR - 0.6) * 0.8) : wx0;
    add([prism(R.circle(wx, 0.34, 0.34, 18), "y", yy, yy + 0.16, "#1c1d20"), prism(R.circle(wx, 0.34, 0.2, 14), "y", yy > 0 ? yy + 0.16 : yy - 0.002, yy > 0 ? yy + 0.17 : yy, old ? "#e8e8e8" : "#9aa1a8", { flat: true })], kAt([wx, yy + 0.1, 0.34]) + (yy > 0 ? 60 : -60));
  }
  // the dummy, steering wheel, belt and bag sit in the driver's plane
  const yD = 0.45, hip = [sx - 0.08 + u * 0.55, yD, 0.66], lean = clamp(u * 1.5, 0, 1.15);
  const sh = [hip[0] + 0.56 * Math.sin(0.18 + lean), yD, hip[2] + 0.56 * Math.cos(0.18 + lean)];
  const hl = 0.18 + lean * 1.1 + (contact ? 0.35 : 0), hd = [sh[0] + 0.24 * Math.sin(hl), yD, sh[2] + 0.24 * Math.cos(hl)];
  const wc = [fwI - 0.5 - col * 0.5, yD, 1.0 + col * 0.35];
  const knee = [hip[0] + 0.45, yD, 0.72], foot = [Math.min(fwI - 0.1, hip[0] + 0.85), yD, 0.45 + clamp(intr * 0.5, 0, 0.25)];
  const w2 = (k) => (k * PX / 30).toFixed(1);
  let dm = "";
  const ln = (a, b, w, c) => (dm += '<path d="M' + sp2(a) + "L" + sp2(b) + '" stroke="' + c + '" stroke-width="' + w2(w) + '" stroke-linecap="round" fill="none"/>');
  ln(hip, knee, 6.5, "#c99536"); ln(knee, foot, 5.5, "#c99536");
  ln(hip, sh, 10, "#e0b04a");
  const hand = [wc[0] - 0.05, yD, wc[2] - 0.02];
  ln(sh, [(sh[0] + hand[0]) / 2, yD, (sh[2] + hand[2]) / 2 - 0.08], 4.5, "#d4a240"); ln([(sh[0] + hand[0]) / 2, yD, (sh[2] + hand[2]) / 2 - 0.08], hand, 4, "#d4a240");
  const H = iso(W(hd), PR);
  dm += '<circle cx="' + H[0].toFixed(1) + '" cy="' + H[1].toFixed(1) + '" r="' + w2(7.2) + '" fill="#e8bc58" stroke="#5c4520" stroke-width=".8"/>';
  // dummy targets (the yellow and black calibration marks)
  const T = iso(W([hd[0] + 0.02, yD + 0.05, hd[2]]), PR); dm += '<circle cx="' + T[0].toFixed(1) + '" cy="' + T[1].toFixed(1) + '" r="' + w2(2.4) + '" fill="#111"/>';
  if (belt) { dm += '<path d="M' + sp2([sh[0] - 0.04, yD + 0.08, sh[2] + 0.02]) + "L" + sp2([hip[0] + 0.1, yD + 0.1, hip[2] + 0.03]) + (old ? "" : "") + '" stroke="#2b4f8a" stroke-width="' + w2(3) + '" fill="none" stroke-linecap="round"/>'; dm += '<path d="M' + sp2([hip[0] - 0.12, yD + 0.1, hip[2] + 0.02]) + "L" + sp2([hip[0] + 0.18, yD + 0.1, hip[2] + 0.04]) + '" stroke="#2b4f8a" stroke-width="' + w2(3) + '" fill="none" stroke-linecap="round"/>'; }
  // steering wheel: rim seen edge-on, and the column
  dm += '<path d="M' + sp2([wc[0] + 0.3, yD, wc[2] - 0.18]) + "L" + sp2(wc) + '" stroke="#141518" stroke-width="' + w2(3) + '" stroke-linecap="round"/>';
  dm += '<path d="M' + sp2([wc[0] - 0.06, yD, wc[2] + 0.2]) + "L" + sp2([wc[0] + 0.06, yD, wc[2] - 0.2]) + '" stroke="' + (old ? "#e8e2cc" : "#141518") + '" stroke-width="' + w2(4) + '" stroke-linecap="round"/>';
  if (bag && bagT > 0) { const c = iso(W([wc[0] - 0.2 * bagT, yD, wc[2] + 0.02]), PR), r = 22 * bagT * (u > 0.2 ? 0.82 : 1) * PX / 30; dm += '<ellipse cx="' + c[0].toFixed(1) + '" cy="' + c[1].toFixed(1) + '" rx="' + (r * 0.75).toFixed(1) + '" ry="' + r.toFixed(1) + '" fill="rgba(240,242,245,.93)" stroke="#b9bfc6" stroke-width=".6"/>'; }
  objs.push({ svg: dm, key: kAt([sx, yD, 0.7]) + 5 });
  // barrier: concrete block with a crushable aluminium honeycomb face, covering the driver's side of the car
  const hb = phase === "drive" ? 0 : clamp(cL * 0.45, 0, 0.5);
  let html = R.render([{ parts: [box(BAR + 0.6, BAR + 2.0, 0.2, 2.6, 0, 1.55, "#9a958c", { cap: "#b0aba1" })], key: -1e9 }, { parts: [box(BAR + hb * 0.9, BAR + 0.6, 0.25, 2.5, 0.2, 0.9, "#cdb54e", { cap: "#e0cb6c" })], key: -9e8 }]);
  html += R.render(objs);
  sceneG.innerHTML = html;
  // particles (glass, plastic, dust)
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const r2 = svgEl.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1), cw = Math.max(1, Math.round(r2.width * dpr)), ch = Math.max(1, Math.round(r2.height * dpr)); if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
  ctx.clearRect(0, 0, cv.width, cv.height); ctx.setTransform(cv.width / D.W, 0, 0, cv.height / D.H, 0, 0);
  const pdt = phase === "crash" ? dt * 0.08 : dt;
  parts = parts.filter((p) => { p.life += pdt; if (p.life > p.max) return false; if (p.dust) { p.r += pdt * 0.7; const P2 = iso(p.p, PR); const a = 0.28 * (1 - p.life / p.max); const g = ctx.createRadialGradient(P2[0], P2[1], 0, P2[0], P2[1], p.r * PX); g.addColorStop(0, "rgba(190,180,160," + a + ")"); g.addColorStop(1, "rgba(190,180,160,0)"); ctx.fillStyle = g; ctx.fillRect(P2[0] - p.r * PX, P2[1] - p.r * PX, p.r * PX * 2, p.r * PX * 2); for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * pdt; return true; }
    p.v[2] -= 9.8 * pdt; for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * pdt; if (p.p[2] < 0.02) { p.p[2] = 0.02; p.v = [p.v[0] * 0.3, p.v[1] * 0.3, 0]; } const P2 = iso(p.p, PR); ctx.fillStyle = p.c; ctx.fillRect(P2[0] - p.s, P2[1] - p.s, p.s * 2, p.s * 2); return true; });
  drawGraph();
  const text = phase === "crash" ? (t * 1000).toFixed(0) + " ms · " + Math.max(0, v * 3.6).toFixed(0) + " km/h · chest " + Math.round(trace.length ? trace[trace.length - 1][2] : 0) + " g" : phase === "done" && result ? result.sev.toUpperCase() : (old ? "1959-STYLE" : "2009-STYLE") + " · " + kmh + " km/h";
  if (readout.textContent !== text) readout.textContent = text;
}
function drawGraph() {
  const r = gcv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1), w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr)); if (gcv.width !== w || gcv.height !== h) { gcv.width = w; gcv.height = h; }
  const light = document.body.dataset.theme === "light";
  gctx.setTransform(1, 0, 0, 1, 0, 0); gctx.fillStyle = light ? "#eef2f6" : "#0f1418"; gctx.fillRect(0, 0, w, h);
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
  const map = { " ": () => start(), b: () => { belt = !belt; start(); }, a: () => { if (car === "new") { bag = !bag; start(); } }, o: () => setCar("old"), n: () => setCar("new"), ArrowUp: () => { kmh = Math.min(120, kmh + 5); start(); }, ArrowDown: () => { kmh = Math.max(20, kmh - 5); start(); } };
  if (map[ev.key]) { ev.preventDefault(); act(map[ev.key])(); }
});
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;
window.__fig = { freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
start(); draw(0); syncUi(); story();
`;

const CSS = `.fx-stage{position:relative;overflow:hidden}
.fx-stage svg{display:block;position:relative}
.fx-smoke{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.g-wrap{position:absolute;left:2.5%;top:3%;width:38%;aspect-ratio:2/1;border:1px solid var(--anatomy-lo);border-radius:6px;overflow:hidden;pointer-events:none}
.g-cv{width:100%;height:100%;display:block}
.lane{fill:none;stroke:#e9e4c8;stroke-width:1.2;opacity:.5}
.nearbody{stroke:rgba(0,0,0,.4);stroke-width:.5}.cutedge{fill:none;stroke:#d9c9a6;stroke-width:1.4}.nearcab{fill:rgba(160,190,210,.12);stroke:rgba(0,0,0,.45);stroke-width:.8}
.fold{fill:none;stroke:rgba(0,0,0,.5);stroke-width:1.2}.chrome{stroke:#e8ebee;stroke-width:3;stroke-linecap:round}
.torso{stroke:#e0b04a;stroke-width:9;stroke-linecap:round}.leg{fill:none;stroke:#d39e3a;stroke-width:6;stroke-linecap:round;stroke-linejoin:round}.arm{stroke:#c99536;stroke-width:4;stroke-linecap:round}.head{fill:#e8bc58;stroke:#5c4520;stroke-width:.8}
.wheelS{stroke:#141518;stroke-width:3.5;stroke-linecap:round}.belt{fill:none;stroke:#2b4f8a;stroke-width:2.6;stroke-linecap:round}.bag{fill:rgba(240,242,245,.92);stroke:#b9bfc6;stroke-width:.6}
.fx-stage path{stroke-linejoin:round}
.ctl{display:grid;gap:12px;margin:14px 0 6px;font-family:var(--anatomy-mono);font-size:12px;color:var(--anatomy-mid)}
.ctl-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ctl-label{min-width:72px;text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:var(--anatomy-lo)}
.ctl button{font:inherit;color:var(--anatomy-mid);background:transparent;border:1px solid var(--anatomy-lo);border-radius:6px;padding:7px 10px;cursor:pointer;line-height:1.15;text-align:left;min-height:36px}
.ctl button:disabled{opacity:.5;cursor:default}
.ctl button:hover{border-color:var(--anatomy-mid)}
.ctl button[aria-pressed="true"]{color:var(--anatomy-lit);border-color:var(--anatomy-lit)}
.ctl #go{color:#ff6a3d;border-color:#ff6a3d}
.ctl button small{display:block;font-size:10px;color:var(--anatomy-lo)}
.ctl output{min-width:96px;text-align:right;color:var(--anatomy-hi,var(--anatomy-mid))}
.slide{position:relative;flex:1;min-width:120px}.slide input{width:100%;accent-color:var(--anatomy-lit);margin:0}
.meter{position:relative;flex:1;min-width:110px;height:10px;margin-top:14px;border:1px solid var(--anatomy-lo);border-radius:5px}
.meter .fill{position:absolute;left:0;top:0;bottom:0;border-radius:4px;transition:width .1s;background:#3ddc84}
.meter .fill[data-state="warn"]{background:#ffb347}.meter .fill[data-state="bad"]{background:#ff5a2a}
.mark{position:absolute;top:-14px;bottom:-3px;width:0;border-left:1px dashed #ff6a3d;pointer-events:none}
.mark::after{content:attr(data-label);position:absolute;top:0;left:4px;font-size:10px;white-space:nowrap;color:#ff6a3d}
#stats{font-size:12px;color:var(--anatomy-mid);line-height:1.5}#stats b{color:var(--anatomy-hi,var(--anatomy-mid));font-weight:600}
#shot{min-height:3.6em;font-size:12px;line-height:1.4}
@media (max-width:520px){.ctl-label{min-width:52px}.ctl button{padding:7px 8px}.ctl output{min-width:80px}.ctl button small{display:none}.g-wrap{width:48%}}`;

const stageHtml = `<div class="iso-stage fx-stage" tabindex="0" role="group" aria-label="Car crash: space to crash, O and N pick the old or new car, B the belt, A the airbag, up and down the speed">${svg}<canvas class="fx-smoke" aria-hidden="true"></canvas><div class="g-wrap" aria-hidden="true"><canvas class="g-cv"></canvas></div></div>`;

const CONTROLS = `<div class="ctl" role="group" aria-label="Controls">
  <div class="ctl-row"><span class="ctl-label">Car</span><button type="button" data-car="old">1959-style<small>big, chrome, no plan</small></button><button type="button" data-car="new" aria-pressed="true">2009-style<small>crumple zone + cage</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Speed</span><div class="slide"><input id="spd" type="range" min="20" max="120" step="2" value="64" aria-label="Impact speed, km/h"></div><output id="spd-out">64 km/h</output></div>
  <div class="ctl-row"><span class="ctl-label">Restraint</span><button type="button" id="belt" aria-pressed="true">Seatbelt on</button><button type="button" id="bag" aria-pressed="true">Airbag on</button><button type="button" id="go">Crash<small>space</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Chest</span><div class="meter"><span id="c-fill" class="fill"></span><span class="mark" style="left:${(60 / 110 * 100).toFixed(1)}%" data-label="60 g"></span></div><output id="c-out">0 g</output></div>
  <div class="ctl-row"><span class="ctl-label">Head</span><div class="meter"><span id="h-fill" class="fill"></span><span class="mark" style="left:${(700 / 1200 * 100).toFixed(1)}%" data-label="HIC 700"></span></div><output id="h-out">-</output></div>
  <div class="ctl-row"><span class="ctl-label">Intrusion</span><div class="meter"><span id="i-fill" class="fill"></span></div><output id="i-out">0 cm</output></div>
  <div class="ctl-row"><span class="ctl-label">Car</span><span id="stats"></span></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="slow" aria-pressed="false">Even slower</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
  <div id="shot" aria-live="polite"></div>
</div>`;

const card = k.plateHtml({
  fig: "Fig 26",
  title: "Car crash",
  hint: "Same crash, fifty years apart",
  readout: "",
  keys: [
    { mark: "lit", label: "Live: the crush, the dummy, belt and airbag, and the g-trace (one second on screen is 25 ms)" },
    { mark: "raised", label: "Sedan into an offset barrier, near side cut away; 1959-style or 2009-style" },
  ],
  caption: "A crash is just getting rid of the car's energy, ½mv², over some distance. Stop over a metre and it's a few tens of g; stop over a few centimetres and it's hundreds. A modern car crushes a long front end on purpose, at a steady force, while keeping a stiff cage round the people so the dashboard and footwell don't come to meet them. The seatbelt ties you to that slowing-down from the first moment, and the airbag spreads the last of it over your chest and head. Without them you keep going at the original speed until you hit the inside of the car.",
  body: stageHtml,
});

const other = theme === "light" ? ["index.html", "Dark version"] : ["light.html", "Light version"];
const FOOT = `<p style="font-family:var(--anatomy-mono);font-size:11px;color:var(--anatomy-lo);margin:28px 0 8px;line-height:1.6">A toy, not a crash simulation. Real: ½mv² against crush distance, crumple zones and safety cages, belts with pretensioners and load limiters, airbags timed to fire in about 20 ms, the 60 g chest and HIC 700 head limits (FMVSS 208), and the IIHS 2009 test of a 1959 Chevrolet Bel Air against a 2009 Chevrolet Malibu at 40 mph each. The IIHS figures quoted (chest 85 g against 41 g, footwell intrusion 62 cm against 7 cm) are from its published crash data. Made up: the cars, the force curves, the one-dimensional dummy, the injury labels and the head numbers; the barrier here stands in for the other car.<br>Built with <a href="https://github.com/wheresryan22/anatomy" style="color:inherit">Anatomy</a> by Ryan (MIT). · <a href="${other[0]}" style="color:inherit">${other[1]}</a> · <a href="../" style="color:inherit">More figures</a> · <a href="https://github.com/Dizzyfer/Anatomy/tree/main/crash" style="color:inherit">Source</a></p>`;
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "Car crash", theme, body: `<style>${CSS}</style>${card.replace("<figcaption", CONTROLS + "<figcaption")}${FOOT}`, script: kitScript() + LIVE.replace("__DATA__", JSON.stringify(DATA)), width: 720 }));
console.log("wrote", name);
