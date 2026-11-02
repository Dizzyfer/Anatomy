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
// Literature values (powderprocess.net tables): 5 mm layer / cloud ignition °C.
const DUSTS = [
  { id: "coal", name: "coal dust", btn: "Coal", layer: 250, cloud: 600, colour: ["#2a2622", "#3a3530"], light: ["#5a534c", "#7a7168"] },
  { id: "wood", name: "wood flour", btn: "Wood flour", layer: 340, cloud: 490, colour: ["#6b5236", "#7e6342"], light: ["#c9a676", "#d9ba8c"] },
  { id: "sugar", name: "sugar dust", btn: "Sugar", layer: 480, cloud: 490, colour: ["#9a968c", "#b0aca2"], light: ["#ece8de", "#f6f3ec"] },
];
// Toy: lamp marked T135 °C, which it reaches with exactly 5 mm on it (90 °C bare, +9 K per mm); thicker layers also light lower (3 K/mm past 5 mm).
const MODEL = { bare: 90, perMm: 9, marked: 135, thickDrop: 3, tau: 2.2, maxMm: 30 };

const PLATE = { x: -112, y: -70, w: 232, d: 150, r: 8 };
const PLATE_H = 12, FOOT_H = 5;
const COL = { x: -100, y: -5, w: 10, d: 10 };
const BEAM = { x0: -100, x1: 112, y: 0, z0: 84 };
const LUM = { x: -14, y: -18, w: 48, d: 36, z0: 56, z1: 66 };
const FIN_H = 5;
const DUST_K = 0.32; // world units of drawn layer per mm (drawn exaggerated-ish)
const LAMP_C = [LUM.x + LUM.w / 2, 0];

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [BEAM.x0, 0, BEAM.z0 + 16], [BEAM.x1, 0, BEAM.z0 + 16]],
  W, H, { pad: 22, azimuth: 45 },
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
  out.push(k.faceTextSvg(k.topMatrix([-50, 72], 0, P, "x"), "ZONE 21", { size: 5, tone: "lo" }));
  // dust drifts on the floor
  out.push(`<g data-part="floordust">` + [[-40, 40, 26, 14], [52, 46, 30, 12], [70, -46, 22, 12]].map(([x, y, w, d]) => S(slab({ x, y, w, d }, 0, 0.6, 5, 0), { tone: "mid", crease: "none", className: "dust" })).join("") + `</g>`);
  // sacks
  for (const [x, y] of byDepth([[60, -30], [76, -24]])) out.push(`<g data-sack="">` + S(slab({ x, y, w: 14, d: 22 }, 0, 9, 4, 0.8), { tone: "hi", inner: L(k.segment([x + 14, y + 4, 4.5], [x + 14, y + 18, 4.5], P), { tone: "faint" }) }) + S(slab({ x: x + 1, y: y + 1, w: 12, d: 20 }, 9, 6, 4, 0.8), { tone: "hi" }) + `</g>`);
  return out.join("");
}

function column() {
  const out = [];
  out.push(S(slab({ x: COL.x - 4, y: COL.y - 4, w: COL.w + 8, d: COL.d + 8 }, 0, 1.6, 1, 0.3), { tone: "mid" }));
  out.push(Dt(k.corners({ x: COL.x - 4, y: COL.y - 4, w: COL.w + 8, d: COL.d + 8 }, 2).map(([x, y]) => at([x, y, 1.6])), { size: 0.5 }));
  out.push(S(slab(COL, 1.6, BEAM.z0 + 14 - 1.6, 0.4, 0.3), { tone: "mid", inner: L(k.segment([COL.x + COL.w, COL.y + 5, 2], [COL.x + COL.w, COL.y + 5, BEAM.z0 + 12], P), { tone: "faint" }) }));
  // junction box on the column
  out.push(S(slab({ x: COL.x + COL.w, y: COL.y - 2, w: 6, d: 14 }, 50, 16, 1, 0.4), { tone: "hi" }));
  return out.join("");
}

