import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { engineScript, stageHtml, pageMk2, footHtml } from "../../mk2/shell.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const W = 960, H = 600;

// Truth (IEC 60076-7 thermal model, simplified): top-oil rise goes with ((1 + R·K²)/(1 + R))^x, the winding hot-spot sits a
// gradient above that going with K^y, and paper ages at V = 2^((θh − 98)/6) relative to normal, against a 180,000 h life.
// Above about 140 °C the paper starts to give off gas bubbles. An arc in oil makes gas fast: Buchholz and differential
// protection trip in tens of milliseconds; if nothing trips, the pressure splits the tank and the oil burns.
// Toy: a generic 60 MVA 132/33 kV ONAN/ONAF unit, time sped up 300×, every setting typical rather than from a real site.
const PLATE = { x: -6.6, y: -5.6, w: 13.2, d: 9.8, r: 0.6 };
const P = k.fitProjection([...k.boxCorners(PLATE, -0.8, 0), [-5, -4, 9.4], [4, -4, 9.4], [4, 2, 9.4], [-5, 2, 9]], W, H, { pad: 14, azimuth: 45, elevation: 30 });
const DATA = { W, H, P, PLATE };

const LIVE = `
${engineScript()}
const D = __DATA__;
const stage = document.querySelector(".mk-stage");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lightTheme = document.body.dataset.theme === "light";
const E = mk2(stage, D.P, { W: D.W, H: D.H, pivot: [0, -0.5, 3], plate: { ...D.PLATE, h: 0.6, foot: 0.3 }, shadowBox: [-7, -6, -1.5, 7, 4.6, 10.5] });
const { box, cyl, prism, circle, lathe, tube, sphere, loft, roundPoly, rrect, tris } = E;
E.bindTools(stage);
const xbtn = stage.querySelector('[data-mk="xray"]');
const setX = (on) => { E.setXray(on); if (xbtn) xbtn.setAttribute("aria-pressed", String(on)); };
const sceneG = stage.querySelector('[data-part="scene"]');
const iso = (p) => E.project(p), depthOf = (p) => E.depthOf(p);
const shakeEls = [stage.querySelector(".mk-gl"), stage.querySelector(".mk-over")];
const setShake = (x, y) => { const t = x || y ? "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px)" : ""; for (const e of shakeEls) if (e.style.transform !== t) e.style.transform = t; };
let seed = 4; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
// ---------------- thermal and protection model ----------------
let load = 0.8, amb = 25, fansAuto = true, fansFailed = false, protection = true, arrester = true;
let topOil = 60, hot = 80, life = 0, lifeRate = 1, gas = 0, press = 0, clock = 0;
let state = "on", stateAt = 0, why = "", fault = null, through = null, boomed = null, dga = 0, lastTrip = "", lightning = null;
let now = 0, last = 0, frame = 0, visible = false, touring = true, slow = false, tourClock = 0, tourStep = -1, actions = [], lastShot = "", lastEvent = "", lastEventAt = -10, flashT = -9, shake = 0, fanA = 0;
const event = (t) => { lastEvent = t; lastEventAt = now; };
const TS = 300;
const fansOn = () => fansAuto && !fansFailed && (topOil > 65 || hot > 85);
function physics(dt) {
  const hrs = dt * TS / 3600; clock += hrs;
  const on = state === "on";
  const K = on ? load : 0;
  // ONAF figures at rated load; fans off means the same heat through less cooling
  const af = fansOn();
  const dTor = af ? 52 : 52 * 1.55, x = af ? 0.9 : 0.8, R = 6, Hg = af ? 26 : 30, y = 1.3;
  const dTo = dTor * Math.pow((1 + R * K * K) / (1 + R), x), dTh = Hg * Math.pow(K, y);
  topOil += (amb + dTo - topOil) * Math.min(1, dt * TS / (150 * 60));
  const hT = topOil + dTh;
  hot += (hT - hot) * Math.min(1, dt * TS / (7 * 60));
  lifeRate = Math.pow(2, (Math.min(hot, 180) - 98) / 6);
  life += lifeRate * hrs;
  // gas: from bubbling paper above 140 °C, or a lot from an arc
  if (hot > 140 && on) { gas += dt * (hot - 140) / 60; dga += dt * 0.2; }
  if (fault && fault.on) { gas += dt * 40; dga += dt * 20; press += dt * 9; }
  press = Math.max(0, press - dt * (fault && fault.on ? 0 : 0.6));
  // protection
  if (protection && on) {
    if (hot > 140) trip("Winding temperature trip at " + Math.round(hot) + " °C hot-spot.", "WTI");
    else if (gas > 1 && !fault) trip("Buchholz alarm, then trip: gas from overheated paper is collecting in the relay.", "Buchholz");
  }
  if (fault && fault.on) {
    const t = now - fault.t;
    if (protection && t > 0.08) { fault.on = false; trip("Internal fault cleared in 80 ms: differential protection saw current going in that didn't come out, and the Buchholz relay got a surge of gas. The tank held. Off to the workshop.", "87T + Buchholz"); }
    if (!protection && press > 2.2 && !boomed) boom();
  }
  if (!fault && on && hot > 150 && !protection && rnd() < dt * 0.4) internalFault("The paper's been cooking at " + Math.round(hot) + " °C; the gas bubbles in the oil finally let an arc strike between turns.");
  // through-fault: a short circuit outside the transformer
  if (through) {
    const t = now - through.t;
    if (t > through.clear && !through.done) { through.done = true; if (through.clear > 0.5) { event("The feeder breaker didn't open: backup protection took " + through.clear.toFixed(1) + " s. That's 9 kA through the windings for too long, and they've been pulled out of shape. One of these days that'll be an internal fault."); dga += 3; setTimeout(() => {}, 0); through.later = now + 3; } else event("Fault cleared in " + Math.round(through.clear * 1000) + " ms by the feeder breaker. The windings took a hit like a hammer blow (force goes with current squared) and shrugged it off."); }
    if (through.later && now > through.later && !fault && state === "on") { through.later = null; internalFault("The deformed winding finally rubbed through its insulation."); }
    if (t > 6 && !through.later) through = null;
  }
  if (lightning && now - lightning.t > 0.15 && !lightning.done) {
    lightning.done = true;
    if (arrester) event("Lightning hit the line. The surge arrester clamped it and dumped it to earth; the transformer never noticed.");
    else internalFault("Lightning hit the line and there's no surge arrester: the impulse flashed over inside the HV winding.");
  }
  if (state === "tripped" && now - stateAt > 7 && !touring) restore();
  if (boomed && now - boomed.t > 14) restore();
}
function trip(msg, by) { if (state !== "on") return; state = "tripped"; stateAt = now; lastTrip = by; event(msg); }
function internalFault(msg) { if (fault || state !== "on") return; fault = { t: now, on: true, ph: Math.floor(rnd() * 3) }; flashT = now; shake = 0.6; event(msg + (protection ? "" : " And the protection's switched off.")); }
function boom() {
  boomed = { t: now }; state = "boom"; stateAt = now; flashT = now; shake = 2.2; if (fault) fault.on = false;
  lid = { t: 0 };
  for (let i = 0; i < 90; i++) oilP([rnd() * 6 - 3, rnd() * 3 - 1.5, 5], 1.4);
  for (let i = 0; i < 50; i++) sparkP([rnd() * 6 - 3, rnd() * 3 - 1.5, 5]);
  event("The arc kept going and boiled oil into gas faster than the pressure relief could vent it. The tank split, the lid went, and 30,000 litres of oil caught fire. That's what the firewall's for.");
}
function restore() { const wasBoom = !!boomed; state = "on"; stateAt = now; fault = null; through = null; boomed = null; lid = null; gas = 0; press = 0; lightning = null; topOil = Math.min(topOil, 60); hot = Math.min(hot, 80); event("Back in service" + (wasBoom ? " (new transformer, six months and a few million dollars later)" : "") + "."); }

// ---------------- particles ----------------
let parts = [], conv = [];
function oilP(p, s) { const a = rnd() * Math.PI * 2; parts.push({ k: "oil", p: [...p], v: [Math.cos(a) * 4 * s, Math.sin(a) * 4 * s, 4 + rnd() * 7 * s], life: 0, max: 1.2 + rnd() }); }
function sparkP(p) { const a = rnd() * Math.PI * 2; parts.push({ k: "spark", p: [...p], v: [Math.cos(a) * 6, Math.sin(a) * 6, 3 + rnd() * 6], life: 0, max: 0.5 + rnd() * 0.6 }); }
function smokeP(p, s) { parts.push({ k: "smoke", p: [...p], v: [(rnd() - 0.5) * 0.6, (rnd() - 0.5) * 0.6, 1.6 + rnd() * 1.2], life: 0, max: 5 + rnd() * 3, s }); }
function flameP(p, s) { parts.push({ k: "flame", p: [...p], v: [(rnd() - 0.5) * 0.8, (rnd() - 0.5) * 0.8, 1.5 + rnd() * 2.5], life: 0, max: 0.6 + rnd() * 0.6, s }); }
function bubbleP(x) { parts.push({ k: "bubble", p: [x + (rnd() - 0.5) * 0.6, 0.4 + rnd() * 0.8, 1.4 + rnd() * 2], v: [0, 0, 1.2 + rnd()], life: 0, max: 2.2 }); }
function airP() { parts.push({ k: "air", p: [4.9, -1.2 + rnd() * 2.4, 1.6 + rnd() * 2.6], v: [2.5 + rnd(), (rnd() - 0.5) * 0.4, 0.3], life: 0, max: 1.2 }); }
let shakeOff = [0, 0];
const flashEl = stage.querySelector(".fx-flash");
function drawParticles(dt) {
  // oil going round: up past the windings, across the top to the radiators, down through them, back along the bottom
  const flow = state === "on" ? 0.25 + load * 0.9 : state === "tripped" ? 0.12 : 0;
  while (conv.length < 54) conv.push({ u: rnd() * 4, y: -1.3 + rnd() * 2.6 });
  if (!boomed) for (const c of conv) {
    c.u = (c.u + dt * flow * 0.35) % 4;
    let x, z; const u = c.u, x0 = -2.6 + ((Math.abs(c.y) * 7) % 5.2);
    if (u < 1) { x = x0; z = 1.3 + 3.2 * u; } else if (u < 2) { x = x0 + (3.9 - x0) * (u - 1); z = 4.5; } else if (u < 3) { x = 3.9; z = 4.5 - 3.2 * (u - 2); } else { x = 3.9 - (3.9 - x0) * (u - 3); z = 1.25; }
    const hotness = u < 1 ? u : u < 2 ? 1 : u < 3 ? 1 - (u - 2) : 0, tC = clamp((topOil - 30) / 70, 0, 1) * (0.4 + 0.6 * hotness);
    E.sprite([x, c.y, z], 0.065, [1, (210 - 130 * tC) / 255, (120 - 90 * tC) / 255], 0.8, !lightTheme, 1);
  }
  parts = parts.filter((p) => {
    p.life += dt; if (p.life > p.max) return false;
    const t = p.life / p.max;
    if (p.k === "oil" || p.k === "spark") p.v[2] -= 9.8 * dt;
    const o = [p.p[0], p.p[1], p.p[2]];
    for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * dt;
    if (p.p[2] < 0.05 && (p.k === "oil" || p.k === "spark")) { p.p[2] = 0.05; p.v = [p.v[0] * 0.3, p.v[1] * 0.3, 0]; }
    if (p.k === "smoke") E.sprite(p.p, (0.35 + 1.5 * t) * p.s, "#1c1a1a", 0.6 * (1 - t));
    if (p.k === "flame") E.sprite(p.p, (0.45 + 0.7 * t) * p.s, t < 0.3 ? "#ffe9a8" : t < 0.65 ? "#ff9a2e" : "#e2501a", 0.95 * (1 - t * t), true, 2);
    if (p.k === "oil") E.sprite(p.p, 0.07, "#3c280a", 0.9 * (1 - t), false, 1);
    if (p.k === "spark") E.line(o, p.p, 1.6, t < 0.5 ? "#ffe6a0" : "#ff8a3a", 1 - t, true);
    if (p.k === "bubble") { E.sprite(p.p, 0.07, "#ffffff", 0.7 * (1 - t), !lightTheme, 1); if (p.p[2] > 4.6) return false; }
    if (p.k === "air") E.line(p.p, [p.p[0] + 0.5, p.p[1], p.p[2]], 1.1, lightTheme ? "#3a78c0" : "#c8e1ff", 0.5 * (1 - t), !lightTheme);
    return true;
  });
  // the arc inside the tank
  if (fault && fault.on) { const x = -2 + fault.ph * 2, a = [x + 0.75, 0.5, 2 + rnd() * 2]; E.sprite(a, 1.0, "#dfe9ff", 0.95, true, 1); for (let i = 0; i < 4; i++) E.line([a[0] + (rnd() - 0.5) * 0.5, a[1] + (rnd() - 0.5) * 0.5, a[2] + (rnd() - 0.5) * 0.9], [a[0] + (rnd() - 0.5) * 0.5, a[1] + (rnd() - 0.5) * 0.5, a[2] + (rnd() - 0.5) * 0.9], 2, "#ffffff", 1, true); }
  // the lightning bolt
  if (lightning && now - lightning.t < 0.35) { let p = [2, 0.6, 15]; for (let i = 1; i <= 8; i++) { const q = [2 + (i < 8 ? (rnd() - 0.5) * 1.2 : 0), 0.6 + (i < 8 ? (rnd() - 0.5) * 0.8 : 0), 15 - i * (15 - 8.3) / 8]; E.line(p, q, 3, "#ffffff", 1, true); p = q; } E.sprite([2, 0.6, 8.3], 1.6, "#cfe0ff", 0.9, true, 1); }
}

// ---------------- the plant ----------------
let lid = null;
const TANK = { x0: -3, x1: 3, y0: -1.6, y1: 1.6, z0: 0.8, z1: 4.8 };
const STEEL = "#7d8a7a", STEEL2 = "#6a776a";
// a bushing: metal flange, a stack of glazed sheds, the terminal on top
function bushing(x, y, z, h, r, col = "#8b4a2b") {
  const n = Math.round(h / 0.22), pr = [[r * 0.9, 0.3]];
  for (let i = 0; i < n; i++) { const zz = 0.3 + i * 0.22; pr.push([r * 0.95, zz], [r * 1.65, zz + 0.08], [r * 1.65, zz + 0.12], [r * 0.95, zz + 0.2]); }
  const zt = 0.3 + n * 0.22; pr.push([r * 0.9, zt], [0, zt]);
  return [lathe([[0, 0], [r * 1.7, 0], [r * 1.7, 0.3], [0, 0.3]], "#8a8f94", { c: [x, y, z], mat: "steel", seg: 16 }), lathe(pr, col, { c: [x, y, z], mat: "gloss", seg: 16, smooth: false }), lathe([[0, zt], [r * 0.5, zt], [r * 0.5, zt + 0.3], [0, zt + 0.3]], "#c9ced4", { c: [x, y, z], mat: "metal", seg: 12 })];
}
// a winding: a copper ring wound in discs
function winding(x, r0, r1, z0, z1, col, emit) { const pr = [[r0, z0], [r1, z0]]; for (let z = z0; z < z1 - 0.05; z += 0.2) pr.push([r1, z + 0.15], [r1 - 0.035, z + 0.165], [r1 - 0.035, z + 0.185], [r1, z + 0.2]); pr.push([r1, z1], [r0, z1], [r0, z0]); return lathe(pr, col, { c: [x, 0, 0], mat: "copper", seg: 28, smooth: false, emit, emitK: 1.1 }); }
function plantStatic() {
  const out = [], S = { shell: true }, Cn = { mat: "concrete" };
  // firewall, bund floor and kerbs, plinth
  out.push(box(-6, 6, -5.1, -4.5, 0, 6.6, "#b9b4aa", { ...Cn, cap: "#a29d93" }), box(-5.7, 5.7, -4.4, 3.5, 0, 0.03, "#6f6a62", { mat: "matte", bevel: 0 }));
  for (const [x0, x1, y0, y1] of [[-5.9, 5.9, 3.5, 3.7], [-5.9, -5.7, -4.4, 3.7], [5.7, 5.9, -4.4, 3.7]]) out.push(box(x0, x1, y0, y1, 0, 0.5, "#a29d93", Cn));
  out.push(box(-3.4, 3.4, -2, 2, 0, 0.8, "#9a958c", Cn));
  // radiators, their headers and pipes, fan housings; OLTC box and the marshalling kiosk
  for (let i = 0; i < 6; i++) { const y = -1.35 + i * 0.52; out.push(prism(rrect(3.2, 4.5, y, y + 0.12, 0.05, 2), "z", 1.1, 4.4, boomed ? "#4a4d49" : "#86927f", { mat: "paint" })); }
  out.push(box(3, 4.6, -1.5, 1.5, 4.4, 4.6, boomed ? "#3e403c" : STEEL2, { mat: "paint" }), box(3, 4.6, -1.5, 1.5, 0.9, 1.1, boomed ? "#3e403c" : STEEL2, { mat: "paint" }));
  for (const yc of [-0.7, 0.7]) out.push(lathe([[0.62, 0], [0.72, 0], [0.72, 0.16], [0.62, 0.16]], "#2d3135", { c: [4.55, yc, 2.75], axis: "x", mat: "plastic", seg: 22 }), lathe([[0, 0.13], [0.13, 0.13], [0.11, 0.26], [0, 0.26]], "#1f2225", { c: [4.55, yc, 2.75], axis: "x", mat: "plastic", seg: 12 }));
  out.push(prism(rrect(-3.9, -3, -1.1, 0.9, 0.08, 2), "z", 1.6, 4.2, boomed ? "#3a3b38" : STEEL2, { mat: "paint" }), prism(rrect(-5.3, -4.4, 1.3, 2.3, 0.06, 2), "z", 0, 1.9, "#c8ccd1", { mat: "paint" }), box(-4.4, -4.39, 1.5, 2.1, 0.9, 1.6, "#9aa1a8", { mat: "steel", bevel: 0 }));
  // core: three limbs and two yokes of stacked steel
  const core = boomed ? "#2b2c2e" : "#5d646b";
  out.push(box(-2.7, 2.7, -0.45, 0.45, 1.0, 1.4, core, { mat: "steel" }), box(-2.7, 2.7, -0.45, 0.45, 4.3, 4.7, core, { mat: "steel" }));
  for (let i = 0; i < 3; i++) out.push(box(-2 + 2 * i - 0.32, -2 + 2 * i + 0.32, -0.45, 0.45, 1.4, 4.3, core, { mat: "steel" }));
  if (boomed) {
    // the burnt-out tank: walls, no lid
    out.push(box(TANK.x0, TANK.x1, TANK.y0, TANK.y0 + 0.08, TANK.z0, TANK.z1 - 0.6, "#3b3a36"), box(TANK.x0, TANK.x0 + 0.08, TANK.y0, TANK.y1, TANK.z0, TANK.z1 - 0.8, "#33322f"), box(TANK.x1 - 0.08, TANK.x1, TANK.y0, TANK.y1, TANK.z0, TANK.z1 - 1, "#3b3a36"), box(TANK.x0, TANK.x1, TANK.y1 - 0.08, TANK.y1, TANK.z0, TANK.z1 - 1.6, "#3b3a36"), box(TANK.x0, TANK.x1, TANK.y0, TANK.y1, TANK.z0 - 0.02, TANK.z0 + 0.05, "#2a2927"));
    return out;
  }
  // tank with stiffening ribs, lid, conservator on its brackets, pipe to the Buchholz relay
  out.push(prism(rrect(TANK.x0, TANK.x1, TANK.y0, TANK.y1, 0.12, 3), "z", TANK.z0, TANK.z1, STEEL, { mat: "paint", ...S }), prism(rrect(TANK.x0 - 0.1, TANK.x1 + 0.1, TANK.y0 - 0.1, TANK.y1 + 0.1, 0.14, 3), "z", TANK.z1, TANK.z1 + 0.15, STEEL2, { mat: "paint", ...S }));
  for (let x = -2.4; x <= 2.41; x += 0.8) for (const sg of [-1, 1]) out.push(box(x - 0.05, x + 0.05, sg > 0 ? TANK.y1 : TANK.y0 - 0.09, sg > 0 ? TANK.y1 + 0.09 : TANK.y0, TANK.z0 + 0.2, TANK.z1 - 0.2, STEEL2, { mat: "paint", xhide: true }));
  out.push(lathe([[0, -2.0], [0.5, -2.0], [0.56, -1.92], [0.56, 1.92], [0.5, 2.0], [0, 2.0]], "#7f8b7c", { c: [-0.8, -1.15, 6.2], axis: "x", mat: "paint", seg: 24 }));
  for (const x of [-2.2, 0.6]) out.push(box(x - 0.06, x + 0.06, -1.3, -1.0, 4.95, 5.7, STEEL2, { mat: "paint" }));
  out.push(tube([[1.2, -1.15, 6.0], [1.52, -1.15, 5.9], [1.52, -1.15, 4.95]], 0.07, "#6a776a", { mat: "paint", seg: 8 }));
  // HV bushings (tall), LV bushings, the pressure relief device, surge arresters
  for (const x of [-2, 0, 2]) out.push(...bushing(x, 0.6, 4.95, 2.6, 0.17));
  for (const x of [-1.6, -0.6, 0.4]) out.push(...bushing(x, -0.5, 4.95, 0.9, 0.13));
  out.push(lathe([[0, 0], [0.22, 0], [0.22, 0.22], [0.12, 0.3], [0, 0.3]], "#9aa1a8", { c: [2.5, -0.9, 4.95], mat: "metal", seg: 14 }));
  if (arrester) for (const x of [-2.6, -0.6, 1.4]) out.push(...bushing(x, 1.25, 4.95, 1.4, 0.1, "#9aa0a6"));
  // overhead conductors to the bushing tops
  for (const x of [-2, 0, 2]) out.push(tube([[x, 0.6, 8.15], [x - 0.5, 0.6, 8.75], [x - 1.4, 0.6, 9.25], [x - 3.6, 0.6, 9.6]], 0.035, "#b9bec4", { mat: "metal", seg: 6 }));
  return out;
}
function draw(dt) {
  const ht = clamp((hot - 60) / 120, 0, 1), objs = [];
  objs.push({ cache: "plant", rev: (boomed ? 1 : 0) + (arrester ? 2 : 0), parts: plantStatic });
  if (!boomed) {
    const live = [];
    // windings glow with the hot-spot; the oil; the Buchholz relay lights when it sees gas
    for (let i = 0; i < 3; i++) { const x = -2 + 2 * i, arc = fault && fault.on && fault.ph === i; live.push(winding(x, 0.36, 0.55, 1.5, 4.15, "#c27a3c", arc ? ["#eef3ff", 1] : ["#ff8a34", ht * ht * 0.9]), winding(x, 0.62, 0.92, 1.6, 4.05, "#b06a32", arc ? ["#eef3ff", 1] : ["#ff7426", ht * ht * 0.8])); }
    live.push(box(TANK.x0 + 0.1, TANK.x1 - 0.1, TANK.y0 + 0.1, TANK.y1 - 0.1, TANK.z0 + 0.05, 4.62, "#d6a032", { opacity: lightTheme ? 0.16 : 0.1, mat: "glass", rough: 0.5 }));
    const alarm = gas > 0.5 || (fault && !fault.on);
    live.push(box(1.32, 1.72, -1.36, -0.94, 5.3, 5.7, alarm ? "#ff6a3d" : "#c9a43a", { mat: "paint", emit: alarm ? ["#ff5a2a", 0.7] : undefined }));
    objs.push({ parts: live });
  }
  // fans
  for (const yc of [-0.7, 0.7]) {
    const bl = [], spin = fansOn() && state === "on" ? 1 : 0;
    for (let b = 0; b < 5; b++) { const a = fanA * spin + (b / 5) * Math.PI * 2, P2 = (r, aa) => [yc + r * Math.cos(aa), 2.75 + r * Math.sin(aa)]; bl.push(prism([P2(0.12, a - 0.25), P2(0.6, a), P2(0.6, a + 0.45), P2(0.12, a + 0.3)], "x", 4.6, 4.63, "#4a5056", { mat: "plastic", bevel: 0 })); }
    objs.push({ parts: bl });
  }
  // the lid flying off
  if (lid) {
    lid.t = (lid.t || 0) + dt; const t = lid.t, z = Math.max(-TANK.z1 + 0.25, 7 * t - 4.9 * t * t), dx = -3.2 * Math.min(t, 1.3), r = Math.min(0.35, t * 0.5), c = [0, 0, TANK.z1], cr = Math.cos(r), sr = Math.sin(r);
    objs.push({ parts: [box(TANK.x0, TANK.x1, TANK.y0, TANK.y1, TANK.z1, TANK.z1 + 0.15, "#2e2d2a"), ...[-2, 0, 2].map((x) => cyl(x, 0.6, 0.2, TANK.z1 + 0.15, TANK.z1 + 1.2, "#5a3423", 10))], xf: (p) => { const y = p[1] - c[1], zz = p[2] - c[2]; return [p[0] + dx, c[1] + y * cr - zz * sr + 1.2 * Math.min(t, 1.3), c[2] + y * sr + zz * cr + z]; } });
  }
  let svg = E.render(objs);
  // short-circuit force on the windings
  if (!boomed && through && now - through.t < through.clear) for (let i = 0; i < 3; i++) { const x = -2 + 2 * i; for (const sg of [-1, 1]) E.line([x + sg * 0.98, 0, 2.8], [x + sg * 1.4, 0, 2.8], 3, "#ff6a3d", 1, !lightTheme); }
  // effects
  fanA += dt * 12;
  if (fansOn() && state === "on" && rnd() < dt * 20) airP();
  if (hot > 135 && state === "on") for (let i = 0; i < 2; i++) if (rnd() < dt * 8) bubbleP(-2 + 2 * Math.floor(rnd() * 3));
  if (fault && fault.on && rnd() < 0.8) bubbleP(-2 + 2 * fault.ph);
  if (boomed) { const t = now - boomed.t; if (t < 12) { for (let i = 0; i < 5; i++) flameP([rnd() * 6.4 - 3.2, rnd() * 3.6 - 1.8, 0.4 + rnd() * 3.6], 1.2); if (rnd() < 0.5) flameP([rnd() * 9 - 4.5, rnd() * 6 - 3, 0.1], 0.9); if (rnd() < 0.7) smokeP([rnd() * 6 - 3, rnd() * 3 - 2, 6], 1.8); } }
  shake = Math.max(0, shake - dt * 0.8);
  const amp = shake * 6 + (through && now - through.t < through.clear ? 3 : 0);
  shakeOff = amp > 0.05 ? [(rnd() - 0.5) * amp, (rnd() - 0.5) * amp] : [0, 0];
  setShake(shakeOff[0], shakeOff[1]);
  const ft = now - flashT; flashEl.style.opacity = ft < 0.5 ? String((1 - ft / 0.5) * (boomed ? 0.95 : 0.5)) : "0";
  drawParticles(dt);
  if (E.xray > 0.02 && !boomed) svg += E.callouts([
    { p: [0, 0.45, 4.5], text: "Core", sub: "stacked steel, carries the flux" }, { p: [-2, 0.92, 3.4], text: "HV winding", sub: "132 kV, outside" }, { p: [-2 + 0.5, 0.3, 4.15], text: "LV winding", sub: "33 kV, next to the core" },
    { p: [2.6, 1.5, 2], text: "Oil", sub: "insulates and carries the heat away" }, { p: [3.9, 1.5, 3.4], text: "Radiators and fans", sub: "ONAN, then ONAF when it's busy" }, { p: [1.52, -0.94, 5.5], text: "Buchholz relay", sub: "catches gas on its way up" },
    { p: [-0.8, -0.6, 6.5], text: "Conservator", sub: "room for the oil to expand" }, { p: [2, 0.6, 7], text: "HV bushing", sub: "" }, { p: [-3.45, 0.9, 3.6], text: "Tap changer", sub: "" },
  ], E.xray);
  sceneG.innerHTML = svg;
  const text = boomed ? "TANK RUPTURE · OIL FIRE" : state === "tripped" ? "TRIPPED · " + lastTrip : Math.round(load * 60) + " MVA · top oil " + Math.round(topOil) + " °C · hot-spot " + Math.round(hot) + " °C";
  if (readout.textContent !== text) readout.textContent = text;
}
// ---------------- UI ----------------
const ui = {
  load: document.querySelector("#load"), loadOut: document.querySelector("#load-out"), amb: document.querySelector("#amb"), ambOut: document.querySelector("#amb-out"),
  fanB: document.querySelector("#fans"), protB: document.querySelector("#prot"), arrB: document.querySelector("#arr"), thrB: document.querySelector("#through"), stuckB: document.querySelector("#stuck"), boltB: document.querySelector("#bolt"),
  fresh: document.querySelector("#fresh"), slow: document.querySelector("#slow"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"),
  oF: document.querySelector("#o-fill"), oO: document.querySelector("#o-out"), hF: document.querySelector("#h-fill"), hO: document.querySelector("#h-out"), aF: document.querySelector("#a-fill"), aO: document.querySelector("#a-out"), gF: document.querySelector("#g-fill"), gO: document.querySelector("#g-out"), stats: document.querySelector("#stats"),
};
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };
function syncUi() {
  if (document.activeElement !== ui.load) ui.load.value = String(Math.round(load * 100)); ui.loadOut.textContent = Math.round(load * 100) + " % · " + Math.round(load * 60) + " MVA";
  if (document.activeElement !== ui.amb) ui.amb.value = String(amb); ui.ambOut.textContent = amb + " °C";
  ui.fanB.setAttribute("aria-pressed", String(fansFailed)); ui.fanB.textContent = fansFailed ? "Fans failed" : "Fans OK";
  ui.protB.setAttribute("aria-pressed", String(!protection)); ui.protB.textContent = protection ? "Protection on" : "Protection OFF";
  ui.arrB.setAttribute("aria-pressed", String(!arrester)); ui.arrB.textContent = arrester ? "Surge arresters fitted" : "No surge arresters";
  ui.oF.style.width = clamp(topOil / 130 * 100, 0, 100).toFixed(1) + "%"; ui.oF.dataset.state = topOil > 100 ? "bad" : topOil > 90 ? "warn" : "ok"; ui.oO.textContent = Math.round(topOil) + " °C";
  ui.hF.style.width = clamp(hot / 180 * 100, 0, 100).toFixed(1) + "%"; ui.hF.dataset.state = hot > 140 ? "bad" : hot > 110 ? "warn" : "ok"; ui.hO.textContent = Math.round(hot) + " °C";
  ui.aF.style.width = clamp(Math.log2(Math.max(lifeRate, 0.01)) / 8 * 50 + 50, 0, 100).toFixed(1) + "%"; ui.aF.dataset.state = lifeRate > 8 ? "bad" : lifeRate > 1.5 ? "warn" : "ok"; ui.aO.textContent = (lifeRate < 1 ? lifeRate.toFixed(2) : lifeRate < 10 ? lifeRate.toFixed(1) : Math.round(lifeRate)) + "×";
  ui.gF.style.width = clamp(Math.max(gas, press / 2.2) * 100, 0, 100).toFixed(1) + "%"; ui.gF.dataset.state = press > 1 || gas > 1 ? "bad" : gas > 0.3 ? "warn" : "ok"; ui.gO.textContent = press > 0.05 ? press.toFixed(1) + " bar" : gas > 0.02 ? "gas" : "clear";
  ui.stats.innerHTML = "fans <b>" + (fansOn() ? "running" : "off") + "</b> · " + (state === "on" ? "<b>in service</b>" : state === "tripped" ? "<b>tripped</b> by " + lastTrip : "<b>destroyed</b>") + " · paper aged <b>" + (life < 48 ? life.toFixed(1) + " h" : (life / 24).toFixed(0) + " days") + "</b> in " + (clock < 48 ? clock.toFixed(1) + " h" : (clock / 24).toFixed(0) + " days") + " · DGA acetylene <b>" + (dga < 0.05 ? "none" : dga < 3 ? "trace" : "high") + "</b>";
  ui.slow.setAttribute("aria-pressed", String(slow)); ui.tour.setAttribute("aria-pressed", String(touring));
}
function story() {
  if (now - lastEventAt < 6.5 && lastEvent) return say(lastEvent);
  if (touring && tourStep >= 0 && TOUR[tourStep].say) return say(TOUR[tourStep].say);
  if (state !== "on") return;
  if (hot > 140) return say("Past 140 °C the paper starts giving off gas bubbles, and a bubble in a high-voltage field is where an arc starts.");
  if (lifeRate > 4) return say("Ageing at " + lifeRate.toFixed(0) + "× normal: every 6 °C over 98 °C doubles how fast the paper insulation wears out. Run it like this and a 40-year transformer lasts a few.");
  if (!fansOn() && load > 0.75) return say("Fans off: the oil's moving by convection alone. That's fine at light load, not at full.");
  return say("Load current heats the windings, the oil carries the heat up and over to the radiators, sinks as it cools, and comes back round. The hot-spot in the winding is what decides how long the paper lives.");
}
const TOUR = [
  { say: "A 60 MVA, 132/33 kV transformer at 80 % load on a mild day. Oil (dots) rises past the hot windings, crosses to the radiators, cools and sinks.", acts: [[0, () => { restore(); load = 0.8; amb = 25; fansFailed = false; protection = true; arrester = true; life = 0; clock = 0; dga = 0; }], [8, null]] },
  { say: "A Perth heatwave: 44 °C and everyone's air-con on, 125 % load. The fans kick in. Hot-spot climbing, paper ageing faster.", acts: [[0, () => { amb = 44; load = 1.25; }], [12, null]] },
  { say: "Now the fans fail.", acts: [[0, () => { fansFailed = true; }], [18, null]] },
  { say: "Back to normal, then a short circuit on a 33 kV feeder: about 9 kA through the windings until the feeder breaker opens.", acts: [[0, () => { restore(); fansFailed = false; amb = 25; load = 0.8; }], [2, () => { through = { t: now, clear: 0.1 }; }], [8, null]] },
  { say: "Lightning on the 132 kV line, and somebody's taken the surge arresters off.", acts: [[0, () => { restore(); arrester = false; }], [2, () => { lightning = { t: now }; }], [9, null]] },
  { say: "Same again with the protection switched off.", acts: [[0, () => { restore(); arrester = false; protection = false; }], [2, () => { lightning = { t: now }; }], [17, null]] },
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
  physics(sdt); draw(sdt); syncUi(); story();
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { if (touring) { touring = false; actions = []; tourStep = -1; } };
const act = (fn) => (...a) => { takeOver(); fn(...a); syncUi(); run(); };
ui.load.addEventListener("input", act(() => { load = +ui.load.value / 100; }));
ui.amb.addEventListener("input", act(() => { amb = +ui.amb.value; }));
ui.fanB.addEventListener("click", act(() => { fansFailed = !fansFailed; }));
ui.protB.addEventListener("click", act(() => { protection = !protection; }));
ui.arrB.addEventListener("click", act(() => { arrester = !arrester; }));
ui.thrB.addEventListener("click", act(() => { if (state === "on") through = { t: now, clear: 0.1 }; }));
ui.stuckB.addEventListener("click", act(() => { if (state === "on") through = { t: now, clear: 1.5 }; }));
ui.boltB.addEventListener("click", act(() => { if (state === "on") lightning = { t: now }; }));
ui.fresh.addEventListener("click", act(() => { restore(); life = 0; clock = 0; dga = 0; }));
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; actions = []; } syncUi(); run(); });
stage.addEventListener("keydown", (ev) => {
  const map = { x: () => setX(!E.xrayOn), ArrowUp: () => { load = Math.min(2, load + 0.05); }, ArrowDown: () => { load = Math.max(0, load - 0.05); }, f: () => { fansFailed = !fansFailed; }, l: () => { if (state === "on") lightning = { t: now }; }, t: () => { if (state === "on") through = { t: now, clear: 0.1 }; }, p: () => { protection = !protection; } };
  if (map[ev.key]) { ev.preventDefault(); act(map[ev.key])(); }
  if (ev.key === "s") { slow = !slow; run(); }
});
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;
window.__fig = { E, freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
setX(true); draw(0); syncUi(); story();
`;

