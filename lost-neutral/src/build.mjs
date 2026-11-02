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

// Truth: 400/230 V three-phase four-wire; AS 60038 puts 230 V at +10 % / −6 % (216 to 253 V). Lose the neutral and each row's
// voltage is set by where the star point floats, which depends on the load on each phase (Millman). Toy simplification: running drivers
// are modelled as fixed loads (a PFC front end looks roughly resistive); real constant-power regulation can make it worse. Narrow drivers are typically specified 198 to 264 V; wide-range ones (Mean Well HLG style) 90 to 305 V.
// Toy: the dropout points, how fast they die above their rating, the MOV failing short and tripping the row, the loose joint.
const MODEL = {
  P: 150, standby: 2, tauV: 0.05, rSolid: 0.1,
  drv: {
    narrow: { name: "198 to 264 V", lim: 198, min: 198, max: 264, off: 150, on: 165, flick: 180, s0: 266, sk: 10 },
    wide: { name: "90 to 305 V", lim: 180, min: 90, max: 305, off: 80, on: 88, flick: 90, s0: 312, sk: 12 },
  },
};

const ROWS_Y = [-30, 0, 30];
const COLS_X = [-38, -10, 18, 46];
const ZB = 98, ZL = 80;
const PLATE = { x: -82, y: -62, w: 182, d: 124, r: 8 };
const PLATE_H = 12, FOOT_H = 5;
const DB = { x: 78, y: -26, w: 12, d: 46 };
const DBZ = 70;
const POSTS = [[-60, -46], [-60, 46], [68, -46], [68, 46]];

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [-60, -46, ZB + 6], [68, 46, ZB + 6], [DB.x + DB.w, DB.y + DB.d, DBZ + 4], [-60, 46, ZB + 6]],
  W, H, { pad: 18, azimuth: 45 },
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

function board() {
  const out = [];
  out.push(`<path class="iso-halo" d="${k.haloOf({ ...k.insetPlan({ ...DB, r: 1 }, -3) }, 0, 0.1, P)}"/>`);
  out.push(S(slab(DB, 0, DBZ, 1, 0.5), { tone: "hi" }));
  const m = k.sideMatrix([DB.x + DB.w + 0.02, DB.y + DB.d - 1], DBZ - 4, P, "right");
  const brk = (x, ph) => `<g data-part="mcb-${ph}" class="mcb" data-on="true"><rect x="${x}" y="8" width="5" height="10" rx=".5"/><rect class="tog" x="${x + 1.5}" y="10" width="2" height="3" rx=".3"/><text class="iso-face-text" data-tone="lo" x="${x + 2.5}" y="21" font-size="1.8" text-anchor="middle">L${ph + 1}</text></g>`;
  out.push(`<g transform="${m}">
    <text class="iso-face-text" data-tone="lo" x="3" y="4.4" font-size="2.6">DB-LIGHTING  400/230 V</text>
    ${brk(6, 0)}${brk(14, 1)}${brk(22, 2)}
    <rect x="4" y="27" width="32" height="5" rx=".6" class="nbar"/>
    <text class="iso-face-text" data-tone="lo" x="4" y="36" font-size="2">NEUTRAL LINK</text>
    <g data-part="nterm"><circle cx="27" cy="29.5" r="1.8" class="screw"/><path data-part="nslot" d="M25.6 29.5h2.8" class="slot"/></g>
  </g>`);
  return out.join("");
}

// screen position of the neutral terminal (for the arc glow)
// local (27, 29.5) on the face: x runs along −y from DB.y + DB.d − 1, y runs down from DBZ − 4
const NT = [DB.x + DB.w + 0.5, DB.y + DB.d - 1 - 27, DBZ - 4 - 29.5];

const PH = ["l1", "l2", "l3"];
function cables() {
  const out = [];
  const up = (dx, cls) => {
    const sx = DB.x + DB.w / 2, sy = DB.y + 10 + dx;
    const pts = [[sx, sy, DBZ], [sx, sy, ZB + 2.6], [64, sy, ZB + 2.6]].map(at);
    return `<path class="cab ${cls}" d="${k.pathOf(pts)}"/>`;
  };
  out.push(up(-4.5, "l1"), up(-1.5, "l2"), up(1.5, "l3"), `<g data-part="nwire">${up(4.5, "nn")}</g>`);
  return out.join("");
}

function frame() {
  const out = [];
  const post = ([x, y]) => S(slab({ x: x - 1.6, y: y - 1.6, w: 3.2, d: 3.2 }, 0, ZB, 0.4, 0.2), { tone: "mid" });
  for (const p of POSTS.filter(([x, y]) => depth2([x, y]) < depth2([0, 0]))) out.push(post(p));
  for (const x of [-60, 68]) out.push(S(slab({ x: x - 2, y: -48, w: 4, d: 96 }, ZB, 3, 0.4, 0.2), { tone: "mid" }));
  return out.join("");
}

