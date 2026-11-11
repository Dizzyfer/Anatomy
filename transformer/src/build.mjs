import { writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { kitScript } from "../../scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const SOLID = readFileSync(join(HERE, "solid.mjs"), "utf8").replace(/^export /gm, "");

const W = 680;
const H = 520;

// Truth (IEC 60076-7 thermal model, simplified): top-oil rise goes with ((1 + R·K²)/(1 + R))^x, the winding hot-spot sits a
// gradient above that going with K^y, and paper ages at V = 2^((θh − 98)/6) relative to normal, against a 180,000 h life.
// Above about 140 °C the paper starts to give off gas bubbles. An arc in oil makes gas fast: Buchholz and differential
// protection trip in tens of milliseconds; if nothing trips, the pressure splits the tank and the oil burns.
// Toy: a generic 60 MVA 132/33 kV ONAN/ONAF unit, time sped up 300×, every setting typical rather than from a real site.
const PLATE = { x: -8, y: -6.5, w: 16, d: 13, r: 0.6 };
const PLATE_H = 0.6, FOOT_H = 0.3;
const P = k.fitProjection([...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [-6, -4, 9.5], [5, -4, 9.5], [5, 2, 9.5], [-6, 2, 9]], W, H, { pad: 10, azimuth: 45 });
const Sv = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const depth2 = ([x, y]) => k.depthOf([x, y, 0], P);
const byDepth = (pts) => [...pts].sort((a, b) => depth2(a) - depth2(b));
function plate() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 0.9))) {
    out.push(Sv(k.cylinder(x, y, 0.28, -PLATE_H - FOOT_H, 0.07, P, 24), { tone: "lo" }));
    out.push(Sv(k.cylinder(x, y, 0.22, -PLATE_H - FOOT_H + 0.07, FOOT_H - 0.07, P, 24), { tone: "mid" }));
  }
  out.push(Sv(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 0.07), { tone: "mid", inner: L(k.sideSeam(PLATE, -PLATE_H / 2, P), { tone: "faint" }) }));
  return out.join("");
}
const svg = k.figureSvg({
  width: W, height: H,
  label: "A 60 MVA oil-filled power transformer in a substation bay, with its front tank wall cut away to show the three-phase core and windings in oil. Radiators and fans on one end, a conservator tank with a Buchholz relay on top, three tall high-voltage bushings, and a concrete firewall behind.",
  body: [plate(), `<g data-part="scene"></g>`, `<g data-part="fly"></g>`],
});
const DATA = { W, H, P };

