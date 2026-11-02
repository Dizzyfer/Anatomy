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

// Truth: minimum ignition energies (most easily ignited mixture in air), µJ.
// Cable: 200 pF/m, the default IEC 60079-25 lets you assume for ordinary 2/3-core cable when the real figure is unknown.
const GASES = [
  { id: "CH4", group: "I", mie: 280 },
  { id: "C3H8", group: "IIA", mie: 250 },
  { id: "C2H4", group: "IIB", mie: 70 },
  { id: "H2", group: "IIC", mie: 17 },
];
const PF_PER_M = 200;
const L_MAX = 5000;
const V_MIN = 6, V_MAX = 30;

const PLATE = { x: -170, y: -92, w: 330, d: 172, r: 8 };
const PLATE_H = 12, FOOT_H = 5;
const DIVIDE = -62;
const REEL = [-22, 36];
const REEL_R = 24;
const PST = [84, -20];
const BOTTLE_R = 7.5, BOTTLE_H = 42;
const BOTTLES = GASES.map((g, i) => ({ ...g, at: [140, -76 + i * 22] }));
const MOD_Y = [-58, -44, -30, -16];
const OUR = 2;
const SPARK = [PST[0] + 1.5, PST[1] + 10, 48.5];

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [-156, -66, 72], [PST[0], PST[1] - 18, 86], [140, -76, 56], [140, -10, 56]],
  W, H, { pad: 22, azimuth: 45 },
);

const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const depth2 = ([x, y]) => k.depthOf([x, y, 0], P);
const byDepth = (pts) => [...pts].sort((a, b) => depth2(a) - depth2(b));
const slab = (plan, z, h, r = 1.2, bevel = 0.5) => k.slabOf({ r, ...plan }, z, h, P, 4, bevel);

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
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  // the zone boundary: a hazard strip across the bench
  const strip = { x: DIVIDE - 3, y: PLATE.y + 6, w: 6, d: PLATE.d - 12, r: 0.6 };
  out.push(S(slab(strip, 0, 0.6, 0.6, 0), { tone: "lo", crease: "none" }));
  const stripes = [];
  for (let y = strip.y + 2; y < strip.y + strip.d - 6; y += 5) stripes.push(k.segment([strip.x, y, 0.6], [strip.x + strip.w, y + 4, 0.6], P));
  out.push(L(stripes.join(""), { tone: "mid" }));
  out.push(k.faceTextSvg(k.topMatrix([-158, 70], 0, P, "x"), "SAFE AREA", { size: 5, tone: "lo" }));
  out.push(k.faceTextSvg(k.topMatrix([-50, 70], 0, P, "x"), "ZONE 1", { size: 5, tone: "lo" }));
  return out.join("");
}

function panel() {
  const out = [];
  out.push(`<path class="iso-halo" d="${k.haloOf({ x: -164, y: -74, w: 32, d: 88, r: 2 }, 0, 0.1, P)}"/>`);
  out.push(S(slab({ x: -160, y: -70, w: 22, d: 80 }, 0, 3, 1.5, 0.4), { tone: "mid" }));
  out.push(D([at([-156, -66, 3]), at([-156, 6, 3]), at([-142, -66, 3]), at([-142, 6, 3])], { size: 0.45 }));
  out.push(S(slab({ x: -158, y: -66, w: 4, d: 72 }, 3, 68, 0.6, 0.3), { tone: "mid", inner: L(k.segment([-154, -66, 64], [-154, 6, 64], P) + k.segment([-154, -66, 12], [-154, 6, 12], P), { tone: "faint" }) }));
  out.push(D([at([-154, -62, 66]), at([-154, 2, 66]), at([-154, -62, 9]), at([-154, 2, 9])], { size: 0.5 }));
  // DIN rail
  out.push(S(slab({ x: -154, y: -62, w: 2, d: 64 }, 40, 4, 0.3, 0), { tone: "mid" }));
  // modules on the rail
  MOD_Y.forEach((y, i) => {
    const m = { x: -152, y, w: 16, d: 12 };
    const top = i === 0 ? 58 : 54;
    out.push(S(slab(m, 28, top - 28, 1, 0.4), { tone: i === OUR ? "hi" : "mid", inner: L(k.segment([m.x + m.w, y, 36], [m.x + m.w, y + m.d, 36], P), { tone: "faint" }) }));
    // terminal screws on top: two rows
    const screws = [];
    for (const yy of [y + 3, y + 6, y + 9]) for (const xx of [m.x + 3.5, m.x + m.w - 3.5]) screws.push([xx, yy]);
    out.push(L(screws.map(([sx, sy]) => k.ring(sx, sy, 1, top, P, 10)).join(""), { tone: "lo" }));
    out.push(D(screws.map(([sx, sy]) => at([sx, sy, top])), { size: 0.35 }));
    // status LED on the front face
    out.push(D([at([m.x + m.w + 0.05, y + 3, top - 5])], { size: 0.8, tone: i === OUR ? "hi" : "mid" }));
    if (i !== 0) out.push(k.faceTextSvg(k.sideMatrix([m.x + m.w + 0.05, y + 11], top - 9, P, "right"), "Ex ia", { size: 2.4, tone: i === OUR ? "mid" : "lo" }));
    else out.push(k.faceTextSvg(k.sideMatrix([m.x + m.w + 0.05, y + 11], top - 9, P, "right"), "24 V", { size: 2.4, tone: "lo" }));
  });
  return out.join("");
}

