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

// Truth: IEC 60079-14 dust Tmax = min(2/3 × cloud ignition temp, 5 mm layer ignition temp − 75 K); the layer rule only holds to 5 mm.
// Literature values (5 mm layer / cloud ignition, °C).
const DUSTS = [
  { id: "coal", name: "coal dust", btn: "Coal", layer: 250, cloud: 600, colour: ["#2a2622", "#3a3530"], light: ["#5a534c", "#7a7168"] },
  { id: "wood", name: "wood flour", btn: "Wood flour", layer: 340, cloud: 490, colour: ["#6b5236", "#7e6342"], light: ["#c9a676", "#d9ba8c"] },
  { id: "sugar", name: "sugar dust", btn: "Sugar", layer: 480, cloud: 490, colour: ["#9a968c", "#b0aca2"], light: ["#e2ddd2", "#efebe2"] },
];
// Toy: dust settles at 0.4 mm a week. The light is marked T135 °C and reaches it with exactly 5 mm on top
// (90 °C bare, +9 K per mm). Thicker layers light lower (3 K per mm past 5 mm). A JB with a missing plug fills in ~20 weeks.
const MODEL = { mmPerWeek: 0.4, bare: 90, perMm: 9, marked: 135, thickDrop: 3, tau: 2.2, maxWeeks: 60, jbFillWeeks: 20, jbBurn: 0.55 };

const PLATE = { x: -124, y: -84, w: 256, d: 166, r: 8 };
const PLATE_H = 12, FOOT_H = 5;
const COL = { x: -108, y: -5, w: 10, d: 10 };
const BEAM = { x0: -108, x1: 118, y: 0, z0: 84 };
const LUM = { x: -6, y: -18, w: 48, d: 36, z0: 56, z1: 66 };
const FIN_H = 5;
const DUST_K = 0.32;
const LAMP_C = [LUM.x + LUM.w / 2, 0];
const JB = { x: -84, y: 16, w: 40, d: 30, z0: 18, z1: 42 };
const JB_CUT = [-60, 34];
const JB_HOT = [-56, 24, 28];
const HOP = { x: 58, y: 14, w: 40, d: 34, z1: 26 };
const CLOUD_SRC = [HOP.x + HOP.w / 2, HOP.y + HOP.d / 2, HOP.z1 + 4];
const BAG = { x: 64, y: 54, w: 28, d: 16 };

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [BEAM.x0, 0, BEAM.z0 + 16], [BEAM.x1, 0, BEAM.z0 + 16]],
  W, H, { pad: 20, azimuth: 45 },
);

const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const Dt = (points, style) => k.dotsSvg(points, style);
const depth2 = ([x, y]) => k.depthOf([x, y, 0], P);
const byDepth = (pts) => [...pts].sort((a, b) => depth2(a) - depth2(b));
const slab = (plan, z, h, r = 1.2, bevel = 0.5) => k.slabOf({ r, ...plan }, z, h, P, 4, bevel);
const lRing = ({ x, y, w, d }, [cx, cy]) => [[x, y], [x + w, y], [x + w, cy], [cx, cy], [cx, y + d], [x, y + d]];
const lSolid = (plan, cut, z, h) => k.extrude(lRing(plan, cut), z, h, P, { convex: false });

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
  out.push(k.faceTextSvg(k.topMatrix([-30, 74], 0, P, "x"), "ZONE 21 · BAG TIP", { size: 4.6, tone: "lo" }));
  out.push(`<g data-part="floordust"></g>`);
  return out.join("");
}

function column() {
  const out = [];
  out.push(S(slab({ x: COL.x - 4, y: COL.y - 4, w: COL.w + 8, d: COL.d + 8 }, 0, 1.6, 1, 0.3), { tone: "mid" }));
  out.push(Dt(k.corners({ x: COL.x - 4, y: COL.y - 4, w: COL.w + 8, d: COL.d + 8 }, 2).map(([x, y]) => at([x, y, 1.6])), { size: 0.5 }));
  out.push(S(slab(COL, 1.6, BEAM.z0 + 14 - 1.6, 0.4, 0.3), { tone: "mid", inner: L(k.segment([COL.x + COL.w, COL.y + 5, 2], [COL.x + COL.w, COL.y + 5, BEAM.z0 + 12], P), { tone: "faint" }) }));
  return out.join("");
}

function beam() {
  const out = [];
  const { x0, x1, y, z0 } = BEAM;
  out.push(S(slab({ x: x0, y: y - 7, w: x1 - x0, d: 14 }, z0, 2, 0.3, 0.2), { tone: "mid" }));
  out.push(S(slab({ x: x0, y: y - 1, w: x1 - x0, d: 2 }, z0 + 2, 10, 0.2, 0), { tone: "mid", inner: L([0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => k.segment([x0 + 24 + i * 24, y + 1, z0 + 3], [x0 + 24 + i * 24, y + 1, z0 + 11], P)).join(""), { tone: "faint" }) }));
  out.push(S(slab({ x: x0, y: y - 7, w: x1 - x0, d: 14 }, z0 + 12, 2, 0.3, 0.2), { tone: "mid" }));
  out.push(`<g data-part="beamdust"></g>`);
  const c = [[LUM.x + 2, LUM.y + 4, LUM.z1 + 1], [LUM.x - 4, LUM.y + 4, LUM.z1 + 8], [LUM.x - 8, -6, BEAM.z0 - 0.6], [COL.x + COL.w + 1, -6, BEAM.z0 - 0.6], [COL.x + COL.w + 1, -6, JB.z1 + 6], [JB.x + 6, JB.y + 4, JB.z1]].map(at);
  out.push(`<path class="iso-line iso-cable" data-tone="mid" d="${k.pathOf(c)}"/>`);
  return out.join("");
}

