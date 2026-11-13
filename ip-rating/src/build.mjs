import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { engineScript, stageHtml, pageMk2, footHtml } from "../../mk2/shell.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const W = 960, H = 640;

// Truth: IEC 60529 test conditions. IPX5: 6,3 mm nozzle, 12,5 l/min, 2,5 m to 3 m, at least 3 min. IPX6: 12,5 mm nozzle, 100 l/min, same distance and time.
// IPX7: lowest point 1 m below the surface (enclosures under 850 mm high), 30 min. IPX9: 80 degC, 8 MPa to 10 MPa, 14 l/min to 16 l/min, 0,10 m to 0,15 m, 30 s at each of four angles.
// IP5X / IP6X: talcum powder chamber with the enclosure under vacuum, up to 8 h. Numerals 7, 8 and 9 do not imply 5 or 6: both are marked (IP66/IP67).
// Toy: how much gets in through each fault, and the pass marks.
const TESTS = {
  dust: { name: "IP5X / IP6X dust", short: "talcum powder, box under vacuum", how: "the box sits in a cloud of talcum powder while a pump holds a slight vacuum inside it, for up to 8 hours.", dur: 8, unit: "h" },
  x5: { name: "IPX5 water jet", short: "6.3 mm nozzle, 12.5 L/min", how: "a 6.3 mm nozzle, 12.5 litres a minute, from 2.5 to 3 metres, all round the box for at least 3 minutes.", dur: 3, unit: "min", dist: "2.5 to 3 m" },
  x6: { name: "IPX6 powerful jet", short: "12.5 mm nozzle, 100 L/min", how: "a 12.5 mm nozzle, 100 litres a minute, from 2.5 to 3 metres, for at least 3 minutes.", dur: 3, unit: "min", dist: "2.5 to 3 m" },
  x7: { name: "IPX7 immersion", short: "1 m deep for 30 min", how: "the lowest point of the box a metre under the surface, for 30 minutes.", dur: 30, unit: "min" },
  x9: { name: "IPX9 hot high-pressure jet", short: "80 °C at 80 to 100 bar", how: "water at 80 °C and 80 to 100 bar, 14 to 16 litres a minute, from 100 to 150 mm, 30 seconds from each of four angles.", dur: 120, unit: "s", dist: "100 to 150 mm" },
};
const BOX = { x0: -35, x1: 35, y0: -25, y1: 25, z0: 16, z1: 50 };
const GEO = { BOX, GLAND_X: -14, GLAND_Z: BOX.z0 + 16, TANK_R: 62, TANK_H: 132, WATER_Z: 120, NOZ_X: 124, NOZ_Y: -6 };
const START = { gasket: 0, screws: 0, gland: 0, drain: 0 };
const PLATE = { x: -112, y: -76, w: 262, d: 152, r: 8 };
const P = k.fitProjection([...k.boxCorners(PLATE, -0.8, 0), [-66, -66, 150], [66, 66, 150], [124, -6, 74], [-104, 60, 24]], W, H, { pad: 22, azimuth: 45, elevation: 30 });
const DATA = { W, H, P, PLATE };
Object.assign(DATA, { TESTS, GEO, start: START });
const LIVE = `
${engineScript()}
const D = __DATA__;
const stage = document.querySelector(".mk-stage");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lightTheme = document.body.dataset.theme === "light";
const E = mk2(stage, D.P, { W: D.W, H: D.H, pivot: [10, 0, 50], plate: { ...D.PLATE, h: 12, foot: 5 }, shadowBox: [-120, -84, -18, 158, 84, 160] });
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
const G3 = D.GEO, BX = G3.BOX, TESTS = D.TESTS, TAU = Math.PI * 2, rn = () => Math.random();
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const burst = (age, rise, fall) => (age > 0 ? sm(0, rise, age) * Math.exp(-Math.max(0, age - rise) / fall) : 0);
const flashEl = stage.querySelector(".fx-flash"), q = (s) => document.querySelector(s);

// ---------------- the toy model: how much gets in, by leak path and by test ----------------
// build: gasket 0 good / 1 pinched / 2 missing; screws 0 torqued / 1 hand tight; gland 0 sealed / 1 cable too thin / 2 open entry; drain 0 none / 1 hole
// dust in mg, water in mL. All of it invented: the point is which path each test finds.
const LEAK = {
  dust: { gasket: [0, 6, 60], loose: 2, gland: [0, 4, 80], drain: 25 },
  x5: { gasket: [0, 3, 200], loose: 0, gland: [0, 1, 400], drain: 1 },
  x6: { gasket: [0, 25, 900], loose: 12, gland: [0, 15, 1500], drain: 6 },
  x7: { gasket: [0, 40, 3000], loose: 0, gland: [0, 30, 4000], drain: 2500 },
  x9: { gasket: [0, 80, 2000], loose: 60, gland: [0, 120, 3000], drain: 30 },
};
const BOX_ML = 3000, WET = 250;
function ingress(test, b) {
  const L = LEAK[test], parts = { gasket: L.gasket[b.gasket], loose: b.screws && b.gasket === 0 ? L.loose : b.screws && b.gasket === 1 ? L.gasket[1] * 0.6 : 0, gland: L.gland[b.gland], drain: b.drain ? L.drain : 0 };
  const total = Math.min(test === "dust" ? 400 : BOX_ML, parts.gasket + parts.loose + parts.gland + parts.drain);
  let worst = "gasket"; for (const k of ["loose", "gland", "drain"]) if (parts[k] > parts[worst]) worst = k;
  return { parts, total, worst };
}
// dust: nothing at all is 6, a little is 5. Water: a couple of drops that reach nothing is a pass.
const grade = (test, total) => (test === "dust" ? (total === 0 ? 6 : total <= 10 ? 5 : 0) : total <= 2 ? 1 : 0);

// ---------------- state ----------------
const build = { ...D.start };
let now = 0, last = 0, frame = 0, visible = true, slow = false, touring = !still.matches, tourStep = -1, tourWait = 0;
let results = {}, test = null, testAt = 0, cur = null, lidA = 0, lidGoal = 0, zapAt = -10, lamp = false, dead = false, shownVol = 0, shownTest = null;
const T_SET = 1.0, T_RUN = 3.4, T_REV = 1.5, T_ALL = T_SET + T_RUN + T_REV;
const ORDER = ["dust", "x5", "x6", "x7", "x9"];
function rating() {
  const d = results.dust, F = d === undefined ? "X" : d.g === 6 ? "6" : d.g === 5 ? "5" : "X", ok = (k) => results[k] && results[k].g > 0, out = [];
  const jet = ok("x6") ? "6" : ok("x5") ? "5" : null;
  if (jet) out.push("IP" + F + jet);
  if (ok("x7")) out.push("IP" + F + "7");
  if (ok("x9")) out.push("IP" + F + "9");
  if (!out.length) return ORDER.some((k) => results[k]) ? "IP" + F + "X" : "untested";
  return out.join("/");
}
const ui = { g: [...document.querySelectorAll("[data-gasket]")], s: [...document.querySelectorAll("[data-screws]")], c: [...document.querySelectorAll("[data-gland]")], d: [...document.querySelectorAll("[data-drain]")],
  t: [...document.querySelectorAll("[data-test]")], rate: q("#rate"), slow: q("#slow"), tour: q("#tour"), shot: q("#shot") };
let lastShot = "";
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };
function syncUi() {
  ui.g.forEach((b, i) => b.setAttribute("aria-pressed", String(i === build.gasket)));
  ui.s.forEach((b, i) => b.setAttribute("aria-pressed", String(i === build.screws)));
  ui.c.forEach((b, i) => b.setAttribute("aria-pressed", String(i === build.gland)));
  ui.d.forEach((b, i) => b.setAttribute("aria-pressed", String(i === build.drain)));
  ui.t.forEach((b) => { const k = b.dataset.test, r = results[k], implied = k === "x5" && results.x6 && results.x6.g > 0 && !r; b.dataset.res = test === k ? "run" : r ? (r.g > 0 ? "pass" : "fail") : implied ? "pass" : ""; });
  if (ui.rate.textContent !== rating()) ui.rate.textContent = rating();
  ui.slow.setAttribute("aria-pressed", String(slow));
  ui.tour.setAttribute("aria-pressed", String(touring));
}
const WHY = {
  dust: { gasket: ["", "the pinched corner of the gasket", "the gap where the gasket should be"], loose: "the lightly squeezed gasket", gland: ["", "the gap round the thin cable", "the open entry"], drain: "the drain hole" },
  water: { gasket: ["", "the pinched corner of the gasket", "the gap where the gasket should be"], loose: "the lid: hand-tight screws let the jet lift it off the gasket", gland: ["", "the gland: the cable is too thin for its seal", "the open entry"], drain: "the drain hole" },
};
function startTest(k) {
  if (test) return;
  test = k; testAt = now; cur = ingress(k, build); lidGoal = 0; zapAt = -10; lamp = false; dead = false; shownVol = 0; shownTest = k; fx = [];
  say(TESTS[k].name + ": " + TESTS[k].how);
}
function finishTest() {
  const k = test, g = grade(k, cur.total), T = TESTS[k], why = (k === "dust" ? WHY.dust : WHY.water)[cur.worst], via = Array.isArray(why) ? why[build[cur.worst]] : why;
  results[k] = { g, total: cur.total };
  if (k === "x6" && g > 0 && !results.x5) results.x5 = { g: 1, total: 0, implied: true };
  test = null; lidGoal = 1;
  if (k === "dust") say(g === 6 ? "Opened up: not a speck inside. Dust-tight, first numeral 6." : g === 5 ? "Opened up: a little dust got in through " + via + ", not enough to matter. Dust-protected, first numeral 5." : "Opened up: dust all through it, drawn in through " + via + ". Not dust-protected.");
  else if (g > 0) say(cur.total > 0 ? "Opened up: a drop or two came through " + via + " and reached nothing. That's a pass for " + T.name + "." : "Opened up: bone dry. " + T.name + " passed." + (k === "x7" && build.screws && build.gasket === 0 ? " A metre of water presses the lid down onto its gasket." : k === "x5" && build.drain ? " A hole underneath is out of the jet's reach." : ""));
  else if (cur.total >= WET) { zapAt = now + 0.5; dead = true; say("Opened up: " + (cur.total >= 1000 ? (cur.total / 1000).toFixed(1) + " L" : Math.round(cur.total) + " mL") + " inside, in through " + via + ". It's over the terminals, so switching it back on trips the supply. " + T.name + " failed."); }
  else say("Opened up: " + Math.round(cur.total) + " mL inside, in through " + via + ". Nothing went bang, but it's still a fail for " + T.name + ".");
  if (!dead) lamp = true;
}
function step(dt) {
  lidA += (lidGoal - lidA) * Math.min(1, dt * 7);
  if (!test) return;
  const tt = now - testAt;
  shownVol = cur.total * sm(T_SET + 0.2, T_SET + T_RUN, tt);
  if (tt >= T_ALL) finishTest();
}

// ---------------- drawing ----------------
const STEELC = "#b4bcc4", WATER = "#3f9fe6";
const tipM = (piv, ang, axis) => { const c = Math.cos(ang), s = Math.sin(ang), R = axis === "x" ? [1, 0, 0, 0, c, -s, 0, s, c] : [c, 0, s, 0, 1, 0, -s, 0, c]; return [...R, ...[0, 1, 2].map((i) => piv[i] - (R[i * 3] * piv[0] + R[i * 3 + 1] * piv[1] + R[i * 3 + 2] * piv[2]))]; };
const LEAKP = { gasket: [BX.x1 - 2, BX.y1 - 2, BX.z1], loose: [BX.x1 - 1, 0, BX.z1], gland: [G3.GLAND_X, BX.y1 - 1, G3.GLAND_Z], drain: [BX.x1 - 1, -8, BX.z0 + 3.4] };
function benchParts() {
  const o = [];
  // pedestal, vacuum pump and its hose, the pit the tank rises out of
  o.push(cyl(0, 0, G3.TANK_R + 5, 0, 1.2, "#3a3e44", 64, { mat: "paint", bevel: 0.3 }), cyl(0, 0, 22, 1.2, 4, "#5f6872", 40, { mat: "paint" }), cyl(0, 0, 7, 4, BX.z0 - 2, "#8f9aa4", 24, { mat: "paint" }), prism(rrect(BX.x0 + 6, BX.x1 - 6, BX.y0 + 6, BX.y1 - 6, 2), "z", BX.z0 - 2, BX.z0, "#8f9aa4", { mat: "paint" }));
  o.push(prism(rrect(-104, -78, 44, 68, 2), "z", 0, 16, "#2e6aa8", { mat: "paint" }), cyl(-91, 56, 6, 16, 22, "#c9ced3", 20, { mat: "steel" }), tube([[-91, 56, 22], [-91, 56, 30], [-84, 48, 34], [-70, 24, 30], [BX.x0 - 8, 4, BX.z0 + 14], [BX.x0, 4, BX.z0 + 14]], 1.4, "#26282c", { seg: 8, mat: "rubber" }), cyl(-98, 63, 2, 16, 19, "#e2742a", 10, { mat: "plastic" }));
  return o;
}
function boxParts() {
  const o = [], W = 2.2, S = { mat: "satin", shell: true, bevel: 0.3 }, x0 = BX.x0, x1 = BX.x1, y0 = BX.y0, y1 = BX.y1, z0 = BX.z0, z1 = BX.z1;
  o.push(box(x0, x1, y0, y1, z0, z0 + W, STEELC, { mat: "satin", bevel: 0.3 }));
  o.push(box(x0, x1, y0, y0 + W, z0 + W, z1, STEELC, S), box(x0, x0 + W, y0 + W, y1 - W, z0 + W, z1, STEELC, S), box(x0, x1, y1 - W, y1, z0 + W, z1, STEELC, S), box(x1 - W, x1, y0 + W, y1 - W, z0 + W, z1, STEELC, S));
  // gasket on the rim: whole, pinched at the near corner, or missing
  if (build.gasket < 2) { const gz = z1 + 0.9; o.push(box(x0 + 0.4, x1 - 0.4, y0 + 0.4, y0 + W - 0.2, z1, gz, "#1d1f22", { mat: "rubber", bevel: 0 }), box(x0 + 0.4, x0 + W - 0.2, y0 + W, y1 - W, z1, gz, "#1d1f22", { mat: "rubber", bevel: 0 }), box(x0 + 0.4, build.gasket ? x1 - 9 : x1 - 0.4, y1 - W + 0.2, y1 - 0.4, z1, gz, "#1d1f22", { mat: "rubber", bevel: 0 }), box(x1 - W + 0.2, x1 - 0.4, y0 + W, build.gasket ? y1 - 9 : y1 - W, z1, gz, "#1d1f22", { mat: "rubber", bevel: 0 }));
    if (build.gasket) o.push(tube([[x1 - 9, y1 - 1.2, z1 + 0.5], [x1 - 4, y1 + 1.4, z1 + 0.2], [x1 + 1.2, y1 - 4, z1 + 0.2], [x1 - 1.2, y1 - 9, z1 + 0.5]], 0.75, "#1d1f22", { seg: 6, mat: "rubber" })); }
  // rail and terminals, pilot lamp socket, rating plate
  o.push(box(x0 + 8, x1 - 8, -4, 2, z0 + W, z0 + W + 1.2, "#aeb4bb", { mat: "steel", bevel: 0 }));
  for (let i = 0; i < 7; i++) { const tx = x0 + 11 + i * 6.6; o.push(box(tx, tx + 5.6, -10, 8, z0 + W + 1.2, z0 + W + 8.5, "#e6dcc3", { mat: "plastic", bevel: 0.3 })); for (const y of [-7, 5]) o.push(cyl(tx + 2.8, y, 1.2, z0 + W + 8.5, z0 + W + 8.9, "#d8dce0", 8, { mat: "steel" })); }
  o.push(box(x1, x1 + 0.5, -20, 6, z0 + 12, z0 + 26, "#e9e6df", { mat: "matte", bevel: 0 }), prism(circle(15, z0 + 19, 3.2, 20), "x", x1, x1 + 1.4, "#2f3338", { mat: "plastic" }));
  // cable entry on the front
  const gx = G3.GLAND_X, gz = G3.GLAND_Z;
  if (build.gland === 2) o.push(prism(circle(gx, gz, 3.4, 20), "y", y1, y1 + 0.1, "#050505", { bevel: 0, flat: true }));
  else { const cr = build.gland ? 1.15 : 2.3; o.push(prism(circle(gx, gz, 4.6, 6), "y", y1, y1 + 2.4, "#c9a24a", { mat: "metal" }), prism(circle(gx, gz, 3.5, 16), "y", y1 + 2.4, y1 + 6, "#c9a24a", { mat: "metal" }), prism(circle(gx, gz, 2.5, 16), "y", y1 + 6, y1 + 6.1, "#050505", { bevel: 0, flat: true }));
    if (!build.gland) o.push(prism(circle(gx, gz, 2.9, 14), "y", y1 + 6, y1 + 7.2, "#26282c", { mat: "rubber" }));
    o.push(tube([[gx, y1 - 3, gz], [gx, y1 + 10, gz], [gx, y1 + 18, gz - 4], [gx - 3, y1 + 26, 6], [gx - 10, y1 + 34, 2.4], [gx - 40, D.PLATE.y + D.PLATE.d - 3, 2.4], [gx - 44, D.PLATE.y + D.PLATE.d + 3, -2], [gx - 45, D.PLATE.y + D.PLATE.d + 4, -16]], cr, "#26282c", { seg: 10, mat: "rubber" })); }
  if (build.drain) o.push(prism(circle(-8, z0 + 3.4, 1.9, 14), "x", x1, x1 + 0.1, "#050505", { bevel: 0, flat: true }), prism(circle(-8, z0 + 3.4, 3, 6), "x", x1, x1 + 0.6, "#c9a24a", { mat: "metal" }), prism(circle(-8, z0 + 3.4, 1.9, 14), "x", x1 + 0.6, x1 + 0.7, "#050505", { bevel: 0, flat: true }));
  return o;
}
function lidParts() {
  const o = [], lift = build.screws ? 0.7 : 0, z = BX.z1 + (build.gasket < 2 ? 0.9 : 0.25) + lift, S = { mat: "satin", shell: true, bevel: 0.4 };
  o.push(prism(rrect(BX.x0 - 1.4, BX.x1 + 1.4, BX.y0 - 1.4, BX.y1 + 1.4, 2.5), "z", z, z + 3.2, STEELC, S), prism(rrect(BX.x0 + 7, BX.x1 - 7, BX.y0 + 7, BX.y1 - 7, 2), "z", z + 3.2, z + 3.9, STEELC, S));
  for (const [x, y] of [[BX.x0 + 3, BX.y0 + 3], [BX.x1 - 3, BX.y0 + 3], [BX.x0 + 3, BX.y1 - 3], [BX.x1 - 3, BX.y1 - 3]]) o.push(cyl(x, y, 1.9, z + 3.2, z + 4.4 + (build.screws ? 1.6 : 0), "#e2e5e8", 6, { mat: "steel" }), ...(build.screws ? [cyl(x, y, 0.9, z + 3.2, z + 4.8, "#8f959d", 8, { mat: "steel", bevel: 0 })] : []));
  return o;
}
// the nozzle on its stand: aims at the box, and comes right up close for the high-pressure test
function nozzleParts(nx, tgt, big, lance) {
  const o = [], bz = 62, tipV = [tgt[0] - nx, tgt[1] - G3.NOZ_Y, tgt[2] - bz], L = Math.hypot(...tipV), u = tipV.map((v) => v / L), tip = [nx + u[0] * 16, G3.NOZ_Y + u[1] * 16, bz + u[2] * 16], back = [nx - u[0] * 14, G3.NOZ_Y - u[1] * 14, bz - u[2] * 14];
  o.push(prism(rrect(nx - 12, nx + 12, G3.NOZ_Y - 12, G3.NOZ_Y + 12, 3), "z", 0, 2.4, "#3a3e44", { mat: "paint" }), cyl(nx, G3.NOZ_Y, 2.6, 2.4, bz - 3, "#8f9aa4", 16, { mat: "paint" }), sphere([nx, G3.NOZ_Y, bz], 4, "#2f3338", { mat: "plastic" }));
  o.push(tube([back, [nx, G3.NOZ_Y, bz], tip], [3, 3, lance ? 1.4 : big ? 2.6 : 1.9], lance ? "#e2742a" : "#c9a24a", { seg: 14, mat: "metal" }), tube([back, [back[0] - u[0] * 8, back[1], back[2] - 8], [nx + 20, G3.NOZ_Y + 6, 6], [nx + 26, G3.NOZ_Y + 22, 2.4], [D.PLATE.x + D.PLATE.w - 6, G3.NOZ_Y + 40, 2.4]], 2.2, lance ? "#b03a2a" : "#2e6aa8", { seg: 10, mat: "rubber" }));
  return { parts: o, tip, u };
}
const hash4 = (i) => { const h = (n2) => { const s = Math.sin(i * 12.9898 + n2 * 78.233) * 43758.5453; return s - Math.floor(s); }; return [h(1), h(2), h(3), h(4)]; };
const SW = Array.from({ length: 70 }, (_, i) => hash4(i));
let fx = [];
function draw(dt = 0) {
  const tt = test ? now - testAt : -1, run = test ? sm(T_SET - 0.1, T_SET + 0.15, tt) * (1 - sm(T_SET + T_RUN - 0.1, T_SET + T_RUN + 0.2, tt)) : 0, PL = D.PLATE, T = test ? TESTS[test] : null;
  const tankT = test === "dust" || test === "x7", th = tankT ? sm(0, 0.55, tt) * (1 - sm(T_SET + T_RUN + 0.75, T_ALL - 0.15, tt)) : 0, wl = test === "x7" ? sm(0.45, T_SET, tt) * (1 - sm(T_SET + T_RUN, T_SET + T_RUN + 0.8, tt)) : 0;
  const jet = test === "x5" || test === "x6" || test === "x9", lance = test === "x9", near = lance ? sm(0, T_SET - 0.2, tt) * (1 - sm(T_SET + T_RUN + 0.2, T_ALL - 0.2, tt)) : 0;
  const key = build.gasket * 1000 + build.screws * 100 + build.gland * 10 + build.drain;
  const objs = [{ cache: "bench", rev: 0, parts: benchParts }, { cache: "box", rev: key, parts: boxParts }, { cache: "lid", rev: key, m: lidA > 0.004 ? tipM([0, BX.y0 - 1.4, BX.z1 + 1], 1.9 * lidA, "x") : undefined, parts: lidParts }];
  // the nozzle sweeps the lid edge and the faces it can reach
  const sweep = now * 1.7, tgt = [BX.x1 - 2, 16 * Math.sin(sweep), BX.z1 - 6 + 9 * Math.sin(sweep * 1.7 + 1)], nx = G3.NOZ_X - (G3.NOZ_X - (BX.x1 + 42)) * near;
  const nz = nozzleParts(nx, jet ? tgt : [BX.x1, 0, BX.z1 - 10], test === "x6", lance);
  objs.push({ parts: nz.parts });
  const live = [];
  // what got in: a pool on the floor of the box, or a film of dust
  if (shownVol > 0.5 && shownTest && shownTest !== "dust") { const h = Math.min(BX.z1 - BX.z0 - 4, 0.5 + (shownVol / BOX_ML) * 26); live.push(box(BX.x0 + 2.3, BX.x1 - 2.3, BX.y0 + 2.3, BX.y1 - 2.3, BX.z0 + 2.2, BX.z0 + 2.2 + h, "#1b62c4", { mat: "water", bevel: 0, opacity: 0.8, emit: ["#2f7fe0", 0.06] })); }
  if (shownVol > 0.5 && shownTest === "dust") live.push(box(BX.x0 + 2.3, BX.x1 - 2.3, BX.y0 + 2.3, BX.y1 - 2.3, BX.z0 + 2.2, BX.z0 + 2.4 + Math.min(1.6, shownVol / 60), "#b9ad94", { mat: "matte", bevel: 0, opacity: clamp(0.25 + shownVol / 40, 0, 0.95) }));
  // the tank that rises round the box: a dust chamber, or a metre of water
  if (th > 0.01) { const H = G3.TANK_H * th, R = G3.TANK_R; live.push(lathe([[R, 0], [R, H], [R + 1.6, H], [R + 1.6, 0], [R, 0]], "#9fd0e8", { c: [0, 0, 0], seg: 56, mat: "glass", opacity: 0.16 }));
    if (wl > 0.01) live.push(lathe([[0, 1.3], [R - 0.3, 1.3], [R - 0.3, 1.3 + (G3.WATER_Z - 1.3) * wl * th], [0, 1.3 + (G3.WATER_Z - 1.3) * wl * th]], WATER, { c: [0, 0, 0], seg: 56, mat: "water", opacity: lightTheme ? 0.34 : 0.32 })); }
  // lamp: green when it powers up dry
  live.push(prism(circle(15, BX.z0 + 19, 2.4, 16), "x", BX.x1 + 1.4, BX.x1 + 2.2, lamp ? "#5fe08a" : "#2f5a3e", { flat: true, emit: lamp ? ["#5fe08a", 1] : undefined, emitK: 2.2 }));
  objs.push({ parts: live });
  let svg = E.render(objs);
  // ---- effects ----
  if (jet && run > 0.02) {
    const a = nz.tip, wide = test === "x6" ? 4.2 : lance ? 1.6 : 2.4, col = lightTheme ? "#3f8fd0" : "#cfeaff";
    E.line(a, tgt, wide * 1.6, col, 0.75 * run, !lightTheme); E.line(a, tgt, wide * 0.6, "#ffffff", 0.9 * run, !lightTheme);
    if (dt > 0) { const n = test === "x6" ? 9 : lance ? 6 : 4; for (let j = 0; j < n; j++) fx.push({ k: "spl", p: [tgt[0] + 1, tgt[1], tgt[2]], v: [20 + rn() * (test === "x6" ? 110 : 60), (rn() - 0.5) * (test === "x6" ? 150 : 90), (rn() - 0.2) * (test === "x6" ? 140 : 80)], life: 0, max: 0.35 + rn() * 0.35, s: test === "x6" ? 1.5 : 1 });
      if (lance) for (let j = 0; j < 2; j++) fx.push({ k: "steam", p: [tgt[0] + 4 + rn() * 10, tgt[1] + (rn() - 0.5) * 16, tgt[2] + rn() * 6], v: [(rn() - 0.5) * 12, (rn() - 0.5) * 12, 20 + rn() * 20], life: 0, max: 0.9 + rn() * 0.7, s: 1 }); }
  }
  if (test === "dust" && th > 0.05) { const k2 = th * (0.35 + 0.65 * run); for (const [a, b, c, d] of SW) { const ang = a * TAU + now * (0.9 + d * 0.8) * (b < 0.5 ? 1 : -1), r = 10 + b * (G3.TANK_R - 14); E.sprite([Math.cos(ang) * r, Math.sin(ang) * r, 4 + c * (G3.TANK_H * th - 8) + Math.sin(now * 1.3 + d * 9) * 4], 9 + d * 8, lightTheme ? "#8f8468" : "#d8cdb2", (lightTheme ? 0.3 : 0.26) * k2); } }
  // tell-tales at the leak paths: drips inside under a jet, bubbles in the tank, dust drawn in
  if (dt > 0 && test && run > 0.3) for (const k of ["gasket", "loose", "gland", "drain"]) { const amt = cur.parts[k]; if (amt <= 0) continue; const p = LEAKP[k], rate = clamp(Math.log10(1 + amt) / 3.4, 0.08, 1);
    if (rn() < rate) { if (test === "x7") fx.push({ k: "bub", p: [p[0] + (k === "gland" ? 0 : 2), p[1] + (k === "gland" ? 3 : 0), p[2]], v: [(rn() - 0.5) * 6, (rn() - 0.5) * 6, 26 + rn() * 14], life: 0, max: 1.6, s: 0.6 + rn() * 0.8 });
      if (test !== "dust") fx.push({ k: "drip", p: [p[0] - (k === "gland" ? 0 : 3), p[1] - (k === "gland" ? 3 : 0), p[2] - 1], v: [(rn() - 0.5) * 5, (rn() - 0.5) * 5, k === "drain" ? 14 : -4], life: 0, max: 0.55, s: 1 });
      else fx.push({ k: "puff", p: [p[0] - (k === "gland" ? 0 : 3), p[1] - (k === "gland" ? 3 : 0), p[2] - 1], v: [-(6 + rn() * 8) * (k === "gland" ? 0.2 : 1), -(6 + rn() * 8) * (k === "gland" ? 1 : 0.2), -3 - rn() * 5], life: 0, max: 0.9, s: 1 }); } }
  // switching back on with water over the terminals
  const zap = burst(now - zapAt, 0.01, 0.2);
  if (zap > 0.02) { const zp = [0, -1, BX.z0 + 11]; E.sprite(zp, 4, "#ffffff", zap, true, 1); E.sprite(zp, 22, "#8fb4ff", 0.8 * zap, true, 1); for (let j = 0; j < 3; j++) E.line(zp, [zp[0] + (rn() - 0.5) * 30, zp[1] + (rn() - 0.5) * 20, zp[2] + rn() * 14], 1.8, "#dfe9ff", zap, true); }
  if (dt > 0 && dead && now > zapAt && now - zapAt < 1.6 && rn() < 0.5) fx.push({ k: "smoke", p: [(rn() - 0.5) * 30, (rn() - 0.5) * 20, BX.z0 + 12], v: [(rn() - 0.5) * 8, (rn() - 0.5) * 8, 22 + rn() * 16], life: 0, max: 1.6 + rn(), s: 1 });
  const surf = G3.WATER_Z * wl * th;
  fx = fx.filter((p) => {
    p.life += dt; if (p.life > p.max) return false;
    const t = p.life / p.max;
    if (p.k === "spl" || p.k === "drip") p.v[2] -= (p.k === "spl" ? 260 : 150) * dt;
    for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * dt;
    if (p.k === "drip" && p.p[2] < BX.z0 + 2.4) return false;
    if (p.k === "bub" && p.p[2] > surf) return false;
    if (p.k === "spl") E.sprite(p.p, (1.2 + 1.6 * t) * p.s, lightTheme ? "#3f8fd0" : "#cfeaff", 0.7 * (1 - t), !lightTheme);
    else if (p.k === "steam") E.sprite(p.p, 5 + 12 * t, lightTheme ? "#9aa4ae" : "#e6edf3", 0.22 * (1 - t));
    else if (p.k === "bub") E.sprite(p.p, 1.1 * p.s, "#e6f4ff", 0.85, !lightTheme, 1);
    else if (p.k === "drip") E.sprite(p.p, 0.9, lightTheme ? "#2f7fc8" : "#9fd4ff", 0.95, !lightTheme, 1);
    else if (p.k === "puff") E.sprite(p.p, 1.6 + 3 * t, lightTheme ? "#8f8468" : "#d8cdb2", 0.5 * (1 - t));
    else E.sprite(p.p, 6 + 16 * t, lightTheme ? "#4a4744" : "#3a3836", 0.4 * (1 - t));
    return true;
  });
  // ---- lettering ----
  let m = E.faceMatrix([BX.x1 + 0.55, 6, BX.z0 + 26], [0, -1, 0], [0, 0, -1]);
  if (m) { const r = rating(); svg += '<g transform="' + m + '"><text class="pt lo" x="1.6" y="4" font-size="2.6">DEGREE OF PROTECTION</text><text class="pt" x="1.6" y="' + (r.length > 9 ? 9.6 : 10.6) + '" font-size="' + (r.length > 9 ? 2.9 : r.length > 5 ? 4.2 : 6.4) + '">' + r + "</text></g>"; }
  m = E.faceMatrix([PL.x + PL.w - 62, PL.y + PL.d - 13, 0.05], [1, 0, 0], [0, 1, 0]);
  if (m) svg += '<g transform="' + m + '"><text class="pt bench" x="0" y="5" font-size="5">TEST BAY</text></g>';
  if (test) {
    const fr = sm(T_SET, T_SET + T_RUN, tt), p = E.project([0, 0, (tankT ? G3.TANK_H : BX.z1 + 30) + 14]), el = T.dur * fr, clock = T.unit === "h" ? el.toFixed(1) + " h" : T.unit === "s" ? Math.round(el) + " s" : el.toFixed(1) + " min";
    svg += '<text class="mk-lab tn" text-anchor="middle" x="' + p[0].toFixed(1) + '" y="' + (p[1] - 15).toFixed(1) + '">' + T.name + '</text><text class="mk-lab tc" text-anchor="middle" x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '">' + clock + " of " + T.dur + " " + T.unit + "</text>";
    if (test === "x7" && wl > 0.6) { const a = [G3.TANK_R + 6, 0, BX.z0], b = [G3.TANK_R + 6, 0, G3.WATER_Z], pm = E.project([G3.TANK_R + 6, 0, (BX.z0 + G3.WATER_Z) / 2]); E.line(a, b, 1.6, lightTheme ? "#2f7fc8" : "#9fd4ff", 0.95); for (const e of [a, b]) E.line([e[0] - 3, e[1], e[2]], [e[0] + 3, e[1], e[2]], 1.6, lightTheme ? "#2f7fc8" : "#9fd4ff", 0.95); svg += '<text class="mk-lab dm" x="' + (pm[0] + 8).toFixed(1) + '" y="' + (pm[1] + 4).toFixed(1) + '">1 m</text>'; }
    if (jet && run > 0.5) { const pm = E.project([(nz.tip[0] + tgt[0]) / 2, G3.NOZ_Y, 78]); svg += '<text class="mk-lab dm" text-anchor="middle" x="' + pm[0].toFixed(1) + '" y="' + pm[1].toFixed(1) + '">' + T.dist + "</text>"; }
  }
  if (E.xray > 0.02 && !test) { const items = [{ p: [BX.x1 - 3, BX.y1 - 3, BX.z1 + 1], text: ["Gasket", "Pinched gasket", "No gasket"][build.gasket], sub: ["seals the lid to the box", "one corner has rolled out of its seat", "metal on metal"][build.gasket] }, { p: [G3.GLAND_X, BX.y1 + 4, G3.GLAND_Z], text: ["Cable gland", "Thin cable", "Open entry"][build.gland], sub: ["seal sized for the cable", "too small for the gland's seal", "no gland, no plug"][build.gland] }];
    if (build.screws) items.push({ p: [BX.x1 - 3, BX.y0 + 3, BX.z1 + 6], text: "Hand-tight screws", sub: "the gasket is barely squeezed" });
    if (build.drain) items.push({ p: [BX.x1 + 0.7, -8, BX.z0 + 3.4], text: "Drain hole", sub: "lets condensation out" });
    svg += E.callouts(items, E.xray, E.fs < 0.62 ? {} : { topL: 70, topR: 70 }); }
  if (sceneG.innerHTML !== svg) sceneG.innerHTML = svg;
  const zs = burst(now - zapAt, 0.02, 0.18); flashEl.style.opacity = (0.5 * zs).toFixed(3); setShake(zs > 0.05 ? 3 * zs * Math.sin(now * 90) : 0, zs > 0.05 ? 3 * zs * Math.cos(now * 71) : 0);
  const text = test ? T.name + " · " + T.short + " · " + (test === "dust" ? Math.round(shownVol) + " mg in" : shownVol >= 1000 ? (shownVol / 1000).toFixed(1) + " L in" : Math.round(shownVol) + " mL in")
    : "rating so far: " + rating() + " · " + ORDER.filter((k) => results[k]).length + " of 5 tests run";
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuetext", text);
}

// ---------------- running it ----------------
const GOOD = { gasket: 0, screws: 0, gland: 0, drain: 0 };
const TOUR = [
  { b: GOOD, t: "dust" }, { b: GOOD, t: "x6" }, { b: GOOD, t: "x7" },
  { b: { ...GOOD, screws: 1 }, t: "x7", note: "Same box, but the lid screws only hand tight." }, { b: { ...GOOD, screws: 1 }, t: "x6" },
  { b: { ...GOOD, drain: 1 }, t: "x5", note: "Now a drain hole in the bottom, the way a lot of outdoor fittings come." }, { b: { ...GOOD, drain: 1 }, t: "x7" },
  { b: { ...GOOD, gasket: 1 }, t: "x9", note: "A good box again, except the gasket got pinched putting the lid on." },
];
const sameBuild = (a) => a.gasket === build.gasket && a.screws === build.screws && a.gland === build.gland && a.drain === build.drain;
function tick(t) {
  const dt0 = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60, dt = dt0 * (slow ? 0.35 : 1);
  last = t; now += dt;
  if (touring && !test) {
    tourWait -= dt0;
    if (tourWait <= 0) { tourStep = (tourStep + 1) % TOUR.length; const s = TOUR[tourStep]; if (!sameBuild(s.b)) { Object.assign(build, s.b); results = {}; lidGoal = 0; lamp = false; dead = false; shownVol = 0; } startTest(s.t); if (s.note) say(s.note + " " + TESTS[s.t].name + ": " + TESTS[s.t].how); tourWait = 2.6; }
  }
  step(dt);
  draw(dt); syncUi();
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { touring = false; };
const setBuild = (k, v) => { takeOver(); if (test) return; build[k] = v; results = {}; lidGoal = 0; lamp = false; dead = false; shownVol = 0; say("Rebuilt. Every result is wiped: a changed box is a new box. Run the tests."); run(); };
const doTest = (k) => { takeOver(); if (test) return; startTest(k); run(); };
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
ui.g.forEach((b, i) => b.addEventListener("click", () => setBuild("gasket", i)));
ui.s.forEach((b, i) => b.addEventListener("click", () => setBuild("screws", i)));
ui.c.forEach((b, i) => b.addEventListener("click", () => setBuild("gland", i)));
ui.d.forEach((b, i) => b.addEventListener("click", () => setBuild("drain", i)));
ui.t.forEach((b) => b.addEventListener("click", () => doTest(b.dataset.test)));
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; tourWait = 0; } run(); });
onTap(() => { const next = ORDER.find((k) => !results[k]) || "x6"; doTest(next); });
stage.addEventListener("keydown", (ev) => {
  const map = { x: () => { setX(!E.xrayOn); run(); }, X: () => { setX(!E.xrayOn); run(); }, 1: () => doTest("dust"), 2: () => doTest("x5"), 3: () => doTest("x6"), 4: () => doTest("x7"), 5: () => doTest("x9"), g: () => setBuild("gasket", (build.gasket + 1) % 3), l: () => setBuild("screws", 1 - build.screws), c: () => setBuild("gland", (build.gland + 1) % 3), d: () => setBuild("drain", 1 - build.drain), " ": () => doTest(ORDER.find((k) => !results[k]) || "x6"), s: () => { slow = !slow; run(); } };
  if (map[ev.key]) { ev.preventDefault(); map[ev.key](); }
});
window.__fig = { E, freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; }, test: doTest, build: (o) => { takeOver(); test = null; Object.assign(build, o); results = {}; lidGoal = 0; lamp = false; dead = false; shownVol = 0; } };
setX(true); say("Build the box, then put it through the tests and see what code it earns."); syncUi(); draw();

`;

