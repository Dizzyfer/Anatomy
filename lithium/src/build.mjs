import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { engineScript, stageHtml, pageMk2, footHtml } from "../../mk2/shell.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const W = 960, H = 600;

// Truth (roughly, and it varies a lot cell to cell): SEI breaks down from about 70 to 90 °C; PE separators melt around 130 to 140 °C;
// cobalt and nickel-rich cathodes run away somewhere around 150 to 200 °C, LFP around 250 °C; hot spots reach about 800 °C.
// NMC charges to 4.2 V, LFP to about 3.6 V. Less charge means less energy to release (that's why cells ship at 30 % or less).
// Toy: every rate, the heat model, the propagation, the timings and the overcharge curve.
const CHEM = {
  nmc: { name: "NMC", sei: 80, sep: 130, vent: 150, tr: 180, peak: 800, vmax: 4.2, ocv: [[0, 3.0], [0.1, 3.45], [0.3, 3.6], [0.5, 3.7], [0.8, 3.95], [1, 4.2], [1.2, 4.6], [1.5, 5.1]] },
  lfp: { name: "LFP", sei: 80, sep: 130, vent: 170, tr: 250, peak: 450, vmax: 3.6, ocv: [[0, 2.5], [0.1, 3.2], [0.3, 3.27], [0.5, 3.3], [0.9, 3.35], [1, 3.6], [1.2, 4.3], [1.5, 5.0]] },
};
const MODEL = {
  amb: 25, tauCool: 120, selfA: 0.04, selfB: 22, short: 3.2, burn: 4, tauDead: 25, tauPeak: 0.5,
  couple: { touch: 0.03, gap: 0.014, barrier: 0.001 }, flame: { touch: 4, gap: 2.8, barrier: 0.2 },
  chargeRate: 0.03, oc0: 0.1, oc: 40, heater: 8, nail: 110, tauNail: 3,
};

