import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { engineScript, stageHtml, pageMk2, footHtml } from "../../mk2/shell.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const W = 960, H = 600;

// Truth: IEC 60079-14 dust Tmax = min(2/3 × cloud ignition temp, 5 mm layer ignition temp − 75 K); the layer rule only holds to 5 mm.
// Literature values (5 mm layer / cloud ignition, °C).
const DUSTS = [
  { id: "coal", name: "coal dust", btn: "Coal", group: "IIIB", cond: false, layer: 250, cloud: 600, colour: ["#2a2622", "#3a3530"], light: ["#5a534c", "#7a7168"] },
  { id: "wood", name: "wood flour", btn: "Wood flour", group: "IIIB", cond: false, layer: 340, cloud: 490, colour: ["#6b5236", "#7e6342"], light: ["#c9a676", "#d9ba8c"] },
  // aluminium: conductive, so group IIIC. Its ignition temperatures swing hundreds of degrees with particle size, so none are claimed here.
  { id: "alu", name: "aluminium dust", btn: "Aluminium", group: "IIIC", cond: true, layer: null, cloud: null, colour: ["#a9b4c0", "#c6d0db"], light: ["#7f8790", "#959da6"] },
];
// Toy: dust settles at 0.4 mm a week. The light is marked T135 °C and reaches it with exactly 5 mm on top
// (90 °C bare, +9 K per mm). Thicker layers light lower (3 K per mm past 5 mm). A JB with a missing plug fills in ~20 weeks.
const MODEL = { mmPerWeek: 0.4, bare: 90, perMm: 9, marked: 135, thickDrop: 3, tau: 2.2, maxWeeks: 60, jbFillWeeks: 20, jbBurn: 0.45 };
const PLATE_H = 12, FOOT_H = 5;
const COL = { x: -108, y: -5, w: 10, d: 10 };
const BEAM = { x0: -108, x1: 118, y: 0, z0: 84 };
const LUM = { x: -6, y: -18, w: 48, d: 36, z0: 56, z1: 66 };
const FIN_H = 5;
const DUST_K = 0.32;
const LAMP_C = [LUM.x + LUM.w / 2, 0];
const JB = { x: -84, y: 16, w: 40, d: 30, z0: 18, z1: 42 };
const JB_CUT = [-60, 34];
const JB_HOT = [-56, 24, 28];
const HOP = { x: 58, y: 14, w: 40, d: 34, z1: 26 };
const CLOUD_SRC = [HOP.x + HOP.w / 2, HOP.y + HOP.d / 2, HOP.z1 + 4];
const BAG = { x: 64, y: 54, w: 28, d: 16 };
const START = { dust: 0, weeks: 6, sealed: true };
const PLATE = { x: -124, y: -84, w: 256, d: 166, r: 8 };
const P = k.fitProjection([...k.boxCorners(PLATE, -0.8, 0), [-108, -5, 122], [118, 0, 100], [-84, 46, 44], [98, 48, 40]], W, H, { pad: 22, azimuth: 45, elevation: 30 });
const DATA = { W, H, P, PLATE };
Object.assign(DATA, { DUSTS, MODEL, LUM, FIN_H, DUST_K, BEAM, COL, LAMP_C, JB, JB_HOT, HOP, CLOUD_SRC, BAG, start: START });
const LIVE = `
${engineScript()}
const D = __DATA__;
const stage = document.querySelector(".mk-stage");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lightTheme = document.body.dataset.theme === "light";
const E = mk2(stage, D.P, { W: D.W, H: D.H, pivot: [4, 0, 40], plate: { ...D.PLATE, h: 12, foot: 5 }, shadowBox: [-132, -92, -18, 140, 90, 140] });
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
let dust = D.start.dust, weeks = D.start.weeks, sealed = D.start.sealed, lamp = true, lampLevel = 1, temp = M.bare;
let shortAt = null, smoulder = 0, jbFire = 0, tipAt = null, cloudAt = null, primaryAt = null, primSrc = "", boomAt = null, big = 0;
let frame = 0, last = 0, now = 0, visible = false, touring = true, slow = false, tourClock = 0, tourStep = -1, tourEnd = 0, lastShot = "", pendingTip = null, ageing = false;
const BOOM_END = 4.4;
const booming = () => primaryAt !== null || (boomAt !== null && now - boomAt < BOOM_END + 0.3);
const Dd = () => D.DUSTS[dust];
const mm = () => Math.round(weeks * M.mmPerWeek * 10) / 10;
const tUnder = () => M.bare + M.perMm * mm();
const layerIgn = () => Dd().layer === null ? 9999 : Dd().layer - (mm() > 5 ? M.thickDrop * (mm() - 5) : 0);
const tmax = () => Dd().layer === null ? 9999 : Math.min(Dd().cloud * 2 / 3, Dd().layer - 75);
const jbFill = () => sealed ? 0 : clamp(weeks / M.jbFillWeeks, 0, 1);
const weeksFor5mm = 5 / M.mmPerWeek;
const ui = {
  dust: [...document.querySelectorAll("[data-dust]")], weeks: document.querySelector("#weeks"), wOut: document.querySelector("#weeks-out"),
  tFill: document.querySelector("#temp-fill"), tOut: document.querySelector("#temp-out"), mk: document.querySelector("#mark-t135"), lim: document.querySelector("#mark-limit"), ign: document.querySelector("#mark-ign"),
  jbFill: document.querySelector("#jb-fill"), jbOut: document.querySelector("#jb-out"), jb: [...document.querySelectorAll("[data-jb]")],
  tip: document.querySelector("#tip"), clean: document.querySelector("#clean"), age: document.querySelector("#age"), lamp: document.querySelector("#lamp"), slow: document.querySelector("#slow"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"),
};
const sliding = {};
const tpos = (t) => (clamp((t - 20) / (520 - 20), 0, 1) * 100).toFixed(1) + "%";
function syncUi() {
  ui.dust.forEach((b, i) => b.setAttribute("aria-pressed", String(i === dust)));
  if (!sliding.weeks) ui.weeks.value = Math.round(weeks);
  ui.wOut.textContent = Math.round(weeks) + " wk · " + mm().toFixed(1) + " mm";
  ui.wOut.dataset.bad = String(mm() > 5);
  ui.tFill.style.width = tpos(temp);
  ui.tFill.dataset.state = smoulder > 0 ? "fire" : temp > tmax() ? "hot" : "ok";
  ui.tOut.textContent = Math.round(temp) + " °C";
  ui.mk.style.left = tpos(M.marked);
  const known = Dd().layer !== null;
  ui.lim.style.display = known ? "" : "none"; ui.ign.style.display = known ? "" : "none";
  ui.lim.style.left = tpos(tmax()); ui.lim.dataset.label = "limit " + Math.round(tmax());
  ui.ign.style.left = tpos(layerIgn()); ui.ign.dataset.label = "layer lights " + Math.round(layerIgn());
  ui.jbFill.style.width = (jbFill() * 100).toFixed(1) + "%";
  ui.jbFill.dataset.state = shortAt !== null ? "fire" : Dd().cond && jbFill() > 0.2 ? "hot" : "ok";
  ui.jbOut.textContent = shortAt !== null ? "SHORT" : sealed ? "clean" : Math.round(jbFill() * 100) + " % full";
  ui.jb.forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.jb === "sealed") === sealed)));
  ui.age.setAttribute("aria-pressed", String(ageing));
  ui.lamp.setAttribute("aria-pressed", String(lamp)); ui.lamp.textContent = lamp ? "Light on" : "Light off";
  ui.slow.setAttribute("aria-pressed", String(slow));
  ui.tour.setAttribute("aria-pressed", String(touring));
}
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };

function tip() {
  if (booming() || (tipAt !== null && now - tipAt < 3)) return;
  tipAt = now; cloudAt = now + 0.45;
}

function step(dt) {
  lampLevel += ((lamp ? 1 : 0) - lampLevel) * (1 - Math.exp(-dt / 0.2));
  if (primaryAt !== null && boomAt === null) {
    if (now - primaryAt > 0.5) { boomAt = now; big = clamp((weeks - 3) / 30, 0, 1); lamp = false;
      const g = Dd();
      const first = primSrc === "jb"
        ? "The short inside the junction box lit the aluminium dust it had just blown into a cloud, and the flame came out of the plug hole (the primary)."
        : "The smouldering layer on the light lit the cloud from the bag (the primary).";
      say(big > 0.4
        ? "Boom, then the big one. " + first + " Its blast threw " + Math.round(weeks) + " weeks of " + g.name + " off every beam and ledge into the air, and that lit too: the secondary. That's the one that takes buildings."
        : "Boom, a small one. " + first + " The beams were fairly clean, so there wasn't much for a secondary to feed on. Clean plants have small accidents.");
    }
    return;
  }
  if (boomAt !== null) return;
  if (ageing) weeks = Math.min(M.maxWeeks, weeks + dt * 3);
  const target = lamp ? tUnder() : 25;
  temp += (target - temp) * (1 - Math.exp(-dt / M.tau));
  if (temp >= layerIgn() && mm() > 0.3) smoulder = Math.min(1, smoulder + dt * 0.5);
  else smoulder = Math.max(0, smoulder - dt * 0.4);
  // conductive dust that got in through the missing plug bridges two live terminals: short, arc
  if (!sealed && Dd().cond && jbFill() >= M.jbBurn && lamp && shortAt === null) {
    shortAt = now;
    say("Short. Aluminium dust conducts, and it has piled up until it bridges two live terminals. The arc blasts the dust inside the box into a cloud, and lights it…");
  }
  if (shortAt !== null && primaryAt === null && now - shortAt > 0.45) { primaryAt = now; primSrc = "jb"; }
  jbFire = shortAt === null ? 0 : sm(0.1, 0.4, now - shortAt);
  // the cloud from the bag spreads; if it reaches a burning nest, that's the primary
  if (cloudAt !== null && now >= cloudAt) {
    const age = now - cloudAt;
    if (primaryAt === null && age > 0.7) {
      if (smoulder > 0.6) { primaryAt = now; primSrc = "lum"; say("The cloud from the bag drifted up into the smouldering layer on the light…"); }
    }
    if (age > 4) cloudAt = null;
  }
}

function chaos() {
  if (boomAt === null) return { c: -1, back: 0 };
  const c = now - boomAt;
  if (c < 0 || c > BOOM_END) return { c: -1, back: 0 };
  return { c, back: 1 - sm(3.2, 4.1, c) };
}
const tipFn = (c, delay, target) => { const u = Math.max(0, c - delay); return u <= 0 ? 0 : target * (1 - Math.exp(-u / 0.11) * Math.cos(u * 13)); };
// ---------------- the dusty plant, in real 3D ----------------
const TAU = Math.PI * 2, rn = () => Math.random(), LM = D.LUM, BM = D.BEAM, JB = D.JB, HP = D.HOP, BG = D.BAG, CL = D.COL;
const flashEl = stage.querySelector(".fx-flash"), overEl = stage.querySelector(".mk-over"), STEELC = "#7f8b96", HOLE = [JB.x + 17.5, JB.y + JB.d, JB.z0 + 10];
let built = ""; function applyDustColour() {}
const tipM = (piv, ang, axis) => { const c = Math.cos(ang), s = Math.sin(ang), R = axis === "x" ? [1, 0, 0, 0, c, -s, 0, s, c] : [c, 0, s, 0, 1, 0, -s, 0, c]; return [...R, ...[0, 1, 2].map((i) => piv[i] - (R[i * 3] * piv[0] + R[i * 3 + 1] * piv[1] + R[i * 3 + 2] * piv[2]))]; };
function plantParts() {
  const o = [], z0 = BM.z0;
  // column, beam, the cable from the light to the box
  o.push(prism(rrect(CL.x - 4, CL.x + CL.w + 4, CL.y - 4, CL.y + CL.d + 4, 1), "z", 0, 1.6, "#5f6872", { mat: "paint" }), box(CL.x, CL.x + CL.w, CL.y, CL.y + CL.d, 1.6, z0 + 14, STEELC, { mat: "paint", bevel: 0.4 }));
  for (const [x, y] of [[CL.x - 2, CL.y - 2], [CL.x + CL.w + 2, CL.y - 2], [CL.x - 2, CL.y + CL.d + 2], [CL.x + CL.w + 2, CL.y + CL.d + 2]]) o.push(cyl(x, y, 1.1, 1.6, 2.5, "#c9ced3", 6, { mat: "steel" }));
  o.push(box(BM.x0, BM.x1, -7, 7, z0, z0 + 2, STEELC, { mat: "paint", bevel: 0.3 }), box(BM.x0, BM.x1, -1, 1, z0 + 2, z0 + 12, STEELC, { mat: "paint", bevel: 0 }), box(BM.x0, BM.x1, -7, 7, z0 + 12, z0 + 14, STEELC, { mat: "paint", bevel: 0.3 }));
  for (let i = 0; i < 9; i++) o.push(box(BM.x0 + 23.6 + i * 24, BM.x0 + 24.4 + i * 24, -6.6, 6.6, z0 + 2, z0 + 12, STEELC, { mat: "paint", bevel: 0 }));
  o.push(tube([[LM.x + 2, LM.y + 4, LM.z1 + 0.5], [LM.x - 3, LM.y + 4, LM.z1 + 5], [LM.x - 6, -3, z0 - 3], [LM.x - 10, -6, z0 - 1], [CL.x + CL.w + 5, -6, z0 - 1], [CL.x + CL.w + 1.2, -6, z0 - 5], [CL.x + CL.w + 1.2, -4, JB.z1 + 14], [CL.x + CL.w + 4, 6, JB.z1 + 8], [JB.x + 6, JB.y + 5, JB.z1 + 4], [JB.x + 6, JB.y + 5, JB.z1 + 1]], 0.9, "#26282c", { seg: 8, mat: "rubber" }));
  // bag-tip hopper with its grate, splash board, and the shelf for the bags
  o.push(prism(rrect(HP.x, HP.x + HP.w, HP.y, HP.y + HP.d, 1), "z", 0, HP.z1, "#6f8a7a", { mat: "paint", bevel: 0.5, shell: true }), box(HP.x + 3, HP.x + HP.w - 3, HP.y + 3, HP.y + HP.d - 3, HP.z1, HP.z1 + 0.06, "#15181c", { bevel: 0, flat: true }));
  for (let x = HP.x + 4; x < HP.x + HP.w - 2; x += 4) o.push(box(x - 0.35, x + 0.35, HP.y + 3, HP.y + HP.d - 3, HP.z1 + 0.06, HP.z1 + 0.7, "#c9ced3", { mat: "steel", bevel: 0 }));
  o.push(box(HP.x - 2, HP.x + HP.w + 2, HP.y - 2, HP.y + 1, HP.z1, HP.z1 + 10, "#6f8a7a", { mat: "paint", bevel: 0.3 }));
  o.push(box(BG.x - 4, BG.x + BG.w + 4, BG.y - 4, BG.y + BG.d + 4, 14, 16, "#8f9aa4", { mat: "paint", bevel: 0.3 }));
  for (const [x, y] of [[BG.x - 2, BG.y - 2], [BG.x + BG.w + 2, BG.y - 2], [BG.x - 2, BG.y + BG.d + 2], [BG.x + BG.w + 2, BG.y + BG.d + 2]]) o.push(box(x - 1, x + 1, y - 1, y + 1, 0, 14, "#8f9aa4", { mat: "paint", bevel: 0 }));
  return o;
}
function lumParts(lv) {
  const o = [], { x, y, w, d, z0, z1 } = LM, cx = x + w / 2, C = "#c3c9cf";
  for (const sy of [y - 2, y + d]) o.push(box(cx - 2.5, cx + 2.5, sy, sy + 2, z0 + 3, BM.z0, "#8f9aa4", { mat: "paint", bevel: 0.3 }), prism(circle(cx, z0 + 6, 1.4, 6), "y", sy - 0.4, sy + 2.4, "#e2e5e8", { mat: "steel" }));
  o.push(box(cx - 5, cx + 5, -7, 7, BM.z0 - 1.6, BM.z0, "#8f9aa4", { mat: "paint", bevel: 0.3 }));
  o.push(prism(rrect(x, x + w, y, y + d, 2), "z", z0, z1, C, { mat: "paint", bevel: 0.6, shell: true }));
  for (let i = 0; i < 9; i++) o.push(box(x + 4 + i * 5, x + 5.4 + i * 5, y + 2, y + d - 2, z1, z1 + D.FIN_H, C, { mat: "paint", bevel: 0.2 }));
  o.push(box(x + 3, x + w - 3, y + 3, y + d - 3, z0 - 0.7, z0, "#fff4d6", { mat: "glass", bevel: 0.3, emit: lv > 0 ? ["#ffe9b0", lv * 0.16] : undefined, emitK: 2 }));
  o.push(box(x + 6, x + w - 6, y + 5, y + d - 5, z0 + 1, z0 + 1.8, "#f4f2ec", { mat: "matte", bevel: 0, emit: lv > 0 ? ["#ffe9b0", lv * 0.1] : undefined }), box(x + 8, x + 24, y + 9, y + 21, z0 + 3, z0 + 8, "#3a3e44", { mat: "plastic", bevel: 0.4 }));
  o.push(box(x + 6, x + 36, y + d, y + d + 0.4, z0 + 3, z0 + 8.2, "#e9e6df", { mat: "matte", bevel: 0 }));
  return o;
}
function jbParts(sealedNow) {
  const o = [], j = JB, W = 2.5, C = "#aeb7c0", S = { mat: "paint", shell: true, bevel: 0.3 }, zi = j.z0 + W;
  for (const [x, y] of [[j.x + 3, j.y + 3], [j.x + j.w - 3, j.y + 3], [j.x + 3, j.y + j.d - 3], [j.x + j.w - 3, j.y + j.d - 3]]) o.push(box(x - 1.5, x + 1.5, y - 1.5, y + 1.5, 0, j.z0, "#8f9aa4", { mat: "paint", bevel: 0 }));
  o.push(box(j.x, j.x + j.w, j.y, j.y + j.d, j.z0, zi, C, { mat: "paint", bevel: 0.3 }));
  o.push(box(j.x, j.x + j.w, j.y, j.y + W, zi, j.z1, C, S), box(j.x, j.x + W, j.y + W, j.y + j.d - W, zi, j.z1, C, S), box(j.x + j.w - W, j.x + j.w, j.y + W, j.y + j.d - W, zi, j.z1, C, S), box(j.x, j.x + j.w, j.y + j.d - W, j.y + j.d, zi, j.z1, C, S));
  o.push(prism(rrect(j.x - 0.8, j.x + j.w + 0.8, j.y - 0.8, j.y + j.d + 0.8, 1.6), "z", j.z1, j.z1 + 1.6, C, { mat: "paint", xhide: true }));
  for (const [x, y] of [[j.x + 2, j.y + 2], [j.x + j.w - 2, j.y + 2], [j.x + 2, j.y + j.d - 2], [j.x + j.w - 2, j.y + j.d - 2]]) o.push(cyl(x, y, 1.2, j.z1 + 1.6, j.z1 + 2.4, "#e2e5e8", 6, { mat: "steel", xhide: true }));
  // terminal rail and terminals inside
  o.push(box(j.x + 5, j.x + j.w - 4, j.y + 9, j.y + 13, zi, zi + 1.5, "#aeb4bb", { mat: "steel", bevel: 0 }));
  for (let i = 0; i < 7; i++) { const tx = j.x + 7 + i * 4.4; o.push(box(tx, tx + 3.6, j.y + 5, j.y + 17, zi + 1.5, zi + 8.5, "#e6dcc3", { mat: "plastic", bevel: 0.3 })); for (const yy of [j.y + 7.5, j.y + 14.5]) o.push(cyl(tx + 1.8, yy, 1, zi + 8.5, zi + 8.9, "#d8dce0", 8, { mat: "steel" })); }
  // gland, the blanking plug (or the hole where it should be), rating plate
  const gy = j.y + j.d;
  o.push(prism(circle(j.x + 9, j.z0 + 10, 3.4, 6), "y", gy, gy + 2, "#c9a24a", { mat: "metal" }), prism(circle(j.x + 9, j.z0 + 10, 2.5, 14), "y", gy + 2, gy + 5, "#c9a24a", { mat: "metal" }), tube([[j.x + 9, gy + 5, j.z0 + 10], [j.x + 9, gy + 10, j.z0 + 8], [j.x + 7, gy + 16, 3], [j.x + 2, gy + 24, 1.4], [j.x - 12, gy + 30, 1.4]], 1.5, "#26282c", { seg: 8, mat: "rubber" }));
  if (sealedNow) o.push(prism(circle(HOLE[0], HOLE[2], 3, 6), "y", gy, gy + 1.6, "#c9a24a", { mat: "metal" }));
  else o.push(prism(circle(HOLE[0], HOLE[2], 2.5, 16), "y", gy, gy + 0.08, "#050505", { bevel: 0, flat: true }));
  o.push(box(j.x + 22, j.x + 38, gy, gy + 0.4, j.z1 - 8, j.z1 - 2, "#e9e6df", { mat: "matte", bevel: 0 }));
  return o;
}
function bagParts() { return [prism(rrect(BG.x, BG.x + BG.w, BG.y, BG.y + BG.d, 4), "z", 16, 25, "#cdb98f", { mat: "matte", bevel: 1.2 }), prism(rrect(BG.x + 1, BG.x + BG.w - 1, BG.y + 1, BG.y + BG.d - 1, 4), "z", 25, 29.6, "#c4ae82", { mat: "matte", bevel: 1.2 }), box(BG.x + 3, BG.x + BG.w - 3, BG.y + BG.d - 0.2, BG.y + BG.d + 0.25, 18.5, 22.5, "#8a5a3a", { bevel: 0, flat: true })]; }
function dustParts(col, sq) {
  const o = [], h = mm() * D.DUST_K, em = sq > 0 ? { emit: ["#ff5a1a", sq * 0.0022] } : {}, O = { mat: "matte", bevel: 0.5 };
  if (h > 0.06) {
    o.push(prism(rrect(LM.x + 1, LM.x + LM.w - 1, LM.y + 1, LM.y + LM.d - 1, 2), "z", LM.z1, LM.z1 + h, col, { ...O, ...em }));
    o.push(prism(rrect(BM.x0 + 2, BM.x1 - 2, -6, 6, 3), "z", BM.z0 + 14, BM.z0 + 14 + h * 0.8, col, O), prism(rrect(JB.x, JB.x + JB.w, JB.y, JB.y + JB.d, 3), "z", JB.z1 + 1.6, JB.z1 + 1.6 + h * 0.7, col, { ...O, xhide: true }));
    o.push(prism(rrect(HP.x - 1, HP.x + HP.w + 1, HP.y - 1.6, HP.y + 0.6, 1), "z", HP.z1 + 10, HP.z1 + 10 + h * 0.5, col, O));
  }
  for (const [x, y, w, d] of [[-70, -60, 30, 14], [14, 40, 30, 12], [100, -50, 22, 12], [-40, 60, 26, 10]]) o.push(prism(rrect(x, x + w * (0.6 + Math.min(1, weeks / 30)), y, y + d, 5), "z", 0, Math.max(0.1, h * 0.25), col, { mat: "matte", bevel: 0.1 }));
  // inside the JB: dust that came in through the plug hole, piled up round the terminals
  const f = jbFill();
  if (f > 0.02) o.push(box(JB.x + 2.6, JB.x + JB.w - 2.6, JB.y + 2.6, JB.y + JB.d - 2.6, JB.z0 + 2.5, JB.z0 + 2.5 + f * 12, col, { mat: "matte", bevel: 0.3 }));
  return o;
}
const hash4 = (i) => { const h = (n2) => { const s = Math.sin(i * 12.9898 + n2 * 78.233) * 43758.5453; return s - Math.floor(s); }; return [h(1), h(2), h(3), h(4)]; };
const EMB = Array.from({ length: 14 }, (_, i) => hash4(i));
let fx = [];
function draw(dt = 0) {
  const K = chaos(), g = Dd(), PL = D.PLATE, DC = (lightTheme ? g.light : g.colour)[1], h = mm() * D.DUST_K, inside = E.xray > 0.5;
  const tAge = tipAt === null ? 99 : now - tipAt, bagA = tAge < 2 ? 70 * sm(0, 0.4, tAge) * (1 - sm(1.2, 2, tAge)) : 0;
  let lm, jm;
  if (K.c >= 0) {
    const c = K.c, B = K.back * big, drop = (LM.z0 - 4) * Math.min(1, (c / 0.9) ** 2);
    if (B > 0.001) { lm = tipM([LM.x + LM.w / 2, 0, BM.z0], (tipFn(c, 0.02, 30) * B * Math.PI) / 180, "y"); lm[9] += 8 * Math.min(c, 0.9) * B; lm[11] -= drop * B; jm = tipM([JB.x + JB.w, JB.y + JB.d, 0], (tipFn(c, 0.06, 60) * B * Math.PI) / 180, "y"); }
  }
  const lv = K.c >= 0 ? 0 : lampLevel, sq = Math.round((K.c >= 0 ? 0 : smoulder) * 6), dustOn = !(K.c >= 0.12 && K.back > 0.5);
  const objs = [{ cache: "plant", rev: 0, parts: plantParts }, { cache: "lum", rev: Math.round(lv * 8), m: lm, parts: () => lumParts(Math.round(lv * 8) / 8) }, { cache: "jb", rev: sealed ? 1 : 0, m: jm, parts: () => jbParts(sealed) },
    { cache: "bag", rev: 0, m: bagA ? tipM([BG.x + BG.w / 2, BG.y, 16], (bagA * Math.PI) / 180, "x") : undefined, parts: bagParts }];
  if (dustOn) objs.push({ cache: "dust", rev: Math.round(weeks * 4) + dust * 1000 + sq * 10000 + (sealed ? 0 : 100000), parts: () => dustParts(DC, sq) });
  let svg = E.render(objs);
  // the light: a pool under it, and a glow in the air
  if (lv > 0.02) { const cx = D.LAMP_C[0]; E.sprite([cx, 0, 1], 44, "#ffe9b0", 0.11 * lv, true); E.sprite([cx, 0, 28], 26, "#ffe9b0", 0.06 * lv, true); E.sprite([cx, 0, LM.z0 - 4], 16, "#fff4d6", 0.16 * lv, true); }
  // a smouldering nest under the blanket of dust
  const sm0 = K.c >= 0 ? 0 : smoulder;
  if (sm0 > 0.03) {
    for (const [a, b, c, d] of EMB) { const fl = 0.5 + 0.5 * Math.sin(now * (3 + d * 5) + c * 9); E.sprite([LM.x + 2 + a * (LM.w - 4), b < 0.5 ? LM.y + 1 : LM.y + LM.d - 1, LM.z1 + 0.4 + c * Math.min(h, 3)], 1.2 + d, "#ff6a1a", sm0 * fl * 0.9, true, 1); }
    E.sprite([D.LAMP_C[0], 0, LM.z1 + h / 2], 20, "#ff5a1a", 0.1 * sm0, true);
    if (dt > 0 && rn() < sm0 * 0.5) fx.push({ k: "smoke", p: [LM.x + rn() * LM.w, LM.y + rn() * LM.d, LM.z1 + h], v: [(rn() - 0.5) * 4, (rn() - 0.5) * 4, 10 + rn() * 8], life: 0, max: 1.6 + rn(), s: 0.25 });
  }
  // dust finding its way in through the hole where the plug should be
  if (dt > 0 && !sealed && K.c < 0 && rn() < 0.35 + 0.65 * (ageing ? 1 : 0.3)) fx.push({ k: "in", p: [HOLE[0] + (rn() - 0.5) * 16, HOLE[1] + 10 + rn() * 12, HOLE[2] + (rn() - 0.3) * 14], life: 0, max: 0.7 });
  // the short inside the box
  if (shortAt !== null && K.c < 0.3) {
    const arc = burst(now - shortAt, 0.01, 0.3) * (0.7 + 0.3 * Math.sin(now * 120)), hp = D.JB_HOT;
    if (arc > 0.02) { E.sprite(hp, 2.4, "#ffffff", arc, true, 1); E.sprite(hp, 12, "#8fb4ff", 0.7 * arc, true, 1); }
    if (dt > 0 && jbFire > 0.05) for (let j = 0; j < 2; j++) fx.push({ k: "flame", p: [JB.x + 6 + rn() * (JB.w - 12), JB.y + 6 + rn() * (JB.d - 12), JB.z0 + 8 + rn() * 10], v: [(rn() - 0.5) * 30, (rn() - 0.5) * 30 + 20, 20 + rn() * 40], life: 0, max: 0.3 + rn() * 0.3, s: 0.6 * jbFire });
  }
  // the cloud from the bag: normal for a bag-tip station
  const cl = K.c >= 0 || cloudAt === null || now < cloudAt ? 0 : sm(0, 1.2, now - cloudAt) * (1 - sm(2.4, 4, now - cloudAt));
  if (dt > 0 && cl > 0.05 && now - cloudAt < 2.6) for (let j = 0; j < 3; j++) fx.push({ k: "dust", p: [D.CLOUD_SRC[0] + (rn() - 0.5) * 24, D.CLOUD_SRC[1] + (rn() - 0.5) * 20, D.CLOUD_SRC[2] + rn() * 6], v: [-18 - rn() * 34, -8 - rn() * 16, 14 + rn() * 22], life: 0, max: 2 + rn() * 1.4, s: 1 });
  // primary, then (if the place is dirty) the secondary
  const src = primSrc === "jb" ? [JB.x + 18, JB.y + JB.d + 4, JB.z0 + 14] : [D.LAMP_C[0], D.LAMP_C[1], LM.z1 + 2];
  if (primaryAt !== null && boomAt === null) { const pa2 = now - primaryAt; E.sprite(src, 6 + 50 * pa2, "#ffb04a", 0.6, true, 1); E.sprite(src, 3 + 20 * pa2, "#fff0c8", 0.7, true, 1); if (dt > 0) for (let j = 0; j < 4; j++) fx.push({ k: "flame", p: [src[0] + (rn() - 0.5) * 20, src[1] + (rn() - 0.5) * 20, src[2] + (rn() - 0.5) * 10], v: [(rn() - 0.5) * 80, (rn() - 0.5) * 80, 10 + rn() * 60], life: 0, max: 0.3 + rn() * 0.3, s: 1 }); }
  if (K.c >= 0) {
    const c = K.c, life = Math.exp(-c / 0.5), sc = 0.45 + 0.75 * big, Rr = (18 + 70 * (1 - Math.exp(-c / 0.2))) * sc, C = [src[0], src[1], src[2] + 20 * c];
    if (life > 0.02) { E.sprite(C, Rr * 0.8, "#ffb04a", 0.5 * life, true, 1); E.sprite(C, Rr * 0.35, "#fff0c8", 0.6 * life, true, 1); }
    if (dt > 0 && c < 0.4 + 0.8 * big) for (let j = 0; j < 3 + Math.round(8 * big); j++) { const wide = big > 0.4; fx.push({ k: "flame", p: wide ? [PL.x + 8 + rn() * (PL.w - 16), (rn() - 0.5) * (rn() < 0.5 ? 20 : PL.d - 20), rn() < 0.5 ? BM.z0 + 10 + rn() * 14 : 6 + rn() * 70] : [src[0] + (rn() - 0.5) * 50, src[1] + (rn() - 0.5) * 50, src[2] + (rn() - 0.5) * 20], v: [(rn() - 0.5) * 130, (rn() - 0.5) * 130, 30 + rn() * 110], life: 0, max: 0.45 + rn() * 0.6, s: (1 + rn()) * (0.7 + big) }); }
    if (dt > 0 && c >= 0.3 && c < 2.8 && rn() < dt * 40 * sc) fx.push({ k: "smoke", p: [(rn() - 0.5) * 200 * sc + src[0] * (1 - big), (rn() - 0.5) * 120 * sc, 30 + rn() * 60], v: [(rn() - 0.5) * 20, (rn() - 0.5) * 20, 30 + rn() * 40], life: 0, max: 2 + rn() * 2, s: 1.5 * sc });
  }
  fx = fx.filter((p) => {
    p.life += dt; if (p.life > p.max) return false;
    const t = p.life / p.max;
    if (p.k === "in") { const u = t * t; E.sprite([p.p[0] + (HOLE[0] - p.p[0]) * u, p.p[1] + (HOLE[1] - p.p[1]) * u, p.p[2] + (HOLE[2] - p.p[2]) * u], 1.8 * (1 - 0.5 * t), DC, 0.6 * Math.sin(t * Math.PI)); return true; }
    if (p.k === "flame") { p.v[0] *= 0.93; p.v[1] *= 0.93; }
    if (p.k === "dust") { p.v[0] *= 0.985; p.v[1] *= 0.985; p.v[2] *= 0.98; }
    for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * dt;
    if (p.k === "flame") E.sprite(p.p, (5 + 15 * t) * p.s, t < 0.25 ? "#fff0b8" : t < 0.6 ? "#ff9a2e" : "#d8481a", 0.8 * (1 - t * t), true, 2);
    else if (p.k === "dust") E.sprite(p.p, 7 + 16 * t, DC, 0.3 * Math.sin(Math.min(1, t * 1.4) * Math.PI) ** 0.7);
    else E.sprite(p.p, (12 + 40 * t) * p.s, lightTheme ? "#4a4744" : "#2e2c2b", 0.45 * (1 - t));
    return true;
  });
  // lettering
  let m = E.faceMatrix([PL.x + PL.w - 96, PL.y + PL.d - 13, 0.05], [1, 0, 0], [0, 1, 0]);
  if (m) svg += '<g transform="' + m + '"><text class="pt bench" x="0" y="5" font-size="4.6">ZONE 21 · BAG TIP</text></g>';
  if (K.c < 0) {
    m = E.faceMatrix([LM.x + 6, LM.y + LM.d + 0.45, LM.z0 + 8.2], [1, 0, 0], [0, 0, -1]);
    if (m) svg += '<g transform="' + m + '"><text class="pt" x="1.4" y="3.7" font-size="2.6">Ex tb IIIC T135°C</text></g>';
    m = E.faceMatrix([JB.x + 22, JB.y + JB.d + 0.45, JB.z1 - 2], [1, 0, 0], [0, 0, -1]);
    if (m) svg += '<g transform="' + m + '"><text class="pt" x="1" y="2.8" font-size="2">Ex tb IIIC</text><text class="pt lo" x="1" y="5.2" font-size="2">IP66</text></g>';
    // what the light is doing under its blanket
    const p = E.project([D.LAMP_C[0], 0, BM.z0 + 26]), deep = mm() > 5;
    svg += '<text class="mk-lab tlab" data-s="' + (smoulder > 0 ? "fire" : temp > tmax() ? "hot" : "ok") + '" text-anchor="middle" x="' + p[0].toFixed(1) + '" y="' + (p[1] - 14).toFixed(1) + '">' + Math.round(temp) + ' °C</text><text class="mk-lab dlab" data-bad="' + deep + '" text-anchor="middle" x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '">' + mm().toFixed(1) + " mm of dust</text>";
  }
  if (E.xray > 0.02 && K.c < 0) svg += E.callouts([
    { p: [LM.x + 4, LM.y + LM.d, LM.z0 + 5], text: "Floodlight", sub: "has to stay cool enough" }, { p: [JB.x + 8, JB.y + JB.d, JB.z0 + 18], text: "Junction box", sub: sealed ? "has to keep the dust out" : "blanking plug missing" },
    { p: [BM.x1 - 30, 0, BM.z0 + 14], text: "Beam", sub: "what settles up here feeds the secondary" }, { p: [HP.x + HP.w, HP.y + HP.d / 2, HP.z1], text: "Bag tip", sub: "makes a cloud every shift" },
  ], E.xray, E.fs < 0.62 ? {} : { topL: 70, topR: 70 });
  if (sceneG.innerHTML !== svg) sceneG.innerHTML = svg;
  if (K.c >= 0) { const A = (4 + 6 * big) * Math.exp(-K.c / 0.4); setShake(A * Math.sin(K.c * 90), A * Math.cos(K.c * 71)); flashEl.style.opacity = ((0.3 + 0.55 * big) * burst(K.c, 0.03, 0.25)).toFixed(3); }
  else if (boomAt !== null && now - boomAt > BOOM_END) {
    boomAt = null; primaryAt = null; shortAt = null; smoulder = 0; jbFire = 0; cloudAt = null; tipAt = null; temp = M.bare; weeks = 0; built = ""; lamp = true;
    setShake(0, 0); flashEl.style.opacity = "0";
    say("Reset to a freshly cleaned plant. The bag station still makes a cloud every shift. That's normal, it's why it's Zone 21. The cloud only matters when it finds something burning.");
  }

  const text = K.c >= 0 ? (K.c < 3.2 ? (big > 0.4 ? "BOOM · secondary explosion" : "BOOM · primary only") : "resetting…")
    : primaryAt !== null ? (primSrc === "jb" ? "PRIMARY · the arc lit the dust in the box" : "PRIMARY · the cloud found the smoulder")
    : Math.round(weeks) + " wk · " + mm().toFixed(1) + " mm · " + Math.round(temp) + " °C" + (smoulder > 0.3 ? " · SMOULDERING" : "") + " · JB " + (sealed ? "sealed" : shortAt !== null ? "SHORT" : Math.round(jbFill() * 100) + " %");
  if (readout.textContent !== text) readout.textContent = text;
  if (boomAt === null && primaryAt === null) {
    const g = Dd();
    const cl = cloudAt !== null && now >= cloudAt;
    if (shortAt !== null) {}
    else if (cl && now - cloudAt > 1) say("A cloud of " + g.name + " from the bag. Normal for a bag-tip station. Nothing out here is hot enough to light it: the light's at " + Math.round(temp) + " °C" + (g.cloud ? " and this cloud needs about " + g.cloud + " °C" : "") + ". It settles and adds to the layer.");
    else if (!cl && smoulder > 0.6) say("Smouldering. " + Math.round(weeks) + " weeks of " + g.name + " (" + mm().toFixed(1) + " mm) is a blanket on the light: " + Math.round(temp) + " °C under it, past the " + Math.round(layerIgn()) + " °C this layer lights at. No flame, no bang. Yet. Now imagine the next bag gets tipped.");
    else if (!cl && !sealed && jbFill() > 0.1) say(g.cond
        ? "Missing blanking plug, and aluminium dust conducts (that's what group IIIC means). It's piling up round the terminals inside the box: " + Math.round(jbFill() * 100) + " % full. When it bridges two of them…"
        : "Missing blanking plug: the box is " + Math.round(jbFill() * 100) + " % full of " + g.name + ". It's " + g.group + ", non-conductive, so it won't short the terminals, but the box is meant to keep it out. Try a conductive dust.");
    else if (!cl && mm() > 5 && g.layer === null) say(Math.round(weeks) + " weeks of aluminium dust on the light. It won't smoulder at these temperatures; the danger with this one is that it conducts. Lose a blanking plug.");
    else if (!cl && mm() > 5) say(Math.round(weeks) + " weeks without cleaning: " + mm().toFixed(1) + " mm on the light. Its T135 marking only holds up to 5 mm, and it's " + Math.round(temp) + " °C under there" + (temp > tmax() ? ", past the " + Math.round(tmax()) + " °C limit for this dust." : "."));
    else if (!cl) say(Math.round(weeks) + " weeks since the last clean. " + mm().toFixed(1) + " mm on the light, " + Math.round(temp) + " °C under it. Fine.");
  }
}
const TOUR = [
  { dust: 0, weeks: 4, sealed: true, tip: 2.5, hold: 7 },
  { dust: 0, weeks: 44, sealed: true, tip: 6.5, hold: 12 },
  { dust: 1, weeks: 26, sealed: false, tip: 3.5, hold: 7 },
  { dust: 2, weeks: 2, sealed: false, age: true, hold: 11 },
];
function tick(t) {
  const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
  last = t;
  const sdt = dt * (slow ? 0.12 : 1);
  now += sdt;
  if (touring && !booming()) {
    tourClock += dt;
    if (tourStep < 0 || tourClock > tourEnd) {
      tourStep = (tourStep + 1) % TOUR.length;
      const s = TOUR[tourStep];
      dust = s.dust; weeks = s.weeks; sealed = s.sealed; lamp = true; temp = M.bare; smoulder = 0; jbFire = 0; shortAt = null; cloudAt = null; tipAt = null; built = ""; ageing = !!s.age;
      applyDustColour(); pendingTip = s.tip ? now + s.tip : null; tourEnd = tourClock + s.hold;
    }
    if (pendingTip !== null && now >= pendingTip) { pendingTip = null; tip(); }
  }
  step(sdt);
  draw(sdt); syncUi();
  const settled = Math.abs(temp - (lamp ? tUnder() : 25)) < 0.3 && Math.abs(lampLevel - (lamp ? 1 : 0)) < 0.01;
  const busy = touring || ageing || !settled || cloudAt !== null || (tipAt !== null && now - tipAt < 2.5) || (smoulder > 0 && smoulder < 1) || smoulder > 0 || jbFire > 0 || (!sealed) || primaryAt !== null || boomAt !== null || drag;
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { touring = false; pendingTip = null; };
const guard = (fn) => (...a) => { takeOver(); if (booming()) return; fn(...a); run(); };
const setDust = guard((i) => { dust = i; smoulder = 0; applyDustColour(); });
const setWeeks = guard((v) => { weeks = clamp(Math.round(v), 0, M.maxWeeks); });
const setJb = guard((s) => { sealed = s; });
const doTip = guard(() => tip());
const doClean = guard(() => { weeks = 0; smoulder = 0; jbFire = 0; shortAt = null; ageing = false; say("Cleaned: vacuumed, not blown down with an air hose (that just makes a cloud). Nothing on the light, nothing on the beams, nothing to feed a secondary."); });
const toggleAge = guard(() => { ageing = !ageing; });
const toggleLamp = guard(() => { lamp = !lamp; });
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;

ui.dust.forEach((b, i) => b.addEventListener("click", () => setDust(i)));
ui.weeks.addEventListener("input", () => { sliding.weeks = true; setWeeks(+ui.weeks.value); });
ui.weeks.addEventListener("change", () => { sliding.weeks = false; run(); });
ui.jb.forEach((b) => b.addEventListener("click", () => setJb(b.dataset.jb === "sealed")));
ui.tip.addEventListener("click", doTip);
ui.clean.addEventListener("click", doClean);
ui.age.addEventListener("click", toggleAge);
ui.lamp.addEventListener("click", toggleLamp);
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; tourClock = 0; } run(); });
let drag = null;
// tap the junction box to pull or refit its blanking plug, tap anywhere else to tip a bag
onTap((ev) => {
  const m0 = overEl.getScreenCTM(); if (!m0) return doTip();
  const pt = overEl.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; const q2 = pt.matrixTransform(m0.inverse()), c = E.project([JB.x + JB.w / 2, JB.y + JB.d / 2, (JB.z0 + JB.z1) / 2]);
  const rpx = Math.abs(E.project([JB.x + JB.w, JB.y, 0])[0] - E.project([JB.x, JB.y + JB.d, 0])[0]) / 2;
  if (Math.abs(q2.x - c[0]) < rpx && Math.abs(q2.y - c[1]) < rpx * 0.8) setJb(!sealed); else doTip();
});
stage.addEventListener("keydown", (ev) => {
  const map = { x: () => { setX(!E.xrayOn); run(); }, X: () => { setX(!E.xrayOn); run(); }, ArrowUp: () => setWeeks(weeks + 2), ArrowDown: () => setWeeks(weeks - 2), " ": doTip, Enter: doTip, c: doClean, p: () => setJb(!sealed), l: toggleLamp, g: () => setDust((dust + 1) % D.DUSTS.length), s: () => { slow = !slow; run(); } };
  if (map[ev.key]) { ev.preventDefault(); map[ev.key](); }
});
window.__fig = { E, freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
setX(true); syncUi(); draw();
`;

