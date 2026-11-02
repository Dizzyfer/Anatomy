import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { glCamera } from "../../kit/gl.mjs";
import { kitScript, glScript } from "../../scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";

const W = 640;
const H = 420;

// Truth: IEEE 1584-2002 empirical model, LV (< 1 kV), enclosed switchgear, solidly earthed, 32 mm gap, x = 1.473, Cf = 1.5.
// Arc flash boundary at 1.2 cal/cm² (onset of a second-degree burn). NFPA 70E PPE categories: 1 = 4, 2 = 8, 3 = 25, 4 = 40 cal/cm².
// Toy: the protection (instantaneous pickup 10 kA arcing, 0.06 s; else 0.4 s delay; backup 1 s), the burn grading, clothes catching fire, the knockdown.
const MODEL = { V: 0.415, G: 32, x: 1.473, cf: 1.5, inst: 0.06, delay: 0.4, backup: 1.0, pickup: 10, pickupMaint: 3, eb: 1.2, ppe: { 0: 0, 1: 4, 2: 8, 4: 40 } };

const U = 40; // plot units per metre
const PLATE = { x: -130, y: -52, w: 172, d: 104, r: 8 };
const PLATE_H = 12, FOOT_H = 5;
const BX0 = -118, BX1 = -88, BY0 = -26, BY1 = 26, ZB = 4, ZT = 86;
const BAR_X = -98;
const ARC = [BAR_X, -6, 44];
const PERCH = [BAR_X + 5, -6, 69];

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [BX0, BY0, ZT + 4], [BX1, BY1, ZT], [24, 0, 76]],
  W, H, { pad: 20, azimuth: 45 },
);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const Dt = (points, style) => k.dotsSvg(points, style);
const depth2 = ([x, y]) => k.depthOf([x, y, 0], P);
const byDepth = (pts) => [...pts].sort((a, b) => depth2(a) - depth2(b));
const slab = (plan, z, h, r = 1.2, bevel = 0.5) => k.slabOf({ r, ...plan }, z, h, P, 4, bevel);
const box = (x0, x1, y0, y1, z, h, r = 0.4, bevel = 0.2) => slab({ x: x0, y: y0, w: x1 - x0, d: y1 - y0 }, z, h, r, bevel);

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
  // the clip for the boundary drawn on the floor
  out.push(`<clipPath id="floor-clip"><path d="${k.planOutline(k.insetPlan(PLATE, 3), 0, P)}"/></clipPath>`);
  out.push(`<g clip-path="url(#floor-clip)"><path data-part="zone" class="afb-zone" d=""/><path data-part="afb" class="afb" d=""/></g>`);
  out.push(`<g data-part="dim"><path class="dim" d=""/><text class="dim-t" x="0" y="0"></text></g>`);
  return out.join("");
}

function boardBack() {
  const out = [];
  out.push(`<path class="iso-halo" d="${k.haloOf({ x: BX0 - 3, y: BY0 - 3, w: BX1 - BX0 + 6, d: BY1 - BY0 + 6, r: 2 }, 0, 0.1, P)}"/>`);
  // plinth, back pan, far side
  out.push(S(box(BX0, BX1, BY0, BY1, 0, ZB, 0.8, 0.3), { tone: "mid" }));
  out.push(S(box(BX0, BX0 + 2, BY0, BY1, ZB, ZT - ZB), { tone: "mid" }));
  out.push(S(box(BX0 + 2, BX1, BY0, BY0 + 1.6, ZB, ZT - ZB), { tone: "mid" }));
  out.push(S(box(BX0 + 2, BX1 - 2, BY0 + 1.6, BY1 - 1.6, ZB, 1.2, 0.2, 0), { tone: "lo", crease: "none" }));
  // incoming breaker up top, with a trip lamp
  out.push(S(box(BX0 + 2, BX1 - 6, BY0 + 4, BY1 - 4, 74, 10, 0.6, 0.3), { tone: "hi", inner: L([77, 80].map((z) => k.segment([BX1 - 6, BY0 + 6, z], [BX1 - 6, BY1 - 6, z], P)).join(""), { tone: "faint" }) }));
  out.push(`<g data-part="lamp" class="lamp" data-on="false"><path d="${k.cylinder(BX1 - 5.6, 14, 1.6, 79, 0.6, P, 16).fill}"/></g>`);
  // insulated supports behind the bars
  for (const z of [16, 64]) out.push(S(box(BX0 + 2, BAR_X + 3, -20, 20, z, 4, 0.4, 0.2), { tone: "lo" }));
  // L1 L2 L3 copper busbars
  for (const [i, y] of [-12, 0, 12].entries()) {
    out.push(`<g class="cu">${S(box(BAR_X - 3, BAR_X + 3, y - 1, y + 1, 14, 58, 0.2, 0.1), { tone: "hi" })}</g>`);
    out.push(k.faceTextSvg(k.sideMatrix([BAR_X + 3.01, y + 0.8], 74, P, "right"), "L" + (i + 1), { size: 2.4, tone: "mid" }));
  }
  // the door, swung wide open against the far side
  out.push(S(box(BX1, BX1 + 50, BY0 - 2.6, BY0 - 1, ZB + 2, ZT - ZB - 4, 0.4, 0.2), { tone: "hi", inner: L(k.segment([BX1 + 4, BY0 - 1, 60], [BX1 + 46, BY0 - 1, 60], P), { tone: "faint" }) }));
  return out.join("");
}