function luminaire() {
  const out = [];
  const { x, y, w, d, z0, z1 } = LUM;
  for (const sy of [y - 2, y + d]) out.push(S(slab({ x: x + w / 2 - 2.5, y: sy, w: 5, d: 2 }, z0 + 3, BEAM.z0 - z0 - 3, 0.4, 0.2), { tone: "mid" }));
  out.push(S(slab({ x: x + w / 2 - 5, y: -7, w: 10, d: 14 }, BEAM.z0 - 1.6, 1.6, 0.4, 0.2), { tone: "mid" }));
  out.push(Dt([at([x + w / 2, y - 1, z0 + 6]), at([x + w / 2, y + d + 1, z0 + 6])], { size: 0.7, tone: "hi" }));
  out.push(S(slab({ x, y, w, d }, z0, z1 - z0, 2, 0.6), { tone: "hi", inner: L(k.sideSeam({ x, y, w, d, r: 2 }, z0 + 2.5, P), { tone: "faint" }) }));
  for (let i = 0; i < 9; i++) out.push(S(slab({ x: x + 4 + i * 5, y: y + 2, w: 1.4, d: d - 4 }, z1, FIN_H, 0.3, 0), { tone: "hi" }));
  const m = k.sideMatrix([x + 6, y + d + 0.01], z0 + 8.2, P, "left");
  out.push(`<g transform="${m}"><rect x="0" y="0" width="30" height="5.2" rx=".5" style="fill:var(--anatomy-paper);stroke:var(--anatomy-mid);stroke-width:.3"/><text class="iso-face-text" data-tone="mid" x="1.4" y="3.7" font-size="2.6">Ex tb IIIC T135°C</text></g>`);
  out.push(`<g data-part="lumdust"></g>`);
  return `<g data-part="lum">${out.join("")}</g>`;
}

function junctionBox() {
  const out = [];
  const j = JB, cut = JB_CUT;
  out.push(`<path class="iso-halo" d="${k.haloOf({ ...k.insetPlan({ ...j, r: 2 }, -4) }, 0, 0.1, P)}"/>`);
  // stand
  for (const [lx, ly] of byDepth(k.corners(j, 3))) out.push(S(slab({ x: lx - 1.5, y: ly - 1.5, w: 3, d: 3 }, 0, j.z0, 0.3, 0), { tone: "mid" }));
  out.push(S(lSolid(j, cut, j.z0, 2.5), { tone: "mid" }));
  // back walls
  out.push(S(slab({ x: j.x, y: j.y, w: j.w, d: 2.5 }, j.z0 + 2.5, j.z1 - j.z0 - 2.5, 0.4, 0.2), { tone: "hi" }));
  out.push(S(slab({ x: j.x, y: j.y + 2.5, w: 2.5, d: j.d - 2.5 }, j.z0 + 2.5, j.z1 - j.z0 - 2.5, 0.4, 0.2), { tone: "hi" }));
  // terminal rail and terminals inside
  out.push(S(slab({ x: j.x + 5, y: j.y + 9, w: j.w - 9, d: 4 }, j.z0 + 2.5, 1.5, 0.3, 0), { tone: "mid" }));
  for (let i = 0; i < 7; i++) {
    const tx = j.x + 7 + i * 4.4;
    out.push(S(slab({ x: tx, y: j.y + 5, w: 3.6, d: 12 }, j.z0 + 4, 7, 0.4, 0.2), { tone: "hi" }));
    out.push(Dt([at([tx + 1.8, j.y + 7.5, j.z0 + 11]), at([tx + 1.8, j.y + 14.5, j.z0 + 11])], { size: 0.4 }));
  }
  out.push(`<g data-part="jbdust"></g>`);
  // front walls, cut and hatched
  const fx = { x: j.x + j.w - 2.5, y: j.y + 2.5, w: 2.5, d: cut[1] - j.y - 2.5 };
  const fy = { x: j.x + 2.5, y: j.y + j.d - 2.5, w: cut[0] - j.x - 2.5, d: 2.5 };
  out.push(S(slab(fx, j.z0 + 2.5, j.z1 - j.z0 - 2.5, 0.2, 0), { tone: "hi" }));
  out.push(S(slab(fy, j.z0 + 2.5, j.z1 - j.z0 - 2.5, 0.2, 0), { tone: "hi" }));
  // gland and the plug that should be there
  const gy = j.y + j.d;
  out.push(S(slab({ x: j.x + 6, y: gy, w: 6, d: 2 }, j.z0 + 7, 6, 1.6, 0.3), { tone: "mid" }));
  out.push(`<g data-part="plug">` + S(slab({ x: j.x + 15, y: gy, w: 5, d: 1.4 }, j.z0 + 7.5, 5, 1.6, 0.3), { tone: "mid" }) + `</g>`);
  out.push(`<g data-part="hole" style="display:none"><path class="iso-hole" d="${k.pathOf([[j.x + 15.4, gy + 0.02, j.z0 + 8], [j.x + 19.6, gy + 0.02, j.z0 + 8], [j.x + 19.6, gy + 0.02, j.z0 + 12], [j.x + 15.4, gy + 0.02, j.z0 + 12]].map(at), true)}"/></g>`);
  const m = k.sideMatrix([j.x + 4, gy + 0.01], j.z1 - 2, P, "left");
  out.push(`<g transform="${m}"><rect x="0" y="0" width="22" height="5" rx=".5" style="fill:var(--anatomy-paper);stroke:var(--anatomy-mid);stroke-width:.3"/><text class="iso-face-text" data-tone="mid" x="1.3" y="3.6" font-size="2.5">Ex tb IIIC IP66</text></g>`);
  out.push(`<g data-part="jbtop"></g>`);
  return `<g data-part="jb">${out.join("")}</g>`;
}

function hopper() {
  const out = [];
  const h = HOP;
  out.push(`<path class="iso-halo" d="${k.haloOf({ ...k.insetPlan({ ...h, r: 2 }, -4) }, 0, 0.1, P)}"/>`);
  out.push(S(slab(h, 0, h.z1, 1, 0.5), { tone: "mid", inner: L(k.sideSeam({ ...h, r: 1 }, 12, P), { tone: "faint" }) }));
  // grate on top
  const g = [];
  for (let x = h.x + 4; x < h.x + h.w - 2; x += 4) g.push(k.segment([x, h.y + 3, h.z1], [x, h.y + h.d - 3, h.z1], P));
  out.push(L(k.planOutline({ ...k.insetPlan({ ...h, r: 1 }, 3) }, h.z1, P), { tone: "lo" }));
  out.push(L(g.join(""), { tone: "faint" }));
  out.push(S(slab({ x: h.x - 2, y: h.y - 2, w: h.w + 4, d: 3 }, h.z1, 10, 0.4, 0.2), { tone: "mid" }));
  // shelf for the bags
  out.push(S(slab({ x: BAG.x - 4, y: BAG.y - 4, w: BAG.w + 8, d: BAG.d + 8 }, 14, 2, 0.6, 0.2), { tone: "mid" }));
  for (const [lx, ly] of byDepth(k.corners({ x: BAG.x - 4, y: BAG.y - 4, w: BAG.w + 8, d: BAG.d + 8 }, 2))) out.push(S(slab({ x: lx - 1, y: ly - 1, w: 2, d: 2 }, 0, 14, 0.2, 0), { tone: "mid" }));
  return out.join("");
}
function bag() {
  const b = BAG;
  return `<g data-part="bag">` + S(slab(b, 16, 9, 4, 0.8), { tone: "hi", inner: L(k.segment([b.x, b.y + b.d, 20.5], [b.x + b.w, b.y + b.d, 20.5], P), { tone: "faint" }) }) + S(slab({ x: b.x + 1, y: b.y + 1, w: b.w - 2, d: b.d - 2 }, 25, 5, 4, 0.8), { tone: "hi" }) + `</g>`;
}

