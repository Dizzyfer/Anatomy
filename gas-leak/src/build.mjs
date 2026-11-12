import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { engineScript, stageHtml, pageMk2, footHtml } from "../../mk2/shell.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const W = 960, H = 640;

// Truth: methane burns between 5 and 15 % in air and is lighter than air; propane between about 2.1 and 9.5 % and is
// heavier. Gas is odourised so you can smell it well before it can burn (at about a fifth of the LEL). Natural gas
// detectors go high, LPG detectors go low.
// Toy: the room, the leak rates, how the gas spreads and layers, the ventilation rates, the alarm point and the time-lapse.
const GAS = {
  ng: { name: "Natural gas", lel: 5, uel: 15, up: 1, scale: 20, drift: 0.004 },
  lpg: { name: "LPG", lel: 2.1, uel: 9.5, up: -1, scale: 12, drift: 0.008 },
};
const MODEL = { cells: 10, roomM3: 41.6, leak: { small: 0.6, big: 4 }, ach: { closed: 0.3, window: 4, hood: 8 }, lapse: 150, mix: 0.015, alarm: 0.1, end: 6 };

const ROOM = { x: -100, y: -100, w: 200, d: 200, h: 130 };
const cellZ = (i) => (ROOM.h / MODEL.cells) * i;
const SOURCES = { stove: [5, -86, 47], switch: [-99, 20, 62], fridge: [-86, -44, 8] };
const zCell = (z) => Math.min(MODEL.cells - 1, Math.floor(z / (ROOM.h / MODEL.cells)));
const PLATE = { x: -112, y: -112, w: 224, d: 224, r: 8 };
const P = k.fitProjection([...k.boxCorners(PLATE, -0.8, 0), [-103, -103, 136], [100, -103, 136], [-103, 100, 136], [100, 100, 136]], W, H, { pad: 18, azimuth: 45, elevation: 30 });
const DATA = { W, H, P, PLATE };
Object.assign(DATA, { GAS, MODEL, ROOM, SRC: SOURCES, zc: Object.fromEntries(Object.entries(SOURCES).map(([n, p]) => [n, zCell(p[2])])) });
const meter = (id, label) => `<div class="ctl-row"><span class="ctl-label">${label}</span><div class="meter"><span id="${id}-fill" class="fill"></span><span id="${id}-lel" class="mark" style="left:25%" data-label=""></span><span id="${id}-uel" class="mark" style="left:75%" data-label=""></span></div><output id="${id}-out">0.0 %</output></div>`;
const LIVE = `
${engineScript()}
const D = __DATA__;
const stage = document.querySelector(".mk-stage");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lightTheme = document.body.dataset.theme === "light";
const E = mk2(stage, D.P, { W: D.W, H: D.H, pivot: [0, 0, 50], plate: { ...D.PLATE, h: 12, foot: 5 }, shadowBox: [-120, -120, -18, 120, 120, 140] });
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
let gas = "ng", leak = "small", vent = "closed", detHigh = true, leaking = false;
let c = new Array(M.cells).fill(0), boomAt = null, burned = new Array(M.cells).fill(0), sparkAt = -10, sparkSrc = "switch", alarm = false, smelt = false, minutes = 0;
let frame = 0, last = 0, now = 0, visible = false, touring = true, slow = false, tourClock = 0, tourStep = -1, actions = [], lastShot = "", lastEvent = "", lastEventAt = -10;
const G = () => D.GAS[gas];
const busy = () => boomAt !== null;
const event = (t) => { lastEvent = t; lastEventAt = now; };
function reset() { c = new Array(M.cells).fill(0); boomAt = null; burned.fill(0); alarm = false; smelt = false; minutes = 0; leaking = false; lastEvent = ""; }

function step(dt) {
  if (busy()) return;
  const sec = dt * M.lapse, g = G(), n = M.cells, cellM3 = M.roomM3 / n;
  minutes += sec / 60;
  // the leak goes in at the cooktop
  if (leaking) c[D.zc.stove] += ((M.leak[leak] / 3600) * sec / cellM3) * 100;
  // buoyancy: methane rises, propane sinks; a little mixing between layers; ventilation takes it all out evenly
  const next = [...c];
  for (let i = 0; i < n; i++) {
    const j = i + g.up;
    if (j >= 0 && j < n) { const mv = c[i] * Math.min(1, g.drift * sec); next[i] -= mv; next[j] += mv; }
    if (i < n - 1) { const mx = (c[i] - c[i + 1]) * Math.min(0.5, M.mix * sec); next[i] -= mx; next[i + 1] += mx; }
  }
  const out = Math.exp(-(M.ach[vent] / 3600) * sec);
  c = next.map((v) => Math.max(0, v * out));
  const watched = detHigh ? c[n - 1] : c[0];
  if (!alarm && watched >= M.alarm * g.lel) { alarm = true; event("The gas alarm went off: " + (detHigh ? "the one up high" : "the one down low") + " is reading " + Math.round((watched / g.lel) * 100) + " % of the LEL."); }
  if (!smelt && Math.max(...c) >= 0.2 * g.lel) { smelt = true; event("You'd smell it by now: gas is odourised so you can smell it at about a fifth of the LEL, long before it can burn."); }
}

function spark(src) {
  if (busy()) return;
  sparkAt = now; sparkSrc = src;
  const g = G(), i0 = D.zc[src], v = c[i0];
  const where = { switch: "the light switch", fridge: "the fridge thermostat", stove: "the cooktop igniter" }[src];
  if (v >= g.lel && v <= g.uel) {
    // burn every layer that's in the range and joined to this one
    burned.fill(0);
    for (let i = i0; i >= 0 && c[i] >= g.lel && c[i] <= g.uel; i--) burned[i] = 1;
    for (let i = i0; i < M.cells && c[i] >= g.lel && c[i] <= g.uel; i++) burned[i] = 1;
    // a layer that's too rich still burns at its edges once the flame gets there
    for (let i = 0; i < M.cells; i++) if (c[i] > g.uel && (burned[i - 1] || burned[i + 1])) burned[i] = 0.6;
    boomAt = now + 0.05;
    const frac = burned.reduce((a, b) => a + b, 0) / M.cells;
    event("BOOM. " + where[0].toUpperCase() + where.slice(1) + " sparked in " + v.toFixed(1) + " % " + (gas === "ng" ? "methane" : "propane") + ", inside the " + g.lel + " to " + g.uel + " % range. About " + Math.round(frac * 100) + " % of the room was in range and it all went at once: windows out, door off, ceiling up.");
  } else if (v > g.uel) event(where[0].toUpperCase() + where.slice(1) + " sparked in " + v.toFixed(1) + " %: too rich to burn, above the " + g.uel + " % UEL. Lucky. Now open a window and it'll dilute straight back through the flammable range.");
  else event(where[0].toUpperCase() + where.slice(1) + " sparked in " + v.toFixed(2) + " %: under the " + g.lel + " % LEL at that height, so nothing." + (Math.max(...c) >= g.lel ? " But there's a flammable layer " + (g.up > 0 ? "up near the ceiling" : "down on the floor") + "." : ""));
}
const ui = {
  gas: [...document.querySelectorAll("[data-gas]")], leak: [...document.querySelectorAll("[data-leak]")], vent: [...document.querySelectorAll("[data-vent]")], det: [...document.querySelectorAll("[data-det]")],
  meters: ["top", "mid", "low"].map((n) => ({ fill: document.querySelector("#" + n + "-fill"), out: document.querySelector("#" + n + "-out"), lel: document.querySelector("#" + n + "-lel"), uel: document.querySelector("#" + n + "-uel") })),
  stats: document.querySelector("#stats"), gasb: document.querySelector("#gasb"), sparks: [...document.querySelectorAll("[data-spark]")], reset: document.querySelector("#reset"), slow: document.querySelector("#slow"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"),
};
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };
// ---------------- the kitchen, in real 3D ----------------
const TAU = Math.PI * 2, RM = D.ROOM, RX = RM.x, RY = RM.y, RH = RM.h, X1 = RM.x + RM.w, Y1 = RM.y + RM.d;
const BAND = { lean: "#5fbf86", flam: "#ff8a3a", rich: "#9b59b6", burnt: "#ff5a2a" };
const rn = () => Math.random();
function roomStatic() {
  const o = [], WALLC = "#d9d4c8", PT = { mat: "paint" };
  // floor: boards
  o.push(box(RX - 3, X1, RY - 3, Y1, -0.2, 0.6, "#a98d68", { mat: "matte" }));
  for (let y = RY + 16; y < Y1; y += 16) o.push(box(RX, X1, y - 0.25, y + 0.25, 0.6, 0.66, "#8c7353", { bevel: 0, mat: "matte" }));
  // back wall (with the window opening) and the left wall (with the doorway)
  const wall = (pieces) => pieces.forEach((p) => o.push(box(...p, WALLC, PT)));
  wall([[RX - 3, 46, RY - 3, RY, 0, RH], [92, X1, RY - 3, RY, 0, RH], [46, 92, RY - 3, RY, 0, 60], [46, 92, RY - 3, RY, 104, RH]]);
  wall([[RX - 3, RX, RY, 42, 0, RH], [RX - 3, RX, 86, Y1, 0, RH], [RX - 3, RX, 42, 86, 104, RH]]);
  o.push(box(RX, X1, RY, RY + 0.6, 0.6, 7, "#efece4", PT), box(RX, RX + 0.6, RY, 42, 0.6, 7, "#efece4", PT), box(RX, RX + 0.6, 86, Y1, 0.6, 7, "#efece4", PT));
  // window frame, door frame
  for (const [a, b, c2, d] of [[44.5, 46.5, 58, 106], [91.5, 93.5, 58, 106], [46, 92, 58, 60.5], [46, 92, 103.5, 106]]) o.push(box(a, b, RY - 3.4, RY + 0.6, c2, d, "#f4f2ec", PT));
  for (const [a, b, c2, d] of [[40.5, 42.5, 0.6, 106], [85.5, 87.5, 0.6, 106], [42, 86, 103.5, 106]]) o.push(box(RX - 3.4, RX + 0.6, a, b, c2, d, "#f4f2ec", PT));
  // bench along the back wall: carcass with doors, benchtop, cooktop, range hood and its duct
  o.push(box(-70, 70, RY, RY + 29, 0.6, 44, "#e7e3da", PT), box(-72, 72, RY, RY + 32, 44, 47, "#4a4f56", { mat: "gloss" }));
  for (const x of [-69, -49, -29, 11, 31, 51]) o.push(box(x, x + 18, RY + 29, RY + 30, 5, 41, "#f4f2ec", PT), box(x + 14.5, x + 15.5, RY + 30, RY + 31, 20, 30, "#aeb4bb", { mat: "steel", bevel: 0 }));
  o.push(box(-9, 9, RY + 29, RY + 30, 5, 30, "#2a2d31", { mat: "gloss" }), box(-9, 9, RY + 29, RY + 30.6, 32, 41, "#c9ced3", { mat: "steel" })); // the oven under the cooktop
  o.push(box(-12, 22, RY + 4, RY + 28, 47, 48.2, "#1b1c1f", { mat: "gloss" }));
  for (const [x, y] of [[-3, RY + 10], [13, RY + 10], [-3, RY + 22], [13, RY + 22]]) o.push(lathe([[2.2, 48.2], [4.4, 48.2], [4.4, 49.4], [2.2, 49.4], [2.2, 48.2]], "#3a3d42", { c: [x, y, 0], seg: 16, closed: true, mat: "iron" }));
  o.push(box(-14, 24, RY, RY + 22, 92, 102, "#c9ced3", { mat: "steel" }), box(-2, 12, RY, RY + 10, 102, RH, "#c9ced3", { mat: "steel" }));
  o.push(box(36, 62, RY + 5, RY + 25, 44.5, 47.3, "#aeb4bb", { mat: "steel" }), tube([[49, RY + 3, 47], [49, RY + 3, 58], [49, RY + 10, 60], [49, RY + 14, 57]], 1, "#c9ced3", { seg: 6, mat: "chrome" })); // sink and tap
  // fridge in the corner
  o.push(prism(rrect(RX, RX + 30, -70, -36, 1.6), "z", 0.6, 92, "#eceae4", { mat: "paint", shell: true }), box(RX + 30, RX + 30.5, -69, -37, 60, 60.6, "#b9bec4", { bevel: 0 }), box(RX + 30, RX + 31.4, -41, -39.5, 30, 52, "#aeb4bb", { mat: "steel", bevel: 0 }), box(RX + 30, RX + 31.4, -41, -39.5, 66, 82, "#aeb4bb", { mat: "steel", bevel: 0 }));
  o.push(box(RX + 6, RX + 24, -64, -42, 2, 14, "#2a2d31", { mat: "matte" })); // the compressor and its thermostat relay, down the bottom
  // light switch plate, a small table and two stools so it's somebody's kitchen
  o.push(box(RX, RX + 0.8, 18, 26, 56, 66, "#f4f2ec", { mat: "plastic" }));
  o.push(prism(rrect(10, 70, 20, 60, 4), "z", 38, 41, "#b98a5a", { mat: "satin" }));
  for (const [x, y] of [[15, 25], [65, 25], [15, 55], [65, 55]]) o.push(box(x - 1.5, x + 1.5, y - 1.5, y + 1.5, 0.6, 38, "#8c6a44", { mat: "satin" }));
  for (const [x, y] of [[40, 74], [84, 40]]) o.push(cyl(x, y, 8, 24, 26.5, "#3a6ea5", 18, { mat: "paint" }), cyl(x, y, 1.6, 0.6, 24, "#aeb4bb", 8, { mat: "steel" }));
  return o;
}
let fx = [], plume = 0;
function draw(dt = 0) {
  const g = G(), b = boomAt === null ? -1 : now - boomAt, live = [], n = M.cells, hC = RH / n;
  const frac = burned.reduce((a, x) => a + x, 0) / n;
  // the gas, as layers through the room: green too lean to burn, orange in the flammable range, purple too rich
  for (let i = 0; i < n; i++) {
    const v = c[i], band = b >= 0 && burned[i] ? "burnt" : v < g.lel * 0.05 ? "none" : v < g.lel ? "lean" : v <= g.uel ? "flam" : "rich";
    if (band === "none") continue;
    const op = band === "burnt" ? Math.max(0, 1 - b * 2) * 0.4 : clamp(0.05 + (v / g.uel) * 0.2, 0.05, 0.26);
    if (op > 0.02) live.push(box(RX + 1, X1 - 1, RY + 1, Y1 - 1, i * hC + 0.8, (i + 1) * hC - 0.3, BAND[band], { flat: true, bevel: 0, opacity: op * (lightTheme ? 1 : 0.85), emit: band === "burnt" ? [BAND[band], 0.5] : undefined, emitK: 1 }));
  }
  // window sashes, door and ceiling: these are what leave
  const win = b > 0 ? [0, -150 * b, 30 * b - 70 * b * b] : [0, 0, 0], dr = b > 0 ? [-170 * b, 0, 34 * b - 70 * b * b] : [0, 0, 0], up = b > 0 ? Math.max(0, (120 * frac + 40) * b - 260 * b * b) * 0.6 : 0;
  if (!(b > 0.9)) {
    const open = vent === "window" && b < 0 ? 16 : 0, a = b > 0 ? Math.max(0, 1 - b) : 1;
    live.push(box(47 + win[0], 68.5 + win[0], RY - 2 + win[1], RY - 1.2 + win[1], 61 + win[2], 103 + win[2], "#bfe0f2", { mat: "glass", opacity: 0.3 * a, bevel: 0 }), box(69.5 + win[0], 91 + win[0], RY - 2 + win[1], RY - 1.2 + win[1], 61 + open + win[2], 103 + open * 0 + win[2], "#bfe0f2", { mat: "glass", opacity: 0.3 * a, bevel: 0 }), box(68.5 + win[0], 69.5 + win[0], RY - 2.4 + win[1], RY - 0.8 + win[1], 60.5 + win[2], 103.5 + win[2], "#f4f2ec", { mat: "paint", bevel: 0 }));
    live.push(box(RX - 2.2 + dr[0], RX - 0.6 + dr[0], 43, 85, 0.8 + dr[2], 103 + dr[2], "#c8b08a", { mat: "paint" }), sphere([RX + 0.6 + dr[0], 50, 52 + dr[2]], 1.8, "#c9a24a", { lat: 6, lon: 8, mat: "metal" }));
  }
  live.push(box(RX - 3, X1, RY - 3, Y1, RH + up, RH + 3 + up, "#e9eef3", { mat: "glass", opacity: lightTheme ? 0.2 : 0.12, bevel: 0 }));
  // the gas knob, the switch, the detector
  live.push(cyl(-6, RY + 31.5, 2, 36, 38.5, leaking ? "#ff6a3d" : "#c9ced3", 12, { mat: "plastic", emit: leaking ? ["#ff6a3d", 0.8] : undefined }));
  const swOn = now - sparkAt < 0.3 && sparkSrc === "switch";
  live.push(box(RX + 0.8, RX + 1.6, 21, 23, swOn ? 62 : 59, swOn ? 65 : 62, "#d9d6cf", { mat: "plastic", bevel: 0 }));
  const dz = detHigh ? 118 : 16, led = alarm && Math.sin(now * 12) > 0;
  live.push(prism(circle(-15, dz, 4.4, 18), "x", RX, RX + 2, "#f4f2ec", { mat: "plastic" }), prism(circle(-15, dz, 1.3, 10), "x", RX + 2, RX + 2.5, led ? "#ff3a2a" : "#4a6a52", { mat: "plastic", bevel: 0, emit: led ? ["#ff3a2a", 1] : undefined, emitK: 2.6 }));
  let svg = E.render([{ cache: "room", rev: 0, parts: roomStatic }, { parts: live }]);
  // the leak: a plume off the cooktop that rises or sinks with the gas
  if (leaking && b < 0 && dt > 0) { plume += dt * (leak === "big" ? 26 : 9); while (plume > 1) { plume -= 1; fx.push({ k: "gas", p: [5 + (rn() - 0.5) * 6, RY + 14 + (rn() - 0.5) * 6, 50], v: [(rn() - 0.5) * 8, 6 + rn() * 8, g.up * (16 + rn() * 14)], life: 0, max: 1.6 + rn() * 1.2 }); } }
  // the spark, and the alarm shouting
  const sa = now - sparkAt; if (sa < 0.6) { const p = D.SRC[sparkSrc]; E.sprite(p, 5 + sa * 20, "#dfe9ff", Math.exp(-sa / 0.08), true, 1); for (let j = 0; j < 3; j++) E.line(p, [p[0] + (rn() - 0.5) * 8, p[1] + (rn() - 0.5) * 8, p[2] + (rn() - 0.5) * 8], 1.6, "#ffffff", Math.exp(-sa / 0.1), true); }
  if (alarm && b < 0) { const ph = (now * 1.6) % 1; for (let i = 0; i < 20; i++) { const a0 = (i / 20) * TAU, a1 = ((i + 1) / 20) * TAU, r = 6 + ph * 16; E.line([RX + 2.6, -15 + Math.cos(a0) * r, dz + Math.sin(a0) * r], [RX + 2.6, -15 + Math.cos(a1) * r, dz + Math.sin(a1) * r], 1.6, "#ff5a4a", 0.8 * (1 - ph), !lightTheme); } }
  // the blast: every layer that was in range goes at once
  if (b >= 0 && b < 0.5 && dt > 0) for (let i = 0; i < n; i++) if (burned[i] && rn() < 0.7) { const p = [RX + rn() * RM.w, RY + rn() * RM.d, (i + rn()) * hC]; fx.push({ k: "flame", p, v: [(p[0]) * 0.9 + (rn() - 0.5) * 60, (p[1]) * 0.9 + (rn() - 0.5) * 60, 30 + rn() * 80], life: 0, max: 0.5 + rn() * 0.6, s: (1 + rn()) * (0.8 + burned[i]) }); }
  if (b >= 0.2 && b < 2 && dt > 0 && rn() < dt * 50 * frac) fx.push({ k: "smoke", p: [RX + rn() * RM.w, RY + rn() * RM.d, rn() * RH], v: [(rn() - 0.5) * 20, (rn() - 0.5) * 20, 30 + rn() * 40], life: 0, max: 2 + rn() * 2, s: 1.6 });
  if (b >= 0 && b < 0.16) E.sprite([0, 0, RH / 2], 110 * (0.4 + frac), "#fff1c4", 0.45 * (1 - b / 0.16), true, 1);
  fx = fx.filter((p) => {
    p.life += dt; if (p.life > p.max) return false;
    const t = p.life / p.max;
    if (p.k === "gas") { p.v[0] *= 0.98; p.v[1] *= 0.98; p.p[2] = clamp(p.p[2], 2, RH - 2); }
    for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * dt;
    if (p.k === "flame") E.sprite(p.p, (9 + 24 * t) * p.s, t < 0.25 ? "#fff0b8" : t < 0.6 ? "#ff9a2e" : "#d8481a", 0.5 * (1 - t * t), true, 2);
    else if (p.k === "smoke") E.sprite(p.p, (14 + 46 * t) * p.s, lightTheme ? "#4a4744" : "#2e2c2b", 0.45 * (1 - t));
    else E.sprite(p.p, 3 + 9 * t, gas === "ng" ? (lightTheme ? "#3f9f66" : "#8fe0ae") : (lightTheme ? "#7a4a9a" : "#c9a0e8"), 0.2 * Math.sin(Math.PI * t));
    return true;
  });
  // x-ray: what the gas is doing at each height, and the three things that can spark
  if (E.xray > 0.02 && b < 0) {
    let s = "";
    for (let i = 0; i < n; i += 1) { const v = c[i]; if (v < g.lel * 0.05) continue; const p = E.project([X1 + 4, Y1 - 6, (i + 0.5) * hC]); s += '<text class="mk-lab lay-t" data-band="' + (v < g.lel ? "lean" : v <= g.uel ? "flam" : "rich") + '" x="' + (p[0] + 4).toFixed(1) + '" y="' + (p[1] + 3).toFixed(1) + '">' + v.toFixed(1) + " %</text>"; }
    svg += '<g opacity="' + E.xray.toFixed(2) + '">' + s + "</g>" + E.callouts([
      { p: D.SRC.stove, text: "Cooktop igniter", sub: c[D.zc.stove].toFixed(1) + " % at this height" }, { p: D.SRC.switch, text: "Light switch", sub: c[D.zc.switch].toFixed(1) + " % at this height" }, { p: D.SRC.fridge, text: "Fridge thermostat", sub: c[D.zc.fridge].toFixed(1) + " % down here" },
      { p: [RX + 2, -15, dz], text: "Gas detector", sub: detHigh ? "up high: right for natural gas" : "down low: right for LPG" },
    ], E.xray, E.fs < 0.62 ? {} : { topL: 70 });
  }
  if (sceneG.innerHTML !== svg) sceneG.innerHTML = svg;
  if (b >= 0) {
    const A = (4 + 14 * frac) * Math.exp(-b / 0.5);
    setShake(A * Math.sin(b * 80), A * Math.cos(b * 67));
    if (b > M.end) { setShake(0, 0); reset(); fx = []; event("Reset. Gas off, windows back in."); return draw(); }
  }
  const text = b >= 0 ? "BOOM · " + Math.round(frac * 100) + " % of the room" : (leaking ? "leaking · " : "") + Math.round(minutes) + " min · ceiling " + c[n - 1].toFixed(1) + " % · floor " + c[0].toFixed(1) + " %";
  if (readout.textContent !== text) readout.textContent = text;
}

function syncUi() {
  const g = G();
  ui.gas.forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.gas === gas)));
  ui.leak.forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.leak === leak)));
  ui.vent.forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.vent === vent)));
  ui.det.forEach((x) => x.setAttribute("aria-pressed", String((x.dataset.det === "high") === detHigh)));
  const vals = [c[M.cells - 1], c[D.zc.switch], c[0]];
  ui.meters.forEach((m, i) => {
    const v = vals[i];
    m.fill.style.width = (clamp(v / g.scale, 0, 1) * 100).toFixed(1) + "%";
    m.fill.dataset.state = v >= g.lel && v <= g.uel ? "bad" : v > g.uel ? "rich" : v >= 0.2 * g.lel ? "warn" : "ok";
    m.out.textContent = v.toFixed(1) + " %";
    m.lel.style.left = (g.lel / g.scale * 100).toFixed(1) + "%"; m.lel.dataset.label = i ? "" : "LEL " + g.lel;
    m.uel.style.left = (g.uel / g.scale * 100).toFixed(1) + "%"; m.uel.dataset.label = i ? "" : "UEL " + g.uel;
  });
  ui.stats.innerHTML = "<b>" + g.name + "</b> " + (g.up > 0 ? "rises to the ceiling" : "sinks to the floor") + " · burns between <b>" + g.lel + "</b> and <b>" + g.uel + " %</b> · alarm <b>" + (alarm ? "SOUNDING" : "quiet") + "</b>" + (smelt ? " · you can <b>smell it</b>" : "");
  ui.gasb.textContent = leaking ? "TURN IT OFF" : "LEAVE THE GAS ON"; ui.gasb.setAttribute("aria-pressed", String(leaking));
  ui.slow.setAttribute("aria-pressed", String(slow)); ui.tour.setAttribute("aria-pressed", String(touring));
}

function story() {
  if (now - lastEventAt < 5 && lastEvent) return say(lastEvent);
  if (busy()) return;
  const g = G(), mx = Math.max(...c);
  if (mx < 0.05) return say("A kitchen. Leave a burner on without a flame and see where the gas goes. " + (gas === "ng" ? "Natural gas is lighter than air." : "LPG is heavier than air."));
  const inRange = c.map((v, i) => (v >= g.lel && v <= g.uel ? i : -1)).filter((i) => i >= 0);
  say((leaking ? "Still leaking, " : "Gas off, ") + Math.round(minutes) + " minutes in. " + (inRange.length ? "There's a flammable layer " + (g.up > 0 ? "from the ceiling down" : "from the floor up") + " (orange). Anything that sparks inside it sets it off." : "It's building up " + (g.up > 0 ? "under the ceiling" : "along the floor") + ", not in the flammable range yet.") + (c.some((v) => v > g.uel) ? " Some of it's too rich to burn (purple)." : ""));
}

const TOUR = [
  { gas: "ng", leak: "big", vent: "closed", det: true, acts: [[0.5, "on"], [15, "switch"], [22, "end"]] },
  { gas: "lpg", leak: "big", vent: "closed", det: true, acts: [[0.5, "on"], [5.5, "fridge"], [13, "end"]] },
  { gas: "lpg", leak: "big", vent: "closed", det: false, acts: [[0.5, "on"], [6, "end"]] },
  { gas: "lpg", leak: "small", vent: "window", det: false, acts: [[0.5, "on"], [12, "fridge"], [15, "end"]] },
];
function tick(t) {
  const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
  last = t;
  const sdt = dt * (slow ? 0.15 : 1);
  now += sdt;
  if (touring && !busy()) {
    tourClock += sdt;
    if (tourStep < 0 || actions.length === 0) {
      tourStep = (tourStep + 1) % TOUR.length;
      const s = TOUR[tourStep]; gas = s.gas; leak = s.leak; vent = s.vent; detHigh = s.det; reset();
      actions = s.acts.map(([w, a]) => [tourClock + w, a]);
    }
    while (actions.length && tourClock >= actions[0][0]) {
      const a = actions.shift()[1];
      if (a === "on") leaking = true; else if (a === "end") actions = []; else spark(a);
    }
  }
  for (let i = 0; i < 6; i++) step(sdt / 6);
  draw(sdt); syncUi(); story();
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const guard = (fn) => (...a) => { touring = false; actions = []; if (busy()) return; fn(...a); draw(); syncUi(); run(); };
const setGas = guard((v) => { gas = v; reset(); });
const setLeak = guard((v) => { leak = v; });
const setVent = guard((v) => { vent = v; });
const setDet = guard((v) => { detHigh = v; alarm = false; });
const toggleGas = guard(() => { leaking = !leaking; });
const doSpark = guard((s) => spark(s));
const doReset = guard(() => reset());
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;
ui.gas.forEach((x) => x.addEventListener("click", () => setGas(x.dataset.gas)));
ui.leak.forEach((x) => x.addEventListener("click", () => setLeak(x.dataset.leak)));
ui.vent.forEach((x) => x.addEventListener("click", () => setVent(x.dataset.vent)));
ui.det.forEach((x) => x.addEventListener("click", () => setDet(x.dataset.det === "high")));
ui.gasb.addEventListener("click", toggleGas);
ui.sparks.forEach((x) => x.addEventListener("click", () => doSpark(x.dataset.spark)));
ui.reset.addEventListener("click", doReset);
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; tourClock = 0; actions = []; } run(); });
onTap(() => doSpark("switch"));
stage.addEventListener("keydown", (ev) => {
  const map = { x: () => { setX(!E.xrayOn); run(); }, " ": () => doSpark("switch"), g: toggleGas, f: () => doSpark("fridge"), c: () => doSpark("stove"), l: () => setGas(gas === "ng" ? "lpg" : "ng"), w: () => setVent(vent === "closed" ? "window" : vent === "window" ? "hood" : "closed"), d: () => setDet(!detHigh), r: doReset, s: () => { slow = !slow; run(); } };
  if (map[ev.key]) { ev.preventDefault(); map[ev.key](); }
});
window.__fig = { E, freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
draw(); syncUi(); story();
`;

