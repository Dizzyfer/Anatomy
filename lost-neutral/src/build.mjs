import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { engineScript, stageHtml, pageMk2, footHtml } from "../../mk2/shell.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const W = 960, H = 600;

// Truth: 400/230 V three-phase four-wire; AS 60038 puts 230 V at +10 % / −6 % (216 to 253 V). Lose the neutral and each row's
// voltage is set by where the star point floats, which depends on the load on each phase (Millman). Toy simplification: running drivers
// are modelled as fixed loads (a PFC front end looks roughly resistive); real constant-power regulation can make it worse. Narrow drivers are typically specified 198 to 264 V; wide-range ones (Mean Well HLG style) 90 to 305 V.
// Toy: the dropout points, how fast they die above their rating, the MOV failing short and tripping the row, the loose joint.
const MODEL = {
  P: 150, standby: 2, tauV: 0.05, rSolid: 0.1,
  drv: {
    narrow: { name: "198 to 264 V", lim: 198, min: 198, max: 264, off: 150, on: 165, flick: 180, s0: 266, sk: 10 },
    wide: { name: "90 to 305 V", lim: 180, min: 90, max: 305, off: 80, on: 88, flick: 90, s0: 312, sk: 12 },
  },
};

const ROWS_Y = [-30, 0, 30];
const COLS_X = [-38, -10, 18, 46];
const ZB = 98, ZL = 80;
const DB = { x: 78, y: -26, w: 12, d: 46 };
const DBZ = 70;
const POSTS = [[-60, -46], [-60, 46], [68, -46], [68, 46]];
const PLATE = { x: -82, y: -62, w: 182, d: 124, r: 8 };
const P = k.fitProjection([...k.boxCorners(PLATE, -0.8, 0), [-62, -48, 104], [70, -48, 104], [70, 48, 104], [-62, 48, 104], [92, 20, 70]], W, H, { pad: 22, azimuth: 45, elevation: 30 });
const DATA = { W, H, P, PLATE };
const NT = [DB.x + DB.w + 1.6, DB.y + DB.d - 1 - 27, DBZ - 4 - 29.5], NJ = [64, ROWS_Y[0] - 2, ZB + 2.8];
const LUMS = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) LUMS.push([COLS_X[c], ROWS_Y[r]]);
const PH = ["l1", "l2", "l3"], PZ = { w: 128, h: 112, cx: 64, cy: 66, R: 34 };
const pv = (re, im) => [PZ.cx + (im / 230) * PZ.R, PZ.cy - (re / 230) * PZ.R];
const VERT = [0, -120, 120].map((a) => pv(230 * Math.cos(a * Math.PI / 180), 230 * Math.sin(a * Math.PI / 180)));
const phasorSvg = `<svg viewBox="0 0 ${PZ.w} ${PZ.h}" class="pz"><text x="8" y="13" class="pz-h">STAR POINT</text>
  <path class="pz-tri" d="M${VERT.map((v) => v.map((n) => n.toFixed(1)).join(" ")).join("L")}Z"/><path class="pz-zero" d="M${PZ.cx - 2.5} ${PZ.cy}h5M${PZ.cx} ${PZ.cy - 2.5}v5"/>
  ${VERT.map((v, r) => `<line data-part="sp${r}" class="pz-sp ph-${PH[r]}" x1="${PZ.cx}" y1="${PZ.cy}" x2="${v[0].toFixed(1)}" y2="${v[1].toFixed(1)}"/>`).join("")}
  ${VERT.map((v, r) => `<circle class="pz-v ph-${PH[r]}" cx="${v[0].toFixed(1)}" cy="${v[1].toFixed(1)}" r="2.6"/>`).join("")}
  ${[0, 1, 2].map((r) => `<circle data-part="nr${r}" class="pz-nr" cx="${PZ.cx}" cy="${PZ.cy}" r="2.4" style="display:none"/>`).join("")}
  <circle data-part="nl" class="pz-n" cx="${PZ.cx}" cy="${PZ.cy}" r="3"/>
  ${VERT.map((v, r) => { const dx = v[0] - PZ.cx, dy = v[1] - PZ.cy, m = Math.hypot(dx, dy); return `<text data-part="pt${r}" class="pz-t" x="${(v[0] + (dx / m) * 9).toFixed(1)}" y="${(v[1] + (dy / m) * 9 + 3).toFixed(1)}" text-anchor="${Math.abs(dx) < 4 ? "middle" : dx > 0 ? "end" : "start"}">L${r + 1} 230</text>`; }).join("")}</svg>`;
Object.assign(DATA, { MODEL, LUMS, PZ, NT, NJ, ROWS_Y, COLS_X, ZB, ZL, DB, DBZ, POSTS });

