import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { engineScript, stageHtml, pageMk2, footHtml } from "../../mk2/shell.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const W = 960, H = 600;

// Truth: pressure piling is defined in IEC 60079-1 (3.10 in the 2007 text; tested for under 15.2.2.4 in the 2014 edition). The standard's note
// presumes it when results in a test series differ by a factor of 1,5 or more, or the pressure rise time is under 5 ms.
// The overpressure type test is 1,5 times the reference pressure (4 times if there is to be no routine test).
// Toy: a lumped two-volume model. er is the closed-vessel pressure ratio and sf an effective flame speed, both ballpark.
const GASES = [
  { id: "CH4", name: "methane", group: "I", er: 8.1, sf: 4 },
  { id: "C3H8", name: "propane", group: "IIA", er: 8.9, sf: 4.6 },
  { id: "C2H4", name: "ethylene", group: "IIB", er: 9.0, sf: 8 },
  { id: "H2", name: "hydrogen", group: "IIC", er: 7.8, sf: 28 },
];
const WALL = 6, AO = { x0: -104, x1: 14, y0: -40, y1: 40, z0: 8, z1: 68 };
const CA = { x0: AO.x0 + WALL, x1: AO.x1 - WALL, y0: AO.y0 + WALL, y1: AO.y1 - WALL, z0: AO.z0 + WALL, z1: AO.z1 };
const GEO = { AO, CA, WALL, BX: 26, VA: 8 };
const START = { gas: 0, hole: 12, size: 15, ign: 0 };
const PLATE = { x: -128, y: -62, w: 284, d: 124, r: 8 };
const P = k.fitProjection([...k.boxCorners(PLATE, -0.8, 0), [-107, -43, 96], [136, -40, 84], [136, 40, 84], [-107, 43, 96]], W, H, { pad: 22, azimuth: 45, elevation: 30 });
const DATA = { W, H, P, PLATE };
Object.assign(DATA, { GASES, GEO, start: START });
const LIVE = `
${engineScript()}
const D = __DATA__;
const stage = document.querySelector(".mk-stage");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lightTheme = document.body.dataset.theme === "light";
const E = mk2(stage, D.P, { W: D.W, H: D.H, pivot: [10, 0, 34], plate: { ...D.PLATE, h: 12, foot: 5 }, shadowBox: [-136, -70, -18, 164, 70, 120] });
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
const GASES = D.GASES, G3 = D.GEO, AO = G3.AO, CA = G3.CA, TAU = Math.PI * 2, rn = () => Math.random();
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const burst = (age, rise, fall) => (age > 0 ? sm(0, rise, age) * Math.exp(-Math.max(0, age - rise) / fall) : 0);
const flashEl = stage.querySelector(".fx-flash"), q = (s) => document.querySelector(s);

// ---------------- the model: two volumes of ideal gas and an orifice between them ----------------
// pressures in bar absolute, volumes in litres, time in milliseconds
const GAM = 1.4, RHO0 = 1.2, DT = 0.01, QUENCH = 1.5, TURB = 6, TAU_C = 300;
function simulate(o) {
  const area = Math.PI * (o.d / 2000) * (o.d / 2000), len = (V) => Math.cbrt(V / 1000) * 1.45;
  const mk = (V) => ({ V, p: 1, mu: 1, nb: 0, X: 0, lit: false, t0: 0, tb: 0, tArr: 1e9, peak: 1 });
  const C = [mk(o.VA), mk(o.VB)], f = C[o.first];
  f.lit = true; f.tb = (len(f.V) / o.sf) * 1000; f.tArr = f.tb * o.arr;
  const T = [], PA = [], PB = [], MB = [];
  let t = 0, tEnd = 1e9, jetAt = null, lastMove = 0;
  for (let k = 0; k < 400000 && t < tEnd; k++, t += DT) {
    for (const c of C) if (c.lit && c.X < 1) {
      const u = Math.min(1, (t - c.t0) / c.tb), X = Math.min(1, u * u * u * (4 - 3 * u)), db = Math.min(c.mu, (c.mu * (X - c.X)) / Math.max(1e-6, 1 - c.X));
      c.X = X; c.mu -= db; c.nb += db; c.p += (o.er - 1) * db;
    }
    if (area > 0) {
      const a = C[0].p >= C[1].p ? 0 : 1, up = C[a], dn = C[1 - a], dp = up.p - dn.p;
      if (dp > 1e-6) {
        const burned = up.lit && (t >= up.tArr || up.mu <= 1e-6), rho = burned ? Math.max(0.02, up.p / o.er) : Math.pow(up.p, 1 / GAM);
        const v = dn.p / up.p < 0.528 ? 0.5787 * Math.sqrt((GAM * rho * up.p * 1e5) / RHO0) : Math.sqrt((2 * rho * dp * 1e5) / RHO0);
        const dm = Math.min(0.62 * area * 1000 * v * (DT / 1000), (burned ? up.nb : up.mu) * up.V * 0.5), dE = GAM * (up.p / rho) * dm;
        up.p -= dE / up.V; dn.p += dE / dn.V;
        if (burned) { up.nb -= dm / up.V; dn.nb += dm / dn.V; } else { up.mu -= dm / up.V; dn.mu += dm / dn.V; }
        if (burned && !dn.lit && o.d >= QUENCH && dn.mu > 0.02) { dn.lit = true; dn.t0 = t; dn.tArr = t; dn.tb = (len(dn.V) / (o.sf * TURB)) * 1000; jetAt = t; }
      }
    }
    for (const c of C) { const cold = c.mu + c.nb; c.p -= ((c.p - cold) * (c.nb / Math.max(1e-6, cold)) * DT) / TAU_C; if (c.p > c.peak) c.peak = c.p; }
    if (k % 10 === 0) { T.push(t); PA.push(C[0].p); PB.push(C[1].p); MB.push(C[1].mu); }
    if (C.some((c) => c.lit && c.X < 1)) lastMove = t; else if (t > lastMove + 30) tEnd = t;
  }
  const s = C[1 - o.first]; let rise = null;
  if (s.lit) { const P = o.first === 0 ? PB : PA, i0 = Math.round(s.t0 / 0.1), p0 = P[Math.min(P.length - 1, i0)], lo = p0 + 0.1 * (s.peak - p0), hi = p0 + 0.9 * (s.peak - p0); let a = null; for (let i = i0; i < P.length; i++) { if (a === null && P[i] >= lo) a = T[i]; if (P[i] >= hi) { rise = T[i] - a; break; } } }
  return { T, PA, PB, MB, C, first: o.first, peakA: C[0].peak - 1, peakB: C[1].peak - 1, jetAt, rise, tEnd: t, pJet: jetAt === null ? 0 : (o.first === 0 ? PB : PA)[Math.min(PA.length - 1, Math.round(jetAt / 0.1))] - 1 };
}

// ---------------- state ----------------
let gas = D.start.gas, hole = D.start.hole, size = D.start.size, ign = D.start.ign;
let now = 0, last = 0, frame = 0, visible = true, slow = false, touring = !still.matches, tourStep = -1, tourWait = 0;
let res = null, playT = 0, playing = false, simT = 0, segs = [], boomAt = null, failed = -1, verdict = "", shown = false;
const BOOM_END = 4.2, booming = () => boomAt !== null;
const NAMES = ["main", "second"];
// what one compartment on its own makes with this gas: the "reference pressure" a lab would measure with the opening sealed
const REF = GASES.map((g) => simulate({ er: g.er, sf: g.sf, d: 0, VA: G3.VA, VB: 1, first: 0, arr: 0.8 }).peakA);
const tested = () => 1.5 * REF[gas], letGo = () => 2 * REF[gas];
const b1 = (v) => v.toFixed(1) + " bar";
// the second compartment grows and shrinks with the slider
function geoB() {
  const s = Math.cbrt(size / 100), w = Math.max(3.5, 6 * s), L = 110 * s, Wd = 80 * s, Hh = 60 * s, x0 = G3.BX, zc = AO.z0 + Hh / 2 + w / 2;
  return { s, w, O: { x0, x1: x0 + L, y0: -Wd / 2, y1: Wd / 2, z0: AO.z0, z1: AO.z0 + Hh }, C: { x0: x0 + w, x1: x0 + L - w, y0: -Wd / 2 + w, y1: Wd / 2 - w, z0: AO.z0 + w, z1: AO.z0 + Hh }, zc, rh: Math.min(hole * 0.2, (Hh - w) / 2 - 1.5) };
}
// where the spark is, and how far through its burn the flame is when it reaches the opening
function ignGeo(B) {
  const far = (c, p) => Math.max(...[c.x0, c.x1].flatMap((x) => [c.y0, c.y1].flatMap((y) => [c.z0, c.z1].map((z) => Math.hypot(x - p[0], y - p[1], z - p[2])))));
  if (ign === 2) { const p = [B.C.x1 - (B.C.x1 - B.C.x0) * 0.12, 0, B.zc], h = [B.C.x0, 0, B.zc], R = far(B.C, p); return { first: 1, p, R, arr: Math.hypot(p[0] - h[0], p[1] - h[1], p[2] - h[2]) / R }; }
  const p = ign === 0 ? [CA.x0 + 9, -6, 32] : [CA.x1 - 12, 9, B.zc + 5], h = [CA.x1, 0, B.zc], R = far(CA, p);
  return { first: 0, p, R, arr: Math.hypot(p[0] - h[0], p[1] - h[1], p[2] - h[2]) / R };
}
const at = (arr, t) => { const x = clamp(t / 0.1, 0, arr.length - 1), i = Math.floor(x), j = Math.min(arr.length - 1, i + 1); return arr[i] + (arr[j] - arr[i]) * (x - i); };
const simAt = (pt) => { let acc = 0; for (const s of segs) { if (pt <= acc + s.d) return s.a + ((s.b - s.a) * (pt - acc)) / s.d; acc += s.d; } return segs.length ? segs[segs.length - 1].b : 0; };
const playDur = () => segs.reduce((a, s) => a + s.d, 0);

const ui = { gasBtns: [...document.querySelectorAll("[data-gas]")], ignBtns: [...document.querySelectorAll("[data-ign]")], hole: q("#hole"), holeOut: q("#hole-out"), size: q("#size"), sizeOut: q("#size-out"),
  fill: [q("#ma-fill"), q("#mb-fill")], out: [q("#ma-out"), q("#mb-out")], test: [q("#ma-test"), q("#mb-test")], burstM: [q("#ma-burst"), q("#mb-burst")], fire: q("#fire"), slow: q("#slow"), tour: q("#tour"), shot: q("#shot") };
const sliding = { hole: false, size: false }, MAXP = 30, pos = (v) => (clamp(v / MAXP, 0, 1) * 100).toFixed(1) + "%";
let lastShot = "";
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };
function syncUi() {
  ui.gasBtns.forEach((b, i) => b.setAttribute("aria-pressed", String(i === gas)));
  ui.ignBtns.forEach((b, i) => b.setAttribute("aria-pressed", String(i === ign)));
  if (!sliding.hole) ui.hole.value = String(hole);
  if (!sliding.size) ui.size.value = String(size);
  ui.holeOut.textContent = hole === 0 ? "sealed" : hole + " mm";
  ui.sizeOut.textContent = ((G3.VA * size) / 100).toFixed(1) + " L";
  const cur = res ? [at(res.PA, simT) - 1, at(res.PB, simT) - 1] : [0, 0], pk = res ? peaksSoFar() : [0, 0];
  for (let i = 0; i < 2; i++) {
    ui.fill[i].style.width = pos(playing ? cur[i] : pk[i]);
    ui.fill[i].dataset.state = pk[i] >= letGo() ? "bad" : pk[i] > tested() ? "warn" : "ok";
    ui.out[i].textContent = res ? b1(playing ? cur[i] : pk[i]) : "0 bar";
    ui.test[i].style.left = pos(tested()); ui.burstM[i].style.left = pos(letGo());
  }
  ui.slow.setAttribute("aria-pressed", String(slow));
  ui.tour.setAttribute("aria-pressed", String(touring));
}
function peaksSoFar() { if (!res) return [0, 0]; if (!playing && failed < 0) return [res.peakA, res.peakB]; let a = 0, b = 0; const n = Math.min(res.T.length, Math.floor(simT / 0.1) + 1); for (let i = 0; i < n; i++) { if (res.PA[i] > a) a = res.PA[i]; if (res.PB[i] > b) b = res.PB[i]; } return [Math.max(0, a - 1), Math.max(0, b - 1)]; }

// ---------------- the shot ----------------
function fire() {
  if (booming()) return;
  const B = geoB(), I = ignGeo(B), g = GASES[gas];
  res = simulate({ er: g.er, sf: g.sf, d: hole, VA: G3.VA, VB: (G3.VA * size) / 100, first: I.first, arr: I.arr });
  res.I = I; res.tFail = null; res.who = -1;
  for (let i = 0; i < res.T.length; i++) { if (res.PA[i] - 1 >= letGo()) { res.tFail = res.T[i]; res.who = 0; break; } if (res.PB[i] - 1 >= letGo()) { res.tFail = res.T[i]; res.who = 1; break; } }
  if (res.jetAt !== null) { const s2 = res.C[1 - res.first], w = Math.max(3, 2.2 * s2.tb); segs = [{ d: 2.2, a: 0, b: res.jetAt }, { d: 1.9, a: res.jetAt, b: Math.min(res.tEnd, res.jetAt + w) }, { d: 1.1, a: Math.min(res.tEnd, res.jetAt + w), b: res.tEnd }]; }
  else segs = [{ d: 3.2, a: 0, b: res.tEnd }];
  playT = 0; simT = 0; playing = true; failed = -1; shown = true; fx = [];
}
function verdictText() {
  const r = REF[gas], n2 = NAMES[1 - res.first], pk2 = res.first === 0 ? res.peakB : res.peakA;
  if (res.jetAt === null) return hole === 0 ? "Sealed. The main compartment peaked at " + b1(res.peakA) + " and the second one never knew about it."
    : "The gas squeezed through but the flame didn't follow: in this toy a " + hole + " mm opening is fine enough to stop it. The " + n2 + " compartment was pumped up to " + b1(pk2) + ", unlit.";
  if (pk2 <= 1.2 * r) return "Held. " + b1(pk2) + " in the " + n2 + " compartment: about what one box makes on its own (" + b1(r) + "). No real piling.";
  if (pk2 <= tested()) return "Held, but that was pressure piling: " + b1(pk2) + " in the " + n2 + " compartment against " + b1(r) + " for one box on its own. Still inside the " + b1(tested()) + " it was tested to.";
  return "Held, just. " + b1(pk2) + " in the " + n2 + " compartment is past the " + b1(tested()) + " this box was ever tested to. Next time it might not.";
}
function step(dt) {
  if (!playing) return;
  playT += dt * (slow ? 0.3 : 1);
  simT = simAt(playT);
  const n1 = NAMES[res.first], n2 = NAMES[1 - res.first];
  if (res.tFail !== null && simT >= res.tFail) {
    simT = res.tFail; playing = false; failed = res.who; boomAt = now;
    const pk = failed === 0 ? res.peakA : res.peakB;
    say("Boom. Pressure piling: the " + NAMES[failed] + " compartment was heading for " + b1(pk) + ", " + (pk / REF[gas]).toFixed(1) + " times what one box makes on its own. The cover let go at " + b1(letGo()) + " and the flame is out in the zone.");
    return;
  }
  if (playT >= playDur()) { playing = false; simT = res.tEnd; say(verdictText()); return; }
  if (res.jetAt !== null && simT >= res.jetAt) say(res.pJet < 0.5 ? "The flame is through the opening, but the gas on the other side has hardly been squeezed yet (" + b1(res.pJet) + "). It burns fast, from close to atmospheric."
    : "The flame is through the opening, into gas already squeezed to " + b1(res.pJet) + " and churned up by the jet. It burns in a few milliseconds.");
  else if (hole === 0) say("Flame is spreading through the main compartment. The opening is sealed, so the pressure stays where it is.");
  else say("Flame is spreading through the " + n1 + " compartment. The rising pressure pushes unburnt gas through the opening and packs it into the " + n2 + " one.");
}
function chaos() { if (boomAt === null) return { c: -1, back: 0 }; const c = now - boomAt; if (c > BOOM_END) return { c: -1, back: 0 }; return { c, back: 1 - sm(3.2, 4.1, c) }; }

// ---------------- drawing ----------------
const CAST = "#7d8a94", CAST2 = "#93a0aa", SH = { mat: "paint", shell: true, bevel: 0.3 };
const tipM = (piv, ang, axis) => { const c = Math.cos(ang), s = Math.sin(ang), R = axis === "x" ? [1, 0, 0, 0, c, -s, 0, s, c] : [c, 0, s, 0, 1, 0, -s, 0, c]; return [...R, ...[0, 1, 2].map((i) => piv[i] - (R[i * 3] * piv[0] + R[i * 3 + 1] * piv[1] + R[i * 3 + 2] * piv[2]))]; };
function bodyParts(O, w, lugs, xm, xp) {
  // x-ray is a cutaway: the front wall comes off, the walls either side of the opening turn to glass, the back stays cast iron
  const o = [], S0 = { mat: "paint", bevel: 0.3 }, wall = (how) => (how === "glass" ? SH : how === "hide" ? { ...S0, xhide: true } : S0);
  if (lugs) for (const [x, y] of [[O.x0 + 12, O.y0 - 6], [O.x1 - 12, O.y0 - 6], [O.x0 + 12, O.y1 + 6], [O.x1 - 12, O.y1 + 6]]) o.push(prism(rrect(x - 7, x + 7, y - 7, y + 7, 3), "z", 0, 4, CAST, { mat: "paint" }), cyl(x, y, 2.6, 4, 5.4, "#c9ced3", 6, { mat: "steel" }));
  o.push(box(O.x0 + 2, O.x1 - 2, O.y0 + 2, O.y1 - 2, 0, O.z0, "#5f6872", { mat: "paint", bevel: 0.3 }), box(O.x0, O.x1, O.y0, O.y1, O.z0, O.z0 + w, CAST, S0));
  o.push(box(O.x0, O.x1, O.y0, O.y0 + w, O.z0 + w, O.z1, CAST, S0), box(O.x0 + w, O.x1 - w, O.y1 - w, O.y1, O.z0 + w, O.z1, CAST, wall("hide")), box(O.x0, O.x0 + w, O.y0 + w, O.y1, O.z0 + w, O.z1, CAST, wall(xm)), box(O.x1 - w, O.x1, O.y0 + w, O.y1, O.z0 + w, O.z1, CAST, wall(xp)));
  return o;
}
function lidParts(O, s, fly) {
  const o = [], t = 7 * Math.max(0.6, s), ov = 3 * Math.max(0.6, s), cx = (O.x0 + O.x1) / 2, cy = (O.y0 + O.y1) / 2, L = O.x1 - O.x0, Wd = O.y1 - O.y0, X = fly ? {} : { xhide: true };
  o.push(prism(rrect(O.x0 - ov, O.x1 + ov, O.y0 - ov, O.y1 + ov, 3), "z", O.z1, O.z1 + t, CAST2, { mat: "paint", ...X }), prism(rrect(O.x0 + L * 0.14, O.x1 - L * 0.14, O.y0 + Wd * 0.16, O.y1 - Wd * 0.16, 2), "z", O.z1 + t, O.z1 + t + 1.6 * s, CAST2, { mat: "paint", ...X }));
  const nb = Math.max(2, Math.round(L / 30)), br = 2.6 * Math.max(0.65, s);
  for (let i = 0; i <= nb; i++) for (const y of [O.y0 + br + 0.5, O.y1 - br - 0.5]) o.push(cyl(O.x0 + br + 0.5 + ((L - 2 * br - 1) * i) / nb, y, br, O.z1 + t, O.z1 + t + 2.4 * s, "#c9ced3", 6, { mat: "steel", ...X }));
  for (const x of [O.x0 + br + 0.5, O.x1 - br - 0.5]) o.push(cyl(x, cy, br, O.z1 + t, O.z1 + t + 2.4 * s, "#c9ced3", 6, { mat: "steel", ...X }));
  // pressure transducer screwed into the cover
  o.push(cyl(cx, cy, 3.2 * Math.max(0.7, s), O.z1 + t + 1.6 * s, O.z1 + t + 5, "#c9a24a", 6, { mat: "metal", ...X }), cyl(cx, cy, 2.2 * Math.max(0.7, s), O.z1 + t + 5, O.z1 + t + 13, "#2f3338", 14, { mat: "plastic", ...X }));
  return o;
}
function mainParts() {
  const o = bodyParts(AO, G3.WALL, true, "solid", "glass"), f = CA.z0;
  // the gear inside: a contactor at the far end, a terminal strip by the opening
  o.push(box(CA.x0 + 3, CA.x1 - 3, CA.y0 + 3, CA.y1 - 3, f, f + 1, "#d5d9dd", { mat: "satin", bevel: 0 }));
  o.push(box(CA.x0 + 5, CA.x0 + 21, -16, 2, f + 1, f + 15, "#e6dcc3", { mat: "plastic", bevel: 0.5 }), box(CA.x0 + 5, CA.x0 + 21, -16, 2, f + 13, f + 16, "#3a3e44", { mat: "plastic", bevel: 0.5 }), box(CA.x0 + 5, CA.x0 + 17, 8, 22, f + 1, f + 11, "#4f565e", { mat: "paint", bevel: 0.5 }), box(CA.x0 + 6.4, CA.x0 + 15.6, 9.4, 20.6, f + 3.4, f + 8.6, "#c0703a", { mat: "satin", bevel: 0.8 }));
  for (let i = 0; i < 6; i++) o.push(box(CA.x1 - 16, CA.x1 - 6, -15 + i * 5, -10.6 + i * 5, f + 1, f + 8, "#e6dcc3", { mat: "plastic", bevel: 0.3 }), cyl(CA.x1 - 11, -12.8 + i * 5, 1, f + 8, f + 8.4, "#d8dce0", 8, { mat: "steel" }));
  o.push(box(-60, -20, AO.y1, AO.y1 + 0.5, 34, 50, "#e9e6df", { mat: "matte", bevel: 0, xhide: true }));
  return o;
}
function secondParts(B) {
  const o = bodyParts(B.O, B.w, false, "glass", "hide"), f = B.C.z0, cx = (B.C.x0 + B.C.x1) / 2;
  for (let i = 0; i < 4; i++) o.push(box(cx - 9 * B.s + i * 4.6 * B.s, cx - 9 * B.s + (i * 4.6 + 4) * B.s, -7 * B.s, 7 * B.s, f, f + 7 * B.s, "#e6dcc3", { mat: "plastic", bevel: 0.3 }));
  // the opening between them: a nipple with its bore, or a sealed bushing
  const r = hole === 0 ? 4 : B.rh, xa = AO.x1 - G3.WALL, xb = B.O.x0 + B.w;
  o.push(tube([[AO.x1, 0, B.zc], [B.O.x0, 0, B.zc]], r + 2.6, "#c9a24a", { seg: 20, mat: "metal", shell: true }), prism(circle(0, B.zc, r + 4.4, 6), "x", AO.x1, AO.x1 + 2.6, "#c9a24a", { mat: "metal", shell: true }), prism(circle(0, B.zc, r + 4.4, 6), "x", B.O.x0 - 2.6, B.O.x0, "#c9a24a", { mat: "metal", shell: true }));
  if (hole === 0) o.push(tube([[xa, 0, B.zc], [xb, 0, B.zc]], 4, "#b0603a", { seg: 18, mat: "matte" }));
  else o.push(tube([[xa - 0.05, 0, B.zc], [xb + 0.05, 0, B.zc]], r, "#101316", { seg: 20, mat: "matte", opacity: 0.55 }));
  return o;
}
// the part of a compartment the flame has reached: a ball from the ignition point, clipped to the walls
function flameBox(c, p, R, col, lvl, op) {
  const x0 = Math.max(c.x0, p[0] - R), x1 = Math.min(c.x1, p[0] + R), y0 = Math.max(c.y0, p[1] - R), y1 = Math.min(c.y1, p[1] + R), z0 = Math.max(c.z0, p[2] - R), z1 = Math.min(c.z1, p[2] + R);
  if (x1 - x0 < 0.4 || y1 - y0 < 0.4 || z1 - z0 < 0.4) return [];
  return [prism(rrect(x0, x1, y0, y1, Math.max(0.1, Math.min(R * 0.55, (x1 - x0) / 2 - 0.05, (y1 - y0) / 2 - 0.05))), "z", z0, z1, col, { flat: true, bevel: 0, emit: [col, lvl], emitK: 1, opacity: op })];
}
const hash4 = (i) => { const h = (n2) => { const s = Math.sin(i * 12.9898 + n2 * 78.233) * 43758.5453; return s - Math.floor(s); }; return [h(1), h(2), h(3), h(4)]; };
const FOG = Array.from({ length: 18 }, (_, i) => hash4(i));
const scope = { a: q("#sc-a"), b: q("#sc-b"), cur: q("#sc-cur"), tst: q("#sc-test"), brs: q("#sc-burst"), ref: q("#sc-ref"), tT: q("#sc-test-t"), tB: q("#sc-burst-t"), tR: q("#sc-ref-t"), tx: q("#sc-tmax") };
const SX0 = 26, SX1 = 284, SY0 = 12, SY1 = 128;
function drawScope() {
  const top = Math.max(letGo() * 1.25, res && res.tFail === null ? Math.max(res.peakA, res.peakB) * 1.08 : 0), y = (v) => (SY1 - (clamp(v / top, 0, 1)) * (SY1 - SY0)).toFixed(1), tEnd = res ? res.tEnd : 100, x = (t) => (SX0 + (t / tEnd) * (SX1 - SX0)).toFixed(1);
  for (const [el, tx, v] of [[scope.tst, scope.tT, tested()], [scope.brs, scope.tB, letGo()], [scope.ref, scope.tR, REF[gas]]]) { el.setAttribute("y1", y(v)); el.setAttribute("y2", y(v)); tx.setAttribute("y", (+y(v) - 2.5).toFixed(1)); }
  scope.tx.textContent = Math.round(tEnd) + " ms";
  let da = "", db = "";
  if (res && shown) { const n = Math.min(res.T.length, Math.floor(simT / 0.1) + 1), st = Math.max(1, Math.floor(n / 500)); for (let i = 0; i < n; i += st) { const c = i ? "L" : "M"; da += c + x(res.T[i]) + " " + y(res.PA[i] - 1); db += c + x(res.T[i]) + " " + y(res.PB[i] - 1); } const i = n - 1; if (i > 0) { da += "L" + x(res.T[i]) + " " + y(res.PA[i] - 1); db += "L" + x(res.T[i]) + " " + y(res.PB[i] - 1); } }
  scope.a.setAttribute("d", da); scope.b.setAttribute("d", db);
  const cx = res && shown ? x(Math.min(simT, tEnd)) : String(SX0); scope.cur.setAttribute("x1", cx); scope.cur.setAttribute("x2", cx); scope.cur.style.opacity = playing ? "1" : "0";
}
let fx = [];
function draw(dt = 0) {
  const K = chaos(), B = geoB(), I = ignGeo(B), g = GASES[gas], PL = D.PLATE, sKey = Math.round(B.s * 1000);
  const lidM = (O) => { const c = K.c, cl = Math.min(c, 0.95), cx = (O.x0 + O.x1) / 2, m = tipM([cx, 0, O.z1 + 4], 7.5 * cl * K.back, "x"); m[10] += 120 * cl * K.back; m[9] += 30 * cl * K.back; m[11] += Math.max(-O.z1 + 2, (330 * cl - 345 * cl * cl)) * K.back; return m; };
  const objs = [{ cache: "main", rev: 0, parts: mainParts }, { cache: K.c >= 0 && failed === 0 ? "lidAf" : "lidA", rev: 0, m: K.c >= 0 && failed === 0 ? lidM(AO) : undefined, parts: () => lidParts(AO, 1, K.c >= 0 && failed === 0) },
    { cache: "second", rev: sKey * 100 + hole, parts: () => secondParts(B) }, { cache: K.c >= 0 && failed === 1 ? "lidBf" : "lidB", rev: sKey, m: K.c >= 0 && failed === 1 ? lidM(B.O) : undefined, parts: () => lidParts(B.O, B.s, K.c >= 0 && failed === 1) }];
  // flame and hot gas inside, from the shot being replayed
  const live = [], sparks = [], cav = [CA, B.C], holeP = [[CA.x1, 0, B.zc], [B.C.x0, 0, B.zc]];
  let pNow = [0, 0], flow = 0, jetOn = false;
  if (res && shown && K.c < 0.25) {
    pNow = [at(res.PA, simT) - 1, at(res.PB, simT) - 1]; flow = pNow[0] - pNow[1];
    for (let i = 0; i < 2; i++) {
      const c = res.C[i]; if (!c.lit || simT < c.t0) continue;
      const u = clamp((simT - c.t0) / c.tb, 0, 1.0001), p0 = i === res.first ? res.I.p : holeP[i], R = (i === res.first ? res.I.R : Math.hypot(cav[i].x1 - cav[i].x0, (cav[i].y1 - cav[i].y0) / 2, cav[i].z1 - cav[i].z0)) * u;
      const heat = clamp(pNow[i] / Math.max(1, i === 0 ? res.peakA : res.peakB), 0.15, 1), burning = u < 1;
      live.push(...flameBox(cav[i], p0, R, burning ? "#ff8a2a" : "#e8622a", (burning ? 0.05 : 0.022) * (0.35 + 0.65 * heat), burning ? 0.34 : 0.26));
      if (burning) for (let j = 0; j < 12; j++) { const a = rn() * TAU, zz = rn() * 2 - 1, rr = Math.sqrt(1 - zz * zz), c = cav[i], fp = [clamp(p0[0] + R * rr * Math.cos(a), c.x0 + 1, c.x1 - 1), clamp(p0[1] + R * rr * Math.sin(a), c.y0 + 1, c.y1 - 1), clamp(p0[2] + R * zz, c.z0 + 1, c.z1 - 1)]; sparks.push([fp, (3 + 5 * rn()) * (i === 1 ? Math.max(0.5, B.s) : 1)]); }
      if (burning) live.push(...flameBox(cav[i], p0, R * 0.6, "#ffc04a", 0.07, 0.22));
    }
    jetOn = res.jetAt !== null && simT >= res.jetAt && simT < res.jetAt + res.C[1 - res.first].tb * 1.2;
  }
  if (live.length) objs.push({ parts: live });
  let svg = E.render(objs);
  for (const [fp, r] of sparks) E.sprite(fp, r, rn() < 0.3 ? "#fff0b8" : "#ff9a2e", 0.5, true, 2);
  // the spark that starts it
  if (K.c < 0) { const sp = res && shown ? burst(playT, 0.02, 0.25) : 0.35 + 0.25 * Math.sin(now * 5); E.sprite(I.p, 1.6 + 2.6 * sp, "#ffffff", Math.min(1, 0.5 + sp), true, 1); E.sprite(I.p, 5 + 6 * sp, "#8fb4ff", 0.35 + 0.4 * sp, true, 1); }
  // unburnt gas packed into the downstream compartment shows as thickening fog
  if (res && shown && K.c < 0 && hole > 0) { const dn = 1 - res.first, mu = dn === 1 ? at(res.MB, simT) : 1, c = cav[dn], lit = res.C[dn].lit && simT >= res.C[dn].t0, k2 = lit ? 0 : clamp((mu - 1) / 2.5, 0, 1); if (k2 > 0.02) for (const [a, b, cc, d] of FOG) E.sprite([c.x0 + a * (c.x1 - c.x0), c.y0 + b * (c.y1 - c.y0), c.z0 + cc * (c.z1 - c.z0)], (5 + 5 * d) * Math.max(0.6, B.s), lightTheme ? "#1f8f7f" : "#35c9a8", (lightTheme ? 0.3 : 0.2) * k2, !lightTheme); }
  // what's going through the opening
  if (dt > 0 && playing && hole > 0 && Math.abs(flow) > 0.03) {
    const dir = flow > 0 ? 1 : -1, up = flow > 0 ? 0 : 1, hot = res.C[up].lit && simT >= res.C[up].tArr, x0 = dir > 0 ? CA.x1 - 3 : B.C.x0 + 3, n = Math.min(4, 1 + Math.round(Math.abs(flow) * 1.5));
    for (let j = 0; j < n; j++) fx.push({ k: hot ? "jet" : "gas", p: [x0, (rn() - 0.5) * B.rh, B.zc + (rn() - 0.5) * B.rh], v: [dir * (90 + rn() * 80), (rn() - 0.5) * (hot ? 50 : 26), (rn() - 0.5) * (hot ? 50 : 26)], life: 0, max: hot ? 0.22 + rn() * 0.2 : 0.3 + rn() * 0.25, s: hot ? 0.5 + B.rh * 0.12 : 0.6 });
  }
  if (jetOn) { const dn = 1 - res.first, hp = holeP[dn]; E.sprite(hp, 5 + B.rh, "#fff0c8", 0.8, true, 1); }
  // the cover lets go
  if (K.c >= 0) {
    const O = failed === 0 ? AO : B.O, c = K.c, life = Math.exp(-c / 0.5), Rr = 16 + 64 * (1 - Math.exp(-c / 0.2)), C = [(O.x0 + O.x1) / 2, 0, O.z1 + 6 + 30 * c];
    if (life > 0.02) { E.sprite(C, Rr * 0.8, "#ffb04a", 0.5 * life, true, 1); E.sprite(C, Rr * 0.35, "#fff0c8", 0.6 * life, true, 1); }
    if (dt > 0 && c < 1.0) for (let j = 0; j < 8; j++) fx.push({ k: "flame", p: [PL.x + 10 + rn() * (PL.w - 20), PL.y + 8 + rn() * (PL.d - 16), 8 + rn() * 70], v: [(rn() - 0.5) * 130, (rn() - 0.5) * 130, 40 + rn() * 120], life: 0, max: 0.45 + rn() * 0.6, s: 1.7 + rn() });
    if (dt > 0 && c < 0.5) for (let j = 0; j < 5; j++) fx.push({ k: "flame", p: [O.x0 + rn() * (O.x1 - O.x0), O.y0 + rn() * (O.y1 - O.y0), O.z1], v: [(rn() - 0.5) * 160, (rn() - 0.5) * 160, 120 + rn() * 160], life: 0, max: 0.3 + rn() * 0.4, s: 1.2 });
    if (dt > 0 && c >= 0.3 && c < 2.8 && rn() < dt * 40) fx.push({ k: "smoke", p: [(rn() - 0.5) * 200, (rn() - 0.5) * 90, 30 + rn() * 50], v: [(rn() - 0.5) * 20, (rn() - 0.5) * 20, 30 + rn() * 40], life: 0, max: 2 + rn() * 2, s: 1.5 });
  }
  fx = fx.filter((p) => {
    p.life += dt; if (p.life > p.max) return false;
    const t = p.life / p.max;
    if (p.k === "flame") { p.v[0] *= 0.93; p.v[1] *= 0.93; }
    if (p.k === "jet" || p.k === "gas") { p.v[0] *= 0.9; }
    for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * dt;
    if (p.k === "flame") E.sprite(p.p, (5 + 15 * t) * p.s, t < 0.25 ? "#fff0b8" : t < 0.6 ? "#ff9a2e" : "#d8481a", 0.8 * (1 - t * t), true, 2);
    else if (p.k === "jet") E.sprite(p.p, (2.5 + 7 * t) * p.s, t < 0.35 ? "#fff0b8" : "#ff9a2e", 0.85 * (1 - t), true, 2);
    else if (p.k === "gas") E.sprite(p.p, 1.6 + 2.4 * t, lightTheme ? "#1f8f7f" : "#9ff0dc", 0.6 * (1 - t), !lightTheme);
    else E.sprite(p.p, (12 + 40 * t) * p.s, lightTheme ? "#4a4744" : "#2e2c2b", 0.45 * (1 - t));
    return true;
  });
  // lettering and the two pressures
  let m = E.faceMatrix([PL.x + PL.w - 44, PL.y + PL.d - 13, 0.05], [1, 0, 0], [0, 1, 0]);
  if (m) svg += '<g transform="' + m + '"><text class="pt bench" x="0" y="5" font-size="5">ZONE 1</text></g>';
  if (K.c < 0) {
    m = E.faceMatrix([-60, AO.y1 + 0.55, 50], [1, 0, 0], [0, 0, -1]);
    if (m && E.xray < 0.5) svg += '<g transform="' + m + '" opacity="' + (1 - 2 * E.xray).toFixed(2) + '"><text class="pt" x="2.4" y="6.6" font-size="4.6">Ex db</text><path class="pl" d="M2.4 9.6h34M2.4 12.4h34"/></g>';
    const pk = peaksSoFar(), tops = [[(AO.x0 + AO.x1) / 2, 0, AO.z1 + 34], [(B.O.x0 + B.O.x1) / 2, 0, B.O.z1 + 30]], vols = [G3.VA, (G3.VA * size) / 100];
    for (let i = 0; i < 2; i++) { const p = E.project(tops[i]), v = playing ? pNow[i] : pk[i], st = pk[i] >= letGo() ? "bad" : pk[i] > tested() ? "warn" : "ok";
      svg += '<text class="mk-lab nm" text-anchor="middle" x="' + p[0].toFixed(1) + '" y="' + (p[1] - 17).toFixed(1) + '">' + NAMES[i].toUpperCase() + " · " + (Number.isInteger(vols[i]) ? vols[i] : vols[i].toFixed(1)) + ' L</text><text class="mk-lab pv" data-s="' + (res && shown ? st : "idle") + '" text-anchor="middle" x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '">' + (res && shown ? (playing ? "" : "peak ") + b1(v) : "0 bar") + "</text>"; }
  }
  if (E.xray > 0.02 && K.c < 0 && !playing) svg += E.callouts([
    { p: I.p, text: "Ignition", sub: "where the spark is" }, { p: [(AO.x1 + B.O.x0) / 2, 0, B.zc + (hole === 0 ? 4 : B.rh) + 2.6], text: hole === 0 ? "Sealed bushing" : hole + " mm opening", sub: hole === 0 ? "nothing gets through" : "joins the two compartments" },
  ], E.xray, E.fs < 0.62 ? {} : { topL: 70, topR: 70 });
  if (sceneG.innerHTML !== svg) sceneG.innerHTML = svg;
  drawScope();
  if (K.c >= 0) { const A = 7 * Math.exp(-K.c / 0.35); setShake(A * Math.sin(K.c * 90), A * Math.cos(K.c * 71)); flashEl.style.opacity = (0.8 * burst(K.c, 0.03, 0.22)).toFixed(3); }
  else if (boomAt !== null) { boomAt = null; failed = -1; res = null; shown = false; simT = 0; setShake(0, 0); flashEl.style.opacity = "0"; say("Reset. Seal the opening, or make it harder for the first compartment to pump up the second."); }
  const text = K.c >= 0 ? (K.c < 3.2 ? "BOOM · the " + NAMES[Math.max(0, failed)] + " cover let go" : "resetting…")
    : playing ? "t " + simT.toFixed(1) + " ms · main " + b1(pNow[0]) + " · second " + b1(pNow[1])
    : res && shown ? "main peak " + b1(res.peakA) + " · second peak " + b1(res.peakB) + (res.rise !== null ? " · rise " + res.rise.toFixed(1) + " ms" : "") + " · tested to " + b1(tested())
    : g.id + " · " + (hole === 0 ? "sealed" : hole + " mm opening") + " · one box alone makes " + b1(REF[gas]) + " · tested to " + b1(tested());
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuetext", text);
}

// ---------------- running it ----------------
const TOUR = [
  { gas: 0, hole: 0, size: 15, ign: 0 },
  { gas: 0, hole: 12, size: 100, ign: 1 },
  { gas: 0, hole: 12, size: 15, ign: 2 },
  { gas: 0, hole: 6, size: 30, ign: 0 },
  { gas: 0, hole: 14, size: 15, ign: 0 },
];
function tick(t) {
  const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
  last = t; now += dt;
  if (touring && !booming() && !playing) {
    tourWait -= dt;
    if (tourWait <= 0) {
      if (tourStep < 0 || tourFired) { tourStep = (tourStep + 1) % TOUR.length; const s = TOUR[tourStep]; gas = s.gas; hole = s.hole; size = s.size; ign = s.ign; res = null; shown = false; tourFired = false; tourWait = 1.5; say("Next: " + (hole === 0 ? "the opening sealed" : "a " + hole + " mm opening") + ", a " + ((G3.VA * size) / 100).toFixed(1) + " L second compartment, ignition " + ["at the far end of the main one" , "right by the opening", "in the second compartment"][ign] + "."); }
      else { fire(); tourFired = true; tourWait = 3.2; }
    }
  }
  step(dt);
  draw(dt); syncUi();
  frame = visible ? requestAnimationFrame(tick) : 0;
}
let tourFired = false;
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { touring = false; };
const guard = (fn) => (...a) => { takeOver(); if (booming()) return; playing = false; fn(...a); res = null; shown = false; fx = []; say("Set. Hit FIRE."); run(); };
const setGas = guard((i) => { gas = (i + GASES.length) % GASES.length; });
const setHole = guard((v) => { hole = clamp(Math.round(v), 0, 40); });
const setSize = guard((v) => { size = clamp(Math.round(v / 5) * 5, 10, 100); });
const setIgn = guard((i) => { ign = (i + 3) % 3; });
const shoot = () => { takeOver(); if (booming() || playing) return; fire(); run(); };
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
for (const [key, el, fn] of [["hole", ui.hole, setHole], ["size", ui.size, setSize]]) {
  el.addEventListener("input", () => { sliding[key] = true; fn(+el.value); });
  el.addEventListener("change", () => { sliding[key] = false; run(); });
}
ui.gasBtns.forEach((b, i) => b.addEventListener("click", () => setGas(i)));
ui.ignBtns.forEach((b, i) => b.addEventListener("click", () => setIgn(i)));
ui.fire.addEventListener("click", shoot);
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; tourWait = 0; tourFired = false; if (!playing && !booming()) { res = null; shown = false; } } run(); });
onTap(shoot);
stage.addEventListener("keydown", (ev) => {
  const map = { x: () => { setX(!E.xrayOn); run(); }, X: () => { setX(!E.xrayOn); run(); }, ArrowRight: () => setHole(hole + 1), ArrowLeft: () => setHole(hole - 1), ArrowUp: () => setSize(size + 5), ArrowDown: () => setSize(size - 5), g: () => setGas(gas + 1), i: () => setIgn(ign + 1), " ": shoot, Enter: shoot, s: () => { slow = !slow; run(); } };
  if (map[ev.key]) { ev.preventDefault(); map[ev.key](); }
});
window.__fig = { E, freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; }, fire: shoot, set: (o) => { takeOver(); if (o.gas !== undefined) gas = o.gas; if (o.hole !== undefined) hole = o.hole; if (o.size !== undefined) size = o.size; if (o.ign !== undefined) ign = o.ign; res = null; shown = false; } };
setX(true); say("Two flameproof compartments and an opening between them. Hit FIRE."); syncUi(); draw();

`;

