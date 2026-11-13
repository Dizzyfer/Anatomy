import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { engineScript, stageHtml, pageMk2, footHtml } from "../../mk2/shell.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const W = 960, H = 640;

// Truth: the classic espresso numbers. About 9 bar at the puck, water at 90 to 96 degC, 20 to 30 seconds, roughly 1 part coffee to 2 parts drink (18 g in, 36 g out),
// and 18 % to 22 % of the dry coffee ending up dissolved in the cup. A steam boiler runs at about 1,0 to 1,3 bar, the gauge has a red line at 2 bar, and a safety valve sits on top.
// Toy: the flow through the puck (a steep power of grind size), the extraction curve, when it channels, and the pressure the boiler lets go at.
const BODY = { x0: -64, x1: 32, y0: -52, y1: 0, z1: 130 };
const GEO = { BODY, GROUP: [-16, 18], BOIL_Y: -26, BOIL_Z: 62, VALVE: [-4, -26], GAUGES: [-34, -14], TIMER: [-2, 13], GRIND: [66, -22] };
const MODEL = { refGrind: 4, refFlow: 1.64, out: 36, pre: 5, giveUp: 60, tau: 15.1, choke: 0.5, pNorm: 1.2, pValve: 1.8, pBurst: 3.0, climb: 0.15 };
const START = { grind: 4, dose: 18, bar: 9, temp: 93, tamp: 0, boil: 0 };
const PLATE = { x: -86, y: -66, w: 184, d: 140, r: 8 };
const P = k.fitProjection([...k.boxCorners(PLATE, -0.8, 0), [-64, -52, 158], [32, 0, 158], [84, -22, 100], [-16, 66, 70], [-64, 34, 8]], W, H, { pad: 22, azimuth: 45, elevation: 30 });
const DATA = { W, H, P, PLATE };
Object.assign(DATA, { GEO, MODEL, start: START });
const LIVE = `
${engineScript()}
const D = __DATA__;
const stage = document.querySelector(".mk-stage");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lightTheme = document.body.dataset.theme === "light";
const E = mk2(stage, D.P, { W: D.W, H: D.H, pivot: [0, -6, 66], plate: { ...D.PLATE, h: 12, foot: 5 }, shadowBox: [-96, -76, -18, 108, 84, 160] });
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
const G3 = D.GEO, M = D.MODEL, TAU = Math.PI * 2, rn = () => Math.random(), GX = G3.GROUP[0], GY = G3.GROUP[1], BD = G3.BODY;
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const burst = (age, rise, fall) => (age > 0 ? sm(0, rise, age) * Math.exp(-Math.max(0, age - rise) / fall) : 0);
const flashEl = stage.querySelector(".fx-flash"), q = (s) => document.querySelector(s);

// ---------------- the shot: a toy Darcy puck and a toy extraction curve ----------------
// grind 1 (fine) to 10 (coarse) is a particle size; flow goes up steeply with it, and the grounds give up their solubles more slowly.
const size = (g) => 240 + 25 * g;
function shotModel(b) {
  const d = size(b.grind) / size(M.refGrind), channel = b.tamp === 1 || (b.bar >= 12 && b.grind <= 3);
  let flow = M.refFlow * (b.bar / 9) * (18 / b.dose) * Math.pow(d, 5.2);                                // grams a second through the puck
  if (channel) flow *= 2.3;
  const choked = flow < M.choke, tFlow = M.out / flow, time = Math.min(M.giveUp, M.pre + tFlow), out = Math.min(M.out, Math.max(0, time - M.pre) * flow);
  let ey = 24 * (1 - Math.exp(-time / (M.tau * Math.pow(d, 1.5)))) + 0.45 * (b.temp - 93);
  if (channel) ey *= 0.72;
  if (choked) ey = Math.max(ey, 23.5);
  return { flow, time, out, ey: clamp(ey, 4, 26), channel, choked };
}
function taste(r, b) {
  if (r.choked) return "Choked. " + Math.round(r.time) + " seconds for " + r.out.toFixed(0) + " g of drips: bitter, ashy, over-extracted. Grind coarser or dose less.";
  if (r.channel) return "Channelled. The water found a crack and went through it instead of the coffee: " + Math.round(r.time) + " seconds, thin, sour and bitter in the same cup." + (b.tamp === 1 ? " Tamp it level." : " Too much pressure for a grind that fine.");
  if (r.time < 18) return "Gusher: " + Math.round(r.time) + " seconds. The water tore through and only took the sour, salty front of the extraction (" + r.ey.toFixed(1) + " %). Grind finer.";
  if (r.ey > 22.2) return Math.round(r.time) + " seconds and " + r.ey.toFixed(1) + " % extracted: past the sweet spot into bitter and dry." + (b.temp > 96 ? " The water's too hot." : " Grind a touch coarser.");
  if (r.ey < 18) return Math.round(r.time) + " seconds and " + r.ey.toFixed(1) + " % extracted: sour and thin." + (b.temp < 89 ? " The water's too cold." : " Grind finer.");
  return Math.round(r.time) + " seconds, " + r.out.toFixed(0) + " g out of " + b.dose + " g in, " + r.ey.toFixed(1) + " % extracted. Sweet, syrupy, tiger-striped crema. That's the one.";
}

// ---------------- state ----------------
const brew = { ...D.start };
let now = 0, last = 0, frame = 0, visible = true, touring = !still.matches, tourStep = -1, tourWait = 0;
let shot = null, shotT = 0, outG = 0, lastRes = null, pB = M.pNorm, venting = 0, boomAt = null, pumpP = 0, cupG = 0, cupEy = 20;
const SPEED = 4, BOOM_END = 5.6, booming = () => boomAt !== null;
const ui = { grind: q("#grind"), grindOut: q("#grind-out"), dose: q("#dose"), doseOut: q("#dose-out"), bar: q("#bar"), barOut: q("#bar-out"), temp: q("#temp"), tempOut: q("#temp-out"), tamp: [...document.querySelectorAll("[data-tamp]")], boil: [...document.querySelectorAll("[data-boil]")],
  tFill: q("#t-fill"), tOut: q("#t-out"), eFill: q("#e-fill"), eOut: q("#e-out"), pull: q("#pull"), tour: q("#tour"), shot: q("#shot") };
const sliding = { grind: false, dose: false, bar: false, temp: false };
let lastShot = "";
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };
function syncUi() {
  for (const k of ["grind", "dose", "bar", "temp"]) if (!sliding[k]) ui[k].value = String(brew[k]);
  ui.grindOut.textContent = brew.grind <= 3 ? "fine " + brew.grind : brew.grind >= 7 ? "coarse " + brew.grind : "medium " + brew.grind;
  ui.doseOut.textContent = brew.dose + " g"; ui.barOut.textContent = brew.bar + " bar"; ui.tempOut.textContent = brew.temp + " °C";
  ui.tamp.forEach((b, i) => b.setAttribute("aria-pressed", String(i === brew.tamp)));
  ui.boil.forEach((b, i) => b.setAttribute("aria-pressed", String(i === brew.boil)));
  const t = shot ? shotT : lastRes ? lastRes.time : 0, ey = shot ? shot.ey * sm(0, shot.time, shotT) : lastRes ? lastRes.ey : 0;
  ui.tFill.style.width = clamp((t / 60) * 100, 0, 100).toFixed(1) + "%"; ui.tFill.dataset.state = t > 0 && (shot ? false : t < 22 || t > 33) ? "bad" : "ok"; ui.tOut.textContent = t ? t.toFixed(0) + " s" : "0 s";
  ui.eFill.style.width = clamp((ey / 28) * 100, 0, 100).toFixed(1) + "%"; ui.eFill.dataset.state = !shot && lastRes && (ey < 18 || ey > 22.2) ? "bad" : "ok"; ui.eOut.textContent = ey ? ey.toFixed(1) + " %" : "0 %";
  ui.tour.setAttribute("aria-pressed", String(touring));
}
function pull() {
  if (shot || booming()) return;
  shot = shotModel(brew); shotT = 0; outG = 0; cupG = 0; cupEy = shot.ey; lastRes = null; fx = [];
  say("Pump on. A few seconds of pre-infusion while the puck soaks…");
}
function step(dt) {
  // boiler: the pressurestat holds it near 1.2 bar. Stuck on, it climbs until the safety valve lifts. With the valve jammed too, it keeps climbing.
  if (!booming()) {
    if (brew.boil === 0) { pB += (M.pNorm + 0.08 * Math.sin(now * 0.9) - pB) * Math.min(1, dt * 1.5); venting = Math.max(0, venting - dt * 2); }
    else if (brew.boil === 1 && pB >= M.pValve) { venting = Math.min(1, venting + dt * 4); pB = M.pValve + 0.06 * Math.sin(now * 7); }
    else { venting = Math.max(0, venting - dt * 2); pB += dt * M.climb; }
    if (brew.boil === 2 && pB >= M.pBurst) { boomAt = now; shot = null; say("The boiler let go at " + pB.toFixed(1) + " bar. Stat stuck on and the safety valve jammed: nothing left to stop it. That valve is the last thing between a kettle and a bomb."); }
    else if (brew.boil === 1 && venting > 0.5 && !shot) say("Stat stuck on, but the safety valve has lifted at " + M.pValve.toFixed(1) + " bar and is dumping steam out of the top. Loud, wet, and exactly what it's for.");
    else if (brew.boil > 0 && !shot) say("The pressurestat's stuck on, so the element never switches off. Boiler at " + pB.toFixed(1) + " bar and climbing" + (brew.boil === 2 ? ", and the safety valve is jammed shut…" : "…"));
  }
  if (!shot) { pumpP += (0 - pumpP) * Math.min(1, dt * 5); return; }
  shotT += dt * SPEED;
  const flowing = shotT > M.pre;
  pumpP += ((shot.choked ? brew.bar : flowing ? brew.bar * (shot.channel ? 0.6 : 1) : brew.bar * 0.45) - pumpP) * Math.min(1, dt * 4);
  if (flowing) { outG = Math.min(shot.out, (shotT - M.pre) * shot.flow); cupG = outG; if (!booming()) say(shot.choked ? "Pump's at full pressure and almost nothing is coming out. The puck is choked." : shot.channel ? "It's spraying. The water has found a channel through the puck." : shot.time < 18 ? "That's running fast and pale already…" : "Dark, then caramel, then blond: " + outG.toFixed(0) + " g in the cup."); }
  if (shotT >= shot.time) { lastRes = shot; shot = null; if (brew.boil === 0) say(taste(lastRes, brew)); }
}
function chaos() { if (boomAt === null) return { c: -1, back: 0 }; const c = now - boomAt; if (c > BOOM_END) return { c: -1, back: 0 }; return { c, back: 1 - sm(4.5, 5.4, c) }; }

// ---------------- geometry ----------------
const STEELC = "#c5cbd1", DARK = "#2f3338", COPPER = "#c8682e";
const tipM = (piv, ang, axis) => { const c = Math.cos(ang), s = Math.sin(ang), R = axis === "x" ? [1, 0, 0, 0, c, -s, 0, s, c] : [c, 0, s, 0, 1, 0, -s, 0, c]; return [...R, ...[0, 1, 2].map((i) => piv[i] - (R[i * 3] * piv[0] + R[i * 3 + 1] * piv[1] + R[i * 3 + 2] * piv[2]))]; };
function frameParts() {
  const o = [], b = BD;
  // base, drip tray with its grate, scale, and everything inside the case
  o.push(box(b.x0, b.x1, b.y0, b.y1, 0, 8, DARK, { mat: "paint", bevel: 0.6 }), box(b.x0 + 2, b.x1 - 2, b.y1, b.y1 + 34, 0, 10, "#b4bcc4", { mat: "satin", bevel: 0.6 }), box(b.x0 + 4, b.x1 - 4, b.y1 + 2, b.y1 + 32, 10, 10.1, "#15181c", { bevel: 0, flat: true }));
  for (let x = b.x0 + 8; x < b.x1 - 6; x += 5) o.push(box(x - 0.5, x + 0.5, b.y1 + 2, b.y1 + 32, 10.1, 10.9, "#d8dce0", { mat: "steel", bevel: 0 }));
  o.push(prism(rrect(GX - 13, GX + 13, GY - 9, GY + 15, 2), "z", 10.9, 13.4, DARK, { mat: "plastic" }), box(GX - 9, GX + 9, GY + 9.6, GY + 14.2, 13.4, 13.5, "#101418", { bevel: 0, flat: true }));
  // boiler, heat exchanger pipes, pump, pressurestat and safety valve
  o.push(tube([[b.x0 + 14, b.y0 + 16, 18], [b.x0 + 36, b.y0 + 16, 18]], 8, "#3a3e44", { seg: 20, mat: "paint" }), tube([[b.x0 + 36, b.y0 + 16, 18], [b.x0 + 44, b.y0 + 16, 18]], 5, "#c9a24a", { seg: 16, mat: "metal" }));
  o.push(tube([[b.x0 + 44, b.y0 + 16, 18], [b.x0 + 52, b.y0 + 16, 18], [b.x0 + 54, G3.BOIL_Y, 40], [b.x0 + 54, G3.BOIL_Y, G3.BOIL_Z - 20]], 1.3, COPPER, { seg: 8, mat: "satin" }), tube([[GX + 8, G3.BOIL_Y + 16, G3.BOIL_Z + 6], [GX + 8, b.y1 - 8, G3.BOIL_Z + 10], [GX + 4, b.y1 + 2, 94]], 1.5, COPPER, { seg: 8, mat: "satin" }), tube([[GX - 8, G3.BOIL_Y + 18, G3.BOIL_Z - 8], [GX - 8, b.y1 - 8, G3.BOIL_Z - 4], [GX - 4, b.y1 + 2, 86]], 1.5, COPPER, { seg: 8, mat: "satin" }));
  // group head and steam wand
  o.push(box(GX - 9, GX + 9, b.y1, GY - 4, 84, 100, STEELC, { mat: "satin", bevel: 1 }), cyl(GX, GY, 12.5, 82, 100, STEELC, 36, { mat: "satin", bevel: 0.8 }), cyl(GX, GY, 9.6, 80.6, 82, "#8f959d", 30, { mat: "steel", bevel: 0 }));
  o.push(tube([[b.x0 + 14, b.y1 - 2, 104], [b.x0 + 14, b.y1 + 10, 102], [b.x0 + 13, b.y1 + 16, 92], [b.x0 + 9, b.y1 + 20, 46]], 1.5, "#d8dce0", { seg: 10, mat: "chrome" }), cyl(b.x0 + 9, b.y1 + 20, 2.2, 42, 46.5, "#d8dce0", 12, { mat: "chrome" }), prism(circle(b.x0 + 14, 112, 5, 8), "y", b.y1, b.y1 + 5, DARK, { mat: "plastic" }));
  // gauges and shot timer on the front
  for (const x of G3.GAUGES) o.push(prism(circle(x, 114, 8.6, 36), "y", b.y1, b.y1 + 0.9, "#8f959d", { mat: "steel" }), prism(circle(x, 114, 7.6, 36), "y", b.y1 + 0.9, b.y1 + 1.1, "#f6f4ee", { mat: "matte", bevel: 0 }));
  o.push(box(G3.TIMER[0], G3.TIMER[1], b.y1, b.y1 + 0.8, 107, 121, "#101418", { bevel: 0, flat: true }));
  // splash panel, hot water knob, heating lamp and power switch
  o.push(box(b.x0 + 8, b.x1 - 8, b.y1, b.y1 + 0.5, 14, 76, "#eceff2", { mat: "paint", bevel: 0 }), prism(circle(b.x1 - 10, 112, 5, 8), "y", b.y1, b.y1 + 5, DARK, { mat: "plastic" }));
  o.push(prism(circle(b.x1 - 10, 96, 1.7, 14), "y", b.y1, b.y1 + 1, "#ff8a2a", { emit: ["#ff7a1a", 0.5], flat: true }), box(b.x1 - 13, b.x1 - 7, b.y1, b.y1 + 1.2, 84, 91, "#c0281e", { mat: "plastic", bevel: 0.3 }));
  return o;
}
function boilerParts() {
  const b = BD;
  return [lathe([[0, 72], [19, 72], [20, 70], [20, 2], [19, 0], [0, 0]], COPPER, { c: [b.x0 + 12, G3.BOIL_Y, G3.BOIL_Z], axis: "x", seg: 40, mat: "satin" }),
    box(b.x0 + 20, b.x0 + 32, G3.BOIL_Y - 5, G3.BOIL_Y + 5, G3.BOIL_Z + 20, G3.BOIL_Z + 28, "#2f3338", { mat: "plastic", bevel: 0.5 }), cyl(G3.VALVE[0], G3.VALVE[1], 3.2, G3.BOIL_Z + 19, G3.BOIL_Z + 27, "#c9a24a", 6, { mat: "metal" }), cyl(G3.VALVE[0], G3.VALVE[1], 2, G3.BOIL_Z + 27, b.z1 + 2, "#c9a24a", 12, { mat: "metal" }), cyl(G3.VALVE[0], G3.VALVE[1], 3.4, b.z1 + 2, b.z1 + 4, "#c9a24a", 12, { mat: "metal" })];
}
// the case is four panels, so three of them can leave
function wall(i) {
  const b = BD, S = { mat: "satin", shell: true, bevel: 0.6 }, w = 1.6;
  return [i === 0 ? box(b.x0, b.x1, b.y1 - w, b.y1, 8, b.z1, STEELC, S) : i === 1 ? box(b.x0, b.x1, b.y0, b.y0 + w, 8, b.z1, STEELC, S) : i === 2 ? box(b.x0, b.x0 + w, b.y0 + w, b.y1 - w, 8, b.z1, STEELC, S) : box(b.x1 - w, b.x1, b.y0 + w, b.y1 - w, 8, b.z1, STEELC, S)];
}
function topParts() { const o = [], b = BD; o.push(box(b.x0 - 1, b.x1 + 1, b.y0 - 1, b.y1 + 1, b.z1, b.z1 + 2, STEELC, { mat: "satin", shell: true, bevel: 0.6 })); for (const y of [b.y0 + 2, b.y1 - 2]) o.push(tube([[b.x0 + 2, y, b.z1 + 8], [b.x1 - 2, y, b.z1 + 8]], 0.9, "#d8dce0", { seg: 8, mat: "chrome" })); for (const x of [b.x0 + 2, b.x1 - 2]) o.push(tube([[x, b.y0 + 2, b.z1 + 8], [x, b.y1 - 2, b.z1 + 8]], 0.9, "#d8dce0", { seg: 8, mat: "chrome" }), tube([[x, b.y0 + 2, b.z1 + 2], [x, b.y0 + 2, b.z1 + 8]], 0.9, "#d8dce0", { seg: 6, mat: "chrome" }), tube([[x, b.y1 - 2, b.z1 + 2], [x, b.y1 - 2, b.z1 + 8]], 0.9, "#d8dce0", { seg: 6, mat: "chrome" })); return o; }
// portafilter: the half facing you comes off in x-ray so you can see the puck
function pfParts() {
  const o = [], prof = [[8.9, 80.4], [10.6, 80.4], [10.6, 69], [5, 66.6], [5, 62], [3.4, 62], [3.4, 67.4], [8.9, 70.2], [8.9, 80.4]], O = { c: [GX, GY, 0], seg: 32, mat: "satin" };
  o.push(lathe(prof, STEELC, { ...O, a0: TAU * 0.375, a1: TAU * 0.875 }), lathe(prof, STEELC, { ...O, a0: -TAU * 0.125, a1: TAU * 0.375, xhide: true }));
  o.push(tube([[GX, GY + 10, 75], [GX, GY + 20, 74.5], [GX, GY + 46, 71]], [2.2, 2.6, 3.4], "#1d1f22", { seg: 14, mat: "plastic" }), sphere([GX, GY + 46, 71], 3.6, "#1d1f22", { mat: "plastic" }));
  return o;
}
function puckParts(ex, channel) {
  const top = 79.6, bot = Math.max(71.6, top - 0.42 * brew.dose), col = mixHex("#2a1608", "#7a5a3a", ex * 0.8), o = [lathe([[0, bot], [8.7, bot], [8.7, top], [0, top]], col, { c: [GX, GY, 0], seg: 32, mat: "matte" })];
  if (brew.tamp === 1) o.push(lathe([[0, top], [8.7, top], [0, top + 1.4]], col, { c: [GX - 2, GY, 0], seg: 20, mat: "matte", a0: TAU * 0.25, a1: TAU * 0.75 }));
  if (channel) o.push(box(GX + 3.2, GX + 4.6, GY + 1, GY + 9, bot - 0.1, top + 0.1, "#d8b98a", { bevel: 0, flat: true, emit: ["#f0d0a0", 0.2] }));
  return o;
}
function cupParts(g, ey) {
  const cx = GX, cy = GY + 1, z0 = 13.5, o = [lathe([[0, z0], [6.6, z0], [8.6, z0 + 24], [7.9, z0 + 24], [6, z0 + 1.6], [0, z0 + 1.6]], "#dff0f8", { c: [cx, cy, 0], seg: 36, mat: "glass", opacity: 0.28 })];
  if (g > 0.3) { const h = Math.min(21, (g / 44) * 22), r = (z) => 6 + 1.9 * ((z - 1.6) / 22.4), zl = z0 + 1.6 + h, crema = Math.min(h * 0.28, 3.4) * clamp((ey - 8) / 12, 0.2, 1);
    o.push(lathe([[0, z0 + 1.7], [r(1.7) - 0.15, z0 + 1.7], [r(h - crema + 1.6) - 0.15, zl - crema], [0, zl - crema]], mixHex("#1a0d05", "#4a2c14", clamp((20 - ey) / 12, 0, 1)), { c: [cx, cy, 0], seg: 36, mat: "gloss" }));
    o.push(lathe([[0, zl - crema], [r(h - crema + 1.6) - 0.15, zl - crema], [r(h + 1.6) - 0.15, zl], [0, zl]], mixHex("#b9824a", "#e2c79a", clamp((20 - ey) / 10, 0, 1)), { c: [cx, cy, 0], seg: 36, mat: "matte" })); }
  return o;
}
function grinderParts() {
  const o = [], x = G3.GRIND[0], y = G3.GRIND[1], a = -0.6 + (brew.grind - 1) * 0.3;
  o.push(prism(rrect(x - 18, x + 18, y - 20, y + 18, 4), "z", 0, 58, DARK, { mat: "paint", bevel: 1 }), cyl(x, y, 15, 58, 64, "#8f959d", 36, { mat: "steel" }), cyl(x, y, 16.4, 64, 69, "#c9ced3", 40, { mat: "satin" }), box(x + 15 * Math.cos(a) - 1.2, x + 15 * Math.cos(a) + 1.2, y + 15 * Math.sin(a) - 1.2, y + 15 * Math.sin(a) + 1.2, 69, 71, "#e2742a", { mat: "plastic", bevel: 0.3 }));
  o.push(lathe([[10, 69], [20, 98], [20, 101], [18.8, 101], [9, 70.4], [10, 69]], "#cfe6f2", { c: [x, y, 0], seg: 36, mat: "glass", opacity: 0.26 }), lathe([[0, 70], [9, 70], [15.6, 88], [0, 88]], "#4a2a14", { c: [x, y, 0], seg: 30, mat: "matte" }));
  o.push(box(x - 5, x + 5, y + 18, y + 26, 34, 44, DARK, { mat: "paint", bevel: 0.6 }), box(x - 9, x - 6, y + 18, y + 34, 22, 25, "#8f959d", { mat: "steel", bevel: 0.3 }), box(x + 6, x + 9, y + 18, y + 34, 22, 25, "#8f959d", { mat: "steel", bevel: 0.3 }));
  return o;
}
let fx = [];
function draw(dt = 0) {
  const K = chaos(), PL = D.PLATE, b = BD, flowing = shot && shotT > M.pre, prog = shot ? sm(M.pre, shot.time, shotT) : lastRes ? 1 : 0, res = shot || lastRes;
  let topM, boilM, wallM = [], boilAt = null;
  if (K.c >= 0) {
    const c = K.c, k = K.back, cl = Math.min(c, 2), fly = (piv, ax, spin, v) => { const m = tipM(piv, spin * cl * k, ax); for (let i = 0; i < 3; i++) m[9 + i] += v[i] * cl * k; return m; };
    topM = fly([b.x0, 0, b.z1], "y", 4, [-150, -60, 330]);
    wallM = [undefined, fly([0, b.y0, 8], "x", 2.4, [0, -300, 70]), fly([b.x0, 0, 8], "y", -2.6, [-300, -30, 60]), fly([b.x1, 0, 60], "y", 3, [260, -120, 190])];
    // the boiler goes up through the top like a rocket, tumbles, and comes down on the bench in front
    const T = 2.7, u = Math.min(c / T, 1), C = [b.x0 + 48, G3.BOIL_Y, G3.BOIL_Z], land = c - T;
    boilM = tipM(C, TAU * 2 * u * k, "y");
    const off = [-30 * u, 78 * u, (c < T ? 380 * c - 140.7 * c * c : 9 * Math.abs(Math.sin(land * 9)) * Math.exp(-land * 4)) - 42 * u];
    for (let i = 0; i < 3; i++) boilM[9 + i] += off[i] * k;
    boilAt = [C[0] + off[0] * k, C[1] + off[1] * k, C[2] + off[2] * k]; boilAt.land = land;
  }
  const hot = clamp((pB - M.pNorm) / (M.pBurst - M.pNorm), 0, 1);
  const objs = [{ cache: "frame", rev: 0, parts: frameParts }, { cache: "boiler", rev: 0, m: boilM, parts: boilerParts }, ...[0, 1, 2, 3].map((i) => ({ cache: "wall" + i, rev: 0, m: wallM[i], parts: () => wall(i) })), { cache: "top", rev: 0, m: topM, parts: topParts }, { cache: "pf", rev: 0, parts: pfParts },
    { cache: "puck", rev: brew.dose * 1000 + brew.tamp * 100 + Math.round(prog * 12) + (res && res.channel && prog > 0.05 ? 50 : 0), parts: () => puckParts(prog, res && res.channel && prog > 0.05) },
    { cache: "cup", rev: Math.round(cupG * 4) * 100 + Math.round(cupEy), m: K.c >= 0 ? [1, 0, 0, 0, 1, 0, 0, 0, 1, 30 * Math.min(K.c, 1) * K.back, 40 * Math.min(K.c, 1) * K.back, 0] : undefined, parts: () => cupParts(cupG, cupEy) },
    { cache: "grinder", rev: brew.grind, parts: grinderParts }];
  if (hot > 0.04 && K.c < 0) objs.push({ parts: [lathe([[0, 72.4], [19.3, 72.4], [20.3, 70], [20.3, 2], [19.3, -0.4], [0, -0.4]], "#ff6a2a", { c: [b.x0 + 12, G3.BOIL_Y, G3.BOIL_Z], axis: "x", seg: 40, flat: true, opacity: 0.25 + 0.4 * hot, emit: ["#ff5a1a", 0.03 + 0.1 * hot] })] });
  let svg = E.render(objs);
  // the pour: dark, then caramel, then blond, as thick as the flow
  if (flowing && K.c < 0) {
    const col = mixHex("#3a1f0f", "#d8b070", clamp(prog * 1.1 + (shot.time < 18 ? 0.35 : 0), 0, 1)), w = clamp(shot.flow * 0.9, 0.6, 3), zl = 15.1 + Math.min(21, (cupG / 44) * 22);
    if (shot.choked) { if (dt > 0 && rn() < 0.12) fx.push({ k: "drip", p: [GX + (rn() < 0.5 ? -2 : 2), GY + 1, 62], v: [0, 0, -10], life: 0, max: 1, col: "#2a1608" }); }
    else for (const sx of [-2, 2]) { E.line([GX + sx, GY + 1, 62], [GX + sx * 0.6, GY + 1, zl], w, col, 0.95); if (shot.time < 18 && dt > 0 && rn() < 0.6) fx.push({ k: "drip", p: [GX + sx * 0.6, GY + 1, zl + 1], v: [(rn() - 0.5) * 50, (rn() - 0.5) * 50, 30 + rn() * 40], life: 0, max: 0.4, col }); }
    if (shot.channel && dt > 0) for (let j = 0; j < 3; j++) fx.push({ k: "drip", p: [GX + 4, GY + 5, 66], v: [20 + rn() * 70, 30 + rn() * 80, -10 + rn() * 50], life: 0, max: 0.45 + rn() * 0.3, col: "#c9a070" });
    // water going down through the puck (in x-ray)
    if (E.xray > 0.4 && dt > 0 && rn() < 0.7) fx.push({ k: "wet", p: [GX + (shot.channel ? 3.9 : (rn() - 0.5) * 12), GY + 6 + rn() * 3, 79.6], v: [0, 0, shot.channel ? -40 : -9 * clamp(shot.flow, 0.3, 3)], life: 0, max: shot.channel ? 0.2 : 0.8, col: "#9fd4ff" });
  }
  // steam: the wand idles, the safety valve roars
  if (dt > 0 && venting > 0.2 && K.c < 0) for (let j = 0; j < 3; j++) fx.push({ k: "steam", p: [G3.VALVE[0] + (rn() - 0.5) * 2, G3.VALVE[1] + (rn() - 0.5) * 2, b.z1 + 5], v: [(rn() - 0.5) * 22, (rn() - 0.5) * 22, 120 + rn() * 80], life: 0, max: 0.8 + rn() * 0.6, s: 1 });
  if (K.c >= 0) {
    const c = K.c, life = Math.exp(-c / 0.45), C = [(b.x0 + b.x1) / 2, G3.BOIL_Y + 10, G3.BOIL_Z + 30 * c];
    if (life > 0.02) { E.sprite(C, 30 + 90 * (1 - Math.exp(-c / 0.2)), "#ffffff", 0.5 * life, true, 1); E.sprite(C, 70, "#ffd9a0", 0.35 * life, true, 1); }
    if (dt > 0 && c < 1.2) for (let j = 0; j < 9; j++) fx.push({ k: "steam", p: [b.x0 + rn() * (b.x1 - b.x0), b.y0 + rn() * (b.y1 - b.y0), 40 + rn() * 80], v: [(rn() - 0.5) * 260, (rn() - 0.5) * 260, 20 + rn() * 200], life: 0, max: 1.2 + rn() * 1.4, s: 2.4 });
    if (dt > 0 && boilAt && c > 0.05 && c < 4.4 && rn() < (boilAt.land > 0 ? 0.35 : 1)) for (let j = 0; j < 2; j++) fx.push({ k: "steam", p: [boilAt[0] + (rn() - 0.5) * 30, boilAt[1] + (rn() - 0.5) * 16, boilAt[2] + (rn() - 0.5) * 16], v: [(rn() - 0.5) * 50, (rn() - 0.5) * 50, boilAt.land > 0 ? 30 + rn() * 40 : -60 - rn() * 80], life: 0, max: 0.7 + rn() * 0.8, s: 1.5 });
    if (dt > 0 && c < 0.3) for (let j = 0; j < 8; j++) fx.push({ k: "drip", p: [GX, GY, 60 + rn() * 40], v: [(rn() - 0.3) * 260, (rn() - 0.2) * 260, 60 + rn() * 220], life: 0, max: 0.7 + rn() * 0.6, col: rn() < 0.5 ? "#3a1f0f" : "#c9a24a" });
  }
  fx = fx.filter((p) => {
    p.life += dt; if (p.life > p.max) return false;
    const t = p.life / p.max;
    if (p.k === "drip") p.v[2] -= 320 * dt;
    if (p.k === "steam") { p.v[0] *= 0.96; p.v[1] *= 0.96; p.v[2] *= 0.97; }
    for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * dt;
    if (p.k === "wet" && p.p[2] < 71.6) return false;
    if (p.k === "drip") { if (p.p[2] < 11) return false; E.sprite(p.p, 1.1, p.col, 0.95); }
    else if (p.k === "wet") E.sprite(p.p, 0.9, p.col, 0.9, !lightTheme, 1);
    else E.sprite(p.p, (5 + 22 * t) * p.s, lightTheme ? "#aab4be" : "#eef3f7", (lightTheme ? 0.4 : 0.26) * (1 - t));
    return true;
  });
  // ---- lettering: gauges, timer, scale ----
  const gauge = (x, v, max, red, name) => { const m = E.faceMatrix([x - 8, b.y1 + 1.15, 122], [1, 0, 0], [0, 0, -1]); if (!m) return ""; const cx = 8, cy = 8, r = 7; let tk = ""; for (let i = 0; i <= 8; i++) { const a = ((-225 + (i / 8) * 270) * Math.PI) / 180; tk += "M" + (cx + Math.cos(a) * (r - 1.6)).toFixed(2) + " " + (cy + Math.sin(a) * (r - 1.6)).toFixed(2) + "L" + (cx + Math.cos(a) * (r - 0.4)).toFixed(2) + " " + (cy + Math.sin(a) * (r - 0.4)).toFixed(2); }
    const ar = ((-225 + (red / max) * 270) * Math.PI) / 180, ae = (45 * Math.PI) / 180;
    return '<g transform="' + m + '"><path d="M' + (cx + Math.cos(ar) * (r - 0.9)).toFixed(2) + " " + (cy + Math.sin(ar) * (r - 0.9)).toFixed(2) + "A" + (r - 0.9) + " " + (r - 0.9) + " 0 0 1 " + (cx + Math.cos(ae) * (r - 0.9)).toFixed(2) + " " + (cy + Math.sin(ae) * (r - 0.9)).toFixed(2) + '" style="fill:none;stroke:#e0452a;stroke-width:1"/><path d="' + tk + '" style="stroke:#4a4f57;stroke-width:.3;fill:none"/><text class="pt lo" x="' + cx + '" y="' + (cy + 4.4) + '" font-size="1.7" text-anchor="middle">' + name + '</text><path d="M' + cx + " " + cy + "L" + cx + " " + (cy - r + 1.4) + '" style="stroke:#23262b;stroke-width:.6" transform="rotate(' + (-135 + clamp(v / max, 0, 1) * 270).toFixed(1) + " " + cx + " " + cy + ')"/><circle cx="' + cx + '" cy="' + cy + '" r=".8" fill="#23262b"/></g>'; };
  if (K.c < 0.05) {
    svg += gauge(G3.GAUGES[0], pB, 3, 2, "boiler") + gauge(G3.GAUGES[1], pumpP, 16, 12, "pump");
    let m = E.faceMatrix([G3.TIMER[0], b.y1 + 0.85, 121], [1, 0, 0], [0, 0, -1]);
    if (m) svg += '<g transform="' + m + '"><text class="pt lcd" x="' + ((G3.TIMER[1] - G3.TIMER[0]) / 2) + '" y="10.4" font-size="9" text-anchor="middle">' + (shot ? shotT.toFixed(0) : lastRes ? lastRes.time.toFixed(0) : "0").padStart(2, "0") + "</text></g>";
    m = E.faceMatrix([GX - 9, GY + 9.6, 13.55], [1, 0, 0], [0, 1, 0]);
    if (m) svg += '<g transform="' + m + '"><text class="pt lcd" x="9" y="3.7" font-size="3.6" text-anchor="middle">' + cupG.toFixed(1) + " g</text></g>";
  }
  let m2 = E.faceMatrix([PL.x + PL.w - 74, PL.y + PL.d - 13, 0.05], [1, 0, 0], [0, 1, 0]);
  if (m2) svg += '<g transform="' + m2 + '"><text class="pt bench" x="0" y="5" font-size="5">COFFEE FIRST</text></g>';
  if (K.c < 0) { const p = E.project([G3.GRIND[0], G3.GRIND[1], 112]); svg += '<text class="mk-lab gl" text-anchor="middle" x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '">grind ' + brew.grind + " · " + brew.dose + " g</text>"; }
  if (E.xray > 0.02 && K.c < 0) svg += E.callouts([
    { p: [b.x0 + 30, G3.BOIL_Y, G3.BOIL_Z + 20], text: "Boiler", sub: pB.toFixed(1) + " bar of steam and water" }, { p: [G3.VALVE[0], G3.VALVE[1], b.z1 + 4], text: "Safety valve", sub: brew.boil === 2 ? "jammed shut" : "lifts at " + M.pValve.toFixed(1) + " bar" },
    { p: [GX + 6, GY + 6, 76], text: "Puck", sub: brew.dose + " g of coffee, " + (brew.tamp ? "tamped crooked" : "tamped level") }, { p: [b.x0 + 26, b.y0 + 16, 24], text: "Pump", sub: "set to " + brew.bar + " bar" },
  ], E.xray, E.fs < 0.62 ? {} : { topL: 70, topR: 70 });
  if (sceneG.innerHTML !== svg) sceneG.innerHTML = svg;
  if (K.c >= 0) { const A = 8 * Math.exp(-K.c / 0.4) + (K.c > 2.7 ? 6 * Math.exp(-(K.c - 2.7) / 0.2) : 0); setShake(A * Math.sin(K.c * 90), A * Math.cos(K.c * 71)); flashEl.style.opacity = (0.85 * burst(K.c, 0.03, 0.25)).toFixed(3); }
  else if (boomAt !== null) { boomAt = null; pB = M.pNorm; venting = 0; brew.boil = 0; cupG = 0; lastRes = null; setShake(0, 0); flashEl.style.opacity = "0"; say("New machine, working pressurestat, working safety valve. Leave both alone and go and make a coffee."); }
  const r2 = shot || lastRes;
  const text = K.c >= 0 ? (K.c < 4.5 ? (K.c < 2.7 ? "BOOM · boiler let go · and left" : "boiler has landed") : "resetting…")
    : (shot ? "pulling · " + shotT.toFixed(0) + " s · " + cupG.toFixed(0) + " g" : lastRes ? lastRes.time.toFixed(0) + " s · " + lastRes.out.toFixed(0) + " g · " + lastRes.ey.toFixed(1) + " % extracted" : "ready") + (brew.boil > 0 || (!shot && !lastRes) ? " · boiler " + pB.toFixed(1) + " bar" : "");
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuetext", text);
}

// ---------------- running it ----------------
const GOOD = { grind: 4, dose: 18, bar: 9, temp: 93, tamp: 0, boil: 0 };
const TOUR = [
  { b: GOOD, say: "Dialled in: 18 g, a fine-ish grind, 9 bar, 93 °C, tamped level.", pull: true },
  { b: { ...GOOD, grind: 8 }, say: "Same again, but the grinder set coarse.", pull: true },
  { b: { ...GOOD, grind: 1 }, say: "Now ground to powder.", pull: true },
  { b: { ...GOOD, tamp: 1 }, say: "Good grind again, but tamped crooked.", pull: true },
  { b: { ...GOOD, boil: 1 }, say: "Forget the coffee. The pressurestat has stuck on.", wait: 9 },
  { b: { ...GOOD, boil: 2 }, say: "Stat stuck on again, and this time the safety valve is jammed shut.", wait: 15 },
];
function tick(t) {
  const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
  last = t; now += dt;
  if (touring && !booming() && !shot) {
    tourWait -= dt;
    if (tourWait <= 0) {
      const cur = TOUR[Math.max(0, tourStep)];
      if (tourStep >= 0 && cur.pull && !cur.done) { cur.done = true; pull(); tourWait = 3.4; }
      else { tourStep = (tourStep + 1) % TOUR.length; const s = TOUR[tourStep]; s.done = false; Object.assign(brew, s.b); if (s.b.boil === 0) { pB = Math.min(pB, M.pNorm + 0.1); venting = 0; } lastRes = null; cupG = 0; tourWait = s.wait || 1.6; say(s.say); }
    }
  }
  step(dt);
  draw(dt); syncUi();
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { touring = false; };
const set = (k, v) => { takeOver(); if (booming()) return; if (shot) { shot = null; fx = []; } brew[k] = v; if (k !== "boil") { lastRes = null; cupG = 0; say("Changed. Pull a shot."); } else if (v === 0) { say("Pressurestat and safety valve both working. Boiler settling back to " + M.pNorm.toFixed(1) + " bar."); } run(); };
const go = () => { takeOver(); pull(); run(); };
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
for (const k of ["grind", "dose", "bar", "temp"]) {
  ui[k].addEventListener("input", () => { sliding[k] = true; set(k, +ui[k].value); });
  ui[k].addEventListener("change", () => { sliding[k] = false; run(); });
}
ui.tamp.forEach((b, i) => b.addEventListener("click", () => set("tamp", i)));
ui.boil.forEach((b, i) => b.addEventListener("click", () => set("boil", i)));
ui.pull.addEventListener("click", go);
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; tourWait = 0; } run(); });
onTap(go);
stage.addEventListener("keydown", (ev) => {
  const map = { x: () => { setX(!E.xrayOn); run(); }, X: () => { setX(!E.xrayOn); run(); }, ArrowRight: () => set("grind", clamp(brew.grind + 1, 1, 10)), ArrowLeft: () => set("grind", clamp(brew.grind - 1, 1, 10)), ArrowUp: () => set("bar", clamp(brew.bar + 1, 3, 15)), ArrowDown: () => set("bar", clamp(brew.bar - 1, 3, 15)), t: () => set("tamp", 1 - brew.tamp), b: () => set("boil", (brew.boil + 1) % 3), " ": go, Enter: go };
  if (map[ev.key]) { ev.preventDefault(); map[ev.key](); }
});
window.__fig = { E, x: setX, boil: (v) => set("boil", v), freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; }, set: (o) => { takeOver(); Object.assign(brew, o); lastRes = null; cupG = 0; }, pull: go };
setX(true); say("Dose it, grind it, tamp it, pull it. Or leave the coffee alone and go straight for the boiler."); syncUi(); draw();

`;

