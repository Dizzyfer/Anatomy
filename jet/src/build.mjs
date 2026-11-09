import { writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { kitScript } from "../../scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";

const W = 680;
const H = 500;

// Truth (GE9X, GE Aerospace / Key Aero): 3.4 m (134 in) fan, 16 composite blades, 3-stage booster, 11-stage HPC at 27:1,
// CMC combustor liners, 2-stage HPT, 6-stage TiAl LPT, bypass about 10:1, overall pressure ratio 60:1, about 100,000 lbf
// take-off, 134,300 lbf (597 kN) record on test. Certification needs a fan blade released at full power to stay inside the
// case, and bird ingestion. Toy: the engine model (spool times, EGT, thrust curve), the failure behaviour and the stand.
const ZC = 300;
const PLATE = { x: -300, y: -200, w: 620, d: 400, r: 16 };
const PLATE_H = 16, FOOT_H = 6;
const P = k.fitProjection([...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [-260, -210, ZC + 212], [300, -210, ZC + 212], [300, 210, ZC + 212], [-260, 210, ZC + 212], [-150, 0, ZC + 380], [220, 0, ZC + 380]], W, H, { pad: 10, azimuth: 45 });
const Sv = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const depth2 = ([x, y]) => k.depthOf([x, y, 0], P);
const byDepth = (pts) => [...pts].sort((a, b) => depth2(a) - depth2(b));

function plate() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 30))) {
    out.push(Sv(k.cylinder(x, y, 9, -PLATE_H - FOOT_H, 2, P, 28), { tone: "lo" }));
    out.push(Sv(k.cylinder(x, y, 7, -PLATE_H - FOOT_H + 2, FOOT_H - 2, P, 28), { tone: "mid" }));
  }
  out.push(Sv(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 2), { tone: "mid", inner: L(k.sideSeam(PLATE, -PLATE_H / 2, P), { tone: "faint" }) }));
  // blast deflector lines on the floor behind the engine
  const lines = [];
  for (let i = 0; i < 7; i++) lines.push(k.segment([-290, -150 + i * 50, 0.2], [-240, -150 + i * 50, 0.2], P));
  out.push(`<path class="floorline" d="${lines.join("")}"/>`);
  return out.join("");
}
const svg = k.figureSvg({
  width: W, height: H,
  label: "A cutaway of a large high-bypass turbofan, the size of the GE9X, on a test stand. The near half of the nacelle and casings is cut away to show the fan, the booster, the 11-stage high-pressure compressor, the combustor, the two-stage high-pressure turbine and the six-stage low-pressure turbine, with air flowing through the bypass duct and the core.",
  body: [plate(), `<g data-part="eng"><g data-part="stand"></g><g data-part="shells"></g><g data-part="far"></g><g data-part="sections"></g><g data-part="near"></g><g data-part="labels"></g></g>`],
});
const DATA = { W, H, P, ZC };