function lum(r, c) {
  const x = COLS_X[c], y = ROWS_Y[r], i = r * 4 + c, out = [];
  out.push(S(k.cylinder(x, y, 0.6, ZL + 6, ZB - ZL - 6, P, 10), { tone: "mid" }));
  out.push(`<g class="drv">${S(slab({ x: x + 2, y: y - 2.5, w: 7, d: 5 }, ZB - 3, 2.6, 0.4, 0.2), { tone: "hi" })}</g>`);
  out.push(S(k.cylinder(x, y, 8, ZL + 2, 4, P, 32, 1.2), { tone: "hi", inner: L(k.sideArc(x, y, 8, ZL + 4, P, 24), { tone: "faint" }) }));
  out.push(S(k.cylinder(x, y, 3, ZL + 6, 1.4, P, 20, 0.3), { tone: "hi" }));
  out.push(`<path class="lens" d="${k.sideArc(x, y, 7.6, ZL + 1.6, P, 28)}"/>`);
  return `<g class="lum" data-lum="${i}" data-st="on">${out.join("")}</g>`;
}

function rows() {
  const out = [];
  for (let r = 0; r < 3; r++) {
    out.push(`<g class="beam ph-${PH[r]}">${S(slab({ x: -62, y: ROWS_Y[r] - 1.5, w: 132, d: 3 }, ZB - 0.2, 2.4, 0.3, 0.1), { tone: "mid" })}</g>`);
    out.push(`<path class="cab ${PH[r]}" d="${k.pathOf([[-60, ROWS_Y[r] + 2, ZB + 2.6], [60, ROWS_Y[r] + 2, ZB + 2.6]].map(at))}"/>`);
    out.push(`<path class="cab nn" d="${k.pathOf([[-60, ROWS_Y[r] - 2, ZB + 2.6], [60, ROWS_Y[r] - 2, ZB + 2.6]].map(at))}"/>`);
    for (let c = 0; c < 4; c++) out.push(lum(r, c));
    out.push(k.faceTextSvg(k.sideMatrix([-61.98, ROWS_Y[r] + 4], ZB + 1.8, P, "right"), "L" + (r + 1), { size: 2.6, tone: "mid" }));
  }
  // the shared neutral run along the side, back to the board
  out.push(`<path class="cab nn" d="${k.pathOf([[64, -32, ZB + 2.6], [64, 32, ZB + 2.6]].map(at))}"/>`);
  for (let r = 0; r < 3; r++) out.push(`<path class="cab ${PH[r]}" d="${k.pathOf([[64, -20 + r * 2, ZB + 2.6], [64, ROWS_Y[r] + 2, ZB + 2.6], [60, ROWS_Y[r] + 2, ZB + 2.6]].map(at))}"/>`);
  for (const p of POSTS.filter(([x, y]) => depth2([x, y]) >= depth2([0, 0]))) out.push(S(slab({ x: p[0] - 1.6, y: p[1] - 1.6, w: 3.2, d: 3.2 }, 0, ZB, 0.4, 0.2), { tone: "mid" }));
  return out.join("");
}

const floorSvg = k.figureSvg({
  width: W, height: H,
  label: "A lighting gantry over a warehouse floor: twelve LED high bays in three rows, each row on its own phase, all sharing one neutral back to the lighting distribution board, which has three breakers and a neutral link.",
  body: [plate()],
});
const layer = (body) => `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg fx-layer" viewBox="0 0 ${W} ${H}" aria-hidden="true">${body}</svg>`;
const topSvg = layer([board(), cables(), frame(), rows()].join(""));

const LUMS = [];
for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) LUMS.push([COLS_X[c], ROWS_Y[r]]);
const DATA = { W, H, camera: glCamera(P), P, MODEL, LUMS };