const CSS = `.fx-flash{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(circle 70% at 50% 45%,#fff8e8 0%,#ffd9a0 40%,rgba(255,170,90,0) 100%)}
.pt{font-family:var(--anatomy-mono);fill:#23262b;font-weight:700}.pt.bench{fill:var(--anatomy-muted);font-weight:600;letter-spacing:.08em;opacity:.8}.pl{fill:none;stroke:#8a8f96;stroke-width:.5}
.nm{font-weight:500;font-size:calc(10px*var(--mk-ts,1));fill:var(--anatomy-muted)}.pv{font-size:calc(14px*var(--mk-ts,1))}.pv[data-s="idle"]{fill:var(--anatomy-muted)}.pv[data-s="warn"]{fill:var(--mk-warn)}.pv[data-s="bad"]{fill:var(--mk-danger)}
@media (min-width:561px){.mk-hint{top:46px}}
.scope{width:290px;height:150px;top:40px;left:14px}.scope svg{display:block;width:100%;height:100%}
.scope .ax{fill:none;stroke:var(--anatomy-mid);stroke-width:1}.scope .g{stroke-width:1;stroke-dasharray:4 3}.scope .g.r{stroke:var(--anatomy-mid)}.scope .g.t{stroke:var(--mk-warn)}.scope .g.b{stroke:var(--mk-danger)}
.scope .st{font:8.5px var(--anatomy-mono);fill:var(--anatomy-muted)}.scope .st.t{fill:var(--mk-warn)}.scope .st.b{fill:var(--mk-danger)}
.scope .tr{fill:none;stroke-width:1.8;stroke-linejoin:round}.scope .tr.a{stroke:var(--mk-accent)}.scope .tr.b{stroke:#ff9a52}.scope .cur{stroke:var(--anatomy-strong);stroke-width:.7;opacity:0}
.scope .la{fill:var(--mk-accent)}.scope .lb{fill:#ff9a52}
body[data-theme="light"] .scope .tr.b{stroke:#d2581c}body[data-theme="light"] .scope .lb{fill:#d2581c}
@media (max-width:560px){.scope{width:54%;height:auto;aspect-ratio:290/150;top:auto;bottom:10px;left:10px}}
.ctl #fire{padding:7px 18px;font-weight:600;letter-spacing:.06em}
.meter{margin-top:12px}.mark.tst{border-left-style:dashed;border-left-color:var(--mk-warn)}.mark.tst::after{color:var(--mk-warn);left:auto;right:-2px}`;