function beam() {
  const out = [];
  const { x0, x1, y, z0 } = BEAM;
  out.push(S(slab({ x: x0, y: y - 7, w: x1 - x0, d: 14 }, z0, 2, 0.3, 0.2), { tone: "mid" }));
  out.push(S(slab({ x: x0, y: y - 1, w: x1 - x0, d: 2 }, z0 + 2, 10, 0.2, 0), { tone: "mid", inner: L([0, 1, 2, 3, 4, 5, 6, 7].map((i) => k.segment([x0 + 24 + i * 24, y + 1, z0 + 3], [x0 + 24 + i * 24, y + 1, z0 + 11], P)).join(""), { tone: "faint" }) }));
  out.push(S(slab({ x: x0, y: y - 7, w: x1 - x0, d: 14 }, z0 + 12, 2, 0.3, 0.2), { tone: "mid" }));
  out.push(`<g data-part="beamdust"></g>`);
  // cable from the lamp along the beam to the JB
  const c = [[LUM.x + 2, LUM.y + 4, LUM.z1 + 1], [LUM.x - 4, LUM.y + 4, LUM.z1 + 8], [LUM.x - 8, -6, BEAM.z0 - 0.6], [COL.x + COL.w + 1, -6, BEAM.z0 - 0.6], [COL.x + COL.w + 3, -2, 66]].map(at);
  out.push(`<path class="iso-line iso-cable" data-tone="mid" d="${k.pathOf(c)}"/>`);
  return out.join("");
}

function luminaire() {
  const out = [];
  const { x, y, w, d, z0, z1 } = LUM;
  // straps up to the beam
  for (const sy of [y - 2, y + d]) out.push(S(slab({ x: x + w / 2 - 2.5, y: sy, w: 5, d: 2 }, z0 + 3, BEAM.z0 - z0 - 3, 0.4, 0.2), { tone: "mid" }));
  out.push(S(slab({ x: x + w / 2 - 5, y: -7, w: 10, d: 14 }, BEAM.z0 - 1.6, 1.6, 0.4, 0.2), { tone: "mid" }));
  out.push(Dt([at([x + w / 2, y - 1, z0 + 6]), at([x + w / 2, y + d + 1, z0 + 6])], { size: 0.7, tone: "hi" }));
  // body
  out.push(S(slab({ x, y, w, d }, z0, z1 - z0, 2, 0.6), { tone: "hi", inner: L(k.sideSeam({ x, y, w, d, r: 2 }, z0 + 2.5, P), { tone: "faint" }) }));
  // fins
  for (let i = 0; i < 9; i++) {
    const fx = x + 4 + i * 5;
    out.push(S(slab({ x: fx, y: y + 2, w: 1.4, d: d - 4 }, z1, FIN_H, 0.3, 0), { tone: "hi" }));
  }
  // rating plate on the side
  const m = k.sideMatrix([x + 6, y + d + 0.01], z0 + 8.2, P, "left");
  out.push(`<g transform="${m}"><rect x="0" y="0" width="30" height="5.2" rx=".5" style="fill:var(--anatomy-paper);stroke:var(--anatomy-mid);stroke-width:.3"/><text class="iso-face-text" data-tone="mid" x="1.4" y="3.7" font-size="2.6">Ex tb IIIC T135°C</text></g>`);
  out.push(`<g data-part="lumdust"></g>`);
  return `<g data-part="lum">${out.join("")}</g>`;
}

const START = { dust: 0, mm: 3 };
const fig = k.figureSvg({
  width: W, height: H,
  label: "A dust-tight floodlight hangs under a steel beam in a dusty plant. Dust settles on top of the light, burying its cooling fins, and along the beam. A thick enough layer smoulders; a knock lifts a cloud that the smoulder lights, and the blast shakes the beam's dust into a bigger secondary explosion.",
  body: [plate(), column(), luminaire(), beam()],
});

const DATA = { W, H, camera: glCamera(P), P, DUSTS, MODEL, LUM, FIN_H, DUST_K, BEAM, COL, LAMP_C, start: START, pivots: { lum: at([LUM.x + LUM.w / 2, 0, BEAM.z0]), sacks: [at([74, -30, 0]), at([90, -24, 0])] } };

