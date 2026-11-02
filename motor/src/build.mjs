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

// Truth: WEG W22 IE3, 7.5 kW 4-pole 132M, 400 V 50 Hz: 14.2 A, 1460 rpm, Il/In 8.3, Tl/Tn 2.4, Tb/Tn 3.5,
// class F (155 °C), 80 K rise, locked rotor time 12 s cold / 7 s hot, J 0.0563 kg·m². Class 10 overload: trips at 7.2 × Ie in 4 to 10 s.
// Star: a third of the current and a third of the torque. Toy: the circuit is fitted to those ratios; the load, its inertia,
// the timers, the drive, the supply dip, the thermal model and the burnout temperature are made up.
const MODEL = {
  ckt: { r1: 0.07457, x: 0.042, xm: 2.9428, r2a: 0.02953, r2b: 0.00524 },
  In: 0.88166, Tn: 0.75077, amps: 14.2, rpm: 1500, tnNm: 49, jMotor: 0.0563,
  load: { fan: { j: 1.4, t0: 0.05, t2: 0.92 }, conv: { j: 0.8, t0: 0.95, t2: 0 }, jam: { j: 0, t0: 99, t2: 0 } },
  sdTimer: 3, sdGap: 0.06, vfdRamp: 5, vfdLimit: 1.5, vfdStall: 3, zs: 0.012,
  amb: 40, kHeat: 0.139, tauW: 575, classF: 155, burn: 200, tauOl: 330, olTrip: 1.44,
};

const MC = [24, 8];
const RO = 34, RF = 31, RB = 21.5, RR = 20;
const Z0 = 6, ZC = 56, ZW = 62, ZR0 = 8, ZR1 = 58, ZFAN = 100;
const PANEL = { x: -110, y: -64, w: 16, d: 46 };
const PZ = 66;
const BULB = [-100, 44];
const TBOX = { x: MC[0] + 31, y: MC[1] - 21, w: 8, d: 11 };
const PLATE = { x: -122, y: -78, w: 200, d: 150, r: 8 };
const PLATE_H = 12, FOOT_H = 5;

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [MC[0] - 36, MC[1] - 36, ZFAN + 4], [PANEL.x, PANEL.y, PZ + 4]],
  W, H, { pad: 20, azimuth: 45 },
);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const Dt = (points, style) => k.dotsSvg(points, style);
const depth2 = ([x, y]) => k.depthOf([x, y, 0], P);
const byDepth = (pts) => [...pts].sort((a, b) => depth2(a) - depth2(b));
const slab = (plan, z, h, r = 1.2, bevel = 0.5) => k.slabOf({ r, ...plan }, z, h, P, 4, bevel);
const rad = (d) => (d * Math.PI) / 180;
const pol = (r, a) => [MC[0] + r * Math.cos(rad(a)), MC[1] + r * Math.sin(rad(a))];
function sector(r0, r1, a0, a1, n = 24) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push(pol(r1, a0 + ((a1 - a0) * i) / n));
  for (let i = n; i >= 0; i--) out.push(pol(r0, a0 + ((a1 - a0) * i) / n));
  return out;
}
const solidSector = (r0, r1, a0, a1, z, h, n) => k.extrude(sector(r0, r1, a0, a1, n), z, h, P, { convex: false });
const face = (pts, cls) => `<path class="${cls}" d="${k.pathOf(pts.map(at), true)}"/>`;

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

function panel() {
  const out = [];
  out.push(`<path class="iso-halo" d="${k.haloOf({ ...k.insetPlan({ ...PANEL, r: 1 }, -3) }, 0, 0.1, P)}"/>`);
  out.push(S(slab(PANEL, 0, PZ, 1, 0.5), { tone: "hi", inner: L(k.segment([PANEL.x + PANEL.w, PANEL.y + 3, PZ - 4], [PANEL.x + PANEL.w, PANEL.y + PANEL.d - 3, PZ - 4], P), { tone: "faint" }) }));
  const m = k.sideMatrix([PANEL.x + PANEL.w + 0.02, PANEL.y + PANEL.d], PZ - 6, P, "right");
  const lampAt = (x, lab, part) => `<circle data-part="${part}" class="lamp" data-on="false" cx="${x}" cy="17" r="2.4"/><text class="iso-face-text" data-tone="lo" x="${x}" y="23" font-size="2" text-anchor="middle">${lab}</text>`;
  out.push(`<g transform="${m}">
    <text class="iso-face-text" data-tone="lo" x="3" y="5" font-size="2.6">STARTER</text>
    <text data-part="p-mode" class="iso-face-text" data-tone="hi" x="3" y="10.4" font-size="4">DOL</text>
    <g data-part="p-cont">${lampAt(8, "MAIN", "k1")}${lampAt(20, "STAR", "k2")}${lampAt(32, "DELTA", "k3")}</g>
    <g data-part="p-vfd"><rect x="5" y="13" width="30" height="10" rx="1" class="vfd-scr"/><text data-part="vfd-hz" class="iso-face-text vfd-t" x="20" y="20" font-size="4.6" text-anchor="middle">0.0 Hz</text></g>
    ${lampAt(8, "RUN", "run").replace(/cy="17"/, 'cy="31"').replace(/y="23"/, 'y="37"')}
    ${lampAt(20, "O/L", "ol").replace(/cy="17"/, 'cy="31"').replace(/y="23"/, 'y="37"')}
    <text data-part="p-amps" class="iso-face-text" data-tone="mid" x="27" y="33" font-size="3">0 A</text>
  </g>`);
  return out.join("");
}

