import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { glCamera } from "../../kit/gl.mjs";
import { kitScript, glScript } from "../../scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";

const W = 640;
const H = 440;

// Truth (roughly, and it varies a lot cell to cell): SEI breaks down from about 70 to 90 °C; PE separators melt around 130 to 140 °C;
// cobalt and nickel-rich cathodes run away somewhere around 150 to 200 °C, LFP around 250 °C; hot spots reach about 800 °C.
// NMC charges to 4.2 V, LFP to about 3.6 V. Less charge means less energy to release (that's why cells ship at 30 % or less).
// Toy: every rate, the heat model, the propagation, the timings and the overcharge curve.
const CHEM = {
  nmc: { name: "NMC", sei: 80, sep: 130, vent: 150, tr: 180, peak: 800, vmax: 4.2, ocv: [[0, 3.0], [0.1, 3.45], [0.3, 3.6], [0.5, 3.7], [0.8, 3.95], [1, 4.2], [1.2, 4.6], [1.5, 5.1]] },
  lfp: { name: "LFP", sei: 80, sep: 130, vent: 170, tr: 250, peak: 450, vmax: 3.6, ocv: [[0, 2.5], [0.1, 3.2], [0.3, 3.27], [0.5, 3.3], [0.9, 3.35], [1, 3.6], [1.2, 4.3], [1.5, 5.0]] },
};
const MODEL = {
  amb: 25, tauCool: 120, selfA: 0.04, selfB: 22, short: 3.2, burn: 4, tauDead: 25, tauPeak: 0.5,
  couple: { touch: 0.03, gap: 0.014, barrier: 0.001 }, flame: { touch: 4, gap: 2.8, barrier: 0.2 },
  chargeRate: 0.03, oc0: 0.1, oc: 40, heater: 8, nail: 110, tauNail: 3,
};

const COLS = 4, ROWS = 3, N = COLS * ROWS, TRIG = N - 1;
const RC = 9, ZB = 4, ZT = 69;
const PACK = [22, 6];
const PITCH = { touch: 18.6, gap: 25, barrier: 25 };
const PLATE = { x: -76, y: -50, w: 158, d: 110, r: 8 };
const PLATE_H = 12, FOOT_H = 5;
const CHG = { x: -64, y: 24, w: 26, d: 20 };
const BMS = { x: -62, y: -30, w: 22, d: 40 };

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [PACK[0] - 20, PACK[1] - 20, ZT + 62], [PACK[0] + 40, PACK[1] + 30, ZT + 30]],
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
const posOf = (i, pitch) => { const c = i % COLS, r = Math.floor(i / COLS); return [PACK[0] + (c - (COLS - 1) / 2) * pitch, PACK[1] + (r - (ROWS - 1) / 2) * pitch]; };
function sector([cx, cy], r0, r1, a0, a1, n = 24) {
  const pt = (r, a) => [cx + r * Math.cos(rad(a)), cy + r * Math.sin(rad(a))];
  const out = [];
  for (let i = 0; i <= n; i++) out.push(pt(r1, a0 + ((a1 - a0) * i) / n));
  for (let i = n; i >= 0; i--) out.push(pt(r0, a0 + ((a1 - a0) * i) / n));
  return out;
}

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

function charger() {
  const out = [];
  out.push(S(slab(CHG, 0, 12, 2.4, 0.8), { tone: "hi", inner: L(k.sideSeam({ ...CHG, r: 2.4 }, 6, P), { tone: "faint" }) }));
  const m = k.topMatrix([CHG.x + 4, CHG.y + 5], 12.01, P, "x");
  out.push(`<g transform="${m}"><text class="iso-face-text" data-tone="lo" x="0" y="2" font-size="3">CHARGER</text><circle data-part="chg-lamp" class="lamp" data-on="false" cx="2" cy="7" r="1.6"/><text data-part="chg-t" class="iso-face-text" data-tone="mid" x="5.4" y="8" font-size="2.6">idle</text></g>`);
  // the BMS board, its sense wires and the main lead
  out.push(S(slab(BMS, 0, 2.4, 1, 0.3), { tone: "mid" }));
  out.push(`<g class="pcb">${S(slab(k.insetPlan({ ...BMS, r: 1 }, 1.5), 2.4, 1.2, 0.6, 0.2), { tone: "hi" })}</g>`);
  for (const [x, y, w, d] of [[BMS.x + 5, BMS.y + 8, 10, 10], [BMS.x + 6, BMS.y + 24, 6, 4], [BMS.x + 6, BMS.y + 32, 6, 4]]) out.push(S(slab({ x, y, w, d }, 3.6, 1.6, 0.4, 0.2), { tone: "lo" }));
  const m2 = k.topMatrix([BMS.x + 3, BMS.y + 4], 3.61, P, "x");
  out.push(`<g transform="${m2}"><text class="iso-face-text" data-tone="lo" x="0" y="0" font-size="2.6">BMS</text><circle data-part="bms-lamp" class="lamp" data-on="true" cx="14" cy="36" r="1.6"/></g>`);
  const lead = [[CHG.x + 6, CHG.y, 3], [CHG.x + 6, BMS.y + BMS.d + 6, 2], [BMS.x + 6, BMS.y + BMS.d + 6, 2], [BMS.x + 6, BMS.y + BMS.d - 2, 3]].map(at);
  out.push(`<path class="iso-pipe-out" d="${k.pathOf(lead)}"/><path class="iso-pipe" d="${k.pathOf(lead)}"/>`);
  return out.join("");
}

