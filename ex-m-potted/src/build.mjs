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

// Toy model. The idea is real (IEC 60079-18: keep the gas away from the sparks by burying them in compound,
// with a minimum compound thickness, a compound temperature limit, and a fuse to cap fault current); the numbers are made up.
const MODEL = { tAmb: 40, perLoad: 0.55, limit: 110, tau: 2.0, coverMin: 5, coverMax: 13, coverLo: 1 };

const PLATE = { x: -96, y: -70, w: 214, d: 154, r: 8 };
const PLATE_H = 12, FOOT_H = 5;
const CUT = 6;
const HOUS = { x: -50, y: -38, w: 100, d: 76 };
const WALL = 3;
const Z0 = 4, ZB = 7, ZH = 44;
const INNER = { x: HOUS.x + WALL, y: HOUS.y + WALL, w: HOUS.w - 2 * WALL, d: HOUS.d - 2 * WALL };
const PCB_Z = [10, 11.5];
const RELAY = { x: 12, y: -16, w: 28, d: 22, z0: 11.5, z1: 29 };
const RES = { x: -14, y: 11, w: 20, d: 18, z0: 11.5, z1: 24 };
const PART_TOP = 29;
const SPARK = [RELAY.x + 22.5, CUT, RELAY.z1 - 5.6];
const HOT = [CUT, RES.y + 7, 16];
const FUSE = { x: -84, y: 44, w: 16, d: 24 };
const BOTTLES = [[86, -52], [104, -38]];

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [HOUS.x, HOUS.y, ZH + 2], [86, -52, 56], [104, -38, 56]],
  W, H, { pad: 22, azimuth: 45 },
);

const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const Dt = (points, style) => k.dotsSvg(points, style);
const depth2 = ([x, y]) => k.depthOf([x, y, 0], P);
const byDepth = (pts) => [...pts].sort((a, b) => depth2(a) - depth2(b));
const slab = (plan, z, h, r = 1.2, bevel = 0.5) => k.slabOf({ r, ...plan }, z, h, P, 4, bevel);
const lRing = ({ x, y, w, d }) => [[x, y], [x + w, y], [x + w, CUT], [CUT, CUT], [CUT, y + d], [x, y + d]];
const lSolid = (plan, z, h) => k.extrude(lRing(plan), z, h, P, { convex: false });

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
  out.push(k.faceTextSvg(k.topMatrix([-50, 76], 0, P, "x"), "ZONE 1", { size: 5, tone: "lo" }));
  return out.join("");
}

function bottle([x, y], i) {
  const R = 7.5, Hh = 42, out = [];
  out.push(S(k.cylinder(x, y, R + 1.2, 0, 2.4, P, 32), { tone: "lo" }));
  out.push(S(k.cylinder(x, y, R, 2.4, Hh, P, 40, 0.8), { tone: "hi", inner: L(k.sideArc(x, y, R, 2.4 + Hh * 0.62, P, 32) + k.sideArc(x, y, R, 2.4 + Hh * 0.78, P, 32), { tone: "faint" }) }));
  const top = 2.4 + Hh;
  out.push(S(k.cylinder(x, y, 5.2, top, 3, P, 32, 0.5), { tone: "hi" }));
  out.push(S(k.cylinder(x, y, 2.4, top + 3, 4, P, 20), { tone: "hi" }));
  out.push(S(k.cylinder(x, y, 4.2, top + 7, 1.6, P, 28), { tone: "hi" }));
  out.push(L(k.knurl(x, y, 4.2, top + 7, top + 8.6, 22, P), { tone: "lo" }));
  return `<g data-bottle="${i}">${out.join("")}</g>`;
}

function fuse() {
  const f = FUSE;
  const out = [`<path class="iso-halo" d="${k.haloOf({ ...k.insetPlan({ ...f, r: 2 }, -3) }, 0, 0.1, P)}"/>`];
  out.push(S(slab(f, 0, 7, 1.6, 0.4), { tone: "mid", inner: L(k.sideSeam({ ...f, r: 1.6 }, 3, P), { tone: "faint" }) }));
  // two clips
  for (const y of [f.y + 4, f.y + f.d - 7]) out.push(S(slab({ x: f.x + 4, y, w: 8, d: 3 }, 7, 4, 0.4, 0.2), { tone: "mid" }));
  out.push(`<g data-part="fuse-car">` + S(slab({ x: f.x + 5.5, y: f.y + 5, w: 5, d: f.d - 10 }, 8.5, 5, 2.4, 0.3), { tone: "hi", inner: L(k.segment([f.x + 5.5, f.y + 9, 13.5], [f.x + 10.5, f.y + 9, 13.5], P) + k.segment([f.x + 5.5, f.y + f.d - 9, 13.5], [f.x + 10.5, f.y + f.d - 9, 13.5], P), { tone: "lo" }) }) + `</g>`);
  out.push(`<g data-part="fuse-link" style="display:none"><path class="iso-line" data-tone="lit" style="stroke-width:.9" d="${k.pathOf([[f.x + 8, f.y + 5.5, 10.5], [f.x + 9.5, f.y + 9, 13], [f.x + 6.5, f.y + 13, 12], [f.x + 9, f.y + 17, 13], [f.x + 8, f.y + f.d - 5.5, 10.5]].map(at))}"/></g>`);
  out.push(k.faceTextSvg(k.topMatrix([f.x + 18, f.y + 8], 0, P, "x"), "FUSE", { size: 3.4, tone: "lo" }));
  // supply cable in, cable to the module gland
  const a = [[f.x + 8, f.y + f.d + 14, 0.8], [f.x + 8, f.y + f.d + 2, 0.8], [f.x + 8, f.y + f.d, 3]].map(at);
  const b = [[f.x + 8, f.y, 3], [f.x + 8, f.y - 2, 0.8], [f.x + 14, f.y - 4, 0.8], [-30, HOUS.y + HOUS.d + 9, 0.8], [-30, HOUS.y + HOUS.d + 5, 12]].map(at);
  out.push(`<path class="iso-line iso-cable" data-tone="mid" d="${k.pathOf(a)}${k.pathOf(b)}"/>`);
  return `<g data-part="fuse">${out.join("")}</g>`;
}

