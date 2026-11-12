import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { engineScript, stageHtml, pageMk2, footHtml } from "../../mk2/shell.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const W = 960, H = 640;

// Truth: dust explosions need fuel, air, ignition, dispersion and confinement. A small primary (often in a bucket
// elevator) shakes settled dust into the air and lights it: the secondary is usually far worse. NFPA 654 treats about
// 0.8 mm (1/32 in) of dust over more than 5 % of the floor as an explosion hazard; OSHA's grain handling rule caps
// priority areas at 3.2 mm (1/8 in). Bearing and belt monitoring, venting and isolation are the usual protections.
// Toy: how thick the dust needs to be to go, the timings, the fireballs, what flies where.
const MODEL = { nfpa: 0.8, osha: 3.2, maxDust: 4, heatTime: 6, trip: 0.6, delays: { rec: 0.35, head: 0.45, gal: 0.85, silo: 1.2 }, end: 7 };
const REC = { x: -112, y: -54, w: 82, d: 80, h: 46 };
const LEG = { x: -50, y: -30, w: 9, d: 15, h: 154 };
const HEAD = { x: -60, y: -40, w: 40, d: 36, z: 146, h: 22 };
const GAL = { x: -20, y: -30, w: 122, d: 16, z: 152, h: 11 };
const SILOS = [[12, -22], [52, -22], [92, -22]];
const SR = 18, SH = 142;
const PLATE = { x: -122, y: -74, w: 244, d: 142, r: 8 };
const P = k.fitProjection([...k.boxCorners(PLATE, -0.8, 0), [-112, -54, 172], [112, -40, 166], [112, 0, 150], [-112, 30, 60], [-20, -30, 172]], W, H, { pad: 22, azimuth: 45, elevation: 30 });
const DATA = { W, H, P, PLATE };
const dust = []; for (const z of [18.4, 34.4]) dust.push({ x: REC.x + 3, y: REC.y + 2.5, w: REC.w - 6, d: 3, z }); dust.push({ x: REC.x + 2.5, y: REC.y + 7, w: 3, d: REC.d - 12, z: 26.4 }); dust.push({ x: REC.x + 4, y: REC.y + 30, w: 30, d: 40, z: 0.85 }, { x: REC.x + 40, y: REC.y + 40, w: 36, d: 30, z: 0.85 });
const SECT = { leg: [LEG.x + LEG.w / 2, LEG.y + LEG.d / 2, 80], rec: [REC.x + REC.w / 2, REC.y + REC.d / 2, 22], head: [HEAD.x + HEAD.w / 2, HEAD.y + HEAD.d / 2, HEAD.z + 10], gal: [GAL.x + GAL.w / 2, GAL.y + GAL.d / 2, GAL.z + 5], s0: [SILOS[0][0], SILOS[0][1], SH + 2], s1: [SILOS[1][0], SILOS[1][1], SH + 2], s2: [SILOS[2][0], SILOS[2][1], SH + 2] };
Object.assign(DATA, { MODEL, REC, LEG, HEAD, GAL, SILOS, SR, SH, SECT, NAMES: Object.keys(SECT), dust });
const mm = (v) => (v / MODEL.maxDust * 100).toFixed(1);
const LIVE = `
${engineScript()}
const D = __DATA__;
const stage = document.querySelector(".mk-stage");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lightTheme = document.body.dataset.theme === "light";
const E = mk2(stage, D.P, { W: D.W, H: D.H, pivot: [0, -10, 70], plate: { ...D.PLATE, h: 12, foot: 5 }, shadowBox: [-130, -82, -18, 130, 76, 180] });
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
let dustMm = 2, monitor = false, vented = false, isolated = false;
let fault = false, heat = 0, tripped = false, ignAt = null, plan = {}, lastShot = "", lastEvent = "", lastEventAt = -10;
let frame = 0, last = 0, now = 0, visible = false, touring = true, slow = false, tourClock = 0, tourStep = -1, nextAt = 0, goAt = 0;
const busy = () => ignAt !== null;
const event = (t) => { lastEvent = t; lastEventAt = now; };
function reset() { fault = false; heat = 0; tripped = false; ignAt = null; plan = {}; lastEvent = ""; }

function ignite() {
  ignAt = now;
  // a vented leg throws less of a punch into the building, so it takes more dust to set off a secondary
  const need = vented ? M.nfpa * 2 : M.nfpa;
  const go = dustMm >= need, I = clamp(dustMm / 2.2, 0.35, 1.6);
  plan = { leg: [0, vented ? 0.6 : 1] };
  if (go) { plan.rec = [M.delays.rec, I]; plan.head = [M.delays.head, I * 0.8]; plan.gal = [M.delays.gal, I * 0.8]; }
  if (!isolated && (go || !vented)) { const t0 = go ? M.delays.silo : 0.7; plan.s0 = [t0, 0.9]; plan.s1 = [t0 + 0.15, 0.9]; plan.s2 = [t0 + 0.3, 0.9]; }
  const n = Object.keys(plan).length;
  event(n === 1 ? (vented ? "Primary in the elevator leg. The vent panel blew and threw the fireball outside. The building was clean enough that the pressure wave had nothing to pick up. That's as small as a dust explosion gets." : "Primary in the elevator leg, and it split the casing. But the building was clean and the silos isolated, so it stopped there.")
    : go ? "Primary in the leg, and then the bad one: the pressure wave shook " + dustMm.toFixed(1) + " mm of dust off every beam and ledge into the air, and the primary lit it. The secondary went through the receiving building, the headhouse and the gallery" + (isolated ? ". Isolation kept it out of the silos." : ", and down into the silos.")
    : "Primary in the leg, and with no isolation the flame went straight down the spouts into the silos.");
}

function step(dt) {
  if (busy()) return;
  if (fault && !tripped) {
    heat += dt / M.heatTime;
    if (monitor && heat >= M.trip) { tripped = true; event("The bearing temperature sensor saw it heating and stopped the elevator. Nothing else happens. That's what monitoring is for."); }
    if (heat >= 1) ignite();
  } else if (tripped) heat = Math.max(0, heat - dt * 0.05);
}
const ui = {
  dust: document.querySelector("#dust"), dustOut: document.querySelector("#dust-out"),
  mon: [...document.querySelectorAll("[data-mon]")], vent: [...document.querySelectorAll("[data-vent]")], iso: [...document.querySelectorAll("[data-iso]")],
  hFill: document.querySelector("#h-fill"), hOut: document.querySelector("#h-out"), stats: document.querySelector("#stats"),
  go: document.querySelector("#go"), slow: document.querySelector("#slow"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"),
};
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };
// ---------------- the plant, in real 3D ----------------
const TAU = Math.PI * 2, R = D.REC, LG = D.LEG, HD = D.HEAD, GL = D.GAL, SR = D.SR, SH = D.SH;
const WALL = "#8c97a1", ROOF = "#6d7780", GALV = "#aab2ba", CONC = "#b9b4a8", GRAIN = "#d9b25a", DUST = "#c9a86a";
const rnd2 = () => Math.random();
function plantStatic() {
  const o = [], CON = { mat: "concrete" }, PT = { mat: "paint" };
  // receiving building: slab, the two back walls, the steel inside that collects dust, the conveyor to the elevator boot
  o.push(box(R.x - 1, R.x + R.w + 1, R.y - 1, R.y + R.d + 1, 0, 0.8, "#8f8a80", CON));
  o.push(box(R.x, R.x + R.w, R.y, R.y + 2, 0.8, R.h, WALL, PT), box(R.x, R.x + 2, R.y + 2, R.y + R.d, 0.8, R.h, WALL, PT));
  for (let x = R.x + 6; x < R.x + R.w; x += 6) o.push(box(x, x + 0.8, R.y + 2, R.y + 2.5, 1, R.h, "#7b8690", { bevel: 0 }));
  for (const z of [16, 32]) o.push(box(R.x + 2, R.x + R.w - 2, R.y + 2, R.y + 6, z, z + 2.4, "#5d6670", { mat: "steel" }));
  o.push(box(R.x + 2, R.x + 6, R.y + 6, R.y + R.d - 4, 24, 26.4, "#5d6670", { mat: "steel" }));
  for (const [x, y] of [[R.x + R.w - 3, R.y + R.d - 3], [R.x + R.w - 3, R.y + 2], [R.x + 2, R.y + R.d - 3]]) o.push(box(x, x + 2.4, y, y + 2.4, 0.8, R.h, "#5d6670", { mat: "steel" }));
  o.push(box(R.x + 14, R.x + 74, -22, -14, 6, 9, "#3a3f46", { mat: "rubber" }));
  for (const x of [R.x + 18, R.x + 40, R.x + 62]) o.push(box(x, x + 2, -21, -15, 0.8, 6, "#5d6670", { mat: "steel" }));
  for (let i = 0; i < 7; i++) o.push(sphere([R.x + 20 + i * 8, -18, 9], 3.2, GRAIN, { squash: [1.2, 0.9, 0.5], lat: 5, lon: 8, mat: "matte" }));
  o.push(box(R.x + 20, R.x + 44, R.y + 46, R.y + 70, 0.8, 3, "#4a4f56", { mat: "steel" })); // the intake grate
  // inside the leg: the belt on its two pulleys
  const cx = LG.x + LG.w / 2;
  for (const z of [6, LG.h - 6]) o.push(prism(circle(LG.y + LG.d / 2, z, 4.6, 18), "x", cx - 2.6, cx + 2.6, "#6f7780", { mat: "steel" }));
  for (const y of [LG.y + LG.d / 2 - 4.7, LG.y + LG.d / 2 + 4.2]) o.push(box(cx - 2.2, cx + 2.2, y, y + 0.5, 6, LG.h - 6, "#2b2e33", { mat: "rubber", bevel: 0 }));
  // the bearing housing on the head pulley shaft, outside the casing where you can see it
  o.push(tube([[LG.x - 1.5, LG.y + LG.d / 2, LG.h - 6], [LG.x + LG.w + 1.5, LG.y + LG.d / 2, LG.h - 6]], 0.9, "#c9ced3", { seg: 6, mat: "steel" }));
  // the gallery along the top of the silos, with the spouts that drop grain (and flame) into each one
  o.push(box(GL.x, GL.x + GL.w, GL.y, GL.y + GL.d, GL.z, GL.z + GL.h - 2, GALV, { ...PT, shell: true }));
  for (let x = GL.x + 8; x < GL.x + GL.w - 6; x += 14) o.push(box(x, x + 6, GL.y + GL.d, GL.y + GL.d + 0.3, GL.z + 3, GL.z + 6.5, "#39424b", { bevel: 0, mat: "gloss" }));
  o.push(box(GL.x + 2, GL.x + GL.w - 2, GL.y + 5, GL.y + 11, GL.z + 1, GL.z + 2.4, "#2b2e33", { mat: "rubber", bevel: 0 }));
  for (const [x, y] of D.SILOS) {
    o.push(lathe([[SR, 0], [SR, SH]], CONC, { c: [x, y, 0], seg: 40, mat: "concrete", shell: true, smooth: false }));
    for (const z of [30, 60, 90, 120]) o.push(lathe([[SR + 0.25, z], [SR + 0.25, z + 1.2]], "#a39e92", { c: [x, y, 0], seg: 40, mat: "concrete", shell: true }));
    const lvl = 70 + ((x * 7) % 40);
    o.push(lathe([[0, lvl + 12], [SR - 1.5, lvl], [SR - 1.5, 0.5], [0, 0.5]], GRAIN, { c: [x, y, 0], seg: 32, mat: "matte" }));
    o.push(cyl(x, GL.y + 8, 2.2, SH + 3, GL.z + 1, "#8f98a1", 12, { mat: "steel" }));
  }
  return o;
}
// the pieces that can leave: each is meshed once and then just thrown
const PIECES = {
  recRoof: () => [box(R.x - 1.5, R.x + R.w + 1.5, R.y - 1.5, R.y + R.d + 1.5, R.h, R.h + 2.4, ROOF, { mat: "paint" }), ...Array.from({ length: 9 }, (_, i) => box(R.x + 4 + i * 9, R.x + 5 + i * 9, R.y - 1.5, R.y + R.d + 1.5, R.h + 2.4, R.h + 3, "#5c666f", { bevel: 0 }))],
  recWallX: () => [box(R.x + R.w - 2, R.x + R.w, R.y + 2, R.y + R.d, 0.8, R.h, WALL, { mat: "paint", shell: true })],
  recWallY: () => [box(R.x + 2, R.x + R.w - 2, R.y + R.d - 2, R.y + R.d, 0.8, R.h, WALL, { mat: "paint", shell: true }), box(R.x + 20, R.x + 46, R.y + R.d, R.y + R.d + 0.4, 0.8, 30, "#59626b", { mat: "paint", shell: true })],
  head: () => [box(HD.x, HD.x + HD.w, HD.y, HD.y + HD.d, HD.z, HD.z + HD.h, "#9aa4ad", { mat: "paint", shell: true }), box(HD.x - 1, HD.x + HD.w + 1, HD.y - 1, HD.y + HD.d + 1, HD.z + HD.h, HD.z + HD.h + 1.6, ROOF, { mat: "paint" }), box(HD.x + HD.w, HD.x + HD.w + 0.3, HD.y + 8, HD.y + 18, HD.z + 8, HD.z + 15, "#39424b", { bevel: 0, mat: "gloss" })],
  galRoof: () => [box(GL.x - 0.5, GL.x + GL.w + 0.5, GL.y - 1, GL.y + GL.d + 1, GL.z + GL.h - 2, GL.z + GL.h, ROOF, { mat: "paint" })],
  siloRoof: () => [lathe([[SR + 0.8, SH], [SR + 0.8, SH + 1.2], [4.5, SH + 5], [4.5, SH + 8], [0, SH + 8]], "#9e998d", { c: [0, 0, 0], seg: 36, mat: "concrete" })],
  legCase: () => [box(LG.x, LG.x + LG.w, LG.y, LG.y + LG.d, 0.8, LG.h, GALV, { mat: "paint", shell: true }), ...[30, 62, 94, 126].map((z) => box(LG.x - 0.25, LG.x + LG.w + 0.25, LG.y - 0.25, LG.y + LG.d + 0.25, z, z + 1, "#8a939c", { bevel: 0, shell: true }))],
  legPanel: () => [box(LG.x + LG.w, LG.x + LG.w + 0.7, LG.y + 1, LG.y + LG.d - 1, 60, 90, "#9aa3ab", { mat: "paint" })],
  vent: () => [box(LG.x + LG.w, LG.x + LG.w + 0.8, LG.y + 2, LG.y + LG.d - 2, LG.h - 40, LG.h - 20, "#e2b53a", { mat: "paint" }), ...[0, 1, 2].map((i) => box(LG.x + LG.w + 0.8, LG.x + LG.w + 0.95, LG.y + 2, LG.y + LG.d - 2, LG.h - 37 + i * 6, LG.h - 35 + i * 6, "#2a2d31", { bevel: 0 }))],
};
// thrown: up and out with gravity, tumbling about its own middle
function flyM(c, piv, v, axis, w) {
  if (c <= 0) return undefined;
  const a = w * c, cs = Math.cos(a), sn = Math.sin(a), g = 520;
  const Rm = axis === "x" ? [1, 0, 0, 0, cs, -sn, 0, sn, cs] : axis === "y" ? [cs, 0, sn, 0, 1, 0, -sn, 0, cs] : [cs, -sn, 0, sn, cs, 0, 0, 0, 1];
  const t = [0, 1, 2].map((i) => piv[i] - (Rm[i * 3] * piv[0] + Rm[i * 3 + 1] * piv[1] + Rm[i * 3 + 2] * piv[2]) + v[i] * c - (i === 2 ? 0.5 * g * c * c : 0));
  return [...Rm, ...t];
}
let fx = [], beltA = 0;
const SPOT = { leg: () => [LG.x + LG.w / 2 + (rnd2() - 0.5) * 8, LG.y + LG.d / 2 + (rnd2() - 0.5) * 12, 20 + rnd2() * 130], rec: () => [R.x + rnd2() * R.w, R.y + rnd2() * R.d, 4 + rnd2() * R.h], head: () => [HD.x + rnd2() * HD.w, HD.y + rnd2() * HD.d, HD.z + rnd2() * HD.h], gal: () => [GL.x + rnd2() * GL.w, GL.y + rnd2() * GL.d, GL.z + rnd2() * GL.h] };
D.SILOS.forEach(([x, y], i) => { SPOT["s" + i] = () => { const a = rnd2() * TAU, r = rnd2() * SR * 0.8; return [x + r * Math.cos(a), y + r * Math.sin(a), SH - 10 + rnd2() * 30]; }; });
function draw(dt = 0) {
  const c = ignAt === null ? -1 : now - ignAt;
  const sc = (n) => (plan[n] && c >= plan[n][0] ? c - plan[n][0] : -1), gone = (t) => t > 2.6;
  const running = !tripped && c < 0;
  if (running) beltA += dt * 0.9;
  const objs = [{ cache: "plant", rev: 0, parts: plantStatic }], live = [];
  const piece = (id, key, t, piv, v, axis, w, base) => { if (gone(t)) return; const m = flyM(t, piv, v, axis, w); objs.push({ cache: id, rev: 0, m: m && base ? mul(m, base) : m || base, parts: PIECES[key] }); };
  const mul = (a, b) => { const o = new Array(12); for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) o[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]; o[9 + i] = a[i * 3] * b[9] + a[i * 3 + 1] * b[10] + a[i * 3 + 2] * b[11] + a[9 + i]; } return o; };
  const tr = sc("rec"), th = sc("head"), tg = sc("gal"), tl = sc("leg"), S2 = D.SECT;
  piece("recRoof", "recRoof", tr, S2.rec, [20, 30, 330], "y", -1.6);
  piece("recWallX", "recWallX", tr, [R.x + R.w, S2.rec[1], 20], [210, 20, 120], "y", 2.4);
  piece("recWallY", "recWallY", tr, [S2.rec[0], R.y + R.d, 20], [10, 220, 110], "x", -2.6);
  piece("head", "head", th, S2.head, [-60, -40, 300], "x", 1.8);
  piece("galRoof", "galRoof", tg, S2.gal, [30, 50, 280], "x", 1.2);
  D.SILOS.forEach(([x, y], i) => piece("silo-roof", "siloRoof", sc("s" + i), [0, 0, SH + 2], [(i - 1) * 40, 30 + i * 10, 360], i % 2 ? "x" : "y", (i - 1) * 2.4 + 0.8, [1, 0, 0, 0, 1, 0, 0, 0, 1, x, y, 0]));
  objs.push({ cache: "legCase", rev: 0, parts: PIECES.legCase });
  if (vented) piece("vent", "vent", tl, [LG.x + LG.w, S2.leg[1], LG.h - 30], [260, 30, 150], "y", 5);
  else piece("legPanel", "legPanel", tl, [LG.x + LG.w, S2.leg[1], 75], [280, 40, 120], "y", 6);
  // the dust: on the beams, the ledge and patches of floor; gone from wherever a secondary has been through
  const vis = dustMm * 0.7 + 0.05, lifted = tr >= 0 || (c >= 0 && c < 0.35 && dustMm >= (vented ? 1.6 : 0.8)), dop = (lifted ? Math.max(0, 1 - c * 3) : 1) * clamp(dustMm / 1.5, 0.25, 1);
  if (dustMm > 0.02 && dop > 0.03) for (const p of D.dust) live.push(box(p.x, p.x + p.w, p.y, p.y + p.d, p.z, p.z + vis, DUST, { mat: "matte", bevel: 0, opacity: dop < 0.98 ? dop : undefined }));
  // buckets going round (only worth drawing when you can see through the casing)
  const cx = LG.x + LG.w / 2, cy = LG.y + LG.d / 2;
  if (E.xray > 0.01) for (let i = 0; i < 22; i++) { const u = (i / 22 + beltA * 0.05) % 1, up = u < 0.5, z = 8 + (up ? u * 2 : (1 - u) * 2) * (LG.h - 16), y = up ? cy - 6.6 : cy + 4.8; live.push(box(cx - 2, cx + 2, y, y + 1.8, z, z + 1.6, "#d5d9de", { mat: "steel", bevel: 0 })); }
  // the head pulley bearing, getting hot
  for (const x of [LG.x - 2.2, LG.x + LG.w + 0.2]) live.push(box(x, x + 2, cy - 2.2, cy + 2.2, LG.h - 8.4, LG.h - 3.6, mixHex("#59616b", "#ff4a14", heat), { mat: "steel", emit: heat > 0.08 && c < 0 ? ["#ff5a14", heat] : undefined, emitK: 2.4 }));
  if (monitor) live.push(box(LG.x + LG.w + 2.2, LG.x + LG.w + 3.6, cy - 1, cy + 1, LG.h - 7, LG.h - 5, "#22252a", { mat: "plastic", emit: [tripped ? "#ff4a3d" : "#3ddc84", 0.9], emitK: 2 }), tube([[LG.x + LG.w + 2.9, cy, LG.h - 7], [LG.x + LG.w + 2.9, cy + 9, LG.h - 20], [LG.x + LG.w + 0.6, cy + 7.8, 40], [LG.x + LG.w + 0.6, cy + 7.8, 2]], 0.35, "#e2b53a", { seg: 4, mat: "plastic" }));
  if (isolated) for (const [x] of D.SILOS) live.push(box(x - 3.4, x + 3.4, GL.y + 4.6, GL.y + 11.4, SH + 9.5, SH + 12.5, "#e2742a", { mat: "paint" }));
  objs.push({ parts: live });
  let svg = E.render(objs);
  // heat haze and the first smoke off the bearing
  if (c < 0 && fault && !tripped && heat > 0.35 && dt > 0 && rnd2() < dt * 14 * heat) fx.push({ k: "smoke", p: [LG.x + LG.w + 1, cy + (rnd2() - 0.5) * 3, LG.h - 4], v: [(rnd2() - 0.5) * 4, (rnd2() - 0.5) * 4, 12 + rnd2() * 8], life: 0, max: 1.2 + rnd2(), s: 0.35 });
  // the fireballs: each section that goes throws flame for about half a second, then smoke
  if (c >= 0 && dt > 0) for (const n of D.NAMES) {
    const t = sc(n); if (t < 0 || !plan[n]) continue;
    const I = plan[n][1], big = n === "rec" || n === "gal" ? 1.6 : n === "leg" ? 0.9 : 1;
    if (t < 0.55) for (let j = 0; j < Math.ceil(26 * I * big * dt * 30 / 30); j++) { const p = SPOT[n](), up = n[0] === "s" ? 150 : 60; fx.push({ k: "flame", p, v: [(rnd2() - 0.5) * 90, (rnd2() - 0.5) * 90, up * (0.4 + rnd2())], life: 0, max: 0.45 + rnd2() * 0.6, s: (0.7 + rnd2() * 0.9) * I * big }); }
    if (t < 1.6 && rnd2() < dt * 34 * I) { const p = SPOT[n](); fx.push({ k: "smoke", p, v: [(rnd2() - 0.5) * 24, (rnd2() - 0.5) * 24, 34 + rnd2() * 40], life: 0, max: 2 + rnd2() * 2, s: 1.2 * I * big }); }
    if (t < 0.5 && n === "leg" && vented) for (let j = 0; j < 3; j++) fx.push({ k: "flame", p: [LG.x + LG.w + 2, cy + (rnd2() - 0.5) * 8, LG.h - 30 + (rnd2() - 0.5) * 16], v: [180 + rnd2() * 120, (rnd2() - 0.5) * 40, 30 + rnd2() * 40], life: 0, max: 0.35 + rnd2() * 0.3, s: 0.9 });
    if (t < 0.14) E.sprite(D.SECT[n], 70 * I * big, "#fff1c4", 0.9 * (1 - t / 0.14), true, 1);
    if (t < 1.2 && rnd2() < dt * 40 * I) { const p = SPOT[n](); fx.push({ k: "spark", p, v: [(rnd2() - 0.5) * 300, (rnd2() - 0.5) * 300, 120 + rnd2() * 260], life: 0, max: 0.6 + rnd2() * 0.7, s: 1 }); }
  }
  fx = fx.filter((p) => {
    p.life += dt; if (p.life > p.max) return false;
    const t = p.life / p.max, o = [p.p[0], p.p[1], p.p[2]];
    if (p.k === "spark") p.v[2] -= 520 * dt; else if (p.k === "flame") { p.v[0] *= 0.94; p.v[1] *= 0.94; }
    for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * dt;
    if (p.k === "flame") E.sprite(p.p, (9 + 26 * t) * p.s, t < 0.25 ? "#fff0b8" : t < 0.6 ? "#ff9a2e" : "#d8481a", 0.9 * (1 - t * t), true, 2);
    else if (p.k === "smoke") E.sprite(p.p, (8 + 34 * t) * p.s, lightTheme ? "#4a4744" : "#2e2c2b", 0.5 * (1 - t));
    else E.line(o, p.p, 2, t < 0.5 ? "#ffe6a0" : "#ff8a3a", 1 - t, true);
    return true;
  });
  if (E.xray > 0.02 && c < 0) svg += E.callouts([
    { p: [cx, cy + LG.d / 2, 100], text: "Bucket elevator", sub: "where the primary starts" }, { p: [LG.x + LG.w + 1, cy, LG.h - 6], text: "Head pulley bearing", sub: Math.round(heat * 100) + " % of the way to ignition" },
    { p: [R.x + 30, R.y + 4, 34.5], text: "Dust on the steel", sub: dustMm.toFixed(1) + " mm, the fuel for the secondary" }, { p: [GL.x + GL.w * 0.6, GL.y + GL.d, GL.z + 5], text: "Gallery", sub: "conveyor over the silos" },
    { p: [D.SILOS[2][0] + SR, D.SILOS[2][1], 70], text: "Silos", sub: isolated ? "isolated from the leg" : "open to the leg" }, ...(vented ? [{ p: [LG.x + LG.w + 1, cy, LG.h - 30], text: "Explosion vent", sub: "lets the primary out" }] : []),
  ], E.xray, E.fs < 0.62 ? {} : { topL: 70 });
  if (sceneG.innerHTML !== svg) sceneG.innerHTML = svg;
  const big = Object.keys(plan).length;
  if (c >= 0) {
    const A = (big > 1 ? 14 : 5) * Math.exp(-c / 0.6);
    setShake(A * Math.sin(c * 80), A * Math.cos(c * 67));
    if (c > M.end) { setShake(0, 0); reset(); event("Reset. Same plant, same dust, same bearing."); return draw(); }
  }
  const text = c >= 0 ? (big > 1 ? "SECONDARY · " + big + " sections" : "PRIMARY only") : (fault ? (tripped ? "elevator stopped by monitoring" : "bearing heating · " + Math.round(heat * 100) + " %") : "running") + " · dust " + dustMm.toFixed(1) + " mm";
  if (readout.textContent !== text) readout.textContent = text;
}

function syncUi() {
  ui.dust.value = Math.round(dustMm * 10); ui.dustOut.textContent = dustMm.toFixed(1) + " mm";
  ui.mon.forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.mon === "on") === monitor)));
  ui.vent.forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.vent === "on") === vented)));
  ui.iso.forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.iso === "on") === isolated)));
  ui.hFill.style.width = (clamp(heat, 0, 1) * 100).toFixed(1) + "%"; ui.hFill.dataset.state = heat >= 1 ? "bad" : heat > M.trip ? "warn" : "ok";
  ui.hOut.textContent = tripped ? "TRIPPED" : Math.round(heat * 100) + " %";
  ui.stats.innerHTML = "dust layer <b>" + dustMm.toFixed(1) + " mm</b> (" + (dustMm >= M.osha ? "past both limits" : dustMm >= M.nfpa ? "past the NFPA 654 line" : "under the lines") + ") · leg <b>" + (vented ? "vented" : "not vented") + "</b> · silos <b>" + (isolated ? "isolated" : "open to the leg") + "</b>";
  ui.go.disabled = busy() || (fault && !tripped); ui.go.textContent = "HOT BEARING";
  ui.slow.setAttribute("aria-pressed", String(slow)); ui.tour.setAttribute("aria-pressed", String(touring));
}

function story() {
  if (now - lastEventAt < 5 && lastEvent) return say(lastEvent);
  if (busy()) return;
  if (fault && !tripped) return say("The head pulley bearing is running hot: " + Math.round(heat * 100) + " % of the way to lighting the dust inside the leg." + (monitor ? " Bearing monitoring is on." : " Nothing is watching it."));
  say("A bucket elevator lifting grain, and dust settling on every beam and ledge: " + dustMm.toFixed(1) + " mm of it. Hit Hot bearing and see how far it goes.");
}

const TOUR = [
  { dust: 0.3, mon: false, vent: true, iso: true },
  { dust: 2.0, mon: false, vent: true, iso: true },
  { dust: 3.5, mon: false, vent: false, iso: false },
  { dust: 3.5, mon: true, vent: false, iso: false },
];
function tick(t) {
  const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
  last = t;
  const sdt = dt * (slow ? 0.15 : 1);
  now += sdt;
  if (touring && !busy()) {
    tourClock += sdt;
    if (tourStep < 0 || tourClock >= nextAt) {
      tourStep = (tourStep + 1) % TOUR.length;
      const s = TOUR[tourStep]; dustMm = s.dust; monitor = s.mon; vented = s.vent; isolated = s.iso; reset();
      goAt = tourClock + 1.5; nextAt = tourClock + 1.5 + M.heatTime + 1;
    }
    if (!fault && tourClock >= goAt) fault = true;
  }
  step(sdt);
  draw(sdt); syncUi(); story();
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const guard = (fn) => (...a) => { touring = false; if (busy()) return; fn(...a); draw(); syncUi(); run(); };
const setDust = guard((v) => { dustMm = v; });
const setMon = guard((v) => { monitor = v; });
const setVent = guard((v) => { vented = v; });
const setIso = guard((v) => { isolated = v; });
const go = guard(() => { reset(); fault = true; });
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;
ui.dust.addEventListener("input", () => setDust(+ui.dust.value / 10));
ui.mon.forEach((b) => b.addEventListener("click", () => setMon(b.dataset.mon === "on")));
ui.vent.forEach((b) => b.addEventListener("click", () => setVent(b.dataset.vent === "on")));
ui.iso.forEach((b) => b.addEventListener("click", () => setIso(b.dataset.iso === "on")));
ui.go.addEventListener("click", go);
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; tourClock = 0; } run(); });
onTap(go);
stage.addEventListener("keydown", (ev) => {
  const map = { x: () => { setX(!E.xrayOn); run(); }, " ": go, Enter: go, ArrowUp: () => setDust(clamp(dustMm + 0.2, 0, M.maxDust)), ArrowDown: () => setDust(clamp(dustMm - 0.2, 0, M.maxDust)), m: () => setMon(!monitor), v: () => setVent(!vented), i: () => setIso(!isolated), s: () => { slow = !slow; run(); } };
  if (map[ev.key]) { ev.preventDefault(); map[ev.key](); }
});
window.__fig = { E, freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
draw(); syncUi(); story();
`;

