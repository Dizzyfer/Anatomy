import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { engineScript, stageHtml, pageMk2, footHtml } from "../../mk2/shell.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const W = 960, H = 600;

// Truth: WEG W22 IE3, 7.5 kW 4-pole 132M, 400 V 50 Hz: 14.2 A, 1460 rpm, Il/In 8.3, Tl/Tn 2.4, Tb/Tn 3.5,
// class F (155 °C), 80 K rise, locked rotor time 12 s cold / 7 s hot, J 0.0563 kg·m². Class 10 overload: trips at 7.2 × Ie in 4 to 10 s.
// Star: a third of the current and a third of the torque. Toy: the circuit is fitted to those ratios; the load, its inertia,
// the timers, the drive, the supply dip, the thermal model and the burnout temperature are made up.
const MODEL = {
  ckt: { r1: 0.07457, x: 0.042, xm: 2.9428, r2a: 0.02953, r2b: 0.00524 },
  In: 0.88166, Tn: 0.75077, amps: 14.2, rpm: 1500, tnNm: 49, jMotor: 0.0563,
  load: { fan: { j: 1.4, t0: 0.05, t2: 0.92 }, conv: { j: 0.8, t0: 0.95, t2: 0 }, jam: { j: 0, t0: 99, t2: 0 } },
  sdTimer: 3, sdGap: 0.06, vfdRamp: 5, vfdLimit: 1.5, vfdStall: 3, zs: 0.012,
  amb: 40, kHeat: 0.139, tauW: 575, classF: 155, burn: 200, tauOl: 330, olTrip: 1.44,
};