const SHARED = `
uniform float uLight;
uniform float uB[12];
uniform float uPop[12];
uniform float uSmoke[12];
uniform float uArc;
uniform float uJoint;
const vec2 LP[12]=vec2[12](${LUMS.map(([x, y]) => `vec2(${x.toFixed(1)},${y.toFixed(1)})`).join(",")});
vec4 inkFor(vec3 seen,float cover){vec3 ab=1.-seen;float a=max(max(ab.r,max(ab.g,ab.b)),cover);return vec4(vec3(a)-ab,a);}
vec4 over(vec4 t,vec4 u){return t+u*(1.-t.a);}
vec4 glowInk(vec3 hue,float e){vec3 c=tonemap(hue*e,1.3);float a=max(c.r,max(c.g,c.b));float la=1.-exp(-1.4*e);return mix(vec4(c,a),inkFor(mix(vec3(1.),hue*.8,la),0.)*la,uLight);}
vec4 smokeInk(float h){float a=(1.-exp(-h))*mix(.55,.45,uLight);return vec4(mix(vec3(.32,.3,.28),vec3(.22,.2,.18),uLight)*a,a);}
`;
// GLSL ES 1.0 has no array constructors, so unroll the positions
const unroll = (fn) => LUMS.map(([x, y], i) => fn(`vec2(${x.toFixed(1)},${y.toFixed(1)})`, i)).join("\n");

const FLOOR = SHARED.replace(/const vec2 LP.*\n/, "") + `
void main(){
  vec2 vb=viewOf(gl_FragCoord.xy);
  vec3 p=onFloor(vb,0.);
  float inPlate=step(${(PLATE.x + 4).toFixed(1)},p.x)*step(p.x,${(PLATE.x + PLATE.w - 4).toFixed(1)})*step(${(PLATE.y + 4).toFixed(1)},p.y)*step(p.y,${(PLATE.y + PLATE.d - 4).toFixed(1)});
  float e=0.;
${unroll((v, i) => `  e+=uB[${i}]*exp(-pow(length(p.xy-${v})/17.,2.));`)}
  vec4 o=glowInk(mix(vec3(1.,.93,.82),vec3(1.,.8,.45),uLight),e*mix(.55,.8,uLight)*inPlate);
  o.rgb=min(o.rgb,vec3(o.a));
  gl_FragColor=o;
}`;

