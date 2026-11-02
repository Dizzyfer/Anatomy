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

// Truth: T4 = 135 °C max surface. Diethyl ether autoignition ≈ 160 °C (a T4 gas).
// Toy: 2.5 mΩ per circuit, box rated 10 W MDP, sits at exactly 135 °C at MDP in 40 °C ambient.
const MODEL = {
  rCircuit: 0.0025, mdp: 10, tAmb: 40, t4: 135, ait: 160,
  rth: (135 - 40) / 10, tau: 2.4,
  creepClean: 550, creepDirty: 230, clearance: 800,
};
const N_TERM = 16;
const V_MIN = 24, V_MAX = 1000, I_MAX = 25;

const PLATE = { x: -100, y: -80, w: 250, d: 162, r: 8 };
const PLATE_H = 12, FOOT_H = 5;
const BOX = { x: -62, y: -44, w: 124, d: 84 };
const WALL = 3;
const Z_BASE = 4, Z_TOP = 34, Z_CUT = 15, Z_FLOOR = 8;
const PITCH = 6.6, TW = 5.6;
const X0 = -(N_TERM * PITCH) / 2 + (PITCH - TW) / 2;
const TERM_Y = -20, TERM_D = 32, Z_TT = 23;
const CL_A = -13, CL_B = 5; // clamp y positions
const DRUM = [116, -46], DRUM_R = 17, DRUM_H = 52;
const TRACK = 7; // tracking happens between terminal 7 and 8

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [BOX.x, BOX.y, Z_TOP + 2], [DRUM[0], DRUM[1], DRUM_H + 4]],
  W, H, { pad: 22, azimuth: 45 },
);

const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const Dt = (points, style) => k.dotsSvg(points, style);
const depth2 = ([x, y]) => k.depthOf([x, y, 0], P);
const byDepth = (pts) => [...pts].sort((a, b) => depth2(a) - depth2(b));
const slab = (plan, z, h, r = 1.2, bevel = 0.5) => k.slabOf({ r, ...plan }, z, h, P, 4, bevel);
const termX = (i) => X0 + i * PITCH;
const termC = (i) => termX(i) + TW / 2;

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
  out.push(k.faceTextSvg(k.topMatrix([-92, 74], 0, P, "x"), "ZONE 1 · T4 GAS", { size: 5, tone: "lo" }));
  return out.join("");
}

function drum() {
  const [x, y] = DRUM;
  const out = [`<path class="iso-halo" d="${k.haloOf({ x: x - DRUM_R - 3, y: y - DRUM_R - 3, w: 2 * DRUM_R + 6, d: 2 * DRUM_R + 6, r: DRUM_R }, 0, 0.1, P)}"/>`];
  const ribs = [DRUM_H * 0.33, DRUM_H * 0.66].map((z) => k.sideArc(x, y, DRUM_R, z, P, 40)).join("");
  out.push(S(k.cylinder(x, y, DRUM_R, 0, DRUM_H, P, 56, 0.8), { tone: "hi", inner: L(ribs, { tone: "lo" }) + L(k.sideArc(x, y, DRUM_R, 3, P, 40) + k.sideArc(x, y, DRUM_R, DRUM_H - 3, P, 40), { tone: "faint" }) }));
  out.push(L(k.ring(x, y, DRUM_R - 2, DRUM_H, P, 48), { tone: "lo" }));
  out.push(S(k.cylinder(x + 8, y - 4, 2.6, DRUM_H, 1.6, P, 6), { tone: "mid" }));
  out.push(S(k.cylinder(x - 9, y + 3, 1.8, DRUM_H, 1.4, P, 6), { tone: "mid" }));
  out.push(k.faceTextSvg(k.topMatrix([x - 11, y + 6], DRUM_H, P, "x"), "DIETHYL", { size: 3.4, tone: "mid" }));
  out.push(k.faceTextSvg(k.topMatrix([x - 11, y + 10.5], DRUM_H, P, "x"), "ETHER", { size: 3.4, tone: "mid" }));
  return `<g data-part="drum">${out.join("")}</g>`;
}