const stage = stageHtml({
  W, H, fig: "Fig 26", title: "Pressure piling", xray: true,
  label: "Two flameproof compartments on a bench, a large main one and a smaller second one, joined by an opening. A spark lights the gas in one. An x-ray view turns the castings to glass to show the flame spreading, unburnt gas being pushed through the opening, and the flame following it. A scope trace and two readings show the pressure in each compartment against what the enclosure was tested to.",
  keysHelp: "Pressure piling: drag to rotate, X for x-ray, tap or space fires; left and right change the opening, up and down the second compartment, G the gas, I the ignition point, S slow motion",
  extra: `<div class="mk-inset scope" aria-hidden="true"><svg viewBox="0 0 290 150"><path class="ax" d="M26 12V128H284"/>
<line id="sc-ref" class="g r" x1="26" x2="284" y1="100" y2="100"/><line id="sc-test" class="g t" x1="26" x2="284" y1="70" y2="70"/><line id="sc-burst" class="g b" x1="26" x2="284" y1="50" y2="50"/>
<text id="sc-ref-t" class="st r" x="282" y="97" text-anchor="end">one box alone</text><text id="sc-test-t" class="st t" x="282" y="67" text-anchor="end">tested to</text><text id="sc-burst-t" class="st b" x="282" y="47" text-anchor="end">lets go</text>
<path id="sc-a" class="tr a" d=""/><path id="sc-b" class="tr b" d=""/><line id="sc-cur" class="cur" x1="26" x2="26" y1="12" y2="128"/>
<text class="st" x="26" y="141">0</text><text id="sc-tmax" class="st" x="284" y="141" text-anchor="end">100 ms</text><text class="st" x="8" y="15">bar</text>
<text class="st la" x="96" y="141">main</text><text class="st lb" x="150" y="141">second</text><path class="tr a" d="M78 138h14"/><path class="tr b" d="M132 138h14"/></svg></div><div class="fx-flash" aria-hidden="true"></div>`,
});