function housingBack() {
  const out = [`<path class="iso-halo" d="${k.haloOf({ ...k.insetPlan({ ...HOUS, r: 3 }, -7) }, 0, 0.1, P)}"/>`];
  for (const [x, y] of byDepth([[HOUS.x - 6, HOUS.y + 10], [HOUS.x - 6, HOUS.y + HOUS.d - 10], [HOUS.x + HOUS.w + 6, HOUS.y + 10]])) {
    out.push(S(slab({ x: x - 6, y: y - 5, w: 12, d: 10 }, 0, Z0, 2, 0.4), { tone: "mid" }));
    out.push(S(k.cylinder(x, y, 2.4, Z0, 1.2, P, 6), { tone: "mid" }));
  }
  out.push(S(lSolid(HOUS, Z0, ZB - Z0), { tone: "mid" }));
  out.push(S(slab({ x: HOUS.x, y: HOUS.y, w: HOUS.w, d: WALL }, ZB, ZH - ZB, 0.6, 0.3), { tone: "mid" }));
  out.push(S(slab({ x: HOUS.x, y: HOUS.y + WALL, w: WALL, d: HOUS.d - WALL }, ZB, ZH - ZB, 0.6, 0.3), { tone: "mid" }));
  out.push(L(k.segment([HOUS.x + 1.5, HOUS.y + 1.5, ZH], [HOUS.x + HOUS.w - 1.5, HOUS.y + 1.5, ZH], P) + k.segment([HOUS.x + 1.5, HOUS.y + 1.5, ZH], [HOUS.x + 1.5, HOUS.y + HOUS.d - 1.5, ZH], P), { tone: "faint" }));
  return out.join("");
}

function housingFront() {
  const out = [];
  const wx = { x: HOUS.x + HOUS.w - WALL, y: HOUS.y + WALL, w: WALL, d: CUT - HOUS.y - WALL };
  const wy = { x: HOUS.x + WALL, y: HOUS.y + HOUS.d - WALL, w: CUT - HOUS.x - WALL, d: WALL };
  out.push(S(slab(wx, ZB, ZH - ZB, 0.3, 0), { tone: "mid", inner: L(k.segment([wx.x + WALL, wx.y, 30], [wx.x + WALL, CUT, 30], P), { tone: "faint" }) }));
  out.push(S(slab(wy, ZB, ZH - ZB, 0.3, 0), { tone: "mid", inner: L(k.segment([wy.x, wy.y + WALL, 30], [CUT, wy.y + WALL, 30], P), { tone: "faint" }) }));
  // gland and label on the front face
  out.push(S(slab({ x: -33.4, y: HOUS.y + HOUS.d, w: 6.8, d: 2.2 }, 9, 6.8, 1.6, 0.3), { tone: "mid" }));
  out.push(S(slab({ x: -32.6, y: HOUS.y + HOUS.d + 2.2, w: 5.2, d: 3 }, 9.8, 5.2, 2.2, 0.3), { tone: "mid" }));
  const m = k.sideMatrix([-22, HOUS.y + HOUS.d + 0.01], 38, P, "left");
  out.push(`<g transform="${m}"><rect x="0" y="0" width="24" height="7" rx=".6" style="fill:var(--anatomy-paper);stroke:var(--anatomy-mid);stroke-width:.3"/><text class="iso-face-text" data-tone="mid" x="1.6" y="4.7" font-size="2.8">Ex mb IIC T4</text></g>`);
  return out.join("");
}

const START = { cover: 9, load: 70, fuse: true };
const fig = k.figureSvg({
  width: W, height: H,
  label: "A potted relay module on a bench, cut open to show the encapsulating compound. A relay and a power resistor sit in the compound on a circuit board; the relay's contacts spark at the cut face every time it switches. A fuse holder feeds the module and two gas bottles stand behind it.",
  body: [
    plate(),
    BOTTLES.map(bottle).join(""),
    fuse(),
    `<g data-part="module">${housingBack()}<g data-part="compound"></g>${housingFront()}</g>`,
  ],
});

const DATA = {
  W, H, camera: glCamera(P), P, MODEL, CUT, HOUS, INNER, ZB, ZH, PCB_Z, RELAY, RES, PART_TOP, SPARK, HOT, FUSE, start: START,
  pivots: { bottles: BOTTLES.map(([x, y]) => at([x + 7.5, y, 0])), module: at([0, 0, 0]), fuse: at([FUSE.x, FUSE.y + FUSE.d, 0]) },
};