const CSS = `.lay-t[data-band="lean"]{fill:#5fbf86}.lay-t[data-band="flam"]{fill:#ff8a3a}.lay-t[data-band="rich"]{fill:#b98ad8}body[data-theme="light"] .lay-t[data-band="lean"]{fill:#2f8a56}body[data-theme="light"] .lay-t[data-band="flam"]{fill:#d0601a}body[data-theme="light"] .lay-t[data-band="rich"]{fill:#7a3fa0}
.meter .fill[data-state="rich"]{background:#9b59b6}`;

const stage = stageHtml({
  W, H, fig: "Fig 18", title: "Gas leak in the kitchen", xray: true,
  label: "A kitchen with two walls and the ceiling taken off: a bench with a gas cooktop and range hood, a fridge in the corner, a window, a door, a light switch and a gas detector. Leaking gas shows as coloured layers through the room. An x-ray mode puts the percentage on each layer and marks the three things that can spark.",
  keysHelp: "Kitchen: drag to rotate, X for x-ray, G turns the gas on and off, space flicks the light switch, F the fridge, C the cooktop igniter, L switches the gas, W the ventilation, D the detector",
  extra: ``,
});

const CONTROLS = `<div class="ctl" role="group" aria-label="Test controls">
  <div class="ctl-row"><span class="ctl-label">Gas</span><button type="button" data-gas="ng" aria-pressed="true">Natural gas<small>methane, lighter than air</small></button><button type="button" data-gas="lpg" aria-pressed="false">LPG<small>propane, heavier than air</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Leak</span><button type="button" data-leak="small" aria-pressed="false">Burner left on<small>no flame</small></button><button type="button" data-leak="big" aria-pressed="true">Hose off</button></div>
  <div class="ctl-row"><span class="ctl-label">Air</span><button type="button" data-vent="closed" aria-pressed="true">All shut</button><button type="button" data-vent="window" aria-pressed="false">Window open</button><button type="button" data-vent="hood" aria-pressed="false">Range hood on</button></div>
  <div class="ctl-row"><span class="ctl-label">Detector</span><button type="button" data-det="high" aria-pressed="true">Up high</button><button type="button" data-det="low" aria-pressed="false">Down low</button></div>
  ${meter("top", "Ceiling")}${meter("mid", "Switch")}${meter("low", "Floor")}
  <div class="ctl-row"><span class="ctl-label">Room</span><span id="stats"></span></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="gasb" aria-pressed="false">LEAVE THE GAS ON</button><button type="button" data-spark="switch">Flick the light</button><button type="button" data-spark="fridge">Fridge kicks in</button><button type="button" data-spark="stove">Igniter</button></div>
  <div class="ctl-row"><span class="ctl-label"></span><button type="button" id="reset">Reset</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
</div>`;