// the jelly roll on the two cut faces of the trigger cell: anode, separator, cathode, separator, out from the mandrel
function rollFaces(c) {
  const out = [];
  const u = [Math.cos(rad(135)), Math.sin(rad(135))];
  const p = (r, z) => [c[0] + r * u[0], c[1] + r * u[1], z];
  const quad = (r0, r1, cls) => `<path class="${cls}" d="${k.pathOf([p(r0, ZB + 3), p(r1, ZB + 3), p(r1, ZT - 4), p(r0, ZT - 4)].map(at), true)}"/>`;
  out.push(quad(-8.5, 8.5, "roll-bg"));
  const lay = [[0.48, "an"], [0.16, "sep"], [0.5, "ca"], [0.16, "sep"]];
  for (const sgn of [1, -1]) {
    let r = 1.3;
    while (r < 8.3) for (const [t, cls] of lay) { if (r >= 8.3) break; const r1 = Math.min(8.3, r + t); out.push(sgn > 0 ? quad(r, r1, cls) : quad(-r1, -r, cls)); r += t; }
  }
  out.push(quad(-1.2, 1.2, "mandrel"));
  out.push(L(k.segment(p(8.5, ZB), p(8.5, ZT), P) + k.segment(p(-8.5, ZB), p(-8.5, ZT), P), { tone: "lo" }));
  return `<g class="roll" data-stage="0">${out.join("")}</g>`;
}

function cellSvg(i, c) {
  const out = [];
  if (i === TRIG) {
    out.push(S(k.extrude(sector(c, 0.01, RC, 135, 315, 30), ZB, ZT - ZB, P), { tone: "hi" }));
    out.push(rollFaces(c));
    out.push(`<g class="cap">${S(k.extrude(sector(c, 0.01, 3.6, 135, 315, 16), ZT, 1.4, P), { tone: "hi" })}</g>`);
  } else {
    out.push(S(k.cylinder(c[0], c[1], RC, ZB, ZT - ZB, P, 36, 0.8), { tone: "hi" }));
    out.push(L(k.ring(c[0], c[1], RC - 1.6, ZT, P, 28), { tone: "faint" }));
    out.push(`<g class="cap">${S(k.cylinder(c[0], c[1], 3.6, ZT, 1.4, P, 20, 0.3), { tone: "hi" })}</g>`);
  }
  return `<g class="cell" data-cell="${i}" data-st="ok">${out.join("")}</g>`;
}

function pack(sp) {
  const pitch = PITCH[sp];
  const out = [];
  const tray = { x: PACK[0] - (COLS / 2) * pitch - 4, y: PACK[1] - (ROWS / 2) * pitch - 4, w: COLS * pitch + 8, d: ROWS * pitch + 8 };
  out.push(S(slab(tray, 0, ZB, 2, 0.5), { tone: "mid" }));
  const order = byDepth([...Array(N).keys()].map((i) => [...posOf(i, pitch), i])).map((p) => p[2]);
  for (const i of order) {
    const c = posOf(i, pitch), col = i % COLS, row = Math.floor(i / COLS);
    out.push(cellSvg(i, c));
    if (sp === "barrier") {
      if (col < COLS - 1) out.push(`<g class="mica">${S(slab({ x: c[0] + pitch / 2 - 0.5, y: c[1] - pitch / 2 + 0.6, w: 1, d: pitch - 1.2 }, ZB, ZT - ZB - 6, 0.2, 0), { tone: "hi", crease: "none" })}</g>`);
      if (row < ROWS - 1) out.push(`<g class="mica">${S(slab({ x: c[0] - pitch / 2 + 0.6, y: c[1] + pitch / 2 - 0.5, w: pitch - 1.2, d: 1 }, ZB, ZT - ZB - 6, 0.2, 0), { tone: "hi", crease: "none" })}</g>`);
    }
  }
  // nickel strips along each row, not over the cut cell
  for (let r = 0; r < ROWS; r++) {
    const a = posOf(r * COLS, pitch), b = posOf(r * COLS + COLS - (r === ROWS - 1 ? 2 : 1), pitch);
    out.push(`<g class="ni">${S(slab({ x: a[0] - 3, y: a[1] - 2.5, w: b[0] - a[0] + 6, d: 5 }, ZT + 1.4, 0.4, 0.4, 0), { tone: "hi", crease: "none" })}</g>`);
  }
  return `<g data-sp="${sp}"${sp === "touch" ? "" : ' style="display:none"'}>${out.join("")}</g>`;
}

function nail() {
  const out = [];
  const c = posOf(TRIG, PITCH.touch), x = c[0] - 3.2, y = c[1] + 3.2;
  out.push(S(k.cylinder(x, y, 0.9, ZT - 30, 36, P, 12), { tone: "hi" }));
  out.push(S(k.cylinder(x, y, 3, ZT + 6, 1.2, P, 20, 0.3), { tone: "hi" }));
  return `<g data-part="nail" style="display:none">${out.join("")}</g>`;
}
function heater() {
  return `<g data-part="heater" class="heater" data-on="false" style="display:none"></g>`;
}

const svg = k.figureSvg({
  width: W, height: H,
  label: "A small pack of twelve cylindrical lithium-ion cells on a tray, one corner cell cut open to show the rolled-up anode, separator and cathode inside. A charger and a battery management board sit behind it.",
  body: [plate(), charger(), pack("touch"), pack("gap"), pack("barrier"), nail(), heater()],
});

const SPOS = Object.fromEntries(Object.keys(PITCH).map((sp) => [sp, [...Array(N).keys()].flatMap((i) => posOf(i, PITCH[sp]))]));
const heaterSvg = Object.fromEntries(Object.keys(PITCH).map((sp) => { const c = posOf(TRIG, PITCH[sp]); return [sp, S(slab({ x: c[0] + RC + 2, y: c[1] - 7, w: 6, d: 14 }, 0, 22, 1, 0.3), { tone: "hi" })]; }));
const nailOff = Object.fromEntries(Object.keys(PITCH).map((sp) => { const a = at([...posOf(TRIG, PITCH.touch), 0]), b = at([...posOf(TRIG, PITCH[sp]), 0]); return [sp, [b[0] - a[0], b[1] - a[1]]]; }));
const DATA = { nailOff, W, H, camera: glCamera(P), P, MODEL, CHEM, N, TRIG, COLS, ROWS, SPOS, heaterSvg, ZT, nailDrop: (() => { const a = at([0, 0, 0]), b = at([0, 0, 28]); return [b[0] - a[0], b[1] - a[1]]; })() };