function boxBack() {
  const out = [`<path class="iso-halo" d="${k.haloOf({ ...k.insetPlan({ ...BOX, r: 3 }, -7) }, 0, 0.1, P)}"/>`];
  // mounting lugs
  for (const [x, y] of byDepth([[BOX.x - 6, BOX.y + 10], [BOX.x - 6, BOX.y + BOX.d - 10], [BOX.x + BOX.w + 6, BOX.y + 10]])) {
    out.push(S(slab({ x: x - 6, y: y - 5, w: 12, d: 10 }, 0, Z_BASE, 2, 0.4), { tone: "mid" }));
    out.push(S(k.cylinder(x, y, 2.4, Z_BASE, 1.2, P, 6), { tone: "mid" }));
  }
  out.push(S(slab(BOX, Z_BASE, Z_FLOOR - Z_BASE, 2.5, 0.5), { tone: "mid" }));
  // back walls, full height, with the lid seating face on top
  const bw1 = { x: BOX.x, y: BOX.y, w: BOX.w, d: WALL }, bw2 = { x: BOX.x, y: BOX.y + WALL, w: WALL, d: BOX.d - WALL };
  out.push(S(slab(bw1, Z_FLOOR, Z_TOP - Z_FLOOR, 0.6, 0.3), { tone: "mid" }));
  out.push(S(slab(bw2, Z_FLOOR, Z_TOP - Z_FLOOR, 0.6, 0.3), { tone: "mid" }));
  out.push(L(k.segment([BOX.x + 1.5, BOX.y + 1.5, Z_TOP], [BOX.x + BOX.w - 1.5, BOX.y + 1.5, Z_TOP], P) + k.segment([BOX.x + 1.5, BOX.y + 1.5, Z_TOP], [BOX.x + 1.5, BOX.y + BOX.d - 1.5, Z_TOP], P), { tone: "faint" }));
  out.push(Dt([[BOX.x + 1.5, BOX.y + 1.5], [BOX.x + BOX.w - 4, BOX.y + 1.5], [BOX.x + 1.5, BOX.y + BOX.d - 4]].map(([x, y]) => at([x, y, Z_TOP])), { size: 0.55 }));
  // mounting plate and DIN rail
  out.push(S(slab({ x: BOX.x + 6, y: BOX.y + 6, w: BOX.w - 12, d: BOX.d - 12 }, Z_FLOOR, 1, 1, 0), { tone: "lo", crease: "none" }));
  out.push(S(slab({ x: X0 - 6, y: TERM_Y + 12, w: N_TERM * PITCH + 10, d: 8 }, Z_FLOOR + 1, 2, 0.3, 0), { tone: "mid" }));
  // wiring ducts, back and front
  out.push(duct(BOX.y + 7));
  // earth bar
  out.push(S(slab({ x: BOX.x + 8, y: BOX.y + BOX.d - 14, w: 20, d: 4 }, Z_FLOOR + 1, 4, 0.4, 0.2), { tone: "mid" }));
  out.push(Dt([0, 1, 2, 3].map((i) => at([BOX.x + 11 + i * 5, BOX.y + BOX.d - 12, Z_FLOOR + 5])), { size: 0.5 }));
  return out.join("");
}
function duct(y) {
  const out = [];
  {
    const duct = { x: BOX.x + 8, y, w: BOX.w - 16, d: 9 };
    const slots = [];
    for (let x = duct.x + 4; x < duct.x + duct.w - 2; x += 4) slots.push(k.segment([x, y + duct.d, Z_FLOOR + 1 + 4], [x, y + duct.d, Z_FLOOR + 1 + 11], P));
    out.push(S(slab(duct, Z_FLOOR + 1, 13, 0.6, 0.3), { tone: "mid", inner: L(slots.join(""), { tone: "faint" }) }));
    out.push(L(k.planOutline({ ...k.insetPlan({ ...duct, r: 0.6 }, 1.2) }, Z_FLOOR + 14, P), { tone: "faint" }));
  }
  return out.join("");
}

function terminals() {
  const out = [];
  for (let i = 0; i < N_TERM; i++) {
    const x = termX(i);
    const t = { x, y: TERM_Y, w: TW, d: TERM_D };
    out.push(`<g data-term="${i}">` + S(slab(t, Z_FLOOR + 3, Z_TT - Z_FLOOR - 3, 0.5, 0.25), { tone: "hi", inner: L(k.segment([x + TW, TERM_Y + 10, Z_FLOOR + 3], [x + TW, TERM_Y + 10, Z_TT], P) + k.segment([x + TW, TERM_Y + 22, Z_FLOOR + 3], [x + TW, TERM_Y + 22, Z_TT], P), { tone: "faint" }) }) +
      L(k.ring(x + TW / 2, CL_A, 1.5, Z_TT, P, 12) + k.ring(x + TW / 2, CL_B, 1.5, Z_TT, P, 12), { tone: "lo" }) +
      Dt([at([x + TW / 2, CL_A, Z_TT]), at([x + TW / 2, CL_B, Z_TT])], { size: 0.45 }) +
      L(k.segment([x + 0.8, TERM_Y + 15.5, Z_TT], [x + TW - 0.8, TERM_Y + 15.5, Z_TT], P), { tone: "faint" }) + `</g>`);
  }
  // end stops
  for (const x of [X0 - 4, X0 + N_TERM * PITCH - 0.4]) out.push(S(slab({ x, y: TERM_Y + 8, w: 3, d: 16 }, Z_FLOOR + 3, 10, 0.4, 0.2), { tone: "mid" }));
  out.push(`<g data-part="wires"></g><g data-part="track"></g>`);
  out.push(duct(TERM_Y + TERM_D + 3));
  return out.join("");
}

