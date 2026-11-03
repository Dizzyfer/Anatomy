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

// Truth: methane burns between 5 and 15 % in air and is lighter than air; propane between about 2.1 and 9.5 % and is
// heavier. Gas is odourised so you can smell it well before it can burn (at about a fifth of the LEL). Natural gas
// detectors go high, LPG detectors go low.
// Toy: the room, the leak rates, how the gas spreads and layers, the ventilation rates, the alarm point and the time-lapse.
const GAS = {
  ng: { name: "Natural gas", lel: 5, uel: 15, up: 1, scale: 20, drift: 0.004 },
  lpg: { name: "LPG", lel: 2.1, uel: 9.5, up: -1, scale: 12, drift: 0.008 },
};
const MODEL = { cells: 10, roomM3: 41.6, leak: { small: 0.6, big: 4 }, ach: { closed: 0.3, window: 4, hood: 8 }, lapse: 150, mix: 0.015, alarm: 0.1, end: 6 };

const ROOM = { x: -100, y: -100, w: 200, d: 200, h: 130 };
const PLATE = { x: -112, y: -112, w: 224, d: 224, r: 8 };
const PLATE_H = 12, FOOT_H = 5;
const cellZ = (i) => (ROOM.h / MODEL.cells) * i;
const SOURCES = { stove: [5, -86, 47], switch: [-99, 20, 62], fridge: [-86, -44, 8] };
const zCell = (z) => Math.min(MODEL.cells - 1, Math.floor(z / (ROOM.h / MODEL.cells)));

const P = k.fitProjection([...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [ROOM.x, ROOM.y, ROOM.h + 4]], W, H, { pad: 16, azimuth: 45 });
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
  // floor tiles
  const t = [];
  for (let x = ROOM.x + 25; x < ROOM.x + ROOM.w; x += 25) t.push(k.segment([x, ROOM.y, 0.05], [x, ROOM.y + ROOM.d, 0.05], P));
  for (let y = ROOM.y + 25; y < ROOM.y + ROOM.d; y += 25) t.push(k.segment([ROOM.x, y, 0.05], [ROOM.x + ROOM.w, y, 0.05], P));
  out.push(L(t.join(""), { tone: "faint" }));
  return out.join("");
}

function walls() {
  const out = [];
  // back wall with a window, left wall with a door, the switch and the detector
  out.push(`<g class="wallb">${S(slab({ x: ROOM.x, y: ROOM.y - 3, w: ROOM.w, d: 3 }, 0, ROOM.h, 0.3, 0.1), { tone: "lo" })}</g>`);
  out.push(`<g class="wallb">${S(slab({ x: ROOM.x - 3, y: ROOM.y - 3, w: 3, d: ROOM.d + 3 }, 0, ROOM.h, 0.3, 0.1), { tone: "lo" })}</g>`);
  const wm = k.sideMatrix([46, ROOM.y + 0.05], 104, P, "left");
  out.push(`<g transform="${wm}"><rect x="0" y="0" width="46" height="44" class="window-frame"/><g data-part="window" class="window-g"><rect x="2" y="2" width="42" height="40" class="glass"/><path d="M23 2V42M2 22H44" class="mullion"/></g></g>`);
  const dm = k.sideMatrix([ROOM.x + 0.05, 86], 104, P, "right");
  out.push(`<g transform="${dm}"><rect x="0" y="0" width="44" height="104" class="door-frame"/><g data-part="door"><rect x="2" y="2" width="40" height="102" class="door"/><circle cx="34" cy="56" r="2" class="knob"/></g></g>`);
  const sm2 = k.sideMatrix([ROOM.x + 0.05, 26], SOURCES.switch[2] + 4, P, "right");
  out.push(`<g transform="${sm2}"><rect x="0" y="0" width="8" height="10" rx="1" class="plate"/><rect data-part="switch" x="3" y="2.5" width="2" height="5" rx=".5" class="toggle"/></g>`);
  const det = (z, part) => { const m = k.sideMatrix([ROOM.x + 0.05, -10], z + 4, P, "right"); return `<g transform="${m}" data-part="${part}"><circle cx="5" cy="4" r="4.4" class="detector"/><circle cx="5" cy="4" r="1.4" class="det-led" data-on="false"/></g>`; };
  out.push(det(118, "det-high"), det(16, "det-low"));
  return out.join("");
}

