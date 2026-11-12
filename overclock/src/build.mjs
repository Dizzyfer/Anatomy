import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { engineScript, stageHtml, pageMk2, footHtml } from "../../mk2/shell.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const W = 960, H = 600;

// Truth: CPU power is roughly C·V²·f plus leakage, and leakage climbs with temperature, so heat makes more heat (thermal
// runaway). Each chip needs a bit more voltage for every step of clock until it hits a wall where the voltage needed shoots
// up; colder silicon pushes that wall out, which is why extreme overclockers use liquid nitrogen (boils at -196 °C).
// Chips vary (the silicon lottery), some stop working below a certain temperature (the cold bug), high voltage plus heat
// wears them out (electromigration), and an unstable overclock blue-screens, typically CLOCK_WATCHDOG_TIMEOUT or WHEA.
// Toy: every number in the model, the time scale (temperatures settle in seconds), the score, and the chip itself.
const PLATE = { x: -236, y: -150, w: 404, d: 290, r: 10 };
const P = k.fitProjection([...k.boxCorners(PLATE, -0.8, 0), [-80, -95, 182], [20, 5, 182], [-215, -115, 130], [-215, 115, 130], [176, -80, 0]], W, H, { pad: 20, azimuth: 45, elevation: 30 });
const DATA = { W, H, P, PLATE };
const pct = (t) => ((t + 200) / 380 * 100).toFixed(1);
const LIVE = `
${engineScript()}
const D = __DATA__;
const stage = document.querySelector(".mk-stage");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lightTheme = document.body.dataset.theme === "light";
const E = mk2(stage, D.P, { W: D.W, H: D.H, pivot: [-30, -10, 30], plate: { ...D.PLATE, h: 12, foot: 5 }, shadowBox: [-245, -160, -18, 180, 150, 270] });
const { box, cyl, prism, circle, lathe, tube, sphere, loft, roundPoly, rrect, tris } = E;
E.bindTools(stage);
const xbtn = stage.querySelector('[data-mk="xray"]');
const setX = (on) => { E.setXray(on); if (xbtn) xbtn.setAttribute("aria-pressed", String(on)); };
const sceneG = stage.querySelector('[data-part="scene"]');
const iso = (p) => E.project(p), depthOf = (p) => E.depthOf(p);
const shakeEls = [stage.querySelector(".mk-gl"), stage.querySelector(".mk-over")];
const setShake = (x, y) => { const t = x || y ? "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px)" : ""; for (const e of shakeEls) if (e.style.transform !== t) e.style.transform = t; };
const PR = D.P, S = [-30, -45], flashEl = stage.querySelector(".fx-flash");
const mon = { el: stage.querySelector(".mon"), scr: stage.querySelector(".mon-scr") };
// ---------------- the chip ----------------
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
function newChip(fixed) {
  const g1 = fixed !== undefined ? fixed : clamp((rnd() + rnd() + rnd() - 1.5) * 2, -2, 2);
  const cold = fixed !== undefined ? -260 : rnd() < 0.45 ? -105 - 70 * rnd() : -260;
  return { q: g1, v0: 1.18 - 0.025 * g1, wall: 5.55 + 0.15 * g1, coldBug: cold, grade: g1 > 0.9 ? "golden" : g1 < -0.9 ? "a dud" : "about average", health: 1 };
}
let chip = newChip(0.6);
// what the chip needs to run a clock without errors, colder is better
function vmin(f, T) {
  const t = clamp(T, -196, 110), wall = chip.wall + 0.0085 * (70 - t);
  return chip.v0 + 0.085 * (f - 4.5) + 0.03 * Math.exp((f - wall) / 0.3);
}
const LOADS = { idle: { k: 0.06, name: "idle" }, game: { k: 0.45, name: "gaming" }, render: { k: 1.0, name: "rendering" }, avx: { k: 1.35, name: "an AVX stress test" } };
const COOLERS = { stock: { Rth: 0.42, name: "the stock cooler" }, tower: { Rth: 0.26, name: "a big tower cooler" }, aio: { Rth: 0.2, name: "a 240 mm liquid cooler" }, ln2: { Rth: 0.07, name: "a liquid nitrogen pot" } };

// ---------------- settings and state ----------------
let mult = 45, vset = 1.25, cooler = "tower", load = "render", safe = true, potSet = -185;
let T = 40, Tv = 35, potT = 25, throttle = 0, P = 0, I = 0, veff = 1.25, fEff = 4.5;
let mode = "run", modeAt = 0, why = "", stop = "", runProg = 0, runF = 0, runT = 0, lastScore = 0, best = 0, overI = 0;
let now = 0, last = 0, frame = 0, visible = false, touring = true, slow = false, tourClock = 0, tourStep = -1, actions = [];
let boomAt = null, debris = [], fanA = 0, hue = 0, lastShot = "", lastEvent = "", lastEventAt = -10, pour = 0;
const event = (t) => { lastEvent = t; lastEventAt = now; };
const setMode = (m, w = "", code = "") => { mode = m; modeAt = now; why = w; stop = code; if (m !== "run") runProg = 0; };

const PCB = "#1d2329", BLK = "#24272c", ALU = "#b3b9c0", CU = "#c8794a", GREY = "#5d636b", SLOT = "#2a2d32";
function hslHex(h) { const f = (n) => { const k2 = (n + h / 30) % 12, a = 0.9 * Math.min(0.6, 0.4); const c = 0.6 - a * Math.max(-1, Math.min(k2 - 3, 9 - k2, 1)); return Math.round(c * 255).toString(16).padStart(2, "0"); }; return "#" + f(0) + f(8) + f(4); }
// fans: blades drawn as thin prisms, spun in their plane
function blades(axis, cu, cv2, w0, w1, rh, rt, ang, col, n = 7) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = ang + (i / n) * Math.PI * 2, pt = (r, b) => [cu + r * Math.cos(b), cv2 + r * Math.sin(b)];
    out.push(prism([pt(rh, a - 0.22), pt(rt, a + 0.05), pt(rt, a + 0.55), pt(rh, a + 0.25)], axis, w0, w1, col));
  }
  return out;
}
// ---------------- the board ----------------
const TAU = Math.PI * 2;
const PL = { mat: "plastic" }, MT = { mat: "metal" };
function staticBoard() {
  const o = [], [sx, sy] = S;
  o.push(prism(rrect(-150, 150, -120, 120, 4), "z", 0, 2.2, "#14272f", { cap: "#183540", mat: "satin" }));
  // traces, as fine copper under the soldermask
  const tr = (pts) => o.push(tube(pts.map((p) => [p[0], p[1], 2.25]), 0.42, "#2f7386", { seg: 3, mat: "satin" }));
  for (let i = 0; i < 10; i++) tr([[sx + 26, sy - 20 + 4 * i], [10 + 2 * i, sy - 20 + 4 * i], [26 + 2 * i, sy - 36 + 4 * i], [26 + 2 * i, -112]]);
  for (let i = 0; i < 8; i++) tr([[sx - 20 + 5 * i, sy + 30], [sx - 20 + 5 * i, 18 + i * 0.5], [sx - 30 + 5 * i, 22]]);
  for (let i = 0; i < 6; i++) tr([[-30 + 8 * i, 64], [-30 + 8 * i, 92], [10 + 8 * i, 112]]);
  for (let i = 0; i < 5; i++) tr([[75, 30 + 6 * i], [125, 30 + 6 * i], [130, 34 + 6 * i]]);
  for (let i = 0; i < 6; i++) tr([[-118, 30 + 7 * i], [-140, 52 + 7 * i]]);
  // mounting holes
  for (const [x, y] of [[-143, -113], [143, -113], [-143, 113], [143, 113], [0, -113], [0, 113], [143, 0], [-60, 113]]) o.push(lathe([[1.6, 2.2], [1.6, 2.6], [3.4, 2.6], [3.4, 2.2]], "#b9bfc6", { c: [x, y, 0], seg: 14, mat: "steel" }));
  // rear I/O shroud and the ports behind it
  o.push(box(-150, -124, -120, 20, 2, 42, "#30353c", { cap: "#3d434b", ...PL }), box(-152, -149, -116, 16, 5, 40, "#8b9199", MT));
  for (let i = 0; i < 5; i++) o.push(box(-124.4, -123.8, -112 + i * 26, -92 + i * 26, 30, 31.5, "#191b1f", { bevel: 0 }));
  // PCIe slots with their latches, the M.2 heatsink between them
  for (const y of [25, 75]) o.push(box(-122, -32, y, y + 7, 2, 13, SLOT, PL), box(-121, -33, y + 2.6, y + 4.4, 12.6, 13.2, "#0d0e10", { bevel: 0 }), box(-30, -24, y + 0.5, y + 6.5, 2, 15, "#c8ccd2", PL), box(-122, -33, y - 1.2, y - 0.4, 2, 12, "#aeb4bb", { ...MT, bevel: 0 }));
  o.push(box(-112, -22, 46, 60, 2, 8, "#59616b", { cap: "#6b737d", mat: "satin" }));
  for (let i = 0; i < 7; i++) o.push(box(-106 + i * 12, -104.6 + i * 12, 47, 59, 8, 8.5, "#272b31", { bevel: 0 }));
  // chipset heatsink, finned
  o.push(box(18, 70, 58, 110, 2, 9, "#4a5059", { mat: "satin" }));
  for (let i = 0; i < 9; i++) o.push(box(20 + i * 5.6, 23 + i * 5.6, 60, 108, 9, 14, "#6b737d", { mat: "satin" }));
  // 24-pin and SATA down the edge, battery, EPS at the top corner, debug display bezel
  o.push(box(132, 142, -84, -24, 2, 17, "#22252a", PL), box(133.5, 140.5, -82.5, -25.5, 16.4, 17.2, "#0f1012", { bevel: 0 }));
  for (let i = 0; i < 3; i++) o.push(box(134, 146, 28 + i * 12, 37 + i * 12, 2, 11, "#22252a", PL));
  o.push(lathe([[0, 5.2], [9.4, 5.2], [10, 4.6], [10, 2.2]], "#cdd2d8", { c: [92, 22, 0], seg: 24, mat: "chrome" }), box(80, 84, 18, 26, 2.2, 6, "#22252a", PL));
  o.push(box(-140, -122, -118, -104, 2, 14, "#22252a", PL));
  o.push(box(106, 138, 86, 106, 2, 5, "#111214", PL));
  // RAM slots
  for (let i = 0; i < 4; i++) { const x = 30 + 14 * i; o.push(box(x, x + 7, -110, 23, 2, 9, SLOT, PL), box(x, x + 7, -113, -110, 2, 12, "#c8ccd2", PL), box(x, x + 7, 23, 26, 2, 12, "#c8ccd2", PL)); }
  // the socket: frame, retention arm, and the chip's lid (glass in x-ray, so you can see the die)
  o.push(box(sx - 24, sx + 24, sy - 28, sy + 28, 2, 5.6, "#6d737b", { ...MT }), box(sx - 20, sx + 20, sy - 23, sy + 23, 5.6, 6.6, "#2b2f35", { bevel: 0 }));
  o.push(tube([[sx + 26, sy - 26, 6.5], [sx + 26, sy + 20, 6.5], [sx + 22, sy + 26, 6.5]], 0.9, "#c9ced3", { seg: 5, mat: "steel" }));
  o.push(box(sx - 16, sx + 16, sy - 18, sy + 18, 6.6, 9, "#c9ced3", { mat: "steel", shell: true }));
  // little passives, because a bare board looks wrong
  for (let i = 0; i < 26; i++) { const x = -110 + ((i * 53) % 230), y = -90 + ((i * 97) % 190); if (Math.abs(x - sx) < 34 && Math.abs(y - sy) < 36) continue; if (x > 26 && x < 90 && y < 28) continue; if (x < -20 && y > 20) continue; o.push(box(x, x + 2.6, y, y + 1.4, 2.2, 3.2, i % 3 ? "#8a7a5e" : "#1b1c1f", { bevel: 0 })); }
  for (const [x, y] of [[100, -100], [112, -100], [100, -88], [88, 40], [100, 52], [-10, 30], [2, 30]]) o.push(cyl(x, y, 3, 2.2, 9, "#2c2236", 12, PL), cyl(x, y, 3.02, 8.6, 9.3, "#b9bfc6", 12, MT));
  // the cables: 24-pin loom off the side, EPS off the back
  for (let i = 0; i < 6; i++) { const y = -80 + i * 10.4; o.push(tube([[138, y, 15], [150, y, 22], [164, y - 3, 14], [176, y - 8, -2]], 2.4, i % 2 ? "#1c1d20" : "#26282c", { seg: 6, mat: "rubber" })); }
  for (let i = 0; i < 3; i++) { const x = -137 + i * 5.5; o.push(tube([[x, -111, 12], [x, -126, 16], [x - 2, -142, 8], [x - 3, -154, -4]], 2.2, i % 2 ? "#26282c" : "#1c1d20", { seg: 6, mat: "rubber" })); }
  return o;
}
function buildStatic() {}
let VRM = null;
function makeVrm() {
  const HS = "#59616b", fin = (a) => ({ ...a });
  const left = [box(-114, -92, -108, 10, 7, 18, HS, { ...MT, shell: true })], top = [box(-88, 22, -120, -100, 7, 18, HS, { ...MT, shell: true })];
  for (let i = 0; i < 7; i++) left.push(box(-113.4 + i * 3.2, -111.6 + i * 3.2, -108, 10, 18, 34, "#6b737d", { mat: "satin", shell: true }));
  for (let i = 0; i < 6; i++) top.push(box(-88, 22, -119.4 + i * 3.5, -117.6 + i * 3.5, 18, 34, "#6b737d", { mat: "satin", shell: true }));
  const hs = [{ parts: left, hot: true }, { parts: top, hot: true }];
  const chokes = [];
  for (let i = 0; i < 9; i++) chokes.push({ parts: [box(-88, -78, -101 + 12 * i, -91 + 12 * i, 2, 10, "#4f555d", { cap: "#7a8088", ...MT })] });
  for (let i = 0; i < 8; i++) chokes.push({ parts: [box(-74 + 12 * i, -64 + 12 * i, -96, -86, 2, 10, "#4f555d", { cap: "#7a8088", ...MT })] });
  const caps = [-106, -96, -86, -76].map((x) => ({ parts: [cyl(x, 22, 4, 2, 13, "#2c2236", 16, PL), cyl(x, 22, 4.05, 12.2, 13.2, "#b9bfc6", 16, MT)] }));
  VRM = { hs, chokes, caps };
}
makeVrm();
function ram() {
  const out = [];
  for (let i = 0; i < 4; i++) {
    const x = 31.5 + 14 * i, h = (hue + i * 25) % 360;
    out.push({ parts: [box(x, x + 4, -108, 21, 9, 40, "#2d3036", { cap: "#3a3e45", mat: "metal" }), box(x + 0.4, x + 3.6, -104, 17, 12, 30, "#1b1d21", { bevel: 0 }), box(x - 0.3, x + 4.3, -108, 21, 40, 45, "#dfe5ec", { emit: [hslHex(h), 0.9], emitK: 1.25, mat: "plastic" })] });
  }
  return out;
}
const HOT = "#ff5a1f", FROST = "#f2f7ff";
function fanFrame(axis, cu, cv2, w0, w1, half, col) {
  // a square frame with a round hole: four corner webs and four rails
  const out = [], t = 5, h = half;
  for (const [a, b, c, d] of [[cu - h, cu + h, cv2 - h, cv2 - h + t], [cu - h, cu + h, cv2 + h - t, cv2 + h], [cu - h, cu - h + t, cv2 - h + t, cv2 + h - t], [cu + h - t, cu + h, cv2 - h + t, cv2 + h - t]]) out.push(prism([[a, c], [b, c], [b, d], [a, d]], axis, w0, w1, col, PL));
  for (const [su, sv] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) out.push(prism([[cu + su * (h - t), cv2 + sv * (h - t)], [cu + su * (h - t - 14), cv2 + sv * (h - t)], [cu + su * (h - t), cv2 + sv * (h - t - 14)]], axis, w0, w1, col, PL));
  return out;
}
function coolerObjs() {
  const [sx, sy] = S, out = [], heat = clamp((T - 65) / 60, 0, 0.8);
  if (cooler === "stock") {
    const core = [cyl(sx, sy, 15, 9, 36, "#a7adb5", 20, { glow: [HOT, heat * 0.7], ...MT })];
    for (let i = 0; i < 28; i++) { const a = (i / 28) * TAU, c = Math.cos(a), s = Math.sin(a), w = 0.9; core.push(prism([[sx + c * 14 - s * w, sy + s * 14 + c * w], [sx + c * 44 - s * w, sy + s * 44 + c * w], [sx + c * 44 + s * w, sy + s * 44 - c * w], [sx + c * 14 + s * w, sy + s * 14 - c * w]], "z", 10, 36, "#a7adb5", { glow: [HOT, heat * 0.6], ...MT, bevel: 0, shell: true })); }
    out.push({ parts: core });
    out.push({ parts: [lathe([[44, 36], [47.5, 36], [47.5, 45], [44, 45], [44, 36]], "#202226", { c: [sx, sy, 0], seg: 32, closed: true, ...PL }), lathe([[47.7, 39], [47.7, 42]], "#333", { c: [sx, sy, 0], seg: 32, emit: [hslHex(hue % 360), 0.95], emitK: 2.4 })] });
    out.push({ parts: [...blades("z", sx, sy, 41, 43, 13, 42.5, fanA, "#3a3e44"), cyl(sx, sy, 13, 39.5, 45.5, "#141518", 20, PL)], mat: "plastic" });
  } else if (cooler === "tower") {
    out.push({ parts: [box(sx - 20, sx + 20, sy - 20, sy + 20, 9, 17, CU, { glow: [HOT, heat], mat: "copper" })] });
    out.push({ parts: [-15, -5, 5, 15].map((d) => cyl(sx + d, sy, 3.2, 17, 153, CU, 12, { glow: [HOT, heat * 0.7], mat: "copper" })) });
    const fins = [];
    for (let z = 48; z < 149; z += 3.4) fins.push(box(sx - 55, sx + 55, sy - 22, sy + 22, z, z + 1.1, "#c4cad1", { mat: "satin", bevel: 0, shell: true, glow: [HOT, heat * 0.35 * (1 - (z - 48) / 140)] }));
    fins.push(box(sx - 56, sx + 56, sy - 23, sy + 23, 150, 155, "#26292e", { ...PL, shell: true }));
    out.push({ parts: fins });
    const fy0 = sy + 23, fy1 = sy + 48;
    out.push({ parts: [...fanFrame("y", sx, 98, fy0, fy1, 55, "#202226"), ...blades("y", sx, 98, fy0 + 9, fy0 + 12, 15, 49, -fanA, "#4a4f56"), prism(circle(sx, 98, 15, 18), "y", fy0 + 6, fy0 + 15, "#1d1f23", PL), prism(circle(sx, 98, 6, 14), "y", fy0 + 15, fy0 + 15.6, "#333", { emit: [hslHex(hue % 360), 0.9], emitK: 2 })], mat: "plastic" });
  } else if (cooler === "aio") {
    out.push({ parts: [prism(rrect(sx - 30, sx + 30, sy - 30, sy + 30, 8), "z", 9, 30, "#1d1f22", { cap: "#2a2d31", ...PL, shell: true }), cyl(sx, sy, 19, 30, 31.5, "#333", 24, { emit: [hslHex(hue % 360), 0.95], emitK: 2.4 }), cyl(sx, sy, 13, 31.5, 32.2, "#1a1b1e", 20, PL), box(sx - 20, sx + 20, sy - 20, sy + 20, 9, 13, CU, { mat: "copper", glow: [HOT, heat] })] });
    // tubes from the pump to the radiator
    const hose = (dy) => { const pts = []; for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push([sx - 30 + (-189 - sx + 30) * t, sy + dy + (dy * 3 - sy - dy) * t * t, 22 + 95 * Math.sin((t * Math.PI) / 2) ** 1.4]); } return tube(pts, 5, "#18191c", { seg: 10, mat: "rubber" }); };
    out.push({ parts: [hose(-12), hose(12), cyl(sx - 30, sy - 12, 6.5, 14, 30, "#8b9199", 10, MT), cyl(sx - 30, sy + 12, 6.5, 14, 30, "#8b9199", 10, MT)] });
  } else if (cooler === "ln2") {
    const fr = clamp((-20 - potT) / 140, 0, 0.85), lvl = clamp((-potT - 40) / 150, 0, 1) * 96;
    out.push({ parts: [prism(rrect(sx - 58, sx + 58, sy - 58, sy + 58, 6), "z", 2.2, 13, "#131416", { glow: [FROST, fr * 0.7], mat: "rubber" })] });
    out.push({ parts: [cyl(sx, sy, 22, 9, 40, CU, 28, { glow: [FROST, fr * 0.8], mat: "copper" })] });
    out.push({ parts: [lathe([[34, 36], [34, 170], [37, 170], [37, 176], [28, 176], [28, 42], [0, 42]], "#aeb5bd", { c: [sx, sy, 0], seg: 40, glow: [FROST, fr], mat: "steel", shell: true })] });
    if (lvl > 2) out.push({ parts: [cyl(sx, sy, 27.6, 42, 42 + lvl, "#cfe6ff", 28, { emit: ["#9cd2ff", 0.2 + 0.15 * pour], emitK: 0.7, opacity: 0.75, mat: "water", bevel: 0 })] });
  }
  return out;
}
function radiatorObjs() {
  if (cooler !== "aio") return [];
  const core = [box(-216, -190, -112, 112, 0, 126, "#2b2e33", { cap: "#3a3e44", ...MT }), box(-218, -188, -116, -104, 0, 128, "#1d1f22", PL), box(-218, -188, 104, 116, 0, 128, "#1d1f22", PL)];
  for (let i = 0; i < 26; i++) core.push(box(-216.6, -215.8, -102 + i * 8, -98.5 + i * 8, 4, 122, "#565c64", { bevel: 0 }));
  const out = [{ parts: core }];
  for (const yc of [-52, 52]) out.push({ parts: [...fanFrame("x", yc, 63, -190, -165, 56, "#1d1f22"), ...blades("x", yc, 63, -180, -177, 14, 50, fanA * 0.9, "#454a51"), prism(circle(yc, 63, 14, 18), "x", -184, -172, "#16171a", PL), prism(circle(yc, 63, 6, 14), "x", -172, -171.4, "#333", { emit: [hslHex((hue + 60) % 360), 0.9], emitK: 2 })], mat: "plastic" });
  return out;
}
function vrmObjs() {
  const vh = clamp((Tv - 80) / 60, 0, 0.9), out = [];
  if (!VRM) return out;
  VRM.hs.forEach((o) => { if (!o.gone) out.push({ parts: o.parts.map((p) => ({ ...p, glow: [HOT, vh] })) }); });
  VRM.chokes.forEach((o) => { if (!o.gone) out.push({ parts: o.parts.map((p) => ({ ...p, glow: [HOT, vh * 0.6] })) }); });
  VRM.caps.forEach((o) => { if (!o.gone) out.push(o); });
  // the power stages under the heatsinks: what's actually getting hot
  const k2 = clamp((Tv - 45) / 90, 0, 1), fets = [];
  if (boomAt === null) { for (let i = 0; i < 9; i++) fets.push(box(-108, -98, -103 + 12 * i, -95 + 12 * i, 2.2, 6, "#17181b", { bevel: 0, emit: k2 > 0.03 ? [HOT, k2] : undefined })); for (let i = 0; i < 8; i++) fets.push(box(-73 + 12 * i, -65 + 12 * i, -116, -105, 2.2, 6, "#17181b", { bevel: 0, emit: k2 > 0.03 ? [HOT, k2] : undefined })); }
  out.push({ parts: fets });
  return out;
}
// the two-digit debug display, in real segments
const SEG = { 0: "abcdef", 1: "bc", 2: "abged", 3: "abgcd", 4: "fgbc", 5: "afgcd", 6: "afgedc", 7: "abc", 8: "abcdefg", 9: "abcdfg", "-": "g", d: "bcdeg", C: "adef", F: "aefg", " ": "" };
const SEGBOX = { a: [1, 7, 11, 12.4], b: [6.6, 8, 6.4, 11.6], c: [6.6, 8, 0.8, 6], d: [1, 7, 0, 1.4], e: [0, 1.4, 0.8, 6], f: [0, 1.4, 6.4, 11.6], g: [1, 7, 5.5, 6.9] };
function debugObjs(code) {
  const parts = [], s = String(code).padStart(2, " ").slice(-2);
  for (let n = 0; n < 2; n++) { const on = SEG[s[n]] ?? "", x0 = 110.5 + n * 13; for (const k2 of "abcdefg") { const [u0, u1, v0, v1] = SEGBOX[k2], lit = on.includes(k2); parts.push(box(x0 + u0, x0 + u1, 102.5 - v1, 102.5 - v0, 5, 5.5, lit ? "#ff4a3d" : "#2a1211", { bevel: 0, flat: lit, emit: lit ? ["#ff4a3d", 1] : undefined, emitK: 2.6 })); } }
  return { parts };
}

// ---------------- particles ----------------
let parts = [];
function puff(kind, x, y, z, s = 1) { const p = { kind, p: [x, y, z], v: [0, 0, 0], life: 0, max: 1, s }; parts.push(p); return p; }
function smoke(x, y, z, s = 1) { const p = puff("smoke", x, y, z, s); p.v = [(rnd() - 0.5) * 12, (rnd() - 0.5) * 12, 22 + rnd() * 20]; p.max = 2.5 + rnd() * 1.5; }
function spark(x, y, z, s = 1) { const p = puff("spark", x, y, z, s); const a = rnd() * TAU, sp = 60 + rnd() * 170; p.v = [Math.cos(a) * sp, Math.sin(a) * sp, 90 + rnd() * 240]; p.max = 0.6 + rnd() * 0.7; }
function fog(x, y, z) { const p = puff("fog", x, y, z, 1); const a = rnd() * TAU; p.v = [Math.cos(a) * (8 + rnd() * 22), Math.sin(a) * (8 + rnd() * 22), -6 - rnd() * 10]; p.max = 1.8 + rnd() * 1.4; }
function haze(x, y, z) { const p = puff("haze", x, y, z, 1); p.v = [(rnd() - 0.5) * 5, (rnd() - 0.5) * 5, 18 + rnd() * 10]; p.max = 1.4 + rnd(); }
function drawParticles(dt) {
  parts = parts.filter((p) => (p.life += dt) < p.max);
  for (const p of parts) {
    const t = p.life / p.max, o = [p.p[0], p.p[1], p.p[2]];
    if (p.kind === "spark") p.v[2] -= 520 * dt;
    if (p.kind === "fog") { p.v[2] -= 26 * dt; if (p.p[2] < 6) { p.p[2] = 6; p.v[2] = 0; } }
    for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * dt;
    if (p.kind === "spark" && p.p[2] < 2) { p.p[2] = 2; p.v[2] *= -0.35; }
    if (p.kind === "smoke") E.sprite(p.p, (9 + 34 * t) * p.s, "#3c3c40", 0.55 * (1 - t));
    if (p.kind === "spark") E.line(o, p.p, 2.2, t < 0.5 ? "#ffe6a0" : "#ff8a3a", 1 - t, true);
    if (p.kind === "fog") E.sprite(p.p, 11 + 26 * t, lightTheme ? "#b9c6d4" : "#ecf4ff", (lightTheme ? 0.5 : 0.36) * Math.sin(Math.PI * t));
    if (p.kind === "haze") E.sprite(p.p, 9 + 8 * t, "#ff9a60", (lightTheme ? 0.16 : 0.12) * Math.sin(Math.PI * t), !lightTheme, 1);
  }
  // the pour: a thin stream of LN2 into the pot
  if (cooler === "ln2" && pour > 0.05 && mode !== "dead") E.line([S[0] + 8, S[1] + 4, 150], [S[0] + 8, S[1] + 4, 262], 1.5 + 3 * clamp(pour, 0, 1), lightTheme ? "#9cc4ee" : "#e1f0ff", clamp(pour, 0, 0.85), !lightTheme);
}

// ---------------- the boom ----------------
function boom() {
  boomAt = now; setMode("dead", "boom", "");
  const fc = iso([-95, -60, 30]); flashEl.style.setProperty("--fx", (fc[0] / D.W * 100).toFixed(1) + "%"); flashEl.style.setProperty("--fy", (fc[1] / D.H * 100).toFixed(1) + "%");
  chip.health = 0;
  debris = [];
  const fling = (o, sp) => {
    o.gone = true;
    const p = o.parts[0], r = p.ring, cu = r.reduce((s2, q2) => s2 + q2[0], 0) / r.length, cv3 = r.reduce((s2, q2) => s2 + q2[1], 0) / r.length;
    const c = p.axis === "z" ? [cu, cv3, (p.w0 + p.w1) / 2] : [0, 0, 0];
    const a = rnd() * Math.PI * 2;
    debris.push({ parts: o.parts, c, v: [Math.cos(a) * sp * (0.4 + rnd()), Math.sin(a) * sp * (0.4 + rnd()) - 60, 380 + 420 * rnd()], w: [rnd() * 14 - 7, rnd() * 14 - 7, rnd() * 10 - 5], off: [0, 0, 0], rot: [0, 0, 0], rest: false });
  };
  VRM.hs.forEach((o) => fling(o, 120));
  VRM.chokes.forEach((o, i) => { if (i % 2 === 0 || i > 12) fling(o, 260); });
  VRM.caps.forEach((o) => fling(o, 300));
  for (let i = 0; i < 70; i++) spark(-90 + rnd() * 100, -100 + rnd() * 90, 20, 1);
  for (let i = 0; i < 26; i++) smoke(-95 + rnd() * 90, -110 + rnd() * 110, 20 + rnd() * 20, 1.4);
}
function rotate(p, r) {
  let [x, y, z] = p;
  let c = Math.cos(r[0]), s = Math.sin(r[0]); [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(r[1]); s = Math.sin(r[1]); [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(r[2]); s = Math.sin(r[2]); [x, y] = [x * c - y * s, x * s + y * c];
  return [x, y, z];
}
function debrisObjs(dt) {
  return debris.map((d) => {
    if (!d.rest) {
      d.v[2] -= 1300 * dt;
      for (let i = 0; i < 3; i++) { d.off[i] += d.v[i] * dt; d.rot[i] += d.w[i] * dt; }
      if (d.c[2] + d.off[2] < 4 && d.v[2] < 0) { d.v[2] *= -0.3; d.v[0] *= 0.6; d.v[1] *= 0.6; d.w = d.w.map((w) => w * 0.5); if (Math.abs(d.v[2]) < 40) { d.rest = true; } }
    }
    return { parts: d.parts, xf: (p) => { const r2 = rotate([p[0] - d.c[0], p[1] - d.c[1], p[2] - d.c[2]], d.rot); return [r2[0] + d.c[0] + d.off[0], r2[1] + d.c[1] + d.off[1], r2[2] + d.c[2] + d.off[2]]; } };
  });
}

// ---------------- physics ----------------
function physics(dt) {
  const f = mult / 10;
  const running = mode === "run";
  const L0 = running ? LOADS[load].k : mode === "bsod" || mode === "post" ? 0.05 : 0;
  // cooler temperature: everything sinks into the room, except the pot, which you keep topping up
  let Tc = 25, Rth = COOLERS[cooler].Rth;
  if (cooler === "ln2") { const target = potSet + P * 0.012; potT += (target - potT) * Math.min(1, dt / 1.8); Tc = potT; pour = clamp(0.15 + P / 450 + Math.max(0, potT - potSet) / 40, 0, 1); } else { potT += (25 - potT) * Math.min(1, dt / 3); pour = 0; }
  if (safe && T > 95) throttle = Math.min(f - 0.8, throttle + 0.6 * dt); else if (T < 92) throttle = Math.max(0, throttle - 0.4 * dt);
  if (!safe) throttle = 0;
  fEff = Math.max(0.8, f - throttle);
  veff = vset - 0.0002 * I;
  const on = mode !== "off" && mode !== "dead";
  const leak = on ? 12 * vset * Math.exp((clamp(T, -200, 250) - 50) / 45) : 0;
  P = on ? 8 * (L0 > 0 ? 1 : 0) + L0 * 17.8 * veff * veff * fEff + leak : 0;
  I = P / Math.max(0.5, veff);
  T += (Tc + P * Rth - T) * Math.min(1, dt / 1.6);
  Tv += (30 + I * 0.18 - Tv) * Math.min(1, dt / 3);
  // wear: high voltage plus heat
  if (on && chip.health > 0) {
    const cold = T < -40 ? 0.05 : 1;
    chip.health -= dt * 0.00012 * Math.exp((vset - 1.45) / 0.05) * Math.exp((clamp(T, -100, 140) - 70) / 20) * cold;
    if (T > 175) chip.health -= dt * 0.3;
    if (chip.health <= 0) { chip.health = 0; setMode("dead", "cooked"); event("Magic smoke. Too much voltage and heat for too long and the chip's wiring wore through. It's dead."); for (let i = 0; i < 18; i++) smoke(S[0] + rnd() * 30 - 15, S[1] + rnd() * 30 - 15, 40, 1); }
  }
  if (!running) return;
  // the safeties
  if (safe && T > 115) { setMode("off", "thermtrip", "THERMTRIP"); event("THERMTRIP: the chip hit 115 °C and pulled the plug on itself. That's the last line of defence."); return; }
  if (safe && I > 300) { setMode("off", "ocp", "OCP"); event("Over-current: the VRM saw " + Math.round(I) + " A and shut down before anything melted."); return; }
  if (!safe) { if (I > 280) overI += dt; else overI = Math.max(0, overI - dt); if (overI > 0.4) { event("The VRM was pushing " + Math.round(I) + " A with no over-current limit. Something had to give."); boom(); return; } }
  if (T < chip.coldBug) { setMode("off", "coldbug", "COLD BUG"); event("Cold bug: this chip just stops working below about " + Math.round(chip.coldBug) + " °C. Let the pot warm up a bit."); return; }
  // stability: short on voltage and it errors, sooner or later
  const d = vmin(fEff, T) - veff;
  const rate = (0.15 + LOADS[load].k) * 0.05 * Math.exp(d / 0.01);
  if (d > 0.15 || rnd() < rate * dt) { setMode("bsod", "crash", rnd() < 0.5 ? "CLOCK_WATCHDOG_TIMEOUT" : "WHEA_UNCORRECTABLE_ERROR"); event("Blue screen. At " + fEff.toFixed(2) + " GHz this chip wanted about " + vmin(fEff, T).toFixed(2) + " V and got " + veff.toFixed(2) + " V under load."); return; }
  // the render benchmark
  if (load === "render") {
    runProg += dt * fEff / (4.5 * 8); runF += fEff * dt; runT += dt;
    if (runProg >= 1) { lastScore = Math.round((runF / runT) * 2950); best = Math.max(best, lastScore); runProg = 0; runF = 0; runT = 0; event("Render done: " + lastScore.toLocaleString("en-AU") + " points" + (lastScore >= best ? ", a new best." : ".")); }
  } else { runProg = 0; runF = 0; runT = 0; }
}
function modes() {
  const t = now - modeAt;
  if (mode === "bsod" && t > 3) setMode("post");
  if (mode === "post" && t > 1.2) { const d = vmin(mult / 10, T) - vset; if (d > 0.15) { setMode("off", "nopost", "NO POST"); event("It won't even boot at " + (mult / 10).toFixed(1) + " GHz on " + vset.toFixed(2) + " V. Back off the clock or add voltage."); } else setMode("run"); }
  if (mode === "off" && t > 3 && why !== "nopost") { if (why === "thermtrip" && T > 60) return; setMode("post"); }
  if (mode === "off" && why === "nopost" && vmin(mult / 10, T) - vset <= 0.15) setMode("post");
  if (boomAt !== null && now - boomAt > 6) { boomAt = null; debris = []; makeVrm(); buildStatic(); chip = newChip(touring ? 0.6 : undefined); safe = true; T = 30; Tv = 30; overI = 0; mult = 45; vset = 1.25; load = "render"; if (cooler === "ln2") cooler = "tower"; actions = []; setMode("post"); event("New board, new chip, BIOS back to defaults. Safeties on."); }
  if (mode === "dead" && why === "cooked" && t > 4 && boomAt === null) { chip = newChip(touring ? 0.6 : undefined); setMode("post"); event("New chip. This one's " + chip.grade + "."); }
}

// ---------------- drawing ----------------
function draw(dt) {
  fanA += dt * (4 + clamp((T - 30) / 50, 0, 1) * 9) * (mode === "off" || mode === "dead" ? 0 : 1);
  hue = (hue + dt * 40) % 360;
  const [sx, sy] = S, live = [];
  // the die under the lid: this is the thing all the fuss is about
  const dieHot = clamp((T - 40) / 90, 0, 1), dieCold = clamp((-T) / 150, 0, 1), on = mode !== "off" && mode !== "dead";
  live.push(box(sx - 9, sx + 9, sy - 7, sy + 7, 6.6, 7.8, mode === "dead" && why === "cooked" ? "#1a1412" : "#3b4350", { bevel: 0, mat: "gloss", emit: !on ? undefined : dieCold > 0.05 ? ["#9cd2ff", 0.3 + 0.5 * dieCold] : ["#ff6a1f", 0.15 + 0.85 * dieHot], emitK: 2.4 }));
  // I/O shroud light strip
  live.push(box(-124.6, -123.6, -116, 16, 36, 38.5, "#333", { bevel: 0, emit: on ? [hslHex((hue + 180) % 360), 0.9] : undefined, emitK: 2.2 }));
  const code = mode === "run" ? (T < 0 ? "-" + Math.min(9, Math.round(-T / 20)) : String(Math.min(99, Math.round(T))).padStart(2, "0")) : mode === "bsod" ? "8d" : mode === "post" ? "19" : mode === "dead" ? "00" : why === "coldbug" ? "C0" : why === "nopost" ? "00" : "FF";
  const objs = [{ cache: "board", rev: 0, parts: staticBoard }, ...radiatorObjs(), ...vrmObjs(), ...ram(), ...coolerObjs(), ...debrisObjs(dt), { parts: live }, debugObjs(code)];
  let svg = E.render(objs);
  // effects
  if (cooler === "ln2" && mode !== "dead" && rnd() < dt * (8 + 30 * pour)) { const a = rnd() * TAU; fog(sx + Math.cos(a) * 34, sy + Math.sin(a) * 34, 176); }
  if (cooler === "ln2" && potT < -60 && rnd() < dt * 6) { const a = rnd() * TAU; fog(sx + Math.cos(a) * 60, sy + Math.sin(a) * 60, 14); }
  if (cooler !== "ln2" && T > 75 && rnd() < dt * (T - 70) * 0.25) haze(sx + (rnd() - 0.5) * 60, sy + (rnd() - 0.5) * 40, cooler === "tower" ? 158 : 48);
  if (Tv > 110 && rnd() < dt * 3) smoke(-100 + rnd() * 20, -100 + rnd() * 100, 36, 0.6);
  if (mode === "dead" && why === "cooked" && rnd() < dt * 5) smoke(sx + rnd() * 20 - 10, sy + rnd() * 20 - 10, 40, 0.8);
  drawParticles(dt);
  if (E.xray > 0.02) {
    const top = cooler === "tower" ? { p: [sx + 15, sy, 120], text: "Heat pipes", sub: "carry it up into the fins" } : cooler === "aio" ? { p: [sx, sy, 12], text: "Cold plate", sub: "water takes it to the radiator" } : cooler === "ln2" ? { p: [sx, sy, 70], text: "Liquid nitrogen", sub: "boils at -196 °C" } : { p: [sx + 30, sy, 24], text: "Fins", sub: "all the stock cooler has" };
    svg += E.callouts([{ p: [sx, sy, 8], text: "The die", sub: Math.round(T) + " °C, " + Math.round(P) + " W" }, top, { p: [-103, -55, 6], text: "Power stages", sub: Math.round(I) + " A, " + Math.round(Tv) + " °C" }, { p: [55, -40, 45], text: "Memory", sub: "just here for the lights" }], E.xray, E.fs < 0.62 ? {} : { topL: 190 });
  }
  if (sceneG.innerHTML !== svg) sceneG.innerHTML = svg;
  // shake and flash
  const bt = boomAt === null ? 9 : now - boomAt;
  if (bt < 0.6) setShake((rnd() - 0.5) * 14 * (1 - bt / 0.6), (rnd() - 0.5) * 14 * (1 - bt / 0.6)); else setShake(0, 0);
  flashEl.style.opacity = bt < 0.5 ? String((1 - bt / 0.5) * 0.9) : "0";
  monitor();
  const text = mode === "run" ? fEff.toFixed(2) + " GHz · " + veff.toFixed(3) + " V · " + Math.round(T) + " °C · " + Math.round(P) + " W" : mode === "bsod" ? "BLUE SCREEN" : mode === "post" ? "REBOOTING" : mode === "dead" ? (why === "boom" ? "VRM GONE" : "DEAD") : "SHUT DOWN: " + stop;
  if (readout.textContent !== text) readout.textContent = text;
}

function monitor() {
  let html, cls;
  if (mode === "bsod") { cls = "bsod"; html = '<div class="sad">:(</div><div>Your PC ran into a problem and needs to restart.</div><div class="code">Stop code: ' + stop + "</div>"; }
  else if (mode === "post") { cls = "post"; html = "<div>BIOS</div><div>" + (mult / 10).toFixed(1) + " GHz · " + vset.toFixed(2) + " V</div><div>booting</div>"; }
  else if (mode === "off" || mode === "dead") { cls = "off"; html = "<div>No signal</div>" + (mode === "dead" ? "<div class=code>" + (why === "boom" ? "smells like a burnt VRM" : "smells like a dead CPU") + "</div>" : ""); }
  else {
    cls = "desk";
    const job = load === "render" ? '<div>render.exe</div><div class="bar"><i style="width:' + (runProg * 100).toFixed(1) + '%"></i></div><div>last ' + (lastScore ? lastScore.toLocaleString("en-AU") : "-") + " · best " + (best ? best.toLocaleString("en-AU") : "-") + "</div>" : load === "game" ? "<div>game.exe</div><div class=big>" + Math.round(fEff * 31) + " fps</div>" : load === "avx" ? "<div>stress.exe (AVX)</div><div class=big>hammering it</div>" : "<div>desktop</div><div class=big>idle</div>";
    html = job + '<div class="dim">' + fEff.toFixed(2) + " GHz · " + Math.round(T) + " °C</div>";
  }
  const key = cls + html;
  if (mon.key !== key) { mon.key = key; mon.scr.className = "mon-scr " + cls; mon.scr.innerHTML = html; }
}

// ---------------- UI ----------------
const ui = {
  mult: document.querySelector("#mult"), multOut: document.querySelector("#mult-out"), volt: document.querySelector("#volt"), voltOut: document.querySelector("#volt-out"),
  pot: document.querySelector("#pot"), potOut: document.querySelector("#pot-out"), potRow: document.querySelector("#pot-row"),
  cool: [...document.querySelectorAll("[data-cool]")], load: [...document.querySelectorAll("[data-load]")], safe: document.querySelector("#safe"),
  chipB: document.querySelector("#chip"), stock: document.querySelector("#stock"), slow: document.querySelector("#slow"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"),
  tFill: document.querySelector("#t-fill"), tOut: document.querySelector("#t-out"), pFill: document.querySelector("#p-fill"), pOut: document.querySelector("#p-out"),
  mFill: document.querySelector("#m-fill"), mOut: document.querySelector("#m-out"), hFill: document.querySelector("#h-fill"), hOut: document.querySelector("#h-out"), stats: document.querySelector("#stats"),
};
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };
function syncUi() {
  ui.mult.value = String(mult); ui.volt.value = vset.toFixed(3); ui.pot.value = String(potSet);
  ui.multOut.textContent = "×" + mult + " · " + (mult / 10).toFixed(1) + " GHz"; ui.voltOut.textContent = vset.toFixed(3) + " V"; ui.potOut.textContent = potSet + " °C";
  ui.potRow.hidden = cooler !== "ln2";
  ui.cool.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cool === cooler)));
  ui.load.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.load === load)));
  ui.safe.setAttribute("aria-pressed", String(!safe)); ui.safe.textContent = safe ? "Safeties on" : "Safeties OFF";
  ui.tFill.style.left = "0"; ui.tFill.style.width = (clamp((T + 200) / 380, 0, 1) * 100).toFixed(1) + "%"; ui.tFill.dataset.state = T > 95 ? "bad" : T > 80 ? "warn" : T < -20 ? "cold" : "ok";
  ui.tOut.textContent = Math.round(T) + " °C";
  ui.pFill.style.width = (clamp(I / 400, 0, 1) * 100).toFixed(1) + "%"; ui.pFill.dataset.state = I > 300 ? "bad" : I > 220 ? "warn" : "ok";
  ui.pOut.textContent = Math.round(P) + " W · " + Math.round(I) + " A";
  const m = veff - vmin(fEff, T), on = mode === "run";
  ui.mFill.style.width = (clamp((m + 0.1) / 0.2, 0, 1) * 100).toFixed(1) + "%"; ui.mFill.dataset.state = !on ? "off" : m < 0 ? "bad" : m < 0.03 ? "warn" : "ok";
  ui.mOut.textContent = on ? (m >= 0 ? "+" : "") + Math.round(m * 1000) + " mV" : "-";
  ui.hFill.style.width = (chip.health * 100).toFixed(1) + "%"; ui.hFill.dataset.state = chip.health < 0.3 ? "bad" : chip.health < 0.7 ? "warn" : "ok";
  ui.hOut.textContent = Math.round(chip.health * 100) + " %";
  ui.stats.innerHTML = "This chip is <b>" + chip.grade + "</b> · " + (throttle > 0.05 ? "<b>throttling</b> to " + fEff.toFixed(2) + " GHz · " : "") + "score last <b>" + (lastScore ? lastScore.toLocaleString("en-AU") : "-") + "</b>, best <b>" + (best ? best.toLocaleString("en-AU") : "-") + "</b>";
  ui.slow.setAttribute("aria-pressed", String(slow)); ui.tour.setAttribute("aria-pressed", String(touring));
}
function story() {
  if (now - lastEventAt < 5.5 && lastEvent) return say(lastEvent);
  if (touring && tourStep >= 0 && TOUR[tourStep].say) return say(TOUR[tourStep].say);
  if (mode !== "run") return;
  const m = veff - vmin(fEff, T);
  if (throttle > 0.05) return say("It's hit 95 °C and is pulling its own clock down to stay there. More clock on this cooler just means more heat, not more speed.");
  if (cooler === "ln2" && T < -100) return say("At " + Math.round(T) + " °C the silicon switches faster and leaks less, so the voltage it needs for each step of clock drops off. That's the whole point of the pot.");
  if (m < 0) return say("Short on voltage by about " + Math.round(-m * 1000) + " mV under this load. It'll fall over any second now.");
  if (vset > 1.45 && T > 60 && chip.health < 1) return say("High voltage plus heat wears the chip out. Watch the health bar: that's electromigration, and it doesn't grow back.");
  if (m < 0.03) return say("Right on the edge: stable for now, maybe not for an hour of rendering.");
  return say(mult === 45 && Math.abs(vset - 1.25) < 0.01 ? "Stock: 4.5 GHz on 1.25 V. Bump the clock, add voltage when it blue-screens, and chase the score. Every chip is different." : "Stable with " + Math.round(m * 1000) + " mV to spare. Power goes up with voltage squared, so that spare voltage is costing you heat.");
}
const TOUR = [
  { say: "Stock: 4.5 GHz on 1.25 V on a tower cooler, running a render. Note the score.", acts: [[0, () => { chip = newChip(0.6); cooler = "tower"; mult = 45; vset = 1.25; load = "render"; safe = true; potSet = -185; setMode("run"); }], [11, null]] },
  { say: "Clock up to 5.3 GHz, same voltage. It doesn't have enough juice for that.", acts: [[0, () => { mult = 53; }], [9, null]] },
  { say: "Add voltage: 1.37 V. Stable again, faster, and a lot hotter.", acts: [[0, () => { vset = 1.37; setMode("post"); }], [12, null]] },
  { say: "Now 5.8 GHz on 1.50 V. The tower can't move the heat fast enough.", acts: [[0, () => { mult = 58; vset = 1.5; }], [11, null]] },
  { say: "Liquid nitrogen. Pot at -185 °C, 7.8 GHz on 1.62 V. Keep pouring.", acts: [[0, () => { cooler = "ln2"; potT = -60; T = -40; mult = 78; vset = 1.62; setMode("post"); }], [15, null]] },
  { say: "Safeties off, back on the stock cooler, 5.8 GHz on 1.75 V, AVX stress test. Don't do this at home.", acts: [[0, () => { cooler = "stock"; potT = 25; T = 45; mult = 58; vset = 1.75; load = "avx"; safe = false; setMode("run"); }], [14, null]] },
];
function tourTick() {
  if (tourStep < 0 || !actions.length) {
    if (boomAt !== null) return;
    tourStep = (tourStep + 1) % TOUR.length;
    actions = TOUR[tourStep].acts.map(([w, fn]) => [tourClock + w, fn]);
  }
  while (actions.length && tourClock >= actions[0][0]) { const fn = actions.shift()[1]; if (fn) fn(); else actions = []; }
}
function tick(t) {
  const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
  last = t;
  const sdt = dt * (slow ? 0.2 : 1);
  now += sdt;
  if (touring) { tourClock += sdt; tourTick(); }
  physics(sdt); modes(); draw(sdt); syncUi(); story();
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { if (touring) { touring = false; actions = []; tourStep = -1; } };
const act = (fn) => (...a) => { takeOver(); fn(...a); syncUi(); run(); };
ui.mult.addEventListener("input", act(() => { mult = +ui.mult.value; if (mode === "off" && why === "nopost") setMode("post"); }));
ui.volt.addEventListener("input", act(() => { vset = +ui.volt.value; }));
ui.pot.addEventListener("input", act(() => { potSet = +ui.pot.value; }));
ui.cool.forEach((b) => b.addEventListener("click", act(() => { cooler = b.dataset.cool; if (cooler === "ln2") potT = Math.min(potT, 0); })));
ui.load.forEach((b) => b.addEventListener("click", act(() => { load = b.dataset.load; runProg = 0; })));
ui.safe.addEventListener("click", act(() => { safe = !safe; overI = 0; }));
ui.chipB.addEventListener("click", act(() => { if (boomAt !== null) return; chip = newChip(); best = 0; lastScore = 0; setMode("post"); event("New chip from the box. This one's " + chip.grade + ". Same settings might not work now."); }));
ui.stock.addEventListener("click", act(() => { mult = 45; vset = 1.25; safe = true; load = "render"; if (mode !== "dead") setMode("post"); }));
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; actions = []; } syncUi(); run(); });
stage.addEventListener("keydown", (ev) => {
  const map = { x: () => setX(!E.xrayOn), ArrowUp: () => { mult = Math.min(95, mult + 1); }, ArrowDown: () => { mult = Math.max(30, mult - 1); }, ArrowRight: () => { vset = Math.min(2, vset + 0.01); }, ArrowLeft: () => { vset = Math.max(0.9, vset - 0.01); },
    "1": () => { cooler = "stock"; }, "2": () => { cooler = "tower"; }, "3": () => { cooler = "aio"; }, "4": () => { cooler = "ln2"; potT = Math.min(potT, 0); } };
  if (map[ev.key]) { ev.preventDefault(); act(map[ev.key])(); }
  if (ev.key === "s") { slow = !slow; run(); }
});
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;
window.__fig = { E, freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
draw(0); syncUi(); story();
`;