const FRAG = `
uniform float uLight;
uniform vec2 uPos[${N}];
uniform float uVent[${N}];
uniform float uFire[${N}];
uniform float uSmoke[${N}];
uniform float uShort;
uniform float uHeat;
uniform vec2 uHeatAt;
vec4 inkFor(vec3 seen,float cover){vec3 ab=1.-seen;float a=max(max(ab.r,max(ab.g,ab.b)),cover);return vec4(vec3(a)-ab,a);}
vec4 over(vec4 t,vec4 u){return t+u*(1.-t.a);}
vec4 fireInk(float e,float core){
  vec3 hue=mix(vec3(.55,.16,.06),mix(vec3(1.,.36,.08),vec3(1.,.7,.3),smoothstep(.45,1.,core)),smoothstep(0.,.5,core));
  vec3 c=tonemap(hue*e,1.4);float a=max(c.r,max(c.g,c.b));
  float la=1.-exp(-1.8*e);
  vec3 seen=mix(vec3(1.),mix(vec3(.82,.28,.06),vec3(1.,.78,.4),smoothstep(.6,1.,core)*smoothstep(.5,1.,la)),la);
  return mix(vec4(c,a),inkFor(seen,.9*smoothstep(.75,1.,la)*core)*la,uLight);
}
vec4 gasInk(float h){float a=(1.-exp(-h))*mix(.42,.34,uLight);return vec4(mix(vec3(.86,.88,.9),vec3(.5,.52,.56),uLight)*a,a);}
vec4 smokeInk(float h){float a=(1.-exp(-h))*mix(.6,.5,uLight);return vec4(mix(vec3(.3,.29,.28),vec3(.22,.21,.2),uLight)*a,a);}
vec4 glowInk(vec3 hue,float e){vec3 c=tonemap(hue*e,1.3);float a=max(c.r,max(c.g,c.b));float la=1.-exp(-1.4*e);return mix(vec4(c,a),inkFor(mix(vec3(1.),hue*.8,la),0.)*la,uLight);}
float edgeFade(vec2 vb){return smoothstep(0.,40.,min(min(vb.x,uView.x-vb.x),min(vb.y,uView.y-vb.y)));}
void main(){
  vec2 vb=viewOf(gl_FragCoord.xy);
  vec4 o=vec4(0.);
  float ef=edgeFade(vb);
  float fire=0.,core=0.,gas=0.,smk=0.,sp=0.;
  for(int i=0;i<${N};i++){
    float v=uVent[i],f=uFire[i],s=uSmoke[i];
    if(v+f+s<.005) continue;
    vec2 d=(vb-project(vec3(uPos[i],${(ZT + 1.5).toFixed(1)})))/uK;
    float up=-d.y, x=d.x;
    float n=fbm2(vec2(x*.12,up*.08-uTime*2.4)+float(i)*3.1);
    float wv=2.+up*.32;
    gas+=v*exp(-pow(x/wv,2.))*smoothstep(-1.,3.,up)*exp(-up/40.)*(.5+.8*n)*1.2;
    float wf=1.8+up*.16+3.*f;
    float jet=exp(-pow(x/wf,2.))*smoothstep(-2.,1.,up)*exp(-up/(14.+30.*f))*(.55+.9*n);
    fire+=f*jet*1.6; core+=f*jet*exp(-up/10.);
    float ws=5.+up*.5;
    smk+=s*exp(-pow((x-up*.15)/ws,2.))*smoothstep(4.,16.,up)*exp(-up/70.)*smoothstep(.3,.8,n+.1)*1.3;
    if(f>.05){
      for(int j=0;j<6;j++){
        float h1=hash12(vec2(float(j),float(i)*1.7+3.)),h2=hash12(vec2(float(j)*3.3,float(i)+9.));
        float tt=fract(uTime*.9+h1);
        vec2 sv=vec2((h2-.5)*60.,70.+h1*50.);
        vec2 sp2=vec2(sv.x*tt,sv.y*tt-70.*tt*tt);
        sp+=f*exp(-pow(length(vec2(x,up)-sp2)/.9,2.))*(1.-tt)*1.4;
      }
    }
  }
  o=smokeInk(smk*ef);
  o=over(gasInk(gas*ef),o);
  o=over(fireInk((fire+sp)*ef,clamp(core*1.3/max(fire,1e-3),0.,1.)),o);
  if(uShort>.002){
    vec2 d=(vb-project(vec3(uPos[${TRIG}]+vec2(-1.5,1.5),40.)))/uK;
    o=over(glowInk(vec3(.62,.78,1.),(exp(-pow(length(d)/1.4,2.))*2.2+exp(-pow(length(d)/8.,2.))*.6)*uShort),o);
  }
  if(uHeat>.002){
    vec2 d=(vb-project(vec3(uHeatAt,12.)))/uK;
    o=over(glowInk(vec3(1.,.3,.08),exp(-pow(length(d*vec2(1.,.7))/12.,2.))*.9*uHeat),o);
  }
  o.rgb=min(o.rgb,vec3(o.a));
  float dd=(hash12(gl_FragCoord.xy+uTime)-.5)/255.*smoothstep(0.,1.5/255.,o.a);
  gl_FragColor=max(o+dd,0.);
}`;

