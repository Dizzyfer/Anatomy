import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { engineScript, stageHtml, pageMk2, footHtml } from "../../mk2/shell.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const W = 960, H = 600;

// Truth (IEC 60079-10-1:2020, as best I can reproduce it): grade of release, degree of dilution and availability of
// ventilation give the zone through Table D.1. EPLs per zone (IEC 60079-14): Zone 0 Ga, Zone 1 Ga/Gb, Zone 2 Ga/Gb/Gc.
// Toy: the dilution rule stands in for Figure C.1 and the envelope sizes for Figure D.1. No distances are claimed.
const TABLE = {
  // [high: good, fair, poor], [medium: good, fair, poor], low (any)
  continuous: { high: ["NH (Zone 0 NE)", "Zone 2 (Zone 0 NE)", "Zone 1 (Zone 0 NE)"], medium: ["Zone 0", "Zone 0 + Zone 2", "Zone 0 + Zone 1"], low: "Zone 0" },
  primary: { high: ["NH (Zone 1 NE)", "Zone 2 (Zone 1 NE)", "Zone 2 (Zone 1 NE)"], medium: ["Zone 1", "Zone 1 + Zone 2", "Zone 1 + Zone 2"], low: "Zone 1 or Zone 0" },
  secondary: { high: ["NH (Zone 2 NE)", "NH (Zone 2 NE)", "Zone 2"], medium: ["Zone 2", "Zone 2", "Zone 2"], low: "Zone 1 and even Zone 0" },
};
const PIPE_Y = -22, PIPE_Z = 30;
const SRC = { flange: [-16, PIPE_Y, PIPE_Z], sample: [-62, PIPE_Y, PIPE_Z - 7], vent: [58, -36, 62] };
const TANK = { x: 58, y: -36, r: 17, h: 50 };
const PIT = { x: -58, y: 18, w: 46, d: 14 };
const LIGHT = [62, 42, 52];
const ROOM = { x: -92, y: -64, w: 180, d: 124, h: 88 };
const PLATE = { x: -112, y: -76, w: 220, d: 150, r: 8 };
const P = k.fitProjection([...k.boxCorners(PLATE, -0.8, 0), [-92, -64, 92], [88, -64, 92], [-92, 60, 92], [88, 60, 92]], W, H, { pad: 20, azimuth: 45, elevation: 30 });
const DATA = { W, H, P, PLATE };
Object.assign(DATA, { TABLE, SRC, TANK, PIT, LIGHT, ROOM, PIPE_Y, PIPE_Z });
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
const LIVE = `
${engineScript()}
const D = __DATA__;
const stage = document.querySelector(".mk-stage");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lightTheme = document.body.dataset.theme === "light";
const E = mk2(stage, D.P, { W: D.W, H: D.H, pivot: [0, -6, 34], plate: { ...D.PLATE, h: 12, foot: 5 }, shadowBox: [-120, -84, -18, 116, 82, 100] });
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
const P = D.P, TABLE = D.TABLE;
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
const ui = {
  src: [...document.querySelectorAll("[data-src]")], gas: [...document.querySelectorAll("[data-gas]")], where: [...document.querySelectorAll("[data-where]")], av: [...document.querySelectorAll("[data-av]")],
  size: document.querySelector("#size"), sizeOut: document.querySelector("#size-out"), cells: [...document.querySelectorAll("[data-cell]")],
  stats: document.querySelector("#stats"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"),
};
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };
const EPL = ["Ga", "Ga or Gb", "Ga, Gb or Gc"];
// ---------------- the plant and its zones, in real 3D ----------------
const TAU = Math.PI * 2, RM = D.ROOM, TK = D.TANK, PIT = D.PIT, LT = D.LIGHT, PY = D.PIPE_Y, PZ = D.PIPE_Z;
const ZC = ["#e53935", "#fb8c00", "#fdd835"], COL = ["z0", "z1", "z2"];
function plantStatic() {
  const o = [], ST = { mat: "paint" }, PIPE = "#7d8a94";
  // a concrete slab with the pit let into it (a grating over the top)
  o.push(box(D.PLATE.x + 4, D.PLATE.x + D.PLATE.w - 4, D.PLATE.y + 4, D.PLATE.y + D.PLATE.d - 4, 0, 0.6, "#8d8980", { mat: "concrete" }));
  o.push(box(PIT.x - 1, PIT.x + PIT.w + 1, PIT.y - 1, PIT.y + PIT.d + 1, 0.6, 0.9, "#5d6670", { mat: "steel" }), box(PIT.x, PIT.x + PIT.w, PIT.y, PIT.y + PIT.d, 0.6, 1, "#17181b", { mat: "matte", bevel: 0 }));
  for (let x = PIT.x + 2; x < PIT.x + PIT.w; x += 3) o.push(box(x, x + 0.8, PIT.y, PIT.y + PIT.d, 1, 1.5, "#6f7780", { mat: "steel", bevel: 0 }));
  // pipe supports, the pipe, the riser into the tank
  for (const x of [-84, -40, 12]) o.push(box(x - 2, x + 2, PY - 6, PY + 6, 0.6, PZ - 3, "#59616b", ST), box(x - 3, x + 3, PY - 4, PY + 4, PZ - 3.6, PZ - 2.6, "#59616b", ST));
  o.push(tube([[-92, PY, PZ], [30, PY, PZ]], 3, PIPE, { seg: 14, mat: "paint" }), tube([[30, PY, PZ], [41, PY, PZ], [41, -36, PZ]], 3, PIPE, { seg: 14, mat: "paint" }));
  // the flange: two discs and a ring of bolts
  const fx = D.SRC.flange[0];
  for (const dx of [-1.4, 0.2]) o.push(prism(circle(PY, PZ, 5.6, 20), "x", fx + dx, fx + dx + 1.2, "#aab2ba", { mat: "steel" }));
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; o.push(tube([[fx - 2.2, PY + 4.4 * Math.cos(a), PZ + 4.4 * Math.sin(a)], [fx + 2.2, PY + 4.4 * Math.cos(a), PZ + 4.4 * Math.sin(a)]], 0.5, "#3a3d42", { seg: 6, mat: "steel" })); }
  // the sample point: a little valve and a drain stub hanging under the pipe
  const s = D.SRC.sample;
  o.push(cyl(s[0], PY, 1.2, s[2] + 1, PZ - 2, PIPE, 10, ST), box(s[0] - 3, s[0] + 3, PY - 3, PY + 3, s[2] + 1, s[2] + 4.5, "#c9a24a", { mat: "metal" }), cyl(s[0], PY, 0.9, s[2] - 4, s[2] + 1, PIPE, 8, ST), tube([[s[0], PY, s[2] + 2.8], [s[0], PY + 6, s[2] + 2.8]], 0.6, "#d0342c", { seg: 6, mat: "paint" }));
  // the tank (glass in x-ray), what's in it, and its vent
  o.push(lathe([[0, 0.6], [TK.r, 0.6], [TK.r, TK.h - 3], [TK.r - 2, TK.h], [0, TK.h + 1.2]], "#cfd4d9", { c: [TK.x, TK.y, 0], seg: 40, mat: "paint", shell: true }));
  for (const z of [TK.h * 0.3, TK.h * 0.62]) o.push(lathe([[TK.r + 0.2, z], [TK.r + 0.2, z + 1]], "#aab0b8", { c: [TK.x, TK.y, 0], seg: 40, mat: "paint", shell: true }));
  o.push(cyl(TK.x, TK.y, TK.r - 1, 0.8, TK.h * 0.55, "#b8862a", 32, { mat: "gloss", bevel: 0 }));
  o.push(cyl(D.SRC.vent[0], D.SRC.vent[1], 1.6, TK.h, D.SRC.vent[2] - 2, PIPE, 10, ST), lathe([[1.6, D.SRC.vent[2] - 2], [3.4, D.SRC.vent[2] - 2], [3.4, D.SRC.vent[2]], [0, D.SRC.vent[2] + 0.8]], "#aab2ba", { c: [D.SRC.vent[0], D.SRC.vent[1], 0], seg: 14, mat: "steel" }));
  // the light on a pole
  o.push(cyl(LT[0], LT[1], 3.5, 0.6, 2, "#59616b", 14, ST), cyl(LT[0], LT[1], 0.9, 2, LT[2], "#8f959d", 8, { mat: "steel" }), box(LT[0] - 6, LT[0] + 6, LT[1] - 3, LT[1] + 3, LT[2], LT[2] + 2.2, "#3a3e44", ST));
  return o;
}
// walls, the roof and the fan: shown for a shelter and for a room
function buildingParts(kind) {
  const o = [], x1 = RM.x + RM.w, y1 = RM.y + RM.d, W2 = "#aeb6be", PT = { mat: "paint" };
  o.push(box(RM.x, x1, RM.y, RM.y + 2, 0.6, RM.h, W2, PT), box(RM.x, RM.x + 2, RM.y + 2, y1, 0.6, RM.h, W2, PT));
  for (const [x, y] of [[x1 - 2, y1 - 2], [x1 - 2, RM.y], [RM.x, y1 - 2]]) o.push(box(x, x + 2, y, y + 2, 0.6, RM.h, "#6a727b", PT));
  o.push(box(RM.x - 1, x1 + 1, RM.y - 1, y1 + 1, RM.h, RM.h + 2, "#dfe6ec", { mat: "glass", opacity: lightTheme ? 0.26 : 0.16, bevel: 0 }));
  for (const [a, b] of [[[RM.x, RM.y, RM.h + 1], [x1, RM.y, RM.h + 1]], [[x1, RM.y, RM.h + 1], [x1, y1, RM.h + 1]], [[x1, y1, RM.h + 1], [RM.x, y1, RM.h + 1]], [[RM.x, y1, RM.h + 1], [RM.x, RM.y, RM.h + 1]]]) o.push(tube([a, b], 0.9, "#6a727b", { seg: 4, mat: "paint" }));
  if (kind === "room") {
    // the two near walls, in glass so you can still see in, and the extraction fan's housing in the back wall
    o.push(box(x1 - 1, x1, RM.y + 2, y1 - 2, 0.6, RM.h, "#dfe6ec", { mat: "glass", opacity: lightTheme ? 0.2 : 0.12, bevel: 0 }), box(RM.x + 2, x1 - 2, y1 - 1, y1, 0.6, RM.h, "#dfe6ec", { mat: "glass", opacity: lightTheme ? 0.2 : 0.12, bevel: 0 }));
    o.push(box(12, 28, RM.y + 2, RM.y + 3.4, 58, 74, "#3a3e44", PT), lathe([[7.4, 0], [7.4, 1.6], [6.6, 1.6], [6.6, 0], [7.4, 0]], "#8f959d", { c: [20, RM.y + 3.4, 66], axis: "y", seg: 24, closed: true, mat: "steel" }));
  }
  return o;
}
// a zone envelope: a ball round the source, then where it goes: up for a light gas, down and out along the ground for a heavy one
function envelopeParts(src, r, z, k2) {
  const col = ZC[z], o = [], op = (lightTheme ? 0.34 : 0.3) * k2, G = { flat: true, opacity: op };
  o.push(sphere(src, r, col, { ...G, lat: 14, lon: 24 }));
  if (heavy) { o.push(cyl(src[0], src[1], r, 0.7, src[2], col, 32, { ...G, bevel: 0 }), cyl(src[0], src[1], r * 1.5, 0.7, 0.7 + Math.min(6, r * 0.3), col, 40, { ...G, bevel: 0 })); }
  else o.push(cyl(src[0], src[1], r * 0.8, src[2], src[2] + r * 1.2, col, 28, { ...G, bevel: 0 }));
  return o;
}
function draw(dt = 0) {
  const env = envelope(), src = D.SRC[source], dil = dilution(), grade = GRADE[source], live = [], objs = [{ cache: "plant", rev: 0, parts: plantStatic }];
  if (where !== "open") objs.push({ cache: "bldg", rev: where + lightTheme, parts: () => buildingParts(where) });
  // the fan turns unless the ventilation's poor
  if (where === "room") { const a = now * (avail === "poor" ? 0 : 4.2); for (let i = 0; i < 4; i++) { const b = a + (i / 4) * TAU, c = Math.cos(b), s = Math.sin(b), q2 = (r, w) => [20 + r * c - w * s, 66 + r * s + w * c]; live.push(prism([q2(1, -1.2), q2(6.2, -2), q2(6.2, 1.4), q2(1, 1.2)], "y", RM.y + 2.4, RM.y + 3, "#c9ced3", { mat: "steel", bevel: 0 })); } live.push(prism(circle(20, 66, 1.6, 10), "y", RM.y + 2.2, RM.y + 3.6, "#2a2d31", { mat: "plastic" })); }
  // the zones, outermost first
  const sorted = [...env.list].sort((a, b) => b[1] - a[1] || b[0] - a[0]), labels = [];
  const roomFill = where === "room" && dil === "low" && sorted.length;
  if (roomFill) live.push(box(RM.x + 2.5, RM.x + RM.w - 1.5, RM.y + 2.5, RM.y + RM.d - 1.5, 0.8, RM.h - 0.5, ZC[sorted[0][0]], { flat: true, opacity: lightTheme ? 0.2 : 0.16, bevel: 0 }));
  sorted.forEach(([z, r], i) => { live.push(...envelopeParts(src, r, z, i === sorted.length - 1 ? 1.25 : 0.75)); labels.push({ p: [src[0] + r * 0.6, src[1] + r * 0.6, src[2] + r * 0.55], cls: COL[z], t: "Zone " + z }); });
  // the pit: heavier-than-air gas pools in it, so it's usually taken one zone worse
  let pitZone = 9;
  if (heavy && env.list.length) {
    const outer = env.list.reduce((a, b) => (b[1] > a[1] ? b : a));
    const px = clamp(src[0], PIT.x, PIT.x + PIT.w), py = clamp(src[1], PIT.y, PIT.y + PIT.d);
    // gas pooling in a pit inside the envelope: usually taken as Zone 1 (common practice, not the table)
    if (Math.hypot(px - src[0], py - src[1]) < outer[1] * 1.5) pitZone = Math.min(1, outer[0]);
    if (pitZone < 9) { live.push(box(PIT.x, PIT.x + PIT.w, PIT.y, PIT.y + PIT.d, 1.5, 3.4, ZC[pitZone], { flat: true, opacity: 0.55, bevel: 0 })); labels.push({ p: [PIT.x + PIT.w / 2, PIT.y + PIT.d + 3, 3], cls: COL[pitZone], t: "pit: Zone " + pitZone, mid: true }); }
  }
  // negligible extent: just a ring round the source
  if (env.ne) { for (let i = 0; i < 24; i += 2) { const a0 = (i / 24) * TAU, a1 = ((i + 1) / 24) * TAU; E.line([src[0] + 5 * Math.cos(a0), src[1] + 5 * Math.sin(a0), src[2]], [src[0] + 5 * Math.cos(a1), src[1] + 5 * Math.sin(a1), src[2]], 2, "#8bc34a", 0.95); } labels.push({ p: [src[0] + 6, src[1], src[2] + 5], cls: "ne-t", t: "NE" }); }
  // inside a vented tank the vapour space is Zone 0: you see it when the x-ray's on
  if (source === "vent") { if (E.xray > 0.01) live.push(cyl(TK.x, TK.y, TK.r - 1.2, TK.h * 0.55 + 0.3, TK.h - 3.4, ZC[0], 28, { flat: true, opacity: 0.4 * E.xray, bevel: 0 })); labels.push({ p: [TK.x, TK.y + TK.r, TK.h * 0.5], cls: "z0", t: "Zone 0 inside", mid: true }); }
  // the light: does it sit in a zone, and what does that make it need
  const lz = zoneAt(LT, env, src), need = lz < 9;
  live.push(box(LT[0] - 5.4, LT[0] + 5.4, LT[1] - 2.4, LT[1] + 2.4, LT[2] - 0.9, LT[2], need ? "#ffb347" : "#fff1c8", { mat: "plastic", bevel: 0, emit: [need ? "#ff8a2a" : "#ffe9b0", 0.9], emitK: 2 }));
  labels.push({ p: [LT[0], LT[1], LT[2] + 8], cls: "light-t" + (need ? " need" : ""), t: need ? "light: needs " + EPL[lz] : "light: ordinary is fine", mid: true });
  // which release is being looked at
  live.push(sphere(src, 1.5, "#ffffff", { lat: 6, lon: 10, flat: true, emit: ["#ffffff", 0.8 + 0.2 * Math.sin(now * 5)], emitK: 2 }));
  objs.push({ parts: live });
  let svg = E.render(objs);
  for (const l of labels) { const p = E.project(l.p); svg += '<text class="mk-lab zl ' + l.cls + '" x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '"' + (l.mid ? ' text-anchor="middle"' : "") + ">" + l.t + "</text>"; }
  if (E.xray > 0.02) svg += E.callouts([
    { p: D.SRC.flange, text: "Flange", sub: "secondary grade: only leaks if it fails" }, { p: D.SRC.sample, text: "Sample point", sub: "primary grade: releases in normal use" },
    { p: D.SRC.vent, text: "Tank vent", sub: "primary grade: breathes as it fills" }, { p: [TK.x, TK.y - TK.r, TK.h * 0.3], text: "Tank", sub: "liquid below, vapour space above" }, { p: [PIT.x + 4, PIT.y + PIT.d, 1], text: "Pit", sub: "heavy gas pools here" },
  ], E.xray, E.fs < 0.62 ? {} : { topL: 70, topR: 70 });
  if (sceneG.innerHTML !== svg) sceneG.innerHTML = svg;
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
  frame = visible ? requestAnimationFrame(tick) : 0;
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
onTap(() => setSrc(source === "flange" ? "sample" : source === "sample" ? "vent" : "flange"));
stage.addEventListener("keydown", (ev) => {
  const map = { x: () => { setX(!E.xrayOn); run(); }, " ": () => setSrc(source === "flange" ? "sample" : source === "sample" ? "vent" : "flange"), g: () => setGas(!heavy), w: () => setWhere(where === "open" ? "shelter" : where === "shelter" ? "room" : "open"), a: () => setAv(AV[(AV.indexOf(avail) + 1) % 3]), ArrowUp: () => setSize(clamp(size + 0.05, 0, 1)), ArrowDown: () => setSize(clamp(size - 0.05, 0, 1)) };
  if (map[ev.key]) { ev.preventDefault(); map[ev.key](); }
});
window.__fig = { E, freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
draw(); syncUi(); story();
`;