function bulb() {
  const [x, y] = BULB, out = [];
  out.push(S(k.cylinder(x, y, 5, 0, 2, P, 24, 0.4), { tone: "mid" }));
  out.push(S(k.cylinder(x, y, 1, 2, 44, P, 12), { tone: "mid" }));
  out.push(S(k.cylinder(x, y, 2.6, 46, 2.4, P, 16, 0.4), { tone: "mid" }));
  out.push(`<g class="bulb">${S(k.cylinder(x, y, 4, 48.4, 7, P, 24, 3), { tone: "hi" })}</g>`);
  return out.join("");
}

function cable() {
  const pts = [[PANEL.x + PANEL.w, -40, 3], [-40, -40, 2.5], [TBOX.x + 4, -40, 2.5], [TBOX.x + 4, TBOX.y + 3, 2.5], [TBOX.x + 4, TBOX.y + 3, 30]];
  const d = k.pathOf(pts.map(at));
  return `<path class="iso-pipe-out" d="${d}"/><path class="iso-pipe" d="${d}"/>`;
}

const finAngles = [];
for (let a = 97.5; a < 360; a += 15) finAngles.push(a);
const isBack = (a) => a > 135 && a < 315;
function fin(a) {
  const c = Math.cos(rad(a)), s = Math.sin(rad(a)), t = 0.7;
  const ring = [[RO - 0.3, -t], [RO + 3.4, -t], [RO + 3.4, t], [RO - 0.3, t]].map(([r, w]) => [MC[0] + r * c - w * s, MC[1] + r * s + w * c]);
  return S(k.extrude(ring, Z0 + 3, ZC - Z0 - 6, P), { tone: "mid" });
}

// the end windings sit on top of the stator core, 12 coil groups of 30° (4 poles); the overlays show the field
const SEG = [];
for (let i = 0; i < 12; i++) { const a0 = i * 30, a1 = a0 + 30; if (a1 <= 90) continue; SEG.push({ i, a0, a1, back: (a0 + a1) / 2 > 135 && (a0 + a1) / 2 < 315 }); }
function winding(s) {
  return `<g class="cu wind">${S(solidSector(23, 30, s.a0 + 1, s.a1 - 1, ZC, ZW - ZC, 8), { tone: "hi" })}</g><path data-seg="${s.i}" class="pole" d="${k.onTop(sector(23, 30, s.a0 + 1, s.a1 - 1, 8), ZW, P, true)}"/>`;
}

function motorBack() {
  const out = [];
  out.push(`<path class="iso-halo" d="${k.haloOf({ x: MC[0] - 40, y: MC[1] - 40, w: 80, d: 80, r: 30 }, 0, 0.1, P)}"/>`);
  out.push(S(slab({ x: MC[0] - 30, y: MC[1] - 30, w: 60, d: 60 }, 0, Z0, 4, 0.6), { tone: "mid" }));
  for (const a of finAngles.filter(isBack)) out.push(fin(a));
  out.push(S(solidSector(RB, RO, 135, 315, Z0, ZC - Z0, 36), { tone: "mid" }));
  for (const s of SEG.filter((s) => s.back)) out.push(winding(s));
  return out.join("");
}

function rotor() {
  const out = [];
  out.push(`<g class="rotor">${S(k.cylinder(MC[0], MC[1], RR, ZR0, ZR1 - ZR0 - 2, P, 48), { tone: "hi" })}</g>`);
  out.push(`<g class="cu ring">${S(k.cylinder(MC[0], MC[1], RR, ZR1 - 2, 2, P, 48), { tone: "hi" })}</g>`);
  out.push(`<path data-part="bars" class="bars" d=""/><path data-part="rfins" class="rfins" d=""/>`);
  return out.join("");
}

function motorFront() {
  const out = [];
  out.push(S(solidSector(RB, RO, 90, 135, Z0, ZC - Z0, 10), { tone: "mid" }));
  out.push(S(solidSector(RB, RO, 315, 360, Z0, ZC - Z0, 10), { tone: "mid" }));
  // the cut faces: laminated core, frame, and a slot full of copper
  for (const a of [90, 0]) {
    const p = (r, z) => { const [x, y] = pol(r, a); return [x, y, z]; };
    out.push(face([p(23, Z0 + 3), p(27, Z0 + 3), p(27, ZC - 3), p(23, ZC - 3)], "slot"));
    const lam = [];
    for (let z = Z0 + 3; z < ZC; z += 3) lam.push(k.segment(p(27.4, z), p(RF, z), P));
    out.push(L(lam.join(""), { tone: "faint" }));
    out.push(L(k.segment(p(RF, Z0), p(RF, ZC), P), { tone: "lo" }));
  }
  for (const a of finAngles.filter((a) => !isBack(a))) out.push(fin(a));
  for (const s of SEG.filter((s) => !s.back)) out.push(winding(s));
  // terminal box
  out.push(S(slab(TBOX, 30, 14, 1, 0.4), { tone: "hi" }));
  // shaft and the fan it drives
  out.push(S(k.cylinder(MC[0], MC[1], 3.6, ZR1, ZFAN - ZR1, P, 20), { tone: "hi" }));
  out.push(`<g data-part="jam" class="jam">${S(k.extrude([[MC[0] + 6, MC[1] + 40], [MC[0] + 9, MC[1] + 37], [MC[0] + 30, MC[1] + 2], [MC[0] + 27, MC[1] + 5]], ZFAN - 4, 2.6, P), { tone: "hi" })}</g>`);
  out.push(`<g data-part="fan"></g>`);
  out.push(S(k.cylinder(MC[0], MC[1], 6.5, ZFAN - 1, 4, P, 24, 1), { tone: "hi" }));
  return out.join("");
}

const svg = k.figureSvg({
  width: W, height: H,
  label: "A 7.5 kilowatt induction motor standing on its end with a fan on the shaft, cut open to show the stator core, the copper windings and the squirrel cage rotor. A starter panel and a light on the same supply stand behind it, with the cable running to the motor's terminal box.",
  body: [plate(), panel(), bulb(), cable(), motorBack(), rotor(), motorFront()],
});