const CSS = `.fx-flash{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(circle 55% at 50% 50%,#ffffff 0%,#ffe2a8 35%,rgba(255,170,80,0) 100%)}`;

const stage = stageHtml({
  W, H, fig: "Fig 25", title: "Power transformer", xray: true,
  label: "A 60 MVA oil-filled power transformer in its bund in front of a firewall: tank, radiators and fans, conservator, bushings. An x-ray mode turns the tank to glass to show the core, the copper windings glowing with hot-spot temperature, and the oil going round.",
  keysHelp: "Power transformer: drag to rotate, X for x-ray, up and down for load, F fails the fans, T puts a fault on the feeder, L brings lightning, P toggles the protection",
  extra: `<div class="fx-flash" aria-hidden="true"></div>`,
});

const CONTROLS = `<div class="ctl" role="group" aria-label="Controls">
  <div class="ctl-row"><span class="ctl-label">Load</span><div class="slide"><input id="load" type="range" min="0" max="200" step="5" value="80" aria-label="Load, percent of rating"></div><output id="load-out">80 %</output></div>
  <div class="ctl-row"><span class="ctl-label">Ambient</span><div class="slide"><input id="amb" type="range" min="-5" max="50" step="1" value="25" aria-label="Ambient temperature"></div><output id="amb-out">25 °C</output></div>
  <div class="ctl-row"><span class="ctl-label">Kit</span><button type="button" id="fans" aria-pressed="false">Fans OK</button><button type="button" id="arr" aria-pressed="false">Surge arresters fitted</button><button type="button" id="prot" aria-pressed="false">Protection on</button></div>
  <div class="ctl-row"><span class="ctl-label">Hit it</span><button type="button" id="through" class="danger">Feeder fault<small>cleared 100 ms</small></button><button type="button" id="stuck" class="danger">Stuck breaker<small>cleared 1.5 s</small></button><button type="button" id="bolt" class="danger">Lightning<small>on the 132 kV line</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Top oil</span><div class="meter"><span id="o-fill" class="fill"></span><span class="mark" style="left:${(100 / 130 * 100).toFixed(1)}%" data-label="trip 100"></span></div><output id="o-out">60 °C</output></div>
  <div class="ctl-row"><span class="ctl-label">Hot-spot</span><div class="meter"><span id="h-fill" class="fill"></span><span class="mark" style="left:${(98 / 180 * 100).toFixed(1)}%" data-label="98 normal"></span><span class="mark" style="left:${(140 / 180 * 100).toFixed(1)}%" data-label="140 bubbles"></span></div><output id="h-out">80 °C</output></div>
  <div class="ctl-row"><span class="ctl-label">Ageing</span><div class="meter"><span id="a-fill" class="fill"></span><span class="mark" style="left:50%" data-label="1× normal"></span></div><output id="a-out">1×</output></div>
  <div class="ctl-row"><span class="ctl-label">Gas</span><div class="meter"><span id="g-fill" class="fill"></span></div><output id="g-out">clear</output></div>
  <div class="ctl-row wide"><span class="ctl-label">Status</span><span id="stats"></span></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="fresh">Reset</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
</div>`;


