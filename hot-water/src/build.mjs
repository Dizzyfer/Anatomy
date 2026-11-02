import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { glCamera } from "../../kit/gl.mjs";
import { kitScript, glScript } from "../../scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";

const W = 640;
const H = 460;

// Truth: T&PR valves (AS 1357.1) are set at a pressure (850 kPa here) and 99 °C. Water's boiling point rises with pressure
// (Antoine fit below). When a hot tank fails, the water above 100 °C flashes: the fraction that turns to steam is
// cp·(T − 100)/hfg, with cp 4.19 kJ/kg·K and hfg 2257 kJ/kg. A 250 L, 3.6 kW tank is typical.
// Toy: the thermal expansion pressure rise, the burst pressures, the time-lapse, and how high it flies.
const MODEL = {
  litres: 250, kw: 3.6, lapse: 3000, mains: 500, kexp: 5, set: 65, eco: 85, tpr: { p: 850, t: 99, tClose: 96 },
  burst: { fresh: 2400, corroded: 1100 }, cp: 4.19, hfg: 2257, start: 55,
};

const TK = { x: 0, y: -24, ro: 17, rf: 16.3, rt: 14, rw: 13.4, z0: 6, z1: 88 };
const PLATE = { x: -96, y: -62, w: 192, d: 124, r: 8 };
const PLATE_H = 12, FOOT_H = 5;
const WALL = { x: -92, y: -60, w: 184, d: 6, h: 136 };
const EAVE_Z = 136;
const TPR_A = 335, TPR_Z = 80, ELEM_Z = 20;

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [WALL.x, WALL.y, EAVE_Z + 6], [WALL.x + WALL.w, 24, EAVE_Z + 4]],
  W, H, { pad: 18, azimuth: 45 },
);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const Dt = (points, style) => k.dotsSvg(points, style);
const depth2 = ([x, y]) => k.depthOf([x, y, 0], P);
const byDepth = (pts) => [...pts].sort((a, b) => depth2(a) - depth2(b));
const slab = (plan, z, h, r = 1.2, bevel = 0.5) => k.slabOf({ r, ...plan }, z, h, P, 4, bevel);
const rad = (d) => (d * Math.PI) / 180;
const pol = (r, a) => [TK.x + r * Math.cos(rad(a)), TK.y + r * Math.sin(rad(a))];
function sector(r0, r1, a0, a1, n = 24) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push(pol(r1, a0 + ((a1 - a0) * i) / n));
  for (let i = n; i >= 0; i--) out.push(pol(r0, a0 + ((a1 - a0) * i) / n));
  return out;
}
const ring = (r0, r1, a0, a1, z, h, n) => k.extrude(sector(r0, r1, a0, a1, n), z, h, P, { convex: false });
const quad = (pts, cls) => `<path class="${cls}" d="${k.pathOf(pts.map(at), true)}"/>`;

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
  return out.join("");
}

function wall() {
  const out = [];
  out.push(`<g class="brick">${S(slab(WALL, 0, WALL.h, 0.4, 0.2), { tone: "mid" })}</g>`);
  const lines = [];
  for (let z = 8; z < WALL.h; z += 8) lines.push(k.segment([WALL.x, WALL.y + WALL.d, z], [WALL.x + WALL.w, WALL.y + WALL.d, z], P));
  out.push(L(lines.join(""), { tone: "faint" }));
  // the power point and the pipes into the wall
  out.push(S(slab({ x: 30, y: WALL.y + WALL.d, w: 8, d: 1.2 }, 46, 10, 0.4, 0.2), { tone: "hi" }));
  return out.join("");
}