const LIVE = `
${SOLID}
const D = __DATA__;
const PR = D.P;
const stage = document.querySelector(".fx-stage");
const q = (n) => stage.querySelector('[data-part="' + n + '"]');
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const R = solids((p) => iso(p, PR), (p) => depthOf(p, PR));
const { box, cyl, prism } = R;
const svgEl = stage.querySelector("svg"), cv = stage.querySelector(".fx-smoke"), ctx = cv.getContext("2d"), flashEl = stage.querySelector(".fx-flash");
const sceneG = q("scene"), flyG = q("fly");
const sp = (p) => { const a = iso(p, PR); return a[0].toFixed(1) + " " + a[1].toFixed(1); };
const VIEW = R.VIEW, dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const LIGHT = (() => { const v = [0.45, 0.6, 1]; const n = Math.hypot(...v); return v.map((a) => a / n); })();
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function normalOf(pts) { let n = [0, 0, 0]; for (let i = 0; i < pts.length; i++) { const p = pts[i], q2 = pts[(i + 1) % pts.length]; n[0] += (p[1] - q2[1]) * (p[2] + q2[2]); n[1] += (p[2] - q2[2]) * (p[0] + q2[0]); n[2] += (p[0] - q2[0]) * (p[1] + q2[1]); } const l = Math.hypot(...n) || 1; return n.map((v) => v / l); }
const shadeC = (c, n) => { const k2 = 0.48 + 0.62 * Math.max(0, dot(n, LIGHT)); return "rgb(" + c.map((v) => Math.round(clamp(v * k2, 0, 255))).join(",") + ")"; };
const mixc = (a, b, t) => a.map((v, i) => v + (b[i] - v) * clamp(t, 0, 1));
const face = (pts, fill, extra = "") => '<path d="M' + pts.map(sp).join("L") + 'Z" fill="' + fill + '"' + extra + "/>";
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
function sizeCanvas() { const r = svgEl.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); const w = Math.max(1, Math.round(r.width * dpr)), hh = Math.max(1, Math.round(r.height * dpr)); if (cv.width !== w || cv.height !== hh) { cv.width = w; cv.height = hh; } }
let shakeOff = [0, 0];
function drawParticles(dt) {
  sizeCanvas();
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.setTransform(cv.width / D.W, 0, 0, cv.height / D.H, shakeOff[0] * cv.width / D.W, shakeOff[1] * cv.height / D.H);
  // oil going round: up past the windings, across the top to the radiators, down through them, back along the bottom
  const flow = state === "on" ? 0.25 + load * 0.9 : state === "tripped" ? 0.12 : 0;
  while (conv.length < 46) conv.push({ u: rnd() * 4, y: 0.2 + rnd() * 1.1 });
  if (!boomed) {
    for (const c of conv) {
      c.u = (c.u + dt * flow * 0.35) % 4;
      let x, z; const u = c.u;
      if (u < 1) { x = -2.6 + ((c.y * 7) % 5.2); z = 1.3 + 3.2 * u; } else if (u < 2) { x = -2.6 + ((c.y * 7) % 5.2) + (3.9 - (-2.6 + ((c.y * 7) % 5.2))) * (u - 1); z = 4.5; } else if (u < 3) { x = 3.9; z = 4.5 - 3.2 * (u - 2); } else { x = 3.9 - (6.5 - ((c.y * 7) % 5.2) ) * (u - 3); z = 1.25; }
      const hotness = u < 1 ? u : u < 2 ? 1 : u < 3 ? 1 - (u - 2) : 0, tC = clamp((topOil - 30) / 70, 0, 1) * (0.4 + 0.6 * hotness);
      const P2 = iso([x, c.y, z], PR);
      ctx.fillStyle = "rgba(255," + Math.round(210 - 130 * tC) + "," + Math.round(120 - 90 * tC) + ",0.75)"; ctx.fillRect(P2[0] - 1, P2[1] - 1, 2, 2);
    }
  }
  parts = parts.filter((p) => {
    p.life += dt; if (p.life > p.max) return false;
    const t = p.life / p.max;
    if (p.k === "oil" || p.k === "spark") p.v[2] -= 9.8 * dt;
    for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * dt;
    if (p.p[2] < 0.05 && (p.k === "oil" || p.k === "spark")) { p.p[2] = 0.05; p.v = [p.v[0] * 0.3, p.v[1] * 0.3, 0]; }
    const P2 = iso(p.p, PR);
    const soft = (r, c, a) => { const g = ctx.createRadialGradient(P2[0], P2[1], 0, P2[0], P2[1], r); g.addColorStop(0, "rgba(" + c + "," + a.toFixed(3) + ")"); g.addColorStop(1, "rgba(" + c + ",0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(P2[0], P2[1], r, 0, 7); ctx.fill(); };
    if (p.k === "smoke") soft((8 + 34 * t) * p.s, "28,26,26", 0.6 * (1 - t));
    if (p.k === "flame") soft((6 + 16 * t) * p.s, t < 0.35 ? "255,225,140" : "255,110,30", 0.85 * (1 - t));
    if (p.k === "oil") { ctx.fillStyle = "rgba(60,40,10," + (0.85 * (1 - t)).toFixed(2) + ")"; ctx.beginPath(); ctx.arc(P2[0], P2[1], 1.6, 0, 7); ctx.fill(); }
    if (p.k === "spark") { ctx.fillStyle = "rgba(255," + Math.round(220 - 120 * t) + ",90," + (1 - t).toFixed(2) + ")"; ctx.fillRect(P2[0] - 1, P2[1] - 1, 2, 2); }
    if (p.k === "bubble") { ctx.strokeStyle = "rgba(255,255,255," + (0.8 * (1 - t)).toFixed(2) + ")"; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(P2[0], P2[1], 1.6, 0, 7); ctx.stroke(); if (p.p[2] > 4.6) return false; }
    if (p.k === "air") { ctx.strokeStyle = "rgba(200,225,255," + (0.5 * (1 - t)).toFixed(2) + ")"; ctx.lineWidth = 1; const P3 = iso([p.p[0] + 0.5, p.p[1], p.p[2]], PR); ctx.beginPath(); ctx.moveTo(P2[0], P2[1]); ctx.lineTo(P3[0], P3[1]); ctx.stroke(); }
    return true;
  });
  // the arc inside the tank
  if (fault && fault.on) { const x = -2 + fault.ph * 2, A = iso([x, 0.6, 2 + rnd() * 2], PR); const g = ctx.createRadialGradient(A[0], A[1], 0, A[0], A[1], 22); g.addColorStop(0, "rgba(230,240,255,0.95)"); g.addColorStop(1, "rgba(150,180,255,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(A[0], A[1], 22, 0, 7); ctx.fill(); }
  // the lightning bolt
  if (lightning && now - lightning.t < 0.35) { ctx.strokeStyle = "rgba(235,240,255,0.95)"; ctx.lineWidth = 2; ctx.beginPath(); let p = iso([2, 0.6, 14], PR); ctx.moveTo(p[0], p[1]); for (let i = 1; i <= 7; i++) { p = iso([2 + (rnd() - 0.5) * 1.2, 0.6 + (rnd() - 0.5) * 0.8, 14 - i * (14 - 8.3) / 7], PR); ctx.lineTo(p[0], p[1]); } ctx.stroke(); }
}

// ---------------- the plant ----------------
let lid = null;
const TANK = { x0: -3, x1: 3, y0: -1.6, y1: 1.6, z0: 0.8, z1: 4.8 };
const STEEL = "#7d8a7a", STEEL2 = "#6a776a";
// a winding cut in half by the plane y = 0.6 (we see the far half and the cut face)
function halfCyl(cx, cy, r0, r1, z0, z1, col) {
  const out = [], n = 14;
  for (let j = 0; j < n; j++) {
    const a = Math.PI + (Math.PI * j) / n, b = Math.PI + (Math.PI * (j + 1)) / n;
    const pts = [[cx + r1 * Math.cos(a), cy + r1 * Math.sin(a), z0], [cx + r1 * Math.cos(b), cy + r1 * Math.sin(b), z0], [cx + r1 * Math.cos(b), cy + r1 * Math.sin(b), z1], [cx + r1 * Math.cos(a), cy + r1 * Math.sin(a), z1]];
    let nn = normalOf(pts); const fm = (a + b) / 2; if (dot(nn, [Math.cos(fm), Math.sin(fm), 0]) < 0) nn = nn.map((v) => -v);
    if (dot(nn, VIEW) > 0) out.push(face(pts, shadeC(col, nn)));
    const top = [[cx + r1 * Math.cos(a), cy + r1 * Math.sin(a), z1], [cx + r1 * Math.cos(b), cy + r1 * Math.sin(b), z1], [cx + r0 * Math.cos(b), cy + r0 * Math.sin(b), z1], [cx + r0 * Math.cos(a), cy + r0 * Math.sin(a), z1]];
    out.push(face(top, shadeC(col, [0, 0, 1])));
  }
  for (const s of [-1, 1]) out.push(face([[cx + s * r0, cy, z0], [cx + s * r1, cy, z0], [cx + s * r1, cy, z1], [cx + s * r0, cy, z1]], "rgb(" + col.map((v) => Math.round(Math.min(255, v * 1.1))).join(",") + ")", ' class="wsec"'));
  return out.join("");
}
function bushing(x, y, z, h, r) {
  const parts = [cyl(x, y, r * 1.6, z, z + 0.3, "#8a8f94", 14)];
  const n = Math.round(h / 0.22);
  for (let i = 0; i < n; i++) { const zz = z + 0.3 + i * 0.22; parts.push(cyl(x, y, r * (i % 2 ? 1.0 : 1.55), zz, zz + 0.22, "#8b4a2b", 14)); }
  parts.push(cyl(x, y, r * 0.5, z + 0.3 + n * 0.22, z + 0.6 + n * 0.22, "#c9ced4", 10));
  return { parts };
}
function draw(dt) {
  const ht = clamp((hot - 60) / 120, 0, 1), cu = mixc(rgb("#b06a32"), [255, 120, 50], ht * 0.9), cuIn = mixc(rgb("#c27a3c"), [255, 150, 60], ht);
  const back = [];
  // firewall and bund
  back.push({ parts: [box(-7, 7, -5.4, -4.6, 0, 8.5, "#b9b4aa", { cap: "#a29d93" })], key: -1e9 });
  back.push({ parts: [box(-6.5, 6.5, -4.6, 4, -0.02, 0.02, "#6f6a62")], key: -9.9e8 });
  for (const [x0, x1, y0, y1] of [[-6.5, 6.5, 3.8, 4], [-6.5, -6.3, -4.6, 4], [6.3, 6.5, -4.6, 4]]) back.push({ parts: [box(x0, x1, y0, y1, 0, 0.5, "#a29d93")], key: -9e8 + x0 });
  back.push({ parts: [box(-3.4, 3.4, -2, 2, 0, 0.8, "#9a958c")], key: -8e8 });
  let html = R.render(back);
  if (boomed) {
    // the burning wreck: tank walls, no lid, fire in the bund
    html += R.render([{ parts: [box(TANK.x0, TANK.x1, TANK.y0, TANK.y0 + 0.08, TANK.z0, TANK.z1 - 0.6, "#3b3a36"), box(TANK.x0, TANK.x0 + 0.08, TANK.y0, TANK.y1, TANK.z0, TANK.z1 - 0.8, "#33322f"), box(TANK.x1 - 0.08, TANK.x1, TANK.y0, TANK.y1, TANK.z0, TANK.z1 - 1, "#3b3a36")] }]);
  } else {
    // inside the tank: back and floor walls, yokes, three phases with core limb, LV and HV windings cut in half
    const tank = [];
    tank.push(face([[TANK.x0, TANK.y0, TANK.z0], [TANK.x1, TANK.y0, TANK.z0], [TANK.x1, TANK.y0, TANK.z1], [TANK.x0, TANK.y0, TANK.z1]], "#4d574d"));
    tank.push(face([[TANK.x0, TANK.y0, TANK.z0], [TANK.x0, TANK.y1, TANK.z0], [TANK.x0, TANK.y1, TANK.z1], [TANK.x0, TANK.y0, TANK.z1]], "#56604f"));
    tank.push(face([[TANK.x0, TANK.y0, TANK.z0], [TANK.x1, TANK.y0, TANK.z0], [TANK.x1, TANK.y1, TANK.z0], [TANK.x0, TANK.y1, TANK.z0]], "#3f483f"));
    html += tank.join("");
    html += R.render([{ parts: [box(-2.7, 2.7, -0.5, 0.6, 1.0, 1.4, "#5d646b", { cap: "#7a8188" })], key: -7e8 }]);
    for (let i = 0; i < 3; i++) {
      const x = -2 + 2 * i, arc = fault && fault.on && fault.ph === i;
      html += R.render([{ parts: [box(x - 0.32, x + 0.32, -0.5, 0.6, 1.4, 4.3, "#5d646b", { cap: "#7a8188" })], key: -6e8 + i }]);
      html += halfCyl(x, 0.6, 0.36, 0.55, 1.5, 4.15, arc ? [240, 240, 255] : cuIn);
      html += halfCyl(x, 0.6, 0.62, 0.92, 1.6, 4.05, arc ? [240, 240, 255] : cu);
      if (through && now - through.t < through.clear) html += '<path class="force" d="M' + sp([x - 0.95, 0.6, 2.8]) + "L" + sp([x - 1.25, 0.6, 2.8]) + "M" + sp([x + 0.95, 0.6, 2.8]) + "L" + sp([x + 1.25, 0.6, 2.8]) + '"/>';
    }
    html += R.render([{ parts: [box(-2.7, 2.7, -0.5, 0.6, 4.3, 4.7, "#5d646b", { cap: "#7a8188" })], key: -5e8 }]);
    // oil, seen through the cut
    html += face([[TANK.x0, TANK.y1, TANK.z0], [TANK.x1, TANK.y1, TANK.z0], [TANK.x1, TANK.y1, 4.6], [TANK.x0, TANK.y1, 4.6]], "rgba(214,160,50,0.16)");
    // the cut tank walls (section), lid, radiators, fans, conservator, Buchholz, bushings
    html += face([[TANK.x0, TANK.y1, TANK.z0], [TANK.x0 + 0.08, TANK.y1, TANK.z0], [TANK.x0 + 0.08, TANK.y1, TANK.z1], [TANK.x0, TANK.y1, TANK.z1]], "#d9c9a6", ' class="sec"');
    html += face([[TANK.x1 - 0.08, TANK.y1, TANK.z0], [TANK.x1, TANK.y1, TANK.z0], [TANK.x1, TANK.y1, TANK.z1], [TANK.x1 - 0.08, TANK.y1, TANK.z1]], "#d9c9a6", ' class="sec"');
    html += face([[TANK.x0, TANK.y1, TANK.z0 - 0.08], [TANK.x1, TANK.y1, TANK.z0 - 0.08], [TANK.x1, TANK.y1, TANK.z0], [TANK.x0, TANK.y1, TANK.z0]], "#d9c9a6", ' class="sec"');
  }
  const top = [];
  if (!boomed) top.push({ parts: [box(TANK.x1 - 0.08, TANK.x1, TANK.y0, TANK.y1, TANK.z0, TANK.z1, STEEL)], key: 0 });
  if (!boomed || !lid) {
    if (!boomed) top.push({ parts: [box(TANK.x0 - 0.1, TANK.x1 + 0.1, TANK.y0 - 0.1, TANK.y1 + 0.02, TANK.z1, TANK.z1 + 0.15, STEEL2, { cap: STEEL })], key: 1 });
  }
  // radiators on the +x end and their fans
  for (let i = 0; i < 6; i++) { const y = -1.35 + i * 0.52; top.push({ parts: [box(3.2, 4.5, y, y + 0.12, 1.1, 4.4, "#86927f", { cap: "#97a38f" })], key: 2 + i * 0.01 }); }
  top.push({ parts: [box(3, 4.6, -1.5, 1.5, 4.4, 4.6, STEEL2), box(3, 4.6, -1.5, 1.5, 0.9, 1.1, STEEL2)], key: 3 });
  for (const yc of [-0.7, 0.7]) {
    const bl = [], spin = fansOn() && state === "on" ? 1 : 0;
    for (let b = 0; b < 5; b++) { const a = fanA * spin + (b / 5) * Math.PI * 2, P2 = (r, aa) => [yc + r * Math.cos(aa), 2.75 + r * Math.sin(aa)]; bl.push(prism([P2(0.1, a - 0.25), P2(0.62, a), P2(0.62, a + 0.45), P2(0.1, a + 0.3)], "x", 4.72, 4.75, "#3e4348")); }
    top.push({ parts: [prism(R.circle(yc, 2.75, 0.68, 20), "x", 4.55, 4.7, "#2d3135"), ...bl, prism(R.circle(yc, 2.75, 0.12, 10), "x", 4.7, 4.8, "#1f2225")], key: 4 + yc * 0.01 });
  }
  // conservator and Buchholz relay
  if (!boomed) {
    top.push({ parts: [prism(R.circle(-1.15, 6.2, 0.55, 18), "x", -2.8, 1.2, "#7f8b7c", { cap: "#93a08f" })], key: 5 });
    top.push({ parts: [box(1.45, 1.6, -1.2, -1.05, 4.95, 6.0, "#6a776a"), box(1.3, 1.75, -1.35, -0.9, 5.3, 5.7, gas > 0.5 || (fault && !fault.on) ? "#ff6a3d" : "#c9a43a")], key: 5.5 });
    // HV bushings (tall), LV bushings, the PRD
    [-2, 0, 2].forEach((x, i) => top.push({ ...bushing(x, 0.6, 4.95, 2.6, 0.17), key: 6 + i }));
    [-1.6, -0.6, 0.4].forEach((x, i) => top.push({ ...bushing(x, -0.9, 4.95, 0.9, 0.13), key: 7 + i }));
    top.push({ parts: [cyl(2.5, -0.9, 0.22, 4.95, 5.25, "#9aa1a8", 12)], key: 8 });
    // surge arresters next to the HV bushings
    if (arrester) [-2.6, -0.6, 1.4].forEach((x, i) => top.push({ ...bushing(x, 1.3, 4.95, 1.4, 0.1), key: 9 + i }));
  }
  // OLTC box and the marshalling kiosk
  top.push({ parts: [box(-3.9, -3, -1.1, 0.9, 1.6, 4.2, STEEL2, { cap: STEEL })], key: -1 });
  top.push({ parts: [box(-5.6, -4.6, 1.4, 2.4, 0, 1.9, "#c8ccd1", { cap: "#b3b8bd" })], key: -2 });
  html += R.render(top);
  // overhead conductors to the bushing tops
  if (!boomed) [-2, 0, 2].forEach((x) => { html += '<path class="cond" d="M' + sp([x, 0.6, 8.2]) + "Q" + sp([x - 1.2, 0.6, 9.3]) + " " + sp([x - 3.5, 0.6, 9.6]) + '"/>'; });
  sceneG.innerHTML = html;
  // the lid flying off
  let fl = "";
  if (lid) {
    lid.t = (lid.t || 0) + dt; const t = lid.t, z = Math.max(-TANK.z1 + 0.25, 7 * t - 4.9 * t * t), dx = -3.2 * Math.min(t, 1.3), r = Math.min(0.35, t * 0.5);
    const c = [0, 0, TANK.z1], cr = Math.cos(r), sr = Math.sin(r);
    fl += R.render([{ parts: [box(TANK.x0, TANK.x1, TANK.y0, TANK.y1, TANK.z1, TANK.z1 + 0.15, "#2e2d2a"), ...[-2, 0, 2].map((x) => cyl(x, 0.6, 0.2, TANK.z1 + 0.15, TANK.z1 + 1.2, "#5a3423", 10))], xf: (p) => { const y = p[1] - c[1], zz = p[2] - c[2]; return [p[0] + dx, c[1] + y * cr - zz * sr + 1.2 * Math.min(t, 1.3), c[2] + y * sr + zz * cr + z]; } }]);
  }
  flyG.innerHTML = fl;
  // effects
  fanA += dt * 12;
  if (fansOn() && state === "on" && rnd() < dt * 20) airP();
  if (hot > 135 && state === "on") for (let i = 0; i < 2; i++) if (rnd() < dt * 8) bubbleP(-2 + 2 * Math.floor(rnd() * 3));
  if (fault && fault.on && rnd() < 0.8) bubbleP(-2 + 2 * fault.ph);
  if (boomed) { const t = now - boomed.t; if (t < 12) { for (let i = 0; i < 3; i++) flameP([rnd() * 8 - 4, rnd() * 5 - 2, 0.2 + rnd() * 4], 1.4); if (rnd() < 0.7) smokeP([rnd() * 6 - 3, rnd() * 3 - 2, 6], 1.8); } }
  shake = Math.max(0, shake - dt * 0.8);
  const amp = shake * 6 + (through && now - through.t < through.clear ? 3 : 0);
  shakeOff = amp > 0.05 ? [(rnd() - 0.5) * amp, (rnd() - 0.5) * amp] : [0, 0];
  svgEl.style.transform = amp > 0.05 ? "translate(" + shakeOff[0].toFixed(1) + "px," + shakeOff[1].toFixed(1) + "px)" : "";
  const ft = now - flashT; flashEl.style.opacity = ft < 0.5 ? String((1 - ft / 0.5) * (boomed ? 0.95 : 0.5)) : "0";
  drawParticles(dt);
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
  const map = { ArrowUp: () => { load = Math.min(2, load + 0.05); }, ArrowDown: () => { load = Math.max(0, load - 0.05); }, f: () => { fansFailed = !fansFailed; }, l: () => { if (state === "on") lightning = { t: now }; }, t: () => { if (state === "on") through = { t: now, clear: 0.1 }; }, p: () => { protection = !protection; } };
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
.fx-flash{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(circle 55% at 50% 50%,#ffffff 0%,#ffe2a8 35%,rgba(255,170,80,0) 100%)}
.sec,.wsec{stroke:rgba(0,0,0,.35);stroke-width:.4}
.cond{fill:none;stroke:#9aa1a8;stroke-width:1.4}
.force{fill:none;stroke:#ff6a3d;stroke-width:2;stroke-linecap:round}
.fx-stage path{stroke-linejoin:round}
.ctl{display:grid;gap:12px;margin:14px 0 6px;font-family:var(--anatomy-mono);font-size:12px;color:var(--anatomy-mid)}
.ctl-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ctl-label{min-width:72px;text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:var(--anatomy-lo)}
.ctl button{font:inherit;color:var(--anatomy-mid);background:transparent;border:1px solid var(--anatomy-lo);border-radius:6px;padding:7px 10px;cursor:pointer;line-height:1.15;text-align:left;min-height:36px}
.ctl button:hover{border-color:var(--anatomy-mid)}
.ctl button[aria-pressed="true"]{color:#ff6a3d;border-color:#ff6a3d}
.ctl #stuck,.ctl #bolt{color:#ff6a3d;border-color:#ff6a3d}
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

const stageHtml = `<div class="iso-stage fx-stage" tabindex="0" role="group" aria-label="Power transformer: up and down for load, F fails the fans, T puts a fault on the feeder, L brings lightning, P toggles the protection">${svg}<canvas class="fx-smoke" aria-hidden="true"></canvas><div class="fx-flash" aria-hidden="true"></div></div>`;

const CONTROLS = `<div class="ctl" role="group" aria-label="Controls">
  <div class="ctl-row"><span class="ctl-label">Load</span><div class="slide"><input id="load" type="range" min="0" max="200" step="5" value="80" aria-label="Load, percent of rating"></div><output id="load-out">80 %</output></div>
  <div class="ctl-row"><span class="ctl-label">Ambient</span><div class="slide"><input id="amb" type="range" min="-5" max="50" step="1" value="25" aria-label="Ambient temperature"></div><output id="amb-out">25 °C</output></div>
  <div class="ctl-row"><span class="ctl-label">Kit</span><button type="button" id="fans" aria-pressed="false">Fans OK</button><button type="button" id="arr" aria-pressed="false">Surge arresters fitted</button><button type="button" id="prot" aria-pressed="false">Protection on</button></div>
  <div class="ctl-row"><span class="ctl-label">Hit it</span><button type="button" id="through">Feeder fault<small>cleared 100 ms</small></button><button type="button" id="stuck">Stuck breaker<small>cleared 1.5 s</small></button><button type="button" id="bolt">Lightning<small>on the 132 kV line</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Top oil</span><div class="meter"><span id="o-fill" class="fill"></span><span class="mark" style="left:${(100 / 130 * 100).toFixed(1)}%" data-label="trip 100"></span></div><output id="o-out">60 °C</output></div>
  <div class="ctl-row"><span class="ctl-label">Hot-spot</span><div class="meter"><span id="h-fill" class="fill"></span><span class="mark l" style="left:${(98 / 180 * 100).toFixed(1)}%" data-label="98 normal"></span><span class="mark" style="left:${(140 / 180 * 100).toFixed(1)}%" data-label="140 bubbles"></span></div><output id="h-out">80 °C</output></div>
  <div class="ctl-row"><span class="ctl-label">Ageing</span><div class="meter"><span id="a-fill" class="fill"></span><span class="mark" style="left:50%" data-label="1× normal"></span></div><output id="a-out">1×</output></div>
  <div class="ctl-row"><span class="ctl-label">Gas</span><div class="meter"><span id="g-fill" class="fill"></span></div><output id="g-out">clear</output></div>
  <div class="ctl-row"><span class="ctl-label">Status</span><span id="stats"></span></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="fresh">Reset</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
  <div id="shot" aria-live="polite"></div>
