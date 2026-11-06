import { writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { kitScript } from "../../scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const SOLVER = readFileSync(join(HERE, "solver.js"), "utf8").replace(/if \(typeof module[^\n]*\n?/, "");

const W = 640;
const H = 440;

// Truth: a pin-jointed truss carries load as pure tension and compression in its members; long members in compression
// buckle (Euler) long before they yield, which is why a Pratt truss (long diagonals in tension) suits steel better than a
// Howe (long diagonals in compression). A statically determinate truss has no spare members: lose one and it's a mechanism.
// Vehicle masses are typical Australian figures (B-double 62.5 t, triple road train about 120 t, a large mining haul truck
// about 620 t loaded). Toy: the member sizes, the dead load, the speeds, and the deflection is drawn 80 times bigger (dead-load sag left out, as if the bridge were cambered).
const U = 4; // plot units per metre
const SPAN = 48, X0 = -96, DZ = 44, YT = 22, LANE = 7;
const APPROACH = 13.5;
const PLATE = { x: -152, y: -72, w: 304, d: 144, r: 8 };
const PLATE_H = 12, FOOT_H = 5;

const P = k.fitProjection([...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [X0, -YT, DZ + 7 * U + 4], [X0 + SPAN * U, YT, DZ + 7 * U + 4]], W, H, { pad: 14, azimuth: 45 });
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const Dt = (points, style) => k.dotsSvg(points, style);
const depth2 = ([x, y]) => k.depthOf([x, y, 0], P);
const byDepth = (pts) => [...pts].sort((a, b) => depth2(a) - depth2(b));
const slab = (plan, z, h, r = 1.2, bevel = 0.5) => k.slabOf({ r, ...plan }, z, h, P, 4, bevel);

function plate() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 22))) {
    out.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid", inner: L(k.sideSeam(PLATE, -PLATE_H / 2, P), { tone: "faint" }) }));
  // the river
  const r = [[X0 + 6, PLATE.y + 4, 0.05], [X0 + SPAN * U - 6, PLATE.y + 4, 0.05], [X0 + SPAN * U - 6, PLATE.y + PLATE.d - 4, 0.05], [X0 + 6, PLATE.y + PLATE.d - 4, 0.05]];
  out.push(`<path class="river" d="${k.pathOf(r.map(at), true)}"/>`);
  const ripples = [];
  for (let i = 0; i < 9; i++) { const x = X0 + 20 + ((i * 47) % (SPAN * U - 40)), y = PLATE.y + 14 + ((i * 31) % (PLATE.d - 28)); ripples.push(k.segment([x, y, 0.1], [x + 10, y, 0.1], P)); }
  out.push(`<path class="ripple" d="${ripples.join("")}"/>`);
  out.push(`<g data-part="splash"></g>`);
  return out.join("");
}

// abutments and the approach roads, in two halves so the near one draws over the falling bridge
function abutment(side) {
  const x0 = side < 0 ? PLATE.x + 2 : X0 + SPAN * U, x1 = side < 0 ? X0 : PLATE.x + PLATE.w - 2;
  const out = [];
  out.push(S(slab({ x: x0, y: PLATE.y + 2, w: x1 - x0, d: PLATE.d - 4 }, 0, DZ, 1, 0.4), { tone: "mid", inner: L([12, 24, 36].map((z) => k.segment([x1, PLATE.y + 2, z], [x1, PLATE.y + PLATE.d - 2, z], P)).join(""), { tone: "faint" }) }));
  out.push(`<g class="road">${S(slab({ x: x0, y: -YT + 2, w: x1 - x0, d: 2 * YT - 4 }, DZ, 0.6, 0.3, 0.1), { tone: "lo", crease: "none" })}</g>`);
  out.push(L(k.segment([x0 + 2, 0, DZ + 0.7], [x1 - 2, 0, DZ + 0.7], P), { tone: "faint" }));
  return out.join("");
}

// the near faces (front and end) of the right abutment, used to hide the falling bridge behind it
const YF = PLATE.y + PLATE.d - 2, XA = X0 + SPAN * U, XE = PLATE.x + PLATE.w - 2, YB = PLATE.y + 2;
function occClip() {
  const face = (pts) => k.pathOf(pts.map(at), true);
  const sides = face([[XA, YF, 0], [XE, YF, 0], [XE, YF, DZ], [XA, YF, DZ]]) + face([[XE, YF, 0], [XE, YB, 0], [XE, YB, DZ], [XE, YF, DZ]]);
  return `<defs><clipPath id="occclip"><path d="${sides}"/></clipPath><clipPath id="occclip2"><path d="${sides}${face([[XA, YB, DZ], [XE, YB, DZ], [XE, YF, DZ], [XA, YF, DZ]])}"/></clipPath></defs>`;
}
function bearings() {
  const out = [];
  for (const x of [X0, X0 + SPAN * U]) for (const y of [-YT, YT]) out.push(S(slab({ x: x - 4, y: y - 3, w: 8, d: 6 }, DZ - 0.2, 1.6, 0.4, 0.2), { tone: "lo" }));
  return out.join("");
}
const svg = k.figureSvg({
  width: W, height: H,
  label: "A steel truss bridge across a river, 48 metres between abutments, with the deck between two trusses. Vehicles drive across on the deck. Each member is coloured by the force in it: red for tension, blue for compression.",
  body: [occClip(), plate(), abutment(-1), abutment(1), bearings(), `<g data-part="bridge"></g>`, `<g data-part="occ" clip-path="url(#occclip)" style="display:none">${abutment(1)}</g>`, `<g data-part="top"></g>`],
});