const CSS = `.fx-flash{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(circle 50% at 50% 55%,#ffffff 0%,#cfe0ff 40%,rgba(160,190,255,0) 100%)}
.pt{font-family:var(--anatomy-mono);fill:#23262b;font-weight:700}.pt.lo{fill:#5a6068;font-weight:600}.pt.bench{fill:var(--anatomy-muted);font-weight:600;letter-spacing:.08em;opacity:.8}
.tn{font-size:calc(13px*var(--mk-ts,1))}.tc{font-weight:500;font-size:calc(11px*var(--mk-ts,1));fill:var(--anatomy-muted)}.dm{font-weight:500;font-size:calc(10.5px*var(--mk-ts,1));fill:var(--mk-accent)}
@media (min-width:561px){.mk-hint{top:46px}}
.ctl .tb{position:relative}.ctl .tb[data-res="run"]{border-color:var(--mk-accent);color:var(--mk-accent)}
.ctl .tb[data-res="pass"]{border-color:var(--mk-good);color:var(--mk-good)}.ctl .tb[data-res="fail"]{border-color:var(--mk-danger);color:var(--mk-danger)}
.ctl .tb[data-res="pass"]::after,.ctl .tb[data-res="fail"]::after{position:absolute;top:-7px;right:-5px;width:15px;height:15px;border-radius:50%;font:700 10px/15px var(--anatomy-mono);text-align:center;color:#0c0e11}
.ctl .tb[data-res="pass"]::after{content:"✓";background:var(--mk-good)}.ctl .tb[data-res="fail"]::after{content:"×";background:var(--mk-danger)}
.ctl .rate{min-width:0;flex:1;text-align:left;font-size:17px;font-weight:700;letter-spacing:.02em;color:var(--anatomy-strong)}
@media (min-width:821px) and (max-width:1319px){.ctl-row.tests{grid-column:1/-1}}`;

