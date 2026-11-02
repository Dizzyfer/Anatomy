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

// Truth (IEC 60079-2, px): at least 50 Pa overpressure; pre-purge at least 5 enclosure volumes before power-on;
// on loss of pressure the power goes off automatically and stays off until a fresh purge; purge air from the safe area.
// Toy: outside sits at 150 % LEL; air doesn't mix perfectly, so each purged volume only knocks the gas down by e^-0.3.
const MODEL = { minPa: 50, runPa: 82, purgeVols: 5, volPerSec: 0.55, mix: 0.3, outside: 150, lel: 100, seep: 2.6, tauP: 0.35 };

const PLATE = { x: -124, y: -84, w: 254, d: 168, r: 8 };
const PLATE_H = 12, FOOT_H = 5;
const DIVIDE = -72;
const CAB = { x: -30, y: -34, w: 70, d: 60 };
const CUT = [18, 2];
const WALL = 2.5;
const Z0 = 4, ZF = 6.5, ZR = 78, ZTOP = 81;
const CONTACT = [0, -17, 50];
const VENT = [-18, -22];
const INLET = [-20, CAB.y + CAB.d];
const SAFE_IN = [-102, 46];
const ZONE_IN = [70, 62];

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [CAB.x, CAB.y, ZTOP + 10], [CAB.x + CAB.w, CAB.y, ZTOP]],
  W, H, { pad: 22, azimuth: 45 },
);

const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const Dt = (points, style) => k.dotsSvg(points, style);
const depth2 = ([x, y]) => k.depthOf([x, y, 0], P);
const byDepth = (pts) => [...pts].sort((a, b) => depth2(a) - depth2(b));
const slab = (plan, z, h, r = 1.2, bevel = 0.5) => k.slabOf({ r, ...plan }, z, h, P, 4, bevel);
const lRing = ({ x, y, w, d }) => [[x, y], [x + w, y], [x + w, CUT[1]], [CUT[0], CUT[1]], [CUT[0], y + d], [x, y + d]];
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
  const strip = { x: DIVIDE - 3, y: PLATE.y + 6, w: 6, d: PLATE.d - 12, r: 0.6 };
  out.push(S(slab(strip, 0, 0.6, 0.6, 0), { tone: "lo", crease: "none" }));
  const stripes = [];
  for (let y = strip.y + 2; y < strip.y + strip.d - 6; y += 5) stripes.push(k.segment([strip.x, y, 0.6], [strip.x + strip.w, y + 4, 0.6], P));
  out.push(L(stripes.join(""), { tone: "mid" }));
  out.push(k.faceTextSvg(k.topMatrix([-118, -76], 0, P, "x"), "SAFE AREA", { size: 5, tone: "lo" }));
  out.push(k.faceTextSvg(k.topMatrix([-50, 74], 0, P, "x"), "ZONE 1", { size: 5, tone: "lo" }));
  return out.join("");
}

function intake([x, y], tag) {
  const out = [];
  out.push(S(slab({ x: x - 8, y: y - 8, w: 16, d: 16 }, 0, 2, 1.5, 0.4), { tone: "mid" }));
  // blower
  out.push(S(slab({ x: x - 6, y: y - 6, w: 12, d: 12 }, 2, 10, 2, 0.5), { tone: "hi", inner: L(k.sideSeam({ x: x - 6, y: y - 6, w: 12, d: 12, r: 2 }, 7, P), { tone: "faint" }) }));
  // intake cowl with mesh
  out.push(S(k.cylinder(x, y, 5, 12, 6, P, 32, 0.4), { tone: "hi" }));
  out.push(L(k.ring(x, y, 3.8, 18, P, 28), { tone: "lo" }));
  const mesh = [];
  for (let d = -3; d <= 3; d += 1.5) { const h = Math.sqrt(Math.max(0, 14.4 - d * d)); mesh.push(k.segment([x + d, y - h, 18], [x + d, y + h, 18], P), k.segment([x - h, y + d, 18], [x + h, y + d, 18], P)); }
  out.push(L(mesh.join(""), { tone: "faint" }));
  return `<g data-intake="${tag}">${out.join("")}</g>`;
}
function pipe(points, tag) {
  const d = k.pathOf(points.map(at));
  return `<g data-pipe="${tag}"><path class="iso-pipe-out" d="${d}"/><path class="iso-pipe" d="${d}"/></g>`;
}

