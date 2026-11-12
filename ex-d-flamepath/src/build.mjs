import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { engineScript, stageHtml, pageMk2, footHtml } from "../../mk2/shell.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const W = 960, H = 600;

// Truth: reference-gas MESG (g0, mm) as tabled by IECEx ExTAG for the IEC 60079-20-1 reference gases.
const GASES = [
  { id: "CH4", group: "I", mesg: 1.14 },
  { id: "C3H8", group: "IIA", mesg: 0.92 },
  { id: "C2H4", group: "IIB", mesg: 0.65 },
  { id: "H2", group: "IIC", mesg: 0.29 },
];
const GAP_MAX = 1.3;
const VIS = 13; // world units of lift per mm of gap (enlarged)
const CUT = 6; // the cutaway removes x > CUT and y > CUT
const OUT = { x: -40, y: -36, w: 80, d: 72 }; // body outside
const WALL = 4;
const CAV = { x: -36, y: -32, w: 72, d: 64 }; // cavity
const FLOOR_TOP = 8;
const BODY_TOP = 52;
const FLANGE = { x: -46, y: -42, w: 92, d: 84 };
const FW = 12; // flamepath width, drawn: stands for 25 mm
const FLANGE_TOP = 60;
const LID_H = 8;
const BOSS = { x: -33, y: -29, w: 66, d: 58 };
const BOSS_H = 5;
const LID_TOP = FLANGE_TOP + LID_H + BOSS_H;
const SPARK = [-14, -10, 22];

const BOLTS = [[-39.5, -35.5], [39.5, -35.5], [-39.5, 35.5], [0, -35.5], [0, 35.5], [-39.5, 0], [39.5, 0]];
const FRONT_BOLT = ([x, y]) => x > CUT - 10 && y > -10 && (x > 30 || y > 30);

const BOTTLES = GASES.map((g, i) => ({ ...g, at: [-118, -4 + i * 24] }));
const BOTTLE_R = 8;
const BOTTLE_H = 46;

const TIP = [20, -18];
const POST = [84, -18];
const DIAL_R = 15;
const DIAL_Z = 116;
const DIAL_H = 9;
const DIAL_TOP = DIAL_Z + DIAL_H;
const SLEEVE_FROM = 88;
const PLUNGER_LEN = 22;