const foot = footHtml({
  theme, slug: "gas-leak",
  real: "methane 5 to 15 %, propane about 2.1 to 9.5 %, natural gas lighter than air and LPG heavier, odourised to be smelt at about a fifth of the LEL, natural gas detectors high and LPG ones low.",
  made: "the room, the leak rates, how it layers and mixes, the ventilation, the alarm level, the time-lapse (two and a half minutes a second) and the blast. If you smell gas: don't touch a switch, get out, call it in from outside.",
});
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), pageMk2({
  k, title: "Gas leak in the kitchen", fig: "Fig 18", hint: "Tap: flick the light", theme, W, H, stage, controls: CONTROLS, css: CSS, foot,
  caption: "Gas only burns in a band. Too little and there isn't enough fuel; too much and there isn't enough air. Methane burns between 5 and 15 %, propane between about 2 and 9.5 %. Natural gas is lighter than air and fills a room from the ceiling down; LPG is heavier and fills it from the floor up, which is why their detectors go in different places. Gas is odourised so you'll smell it at about a fifth of the lower limit, well before it can burn. Whatever sparks has to be inside the flammable layer to set it off: a light switch at chest height, a fridge thermostat near the floor. And a layer that's too rich to burn becomes flammable again the moment you start airing it out.",
  script: LIVE.replace("__DATA__", JSON.stringify(DATA)),
}));
console.log("wrote", name);