// the eave above, in three pieces so the middle one can go
function eave() {
  const out = [];
  const seg = (x0, x1, part) => `<g data-part="${part}">${S(slab({ x: x0, y: WALL.y, w: x1 - x0, d: 84 }, EAVE_Z, 4, 0.4, 0.2), { tone: "lo" })}${L([0.2, 0.4, 0.6, 0.8].map((f) => k.segment([x0, WALL.y + 84 * f, EAVE_Z + 4], [x1, WALL.y + 84 * f, EAVE_Z + 4], P)).join(""), { tone: "faint" })}</g>`;
  out.push(seg(WALL.x, -24, "eave-l"), seg(-24, 24, "eave-m"), seg(24, WALL.x + WALL.w, "eave-r"));
  return out.join("");
}

function tankBack() {
  const out = [];
  out.push(`<path class="iso-halo" d="${k.haloOf({ x: TK.x - TK.ro - 3, y: TK.y - TK.ro - 3, w: TK.ro * 2 + 6, d: TK.ro * 2 + 6, r: TK.ro }, 0, 0.1, P)}"/>`);
  out.push(S(slab({ x: TK.x - 20, y: TK.y - 20, w: 40, d: 40 }, 0, TK.z0, 2, 0.5), { tone: "mid" }));
  return out.join("");
}

function tank() {
  const out = [];
  const zb = TK.z0, h = TK.z1 - TK.z0;
  // back half: jacket, foam, steel tank
  out.push(`<g class="jacket">${S(ring(TK.rf, TK.ro, 135, 315, zb, h, 30), { tone: "hi" })}</g>`);
  out.push(`<g class="foam">${S(ring(TK.rt, TK.rf, 135, 315, zb + 2, h - 4, 30), { tone: "hi" })}</g>`);
  // the water (and its cut faces)
  out.push(`<g class="water">${S(k.extrude(sector(0.01, TK.rw, 90, 360, 40), zb + 4, h - 10, P), { tone: "hi", crease: "none" })}</g>`);
  // the element across the bottom and the thermostat probe
  const e = [pol(2, 45), pol(12, 45)];
  out.push(`<path data-part="element" class="element" data-on="false" d="${k.pathOf([[...pol(TK.rw, 330), ELEM_Z], [...pol(4, 20), ELEM_Z], [...pol(4, 60), ELEM_Z + 2.2], [...pol(TK.rw, 70), ELEM_Z + 2.2]].map(at))}"/>`);
  // front pieces
  for (const [a0, a1] of [[90, 135], [315, 360]]) {
    out.push(`<g class="jacket">${S(ring(TK.rf, TK.ro, a0, a1, zb, h, 8), { tone: "hi" })}</g>`);
    out.push(`<g class="foam">${S(ring(TK.rt, TK.rf, a0, a1, zb + 2, h - 4, 8), { tone: "hi" })}</g>`);
  }
  // the steel tank wall on the cut faces
  for (const a of [90, 0]) {
    const p = (r, z) => [...pol(r, a), z];
    out.push(quad([p(TK.rw, zb + 4), p(TK.rt, zb + 4), p(TK.rt, TK.z1 - 6), p(TK.rw, TK.z1 - 6)], "steel"));
  }
  // lid
  out.push(`<g class="jacket">${S(k.extrude(sector(0.01, TK.ro, 90, 360, 40), TK.z1, 3, P), { tone: "hi" })}</g>`);
  // thermostat cover low on the right side
  const tc = pol(TK.ro, 345);
  out.push(`<g class="cover">${S(slab({ x: tc[0] - 3, y: tc[1] - 5, w: 4, d: 10 }, 12, 16, 0.8, 0.3), { tone: "hi" })}</g>`);
  out.push(`<circle data-part="lamp" class="lamp" data-on="false" cx="${at([tc[0] + 1.1, tc[1], 24])[0].toFixed(1)}" cy="${at([tc[0] + 1.1, tc[1], 24])[1].toFixed(1)}" r="1.6"/>`);
  // the T&PR valve near the top, with its lever and drain line down the side
  const tv = pol(TK.ro + 2, TPR_A), tv2 = pol(TK.ro + 6, TPR_A);
  out.push(`<g class="brass">${S(k.cylinder(tv[0], tv[1], 2.4, TPR_Z - 3, 7, P, 16, 0.4), { tone: "hi" })}</g>`);
  out.push(`<g class="brass">${S(k.cylinder(tv2[0], tv2[1], 1.6, TPR_Z - 6, 5, P, 12), { tone: "hi" })}</g>`);
  out.push(`<path data-part="lever" class="lever" d="${k.pathOf([[tv[0], tv[1], TPR_Z + 4], [tv[0] + 4, tv[1] + 2, TPR_Z + 8]].map(at))}"/>`);
  out.push(`<path class="drain-o" d="${k.pathOf([[tv2[0], tv2[1], TPR_Z - 6], [tv2[0], tv2[1], 4], [tv2[0] + 10, tv2[1], 4]].map(at))}"/><path class="drain" d="${k.pathOf([[tv2[0], tv2[1], TPR_Z - 6], [tv2[0], tv2[1], 4], [tv2[0] + 10, tv2[1], 4]].map(at))}"/>`);
  out.push(`<g data-part="tpr-cap" style="display:none">${S(k.cylinder(tv2[0] + 10, tv2[1], 2, 2, 4, P, 12, 0.3), { tone: "hi" })}</g>`);
  // the label
  const m = k.sideMatrix([...pol(TK.ro + 0.05, 110)], 66, P, "left");
  out.push(`<g transform="${m}"><text class="iso-face-text" data-tone="lo" x="0" y="0" font-size="2.6">250 L · 3.6 kW</text></g>`);
  return `<g data-part="tank">${out.join("")}</g>`;
}