function boxFront() {
  const out = [];
  // front walls cut down for the view, hatched where cut
  const fw1 = { x: BOX.x + WALL, y: BOX.y + BOX.d - WALL, w: BOX.w - WALL, d: WALL }, fw2 = { x: BOX.x + BOX.w - WALL, y: BOX.y + WALL, w: WALL, d: BOX.d - 2 * WALL };
  const hatch = (from, to) => {
    const lines = [], n = Math.floor(Math.hypot(to[0] - from[0], to[1] - from[1]) / 3);
    for (let i = 0; i < n; i++) {
      const u = i / n, v = (i + 0.6) / n;
      lines.push(k.segment([from[0] + (to[0] - from[0]) * u, from[1] + (to[1] - from[1]) * u, Z_CUT], [from[0] + (to[0] - from[0]) * v + (to[1] === from[1] ? 0 : WALL), from[1] + (to[1] - from[1]) * v + (to[0] === from[0] ? 0 : WALL), Z_CUT], P));
    }
    return L(lines.join(""), { tone: "faint" });
  };
  out.push(S(slab(fw2, Z_FLOOR, Z_CUT - Z_FLOOR, 0.3, 0), { tone: "mid", inner: hatch([fw2.x, fw2.y], [fw2.x, fw2.y + fw2.d]) }));
  out.push(S(slab(fw1, Z_FLOOR, Z_CUT - Z_FLOOR, 0.3, 0), { tone: "mid", inner: hatch([fw1.x, fw1.y], [fw1.x + fw1.w, fw1.y]) }));
  // glands on the front face
  const glands = [-40, -22, -4, 14];
  for (const gx of glands) {
    out.push(S(slab({ x: gx - 3.4, y: BOX.y + BOX.d, w: 6.8, d: 2.2 }, Z_BASE + 1.2, 6.8, 1.6, 0.3), { tone: "mid" }));
    out.push(S(slab({ x: gx - 2.6, y: BOX.y + BOX.d + 2.2, w: 5.2, d: 3.4 }, Z_BASE + 2, 5.2, 2.2, 0.3), { tone: "mid" }));
  }
  // field cables leaving across the bench
  const cables = glands.map((gx, i) => {
    const pts = [[gx, BOX.y + BOX.d + 5.6, Z_BASE + 4.6], [gx - 2, BOX.y + BOX.d + 12, 0.8], [gx - 10 - i * 6, BOX.y + BOX.d + 30, 0.8], [gx - 30 - i * 10, 76, 0.8]].map(at);
    return `<path class="iso-line iso-cable" data-tone="mid" d="${k.pathOf(pts)}"/>`;
  });
  out.push(cables.join(""));
  // rating plate on the front face
  const m = k.sideMatrix([30, BOX.y + BOX.d + 0.01], Z_CUT - 1.5, P, "left");
  out.push(`<g transform="${m}"><rect x="0" y="0" width="26" height="7" rx=".6" style="fill:var(--anatomy-paper);stroke:var(--anatomy-mid);stroke-width:.3"/><text class="iso-face-text" data-tone="mid" x="1.6" y="4.6" font-size="2.6">Ex eb IIC T4 · MDP 10 W</text></g>`);
  return out.join("");
}

const START = { n: 6, amps: 16, volts: 230, dirty: false };
const fig = k.figureSvg({
  width: W, height: H,
  label: "An Ex e terminal box on a bench with its lid off and front walls cut away. A DIN rail carries sixteen terminals with wiring ducts either side. A drum of diethyl ether stands nearby. Too much current heats the box past its T4 rating; too much voltage, especially on a dirty surface, tracks or flashes over between terminals.",
  body: [plate(), `<g data-part="box">${boxBack()}${terminals()}${boxFront()}</g>`, drum()],
});

const DATA = {
  W, H, camera: glCamera(P), P, MODEL, TERM_D, N_TERM, V_MIN, V_MAX, I_MAX, PITCH, TW, X0, TERM_Y, Z_TT, CL_A, CL_B, TRACK, BOX, Z_FLOOR, start: START,
  ductBack: BOX.y + 7 + 9, ductFront: TERM_Y + TERM_D + 3,
  pivots: { drum: at([DRUM[0] - DRUM_R, DRUM[1], 0]), box: at([0, 0, 0]) },
};