const vp = (v) => (v / 420 * 100).toFixed(1);
const meterRow = (r, col) => `<div class="ctl-row"><span class="ctl-label"><span class="ph" style="background:${col}"></span>L${r + 1} row</span><div class="meter"><span class="band" style="left:${vp(216)}%;width:${(vp(253) - vp(216)).toFixed(1)}%"></span><span id="v${r}-fill" class="fill"></span>${r === 0 ? `<span class="mark quiet" style="left:${vp(230)}%"></span>` : ""}<span class="mark maxmark${r ? " quiet" : ""}" style="left:${vp(264)}%" data-label="264 V driver max"></span></div><output id="v${r}-out">230 V</output></div>`;
const countRow = (r, col, v) => `<div class="slide" style="min-width:70px"><input id="row${r}" type="range" min="0" max="4" step="1" value="${v}" aria-label="Lights on, row L${r + 1}"></div><output id="row${r}-out" style="min-width:40px">${v} on</output>`;
const LIVE = `
${engineScript()}
const D = __DATA__;
const stage = document.querySelector(".mk-stage");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lightTheme = document.body.dataset.theme === "light";
const E = mk2(stage, D.P, { W: D.W, H: D.H, pivot: [4, 0, 50], plate: { ...D.PLATE, h: 12, foot: 5 }, shadowBox: [-90, -70, -18, 108, 70, 110] });
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
// phasors: 230 V at 0, −120, +120
const SRC = [0, -120, 120].map((a) => [230 * Math.cos(a * Math.PI / 180), 230 * Math.sin(a * Math.PI / 180)]);
let where = "link", neutral = "solid", drvKind = "narrow", counts = [4, 2, 1], nRow = [[0, 0], [0, 0], [0, 0]];
let rowShow = [230, 230, 230], lums = [], mcb = [true, true, true], rowV = [230, 230, 230], vn = [0, 0], inA = 0, rn = M.rSolid, rnNext = 0, arc = 0, joint = 0;
let frame = 0, last = 0, now = 0, visible = false, touring = true, slow = false, tourClock = 0, tourStep = -1, actions = [], lastShot = "", lastEvent = "", lastEventAt = -10;
function fresh() { lums = Array.from({ length: 12 }, () => ({ st: "on", v: 230, stress: 0, popAt: null })); mcb = [true, true, true]; lastEvent = ""; }
fresh();
const DRV = () => M.drv[drvKind];
const rowOf = (i) => Math.floor(i / 4);
const switched = (i) => (i % 4) < counts[rowOf(i)];
const event = (t) => { lastEvent = t; lastEventAt = now; };

function step(dt) {
  const d = DRV();
  // the neutral: solid, a loose joint that makes and breaks, or gone
  if (neutral === "loose") {
    if (now >= rnNext) { const r = Math.random(); rn = r < 0.25 ? 1e6 : r < 0.5 ? 40 : r < 0.75 ? 12 : 3; rnNext = now + 0.08 + Math.random() * 0.35; if (rn > 1e5) arc = 1; }
  } else rn = neutral === "solid" ? M.rSolid : 1e9;
  arc *= Math.exp(-dt / 0.08);
  // each row is a conductance that depends on the voltage it sees (constant power)
  const G = [0, 0, 0];
  lums.forEach((l, i) => {
    const r = rowOf(i);
    if (!mcb[r] || !switched(i) || l.st === "dead") return;
    // a running driver's PFC front end looks roughly like a resistor; dropped out, it's a tiny load
    G[r] += (l.st === "on" || l.st === "flick" ? M.P : M.standby) / (230 * 230);
  });
  // each row's own neutral runs to the board's neutral link, and the link goes back to the supply neutral.
  // The broken (or loose) bit is either L1's own neutral or the link.
  const ys = 1 / M.rSolid, yx = 1 / rn;
  const yLink = where === "link" ? yx : ys, yRow = [where === "circuit" ? yx : ys, ys, ys];
  const yEq = G.map((g, r) => (g > 0 ? (g * yRow[r]) / (g + yRow[r]) : 0));
  const se = yEq[0] + yEq[1] + yEq[2] + yLink;
  vn = [0, 1].map((c) => (yEq[0] * SRC[0][c] + yEq[1] * SRC[1][c] + yEq[2] * SRC[2][c]) / se);
  nRow = [0, 1, 2].map((r) => (G[r] + yRow[r] > 0 ? [0, 1].map((c) => (G[r] * SRC[r][c] + yRow[r] * vn[c]) / (G[r] + yRow[r])) : [...vn]));
  rowV = SRC.map((s, r) => (mcb[r] ? Math.hypot(s[0] - nRow[r][0], s[1] - nRow[r][1]) : 0));
  rowShow = rowShow.map((v, r) => v + (rowV[r] - v) * (1 - Math.exp(-dt / 0.12)));
  inA = where === "link" ? Math.hypot(vn[0], vn[1]) * yx : Math.hypot(nRow[0][0] - vn[0], nRow[0][1] - vn[1]) * yx;
  joint += ((neutral === "loose" && rn < 1e5 ? inA * inA * rn : 0) / 40 - joint) * (1 - Math.exp(-dt / 1.2));
  // each driver
  lums.forEach((l, i) => {
    const r = rowOf(i);
    if (l.st === "dead") return;
    const live = mcb[r] && switched(i);
    const target = live ? rowV[r] : 0;
    l.v += (target - l.v) * (1 - Math.exp(-dt / M.tauV));
    if (!live) { l.st = "idle"; return; }
    if (l.st === "idle") l.st = l.v > d.on ? "on" : "off";
    if (l.v < d.off) l.st = "off";
    else if (l.st === "off" && l.v > d.on) l.st = "on";
    if (l.st !== "off") l.st = l.v < d.flick ? "flick" : "on";
    if (l.v > d.s0) l.stress += Math.pow((l.v - d.s0) / d.sk, 2) * dt;
    if (l.stress >= 1) {
      l.st = "dead"; l.popAt = now;
      if (mcb[r]) { mcb[r] = false; event("A driver on L" + (r + 1) + " saw " + Math.round(l.v) + " V, way past its " + d.max + " V rating. Its surge MOV failed short and tripped the L" + (r + 1) + " breaker, so the whole row's gone dark."); }
    }
  });
}

const ui = {
  n: [...document.querySelectorAll("[data-n]")], where: [...document.querySelectorAll("[data-where]")], drv: [...document.querySelectorAll("[data-drv]")],
  rows: [0, 1, 2].map((r) => document.querySelector("#row" + r)), rowsOut: [0, 1, 2].map((r) => document.querySelector("#row" + r + "-out")),
  fills: [0, 1, 2].map((r) => document.querySelector("#v" + r + "-fill")), outs: [0, 1, 2].map((r) => document.querySelector("#v" + r + "-out")), maxMarks: [...document.querySelectorAll(".maxmark")],
  stats: document.querySelector("#stats"), fresh: document.querySelector("#fresh"), slow: document.querySelector("#slow"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"),
};
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };
const vPct = (v) => (clamp(v / 420, 0, 1) * 100).toFixed(1) + "%";

function syncUi() {
  const d = DRV();
  ui.n.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.n === neutral)));
  ui.where.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.where === where)));
  ui.drv.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.drv === drvKind)));
  for (let r = 0; r < 3; r++) {
    ui.rows[r].value = counts[r]; ui.rowsOut[r].textContent = counts[r] + " on";
    const v = rowShow[r];
    ui.fills[r].style.width = vPct(v);
    ui.fills[r].dataset.state = !mcb[r] ? "off" : v > d.max ? "bad" : v < d.min || v > 253 ? "warn" : "ok";
    ui.outs[r].textContent = mcb[r] ? Math.round(v) + " V" : "TRIPPED";
  }
  ui.maxMarks.forEach((m) => { m.style.left = vPct(d.max); m.dataset.label = d.max + " V driver max"; });
  const dead = lums.filter((l) => l.st === "dead").length;
  ui.stats.innerHTML = (where === "link" ? "star point shifted <b>" + Math.round(Math.hypot(vn[0], vn[1])) + " V</b>" : "L1 neutral at the fittings <b>" + Math.round(Math.hypot(nRow[0][0], nRow[0][1])) + " V</b>") + " · current through the " + (where === "link" ? "link" : "L1 neutral") + " <b>" + (neutral === "broken" ? "none" : inA.toFixed(1) + " A") + "</b>" + (neutral === "loose" ? " · joint <b>" + Math.round(joint * 40) + " W</b>" : "") + " · drivers dead <b>" + dead + "</b>";
  ui.slow.setAttribute("aria-pressed", String(slow)); ui.tour.setAttribute("aria-pressed", String(touring));
}

// ---------------- the gantry, the board and the lights, in real 3D ----------------
const TAU = Math.PI * 2, ZB = D.ZB, ZL = D.ZL, DB = D.DB, DBZ = D.DBZ;
const PHC = ["#d9534f", "#e8e8e4", "#3d7bd9"], NEU = lightTheme ? "#2a2a2a" : "#6a6a6a";
const pz = stage.querySelector(".pz-wrap"), qz = (n) => pz.querySelector('[data-part="' + n + '"]');
const pzN = qz("nl"), pzSp = [0, 1, 2].map((r) => qz("sp" + r)), pzNr = [0, 1, 2].map((r) => qz("nr" + r)), pzT = [0, 1, 2].map((r) => qz("pt" + r));
const cab = (pts, col, r = 0.55) => tube(pts, r, col, { seg: 5, mat: "plastic" });
function hallStatic() {
  const o = [], ST = { mat: "paint" };
  // a concrete floor with bay lines
  o.push(box(D.PLATE.x + 3, D.PLATE.x + D.PLATE.w - 3, D.PLATE.y + 3, D.PLATE.y + D.PLATE.d - 3, 0, 0.5, "#8d8980", { mat: "concrete" }));
  for (const y of [-45, 45]) o.push(box(-70, 60, y - 0.6, y + 0.6, 0.5, 0.56, "#e2b53a", { bevel: 0, mat: "matte" }));
  // the gantry: posts, side beams, a beam per row, cable along each
  for (const [x, y] of D.POSTS) o.push(box(x - 1.6, x + 1.6, y - 1.6, y + 1.6, 0.5, ZB, "#6a727b", ST), box(x - 3, x + 3, y - 3, y + 3, 0.5, 1.6, "#565d65", ST));
  for (const x of [-60, 68]) o.push(box(x - 2, x + 2, -48, 48, ZB, ZB + 3, "#6a727b", ST));
  D.ROWS_Y.forEach((y, r) => {
    o.push(box(-62, 70, y - 1.5, y + 1.5, ZB - 0.2, ZB + 2.2, "#7b848d", ST));
    o.push(cab([[-60, y + 2, ZB + 2.8], [60, y + 2, ZB + 2.8]], PHC[r]), cab([[64, -20 + r * 2, ZB + 2.8], [64, y + 2, ZB + 2.8], [60, y + 2, ZB + 2.8]], PHC[r]));
  });
  o.push(cab([[64, -32, ZB + 2.8], [64, 32, ZB + 2.8]], NEU, 0.6));
  // the board: enclosure, the gear tray behind the door, and the risers up to the gantry
  o.push(box(DB.x, DB.x + DB.w, DB.y, DB.y + DB.d, 0.5, DBZ, "#c9cdd2", ST), box(DB.x + DB.w, DB.x + DB.w + 0.4, DB.y + 1.5, DB.y + DB.d - 1.5, 26, DBZ - 2, "#dfe2e6", ST));
  const fx0 = DB.x + DB.w + 0.4, fy = (u) => DB.y + DB.d - 1 - u, fz = (v) => DBZ - 4 - v;
  o.push(box(fx0, fx0 + 1, fy(36), fy(4), fz(32), fz(27), "#c9a227", { mat: "metal" })); // the neutral link bar
  const sx = DB.x + DB.w / 2;
  [-4.5, -1.5, 1.5].forEach((dx, r) => o.push(cab([[sx, DB.y + 10 + dx, DBZ], [sx, DB.y + 10 + dx, ZB + 2.8], [64, DB.y + 10 + dx, ZB + 2.8]], PHC[r])));
  // every high bay: stem, driver box, dome
  D.LUMS.forEach(([x, y]) => {
    o.push(cyl(x, y, 0.6, ZL + 6, ZB, "#8f959d", 8, { mat: "steel" }), box(x + 2, x + 9, y - 2.5, y + 2.5, ZB - 3.2, ZB - 0.4, "#2f3338", { mat: "plastic" }));
    o.push(lathe([[8, ZL + 2], [8.4, ZL + 2], [8.4, ZL + 3.4], [3.2, ZL + 6.4], [3.2, ZL + 7.6], [0, ZL + 7.6]], "#3a3e44", { c: [x, y, 0], seg: 28, mat: "paint" }));
  });
  return o;
}
let fx = [];
const rn2 = () => Math.random();
function draw(dt = 0) {
  const atLink = where === "link", live = [], d = DRV();
  // the lights
  const B = lums.map((l, i) => (!switched(i) || !mcb[rowOf(i)] || l.st === "dead" || l.st === "off" || l.st === "idle" ? 0 : l.st === "flick" ? (rn2() < 0.5 ? 0.15 : 0.9) : 1));
  D.LUMS.forEach(([x, y], i) => {
    const l = lums[i], b = B[i], dead = l.st === "dead", over = b > 0 && rowShow[rowOf(i)] > d.max ? 1 : 0;
    const col = dead ? "#2a2522" : b > 0 ? (over ? "#fff8ee" : "#fff1c8") : "#8a8f96";
    live.push(cyl(x, y, 7.6, ZL + 1.4, ZL + 2.1, col, 24, { mat: "plastic", bevel: 0, emit: b > 0 ? [over ? "#ffffff" : "#ffe9b0", b] : undefined, emitK: 2.4 + over * 1.2 }));
    if (b > 0) live.push(lathe([[8.5, ZL + 1.4], [8.9, ZL + 1.4], [8.9, ZL + 2.6], [8.5, ZL + 2.6]], "#fff1c8", { c: [x, y, 0], seg: 24, flat: true, emit: [over ? "#ffffff" : "#ffe9b0", b], emitK: 2.2 }));
    if (dead) live.push(box(x + 2, x + 9, y - 2.5, y + 2.5, ZB - 3.25, ZB - 0.35, "#1a1614", { mat: "matte", bevel: 0 }));
    if (l.popAt !== null && dt > 0) { const a = now - l.popAt; if (a < 0.2) for (let j = 0; j < 4; j++) fx.push({ k: "spark", p: [x + 5, y, ZB - 2], v: [(rn2() - 0.5) * 160, (rn2() - 0.5) * 160, 20 + rn2() * 120], life: 0, max: 0.4 + rn2() * 0.5 }); if (a < 5 && rn2() < dt * 10 * Math.exp(-a / 2.5)) fx.push({ k: "smoke", p: [x + 5, y, ZB], v: [(rn2() - 0.5) * 4, (rn2() - 0.5) * 4, 10 + rn2() * 8], life: 0, max: 2 + rn2() * 2 }); }
  });
  // breakers: handle up is on, down and red is tripped
  const fx0 = DB.x + DB.w + 0.4, fy = (u) => DB.y + DB.d - 1 - u, fz = (v) => DBZ - 4 - v;
  [6, 14, 22].forEach((u, r) => { live.push(box(fx0, fx0 + 1.6, fy(u + 5), fy(u), fz(18), fz(8), "#f1efe9", { mat: "plastic" }), box(fx0 + 1.6, fx0 + 2.6, fy(u + 3.5), fy(u + 1.5), mcb[r] ? fz(13) : fz(17), mcb[r] ? fz(10) : fz(14), mcb[r] ? "#3ddc84" : "#ff4a3d", { mat: "plastic", bevel: 0, emit: [mcb[r] ? "#3ddc84" : "#ff4a3d", 0.6] })); });
  // the neutral terminal screw: fine, loose and wobbling, or gone
  const st = atLink ? neutral : "solid", wob = st === "loose" ? Math.sin(now * 3) * 0.4 : 0;
  live.push(prism(circle(fy(27) + wob, fz(29.5), 1.8, 12), "x", fx0 + 1, fx0 + (st === "loose" ? 2.6 : 1.7), st === "broken" ? "#ff4a3d" : st === "loose" ? "#ffb347" : "#d6d9dc", { mat: "steel", emit: st !== "solid" ? [st === "broken" ? "#ff4a3d" : "#ffb347", 0.5] : undefined }));
  // neutrals: the shared one down to the link, and each row's own
  const sx = DB.x + DB.w / 2, nCut = atLink && neutral === "broken";
  if (!nCut) live.push(cab([[sx, DB.y + 14.5, DBZ], [sx, DB.y + 14.5, ZB + 2.8], [64, DB.y + 14.5, ZB + 2.8]], NEU, 0.6));
  else live.push(cab([[sx, DB.y + 14.5, DBZ + 14], [sx, DB.y + 14.5, ZB + 2.8], [64, DB.y + 14.5, ZB + 2.8]], NEU, 0.6));
  const n1 = Math.hypot(nRow[0][0], nRow[0][1]), liveN = !atLink && neutral !== "solid" && n1 > 40, cut0 = !atLink && neutral !== "solid";
  D.ROWS_Y.forEach((y, r) => { const hot = r === 0 && liveN; live.push(tube(r === 0 && cut0 ? [[-60, y - 2, ZB + 2.8], [56, y - 2, ZB + 2.8]] : [[-60, y - 2, ZB + 2.8], [64, y - 2, ZB + 2.8]], 0.55, hot ? "#ff4a3d" : NEU, { seg: 5, mat: "plastic", emit: hot ? ["#ff4a3d", 0.7] : undefined })); });
  let svg = E.render([{ cache: "hall", rev: 0, parts: hallStatic }, { parts: live }]);
  // pools of light on the floor, and the cones they come down in
  D.LUMS.forEach(([x, y], i) => { const b = B[i]; if (b <= 0) return; E.sprite([x, y, 0.8], 26, lightTheme ? "#ffd884" : "#ffe9b0", (lightTheme ? 0.34 : 0.26) * b, !lightTheme); E.sprite([x, y, ZL], 15, lightTheme ? "#ffd884" : "#fff1c8", (lightTheme ? 0.3 : 0.22) * b, !lightTheme); });
  // the arcing joint
  if (arc > 0.02 || joint > 0.05) { const p = atLink ? D.NT : D.NJ; E.sprite(p, 3 + 6 * clamp(joint, 0, 1.5), "#ffb060", 0.5 * clamp(joint, 0, 1), true, 1); if (arc > 0.02) { E.sprite(p, 5 + 5 * arc, "#cfe0ff", 0.9 * arc, true, 1); for (let j = 0; j < 3; j++) E.line(p, [p[0] + (rn2() - 0.5) * 6, p[1] + (rn2() - 0.5) * 6, p[2] + (rn2() - 0.5) * 6], 1.8, "#ffffff", arc, true); } }
  lums.forEach((l, i) => { if (l.popAt !== null && now - l.popAt < 0.4) E.sprite([D.LUMS[i][0] + 5, D.LUMS[i][1], ZB - 2], 14, "#fff1c4", Math.exp(-(now - l.popAt) / 0.12), true, 1); });
  fx = fx.filter((p) => { p.life += dt; if (p.life > p.max) return false; const t = p.life / p.max, o = [p.p[0], p.p[1], p.p[2]]; if (p.k === "spark") p.v[2] -= 300 * dt; for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * dt; if (p.k === "spark") E.line(o, p.p, 1.8, "#ffd27a", 1 - t, true); else E.sprite(p.p, 3 + 10 * t, lightTheme ? "#55524e" : "#3a3836", 0.45 * (1 - t)); return true; });
  // lettering: the board's door, the row tags, and the warning when a neutral's gone live
  const m = E.faceMatrix([fx0 + 0.05, DB.y + DB.d - 1, DBZ - 4], [0, -1, 0], [0, 0, -1]);
  if (m) svg += '<g transform="' + m + '"><text class="pt lo" x="3" y="4.4" font-size="2.5">DB-LIGHTING  400/230 V</text>' + [6, 14, 22].map((u, r) => '<text class="pt lo" x="' + (u + 2.5) + '" y="21.4" font-size="1.9" text-anchor="middle">L' + (r + 1) + "</text>").join("") + '<text class="pt lo" x="4" y="36" font-size="2">NEUTRAL LINK</text></g>';
  D.ROWS_Y.forEach((y, r) => { const p = E.project([-66, y, ZB + 6]); svg += '<text class="mk-lab row-t" data-state="' + (!mcb[r] ? "off" : rowShow[r] > d.max ? "bad" : rowShow[r] < d.off || rowShow[r] > 253 ? "warn" : "ok") + '" x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '" text-anchor="end">L' + (r + 1) + " " + (mcb[r] ? Math.round(rowShow[r]) + " V" : "off") + "</text>"; });
  if (liveN && neutral === "broken") { const p = E.project([-20, D.ROWS_Y[0] - 2, ZB + 10]); svg += '<text class="mk-lab nlive-t" x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '" text-anchor="middle">L1 neutral: ' + Math.round(n1) + " V</text>"; }
  if (E.xray > 0.02) svg += E.callouts([
    { p: atLink ? D.NT : D.NJ, text: atLink ? "Neutral link" : "L1 neutral joint", sub: neutral === "solid" ? inA.toFixed(1) + " A coming back through it" : neutral === "loose" ? "loose: arcing, " + Math.round(joint * 40) + " W" : "open circuit" },
    { p: [D.LUMS[0][0] + 5, D.LUMS[0][1], ZB - 2], text: "LED driver", sub: "rated " + d.name }, { p: [64, 20, ZB + 2.8], text: "Shared neutral", sub: "carries the difference between phases" },
  ], E.xray, E.fs < 0.62 ? {} : { topR: 70, topL: 220 });
  if (sceneG.innerHTML !== svg) sceneG.innerHTML = svg;
  // the phasor inset
  const pv = (p) => [D.PZ.cx + (p[1] / 230) * D.PZ.R, D.PZ.cy - (p[0] / 230) * D.PZ.R], Lp = pv(vn);
  pzN.setAttribute("cx", Lp[0].toFixed(1)); pzN.setAttribute("cy", Lp[1].toFixed(1));
  for (let r = 0; r < 3; r++) {
    const a = pv(nRow[r]);
    pzSp[r].setAttribute("x1", a[0].toFixed(1)); pzSp[r].setAttribute("y1", a[1].toFixed(1)); pzSp[r].style.opacity = mcb[r] && counts[r] > 0 ? "1" : "0.2";
    const sep = Math.hypot(a[0] - Lp[0], a[1] - Lp[1]) > 2.5;
    pzNr[r].style.display = sep ? "" : "none"; pzNr[r].setAttribute("cx", a[0].toFixed(1)); pzNr[r].setAttribute("cy", a[1].toFixed(1));
    pzT[r].textContent = "L" + (r + 1) + " " + (mcb[r] ? Math.round(rowShow[r]) : "off");
    pzT[r].dataset.state = !mcb[r] ? "off" : rowShow[r] > d.max ? "bad" : rowShow[r] < d.off || rowShow[r] > 253 ? "warn" : "ok";
  }
  const text = rowShow.map((v, r) => "L" + (r + 1) + " " + (mcb[r] ? Math.round(v) + " V" : "off")).join(" · ") + " · " + (atLink ? "neutral link " : "L1 neutral ") + neutral;
  if (readout.textContent !== text) readout.textContent = text;
}

function story() {
  const d = DRV();
  if (now - lastEventAt < 3.5 && lastEvent) return say(lastEvent);
  const live = [0, 1, 2].filter((r) => mcb[r] && counts[r] > 0);
  const dead = lums.filter((l) => l.st === "dead").length;
  if (where === "circuit" && neutral !== "solid") {
    const n1 = Math.round(Math.hypot(nRow[0][0], nRow[0][1]));
    if (neutral === "broken") return say(counts[0] === 0 ? "L1's neutral is broken, but there's nothing on L1 switched on to notice." : "L1's own neutral is broken. No return path, so the L1 row is simply off, and L2 and L3 don't notice because they've still got theirs. But the neutral at the L1 fittings now sits at " + n1 + " V through the drivers. It looks dead. It isn't.");
    return say("L1's own neutral is loose: the joint makes and breaks, so just the L1 row flickers and dims, and the joint heats up on its current. L2 and L3 are fine, they've still got their neutrals.");
  }
  if (neutral === "solid") return say(dead ? dead + " drivers dead from before, " + (mcb.some((m) => !m) ? "and a breaker's still tripped. " : "") + "Hit Replace to fit new ones." : "Neutral solid: every row gets its 230 V whatever the others are doing, and the neutral carries the out-of-balance current back. The dot in the triangle is the star point, sitting on 0 V. Now break something.");
  if (neutral === "loose") return say("A loose neutral: the joint makes and breaks and arcs, so the star point jumps about and the lights flicker and surge. The joint cooks itself on the neutral current. This is how most lost neutrals start.");
  if (live.length === 0) return say("All dark. " + dead + " drivers dead, " + mcb.filter((m) => !m).length + " breakers tripped, from one loose screw on the neutral link.");
  if (live.length === 2 && mcb.some((m) => !m)) return say("With a row tripped and no neutral, the other two rows are in series across 400 V, shared by how much each draws. " + live.map((r) => "L" + (r + 1) + " " + Math.round(rowShow[r]) + " V").join(", ") + ".");
  const RV = rowShow, hi = [0, 1, 2].reduce((a, r) => (RV[r] > RV[a] ? r : a), 0), lo = [0, 1, 2].reduce((a, r) => (RV[r] < RV[a] ? r : a), 0);
  if (RV[hi] - RV[lo] < 15) return say("No neutral, but the rows are balanced, so the star point sits in the middle and nothing looks wrong. It's a time bomb: switch one row down and watch.");
  return say("No neutral, so the star point floats toward the heaviest row. L" + (lo + 1) + " (" + counts[lo] + " on) drops to " + Math.round(RV[lo]) + " V, L" + (hi + 1) + " (" + counts[hi] + " on) climbs to " + Math.round(RV[hi]) + " V." + (RV[hi] > d.max ? " That's past the " + d.max + " V the drivers are rated for." : RV[hi] > 253 ? " Above 253 V but inside these drivers' " + d.max + " V." : ""));
}

const TOUR = [
  { w: "link", n: "solid", drv: "narrow", c: [4, 2, 1], acts: [[5, "end"]] },
  { w: "circuit", n: "solid", drv: "narrow", c: [4, 2, 1], acts: [[1, "break"], [9, "end"]] },
  { w: "link", n: "solid", drv: "narrow", c: [4, 2, 1], acts: [[1, "break"], [14, "end"]] },
  { w: "link", n: "solid", drv: "narrow", c: [4, 4, 4], acts: [[1, "break"], [6, "c3"], [16, "end"]] },
  { w: "link", n: "solid", drv: "narrow", c: [4, 3, 2], acts: [[1, "loose"], [10, "end"]] },
  { w: "link", n: "solid", drv: "narrow", c: [4, 4, 2], acts: [[1, "break"], [9, "end"]] },
  { w: "link", n: "solid", drv: "wide", c: [4, 4, 2], acts: [[1, "break"], [9, "end"]] },
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
      where = s.w; neutral = s.n; drvKind = s.drv; counts = [...s.c]; fresh();
      actions = s.acts.map(([w, a]) => [tourClock + w, a]);
    }
    while (actions.length && tourClock >= actions[0][0]) {
      const a = actions.shift()[1];
      if (a === "break") neutral = "broken"; else if (a === "loose") neutral = "loose"; else if (a === "c3") counts = [4, 4, 1]; else if (a === "end") actions = [];
    }
  }
  const n = 12;
  for (let i = 0; i < n; i++) step(sdt / n);
  draw(sdt); syncUi(); story();
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { touring = false; actions = []; };
const guard = (fn) => (...a) => { takeOver(); fn(...a); run(); };
const setN = guard((v) => { neutral = v; });
const setWhere = guard((v) => { where = v; });
const setDrv = guard((v) => { drvKind = v; fresh(); });
const setRow = guard((r, v) => { counts[r] = v; });
const doFresh = guard(() => fresh());
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;

ui.n.forEach((b) => b.addEventListener("click", () => setN(b.dataset.n)));
ui.where.forEach((b) => b.addEventListener("click", () => setWhere(b.dataset.where)));
ui.drv.forEach((b) => b.addEventListener("click", () => setDrv(b.dataset.drv)));
ui.rows.forEach((el, r) => el.addEventListener("input", () => setRow(r, +el.value)));
ui.fresh.addEventListener("click", doFresh);
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; tourClock = 0; actions = []; } run(); });
onTap(() => setN(neutral === "solid" ? "broken" : "solid"));
stage.addEventListener("keydown", (ev) => {
  const map = { x: () => { setX(!E.xrayOn); run(); }, " ": () => setN(neutral === "solid" ? "broken" : "solid"), n: () => setN(neutral === "solid" ? "loose" : neutral === "loose" ? "broken" : "solid"), b: () => setWhere(where === "link" ? "circuit" : "link"), w: () => setDrv(drvKind === "narrow" ? "wide" : "narrow"), r: doFresh, "1": () => setRow(0, (counts[0] + 1) % 5), "2": () => setRow(1, (counts[1] + 1) % 5), "3": () => setRow(2, (counts[2] + 1) % 5), s: () => { slow = !slow; run(); } };
  if (map[ev.key]) { ev.preventDefault(); map[ev.key](); }
});
window.__fig = { E, freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
draw(); syncUi(); story();
`;

