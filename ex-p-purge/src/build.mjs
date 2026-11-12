import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { engineScript, stageHtml, pageMk2, footHtml } from "../../mk2/shell.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const W = 960, H = 600;

// Truth (IEC 60079-2, px): at least 50 Pa overpressure; pre-purge at least 5 enclosure volumes before power-on;
// on loss of pressure the power goes off automatically and stays off until a fresh purge; purge air from the safe area.
// Toy: outside sits at 150 % LEL; air doesn't mix perfectly, so each purged volume only knocks the gas down by e^-0.3.
const MODEL = { minPa: 50, runPa: 82, purgeVols: 5, volPerSec: 0.55, mix: 0.3, outside: 150, lel: 100, seep: 2.6, tauP: 0.35 };
const PLATE_H = 12, FOOT_H = 5;
const DIVIDE = -72;
const CAB = { x: -30, y: -34, w: 70, d: 60 };
const CUT = [18, 2];
const WALL = 2.5;
const Z0 = 4, ZF = 6.5, ZR = 78, ZTOP = 81;
const CONTACT = [0, -17, 50];
const VENT = [-18, -22];
const INLET = [-20, CAB.y + CAB.d];
const SAFE_IN = [-102, 46];
const ZONE_IN = [70, 62];

const START = { safeIntake: true, interlock: true };
const PLATE = { x: -124, y: -84, w: 254, d: 168, r: 8 };
const P = k.fitProjection([...k.boxCorners(PLATE, -0.8, 0), [-30, -34, 94], [40, -34, 82], [40, 26, 82], [-30, 26, 82]], W, H, { pad: 22, azimuth: 45, elevation: 30 });
const DATA = { W, H, P, PLATE };
Object.assign(DATA, { MODEL, DIVIDE, CAB, start: START, GEO: { WALL, Z0, ZF, ZR, ZTOP, VENT, INLET, SAFE_IN, ZONE_IN } });
const LIVE = `
${engineScript()}
const D = __DATA__;
const stage = document.querySelector(".mk-stage");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lightTheme = document.body.dataset.theme === "light";
const E = mk2(stage, D.P, { W: D.W, H: D.H, pivot: [4, -4, 36], plate: { ...D.PLATE, h: 12, foot: 5 }, shadowBox: [-132, -92, -18, 138, 92, 130] });
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
let safeIntake = D.start.safeIntake, interlock = D.start.interlock;
let air = false, power = false, doorOpen = false, pa = 0, vols = 0, gas = M.outside, tripAt = null, sparkAt = -10, nextSwitch = 0, boomAt = null, cause = "", doorA = 0;
let frame = 0, last = 0, now = 0, visible = false, touring = true, slow = false, tourClock = 0, tourStep = -1, tourAt = 0, lastShot = "", actions = [];
const BOOM_END = 4.4;
const booming = () => boomAt !== null && now - boomAt < BOOM_END + 0.3;
const purged = () => vols >= M.purgeVols;
const ui = {
  intake: [...document.querySelectorAll("[data-intake-btn]")], lock: [...document.querySelectorAll("[data-lock]")],
  pFill: document.querySelector("#p-fill"), pOut: document.querySelector("#p-out"),
  vFill: document.querySelector("#v-fill"), vOut: document.querySelector("#v-out"),
  gFill: document.querySelector("#g-fill"), gOut: document.querySelector("#g-out"),
  air: document.querySelector("#air"), power: document.querySelector("#power"), door: document.querySelector("#door"),
  slow: document.querySelector("#slow"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"),
};
function syncUi() {
  ui.intake.forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.intakeBtn === "safe") === safeIntake)));
  ui.lock.forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.lock === "on") === interlock)));
  ui.pFill.style.width = (clamp(pa / 150, 0, 1) * 100).toFixed(1) + "%"; ui.pFill.dataset.state = pa < M.minPa ? "low" : "ok";
  ui.pOut.textContent = Math.round(pa) + " Pa";
  ui.vFill.style.width = (clamp(vols / 8, 0, 1) * 100).toFixed(1) + "%"; ui.vFill.dataset.state = purged() ? "ok" : "low";
  ui.vOut.textContent = vols.toFixed(1) + " vol";
  ui.gFill.style.width = (clamp(gas / 200, 0, 1) * 100).toFixed(1) + "%"; ui.gFill.dataset.state = gas >= M.lel ? "bad" : gas > 10 ? "warn" : "ok";
  ui.gOut.textContent = Math.round(gas) + " % LEL";
  ui.air.setAttribute("aria-pressed", String(air)); ui.air.textContent = air ? "AIR OFF" : "PURGE";
  ui.power.setAttribute("aria-pressed", String(power)); ui.power.textContent = power ? "POWER OFF" : "POWER ON";
  ui.door.setAttribute("aria-pressed", String(doorOpen)); ui.door.textContent = doorOpen ? "Close door" : "Open door";
  ui.slow.setAttribute("aria-pressed", String(slow));
  ui.tour.setAttribute("aria-pressed", String(touring));
}
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };

function blowUp(why) {
  if (boomAt !== null) return;
  boomAt = now + 0.12; cause = why; power = false; air = false;
  say(why === "nopurge" ? "Boom. Power went on with the cabinet still full of the zone's gas, and the contactor's first spark lit it. That's what the pre-purge is for, and what the interlock exists to stop."
    : why === "intake" ? "Boom, and the interlock was happy. It saw the pressure and counted " + vols.toFixed(1) + " volumes, but it can't smell the air: the intake was in Zone 1, so the cabinet was purged with gas. Purge air has to come from the safe area."
    : why === "door" ? "Boom. The door came open while it was live, the pressure fell, gas seeped back in, and with the interlock bypassed nothing cut the power. The contactor did the rest."
    : "Boom. Gas got back in while it was live and nothing cut the power.");
}

function step(dt) {
  if (boomAt !== null) return;
  const sealedFlow = air && !doorOpen;
  const target = sealedFlow ? M.runPa : 0;
  pa += (target - pa) * (1 - Math.exp(-dt / M.tauP));
  if (sealedFlow) {
    const dv = M.volPerSec * dt;
    vols += dv;
    const f = 1 - Math.exp(-M.mix * dv);
    gas += ((safeIntake ? 0 : M.outside) - gas) * f;
  }
  if (pa < M.minPa) {
    // no overpressure: the zone's gas seeps back in
    gas += (M.outside - gas) * (1 - Math.exp(-dt / M.seep)) * (doorOpen ? 2.2 : 1);
    if (vols > 0 && !air) vols = Math.max(0, vols - dt * 2);
    if (doorOpen) vols = 0;
  }
  // the px interlock: power off on loss of pressure, and only back on after a fresh purge
  if (interlock && power && pa < M.minPa) { power = false; tripAt = now; vols = 0; say("Trip. The pressure dropped below " + M.minPa + " Pa, so the interlock cut the power, and it won't let it back on until the cabinet's been purged again. That's px doing its job."); }
  if (power) {
    if (now >= nextSwitch) { sparkAt = now; nextSwitch = now + 1.1; if (gas >= M.lel) blowUp(!safeIntake && vols >= M.purgeVols ? "intake" : doorOpen ? "door" : vols < M.purgeVols ? "nopurge" : "seep"); }
  }
}

function tryPower() {
  if (power) { power = false; return; }
  if (interlock && !(pa >= M.minPa && purged())) { say("The interlock won't allow it: " + (pa < M.minPa ? "there's no overpressure" : "it's only been purged " + vols.toFixed(1) + " of " + M.purgeVols + " volumes") + ". Purge first."); return; }
  power = true; nextSwitch = now + 0.4; tripAt = null;
}

function chaos() {
  if (boomAt === null) return { c: -1, back: 0 };
  const c = now - boomAt;
  if (c < 0 || c > BOOM_END) return { c: -1, back: 0 };
  return { c, back: 1 - sm(3.2, 4.1, c) };
}
// ---------------- the pressurised cabinet, in real 3D ----------------
const TAU = Math.PI * 2, rn = () => Math.random(), CB = D.CAB, G3 = D.GEO, VT = G3.VENT, INL = G3.INLET, SPKP = [0, -16.6, 52];
const flashEl = stage.querySelector(".fx-flash"), CABC = "#aab3bc", HINGE = [CB.x + 3, CB.y + CB.d];
const SAFE_PIPE = [[G3.SAFE_IN[0] + 6, G3.SAFE_IN[1], 7], [G3.SAFE_IN[0] + 11, G3.SAFE_IN[1], 3], [-50, G3.SAFE_IN[1], 3], [-40, 40, 3], [INL[0] - 4, 40, 3], [INL[0], 37, 3.4], [INL[0], 31, 7], [INL[0], 28.6, 9.6]];
const ZONE_PIPE = [[G3.ZONE_IN[0] - 6, G3.ZONE_IN[1], 7], [G3.ZONE_IN[0] - 11, G3.ZONE_IN[1], 3], [10, 48, 3], [INL[0] + 6, 41, 3], [INL[0], 37, 3.4], [INL[0], 31, 7], [INL[0], 28.6, 9.6]];
function intakeParts([x, y], dim) {
  const c = dim ? "#6f767e" : "#8f9aa4";
  return [prism(rrect(x - 8, x + 8, y - 8, y + 8, 1.5), "z", 0, 2, "#5a626c", { mat: "paint" }), prism(rrect(x - 6, x + 6, y - 6, y + 6, 2), "z", 2, 12, c, { mat: "paint" }), cyl(x, y, 5, 12, 18, c, 28, { mat: "paint" }), cyl(x, y, 3.9, 18, 18.06, "#15181c", 24, { bevel: 0, flat: true }),
    ...[-2.4, 0, 2.4].flatMap((d) => [box(x + d - 0.18, x + d + 0.18, y - 3.6, y + 3.6, 18.06, 18.2, "#c9ced3", { bevel: 0, flat: true }), box(x - 3.6, x + 3.6, y + d - 0.18, y + d + 0.18, 18.06, 18.2, "#c9ced3", { bevel: 0, flat: true })])];
}
function benchParts() {
  const o = [], PL = D.PLATE, dv = D.DIVIDE;
  o.push(box(dv - 3, dv + 3, PL.y + 6, PL.y + PL.d - 6, 0, 0.6, "#e8b923", { mat: "paint", bevel: 0.2 }));
  for (let y = PL.y + 8; y < PL.y + PL.d - 12; y += 7) o.push(prism([[dv - 3, y], [dv + 3, y + 4], [dv + 3, y + 7.4], [dv - 3, y + 3.4]], "z", 0.6, 0.66, "#23262b", { bevel: 0, flat: true }));
  return o;
}
function cabParts() {
  const o = [], W = G3.WALL, x0 = CB.x, x1 = CB.x + CB.w, y0 = CB.y, y1 = CB.y + CB.d, zf = G3.ZF, zr = G3.ZR, S = { mat: "paint", shell: true, bevel: 0.3 };
  o.push(box(x0 - 2, x1 + 2, y0 - 2, y1 + 2, 0, G3.Z0, "#4a5058", { mat: "paint", bevel: 0.4 }), box(x0, x1, y0, y1, G3.Z0, zf, CABC, { mat: "paint", bevel: 0.2 }));
  o.push(box(x0, x1, y0, y0 + W, zf, zr, CABC, S), box(x0, x0 + W, y0 + W, y1, zf, zr, CABC, S), box(x1 - W, x1, y0 + W, y1, zf, zr, CABC, S));
  o.push(box(x0 + W, x1 - W, y1 - W, y1, zf, 9, CABC, S), box(x0 + W, x1 - W, y1 - W, y1, 75, zr, CABC, S), box(x0 - 1, x1 + 1, y0 - 1, y1 + 1, zr, G3.ZTOP, CABC, S));
  // vent with its spark arrestor, inlet valve
  o.push(cyl(VT[0], VT[1], 3.4, G3.ZTOP, G3.ZTOP + 6, "#8f9aa4", 24, { mat: "paint" }), cyl(VT[0], VT[1], 5.2, G3.ZTOP + 6, G3.ZTOP + 7.4, "#6f767e", 28, { mat: "paint" }), cyl(VT[0], VT[1], 4.4, G3.ZTOP + 7.4, G3.ZTOP + 9.8, "#c9ced3", 28, { mat: "steel" }));
  o.push(box(INL[0] - 4, INL[0] + 4, y1, y1 + 3.4, 6, 14, "#c9a24a", { mat: "metal", bevel: 0.6 }), cyl(INL[0], y1 + 1.7, 2.4, 14, 19, "#2e6aa8", 16, { mat: "paint" }));
  // back mounting plate and the ordinary, sparking gear on it
  const by = y0 + W;
  o.push(box(x0 + 4, x0 + 48, by, by + 1, 10, 74, "#d5d9dd", { mat: "satin", bevel: 0 }));
  for (const z of [24, 44, 64]) o.push(box(x0 + 6, x0 + 46, by + 1, by + 2.4, z, z + 2.4, "#aeb4bb", { mat: "steel", bevel: 0.15 }));
  o.push(box(-24, -10, by + 1, by + 13, 12, 24, "#4f565e", { mat: "paint", bevel: 0.5 }), box(-22.6, -11.4, by + 2.4, by + 13.6, 14.6, 21.4, "#c0703a", { mat: "satin", bevel: 0.8 }));
  o.push(box(-6, 6, by + 2.4, by + 14.4, 46.4, 58.4, "#e6dcc3", { mat: "plastic", bevel: 0.5 }), box(-6, 6, by + 2.4, by + 14.4, 56, 58.4, "#3a3e44", { mat: "plastic", bevel: 0.5 }), box(-2.4, 2.4, by + 14.4, by + 15.2, 50, 54, "#26282c", { mat: "plastic", bevel: 0.2 }));
  for (const x of [-3.6, 3.6]) o.push(prism(circle(x, 48.4, 0.9, 10), "y", by + 14.4, by + 14.9, "#d8dce0", { mat: "steel" }));
  for (let i = 0; i < 5; i++) { const x = x0 + 8 + i * 6; o.push(box(x, x + 5, by + 2.4, by + 11.4, 66.4, 76.4, "#e3e7ea", { mat: "plastic", bevel: 0.4 }), box(x + 1.5, x + 3.5, by + 11.4, by + 12.6, 70, 73.5, i === 2 ? "#e2742a" : "#3f9fe6", { mat: "plastic", bevel: 0.3 })); }
  for (let i = 0; i < 3; i++) o.push(box(10 + i * 5, 14 + i * 5, by + 2.4, by + 10.4, 26.4, 36.4, "#7fa08a", { mat: "plastic", bevel: 0.4 }));
  for (const [a, b, c] of [[[-3.6, by + 14, 47], [-9, by + 12, 36], [-15, by + 10, 24.5]], [[3.6, by + 14, 47], [9, by + 10, 41], [12, by + 8, 36.6]], [[0, by + 8, 58.6], [-2, by + 9, 62], [-8, by + 8, 66.2]]]) o.push(tube([a, b, c], 0.55, "#3b3d42", { seg: 6, mat: "plastic" }));
  // the purge controller on the side
  o.push(box(x1, x1 + 5, -30, -4, 40, 72, "#3a3e44", { mat: "paint", bevel: 0.6 }), prism(circle(-17, 62, 8.3, 40), "x", x1 + 5, x1 + 5.2, "#15181c", { mat: "plastic" }), prism(circle(-17, 62, 7.5, 40), "x", x1 + 5.2, x1 + 5.35, "#f4f2ec", { mat: "matte", bevel: 0 }));
  o.push(tube([[x1 + 1.4, -27, 40.4], [x1 + 1.4, -27, 34], [x1 - 0.4, -27, 34]], 0.6, "#c9a24a", { seg: 6, mat: "metal" }));
  return o;
}
function doorParts() {
  const o = [], y = CB.y + CB.d, S = { mat: "paint", shell: true, bevel: 0.3 }, DC = "#bcc4cc", xa = CB.x + 3, xb = CB.x + CB.w - 3;
  o.push(box(xa, 10, y, y + 1.4, 9, 75, DC, S), box(10, 33, y, y + 1.4, 9, 46, DC, S), box(10, 33, y, y + 1.4, 70, 75, DC, S), box(33, xb, y, y + 1.4, 9, 75, DC, S));
  o.push(box(10, 33, y + 0.4, y + 1, 46, 70, "#9fd0e8", { mat: "glass", opacity: 0.22, bevel: 0 }));
  o.push(box(34, 36, y + 1.4, y + 3.6, 36, 46, "#2f3338", { mat: "plastic", bevel: 0.5 }), box(-22, 7, y + 1.4, y + 1.7, 52, 62, "#e9e6df", { mat: "matte", bevel: 0 }));
  for (const z of [16, 68]) o.push(cyl(xa - 0.6, y + 0.7, 1.1, z - 4, z + 4, "#8f959d", 10, { mat: "steel" }));
  return o;
}
const hash4 = (i) => { const h = (n2) => { const s = Math.sin(i * 12.9898 + n2 * 78.233) * 43758.5453; return s - Math.floor(s); }; return [h(1), h(2), h(3), h(4)]; };
const HAZE = Array.from({ length: 30 }, (_, i) => hash4(i)), INSIDE = Array.from({ length: 26 }, (_, i) => hash4(i + 50));
let fx = [];
function draw(dt = 0) {
  const K = chaos(), PL = D.PLATE, x1 = CB.x + CB.w, flow = K.c < 0 && air && !doorOpen, gf = K.c >= 0 ? 0 : clamp(gas / 150, 0, 1.2);
  doorA += ((doorOpen ? 1 : 0) - doorA) * 0.2;
  let dm = doorA > 0.005 ? rotZ(HINGE[0], HINGE[1], 1.08 * doorA) : undefined, da = 1.08 * doorA;
  if (K.c >= 0) {
    const c = K.c, cl = Math.min(c, 0.9);
    da = 1.08 * doorA + 7.3 * cl * K.back; dm = rotZ(HINGE[0], HINGE[1], da); dm[9] += -20 * cl * K.back; dm[10] += 260 * cl * K.back; dm[11] += (300 * cl - 500 * cl * cl) * K.back;
  }
  const lampOk = purged() && pa >= M.minPa, lampTrip = tripAt !== null && now - tripAt < 4 && Math.sin(now * 10) > 0;
  const lamp = (y, on, col, dark) => prism(circle(y, 51, 1.6, 14), "x", x1 + 5, x1 + 5.6, on ? col : dark, { flat: true, emit: on ? [col, 1] : undefined, emitK: 2.2 });
  const objs = [{ cache: "bench", rev: 0, parts: benchParts }, { cache: "cab", rev: 0, parts: cabParts }, { cache: "door", rev: 0, m: dm, parts: doorParts },
    { cache: "inS", rev: safeIntake ? 1 : 0, parts: () => intakeParts(G3.SAFE_IN, !safeIntake) }, { cache: "pipe", rev: safeIntake ? 1 : 0, parts: () => [tube(safeIntake ? SAFE_PIPE : ZONE_PIPE, 1.9, "#8f9aa4", { seg: 10, mat: "paint" }), ...(safeIntake ? [] : intakeParts(G3.ZONE_IN, false))] },
    { parts: [lamp(-11, lampOk, "#5fe08a", "#2f5a3e"), lamp(-17, lampTrip, "#ff5a3a", "#6a3028"), lamp(-23, power, "#ffc24a", "#6a5424")] }];
  let svg = E.render(objs);
  // Zone 1 gas hanging over the bench: not in the safe area, not inside the cabinet
  const hz = K.c >= 0 ? Math.max(0, 1 - K.c * 4) * (K.c < 3.2 ? 1 : 0) : 1, gcol = lightTheme ? "#2f8f84" : "#6fd0c0";
  if (hz > 0.01) for (const [a, b, c, d] of HAZE) { const t = now * 0.05 + d * 9, x = D.DIVIDE + 20 + a * (PL.x + PL.w - D.DIVIDE - 34) + Math.sin(t * 1.3 + c * 6) * 10, y = PL.y + 12 + b * (PL.d - 24) + Math.cos(t + a * 6) * 8; if (x > CB.x - 14 && x < x1 + 14 && y > CB.y - 14 && y < CB.y + CB.d + 14) continue; E.sprite([x, y, 6 + c * 26], 18 + d * 12, gcol, (lightTheme ? 0.08 : 0.06) * hz); }
  // what's inside the cabinet: the zone's gas, thinning out as the purge goes on
  if (gf > 0.02) for (const [a, b, c, d] of INSIDE) { const t = now * 0.12 + d * 9; E.sprite([CB.x + 7 + a * (CB.w - 14) + Math.sin(t + c * 6) * 3, CB.y + 8 + b * (CB.d - 16) + Math.cos(t * 1.2 + a * 6) * 3, 12 + c * 60], 11 + d * 5, lightTheme ? "#1f8f7f" : "#35c9a8", (lightTheme ? 0.2 : 0.13) * gf, !lightTheme); }
  // purge air: in at the bottom front, up through the gear, out of the vent
  if (dt > 0 && flow) {
    for (let j = 0; j < 2; j++) fx.push({ k: "air", t: 0, sp: 0.9 + rn() * 0.5, off: [(rn() - 0.5) * 16, (rn() - 0.5) * 10, (rn() - 0.5) * 8], life: 0, max: 1.4 });
    if (rn() < 0.7) fx.push({ k: "plume", p: [VT[0] + (rn() - 0.5) * 3, VT[1] + (rn() - 0.5) * 3, G3.ZTOP + 10], v: [(rn() - 0.5) * 6, (rn() - 0.5) * 6, 26 + rn() * 14], life: 0, max: 0.9 + rn() * 0.5, g: clamp(gas / 100, 0, 1) });
    const ic = safeIntake ? G3.SAFE_IN : G3.ZONE_IN; if (rn() < 0.5) { const a = rn() * TAU; fx.push({ k: "suck", c: ic, a, life: 0, max: 0.6, g: safeIntake ? 0 : 1 }); }
  }
  // the contactor: an ordinary spark, every time it switches
  const sp = K.c >= 0 ? 0 : burst(now - sparkAt, 0.004, 0.08);
  if (sp > 0.02) { const fl = 0.6 + 0.4 * rn(); E.sprite(SPKP, 1.8, "#ffffff", sp * fl, true, 1); E.sprite(SPKP, 6, "#8fb4ff", 0.6 * sp * fl, true, 1); for (let j = 0; j < 2; j++) E.line(SPKP, [SPKP[0] + (rn() - 0.5) * 4, SPKP[1] + rn() * 3, SPKP[2] + (rn() - 0.5) * 4], 1.4, "#dfe9ff", sp, true); }
  if (K.c >= 0) {
    const c = K.c, life = Math.exp(-c / 0.5), Rr = 18 + 60 * (1 - Math.exp(-c / 0.2)), C = [CB.x + CB.w / 2, CB.y + CB.d / 2 + 10, 48 + 26 * c];
    if (life > 0.02) { E.sprite(C, Rr * 0.8, "#ffb04a", 0.5 * life, true, 1); E.sprite(C, Rr * 0.35, "#fff0c8", 0.6 * life, true, 1); }
    if (dt > 0 && c < 1.0) for (let j = 0; j < 8; j++) fx.push({ k: "flame", p: [D.DIVIDE + 34 + rn() * (PL.x + PL.w - D.DIVIDE - 40), PL.y + 8 + rn() * (PL.d - 16), 8 + rn() * 70], v: [rn() * 110, (rn() - 0.5) * 120, 30 + rn() * 90], life: 0, max: 0.45 + rn() * 0.6, s: 1.7 + rn() });
    if (dt > 0 && c >= 0.3 && c < 2.8 && rn() < dt * 40) fx.push({ k: "smoke", p: [D.DIVIDE + 30 + rn() * 150, (rn() - 0.5) * 120, 30 + rn() * 60], v: [(rn() - 0.5) * 20, (rn() - 0.5) * 20, 30 + rn() * 40], life: 0, max: 2 + rn() * 2, s: 1.5 });
  }
  const A0 = [INL[0], CB.y + CB.d - 5, 10], B0 = [VT[0], VT[1], 77], acol = lightTheme ? "#5f7f9a" : "#e6f0fa";
  fx = fx.filter((p) => {
    p.life += dt; if (p.life > p.max) return false;
    const t = p.life / p.max;
    if (p.k === "air") { if (!flow) return false; const u = Math.min(1, p.life * p.sp), w = Math.sin(u * Math.PI); E.sprite([A0[0] + (B0[0] - A0[0]) * u + p.off[0] * w, A0[1] + (B0[1] - A0[1]) * u + p.off[1] * w, A0[2] + (B0[2] - A0[2]) * u + p.off[2] * w], 2.6, acol, (lightTheme ? 0.5 : 0.4) * w, !lightTheme); return u < 1; }
    if (p.k === "suck") { const r = 9 * (1 - t), a = p.a + t * 3; E.sprite([p.c[0] + Math.cos(a) * r, p.c[1] + Math.sin(a) * r, 19 + 8 * (1 - t)], 2.4, p.g ? gcol : acol, 0.45 * Math.sin(t * Math.PI), !lightTheme); return true; }
    if (p.k === "flame") { p.v[0] *= 0.93; p.v[1] *= 0.93; }
    for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * dt;
    if (p.k === "flame") E.sprite(p.p, (5 + 15 * t) * p.s, t < 0.25 ? "#fff0b8" : t < 0.6 ? "#ff9a2e" : "#d8481a", 0.8 * (1 - t * t), true, 2);
    else if (p.k === "plume") E.sprite(p.p, 3 + 8 * t, p.g > 0.4 ? gcol : acol, (p.g > 0.4 ? 0.3 : 0.22) * (1 - t));
    else E.sprite(p.p, (12 + 40 * t) * p.s, lightTheme ? "#4a4744" : "#2e2c2b", 0.45 * (1 - t));
    return true;
  });
  // lettering: the bench, the door's plate, the controller's face
  let m = E.faceMatrix([PL.x + 7, PL.y + PL.d - 13, 0.05], [1, 0, 0], [0, 1, 0]);
  if (m) svg += '<g transform="' + m + '"><text class="pt bench" x="0" y="5" font-size="4.4">SAFE AREA</text></g>';
  m = E.faceMatrix([PL.x + PL.w - 44, PL.y + PL.d - 13, 0.05], [1, 0, 0], [0, 1, 0]);
  if (m) svg += '<g transform="' + m + '"><text class="pt bench" x="0" y="5" font-size="5">ZONE 1</text></g>';
  if (K.c < 0) {
    const ca = Math.cos(da), sa = Math.sin(da), ox = -22 - HINGE[0], oy = CB.y + CB.d + 1.75 - HINGE[1];
    m = E.faceMatrix([HINGE[0] + ox * ca - oy * sa, HINGE[1] + ox * sa + oy * ca, 62], [ca, sa, 0], [0, 0, -1]);
    if (m) svg += '<g transform="' + m + '"><text class="pt" x="1.6" y="4.2" font-size="2.9">Ex pxb IIC T4</text><text class="pt lo" x="1.6" y="8" font-size="2.1">DO NOT OPEN UNLESS</text></g>';
  }
  m = E.faceMatrix([x1 + 5.4, -4, 72], [0, -1, 0], [0, 0, -1]);
  if (m) {
    const cx = 13, cy = 10, r = 7.5, a50 = ((-225 + (50 / 150) * 270) * Math.PI) / 180; let ticks = "";
    for (let i = 0; i <= 15; i++) { const a = ((-225 + (i / 15) * 270) * Math.PI) / 180, r0 = i % 5 === 0 ? r - 2 : r - 1.2; ticks += "M" + (cx + Math.cos(a) * r0).toFixed(2) + " " + (cy + Math.sin(a) * r0).toFixed(2) + "L" + (cx + Math.cos(a) * (r - 0.4)).toFixed(2) + " " + (cy + Math.sin(a) * (r - 0.4)).toFixed(2); }
    svg += '<g transform="' + m + '"><path d="' + ticks + '" style="stroke:#4a4f57;stroke-width:.3;fill:none"/><path d="M' + (cx + Math.cos(a50) * (r - 2.4)).toFixed(2) + " " + (cy + Math.sin(a50) * (r - 2.4)).toFixed(2) + "L" + (cx + Math.cos(a50) * (r - 0.3)).toFixed(2) + " " + (cy + Math.sin(a50) * (r - 0.3)).toFixed(2) + '" style="stroke:#e0452a;stroke-width:.8"/>'
      + '<text class="pt lo" x="' + cx + '" y="' + (cy + 4.6) + '" font-size="1.7" text-anchor="middle">Pa</text><path d="M' + cx + " " + cy + "L" + cx + " " + (cy - r + 1.4) + '" style="stroke:#e2501a;stroke-width:.6" transform="rotate(' + (-135 + clamp(pa / 150, 0, 1) * 270).toFixed(1) + " " + cx + " " + cy + ')"/><circle cx="' + cx + '" cy="' + cy + '" r=".8" fill="#23262b"/>'
      + '<text class="pt face" x="7" y="25" font-size="1.3" text-anchor="middle">PURGED</text><text class="pt face" x="13" y="25" font-size="1.3" text-anchor="middle">TRIP</text><text class="pt face" x="19" y="25" font-size="1.3" text-anchor="middle">POWER</text><text class="pt lcd" x="13" y="29.6" font-size="2.2" text-anchor="middle">VOL ' + vols.toFixed(1) + "</text></g>";
  }
  if (E.xray > 0.02 && K.c < 0) { const ic = safeIntake ? G3.SAFE_IN : G3.ZONE_IN; svg += E.callouts([
    { p: [ic[0], ic[1], 18], text: "Purge air intake", sub: safeIntake ? "clean air from the safe area" : "drawing in the zone's own gas" }, { p: SPKP, text: "Contactor", sub: "sparks every time it switches" },
    { p: [VT[0], VT[1], G3.ZTOP + 9], text: "Vent", sub: "with a spark arrestor" }, { p: [x1 + 5.4, -17, 62], text: "Purge controller", sub: "reads pressure, counts volumes" },
  ], E.xray, E.fs < 0.62 ? {} : { topL: 70, topR: 70 }); }
  if (sceneG.innerHTML !== svg) sceneG.innerHTML = svg;
  if (K.c >= 0) { const A = 8 * Math.exp(-K.c / 0.4); setShake(A * Math.sin(K.c * 90), A * Math.cos(K.c * 71)); flashEl.style.opacity = (0.85 * burst(K.c, 0.03, 0.25)).toFixed(3); }
  else if (boomAt !== null && now - boomAt > BOOM_END) {
    boomAt = null; gas = M.outside; vols = 0; pa = 0; doorOpen = false; doorA = 0; power = false; air = false;
    setShake(0, 0); flashEl.style.opacity = "0";
    say("Reset. The cabinet's full of the zone's gas again, like any box that's been sitting in Zone 1 switched off. Purge it before you power it.");
  }

  const text = K.c >= 0 ? (K.c < 3.2 ? "BOOM · " + ({ nopurge: "powered unpurged", intake: "purged with gas", door: "door open, live", seep: "gas got back in" })[cause] : "resetting…")
    : Math.round(pa) + " Pa · " + vols.toFixed(1) + " vol · " + Math.round(gas) + " % LEL inside · " + (power ? "POWER ON" : "power off") + (interlock ? "" : " · BYPASSED");
  if (readout.textContent !== text) readout.textContent = text;
  if (boomAt === null && !(tripAt !== null && now - tripAt < 4)) {
    if (power && gas < M.lel) say(safeIntake ? "Live. " + Math.round(pa) + " Pa holding the zone out, gas inside down to " + Math.round(gas) + " % LEL. The contactor sparks every time it switches, and there's nothing in there for it to light." : "Live, purged with gas: " + Math.round(gas) + " % LEL inside and climbing back…");
    else if (air && !doorOpen && !purged()) say(safeIntake ? "Purging. Clean air in at the bottom, gas out of the vent at the top. " + vols.toFixed(1) + " of " + M.purgeVols + " volumes, " + Math.round(gas) + " % LEL inside. It doesn't mix perfectly, which is why it takes five." : "Purging, with the intake in Zone 1. It's blowing the zone's own gas through the cabinet. The pressure's fine and the counter's counting, but look at the gas meter.");
    else if (air && purged() && !power) say(safeIntake ? "Purged: " + vols.toFixed(1) + " volumes, " + Math.round(gas) + " % LEL. The PURGED lamp is on and the interlock will allow power." : "The interlock is satisfied: " + vols.toFixed(1) + " volumes at " + Math.round(pa) + " Pa. The gas meter isn't. The interlock can't see that.");
    else if (doorOpen && power) say("Door open, live, interlock bypassed. The pressure's gone and the zone's gas is seeping back in: " + Math.round(gas) + " % LEL…");
    else if (!air && !power) say("Sitting in Zone 1 switched off, the cabinet fills with the zone's gas. Hit PURGE.");
  }
}
// demo: each act is [seconds into the step, action]
const TOUR = [
  { safe: true, lock: true, acts: [[0.5, "air"], [10.2, "power"], [13.5, "door"], [17, "end"]] },
  { safe: true, lock: false, acts: [[1, "power"], [5, "end"]] },
  { safe: false, lock: true, acts: [[0.5, "air"], [10.2, "power"], [15, "end"]] },
  { safe: true, lock: false, acts: [[0.5, "air"], [10.2, "power"], [12.5, "door"], [20, "end"]] },
];
function tick(t) {
  const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
  last = t;
  const sdt = dt * (slow ? 0.12 : 1);
  now += sdt;
  if (touring && !booming()) {
    tourClock += sdt;
    if (tourStep < 0 || actions.length === 0) {
      tourStep = (tourStep + 1) % TOUR.length;
      const s = TOUR[tourStep];
      safeIntake = s.safe; interlock = s.lock; air = false; power = false; doorOpen = false; pa = 0; vols = 0; gas = M.outside; tripAt = null;
      actions = s.acts.map(([w, a]) => [tourClock + w, a]);
    }
    while (actions.length && tourClock >= actions[0][0]) {
      const a = actions.shift()[1];
      if (a === "air") air = true;
      else if (a === "power") tryPower();
      else if (a === "door") doorOpen = true;
      else if (a === "end") actions = [];
    }
  }
  step(sdt);
  draw(sdt); syncUi();
  const idle = !touring && !air && !power && pa < 0.5 && Math.abs(gas - M.outside) < 0.5 && boomAt === null && Math.abs(doorA - (doorOpen ? 1 : 0)) < 0.01 && !(tripAt !== null && now - tripAt < 4);
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { touring = false; actions = []; };
const guard = (fn) => (...a) => { takeOver(); if (booming()) return; fn(...a); run(); };
const setIntake = guard((v) => { safeIntake = v; });
const setLock = guard((v) => { interlock = v; });
const toggleAir = guard(() => { air = !air; });
const togglePower = guard(() => tryPower());
const toggleDoor = guard(() => { doorOpen = !doorOpen; });
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;

ui.intake.forEach((b) => b.addEventListener("click", () => setIntake(b.dataset.intakeBtn === "safe")));
ui.lock.forEach((b) => b.addEventListener("click", () => setLock(b.dataset.lock === "on")));
ui.air.addEventListener("click", toggleAir);
ui.power.addEventListener("click", togglePower);
ui.door.addEventListener("click", toggleDoor);
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; tourClock = 0; actions = []; } run(); });
onTap(() => toggleDoor());
stage.addEventListener("keydown", (ev) => {
  const map = { x: () => { setX(!E.xrayOn); run(); }, X: () => { setX(!E.xrayOn); run(); }, a: toggleAir, p: togglePower, d: toggleDoor, " ": togglePower, Enter: togglePower, i: () => setIntake(!safeIntake), l: () => setLock(!interlock), s: () => { slow = !slow; run(); } };
  if (map[ev.key]) { ev.preventDefault(); map[ev.key](); }
});
window.__fig = { E, freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
setX(true); syncUi(); draw();
`;

