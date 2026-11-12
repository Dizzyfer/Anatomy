import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { engineScript, stageHtml, pageMk2, footHtml } from "../../mk2/shell.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const W = 960, H = 640;

// Truth: T&PR valves (AS 1357.1) are set at a pressure (850 kPa here) and 99 °C. Water's boiling point rises with pressure
// (Antoine fit below). When a hot tank fails, the water above 100 °C flashes: the fraction that turns to steam is
// cp·(T − 100)/hfg, with cp 4.19 kJ/kg·K and hfg 2257 kJ/kg. A 250 L, 3.6 kW tank is typical.
// Toy: the thermal expansion pressure rise, the burst pressures, the time-lapse, and how high it flies.
const MODEL = {
  litres: 250, kw: 3.6, lapse: 3000, mains: 500, kexp: 5, set: 65, eco: 85, tpr: { p: 850, t: 99, tClose: 96 },
  burst: { fresh: 2400, corroded: 1100 }, cp: 4.19, hfg: 2257, start: 55,
};

const TK = { x: 0, y: -24, ro: 17, rf: 16.3, rt: 14, rw: 13.4, z0: 6, z1: 88 };
const WALL = { x: -92, y: -60, w: 184, d: 6, h: 136 };
const EAVE_Z = 136;
const TPR_A = 335, TPR_Z = 80, ELEM_Z = 20;
const PLATE = { x: -72, y: -64, w: 144, d: 112, r: 8 };
const P = k.fitProjection([...k.boxCorners(PLATE, -0.8, 0), [-62, -60, 144], [62, -60, 144], [62, 6, 144], [-62, 6, 144]], W, H, { pad: 20, azimuth: 45, elevation: 30 });
const DATA = { W, H, P, PLATE };
WALL.x = -62; WALL.w = 124;
Object.assign(DATA, { MODEL, TK, WALL, EAVE_Z, TPR_A, TPR_Z, ELEM_Z });
const LIVE = `
${engineScript()}
const D = __DATA__;
const stage = document.querySelector(".mk-stage");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lightTheme = document.body.dataset.theme === "light";
const E = mk2(stage, D.P, { W: D.W, H: D.H, pivot: [0, -20, 60], plate: { ...D.PLATE, h: 12, foot: 5 }, shadowBox: [-80, -70, -18, 80, 56, 150] });
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
// water: boiling point vs pressure (Antoine, kPa absolute)
const psat = (t) => Math.exp(16.3872 - 3885.7 / (t + 230.17));
const tsat = (pa) => 3885.7 / (16.3872 - Math.log(pa)) - 230.17;
const flashFrac = (t) => Math.max(0, (M.cp * (t - 100)) / M.hfg);

let stat = "ok", eco = "ok", tpr = "ok", tankKind = "fresh", power = true;
let T = M.start, Pg = M.mains, ecoTripped = false, heating = false, tprOpen = false, tprTemp = false, boiling = false, boomAt = null, boomF = 0;
let frame = 0, last = 0, now = 0, visible = false, touring = true, slow = false, tourClock = 0, tourStep = -1, nextAt = 0, lastShot = "", lastEvent = "", lastEventAt = -10;
const BOOM_END = 6;
const busy = () => boomAt !== null;
const event = (t) => { lastEvent = t; lastEventAt = now; };
function reset() { T = M.start; Pg = M.mains; ecoTripped = false; tprOpen = false; tprTemp = false; boiling = false; boomAt = null; lastEvent = ""; }

function step(dt) {
  if (busy()) return;
  const dTdt = (M.kw / (M.litres * M.cp)) * M.lapse; // °C per second of figure time
  // the controls
  const thermOn = stat === "stuck" || T < M.set - (heating ? 0 : 3);
  if (eco === "ok" && T >= M.eco && !ecoTripped) { ecoTripped = true; event("The over-temperature cutout tripped at " + M.eco + " °C and cut the element. It latches: someone has to reset it, and should ask why the thermostat let it get there."); }
  heating = power && thermOn && !ecoTripped;
  if (heating) T += dTdt * dt;
  else T += -(T - 20) * 0.0015 * dt;
  // pressure: water expands as it heats, in a closed tank, and the boiling point sets a floor once it's hot enough
  const closed = M.mains + M.kexp * (T - 20);
  let p = Math.max(closed, psat(T) - 101.3);
  tprOpen = false; boiling = false;
  const tprWorks = tpr !== "blocked";
  if (tprWorks && p >= M.tpr.p) { p = M.tpr.p; tprOpen = true; }
  // the temperature element: dumps hot water and lets cold in
  if (tpr === "ok" && (T >= M.tpr.t || (tprTemp && T > M.tpr.tClose))) {
    if (!tprTemp) event("The T&PR's temperature element opened at 99 °C. It's dumping hot water down the drain so cold mains water comes in. Wasteful, loud, and exactly right: the water never gets past 100 °C.");
    tprTemp = true; tprOpen = true; T -= 1.2 * dTdt * dt + 0.6 * dt;
  } else if (tprTemp && T <= M.tpr.tClose) tprTemp = false;
  // a pressure-only valve holds the pressure, so the water boils at that pressure's boiling point
  if (tprOpen && !tprTemp && T >= tsat(M.tpr.p + 101.3)) { boiling = true; T = tsat(M.tpr.p + 101.3); }
  Pg = p;
  const burstAt = M.burst[tankKind];
  if (Pg >= burstAt) blow();
}

function blow() {
  boomAt = now; boomF = flashFrac(T);
  const kg = Math.round(boomF * M.litres);
  event(boomF > 0.12 ? "BOOM. The tank let go at " + Math.round(Pg) + " kPa with the water at " + Math.round(T) + " °C. The moment the pressure went, " + kg + " kg of it flashed to steam at once, about 1600 times the volume, and that's what threw the tank through the roof."
    : boomF > 0.03 ? "The " + (tankKind === "corroded" ? "corroded " : "") + "tank split at " + Math.round(Pg) + " kPa. The water was at " + Math.round(T) + " °C, so " + kg + " kg flashed to steam and blew it apart."
    : "The tank split, but the water was under 100 °C, so nothing flashed. A flood and a mess, not a bomb.");
}
const ui = {
  stat: [...document.querySelectorAll("[data-stat]")], eco: [...document.querySelectorAll("[data-eco]")], tpr: [...document.querySelectorAll("[data-tpr]")], tank: [...document.querySelectorAll("[data-tank]")],
  tFill: document.querySelector("#t-fill"), tOut: document.querySelector("#t-out"), pFill: document.querySelector("#p-fill"), pOut: document.querySelector("#p-out"), burstMark: document.querySelector("#burst-mark"),
  stats: document.querySelector("#stats"), power: document.querySelector("#power"), reset: document.querySelector("#reset"), slow: document.querySelector("#slow"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"),
};
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };
// ---------------- the tank, the wall and the roof, in real 3D ----------------
const TAU = Math.PI * 2, rad = (d) => (d * Math.PI) / 180, TK = D.TK, WL = D.WALL, EZ = D.EAVE_Z;
const pol = (r, a) => [TK.x + r * Math.cos(rad(a)), TK.y + r * Math.sin(rad(a))];
const C0 = [TK.x, TK.y, 0], KEEP = { c: C0, a0: Math.PI / 2, a1: TAU, seg: 48 };
const flashEl = stage.querySelector(".fx-flash");
function houseStatic() {
  const o = [];
  // brick wall: courses and staggered joints
  o.push(box(WL.x, WL.x + WL.w, WL.y, WL.y + WL.d, 0, WL.h, "#a8573d", { mat: "matte" }));
  const yf = WL.y + WL.d;
  for (let z = 8, r = 0; z < WL.h; z += 8, r++) { o.push(box(WL.x, WL.x + WL.w, yf, yf + 0.12, z - 0.5, z + 0.5, "#cdbfae", { bevel: 0, mat: "matte" })); for (let x = WL.x + (r % 2 ? 8 : 16); x < WL.x + WL.w; x += 16) o.push(box(x - 0.5, x + 0.5, yf, yf + 0.12, z - 8, z, "#cdbfae", { bevel: 0, mat: "matte" })); }
  // the pad it stands on, the power point, and the tempering valve where the cold comes in
  o.push(prism(rrect(TK.x - 22, TK.x + 22, TK.y - 22, TK.y + 22, 2), "z", 0, TK.z0, "#9b968c", { mat: "concrete" }));
  o.push(box(30, 38, yf, yf + 1.4, 46, 56, "#eceae4", { mat: "plastic" }), box(32.5, 35.5, yf + 1.4, yf + 1.9, 49, 52, "#d0cdc6", { mat: "plastic", bevel: 0 }));
  o.push(tube([[34, yf + 1.5, 47], [34, yf + 3, 30], [pol(TK.ro, 345)[0] + 2, pol(TK.ro, 345)[1], 22]], 0.7, "#e8e6e0", { seg: 6, mat: "plastic" }));
  const ci = pol(TK.ro, 125);
  o.push(tube([[ci[0], ci[1], 16], [-30, ci[1] + 4, 16], [-30, yf, 16]], 1.5, "#b8703f", { seg: 8, mat: "copper" }), box(-34, -26, ci[1], ci[1] + 8, 12, 20, "#c9a24a", { mat: "metal" }));
  return o;
}
// the tank itself: thrown as one piece when it goes
function tankParts() {
  const o = [], zb = TK.z0, zt = TK.z1;
  o.push(lathe([[TK.rf, zb], [TK.ro, zb], [TK.ro, zt], [TK.rf, zt], [TK.rf, zb]], "#ebe8e1", { ...KEEP, closed: true, cap: "#f7f5f0", mat: "paint", shell: true }));
  o.push(lathe([[TK.rt, zb + 2], [TK.rf, zb + 2], [TK.rf, zt - 2], [TK.rt, zt - 2], [TK.rt, zb + 2]], "#e3c665", { ...KEEP, closed: true, mat: "matte", xhide: true }));
  o.push(lathe([[TK.rw, zb + 4], [TK.rt, zb + 4], [TK.rt, zt - 4], [TK.rw, zt - 4], [TK.rw, zb + 4]], tankKind === "corroded" ? "#8a5a3c" : "#7f8790", { ...KEEP, closed: true, cap: tankKind === "corroded" ? "#a06a42" : "#aab1b9", mat: "steel", xhide: true }));
  o.push(lathe([[0, zt], [TK.ro, zt], [TK.ro, zt + 2.2], [TK.ro - 1.5, zt + 3], [0, zt + 3]], "#ebe8e1", { ...KEEP, mat: "paint", shell: true }));
  // thermostat and cutout behind a cover low on the side, with the lamp
  const tc = pol(TK.ro, 345);
  o.push(box(tc[0] - 1, tc[0] + 2.2, tc[1] - 5, tc[1] + 5, 12, 28, "#d9d6cf", { mat: "plastic" }));
  // T&PR valve near the top, its drain line down the side and out
  const tv = pol(TK.ro + 2, D.TPR_A), tv2 = pol(TK.ro + 6, D.TPR_A);
  o.push(cyl(tv[0], tv[1], 2.4, D.TPR_Z - 3, D.TPR_Z + 4, "#c9a24a", 14, { mat: "metal" }), cyl(tv2[0], tv2[1], 1.6, D.TPR_Z - 6, D.TPR_Z - 1, "#c9a24a", 12, { mat: "metal" }), tube([[tv[0], tv[1], D.TPR_Z - 2], [tv2[0], tv2[1], D.TPR_Z - 3]], 1.3, "#c9a24a", { seg: 6, mat: "metal" }));
  o.push(tube([[tv2[0], tv2[1], D.TPR_Z - 6], [tv2[0], tv2[1], 4], [tv2[0] + 10, tv2[1], 4]], 1.1, "#b8703f", { seg: 8, mat: "copper" }));
  // hot out of the top and back into the wall, the anode hanging in the water
  o.push(tube([[TK.x - 5, TK.y - 5, zt + 2], [TK.x - 5, TK.y - 5, zt + 10], [TK.x - 5, WL.y + WL.d, zt + 10]], 1.5, "#b8703f", { seg: 8, mat: "copper" }));
  const an = pol(7, 45);
  o.push(tube([[an[0], an[1], zt - 5], [an[0], an[1], 36]], 0.9, "#9aa0a8", { seg: 6, mat: "matte" }));
  return o;
}
function eaveParts(x0, x1) {
  const y0 = WL.y, y1 = WL.y + 62;
  return [box(x0, x1, y0, y1, EZ, EZ + 2, "#d9d5cc", { mat: "paint" }), box(x0, x1, y1 - 1.5, y1, EZ - 5, EZ + 4, "#f1efe9", { mat: "paint" }), box(x0, x1, y0, y1, EZ + 2, EZ + 4.2, "#7a4a3a", { mat: "matte" }),
    ...Array.from({ length: 5 }, (_, i) => box(x0, x1, y0 + 8 + i * 12, y0 + 9 + i * 12, EZ + 4.2, EZ + 5, "#643a2d", { bevel: 0 })), tube([[x0, y1 + 2.2, EZ + 1], [x1, y1 + 2.2, EZ + 1]], 2.4, "#c9ced3", { seg: 8, mat: "paint" })];
}
function flyM(piv, a, axis, t) { const cs = Math.cos(a), sn = Math.sin(a), Rm = axis === "x" ? [1, 0, 0, 0, cs, -sn, 0, sn, cs] : [cs, 0, sn, 0, 1, 0, -sn, 0, cs]; return [...Rm, ...[0, 1, 2].map((i) => piv[i] - (Rm[i * 3] * piv[0] + Rm[i * 3 + 1] * piv[1] + Rm[i * 3 + 2] * piv[2]) + t[i])]; }
let fx = [];
const rn = () => Math.random();
function draw(dt = 0) {
  const c = boomAt === null ? -1 : now - boomAt, f = boomF, live = [], objs = [{ cache: "house", rev: 0, parts: houseStatic }];
  let tankM, midM, sideM, shakeA = 0, showTank = true;
  if (c >= 0) {
    if (f > 0.12) { // through the roof
      const rise = 600 * c * c + 55 * c; tankM = flyM([TK.x, TK.y, 45], 0.45 * c, "y", [8 * c, 0, rise]); showTank = rise < 420;
      const lift = c > 0.16 ? c - 0.16 : 0; if (lift > 0) midM = flyM([0, WL.y + 31, EZ], -2.8 * lift, "x", [0, 26 * lift, 460 * lift - 260 * lift * lift]);
    } else if (f > 0.03) { const kd = sm(0, 0.4, c); tankM = flyM([TK.x + TK.ro, TK.y, TK.z0], 1.25 * kd, "y", [8 * kd, 0, 26 * Math.sin(Math.min(c, 0.5) * TAU) * (c < 0.5 ? 1 : 0)]); }
    shakeA = (f > 0.12 ? 14 : f > 0.03 ? 7 : 2) * Math.exp(-c / 0.5);
    if (c > BOOM_END) { setShake(0, 0); flashEl.style.opacity = "0"; reset(); fx = []; event("Reset: new tank, new roof, back to " + M.start + " °C."); return draw(); }
  }
  if (showTank) objs.push({ cache: "tank", rev: tankKind, m: tankM, parts: tankParts });
  if (!(midM && now - boomAt > 2.6)) objs.push({ cache: "eave-m", rev: 0, m: midM, parts: () => eaveParts(-24, 24) });
  objs.push({ cache: "eave-l", rev: 0, parts: () => eaveParts(WL.x, -24) }, { cache: "eave-r", rev: 0, parts: () => eaveParts(24, WL.x + WL.w) });
  if (c < 0) {
    // the water, coloured by how hot it is, and the element that's heating it
    const tf = clamp((T - 15) / 210, 0, 1), wc = mixHex("#468ce6", "#ff7828", tf);
    live.push(lathe([[0, TK.z1 - 5], [TK.rw - 0.05, TK.z1 - 5], [TK.rw - 0.05, TK.z0 + 4.2], [0, TK.z0 + 4.2]], wc, { ...KEEP, seg: 36, mat: "satin", emit: [wc, 0.04 + 0.16 * tf], emitK: 0.8 }));
    const e0 = pol(TK.rw, 330), e1 = pol(4, 20), e2 = pol(4, 60), e3 = pol(TK.rw, 70);
    live.push(tube([[e0[0], e0[1], D.ELEM_Z], [e1[0], e1[1], D.ELEM_Z], [e2[0], e2[1], D.ELEM_Z + 2.2], [e3[0], e3[1], D.ELEM_Z + 2.2]], 0.9, heating ? "#ff8a3a" : "#5d646c", { seg: 8, mat: "steel", emit: heating ? ["#ff6a1a", 1] : undefined, emitK: 2.6 }));
    const tc = pol(TK.ro, 345), tv = pol(TK.ro + 2, D.TPR_A), tv2 = pol(TK.ro + 6, D.TPR_A);
    live.push(sphere([tc[0] + 2.4, tc[1], 24], 1.2, heating ? "#ff8a3a" : "#5a3a2a", { lat: 6, lon: 8, emit: heating ? ["#ff7a2a", 1] : undefined, emitK: 2.4 }));
    live.push(tube([[tv[0], tv[1], D.TPR_Z + 4], tprOpen ? [tv[0] + 1, tv[1] + 0.5, D.TPR_Z + 10] : [tv[0] + 5, tv[1] + 2.5, D.TPR_Z + 6]], 0.6, "#2a2d31", { seg: 5, mat: "plastic" }));
    if (tpr === "blocked") live.push(cyl(tv2[0] + 10, tv2[1], 2, 2, 6, "#d0342c", 12, { mat: "plastic" }));
    // the relief valve dumping down the drain, and steam when it's past boiling
    const dp = [tv2[0] + 11, tv2[1], 4];
    if (tprOpen && dt > 0) { for (let i = 0; i < (tprTemp ? 4 : 2); i++) fx.push({ k: "drop", p: [...dp], v: [40 + rn() * 30, (rn() - 0.5) * 14, 6 + rn() * 14], life: 0, max: 0.5 + rn() * 0.3 }); if ((boiling || T > 100) && rn() < 0.7) fx.push({ k: "steam", p: [dp[0] + 4, dp[1], 5], v: [14 + rn() * 14, (rn() - 0.5) * 10, 18 + rn() * 18], life: 0, max: 1.4 + rn(), s: 0.5 }); }
    objs.push({ parts: live });
  }
  let svg = E.render(objs);
  // the blast: the water that was above 100 °C is steam now, all of it at once
  if (c >= 0 && dt > 0 && f > 0.03 && c < 0.7) for (let i = 0; i < (f > 0.12 ? 9 : 4); i++) { const a = rn() * TAU, sp = 60 + rn() * 160; fx.push({ k: "steam", p: [TK.x + (rn() - 0.5) * 20, TK.y + (rn() - 0.5) * 20, 10 + rn() * 70], v: [Math.cos(a) * sp, Math.sin(a) * sp * 0.6 + 30, 40 + rn() * (f > 0.12 ? 260 : 90)], life: 0, max: 1.6 + rn() * 2.2, s: f > 0.12 ? 1.5 : 0.9 }); }
  if (c >= 0 && dt > 0 && f <= 0.03 && c < 1.2) for (let i = 0; i < 5; i++) fx.push({ k: "drop", p: [TK.x + TK.ro, TK.y + (rn() - 0.5) * 16, 10 + rn() * 30], v: [50 + rn() * 60, (rn() - 0.5) * 50, 10 + rn() * 40], life: 0, max: 0.6 + rn() * 0.5 });
  if (c >= 0 && c < 0.5 && f > 0.03) for (let i = 0; i < 3; i++) fx.push({ k: "bit", p: [TK.x, TK.y, 50], v: [(rn() - 0.5) * 420, rn() * 300, 100 + rn() * 420], life: 0, max: 1 + rn() });
  fx = fx.filter((p) => {
    p.life += dt; if (p.life > p.max) return false;
    const t = p.life / p.max, o = [p.p[0], p.p[1], p.p[2]];
    if (p.k !== "steam") p.v[2] -= 420 * dt; else { p.v[0] *= 0.97; p.v[1] *= 0.97; p.v[2] *= 0.985; }
    for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * dt;
    if (p.k === "drop" && p.p[2] < 0.5) { p.p[2] = 0.5; p.v = [p.v[0] * 0.3, p.v[1] * 0.3, 0]; }
    if (p.k === "steam") E.sprite(p.p, (7 + 46 * t) * p.s, lightTheme ? "#c3cbd4" : "#eef3f8", (lightTheme ? 0.6 : 0.42) * (1 - t));
    else if (p.k === "drop") E.line(o, p.p, 2, lightTheme ? "#3a7ed0" : "#9fd0ff", 0.85 * (1 - t), !lightTheme);
    else E.line(o, p.p, 2.5, "#d9d6cf", 1 - t);
    return true;
  });
  if (E.xray > 0.02 && c < 0) svg += E.callouts([
    { p: [...pol(8, 40), D.ELEM_Z + 1], text: "Element", sub: heating ? "3.6 kW, on" : "off" }, { p: [...pol(TK.ro + 1, 345), 20], text: "Thermostat and cutout", sub: stat === "stuck" ? "thermostat stuck on" : ecoTripped ? "cutout tripped" : "set to " + M.set + " °C" },
    { p: [...pol(TK.ro + 2, D.TPR_A), D.TPR_Z + 2], text: "T&PR valve", sub: tpr === "blocked" ? "drain capped off" : tpr === "pressure" ? "pressure only" : "850 kPa or 99 °C" }, { p: [...pol(9, 200), TK.z1 - 5], text: "The water", sub: Math.round(T) + " °C, boils at " + Math.round(tsat(Pg + 101.3)) + " °C here" },
    { p: [...pol(15.2, 91), 60], text: "Foam", sub: "keeps the heat in" }, { p: [...pol(7, 45), 44], text: "Anode", sub: "corrodes so the tank doesn't" },
  ], E.xray, E.fs < 0.62 ? {} : { topL: 70 });
  if (sceneG.innerHTML !== svg) sceneG.innerHTML = svg;
  setShake(shakeA * Math.sin(c * 90), shakeA * Math.cos(c * 71));
  flashEl.style.opacity = c >= 0 ? (f > 0.03 ? 0.7 * Math.exp(-c / 0.25) : 0).toFixed(3) : "0";
  const text = c >= 0 ? (f > 0.12 ? "BOOM · " + Math.round(f * M.litres) + " kg flashed to steam" : f > 0.03 ? "BURST" : "SPLIT, no flash") : Math.round(T) + " °C · " + Math.round(Pg) + " kPa · " + (heating ? "heating" : ecoTripped ? "cutout tripped" : "element off") + (tprOpen ? " · T&PR open" : "");
  if (readout.textContent !== text) readout.textContent = text;
}

function syncUi() {
  ui.stat.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.stat === stat)));
  ui.eco.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.eco === eco)));
  ui.tpr.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tpr === tpr)));
  ui.tank.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tank === tankKind)));
  ui.tFill.style.width = (clamp(T / 250, 0, 1) * 100).toFixed(1) + "%"; ui.tFill.dataset.state = T > 100 ? "bad" : T > M.eco ? "warn" : "ok";
  ui.tOut.textContent = Math.round(T) + " °C";
  ui.pFill.style.width = (clamp(Pg / 2600, 0, 1) * 100).toFixed(1) + "%"; ui.pFill.dataset.state = Pg > M.tpr.p ? "bad" : Pg > 700 ? "warn" : "ok";
  ui.pOut.textContent = Math.round(Pg) + " kPa";
  ui.burstMark.style.left = (M.burst[tankKind] / 2600 * 100).toFixed(1) + "%"; ui.burstMark.dataset.label = (tankKind === "corroded" ? "corroded tank bursts" : "tank bursts");
  const kg = Math.round(flashFrac(T) * M.litres);
  ui.stats.innerHTML = "boils at <b>" + Math.round(tsat(Pg + 101.3)) + " °C</b> at this pressure · if it let go now, <b>" + kg + " kg</b> would flash to steam" + (kg > 0 ? " (" + (100 * flashFrac(T)).toFixed(1) + " %)" : "");
  ui.power.textContent = power ? "POWER OFF" : "POWER ON"; ui.power.setAttribute("aria-pressed", String(power));
  ui.slow.setAttribute("aria-pressed", String(slow)); ui.tour.setAttribute("aria-pressed", String(touring));
}

function story() {
  if (now - lastEventAt < 4.5 && lastEvent) return say(lastEvent);
  if (busy()) return;
  if (!power) return say("Power off. It's just a big insulated tank of " + Math.round(T) + " °C water.");
  if (ecoTripped) return say("Cutout tripped. The element's off and stays off until someone resets it.");
  if (boiling) return say("The pressure-only valve is holding " + M.tpr.p + " kPa, so the water's boiling at " + Math.round(T) + " °C and venting steam. It won't burst while that valve works, but it's a tank of water 78 °C above boiling. If the tank fails now, " + Math.round(flashFrac(T) * M.litres) + " kg flashes to steam at once. That's why the valve has a temperature element.");
  if (tprTemp) return say("The T&PR is dumping: temperature element open, cold water coming in, holding it just under 100 °C.");
  if (tprOpen && T > 100) return say("The pressure-only valve is holding " + M.tpr.p + " kPa. The water's at " + Math.round(T) + " °C and it can't boil until " + Math.round(tsat(M.tpr.p + 101.3)) + " °C at that pressure, so it just keeps storing heat. A real T&PR would have opened at 99 °C.");
  if (tprOpen) return say("The T&PR's pressure side is dribbling at " + M.tpr.p + " kPa. A bit of water from the drain while it heats is normal: that's the water expanding.");
  if (tpr === "blocked" && T > 100) return say("Valve blocked. " + Math.round(T) + " °C and " + Math.round(Pg) + " kPa and climbing. The water can't boil because the pressure keeps it liquid, so all that heat is being stored. Every degree over 100 is more steam waiting to happen.");
  if (stat === "stuck" && T > M.set) return say("Thermostat's stuck on. " + Math.round(T) + " °C and still heating." + (eco === "ok" ? " The over-temperature cutout is next in line." : " The cutout's welded shut. Next in line is the T&PR."));
  return say(heating ? "Heating, " + Math.round(T) + " °C. The thermostat cuts it at " + M.set + " °C (stored water has to be hot enough to kill legionella)." : "Thermostat satisfied at " + Math.round(T) + " °C. Element off until it cools a few degrees.");
}

const TOUR = [
  { stat: "ok", eco: "ok", tpr: "ok", tank: "fresh", dur: 8 },
  { stat: "stuck", eco: "ok", tpr: "ok", tank: "fresh", dur: 9 },
  { stat: "stuck", eco: "welded", tpr: "ok", tank: "fresh", dur: 14 },
  { stat: "stuck", eco: "welded", tpr: "pressure", tank: "fresh", dur: 22 },
  { stat: "stuck", eco: "welded", tpr: "blocked", tank: "corroded", dur: 16 },
  { stat: "stuck", eco: "welded", tpr: "blocked", tank: "fresh", dur: 28 },
];
function tick(t) {
  const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
  last = t;
  const sdt = dt * (slow ? 0.12 : 1);
  now += sdt;
  if (touring && !busy()) {
    tourClock += sdt;
    if (tourStep < 0 || tourClock >= nextAt) {
      tourStep = (tourStep + 1) % TOUR.length;
      const s = TOUR[tourStep]; stat = s.stat; eco = s.eco; tpr = s.tpr; tankKind = s.tank; power = true; reset();
      nextAt = tourClock + s.dur;
    }
  }
  for (let i = 0; i < 8; i++) step(sdt / 8);
  draw(sdt); syncUi(); story();
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const guard = (fn) => (...a) => { touring = false; if (busy()) return; fn(...a); run(); };
const setStat = guard((v) => { stat = v; });
const setEco = guard((v) => { eco = v; if (v === "welded") ecoTripped = false; });
const setTpr = guard((v) => { tpr = v; });
const setTank = guard((v) => { tankKind = v; });
const togglePower = guard(() => { power = !power; });
const doReset = guard(() => reset());
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;
ui.stat.forEach((b) => b.addEventListener("click", () => setStat(b.dataset.stat)));
ui.eco.forEach((b) => b.addEventListener("click", () => setEco(b.dataset.eco)));
ui.tpr.forEach((b) => b.addEventListener("click", () => setTpr(b.dataset.tpr)));
ui.tank.forEach((b) => b.addEventListener("click", () => setTank(b.dataset.tank)));
ui.power.addEventListener("click", togglePower);
ui.reset.addEventListener("click", doReset);
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; tourClock = 0; } run(); });
onTap(() => setTpr(tpr === "ok" ? "pressure" : tpr === "pressure" ? "blocked" : "ok"));
stage.addEventListener("keydown", (ev) => {
  const map = { x: () => { setX(!E.xrayOn); run(); }, " ": togglePower, t: () => setStat(stat === "ok" ? "stuck" : "ok"), e: () => setEco(eco === "ok" ? "welded" : "ok"), v: () => setTpr(tpr === "ok" ? "pressure" : tpr === "pressure" ? "blocked" : "ok"), c: () => setTank(tankKind === "fresh" ? "corroded" : "fresh"), r: doReset, s: () => { slow = !slow; run(); } };
  if (map[ev.key]) { ev.preventDefault(); map[ev.key](); }
});
window.__fig = { E, freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
draw(); syncUi(); story();
`;