function kitchen() {
  const out = [];
  // bench along the back wall with the cooktop, and the range hood
  out.push(S(slab({ x: -70, y: ROOM.y, w: 140, d: 30 }, 0, 44, 1, 0.4), { tone: "hi", inner: L([-30, 10, 40].map((x) => k.segment([x, ROOM.y + 30, 4], [x, ROOM.y + 30, 40], P)).join(""), { tone: "faint" }) }));
  out.push(S(slab({ x: -72, y: ROOM.y, w: 144, d: 32 }, 44, 3, 1, 0.4), { tone: "mid" }));
  out.push(S(slab({ x: -12, y: ROOM.y + 4, w: 34, d: 24 }, 47, 1.2, 1, 0.2), { tone: "lo" }));
  for (const [x, y] of [[-3, ROOM.y + 10], [13, ROOM.y + 10], [-3, ROOM.y + 22], [13, ROOM.y + 22]]) out.push(L(k.ring(x, y, 4, 48.3, P, 20), { tone: "mid" }));
  out.push(S(slab({ x: 30, y: ROOM.y + 28.5, w: 6, d: 2 }, 32, 6, 0.6, 0.2), { tone: "lo" }));
  out.push(`<g data-part="knob" class="gasknob">${S(k.cylinder(-6, ROOM.y + 31, 2, 36, 2, P, 14, 0.4), { tone: "hi" })}</g>`);
  out.push(S(slab({ x: -14, y: ROOM.y, w: 38, d: 22 }, 92, 10, 1, 0.4), { tone: "hi" }));
  out.push(S(slab({ x: -2, y: ROOM.y, w: 14, d: 10 }, 102, ROOM.h - 102, 0.4, 0.2), { tone: "hi" }));
  // the fridge in the corner
  out.push(`<g class="fridge">${S(slab({ x: ROOM.x, y: -70, w: 30, d: 34 }, 0, 92, 1.6, 0.5), { tone: "hi", inner: L(k.segment([ROOM.x + 30, -70, 60], [ROOM.x + 30, -36, 60], P), { tone: "faint" }) })}</g>`);
  return out.join("");
}

// the gas, as horizontal layers filling the room
function layers() {
  const out = [];
  for (let i = 0; i < MODEL.cells; i++) {
    const z = cellZ(i), h = ROOM.h / MODEL.cells;
    const pts = (zz) => [[ROOM.x + 1, ROOM.y + 1, zz], [ROOM.x + ROOM.w - 1, ROOM.y + 1, zz], [ROOM.x + ROOM.w - 1, ROOM.y + ROOM.d - 1, zz], [ROOM.x + 1, ROOM.y + ROOM.d - 1, zz]];
    const top = k.pathOf(pts(z + h).map(at), true);
    const fx = k.pathOf([[ROOM.x + ROOM.w - 1, ROOM.y + 1, z], [ROOM.x + ROOM.w - 1, ROOM.y + ROOM.d - 1, z], [ROOM.x + ROOM.w - 1, ROOM.y + ROOM.d - 1, z + h], [ROOM.x + ROOM.w - 1, ROOM.y + 1, z + h]].map(at), true);
    const fy = k.pathOf([[ROOM.x + 1, ROOM.y + ROOM.d - 1, z], [ROOM.x + ROOM.w - 1, ROOM.y + ROOM.d - 1, z], [ROOM.x + ROOM.w - 1, ROOM.y + ROOM.d - 1, z + h], [ROOM.x + 1, ROOM.y + ROOM.d - 1, z + h]].map(at), true);
    out.push(`<g data-cell="${i}" class="gas" data-band="none"><path d="${fx}"/><path d="${fy}"/><path d="${top}" class="gas-top"/></g>`);
  }
  return out.join("");
}

function front() {
  const c = (x, y, z) => at([x, y, z]).map((n) => n.toFixed(1)).join(" ");
  const x1 = ROOM.x + ROOM.w, y1 = ROOM.y + ROOM.d;
  return `<path class="cutwall" d="M${c(x1, ROOM.y, ROOM.h)}L${c(x1, y1, ROOM.h)}L${c(ROOM.x, y1, ROOM.h)}M${c(x1, y1, 0)}L${c(x1, y1, ROOM.h)}"/>
    <g data-part="ceiling" class="ceiling">${S(slab({ x: ROOM.x - 3, y: ROOM.y - 3, w: ROOM.w + 3, d: ROOM.d + 3 }, ROOM.h, 3, 0.3, 0.1), { tone: "lo" })}</g>
    <g data-part="labels"></g>`;
}

const svg = k.figureSvg({
  width: W, height: H,
  label: "A kitchen cut open: a bench and gas cooktop along the back wall with a range hood and a window, a fridge in the corner, a door and a light switch on the side wall, and gas detectors mounted high and low. Leaked gas shows as coloured layers filling the room.",
  body: [plate(), walls(), kitchen(), layers(), front()],
});

