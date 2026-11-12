import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { engineScript, stageHtml, pageMk2, footHtml } from "../../mk2/shell.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const W = 960, H = 600;

// Truth: minimum ignition energies (most easily ignited mixture in air), µJ.
// Cable: 200 pF/m, the default IEC 60079-25 lets you assume for ordinary 2/3-core cable when the real figure is unknown.
const GASES = [
  { id: "CH4", group: "I", mie: 280 },
  { id: "C3H8", group: "IIA", mie: 250 },
  { id: "C2H4", group: "IIB", mie: 70 },
  { id: "H2", group: "IIC", mie: 17 },
];
const PF_PER_M = 200;
const L_MAX = 5000;
const V_MIN = 6, V_MAX = 30;
const PLATE_H = 12, FOOT_H = 5;
const DIVIDE = -62;
const REEL = [-22, 36];
const REEL_R = 24;
const PST = [84, -20];
const BOTTLE_R = 7.5, BOTTLE_H = 42;
const BOTTLES = GASES.map((g, i) => ({ ...g, at: [140, -76 + i * 22] }));
const MOD_Y = [-58, -44, -30, -16];
const OUR = 2;
const SPARK = [PST[0] + 1.5, PST[1] + 10, 48.5];

const START = { gas: 3, v: 24, len: 150 };
const PLATE = { x: -170, y: -92, w: 330, d: 172, r: 8 };
const P = k.fitProjection([...k.boxCorners(PLATE, -0.8, 0), [-156, -66, 74], [84, -38, 88], [140, -76, 56], [140, -10, 56]], W, H, { pad: 22, azimuth: 45, elevation: 30 });
const DATA = { W, H, P, PLATE };
Object.assign(DATA, { GASES, PF_PER_M, L_MAX, V_MIN, V_MAX, REEL, REEL_R, PST, DIVIDE, MOD_Y, OUR, BOTTLES, BOTTLE_R, BOTTLE_H, start: START });
const LIVE = `
${engineScript()}
const D = __DATA__;
const stage = document.querySelector(".mk-stage");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lightTheme = document.body.dataset.theme === "light";
const E = mk2(stage, D.P, { W: D.W, H: D.H, pivot: [-5, -6, 20], plate: { ...D.PLATE, h: 12, foot: 5 }, shadowBox: [-178, -100, -18, 168, 88, 110] });
const { box, cyl, prism, circle, lathe, tube, sphere, loft, roundPoly, rrect, tris } = E;
E.bindTools(stage);
const xbtn = stage.querySelector('[data-mk="xray"]');
const setX = (on) => { E.setXray(on); if (xbtn) xbtn.setAttribute("aria-pressed", String(on)); };
const sceneG = stage.querySelector('[data-part="scene"]');
const iso = (p) => E.project(p), depthOf = (p) => E.depthOf(p);
const shakeEls = [stage.querySelector(".mk-gl"), stage.querySelector(".mk-over")];
// a tap on the stage that isn't a drag or a press on the toolbar
const onTap = (fn) => { let d0 = null; stage.addEventListener("pointerdown", (ev) => { d0 = ev.target.closest(".mk-tools,button,a") ? null : [ev.clientX, ev.clientY]; }); stage.addEventListener("pointerup", (ev) => { if (d0 && Math.hypot(ev.clientX - d0[0], ev.clientY - d0[1]) < 6) fn(ev); d0 = null; }); };
// 3x4 matrix for a cached object turning about a vertical axis through (cx, cy)
const rotZ = (cx, cy, a) => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1, cx - c * cx + s * cy, cy - s * cx - c * cy, 0]; };
const mixHex = (a, b, t) => { const h = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16)), A = h(a), B = h(b); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * Math.min(1, Math.max(0, t))).toString(16).padStart(2, "0")).join(""); };
const setShake = (x, y) => { const t = x || y ? "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px)" : ""; for (const e of shakeEls) if (e.style.transform !== t) e.style.transform = t; };
const P = D.P, GASES = D.GASES;
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const burst = (age, rise, fall) => (age > 0 ? sm(0, rise, age) * Math.exp(-Math.max(0, age - rise) / fall) : 0);
let gas = D.start.gas, volts = D.start.v, len = D.start.len, lenShown = len;
let frame = 0, last = 0, now = 0, visible = false, touring = true, auto = false, slow = false, tourClock = 0, tourStep = -1;
let sparkAt = -10, sparkE = 0, ignites = false, boomAt = null, lastFire = -10;
const BOOM_END = 4.2;
const booming = () => boomAt !== null && now - boomAt < BOOM_END + 0.3;

const energy = (v, L) => 0.5 * (L * D.PF_PER_M * 1e-12) * v * v * 1e6; // µJ
const capNF = (L) => L * D.PF_PER_M / 1000;
// ---- ui ----
const ui = {
  gas: [...document.querySelectorAll("[data-gas]")], v: document.querySelector("#volts"), vOut: document.querySelector("#volts-out"),
  len: document.querySelector("#len"), lenOut: document.querySelector("#len-out"),
  fill: document.querySelector("#meter-fill"), mie: document.querySelector("#meter-mie"), eOut: document.querySelector("#energy-out"),
  fire: document.querySelector("#fire"), slow: document.querySelector("#slow"), auto: document.querySelector("#auto"), tour: document.querySelector("#tour"),
  shot: document.querySelector("#shot"),
};
let slidingV = false, slidingL = false;
function syncUi() {
  const g = GASES[gas], E = energy(volts, len);
  ui.gas.forEach((b, i) => b.setAttribute("aria-pressed", String(i === gas)));
  if (!slidingV) ui.v.value = volts;
  if (!slidingL) ui.len.value = Math.round(len);
  ui.vOut.textContent = volts.toFixed(0) + " V";
  ui.lenOut.textContent = Math.round(len) + " m";
  const frac = clamp(E / (2 * g.mie), 0, 1);
  ui.fill.style.width = (frac * 100).toFixed(1) + "%";
  ui.fill.dataset.bad = String(E >= g.mie);
  ui.mie.dataset.label = "MIE " + g.mie + " µJ";
  ui.eOut.textContent = (E < 10 ? E.toFixed(1) : Math.round(E)) + " µJ";
  ui.slow.setAttribute("aria-pressed", String(slow));
  ui.auto.setAttribute("aria-pressed", String(auto));
  ui.tour.setAttribute("aria-pressed", String(touring));
}

// ---- the spark: a conductor coming off its terminal live ----
function fire() {
  if (booming()) return;
  const g = GASES[gas], E = energy(volts, len);
  sparkAt = now; lastFire = now; sparkE = E / g.mie; ignites = E >= g.mie;
  const C = capNF(len);
  ui.shot.textContent = ignites
    ? "Spark: " + (E < 10 ? E.toFixed(1) : Math.round(E)) + " µJ from " + Math.round(len) + " m of cable (" + C.toFixed(0) + " nF at " + volts + " V). That's over " + g.id + "'s " + g.mie + " µJ. Zone 1 is gone; the safe area didn't notice."
    : "Spark: " + (E < 10 ? E.toFixed(1) : Math.round(E)) + " µJ from " + Math.round(len) + " m of cable. Under " + g.id + "'s " + g.mie + " µJ, so it fizzles. Nothing happens, which is the whole point.";
  if (ignites) boomAt = now + 0.18;
}

function chaos() {
  if (boomAt === null) return { c: -1, back: 0 };
  const c = now - boomAt;
  if (c < 0 || c > BOOM_END) return { c: -1, back: 0 };
  return { c, back: 1 - sm(3.0, 3.9, c) };
}
const tip = (c, delay, target) => { const u = Math.max(0, c - delay); return u <= 0 ? 0 : target * (1 - Math.exp(-u / 0.11) * Math.cos(u * 13)); };
// ---------------- the loop, in real 3D: barrier, drum of cable, junction box ----------------
const TAU = Math.PI * 2, rn = () => Math.random(), REEL = D.REEL, RR = D.REEL_R, PST = D.PST, SP = [PST[0] + 1.7, PST[1] + 11, 33], BLUE = "#3f9fe6";
const flashEl = stage.querySelector(".fx-flash"), overEl = stage.querySelector(".mk-over");
const tipM = (piv, ang, axis) => { const c = Math.cos(ang), s = Math.sin(ang), R = axis === "x" ? [1, 0, 0, 0, c, -s, 0, s, c] : [c, 0, s, 0, 1, 0, -s, 0, c]; return [...R, ...[0, 1, 2].map((i) => piv[i] - (R[i * 3] * piv[0] + R[i * 3 + 1] * piv[1] + R[i * 3 + 2] * piv[2]))]; };
const xfOf = (m) => (p) => [m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[9], m[3] * p[0] + m[4] * p[1] + m[5] * p[2] + m[10], m[6] * p[0] + m[7] * p[1] + m[8] * p[2] + m[11]];
function benchParts() {
  const o = [], PL = D.PLATE, dv = D.DIVIDE;
  // the zone boundary: a hazard strip across the bench
  o.push(box(dv - 3, dv + 3, PL.y + 6, PL.y + PL.d - 6, 0, 0.6, "#e8b923", { mat: "paint", bevel: 0.2 }));
  for (let y = PL.y + 8; y < PL.y + PL.d - 12; y += 7) o.push(prism([[dv - 3, y], [dv + 3, y + 4], [dv + 3, y + 7.4], [dv - 3, y + 3.4]], "z", 0.6, 0.66, "#23262b", { bevel: 0, flat: true }));
  // the panel in the safe area: backplate, DIN rail, a supply and three barriers
  o.push(prism(rrect(-160, -138, -70, 10, 1.5), "z", 0, 3, "#8a9099", { mat: "paint" }), box(-158, -154, -66, 6, 3, 71, "#c9ced3", { mat: "satin", bevel: 0.4 }), box(-154, -152, -62, 2, 40, 44, "#aeb4bb", { mat: "steel", bevel: 0.2 }));
  for (const [y, z] of [[-62, 66], [2, 66], [-62, 9], [2, 9]]) o.push(prism(circle(y, z, 1.3, 6), "x", -154, -153.2, "#8f959d", { mat: "steel" }));
  D.MOD_Y.forEach((y, i) => {
    const top = i === 0 ? 58 : 54, ours = i === D.OUR, S = ours ? { shell: true } : {};
    o.push(box(-152, -136, y, y + 12, 28, top - 3, i === 0 ? "#8f959d" : "#e3e7ea", { mat: "plastic", bevel: 0.5, ...S }), box(-152, -136, y, y + 12, top - 3, top, i === 0 ? "#6f757d" : BLUE, { mat: "plastic", bevel: 0.5, ...S }));
    for (const yy of [y + 3, y + 6, y + 9]) for (const xx of [-148.5, -139.5]) o.push(cyl(xx, yy, 1, top, top + 0.4, "#d8dce0", 8, { mat: "steel" }));
    o.push(prism(circle(y + 9, top - 7, 0.9, 10), "x", -136, -135.6, i === 0 ? "#5fe08a" : ours ? "#5fe08a" : "#3a8f58", { flat: true, emit: ["#5fe08a", ours || i === 0 ? 1 : 0.25], emitK: 2 }));
    o.push(box(-135.98, -135.9, y + 1.5, y + 10.5, top - 17, top - 10, "#f6f4ee", { bevel: 0, flat: true }));
  });
  // inside our barrier: fuse, resistor, and two zeners to earth
  const y0 = D.MOD_Y[D.OUR] + 6, yb = y0 + 1.6;
  o.push(box(-150, -138, y0 - 0.4, y0 + 0.4, 30, 50, "#2f7d4f", { mat: "plastic", bevel: 0 }));
  o.push(tube([[-148.6, yb, 46.5], [-139.4, yb, 46.5]], 1.25, "#eef3f6", { seg: 10, mat: "glass", emit: ["#cfe6ff", 0.25] }), tube([[-149, yb, 46.5], [-147.4, yb, 46.5]], 1.45, "#c9ced3", { seg: 10, mat: "steel" }), tube([[-140.6, yb, 46.5], [-139, yb, 46.5]], 1.45, "#c9ced3", { seg: 10, mat: "steel" }));
  o.push(tube([[-148, yb, 40.5], [-140, yb, 40.5]], 1.5, "#d8b98a", { seg: 10, mat: "plastic" }));
  for (const [x, c] of [[-146.6, "#8a3a2a"], [-144.6, "#23262b"], [-142.6, "#c0392b"]]) o.push(tube([[x, yb, 40.5], [x + 0.9, yb, 40.5]], 1.58, c, { seg: 10, mat: "plastic" }));
  for (const x of [-148, -142.6]) o.push(tube([[x, yb, 34.5], [x + 4.4, yb, 34.5]], 1.15, "#26282c", { seg: 10, mat: "plastic" }), tube([[x + 3.3, yb, 34.5], [x + 4, yb, 34.5]], 1.22, "#d8dce0", { seg: 10, mat: "steel" }));
  o.push(box(-150, -138, y0 + 0.4, y0 + 0.9, 30.6, 31.6, "#c9a24a", { mat: "metal", bevel: 0 }));
  // name tags for the bottles
  for (const b of D.BOTTLES) o.push(prism(rrect(b.at[0] - 36, b.at[0] - 12, b.at[1] - 6, b.at[1] + 6, 1.4), "z", 0, 1, "#e9e6df", { mat: "matte" }));
  return o;
}
const cableO = (hot, lvl) => ({ seg: 8, mat: "plastic", emit: lvl > 0 ? [hot ? "#ff6a3a" : "#4ab0ff", 0.03 + lvl * 0.012] : undefined });
const cableC = (hot, lvl) => (lvl > 0 && hot ? "#f08a4a" : BLUE);
function leadParts(hot, lvl) { return [tube([[-136, -24, 31], [-131, -24, 29], [-128, -24, 20], [-126, -24, 4], [-121, -24, 1.3], [-90, -24, 1.3], [-76, -14, 1.3], [-62, 8, 2], [-52, 22, 1.3], [REEL[0] - RR + 2, REEL[1], 1.6]], 1.25, cableC(hot, lvl), cableO(hot, lvl))]; }
function snakeParts(L, hot, lvl) {
  const A = [REEL[0] + RR - 2, REEL[1] - 2], B = [PST[0] - 14, PST[1] + 34], amp = 22 * sm(0, 900, L), nw = 1 + Math.floor(Math.min(L, 4800) / 650);
  const dx = B[0] - A[0], dy = B[1] - A[1], l2 = Math.hypot(dx, dy), nx = -dy / l2, ny = dx / l2, pts = [];
  for (let i = 0; i <= 90; i++) { const t = i / 90, w = Math.sin(t * nw * Math.PI) * amp * Math.sin(t * Math.PI); pts.push([A[0] + dx * t + nx * w, A[1] + dy * t + ny * w, 1.3]); }
  pts.push([PST[0] - 6, PST[1] + 24, 1.3], [PST[0] + 1, PST[1] + 15, 3.6], [PST[0] + 1, PST[1] + 11, 12], [PST[0] + 1, PST[1] + 11, 22]);
  return [tube(pts, 1.25, cableC(hot, lvl), cableO(hot, lvl))];
}
function reelParts(r, hot, lvl) {
  const o = [], WOOD = "#c9a66b", prof = [[0, 2.2]];
  for (let z = 2.2; z < 26; z += 2.4) prof.push([r - 0.45, z], [r, z + 1.2]);
  prof.push([r - 0.45, 26.2], [0, 26.2]);
  o.push(cyl(0, 0, RR, 0, 2.2, WOOD, 56, { mat: "matte", bevel: 0.4 }), cyl(0, 0, 10, 2.2, 26.2, "#a8834e", 32, { mat: "matte", bevel: 0 }), lathe(prof, cableC(hot, lvl), { c: [0, 0, 0], ...cableO(hot, lvl), seg: 48 }), cyl(0, 0, RR, 26.2, 28.4, WOOD, 56, { mat: "matte", bevel: 0.4, shell: true }));
  for (let i = 0; i < 6; i++) o.push(cyl(Math.cos(i * Math.PI / 3 + 0.3) * 16, Math.sin(i * Math.PI / 3 + 0.3) * 16, 2.4, 28.4, 28.46, "#3a2c1c", 14, { bevel: 0, flat: true }));
  o.push(cyl(0, 0, 3, 28.4, 32.4, "#aeb4bb", 20, { mat: "steel" }), prism(rrect(-2.4, 17.4, -2.4, 2.4, 2.2), "z", 32.4, 34.8, "#8f959d", { mat: "steel" }), cyl(15, 0, 1.9, 34.8, 44, "#26282c", 14, { mat: "rubber" }));
  o.push(prism(rrect(-10, 10, 9, 18, 1), "z", 28.4, 32, "#2f3338", { mat: "plastic" }), box(-8.6, 8.6, 10.2, 16.8, 32, 32.1, "#101418", { bevel: 0, flat: true }));
  return o;
}
function standParts() {
  const o = [], [x, y] = PST, G = "#8a9099";
  o.push(prism(rrect(x - 12, x + 12, y - 12, y + 12, 1.6), "z", 0, 2.4, G, { mat: "paint" }));
  for (const [bx, by] of [[x - 8.5, y - 8.5], [x + 8.5, y - 8.5], [x - 8.5, y + 8.5], [x + 8.5, y + 8.5]]) o.push(cyl(bx, by, 1.6, 2.4, 3.6, "#c9ced3", 6, { mat: "steel" }));
  o.push(cyl(x, y, 3.4, 2.4, 82.4, "#b4bcc4", 24, { mat: "satin", bevel: 0 }), cyl(x, y, 3.9, 82.4, 84, G, 24, { mat: "paint" }));
  // the transmitter on the back of the pipe
  o.push(box(x - 2, x + 2, y - 12, y - 3, 64, 68, G, { mat: "paint" }), lathe([[0, 48], [2.4, 48], [2.4, 54], [6.5, 54], [6.5, 69.4], [8, 70], [8, 80.4], [7.2, 81], [0, 81]], "#2e6aa8", { c: [x, y - 18, 0], seg: 40, mat: "paint", shell: true }), cyl(x, y - 18, 5.8, 81, 81.3, "#101418", 32, { bevel: 0, flat: true }));
  o.push(box(x - 4, x + 4, y - 20.5, y - 19.7, 56, 68, "#2f7d4f", { mat: "plastic", bevel: 0 }), box(x - 3, x + 3, y - 19.7, y - 17, 58, 63, "#26282c", { mat: "plastic", bevel: 0.3 }), cyl(x, y - 16, 2.2, 72, 78, "#c9ced3", 14, { mat: "steel" }));
  for (const z of [30, 42]) o.push(cyl(x, y, 4, z, z + 1.4, "#c9ced3", 20, { mat: "steel", bevel: 0 }));
  // the junction box on the front of the pipe, cover swung open
  const J = { x0: x - 11, x1: x + 11, y0: y + 4, y1: y + 18, z0: 26, z1: 48 }, W = { mat: "satin", shell: true, bevel: 0.3 }, JC = "#b4bcc4";
  o.push(box(J.x0, J.x1, J.y0, J.y0 + 1.2, J.z0, J.z1, JC, W), box(J.x0, J.x0 + 1.2, J.y0 + 1.2, J.y1, J.z0, J.z1, JC, W), box(J.x1 - 1.2, J.x1, J.y0 + 1.2, J.y1, J.z0, J.z1, JC, W), box(J.x0 + 1.2, J.x1 - 1.2, J.y0 + 1.2, J.y1, J.z0, J.z0 + 1.2, JC, W), box(J.x0 + 1.2, J.x1 - 1.2, J.y0 + 1.2, J.y1, J.z1 - 1.2, J.z1, JC, W));
  o.push(box(J.x0 - 1.4, J.x0 - 0.2, J.y1 - 0.5, J.y1 + 21, J.z0, J.z1, JC, { mat: "satin", bevel: 0.3 }), cyl(J.x0 - 0.8, J.y1 - 0.2, 0.9, J.z0 + 2, J.z1 - 2, "#8f959d", 8, { mat: "steel" }));
  o.push(cyl(x + 1, y + 11, 2.6, 21.5, 26, "#c9a24a", 6, { mat: "metal" }), box(x - 9, x + 9, y + 5.2, y + 6.4, 35, 40, "#aeb4bb", { mat: "steel", bevel: 0 }));
  for (let i = 0; i < 4; i++) { const cx = x - 5.6 + i * 3.75; o.push(box(cx - 1.7, cx + 1.7, y + 6.4, y + 12.4, 33, 43, i < 2 ? BLUE : "#6fb8ee", { mat: "plastic", bevel: 0.3 })); for (const z of [35.6, 40.4]) o.push(prism(circle(cx, z, 0.95, 10), "y", y + 12.4, y + 12.8, "#d8dce0", { mat: "steel" })); }
  o.push(tube([[x + 1, y + 11, 25], [x + 1, y + 11, 28.6]], 1.25, BLUE, { seg: 8, mat: "plastic" }), tube([[x + 0.5, y + 11, 28.4], [x - 1.4, y + 10.6, 30.4], [x - 1.85, y + 10, 33.4]], 0.5, "#8a5a3a", { seg: 6, mat: "plastic" }));
  return o;
}
function bottleParts(sel) {
  const R = D.BOTTLE_R, Hh = D.BOTTLE_H, top = 2.4 + Hh, o = [];
  o.push(cyl(0, 0, R + 1.2, 0, 2.4, "#3a3d42", 24, { mat: "rubber" }));
  o.push(lathe([[0, 2.4], [R, 2.4], [R, top - 6], [R - 1.2, top - 2], [5.2, top], [5.2, top + 3], [2.4, top + 3], [2.4, top + 7], [4.2, top + 7], [4.2, top + 8.6], [0, top + 8.6]], sel ? "#e2742a" : "#8f9aa4", { c: [0, 0, 0], seg: 28, mat: "paint", emit: sel ? ["#ff7a2a", 0.05] : undefined }));
  for (const z of [2.4 + Hh * 0.62, 2.4 + Hh * 0.78]) o.push(lathe([[R + 0.15, z], [R + 0.15, z + 1.2]], sel ? "#f4f2ec" : "#c9ced3", { c: [0, 0, 0], seg: 28, mat: "paint" }));
  return o;
}
const HAZE = Array.from({ length: 30 }, (_, i) => { const h = (n2) => { const s = Math.sin(i * 12.9898 + n2 * 78.233) * 43758.5453; return s - Math.floor(s); }; return [h(1), h(2), h(3), h(4)]; });
let fx = [];
function draw(dt = 0) {
  const g = GASES[gas], K = chaos(), En = energy(volts, len), hot = En >= g.mie, lvl = E.xray > 0.5 ? 1 + Math.round(clamp(En / (2 * g.mie), 0, 1) * 6) : 0;
  const age = now - sparkAt, lift = sm(0, 0.08, age) * 3.2 * (age < 2.5 ? 1 : 1 - sm(2.5, 3.0, age));
  const ck = (hot ? 100 : 0) + lvl, rPack = Math.round((10.6 + 11 * (1 - len / D.L_MAX)) * 5) / 5;
  let reelM = [1, 0, 0, 0, 1, 0, 0, 0, 1, REEL[0], REEL[1], 0], standM;
  if (K.c >= 0) {
    const c = K.c, sh = 14 * sm(0, 0.5, c) * K.back, r = rotZ(0, 0, -0.24 * sm(0, 0.5, c) * K.back);
    reelM = [...r.slice(0, 9), REEL[0] - sh, REEL[1] + sh * 0.3, 0];
    standM = tipM([PST[0], PST[1] + 12, 0], (-tip(c, 0.04, 78) * K.back * Math.PI) / 180, "x");
  }
  const objs = [{ cache: "bench", rev: 0, parts: benchParts }, { cache: "lead", rev: ck, parts: () => leadParts(hot, lvl) }, { cache: "snake", rev: Math.round(len / 10) * 1000 + ck, parts: () => snakeParts(len, hot, lvl) },
    { cache: "reel", rev: Math.round(rPack * 5) * 1000 + ck, m: reelM, parts: () => reelParts(rPack, hot, lvl) }, { cache: "stand", rev: 0, m: standM, parts: standParts }];
  // the conductor that comes off its terminal
  const [x, y] = PST, tipP = [x + 1.9 + lift * 0.5, y + 10 + lift * 1.5, 33.3 - lift * 0.5];
  objs.push({ xf: standM ? xfOf(standM) : undefined, parts: [tube([[x + 1.5, y + 11, 28.4], [x + 1.8 + lift * 0.25, y + 10.5 + lift * 0.7, 30.6], tipP], 0.5, BLUE, { seg: 6, mat: "plastic" }), sphere(tipP, 0.62, "#e8b96a", { mat: "copper" })] });
  D.BOTTLES.forEach((b, i) => { const a = K.c >= 0 ? (tip(K.c, 0.06 + 0.05 * (3 - i), 84) * K.back * Math.PI) / 180 : 0; let m = [1, 0, 0, 0, 1, 0, 0, 0, 1, b.at[0], b.at[1], 0]; if (a) { const t = tipM([D.BOTTLE_R, 0, 0], a, "y"); m = [...t.slice(0, 9), t[9] + b.at[0], t[10] + b.at[1], t[11]]; } objs.push({ cache: "bottle" + (i === gas ? "S" : "N"), rev: 0, m, parts: () => bottleParts(i === gas) }); });
  let svg = E.render(objs);
  // gas hanging over Zone 1
  const hz = K.c >= 0 ? Math.max(0, 1 - K.c * 4) * (K.c < 3 ? 1 : 0) : 1, PL = D.PLATE;
  if (hz > 0.01) for (const [a, b, c, d] of HAZE) { const t = now * 0.05 + d * 9; E.sprite([D.DIVIDE + 22 + a * (PL.x + PL.w - D.DIVIDE - 40) + Math.sin(t * 1.3 + c * 6) * 10, PL.y + 14 + b * (PL.d - 28) + Math.cos(t + a * 6) * 8, 6 + c * 26], 20 + d * 14, lightTheme ? "#3f8f9a" : "#6fc4d0", (lightTheme ? 0.07 : 0.055) * hz); }
  // the spark, sized by its energy against the gas's MIE
  const flick = age < 0.35 ? 0.6 + 0.4 * Math.sin(age * 140) : 1, sp = still.matches ? 0 : burst(age, 0.004, ignites ? 0.12 : 0.07) * flick, k2 = Math.sqrt(clamp(sparkE, 0, 4));
  if (sp > 0.02 && K.c < 0.3) {
    const a0 = tipP, b0 = [x + 1.9, y + 10, 33.2];
    for (let s = 0; s < 2; s++) { let prev = a0; for (let i = 1; i <= 5; i++) { const t = i / 5, p = i === 5 ? b0 : [a0[0] + (b0[0] - a0[0]) * t + (rn() - 0.5) * 0.9, a0[1] + (b0[1] - a0[1]) * t + (rn() - 0.5) * 0.9, a0[2] + (b0[2] - a0[2]) * t + (rn() - 0.5) * 0.9]; E.line(prev, p, s ? 1.4 : 3 + k2, s ? "#ffffff" : "#8fb4ff", sp, true); prev = p; } }
    E.sprite([(a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2, (a0[2] + b0[2]) / 2], 2 + 5 * k2, "#bcd0ff", Math.min(1, (0.45 + 0.3 * k2) * sp), true, 1);
  }
  // Zone 1 goes up; the safe area doesn't notice
  if (K.c >= 0) {
    const c = K.c, life = Math.exp(-c / 0.5), Rr = 16 + 70 * (1 - Math.exp(-c / 0.2)), C = [SP[0] - 10, SP[1], SP[2] + 6 + 30 * c];
    if (life > 0.02) { E.sprite(C, Rr * 0.8, "#ffb04a", 0.5 * life, true, 1); E.sprite(C, Rr * 0.35, "#fff0c8", 0.6 * life, true, 1); }
    if (dt > 0 && c < 1.0) for (let j = 0; j < 8; j++) fx.push({ k: "flame", p: [D.DIVIDE + 34 + rn() * (PL.x + PL.w - D.DIVIDE - 40), PL.y + 6 + rn() * (PL.d - 12), 6 + rn() * 50], v: [rn() * 110, (rn() - 0.5) * 120, 30 + rn() * 80], life: 0, max: 0.45 + rn() * 0.6, s: 1.7 + rn() });
    if (dt > 0 && c >= 0.3 && c < 2.8 && rn() < dt * 40) fx.push({ k: "smoke", p: [D.DIVIDE + 20 + rn() * 180, (rn() - 0.5) * 130, 20 + rn() * 50], v: [(rn() - 0.5) * 20, (rn() - 0.5) * 20, 30 + rn() * 40], life: 0, max: 2 + rn() * 2, s: 1.5 });
  }
  fx = fx.filter((p) => {
    p.life += dt; if (p.life > p.max) return false;
    const t = p.life / p.max;
    if (p.k === "flame") { p.v[0] *= 0.93; p.v[1] *= 0.93; }
    for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * dt;
    if (p.k === "flame") E.sprite(p.p, (5 + 15 * t) * p.s, t < 0.25 ? "#fff0b8" : t < 0.6 ? "#ff9a2e" : "#d8481a", 0.8 * (1 - t * t), true, 2);
    else E.sprite(p.p, (12 + 40 * t) * p.s, lightTheme ? "#4a4744" : "#2e2c2b", 0.45 * (1 - t));
    return true;
  });
  // lettering
  const fmt = (v) => (v < 10 ? v.toFixed(1) : Math.round(v)) + " µJ";
  let m = E.faceMatrix([-160, 64, 0.05], [1, 0, 0], [0, 1, 0]);
  if (m) svg += '<g transform="' + m + '"><text class="pt bench" x="0" y="5" font-size="5">SAFE AREA</text><text class="pt bench" x="106" y="5" font-size="5">ZONE 1</text></g>';
  D.MOD_Y.forEach((my, i) => { const top = i === 0 ? 58 : 54; m = E.faceMatrix([-135.88, my + 10.5, top - 17], [0, -1, 0], [0, 0, -1]); if (m) svg += '<g transform="' + m + '"><text class="pt" x="0.8" y="3.6" font-size="2.5">' + (i === 0 ? "24 V" : "Ex ia") + "</text></g>"; });
  for (const [i, b] of D.BOTTLES.entries()) { m = E.faceMatrix([b.at[0] - 33.8, b.at[1] - 4.6, 1.05], [1, 0, 0], [0, 1, 0]); if (m) svg += '<g transform="' + m + '"><text class="pt' + (i === gas ? " sel" : "") + '" x="0" y="4" font-size="3.8">' + b.id + '</text><text class="pt lo" x="0" y="8.4" font-size="2.6">' + b.group + " " + b.mie + "µJ</text></g>"; }
  if (K.c < 0) {
    m = E.faceMatrix([REEL[0] - 7.6, REEL[1] + 10.8, 32.15], [1, 0, 0], [0, 1, 0]);
    if (m) svg += '<g transform="' + m + '"><text class="pt lcd" x="0" y="4.6" font-size="4.2">' + String(Math.round(len)).padStart(4, "0") + " m</text></g>";
    m = E.faceMatrix([PST[0] - 4.6, PST[1] - 19.4, 81.35], [1, 0, 0], [0, 1, 0]);
    if (m) svg += '<g transform="' + m + '"><text class="pt lcd" x="0" y="2.4" font-size="2.3">12.0 mA</text></g>';
    if (age < 2.6 && age > 0) { const p = E.project([SP[0] + 4, SP[1] + 8, SP[2] + 6]); svg += '<text class="mk-lab elab" data-s="' + (ignites ? "bad" : "ok") + '" x="' + (p[0] + 8).toFixed(1) + '" y="' + p[1].toFixed(1) + '" opacity="' + clamp(2.6 - age, 0, 1).toFixed(2) + '">' + fmt(sparkE * g.mie) + "</text>"; }
  }
  if (E.xray > 0.02 && K.c < 0) svg += E.callouts([
    { p: [-144, D.MOD_Y[D.OUR] + 8, 46], text: "Zener barrier", sub: "fuse, resistor, zeners to earth" }, { p: [REEL[0], REEL[1] - RR + 2, 27], text: Math.round(len) + " m of cable", sub: capNF(len).toFixed(0) + " nF, charged to " + volts + " V" },
  ], E.xray, E.fs < 0.62 ? {} : { topL: 70, topR: 70 });
  if (sceneG.innerHTML !== svg) sceneG.innerHTML = svg;
  if (K.c >= 0) { const A = 7 * Math.exp(-K.c / 0.35); setShake(A * Math.sin(K.c * 90), A * Math.cos(K.c * 71)); flashEl.style.opacity = (0.8 * burst(K.c, 0.03, 0.22)).toFixed(3); }
  else if (boomAt !== null && now - boomAt > BOOM_END) {
    boomAt = null; setShake(0, 0); flashEl.style.opacity = "0";
    ui.shot.textContent = "Reset. Shorter cable, lower voltage, or a gas that's harder to light.";
  }
  const text = K.c >= 0 ? (K.c < 3.0 ? "BOOM · the spark lit Zone 1" : "resetting…")
    : g.id + " MIE " + g.mie + " µJ · " + volts + " V · " + Math.round(len) + " m = " + capNF(len).toFixed(0) + " nF · spark " + (En < 10 ? En.toFixed(1) : Math.round(En)) + " µJ · " + (En >= g.mie ? "ignites" : "safe");
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuenow", String(Math.round(len)));
  stage.setAttribute("aria-valuetext", text);
}

// demo: hydrogen first, cable creeping out until it goes; then the others
const TOUR = [[3, 24, 100], [3, 24, 220], [3, 24, 380], [2, 24, 700], [2, 24, 1300], [1, 24, 2600], [1, 24, 4500], [0, 12, 5000]];
function tick(t) {
  const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
  last = t;
  now += dt * (slow ? 0.12 : 1);
  if (touring && !booming()) {
    tourClock += dt;
    const step = Math.floor(tourClock / 3.2) % TOUR.length;
    if (step !== tourStep) { tourStep = step; const [g2, v2, l2] = TOUR[step]; gas = g2; volts = v2; len = l2; }
    if (tourClock % 3.2 > 1.2 && now - lastFire > 2.5) fire();
  }
  if (auto && !booming() && now - lastFire > 3.2 * (slow ? 1.2 : 1)) fire();
  draw(dt * (slow ? 0.12 : 1)); syncUi();
  const busy = touring || auto || now - sparkAt < 3.2 || boomAt !== null || drag;
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { touring = false; };
const setLen = (v) => { takeOver(); if (booming()) return; len = clamp(Math.round(v / 10) * 10, 0, D.L_MAX); run(); };
const setV = (v) => { takeOver(); if (booming()) return; volts = clamp(Math.round(v), D.V_MIN, D.V_MAX); run(); };
const setGas = (i) => { takeOver(); if (booming()) return; gas = (i + GASES.length) % GASES.length; run(); };
const shoot = () => { takeOver(); fire(); run(); };
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;

ui.gas.forEach((b, i) => b.addEventListener("click", () => setGas(i)));
ui.v.addEventListener("input", () => { slidingV = true; setV(+ui.v.value); });
ui.v.addEventListener("change", () => { slidingV = false; run(); });
ui.len.addEventListener("input", () => { slidingL = true; setLen(+ui.len.value); });
ui.len.addEventListener("change", () => { slidingL = false; run(); });
ui.fire.addEventListener("click", shoot);
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.auto.addEventListener("click", () => { takeOver(); auto = !auto; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { auto = false; tourClock = 0; tourStep = -1; } run(); });
// on the figure: drag the drum sideways to pay out cable (anywhere else turns the view), tap a bottle for gas, tap anything else for a spark
let drag = null;
const ptOf = (ev) => { const m0 = overEl.getScreenCTM(); if (!m0) return null; const pt = overEl.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; const q2 = pt.matrixTransform(m0.inverse()); return [q2.x, q2.y]; };
function hitAt(ev) {
  const q2 = ptOf(ev); if (!q2 || ev.target.closest(".mk-tools,button,a")) return null;
  for (const [i, b] of D.BOTTLES.entries()) { const a = E.project([b.at[0], b.at[1], 4]), c = E.project([b.at[0], b.at[1], 54]), t = clamp((q2[1] - a[1]) / ((c[1] - a[1]) || 1), 0, 1); if (Math.hypot(q2[0] - (a[0] + (c[0] - a[0]) * t), q2[1] - (a[1] + (c[1] - a[1]) * t)) < 14) return { bottle: i }; }
  const c = E.project([REEL[0], REEL[1], 16]), rx = Math.abs(E.project([REEL[0] + RR, REEL[1] - RR, 0])[0] - E.project([REEL[0] - RR, REEL[1] + RR, 0])[0]) / 2;
  if (Math.abs(q2[0] - c[0]) < rx && Math.abs(q2[1] - c[1]) < rx * 0.75) return { reel: true };
  return {};
}
stage.addEventListener("pointerdown", (ev) => { const h = hitAt(ev); if (!h) return; drag = { x: ev.clientX, y: ev.clientY, from: len, moved: false, reel: !!h.reel, bottle: h.bottle }; if (h.reel) { ev.stopPropagation(); stage.setPointerCapture(ev.pointerId); } }, true);
stage.addEventListener("pointermove", (ev) => {
  if (!drag) { if (ev.pointerType !== "touch" && !ev.buttons) { const h = hitAt(ev); stage.style.cursor = h && h.reel ? "ew-resize" : h && h.bottle !== undefined ? "pointer" : ""; } return; }
  const dx = ev.clientX - drag.x;
  if (!drag.moved && Math.hypot(dx, ev.clientY - drag.y) < 5) return;
  drag.moved = true;
  if (drag.reel) setLen(drag.from + dx / stage.getBoundingClientRect().width * D.L_MAX * 1.2);
});
stage.addEventListener("pointerup", () => { if (!drag) return; const was = drag; drag = null; if (was.moved) { run(); return; } if (was.bottle !== undefined) setGas(was.bottle); else shoot(); });
stage.addEventListener("pointercancel", () => { drag = null; });

stage.addEventListener("keydown", (ev) => {
  if (ev.key === "ArrowRight") { ev.preventDefault(); setLen(len + (ev.shiftKey ? 500 : 50)); }
  else if (ev.key === "ArrowLeft") { ev.preventDefault(); setLen(len - (ev.shiftKey ? 500 : 50)); }
  else if (ev.key === "ArrowUp") { ev.preventDefault(); setV(volts + 1); }
  else if (ev.key === "ArrowDown") { ev.preventDefault(); setV(volts - 1); }
  else if (ev.key === "g" || ev.key === "G") { ev.preventDefault(); setGas(gas + 1); }
  else if (ev.key === " " || ev.key === "Enter" || ev.key === "f") { ev.preventDefault(); shoot(); }
  else if (ev.key === "s") { slow = !slow; run(); }
  else if (ev.key === "x" || ev.key === "X") { setX(!E.xrayOn); run(); }
});
window.__fig = { E, freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
setX(true); syncUi(); draw();
`;