const FX = SHARED.replace(/const vec2 LP.*\n/, "") + `
void main(){
  vec2 vb=viewOf(gl_FragCoord.xy);
  vec4 o=vec4(0.);
  float cone=0.,pop=0.,smk=0.;
${unroll((v, i) => `  {
    vec2 a=project(vec3(${v},${(ZL + 1).toFixed(1)})),b=project(vec3(${v},0.));
    vec2 ab=b-a;float h=clamp(dot(vb-a,ab)/dot(ab,ab),0.,1.);
    float w=(3.+h*16.)*uK;
    cone+=uB[${i}]*exp(-pow(length(vb-a-ab*h)/w,2.))*(1.-h)*.35+uB[${i}]*exp(-pow(length(vb-a)/(5.*uK),2.))*.9;
    if(uPop[${i}]>.002) pop+=uPop[${i}]*(exp(-pow(length(vb-a)/(1.6*uK),2.))*2.4+exp(-pow(length(vb-a)/(10.*uK),2.))*.7);
    if(uSmoke[${i}]>.002){vec2 d=(vb-a)/uK;float up=-d.y;smk+=uSmoke[${i}]*exp(-pow(d.x/(3.+up*.3),2.))*smoothstep(-2.,4.,up)*exp(-up/28.)*smoothstep(.35,.8,fbm2(vec2(d.x*.15,up*.1-uTime*1.5)+${(i * 1.7).toFixed(1)}));}
  }`)}
  o=smokeInk(smk*1.4);
  o=over(glowInk(vec3(1.,.93,.82),cone),o);
  o=over(glowInk(vec3(.62,.78,1.),pop),o);
  if(uArc+uJoint>.002){
    vec2 d=(vb-project(vec3(${NT.map((v) => v.toFixed(1)).join(",")})))/uK;
    float fl=.5+.5*noise2(vec2(uTime*40.,3.));
    o=over(glowInk(vec3(1.,.4,.1),exp(-pow(length(d)/3.,2.))*uJoint*1.4),o);
    o=over(glowInk(vec3(.62,.78,1.),(exp(-pow(length(d)/.8,2.))*2.+exp(-pow(length(d)/5.,2.))*.5)*uArc*fl),o);
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
const U = ["uB", "uPop", "uSmoke", "uArc", "uJoint"];
const floor = glLayer({ canvas: stage.querySelector(".fx-floor"), fragment: ${JSON.stringify(FLOOR)}, view: [D.W, D.H], camera: D.camera, uniforms: U, fixed: { uLight: LIGHT } });
const fx = glLayer({ canvas: stage.querySelector(".fx-top"), fragment: ${JSON.stringify(FX)}, view: [D.W, D.H], camera: D.camera, uniforms: U, fixed: { uLight: LIGHT } });
const GL = !!(floor && fx);
if (GL) stage.setAttribute("data-gl", "");

// phasors: 230 V at 0, −120, +120
const SRC = [0, -120, 120].map((a) => [230 * Math.cos(a * Math.PI / 180), 230 * Math.sin(a * Math.PI / 180)]);
let neutral = "solid", drvKind = "narrow", counts = [4, 2, 1];
let rowShow = [230, 230, 230], lums = [], mcb = [true, true, true], rowV = [230, 230, 230], vn = [0, 0], inA = 0, rn = M.rSolid, rnNext = 0, arc = 0, joint = 0;
let frame = 0, last = 0, now = 0, visible = false, touring = true, slow = false, tourClock = 0, tourStep = -1, actions = [], lastShot = "", lastEvent = "", lastEventAt = -10;
function fresh() { lums = Array.from({ length: 12 }, () => ({ st: "on", v: 230, stress: 0, popAt: null })); mcb = [true, true, true]; lastEvent = ""; }
fresh();
const DRV = () => M.drv[drvKind];
const rowOf = (i) => Math.floor(i / 4);
const switched = (i) => (i % 4) < counts[rowOf(i)];
const event = (t) => { lastEvent = t; lastEventAt = now; };

function step(dt) {
  const d = DRV();
  // the neutral: solid, a loose joint that makes and breaks, or gone
  if (neutral === "loose") {
    if (now >= rnNext) { const r = Math.random(); rn = r < 0.25 ? 1e6 : r < 0.5 ? 40 : r < 0.75 ? 12 : 3; rnNext = now + 0.08 + Math.random() * 0.35; if (rn > 1e5) arc = 1; }
  } else rn = neutral === "solid" ? M.rSolid : 1e9;
  arc *= Math.exp(-dt / 0.08);
  // each row is a conductance that depends on the voltage it sees (constant power)
  const G = [0, 0, 0];
  lums.forEach((l, i) => {
    const r = rowOf(i);
    if (!mcb[r] || !switched(i) || l.st === "dead") return;
    // a running driver's PFC front end looks roughly like a resistor; dropped out, it's a tiny load
    G[r] += (l.st === "on" || l.st === "flick" ? M.P : M.standby) / (230 * 230);
  });
  const yn = 1 / rn;
  const sg = G[0] + G[1] + G[2] + yn;
  const nv = [(G[0] * SRC[0][0] + G[1] * SRC[1][0] + G[2] * SRC[2][0]) / sg, (G[0] * SRC[0][1] + G[1] * SRC[1][1] + G[2] * SRC[2][1]) / sg];
  vn = nv;
  rowV = SRC.map((s, r) => (mcb[r] ? Math.hypot(s[0] - vn[0], s[1] - vn[1]) : 0));
  rowShow = rowShow.map((v, r) => v + (rowV[r] - v) * (1 - Math.exp(-dt / 0.12)));
  inA = Math.hypot(vn[0], vn[1]) * yn;
  joint += ((neutral === "loose" && rn < 1e5 ? inA * inA * rn : 0) / 40 - joint) * (1 - Math.exp(-dt / 1.2));
  // each driver
  lums.forEach((l, i) => {
    const r = rowOf(i);
    if (l.st === "dead") return;
    const live = mcb[r] && switched(i);
    const target = live ? rowV[r] : 0;
    l.v += (target - l.v) * (1 - Math.exp(-dt / M.tauV));
    if (!live) { l.st = "idle"; return; }
    if (l.st === "idle") l.st = l.v > d.on ? "on" : "off";
    if (l.v < d.off) l.st = "off";
    else if (l.st === "off" && l.v > d.on) l.st = "on";
    if (l.st !== "off") l.st = l.v < d.flick ? "flick" : "on";
    if (l.v > d.s0) l.stress += Math.pow((l.v - d.s0) / d.sk, 2) * dt;
    if (l.stress >= 1) {
      l.st = "dead"; l.popAt = now;
      if (mcb[r]) { mcb[r] = false; event("A driver on L" + (r + 1) + " saw " + Math.round(l.v) + " V, way past its " + d.max + " V rating. Its surge MOV failed short and tripped the L" + (r + 1) + " breaker, so the whole row's gone dark."); }
    }
  });
}

const lumG = [...stage.querySelectorAll("[data-lum]")];
const mcbG = [0, 1, 2].map((r) => q("mcb-" + r)), nterm = q("nterm"), nslot = q("nslot"), nwire = q("nwire");
const ui = {
  n: [...document.querySelectorAll("[data-n]")], drv: [...document.querySelectorAll("[data-drv]")],
  rows: [0, 1, 2].map((r) => document.querySelector("#row" + r)), rowsOut: [0, 1, 2].map((r) => document.querySelector("#row" + r + "-out")),
  fills: [0, 1, 2].map((r) => document.querySelector("#v" + r + "-fill")), outs: [0, 1, 2].map((r) => document.querySelector("#v" + r + "-out")), maxMarks: [...document.querySelectorAll(".maxmark")],
  stats: document.querySelector("#stats"), fresh: document.querySelector("#fresh"), slow: document.querySelector("#slow"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"),
};
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };
const vPct = (v) => (clamp(v / 420, 0, 1) * 100).toFixed(1) + "%";

function syncUi() {
  const d = DRV();
  ui.n.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.n === neutral)));
  ui.drv.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.drv === drvKind)));
  for (let r = 0; r < 3; r++) {
    ui.rows[r].value = counts[r]; ui.rowsOut[r].textContent = counts[r] + " on";
    const v = rowShow[r];
    ui.fills[r].style.width = vPct(v);
    ui.fills[r].dataset.state = !mcb[r] ? "off" : v > d.max ? "bad" : v < d.min || v > 253 ? "warn" : "ok";
    ui.outs[r].textContent = mcb[r] ? Math.round(v) + " V" : "TRIPPED";
  }
  ui.maxMarks.forEach((m) => { m.style.left = vPct(d.max); m.dataset.label = d.max + " V driver max"; });
  const dead = lums.filter((l) => l.st === "dead").length;
  ui.stats.innerHTML = "star point shifted <b>" + Math.round(Math.hypot(vn[0], vn[1])) + " V</b> · neutral current <b>" + (neutral === "broken" ? "none" : inA.toFixed(1) + " A") + "</b>" + (neutral === "loose" ? " · joint <b>" + Math.round(joint * 40) + " W</b>" : "") + " · drivers dead <b>" + dead + "</b>";
  ui.slow.setAttribute("aria-pressed", String(slow)); ui.tour.setAttribute("aria-pressed", String(touring));
}

function draw() {
  lumG.forEach((g, i) => {
    const l = lums[i];
    const st = !switched(i) || !mcb[rowOf(i)] ? (l.st === "dead" ? "dead" : "idle") : l.st;
    if (g.dataset.st !== st) g.dataset.st = st;
  });
  mcbG.forEach((g, r) => (g.dataset.on = String(mcb[r])));
  nterm.dataset.state = neutral; nwire.style.opacity = neutral === "broken" ? "0.25" : "1";
  nslot.setAttribute("transform", neutral === "loose" ? "rotate(" + (35 + 20 * Math.sin(now * 3)).toFixed(0) + " 27 29.5)" : "");
  const B = lums.map((l, i) => {
    if (!switched(i) || !mcb[rowOf(i)] || l.st === "dead" || l.st === "off" || l.st === "idle") return 0;
    if (l.st === "flick") return Math.random() < 0.5 ? 0.15 : 0.9;
    return 1;
  });
  if (GL && !window.__noGL) {
    const u = {
      uB: B,
      uPop: lums.map((l) => (l.popAt === null ? 0 : Math.exp(-(now - l.popAt) / 0.15) * (now - l.popAt < 1 ? 1 : 0))),
      uSmoke: lums.map((l) => (l.popAt === null ? 0 : Math.exp(-(now - l.popAt) / 6))),
      uArc: arc, uJoint: clamp(joint, 0, 1.5),
    };
    floor.draw(u, now); fx.draw(u, now);
  }
  const text = rowShow.map((v, r) => "L" + (r + 1) + " " + (mcb[r] ? Math.round(v) + " V" : "off")).join(" · ") + " · neutral " + neutral;
  if (readout.textContent !== text) readout.textContent = text;
}

function story() {
  const d = DRV();
  if (now - lastEventAt < 3.5 && lastEvent) return say(lastEvent);
  const live = [0, 1, 2].filter((r) => mcb[r] && counts[r] > 0);
  const dead = lums.filter((l) => l.st === "dead").length;
  if (neutral === "solid") return say(dead ? dead + " drivers dead from before, " + (mcb.some((m) => !m) ? "and a breaker's still tripped. " : "") + "Hit Replace to fit new ones." : "Neutral solid: every row gets its 230 V whatever the others are doing, and the neutral carries the out-of-balance current back. Now break it.");
  if (neutral === "loose") return say("A loose neutral: the joint makes and breaks and arcs, so the star point jumps about and the lights flicker and surge. The joint cooks itself on the neutral current. This is how most lost neutrals start.");
  if (live.length === 0) return say("All dark. " + dead + " drivers dead, " + mcb.filter((m) => !m).length + " breakers tripped, from one loose screw on the neutral link.");
  if (live.length === 2 && mcb.some((m) => !m)) return say("With a row tripped and no neutral, the other two rows are in series across 400 V, shared by how much each draws. " + live.map((r) => "L" + (r + 1) + " " + Math.round(rowShow[r]) + " V").join(", ") + ".");
  const RV = rowShow, hi = [0, 1, 2].reduce((a, r) => (RV[r] > RV[a] ? r : a), 0), lo = [0, 1, 2].reduce((a, r) => (RV[r] < RV[a] ? r : a), 0);
  if (RV[hi] - RV[lo] < 15) return say("No neutral, but the rows are balanced, so the star point sits in the middle and nothing looks wrong. It's a time bomb: switch one row down and watch.");
  return say("No neutral, so the star point floats toward the heaviest row. L" + (lo + 1) + " (" + counts[lo] + " on) drops to " + Math.round(RV[lo]) + " V, L" + (hi + 1) + " (" + counts[hi] + " on) climbs to " + Math.round(RV[hi]) + " V." + (RV[hi] > d.max ? " That's past the " + d.max + " V the drivers are rated for." : RV[hi] > 253 ? " Above 253 V but inside these drivers' " + d.max + " V." : ""));
}

const TOUR = [
  { n: "solid", drv: "narrow", c: [4, 2, 1], acts: [[5, "end"]] },
  { n: "solid", drv: "narrow", c: [4, 2, 1], acts: [[1, "break"], [14, "end"]] },
  { n: "solid", drv: "narrow", c: [4, 4, 4], acts: [[1, "break"], [6, "c3"], [16, "end"]] },
  { n: "solid", drv: "narrow", c: [4, 3, 2], acts: [[1, "loose"], [10, "end"]] },
  { n: "solid", drv: "narrow", c: [4, 4, 2], acts: [[1, "break"], [9, "end"]] },
  { n: "solid", drv: "wide", c: [4, 4, 2], acts: [[1, "break"], [9, "end"]] },
];
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
      neutral = s.n; drvKind = s.drv; counts = [...s.c]; fresh();
      actions = s.acts.map(([w, a]) => [tourClock + w, a]);
    }
    while (actions.length && tourClock >= actions[0][0]) {
      const a = actions.shift()[1];
      if (a === "break") neutral = "broken"; else if (a === "loose") neutral = "loose"; else if (a === "c3") counts = [4, 4, 1]; else if (a === "end") actions = [];
    }
  }
  const n = 12;
  for (let i = 0; i < n; i++) step(sdt / n);
  draw(); syncUi(); story();
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { touring = false; actions = []; };
const guard = (fn) => (...a) => { takeOver(); fn(...a); run(); };
const setN = guard((v) => { neutral = v; });
const setDrv = guard((v) => { drvKind = v; fresh(); });
const setRow = guard((r, v) => { counts[r] = v; });
const doFresh = guard(() => fresh());
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;

ui.n.forEach((b) => b.addEventListener("click", () => setN(b.dataset.n)));
ui.drv.forEach((b) => b.addEventListener("click", () => setDrv(b.dataset.drv)));
ui.rows.forEach((el, r) => el.addEventListener("input", () => setRow(r, +el.value)));
ui.fresh.addEventListener("click", doFresh);
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; tourClock = 0; actions = []; } run(); });
stage.addEventListener("click", () => setN(neutral === "solid" ? "broken" : "solid"));
stage.addEventListener("keydown", (ev) => {
  const map = { " ": () => setN(neutral === "solid" ? "broken" : "solid"), n: () => setN(neutral === "solid" ? "loose" : neutral === "loose" ? "broken" : "solid"), w: () => setDrv(drvKind === "narrow" ? "wide" : "narrow"), r: doFresh, "1": () => setRow(0, (counts[0] + 1) % 5), "2": () => setRow(1, (counts[1] + 1) % 5), "3": () => setRow(2, (counts[2] + 1) % 5), s: () => { slow = !slow; run(); } };
  if (map[ev.key]) { ev.preventDefault(); map[ev.key](); }
});
window.__fig = { freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
draw(); syncUi(); story();
`;