const START = { gas: 1, gap: 0.4 };
const PLATE = { x: -150, y: -84, w: 290, d: 166, r: 8 };
const P = k.fitProjection([...k.boxCorners(PLATE, -0.8, 0), [20, -18, 127], [84, -18, 133], [-118, 70, 62], [-46, -42, 80]], W, H, { pad: 22, azimuth: 45, elevation: 30 });
const DATA = { W, H, P, PLATE };
Object.assign(DATA, { GASES, BOLTS, FLANGE, TIP, VIS, GAP_MAX, FLANGE_TOP, DIAL_R, DIAL_TOP, DIAL_Z, CUT, CAV, SPARK, OUT, BODY_TOP, POST, BOTTLES, start: START, GEO: { WALL, FLOOR_TOP, LID_H, BOSS, LID_TOP, BOTTLE_R, BOTTLE_H, SLEEVE_FROM, PLUNGER_LEN } });
const LIVE = `
${engineScript()}
const D = __DATA__;
const stage = document.querySelector(".mk-stage");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lightTheme = document.body.dataset.theme === "light";
const E = mk2(stage, D.P, { W: D.W, H: D.H, pivot: [0, 0, 44], plate: { ...D.PLATE, h: 12, foot: 5 }, shadowBox: [-158, -92, -18, 148, 90, 140] });
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
const P = D.P, GASES = D.GASES, BOLTS = D.BOLTS, TIP = D.TIP, VIS = D.VIS, GAP_MAX = D.GAP_MAX, FLANGE_TOP = D.FLANGE_TOP;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const burst = (age, rise, fall) => (age > 0 ? smooth(0, rise, age) * Math.exp(-Math.max(0, age - rise) / fall) : 0);
let gas = D.start.gas, gap = D.start.gap, target = gap;
let drag = null, sliding = false, slidingL = false;
let frame = 0, last = 0, clock = 0, touring = true, visible = false, slow = false, auto = false, lastShot = null;
let bang = -10, now = 0, through = false, quench = 0.5, boomAt = null;
// path length is a toy dial: 0..100, notch at NOTCH. Below it the joint is too short to cool the flame.
const NOTCH = 40;
let pathL = 70;
const fwOf = (L) => 9 + L * 0.08;
const tooShort = () => pathL < NOTCH;
const travel = () => 0.28 * fwOf(pathL) / 13.5 - 0.28;
const PERIOD = 3.2;
const CYCLE = 12.8;
function frameAt() {
  const age = now - bang;
  const calm = still.matches;
  const x = travel();
  const fade = calm ? 0 : burst(age, 0.02, 0.9 + x);
  const jet = calm ? 0 : burst(age - 0.36 - x, 0.06, 0.55);
  const haze = calm ? 0 : burst(age - 0.36 - x, 0.12, 0.9);
  const ignite = calm ? 0 : burst(age - 0.42 - x, 0.15, 0.7);
  return { age, fade, jet, haze, ignite };
}
const BOOM_END = 4.2;
const booming = () => boomAt !== null && now - boomAt < BOOM_END;
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// a part that tips over onto the bench: overshoots, bounces, settles
const tip = (c, delay, target) => { const u = Math.max(0, c - delay); return u <= 0 ? 0 : target * (1 - Math.exp(-u / 0.11) * Math.cos(u * 13)); };
function chaos() {
  if (boomAt === null) return { c: -1, back: 0 };
  const c = now - boomAt;
  if (c < 0 || c > BOOM_END) return { c: -1, back: 0 };
  return { c, back: 1 - sm(3.0, 3.9, c) };
}
const ui = {
  len: document.querySelector("#len"), lenOut: document.querySelector("#len-out"),
  gap: document.querySelector("#gap"), gapOut: document.querySelector("#gap-out"), mark: document.querySelector("#mesg-mark"),
  gas: [...document.querySelectorAll("[data-gas]")], fire: document.querySelector("#fire"), slow: document.querySelector("#slow"),
  auto: document.querySelector("#auto"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"),
};
function syncUi() {
  const g = GASES[gas];
  ui.gas.forEach((b, i) => b.setAttribute("aria-pressed", String(i === gas)));
  ui.mark.style.left = (g.mesg / GAP_MAX * 100) + "%";
  ui.mark.dataset.label = "MESG " + g.mesg.toFixed(2);
  if (!slidingL) ui.len.value = pathL;
  ui.lenOut.textContent = tooShort() ? "too short" : "ok";
  ui.lenOut.dataset.bad = String(tooShort());
  if (!sliding) ui.gap.value = target.toFixed(2);
  ui.gapOut.textContent = target.toFixed(2) + " mm";
  ui.slow.setAttribute("aria-pressed", String(slow));
  ui.auto.setAttribute("aria-pressed", String(auto));
  ui.tour.setAttribute("aria-pressed", String(touring));
}
// ---------------- the enclosure, the dial gauge and the bottles, in real 3D ----------------
const TAU = Math.PI * 2, CUT = D.CUT, OUT = D.OUT, CAV = D.CAV, FL = D.FLANGE, G3 = D.GEO, rn = () => Math.random();
const flashEl = stage.querySelector(".fx-flash");
const CAST = "#7d8a94", CAST2 = "#93a0aa";
// everything on the enclosure is in two pieces: the bulk, and the front quarter that the x-ray takes away
const lRing = ({ x, y, w, d }) => [[x, y], [x + w, y], [x + w, CUT], [CUT, CUT], [CUT, y + d], [x, y + d]];
const qRing = ({ x, y, w, d }) => [[CUT, CUT], [x + w, CUT], [x + w, y + d], [CUT, y + d]];
const cutPair = (plan, z0, z1, col, o = {}) => [prism(lRing(plan), "z", z0, z1, col, { bevel: 0, ...o }), prism(qRing(plan), "z", z0, z1, col, { bevel: 0, ...o, xhide: true })];
// a rectangular ring (flange, walls): four bars, each split at the cut
function ringBars(outer, t, z0, z1, col, o = {}) {
  const { x, y, w, d } = outer, bars = [{ x, y, w, d: t }, { x, y: y + d - t, w, d: t }, { x, y: y + t, w: t, d: d - 2 * t }, { x: x + w - t, y: y + t, w: t, d: d - 2 * t }], out = [];
  for (const b of bars) {
    // the part of this bar outside the cut quadrant, and the part inside it
    const inQ = (px, py) => px >= CUT && py >= CUT, x0 = b.x, x1 = b.x + b.w, y0 = b.y, y1 = b.y + b.d;
    const xs = [x0, Math.min(Math.max(CUT, x0), x1), x1], ys = [y0, Math.min(Math.max(CUT, y0), y1), y1];
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { if (xs[i + 1] - xs[i] < 0.01 || ys[j + 1] - ys[j] < 0.01) continue; out.push(box(xs[i], xs[i + 1], ys[j], ys[j + 1], z0, z1, col, { bevel: 0, ...o, xhide: inQ((xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2) })); }
  }
  return out;
}
function benchStatic() {
  const o = [], MT = { mat: "paint" };
  // mounting lugs, plinth and floor
  for (const [x, y] of [[OUT.x - 8, OUT.y + 8], [OUT.x - 8, OUT.y + OUT.d - 8], [OUT.x + OUT.w + 8, OUT.y + 8], [OUT.x + OUT.w + 8, OUT.y + OUT.d - 8]]) o.push(prism(rrect(x - 7, x + 7, y - 6, y + 6, 3), "z", 0, 4, CAST, MT), cyl(x, y, 3, 4, 5.4, "#aeb4bb", 6, { mat: "steel" }));
  o.push(...cutPair({ x: OUT.x - 3, y: OUT.y - 3, w: OUT.w + 6, d: OUT.d + 6 }, 0, 4, CAST, MT), ...cutPair(OUT, 4, G3.FLOOR_TOP, CAST, MT));
  // the cast walls, ribbed on the outside
  o.push(...ringBars(OUT, G3.WALL, G3.FLOOR_TOP, D.BODY_TOP, CAST, MT));
  for (let y = OUT.y + 8; y <= OUT.y + OUT.d - 6; y += 7) o.push(box(OUT.x + OUT.w, OUT.x + OUT.w + 1.2, y - 0.8, y + 0.8, 14, 46, CAST2, { ...MT, bevel: 0, xhide: y > CUT - 1 }));
  for (let x = OUT.x + 8; x <= OUT.x + OUT.w - 6; x += 7) o.push(box(x - 0.8, x + 0.8, OUT.y + OUT.d, OUT.y + OUT.d + 1.2, 14, 46, CAST2, { ...MT, bevel: 0, xhide: x > CUT - 1 }));
  // nameplate on the +y face, earth stud
  o.push(box(-30, -2, OUT.y + OUT.d, OUT.y + OUT.d + 1.6, 27, 42, "#e9e6df", { mat: "matte", bevel: 0 }));
  o.push(prism(rrect(44, 54, -12, -2, 2), "z", 0, 3, CAST, MT), cyl(49, -7, 2.4, 3, 7, "#c9a24a", 6, { mat: "metal" }), cyl(49, -7, 1.1, 7, 10, "#c9a24a", 10, { mat: "metal" }));
  // the igniter on the floor of the box
  const [sx, sy] = D.SPARK;
  o.push(cyl(sx, sy, 5, G3.FLOOR_TOP, G3.FLOOR_TOP + 2, "#aeb4bb", 6, { mat: "steel" }), cyl(sx, sy, 3, G3.FLOOR_TOP + 2, G3.FLOOR_TOP + 9, "#f1efe9", 16, { mat: "gloss" }), cyl(sx, sy, 1, G3.FLOOR_TOP + 9, D.SPARK[2] - 1, "#8f959d", 8, { mat: "steel" }));
  // gas bottles' name tags on the bench
  for (const b of D.BOTTLES) o.push(prism(rrect(b.at[0] + 12, b.at[0] + 38, b.at[1] - 7, b.at[1] + 7, 1.4), "z", 0, 1, "#e9e6df", { mat: "matte" }));
  return o;
}
function bottleParts(sel) {
  const R = G3.BOTTLE_R, Hh = G3.BOTTLE_H, top = 4.4 + Hh, o = [];
  o.push(cyl(0, 0, R + 1.2, 2, 4.4, "#3a3d42", 24, { mat: "rubber" }));
  o.push(lathe([[0, 4.4], [R, 4.4], [R, top - 6], [R - 1.2, top - 2], [5.6, top], [5.6, top + 3], [2.6, top + 3], [2.6, top + 7], [4.4, top + 7], [4.4, top + 8.6], [0, top + 8.6]], sel ? "#e2742a" : "#8f9aa4", { c: [0, 0, 0], seg: 28, mat: "paint", emit: sel ? ["#ff7a2a", 0.05] : undefined }));
  for (const z of [4.4 + Hh * 0.62, 4.4 + Hh * 0.78]) o.push(lathe([[R + 0.15, z], [R + 0.15, z + 1.2]], sel ? "#f4f2ec" : "#c9ced3", { c: [0, 0, 0], seg: 28, mat: "paint" }));
  return o;
}
function standParts() {
  const o = [], [px, py] = D.POST, [tx, ty] = D.TIP, MT = { mat: "paint" }, cz = D.DIAL_Z + 2;
  o.push(prism(rrect(px - 14, px + 16, py - 15, py + 15, 3), "z", 0, 10, "#2f3338", MT), prism(rrect(px - 13.2, px + 15.2, py - 14.2, py + 14.2, 3), "z", 10, 20, "#c0392b", MT));
  o.push(cyl(px + 9, py + 8, 5, 20, 24, "#2a2d31", 20, { mat: "plastic" }), cyl(px, py, 4.5, 20, 23, "#aeb4bb", 20, { mat: "steel" }), cyl(px, py, 2.8, 23, D.DIAL_TOP + 8, "#c9ced3", 16, { mat: "chrome" }), cyl(px, py, 3.3, D.DIAL_TOP + 8, D.DIAL_TOP + 9.6, "#aeb4bb", 16, { mat: "steel" }));
  o.push(prism(rrect(px - 6, px + 6, py - 6, py + 6, 2.4), "z", cz - 4, cz + 7, "#3a3e44", MT), cyl(px, py + 9, 2.4, cz - 2, cz + 4, "#2a2d31", 12, { mat: "plastic" }));
  o.push(prism(rrect(tx + D.DIAL_R + 2, px - 6, py - 3, py + 3, 1.6), "z", cz, cz + 4, "#aeb4bb", { mat: "steel" }));
  // the dial gauge: sleeve, body, bezel, and a face with a tick every 0.01 mm
  o.push(cyl(tx, ty, 2.6, G3.SLEEVE_FROM, D.DIAL_Z, "#aeb4bb", 14, { mat: "steel" }), box(tx + D.DIAL_R - 3, tx + D.DIAL_R + 5, ty - 3, ty + 3, D.DIAL_Z + 1, D.DIAL_Z + 7, "#aeb4bb", { mat: "steel" }));
  o.push(lathe([[0, D.DIAL_Z], [D.DIAL_R, D.DIAL_Z], [D.DIAL_R, D.DIAL_TOP], [D.DIAL_R - 1.6, D.DIAL_TOP], [D.DIAL_R - 1.6, D.DIAL_TOP - 0.8], [0, D.DIAL_TOP - 0.8]], "#2f3338", { c: [tx, ty, 0], seg: 48, mat: "paint" }), cyl(tx, ty, D.DIAL_R - 1.7, D.DIAL_TOP - 0.9, D.DIAL_TOP - 0.5, "#f4f2ec", 40, { mat: "matte", bevel: 0 }));
  for (let i = 0; i < 100; i++) { const a = (i / 100) * TAU, major = i % 10 === 0, r0 = D.DIAL_R - 2.6 - (major ? 2.4 : 1), r1 = D.DIAL_R - 2.4, s = Math.sin(a), c = Math.cos(a), w = major ? 0.28 : 0.14; o.push(prism([[tx + s * r0 - c * w, ty - c * r0 - s * w], [tx + s * r1 - c * w, ty - c * r1 - s * w], [tx + s * r1 + c * w, ty - c * r1 + s * w], [tx + s * r0 + c * w, ty - c * r0 + s * w]], "z", D.DIAL_TOP - 0.5, D.DIAL_TOP - 0.42, "#23262b", { bevel: 0, flat: true })); }
  return o;
}
const tipM = (piv, ang, axis) => { const c = Math.cos(ang), s = Math.sin(ang), R = axis === "x" ? [1, 0, 0, 0, c, -s, 0, s, c] : [c, 0, s, 0, 1, 0, -s, 0, c]; return [...R, ...[0, 1, 2].map((i) => piv[i] - (R[i * 3] * piv[0] + R[i * 3 + 1] * piv[1] + R[i * 3 + 2] * piv[2]))]; };
let fx = [], firedAt = -10;
function draw(dt = 0) {
  const lift = gap * VIS, K = chaos(), f = frameAt(), g = GASES[gas], FW = fwOf(pathL), live = [], objs = [{ cache: "bench", rev: 0, parts: benchStatic }];
  // the body flange: its width is the length of the flamepath
  live.push(...ringBars(FL, FW, D.BODY_TOP, FLANGE_TOP, CAST, { mat: "paint" }));
  // the lid: lifted by the gap (drawn heavily enlarged), or on its way across the room
  let lidXf = (p) => [p[0], p[1], p[2] + lift];
  if (K.c >= 0) { const c = K.c, land = 0.97, cl = Math.min(c, land), a = 9.4 * cl * K.back, ca = Math.cos(a), sa = Math.sin(a), up = c < land ? 330 * c - 340 * c * c : 0; lidXf = (p) => { const dx = p[0], dz = p[2] - (FLANGE_TOP + 4); return [(110 * cl) * K.back + dx * ca + dz * sa, p[1] + 26 * cl * K.back, Math.max(K.back > 0.5 ? 4 : 0, (FLANGE_TOP + 4 + lift) + (up - (c >= land ? FLANGE_TOP : 0)) * K.back - dx * sa + dz * ca)]; }; }
  const lidParts = [...cutPair(FL, FLANGE_TOP, FLANGE_TOP + G3.LID_H, CAST2, { mat: "paint" }), ...cutPair(G3.BOSS, FLANGE_TOP + G3.LID_H, G3.LID_TOP, CAST2, { mat: "paint" })];
  for (const [x, y] of BOLTS) { const q4 = x > CUT - 4 && y > CUT - 4; lidParts.push(cyl(x, y, 3.9, FLANGE_TOP + G3.LID_H, FLANGE_TOP + G3.LID_H + 0.6, "#aeb4bb", 16, { mat: "steel", xhide: q4 }), cyl(x, y, 3.2, FLANGE_TOP + G3.LID_H + 0.6, FLANGE_TOP + G3.LID_H + 3.4, "#c9ced3", 6, { mat: "steel", xhide: q4 })); }
  // the gauge's plunger rides on the lid
  lidParts.push(cyl(TIP[0], TIP[1], 2.4, G3.LID_TOP, G3.LID_TOP + 1.4, "#e2742a", 14, { mat: "paint" }), cyl(TIP[0], TIP[1], 1.3, G3.LID_TOP + 1.4, G3.LID_TOP + 1.4 + G3.PLUNGER_LEN, "#e2742a", 10, { mat: "paint" }));
  objs.push({ parts: lidParts, xf: lidXf });
  // bolt shanks stretched across the gap (sheared when it goes)
  const sheared = K.c >= 0 && K.c < 3.4;
  if (!sheared && lift > 0.05) for (const [x, y] of BOLTS) live.push(cyl(x, y, 2.1, FLANGE_TOP, FLANGE_TOP + lift, "#8f959d", 10, { mat: "steel", bevel: 0, xhide: x > CUT - 4 && y > CUT - 4 }));
  // the bottles: the picked one is orange; on a bang they go over one after another
  D.BOTTLES.forEach((b, i) => { const a = K.c >= 0 ? (tip(K.c, 0.05 + 0.06 * i, 86) * K.back * Math.PI) / 180 : 0, sl = K.c >= 0 ? -18 * sm(0.05 + 0.06 * i, 0.6, K.c) * K.back : 0; let m = [1, 0, 0, 0, 1, 0, 0, 0, 1, b.at[0] + sl, b.at[1], 0]; if (a) { const t = tipM([-G3.BOTTLE_R, 0, 2], -a, "y"); m = [t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7], t[8], t[9] + b.at[0] + sl, t[10] + b.at[1], t[11]]; } objs.push({ cache: "bottle" + (i === gas ? "S" : "N"), rev: 0, m, parts: () => bottleParts(i === gas) }); });
  // the gauge stand tips over too
  const sa2 = K.c >= 0 ? (tip(K.c, 0.08, 80) * K.back * Math.PI) / 180 : 0;
  objs.push({ cache: "stand", rev: 0, m: sa2 ? tipM([D.POST[0] + 16, D.POST[1], 0], sa2, "y") : undefined, parts: standParts });
  // needle and the MESG mark on the dial face (they turn with the stand)
  const standXf = sa2 ? ((m) => (p) => [m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[9], m[3] * p[0] + m[4] * p[1] + m[5] * p[2] + m[10], m[6] * p[0] + m[7] * p[1] + m[8] * p[2] + m[11]])(tipM([D.POST[0] + 16, D.POST[1], 0], sa2, "y")) : undefined;
  const hand = (turn, r0, r1, w, col, z, em) => { const a = turn * TAU, s = Math.sin(a), c = Math.cos(a), [x, y] = TIP; return prism([[x + s * r0 - c * w, y - c * r0 - s * w], [x + s * r1 - c * w, y - c * r1 - s * w], [x + s * r1 + c * w, y - c * r1 + s * w], [x + s * r0 + c * w, y - c * r0 + s * w]], "z", z, z + 0.3, col, { bevel: 0, flat: true, emit: em }); };
  objs.push({ xf: standXf, parts: [hand(K.c >= 0 && K.c < 3 ? 0 : gap, -3, D.DIAL_R - 4, 0.45, "#e2501a", D.DIAL_TOP - 0.3, ["#ff6a2a", 0.5]), hand(g.mesg, D.DIAL_R - 6.5, D.DIAL_R - 2.2, 0.5, "#d0342c", D.DIAL_TOP - 0.38), cyl(TIP[0], TIP[1], 1.4, D.DIAL_TOP - 0.5, D.DIAL_TOP + 0.3, "#2f3338", 10, { mat: "plastic" })] });
  // inside the joint, on the cut faces: how far the flame gets before the metal has taken its heat
  if (E.xray > 0.3 && f.fade > 0.02 && lift > 0.05 && K.c < 0) {
    const reach = (through ? 1 : quench) * FW * clamp((f.age - 0.1) / 0.3, 0, 1), col = through ? "#ffd27a" : "#ff8a3a", z0 = FLANGE_TOP + 0.05, z1 = FLANGE_TOP + lift - 0.05, o2 = { flat: true, bevel: 0, emit: [col, f.fade], emitK: 2.4, opacity: 0.9 };
    if (reach > 0.2) live.push(box(FL.x + FL.w - FW, FL.x + FL.w - FW + reach, CUT - 0.4, CUT + 0.1, z0, z1, col, o2), box(CUT - 0.4, CUT + 0.1, FL.y + FL.d - FW, FL.y + FL.d - FW + reach, z0, z1, col, o2));
  }
  objs.push({ parts: live });
  let svg = E.render(objs);
  // the shot: fire inside the box, then whatever gets out of the joint
  const [sx, sy, sz] = D.SPARK;
  if (f.fade > 0.01) { E.sprite([sx, sy, sz + 4], 10 + 26 * Math.min(1, f.age * 4), "#ffe9a8", 0.9 * f.fade, true, 1); E.sprite([0, 0, 30], 46, "#ff9a2e", 0.5 * f.fade, true, 1); if (f.age < 0.12) for (let j = 0; j < 3; j++) E.line([sx, sy, sz], [sx + (rn() - 0.5) * 8, sy + (rn() - 0.5) * 8, sz + rn() * 8], 2, "#ffffff", 1, true); }
  if (dt > 0 && f.fade > 0.05 && f.age < 0.5) for (let j = 0; j < 3; j++) fx.push({ k: "flame", p: [CAV.x + rn() * CAV.w, CAV.y + rn() * CAV.d, 12 + rn() * 34], v: [(rn() - 0.5) * 30, (rn() - 0.5) * 30, 10 + rn() * 30], life: 0, max: 0.25 + rn() * 0.25, s: 1.1 });
  if (dt > 0 && f.jet > 0.03 && lift > 0.05) {
    // round the whole joint: flame if it got through, a puff of cooled gas if it didn't
    const n = through ? 9 : 3, z = FLANGE_TOP + lift / 2;
    for (let j = 0; j < n; j++) { const u = rn() * 2 * (FL.w + FL.d); let p, nx, ny; if (u < FL.w) { p = [FL.x + u, FL.y]; nx = 0; ny = -1; } else if (u < FL.w + FL.d) { p = [FL.x + FL.w, FL.y + u - FL.w]; nx = 1; ny = 0; } else if (u < 2 * FL.w + FL.d) { p = [FL.x + u - FL.w - FL.d, FL.y + FL.d]; nx = 0; ny = 1; } else { p = [FL.x, FL.y + u - 2 * FL.w - FL.d]; nx = -1; ny = 0; }
      const sp = through ? 130 + rn() * 120 : 26 + rn() * 20; fx.push({ k: through ? "flame" : "gas", p: [p[0], p[1], z], v: [nx * sp + (rn() - 0.5) * 20, ny * sp + (rn() - 0.5) * 20, 10 + rn() * 30], life: 0, max: through ? 0.22 + rn() * 0.2 : 0.7 + rn() * 0.5, s: through ? 0.8 : 0.5 }); }
  }
  // the area going up: the outside was at the same mixture
  if (K.c >= 0 && K.c < 1.1 && dt > 0) for (let j = 0; j < 7; j++) fx.push({ k: "flame", p: [(rn() - 0.5) * 220, (rn() - 0.5) * 130, 8 + rn() * 90], v: [(rn() - 0.5) * 120, (rn() - 0.5) * 120, 40 + rn() * 120], life: 0, max: 0.5 + rn() * 0.6, s: 1.8 + rn() });
  if (K.c >= 0.3 && K.c < 3 && dt > 0 && rn() < dt * 40) fx.push({ k: "smoke", p: [(rn() - 0.5) * 200, (rn() - 0.5) * 120, 20 + rn() * 60], v: [(rn() - 0.5) * 20, (rn() - 0.5) * 20, 30 + rn() * 40], life: 0, max: 2 + rn() * 2, s: 1.6 });
  fx = fx.filter((p) => {
    p.life += dt; if (p.life > p.max) return false;
    const t = p.life / p.max;
    if (p.k !== "smoke") { p.v[0] *= 0.93; p.v[1] *= 0.93; }
    for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * dt;
    if (p.k === "flame") E.sprite(p.p, (5 + 15 * t) * p.s, t < 0.25 ? "#fff0b8" : t < 0.6 ? "#ff9a2e" : "#d8481a", 0.8 * (1 - t * t), true, 2);
    else if (p.k === "gas") E.sprite(p.p, (4 + 12 * t) * p.s, lightTheme ? "#aab4be" : "#dfe6ee", (lightTheme ? 0.4 : 0.26) * (1 - t));
    else E.sprite(p.p, (12 + 40 * t) * p.s, lightTheme ? "#4a4744" : "#2e2c2b", 0.45 * (1 - t));
    return true;
  });
  // lettering: the nameplate, the lid, the bottle tags, and the gap dimension on the cut
  let m = E.faceMatrix([-30, OUT.y + OUT.d + 1.65, 42], [1, 0, 0], [0, 0, -1]);
  if (m) svg += '<g transform="' + m + '"><text class="pt" x="2.4" y="5" font-size="3.6">Ex db</text><path class="pl" d="M2.4 8h23M2.4 10.6h23M2.4 13h16"/></g>';
  for (const [i, b] of D.BOTTLES.entries()) { m = E.faceMatrix([b.at[0] + 14.4, b.at[1] - 5, 1.05], [1, 0, 0], [0, 1, 0]); if (m) svg += '<g transform="' + m + '"><text class="pt' + (i === gas ? " sel" : "") + '" x="0" y="4.4" font-size="4.2">' + b.id + '</text><text class="pt lo" x="0" y="9.2" font-size="3">' + b.group + "  " + b.mesg.toFixed(2) + "</text></g>"; }
  if (E.xray > 0.3 && K.c < 0 && lift > 2) { const a = [FL.x + FL.w + 4, CUT, FLANGE_TOP], b = [FL.x + FL.w + 4, CUT, FLANGE_TOP + lift], p = E.project([FL.x + FL.w + 6, CUT, FLANGE_TOP + lift / 2]); E.line(a, b, 1.6, lightTheme ? "#c0281e" : "#ff8a7a", 0.95); svg += '<text class="mk-lab gap-t" x="' + (p[0] + 6).toFixed(1) + '" y="' + (p[1] + 3).toFixed(1) + '">' + gap.toFixed(2) + " mm</text>"; }
  if (E.xray > 0.02 && K.c < 0) svg += E.callouts([
    { p: [FL.x + FL.w - FW / 2, CUT, FLANGE_TOP], text: "Flamepath", sub: tooShort() ? "too short to cool the flame" : "the joint the flame has to get along" }, { p: [sx, sy, sz], text: "Igniter", sub: "lights the gas inside" },
    { p: [TIP[0], TIP[1] + D.DIAL_R, D.DIAL_TOP], text: "Dial gauge", sub: "reads the gap: one turn is 1 mm" }, { p: [D.BOTTLES[gas].at[0], D.BOTTLES[gas].at[1], 50], text: g.id + ", group " + g.group, sub: "MESG " + g.mesg.toFixed(2) + " mm" },
  ], E.xray, E.fs < 0.62 ? {} : { topL: 70, topR: 70 });
  if (sceneG.innerHTML !== svg) sceneG.innerHTML = svg;
  if (K.c >= 0) { const A = 7 * Math.exp(-K.c / 0.35); setShake(A * Math.sin(K.c * 90), A * Math.cos(K.c * 71)); flashEl.style.opacity = (0.8 * burst(K.c, 0.03, 0.22)).toFixed(3); }
  else if (boomAt !== null && now - boomAt > BOOM_END) { boomAt = null; setShake(0, 0); flashEl.style.opacity = "0"; ui.shot.textContent = "Reset. Close the gap under MESG and try again."; }
  const fails = gap >= g.mesg || tooShort();
  const text = K.c >= 0 ? (K.c < 3.0 ? "BOOM · the box failed and lit the area" : "resetting…") : g.id + " MESG " + g.mesg.toFixed(2) + " · gap " + gap.toFixed(2) + " mm" + (tooShort() ? " · path too short" : "") + " · " + (fails ? "flame through" : "holds");
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuenow", gap.toFixed(2)); stage.setAttribute("aria-valuetext", text);
}

function fire() {
  if (booming()) return;
  bang = now;
  const m = GASES[gas].mesg;
  through = gap >= m || tooShort();
  // illustrative: how far along the joint the flame survives before heat loss wins
  quench = clamp(0.92 * Math.pow(gap / m, 2), 0.04, 0.92);
  const text = gap < 0.02
    ? "Shot: " + GASES[gas].id + " with the gap shut. The box held the pressure; nothing got out."
    : through
    ? (gap >= m
        ? "Shot: " + GASES[gas].id + " at " + gap.toFixed(2) + " mm, over MESG " + m.toFixed(2) + ". Flame ran the whole joint, lit the area, and that's the plant gone."
        : "Shot: " + GASES[gas].id + " at " + gap.toFixed(2) + " mm. Gap's fine, but the joint's too short to cool the flame. It got out, and that's the plant gone.")
    : "Shot: " + GASES[gas].id + " at " + gap.toFixed(2) + " mm. Flame died in the joint; only cooled gas got out.";
  ui.shot.textContent = text;
  if (through && gap >= 0.02) boomAt = now + 0.42 + travel();
}
function tick(t) {
  const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
  last = t;
  now += dt * (slow ? 0.12 : 1);
  if (touring) {
    clock += dt;
    gas = Math.floor(clock / CYCLE) % GASES.length;
    const u = (clock % CYCLE) / CYCLE;
    target = clamp([0.45, 0.8, 1.15, 1.6][Math.floor(u * 4)] * GASES[gas].mesg, 0.05, GAP_MAX);
  }
  gap = still.matches ? target : gap + (target - gap) * (1 - Math.exp(-dt / 0.2));
  if (Math.abs(target - gap) < 0.0005) gap = target;
  const period = PERIOD * (slow ? 1 / 0.12 : 1);
  if (!still.matches && (touring || auto) && now - bang > PERIOD * (slow ? 1.2 : 1) && !booming() && (boomAt === null) && Math.abs(target - gap) < 0.01) fire();
  draw(dt * (slow ? 0.12 : 1));
  syncUi();
  const busy = touring || auto || gap !== target || now - bang < 3.5 || boomAt !== null || (drag && drag.moved);
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { touring = false; };
const setGap = (v) => { takeOver(); target = clamp(Math.round(v * 100) / 100, 0, GAP_MAX); run(); };
const setGas = (i) => { takeOver(); gas = (i + GASES.length) % GASES.length; bang = now - 10; run(); };
const shoot = () => { takeOver(); gap = target; fire(); run(); };
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;

// controls
ui.gap.addEventListener("input", () => { sliding = true; setGap(+ui.gap.value); });
ui.len.addEventListener("input", () => { slidingL = true; if (booming()) return; takeOver(); pathL = +ui.len.value; bang = now - 10; run(); });
ui.len.addEventListener("change", () => { slidingL = false; run(); });
ui.gap.addEventListener("change", () => { sliding = false; run(); });
ui.gas.forEach((b, i) => b.addEventListener("click", () => setGas(i)));
ui.fire.addEventListener("click", shoot);
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.auto.addEventListener("click", () => { takeOver(); auto = !auto; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { auto = false; clock = gas * CYCLE; } run(); });
// on the figure: drag the lid up and down to open the gap (anywhere else turns the view), tap a bottle to pick a gas, tap anything else to fire
const overEl = stage.querySelector(".mk-over");
const ptOf = (ev) => { const m0 = overEl.getScreenCTM(); if (!m0) return null; const pt = overEl.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; const q2 = pt.matrixTransform(m0.inverse()); return [q2.x, q2.y, Math.hypot(m0.a, m0.b)]; };
function hitAt(ev) {
  const q2 = ptOf(ev); if (!q2 || ev.target.closest(".mk-tools,button,a")) return null;
  for (const [i, b] of D.BOTTLES.entries()) { const a = E.project([b.at[0], b.at[1], 6]), c = E.project([b.at[0], b.at[1], 60]), t = clamp((q2[1] - a[1]) / ((c[1] - a[1]) || 1), 0, 1); if (Math.hypot(q2[0] - (a[0] + (c[0] - a[0]) * t), q2[1] - (a[1] + (c[1] - a[1]) * t)) < 15) return { bottle: i }; }
  const c = E.project([0, 0, FLANGE_TOP + gap * VIS + 6]), rx = Math.abs(E.project([46, -42, 0])[0] - E.project([-46, 42, 0])[0]) / 2;
  if (Math.abs(q2[0] - c[0]) < rx * 0.8 && Math.abs(q2[1] - c[1]) < rx * 0.42) return { lid: true, px: Math.hypot(...[0, 1].map((i) => E.project([0, 0, 1])[i] - E.project([0, 0, 0])[i])) * q2[2] };
  return {};
}
stage.addEventListener("pointerdown", (ev) => { const h = hitAt(ev); if (!h) return; drag = { y: ev.clientY, x: ev.clientX, from: target, moved: false, lid: !!h.lid, px: h.px || 1, bottle: h.bottle }; if (h.lid) { ev.stopPropagation(); stage.setPointerCapture(ev.pointerId); } }, true);
stage.addEventListener("pointermove", (ev) => {
  if (!drag) { if (ev.pointerType !== "touch" && !ev.buttons) { const h = hitAt(ev); stage.style.cursor = h && h.lid ? "ns-resize" : h && h.bottle !== undefined ? "pointer" : ""; } return; }
  const dy = drag.y - ev.clientY;
  if (!drag.moved && Math.hypot(dy, ev.clientX - drag.x) < 5) return;
  drag.moved = true;
  if (drag.lid) setGap(drag.from + dy / drag.px / VIS);
});
stage.addEventListener("pointerup", () => { if (!drag) return; const was = drag; drag = null; if (was.moved) return; if (was.bottle !== undefined) setGas(was.bottle); else shoot(); });
stage.addEventListener("pointercancel", () => { drag = null; });

stage.addEventListener("keydown", (ev) => {
  if (ev.key === "ArrowRight" || ev.key === "ArrowUp") { ev.preventDefault(); setGap(target + 0.01 * (ev.shiftKey ? 10 : 1)); }
  else if (ev.key === "ArrowLeft" || ev.key === "ArrowDown") { ev.preventDefault(); setGap(target - 0.01 * (ev.shiftKey ? 10 : 1)); }
  else if (ev.key === "g" || ev.key === "G") { ev.preventDefault(); setGas(gas + 1); }
  else if (ev.key === " " || ev.key === "Enter" || ev.key === "f") { ev.preventDefault(); shoot(); }
  else if (ev.key === "s") { slow = !slow; run(); }
  else if (ev.key === "x" || ev.key === "X") { setX(!E.xrayOn); run(); }
});
window.__fig = { E, freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; }, pose: (g, v, age) => { touring = false; visible = false; cancelAnimationFrame(frame); frame = 0; gas = g; gap = target = v; fire(); bang = now - age; draw(); syncUi(); } };
setX(true); syncUi();
draw();
`;