const DATA = {
  W, H, camera: glCamera(P), P, GAS, MODEL, SRC: SOURCES, zc: Object.fromEntries(Object.entries(SOURCES).map(([n, p]) => [n, zCell(p[2])])),
  piv: { window: at([68, ROOM.y, 82]), door: at([ROOM.x, 64, 52]), ceil: at([0, 0, ROOM.h]) },
  src: Object.fromEntries(Object.entries(SOURCES).map(([n, p]) => [n, at(p)])),
};

const FRAG = `
uniform float uLight;
uniform float uB[${MODEL.cells}];
uniform float uC;
uniform float uSpark;
uniform vec3 uSp;
vec4 inkFor(vec3 seen,float cover){vec3 ab=1.-seen;float a=max(max(ab.r,max(ab.g,ab.b)),cover);return vec4(vec3(a)-ab,a);}
vec4 over(vec4 t,vec4 u){return t+u*(1.-t.a);}
vec4 fireInk(float e,float core){
  vec3 hue=mix(vec3(.55,.16,.06),mix(vec3(1.,.36,.08),vec3(1.,.66,.28),smoothstep(.45,1.,core)),smoothstep(0.,.5,core));
  vec3 c=tonemap(hue*e,1.4);float a=max(c.r,max(c.g,c.b));
  float la=1.-exp(-1.8*e);
  vec3 seen=mix(vec3(1.),mix(vec3(.82,.28,.06),vec3(1.,.78,.4),smoothstep(.6,1.,core)*smoothstep(.5,1.,la)),la);
  return mix(vec4(c,a),inkFor(seen,.9*smoothstep(.75,1.,la)*core)*la,uLight);
}
vec4 arcInk(float e){vec3 c=tonemap(vec3(.62,.78,1.)*e,1.6);float a=max(c.r,max(c.g,c.b));float la=1.-exp(-1.6*e);return mix(vec4(c,a),inkFor(mix(vec3(1.),vec3(.3,.45,.9),la),0.)*la,uLight);}
float edgeFade(vec2 vb){return smoothstep(0.,40.,min(min(vb.x,uView.x-vb.x),min(vb.y,uView.y-vb.y)));}
void main(){
  vec2 vb=viewOf(gl_FragCoord.xy);
  vec4 o=vec4(0.);
  if(uSpark>.002){vec2 d=(vb-project(uSp))/uK;o=arcInk((exp(-pow(length(d)/.8,2.))*2.4+exp(-pow(length(d)/4.,2.))*.6)*uSpark);}
  if(uC>=0.){
    float c=uC,e=0.,hot=0.;
    // march the room's front corner column of layers: the flame fills whichever layers were in the flammable range
    for(int i=0;i<${MODEL.cells};i++){
      float b=uB[i];
      if(b<.01) continue;
      float z=(float(i)+.5)*${(ROOM.h / MODEL.cells).toFixed(2)};
      vec3 p=onFloor(vb,z);
      float inside=step(${ROOM.x.toFixed(1)},p.x)*step(p.x,${(ROOM.x + ROOM.w).toFixed(1)})*step(${ROOM.y.toFixed(1)},p.y)*step(p.y,${(ROOM.y + ROOM.d).toFixed(1)});
      float front=1.-exp(-c/.15);
      float dist=length(p.xy-uSp.xy);
      float reach=smoothstep(0.,30.,front*320.-dist);
      float n=fbm2(p.xy*.03+vec2(c*2.,float(i)));
      e+=b*inside*reach*(.35+.6*n)*exp(-c/.8)*.55;
      hot+=b*inside*reach*exp(-c/.35)*.4;
    }
    // what blows out of the window and the door
    float ef=edgeFade(vb);
    o=over(fireInk(e*ef,clamp(hot/max(e,1e-3),0.,1.)),o);
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
const gl = glLayer({ canvas: stage.querySelector(".fx-gl"), fragment: ${JSON.stringify(FRAG)}, view: [D.W, D.H], camera: D.camera, uniforms: ["uB", "uC", "uSpark", "uSp"], fixed: { uLight: LIGHT } });
if (gl) stage.setAttribute("data-gl", "");

let gas = "ng", leak = "small", vent = "closed", detHigh = true, leaking = false;
let c = new Array(M.cells).fill(0), boomAt = null, burned = new Array(M.cells).fill(0), sparkAt = -10, sparkSrc = "switch", alarm = false, smelt = false, minutes = 0;
let frame = 0, last = 0, now = 0, visible = false, touring = true, slow = false, tourClock = 0, tourStep = -1, actions = [], lastShot = "", lastEvent = "", lastEventAt = -10;
const G = () => D.GAS[gas];
const busy = () => boomAt !== null;
const event = (t) => { lastEvent = t; lastEventAt = now; };
function reset() { c = new Array(M.cells).fill(0); boomAt = null; burned.fill(0); alarm = false; smelt = false; minutes = 0; leaking = false; lastEvent = ""; }

function step(dt) {
  if (busy()) return;
  const sec = dt * M.lapse, g = G(), n = M.cells, cellM3 = M.roomM3 / n;
  minutes += sec / 60;
  // the leak goes in at the cooktop
  if (leaking) c[D.zc.stove] += ((M.leak[leak] / 3600) * sec / cellM3) * 100;
  // buoyancy: methane rises, propane sinks; a little mixing between layers; ventilation takes it all out evenly
  const next = [...c];
  for (let i = 0; i < n; i++) {
    const j = i + g.up;
    if (j >= 0 && j < n) { const mv = c[i] * Math.min(1, g.drift * sec); next[i] -= mv; next[j] += mv; }
    if (i < n - 1) { const mx = (c[i] - c[i + 1]) * Math.min(0.5, M.mix * sec); next[i] -= mx; next[i + 1] += mx; }
  }
  const out = Math.exp(-(M.ach[vent] / 3600) * sec);
  c = next.map((v) => Math.max(0, v * out));
  const watched = detHigh ? c[n - 1] : c[0];
  if (!alarm && watched >= M.alarm * g.lel) { alarm = true; event("The gas alarm went off: " + (detHigh ? "the one up high" : "the one down low") + " is reading " + Math.round((watched / g.lel) * 100) + " % of the LEL."); }
  if (!smelt && Math.max(...c) >= 0.2 * g.lel) { smelt = true; event("You'd smell it by now: gas is odourised so you can smell it at about a fifth of the LEL, long before it can burn."); }
}

function spark(src) {
  if (busy()) return;
  sparkAt = now; sparkSrc = src;
  const g = G(), i0 = D.zc[src], v = c[i0];
  const where = { switch: "the light switch", fridge: "the fridge thermostat", stove: "the cooktop igniter" }[src];
  if (v >= g.lel && v <= g.uel) {
    // burn every layer that's in the range and joined to this one
    burned.fill(0);
    for (let i = i0; i >= 0 && c[i] >= g.lel && c[i] <= g.uel; i--) burned[i] = 1;
    for (let i = i0; i < M.cells && c[i] >= g.lel && c[i] <= g.uel; i++) burned[i] = 1;
    // a layer that's too rich still burns at its edges once the flame gets there
    for (let i = 0; i < M.cells; i++) if (c[i] > g.uel && (burned[i - 1] || burned[i + 1])) burned[i] = 0.6;
    boomAt = now + 0.05;
    const frac = burned.reduce((a, b) => a + b, 0) / M.cells;
    event("BOOM. " + where[0].toUpperCase() + where.slice(1) + " sparked in " + v.toFixed(1) + " % " + (gas === "ng" ? "methane" : "propane") + ", inside the " + g.lel + " to " + g.uel + " % range. About " + Math.round(frac * 100) + " % of the room was in range and it all went at once: windows out, door off, ceiling up.");
  } else if (v > g.uel) event(where[0].toUpperCase() + where.slice(1) + " sparked in " + v.toFixed(1) + " %: too rich to burn, above the " + g.uel + " % UEL. Lucky. Now open a window and it'll dilute straight back through the flammable range.");
  else event(where[0].toUpperCase() + where.slice(1) + " sparked in " + v.toFixed(2) + " %: under the " + g.lel + " % LEL at that height, so nothing." + (Math.max(...c) >= g.lel ? " But there's a flammable layer " + (g.up > 0 ? "up near the ceiling" : "down on the floor") + "." : ""));
}

const cells = [...stage.querySelectorAll("[data-cell]")];
const parts = { win: q("window"), door: q("door"), ceil: q("ceiling"), sw: q("switch"), knob: q("knob"), dh: q("det-high"), dl: q("det-low") };
const ui = {
  gas: [...document.querySelectorAll("[data-gas]")], leak: [...document.querySelectorAll("[data-leak]")], vent: [...document.querySelectorAll("[data-vent]")], det: [...document.querySelectorAll("[data-det]")],
  meters: ["top", "mid", "low"].map((n) => ({ fill: document.querySelector("#" + n + "-fill"), out: document.querySelector("#" + n + "-out"), lel: document.querySelector("#" + n + "-lel"), uel: document.querySelector("#" + n + "-uel") })),
  stats: document.querySelector("#stats"), gasb: document.querySelector("#gasb"), sparks: [...document.querySelectorAll("[data-spark]")], reset: document.querySelector("#reset"), slow: document.querySelector("#slow"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"),
};
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };

function draw() {
  const g = G(), b = boomAt === null ? -1 : now - boomAt;
  cells.forEach((el, i) => {
    const v = c[i];
    const band = b >= 0 && burned[i] ? "burnt" : v < g.lel * 0.05 ? "none" : v < g.lel ? "lean" : v <= g.uel ? "flam" : "rich";
    if (el.dataset.band !== band) el.dataset.band = band;
    el.style.opacity = band === "none" ? "0" : band === "burnt" ? String(Math.max(0, 1 - b * 2)) : String(clamp(0.1 + (v / g.uel) * 0.35, 0.1, 0.45));
  });
  parts.sw.dataset.on = String(now - sparkAt < 0.3 && sparkSrc === "switch");
  parts.knob.dataset.on = String(leaking);
  parts.dh.style.display = detHigh ? "" : "none"; parts.dl.style.display = detHigh ? "none" : "";
  (detHigh ? parts.dh : parts.dl).querySelector(".det-led").dataset.on = String(alarm && Math.sin(now * 12) > 0);
  // the blast
  const fly = (c2, piv, vx, vy, w) => c2 > 0 ? "translate(" + (vx * c2).toFixed(1) + " " + (-vy * c2 + 400 * c2 * c2).toFixed(1) + ") rotate(" + (w * c2).toFixed(0) + " " + piv[0].toFixed(1) + " " + piv[1].toFixed(1) + ")" : "";
  const frac = burned.reduce((a, x) => a + x, 0) / M.cells;
  parts.win.setAttribute("transform", b > 0 ? "translate(" + (-60 * b * 60 / 100).toFixed(1) + " " + (-40 * b + 120 * b * b).toFixed(1) + ")" : "");
  parts.win.style.opacity = b > 0 ? String(Math.max(0, 1 - b)) : "1";
  parts.door.setAttribute("transform", b > 0 ? "translate(" + (-80 * b).toFixed(1) + " " + (-30 * b + 150 * b * b).toFixed(1) + ")" : "");
  parts.door.style.opacity = b > 0 ? String(Math.max(0, 1 - b * 0.8)) : "1";
  parts.ceil.setAttribute("transform", b > 0 ? fly(b, D.piv.ceil, 0, 120 * frac + 40, 0) : "");
  if (b >= 0) {
    const A = 4 + 14 * frac;
    stage.style.transform = "translate(" + (A * Math.exp(-b / 0.5) * Math.sin(b * 80)).toFixed(1) + "px," + (A * Math.exp(-b / 0.5) * Math.cos(b * 67)).toFixed(1) + "px)";
    if (b > M.end) { stage.style.transform = ""; reset(); event("Reset. Gas off, windows back in."); return draw(); }
  }
  const sp = D.SRC[sparkSrc];
  if (gl && !window.__noGL) gl.draw({ uB: burned.map((x) => x * (0.6 + frac)), uC: b, uSpark: Math.exp(-(now - sparkAt) / 0.08) * (now - sparkAt < 0.6 ? 1 : 0), uSp: sp }, now);
  const text = b >= 0 ? "BOOM · " + Math.round(frac * 100) + " % of the room" : (leaking ? "leaking · " : "") + Math.round(minutes) + " min · ceiling " + c[M.cells - 1].toFixed(1) + " % · floor " + c[0].toFixed(1) + " %";
  if (readout.textContent !== text) readout.textContent = text;
}

function syncUi() {
  const g = G();
  ui.gas.forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.gas === gas)));
  ui.leak.forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.leak === leak)));
  ui.vent.forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.vent === vent)));
  ui.det.forEach((x) => x.setAttribute("aria-pressed", String((x.dataset.det === "high") === detHigh)));
  const vals = [c[M.cells - 1], c[D.zc.switch], c[0]];
  ui.meters.forEach((m, i) => {
    const v = vals[i];
    m.fill.style.width = (clamp(v / g.scale, 0, 1) * 100).toFixed(1) + "%";
    m.fill.dataset.state = v >= g.lel && v <= g.uel ? "bad" : v > g.uel ? "rich" : v >= 0.2 * g.lel ? "warn" : "ok";
    m.out.textContent = v.toFixed(1) + " %";
    m.lel.style.left = (g.lel / g.scale * 100).toFixed(1) + "%"; m.lel.dataset.label = i ? "" : "LEL " + g.lel;
    m.uel.style.left = (g.uel / g.scale * 100).toFixed(1) + "%"; m.uel.dataset.label = i ? "" : "UEL " + g.uel;
  });
  ui.stats.innerHTML = "<b>" + g.name + "</b> " + (g.up > 0 ? "rises to the ceiling" : "sinks to the floor") + " · burns between <b>" + g.lel + "</b> and <b>" + g.uel + " %</b> · alarm <b>" + (alarm ? "SOUNDING" : "quiet") + "</b>" + (smelt ? " · you can <b>smell it</b>" : "");
  ui.gasb.textContent = leaking ? "TURN IT OFF" : "LEAVE THE GAS ON"; ui.gasb.setAttribute("aria-pressed", String(leaking));
  ui.slow.setAttribute("aria-pressed", String(slow)); ui.tour.setAttribute("aria-pressed", String(touring));
}

function story() {
  if (now - lastEventAt < 5 && lastEvent) return say(lastEvent);
  if (busy()) return;
  const g = G(), mx = Math.max(...c);
  if (mx < 0.05) return say("A kitchen. Leave a burner on without a flame and see where the gas goes. " + (gas === "ng" ? "Natural gas is lighter than air." : "LPG is heavier than air."));
  const inRange = c.map((v, i) => (v >= g.lel && v <= g.uel ? i : -1)).filter((i) => i >= 0);
  say((leaking ? "Still leaking, " : "Gas off, ") + Math.round(minutes) + " minutes in. " + (inRange.length ? "There's a flammable layer " + (g.up > 0 ? "from the ceiling down" : "from the floor up") + " (orange). Anything that sparks inside it sets it off." : "It's building up " + (g.up > 0 ? "under the ceiling" : "along the floor") + ", not in the flammable range yet.") + (c.some((v) => v > g.uel) ? " Some of it's too rich to burn (purple)." : ""));
}

const TOUR = [
  { gas: "ng", leak: "big", vent: "closed", det: true, acts: [[0.5, "on"], [15, "switch"], [22, "end"]] },
  { gas: "lpg", leak: "big", vent: "closed", det: true, acts: [[0.5, "on"], [5.5, "fridge"], [13, "end"]] },
  { gas: "lpg", leak: "big", vent: "closed", det: false, acts: [[0.5, "on"], [6, "end"]] },
  { gas: "lpg", leak: "small", vent: "window", det: false, acts: [[0.5, "on"], [12, "fridge"], [15, "end"]] },
];
function tick(t) {
  const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
  last = t;
  const sdt = dt * (slow ? 0.15 : 1);
  now += sdt;
  if (touring && !busy()) {
    tourClock += sdt;
    if (tourStep < 0 || actions.length === 0) {
      tourStep = (tourStep + 1) % TOUR.length;
      const s = TOUR[tourStep]; gas = s.gas; leak = s.leak; vent = s.vent; detHigh = s.det; reset();
      actions = s.acts.map(([w, a]) => [tourClock + w, a]);
    }
    while (actions.length && tourClock >= actions[0][0]) {
      const a = actions.shift()[1];
      if (a === "on") leaking = true; else if (a === "end") actions = []; else spark(a);
    }
  }
  for (let i = 0; i < 6; i++) step(sdt / 6);
  draw(); syncUi(); story();
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const guard = (fn) => (...a) => { touring = false; actions = []; if (busy()) return; fn(...a); draw(); syncUi(); run(); };
const setGas = guard((v) => { gas = v; reset(); });
const setLeak = guard((v) => { leak = v; });
const setVent = guard((v) => { vent = v; });
const setDet = guard((v) => { detHigh = v; alarm = false; });
const toggleGas = guard(() => { leaking = !leaking; });
const doSpark = guard((s) => spark(s));
const doReset = guard(() => reset());
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;
ui.gas.forEach((x) => x.addEventListener("click", () => setGas(x.dataset.gas)));
ui.leak.forEach((x) => x.addEventListener("click", () => setLeak(x.dataset.leak)));
ui.vent.forEach((x) => x.addEventListener("click", () => setVent(x.dataset.vent)));
ui.det.forEach((x) => x.addEventListener("click", () => setDet(x.dataset.det === "high")));
ui.gasb.addEventListener("click", toggleGas);
ui.sparks.forEach((x) => x.addEventListener("click", () => doSpark(x.dataset.spark)));
ui.reset.addEventListener("click", doReset);
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; tourClock = 0; actions = []; } run(); });
stage.addEventListener("click", () => doSpark("switch"));
stage.addEventListener("keydown", (ev) => {
  const map = { " ": () => doSpark("switch"), g: toggleGas, f: () => doSpark("fridge"), c: () => doSpark("stove"), l: () => setGas(gas === "ng" ? "lpg" : "ng"), w: () => setVent(vent === "closed" ? "window" : vent === "window" ? "hood" : "closed"), d: () => setDet(!detHigh), r: doReset, s: () => { slow = !slow; run(); } };
  if (map[ev.key]) { ev.preventDefault(); map[ev.key](); }
});
window.__fig = { freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
draw(); syncUi(); story();
`;