const LIVE = `
const D = __DATA__;
const PR = D.P, ZC = D.ZC;
const stage = document.querySelector(".fx-stage");
const q = (n) => stage.querySelector('[data-part="' + n + '"]');
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const svgEl = stage.querySelector("svg"), cv = stage.querySelector(".fx-smoke"), ctx = cv.getContext("2d"), flashEl = stage.querySelector(".fx-flash");
const engG = q("eng"), standG = q("stand"), shellsG = q("shells"), farG = q("far"), secG = q("sections"), nearG = q("near"), labG = q("labels");
const o0 = depthOf([0, 0, 0], PR);
const VIEW = [depthOf([1, 0, 0], PR) - o0, depthOf([0, 1, 0], PR) - o0, depthOf([0, 0, 1], PR) - o0];
const LIGHT = (() => { const v = [0.45, 0.55, 1]; const n = Math.hypot(...v); return v.map((a) => a / n); })();
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mixc = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const css = (c) => "rgb(" + c.map((v) => Math.round(clamp(v, 0, 255))).join(",") + ")";
const pt = (x, r, f) => [x, r * Math.cos(f), ZC + r * Math.sin(f)];
const sp = (p) => { const a = iso(p, PR); return a[0].toFixed(1) + " " + a[1].toFixed(1); };
function normalOf(pts) { let n = [0, 0, 0]; for (let i = 0; i < pts.length; i++) { const p = pts[i], q2 = pts[(i + 1) % pts.length]; n[0] += (p[1] - q2[1]) * (p[2] + q2[2]); n[1] += (p[2] - q2[2]) * (p[0] + q2[0]); n[2] += (p[0] - q2[0]) * (p[1] + q2[1]); } const l = Math.hypot(...n) || 1; return n.map((v) => v / l); }
function shadeHex(hex, n, emit) { const d = Math.max(0, dot(n, LIGHT)); let c = rgb(hex).map((v) => v * (0.45 + 0.65 * d)); if (emit) c = mixc(c, rgb(emit[0]), emit[1]); return css(c); }
const face = (pts, fill, extra = "") => '<path d="M' + pts.map(sp).join("L") + 'Z" fill="' + fill + '"' + extra + "/>";
const lerpProf = (prof, x) => { for (let i = 0; i < prof.length - 1; i++) { const [x0, r0] = prof[i], [x1, r1] = prof[i + 1]; if ((x <= x0 && x >= x1) || (x >= x0 && x <= x1)) return r0 + (r1 - r0) * ((x - x0) / (x1 - x0 || 1)); } return prof[x > prof[0][0] ? 0 : prof.length - 1][1]; };

// ---------------- geometry (cm, x forward, inlet at +x) ----------------
const NAC_OUT = [[300, 186], [292, 198], [270, 205], [210, 208], [120, 204], [40, 195], [-40, 181]];
const NAC_IN = [[300, 186], [292, 176], [270, 172], [220, 171], [200, 170], [150, 170], [60, 168], [-40, 166]];
const CORE_OUT = [[160, 74], [140, 82], [100, 92], [60, 96], [10, 94], [-60, 86], [-130, 76], [-185, 67]];
const CORE_IN = [[160, 72], [150, 70], [130, 68], [112, 62], [60, 54], [2, 46], [-8, 52], [-25, 58], [-60, 58], [-68, 54], [-90, 56], [-120, 62], [-160, 66], [-185, 65]];
const HUB = [[200, 55], [175, 52], [160, 50], [130, 48], [112, 39], [2, 36], [-8, 34], [-60, 34], [-68, 38], [-90, 40], [-120, 42], [-185, 44], [-200, 40], [-265, 2]];
const COWL_IN = CORE_OUT.map(([x, r], i) => [x, i === 0 ? r : r - 3.5]);
const CASE_OUT = CORE_IN.map(([x, r], i) => [x, i === 0 ? r : r + 3.5]);
const SPIN = [[274, 0], [262, 22], [240, 40], [215, 52], [200, 55]];
const ROWS = [];
// fan exit guide vanes (still), booster, HPC, HPT, LPT
for (let i = 0; i < 3; i++) ROWS.push({ kind: "boost", x: 155 - 14 * i, n: 13, col: "#9aa3ad", chord: 8, tw: 0.25, spool: 1 });
for (let i = 0; i < 11; i++) ROWS.push({ kind: "hpc", x: 106 - 10.4 * i, n: 13, col: i < 6 ? "#b4bac1" : "#b8ab98", chord: 6, tw: 0.3, spool: 2 });
for (let i = 0; i < 2; i++) ROWS.push({ kind: "hpt", x: -70 - 13 * i, n: 12, col: "#c49a6c", chord: 8, tw: -0.35, spool: 2 });
for (let i = 0; i < 6; i++) ROWS.push({ kind: "lpt", x: -98 - 14.5 * i, n: 14, col: "#8d8780", chord: 7, tw: -0.3, spool: 1 });
ROWS.forEach((r) => { r.rIn = lerpProf(HUB, r.x) + 1; r.rOut = lerpProf(CORE_IN, r.x) - 1; });
const OGV = { x: 128, n: 14, rIn: lerpProf(CORE_OUT, 128) + 1, rOut: lerpProf(NAC_IN, 128) - 1 };

// ---------------- static drawing ----------------
function surface(prof, side, col, n = 18, f0 = Math.PI / 2, f1 = Math.PI * 1.5) {
  const out = [];
  for (let i = 0; i < prof.length - 1; i++) for (let j = 0; j < n; j++) {
    const a = f0 + ((f1 - f0) * j) / n, b = f0 + ((f1 - f0) * (j + 1)) / n, fm = (a + b) / 2;
    const [x0, r0] = prof[i], [x1, r1] = prof[i + 1];
    const pts = [pt(x0, r0, a), pt(x1, r1, a), pt(x1, r1, b), pt(x0, r0, b)];
    let nn = normalOf(pts);
    const radial = [0, Math.cos(fm), Math.sin(fm)];
    if (dot(nn, radial) * side < 0) nn = nn.map((v) => -v);
    if (dot(nn, VIEW) <= 0) continue;
    const c = pts.reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4, s[2] + p[2] / 4], [0, 0, 0]);
    out.push({ d: dot(c, VIEW), s: face(pts, shadeHex(col, nn)) });
  }
  return out;
}
function buildStatic() {
  // stand: two legs and a cradle under the engine
  let st = "";
  const box = (x0, x1, y0, y1, z0, z1, col) => { const c = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; let s = ""; const fs = [[...c.map(([x, y]) => [x, y, z1])], [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]]; for (const f of fs) s += face(f, shadeHex(col, normalOf(f).map((v) => (dot(normalOf(f), VIEW) < 0 ? -v : v)))); return s; };
  for (const x of [-70, 150]) { const top = x < 0 ? ZC - lerpProf(CORE_OUT, x) : ZC - lerpProf(NAC_OUT, x); st += box(x - 10, x + 10, -90, -70, 0, top + 4, "#4a5058") + box(x - 10, x + 10, 70, 90, 0, top + 4, "#4a5058") + box(x - 12, x + 12, -92, 92, top - 8, top, "#5a6068"); }
  st += box(-90, 170, -100, 100, 0, 10, "#3b4047");
  standG.innerHTML = st;
  const fs = [...surface(NAC_OUT, 1, "#d7dbe0"), ...surface(NAC_IN, -1, "#4f565e"), ...surface(CORE_OUT, 1, "#7b828a"), ...surface(COWL_IN, -1, "#3a3e44"), ...surface(CASE_OUT, 1, "#4c5259"), ...surface(CORE_IN, -1, "#6a7078"), ...surface(HUB, 1, "#585e66")];
  fs.sort((a, b) => a.d - b.d);
  shellsG.innerHTML = fs.map((f) => f.s).join("");
  // the cut faces, top and bottom
  let sec = "";
  for (const sgn of [1, -1]) {
    const P2 = (x, r) => [x, 0, ZC + sgn * r];
    const poly = (a, b, col) => face([...a.map(([x, r]) => P2(x, r)), ...b.slice().reverse().map(([x, r]) => P2(x, r))], col, ' class="sec"');
    sec += poly(NAC_OUT, NAC_IN, "#e2d3b4");
    sec += poly(CORE_OUT, COWL_IN, "#b5573c"); sec += poly(CASE_OUT, CORE_IN, "#b5573c");
    sec += face([P2(160, 72), P2(160, 74), P2(150, 77), P2(150, 70)], "#b5573c");
    sec += poly(HUB, HUB.map(([x]) => [x, 6]), "#3d4249");
    for (const r of ROWS) sec += face([P2(r.x - 1.6, 8), P2(r.x + 1.6, 8), P2(r.x + 1.6, r.rIn - 1), P2(r.x - 1.6, r.rIn - 1)], r.kind === "hpt" ? "#a0785a" : "#7a8088");
    sec += face([P2(205, 0), P2(-265, 0), P2(-265, 5), P2(205, 5)], "#c9ced4");
    // combustor liner outline
    sec += '<path class="liner" d="M' + [P2(-6, 39), P2(-56, 39), P2(-56, 54), P2(-6, 52)].map(sp).join("L") + 'Z"/>';
    sec += '<path class="nozzle" d="M' + sp(P2(4, 45)) + "L" + sp(P2(-8, 46)) + '"/>';
  }
  secG.innerHTML = sec + '<g class="flames"></g>';
  // labels under the engine
  const lab = [["FAN", 200, "3.4 m · 16 blades"], ["BOOSTER", 142, "3 stages"], ["HPC", 55, "11 stages · 27:1"], ["COMBUSTOR", -30, "CMC liners"], ["HPT", -76, "2 stages"], ["LPT", -134, "6 stages"]];
  let lb = "";
  lab.forEach(([t, x, s], i) => {
    const r0 = x === 200 ? 150 : lerpProf(CORE_IN, x) - 6, a = [x, 0, ZC + r0], b = [x, 0, ZC + 228 + [0, 2, 1, 0, 2, 1][i] * 64];
    const A = iso(a, PR), B = iso(b, PR);
    lb += '<circle class="dotl" cx="' + A[0].toFixed(1) + '" cy="' + A[1].toFixed(1) + '" r="1.6"/><path class="lead" d="M' + A[0].toFixed(1) + " " + A[1].toFixed(1) + "L" + B[0].toFixed(1) + " " + B[1].toFixed(1) + '"/><text class="lab" text-anchor="' + (x < 0 ? "end" : "start") + '" x="' + (B[0] + (x < 0 ? -3 : 3)).toFixed(1) + '" y="' + (B[1] - 1).toFixed(1) + '">' + t + '<tspan class="sub" x="' + (B[0] + (x < 0 ? -3 : 3)).toFixed(1) + '" dy="10">' + s + "</tspan></text>";
  });
  labG.innerHTML = lb;
}
buildStatic();

// ---------------- the engine model (toy, scaled to a GE9X-class engine) ----------------
let thr = 0.0, fadec = true, n1 = 0.2, n2 = 0.62, egt = 480, egtSpike = 0, F = 0, vib = 0.03, dmgFan = 0, hpt = 0;
let state = "run", stateAt = 0, lastShot = "", lastEvent = "", lastEventAt = -10, fanA = 0, coreA = 0, lpA = 0;
let now = 0, last = 0, frame = 0, visible = false, touring = true, slow = false, tourClock = 0, tourStep = -1, actions = [];
let birds = [], bladeOff = null, burst = null, surges = [], dent = null, tips = new Array(16).fill(1), shake = 0, flashT = -9, fireT = -9;
const event = (t) => { lastEvent = t; lastEventAt = now; };
const setState = (s) => { state = s; stateAt = now; };
let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const kOf = (n) => Math.max(0, (n - 0.2) / 0.8);
function step(dt) {
  const running = state === "run" || state === "surging";
  const cmd = state === "run" ? 0.2 + 0.8 * thr : state === "surging" ? 0.2 + 0.8 * thr * 0.7 : 0.0;
  const tau = cmd > n1 ? 2.2 : state === "seized" ? 0.9 : 1.6;
  n1 += (cmd - n1) * Math.min(1, dt / tau);
  n2 += ((running ? 0.62 + 0.38 * kOf(n1) : n1 * 0.9) - n2) * Math.min(1, dt / 1.2);
  const k = kOf(n1);
  let egtT = running ? 470 + 480 * Math.pow(k, 1.25) : 120 + 200 * n1;
  if (fadec && egtT > 1060) egtT = 1060;
  egt += (egtT + egtSpike - egt) * Math.min(1, dt / 1.4);
  egtSpike *= Math.exp(-dt * 1.2);
  F = running ? 445 * (0.03 + 0.97 * Math.pow(k, 1.8)) * (1 - dmgFan * 0.25) : 0;
  vib += ((0.03 + dmgFan * 1.6 * n1 + (bladeOff ? 6 * n1 : 0)) - vib) * Math.min(1, dt / 0.4);
  // too hot for too long with the FADEC switched off: the HP turbine lets go
  if (running && !fadec && egt > 1090) { hpt += dt * (egt - 1090) / 45; if (hpt > 1) turbineBurst(); }
  // surges come in pairs and threes after a flock
  surges = surges.filter((s) => { if (now >= s) { surge(); return false; } return true; });
  if (state === "surging" && now - stateAt > 0.9) setState("run");
  if ((state === "shutdown" || state === "seized") && now - stateAt > (state === "seized" ? 8.5 : 6.5)) newEngine();
}
function newEngine() { setState("run"); dmgFan = 0; hpt = 0; bladeOff = null; burst = null; dent = null; tips = new Array(16).fill(1); egtSpike = 0; vib = 0.03; fadec = true; thr = Math.min(thr, 1); n1 = 0.2; n2 = 0.62; egt = 480; event("Fresh engine on the stand. FADEC back on."); }
function surge() {
  if (state !== "run" && state !== "surging") return;
  setState("surging"); egtSpike += 260; n1 *= 0.86; flashT = now; shake = Math.max(shake, 0.5);
  for (let i = 0; i < 40; i++) flame(190 + rnd() * 90, (rnd() - 0.5) * 100, (rnd() - 0.5) * 100, 220 + rnd() * 260, 1);
  for (let i = 0; i < 40; i++) flame(-200, (rnd() - 0.5) * 60, (rnd() - 0.5) * 60, -300 - rnd() * 260, 1.2);
}
function birdHit(b) {
  const big = b.flock;
  dmgFan = Math.min(1, dmgFan + (big ? 0.25 : 0.12));
  const bl = Math.floor(rnd() * 16); tips[bl] = Math.min(tips[bl], 0.93 - (big ? 0.06 : 0));
  for (let i = 0; i < 26; i++) feather(200, b.y + (rnd() - 0.5) * 30, b.z + (rnd() - 0.5) * 30);
  if (Math.abs(b.z) + Math.abs(b.y) < 70 && rnd() < 0.6) egtSpike += 60;
  if (big && dmgFan > 0.6 && state === "run") { surges.push(now + 0.25, now + 1.1, now + 1.9); setTimeout(() => {}, 0); shutdownAt = now + 2.6; }
}
let shutdownAt = null;
function bladeRelease() {
  if (state !== "run" && state !== "surging") return;
  // release the blade that's on the far, upper side so you can see it hit the case
  const a = Math.PI * 0.82, idx = ((Math.round(((a - fanA) / (Math.PI * 2)) * 16) % 16) + 16) % 16;
  bladeOff = { t: now, idx, a: fanA + (idx / 16) * Math.PI * 2, r: 110, frags: [] };
  tips[idx] = 0;
  setState("seized"); shake = 1.6; flashT = now;
  dent = { a: bladeOff.a + 0.25, x: 200 };
  for (let i = 0; i < 16; i++) if (i !== idx) tips[i] = Math.min(tips[i], 0.45 + rnd() * 0.4);
  for (let i = 0; i < 14; i++) bladeOff.frags.push({ x: 200 + (rnd() - 0.5) * 30, r: 140 + rnd() * 25, a: bladeOff.a + rnd() * 0.6, va: 9 + rnd() * 9, vx: -(120 + rnd() * 200), s: 6 + rnd() * 12, rot: rnd() * 6 });
  for (let i = 0; i < 90; i++) { const p = pt(205, 168, dent.a + (rnd() - 0.5) * 0.3); spark(p, 1.4); }
  event("Fan blade off at full power. It hits the case at well over 1,000 km/h, the carbon case holds it, and the next blades chew the rest. Contained: that's the certification test passed. Engine's scrap.");
}
function turbineBurst() {
  if (burst) return;
  burst = { t: now, chunks: [] };
  setState("shutdown"); shake = 1.4; flashT = now; fireT = now; egtSpike = 0;
  for (let i = 0; i < 9; i++) { const a = Math.PI / 2 + rnd() * Math.PI; burst.chunks.push({ p: pt(-76, 56, a), v: [(rnd() - 0.5) * 300, Math.cos(a) * (500 + rnd() * 400), Math.sin(a) * (500 + rnd() * 400)], s: 4 + rnd() * 6 }); }
  for (let i = 0; i < 70; i++) spark(pt(-76, 60, Math.PI / 2 + rnd() * Math.PI), 1.2);
  event("HP turbine burst. With the FADEC off nothing trimmed the fuel, the blades crept and let go, and a disc that size is too heavy to contain. That's why the limits exist.");
}

// ---------------- particles ----------------
let parts = [];
const pr2 = (p) => iso(p, PR);
function flow(kind) { parts.push({ kind, x: 430 + rnd() * 40, s: rnd(), side: rnd() < 0.5 ? 1 : -1, life: 0, max: 99 }); }
function flame(x, y, z, vx, s) { parts.push({ kind: "flame", p: [x, y, ZC + z], v: [vx, (rnd() - 0.5) * 60, (rnd() - 0.5) * 60], life: 0, max: 0.5 + rnd() * 0.5, s }); }
function feather(x, y, z) { parts.push({ kind: "feather", p: [x, y, ZC + z], v: [-(200 + rnd() * 300), (rnd() - 0.5) * 120, (rnd() - 0.5) * 120], life: 0, max: 1.2 + rnd(), s: 1 }); }
function spark(p, s) { const a = rnd() * Math.PI * 2; parts.push({ kind: "spark", p: [...p], v: [(rnd() - 0.5) * 400, Math.cos(a) * 400 * s, Math.sin(a) * 400 * s + 100], life: 0, max: 0.5 + rnd() * 0.7, s }); }
function smoke(p, s) { parts.push({ kind: "smoke", p: [...p], v: [(rnd() - 0.5) * 30, (rnd() - 0.5) * 30, 60 + rnd() * 50], life: 0, max: 2 + rnd() * 1.5, s }); }
function bounds(kind, x) {
  if (kind === "byp") { if (x > 300) return [0, 172]; if (x > 160) return [lerpProf(HUB, Math.min(x, 200)), lerpProf(NAC_IN, x)]; if (x > -40) return [lerpProf(CORE_OUT, x), lerpProf(NAC_IN, x)]; const g = (-40 - x) / 260; return [lerpProf(CORE_OUT, Math.max(x, -185)) * (1 - g), 166 + 30 * g]; }
  if (x > 160) return [lerpProf(HUB, Math.min(x, 200)), 72];
  if (x > -185) return [lerpProf(HUB, x), lerpProf(CORE_IN, x)];
  const g = (-185 - x) / 300; return [Math.max(0, 44 - 44 * g * 3), 65 + 60 * g];
}
function sizeCanvas() { const r = svgEl.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr)); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } }
function drawParticles(dt) {
  sizeCanvas();
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.setTransform(cv.width / D.W, 0, 0, cv.height / D.H, 0, 0);
  const sx = shakeOff[0], sy = shakeOff[1];
  ctx.translate(sx, sy);
  const v = 160 + 900 * n1 * (state === "run" || state === "surging" ? 1 : 0.4);
  const spawn = (state === "run" || state === "surging" ? 150 : 25) * (0.3 + n1);
  for (let i = 0; i < spawn * dt; i++) flow(rnd() < 0.85 ? "byp" : "core");
  parts = parts.filter((p) => {
    p.life += dt;
    if (p.kind === "byp" || p.kind === "core") {
      const core = p.kind === "core";
      const sp2 = core ? (p.x < -10 ? v * 1.7 : v) : v * (p.x < 160 ? 1.1 : 1);
      p.x -= sp2 * dt;
      if (core && p.x < 160 && p.x > 158 - sp2 * dt && false) return true;
      if (p.x < (core ? -520 : -330)) return false;
      const [a, b] = bounds(p.kind, p.x), r = a + (b - a) * (0.1 + 0.8 * p.s);
      const P2 = pr2([p.x, 0, ZC + p.side * r]);
      let col, al = 0.75;
      if (!core) { col = "150,215,255"; if (p.x < -40) al = 0.75 * clamp(1 - (-40 - p.x) / 290, 0, 1); }
      else if (p.x > 10) { const t = clamp((160 - p.x) / 150, 0, 1); col = Math.round(150 + 105 * t) + "," + Math.round(215 + 20 * t) + "," + Math.round(255 - 60 * t); }
      else if (p.x > -60) col = "255,236,170";
      else { const t = clamp((-60 - p.x) / 160, 0, 1); col = "255," + Math.round(200 - 110 * t) + "," + Math.round(90 - 60 * t); if (p.x < -185) al = 0.75 * clamp(1 - (-185 - p.x) / 330, 0, 1); }
      if (p.x > 160 && core) col = "150,215,255";
      if (p.x > 300) al *= clamp((470 - p.x) / 120, 0, 1);
      const T2 = pr2([p.x + sp2 * 0.018, 0, ZC + p.side * r]);
      ctx.strokeStyle = "rgba(" + col + "," + al.toFixed(2) + ")"; ctx.lineWidth = core ? 1.5 : 1.3;
      ctx.beginPath(); ctx.moveTo(P2[0], P2[1]); ctx.lineTo(T2[0], T2[1]); ctx.stroke();
      return true;
    }
    if (p.life > p.max) return false;
    const t = p.life / p.max;
    if (p.kind === "spark") p.v[2] -= 900 * dt;
    if (p.kind === "feather") { p.v[2] -= 120 * dt; p.v[0] *= 0.99; }
    for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * dt;
    if (p.p[2] < 0) { p.p[2] = 0; p.v[2] *= -0.3; }
    const P2 = pr2(p.p);
    const soft = (r, c, a) => { const g = ctx.createRadialGradient(P2[0], P2[1], 0, P2[0], P2[1], r); g.addColorStop(0, "rgba(" + c + "," + a.toFixed(3) + ")"); g.addColorStop(1, "rgba(" + c + ",0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(P2[0], P2[1], r, 0, 7); ctx.fill(); };
    if (p.kind === "flame") soft((6 + 20 * t) * p.s, t < 0.3 ? "255,230,150" : "255,120,40", 0.8 * (1 - t));
    if (p.kind === "smoke") soft((8 + 30 * t) * p.s, "60,60,64", 0.55 * (1 - t));
    if (p.kind === "spark") { ctx.fillStyle = "rgba(255," + Math.round(210 - 120 * t) + ",90," + (1 - t).toFixed(2) + ")"; ctx.fillRect(P2[0] - 1, P2[1] - 1, 2.2, 2.2); }
    if (p.kind === "feather") { ctx.fillStyle = t < 0.15 ? "rgba(180,40,40," + (0.7 * (1 - t)).toFixed(2) + ")" : "rgba(235,232,225," + (1 - t).toFixed(2) + ")"; ctx.beginPath(); ctx.ellipse(P2[0], P2[1], 3, 1.3, p.life * 6, 0, 7); ctx.fill(); }
    return true;
  });
  // birds
  for (const b of birds) {
    const P2 = pr2([b.x, b.y, ZC + b.z]), fl = Math.sin(now * 14 + b.ph) * 5;
    ctx.fillStyle = "#3a332b"; ctx.strokeStyle = "#3a332b"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(P2[0], P2[1], 7, 3, -0.45, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(P2[0] - 4, P2[1]); ctx.lineTo(P2[0] - 2, P2[1] - 8 - fl); ctx.moveTo(P2[0] + 2, P2[1] - 1); ctx.lineTo(P2[0] + 6, P2[1] - 9 - fl); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(P2[0] - 6, P2[1] + 3); ctx.lineTo(P2[0] - 11, P2[1] + 6); ctx.stroke();
  }
  // exhaust heat shimmer
  if (n1 > 0.4 && (state === "run" || state === "surging")) { ctx.strokeStyle = "rgba(255,170,110," + (0.12 * n1).toFixed(3) + ")"; ctx.lineWidth = 1; for (let i = 0; i < 6; i++) { const x = -230 - ((now * 300 + i * 60) % 260), P2 = pr2([x, 0, ZC + Math.sin(i * 2.1 + now * 3) * 30]); ctx.beginPath(); ctx.moveTo(P2[0] - 6, P2[1]); ctx.quadraticCurveTo(P2[0], P2[1] - 4, P2[0] + 6, P2[1]); ctx.stroke(); } }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// ---------------- rotors ----------------
function fanBlade(i, near) {
  const base = fanA + (i / 16) * Math.PI * 2, tip = tips[i];
  if (tip <= 0) return null;
  const rT = 55 + (168 - 55) * tip, rM = 55 + (rT - 55) * 0.5;
  const hub = 55, LE = (r) => 226 - (r - 55) * 0.03, TE = (r) => 186 + (r - 55) * 0.07, tw = (r) => 0.42 - 0.2 * ((r - 55) / 113);
  const pts = [pt(LE(hub), hub, base), pt(LE(rM), rM, base + 0.02), pt(LE(rT), rT, base + 0.06), pt(TE(rT), rT, base + 0.06 + tw(rT)), pt(TE(rM), rM, base + 0.02 + tw(rM)), pt(TE(hub), hub, base + tw(hub))];
  const cy = pts.reduce((s2, p) => s2 + p[1], 0) / 6;
  if ((cy > 0) !== near) return null;
  let n = normalOf(pts); if (dot(n, VIEW) < 0) n = n.map((v) => -v);
  const c = pts.reduce((s2, p) => [s2[0] + p[0] / 6, s2[1] + p[1] / 6, s2[2] + p[2] / 6], [0, 0, 0]);
  const fill = shadeHex(tip < 1 ? "#3b3330" : "#353a42", n);
  return { d: dot(c, VIEW), s: face(pts, fill) + '<path class="le" d="M' + [pts[0], pts[1], pts[2]].map(sp).join("L") + '"/>' };
}
function rowBlades(r, ang) {
  const out = [], f0 = Math.PI / 2, step2 = Math.PI / r.n;
  const heat = r.kind === "hpt" ? clamp((egt - 700) / 450, 0, 1) : r.kind === "lpt" ? clamp((egt - 850) / 500, 0, 0.6) : 0;
  for (let j = 0; j < r.n; j++) {
    const a = f0 + ((ang + j * step2) % Math.PI + Math.PI) % Math.PI;
    if (burst && r.kind === "hpt" && j % 3 === 0) continue;
    const pts = [pt(r.x + r.chord / 2, r.rIn, a), pt(r.x + r.chord / 2, r.rOut, a), pt(r.x - r.chord / 2, r.rOut, a + r.tw * 0.3), pt(r.x - r.chord / 2, r.rIn, a + r.tw * 0.3)];
    let n = normalOf(pts); if (dot(n, VIEW) < 0) n = n.map((v) => -v);
    const c = [r.x, (r.rIn + r.rOut) / 2 * Math.cos(a), ZC + (r.rIn + r.rOut) / 2 * Math.sin(a)];
    out.push({ d: dot(c, VIEW), s: face(pts, shadeHex(r.col, n, heat ? ["#ff7a2a", heat] : null)) });
  }
  return out;
}
function ogv() {
  const out = [];
  for (let j = 0; j < OGV.n; j++) {
    const a = Math.PI / 2 + (j + 0.5) * Math.PI / OGV.n;
    const pts = [pt(OGV.x + 10, OGV.rIn, a), pt(OGV.x + 10, OGV.rOut, a), pt(OGV.x - 8, OGV.rOut, a + 0.05), pt(OGV.x - 8, OGV.rIn, a + 0.05)];
    let n = normalOf(pts); if (dot(n, VIEW) < 0) n = n.map((v) => -v);
    out.push({ d: dot([OGV.x, ((OGV.rIn + OGV.rOut) / 2) * Math.cos(a), ZC + ((OGV.rIn + OGV.rOut) / 2) * Math.sin(a)], VIEW), s: face(pts, shadeHex("#8b929a", n)) });
  }
  return out;
}
function spinner() {
  const out = [];
  for (let i = 0; i < SPIN.length - 1; i++) for (let j = 0; j < 20; j++) {
    const a = (j / 20) * Math.PI * 2 + fanA * 0, b = ((j + 1) / 20) * Math.PI * 2;
    const [x0, r0] = SPIN[i], [x1, r1] = SPIN[i + 1];
    const pts = [pt(x0, r0, a), pt(x1, r1, a), pt(x1, r1, b), pt(x0, r0, b)];
    let n = normalOf(pts); const fm = (a + b) / 2; if (dot(n, [0.6, Math.cos(fm), Math.sin(fm)]) < 0) n = n.map((v) => -v);
    if (dot(n, VIEW) <= 0) continue;
    const swirl = (j + Math.floor(fanA * 20 / (Math.PI * 2))) % 20 === 0;
    out.push({ d: 0, s: face(pts, shadeHex(swirl ? "#f2f2ee" : "#cfd3d8", n)) });
  }
  return out;
}
let shakeOff = [0, 0];
function draw(dt) {
  const spin = state === "run" || state === "surging" ? 1 : state === "seized" ? 0.6 : 0.8;
  fanA += dt * n1 * 5.2 * spin; coreA += dt * n2 * 7.0 * spin; lpA += dt * n1 * 6.1 * spin;
  // far side: OGVs, core rows, far half of the fan
  const far = [...ogv()];
  ROWS.forEach((r) => far.push(...rowBlades(r, r.spool === 2 ? coreA : lpA)));
  for (let i = 0; i < 16; i++) { const b = fanBlade(i, false); if (b) far.push(b); }
  far.sort((a, b) => a.d - b.d);
  let fh = far.map((f) => f.s).join("");
  if (dent) { const c = pt(205, 170, dent.a), C = iso(c, PR); fh += '<ellipse class="dent" cx="' + C[0].toFixed(1) + '" cy="' + C[1].toFixed(1) + '" rx="13" ry="7"/>'; }
  farG.innerHTML = fh;
  // combustor flames on the cut
  const fl = state === "run" || state === "surging" ? clamp(0.25 + 0.75 * kOf(n1), 0, 1) : 0;
  const flG = secG.querySelector(".flames");
  let fs = "";
  if (fl > 0) for (const sgn of [1, -1]) { const P2 = (x, r) => sp([x, 0, ZC + sgn * r]); const len = 26 + 22 * fl + Math.sin(now * 40 + sgn) * 3; fs += '<path class="flame" style="opacity:' + (0.55 + 0.4 * fl).toFixed(2) + '" d="M' + P2(-8, 44) + "L" + P2(-8 - len * 0.5, 50) + "L" + P2(-8 - len, 46) + "L" + P2(-8 - len * 0.6, 41) + 'Z"/>'; }
  if (flG.innerHTML !== fs) flG.innerHTML = fs;
  // near side: the near half of the fan, the spinner, flying bits
  const near = [];
  for (let i = 0; i < 16; i++) { const b = fanBlade(i, true); if (b) near.push(b); }
  near.sort((a, b) => a.d - b.d);
  let nh = near.map((f) => f.s).join("") + spinner().map((f) => f.s).join("");
  if (bladeOff) {
    const t = now - bladeOff.t;
    if (t < 0.25) { const r = 110 + t * 300, a = bladeOff.a + t * 4; const pts = [pt(215, r - 50, a), pt(215, Math.min(169, r + 55), a), pt(195, Math.min(169, r + 55), a + 0.25), pt(195, r - 50, a + 0.2)]; nh += face(pts, "#2c2f35"); }
    for (const f of bladeOff.frags) {
      if (t < 0.12) continue;
      f.x += f.vx * dt; f.a += f.va * dt; f.va *= Math.exp(-dt * 0.8); f.rot += dt * 9;
      let p = f.x > -40 ? pt(f.x, Math.min(166, f.r), f.a) : null;
      if (!p) { f.free = f.free || { p: pt(-40, 160, f.a), v: [-300, Math.cos(f.a) * 80, -100] }; f.free.v[2] -= 900 * dt; for (let i = 0; i < 3; i++) f.free.p[i] += f.free.v[i] * dt; if (f.free.p[2] < 3) { f.free.p[2] = 3; f.free.v = [f.free.v[0] * 0.5, f.free.v[1] * 0.5, Math.abs(f.free.v[2]) * 0.25]; } p = f.free.p; }
      const C = iso(p, PR), s = f.s;
      nh += '<rect class="frag" x="' + (C[0] - s / 2).toFixed(1) + '" y="' + (C[1] - s / 4).toFixed(1) + '" width="' + s.toFixed(1) + '" height="' + (s / 2).toFixed(1) + '" transform="rotate(' + (f.rot * 57).toFixed(0) + " " + C[0].toFixed(1) + " " + C[1].toFixed(1) + ')"/>';
    }
  }
  if (burst) for (const c of burst.chunks) { c.v[2] -= 900 * dt; for (let i = 0; i < 3; i++) c.p[i] += c.v[i] * dt; if (c.p[2] < 3) { c.p[2] = 3; c.v = c.v.map((v, i) => (i === 2 ? Math.abs(v) * 0.3 : v * 0.5)); } const C = iso(c.p, PR); nh += '<rect class="frag hot" x="' + (C[0] - c.s / 2).toFixed(1) + '" y="' + (C[1] - c.s / 2).toFixed(1) + '" width="' + c.s.toFixed(1) + '" height="' + c.s.toFixed(1) + '"/>'; }
  nearG.innerHTML = nh;
  // fire after a burst, smoke after a blade-off
  if (now - fireT < 6) { for (let i = 0; i < 3; i++) flame(-60 - rnd() * 60, (rnd() - 0.5) * 60, (rnd() - 0.5) * 120 + 60, -80, 1.3); if (rnd() < 0.5) smoke(pt(-80, 90, Math.PI / 2 + rnd()), 1.2); }
  if (bladeOff && now - bladeOff.t < 5 && rnd() < 0.6) smoke(pt(150 - rnd() * 200, 120, Math.PI / 2 + rnd() * Math.PI), 1);
  // shake
  shake = Math.max(0, shake - dt * 0.6);
  const amp = shake * 7 + clamp(vib, 0, 8) * n1 * 0.6;
  shakeOff = amp > 0.05 ? [(rnd() - 0.5) * amp, (rnd() - 0.5) * amp] : [0, 0];
  engG.setAttribute("transform", amp > 0.05 ? "translate(" + shakeOff[0].toFixed(1) + " " + shakeOff[1].toFixed(1) + ")" : "");
  const ft = now - flashT;
  flashEl.style.opacity = ft < 0.4 ? String((1 - ft / 0.4) * 0.8) : "0";
  drawParticles(dt);
  const text = state === "run" || state === "surging" ? "N1 " + Math.round(n1 * 100) + " % · EGT " + Math.round(egt) + " °C · " + Math.round(F) + " kN" : state === "seized" ? "BLADE OFF · CONTAINED" : burst ? "HPT BURST · ENGINE FIRE" : "SHUT DOWN";
  if (readout.textContent !== text) readout.textContent = text;
}
function birdsStep(dt) {
  birds = birds.filter((b) => {
    b.x -= b.v * dt; b.z += Math.sin(now * 2 + b.ph) * 10 * dt;
    if (b.x <= 215) { if (state === "run" || state === "surging") birdHit(b); return false; }
    return true;
  });
  if (shutdownAt !== null && now >= shutdownAt) { shutdownAt = null; if (state === "run" || state === "surging") { setState("shutdown"); event("Three surges and a shaking fan: the crew shuts it down. Nothing came out the side, so it did its job."); } }
}
function goose(flock) {
  const n = flock ? 6 : 1;
  for (let i = 0; i < n; i++) birds.push({ x: 520 + i * 45 + rnd() * 30, y: (rnd() - 0.5) * (flock ? 200 : 60), z: (rnd() - 0.5) * (flock ? 180 : 60), v: 520, ph: rnd() * 6, flock });
}

// ---------------- UI ----------------
const ui = {
  thr: document.querySelector("#thr"), thrOut: document.querySelector("#thr-out"), presets: [...document.querySelectorAll("[data-thr]")], fadec: document.querySelector("#fadec"),
  goose: document.querySelector("#goose"), flock: document.querySelector("#flock"), blade: document.querySelector("#blade"), surgeB: document.querySelector("#surge"), fresh: document.querySelector("#fresh"),
  slow: document.querySelector("#slow"), tour: document.querySelector("#tour"), labels: document.querySelector("#labels"), shot: document.querySelector("#shot"),
  n1F: document.querySelector("#n1-fill"), n1O: document.querySelector("#n1-out"), eF: document.querySelector("#egt-fill"), eO: document.querySelector("#egt-out"), fF: document.querySelector("#f-fill"), fO: document.querySelector("#f-out"), vF: document.querySelector("#v-fill"), vO: document.querySelector("#v-out"), stats: document.querySelector("#stats"),
};
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };
function syncUi() {
  ui.thr.max = fadec ? "114" : "130";
  ui.thr.value = String(Math.round(thr * 100)); ui.thrOut.textContent = Math.round(thr * 100) + " %";
  ui.fadec.setAttribute("aria-pressed", String(!fadec)); ui.fadec.textContent = fadec ? "FADEC on" : "FADEC OFF";
  ui.n1F.style.width = clamp(n1 / 1.3 * 100, 0, 100).toFixed(1) + "%"; ui.n1O.textContent = Math.round(n1 * 100) + " % · N2 " + Math.round(n2 * 100);
  ui.eF.style.width = clamp((egt - 0) / 1300 * 100, 0, 100).toFixed(1) + "%"; ui.eF.dataset.state = egt > 1090 ? "bad" : egt > 1000 ? "warn" : "ok"; ui.eO.textContent = Math.round(egt) + " °C";
  ui.fF.style.width = clamp(F / 650 * 100, 0, 100).toFixed(1) + "%"; ui.fO.textContent = Math.round(F) + " kN";
  ui.vF.style.width = clamp(vib / 4 * 100, 0, 100).toFixed(1) + "%"; ui.vF.dataset.state = vib > 1.5 ? "bad" : vib > 0.5 ? "warn" : "ok"; ui.vO.textContent = vib.toFixed(1);
  const lbf = F * 224.8, t = F / 9.81;
  ui.stats.innerHTML = "<b>" + Math.round(lbf / 100) * 100 + " lbf</b>, enough to hold up <b>" + Math.round(t) + " t</b>" + (t > 4 ? ", or about <b>" + Math.round(t / 2.1) + " Hiluxes</b>" : "") + (dmgFan > 0 ? " · fan damage <b>" + Math.round(dmgFan * 100) + " %</b>" : "") + (hpt > 0.05 && !burst ? " · HPT life used <b>" + Math.round(hpt * 100) + " %</b>" : "");
  ui.slow.setAttribute("aria-pressed", String(slow)); ui.tour.setAttribute("aria-pressed", String(touring));
}
function story() {
  if (now - lastEventAt < 6 && lastEvent) return say(lastEvent);
  if (touring && tourStep >= 0 && TOUR[tourStep].say) return say(TOUR[tourStep].say);
  if (state !== "run") return;
  if (!fadec && egt > 1000) return say("FADEC off: nothing is holding the EGT back now. Past about 1,090 °C the HP turbine blades start to creep. Watch the HPT life.");
  if (n1 > 1.05) return say("Record territory. The certified engine did 134,300 lbf (597 kN) in a test cell, the most thrust any commercial jet engine has made.");
  if (n1 > 0.85) return say("Take-off power. Around 90 % of the air goes round the core through the bypass duct, and that cold, slow, huge flow makes most of the thrust.");
  if (n1 < 0.3) return say("Idle. The biggest fan on any airliner engine: 3.4 m across, taller than a basketball hoop, 16 carbon-fibre blades. Push the throttle.");
  return say("Air in the front: about one part in eleven goes into the core, gets squeezed 60 to 1, burnt, and spins the turbines that drive everything. The rest is bypass.");
}
const TOUR = [
  { say: "Idle. The biggest fan on any airliner engine: 3.4 m across, 16 carbon-fibre blades. The near half's cut away so you can see in.", acts: [[0, () => { newEngine(); thr = 0; }], [5, null]] },
  { say: "Take-off power: about 445 kN, 100,000 lbf. Most of it comes from the fan's bypass air, not the hot core.", acts: [[0, () => { thr = 1; }], [8, null]] },
  { say: "Record run: 134,300 lbf in a test cell, more than any commercial jet engine has ever made.", acts: [[0, () => { thr = 1.14; }], [7, null]] },
  { say: "One goose at take-off power. Most of it goes out the bypass. The fan gets a nick and keeps running, which is what certification asks.", acts: [[0, () => { thr = 1; goose(false); }], [6, null]] },
  { say: "A flock of geese.", acts: [[0, () => { goose(true); }], [9.5, null]] },
  { say: "Blade-off test: an explosive bolt releases a fan blade at full power. The case has to hold it.", acts: [[0, () => { newEngine(); thr = 1; }], [3.5, () => bladeRelease()], [12, null]] },
  { say: "Last one: FADEC off and the throttle firewalled. Nothing is protecting the turbine now.", acts: [[0, () => { newEngine(); thr = 1; }], [1, () => { fadec = false; thr = 1.3; }], [13, null]] },
];
function tourTick() {
  if (tourStep < 0 || !actions.length) { tourStep = (tourStep + 1) % TOUR.length; actions = TOUR[tourStep].acts.map(([w, fn]) => [tourClock + w, fn]); }
  while (actions.length && tourClock >= actions[0][0]) { const fn = actions.shift()[1]; if (fn) fn(); else actions = []; }
}
function tick(t) {
  const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
  last = t;
  const sdt = dt * (slow ? 0.2 : 1);
  now += sdt;
  if (touring) { tourClock += sdt; tourTick(); }
  step(sdt); birdsStep(sdt); draw(sdt); syncUi(); story();
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { if (touring) { touring = false; actions = []; tourStep = -1; } };
const act = (fn) => (...a) => { takeOver(); fn(...a); syncUi(); run(); };
const alive = () => state === "run" || state === "surging";
ui.thr.addEventListener("input", act(() => { thr = +ui.thr.value / 100; }));
ui.presets.forEach((b) => b.addEventListener("click", act(() => { thr = +b.dataset.thr; if (thr > 1.14) fadec = false; })));
ui.fadec.addEventListener("click", act(() => { fadec = !fadec; if (fadec) thr = Math.min(thr, 1.14); }));
ui.goose.addEventListener("click", act(() => { if (alive()) goose(false); }));
ui.flock.addEventListener("click", act(() => { if (alive()) goose(true); }));
ui.blade.addEventListener("click", act(() => { if (alive()) { if (n1 < 0.8) { thr = 1; event("Spooling up first: the test's done at full power."); setTimeout(() => {}, 0); pendingBlade = true; } else bladeRelease(); } }));
ui.surgeB.addEventListener("click", act(() => { if (alive()) surge(); }));
ui.fresh.addEventListener("click", act(() => newEngine()));
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; actions = []; } syncUi(); run(); });
ui.labels.addEventListener("click", () => { const on = ui.labels.getAttribute("aria-pressed") !== "true"; ui.labels.setAttribute("aria-pressed", String(on)); labG.style.display = on ? "" : "none"; });
let pendingBlade = false;
const _step = step;
step = function (dt) { _step(dt); if (pendingBlade && n1 > 0.95) { pendingBlade = false; bladeRelease(); } };
stage.addEventListener("keydown", (ev) => {
  const map = { ArrowUp: () => { thr = Math.min(fadec ? 1.14 : 1.3, thr + 0.05); }, ArrowDown: () => { thr = Math.max(0, thr - 0.05); }, g: () => alive() && goose(false), f: () => alive() && goose(true), b: () => alive() && bladeRelease() };
  if (map[ev.key]) { ev.preventDefault(); act(map[ev.key])(); }
  if (ev.key === "s") { slow = !slow; run(); }
});
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;
window.__fig = { freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
draw(0); syncUi(); story();
`;