const MC = [24, 8];
const RO = 34, RF = 31, RB = 21.5, RR = 20;
const Z0 = 6, ZC = 56, ZW = 62, ZR0 = 8, ZR1 = 58, ZFAN = 100;
const PANEL = { x: -110, y: -64, w: 16, d: 46 };
const PZ = 66;
const BULB = [-100, 44];
const TBOX = { x: MC[0] + 31, y: MC[1] - 21, w: 8, d: 11 };
const PLATE = { x: -122, y: -78, w: 200, d: 150, r: 8 };
const P = k.fitProjection([...k.boxCorners(PLATE, -0.8, 0), [-12, -28, 104], [60, 44, 104], [-110, -64, 70], [-100, 44, 58], [60, -28, 104]], W, H, { pad: 24, azimuth: 45, elevation: 30 });
const DATA = { W, H, P, PLATE };
Object.assign(DATA, { MODEL, MC, RR, ZR1, ZFAN, BULB, PANEL, PZ, TBOX, GEO: { RO, RF, RB, Z0, ZC, ZW, ZR0 } });
const LIVE = `
${engineScript()}
const D = __DATA__;
const stage = document.querySelector(".mk-stage");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lightTheme = document.body.dataset.theme === "light";
const E = mk2(stage, D.P, { W: D.W, H: D.H, pivot: [0, 0, 40], plate: { ...D.PLATE, h: 12, foot: 5 }, shadowBox: [-130, -86, -18, 86, 80, 112] });
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
// the equivalent circuit, per unit; a = supply frequency (pu of 50 Hz), V = phase voltage (pu)
const ck = M.ckt;
function motorAt(s, V, a) {
  if (V <= 0 || a <= 0) return { I: 0, T: 0 };
  s = Math.max(s, 1e-4);
  const R2 = ck.r2a + ck.r2b * Math.sqrt(Math.min(1, s * a));
  const zr = [R2 / s, ck.x * a], zm = [0, ck.xm * a];
  const num = [zr[0] * zm[0] - zr[1] * zm[1], zr[0] * zm[1] + zr[1] * zm[0]], den = [zr[0] + zm[0], zr[1] + zm[1]];
  const dd = den[0] * den[0] + den[1] * den[1];
  const zp = [(num[0] * den[0] + num[1] * den[1]) / dd, (num[1] * den[0] - num[0] * den[1]) / dd];
  const z = [ck.r1 + zp[0], ck.x * a + zp[1]];
  const I = V / Math.hypot(z[0], z[1]);
  const vp = I * Math.hypot(zp[0], zp[1]), i2 = vp / Math.hypot(zr[0], zr[1]);
  return { I: I / M.In, T: (i2 * i2 * R2 / s / a) / M.Tn };
}

let starter = "dol", loadKind = "fan", olOn = true;
let Iwind = 0, on = false, w = 0, tOn = 0, phase = "off", hz = 0, vfdStallT = 0, Iline = 0, Tm = 0, Tl = 0, vt = 1, temp = M.amb, olTh = 0, tripped = "", dead = false, deadAt = -10;
let thF = 0, thR = 0, thE = 0;
let frame = 0, last = 0, now = 0, visible = false, touring = true, slow = false, tourClock = 0, tourStep = -1, actions = [], lastShot = "";
const hist = [];
const VIS = 1 / 40;

const ui = {
  st: [...document.querySelectorAll("[data-st]")], ld: [...document.querySelectorAll("[data-ld]")], ol: [...document.querySelectorAll("[data-olb]")],
  tFill: document.querySelector("#t-fill"), tOut: document.querySelector("#t-out"),
  vFill: document.querySelector("#v-fill"), vOut: document.querySelector("#v-out"),
  stats: document.querySelector("#stats"), go: document.querySelector("#go"), fresh: document.querySelector("#fresh"),
  slow: document.querySelector("#slow"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"), scope: document.querySelector("#scope"),
};
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };
const L = () => M.load[loadKind];
const loadT = (w) => loadKind === "jam" ? 0 : L().t0 * (w > 0.002 ? 1 : 1.05) + L().t2 * w * w;
const NAMES = { dol: "Direct on line", sd: "Star-delta", vfd: "VFD" };

function start() {
  if (dead) { say("It's burnt out. Nothing's starting that until it's been rewound."); return; }
  if (olOn && tripped === "ol" && olTh > 1.1) { say("The overload hasn't cooled enough to reset yet. Give it a moment."); return; }
  tripped = ""; on = true; tOn = 0; hz = 0; vfdStallT = 0;
  phase = starter === "sd" ? "star" : starter === "vfd" ? "ramp" : "run";
}
function stop(why) { on = false; phase = "off"; hz = 0; if (why) tripped = why; }

function step(dt) {
  if (on) tOn += dt;
  // what the starter is feeding the motor
  let V = 0, a = 1, lineK = 1;
  if (on) {
    if (starter === "dol") { V = vt; }
    else if (starter === "sd") {
      if (phase === "star" && tOn >= M.sdTimer) phase = "gap";
      if (phase === "gap" && tOn >= M.sdTimer + M.sdGap) phase = "delta";
      if (phase === "star") { V = vt / Math.sqrt(3); lineK = Math.sqrt(3); }
      else if (phase === "delta") V = vt;
    } else {
      const lim = Iline > M.vfdLimit;
      if (phase === "ramp") { if (!lim) hz = Math.min(1, hz + dt / M.vfdRamp); if (hz >= 1) phase = "run"; }
      a = Math.max(0.02, hz); V = Math.min(1, 0.03 + 0.97 * a);
      if (lim && w < 0.05 && hz < 0.2) vfdStallT += dt; else vfdStallT = Math.max(0, vfdStallT - dt);
    }
  }
  const sync = starter === "vfd" ? Math.max(0.02, hz) : 1;
  const r = on && V > 0 ? motorAt((sync - w) / sync, V, starter === "vfd" ? a : 1) : { I: 0, T: 0 };
  // star: each winding sees V/√3, so its current is 1/√3 of DOL, and the line no longer carries √3 windings' worth: a third
  Iline = phase === "star" ? r.I / lineK : r.I;
  Iwind = r.I;
  Tm = r.T; Tl = loadT(w);
  const J = M.jMotor + L().j;
  if (loadKind === "jam") w = 0;
  else {
    let net = Tm - Tl;
    if (w <= 0 && net < 0) net = 0;
    w = Math.max(0, w + (net * M.tnNm / (J * 2 * Math.PI * M.rpm / 60)) * dt);
  }
  // supply: the light on the same board dips with the current drawn
  const Isup = starter === "vfd" ? Math.max(0.04, Tm * w * 1.15) : Iline;
  vt = 1 - M.zs * Isup;
  // winding temperature and the overload relay (both see the winding/line current)
  const Iw = Iwind;
  temp += (M.kHeat * Iw * Iw - (temp - M.amb) / M.tauW) * dt;
  olTh += (Iw * Iw - olTh) / M.tauOl * dt;
  if (on && olOn && starter !== "vfd" && olTh > M.olTrip) { stop("ol"); }
  if (on && starter === "vfd" && vfdStallT > M.vfdStall) stop("vfd");
  if (!dead && temp > M.burn) { dead = true; deadAt = now; stop("burn"); }
  // what spins, slowed down 40×
  thF += 2 * Math.PI * (on && V > 0 ? sync : 0) * (M.rpm / 60) * VIS * dt;
  thR += 2 * Math.PI * w * (M.rpm / 60) * VIS * dt;
  thE = 2 * thF;
}

// ---------------- the motor, in real 3D ----------------
const TAU = Math.PI * 2, rad = (d) => (d * Math.PI) / 180;
const [MX, MY] = D.MC, G = D.GEO, C0 = [MX, MY, 0];
const pol = (r, a) => [MX + r * Math.cos(a), MY + r * Math.sin(a)];
const FRAME = "#3f6a8f", FRAME_CUT = "#8fb0cc", CORE = "#4b5057", CU = "#c0703f", CU_COOKED = "#2a1a10", ALU = "#c9ced3";
// a ring sector as a prism ring (for windings and the like)
function sector(r0, r1, a0, a1, n = 8) { const o = []; for (let i = 0; i <= n; i++) o.push(pol(r1, a0 + ((a1 - a0) * i) / n)); for (let i = n; i >= 0; i--) o.push(pol(r0, a0 + ((a1 - a0) * i) / n)); return o; }
const KEEP = { c: C0, a0: Math.PI / 2, a1: TAU, seg: 48 };
function motorStatic() {
  const o = [];
  // foot flange
  o.push(prism(rrect(MX - 32, MX + 32, MY - 32, MY + 32, 5), "z", 0, G.Z0, "#365a7a", { mat: "paint" }));
  for (const [dx, dy] of [[-26, -26], [26, -26], [-26, 26], [26, 26]]) o.push(cyl(MX + dx, MY + dy, 2.6, G.Z0, G.Z0 + 1.6, "#aeb4bb", 6, { mat: "steel" }));
  // frame: three quarters of it, with the cut faces showing the casting
  o.push(lathe([[G.RF, G.Z0], [G.RO, G.Z0], [G.RO, G.ZC], [G.RF, G.ZC], [G.RF, G.Z0]], FRAME, { ...KEEP, closed: true, cap: FRAME_CUT, mat: "paint", shell: true }));
  // cooling fins down the outside
  for (let a = 97.5; a < 360; a += 15) { const c = Math.cos(rad(a)), s = Math.sin(rad(a)), t = 0.75; o.push(prism([[G.RO - 0.3, -t], [G.RO + 3.6, -t], [G.RO + 3.6, t], [G.RO - 0.3, t]].map(([r, w]) => [MX + r * c - w * s, MY + r * s + w * c]), "z", G.Z0 + 3, G.ZC - 3, FRAME, { mat: "paint", shell: true, bevel: 0 })); }
  // stator core: a stack of thin steel laminations, so the cut faces read as a stack
  for (let z = G.Z0 + 3; z < G.ZC - 3.2; z += 3.1) o.push(lathe([[G.RB, z], [G.RF - 0.15, z], [G.RF - 0.15, z + 2.7], [G.RB, z + 2.7], [G.RB, z]], CORE, { ...KEEP, seg: 36, closed: true, cap: "#7d848c", mat: "steel", shell: true }));
  // terminal box on the side
  o.push(box(D.TBOX.x, D.TBOX.x + D.TBOX.w, D.TBOX.y, D.TBOX.y + D.TBOX.d, 30, 44, "#365a7a", { mat: "paint" }), box(D.TBOX.x + D.TBOX.w, D.TBOX.x + D.TBOX.w + 0.8, D.TBOX.y + 1, D.TBOX.y + D.TBOX.d - 1, 31, 43, "#4b7aa3", { mat: "paint" }));
  // the supply cable from the starter, along the floor and up into the terminal box
  o.push(tube([[D.PANEL.x + D.PANEL.w, -40, 3], [-40, -40, 2.2], [D.TBOX.x + 4, -40, 2.2], [D.TBOX.x + 4, D.TBOX.y + 4, 2.2], [D.TBOX.x + 4, D.TBOX.y + 4, 30]], 1.7, "#1f2023", { seg: 8, mat: "rubber" }));
  // starter panel
  const PN = D.PANEL;
  o.push(box(PN.x, PN.x + PN.w, PN.y, PN.y + PN.d, 0, D.PZ, "#c9cdd2", { mat: "paint" }), box(PN.x + PN.w, PN.x + PN.w + 0.5, PN.y + 2, PN.y + PN.d - 2, 3, D.PZ - 3, "#d7dade", { mat: "paint" }));
  o.push(box(PN.x + PN.w + 0.5, PN.x + PN.w + 1.6, PN.y + 3.5, PN.y + 5.5, 26, 38, "#2a2d31", { mat: "plastic" }));
  // the light on the same supply
  const [bx, by] = D.BULB;
  o.push(cyl(bx, by, 5, 0, 2, "#3a3d42", 20, { mat: "paint" }), cyl(bx, by, 1, 2, 44, "#8f959d", 10, { mat: "steel" }), cyl(bx, by, 2.6, 44, 47.5, "#2a2d31", 14, { mat: "plastic" }));
  return o;
}
// what turns: the squirrel cage, the shaft and the fan
function rotorParts() {
  const o = [], R = D.RR;
  o.push(cyl(MX, MY, R - 0.4, G.ZR0 + 2, D.ZR1 - 2, "#8f959c", 40, { mat: "satin" }));
  for (const [z0, z1] of [[G.ZR0, G.ZR0 + 2], [D.ZR1 - 2, D.ZR1]]) o.push(lathe([[12, z0], [R, z0], [R, z1], [12, z1], [12, z0]], ALU, { c: C0, seg: 40, closed: true, mat: "metal" }));
  for (let j = 0; j < 18; j++) { const a = (j / 18) * TAU, p0 = pol(R - 0.1, a + 0.12), p1 = pol(R - 0.1, a); o.push(tube([[p0[0], p0[1], G.ZR0 + 2], [p1[0], p1[1], D.ZR1 - 2]], 0.7, ALU, { seg: 4, mat: "metal" })); }
  for (let j = 0; j < 8; j++) { const a = (j / 8) * TAU, c = Math.cos(a), s = Math.sin(a), t = 0.6; o.push(prism([[12, -t], [R - 1, -t], [R - 1, t], [12, t]].map(([r, w]) => [MX + r * c - w * s, MY + r * s + w * c]), "z", D.ZR1, D.ZR1 + 2.2, ALU, { mat: "metal", bevel: 0 })); }
  o.push(cyl(MX, MY, 3.6, G.Z0 - 1, D.ZFAN + 4, "#b4bac1", 18, { mat: "steel" }));
  // fan on the end of the shaft
  o.push(cyl(MX, MY, 6.5, D.ZFAN - 1.5, D.ZFAN + 3.5, "#d5d9de", 20, { mat: "plastic" }));
  for (let j = 0; j < 5; j++) { const a = (j / 5) * TAU, c = Math.cos(a), s = Math.sin(a), sh = [[6, -3], [24, -7], [35, -4.5], [36.5, 1], [34, 6], [6, 3]]; o.push(prism(sh.map(([r, w]) => [MX + r * c - w * s, MY + r * s + w * c]), "z", D.ZFAN, D.ZFAN + 1.4, "#d5d9de", { mat: "plastic" })); }
  return o;
}
let parts = [];
function puff(p, v, max, s, k2) { parts.push({ p, v, life: 0, max, s, k: k2 }); }
const PANEL_LABELS = { k1: "MAIN", k2: "STAR", k3: "DELTA", run: "RUN", ol: "O/L" };
function draw(dt = 0) {
  const cook = dead ? 1 : clamp((temp - 120) / (M.burn - 120), 0, 1), hot = clamp((temp - 110) / 70, 0, 1), cu = mixHex(CU, CU_COOKED, cook * 0.85);
  const mag = clamp(Iline / 2.5, 0, 1) * (on ? 1 : 0), live = [];
  // the windings: 12 coil groups top and bottom, lit by the field going round (N red, S blue) and by how hot they are
  for (let i = 0; i < 12; i++) {
    const a0 = rad(i * 30 + 1.2), a1 = rad(i * 30 + 28.8), ph = Math.cos(2 * rad(i * 30 + 15) - thE), k2 = Math.abs(ph) * (0.25 + 0.75 * mag) * (on ? 1 : 0);
    const cut = i < 3; // the quarter that's cut away keeps only its lower coils, so you can see in
    const col = k2 > 0.03 ? mixHex(cu, ph > 0 ? "#ff4a3d" : "#3d8bff", k2 * 0.85) : cu, em = k2 > 0.03 ? [ph > 0 ? "#ff4a3d" : "#3d8bff", k2 * 0.8] : hot > 0.02 ? ["#ff5a14", hot * 0.9] : undefined;
    if (!cut) live.push(prism(sector(23, 30, a0, a1), "z", G.ZC - 0.4, G.ZW, col, { mat: "copper", emit: em, emitK: 1.5 }));
    live.push(prism(sector(23, 30, a0, a1), "z", G.Z0 + 0.4, G.Z0 + 3.2, cu, { mat: "copper", emit: hot > 0.02 ? ["#ff5a14", hot * 0.9] : undefined }));
  }
  // copper in the slots, on the two cut faces
  for (const a of [Math.PI / 2 + 0.012, TAU - 0.012]) live.push(prism(sector(23.2, 27, a - 0.01, a + 0.01, 1), "z", G.Z0 + 3, G.ZC - 3, cu, { mat: "copper", bevel: 0, emit: hot > 0.02 ? ["#ff5a14", hot] : undefined }));
  // someone's broom in the fan
  if (loadKind === "jam") live.push(box(MX + 6, MX + 9, MY - 4, MY + 62, D.ZFAN - 6, D.ZFAN - 3, "#a0743f", { mat: "matte" }), box(MX + 3, MX + 12, MY + 62, MY + 74, D.ZFAN - 8, D.ZFAN - 1, "#c8a25a", { mat: "matte" }));
  // panel lamps, the drive's screen, and the bulb
  const PN = D.PANEL, fx = PN.x + PN.w + 0.5, lampAt = (u, z, onNow, col) => prism(circle(PN.y + PN.d - u, z, 2.3, 14), "x", fx, fx + 0.9, onNow ? col : "#4a4e55", { mat: "plastic", emit: onNow ? [col, 1] : undefined, emitK: 2.2 });
  const sd = starter === "sd", vfd = starter === "vfd", lamps = [];
  if (!vfd) { lamps.push(["k1", 8, 43, on && phase !== "off", "#3ddc84"]); if (sd) lamps.push(["k2", 20, 43, on && phase === "star", "#3ddc84"], ["k3", 32, 43, on && phase === "delta", "#3ddc84"]); }
  else live.push(box(fx, fx + 0.6, PN.y + PN.d - 37, PN.y + PN.d - 5, 37, 47, "#10261c", { mat: "gloss", emit: ["#1f6a45", 0.5], bevel: 0 }));
  lamps.push(["run", 8, 29, on, "#3ddc84"], ["ol", 20, 29, tripped === "ol" || tripped === "vfd", "#ff4a3d"]);
  for (const l of lamps) live.push(lampAt(l[1], l[2], l[3], l[4]));
  const [bx, by] = D.BULB, bright = clamp((vt - 0.85) / 0.15, 0, 1);
  live.push(sphere([bx, by, 52], 4.6, mixHex("#5a5648", "#ffe7a8", bright), { lat: 8, lon: 14, mat: "gloss", emit: ["#ffdf9a", 0.15 + 0.85 * bright], emitK: 2.6 }));
  let svg = E.render([{ cache: "motor", rev: 0, parts: motorStatic }, { cache: "rotor", rev: 0, m: rotZ(MX, MY, thR), parts: rotorParts }, { parts: live }]);
  // smoke off the windings, and the flash when it finally shorts
  const smokeK = dead ? Math.exp(-(now - deadAt) / 9) * 1.2 + 0.25 : clamp((temp - 160) / 40, 0, 1);
  if (smokeK > 0.02 && dt > 0 && Math.random() < dt * 26 * smokeK) { const a = Math.random() * TAU, p = pol(26, a); puff([p[0], p[1], G.ZW], [(Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, 14 + Math.random() * 10], 2.4 + Math.random() * 1.6, 1, "smoke"); }
  parts = parts.filter((p) => { p.life += dt; if (p.life > p.max) return false; const t = p.life / p.max; for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * dt; E.sprite(p.p, (4 + 15 * t) * p.s, lightTheme ? "#55524e" : "#3a3836", 0.5 * (1 - t)); return true; });
  if (now - deadAt < 0.5) E.sprite([MX + 18, MY + 18, G.ZC + 2], 10 + (now - deadAt) * 40, "#bcd4ff", Math.exp(-(now - deadAt) / 0.12), true, 1);
  // the lettering on the starter door
  const m = E.faceMatrix([fx + 0.05, PN.y + PN.d, D.PZ - 6], [0, -1, 0], [0, 0, -1]);
  if (m) {
    let t = '<text class="pt lo" x="3" y="5" font-size="2.6">STARTER</text><text class="pt hi" x="3" y="10.6" font-size="4">' + (starter === "dol" ? "DOL" : sd ? "STAR-DELTA" : "VFD") + "</text>";
    for (const l of lamps) t += '<text class="pt lo" x="' + l[1] + '" y="' + (D.PZ - 6 - l[2] + 6.2).toFixed(1) + '" font-size="2" text-anchor="middle">' + PANEL_LABELS[l[0]] + "</text>";
    if (vfd) t += '<text class="pt vfd" x="21" y="15.6" font-size="4.6" text-anchor="middle">' + (tripped === "vfd" ? "STALL" : (on ? hz * 50 : 0).toFixed(1) + " Hz") + "</text>";
    t += '<text class="pt" x="27" y="33" font-size="3">' + Math.round(Iline * M.amps) + " A</text>";
    svg += '<g transform="' + m + '">' + t + "</g>";
  }
  if (E.xray > 0.02) svg += E.callouts([
    { p: [...pol(G.RO + 3, rad(200)), 40], text: "Frame and fins", sub: "gets the heat out" }, { p: [...pol(27, rad(120)), G.ZC - 8], text: "Stator core", sub: "laminated steel" },
    { p: [...pol(26.5, rad(60)), G.Z0 + 3], text: "Windings", sub: Math.round(temp) + " °C, class F is 155" }, { p: [...pol(D.RR, rad(30)), 34], text: "Squirrel cage rotor", sub: "bars shorted at both ends" },
    { p: [MX + 30, MY, D.ZFAN + 1], text: "The load", sub: loadKind === "jam" ? "jammed solid" : loadKind === "conv" ? "a loaded conveyor" : "a fan" }, { p: [PN.x + PN.w, PN.y + 20, 50], text: "Starter", sub: NAMES[starter] },
  ], E.xray, E.fs < 0.62 ? {} : { topL: 70 });
  if (sceneG.innerHTML !== svg) sceneG.innerHTML = svg;
  const rpm = Math.round(w * M.rpm);
  const text = dead ? "BURNT OUT · " + Math.round(temp) + " °C" : rpm + " rpm · " + Math.round(Iline * M.amps) + " A · " + Math.round(temp) + " °C windings" + (on ? "" : " · stopped");
  if (readout.textContent !== text) readout.textContent = text;
}

function drawScope() {
  const cv = ui.scope, ctx = cv.getContext("2d"), wpx = cv.clientWidth, hpx = cv.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== Math.round(wpx * dpr)) { cv.width = Math.round(wpx * dpr); cv.height = Math.round(hpx * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, wpx, hpx);
  const cs = getComputedStyle(document.body), lit = cs.getPropertyValue("--anatomy-lit").trim() || "#fff", lo = cs.getPropertyValue("--anatomy-lo").trim() || "#888", mid = cs.getPropertyValue("--anatomy-mid").trim() || "#aaa";
  const span = 10, pad = 4, top = 10, bot = hpx - 14, yI = (i) => bot - (clamp(i, 0, 10) / 10) * (bot - top);
  ctx.font = "10px " + (cs.getPropertyValue("--anatomy-mono") || "monospace"); ctx.lineWidth = 1;
  ctx.strokeStyle = lo; ctx.setLineDash([3, 3]);
  for (const [v, lab, col] of [[1, "1× In", lo], [8.3, "8.3× locked rotor", "#ff6a3d"]]) { ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(pad, yI(v)); ctx.lineTo(wpx - pad, yI(v)); ctx.stroke(); ctx.fillStyle = col; ctx.fillText(lab, pad + 2, yI(v) - 3); }
  ctx.setLineDash([]);
  const t0 = now - span, X = (t) => pad + ((t - t0) / span) * (wpx - pad * 2);
  ctx.strokeStyle = mid; ctx.lineWidth = 1.2; ctx.beginPath();
  hist.forEach((h, i) => { const y = bot - h.w * (bot - top) * 0.9; i ? ctx.lineTo(X(h.t), y) : ctx.moveTo(X(h.t), y); }); ctx.stroke();
  ctx.strokeStyle = lit; ctx.lineWidth = 1.8; ctx.beginPath();
  hist.forEach((h, i) => { i ? ctx.lineTo(X(h.t), yI(h.i)) : ctx.moveTo(X(h.t), yI(h.i)); }); ctx.stroke();
  ctx.fillStyle = lit; ctx.fillText("current", wpx - 112, hpx - 3); ctx.fillStyle = mid; ctx.fillText("speed", wpx - 52, hpx - 3);
}

function syncUi() {
  ui.st.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.st === starter)));
  ui.ld.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.ld === loadKind)));
  ui.ol.forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.olb === "on") === olOn)));
  ui.tFill.style.width = (clamp((temp - 20) / (220 - 20), 0, 1) * 100).toFixed(1) + "%";
  ui.tFill.dataset.state = temp > M.classF ? "bad" : temp > 120 ? "warn" : "ok";
  ui.tOut.textContent = Math.round(temp) + " °C";
  ui.vFill.style.width = (clamp((vt - 0.8) / 0.2, 0, 1) * 100).toFixed(1) + "%";
  ui.vFill.dataset.state = vt < 0.9 ? "bad" : vt < 0.95 ? "warn" : "ok";
  ui.vOut.textContent = Math.round(vt * 415) + " V";
  const sync = starter === "vfd" ? hz : on ? 1 : 0;
  ui.stats.innerHTML = "<b>" + Math.round(w * M.rpm) + "</b> rpm of <b>" + Math.round(sync * M.rpm) + "</b> · <b>" + (Iline).toFixed(1) + "×</b> In (" + Math.round(Iline * M.amps) + " A) · motor torque <b>" + Tm.toFixed(2) + "</b> vs load <b>" + (loadKind === "jam" ? "jammed" : Tl.toFixed(2)) + "</b> × Tn";
  ui.go.textContent = on ? "STOP" : "START"; ui.go.setAttribute("aria-pressed", String(on));
  ui.fresh.style.display = dead ? "" : "none";
  ui.slow.setAttribute("aria-pressed", String(slow));
  ui.tour.setAttribute("aria-pressed", String(touring));
}

function story() {
  if (dead) return say("Burnt out. With the overload bypassed nothing stopped it: the windings went past 155 °C (class F), the insulation cooked, then a phase shorted to the frame and the breaker finally went. It needs rewinding.");
  if (tripped === "ol") return say("The overload tripped at " + Math.round(temp) + " °C. Class 10: at 7.2 × its setting it has to go in 4 to 10 s, and this motor can only stand a locked rotor for about 12 s from cold. That's the race it's there to win.");
  if (tripped === "vfd") return say("The drive held the current at 1.5 × In, saw the shaft not turning and tripped on stall. The motor barely got warm.");
  if (!on) return say(w > 0.02 ? "Coasting down." : "Stopped. Pick a starter and a load and hit START.");
  if (loadKind === "jam" && starter !== "vfd") return say("Locked rotor: " + Iline.toFixed(1) + " × In and it isn't turning, so every bit of that is heat. Windings at " + Math.round(temp) + " °C." + (olOn ? " The overload is counting." : " The overload's bypassed. Nothing is counting."));
  if (phase === "star") return say(w < 0.03 && Tm < Tl ? "Star: a third of the current, but a third of the torque too: " + Tm.toFixed(2) + " × Tn against a load needing " + Tl.toFixed(2) + ". It's not going anywhere, and the timer doesn't know." : "Star: each winding gets 240 V instead of 415, so a third of the current and a third of the torque. " + Iline.toFixed(1) + " × In, coming up to speed.");
  if (phase === "gap") return say("Open transition: star contactor out, delta not in yet.");
  if (phase === "delta" && tOn < M.sdTimer + 1.6 && Iline > 2) return say("Delta: full voltage on each winding. " + (w < 0.3 ? "It hadn't got going in star, so this is the full locked rotor current anyway: " : "A second kick: ") + Iline.toFixed(1) + " × In.");
  if (starter === "vfd" && phase === "ramp") return say("The drive ramps the frequency, " + (hz * 50).toFixed(1) + " Hz, with the voltage in step. The field only ever runs a little ahead of the rotor, so the current stays near " + Iline.toFixed(1) + " × In.");
  if (starter === "dol" && Iline > 2) return say("Direct on line: full 415 V from standstill. " + Iline.toFixed(1) + " × In while the field whips round and the rotor catches up. Watch the light dip.");
  return say("Running. The rotor turns " + (100 * (1 - w / (starter === "vfd" ? Math.max(hz, 0.02) : 1))).toFixed(1) + " % slower than the field: that slip is what makes the rotor current and the torque.");
}

const TOUR = [
  { st: "dol", ld: "fan", ol: true, acts: [[0.6, "go"], [5, "stop"], [7.5, "end"]] },
  { st: "sd", ld: "fan", ol: true, acts: [[0.6, "go"], [7.5, "stop"], [10, "end"]] },
  { st: "vfd", ld: "fan", ol: true, acts: [[0.6, "go"], [8.5, "stop"], [11, "end"]] },
  { st: "sd", ld: "conv", ol: true, acts: [[0.6, "go"], [8, "stop"], [10.5, "end"]] },
  { st: "dol", ld: "jam", ol: true, acts: [[0.6, "go"], [13, "end"]] },
  { st: "dol", ld: "jam", ol: false, acts: [[0.6, "go"], [21, "fresh"], [22, "end"]] },
];
function cool() { temp = M.amb + 25; olTh = 0; tripped = ""; }
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
      starter = s.st; loadKind = s.ld; olOn = s.ol; stop(); w = 0; cool(); dead = false; hist.length = 0;
      actions = s.acts.map(([wt, a]) => [tourClock + wt, a]);
    }
    while (actions.length && tourClock >= actions[0][0]) {
      const a = actions.shift()[1];
      if (a === "go") start(); else if (a === "stop") stop(); else if (a === "fresh") { dead = false; cool(); } else if (a === "end") actions = [];
    }
  }
  const n = 20;
  for (let i = 0; i < n; i++) step(sdt / n);
  hist.push({ t: now, i: Iline, w }); while (hist.length && hist[0].t < now - 10.5) hist.shift();
  draw(sdt); syncUi(); drawScope(); story();
  const idle = parts.length === 0 && !touring && !on && w < 0.001 && Math.abs(temp - M.amb) < 0.5 && !dead && hist.every((h) => h.i < 0.001);
  frame = visible && !idle ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { touring = false; actions = []; };
const guard = (fn) => (...a) => { takeOver(); fn(...a); run(); };
const setSt = guard((v) => { if (on) stop(); starter = v; });
const setLd = guard((v) => { loadKind = v; if (v === "jam") w = 0; });
const setOl = guard((v) => { olOn = v; });
const toggle = guard(() => (on ? stop() : start()));
const fresh = guard(() => { dead = false; temp = M.amb; olTh = 0; tripped = ""; });
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;

ui.st.forEach((b) => b.addEventListener("click", () => setSt(b.dataset.st)));
ui.ld.forEach((b) => b.addEventListener("click", () => setLd(b.dataset.ld)));
ui.ol.forEach((b) => b.addEventListener("click", () => setOl(b.dataset.olb === "on")));
ui.go.addEventListener("click", toggle);
ui.fresh.addEventListener("click", fresh);
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; tourClock = 0; actions = []; } run(); });
onTap(toggle);
stage.addEventListener("keydown", (ev) => {
  const map = { x: () => { setX(!E.xrayOn); run(); }, " ": toggle, Enter: toggle, "1": () => setSt("dol"), "2": () => setSt("sd"), "3": () => setSt("vfd"), f: () => setLd("fan"), c: () => setLd("conv"), j: () => setLd("jam"), o: () => setOl(!olOn), r: fresh, s: () => { slow = !slow; run(); } };
  if (map[ev.key]) { ev.preventDefault(); map[ev.key](); }
});
window.__fig = { E, freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
draw(); syncUi(); drawScope();
`;