function cabinetBack() {
  const out = [`<path class="iso-halo" d="${k.haloOf({ ...k.insetPlan({ ...CAB, r: 2 }, -5) }, 0, 0.1, P)}"/>`];
  out.push(S(slab({ x: CAB.x - 2, y: CAB.y - 2, w: CAB.w + 4, d: CAB.d + 4 }, 0, Z0, 1, 0.4), { tone: "mid" }));
  out.push(S(lSolid(CAB, Z0, ZF - Z0), { tone: "mid" }));
  out.push(S(slab({ x: CAB.x, y: CAB.y, w: CAB.w, d: WALL }, ZF, ZR - ZF, 0.4, 0.2), { tone: "mid" }));
  out.push(S(slab({ x: CAB.x, y: CAB.y + WALL, w: WALL, d: CAB.d - WALL }, ZF, ZR - ZF, 0.4, 0.2), { tone: "mid" }));
  // back mounting plate and the gear on it
  const bp = { x: CAB.x + 4, y: CAB.y + WALL, w: 44, d: 1 };
  out.push(S(slab(bp, 10, 64, 0.3, 0), { tone: "lo", crease: "none" }));
  for (const z of [24, 44, 64]) out.push(S(slab({ x: bp.x + 2, y: bp.y + 1, w: bp.w - 4, d: 1.4 }, z, 2.4, 0.2, 0), { tone: "mid" }));
  // transformer (low)
  out.push(S(slab({ x: -24, y: bp.y + 1, w: 14, d: 12 }, 12, 12, 0.6, 0.3), { tone: "hi", inner: L([15, 18, 21].map((z) => k.segment([-24, bp.y + 13, z], [-10, bp.y + 13, z], P)).join(""), { tone: "faint" }) }));
  // contactor (the spark)
  const c = { x: -6, y: bp.y + 2.4, w: 12, d: 12 };
  out.push(S(slab(c, 44 + 2.4, 12, 0.6, 0.3), { tone: "hi" }));
  out.push(Dt([at([c.x + 3, c.y + c.d, 55]), at([c.x + 9, c.y + c.d, 55])], { size: 0.5, tone: "mid" }));
  // breakers and I/O modules
  for (let i = 0; i < 5; i++) out.push(S(slab({ x: bp.x + 4 + i * 6, y: bp.y + 2.4, w: 5, d: 9 }, 64 + 2.4, 10, 0.4, 0.2), { tone: i === 2 ? "hi" : "mid" }));
  for (let i = 0; i < 3; i++) out.push(S(slab({ x: 10 + i * 5, y: bp.y + 2.4, w: 4, d: 8 }, 24 + 2.4, 10, 0.4, 0.2), { tone: "mid" }));
  return out.join("");
}

function cabinetFront() {
  const out = [];
  const wx = { x: CAB.x + CAB.w - WALL, y: CAB.y + WALL, w: WALL, d: CUT[1] - CAB.y - WALL };
  const wy = { x: CAB.x + WALL, y: CAB.y + CAB.d - WALL, w: CUT[0] - CAB.x - WALL, d: WALL };
  out.push(S(slab(wx, ZF, ZR - ZF, 0.2, 0), { tone: "mid" }));
  out.push(S(slab(wy, ZF, ZR - ZF, 0.2, 0), { tone: "mid" }));
  // roof
  out.push(S(lSolid(CAB, ZR, ZTOP - ZR), { tone: "mid" }));
  out.push(L(k.onTop(lRing(k.insetPlan({ ...CAB, r: 0 }, 2)), ZTOP, P, true), { tone: "faint" }));
  // vent with spark arrestor
  out.push(S(k.cylinder(VENT[0], VENT[1], 3.4, ZTOP, 6, P, 28), { tone: "mid" }));
  out.push(S(k.cylinder(VENT[0], VENT[1], 5.2, ZTOP + 6, 1.4, P, 32), { tone: "mid" }));
  out.push(S(k.cylinder(VENT[0], VENT[1], 4.4, ZTOP + 7.4, 2.4, P, 32, 0.3), { tone: "mid", inner: L(k.sideArc(VENT[0], VENT[1], 4.4, ZTOP + 8.6, P, 24), { tone: "faint" }) }));
  // inlet valve on the front face
  out.push(S(slab({ x: INLET[0] - 4, y: INLET[1], w: 8, d: 3 }, 6, 8, 1, 0.3), { tone: "mid" }));
  out.push(S(k.cylinder(INLET[0], INLET[1] + 1.5, 2.4, 14, 5, P, 20), { tone: "hi" }));
  return out.join("");
}

function door() {
  const out = [];
  const d = { x: CAB.x + 4, y: CAB.y + CAB.d, w: CUT[0] - CAB.x - 8, d: 1 };
  out.push(S(slab(d, 12, 60, 0.4, 0.3), { tone: "hi", inner: L(k.segment([d.x + 3, d.y + 1, 66], [d.x + d.w - 3, d.y + 1, 66], P), { tone: "faint" }) }));
  out.push(S(slab({ x: d.x + d.w - 6, y: d.y + 1, w: 2.4, d: 2 }, 36, 10, 0.6, 0.3), { tone: "mid" }));
  const m = k.sideMatrix([d.x + 5, d.y + 1.01], 62, P, "left");
  out.push(`<g transform="${m}"><rect x="0" y="0" width="28" height="9" rx=".6" style="fill:var(--anatomy-paper);stroke:var(--anatomy-mid);stroke-width:.3"/><text class="iso-face-text" data-tone="mid" x="1.6" y="3.8" font-size="2.6">Ex pxb IIC T4</text><text class="iso-face-text" data-tone="lo" x="1.6" y="7.2" font-size="2">DO NOT OPEN UNLESS</text></g>`);
  return `<g data-part="door">${out.join("")}</g>`;
}