const CSS = `.zl{font-weight:600}.zl.z0{fill:#ff5a52}.zl.z1{fill:#fb8c00}.zl.z2{fill:#fdd835}.zl.ne-t{fill:#8bc34a}.zl.light-t{fill:var(--anatomy-text);font-weight:500}.zl.light-t.need{fill:#ff6a3d;font-weight:700}
body[data-theme="light"] .zl.z0{fill:#c62828}body[data-theme="light"] .zl.z1{fill:#d86f00}body[data-theme="light"] .zl.z2{fill:#9a8200}body[data-theme="light"] .zl.ne-t{fill:#4f8a1f}
.tbl-wrap{overflow-x:auto;grid-column:1/-1}.tbl{border-collapse:collapse;font-size:10.5px;width:100%;min-width:560px}
.tbl th,.tbl td{border:1px solid var(--anatomy-lo);padding:4px 5px;text-align:center;font-weight:400;color:var(--anatomy-mid)}
.tbl thead th{color:var(--anatomy-lo);text-transform:uppercase;letter-spacing:.05em;font-size:9.5px}.tbl tbody th{text-align:left;color:var(--anatomy-lo)}
.tbl td[data-on="true"]{background:var(--anatomy-lit);color:var(--anatomy-paper);font-weight:600}.tbl-note{font-size:10px;color:var(--anatomy-lo);margin-top:4px}`;

