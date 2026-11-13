import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { engineScript, stageHtml, pageMk2, footHtml } from "../../mk2/shell.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const W = 960, H = 600;

// Truth: T4 = 135 °C max surface. Diethyl ether autoignition ≈ 160 °C (a T4 gas).
// Toy: 2.5 mΩ per circuit, box rated 10 W MDP, sits at exactly 135 °C at MDP in 40 °C ambient.
const MODEL = {
  rCircuit: 0.0025, mdp: 10, tAmb: 40, t4: 135, tMax: 300,
  rth: (135 - 40) / 10, tau: 2.4,
  creepClean: 550, creepDirty: 230, clearance: 800,
};
// autoignition temperatures: ether 160 °C (T4), carbon disulphide 90 °C (T6), diesel ~240 °C (T3)
const GASES = [
  { id: "ether", name: "diethyl ether", btn: "Ether", tc: "T4", ait: 160, label: ["DIETHYL", "ETHER"] },
  { id: "cs2", name: "carbon disulphide", btn: "CS₂", tc: "T6", ait: 90, label: ["CARBON", "DISULPHIDE"] },
  { id: "diesel", name: "diesel", btn: "Diesel", tc: "T3", ait: 240, label: ["DIESEL", ""] },
];
const N_TERM = 16;
const V_MIN = 24, V_MAX = 1000, I_MAX = 25;
const PLATE_H = 12, FOOT_H = 5;
const BOX = { x: -62, y: -44, w: 124, d: 84 };
const WALL = 3;
const Z_BASE = 4, Z_TOP = 34, Z_CUT = 15, Z_FLOOR = 8;
const PITCH = 6.6, TW = 5.6;
const X0 = -(N_TERM * PITCH) / 2 + (PITCH - TW) / 2;
const TERM_Y = -20, TERM_D = 32, Z_TT = 23;
const CL_A = -13, CL_B = 5; // clamp y positions
const DRUM = [116, -46], DRUM_R = 17, DRUM_H = 52;
const TRACK = 7; // tracking happens between terminal 7 and 8
const START = { n: 6, amps: 16, volts: 230, dirty: false, gas: 0 };
const PLATE = { x: -78, y: -56, w: 204, d: 140, r: 8 };
const P = k.fitProjection([...k.boxCorners(PLATE, -0.8, 0), [-62, -44, 40], [104, -30, 80], [62, 40, 40]], W, H, { pad: 22, azimuth: 45, elevation: 30 });
const DATA = { W, H, P, PLATE };
Object.assign(DATA, { MODEL, GASES, TERM_D, N_TERM, V_MIN, V_MAX, I_MAX, PITCH, TW, X0, TERM_Y, Z_TT, CL_A, CL_B, TRACK, BOX, Z_FLOOR, start: START, ductBack: BOX.y + 7 + 9, ductFront: TERM_Y + TERM_D + 3, GEO: { WALL, Z_BASE, Z_TOP, DRUM: [104, -30], DRUM_R, DRUM_H, GLANDS: [-40, -22, -4, 14], GZ: 20 } });
const LIVE = `
${engineScript()}
const D = __DATA__;
const stage = document.querySelector(".mk-stage");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lightTheme = document.body.dataset.theme === "light";
const E = mk2(stage, D.P, { W: D.W, H: D.H, pivot: [10, 0, 16], plate: { ...D.PLATE, h: 12, foot: 5 }, shadowBox: [-86, -64, -18, 134, 92, 110] });
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
let n = D.start.n, amps = D.start.amps, volts = D.start.volts, dirty = D.start.dirty;
let on = false, temp = M.tAmb, track = 0, flashAt = -10, boomAt = null, cause = "", arcAt = null, gas = D.start.gas;
const G = () => D.GASES[gas];
let frame = 0, last = 0, now = 0, visible = false, touring = true, slow = false, tourClock = 0, tourStep = -1, lastShot = "";
const BOOM_END = 4.2;
const booming = () => boomAt !== null && now - boomAt < BOOM_END + 0.3;
const power = () => n * amps * amps * M.rCircuit;
const tSteady = () => M.tAmb + M.rth * power();
const creepLimit = () => dirty ? M.creepDirty : M.creepClean;

const ui = {
  n: document.querySelector("#n"), nOut: document.querySelector("#n-out"), amps: document.querySelector("#amps"), aOut: document.querySelector("#amps-out"),
  heatFill: document.querySelector("#heat-fill"), heatOut: document.querySelector("#heat-out"),
  tFill: document.querySelector("#temp-fill"), tOut: document.querySelector("#temp-out"), t4: document.querySelector("#t4-mark"), ait: document.querySelector("#ait-mark"), gasBtns: [...document.querySelectorAll("[data-gas]")],
  volts: document.querySelector("#volts"), vOut: document.querySelector("#volts-out"), creep: document.querySelector("#creep-mark"), clear: document.querySelector("#clear-mark"),
  surf: [...document.querySelectorAll("[data-surf]")], on: document.querySelector("#energise"), slow: document.querySelector("#slow"), tour: document.querySelector("#tour"),
  shot: document.querySelector("#shot"),
};
const sliding = {};
function syncUi() {
  const p = power();
  for (const [key, el, val] of [["n", ui.n, n], ["amps", ui.amps, amps], ["volts", ui.volts, volts]]) if (!sliding[key]) el.value = val;
  ui.nOut.textContent = n + " of 16";
  ui.aOut.textContent = amps + " A";
  ui.vOut.textContent = volts + " V";
  ui.heatFill.style.width = (clamp(p / (2 * M.mdp), 0, 1) * 100).toFixed(1) + "%";
  ui.heatFill.dataset.bad = String(p > M.mdp);
  ui.heatOut.textContent = p.toFixed(1) + " W";
  const tpos = (t) => (clamp((t - 20) / (M.tMax - 20), 0, 1) * 100).toFixed(1) + "%";
  ui.tFill.style.width = tpos(temp);
  ui.tFill.dataset.state = temp >= G().ait ? "fire" : temp > M.t4 ? "hot" : "ok";
  ui.tOut.textContent = Math.round(temp) + " °C";
  ui.t4.style.left = tpos(M.t4);
  ui.ait.style.left = tpos(G().ait);
  ui.ait.dataset.label = G().btn + " ignites " + G().ait;
  ui.gasBtns.forEach((b, i) => b.setAttribute("aria-pressed", String(i === gas)));
  const pos = (v) => ((v - D.V_MIN) / (D.V_MAX - D.V_MIN) * 100).toFixed(1) + "%";
  ui.creep.style.left = pos(creepLimit());
  ui.clear.style.left = pos(M.clearance);
  ui.surf.forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.surf === "dirty") === dirty)));
  ui.on.setAttribute("aria-pressed", String(on));
  ui.on.textContent = on ? "DE-ENERGISE" : "ENERGISE";
  ui.slow.setAttribute("aria-pressed", String(slow));
  ui.tour.setAttribute("aria-pressed", String(touring));
}
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };

function blowUp(why) {
  if (boomAt !== null) return;
  boomAt = now + 0.15; cause = why; on = false;
  const g = G(), p = power();
  say(why === "heat"
      ? (p <= M.mdp
        ? "Boom, and the box did nothing wrong. It was inside its " + M.mdp + " W MDP and its T4 rating, but " + g.name + " is a " + g.tc + " gas: it self-ignites at " + g.ait + " °C, well below what a T4 box is allowed to reach. Wrong T-class for the gas."
        : "Boom, no spark needed. " + p.toFixed(1) + " W in a box rated for " + M.mdp + " W pushed the surface to " + g.ait + " °C, the temperature where " + g.name + " vapour lights itself on hot metal. MDP exists to stop the box getting that hot.")
    : why === "creep" ? "Boom. The carbon track bridged the terminals, the short arced, and an arc lights any gas. Creepage is there so leakage never gets a surface path to cook into a track."
    : "Boom. " + volts + " V jumped straight through the air between terminals: the clearance is only good for " + M.clearance + " V. That arc lit the " + g.name + ". Clearance doesn't care how clean it is.");
}

function chaos() {
  if (boomAt === null) return { c: -1, back: 0 };
  const c = now - boomAt;
  if (c < 0 || c > BOOM_END) return { c: -1, back: 0 };
  return { c, back: 1 - sm(3.0, 3.9, c) };
}
const tip = (c, delay, target) => { const u = Math.max(0, c - delay); return u <= 0 ? 0 : target * (1 - Math.exp(-u / 0.11) * Math.cos(u * 13)); };

function step(dt) {
  if (on && boomAt === null) {
    temp += (tSteady() - temp) * (1 - Math.exp(-dt / M.tau));
    if (volts > M.clearance) { flashAt = now; blowUp("clear"); }
    else if (volts > creepLimit()) {
      const over = volts / creepLimit() - 1;
      track = Math.min(1, track + dt * (0.18 + over * 0.6));
      if (track >= 1 && arcAt === null) { arcAt = now; say("Bridged. The carbon track is now a conductor between two live terminals, so it shorts and arcs. An arc runs at thousands of degrees…"); }
      if (arcAt !== null && now - arcAt > 0.8) blowUp("creep");
    }
    if (temp >= G().ait) blowUp("heat");
  } else if (boomAt === null) {
    temp += (M.tAmb - temp) * (1 - Math.exp(-dt / (M.tau * 1.6)));
  }
}
// ---------------- the terminal box, in real 3D ----------------
const TAU = Math.PI * 2, BX = D.BOX, GEO = D.GEO, rn = () => Math.random();
const flashEl = stage.querySelector(".fx-flash"), overEl = stage.querySelector(".mk-over");
const termX = (i) => D.X0 + i * D.PITCH, termC = (i) => termX(i) + D.TW / 2;
const STEEL = "#b4bcc4", WIRE = ["#8a5a3a", "#3b3d42", "#9aa0a8"];
const tipM = (piv, ang, axis) => { const c = Math.cos(ang), s = Math.sin(ang), R = axis === "x" ? [1, 0, 0, 0, c, -s, 0, s, c] : [c, 0, s, 0, 1, 0, -s, 0, c]; return [...R, ...[0, 1, 2].map((i) => piv[i] - (R[i * 3] * piv[0] + R[i * 3 + 1] * piv[1] + R[i * 3 + 2] * piv[2]))]; };
function ductParts(y) {
  const o = [], x0 = BX.x + 8, x1 = BX.x + BX.w - 8, z0 = D.Z_FLOOR + 1;
  o.push(box(x0, x1, y, y + 9, z0, z0 + 11.4, "#aeb3ba", { mat: "plastic", bevel: 0.3 }), box(x0 - 0.3, x1 + 0.3, y - 0.3, y + 9.3, z0 + 11.4, z0 + 13, "#bcc1c8", { mat: "plastic", bevel: 0.4 }));
  for (let x = x0 + 3; x < x1 - 2; x += 4) for (const yy of [y - 0.12, y + 9 - 0.03]) o.push(box(x - 0.55, x + 0.55, yy, yy + 0.15, z0 + 3, z0 + 11.2, "#4c5057", { bevel: 0, flat: true }));
  return o;
}
function innerParts() {
  const o = [], zf = D.Z_FLOOR;
  // lugs, base and gland plate
  for (const [x, y] of [[BX.x - 6, BX.y + 10], [BX.x - 6, BX.y + BX.d - 10], [BX.x + BX.w + 6, BX.y + 10], [BX.x + BX.w + 6, BX.y + BX.d - 10]]) o.push(prism(rrect(x - 6, x + 6, y - 5, y + 5, 2), "z", 0, GEO.Z_BASE, STEEL, { mat: "satin" }), cyl(x, y, 2.4, GEO.Z_BASE, GEO.Z_BASE + 1.2, "#8f959d", 6, { mat: "steel" }));
  o.push(prism(rrect(BX.x, BX.x + BX.w, BX.y, BX.y + BX.d, 2.5), "z", GEO.Z_BASE, zf, STEEL, { mat: "satin" }));
  // mounting plate, DIN rail, the two wiring ducts, earth bar
  o.push(box(BX.x + 6, BX.x + BX.w - 6, BX.y + 6, BX.y + BX.d - 6, zf, zf + 1, "#c9ced3", { mat: "satin", bevel: 0 }));
  o.push(box(D.X0 - 6, D.X0 + D.N_TERM * D.PITCH + 4, D.TERM_Y + 12, D.TERM_Y + 20, zf + 1, zf + 3, "#aeb4bb", { mat: "steel", bevel: 0.2 }));
  o.push(...ductParts(BX.y + 7), ...ductParts(D.ductFront));
  o.push(box(BX.x + BX.w - 28, BX.x + BX.w - 8, BX.y + BX.d - 14, BX.y + BX.d - 10, zf + 1, zf + 5, "#c9a24a", { mat: "metal", bevel: 0.3 }));
  for (let i = 0; i < 4; i++) o.push(cyl(BX.x + BX.w - 25 + i * 5, BX.y + BX.d - 12, 1.2, zf + 5, zf + 5.9, "#d8dce0", 8, { mat: "steel" }));
  for (const x of [D.X0 - 4, D.X0 + D.N_TERM * D.PITCH - 0.4]) o.push(box(x, x + 3, D.TERM_Y + 8, D.TERM_Y + 24, zf + 3, zf + 13, "#7d838b", { mat: "plastic", bevel: 0.4 }));
  // glands and field cables on the front face, and the rating plate
  const yf = BX.y + BX.d;
  GEO.GLANDS.forEach((gx, i) => {
    o.push(prism(circle(gx, GEO.GZ, 4.2, 6), "y", yf, yf + 2.4, "#c9a24a", { mat: "metal" }), prism(circle(gx, GEO.GZ, 3.2, 18), "y", yf + 2.4, yf + 6, "#c9a24a", { mat: "metal" }), prism(circle(gx, GEO.GZ, 2.6, 14), "y", yf + 6, yf + 7.4, "#2a2d31", { mat: "rubber" }));
    o.push(tube([[gx, yf + 7, GEO.GZ], [gx, yf + 13, GEO.GZ - 2], [gx - 2, yf + 20, 3.4], [gx - 9 - i * 5, yf + 30, 2.2], [gx - 22 - i * 8, D.PLATE.y + D.PLATE.d - 2, 2.2], [gx - 26 - i * 8, D.PLATE.y + D.PLATE.d + 3, -2], [gx - 27 - i * 8, D.PLATE.y + D.PLATE.d + 4, -16]], 2.1, "#26282c", { seg: 10, mat: "rubber" }));
  });
  o.push(box(28, 60, yf, yf + 0.5, 13, 23, "#e9e6df", { mat: "matte", bevel: 0 }));
  return o;
}
function wallParts(q) {
  const o = [], zf = D.Z_FLOOR, zt = GEO.Z_TOP, W = GEO.WALL, hot = q > 1 ? { emit: ["#ff5a1a", q * 0.022] } : {}, col = mixHex(STEEL, "#c98a6a", q / 16);
  const S = { mat: "satin", shell: true, bevel: 0.3, ...hot };
  o.push(box(BX.x, BX.x + BX.w, BX.y, BX.y + W, zf, zt, col, S), box(BX.x, BX.x + W, BX.y + W, BX.y + BX.d - W, zf, zt, col, S), box(BX.x, BX.x + BX.w, BX.y + BX.d - W, BX.y + BX.d, zf, zt, col, S), box(BX.x + BX.w - W, BX.x + BX.w, BX.y + W, BX.y + BX.d - W, zf, zt, col, S));
  return o;
}
function lidParts(q) {
  const o = [], zt = GEO.Z_TOP, hot = q > 1 ? { emit: ["#ff5a1a", q * 0.022] } : {}, col = mixHex(STEEL, "#c98a6a", q / 16);
  o.push(prism(rrect(BX.x - 1.5, BX.x + BX.w + 1.5, BX.y - 1.5, BX.y + BX.d + 1.5, 3), "z", zt + 0.4, zt + 3.2, col, { mat: "satin", xhide: true, ...hot }), prism(rrect(BX.x + 7, BX.x + BX.w - 7, BX.y + 7, BX.y + BX.d - 7, 2), "z", zt + 3.2, zt + 3.9, col, { mat: "satin", xhide: true, ...hot }));
  for (const [x, y] of [[BX.x + 3.5, BX.y + 3.5], [BX.x + BX.w - 3.5, BX.y + 3.5], [BX.x + 3.5, BX.y + BX.d - 3.5], [BX.x + BX.w - 3.5, BX.y + BX.d - 3.5]]) o.push(cyl(x, y, 1.9, zt + 3.2, zt + 4.3, "#e2e5e8", 6, { mat: "steel", xhide: true }));
  o.push(box(-16, 16, 12, 22, zt + 3.9, zt + 4.1, "#e9e6df", { mat: "matte", bevel: 0, xhide: true }));
  return o;
}
function termParts(q) {
  const o = [], zf = D.Z_FLOOR, y0 = D.TERM_Y, zt = D.Z_TT, R = (yy, zz) => [y0 + yy, zz];
  const ring = [R(0, zf + 3), R(0, zt - 5), R(3, zt - 5), R(4, zt), R(13, zt), R(14, zt - 2.5), R(18, zt - 2.5), R(19, zt), R(28, zt), R(29, zt - 5), R(32, zt - 5), R(32, zf + 3)];
  for (let i = 0; i < D.N_TERM; i++) {
    const x = termX(i), cx = termC(i), live = i < n, h = live ? Math.min(1, q / 10) : 0, he = h * h;
    o.push(prism(ring, "x", x, x + D.TW, mixHex("#e6dcc3", "#8a4a2a", he * 0.7), { mat: "plastic", bevel: 0.25, emit: he > 0.03 ? ["#ff4a12", he * 0.38] : undefined }));
    for (const cy of [D.CL_A, D.CL_B]) o.push(cyl(cx, cy, 1.7, zt, zt + 0.5, "#d8dce0", 12, { mat: "steel", emit: he > 0.03 ? ["#ff7a2a", he] : undefined, emitK: 2 }), box(cx - 1.3, cx + 1.3, cy - 0.25, cy + 0.25, zt + 0.5, zt + 0.56, "#3a3d42", { bevel: 0, flat: true }));
    o.push(box(x + 0.6, x + D.TW - 0.6, y0 + 14.6, y0 + 17.4, zt - 2.5, zt - 2.1, "#f6f4ee", { mat: "matte", bevel: 0 }));
  }
  return o;
}
function wireParts() {
  const o = [], zw = D.Z_TT - 6, zd = D.Z_FLOOR + 14.2;
  for (let i = 0; i < n; i++) {
    const cx = termC(i), col = WIRE[i % 3], O = { seg: 8, mat: "plastic", emit: on ? [col, 0.07] : undefined };
    o.push(tube([[cx, D.TERM_Y + 1.5, zw], [cx, D.TERM_Y - 1.5, zw + 1.2], [cx, D.TERM_Y - 4.5, zw + 2.6], [cx, D.ductBack + 1, zw + 1.6], [cx, D.ductBack - 1.5, zw - 0.5]], 0.95, col, O));
    o.push(tube([[cx, D.TERM_Y + D.TERM_D - 1.5, zw], [cx, D.TERM_Y + D.TERM_D + 1, zw + 1.4], [cx, D.ductFront + 0.6, zw + 0.4], [cx, D.ductFront + 3, zw - 1.5]], 0.95, col, O));
  }
  return o;
}
function drumParts() {
  const R = GEO.DRUM_R, Hh = GEO.DRUM_H, o = [], prof = [[0, 0], [R, 0], [R, 2.4], [R + 0.7, 3], [R, 3.6]];
  for (const z of [Hh * 0.33, Hh * 0.66]) prof.push([R, z - 1.4], [R + 0.9, z], [R, z + 1.4]);
  prof.push([R, Hh - 2], [R + 0.7, Hh - 1.2], [R + 0.7, Hh + 0.6], [R - 1.2, Hh + 0.6], [R - 1.2, Hh - 0.6], [0, Hh - 0.6]);
  o.push(lathe(prof, "#2e6aa8", { c: [0, 0, 0], seg: 48, mat: "paint" }));
  o.push(cyl(8, -4, 2.6, Hh - 0.6, Hh + 0.9, "#c9ced3", 12, { mat: "steel" }), cyl(-10, -4, 1.8, Hh - 0.6, Hh + 0.7, "#c9ced3", 10, { mat: "steel" }));
  o.push(prism(rrect(-10, 10, 2, 10, 1), "z", Hh - 0.6, Hh - 0.45, "#f4f2ec", { mat: "matte", bevel: 0 }), prism([[-1, -12.4], [4.4, -7], [-1, -1.6], [-6.4, -7]], "z", Hh - 0.6, Hh - 0.45, "#d0342c", { bevel: 0, flat: true }));
  return o;
}
let fx = [];
function draw(dt = 0) {
  const K = chaos(), g = G(), heat = clamp((temp - 50) / 110, 0, 1.2), q = Math.round((K.c >= 0 ? heat * Math.max(0, 1 - K.c * 2) : heat) * 10), zt = D.Z_TT;
  // on a bang the box hops and the drum goes over
  let bm, lm, dm = [1, 0, 0, 0, 1, 0, 0, 0, 1, GEO.DRUM[0], GEO.DRUM[1], 0];
  if (K.c >= 0) {
    const c = K.c, hop = c < 0.6 ? 26 * Math.sin((c / 0.6) * Math.PI) : 0, a = ((8 * Math.sin((Math.min(c, 0.6) / 0.6) * Math.PI) * K.back) * Math.PI) / 180;
    bm = tipM([0, 0, 0], a, "y"); bm[11] += hop * K.back;
    lm = [...bm]; lm[11] += Math.min(460, 620 * c) * K.back; lm[9] += Math.min(60, 120 * c) * K.back;
    const t = tipM([0, GEO.DRUM_R, 0], (-tip(c, 0.05, 82) * K.back * Math.PI) / 180, "x"); dm = [...t.slice(0, 9), t[9] + GEO.DRUM[0], t[10] + GEO.DRUM[1], t[11]];
  }
  const objs = [{ cache: "inner", rev: 0, m: bm, parts: innerParts }, { cache: "walls", rev: q, m: bm, parts: () => wallParts(q) }, { cache: "lid", rev: q, m: lm, parts: () => lidParts(q) },
    { cache: "terms", rev: n * 100 + q, m: bm, parts: () => termParts(q) }, { cache: "wires", rev: n * 2 + (on ? 1 : 0), m: bm, parts: wireParts }, { cache: "drum", rev: 0, m: dm, parts: drumParts }];
  let svg = E.render(objs);
  const xc = termC(2), xa = termC(D.TRACK), xb = xa + D.PITCH, gapMid = D.X0 + (D.TRACK + 1) * D.PITCH - (D.PITCH - D.TW) / 2, inside = E.xray > 0.5;
  // the two distances that matter, drawn on the next pair along
  if (E.xray > 0.3 && K.c < 0) {
    const a = E.xray, xd = xc + D.PITCH, gm = xc + D.PITCH / 2, cr = lightTheme ? "#b06a00" : "#ffc24a", cl = lightTheme ? "#0a6fb0" : "#6fd0ff";
    E.line([xc, D.CL_B, zt + 2.6], [xd, D.CL_B, zt + 2.6], 2, cl, a);
    const pts = [[xc, D.CL_B, zt + 0.7], [gm - 0.55, D.CL_B, zt + 0.7], [gm - 0.55, D.CL_B, zt - 2.6], [gm + 0.55, D.CL_B, zt - 2.6], [gm + 0.55, D.CL_B, zt + 0.7], [xd, D.CL_B, zt + 0.7]];
    for (let i = 0; i < pts.length - 1; i++) E.line(pts[i], pts[i + 1], 2, cr, a);
  }
  // creepage: a carbon track cooking its way across, with a spark crawling at its tip
  if (track > 0.001 && K.c < 0.3) {
    let prev = null, tipP = null;
    for (let i = 0; i <= 24; i++) { const x = xa + (xb - xa) * (i / 24) * track, dip = Math.max(0, 1 - Math.abs(x - gapMid) / 0.9) * 3, p = [x, D.CL_A + Math.sin(i * 2.3) * 0.25, zt + 0.5 - dip]; if (prev) E.line(prev, p, 3.2, lightTheme ? "#4a2a12" : "#b0602c", 1); prev = p; tipP = p; }
    if (on && boomAt === null && tipP) { const fl = 0.55 + 0.45 * rn(); E.sprite(tipP, 1.6, "#bcd8ff", 0.9 * fl, true, 1); E.sprite(tipP, 4.5, "#6f9bff", 0.35 * fl, true, 1); if (dt > 0 && rn() < 0.5) fx.push({ k: "spark", p: [...tipP], v: [(rn() - 0.5) * 30, (rn() - 0.5) * 30, 20 + rn() * 40], life: 0, max: 0.15 + rn() * 0.2, s: 1 }); }
  }
  // clearance: straight through the air between the clamps
  const arcing = arcAt !== null && (boomAt === null || now < boomAt + 0.2), fl = Math.max(burst(now - flashAt, 0.01, 0.25), arcing ? 0.8 + 0.2 * Math.sin(now * 90) : 0);
  if (fl > 0.02) {
    for (let s = 0; s < 2; s++) { let prev = [xa, D.CL_A, zt + 0.6]; for (let i = 1; i <= 8; i++) { const t = i / 8, bow = Math.sin(t * Math.PI), p = [xa + (xb - xa) * t, D.CL_A + (rn() - 0.5) * 1.4 * bow, zt + 0.6 + bow * (2.2 + rn() * 1.4)]; E.line(prev, p, s ? 1.6 : 4, s ? "#ffffff" : "#8fb4ff", fl, true); prev = p; } }
    E.sprite([(xa + xb) / 2, D.CL_A, zt + 2], 10, "#bcd0ff", 0.7 * fl, true, 1);
  }
  // heat coming off the terminals
  if (dt > 0 && q > 3 && K.c < 0 && rn() < q * 0.06) { const i = Math.floor(rn() * n); fx.push({ k: "haze", p: [termC(i), D.CL_A + rn() * 18, zt + 2], v: [(rn() - 0.5) * 4, (rn() - 0.5) * 4, 14 + rn() * 12], life: 0, max: 0.8 + rn() * 0.6, s: 0.6 + q / 14 }); }
  // the box fails and the vapour goes up
  if (K.c >= 0) {
    const c = K.c, life = Math.exp(-c / 0.5), Rr = 18 + 70 * (1 - Math.exp(-c / 0.2));
    if (life > 0.02) { E.sprite([0, -4, zt + 6 + 30 * c], Rr * 0.8, "#ffb04a", 0.5 * life, true, 1); E.sprite([0, -4, zt + 6 + 30 * c], Rr * 0.35, "#fff0c8", 0.6 * life, true, 1); }
    if (dt > 0 && c < 1.0) for (let j = 0; j < 8; j++) fx.push({ k: "flame", p: [(rn() - 0.5) * 150, (rn() - 0.5) * 110, 8 + rn() * 70], v: [(rn() - 0.5) * 140, (rn() - 0.5) * 140, 40 + rn() * 130], life: 0, max: 0.45 + rn() * 0.6, s: 1.7 + rn() });
    if (dt > 0 && c >= 0.3 && c < 2.8 && rn() < dt * 40) fx.push({ k: "smoke", p: [(rn() - 0.5) * 160, (rn() - 0.5) * 100, 20 + rn() * 50], v: [(rn() - 0.5) * 20, (rn() - 0.5) * 20, 30 + rn() * 40], life: 0, max: 2 + rn() * 2, s: 1.5 });
  }
  fx = fx.filter((p) => {
    p.life += dt; if (p.life > p.max) return false;
    const t = p.life / p.max;
    if (p.k === "flame") { p.v[0] *= 0.93; p.v[1] *= 0.93; }
    if (p.k === "spark") p.v[2] -= 260 * dt;
    for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * dt;
    if (p.k === "flame") E.sprite(p.p, (5 + 15 * t) * p.s, t < 0.25 ? "#fff0b8" : t < 0.6 ? "#ff9a2e" : "#d8481a", 0.8 * (1 - t * t), true, 2);
    else if (p.k === "spark") E.sprite(p.p, 0.7, "#dfe9ff", 1 - t, true, 1);
    else if (p.k === "haze") E.sprite(p.p, (3 + 7 * t) * p.s, "#ff8a3a", 0.16 * Math.sin(t * Math.PI), true);
    else E.sprite(p.p, (12 + 40 * t) * p.s, lightTheme ? "#4a4744" : "#2e2c2b", 0.45 * (1 - t));
    return true;
  });
  // lettering: bench, rating plate, lid tag, drum label
  let m = E.faceMatrix([D.PLATE.x + D.PLATE.w - 66, D.PLATE.y + D.PLATE.d - 13, 0.05], [1, 0, 0], [0, 1, 0]);
  if (m) svg += '<g transform="' + m + '"><text class="pt bench" x="0" y="5" font-size="5">ZONE 1 · T4 GAS</text></g>';
  if (K.c < 0) {
    m = E.faceMatrix([28, BX.y + BX.d + 0.55, 23], [1, 0, 0], [0, 0, -1]);
    if (m) svg += '<g transform="' + m + '"><text class="pt" x="1.6" y="4.4" font-size="2.5">Ex eb IIC T4</text><text class="pt lo" x="1.6" y="8" font-size="2.3">MDP 10 W</text></g>';
    if (E.xray < 0.5) { m = E.faceMatrix([-16, 12, GEO.Z_TOP + 4.15], [1, 0, 0], [0, 1, 0]); if (m) svg += '<g transform="' + m + '" opacity="' + (1 - E.xray * 2).toFixed(2) + '"><text class="pt" x="3" y="6.6" font-size="5">TB-01</text></g>'; }
    m = E.faceMatrix([GEO.DRUM[0] - 10, GEO.DRUM[1] + 2, GEO.DRUM_H - 0.4], [1, 0, 0], [0, 1, 0]);
    if (m) svg += '<g transform="' + m + '"><text class="pt" x="1" y="3.5" font-size="2.9">' + g.label[0] + '</text><text class="pt" x="1" y="7" font-size="2.9">' + g.label[1] + "</text></g>";
    { const p = E.project([GEO.DRUM[0], GEO.DRUM[1], GEO.DRUM_H + 12]); svg += '<text class="mk-lab" text-anchor="middle" x="' + p[0].toFixed(1) + '" y="' + (p[1] - 13).toFixed(1) + '">' + g.name + '</text><text class="mk-lab dsub" text-anchor="middle" x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '">' + g.tc + " · lights itself at " + (g.id === "diesel" ? "~" : "") + g.ait + " °C</text>"; }
    // the surface temperature, floating over the box
    if (on || temp > M.tAmb + 2) { const p = E.project([0, 0, GEO.Z_TOP + (inside ? 10 : 16)]); svg += '<text class="mk-lab tlab" data-s="' + (temp >= g.ait ? "fire" : temp > M.t4 ? "hot" : "ok") + '" text-anchor="middle" x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '">' + Math.round(temp) + " °C</text>"; }
  }
  if (E.xray > 0.02 && K.c < 0) svg += E.callouts([
    { p: [termC(1), D.CL_A, zt], text: "Terminals", sub: n + " live, I²R in every one" }, { p: [xc + D.PITCH / 2, D.CL_B, zt + 2.6], text: "Clearance", sub: "the distance through the air" },
    { p: [xc + D.PITCH / 2, D.CL_B, zt - 1], text: "Creepage", sub: "the distance along the surface" },
  ], E.xray, E.fs < 0.62 ? {} : { topL: 70, topR: 70 });
  if (sceneG.innerHTML !== svg) sceneG.innerHTML = svg;
  if (K.c >= 0) { const A = 7 * Math.exp(-K.c / 0.35); setShake(A * Math.sin(K.c * 90), A * Math.cos(K.c * 71)); flashEl.style.opacity = (0.8 * burst(K.c, 0.03, 0.22)).toFixed(3); }
  else if (boomAt !== null && now - boomAt > BOOM_END) {
    boomAt = null; temp = M.tAmb; track = 0; arcAt = null;
    setShake(0, 0); flashEl.style.opacity = "0";
    say("Reset. Fewer circuits, less current, lower voltage or a cleaner box.");
  }

  const p = power();
  const t4 = temp > M.t4 ? "over T4" : "T4 ok";
  const ins = volts > M.clearance ? "clearance gone" : volts > creepLimit() ? "creepage over" : "insulation ok";
  const text = K.c >= 0 ? (K.c < 3.0 ? "BOOM · " + (cause === "heat" ? "hot surface lit the " + G().name : cause === "creep" ? "tracking arc" : "flashover") : "resetting…")
    : (on ? "LIVE · " : "OFF · ") + p.toFixed(1) + " W / " + M.mdp + " W MDP · " + Math.round(temp) + " °C · " + t4 + " · " + volts + " V · " + ins;
  if (readout.textContent !== text) readout.textContent = text;
  if (on && boomAt === null) {
    const g = G();
    if (arcAt !== null) {}
    else if (temp > M.t4) say("Surface " + Math.round(temp) + " °C: past the box's T4 rating of " + M.t4 + " °C. " + g.btn + " lights itself at " + g.ait + " °C…");
    else if (g.ait < M.t4 && temp > M.tAmb + 15) say("Surface " + Math.round(temp) + " °C. Legal for a T4 box, but " + g.name + " is a " + g.tc + " gas that lights at " + g.ait + " °C…");
    else if (track > 0) say("Creepage exceeded. Leakage current is creeping across the " + (dirty ? "dusty, damp " : "") + "surface and cooking the plastic into a carbon track…");
    else if (p > M.mdp) say("Over MDP (" + p.toFixed(1) + " W). Watch the temperature climb…");
    else say("Live and happy: " + p.toFixed(1) + " W of " + M.mdp + " W, " + Math.round(temp) + " °C, insulation fine.");
  }
}
// demo: a happy box, then each way to kill it
const TOUR = [
  { n: 6, amps: 16, volts: 230, dirty: false, gas: 0, hold: 4.5 },
  { n: 16, amps: 22, volts: 230, dirty: false, gas: 0, hold: 7 },
  { n: 10, amps: 18, volts: 230, dirty: false, gas: 1, hold: 7 },
  { n: 8, amps: 14, volts: 400, dirty: false, gas: 0, hold: 3.5 },
  { n: 8, amps: 14, volts: 400, dirty: true, gas: 0, hold: 7 },
  { n: 4, amps: 10, volts: 900, dirty: false, gas: 0, hold: 5 },
];
let tourEnd = 0;
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
      n = s.n; amps = s.amps; volts = s.volts; dirty = s.dirty; gas = s.gas;
      if (tourStep !== 4) { temp = M.tAmb; track = 0; arcAt = null; }
      on = true; tourEnd = tourClock + s.hold;
    }
  }
  step(sdt);
  draw(sdt); syncUi();
  const busy = touring || on || boomAt !== null || Math.abs(temp - M.tAmb) > 0.5 || drag;
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { touring = false; };
const guard = (fn) => (...a) => { takeOver(); if (booming()) return; fn(...a); run(); };
const setN = guard((v) => { n = clamp(Math.round(v), 1, 16); });
const setA = guard((v) => { amps = clamp(Math.round(v), 0, D.I_MAX); });
const setV = guard((v) => { volts = clamp(Math.round(v / 10) * 10, D.V_MIN, D.V_MAX); if (volts < creepLimit()) track = 0; });
const setDirty = guard((d) => { dirty = d; if (volts < creepLimit()) track = 0; });
const setGas = guard((i) => { gas = i; });
const toggle = guard(() => { on = !on; if (!on) track = 0; });
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;

for (const [key, el, fn] of [["n", ui.n, setN], ["amps", ui.amps, setA], ["volts", ui.volts, setV]]) {
  el.addEventListener("input", () => { sliding[key] = true; fn(+el.value); });
  el.addEventListener("change", () => { sliding[key] = false; run(); });
}
ui.surf.forEach((b) => b.addEventListener("click", () => setDirty(b.dataset.surf === "dirty")));
ui.gasBtns.forEach((b, i) => b.addEventListener("click", () => setGas(i)));
ui.on.addEventListener("click", toggle);
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; tourClock = 0; } else on = false; run(); });
let drag = null;
// tap the drum to change what's in it, tap anywhere else to switch the box on or off
onTap((ev) => {
  const m0 = overEl.getScreenCTM(); if (!m0) return toggle();
  const pt = overEl.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; const q2 = pt.matrixTransform(m0.inverse());
  const a = E.project([GEO.DRUM[0], GEO.DRUM[1], 4]), c = E.project([GEO.DRUM[0], GEO.DRUM[1], GEO.DRUM_H]), t = clamp((q2.y - a[1]) / ((c[1] - a[1]) || 1), 0, 1);
  const rpx = Math.abs(E.project([GEO.DRUM[0] + GEO.DRUM_R, GEO.DRUM[1] - GEO.DRUM_R, 0])[0] - E.project([GEO.DRUM[0] - GEO.DRUM_R, GEO.DRUM[1] + GEO.DRUM_R, 0])[0]) / 2;
  if (Math.hypot(q2.x - (a[0] + (c[0] - a[0]) * t), q2.y - (a[1] + (c[1] - a[1]) * t)) < rpx * 1.05) setGas((gas + 1) % D.GASES.length); else toggle();
});
stage.addEventListener("keydown", (ev) => {
  const map = { x: () => { setX(!E.xrayOn); run(); }, X: () => { setX(!E.xrayOn); run(); }, ArrowUp: () => setA(amps + 1), ArrowDown: () => setA(amps - 1), ArrowRight: () => setV(volts + 10), ArrowLeft: () => setV(volts - 10), "+": () => setN(n + 1), "-": () => setN(n - 1), d: () => setDirty(!dirty), " ": toggle, Enter: toggle, s: () => { slow = !slow; run(); } };
  if (map[ev.key]) { ev.preventDefault(); map[ev.key](); }
});
window.__fig = { E, freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
setX(true); syncUi(); draw();
`;