const CONTROLS = `<div class="ctl" role="group" aria-label="Test controls">
  <div class="ctl-row"><span class="ctl-label">Gas</span>${GASES.map((g, i) => `<button type="button" data-gas="${i}" aria-pressed="${i === START.gas}">${g.id}<small>${g.group}</small></button>`).join("")}</div>
  <div class="ctl-row"><span class="ctl-label">Ignition</span><button type="button" data-ign="0" aria-pressed="true">Far end</button><button type="button" data-ign="1" aria-pressed="false">By the opening</button><button type="button" data-ign="2" aria-pressed="false">Second box</button></div>
  <div class="ctl-row"><span class="ctl-label">Opening</span><div class="slide"><input id="hole" type="range" min="0" max="40" step="1" value="${START.hole}" aria-label="Opening between the compartments in millimetres, zero is sealed"></div><output id="hole-out"></output></div>
  <div class="ctl-row"><span class="ctl-label">Second box</span><div class="slide"><input id="size" type="range" min="10" max="100" step="5" value="${START.size}" aria-label="Size of the second compartment as a percentage of the main one"></div><output id="size-out"></output></div>
  <div class="ctl-row"><span class="ctl-label">Main</span><div class="meter" aria-hidden="true"><span id="ma-fill" class="fill"></span><span id="ma-test" class="mark tst" data-label="tested"></span><span id="ma-burst" class="mark" data-label="lets go"></span></div><output id="ma-out">0 bar</output></div>
  <div class="ctl-row"><span class="ctl-label">Second</span><div class="meter" aria-hidden="true"><span id="mb-fill" class="fill"></span><span id="mb-test" class="mark tst" data-label="tested"></span><span id="mb-burst" class="mark" data-label="lets go"></span></div><output id="mb-out">0 bar</output></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="fire" class="danger">FIRE</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
</div>`;

