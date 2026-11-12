import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { engineScript, stageHtml, pageMk2, footHtml } from "../../mk2/shell.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const W = 960, H = 600;

// Toy model. The idea is real (IEC 60079-18: keep the gas away from the sparks by burying them in compound,
// with a minimum compound thickness, a compound temperature limit, and a fuse to cap fault current); the numbers are made up.
const MODEL = { tAmb: 40, perLoad: 0.55, limit: 110, tau: 2.0, coverMin: 5, coverMax: 13, coverLo: 1 };
const PLATE_H = 12, FOOT_H = 5;
const CUT = 6;
const HOUS = { x: -50, y: -38, w: 100, d: 76 };
const WALL = 3;
const Z0 = 4, ZB = 7, ZH = 44;
const INNER = { x: HOUS.x + WALL, y: HOUS.y + WALL, w: HOUS.w - 2 * WALL, d: HOUS.d - 2 * WALL };
const PCB_Z = [10, 11.5];
const RELAY = { x: 12, y: -16, w: 28, d: 22, z0: 11.5, z1: 29 };
const RES = { x: -14, y: 11, w: 20, d: 18, z0: 11.5, z1: 24 };
const PART_TOP = 29;
const SPARK = [RELAY.x + 22.5, CUT, RELAY.z1 - 5.6];
const HOT = [CUT, RES.y + 7, 16];
const FUSE = { x: -84, y: 44, w: 16, d: 24 };
const BOTTLES = [[86, -52], [104, -38]];
const START = { cover: 9, load: 70, fuse: true };
const PLATE = { x: -96, y: -70, w: 214, d: 154, r: 8 };
const P = k.fitProjection([...k.boxCorners(PLATE, -0.8, 0), [-50, -38, 46], [86, -52, 58], [104, -38, 58], [50, 38, 46]], W, H, { pad: 22, azimuth: 45, elevation: 30 });
const DATA = { W, H, P, PLATE };
const notchPos = ((MODEL.coverMin - MODEL.coverLo) / (MODEL.coverMax - MODEL.coverLo) * 100).toFixed(1);
Object.assign(DATA, { MODEL, CUT, HOUS, INNER, ZB, ZH, PCB_Z, RELAY, RES, PART_TOP, FUSE, BOTTLES, start: START, GEO: { WALL, Z0 } });
const LIVE = `
${engineScript()}
const D = __DATA__;
const stage = document.querySelector(".mk-stage");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lightTheme = document.body.dataset.theme === "light";
const E = mk2(stage, D.P, { W: D.W, H: D.H, pivot: [4, 0, 20], plate: { ...D.PLATE, h: 12, foot: 5 }, shadowBox: [-104, -78, -18, 126, 92, 110] });
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
const M = D.MODEL, P = D.P;
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const burst = (age, rise, fall) => (age > 0 ? sm(0, rise, age) * Math.exp(-Math.max(0, age - rise) / fall) : 0);
let cover = D.start.cover, load = D.start.load, fuseIn = D.start.fuse;
let running = false, contactClosed = false, nextSwitch = 0, sparkAt = -10, temp = M.tAmb, crack = 0, faultAt = null, fuseBlownAt = null, boomAt = null, cause = "";
let frame = 0, last = 0, now = 0, visible = false, touring = true, slow = false, tourClock = 0, tourStep = -1, tourEnd = 0, lastShot = "";
const BOOM_END = 4.2;
const booming = () => boomAt !== null && now - boomAt < BOOM_END + 0.3;
const tSteady = () => M.tAmb + M.perLoad * load;
const zc = () => D.PART_TOP + cover;
const thin = () => cover < M.coverMin;
const ui = {
  cover: document.querySelector("#cover"), coverOut: document.querySelector("#cover-out"),
  load: document.querySelector("#load"), loadOut: document.querySelector("#load-out"),
  tFill: document.querySelector("#temp-fill"), tOut: document.querySelector("#temp-out"), lim: document.querySelector("#lim-mark"),
  fuseBtns: [...document.querySelectorAll("[data-fuse]")], run: document.querySelector("#run"), fault: document.querySelector("#fault"),
  slow: document.querySelector("#slow"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"),
};
const sliding = {};
const tpos = (t) => (clamp((t - 20) / (180 - 20), 0, 1) * 100).toFixed(1) + "%";
function syncUi() {
  if (!sliding.cover) ui.cover.value = cover;
  if (!sliding.load) ui.load.value = load;
  ui.coverOut.textContent = thin() ? "too thin" : "ok";
  ui.coverOut.dataset.bad = String(thin());
  ui.loadOut.textContent = load + " %";
  ui.tFill.style.width = tpos(temp);
  ui.tFill.dataset.state = temp > M.limit ? "hot" : "ok";
  ui.tOut.textContent = Math.round(temp) + " °C";
  ui.lim.style.left = tpos(M.limit);
  ui.fuseBtns.forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.fuse === "in") === fuseIn)));
  ui.run.setAttribute("aria-pressed", String(running));
  ui.run.textContent = running ? "STOP" : "SWITCH";
  ui.slow.setAttribute("aria-pressed", String(slow));
  ui.tour.setAttribute("aria-pressed", String(touring));
}
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };

function blowUp(why) {
  if (boomAt !== null) return;
  boomAt = now + 0.12; cause = why; running = false;
  say(why === "crack-thin" ? "Boom. The compound over the parts was too thin; heating and cooling cracked it right down to the relay. Gas followed the crack in, and the next contact spark lit it."
    : why === "crack-hot" ? "Boom. The parts ran hotter than the compound is rated for, it degraded and split, gas got in along the crack, and the next contact spark lit it."
    : "Boom. No fuse, so the short-circuit current just kept coming. The resistor cooked, the compound split open, and the burning part lit the gas. The fuse is part of the protection.");
}
function chaos() {
  if (boomAt === null) return { c: -1, back: 0 };
  const c = now - boomAt;
  if (c < 0 || c > BOOM_END) return { c: -1, back: 0 };
  return { c, back: 1 - sm(3.0, 3.9, c) };
}
const tip = (c, delay, target) => { const u = Math.max(0, c - delay); return u <= 0 ? 0 : target * (1 - Math.exp(-u / 0.11) * Math.cos(u * 13)); };

function step(dt) {
  if (boomAt !== null) return;
  const dead = fuseBlownAt !== null;
  const powered = running && !dead;
  // fault without a fuse: the resistor runs away
  if (faultAt !== null && !fuseIn) {
    temp += (420 - temp) * (1 - Math.exp(-dt / 0.35));
    crack = Math.min(1, crack + dt * 1.4);
    if (temp > 220 && crack >= 1) blowUp("fault");
    return;
  }
  const target = powered ? tSteady() : M.tAmb;
  temp += (target - temp) * (1 - Math.exp(-dt / (powered ? M.tau : M.tau * 1.6)));
  if (powered) {
    if (now >= nextSwitch) { contactClosed = !contactClosed; sparkAt = now; nextSwitch = now + 0.7; if (crack >= 1) blowUp(temp > M.limit ? "crack-hot" : "crack-thin"); }
    let rate = 0;
    if (thin()) rate += 0.06 + 0.3 * (M.coverMin - cover) / M.coverMin;
    if (temp > M.limit) rate += 0.15 + (temp - M.limit) / 5;
    if (rate > 0) crack = Math.min(1, crack + dt * rate * (4 / cover));
  }
}
// ---------------- the potted module, in real 3D ----------------
const TAU = Math.PI * 2, rn = () => Math.random(), HS = D.HOUS, IN = D.INNER, RL = D.RELAY, RS = D.RES, FU = D.FUSE, GEO = D.GEO;
const flashEl = stage.querySelector(".fx-flash"), overEl = stage.querySelector(".mk-over");
const SPK = [RL.x + 22.5, RL.y + RL.d / 2, RL.z1 - 5.6], HOTP = [RS.x + RS.w / 2, RS.y + RS.d / 2, 18.5], CASE = "#59616b";
const tipM = (piv, ang, axis) => { const c = Math.cos(ang), s = Math.sin(ang), R = axis === "x" ? [1, 0, 0, 0, c, -s, 0, s, c] : [c, 0, s, 0, 1, 0, -s, 0, c]; return [...R, ...[0, 1, 2].map((i) => piv[i] - (R[i * 3] * piv[0] + R[i * 3 + 1] * piv[1] + R[i * 3 + 2] * piv[2]))]; };
function benchParts() {
  const o = [], f = FU;
  // fuse holder, supply cable in, cable on to the module's gland
  o.push(prism(rrect(f.x, f.x + f.w, f.y, f.y + f.d, 1.6), "z", 0, 7, "#2f3338", { mat: "plastic" }));
  for (const y of [f.y + 4, f.y + f.d - 7]) o.push(box(f.x + 4, f.x + 5, y, y + 3, 7, 12.4, "#c9a24a", { mat: "metal", bevel: 0.2 }), box(f.x + 11, f.x + 12, y, y + 3, 7, 12.4, "#c9a24a", { mat: "metal", bevel: 0.2 }), box(f.x + 4, f.x + 12, y, y + 3, 7, 8, "#c9a24a", { mat: "metal", bevel: 0 }));
  o.push(tube([[f.x + 8, D.PLATE.y + D.PLATE.d + 4, -14], [f.x + 8, D.PLATE.y + D.PLATE.d + 3, -1], [f.x + 8, D.PLATE.y + D.PLATE.d - 3, 1.6], [f.x + 8, f.y + f.d + 3, 1.6], [f.x + 8, f.y + f.d - 1, 4]], 1.5, "#26282c", { seg: 8, mat: "rubber" }));
  o.push(tube([[f.x + 8, f.y + 1, 4], [f.x + 8, f.y - 3, 1.6], [f.x + 14, f.y - 6, 1.6], [-34, HS.y + HS.d + 16, 1.6], [-30, HS.y + HS.d + 10, 4], [-30, HS.y + HS.d + 7, 11], [-30, HS.y + HS.d + 5, 12.4]], 1.5, "#26282c", { seg: 8, mat: "rubber" }));
  return o;
}
function fuseParts(state) {
  const f = FU, o = [], y0 = f.y + 4.5, y1 = f.y + f.d - 4.5, x = f.x + 8;
  if (state === 2) { o.push(tube([[x, y0 + 0.5, 9.5], [x + 1.5, y0 + 4, 12.6], [x - 1.5, y0 + 8, 11.6], [x + 1, y0 + 12, 12.8], [x, y1 - 0.5, 9.5]], 0.6, "#d8894a", { seg: 6, mat: "copper", emit: ["#ff8a3a", 0.25] })); return o; }
  const blown = state === 1;
  o.push(tube([[x, y0 + 2.6, 11], [x, y1 - 2.6, 11]], 2.3, blown ? "#4a4a48" : "#eef3f6", { seg: 14, mat: "glass", emit: blown ? undefined : ["#cfe6ff", 0.2] }), tube([[x, y0, 11], [x, y0 + 3, 11]], 2.55, "#c9ced3", { seg: 14, mat: "steel" }), tube([[x, y1 - 3, 11], [x, y1, 11]], 2.55, "#c9ced3", { seg: 14, mat: "steel" }));
  if (!blown) o.push(tube([[x, y0 + 3, 11], [x, y1 - 3, 11]], 0.3, "#c9ced3", { seg: 5, mat: "steel" }));
  return o;
}
function housingParts() {
  const o = [], W = GEO.WALL, S = { mat: "paint", shell: true, bevel: 0.3 };
  for (const [x, y] of [[HS.x - 6, HS.y + 10], [HS.x - 6, HS.y + HS.d - 10], [HS.x + HS.w + 6, HS.y + 10], [HS.x + HS.w + 6, HS.y + HS.d - 10]]) o.push(prism(rrect(x - 6, x + 6, y - 5, y + 5, 2), "z", 0, GEO.Z0, CASE, { mat: "paint" }), cyl(x, y, 2.4, GEO.Z0, GEO.Z0 + 1.2, "#c9ced3", 6, { mat: "steel" }));
  o.push(prism(rrect(HS.x, HS.x + HS.w, HS.y, HS.y + HS.d, 2), "z", GEO.Z0, D.ZB, CASE, { mat: "paint" }));
  o.push(box(HS.x, HS.x + HS.w, HS.y, HS.y + W, D.ZB, D.ZH, CASE, S), box(HS.x, HS.x + W, HS.y + W, HS.y + HS.d - W, D.ZB, D.ZH, CASE, S), box(HS.x, HS.x + HS.w, HS.y + HS.d - W, HS.y + HS.d, D.ZB, D.ZH, CASE, S), box(HS.x + HS.w - W, HS.x + HS.w, HS.y + W, HS.y + HS.d - W, D.ZB, D.ZH, CASE, S));
  // gland and label on the front face
  const yf = HS.y + HS.d;
  o.push(prism(circle(-30, 12.4, 4.2, 6), "y", yf, yf + 2.4, "#c9a24a", { mat: "metal" }), prism(circle(-30, 12.4, 3.2, 16), "y", yf + 2.4, yf + 5.4, "#c9a24a", { mat: "metal" }));
  o.push(box(-22, 6, yf, yf + 0.5, 28, 38, "#e9e6df", { mat: "matte", bevel: 0 }));
  // the board and what's on it
  o.push(box(IN.x + 3, IN.x + IN.w - 3, IN.y + 3, IN.y + IN.d - 3, D.PCB_Z[0], D.PCB_Z[1], "#2f7d4f", { mat: "plastic", bevel: 0 }));
  const yc = RL.y + RL.d / 2;
  // relay: clear case, coil on its core, yoke, fixed contact
  o.push(box(RL.x, RL.x + RL.w, RL.y, RL.y + RL.d, RL.z0, RL.z1, "#3a4a5a", { mat: "plastic", bevel: 0.6, shell: true }));
  o.push(cyl(RL.x + 7.5, yc, 5.6, RL.z0 + 1.6, RL.z1 - 4.4, "#c0703a", 28, { mat: "satin", bevel: 0.6 }), cyl(RL.x + 7.5, yc, 6.4, RL.z0 + 0.6, RL.z0 + 1.6, "#e6dcc3", 28, { mat: "plastic", bevel: 0 }), cyl(RL.x + 7.5, yc, 6.4, RL.z1 - 4.4, RL.z1 - 3.4, "#e6dcc3", 28, { mat: "plastic", bevel: 0 }), cyl(RL.x + 7.5, yc, 2, RL.z1 - 3.4, RL.z1 - 2.9, "#aeb4bb", 14, { mat: "steel", bevel: 0 }));
  o.push(box(RL.x + 14.2, RL.x + 15.6, yc - 4, yc + 4, RL.z0 + 0.6, RL.z1 - 2.2, "#8f959d", { mat: "steel", bevel: 0.2 }));
  o.push(box(RL.x + 21.4, RL.x + 25.4, yc - 2.6, yc + 2.6, RL.z1 - 7, RL.z1 - 6.1, "#c9a24a", { mat: "metal", bevel: 0 }), box(RL.x + 24.4, RL.x + 25.4, yc - 2.6, yc + 2.6, RL.z0, RL.z1 - 7, "#c9a24a", { mat: "metal", bevel: 0 }), cyl(RL.x + 22.5, yc, 1.1, RL.z1 - 6.1, RL.z1 - 5.6, "#e2e5e8", 10, { mat: "steel", bevel: 0 }));
  // the power resistor, standing off the board on its leads
  for (const y of [RS.y + 1.2, RS.y + RS.d - 1.2]) o.push(tube([[HOTP[0], y, D.PCB_Z[1]], [HOTP[0], y, HOTP[2]]], 0.55, "#c9ced3", { seg: 6, mat: "steel" }));
  return o;
}
function resistorParts(q) {
  const h = Math.min(1, q / 10), he = h * h, col = mixHex("#6f8560", "#a8482a", he * 0.8), em = he > 0.02 ? ["#ff4a12", he * 0.75] : undefined, x = HOTP[0], z = HOTP[2];
  const o = [tube([[x, RS.y + 2.4, z], [x, RS.y + RS.d - 2.4, z]], 5.2, col, { seg: 22, mat: "plastic", emit: em }), tube([[x, RS.y + 1.2, z], [x, RS.y + 2.6, z]], 5.5, "#c9ced3", { seg: 22, mat: "steel", emit: em }), tube([[x, RS.y + RS.d - 2.6, z], [x, RS.y + RS.d - 1.2, z]], 5.5, "#c9ced3", { seg: 22, mat: "steel", emit: em })];
  for (const u of [6, 9, 12]) o.push(tube([[x, RS.y + u, z], [x, RS.y + u + 1.1, z]], 5.32, mixHex("#e9e6df", "#ffb07a", he), { seg: 22, mat: "plastic", emit: em }));
  return o;
}
function resinParts(Z, q) {
  const he = Math.min(1, q / 10) ** 2, col = mixHex(lightTheme ? "#d9b56a" : "#b98a3e", "#8a4a2a", he * 0.5);
  return [box(IN.x, IN.x + IN.w, IN.y, IN.y + IN.d, D.ZB, Z, col, { mat: "gloss", shell: true, bevel: 0.4, emit: he > 0.3 ? ["#ff5a1a", (he - 0.3) * 0.12] : undefined })];
}
function bottleParts() {
  const R = 7.5, Hh = 42, top = 2.4 + Hh, o = [];
  o.push(cyl(0, 0, R + 1.2, 0, 2.4, "#3a3d42", 24, { mat: "rubber" }));
  o.push(lathe([[0, 2.4], [R, 2.4], [R, top - 6], [R - 1.2, top - 2], [5.2, top], [5.2, top + 3], [2.4, top + 3], [2.4, top + 7], [4.2, top + 7], [4.2, top + 8.6], [0, top + 8.6]], "#8f9aa4", { c: [0, 0, 0], seg: 28, mat: "paint" }));
  for (const z of [2.4 + Hh * 0.62, 2.4 + Hh * 0.78]) o.push(lathe([[R + 0.15, z], [R + 0.15, z + 1.2]], "#c9ced3", { c: [0, 0, 0], seg: 28, mat: "paint" }));
  return o;
}
const HAZE = Array.from({ length: 30 }, (_, i) => { const h = (n2) => { const s = Math.sin(i * 12.9898 + n2 * 78.233) * 43758.5453; return s - Math.floor(s); }; return [h(1), h(2), h(3), h(4)]; });
let fx = [];
function draw(dt = 0) {
  const K = chaos(), Z = zc(), hot = clamp((temp - 50) / 90, 0, 1.3), q = Math.round((K.c >= 0 ? hot * Math.max(0, 1 - K.c * 2) : hot) * 10), PL = D.PLATE, inside = E.xray > 0.5;
  let mm;
  if (K.c >= 0) { const c = K.c, hop = c < 0.6 ? 26 * Math.sin((c / 0.6) * Math.PI) : 0; mm = tipM([0, 0, 0], ((-7 * Math.sin((Math.min(c, 0.6) / 0.6) * Math.PI) * K.back) * Math.PI) / 180, "y"); mm[11] += hop * K.back; }
  const fState = !fuseIn ? 2 : fuseBlownAt !== null ? 1 : 0, yc = RL.y + RL.d / 2, tipZ = contactClosed ? RL.z1 - 5.6 : RL.z1 - 3.4;
  const objs = [{ cache: "bench", rev: 0, parts: benchParts }, { cache: "fuse", rev: fState, parts: () => fuseParts(fState) }, { cache: "housing", rev: 0, m: mm, parts: housingParts }, { cache: "res", rev: q, m: mm, parts: () => resistorParts(q) },
    { cache: "resin", rev: cover * 100 + q, m: mm, parts: () => resinParts(Z, q) },
    // the armature: up when open, down on the contact when closed
    { cache: "arm", rev: contactClosed ? 1 : 0, m: mm, parts: () => [prism([[RL.x + 13.4, RL.z1 - 2.9], [RL.x + 23.4, tipZ + 0.1], [RL.x + 23.4, tipZ + 0.8], [RL.x + 13.4, RL.z1 - 2.2]], "y", yc - 3, yc + 3, "#d8dce0", { mat: "steel", bevel: 0 }), cyl(RL.x + 22.5, yc, 1.1, tipZ - 0.45, tipZ + 0.1, "#e2e5e8", 10, { mat: "steel", bevel: 0 }),
      prism(circle(12, 33, 1.4, 12), "y", HS.y + HS.d, HS.y + HS.d + 0.6, contactClosed ? "#5fe08a" : "#2f5a3e", { flat: true, emit: contactClosed ? ["#5fe08a", 1] : undefined, emitK: 2 })] }];
  D.BOTTLES.forEach((b, i) => { const a = K.c >= 0 ? (tip(K.c, 0.05 + i * 0.05, 82) * K.back * Math.PI) / 180 : 0; let m = [1, 0, 0, 0, 1, 0, 0, 0, 1, b[0], b[1], 0]; if (a) { const t = tipM([7.5, 0, 0], a, "y"); m = [...t.slice(0, 9), t[9] + b[0], t[10] + b[1], t[11]]; } objs.push({ cache: "bottle", rev: 0, m, parts: bottleParts }); });
  let svg = E.render(objs);
  // gas over the bench, kept out of the module
  const hz = K.c >= 0 ? Math.max(0, 1 - K.c * 4) * (K.c < 3 ? 1 : 0) : 1;
  if (hz > 0.01) for (const [a, b, c, d] of HAZE) { const t = now * 0.05 + d * 9, x = PL.x + 12 + a * (PL.w - 24) + Math.sin(t * 1.3 + c * 6) * 10, y = PL.y + 12 + b * (PL.d - 24) + Math.cos(t + a * 6) * 8; if (x > HS.x - 14 && x < HS.x + HS.w + 14 && y > HS.y - 14 && y < HS.y + HS.d + 14) continue; E.sprite([x, y, 6 + c * 26], 18 + d * 12, lightTheme ? "#3f8f9a" : "#6fc4d0", (lightTheme ? 0.08 : 0.06) * hz); }
  // the crack: across the top of the pour, then down through the compound to the contacts
  if (crack > 0.001 && K.c < 0.2) {
    const col = crack >= 1 ? (lightTheme ? "#1f8f9f" : "#6fd6e4") : lightTheme ? "#2a1c0c" : "#120c06", x0 = SPK[0] - 1;
    let prev = [x0 - 12, SPK[1] - 9, Z + 0.25];
    for (let i = 1; i <= 8; i++) { const t = i / 8, p = [x0 - 12 + 12 * t + Math.sin(i * 2.1) * 1.1, SPK[1] - 9 + 9 * t + Math.cos(i * 1.7) * 1.1, Z + 0.25]; if (t <= Math.min(1, crack * 3) + 0.001) E.line(prev, p, 2.6, col, 1); prev = p; }
    prev = [x0, SPK[1], Z + 0.25];
    for (let i = 1; i <= 18; i++) { const t = (i / 18) * crack, p = [x0 + Math.sin(i * 1.9) * 0.9 + Math.sin(i * 0.7) * 0.6, SPK[1] + Math.cos(i * 1.3) * 0.7, Z - (Z - D.PART_TOP) * t]; E.line(prev, p, 2.6, col, inside ? 1 : 0); prev = p; }
    if (crack >= 1) E.sprite([SPK[0], SPK[1], SPK[2] + 3], 7, lightTheme ? "#3f8f9a" : "#6fd6e4", 0.35, !lightTheme);
  }
  // contact spark, every time the relay switches
  const sp = burst(now - sparkAt, 0.004, 0.09);
  if (sp > 0.02 && K.c < 0.2) { const fl = 0.6 + 0.4 * rn(); E.sprite(SPK, 1.6, "#ffffff", sp * fl, true, 1); E.sprite(SPK, 5, "#8fb4ff", 0.6 * sp * fl, true, 1); for (let j = 0; j < 2; j++) E.line(SPK, [SPK[0] + (rn() - 0.5) * 3, SPK[1] + (rn() - 0.5) * 3, SPK[2] + (rn() - 0.3) * 3], 1.4, "#dfe9ff", sp, true); }
  // the fuse letting go
  if (fuseBlownAt !== null) { const fb = burst(now - fuseBlownAt, 0.005, 0.18); if (fb > 0.02) { E.sprite([FU.x + 8, FU.y + FU.d / 2, 11], 3, "#ffffff", fb, true, 1); E.sprite([FU.x + 8, FU.y + FU.d / 2, 11], 11, "#8fb4ff", 0.7 * fb, true, 1); } }
  // heat off the resistor when it's cooking
  if (dt > 0 && q > 9 && K.c < 0 && inside && rn() < 0.5) fx.push({ k: "haze", p: [HOTP[0] + (rn() - 0.5) * 6, HOTP[1] + (rn() - 0.5) * 12, HOTP[2] + 5], v: [(rn() - 0.5) * 4, (rn() - 0.5) * 4, 10 + rn() * 10], life: 0, max: 0.6 + rn() * 0.5, s: 1 });
  if (K.c >= 0) {
    const c = K.c, life = Math.exp(-c / 0.5), Rr = 18 + 70 * (1 - Math.exp(-c / 0.2)), C = [14, 0, 30 + 30 * c];
    if (life > 0.02) { E.sprite(C, Rr * 0.8, "#ffb04a", 0.5 * life, true, 1); E.sprite(C, Rr * 0.35, "#fff0c8", 0.6 * life, true, 1); }
    if (dt > 0 && c < 1.0) for (let j = 0; j < 8; j++) fx.push({ k: "flame", p: [PL.x + 10 + rn() * (PL.w - 20), PL.y + 8 + rn() * (PL.d - 16), 8 + rn() * 60], v: [(rn() - 0.5) * 130, (rn() - 0.5) * 130, 40 + rn() * 120], life: 0, max: 0.45 + rn() * 0.6, s: 1.7 + rn() });
    if (dt > 0 && c >= 0.3 && c < 2.8 && rn() < dt * 40) fx.push({ k: "smoke", p: [(rn() - 0.5) * 160, (rn() - 0.5) * 110, 20 + rn() * 50], v: [(rn() - 0.5) * 20, (rn() - 0.5) * 20, 30 + rn() * 40], life: 0, max: 2 + rn() * 2, s: 1.5 });
  }
  fx = fx.filter((p) => {
    p.life += dt; if (p.life > p.max) return false;
    const t = p.life / p.max;
    if (p.k === "flame") { p.v[0] *= 0.93; p.v[1] *= 0.93; }
    for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * dt;
    if (p.k === "flame") E.sprite(p.p, (5 + 15 * t) * p.s, t < 0.25 ? "#fff0b8" : t < 0.6 ? "#ff9a2e" : "#d8481a", 0.8 * (1 - t * t), true, 2);
    else if (p.k === "haze") E.sprite(p.p, (3 + 6 * t) * p.s, "#ff8a3a", 0.2 * Math.sin(t * Math.PI), true);
    else E.sprite(p.p, (12 + 40 * t) * p.s, lightTheme ? "#4a4744" : "#2e2c2b", 0.45 * (1 - t));
    return true;
  });
  // lettering
  let m = E.faceMatrix([PL.x + PL.w - 44, PL.y + PL.d - 13, 0.05], [1, 0, 0], [0, 1, 0]);
  if (m) svg += '<g transform="' + m + '"><text class="pt bench" x="0" y="5" font-size="5">ZONE 1</text></g>';
  m = E.faceMatrix([FU.x + 20, FU.y + 4, 0.05], [1, 0, 0], [0, 1, 0]);
  if (m) svg += '<g transform="' + m + '"><text class="pt bench" x="0" y="3.4" font-size="3.4">FUSE</text></g>';
  if (K.c < 0) {
    m = E.faceMatrix([-22, HS.y + HS.d + 0.55, 38], [1, 0, 0], [0, 0, -1]);
    if (m) svg += '<g transform="' + m + '"><text class="pt" x="1.8" y="6.2" font-size="3.3">Ex mb IIC T4</text></g>';
    // how much compound there is over the parts
    if (E.xray > 0.3) { const a = [RL.x + RL.w + 3.5, RL.y + RL.d + 3, D.PART_TOP], b = [a[0], a[1], Z], col = thin() ? (lightTheme ? "#c0281e" : "#ff8a7a") : lightTheme ? "#0f7a4a" : "#7fe0a8", p = E.project([a[0], a[1], (D.PART_TOP + Z) / 2]); E.line(a, b, 2, col, E.xray); for (const e of [a, b]) E.line([e[0] - 2, e[1], e[2]], [e[0] + 2, e[1], e[2]], 2, col, E.xray); svg += '<text class="mk-lab clab" data-bad="' + thin() + '" x="' + (p[0] + 8).toFixed(1) + '" y="' + (p[1] + 4).toFixed(1) + '" opacity="' + E.xray.toFixed(2) + '">cover ' + (thin() ? "too thin" : "ok") + "</text>"; }
    if (running || temp > M.tAmb + 2) { const p = E.project([HOTP[0], HOTP[1], Z + 12]); svg += '<text class="mk-lab tlab" data-s="' + (temp > M.limit ? "fire" : "ok") + '" text-anchor="middle" x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '">' + Math.round(temp) + " °C</text>"; }
  }
  if (E.xray > 0.02 && K.c < 0) svg += E.callouts([
    { p: [IN.x + 8, IN.y + 10, Z], text: "Compound", sub: "solid, so the gas can't get to the parts" }, { p: SPK, text: "Relay contacts", sub: "spark on every switch" },
    { p: [HOTP[0], RS.y + RS.d - 3, HOTP[2] + 3], text: "Power resistor", sub: "the hot part" }, { p: [FU.x + 8, FU.y + FU.d / 2, 13], text: "Fuse", sub: fuseIn ? "caps the fault current" : "missing, bridged with wire" },
  ], E.xray, E.fs < 0.62 ? {} : { topL: 70, topR: 70 });
  if (sceneG.innerHTML !== svg) sceneG.innerHTML = svg;
  if (K.c >= 0) { const A = 7 * Math.exp(-K.c / 0.35); setShake(A * Math.sin(K.c * 90), A * Math.cos(K.c * 71)); flashEl.style.opacity = (0.8 * burst(K.c, 0.03, 0.22)).toFixed(3); }
  else if (boomAt !== null && now - boomAt > BOOM_END) {
    boomAt = null; temp = M.tAmb; crack = 0; faultAt = null; fuseBlownAt = null; contactClosed = false;
    setShake(0, 0); flashEl.style.opacity = "0";
    say("Reset. Thick enough pour, run it inside the compound's rating, and keep the fuse in.");
  }
  if (fuseBlownAt !== null && now - fuseBlownAt > 3.2) { fuseBlownAt = null; faultAt = null; say("Fuse replaced. Back in business."); }

  const text = K.c >= 0 ? (K.c < 3.0 ? "BOOM · " + (cause === "fault" ? "unfused fault" : "gas reached the contacts") : "resetting…")
    : (fuseBlownAt !== null ? "FUSE BLOWN · module dead · safe" : (running ? "SWITCHING · " : "IDLE · ") + "load " + load + " % · " + Math.round(temp) + " °C · cover " + (thin() ? "too thin" : "ok") + " · crack " + Math.round(crack * 100) + " %");
  if (readout.textContent !== text) readout.textContent = text;
  if (boomAt === null && fuseBlownAt === null) {
    if (faultAt !== null && !fuseIn) say("Short circuit and no fuse. The resistor is cooking inside the compound…");
    else if (crack >= 1) say("The crack has reached the relay. Gas is in with the contacts…");
    else if (crack > 0) say(temp > M.limit ? "The parts are running hotter than the compound is rated for. It's degrading and cracking…" : "The pour is too thin. Every heat-up and cool-down opens the crack a bit further…");
    else if (running) say("Sparking away inside the compound. The gas can't reach the contacts, so nothing happens. That's Ex m.");
  }
}
function fault() {
  if (booming() || faultAt !== null) return;
  faultAt = now;
  if (fuseIn) { fuseBlownAt = now; running = false; say("Short circuit. The fuse blew in milliseconds, the module's dead, and nothing inside got hot. That's what the fuse is for."); }
  else { running = true; }
}

const TOUR = [
  { cover: 9, load: 70, fuse: true, act: "run", hold: 5 },
  { cover: 2, load: 70, fuse: true, act: "run", hold: 8 },
  { cover: 9, load: 145, fuse: true, act: "run", hold: 9 },
  { cover: 9, load: 70, fuse: true, act: "fault", hold: 4 },
  { cover: 9, load: 70, fuse: false, act: "fault", hold: 5 },
];
function tick(t) {
  const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
  last = t;
  const sdt = dt * (slow ? 0.12 : 1);
  now += sdt;
  if (touring && !booming()) {
    tourClock += dt;
    if (tourStep < 0 || tourClock > tourEnd) {
      tourStep = (tourStep + 1) % TOUR.length;
      const s = TOUR[tourStep];
      cover = s.cover; load = s.load; fuseIn = s.fuse; crack = 0; temp = M.tAmb; faultAt = null; fuseBlownAt = null;
      running = true; nextSwitch = now + 0.3;
      if (s.act === "fault") faultAtPending = now + 1.2;
      tourEnd = tourClock + s.hold;
    }
    if (faultAtPending !== null && now >= faultAtPending) { faultAtPending = null; fault(); }
  }
  step(sdt);
  draw(sdt); syncUi();
  const busy = touring || running || faultAt !== null || fuseBlownAt !== null || boomAt !== null || Math.abs(temp - M.tAmb) > 0.5 || drag || now - sparkAt < 0.3;
  frame = visible ? requestAnimationFrame(tick) : 0;
}
let faultAtPending = null;
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { touring = false; faultAtPending = null; };
const guard = (fn) => (...a) => { takeOver(); if (booming()) return; fn(...a); run(); };
const setCover = guard((v) => { cover = clamp(Math.round(v), M.coverLo, M.coverMax); if (!thin() && temp <= M.limit) crack = 0; });
const setLoad = guard((v) => { load = clamp(Math.round(v), 0, 150); });
const setFuse = guard((v) => { fuseIn = v; });
const toggleRun = guard(() => { if (fuseBlownAt !== null) return; running = !running; nextSwitch = now + 0.15; });
const doFault = guard(() => fault());
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;

for (const [key, el, fn] of [["cover", ui.cover, setCover], ["load", ui.load, setLoad]]) {
  el.addEventListener("input", () => { sliding[key] = true; fn(+el.value); });
  el.addEventListener("change", () => { sliding[key] = false; run(); });
}
ui.fuseBtns.forEach((b) => b.addEventListener("click", () => setFuse(b.dataset.fuse === "in")));
ui.run.addEventListener("click", toggleRun);
ui.fault.addEventListener("click", doFault);
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; tourClock = 0; } else { running = false; } run(); });
let drag = null;
// tap the fuse holder to pull or refit the fuse, tap anywhere else to start or stop the relay
onTap((ev) => {
  const m0 = overEl.getScreenCTM(); if (!m0) return toggleRun();
  const pt = overEl.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; const q2 = pt.matrixTransform(m0.inverse()), c = E.project([FU.x + 8, FU.y + FU.d / 2, 8]);
  const rpx = Math.abs(E.project([FU.x + FU.w, FU.y, 0])[0] - E.project([FU.x, FU.y + FU.d, 0])[0]) / 2;
  if (Math.hypot(q2.x - c[0], q2.y - c[1]) < rpx * 1.2) setFuse(!fuseIn); else toggleRun();
});
stage.addEventListener("keydown", (ev) => {
  const map = { ArrowUp: () => setLoad(load + 5), ArrowDown: () => setLoad(load - 5), ArrowRight: () => setCover(cover + 1), ArrowLeft: () => setCover(cover - 1), f: () => setFuse(!fuseIn), z: doFault, x: () => { setX(!E.xrayOn); run(); }, X: () => { setX(!E.xrayOn); run(); }, " ": toggleRun, Enter: toggleRun, s: () => { slow = !slow; run(); } };
  if (map[ev.key]) { ev.preventDefault(); map[ev.key](); }
});
window.__fig = { E, freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
setX(true); syncUi(); draw();
`;

