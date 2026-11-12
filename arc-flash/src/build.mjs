import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { engineScript, stageHtml, pageMk2, footHtml } from "../../mk2/shell.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const W = 960, H = 600;

// Truth: IEEE 1584-2002 empirical model, LV (< 1 kV), enclosed switchgear, solidly earthed, 32 mm gap, x = 1.473, Cf = 1.5.
// Arc flash boundary at 1.2 cal/cm² (onset of a second-degree burn). NFPA 70E PPE categories: 1 = 4, 2 = 8, 3 = 25, 4 = 40 cal/cm².
// Toy: the protection (instantaneous pickup 10 kA arcing, 0.06 s; else 0.4 s delay; backup 1 s), the burn grading, clothes catching fire, the knockdown.
const MODEL = { V: 0.415, G: 32, x: 1.473, cf: 1.5, inst: 0.06, delay: 0.4, backup: 1.0, pickup: 10, pickupMaint: 3, eb: 1.2, ppe: { 0: 0, 1: 4, 2: 8, 4: 40 } };

const U = 40; // plot units per metre
const BX0 = -118, BX1 = -88, BY0 = -26, BY1 = 26, ZB = 4, ZT = 86;
const BAR_X = -98;
const ARC = [BAR_X, -6, 44];
const PERCH = [BAR_X + 5, -6, 69];
const PLATE = { x: -130, y: -52, w: 172, d: 104, r: 8 };
const P = k.fitProjection([...k.boxCorners(PLATE, -0.8, 0), [-118, -28, 90], [-88, 28, 90], [14, -28, 0], [14, 30, 70], [-118, 28, 90]], W, H, { pad: 30, azimuth: 45, elevation: 30 });
const DATA = { W, H, P, PLATE };
Object.assign(DATA, { MODEL, U, BAR_X, BX1, ARC, PERCH, GEO: { BX0, BY0, BY1, ZB, ZT } });
const ePct = (e) => ((Math.log10(e) - Math.log10(0.3)) / (Math.log10(100) - Math.log10(0.3)) * 100).toFixed(1);
const LIVE = `
${engineScript()}
const D = __DATA__;
const stage = document.querySelector(".mk-stage");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lightTheme = document.body.dataset.theme === "light";
const E = mk2(stage, D.P, { W: D.W, H: D.H, pivot: [-40, 0, 40], plate: { ...D.PLATE, h: 12, foot: 5 }, shadowBox: [-138, -60, -18, 50, 60, 96] });
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
const lg = Math.log10;
// IEEE 1584-2002, under 1 kV, enclosed, solidly earthed
function calc(ibf, dmm, prot) {
  const li = lg(ibf), V = M.V, G = M.G;
  const lIa = -0.097 + 0.662 * li + 0.0966 * V + 0.000526 * G + 0.5588 * V * li - 0.00304 * G * li;
  const ia = Math.pow(10, lIa);
  const en = Math.pow(10, -0.555 - 0.113 + 1.081 * lIa + 0.0011 * G);
  const pick = prot === "maint" ? M.pickupMaint : M.pickup;
  const t = prot === "backup" ? M.backup : ia >= pick ? M.inst : M.delay;
  const e = M.cf * en * (t / 0.2) * Math.pow(610 / dmm, M.x);
  const db = 610 * Math.pow(M.cf * en * (t / 0.2) / M.eb, 1 / M.x);
  return { ia, t, e, db, slow: prot !== "backup" && ia < pick };
}
const catOf = (e) => e <= 1.2 ? "none needed" : e <= 4 ? "CAT 1" : e <= 8 ? "CAT 2" : e <= 25 ? "CAT 3" : e <= 40 ? "CAT 4" : "no category";

let ibf = 25, dmm = 610, prot = "inst", ppe = 2;
let frags = [], arcAt = null, res = null, out = null, frame = 0, last = 0, now = 0, visible = false, touring = true, slow = false, tourClock = 0, tourStep = -1, actions = [], lastShot = "";
const END_PAD = 4.2;
const vt = (t) => 0.22 + t * 1.1;
const busy = () => arcAt !== null;
const ui = {
  fault: document.querySelector("#fault"), faultOut: document.querySelector("#fault-out"),
  dist: document.querySelector("#dist"), distOut: document.querySelector("#dist-out"),
  prot: [...document.querySelectorAll("[data-prot]")], ppe: [...document.querySelectorAll("[data-ppe-btn]")],
  eFill: document.querySelector("#e-fill"), eOut: document.querySelector("#e-out"), eMark: document.querySelector("#e-mark"),
  stats: document.querySelector("#stats"), go: document.querySelector("#go"), slow: document.querySelector("#slow"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"),
};
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };
const ePos = (e) => clamp((lg(Math.max(e, 0.3)) - lg(0.3)) / (lg(100) - lg(0.3)), 0, 1) * 100;
const ppeName = (p) => p === 0 ? "work clothes" : "CAT " + p + " gear (" + M.ppe[p] + " cal/cm²)";

function syncUi() {
  const r = calc(ibf, dmm, prot);
  ui.fault.value = ibf; ui.faultOut.textContent = ibf + " kA";
  ui.dist.value = dmm; ui.distOut.textContent = dmm + " mm";
  ui.prot.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.prot === prot)));
  ui.ppe.forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.ppeBtn === ppe)));
  ui.eFill.style.width = ePos(r.e).toFixed(1) + "%";
  ui.eFill.dataset.state = r.e <= Math.max(1.2, M.ppe[ppe]) ? "ok" : "bad";
  ui.eOut.textContent = r.e.toFixed(1) + " cal";
  ui.eMark.style.display = ppe ? "" : "none";
  ui.eMark.style.left = ePos(M.ppe[ppe]).toFixed(1) + "%"; ui.eMark.dataset.label = "your PPE " + M.ppe[ppe];
  ui.stats.innerHTML = "<b>" + r.ia.toFixed(1) + " kA</b> arcing · clears in <b>" + r.t.toFixed(2) + " s</b>" + (r.slow ? " (under the instantaneous pickup)" : "") + " · boundary <b>" + (r.db / 1000).toFixed(1) + " m</b> · needs <b>" + catOf(r.e) + "</b>";
  ui.go.disabled = busy();
  ui.slow.setAttribute("aria-pressed", String(slow));
  ui.tour.setAttribute("aria-pressed", String(touring));
}

function strike() {
  if (busy()) return;
  res = calc(ibf, dmm, prot);
  const rate = M.ppe[ppe], lim = Math.max(M.eb, rate);
  const burn = res.e <= lim ? 0 : (res.e > 3 * lim || (rate === 0 && res.e > 4)) ? 2 : 1;
  const extreme = res.e >= 40;
  out = { burn, fire: rate === 0 && res.e > 4 && !extreme, knock: res.e > 12 && !extreme, extreme, rate };
  frags = [...Array(5)].map((_, i) => ({ vx: 60 + Math.random() * 220, vy: 160 + Math.random() * 220, w: (Math.random() - 0.5) * 1400, s: i }));
  arcAt = now + 0.45;
  say("The spanner slips off the support…");
}

function verdict() {
  const r = res, o = out, e = r.e.toFixed(1), tt = r.t.toFixed(2) + " s";
  const why = r.slow ? " The fault current was below the breaker's instantaneous pickup, so it waited out its " + M.delay + " s delay. Less fault current, more energy." : prot === "maint" ? " Maintenance mode dropped the pickup, so it went instantaneous." : prot === "backup" ? " Only the upstream backup saw it, and that took a full second." : "";
  if (o.extreme) return "Arc for " + tt + ", " + e + " cal/cm² at " + dmm + " mm. That's past every PPE category there is, and at this size it's not just heat: the blast throws you across the room and leaves your boots behind." + (ppe ? " The suit didn't stand a chance." : "") + " Nobody works on that live. Switch it off." + why;
  if (o.burn === 0 && r.e <= M.eb) return "Arc for " + tt + ", " + e + " cal/cm² at " + dmm + " mm. Under 1.2, the line for a second-degree burn. A fright, ringing ears, nothing worse." + why;
  if (o.burn === 0) return "Arc for " + tt + ", " + e + " cal/cm² at " + dmm + " mm. Your " + ppeName(ppe) + " held. You walk away shaking, deaf for a bit, with a ruined shirt." + why;
  if (o.fire) return "Arc for " + tt + ", " + e + " cal/cm² at " + dmm + " mm, in work clothes. They caught fire and kept burning after the arc was out: that's the bit that does the damage." + (r.e > 40 ? " No PPE category goes above 40." : "") + why;
  return "Arc for " + tt + ", " + e + " cal/cm² at " + dmm + " mm. Your " + ppeName(ppe) + " wasn't enough: " + (o.burn === 2 ? "serious burns" : "second-degree burns") + (o.knock ? ", and the blast knocked you off your feet" : "") + "." + (r.e > 40 ? " Above 40 there's no PPE category at all. Switch it off." : "") + why;
}

// ---------------- the switchboard and the person in front of it, in real 3D ----------------
const TAU = Math.PI * 2, G2 = D.GEO, BX0 = G2.BX0, BX1 = D.BX1, BY0 = G2.BY0, BY1 = G2.BY1, ZB = G2.ZB, ZT = G2.ZT, BAR = D.BAR_X, ARC = D.ARC;
const flashEl = stage.querySelector(".fx-flash"), rn = () => Math.random();
function boardStatic() {
  const o = [], PT = { mat: "paint" }, GREY = "#c2c7cd";
  o.push(box(BX0, BX1, BY0, BY1, 0, ZB, "#565d65", PT));
  o.push(box(BX0, BX0 + 2, BY0, BY1, ZB, ZT, GREY, PT), box(BX0 + 2, BX1, BY0, BY0 + 1.6, ZB, ZT, GREY, PT), box(BX0 + 2, BX1 - 2, BY0 + 1.6, BY1 - 1.6, ZB, ZB + 1.2, "#8f959d", PT));
  // the near side and the top: glass in x-ray, so you can see the bars
  o.push(box(BX0, BX1, BY1 - 1.6, BY1, ZB, ZT, GREY, { ...PT, shell: true }), box(BX0 - 0.6, BX1 + 0.6, BY0 - 0.6, BY1 + 0.6, ZT - 2, ZT + 1, "#aab0b8", { ...PT, shell: true }), box(BX1 - 1.4, BX1, BY0, BY1, ZB, ZB + 2.6, GREY, PT));
  // incoming breaker up top
  o.push(box(BX0 + 2, BX1 - 6, BY0 + 4, BY1 - 4, 74, 84, "#2f3338", { mat: "plastic" }), box(BX1 - 6, BX1 - 5.2, -4, 4, 76, 82, "#d9d6cf", { mat: "plastic" }), box(BX1 - 5.2, BX1 - 4, -1.2, 1.2, 77.5, 80.5, "#1b1c1f", { mat: "plastic", bevel: 0 }));
  // insulated supports behind the bars, then L1 L2 L3 in copper
  for (const z of [16, 64]) o.push(box(BX0 + 2, BAR + 3, -20, 20, z, z + 4, "#b5452f", { mat: "matte" }));
  for (const y of [-12, 0, 12]) { o.push(box(BAR - 3, BAR + 3, y - 1, y + 1, 14, 72, "#c8794a", { mat: "copper" })); for (const z of [18, 66]) o.push(cyl(BAR + 3, y, 0.01, z, z, "#000", 3), prism(circle(y, z, 1.3, 8), "x", BAR + 3, BAR + 4, "#aeb4bb", { mat: "steel", bevel: 0 })); }
  // the door, swung wide open against the far side, and a rubber mat on the floor
  o.push(box(BX1, BX1 + 50, BY0 - 2.6, BY0 - 1, ZB + 2, ZT - 2, GREY, PT), box(BX1 + 44, BX1 + 46, BY0 - 1, BY0 - 0.2, 40, 52, "#2a2d31", { mat: "plastic" }));
  o.push(box(BX1 + 4, BX1 + 44, -22, 22, 0, 0.8, "#2a2d31", { mat: "rubber" }));
  // the arc flash label on the near side
  o.push(box(BX0 + 4, BX0 + 26, BY1, BY1 + 0.3, 57, 72, "#f4f2ec", { mat: "matte", bevel: 0 }), box(BX0 + 4, BX0 + 26, BY1 + 0.3, BY1 + 0.4, 68.4, 72, "#e2742a", { mat: "matte", bevel: 0 }));
  return o;
}
// the bloke: boots stay put, the clothes are separate pieces, and underneath there's a bloke in his undies
const SKIN = "#d8a888";
function workerParts(ppe2, burn, what) {
  const o = [], dark = (c2) => (burn === 2 ? mixHex(c2, "#141210", 0.78) : burn === 1 ? mixHex(c2, "#3a2a1a", 0.5) : c2);
  const shirt = dark(ppe2 === 4 ? "#a39466" : ppe2 ? "#2e4a7a" : "#4f74b0"), pants = dark(ppe2 === 4 ? "#a39466" : "#3a4150");
  const limb = (a, b, r, col, m) => tube([a, b], r, col, { seg: 10, mat: m || "matte" });
  if (what === "boots") { for (const y of [-3.5, 3.5]) o.push(prism(rrect(-5, 2.6, y - 2.1, y + 2.1, 1.2), "z", 0.8, 3.8, "#2a2724", { mat: "rubber" })); return o; }
  if (what === "under") {
    for (const y of [-3.1, 3.1]) o.push(limb([0, y, 3.5], [0, y, 23], 1.9, SKIN));
    o.push(prism(rrect(-2.6, 2.6, -5.4, 5.4, 1.6), "z", 22, 35, "#d94040", { mat: "matte" }), prism(rrect(-3.1, 3.1, -6.6, 6.6, 2.2), "z", 35, 60, SKIN, { mat: "matte" }));
    for (const y of [-8.5, 8.5]) o.push(limb([0, y, 58], [0, y, 38], 1.7, SKIN));
    return o;
  }
  if (what === "head") {
    o.push(cyl(0, 0, 2, 59.5, 63, SKIN, 12, { mat: "matte" }), sphere([0, 0, 67.5], 4.6, burn ? dark(SKIN) : SKIN, { squash: [1, 1, 1.12], lat: 10, lon: 16, mat: "matte" }));
    if (ppe2 === 4) o.push(lathe([[5.9, 58.5], [6.4, 66], [5.6, 73], [3, 75.6], [0, 76]], dark("#8b7d55"), { c: [0, 0, 0], seg: 20, mat: "matte" }), box(-6.6, -5.8, -3.6, 3.6, 63.5, 70.5, "#31404a", { mat: "gloss", bevel: 0 }));
    else { o.push(lathe([[5.2, 70.6], [5.4, 72], [4.6, 74.4], [2.4, 75.6], [0, 75.8]], "#f2f2ee", { c: [0, 0, 0], seg: 20, mat: "plastic" }), lathe([[5.2, 70.4], [6.6, 70.4], [6.6, 71]], "#f2f2ee", { c: [0, 0, 0], seg: 20, mat: "plastic" }));
      if (ppe2 === 2) o.push(lathe([[5.9, 61], [5.9, 70.4]], "#a0c8e6", { c: [0, 0, 0], a0: Math.PI * 0.62, a1: Math.PI * 1.38, seg: 16, mat: "glass", opacity: 0.4 })); }
    return o;
  }
  // clothes, as five pieces: 0 arm, 1 leg, 2 leg, 3 shirt, 4 arm
  const pc = [[limb([0, -8.7, 59], [0, -8.7, 37], 2.3, shirt)], [limb([0, -3.1, 3.5], [0, -3.1, 35], 2.4, pants)], [limb([0, 3.1, 3.5], [0, 3.1, 35], 2.4, pants)], [prism(rrect(-3.7, 3.7, -7.2, 7.2, 2.6), "z", 34, 60, shirt, { mat: "matte" })], [limb([0, 8.7, 59], [0, 8.7, 37], 2.3, shirt)]];
  if (what >= 0) return pc[what];
  return pc.flat().concat([sphere([0, -8.7, 35.6], 1.9, ppe2 ? "#3a3d42" : SKIN, { lat: 6, lon: 8, mat: "matte" }), sphere([0, 8.7, 35.6], 1.9, ppe2 ? "#3a3d42" : SKIN, { lat: 6, lon: 8, mat: "matte" })]);
}
let fx = [], lampOn = false;
function draw(dt = 0) {
  const r = calc(ibf, dmm, prot), c = arcAt === null ? -1 : now - arcAt, shown = res && c > -0.45 ? res : r;
  const wx = BAR + (dmm / 1000) * D.U + 3.6, live = [], objs = [{ cache: "board", rev: 0, parts: boardStatic }];
  let burnLvl = 0, fireF = 0, kd = 0;
  if (c >= 0 && out) {
    const tv = vt(res.t);
    if (c > 0.05) burnLvl = out.burn;
    if (out.knock) kd = sm(0.02, 0.5, c) * (1 - sm(END_PAD + tv - 0.9, END_PAD + tv - 0.2, c));
    if (out.fire) fireF = sm(0.05, 0.4, c) * (1 - sm(tv + 2.4, tv + 3.4, c));
    if (out.extreme) fireF = 0.55 * sm(0.05, 0.3, c) * (1 - sm(tv + 2.6, tv + 3.6, c));
    if (c > tv + END_PAD - 0.8) burnLvl = 0;
  }
  const tb = c - 0.03, flying = c >= 0 && out && out.extreme && tb > 0 && c < vt(res.t) + END_PAD - 0.8;
  // knocked flat: tipped over backwards about the heels
  const ka = kd * 1.35, kc = Math.cos(ka), ks = Math.sin(ka), stand = (p) => [wx + 10 * kd + p[0] * kc + p[2] * ks, p[1], Math.max(0.8, -p[0] * ks + p[2] * kc + 1.2 * kd)];
  objs.push({ parts: workerParts(ppe, 0, "boots"), xf: (p) => [wx + p[0], p[1], p[2]] });
  if (!flying) objs.push({ parts: [...workerParts(ppe, burnLvl, -1), ...workerParts(ppe, burnLvl, "head")], xf: stand });
  else {
    // launched away from the board, up and over, spinning, and his clothes go their own way
    const a = 9 * tb, ca = Math.cos(a), sa = Math.sin(a), fly = (p) => { const dx = p[0], dz = p[2] - 40; return [wx + 300 * tb + dx * ca + dz * sa, p[1], Math.max(1, 40 + 240 * tb - 300 * tb * tb - dx * sa + dz * ca)]; };
    objs.push({ parts: [...workerParts(ppe, 0, "under"), ...workerParts(ppe, 1, "head")], xf: fly });
    if (tb < 1.8) for (let i = 0; i < 5; i++) { const q2 = frags[i], w = (q2.w / 400) * tb, cw = Math.cos(w), sw = Math.sin(w); objs.push({ parts: workerParts(ppe, 2, i), xf: (p) => { const dx = p[0], dz = p[2] - 40; return [wx + q2.vx * 0.7 * tb + dx * cw + dz * sw, p[1] + (i - 2) * 40 * tb, Math.max(1, 40 + q2.vy * 0.6 * tb - 260 * tb * tb - dx * sw + dz * cw)]; } }); }
  }
  // the spanner: on its perch, then falling onto L1 and L2
  const fall = arcAt === null ? 0 : clamp((now - (arcAt - 0.45)) / 0.42, 0, 1), k2 = 1 - fall * fall;
  if (!(c > 0.08)) { const sx = BAR + 3.4 + (D.PERCH[0] - BAR - 3.4) * k2, sz = ARC[2] + (D.PERCH[2] - ARC[2]) * k2; live.push(box(sx, sx + 1.2, -16, 3, sz - 1.4, sz + 1.4, "#c9ced3", { mat: "chrome" }), prism(circle(sx + 0.6, -17.5, 3.2, 14), "z", sz - 1.6, sz + 1.6, "#c9ced3", { mat: "chrome" }), prism(circle(sx + 0.6, 4.5, 2.8, 14), "z", sz - 1.4, sz + 1.4, "#c9ced3", { mat: "chrome" })); }
  // the trip lamp on the breaker
  let arc = 0; const pow = clamp(lg(Math.max(shown.e, 0.5) / 0.5) / lg(80), 0, 1);
  if (c >= 0) { const tv = vt(res.t); arc = c < tv ? sm(0, 0.02, c) : 0; lampOn = c > tv - 0.02 && Math.sin(now * 9) > -0.2; } else lampOn = false;
  live.push(prism(circle(14, 79, 1.6, 12), "x", BX1 - 6, BX1 - 5, lampOn ? "#ff4a3d" : "#5a3a36", { mat: "plastic", bevel: 0, emit: lampOn ? ["#ff4a3d", 1] : undefined, emitK: 2.6 }));
  // the boundary on the floor: inside this arc you get a second-degree burn or worse
  const rU = Math.min(190, (shown.db / 1000) * D.U), dx0 = BX1 - BAR;
  if (rU > dx0 + 0.5) { const th = Math.acos(dx0 / rU), n = 48, fan = [], pts = []; for (let i = 0; i <= n; i++) { const a = -th + (2 * th * i) / n; pts.push([BAR + rU * Math.cos(a), ARC[1] + rU * Math.sin(a), 0.9]); } for (let i = 0; i < n; i++) fan.push([[BX1, ARC[1], 0.9], pts[i], pts[i + 1]]); live.push(tris(fan, "#ff5a2a", { flat: true, opacity: lightTheme ? 0.16 : 0.12 })); for (let i = 0; i < n; i += 2) E.line(pts[i], pts[i + 1], 2.2, "#ff6a3d", 0.95); }
  objs.push({ parts: live });
  let svg = E.render(objs);
  // the arc itself, the plasma out the front, molten copper, and the smoke after
  if (arc > 0.02) {
    E.sprite(ARC, 16 + 10 * pow, "#eaf2ff", 0.95, true, 1); E.sprite([BX1 + 6, ARC[1], ARC[2]], 30 + 40 * pow, "#bcd4ff", 0.5, true, 1);
    for (let j = 0; j < 4; j++) E.line([BAR + 3.5, -12 + rn() * 2, ARC[2] + (rn() - 0.5) * 10], [BAR + 3.5, 0 - rn() * 2, ARC[2] + (rn() - 0.5) * 10], 3, "#ffffff", 1, true);
    const reach = Math.min(rU, 150) * (0.55 + 0.45 * pow);
    if (dt > 0) { for (let j = 0; j < 4 + 8 * pow; j++) fx.push({ k: "flame", p: [BX1 - 4, ARC[1] + (rn() - 0.5) * 20, ARC[2] + (rn() - 0.5) * 30], v: [reach * (2.2 + rn() * 2.4), (rn() - 0.5) * 70, (rn() - 0.5) * 60 + 20], life: 0, max: 0.22 + rn() * 0.2, s: 0.8 + pow }); for (let j = 0; j < 3 + 5 * pow; j++) fx.push({ k: "spark", p: [BAR + 4, ARC[1] + (rn() - 0.5) * 8, ARC[2]], v: [80 + rn() * 300, (rn() - 0.5) * 240, (rn() - 0.3) * 260], life: 0, max: 0.5 + rn() * 0.8 }); }
  }
  if (c >= 0 && res && c > vt(res.t) && c < vt(res.t) + 2.5 && dt > 0 && rn() < dt * 30) fx.push({ k: "smoke", p: [BX1 - 6 + rn() * 10, (rn() - 0.5) * 30, 40 + rn() * 30], v: [10 + rn() * 14, (rn() - 0.5) * 10, 24 + rn() * 20], life: 0, max: 2 + rn() * 2, s: 1.2 });
  if (fireF > 0.03 && dt > 0) { const bx = flying ? wx + 300 * tb : wx + 10 * kd + 34 * kd, bz = flying ? 40 + 240 * tb - 300 * tb * tb : 46 - kd * 38; for (let j = 0; j < 3; j++) if (rn() < fireF) fx.push({ k: "flame", p: [bx + (rn() - 0.5) * 8, (rn() - 0.5) * 14, Math.max(4, bz + (rn() - 0.5) * 30)], v: [(rn() - 0.5) * 16, (rn() - 0.5) * 16, 50 + rn() * 50], life: 0, max: 0.3 + rn() * 0.35, s: 0.55 }); if (rn() < dt * 14) fx.push({ k: "smoke", p: [bx, (rn() - 0.5) * 10, bz + 20], v: [(rn() - 0.5) * 8, (rn() - 0.5) * 8, 26 + rn() * 16], life: 0, max: 1.6 + rn() * 1.6, s: 0.7 }); }
  fx = fx.filter((p) => {
    p.life += dt; if (p.life > p.max) return false;
    const t = p.life / p.max, o = [p.p[0], p.p[1], p.p[2]];
    if (p.k === "spark") p.v[2] -= 420 * dt; else if (p.k === "flame") { p.v[0] *= 0.9; p.v[2] += 40 * dt; }
    for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * dt;
    if (p.k === "spark" && p.p[2] < 1) { p.p[2] = 1; p.v[2] *= -0.3; p.v[0] *= 0.6; }
    if (p.k === "flame") E.sprite(p.p, (6 + 20 * t) * p.s, t < 0.3 ? "#f4f8ff" : t < 0.6 ? "#ffd27a" : "#e2601a", 0.8 * (1 - t * t), true, 2);
    else if (p.k === "smoke") E.sprite(p.p, (7 + 28 * t) * p.s, lightTheme ? "#4a4744" : "#2e2c2b", 0.45 * (1 - t));
    else E.line(o, p.p, 2, t < 0.4 ? "#fff1c4" : "#ff8a3a", 1 - t, true);
    return true;
  });
  // the working distance, beside the person
  const d0 = [BAR, 16, 1], d1 = [BAR + (dmm / 1000) * D.U, 16, 1], dm = E.project([(d0[0] + d1[0]) / 2, 20, 1]);
  E.line(d0, d1, 1.6, lightTheme ? "#2a2d31" : "#e8eaed", 0.9); E.line([d0[0], 13, 1], [d0[0], 19, 1], 1.6, lightTheme ? "#2a2d31" : "#e8eaed", 0.9); E.line([d1[0], 13, 1], [d1[0], 19, 1], 1.6, lightTheme ? "#2a2d31" : "#e8eaed", 0.9);
  svg += '<text class="mk-lab" x="' + (dm[0] + 6).toFixed(1) + '" y="' + (dm[1] + 12).toFixed(1) + '">' + dmm + " mm</text>";
  // the label on the board
  const m = E.faceMatrix([BX0 + 4, BY1 + 0.45, 72], [1, 0, 0], [0, 0, -1]);
  if (m) svg += '<g transform="' + m + '"><text class="afl-h" x="11" y="2.7" font-size="2.3" text-anchor="middle">ARC FLASH</text><text class="afl hi" x="1.4" y="6.6" font-size="1.9">' + shown.e.toFixed(1) + ' cal/cm²</text><text class="afl" x="1.4" y="9.2" font-size="1.5">at ' + dmm + ' mm</text><text class="afl" x="1.4" y="11.6" font-size="1.5">boundary ' + (shown.db / 1000).toFixed(1) + ' m</text><text class="afl" x="1.4" y="14" font-size="1.5">415 V · ' + (shown.e <= 1.2 ? "no PPE cat" : catOf(shown.e) === "no category" ? "DO NOT WORK LIVE" : "PPE " + catOf(shown.e)) + "</text></g>";
  if (E.xray > 0.02 && c < 0) svg += E.callouts([
    { p: [BAR + 3, 12, 60], text: "Busbars", sub: "415 V, " + ibf + " kA available" }, { p: [BX1 - 6, 0, 79], text: "Incoming breaker", sub: "clears this fault in " + r.t.toFixed(2) + " s" },
    { p: [BAR + rU * 0.8, ARC[1] + rU * 0.55, 1], text: "Arc flash boundary", sub: (r.db / 1000).toFixed(1) + " m: 1.2 cal/cm² out here" }, { p: [wx, 0, 50], text: "You", sub: r.e.toFixed(1) + " cal/cm², wearing " + (ppe ? M.ppe[ppe] : "nothing rated") },
  ], E.xray, E.fs < 0.62 ? {} : { topL: 70 });
  if (sceneG.innerHTML !== svg) sceneG.innerHTML = svg;
  if (c >= 0) {
    const tv = vt(res.t), A = (out && out.extreme ? 22 : 9 * pow) * Math.exp(-c / (out && out.extreme ? 0.5 : 0.35));
    setShake(A * Math.sin(c * 95), A * Math.cos(c * 77));
    flashEl.style.opacity = ((0.35 + 0.6 * pow) * (c < tv ? 0.75 + 0.25 * Math.sin(now * 80) : Math.exp(-(c - tv) / 0.15))).toFixed(3);
    if (c > tv + 0.05) say(verdict());
    if (c > tv + END_PAD) {
      arcAt = null; res = null; out = null; setShake(0, 0); flashEl.style.opacity = "0";
      say("Reset. Someone's left the spanner on the bar support again. Change the protection, the fault level, where you stand or what you're wearing, and drop it.");
      return draw();
    }
  }
  const text = c >= 0 ? (c < vt(res.t) ? "ARC · " + res.ia.toFixed(1) + " kA · " + res.t.toFixed(2) + " s" : "cleared · " + res.e.toFixed(1) + " cal/cm² at " + dmm + " mm") : ibf + " kA bolted · " + r.t.toFixed(2) + " s · " + r.e.toFixed(1) + " cal/cm² at " + dmm + " mm";
  if (readout.textContent !== text) readout.textContent = text;
  if (arcAt === null && !touring) {
    const lim = Math.max(1.2, M.ppe[ppe]);
    say("At " + dmm + " mm you'd get " + r.e.toFixed(1) + " cal/cm². " + (ppe ? "Your gear is rated " + M.ppe[ppe] + "." : "You're in work clothes.") + (r.e > lim ? " That's not enough." : " That'll do.") + " The boundary, where it drops to 1.2, is " + (r.db / 1000).toFixed(1) + " m out. Drop the spanner.");
  }
}

// demo: [fault kA, distance mm, protection, PPE, line]
const TOUR = [
  [25, 610, "inst", 2, "25 kA, breaker trips instantly, CAT 2 at 610 mm. Watch."],
  [18, 455, "inst", 2, "Less fault current, a bit closer. Should be easier, right?"],
  [18, 455, "maint", 2, "Same again with the maintenance mode switch on."],
  [50, 610, "backup", 0, "Big board, only the upstream backup protecting it, work clothes."],
  [40, 3000, "backup", 4, "Same board, CAT 4 suit, and stand back 3 m."],
];
function tick(t) {
  const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
  last = t;
  const sdt = dt * (slow ? 0.12 : 1);
  now += sdt;
  if (touring && !busy()) {
    tourClock += sdt;
    if (tourStep < 0 || actions.length === 0) {
      tourStep = (tourStep + 1) % TOUR.length;
      const s = TOUR[tourStep];
      ibf = s[0]; dmm = s[1]; prot = s[2]; ppe = s[3]; say(s[4]);
      actions = [[tourClock + 2.6, "go"], [tourClock + 2.7, "end"]];
    }
    while (actions.length && tourClock >= actions[0][0]) {
      const a = actions.shift()[1];
      if (a === "go") strike(); else if (a === "end") actions = [];
    }
  }
  draw(sdt); syncUi();
  const idle = fx.length === 0 && !touring && arcAt === null;
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { touring = false; actions = []; };
const guard = (fn) => (...a) => { takeOver(); if (busy()) return; fn(...a); draw(); syncUi(); run(); };
const setFault = guard((v) => { ibf = v; });
const setDist = guard((v) => { dmm = v; });
const setProt = guard((v) => { prot = v; });
const setPpe = guard((v) => { ppe = v; });
const go = guard(() => strike());
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;

ui.fault.addEventListener("input", () => setFault(+ui.fault.value));
ui.dist.addEventListener("input", () => setDist(+ui.dist.value));
ui.prot.forEach((b) => b.addEventListener("click", () => setProt(b.dataset.prot)));
ui.ppe.forEach((b) => b.addEventListener("click", () => setPpe(+b.dataset.ppeBtn)));
ui.go.addEventListener("click", go);
ui.slow.addEventListener("click", () => { slow = !slow; syncUi(); run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; tourClock = 0; actions = []; } syncUi(); run(); });
onTap(go);
stage.addEventListener("keydown", (ev) => {
  const map = { x: () => { setX(!E.xrayOn); run(); }, " ": go, Enter: go, ArrowRight: () => setDist(clamp(dmm + 50, 400, 3000)), ArrowLeft: () => setDist(clamp(dmm - 50, 400, 3000)), ArrowUp: () => setFault(clamp(ibf + 1, 5, 60)), ArrowDown: () => setFault(clamp(ibf - 1, 5, 60)), m: () => setProt(prot === "maint" ? "inst" : "maint"), s: () => { slow = !slow; syncUi(); run(); } };
  if (map[ev.key]) { ev.preventDefault(); map[ev.key](); }
});
window.__fig = { E, freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
syncUi(); draw();
`;