const stage = stageHtml({
  W, H, fig: "Fig 15", title: "Hazardous area zones", xray: true,
  label: "A small process plant: a pipe run with a flange and a sample point, a storage tank with a vent, a pit in the floor and a light on a pole, optionally under a shelter or inside a room with an extraction fan. The hazardous zones show as coloured volumes round whichever release is selected. An x-ray mode turns the tank to glass.",
  keysHelp: "Zone extents: drag to rotate, X for x-ray, space cycles the release source, G the gas, W where it is, A the ventilation availability, up and down the leak size",
  extra: ``,
});

const CONTROLS = `<div class="ctl" role="group" aria-label="Controls">
  <div class="ctl-row"><span class="ctl-label">Release</span><button type="button" data-src="flange" aria-pressed="true">Flange<small>secondary</small></button><button type="button" data-src="sample" aria-pressed="false">Sample point<small>primary</small></button><button type="button" data-src="vent" aria-pressed="false">Tank vent<small>Zone 0 inside, primary vent</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Gas</span><button type="button" data-gas="light" aria-pressed="true">Lighter than air<small>natural gas</small></button><button type="button" data-gas="heavy" aria-pressed="false">Heavier than air<small>LPG</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Leak size</span><div class="slide"><input id="size" type="range" min="0" max="100" step="1" value="35" aria-label="Leak size"></div><output id="size-out">small</output></div>
  <div class="ctl-row"><span class="ctl-label">Where</span><button type="button" data-where="open" aria-pressed="true">Open air</button><button type="button" data-where="shelter" aria-pressed="false">Under a shelter</button><button type="button" data-where="room" aria-pressed="false">Indoors<small>extraction fan</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Availability</span><button type="button" data-av="good" aria-pressed="true">Good<small>always there</small></button><button type="button" data-av="fair" aria-pressed="false">Fair<small>usually there</small></button><button type="button" data-av="poor" aria-pressed="false">Poor<small>don't count on it</small></button></div>
  ${TABLE_HTML}
  <div class="ctl-row"><span class="ctl-label">Result</span><span id="stats"></span></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
</div>`;