const CSS = `.fx-stage{position:relative;cursor:pointer}
.fx-layer{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.fx-gl{display:block}
body[data-theme="dark"] .fx-gl{mix-blend-mode:screen}
.iso-plate{overflow:hidden}
.cab{fill:none;stroke-width:1.1;stroke-linecap:round;stroke-linejoin:round}
.cab.l1{stroke:#d9534f}.cab.l2{stroke:#e8e8e4}.cab.l3{stroke:#3d7bd9}.cab.nn{stroke:#0e0e0e}
body[data-theme="light"] .cab.l2{stroke:#b9b9b4}body[data-theme="light"] .cab.nn{stroke:#222}
body[data-theme="dark"] .cab.nn{stroke:#5a5a5a;stroke-dasharray:none}
.lens{fill:none;stroke:var(--anatomy-mid);stroke-width:1.2;stroke-linecap:round}
.lum[data-st="on"] .lens{stroke:#fff1c8}.lum[data-st="flick"] .lens{stroke:#d8c690}
.lum[data-st="dead"] .iso-fill,.lum[data-st="dead"] .iso-shade,.lum[data-st="dead"] .iso-top{fill:#2a2522}
.lum[data-st="dead"] .lens{stroke:#3a2a1a}
.drv .iso-fill,.drv .iso-shade{fill:#8a9096}.drv .iso-top{fill:#a7adb4}
.mcb rect{fill:var(--anatomy-paper);stroke:var(--anatomy-mid);stroke-width:.3}
.mcb .tog{fill:#3ddc84;stroke:none}.mcb[data-on="false"] .tog{fill:#ff4a3d;transform:translateY(5px)}
.nbar{fill:#c9a227;stroke:var(--anatomy-mid);stroke-width:.25}
.screw{fill:#d6d9dc;stroke:var(--anatomy-mid);stroke-width:.3}.slot{stroke:#333;stroke-width:.5}
[data-part="nterm"][data-state="broken"] .screw{fill:#ff4a3d}
[data-part="nterm"][data-state="loose"] .screw{fill:#ffb347}
.ctl{display:grid;gap:12px;margin:14px 0 6px;font-family:var(--anatomy-mono);font-size:12px;color:var(--anatomy-mid)}
.ctl-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ctl-label{min-width:72px;text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:var(--anatomy-lo)}
.ctl button{font:inherit;color:var(--anatomy-mid);background:transparent;border:1px solid var(--anatomy-lo);border-radius:6px;padding:7px 10px;cursor:pointer;line-height:1.15;text-align:left;min-height:36px}
.ctl button:hover{border-color:var(--anatomy-mid)}
.ctl button[aria-pressed="true"]{color:var(--anatomy-lit);border-color:var(--anatomy-lit)}
.ctl button small{display:block;font-size:10px;color:var(--anatomy-lo)}
.ctl [data-n="broken"]{border-color:#ff6a3d;color:#ff6a3d}
.ctl #fresh{border-color:#ff6a3d;color:#ff6a3d}
.slide{position:relative;flex:1;min-width:90px}
.slide input{width:100%;accent-color:var(--anatomy-lit);margin:0}
.ctl output{min-width:72px;text-align:right;color:var(--anatomy-hi,var(--anatomy-mid))}
.meter{position:relative;flex:1;min-width:110px;height:10px;margin-top:14px;border:1px solid var(--anatomy-lo);border-radius:5px}
.meter .fill{position:absolute;left:0;top:0;bottom:0;border-radius:4px;transition:width .1s;background:var(--anatomy-mid)}
.meter .fill[data-state="ok"]{background:#3ddc84}.meter .fill[data-state="warn"]{background:#ffb347}.meter .fill[data-state="bad"]{background:#ff5a2a}.meter .fill[data-state="off"]{background:transparent}
.band{position:absolute;top:0;bottom:0;background:rgba(61,220,132,.14);pointer-events:none}
.mark{position:absolute;top:-14px;bottom:-3px;width:0;border-left:1px dashed #ff6a3d;pointer-events:none}
.mark::after{content:attr(data-label);position:absolute;top:0;left:4px;font-size:10px;white-space:nowrap;color:#ff6a3d}
.mark.quiet::after{content:none}
.ph{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:middle}
#stats{font-size:12px;color:var(--anatomy-mid);line-height:1.5}#stats b{color:var(--anatomy-hi,var(--anatomy-mid));font-weight:600}
#shot{min-height:3.6em;font-size:12px;line-height:1.4}
@media (max-width:520px){.ctl-label{min-width:52px}.ctl button{padding:7px 8px}.ctl output{min-width:60px}.ctl button small{display:none}}`;