const COLS = 4, ROWS = 3, N = COLS * ROWS, TRIG = N - 1;
const RC = 9, ZB = 4, ZT = 69;
const PACK = [22, 6];
const PITCH = { touch: 18.6, gap: 25, barrier: 25 };
const CHG = { x: -64, y: 24, w: 26, d: 20 };
const BMS = { x: -62, y: -30, w: 22, d: 40 };
const posOf = (i, pitch) => { const c = i % COLS, r = Math.floor(i / COLS); return [PACK[0] + (c - (COLS - 1) / 2) * pitch, PACK[1] + (r - (ROWS - 1) / 2) * pitch]; };
const PLATE = { x: -76, y: -50, w: 158, d: 110, r: 8 };
const P = k.fitProjection([...k.boxCorners(PLATE, -0.8, 0), [-20, -30, 110], [64, -30, 110], [64, 44, 110], [-20, 44, 110], [-64, 44, 14]], W, H, { pad: 18, azimuth: 45, elevation: 30 });
const DATA = { W, H, P, PLATE };
const SPOS = Object.fromEntries(Object.keys(PITCH).map((sp) => [sp, [...Array(N).keys()].flatMap((i) => posOf(i, PITCH[sp]))]));
Object.assign(DATA, { MODEL, CHEM, N, TRIG, COLS, ROWS, SPOS, ZT, ZB, RC, PACK, PITCH, CHG, BMS });
const LIVE = `
${engineScript()}
const D = __DATA__;
const stage = document.querySelector(".mk-stage");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lightTheme = document.body.dataset.theme === "light";
const E = mk2(stage, D.P, { W: D.W, H: D.H, pivot: [14, 4, 36], plate: { ...D.PLATE, h: 12, foot: 5 }, shadowBox: [-84, -58, -18, 90, 68, 120] });
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
const M = D.MODEL, CHEM = D.CHEM, P = D.P;
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
let chem = "nmc", abuse = "charge", bms = true, sp = "touch", socSet = 1;
let cells = [], soc = 1, charging = false, chargeStopped = "", nailAt = null, heaterOn = false, shortAt = -10, going = false, endAt = null;
let frame = 0, last = 0, now = 0, visible = false, touring = true, slow = false, tourClock = 0, tourStep = -1, actions = [], lastShot = "", stageSaid = 0;
const C = () => CHEM[chem];

function reset() {
  cells = Array.from({ length: D.N }, () => ({ T: M.amb, st: "ok", vented: false, sepGone: false, trAt: null }));
  soc = socSet; charging = false; chargeStopped = ""; nailAt = null; heaterOn = false; going = false; endAt = null; stageSaid = 0;
}
reset();

const ocv = (s) => { const t = C().ocv; if (s <= t[0][0]) return t[0][1]; for (let i = 1; i < t.length; i++) if (s <= t[i][0]) { const [a, va] = t[i - 1], [b, vb] = t[i]; return va + ((vb - va) * (s - a)) / (b - a); } return t[t.length - 1][1]; };
const energy = (s) => clamp(s, 0, 1.6);
const nbrs = (i) => { const c = i % D.COLS, r = Math.floor(i / D.COLS), out = []; if (c > 0) out.push(i - 1); if (c < D.COLS - 1) out.push(i + 1); if (r > 0) out.push(i - D.COLS); if (r < D.ROWS - 1) out.push(i + D.COLS); return out; };
const burning = (c) => c.trAt !== null && now - c.trAt < M.burn;

function go() {
  if (going) return;
  reset(); going = true;
  if (abuse === "charge") charging = true;
  else if (abuse === "nail") nailAt = now;
  else heaterOn = true;
}

function step(dt) {
  const ch = C();
  // abuse on the trigger cell
  const tc = cells[D.TRIG];
  if (charging) {
    if (bms && ocv(soc) >= ch.vmax - 0.002) { charging = false; chargeStopped = "bms"; }
    else soc += M.chargeRate * dt * (soc < 1 ? 3 : 1);
    if (tc.st !== "ok" && tc.st !== "vent") charging = false;
  }
  const qs = new Array(D.N).fill(0);
  if (charging && soc > 1) qs[D.TRIG] += M.oc0 + M.oc * Math.pow(soc - 1, 1.5);
  if (nailAt !== null) { const t = now - nailAt - 0.6; if (t > 0) { qs[D.TRIG] += M.nail * energy(soc) * Math.exp(-t / M.tauNail); if (t < dt * 2) shortAt = now; } }
  if (heaterOn) { qs[D.TRIG] += M.heater; if (tc.trAt !== null) heaterOn = false; }
  const kc = M.couple[sp], kf = M.flame[sp];
  const T0 = cells.map((c) => c.T);
  cells.forEach((c, i) => {
    const e = i === D.TRIG ? energy(soc) : energy(socSet);
    let q = qs[i] - (c.T - M.amb) / M.tauCool;
    for (const j of nbrs(i)) { q += kc * (T0[j] - c.T); if (burning(cells[j])) q += kf; }
    if (c.trAt === null) {
      if (c.T > ch.sei) q += M.selfA * Math.exp((c.T - ch.sei) / M.selfB) * e;
      if (c.T > ch.sep && !c.sepGone) { c.sepGone = true; if (i === D.TRIG) shortAt = now; }
      if (c.sepGone) q += M.short * e;
      if (c.T > ch.vent) c.vented = true;
      c.T += q * dt;
      if (c.T > ch.tr) { c.trAt = now; c.peak = M.amb + (ch.peak - M.amb) * (0.3 + 0.7 * clamp(e, 0, 1.2)); }
    } else if (burning(c)) {
      c.T += (c.peak - c.T) * (1 - Math.exp(-dt / M.tauPeak));
    } else {
      c.T += -(c.T - M.amb) / M.tauDead * dt;
    }
    c.st = c.trAt !== null ? (burning(c) ? "fire" : "dead") : c.vented ? "vent" : "ok";
  });
  const hot = Math.max(...cells.map((c) => c.T));
  const active = cells.some(burning) || charging || heaterOn || (nailAt !== null && now - nailAt < 8);
  if (going && endAt === null && !active && hot < Math.max(90, ch.sei + 10)) endAt = now;
}
const ui = {
  chem: [...document.querySelectorAll("[data-chem]")], abuse: [...document.querySelectorAll("[data-abuse]")], bms: [...document.querySelectorAll("[data-bms]")], sp: [...document.querySelectorAll("[data-spb]")],
  soc: document.querySelector("#soc"), socOut: document.querySelector("#soc-out"),
  tFill: document.querySelector("#t-fill"), tOut: document.querySelector("#t-out"), trMark: document.querySelector("#tr-mark"),
  vFill: document.querySelector("#v-fill"), vOut: document.querySelector("#v-out"), vMark: document.querySelector("#v-mark"),
  stats: document.querySelector("#stats"), go: document.querySelector("#go"), reset: document.querySelector("#reset"), slow: document.querySelector("#slow"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"),
};
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };
const tPct = (t) => (clamp(t / 300, 0, 1) * 100).toFixed(1) + "%";
const vPct = (v) => (clamp((v - 2.5) / 2.7, 0, 1) * 100).toFixed(1) + "%";

function syncUi() {
  const ch = C(), tc = cells[D.TRIG], hot = Math.max(...cells.map((c) => c.T)), v = ocv(soc);
  ui.chem.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.chem === chem)));
  ui.abuse.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.abuse === abuse)));
  ui.bms.forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.bms === "on") === bms)));
  ui.sp.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.spb === sp)));
  ui.soc.value = Math.round(socSet * 100); ui.socOut.textContent = Math.round(socSet * 100) + " %";
  ui.tFill.style.width = tPct(hot); ui.tFill.dataset.state = hot >= ch.tr ? "bad" : hot >= ch.sei ? "warn" : "ok";
  ui.tOut.textContent = Math.round(hot) + " °C";
  ui.trMark.style.left = tPct(ch.tr); ui.trMark.dataset.label = ch.tr + " runaway";
  ui.vFill.style.width = vPct(v); ui.vFill.dataset.state = v > ch.vmax + 0.01 ? "bad" : "ok";
  ui.vOut.textContent = v.toFixed(2) + " V"; ui.vMark.style.left = vPct(ch.vmax); ui.vMark.dataset.label = ch.vmax.toFixed(1) + " V max";
  const nTr = cells.filter((c) => c.trAt !== null).length;
  ui.stats.innerHTML = "cell state of charge <b>" + Math.round(soc * 100) + " %</b> · cells in runaway <b>" + nTr + " of " + D.N + "</b> · vented <b>" + cells.filter((c) => c.vented).length + "</b>";
  ui.go.disabled = going; ui.go.textContent = abuse === "charge" ? "CHARGE IT" : abuse === "nail" ? "NAIL IT" : "HEAT IT";
  ui.slow.setAttribute("aria-pressed", String(slow)); ui.tour.setAttribute("aria-pressed", String(touring));
}
// ---------------- the pack, in real 3D ----------------
const TAU = Math.PI * 2, RC = D.RC, ZB = D.ZB, ZT = D.ZT, CHG = D.CHG, BMS = D.BMS, HOT = "#ff5a14";
const WRAP = { nmc: "#2f8f83", lfp: "#3b6fc9" }, CATH = { nmc: "#51648a", lfp: "#7a7448" };
const posAt = (i) => [D.SPOS[sp][i * 2], D.SPOS[sp][i * 2 + 1]];
const rn = () => Math.random();
function benchStatic() {
  const o = [];
  // charger
  o.push(prism(rrect(CHG.x, CHG.x + CHG.w, CHG.y, CHG.y + CHG.d, 2.4), "z", 0, 12, "#2f3338", { mat: "plastic" }), box(CHG.x + 2, CHG.x + CHG.w - 2, CHG.y + 2, CHG.y + 14, 12, 12.3, "#e9e6df", { bevel: 0, mat: "matte" }));
  // the BMS board with its chips, and the lead from the charger
  o.push(box(BMS.x, BMS.x + BMS.w, BMS.y, BMS.y + BMS.d, 0, 2.4, "#3a3f46", { mat: "plastic" }), box(BMS.x + 1.5, BMS.x + BMS.w - 1.5, BMS.y + 1.5, BMS.y + BMS.d - 1.5, 2.4, 3.6, "#1f6a4a", { mat: "satin" }));
  for (const [x, y, w, d] of [[BMS.x + 5, BMS.y + 8, 10, 10], [BMS.x + 6, BMS.y + 24, 6, 4], [BMS.x + 6, BMS.y + 32, 6, 4]]) o.push(box(x, x + w, y, y + d, 3.6, 5.2, "#1b1c1f", { mat: "plastic" }));
  for (let i = 0; i < 5; i++) o.push(cyl(BMS.x + 4 + i * 3.4, BMS.y + 4, 0.9, 3.6, 5.6, "#c9a24a", 8, { mat: "metal" }));
  o.push(tube([[CHG.x + 6, CHG.y, 3], [CHG.x + 6, BMS.y + BMS.d + 6, 1.6], [BMS.x + 6, BMS.y + BMS.d + 6, 1.6], [BMS.x + 6, BMS.y + BMS.d - 2, 4]], 1.2, "#1c1d20", { seg: 7, mat: "rubber" }));
  return o;
}
function trayParts() {
  const pitch = D.PITCH[sp], o = [], x0 = D.PACK[0] - (D.COLS / 2) * pitch - 4, y0 = D.PACK[1] - (D.ROWS / 2) * pitch - 4, w = D.COLS * pitch + 8, d = D.ROWS * pitch + 8;
  o.push(prism(rrect(x0, x0 + w, y0, y0 + d, 2.5), "z", 0, ZB, "#3a3f46", { mat: "plastic" }));
  o.push(tube([[BMS.x + BMS.w, BMS.y + 12, 3], [x0 - 6, BMS.y + 12, 1.6], [x0 - 4, y0 + 8, 1.6], [x0 + 1, y0 + 8, 2.4]], 1.1, "#d0342c", { seg: 6, mat: "plastic" }), tube([[BMS.x + BMS.w, BMS.y + 16, 3], [x0 - 9, BMS.y + 16, 1.6], [x0 - 7, y0 + 14, 1.6], [x0 + 1, y0 + 14, 2.4]], 1.1, "#1c1d20", { seg: 6, mat: "plastic" }));
  // nickel strips along each row (not over the cut cell)
  for (let r = 0; r < D.ROWS; r++) { const a = posAt(r * D.COLS), b = posAt(r * D.COLS + D.COLS - (r === D.ROWS - 1 ? 2 : 1)); o.push(box(a[0] - 3, b[0] + 3, a[1] - 2.5, a[1] + 2.5, ZT + 1.4, ZT + 1.9, "#c9ced3", { mat: "steel", bevel: 0 })); }
  if (sp === "barrier") for (let i = 0; i < D.N; i++) { const c = posAt(i), col = i % D.COLS, row = Math.floor(i / D.COLS); if (col < D.COLS - 1) o.push(box(c[0] + pitch / 2 - 0.5, c[0] + pitch / 2 + 0.5, c[1] - pitch / 2 + 0.6, c[1] + pitch / 2 - 0.6, ZB, ZT - 6, "#d9c9a0", { mat: "matte", bevel: 0 })); if (row < D.ROWS - 1) o.push(box(c[0] - pitch / 2 + 0.6, c[0] + pitch / 2 - 0.6, c[1] + pitch / 2 - 0.5, c[1] + pitch / 2 + 0.5, ZB, ZT - 6, "#d9c9a0", { mat: "matte", bevel: 0 })); }
  return o;
}
// the trigger cell, cut in half so you can see the jelly roll: anode, separator, cathode, separator, wound out from the middle
function rollParts(stg) {
  const c = posAt(D.TRIG), o = [], HALF = { c: [c[0], c[1], 0], a0: (135 * Math.PI) / 180, a1: (315 * Math.PI) / 180, seg: 24, closed: true };
  const ring = (r0, r1, col, extra) => o.push(lathe([[r0, ZB + 3], [r1, ZB + 3], [r1, ZT - 4], [r0, ZT - 4], [r0, ZB + 3]], col, { ...HALF, cap: col, mat: "matte", ...extra }));
  const burn = stg === 3 ? { emit: ["#ff7a1f", 0.9], emitK: 2 } : stg === 2 ? { emit: ["#ff5a14", 0.16] } : stg === 1 ? { emit: ["#ff8a3a", 0.03] } : {};
  const col = { an: stg === 4 ? "#141210" : stg >= 2 ? "#3a2a22" : "#3a3d42", sep: stg === 4 ? "#1d1a18" : stg >= 2 ? "#6a4a30" : stg === 1 ? "#e8dcc0" : "#f1efe9", ca: stg === 4 ? "#181614" : CATH[chem] };
  ring(0.01, 1.2, stg === 4 ? "#2a2522" : "#aeb4bb", {});
  let r = 1.3; const lay = [[0.48, "an"], [0.16, "sep"], [0.5, "ca"], [0.16, "sep"]];
  while (r < 8.3) for (const [t, kk] of lay) { if (r >= 8.3) break; const r1 = Math.min(8.3, r + t); ring(r, r1, col[kk], burn); r += t; }
  return o;
}
let fx = [];
function draw(dt = 0) {
  const ch = C(), live = [], tc = cells[D.TRIG];
  const stg = tc.trAt !== null ? (burning(tc) ? 3 : 4) : tc.sepGone ? 2 : tc.T > ch.sei ? 1 : 0;
  cells.forEach((c, i) => {
    const [x, y] = posAt(i), h = clamp((c.T - M.amb) / 220, 0, 1), dead = c.st === "dead", fire = c.st === "fire";
    const wrap = dead ? "#1d1a18" : mixHex(WRAP[chem], "#3a2a22", h * 0.7), glow = fire ? [HOT, 0.9] : h > 0.04 ? [HOT, h * 0.8] : undefined, em = fire ? ["#ff7a1f", 0.8] : h > 0.3 ? [HOT, (h - 0.3) * 0.9] : undefined;
    if (i === D.TRIG) {
      const HALF = { c: [x, y, 0], a0: (135 * Math.PI) / 180, a1: (315 * Math.PI) / 180, seg: 28 };
      live.push(lathe([[8.5, ZB], [RC, ZB], [RC, ZT], [8.5, ZT], [8.5, ZB]], wrap, { ...HALF, closed: true, cap: dead ? "#2a2522" : "#c9ced3", mat: "plastic", glow, emit: em }), lathe([[0, ZB], [8.5, ZB], [8.5, ZB + 3], [0, ZB + 3]], "#aeb4bb", { ...HALF, mat: "steel" }), lathe([[0, ZT - 4], [8.5, ZT - 4], [8.5, ZT], [4.4, ZT], [3.6, ZT + 1.4], [0, ZT + 1.4]], dead ? "#2a2522" : "#c9ced3", { ...HALF, mat: "steel" }));
      return;
    }
    live.push(lathe([[0, ZB], [RC, ZB], [RC, ZT - 1.2], [RC - 0.5, ZT - 0.2], [RC - 1.6, ZT]], wrap, { c: [x, y, 0], seg: 28, mat: "plastic", shell: true, glow, emit: em }));
    live.push(lathe([[RC - 1.6, ZT], [4.6, ZT], [4.4, ZT - 0.6], [4.4, ZT]], dead ? "#2a2522" : "#f1efe9", { c: [x, y, 0], seg: 24, mat: "matte", shell: true }), lathe([[4.4, ZT - 0.4], [4.4, ZT + 0.2], [3.6, ZT + 1.4], [0, ZT + 1.4]], dead ? "#2a2522" : "#c9ced3", { c: [x, y, 0], seg: 20, mat: "steel", shell: true }));
    // what's inside, for the x-ray: the roll, glowing with how hot it is
    if (E.xray > 0.01) live.push(lathe([[1.2, ZB + 3], [8.3, ZB + 3], [8.3, ZT - 4], [1.2, ZT - 4]], dead ? "#1d1a18" : mixHex("#4a5058", HOT, h), { c: [x, y, 0], seg: 20, mat: "matte", emit: fire ? ["#ff7a1f", 1] : h > 0.03 ? [HOT, h] : undefined, emitK: 1.6 }));
  });
  // the nail going in, or the heater pad cooking it
  const tp = posAt(D.TRIG);
  if (nailAt !== null) { const f = sm(0, 0.6, now - nailAt), dz = 30 * (1 - f), nx = tp[0] - 3.2, ny = tp[1] + 3.2; live.push(lathe([[0, ZT - 30], [0.9, ZT - 27], [0.9, ZT + 6], [3, ZT + 6], [3, ZT + 7.2], [0, ZT + 7.2]], "#c9ced3", { c: [nx, ny, dz], seg: 12, mat: "steel" })); }
  if (abuse === "heat") live.push(box(tp[0] + RC + 1.5, tp[0] + RC + 6, tp[1] - 7, tp[1] + 7, ZB, 26, heaterOn ? "#ff7a2a" : "#7a4a3a", { mat: "matte", emit: heaterOn ? [HOT, 0.9] : undefined, emitK: 2 }), tube([[tp[0] + RC + 4, tp[1] + 7, 8], [tp[0] + RC + 10, tp[1] + 16, 2], [tp[0] + RC + 16, tp[1] + 30, 1.2]], 0.8, "#1c1d20", { seg: 5, mat: "rubber" }));
  // lamps
  live.push(cyl(CHG.x + 6, CHG.y + 12, 1.6, 12.3, 13, charging ? "#3ddc84" : "#4a4e55", 12, { mat: "plastic", emit: charging ? ["#3ddc84", 1] : undefined, emitK: 2.2 }), cyl(BMS.x + 17, BMS.y + 36, 1.4, 3.6, 5, bms ? "#3ddc84" : "#ff4a3d", 10, { mat: "plastic", emit: [bms ? "#3ddc84" : "#ff4a3d", 0.9], emitK: 2 }));
  let svg = E.render([{ cache: "bench", rev: 0, parts: benchStatic }, { cache: "tray", rev: sp, parts: trayParts }, { cache: "roll", rev: sp + chem + stg, parts: () => rollParts(stg) }, { parts: live }]);
  // gas, fire and smoke
  if (dt > 0) cells.forEach((c, i) => {
    const [x, y] = posAt(i), top = [x, y, ZT + 2];
    if (c.vented && c.trAt === null && rn() < dt * 22) fx.push({ k: "gas", p: [x + (rn() - 0.5) * 3, y + (rn() - 0.5) * 3, ZT + 2], v: [(rn() - 0.5) * 14, (rn() - 0.5) * 14, 50 + rn() * 40], life: 0, max: 0.7 + rn() * 0.6, s: 0.5 });
    if (c.trAt !== null) {
      const a = now - c.trAt, fire = sm(0, 0.15, a) * (1 - sm(M.burn - 0.8, M.burn, a)), smoke = sm(0.5, 2, a) * Math.exp(-Math.max(0, a - M.burn) / 8);
      if (fire > 0.02) for (let j = 0; j < 3; j++) if (rn() < fire) fx.push({ k: "flame", p: [x + (rn() - 0.5) * 6, y + (rn() - 0.5) * 6, ZT + 1], v: [(rn() - 0.5) * 26, (rn() - 0.5) * 26, 90 + rn() * 90], life: 0, max: 0.35 + rn() * 0.4, s: 0.8 + rn() * 0.7 });
      if (fire > 0.3 && rn() < dt * 40) fx.push({ k: "spark", p: [...top], v: [(rn() - 0.5) * 220, (rn() - 0.5) * 220, 120 + rn() * 220], life: 0, max: 0.5 + rn() * 0.6 });
      if (smoke > 0.03 && rn() < dt * 16 * smoke) fx.push({ k: "smoke", p: [x + (rn() - 0.5) * 6, y + (rn() - 0.5) * 6, ZT + 16], v: [(rn() - 0.5) * 10, (rn() - 0.5) * 10, 26 + rn() * 22], life: 0, max: 2.2 + rn() * 2.2, s: 1 });
      if (fire > 0.05) E.sprite([x, y, ZT + 6], 16 * fire, "#ffd27a", 0.5 * fire, true, 1);
    }
  });
  const sh = now - shortAt; if (sh < 0.5) { E.sprite([tp[0] - 3, tp[1] + 3, ZT - 20], 9 + sh * 30, "#cfe0ff", Math.exp(-sh / 0.18), true, 1); for (let j = 0; j < 3; j++) E.line([tp[0] - 3, tp[1] + 3, ZT - 20], [tp[0] - 3 + (rn() - 0.5) * 14, tp[1] + 3 + (rn() - 0.5) * 14, ZT - 20 + (rn() - 0.5) * 20], 1.8, "#ffffff", Math.exp(-sh / 0.18), true); }
  fx = fx.filter((p) => {
    p.life += dt; if (p.life > p.max) return false;
    const t = p.life / p.max, o = [p.p[0], p.p[1], p.p[2]];
    if (p.k === "spark") p.v[2] -= 420 * dt; else { p.v[0] *= 0.97; p.v[1] *= 0.97; }
    for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * dt;
    if (p.k === "flame") E.sprite(p.p, (5 + 14 * t) * p.s, t < 0.25 ? "#fff0b8" : t < 0.6 ? "#ff9a2e" : "#d8481a", 0.9 * (1 - t * t), true, 2);
    else if (p.k === "gas") E.sprite(p.p, (3 + 12 * t) * p.s, lightTheme ? "#b9c2cc" : "#e6ecf2", (lightTheme ? 0.5 : 0.34) * (1 - t));
    else if (p.k === "smoke") E.sprite(p.p, (6 + 26 * t) * p.s, lightTheme ? "#4a4744" : "#2e2c2b", 0.5 * (1 - t));
    else E.line(o, p.p, 1.8, t < 0.5 ? "#ffe6a0" : "#ff8a3a", 1 - t, true);
    return true;
  });
  // lettering on the charger and the BMS
  let m = E.faceMatrix([CHG.x + 4, CHG.y + 5, 12.35], [1, 0, 0], [0, 1, 0]);
  if (m) svg += '<g transform="' + m + '"><text class="pt lo" x="0" y="2" font-size="3">CHARGER</text><text class="pt" x="5.4" y="8" font-size="2.6">' + (charging ? "charging" : chargeStopped === "bms" ? "full" : "idle") + "</text></g>";
  m = E.faceMatrix([BMS.x + 3, BMS.y + 22.5, 3.65], [1, 0, 0], [0, 1, 0]);
  if (m) svg += '<g transform="' + m + '"><text class="pt pcb" x="13" y="0" font-size="2.6">BMS</text></g>';
  if (E.xray > 0.02) svg += E.callouts([
    { p: [tp[0] - 4, tp[1] + 4, 44], text: "Jelly roll", sub: stg === 0 ? "anode, separator, cathode" : stg === 1 ? "SEI layer breaking down" : stg === 2 ? "separator's gone: internal short" : stg === 3 ? "thermal runaway" : "what's left" },
    { p: [tp[0], tp[1] - 2, ZT + 1.4], text: "Vent", sub: "lets the gas out before it bursts" }, { p: [posAt(1)[0], posAt(1)[1], ZT + 1.9], text: "Nickel strip", sub: "joins the cells, and carries the heat" },
    { p: [BMS.x + 10, BMS.y + 13, 5.2], text: "BMS", sub: bms ? "watching every cell's voltage" : "dead" }, { p: [posAt(4)[0] - RC, posAt(4)[1], 40], text: "Hottest cell", sub: Math.round(Math.max(...cells.map((c) => c.T))) + " °C, runaway at " + ch.tr },
  ], E.xray, E.fs < 0.62 ? {} : { topL: 70, topR: 70 });
  if (sceneG.innerHTML !== svg) sceneG.innerHTML = svg;
  const hot = Math.max(...cells.map((c) => c.T)), nTr = cells.filter((c) => c.trAt !== null).length;
  const text = C().name + " · " + Math.round(socSet * 100) + " % · hottest " + Math.round(hot) + " °C · " + ocv(soc).toFixed(2) + " V" + (nTr ? " · " + nTr + " in runaway" : "");
  if (readout.textContent !== text) readout.textContent = text;
}

function story() {
  const ch = C(), tc = cells[D.TRIG], nTr = cells.filter((c) => c.trAt !== null).length, hot = Math.max(...cells.map((c) => c.T));
  if (!going && endAt === null) return say(abuse === "charge" ? "Charge the corner cell. It's the one the pack drifted out of balance on, so it fills first." + (bms ? " The BMS is watching its voltage." : " The BMS is dead.") : abuse === "nail" ? "Put a nail through the corner cell: an instant internal short." : "Cook the corner cell with a heater pad. Watch the stages go past.");
  if (chargeStopped === "bms" && tc.T < ch.sei) return say("The BMS saw " + ch.vmax.toFixed(1) + " V on that cell and stopped the charge. Nothing happens. That's its whole job, and it's the only one of these three it can do anything about.");
  if (nTr > 1) return say(nTr + " cells gone. Each one that goes heats its neighbours: " + (sp === "touch" ? "touching cells, so the heat goes straight across and it walks through the pack." : sp === "gap" ? "the gap slows it right down, which buys time to get out, but a full NMC cell still takes its neighbours." : "the barrier is soaking it up.") + (nTr === D.N ? " The whole pack's gone." : ""));
  if (tc.trAt !== null && burning(tc)) return say("Thermal runaway, " + Math.round(tc.T) + " °C. The cathode lets go of its oxygen and the electrolyte burns with it, so it doesn't need air and you can't smother it. All the energy in the cell comes out in seconds.");
  const warm = Math.max(M.amb, ...cells.filter((c) => c.trAt === null).map((c) => c.T));
  if (tc.trAt !== null && nTr === 1 && warm > ch.sei) return say("One cell gone so far. Its neighbours are at " + Math.round(warm) + " °C and climbing" + (sp === "gap" ? ": the gap is slowing the heat down, not stopping it." : "."));
  if (tc.trAt !== null) return say(nTr === 1 ? "One cell gone, and it stopped there. " + (sp === "barrier" ? "The barrier did its job." : sp === "gap" ? "The gap was enough this time." : chem === "lfp" ? "LFP runs away later and cooler, so the neighbours never got there." : socSet < 0.5 ? "There wasn't enough charge in it to cook the neighbours." : "Lucky.") : nTr + " cells gone.");
  if (endAt !== null) return say("It cooled down without running away: " + (socSet < 0.5 ? "at " + Math.round(socSet * 100) + " % there wasn't enough energy in it to keep the reactions going. That's why cells ship at 30 % or less." : "it never got hot enough to keep itself going."));
  if (tc.vented) return say("The vent's popped at about " + ch.vent + " °C: electrolyte vapour and gas, flammable, and it's still climbing (" + Math.round(tc.T) + " °C).");
  if (tc.sepGone) return say("The separator's melted (about " + ch.sep + " °C), so the anode and cathode touch: an internal short dumping the cell's own energy into itself. " + Math.round(tc.T) + " °C.");
  if (tc.T > ch.sei) return say("Past about " + ch.sei + " °C the SEI, the film protecting the anode, starts breaking down. The electrolyte attacks the graphite and that makes more heat. " + Math.round(tc.T) + " °C.");
  if (charging && soc > 1) return say("Overcharging: " + ocv(soc).toFixed(2) + " V, " + Math.round(soc * 100) + " %. Lithium is plating on the anode and the cathode is being stripped further than it's built for, and that makes heat.");
  if (charging) return say("Charging: " + ocv(soc).toFixed(2) + " V, " + Math.round(soc * 100) + " %.");
  if (endAt !== null) return say("It cooled down without running away: " + (socSet < 0.5 ? "at " + Math.round(socSet * 100) + " % there wasn't enough energy in it to keep the reactions going. That's why cells ship at 30 % or less." : "it never got hot enough to keep itself going."));
  return say(Math.round(tc.T) + " °C.");
}

const TOUR = [
  { chem: "nmc", abuse: "charge", bms: true, sp: "touch", soc: 0.8, end: 9 },
  { chem: "nmc", abuse: "charge", bms: false, sp: "touch", soc: 0.8, end: 44 },
  { chem: "nmc", abuse: "nail", bms: true, sp: "barrier", soc: 1, end: 20 },
  { chem: "nmc", abuse: "nail", bms: true, sp: "touch", soc: 0.3, end: 14 },
  { chem: "lfp", abuse: "nail", bms: true, sp: "touch", soc: 1, end: 20 },
  { chem: "nmc", abuse: "heat", bms: true, sp: "barrier", soc: 1, end: 32 },
];
function tick(t) {
  const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
  last = t;
  const sdt = dt * (slow ? 0.12 : 1);
  now += sdt;
  if (touring) {
    tourClock += sdt;
    if (tourStep < 0 || actions.length === 0) {
      tourStep = (tourStep + 1) % TOUR.length;
      const s = TOUR[tourStep];
      chem = s.chem; abuse = s.abuse; bms = s.bms; sp = s.sp; socSet = s.soc; reset();
      actions = [[tourClock + 1.2, "go"], [tourClock + s.end, "end"]];
    }
    while (actions.length && tourClock >= actions[0][0]) {
      const a = actions.shift()[1];
      if (a === "go") go(); else if (a === "end") actions = [];
    }
  }
  const n = 10;
  for (let i = 0; i < n; i++) step(sdt / n);
  draw(sdt); syncUi(); story();
  const idle = fx.length === 0 && !touring && !going && cells.every((c) => c.T < M.amb + 3);
  if (going && endAt !== null && now - endAt > 2.5 && !touring) going = false;
  frame = visible && !idle ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { touring = false; actions = []; };
const guard = (fn, during = false) => (...a) => { takeOver(); if (going && !during) { going = false; reset(); } fn(...a); draw(); syncUi(); story(); run(); };
const setChem = guard((v) => { chem = v; reset(); });
const setAbuse = guard((v) => { abuse = v; reset(); });
const setBms = guard((v) => { bms = v; });
const setSp = guard((v) => { sp = v; reset(); });
const setSoc = guard((v) => { socSet = v; reset(); });
const start = guard(() => go());
const doReset = guard(() => reset());
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;

ui.chem.forEach((b) => b.addEventListener("click", () => setChem(b.dataset.chem)));
ui.abuse.forEach((b) => b.addEventListener("click", () => setAbuse(b.dataset.abuse)));
ui.bms.forEach((b) => b.addEventListener("click", () => setBms(b.dataset.bms === "on")));
ui.sp.forEach((b) => b.addEventListener("click", () => setSp(b.dataset.spb)));
ui.soc.addEventListener("input", () => setSoc(+ui.soc.value / 100));
ui.go.addEventListener("click", start);
ui.reset.addEventListener("click", doReset);
ui.slow.addEventListener("click", () => { slow = !slow; syncUi(); run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; tourClock = 0; actions = []; } syncUi(); run(); });
onTap(start);
stage.addEventListener("keydown", (ev) => {
  const map = { x: () => { setX(!E.xrayOn); run(); }, " ": start, Enter: start, r: doReset, l: () => setChem(chem === "nmc" ? "lfp" : "nmc"), b: () => setBms(!bms), "1": () => setAbuse("charge"), "2": () => setAbuse("nail"), "3": () => setAbuse("heat"), s: () => { slow = !slow; syncUi(); run(); } };
  if (map[ev.key]) { ev.preventDefault(); map[ev.key](); }
});
window.__fig = { E, freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
draw(); syncUi(); story();
`;