const CSS = `.fx-stage{position:relative;cursor:pointer}
.fx-layer{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.fx-gl{display:block}
body[data-theme="dark"] .fx-gl{mix-blend-mode:screen}
.iso-plate{overflow:hidden}
.cutwall{fill:none;stroke:var(--anatomy-lo);stroke-width:.8;stroke-dasharray:4 3}
.ceiling{opacity:.35}
.window-frame{fill:var(--anatomy-paper);stroke:var(--anatomy-mid);stroke-width:.6}
.glass{fill:rgba(140,190,230,.35);stroke:var(--anatomy-mid);stroke-width:.4}.mullion{stroke:var(--anatomy-mid);stroke-width:.8;fill:none}
.door-frame{fill:var(--anatomy-paper);stroke:var(--anatomy-mid);stroke-width:.6}.door{fill:#9a7650;stroke:var(--anatomy-mid);stroke-width:.4}.knob{fill:#d6d9dc}
.plate{fill:#f2f2ee;stroke:var(--anatomy-mid);stroke-width:.3}.toggle{fill:#bfc3c8}.toggle[data-on="true"]{fill:#9fc3ff}
.detector{fill:#f2f2ee;stroke:var(--anatomy-mid);stroke-width:.4}.det-led{fill:#2a2a2a}.det-led[data-on="true"]{fill:#ff3b30}
.gasknob[data-on="true"] .iso-fill,.gasknob[data-on="true"] .iso-top{fill:#ff6a3d}
.fridge .iso-fill,.fridge .iso-shade,.fridge .iso-top{fill:#e8eaec}
.gas path{stroke:none;transition:fill .3s}
.gas[data-band="lean"] path{fill:#5fbf86}.gas[data-band="flam"] path{fill:#ff8a3a}.gas[data-band="rich"] path{fill:#9b59b6}.gas[data-band="burnt"] path{fill:#ff5a2a}
.gas .gas-top{opacity:.25}
.ctl{display:grid;gap:12px;margin:14px 0 6px;font-family:var(--anatomy-mono);font-size:12px;color:var(--anatomy-mid)}
.ctl-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ctl-label{min-width:72px;text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:var(--anatomy-lo)}
.ctl button{font:inherit;color:var(--anatomy-mid);background:transparent;border:1px solid var(--anatomy-lo);border-radius:6px;padding:7px 10px;cursor:pointer;line-height:1.15;text-align:left;min-height:36px}
.ctl button:hover{border-color:var(--anatomy-mid)}
.ctl button[aria-pressed="true"]{color:var(--anatomy-lit);border-color:var(--anatomy-lit)}
.ctl button small{display:block;font-size:10px;color:var(--anatomy-lo)}
.ctl #gasb{font-weight:600;letter-spacing:.04em;border-color:var(--anatomy-lit);color:var(--anatomy-lit)}
.ctl [data-spark]{border-color:#ff6a3d;color:#ff6a3d}
.ctl output{min-width:72px;text-align:right;color:var(--anatomy-hi,var(--anatomy-mid))}
.meter{position:relative;flex:1;min-width:110px;height:10px;margin-top:14px;border:1px solid var(--anatomy-lo);border-radius:5px}
.meter .fill{position:absolute;left:0;top:0;bottom:0;border-radius:4px;transition:width .1s;background:var(--anatomy-mid)}
.meter .fill[data-state="ok"]{background:#5fbf86}.meter .fill[data-state="warn"]{background:#ffb347}.meter .fill[data-state="bad"]{background:#ff5a2a}.meter .fill[data-state="rich"]{background:#9b59b6}
.mark{position:absolute;top:-14px;bottom:-3px;width:0;border-left:1px dashed #ff6a3d;pointer-events:none}
.mark::after{content:attr(data-label);position:absolute;top:0;left:4px;font-size:10px;white-space:nowrap;color:#ff6a3d}
#stats{font-size:12px;color:var(--anatomy-mid);line-height:1.5}#stats b{color:var(--anatomy-hi,var(--anatomy-mid));font-weight:600}
#shot{min-height:3.6em;font-size:12px;line-height:1.4}
@media (max-width:520px){.ctl-label{min-width:52px}.ctl button{padding:7px 8px}.ctl output{min-width:60px}.ctl button small{display:none}}`;