const CSS = `.fx-flash{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(circle 70% at 50% 45%,#fff8e8 0%,#ffd9a0 40%,rgba(255,170,90,0) 100%)}
.pt{font-family:var(--anatomy-mono);fill:#23262b;font-weight:700}.pt.bench{fill:var(--anatomy-muted);font-weight:600;letter-spacing:.08em;opacity:.8}
.tlab{font-size:calc(13px*var(--mk-ts,1))}.tlab[data-s="fire"]{fill:var(--mk-danger)}
.clab{fill:var(--mk-good)}.clab[data-bad="true"]{fill:var(--mk-danger)}
.mk-hint{top:46px}
.ctl #run{padding:7px 14px;font-weight:600;letter-spacing:.06em;min-width:96px;text-align:center}.ctl #fault{font-weight:600;letter-spacing:.06em}
.ctl output[data-bad="true"]{color:var(--mk-danger)}
.notch{position:absolute;top:2px;bottom:2px;width:0;border-left:2px solid var(--anatomy-mid);pointer-events:none}
.meter{margin-top:12px}#temp-fill{transition:width .1s}#temp-fill[data-state="hot"]{background:var(--mk-danger)}`;

const stage = stageHtml({
  W, H, fig: "Fig 6", title: "Ex m, encapsulation", xray: true,
  label: "A potted relay module on a bench: a housing filled with encapsulating compound. A relay and a power resistor sit in the compound on a circuit board; the relay's contacts spark every time it switches. A fuse holder feeds the module and two gas bottles stand behind it. An x-ray mode turns the housing and the compound to glass to show the parts inside.",
  keysHelp: "Load: drag to rotate, X for x-ray, tap the fuse to pull it, drag up and down or arrow keys; left and right change the compound cover; space switches the relay; Z makes a fault",
  extra: `<div class="fx-flash" aria-hidden="true"></div>`,
});