const CSS = `.pz-wrap{left:14px;top:50px;width:21%;max-width:190px;min-width:124px;padding:0}.pz{display:block;width:100%;height:auto}
.pz-h{font-family:var(--anatomy-mono);font-size:7px;letter-spacing:.08em;fill:var(--anatomy-lo)}.pz-tri{fill:none;stroke:var(--anatomy-lo);stroke-width:.6;stroke-dasharray:2 2}.pz-zero{stroke:var(--anatomy-mid);stroke-width:.7}.pz-sp{stroke-width:2;stroke-linecap:round}
.pz-sp.ph-l1,.pz-v.ph-l1{stroke:#d9534f;fill:#d9534f}.pz-sp.ph-l2,.pz-v.ph-l2{stroke:#cfcfca;fill:#cfcfca}.pz-sp.ph-l3,.pz-v.ph-l3{stroke:#3d7bd9;fill:#3d7bd9}
body[data-theme="light"] .pz-sp.ph-l2,body[data-theme="light"] .pz-v.ph-l2{stroke:#9a9a95;fill:#9a9a95}
.pz-n{fill:#ffb347;stroke:var(--mk-stage-b);stroke-width:.8}.pz-nr{fill:var(--mk-stage-b);stroke:#ff6a3d;stroke-width:1}
.pz-t{font-family:var(--anatomy-mono);font-size:7px;fill:var(--anatomy-mid)}.pz-t[data-state="bad"]{fill:#ff5a2a}.pz-t[data-state="warn"]{fill:#ffb347}.pz-t[data-state="off"]{fill:var(--anatomy-lo)}
.pt{font-family:var(--anatomy-mono);fill:#23262b;font-weight:600}.pt.lo{fill:#4a5058}
.row-t[data-state="bad"]{fill:#ff5a2a}.row-t[data-state="warn"]{fill:#ffb347}.row-t[data-state="off"]{fill:var(--anatomy-lo)}.nlive-t{fill:#ff4a3d}
@media (max-width:560px){.pz-wrap{top:auto;width:34%}}
.ph{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px}.meter .band{position:absolute;top:0;bottom:0;background:rgba(61,220,132,.18)}.mark.quiet{border-left-style:dotted;opacity:.6}.mark.quiet::after{content:none}`;