const DATA = { W, H, P, U, SPAN, X0, DZ, YT, LANE, APPROACH, EDGE_L: (PLATE.x + 2 - X0) / U, EDGE_R: (PLATE.x + PLATE.w - 2 - X0) / U };

const LIVE = `
${SOLVER}
const D = __DATA__;
const { P } = D;
const stage = document.querySelector(".fx-stage");
const q = (n) => stage.querySelector('[data-part="' + n + '"]');
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const DEFL = 80;
let u0 = null;

let kind = "pratt", g = trussGeom(kind), broken = new Set(), res = null, jam = false;
let cars = [], fallAt = null, breakX = 0, snapAt = -10, snapped = -1, lastShot = "", lastEvent = "", lastEventAt = -10, worst = { util: 0, i: -1 };
let frame = 0, last = 0, now = 0, visible = false, touring = true, slow = false, tourClock = 0, tourStep = -1, actions = [], stream = 0, streamAt = 0;
const event = (t) => { lastEvent = t; lastEventAt = now; };
const SPEED = 11;

// the bridge drawing, rebuilt when the truss type changes
const bridgeG = q("bridge"), splashG = q("splash"), occG = q("occ"), topG = q("top");
let els = null;
function buildBridge() {
  const line = (cls, extra = "") => '<line class="' + cls + '"' + extra + '/>';
  let back = "", front = "", braces = "", gus = "";
  g.M.forEach((m, i) => { back += line("mem back t-" + m.type, ' data-m="' + i + '"'); front += '<g data-fm="' + i + '">' + line("hit") + line("mem-o t-" + m.type) + line("mem front t-" + m.type) + "</g>"; });
  let bracesHi = "";
  for (let i = 0; i < g.J.length; i++) (i <= g.N ? (braces += line("brace")) : (bracesHi += line("brace hi")));
  for (let i = 0; i < 2 * (g.N - 2); i++) bracesHi += line("brace hi");
  for (let i = 0; i < g.J.length; i++) gus += '<circle class="gus" r="2.1"/>';
  bridgeG.innerHTML = '<g class="backtruss">' + back + '</g><g class="braces">' + braces + '</g><path class="deck" d=""/><path class="lanes" d=""/><path class="fascia" d=""/><g class="cars"></g><g class="braces-hi">' + bracesHi + '</g><g class="fronttruss">' + front + '</g><g class="gussets">' + gus + '</g><g class="snap"></g>';
  els = {
    back: [...bridgeG.querySelectorAll(".backtruss line")], front: [...bridgeG.querySelectorAll("[data-fm]")].map((gg) => ({ g: gg, hit: gg.querySelector(".hit"), mem: gg.querySelector(".mem"), o: gg.querySelector(".mem-o") })),
    braces: [...bridgeG.querySelectorAll(".braces .brace"), ...bridgeG.querySelectorAll(".braces-hi .brace")], gus: [...bridgeG.querySelectorAll(".gus")], deck: bridgeG.querySelector(".deck"), lanes: bridgeG.querySelector(".lanes"), fascia: bridgeG.querySelector(".fascia"), cars: bridgeG.querySelector(".cars"), snap: bridgeG.querySelector(".snap"),
  };
  els.front.forEach((f, i) => f.g.addEventListener("pointerdown", (ev) => { ev.stopPropagation(); cut(i); }));
  cars.forEach((c) => { c.el = null; });
}
buildBridge();

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

// ---- vehicles: little 3D models, each part a prism (a side profile in x-z pushed out across y) ----
// local metres: x = 0 at the front axle, +x forward; z up from the deck; y across, 0 = the vehicle's centreline
const VIEW = (() => { const o = depthOf([0, 0, 0], P); return [depthOf([1, 0, 0], P) - o, depthOf([0, 1, 0], P) - o, depthOf([0, 0, 1], P) - o]; })();
const LIGHT = (() => { const v = [0.3, 0.75, 1]; const n = Math.hypot(...v); return v.map((a) => a / n); })();
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function shade(hex, n) {
  const d = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]), f = 0.5 + 0.62 * d;
  return "rgb(" + rgb(hex).map((c) => Math.round(clamp(c * f, 0, 255))).join(",") + ")";
}
const PAINT = { car: "#d6443a", bus: "#e8a93a", bdouble: "#2f6fd0", roadtrain: "#2f9e64", haul: "#f2b821" };
const C = { glass: "#86b7de", dark: "#2b2e33", tyre: "#1c1d20", hub: "#a9aeb4", silver: "#d5d9de", chrome: "#e8ebee", lamp: "#ffe08a", tail: "#e0402f", dirt: "#8a6844", bar: "#55595f" };
const box = (x0, x1, z0, z1, y0, y1, col, layer = 1) => ({ ring: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], y0, y1, col, layer });
const prof = (ring, y0, y1, col, layer = 1) => ({ ring, y0, y1, col, layer });
function wheel(x, r, yc, wid) {
  const ring = (rr) => Array.from({ length: 16 }, (_, i) => [x + rr * Math.cos((i / 16) * Math.PI * 2), r + rr * Math.sin((i / 16) * Math.PI * 2)]);
  const layer = yc > 0 ? 2 : 0, near = yc > 0;
  return [prof(ring(r), yc - wid / 2, yc + wid / 2, C.tyre, layer), prof(ring(r * 0.55), near ? yc + wid / 2 - 0.02 : yc - wid / 2 - 0.03, near ? yc + wid / 2 + 0.03 : yc - wid / 2 + 0.02, C.hub, layer)];
}
const pair = (x, r, yc, wid) => [...wheel(x, r, yc, wid), ...wheel(x, r, -yc, wid)];
function primeMover(paint, axles) {
  const p = [];
  p.push(box(-6.2, 2.3, 0.55, 1.0, -0.5, 0.5, C.dark));
  p.push(box(2.2, 2.45, 0.45, 1.0, -1.25, 1.25, C.chrome));
  p.push(prof([[2.35, 1.0], [0.25, 1.0], [0.25, 2.25], [2.3, 2.05]], -1.0, 1.0, paint));
  p.push(box(2.33, 2.38, 1.05, 2.0, -0.62, 0.62, C.chrome, 3));
  p.push(box(-2.1, 0.25, 1.0, 3.45, -1.25, 1.25, paint));
  p.push(box(-3.1, -2.1, 1.0, 3.7, -1.25, 1.25, paint));
  p.push(box(0.25, 0.29, 2.35, 3.2, -1.1, 1.1, C.glass, 3));
  p.push(box(-1.6, 0.05, 2.35, 3.15, 1.25, 1.28, C.glass, 3));
  p.push(box(-2.35, -2.15, 1.0, 4.25, 1.05, 1.25, C.chrome, 3));
  p.push(box(-1.9, -0.3, 0.6, 1.1, 1.0, 1.32, C.chrome, 3));
  p.push(box(2.38, 2.42, 1.2, 1.45, 0.75, 1.05, C.lamp, 3));
  p.push(...pair(0, 0.52, 1.0, 0.32));
  for (const a of axles) p.push(...pair(a, 0.52, 0.92, 0.6));
  return p;
}
function trailer(x0, x1, axles, last) {
  const p = [box(x1, x0, 1.12, 1.38, -1.0, 1.0, C.dark), box(x1, x0, 1.38, 4.15, -1.25, 1.25, C.silver)];
  for (let x = x0 - 1.2; x > x1 + 0.6; x -= 1.6) p.push(box(x - 0.08, x, 1.45, 4.08, 1.25, 1.27, "#aeb3b9", 3));
  if (last) p.push(box(x1 - 0.03, x1, 1.5, 1.75, 0.8, 1.15, C.tail, 3));
  for (const a of axles) p.push(...pair(a, 0.5, 0.92, 0.6));
  return p;
}
const MODEL = {
  car: () => {
    const p = [], body = [[0.95, 0.3], [0.95, 0.72], [0.8, 0.84], [-0.25, 0.95], [-0.8, 1.42], [-2.4, 1.42], [-3.05, 1.0], [-3.55, 0.95], [-3.55, 0.3]];
    p.push(prof(body, -0.88, 0.88, PAINT.car));
    p.push(prof([[-0.33, 0.99], [-0.84, 1.37], [-2.37, 1.37], [-2.95, 1.02]], 0.88, 0.9, C.glass, 3));
    p.push(prof([[-0.25, 0.95], [-0.8, 1.42], [-0.86, 1.42], [-0.31, 0.95]], -0.78, 0.78, C.glass, 3));
    p.push(box(0.94, 0.97, 0.58, 0.7, 0.5, 0.82, C.lamp, 3));
    p.push(...pair(0, 0.32, 0.8, 0.22), ...pair(-2.7, 0.32, 0.8, 0.22));
    return { parts: p, w: 1.8, front: 0.95, rear: -3.55, lane: 1, rigid: true };
  },
  bus: () => {
    const p = [box(-10.1, 2.4, 0.35, 3.15, -1.25, 1.25, PAINT.bus), box(-9.6, -0.3, 1.65, 2.65, 1.25, 1.28, C.glass, 3), box(2.4, 2.43, 1.35, 2.95, -1.12, 1.12, C.glass, 3), box(1.0, 2.0, 0.5, 2.9, 1.25, 1.28, C.glass, 3), box(-7, -3.5, 3.15, 3.45, -0.7, 0.7, C.silver), box(2.4, 2.44, 0.6, 0.85, 0.75, 1.1, C.lamp, 3)];
    p.push(...pair(0, 0.5, 0.95, 0.35), ...pair(-6.5, 0.5, 0.92, 0.6));
    return { parts: p, w: 2.5, front: 2.45, rear: -10.1, lane: 1, rigid: true };
  },
  bdouble: () => ({ parts: [...primeMover(PAINT.bdouble, [-3.5, -4.8]), ...trailer(-3.2, -15.3, [-11.5, -12.8, -14.1]), ...trailer(-15.7, -25.3, [-21.5, -22.8, -24.1], true)], w: 2.5, front: 2.45, rear: -25.3, lane: 1 }),
  roadtrain: () => {
    const p = [...primeMover(PAINT.roadtrain, [-3.4, -4.6]), ...trailer(-2.8, -13.9, [-10.8, -12.0, -13.2])];
    for (const [d, prevRear, t0, t1, ax] of [[-19, -13.9, -17.0, -29.0, [-25.8, -27.0, -28.2]], [-34, -29.0, -32.0, -44.0, [-40.8, -42.0, -43.2]]]) {
      p.push(box(d + 1.2, prevRear, 0.75, 0.95, -0.12, 0.12, C.bar), box(d - 1.2, d + 1.2, 0.75, 1.15, -0.9, 0.9, C.dark), ...pair(d + 0.6, 0.5, 0.92, 0.6), ...pair(d - 0.6, 0.5, 0.92, 0.6));
      p.push(...trailer(t0, t1, ax, t1 === -44.0));
    }
    return { parts: p, w: 2.5, front: 2.45, rear: -44, lane: 1 };
  },
  haul: () => {
    const p = [];
    p.push(box(-9.4, 2.2, 1.4, 3.3, -1.9, 1.9, C.dark));
    p.push(box(-1.4, 2.5, 1.4, 3.7, -1.7, 1.7, PAINT.haul));
    p.push(box(0.5, 2.7, 3.6, 4.0, -4.4, 4.4, PAINT.haul));
    p.push(box(-0.5, 1.7, 4.0, 6.3, 1.8, 4.2, PAINT.haul));
    p.push(box(1.7, 1.73, 4.8, 6.0, 2.0, 4.0, C.glass, 3), box(-0.3, 1.5, 4.8, 6.0, 4.2, 4.23, C.glass, 3));
    p.push(box(2.68, 2.72, 1.6, 3.4, -1.2, 1.2, C.bar, 3));
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
function renderVehicle(c, f) {
  const M = MODELS[c.kind], lane = M.lane * D.LANE, piece = c.piece;
  const fallen = f && c.fell;
  const toWorld = fallen
    ? (lx, ly, lz) => world(c.x + lx, DECK_TOP + lz, lane + ly * D.U, undefined, piece, c.drop || 0)
    : (lx, ly, lz) => { const xm = c.x + lx, z = sagAt(xm) + DECK_TOP + lz; return [D.X0 + xm * D.U, lane + ly * D.U, D.DZ + z * D.U]; };
  const ax = VEH[c.kind].axles, xa = c.x, xb = c.x - ax[ax.length - 1][0], za = deck0(xa), zb = deck0(xb);
  const sagAt = M.rigid ? (xm) => za + (zb - za) * (xa - xm) / Math.max(0.1, xa - xb) : deck0;
  const a = fallen ? -1e9 : D.EDGE_L - c.x, b = fallen ? 1e9 : D.EDGE_R - c.x;
  const faces = [];
  let out = "";
  const sh = clipX([[M.rear, 0], [M.front, 0], [M.front, 1], [M.rear, 1]], a, b);
  if (sh) { const xs = sh.map((p) => p[0]), x0 = Math.min(...xs), x1 = Math.max(...xs), hw = M.w / 2 + 0.25; out += '<path class="vshadow" d="M' + [[x0, -hw], [x1, -hw], [x1, hw], [x0, hw]].map(([x, y]) => iso(toWorld(x, y, 0.02), P).map((v) => v.toFixed(1)).join(" ")).join("L") + 'Z"/>'; }
  for (const part of M.parts) {
    const ring = clipX(part.ring, a, b);
    if (!ring) continue;
    const n = ring.length, A = ring.map(([x, z]) => toWorld(x, part.y0, z)), B = ring.map(([x, z]) => toWorld(x, part.y1, z));
    const ctr = [0, 1, 2].map((k2) => (A.reduce((s2, p) => s2 + p[k2], 0) + B.reduce((s2, p) => s2 + p[k2], 0)) / (2 * n));
    const add = (pts) => {
      const cf = [0, 1, 2].map((k2) => pts.reduce((s2, p) => s2 + p[k2], 0) / pts.length);
      let nn = [0, 0, 0];
      for (let i = 0; i < pts.length; i++) { const p = pts[i], q2 = pts[(i + 1) % pts.length]; nn[0] += (p[1] - q2[1]) * (p[2] + q2[2]); nn[1] += (p[2] - q2[2]) * (p[0] + q2[0]); nn[2] += (p[0] - q2[0]) * (p[1] + q2[1]); }
      const len = Math.hypot(...nn); if (len < 1e-6) return;
      nn = nn.map((v) => v / len);
      if (dot(nn, sub(cf, ctr)) < 0) nn = nn.map((v) => -v);
      if (dot(nn, VIEW) <= 0.001) return;
      faces.push({ layer: part.layer, depth: dot(cf, VIEW), d: "M" + pts.map((p) => iso(p, P).map((v) => v.toFixed(1)).join(" ")).join("L") + "Z", fill: shade(part.col, nn) });
    };
    add(A); add(B);
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; add([A[i], A[j], B[j], B[i]]); }
  }
  faces.sort((p, q2) => p.layer - q2.layer || p.depth - q2.depth);
  for (const fc of faces) out += '<path d="' + fc.d + '" fill="' + fc.fill + '"/>';
  return out;
}
const sp = (p) => { const a = iso(p, P); return [a[0].toFixed(1), a[1].toFixed(1)]; };
function deflAt(xm) {
  // vertical deflection along the deck, between bottom joints
  if (!res || res.mech || !u0) return 0;
  const i = clamp(Math.floor(xm / g.Lp), 0, g.N - 1), f = clamp(xm / g.Lp - i, 0, 1);
  return ((res.u[2 * i + 1] - u0[2 * i + 1]) * (1 - f) + (res.u[2 * (i + 1) + 1] - u0[2 * (i + 1) + 1]) * f) * DEFL;
}

function colourOf(fr, broke) {
  if (broke) return "transparent";
  const u = clamp(fr.util, 0, 1.2), mix = Math.round(clamp(u / 0.9, 0, 1) * 100);
  return "color-mix(in srgb, var(--rest) , " + (fr.N >= 0 ? "#ff4a3d" : "#3d8bff") + " " + mix + "%)";
}

function draw() {
  const f = fallState();
  const J = g.J.map(([x, z], i) => ({ f: world(x, z, D.YT, i), b: world(x, z, -D.YT, i), x, z }));
  g.M.forEach((m, i) => {
    const a = J[m.a], b = J[m.b], broke = broken.has(i);
    const fr = res && !res.mech ? res.forces[i] : { N: 0, util: 0 };
    const col = fallAt !== null ? "var(--rest)" : colourOf(fr, broke);
    const set = (el, p, q2) => { const A = sp(p), B = sp(q2); el.setAttribute("x1", A[0]); el.setAttribute("y1", A[1]); el.setAttribute("x2", B[0]); el.setAttribute("y2", B[1]); };
    // a broken member shows as two stubs
    if (broke) {
      const mid = (p, q2, t) => p.map((v, k2) => v + (q2[k2] - v) * t);
      set(els.back[i], a.b, mid(a.b, b.b, 0.42)); set(els.front[i].mem, a.f, mid(a.f, b.f, 0.42)); set(els.front[i].o, a.f, mid(a.f, b.f, 0.42)); set(els.front[i].hit, a.f, a.f);
      els.front[i].mem.style.stroke = "var(--rest)"; els.back[i].style.stroke = "var(--rest)";
    } else {
      set(els.back[i], a.b, b.b); set(els.front[i].mem, a.f, b.f); set(els.front[i].o, a.f, b.f); set(els.front[i].hit, a.f, b.f);
      els.front[i].mem.style.stroke = col; els.back[i].style.stroke = col;
    }
    els.front[i].mem.dataset.hot = String(fallAt === null && fr.util > 0.9);
  });
  // cross girders at every joint, and X bracing between the top chords
  const setL = (el, p, q2) => { const A = sp(p), B = sp(q2); el.setAttribute("x1", A[0]); el.setAttribute("y1", A[1]); el.setAttribute("x2", B[0]); el.setAttribute("y2", B[1]); };
  let bi = 0;
  J.forEach((j) => { setL(els.braces[bi++], j.f, j.b); });
  for (let i = g.N + 1; i < g.J.length - 1; i++) { setL(els.braces[bi++], J[i].f, J[i + 1].b); setL(els.braces[bi++], J[i].b, J[i + 1].f); }
  J.forEach((j, i) => { const A = sp(j.f); els.gus[i].setAttribute("cx", A[0]); els.gus[i].setAttribute("cy", A[1]); });
  // the deck: slab top, centre line, and the front edge
  const bot = J.slice(0, g.N + 1).map((j, i) => ({ ...j, i }));
  const poly = (pts) => "M" + pts.map((p) => sp(p).join(" ")).join("L") + "Z";
  const yIn = D.YT - 1.5;
  const slabOf2 = (arr, pc) => {
    if (arr.length < 2) return ["", "", ""];
    const W2 = (j, z, y) => world(j.x, z, y, j.i, pc);
    const top = poly([...arr.map((j) => W2(j, DECK_TOP, yIn)), ...arr.slice().reverse().map((j) => W2(j, DECK_TOP, -yIn))]);
    const fas = poly([...arr.map((j) => W2(j, DECK_TOP, yIn)), ...arr.slice().reverse().map((j) => W2(j, -0.55, yIn))]);
    let ln = "";
    for (let k2 = 0; k2 < arr.length - 1; k2++) {
      const A = W2(arr[k2], DECK_TOP + 0.01, 0), B = W2(arr[k2 + 1], DECK_TOP + 0.01, 0), at2 = (t) => sp(A.map((v, q3) => v + (B[q3] - v) * t)).join(" ");
      ln += "M" + at2(0.1) + "L" + at2(0.4) + "M" + at2(0.6) + "L" + at2(0.9);
    }
    return [top, fas, ln];
  };
  if (f) {
    const L1 = slabOf2(bot.filter((j) => j.x <= breakX), 0), R1 = slabOf2(bot.filter((j) => j.x > breakX), 1);
    els.deck.setAttribute("d", L1[0] + R1[0]); els.fascia.setAttribute("d", L1[1] + R1[1]); els.lanes.setAttribute("d", L1[2] + R1[2]);
  } else {
    const A1 = slabOf2(bot);
    els.deck.setAttribute("d", A1[0]); els.fascia.setAttribute("d", A1[1]); els.lanes.setAttribute("d", A1[2]);
  }
  // vehicles: anything on the span when it goes comes down with it; anything still on the road waits on top
  occG.style.display = f ? "" : "none";
  if (f) { const want = f.e > 0.02 ? "url(#occclip2)" : "url(#occclip)"; if (occG.getAttribute("clip-path") !== want) occG.setAttribute("clip-path", want); }
  cars.forEach((c) => {
    if (!c.el) { c.el = document.createElementNS("http://www.w3.org/2000/svg", "g"); c.el.setAttribute("class", "veh"); }
    if (f && !c.fell && onSpanTons(c) > 0) {
      // it goes with whichever piece most of it is sitting on
      const x0 = c.x + VEH[c.kind].rear, x1 = c.x + VEH[c.kind].front, ov = (a, b) => Math.max(0, Math.min(x1, b) - Math.max(x0, a));
      c.fell = true; c.piece = ov(0, breakX) >= ov(breakX, D.SPAN) ? 0 : 1;
    }
    const host = f && !c.fell ? topG : els.cars;
    if (c.el.parentNode !== host) host.appendChild(c.el);
    c.el.innerHTML = renderVehicle(c, f);
  });
  // splash and snap
  let sh = "";
  if (f) {
    const hits = [[0.6, breakX * 0.5], [0.6, breakX + (D.SPAN - breakX) * 0.5], [1.9, Math.min(4, breakX * 0.3)], [1.9, Math.max(D.SPAN - 4, D.SPAN - (D.SPAN - breakX) * 0.3)]];
    for (const [t0, xm] of hits) {
      const tt = f.t - t0; if (tt < 0 || tt > 2) continue;
      const r = Math.min(1, tt / 1.5), c = sp([D.X0 + xm * D.U, 0, 0.2]);
      sh += '<ellipse class="splash" cx="' + c[0] + '" cy="' + c[1] + '" rx="' + (10 + 60 * r).toFixed(1) + '" ry="' + (4 + 24 * r).toFixed(1) + '" style="opacity:' + (1 - r).toFixed(2) + '"/>';
      if (tt < 1.65) for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2, sp2 = 2 + (i * 7) % 4, vz = 9 + (i * 5) % 6;
        const p = [D.X0 + xm * D.U + Math.cos(ang) * sp2 * tt * D.U, Math.sin(ang) * sp2 * tt * D.U, Math.max(0, (vz * tt - 4.9 * tt * tt) * D.U)];
        const c2 = sp(p); sh += '<circle class="drop" cx="' + c2[0] + '" cy="' + c2[1] + '" r="' + Math.max(0.4, 1.8 - tt * 0.6).toFixed(2) + '" style="opacity:' + clamp(1 - tt / 1.65, 0, 1).toFixed(2) + '"/>';
      }
    }
  }
  splashG.innerHTML = sh;
  if (now - snapAt < 0.5 && snapped >= 0) {
    const m = g.M[snapped], a = J[m.a], b = J[m.b], c = sp(a.f.map((v, k2) => v + (b.f[k2] - v) * 0.45)), r = (now - snapAt) * 40;
    els.snap.innerHTML = '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="' + (3 + r).toFixed(1) + '" class="snapring" style="opacity:' + (1 - (now - snapAt) * 2).toFixed(2) + '"/>';
  } else els.snap.innerHTML = "";
  const tons = cars.reduce((a, c) => a + onSpanTons(c), 0);
  const text = fallAt !== null ? "COLLAPSED" : (cars.length ? Math.round(tons) + " t on the span · " : "empty · ") + "worst member " + Math.round(worst.util * 100) + " %";
  if (readout.textContent !== text) readout.textContent = text;
}
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
  const idle = !touring && !cars.length && fallAt === null && now - snapAt > 1;
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
  const map = { "1": () => doSend("car"), "2": () => doSend("bus"), "3": () => doSend("bdouble"), "4": () => doSend("roadtrain"), "5": () => doSend("haul"), j: doJam, h: () => doKind(kind === "pratt" ? "howe" : "pratt"), r: doFresh, s: () => { slow = !slow; run(); } };
  if (map[ev.key]) { ev.preventDefault(); map[ev.key](); }
});
window.__fig = { freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
solve(); draw(); syncUi(); story();
`;