const foot = footHtml({
  theme, slug: "zones",
  real: "the grade, dilution and availability method and the zone table after IEC 60079-10-1:2020 Table D.1 (check it against your copy), and the zone-to-EPL rule from IEC 60079-14.",
  made: "how dilution is worked out (a stand-in for Figure C.1), the envelope sizes and shapes (a stand-in for Figure D.1, no distances claimed), and the pit rule (common practice, not the table). Do a real calc.",
});
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), pageMk2({
  k, title: "Hazardous area zones", fig: "Fig 15", hint: "Tap: next release", theme, W, H, stage, controls: CONTROLS, css: CSS, foot,
  caption: "A zone is a guess at how often there'll be a flammable cloud somewhere, and it comes from three things. The grade of release: continuous (all the time), primary (in normal operation) or secondary (only when something goes wrong). The degree of dilution: how fast the air carries the gas off compared with how fast it comes out. And the availability of that ventilation: good, fair or poor. Put them through the table and you get the zone; the size of the cloud gives the extent. Heavier-than-air gas slumps and collects in pits. And the equipment you can put there follows the zone: Ga in Zone 0, Gb or better in Zone 1, Gc or better in Zone 2.",
  script: LIVE.replace("__DATA__", JSON.stringify(DATA)),
}));
console.log("wrote", name);