const CSS = `.fx-flash{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(circle 70% at 50% 50%,#fff8e8 0%,#ffd9a0 40%,rgba(255,170,90,0) 100%)}
.pt{font-family:var(--anatomy-mono);fill:#23262b;font-weight:700}.pt.lo{fill:#5a6068;font-weight:600}.pt.bench{fill:var(--anatomy-muted);font-weight:600;letter-spacing:.08em;opacity:.8}
@media (min-width:561px){.mk-hint{top:46px}}
.dsub{font-weight:400;font-size:calc(10px*var(--mk-ts,1))}
.tlab{font-size:calc(13px*var(--mk-ts,1))}.tlab[data-s="hot"]{fill:var(--mk-warn)}.tlab[data-s="fire"]{fill:var(--mk-danger)}
.ctl #energise{padding:7px 14px;font-weight:600;letter-spacing:.06em;min-width:128px;text-align:center}
.meter{margin-top:12px}.mark{transition:left .3s}
#heat-fill[data-bad="true"]{background:var(--mk-danger)}#temp-fill{transition:width .1s}#temp-fill[data-state="hot"]{background:var(--mk-warn)}#temp-fill[data-state="fire"]{background:var(--mk-danger)}
#mdp-mark{left:50%;border-left-color:var(--anatomy-mid)}#mdp-mark::after{color:var(--anatomy-muted)}
#t4-mark{border-left-color:var(--anatomy-mid)}#t4-mark::after{color:var(--anatomy-muted)}
.tmeter{margin-top:24px}#ait-mark{top:-17px}
.slide.marked{padding-top:12px}.slide.marked .mark{top:8px;bottom:-2px}#creep-mark{border-left-style:dashed}#creep-mark::after{left:auto;right:-2px}`;