const LIVE = `
const D = __DATA__;
const { P, MODEL: M, CHEM } = D;
const stage = document.querySelector(".fx-stage");
const q = (n) => stage.querySelector('[data-part="' + n + '"]');
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const LIGHT = document.body.dataset.theme === "light" ? 1 : 0;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const gl = glLayer({ canvas: stage.querySelector(".fx-gl"), fragment: ${JSON.stringify(FRAG)}, view: [D.W, D.H], camera: D.camera, uniforms: ["uPos", "uVent", "uFire", "uSmoke", "uShort", "uHeat", "uHeatAt"], fixed: { uLight: LIGHT } });
if (gl) stage.setAttribute("data-gl", "");

let chem = "nmc", abuse = "charge", bms = true, sp = "touch", socSet = 1;
let cells = [], soc = 1, charging = false, chargeStopped = "", nailAt = null, heaterOn = false, shortAt = -10, going = false, endAt = null;
let frame = 0, last = 0, now = 0, visible = false, touring = true, slow = false, tourClock = 0, tourStep = -1, actions = [], lastShot = "", stageSaid = 0;
const C = () => CHEM[chem];

function reset() {
  cells = Array.from({ length: D.N }, () => ({ T: M.amb, st: "ok", vented: false, sepGone: false, trAt: null }));
  soc = socSet; charging = false; chargeStopped = ""; nailAt = null; heaterOn = false; going = false; endAt = null; stageSaid = 0;
}
reset();

const ocv = (s) => { const t = C().ocv; if (s <= t[0][0]) return t[0][1]; for (let i = 1; i < t.length; i++) if (s <= t[i][0]) { const [a, va] = t[i - 1], [b, vb] = t[i]; return va + ((vb - va) * (s - a)) / (b - a); } return t[t.length - 1][1]; };
const energy = (s) => clamp(s, 0, 1.6);
const nbrs = (i) => { const c = i % D.COLS, r = Math.floor(i / D.COLS), out = []; if (c > 0) out.push(i - 1); if (c < D.COLS - 1) out.push(i + 1); if (r > 0) out.push(i - D.COLS); if (r < D.ROWS - 1) out.push(i + D.COLS); return out; };
const burning = (c) => c.trAt !== null && now - c.trAt < M.burn;

function go() {
  if (going) return;
  reset(); going = true;
  if (abuse === "charge") charging = true;
  else if (abuse === "nail") nailAt = now;
  else heaterOn = true;
}

function step(dt) {
  const ch = C();
  // abuse on the trigger cell
  const tc = cells[D.TRIG];
  if (charging) {
    if (bms && ocv(soc) >= ch.vmax - 0.002) { charging = false; chargeStopped = "bms"; }
    else soc += M.chargeRate * dt * (soc < 1 ? 3 : 1);
    if (tc.st !== "ok" && tc.st !== "vent") charging = false;
  }
  const qs = new Array(D.N).fill(0);
  if (charging && soc > 1) qs[D.TRIG] += M.oc0 + M.oc * Math.pow(soc - 1, 1.5);
  if (nailAt !== null) { const t = now - nailAt - 0.6; if (t > 0) { qs[D.TRIG] += M.nail * energy(soc) * Math.exp(-t / M.tauNail); if (t < dt * 2) shortAt = now; } }
  if (heaterOn) { qs[D.TRIG] += M.heater; if (tc.trAt !== null) heaterOn = false; }
  const kc = M.couple[sp], kf = M.flame[sp];
  const T0 = cells.map((c) => c.T);
  cells.forEach((c, i) => {
    const e = i === D.TRIG ? energy(soc) : energy(socSet);
    let q = qs[i] - (c.T - M.amb) / M.tauCool;
    for (const j of nbrs(i)) { q += kc * (T0[j] - c.T); if (burning(cells[j])) q += kf; }
    if (c.trAt === null) {
      if (c.T > ch.sei) q += M.selfA * Math.exp((c.T - ch.sei) / M.selfB) * e;
      if (c.T > ch.sep && !c.sepGone) { c.sepGone = true; if (i === D.TRIG) shortAt = now; }
      if (c.sepGone) q += M.short * e;
      if (c.T > ch.vent) c.vented = true;
      c.T += q * dt;
      if (c.T > ch.tr) { c.trAt = now; c.peak = M.amb + (ch.peak - M.amb) * (0.3 + 0.7 * clamp(e, 0, 1.2)); }
    } else if (burning(c)) {
      c.T += (c.peak - c.T) * (1 - Math.exp(-dt / M.tauPeak));
    } else {
      c.T += -(c.T - M.amb) / M.tauDead * dt;
    }
    c.st = c.trAt !== null ? (burning(c) ? "fire" : "dead") : c.vented ? "vent" : "ok";
  });
  const hot = Math.max(...cells.map((c) => c.T));
  const active = cells.some(burning) || charging || heaterOn || (nailAt !== null && now - nailAt < 8);
  if (going && endAt === null && !active && hot < Math.max(90, ch.sei + 10)) endAt = now;
}

const groups = [...Array(D.N).keys()].map((i) => [...stage.querySelectorAll('[data-cell="' + i + '"]')]);
const rolls = [...stage.querySelectorAll(".roll")];
const spG = [...stage.querySelectorAll("[data-sp]")];
const nailG = q("nail"), heatG = q("heater"), chgLamp = q("chg-lamp"), chgT = q("chg-t"), bmsLamp = q("bms-lamp");
const ui = {
  chem: [...document.querySelectorAll("[data-chem]")], abuse: [...document.querySelectorAll("[data-abuse]")], bms: [...document.querySelectorAll("[data-bms]")], sp: [...document.querySelectorAll("[data-spb]")],
  soc: document.querySelector("#soc"), socOut: document.querySelector("#soc-out"),
  tFill: document.querySelector("#t-fill"), tOut: document.querySelector("#t-out"), trMark: document.querySelector("#tr-mark"),
  vFill: document.querySelector("#v-fill"), vOut: document.querySelector("#v-out"), vMark: document.querySelector("#v-mark"),
  stats: document.querySelector("#stats"), go: document.querySelector("#go"), reset: document.querySelector("#reset"), slow: document.querySelector("#slow"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"),
};
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };
const tPct = (t) => (clamp(t / 300, 0, 1) * 100).toFixed(1) + "%";
const vPct = (v) => (clamp((v - 2.5) / 2.7, 0, 1) * 100).toFixed(1) + "%";

function syncUi() {
  const ch = C(), tc = cells[D.TRIG], hot = Math.max(...cells.map((c) => c.T)), v = ocv(soc);
  ui.chem.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.chem === chem)));
  ui.abuse.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.abuse === abuse)));
  ui.bms.forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.bms === "on") === bms)));
  ui.sp.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.spb === sp)));
  ui.soc.value = Math.round(socSet * 100); ui.socOut.textContent = Math.round(socSet * 100) + " %";
  ui.tFill.style.width = tPct(hot); ui.tFill.dataset.state = hot >= ch.tr ? "bad" : hot >= ch.sei ? "warn" : "ok";
  ui.tOut.textContent = Math.round(hot) + " °C";
  ui.trMark.style.left = tPct(ch.tr); ui.trMark.dataset.label = ch.tr + " runaway";
  ui.vFill.style.width = vPct(v); ui.vFill.dataset.state = v > ch.vmax + 0.01 ? "bad" : "ok";
  ui.vOut.textContent = v.toFixed(2) + " V"; ui.vMark.style.left = vPct(ch.vmax); ui.vMark.dataset.label = ch.vmax.toFixed(1) + " V max";
  const nTr = cells.filter((c) => c.trAt !== null).length;
  ui.stats.innerHTML = "cell state of charge <b>" + Math.round(soc * 100) + " %</b> · cells in runaway <b>" + nTr + " of " + D.N + "</b> · vented <b>" + cells.filter((c) => c.vented).length + "</b>";
  ui.go.disabled = going; ui.go.textContent = abuse === "charge" ? "CHARGE IT" : abuse === "nail" ? "NAIL IT" : "HEAT IT";
  ui.slow.setAttribute("aria-pressed", String(slow)); ui.tour.setAttribute("aria-pressed", String(touring));
}

function draw() {
  const ch = C();
  stage.dataset.chem = chem;
  spG.forEach((g) => (g.style.display = g.dataset.sp === sp ? "" : "none"));
  cells.forEach((c, i) => {
    const h = clamp((c.T - M.amb) / 220, 0, 1).toFixed(3);
    for (const g of groups[i]) { g.style.setProperty("--h", h); if (g.dataset.st !== c.st) g.dataset.st = c.st; }
  });
  const tc = cells[D.TRIG];
  const stg = tc.trAt !== null ? (burning(tc) ? 3 : 4) : tc.sepGone ? 2 : tc.T > ch.sei ? 1 : 0;
  rolls.forEach((r) => (r.dataset.stage = String(stg)));
  // the nail going in
  nailG.style.display = nailAt !== null ? "" : "none";
  if (nailAt !== null) { const f = sm(0, 0.6, now - nailAt); const o = D.nailOff[sp]; nailG.setAttribute("transform", "translate(" + (o[0] + D.nailDrop[0] * (1 - f)).toFixed(1) + " " + (o[1] + D.nailDrop[1] * (1 - f)).toFixed(1) + ")"); }
  heatG.style.display = abuse === "heat" ? "" : "none"; heatG.dataset.on = String(heaterOn);
  if (heatG.dataset.sp !== sp) { heatG.innerHTML = D.heaterSvg[sp]; heatG.dataset.sp = sp; }
  chgLamp.dataset.on = String(charging); chgT.textContent = charging ? "charging" : chargeStopped === "bms" ? "full" : "idle";
  bmsLamp.dataset.on = String(bms);
  if (gl && !window.__noGL) {
    const pos = D.SPOS[sp];
    const ti = D.TRIG;
    gl.draw({
      uPos: pos,
      uVent: cells.map((c) => (c.vented && c.trAt === null ? 1 : 0)),
      uFire: cells.map((c) => (c.trAt === null ? 0 : sm(0, 0.15, now - c.trAt) * (1 - sm(M.burn - 0.8, M.burn, now - c.trAt)))),
      uSmoke: cells.map((c) => (c.trAt === null ? (c.vented ? 0.2 : 0) : sm(0.5, 2, now - c.trAt) * Math.exp(-Math.max(0, now - c.trAt - M.burn) / 8))),
      uShort: Math.exp(-(now - shortAt) / 0.18) * (now - shortAt < 1.2 ? 1 : 0),
      uHeat: heaterOn ? 1 : 0, uHeatAt: [pos[ti * 2] + 14, pos[ti * 2 + 1]],
    }, now);
  }
  const hot = Math.max(...cells.map((c) => c.T)), nTr = cells.filter((c) => c.trAt !== null).length;
  const text = C().name + " · " + Math.round(socSet * 100) + " % · hottest " + Math.round(hot) + " °C · " + ocv(soc).toFixed(2) + " V" + (nTr ? " · " + nTr + " in runaway" : "");
  if (readout.textContent !== text) readout.textContent = text;
}

function story() {
  const ch = C(), tc = cells[D.TRIG], nTr = cells.filter((c) => c.trAt !== null).length, hot = Math.max(...cells.map((c) => c.T));
  if (!going && endAt === null) return say(abuse === "charge" ? "Charge the corner cell. It's the one the pack drifted out of balance on, so it fills first." + (bms ? " The BMS is watching its voltage." : " The BMS is dead.") : abuse === "nail" ? "Put a nail through the corner cell: an instant internal short." : "Cook the corner cell with a heater pad. Watch the stages go past.");
  if (chargeStopped === "bms" && tc.T < ch.sei) return say("The BMS saw " + ch.vmax.toFixed(1) + " V on that cell and stopped the charge. Nothing happens. That's its whole job, and it's the only one of these three it can do anything about.");
  if (nTr > 1) return say(nTr + " cells gone. Each one that goes heats its neighbours: " + (sp === "touch" ? "touching cells, so the heat goes straight across and it walks through the pack." : sp === "gap" ? "the gap slows it right down, which buys time to get out, but a full NMC cell still takes its neighbours." : "the barrier is soaking it up.") + (nTr === D.N ? " The whole pack's gone." : ""));
  if (tc.trAt !== null && burning(tc)) return say("Thermal runaway, " + Math.round(tc.T) + " °C. The cathode lets go of its oxygen and the electrolyte burns with it, so it doesn't need air and you can't smother it. All the energy in the cell comes out in seconds.");
  const warm = Math.max(M.amb, ...cells.filter((c) => c.trAt === null).map((c) => c.T));
  if (tc.trAt !== null && nTr === 1 && warm > ch.sei) return say("One cell gone so far. Its neighbours are at " + Math.round(warm) + " °C and climbing" + (sp === "gap" ? ": the gap is slowing the heat down, not stopping it." : "."));
  if (tc.trAt !== null) return say(nTr === 1 ? "One cell gone, and it stopped there. " + (sp === "barrier" ? "The barrier did its job." : sp === "gap" ? "The gap was enough this time." : chem === "lfp" ? "LFP runs away later and cooler, so the neighbours never got there." : socSet < 0.5 ? "There wasn't enough charge in it to cook the neighbours." : "Lucky.") : nTr + " cells gone.");
  if (endAt !== null) return say("It cooled down without running away: " + (socSet < 0.5 ? "at " + Math.round(socSet * 100) + " % there wasn't enough energy in it to keep the reactions going. That's why cells ship at 30 % or less." : "it never got hot enough to keep itself going."));
  if (tc.vented) return say("The vent's popped at about " + ch.vent + " °C: electrolyte vapour and gas, flammable, and it's still climbing (" + Math.round(tc.T) + " °C).");
  if (tc.sepGone) return say("The separator's melted (about " + ch.sep + " °C), so the anode and cathode touch: an internal short dumping the cell's own energy into itself. " + Math.round(tc.T) + " °C.");
  if (tc.T > ch.sei) return say("Past about " + ch.sei + " °C the SEI, the film protecting the anode, starts breaking down. The electrolyte attacks the graphite and that makes more heat. " + Math.round(tc.T) + " °C.");
  if (charging && soc > 1) return say("Overcharging: " + ocv(soc).toFixed(2) + " V, " + Math.round(soc * 100) + " %. Lithium is plating on the anode and the cathode is being stripped further than it's built for, and that makes heat.");
  if (charging) return say("Charging: " + ocv(soc).toFixed(2) + " V, " + Math.round(soc * 100) + " %.");
  if (endAt !== null) return say("It cooled down without running away: " + (socSet < 0.5 ? "at " + Math.round(socSet * 100) + " % there wasn't enough energy in it to keep the reactions going. That's why cells ship at 30 % or less." : "it never got hot enough to keep itself going."));
  return say(Math.round(tc.T) + " °C.");
}

const TOUR = [
  { chem: "nmc", abuse: "charge", bms: true, sp: "touch", soc: 0.8, end: 9 },
  { chem: "nmc", abuse: "charge", bms: false, sp: "touch", soc: 0.8, end: 44 },
  { chem: "nmc", abuse: "nail", bms: true, sp: "barrier", soc: 1, end: 20 },
  { chem: "nmc", abuse: "nail", bms: true, sp: "touch", soc: 0.3, end: 14 },
  { chem: "lfp", abuse: "nail", bms: true, sp: "touch", soc: 1, end: 20 },
  { chem: "nmc", abuse: "heat", bms: true, sp: "barrier", soc: 1, end: 32 },
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
      chem = s.chem; abuse = s.abuse; bms = s.bms; sp = s.sp; socSet = s.soc; reset();
      actions = [[tourClock + 1.2, "go"], [tourClock + s.end, "end"]];
    }
    while (actions.length && tourClock >= actions[0][0]) {
      const a = actions.shift()[1];
      if (a === "go") go(); else if (a === "end") actions = [];
    }
  }
  const n = 10;
  for (let i = 0; i < n; i++) step(sdt / n);
  draw(); syncUi(); story();
  const idle = !touring && !going && cells.every((c) => c.T < M.amb + 3);
  if (going && endAt !== null && now - endAt > 2.5 && !touring) going = false;
  frame = visible && !idle ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { touring = false; actions = []; };
const guard = (fn, during = false) => (...a) => { takeOver(); if (going && !during) { going = false; reset(); } fn(...a); draw(); syncUi(); story(); run(); };
const setChem = guard((v) => { chem = v; reset(); });
const setAbuse = guard((v) => { abuse = v; reset(); });
const setBms = guard((v) => { bms = v; });
const setSp = guard((v) => { sp = v; reset(); });
const setSoc = guard((v) => { socSet = v; reset(); });
const start = guard(() => go());
const doReset = guard(() => reset());
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;

ui.chem.forEach((b) => b.addEventListener("click", () => setChem(b.dataset.chem)));
ui.abuse.forEach((b) => b.addEventListener("click", () => setAbuse(b.dataset.abuse)));
ui.bms.forEach((b) => b.addEventListener("click", () => setBms(b.dataset.bms === "on")));
ui.sp.forEach((b) => b.addEventListener("click", () => setSp(b.dataset.spb)));
ui.soc.addEventListener("input", () => setSoc(+ui.soc.value / 100));
ui.go.addEventListener("click", start);
ui.reset.addEventListener("click", doReset);
ui.slow.addEventListener("click", () => { slow = !slow; syncUi(); run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; tourClock = 0; actions = []; } syncUi(); run(); });
stage.addEventListener("click", start);
stage.addEventListener("keydown", (ev) => {
  const map = { " ": start, Enter: start, r: doReset, l: () => setChem(chem === "nmc" ? "lfp" : "nmc"), b: () => setBms(!bms), "1": () => setAbuse("charge"), "2": () => setAbuse("nail"), "3": () => setAbuse("heat"), s: () => { slow = !slow; syncUi(); run(); } };
  if (map[ev.key]) { ev.preventDefault(); map[ev.key](); }
});
window.__fig = { freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
draw(); syncUi(); story();
`;