function spanner() {
  // drawn lying across the bars (L1 to L2) at the arc point; JS slides it up to its perch until it falls
  const out = [];
  const z = ARC[2], x = BAR_X + 3.4;
  out.push(S(box(x, x + 1.2, -16, 3, z - 1.4, 2.8, 0.3, 0.1), { tone: "hi" }));
  out.push(S(k.cylinder(x + 0.6, -17.5, 3.2, z - 1.6, 3.2, P, 20, 0.3), { tone: "hi" }));
  out.push(S(k.cylinder(x + 0.6, 4.5, 2.8, z - 1.4, 2.8, P, 20, 0.3), { tone: "hi" }));
  return `<g data-part="spanner">${out.join("")}</g>`;
}

function boardFront() {
  const out = [];
  out.push(S(box(BX0, BX1, BY1 - 1.6, BY1, ZB, ZT - ZB), { tone: "mid" }));
  out.push(S(box(BX0 - 0.6, BX1 + 0.6, BY0 - 0.6, BY1 + 0.6, ZT - 2, 3, 0.6, 0.3), { tone: "mid" }));
  out.push(S(box(BX1 - 1.4, BX1, BY0, BY1, ZB, 2.6, 0.2, 0), { tone: "mid" }));
  // the arc flash label on the near side
  const m = k.sideMatrix([BX0 + 4, BY1 + 0.02], 72, P, "left");
  out.push(`<g transform="${m}"><rect x="0" y="0" width="22" height="15" rx=".6" class="afl"/><rect x="0" y="0" width="22" height="3.6" rx=".6" class="afl-head"/>
    <text class="iso-face-text afl-h" x="11" y="2.7" font-size="2.3" text-anchor="middle">ARC FLASH</text>
    <text data-part="lab-e" class="iso-face-text" data-tone="hi" x="1.4" y="6.6" font-size="1.9">1.5 cal/cm²</text>
    <text data-part="lab-d" class="iso-face-text" data-tone="mid" x="1.4" y="9.2" font-size="1.5">at 610 mm</text>
    <text data-part="lab-b" class="iso-face-text" data-tone="mid" x="1.4" y="11.6" font-size="1.5">boundary 0.7 m</text>
    <text data-part="lab-p" class="iso-face-text" data-tone="mid" x="1.4" y="14" font-size="1.5">415 V · PPE CAT 1</text></g>`);
  return out.join("");
}

// a person, standing at x = 0 and facing the board (−x); JS slides them out to the working distance
function worker() {
  const out = [];
  const part = (cls, paths, tone = "hi") => out.push(`<g class="${cls}">${S(paths, { tone })}</g>`);
  part("boot", box(-5, 2.6, -5.6, -1.4, 0, 3, 0.8, 0.4));
  part("arm", box(-2, 2, -10.4, -7, 37, 22, 1.2, 0.5));
  part("pants", box(-2.2, 2.2, -5.2, -1, 3, 32, 1, 0.3));
  part("boot", box(-5, 2.6, 1.4, 5.6, 0, 3, 0.8, 0.4));
  part("pants", box(-2.2, 2.2, 1, 5.2, 3, 32, 1, 0.3));
  part("shirt", box(-3.6, 3.6, -7.2, 7.2, 34, 26, 2.2, 0.8));
  part("arm", box(-2, 2, 7, 10.4, 37, 22, 1.2, 0.5));
  part("skin", k.cylinder(0, 0, 2, 59.5, 3.5, P, 20));
  part("skin", k.cylinder(0, 0, 4.2, 62.5, 10, P, 28, 2.2));
  out.push(`<g class="shield">${S(box(-6.4, -5.6, -5, 5, 61, 10.5, 0.3, 0.1), { tone: "hi" })}</g>`);
  out.push(`<g class="hood">${S(slab({ x: -5.2, y: -5.6, w: 10, d: 11.2 }, 59.5, 15, 3.6, 2), { tone: "hi" })}</g>`);
  part("hat", k.cylinder(0, 0, 5, 71, 3.4, P, 28, 1.6));
  return `<g data-part="worker" class="wk" data-ppe="2" data-burn="0">${out.join("")}</g>`;
}

const backSvg = k.figureSvg({
  width: W, height: H,
  label: "A 415 volt switchboard with its door open, three copper busbars inside and a breaker on top. A spanner has been left on the bar support. A person stands in front of it at the working distance, and the arc flash boundary is drawn on the floor around the bars.",
  body: [plate(), boardBack()],
});
const layer = (body) => `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg fx-layer" viewBox="0 0 ${W} ${H}" aria-hidden="true">${body}</svg>`;
const frontSvg = layer([spanner(), boardFront(), worker()].join(""));

const DATA = {
  W, H, camera: glCamera(P), P, MODEL, U, BAR_X, BX1, ARC, PERCH,
  ax: k.axisVector(P, [1, 0, 0]),
  drop: (() => { const a = at(PERCH), b = at([ARC[0] + 3.4, ARC[1], ARC[2]]); return [a[0] - b[0], a[1] - b[1]]; })(),
  feet0: at([0, 0, 0]),
  fallDeg: (() => { const a = k.axisVector(P, [1, 0, 0]); return Math.atan2(a[0], -a[1]) * 180 / Math.PI; })(),
};