const START = { dust: 0, weeks: 6, sealed: true };
const fig = k.figureSvg({
  width: W, height: H,
  label: "A dusty plant area: a bag-tip hopper, a dust-tight floodlight under a steel beam, and a dust-tight junction box on a stand, cut open. Weeks without cleaning pile dust on the light and the beam; a missing blanking plug lets dust into the box. Tipping a bag raises a cloud.",
  body: [plate(), column(), junctionBox(), hopper(), luminaire(), beam(), bag()],
});

const DATA = {
  W, H, camera: glCamera(P), P, DUSTS, MODEL, LUM, FIN_H, DUST_K, BEAM, COL, LAMP_C, JB, JB_CUT, JB_HOT, HOP, CLOUD_SRC, BAG, start: START,
  pivots: { lum: at([LUM.x + LUM.w / 2, 0, BEAM.z0]), bag: at([BAG.x + BAG.w / 2, BAG.y, 16]), jb: at([JB.x + JB.w, JB.y + JB.d, 0]) },
};

const GLSL = `
uniform float uLight;
uniform float uLamp;
uniform float uSmoulder;
uniform float uDustTop;
uniform float uJbFire;
uniform float uIngress;
uniform float uCloud;
uniform float uPrimary;
uniform vec3 uPrimAt;
uniform float uBoom;
uniform float uBig;
uniform vec3 uDustCol;
const vec2 LC=vec2(${LAMP_C.map((v) => v.toFixed(1)).join(",")});
const vec4 LP=vec4(${LUM.x.toFixed(1)},${LUM.y.toFixed(1)},${(LUM.x + LUM.w).toFixed(1)},${(LUM.y + LUM.d).toFixed(1)});
const vec3 JH=vec3(${JB_HOT.map((v) => v.toFixed(1)).join(",")});
const vec3 HOLE=vec3(${(JB.x + 17.5).toFixed(1)},${(JB.y + JB.d).toFixed(1)},${(JB.z0 + 10).toFixed(1)});
const vec3 CS=vec3(${CLOUD_SRC.map((v) => v.toFixed(1)).join(",")});
vec4 inkFor(vec3 seen,float cover){vec3 ab=1.-seen;float a=max(max(ab.r,max(ab.g,ab.b)),cover);return vec4(vec3(a)-ab,a);}
vec4 over(vec4 t,vec4 u){return t+u*(1.-t.a);}
vec4 fireInk(float e,float core){
  vec3 hue=mix(vec3(.55,.16,.06),mix(vec3(1.,.36,.08),vec3(1.,.66,.28),smoothstep(.45,1.,core)),smoothstep(0.,.5,core));
  vec3 c=tonemap(hue*e,1.4);float a=max(c.r,max(c.g,c.b));
  float la=1.-exp(-1.8*e);
  vec3 seen=mix(vec3(1.),mix(vec3(.82,.28,.06),vec3(1.,.78,.4),smoothstep(.6,1.,core)*smoothstep(.5,1.,la)),la);
  return mix(vec4(c,a),inkFor(seen,.9*smoothstep(.75,1.,la)*core)*la,uLight);
}
vec4 lightInk(float e){
  vec3 c=tonemap(vec3(1.,.93,.78)*e,1.2);float a=max(c.r,max(c.g,c.b));
  float la=1.-exp(-1.2*e);
  vec3 seen=mix(vec3(1.),vec3(.97,.86,.55),la);
  return mix(vec4(c,a)*.9,inkFor(seen,0.)*la*.55,uLight);
}
vec4 smokeInk(float d,vec3 col){float a=1.-exp(-d);return vec4(col*a,a);}
float edgeFade(vec2 vb){return smoothstep(0.,80.,min(min(vb.x,uView.x-vb.x),min(vb.y,uView.y-vb.y)));}
vec4 ball(vec2 vb,vec3 C,float c,float rmax,float decay){
  vec2 dv=(vb-project(C))/uK;
  float d=length(dv), R=8.+rmax*(1.-exp(-c/.18));
  float n=fbm3(vec3(dv*.06,c*2.));
  float e=(exp(-pow((d-R*(.82+.3*n))/(5.+R*.12),2.))*1.2+(1.-smoothstep(R*.3,R*.9,d))*(.6+.6*n))*smoothstep(0.,.04,c)*exp(-c/decay);
  return fireInk(e*edgeFade(vb),clamp(1.2-c*2.,0.,1.));
}
void main(){
  vec2 vb=viewOf(gl_FragCoord.xy);
  vec4 o=vec4(0.);
  if(uLamp>.002){
    vec3 f=onFloor(vb,0.);
    float pool=exp(-pow(length(f.xy-LC)/44.,2.))*.5;
    float cone=0.;
    for(int i=0;i<10;i++){
      float z=(float(i)+.5)*5.4;
      vec3 p=onFloor(vb,z);
      float rr=length(p.xy-LC), rad=14.+30.*(1.-z/56.);
      float mote=step(.985,hash13(floor(p*.9)+floor(uTime*3.)))*.6;
      cone+=exp(-pow(rr/rad,2.))*(.035+mote*.12);
    }
    o=over(lightInk((pool+cone)*uLamp),o);
  }
  if(uIngress>.002){
    // dust drifting in through the open plug hole
    vec2 h=project(HOLE);
    vec2 dv=(vb-h)/uK;
    float stream=exp(-pow(length(dv*vec2(1.,.6)-vec2(-2.,2.))/4.,2.))*fbm2(dv*.6+vec2(uTime*1.5,0.));
    o=over(smokeInk(stream*.9*uIngress,uDustCol),o);
  }
  if(uSmoulder>.002){
    vec3 p=onFloor(vb,uDustTop);
    vec2 q=max(vec2(LP.x,LP.y)-p.xy,p.xy-vec2(LP.z,LP.w));
    float inside=1.-smoothstep(-2.,0.,max(q.x,q.y));
    float n=fbm2(p.xy*.18+vec2(0.,uTime*.4));
    float ember=inside*smoothstep(.55,.85,n)*(.7+.3*sin(uTime*7.+n*20.));
    o=over(fireInk(ember*1.6*uSmoulder,.35),o);
    float smoke=0.;
    for(int i=0;i<8;i++){
      float z=uDustTop+3.+float(i)*6.;
      vec3 s=onFloor(vb,z);
      vec2 c=LC+vec2(4.+sin(z*.08+uTime)*6.,-2.);
      smoke+=exp(-pow(length(s.xy-c)/(3.+z*.08),2.))*fbm2(s.xy*.1+vec2(0.,-uTime*.6))*.35;
    }
    o=over(smokeInk(smoke*uSmoulder,mix(vec3(.55),vec3(.45),uLight)),o);
  }
  if(uJbFire>.002){
    // burning dust inside the box, seen through the cut, and a lick of flame at the hole
    vec2 dv=(vb-project(JH))/uK;
    float n=fbm2(dv*.35+vec2(0.,-uTime*1.2));
    float glow=exp(-pow(length(dv*vec2(.8,1.2))/7.,2.))*(.5+.8*n);
    vec2 hv=(vb-project(HOLE+vec3(0.,1.,0.)))/uK;
    float lick=exp(-pow(length(hv*vec2(1.,.5)-vec2(0.,-3.))/2.6,2.))*(.4+.8*noise2(hv*.8+vec2(0.,-uTime*6.)));
    o=over(fireInk((glow*1.3+lick*1.1)*uJbFire,.5),o);
  }
  if(uCloud>.002){
    float d=0.;
    for(int i=0;i<9;i++){
      float z=4.+float(i)*8.;
      vec3 p=onFloor(vb,z);
      vec2 c=CS.xy+vec2(-uCloud*46.,-uCloud*14.);
      float rr=length((p.xy-c)*vec2(.6,1.));
      float shape=exp(-pow(rr/(12.+56.*uCloud),2.))*exp(-pow((z-20.-26.*uCloud)/(14.+16.*uCloud),2.));
      d+=shape*(.4+.8*fbm2(p.xy*.05+vec2(uTime*.2,0.)+z*.1));
    }
    o=over(smokeInk(d*.6*uCloud*edgeFade(vb),uDustCol),o);
  }
  if(uPrimary>0.) o=over(ball(vb,uPrimAt,uPrimary,30.,.35),o);
  if(uBoom>0.){
    float c=uBoom;
    vec2 a=project(vec3(-96.,0.,70.)), b=project(vec3(110.,0.,70.));
    float t=clamp(dot(vb-a,b-a)/dot(b-a,b-a),0.,1.);
    vec2 pr=a+(b-a)*t;
    float sweep=smoothstep(0.,.8,c*2.2-abs(t-.45)*1.4);
    float d=length(vb-pr-vec2(0.,-24.*uK*c))/uK;
    float R=(8.+58.*(1.-exp(-c/.25)))*(.35+.65*uBig);
    float n=fbm3(vec3((vb-pr)/uK*.045,c*1.6));
    float shell=exp(-pow((d-R*(.84+.28*n))/(7.+R*.13),2.));
    float core=(1.-smoothstep(R*.35,R*(.8+.25*n),d))*(.5+.7*n);
    float life=sweep*exp(-c/.7)*uBig;
    vec3 fp=onFloor(vb,0.);
    float ring=exp(-pow((length(fp.xy)-(30.+380.*c))/6.,2.))*exp(-c/.32)*.6*uBig;
    float ef=edgeFade(vb);
    float e=((shell*1.4+core*1.1)*life+ring)*ef;
    float hot=(core*life*exp(-c/.45)*1.4+ring*.6)*ef+e*.35;
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
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const gl = glLayer({ canvas: stage.querySelector(".fx-gl"), fragment: ${JSON.stringify(GLSL)}, view: [D.W, D.H], camera: D.camera, uniforms: ["uLamp", "uSmoulder", "uDustTop", "uJbFire", "uIngress", "uCloud", "uPrimary", "uPrimAt", "uBoom", "uBig", "uDustCol"], fixed: { uLight: LIGHT } });
if (gl) stage.setAttribute("data-gl", "");

let dust = D.start.dust, weeks = D.start.weeks, sealed = D.start.sealed, lamp = true, lampLevel = 1, temp = M.bare;
let smoulder = 0, jbFire = 0, tipAt = null, cloudAt = null, primaryAt = null, primSrc = "", boomAt = null, big = 0;
let frame = 0, last = 0, now = 0, visible = false, touring = true, slow = false, tourClock = 0, tourStep = -1, tourEnd = 0, lastShot = "", pendingTip = null, ageing = false;
const BOOM_END = 4.4;
const booming = () => primaryAt !== null || (boomAt !== null && now - boomAt < BOOM_END + 0.3);
const Dd = () => D.DUSTS[dust];
const mm = () => Math.round(weeks * M.mmPerWeek * 10) / 10;
const tUnder = () => M.bare + M.perMm * mm();
const layerIgn = () => Dd().layer - (mm() > 5 ? M.thickDrop * (mm() - 5) : 0);
const tmax = () => Math.min(Dd().cloud * 2 / 3, Dd().layer - 75);
const jbFill = () => sealed ? 0 : clamp(weeks / M.jbFillWeeks, 0, 1);
const weeksFor5mm = 5 / M.mmPerWeek;

const lumG = q("lum"), lumDust = q("lumdust"), beamDust = q("beamdust"), floorDust = q("floordust"), jbDust = q("jbdust"), jbTop = q("jbtop"), plugG = q("plug"), holeG = q("hole"), bagG = q("bag"), jbG = q("jb"), flash = stage.querySelector(".fx-flash");
function applyDustColour() { const c = LIGHT ? Dd().light : Dd().colour; stage.style.setProperty("--dust", c[0]); stage.style.setProperty("--dust-top", c[1]); }
let built = "";
function buildDust() {
  const key = weeks + "|" + dust + "|" + sealed;
  if (key === built) return;
  built = key;
  const Lm = D.LUM, h = mm() * D.DUST_K, B = D.BEAM, J = D.JB;
  const lay = (plan, z, hh, r = 3) => hh > 0.06 ? solidSvg(slabOf({ ...plan, r }, z, hh, P, 4, 0.4), { tone: "mid", crease: "none", className: "dust" }) : "";
  lumDust.innerHTML = lay({ x: Lm.x + 1, y: Lm.y + 1, w: Lm.w - 2, d: Lm.d - 2 }, Lm.z1, h, 2);
  beamDust.innerHTML = lay({ x: B.x0 + 2, y: -6, w: B.x1 - B.x0 - 4, d: 12 }, B.z0 + 14, h * 0.8);
  const jh = h * 0.7;
  jbTop.innerHTML = jh > 0.06 ? solidSvg(extrude([[J.x + 1, J.y + 1], [J.x + J.w - 1, J.y + 1], [J.x + J.w - 1, D.JB_CUT[1]], [D.JB_CUT[0], D.JB_CUT[1]], [D.JB_CUT[0], J.y + J.d - 1], [J.x + 1, J.y + J.d - 1]], J.z1, jh, P, { convex: false }), { tone: "mid", crease: "none", className: "dust" }) : "";
  floorDust.innerHTML = [[-70, -60, 30, 14], [14, 40, 30, 12], [100, -50, 22, 12], [-40, 60, 26, 10]].map(([x, y, w, d]) => lay({ x, y, w: w * (0.6 + Math.min(1, weeks / 30)), d }, 0, Math.max(0.1, h * 0.25), 5)).join("");
  // inside the JB: dust that came in through the plug hole, piled against the terminals
  const f = jbFill();
  jbDust.innerHTML = f > 0.02 ? solidSvg(extrude([[J.x + 2.5, J.y + 2.5], [J.x + J.w - 2.5, J.y + 2.5], [J.x + J.w - 2.5, D.JB_CUT[1]], [D.JB_CUT[0], D.JB_CUT[1]], [D.JB_CUT[0], J.y + J.d - 2.5], [J.x + 2.5, J.y + J.d - 2.5]], J.z0 + 2.5, f * 12, P, { convex: false }), { tone: "mid", crease: "none", className: "dust" }) : "";
  plugG.style.display = sealed ? "" : "none";
  holeG.style.display = sealed ? "none" : "";
}

const ui = {
  dust: [...document.querySelectorAll("[data-dust]")], weeks: document.querySelector("#weeks"), wOut: document.querySelector("#weeks-out"),
  tFill: document.querySelector("#temp-fill"), tOut: document.querySelector("#temp-out"), mk: document.querySelector("#mark-t135"), lim: document.querySelector("#mark-limit"), ign: document.querySelector("#mark-ign"),
  jbFill: document.querySelector("#jb-fill"), jbOut: document.querySelector("#jb-out"), jb: [...document.querySelectorAll("[data-jb]")],
  tip: document.querySelector("#tip"), clean: document.querySelector("#clean"), age: document.querySelector("#age"), lamp: document.querySelector("#lamp"), slow: document.querySelector("#slow"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"),
};
const sliding = {};
const tpos = (t) => (clamp((t - 20) / (520 - 20), 0, 1) * 100).toFixed(1) + "%";
function syncUi() {
  ui.dust.forEach((b, i) => b.setAttribute("aria-pressed", String(i === dust)));
  if (!sliding.weeks) ui.weeks.value = Math.round(weeks);
  ui.wOut.textContent = Math.round(weeks) + " wk · " + mm().toFixed(1) + " mm";
  ui.wOut.dataset.bad = String(mm() > 5);
  ui.tFill.style.width = tpos(temp);
  ui.tFill.dataset.state = smoulder > 0 ? "fire" : temp > tmax() ? "hot" : "ok";
  ui.tOut.textContent = Math.round(temp) + " °C";
  ui.mk.style.left = tpos(M.marked);
  ui.lim.style.left = tpos(tmax()); ui.lim.dataset.label = "limit " + Math.round(tmax());
  ui.ign.style.left = tpos(layerIgn()); ui.ign.dataset.label = "layer lights " + Math.round(layerIgn());
  ui.jbFill.style.width = (jbFill() * 100).toFixed(1) + "%";
  ui.jbFill.dataset.state = jbFire > 0 ? "fire" : jbFill() >= M.jbBurn ? "hot" : "ok";
  ui.jbOut.textContent = jbFire > 0.1 ? "burning" : sealed ? "clean" : Math.round(jbFill() * 100) + " % full";
  ui.jb.forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.jb === "sealed") === sealed)));
  ui.age.setAttribute("aria-pressed", String(ageing));
  ui.lamp.setAttribute("aria-pressed", String(lamp)); ui.lamp.textContent = lamp ? "Light on" : "Light off";
  ui.slow.setAttribute("aria-pressed", String(slow));
  ui.tour.setAttribute("aria-pressed", String(touring));
}
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };

function tip() {
  if (booming() || (tipAt !== null && now - tipAt < 3)) return;
  tipAt = now; cloudAt = now + 0.45;
}

function step(dt) {
  lampLevel += ((lamp ? 1 : 0) - lampLevel) * (1 - Math.exp(-dt / 0.2));
  if (primaryAt !== null && boomAt === null) {
    if (now - primaryAt > 0.5) { boomAt = now; big = clamp((weeks - 3) / 30, 0, 1); lamp = false;
      const g = Dd();
      say(big > 0.4
        ? "Boom, then the big one. The " + (primSrc === "jb" ? "fire in the junction box" : "smouldering layer on the light") + " lit the cloud from the bag (the primary). Its blast threw " + Math.round(weeks) + " weeks of " + g.name + " off every beam and ledge into the air, and that lit too: the secondary. That's the one that takes buildings. How big it gets is purely housekeeping."
        : "Boom, a small one. The " + (primSrc === "jb" ? "fire in the junction box" : "smouldering layer on the light") + " lit the cloud from the bag, but the beams were fairly clean, so there wasn't much for a secondary to feed on. Clean plants have small accidents.");
    }
    return;
  }
  if (boomAt !== null) return;
  if (ageing) weeks = Math.min(M.maxWeeks, weeks + dt * 3);
  const target = lamp ? tUnder() : 25;
  temp += (target - temp) * (1 - Math.exp(-dt / M.tau));
  if (temp >= layerIgn() && mm() > 0.3) smoulder = Math.min(1, smoulder + dt * 0.5);
  else smoulder = Math.max(0, smoulder - dt * 0.4);
  // a loose terminal arcs in the dust that got into the box
  if (!sealed && jbFill() >= M.jbBurn && lamp) jbFire = Math.min(1, jbFire + dt * 0.45);
  else jbFire = Math.max(0, jbFire - dt * 0.5);
  // the cloud from the bag spreads; if it reaches a burning nest, that's the primary
  if (cloudAt !== null && now >= cloudAt) {
    const age = now - cloudAt;
    if (primaryAt === null && age > 0.7) {
      if (jbFire > 0.6) { primaryAt = now; primSrc = "jb"; say("The cloud from the bag drifted over the junction box, into the flame at the open plug hole…"); }
      else if (smoulder > 0.6) { primaryAt = now; primSrc = "lum"; say("The cloud from the bag drifted up into the smouldering layer on the light…"); }
    }
    if (age > 4) cloudAt = null;
  }
}

function chaos() {
  if (boomAt === null) return { c: -1, back: 0 };
  const c = now - boomAt;
  if (c < 0 || c > BOOM_END) return { c: -1, back: 0 };
  return { c, back: 1 - sm(3.2, 4.1, c) };
}
const tipFn = (c, delay, target) => { const u = Math.max(0, c - delay); return u <= 0 ? 0 : target * (1 - Math.exp(-u / 0.11) * Math.cos(u * 13)); };

function draw() {
  buildDust();
  const K = chaos();
  // bag tipping into the hopper
  const tAge = tipAt === null ? 99 : now - tipAt;
  const bagA = tAge < 2 ? 70 * sm(0, 0.4, tAge) * (1 - sm(1.2, 2, tAge)) : 0;
  bagG.setAttribute("transform", bagA ? "rotate(" + bagA.toFixed(1) + " " + D.pivots.bag[0].toFixed(1) + " " + D.pivots.bag[1].toFixed(1) + ")" : "");
  if (K.c >= 0) {
    const c = K.c, B = K.back * big;
    const fall = c < 0.9 ? 260 * c * c : 210;
    lumG.setAttribute("transform", "translate(" + (20 * Math.min(c, 0.9) * B).toFixed(1) + " " + (fall * B).toFixed(1) + ") rotate(" + (tipFn(c, 0.02, 30) * B).toFixed(1) + " " + D.pivots.lum[0].toFixed(1) + " " + D.pivots.lum[1].toFixed(1) + ")");
    jbG.setAttribute("transform", "rotate(" + (tipFn(c, 0.06, 60) * B).toFixed(1) + " " + D.pivots.jb[0].toFixed(1) + " " + D.pivots.jb[1].toFixed(1) + ")");
    for (const g of [beamDust, floorDust, lumDust, jbTop]) g.style.opacity = String(1 - K.back * sm(0, 0.3, c));
    const A = (4 + 6 * big) * Math.exp(-c / 0.4);
    stage.style.transform = "translate(" + (A * Math.sin(c * 90)).toFixed(1) + "px," + (A * Math.cos(c * 71)).toFixed(1) + "px)";
    flash.style.opacity = ((0.3 + 0.55 * big) * burst(c, 0.03, 0.25)).toFixed(3);
  } else if (boomAt !== null && now - boomAt > BOOM_END) {
    boomAt = null; primaryAt = null; smoulder = 0; jbFire = 0; cloudAt = null; tipAt = null; temp = M.bare; weeks = 0; built = ""; lamp = true;
    lumG.removeAttribute("transform"); jbG.removeAttribute("transform");
    for (const g of [beamDust, floorDust, lumDust, jbTop]) g.style.opacity = "";
    stage.style.transform = ""; flash.style.opacity = "0";
    say("Reset to a freshly cleaned plant. The bag station still makes a cloud every shift. That's normal, it's why it's Zone 21. The cloud only matters when it finds something burning.");
  }
  if (gl) {
    const c = LIGHT ? Dd().light[0] : Dd().colour[1];
    const cl = cloudAt === null || now < cloudAt ? 0 : sm(0, 1.2, now - cloudAt) * (1 - sm(2.4, 4, now - cloudAt));
    const prim = primaryAt !== null ? now - primaryAt : -1;
    const at = primSrc === "jb" ? [D.JB.x + 18, D.JB.y + D.JB.d + 4, D.JB.z0 + 14] : [D.LAMP_C[0], D.LAMP_C[1], D.LUM.z1 + 2];
    gl.draw({ uLamp: K.c >= 0 ? 0 : lampLevel, uSmoulder: K.c >= 0 ? 0 : smoulder, uDustTop: D.LUM.z1 + mm() * D.DUST_K + 0.1, uJbFire: K.c >= 0 ? 0 : jbFire, uIngress: sealed || K.c >= 0 ? 0 : 0.35 + 0.65 * (ageing ? 1 : 0.3), uCloud: K.c >= 0 ? 0 : cl, uPrimary: prim, uPrimAt: at, uBoom: K.c, uBig: big, uDustCol: hex(c) }, now);
  }
  const text = K.c >= 0 ? (K.c < 3.2 ? (big > 0.4 ? "BOOM · secondary explosion" : "BOOM · primary only") : "resetting…")
    : primaryAt !== null ? "PRIMARY · the cloud found the fire"
    : Math.round(weeks) + " wk · " + mm().toFixed(1) + " mm · " + Math.round(temp) + " °C" + (smoulder > 0.3 ? " · SMOULDERING" : "") + " · JB " + (sealed ? "sealed" : jbFire > 0.3 ? "BURNING" : Math.round(jbFill() * 100) + " %");
  if (readout.textContent !== text) readout.textContent = text;
  if (boomAt === null && primaryAt === null) {
    const g = Dd();
    const cl = cloudAt !== null && now >= cloudAt;
    if (cl && now - cloudAt > 1) say("A cloud of " + g.name + " from the bag. Normal for a bag-tip station. Nothing out here is hot enough to light it: the light's at " + Math.round(temp) + " °C and this cloud needs about " + g.cloud + " °C. It settles and adds to the layer.");
    else if (!cl && jbFire > 0.6) say("A loose terminal is arcing in the dust that got in through the missing plug, and the box is burning inside. No bang on its own. Now imagine the next bag gets tipped.");
    else if (!cl && smoulder > 0.6) say("Smouldering. " + Math.round(weeks) + " weeks of " + g.name + " (" + mm().toFixed(1) + " mm) is a blanket on the light: " + Math.round(temp) + " °C under it, past the " + Math.round(layerIgn()) + " °C this layer lights at. No flame, no bang. Yet. Now imagine the next bag gets tipped.");
    else if (!cl && !sealed && jbFill() > 0.15) say("Missing blanking plug. Dust is drifting into the junction box: " + Math.round(jbFill() * 100) + " % full. An Ex t box only works if the dust stays out.");
    else if (!cl && mm() > 5) say(Math.round(weeks) + " weeks without cleaning: " + mm().toFixed(1) + " mm on the light. Its T135 marking only holds up to 5 mm, and it's " + Math.round(temp) + " °C under there" + (temp > tmax() ? ", past the " + Math.round(tmax()) + " °C limit for this dust." : "."));
    else if (!cl) say(Math.round(weeks) + " weeks since the last clean. " + mm().toFixed(1) + " mm on the light, " + Math.round(temp) + " °C under it. Fine.");
  }
}

const TOUR = [
  { dust: 0, weeks: 4, sealed: true, tip: 2.5, hold: 7 },
  { dust: 0, weeks: 44, sealed: true, tip: 6.5, hold: 12 },
  { dust: 1, weeks: 8, sealed: false, tip: 3, hold: 7 },
  { dust: 1, weeks: 14, sealed: false, tip: 5.5, hold: 11 },
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
      dust = s.dust; weeks = s.weeks; sealed = s.sealed; lamp = true; temp = M.bare; smoulder = 0; jbFire = 0; cloudAt = null; tipAt = null; built = "";
      applyDustColour(); pendingTip = now + s.tip; tourEnd = tourClock + s.hold;
    }
    if (pendingTip !== null && now >= pendingTip) { pendingTip = null; tip(); }
  }
  step(sdt);
  draw(); syncUi();
  const settled = Math.abs(temp - (lamp ? tUnder() : 25)) < 0.3 && Math.abs(lampLevel - (lamp ? 1 : 0)) < 0.01;
  const busy = touring || ageing || !settled || cloudAt !== null || (tipAt !== null && now - tipAt < 2.5) || (smoulder > 0 && smoulder < 1) || smoulder > 0 || jbFire > 0 || (!sealed) || primaryAt !== null || boomAt !== null || drag;
  frame = visible && busy ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { touring = false; pendingTip = null; };
const guard = (fn) => (...a) => { takeOver(); if (booming()) return; fn(...a); run(); };
const setDust = guard((i) => { dust = i; smoulder = 0; applyDustColour(); });
const setWeeks = guard((v) => { weeks = clamp(Math.round(v), 0, M.maxWeeks); });
const setJb = guard((s) => { sealed = s; });
const doTip = guard(() => tip());
const doClean = guard(() => { weeks = 0; smoulder = 0; jbFire = 0; ageing = false; say("Cleaned: vacuumed, not blown down with an air hose (that just makes a cloud). Nothing on the light, nothing on the beams, nothing to feed a secondary."); });
const toggleAge = guard(() => { ageing = !ageing; });
const toggleLamp = guard(() => { lamp = !lamp; });
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;

ui.dust.forEach((b, i) => b.addEventListener("click", () => setDust(i)));
ui.weeks.addEventListener("input", () => { sliding.weeks = true; setWeeks(+ui.weeks.value); });
ui.weeks.addEventListener("change", () => { sliding.weeks = false; run(); });
ui.jb.forEach((b) => b.addEventListener("click", () => setJb(b.dataset.jb === "sealed")));
ui.tip.addEventListener("click", doTip);
ui.clean.addEventListener("click", doClean);
ui.age.addEventListener("click", toggleAge);
ui.lamp.addEventListener("click", toggleLamp);
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; tourClock = 0; } run(); });

let drag = null;
stage.addEventListener("pointerdown", (ev) => { drag = { x: ev.clientX, y: ev.clientY, from: weeks, moved: false }; stage.setPointerCapture(ev.pointerId); });
stage.addEventListener("pointermove", (ev) => {
  if (!drag) return;
  const dy = drag.y - ev.clientY;
  if (!drag.moved && Math.hypot(dy, ev.clientX - drag.x) < 5) return;
  drag.moved = true;
  setWeeks(drag.from + dy / (stage.getBoundingClientRect().height * 0.5) * M.maxWeeks);
});
stage.addEventListener("pointerup", () => { if (!drag) return; const was = drag; drag = null; if (!was.moved) doTip(); else run(); });
stage.addEventListener("pointercancel", () => { drag = null; });
stage.addEventListener("keydown", (ev) => {
  const map = { ArrowUp: () => setWeeks(weeks + 2), ArrowDown: () => setWeeks(weeks - 2), " ": doTip, Enter: doTip, c: doClean, p: () => setJb(!sealed), l: toggleLamp, g: () => setDust((dust + 1) % D.DUSTS.length), s: () => { slow = !slow; run(); } };
  if (map[ev.key]) { ev.preventDefault(); map[ev.key](); }
});
window.__fig = { freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
applyDustColour(); buildDust(); syncUi(); draw();
`;