const CSS = `.fx-flash{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(circle 46% at var(--fx,30%) var(--fy,38%),#fff6dc 0%,#ffcf8a 40%,rgba(255,160,80,0) 100%)}
.mon{left:14px;top:50px;width:23%;max-width:210px;min-width:128px;aspect-ratio:16/10;background:#0c0d0f;border:3px solid #2a2c30;border-radius:6px;padding:0;overflow:visible}
.mon::after{content:"";position:absolute;left:42%;right:42%;bottom:-10px;height:7px;background:#2a2c30;border-radius:0 0 3px 3px}
.mon-scr{position:absolute;inset:0;padding:6% 7%;font-family:var(--anatomy-mono);font-size:10px;line-height:1.35;color:#cfd6de;overflow:hidden;border-radius:3px}
.mon-scr.bsod{background:#0d6bd2;color:#fff;font-family:system-ui,sans-serif}.mon-scr.bsod .sad{font-size:22px;line-height:1.1;margin-bottom:3px}.mon-scr .code{opacity:.8;margin-top:4px;font-size:8.5px}
.mon-scr.desk{background:linear-gradient(160deg,#16324a,#0d1a26)}.mon-scr.post{background:#000;color:#9aa4ad}.mon-scr.off{background:#000;color:#666;display:flex;flex-direction:column;justify-content:center;align-items:center}
.mon-scr .bar{height:6px;background:#26384a;border-radius:3px;margin:4px 0;overflow:hidden}.mon-scr .bar i{display:block;height:100%;background:#3ddc84}
.mon-scr .big{font-size:15px;margin:3px 0;color:#fff}.mon-scr .dim{opacity:.6;margin-top:3px}
.ctl #safe[aria-pressed="true"]{color:#ff6a3d;border-color:#ff6a3d}
@media (max-width:560px){.mon{top:auto;min-width:112px}.mon-scr{font-size:7.5px}.mon-scr.bsod .sad{font-size:15px}}`;