const stage = stageHtml({
  W, H, fig: "Fig 13", title: "Lost neutral", xray: true,
  label: "A lighting gantry over a warehouse floor: twelve LED high bays in three rows, each row on its own phase, all sharing one neutral back to the lighting distribution board, which has three breakers and a neutral link. An inset shows where the star point has floated to.",
  keysHelp: "Lighting array: drag to rotate, X for x-ray, space breaks or fixes the neutral, N cycles solid, loose and broken, 1 2 3 change how many lights are on per row, W swaps the drivers, R replaces dead ones",
  extra: `<div class="mk-inset pz-wrap" aria-hidden="true">${phasorSvg}</div>`,
});

const CONTROLS = `<div class="ctl" role="group" aria-label="Test controls">
  <div class="ctl-row"><span class="ctl-label">Where</span><button type="button" data-where="circuit" aria-pressed="false">L1's own neutral<small>one circuit</small></button><button type="button" data-where="link" aria-pressed="true">Board neutral link<small>shared by all three rows</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Neutral</span><button type="button" data-n="solid" aria-pressed="true">Solid</button><button type="button" data-n="loose" aria-pressed="false">Loose<small>making and breaking</small></button><button type="button" data-n="broken" aria-pressed="false">Broken</button></div>
  <div class="ctl-row"><span class="ctl-label">Drivers</span><button type="button" data-drv="narrow" aria-pressed="true">Narrow<small>198 to 264 V</small></button><button type="button" data-drv="wide" aria-pressed="false">Wide range<small>90 to 305 V</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Lights on</span><span class="ph" style="background:#d9534f"></span>${countRow(0, "#d9534f", 4)}<span class="ph" style="background:#bdbdb8"></span>${countRow(1, "#e8e8e4", 2)}<span class="ph" style="background:#3d7bd9"></span>${countRow(2, "#3d7bd9", 1)}</div>
  ${meterRow(0, "#d9534f")}${meterRow(1, "#bdbdb8")}${meterRow(2, "#3d7bd9")}
  <div class="ctl-row"><span class="ctl-label">Neutral</span><span id="stats"></span></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="fresh">Replace dead drivers</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
</div>`;