function controller() {
  const out = [];
  const c = { x: CAB.x + CAB.w, y: -30, w: 5, d: 26 };
  out.push(S(slab(c, 40, 32, 0.8, 0.4), { tone: "hi" }));
  const face = c.x + c.w + 0.01;
  // gauge, drawn in the plane of the controller face (local x runs along −y, local y runs down)
  const m = k.sideMatrix([face, c.y + c.d], 72, P, "right");
  const cx = 13, cy = 10, r = 7.5;
  const ticks = [];
  for (let i = 0; i <= 15; i++) {
    const a = (-225 + (i / 15) * 270) * Math.PI / 180, r0 = i % 5 === 0 ? r - 2 : r - 1.2;
    ticks.push(`M${(cx + Math.cos(a) * r0).toFixed(2)} ${(cy + Math.sin(a) * r0).toFixed(2)}L${(cx + Math.cos(a) * (r - 0.4)).toFixed(2)} ${(cy + Math.sin(a) * (r - 0.4)).toFixed(2)}`);
  }
  const a50 = (-225 + (50 / 150) * 270) * Math.PI / 180;
  out.push(`<g transform="${m}">
    <circle cx="${cx}" cy="${cy}" r="${r}" style="fill:var(--anatomy-paper);stroke:var(--anatomy-mid);stroke-width:.45"/>
    <path d="${ticks.join("")}" style="stroke:var(--anatomy-mid);stroke-width:.3;fill:none"/>
    <path d="M${(cx + Math.cos(a50) * (r - 2.4)).toFixed(2)} ${(cy + Math.sin(a50) * (r - 2.4)).toFixed(2)}L${(cx + Math.cos(a50) * (r - 0.3)).toFixed(2)} ${(cy + Math.sin(a50) * (r - 0.3)).toFixed(2)}" style="stroke:#ff6a3d;stroke-width:.7"/>
    <text class="iso-face-text" data-tone="lo" x="${cx}" y="${cy + 4.6}" font-size="1.6" text-anchor="middle">Pa</text>
    <path data-part="needle" d="M${cx} ${cy}L${cx} ${cy - r + 1.4}" style="stroke:var(--anatomy-lit);stroke-width:.55" transform="rotate(-135 ${cx} ${cy})"/>
    <circle cx="${cx}" cy="${cy}" r=".7" style="fill:var(--anatomy-lit)"/>
    <circle data-part="lamp-ok" cx="7" cy="21" r="1.6" class="lamp" data-on="false" data-col="ok"/>
    <circle data-part="lamp-trip" cx="13" cy="21" r="1.6" class="lamp" data-on="false" data-col="trip"/>
    <circle data-part="lamp-power" cx="19" cy="21" r="1.6" class="lamp" data-on="false" data-col="power"/>
    <text class="iso-face-text" data-tone="lo" x="7" y="25" font-size="1.3" text-anchor="middle">PURGED</text>
    <text class="iso-face-text" data-tone="lo" x="13" y="25" font-size="1.3" text-anchor="middle">TRIP</text>
    <text class="iso-face-text" data-tone="lo" x="19" y="25" font-size="1.3" text-anchor="middle">POWER</text>
    <text data-part="vols" class="iso-face-text" data-tone="mid" x="13" y="29.4" font-size="2" text-anchor="middle">VOL 0.0</text>
  </g>`);
  // sensing tube into the wall
  out.push(L(k.pathOf([[c.x + 1, c.y + 4, 40], [c.x + 1, c.y + 4, 34], [c.x - 0.2, c.y + 4, 34]].map(at)), { tone: "mid" }));
  return out.join("");
}

const START = { safeIntake: true, interlock: true };
const backSvg = k.figureSvg({
  width: W, height: H,
  label: "A pressurised Ex p control cabinet on a bench in Zone 1, cut open to show a contactor and a transformer inside. Purge air comes from an intake hood in the safe area through a valve; a vent with a spark arrestor lets it out of the roof. A purge controller on the side shows the pressure and counts purge volumes.",
  body: [plate(), pipe([[SAFE_IN[0], SAFE_IN[1], 6], [SAFE_IN[0] + 10, SAFE_IN[1], 3], [-50, SAFE_IN[1], 3], [-40, 40, 3], [INLET[0], 40, 3], [INLET[0], INLET[1] + 3, 8]], "safe"), pipe([[ZONE_IN[0], ZONE_IN[1], 6], [ZONE_IN[0] - 10, ZONE_IN[1], 3], [10, 48, 3], [INLET[0], 40, 3], [INLET[0], INLET[1] + 3, 8]], "zone"), intake(SAFE_IN, "safe"), intake(ZONE_IN, "zone"), cabinetBack()],
});
const layer = (body) => `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg fx-layer" viewBox="0 0 ${W} ${H}" aria-hidden="true">${body}</svg>`;
const frontSvg = layer([cabinetFront(), door(), controller()].join(""));

const DATA = {
  W, H, camera: glCamera(P), P, MODEL, start: START,
  pivots: { door: at([CAB.x + 4, CAB.y + CAB.d, 12]), cab: at([CAB.x + CAB.w / 2, CAB.y + CAB.d / 2, 0]), safe: at([SAFE_IN[0], SAFE_IN[1], 0]), zone: at([ZONE_IN[0], ZONE_IN[1], 0]) },
};

const SHARED = `
uniform float uLight;
uniform float uGas;
uniform float uFlow;
uniform float uSpark;
uniform float uBoom;
uniform float uIn;
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
vec4 gasInk(float h){float a=(1.-exp(-h))*mix(.3,.28,uLight);return vec4(mix(vec3(.42,.72,.66),vec3(.18,.44,.4),uLight)*a,a);}
vec4 airInk(float h){float a=(1.-exp(-h))*mix(.22,.18,uLight);return vec4(mix(vec3(.85,.9,.95),vec3(.45,.55,.65),uLight)*a,a);}
float edgeFade(vec2 vb){return smoothstep(0.,80.,min(min(vb.x,uView.x-vb.x),min(vb.y,uView.y-vb.y)));}
`;