const SHARED = `
uniform float uLight;
uniform float uArc;
uniform float uC;
uniform float uTv;
uniform float uReach;
uniform float uWx;
uniform float uFz;
uniform float uBurnF;
uniform float uPow;
vec4 inkFor(vec3 seen,float cover){vec3 ab=1.-seen;float a=max(max(ab.r,max(ab.g,ab.b)),cover);return vec4(vec3(a)-ab,a);}
vec4 over(vec4 t,vec4 u){return t+u*(1.-t.a);}
vec4 fireInk(float e,float core){
  vec3 hue=mix(vec3(.55,.16,.06),mix(vec3(1.,.36,.08),vec3(1.,.66,.28),smoothstep(.45,1.,core)),smoothstep(0.,.5,core));
  vec3 c=tonemap(hue*e,1.4);float a=max(c.r,max(c.g,c.b));
  float la=1.-exp(-1.8*e);
  vec3 seen=mix(vec3(1.),mix(vec3(.82,.28,.06),vec3(1.,.78,.4),smoothstep(.6,1.,core)*smoothstep(.5,1.,la)),la);
  return mix(vec4(c,a),inkFor(seen,.9*smoothstep(.75,1.,la)*core)*la,uLight);
}
vec4 arcInk(float e){
  vec3 c=tonemap(vec3(.62,.78,1.)*e,1.6)+tonemap(vec3(1.)*max(0.,e-1.2),1.);
  c=min(c,vec3(1.));float a=max(c.r,max(c.g,c.b));
  float la=1.-exp(-1.6*e);
  vec3 seen=mix(vec3(1.),mix(vec3(.18,.3,.85),vec3(.75,.85,1.),smoothstep(1.,2.,e)),la);
  return mix(vec4(c,a),inkFor(seen,.85*smoothstep(1.2,2.2,e))*la,uLight);
}
vec4 smokeInk(float h){float a=(1.-exp(-h))*mix(.55,.45,uLight);return vec4(mix(vec3(.32,.3,.28),vec3(.22,.2,.18),uLight)*a,a);}
float edgeFade(vec2 vb){return smoothstep(0.,60.,min(min(vb.x,uView.x-vb.x),min(vb.y,uView.y-vb.y)));}
const vec3 A=vec3(${ARC.map((v) => v.toFixed(1)).join(",")});
`;

// inside the board: the arc itself, behind the near panel and the person
const INNER = SHARED + `
void main(){
  vec2 vb=viewOf(gl_FragCoord.xy);
  vec4 o=vec4(0.);
  if(uArc>.002){
    vec2 dv=(vb-project(A))/uK;
    float fl=.65+.35*noise2(vec2(uTime*60.,1.));
    float jag=noise2(vec2(dv.y*.4,uTime*40.));
    float core=exp(-pow(length(dv*vec2(1.,1.6+jag))/1.6,2.))*2.6;
    float glow=exp(-pow(length(dv)/(7.+5.*uPow),2.))*1.1+exp(-pow(length(dv)/22.,2.))*.45*uPow;
    o=arcInk((core+glow)*uArc*fl);
  }
  o.rgb=min(o.rgb,vec3(o.a));
  float dd=(hash12(gl_FragCoord.xy+uTime)-.5)/255.*smoothstep(0.,1.5/255.,o.a);
  gl_FragColor=max(o+dd,0.);
}`;