const CSS = `.fx-stage{position:relative;cursor:ns-resize;touch-action:none}
.fx-layer{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.fx-gl{display:block}
body[data-theme="dark"] .fx-gl{mix-blend-mode:screen}
.fx-flash{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(closest-side at 50% 42%,#fff8e8 0%,#ffd9a0 40%,rgba(255,170,90,0) 100%)}
.iso-plate{overflow:hidden}
.iso-cable{stroke-width:1.4}
.iso-hole{fill:#050505;stroke:var(--anatomy-mid);stroke-width:.3}
.dust .iso-fill,.dust .iso-shade{fill:var(--dust,#555)}.dust .iso-top{fill:var(--dust-top,#666)}
.ctl{display:grid;gap:12px;margin:14px 0 6px;font-family:var(--anatomy-mono);font-size:12px;color:var(--anatomy-mid)}
.ctl-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ctl-label{min-width:72px;text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:var(--anatomy-lo)}
.ctl button{font:inherit;color:var(--anatomy-mid);background:transparent;border:1px solid var(--anatomy-lo);border-radius:6px;padding:7px 10px;cursor:pointer;line-height:1.15;text-align:left;min-height:36px}
.ctl button:hover{border-color:var(--anatomy-mid)}
.ctl button[aria-pressed="true"]{color:var(--anatomy-lit);border-color:var(--anatomy-lit)}
.ctl button small{display:block;font-size:10px;color:var(--anatomy-lo)}
.ctl #tip{border-color:#ff6a3d;color:#ff6a3d;font-weight:600;letter-spacing:.06em}
.ctl #clean{border-color:var(--anatomy-lit);color:var(--anatomy-lit);font-weight:600;letter-spacing:.06em}
.slide{position:relative;flex:1;min-width:110px;padding-top:16px}
.slide input{width:100%;accent-color:var(--anatomy-lit);margin:0}
.ctl output{min-width:96px;text-align:right;color:var(--anatomy-hi,var(--anatomy-mid))}
.ctl output[data-bad="true"]{color:#ff6a3d}
.notch{position:absolute;top:0;bottom:-2px;width:0;border-left:2px solid var(--anatomy-mid);pointer-events:none}
.notch::after{content:attr(data-label);position:absolute;top:0;left:4px;font-size:10px;white-space:nowrap;color:var(--anatomy-mid)}
.meter{position:relative;flex:1;min-width:110px;height:10px;margin-top:28px;border:1px solid var(--anatomy-lo);border-radius:5px}
.meter.plain{margin-top:14px}
.meter span.fill{position:absolute;left:0;top:0;bottom:0;border-radius:4px;background:var(--anatomy-mid);transition:width .15s}
.meter span.fill[data-state="hot"]{background:#ffb347}
.meter span.fill[data-state="fire"]{background:#ff5a2a}
.mark{position:absolute;bottom:-3px;width:0;pointer-events:none;transition:left .3s}
.mark::after{content:attr(data-label);position:absolute;top:0;left:4px;font-size:10px;white-space:nowrap}
#mark-t135{top:-14px;border-left:1px solid var(--anatomy-mid)}#mark-t135::after{color:var(--anatomy-mid)}
#mark-limit{top:-14px;border-left:1px dashed var(--anatomy-lit)}#mark-limit::after{color:var(--anatomy-lit)}
#mark-ign{top:-28px;border-left:1px dashed #ff6a3d}#mark-ign::after{color:#ff6a3d}
#mark-burn{top:-14px;border-left:1px dashed #ff6a3d}#mark-burn::after{color:#ff6a3d}
#shot{min-height:4.2em;font-size:12px;line-height:1.4}
@media (max-width:520px){.ctl-label{min-width:52px}.ctl button{padding:7px 8px}.ctl output{min-width:72px}.ctl button small{display:none}}`;