const CSS = `.pt{font-family:var(--anatomy-mono);fill:#23262b;font-weight:600}.pt.lo{fill:#5a6068;font-weight:500}.pt.hi{font-weight:700}.pt.vfd{fill:#5dff9d}
.ctl #go{font-weight:600;letter-spacing:.06em;min-width:84px;text-align:center}
#scope{width:100%;height:120px;display:block;border:1px solid var(--anatomy-lo);border-radius:6px;grid-column:1/-1}`;

const stage = stageHtml({
  W, H, fig: "Fig 11", title: "How a motor starts", xray: true,
  label: "A 7.5 kilowatt induction motor standing on its end with a fan on the shaft, a quarter cut away to show the stator core, the copper windings and the squirrel cage rotor. A starter panel and a light on the same supply stand behind it, with the cable running to the motor's terminal box. An x-ray mode turns the frame and core to glass.",
  keysHelp: "Induction motor: drag to rotate, X for x-ray, space starts and stops, 1 2 3 pick the starter, F C J pick the load, O bypasses the overload",
  extra: ``,
});

const CONTROLS = `<div class="ctl" role="group" aria-label="Test controls">
  <div class="ctl-row"><span class="ctl-label">Starter</span><button type="button" data-st="dol" aria-pressed="true">Direct on line</button><button type="button" data-st="sd" aria-pressed="false">Star-delta<small>3 s in star</small></button><button type="button" data-st="vfd" aria-pressed="false">VFD<small>5 s ramp, 1.5 × In limit</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Load</span><button type="button" data-ld="fan" aria-pressed="true">Fan<small>easy at low speed</small></button><button type="button" data-ld="conv" aria-pressed="false">Loaded conveyor<small>full torque from standstill</small></button><button type="button" data-ld="jam" aria-pressed="false">Jammed<small>someone's broom</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Overload</span><button type="button" data-olb="on" aria-pressed="true">Set to the motor</button><button type="button" data-olb="off" aria-pressed="false">Bypassed</button></div>
  <canvas id="scope" aria-label="Current and speed over the last ten seconds"></canvas>
  <div class="ctl-row"><span class="ctl-label">Windings</span><div class="meter"><span id="t-fill" class="fill"></span><span class="mark" style="left:${((155 - 20) / 200 * 100).toFixed(1)}%" data-label="155 °C class F"></span></div><output id="t-out">40 °C</output></div>
  <div class="ctl-row"><span class="ctl-label">Supply</span><div class="meter"><span id="v-fill" class="fill"></span><span class="mark" style="left:50%" data-label="−10 %"></span></div><output id="v-out">415 V</output></div>
  <div class="ctl-row wide"><span class="ctl-label">Now</span><span id="stats"></span></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="go" aria-pressed="false">START</button><button type="button" id="fresh" style="display:none">Rewind it</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
</div>`;