const CSS = `.ctl #go{font-weight:600;letter-spacing:.06em}`;

const stage = stageHtml({
  W, H, fig: "Fig 17", title: "Grain dust explosion", xray: true,
  label: "A grain handling plant: a receiving building with a conveyor and dusty beams, a bucket elevator with a headhouse on top, and a gallery running across the tops of three silos. An x-ray mode turns the walls and casings to glass to show the belt and buckets, the dust on the steel and the grain in the silos.",
  keysHelp: "Grain plant: drag to rotate, X for x-ray, space starts the hot bearing, up and down change the dust, M monitoring, V venting, I isolation",
  extra: ``,
});

const CONTROLS = `<div class="ctl" role="group" aria-label="Test controls">
  <div class="ctl-row"><span class="ctl-label">Dust</span><div class="slide"><span class="mark" style="left:${mm(0.8)}%" data-label="0.8 mm NFPA 654"></span><span class="mark" style="left:${mm(3.2)}%" data-label="3.2 mm"></span><input id="dust" type="range" min="0" max="40" step="1" value="20" aria-label="Settled dust layer"></div><output id="dust-out">2.0 mm</output></div>
  <div class="ctl-row"><span class="ctl-label">Monitoring</span><button type="button" data-mon="on" aria-pressed="false">Bearing sensors</button><button type="button" data-mon="off" aria-pressed="true">None</button></div>
  <div class="ctl-row"><span class="ctl-label">Leg</span><button type="button" data-vent="on" aria-pressed="false">Explosion vents</button><button type="button" data-vent="off" aria-pressed="true">No vents</button></div>
  <div class="ctl-row"><span class="ctl-label">Silos</span><button type="button" data-iso="on" aria-pressed="false">Isolated<small>chokes / flap valves</small></button><button type="button" data-iso="off" aria-pressed="true">Open to the leg</button></div>
  <div class="ctl-row"><span class="ctl-label">Bearing</span><div class="meter"><span id="h-fill" class="fill"></span><span class="mark" style="left:${MODEL.trip * 100}%" data-label="sensor trips"></span></div><output id="h-out">0 %</output></div>
  <div class="ctl-row wide"><span class="ctl-label">Plant</span><span id="stats"></span></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="go" class="danger">HOT BEARING</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
</div>`;