const CSS = `.fx-flash{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(circle 70% at 50% 50%,#ffffff 0%,#ffe9c8 40%,rgba(255,200,140,0) 100%)}
.pt{font-family:var(--anatomy-mono);fill:#23262b;font-weight:700}.pt.lo{fill:#5a6068;font-weight:600}.pt.sel{fill:#d0501a}.pl{fill:none;stroke:#8a8f96;stroke-width:.4}.gap-t{fill:#ff8a7a}body[data-theme="light"] .gap-t{fill:#c0281e}
.ctl #fire{padding:7px 18px;font-weight:600;letter-spacing:.06em}
.gap-wrap{position:relative;flex:1;min-width:110px;padding-top:16px}.gap-wrap input{width:100%;accent-color:var(--anatomy-lit);margin:0}
#len-mark{position:absolute;top:8px;bottom:-2px;width:0;border-left:2px solid var(--anatomy-mid);pointer-events:none}#len-out{min-width:58px;text-align:right}#len-out[data-bad="true"]{color:#ff6a3d}
#mesg-mark{position:absolute;top:0;bottom:2px;width:0;border-left:1px dashed #ff6a3d;pointer-events:none;transition:left .3s}#mesg-mark::after{content:attr(data-label);position:absolute;top:0;left:4px;font-size:10px;white-space:nowrap;color:#ff6a3d}`;