const INNER = SHARED + `
const vec3 BMIN=vec3(${(CAB.x + WALL).toFixed(1)},${(CAB.y + WALL).toFixed(1)},${ZF.toFixed(1)});
const vec3 BMAX=vec3(${(CAB.x + CAB.w - WALL).toFixed(1)},${(CAB.y + CAB.d - WALL).toFixed(1)},${ZR.toFixed(1)});
const vec3 SPK=vec3(${CONTACT.map((v) => v.toFixed(1)).join(",")});
void main(){
  vec2 vb=viewOf(gl_FragCoord.xy);
  vec3 V=towardViewer(), p0=rayOf(vb);
  vec3 ia=(BMIN-p0)/V, ib=(BMAX-p0)/V, lo=min(ia,ib), hi=max(ia,ib);
  float t0=max(max(lo.x,lo.y),lo.z), t1=min(min(hi.x,hi.y),hi.z);
  vec4 o=vec4(0.);
  if(t1>t0){
    float g=0., air=0., dt=(t1-t0)/16.;
    for(int i=0;i<16;i++){
      vec3 p=p0+(t0+(float(i)+hash12(gl_FragCoord.xy+float(i)))*dt)*V;
      float kept=1.-smoothstep(-2.,2.,min(p.x-${CUT[0].toFixed(1)},p.y-${CUT[1].toFixed(1)}));
      float n=fbm3(p*.05+vec3(0.,0.,-uTime*.25));
      // purge air sweeps up from the inlet at the bottom front to the vent at the back of the roof
      vec3 a=vec3(${INLET[0].toFixed(1)},${(INLET[1] - 4).toFixed(1)},10.), b=vec3(${VENT[0].toFixed(1)},${VENT[1].toFixed(1)},76.);
      vec3 ab=b-a; float h=clamp(dot(p-a,ab)/dot(ab,ab),0.,1.);
      float lane=exp(-pow(length(p-a-ab*h)/9.,2.));
      float streak=smoothstep(.4,.9,noise3(vec3(h*14.-uTime*5.,p.x*.15,p.z*.08)));
      g+=kept*(.6+.7*n)*dt/38.;
      air+=kept*lane*streak*dt/16.;
    }
    o=over(airInk(air*uFlow*2.2),gasInk(g*uGas*2.4));
  }
  if(uSpark>.002){
    float d=length(vb-project(SPK))/uK;
    float fl=.6+.4*noise2(vec2(uTime*50.,2.));
    o=over(arcInk((exp(-pow(d/.45,2.))*2.2+exp(-pow(d/2.4,2.))*.7)*uSpark*fl),o);
  }
  o.rgb=min(o.rgb,vec3(o.a));
  float dd=(hash12(gl_FragCoord.xy+uTime)-.5)/255.*smoothstep(0.,1.5/255.,o.a);
  gl_FragColor=max(o+dd,0.);
}`;