const foot = footHtml({
  theme, slug: "pressure-piling",
  real: "pressure piling as IEC 60079-1 defines it, the standard's tell-tales for it (results in a test series differing by a factor of 1.5 or more, or a pressure rise time under 5 ms: clause 15.2.2.4), and the overpressure type test at 1.5 times the reference pressure. A gas explosion in a closed box from atmospheric does make roughly 7 to 8 bar.",
  made: "the enclosure, the flame speeds, the flow through the opening, the pressure where the cover lets go, and a fine opening stopping the flame. It is a lumped two-volume model tuned to show the shape of the thing, and pressures are gauge.",
});
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), pageMk2({
  k, title: "Pressure piling", fig: "Fig 26", hint: "Tap: fire", theme, W, H, stage, controls: CONTROLS, css: CSS, foot,
  caption: "A flameproof enclosure is built to contain an explosion of gas that started at atmospheric pressure. Join two compartments with an opening and that stops being true. The explosion in the first compartment pushes unburnt gas through the opening and packs it into the second. When the flame follows, it lights a mixture that is already pressurised and churned up by the jet, and the peak scales with the pressure it started from. That is pressure piling. It is worst with a small compartment hanging off a big one, an opening that is neither tiny nor huge, and ignition far from the opening. The test lab looks for it: results that scatter by a factor of 1.5 or more, or a pressure rise faster than 5 ms. The usual fixes are to seal between compartments, or not to subdivide in the first place.",
  script: LIVE.replace("__DATA__", JSON.stringify(DATA)),
}));
console.log("wrote", name);
