import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { engineScript, stageHtml, pageMk2, footHtml } from "../../mk2/shell.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const W = 960, H = 640;

// Truth: a light that pulses fL times a second freezes anything that repeats itself between pulses. A three-jaw chuck repeats every third of a turn,
// so it looks stopped at 60 x fL / 3 rpm (2,000 rpm under 100 Hz light) and at whole multiples of that. Rectified 50 Hz mains gives 100 Hz ripple.
// The metric for it is SVM, the stroboscopic visibility measure (80 Hz to 2 kHz): at 1 an average observer sees the effect half the time. The EU ecodesign limit is 0,4.
// Toy: how visible the frozen image is for each light, and how willing the dummy is to be fooled.
const GEO = { AXIS_Z: 105, BED_Z: 79, CHUCK_X: -24, DUMMY: { x: -30, y: 42 }, LAMP_X: -14, LAMP_Z: 192 };
const START = { rpm: 1500, light: 0, pwmF: 200, duty: 20 };
const PLATE = { x: -100, y: -84, w: 200, d: 168, r: 8 };
const P = k.fitProjection([...k.boxCorners(PLATE, -0.8, 0), [-74, -20, 200], [72, 18, 120], [-30, 60, 176], [-14, 0, 214]], W, H, { pad: 18, azimuth: 30, elevation: 30 });
const DATA = { W, H, P, PLATE };
Object.assign(DATA, { GEO, start: START });
const LIVE = `
${engineScript()}
const D = __DATA__;
const stage = document.querySelector(".mk-stage");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lightTheme = document.body.dataset.theme === "light";
const E = mk2(stage, D.P, { W: D.W, H: D.H, pivot: [-6, 6, 96], plate: { ...D.PLATE, h: 12, foot: 5 }, shadowBox: [-112, -96, -18, 112, 92, 240] });
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
const G3 = D.GEO, AX = G3.AXIS_Z, CX = G3.CHUCK_X, DM = G3.DUMMY, TAU = Math.PI * 2, rn = () => Math.random(), NJ = 3;
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const burst = (age, rise, fall) => (age > 0 ? sm(0, rise, age) * Math.exp(-Math.max(0, age - rise) / fall) : 0);
const flashEl = stage.querySelector(".fx-flash"), q = (s) => document.querySelector(s);

// ---------------- state ----------------
let rpm = D.start.rpm, light = D.start.light, pwmF = D.start.pwmF, duty = D.start.duty;
let now = 0, last = 0, frame = 0, visible = true, slow = false, touring = !still.matches, tourStep = -1, tourWait = 0, tourRpm = null;
let spin = rpm / 60, appA = 0, realA = 0, reach = 0, reachGoal = 0, reachHold = 0, shakeAt = -10, grabAt = null, estop = false, lastSeen = null;
const END = 5.2, grabbed = () => grabAt !== null;

// ---------------- the stroboscope: what a flickering light does to a spinning chuck ----------------
// fL: flashes per second. The chuck repeats every third of a turn, so it looks stopped whenever it turns a whole number of thirds between flashes.
const flick = () => (light === 2 ? pwmF : 100);
const depth = () => (light === 0 ? 0.03 : 1), sharp = () => (light === 2 ? 1 - 0.55 * (duty / 100) : light === 1 ? 0.75 : 1);
function seen(f) {
  const fL = flick(), x = (f * NJ) / fL; let best = null;
  if (f < 0.15) return { q: 1, drift: 0, vis: 1, stopped: true };
  for (let k = 1; k <= 3; k++) { const n = Math.round(x * k); if (n === 0) continue; const d = ((x - n / k) * fL) / NJ; if (Math.abs(d) < 2.5 && (!best || Math.abs(d) < Math.abs(best.drift) - 0.01)) best = { q: k, drift: d, vis: depth() * sharp() * [1, 0.65, 0.45][k - 1] * (1 - (Math.abs(d) / 2.5) ** 2) }; }
  return best || { q: 1, drift: f, vis: 0 };
}
const fooled = (s) => !s.stopped && s.q === 1 && s.vis >= 0.4 && Math.abs(s.drift) < 0.35;

const ui = { rpm: q("#rpm"), rpmOut: q("#rpm-out"), lt: [...document.querySelectorAll("[data-light]")], pwm: q("#pwm"), pwmOut: q("#pwm-out"), duty: q("#duty"), dutyOut: q("#duty-out"), pwmRows: [...document.querySelectorAll(".pwm-row")], notch: q("#rpm-notch"),
  go: q("#reach"), slow: q("#slow"), tour: q("#tour"), shot: q("#shot"), looks: q("#looks") };
const sliding = { rpm: false, pwm: false, duty: false };
let lastShot = "";
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };
function looksText(s) {
  if (s.stopped) return "stopped";
  if (s.vis < 0.12) return "like a blur";
  const a = Math.abs(s.drift * 60);
  if (a < 2) return s.q > 1 ? "like " + NJ * s.q + " jaws standing still" : "dead still";
  return (s.q > 1 ? "like " + NJ * s.q + " jaws" : "like it's") + " turning " + (s.drift > 0 ? "forwards" : "backwards") + " at " + (a < 10 ? a.toFixed(1) : Math.round(a)) + " rpm" + (s.vis < 0.4 ? ", faintly" : "");
}
function syncUi() {
  if (!sliding.rpm) ui.rpm.value = String(Math.round(rpm));
  if (!sliding.pwm) ui.pwm.value = String(pwmF);
  if (!sliding.duty) ui.duty.value = String(duty);
  ui.rpmOut.textContent = Math.round(rpm) + " rpm";
  ui.pwmOut.textContent = pwmF + " Hz"; ui.dutyOut.textContent = duty + " %";
  ui.lt.forEach((b, i) => b.setAttribute("aria-pressed", String(i === light)));
  ui.pwmRows.forEach((r) => { r.dataset.off = String(light !== 2); });
  const lock = (60 * flick()) / NJ; ui.notch.style.left = clamp((lock / 3000) * 100, 0, 100).toFixed(1) + "%"; ui.notch.style.display = lock <= 3000 ? "" : "none"; ui.notch.dataset.label = Math.round(lock) + " looks stopped";
  ui.looks.textContent = estop ? "E-stop" : looksText(seen(spin));
  ui.slow.setAttribute("aria-pressed", String(slow));
  ui.tour.setAttribute("aria-pressed", String(touring));
}

// ---------------- the dummy ----------------
function doReach() {
  if (grabbed() || reachGoal > 0 || reach > 0.05) return;
  const s = seen(spin);
  if (s.stopped) { reachGoal = 1; reachHold = 1.1; say("It really is stopped. Hand on the chuck, no drama."); return; }
  if (!fooled(s)) { shakeAt = now; say(s.vis < 0.12 ? "It can see that's a blur. The hands stay where they are." : "Something's flickering in there, " + (s.q > 1 ? NJ * s.q + " ghostly jaws" : "jaws sliding round") + ". Not touching that."); return; }
  reachGoal = 1; reachHold = 9;
  say(Math.abs(s.drift * 60) < 2 ? "Under this light the chuck looks dead still. It's doing " + Math.round(spin * 60) + " rpm. The dummy reaches in to check the job…" : "Under this light the chuck looks like it's barely creeping round. It's doing " + Math.round(spin * 60) + " rpm. The dummy reaches in…");
}
function step(dt) {
  const target = estop ? 0 : rpm / 60;
  spin += (target - spin) * (1 - Math.exp(-dt / (estop ? 0.5 : 0.35)));
  const s = seen(spin); lastSeen = s;
  appA += TAU * (s.vis > 0.02 ? s.drift : 0) * dt; realA += TAU * Math.min(spin, 2.2) * dt;
  if (grabbed()) return;
  reach += (reachGoal - reach) * Math.min(1, dt * 9);
  if (reachGoal > 0 && reach > 0.93) {
    if (spin > 0.15) { grabAt = now; say("The sleeve touched a jaw doing " + Math.round(spin * 60) + " rpm. Arm, then the rest of it, round the spindle before anyone could reach the stop button."); }
    else { reachHold -= dt; if (reachHold <= 0) reachGoal = 0; }
  }
}

// ---------------- geometry ----------------
const STEELC = "#b4bcc4", GREEN = "#3f6b5c", YEL = "#e8b923", BLK = "#23262b";
const mul = (A, B) => { const o = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o.push(A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c]); for (let r = 0; r < 3; r++) o.push(A[r * 3] * B[9] + A[r * 3 + 1] * B[10] + A[r * 3 + 2] * B[11] + A[9 + r]); return o; };
const rotY = (ang, piv) => { const c = Math.cos(ang), s = Math.sin(ang); return [c, 0, s, 0, 1, 0, -s, 0, c, piv[0] - (c * piv[0] + s * piv[2]), 0, piv[2] - (-s * piv[0] + c * piv[2])]; };
const rotX = (ang, piv) => { const c = Math.cos(ang), s = Math.sin(ang); return [1, 0, 0, 0, c, -s, 0, s, c, 0, piv[1] - (c * piv[1] - s * piv[2]), piv[2] - (s * piv[1] + c * piv[2])]; };
const trans = (x, y, z) => [1, 0, 0, 0, 1, 0, 0, 0, 1, x, y, z];
const apply = (m, p) => [m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[9], m[3] * p[0] + m[4] * p[1] + m[5] * p[2] + m[10], m[6] * p[0] + m[7] * p[1] + m[8] * p[2] + m[11]];
function latheParts() {
  const o = [], bz = G3.BED_Z;
  // cabinet, chip tray, bed and ways
  o.push(prism(rrect(-74, -34, -20, 20, 2), "z", 0, bz - 6, GREEN, { mat: "paint", shell: true }), prism(rrect(40, 72, -18, 18, 2), "z", 0, bz - 6, GREEN, { mat: "paint" }), box(-78, 76, -24, 24, bz - 6, bz - 3, "#2f4f44", { mat: "paint", bevel: 0.4 }));
  o.push(box(-34, 72, -11, 11, bz - 3, bz + 6, GREEN, { mat: "paint", bevel: 0.5 }), box(-34, 72, -10, -6, bz + 6, bz + 8, "#c9ced3", { mat: "steel", bevel: 0.3 }), box(-34, 72, 6, 10, bz + 6, bz + 8, "#c9ced3", { mat: "steel", bevel: 0.3 }));
  o.push(tube([[-34, 13.5, bz + 1], [70, 13.5, bz + 1]], 1.3, "#aeb4bb", { seg: 10, mat: "steel" }));
  // headstock, with the spindle through it
  o.push(prism(rrect(-74, -36, -19, 19, 3), "z", bz - 3, AX + 22, GREEN, { mat: "paint", shell: true, bevel: 0.8 }), lathe([[0, 2.4], [7, 2.4], [7, 0], [0, 0]], "#aeb4bb", { c: [-36, 0, AX], axis: "x", seg: 28, mat: "satin" }));
  o.push(box(-72, -42, -16, -4, AX + 22, AX + 22.6, "#15181c", { bevel: 0, flat: true }), cyl(-52, 14, 4, AX + 22, AX + 24, "#e8b923", 20, { mat: "paint" }), cyl(-52, 14, 3.2, AX + 24, AX + 27.5, "#d0342c", 20, { mat: "gloss" }));
  for (const [x, z] of [[-64, AX - 8], [-52, AX - 8]]) o.push(prism(circle(x, z, 3, 16), "y", 19, 21.6, "#2f3338", { mat: "plastic" }));
  // inside the headstock (seen in the truth view): motor, belt, pulleys
  o.push(tube([[-66, -4, 28], [-44, -4, 28]], 11, "#5f6872", { seg: 24, mat: "paint" }), tube([[-70, -4, 28], [-66, -4, 28]], 5, "#c9ced3", { seg: 18, mat: "steel" }), tube([[-71, 0, AX], [-38, 0, AX]], 3, "#aeb4bb", { seg: 14, mat: "steel" }), tube([[-71.5, 0, AX], [-68.5, 0, AX]], 9, "#3a3e44", { seg: 28, mat: "paint" }));
  o.push(tube([[-70, -4, 28], [-70, -9, 60], [-70, -9, AX - 2], [-70, 0, AX + 9], [-70, 9, AX - 2], [-70, 4, 60], [-70, -4, 28]], 0.9, "#1d1f22", { seg: 6, mat: "rubber" }));
  // the body of the chuck (the jaws are drawn separately: they're the bit the light plays tricks with)
  o.push(lathe([[0, 12], [12.8, 12], [13.6, 11.4], [13.6, 0], [0, 0]], "#aab3bc", { c: [CX - 12, 0, AX], axis: "x", seg: 44, mat: "satin" }));
  // the job, the tailstock and its centre
  o.push(tube([[CX, 0, AX], [36, 0, AX]], 3.2, "#c9ced3", { seg: 18, mat: "chrome" }), box(40, 62, -8, 8, bz + 6, AX + 9, GREEN, { mat: "paint", bevel: 0.8 }), tube([[34, 0, AX], [40, 0, AX]], [0.4, 2.6], "#aeb4bb", { seg: 12, mat: "steel" }), tube([[62, 0, AX], [68, 0, AX]], 1.6, "#aeb4bb", { seg: 10, mat: "steel" }), lathe([[0, 1.6], [7, 1.6], [7, 0], [0, 0]], "#2f3338", { c: [68, 0, AX], axis: "x", seg: 24, mat: "plastic" }));
  // saddle, cross slide and toolpost
  o.push(box(4, 24, -12, 13, bz + 8, bz + 11, "#8f9aa4", { mat: "paint", bevel: 0.4 }), box(9, 19, -6, 18, bz + 11, bz + 14, "#8f9aa4", { mat: "paint", bevel: 0.4 }), box(11, 17, 3, 9, bz + 14, bz + 21, "#3a3e44", { mat: "paint", bevel: 0.4 }), box(8, 13, 4.6, 6.2, bz + 16.5, bz + 18.5, "#c9ced3", { mat: "steel", bevel: 0 }));
  o.push(lathe([[0, 0], [4.6, 0], [4.6, 1.4], [0, 1.4]], "#2f3338", { c: [14, 19, bz + 12.5], axis: "y", seg: 20, mat: "plastic" }), lathe([[0, 0], [5.4, 0], [5.4, 1.4], [0, 1.4]], "#2f3338", { c: [0, 14, bz - 0.5], axis: "y", seg: 20, mat: "plastic" }));
  // chuck guard, flipped up out of the way
  o.push(box(CX - 13, CX + 6, -16, -14.6, AX + 6, AX + 34, "#f0c23a", { mat: "glass", opacity: 0.3, bevel: 0 }), box(CX - 13, CX + 6, -16, -2, AX + 33, AX + 34.4, "#f0c23a", { mat: "glass", opacity: 0.3, bevel: 0 }));
  return o;
}
function jawParts(op) {
  const o = [], O = op < 1 ? { mat: "steel", bevel: 0, opacity: op } : { mat: "steel", bevel: 0.2 };
  for (let j = 0; j < NJ; j++) { const a = (j * TAU) / NJ, c = Math.cos(a), s = Math.sin(a), R = (y, z) => [y * c - z * s, AX + y * s + z * c];
    o.push(prism([R(-2.7, 4.4), R(2.7, 4.4), R(2.7, 13.6), R(-2.7, 13.6)], "x", CX, CX + 3.2, "#dfe3e7", O), prism([R(-2.7, 4.4), R(2.7, 4.4), R(2.7, 10), R(-2.7, 10)], "x", CX + 3.2, CX + 5.4, "#dfe3e7", O), prism([R(-2.7, 4.4), R(2.7, 4.4), R(2.7, 7), R(-2.7, 7)], "x", CX + 5.4, CX + 7.4, "#dfe3e7", O));
    const a2 = a + TAU / (NJ * 2), c2 = Math.cos(a2), s2 = Math.sin(a2), R2 = (y, z) => [y * c2 - z * s2, AX + y * s2 + z * c2];
    o.push(prism([R2(-0.5, 4.6), R2(0.5, 4.6), R2(0.5, 13.4), R2(-0.5, 13.4)], "x", CX, CX + 0.08, "#2f3338", { bevel: 0, flat: true, ...(op < 1 ? { opacity: op } : {}) })); }
  return o;
}
const blurParts = () => [lathe([[4.4, 0], [4.4, 7.4], [7, 7.4], [7, 5.4], [10, 5.4], [10, 3.2], [13.6, 3.2], [13.6, 0], [4.4, 0]], "#d5dade", { c: [CX, 0, AX], axis: "x", seg: 44, mat: "satin", opacity: 0.62 })];
function lampParts() {
  const z = G3.LAMP_Z, o = [];
  o.push(tube([[G3.LAMP_X, 0, z + 14], [G3.LAMP_X, 0, z + 60]], 0.8, "#1d1f22", { seg: 6, mat: "rubber" }), lathe([[0, 14], [5, 14], [6, 8], [17, 2], [18, 0], [16.6, 0], [15.6, 1], [0, 1]], "#3a3e44", { c: [G3.LAMP_X, 0, z], seg: 40, mat: "paint" }), cyl(G3.LAMP_X, 0, 15.4, z + 0.2, z + 1, "#fff4d6", 36, { mat: "glass", bevel: 0, emit: ["#ffe9b0", 0.5], emitK: 2 }));
  return o;
}
// crash-test dummy, minus its head and its right arm (those leave separately)
function bodyParts() {
  const o = [], { x, y } = DM, Y = { mat: "paint" };
  for (const sx of [-6.5, 6.5]) { o.push(tube([[x + sx, y, 92], [x + sx, y + 1.5, 52]], [6, 5], YEL, { seg: 14, ...Y }), sphere([x + sx, y + 1.5, 50], 5.2, BLK, { mat: "plastic" }), tube([[x + sx, y + 1.5, 48], [x + sx, y, 9]], [4.6, 3.6], YEL, { seg: 14, ...Y }), prism(rrect(x + sx - 4.4, x + sx + 4.4, y - 14, y + 5, 3), "z", 0, 7, BLK, { mat: "rubber" })); }
  o.push(prism(rrect(x - 13, x + 13, y - 7, y + 7, 5), "z", 88, 100, BLK, { mat: "plastic", bevel: 2 }), prism(rrect(x - 14, x + 14, y - 8, y + 8, 6), "z", 100, 146, YEL, { ...Y, bevel: 3 }), cyl(x, y, 4, 146, 153, BLK, 16, { mat: "plastic" }));
  for (const [px, pz] of [[x, 126], [x - 8, 112], [x + 8, 112]]) o.push(prism(circle(px, pz, 3.2, 20), "y", y + 8, y + 8.2, "#ffffff", { bevel: 0, flat: true }), prism(circle(px, pz, 1.3, 14), "y", y + 8.2, y + 8.3, BLK, { bevel: 0, flat: true }));
  // left arm, hanging
  o.push(sphere([x - 17, y, 141], 5, BLK, { mat: "plastic" }), tube([[x - 17, y, 141], [x - 18, y + 1, 117]], [4.4, 3.8], YEL, { seg: 12, ...Y }), sphere([x - 18, y + 1, 116], 4, BLK, { mat: "plastic" }), tube([[x - 18, y + 1, 116], [x - 17.5, y - 3, 95]], [3.6, 3], YEL, { seg: 12, ...Y }), sphere([x - 17.5, y - 3.4, 92], 4, BLK, { mat: "plastic" }));
  o.push(sphere([x + 17, y, 141], 5, BLK, { mat: "plastic" }));
  return o;
}
function headParts() { const { x, y } = DM; return [sphere([x, y - 1, 163], 10, YEL, { mat: "paint" }), prism(circle(y - 1, 164, 3.4, 20), "x", x + 9.6, x + 9.9, "#ffffff", { bevel: 0, flat: true }), prism(circle(y - 1, 164, 3.4, 20), "x", x - 9.9, x - 9.6, "#ffffff", { bevel: 0, flat: true })]; }
const SH = [DM.x + 17, DM.y, 141], REST = [DM.x + 18, DM.y - 3.4, 93], GRAB = [CX + 3, 12.6, AX + 5];
function armPts(k) { const h = [0, 1, 2].map((i) => REST[i] + (GRAB[i] - REST[i]) * k), mid = [(SH[0] + h[0]) / 2 + 3, (SH[1] + h[1]) / 2 + 3 * (1 - k), (SH[2] + h[2]) / 2 - 9 * (1 - 0.6 * k)]; return [SH, mid, h]; }
const armParts = (k) => { const [s, e, h] = armPts(k); return [tube([s, e], [4.4, 3.8], YEL, { seg: 12, mat: "paint" }), sphere(e, 4, BLK, { mat: "plastic" }), tube([e, h], [3.6, 3], YEL, { seg: 12, mat: "paint" }), sphere(h, 4, BLK, { mat: "plastic" })]; };
const C0 = [DM.x, DM.y, 112];
// where everything is, c seconds after the sleeve was caught
function wreck(c) {
  // body: dragged in, wound over the top, thrown down the back to land flat on the floor
  let body = wreckBody(Math.min(c, 0.95));
  if (c > 0.95) { const rel = apply(body, C0), psi0 = Math.atan2(C0[2] - AX, C0[1]), a0 = 2.25 + 0.35, tl = 0.6, t = Math.min(c - 0.95, tl), k = t / tl, end = [22, -62, 9];
    const cen = [rel[0] + (end[0] - rel[0]) * k, rel[1] + (end[1] - rel[1]) * k, Math.max(9, rel[2] + ((end[2] - rel[2] + 260 * tl * tl) / tl) * t - 260 * t * t)];
    body = mul(trans(cen[0] - C0[0], cen[1] - C0[1], cen[2] - C0[2]), mul(rotY((Math.PI / 2) * sm(0, 1, k), C0), rotX(a0 + (TAU - a0) * k, C0))); }
  // head: stays on till the top of the arc, then leaves towards the camera
  let head = body;
  if (c > 0.5) { const p0 = apply(wreckBody(0.5), [DM.x, DM.y, 163]), tl = (150 + Math.sqrt(22500 + 1040 * (p0[2] - 10))) / 520, t = Math.min(c - 0.5, tl), p = [p0[0] + 74 * t, p0[1] + 40 * t, Math.max(10, p0[2] + 150 * t - 260 * t * t)]; head = mul(trans(p[0] - DM.x, p[1] - DM.y, p[2] - 163), rotX(-7 * t, [DM.x, DM.y, 163])); }
  // arm: off at the shoulder, twice round with the chuck, then flung out the front
  let arm = null;
  if (c > 0.16) { arm = rotX((Math.min(c, 0.8) - 0.16) * 13, [0, 0, AX]);
    if (c > 0.8) { const h0 = apply(arm, GRAB), tl = (120 + Math.sqrt(14400 + 1200 * (h0[2] - 5))) / 600, t = Math.min(c - 0.8, tl); arm = mul(trans(-22 * t, 70 * t, 120 * t - 300 * t * t), mul(rotX(5 * t, h0), arm)); const lo = Math.min(apply(arm, GRAB)[2], apply(arm, SH)[2]); if (lo < 4) arm = mul(trans(0, 0, 4 - lo), arm); } }
  return { body, head, arm };
}
function wreckBody(c) { const psi0 = Math.atan2(C0[2] - AX, C0[1]), r = 42 - 22 * sm(0.14, 0.42, c), tw = sm(0.3, 0.95, c), psi = psi0 + 2.25 * tw * tw, cen = [C0[0], r * Math.cos(psi), AX + r * Math.sin(psi)]; return mul(trans(0, cen[1] - C0[1], cen[2] - C0[2]), rotX(psi - psi0 + 0.35 * sm(0, 0.16, c), C0)); }

const scope = { w: q("#sc-w"), t: q("#sc-t"), lab: q("#sc-lab") };
function drawScope(s) {
  const X0 = 8, X1 = 282, Y0 = 14, Y1 = 62, WIN = 0.04, fL = flick(), n = 220; let d = "";
  for (let i = 0; i <= n; i++) { const t = (i / n) * WIN, ph = (t * fL) % 1, v = light === 0 ? 0.97 + 0.03 * Math.abs(Math.sin(Math.PI * t * 100)) : light === 1 ? Math.abs(Math.sin(Math.PI * t * 100)) : ph < duty / 100 ? 1 : 0; d += (i ? "L" : "M") + (X0 + (X1 - X0) * (i / n)).toFixed(1) + " " + (Y1 - v * (Y1 - Y0)).toFixed(1); }
  scope.w.setAttribute("d", d);
  let tk = ""; const fj = spin * NJ;
  if (fj > 0.5 && fj < 2500) { const per = 1 / fj, off = (((appA / (TAU / NJ)) % 1) + 1) % 1; for (let k = 0; (k + off) * per < WIN && k < 120; k++) { const x = X0 + (((k + off) * per) / WIN) * (X1 - X0); tk += "M" + x.toFixed(1) + " 72V84"; } }
  scope.t.setAttribute("d", tk);
  scope.lab.textContent = s.stopped ? "chuck stopped" : fj >= 2500 ? "" : "a jaw comes past every " + (1000 / fj).toFixed(1) + " ms";
}
let fx = [];
function draw(dt = 0) {
  const s = lastSeen || seen(spin), truth = E.xray > 0.5, PL = D.PLATE, c = grabbed() ? now - grabAt : -1, W = c >= 0 ? wreck(c) : null;
  const objs = [{ cache: "lathe", rev: 0, parts: latheParts }, { cache: "lamp", rev: 0, parts: lampParts }];
  // the jaws as the eye gets them: solid if the light freezes them, ghosts if it half does, a blur if it doesn't
  const vis = truth ? 0 : s.vis, jm = (a) => rotX(a, [0, 0, AX]);
  if (s.stopped) objs.push({ cache: "jaws", rev: 0, m: jm(realA), parts: () => jawParts(1) });
  else if (vis >= 0.62 && s.q === 1) objs.push({ cache: "jaws", rev: 0, m: jm(appA), parts: () => jawParts(1) });
  else { objs.push({ cache: "blur", rev: 0, parts: blurParts }); if (vis >= 0.12) for (let k = 0; k < s.q; k++) objs.push({ cache: vis > 0.4 ? "jawsG" : "jawsF", rev: 0, m: jm(appA + (k * TAU) / (NJ * s.q)), parts: () => jawParts(vis > 0.4 ? 0.62 : 0.3) }); }
  // dummy
  const shake = burst(now - shakeAt, 0.05, 0.5) * Math.sin((now - shakeAt) * 16) * 0.5;
  objs.push({ cache: "body", rev: 0, m: W ? W.body : undefined, parts: bodyParts }, { cache: "head", rev: 0, m: W ? W.head : shake ? rotZ(DM.x, DM.y, shake) : undefined, parts: headParts });
  if (W && W.arm) objs.push({ cache: "armLoose", rev: 0, m: W.arm, parts: () => armParts(1) }); else objs.push({ parts: armParts(W ? 1 : reach), xf: W ? ((m) => (p) => { const b = apply(m, p), k = clamp((p[1] - GRAB[1]) / (SH[1] - GRAB[1]), 0, 1); return [p[0] + (b[0] - p[0]) * k, p[1] + (b[1] - p[1]) * k, p[2] + (b[2] - p[2]) * k]; })(W.body) : undefined });
  let svg = E.render(objs);
  // light: a pool on the floor and a glow in the air
  E.sprite([G3.LAMP_X, 6, 1], 70, "#ffe9b0", 0.09, true); E.sprite([G3.LAMP_X, 0, AX + 30], 34, "#ffe9b0", 0.05, true); E.sprite([G3.LAMP_X, 0, G3.LAMP_Z - 3], 18, "#fff4d6", 0.2, true);
  // truth view: streaks round the chuck, because it is in fact going round
  if ((truth || vis < 0.5) && spin > 0.5) { const k2 = clamp(spin / 20, 0.2, 1) * (truth ? 1 : 0.5); for (let j = 0; j < 7; j++) { const a0 = realA * 3 + j * 0.9, R = 14.2 + (j % 3) * 0.5, x = CX - 2 - j * 1.4; let prev = null; for (let i = 0; i <= 6; i++) { const a = a0 + i * 0.14, p = [x, R * Math.cos(a), AX + R * Math.sin(a)]; if (prev) E.line(prev, p, 1.4, lightTheme ? "#3a4048" : "#e8eef4", 0.5 * k2 * (i / 6)); prev = p; } } }
  // the wreck: stuffing, bits, and the stop button being found too late
  if (W) {
    if (dt > 0 && c < 1.1) for (let j = 0; j < 3; j++) fx.push({ k: "fluff", p: [CX + (rn() - 0.3) * 14, (rn() - 0.5) * 24, AX + (rn() - 0.5) * 24], v: [(rn() - 0.3) * 120, (rn() - 0.3) * 140, 40 + rn() * 130], life: 0, max: 0.6 + rn() * 0.7 });
    if (dt > 0 && c > 0.14 && c < 0.24) for (let j = 0; j < 6; j++) fx.push({ k: "fluff", p: [SH[0], SH[1] - 8, SH[2]], v: [(rn() - 0.5) * 90, (rn() - 0.5) * 90, 30 + rn() * 90], life: 0, max: 0.5 + rn() * 0.5 });
    if (!estop && c > 1.25) { estop = true; }
  }
  fx = fx.filter((p) => { p.life += dt; if (p.life > p.max) return false; const t = p.life / p.max; p.v[2] -= 260 * dt; for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * dt; if (p.p[2] < 1) { p.p[2] = 1; p.v = [0, 0, 0]; } E.sprite(p.p, 1.6 + 1.6 * t, lightTheme ? "#b8a888" : "#efe6cf", 0.9 * (1 - t * t)); return true; });
  // lettering: the tacho on the headstock tells the truth the whole time
  let m = E.faceMatrix([-72, -16, AX + 22.65], [1, 0, 0], [0, 1, 0]);
  if (m) svg += '<g transform="' + m + '"><text class="pt lcd" x="28.4" y="9.6" font-size="7.4" text-anchor="end">' + String(Math.round(spin * 60)).padStart(4, "0") + '</text><text class="pt lcd lo" x="1.6" y="3.4" font-size="2.4">RPM</text></g>';
  m = E.faceMatrix([PL.x + PL.w - 74, PL.y + PL.d - 13, 0.05], [1, 0, 0], [0, 1, 0]);
  if (m) svg += '<g transform="' + m + '"><text class="pt bench" x="0" y="5" font-size="5">MACHINE SHOP</text></g>';
  if (!W) { const p = E.project([CX + 14, -6, AX + 30]); svg += '<text class="mk-lab lk" data-s="' + (truth ? "truth" : fooled(s) ? "bad" : "ok") + '" x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '">' + (truth ? "really: " + Math.round(spin * 60) + " rpm" : "looks " + looksText(s)) + "</text>"; }
  if (E.xray > 0.02 && !W) svg += E.callouts([
    { p: [G3.LAMP_X, 0, G3.LAMP_Z + 2], text: ["Good driver", "Cheap driver", "PWM dimming"][light], sub: light === 0 ? "steady light, a few per cent of ripple" : light === 1 ? "light pulses 100 times a second" : pwmF + " pulses a second, on " + duty + " % of the time" },
    { p: [CX + 4, 0, AX + 13.6], text: "Three-jaw chuck", sub: "looks the same every third of a turn" }, { p: [-56, -4, 28], text: "Motor and belt", sub: "what's actually turning it" },
  ], E.xray, E.fs < 0.62 ? {} : { topL: 70, topR: 70 });
  if (sceneG.innerHTML !== svg) sceneG.innerHTML = svg;
  drawScope(s);
  if (W) { const A = 6 * Math.exp(-c / 0.5) * (c < 1.6 ? 1 : 0); setShake(A * Math.sin(c * 90), A * Math.cos(c * 71)); flashEl.style.opacity = (0.35 * burst(c, 0.03, 0.2)).toFixed(3);
    if (c > END) { grabAt = null; estop = false; reach = 0; reachGoal = 0; fx = []; setShake(0, 0); flashEl.style.opacity = "0"; say("New dummy. The light is the same, so the chuck will look just as stopped as last time. Fix the light, or drop the guard and use the stop button before reaching in."); } }
  const text = W ? (c < 1.25 ? "CAUGHT · " + Math.round(spin * 60) + " rpm" : "E-stop · spinning down, " + Math.round(spin * 60) + " rpm")
    : Math.round(spin * 60) + " rpm · light " + (light === 0 ? "steady" : flick() + " Hz" + (light === 2 ? " at " + duty + " %" : "")) + " · looks " + looksText(s);
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuetext", text);
}

// ---------------- running it ----------------
const TOUR = [
  { light: 0, rpm: 1500, wait: 2.6, say: "A lathe under a good LED driver: steady light. At 1,500 rpm the chuck is a blur, which is the truth.", reach: true },
  { light: 1, rpm: 1500, wait: 2.4, say: "Same lathe, cheap driver: the light pulses 100 times a second. Still a blur at this speed." },
  { light: 1, rpm: 1940, wait: 3.2, say: "Wind it up. Near 2,000 rpm a jaw arrives for nearly every flash, and the chuck seems to crawl backwards." },
  { light: 1, rpm: 2000, wait: 2.6, say: "At 2,000 rpm exactly, a jaw is in the same place for every flash. It looks parked.", reach: true, hold: 6.2 },
  { light: 2, pwmF: 200, duty: 20, rpm: 2000, wait: 3.4, say: "PWM dimming at 200 Hz: twice the flashes, so six jaws standing still." },
  { light: 2, pwmF: 1500, duty: 20, rpm: 2000, wait: 3.2, say: "PWM at 1,500 Hz: far too many flashes per turn to freeze anything. Back to an honest blur.", reach: true },
];
function tick(t) {
  const dt0 = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60, dt = dt0 * (slow ? 0.25 : 1);
  last = t; now += dt;
  if (touring && !grabbed()) {
    tourWait -= dt0;
    if (tourWait <= 0) {
      const cur = TOUR[Math.max(0, tourStep)];
      if (tourStep >= 0 && cur.reach && !cur.done) { cur.done = true; doReach(); tourWait = cur.hold || 2.4; }
      else { tourStep = (tourStep + 1) % TOUR.length; const st = TOUR[tourStep]; st.done = false; light = st.light; rpm = st.rpm; if (st.pwmF) pwmF = st.pwmF; if (st.duty) duty = st.duty; tourWait = st.wait; say(st.say); }
    }
  }
  step(dt);
  draw(dt); syncUi();
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { touring = false; };
const guard = (fn) => (...a) => { takeOver(); if (grabbed()) return; fn(...a); run(); };
const setRpm = guard((v) => { rpm = clamp(Math.round(v / 10) * 10, 0, 3000); });
const setLight = guard((i) => { light = (i + 3) % 3; });
const setPwm = guard((v) => { pwmF = clamp(Math.round(v / 50) * 50, 100, 3000); });
const setDuty = guard((v) => { duty = clamp(Math.round(v / 5) * 5, 10, 90); });
const go = guard(() => doReach());
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
for (const [key, el, fn] of [["rpm", ui.rpm, setRpm], ["pwm", ui.pwm, setPwm], ["duty", ui.duty, setDuty]]) {
  el.addEventListener("input", () => { sliding[key] = true; fn(+el.value); });
  el.addEventListener("change", () => { sliding[key] = false; run(); });
}
ui.lt.forEach((b, i) => b.addEventListener("click", () => setLight(i)));
ui.go.addEventListener("click", go);
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; tourWait = 0; } run(); });
onTap(go);
stage.addEventListener("keydown", (ev) => {
  const big = ev.shiftKey ? 100 : 10, map = { x: () => { setX(!E.xrayOn); run(); }, X: () => { setX(!E.xrayOn); run(); }, ArrowUp: () => setRpm(rpm + big), ArrowDown: () => setRpm(rpm - big), ArrowRight: () => setRpm(rpm + big), ArrowLeft: () => setRpm(rpm - big), l: () => setLight(light + 1), " ": go, Enter: go, s: () => { slow = !slow; run(); } };
  if (map[ev.key]) { ev.preventDefault(); map[ev.key](); }
});
window.__fig = { E, freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; }, set: (o) => { takeOver(); if (o.rpm !== undefined) { rpm = o.rpm; spin = rpm / 60; } if (o.light !== undefined) light = o.light; if (o.pwmF !== undefined) pwmF = o.pwmF; if (o.duty !== undefined) duty = o.duty; }, reach: doReach };
setX(false); say("A lathe, a light, and a dummy who believes what it sees. Change the speed and the light, then tell it to reach in."); syncUi(); draw();

`;