const stageHtml = `<div class="iso-stage fx-stage" tabindex="0" role="group" aria-label="Kitchen: G turns the gas on and off, space flicks the light switch, F the fridge, C the cooktop igniter, L switches the gas, W the ventilation, D the detector">${svg}<canvas class="fx-layer fx-gl" aria-hidden="true"></canvas></div>`;

const meter = (id, label) => `<div class="ctl-row"><span class="ctl-label">${label}</span><div class="meter"><span id="${id}-fill" class="fill"></span><span id="${id}-lel" class="mark" style="left:25%" data-label=""></span><span id="${id}-uel" class="mark" style="left:75%" data-label=""></span></div><output id="${id}-out">0.0 %</output></div>`;
const CONTROLS = `<div class="ctl" role="group" aria-label="Test controls">
  <div class="ctl-row"><span class="ctl-label">Gas</span><button type="button" data-gas="ng" aria-pressed="true">Natural gas<small>methane, lighter than air</small></button><button type="button" data-gas="lpg" aria-pressed="false">LPG<small>propane, heavier than air</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Leak</span><button type="button" data-leak="small" aria-pressed="false">Burner left on<small>no flame</small></button><button type="button" data-leak="big" aria-pressed="true">Hose off</button></div>
  <div class="ctl-row"><span class="ctl-label">Air</span><button type="button" data-vent="closed" aria-pressed="true">All shut</button><button type="button" data-vent="window" aria-pressed="false">Window open</button><button type="button" data-vent="hood" aria-pressed="false">Range hood on</button></div>
  <div class="ctl-row"><span class="ctl-label">Detector</span><button type="button" data-det="high" aria-pressed="true">Up high</button><button type="button" data-det="low" aria-pressed="false">Down low</button></div>
  ${meter("top", "Ceiling")}${meter("mid", "Switch")}${meter("low", "Floor")}
  <div class="ctl-row"><span class="ctl-label">Room</span><span id="stats"></span></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="gasb" aria-pressed="false">LEAVE THE GAS ON</button><button type="button" data-spark="switch">Flick the light</button><button type="button" data-spark="fridge">Fridge kicks in</button><button type="button" data-spark="stove">Igniter</button></div>
  <div class="ctl-row"><span class="ctl-label"></span><button type="button" id="reset">Reset</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
  <div id="shot" aria-live="polite"></div>
</div>`;