const CSS = `.fx-flash{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(circle 70% at 34% 46%,#ffffff 0%,#dfe8ff 30%,rgba(150,180,255,0) 100%)}
.afl{font-family:var(--anatomy-mono);fill:#3a3d42;font-weight:600}.afl.hi{fill:#111;font-weight:700}.afl-h{font-family:var(--anatomy-mono);fill:#fff;font-weight:700}
.ctl #go{font-weight:600;letter-spacing:.06em}`;

const stage = stageHtml({
  W, H, fig: "Fig 10", title: "Arc flash", xray: true,
  label: "An open low-voltage switchboard with three copper busbars and a spanner perched above them, and a worker standing in front of it at the working distance. The arc flash boundary is marked on the floor. An x-ray mode turns the side of the board to glass.",
  keysHelp: "Switchboard: drag to rotate, X for x-ray, space drops the spanner, left and right change the distance, up and down the fault level, M maintenance mode",
  extra: `<div class="fx-flash" aria-hidden="true"></div>`,
});

const CONTROLS = `<div class="ctl" role="group" aria-label="Test controls">
  <div class="ctl-row"><span class="ctl-label">Fault level</span><div class="slide"><input id="fault" type="range" min="5" max="60" step="1" value="25" aria-label="Prospective bolted fault current"></div><output id="fault-out">25 kA</output></div>
  <div class="ctl-row"><span class="ctl-label">Protection</span><button type="button" data-prot="inst" aria-pressed="true">Breaker<small>instant above 10 kA, else 0.4 s</small></button><button type="button" data-prot="maint" aria-pressed="false">Maintenance mode<small>instant above 3 kA</small></button><button type="button" data-prot="backup" aria-pressed="false">Upstream only<small>1 s</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Distance</span><div class="slide"><input id="dist" type="range" min="400" max="3000" step="5" value="610" aria-label="Working distance"></div><output id="dist-out">610 mm</output></div>
  <div class="ctl-row"><span class="ctl-label">Wearing</span><button type="button" data-ppe-btn="0" aria-pressed="false">Work clothes</button><button type="button" data-ppe-btn="1" aria-pressed="false">CAT 1<small>4 cal/cm²</small></button><button type="button" data-ppe-btn="2" aria-pressed="true">CAT 2<small>8 cal/cm²</small></button><button type="button" data-ppe-btn="4" aria-pressed="false">CAT 4<small>40 cal/cm²</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Energy</span><div class="meter"><span id="e-fill" class="fill"></span><span class="mark red" style="left:${ePct(1.2)}%" data-label="1.2 burn"></span><span id="e-mark" class="mark" style="left:${ePct(8)}%" data-label="your PPE 8"></span></div><output id="e-out">0 cal</output></div>
  <div class="ctl-row"><span class="ctl-label">Arc</span><span id="stats"></span></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="go">DROP THE SPANNER</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
</div>`;