function pipes() {
  const out = [];
  const pipe = (pts, cls = "") => `<path class="pipe-o" d="${k.pathOf(pts.map(at))}"/><path class="pipe ${cls}" d="${k.pathOf(pts.map(at))}"/>`;
  const ci = pol(TK.ro, 125), ho = pol(TK.ro, 200);
  out.push(pipe([[ci[0], ci[1], 16], [-30, ci[1] + 4, 16], [-30, WALL.y + WALL.d, 16]], "cold"));
  out.push(S(slab({ x: -34, y: ci[1], w: 8, d: 8 }, 12, 8, 1, 0.3), { tone: "hi" }));
  out.push(pipe([[TK.x, TK.y, TK.z1 + 3], [TK.x, TK.y, TK.z1 + 10], [TK.x, WALL.y + WALL.d, TK.z1 + 10]], "hot"));
  return out.join("");
}

const backSvg = k.figureSvg({
  width: W, height: H,
  label: "An electric storage hot water system against a house wall under the eave, cut open to show the water, the element across the bottom and the insulation. A temperature and pressure relief valve sits near the top with its drain line running down the side.",
  body: [plate(), wall(), tankBack(), pipes(), tank()],
});
const layer = (body) => `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg fx-layer" viewBox="0 0 ${W} ${H}" aria-hidden="true">${body}</svg>`;
const frontSvg = layer(eave());

const DRAIN = [...pol(TK.ro + 6, TPR_A)].map((v, i) => (i === 0 ? v + 10 : v));
const DATA = {
  W, H, camera: glCamera(P), P, MODEL,
  base: at([TK.x, TK.y, 0]), mid: at([TK.x, TK.y, 45]), up: (() => { const a = at([0, 0, 0]), b = at([0, 0, 1]); return b[1] - a[1]; })(),
};

