import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { engineScript, stageHtml, pageMk2, footHtml } from "../../mk2/shell.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const W = 960, H = 600;

// Anchored on the Cree XLamp XP-G datasheet: Vf 2.9 V typ at 350 mA / 25 °C, 1500 mA max, Rth j-sp 4 °C/W,
// Tj max 150 °C, Vf tempco −2.1 mV/°C. The I-V fit, efficiency curve and the heat path below the solder point are toy values.
const MODEL = {
  v0: 2.795, slope: 0.077, rs: 0.3, i0: 0.35, tempco: -0.0021, iMax: 1.5, tjMax: 150, tjDead: 200, iDead: 2.4,
  rJsp: 4, rBoard: 1.5, tim: { paste: 0.5, none: 14 }, hs: { proper: 6, small: 18, none: 45 },
  wpe0: 0.47, droop: 2.0, wpeT: 0.002, ler: 330, tau: 1.8,
  bins: { low: -0.15, typ: 0, high: 0.15 },
};

const HS = { x: -60, y: -50, w: 120, d: 100 };
const Z_HS = 24, Z_HSB = 30;
const BOARD = { x: -34, y: -34, w: 68, d: 68 };
const Z_TIM = 30.5, Z_AL = 31.9, Z_DI = 32.3, Z_CU = 32.7, Z_SM = 33.0, Z_PAD = 33.5;
const PKG = { x: -16, y: -16, w: 32, d: 32 };
const Z_PKG = 37;
const DIE = { x: -8, y: -8, w: 16, d: 16 };
const Z_DIE = 41, Z_MQW0 = 38.6, Z_MQW1 = 39.2, Z_PH = 42;
const DOME_R = 15;
const START = { mode: "cc", ma: 700, volts: 3.05, bin: "typ", hs: "proper", tim: "paste", amb: 25 };
const PLATE = { x: -96, y: -80, w: 192, d: 160, r: 8 };
const P = k.fitProjection([...k.boxCorners(PLATE, -0.8, 0), [-60, -50, 62], [60, -50, 62], [60, 50, 32], [-60, 50, 32], [-88, 68, 14]], W, H, { pad: 12, azimuth: 45, elevation: 30 });
const DATA = { W, H, P, PLATE };
Object.assign(DATA, { MODEL, start: START, Z_DIE, Z_PH, Z_PKG, Z_MQW0, Z_MQW1, DIE, DOME_R, GEO: { HS, BOARD, PKG, Z_HS, Z_HSB, Z_TIM, Z_AL, Z_DI, Z_CU, Z_SM, Z_PAD } });
const LIVE = `
${engineScript()}
const D = __DATA__;
const stage = document.querySelector(".mk-stage");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lightTheme = document.body.dataset.theme === "light";
const E = mk2(stage, D.P, { W: D.W, H: D.H, pivot: [2, 2, 38], plate: { ...D.PLATE, h: 10, foot: 4 }, shadowBox: [-104, -88, -16, 104, 88, 70] });
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
let mode = D.start.mode, ma = D.start.ma, volts = D.start.volts, bin = D.start.bin, hs = D.start.hs, tim = D.start.tim, amb = D.start.amb;
let on = true, tj = amb, brown = 0, dead = false, popAt = -10, thermal = false, zoom = false, current = ma / 1000;
let frame = 0, last = 0, now = 0, visible = false, touring = true, slow = false, tourClock = 0, tourStep = -1, tourEnd = 0, lastShot = "";

// the LED: V(I, Tj) from the fit; in constant-voltage mode, solve for I
const vOf = (i, t) => M.v0 + M.bins[bin] + M.slope * Math.log(Math.max(i, 1e-6) / M.i0) + M.rs * i + M.tempco * (t - 25);
function iOf(v, t) { let lo = 1e-6, hi = 6; for (let n = 0; n < 50; n++) { const m = (lo + hi) / 2; if (vOf(m, t) > v) hi = m; else lo = m; } return (lo + hi) / 2; }
const wpe = (i, t) => clamp(M.wpe0 / (1 + i / M.droop) * (1 - M.wpeT * (t - 25)), 0.05, 0.6);
const rTotal = () => M.rJsp + M.rBoard + M.tim[tim] + M.hs[hs];
function state() {
  if (!on || dead) return { i: 0, v: 0, p: 0, heat: 0, flux: 0, eff: 0 };
  const i = mode === "cc" ? ma / 1000 : iOf(volts, tj);
  const v = vOf(i, tj);
  const p = v * i, w = wpe(i, tj);
  const flux = M.ler * w * p * (1 - 0.65 * brown);
  return { i, v, p, heat: p * (1 - w), flux, eff: p > 0 ? flux / p : 0 };
}

function step(dt) {
  const s0 = state();
  current = s0.i;
  const target = amb + s0.heat * rTotal();
  tj += (target - tj) * (1 - Math.exp(-dt / M.tau));
  if (!dead) {
    if (tj > M.tjMax) brown = Math.min(1, brown + dt * (tj - M.tjMax) / 140);
    if (tj > M.tjDead || current > M.iDead) { dead = true; popAt = now; say(mode === "cv" && current > M.iMax ? "Pop. On a fixed voltage the current ran away: hotter die, lower Vf, more current, hotter die. It went past " + M.iMax * 1000 + " mA and the bond wire fused. That's why LEDs get a constant-current driver." : "Pop. The junction hit " + Math.round(tj) + " °C, way past its " + M.tjMax + " °C limit, and the die let go. The heat had nowhere to go."); }
  }
}

const ui = {
  mode: [...document.querySelectorAll("[data-mode]")], drive: document.querySelector("#drive"), driveOut: document.querySelector("#drive-out"), driveLab: document.querySelector("#drive-lab"),
  bin: [...document.querySelectorAll("[data-bin]")], hs: [...document.querySelectorAll("[data-hs-btn]")], tim: [...document.querySelectorAll("[data-tim-btn]")],
  amb: document.querySelector("#amb"), ambOut: document.querySelector("#amb-out"),
  iFill: document.querySelector("#i-fill"), iOut: document.querySelector("#i-out"), tFill: document.querySelector("#t-fill"), tOut: document.querySelector("#t-out"),
  stats: document.querySelector("#stats"),
  power: document.querySelector("#power"), therm: document.querySelector("#therm"), zoom: document.querySelector("#zoom"), fresh: document.querySelector("#fresh"), slow: document.querySelector("#slow"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"),
};
const sliding = {};
function syncUi(s) {
  ui.mode.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  if (mode === "cc") { ui.drive.min = 0; ui.drive.max = 2000; ui.drive.step = 10; if (!sliding.drive) ui.drive.value = ma; ui.driveOut.textContent = ma + " mA"; ui.driveLab.textContent = "Current"; }
  else { ui.drive.min = 2.6; ui.drive.max = 3.6; ui.drive.step = 0.01; if (!sliding.drive) ui.drive.value = volts; ui.driveOut.textContent = volts.toFixed(2) + " V"; ui.driveLab.textContent = "Voltage"; }
  ui.bin.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.bin === bin)));
  ui.hs.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.hsBtn === hs)));
  ui.tim.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.timBtn === tim)));
  if (!sliding.amb) ui.amb.value = amb; ui.ambOut.textContent = amb + " °C";
  ui.iFill.style.width = (clamp(s.i / 2.5, 0, 1) * 100).toFixed(1) + "%"; ui.iFill.dataset.state = s.i > M.iMax ? "bad" : "ok";
  ui.iOut.textContent = Math.round(s.i * 1000) + " mA";
  ui.tFill.style.width = (clamp((tj - 0) / 220, 0, 1) * 100).toFixed(1) + "%"; ui.tFill.dataset.state = tj > M.tjMax ? "bad" : tj > 120 ? "warn" : "ok";
  ui.tOut.textContent = Math.round(tj) + " °C";
  ui.stats.innerHTML = dead ? "<b>DEAD</b> · open circuit" : !on ? "off" : "<b>" + s.v.toFixed(2) + " V</b> · " + s.p.toFixed(2) + " W in · <b>" + Math.round(s.flux) + " lm</b> · " + Math.round(s.eff) + " lm/W · " + (s.heat / Math.max(s.p, 1e-6) * 100).toFixed(0) + " % heat";
  ui.power.setAttribute("aria-pressed", String(on)); ui.power.textContent = on ? "OFF" : "ON";
  ui.therm.setAttribute("aria-pressed", String(thermal));
  ui.zoom.setAttribute("aria-pressed", String(zoom)); ui.zoom.textContent = zoom ? "Whole thing" : "Zoom to die";
  ui.slow.setAttribute("aria-pressed", String(slow));
  ui.tour.setAttribute("aria-pressed", String(touring));
}
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };
// ---------------- the LED, layer by layer, in real 3D ----------------
const TAU = Math.PI * 2, G = D.GEO, HS = G.HS, BD = G.BOARD, PK = G.PKG, DIE = D.DIE;
// everything is drawn with its front quarter missing when the x-ray's on, so you can read the stack like a section
const lRing = ({ x, y, w, d }) => [[x, y], [x + w, y], [x + w, 0], [0, 0], [0, y + d], [x, y + d]];
const quarter = ({ x, y, w, d }) => [[0, 0], [x + w, 0], [x + w, y + d], [0, y + d]];
function layer(plan, z0, z1, col, o = {}) { return [prism(lRing(plan), "z", z0, z1, col, { bevel: 0, ...o }), prism(quarter(plan), "z", z0, z1, col, { bevel: 0, ...o, xhide: true })]; }
// false colour for the thermal view: cold blue to hot white
const RAMP = [[25, "#2b5fd9"], [50, "#2bb3a8"], [80, "#8fd13a"], [110, "#ffd23a"], [150, "#ff5a1f"], [200, "#fff0e0"]];
function heatCol(t) { for (let i = 0; i < RAMP.length - 1; i++) if (t <= RAMP[i + 1][0]) return mixHex(RAMP[i][1], RAMP[i + 1][1], (t - RAMP[i][0]) / (RAMP[i + 1][0] - RAMP[i][0])); return RAMP[RAMP.length - 1][1]; }
function benchStatic() {
  const o = [], d = { x: -88, y: 34, w: 30, d: 34 };
  o.push(prism(rrect(d.x, d.x + d.w, d.y, d.y + d.d, 2.5), "z", 0, 12, "#2f3338", { mat: "plastic" }), box(d.x + 2, d.x + d.w - 2, d.y + 3, d.y + 20, 12, 12.3, "#e9e6df", { bevel: 0, mat: "matte" }));
  for (let i = 0; i < 6; i++) o.push(box(d.x + 4 + i * 4, d.x + 6 + i * 4, d.y + 24, d.y + 31, 12, 12.5, "#1d1f22", { bevel: 0 }));
  const wire = (y0, y1, col) => tube([[d.x + d.w, d.y + y0, 4], [-50, 22 + y0, 1.2], [-42, 10 + y1 * 2, 6], [-34, y1, G.Z_SM + 1.4], [-29, y1, G.Z_SM + 0.6]], 0.8, col, { seg: 6, mat: "plastic" });
  o.push(wire(8, -3, "#d0342c"), wire(14, 3, "#1c1d20"));
  return o;
}
function heatsinkParts(kind, tcol) {
  const o = [], AL = tcol || "#aab0b8", M2 = tcol ? { flat: true } : { mat: "satin" };
  if (kind === "none") { for (const [x, y] of [[-28, -28], [28, -28], [-28, 28], [28, 28]]) o.push(cyl(x, y, 3, 0, G.Z_TIM, "#e8e6e0", 16, { mat: "plastic" })); return o; }
  const finBot = kind === "proper" ? 0 : 14, n = kind === "proper" ? 13 : 7, pitch = HS.w / n;
  if (kind === "small") for (const [x, y] of [[-54, -44], [54, -44], [-54, 44], [54, 44]]) o.push(cyl(x, y, 2.6, 0, finBot, "#e8e6e0", 14, { mat: "plastic" }));
  for (let i = 0; i < n; i++) { const fx = HS.x + i * pitch + pitch / 2 - 1.2; o.push(box(fx, fx + 2.4, HS.y, HS.y + HS.d, finBot, G.Z_HS, AL, { ...M2, bevel: 0 })); }
  o.push(...layer(HS, G.Z_HS, G.Z_HSB, AL, M2));
  return o;
}
let zoomWas = false, fx = [];
function draw(dt = 0) {
  const s = state(), th = thermal, live = [], rn = Math.random;
  if (zoom !== zoomWas) { zoomWas = zoom; E.goal.zoom = zoom ? 3.4 : 1; }
  const tsp = amb + s.heat * (rTotal() - M.rJsp), tb = amb + s.heat * (rTotal() - M.rJsp - M.rBoard), ths = amb + s.heat * M.hs[hs] * 0.6;
  const T = (t, col, o = {}) => (th ? [heatCol(t), { flat: true }] : [col, o]);
  const L2 = (plan, z0, z1, t, col, o) => { const [c, oo] = T(t, col, o); live.push(...layer(plan, z0, z1, c, oo)); };
  // thermal paste (or a few high spots and a lot of air), then the board: aluminium, dielectric, copper, solder mask
  if (tim === "paste") L2(BD, G.Z_HSB, G.Z_TIM, (tb + ths) / 2, "#d9d9d4", { mat: "matte" });
  else for (const [x, y] of [[-26, -20], [-12, 14], [-22, 24], [8, -26], [-30, 4]]) live.push(cyl(x, y, 2.2, G.Z_HSB, G.Z_TIM, th ? heatCol(tb) : "#c9ced3", 10, { bevel: 0, flat: th }));
  L2(BD, G.Z_TIM, G.Z_AL, tb, "#b9bec4", { mat: "satin" });
  L2(BD, G.Z_AL, G.Z_DI, tb, "#e8dfc8", { mat: "matte" });
  L2({ x: -26, y: -26, w: 52, d: 52 }, G.Z_DI, G.Z_CU, tsp, "#c0703f", { mat: "copper" });
  L2(BD, G.Z_CU, G.Z_SM, tsp, "#f1efe9", { mat: "paint" });
  for (const [x, y] of [[-27, -27], [-27, 27], [27, -27]]) live.push(cyl(x, y, 2.8, G.Z_SM, G.Z_SM + 1.2, "#aeb4bb", 14, { mat: "steel" }));
  live.push(box(-31, -23, -6, -1, G.Z_SM, G.Z_SM + 0.4, "#c0703f", { mat: "copper", bevel: 0 }), box(-31, -23, 1, 6, G.Z_SM, G.Z_SM + 0.4, "#c0703f", { mat: "copper", bevel: 0 }));
  L2({ x: -13, y: -13, w: 26, d: 26 }, G.Z_SM, G.Z_PAD, tsp, "#c9ced3", { mat: "steel" });
  L2(PK, G.Z_PAD, D.Z_PKG, (tj + tsp) / 2, "#f4f2ec", { mat: "satin" });
  // the die: n-GaN, the quantum wells where the light is made, p-GaN; then the phosphor that turns blue into white
  const lit = !dead && on && s.i > 0, fluxK = clamp(s.flux / 420, 0, 1.4), burnt = dead ? "#1a1614" : null;
  L2(DIE, D.Z_PKG, D.Z_MQW0, tj, burnt || "#7f93b8", { mat: "gloss" });
  live.push(...layer(DIE, D.Z_MQW0, D.Z_MQW1, th ? heatCol(tj) : burnt || "#3d6bff", { flat: th, emit: lit && !th ? ["#4d7dff", 0.5 + 0.5 * Math.min(1, fluxK)] : undefined, emitK: 1.6 }));
  L2(DIE, D.Z_MQW1, D.Z_DIE, tj, burnt || "#9fb0d0", { mat: "gloss" });
  const phc = mixHex("#ecc93a", "#5a3a14", brown);
  live.push(...layer({ x: -9, y: -9, w: 18, d: 18 }, D.Z_DIE, D.Z_PH, th ? heatCol(tj) : phc, { mat: "matte", flat: th, emit: lit && !th ? [mixHex("#fff6d8", "#ffb060", brown), Math.min(1, 0.3 + fluxK * 0.5) * (1 - 0.5 * brown)] : undefined, emitK: 1.1 }));
  // gold bond wires from the die to the package
  const bw = (a, b) => { const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.max(a[2], b[2]) + 4], pts = []; for (let i = 0; i <= (dead ? 5 : 12); i++) { const t = i / 12; pts.push([(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * m[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * m[1] + t * t * b[1], (1 - t) ** 2 * a[2] + 2 * (1 - t) * t * m[2] + t * t * b[2]]); } return tube(pts, 0.28, dead ? "#3a2a14" : "#e2b53a", { seg: 5, mat: "gold", emit: lit && s.i > M.iMax ? ["#ff8a2a", clamp((s.i - M.iMax) / 0.9, 0, 1)] : undefined }); };
  live.push(bw([-6, -6, D.Z_PH], [-13, -13, D.Z_PKG]), bw([-6, 6, D.Z_PH], [-13, 13, D.Z_PKG]));
  // the clear silicone dome
  const dome = []; for (let i = 0; i <= 14; i++) { const a = (i / 14) * Math.PI / 2; dome.push([D.DOME_R * Math.cos(a), D.Z_PH + D.DOME_R * Math.sin(a)]); }
  live.push(lathe(dome, mixHex("#eaf4ff", "#c9a060", brown * 0.8), { c: [0, 0, 0], seg: 36, mat: "glass", opacity: 0.24 + 0.3 * brown, smooth: true }));
  const hcol = th ? heatCol(ths) : null;
  let svg = E.render([{ cache: "bench", rev: 0, parts: benchStatic }, { cache: "hs", rev: hs + (hcol || ""), parts: () => heatsinkParts(hs, hcol) }, { parts: live }]);
  // the light coming off it
  if (lit && !th) { const k2 = Math.min(1.2, fluxK) * (1 - 0.6 * brown), c = mixHex("#fff6e0", "#ffb060", brown); E.sprite([0, 0, D.Z_PH + 8], 20, c, 0.2 * k2, !lightTheme, 1); E.sprite([0, 0, D.Z_PH + 26], 60, c, (lightTheme ? 0.14 : 0.07) * k2, !lightTheme); }
  // electrons rise from the n side, holes sink from the p side, they meet in the quantum wells and leave a photon
  if (lit && E.xray > 0.3) { const n = Math.round(clamp(s.i / 0.1, 2, 24)), mq = (D.Z_MQW0 + D.Z_MQW1) / 2;
    for (let j = 0; j < n; j++) { const ph = (now * (0.6 + s.i * 0.8) + j * 0.618) % 1, x = 0.6 + ((j * 0.37) % 1) * (DIE.w / 2 - 1.2);
      E.sprite([x, 0.1, D.Z_PKG + (mq - D.Z_PKG) * ph], 0.3, "#7fb0ff", 0.95, true, 1); E.sprite([x + 0.3, 0.1, D.Z_DIE - (D.Z_DIE - mq) * ph], 0.3, "#ff7a6a", 0.95, true, 1);
      if (ph > 0.86) E.sprite([x + 0.15, 0.1, mq + (ph - 0.86) * 18], 0.4 + (ph - 0.86) * 3, "#ffffff", 1 - (ph - 0.86) * 5, true, 1); } }
  // the pop, and what comes off a cooked one
  if (now - popAt < 0.4) E.sprite([0, 0, D.Z_PH + 2], 14 + (now - popAt) * 60, "#fff1c4", Math.exp(-(now - popAt) / 0.12), true, 1);
  const smokeK = dead ? Math.max(0, 1 - (now - popAt) / 6) : brown > 0.3 && on ? brown * 0.6 : 0;
  if (smokeK > 0.02 && dt > 0 && rn() < dt * 16 * smokeK) fx.push({ p: [(rn() - 0.5) * 8, (rn() - 0.5) * 8, D.Z_PH + 14], v: [(rn() - 0.5) * 3, (rn() - 0.5) * 3, 8 + rn() * 6], life: 0, max: 2 + rn() * 2 });
  fx = fx.filter((p) => { p.life += dt; if (p.life > p.max) return false; const t = p.life / p.max; for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * dt; E.sprite(p.p, 3 + 9 * t, lightTheme ? "#55524e" : "#3a3836", 0.45 * (1 - t)); return true; });
  // lettering on the driver, and the layer names when the x-ray's on
  const m = E.faceMatrix([-85, 37.5, 12.35], [1, 0, 0], [0, 1, 0]);
  if (m) svg += '<g transform="' + m + '"><text class="pt lo" x="1" y="4.4" font-size="3.2">' + (mode === "cc" ? "CC DRIVER" : "CV SUPPLY") + '</text><text class="pt" x="1" y="11" font-size="5">' + (mode === "cc" ? ma + " mA" : volts.toFixed(2) + " V") + "</text></g>";
  if (E.xray > 0.02) svg += E.callouts([
    { p: [10, 0, D.Z_PH + 9], text: "Silicone dome", sub: "gets the light out" }, { p: [8.5, 0, (D.Z_DIE + D.Z_PH) / 2], text: "Phosphor", sub: "blue in, white out" }, { p: [7, 0, (D.Z_MQW0 + D.Z_MQW1) / 2], text: "The die", sub: "junction at " + Math.round(tj) + " °C" },
    { p: [15, 0, (G.Z_PAD + D.Z_PKG) / 2], text: "Ceramic package", sub: "4 °C/W down to the solder" }, { p: [0, 30, (G.Z_TIM + G.Z_SM) / 2], text: "Metal-core board", sub: "copper, dielectric, aluminium" },
    { p: [0, 46, hs === "none" ? 10 : G.Z_HS + 3], text: hs === "none" ? "No heatsink" : "Heatsink", sub: hs === "none" ? "standoffs and air" : Math.round(ths) + " °C" }, ...(th ? [] : [{ p: [-73, 51, 12.4], text: mode === "cc" ? "Constant current" : "Fixed voltage", sub: Math.round(s.i * 1000) + " mA through it" }]),
  ], E.xray, E.fs < 0.62 ? {} : { topL: 70, topR: 70 });
  if (sceneG.innerHTML !== svg) sceneG.innerHTML = svg;

  const text = dead ? "DEAD · open circuit" : !on ? "off" : (mode === "cc" ? ma + " mA set" : volts.toFixed(2) + " V set") + " · " + Math.round(s.i * 1000) + " mA · Tj " + Math.round(tj) + " °C · " + Math.round(s.flux) + " lm";
  if (readout.textContent !== text) readout.textContent = text;
  syncUi(s);
  if (dead) return;
  if (!on) { say("Off. Hit ON."); return; }
  if (tj > M.tjMax) say("Junction " + Math.round(tj) + " °C, past the " + M.tjMax + " °C max. The phosphor and silicone are browning: less light, and it's going yellow. Every minute up here eats its life.");
  else if (mode === "cv" && s.i > M.iMax * 0.8) say("Fixed voltage, " + Math.round(s.i * 1000) + " mA and climbing. As the die heats, Vf falls (−2.1 mV per °C), so the same voltage pushes more current, which heats it more…");
  else if (mode === "cv") say("Constant voltage: " + volts.toFixed(2) + " V gives " + Math.round(s.i * 1000) + " mA on a " + bin + "-Vf LED. An LED's current is exponential in voltage: a tenth of a volt is a big change in current. Try another bin.");
  else if (tim === "none" && tj > 90) say("No thermal paste: the board's touching the heatsink at a few high spots and the rest is air. Same LED, same current, " + Math.round(tj) + " °C at the junction.");
  else if (hs === "none" && tj > 90) say("No heatsink: about " + Math.round(s.heat / Math.max(s.p, 1e-6) * 100) + " % of the power in is heat, and it has nowhere to go but a bit of board.");
  else if (s.i > M.iMax) say("Over the " + M.iMax * 1000 + " mA max. More current is more light, but look at lm/W: efficiency droops at high current and the rest is heat.");
  else say("Constant current, " + ma + " mA: " + s.v.toFixed(2) + " V across it, " + Math.round(s.flux) + " lm at " + Math.round(s.eff) + " lm/W, junction " + Math.round(tj) + " °C. About " + Math.round(s.heat / Math.max(s.p, 1e-6) * 100) + " % of what goes in comes out as heat, not light.");
}

const TOUR = [
  { mode: "cc", ma: 700, hs: "proper", tim: "paste", hold: 6 },
  { mode: "cc", ma: 1400, hs: "proper", tim: "paste", hold: 5 },
  { mode: "cc", ma: 1000, hs: "proper", tim: "none", hold: 6, therm: true },
  { mode: "cv", volts: 3.12, bin: "typ", hs: "proper", tim: "paste", hold: 5 },
  { mode: "cv", volts: 3.12, bin: "low", hs: "proper", tim: "paste", hold: 5 },
  { mode: "cv", volts: 3.28, bin: "low", hs: "small", tim: "paste", hold: 9 },
];
function tick(t) {
  const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
  last = t;
  const sdt = dt * (slow ? 0.12 : 1);
  now += sdt;
  if (touring) {
    tourClock += dt;
    if (tourStep < 0 || tourClock > tourEnd) {
      tourStep = (tourStep + 1) % TOUR.length;
      const s = TOUR[tourStep];
      mode = s.mode; if (s.ma) ma = s.ma; if (s.volts) volts = s.volts; bin = s.bin || "typ"; hs = s.hs; tim = s.tim; thermal = !!s.therm;
      if (tourStep === 0) { tj = amb; brown = 0; dead = false; on = true; }
      if (dead) { dead = false; brown = 0; tj = amb; }
      tourEnd = tourClock + s.hold;
    }
  }
  step(sdt);
  draw(sdt);
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { touring = false; };
const g = (fn) => (...a) => { takeOver(); fn(...a); run(); };
const setMode = g((m) => { mode = m; });
const setDrive = g((v) => { if (mode === "cc") ma = clamp(Math.round(v / 10) * 10, 0, 2000); else volts = clamp(Math.round(v * 100) / 100, 2.6, 3.6); });
const setBin = g((b) => { bin = b; });
const setHs = g((h) => { hs = h; });
const setTim = g((t) => { tim = t; });
const setAmb = g((v) => { amb = clamp(Math.round(v), 0, 60); });
const togglePower = g(() => { on = !on; });
const fresh = g(() => { dead = false; brown = 0; tj = amb; on = true; say("Fresh LED off the reel."); });
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;

ui.mode.forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
ui.drive.addEventListener("input", () => { sliding.drive = true; setDrive(+ui.drive.value); });
ui.drive.addEventListener("change", () => { sliding.drive = false; run(); });
ui.bin.forEach((b) => b.addEventListener("click", () => setBin(b.dataset.bin)));
ui.hs.forEach((b) => b.addEventListener("click", () => setHs(b.dataset.hsBtn)));
ui.tim.forEach((b) => b.addEventListener("click", () => setTim(b.dataset.timBtn)));
ui.amb.addEventListener("input", () => { sliding.amb = true; setAmb(+ui.amb.value); });
ui.amb.addEventListener("change", () => { sliding.amb = false; run(); });
ui.power.addEventListener("click", togglePower);
ui.therm.addEventListener("click", () => { thermal = !thermal; run(); });
ui.zoom.addEventListener("click", () => { zoom = !zoom; run(); });
ui.fresh.addEventListener("click", fresh);
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; tourClock = 0; } run(); });
onTap(() => { zoom = !zoom; run(); });
stage.addEventListener("keydown", (ev) => {
  const step = mode === "cc" ? 50 : 0.02;
  const map = { x: () => { setX(!E.xrayOn); run(); }, ArrowUp: () => setDrive((mode === "cc" ? ma : volts) + step), ArrowDown: () => setDrive((mode === "cc" ? ma : volts) - step), m: () => setMode(mode === "cc" ? "cv" : "cc"), t: () => { thermal = !thermal; run(); }, z: () => { zoom = !zoom; run(); }, " ": togglePower, r: fresh, s: () => { slow = !slow; run(); } };
  if (map[ev.key]) { ev.preventDefault(); map[ev.key](); }
});
window.__fig = { E, freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
setX(true); draw();
`;