const GLSL = `
uniform float uLight;
uniform float uSpark;
uniform float uHot;
uniform float uGasIn;
uniform float uFuse;
uniform float uBoom;
uniform float uZc;
const vec3 SP=vec3(${SPARK.map((v) => v.toFixed(2)).join(",")});
const vec3 HT=vec3(${HOT.map((v) => v.toFixed(2)).join(",")});
const vec3 FU=vec3(${(FUSE.x + 8).toFixed(1)},${(FUSE.y + FUSE.d / 2).toFixed(1)},12.);
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
vec4 hazeInk(float h){float a=(1.-exp(-h))*mix(.22,.2,uLight);return vec4(mix(vec3(.42,.66,.7),vec3(.22,.42,.46),uLight)*a,a);}
void main(){
  vec2 vb=viewOf(gl_FragCoord.xy);
  vec4 o=vec4(0.);
  // gas over the bench, kept out of the module's footprint
  float h=0.;
  for(int i=0;i<5;i++){
    float z=(float(i)+.5)*8.;
    vec3 p=onFloor(vb,z);
    vec2 q=abs(p.xy-vec2(${(HOUS.x + HOUS.w / 2).toFixed(1)},${(HOUS.y + HOUS.d / 2).toFixed(1)}))-vec2(${(HOUS.w / 2).toFixed(1)},${(HOUS.d / 2).toFixed(1)});
    float outside=smoothstep(0.,10.,max(q.x,q.y));
    float bench=smoothstep(-108.,-84.,p.x)*(1.-smoothstep(116.,140.,p.x))*smoothstep(-82.,-58.,p.y)*(1.-smoothstep(56.,80.,p.y));
    float n=fbm2(p.xy*.022+vec2(uTime*.03,-uTime*.02)+z*.05);
    h+=outside*bench*smoothstep(.35,.85,n)*exp(-z/16.)*.42;
  }
  o=hazeInk(h);
  // gas that has got in down the crack: a faint glow at the relay
  if(uGasIn>.002){
    float d=length(vb-project(SP+vec3(0.,0.,3.)))/uK;
    o=over(hazeInk(exp(-pow(d/6.,2.))*1.6*uGasIn),o);
  }
  // the hot resistor, seen in section on the x-cut
  if(uHot>.01){
    vec3 p=onWallX(vb,${CUT.toFixed(1)});
    vec2 q=abs(vec2(p.y-HT.y,p.z-HT.z))-vec2(${(RES.d / 2 - 1).toFixed(1)},${((RES.z1 - RES.z0) / 2 - 1).toFixed(1)});
    float body=1.-smoothstep(-.6,1.6,max(q.x,q.y));
    float halo=exp(-pow(length(vec2(p.y-HT.y,p.z-HT.z))/9.,2.))*.5;
    o=over(fireInk((body*1.3+halo)*uHot*uHot*1.6,clamp(uHot-.3,0.,1.)),o);
  }
  // contact spark at the relay, seen in section on the y-cut
  if(uSpark>.002){
    float d=length(vb-project(SP))/uK;
    float fl=.6+.4*noise2(vec2(uTime*50.,2.));
    o=over(arcInk((exp(-pow(d/.4,2.))*2.2+exp(-pow(d/2.,2.))*.7)*uSpark*fl),o);
  }
  // the fuse letting go
  if(uFuse>.002){
    float d=length(vb-project(FU))/uK;
    o=over(arcInk((exp(-pow(d/1.,2.))*2.+exp(-pow(d/6.,2.))*.8)*uFuse),o);
  }
  if(uBoom>0.){
    float c=uBoom;
    vec3 C=vec3(14.,0.,30.+30.*c);
    vec2 dv=(vb-project(C))/uK;
    float d=length(dv);
    float R=18.+80.*(1.-exp(-c/.2));
    float n=fbm3(vec3(dv*.045,c*1.6));
    float shell=exp(-pow((d-R*(.84+.28*n))/(7.+R*.13),2.));
    float core=(1.-smoothstep(R*.35,R*(.8+.25*n),d))*(.5+.7*n);
    float life=smoothstep(0.,.05,c)*exp(-c/.6);
    vec3 fp=onFloor(vb,0.);
    float ring=exp(-pow((length(fp.xy-vec2(14.,0.))-(30.+380.*c))/6.,2.))*exp(-c/.32)*.7;
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
const gl = glLayer({ canvas: stage.querySelector(".fx-gl"), fragment: ${JSON.stringify(GLSL)}, view: [D.W, D.H], camera: D.camera, uniforms: ["uSpark", "uHot", "uGasIn", "uFuse", "uBoom", "uZc"], fixed: { uLight: LIGHT } });
if (gl) stage.setAttribute("data-gl", "");

let cover = D.start.cover, load = D.start.load, fuseIn = D.start.fuse;
let running = false, contactClosed = false, nextSwitch = 0, sparkAt = -10, temp = M.tAmb, crack = 0, faultAt = null, fuseBlownAt = null, boomAt = null, cause = "";
let frame = 0, last = 0, now = 0, visible = false, touring = true, slow = false, tourClock = 0, tourStep = -1, tourEnd = 0, lastShot = "";
const BOOM_END = 4.2;
const booming = () => boomAt !== null && now - boomAt < BOOM_END + 0.3;
const tSteady = () => M.tAmb + M.perLoad * load;
const zc = () => D.PART_TOP + cover;
const thin = () => cover < M.coverMin;

const compG = q("compound"), modG = q("module"), fuseG = q("fuse"), fuseCar = q("fuse-car"), fuseLink = q("fuse-link"), flash = stage.querySelector(".fx-flash");
const bottleGs = [...stage.querySelectorAll("[data-bottle]")];
const lRing = ({ x, y, w, d }) => [[x, y], [x + w, y], [x + w, D.CUT], [D.CUT, D.CUT], [D.CUT, y + d], [x, y + d]];

// ---- the compound block, rebuilt when the cover changes ----
let builtFor = null;
function buildCompound() {
  const Z = zc(), I = D.INNER, C = D.CUT, out = [];
  out.push('<g class="resin">' + solidSvg(extrude(lRing(I), D.ZB, Z - D.ZB, P, { convex: false }), { tone: "mid", crease: "faint" }) + '</g>');
  // filler speckle on the two cut faces, kept clear of the parts
  const dots = [];
  for (let x = C + 1.5; x < I.x + I.w - 1; x += 3.1) for (let z = D.ZB + 1.2; z < Z - 0.8; z += 2.7) {
    const inPart = (x > D.RELAY.x - 0.6 && x < D.RELAY.x + D.RELAY.w + 0.6 && z > D.RELAY.z0 - 0.6 && z < D.RELAY.z1 + 0.6) || (z > D.PCB_Z[0] - 0.6 && z < D.PCB_Z[1] + 0.6);
    if (!inPart) dots.push(iso([x + ((z * 7) % 1.3), C + 0.02, z], P));
  }
  for (let y = C + 1.5; y < I.y + I.d - 1; y += 3.1) for (let z = D.ZB + 1.2; z < Z - 0.8; z += 2.7) {
    const inPart = (y > D.RES.y - 0.6 && y < D.RES.y + D.RES.d + 0.6 && z > D.RES.z0 - 0.6 && z < D.RES.z1 + 0.6) || (z > D.PCB_Z[0] - 0.6 && z < D.PCB_Z[1] + 0.6);
    if (!inPart) dots.push(iso([C + 0.02, y + ((z * 5) % 1.3), z], P));
  }
  out.push(dotsSvg(dots, { size: 0.32, tone: "lo" }));
  // PCB in section on both faces
  const pcbY = [[C, D.PCB_Z[0]], [I.x + I.w - 3, D.PCB_Z[0]], [I.x + I.w - 3, D.PCB_Z[1]], [C, D.PCB_Z[1]]].map(([x, z]) => iso([x, C + 0.03, z], P));
  const pcbX = [[C, D.PCB_Z[0]], [I.y + I.d - 3, D.PCB_Z[0]], [I.y + I.d - 3, D.PCB_Z[1]], [C, D.PCB_Z[1]]].map(([y, z]) => iso([C + 0.03, y, z], P));
  out.push('<path class="iso-pcb" d="' + pathOf(pcbY, true) + pathOf(pcbX, true) + '"/>');
  // relay in section on the y-cut
  const R = D.RELAY, onY = (x, z) => iso([x, C + 0.04, z], P);
  const rect = (x0, z0, x1, z1) => pathOf([onY(x0, z0), onY(x1, z0), onY(x1, z1), onY(x0, z1)], true);
  out.push('<path class="iso-part" d="' + rect(R.x, R.z0, R.x + R.w, R.z1) + '"/>');
  out.push(lineSvg(rect(R.x + 2.5, R.z0 + 2, R.x + 12, R.z1 - 2.5), { tone: "mid" }));
  const coil = []; for (let z = R.z0 + 3; z < R.z1 - 3; z += 1.1) coil.push(pathOf([onY(R.x + 3, z), onY(R.x + 11.5, z)]));
  out.push(lineSvg(coil.join(""), { tone: "faint" }));
  out.push(lineSvg(rect(R.x + 22, R.z1 - 6.6, R.x + 25, R.z1 - 5.6) + pathOf([onY(R.x + 25, R.z1 - 6.1), onY(R.x + R.w, R.z1 - 6.1)]), { tone: "mid" }));
  out.push('<g data-part="armature"></g>');
  // resistor in section on the x-cut
  const S2 = D.RES, onX = (y, z) => iso([C + 0.04, y, z], P);
  const rectX = (y0, z0, y1, z1) => pathOf([onX(y0, z0), onX(y1, z0), onX(y1, z1), onX(y0, z1)], true);
  out.push('<path class="iso-part" d="' + rectX(S2.y, S2.z0, S2.y + S2.d, S2.z1) + '"/>');
  out.push(lineSvg([4, 8, 12, 16].map((u) => pathOf([onX(S2.y + u, S2.z0 + 1), onX(S2.y + u, S2.z1 - 1)])).join(""), { tone: "faint" }));
  // top of the pour: a faint meniscus line against the walls
  out.push(lineSvg(onTop(lRing({ x: I.x + 1.2, y: I.y + 1.2, w: I.w - 2.4, d: I.d - 2.4 }), Z, P, true), { tone: "faint" }));
  out.push('<g data-part="crack"></g>');
  compG.innerHTML = out.join("");
  builtFor = cover;
}
function drawArmature() {
  const g = compG.querySelector('[data-part="armature"]'); if (!g) return;
  const R = D.RELAY, C = D.CUT, onY = (x, z) => iso([x, C + 0.05, z], P);
  const tipZ = contactClosed ? R.z1 - 5.6 : R.z1 - 3.4;
  g.innerHTML = '<path class="iso-line" data-tone="lit" style="stroke-width:1.2" d="' + pathOf([onY(R.x + 13, R.z1 - 2.6), onY(R.x + 21.8, tipZ)]) + '"/>' + dotsSvg([onY(R.x + 13, R.z1 - 2.6)], { size: 0.6, tone: "hi" });
}
function drawCrack() {
  const g = compG.querySelector('[data-part="crack"]'); if (!g) return;
  if (crack <= 0.001) { g.innerHTML = ""; return; }
  const Z = zc(), C = D.CUT, x0 = D.SPARK[0] - 1, pts = [];
  const N = 18;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * crack;
    const z = Z - (Z - D.PART_TOP) * t;
    const x = x0 + Math.sin(i * 1.9) * 0.9 + Math.sin(i * 0.7) * 0.6;
    pts.push(iso([x, C + 0.06, z], P));
  }
  const top = [[x0 - 3, C - 3], [x0 - 1, C - 1.4], [x0, C]].map(([x, y]) => iso([x, y, Z], P));
  g.innerHTML = '<path class="iso-crack" data-gas="' + (crack >= 1) + '" d="' + pathOf(top) + pathOf(pts) + '"/>';
}

// ---- ui ----
const ui = {
  cover: document.querySelector("#cover"), coverOut: document.querySelector("#cover-out"),
  load: document.querySelector("#load"), loadOut: document.querySelector("#load-out"),
  tFill: document.querySelector("#temp-fill"), tOut: document.querySelector("#temp-out"), lim: document.querySelector("#lim-mark"),
  fuseBtns: [...document.querySelectorAll("[data-fuse]")], run: document.querySelector("#run"), fault: document.querySelector("#fault"),
  slow: document.querySelector("#slow"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"),
};
const sliding = {};
const tpos = (t) => (clamp((t - 20) / (180 - 20), 0, 1) * 100).toFixed(1) + "%";
function syncUi() {
  if (!sliding.cover) ui.cover.value = cover;
  if (!sliding.load) ui.load.value = load;
  ui.coverOut.textContent = thin() ? "too thin" : "ok";
  ui.coverOut.dataset.bad = String(thin());
  ui.loadOut.textContent = load + " %";
  ui.tFill.style.width = tpos(temp);
  ui.tFill.dataset.state = temp > M.limit ? "hot" : "ok";
  ui.tOut.textContent = Math.round(temp) + " °C";
  ui.lim.style.left = tpos(M.limit);
  ui.fuseBtns.forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.fuse === "in") === fuseIn)));
  ui.run.setAttribute("aria-pressed", String(running));
  ui.run.textContent = running ? "STOP" : "SWITCH";
  ui.slow.setAttribute("aria-pressed", String(slow));
  ui.tour.setAttribute("aria-pressed", String(touring));
}
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };

function blowUp(why) {
  if (boomAt !== null) return;
  boomAt = now + 0.12; cause = why; running = false;
  say(why === "crack-thin" ? "Boom. The compound over the parts was too thin; heating and cooling cracked it right down to the relay. Gas followed the crack in, and the next contact spark lit it."
    : why === "crack-hot" ? "Boom. The parts ran hotter than the compound is rated for, it degraded and split, gas got in along the crack, and the next contact spark lit it."
    : "Boom. No fuse, so the short-circuit current just kept coming. The resistor cooked, the compound split open, and the burning part lit the gas. The fuse is part of the protection.");
}
function chaos() {
  if (boomAt === null) return { c: -1, back: 0 };
  const c = now - boomAt;
  if (c < 0 || c > BOOM_END) return { c: -1, back: 0 };
  return { c, back: 1 - sm(3.0, 3.9, c) };
}
const tip = (c, delay, target) => { const u = Math.max(0, c - delay); return u <= 0 ? 0 : target * (1 - Math.exp(-u / 0.11) * Math.cos(u * 13)); };

function step(dt) {
  if (boomAt !== null) return;
  const dead = fuseBlownAt !== null;
  const powered = running && !dead;
  // fault without a fuse: the resistor runs away
  if (faultAt !== null && !fuseIn) {
    temp += (420 - temp) * (1 - Math.exp(-dt / 0.35));
    crack = Math.min(1, crack + dt * 1.4);
    if (temp > 220 && crack >= 1) blowUp("fault");
    return;
  }
  const target = powered ? tSteady() : M.tAmb;
  temp += (target - temp) * (1 - Math.exp(-dt / (powered ? M.tau : M.tau * 1.6)));
  if (powered) {
    if (now >= nextSwitch) { contactClosed = !contactClosed; sparkAt = now; nextSwitch = now + 0.7; if (crack >= 1) blowUp(temp > M.limit ? "crack-hot" : "crack-thin"); }
    let rate = 0;
    if (thin()) rate += 0.06 + 0.3 * (M.coverMin - cover) / M.coverMin;
    if (temp > M.limit) rate += 0.15 + (temp - M.limit) / 5;
    if (rate > 0) crack = Math.min(1, crack + dt * rate * (4 / cover));
  }
}

function draw() {
  if (builtFor !== cover) buildCompound();
  drawArmature(); drawCrack();
  fuseCar.style.display = fuseIn ? "" : "none";
  fuseLink.style.display = fuseIn ? "none" : "";
  fuseCar.style.opacity = fuseBlownAt !== null ? "0.35" : "1";
  const K = chaos();
  if (K.c >= 0) {
    const c = K.c;
    bottleGs.forEach((bg, i) => bg.setAttribute("transform", "rotate(" + (tip(c, 0.05 + i * 0.05, 82) * K.back).toFixed(1) + " " + D.pivots.bottles[i][0].toFixed(1) + " " + D.pivots.bottles[i][1].toFixed(1) + ")"));
    const hop = c < 0.6 ? -40 * Math.sin(c / 0.6 * Math.PI) : 0;
    modG.setAttribute("transform", "translate(0 " + (hop * K.back).toFixed(1) + ") rotate(" + (-7 * Math.sin(Math.min(c, 0.6) / 0.6 * Math.PI) * K.back).toFixed(1) + " " + D.pivots.module[0].toFixed(1) + " " + D.pivots.module[1].toFixed(1) + ")");
    fuseG.setAttribute("transform", "rotate(" + (tip(c, 0.08, -40) * K.back).toFixed(1) + " " + D.pivots.fuse[0].toFixed(1) + " " + D.pivots.fuse[1].toFixed(1) + ")");
    const A = 7 * Math.exp(-c / 0.35);
    stage.style.transform = "translate(" + (A * Math.sin(c * 90)).toFixed(1) + "px," + (A * Math.cos(c * 71)).toFixed(1) + "px)";
    flash.style.opacity = (0.8 * burst(c, 0.03, 0.22)).toFixed(3);
  } else if (boomAt !== null && now - boomAt > BOOM_END) {
    boomAt = null; temp = M.tAmb; crack = 0; faultAt = null; fuseBlownAt = null; contactClosed = false;
    bottleGs.forEach((bg) => bg.removeAttribute("transform")); modG.removeAttribute("transform"); fuseG.removeAttribute("transform");
    stage.style.transform = ""; flash.style.opacity = "0";
    say("Reset. Thick enough pour, run it inside the compound's rating, and keep the fuse in.");
  }
  if (fuseBlownAt !== null && now - fuseBlownAt > 3.2) { fuseBlownAt = null; faultAt = null; say("Fuse replaced. Back in business."); }
  if (gl) {
    const hot = clamp((temp - 50) / 90, 0, 1.3);
    gl.draw({ uSpark: burst(now - sparkAt, 0.004, 0.09), uHot: K.c >= 0 ? hot * Math.max(0, 1 - K.c * 2) : hot, uGasIn: crack >= 1 && K.c < 0 ? 1 : 0, uFuse: fuseBlownAt !== null ? burst(now - fuseBlownAt, 0.005, 0.18) : 0, uBoom: K.c, uZc: zc() }, now);
  }
  const text = K.c >= 0 ? (K.c < 3.0 ? "BOOM · " + (cause === "fault" ? "unfused fault" : "gas reached the contacts") : "resetting…")
    : (fuseBlownAt !== null ? "FUSE BLOWN · module dead · safe" : (running ? "SWITCHING · " : "IDLE · ") + "load " + load + " % · " + Math.round(temp) + " °C · cover " + (thin() ? "too thin" : "ok") + " · crack " + Math.round(crack * 100) + " %");
  if (readout.textContent !== text) readout.textContent = text;
  if (boomAt === null && fuseBlownAt === null) {
    if (faultAt !== null && !fuseIn) say("Short circuit and no fuse. The resistor is cooking inside the compound…");
    else if (crack >= 1) say("The crack has reached the relay. Gas is in with the contacts…");
    else if (crack > 0) say(temp > M.limit ? "The parts are running hotter than the compound is rated for. It's degrading and cracking…" : "The pour is too thin. Every heat-up and cool-down opens the crack a bit further…");
    else if (running) say("Sparking away inside the compound. The gas can't reach the contacts, so nothing happens. That's Ex m.");
  }
}

function fault() {
  if (booming() || faultAt !== null) return;
  faultAt = now;
  if (fuseIn) { fuseBlownAt = now; running = false; say("Short circuit. The fuse blew in milliseconds, the module's dead, and nothing inside got hot. That's what the fuse is for."); }
  else { running = true; }
}

const TOUR = [
  { cover: 9, load: 70, fuse: true, act: "run", hold: 5 },
  { cover: 2, load: 70, fuse: true, act: "run", hold: 8 },
  { cover: 9, load: 145, fuse: true, act: "run", hold: 9 },
  { cover: 9, load: 70, fuse: true, act: "fault", hold: 4 },
  { cover: 9, load: 70, fuse: false, act: "fault", hold: 5 },
];
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
      cover = s.cover; load = s.load; fuseIn = s.fuse; crack = 0; temp = M.tAmb; faultAt = null; fuseBlownAt = null;
      running = true; nextSwitch = now + 0.3;
      if (s.act === "fault") faultAtPending = now + 1.2;
      tourEnd = tourClock + s.hold;
    }
    if (faultAtPending !== null && now >= faultAtPending) { faultAtPending = null; fault(); }
  }
  step(sdt);
  draw(); syncUi();
  const busy = touring || running || faultAt !== null || fuseBlownAt !== null || boomAt !== null || Math.abs(temp - M.tAmb) > 0.5 || drag || now - sparkAt < 0.3;
  frame = visible && busy ? requestAnimationFrame(tick) : 0;
}
let faultAtPending = null;
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { touring = false; faultAtPending = null; };
const guard = (fn) => (...a) => { takeOver(); if (booming()) return; fn(...a); run(); };
const setCover = guard((v) => { cover = clamp(Math.round(v), M.coverLo, M.coverMax); if (!thin() && temp <= M.limit) crack = 0; });
const setLoad = guard((v) => { load = clamp(Math.round(v), 0, 150); });
const setFuse = guard((v) => { fuseIn = v; });
const toggleRun = guard(() => { if (fuseBlownAt !== null) return; running = !running; nextSwitch = now + 0.15; });
const doFault = guard(() => fault());
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;

for (const [key, el, fn] of [["cover", ui.cover, setCover], ["load", ui.load, setLoad]]) {
  el.addEventListener("input", () => { sliding[key] = true; fn(+el.value); });
  el.addEventListener("change", () => { sliding[key] = false; run(); });
}
ui.fuseBtns.forEach((b) => b.addEventListener("click", () => setFuse(b.dataset.fuse === "in")));
ui.run.addEventListener("click", toggleRun);
ui.fault.addEventListener("click", doFault);
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; tourClock = 0; } else { running = false; } run(); });

let drag = null;
stage.addEventListener("pointerdown", (ev) => { drag = { x: ev.clientX, y: ev.clientY, from: load, moved: false }; stage.setPointerCapture(ev.pointerId); });
stage.addEventListener("pointermove", (ev) => {
  if (!drag) return;
  const dy = drag.y - ev.clientY;
  if (!drag.moved && Math.hypot(dy, ev.clientX - drag.x) < 5) return;
  drag.moved = true;
  setLoad(drag.from + dy / (stage.getBoundingClientRect().height * 0.5) * 150);
});
stage.addEventListener("pointerup", () => { if (!drag) return; const was = drag; drag = null; if (!was.moved) toggleRun(); else run(); });
stage.addEventListener("pointercancel", () => { drag = null; });
stage.addEventListener("keydown", (ev) => {
  const map = { ArrowUp: () => setLoad(load + 5), ArrowDown: () => setLoad(load - 5), ArrowRight: () => setCover(cover + 1), ArrowLeft: () => setCover(cover - 1), f: () => setFuse(!fuseIn), x: doFault, " ": toggleRun, Enter: toggleRun, s: () => { slow = !slow; run(); } };
  if (map[ev.key]) { ev.preventDefault(); map[ev.key](); }
});
window.__fig = { freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
buildCompound(); syncUi(); draw();
`;