const FRAG = `
uniform float uLight;
uniform float uDrip;
uniform float uSteamV;
uniform float uBoom;
uniform float uFlash;
uniform float uRise;
vec4 inkFor(vec3 seen,float cover){vec3 ab=1.-seen;float a=max(max(ab.r,max(ab.g,ab.b)),cover);return vec4(vec3(a)-ab,a);}
vec4 over(vec4 t,vec4 u){return t+u*(1.-t.a);}
vec4 steamInk(float h){float a=(1.-exp(-h))*mix(.75,.6,uLight);return vec4(mix(vec3(.93,.95,.97),vec3(.6,.64,.68),uLight)*a,a);}
vec4 waterInk(float h){float a=(1.-exp(-h))*mix(.7,.55,uLight);return vec4(mix(vec3(.45,.7,1.),vec3(.2,.45,.8),uLight)*a,a);}
float edgeFade(vec2 vb){return smoothstep(0.,40.,min(min(vb.x,uView.x-vb.x),min(vb.y,uView.y-vb.y)));}
const vec3 DR=vec3(${DRAIN[0].toFixed(1)},${DRAIN[1].toFixed(1)},4.);
const vec3 TB=vec3(${TK.x.toFixed(1)},${TK.y.toFixed(1)},8.);
void main(){
  vec2 vb=viewOf(gl_FragCoord.xy);
  vec4 o=vec4(0.);
  // the T&PR drain: hot water, or steam once it's boiling
  if(uDrip+uSteamV>.002){
    vec2 d=(vb-project(DR))/uK;
    float w=exp(-pow((d.x-2.)/2.,2.))*smoothstep(-1.,2.,d.y)*(1.-smoothstep(4.,9.,d.y))*(.6+.6*noise2(vec2(d.y*.8-uTime*12.,d.x)));
    o=waterInk(w*uDrip*2.);
    float up=-d.y;
    float s=exp(-pow(d.x/(2.+up*.4),2.))*smoothstep(-1.,3.,up)*exp(-up/26.)*smoothstep(.3,.8,fbm2(vec2(d.x*.15,up*.08-uTime*1.8)));
    o=over(steamInk(s*(uSteamV*1.6+uDrip*.2)),o);
  }
  if(uBoom>0.){
    float c=uBoom;
    vec2 d=(vb-project(TB))/uK;
    float R=12.+130.*(1.-exp(-c/.35));
    float n=fbm2(d*.03+vec2(c*.4,-c*.6));
    float cloud=(1.-smoothstep(R*.5,R*(1.+.25*n),length(d*vec2(1.,1.25)-vec2(0.,-R*.2))))*(.6+.7*n)*exp(-c/2.6);
    // the steam trail under the rocket
    vec2 dt=(vb-(project(TB)+vec2(0.,uRise)))/uK;
    float trail=exp(-pow(dt.x/(6.+abs(dt.y)*.12),2.))*step(0.,dt.y)*step(dt.y,-uRise/uK+10.)*.9*exp(-c/1.8);
    // water thrown out
    float sp=0.;
    for(int i=0;i<18;i++){
      float h1=hash12(vec2(float(i),2.1)),h2=hash12(vec2(float(i),5.3));
      vec2 v=vec2((h1-.5)*220.,40.+h2*120.);
      vec2 p=v*c-vec2(0.,-160.*c*c);
      p.y=-p.y;
      sp+=exp(-pow(length(d-vec2(p.x,-p.y)*vec2(1.,-1.))/1.4,2.))*exp(-c/1.2);
    }
    float ef=edgeFade(vb);
    o=over(steamInk((cloud*1.6+trail)*ef),o);
    o=over(waterInk(sp*ef),o);
  }
  o.rgb=min(o.rgb,vec3(o.a));
  float dd=(hash12(gl_FragCoord.xy+uTime)-.5)/255.*smoothstep(0.,1.5/255.,o.a);
  gl_FragColor=max(o+dd,0.);
}`;