const stageHtml = `<div class="iso-stage fx-stage" tabindex="0" role="slider" aria-label="Weeks since cleaning: drag up and down or arrow keys; space tips a bag; C cleans; P toggles the blanking plug" aria-valuemin="0" aria-valuemax="${MODEL.maxWeeks}" aria-valuenow="${START.weeks}">${fig}<canvas class="fx-layer fx-gl" aria-hidden="true"></canvas><div class="fx-flash" aria-hidden="true"></div></div>`;

const CONTROLS = `<div class="ctl" role="group" aria-label="Test controls">
  <div class="ctl-row"><span class="ctl-label">Dust</span>${DUSTS.map((d, i) => `<button type="button" data-dust="${i}" aria-pressed="${i === START.dust}">${d.btn}<small>layer ${d.layer} · cloud ${d.cloud} °C</small></button>`).join("")}</div>
  <div class="ctl-row"><span class="ctl-label">Since cleaned</span><div class="slide"><span class="notch" data-label="5 mm on the light" style="left:${((5 / MODEL.mmPerWeek) / MODEL.maxWeeks * 100).toFixed(1)}%"></span><input id="weeks" type="range" min="0" max="${MODEL.maxWeeks}" step="1" value="${START.weeks}" aria-label="Weeks since the area was cleaned"></div><output id="weeks-out">${START.weeks} wk</output></div>
  <div class="ctl-row"><span class="ctl-label">Light °C</span><div class="meter" aria-hidden="true"><span id="temp-fill" class="fill"></span><span id="mark-t135" class="mark" data-label="T135"></span><span id="mark-limit" class="mark" data-label="limit"></span><span id="mark-ign" class="mark" data-label="layer lights"></span></div><output id="temp-out">90 °C</output></div>
  <div class="ctl-row"><span class="ctl-label">JB</span><button type="button" data-jb="sealed" aria-pressed="true">Sealed</button><button type="button" data-jb="open" aria-pressed="false">Plug missing</button><div class="meter plain" aria-hidden="true"><span id="jb-fill" class="fill"></span><span id="mark-burn" class="mark" style="left:${(MODEL.jbBurn * 100).toFixed(0)}%" data-label="enough to burn"></span></div><output id="jb-out">clean</output></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="tip">TIP A BAG</button><button type="button" id="clean">CLEAN</button><button type="button" id="age" aria-pressed="false">Let it go</button><button type="button" id="lamp" aria-pressed="true">Light on</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
  <div id="shot" aria-live="polite">Tip a bag: that cloud is normal. Then let the place go a few months without cleaning, or lose a blanking plug, and tip another.</div>
</div>`;