const GLSL = `
uniform float uLight;
uniform float uHeat;
uniform float uN;
uniform float uTrack;
uniform float uTrackOn;
uniform float uFlash;
uniform float uBoom;
const float X0=${X0.toFixed(2)}, PITCH=${PITCH.toFixed(2)}, TW=${TW.toFixed(2)}, ZT=${Z_TT.toFixed(2)};
const float CA=${CL_A.toFixed(2)}, CB=${CL_B.toFixed(2)};
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
float segDist(vec2 p,vec2 a,vec2 b){vec2 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);return length(pa-ba*h);}
void main(){
  vec2 vb=viewOf(gl_FragCoord.xy);
  vec4 o=vec4(0.);
  // hot terminals: glow on the clamp faces of the populated ones
  float glow=0.;
  if(uHeat>.01){
    vec3 p=onFloor(vb,ZT);
    for(int i=0;i<16;i++){
      float on=step(float(i)+.5,uN);
      float cx=X0+float(i)*PITCH+TW*.5;
      float d1=length(vec2(p.x-cx,(p.y-CA)*.8)), d2=length(vec2(p.x-cx,(p.y-CB)*.8));
      glow+=on*(exp(-pow(d1/2.6,2.))+exp(-pow(d2/2.6,2.)));
    }
    // shimmer above the box
    vec3 q=onFloor(vb,ZT+8.);
    float inBox=smoothstep(${(BOX.x + 6).toFixed(1)},${(BOX.x + 18).toFixed(1)},q.x)*(1.-smoothstep(${(BOX.x + BOX.w - 18).toFixed(1)},${(BOX.x + BOX.w - 6).toFixed(1)},q.x))*smoothstep(${(BOX.y + 6).toFixed(1)},${(BOX.y + 18).toFixed(1)},q.y)*(1.-smoothstep(${(BOX.y + BOX.d - 18).toFixed(1)},${(BOX.y + BOX.d - 6).toFixed(1)},q.y));
    float sh=inBox*smoothstep(.45,.9,fbm2(q.xy*.06+vec2(0.,-uTime*.8)))*.35;
    o=over(fireInk((glow*1.1+sh)*uHeat*uHeat*1.4,clamp(uHeat*1.1-.2,0.,1.)),o);
  }
  // creepage: a crawling spark at the tip of the carbon track
  if(uTrackOn>.002){
    float xa=X0+${TRACK.toFixed(1)}*PITCH+TW*.5, xb=xa+PITCH;
    float tx=mix(xa,xb,uTrack);
    vec2 tip=project(vec3(tx,CA,ZT+.3));
    float d=length(vb-tip)/uK;
    float fl=.55+.45*noise2(vec2(uTime*40.,1.3));
    float e=(exp(-pow(d/.45,2.))*2.+exp(-pow(d/2.2,2.))*.6)*fl*uTrackOn;
    o=over(arcInk(e),o);
  }
  // clearance: a flashover arc through the air between the clamps
  if(uFlash>.002){
    float xa=X0+${TRACK.toFixed(1)}*PITCH+TW*.5, xb=xa+PITCH;
    vec2 a=project(vec3(xa,CA,ZT+.4)), b=project(vec3(xb,CA,ZT+.4));
    float t=clamp(dot(vb-a,b-a)/dot(b-a,b-a),0.,1.);
    vec2 n2=normalize(vec2(-(b-a).y,(b-a).x));
    float bow=-sin(t*3.1416)*2.2*uK;
    float jag=(noise2(vec2(t*10.,uTime*70.))-.5)*1.4*uK*sin(t*3.1416);
    float d=segDist(vb-n2*(bow+jag)-vec2(0.,bow*.6),a,b)/uK;
    float c=length(vb-mix(a,b,.5))/uK;
    float e=(exp(-pow(d/.35,2.))*2.4+exp(-pow(c/9.,2.))*.9)*uFlash;
    o=over(arcInk(e),o);
  }
  // the box fails and the ether goes up
  if(uBoom>0.){
    float c=uBoom;
    vec3 C=vec3(0.,-4.,ZT+4.+30.*c);
    vec2 dv=(vb-project(C))/uK;
    float d=length(dv);
    float R=18.+80.*(1.-exp(-c/.2));
    float n=fbm3(vec3(dv*.045,c*1.6));
    float shell=exp(-pow((d-R*(.84+.28*n))/(7.+R*.13),2.));
    float core=(1.-smoothstep(R*.35,R*(.8+.25*n),d))*(.5+.7*n);
    float life=smoothstep(0.,.05,c)*exp(-c/.6);
    vec3 fp=onFloor(vb,0.);
    float ring=exp(-pow((length(fp.xy)-(30.+380.*c))/6.,2.))*exp(-c/.32)*.7;
    float ef=smoothstep(0.,80.,min(min(vb.x,uView.x-vb.x),min(vb.y,uView.y-vb.y)));
    float e=((shell*1.4+core*1.1)*life+ring)*ef;
    float hot=(core*life*exp(-c/.4)*1.4+ring*.6)*ef+e*.35;
    o=over(fireInk(e,clamp(hot/max(e,1e-4),0.,1.)),o);
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
const gl = glLayer({ canvas: stage.querySelector(".fx-gl"), fragment: ${JSON.stringify(GLSL)}, view: [D.W, D.H], camera: D.camera, uniforms: ["uHeat", "uN", "uTrack", "uTrackOn", "uFlash", "uBoom"], fixed: { uLight: LIGHT } });
if (gl) stage.setAttribute("data-gl", "");

let n = D.start.n, amps = D.start.amps, volts = D.start.volts, dirty = D.start.dirty;
let on = false, temp = M.tAmb, track = 0, flashAt = -10, boomAt = null, cause = "";
let frame = 0, last = 0, now = 0, visible = false, touring = true, slow = false, tourClock = 0, tourStep = -1, lastShot = "";
const BOOM_END = 4.2;
const booming = () => boomAt !== null && now - boomAt < BOOM_END + 0.3;
const power = () => n * amps * amps * M.rCircuit;
const tSteady = () => M.tAmb + M.rth * power();
const creepLimit = () => dirty ? M.creepDirty : M.creepClean;

const wiresG = q("wires"), trackG = q("track"), boxG = q("box"), drumG = q("drum"), flash = stage.querySelector(".fx-flash");
function drawWires() {
  let s = "";
  for (let i = 0; i < D.N_TERM; i++) {
    const cx = D.X0 + i * D.PITCH + D.TW / 2;
    const live = i < n;
    if (!live) continue;
    const zw = D.Z_TT - 6;
    const a = [[cx, D.TERM_Y, zw], [cx, D.TERM_Y - 3, zw + 1.5], [cx, D.ductBack + 1, D.Z_FLOOR + 14.2], [cx, D.ductBack - 2, D.Z_FLOOR + 14.2]].map((p) => iso(p, P));
    const b = [[cx, D.TERM_Y + D.TERM_D, zw], [cx, D.TERM_Y + D.TERM_D + 1.5, zw + 1.5], [cx, D.ductFront + 3, D.Z_FLOOR + 14.2]].map((p) => iso(p, P));
    s += '<path class="iso-line iso-wire" data-tone="' + (on ? "hi" : "mid") + '" d="' + pathOf(a) + pathOf(b) + '"/>';
  }
  wiresG.innerHTML = s;
}
function drawTrack() {
  if (track <= 0.001) { trackG.innerHTML = ""; return; }
  const xa = D.X0 + D.TRACK * D.PITCH + D.TW / 2, xb = xa + D.PITCH;
  const pts = [];
  const N = 24;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * track;
    const x = xa + (xb - xa) * t;
    // the creepage path dips into the gap between the two terminal bodies
    const gapMid = D.X0 + (D.TRACK + 1) * D.PITCH - (D.PITCH - D.TW) / 2;
    const dip = Math.max(0, 1 - Math.abs(x - gapMid) / 0.9) * 3;
    const wob = Math.sin(i * 2.3) * 0.25;
    pts.push(iso([x, D.CL_A + wob, D.Z_TT - dip], P));
  }
  trackG.innerHTML = '<path class="iso-line iso-track" d="' + pathOf(pts) + '"/>';
}

const ui = {
  n: document.querySelector("#n"), nOut: document.querySelector("#n-out"), amps: document.querySelector("#amps"), aOut: document.querySelector("#amps-out"),
  heatFill: document.querySelector("#heat-fill"), heatOut: document.querySelector("#heat-out"),
  volts: document.querySelector("#volts"), vOut: document.querySelector("#volts-out"), creep: document.querySelector("#creep-mark"), clear: document.querySelector("#clear-mark"),
  surf: [...document.querySelectorAll("[data-surf]")], on: document.querySelector("#energise"), slow: document.querySelector("#slow"), tour: document.querySelector("#tour"),
  shot: document.querySelector("#shot"),
};
const sliding = {};
function syncUi() {
  const p = power();
  for (const [key, el, val] of [["n", ui.n, n], ["amps", ui.amps, amps], ["volts", ui.volts, volts]]) if (!sliding[key]) el.value = val;
  ui.nOut.textContent = n + " of 16";
  ui.aOut.textContent = amps + " A";
  ui.vOut.textContent = volts + " V";
  ui.heatFill.style.width = (clamp(p / (2 * M.mdp), 0, 1) * 100).toFixed(1) + "%";
  ui.heatFill.dataset.bad = String(p > M.mdp);
  ui.heatOut.textContent = p.toFixed(1) + " W · " + Math.round(temp) + " °C";
  const pos = (v) => ((v - D.V_MIN) / (D.V_MAX - D.V_MIN) * 100).toFixed(1) + "%";
  ui.creep.style.left = pos(creepLimit());
  ui.clear.style.left = pos(M.clearance);
  ui.surf.forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.surf === "dirty") === dirty)));
  ui.on.setAttribute("aria-pressed", String(on));
  ui.on.textContent = on ? "DE-ENERGISE" : "ENERGISE";
  ui.slow.setAttribute("aria-pressed", String(slow));
  ui.tour.setAttribute("aria-pressed", String(touring));
}
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };

function blowUp(why) {
  if (boomAt !== null) return;
  boomAt = now + 0.15; cause = why; on = false;
  say(why === "heat" ? "Boom. " + power().toFixed(1) + " W in a box rated for " + M.mdp + " W: the surface hit " + Math.round(temp) + " °C, past the ether's " + M.ait + " °C ignition temperature. MDP is there to keep the box inside T4."
    : why === "creep" ? "Boom. " + volts + " V across a " + (dirty ? "dusty, damp" : "clean") + " terminal surface rated for " + creepLimit() + " V of creepage. The track crept across the plastic, bridged, and arced."
    : "Boom. " + volts + " V jumped the air gap between terminals: the clearance is only good for " + M.clearance + " V. Clearance doesn't care how clean it is.");
}

function chaos() {
  if (boomAt === null) return { c: -1, back: 0 };
  const c = now - boomAt;
  if (c < 0 || c > BOOM_END) return { c: -1, back: 0 };
  return { c, back: 1 - sm(3.0, 3.9, c) };
}
const tip = (c, delay, target) => { const u = Math.max(0, c - delay); return u <= 0 ? 0 : target * (1 - Math.exp(-u / 0.11) * Math.cos(u * 13)); };

function step(dt) {
  if (on && boomAt === null) {
    temp += (tSteady() - temp) * (1 - Math.exp(-dt / M.tau));
    if (volts > M.clearance) { flashAt = now; blowUp("clear"); }
    else if (volts > creepLimit()) {
      const over = volts / creepLimit() - 1;
      track = Math.min(1, track + dt * (0.18 + over * 0.6));
      if (track >= 1) blowUp("creep");
    }
    if (temp >= M.ait) blowUp("heat");
  } else if (boomAt === null) {
    temp += (M.tAmb - temp) * (1 - Math.exp(-dt / (M.tau * 1.6)));
  }
}

function draw() {
  drawWires(); drawTrack();
  const K = chaos();
  if (K.c >= 0) {
    const c = K.c;
    drumG.setAttribute("transform", "rotate(" + (tip(c, 0.05, -82) * K.back).toFixed(1) + " " + D.pivots.drum[0].toFixed(1) + " " + D.pivots.drum[1].toFixed(1) + ")");
    const hop = c < 0.6 ? -40 * Math.sin(c / 0.6 * Math.PI) : 0;
    boxG.setAttribute("transform", "translate(0 " + (hop * K.back).toFixed(1) + ") rotate(" + (8 * Math.sin(Math.min(c, 0.6) / 0.6 * Math.PI) * K.back).toFixed(1) + " " + D.pivots.box[0].toFixed(1) + " " + D.pivots.box[1].toFixed(1) + ")");
    const A = 7 * Math.exp(-c / 0.35);
    stage.style.transform = "translate(" + (A * Math.sin(c * 90)).toFixed(1) + "px," + (A * Math.cos(c * 71)).toFixed(1) + "px)";
    flash.style.opacity = (0.8 * burst(c, 0.03, 0.22)).toFixed(3);
  } else if (boomAt !== null && now - boomAt > BOOM_END) {
    boomAt = null; temp = M.tAmb; track = 0;
    drumG.removeAttribute("transform"); boxG.removeAttribute("transform");
    stage.style.transform = ""; flash.style.opacity = "0";
    say("Reset. Fewer circuits, less current, lower voltage or a cleaner box.");
  }
  if (gl) {
    const heat = clamp((temp - 55) / (M.ait - 55), 0, 1.2);
    const tOn = on && track > 0 && boomAt === null ? 1 : (boomAt !== null && cause === "creep" ? Math.max(0, 1 - (now - boomAt) * 4) : 0);
    const fl = burst(now - flashAt, 0.01, 0.25);
    gl.draw({ uHeat: K.c >= 0 ? heat * Math.max(0, 1 - K.c * 2) : heat, uN: n, uTrack: track, uTrackOn: tOn, uFlash: fl, uBoom: K.c }, now);
  }
  const p = power();
  const t4 = temp > M.t4 ? "over T4" : "T4 ok";
  const ins = volts > M.clearance ? "clearance gone" : volts > creepLimit() ? "creepage over" : "insulation ok";
  const text = K.c >= 0 ? (K.c < 3.0 ? "BOOM · " + (cause === "heat" ? "hot surface lit the ether" : cause === "creep" ? "tracking arc" : "flashover") : "resetting…")
    : (on ? "LIVE · " : "OFF · ") + p.toFixed(1) + " W / " + M.mdp + " W MDP · " + Math.round(temp) + " °C · " + t4 + " · " + volts + " V · " + ins;
  if (readout.textContent !== text) readout.textContent = text;
  if (on && boomAt === null) {
    if (temp > M.t4) say("Over MDP: the surface is at " + Math.round(temp) + " °C, past T4's " + M.t4 + " °C. The ether lights at about " + M.ait + " °C…");
    else if (track > 0) say("Creepage exceeded: a carbon track is crawling across the terminal surface…");
    else if (p > M.mdp) say("Over MDP (" + p.toFixed(1) + " W). Watch the temperature climb…");
    else say("Live and happy: " + p.toFixed(1) + " W of " + M.mdp + " W, " + Math.round(temp) + " °C, insulation fine.");
  }
}

// demo: a happy box, then each way to kill it
const TOUR = [
  { n: 6, amps: 16, volts: 230, dirty: false, hold: 4.5 },
  { n: 16, amps: 22, volts: 230, dirty: false, hold: 7 },
  { n: 8, amps: 14, volts: 400, dirty: false, hold: 3.5 },
  { n: 8, amps: 14, volts: 400, dirty: true, hold: 6 },
  { n: 4, amps: 10, volts: 900, dirty: false, hold: 5 },
];
let tourEnd = 0;
function tick(t) {
  const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
  last = t;
  const sdt = dt * (slow ? 0.12 : 1);
  now += sdt;
  if (touring && !booming()) {
    tourClock += dt;
    if (tourStep < 0 || tourClock > tourEnd) {
      tourStep = (tourStep + 1) % TOUR.length;
      const s = TOUR[tourStep];
      n = s.n; amps = s.amps; volts = s.volts; dirty = s.dirty;
      if (tourStep === 0 || tourStep === 2 || tourStep === 4 || tourStep === 1) { temp = M.tAmb; track = 0; }
      on = true; tourEnd = tourClock + s.hold;
    }
  }
  step(sdt);
  draw(); syncUi();
  const busy = touring || on || boomAt !== null || Math.abs(temp - M.tAmb) > 0.5 || drag;
  frame = visible && busy ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { touring = false; };
const guard = (fn) => (...a) => { takeOver(); if (booming()) return; fn(...a); run(); };
const setN = guard((v) => { n = clamp(Math.round(v), 1, 16); });
const setA = guard((v) => { amps = clamp(Math.round(v), 0, D.I_MAX); });
const setV = guard((v) => { volts = clamp(Math.round(v / 10) * 10, D.V_MIN, D.V_MAX); if (volts < creepLimit()) track = 0; });
const setDirty = guard((d) => { dirty = d; if (volts < creepLimit()) track = 0; });
const toggle = guard(() => { on = !on; if (!on) track = 0; });
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;

for (const [key, el, fn] of [["n", ui.n, setN], ["amps", ui.amps, setA], ["volts", ui.volts, setV]]) {
  el.addEventListener("input", () => { sliding[key] = true; fn(+el.value); });
  el.addEventListener("change", () => { sliding[key] = false; run(); });
}
ui.surf.forEach((b) => b.addEventListener("click", () => setDirty(b.dataset.surf === "dirty")));
ui.on.addEventListener("click", toggle);
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; tourClock = 0; } else on = false; run(); });

let drag = null;
stage.addEventListener("pointerdown", (ev) => { drag = { x: ev.clientX, y: ev.clientY, from: amps, moved: false }; stage.setPointerCapture(ev.pointerId); });
stage.addEventListener("pointermove", (ev) => {
  if (!drag) return;
  const dy = drag.y - ev.clientY;
  if (!drag.moved && Math.hypot(dy, ev.clientX - drag.x) < 5) return;
  drag.moved = true;
  setA(drag.from + dy / (stage.getBoundingClientRect().height * 0.5) * D.I_MAX);
});
stage.addEventListener("pointerup", () => { if (!drag) return; const was = drag; drag = null; if (!was.moved) toggle(); else run(); });
stage.addEventListener("pointercancel", () => { drag = null; });
stage.addEventListener("keydown", (ev) => {
  const map = { ArrowUp: () => setA(amps + 1), ArrowDown: () => setA(amps - 1), ArrowRight: () => setV(volts + 10), ArrowLeft: () => setV(volts - 10), "+": () => setN(n + 1), "-": () => setN(n - 1), d: () => setDirty(!dirty), " ": toggle, Enter: toggle, s: () => { slow = !slow; run(); } };
  if (map[ev.key]) { ev.preventDefault(); map[ev.key](); }
});
window.__fig = { freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
syncUi(); draw();
`;