const LIVE = `
const D = __DATA__;
const { P, MODEL: M } = D;
const stage = document.querySelector(".fx-stage");
const q = (n) => stage.querySelector('[data-part="' + n + '"]');
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const LIGHT = document.body.dataset.theme === "light" ? 1 : 0;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const gl = glLayer({ canvas: stage.querySelector(".fx-gl"), fragment: ${JSON.stringify(FRAG)}, view: [D.W, D.H], camera: D.camera, uniforms: ["uDrip", "uSteamV", "uBoom", "uFlash", "uRise"], fixed: { uLight: LIGHT } });
if (gl) stage.setAttribute("data-gl", "");

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

const tankG = q("tank"), eaveM = q("eave-m"), eaveL = q("eave-l"), eaveR = q("eave-r"), elem = q("element"), lamp = q("lamp"), lever = q("lever"), cap = q("tpr-cap"), flash = stage.querySelector(".fx-flash");
const ui = {
  stat: [...document.querySelectorAll("[data-stat]")], eco: [...document.querySelectorAll("[data-eco]")], tpr: [...document.querySelectorAll("[data-tpr]")], tank: [...document.querySelectorAll("[data-tank]")],
  tFill: document.querySelector("#t-fill"), tOut: document.querySelector("#t-out"), pFill: document.querySelector("#p-fill"), pOut: document.querySelector("#p-out"), burstMark: document.querySelector("#burst-mark"),
  stats: document.querySelector("#stats"), power: document.querySelector("#power"), reset: document.querySelector("#reset"), slow: document.querySelector("#slow"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"),
};
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };

function waterColour(t) {
  const f = clamp((t - 15) / 210, 0, 1);
  const a = [70, 140, 230], b = [255, 120, 40];
  return "rgb(" + a.map((v, i) => Math.round(v + (b[i] - v) * f)).join(",") + ")";
}

function draw() {
  const c = boomAt === null ? -1 : now - boomAt;
  stage.style.setProperty("--water", waterColour(T));
  elem.dataset.on = String(heating && c < 0);
  lamp.dataset.on = String(heating && c < 0);
  lever.dataset.open = String(tprOpen && c < 0);
  cap.style.display = tpr === "blocked" ? "" : "none";
  let tT = "", mT = "", lT = "", rT = "";
  if (c >= 0) {
    const f = boomF;
    if (f > 0.12) {
      // through the roof
      const rise = 900 * c * c + 80 * c;
      tT = "translate(" + (12 * c).toFixed(1) + " " + (-rise).toFixed(1) + ") rotate(" + (25 * c).toFixed(1) + " " + D.mid[0].toFixed(1) + " " + D.mid[1].toFixed(1) + ")";
      const lift = c > 0.18 ? (c - 0.18) : 0;
      mT = "translate(" + (40 * lift).toFixed(1) + " " + (-700 * lift + 300 * lift * lift).toFixed(1) + ") rotate(" + (-160 * lift).toFixed(1) + " " + D.mid[0].toFixed(1) + " " + (D.mid[1] - 120).toFixed(1) + ")";
      const A = 10 * Math.exp(-c / 0.5);
      lT = "translate(" + (A * Math.sin(c * 70)).toFixed(1) + " " + (A * Math.cos(c * 55)).toFixed(1) + ")"; rT = lT;
    } else if (f > 0.03) {
      // blown apart and knocked over
      const kd = sm(0, 0.4, c);
      tT = "translate(" + (30 * kd).toFixed(1) + " " + (-40 * Math.sin(Math.min(c, 0.5) * Math.PI * 2) * (c < 0.5 ? 1 : 0)).toFixed(1) + ") rotate(" + (70 * kd).toFixed(1) + " " + D.base[0].toFixed(1) + " " + D.base[1].toFixed(1) + ")";
    }
    const A = (f > 0.12 ? 14 : f > 0.03 ? 7 : 2) * Math.exp(-c / 0.5);
    stage.style.transform = "translate(" + (A * Math.sin(c * 90)).toFixed(1) + "px," + (A * Math.cos(c * 71)).toFixed(1) + "px)";
    flash.style.opacity = (f > 0.03 ? 0.7 * Math.exp(-c / 0.25) : 0).toFixed(3);
    if (c > BOOM_END) { stage.style.transform = ""; flash.style.opacity = "0"; reset(); event("Reset: new tank, new roof, back to " + M.start + " °C."); return draw(); }
  }
  tankG.setAttribute("transform", tT); eaveM.setAttribute("transform", mT); eaveL.setAttribute("transform", lT); eaveR.setAttribute("transform", rT);
  if (gl && !window.__noGL) gl.draw({ uDrip: c < 0 && tprOpen ? (tprTemp ? 1 : 0.5) : 0, uSteamV: c < 0 && (boiling || (tprOpen && T > 100)) ? 1 : 0, uBoom: c, uFlash: 0, uRise: c >= 0 && boomF > 0.12 ? -(900 * c * c + 80 * c) : 0 }, now);
  const text = c >= 0 ? (boomF > 0.12 ? "BOOM · " + Math.round(boomF * M.litres) + " kg flashed to steam" : boomF > 0.03 ? "BURST" : "SPLIT, no flash") : Math.round(T) + " °C · " + Math.round(Pg) + " kPa · " + (heating ? "heating" : ecoTripped ? "cutout tripped" : "element off") + (tprOpen ? " · T&PR open" : "");
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
  draw(); syncUi(); story();
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
stage.addEventListener("click", () => setTpr(tpr === "ok" ? "pressure" : tpr === "pressure" ? "blocked" : "ok"));
stage.addEventListener("keydown", (ev) => {
  const map = { " ": togglePower, t: () => setStat(stat === "ok" ? "stuck" : "ok"), e: () => setEco(eco === "ok" ? "welded" : "ok"), v: () => setTpr(tpr === "ok" ? "pressure" : tpr === "pressure" ? "blocked" : "ok"), c: () => setTank(tankKind === "fresh" ? "corroded" : "fresh"), r: doReset, s: () => { slow = !slow; run(); } };
  if (map[ev.key]) { ev.preventDefault(); map[ev.key](); }
});
window.__fig = { freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
draw(); syncUi(); story();
`;