const CSS = `.fx-flash{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(circle 60% at 50% 55%,#ffffff 0%,#eef4ff 40%,rgba(220,235,255,0) 100%)}`;

const stage = stageHtml({
  W, H, fig: "Fig 16", title: "Hot water system", xray: true,
  label: "An electric storage hot water system against a brick house wall under the eave, a quarter cut away to show the water, the element across the bottom and the insulation. A temperature and pressure relief valve sits near the top with its drain line running down the side. An x-ray mode turns the jacket, foam and steel tank to glass.",
  keysHelp: "Hot water system: drag to rotate, X for x-ray, space turns the power on and off, T sticks the thermostat, E welds the cutout, V cycles the relief valve, C swaps in a corroded tank, R resets",
  extra: `<div class="fx-flash" aria-hidden="true"></div>`,
});

const CONTROLS = `<div class="ctl" role="group" aria-label="Test controls">
  <div class="ctl-row"><span class="ctl-label">Thermostat</span><button type="button" data-stat="ok" aria-pressed="true">Working<small>65 °C</small></button><button type="button" data-stat="stuck" aria-pressed="false">Stuck on</button></div>
  <div class="ctl-row"><span class="ctl-label">Cutout</span><button type="button" data-eco="ok" aria-pressed="true">Working<small>trips at 85 °C</small></button><button type="button" data-eco="welded" aria-pressed="false">Welded shut</button></div>
  <div class="ctl-row"><span class="ctl-label">Relief valve</span><button type="button" data-tpr="ok" aria-pressed="true">T&amp;PR<small>850 kPa and 99 °C</small></button><button type="button" data-tpr="pressure" aria-pressed="false">Pressure only<small>850 kPa</small></button><button type="button" data-tpr="blocked" aria-pressed="false">Blocked<small>capped / seized</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Tank</span><button type="button" data-tank="fresh" aria-pressed="true">Sound</button><button type="button" data-tank="corroded" aria-pressed="false">Corroded</button></div>
  <div class="ctl-row"><span class="ctl-label">Water</span><div class="meter"><span id="t-fill" class="fill"></span><span class="mark" style="left:${(65 / 250 * 100).toFixed(1)}%" data-label="65"></span><span class="mark red" style="left:${(100 / 250 * 100).toFixed(1)}%" data-label="100 °C"></span></div><output id="t-out">55 °C</output></div>
  <div class="ctl-row"><span class="ctl-label">Pressure</span><div class="meter"><span id="p-fill" class="fill"></span><span class="mark" style="left:${(850 / 2600 * 100).toFixed(1)}%" data-label="850 T&amp;PR"></span><span id="burst-mark" class="mark red" style="left:92%" data-label="tank bursts"></span></div><output id="p-out">500 kPa</output></div>
  <div class="ctl-row"><span class="ctl-label">Stored</span><span id="stats"></span></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="power" aria-pressed="true">POWER OFF</button><button type="button" id="reset">Reset</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
</div>`;