const CSS = `.fx-stage{position:relative;cursor:pointer}
.fx-layer{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.fx-gl{display:block}
body[data-theme="dark"] .fx-gl{mix-blend-mode:screen}
.iso-plate{overflow:hidden}
.iso-pipe{fill:none;stroke:#2b2b2b;stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
body[data-theme="light"] .iso-pipe{stroke:#4a4a4a}
.iso-pipe-out{fill:none;stroke:var(--anatomy-mid);stroke-width:3;stroke-linejoin:round;stroke-linecap:round}
.fx-stage{--wrap:#2f6db5;--wrap-t:#4c86c9}.fx-stage[data-chem="lfp"]{--wrap:#3c8a62;--wrap-t:#58a57d}
.cell .iso-fill,.cell .iso-shade{fill:color-mix(in srgb,var(--wrap),#ff5a1a calc(var(--h,0)*75%))}
.cell .iso-top{fill:color-mix(in srgb,var(--wrap-t),#ff7a2a calc(var(--h,0)*75%))}
.cell .cap .iso-fill,.cell .cap .iso-shade,.cell .cap .iso-top{fill:color-mix(in srgb,#c9ccd0,#ff7a2a calc(var(--h,0)*60%))}
.cell[data-st="dead"] .iso-fill,.cell[data-st="dead"] .iso-shade,.cell[data-st="dead"] .iso-top{fill:color-mix(in srgb,#2a2420,#ff5a1a calc(var(--h,0)*60%))}
.cell[data-st="dead"] .cap .iso-fill,.cell[data-st="dead"] .cap .iso-top{fill:#1a1614}
.roll-bg{fill:#3a3d42}.mandrel{fill:#1a1a1a}
.an{fill:#b0643a}.ca{fill:#55595f}.sep{fill:#f2f2ee}
.roll[data-stage="1"] .an{fill:#7a4a30}
.roll[data-stage="2"] .an{fill:#6a3a22}.roll[data-stage="2"] .sep{fill:#5a4a40}
.roll[data-stage="3"] .an,.roll[data-stage="3"] .ca,.roll[data-stage="3"] .sep,.roll[data-stage="3"] .roll-bg{fill:#ff8a3a}
.roll[data-stage="4"] .an,.roll[data-stage="4"] .ca,.roll[data-stage="4"] .sep,.roll[data-stage="4"] .roll-bg{fill:#1d1a18}
.ni .iso-fill,.ni .iso-shade,.ni .iso-top{fill:#c8ccd0}
.mica .iso-fill,.mica .iso-shade,.mica .iso-top{fill:rgba(225,205,160,.85)}
.pcb .iso-fill,.pcb .iso-shade,.pcb .iso-top{fill:#1f6a3c}
.heater .iso-fill,.heater .iso-shade,.heater .iso-top{fill:#8a8f96}.heater[data-on="true"] .iso-fill,.heater[data-on="true"] .iso-top{fill:#ff6a2a}
.lamp{stroke:var(--anatomy-mid);stroke-width:.3;fill:var(--anatomy-paper)}.lamp[data-on="true"]{fill:#3ddc84}
.ctl{display:grid;gap:12px;margin:14px 0 6px;font-family:var(--anatomy-mono);font-size:12px;color:var(--anatomy-mid)}
.ctl-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ctl-label{min-width:72px;text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:var(--anatomy-lo)}
.ctl button{font:inherit;color:var(--anatomy-mid);background:transparent;border:1px solid var(--anatomy-lo);border-radius:6px;padding:7px 10px;cursor:pointer;line-height:1.15;text-align:left;min-height:36px}
.ctl button:hover{border-color:var(--anatomy-mid)}
.ctl button[aria-pressed="true"]{color:var(--anatomy-lit);border-color:var(--anatomy-lit)}
.ctl button small{display:block;font-size:10px;color:var(--anatomy-lo)}
.ctl #go{font-weight:600;letter-spacing:.06em;min-width:110px;text-align:center;border-color:#ff6a3d;color:#ff6a3d}
.ctl #go:disabled{opacity:.4;cursor:default}
.slide{position:relative;flex:1;min-width:110px}
.slide input{width:100%;accent-color:var(--anatomy-lit);margin:0}
.ctl output{min-width:72px;text-align:right;color:var(--anatomy-hi,var(--anatomy-mid))}
.meter{position:relative;flex:1;min-width:110px;height:10px;margin-top:14px;border:1px solid var(--anatomy-lo);border-radius:5px}
.meter .fill{position:absolute;left:0;top:0;bottom:0;border-radius:4px;transition:width .1s;background:var(--anatomy-mid)}
.meter .fill[data-state="ok"]{background:#3ddc84}.meter .fill[data-state="warn"]{background:#ffb347}.meter .fill[data-state="bad"]{background:#ff5a2a}
.mark{position:absolute;top:-14px;bottom:-3px;width:0;border-left:1px dashed var(--anatomy-lit);pointer-events:none}
.mark::after{content:attr(data-label);position:absolute;top:0;left:4px;font-size:10px;white-space:nowrap;color:var(--anatomy-lit)}
.mark.red{border-left-color:#ff6a3d}.mark.red::after{color:#ff6a3d}
.mark.quiet::after{content:none}
#stats{font-size:12px;color:var(--anatomy-mid);line-height:1.5}#stats b{color:var(--anatomy-hi,var(--anatomy-mid));font-weight:600}
#shot{min-height:3.6em;font-size:12px;line-height:1.4}
@media (max-width:520px){.ctl-label{min-width:52px}.ctl button{padding:7px 8px}.ctl output{min-width:60px}.ctl button small{display:none}}`;