// out the front: the plasma plume, molten copper, the person's clothes on fire, smoke
const OUTER = SHARED + `
void main(){
  vec2 vb=viewOf(gl_FragCoord.xy);
  vec4 o=vec4(0.);
  float c=uC;
  if(c>=0.){
    float g=1.-exp(-c/.07);
    float fade=c<uTv?1.:exp(-(c-uTv)/.32);
    float e=0.,hot=0.,sm=0.;
    for(int i=0;i<4;i++){
      float f=(float(i)+.5)/4.;
      vec3 C=A+vec3(uReach*f*g,0.,f*f*14.+c*10.);
      float r=(5.+uReach*.34*f+6.*uPow)*g;
      vec2 dv=(vb-project(C))/uK;
      float d=length(dv);
      float n=fbm2(dv*.07+vec2(c*3.,float(i)*7.));
      float body=1.-smoothstep(r*.35,r*(.95+.35*n),d);
      e+=body*(.45+.75*n)*(1.15-f*.5);
      hot+=body*(1.-f)*exp(-c/.25);
      // smoke left behind once the arc is out
      vec3 Cs=C+vec3(0.,0.,max(0.,c-uTv)*18.);
      float ds=length((vb-project(Cs))/uK);
      sm+=(1.-smoothstep(r*.6,r*1.5,ds))*fbm2(dv*.05+vec2(0.,-c))*smoothstep(uTv,uTv+.3,c)*exp(-max(0.,c-uTv)/1.4)*.9;
    }
    float ef=edgeFade(vb);
    o=over(fireInk(e*fade*ef*(.8+.6*uPow),clamp(hot*1.4/max(e,1e-3),0.,1.)),smokeInk(sm*uPow*ef));
    // molten copper thrown out of the board
    float sp=0.;
    for(int i=0;i<26;i++){
      float h1=hash12(vec2(float(i),3.1)),h2=hash12(vec2(float(i),7.7)),h3=hash12(vec2(float(i),11.3));
      vec3 v=vec3(90.+190.*h1,(h2-.5)*170.,(h3-.25)*120.)*(.5+.6*uPow);
      float tt=c-h3*.05;
      if(tt<0.) continue;
      vec3 p=A+v*tt-vec3(0.,0.,300.*tt*tt);
      if(p.z<0.) continue;
      float d=length((vb-project(p))/uK);
      sp+=exp(-pow(d/.8,2.))*exp(-tt/.7)*1.6;
      vec3 pt=A+v*max(0.,tt-.03)-vec3(0.,0.,300.*pow(max(0.,tt-.03),2.));
      vec2 sa=project(pt),sb=project(p),ab=sb-sa;
      float hh=clamp(dot(vb-sa,ab)/max(dot(ab,ab),1e-3),0.,1.);
      sp+=exp(-pow(length(vb-sa-ab*hh)/uK/.45,2.))*exp(-tt/.6)*.7;
    }
    o=over(fireInk(sp*ef,.9),o);
  }
  if(uBurnF>.002){
    vec3 C=vec3(uWx,0.,uFz);
    vec2 dv=(vb-project(C))/uK;
    float n=fbm2(vec2(dv.x*.18,dv.y*.12+uTime*3.));
    float m=exp(-pow(abs(dv.x)/9.,2.))*smoothstep(26.,4.,dv.y)*smoothstep(-34.,-8.,dv.y);
    float e=m*smoothstep(.35,.8,n+.2*(1.-smoothstep(-30.,10.,dv.y)))*1.8*uBurnF;
    o=over(fireInk(e,.6),o);
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
const lg = Math.log10;
const UN = ["uArc", "uC", "uTv", "uReach", "uWx", "uFz", "uBurnF", "uPow"];
const inner = glLayer({ canvas: stage.querySelector(".fx-inner"), fragment: ${JSON.stringify(INNER)}, view: [D.W, D.H], camera: D.camera, uniforms: UN, fixed: { uLight: LIGHT } });
const outer = glLayer({ canvas: stage.querySelector(".fx-outer"), fragment: ${JSON.stringify(OUTER)}, view: [D.W, D.H], camera: D.camera, uniforms: UN, fixed: { uLight: LIGHT } });
const GL = !!(inner && outer);
if (GL) stage.setAttribute("data-gl", "");

// IEEE 1584-2002, under 1 kV, enclosed, solidly earthed
function calc(ibf, dmm, prot) {
  const li = lg(ibf), V = M.V, G = M.G;
  const lIa = -0.097 + 0.662 * li + 0.0966 * V + 0.000526 * G + 0.5588 * V * li - 0.00304 * G * li;
  const ia = Math.pow(10, lIa);
  const en = Math.pow(10, -0.555 - 0.113 + 1.081 * lIa + 0.0011 * G);
  const pick = prot === "maint" ? M.pickupMaint : M.pickup;
  const t = prot === "backup" ? M.backup : ia >= pick ? M.inst : M.delay;
  const e = M.cf * en * (t / 0.2) * Math.pow(610 / dmm, M.x);
  const db = 610 * Math.pow(M.cf * en * (t / 0.2) / M.eb, 1 / M.x);
  return { ia, t, e, db, slow: prot !== "backup" && ia < pick };
}
const catOf = (e) => e <= 1.2 ? "none needed" : e <= 4 ? "CAT 1" : e <= 8 ? "CAT 2" : e <= 25 ? "CAT 3" : e <= 40 ? "CAT 4" : "no category";

let ibf = 25, dmm = 610, prot = "inst", ppe = 2;
let arcAt = null, res = null, out = null, frame = 0, last = 0, now = 0, visible = false, touring = true, slow = false, tourClock = 0, tourStep = -1, actions = [], lastShot = "";
const END_PAD = 4.2;
const vt = (t) => 0.22 + t * 1.1;
const busy = () => arcAt !== null;

const wk = q("worker"), sp = q("spanner"), lamp = q("lamp"), zone = q("zone"), afb = q("afb"), dim = q("dim"), flash = stage.querySelector(".fx-flash");
const dimPath = dim.querySelector("path"), dimText = dim.querySelector("text");
const lab = { e: q("lab-e"), d: q("lab-d"), b: q("lab-b"), p: q("lab-p") };
const ui = {
  fault: document.querySelector("#fault"), faultOut: document.querySelector("#fault-out"),
  dist: document.querySelector("#dist"), distOut: document.querySelector("#dist-out"),
  prot: [...document.querySelectorAll("[data-prot]")], ppe: [...document.querySelectorAll("[data-ppe-btn]")],
  eFill: document.querySelector("#e-fill"), eOut: document.querySelector("#e-out"), eMark: document.querySelector("#e-mark"),
  stats: document.querySelector("#stats"), go: document.querySelector("#go"), slow: document.querySelector("#slow"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"),
};
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };
const ePos = (e) => clamp((lg(Math.max(e, 0.3)) - lg(0.3)) / (lg(100) - lg(0.3)), 0, 1) * 100;
const ppeName = (p) => p === 0 ? "work clothes" : "CAT " + p + " gear (" + M.ppe[p] + " cal/cm²)";

function syncUi() {
  const r = calc(ibf, dmm, prot);
  ui.fault.value = ibf; ui.faultOut.textContent = ibf + " kA";
  ui.dist.value = dmm; ui.distOut.textContent = dmm + " mm";
  ui.prot.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.prot === prot)));
  ui.ppe.forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.ppeBtn === ppe)));
  ui.eFill.style.width = ePos(r.e).toFixed(1) + "%";
  ui.eFill.dataset.state = r.e <= Math.max(1.2, M.ppe[ppe]) ? "ok" : "bad";
  ui.eOut.textContent = r.e.toFixed(1) + " cal";
  ui.eMark.style.display = ppe ? "" : "none";
  ui.eMark.style.left = ePos(M.ppe[ppe]).toFixed(1) + "%"; ui.eMark.dataset.label = "your PPE " + M.ppe[ppe];
  ui.stats.innerHTML = "<b>" + r.ia.toFixed(1) + " kA</b> arcing · clears in <b>" + r.t.toFixed(2) + " s</b>" + (r.slow ? " (under the instantaneous pickup)" : "") + " · boundary <b>" + (r.db / 1000).toFixed(1) + " m</b> · needs <b>" + catOf(r.e) + "</b>";
  ui.go.disabled = busy();
  ui.slow.setAttribute("aria-pressed", String(slow));
  ui.tour.setAttribute("aria-pressed", String(touring));
}

function floorPath(rU, closed) {
  const dx = D.BX1 - D.BAR_X;
  if (rU <= dx + 0.5) return "";
  const th = Math.acos(dx / rU), n = 64, pts = [];
  for (let i = 0; i <= n; i++) { const a = -th + (2 * th * i) / n; pts.push(iso([D.BAR_X + rU * Math.cos(a), D.ARC[1] + rU * Math.sin(a), 0.2], P)); }
  return "M" + pts.map((p) => p[0].toFixed(1) + " " + p[1].toFixed(1)).join("L") + (closed ? "Z" : "");
}

function strike() {
  if (busy()) return;
  res = calc(ibf, dmm, prot);
  const rate = M.ppe[ppe], lim = Math.max(M.eb, rate);
  const burn = res.e <= lim ? 0 : (res.e > 3 * lim || (rate === 0 && res.e > 4)) ? 2 : 1;
  out = { burn, fire: rate === 0 && res.e > 4, knock: res.e > 12, rate };
  arcAt = now + 0.45;
  say("The spanner slips off the support…");
}

function verdict() {
  const r = res, o = out, e = r.e.toFixed(1), tt = r.t.toFixed(2) + " s";
  const why = r.slow ? " The fault current was below the breaker's instantaneous pickup, so it waited out its " + M.delay + " s delay. Less fault current, more energy." : prot === "maint" ? " Maintenance mode dropped the pickup, so it went instantaneous." : prot === "backup" ? " Only the upstream backup saw it, and that took a full second." : "";
  if (o.burn === 0 && r.e <= M.eb) return "Arc for " + tt + ", " + e + " cal/cm² at " + dmm + " mm. Under 1.2, the line for a second-degree burn. A fright, ringing ears, nothing worse." + why;
  if (o.burn === 0) return "Arc for " + tt + ", " + e + " cal/cm² at " + dmm + " mm. Your " + ppeName(ppe) + " held. You walk away shaking, deaf for a bit, with a ruined shirt." + why;
  if (o.fire) return "Arc for " + tt + ", " + e + " cal/cm² at " + dmm + " mm, in work clothes. They caught fire and kept burning after the arc was out: that's the bit that does the damage." + (r.e > 40 ? " No PPE category goes above 40." : "") + why;
  return "Arc for " + tt + ", " + e + " cal/cm² at " + dmm + " mm. Your " + ppeName(ppe) + " wasn't enough: " + (o.burn === 2 ? "serious burns" : "second-degree burns") + (o.knock ? ", and the blast knocked you off your feet" : "") + "." + (r.e > 40 ? " Above 40 there's no PPE category at all. Switch it off." : "") + why;
}

function draw() {
  const r = calc(ibf, dmm, prot);
  const c = arcAt === null ? -1 : now - arcAt;
  const shown = res && c > -0.45 ? res : r;
  // where the person stands
  const wx = D.BAR_X + (dmm / 1000) * D.U + 3.6;
  let tf = "translate(" + (D.ax[0] * wx).toFixed(2) + " " + (D.ax[1] * wx).toFixed(2) + ")";
  let burnLvl = 0, fireF = 0, kd = 0;
  if (c >= 0 && out) {
    const tv = vt(res.t), after = c - tv;
    if (c > 0.05) burnLvl = out.burn;
    if (out.knock) { kd = sm(0.02, 0.5, c) * (1 - sm(END_PAD + tv - 0.9, END_PAD + tv - 0.2, c)); const f = D.feet0, sh = 10 * kd; tf += " translate(" + (D.ax[0] * sh).toFixed(1) + " " + (D.ax[1] * sh).toFixed(1) + ") rotate(" + (D.fallDeg * 0.86 * kd).toFixed(1) + " " + f[0].toFixed(1) + " " + f[1].toFixed(1) + ")"; }
    if (out.fire) fireF = sm(0.05, 0.4, c) * (1 - sm(tv + 2.4, tv + 3.4, c));
    if (c > tv + END_PAD - 0.8) burnLvl = 0;
  }
  wk.setAttribute("transform", tf);
  wk.dataset.ppe = String(ppe); wk.dataset.burn = String(burnLvl);
  // the spanner: on its perch, then falling onto L1 and L2
  const fall = arcAt === null ? 0 : clamp((now - (arcAt - 0.45)) / 0.42, 0, 1);
  const k2 = 1 - fall * fall;
  sp.setAttribute("transform", "translate(" + (D.drop[0] * k2).toFixed(2) + " " + (D.drop[1] * k2).toFixed(2) + ")");
  sp.style.opacity = c > 0.08 ? "0" : "1";
  // the boundary on the floor
  const rU = (shown.db / 1000) * D.U;
  afb.setAttribute("d", floorPath(rU, false)); zone.setAttribute("d", floorPath(rU, true));
  // the working distance, beside the person
  const y = 16, a0 = iso([D.BAR_X, y, 0.3], P), a1 = iso([D.BAR_X + (dmm / 1000) * D.U, y, 0.3], P);
  dimPath.setAttribute("d", "M" + a0[0].toFixed(1) + " " + a0[1].toFixed(1) + "L" + a1[0].toFixed(1) + " " + a1[1].toFixed(1));
  dimText.setAttribute("x", ((a0[0] + a1[0]) / 2 + 4).toFixed(1)); dimText.setAttribute("y", ((a0[1] + a1[1]) / 2 + 13).toFixed(1));
  dimText.textContent = dmm + " mm";
  // the label on the board
  lab.e.textContent = shown.e.toFixed(1) + " cal/cm²"; lab.d.textContent = "at " + dmm + " mm";
  lab.b.textContent = "boundary " + (shown.db / 1000).toFixed(1) + " m"; lab.p.textContent = "415 V · " + (shown.e <= 1.2 ? "no PPE cat" : catOf(shown.e) === "no category" ? "DO NOT WORK LIVE" : "PPE " + catOf(shown.e));
  let arc = 0, pow = clamp(lg(Math.max(shown.e, 0.5) / 0.5) / lg(80), 0, 1);
  if (c >= 0) {
    const tv = vt(res.t);
    arc = c < tv ? sm(0, 0.02, c) : 0;
    lamp.dataset.on = String(c > tv - 0.02 && Math.sin(now * 9) > -0.2);
    const A = 9 * pow * Math.exp(-c / 0.35);
    stage.style.transform = "translate(" + (A * Math.sin(c * 95)).toFixed(1) + "px," + (A * Math.cos(c * 77)).toFixed(1) + "px)";
    flash.style.opacity = ((0.35 + 0.6 * pow) * (c < tv ? 0.75 + 0.25 * Math.sin(now * 80) : Math.exp(-(c - tv) / 0.15))).toFixed(3);
    if (c > tv + 0.05) say(verdict());
    if (c > tv + END_PAD) {
      arcAt = null; res = null; out = null; stage.style.transform = ""; flash.style.opacity = "0"; lamp.dataset.on = "false";
      say("Reset. Someone's left the spanner on the bar support again. Change the protection, the fault level, where you stand or what you're wearing, and drop it.");
      return draw();
    }
  }
  if (GL) {
    const tv = res ? vt(res.t) : 0;
    const u = { uArc: arc, uC: c, uTv: tv, uReach: Math.min(rU, 150) * (0.55 + 0.45 * pow), uWx: wx + kd * 34, uFz: 46 - kd * 38, uBurnF: fireF, uPow: pow };
    inner.draw(u, now); outer.draw(u, now);
  }
  const text = c >= 0 ? (c < vt(res.t) ? "ARC · " + res.ia.toFixed(1) + " kA · " + res.t.toFixed(2) + " s" : "cleared · " + res.e.toFixed(1) + " cal/cm² at " + dmm + " mm")
    : ibf + " kA bolted · " + r.t.toFixed(2) + " s · " + r.e.toFixed(1) + " cal/cm² at " + dmm + " mm";
  if (readout.textContent !== text) readout.textContent = text;
  if (arcAt === null && !touring) {
    const lim = Math.max(1.2, M.ppe[ppe]);
    say("At " + dmm + " mm you'd get " + r.e.toFixed(1) + " cal/cm². " + (ppe ? "Your gear is rated " + M.ppe[ppe] + "." : "You're in work clothes.") + (r.e > lim ? " That's not enough." : " That'll do.") + " The boundary, where it drops to 1.2, is " + (r.db / 1000).toFixed(1) + " m out. Drop the spanner.");
  }
}

// demo: [fault kA, distance mm, protection, PPE, line]
const TOUR = [
  [25, 610, "inst", 2, "25 kA, breaker trips instantly, CAT 2 at 610 mm. Watch."],
  [18, 455, "inst", 2, "Less fault current, a bit closer. Should be easier, right?"],
  [18, 455, "maint", 2, "Same again with the maintenance mode switch on."],
  [40, 610, "backup", 0, "Big board, only the upstream backup protecting it, work clothes."],
  [40, 3000, "backup", 4, "Same board, CAT 4 suit, and stand back 3 m."],
];
function tick(t) {
  const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
  last = t;
  const sdt = dt * (slow ? 0.12 : 1);
  now += sdt;
  if (touring && !busy()) {
    tourClock += sdt;
    if (tourStep < 0 || actions.length === 0) {
      tourStep = (tourStep + 1) % TOUR.length;
      const s = TOUR[tourStep];
      ibf = s[0]; dmm = s[1]; prot = s[2]; ppe = s[3]; say(s[4]);
      actions = [[tourClock + 2.6, "go"], [tourClock + 2.7, "end"]];
    }
    while (actions.length && tourClock >= actions[0][0]) {
      const a = actions.shift()[1];
      if (a === "go") strike(); else if (a === "end") actions = [];
    }
  }
  draw(); syncUi();
  const idle = !touring && arcAt === null;
  frame = visible && !idle ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { touring = false; actions = []; };
const guard = (fn) => (...a) => { takeOver(); if (busy()) return; fn(...a); draw(); syncUi(); run(); };
const setFault = guard((v) => { ibf = v; });
const setDist = guard((v) => { dmm = v; });
const setProt = guard((v) => { prot = v; });
const setPpe = guard((v) => { ppe = v; });
const go = guard(() => strike());
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;

ui.fault.addEventListener("input", () => setFault(+ui.fault.value));
ui.dist.addEventListener("input", () => setDist(+ui.dist.value));
ui.prot.forEach((b) => b.addEventListener("click", () => setProt(b.dataset.prot)));
ui.ppe.forEach((b) => b.addEventListener("click", () => setPpe(+b.dataset.ppeBtn)));
ui.go.addEventListener("click", go);
ui.slow.addEventListener("click", () => { slow = !slow; syncUi(); run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; tourClock = 0; actions = []; } syncUi(); run(); });
stage.addEventListener("click", go);
stage.addEventListener("keydown", (ev) => {
  const map = { " ": go, Enter: go, ArrowRight: () => setDist(clamp(dmm + 50, 400, 3000)), ArrowLeft: () => setDist(clamp(dmm - 50, 400, 3000)), ArrowUp: () => setFault(clamp(ibf + 1, 5, 60)), ArrowDown: () => setFault(clamp(ibf - 1, 5, 60)), m: () => setProt(prot === "maint" ? "inst" : "maint"), s: () => { slow = !slow; syncUi(); run(); } };
  if (map[ev.key]) { ev.preventDefault(); map[ev.key](); }
});
window.__fig = { freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
syncUi(); draw();
`;