const CSS = `.fx-flash{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(circle 60% at 45% 45%,#ffffff 0%,#ffe9c8 40%,rgba(255,200,140,0) 100%)}
.pt{font-family:var(--anatomy-mono);fill:#23262b;font-weight:700}.pt.lo{fill:#5a6068;font-weight:600}.pt.lcd{fill:#ff5a3a}.pt.bench{fill:var(--anatomy-muted);font-weight:600;letter-spacing:.08em;opacity:.8}
.gl{font-size:calc(12.5px*var(--mk-ts,1))}
@media (min-width:561px){.mk-hint{top:46px}}
.ctl #pull{padding:7px 16px;font-weight:600;letter-spacing:.06em}
.meter .band{position:absolute;top:-4px;bottom:-4px;border:1.5px solid var(--mk-good);border-radius:4px;opacity:.75;pointer-events:none}`;

const stage = stageHtml({
  W, H, fig: "Fig 29", title: "Espresso machine", xray: true,
  label: "A stainless espresso machine on a bench with a grinder beside it. Two gauges and a shot timer sit on the front, a portafilter is locked into the group head over a glass on a scale, and a steam wand hangs to one side. An x-ray view turns the case to glass to show the copper boiler, pump, pressurestat and safety valve, and cuts the portafilter open to show the puck of coffee. Pulling a shot pours espresso into the glass: slow drips, a steady stream, a gush or a spray, depending on the settings. With the pressurestat stuck on, the safety valve vents steam; with the valve jammed too, the boiler bursts.",
  keysHelp: "Espresso machine: drag to rotate, X for x-ray, tap or space pulls a shot; left and right change the grind, up and down the pump pressure, T the tamp, B the boiler fault",
  extra: `<div class="fx-flash" aria-hidden="true"></div>`,
});