const card = k.plateHtml({
  fig: "Fig 7",
  title: "Ex t, dust and housekeeping",
  hint: "Drag: weeks · tap: tip",
  readout: "",
  keys: [
    { mark: "lit", label: "The light, smoulder, fire in the box, the clouds" },
    { mark: "raised", label: "Floodlight, junction box (cut open), hopper, beam and the dust on all of it" },
  ],
  caption: "Ex t does two jobs: keep dust out of the enclosure, and keep the outside cool enough. The surface marking (T135 °C here) only holds with up to 5 mm of dust on it. In a real plant it fails slowly. Months without cleaning bury a light until the layer under it smoulders, or a missing blanking plug lets dust into a junction box until a loose terminal lights it. Neither goes bang on its own. Then normal work, like tipping a bag, raises a cloud. The cloud finds the burning nest: that's the primary. Its blast throws everything that's settled on beams and ledges into the air, and that's the secondary, the one that takes the building. How big it gets is down to housekeeping.",
  body: stageHtml,
});

const other = theme === "light" ? ["index.html", "Dark version"] : ["light.html", "Light version"];
const FOOT = `<p style="font-family:var(--anatomy-mono);font-size:11px;color:var(--anatomy-lo);margin:28px 0 8px;line-height:1.6">A toy, not a certified anything. Real: the IEC 60079-14 dust rule (Tmax = the lower of ⅔ × cloud ignition temperature and 5 mm layer ignition temperature − 75 K, layers up to 5 mm) and the dusts' literature ignition temperatures. Made up: how fast dust settles, how hot the light runs under it, how fast the box fills, and the timings.<br>Built with <a href="https://github.com/wheresryan22/anatomy" style="color:inherit">Anatomy</a> by Ryan (MIT). · <a href="${other[0]}" style="color:inherit">${other[1]}</a> · <a href="../" style="color:inherit">More figures</a> · <a href="https://github.com/Dizzyfer/Anatomy/tree/main/ex-t-dust" style="color:inherit">Source</a></p>`;
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "Ex t dust", theme, body: `<style>${CSS}</style>${card.replace("<figcaption", CONTROLS + "<figcaption")}${FOOT}`, script: kitScript() + glScript() + LIVE.replace("__DATA__", JSON.stringify(DATA)), width: 700 }));
console.log("wrote", name);