const OUTER = SHARED + `
const vec2 VT=vec2(${VENT.map((v) => v.toFixed(1)).join(",")});
const vec2 INTAKE_SAFE=vec2(${SAFE_IN.map((v) => v.toFixed(1)).join(",")});
const vec2 INTAKE_ZONE=vec2(${ZONE_IN.map((v) => v.toFixed(1)).join(",")});
void main(){
  vec2 vb=viewOf(gl_FragCoord.xy);
  vec4 o=vec4(0.);
  // Zone 1 gas hanging over the bench, not in the safe area, not inside the cabinet
  float h=0.;
  for(int i=0;i<5;i++){
    float z=(float(i)+.5)*8.;
    vec3 p=onFloor(vb,z);
    float zone=smoothstep(${DIVIDE.toFixed(1)}+4.,${DIVIDE.toFixed(1)}+28.,p.x)*(1.-smoothstep(106.,130.,p.x))*smoothstep(-84.,-60.,p.y)*(1.-smoothstep(60.,84.,p.y));
    vec2 q=abs(p.xy-vec2(${(CAB.x + CAB.w / 2).toFixed(1)},${(CAB.y + CAB.d / 2).toFixed(1)}))-vec2(${(CAB.w / 2).toFixed(1)},${(CAB.d / 2).toFixed(1)});
    float outside=smoothstep(0.,8.,max(q.x,q.y));
    float n=fbm2(p.xy*.022+vec2(uTime*.03,-uTime*.02)+z*.05);
    h+=zone*outside*smoothstep(.35,.85,n)*exp(-z/16.)*.42;
  }
  o=gasInk(h);
  // what comes out of the vent: clean air, or gas being pushed out
  if(uFlow>.002){
    float pl=0., gp=0.;
    for(int i=0;i<8;i++){
      float z=${(ZTOP + 10).toFixed(1)}+float(i)*4.;
      vec3 p=onFloor(vb,z);
      vec2 c=VT+vec2(sin(z*.1+uTime)*2.,0.);
      float w=exp(-pow(length(p.xy-c)/(2.6+(z-${(ZTOP + 10).toFixed(1)})*.22),2.))*fbm2(p.xy*.12+vec2(0.,-uTime*.9))*.5;
      pl+=w;
    }
    o=over(mix(airInk(pl*uFlow*1.6),gasInk(pl*uFlow*2.),clamp(uGas,0.,1.)),o);
    // suction at whichever intake is in use
    vec2 ic=mix(INTAKE_ZONE,INTAKE_SAFE,uIn);
    vec2 iv=(vb-project(vec3(ic,22.)))/uK;
    float swirl=exp(-pow(length(iv)/7.,2.))*smoothstep(.45,.9,noise2(vec2(atan(iv.y,iv.x)*3.+uTime*4.,length(iv)*.6-uTime*3.)));
    o=over(mix(gasInk(swirl*uFlow*1.6),airInk(swirl*uFlow*1.6),uIn),o);
  }
  if(uBoom>0.){
    float c=uBoom;
    vec3 C=vec3(${((CAB.x + CAB.w / 2)).toFixed(1)},${(CAB.y + CAB.d / 2).toFixed(1)},48.+26.*c);
    vec2 dv=(vb-project(C))/uK;
    float d=length(dv);
    float R=18.+70.*(1.-exp(-c/.2));
    float n=fbm3(vec3(dv*.045,c*1.6));
    float shell=exp(-pow((d-R*(.84+.28*n))/(7.+R*.13),2.));
    float core=(1.-smoothstep(R*.35,R*(.8+.25*n),d))*(.5+.7*n);
    float life=smoothstep(0.,.05,c)*exp(-c/.6);
    vec3 fp=onFloor(vb,0.);
    float ring=exp(-pow((length(fp.xy-C.xy)-(30.+380.*c))/6.,2.))*exp(-c/.32)*.7*smoothstep(${DIVIDE.toFixed(1)}-10.,${DIVIDE.toFixed(1)}+10.,fp.x);
    float ef=edgeFade(vb);
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
const U = ["uGas", "uFlow", "uSpark", "uBoom", "uIn"];
const inner = glLayer({ canvas: stage.querySelector(".fx-inner"), fragment: ${JSON.stringify(INNER)}, view: [D.W, D.H], camera: D.camera, uniforms: U, fixed: { uLight: LIGHT } });
const outer = glLayer({ canvas: stage.querySelector(".fx-outer"), fragment: ${JSON.stringify(OUTER)}, view: [D.W, D.H], camera: D.camera, uniforms: U, fixed: { uLight: LIGHT } });
const GL = !!(inner && outer);
if (GL) stage.setAttribute("data-gl", "");

let safeIntake = D.start.safeIntake, interlock = D.start.interlock;
let air = false, power = false, doorOpen = false, pa = 0, vols = 0, gas = M.outside, tripAt = null, sparkAt = -10, nextSwitch = 0, boomAt = null, cause = "", doorA = 0;
let frame = 0, last = 0, now = 0, visible = false, touring = true, slow = false, tourClock = 0, tourStep = -1, tourAt = 0, lastShot = "", actions = [];
const BOOM_END = 4.4;
const booming = () => boomAt !== null && now - boomAt < BOOM_END + 0.3;
const purged = () => vols >= M.purgeVols;

const needle = q("needle"), volsT = q("vols"), lampOk = q("lamp-ok"), lampTrip = q("lamp-trip"), lampPower = q("lamp-power"), doorG = q("door"), flash = stage.querySelector(".fx-flash");
const pipeSafe = stage.querySelector('[data-pipe="safe"]'), pipeZone = stage.querySelector('[data-pipe="zone"]'), inSafe = stage.querySelector('[data-intake="safe"]'), inZone = stage.querySelector('[data-intake="zone"]');

const ui = {
  intake: [...document.querySelectorAll("[data-intake-btn]")], lock: [...document.querySelectorAll("[data-lock]")],
  pFill: document.querySelector("#p-fill"), pOut: document.querySelector("#p-out"),
  vFill: document.querySelector("#v-fill"), vOut: document.querySelector("#v-out"),
  gFill: document.querySelector("#g-fill"), gOut: document.querySelector("#g-out"),
  air: document.querySelector("#air"), power: document.querySelector("#power"), door: document.querySelector("#door"),
  slow: document.querySelector("#slow"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"),
};
function syncUi() {
  ui.intake.forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.intakeBtn === "safe") === safeIntake)));
  ui.lock.forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.lock === "on") === interlock)));
  ui.pFill.style.width = (clamp(pa / 150, 0, 1) * 100).toFixed(1) + "%"; ui.pFill.dataset.state = pa < M.minPa ? "low" : "ok";
  ui.pOut.textContent = Math.round(pa) + " Pa";
  ui.vFill.style.width = (clamp(vols / 8, 0, 1) * 100).toFixed(1) + "%"; ui.vFill.dataset.state = purged() ? "ok" : "low";
  ui.vOut.textContent = vols.toFixed(1) + " vol";
  ui.gFill.style.width = (clamp(gas / 200, 0, 1) * 100).toFixed(1) + "%"; ui.gFill.dataset.state = gas >= M.lel ? "bad" : gas > 10 ? "warn" : "ok";
  ui.gOut.textContent = Math.round(gas) + " % LEL";
  ui.air.setAttribute("aria-pressed", String(air)); ui.air.textContent = air ? "AIR OFF" : "PURGE";
  ui.power.setAttribute("aria-pressed", String(power)); ui.power.textContent = power ? "POWER OFF" : "POWER ON";
  ui.door.setAttribute("aria-pressed", String(doorOpen)); ui.door.textContent = doorOpen ? "Close door" : "Open door";
  ui.slow.setAttribute("aria-pressed", String(slow));
  ui.tour.setAttribute("aria-pressed", String(touring));
}
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };

function blowUp(why) {
  if (boomAt !== null) return;
  boomAt = now + 0.12; cause = why; power = false; air = false;
  say(why === "nopurge" ? "Boom. Power went on with the cabinet still full of the zone's gas, and the contactor's first spark lit it. That's what the pre-purge is for, and what the interlock exists to stop."
    : why === "intake" ? "Boom, and the interlock was happy. It saw the pressure and counted " + vols.toFixed(1) + " volumes, but it can't smell the air: the intake was in Zone 1, so the cabinet was purged with gas. Purge air has to come from the safe area."
    : why === "door" ? "Boom. The door came open while it was live, the pressure fell, gas seeped back in, and with the interlock bypassed nothing cut the power. The contactor did the rest."
    : "Boom. Gas got back in while it was live and nothing cut the power.");
}

function step(dt) {
  if (boomAt !== null) return;
  const sealedFlow = air && !doorOpen;
  const target = sealedFlow ? M.runPa : 0;
  pa += (target - pa) * (1 - Math.exp(-dt / M.tauP));
  if (sealedFlow) {
    const dv = M.volPerSec * dt;
    vols += dv;
    const f = 1 - Math.exp(-M.mix * dv);
    gas += ((safeIntake ? 0 : M.outside) - gas) * f;
  }
  if (pa < M.minPa) {
    // no overpressure: the zone's gas seeps back in
    gas += (M.outside - gas) * (1 - Math.exp(-dt / M.seep)) * (doorOpen ? 2.2 : 1);
    if (vols > 0 && !air) vols = Math.max(0, vols - dt * 2);
    if (doorOpen) vols = 0;
  }
  // the px interlock: power off on loss of pressure, and only back on after a fresh purge
  if (interlock && power && pa < M.minPa) { power = false; tripAt = now; vols = 0; say("Trip. The pressure dropped below " + M.minPa + " Pa, so the interlock cut the power, and it won't let it back on until the cabinet's been purged again. That's px doing its job."); }
  if (power) {
    if (now >= nextSwitch) { sparkAt = now; nextSwitch = now + 1.1; if (gas >= M.lel) blowUp(!safeIntake && vols >= M.purgeVols ? "intake" : doorOpen ? "door" : vols < M.purgeVols ? "nopurge" : "seep"); }
  }
}

function tryPower() {
  if (power) { power = false; return; }
  if (interlock && !(pa >= M.minPa && purged())) { say("The interlock won't allow it: " + (pa < M.minPa ? "there's no overpressure" : "it's only been purged " + vols.toFixed(1) + " of " + M.purgeVols + " volumes") + ". Purge first."); return; }
  power = true; nextSwitch = now + 0.4; tripAt = null;
}

function chaos() {
  if (boomAt === null) return { c: -1, back: 0 };
  const c = now - boomAt;
  if (c < 0 || c > BOOM_END) return { c: -1, back: 0 };
  return { c, back: 1 - sm(3.2, 4.1, c) };
}

function draw() {
  pipeSafe.style.display = safeIntake ? "" : "none"; inSafe.style.opacity = safeIntake ? "1" : "0.35";
  pipeZone.style.display = safeIntake ? "none" : ""; inZone.style.display = safeIntake ? "none" : "";
  const K = chaos();
  doorA += ((doorOpen ? 1 : 0) - doorA) * 0.2;
  let dT = doorA > 0.01 ? "rotate(" + (-62 * doorA).toFixed(1) + " " + D.pivots.door[0].toFixed(1) + " " + D.pivots.door[1].toFixed(1) + ")" : "";
  if (K.c >= 0) {
    const c = K.c, land = 0.9, cl = Math.min(c, land);
    const dx = -170 * cl, dy = c < land ? -380 * c + 520 * c * c : 60;
    dT = "translate(" + (dx * K.back).toFixed(1) + " " + (dy * K.back).toFixed(1) + ") rotate(" + (-420 * cl * K.back).toFixed(1) + " " + D.pivots.door[0].toFixed(1) + " " + D.pivots.door[1].toFixed(1) + ")";
    const A = 8 * Math.exp(-c / 0.4);
    stage.style.transform = "translate(" + (A * Math.sin(c * 90)).toFixed(1) + "px," + (A * Math.cos(c * 71)).toFixed(1) + "px)";
    flash.style.opacity = (0.85 * burst(c, 0.03, 0.25)).toFixed(3);
  } else if (boomAt !== null && now - boomAt > BOOM_END) {
    boomAt = null; gas = M.outside; vols = 0; pa = 0; doorOpen = false; doorA = 0; power = false; air = false;
    stage.style.transform = ""; flash.style.opacity = "0";
    say("Reset. The cabinet's full of the zone's gas again, like any box that's been sitting in Zone 1 switched off. Purge it before you power it.");
  }
  doorG.setAttribute("transform", dT);
  needle.setAttribute("transform", "rotate(" + (-135 + clamp(pa / 150, 0, 1) * 270).toFixed(1) + " 13 10)");
  volsT.textContent = "VOL " + vols.toFixed(1);
  lampOk.dataset.on = String(purged() && pa >= M.minPa);
  lampTrip.dataset.on = String(tripAt !== null && now - tripAt < 4 && Math.sin(now * 10) > 0);
  lampPower.dataset.on = String(power);
  if (GL) {
    const u = { uGas: K.c >= 0 ? 0 : clamp(gas / 150, 0, 1.2), uFlow: K.c >= 0 ? 0 : air && !doorOpen ? 1 : 0, uSpark: K.c >= 0 ? 0 : burst(now - sparkAt, 0.004, 0.08), uBoom: K.c, uIn: safeIntake ? 1 : 0 };
    inner.draw(u, now); outer.draw(u, now);
  }
  const text = K.c >= 0 ? (K.c < 3.2 ? "BOOM · " + ({ nopurge: "powered unpurged", intake: "purged with gas", door: "door open, live", seep: "gas got back in" })[cause] : "resetting…")
    : Math.round(pa) + " Pa · " + vols.toFixed(1) + " vol · " + Math.round(gas) + " % LEL inside · " + (power ? "POWER ON" : "power off") + (interlock ? "" : " · BYPASSED");
  if (readout.textContent !== text) readout.textContent = text;
  if (boomAt === null && !(tripAt !== null && now - tripAt < 4)) {
    if (power && gas < M.lel) say(safeIntake ? "Live. " + Math.round(pa) + " Pa holding the zone out, gas inside down to " + Math.round(gas) + " % LEL. The contactor sparks every time it switches, and there's nothing in there for it to light." : "Live, purged with gas: " + Math.round(gas) + " % LEL inside and climbing back…");
    else if (air && !doorOpen && !purged()) say(safeIntake ? "Purging. Clean air in at the bottom, gas out of the vent at the top. " + vols.toFixed(1) + " of " + M.purgeVols + " volumes, " + Math.round(gas) + " % LEL inside. It doesn't mix perfectly, which is why it takes five." : "Purging, with the intake in Zone 1. It's blowing the zone's own gas through the cabinet. The pressure's fine and the counter's counting, but look at the gas meter.");
    else if (air && purged() && !power) say(safeIntake ? "Purged: " + vols.toFixed(1) + " volumes, " + Math.round(gas) + " % LEL. The PURGED lamp is on and the interlock will allow power." : "The interlock is satisfied: " + vols.toFixed(1) + " volumes at " + Math.round(pa) + " Pa. The gas meter isn't. The interlock can't see that.");
    else if (doorOpen && power) say("Door open, live, interlock bypassed. The pressure's gone and the zone's gas is seeping back in: " + Math.round(gas) + " % LEL…");
    else if (!air && !power) say("Sitting in Zone 1 switched off, the cabinet fills with the zone's gas. Hit PURGE.");
  }
}

// demo: each act is [seconds into the step, action]
const TOUR = [
  { safe: true, lock: true, acts: [[0.5, "air"], [10.2, "power"], [13.5, "door"], [17, "end"]] },
  { safe: true, lock: false, acts: [[1, "power"], [5, "end"]] },
  { safe: false, lock: true, acts: [[0.5, "air"], [10.2, "power"], [15, "end"]] },
  { safe: true, lock: false, acts: [[0.5, "air"], [10.2, "power"], [12.5, "door"], [20, "end"]] },
];
function tick(t) {
  const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
  last = t;
  const sdt = dt * (slow ? 0.12 : 1);
  now += sdt;
  if (touring && !booming()) {
    tourClock += sdt;
    if (tourStep < 0 || actions.length === 0) {
      tourStep = (tourStep + 1) % TOUR.length;
      const s = TOUR[tourStep];
      safeIntake = s.safe; interlock = s.lock; air = false; power = false; doorOpen = false; pa = 0; vols = 0; gas = M.outside; tripAt = null;
      actions = s.acts.map(([w, a]) => [tourClock + w, a]);
    }
    while (actions.length && tourClock >= actions[0][0]) {
      const a = actions.shift()[1];
      if (a === "air") air = true;
      else if (a === "power") tryPower();
      else if (a === "door") doorOpen = true;
      else if (a === "end") actions = [];
    }
  }
  step(sdt);
  draw(); syncUi();
  const idle = !touring && !air && !power && pa < 0.5 && Math.abs(gas - M.outside) < 0.5 && boomAt === null && Math.abs(doorA - (doorOpen ? 1 : 0)) < 0.01 && !(tripAt !== null && now - tripAt < 4);
  frame = visible && !idle ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { touring = false; actions = []; };
const guard = (fn) => (...a) => { takeOver(); if (booming()) return; fn(...a); run(); };
const setIntake = guard((v) => { safeIntake = v; });
const setLock = guard((v) => { interlock = v; });
const toggleAir = guard(() => { air = !air; });
const togglePower = guard(() => tryPower());
const toggleDoor = guard(() => { doorOpen = !doorOpen; });
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;

ui.intake.forEach((b) => b.addEventListener("click", () => setIntake(b.dataset.intakeBtn === "safe")));
ui.lock.forEach((b) => b.addEventListener("click", () => setLock(b.dataset.lock === "on")));
ui.air.addEventListener("click", toggleAir);
ui.power.addEventListener("click", togglePower);
ui.door.addEventListener("click", toggleDoor);
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; tourClock = 0; actions = []; } run(); });
stage.addEventListener("click", () => toggleDoor());
stage.addEventListener("keydown", (ev) => {
  const map = { a: toggleAir, p: togglePower, d: toggleDoor, " ": togglePower, Enter: togglePower, i: () => setIntake(!safeIntake), l: () => setLock(!interlock), s: () => { slow = !slow; run(); } };
  if (map[ev.key]) { ev.preventDefault(); map[ev.key](); }
});
window.__fig = { freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
syncUi(); draw();
`;