const foot = footHtml({
  theme, slug: "hot-water",
  real: "T&amp;PR valves set at a pressure (850 kPa here) and 99 °C (AS 1357.1), water's boiling point against pressure, and the flash fraction cp·(T − 100)/hfg. Typical: 250 L, 3.6 kW, 500 kPa mains.",
  made: "the thermal expansion pressure rise, the burst pressures, the time-lapse (about 50 minutes a second) and how high it flies. Never cap or block a relief drain.",
});
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), pageMk2({
  k, title: "Hot water system", fig: "Fig 16", hint: "Tap: change the relief valve", theme, W, H, stage, controls: CONTROLS, css: CSS, foot,
  caption: "Water's boiling point goes up with pressure, so a sealed tank can hold water well past 100 °C without it boiling. That's the danger: if the tank then fails, the pressure drops to nothing in an instant, and all the water above 100 °C flashes to steam at once, about 1600 times its volume. At 200 °C that's around a fifth of the tank. Three things stand in the way: the thermostat, the over-temperature cutout, and the temperature and pressure relief valve, which opens at 850 kPa and, crucially, at 99 °C. The temperature part is the bit that matters: it dumps hot water before it can ever get above boiling, so even a burst tank is just a flood.",
  script: LIVE.replace("__DATA__", JSON.stringify(DATA)),
}));
console.log("wrote", name);