function bottle(b) {
  const [x, y] = b.at;
  const out = [];
  out.push(S(k.cylinder(x, y, BOTTLE_R + 1.2, 0, 2.4, P, 32), { tone: "lo" }));
  out.push(S(k.cylinder(x, y, BOTTLE_R, 2.4, BOTTLE_H, P, 40, 0.8), { tone: "hi", inner: L(k.sideArc(x, y, BOTTLE_R, 2.4 + BOTTLE_H * 0.62, P, 32) + k.sideArc(x, y, BOTTLE_R, 2.4 + BOTTLE_H * 0.78, P, 32), { tone: "faint" }) }));
  const top = 2.4 + BOTTLE_H;
  out.push(S(k.cylinder(x, y, 5.2, top, 3, P, 32, 0.5), { tone: "hi" }));
  out.push(S(k.cylinder(x, y, 2.4, top + 3, 4, P, 20), { tone: "hi" }));
  out.push(S(k.cylinder(x, y, 4.2, top + 7, 1.6, P, 28), { tone: "hi" }));
  out.push(L(k.knurl(x, y, 4.2, top + 7, top + 8.6, 22, P), { tone: "lo" }));
  out.push(D([at([x, y, top + 8.6])], { size: 0.55, tone: "hi" }));
  return `<g data-bottle="${b.id}">${out.join("")}</g>`;
}
function tags() {
  return BOTTLES.map((b) => {
    const [x, y] = b.at;
    const tag = { x: x - 36, y: y - 6, w: 24, d: 12, r: 1.4 };
    return S(k.slabOf(tag, 0, 1, P, 3, 0.3), { tone: "lo" }) +
      `<g data-tag="${b.id}">` + k.faceTextSvg(k.topMatrix([tag.x + 2.2, tag.y + 5], 1, P, "x"), b.id, { size: 3.8, tone: "mid" }) +
      k.faceTextSvg(k.topMatrix([tag.x + 2.2, tag.y + 9.6], 1, P, "x"), b.group + " " + b.mie + "µJ", { size: 2.6, tone: "lo" }) + `</g>`;
  }).join("");
}

function staticCable() {
  // barrier → floor → across the boundary → into the drum
  const pts = [[-136, -24, 31], [-130, -24, 22], [-124, -24, 1], [-90, -24, 1], [-70, 0, 1], [REEL[0] - REEL_R - 0.5, REEL[1], 1.5]].map(at);
  return `<path class="iso-line iso-cable" data-tone="mid" d="${k.pathOf(pts)}"/>` + D([pts[0], pts[pts.length - 1]], { size: 1, tone: "mid" });
}

function reelBase() {
  const [x, y] = REEL;
  const out = [`<path class="iso-halo" d="${k.haloOf({ x: x - REEL_R - 3, y: y - REEL_R - 3, w: 2 * REEL_R + 6, d: 2 * REEL_R + 6, r: REEL_R }, 0, 0.1, P)}"/>`];
  out.push(S(k.cylinder(x, y, REEL_R, 0, 2.2, P, 56, 0.5), { tone: "mid", inner: L(k.ring(x, y, REEL_R - 3, 2.2, P, 48), { tone: "faint" }) }));
  out.push(S(k.cylinder(x, y, 10, 2.2, 24, P, 40), { tone: "mid" }));
  return out.join("");
}
function reelTop() {
  const [x, y] = REEL;
  const out = [];
  out.push(S(k.cylinder(x, y, REEL_R, 26.2, 2.2, P, 56, 0.5), { tone: "mid", inner: L(k.ring(x, y, REEL_R - 3, 28.4, P, 48), { tone: "faint" }) }));
  const holes = [0, 1, 2, 3, 4, 5].map((i) => [x + Math.cos(i * Math.PI / 3 + 0.3) * 16, y + Math.sin(i * Math.PI / 3 + 0.3) * 16]);
  out.push(L(holes.map(([hx, hy]) => k.ring(hx, hy, 2.4, 28.4, P, 14)).join(""), { tone: "lo" }));
  out.push(S(k.cylinder(x, y, 3, 28.4, 4, P, 24), { tone: "mid" }));
  out.push(S(slab({ x: x - 2, y: y - 2.4, w: 19, d: 4.8 }, 32.4, 2.4, 1.2, 0.3), { tone: "mid" }));
  out.push(S(k.cylinder(x + 15, y, 1.8, 34.8, 9, P, 16), { tone: "mid" }));
  out.push(L(k.knurl(x + 15, y, 1.8, 36, 43.8, 14, P), { tone: "lo" }));
  // metre counter
  const c = { x: x - 9, y: y + 9, w: 18, d: 8 };
  out.push(S(slab(c, 28.4, 3.4, 1, 0.3), { tone: "hi" }));
  out.push(`<g data-part="counter">${k.faceTextSvg(k.topMatrix([c.x + 2, c.y + 5.6], 31.8, P, "x"), "0000 m", { size: 3.6, tone: "hi" })}</g>`);
  return out.join("");
}