const stage = stageHtml({
  W, H, fig: "Fig 27", title: "IP ratings", xray: true,
  label: "A stainless enclosure on a pedestal in a test bay, with a cable gland on the front and a rating plate on the side. A jet nozzle stands on a tripod to one side and a vacuum pump to the other. For the dust and immersion tests a glass tank rises around the box and fills with talcum dust or water. An x-ray view turns the box to glass to show water or dust getting in. After each test the lid opens for inspection.",
  keysHelp: "IP ratings: drag to rotate, X for x-ray, tap or space runs the next test; 1 to 5 run a test, G gasket, L lid screws, C cable entry, D drain hole, S slow motion",
  extra: `<div class="fx-flash" aria-hidden="true"></div>`,
});

const CONTROLS = `<div class="ctl" role="group" aria-label="Build and test controls">
  <div class="ctl-row"><span class="ctl-label">Gasket</span><button type="button" data-gasket="0" aria-pressed="true">Good</button><button type="button" data-gasket="1" aria-pressed="false">Pinched</button><button type="button" data-gasket="2" aria-pressed="false">Missing</button></div>
  <div class="ctl-row"><span class="ctl-label">Lid screws</span><button type="button" data-screws="0" aria-pressed="true">Torqued</button><button type="button" data-screws="1" aria-pressed="false">Hand tight</button></div>
  <div class="ctl-row"><span class="ctl-label">Cable entry</span><button type="button" data-gland="0" aria-pressed="true">Sealed</button><button type="button" data-gland="1" aria-pressed="false">Thin cable</button><button type="button" data-gland="2" aria-pressed="false">Open</button></div>
  <div class="ctl-row"><span class="ctl-label">Drain hole</span><button type="button" data-drain="0" aria-pressed="true">None</button><button type="button" data-drain="1" aria-pressed="false">Drilled</button></div>
  <div class="ctl-row tests"><span class="ctl-label">Test</span><button type="button" class="tb" data-test="dust">Dust<small>5X / 6X</small></button><button type="button" class="tb" data-test="x5">Jet<small>X5</small></button><button type="button" class="tb" data-test="x6">Big jet<small>X6</small></button><button type="button" class="tb" data-test="x7">Dunk<small>X7</small></button><button type="button" class="tb" data-test="x9">Hot jet<small>X9</small></button></div>
  <div class="ctl-row"><span class="ctl-label">It earns</span><output id="rate" class="rate">untested</output></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
</div>`;