const CSS = `.fx-flash{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(circle 60% at 45% 45%,#ffffff 0%,#ffe9c8 40%,rgba(255,200,140,0) 100%)}
.pt{font-family:var(--anatomy-mono);fill:#23262b;font-weight:700}.pt.lcd{fill:#ff5a3a}.pt.lcd.lo{fill:#b0503c;font-weight:600}.pt.bench{fill:var(--anatomy-muted);font-weight:600;letter-spacing:.08em;opacity:.8}
.lk{font-size:calc(12.5px*var(--mk-ts,1))}.lk[data-s="bad"]{fill:var(--mk-danger)}.lk[data-s="truth"]{fill:var(--mk-accent)}
@media (min-width:561px){.mk-hint{top:46px}}
.scope{width:290px;height:100px;top:40px;left:14px}.scope svg{display:block;width:100%;height:100%}
.scope .ax{fill:none;stroke:var(--anatomy-mid);stroke-width:.8}.scope .st{font:8.5px var(--anatomy-mono);fill:var(--anatomy-muted)}
.scope .tr{fill:none;stroke:#ffd27a;stroke-width:1.6;stroke-linejoin:round}.scope .tk{fill:none;stroke:var(--mk-accent);stroke-width:1.6}
body[data-theme="light"] .scope .tr{stroke:#c8501a}
@media (max-width:560px){.scope{width:54%;height:auto;aspect-ratio:290/100;top:auto;bottom:10px;left:10px}}
.ctl #reach{padding:7px 16px;font-weight:600;letter-spacing:.06em}
.slide{padding-top:12px}.notch{position:absolute;top:8px;bottom:0;width:0;border-left:2px solid var(--mk-danger);pointer-events:none}.notch::after{content:attr(data-label);position:absolute;bottom:100%;right:-2px;font-size:9.5px;white-space:nowrap;color:var(--mk-danger)}
.pwm-row[data-off="true"]{opacity:.38}
.ctl .looks{min-width:0;flex:1;text-align:left;font-weight:600;color:var(--anatomy-strong)}`;

