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

// Truth: dust explosions need fuel, air, ignition, dispersion and confinement. A small primary (often in a bucket
// elevator) shakes settled dust into the air and lights it: the secondary is usually far worse. NFPA 654 treats about
// 0.8 mm (1/32 in) of dust over more than 5 % of the floor as an explosion hazard; OSHA's grain handling rule caps
// priority areas at 3.2 mm (1/8 in). Bearing and belt monitoring, venting and isolation are the usual protections.
// Toy: how thick the dust needs to be to go, the timings, the fireballs, what flies where.
const MODEL = { nfpa: 0.8, osha: 3.2, maxDust: 4, heatTime: 6, trip: 0.6, delays: { rec: 0.35, head: 0.45, gal: 0.85, silo: 1.2 }, end: 7 };

const PLATE = { x: -122, y: -74, w: 244, d: 142, r: 8 };
const PLATE_H = 12, FOOT_H = 5;
const REC = { x: -112, y: -54, w: 82, d: 80, h: 46 };
const LEG = { x: -50, y: -30, w: 9, d: 15, h: 154 };
const HEAD = { x: -60, y: -40, w: 40, d: 36, z: 146, h: 22 };
const GAL = { x: -20, y: -30, w: 122, d: 16, z: 152, h: 11 };
const SILOS = [[12, -22], [52, -22], [92, -22]];
const SR = 18, SH = 142;

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [HEAD.x, HEAD.y, HEAD.z + HEAD.h + 6], [GAL.x + GAL.w, GAL.y, GAL.z + GAL.h + 4]],
  W, H, { pad: 16, azimuth: 45 },
);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const Dt = (points, style) => k.dotsSvg(points, style);
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
  out.push(Dt(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  return out.join("");
}

// the receiving building: back and side walls, beams and ledges inside, all collecting dust
function receiving() {
  const out = [];
  out.push(`<g data-part="rec-back">`);
  out.push(S(slab({ x: REC.x, y: REC.y, w: REC.w, d: 2 }, 0, REC.h, 0.3, 0.1), { tone: "lo" }));
  out.push(S(slab({ x: REC.x, y: REC.y + 2, w: 2, d: REC.d - 2 }, 0, REC.h, 0.3, 0.1), { tone: "lo" }));
  out.push(`</g>`);
  // beams along the back wall and a ledge on the side
  for (const z of [16, 32]) out.push(S(slab({ x: REC.x + 2, y: REC.y + 2, w: REC.w - 4, d: 4 }, z, 2.4, 0.2, 0.1), { tone: "mid" }));
  out.push(S(slab({ x: REC.x + 2, y: REC.y + 6, w: 4, d: REC.d - 10 }, 24, 2.4, 0.2, 0.1), { tone: "mid" }));
  // a conveyor across the floor into the elevator boot
  out.push(S(slab({ x: REC.x + 14, y: -22, w: 60, d: 8 }, 6, 3, 0.4, 0.2), { tone: "hi" }));
  for (const x of [REC.x + 18, REC.x + 40, REC.x + 62]) out.push(S(slab({ x, y: -21, w: 2, d: 6 }, 0, 6, 0.2, 0), { tone: "mid" }));
  // the dust: on the beams, the ledge and patches of floor, thickness set by JS
  const dust = [];
  for (const z of [18.4, 34.4]) dust.push({ x: REC.x + 3, y: REC.y + 2.5, w: REC.w - 6, d: 3, z });
  dust.push({ x: REC.x + 2.5, y: REC.y + 7, w: 3, d: REC.d - 12, z: 26.4 });
  dust.push({ x: REC.x + 4, y: REC.y + 30, w: 30, d: 40, z: 0.05 }, { x: REC.x + 40, y: REC.y + 40, w: 36, d: 30, z: 0.05 });
  dust.forEach((p, i) => out.push(`<path data-dust="${i}" class="dust" d=""/>`));
  return { svg: out.join(""), dust };
}
function recFront() {
  const c = (x, y, z) => at([x, y, z]).map((n) => n.toFixed(1)).join(" ");
  const x1 = REC.x + REC.w, y1 = REC.y + REC.d;
  const out = [`<path class="cutwall" d="M${c(x1, REC.y, REC.h)}L${c(x1, y1, REC.h)}L${c(REC.x, y1, REC.h)}M${c(x1, y1, 0)}L${c(x1, y1, REC.h)}"/>`];
  out.push(`<g data-part="rec-roof" class="roofslab">${S(slab({ x: REC.x, y: REC.y, w: REC.w, d: REC.d }, REC.h, 2, 0.3, 0.1), { tone: "lo" })}</g>`);
  return out.join("");
}

function leg() {
  const out = [];
  out.push(S(slab({ ...LEG }, 0, LEG.h, 0.4, 0.2), { tone: "mid" }));
  // cut open on the +y face: the belt, the buckets, the pulleys
  const m = k.sideMatrix([LEG.x + 0.5, LEG.y + LEG.d + 0.02], LEG.h, P, "left");
  const buckets = [];
  for (let v = 10; v < LEG.h - 8; v += 6) buckets.push(`<rect x="1.4" y="${v}" width="2.2" height="1.6" class="bucket"/><rect x="${LEG.w - 4.6}" y="${v + 3}" width="2.2" height="1.6" class="bucket"/>`);
  out.push(`<g transform="${m}"><rect x="0" y="0" width="${LEG.w - 1}" height="${LEG.h}" class="leg-in"/><path d="M1.2 6V${LEG.h - 6}M${LEG.w - 2.2} 6V${LEG.h - 6}" class="belt"/>${buckets.join("")}<circle cx="${(LEG.w - 1) / 2}" cy="5" r="${(LEG.w - 1) / 2 - 0.6}" class="pulley"/><circle cx="${(LEG.w - 1) / 2}" cy="${LEG.h - 5}" r="${(LEG.w - 1) / 2 - 0.6}" class="pulley"/><circle data-part="bearing" cx="${(LEG.w - 1) / 2}" cy="5" r="1.4" class="bearing"/></g>`);
  // the vent panel at the top of the leg, and the panel that blows out if there's no vent
  out.push(`<g data-part="vent" class="vent">${S(slab({ x: LEG.x + LEG.w, y: LEG.y + 2, w: 1, d: LEG.d - 4 }, LEG.h - 40, 20, 0.2, 0), { tone: "hi", crease: "none" })}</g>`);
  out.push(`<g data-part="leg-panel">${S(slab({ x: LEG.x + LEG.w - 0.2, y: LEG.y + 1, w: 1.4, d: LEG.d - 2 }, 60, 30, 0.2, 0), { tone: "mid", crease: "none" })}</g>`);
  return out.join("");
}

function headhouse() {
  return `<g data-part="head">${S(slab({ x: HEAD.x, y: HEAD.y, w: HEAD.w, d: HEAD.d }, HEAD.z, HEAD.h, 0.6, 0.3), { tone: "hi", inner: L([HEAD.z + 8, HEAD.z + 15].map((z) => k.segment([HEAD.x + HEAD.w, HEAD.y, z], [HEAD.x + HEAD.w, HEAD.y + HEAD.d, z], P)).join(""), { tone: "faint" }) })}</g>`;
}
function gallery() {
  const out = [];
  out.push(S(slab({ x: GAL.x, y: GAL.y, w: GAL.w, d: GAL.d }, GAL.z, GAL.h - 2, 0.4, 0.2), { tone: "mid" }));
  out.push(`<g data-part="gal-roof">${S(slab({ x: GAL.x, y: GAL.y - 1, w: GAL.w, d: GAL.d + 2 }, GAL.z + GAL.h - 2, 2, 0.3, 0.1), { tone: "hi" })}</g>`);
  // trestle legs from the silo roofs
  return out.join("");
}
function silos() {
  const out = [];
  for (const [i, [x, y]] of SILOS.entries()) {
    out.push(`<path class="iso-halo" d="${k.haloOf({ x: x - SR - 2, y: y - SR - 2, w: SR * 2 + 4, d: SR * 2 + 4, r: SR }, 0, 0.1, P)}"/>`);
    out.push(S(k.cylinder(x, y, SR, 0, SH, P, 40, 0.6), { tone: "hi", inner: L([30, 60, 90, 120].map((z) => k.sideArc(x, y, SR, z, P, 30)).join(""), { tone: "faint" }) }));
    out.push(`<g data-part="silo-roof-${i}">${S(k.cylinder(x, y, SR + 0.6, SH, 4, P, 40, 2.4), { tone: "mid" })}${S(k.cylinder(x, y, 4, SH + 4, 3, P, 16, 0.6), { tone: "hi" })}</g>`);
    out.push(S(slab({ x: x - 2, y: GAL.y + 4, w: 4, d: 8 }, SH + 4, GAL.z - SH - 4, 0.2, 0), { tone: "mid" }));
  }
  return out.join("");
}

const rec = receiving();
const backSvg = k.figureSvg({
  width: W, height: H,
  label: "A grain handling plant: a receiving building with a conveyor and dusty beams, a bucket elevator cut open to show its belt and buckets, a headhouse on top, a gallery running across the tops of three silos.",
  body: [plate(), rec.svg, leg(), recFront()],
});
// silos, gallery and headhouse drawn after the building in their own layer
const layer = (body) => `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg fx-layer" viewBox="0 0 ${W} ${H}" aria-hidden="true">${body}</svg>`;
const topSvg = layer([silos(), gallery(), headhouse()].join(""));

const SECT = {
  leg: [LEG.x + LEG.w / 2, LEG.y + LEG.d / 2, 80],
  rec: [REC.x + REC.w / 2, REC.y + REC.d / 2, 22],
  head: [HEAD.x + HEAD.w / 2, HEAD.y + HEAD.d / 2, HEAD.z + 10],
  gal: [GAL.x + GAL.w / 2, GAL.y + GAL.d / 2, GAL.z + 5],
  s0: [SILOS[0][0], SILOS[0][1], SH + 2], s1: [SILOS[1][0], SILOS[1][1], SH + 2], s2: [SILOS[2][0], SILOS[2][1], SH + 2],
};
const NAMES = Object.keys(SECT);
const DATA = {
  W, H, camera: glCamera(P), P, MODEL, NAMES, dust: rec.dust,
  piv: Object.fromEntries(Object.entries(SECT).map(([n, p]) => [n, at(p)])),
};

const FRAG = `
uniform float uLight;
uniform float uC[7];
uniform float uI[7];
uniform float uGlow;
uniform float uVent;
vec4 inkFor(vec3 seen,float cover){vec3 ab=1.-seen;float a=max(max(ab.r,max(ab.g,ab.b)),cover);return vec4(vec3(a)-ab,a);}
vec4 over(vec4 t,vec4 u){return t+u*(1.-t.a);}
vec4 fireInk(float e,float core){
  vec3 hue=mix(vec3(.55,.16,.06),mix(vec3(1.,.36,.08),vec3(1.,.66,.28),smoothstep(.45,1.,core)),smoothstep(0.,.5,core));
  vec3 c=tonemap(hue*e,1.4);float a=max(c.r,max(c.g,c.b));
  float la=1.-exp(-1.8*e);
  vec3 seen=mix(vec3(1.),mix(vec3(.82,.28,.06),vec3(1.,.78,.4),smoothstep(.6,1.,core)*smoothstep(.5,1.,la)),la);
  return mix(vec4(c,a),inkFor(seen,.9*smoothstep(.75,1.,la)*core)*la,uLight);
}
vec4 smokeInk(float h){float a=(1.-exp(-h))*mix(.55,.45,uLight);return vec4(mix(vec3(.34,.3,.26),vec3(.26,.22,.18),uLight)*a,a);}
vec4 dustInk(float h){float a=(1.-exp(-h))*mix(.4,.35,uLight);return vec4(mix(vec3(.78,.66,.46),vec3(.6,.48,.3),uLight)*a,a);}
float edgeFade(vec2 vb){return smoothstep(0.,40.,min(min(vb.x,uView.x-vb.x),min(vb.y,uView.y-vb.y)));}
${NAMES.map((n, i) => `const vec3 C${i}=vec3(${SECT[n].map((v) => v.toFixed(1)).join(",")});`).join("\n")}
void main(){
  vec2 vb=viewOf(gl_FragCoord.xy);
  vec4 o=vec4(0.);
  float ef=edgeFade(vb);
  // the hot bearing
  if(uGlow>.002){vec2 d=(vb-project(vec3(${(LEG.x + LEG.w / 2).toFixed(1)},${(LEG.y + LEG.d).toFixed(1)},${(LEG.h - 5).toFixed(1)})))/uK;o=fireInk(exp(-pow(length(d)/2.2,2.))*uGlow*1.6,.5);}
  float e=0.,hot=0.,smk=0.,dst=0.;
${NAMES.map((n, i) => `  if(uC[${i}]>=0.){
    float c=uC[${i}],I=uI[${i}];
    vec2 d=(vb-project(C${i}+vec3(0.,0.,c*12.)))/uK;
    float R=(${i === 0 ? "10." : i === 1 ? "30." : i < 4 ? "22." : "18."}+${i === 1 ? "70." : "40."}*I)*(1.-exp(-c/.12));
    float n=fbm2(d*.05+vec2(c*1.3,${(i * 3.1).toFixed(1)}));
    float body=(1.-smoothstep(R*.35,R*(.95+.3*n),length(d*vec2(1.,1.15))));
    float life=smoothstep(0.,.04,c)*exp(-c/.7);
    e+=body*(.5+.8*n)*life*(.8+.5*I); hot+=body*life*exp(-c/.3);
    smk+=body*smoothstep(.4,1.2,c)*exp(-c/3.)*(.6+.6*n);
    dst+=(1.-smoothstep(R*.6,R*1.6,length(d)))*smoothstep(-.3,.1,c)*(1.-smoothstep(0.,.5,c))*.8*I;
  }`).join("\n")}
  o=over(smokeInk(smk*1.2*ef),o);
  o=over(dustInk(dst*ef),o);
  o=over(fireInk(e*ef,clamp(hot*1.3/max(e,1e-3),0.,1.)),o);
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
const gl = glLayer({ canvas: stage.querySelector(".fx-gl"), fragment: ${JSON.stringify(FRAG)}, view: [D.W, D.H], camera: D.camera, uniforms: ["uC", "uI", "uGlow", "uVent"], fixed: { uLight: LIGHT } });
if (gl) stage.setAttribute("data-gl", "");

let dustMm = 2, monitor = false, vented = false, isolated = false;
let fault = false, heat = 0, tripped = false, ignAt = null, plan = {}, lastShot = "", lastEvent = "", lastEventAt = -10;
let frame = 0, last = 0, now = 0, visible = false, touring = true, slow = false, tourClock = 0, tourStep = -1, nextAt = 0, goAt = 0;
const busy = () => ignAt !== null;
const event = (t) => { lastEvent = t; lastEventAt = now; };
function reset() { fault = false; heat = 0; tripped = false; ignAt = null; plan = {}; lastEvent = ""; }

function ignite() {
  ignAt = now;
  // a vented leg throws less of a punch into the building, so it takes more dust to set off a secondary
  const need = vented ? M.nfpa * 2 : M.nfpa;
  const go = dustMm >= need, I = clamp(dustMm / 2.2, 0.35, 1.6);
  plan = { leg: [0, vented ? 0.6 : 1] };
  if (go) { plan.rec = [M.delays.rec, I]; plan.head = [M.delays.head, I * 0.8]; plan.gal = [M.delays.gal, I * 0.8]; }
  if (!isolated && (go || !vented)) { const t0 = go ? M.delays.silo : 0.7; plan.s0 = [t0, 0.9]; plan.s1 = [t0 + 0.15, 0.9]; plan.s2 = [t0 + 0.3, 0.9]; }
  const n = Object.keys(plan).length;
  event(n === 1 ? (vented ? "Primary in the elevator leg. The vent panel blew and threw the fireball outside. The building was clean enough that the pressure wave had nothing to pick up. That's as small as a dust explosion gets." : "Primary in the elevator leg, and it split the casing. But the building was clean and the silos isolated, so it stopped there.")
    : go ? "Primary in the leg, and then the bad one: the pressure wave shook " + dustMm.toFixed(1) + " mm of dust off every beam and ledge into the air, and the primary lit it. The secondary went through the receiving building, the headhouse and the gallery" + (isolated ? ". Isolation kept it out of the silos." : ", and down into the silos.")
    : "Primary in the leg, and with no isolation the flame went straight down the spouts into the silos.");
}

function step(dt) {
  if (busy()) return;
  if (fault && !tripped) {
    heat += dt / M.heatTime;
    if (monitor && heat >= M.trip) { tripped = true; event("The bearing temperature sensor saw it heating and stopped the elevator. Nothing else happens. That's what monitoring is for."); }
    if (heat >= 1) ignite();
  } else if (tripped) heat = Math.max(0, heat - dt * 0.05);
}

const dustEls = [...stage.querySelectorAll("[data-dust]")];
const parts = { recRoof: q("rec-roof"), recBack: q("rec-back"), head: q("head"), galRoof: q("gal-roof"), vent: q("vent"), legPanel: q("leg-panel"), roofs: [0, 1, 2].map((i) => q("silo-roof-" + i)), bearing: q("bearing") };
const ui = {
  dust: document.querySelector("#dust"), dustOut: document.querySelector("#dust-out"),
  mon: [...document.querySelectorAll("[data-mon]")], vent: [...document.querySelectorAll("[data-vent]")], iso: [...document.querySelectorAll("[data-iso]")],
  hFill: document.querySelector("#h-fill"), hOut: document.querySelector("#h-out"), stats: document.querySelector("#stats"),
  go: document.querySelector("#go"), slow: document.querySelector("#slow"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"),
};
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };
const pt = (p) => { const a = iso(p, P); return a[0].toFixed(1) + " " + a[1].toFixed(1); };
function dustPath(p, h) { const z = p.z, z1 = p.z + h; const a = [[p.x, p.y], [p.x + p.w, p.y], [p.x + p.w, p.y + p.d], [p.x, p.y + p.d]]; return "M" + a.map(([x, y]) => pt([x, y, z1])).join("L") + "Z" + "M" + pt([p.x + p.w, p.y, z]) + "L" + pt([p.x + p.w, p.y, z1]) + "L" + pt([p.x + p.w, p.y + p.d, z1]) + "L" + pt([p.x + p.w, p.y + p.d, z]) + "Z" + "M" + pt([p.x, p.y + p.d, z]) + "L" + pt([p.x, p.y + p.d, z1]) + "L" + pt([p.x + p.w, p.y + p.d, z1]) + "L" + pt([p.x + p.w, p.y + p.d, z]) + "Z"; }
const fly = (c, piv, vx, vy, w) => c > 0 ? "translate(" + (vx * c).toFixed(1) + " " + (-vy * c + 420 * c * c).toFixed(1) + ") rotate(" + (w * c).toFixed(0) + " " + piv[0].toFixed(1) + " " + piv[1].toFixed(1) + ")" : "";

function draw() {
  const c = ignAt === null ? -1 : now - ignAt;
  const sc = (n) => (plan[n] && c >= plan[n][0] ? c - plan[n][0] : -1);
  // the dust: gone from wherever a secondary has been through
  const vis = dustMm * 0.7 + 0.05;
  dustEls.forEach((el, i) => { el.setAttribute("d", dustMm > 0.02 ? dustPath(D.dust[i], vis) : ""); el.style.opacity = sc("rec") >= 0 || (c >= 0 && c < 0.35 && dustMm >= (vented ? 1.6 : 0.8)) ? String(Math.max(0, 1 - c * 3) * clamp(dustMm / 1.5, 0.2, 1)) : String(clamp(dustMm / 1.5, 0.2, 1)); });
  parts.bearing.dataset.hot = String(heat > 0.3);
  parts.bearing.style.fill = "rgb(" + Math.round(120 + 135 * heat) + "," + Math.round(120 - 60 * heat) + ",60)";
  // what flies
  const t = (n) => sc(n);
  parts.recRoof.setAttribute("transform", fly(t("rec"), D.piv.rec, 40, 520, -60));
  parts.head.setAttribute("transform", fly(t("head"), D.piv.head, -90, 480, -90));
  parts.galRoof.setAttribute("transform", fly(t("gal"), D.piv.gal, 60, 420, 40));
  parts.roofs.forEach((r, i) => r.setAttribute("transform", fly(t("s" + i), D.piv["s" + i], (i - 1) * 50, 560, (i - 1) * 120)));
  parts.vent.setAttribute("transform", vented && t("leg") >= 0 ? fly(t("leg"), D.piv.leg, 160, 260, 200) : "");
  parts.vent.style.display = vented ? "" : "none";
  parts.legPanel.setAttribute("transform", !vented && t("leg") >= 0 ? fly(t("leg"), D.piv.leg, 220, 200, 260) : "");
  const big = Object.keys(plan).length;
  if (c >= 0) {
    const A = (big > 1 ? 14 : 5) * Math.exp(-c / 0.6);
    stage.style.transform = "translate(" + (A * Math.sin(c * 80)).toFixed(1) + "px," + (A * Math.cos(c * 67)).toFixed(1) + "px)";
    if (c > M.end) { stage.style.transform = ""; reset(); event("Reset. Same plant, same dust, same bearing."); return draw(); }
  }
  if (gl && !window.__noGL) gl.draw({ uC: D.NAMES.map((n) => sc(n)), uI: D.NAMES.map((n) => (plan[n] ? plan[n][1] : 0)), uGlow: c < 0 && fault ? sm(0.3, 1, heat) : 0, uVent: 0 }, now);
  const text = c >= 0 ? (big > 1 ? "SECONDARY · " + big + " sections" : "PRIMARY only") : (fault ? (tripped ? "elevator stopped by monitoring" : "bearing heating · " + Math.round(heat * 100) + " %") : "running") + " · dust " + dustMm.toFixed(1) + " mm";
  if (readout.textContent !== text) readout.textContent = text;
}

function syncUi() {
  ui.dust.value = Math.round(dustMm * 10); ui.dustOut.textContent = dustMm.toFixed(1) + " mm";
  ui.mon.forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.mon === "on") === monitor)));
  ui.vent.forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.vent === "on") === vented)));
  ui.iso.forEach((b) => b.setAttribute("aria-pressed", String((b.dataset.iso === "on") === isolated)));
  ui.hFill.style.width = (clamp(heat, 0, 1) * 100).toFixed(1) + "%"; ui.hFill.dataset.state = heat >= 1 ? "bad" : heat > M.trip ? "warn" : "ok";
  ui.hOut.textContent = tripped ? "TRIPPED" : Math.round(heat * 100) + " %";
  ui.stats.innerHTML = "dust layer <b>" + dustMm.toFixed(1) + " mm</b> (" + (dustMm >= M.osha ? "past both limits" : dustMm >= M.nfpa ? "past the NFPA 654 line" : "under the lines") + ") · leg <b>" + (vented ? "vented" : "not vented") + "</b> · silos <b>" + (isolated ? "isolated" : "open to the leg") + "</b>";
  ui.go.disabled = busy() || (fault && !tripped); ui.go.textContent = "HOT BEARING";
  ui.slow.setAttribute("aria-pressed", String(slow)); ui.tour.setAttribute("aria-pressed", String(touring));
}

function story() {
  if (now - lastEventAt < 5 && lastEvent) return say(lastEvent);
  if (busy()) return;
  if (fault && !tripped) return say("The head pulley bearing is running hot: " + Math.round(heat * 100) + " % of the way to lighting the dust inside the leg." + (monitor ? " Bearing monitoring is on." : " Nothing is watching it."));
  say("A bucket elevator lifting grain, and dust settling on every beam and ledge: " + dustMm.toFixed(1) + " mm of it. Hit Hot bearing and see how far it goes.");
}

const TOUR = [
  { dust: 0.3, mon: false, vent: true, iso: true },
  { dust: 2.0, mon: false, vent: true, iso: true },
  { dust: 3.5, mon: false, vent: false, iso: false },
  { dust: 3.5, mon: true, vent: false, iso: false },
];
function tick(t) {
  const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
  last = t;
  const sdt = dt * (slow ? 0.15 : 1);
  now += sdt;
  if (touring && !busy()) {
    tourClock += sdt;
    if (tourStep < 0 || tourClock >= nextAt) {
      tourStep = (tourStep + 1) % TOUR.length;
      const s = TOUR[tourStep]; dustMm = s.dust; monitor = s.mon; vented = s.vent; isolated = s.iso; reset();
      goAt = tourClock + 1.5; nextAt = tourClock + 1.5 + M.heatTime + 1;
    }
    if (!fault && tourClock >= goAt) fault = true;
  }
  step(sdt);
  draw(); syncUi(); story();
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const guard = (fn) => (...a) => { touring = false; if (busy()) return; fn(...a); draw(); syncUi(); run(); };
const setDust = guard((v) => { dustMm = v; });
const setMon = guard((v) => { monitor = v; });
const setVent = guard((v) => { vented = v; });
const setIso = guard((v) => { isolated = v; });
const go = guard(() => { reset(); fault = true; });
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;
ui.dust.addEventListener("input", () => setDust(+ui.dust.value / 10));
ui.mon.forEach((b) => b.addEventListener("click", () => setMon(b.dataset.mon === "on")));
ui.vent.forEach((b) => b.addEventListener("click", () => setVent(b.dataset.vent === "on")));
ui.iso.forEach((b) => b.addEventListener("click", () => setIso(b.dataset.iso === "on")));
ui.go.addEventListener("click", go);
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; tourClock = 0; } run(); });
stage.addEventListener("click", go);
stage.addEventListener("keydown", (ev) => {
  const map = { " ": go, Enter: go, ArrowUp: () => setDust(clamp(dustMm + 0.2, 0, M.maxDust)), ArrowDown: () => setDust(clamp(dustMm - 0.2, 0, M.maxDust)), m: () => setMon(!monitor), v: () => setVent(!vented), i: () => setIso(!isolated), s: () => { slow = !slow; run(); } };
  if (map[ev.key]) { ev.preventDefault(); map[ev.key](); }
});
window.__fig = { freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
draw(); syncUi(); story();
`;

const CSS = `.fx-stage{position:relative;cursor:pointer}
.fx-layer{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.fx-gl{display:block}
body[data-theme="dark"] .fx-gl{mix-blend-mode:screen}
.iso-plate{overflow:hidden}
.dust{fill:#b8975e;stroke:none;transition:opacity .2s}
body[data-theme="dark"] .dust{fill:#9b7d4c}
.cutwall{fill:none;stroke:var(--anatomy-lo);stroke-width:.8;stroke-dasharray:4 3}
.roofslab{opacity:.45}
.leg-in{fill:#1d1d1d;opacity:.9}
body[data-theme="light"] .leg-in{fill:#5a5a5a;opacity:.6}
.belt{stroke:#3a3a3a;stroke-width:.8;fill:none}
body[data-theme="dark"] .belt{stroke:#8a8a8a}
.bucket{fill:#c0392b}
.pulley{fill:none;stroke:var(--anatomy-mid);stroke-width:.5}
.bearing{stroke:var(--anatomy-mid);stroke-width:.3}
.vent .iso-fill,.vent .iso-shade,.vent .iso-top{fill:#ff6a3d}
.ctl{display:grid;gap:12px;margin:14px 0 6px;font-family:var(--anatomy-mono);font-size:12px;color:var(--anatomy-mid)}
.ctl-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ctl-label{min-width:72px;text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:var(--anatomy-lo)}
.ctl button{font:inherit;color:var(--anatomy-mid);background:transparent;border:1px solid var(--anatomy-lo);border-radius:6px;padding:7px 10px;cursor:pointer;line-height:1.15;text-align:left;min-height:36px}
.ctl button:hover{border-color:var(--anatomy-mid)}
.ctl button[aria-pressed="true"]{color:var(--anatomy-lit);border-color:var(--anatomy-lit)}
.ctl button small{display:block;font-size:10px;color:var(--anatomy-lo)}
.ctl #go{font-weight:600;letter-spacing:.06em;min-width:120px;text-align:center;border-color:#ff6a3d;color:#ff6a3d}
.ctl #go:disabled{opacity:.4;cursor:default}
.slide{position:relative;flex:1;min-width:110px}
.slide input{width:100%;accent-color:var(--anatomy-lit);margin:0}
.slide .mark{top:-14px;bottom:-3px}
.ctl output{min-width:72px;text-align:right;color:var(--anatomy-hi,var(--anatomy-mid))}
.meter{position:relative;flex:1;min-width:110px;height:10px;margin-top:14px;border:1px solid var(--anatomy-lo);border-radius:5px}
.meter .fill{position:absolute;left:0;top:0;bottom:0;border-radius:4px;transition:width .1s;background:var(--anatomy-mid)}
.meter .fill[data-state="ok"]{background:#3ddc84}.meter .fill[data-state="warn"]{background:#ffb347}.meter .fill[data-state="bad"]{background:#ff5a2a}
.mark{position:absolute;top:-14px;bottom:-3px;width:0;border-left:1px dashed #ff6a3d;pointer-events:none}
.mark::after{content:attr(data-label);position:absolute;top:0;left:4px;font-size:10px;white-space:nowrap;color:#ff6a3d}
.slide{padding-top:14px}
#stats{font-size:12px;color:var(--anatomy-mid);line-height:1.5}#stats b{color:var(--anatomy-hi,var(--anatomy-mid));font-weight:600}
#shot{min-height:3.6em;font-size:12px;line-height:1.4}
@media (max-width:520px){.ctl-label{min-width:52px}.ctl button{padding:7px 8px}.ctl output{min-width:60px}.ctl button small{display:none}}`;

const stageHtml = `<div class="iso-stage fx-stage" tabindex="0" role="group" aria-label="Grain plant: space starts the hot bearing, up and down change the dust, M monitoring, V venting, I isolation">${backSvg}${topSvg}<canvas class="fx-layer fx-gl" aria-hidden="true"></canvas></div>`;

const mm = (v) => (v / MODEL.maxDust * 100).toFixed(1);
const CONTROLS = `<div class="ctl" role="group" aria-label="Test controls">
  <div class="ctl-row"><span class="ctl-label">Dust</span><div class="slide"><span class="mark" style="left:${mm(0.8)}%" data-label="0.8 mm NFPA 654"></span><span class="mark" style="left:${mm(3.2)}%" data-label="3.2 mm"></span><input id="dust" type="range" min="0" max="40" step="1" value="20" aria-label="Settled dust layer"></div><output id="dust-out">2.0 mm</output></div>
  <div class="ctl-row"><span class="ctl-label">Monitoring</span><button type="button" data-mon="on" aria-pressed="false">Bearing sensors</button><button type="button" data-mon="off" aria-pressed="true">None</button></div>
  <div class="ctl-row"><span class="ctl-label">Leg</span><button type="button" data-vent="on" aria-pressed="false">Explosion vents</button><button type="button" data-vent="off" aria-pressed="true">No vents</button></div>
  <div class="ctl-row"><span class="ctl-label">Silos</span><button type="button" data-iso="on" aria-pressed="false">Isolated<small>chokes / flap valves</small></button><button type="button" data-iso="off" aria-pressed="true">Open to the leg</button></div>
  <div class="ctl-row"><span class="ctl-label">Bearing</span><div class="meter"><span id="h-fill" class="fill"></span><span class="mark" style="left:${MODEL.trip * 100}%" data-label="sensor trips"></span></div><output id="h-out">0 %</output></div>
  <div class="ctl-row"><span class="ctl-label">Plant</span><span id="stats"></span></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="go">HOT BEARING</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
  <div id="shot" aria-live="polite"></div>
</div>`;

const card = k.plateHtml({
  fig: "Fig 17",
  title: "Grain dust explosion",
  hint: "Tap: hot bearing",
  readout: "",
  keys: [
    { mark: "lit", label: "The hot bearing, the primary in the leg, the secondary through the plant" },
    { mark: "raised", label: "Receiving building (cut open), bucket elevator leg (cut open), headhouse, gallery, silos" },
  ],
  caption: "Grain dust burns like a gas once it's in the air. The first bang is usually small and inside equipment: a hot bearing or a slipping belt lights the dust cloud inside a bucket elevator. That primary is not what kills people. Its pressure wave shakes everything in the building and throws the dust that's settled on beams, ledges and floors into the air, and the primary's flame lights that. The secondary runs through the whole building. A layer about 0.8 mm thick, roughly a paperclip wire, over more than 5 % of the floor is enough for NFPA 654 to call it an explosion hazard. Monitoring stops the ignition, vents take the punch out of the primary, isolation keeps it out of the silos, and housekeeping takes away the fuel for the big one.",
  body: stageHtml,
});

const other = theme === "light" ? ["index.html", "Dark version"] : ["light.html", "Light version"];
const FOOT = `<p style="font-family:var(--anatomy-mono);font-size:11px;color:var(--anatomy-lo);margin:28px 0 8px;line-height:1.6">A toy, not a dust hazard analysis. Real: primary and secondary dust explosions, NFPA 654's 0.8 mm (1/32 in) over 5 % of the floor (for dust around 1200 kg/m³), OSHA's 3.2 mm (1/8 in) for priority areas in grain handling, and bearing monitoring, venting and isolation as protections. Made up: how much dust it takes here, the timings, the fireballs and what flies where.<br>Built with <a href="https://github.com/wheresryan22/anatomy" style="color:inherit">Anatomy</a> by Ryan (MIT). · <a href="${other[0]}" style="color:inherit">${other[1]}</a> · <a href="../" style="color:inherit">More figures</a> · <a href="https://github.com/Dizzyfer/Anatomy/tree/main/silo" style="color:inherit">Source</a></p>`;
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "Grain dust explosion", theme, body: `<style>${CSS}</style>${card.replace("<figcaption", CONTROLS + "<figcaption")}${FOOT}`, script: kitScript() + glScript() + LIVE.replace("__DATA__", JSON.stringify(DATA)), width: 700 }));
console.log("wrote", name);