const CSS = `.pt{font-family:var(--anatomy-mono);fill:#23262b;font-weight:700}.pt.lo{fill:#5a6068;font-weight:600}.pt.pcb{fill:#d8f0e4}
.ctl #go{font-weight:600;letter-spacing:.06em}`;

const stage = stageHtml({
  W, H, fig: "Fig 12", title: "Lithium thermal runaway", xray: true,
  label: "A pack of twelve cylindrical lithium-ion cells in a tray with nickel strips across the tops, a charger and a battery management board beside it. The corner cell is cut in half to show the jelly roll inside. An x-ray mode turns the other cans to glass and shows how hot each one is.",
  keysHelp: "Lithium pack: drag to rotate, X for x-ray, space abuses the corner cell, 1 2 3 pick the abuse, L switches chemistry, B the BMS, R resets",
  extra: ``,
});

const CONTROLS = `<div class="ctl" role="group" aria-label="Test controls">
  <div class="ctl-row"><span class="ctl-label">Chemistry</span><button type="button" data-chem="nmc" aria-pressed="true">NMC<small>phones, laptops, most EVs</small></button><button type="button" data-chem="lfp" aria-pressed="false">LFP<small>home batteries, some EVs</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Abuse</span><button type="button" data-abuse="charge" aria-pressed="true">Overcharge</button><button type="button" data-abuse="nail" aria-pressed="false">Nail</button><button type="button" data-abuse="heat" aria-pressed="false">Heat</button></div>
  <div class="ctl-row"><span class="ctl-label">BMS</span><button type="button" data-bms="on" aria-pressed="true">Working</button><button type="button" data-bms="off" aria-pressed="false">Dead</button></div>
  <div class="ctl-row"><span class="ctl-label">Spacing</span><button type="button" data-spb="touch" aria-pressed="true">Touching</button><button type="button" data-spb="gap" aria-pressed="false">Gapped</button><button type="button" data-spb="barrier" aria-pressed="false">Barrier<small>mica sheets</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Charge</span><div class="slide"><input id="soc" type="range" min="10" max="100" step="5" value="100" aria-label="State of charge"></div><output id="soc-out">100 %</output></div>
  <div class="ctl-row"><span class="ctl-label">Hottest</span><div class="meter"><span id="t-fill" class="fill"></span><span class="mark quiet" style="left:${(80 / 300 * 100).toFixed(1)}%"></span><span class="mark" style="left:${(130 / 300 * 100).toFixed(1)}%" data-label="130"></span><span id="tr-mark" class="mark red" style="left:60%" data-label="180 runaway"></span></div><output id="t-out">25 °C</output></div>
  <div class="ctl-row"><span class="ctl-label">Cell volts</span><div class="meter"><span id="v-fill" class="fill"></span><span id="v-mark" class="mark red" style="left:50%" data-label="4.2 V max"></span></div><output id="v-out">4.20 V</output></div>
  <div class="ctl-row"><span class="ctl-label">Pack</span><span id="stats"></span></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="go" class="danger">CHARGE IT</button><button type="button" id="reset">Reset</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
</div>`;


