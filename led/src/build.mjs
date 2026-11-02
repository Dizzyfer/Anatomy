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

// Anchored on the Cree XLamp XP-G datasheet: Vf 2.9 V typ at 350 mA / 25 °C, 1500 mA max, Rth j-sp 4 °C/W,
// Tj max 150 °C, Vf tempco −2.1 mV/°C. The I-V fit, efficiency curve and the heat path below the solder point are toy values.
const MODEL = {
  v0: 2.795, slope: 0.077, rs: 0.3, i0: 0.35, tempco: -0.0021, iMax: 1.5, tjMax: 150, tjDead: 200, iDead: 2.4,
  rJsp: 4, rBoard: 1.5, tim: { paste: 0.5, none: 14 }, hs: { proper: 6, small: 18, none: 45 },
  wpe0: 0.47, droop: 2.0, wpeT: 0.002, ler: 330, tau: 1.8,
  bins: { low: -0.15, typ: 0, high: 0.15 },
};

const PLATE = { x: -96, y: -80, w: 192, d: 160, r: 8 };
const PLATE_H = 10, FOOT_H = 4;
const HS = { x: -60, y: -50, w: 120, d: 100 };
const Z_HS = 24, Z_HSB = 30;
const BOARD = { x: -34, y: -34, w: 68, d: 68 };
const Z_TIM = 30.5, Z_AL = 31.9, Z_DI = 32.3, Z_CU = 32.7, Z_SM = 33.0, Z_PAD = 33.5;
const PKG = { x: -16, y: -16, w: 32, d: 32 };
const Z_PKG = 37;
const DIE = { x: -8, y: -8, w: 16, d: 16 };
const Z_DIE = 41, Z_MQW0 = 38.6, Z_MQW1 = 39.2, Z_PH = 42;
const DOME_R = 15;

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [0, 0, Z_PKG + DOME_R + 50]],
  W, H, { pad: 20, azimuth: 45, elevation: 30 },
);

const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const Dt = (points, style) => k.dotsSvg(points, style);
const depth2 = ([x, y]) => k.depthOf([x, y, 0], P);
const byDepth = (pts) => [...pts].sort((a, b) => depth2(a) - depth2(b));
const slab = (plan, z, h, r = 1.2, bevel = 0.5) => k.slabOf({ r, ...plan }, z, h, P, 4, bevel);
const lRing = ({ x, y, w, d }) => [[x, y], [x + w, y], [x + w, 0], [0, 0], [0, y + d], [x, y + d]];
const lSolid = (plan, z, h) => k.extrude(lRing(plan), z, h, P, { convex: false });
const cls = (svg, c) => `<g class="${c}">${svg}</g>`;