const CSS = `.fx-stage{position:relative;cursor:ns-resize;touch-action:none}
.fx-layer{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.fx-gl{display:block}
body[data-theme="dark"] .fx-gl{mix-blend-mode:screen}
.fx-flash{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(closest-side at 50% 45%,#fff8e8 0%,#ffd9a0 40%,rgba(255,170,90,0) 100%)}
.iso-plate{overflow:hidden}
.iso-cable{stroke-width:1.5}
.resin .iso-fill{fill:#4a3a22}.resin .iso-top{fill:#5c4a2c}.resin .iso-shade{fill:#433420}.resin .iso-shade[data-shade="2"],.resin .iso-shade[data-shade="3"]{fill:#52412a}
body[data-theme="light"] .resin .iso-fill{fill:#d9c49a}body[data-theme="light"] .resin .iso-top{fill:#e6d4ad}body[data-theme="light"] .resin .iso-shade{fill:#cdb688}body[data-theme="light"] .resin .iso-shade[data-shade="2"],body[data-theme="light"] .resin .iso-shade[data-shade="3"]{fill:#d4bf94}
.iso-pcb{fill:#2f6b45;stroke:var(--anatomy-mid);stroke-width:.3}
body[data-theme="light"] .iso-pcb{fill:#5c9a6e}
.iso-part{fill:var(--anatomy-paper);stroke:var(--anatomy-mid);stroke-width:.45}
.iso-crack{fill:none;stroke:var(--anatomy-text,#222);stroke-width:.9;stroke-linejoin:bevel}
body[data-theme="dark"] .iso-crack{stroke:#0b0805;stroke-width:1.1}
.iso-crack[data-gas="true"]{stroke:#5fb6c2}
.ctl{display:grid;gap:12px;margin:14px 0 6px;font-family:var(--anatomy-mono);font-size:12px;color:var(--anatomy-mid)}
.ctl-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ctl-label{min-width:64px;text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:var(--anatomy-lo)}
.ctl button{font:inherit;color:var(--anatomy-mid);background:transparent;border:1px solid var(--anatomy-lo);border-radius:6px;padding:7px 10px;cursor:pointer;line-height:1.15;text-align:left;min-height:36px}
.ctl button:hover{border-color:var(--anatomy-mid)}
.ctl button[aria-pressed="true"]{color:var(--anatomy-lit);border-color:var(--anatomy-lit)}
.ctl #run{border-color:var(--anatomy-lit);color:var(--anatomy-lit);padding:7px 14px;font-weight:600;letter-spacing:.06em;min-width:96px;text-align:center}
.ctl #run[aria-pressed="true"]{background:var(--anatomy-lit);color:var(--anatomy-paper)}
.ctl #fault{border-color:#ff6a3d;color:#ff6a3d;font-weight:600;letter-spacing:.06em}
.slide{position:relative;flex:1;min-width:110px}
.slide.marked{padding-top:6px}
.slide input{width:100%;accent-color:var(--anatomy-lit);margin:0}
.ctl output{min-width:72px;text-align:right;color:var(--anatomy-hi,var(--anatomy-mid))}
.ctl output[data-bad="true"]{color:#ff6a3d}
.notch{position:absolute;top:0;bottom:-2px;width:0;border-left:2px solid var(--anatomy-mid);pointer-events:none}
.meter{position:relative;flex:1;min-width:110px;height:10px;margin-top:14px;border:1px solid var(--anatomy-lo);border-radius:5px}
#temp-fill{position:absolute;left:0;top:0;bottom:0;border-radius:4px;background:var(--anatomy-mid);transition:width .1s}
#temp-fill[data-state="hot"]{background:#ff7a3d}
.mark{position:absolute;top:-14px;bottom:-3px;width:0;border-left:1px dashed #ff6a3d;pointer-events:none}
.mark::after{content:attr(data-label);position:absolute;top:0;left:4px;font-size:10px;white-space:nowrap;color:#ff6a3d}
#shot{min-height:2.6em;font-size:12px;line-height:1.4}
@media (max-width:520px){.ctl-label{min-width:48px}.ctl button{padding:7px 8px}.ctl output{min-width:60px}}`;