const stage = stageHtml({
  W, H, fig: "Fig 28", title: "Stroboscopic effect", xray: true,
  label: "A bench lathe in a machine shop with a three-jaw chuck, under a pendant LED light. A crash-test dummy stands at the lathe. Depending on the spindle speed and how the light pulses, the chuck appears blurred, slowly turning, or stopped. If the dummy is told to reach in while a spinning chuck looks stopped, it is caught and thrown. An x-ray view shows the true motion.",
  keysHelp: "Stroboscopic effect: drag to rotate, X for the truth view, tap or space tells the dummy to reach in; arrows change the spindle speed (shift for big steps), L the light, S slow motion",
  extra: `<div class="mk-inset scope" aria-hidden="true"><svg viewBox="0 0 290 100"><text class="st" x="8" y="10">light output, 40 ms</text><path class="ax" d="M8 62H282"/><path id="sc-w" class="tr" d=""/>
<path id="sc-t" class="tk" d=""/><text id="sc-lab" class="st" x="8" y="96"></text></svg></div><div class="fx-flash" aria-hidden="true"></div>`,
});

const CONTROLS = `<div class="ctl" role="group" aria-label="Lathe and lighting controls">
  <div class="ctl-row"><span class="ctl-label">Spindle</span><div class="slide"><span id="rpm-notch" class="notch" data-label=""></span><input id="rpm" type="range" min="0" max="3000" step="10" value="${START.rpm}" aria-label="Spindle speed in revolutions per minute"></div><output id="rpm-out"></output></div>
  <div class="ctl-row"><span class="ctl-label">Light</span><button type="button" data-light="0" aria-pressed="true">Good driver<small>steady</small></button><button type="button" data-light="1" aria-pressed="false">Cheap driver<small>100 Hz ripple</small></button><button type="button" data-light="2" aria-pressed="false">PWM dimmed<small>pulsed</small></button></div>
  <div class="ctl-row pwm-row"><span class="ctl-label">PWM rate</span><div class="slide"><input id="pwm" type="range" min="100" max="3000" step="50" value="${START.pwmF}" aria-label="PWM frequency in hertz"></div><output id="pwm-out"></output></div>
  <div class="ctl-row pwm-row"><span class="ctl-label">Dimmed to</span><div class="slide"><input id="duty" type="range" min="10" max="90" step="5" value="${START.duty}" aria-label="PWM duty cycle in per cent"></div><output id="duty-out"></output></div>
  <div class="ctl-row"><span class="ctl-label">It looks</span><output id="looks" class="looks"></output></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="reach" class="danger">REACH IN</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
</div>`;