const DATA = { W, H, camera: glCamera(P), P, MODEL, MC, RR, ZR1, ZFAN, BULB };

const FRAG = `
uniform float uLight;
uniform float uBulb;
uniform float uHot;
uniform float uSmoke;
uniform float uPop;
vec4 inkFor(vec3 seen,float cover){vec3 ab=1.-seen;float a=max(max(ab.r,max(ab.g,ab.b)),cover);return vec4(vec3(a)-ab,a);}
vec4 over(vec4 t,vec4 u){return t+u*(1.-t.a);}
vec4 glowInk(vec3 hue,float e){vec3 c=tonemap(hue*e,1.3);float a=max(c.r,max(c.g,c.b));float la=1.-exp(-1.4*e);return mix(vec4(c,a),inkFor(mix(vec3(1.),hue*.8,la),0.)*la,uLight);}
vec4 smokeInk(float h){float a=(1.-exp(-h))*mix(.55,.45,uLight);return vec4(mix(vec3(.34,.32,.3),vec3(.25,.23,.21),uLight)*a,a);}
void main(){
  vec2 vb=viewOf(gl_FragCoord.xy);
  vec4 o=vec4(0.);
  vec2 db=(vb-project(vec3(${BULB[0].toFixed(1)},${BULB[1].toFixed(1)},52.)))/uK;
  float b=exp(-pow(length(db)/4.,2.))*1.4+exp(-pow(length(db)/16.,2.))*.5;
  o=glowInk(vec3(1.,.82,.5),b*uBulb);
  if(uHot>.002){
    float h=0.;
    for(int i=0;i<3;i++){
      vec3 p=onFloor(vb,${ZC.toFixed(1)}+float(i)*3.);
      float r=length(p.xy-vec2(${MC.map((v) => v.toFixed(1)).join(",")}));
      h+=exp(-pow((r-26.5)/5.,2.))*.5;
    }
    o=over(glowInk(vec3(1.,.28,.06),h*uHot*(.8+.2*noise2(vec2(uTime*3.,1.)))),o);
  }
  if(uSmoke>.002){
    float s=0.;
    for(int i=0;i<6;i++){
      float z=${ZW.toFixed(1)}+float(i)*9.;
      vec3 p=onFloor(vb,z);
      vec2 c=vec2(${MC.map((v) => v.toFixed(1)).join(",")})+vec2(sin(z*.07+uTime)*3.,cos(z*.05)*2.+(z-60.)*.25);
      float w=exp(-pow(length(p.xy-c)/(14.+(z-60.)*.35),2.));
      s+=w*smoothstep(.3,.8,fbm2(p.xy*.05+vec2(0.,-uTime*.5)+z*.02))*.55;
    }
    o=over(smokeInk(s*uSmoke),o);
  }
  if(uPop>.002){
    vec2 dv=(vb-project(vec3(${(MC[0] + 18).toFixed(1)},${(MC[1] + 18).toFixed(1)},${(ZC + 2).toFixed(1)})))/uK;
    float e=exp(-pow(length(dv)/2.,2.))*2.4+exp(-pow(length(dv)/12.,2.))*.8;
    o=over(glowInk(vec3(.62,.78,1.),e*uPop),o);
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
const gl = glLayer({ canvas: stage.querySelector(".fx-gl"), fragment: ${JSON.stringify(FRAG)}, view: [D.W, D.H], camera: D.camera, uniforms: ["uBulb", "uHot", "uSmoke", "uPop"], fixed: { uLight: LIGHT } });
if (gl) stage.setAttribute("data-gl", "");

// the equivalent circuit, per unit; a = supply frequency (pu of 50 Hz), V = phase voltage (pu)
const ck = M.ckt;
function motorAt(s, V, a) {
  if (V <= 0 || a <= 0) return { I: 0, T: 0 };
  s = Math.max(s, 1e-4);
  const R2 = ck.r2a + ck.r2b * Math.sqrt(Math.min(1, s * a));
  const zr = [R2 / s, ck.x * a], zm = [0, ck.xm * a];
  const num = [zr[0] * zm[0] - zr[1] * zm[1], zr[0] * zm[1] + zr[1] * zm[0]], den = [zr[0] + zm[0], zr[1] + zm[1]];
  const dd = den[0] * den[0] + den[1] * den[1];
  const zp = [(num[0] * den[0] + num[1] * den[1]) / dd, (num[1] * den[0] - num[0] * den[1]) / dd];
  const z = [ck.r1 + zp[0], ck.x * a + zp[1]];
  const I = V / Math.hypot(z[0], z[1]);
  const vp = I * Math.hypot(zp[0], zp[1]), i2 = vp / Math.hypot(zr[0], zr[1]);
  return { I: I / M.In, T: (i2 * i2 * R2 / s / a) / M.Tn };
}

let starter = "dol", loadKind = "fan", olOn = true;
let Iwind = 0, on = false, w = 0, tOn = 0, phase = "off", hz = 0, vfdStallT = 0, Iline = 0, Tm = 0, Tl = 0, vt = 1, temp = M.amb, olTh = 0, tripped = "", dead = false, deadAt = -10;
let thF = 0, thR = 0, thE = 0;
let frame = 0, last = 0, now = 0, visible = false, touring = true, slow = false, tourClock = 0, tourStep = -1, actions = [], lastShot = "";
const hist = [];
const VIS = 1 / 40;

const fanG = q("fan"), bars = q("bars"), rfins = q("rfins"), jam = q("jam"), segs = [...stage.querySelectorAll("[data-seg]")];
const lamps = { k1: q("k1"), k2: q("k2"), k3: q("k3"), run: q("run"), ol: q("ol") };
const pMode = q("p-mode"), pCont = q("p-cont"), pVfd = q("p-vfd"), vfdHz = q("vfd-hz"), pAmps = q("p-amps"), bulbG = stage.querySelector(".bulb");
const ui = {
  st: [...document.querySelectorAll("[data-st]")], ld: [...document.querySelectorAll("[data-ld]")], ol: [...document.querySelectorAll("[data-olb]")],
  tFill: document.querySelector("#t-fill"), tOut: document.querySelector("#t-out"),
  vFill: document.querySelector("#v-fill"), vOut: document.querySelector("#v-out"),
  stats: document.querySelector("#stats"), go: document.querySelector("#go"), fresh: document.querySelector("#fresh"),
  slow: document.querySelector("#slow"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"), scope: document.querySelector("#scope"),
};
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };
const L = () => M.load[loadKind];
const loadT = (w) => loadKind === "jam" ? 0 : L().t0 * (w > 0.002 ? 1 : 1.05) + L().t2 * w * w;
const NAMES = { dol: "Direct on line", sd: "Star-delta", vfd: "VFD" };

function start() {
  if (dead) { say("It's burnt out. Nothing's starting that until it's been rewound."); return; }
  if (olOn && tripped === "ol" && olTh > 1.1) { say("The overload hasn't cooled enough to reset yet. Give it a moment."); return; }
  tripped = ""; on = true; tOn = 0; hz = 0; vfdStallT = 0;
  phase = starter === "sd" ? "star" : starter === "vfd" ? "ramp" : "run";
}
function stop(why) { on = false; phase = "off"; hz = 0; if (why) tripped = why; }

function step(dt) {
  if (on) tOn += dt;
  // what the starter is feeding the motor
  let V = 0, a = 1, lineK = 1;
  if (on) {
    if (starter === "dol") { V = vt; }
    else if (starter === "sd") {
      if (phase === "star" && tOn >= M.sdTimer) phase = "gap";
      if (phase === "gap" && tOn >= M.sdTimer + M.sdGap) phase = "delta";
      if (phase === "star") { V = vt / Math.sqrt(3); lineK = Math.sqrt(3); }
      else if (phase === "delta") V = vt;
    } else {
      const lim = Iline > M.vfdLimit;
      if (phase === "ramp") { if (!lim) hz = Math.min(1, hz + dt / M.vfdRamp); if (hz >= 1) phase = "run"; }
      a = Math.max(0.02, hz); V = Math.min(1, 0.03 + 0.97 * a);
      if (lim && w < 0.05 && hz < 0.2) vfdStallT += dt; else vfdStallT = Math.max(0, vfdStallT - dt);
    }
  }
  const sync = starter === "vfd" ? Math.max(0.02, hz) : 1;
  const r = on && V > 0 ? motorAt((sync - w) / sync, V, starter === "vfd" ? a : 1) : { I: 0, T: 0 };
  // star: each winding sees V/√3, so its current is 1/√3 of DOL, and the line no longer carries √3 windings' worth: a third
  Iline = phase === "star" ? r.I / lineK : r.I;
  Iwind = r.I;
  Tm = r.T; Tl = loadT(w);
  const J = M.jMotor + L().j;
  if (loadKind === "jam") w = 0;
  else {
    let net = Tm - Tl;
    if (w <= 0 && net < 0) net = 0;
    w = Math.max(0, w + (net * M.tnNm / (J * 2 * Math.PI * M.rpm / 60)) * dt);
  }
  // supply: the light on the same board dips with the current drawn
  const Isup = starter === "vfd" ? Math.max(0.04, Tm * w * 1.15) : Iline;
  vt = 1 - M.zs * Isup;
  // winding temperature and the overload relay (both see the winding/line current)
  const Iw = Iwind;
  temp += (M.kHeat * Iw * Iw - (temp - M.amb) / M.tauW) * dt;
  olTh += (Iw * Iw - olTh) / M.tauOl * dt;
  if (on && olOn && starter !== "vfd" && olTh > M.olTrip) { stop("ol"); }
  if (on && starter === "vfd" && vfdStallT > M.vfdStall) stop("vfd");
  if (!dead && temp > M.burn) { dead = true; deadAt = now; stop("burn"); }
  // what spins, slowed down 40×
  thF += 2 * Math.PI * (on && V > 0 ? sync : 0) * (M.rpm / 60) * VIS * dt;
  thR += 2 * Math.PI * w * (M.rpm / 60) * VIS * dt;
  thE = 2 * thF;
}

const rotPts = (r, z, a) => iso([D.MC[0] + r * Math.cos(a), D.MC[1] + r * Math.sin(a), z], P);
const pt = (p) => p[0].toFixed(1) + " " + p[1].toFixed(1);
function drawSpin() {
  // rotor bars on the side facing us, and the end ring fins on top
  let d = "";
  for (let j = 0; j < 18; j++) {
    const a = thR + (j / 18) * Math.PI * 2;
    if (Math.cos(a - Math.PI / 4) < 0.1) continue;
    d += "M" + pt(rotPts(D.RR, 10, a + 0.12)) + "L" + pt(rotPts(D.RR, D.ZR1 - 3, a));
  }
  bars.setAttribute("d", d);
  let f = "";
  for (let j = 0; j < 8; j++) { const a = thR + (j / 8) * Math.PI * 2; f += "M" + pt(rotPts(8, D.ZR1, a)) + "L" + pt(rotPts(D.RR - 1.5, D.ZR1, a)); }
  rfins.setAttribute("d", f);
  // fan blades
  let b = "";
  for (let j = 0; j < 3; j++) {
    const a = thR + (j / 3) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    const shape = [[6, -3], [24, -6], [35, -3.5], [36.5, 1], [34, 5], [6, 3]];
    const pts = (z) => shape.map(([r, w]) => iso([D.MC[0] + r * c - w * s, D.MC[1] + r * s + w * c, z], P));
    const top = pts(D.ZFAN + 1.2), bot = pts(D.ZFAN);
    b += '<path class="blade-e" d="M' + bot.map(pt).join("L") + 'Z"/><path class="blade" d="M' + top.map(pt).join("L") + 'Z"/>';
  }
  fanG.innerHTML = b;
  // the field: N and S poles chasing round the windings
  const mag = clamp(Iline / 2.5, 0, 1) * (on ? 1 : 0);
  for (const el of segs) {
    const i = +el.dataset.seg, ph = Math.cos(2 * ((i * 30 + 15) * Math.PI / 180) - thE);
    el.dataset.n = ph > 0 ? "n" : "s";
    el.style.opacity = (Math.abs(ph) * (0.25 + 0.75 * mag) * (on ? 1 : 0)).toFixed(2);
  }
}

function drawScope() {
  const cv = ui.scope, ctx = cv.getContext("2d"), wpx = cv.clientWidth, hpx = cv.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== Math.round(wpx * dpr)) { cv.width = Math.round(wpx * dpr); cv.height = Math.round(hpx * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, wpx, hpx);
  const cs = getComputedStyle(document.body), lit = cs.getPropertyValue("--anatomy-lit").trim() || "#fff", lo = cs.getPropertyValue("--anatomy-lo").trim() || "#888", mid = cs.getPropertyValue("--anatomy-mid").trim() || "#aaa";
  const span = 10, pad = 4, top = 10, bot = hpx - 14, yI = (i) => bot - (clamp(i, 0, 10) / 10) * (bot - top);
  ctx.font = "10px " + (cs.getPropertyValue("--anatomy-mono") || "monospace"); ctx.lineWidth = 1;
  ctx.strokeStyle = lo; ctx.setLineDash([3, 3]);
  for (const [v, lab, col] of [[1, "1× In", lo], [8.3, "8.3× locked rotor", "#ff6a3d"]]) { ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(pad, yI(v)); ctx.lineTo(wpx - pad, yI(v)); ctx.stroke(); ctx.fillStyle = col; ctx.fillText(lab, pad + 2, yI(v) - 3); }
  ctx.setLineDash([]);
  const t0 = now - span, X = (t) => pad + ((t - t0) / span) * (wpx - pad * 2);
  ctx.strokeStyle = mid; ctx.lineWidth = 1.2; ctx.beginPath();
  hist.forEach((h, i) => { const y = bot - h.w * (bot - top) * 0.9; i ? ctx.lineTo(X(h.t), y) : ctx.moveTo(X(h.t), y); }); ctx.stroke();
  ctx.strokeStyle = lit; ctx.lineWidth = 1.8; ctx.beginPath();
  hist.forEach((h, i) => { i ? ctx.lineTo(X(h.t), yI(h.i)) : ctx.moveTo(X(h.t), yI(h.i)); }); ctx.stroke();
  ctx.fillStyle = lit; ctx.fillText("current", wpx - 112, hpx - 3); ctx.fillStyle = mid; ctx.fillText("speed", wpx - 52, hpx - 3);
}

function draw() {
  drawSpin();
  jam.style.display = loadKind === "jam" ? "" : "none";
  const cook = clamp((temp - 120) / (M.burn - 120), 0, 1);
  stage.style.setProperty("--cook", (dead ? 1 : cook).toFixed(3));
  bulbG.style.setProperty("--b", clamp((vt - 0.85) / 0.15, 0, 1).toFixed(3));
  pMode.textContent = starter === "dol" ? "DOL" : starter === "sd" ? "STAR-DELTA" : "VFD";
  pCont.style.display = starter === "vfd" ? "none" : ""; pVfd.style.display = starter === "vfd" ? "" : "none";
  lamps.k1.dataset.on = String(on && starter !== "vfd" && phase !== "off");
  lamps.k2.dataset.on = String(on && phase === "star");
  lamps.k3.dataset.on = String(on && phase === "delta");
  lamps.k2.style.display = lamps.k3.style.display = starter === "sd" ? "" : "none";
  lamps.k2.nextElementSibling.style.display = lamps.k3.nextElementSibling.style.display = starter === "sd" ? "" : "none";
  lamps.run.dataset.on = String(on); lamps.ol.dataset.on = String(tripped === "ol" || tripped === "vfd");
  vfdHz.textContent = (tripped === "vfd" ? "STALL" : (on ? hz * 50 : 0).toFixed(1) + " Hz");
  pAmps.textContent = Math.round(Iline * M.amps) + " A";
  if (gl) gl.draw({ uBulb: clamp((vt - 0.82) / 0.18, 0, 1) * 0.9, uHot: clamp((temp - 110) / 70, 0, 1), uSmoke: dead ? Math.exp(-(now - deadAt) / 9) * 1.2 + 0.25 : clamp((temp - 160) / 40, 0, 1), uPop: Math.exp(-(now - deadAt) / 0.12) * (now - deadAt < 1 ? 1 : 0) }, now);
  const rpm = Math.round(w * M.rpm), slip = on && w > 0.01 ? (((starter === "vfd" ? hz : 1) - w) / (starter === "vfd" ? Math.max(hz, 0.02) : 1)) * 100 : 0;
  const text = dead ? "BURNT OUT · " + Math.round(temp) + " °C" : rpm + " rpm · " + Math.round(Iline * M.amps) + " A · " + Math.round(temp) + " °C windings" + (on ? "" : " · stopped");
  if (readout.textContent !== text) readout.textContent = text;
}

function syncUi() {
  ui.st.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.st === starter)));
  ui.ld.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.ld === loadKind)));
  ui.ol.forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.olb === "on") === olOn)));
  ui.tFill.style.width = (clamp((temp - 20) / (220 - 20), 0, 1) * 100).toFixed(1) + "%";
  ui.tFill.dataset.state = temp > M.classF ? "bad" : temp > 120 ? "warn" : "ok";
  ui.tOut.textContent = Math.round(temp) + " °C";
  ui.vFill.style.width = (clamp((vt - 0.8) / 0.2, 0, 1) * 100).toFixed(1) + "%";
  ui.vFill.dataset.state = vt < 0.9 ? "bad" : vt < 0.95 ? "warn" : "ok";
  ui.vOut.textContent = Math.round(vt * 415) + " V";
  const sync = starter === "vfd" ? hz : on ? 1 : 0;
  ui.stats.innerHTML = "<b>" + Math.round(w * M.rpm) + "</b> rpm of <b>" + Math.round(sync * M.rpm) + "</b> · <b>" + (Iline).toFixed(1) + "×</b> In (" + Math.round(Iline * M.amps) + " A) · motor torque <b>" + Tm.toFixed(2) + "</b> vs load <b>" + (loadKind === "jam" ? "jammed" : Tl.toFixed(2)) + "</b> × Tn";
  ui.go.textContent = on ? "STOP" : "START"; ui.go.setAttribute("aria-pressed", String(on));
  ui.fresh.style.display = dead ? "" : "none";
  ui.slow.setAttribute("aria-pressed", String(slow));
  ui.tour.setAttribute("aria-pressed", String(touring));
}

function story() {
  if (dead) return say("Burnt out. With the overload bypassed nothing stopped it: the windings went past 155 °C (class F), the insulation cooked, then a phase shorted to the frame and the breaker finally went. It needs rewinding.");
  if (tripped === "ol") return say("The overload tripped at " + Math.round(temp) + " °C. Class 10: at 7.2 × its setting it has to go in 4 to 10 s, and this motor can only stand a locked rotor for about 12 s from cold. That's the race it's there to win.");
  if (tripped === "vfd") return say("The drive held the current at 1.5 × In, saw the shaft not turning and tripped on stall. The motor barely got warm.");
  if (!on) return say(w > 0.02 ? "Coasting down." : "Stopped. Pick a starter and a load and hit START.");
  if (loadKind === "jam" && starter !== "vfd") return say("Locked rotor: " + Iline.toFixed(1) + " × In and it isn't turning, so every bit of that is heat. Windings at " + Math.round(temp) + " °C." + (olOn ? " The overload is counting." : " The overload's bypassed. Nothing is counting."));
  if (phase === "star") return say(w < 0.03 && Tm < Tl ? "Star: a third of the current, but a third of the torque too: " + Tm.toFixed(2) + " × Tn against a load needing " + Tl.toFixed(2) + ". It's not going anywhere, and the timer doesn't know." : "Star: each winding gets 240 V instead of 415, so a third of the current and a third of the torque. " + Iline.toFixed(1) + " × In, coming up to speed.");
  if (phase === "gap") return say("Open transition: star contactor out, delta not in yet.");
  if (phase === "delta" && tOn < M.sdTimer + 1.6 && Iline > 2) return say("Delta: full voltage on each winding. " + (w < 0.3 ? "It hadn't got going in star, so this is the full locked rotor current anyway: " : "A second kick: ") + Iline.toFixed(1) + " × In.");
  if (starter === "vfd" && phase === "ramp") return say("The drive ramps the frequency, " + (hz * 50).toFixed(1) + " Hz, with the voltage in step. The field only ever runs a little ahead of the rotor, so the current stays near " + Iline.toFixed(1) + " × In.");
  if (starter === "dol" && Iline > 2) return say("Direct on line: full 415 V from standstill. " + Iline.toFixed(1) + " × In while the field whips round and the rotor catches up. Watch the light dip.");
  return say("Running. The rotor turns " + (100 * (1 - w / (starter === "vfd" ? Math.max(hz, 0.02) : 1))).toFixed(1) + " % slower than the field: that slip is what makes the rotor current and the torque.");
}

const TOUR = [
  { st: "dol", ld: "fan", ol: true, acts: [[0.6, "go"], [5, "stop"], [7.5, "end"]] },
  { st: "sd", ld: "fan", ol: true, acts: [[0.6, "go"], [7.5, "stop"], [10, "end"]] },
  { st: "vfd", ld: "fan", ol: true, acts: [[0.6, "go"], [8.5, "stop"], [11, "end"]] },
  { st: "sd", ld: "conv", ol: true, acts: [[0.6, "go"], [8, "stop"], [10.5, "end"]] },
  { st: "dol", ld: "jam", ol: true, acts: [[0.6, "go"], [13, "end"]] },
  { st: "dol", ld: "jam", ol: false, acts: [[0.6, "go"], [21, "fresh"], [22, "end"]] },
];
function cool() { temp = M.amb + 25; olTh = 0; tripped = ""; }
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
      starter = s.st; loadKind = s.ld; olOn = s.ol; stop(); w = 0; cool(); dead = false; hist.length = 0;
      actions = s.acts.map(([wt, a]) => [tourClock + wt, a]);
    }
    while (actions.length && tourClock >= actions[0][0]) {
      const a = actions.shift()[1];
      if (a === "go") start(); else if (a === "stop") stop(); else if (a === "fresh") { dead = false; cool(); } else if (a === "end") actions = [];
    }
  }
  const n = 20;
  for (let i = 0; i < n; i++) step(sdt / n);
  hist.push({ t: now, i: Iline, w }); while (hist.length && hist[0].t < now - 10.5) hist.shift();
  draw(); syncUi(); drawScope(); story();
  const idle = !touring && !on && w < 0.001 && Math.abs(temp - M.amb) < 0.5 && !dead && hist.every((h) => h.i < 0.001);
  frame = visible && !idle ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { touring = false; actions = []; };
const guard = (fn) => (...a) => { takeOver(); fn(...a); run(); };
const setSt = guard((v) => { if (on) stop(); starter = v; });
const setLd = guard((v) => { loadKind = v; if (v === "jam") w = 0; });
const setOl = guard((v) => { olOn = v; });
const toggle = guard(() => (on ? stop() : start()));
const fresh = guard(() => { dead = false; temp = M.amb; olTh = 0; tripped = ""; });
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;

ui.st.forEach((b) => b.addEventListener("click", () => setSt(b.dataset.st)));
ui.ld.forEach((b) => b.addEventListener("click", () => setLd(b.dataset.ld)));
ui.ol.forEach((b) => b.addEventListener("click", () => setOl(b.dataset.olb === "on")));
ui.go.addEventListener("click", toggle);
ui.fresh.addEventListener("click", fresh);
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; tourClock = 0; actions = []; } run(); });
stage.addEventListener("click", toggle);
stage.addEventListener("keydown", (ev) => {
  const map = { " ": toggle, Enter: toggle, "1": () => setSt("dol"), "2": () => setSt("sd"), "3": () => setSt("vfd"), f: () => setLd("fan"), c: () => setLd("conv"), j: () => setLd("jam"), o: () => setOl(!olOn), r: fresh, s: () => { slow = !slow; run(); } };
  if (map[ev.key]) { ev.preventDefault(); map[ev.key](); }
});
window.__fig = { freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
draw(); syncUi(); drawScope();
`;