</div>`;

const card = k.plateHtml({
  fig: "Fig 25",
  title: "Power transformer",
  hint: "Load it, cook it, hit it",
  readout: "",
  keys: [
    { mark: "lit", label: "Live: windings glowing with hot-spot temperature, oil circulating, fans, gas bubbles, the arc" },
    { mark: "raised", label: "60 MVA 132/33 kV ONAN/ONAF transformer, front of the tank cut away, firewall and bund" },
  ],
  caption: "A power transformer is two coils of copper on an iron core, soaking in oil. Load current heats the windings; the oil carries the heat up and across to the radiators, cools, sinks and comes back. Fans on the radiators move more heat when it's busy. What kills transformers is the paper wrapped round the copper: it ages faster the hotter it runs, roughly doubling every 6 °C over 98 °C, and past about 140 °C it starts giving off gas. Faults outside hammer the windings with magnetic force; faults inside strike an arc in the oil, which makes gas fast. The Buchholz relay, differential protection and the pressure relief are there to catch it in milliseconds. If they don't, the tank splits and the oil burns.",
  body: stageHtml,
});

const other = theme === "light" ? ["index.html", "Dark version"] : ["light.html", "Light version"];
const FOOT = `<p style="font-family:var(--anatomy-mono);font-size:11px;color:var(--anatomy-lo);margin:28px 0 8px;line-height:1.6">A toy, not a loading study. Real: the IEC 60076-7 thermal model shape (top-oil rise with load squared, hot-spot gradient, oil and winding time constants), relative ageing doubling every 6 K above 98 °C against a 180,000 h normal life, gas bubbles from paper above about 140 °C, ONAN/ONAF cooling, short-circuit forces going with current squared, Buchholz and differential (87T) protection, surge arresters, tank rupture and oil fire, firewalls and bunds. Typical, not from a real site: the 60 MVA 132/33 kV unit, the alarm and trip settings, the fault level. Made up: time runs 300× fast, the gas and pressure model, and how the explosion plays out.<br>Built with <a href="https://github.com/wheresryan22/anatomy" style="color:inherit">Anatomy</a> by Ryan (MIT). · <a href="${other[0]}" style="color:inherit">${other[1]}</a> · <a href="../" style="color:inherit">More figures</a> · <a href="https://github.com/Dizzyfer/Anatomy/tree/main/transformer" style="color:inherit">Source</a></p>`;
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "Power transformer", theme, body: `<style>${CSS}</style>${card.replace("<figcaption", CONTROLS + "<figcaption")}${FOOT}`, script: kitScript() + LIVE.replace("__DATA__", JSON.stringify(DATA)), width: 720 }));
console.log("wrote", name);