const foot = footHtml({
  theme, slug: "transformer",
  real: "the IEC 60076-7 thermal model shape (top-oil rise with load squared, hot-spot gradient, oil and winding time constants), relative ageing doubling every 6 K above 98 °C against a 180,000 h normal life, gas bubbles from paper above about 140 °C, ONAN/ONAF cooling, short-circuit forces going with current squared, Buchholz and differential (87T) protection, surge arresters, tank rupture and oil fire, firewalls and bunds. Typical, not from a real site: the 60 MVA 132/33 kV unit, the alarm and trip settings, the fault level.",
  made: "time runs 300× fast, the gas and pressure model, and how the explosion plays out.",
});
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), pageMk2({
  k, title: "Power transformer", fig: "Fig 25", hint: "Load it, cook it, hit it", theme, W, H, stage, controls: CONTROLS, css: CSS, foot,
  caption: "A power transformer is two coils of copper on an iron core, soaking in oil. Load current heats the windings; the oil carries the heat up and across to the radiators, cools, sinks and comes back. Fans on the radiators move more heat when it's busy. What kills transformers is the paper wrapped round the copper: it ages faster the hotter it runs, roughly doubling every 6 °C over 98 °C, and past about 140 °C it starts giving off gas. Faults outside hammer the windings with magnetic force; faults inside strike an arc in the oil, which makes gas fast. The Buchholz relay, differential protection and the pressure relief are there to catch it in milliseconds. If they don't, the tank splits and the oil burns.",
  script: LIVE.replace("__DATA__", JSON.stringify(DATA)),
}));
console.log("wrote", name);