const CSS = `.fx-stage{position:relative;cursor:pointer}
.fx-layer{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.fx-gl{display:block}
body[data-theme="dark"] .fx-gl{mix-blend-mode:screen}
.fx-flash{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(closest-side at 32% 40%,#f4f8ff 0%,#cfe0ff 38%,rgba(170,200,255,0) 100%)}
.iso-plate{overflow:hidden}
.cu .iso-fill,.cu .iso-shade{fill:#b0643a}.cu .iso-top{fill:#d08a5a}
.afb{fill:none;stroke:#ff6a3d;stroke-width:1.1;stroke-dasharray:4 3}
.afb-zone{fill:rgba(255,106,61,.10);stroke:none}
.dim{stroke:var(--anatomy-lit);stroke-width:.8;fill:none;stroke-dasharray:2 2}
.dim-t{font-family:var(--anatomy-mono);font-size:8px;fill:var(--anatomy-lit)}
.afl{fill:var(--anatomy-paper);stroke:#ff6a3d;stroke-width:.35}.afl-head{fill:#ff6a3d}.afl-h{fill:#fff;font-weight:700}
.lamp path{fill:var(--anatomy-paper);stroke:var(--anatomy-mid);stroke-width:.3}.lamp[data-on="true"] path{fill:#ffc23d}
.wk .shirt .iso-fill,.wk .shirt .iso-shade,.wk .arm .iso-fill,.wk .arm .iso-shade{fill:#4f74b0}.wk .shirt .iso-top,.wk .arm .iso-top{fill:#6a8cc4}
.wk .pants .iso-fill,.wk .pants .iso-shade,.wk .pants .iso-top{fill:#3a4150}
.wk .boot .iso-fill,.wk .boot .iso-shade,.wk .boot .iso-top{fill:#2a2724}
.wk .skin .iso-fill,.wk .skin .iso-shade,.wk .skin .iso-top{fill:#d8a888}
.wk .hat .iso-fill,.wk .hat .iso-shade,.wk .hat .iso-top{fill:#f2f2ee}
.wk .shield .iso-fill,.wk .shield .iso-shade,.wk .shield .iso-top{fill:rgba(160,200,230,.45)}
.wk .hood .iso-fill,.wk .hood .iso-shade,.wk .hood .iso-top{fill:#8b7d55}
.wk .shield,.wk .hood{display:none}
.wk[data-ppe="1"] .shirt .iso-fill,.wk[data-ppe="1"] .shirt .iso-shade,.wk[data-ppe="1"] .arm .iso-fill,.wk[data-ppe="1"] .arm .iso-shade{fill:#2e4a7a}
.wk[data-ppe="2"] .shirt .iso-fill,.wk[data-ppe="2"] .shirt .iso-shade,.wk[data-ppe="2"] .arm .iso-fill,.wk[data-ppe="2"] .arm .iso-shade{fill:#2e4a7a}
.wk[data-ppe="2"] .shield{display:inline}
.wk[data-ppe="4"] .shirt .iso-fill,.wk[data-ppe="4"] .shirt .iso-shade,.wk[data-ppe="4"] .arm .iso-fill,.wk[data-ppe="4"] .arm .iso-shade,.wk[data-ppe="4"] .pants .iso-fill,.wk[data-ppe="4"] .pants .iso-shade{fill:#a39466}
.wk[data-ppe="4"] .shirt .iso-top,.wk[data-ppe="4"] .arm .iso-top,.wk[data-ppe="4"] .pants .iso-top{fill:#b8aa7c}
.wk[data-ppe="4"] .hood{display:inline}.wk[data-ppe="4"] .hat{display:none}
.wk{transition:filter .25s}
.wk[data-burn="1"]{filter:sepia(.7) brightness(.62) saturate(1.4)}
.wk[data-burn="2"]{filter:sepia(.8) brightness(.32)}
.ctl{display:grid;gap:12px;margin:14px 0 6px;font-family:var(--anatomy-mono);font-size:12px;color:var(--anatomy-mid)}
.ctl-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ctl-label{min-width:72px;text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:var(--anatomy-lo)}
.ctl button{font:inherit;color:var(--anatomy-mid);background:transparent;border:1px solid var(--anatomy-lo);border-radius:6px;padding:7px 10px;cursor:pointer;line-height:1.15;text-align:left;min-height:36px}
.ctl button:hover{border-color:var(--anatomy-mid)}
.ctl button[aria-pressed="true"]{color:var(--anatomy-lit);border-color:var(--anatomy-lit)}
.ctl button small{display:block;font-size:10px;color:var(--anatomy-lo)}
.ctl #go{font-weight:600;letter-spacing:.06em;border-color:#ff6a3d;color:#ff6a3d;text-align:center}
.ctl #go:disabled{opacity:.4;cursor:default}
.slide{position:relative;flex:1;min-width:110px}
.slide input{width:100%;accent-color:var(--anatomy-lit);margin:0}
.ctl output{min-width:72px;text-align:right;color:var(--anatomy-hi,var(--anatomy-mid))}
.meter{position:relative;flex:1;min-width:110px;height:10px;margin-top:14px;border:1px solid var(--anatomy-lo);border-radius:5px}
.meter .fill{position:absolute;left:0;top:0;bottom:0;border-radius:4px;transition:width .1s;background:var(--anatomy-mid)}
.meter .fill[data-state="ok"]{background:#3ddc84}.meter .fill[data-state="bad"]{background:#ff5a2a}
.mark{position:absolute;top:-14px;bottom:-3px;width:0;border-left:1px dashed var(--anatomy-lit);pointer-events:none}
.mark::after{content:attr(data-label);position:absolute;top:0;left:4px;font-size:10px;white-space:nowrap;color:var(--anatomy-lit)}
.mark.red{border-left-color:#ff6a3d}.mark.red::after{color:#ff6a3d}
#stats{font-size:12px;color:var(--anatomy-mid);line-height:1.5}#stats b{color:var(--anatomy-hi,var(--anatomy-mid));font-weight:600}
#shot{min-height:3.6em;font-size:12px;line-height:1.4}
@media (max-width:520px){.ctl-label{min-width:52px}.ctl button{padding:7px 8px}.ctl output{min-width:60px}.ctl button small{display:none}}`;