const stage = stageHtml({
  W, H, fig: "Fig 20", title: "Overclocking a CPU", xray: true,
  label: "A desktop motherboard on a test bench: the CPU socket with a cooler on it, the power stages beside the socket, memory, slots and a debug display. The cooler can be swapped between a stock cooler, a tower air cooler, a liquid cooler with a radiator, and a liquid nitrogen pot. An x-ray mode shows the die under the lid, the heat pipes and the power stages under their heatsinks.",
  keysHelp: "Overclocking bench: drag to rotate, X for x-ray, up and down change the multiplier, left and right the voltage, 1 to 4 pick the cooler",
  extra: `<div class="mk-inset mon" aria-hidden="true"><div class="mon-scr desk"></div></div><div class="fx-flash" aria-hidden="true"></div>`,
});

const CONTROLS = `<div class="ctl" role="group" aria-label="Controls">
  <div class="ctl-row"><span class="ctl-label">Clock</span><div class="slide"><input id="mult" type="range" min="30" max="95" step="1" value="45" aria-label="CPU multiplier, times 100 MHz"></div><output id="mult-out">×45</output></div>
  <div class="ctl-row"><span class="ctl-label">Vcore</span><div class="slide"><input id="volt" type="range" min="0.9" max="2" step="0.005" value="1.25" aria-label="Core voltage"></div><output id="volt-out">1.250 V</output></div>
  <div class="ctl-row"><span class="ctl-label">Cooler</span><button type="button" data-cool="stock">Stock<small>box cooler</small></button><button type="button" data-cool="tower" aria-pressed="true">Tower<small>big air</small></button><button type="button" data-cool="aio">240 AIO<small>liquid</small></button><button type="button" data-cool="ln2">LN2 pot<small>-196 °C</small></button></div>
  <div class="ctl-row" id="pot-row" hidden><span class="ctl-label">Pot</span><div class="slide"><input id="pot" type="range" min="-190" max="-30" step="5" value="-185" aria-label="Pot temperature to hold"></div><output id="pot-out">-185 °C</output></div>
  <div class="ctl-row"><span class="ctl-label">Load</span><button type="button" data-load="idle">Idle</button><button type="button" data-load="game">Gaming</button><button type="button" data-load="render" aria-pressed="true">Render<small>scores</small></button><button type="button" data-load="avx">AVX stress<small>hottest</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Temp</span><div class="meter"><span id="t-fill" class="fill"></span><span class="mark" style="left:${pct(95)}%" data-label="95 throttle"></span><span class="mark l" style="left:${pct(-196)}%" data-label=""></span></div><output id="t-out">40 °C</output></div>
  <div class="ctl-row"><span class="ctl-label">Power</span><div class="meter"><span id="p-fill" class="fill"></span><span class="mark l" style="left:75%" data-label="300 A limit"></span></div><output id="p-out">0 W</output></div>
  <div class="ctl-row"><span class="ctl-label">Margin</span><div class="meter"><span id="m-fill" class="fill"></span><span class="mark" style="left:50%" data-label="crash"></span></div><output id="m-out">-</output></div>
  <div class="ctl-row"><span class="ctl-label">Health</span><div class="meter"><span id="h-fill" class="fill"></span></div><output id="h-out">100 %</output></div>
  <div class="ctl-row"><span class="ctl-label">Chip</span><span id="stats"></span></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="safe" aria-pressed="false">Safeties on</button><button type="button" id="chip">New chip<small>silicon lottery</small></button><button type="button" id="stock">Back to stock</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
</div>`;