const foot = footHtml({
  theme, slug: "strobe-lathe",
  real: "the arithmetic: under light pulsing at f hertz a three-jaw chuck looks stopped at 20 x f rpm and its multiples, and seems to turn slowly either side of that. Rectified 50 Hz mains ripples at 100 Hz. SVM is the stroboscopic visibility measure for 80 Hz to 2 kHz: at 1 an average observer spots the effect half the time, and the EU ecodesign limit is 0.4.",
  made: "how sharp each light makes the frozen image, the dummy's judgement, and what the lathe does to it. X-ray here is a truth view: it shows the blur that is really there.",
});
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), pageMk2({
  k, title: "Stroboscopic effect", fig: "Fig 28", hint: "Tap: reach in", theme, W, H, stage, controls: CONTROLS, css: CSS, foot,
  caption: "A light that pulses can freeze something that spins. A three-jaw chuck looks the same every third of a turn, so if it turns exactly a third between one pulse of light and the next, every pulse shows the jaws in the same place and the chuck looks parked. Under light that pulses 100 times a second, which is what rectified 50 Hz mains gives a driver with no smoothing, that happens at 2,000 rpm. A little slower and it seems to creep backwards; a little faster, forwards. PWM dimming pulses the light on purpose, and how safe that is comes down to the rate: slow PWM freezes things, fast PWM puts so many pulses in each turn that it blurs like steady light. The measure for all this is SVM. The fix is in the driver, not in the person at the machine.",
  script: LIVE.replace("__DATA__", JSON.stringify(DATA)),
}));
console.log("wrote", name);