const stage = stageHtml({
  W, H, fig: "Fig 3", title: "Ex d flamepath, cutaway", xray: true,
  label: "A flanged flameproof enclosure on a bench plate. Its lid sits on the body flange across a gap set by the viewer and read by a dial indicator. Four reference-gas bottles stand beside it. An x-ray mode cuts the front quarter away to show the inside and the joint in section. The enclosure fires inside; below the selected gas's MESG the flame is quenched in the joint, above it flame comes out of the gap.",
  keysHelp: "Flamepath gap: drag the lid to set the gap, drag anywhere else to rotate, X for the cutaway, drag or arrow keys change the gap, G changes gas, space fires",
  extra: `<div class="fx-flash" aria-hidden="true"></div>`,
});

const CONTROLS = `<div class="ctl" role="group" aria-label="Test controls">
  <div class="ctl-row"><span class="ctl-label">Gas</span>${GASES.map((g, i) => `<button type="button" data-gas="${i}" aria-pressed="${i === START.gas}">${g.id}<small>${g.group} · ${g.mesg.toFixed(2)}</small></button>`).join("")}</div>
  <div class="ctl-row"><span class="ctl-label">Path</span><div class="gap-wrap"><span id="len-mark" aria-hidden="true" style="left:40%"></span><input id="len" type="range" min="0" max="100" step="1" value="70" aria-label="Flamepath length: below the notch it is too short"></div><output id="len-out">ok</output></div>
  <div class="ctl-row"><span class="ctl-label">Gap</span><div class="gap-wrap"><span id="mesg-mark" aria-hidden="true"></span><input id="gap" type="range" min="0" max="${GAP_MAX}" step="0.01" value="${START.gap}" aria-label="Flamepath gap in mm"></div><output id="gap-out">${START.gap.toFixed(2)} mm</output></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="fire" class="danger">FIRE</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="auto" aria-pressed="false">Auto-fire</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
</div>`;

const foot = footHtml({
  theme, slug: "ex-d-flamepath",
  real: "the MESG values, which are the reference-gas numbers tabled by IECEx ExTAG for the IEC 60079-20-1 reference gases.",
  made: "everything else. Real Ex d joints are certified well below MESG to the IEC 60079-1 tables, and the gap is drawn heavily enlarged.",
});
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), pageMk2({
  k, title: "Ex d flamepath, cutaway", fig: "Fig 3", hint: "Drag: gap · tap: fire", theme, W, H, stage, controls: CONTROLS, css: CSS, foot,
  caption: "The spark plug fires the gas inside. The flame front runs into the joint (watch the sectioned gap at the cut). Below the gas's MESG the walls pull heat out faster than the flame makes it, so it dies inside the 25 mm and only cooled gas leaves; at or above MESG it survives the full length and lights the outside. MESG (g0), IEC 60079-20-1 reference gases: methane 1.14, propane 0.92, ethylene 0.65, hydrogen 0.29 mm. Real Ex d joints are certified well below these to the IEC 60079-1 tables. How far the flame gets along the joint is illustrative; the gap is drawn heavily enlarged.",
  script: LIVE.replace("__DATA__", JSON.stringify(DATA)),
}));
console.log("wrote", name);