const foot = footHtml({
  theme, slug: "arc-flash",
  real: "the IEEE 1584-2002 empirical equations (under 1 kV, enclosed, earthed, 32 mm gap, distance exponent 1.473), the 1.2 cal/cm² boundary and the NFPA 70E PPE categories. Real studies use the newer, more detailed IEEE 1584-2018 model and your actual protection curves.",
  made: "the protection settings, the burn grading, when clothes catch fire, the knockdown and the visuals.",
});
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), pageMk2({
  k, title: "Arc flash", fig: "Fig 10", hint: "Tap: drop the spanner", theme, W, H, stage, controls: CONTROLS, css: CSS, foot,
  caption: "Bridge two busbars with a dropped spanner and the arc vaporises copper, which expands thousands of times over and comes out of the front of the board as a ball of plasma, molten metal and pressure. How badly it gets you comes down to three things: how much current the arc draws, how long it lasts before the protection clears it, and how far away you are. Energy is counted in cal/cm²; 1.2 is enough for a second-degree burn on bare skin, and the arc flash boundary is how far out that reaches. Time is the big lever, and it catches people out: drop the fault level below the breaker's instantaneous pickup and it waits out its time delay, so less current can mean far more energy.",
  script: LIVE.replace("__DATA__", JSON.stringify(DATA)),
}));
console.log("wrote", name);