function plate() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 20))) {
    out.push(S(k.cylinder(x, y, 6, -PLATE_H - FOOT_H, 1.4, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 4.6, -PLATE_H - FOOT_H + 1.4, FOOT_H - 1.4, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid", inner: L(k.sideSeam(PLATE, -PLATE_H / 2, P), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 9);
  out.push(Dt(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  return out.join("");
}

// three heatsink options, toggled at runtime; the top of the base is always at Z_HSB
function heatsink(kind) {
  const out = [];
  out.push(`<path class="iso-halo" d="${k.haloOf({ ...k.insetPlan({ ...HS, r: 2 }, -4) }, 0, 0.1, P)}"/>`);
  if (kind === "none") {
    // the board just sits on four plastic standoffs
    for (const [x, y] of byDepth(k.corners(BOARD, 6))) if (!(x > 0 && y > 0)) out.push(S(k.cylinder(x, y, 3, 0, Z_TIM, P, 20), { tone: "lo" }));
    return `<g data-hs="none">${out.join("")}</g>`;
  }
  const finTop = Z_HS, finBot = kind === "proper" ? 0 : 14, n = kind === "proper" ? 13 : 7;
  if (kind === "small") for (const [x, y] of byDepth(k.corners(HS, 6))) if (!(x > 0 && y > 0)) out.push(S(k.cylinder(x, y, 2.6, 0, finBot, P, 18), { tone: "lo" }));
  const pitch = HS.w / n;
  const fins = [];
  for (let i = 0; i < n; i++) {
    const fx = HS.x + i * pitch + pitch / 2 - 1.2;
    const plan = fx + 2.4 > 0 ? { x: fx, y: HS.y, w: 2.4, d: -HS.y } : { x: fx, y: HS.y, w: 2.4, d: HS.d };
    fins.push(plan);
  }
  for (const f of fins.sort((a, b) => depth2([a.x, a.y + a.d / 2]) - depth2([b.x, b.y + b.d / 2]))) out.push(S(slab(f, finBot, finTop - finBot, 0.3, 0.2), { tone: "mid", inner: L(k.segment([f.x + f.w, f.y, finBot + 4], [f.x + f.w, f.y + f.d, finBot + 4], P), { tone: "faint" }) }));
  out.push(S(lSolid(HS, Z_HS, Z_HSB - Z_HS), { tone: "mid" }));
  return `<g data-hs="${kind}">${out.join("")}</g>`;
}

function stack() {
  const out = [];
  // thermal paste, or the lack of it
  out.push(`<g data-tim="paste">` + cls(S(lSolid(BOARD, Z_HSB, Z_TIM - Z_HSB), { tone: "lo", crease: "none" }), "tim") + `</g>`);
  out.push(`<g data-tim="none" style="display:none">` + L([[-26, -20], [-12, 14], [-22, 24], [8, -26], [-30, 4]].map(([x, y]) => k.ring(x, y, 2.4, Z_HSB + 0.05, P, 14)).join(""), { tone: "lo" }) + `</g>`);
  // MCPCB: aluminium, dielectric, copper, solder mask
  out.push(S(lSolid(BOARD, Z_TIM, Z_AL - Z_TIM), { tone: "mid" }));
  out.push(cls(S(lSolid(BOARD, Z_AL, Z_DI - Z_AL), { tone: "lo", crease: "none" }), "dielectric"));
  out.push(cls(S(lSolid({ x: -26, y: -26, w: 52, d: 52 }, Z_DI, Z_CU - Z_DI), { tone: "mid", crease: "none" }), "copper"));
  out.push(cls(S(lSolid(BOARD, Z_CU, Z_SM - Z_CU), { tone: "hi", crease: "faint" }), "mask"));
  // board screws and pads
  for (const [x, y] of [[-27, -27], [-27, 27]]) { out.push(S(k.cylinder(x, y, 2.8, Z_SM, 1.2, P, 20), { tone: "mid" })); out.push(L(k.segment([x - 1.6, y, Z_SM + 1.2], [x + 1.6, y, Z_SM + 1.2], P), { tone: "lo" })); }
  out.push(cls(S(slab({ x: -30, y: -6, w: 8, d: 12 }, Z_SM, 0.4, 0.6, 0), { tone: "mid", crease: "none" }), "copper"));
  out.push(k.faceTextSvg(k.topMatrix([-29, -9], Z_SM, P, "x"), "+", { size: 4, tone: "mid" }));
  // thermal pad / solder under the package
  out.push(cls(S(lSolid({ x: -13, y: -13, w: 26, d: 26 }, Z_SM, Z_PAD - Z_SM), { tone: "mid", crease: "none" }), "solder"));
  // ceramic package
  out.push(S(lSolid(PKG, Z_PAD, Z_PKG - Z_PAD), { tone: "hi" }));
  out.push(L(k.onTop(lRing(k.insetPlan({ ...PKG, r: 0 }, 2.5)), Z_PKG, P, true), { tone: "faint" }));
  // die: n-GaN, quantum wells, p-GaN
  out.push(cls(S(lSolid(DIE, Z_PKG, Z_MQW0 - Z_PKG), { tone: "mid", crease: "none" }), "ngan"));
  out.push(cls(S(lSolid(DIE, Z_MQW0, Z_MQW1 - Z_MQW0), { tone: "mid", crease: "none" }), "mqw"));
  out.push(cls(S(lSolid(DIE, Z_MQW1, Z_DIE - Z_MQW1), { tone: "mid", crease: "none" }), "pgan"));
  // phosphor
  out.push(`<g data-part="phosphor">` + cls(S(lSolid({ x: -9, y: -9, w: 18, d: 18 }, Z_DIE, Z_PH - Z_DIE), { tone: "mid", crease: "none" }), "phosphor") + `</g>`);
  // bond wires (gold) from the die to the package pads
  const wire = (a, b) => { const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.max(a[2], b[2]) + 4]; const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(at([(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * m[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * m[1] + t * t * b[1], (1 - t) ** 2 * a[2] + 2 * (1 - t) * t * m[2] + t * t * b[2]])); } return k.pathOf(pts); };
  out.push(`<path data-part="bond" class="bond" d="${wire([-6, -6, Z_PH], [-13, -13, Z_PKG])}${wire([-6, 6, Z_PH], [-13, 13, Z_PKG])}"/>`);
  // the carriers, drawn in the plane of the y-cut through the die (local x along +x, local y downwards)
  out.push(`<g data-part="carriers" transform="${k.sideMatrix([0, 0.06], Z_DIE, P, "left")}"></g>`);
  return out.join("");
}

function dome() {
  // a clear silicone lens; transparent, so it's drawn whole over the cut
  const c = at([0, 0, Z_PH]);
  const kk = k.cameraOf(P).k;
  const R = DOME_R * kk;
  const base = [];
  for (let i = 0; i <= 48; i++) { const a = Math.PI * i / 48; base.push(at([Math.cos(a) * DOME_R, -Math.sin(a) * 0 + Math.sin(a) * DOME_R * 0, Z_PH])); }
  // silhouette: upper half circle plus the near half of the base ellipse
  const ell = [];
  for (let i = 0; i <= 64; i++) { const a = (i / 64) * Math.PI * 2; ell.push(at([Math.cos(a) * DOME_R, Math.sin(a) * DOME_R, Z_PH])); }
  const top = `M${(c[0] - R).toFixed(1)} ${c[1].toFixed(1)}A${R.toFixed(1)} ${R.toFixed(1)} 0 0 1 ${(c[0] + R).toFixed(1)} ${c[1].toFixed(1)}`;
  return `<g data-part="dome"><path class="lens" d="${top}${ell.filter((p) => p[1] >= c[1] - 0.01).map((p, i) => (i ? "L" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join("")}Z"/><path class="lens-edge" d="${top}"/><path class="lens-edge faint" d="${k.pathOf(ell, true)}"/><path class="lens-glint" d="M${(c[0] - R * 0.45).toFixed(1)} ${(c[1] - R * 0.62).toFixed(1)}A${(R * 0.7).toFixed(1)} ${(R * 0.7).toFixed(1)} 0 0 1 ${(c[0] + R * 0.1).toFixed(1)} ${(c[1] - R * 0.86).toFixed(1)}"/></g>`;
}

function driver() {
  const out = [];
  const d = { x: -88, y: 34, w: 30, d: 34 };
  out.push(`<path class="iso-halo" d="${k.haloOf({ ...k.insetPlan({ ...d, r: 2 }, -3) }, 0, 0.1, P)}"/>`);
  out.push(S(slab(d, 0, 12, 2, 0.6), { tone: "hi", inner: L(k.sideSeam({ ...d, r: 2 }, 6, P), { tone: "faint" }) }));
  out.push(`<g data-part="drv-label">${k.faceTextSvg(k.topMatrix([d.x + 3, d.y + 9], 12, P, "x"), "CC DRIVER", { size: 3.4, tone: "mid" })}</g>`);
  out.push(`<g data-part="drv-val">${k.faceTextSvg(k.topMatrix([d.x + 3, d.y + 16], 12, P, "x"), "700 mA", { size: 4.6, tone: "hi" })}</g>`);
  const wires = [[[d.x + d.w, d.y + 8, 4], [-40, 10, 1], [-30, -4, Z_SM + 0.5]], [[d.x + d.w, d.y + 14, 4], [-42, 18, 1], [-30, 4, Z_SM + 0.5]]];
  out.push(wires.map((w, i) => `<path class="iso-line wire-${i ? "neg" : "pos"}" d="${k.pathOf(w.map(at))}"/>`).join(""));
  return out.join("");
}

const START = { mode: "cc", ma: 700, volts: 3.05, bin: "typ", hs: "proper", tim: "paste", amb: 25 };
const fig = k.figureSvg({
  width: W, height: H,
  label: "A high-power white LED cut open on its metal-core board and heatsink, with the driver beside it. In section: aluminium heatsink, thermal paste, the board's aluminium, dielectric and copper, the solder pad, the ceramic package, the die with its quantum wells, the phosphor and a clear silicone dome.",
  body: [plate(), driver(), heatsink("proper"), heatsink("small"), heatsink("none"), stack(), dome()],
});

const DATA = { W, H, camera: glCamera(P), P, MODEL, start: START, Z_DIE, Z_PH, Z_PKG, Z_PAD, Z_TIM, Z_HSB, Z_MQW0, Z_MQW1, DIE, DOME_R, dieAt: at([3, 0, 39]) };

const GLSL = `
uniform float uLight;
uniform float uFlux;
uniform float uBrown;
uniform float uPop;
uniform float uTherm;
uniform vec4 uTemps;
uniform float uSmoke;
uniform float uAmb;
vec4 inkFor(vec3 seen,float cover){vec3 ab=1.-seen;float a=max(max(ab.r,max(ab.g,ab.b)),cover);return vec4(vec3(a)-ab,a);}
vec4 over(vec4 t,vec4 u){return t+u*(1.-t.a);}
vec3 ironbow(float t){t=clamp(t,0.,1.);return clamp(vec3(1.5*t-.05,2.2*t-1.1,(t<.35)?(.8*t+.25):(1.6-3.*t)+max(0.,6.*t-5.)),0.,1.);}
vec4 lightInk(float e,vec3 hue){
  vec3 c=tonemap(hue*e,1.2);float a=max(c.r,max(c.g,c.b));
  float la=1.-exp(-1.2*e);
  vec3 seen=mix(vec3(1.),mix(vec3(.96,.9,.62),hue*.8,.4),la);
  return mix(vec4(c,a)*.95,inkFor(seen,0.)*la*.55,uLight);
}
vec4 arcInk(float e){
  vec3 c=tonemap(vec3(.62,.78,1.)*e,1.6)+tonemap(vec3(1.)*max(0.,e-1.2),1.);
  c=min(c,vec3(1.));float a=max(c.r,max(c.g,c.b));
  float la=1.-exp(-1.6*e);
  vec3 seen=mix(vec3(1.),mix(vec3(.18,.3,.85),vec3(.75,.85,1.),smoothstep(1.,2.,e)),la);
  return mix(vec4(c,a),inkFor(seen,.85*smoothstep(1.2,2.2,e))*la,uLight);
}
float edgeFade(vec2 vb){return smoothstep(0.,60.,min(min(vb.x,uView.x-vb.x),min(vb.y,uView.y-vb.y)));}
float tempAt(float z){
  // die → solder point → board → heatsink, piecewise
  if(z>${Z_PKG.toFixed(1)}) return uTemps.x;
  if(z>${Z_PAD.toFixed(1)}) return mix(uTemps.y,uTemps.x,(z-${Z_PAD.toFixed(1)})/${(Z_PKG - Z_PAD).toFixed(1)});
  if(z>${Z_TIM.toFixed(1)}) return mix(uTemps.z,uTemps.y,(z-${Z_TIM.toFixed(1)})/${(Z_PAD - Z_TIM).toFixed(1)});
  return mix(uTemps.w,uTemps.z,clamp(z/${Z_TIM.toFixed(1)},0.,1.));
}
float halfW(float z){
  if(z>${Z_PH.toFixed(1)}) return 0.;
  if(z>${Z_PKG.toFixed(1)}) return ${(DIE.w / 2).toFixed(1)};
  if(z>${Z_PAD.toFixed(1)}) return ${(PKG.w / 2).toFixed(1)};
  if(z>${Z_HSB.toFixed(1)}) return ${(BOARD.w / 2).toFixed(1)};
  return ${(HS.w / 2).toFixed(1)};
}
void main(){
  vec2 vb=viewOf(gl_FragCoord.xy);
  vec4 o=vec4(0.);
  // thermal camera on the two cut faces
  if(uTherm>.002){
    float px=pixelOf()/uCam.w;
    for(int f=0;f<2;f++){
      vec3 p=f==0?onWallY(vb,.05):onWallX(vb,.05);
      float s=f==0?p.x:p.y;
      float w=halfW(p.z);
      float m=smoothstep(-.6*px,.6*px,s)*(1.-smoothstep(w-.6*px,w+.6*px,s))*smoothstep(-.5,.5,p.z)*(p.z<${Z_HS.toFixed(1)}?.55:1.);
      float t=(tempAt(p.z)-uAmb)/max(30.,uTemps.x-uAmb);
      vec3 col=ironbow(t);
      o=over(vec4(col*m*.82*uTherm,m*.82*uTherm),o);
    }
  }
  // light out of the dome: a wide cone, white going amber as the phosphor browns
  if(uFlux>.002){
    vec3 hue=mix(vec3(1.,.97,.9),vec3(1.,.72,.38),uBrown);
    float e=0.;
    for(int i=0;i<12;i++){
      float z=${Z_PH.toFixed(1)}+4.+float(i)*5.;
      vec3 p=onFloor(vb,z);
      float r=length(p.xy), rad=6.+(z-${Z_PH.toFixed(1)})*.9;
      e+=exp(-pow(r/rad,2.))*.07*(1.-smoothstep(40.,62.,z-${Z_PH.toFixed(1)}));
    }
    vec2 c=project(vec3(0.,0.,${(Z_PH + 3).toFixed(1)}));
    float core=exp(-pow(length(vb-c)/uK/7.,2.))*.9;
    o=over(lightInk((e+core)*uFlux*edgeFade(vb),hue),o);
  }
  if(uPop>.002){
    float d=length(vb-project(vec3(-9.,-9.,${(Z_PH + 2).toFixed(1)})))/uK;
    o=over(arcInk((exp(-pow(d/.8,2.))*2.4+exp(-pow(d/6.,2.))*.9)*uPop),o);
  }
  if(uSmoke>.002){
    float s=0.;
    for(int i=0;i<8;i++){
      float z=${Z_PH.toFixed(1)}+2.+float(i)*5.;
      vec3 p=onFloor(vb,z);
      s+=exp(-pow(length(p.xy-vec2(sin(z*.1)*3.,0.))/(2.+z*.06-2.4),2.))*fbm2(p.xy*.15+vec2(0.,-uTime*.6))*.4;
    }
    float a=(1.-exp(-s*uSmoke))*.7;
    o=over(vec4(mix(vec3(.55),vec3(.4),uLight)*a,a),o);
  }
  o.rgb=min(o.rgb,vec3(o.a));
  float dd=(hash12(gl_FragCoord.xy+uTime)-.5)/255.*smoothstep(0.,1.5/255.,o.a);
  gl_FragColor=max(o+dd,0.);
}`;

const LIVE = `
const D = __DATA__;
const { P, MODEL: M } = D;
const stage = document.querySelector(".fx-stage");
const zoomer = document.querySelector(".fx-zoom");
const q = (n) => stage.querySelector('[data-part="' + n + '"]');
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const LIGHT = document.body.dataset.theme === "light" ? 1 : 0;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const gl = glLayer({ canvas: stage.querySelector(".fx-gl"), fragment: ${JSON.stringify(GLSL)}, view: [D.W, D.H], camera: D.camera, uniforms: ["uFlux", "uBrown", "uPop", "uTherm", "uTemps", "uSmoke", "uAmb"], fixed: { uLight: LIGHT } });
if (gl) stage.setAttribute("data-gl", "");

let mode = D.start.mode, ma = D.start.ma, volts = D.start.volts, bin = D.start.bin, hs = D.start.hs, tim = D.start.tim, amb = D.start.amb;
let on = true, tj = amb, brown = 0, dead = false, popAt = -10, thermal = false, zoom = false, current = ma / 1000;
let frame = 0, last = 0, now = 0, visible = false, touring = true, slow = false, tourClock = 0, tourStep = -1, tourEnd = 0, lastShot = "";

// the LED: V(I, Tj) from the fit; in constant-voltage mode, solve for I
const vOf = (i, t) => M.v0 + M.bins[bin] + M.slope * Math.log(Math.max(i, 1e-6) / M.i0) + M.rs * i + M.tempco * (t - 25);
function iOf(v, t) { let lo = 1e-6, hi = 6; for (let n = 0; n < 50; n++) { const m = (lo + hi) / 2; if (vOf(m, t) > v) hi = m; else lo = m; } return (lo + hi) / 2; }
const wpe = (i, t) => clamp(M.wpe0 / (1 + i / M.droop) * (1 - M.wpeT * (t - 25)), 0.05, 0.6);
const rTotal = () => M.rJsp + M.rBoard + M.tim[tim] + M.hs[hs];

const hsGs = [...stage.querySelectorAll("[data-hs]")], timGs = [...stage.querySelectorAll("[data-tim]")];
const carriers = q("carriers"), bond = q("bond"), phosphor = q("phosphor"), drvLabel = q("drv-label").querySelector("text"), drvVal = q("drv-val").querySelector("text");

function state() {
  if (!on || dead) return { i: 0, v: 0, p: 0, heat: 0, flux: 0, eff: 0 };
  const i = mode === "cc" ? ma / 1000 : iOf(volts, tj);
  const v = vOf(i, tj);
  const p = v * i, w = wpe(i, tj);
  const flux = M.ler * w * p * (1 - 0.65 * brown);
  return { i, v, p, heat: p * (1 - w), flux, eff: p > 0 ? flux / p : 0 };
}

function step(dt) {
  const s0 = state();
  current = s0.i;
  const target = amb + s0.heat * rTotal();
  tj += (target - tj) * (1 - Math.exp(-dt / M.tau));
  if (!dead) {
    if (tj > M.tjMax) brown = Math.min(1, brown + dt * (tj - M.tjMax) / 140);
    if (tj > M.tjDead || current > M.iDead) { dead = true; popAt = now; say(mode === "cv" && current > M.iMax ? "Pop. On a fixed voltage the current ran away: hotter die, lower Vf, more current, hotter die. It went past " + M.iMax * 1000 + " mA and the bond wire fused. That's why LEDs get a constant-current driver." : "Pop. The junction hit " + Math.round(tj) + " °C, way past its " + M.tjMax + " °C limit, and the die let go. The heat had nowhere to go."); }
  }
}

const ui = {
  mode: [...document.querySelectorAll("[data-mode]")], drive: document.querySelector("#drive"), driveOut: document.querySelector("#drive-out"), driveLab: document.querySelector("#drive-lab"),
  bin: [...document.querySelectorAll("[data-bin]")], hs: [...document.querySelectorAll("[data-hs-btn]")], tim: [...document.querySelectorAll("[data-tim-btn]")],
  amb: document.querySelector("#amb"), ambOut: document.querySelector("#amb-out"),
  iFill: document.querySelector("#i-fill"), iOut: document.querySelector("#i-out"), tFill: document.querySelector("#t-fill"), tOut: document.querySelector("#t-out"),
  stats: document.querySelector("#stats"),
  power: document.querySelector("#power"), therm: document.querySelector("#therm"), zoom: document.querySelector("#zoom"), fresh: document.querySelector("#fresh"), slow: document.querySelector("#slow"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"),
};
const sliding = {};
function syncUi(s) {
  ui.mode.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  if (mode === "cc") { ui.drive.min = 0; ui.drive.max = 2000; ui.drive.step = 10; if (!sliding.drive) ui.drive.value = ma; ui.driveOut.textContent = ma + " mA"; ui.driveLab.textContent = "Current"; }
  else { ui.drive.min = 2.6; ui.drive.max = 3.6; ui.drive.step = 0.01; if (!sliding.drive) ui.drive.value = volts; ui.driveOut.textContent = volts.toFixed(2) + " V"; ui.driveLab.textContent = "Voltage"; }
  ui.bin.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.bin === bin)));
  ui.hs.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.hsBtn === hs)));
  ui.tim.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.timBtn === tim)));
  if (!sliding.amb) ui.amb.value = amb; ui.ambOut.textContent = amb + " °C";
  ui.iFill.style.width = (clamp(s.i / 2.5, 0, 1) * 100).toFixed(1) + "%"; ui.iFill.dataset.state = s.i > M.iMax ? "bad" : "ok";
  ui.iOut.textContent = Math.round(s.i * 1000) + " mA";
  ui.tFill.style.width = (clamp((tj - 0) / 220, 0, 1) * 100).toFixed(1) + "%"; ui.tFill.dataset.state = tj > M.tjMax ? "bad" : tj > 120 ? "warn" : "ok";
  ui.tOut.textContent = Math.round(tj) + " °C";
  ui.stats.innerHTML = dead ? "<b>DEAD</b> · open circuit" : !on ? "off" : "<b>" + s.v.toFixed(2) + " V</b> · " + s.p.toFixed(2) + " W in · <b>" + Math.round(s.flux) + " lm</b> · " + Math.round(s.eff) + " lm/W · " + (s.heat / Math.max(s.p, 1e-6) * 100).toFixed(0) + " % heat";
  ui.power.setAttribute("aria-pressed", String(on)); ui.power.textContent = on ? "OFF" : "ON";
  ui.therm.setAttribute("aria-pressed", String(thermal));
  ui.zoom.setAttribute("aria-pressed", String(zoom)); ui.zoom.textContent = zoom ? "Whole thing" : "Zoom to die";
  ui.slow.setAttribute("aria-pressed", String(slow));
  ui.tour.setAttribute("aria-pressed", String(touring));
}
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };

// electrons rise from the n side, holes sink from the p side, they meet in the quantum wells and leave a photon
function drawCarriers(i) {
  if (dead || !on || i <= 0) { carriers.innerHTML = ""; return; }
  const n = Math.round(clamp(i / 0.1, 2, 24));
  const z0 = D.Z_DIE, h = D.Z_DIE - D.Z_PKG, mq = D.Z_DIE - (D.Z_MQW0 + D.Z_MQW1) / 2;
  let s = "";
  for (let j = 0; j < n; j++) {
    const ph = (now * (0.6 + i * 0.8) + j * 0.618) % 1;
    const x = 0.6 + ((j * 0.37) % 1) * (D.DIE.w / 2 - 1.2);
    const ye = h - (h - mq) * ph, yh = mq * ph;
    s += '<circle cx="' + x.toFixed(2) + '" cy="' + ye.toFixed(2) + '" r=".28" class="e"/>';
    s += '<circle cx="' + (x + 0.3).toFixed(2) + '" cy="' + yh.toFixed(2) + '" r=".28" class="h"/>';
    if (ph > 0.86) s += '<circle cx="' + (x + 0.15).toFixed(2) + '" cy="' + (mq - (ph - 0.86) * 18).toFixed(2) + '" r="' + (0.35 + (ph - 0.86) * 2).toFixed(2) + '" class="ph"/>';
  }
  carriers.innerHTML = s;
}

function draw() {
  const s = state();
  hsGs.forEach((g) => g.style.display = g.dataset.hs === hs ? "" : "none");
  timGs.forEach((g) => g.style.display = g.dataset.tim === tim ? "" : "none");
  drawCarriers(s.i);
  bond.dataset.state = dead ? "fused" : s.i > 0 ? "live" : "off";
  phosphor.style.setProperty("--brown", brown.toFixed(3));
  phosphor.dataset.brown = brown > 0.5 ? "bad" : brown > 0.1 ? "some" : "ok";
  drvLabel.textContent = mode === "cc" ? "CC DRIVER" : "CV SUPPLY";
  drvVal.textContent = mode === "cc" ? ma + " mA" : volts.toFixed(2) + " V";
  zoomer.style.transform = zoom ? "scale(3.2)" : "";
  zoomer.style.transformOrigin = (D.dieAt[0] / D.W * 100).toFixed(1) + "% " + (D.dieAt[1] / D.H * 100).toFixed(1) + "%";
  if (gl) {
    const tsp = amb + s.heat * (rTotal() - M.rJsp), tb = amb + s.heat * (rTotal() - M.rJsp - M.rBoard), ths = amb + s.heat * M.hs[hs] * 0.6;
    gl.draw({ uFlux: clamp(s.flux / 420, 0, 1.4), uBrown: brown, uPop: burst(now - popAt, 0.005, 0.2), uTherm: thermal ? 1 : 0, uAmb: amb, uTemps: [tj, tsp, tb, ths], uSmoke: dead ? Math.max(0, 1 - (now - popAt) / 6) : brown > 0.3 && on ? brown * 0.6 : 0 }, now);
  }
  const text = dead ? "DEAD · open circuit" : !on ? "off" : (mode === "cc" ? ma + " mA set" : volts.toFixed(2) + " V set") + " · " + Math.round(s.i * 1000) + " mA · Tj " + Math.round(tj) + " °C · " + Math.round(s.flux) + " lm";
  if (readout.textContent !== text) readout.textContent = text;
  syncUi(s);
  if (dead) return;
  if (!on) { say("Off. Hit ON."); return; }
  if (tj > M.tjMax) say("Junction " + Math.round(tj) + " °C, past the " + M.tjMax + " °C max. The phosphor and silicone are browning: less light, and it's going yellow. Every minute up here eats its life.");
  else if (mode === "cv" && s.i > M.iMax * 0.8) say("Fixed voltage, " + Math.round(s.i * 1000) + " mA and climbing. As the die heats, Vf falls (−2.1 mV per °C), so the same voltage pushes more current, which heats it more…");
  else if (mode === "cv") say("Constant voltage: " + volts.toFixed(2) + " V gives " + Math.round(s.i * 1000) + " mA on a " + bin + "-Vf LED. An LED's current is exponential in voltage: a tenth of a volt is a big change in current. Try another bin.");
  else if (tim === "none" && tj > 90) say("No thermal paste: the board's touching the heatsink at a few high spots and the rest is air. Same LED, same current, " + Math.round(tj) + " °C at the junction.");
  else if (hs === "none" && tj > 90) say("No heatsink: about " + Math.round(s.heat / Math.max(s.p, 1e-6) * 100) + " % of the power in is heat, and it has nowhere to go but a bit of board.");
  else if (s.i > M.iMax) say("Over the " + M.iMax * 1000 + " mA max. More current is more light, but look at lm/W: efficiency droops at high current and the rest is heat.");
  else say("Constant current, " + ma + " mA: " + s.v.toFixed(2) + " V across it, " + Math.round(s.flux) + " lm at " + Math.round(s.eff) + " lm/W, junction " + Math.round(tj) + " °C. About " + Math.round(s.heat / Math.max(s.p, 1e-6) * 100) + " % of what goes in comes out as heat, not light.");
}

const TOUR = [
  { mode: "cc", ma: 700, hs: "proper", tim: "paste", hold: 6 },
  { mode: "cc", ma: 1400, hs: "proper", tim: "paste", hold: 5 },
  { mode: "cc", ma: 1000, hs: "proper", tim: "none", hold: 6, therm: true },
  { mode: "cv", volts: 3.12, bin: "typ", hs: "proper", tim: "paste", hold: 5 },
  { mode: "cv", volts: 3.12, bin: "low", hs: "proper", tim: "paste", hold: 5 },
  { mode: "cv", volts: 3.28, bin: "low", hs: "small", tim: "paste", hold: 9 },
];
function tick(t) {
  const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
  last = t;
  const sdt = dt * (slow ? 0.12 : 1);
  now += sdt;
  if (touring) {
    tourClock += dt;
    if (tourStep < 0 || tourClock > tourEnd) {
      tourStep = (tourStep + 1) % TOUR.length;
      const s = TOUR[tourStep];
      mode = s.mode; if (s.ma) ma = s.ma; if (s.volts) volts = s.volts; bin = s.bin || "typ"; hs = s.hs; tim = s.tim; thermal = !!s.therm;
      if (tourStep === 0) { tj = amb; brown = 0; dead = false; on = true; }
      if (dead) { dead = false; brown = 0; tj = amb; }
      tourEnd = tourClock + s.hold;
    }
  }
  step(sdt);
  draw();
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { touring = false; };
const g = (fn) => (...a) => { takeOver(); fn(...a); run(); };
const setMode = g((m) => { mode = m; });
const setDrive = g((v) => { if (mode === "cc") ma = clamp(Math.round(v / 10) * 10, 0, 2000); else volts = clamp(Math.round(v * 100) / 100, 2.6, 3.6); });
const setBin = g((b) => { bin = b; });
const setHs = g((h) => { hs = h; });
const setTim = g((t) => { tim = t; });
const setAmb = g((v) => { amb = clamp(Math.round(v), 0, 60); });
const togglePower = g(() => { on = !on; });
const fresh = g(() => { dead = false; brown = 0; tj = amb; on = true; say("Fresh LED off the reel."); });
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;

ui.mode.forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
ui.drive.addEventListener("input", () => { sliding.drive = true; setDrive(+ui.drive.value); });
ui.drive.addEventListener("change", () => { sliding.drive = false; run(); });
ui.bin.forEach((b) => b.addEventListener("click", () => setBin(b.dataset.bin)));
ui.hs.forEach((b) => b.addEventListener("click", () => setHs(b.dataset.hsBtn)));
ui.tim.forEach((b) => b.addEventListener("click", () => setTim(b.dataset.timBtn)));
ui.amb.addEventListener("input", () => { sliding.amb = true; setAmb(+ui.amb.value); });
ui.amb.addEventListener("change", () => { sliding.amb = false; run(); });
ui.power.addEventListener("click", togglePower);
ui.therm.addEventListener("click", () => { thermal = !thermal; run(); });
ui.zoom.addEventListener("click", () => { zoom = !zoom; run(); });
ui.fresh.addEventListener("click", fresh);
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; tourClock = 0; } run(); });
stage.addEventListener("click", () => { zoom = !zoom; run(); });
stage.addEventListener("keydown", (ev) => {
  const step = mode === "cc" ? 50 : 0.02;
  const map = { ArrowUp: () => setDrive((mode === "cc" ? ma : volts) + step), ArrowDown: () => setDrive((mode === "cc" ? ma : volts) - step), m: () => setMode(mode === "cc" ? "cv" : "cc"), t: () => { thermal = !thermal; run(); }, z: () => { zoom = !zoom; run(); }, " ": togglePower, r: fresh, s: () => { slow = !slow; run(); } };
  if (map[ev.key]) { ev.preventDefault(); map[ev.key](); }
});
window.__fig = { freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
draw();
`;

const CSS = `.fx-stage{position:relative;cursor:zoom-in;overflow:hidden}
.fx-zoom{position:relative;transition:transform .6s cubic-bezier(.3,.7,.2,1)}
.fx-layer{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.fx-gl{display:block}
body[data-theme="dark"] .fx-gl{mix-blend-mode:screen}
.iso-plate{overflow:hidden}
.tim .iso-fill,.tim .iso-shade,.tim .iso-top{fill:#9aa0a6}
.dielectric .iso-fill,.dielectric .iso-shade,.dielectric .iso-top{fill:#e8e2d0}
body[data-theme="dark"] .dielectric .iso-fill,body[data-theme="dark"] .dielectric .iso-shade,body[data-theme="dark"] .dielectric .iso-top{fill:#5a564a}
.copper .iso-fill,.copper .iso-shade{fill:#b0643a}.copper .iso-top{fill:#c97a4a}
.solder .iso-fill,.solder .iso-shade,.solder .iso-top{fill:#a7adb4}
.mask .iso-fill,.mask .iso-shade{fill:#f4f4f0}.mask .iso-top{fill:#fbfbf8}
body[data-theme="dark"] .mask .iso-fill,body[data-theme="dark"] .mask .iso-shade{fill:#2b2d2b}body[data-theme="dark"] .mask .iso-top{fill:#333532}
.ngan .iso-fill,.ngan .iso-shade,.ngan .iso-top{fill:#5b6fa8}
.mqw .iso-fill,.mqw .iso-shade,.mqw .iso-top{fill:#9fb6ff}
.pgan .iso-fill,.pgan .iso-shade,.pgan .iso-top{fill:#7a5ba8}
.phosphor .iso-fill,.phosphor .iso-shade{fill:color-mix(in srgb,#f2d34b,#8a5a1a calc(var(--brown,0)*100%))}.phosphor .iso-top{fill:color-mix(in srgb,#ffe066,#8a5a1a calc(var(--brown,0)*100%))}
.bond{fill:none;stroke:#c9a227;stroke-width:.6}
.bond[data-state="live"]{stroke:#ffd34d}.bond[data-state="fused"]{stroke:#5a4a20;stroke-dasharray:1.2 1.6}
.lens{fill:rgba(220,235,255,.08);stroke:none}
body[data-theme="light"] .lens{fill:rgba(120,150,190,.08)}
.lens-edge{fill:none;stroke:var(--anatomy-mid);stroke-width:.5}.lens-edge.faint{stroke:var(--anatomy-faint);stroke-width:.35}
.lens-glint{fill:none;stroke:var(--anatomy-hi);stroke-width:.7;opacity:.6}
.wire-pos{stroke:#d9534f;stroke-width:1.2;fill:none}.wire-neg{stroke:var(--anatomy-mid);stroke-width:1.2;fill:none}
[data-part="carriers"] .e{fill:#6aa9ff}[data-part="carriers"] .h{fill:#ff6a7a}[data-part="carriers"] .ph{fill:#bcd4ff;opacity:.9}
.ctl{display:grid;gap:12px;margin:14px 0 6px;font-family:var(--anatomy-mono);font-size:12px;color:var(--anatomy-mid)}
.ctl-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ctl-label{min-width:72px;text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:var(--anatomy-lo)}
.ctl button{font:inherit;color:var(--anatomy-mid);background:transparent;border:1px solid var(--anatomy-lo);border-radius:6px;padding:7px 10px;cursor:pointer;line-height:1.15;text-align:left;min-height:36px}
.ctl button:hover{border-color:var(--anatomy-mid)}
.ctl button[aria-pressed="true"]{color:var(--anatomy-lit);border-color:var(--anatomy-lit)}
.ctl button small{display:block;font-size:10px;color:var(--anatomy-lo)}
.ctl #power{font-weight:600;letter-spacing:.06em;min-width:64px;text-align:center;border-color:var(--anatomy-lit);color:var(--anatomy-lit)}
.ctl #fresh{border-color:#ff6a3d;color:#ff6a3d}
.slide{position:relative;flex:1;min-width:110px}
.slide input{width:100%;accent-color:var(--anatomy-lit);margin:0}
.ctl output{min-width:72px;text-align:right;color:var(--anatomy-hi,var(--anatomy-mid))}
.meter{position:relative;flex:1;min-width:110px;height:10px;margin-top:14px;border:1px solid var(--anatomy-lo);border-radius:5px}
.meter .fill{position:absolute;left:0;top:0;bottom:0;border-radius:4px;transition:width .1s;background:var(--anatomy-mid)}
.meter .fill[data-state="ok"]{background:#3ddc84}.meter .fill[data-state="warn"]{background:#ffb347}.meter .fill[data-state="bad"]{background:#ff5a2a}
.mark{position:absolute;top:-14px;bottom:-3px;width:0;border-left:1px dashed #ff6a3d;pointer-events:none}
.mark::after{content:attr(data-label);position:absolute;top:0;left:4px;font-size:10px;white-space:nowrap;color:#ff6a3d}
#stats{font-size:12px;color:var(--anatomy-mid)}#stats b{color:var(--anatomy-hi,var(--anatomy-mid));font-weight:600}
#shot{min-height:3.6em;font-size:12px;line-height:1.4}
@media (max-width:520px){.ctl-label{min-width:52px}.ctl button{padding:7px 8px}.ctl output{min-width:60px}.ctl button small{display:none}}`;

const stageHtml = `<div class="iso-stage fx-stage" tabindex="0" role="group" aria-label="LED: up and down change the drive, M switches constant current and constant voltage, T thermal view, Z zoom, space on/off"><div class="fx-zoom">${fig}<canvas class="fx-layer fx-gl" aria-hidden="true"></canvas></div></div>`;

const CONTROLS = `<div class="ctl" role="group" aria-label="Test controls">
  <div class="ctl-row"><span class="ctl-label">Drive</span><button type="button" data-mode="cc" aria-pressed="true">Constant current<small>a proper LED driver</small></button><button type="button" data-mode="cv" aria-pressed="false">Constant voltage<small>a bench supply, no resistor</small></button></div>
  <div class="ctl-row"><span class="ctl-label" id="drive-lab">Current</span><div class="slide"><input id="drive" type="range" min="0" max="2000" step="10" value="${START.ma}" aria-label="Drive setting"></div><output id="drive-out">${START.ma} mA</output></div>
  <div class="ctl-row"><span class="ctl-label">Vf bin</span><button type="button" data-bin="low" aria-pressed="false">Low</button><button type="button" data-bin="typ" aria-pressed="true">Typical</button><button type="button" data-bin="high" aria-pressed="false">High</button></div>
  <div class="ctl-row"><span class="ctl-label">Heatsink</span><button type="button" data-hs-btn="proper" aria-pressed="true">Proper</button><button type="button" data-hs-btn="small" aria-pressed="false">Small</button><button type="button" data-hs-btn="none" aria-pressed="false">None</button><span class="ctl-label" style="min-width:0;margin-left:8px">Paste</span><button type="button" data-tim-btn="paste" aria-pressed="true">Yes</button><button type="button" data-tim-btn="none" aria-pressed="false">Forgot</button></div>
  <div class="ctl-row"><span class="ctl-label">Ambient</span><div class="slide"><input id="amb" type="range" min="0" max="60" step="1" value="${START.amb}" aria-label="Ambient temperature"></div><output id="amb-out">${START.amb} °C</output></div>
  <div class="ctl-row"><span class="ctl-label">Current</span><div class="meter"><span id="i-fill" class="fill"></span><span class="mark" style="left:${(1.5 / 2.5 * 100).toFixed(1)}%" data-label="1500 mA max"></span></div><output id="i-out">0 mA</output></div>
  <div class="ctl-row"><span class="ctl-label">Junction</span><div class="meter"><span id="t-fill" class="fill"></span><span class="mark" style="left:${(150 / 220 * 100).toFixed(1)}%" data-label="150 °C max"></span></div><output id="t-out">25 °C</output></div>
  <div class="ctl-row"><span class="ctl-label">Out</span><span id="stats"></span></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="power" aria-pressed="true">OFF</button><button type="button" id="therm" aria-pressed="false">Thermal view</button><button type="button" id="zoom" aria-pressed="false">Zoom to die</button><button type="button" id="fresh">New LED</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
  <div id="shot" aria-live="polite">Constant current, 700 mA. Try the thermal view, zoom to the die, then try running it off a fixed voltage.</div>
</div>`;

const card = k.plateHtml({
  fig: "Fig 9",
  title: "How an LED works",
  hint: "Tap: zoom to the die",
  readout: "",
  keys: [
    { mark: "lit", label: "Electrons (blue) and holes (red) meeting in the quantum wells; light out" },
    { mark: "raised", label: "Die, phosphor, dome, package, board, paste, heatsink, all cut open" },
  ],
  caption: "Current pushes electrons up from the n side and holes down from the p side; where they meet, in the quantum wells, each pair can drop its energy as a blue photon, and the yellow phosphor turns some of that blue into the rest of white. Only part of the power comes out as light. The rest is heat at the junction, and it has to get out through the package, the board, the paste and the heatsink. Heat matters twice: a hot die makes less light and dies sooner, and its forward voltage drops about 2 mV per degree. On a fixed voltage that's a feedback loop: hotter, lower Vf, more current, hotter. That's why LEDs run on constant-current drivers.",
  body: stageHtml,
});

const other = theme === "light" ? ["index.html", "Dark version"] : ["light.html", "Light version"];
const FOOT = `<p style="font-family:var(--anatomy-mono);font-size:11px;color:var(--anatomy-lo);margin:28px 0 8px;line-height:1.6">A toy, not a datasheet. Anchored on the Cree XLamp XP-G (Vf 2.9 V typ at 350 mA, 1500 mA max, 4 °C/W junction to solder point, 150 °C max junction, −2.1 mV/°C); the I-V fit, efficiency, light output, the heat path below the solder point and the timings are made up to show the idea.<br>Built with <a href="https://github.com/wheresryan22/anatomy" style="color:inherit">Anatomy</a> by Ryan (MIT). · <a href="${other[0]}" style="color:inherit">${other[1]}</a> · <a href="../" style="color:inherit">More figures</a> · <a href="https://github.com/Dizzyfer/Anatomy/tree/main/led" style="color:inherit">Source</a></p>`;
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "How an LED works", theme, body: `<style>${CSS}</style>${card.replace("<figcaption", CONTROLS + "<figcaption")}${FOOT}`, script: kitScript() + glScript() + LIVE.replace("__DATA__", JSON.stringify(DATA)), width: 700 }));
console.log("wrote", name);
