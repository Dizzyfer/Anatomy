import { writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { kitScript } from "../../scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const SOLID = readFileSync(join(HERE, "solid.mjs"), "utf8").replace(/^export /gm, "");

const W = 640;
const H = 470;

// Truth: CPU power is roughly C·V²·f plus leakage, and leakage climbs with temperature, so heat makes more heat (thermal
// runaway). Each chip needs a bit more voltage for every step of clock until it hits a wall where the voltage needed shoots
// up; colder silicon pushes that wall out, which is why extreme overclockers use liquid nitrogen (boils at -196 °C).
// Chips vary (the silicon lottery), some stop working below a certain temperature (the cold bug), high voltage plus heat
// wears them out (electromigration), and an unstable overclock blue-screens, typically CLOCK_WATCHDOG_TIMEOUT or WHEA.
// Toy: every number in the model, the time scale (temperatures settle in seconds), the score, and the chip itself.
const PLATE = { x: -236, y: -150, w: 404, d: 290, r: 10 };
const PLATE_H = 12, FOOT_H = 5;
const S = [-30, -45];
const P = k.fitProjection([...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [S[0] - 50, S[1] - 50, 182], [S[0] + 50, S[1] + 50, 182], [-215, -115, 130], [-215, 115, 130]], W, H, { pad: 12, azimuth: 45 });
const at = (p) => k.iso(p, P);
const Sv = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const depth2 = ([x, y]) => k.depthOf([x, y, 0], P);
const byDepth = (pts) => [...pts].sort((a, b) => depth2(a) - depth2(b));

function plate() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 24))) {
    out.push(Sv(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(Sv(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(Sv(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid", inner: L(k.sideSeam(PLATE, -PLATE_H / 2, P), { tone: "faint" }) }));
  // the PSU cable for the EPS connector, running off the back of the bench
  out.push(`<path class="cable" d="${k.pathOf([[-131, -112, 10], [-131, -128, 8], [-131, -146, 1]].map(at))}"/>`);
  return out.join("");
}
const QM = k.topMatrix([111, 92], 5.2, P);
const svg = k.figureSvg({
  width: W, height: H,
  label: "A desktop motherboard on a test bench, cut out of its case: the CPU socket with a cooler on it, the power stages (VRM) beside the socket, memory, slots and a debug display. The cooler can be swapped between a stock cooler, a tower air cooler, a liquid cooler with a radiator, and a liquid nitrogen pot.",
  body: [plate(), `<g data-part="back"></g>`, `<g data-part="board"></g>`, `<g data-part="front"></g>`, `<text class="qcode" data-part="qcode" transform="${QM}" font-size="13" x="2" y="13">--</text>`],
});

const DATA = { W, H, P, S, silk: k.topMatrix([-118, 100], 2.1, P) };

const LIVE = `
${SOLID}
const D = __DATA__;
const PR = D.P, S = D.S;
const stage = document.querySelector(".fx-stage");
const q = (n) => stage.querySelector('[data-part="' + n + '"]');
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const R = solids((p) => iso(p, PR), (p) => depthOf(p, PR));
const { box, cyl, prism, circle } = R;
const backG = q("back"), boardG = q("board"), frontG = q("front"), qcode = q("qcode");
const svgEl = stage.querySelector("svg"), flashEl = stage.querySelector(".fx-flash"), cv = stage.querySelector(".fx-smoke"), ctx = cv.getContext("2d");
const mon = { el: stage.querySelector(".mon"), scr: stage.querySelector(".mon-scr") };

// ---------------- the chip ----------------
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
function newChip(fixed) {
  const g1 = fixed !== undefined ? fixed : clamp((rnd() + rnd() + rnd() - 1.5) * 2, -2, 2);
  const cold = fixed !== undefined ? -260 : rnd() < 0.45 ? -105 - 70 * rnd() : -260;
  return { q: g1, v0: 1.18 - 0.025 * g1, wall: 5.55 + 0.15 * g1, coldBug: cold, grade: g1 > 0.9 ? "golden" : g1 < -0.9 ? "a dud" : "about average", health: 1 };
}
let chip = newChip(0.6);
// what the chip needs to run a clock without errors, colder is better
function vmin(f, T) {
  const t = clamp(T, -196, 110), wall = chip.wall + 0.0085 * (70 - t);
  return chip.v0 + 0.085 * (f - 4.5) + 0.03 * Math.exp((f - wall) / 0.3);
}
const LOADS = { idle: { k: 0.06, name: "idle" }, game: { k: 0.45, name: "gaming" }, render: { k: 1.0, name: "rendering" }, avx: { k: 1.35, name: "an AVX stress test" } };
const COOLERS = { stock: { Rth: 0.42, name: "the stock cooler" }, tower: { Rth: 0.26, name: "a big tower cooler" }, aio: { Rth: 0.2, name: "a 240 mm liquid cooler" }, ln2: { Rth: 0.07, name: "a liquid nitrogen pot" } };

// ---------------- settings and state ----------------
let mult = 45, vset = 1.25, cooler = "tower", load = "render", safe = true, potSet = -185;
let T = 40, Tv = 35, potT = 25, throttle = 0, P = 0, I = 0, veff = 1.25, fEff = 4.5;
let mode = "run", modeAt = 0, why = "", stop = "", runProg = 0, runF = 0, runT = 0, lastScore = 0, best = 0, overI = 0;
let now = 0, last = 0, frame = 0, visible = false, touring = true, slow = false, tourClock = 0, tourStep = -1, actions = [];
let boomAt = null, debris = [], fanA = 0, hue = 0, lastShot = "", lastEvent = "", lastEventAt = -10, pour = 0;
const event = (t) => { lastEvent = t; lastEventAt = now; };
const setMode = (m, w = "", code = "") => { mode = m; modeAt = now; why = w; stop = code; if (m !== "run") runProg = 0; };

// ---------------- the board ----------------
const PCB = "#1d2329", BLK = "#24272c", ALU = "#b3b9c0", CU = "#c8794a", GREY = "#5d636b", SLOT = "#2a2d32";
function staticBoard() {
  const o = [];
  o.push({ parts: [box(-150, 150, -120, 120, 0, 2, PCB, { cap: "#202a2f" })], key: -1e9 });
  let tr = "";
  const seg = (pts) => { tr += "M" + pts.map((p) => iso([p[0], p[1], 2.05], PR).map((v) => v.toFixed(1)).join(" ")).join("L"); };
  for (let i = 0; i < 10; i++) seg([[S[0] + 26, S[1] - 20 + 4 * i], [10 + 2 * i, S[1] - 20 + 4 * i], [26 + 2 * i, S[1] - 36 + 4 * i], [26 + 2 * i, -112]]);
  for (let i = 0; i < 8; i++) seg([[S[0] - 20 + 5 * i, S[1] + 30], [S[0] - 20 + 5 * i, 18 + i * 0.5], [S[0] - 30 + 5 * i, 22]]);
  for (let i = 0; i < 6; i++) seg([[-30 + 8 * i, 64], [-30 + 8 * i, 92], [10 + 8 * i, 112]]);
  for (let i = 0; i < 5; i++) seg([[75, 30 + 6 * i], [125, 30 + 6 * i], [130, 34 + 6 * i]]);
  for (let i = 0; i < 6; i++) seg([[-118, 30 + 7 * i], [-140, 52 + 7 * i]]);
  o.push({ svg: '<path class="trace" d="' + tr + '"/><text class="silk" transform="' + D.silk + '" font-size="9">TEST BENCH 01</text>', key: -9e8 });
  o.push({ parts: [box(-150, -124, -120, 20, 2, 42, "#3b4047", { cap: "#4a5058" }), box(-150, -148, -118, 18, 6, 40, "#8b9199")] });
  for (const y of [25, 75]) o.push({ parts: [box(-122, -32, y, y + 7, 2, 13, SLOT), box(-122, -32, y + 0.5, y + 6.5, 13, 13.4, "#9aa1a9")] });
  o.push({ parts: [box(-112, -22, 46, 60, 2, 8, "#33383e", { cap: "#41474e" })] });
  o.push({ parts: [box(18, 70, 58, 110, 2, 13, "#3b4047", { cap: "#4c535b" })] });
  o.push({ parts: [box(132, 142, -84, -24, 2, 17, "#2b2e33")] });
  o.push({ parts: [box(132, 142, 28, 62, 2, 10, "#2b2e33")] });
  o.push({ parts: [cyl(92, 22, 10, 2, 4.5, "#c3c8ce", 20)] });
  o.push({ parts: [box(-140, -122, -118, -104, 2, 14, "#2b2e33")] });
  o.push({ parts: [box(108, 136, 88, 104, 2, 5, "#111214")] });
  for (let i = 0; i < 4; i++) { const x = 30 + 14 * i; o.push({ parts: [box(x, x + 7, -110, 23, 2, 9, SLOT)] }); }
  o.push({ parts: [box(S[0] - 24, S[0] + 24, S[1] - 28, S[1] + 28, 2, 6, "#6d737b"), box(S[0] - 16, S[0] + 16, S[1] - 18, S[1] + 18, 6, 9, "#c9ced3")] });
  return o;
}
let VRM = null;
function makeVrm() {
  const hs = [{ parts: [box(-114, -92, -108, 10, 2, 34, "#3e444c", { cap: "#555c65" }), ...[-90, -60, -30, 0].map((y) => box(-114.3, -91.7, y, y + 3, 30, 34.4, "#2b2f35"))], hot: true },
    { parts: [box(-88, 22, -120, -100, 2, 34, "#3e444c", { cap: "#555c65" }), ...[-70, -40, -10, 15].map((x) => box(x, x + 3, -120.3, -99.7, 30, 34.4, "#2b2f35"))], hot: true }];
  const chokes = [];
  for (let i = 0; i < 9; i++) chokes.push({ parts: [box(-88, -78, -101 + 12 * i, -91 + 12 * i, 2, 10, "#4f555d", { cap: "#7a8088" })] });
  for (let i = 0; i < 8; i++) chokes.push({ parts: [box(-74 + 12 * i, -64 + 12 * i, -96, -86, 2, 10, "#4f555d", { cap: "#7a8088" })] });
  const caps = [-106, -96, -86, -76].map((x) => ({ parts: [cyl(x, 22, 4, 2, 13, "#2c2236", 16), cyl(x, 22, 4.05, 12.2, 13.2, "#b9bfc6", 16)] }));
  VRM = { hs, chokes, caps };
}
makeVrm();
function ram(t) {
  const out = [];
  for (let i = 0; i < 4; i++) {
    const x = 31.5 + 14 * i, h = (hue + i * 25 + t) % 360;
    const col = "hsl(" + h + ",90%,60%)";
    out.push({ parts: [box(x, x + 4, -108, 21, 9, 42, "#2d3036", { cap: "#3a3e45" }), box(x - 0.3, x + 4.3, -108, 21, 42, 45, "#dfe5ec", { emit: [hslHex(h), 0.85] })] });
  }
  return out;
}
function hslHex(h) { const f = (n) => { const k2 = (n + h / 30) % 12, a = 0.9 * Math.min(0.6, 0.4); const c = 0.6 - a * Math.max(-1, Math.min(k2 - 3, 9 - k2, 1)); return Math.round(c * 255).toString(16).padStart(2, "0"); }; return "#" + f(0) + f(8) + f(4); }

// fans: blades drawn as thin prisms, spun in their plane
function blades(axis, cu, cv2, w0, w1, rh, rt, ang, col, n = 7) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = ang + (i / n) * Math.PI * 2, pt = (r, b) => [cu + r * Math.cos(b), cv2 + r * Math.sin(b)];
    out.push(prism([pt(rh, a - 0.22), pt(rt, a + 0.05), pt(rt, a + 0.55), pt(rh, a + 0.25)], axis, w0, w1, col));
  }
  return out;
}
const HOT = "#ff5a1f", FROST = "#f2f7ff";
function coolerObjs() {
  const [sx, sy] = S, out = [], heat = clamp((T - 65) / 60, 0, 0.8), K = (d) => R.VIEW[0] * sx + R.VIEW[1] * sy + d;
  if (cooler === "stock") {
    out.push({ parts: [cyl(sx, sy, 44, 9, 36, "#a7adb5", 28, { glow: [HOT, heat * 0.6] })], key: K(10) });
    out.push({ parts: [cyl(sx, sy, 46, 36, 44, "#202226", 28), cyl(sx, sy, 46.5, 39, 41, "#202226", 28, { emit: [hslHex(hue % 360), 0.9] })], key: K(11) });
    out.push({ parts: [...blades("z", sx, sy, 44.2, 45, 13, 42, fanA, "#3a3e44"), cyl(sx, sy, 13, 44, 46.5, "#141518", 20)], key: K(12) });
  } else if (cooler === "tower") {
    out.push({ parts: [box(sx - 20, sx + 20, sy - 20, sy + 20, 9, 17, CU, { glow: [HOT, heat] })], key: K(10) });
    out.push({ parts: [-15, -5, 5, 15].map((d) => cyl(sx + d, sy, 3.2, 17, 46, CU, 12, { glow: [HOT, heat * 0.7] })), key: K(11) });
    out.push({ parts: [box(sx - 55, sx + 55, sy - 22, sy + 22, 46, 150, ALU, { cap: "#c7ccd2" }), ...[60, 76, 92, 108, 124, 140].map((z) => box(sx - 55.3, sx + 55.3, sy - 22.3, sy + 22.3, z, z + 0.8, "#8c939b"))], key: K(12) });
    out.push({ parts: [box(sx - 55, sx + 55, sy - 22, sy + 22, 150, 155, "#26292e")], key: K(13) });
    const fy0 = sy + 22, fy1 = sy + 47;
    out.push({ parts: [...blades("y", sx, 98, fy0 + 10, fy0 + 12, 15, 48, -fanA, "#4a4f56"), prism(circle(sx, 98, 15, 18), "y", fy0 + 8, fy0 + 14, "#1d1f23"),
      box(sx - 55, sx - 50, fy0, fy1, 43, 153, "#202226"), box(sx + 50, sx + 55, fy0, fy1, 43, 153, "#202226"), box(sx - 50, sx + 50, fy0, fy1, 148, 153, "#202226"), box(sx - 50, sx + 50, fy0, fy1, 43, 48, "#202226")], key: K(14) });
  } else if (cooler === "aio") {
    out.push({ parts: [box(sx - 30, sx + 30, sy - 30, sy + 30, 9, 30, "#1d1f22", { cap: "#2a2d31" }), cyl(sx, sy, 19, 30, 31.5, "#333", 24, { emit: [hslHex(hue % 360), 0.95] }), cyl(sx, sy, 13, 31.5, 32, "#1a1b1e", 20)], key: K(10) });
    // tubes from the pump to the radiator
    const tube = (dy) => { const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push([sx - 30 + (-189 - sx + 30) * t, sy + dy + (dy * 3 - sy - dy) * t * t, 22 + 95 * Math.sin(t * Math.PI / 2) ** 1.4]); } return pts.map((p) => iso(p, PR).map((v) => v.toFixed(1)).join(" ")).join("L"); };
    out.push({ svg: '<path class="tube" d="M' + tube(-12) + '"/><path class="tube" d="M' + tube(12) + '"/><path class="tube-hi" d="M' + tube(-12) + '"/><path class="tube-hi" d="M' + tube(12) + '"/>', key: K(9) });
  } else if (cooler === "ln2") {
    const fr = clamp((-20 - potT) / 140, 0, 0.85);
    out.push({ parts: [box(sx - 58, sx + 58, sy - 58, sy + 58, 2, 13, "#131416", { glow: [FROST, fr * 0.7] })], key: K(8) });
    out.push({ parts: [cyl(sx, sy, 22, 9, 36, CU, 28, { glow: [FROST, fr * 0.8] })], key: K(10) });
    out.push({ parts: [cyl(sx, sy, 34, 36, 172, "#aeb5bd", 32, { glow: [FROST, fr], cap: "#22272d" }), cyl(sx, sy, 36, 170, 176, "#c2c8cf", 32, { glow: [FROST, fr], cap: "#1a2026", emit: pour > 0.2 ? ["#cfe6ff", 0.25] : undefined })], key: K(11) });
  }
  return out;
}
function radiatorObjs() {
  if (cooler !== "aio") return [];
  const out = [{ parts: [box(-216, -190, -112, 112, 0, 126, "#2b2e33", { cap: "#3a3e44" }), box(-216, -190, -112, -104, 0, 126, "#1d1f22"), box(-216, -190, 104, 112, 0, 126, "#1d1f22")], key: -5e5 }];
  for (const yc of [-52, 52]) out.push({ parts: [...blades("x", yc, 63, -189, -187.5, 14, 52, fanA * 0.9, "#454a51"), prism(circle(yc, 63, 14, 18), "x", -190, -184, "#16171a"),
    box(-190, -165, yc - 56, yc - 51, 5, 121, "#1d1f22"), box(-190, -165, yc + 51, yc + 56, 5, 121, "#1d1f22"), box(-190, -165, yc - 51, yc + 51, 5, 10, "#1d1f22"), box(-190, -165, yc - 51, yc + 51, 116, 121, "#1d1f22")], key: -5e5 + 1 + yc * 0.001 });
  return out;
}
function vrmObjs() {
  const vh = clamp((Tv - 80) / 60, 0, 0.9);
  const out = [];
  if (!VRM) return out;
  VRM.hs.forEach((o) => { if (!o.gone) out.push({ parts: o.parts.map((p, i) => (i === 0 ? { ...p, glow: [HOT, vh] } : p)) }); });
  VRM.chokes.forEach((o) => { if (!o.gone) out.push({ parts: o.parts.map((p) => ({ ...p, glow: [HOT, vh * 0.6] })) }); });
  VRM.caps.forEach((o) => { if (!o.gone) out.push(o); });
  return out;
}
let staticHtml = "";
function buildStatic() { boardG.innerHTML = R.render(staticBoard()); }
buildStatic();

// ---------------- the boom ----------------
function boom() {
  boomAt = now; setMode("dead", "boom", "");
  const fc = iso([-95, -60, 30], PR); flashEl.style.setProperty("--fx", (fc[0] / D.W * 100).toFixed(1) + "%"); flashEl.style.setProperty("--fy", (fc[1] / D.H * 100).toFixed(1) + "%");
  chip.health = 0;
  debris = [];
  const fling = (o, sp) => {
    o.gone = true;
    const p = o.parts[0], r = p.ring, cu = r.reduce((s2, q2) => s2 + q2[0], 0) / r.length, cv3 = r.reduce((s2, q2) => s2 + q2[1], 0) / r.length;
    const c = p.axis === "z" ? [cu, cv3, (p.w0 + p.w1) / 2] : [0, 0, 0];
    const a = rnd() * Math.PI * 2;
    debris.push({ parts: o.parts, c, v: [Math.cos(a) * sp * (0.4 + rnd()), Math.sin(a) * sp * (0.4 + rnd()) - 60, 380 + 420 * rnd()], w: [rnd() * 14 - 7, rnd() * 14 - 7, rnd() * 10 - 5], off: [0, 0, 0], rot: [0, 0, 0], rest: false });
  };
  VRM.hs.forEach((o) => fling(o, 120));
  VRM.chokes.forEach((o, i) => { if (i % 2 === 0 || i > 12) fling(o, 260); });
  VRM.caps.forEach((o) => fling(o, 300));
  for (let i = 0; i < 70; i++) spark(-90 + rnd() * 100, -100 + rnd() * 90, 20, 1);
  for (let i = 0; i < 26; i++) smoke(-95 + rnd() * 90, -110 + rnd() * 110, 20 + rnd() * 20, 1.4);
}
function rotate(p, r) {
  let [x, y, z] = p;
  let c = Math.cos(r[0]), s = Math.sin(r[0]); [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(r[1]); s = Math.sin(r[1]); [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(r[2]); s = Math.sin(r[2]); [x, y] = [x * c - y * s, x * s + y * c];
  return [x, y, z];
}
function debrisObjs(dt) {
  return debris.map((d) => {
    if (!d.rest) {
      d.v[2] -= 1300 * dt;
      for (let i = 0; i < 3; i++) { d.off[i] += d.v[i] * dt; d.rot[i] += d.w[i] * dt; }
      if (d.c[2] + d.off[2] < 4 && d.v[2] < 0) { d.v[2] *= -0.3; d.v[0] *= 0.6; d.v[1] *= 0.6; d.w = d.w.map((w) => w * 0.5); if (Math.abs(d.v[2]) < 40) { d.rest = true; } }
    }
    return { parts: d.parts, xf: (p) => { const r2 = rotate([p[0] - d.c[0], p[1] - d.c[1], p[2] - d.c[2]], d.rot); return [r2[0] + d.c[0] + d.off[0], r2[1] + d.c[1] + d.off[1], r2[2] + d.c[2] + d.off[2]]; } };
  });
}

// ---------------- particles ----------------
let parts = [];
function puff(kind, x, y, z, s = 1) { parts.push({ kind, p: iso([x, y, z], PR), v: [0, 0], life: 0, max: 1, s }); return parts[parts.length - 1]; }
function smoke(x, y, z, s = 1) { const p = puff("smoke", x, y, z, s); p.v = [(rnd() - 0.5) * 10, -18 - rnd() * 16]; p.max = 2.5 + rnd() * 1.5; }
function spark(x, y, z, s = 1) { const p = puff("spark", x, y, z, s); const a = rnd() * Math.PI * 2, sp = 60 + rnd() * 160; p.v = [Math.cos(a) * sp, -Math.abs(Math.sin(a)) * sp - 40]; p.max = 0.6 + rnd() * 0.7; }
function fog(x, y, z) { const p = puff("fog", x, y, z, 1); p.v = [(rnd() - 0.5) * 30, 4 + rnd() * 8]; p.max = 1.6 + rnd(); }
function haze(x, y, z) { const p = puff("haze", x, y, z, 1); p.v = [(rnd() - 0.5) * 4, -14 - rnd() * 8]; p.max = 1.4 + rnd(); }
function sizeCanvas() { const r = svgEl.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr)); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } }
function drawParticles(dt) {
  sizeCanvas();
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.setTransform(cv.width / D.W, 0, 0, cv.height / D.H, 0, 0);
  parts = parts.filter((p) => (p.life += dt) < p.max);
  for (const p of parts) {
    const t = p.life / p.max;
    if (p.kind === "spark") p.v[1] += 260 * dt;
    if (p.kind === "fog") { p.v[0] *= 0.98; p.v[1] += 6 * dt; }
    p.p[0] += p.v[0] * dt; p.p[1] += p.v[1] * dt;
    const soft = (r, rgb, a) => { const g = ctx.createRadialGradient(p.p[0], p.p[1], 0, p.p[0], p.p[1], r); g.addColorStop(0, "rgba(" + rgb + "," + a.toFixed(3) + ")"); g.addColorStop(1, "rgba(" + rgb + ",0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.p[0], p.p[1], r, 0, 7); ctx.fill(); };
    if (p.kind === "smoke") soft((7 + 28 * t) * p.s, "70,70,74", 0.6 * (1 - t));
    if (p.kind === "spark") { ctx.fillStyle = "rgba(255," + Math.round(200 - 120 * t) + ",80," + (1 - t).toFixed(3) + ")"; ctx.fillRect(p.p[0] - 1, p.p[1] - 1, 2.2, 2.2); }
    if (p.kind === "fog") soft(9 + 22 * t, "236,244,255", 0.42 * Math.sin(Math.PI * t));
    if (p.kind === "haze") { ctx.strokeStyle = "rgba(255,170,120," + (0.22 * Math.sin(Math.PI * t)).toFixed(3) + ")"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(p.p[0] - 5, p.p[1]); ctx.quadraticCurveTo(p.p[0], p.p[1] - 4, p.p[0] + 5, p.p[1]); ctx.stroke(); }
  }
  // the pour: a thin stream of LN2 into the pot
  if (cooler === "ln2" && pour > 0.05 && mode !== "dead") {
    const a = iso([S[0] + 8, S[1] + 4, 176], PR), b = iso([S[0] + 8, S[1] + 4, 250], PR);
    ctx.strokeStyle = "rgba(225,240,255," + clamp(pour, 0, 0.8).toFixed(2) + ")"; ctx.lineWidth = 1 + 2 * clamp(pour, 0, 1); ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(a[0], a[1]); ctx.stroke();
  }
}

// ---------------- physics ----------------
function physics(dt) {
  const f = mult / 10;
  const running = mode === "run";
  const L0 = running ? LOADS[load].k : mode === "bsod" || mode === "post" ? 0.05 : 0;
  // cooler temperature: everything sinks into the room, except the pot, which you keep topping up
  let Tc = 25, Rth = COOLERS[cooler].Rth;
  if (cooler === "ln2") { const target = potSet + P * 0.012; potT += (target - potT) * Math.min(1, dt / 1.8); Tc = potT; pour = clamp(0.15 + P / 450 + Math.max(0, potT - potSet) / 40, 0, 1); } else { potT += (25 - potT) * Math.min(1, dt / 3); pour = 0; }
  if (safe && T > 95) throttle = Math.min(f - 0.8, throttle + 0.6 * dt); else if (T < 92) throttle = Math.max(0, throttle - 0.4 * dt);
  if (!safe) throttle = 0;
  fEff = Math.max(0.8, f - throttle);
  veff = vset - 0.0002 * I;
  const on = mode !== "off" && mode !== "dead";
  const leak = on ? 12 * vset * Math.exp((clamp(T, -200, 250) - 50) / 45) : 0;
  P = on ? 8 * (L0 > 0 ? 1 : 0) + L0 * 17.8 * veff * veff * fEff + leak : 0;
  I = P / Math.max(0.5, veff);
  T += (Tc + P * Rth - T) * Math.min(1, dt / 1.6);
  Tv += (30 + I * 0.18 - Tv) * Math.min(1, dt / 3);
  // wear: high voltage plus heat
  if (on && chip.health > 0) {
    const cold = T < -40 ? 0.05 : 1;
    chip.health -= dt * 0.00012 * Math.exp((vset - 1.45) / 0.05) * Math.exp((clamp(T, -100, 140) - 70) / 20) * cold;
    if (T > 175) chip.health -= dt * 0.3;
    if (chip.health <= 0) { chip.health = 0; setMode("dead", "cooked"); event("Magic smoke. Too much voltage and heat for too long and the chip's wiring wore through. It's dead."); for (let i = 0; i < 18; i++) smoke(S[0] + rnd() * 30 - 15, S[1] + rnd() * 30 - 15, 40, 1); }
  }
  if (!running) return;
  // the safeties
  if (safe && T > 115) { setMode("off", "thermtrip", "THERMTRIP"); event("THERMTRIP: the chip hit 115 °C and pulled the plug on itself. That's the last line of defence."); return; }
  if (safe && I > 300) { setMode("off", "ocp", "OCP"); event("Over-current: the VRM saw " + Math.round(I) + " A and shut down before anything melted."); return; }
  if (!safe) { if (I > 280) overI += dt; else overI = Math.max(0, overI - dt); if (overI > 0.4) { event("The VRM was pushing " + Math.round(I) + " A with no over-current limit. Something had to give."); boom(); return; } }
  if (T < chip.coldBug) { setMode("off", "coldbug", "COLD BUG"); event("Cold bug: this chip just stops working below about " + Math.round(chip.coldBug) + " °C. Let the pot warm up a bit."); return; }
  // stability: short on voltage and it errors, sooner or later
  const d = vmin(fEff, T) - veff;
  const rate = (0.15 + LOADS[load].k) * 0.05 * Math.exp(d / 0.01);
  if (d > 0.15 || rnd() < rate * dt) { setMode("bsod", "crash", rnd() < 0.5 ? "CLOCK_WATCHDOG_TIMEOUT" : "WHEA_UNCORRECTABLE_ERROR"); event("Blue screen. At " + fEff.toFixed(2) + " GHz this chip wanted about " + vmin(fEff, T).toFixed(2) + " V and got " + veff.toFixed(2) + " V under load."); return; }
  // the render benchmark
  if (load === "render") {
    runProg += dt * fEff / (4.5 * 8); runF += fEff * dt; runT += dt;
    if (runProg >= 1) { lastScore = Math.round((runF / runT) * 2950); best = Math.max(best, lastScore); runProg = 0; runF = 0; runT = 0; event("Render done: " + lastScore.toLocaleString("en-AU") + " points" + (lastScore >= best ? ", a new best." : ".")); }
  } else { runProg = 0; runF = 0; runT = 0; }
}
function modes() {
  const t = now - modeAt;
  if (mode === "bsod" && t > 3) setMode("post");
  if (mode === "post" && t > 1.2) { const d = vmin(mult / 10, T) - vset; if (d > 0.15) { setMode("off", "nopost", "NO POST"); event("It won't even boot at " + (mult / 10).toFixed(1) + " GHz on " + vset.toFixed(2) + " V. Back off the clock or add voltage."); } else setMode("run"); }
  if (mode === "off" && t > 3 && why !== "nopost") { if (why === "thermtrip" && T > 60) return; setMode("post"); }
  if (mode === "off" && why === "nopost" && vmin(mult / 10, T) - vset <= 0.15) setMode("post");
  if (boomAt !== null && now - boomAt > 6) { boomAt = null; debris = []; makeVrm(); buildStatic(); chip = newChip(touring ? 0.6 : undefined); safe = true; T = 30; Tv = 30; overI = 0; mult = 45; vset = 1.25; load = "render"; if (cooler === "ln2") cooler = "tower"; actions = []; setMode("post"); event("New board, new chip, BIOS back to defaults. Safeties on."); }
  if (mode === "dead" && why === "cooked" && t > 4 && boomAt === null) { chip = newChip(touring ? 0.6 : undefined); setMode("post"); event("New chip. This one's " + chip.grade + "."); }
}

// ---------------- drawing ----------------
let shotFrame = 0;
function draw(dt) {
  fanA += dt * (4 + clamp((T - 30) / 50, 0, 1) * 9) * (mode === "off" || mode === "dead" ? 0 : 1);
  hue = (hue + dt * 40) % 360;
  backG.innerHTML = R.render(radiatorObjs());
  const objs = [...vrmObjs(), ...ram(0), ...coolerObjs(), ...debrisObjs(dt)];
  frontG.innerHTML = R.render(objs);
  // effects
  if (cooler === "ln2" && mode !== "dead" && rnd() < dt * (8 + 30 * pour)) { const a = rnd() * Math.PI * 2; fog(S[0] + Math.cos(a) * 34, S[1] + Math.sin(a) * 34, 176); }
  if (cooler === "ln2" && potT < -60 && rnd() < dt * 6) { const a = rnd() * Math.PI * 2; fog(S[0] + Math.cos(a) * 60, S[1] + Math.sin(a) * 60, 12); }
  if (cooler !== "ln2" && T > 75 && rnd() < dt * (T - 70) * 0.25) haze(S[0] + (rnd() - 0.5) * 60, S[1] + (rnd() - 0.5) * 40, cooler === "tower" ? 158 : 48);
  if (Tv > 110 && rnd() < dt * 3) smoke(-100 + rnd() * 20, -100 + rnd() * 100, 36, 0.6);
  if ((mode === "dead" && why === "cooked") && rnd() < dt * 5) smoke(S[0] + rnd() * 20 - 10, S[1] + rnd() * 20 - 10, 40, 0.8);
  drawParticles(dt);
  // shake and flash
  const bt = boomAt === null ? 9 : now - boomAt;
  svgEl.style.transform = bt < 0.6 ? "translate(" + ((rnd() - 0.5) * 14 * (1 - bt / 0.6)).toFixed(1) + "px," + ((rnd() - 0.5) * 14 * (1 - bt / 0.6)).toFixed(1) + "px)" : "";
  flashEl.style.opacity = bt < 0.5 ? String((1 - bt / 0.5) * 0.9) : "0";
  // debug display: CPU temp when it's running, a code when it isn't
  const code = mode === "run" ? (T < 0 ? "-" + Math.min(99, Math.round(-T)) : String(Math.min(99, Math.round(T)))) : mode === "bsod" ? "8d" : mode === "post" ? "19" : mode === "dead" ? "00" : why === "coldbug" ? "C0" : why === "nopost" ? "00" : "FF";
  if (qcode.textContent !== code) qcode.textContent = code;
  monitor();
  const text = mode === "run" ? fEff.toFixed(2) + " GHz · " + veff.toFixed(3) + " V · " + Math.round(T) + " °C · " + Math.round(P) + " W" : mode === "bsod" ? "BLUE SCREEN" : mode === "post" ? "REBOOTING" : mode === "dead" ? (why === "boom" ? "VRM GONE" : "DEAD") : "SHUT DOWN: " + stop;
  if (readout.textContent !== text) readout.textContent = text;
}
function monitor() {
  let html, cls;
  if (mode === "bsod") { cls = "bsod"; html = '<div class="sad">:(</div><div>Your PC ran into a problem and needs to restart.</div><div class="code">Stop code: ' + stop + "</div>"; }
  else if (mode === "post") { cls = "post"; html = "<div>BIOS</div><div>" + (mult / 10).toFixed(1) + " GHz · " + vset.toFixed(2) + " V</div><div>booting</div>"; }
  else if (mode === "off" || mode === "dead") { cls = "off"; html = "<div>No signal</div>" + (mode === "dead" ? "<div class=code>" + (why === "boom" ? "smells like a burnt VRM" : "smells like a dead CPU") + "</div>" : ""); }
  else {
    cls = "desk";
    const job = load === "render" ? '<div>render.exe</div><div class="bar"><i style="width:' + (runProg * 100).toFixed(1) + '%"></i></div><div>last ' + (lastScore ? lastScore.toLocaleString("en-AU") : "-") + " · best " + (best ? best.toLocaleString("en-AU") : "-") + "</div>" : load === "game" ? "<div>game.exe</div><div class=big>" + Math.round(fEff * 31) + " fps</div>" : load === "avx" ? "<div>stress.exe (AVX)</div><div class=big>hammering it</div>" : "<div>desktop</div><div class=big>idle</div>";
    html = job + '<div class="dim">' + fEff.toFixed(2) + " GHz · " + Math.round(T) + " °C</div>";
  }
  const key = cls + html;
  if (mon.key !== key) { mon.key = key; mon.scr.className = "mon-scr " + cls; mon.scr.innerHTML = html; }
}

// ---------------- UI ----------------
const ui = {
  mult: document.querySelector("#mult"), multOut: document.querySelector("#mult-out"), volt: document.querySelector("#volt"), voltOut: document.querySelector("#volt-out"),
  pot: document.querySelector("#pot"), potOut: document.querySelector("#pot-out"), potRow: document.querySelector("#pot-row"),
  cool: [...document.querySelectorAll("[data-cool]")], load: [...document.querySelectorAll("[data-load]")], safe: document.querySelector("#safe"),
  chipB: document.querySelector("#chip"), stock: document.querySelector("#stock"), slow: document.querySelector("#slow"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"),
  tFill: document.querySelector("#t-fill"), tOut: document.querySelector("#t-out"), pFill: document.querySelector("#p-fill"), pOut: document.querySelector("#p-out"),
  mFill: document.querySelector("#m-fill"), mOut: document.querySelector("#m-out"), hFill: document.querySelector("#h-fill"), hOut: document.querySelector("#h-out"), stats: document.querySelector("#stats"),
};
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };
function syncUi() {
  ui.mult.value = String(mult); ui.volt.value = vset.toFixed(3); ui.pot.value = String(potSet);
  ui.multOut.textContent = "×" + mult + " · " + (mult / 10).toFixed(1) + " GHz"; ui.voltOut.textContent = vset.toFixed(3) + " V"; ui.potOut.textContent = potSet + " °C";
  ui.potRow.hidden = cooler !== "ln2";
  ui.cool.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cool === cooler)));
  ui.load.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.load === load)));
  ui.safe.setAttribute("aria-pressed", String(!safe)); ui.safe.textContent = safe ? "Safeties on" : "Safeties OFF";
  ui.tFill.style.left = "0"; ui.tFill.style.width = (clamp((T + 200) / 380, 0, 1) * 100).toFixed(1) + "%"; ui.tFill.dataset.state = T > 95 ? "bad" : T > 80 ? "warn" : T < -20 ? "cold" : "ok";
  ui.tOut.textContent = Math.round(T) + " °C";
  ui.pFill.style.width = (clamp(I / 400, 0, 1) * 100).toFixed(1) + "%"; ui.pFill.dataset.state = I > 300 ? "bad" : I > 220 ? "warn" : "ok";
  ui.pOut.textContent = Math.round(P) + " W · " + Math.round(I) + " A";
  const m = veff - vmin(fEff, T), on = mode === "run";
  ui.mFill.style.width = (clamp((m + 0.1) / 0.2, 0, 1) * 100).toFixed(1) + "%"; ui.mFill.dataset.state = !on ? "off" : m < 0 ? "bad" : m < 0.03 ? "warn" : "ok";
  ui.mOut.textContent = on ? (m >= 0 ? "+" : "") + Math.round(m * 1000) + " mV" : "-";
  ui.hFill.style.width = (chip.health * 100).toFixed(1) + "%"; ui.hFill.dataset.state = chip.health < 0.3 ? "bad" : chip.health < 0.7 ? "warn" : "ok";
  ui.hOut.textContent = Math.round(chip.health * 100) + " %";
  ui.stats.innerHTML = "This chip is <b>" + chip.grade + "</b> · " + (throttle > 0.05 ? "<b>throttling</b> to " + fEff.toFixed(2) + " GHz · " : "") + "score last <b>" + (lastScore ? lastScore.toLocaleString("en-AU") : "-") + "</b>, best <b>" + (best ? best.toLocaleString("en-AU") : "-") + "</b>";
  ui.slow.setAttribute("aria-pressed", String(slow)); ui.tour.setAttribute("aria-pressed", String(touring));
}
function story() {
  if (now - lastEventAt < 5.5 && lastEvent) return say(lastEvent);
  if (touring && tourStep >= 0 && TOUR[tourStep].say) return say(TOUR[tourStep].say);
  if (mode !== "run") return;
  const m = veff - vmin(fEff, T);
  if (throttle > 0.05) return say("It's hit 95 °C and is pulling its own clock down to stay there. More clock on this cooler just means more heat, not more speed.");
  if (cooler === "ln2" && T < -100) return say("At " + Math.round(T) + " °C the silicon switches faster and leaks less, so the voltage it needs for each step of clock drops off. That's the whole point of the pot.");
  if (m < 0) return say("Short on voltage by about " + Math.round(-m * 1000) + " mV under this load. It'll fall over any second now.");
  if (vset > 1.45 && T > 60 && chip.health < 1) return say("High voltage plus heat wears the chip out. Watch the health bar: that's electromigration, and it doesn't grow back.");
  if (m < 0.03) return say("Right on the edge: stable for now, maybe not for an hour of rendering.");
  return say(mult === 45 && Math.abs(vset - 1.25) < 0.01 ? "Stock: 4.5 GHz on 1.25 V. Bump the clock, add voltage when it blue-screens, and chase the score. Every chip is different." : "Stable with " + Math.round(m * 1000) + " mV to spare. Power goes up with voltage squared, so that spare voltage is costing you heat.");
}
const TOUR = [
  { say: "Stock: 4.5 GHz on 1.25 V on a tower cooler, running a render. Note the score.", acts: [[0, () => { chip = newChip(0.6); cooler = "tower"; mult = 45; vset = 1.25; load = "render"; safe = true; potSet = -185; setMode("run"); }], [11, null]] },
  { say: "Clock up to 5.3 GHz, same voltage. It doesn't have enough juice for that.", acts: [[0, () => { mult = 53; }], [9, null]] },
  { say: "Add voltage: 1.37 V. Stable again, faster, and a lot hotter.", acts: [[0, () => { vset = 1.37; setMode("post"); }], [12, null]] },
  { say: "Now 5.8 GHz on 1.50 V. The tower can't move the heat fast enough.", acts: [[0, () => { mult = 58; vset = 1.5; }], [11, null]] },
  { say: "Liquid nitrogen. Pot at -185 °C, 7.8 GHz on 1.62 V. Keep pouring.", acts: [[0, () => { cooler = "ln2"; potT = -60; T = -40; mult = 78; vset = 1.62; setMode("post"); }], [15, null]] },
  { say: "Safeties off, back on the stock cooler, 5.8 GHz on 1.75 V, AVX stress test. Don't do this at home.", acts: [[0, () => { cooler = "stock"; potT = 25; T = 45; mult = 58; vset = 1.75; load = "avx"; safe = false; setMode("run"); }], [14, null]] },
];
function tourTick() {
  if (tourStep < 0 || !actions.length) {
    if (boomAt !== null) return;
    tourStep = (tourStep + 1) % TOUR.length;
    actions = TOUR[tourStep].acts.map(([w, fn]) => [tourClock + w, fn]);
  }
  while (actions.length && tourClock >= actions[0][0]) { const fn = actions.shift()[1]; if (fn) fn(); else actions = []; }
}
function tick(t) {
  const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
  last = t;
  const sdt = dt * (slow ? 0.2 : 1);
  now += sdt;
  if (touring) { tourClock += sdt; tourTick(); }
  physics(sdt); modes(); draw(sdt); syncUi(); story();
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { if (touring) { touring = false; actions = []; tourStep = -1; } };
const act = (fn) => (...a) => { takeOver(); fn(...a); syncUi(); run(); };
ui.mult.addEventListener("input", act(() => { mult = +ui.mult.value; if (mode === "off" && why === "nopost") setMode("post"); }));
ui.volt.addEventListener("input", act(() => { vset = +ui.volt.value; }));
ui.pot.addEventListener("input", act(() => { potSet = +ui.pot.value; }));
ui.cool.forEach((b) => b.addEventListener("click", act(() => { cooler = b.dataset.cool; if (cooler === "ln2") potT = Math.min(potT, 0); })));
ui.load.forEach((b) => b.addEventListener("click", act(() => { load = b.dataset.load; runProg = 0; })));
ui.safe.addEventListener("click", act(() => { safe = !safe; overI = 0; }));
ui.chipB.addEventListener("click", act(() => { if (boomAt !== null) return; chip = newChip(); best = 0; lastScore = 0; setMode("post"); event("New chip from the box. This one's " + chip.grade + ". Same settings might not work now."); }));
ui.stock.addEventListener("click", act(() => { mult = 45; vset = 1.25; safe = true; load = "render"; if (mode !== "dead") setMode("post"); }));
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; actions = []; } syncUi(); run(); });
stage.addEventListener("keydown", (ev) => {
  const map = { ArrowUp: () => { mult = Math.min(95, mult + 1); }, ArrowDown: () => { mult = Math.max(30, mult - 1); }, ArrowRight: () => { vset = Math.min(2, vset + 0.01); }, ArrowLeft: () => { vset = Math.max(0.9, vset - 0.01); },
    "1": () => { cooler = "stock"; }, "2": () => { cooler = "tower"; }, "3": () => { cooler = "aio"; }, "4": () => { cooler = "ln2"; potT = Math.min(potT, 0); } };
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
.fx-flash{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(circle 46% at var(--fx,30%) var(--fy,38%),#fff6dc 0%,#ffcf8a 40%,rgba(255,160,80,0) 100%)}
.trace{fill:none;stroke:#3a4a52;stroke-width:.6;opacity:.8}body[data-theme="light"] .trace{stroke:#4a5a63}
.silk{fill:#c9d2d8;opacity:.55;font-family:var(--anatomy-mono);letter-spacing:1px}
.cable{fill:none;stroke:#2a2c30;stroke-width:4;stroke-linecap:round}
.tube{fill:none;stroke:#18191c;stroke-width:6;stroke-linecap:round}.tube-hi{fill:none;stroke:#4a4e55;stroke-width:1.2;stroke-linecap:round;transform:translate(-1px,-1.5px)}
.qcode{fill:#ff4a3d;font-family:var(--anatomy-mono);font-weight:700;letter-spacing:1px}
.mon{position:absolute;right:2.5%;top:3%;width:30%;max-width:190px;aspect-ratio:16/10;background:#0c0d0f;border:3px solid #2a2c30;border-radius:4px;box-shadow:0 3px 10px rgba(0,0,0,.35);pointer-events:none}
.mon::after{content:"";position:absolute;left:42%;right:42%;bottom:-9px;height:7px;background:#2a2c30;border-radius:0 0 3px 3px}
.mon-scr{position:absolute;inset:0;padding:6% 7%;font-family:var(--anatomy-mono);font-size:9.5px;line-height:1.35;color:#cfd6de;overflow:hidden}
.mon-scr.bsod{background:#0d6bd2;color:#fff;font-family:system-ui,sans-serif}.mon-scr.bsod .sad{font-size:22px;line-height:1.1;margin-bottom:3px}.mon-scr .code{opacity:.8;margin-top:4px;font-size:8.5px}
.mon-scr.desk{background:linear-gradient(160deg,#16324a,#0d1a26)}.mon-scr.post{background:#000;color:#9aa4ad}.mon-scr.off{background:#000;color:#666;display:flex;flex-direction:column;justify-content:center;align-items:center}
.mon-scr .bar{height:6px;background:#26384a;border-radius:3px;margin:4px 0;overflow:hidden}.mon-scr .bar i{display:block;height:100%;background:#3ddc84}
.mon-scr .big{font-size:15px;margin:3px 0;color:#fff}.mon-scr .dim{opacity:.6;margin-top:3px}
.ctl{display:grid;gap:12px;margin:14px 0 6px;font-family:var(--anatomy-mono);font-size:12px;color:var(--anatomy-mid)}
.ctl-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ctl-row[hidden]{display:none}
.ctl-label{min-width:72px;text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:var(--anatomy-lo)}
.ctl button{font:inherit;color:var(--anatomy-mid);background:transparent;border:1px solid var(--anatomy-lo);border-radius:6px;padding:7px 10px;cursor:pointer;line-height:1.15;text-align:left;min-height:36px}
.ctl button:hover{border-color:var(--anatomy-mid)}
.ctl button[aria-pressed="true"]{color:var(--anatomy-lit);border-color:var(--anatomy-lit)}
.ctl #safe[aria-pressed="true"]{color:#ff6a3d;border-color:#ff6a3d}
.ctl button small{display:block;font-size:10px;color:var(--anatomy-lo)}
.ctl output{min-width:96px;text-align:right;color:var(--anatomy-hi,var(--anatomy-mid))}
.slide{position:relative;flex:1;min-width:120px}.slide input{width:100%;accent-color:var(--anatomy-lit);margin:0}
.meter{position:relative;flex:1;min-width:110px;height:10px;margin-top:14px;border:1px solid var(--anatomy-lo);border-radius:5px}
.meter .fill{position:absolute;left:0;top:0;bottom:0;border-radius:4px;transition:width .1s;background:var(--anatomy-mid)}
.meter .fill[data-state="ok"]{background:#3ddc84}.meter .fill[data-state="warn"]{background:#ffb347}.meter .fill[data-state="bad"]{background:#ff5a2a}.meter .fill[data-state="cold"]{background:#7cc4ff}.meter .fill[data-state="off"]{background:var(--anatomy-lo)}
.mark{position:absolute;top:-14px;bottom:-3px;width:0;border-left:1px dashed #ff6a3d;pointer-events:none}
.mark::after{content:attr(data-label);position:absolute;top:0;left:4px;font-size:10px;white-space:nowrap;color:#ff6a3d}
.mark.l::after{left:auto;right:4px}
#stats{font-size:12px;color:var(--anatomy-mid);line-height:1.5}#stats b{color:var(--anatomy-hi,var(--anatomy-mid));font-weight:600}
#shot{min-height:3.6em;font-size:12px;line-height:1.4}
@media (max-width:520px){.ctl-label{min-width:52px}.ctl button{padding:7px 8px}.ctl output{min-width:80px}.ctl button small{display:none}.mon-scr{font-size:7.5px}.mon-scr.bsod .sad{font-size:15px}}`;

const stageHtml = `<div class="iso-stage fx-stage" tabindex="0" role="group" aria-label="Overclocking bench: up and down change the multiplier, left and right the voltage, 1 to 4 pick the cooler">${svg}<canvas class="fx-smoke" aria-hidden="true"></canvas><div class="mon" aria-hidden="true"><div class="mon-scr desk"></div></div><div class="fx-flash" aria-hidden="true"></div></div>`;

const pct = (t) => ((t + 200) / 380 * 100).toFixed(1);
const CONTROLS = `<div class="ctl" role="group" aria-label="Controls">
  <div class="ctl-row"><span class="ctl-label">Clock</span><div class="slide"><input id="mult" type="range" min="30" max="95" step="1" value="45" aria-label="CPU multiplier, times 100 MHz"></div><output id="mult-out">×45</output></div>
  <div class="ctl-row"><span class="ctl-label">Vcore</span><div class="slide"><input id="volt" type="range" min="0.9" max="2" step="0.005" value="1.25" aria-label="Core voltage"></div><output id="volt-out">1.250 V</output></div>
  <div class="ctl-row"><span class="ctl-label">Cooler</span><button type="button" data-cool="stock">Stock<small>box cooler</small></button><button type="button" data-cool="tower" aria-pressed="true">Tower<small>big air</small></button><button type="button" data-cool="aio">240 AIO<small>liquid</small></button><button type="button" data-cool="ln2">LN2 pot<small>-196 °C</small></button></div>
  <div class="ctl-row" id="pot-row" hidden><span class="ctl-label">Pot</span><div class="slide"><input id="pot" type="range" min="-190" max="-30" step="5" value="-185" aria-label="Pot temperature to hold"></div><output id="pot-out">-185 °C</output></div>
  <div class="ctl-row"><span class="ctl-label">Load</span><button type="button" data-load="idle">Idle</button><button type="button" data-load="game">Gaming</button><button type="button" data-load="render" aria-pressed="true">Render<small>scores</small></button><button type="button" data-load="avx">AVX stress<small>hottest</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Temp</span><div class="meter"><span id="t-fill" class="fill"></span><span class="mark" style="left:${pct(95)}%" data-label="95 throttle"></span><span class="mark l" style="left:${pct(-196)}%" data-label=""></span></div><output id="t-out">40 °C</output></div>
  <div class="ctl-row"><span class="ctl-label">Power</span><div class="meter"><span id="p-fill" class="fill"></span><span class="mark l" style="left:75%" data-label="300 A limit"></span></div><output id="p-out">0 W</output></div>
  <div class="ctl-row"><span class="ctl-label">Margin</span><div class="meter"><span id="m-fill" class="fill"></span><span class="mark" style="left:50%" data-label="crash"></span></div><output id="m-out">-</output></div>
  <div class="ctl-row"><span class="ctl-label">Health</span><div class="meter"><span id="h-fill" class="fill"></span></div><output id="h-out">100 %</output></div>
  <div class="ctl-row"><span class="ctl-label">Chip</span><span id="stats"></span></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="safe" aria-pressed="false">Safeties on</button><button type="button" id="chip">New chip<small>silicon lottery</small></button><button type="button" id="stock">Back to stock</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
  <div id="shot" aria-live="polite"></div>
</div>`;

const card = k.plateHtml({
  fig: "Fig 20",
  title: "Overclocking a CPU",
  hint: "Clock up, voltage up, don't cook it",
  readout: "",
  keys: [
    { mark: "lit", label: "Live: clock, voltage, temperature, power, the debug display and the monitor" },
    { mark: "raised", label: "Desktop board on a test bench, with four coolers to swap: stock, tower, liquid, LN2 pot" },
  ],
  caption: "A CPU runs at a multiplier times a 100 MHz base clock. Push the multiplier and each transistor has less time to switch, so it needs more voltage to switch faster; give it too little and it makes errors, which on Windows means a blue screen. Power goes up with the clock and with the square of the voltage, and a hot chip leaks more, so heat makes more heat. Past a point every chip hits a wall where the voltage it needs shoots up. Cold pushes that wall out, which is why the record runs are done on liquid nitrogen. Every chip is a bit different, and high voltage plus heat slowly wears them out.",
  body: stageHtml,
});

const other = theme === "light" ? ["index.html", "Dark version"] : ["light.html", "Light version"];
const FOOT = `<p style="font-family:var(--anatomy-mono);font-size:11px;color:var(--anatomy-lo);margin:28px 0 8px;line-height:1.6">A toy, not a tuning guide. Real: power going with voltage squared times clock, leakage rising with temperature, the voltage wall, cold pushing it out, liquid nitrogen at -196 °C, the silicon lottery, the cold bug, throttling and a thermal trip at the top end, over-current protection on the VRM, voltage droop under load, CLOCK_WATCHDOG_TIMEOUT and WHEA blue screens, and high voltage plus heat wearing a chip out. The real frequency record is about 9.2 GHz, set in 2026 on liquid helium. Made up: the chip, every number in the model, the score, and the time scale (temperatures settle in seconds, a render takes eight). Don't put 1.65 V through your own CPU.<br>Built with <a href="https://github.com/wheresryan22/anatomy" style="color:inherit">Anatomy</a> by Ryan (MIT). · <a href="${other[0]}" style="color:inherit">${other[1]}</a> · <a href="../" style="color:inherit">More figures</a> · <a href="https://github.com/Dizzyfer/Anatomy/tree/main/overclock" style="color:inherit">Source</a></p>`;
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "Overclocking a CPU", theme, body: `<style>${CSS}</style>${card.replace("<figcaption", CONTROLS + "<figcaption")}${FOOT}`, script: kitScript() + LIVE.replace("__DATA__", JSON.stringify(DATA)), width: 700 }));
console.log("wrote", name);