const CSS = `.fx-stage{position:relative;cursor:pointer}
.fx-layer{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.fx-gl{display:block}
body[data-theme="dark"] .fx-gl{mix-blend-mode:screen}
.iso-plate{overflow:hidden}
.iso-pipe{fill:none;stroke:#2b2b2b;stroke-width:2.2;stroke-linejoin:round;stroke-linecap:round}
body[data-theme="light"] .iso-pipe{stroke:#4a4a4a}
.iso-pipe-out{fill:none;stroke:var(--anatomy-mid);stroke-width:3.2;stroke-linejoin:round;stroke-linecap:round}
.cu .iso-fill,.cu .iso-shade{fill:color-mix(in srgb,#b0643a,#2a1a10 calc(var(--cook,0)*85%))}.cu .iso-top{fill:color-mix(in srgb,#d08a5a,#3a2414 calc(var(--cook,0)*85%))}
.ring .iso-fill,.ring .iso-shade{fill:#a9adb3}.ring .iso-top{fill:#c4c8cc}
body[data-theme="dark"] .ring .iso-fill,body[data-theme="dark"] .ring .iso-shade{fill:#6d7177}body[data-theme="dark"] .ring .iso-top{fill:#868a90}
.slot{fill:color-mix(in srgb,#b0643a,#2a1a10 calc(var(--cook,0)*85%));stroke:none}
.pole{stroke:none;opacity:0}.pole[data-n="n"]{fill:#ff4a3d}.pole[data-n="s"]{fill:#3d8bff}
.bars{fill:none;stroke:#c0c4c8;stroke-width:1.1;stroke-linecap:round}
body[data-theme="light"] .bars{stroke:#8a8f96}
.rfins{fill:none;stroke:var(--anatomy-mid);stroke-width:1.4;stroke-linecap:round}
.blade{fill:var(--anatomy-face,#ddd);stroke:var(--anatomy-mid);stroke-width:.5;stroke-linejoin:round}
.blade-e{fill:var(--anatomy-mid);stroke:var(--anatomy-mid);stroke-width:.5}
.jam .iso-fill,.jam .iso-shade{fill:#a0743f}.jam .iso-top{fill:#c39256}
.bulb .iso-fill,.bulb .iso-shade,.bulb .iso-top{fill:color-mix(in srgb,#ffe7a8,var(--anatomy-paper) calc((1 - var(--b,1))*100%))}
.lamp{stroke:var(--anatomy-mid);stroke-width:.3;fill:var(--anatomy-paper)}.lamp[data-on="true"]{fill:#3ddc84}
[data-part="ol"][data-on="true"]{fill:#ff4a3d}
.vfd-scr{fill:#10261c;stroke:var(--anatomy-mid);stroke-width:.3}.vfd-t{fill:#5dff9d}
.ctl{display:grid;gap:12px;margin:14px 0 6px;font-family:var(--anatomy-mono);font-size:12px;color:var(--anatomy-mid)}
.ctl-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ctl-label{min-width:72px;text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:var(--anatomy-lo)}
.ctl button{font:inherit;color:var(--anatomy-mid);background:transparent;border:1px solid var(--anatomy-lo);border-radius:6px;padding:7px 10px;cursor:pointer;line-height:1.15;text-align:left;min-height:36px}
.ctl button:hover{border-color:var(--anatomy-mid)}
.ctl button[aria-pressed="true"]{color:var(--anatomy-lit);border-color:var(--anatomy-lit)}
.ctl button small{display:block;font-size:10px;color:var(--anatomy-lo)}
.ctl #go{font-weight:600;letter-spacing:.06em;min-width:84px;text-align:center;border-color:var(--anatomy-lit);color:var(--anatomy-lit)}
.ctl #go[aria-pressed="true"]{background:var(--anatomy-lit);color:var(--anatomy-paper)}
.ctl #fresh{border-color:#ff6a3d;color:#ff6a3d}
.ctl output{min-width:72px;text-align:right;color:var(--anatomy-hi,var(--anatomy-mid))}
.meter{position:relative;flex:1;min-width:110px;height:10px;margin-top:14px;border:1px solid var(--anatomy-lo);border-radius:5px}
.meter .fill{position:absolute;left:0;top:0;bottom:0;border-radius:4px;transition:width .1s;background:var(--anatomy-mid)}
.meter .fill[data-state="ok"]{background:#3ddc84}.meter .fill[data-state="warn"]{background:#ffb347}.meter .fill[data-state="bad"]{background:#ff5a2a}
.mark{position:absolute;top:-14px;bottom:-3px;width:0;border-left:1px dashed #ff6a3d;pointer-events:none}
.mark::after{content:attr(data-label);position:absolute;top:0;left:4px;font-size:10px;white-space:nowrap;color:#ff6a3d}
#scope{width:100%;height:120px;display:block;border:1px solid var(--anatomy-lo);border-radius:6px}
#stats{font-size:12px;color:var(--anatomy-mid);line-height:1.5}#stats b{color:var(--anatomy-hi,var(--anatomy-mid));font-weight:600}
#shot{min-height:3.6em;font-size:12px;line-height:1.4}
@media (max-width:520px){.ctl-label{min-width:52px}.ctl button{padding:7px 8px}.ctl output{min-width:60px}.ctl button small{display:none}}`;