function stand() {
  const [x, y] = PST;
  const out = [];
  const base = { x: x - 12, y: y - 12, w: 24, d: 24 };
  out.push(`<path class="iso-halo" d="${k.haloOf({ ...k.insetPlan({ ...base, r: 2 }, -3) }, 0, 0.1, P)}"/>`);
  out.push(S(slab(base, 0, 2.4, 1.6, 0.4), { tone: "mid" }));
  out.push(L(k.corners(base, 3.5).map(([bx, by]) => k.ring(bx, by, 1.6, 2.4, P, 12)).join(""), { tone: "lo" }));
  out.push(D(k.corners(base, 3.5).map(([bx, by]) => at([bx, by, 2.4])), { size: 0.45 }));
  // transmitter at the back of the pipe
  out.push(S(slab({ x: x - 2, y: y - 12, w: 4, d: 9 }, 64, 4, 0.8, 0.3), { tone: "mid" }));
  out.push(S(k.cylinder(x, y, 3.4, 2.4, 80, P, 28), { tone: "mid", inner: L(k.sideArc(x, y, 3.4, 60, P, 16) + k.sideArc(x, y, 3.4, 72, P, 16), { tone: "lo" }) }));
  out.push(S(k.cylinder(x, y, 3.9, 82.4, 1.6, P, 28), { tone: "mid" }));
  const tx = [x, y - 18];
  out.push(S(k.cylinder(tx[0], tx[1], 6.5, 54, 16, P, 40, 0.6), { tone: "hi" }));
  out.push(S(k.cylinder(tx[0], tx[1], 8, 70, 11, P, 48, 0.8), { tone: "hi", inner: L(k.sideArc(tx[0], tx[1], 8, 74, P, 32), { tone: "faint" }) }));
  out.push(L(k.ring(tx[0], tx[1], 5.6, 81, P, 40), { tone: "lo" }));
  out.push(k.faceTextSvg(k.topMatrix([tx[0], tx[1] + 1.4], 81, P, "x"), "12.0 mA", { size: 2.2, tone: "mid", anchor: "middle" }));
  out.push(S(k.cylinder(tx[0], tx[1], 2.4, 48, 6, P, 6), { tone: "mid" }));
  // U-bolts holding the JB
  out.push(L(k.sideArc(x, y, 3.8, 32, P, 16) + k.sideArc(x, y, 3.8, 42, P, 16), { tone: "mid" }));
  // junction box on the front of the pipe
  const jb = { x: x - 9, y: y + 4, w: 18, d: 12 };
  out.push(S(slab(jb, 26, 18, 1.2, 0.5), { tone: "hi", inner: L(k.sideSeam({ ...jb, r: 1.2 }, 41, P), { tone: "lo" }) }));
  out.push(D(k.corners(jb, 1.8).map(([jx, jy]) => at([jx, jy, 44])), { size: 0.45 }));
  // gland under the JB
  out.push(S(k.cylinder(x, y + 10, 2.4, 22, 4, P, 6), { tone: "mid" }));
  // terminal block on top
  out.push(S(slab({ x: x - 6, y: y + 7, w: 12, d: 6 }, 44, 3, 0.6, 0.2), { tone: "mid" }));
  out.push(L([[x - 3, y + 10], [x + 3, y + 10]].map(([sx, sy]) => k.ring(sx, sy, 1.2, 47, P, 12)).join(""), { tone: "lo" }));
  out.push(D([at([x - 3, y + 10, 47]), at([x + 3, y + 10, 47])], { size: 0.45 }));
  out.push(`<g data-part="wire"></g>`);
  return out.join("");
}

const START = { gas: 3, v: 24, len: 150 };
const fig = k.figureSvg({
  width: W, height: H,
  label: "A bench split into a safe area and Zone 1. In the safe area a zener barrier on a DIN rail feeds a cable that runs through a drum and across the bench to a junction box on a transmitter stand in Zone 1. Breaking the wire at the junction box makes a spark whose energy comes from the cable's stored charge.",
  body: [
    plate(),
    tags(),
    byDepth(BOTTLES.map((b) => b.at)).map((p) => bottle(BOTTLES.find((b) => b.at === p))).join(""),
    panel(),
    staticCable(),
    `<g data-part="reel">${reelBase()}<g data-part="pack"></g>${reelTop()}</g>`,
    `<g data-part="snake"></g>`,
    `<g data-part="stand">${stand()}</g>`,
  ],
});

const DATA = {
  W, H, camera: glCamera(P), P, GASES, PF_PER_M, L_MAX, V_MIN, V_MAX, REEL, REEL_R, PST, SPARK, DIVIDE, PLATE, start: START,
  pivots: {
    bottles: Object.fromEntries(BOTTLES.map((b, i) => [b.id, { at: at([b.at[0] + BOTTLE_R, b.at[1], 0]), left: k.iso([b.at[0], b.at[1], 0], P)[0] < k.iso(SPARK, P)[0], order: i }])),
    stand: at([PST[0] + 12, PST[1] + 12, 0]),
    reel: at([REEL[0], REEL[1], 0]),
  },
};