const CSS = `.fx-stage{position:relative}
.iso-plate{overflow:hidden}
.fx-stage{--rest:var(--anatomy-mid)}
.river{fill:#2c5d8a;opacity:.55}body[data-theme="light"] .river{fill:#8fb8dc;opacity:.7}
.ripple{fill:none;stroke:#9cc4e8;stroke-width:.7;opacity:.5}
.road .iso-fill,.road .iso-shade,.road .iso-top{fill:#3a3a3a}body[data-theme="light"] .road .iso-fill,body[data-theme="light"] .road .iso-top{fill:#8a8a8a}
.mem{stroke-linecap:round;fill:none}
.mem.t-bottom,.mem.t-top,.mem.t-end{stroke-width:3.2}.mem.t-vert,.mem.t-diag{stroke-width:2.2}
.mem.back{opacity:.5}
.mem-o{stroke:#0b0c0e;stroke-linecap:round;opacity:.75}.mem-o.t-bottom,.mem-o.t-top,.mem-o.t-end{stroke-width:5}.mem-o.t-vert,.mem-o.t-diag{stroke-width:3.8}
body[data-theme="light"] .mem-o{stroke:#3a3d42;opacity:.55}
.gus{fill:#5a5e64;stroke:#0b0c0e;stroke-width:.6}body[data-theme="light"] .gus{fill:#8d9298;stroke:#4a4d52}
.lanes{fill:none;stroke:#e9e4c8;stroke-width:1;opacity:.75}
.fascia{fill:#55595f;stroke:#222;stroke-width:.5}body[data-theme="light"] .fascia{fill:#a7abb0;stroke:#777}
.vshadow{fill:#000;opacity:.3}
.veh path{stroke:rgba(0,0,0,.35);stroke-width:.35;stroke-linejoin:round}
.drop{fill:#d9ecff}
.mem[data-hot="true"]{animation:hot .5s infinite alternate}
@keyframes hot{to{stroke-width:4.4}}
.hit{stroke:transparent;stroke-width:12;stroke-linecap:round;cursor:pointer;pointer-events:stroke}
.fronttruss [data-fm]:hover .mem{stroke-dasharray:4 2}
.brace{stroke:#6c7177;stroke-width:1.1}
.deck{fill:#cfd2d5;stroke:var(--anatomy-mid);stroke-width:.6}
body[data-theme="dark"] .deck{fill:#45484d}
.deck-edge{fill:none;stroke:var(--anatomy-mid);stroke-width:1}
.veh .iso-fill,.veh .iso-shade{fill:color-mix(in srgb,var(--paint),#000 25%)}.veh .iso-top{fill:var(--paint)}
.veh .glass .iso-fill,.veh .glass .iso-shade,.veh .glass .iso-top{fill:#9cc4e8}
.veh .trailer .iso-fill,.veh .trailer .iso-shade{fill:#b9bdc2}.veh .trailer .iso-top{fill:#dfe2e5}
.veh .tyre .iso-fill,.veh .tyre .iso-shade,.veh .tyre .iso-top{fill:#222}
.splash{fill:none;stroke:#cfe6ff;stroke-width:2}
.snapring{fill:none;stroke:#ffd36a;stroke-width:2}
.ctl{display:grid;gap:12px;margin:14px 0 6px;font-family:var(--anatomy-mono);font-size:12px;color:var(--anatomy-mid)}
.ctl-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ctl-label{min-width:72px;text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:var(--anatomy-lo)}
.ctl button{font:inherit;color:var(--anatomy-mid);background:transparent;border:1px solid var(--anatomy-lo);border-radius:6px;padding:7px 10px;cursor:pointer;line-height:1.15;text-align:left;min-height:36px}
.ctl button:hover{border-color:var(--anatomy-mid)}
.ctl button[aria-pressed="true"]{color:var(--anatomy-lit);border-color:var(--anatomy-lit)}
.ctl button small{display:block;font-size:10px;color:var(--anatomy-lo)}
.ctl [data-send="haul"],.ctl #fresh{border-color:#ff6a3d;color:#ff6a3d}
.ctl output{min-width:72px;text-align:right;color:var(--anatomy-hi,var(--anatomy-mid))}
.meter{position:relative;flex:1;min-width:110px;height:10px;margin-top:14px;border:1px solid var(--anatomy-lo);border-radius:5px}
.meter .fill{position:absolute;left:0;top:0;bottom:0;border-radius:4px;transition:width .1s;background:var(--anatomy-mid)}
.meter .fill[data-state="ok"]{background:#3ddc84}.meter .fill[data-state="warn"]{background:#ffb347}.meter .fill[data-state="bad"]{background:#ff5a2a}
.mark{position:absolute;top:-14px;bottom:-3px;width:0;border-left:1px dashed #ff6a3d;pointer-events:none}
.mark::after{content:attr(data-label);position:absolute;top:0;left:4px;font-size:10px;white-space:nowrap;color:#ff6a3d}
.key-t{display:inline-block;width:18px;height:3px;border-radius:2px;vertical-align:middle;margin:0 4px 0 8px}
#stats{font-size:12px;color:var(--anatomy-mid);line-height:1.5}#stats b{color:var(--anatomy-hi,var(--anatomy-mid));font-weight:600}
#shot{min-height:3.6em;font-size:12px;line-height:1.4}
@media (max-width:520px){.ctl-label{min-width:52px}.ctl button{padding:7px 8px}.ctl output{min-width:60px}.ctl button small{display:none}}`;