const foot = footHtml({
  theme, slug: "lost-neutral",
  real: "400/230 V three-phase four-wire, the AS 60038 range of 230 V +10 %/−6 % (216 to 253 V), the floating star point (Millman's theorem), and typical driver input ranges of 198 to 264 V (narrow) and 90 to 305 V (wide range, Mean Well HLG style).",
  made: "150 W fittings treated as fixed loads while running (real constant-power drivers can make it worse), where drivers drop out, how fast they die above their rating, the MOV failing short and tripping the row, and the loose joint's behaviour.",
});
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), pageMk2({
  k, title: "Lost neutral", fig: "Fig 13", hint: "Tap: break the neutral", theme, W, H, stage, controls: CONTROLS, css: CSS, foot,
  caption: "Three rows of LED high bays, one row per phase. Each row has its own neutral back to the board's neutral link, and the link takes them all home. Break one row's own neutral and that row just goes off, though its neutral is now live through the drivers. Break the shared link instead and nothing goes off. With the link connected, each row gets its 230 V no matter what the others are doing. Lose it and the star point floats: it slides toward the most heavily loaded row, so that row drops and the lightly loaded row climbs toward 400 V. A driver that sees too little drops out, and one that sees too much cooks its surge protection and dies, often short, which trips its row. Then the two rows left are in series across 400 V and it cascades. Balanced loads hide it completely, until somebody switches a row off.",
  script: LIVE.replace("__DATA__", JSON.stringify(DATA)),
}));
console.log("wrote", name);