const GLSL = `
uniform float uLight;
uniform float uLamp;
uniform float uSmoulder;
uniform float uDustTop;
uniform float uCloud;
uniform float uPrimary;
uniform float uBoom;
uniform vec3 uDustCol;
const vec2 LC=vec2(${LAMP_C.map((v) => v.toFixed(1)).join(",")});
const vec4 LP=vec4(${LUM.x.toFixed(1)},${LUM.y.toFixed(1)},${(LUM.x + LUM.w).toFixed(1)},${(LUM.y + LUM.d).toFixed(1)});
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
void main(){
  vec2 vb=viewOf(gl_FragCoord.xy);
  vec4 o=vec4(0.);
  // the lamp: pool on the floor and a soft cone with dust motes
  if(uLamp>.002){
    vec3 f=onFloor(vb,0.);
    float r=length(f.xy-LC);
    float pool=exp(-pow(r/44.,2.))*.55;
    float cone=0.;
    for(int i=0;i<10;i++){
      float z=(float(i)+.5)*5.4;
      vec3 p=onFloor(vb,z);
      float rr=length(p.xy-LC), rad=14.+30.*(1.-z/56.);
      float w=exp(-pow(rr/rad,2.));
      float mote=step(.985,hash13(floor(p*vec3(.9,.9,.9))+floor(uTime*3.)))*.6;
      cone+=w*(.035+mote*.12);
    }
    o=over(lightInk((pool+cone)*uLamp),o);
  }
  // the layer smouldering: embers on top and a thread of smoke
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
      float rr=length(s.xy-c);
      smoke+=exp(-pow(rr/(3.+z*.08),2.))*fbm2(s.xy*.1+vec2(0.,-uTime*.6))*.35;
    }
    o=over(smokeInk(smoke*uSmoulder,mix(vec3(.55),vec3(.45),uLight)),o);
  }
  // a dust cloud shaken loose
  if(uCloud>.002){
    float d=0.;
    for(int i=0;i<10;i++){
      float z=8.+float(i)*8.;
      vec3 p=onFloor(vb,z);
      vec2 c=vec2(LC.x-20.,0.);
      float rr=length((p.xy-c)*vec2(.7,1.));
      float shape=exp(-pow(rr/(12.+22.*uCloud),2.))*exp(-pow((z-52.)/22.,2.));
      d+=shape*(.4+.8*fbm2(p.xy*.05+vec2(uTime*.2,0.)+z*.1));
    }
    float ef=smoothstep(0.,80.,min(min(vb.x,uView.x-vb.x),min(vb.y,uView.y-vb.y)));
    o=over(smokeInk(d*.7*uCloud*ef,uDustCol),o);
  }
  // primary: the cloud near the lamp goes
  if(uPrimary>0.){
    float c=uPrimary;
    vec2 dv=(vb-project(vec3(LC,52.)))/uK;
    float d=length(dv), R=10.+34.*(1.-exp(-c/.15));
    float n=fbm3(vec3(dv*.07,c*2.));
    float e=(exp(-pow((d-R*(.8+.3*n))/6.,2.))*1.2+(1.-smoothstep(R*.3,R*.9,d))*(.6+.6*n))*smoothstep(0.,.04,c)*exp(-c/.35);
    o=over(fireInk(e,clamp(1.2-c*2.,0.,1.)),o);
  }
  // secondary: the beam's dust, along its length
  if(uBoom>0.){
    float c=uBoom;
    vec2 a=project(vec3(-90.,0.,70.)), b=project(vec3(105.,0.,70.));
    float t=clamp(dot(vb-a,b-a)/dot(b-a,b-a),0.,1.);
    vec2 pr=a+(b-a)*t;
    float sweep=smoothstep(0.,.8,c*2.2-abs(t-.45)*1.4);
    float d=length(vb-pr-vec2(0.,-24.*uK*c))/uK;
    float R=10.+58.*(1.-exp(-c/.25));
    float n=fbm3(vec3((vb-pr)/uK*.045,c*1.6));
    float shell=exp(-pow((d-R*(.84+.28*n))/(7.+R*.13),2.));
    float core=(1.-smoothstep(R*.35,R*(.8+.25*n),d))*(.5+.7*n);
    float life=sweep*exp(-c/.7);
    vec3 fp=onFloor(vb,0.);
    float ring=exp(-pow((length(fp.xy-vec2(5.,0.))-(30.+380.*c))/6.,2.))*exp(-c/.32)*.6;
    float ef=smoothstep(0.,80.,min(min(vb.x,uView.x-vb.x),min(vb.y,uView.y-vb.y)));
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
const gl = glLayer({ canvas: stage.querySelector(".fx-gl"), fragment: ${JSON.stringify(GLSL)}, view: [D.W, D.H], camera: D.camera, uniforms: ["uLamp", "uSmoulder", "uDustTop", "uCloud", "uPrimary", "uBoom", "uDustCol"], fixed: { uLight: LIGHT } });
if (gl) stage.setAttribute("data-gl", "");

let dust = D.start.dust, mm = D.start.mm, lamp = false, lampLevel = 0, temp = 25;
let smoulder = 0, smoulderSince = null, knockAt = null, cloudAt = null, primaryAt = null, boomAt = null, cause = "";
let frame = 0, last = 0, now = 0, visible = false, touring = true, slow = false, tourClock = 0, tourStep = -1, tourEnd = 0, lastShot = "", pendingKnock = null;
const BOOM_END = 4.4;
const booming = () => primaryAt !== null || (boomAt !== null && now - boomAt < BOOM_END + 0.3);
const Dd = () => D.DUSTS[dust];
const tUnder = () => M.bare + M.perMm * mm;
const layerIgn = () => Dd().layer - (mm > 5 ? M.thickDrop * (mm - 5) : 0);
const tmax = () => Math.min(Dd().cloud * 2 / 3, Dd().layer - 75);

const lumG = q("lum"), lumDust = q("lumdust"), beamDust = q("beamdust"), floorDust = q("floordust"), flash = stage.querySelector(".fx-flash");
const sackGs = [...stage.querySelectorAll("[data-sack]")];
function applyDustColour() {
  const c = LIGHT ? Dd().light : Dd().colour;
  stage.style.setProperty("--dust", c[0]); stage.style.setProperty("--dust-top", c[1]);
}
let builtMm = null, builtDust = null;
function buildDust() {
  const Lm = D.LUM, h = Math.max(0.05, mm * D.DUST_K);
  let s = "";
  if (mm > 0.2) {
    // the layer settles between the fins first, then buries them
    s += solidSvg(slabOf({ x: Lm.x + 1, y: Lm.y + 1, w: Lm.w - 2, d: Lm.d - 2, r: 2 }, Lm.z1, h, P, 4, 0.6), { tone: "mid", crease: "none", className: "dust" });
  }
  lumDust.innerHTML = s;
  // fins poke through until buried
  lumG.querySelectorAll(".fin-hide").forEach((e) => e.remove());
  const b = D.BEAM;
  beamDust.innerHTML = mm > 0.2 ? solidSvg(slabOf({ x: b.x0 + 2, y: -6, w: b.x1 - b.x0 - 4, d: 12, r: 3 }, b.z0 + 14, Math.max(0.05, mm * D.DUST_K * 0.8), P, 4, 0.4), { tone: "mid", crease: "none", className: "dust" }) : "";
  builtMm = mm; builtDust = dust;
}

const ui = {
  dust: [...document.querySelectorAll("[data-dust]")], mm: document.querySelector("#mm"), mmOut: document.querySelector("#mm-out"),
  tFill: document.querySelector("#temp-fill"), tOut: document.querySelector("#temp-out"), mk: document.querySelector("#mark-t135"), lim: document.querySelector("#mark-limit"), ign: document.querySelector("#mark-ign"),
  lamp: document.querySelector("#lamp"), knock: document.querySelector("#knock"), clean: document.querySelector("#clean"), slow: document.querySelector("#slow"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"),
};
const sliding = {};
const tpos = (t) => (clamp((t - 20) / (520 - 20), 0, 1) * 100).toFixed(1) + "%";
function syncUi() {
  const g = Dd();
  ui.dust.forEach((b, i) => b.setAttribute("aria-pressed", String(i === dust)));
  if (!sliding.mm) ui.mm.value = mm;
  ui.mmOut.textContent = mm + " mm";
  ui.mmOut.dataset.bad = String(mm > 5);
  ui.tFill.style.width = tpos(temp);
  ui.tFill.dataset.state = temp >= layerIgn() ? "fire" : temp > tmax() ? "hot" : "ok";
  ui.tOut.textContent = Math.round(temp) + " °C";
  ui.mk.style.left = tpos(M.marked);
  ui.lim.style.left = tpos(tmax()); ui.lim.dataset.label = "limit " + Math.round(tmax());
  ui.ign.style.left = tpos(layerIgn()); ui.ign.dataset.label = "layer lights " + Math.round(layerIgn());
  ui.lamp.setAttribute("aria-pressed", String(lamp)); ui.lamp.textContent = lamp ? "LIGHT OFF" : "LIGHT ON";
  ui.slow.setAttribute("aria-pressed", String(slow));
  ui.tour.setAttribute("aria-pressed", String(touring));
}
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };

function knock() {
  if (booming() || cloudAt !== null) return;
  knockAt = now; cloudAt = now;
  if (smoulder > 0.6) { primaryAt = now + 0.55; say("The knock shook the dust into a cloud, and it drifted straight into the smouldering layer…"); }
  else say(mm > 0.2 ? "A cloud of " + Dd().name + ". The lamp's surface is only " + Math.round(temp) + " °C and this cloud needs about " + Dd().cloud + " °C to light, so it drifts and settles. It's the layer that's dangerous, not the cloud." : "Knock. Nothing on the beam to shake loose. Clean plant, boring plant.");
}

function step(dt) {
  lampLevel += ((lamp ? 1 : 0) - lampLevel) * (1 - Math.exp(-dt / 0.2));
  if (primaryAt !== null && now >= primaryAt && boomAt === null) {
    if (now - primaryAt > 0.45) { boomAt = now; cause = "secondary"; lamp = false;
      say("Boom, twice. The smouldering " + Dd().name + " lit the cloud (the primary), and that blast shook every beam in the plant into a much bigger cloud: the secondary. That's the one that flattens plants. Cleaning is safety equipment."); }
    return;
  }
  if (boomAt !== null) return;
  const target = lamp ? tUnder() : 25;
  temp += (target - temp) * (1 - Math.exp(-dt / M.tau));
  const ign = layerIgn();
  if (temp >= ign && mm > 0.2) {
    if (smoulderSince === null) smoulderSince = now;
    smoulder = Math.min(1, smoulder + dt * 0.5);
  } else {
    smoulder = Math.max(0, smoulder - dt * 0.4);
    if (smoulder === 0) smoulderSince = null;
  }
  if (cloudAt !== null && now - cloudAt > 4) cloudAt = null;
}

function chaos() {
  if (boomAt === null) return { c: -1, back: 0 };
  const c = now - boomAt;
  if (c < 0 || c > BOOM_END) return { c: -1, back: 0 };
  return { c, back: 1 - sm(3.2, 4.1, c) };
}
const tip = (c, delay, target) => { const u = Math.max(0, c - delay); return u <= 0 ? 0 : target * (1 - Math.exp(-u / 0.11) * Math.cos(u * 13)); };

function draw() {
  if (builtMm !== mm || builtDust !== dust) { buildDust(); applyDustColour(); }
  const K = chaos();
  // knock: the light swings on its straps
  const kAge = knockAt === null ? 99 : now - knockAt;
  const swing = kAge < 2 ? 6 * Math.exp(-kAge / 0.5) * Math.sin(kAge * 14) : 0;
  if (K.c >= 0) {
    const c = K.c;
    const fall = c < 0.9 ? 260 * c * c : 210;
    lumG.setAttribute("transform", "translate(" + (20 * Math.min(c, 0.9) * K.back).toFixed(1) + " " + (fall * K.back).toFixed(1) + ") rotate(" + (tip(c, 0.02, 30) * K.back).toFixed(1) + " " + D.pivots.lum[0].toFixed(1) + " " + D.pivots.lum[1].toFixed(1) + ")");
    sackGs.forEach((sg, i) => sg.setAttribute("transform", "rotate(" + (tip(c, 0.1 + i * 0.05, 70) * K.back).toFixed(1) + " " + D.pivots.sacks[i][0].toFixed(1) + " " + D.pivots.sacks[i][1].toFixed(1) + ")"));
    beamDust.style.opacity = String(1 - K.back * sm(0, 0.3, c));
    floorDust.style.opacity = String(1 - K.back * sm(0, 0.3, c));
    lumDust.style.opacity = String(1 - K.back * sm(0, 0.2, c));
    const A = 9 * Math.exp(-c / 0.4);
    stage.style.transform = "translate(" + (A * Math.sin(c * 90)).toFixed(1) + "px," + (A * Math.cos(c * 71)).toFixed(1) + "px)";
    flash.style.opacity = (0.85 * burst(c, 0.03, 0.25)).toFixed(3);
  } else if (boomAt !== null && now - boomAt > BOOM_END) {
    boomAt = null; primaryAt = null; smoulder = 0; smoulderSince = null; cloudAt = null; temp = 25; mm = 0;
    lumG.removeAttribute("transform"); sackGs.forEach((sg) => sg.removeAttribute("transform"));
    beamDust.style.opacity = ""; floorDust.style.opacity = ""; lumDust.style.opacity = "";
    stage.style.transform = ""; flash.style.opacity = "0";
    say("Reset, and the explosion did your housekeeping for you. Keep the layer thin and the light stays boring.");
  } else {
    lumG.setAttribute("transform", swing ? "rotate(" + swing.toFixed(2) + " " + D.pivots.lum[0].toFixed(1) + " " + D.pivots.lum[1].toFixed(1) + ")" : "");
    const A = kAge < 0.6 ? 3 * Math.exp(-kAge / 0.15) : 0;
    stage.style.transform = A > 0.05 ? "translate(" + (A * Math.sin(kAge * 80)).toFixed(1) + "px,0)" : "";
  }
  if (gl) {
    const c = LIGHT ? Dd().light[0] : Dd().colour[1];
    const cloud = cloudAt === null ? 0 : sm(0, 0.5, now - cloudAt) * (1 - sm(2.2, 4, now - cloudAt));
    const prim = primaryAt !== null && now >= primaryAt ? now - primaryAt : -1;
    gl.draw({ uLamp: K.c >= 0 ? 0 : lampLevel, uSmoulder: K.c >= 0 ? 0 : smoulder, uDustTop: D.LUM.z1 + mm * D.DUST_K + 0.1, uCloud: K.c >= 0 ? 0 : cloud, uPrimary: prim, uBoom: K.c, uDustCol: hex(c) }, now);
  }
  const text = K.c >= 0 ? (K.c < 3.2 ? "BOOM · secondary dust explosion" : "resetting…")
    : (primaryAt !== null ? "PRIMARY · cloud lit" : (lamp ? "ON · " : "OFF · ") + Dd().btn + " · " + mm + " mm · " + Math.round(temp) + " °C under the layer · " + (smoulder > 0 ? "SMOULDERING" : temp > tmax() ? "over the limit" : "fine"));
  if (readout.textContent !== text) readout.textContent = text;
  if (boomAt === null && primaryAt === null && (cloudAt === null || now - cloudAt > 3)) {
    const g = Dd();
    if (smoulder > 0.6) say("Smouldering. " + mm + " mm of " + g.name + " is insulating the light: it's " + Math.round(temp) + " °C under there, past the " + Math.round(layerIgn()) + " °C this layer lights at. No flame, no bang. Yet. All it needs now is a cloud.");
    else if (lamp && temp > tmax()) say("Over the limit. " + mm + " mm of " + g.name + " is acting like a blanket: " + Math.round(temp) + " °C under the layer, past the " + Math.round(tmax()) + " °C max for this dust" + (mm > 5 ? ", and the 5 mm rule doesn't even cover a layer this thick." : "."));
    else if (lamp) say("Light on, " + mm + " mm of " + g.name + " on top, " + Math.round(temp) + " °C under the layer. Fine.");
  }
}

const TOUR = [
  { dust: 0, mm: 3, lamp: true, knock: 3, hold: 7 },
  { dust: 0, mm: 16, lamp: true, knock: 7.5, hold: 13 },
  { dust: 2, mm: 22, lamp: true, knock: 5, hold: 8 },
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
      dust = s.dust; mm = s.mm; lamp = s.lamp; temp = 25; smoulder = 0; smoulderSince = null; cloudAt = null;
      pendingKnock = now + s.knock; tourEnd = tourClock + s.hold;
    }
    if (pendingKnock !== null && now >= pendingKnock) { pendingKnock = null; knock(); }
  }
  step(sdt);
  draw(); syncUi();
  const busy = touring || lamp || lampLevel > 0.01 || smoulder > 0 || cloudAt !== null || primaryAt !== null || boomAt !== null || Math.abs(temp - 25) > 0.5 || (knockAt !== null && now - knockAt < 2) || drag;
  frame = visible && busy ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { touring = false; pendingKnock = null; };
const guard = (fn) => (...a) => { takeOver(); if (booming()) return; fn(...a); run(); };
const setDust = guard((i) => { dust = i; smoulder = 0; });
const setMm = guard((v) => { mm = clamp(Math.round(v), 0, M.maxMm); });
const toggleLamp = guard(() => { lamp = !lamp; });
const doKnock = guard(() => knock());
const doClean = guard(() => { mm = 0; smoulder = 0; smoulderSince = null; say("Cleaned. No layer, nothing to insulate the light, nothing to smoulder, nothing to shake loose."); });
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;

ui.dust.forEach((b, i) => b.addEventListener("click", () => setDust(i)));
ui.mm.addEventListener("input", () => { sliding.mm = true; setMm(+ui.mm.value); });
ui.mm.addEventListener("change", () => { sliding.mm = false; run(); });
ui.lamp.addEventListener("click", toggleLamp);
ui.knock.addEventListener("click", doKnock);
ui.clean.addEventListener("click", doClean);
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; tourClock = 0; } else lamp = false; run(); });

let drag = null;
stage.addEventListener("pointerdown", (ev) => { drag = { x: ev.clientX, y: ev.clientY, from: mm, moved: false }; stage.setPointerCapture(ev.pointerId); });
stage.addEventListener("pointermove", (ev) => {
  if (!drag) return;
  const dy = drag.y - ev.clientY;
  if (!drag.moved && Math.hypot(dy, ev.clientX - drag.x) < 5) return;
  drag.moved = true;
  setMm(drag.from + dy / (stage.getBoundingClientRect().height * 0.5) * M.maxMm);
});
stage.addEventListener("pointerup", () => { if (!drag) return; const was = drag; drag = null; if (!was.moved) doKnock(); else run(); });
stage.addEventListener("pointercancel", () => { drag = null; });
stage.addEventListener("keydown", (ev) => {
  const map = { ArrowUp: () => setMm(mm + 1), ArrowDown: () => setMm(mm - 1), l: toggleLamp, " ": doKnock, Enter: doKnock, c: doClean, g: () => setDust((dust + 1) % D.DUSTS.length), s: () => { slow = !slow; run(); } };
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
.dust .iso-fill,.dust .iso-shade{fill:var(--dust,#555)}.dust .iso-top{fill:var(--dust-top,#666)}
.ctl{display:grid;gap:12px;margin:14px 0 6px;font-family:var(--anatomy-mono);font-size:12px;color:var(--anatomy-mid)}
.ctl-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ctl-label{min-width:64px;text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:var(--anatomy-lo)}
.ctl button{font:inherit;color:var(--anatomy-mid);background:transparent;border:1px solid var(--anatomy-lo);border-radius:6px;padding:7px 10px;cursor:pointer;line-height:1.15;text-align:left;min-height:36px}
.ctl button:hover{border-color:var(--anatomy-mid)}
.ctl button[aria-pressed="true"]{color:var(--anatomy-lit);border-color:var(--anatomy-lit)}
.ctl button small{display:block;font-size:10px;color:var(--anatomy-lo)}
.ctl #lamp{border-color:var(--anatomy-lit);color:var(--anatomy-lit);font-weight:600;letter-spacing:.06em;min-width:104px;text-align:center}
.ctl #lamp[aria-pressed="true"]{background:var(--anatomy-lit);color:var(--anatomy-paper)}
.ctl #knock{border-color:#ff6a3d;color:#ff6a3d;font-weight:600;letter-spacing:.06em}
.slide{position:relative;flex:1;min-width:110px;padding-top:16px}
.slide input{width:100%;accent-color:var(--anatomy-lit);margin:0}
.ctl output{min-width:72px;text-align:right;color:var(--anatomy-hi,var(--anatomy-mid))}
.ctl output[data-bad="true"]{color:#ff6a3d}
.notch{position:absolute;top:0;bottom:-2px;width:0;border-left:2px solid var(--anatomy-mid);pointer-events:none}
.notch::after{content:attr(data-label);position:absolute;top:0;left:4px;font-size:10px;white-space:nowrap;color:var(--anatomy-mid)}
.meter{position:relative;flex:1;min-width:110px;height:10px;margin-top:28px;border:1px solid var(--anatomy-lo);border-radius:5px}
#temp-fill{position:absolute;left:0;top:0;bottom:0;border-radius:4px;background:var(--anatomy-mid);transition:width .1s}
#temp-fill[data-state="hot"]{background:#ffb347}
#temp-fill[data-state="fire"]{background:#ff5a2a}
.mark{position:absolute;bottom:-3px;width:0;pointer-events:none;transition:left .3s}
.mark::after{content:attr(data-label);position:absolute;top:0;left:4px;font-size:10px;white-space:nowrap}
#mark-t135{top:-14px;border-left:1px solid var(--anatomy-mid)}#mark-t135::after{color:var(--anatomy-mid)}
#mark-limit{top:-14px;border-left:1px dashed var(--anatomy-lit)}#mark-limit::after{color:var(--anatomy-lit)}
#mark-ign{top:-28px;border-left:1px dashed #ff6a3d}#mark-ign::after{color:#ff6a3d}
#shot{min-height:3.8em;font-size:12px;line-height:1.4}
@media (max-width:520px){.ctl-label{min-width:48px}.ctl button{padding:7px 8px}.ctl output{min-width:60px}.ctl button small{display:none}}`;