const CSS = `.fx-stage{position:relative;cursor:pointer}
.fx-layer{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.fx-gl{display:block}
body[data-theme="dark"] .fx-gl{mix-blend-mode:screen}
.fx-flash{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(closest-side at 50% 55%,#ffffff 0%,#e8f2ff 45%,rgba(220,235,255,0) 100%)}
.iso-plate{overflow:hidden}
.brick .iso-fill,.brick .iso-shade{fill:#8a5a44}.brick .iso-top{fill:#a06a50}
body[data-theme="light"] .brick .iso-fill,body[data-theme="light"] .brick .iso-shade{fill:#c99a80}body[data-theme="light"] .brick .iso-top{fill:#d8ad94}
.jacket .iso-fill,.jacket .iso-shade{fill:#d9dcdf}.jacket .iso-top{fill:#eceef0}
body[data-theme="dark"] .jacket .iso-fill,body[data-theme="dark"] .jacket .iso-shade{fill:#8d9298}body[data-theme="dark"] .jacket .iso-top{fill:#a5aab0}
.foam .iso-fill,.foam .iso-shade,.foam .iso-top{fill:#e8c95a}
.water .iso-fill,.water .iso-shade,.water .iso-top{fill:var(--water,#4a8ce6);transition:fill .3s}
.steel{fill:#6f7b86;stroke:none}
.element{fill:none;stroke:#6a6a6a;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.element[data-on="true"]{stroke:#ff6a2a}
.cover .iso-fill,.cover .iso-shade,.cover .iso-top{fill:#f2f2ee}
.brass .iso-fill,.brass .iso-shade,.brass .iso-top{fill:#c9a24a}
.lever{fill:none;stroke:#c9a24a;stroke-width:1.4;stroke-linecap:round}.lever[data-open="true"]{stroke:#ffd36a}
.drain{fill:none;stroke:#cfd3d8;stroke-width:1.6;stroke-linejoin:round}.drain-o{fill:none;stroke:var(--anatomy-mid);stroke-width:2.6;stroke-linejoin:round}
.pipe{fill:none;stroke:#b87333;stroke-width:2.2;stroke-linejoin:round}.pipe-o{fill:none;stroke:var(--anatomy-mid);stroke-width:3.2;stroke-linejoin:round}
.pipe.cold{stroke:#4a8ce6}.pipe.hot{stroke:#e0603a}
.lamp{stroke:var(--anatomy-mid);stroke-width:.3;fill:var(--anatomy-paper)}.lamp[data-on="true"]{fill:#ff6a2a}
.ctl{display:grid;gap:12px;margin:14px 0 6px;font-family:var(--anatomy-mono);font-size:12px;color:var(--anatomy-mid)}
.ctl-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ctl-label{min-width:72px;text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:var(--anatomy-lo)}
.ctl button{font:inherit;color:var(--anatomy-mid);background:transparent;border:1px solid var(--anatomy-lo);border-radius:6px;padding:7px 10px;cursor:pointer;line-height:1.15;text-align:left;min-height:36px}
.ctl button:hover{border-color:var(--anatomy-mid)}
.ctl button[aria-pressed="true"]{color:var(--anatomy-lit);border-color:var(--anatomy-lit)}
.ctl button small{display:block;font-size:10px;color:var(--anatomy-lo)}
.ctl #power{font-weight:600;letter-spacing:.06em;min-width:100px;text-align:center;border-color:var(--anatomy-lit);color:var(--anatomy-lit)}
.ctl [data-tpr="blocked"],.ctl #reset{border-color:#ff6a3d;color:#ff6a3d}
.ctl output{min-width:72px;text-align:right;color:var(--anatomy-hi,var(--anatomy-mid))}
.meter{position:relative;flex:1;min-width:110px;height:10px;margin-top:14px;border:1px solid var(--anatomy-lo);border-radius:5px}
.meter .fill{position:absolute;left:0;top:0;bottom:0;border-radius:4px;transition:width .1s;background:var(--anatomy-mid)}
.meter .fill[data-state="ok"]{background:#3ddc84}.meter .fill[data-state="warn"]{background:#ffb347}.meter .fill[data-state="bad"]{background:#ff5a2a}
.mark{position:absolute;top:-14px;bottom:-3px;width:0;border-left:1px dashed var(--anatomy-lit);pointer-events:none}
.mark::after{content:attr(data-label);position:absolute;top:0;left:4px;font-size:10px;white-space:nowrap;color:var(--anatomy-lit)}
.mark.red{border-left-color:#ff6a3d}.mark.red::after{color:#ff6a3d}
#stats{font-size:12px;color:var(--anatomy-mid);line-height:1.5}#stats b{color:var(--anatomy-hi,var(--anatomy-mid));font-weight:600}
#shot{min-height:3.6em;font-size:12px;line-height:1.4}
@media (max-width:520px){.ctl-label{min-width:52px}.ctl button{padding:7px 8px}.ctl output{min-width:60px}.ctl button small{display:none}}`;