const CONTROLS = `<div class="ctl" role="group" aria-label="Espresso controls">
  <div class="ctl-row"><span class="ctl-label">Grind</span><div class="slide"><input id="grind" type="range" min="1" max="10" step="1" value="${START.grind}" aria-label="Grind setting, 1 fine to 10 coarse"></div><output id="grind-out"></output></div>
  <div class="ctl-row"><span class="ctl-label">Dose</span><div class="slide"><input id="dose" type="range" min="14" max="22" step="1" value="${START.dose}" aria-label="Dose of ground coffee in grams"></div><output id="dose-out"></output></div>
  <div class="ctl-row"><span class="ctl-label">Pump</span><div class="slide"><input id="bar" type="range" min="3" max="15" step="1" value="${START.bar}" aria-label="Pump pressure in bar"></div><output id="bar-out"></output></div>
  <div class="ctl-row"><span class="ctl-label">Water</span><div class="slide"><input id="temp" type="range" min="85" max="99" step="1" value="${START.temp}" aria-label="Brew water temperature in degrees Celsius"></div><output id="temp-out"></output></div>
  <div class="ctl-row"><span class="ctl-label">Tamp</span><button type="button" data-tamp="0" aria-pressed="true">Level</button><button type="button" data-tamp="1" aria-pressed="false">Crooked</button></div>
  <div class="ctl-row"><span class="ctl-label">Boiler</span><button type="button" data-boil="0" aria-pressed="true">Working</button><button type="button" data-boil="1" aria-pressed="false">Stat stuck<small>valve works</small></button><button type="button" data-boil="2" aria-pressed="false">Stat stuck<small>valve jammed</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Shot time</span><div class="meter" aria-hidden="true"><span class="band" style="left:33.3%;width:16.7%"></span><span id="t-fill" class="fill"></span></div><output id="t-out">0 s</output></div>
  <div class="ctl-row"><span class="ctl-label">Extracted</span><div class="meter" aria-hidden="true"><span class="band" style="left:64.3%;width:14.3%"></span><span id="e-fill" class="fill"></span></div><output id="e-out">0 %</output></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="pull" class="danger">PULL A SHOT</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
</div>`;