const foot = footHtml({
  theme, slug: "lithium",
  real: "Roughly real, and it varies a lot from cell to cell: SEI breakdown from about 70 to 90 °C, PE separators melting around 130 to 140 °C, runaway around 150 to 200 °C for nickel and cobalt cathodes and about 250 °C for LFP, hot spots near 800 °C, 4.2 V max for NMC and about 3.6 V for LFP, and less charge meaning less energy.",
  made: "every rate, the heat model, how it spreads, the overcharge curve and the timings, which are squashed so you don't wait an hour.",
});
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), pageMk2({
  k, title: "Lithium thermal runaway", fig: "Fig 12", hint: "Tap: do it", theme, W, H, stage, controls: CONTROLS, css: CSS, foot,
  caption: "A lithium-ion cell is a rolled-up sandwich: anode, separator, cathode, separator, soaked in a flammable electrolyte. Heat it past about 80 °C and the film protecting the anode starts breaking down and making its own heat. At about 130 °C the separator melts and the electrodes short inside the cell. Somewhere around 150 to 250 °C, depending on the chemistry, the cathode starts giving up oxygen and the whole lot runs away: it burns without air and all its energy comes out in seconds. Overcharging, a nail or plain heat will all get it there. The BMS can stop the overcharge and nothing else. What decides how bad it gets is the chemistry, how much charge is in it, and whether one cell going takes its neighbours with it.",
  script: LIVE.replace("__DATA__", JSON.stringify(DATA)),
}));
console.log("wrote", name);