const foot = footHtml({
  theme, slug: "silo",
  real: "primary and secondary dust explosions, NFPA 654's 0.8 mm (1/32 in) over 5 % of the floor (for dust around 1200 kg/m³), OSHA's 3.2 mm (1/8 in) for priority areas in grain handling, and bearing monitoring, venting and isolation as protections.",
  made: "how much dust it takes here, the timings, the fireballs and what flies where.",
});
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), pageMk2({
  k, title: "Grain dust explosion", fig: "Fig 17", hint: "Tap: hot bearing", theme, W, H, stage, controls: CONTROLS, css: CSS, foot,
  caption: "Grain dust burns like a gas once it's in the air. The first bang is usually small and inside equipment: a hot bearing or a slipping belt lights the dust cloud inside a bucket elevator. That primary is not what kills people. Its pressure wave shakes everything in the building and throws the dust that's settled on beams, ledges and floors into the air, and the primary's flame lights that. The secondary runs through the whole building. A layer about 0.8 mm thick, roughly a paperclip wire, over more than 5 % of the floor is enough for NFPA 654 to call it an explosion hazard. Monitoring stops the ignition, vents take the punch out of the primary, isolation keeps it out of the silos, and housekeeping takes away the fuel for the big one.",
  script: LIVE.replace("__DATA__", JSON.stringify(DATA)),
}));
console.log("wrote", name);