const CSS = `.fx-stage{position:relative;overflow:hidden}
.fx-stage svg{display:block;position:relative}
.fx-smoke{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.fx-flash{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(circle 50% at 55% 40%,#fff6dc 0%,#ffcf8a 40%,rgba(255,160,80,0) 100%)}
.floorline{fill:none;stroke:var(--anatomy-lo);stroke-width:.6;opacity:.5}
.sec{stroke:rgba(0,0,0,.4);stroke-width:.5}
.liner{fill:none;stroke:#e8d6b0;stroke-width:1}.nozzle{stroke:#e8d6b0;stroke-width:1.6}
.flame{fill:#ffb347;filter:blur(1.2px)}
.le{fill:none;stroke:#c9ced4;stroke-width:.9}
.dent{fill:#14100e;opacity:.85;stroke:#ff8a3d;stroke-width:1}
.frag{fill:#2b2e33;stroke:#888;stroke-width:.4}.frag.hot{fill:#ff8a3d;stroke:#ffd27a}
.lead{fill:none;stroke:var(--anatomy-mid);stroke-width:.6;opacity:.7}.dotl{fill:var(--anatomy-mid)}
.lab{fill:var(--anatomy-mid);font-family:var(--anatomy-mono);font-size:8.5px;letter-spacing:.06em}.lab .sub{fill:var(--anatomy-lo);font-size:7.5px;letter-spacing:0}
.fx-stage path{stroke-linejoin:round}
.ctl{display:grid;gap:12px;margin:14px 0 6px;font-family:var(--anatomy-mono);font-size:12px;color:var(--anatomy-mid)}
.ctl-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ctl-label{min-width:72px;text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:var(--anatomy-lo)}
.ctl button{font:inherit;color:var(--anatomy-mid);background:transparent;border:1px solid var(--anatomy-lo);border-radius:6px;padding:7px 10px;cursor:pointer;line-height:1.15;text-align:left;min-height:36px}
.ctl button:hover{border-color:var(--anatomy-mid)}
.ctl button[aria-pressed="true"]{color:var(--anatomy-lit);border-color:var(--anatomy-lit)}
.ctl #fadec[aria-pressed="true"],.ctl #blade,.ctl [data-thr="1.3"]{color:#ff6a3d;border-color:#ff6a3d}
.ctl button small{display:block;font-size:10px;color:var(--anatomy-lo)}
.ctl output{min-width:96px;text-align:right;color:var(--anatomy-hi,var(--anatomy-mid))}
.slide{position:relative;flex:1;min-width:120px}.slide input{width:100%;accent-color:var(--anatomy-lit);margin:0}
.meter{position:relative;flex:1;min-width:110px;height:10px;margin-top:14px;border:1px solid var(--anatomy-lo);border-radius:5px}
.meter .fill{position:absolute;left:0;top:0;bottom:0;border-radius:4px;transition:width .1s;background:#3ddc84}
.meter .fill[data-state="warn"]{background:#ffb347}.meter .fill[data-state="bad"]{background:#ff5a2a}
.mark{position:absolute;top:-14px;bottom:-3px;width:0;border-left:1px dashed #ff6a3d;pointer-events:none}
.mark::after{content:attr(data-label);position:absolute;top:0;left:4px;font-size:10px;white-space:nowrap;color:#ff6a3d}
.mark.l::after{left:auto;right:4px}
#stats{font-size:12px;color:var(--anatomy-mid);line-height:1.5}#stats b{color:var(--anatomy-hi,var(--anatomy-mid));font-weight:600}
#shot{min-height:3.6em;font-size:12px;line-height:1.4}
@media (max-width:520px){.ctl-label{min-width:52px}.ctl button{padding:7px 8px}.ctl output{min-width:80px}.ctl button small{display:none}}`;