const GLSL = `
uniform float uLight;
uniform float uSpark;
uniform float uEnergy;
uniform float uBoom;
uniform float uLift;
const vec3 SP=vec3(${SPARK.map((v) => v.toFixed(2)).join(",")});
vec4 inkFor(vec3 seen,float cover){vec3 ab=1.-seen;float a=max(max(ab.r,max(ab.g,ab.b)),cover);return vec4(vec3(a)-ab,a);}
vec4 over(vec4 t,vec4 u){return t+u*(1.-t.a);}
vec4 fireInk(float e,float core){
  vec3 hue=mix(vec3(.55,.16,.06),mix(vec3(1.,.36,.08),vec3(1.,.66,.28),smoothstep(.45,1.,core)),smoothstep(0.,.5,core));
  vec3 c=tonemap(hue*e,1.4);float a=max(c.r,max(c.g,c.b));
  float la=1.-exp(-1.8*e);
  vec3 seen=mix(vec3(1.),mix(vec3(.82,.28,.06),vec3(1.,.78,.4),smoothstep(.6,1.,core)*smoothstep(.5,1.,la)),la);
  return mix(vec4(c,a),inkFor(seen,.9*smoothstep(.75,1.,la)*core)*la,uLight);
}
vec4 sparkInk(float e){
  vec3 c=tonemap(vec3(.62,.78,1.)*e,1.6)+tonemap(vec3(1.)*max(0.,e-1.2),1.);
  c=min(c,vec3(1.));float a=max(c.r,max(c.g,c.b));
  float la=1.-exp(-1.6*e);
  vec3 seen=mix(vec3(1.),mix(vec3(.18,.3,.85),vec3(.75,.85,1.),smoothstep(1.,2.,e)),la);
  return mix(vec4(c,a),inkFor(seen,.85*smoothstep(1.2,2.2,e))*la,uLight);
}
vec4 hazeInk(float h){
  float a=(1.-exp(-h))*mix(.22,.2,uLight);
  return vec4(mix(vec3(.42,.66,.7),vec3(.22,.42,.46),uLight)*a,a);
}
float segDist(vec2 p,vec2 a,vec2 b){vec2 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);return length(pa-ba*h);}
void main(){
  vec2 vb=viewOf(gl_FragCoord.xy);
  vec4 o=vec4(0.);
  // gas hanging over Zone 1
  float h=0.;
  for(int i=0;i<6;i++){
    float z=(float(i)+.5)*7.;
    vec3 p=onFloor(vb,z);
    float zone=smoothstep(${DIVIDE.toFixed(1)}+4.,${DIVIDE.toFixed(1)}+30.,p.x)*(1.-smoothstep(${(PLATE.x + PLATE.w - 30).toFixed(1)},${(PLATE.x + PLATE.w).toFixed(1)},p.x))
              *smoothstep(${(PLATE.y).toFixed(1)},${(PLATE.y + 26).toFixed(1)},p.y)*(1.-smoothstep(${(PLATE.y + PLATE.d - 26).toFixed(1)},${(PLATE.y + PLATE.d).toFixed(1)},p.y));
    float n=fbm2(p.xy*.022+vec2(uTime*.03,-uTime*.02)+z*.05);
    h+=zone*smoothstep(.35,.85,n)*exp(-z/16.)*.42;
  }
  vec4 haze=hazeInk(h);
  // the spark: an arc between the lifted wire and the terminal screw
  vec4 spark=vec4(0.);
  if(uSpark>.002){
    vec2 a=project(SP+vec3(-1.8,0.,uLift)), b=project(SP+vec3(1.5,0.,-1.4));
    vec2 q=vb;
    float t=clamp(dot(q-a,b-a)/dot(b-a,b-a),0.,1.);
    vec2 n2=normalize(vec2(-(b-a).y,(b-a).x));
    float jag=(noise2(vec2(t*9.,uTime*60.))-.5)*1.6*uK*sin(t*3.1416);
    float d=segDist(q-n2*jag,a,b)/uK;
    float k=sqrt(clamp(uEnergy,0.,4.));
    float core=exp(-pow(d/(.18+.08*k),2.));
    float c=length(vb-mix(a,b,.5))/uK;
    float glow=exp(-pow(c/(1.5+3.5*k),2.))*(.35+.4*k);
    spark=sparkInk((core*2.2+glow)*uSpark);
  }
  // Zone 1 goes up
  vec4 fire=vec4(0.);
  if(uBoom>0.){
    float c=uBoom;
    vec3 C=SP+vec3(-10.,0.,6.+30.*c);
    vec2 dv=(vb-project(C))/uK;
    float d=length(dv);
    float R=16.+78.*(1.-exp(-c/.2));
    float n=fbm3(vec3(dv*.045,c*1.6));
    float shell=exp(-pow((d-R*(.84+.28*n))/(7.+R*.13),2.));
    float core=(1.-smoothstep(R*.35,R*(.8+.25*n),d))*(.5+.7*n);
    float life=smoothstep(0.,.05,c)*exp(-c/.6);
    vec3 fp=onFloor(vb,0.);
    float Rs=20.+380.*c;
    float ring=exp(-pow((length(fp.xy-SP.xy)-Rs)/6.,2.))*exp(-c/.32)*.7*smoothstep(${DIVIDE.toFixed(1)}-10.,${DIVIDE.toFixed(1)}+10.,fp.x);
    float ef=smoothstep(0.,80.,min(min(vb.x,uView.x-vb.x),min(vb.y,uView.y-vb.y)));
    float e=((shell*1.4+core*1.1)*life+ring)*ef;
    float hot=(core*life*exp(-c/.4)*1.4+ring*.6)*ef+e*.35;
    fire=fireInk(e,clamp(hot/max(e,1e-4),0.,1.));
    haze*=1.-smoothstep(0.,.25,c);
  }
  o=over(spark,over(fire,haze));
  o.rgb=min(o.rgb,vec3(o.a));
  float dd=(hash12(gl_FragCoord.xy+uTime)-.5)/255.*smoothstep(0.,1.5/255.,o.a);
  gl_FragColor=max(o+dd,0.);
}`;