const stageHtml = `<div class="iso-stage fx-stage" tabindex="0" role="group" aria-label="Lighting array: space breaks or fixes the neutral, N cycles solid, loose and broken, 1 2 3 change how many lights are on per row, W swaps the drivers, R replaces dead ones">${floorSvg}<canvas class="fx-layer fx-gl fx-floor" aria-hidden="true"></canvas>${topSvg}<canvas class="fx-layer fx-gl fx-top" aria-hidden="true"></canvas></div>`;

const vp = (v) => (v / 420 * 100).toFixed(1);
const meterRow = (r, col) => `<div class="ctl-row"><span class="ctl-label"><span class="ph" style="background:${col}"></span>L${r + 1} row</span><div class="meter"><span class="band" style="left:${vp(216)}%;width:${(vp(253) - vp(216)).toFixed(1)}%"></span><span id="v${r}-fill" class="fill"></span>${r === 0 ? `<span class="mark quiet" style="left:${vp(230)}%"></span>` : ""}<span class="mark maxmark${r ? " quiet" : ""}" style="left:${vp(264)}%" data-label="264 V driver max"></span></div><output id="v${r}-out">230 V</output></div>`;
const countRow = (r, col, v) => `<div class="slide" style="min-width:70px"><input id="row${r}" type="range" min="0" max="4" step="1" value="${v}" aria-label="Lights on, row L${r + 1}"></div><output id="row${r}-out" style="min-width:40px">${v} on</output>`;
const CONTROLS = `<div class="ctl" role="group" aria-label="Test controls">
  <div class="ctl-row"><span class="ctl-label">Neutral</span><button type="button" data-n="solid" aria-pressed="true">Solid</button><button type="button" data-n="loose" aria-pressed="false">Loose<small>making and breaking</small></button><button type="button" data-n="broken" aria-pressed="false">Broken</button></div>
  <div class="ctl-row"><span class="ctl-label">Drivers</span><button type="button" data-drv="narrow" aria-pressed="true">Narrow<small>198 to 264 V</small></button><button type="button" data-drv="wide" aria-pressed="false">Wide range<small>90 to 305 V</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Lights on</span><span class="ph" style="background:#d9534f"></span>${countRow(0, "#d9534f", 4)}<span class="ph" style="background:#bdbdb8"></span>${countRow(1, "#e8e8e4", 2)}<span class="ph" style="background:#3d7bd9"></span>${countRow(2, "#3d7bd9", 1)}</div>
  ${meterRow(0, "#d9534f")}${meterRow(1, "#bdbdb8")}${meterRow(2, "#3d7bd9")}
  <div class="ctl-row"><span class="ctl-label">Neutral</span><span id="stats"></span></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="fresh">Replace dead drivers</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
  <div id="shot" aria-live="polite"></div>
</div>`;