const stageHtml = `<div class="iso-stage fx-stage" tabindex="0" role="group" aria-label="Jet engine: up and down for throttle, G throws a goose, F a flock, B releases a fan blade">${svg}<canvas class="fx-smoke" aria-hidden="true"></canvas><div class="fx-flash" aria-hidden="true"></div></div>`;

const CONTROLS = `<div class="ctl" role="group" aria-label="Controls">
  <div class="ctl-row"><span class="ctl-label">Throttle</span><div class="slide"><input id="thr" type="range" min="0" max="114" step="1" value="0" aria-label="Throttle, percent of take-off"></div><output id="thr-out">0 %</output></div>
  <div class="ctl-row"><span class="ctl-label">Set</span><button type="button" data-thr="0">Idle</button><button type="button" data-thr="1">Take-off<small>445 kN</small></button><button type="button" data-thr="1.14">Record run<small>597 kN</small></button><button type="button" data-thr="1.3">Firewall it<small>FADEC off</small></button><button type="button" id="fadec" aria-pressed="false">FADEC on</button></div>
  <div class="ctl-row"><span class="ctl-label">Test</span><button type="button" id="goose">Goose<small>one bird</small></button><button type="button" id="flock">Flock<small>six geese</small></button><button type="button" id="surge">Surge<small>compressor stall</small></button><button type="button" id="blade">Blade-off<small>containment test</small></button></div>
  <div class="ctl-row"><span class="ctl-label">N1</span><div class="meter"><span id="n1-fill" class="fill"></span><span class="mark" style="left:${(100 / 130 * 100).toFixed(1)}%" data-label="100"></span></div><output id="n1-out">20 %</output></div>
  <div class="ctl-row"><span class="ctl-label">EGT</span><div class="meter"><span id="egt-fill" class="fill"></span><span class="mark" style="left:${(1090 / 1300 * 100).toFixed(1)}%" data-label="limit"></span></div><output id="egt-out">480 °C</output></div>
  <div class="ctl-row"><span class="ctl-label">Thrust</span><div class="meter"><span id="f-fill" class="fill"></span><span class="mark l" style="left:${(445 / 650 * 100).toFixed(1)}%" data-label="take-off"></span><span class="mark" style="left:${(597 / 650 * 100).toFixed(1)}%" data-label="record"></span></div><output id="f-out">0 kN</output></div>
  <div class="ctl-row"><span class="ctl-label">Vibes</span><div class="meter"><span id="v-fill" class="fill"></span></div><output id="v-out">0.0</output></div>
  <div class="ctl-row"><span class="ctl-label">That's</span><span id="stats"></span></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="fresh">New engine</button><button type="button" id="labels" aria-pressed="true">Labels</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
  <div id="shot" aria-live="polite"></div>
</div>`;