const stageHtml = `<div class="iso-stage fx-stage" tabindex="0" role="group" aria-label="Induction motor: space starts and stops, 1 2 3 pick the starter, F C J pick the load, O bypasses the overload">${svg}<canvas class="fx-layer fx-gl" aria-hidden="true"></canvas></div>`;

const CONTROLS = `<div class="ctl" role="group" aria-label="Test controls">
  <div class="ctl-row"><span class="ctl-label">Starter</span><button type="button" data-st="dol" aria-pressed="true">Direct on line</button><button type="button" data-st="sd" aria-pressed="false">Star-delta<small>3 s in star</small></button><button type="button" data-st="vfd" aria-pressed="false">VFD<small>5 s ramp, 1.5 × In limit</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Load</span><button type="button" data-ld="fan" aria-pressed="true">Fan<small>easy at low speed</small></button><button type="button" data-ld="conv" aria-pressed="false">Loaded conveyor<small>full torque from standstill</small></button><button type="button" data-ld="jam" aria-pressed="false">Jammed<small>someone's broom</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Overload</span><button type="button" data-olb="on" aria-pressed="true">Set to the motor</button><button type="button" data-olb="off" aria-pressed="false">Bypassed</button></div>
  <canvas id="scope" aria-label="Current and speed over the last ten seconds"></canvas>
  <div class="ctl-row"><span class="ctl-label">Windings</span><div class="meter"><span id="t-fill" class="fill"></span><span class="mark" style="left:${((155 - 20) / 200 * 100).toFixed(1)}%" data-label="155 °C class F"></span></div><output id="t-out">40 °C</output></div>
  <div class="ctl-row"><span class="ctl-label">Supply</span><div class="meter"><span id="v-fill" class="fill"></span><span class="mark" style="left:50%" data-label="−10 %"></span></div><output id="v-out">415 V</output></div>
  <div class="ctl-row"><span class="ctl-label">Now</span><span id="stats"></span></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="go" aria-pressed="false">START</button><button type="button" id="fresh" style="display:none">Rewind it</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
  <div id="shot" aria-live="polite">Stopped. Pick a starter and a load and hit START.</div>
</div>`;