const card = k.plateHtml({
  fig: "Fig 13",
  title: "Lost neutral",
  hint: "Tap: break the neutral",
  readout: "",
  keys: [
    { mark: "lit", label: "Light from each high bay; the loose joint arcing; drivers popping" },
    { mark: "raised", label: "Twelve LED high bays on three phases, one shared neutral, the lighting board" },
  ],
  caption: "Three rows of LED high bays, one row per phase, all bringing their current home on one shared neutral. With the neutral connected, each row gets its 230 V no matter what the others are doing. Lose it and the star point floats: it slides toward the most heavily loaded row, so that row drops and the lightly loaded row climbs toward 400 V. A driver that sees too little drops out, and one that sees too much cooks its surge protection and dies, often short, which trips its row. Then the two rows left are in series across 400 V and it cascades. Balanced loads hide it completely, until somebody switches a row off.",
  body: stageHtml,
});

const other = theme === "light" ? ["index.html", "Dark version"] : ["light.html", "Light version"];
const FOOT = `<p style="font-family:var(--anatomy-mono);font-size:11px;color:var(--anatomy-lo);margin:28px 0 8px;line-height:1.6">A toy, not a fault study. Real: 400/230 V three-phase four-wire, the AS 60038 range of 230 V +10 %/−6 % (216 to 253 V), the floating star point (Millman's theorem), and typical driver input ranges of 198 to 264 V (narrow) and 90 to 305 V (wide range, Mean Well HLG style). Made up: 150 W fittings treated as fixed loads while running (real constant-power drivers can make it worse), where drivers drop out, how fast they die above their rating, the MOV failing short and tripping the row, and the loose joint's behaviour.<br>Built with <a href="https://github.com/wheresryan22/anatomy" style="color:inherit">Anatomy</a> by Ryan (MIT). · <a href="${other[0]}" style="color:inherit">${other[1]}</a> · <a href="../" style="color:inherit">More figures</a> · <a href="https://github.com/Dizzyfer/Anatomy/tree/main/lost-neutral" style="color:inherit">Source</a></p>`;
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "Lost neutral", theme, body: `<style>${CSS}</style>${card.replace("<figcaption", CONTROLS + "<figcaption")}${FOOT}`, script: kitScript() + glScript() + LIVE.replace("__DATA__", JSON.stringify(DATA)), width: 700 }));
console.log("wrote", name);