const CSS = `.fx-flash{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(circle 70% at 55% 45%,#fff8e8 0%,#ffd9a0 40%,rgba(255,170,90,0) 100%)}
.pt{font-family:var(--anatomy-mono);fill:#23262b;font-weight:700}.pt.lo{fill:#5a6068;font-weight:600}.pt.face{fill:#c9ced3;font-weight:600}.pt.lcd{fill:#9ff0c0}.pt.bench{fill:var(--anatomy-muted);font-weight:600;letter-spacing:.08em;opacity:.8}
.mk-hint{top:46px}
.ctl #air,.ctl #power{padding:7px 14px;font-weight:600;letter-spacing:.06em;min-width:104px;text-align:center}
.meter{margin-top:12px}.meter .fill[data-state="low"]{background:var(--anatomy-mid)}
.mark:not(.red){border-left-color:var(--mk-accent)}.mark:not(.red)::after{color:var(--mk-accent)}`;

const stage = stageHtml({
  W, H, fig: "Fig 8", title: "Ex p, purge and pressure", xray: true,
  label: "A pressurised Ex p control cabinet on a bench in Zone 1 with a contactor, a transformer and breakers inside. Purge air comes from an intake in the safe area through a valve; a vent with a spark arrestor lets it out of the roof. A purge controller on the side shows the pressure and counts purge volumes. An x-ray mode turns the cabinet to glass to show the gas inside and the purge air sweeping it out.",
  keysHelp: "Pressurised cabinet: drag to rotate, X for x-ray, tap to open the door, A purges, P or space powers, D opens the door, I moves the intake, L bypasses the interlock",
  extra: `<div class="fx-flash" aria-hidden="true"></div>`,
});