const LIVE = `
const D = __DATA__;
const { P, GASES } = D;
const stage = document.querySelector(".fx-stage");
const q = (n) => stage.querySelector('[data-part="' + n + '"]');
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const LIGHT = document.body.dataset.theme === "light" ? 1 : 0;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const gl = glLayer({ canvas: stage.querySelector(".fx-gl"), fragment: ${JSON.stringify(GLSL)}, view: [D.W, D.H], camera: D.camera, uniforms: ["uSpark", "uEnergy", "uBoom", "uLift"], fixed: { uLight: LIGHT } });
if (gl) stage.setAttribute("data-gl", "");

let gas = D.start.gas, volts = D.start.v, len = D.start.len, lenShown = len;
let frame = 0, last = 0, now = 0, visible = false, touring = true, auto = false, slow = false, tourClock = 0, tourStep = -1;
let sparkAt = -10, sparkE = 0, ignites = false, boomAt = null, lastFire = -10;
const BOOM_END = 4.2;
const booming = () => boomAt !== null && now - boomAt < BOOM_END + 0.3;

const energy = (v, L) => 0.5 * (L * D.PF_PER_M * 1e-12) * v * v * 1e6; // µJ
const capNF = (L) => L * D.PF_PER_M / 1000;

// ---- dynamic art ----
const packG = q("pack"), snakeG = q("snake"), counterG = q("counter"), wireG = q("wire"), standG = q("stand"), reelG = q("reel");
const bottleGs = [...stage.querySelectorAll("[data-bottle]")];
const flash = stage.querySelector(".fx-flash");
function drawReel(L) {
  const [x, y] = D.REEL, rem = 1 - L / D.L_MAX;
  const r = 10.6 + 11 * rem;
  let s = solidSvg(cylinder(x, y, r, 2.2, 24, P, 48), { tone: "mid", crease: "none", inner: lineSvg([5, 8, 11, 14, 17, 20, 23].map((z) => sideArc(x, y, r, z, P, 28)).join(""), { tone: "lo" }) });
  packG.innerHTML = s;
  const txt = String(Math.round(L)).padStart(4, "0") + " m";
  const t = counterG.querySelector("text"); if (t && t.textContent !== txt) t.textContent = txt;
}
function drawSnake(L) {
  const A = [D.REEL[0] + D.REEL_R + 0.5, D.REEL[1] - 2], B = [D.PST[0] - 14, D.PST[1] + 30];
  const amp = 22 * sm(0, 900, L), n = 1 + Math.floor(Math.min(L, 4800) / 650);
  const dx = B[0] - A[0], dy = B[1] - A[1], len2 = Math.hypot(dx, dy), nx = -dy / len2, ny = dx / len2;
  const pts = [];
  for (let i = 0; i <= 90; i++) {
    const t = i / 90, w = Math.sin(t * n * Math.PI) * amp * Math.sin(t * Math.PI);
    pts.push(iso([A[0] + dx * t + nx * w, A[1] + dy * t + ny * w, 1], P));
  }
  const up = [[B[0], B[1], 1], [D.PST[0], D.PST[1] + 10, 1], [D.PST[0], D.PST[1] + 10, 22]].map((p) => iso(p, P));
  const d = pathOf([...pts, ...up]);
  snakeG.innerHTML = '<path class="iso-line iso-cable" data-tone="mid" d="' + d + '"/>' + dotsSvg([pts[0], up[up.length - 1]], { size: 1, tone: "mid" });
}
function drawWire(lift) {
  const [x, y] = D.PST;
  const a = [x - 3, y + 10, 47], mid = [x - 1, y + 10, 48.4 + lift * 0.4], tip = [x + 1.5 - lift * 0.15, y + 10, 47 + 1.4 + lift];
  wireG.innerHTML = '<path class="iso-line" data-tone="lit" style="stroke-width:1" d="' + pathOf([a, mid, tip].map((p) => iso(p, P))) + '"/>' + dotsSvg([iso(tip, P)], { size: 0.55, tone: "hi" });
}

// ---- ui ----
const ui = {
  gas: [...document.querySelectorAll("[data-gas]")], v: document.querySelector("#volts"), vOut: document.querySelector("#volts-out"),
  len: document.querySelector("#len"), lenOut: document.querySelector("#len-out"),
  fill: document.querySelector("#meter-fill"), mie: document.querySelector("#meter-mie"), eOut: document.querySelector("#energy-out"),
  fire: document.querySelector("#fire"), slow: document.querySelector("#slow"), auto: document.querySelector("#auto"), tour: document.querySelector("#tour"),
  shot: document.querySelector("#shot"),
};
let slidingV = false, slidingL = false;
function syncUi() {
  const g = GASES[gas], E = energy(volts, len);
  ui.gas.forEach((b, i) => b.setAttribute("aria-pressed", String(i === gas)));
  if (!slidingV) ui.v.value = volts;
  if (!slidingL) ui.len.value = Math.round(len);
  ui.vOut.textContent = volts.toFixed(0) + " V";
  ui.lenOut.textContent = Math.round(len) + " m";
  const frac = clamp(E / (2 * g.mie), 0, 1);
  ui.fill.style.width = (frac * 100).toFixed(1) + "%";
  ui.fill.dataset.bad = String(E >= g.mie);
  ui.mie.dataset.label = "MIE " + g.mie + " µJ";
  ui.eOut.textContent = (E < 10 ? E.toFixed(1) : Math.round(E)) + " µJ";
  ui.slow.setAttribute("aria-pressed", String(slow));
  ui.auto.setAttribute("aria-pressed", String(auto));
  ui.tour.setAttribute("aria-pressed", String(touring));
}

// ---- break the wire ----
function fire() {
  if (booming()) return;
  const g = GASES[gas], E = energy(volts, len);
  sparkAt = now; lastFire = now; sparkE = E / g.mie; ignites = E >= g.mie;
  const C = capNF(len);
  ui.shot.textContent = ignites
    ? "Spark: " + (E < 10 ? E.toFixed(1) : Math.round(E)) + " µJ from " + Math.round(len) + " m of cable (" + C.toFixed(0) + " nF at " + volts + " V). That's over " + g.id + "'s " + g.mie + " µJ. Zone 1 is gone; the safe area didn't notice."
    : "Spark: " + (E < 10 ? E.toFixed(1) : Math.round(E)) + " µJ from " + Math.round(len) + " m of cable. Under " + g.id + "'s " + g.mie + " µJ, so it fizzles. Nothing happens, which is the whole point.";
  if (ignites) boomAt = now + 0.18;
}

function chaos() {
  if (boomAt === null) return { c: -1, back: 0 };
  const c = now - boomAt;
  if (c < 0 || c > BOOM_END) return { c: -1, back: 0 };
  return { c, back: 1 - sm(3.0, 3.9, c) };
}
const tip = (c, delay, target) => { const u = Math.max(0, c - delay); return u <= 0 ? 0 : target * (1 - Math.exp(-u / 0.11) * Math.cos(u * 13)); };

function draw() {
  const g = GASES[gas];
  if (Math.abs(lenShown - len) > 0.5) { lenShown = len; }
  drawReel(len); drawSnake(len);
  const age = now - sparkAt;
  const lift = sm(0, 0.08, age) * 3.2 * (age < 2.5 ? 1 : 1 - sm(2.5, 3.0, age));
  drawWire(lift);
  const K = chaos();
  if (K.c >= 0) {
    const c = K.c;
    bottleGs.forEach((bg) => {
      const pv = D.pivots.bottles[bg.dataset.bottle];
      const a = tip(c, 0.06 + 0.05 * (3 - pv.order), pv.left ? -84 : 84) * K.back;
      bg.setAttribute("transform", "rotate(" + a.toFixed(1) + " " + pv.at[0].toFixed(1) + " " + pv.at[1].toFixed(1) + ")");
    });
    standG.setAttribute("transform", "rotate(" + (tip(c, 0.04, 78) * K.back).toFixed(1) + " " + D.pivots.stand[0].toFixed(1) + " " + D.pivots.stand[1].toFixed(1) + ")");
    const shove = 26 * sm(0, 0.5, c) * K.back;
    reelG.setAttribute("transform", "translate(" + (-shove).toFixed(1) + " " + (shove * 0.25).toFixed(1) + ") rotate(" + (-14 * sm(0, 0.5, c) * K.back).toFixed(1) + " " + D.pivots.reel[0].toFixed(1) + " " + D.pivots.reel[1].toFixed(1) + ")");
    const A = 7 * Math.exp(-c / 0.35);
    stage.style.transform = "translate(" + (A * Math.sin(c * 90)).toFixed(1) + "px," + (A * Math.cos(c * 71)).toFixed(1) + "px)";
    flash.style.opacity = (0.8 * burst(c, 0.03, 0.22)).toFixed(3);
  } else if (boomAt !== null && now - boomAt > BOOM_END) {
    boomAt = null;
    bottleGs.forEach((bg) => bg.removeAttribute("transform"));
    standG.removeAttribute("transform"); reelG.removeAttribute("transform");
    stage.style.transform = ""; flash.style.opacity = "0";
    ui.shot.textContent = "Reset. Shorter cable, lower voltage, or a gas that's harder to light.";
  }
  if (gl) {
    const flick = age < 0.35 ? (0.6 + 0.4 * Math.sin(age * 140)) : 1;
    const sp = still.matches ? 0 : burst(age, 0.004, ignites ? 0.12 : 0.07) * flick;
    gl.draw({ uSpark: sp, uEnergy: sparkE, uBoom: K.c, uLift: lift }, now);
  }
  bottleGs.forEach((bg) => bg.querySelectorAll(".iso-solid").forEach((s) => s.toggleAttribute("data-lit", bg.dataset.bottle === g.id)));
  stage.querySelectorAll("[data-tag] text").forEach((tx) => tx.setAttribute("data-tone", tx.parentNode.dataset.tag === g.id ? "hi" : +tx.getAttribute("font-size") > 3.2 ? "mid" : "lo"));
  const E = energy(volts, len);
  const text = K.c >= 0 ? (K.c < 3.0 ? "BOOM · the spark lit Zone 1" : "resetting…")
    : g.id + " MIE " + g.mie + " µJ · " + volts + " V · " + Math.round(len) + " m = " + capNF(len).toFixed(0) + " nF · spark " + (E < 10 ? E.toFixed(1) : Math.round(E)) + " µJ · " + (E >= g.mie ? "ignites" : "safe");
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuenow", String(Math.round(len)));
  stage.setAttribute("aria-valuetext", text);
}

// demo: hydrogen first, cable creeping out until it goes; then the others
const TOUR = [[3, 24, 100], [3, 24, 220], [3, 24, 380], [2, 24, 700], [2, 24, 1300], [1, 24, 2600], [1, 24, 4500], [0, 12, 5000]];
function tick(t) {
  const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
  last = t;
  now += dt * (slow ? 0.12 : 1);
  if (touring && !booming()) {
    tourClock += dt;
    const step = Math.floor(tourClock / 3.2) % TOUR.length;
    if (step !== tourStep) { tourStep = step; const [g2, v2, l2] = TOUR[step]; gas = g2; volts = v2; len = l2; }
    if (tourClock % 3.2 > 1.2 && now - lastFire > 2.5) fire();
  }
  if (auto && !booming() && now - lastFire > 3.2 * (slow ? 1.2 : 1)) fire();
  draw(); syncUi();
  const busy = touring || auto || now - sparkAt < 3.2 || boomAt !== null || drag;
  frame = visible && busy ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { touring = false; };
const setLen = (v) => { takeOver(); if (booming()) return; len = clamp(Math.round(v / 10) * 10, 0, D.L_MAX); run(); };
const setV = (v) => { takeOver(); if (booming()) return; volts = clamp(Math.round(v), D.V_MIN, D.V_MAX); run(); };
const setGas = (i) => { takeOver(); if (booming()) return; gas = (i + GASES.length) % GASES.length; run(); };
const shoot = () => { takeOver(); fire(); run(); };
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;

ui.gas.forEach((b, i) => b.addEventListener("click", () => setGas(i)));
ui.v.addEventListener("input", () => { slidingV = true; setV(+ui.v.value); });
ui.v.addEventListener("change", () => { slidingV = false; run(); });
ui.len.addEventListener("input", () => { slidingL = true; setLen(+ui.len.value); });
ui.len.addEventListener("change", () => { slidingL = false; run(); });
ui.fire.addEventListener("click", shoot);
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.auto.addEventListener("click", () => { takeOver(); auto = !auto; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { auto = false; tourClock = 0; tourStep = -1; } run(); });

// on the figure: drag sideways to pay out cable, tap to break the wire, tap a bottle for gas
let drag = null;
stage.addEventListener("pointerdown", (ev) => { drag = { x: ev.clientX, y: ev.clientY, from: len, moved: false }; stage.setPointerCapture(ev.pointerId); });
stage.addEventListener("pointermove", (ev) => {
  if (!drag) return;
  const dx = ev.clientX - drag.x;
  if (!drag.moved && Math.hypot(dx, ev.clientY - drag.y) < 5) return;
  drag.moved = true;
  setLen(drag.from + dx / stage.getBoundingClientRect().width * D.L_MAX * 1.2);
});
stage.addEventListener("pointerup", (ev) => {
  if (!drag) return;
  const was = drag; drag = null;
  if (was.moved) { run(); return; }
  const hit = document.elementsFromPoint(ev.clientX, ev.clientY).map((e) => e.closest && e.closest("[data-bottle],[data-tag]")).find(Boolean);
  if (hit) setGas(GASES.findIndex((g) => g.id === (hit.dataset.bottle || hit.dataset.tag)));
  else shoot();
});
stage.addEventListener("pointercancel", () => { drag = null; });
stage.addEventListener("keydown", (ev) => {
  if (ev.key === "ArrowRight") { ev.preventDefault(); setLen(len + (ev.shiftKey ? 500 : 50)); }
  else if (ev.key === "ArrowLeft") { ev.preventDefault(); setLen(len - (ev.shiftKey ? 500 : 50)); }
  else if (ev.key === "ArrowUp") { ev.preventDefault(); setV(volts + 1); }
  else if (ev.key === "ArrowDown") { ev.preventDefault(); setV(volts - 1); }
  else if (ev.key === "g" || ev.key === "G") { ev.preventDefault(); setGas(gas + 1); }
  else if (ev.key === " " || ev.key === "Enter" || ev.key === "f") { ev.preventDefault(); shoot(); }
  else if (ev.key === "s") { slow = !slow; run(); }
});
window.__fig = { freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
syncUi(); draw();
`;