const stageHtml = `<div class="iso-stage fx-stage" tabindex="0" role="group" aria-label="Lithium pack: space abuses the corner cell, 1 2 3 pick the abuse, L switches chemistry, B the BMS, R resets">${svg}<canvas class="fx-layer fx-gl" aria-hidden="true"></canvas></div>`;

const CONTROLS = `<div class="ctl" role="group" aria-label="Test controls">
  <div class="ctl-row"><span class="ctl-label">Chemistry</span><button type="button" data-chem="nmc" aria-pressed="true">NMC<small>phones, laptops, most EVs</small></button><button type="button" data-chem="lfp" aria-pressed="false">LFP<small>home batteries, some EVs</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Abuse</span><button type="button" data-abuse="charge" aria-pressed="true">Overcharge</button><button type="button" data-abuse="nail" aria-pressed="false">Nail</button><button type="button" data-abuse="heat" aria-pressed="false">Heat</button></div>
  <div class="ctl-row"><span class="ctl-label">BMS</span><button type="button" data-bms="on" aria-pressed="true">Working</button><button type="button" data-bms="off" aria-pressed="false">Dead</button></div>
  <div class="ctl-row"><span class="ctl-label">Spacing</span><button type="button" data-spb="touch" aria-pressed="true">Touching</button><button type="button" data-spb="gap" aria-pressed="false">Gapped</button><button type="button" data-spb="barrier" aria-pressed="false">Barrier<small>mica sheets</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Charge</span><div class="slide"><input id="soc" type="range" min="10" max="100" step="5" value="100" aria-label="State of charge"></div><output id="soc-out">100 %</output></div>
  <div class="ctl-row"><span class="ctl-label">Hottest</span><div class="meter"><span id="t-fill" class="fill"></span><span class="mark quiet" style="left:${(80 / 300 * 100).toFixed(1)}%"></span><span class="mark" style="left:${(130 / 300 * 100).toFixed(1)}%" data-label="130"></span><span id="tr-mark" class="mark red" style="left:60%" data-label="180 runaway"></span></div><output id="t-out">25 °C</output></div>
  <div class="ctl-row"><span class="ctl-label">Cell volts</span><div class="meter"><span id="v-fill" class="fill"></span><span id="v-mark" class="mark red" style="left:50%" data-label="4.2 V max"></span></div><output id="v-out">4.20 V</output></div>
  <div class="ctl-row"><span class="ctl-label">Pack</span><span id="stats"></span></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="go">CHARGE IT</button><button type="button" id="reset">Reset</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
  <div id="shot" aria-live="polite"></div>
</div>`;