const stageHtml = `<div class="iso-stage fx-stage" tabindex="0" role="group" aria-label="Hot water system: space turns the power on and off, T sticks the thermostat, E welds the cutout, V cycles the relief valve, C swaps in a corroded tank, R resets">${backSvg}<canvas class="fx-layer fx-gl" aria-hidden="true"></canvas>${frontSvg}<div class="fx-flash" aria-hidden="true"></div></div>`;

const CONTROLS = `<div class="ctl" role="group" aria-label="Test controls">
  <div class="ctl-row"><span class="ctl-label">Thermostat</span><button type="button" data-stat="ok" aria-pressed="true">Working<small>65 °C</small></button><button type="button" data-stat="stuck" aria-pressed="false">Stuck on</button></div>
  <div class="ctl-row"><span class="ctl-label">Cutout</span><button type="button" data-eco="ok" aria-pressed="true">Working<small>trips at 85 °C</small></button><button type="button" data-eco="welded" aria-pressed="false">Welded shut</button></div>
  <div class="ctl-row"><span class="ctl-label">Relief valve</span><button type="button" data-tpr="ok" aria-pressed="true">T&amp;PR<small>850 kPa and 99 °C</small></button><button type="button" data-tpr="pressure" aria-pressed="false">Pressure only<small>850 kPa</small></button><button type="button" data-tpr="blocked" aria-pressed="false">Blocked<small>capped / seized</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Tank</span><button type="button" data-tank="fresh" aria-pressed="true">Sound</button><button type="button" data-tank="corroded" aria-pressed="false">Corroded</button></div>
  <div class="ctl-row"><span class="ctl-label">Water</span><div class="meter"><span id="t-fill" class="fill"></span><span class="mark" style="left:${(65 / 250 * 100).toFixed(1)}%" data-label="65"></span><span class="mark red" style="left:${(100 / 250 * 100).toFixed(1)}%" data-label="100 °C"></span></div><output id="t-out">55 °C</output></div>
  <div class="ctl-row"><span class="ctl-label">Pressure</span><div class="meter"><span id="p-fill" class="fill"></span><span class="mark" style="left:${(850 / 2600 * 100).toFixed(1)}%" data-label="850 T&amp;PR"></span><span id="burst-mark" class="mark red" style="left:92%" data-label="tank bursts"></span></div><output id="p-out">500 kPa</output></div>
  <div class="ctl-row"><span class="ctl-label">Stored</span><span id="stats"></span></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="power" aria-pressed="true">POWER OFF</button><button type="button" id="reset">Reset</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
  <div id="shot" aria-live="polite"></div>
</div>`;

