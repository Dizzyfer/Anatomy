import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { engineScript, stageHtml, pageMk2, footHtml } from "../../mk2/shell.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const W = 960, H = 600;

// Truth: a pin-jointed truss carries load as pure tension and compression in its members; long members in compression
// buckle (Euler) long before they yield, which is why a Pratt truss (long diagonals in tension) suits steel better than a
// Howe (long diagonals in compression). A statically determinate truss has no spare members: lose one and it's a mechanism.
// Vehicle masses are typical Australian figures (B-double 62.5 t, triple road train about 120 t, a large mining haul truck
// about 620 t loaded). Toy: the member sizes, the dead load, the speeds, and the deflection is drawn 80 times bigger (dead-load sag left out, as if the bridge were cambered).
const U = 4; // plot units per metre
const SPAN = 48, X0 = -96, DZ = 44, YT = 22, LANE = 7;
const APPROACH = 13.5;
const PLATE = { x: -152, y: -72, w: 304, d: 144, r: 8 };
const P = k.fitProjection([...k.boxCorners(PLATE, -0.8, 0), [-96, -22, 76], [96, 22, 76], [-150, -70, 60], [150, 70, 50]], W, H, { pad: 22, azimuth: 45, elevation: 30 });
const DATA = { W, H, P, PLATE };
import { readFileSync } from "node:fs";
const SOLVER = readFileSync(join(HERE, "solver.js"), "utf8").replace(/if \(typeof module[^\n]*\n?/, "").replace("const E = 200e6", "const ESTEEL = 200e6").replace("Math.PI * E * s.A", "Math.PI * ESTEEL * s.A").replace("EA: E * SECT", "EA: ESTEEL * SECT");
Object.assign(DATA, { U, SPAN, X0, DZ, YT, LANE, APPROACH, EDGE_L: (PLATE.x + 2 - X0) / U, EDGE_R: (PLATE.x + PLATE.w - 2 - X0) / U });
const LIVE = `
${engineScript()}
const D = __DATA__;
const stage = document.querySelector(".mk-stage");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lightTheme = document.body.dataset.theme === "light";
const E = mk2(stage, D.P, { W: D.W, H: D.H, pivot: [0, 0, 40], plate: { ...D.PLATE, h: 12, foot: 5 }, shadowBox: [-160, -80, -18, 160, 80, 90] });
const { box, cyl, prism, circle, lathe, tube, sphere, loft, roundPoly, rrect, tris } = E;
E.bindTools(stage);
const xbtn = stage.querySelector('[data-mk="xray"]');
const setX = (on) => { E.setXray(on); if (xbtn) xbtn.setAttribute("aria-pressed", String(on)); };
const sceneG = stage.querySelector('[data-part="scene"]');
const iso = (p) => E.project(p), depthOf = (p) => E.depthOf(p);
const shakeEls = [stage.querySelector(".mk-gl"), stage.querySelector(".mk-over")];
const setShake = (x, y) => { const t = x || y ? "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px)" : ""; for (const e of shakeEls) if (e.style.transform !== t) e.style.transform = t; };
${SOLVER}
const P = D.P;
const DEFL = 80;
let u0 = null;

let kind = "pratt", g = trussGeom(kind), broken = new Set(), res = null, jam = false;
let cars = [], fallAt = null, breakX = 0, snapAt = -10, snapped = -1, lastShot = "", lastEvent = "", lastEventAt = -10, worst = { util: 0, i: -1 };
let frame = 0, last = 0, now = 0, visible = false, touring = true, slow = false, tourClock = 0, tourStep = -1, actions = [], stream = 0, streamAt = 0;
const event = (t) => { lastEvent = t; lastEventAt = now; };
const SPEED = 11;
// where a point of the bridge is now, in world units (deflection blown up, and the collapse)
function fallState() {
  if (fallAt === null) return null;
  const t = now - fallAt, k2 = clamp(t / 0.9, 0, 1), pr = k2 * k2;
  const drop = D.DZ / D.U - 0.6;
  const aMax = (len) => Math.asin(Math.min(0.97, drop / Math.max(len, 4)));
  const wob = t > 0.9 ? Math.exp(-(t - 0.9) * 5) * Math.sin((t - 0.9) * 22) * 0.03 : 0;
  // then the ends tear off their bearings and the lot goes in the river
  const e2 = clamp((t - 1.5) / 1.1, 0, 1), e = e2 * e2 * (3 - 2 * e2);
  const piece = (len) => { const a0 = aMax(len), a = a0 * pr * (1 + wob) * (1 - 0.8 * e); return { a, s: Math.max(0, D.DZ / D.U - 0.4 - len * Math.sin(a0 * 0.2)) * e }; };
  const L0 = piece(breakX), R0 = piece(D.SPAN - breakX);
  return { t, e, aL: L0.a, aR: R0.a, sL: L0.s, sR: R0.s };
}
function world(xm, zm, y, ui, piece, drop = 0) {
  let x = xm, z = zm;
  if (res && !res.mech && ui !== undefined && u0) { x += (res.u[2 * ui] - u0[2 * ui]) * DEFL; z += (res.u[2 * ui + 1] - u0[2 * ui + 1]) * DEFL; }
  const f = fallState();
  if (f) {
    if (piece !== undefined ? piece === 0 : xm <= breakX) { const a = f.aL, c = Math.cos(a), s = Math.sin(a); const dx = x, dz = z; x = dx * c + dz * s; z = -dx * s + dz * c - f.sL; }
    else { const a = f.aR, c = Math.cos(a), s = Math.sin(a); const dx = x - D.SPAN, dz = z; x = D.SPAN + dx * c - dz * s; z = dx * s + dz * c - f.sR; }
  }
  return [D.X0 + x * D.U, y, D.DZ + (z - drop) * D.U];
}

const PAINT = { car: "#d6443a", bus: "#e8a93a", bdouble: "#2f6fd0", roadtrain: "#2f9e64", haul: "#f2b821" };
const C = { glass: "#86b7de", dark: "#2b2e33", tyre: "#1c1d20", hub: "#a9aeb4", silver: "#d5d9de", chrome: "#e8ebee", lamp: "#ffe08a", tail: "#e0402f", dirt: "#8a6844", bar: "#55595f" };
const vbox = (x0, x1, z0, z1, y0, y1, col, layer = 1) => ({ ring: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], y0, y1, col, layer });
const prof = (ring, y0, y1, col, layer = 1) => ({ ring, y0, y1, col, layer });
function wheel(x, r, yc, wid) {
  const ring = (rr) => Array.from({ length: 16 }, (_, i) => [x + rr * Math.cos((i / 16) * Math.PI * 2), r + rr * Math.sin((i / 16) * Math.PI * 2)]);
  const layer = yc > 0 ? 2 : 0, near = yc > 0;
  return [prof(ring(r), yc - wid / 2, yc + wid / 2, C.tyre, layer), prof(ring(r * 0.55), near ? yc + wid / 2 - 0.02 : yc - wid / 2 - 0.03, near ? yc + wid / 2 + 0.03 : yc - wid / 2 + 0.02, C.hub, layer)];
}
const pair = (x, r, yc, wid) => [...wheel(x, r, yc, wid), ...wheel(x, r, -yc, wid)];
function primeMover(paint, axles) {
  const p = [];
  p.push(vbox(-6.2, 2.3, 0.55, 1.0, -0.5, 0.5, C.dark));
  p.push(vbox(2.2, 2.45, 0.45, 1.0, -1.25, 1.25, C.chrome));
  p.push(prof([[2.35, 1.0], [0.25, 1.0], [0.25, 2.25], [2.3, 2.05]], -1.0, 1.0, paint));
  p.push(vbox(2.33, 2.38, 1.05, 2.0, -0.62, 0.62, C.chrome, 3));
  p.push(vbox(-2.1, 0.25, 1.0, 3.45, -1.25, 1.25, paint));
  p.push(vbox(-3.1, -2.1, 1.0, 3.7, -1.25, 1.25, paint));
  p.push(vbox(0.25, 0.29, 2.35, 3.2, -1.1, 1.1, C.glass, 3));
  p.push(vbox(-1.6, 0.05, 2.35, 3.15, 1.25, 1.28, C.glass, 3));
  p.push(vbox(-2.35, -2.15, 1.0, 4.25, 1.05, 1.25, C.chrome, 3));
  p.push(vbox(-1.9, -0.3, 0.6, 1.1, 1.0, 1.32, C.chrome, 3));
  p.push(vbox(2.38, 2.42, 1.2, 1.45, 0.75, 1.05, C.lamp, 3));
  p.push(...pair(0, 0.52, 1.0, 0.32));
  for (const a of axles) p.push(...pair(a, 0.52, 0.92, 0.6));
  return p;
}
function trailer(x0, x1, axles, last) {
  const p = [vbox(x1, x0, 1.12, 1.38, -1.0, 1.0, C.dark), vbox(x1, x0, 1.38, 4.15, -1.25, 1.25, C.silver)];
  for (let x = x0 - 1.2; x > x1 + 0.6; x -= 1.6) p.push(vbox(x - 0.08, x, 1.45, 4.08, 1.25, 1.27, "#aeb3b9", 3));
  if (last) p.push(vbox(x1 - 0.03, x1, 1.5, 1.75, 0.8, 1.15, C.tail, 3));
  for (const a of axles) p.push(...pair(a, 0.5, 0.92, 0.6));
  return p;
}
const MODEL = {
  car: () => {
    const p = [], body = [[0.95, 0.3], [0.95, 0.72], [0.8, 0.84], [-0.25, 0.95], [-0.8, 1.42], [-2.4, 1.42], [-3.05, 1.0], [-3.55, 0.95], [-3.55, 0.3]];
    p.push(prof(body, -0.88, 0.88, PAINT.car));
    p.push(prof([[-0.33, 0.99], [-0.84, 1.37], [-2.37, 1.37], [-2.95, 1.02]], 0.88, 0.9, C.glass, 3));
    p.push(prof([[-0.25, 0.95], [-0.8, 1.42], [-0.86, 1.42], [-0.31, 0.95]], -0.78, 0.78, C.glass, 3));
    p.push(vbox(0.94, 0.97, 0.58, 0.7, 0.5, 0.82, C.lamp, 3));
    p.push(...pair(0, 0.32, 0.8, 0.22), ...pair(-2.7, 0.32, 0.8, 0.22));
    return { parts: p, w: 1.8, front: 0.95, rear: -3.55, lane: 1, rigid: true };
  },
  bus: () => {
    const p = [vbox(-10.1, 2.4, 0.35, 3.15, -1.25, 1.25, PAINT.bus), vbox(-9.6, -0.3, 1.65, 2.65, 1.25, 1.28, C.glass, 3), vbox(2.4, 2.43, 1.35, 2.95, -1.12, 1.12, C.glass, 3), vbox(1.0, 2.0, 0.5, 2.9, 1.25, 1.28, C.glass, 3), vbox(-7, -3.5, 3.15, 3.45, -0.7, 0.7, C.silver), vbox(2.4, 2.44, 0.6, 0.85, 0.75, 1.1, C.lamp, 3)];
    p.push(...pair(0, 0.5, 0.95, 0.35), ...pair(-6.5, 0.5, 0.92, 0.6));
    return { parts: p, w: 2.5, front: 2.45, rear: -10.1, lane: 1, rigid: true };
  },
  bdouble: () => ({ parts: [...primeMover(PAINT.bdouble, [-3.5, -4.8]), ...trailer(-3.2, -15.3, [-11.5, -12.8, -14.1]), ...trailer(-15.7, -25.3, [-21.5, -22.8, -24.1], true)], w: 2.5, front: 2.45, rear: -25.3, lane: 1 }),
  roadtrain: () => {
    const p = [...primeMover(PAINT.roadtrain, [-3.4, -4.6]), ...trailer(-2.8, -13.9, [-10.8, -12.0, -13.2])];
    for (const [d, prevRear, t0, t1, ax] of [[-19, -13.9, -17.0, -29.0, [-25.8, -27.0, -28.2]], [-34, -29.0, -32.0, -44.0, [-40.8, -42.0, -43.2]]]) {
      p.push(vbox(d + 1.2, prevRear, 0.75, 0.95, -0.12, 0.12, C.bar), vbox(d - 1.2, d + 1.2, 0.75, 1.15, -0.9, 0.9, C.dark), ...pair(d + 0.6, 0.5, 0.92, 0.6), ...pair(d - 0.6, 0.5, 0.92, 0.6));
      p.push(...trailer(t0, t1, ax, t1 === -44.0));
    }
    return { parts: p, w: 2.5, front: 2.45, rear: -44, lane: 1 };
  },
  haul: () => {
    const p = [];
    p.push(vbox(-9.4, 2.2, 1.4, 3.3, -1.9, 1.9, C.dark));
    p.push(vbox(-1.4, 2.5, 1.4, 3.7, -1.7, 1.7, PAINT.haul));
    p.push(vbox(0.5, 2.7, 3.6, 4.0, -4.4, 4.4, PAINT.haul));
    p.push(vbox(-0.5, 1.7, 4.0, 6.3, 1.8, 4.2, PAINT.haul));
    p.push(vbox(1.7, 1.73, 4.8, 6.0, 2.0, 4.0, C.glass, 3), vbox(-0.3, 1.5, 4.8, 6.0, 4.2, 4.23, C.glass, 3));
    p.push(vbox(2.68, 2.72, 1.6, 3.4, -1.2, 1.2, C.bar, 3));
    p.push(prof([[2.7, 6.75], [2.7, 7.2], [-1.0, 7.2], [-1.0, 6.6]], -4.6, 4.6, PAINT.haul));
    p.push(prof([[-0.7, 3.5], [-0.7, 6.9], [-12.2, 6.1], [-12.2, 4.6], [-10.6, 3.4]], -4.3, 4.3, PAINT.haul));
    p.push(prof([[-1.0, 6.55], [-11.9, 5.85], [-11.9, 5.7], [-1.0, 6.4]], -4.05, 4.05, C.dirt, 3));
    p.push(...pair(0, 1.95, 3.7, 1.45));
    p.push(...pair(-7.2, 1.95, 3.7, 1.45), ...pair(-7.2, 1.95, 2.2, 1.45));
    return { parts: p, w: 9.4, front: 2.75, rear: -12.2, lane: 0, rigid: true };
  },
};
const MODELS = Object.fromEntries(Object.keys(MODEL).map((kk) => [kk, MODEL[kk]()]));
for (const kk in MODELS) { VEH[kk].front = MODELS[kk].front; VEH[kk].rear = MODELS[kk].rear; }
function clipX(ring, a, b) {
  let r = ring;
  for (const [lim, keepAbove] of [[a, true], [b, false]]) {
    const out = [], n = r.length;
    for (let i = 0; i < n; i++) {
      const p = r[i], q2 = r[(i + 1) % n], pin = keepAbove ? p[0] >= lim : p[0] <= lim, qin = keepAbove ? q2[0] >= lim : q2[0] <= lim;
      if (pin) out.push(p);
      if (pin !== qin) { const t = (lim - p[0]) / (q2[0] - p[0]); out.push([lim, p[1] + (q2[1] - p[1]) * t]); }
    }
    r = out; if (r.length < 3) return null;
  }
  return r;
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const DECK_TOP = 0.35;
const deck0 = (xm) => (xm > 0 && xm < D.SPAN ? deflAt(xm) : 0);
function deflAt(xm) {
  // vertical deflection along the deck, between bottom joints
  if (!res || res.mech || !u0) return 0;
  const i = clamp(Math.floor(xm / g.Lp), 0, g.N - 1), f = clamp(xm / g.Lp - i, 0, 1);
  return ((res.u[2 * i + 1] - u0[2 * i + 1]) * (1 - f) + (res.u[2 * (i + 1) + 1] - u0[2 * (i + 1) + 1]) * f) * DEFL;
}
// ---------------- drawing ----------------
function buildBridge() {}
const TAU = Math.PI * 2;
const REST = lightTheme ? "#8b939c" : "#9aa2ab";
const hx = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mixHex = (a, b, t) => { const A = hx(a), B = hx(b); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join(""); };
const XA0 = D.X0, XA1 = D.X0 + D.SPAN * D.U, PX0 = D.PLATE.x + 2, PX1 = D.PLATE.x + D.PLATE.w - 2, PY0 = D.PLATE.y + 2, PY1 = D.PLATE.y + D.PLATE.d - 2;
function siteStatic() {
  const o = [], RK = { mat: "matte" }, DZ = D.DZ, YT = D.YT;
  // the river bed, and the water over it
  o.push(box(XA0 - 1, XA1 + 1, PY0, PY1, 0, 0.8, "#5a5142", RK));
  for (let i = 0; i < 14; i++) { const x = XA0 + 14 + ((i * 53) % (XA1 - XA0 - 28)), y = PY0 + 10 + ((i * 37) % (PY1 - PY0 - 20)), r = 2 + (i % 3); o.push(sphere([x, y, 0.8], r, i % 2 ? "#6b6457" : "#7a7366", { squash: [1.3, 1, 0.55], lat: 5, lon: 8, mat: "matte" })); }
  o.push(box(XA0, XA1, PY0, PY1, 0.8, 5, "#2f6f9c", { mat: "water", opacity: lightTheme ? 0.7 : 0.6, bevel: 0 }));
  // the banks: rock in strata, grass on top, the road down the middle, a concrete seat under each end of the bridge
  for (const [x0, x1, face] of [[PX0, XA0, XA0], [XA1, PX1, XA1]]) {
    const strata = [[0, 9, "#6b6257"], [9, 20, "#7a7064"], [20, 31, "#6f665a"], [31, DZ - 0.6, "#81776a"]];
    strata.forEach(([z0, z1, col], i) => { const inset = (3 - i) * 1.6, a = face === x1 ? x0 : x0 - inset * 0, b = face === x1 ? x1 + inset : x1; o.push(box(face === x1 ? x0 : x0 - inset, face === x1 ? x1 + inset : x1, PY0, PY1, z0, z1, col, RK)); });
    o.push(box(x0, x1, PY0, -YT + 2, DZ - 0.6, DZ + 0.5, "#6f8f52", { ...RK, cap: "#7fa35e" }), box(x0, x1, YT - 2, PY1, DZ - 0.6, DZ + 0.5, "#6f8f52", { ...RK, cap: "#7fa35e" }));
    o.push(box(x0, x1, -YT + 2, YT - 2, DZ - 0.6, DZ + 0.6, "#34373c", { mat: "matte", cap: "#3b3e44" }));
    for (let x = x0 + 3; x < x1 - 4; x += 9) o.push(box(x, x + 4.5, -0.35, 0.35, DZ + 0.6, DZ + 0.68, "#e8e4d6", { bevel: 0, mat: "matte" }));
    for (const y of [-YT + 2.6, YT - 2.6]) o.push(box(x0 + 1, x1 - 1, y - 0.25, y + 0.25, DZ + 0.6, DZ + 0.68, "#e8e4d6", { bevel: 0, mat: "matte" }));
    const sx0 = face === x1 ? face - 9 : face, sx1 = face === x1 ? face : face + 9;
    o.push(box(Math.min(sx0, sx1) - (face === x1 ? 0 : 0), Math.max(sx0, sx1), -YT - 7, YT + 7, DZ - 12, DZ + 0.2, "#b3aea3", { mat: "concrete" }));
    // guard rails along the approach
    for (const y of [-YT + 0.6, YT - 0.6]) { for (let x = x0 + 3; x <= x1 - 2; x += 8) o.push(box(x - 0.4, x + 0.4, y - 0.4, y + 0.4, DZ + 0.5, DZ + 4, "#8f959d", { mat: "steel", bevel: 0 })); o.push(tube([[x0 + 2, y, DZ + 3.4], [x1 - 1, y, DZ + 3.4]], 0.55, "#c2c7cd", { seg: 5, mat: "steel" })); }
  }
  // bearings
  for (const x of [XA0, XA1]) for (const y of [-YT, YT]) o.push(box(x - 3.5, x + 3.5, y - 3, y + 3, DZ - 0.1, DZ + 1.3, "#4a4f56", { mat: "steel" }));
  // trees and a couple of boulders, so it's a place and not a diagram
  for (let n = 0; n < 12; n++) { const left = n % 2 === 0, x = left ? PX0 + 6 + ((n * 17) % 40) : XA1 + 8 + ((n * 23) % 40), y = (n % 4 < 2 ? 1 : -1) * (YT + 8 + ((n * 29) % 34)), s = 0.8 + (n % 3) * 0.25; o.push(lathe([[0, 0], [0.9 * s, 0], [0.9 * s, 4 * s], [4.4 * s, 4.6 * s], [2.8 * s, 9.5 * s], [0, 14.5 * s]], n % 3 ? "#4f7a45" : "#5b8a4d", { c: [x, y, DZ + 0.5], mat: "matte", seg: 9 })); }
  return o;
}
// vehicles: each part's a prism, a side profile pushed out across the vehicle
const VMAT = (col) => (col === C.glass ? { mat: "gloss" } : col === C.tyre ? { mat: "rubber" } : col === C.chrome || col === C.hub ? { mat: "steel" } : col === C.silver ? { mat: "paint" } : col === C.lamp ? { emit: ["#ffe08a", 0.9], emitK: 2 } : col === C.tail ? { emit: ["#ff3a2a", 0.7], emitK: 1.6 } : col === C.dark || col === C.bar ? { mat: "satin" } : col === C.dirt ? { mat: "matte" } : { mat: "paint" });
const toPrism = (pt) => prism(pt.ring, "y", pt.y0, pt.y1, pt.col, VMAT(pt.col));
const VPARTS = Object.fromEntries(Object.keys(MODELS).map((kk) => [kk, MODELS[kk].parts.map(toPrism)]));
function vehicleObj(c, f) {
  const M = MODELS[c.kind], lane = M.lane * D.LANE, piece = c.piece, fallen = f && c.fell;
  const ax = VEH[c.kind].axles, xa = c.x, xb = c.x - ax[ax.length - 1][0], za = deck0(xa), zb = deck0(xb);
  const sagAt = M.rigid ? (xm) => za + ((zb - za) * (xa - xm)) / Math.max(0.1, xa - xb) : deck0;
  const xf = fallen ? (p) => { const xm = c.x + p[0]; return (piece === 0 && xm < 0) || (piece === 1 && xm > D.SPAN) ? [D.X0 + xm * D.U, lane + p[1] * D.U, D.DZ + (DECK_TOP + p[2]) * D.U] : world(xm, DECK_TOP + p[2], lane + p[1] * D.U, undefined, piece, c.drop || 0); } : (p) => { const xm = c.x + p[0]; return [D.X0 + xm * D.U, lane + p[1] * D.U, D.DZ + (sagAt(xm) + DECK_TOP + p[2]) * D.U]; };
  const a = fallen ? -1e9 : D.EDGE_L - c.x, b = fallen ? 1e9 : D.EDGE_R - c.x;
  let parts = VPARTS[c.kind];
  if (a > M.rear || b < M.front) parts = M.parts.map((pt) => { const ring = clipX(pt.ring, a, b); return ring ? toPrism({ ...pt, ring }) : null; });
  return { parts, xf, bevel: 0 };
}
function memberCol(fr) { const u = clamp(fr.util, 0, 1.2), t = clamp(u / 0.9, 0, 1); return [mixHex(REST, fr.N >= 0 ? "#ff3d2e" : "#2f7dff", t), t]; }
const MR = { bottom: 1.25, top: 1.35, end: 1.35, vert: 0.95, diag: 1.0 };
let hover = -1, lastJ = null;
function draw() {
  const f = fallState(), YT = D.YT;
  const J = g.J.map(([x, z], i) => ({ f: world(x, z, YT, i), b: world(x, z, -YT, i), x, z }));
  lastJ = J;
  const steel = [], mid = (p, q2, t) => p.map((v, k2) => v + (q2[k2] - v) * t);
  g.M.forEach((m, i) => {
    const a = J[m.a], b = J[m.b], broke = broken.has(i), fr = res && !res.mech ? res.forces[i] : { N: 0, util: 0 };
    const [col, t] = fallAt !== null || broke ? [REST, 0] : memberCol(fr), hot = fallAt === null && fr.util > 0.9 && !broke;
    const o2 = { seg: 4, mat: "paint", emit: i === hover && fallAt === null && !broke ? ["#ffffff", 0.45] : hot ? [col, 0.55 + 0.35 * Math.sin(now * 14)] : t > 0.25 ? [col, (t - 0.25) * 0.3] : undefined, emitK: 1.5 };
    for (const [p, q2] of [[a.f, b.f], [a.b, b.b]]) {
      if (broke) steel.push(tube([p, mid(p, q2, 0.4)], MR[m.type], REST, o2), tube([mid(p, q2, 0.62), q2], MR[m.type], REST, o2));
      else steel.push(tube([p, q2], MR[m.type], col, o2));
    }
  });
  // gusset plates, floor beams at every joint, X bracing between the top chords
  const GZ = "#70777f";
  J.forEach((j, i) => { for (const [p, s] of [[j.f, 1], [j.b, -1]]) steel.push(prism(circle(p[0], p[2], 2.5, 10), "y", p[1] + s * 1.0, p[1] + s * 1.9, GZ, { mat: "steel", bevel: 0 })); steel.push(tube([j.f, j.b], i <= g.N ? 1.0 : 0.8, GZ, { seg: 4, mat: "paint" })); });
  for (let i = g.N + 1; i < g.J.length - 1; i++) steel.push(tube([J[i].f, J[i + 1].b], 0.45, GZ, { seg: 4, mat: "paint" }), tube([J[i].b, J[i + 1].f], 0.45, GZ, { seg: 4, mat: "paint" }));
  // the deck: a slab hung between the bottom chords (glass in x-ray, so you can see the floor beams)
  const bot = J.slice(0, g.N + 1).map((j, i) => ({ ...j, i })), yIn = YT - 1.5, deck = [], dash = [];
  const slab = (arr, pc) => {
    if (arr.length < 2) return;
    const W2 = (j, z, y) => world(j.x, z, y, j.i, pc), top = [], side = [], q4 = (a, b, c, d) => [[a, b, c], [a, c, d]];
    for (let k2 = 0; k2 < arr.length - 1; k2++) {
      const A = arr[k2], B = arr[k2 + 1];
      top.push(...q4(W2(A, DECK_TOP, yIn), W2(B, DECK_TOP, yIn), W2(B, DECK_TOP, -yIn), W2(A, DECK_TOP, -yIn)));
      for (const y of [yIn, -yIn]) side.push(...q4(W2(A, DECK_TOP, y), W2(B, DECK_TOP, y), W2(B, -0.55, y), W2(A, -0.55, y)));
      side.push(...q4(W2(A, -0.55, yIn), W2(B, -0.55, yIn), W2(B, -0.55, -yIn), W2(A, -0.55, -yIn)));
      const a0 = W2(A, DECK_TOP + 0.03, 0), b0 = W2(B, DECK_TOP + 0.03, 0);
      dash.push([mid(a0, b0, 0.1), mid(a0, b0, 0.4)], [mid(a0, b0, 0.6), mid(a0, b0, 0.9)]);
      for (const y of [yIn - 1.2, -yIn + 1.2]) dash.push([W2(A, DECK_TOP + 0.03, y), W2(B, DECK_TOP + 0.03, y)]);
    }
    for (const e of [arr[0], arr[arr.length - 1]]) side.push(...q4(W2(e, DECK_TOP, yIn), W2(e, DECK_TOP, -yIn), W2(e, -0.55, -yIn), W2(e, -0.55, yIn)));
    deck.push(tris(top, "#3b3e44", { mat: "matte", shell: true }), tris(side, "#aaa59b", { mat: "concrete", shell: true }));
  };
  if (f) { slab(bot.filter((j) => j.x <= breakX), 0); slab(bot.filter((j) => j.x > breakX), 1); } else slab(bot);
  // vehicles: anything on the span when it goes comes down with it
  const vobs = [];
  cars.forEach((c) => {
    if (f && !c.fell && onSpanTons(c) > 0) { const x0 = c.x + VEH[c.kind].rear, x1 = c.x + VEH[c.kind].front, ov = (a, b) => Math.max(0, Math.min(x1, b) - Math.max(x0, a)); c.fell = true; c.piece = ov(0, breakX) >= ov(breakX, D.SPAN) ? 0 : 1; }
    vobs.push(vehicleObj(c, f));
  });
  let svg = E.render([{ cache: "site", rev: 0, parts: siteStatic }, { parts: steel }, { parts: deck }, ...vobs]);
  for (const [p, q2] of dash) E.line(p, q2, 1.6, "#ece8da", 0.75 * (1 - E.xray * 0.7));
  // ripples drifting down the river
  for (let i = 0; i < 10; i++) { const y = PY0 + 6 + ((i * 31 + now * 5) % (PY1 - PY0 - 12)), x = XA0 + 16 + ((i * 47) % (XA1 - XA0 - 40)); E.line([x, y, 5.05], [x + 10, y, 5.05], 1.3, "#ffffff", 0.28); }
  // splash and snap
  if (f) {
    const hits = [[0.6, breakX * 0.5], [0.6, breakX + (D.SPAN - breakX) * 0.5], [1.9, Math.min(4, breakX * 0.3)], [1.9, Math.max(D.SPAN - 4, D.SPAN - (D.SPAN - breakX) * 0.3)]];
    for (const [t0, xm] of hits) {
      const tt = f.t - t0; if (tt < 0 || tt > 2) continue;
      const r = Math.min(1, tt / 1.5), cx = D.X0 + xm * D.U, R = 8 + 50 * r;
      for (let i = 0; i < 28; i++) { const a0 = (i / 28) * TAU, a1 = ((i + 1) / 28) * TAU; E.line([cx + Math.cos(a0) * R, Math.sin(a0) * R * 0.9, 5.1], [cx + Math.cos(a1) * R, Math.sin(a1) * R * 0.9, 5.1], 2.5, "#ffffff", 0.8 * (1 - r)); }
      if (tt < 1.65) for (let i = 0; i < 26; i++) { const ang = (i / 26) * TAU, sp2 = 2 + ((i * 7) % 4), vz = 9 + ((i * 5) % 7); E.sprite([cx + Math.cos(ang) * sp2 * tt * D.U, Math.sin(ang) * sp2 * tt * D.U, 5 + Math.max(0, (vz * tt - 4.9 * tt * tt) * D.U)], 2.6 - tt, "#eaf4ff", clamp(1 - tt / 1.65, 0, 1) * 0.9, false, 1); }
      if (tt < 0.8) for (let i = 0; i < 6; i++) E.sprite([cx + (i - 2.5) * 6, ((i * 13) % 20) - 10, 6 + tt * 30], 10 + tt * 26, "#dfeaf4", 0.4 * (1 - tt / 0.8));
    }
  }
  if (now - snapAt < 0.5 && snapped >= 0) {
    const m = g.M[snapped], a = J[m.a], b = J[m.b], tt = now - snapAt;
    for (const [p, q2] of [[a.f, b.f], [a.b, b.b]]) { const c = mid(p, q2, 0.5); E.sprite(c, 5 + tt * 40, "#fff3c8", 0.9 * (1 - tt * 2), true, 1); for (let i = 0; i < 8; i++) { const an = (i / 8) * TAU + snapped, d = 4 + tt * 60; E.line([c[0] + Math.cos(an) * d, c[1], c[2] + Math.sin(an) * d], [c[0] + Math.cos(an) * (d + 5), c[1], c[2] + Math.sin(an) * (d + 5)], 2, "#ffd27a", 1 - tt * 2, true); } }
  }
  // x-ray: the numbers. Force in the hardest-working members, tension or compression
  if (E.xray > 0.05 && fallAt === null && res && !res.mech) {
    const top = res.forces.map((fr, i) => ({ fr, i })).filter((e) => !broken.has(e.i) && e.fr.util > 0.04).sort((p, q2) => q2.fr.util - p.fr.util).slice(0, E.fs < 0.62 ? 4 : 9);
    let s = "";
    for (const { fr, i } of top) { const m = g.M[i], c = E.project(mid(J[m.a].f, J[m.b].f, 0.5)); s += '<text class="frc ' + (fr.N >= 0 ? "ten" : "com") + '" x="' + c[0].toFixed(1) + '" y="' + (c[1] - 7).toFixed(1) + '" text-anchor="middle">' + (fr.N >= 0 ? "+" : "−") + Math.round(Math.abs(fr.N)).toLocaleString("en-AU") + " kN</text>"; }
    svg += '<g opacity="' + E.xray.toFixed(2) + '">' + s + "</g>";
  }
  if (sceneG.innerHTML !== svg) sceneG.innerHTML = svg;
  const tons = cars.reduce((a, c) => a + onSpanTons(c), 0);
  const text = fallAt !== null ? "COLLAPSED" : (cars.length ? Math.round(tons) + " t on the span · " : "empty · ") + "worst member " + Math.round(worst.util * 100) + " %";
  if (readout.textContent !== text) readout.textContent = text;
}
// picking: tap (not drag) a member to cut it, hover to see which one you'd get
const overEl = stage.querySelector(".mk-over");
function pick(ev) {
  if (!lastJ || fallAt !== null || ev.target.closest(".mk-tools,button,a")) return -1;
  const m0 = overEl.getScreenCTM(); if (!m0) return -1;
  const pt = overEl.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; const q2 = pt.matrixTransform(m0.inverse());
  let best = -1, bd = ev.pointerType === "touch" ? 16 : 9;
  g.M.forEach((m, i) => {
    if (broken.has(i)) return;
    for (const side of ["f", "b"]) {
      const a = E.project(lastJ[m.a][side]), b = E.project(lastJ[m.b][side]), dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
      const t = clamp(((q2.x - a[0]) * dx + (q2.y - a[1]) * dy) / L2, 0.08, 0.92), d = Math.hypot(q2.x - a[0] - dx * t, q2.y - a[1] - dy * t) + (side === "b" ? 2.5 : 0);
      if (d < bd) { bd = d; best = i; }
    }
  });
  return best;
}
let downAt = null;
stage.addEventListener("pointerdown", (ev) => { downAt = [ev.clientX, ev.clientY]; });
stage.addEventListener("pointerup", (ev) => { if (!downAt) return; const moved = Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]); downAt = null; if (moved > 6) return; const i = pick(ev); if (i >= 0) { hover = -1; cut(i); } });
stage.addEventListener("pointermove", (ev) => { if (ev.pointerType === "touch" || ev.buttons) return; const i = pick(ev); if (i !== hover) { hover = i; stage.style.cursor = i >= 0 ? "pointer" : ""; if (!frame) draw(); } });
stage.addEventListener("pointerleave", () => { if (hover !== -1) { hover = -1; stage.style.cursor = ""; if (!frame) draw(); } });

function onSpanTons(c) { const s = VEH[c.kind]; let t = 0; for (const [off, fr] of s.axles) { const x = c.x - off; if (x >= 0 && x <= D.SPAN) t += s.t * fr; } return t; }

function solve() {
  if (!u0) { const r0 = solveTruss(g, loadsFor(g, []), new Set()); u0 = r0.u; }
  res = solveTruss(g, loadsFor(g, fallAt === null ? cars.filter((c) => !c.fell) : []), broken);
  worst = { util: 0, i: -1 };
  if (!res.mech) res.forces.forEach((fr, i) => { if (!broken.has(i) && fr.util > worst.util) worst = { util: fr.util, i }; });
}
const NAMES = { bottom: "bottom chord", top: "top chord", end: "end post", vert: "vertical", diag: "diagonal" };
function failMember(i, why) {
  broken.add(i); snapped = i; snapAt = now;
  const m = g.M[i], xm = (g.J[m.a][0] + g.J[m.b][0]) / 2;
  breakX = clamp(xm, 4, D.SPAN - 4);
  solve();
  if (res.mech) { fallAt = now + 0.15; event(why + " It's a statically determinate truss: no spare members, so losing one turns it into a mechanism. Down it goes."); }
}
function cut(i) {
  takeOver();
  if (fallAt !== null || broken.has(i)) return;
  failMember(i, "You cut a " + NAMES[g.M[i].type] + ".");
  run();
}

function step(dt) {
  if (fallAt !== null) {
    const t = now - fallAt;
    cars.forEach((c) => {
      if (!c.fell) return;
      // dragged down the slope towards the break, then settling into the water
      const v = 12 * Math.max(0, t - 0.35), V = VEH[c.kind];
      if (c.piece === 0) c.x = Math.min(c.x + v * dt, Math.max(c.x, breakX - V.front - 0.3)); else c.x = Math.max(c.x - v * dt, Math.min(c.x, breakX - V.rear + 0.3));
      if (t > 2.6) c.drop = Math.min(1.2, (c.drop || 0) + 0.8 * dt);
      // nothing hangs back over the abutments
      if (c.piece === 1 && c.x + V.rear < 0.5) c.x = Math.min(0.5 - V.rear, c.x + 15 * dt);
      if (c.piece === 0 && c.x + V.front > D.SPAN - 0.5) c.x = Math.max(D.SPAN - 0.5 - V.front, c.x - 15 * dt);
    });
    if (t > 5.5) { fallAt = null; broken.clear(); cars.forEach((c) => c.el && c.el.remove()); cars = []; snapped = -1; buildBridge(); solve(); event("New bridge. Same design, same steel."); }
    return;
  }
  // traffic: everyone drives at the same speed, keeps a gap, and stops if there's a jam
  const sorted = cars.slice().sort((a, b) => b.x - a.x);
  sorted.forEach((c, i) => {
    const V = VEH[c.kind], lead = sorted[i - 1];
    const limit = i === 0 ? (jam ? D.SPAN - 1.5 - V.front : Infinity) : lead.x + VEH[lead.kind].rear - 3 - V.front;
    c.x = Math.min(c.x + SPEED * dt, Math.max(c.x, limit));
  });
  cars = cars.filter((c) => { if (c.x + VEH[c.kind].rear > D.EDGE_R + 0.5) { c.el && c.el.remove(); return false; } return true; });
  if (stream && now >= streamAt) { send("car"); streamAt = now + stream; }
  solve();
  if (res.mech) return;
  if (worst.util > 1) {
    const m = g.M[worst.i], fr = res.forces[worst.i];
    failMember(worst.i, "The " + NAMES[m.type] + " hit " + Math.round(worst.util * 100) + " % and " + (fr.N >= 0 ? "pulled apart" : "buckled") + ".");
  }
}
function send(kd) {
  const V = VEH[kd];
  const back = cars.reduce((a, c) => Math.min(a, c.x + VEH[c.kind].rear - 3 - V.front), Infinity);
  cars.push({ kind: kd, x: Math.min(D.EDGE_L - V.front - 0.2, back), el: null, fell: false, drop: 0 });
}

const ui = {
  send: [...document.querySelectorAll("[data-send]")], kind: [...document.querySelectorAll("[data-kind]")],
  jam: document.querySelector("#jam"), stream: document.querySelector("#stream"), fresh: document.querySelector("#fresh"), clear: document.querySelector("#clear"),
  uFill: document.querySelector("#u-fill"), uOut: document.querySelector("#u-out"), tFill: document.querySelector("#t-fill"), tOut: document.querySelector("#t-out"),
  stats: document.querySelector("#stats"), slow: document.querySelector("#slow"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"),
};
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };
function syncUi() {
  ui.kind.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.kind === kind)));
  ui.jam.setAttribute("aria-pressed", String(jam)); ui.jam.textContent = jam ? "Let them go" : "Jam on the bridge";
  ui.stream.setAttribute("aria-pressed", String(!!stream));
  const u = fallAt !== null ? 0 : worst.util;
  ui.uFill.style.width = (clamp(u / 1.2, 0, 1) * 100).toFixed(1) + "%"; ui.uFill.dataset.state = u > 1 ? "bad" : u > 0.85 ? "warn" : "ok";
  ui.uOut.textContent = fallAt !== null ? "gone" : Math.round(u * 100) + " %";
  const tons = cars.reduce((a, c) => a + onSpanTons(c), 0);
  ui.tFill.style.width = (clamp(tons / 200, 0, 1) * 100).toFixed(1) + "%"; ui.tFill.dataset.state = tons > 130 ? "warn" : "ok";
  ui.tOut.textContent = Math.round(tons) + " t";
  const wm = worst.i >= 0 ? g.M[worst.i] : null, wf = worst.i >= 0 && res && !res.mech ? res.forces[worst.i] : null;
  ui.stats.innerHTML = fallAt !== null ? "<b>collapsed</b>" : wm ? "working hardest: the <b>" + NAMES[wm.type] + "</b>, " + (wf.N >= 0 ? "<b>tension</b> " : "<b>compression</b> ") + Math.round(Math.abs(wf.N)) + " kN · " + (kind === "pratt" ? "Pratt" : "Howe") + " truss" : "";
  ui.slow.setAttribute("aria-pressed", String(slow)); ui.tour.setAttribute("aria-pressed", String(touring));
}
function story() {
  if (now - lastEventAt < 5 && lastEvent) return say(lastEvent);
  if (fallAt !== null) return;
  const types = new Set(cars.map((c) => c.kind));
  if (touring && tourStep >= 0) return say(TOUR[tourStep].say + " Worst member " + Math.round(worst.util * 100) + " %.");
  if (!cars.length) return say("A 48 m steel truss, already carrying its own weight. Red members are in tension, blue in compression, and the brighter they are the closer they are to their limit. Send something over, or tap a member to cut it.");
  if (worst.util > 0.9) return say("That's " + Math.round(worst.util * 100) + " % in the " + NAMES[g.M[worst.i].type] + ". Not much left.");
  if (jam && cars.some((c) => c.x > 0 && c.x < D.SPAN + 5)) return say("Jammed: everything's stopped on the span, so its full weight sits there at once. Worst member " + Math.round(worst.util * 100) + " %.");
  if (kind === "howe" && types.size) return say("A Howe truss: same steel, but the long diagonals are in compression (blue), and long things in compression buckle. Worst member " + Math.round(worst.util * 100) + " %.");
  return say("Watch the colours move with the load: the bottom chord pulls, the top chord pushes, and the diagonals near the load light up. Worst member " + Math.round(worst.util * 100) + " %.");
}

const TOUR = [
  { say: "Cars. A car is 1.5 t on a bridge carrying about 100 t of its own steel and deck: the colours barely move.", kind: "pratt", acts: [[0.3, "stream"], [7, "nostream"], [10, "end"]] },
  { say: "A B-double (62.5 t), then a triple road train (about 120 t). Watch the bottom chord go red and the sag grow under the drive axles.", kind: "pratt", acts: [[0.3, "bdouble"], [3.2, "roadtrain"], [12, "end"]] },
  { say: "Now jam them. Traffic stopped on the span puts its whole weight there at once, which is what bridges are actually designed around.", kind: "pratt", acts: [[0.3, "jam"], [0.4, "bdouble"], [2.8, "bdouble"], [5.2, "bus"], [10, "unjam"], [15, "end"]] },
  { say: "Same span, Howe truss. Its long diagonals are in compression, and long, thin things in compression buckle. Here comes the road train.", kind: "howe", acts: [[0.3, "bdouble"], [5, "roadtrain"], [16, "end"]] },
  { say: "No overload this time. Somebody cuts one diagonal.", kind: "pratt", acts: [[0.3, "bus"], [2.6, "cut"], [9.5, "end"]] },
  { say: "And a 620 t mining haul truck, because why not.", kind: "pratt", acts: [[0.3, "haul"], [10, "end"]] },
];
function setKind(v) { kind = v; g = trussGeom(kind); u0 = null; broken.clear(); fallAt = null; buildBridge(); cars.forEach((c) => c.el && c.el.remove()); cars.forEach((c) => (c.el = null)); solve(); }
function tick(t) {
  const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
  last = t;
  const sdt = dt * (slow ? 0.15 : 1);
  now += sdt;
  if (touring && fallAt === null) {
    tourClock += sdt;
    if (tourStep < 0 || actions.length === 0) {
      tourStep = (tourStep + 1) % TOUR.length;
      cars.forEach((c) => c.el && c.el.remove()); cars = []; jam = false; stream = 0;
      setKind(TOUR[tourStep].kind);
      actions = TOUR[tourStep].acts.map(([w, a]) => [tourClock + w, a]);
    }
    while (actions.length && tourClock >= actions[0][0]) {
      const a = actions.shift()[1];
      if (VEH[a]) send(a); else if (a === "stream") { stream = 0.9; streamAt = now; } else if (a === "nostream") stream = 0;
      else if (a === "jam") jam = true; else if (a === "unjam") jam = false;
      else if (a === "cut") { const i = g.M.findIndex((m) => m.type === "diag"); failMember(i, "Someone cut a diagonal."); }
      else if (a === "end") actions = [];
    }
  }
  step(sdt); draw(); syncUi(); story();
  const idle = !touring && !cars.length && fallAt === null && now - snapAt > 1 && false;
  frame = visible && !idle ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { if (touring) { touring = false; actions = []; stream = 0; } };
const guard = (fn) => (...a) => { takeOver(); if (fallAt !== null) return; fn(...a); solve(); draw(); syncUi(); story(); run(); };
const doSend = guard((kd) => send(kd));
const doKind = guard((v) => setKind(v));
const doJam = guard(() => { jam = !jam; });
const doStream = guard(() => { stream = stream ? 0 : 0.9; streamAt = now; });
const doFresh = guard(() => { cars.forEach((c) => c.el && c.el.remove()); cars = []; jam = false; stream = 0; setKind(kind); });
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;
ui.send.forEach((b) => b.addEventListener("click", () => doSend(b.dataset.send)));
ui.kind.forEach((b) => b.addEventListener("click", () => doKind(b.dataset.kind)));
ui.jam.addEventListener("click", doJam);
ui.stream.addEventListener("click", doStream);
ui.fresh.addEventListener("click", doFresh);
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; tourClock = 0; actions = []; } run(); });
stage.addEventListener("keydown", (ev) => {
  const map = { x: () => { setX(!E.xrayOn); run(); }, "1": () => doSend("car"), "2": () => doSend("bus"), "3": () => doSend("bdouble"), "4": () => doSend("roadtrain"), "5": () => doSend("haul"), j: doJam, h: () => doKind(kind === "pratt" ? "howe" : "pratt"), r: doFresh, s: () => { slow = !slow; run(); } };
  if (map[ev.key]) { ev.preventDefault(); map[ev.key](); }
});
window.__fig = { E, freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
solve(); draw(); syncUi(); story();
`;

const CSS = `.key-t{display:inline-block;width:10px;height:10px;border-radius:2px;margin:0 5px 0 10px;vertical-align:-1px}.key-t:first-child{margin-left:0}
.frc{font:700 calc(10.5px*var(--mk-ts,1)) var(--anatomy-mono);paint-order:stroke;stroke:var(--mk-stage-b);stroke-width:3px;stroke-linejoin:round}.frc.ten{fill:#ff6a5a}.frc.com{fill:#5aa0ff}body[data-theme="light"] .frc.ten{fill:#c8281a}body[data-theme="light"] .frc.com{fill:#1a5fd0}`;

const stage = stageHtml({
  W, H, fig: "Fig 19", title: "Truss bridge", xray: true,
  label: "A steel truss bridge across a river, 48 metres between abutments, with the deck between two trusses. Vehicles drive across on the deck. Each member is coloured by the force in it: red for tension, blue for compression. An x-ray mode turns the deck to glass and puts the force on the hardest-working members.",
  keysHelp: "Truss bridge: drag to rotate, X for the forces, 1 to 5 send a car, bus, B-double, road train or haul truck; J jams the traffic; H swaps Pratt and Howe; tap a member to cut it",
  extra: ``,
});

const CONTROLS = `<div class="ctl" role="group" aria-label="Controls">
  <div class="ctl-row"><span class="ctl-label">Send</span><button type="button" data-send="car">Car<small>1.5 t</small></button><button type="button" data-send="bus">Bus<small>18 t</small></button><button type="button" data-send="bdouble">B-double<small>62.5 t</small></button><button type="button" data-send="roadtrain">Road train<small>120 t</small></button><button type="button" data-send="haul">Haul truck<small>620 t</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Traffic</span><button type="button" id="stream" aria-pressed="false">Stream of cars</button><button type="button" id="jam" aria-pressed="false">Jam on the bridge</button></div>
  <div class="ctl-row"><span class="ctl-label">Truss</span><button type="button" data-kind="pratt" aria-pressed="true">Pratt<small>diagonals in tension</small></button><button type="button" data-kind="howe" aria-pressed="false">Howe<small>diagonals in compression</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Worst</span><div class="meter"><span id="u-fill" class="fill"></span><span class="mark" style="left:${(100 / 120 * 100).toFixed(1)}%" data-label="100 % = it goes"></span></div><output id="u-out">0 %</output></div>
  <div class="ctl-row"><span class="ctl-label">On span</span><div class="meter"><span id="t-fill" class="fill"></span></div><output id="t-out">0 t</output></div>
  <div class="ctl-row wide"><span class="ctl-label">Forces</span><span id="stats"></span></div>
  <div class="ctl-row wide"><span class="ctl-label">Key</span><span><span class="key-t" style="background:#ff4a3d"></span>tension<span class="key-t" style="background:#3d8bff"></span>compression · tap a member to cut it · X-ray for the numbers</span></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="fresh">New bridge</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
</div>`;


const foot = footHtml({
  theme, slug: "truss",
  real: "the stiffness method for a pin-jointed truss, tension and compression, Euler buckling for compression members, Pratt against Howe, and a determinate truss becoming a mechanism. Typical: B-double 62.5 t, triple road train about 120 t, a big loaded mining haul truck about 620 t.",
  made: "the member sizes, the dead load, the speeds, no impact factor, and the sag drawn 80 times bigger (dead-load sag left out, as if the bridge were cambered).",
});
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), pageMk2({
  k, title: "Truss bridge", fig: "Fig 19", hint: "Tap a member: cut it", theme, W, H, stage, controls: CONTROLS, css: CSS, foot,
  caption: "A truss carries load by turning it into pure push and pull along straight members. Put a load on the deck and the bottom chord stretches (tension), the top chord squashes (compression), and the diagonals near the load share it out to the supports. Steel is as strong in tension as in compression, but a long, thin member in compression buckles well before the steel itself gives up. That's the whole difference between these two: a Pratt truss puts its long diagonals in tension, a Howe puts them in compression, so the same steel carries less. And a simple truss like this has no spare members. Lose any one of them, by overload or by cutting it, and it's a mechanism.",
  script: LIVE.replace("__DATA__", JSON.stringify(DATA)),
}));
console.log("wrote", name);