const stageHtml = `<div class="iso-stage fx-stage" tabindex="0" role="slider" aria-label="Dust layer: drag up and down or arrow keys; L toggles the light; space knocks the column; C cleans" aria-valuemin="0" aria-valuemax="${MODEL.maxMm}" aria-valuenow="${START.mm}">${fig}<canvas class="fx-layer fx-gl" aria-hidden="true"></canvas><div class="fx-flash" aria-hidden="true"></div></div>`;

const CONTROLS = `<div class="ctl" role="group" aria-label="Test controls">
  <div class="ctl-row"><span class="ctl-label">Dust</span>${DUSTS.map((d, i) => `<button type="button" data-dust="${i}" aria-pressed="${i === START.dust}">${d.btn}<small>layer ${d.layer} · cloud ${d.cloud} °C</small></button>`).join("")}</div>
  <div class="ctl-row"><span class="ctl-label">Layer</span><div class="slide"><span class="notch" data-label="5 mm rule" style="left:${(5 / MODEL.maxMm * 100).toFixed(1)}%"></span><input id="mm" type="range" min="0" max="${MODEL.maxMm}" step="1" value="${START.mm}" aria-label="Dust layer thickness in mm"></div><output id="mm-out">${START.mm} mm</output></div>
  <div class="ctl-row"><span class="ctl-label">Under layer</span><div class="meter" aria-hidden="true"><span id="temp-fill"></span><span id="mark-t135" class="mark" data-label="T135"></span><span id="mark-limit" class="mark" data-label="limit"></span><span id="mark-ign" class="mark" data-label="layer lights"></span></div><output id="temp-out">25 °C</output></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="lamp" aria-pressed="false">LIGHT ON</button><button type="button" id="knock">KNOCK</button><button type="button" id="clean">Clean</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
  <div id="shot" aria-live="polite">Pick a dust, let it pile up on the light, switch it on, then give the column a knock.</div>
</div>`;