const CONTROLS = `<div class="ctl" role="group" aria-label="Test controls">
  <div class="ctl-row"><span class="ctl-label">Cover</span><div class="slide marked"><span class="notch" style="left:${notchPos}%"></span><input id="cover" type="range" min="${MODEL.coverLo}" max="${MODEL.coverMax}" step="1" value="${START.cover}" aria-label="Compound cover over the parts: below the notch it is too thin"></div><output id="cover-out">ok</output></div>
  <div class="ctl-row"><span class="ctl-label">Load</span><div class="slide"><input id="load" type="range" min="0" max="150" step="5" value="${START.load}" aria-label="Load in percent"></div><output id="load-out">${START.load} %</output></div>
  <div class="ctl-row"><span class="ctl-label">Parts °C</span><div class="meter" aria-hidden="true"><span id="temp-fill" class="fill"></span><span id="lim-mark" class="mark" data-label="compound limit"></span></div><output id="temp-out">40 °C</output></div>
  <div class="ctl-row"><span class="ctl-label">Fuse</span><button type="button" data-fuse="in" aria-pressed="true">Fitted</button><button type="button" data-fuse="out" aria-pressed="false">Missing</button></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="run" aria-pressed="false">SWITCH</button><button type="button" id="fault" class="danger">FAULT</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
</div>`;


const foot = footHtml({
  theme, slug: "ex-m-potted",
  real: "the idea (encapsulation, minimum compound thickness, a compound temperature limit and fuse protection).",
  made: "the thicknesses, temperatures and timings, chosen to show it.",
});
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), pageMk2({
  k, title: "Ex m, encapsulation", fig: "Fig 6", hint: "Tap: switch · tap the fuse: pull it", theme, W, H, stage, controls: CONTROLS, css: CSS, foot,
  caption: "Ex m doesn't stop the sparks. It buries them. The relay and the hot parts sit in solid compound, so the gas never gets to them. That only holds while the compound is whole: too thin a pour cracks as it heats and cools, parts run hotter than the compound is rated for and it splits, and without the upstream fuse a short circuit cooks the parts until the compound fails. Any crack that reaches the contacts lets the gas in.",
  script: LIVE.replace("__DATA__", JSON.stringify(DATA)),
}));
console.log("wrote", name);