const CSS = `.fx-stage{position:relative;cursor:ns-resize;touch-action:none}
.fx-layer{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.fx-gl{display:block}
body[data-theme="dark"] .fx-gl{mix-blend-mode:screen}
.fx-flash{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(closest-side at 42% 45%,#fff8e8 0%,#ffd9a0 40%,rgba(255,170,90,0) 100%)}
.iso-plate{overflow:hidden}
.iso-cable{stroke-width:1.5}
.iso-wire{stroke-width:.8}
.iso-track{stroke:#5a3418;stroke-width:1.5;fill:none;stroke-linecap:round}
body[data-theme="dark"] .iso-track{stroke:#a4572a}
.ctl{display:grid;gap:12px;margin:14px 0 6px;font-family:var(--anatomy-mono);font-size:12px;color:var(--anatomy-mid)}
.ctl-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ctl-label{min-width:64px;text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:var(--anatomy-lo)}
.ctl button{font:inherit;color:var(--anatomy-mid);background:transparent;border:1px solid var(--anatomy-lo);border-radius:6px;padding:7px 10px;cursor:pointer;line-height:1.15;text-align:left;min-height:36px}
.ctl button:hover{border-color:var(--anatomy-mid)}
.ctl button[aria-pressed="true"]{color:var(--anatomy-lit);border-color:var(--anatomy-lit)}
.ctl #energise{border-color:var(--anatomy-lit);color:var(--anatomy-lit);padding:7px 14px;font-weight:600;letter-spacing:.06em;min-width:128px;text-align:center}
.ctl #energise[aria-pressed="true"]{background:var(--anatomy-lit);color:var(--anatomy-paper)}
.slide{position:relative;flex:1;min-width:110px}
.slide input{width:100%;accent-color:var(--anatomy-lit);margin:0}
.slide.marked{padding-top:16px}
.ctl output{min-width:84px;text-align:right;color:var(--anatomy-hi,var(--anatomy-mid))}
.meter{position:relative;flex:1;min-width:110px;height:10px;margin-top:14px;border:1px solid var(--anatomy-lo);border-radius:5px}
#heat-fill{position:absolute;left:0;top:0;bottom:0;border-radius:4px;background:var(--anatomy-mid);transition:width .15s}
#heat-fill[data-bad="true"]{background:#ff8a3d}
.mark{position:absolute;top:0;bottom:2px;width:0;border-left:1px dashed var(--anatomy-lit);pointer-events:none;transition:left .3s}
.mark::after{content:attr(data-label);position:absolute;top:0;left:4px;font-size:10px;white-space:nowrap;color:var(--anatomy-lit)}
#mdp-mark{left:50%;top:-14px;bottom:-3px}
#clear-mark{border-left-style:solid}
#shot{min-height:2.6em;font-size:12px;line-height:1.4}
@media (max-width:520px){.ctl-label{min-width:48px}.ctl button{padding:7px 8px}.ctl output{min-width:64px}}`;