const stageHtml = `<div class="iso-stage fx-stage" tabindex="0" role="group" aria-label="Switchboard: space drops the spanner, left and right change the distance, up and down the fault level, M maintenance mode">${backSvg}<canvas class="fx-layer fx-gl fx-inner" aria-hidden="true"></canvas>${frontSvg}<canvas class="fx-layer fx-gl fx-outer" aria-hidden="true"></canvas><div class="fx-flash" aria-hidden="true"></div></div>`;

const ePct = (e) => ((Math.log10(e) - Math.log10(0.3)) / (Math.log10(100) - Math.log10(0.3)) * 100).toFixed(1);
const CONTROLS = `<div class="ctl" role="group" aria-label="Test controls">
  <div class="ctl-row"><span class="ctl-label">Fault level</span><div class="slide"><input id="fault" type="range" min="5" max="60" step="1" value="25" aria-label="Prospective bolted fault current"></div><output id="fault-out">25 kA</output></div>
  <div class="ctl-row"><span class="ctl-label">Protection</span><button type="button" data-prot="inst" aria-pressed="true">Breaker<small>instant above 10 kA, else 0.4 s</small></button><button type="button" data-prot="maint" aria-pressed="false">Maintenance mode<small>instant above 3 kA</small></button><button type="button" data-prot="backup" aria-pressed="false">Upstream only<small>1 s</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Distance</span><div class="slide"><input id="dist" type="range" min="400" max="3000" step="5" value="610" aria-label="Working distance"></div><output id="dist-out">610 mm</output></div>
  <div class="ctl-row"><span class="ctl-label">Wearing</span><button type="button" data-ppe-btn="0" aria-pressed="false">Work clothes</button><button type="button" data-ppe-btn="1" aria-pressed="false">CAT 1<small>4 cal/cm²</small></button><button type="button" data-ppe-btn="2" aria-pressed="true">CAT 2<small>8 cal/cm²</small></button><button type="button" data-ppe-btn="4" aria-pressed="false">CAT 4<small>40 cal/cm²</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Energy</span><div class="meter"><span id="e-fill" class="fill"></span><span class="mark red" style="left:${ePct(1.2)}%" data-label="1.2 burn"></span><span id="e-mark" class="mark" style="left:${ePct(8)}%" data-label="your PPE 8"></span></div><output id="e-out">0 cal</output></div>
  <div class="ctl-row"><span class="ctl-label">Arc</span><span id="stats"></span></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="go">DROP THE SPANNER</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
  <div id="shot" aria-live="polite">Someone's left a spanner on the bar support. Set things up, then drop it.</div>
</div>`;