const CSS = `.fx-stage{position:relative;cursor:ew-resize;touch-action:none}
.fx-layer{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.fx-gl{display:block}
body[data-theme="dark"] .fx-gl{mix-blend-mode:screen}
.fx-flash{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(closest-side at 64% 46%,#fff8e8 0%,#ffd9a0 40%,rgba(255,170,90,0) 100%)}
.iso-plate{overflow:hidden}
.iso-cable{stroke-width:1.5}
.ctl{display:grid;gap:12px;margin:14px 0 6px;font-family:var(--anatomy-mono);font-size:12px;color:var(--anatomy-mid)}
.ctl-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ctl-label{min-width:56px;text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:var(--anatomy-lo)}
.ctl button{font:inherit;color:var(--anatomy-mid);background:transparent;border:1px solid var(--anatomy-lo);border-radius:6px;padding:7px 10px;cursor:pointer;line-height:1.15;text-align:left;min-height:36px}
.ctl button:hover{border-color:var(--anatomy-mid)}
.ctl button[aria-pressed="true"]{color:var(--anatomy-lit);border-color:var(--anatomy-lit)}
.ctl button small{display:block;font-size:10px;color:var(--anatomy-lo)}
.ctl #fire{border-color:var(--anatomy-lit);color:var(--anatomy-lit);padding:7px 14px;font-weight:600;letter-spacing:.06em}
.slide{position:relative;flex:1;min-width:110px}
.slide input{width:100%;accent-color:var(--anatomy-lit);margin:0}
.ctl output{min-width:64px;text-align:right;color:var(--anatomy-hi,var(--anatomy-mid))}
.meter{position:relative;flex:1;min-width:110px;height:10px;margin-top:14px;border:1px solid var(--anatomy-lo);border-radius:5px}
#meter-fill{position:absolute;left:0;top:0;bottom:0;border-radius:4px;background:var(--anatomy-mid);transition:width .15s}
#meter-fill[data-bad="true"]{background:#ff8a3d}
#meter-mie{position:absolute;left:50%;top:-14px;bottom:-3px;border-left:1px dashed var(--anatomy-lit)}
#meter-mie::after{content:attr(data-label);position:absolute;top:-1px;left:4px;font-size:10px;white-space:nowrap;color:var(--anatomy-lit)}
#shot{min-height:2.6em;font-size:12px;line-height:1.4}
@media (max-width:520px){.ctl button small{display:none}.ctl-label{min-width:44px}.ctl button{padding:7px 8px}}`;