const card = k.plateHtml({
  fig: "Fig 21",
  title: "Jet engine",
  hint: "Throttle up, then feed it a goose",
  readout: "",
  keys: [
    { mark: "lit", label: "Air through the bypass (blue) and the core (heating up through the combustor), the fire, the bits" },
    { mark: "raised", label: "GE9X-sized turbofan on a test stand, near half cut away" },
  ],
  caption: "A turbofan is a small jet engine driving a giant fan. Air comes in the front and most of it, about ten parts in eleven here, goes round the outside through the bypass duct, pushed by the fan. The rest goes into the core: squeezed 60 to 1 by the booster and the high-pressure compressor, burnt with fuel in the combustor, then expanded through the high-pressure turbine (which drives the compressor) and the low-pressure turbine (which drives the fan). The huge, slow, cold bypass flow makes most of the thrust, and making it bigger is how engines got more efficient. This one's the size of the GE9X on the Boeing 777X, the biggest and most powerful airliner engine built.",
  body: stageHtml,
});

const other = theme === "light" ? ["index.html", "Dark version"] : ["light.html", "Light version"];
const FOOT = `<p style="font-family:var(--anatomy-mono);font-size:11px;color:var(--anatomy-lo);margin:28px 0 8px;line-height:1.6">A toy, not an engine model. Real (GE9X, from GE Aerospace and Key Aero): 3.4 m fan, 16 carbon-fibre composite blades, a 3-stage booster, an 11-stage high-pressure compressor at 27:1, CMC combustor liners, a 2-stage HP turbine, a 6-stage low-pressure turbine, bypass about 10:1, overall pressure ratio 60:1, about 100,000 lbf (445 kN) take-off, and the 134,300 lbf (597 kN) record. Also real: certification needs a fan blade released at full power to stay inside the case, and the engine has to take bird strikes. Made up: the spool times, EGT numbers and limit, the thrust curve, how the failures play out, the stand, and the proportions inside are simplified.<br>Built with <a href="https://github.com/wheresryan22/anatomy" style="color:inherit">Anatomy</a> by Ryan (MIT). · <a href="${other[0]}" style="color:inherit">${other[1]}</a> · <a href="../" style="color:inherit">More figures</a> · <a href="https://github.com/Dizzyfer/Anatomy/tree/main/jet" style="color:inherit">Source</a></p>`;
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "Jet engine", theme, body: `<style>${CSS}</style>${card.replace("<figcaption", CONTROLS + "<figcaption")}${FOOT}`, script: kitScript() + LIVE.replace("__DATA__", JSON.stringify(DATA)), width: 720 }));
console.log("wrote", name);