const stage = stageHtml({
  W, H, fig: "Fig 5", title: "Ex e, MDP and creepage", xray: true,
  label: "An Ex e terminal box on a bench. A DIN rail carries sixteen terminals with wiring ducts either side, glands and field cables on the front face. A drum of solvent stands nearby. An x-ray mode takes the lid off and turns the walls to glass. Too much current heats the box past its T4 rating; too much voltage, especially on a dirty surface, tracks or flashes over between terminals.",
  keysHelp: "Current per circuit: drag to rotate, X for x-ray, tap the drum to change the gas, drag up and down or arrow keys; left and right change voltage; space energises",
  extra: `<div class="fx-flash" aria-hidden="true"></div>`,
});

const CONTROLS = `<div class="ctl" role="group" aria-label="Test controls">
  <div class="ctl-row"><span class="ctl-label">Gas</span>${GASES.map((g, i) => `<button type="button" data-gas="${i}" aria-pressed="${i === 0}">${g.btn}<small>${g.tc} · lights ${g.id === "diesel" ? "~" : ""}${g.ait} °C</small></button>`).join("")}</div>
  <div class="ctl-row"><span class="ctl-label">Circuits</span><div class="slide"><input id="n" type="range" min="1" max="16" step="1" value="${START.n}" aria-label="Populated circuits"></div><output id="n-out">${START.n} of 16</output></div>
  <div class="ctl-row"><span class="ctl-label">Current</span><div class="slide"><input id="amps" type="range" min="0" max="${I_MAX}" step="1" value="${START.amps}" aria-label="Current per circuit in amps"></div><output id="amps-out">${START.amps} A</output></div>
  <div class="ctl-row"><span class="ctl-label">Heat</span><div class="meter" aria-hidden="true"><span id="heat-fill" class="fill"></span><span id="mdp-mark" class="mark" data-label="MDP 10 W"></span></div><output id="heat-out">0 W</output></div>
  <div class="ctl-row"><span class="ctl-label">Surface °C</span><div class="meter tmeter" aria-hidden="true"><span id="temp-fill" class="fill"></span><span id="t4-mark" class="mark" data-label="T4 135"></span><span id="ait-mark" class="mark ait" data-label="ignites"></span></div><output id="temp-out">40 °C</output></div>
  <div class="ctl-row"><span class="ctl-label">Volts</span><div class="slide marked"><span id="creep-mark" class="mark" data-label="creepage"></span><span id="clear-mark" class="mark" data-label="clearance"></span><input id="volts" type="range" min="${V_MIN}" max="${V_MAX}" step="10" value="${START.volts}" aria-label="Working voltage"></div><output id="volts-out">${START.volts} V</output></div>
  <div class="ctl-row"><span class="ctl-label">Surface</span><button type="button" data-surf="clean" aria-pressed="true">Clean</button><button type="button" data-surf="dirty" aria-pressed="false">Dusty &amp; damp</button></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="energise" class="danger" aria-pressed="false">ENERGISE</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
</div>`;


const foot = footHtml({
  theme, slug: "ex-e-terminals",
  real: "T4 (135 °C) and the autoignition temperatures (ether ~160 °C, carbon disulphide ~90 °C, diesel ~240 °C).",
  made: "the box's resistance, MDP and the creepage and clearance limits, chosen to show the idea.",
});
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), pageMk2({
  k, title: "Ex e, MDP and creepage", fig: "Fig 5", hint: "Tap: power · tap the drum: gas", theme, W, H, stage, controls: CONTROLS, css: CSS, foot,
  caption: "Ex e has no flamepath to save it. It works by never making a spark or a hot surface in the first place. Heat: every circuit dissipates I²R, and the box is only certified to keep its surface inside T4 (135 °C) up to its maximum dissipated power. A gas lights itself on hot metal at its autoignition temperature, no spark needed, so the gas must ignite above the box's T-class. Insulation: creepage is the distance along the surface between terminals. Leakage over a dirty, damp surface cooks the plastic into a carbon track, the track bridges, and the short arcs. Clearance is the distance through air; exceed it and it flashes straight over.",
  script: LIVE.replace("__DATA__", JSON.stringify(DATA)),
}));
console.log("wrote", name);