const foot = footHtml({
  theme, slug: "espresso",
  real: "the classic recipe: about 9 bar, water at 90 to 96 °C, 20 to 30 seconds, roughly 1 part coffee to 2 parts drink, and 18 to 22 % of the coffee extracted, sour and thin below that and bitter above. A steam boiler runs at about 1.0 to 1.3 bar on a pressurestat, the gauge is red-lined at 2 bar, and a safety valve (1.8 bar is a common setting) sits on top.",
  made: "every number the toy computes: how fast each grind flows, how much it extracts, when it channels, and the 3 bar the boiler lets go at. Taste is a lookup, not chemistry. Shots run four times faster than real ones.",
});
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), pageMk2({
  k, title: "Espresso machine", fig: "Fig 29", hint: "Tap: pull a shot", theme, W, H, stage, controls: CONTROLS, css: CSS, foot,
  caption: "Espresso is hot water forced through a tightly packed puck of ground coffee, and the puck is the only thing holding the water back. Grind finer and the gaps close up: the shot slows down and pulls more out of the coffee. Grind coarser and it gushes through and only takes the sour front end. The classic target is about 9 bar, water in the low 90s, around 18 g in and 36 g out in 25 to 30 seconds, with about a fifth of the dry coffee ending up in the cup. Tamp it crooked, or lean on a very fine puck with too much pressure, and the water finds a crack and goes through that instead: it channels. Behind the pretty front is a small pressure vessel. A pressurestat switches the element to hold the boiler a little over 1 bar, and a spring-loaded safety valve on top is there for the day the stat sticks.",
  script: LIVE.replace("__DATA__", JSON.stringify(DATA)),
}));
console.log("wrote", name);