const card = k.plateHtml({
  fig: "Fig 16",
  title: "Hot water system",
  hint: "Tap: change the relief valve",
  readout: "",
  keys: [
    { mark: "lit", label: "Water colour shows its temperature; relief valve discharge and steam" },
    { mark: "raised", label: "250 L electric storage tank cut open: jacket, insulation, tank, element, T&PR valve" },
  ],
  caption: "Water's boiling point goes up with pressure, so a sealed tank can hold water well past 100 °C without it boiling. That's the danger: if the tank then fails, the pressure drops to nothing in an instant, and all the water above 100 °C flashes to steam at once, about 1600 times its volume. At 200 °C that's around a fifth of the tank. Three things stand in the way: the thermostat, the over-temperature cutout, and the temperature and pressure relief valve, which opens at 850 kPa and, crucially, at 99 °C. The temperature part is the bit that matters: it dumps hot water before it can ever get above boiling, so even a burst tank is just a flood.",
  body: stageHtml,
});

const other = theme === "light" ? ["index.html", "Dark version"] : ["light.html", "Light version"];
const FOOT = `<p style="font-family:var(--anatomy-mono);font-size:11px;color:var(--anatomy-lo);margin:28px 0 8px;line-height:1.6">A toy, not plumbing advice. Real: T&amp;PR valves set at a pressure (850 kPa here) and 99 °C (AS 1357.1), water's boiling point against pressure, and the flash fraction cp·(T − 100)/hfg. Typical: 250 L, 3.6 kW, 500 kPa mains. Made up: the thermal expansion pressure rise, the burst pressures, the time-lapse (about 50 minutes a second) and how high it flies. Never cap or block a relief drain.<br>Built with <a href="https://github.com/wheresryan22/anatomy" style="color:inherit">Anatomy</a> by Ryan (MIT). · <a href="${other[0]}" style="color:inherit">${other[1]}</a> · <a href="../" style="color:inherit">More figures</a> · <a href="https://github.com/Dizzyfer/Anatomy/tree/main/hot-water" style="color:inherit">Source</a></p>`;
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "Hot water system", theme, body: `<style>${CSS}</style>${card.replace("<figcaption", CONTROLS + "<figcaption")}${FOOT}`, script: kitScript() + glScript() + LIVE.replace("__DATA__", JSON.stringify(DATA)), width: 700 }));
console.log("wrote", name);