const card = k.plateHtml({
  fig: "Fig 10",
  title: "Arc flash",
  hint: "Tap: drop the spanner",
  readout: "",
  keys: [
    { mark: "lit", label: "The arc, the plasma and molten copper out of the front, the boundary on the floor" },
    { mark: "raised", label: "415 V switchboard, door open, copper busbars, and the person working on it" },
  ],
  caption: "Bridge two busbars with a dropped spanner and the arc vaporises copper, which expands thousands of times over and comes out of the front of the board as a ball of plasma, molten metal and pressure. How badly it gets you comes down to three things: how much current the arc draws, how long it lasts before the protection clears it, and how far away you are. Energy is counted in cal/cm²; 1.2 is enough for a second-degree burn on bare skin, and the arc flash boundary is how far out that reaches. Time is the big lever, and it catches people out: drop the fault level below the breaker's instantaneous pickup and it waits out its time delay, so less current can mean far more energy.",
  body: stageHtml,
});

const other = theme === "light" ? ["index.html", "Dark version"] : ["light.html", "Light version"];
const FOOT = `<p style="font-family:var(--anatomy-mono);font-size:11px;color:var(--anatomy-lo);margin:28px 0 8px;line-height:1.6">A toy, not an arc flash study. Real: the IEEE 1584-2002 empirical equations (under 1 kV, enclosed, earthed, 32 mm gap, distance exponent 1.473), the 1.2 cal/cm² boundary and the NFPA 70E PPE categories. Real studies use the newer, more detailed IEEE 1584-2018 model and your actual protection curves. Made up: the protection settings, the burn grading, when clothes catch fire, the knockdown and the visuals.<br>Built with <a href="https://github.com/wheresryan22/anatomy" style="color:inherit">Anatomy</a> by Ryan (MIT). · <a href="${other[0]}" style="color:inherit">${other[1]}</a> · <a href="../" style="color:inherit">More figures</a> · <a href="https://github.com/Dizzyfer/Anatomy/tree/main/arc-flash" style="color:inherit">Source</a></p>`;
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "Arc flash", theme, body: `<style>${CSS}</style>${card.replace("<figcaption", CONTROLS + "<figcaption")}${FOOT}`, script: kitScript() + glScript() + LIVE.replace("__DATA__", JSON.stringify(DATA)), width: 700 }));
console.log("wrote", name);