const notchPos = ((MODEL.coverMin - MODEL.coverLo) / (MODEL.coverMax - MODEL.coverLo) * 100).toFixed(1);
const stageHtml = `<div class="iso-stage fx-stage" tabindex="0" role="slider" aria-label="Load: drag up and down or arrow keys; left and right change the compound cover; space switches the relay; X makes a fault" aria-valuemin="0" aria-valuemax="150" aria-valuenow="${START.load}">${fig}<canvas class="fx-layer fx-gl" aria-hidden="true"></canvas><div class="fx-flash" aria-hidden="true"></div></div>`;

const CONTROLS = `<div class="ctl" role="group" aria-label="Test controls">
  <div class="ctl-row"><span class="ctl-label">Cover</span><div class="slide marked"><span class="notch" style="left:${notchPos}%"></span><input id="cover" type="range" min="${MODEL.coverLo}" max="${MODEL.coverMax}" step="1" value="${START.cover}" aria-label="Compound cover over the parts: below the notch it is too thin"></div><output id="cover-out">ok</output></div>
  <div class="ctl-row"><span class="ctl-label">Load</span><div class="slide"><input id="load" type="range" min="0" max="150" step="5" value="${START.load}" aria-label="Load in percent"></div><output id="load-out">${START.load} %</output></div>
  <div class="ctl-row"><span class="ctl-label">Parts °C</span><div class="meter" aria-hidden="true"><span id="temp-fill"></span><span id="lim-mark" class="mark" data-label="compound limit"></span></div><output id="temp-out">40 °C</output></div>
  <div class="ctl-row"><span class="ctl-label">Fuse</span><button type="button" data-fuse="in" aria-pressed="true">Fitted</button><button type="button" data-fuse="out" aria-pressed="false">Missing</button></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="run" aria-pressed="false">SWITCH</button><button type="button" id="fault">FAULT</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
  <div id="shot" aria-live="polite">Hit SWITCH and watch the relay spark inside the compound. Then try to let the gas in.</div>
</div>`;