const stageHtml = `<div class="iso-stage fx-stage" tabindex="0" role="slider" aria-label="Current per circuit: drag up and down or arrow keys; left and right change voltage; space energises" aria-valuemin="0" aria-valuemax="${I_MAX}" aria-valuenow="${START.amps}">${fig}<canvas class="fx-layer fx-gl" aria-hidden="true"></canvas><div class="fx-flash" aria-hidden="true"></div></div>`;

const CONTROLS = `<div class="ctl" role="group" aria-label="Test controls">
  <div class="ctl-row"><span class="ctl-label">Circuits</span><div class="slide"><input id="n" type="range" min="1" max="16" step="1" value="${START.n}" aria-label="Populated circuits"></div><output id="n-out">${START.n} of 16</output></div>
  <div class="ctl-row"><span class="ctl-label">Current</span><div class="slide"><input id="amps" type="range" min="0" max="${I_MAX}" step="1" value="${START.amps}" aria-label="Current per circuit in amps"></div><output id="amps-out">${START.amps} A</output></div>
  <div class="ctl-row"><span class="ctl-label">Heat</span><div class="meter" aria-hidden="true"><span id="heat-fill"></span><span id="mdp-mark" class="mark" data-label="MDP 10 W"></span></div><output id="heat-out">0 W</output></div>
  <div class="ctl-row"><span class="ctl-label">Volts</span><div class="slide marked"><span id="creep-mark" class="mark" data-label="creepage"></span><span id="clear-mark" class="mark" data-label="clearance"></span><input id="volts" type="range" min="${V_MIN}" max="${V_MAX}" step="10" value="${START.volts}" aria-label="Working voltage"></div><output id="volts-out">${START.volts} V</output></div>
  <div class="ctl-row"><span class="ctl-label">Surface</span><button type="button" data-surf="clean" aria-pressed="true">Clean</button><button type="button" data-surf="dirty" aria-pressed="false">Dusty &amp; damp</button></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="energise" aria-pressed="false">ENERGISE</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
  <div id="shot" aria-live="polite">Set the circuits, current and voltage, pick clean or grubby, then ENERGISE.</div>
</div>`;