const CSS = `.fx-flash{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(circle 70% at 64% 46%,#fff8e8 0%,#ffd9a0 40%,rgba(255,170,90,0) 100%)}
.pt{font-family:var(--anatomy-mono);fill:#23262b;font-weight:700}.pt.lo{fill:#5a6068;font-weight:600}.pt.sel{fill:#d0501a}.pt.lcd{fill:#9ff0c0}.pt.bench{fill:var(--anatomy-muted);font-weight:600;letter-spacing:.08em;opacity:.8}
.elab{font-size:calc(13px*var(--mk-ts,1))}.elab[data-s="ok"]{fill:var(--mk-good)}.elab[data-s="bad"]{fill:var(--mk-danger)}
.mk-hint{top:46px}
.ctl #fire{padding:7px 14px;font-weight:600;letter-spacing:.06em}
.meter{margin-top:12px}#meter-fill[data-bad="true"]{background:var(--mk-danger)}#meter-mie{left:50%}`;

const stage = stageHtml({
  W, H, fig: "Fig 4", title: "Ex i, cable length", xray: true,
  label: "A bench split into a safe area and Zone 1. In the safe area a zener barrier on a DIN rail feeds a blue cable that runs through a drum and across the bench to an open junction box on a transmitter stand in Zone 1. Breaking the wire at the junction box makes a spark whose energy comes from the cable's stored charge. An x-ray mode shows inside the barrier and how charged the cable is.",
  keysHelp: "Cable length: drag the drum to pay out cable, drag anywhere else to rotate, X for x-ray, drag sideways or use arrow keys; up and down change voltage; space makes a spark",
  extra: `<div class="fx-flash" aria-hidden="true"></div>`,
});

