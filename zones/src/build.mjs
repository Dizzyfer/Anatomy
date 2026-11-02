import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { kitScript } from "../../scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";

const W = 640;
const H = 440;

// Truth (IEC 60079-10-1:2020, as best I can reproduce it): grade of release, degree of dilution and availability of
// ventilation give the zone through Table D.1. EPLs per zone (IEC 60079-14): Zone 0 Ga, Zone 1 Ga/Gb, Zone 2 Ga/Gb/Gc.
// Toy: the dilution rule stands in for Figure C.1 and the envelope sizes for Figure D.1. No distances are claimed.
const TABLE = {
  // [high: good, fair, poor], [medium: good, fair, poor], low (any)
  continuous: { high: ["NH (Zone 0 NE)", "Zone 2 (Zone 0 NE)", "Zone 1 (Zone 0 NE)"], medium: ["Zone 0", "Zone 0 + Zone 2", "Zone 0 + Zone 1"], low: "Zone 0" },
  primary: { high: ["NH (Zone 1 NE)", "Zone 2 (Zone 1 NE)", "Zone 2 (Zone 1 NE)"], medium: ["Zone 1", "Zone 1 + Zone 2", "Zone 1 + Zone 2"], low: "Zone 1 or Zone 0" },
  secondary: { high: ["NH (Zone 2 NE)", "NH (Zone 2 NE)", "Zone 2"], medium: ["Zone 2", "Zone 2", "Zone 2"], low: "Zone 1 and even Zone 0" },
};

const PLATE = { x: -112, y: -76, w: 220, d: 150, r: 8 };
const PLATE_H = 12, FOOT_H = 5;
const PIPE_Y = -22, PIPE_Z = 30;
const SRC = { flange: [-16, PIPE_Y, PIPE_Z], sample: [-62, PIPE_Y, PIPE_Z - 7], vent: [58, -36, 62] };
const TANK = { x: 58, y: -36, r: 17, h: 50 };
const PIT = { x: -58, y: 18, w: 46, d: 14 };
const LIGHT = [62, 42, 52];
const ROOM = { x: -92, y: -64, w: 180, d: 124, h: 88 };