const CSS = `.fx-flash{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(circle 70% at 50% 42%,#fff8e8 0%,#ffd9a0 40%,rgba(255,170,90,0) 100%)}
.pt{font-family:var(--anatomy-mono);fill:#23262b;font-weight:700}.pt.lo{fill:#5a6068;font-weight:600}.pt.bench{fill:var(--anatomy-muted);font-weight:600;letter-spacing:.08em;opacity:.8}
.tlab{font-size:calc(13px*var(--mk-ts,1))}.tlab[data-s="hot"]{fill:var(--mk-warn)}.tlab[data-s="fire"]{fill:var(--mk-danger)}.dlab{font-weight:400;font-size:calc(10px*var(--mk-ts,1))}.dlab[data-bad="true"]{fill:var(--mk-danger)}
@media (min-width:561px){.mk-hint{top:46px}}
.ctl #tip,.ctl #clean{font-weight:600;letter-spacing:.06em}
.ctl output[data-bad="true"]{color:var(--mk-danger)}
.slide{padding-top:12px}.notch{position:absolute;top:8px;bottom:0;width:0;border-left:2px solid var(--anatomy-mid);pointer-events:none}.notch::after{content:attr(data-label);position:absolute;bottom:100%;left:-2px;font-size:9.5px;white-space:nowrap;color:var(--anatomy-muted)}
.meter{margin:26px 0 12px}.meter.plain{margin:12px 0 0}.mark{transition:left .3s}
.meter .fill[data-state="hot"]{background:var(--mk-warn)}.meter .fill[data-state="fire"]{background:var(--mk-danger)}
#mark-t135{border-left-color:var(--anatomy-mid)}#mark-t135::after{color:var(--anatomy-muted)}
#mark-limit{border-left-style:dashed;border-left-color:var(--mk-accent)}#mark-limit::after{color:var(--mk-accent);bottom:auto;top:100%}
#mark-ign{top:-17px}`;