const card = k.plateHtml({
  fig: "Fig 11",
  title: "How a motor starts",
  hint: "Tap: start / stop",
  readout: "",
  keys: [
    { mark: "lit", label: "The field (N red, S blue) going round the windings, the rotor chasing it; shown 40× slower" },
    { mark: "raised", label: "7.5 kW induction motor cut open: frame, laminated core, copper windings, squirrel cage rotor" },
  ],
  caption: "Three phases in three sets of windings make a magnetic field that goes round the stator at 1500 rpm on a 4-pole motor. The rotor is just aluminium bars shorted at the ends. It only gets current, and so torque, when the field is slipping past it, which is why it always runs a little slower than the field. At standstill the slip is total, so a motor started direct on line pulls 7 to 8 times its full load current until it gets going. Star-delta cuts that to a third, but the torque too, so it can't start a loaded machine. A VFD starts the field slowly and brings it up with the rotor, so the current never spikes. And a jammed rotor turns all that current into heat: the overload relay is there to win that race.",
  body: stageHtml,
});

const other = theme === "light" ? ["index.html", "Dark version"] : ["light.html", "Light version"];
const FOOT = `<p style="font-family:var(--anatomy-mono);font-size:11px;color:var(--anatomy-lo);margin:28px 0 8px;line-height:1.6">A toy, not a motor study. Anchored on a WEG W22 IE3 7.5 kW 4-pole (132M): 14.2 A, 1460 rpm, locked rotor current 8.3 × In, locked rotor torque 2.4 × Tn, breakdown 3.5 × Tn, class F, locked rotor time 12 s cold. Class 10 overload: trips at 7.2 × setting in 4 to 10 s. Made up: the circuit fitted to those ratios, the loads and their inertia, the timers, the drive, the supply dip, the thermal model and when it burns.<br>Built with <a href="https://github.com/wheresryan22/anatomy" style="color:inherit">Anatomy</a> by Ryan (MIT). · <a href="${other[0]}" style="color:inherit">${other[1]}</a> · <a href="../" style="color:inherit">More figures</a> · <a href="https://github.com/Dizzyfer/Anatomy/tree/main/motor" style="color:inherit">Source</a></p>`;
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "How a motor starts", theme, body: `<style>${CSS}</style>${card.replace("<figcaption", CONTROLS + "<figcaption")}${FOOT}`, script: kitScript() + glScript() + LIVE.replace("__DATA__", JSON.stringify(DATA)), width: 700 }));
console.log("wrote", name);