const foot = footHtml({
  theme, slug: "overclock",
  real: "power going with voltage squared times clock, leakage rising with temperature, the voltage wall, cold pushing it out, liquid nitrogen at -196 °C, the silicon lottery, the cold bug, throttling and a thermal trip at the top end, over-current protection on the VRM, voltage droop under load, CLOCK_WATCHDOG_TIMEOUT and WHEA blue screens, and high voltage plus heat wearing a chip out. The real frequency record is about 9.2 GHz, set in 2026 on liquid helium.",
  made: "the chip, every number in the model, the score, and the time scale (temperatures settle in seconds, a render takes eight). Don't put 1.65 V through your own CPU.",
});
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), pageMk2({
  k, title: "Overclocking a CPU", fig: "Fig 20", hint: "Clock up, voltage up, don't cook it", theme, W, H, stage, controls: CONTROLS, css: CSS, foot,
  caption: "A CPU runs at a multiplier times a 100 MHz base clock. Push the multiplier and each transistor has less time to switch, so it needs more voltage to switch faster; give it too little and it makes errors, which on Windows means a blue screen. Power goes up with the clock and with the square of the voltage, and a hot chip leaks more, so heat makes more heat. Past a point every chip hits a wall where the voltage it needs shoots up. Cold pushes that wall out, which is why the record runs are done on liquid nitrogen. Every chip is a bit different, and high voltage plus heat slowly wears them out.",
  script: LIVE.replace("__DATA__", JSON.stringify(DATA)),
}));
console.log("wrote", name);