const card = k.plateHtml({
  fig: "Fig 6",
  title: "Ex m, encapsulation",
  hint: "Drag: load · tap: switch",
  readout: "",
  keys: [
    { mark: "lit", label: "Relay armature, contact sparks, the hot resistor" },
    { mark: "raised", label: "Potted module, cut open: compound, PCB, relay and resistor in section" },
  ],
  caption: "Ex m doesn't stop the sparks. It buries them. The relay and the hot parts sit in solid compound, so the gas never gets to them. That only holds while the compound is whole: too thin a pour cracks as it heats and cools, parts run hotter than the compound is rated for and it splits, and without the upstream fuse a short circuit cooks the parts until the compound fails. Any crack that reaches the contacts lets the gas in.",
  body: stageHtml,
});

const other = theme === "light" ? ["index.html", "Dark version"] : ["light.html", "Light version"];
const FOOT = `<p style="font-family:var(--anatomy-mono);font-size:11px;color:var(--anatomy-lo);margin:28px 0 8px;line-height:1.6">A toy, not a certified anything. The idea is real (encapsulation, minimum compound thickness, a compound temperature limit and fuse protection); the thicknesses, temperatures and timings are made up to show it.<br>Built with <a href="https://github.com/wheresryan22/anatomy" style="color:inherit">Anatomy</a> by Ryan (MIT). · <a href="${other[0]}" style="color:inherit">${other[1]}</a> · <a href="../" style="color:inherit">More figures</a> · <a href="https://github.com/Dizzyfer/Anatomy/tree/main/ex-m-potted" style="color:inherit">Source</a></p>`;
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "Ex m encapsulation", theme, body: `<style>${CSS}</style>${card.replace("<figcaption", CONTROLS + "<figcaption")}${FOOT}`, script: kitScript() + glScript() + LIVE.replace("__DATA__", JSON.stringify(DATA)), width: 700 }));
console.log("wrote", name);