const CSS = `.pt{font-family:var(--anatomy-mono);fill:#23262b;font-weight:700}.pt.lo{fill:#5a6068;font-weight:600}`;

const stage = stageHtml({
  W, H, fig: "Fig 9", title: "How an LED works", xray: true,
  label: "A high-power white LED on its metal-core board and heatsink, with the driver beside it. An x-ray mode cuts a quarter away to show the section: aluminium heatsink, thermal paste, the board, the solder pad, the ceramic package, the die with its quantum wells, the phosphor and a clear silicone dome.",
  keysHelp: "LED: drag to rotate, X for the cutaway, up and down change the drive, M switches constant current and constant voltage, T thermal view, Z zoom, space on/off",
  extra: ``,
});

const CONTROLS = `<div class="ctl" role="group" aria-label="Test controls">
  <div class="ctl-row"><span class="ctl-label">Drive</span><button type="button" data-mode="cc" aria-pressed="true">Constant current<small>a proper LED driver</small></button><button type="button" data-mode="cv" aria-pressed="false">Constant voltage<small>a bench supply, no resistor</small></button></div>
  <div class="ctl-row"><span class="ctl-label" id="drive-lab">Current</span><div class="slide"><input id="drive" type="range" min="0" max="2000" step="10" value="${START.ma}" aria-label="Drive setting"></div><output id="drive-out">${START.ma} mA</output></div>
  <div class="ctl-row"><span class="ctl-label">Vf bin</span><button type="button" data-bin="low" aria-pressed="false">Low</button><button type="button" data-bin="typ" aria-pressed="true">Typical</button><button type="button" data-bin="high" aria-pressed="false">High</button></div>
  <div class="ctl-row"><span class="ctl-label">Heatsink</span><button type="button" data-hs-btn="proper" aria-pressed="true">Proper</button><button type="button" data-hs-btn="small" aria-pressed="false">Small</button><button type="button" data-hs-btn="none" aria-pressed="false">None</button><span class="ctl-label" style="min-width:0;margin-left:8px">Paste</span><button type="button" data-tim-btn="paste" aria-pressed="true">Yes</button><button type="button" data-tim-btn="none" aria-pressed="false">Forgot</button></div>
  <div class="ctl-row"><span class="ctl-label">Ambient</span><div class="slide"><input id="amb" type="range" min="0" max="60" step="1" value="${START.amb}" aria-label="Ambient temperature"></div><output id="amb-out">${START.amb} °C</output></div>
  <div class="ctl-row"><span class="ctl-label">Current</span><div class="meter"><span id="i-fill" class="fill"></span><span class="mark" style="left:${(1.5 / 2.5 * 100).toFixed(1)}%" data-label="1500 mA max"></span></div><output id="i-out">0 mA</output></div>
  <div class="ctl-row"><span class="ctl-label">Junction</span><div class="meter"><span id="t-fill" class="fill"></span><span class="mark" style="left:${(150 / 220 * 100).toFixed(1)}%" data-label="150 °C max"></span></div><output id="t-out">25 °C</output></div>
  <div class="ctl-row"><span class="ctl-label">Out</span><span id="stats"></span></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="power" aria-pressed="true">OFF</button><button type="button" id="therm" aria-pressed="false">Thermal view</button><button type="button" id="zoom" aria-pressed="false">Zoom to die</button><button type="button" id="fresh">New LED</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
</div>`;


const foot = footHtml({
  theme, slug: "led",
  real: "the Cree XLamp XP-G figures it is anchored on: Vf 2.9 V typical at 350 mA, 1500 mA max, 4 °C/W junction to solder point, 150 °C max junction, −2.1 mV/°C.",
  made: "the I-V fit, the efficiency curve, the light output, the heat path below the solder point and the timings.",
});
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), pageMk2({
  k, title: "How an LED works", fig: "Fig 9", hint: "Tap: zoom to the die", theme, W, H, stage, controls: CONTROLS, css: CSS, foot,
  caption: "Current pushes electrons up from the n side and holes down from the p side; where they meet, in the quantum wells, each pair can drop its energy as a blue photon, and the yellow phosphor turns some of that blue into the rest of white. Only part of the power comes out as light. The rest is heat at the junction, and it has to get out through the package, the board, the paste and the heatsink. Heat matters twice: a hot die makes less light and dies sooner, and its forward voltage drops about 2 mV per degree. On a fixed voltage that's a feedback loop: hotter, lower Vf, more current, hotter. That's why LEDs run on constant-current drivers.",
  script: LIVE.replace("__DATA__", JSON.stringify(DATA)),
}));
console.log("wrote", name);