const CSS = `.fx-stage{position:relative;cursor:pointer}
.fx-layer{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.fx-gl{display:block}
body[data-theme="dark"] .fx-gl{mix-blend-mode:screen}
.fx-flash{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(closest-side at 50% 42%,#fff8e8 0%,#ffd9a0 40%,rgba(255,170,90,0) 100%)}
.iso-plate{overflow:hidden}
.iso-pipe{fill:none;stroke:var(--anatomy-face,#ddd);stroke-width:2.6;stroke-linejoin:round;stroke-linecap:round}
.iso-pipe-out{fill:none;stroke:var(--anatomy-mid);stroke-width:3.6;stroke-linejoin:round;stroke-linecap:round}
.lamp{stroke:var(--anatomy-mid);stroke-width:.3;fill:var(--anatomy-paper)}
.lamp[data-col="ok"][data-on="true"]{fill:#3ddc84}.lamp[data-col="trip"][data-on="true"]{fill:#ff4a3d}.lamp[data-col="power"][data-on="true"]{fill:#ffc23d}
.ctl{display:grid;gap:12px;margin:14px 0 6px;font-family:var(--anatomy-mono);font-size:12px;color:var(--anatomy-mid)}
.ctl-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ctl-label{min-width:72px;text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:var(--anatomy-lo)}
.ctl button{font:inherit;color:var(--anatomy-mid);background:transparent;border:1px solid var(--anatomy-lo);border-radius:6px;padding:7px 10px;cursor:pointer;line-height:1.15;text-align:left;min-height:36px}
.ctl button:hover{border-color:var(--anatomy-mid)}
.ctl button[aria-pressed="true"]{color:var(--anatomy-lit);border-color:var(--anatomy-lit)}
.ctl #air,.ctl #power{font-weight:600;letter-spacing:.06em;min-width:112px;text-align:center;border-color:var(--anatomy-lit);color:var(--anatomy-lit)}
.ctl #air[aria-pressed="true"],.ctl #power[aria-pressed="true"]{background:var(--anatomy-lit);color:var(--anatomy-paper)}
.ctl #door{border-color:#ff6a3d;color:#ff6a3d}
.ctl output{min-width:86px;text-align:right;color:var(--anatomy-hi,var(--anatomy-mid))}
.meter{position:relative;flex:1;min-width:110px;height:10px;margin-top:14px;border:1px solid var(--anatomy-lo);border-radius:5px}
.meter .fill{position:absolute;left:0;top:0;bottom:0;border-radius:4px;background:var(--anatomy-mid);transition:width .1s}
.meter .fill[data-state="ok"]{background:#3ddc84}.meter .fill[data-state="low"]{background:var(--anatomy-mid)}.meter .fill[data-state="warn"]{background:#ffb347}.meter .fill[data-state="bad"]{background:#ff5a2a}
.mark{position:absolute;top:-14px;bottom:-3px;width:0;border-left:1px dashed var(--anatomy-lit);pointer-events:none}
.mark::after{content:attr(data-label);position:absolute;top:0;left:4px;font-size:10px;white-space:nowrap;color:var(--anatomy-lit)}
.mark.red{border-left-color:#ff6a3d}.mark.red::after{color:#ff6a3d}
#shot{min-height:3.6em;font-size:12px;line-height:1.4}
@media (max-width:520px){.ctl-label{min-width:52px}.ctl button{padding:7px 8px}.ctl output{min-width:64px}}`;