const stageHtml = `<div class="iso-stage fx-stage" tabindex="0" role="slider" aria-label="Cable length: drag sideways or use arrow keys; up and down change voltage; space breaks the wire" aria-valuemin="0" aria-valuemax="${L_MAX}" aria-valuenow="${START.len}">${fig}<canvas class="fx-layer fx-gl" aria-hidden="true"></canvas><div class="fx-flash" aria-hidden="true"></div></div>`;

const CONTROLS = `<div class="ctl" role="group" aria-label="Test controls">
  <div class="ctl-row"><span class="ctl-label">Gas</span>${GASES.map((g, i) => `<button type="button" data-gas="${i}" aria-pressed="${i === START.gas}">${g.id}<small>${g.group} · ${g.mie} µJ</small></button>`).join("")}</div>
  <div class="ctl-row"><span class="ctl-label">Volts</span><div class="slide"><input id="volts" type="range" min="${V_MIN}" max="${V_MAX}" step="1" value="${START.v}" aria-label="Barrier voltage"></div><output id="volts-out">${START.v} V</output></div>
  <div class="ctl-row"><span class="ctl-label">Cable</span><div class="slide"><input id="len" type="range" min="0" max="${L_MAX}" step="10" value="${START.len}" aria-label="Cable length in metres"></div><output id="len-out">${START.len} m</output></div>
  <div class="ctl-row"><span class="ctl-label">Spark</span><div class="meter" aria-hidden="true"><span id="meter-fill"></span><span id="meter-mie" data-label="MIE"></span></div><output id="energy-out">0 µJ</output></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="fire">BREAK WIRE</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="auto" aria-pressed="false">Auto</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
  <div id="shot" aria-live="polite">Pick a gas, set the voltage, pay out some cable, break the wire.</div>
</div>`;