const card = k.plateHtml({
  fig: "Fig 5",
  title: "Ex e, MDP and creepage",
  hint: "Drag: amps · tap: power",
  readout: "",
  keys: [
    { mark: "lit", label: "Live terminals, heat, tracking and arcs" },
    { mark: "raised", label: "Terminal box, lid off, front walls cut away" },
  ],
  caption: "Ex e has no flamepath to save it. It works by never making a spark or a hot surface in the first place. Two ways that goes wrong. Heat: every circuit dissipates I²R, and the box is only certified to keep its surface inside T4 (135 °C) up to its maximum dissipated power. Insulation: creepage is the distance along the surface between terminals, and dirt and damp ruin it; clearance is the distance through air. Exceed either and you get an arc.",
  body: stageHtml,
});

const other = theme === "light" ? ["index.html", "Dark version"] : ["light.html", "Light version"];
const FOOT = `<p style="font-family:var(--anatomy-mono);font-size:11px;color:var(--anatomy-lo);margin:28px 0 8px;line-height:1.6">A toy, not a certified anything. T4 (135 °C) and diethyl ether's ~160 °C ignition temperature are real; the box's resistance, MDP and the creepage and clearance limits are made up to show the idea.<br>Built with <a href="https://github.com/wheresryan22/anatomy" style="color:inherit">Anatomy</a> by Ryan (MIT). · <a href="${other[0]}" style="color:inherit">${other[1]}</a> · <a href="../" style="color:inherit">More figures</a> · <a href="https://github.com/Dizzyfer/Anatomy/tree/main/ex-e-terminals" style="color:inherit">Source</a></p>`;
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "Ex e terminals", theme, body: `<style>${CSS}</style>${card.replace("<figcaption", CONTROLS + "<figcaption")}${FOOT}`, script: kitScript() + glScript() + LIVE.replace("__DATA__", JSON.stringify(DATA)), width: 700 }));
console.log("wrote", name);