const CONTROLS = `<div class="ctl" role="group" aria-label="Test controls">
  <div class="ctl-row"><span class="ctl-label">Intake</span><button type="button" data-intake-btn="safe" aria-pressed="true">Safe area</button><button type="button" data-intake-btn="zone" aria-pressed="false">In the zone</button></div>
  <div class="ctl-row"><span class="ctl-label">Interlock</span><button type="button" data-lock="on" aria-pressed="true">Working</button><button type="button" data-lock="off" aria-pressed="false">Bypassed</button></div>
  <div class="ctl-row"><span class="ctl-label">Pressure</span><div class="meter"><span id="p-fill" class="fill"></span><span class="mark" style="left:${(50 / 150 * 100).toFixed(1)}%" data-label="50 Pa"></span></div><output id="p-out">0 Pa</output></div>
  <div class="ctl-row"><span class="ctl-label">Purged</span><div class="meter"><span id="v-fill" class="fill"></span><span class="mark" style="left:${(5 / 8 * 100).toFixed(1)}%" data-label="5 volumes"></span></div><output id="v-out">0.0 vol</output></div>
  <div class="ctl-row"><span class="ctl-label">Gas inside</span><div class="meter"><span id="g-fill" class="fill"></span><span class="mark red" style="left:50%" data-label="LEL"></span></div><output id="g-out">150 % LEL</output></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="air" aria-pressed="false">PURGE</button><button type="button" id="power" class="danger" aria-pressed="false">POWER ON</button><button type="button" id="door" aria-pressed="false">Open door</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
</div>`;


const foot = footHtml({
  theme, slug: "ex-p-purge",
  real: "IEC 60079-2, px: at least 50 Pa overpressure, a pre-purge of at least five enclosure volumes, power off on loss of pressure until a fresh purge, purge air from the safe area.",
  made: "the gas levels, how well it mixes, flows and timings.",
});
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), pageMk2({
  k, title: "Ex p, purge and pressure", fig: "Fig 8", hint: "Tap: open the door", theme, W, H, stage, controls: CONTROLS, css: CSS, foot,
  caption: "Ex p lets you put ordinary sparking kit in Zone 1 by keeping the gas out with clean air. First the cabinet is purged: at least five of its own volumes of air, because it never mixes perfectly. Then it's held above the zone at 50 Pa or more, so anything that leaks, leaks out. For px, losing the pressure cuts the power, and it stays off until it's purged again. It fails when someone powers it before the purge, bypasses the interlock and opens the door live, or takes the purge air from inside the zone. That last one fools the interlock completely: it can count volumes and read pressure, but it can't smell the air.",
  script: LIVE.replace("__DATA__", JSON.stringify(DATA)),
}));
console.log("wrote", name);