const stageHtml = `<div class="iso-stage fx-stage" tabindex="0" role="group" aria-label="Truss bridge: 1 to 5 send a car, bus, B-double, road train or haul truck; J jams the traffic; H swaps Pratt and Howe; tap a member to cut it">${svg}</div>`;

const CONTROLS = `<div class="ctl" role="group" aria-label="Controls">
  <div class="ctl-row"><span class="ctl-label">Send</span><button type="button" data-send="car">Car<small>1.5 t</small></button><button type="button" data-send="bus">Bus<small>18 t</small></button><button type="button" data-send="bdouble">B-double<small>62.5 t</small></button><button type="button" data-send="roadtrain">Road train<small>120 t</small></button><button type="button" data-send="haul">Haul truck<small>620 t</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Traffic</span><button type="button" id="stream" aria-pressed="false">Stream of cars</button><button type="button" id="jam" aria-pressed="false">Jam on the bridge</button></div>
  <div class="ctl-row"><span class="ctl-label">Truss</span><button type="button" data-kind="pratt" aria-pressed="true">Pratt<small>diagonals in tension</small></button><button type="button" data-kind="howe" aria-pressed="false">Howe<small>diagonals in compression</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Worst</span><div class="meter"><span id="u-fill" class="fill"></span><span class="mark" style="left:${(100 / 120 * 100).toFixed(1)}%" data-label="100 % = it goes"></span></div><output id="u-out">0 %</output></div>
  <div class="ctl-row"><span class="ctl-label">On span</span><div class="meter"><span id="t-fill" class="fill"></span></div><output id="t-out">0 t</output></div>
  <div class="ctl-row"><span class="ctl-label">Forces</span><span id="stats"></span></div>
  <div class="ctl-row"><span class="ctl-label">Key</span><span><span class="key-t" style="background:#ff4a3d"></span>tension<span class="key-t" style="background:#3d8bff"></span>compression · tap a member to cut it</span></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="fresh">New bridge</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
  <div id="shot" aria-live="polite"></div>
</div>`;