const CONTROLS = `<div class="ctl" role="group" aria-label="Test controls">
  <div class="ctl-row"><span class="ctl-label">Gas</span>${GASES.map((g, i) => `<button type="button" data-gas="${i}" aria-pressed="${i === START.gas}">${g.id}<small>${g.group} · ${g.mie} µJ</small></button>`).join("")}</div>
  <div class="ctl-row"><span class="ctl-label">Volts</span><div class="slide"><input id="volts" type="range" min="${V_MIN}" max="${V_MAX}" step="1" value="${START.v}" aria-label="Barrier voltage"></div><output id="volts-out">${START.v} V</output></div>
  <div class="ctl-row"><span class="ctl-label">Cable</span><div class="slide"><input id="len" type="range" min="0" max="${L_MAX}" step="10" value="${START.len}" aria-label="Cable length in metres"></div><output id="len-out">${START.len} m</output></div>
  <div class="ctl-row"><span class="ctl-label">Spark</span><div class="meter" aria-hidden="true"><span id="meter-fill" class="fill"></span><span id="meter-mie" class="mark" data-label="MIE"></span></div><output id="energy-out">0 µJ</output></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="fire" class="danger">SPARK</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="auto" aria-pressed="false">Auto</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
</div>`;


const foot = footHtml({
  theme, slug: "ex-i-spark",
  real: "the MIE values and 200 pF/m.",
  made: "the rest. Real IS checks use the ignition curves in the standard with safety factors, not raw MIE.",
});
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), pageMk2({
  k, title: "Ex i, cable length", fig: "Fig 4", hint: "Drag: cable · tap: spark", theme, W, H, stage, controls: CONTROLS, css: CSS, foot,
  caption: "An intrinsically safe loop stores energy in its cable: about 200 pF per metre, charged to the barrier voltage. Let a wire come off its terminal live (an open circuit) and that energy comes out as a spark, ½CV². Under the gas's minimum ignition energy it fizzles; over it, Zone 1 goes up. More cable means more capacitance, so a loop that was fine at 50 m can be a bomb at 500 m. MIE values: methane 280, propane 250, ethylene 70, hydrogen 17 µJ.",
  script: LIVE.replace("__DATA__", JSON.stringify(DATA)),
}));
console.log("wrote", name);