const stageHtml = `<div class="iso-stage fx-stage" tabindex="0" role="group" aria-label="Pressurised cabinet: A purges, P or space powers, D opens the door, I moves the intake, L bypasses the interlock">${backSvg}<canvas class="fx-layer fx-gl fx-inner" aria-hidden="true"></canvas>${frontSvg}<canvas class="fx-layer fx-gl fx-outer" aria-hidden="true"></canvas><div class="fx-flash" aria-hidden="true"></div></div>`;

const CONTROLS = `<div class="ctl" role="group" aria-label="Test controls">
  <div class="ctl-row"><span class="ctl-label">Intake</span><button type="button" data-intake-btn="safe" aria-pressed="true">Safe area</button><button type="button" data-intake-btn="zone" aria-pressed="false">In the zone</button></div>
  <div class="ctl-row"><span class="ctl-label">Interlock</span><button type="button" data-lock="on" aria-pressed="true">Working</button><button type="button" data-lock="off" aria-pressed="false">Bypassed</button></div>
  <div class="ctl-row"><span class="ctl-label">Pressure</span><div class="meter"><span id="p-fill" class="fill"></span><span class="mark" style="left:${(50 / 150 * 100).toFixed(1)}%" data-label="50 Pa"></span></div><output id="p-out">0 Pa</output></div>
  <div class="ctl-row"><span class="ctl-label">Purged</span><div class="meter"><span id="v-fill" class="fill"></span><span class="mark" style="left:${(5 / 8 * 100).toFixed(1)}%" data-label="5 volumes"></span></div><output id="v-out">0.0 vol</output></div>
  <div class="ctl-row"><span class="ctl-label">Gas inside</span><div class="meter"><span id="g-fill" class="fill"></span><span class="mark red" style="left:50%" data-label="LEL"></span></div><output id="g-out">150 % LEL</output></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="air" aria-pressed="false">PURGE</button><button type="button" id="power" aria-pressed="false">POWER ON</button><button type="button" id="door" aria-pressed="false">Open door</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
  <div id="shot" aria-live="polite">Sitting in Zone 1 switched off, the cabinet fills with the zone's gas. Hit PURGE, wait for five volumes, then POWER ON.</div>
</div>`;