const card = k.plateHtml({
  fig: "Fig 12",
  title: "Lithium thermal runaway",
  hint: "Tap: do it",
  readout: "",
  keys: [
    { mark: "lit", label: "Cell temperature on the cans; vent gas, the runaway flame and smoke" },
    { mark: "raised", label: "Twelve 18650 cells, one cut open: anode (copper), separator (white), cathode (grey)" },
  ],
  caption: "A lithium-ion cell is a rolled-up sandwich: anode, separator, cathode, separator, soaked in a flammable electrolyte. Heat it past about 80 °C and the film protecting the anode starts breaking down and making its own heat. At about 130 °C the separator melts and the electrodes short inside the cell. Somewhere around 150 to 250 °C, depending on the chemistry, the cathode starts giving up oxygen and the whole lot runs away: it burns without air and all its energy comes out in seconds. Overcharging, a nail or plain heat will all get it there. The BMS can stop the overcharge and nothing else. What decides how bad it gets is the chemistry, how much charge is in it, and whether one cell going takes its neighbours with it.",
  body: stageHtml,
});

const other = theme === "light" ? ["index.html", "Dark version"] : ["light.html", "Light version"];
const FOOT = `<p style="font-family:var(--anatomy-mono);font-size:11px;color:var(--anatomy-lo);margin:28px 0 8px;line-height:1.6">A toy, not a battery safety study. Roughly real, and it varies a lot from cell to cell: SEI breakdown from about 70 to 90 °C, PE separators melting around 130 to 140 °C, runaway around 150 to 200 °C for nickel and cobalt cathodes and about 250 °C for LFP, hot spots near 800 °C, 4.2 V max for NMC and about 3.6 V for LFP, and less charge meaning less energy. Made up: every rate, the heat model, how it spreads, the overcharge curve and the timings, which are squashed so you don't wait an hour.<br>Built with <a href="https://github.com/wheresryan22/anatomy" style="color:inherit">Anatomy</a> by Ryan (MIT). · <a href="${other[0]}" style="color:inherit">${other[1]}</a> · <a href="../" style="color:inherit">More figures</a> · <a href="https://github.com/Dizzyfer/Anatomy/tree/main/lithium" style="color:inherit">Source</a></p>`;
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "Lithium thermal runaway", theme, body: `<style>${CSS}</style>${card.replace("<figcaption", CONTROLS + "<figcaption")}${FOOT}`, script: kitScript() + glScript() + LIVE.replace("__DATA__", JSON.stringify(DATA)), width: 700 }));
console.log("wrote", name);