const P = k.fitProjection([...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [ROOM.x, ROOM.y, ROOM.h + 4]], W, H, { pad: 16, azimuth: 45 });
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
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(Dt(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // the pit: a dark recess with its far walls showing
  const p = PIT, c = (x, y, z) => at([x, y, z]);
  const pts = (arr) => arr.map((q) => c(...q).map((n) => n.toFixed(1)).join(" ")).join("L");
  out.push(`<path class="pit" d="M${pts([[p.x, p.y, 0], [p.x + p.w, p.y, 0], [p.x + p.w, p.y + p.d, 0], [p.x, p.y + p.d, 0]])}Z"/>`);
  out.push(`<path class="pit-wall" d="M${pts([[p.x, p.y, 0], [p.x + p.w, p.y, 0], [p.x + p.w, p.y, -8], [p.x, p.y, -8]])}Z"/>`);
  out.push(`<path class="pit-wall2" d="M${pts([[p.x, p.y, 0], [p.x, p.y + p.d, 0], [p.x, p.y + p.d, -8], [p.x, p.y, -8]])}Z"/>`);
  out.push(k.faceTextSvg(k.topMatrix([p.x + 2, p.y + p.d + 2.5], 0.1, P, "x"), "PIT", { size: 4, tone: "lo" }));
  return out.join("");
}

// the room: back and left walls, a fan, and a roof that comes and goes; shown for shelter and indoors
function roomBack() {
  const out = [];
  out.push(`<g data-part="walls">`);
  out.push(S(slab({ x: ROOM.x, y: ROOM.y, w: ROOM.w, d: 2 }, 0, ROOM.h, 0.3, 0.1), { tone: "lo" }));
  out.push(S(slab({ x: ROOM.x, y: ROOM.y + 2, w: 2, d: ROOM.d - 2 }, 0, ROOM.h, 0.3, 0.1), { tone: "lo" }));
  // the extraction fan in the back wall
  const fx = 20, fz = 66, m = k.sideMatrix([fx - 8, ROOM.y + 2.02], fz + 8, P, "left");
  out.push(`<g data-part="fan" transform="${m}"><rect x="0" y="0" width="16" height="16" rx="1" class="fan-box"/><g class="fan-blades" style="transform-origin:8px 8px"><path d="M8 8L8 1.5Q11 3 8 8L14.5 8Q13 11 8 8L8 14.5Q5 13 8 8L1.5 8Q3 5 8 8Z" class="fan-b"/></g></g>`);
  out.push(`</g>`);
  return out.join("");
}
function roomFront() {
  const out = [`<g data-part="roof">`];
  for (const [x, y] of [[ROOM.x + ROOM.w - 2, ROOM.y + ROOM.d - 2], [ROOM.x + ROOM.w - 2, ROOM.y], [ROOM.x, ROOM.y + ROOM.d - 2]]) out.push(S(slab({ x, y, w: 2, d: 2 }, 0, ROOM.h, 0.2, 0), { tone: "mid" }));
  out.push(`<g class="roofslab">${S(slab({ x: ROOM.x, y: ROOM.y, w: ROOM.w, d: ROOM.d }, ROOM.h, 2, 0.4, 0.2), { tone: "lo" })}</g>`);
  out.push(`</g>`);
  // the front walls, cut away to a dashed outline
  const c = (x, y, z) => at([x, y, z]).map((n) => n.toFixed(1)).join(" ");
  const x1 = ROOM.x + ROOM.w, y1 = ROOM.y + ROOM.d;
  out.push(`<path data-part="front-walls" class="cutwall" d="M${c(x1, ROOM.y, ROOM.h)}L${c(x1, y1, ROOM.h)}L${c(ROOM.x, y1, ROOM.h)}M${c(x1, y1, 0)}L${c(x1, y1, ROOM.h)}"/>`);
  return out.join("");
}

function plant() {
  const out = [];
  // pipe supports and the pipe
  for (const x of [-84, -40, 12]) out.push(S(slab({ x: x - 2, y: PIPE_Y - 6, w: 4, d: 12 }, 0, PIPE_Z - 3, 0.4, 0.2), { tone: "mid" }));
  const pipe = (x0, x1) => { const a = at([x0, PIPE_Y, PIPE_Z]), b = at([x1, PIPE_Y, PIPE_Z]); return `<path class="pipe-o" d="M${a.join(" ")}L${b.join(" ")}"/><path class="pipe" d="M${a.join(" ")}L${b.join(" ")}"/>`; };
  out.push(pipe(-92, 30));
  // the riser into the tank
  out.push(`<path class="pipe-o" d="${k.pathOf([[30, PIPE_Y, PIPE_Z], [41, PIPE_Y, PIPE_Z], [41, -36, PIPE_Z]].map(at))}"/><path class="pipe" d="${k.pathOf([[30, PIPE_Y, PIPE_Z], [41, PIPE_Y, PIPE_Z], [41, -36, PIPE_Z]].map(at))}"/>`);
  // the flange
  out.push(`<g class="flange">${S(slab({ x: SRC.flange[0] - 1.6, y: PIPE_Y - 5.5, w: 3.2, d: 11 }, PIPE_Z - 5.5, 11, 4, 0.4), { tone: "hi" })}</g>`);
  // the sample point: a little valve and a drain stub hanging under the pipe
  const s = SRC.sample;
  out.push(S(k.cylinder(s[0], PIPE_Y, 1.2, s[2] + 1, PIPE_Z - s[2] - 3, P, 12), { tone: "mid" }));
  out.push(`<g class="valve">${S(slab({ x: s[0] - 3, y: PIPE_Y - 3, w: 6, d: 6 }, s[2] + 1, 3.5, 0.8, 0.3), { tone: "hi" })}</g>`);
  out.push(S(k.cylinder(s[0], PIPE_Y, 0.9, s[2] - 4, 5, P, 10), { tone: "mid" }));
  // the tank and its vent
  out.push(`<path class="iso-halo" d="${k.haloOf({ x: TANK.x - TANK.r - 2, y: TANK.y - TANK.r - 2, w: TANK.r * 2 + 4, d: TANK.r * 2 + 4, r: TANK.r }, 0, 0.1, P)}"/>`);
  out.push(`<g data-part="tank" class="tank">${S(k.cylinder(TANK.x, TANK.y, TANK.r, 0, TANK.h, P, 40, 1), { tone: "hi", inner: L(k.sideArc(TANK.x, TANK.y, TANK.r, TANK.h * 0.55, P, 30), { tone: "faint" }) })}</g>`);
  out.push(S(k.cylinder(SRC.vent[0], SRC.vent[1], 1.6, TANK.h, SRC.vent[2] - TANK.h - 2, P, 12), { tone: "mid" }));
  out.push(S(k.cylinder(SRC.vent[0], SRC.vent[1], 3.2, SRC.vent[2] - 2, 2, P, 16, 0.4), { tone: "hi" }));
  // the light on a pole
  out.push(S(k.cylinder(LIGHT[0], LIGHT[1], 3.5, 0, 1.5, P, 16), { tone: "mid" }));
  out.push(S(k.cylinder(LIGHT[0], LIGHT[1], 0.9, 1.5, LIGHT[2] - 1.5, P, 10), { tone: "mid" }));
  out.push(`<g class="lum">${S(slab({ x: LIGHT[0] - 6, y: LIGHT[1] - 3, w: 12, d: 6 }, LIGHT[2], 3, 1, 0.4), { tone: "hi" })}</g>`);
  return out.join("");
}

const roomHull = (() => {
  const pts = k.boxCorners({ x: ROOM.x, y: ROOM.y, w: ROOM.w, d: ROOM.d }, 0, ROOM.h).map(at);
  const hull = []; let start = pts.reduce((a, p) => (p[0] < a[0] ? p : a)), cur = start;
  do { hull.push(cur); let next = pts[0] === cur ? pts[1] : pts[0]; for (const p of pts) { if (p === cur) continue; const cr = (next[0] - cur[0]) * (p[1] - cur[1]) - (next[1] - cur[1]) * (p[0] - cur[0]); if (cr < 0) next = p; } cur = next; } while (cur !== start && hull.length < 9);
  return "M" + hull.map((p) => p[0].toFixed(1) + " " + p[1].toFixed(1)).join("L") + "Z";
})();
const svg = k.figureSvg({
  width: W, height: H,
  label: "A small process area: a pipe on supports with a flange and a sample point, a fixed-roof tank with a vent, a pit in the floor, and a light on a pole. The hazardous zones around whichever release you pick are drawn as coloured envelopes.",
  body: [plate(), roomBack(), plant(), `<clipPath id="room-clip"><path d="${roomHull}"/></clipPath><g data-part="zones"></g>`, roomFront(), `<g data-part="labels"></g>`],
});

const DATA = { W, H, P, TABLE, SRC, TANK, PIT, LIGHT, ROOM, roomHull };

const LIVE = `
const D = __DATA__;
const { P, TABLE } = D;
const stage = document.querySelector(".fx-stage");
const q = (n) => stage.querySelector('[data-part="' + n + '"]');
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lg = Math.log10;

let source = "flange", heavy = false, size = 0.35, where = "open", avail = "good";
let frame = 0, last = 0, now = 0, visible = false, touring = true, tourClock = 0, tourStep = -1, nextAt = 0, lastShot = "";
const GRADE = { flange: "secondary", sample: "primary", vent: "primary" };
const AV = ["good", "fair", "poor"];
// stand-in for Figure C.1: more air movement and a smaller release both push toward high dilution
const UW = { open: 0.5, shelter: 0.15, room: 0.1 };
const relChar = () => Math.pow(10, -5 + 4 * size); // Wg/(ρg·k·LFL), m³/s, toy range
function dilution() {
  const s = lg(UW[where]) - 0.5 * lg(relChar());
  return s > 1.2 ? "high" : s > 0.05 ? "medium" : "low";
}
function zoneText() {
  const row = TABLE[GRADE[source]], dil = dilution();
  return dil === "low" ? row.low : row[dil][AV.indexOf(avail)];
}
// the envelope: toy sizes, bigger with a bigger release and less air movement
function envelope() {
  const zt = zoneText(), dil = dilution();
  const base = clamp(7 + 52 * Math.sqrt(relChar() / 0.1) * Math.sqrt(0.5 / UW[where]), 6, 78);
  const z = [];
  if (zt.startsWith("NH")) return { list: [], ne: true, txt: zt };
  if (zt === "Zone 2" || zt.startsWith("Zone 2 (")) z.push([2, base]);
  else if (zt === "Zone 1") z.push([1, base]);
  else if (zt.startsWith("Zone 1 (")) z.push([1, base]);
  else if (zt === "Zone 0") z.push([0, base]);
  else if (zt === "Zone 1 + Zone 2") z.push([1, base], [2, base * 1.7]);
  else if (zt === "Zone 0 + Zone 2") z.push([0, base], [2, base * 1.7]);
  else if (zt === "Zone 0 + Zone 1") z.push([0, base], [1, base * 1.7]);
  else if (zt === "Zone 1 or Zone 0") z.push([0, base * 0.45], [1, base]);
  else if (zt === "Zone 1 and even Zone 0") z.push([0, base * 0.35], [1, base]);
  return { list: z, ne: zt.includes("NE") && !zt.startsWith("NH"), txt: zt };
}

const COL = ["z0", "z1", "z2"];
const pt = (p) => { const a = iso(p, P); return a[0].toFixed(1) + " " + a[1].toFixed(1); };
const K = (() => { const a = iso([0, 0, 0], P), b = iso([1, 0, 0], P); return Math.hypot(b[0] - a[0], b[1] - a[1]) * Math.SQRT2 / Math.sqrt(1 + 0) ; })();
const rPx = (r) => { const a = iso([0, 0, 0], P), b = iso([0, 0, r], P); return Math.abs(b[1] - a[1]) / Math.cos(Math.PI / 6); };
function ellipse(cx, cy, r, z) { let d = ""; for (let i = 0; i <= 48; i++) { const a = (i / 48) * Math.PI * 2; d += (i ? "L" : "M") + pt([cx + r * Math.cos(a), cy + r * Math.sin(a), z]); } return d + "Z"; }
// the outline of a vertical cylinder (two ellipses joined at their sides)
function cylinderPath(cx, cy, r, z0, z1) {
  const top = iso([cx, cy, z1], P), bot = iso([cx, cy, z0], P);
  const ex = iso([cx + r, cy, z0], P), ey = iso([cx, cy + r, z0], P);
 const w = Math.hypot(ex[0] - bot[0], ey[0] - bot[0]);
  return [ellipse(cx, cy, r, z1), ellipse(cx, cy, r, z0), "M" + (bot[0] - w).toFixed(1) + " " + bot[1].toFixed(1) + "L" + (top[0] - w).toFixed(1) + " " + top[1].toFixed(1) + "L" + (top[0] + w).toFixed(1) + " " + top[1].toFixed(1) + "L" + (bot[0] + w).toFixed(1) + " " + bot[1].toFixed(1) + "Z"];
}
function shape(src, r) {
  const c = iso(src, P), R = rPx(r);
  const d = ["M" + (c[0] - R).toFixed(1) + " " + c[1].toFixed(1) + "a" + R.toFixed(1) + " " + R.toFixed(1) + " 0 1 0 " + (2 * R).toFixed(1) + " 0a" + R.toFixed(1) + " " + R.toFixed(1) + " 0 1 0 " + (-2 * R).toFixed(1) + " 0Z"];
  if (heavy) {
    // heavier than air: it slumps down to the ground and spreads
    d.push(...cylinderPath(src[0], src[1], r, 0, src[2]));
    d.push(...cylinderPath(src[0], src[1], r * 1.5, 0, Math.min(6, r * 0.3)));
  } else {
    // lighter than air: it rises
    d.push(...cylinderPath(src[0], src[1], r * 0.8, src[2], src[2] + r * 1.2));
  }
  return d;
}
// which zone is this point in (for the light)
function zoneAt(p, env, src) {
  let best = 9;
  // low dilution indoors: the gas builds up through the whole room
  if (where === "room" && dilution() === "low" && env.list.length) { const r = D.ROOM; if (p[0] > r.x && p[0] < r.x + r.w && p[1] > r.y && p[1] < r.y + r.d && p[2] < r.h) best = Math.max(...env.list.map((e) => e[0])); }
  for (const [z, r] of env.list) {
    const dx = p[0] - src[0], dy = p[1] - src[1], dz = p[2] - src[2], h = Math.hypot(dx, dy);
    let inside = Math.hypot(h, dz) < r;
    if (heavy) inside = inside || (h < r && p[2] < src[2]) || (h < r * 1.5 && p[2] < Math.min(6, r * 0.3));
    else inside = inside || (h < r * 0.8 && p[2] > src[2] && p[2] < src[2] + r * 1.2);
    if (inside) best = Math.min(best, z);
  }
  return best;
}
const zonesG = q("zones"), labelsG = q("labels"), tankG = q("tank"), walls = q("walls"), roof = q("roof"), frontW = q("front-walls"), fan = q("fan");
const ui = {
  src: [...document.querySelectorAll("[data-src]")], gas: [...document.querySelectorAll("[data-gas]")], where: [...document.querySelectorAll("[data-where]")], av: [...document.querySelectorAll("[data-av]")],
  size: document.querySelector("#size"), sizeOut: document.querySelector("#size-out"), cells: [...document.querySelectorAll("[data-cell]")],
  stats: document.querySelector("#stats"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"),
};
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };
const EPL = ["Ga", "Ga or Gb", "Ga, Gb or Gc"];

function draw() {
  const env = envelope(), src = D.SRC[source], dil = dilution(), grade = GRADE[source];
  // rooms and roofs
  walls.style.display = where === "open" ? "none" : "";
  roof.style.display = where === "open" ? "none" : "";
  frontW.style.display = where === "room" ? "" : "none";
  fan.style.display = where === "room" ? "" : "none";
  fan.querySelector(".fan-blades").style.transform = "rotate(" + ((now * (avail === "poor" ? 0 : 240)) % 360).toFixed(0) + "deg)";
  // the zones, outermost first
  let html = "";
  const sorted = [...env.list].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  if (where === "room" && dil === "low" && sorted.length) html += '<g class="zone ' + COL[sorted[0][0]] + '"><path d="' + D.roomHull + '"/></g>';
  for (const [z, r] of sorted) html += '<g class="zone ' + COL[z] + '">' + shape(src, r).map((d) => '<path d="' + d + '"/>').join("") + "</g>";
  // the pit: heavier-than-air gas pools in it, so it's usually taken one zone worse
  let pitZone = 9;
  if (heavy && env.list.length) {
    const outer = env.list.reduce((a, b) => (b[1] > a[1] ? b : a));
    const px = clamp(src[0], D.PIT.x, D.PIT.x + D.PIT.w), py = clamp(src[1], D.PIT.y, D.PIT.y + D.PIT.d);
    // gas pooling in a pit inside the envelope: usually taken as Zone 1 (common practice, not the table)
    if (Math.hypot(px - src[0], py - src[1]) < outer[1] * 1.5) pitZone = Math.min(1, outer[0]);
    if (pitZone < 9) { const p = D.PIT; html += '<g class="zone ' + COL[pitZone] + ' pitz"><path d="M' + [[p.x, p.y, 0], [p.x + p.w, p.y, 0], [p.x + p.w, p.y + p.d, 0], [p.x, p.y + p.d, 0]].map(pt).join("L") + 'Z"/></g>'; }
  }
  if (env.ne) { const c = iso(src, P); html += '<circle cx="' + c[0].toFixed(1) + '" cy="' + c[1].toFixed(1) + '" r="5" class="ne"/>'; }
  if (source === "vent") { tankG.dataset.z0 = "true"; } else tankG.dataset.z0 = "false";
  zonesG.innerHTML = html;
  if (where === "room") zonesG.setAttribute("clip-path", "url(#room-clip)"); else zonesG.removeAttribute("clip-path");
  // labels
  let lab = "";
  for (const [z, r] of sorted) { const c = iso([src[0], src[1], src[2]], P), R = rPx(r); lab += '<text class="zl ' + COL[z] + '" x="' + (c[0] + R * 0.72).toFixed(1) + '" y="' + (c[1] - R * 0.72).toFixed(1) + '">Zone ' + z + "</text>"; }
  if (env.ne) { const c = iso(src, P); lab += '<text class="zl ne-t" x="' + (c[0] + 8).toFixed(1) + '" y="' + (c[1] - 6).toFixed(1) + '">NE</text>'; }
  if (source === "vent") { const c = iso([D.TANK.x, D.TANK.y, D.TANK.h * 0.5], P); lab += '<text class="zl z0" x="' + c[0].toFixed(1) + '" y="' + c[1].toFixed(1) + '" text-anchor="middle">Zone 0 inside</text>'; }
  if (pitZone < 9) { const c = iso([D.PIT.x + D.PIT.w / 2, D.PIT.y + D.PIT.d / 2, 0], P); lab += '<text class="zl ' + COL[pitZone] + '" x="' + c[0].toFixed(1) + '" y="' + (c[1] + 3).toFixed(1) + '" text-anchor="middle">pit: Zone ' + pitZone + "</text>"; }
  const lz = zoneAt(D.LIGHT, env, src), lc = iso([D.LIGHT[0], D.LIGHT[1], D.LIGHT[2] + 6], P);
  lab += '<text class="zl light-t' + (lz < 9 ? " need" : "") + '" x="' + lc[0].toFixed(1) + '" y="' + lc[1].toFixed(1) + '" text-anchor="middle">' + (lz < 9 ? "light: needs " + EPL[lz] : "light: ordinary is fine") + "</text>";
  labelsG.innerHTML = lab;
  // the table
  ui.cells.forEach((c) => { const [g, d2, a] = c.dataset.cell.split("-"); c.dataset.on = String(g === grade && d2 === dil && (dil === "low" || a === avail)); });
  const text = grade + " · " + dil + " dilution · " + avail + " → " + env.txt;
  if (readout.textContent !== text) readout.textContent = text;
  ui.stats.innerHTML = "grade <b>" + grade + "</b> · dilution <b>" + dil + "</b> · availability <b>" + avail + "</b> → <b>" + env.txt + "</b> · the light needs <b>" + (lz < 9 ? EPL[lz] : "nothing special") + "</b>";
}

function syncUi() {
  ui.src.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.src === source)));
  ui.gas.forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.gas === "heavy") === heavy)));
  ui.where.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.where === where)));
  ui.av.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.av === avail)));
  ui.size.value = Math.round(size * 100); ui.sizeOut.textContent = size < 0.25 ? "pinhole" : size < 0.55 ? "small" : size < 0.8 ? "medium" : "large";
  ui.tour.setAttribute("aria-pressed", String(touring));
}

function story() {
  const env = envelope(), dil = dilution(), grade = GRADE[source];
  const g = { secondary: "A flange is a secondary release: it only leaks when something goes wrong, and not for long.", primary: source === "vent" ? "The tank's vapour space is Zone 0 (gas there all the time), and the vent breathing out is a primary release: it happens in normal operation." : "A sample point is a primary release: it lets gas out every time someone takes a sample." }[grade];
  let t = g + " ";
  if (env.txt.startsWith("NH")) t += "With high dilution and that availability, the cloud is so small it's a zone of negligible extent: in practice, non-hazardous.";
  else if (dil === "low") t += "Low dilution: the gas builds up faster than the air can carry it off, so the zone grows and goes up a grade (" + env.txt + ")" + (where === "room" ? ", and indoors it fills the room" : "") + ". Fix the ventilation, not the paperwork.";
  else if (env.txt.includes("+")) t += "Medium dilution, but the ventilation's only " + avail + ", so there's an outer zone for when it isn't working: " + env.txt + ".";
  else t += dil[0].toUpperCase() + dil.slice(1) + " dilution, " + avail + " availability: " + env.txt + ".";
  if (heavy) t += " Heavier than air, so it slumps and spreads along the ground" + (envelope().list.length ? ", and the pit collects it." : ".");
  say(t);
}

const TOUR = [
  { source: "flange", heavy: false, size: 0.2, where: "open", avail: "good" },
  { source: "flange", heavy: false, size: 0.55, where: "open", avail: "good" },
  { source: "flange", heavy: false, size: 0.55, where: "shelter", avail: "good" },
  { source: "flange", heavy: false, size: 0.75, where: "room", avail: "good" },
  { source: "sample", heavy: false, size: 0.5, where: "room", avail: "fair" },
  { source: "sample", heavy: true, size: 0.55, where: "open", avail: "good" },
  { source: "vent", heavy: false, size: 0.5, where: "open", avail: "poor" },
];
function tick(t) {
  const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
  last = t; now += dt;
  if (touring) { tourClock += dt; if (tourClock >= nextAt) { tourStep = (tourStep + 1) % TOUR.length; Object.assign(globalThis, {}); const s = TOUR[tourStep]; source = s.source; heavy = s.heavy; size = s.size; where = s.where; avail = s.avail; nextAt = tourClock + 5; } }
  draw(); syncUi(); story();
  frame = visible && (touring || where === "room") ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const guard = (fn) => (...a) => { touring = false; fn(...a); draw(); syncUi(); story(); run(); };
const setSrc = guard((v) => { source = v; });
const setGas = guard((v) => { heavy = v; });
const setWhere = guard((v) => { where = v; });
const setAv = guard((v) => { avail = v; });
const setSize = guard((v) => { size = v; });
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;
ui.src.forEach((b) => b.addEventListener("click", () => setSrc(b.dataset.src)));
ui.gas.forEach((b) => b.addEventListener("click", () => setGas(b.dataset.gas === "heavy")));
ui.where.forEach((b) => b.addEventListener("click", () => setWhere(b.dataset.where)));
ui.av.forEach((b) => b.addEventListener("click", () => setAv(b.dataset.av)));
ui.size.addEventListener("input", () => setSize(+ui.size.value / 100));
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; tourClock = 0; nextAt = 0; } syncUi(); run(); });
stage.addEventListener("click", () => setSrc(source === "flange" ? "sample" : source === "sample" ? "vent" : "flange"));
stage.addEventListener("keydown", (ev) => {
  const map = { " ": () => setSrc(source === "flange" ? "sample" : source === "sample" ? "vent" : "flange"), g: () => setGas(!heavy), w: () => setWhere(where === "open" ? "shelter" : where === "shelter" ? "room" : "open"), a: () => setAv(AV[(AV.indexOf(avail) + 1) % 3]), ArrowUp: () => setSize(clamp(size + 0.05, 0, 1)), ArrowDown: () => setSize(clamp(size - 0.05, 0, 1)) };
  if (map[ev.key]) { ev.preventDefault(); map[ev.key](); }
});
window.__fig = { freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
draw(); syncUi(); story();
`;

const td = (g, d, a, txt) => `<td data-cell="${g}-${d}-${a}" data-on="false">${txt}</td>`;
const rowHtml = (g, label) => {
  const r = TABLE[g];
  return `<tr><th>${label}</th>${r.high.map((t, i) => td(g, "high", ["good", "fair", "poor"][i], t)).join("")}${r.medium.map((t, i) => td(g, "medium", ["good", "fair", "poor"][i], t)).join("")}${td(g, "low", "any", r.low)}</tr>`;
};
const TABLE_HTML = `<div class="tbl-wrap"><table class="tbl">
  <thead><tr><th rowspan="2">Grade</th><th colspan="3">High dilution</th><th colspan="3">Medium dilution</th><th>Low</th></tr>
  <tr><th>good</th><th>fair</th><th>poor</th><th>good</th><th>fair</th><th>poor</th><th>any</th></tr></thead>
  <tbody>${rowHtml("continuous", "Continuous")}${rowHtml("primary", "Primary")}${rowHtml("secondary", "Secondary")}</tbody>
</table><div class="tbl-note">After IEC 60079-10-1 Table D.1. NE = negligible extent; NH = non-hazardous. "+" = surrounded by.</div></div>`;

const CSS = `.fx-stage{position:relative;cursor:pointer}
.iso-plate{overflow:hidden}
.pit{fill:#111;opacity:.75}.pit-wall,.pit-wall2{fill:#2a2a2a}
body[data-theme="light"] .pit{fill:#6a6a6a;opacity:.5}body[data-theme="light"] .pit-wall,body[data-theme="light"] .pit-wall2{fill:#8a8a8a}
.pipe{fill:none;stroke:#9aa4ad;stroke-width:4.2;stroke-linecap:round;stroke-linejoin:round}
.pipe-o{fill:none;stroke:var(--anatomy-mid);stroke-width:5.4;stroke-linecap:round;stroke-linejoin:round}
.flange .iso-fill,.flange .iso-shade,.flange .iso-top{fill:#9aa4ad}
.valve .iso-fill,.valve .iso-shade,.valve .iso-top{fill:#c0392b}
.tank[data-z0="true"] .iso-fill,.tank[data-z0="true"] .iso-shade,.tank[data-z0="true"] .iso-top{fill:color-mix(in srgb,var(--anatomy-face,#ddd),#e53935 45%)}
.lum .iso-fill,.lum .iso-shade,.lum .iso-top{fill:#e8e2c8}
.roofslab{opacity:.5}
.cutwall{fill:none;stroke:var(--anatomy-lo);stroke-width:.8;stroke-dasharray:4 3}
.fan-box{fill:var(--anatomy-paper);stroke:var(--anatomy-mid);stroke-width:.4}.fan-b{fill:var(--anatomy-mid)}
.zone path{fill-rule:nonzero}
.zone{opacity:.32}
.zone.z0 path{fill:#e53935;stroke:#e53935}.zone.z1 path{fill:#fb8c00;stroke:#fb8c00}.zone.z2 path{fill:#fdd835;stroke:#c9a800}
.zone path{stroke-width:0}
.pitz{opacity:.6}
.ne{fill:none;stroke:#8bc34a;stroke-width:1;stroke-dasharray:2 2}
.zl{font-family:var(--anatomy-mono);font-size:8px;font-weight:600;paint-order:stroke;stroke:var(--anatomy-paper);stroke-width:2.5px}
.zl.z0{fill:#e53935}.zl.z1{fill:#fb8c00}.zl.z2{fill:#c9a800}.zl.ne-t{fill:#8bc34a}
body[data-theme="dark"] .zl.z2{fill:#fdd835}
.zl.light-t{fill:var(--anatomy-mid);font-weight:400}.zl.light-t.need{fill:#ff6a3d;font-weight:600}
.ctl{display:grid;gap:12px;margin:14px 0 6px;font-family:var(--anatomy-mono);font-size:12px;color:var(--anatomy-mid)}
.ctl-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ctl-label{min-width:72px;text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:var(--anatomy-lo)}
.ctl button{font:inherit;color:var(--anatomy-mid);background:transparent;border:1px solid var(--anatomy-lo);border-radius:6px;padding:7px 10px;cursor:pointer;line-height:1.15;text-align:left;min-height:36px}
.ctl button:hover{border-color:var(--anatomy-mid)}
.ctl button[aria-pressed="true"]{color:var(--anatomy-lit);border-color:var(--anatomy-lit)}
.ctl button small{display:block;font-size:10px;color:var(--anatomy-lo)}
.slide{position:relative;flex:1;min-width:110px}
.slide input{width:100%;accent-color:var(--anatomy-lit);margin:0}
.ctl output{min-width:72px;text-align:right;color:var(--anatomy-hi,var(--anatomy-mid))}
.tbl-wrap{overflow-x:auto}
.tbl{border-collapse:collapse;font-size:10.5px;width:100%;min-width:560px}
.tbl th,.tbl td{border:1px solid var(--anatomy-lo);padding:4px 5px;text-align:center;font-weight:400;color:var(--anatomy-mid)}
.tbl thead th{color:var(--anatomy-lo);text-transform:uppercase;letter-spacing:.05em;font-size:9.5px}
.tbl tbody th{text-align:left;color:var(--anatomy-lo)}
.tbl td[data-on="true"]{background:var(--anatomy-lit);color:var(--anatomy-paper);font-weight:600}
.tbl-note{font-size:10px;color:var(--anatomy-lo);margin-top:4px}
#stats{font-size:12px;color:var(--anatomy-mid);line-height:1.5}#stats b{color:var(--anatomy-hi,var(--anatomy-mid));font-weight:600}
#shot{min-height:3.6em;font-size:12px;line-height:1.4}
@media (max-width:520px){.ctl-label{min-width:52px}.ctl button{padding:7px 8px}.ctl output{min-width:60px}.ctl button small{display:none}}`;

const stageHtml = `<div class="iso-stage fx-stage" tabindex="0" role="group" aria-label="Zone extents: space cycles the release source, G the gas, W where it is, A the ventilation availability, up and down the leak size">${svg}</div>`;

const CONTROLS = `<div class="ctl" role="group" aria-label="Controls">
  <div class="ctl-row"><span class="ctl-label">Release</span><button type="button" data-src="flange" aria-pressed="true">Flange<small>secondary</small></button><button type="button" data-src="sample" aria-pressed="false">Sample point<small>primary</small></button><button type="button" data-src="vent" aria-pressed="false">Tank vent<small>Zone 0 inside, primary vent</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Gas</span><button type="button" data-gas="light" aria-pressed="true">Lighter than air<small>natural gas</small></button><button type="button" data-gas="heavy" aria-pressed="false">Heavier than air<small>LPG</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Leak size</span><div class="slide"><input id="size" type="range" min="0" max="100" step="1" value="35" aria-label="Leak size"></div><output id="size-out">small</output></div>
  <div class="ctl-row"><span class="ctl-label">Where</span><button type="button" data-where="open" aria-pressed="true">Open air</button><button type="button" data-where="shelter" aria-pressed="false">Under a shelter</button><button type="button" data-where="room" aria-pressed="false">Indoors<small>extraction fan</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Availability</span><button type="button" data-av="good" aria-pressed="true">Good<small>always there</small></button><button type="button" data-av="fair" aria-pressed="false">Fair<small>usually there</small></button><button type="button" data-av="poor" aria-pressed="false">Poor<small>don't count on it</small></button></div>
  ${TABLE_HTML}
  <div class="ctl-row"><span class="ctl-label">Result</span><span id="stats"></span></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
  <div id="shot" aria-live="polite"></div>
</div>`;

const card = k.plateHtml({
  fig: "Fig 15",
  title: "Hazardous area zones",
  hint: "Tap: next release",
  readout: "",
  keys: [
    { mark: "lit", label: "Zone 0 red, Zone 1 orange, Zone 2 yellow; NE = negligible extent" },
    { mark: "raised", label: "Pipe with a flange and a sample point, a tank with a vent, a pit, a light on a pole" },
  ],
  caption: "A zone is a guess at how often there'll be a flammable cloud somewhere, and it comes from three things. The grade of release: continuous (all the time), primary (in normal operation) or secondary (only when something goes wrong). The degree of dilution: how fast the air carries the gas off compared with how fast it comes out. And the availability of that ventilation: good, fair or poor. Put them through the table and you get the zone; the size of the cloud gives the extent. Heavier-than-air gas slumps and collects in pits. And the equipment you can put there follows the zone: Ga in Zone 0, Gb or better in Zone 1, Gc or better in Zone 2.",
  body: stageHtml,
});

const other = theme === "light" ? ["index.html", "Dark version"] : ["light.html", "Light version"];
const FOOT = `<p style="font-family:var(--anatomy-mono);font-size:11px;color:var(--anatomy-lo);margin:28px 0 8px;line-height:1.6">A toy, not a classification. Real: the grade, dilution and availability method and the zone table after IEC 60079-10-1:2020 Table D.1 (check it against your copy), and the zone-to-EPL rule from IEC 60079-14. Made up: how dilution is worked out (a stand-in for Figure C.1), the envelope sizes and shapes (a stand-in for Figure D.1, no distances claimed), and the pit rule (common practice, not the table). Do a real calc.<br>Built with <a href="https://github.com/wheresryan22/anatomy" style="color:inherit">Anatomy</a> by Ryan (MIT). · <a href="${other[0]}" style="color:inherit">${other[1]}</a> · <a href="../" style="color:inherit">More figures</a> · <a href="https://github.com/Dizzyfer/Anatomy/tree/main/zones" style="color:inherit">Source</a></p>`;
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "Hazardous area zones", theme, body: `<style>${CSS}</style>${card.replace("<figcaption", CONTROLS + "<figcaption")}${FOOT}`, script: kitScript() + LIVE.replace("__DATA__", JSON.stringify(DATA)), width: 700 }));
console.log("wrote", name);