const card = k.plateHtml({
  fig: "Fig 8",
  title: "Ex p, purge and pressure",
  hint: "Tap: open the door",
  readout: "",
  keys: [
    { mark: "lit", label: "Purge air, the contactor spark, the gauge needle" },
    { mark: "raised", label: "Pressurised cabinet (cut open), purge controller, intake and vent" },
  ],
  caption: "Ex p lets you put ordinary sparking kit in Zone 1 by keeping the gas out with clean air. First the cabinet is purged: at least five of its own volumes of air, because it never mixes perfectly. Then it's held above the zone at 50 Pa or more, so anything that leaks, leaks out. For px, losing the pressure cuts the power, and it stays off until it's purged again. It fails when someone powers it before the purge, bypasses the interlock and opens the door live, or takes the purge air from inside the zone. That last one fools the interlock completely: it can count volumes and read pressure, but it can't smell the air.",
  body: stageHtml,
});

const other = theme === "light" ? ["index.html", "Dark version"] : ["light.html", "Light version"];
const FOOT = `<p style="font-family:var(--anatomy-mono);font-size:11px;color:var(--anatomy-lo);margin:28px 0 8px;line-height:1.6">A toy, not a certified anything. Real (IEC 60079-2, px): at least 50 Pa overpressure, a pre-purge of at least five enclosure volumes, power off on loss of pressure until a fresh purge, purge air from the safe area. Made up: the gas levels, how well it mixes, flows and timings.<br>Built with <a href="https://github.com/wheresryan22/anatomy" style="color:inherit">Anatomy</a> by Ryan (MIT). · <a href="${other[0]}" style="color:inherit">${other[1]}</a> · <a href="../" style="color:inherit">More figures</a> · <a href="https://github.com/Dizzyfer/Anatomy/tree/main/ex-p-purge" style="color:inherit">Source</a></p>`;
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "Ex p purge", theme, body: `<style>${CSS}</style>${card.replace("<figcaption", CONTROLS + "<figcaption")}${FOOT}`, script: kitScript() + glScript() + LIVE.replace("__DATA__", JSON.stringify(DATA)), width: 700 }));
console.log("wrote", name);