const foot = footHtml({
  theme, slug: "ip-rating",
  real: "the IEC 60529 test conditions for IPX5, IPX6, IPX7 and IPX9 (nozzle sizes, flows, distances, depth and times), dust testing in talcum powder under a vacuum, and the rule that 7, 8 and 9 do not cover the jet numbers, so both get marked.",
  made: "how much gets in through each fault, the pass marks, and the scale: the nozzle and the water depth are drawn far closer than they really are. Real tests are not done live, either.",
});
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), pageMk2({
  k, title: "IP ratings", fig: "Fig 27", hint: "Tap: run the next test", theme, W, H, stage, controls: CONTROLS, css: CSS, foot,
  caption: "An IP code is two numbers, each earned in its own test. The first is solids, up to 6 for dust-tight: the enclosure sits in talcum powder with a vacuum pulling on the inside. The second is water, and it is not one ladder. Up to 6, each number covers the ones below it. But 7 and 8 (immersion) and 9 (hot high-pressure jets) are separate tests, so a box that sat a metre under water for half an hour has not been shown to stand up to a jet. That is why you see double markings like IP66/IP67. Every test finds a different path in. A jet gets under a lightly clamped lid that a metre of still water presses shut, and a drain hole that a jet never reaches floods the moment the box goes under.",
  script: LIVE.replace("__DATA__", JSON.stringify(DATA)),
}));
console.log("wrote", name);