const card = k.plateHtml({
  fig: "Fig 7",
  title: "Ex t, dust on the light",
  hint: "Drag: dust · tap: knock",
  readout: "",
  keys: [
    { mark: "lit", label: "The light, the smoulder, the clouds" },
    { mark: "raised", label: "Floodlight, beam, column and the dust on all of them" },
  ],
  caption: "A dust-tight light is marked with its maximum surface temperature, T135 °C here. That number assumes no more than 5 mm of dust on it. Pile on more and the layer insulates the light, so it runs hotter underneath while the thicker layer lights at a lower temperature. Eventually it smoulders. Smouldering dust is quiet, until something knocks a cloud loose: the smoulder lights the cloud, and that blast shakes the dust off every beam into a far bigger secondary explosion.",
  body: stageHtml,
});

const other = theme === "light" ? ["index.html", "Dark version"] : ["light.html", "Light version"];
const FOOT = `<p style="font-family:var(--anatomy-mono);font-size:11px;color:var(--anatomy-lo);margin:28px 0 8px;line-height:1.6">A toy, not a certified anything. The IEC 60079-14 rule (Tmax = the lower of ⅔ × cloud ignition temperature and 5 mm layer ignition temperature − 75 K, layers up to 5 mm) and the dust ignition temperatures (literature values) are real; how hot the light runs under the dust and how fast it all happens are made up.<br>Built with <a href="https://github.com/wheresryan22/anatomy" style="color:inherit">Anatomy</a> by Ryan (MIT). · <a href="${other[0]}" style="color:inherit">${other[1]}</a> · <a href="../" style="color:inherit">More figures</a> · <a href="https://github.com/Dizzyfer/Anatomy/tree/main/ex-t-dust" style="color:inherit">Source</a></p>`;
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "Ex t dust", theme, body: `<style>${CSS}</style>${card.replace("<figcaption", CONTROLS + "<figcaption")}${FOOT}`, script: kitScript() + glScript() + LIVE.replace("__DATA__", JSON.stringify(DATA)), width: 700 }));
console.log("wrote", name);