const stage = stageHtml({
  W, H, fig: "Fig 7", title: "Ex t, dust and housekeeping", xray: true,
  label: "A dusty plant area: a bag-tip hopper, a dust-tight floodlight under a steel beam, and a dust-tight junction box on a stand. Weeks without cleaning pile dust on the light and the beam; a missing blanking plug lets dust into the box. Tipping a bag raises a cloud. An x-ray mode takes the lid off the junction box and turns its walls to glass.",
  keysHelp: "Weeks since cleaning: drag to rotate, X for x-ray, tap the junction box to pull its plug, drag up and down or arrow keys; space tips a bag; C cleans; P toggles the blanking plug",
  extra: `<div class="fx-flash" aria-hidden="true"></div>`,
});

const CONTROLS = `<div class="ctl" role="group" aria-label="Test controls">
  <div class="ctl-row"><span class="ctl-label">Dust</span>${DUSTS.map((d, i) => `<button type="button" data-dust="${i}" aria-pressed="${i === START.dust}">${d.btn}<small>${d.group} · ${d.cond ? "conductive" : "layer " + d.layer + " °C"}</small></button>`).join("")}</div>
  <div class="ctl-row"><span class="ctl-label">Since cleaned</span><div class="slide"><span class="notch" data-label="5 mm on the light" style="left:${((5 / MODEL.mmPerWeek) / MODEL.maxWeeks * 100).toFixed(1)}%"></span><input id="weeks" type="range" min="0" max="${MODEL.maxWeeks}" step="1" value="${START.weeks}" aria-label="Weeks since the area was cleaned"></div><output id="weeks-out">${START.weeks} wk</output></div>
  <div class="ctl-row"><span class="ctl-label">Light °C</span><div class="meter" aria-hidden="true"><span id="temp-fill" class="fill"></span><span id="mark-t135" class="mark" data-label="T135"></span><span id="mark-limit" class="mark" data-label="limit"></span><span id="mark-ign" class="mark" data-label="layer lights"></span></div><output id="temp-out">90 °C</output></div>
  <div class="ctl-row"><span class="ctl-label">JB</span><button type="button" data-jb="sealed" aria-pressed="true">Sealed</button><button type="button" data-jb="open" aria-pressed="false">Plug missing</button><div class="meter plain" aria-hidden="true"><span id="jb-fill" class="fill"></span><span id="mark-burn" class="mark" style="left:${(MODEL.jbBurn * 100).toFixed(0)}%" data-label="bridges terminals"></span></div><output id="jb-out">clean</output></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="tip">TIP A BAG</button><button type="button" id="clean">CLEAN</button><button type="button" id="age" aria-pressed="false">Let it go</button><button type="button" id="lamp" aria-pressed="true">Light on</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
</div>`;