const card = k.plateHtml({
  fig: "Fig 18",
  title: "Gas leak in the kitchen",
  hint: "Tap: flick the light",
  readout: "",
  keys: [
    { mark: "lit", label: "Gas layers: green too lean, orange flammable, purple too rich; the spark; the flame" },
    { mark: "raised", label: "Kitchen cut open: cooktop, range hood, fridge, window, door, switch, detectors" },
  ],
  caption: "Gas only burns in a band. Too little and there isn't enough fuel; too much and there isn't enough air. Methane burns between 5 and 15 %, propane between about 2 and 9.5 %. Natural gas is lighter than air and fills a room from the ceiling down; LPG is heavier and fills it from the floor up, which is why their detectors go in different places. Gas is odourised so you'll smell it at about a fifth of the lower limit, well before it can burn. Whatever sparks has to be inside the flammable layer to set it off: a light switch at chest height, a fridge thermostat near the floor. And a layer that's too rich to burn becomes flammable again the moment you start airing it out.",
  body: stageHtml,
});

const other = theme === "light" ? ["index.html", "Dark version"] : ["light.html", "Light version"];
const FOOT = `<p style="font-family:var(--anatomy-mono);font-size:11px;color:var(--anatomy-lo);margin:28px 0 8px;line-height:1.6">A toy, not gas safety advice. Real: methane 5 to 15 %, propane about 2.1 to 9.5 %, natural gas lighter than air and LPG heavier, odourised to be smelt at about a fifth of the LEL, natural gas detectors high and LPG ones low. Made up: the room, the leak rates, how it layers and mixes, the ventilation, the alarm level, the time-lapse (two and a half minutes a second) and the blast. If you smell gas: don't touch a switch, get out, call it in from outside.<br>Built with <a href="https://github.com/wheresryan22/anatomy" style="color:inherit">Anatomy</a> by Ryan (MIT). · <a href="${other[0]}" style="color:inherit">${other[1]}</a> · <a href="../" style="color:inherit">More figures</a> · <a href="https://github.com/Dizzyfer/Anatomy/tree/main/gas-leak" style="color:inherit">Source</a></p>`;
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "Gas leak in the kitchen", theme, body: `<style>${CSS}</style>${card.replace("<figcaption", CONTROLS + "<figcaption")}${FOOT}`, script: kitScript() + glScript() + LIVE.replace("__DATA__", JSON.stringify(DATA)), width: 700 }));
console.log("wrote", name);