const foot = footHtml({
  theme, slug: "motor",
  real: "Anchored on a WEG W22 IE3 7.5 kW 4-pole (132M): 14.2 A, 1460 rpm, locked rotor current 8.3 × In, locked rotor torque 2.4 × Tn, breakdown 3.5 × Tn, class F, locked rotor time 12 s cold. Class 10 overload: trips at 7.2 × setting in 4 to 10 s.",
  made: "the circuit fitted to those ratios, the loads and their inertia, the timers, the drive, the supply dip, the thermal model and when it burns.",
});
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), pageMk2({
  k, title: "How a motor starts", fig: "Fig 11", hint: "Tap: start / stop", theme, W, H, stage, controls: CONTROLS, css: CSS, foot,
  caption: "Three phases in three sets of windings make a magnetic field that goes round the stator at 1500 rpm on a 4-pole motor. The rotor is just aluminium bars shorted at the ends. It only gets current, and so torque, when the field is slipping past it, which is why it always runs a little slower than the field. At standstill the slip is total, so a motor started direct on line pulls 7 to 8 times its full load current until it gets going. Star-delta cuts that to a third, but the torque too, so it can't start a loaded machine. A VFD starts the field slowly and brings it up with the rotor, so the current never spikes. And a jammed rotor turns all that current into heat: the overload relay is there to win that race.",
  script: LIVE.replace("__DATA__", JSON.stringify(DATA)),
}));
console.log("wrote", name);