const foot = footHtml({
  theme, slug: "ex-t-dust",
  real: "dust groups (IIIC = conductive), the IEC 60079-14 dust rule (Tmax = the lower of ⅔ × cloud ignition temperature and 5 mm layer ignition temperature − 75 K, layers up to 5 mm) and the dusts' literature ignition temperatures.",
  made: "how fast dust settles, how hot the light runs under it, how fast the box fills, and the timings.",
});
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), pageMk2({
  k, title: "Ex t, dust and housekeeping", fig: "Fig 7", hint: "Tap: tip a bag · tap the box: pull the plug", theme, W, H, stage, controls: CONTROLS, css: CSS, foot,
  caption: "Ex t does two jobs, and each piece of kit here shows one failing. The light has to stay cool enough: its T135 °C marking only holds with up to 5 mm of dust on it, so months without cleaning bury it until the layer underneath smoulders, and the next cloud from the bag station finds it. The junction box has to keep dust out: lose a blanking plug and dust gets in, and if it's conductive (group IIIC, like aluminium) it piles up until it bridges two live terminals. The short arcs, blows the dust inside into a cloud and lights it. Either way that's the primary. Its blast throws everything settled on the beams into the air, and that's the secondary, the one that takes the building. How big it gets is down to housekeeping.",
  script: LIVE.replace("__DATA__", JSON.stringify(DATA)),
}));
console.log("wrote", name);