const card = k.plateHtml({
  fig: "Fig 4",
  title: "Ex i, cable length",
  hint: "Drag: cable · tap: spark",
  readout: "",
  keys: [
    { mark: "lit", label: "The wire that breaks, and the spark" },
    { mark: "raised", label: "Barrier in the safe area; cable drum and loops on the bench" },
  ],
  caption: "An intrinsically safe loop stores energy in its cable: about 200 pF per metre, charged to the barrier voltage. Break the wire and that energy comes out as a spark, ½CV². Under the gas's minimum ignition energy it fizzles; over it, Zone 1 goes up. More cable means more capacitance, so a loop that was fine at 50 m can be a bomb at 500 m. MIE values: methane 280, propane 250, ethylene 70, hydrogen 17 µJ.",
  body: stageHtml,
});

const other = theme === "light" ? ["index.html", "Dark version"] : ["light.html", "Light version"];
const FOOT = `<p style="font-family:var(--anatomy-mono);font-size:11px;color:var(--anatomy-lo);margin:28px 0 8px;line-height:1.6">A toy, not a certified anything. MIE values and 200 pF/m are real; real IS checks use the standard's ignition curves with safety factors, not raw MIE.<br>Built with <a href="https://github.com/wheresryan22/anatomy" style="color:inherit">Anatomy</a> by Ryan (MIT). · <a href="${other[0]}" style="color:inherit">${other[1]}</a> · <a href="../" style="color:inherit">More figures</a> · <a href="https://github.com/Dizzyfer/Anatomy/tree/main/ex-i-spark" style="color:inherit">Source</a></p>`;
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "Ex i spark", theme, body: `<style>${CSS}</style>${card.replace("<figcaption", CONTROLS + "<figcaption")}${FOOT}`, script: kitScript() + glScript() + LIVE.replace("__DATA__", JSON.stringify(DATA)), width: 700 }));
console.log("wrote", name);