const card = k.plateHtml({
  fig: "Fig 19",
  title: "Truss bridge",
  hint: "Tap a member: cut it",
  readout: "",
  keys: [
    { mark: "lit", label: "Member force: red tension, blue compression, brighter = closer to its limit; sag drawn 80× bigger" },
    { mark: "raised", label: "48 m steel truss bridge, abutments, river, and whatever you send over it" },
  ],
  caption: "A truss carries load by turning it into pure push and pull along straight members. Put a load on the deck and the bottom chord stretches (tension), the top chord squashes (compression), and the diagonals near the load share it out to the supports. Steel is as strong in tension as in compression, but a long, thin member in compression buckles well before the steel itself gives up. That's the whole difference between these two: a Pratt truss puts its long diagonals in tension, a Howe puts them in compression, so the same steel carries less. And a simple truss like this has no spare members. Lose any one of them, by overload or by cutting it, and it's a mechanism.",
  body: stageHtml,
});

const other = theme === "light" ? ["index.html", "Dark version"] : ["light.html", "Light version"];
const FOOT = `<p style="font-family:var(--anatomy-mono);font-size:11px;color:var(--anatomy-lo);margin:28px 0 8px;line-height:1.6">A toy, not a bridge design. Real: the stiffness method for a pin-jointed truss, tension and compression, Euler buckling for compression members, Pratt against Howe, and a determinate truss becoming a mechanism. Typical: B-double 62.5 t, triple road train about 120 t, a big loaded mining haul truck about 620 t. Made up: the member sizes, the dead load, the speeds, no impact factor, and the sag drawn 80 times bigger (dead-load sag left out, as if the bridge were cambered).<br>Built with <a href="https://github.com/wheresryan22/anatomy" style="color:inherit">Anatomy</a> by Ryan (MIT). · <a href="${other[0]}" style="color:inherit">${other[1]}</a> · <a href="../" style="color:inherit">More figures</a> · <a href="https://github.com/Dizzyfer/Anatomy/tree/main/truss" style="color:inherit">Source</a></p>`;
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "Truss bridge", theme, body: `<style>${CSS}</style>${card.replace("<figcaption", CONTROLS + "<figcaption")}${FOOT}`, script: kitScript() + LIVE.replace("__DATA__", JSON.stringify(DATA)), width: 700 }));
console.log("wrote", name);
