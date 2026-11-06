import { writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { kitScript } from "../../scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const SOLVER = readFileSync(join(HERE, "solver.js"), "utf8").replace(/if \(typeof module[^\n]*\n?/, "");

const W = 640;
const H = 440;

// Truth: a pin-jointed truss carries load as pure tension and compression in its members; long members in compression
// buckle (Euler) long before they yield, which is why a Pratt truss (long diagonals in tension) suits steel better than a
// Howe (long diagonals in compression). A statically determinate truss has no spare members: lose one and it's a mechanism.
// Vehicle masses are typical Australian figures (B-double 62.5 t, triple road train about 120 t, a large mining haul truck
// about 620 t loaded). Toy: the member sizes, the dead load, the speeds, and the deflection is drawn 120 times bigger (dead-load sag left out, as if the bridge were cambered).
const U = 4; // plot units per metre
const SPAN = 48, X0 = -96, DZ = 44, YT = 22, LANE = 7;
const APPROACH = 13.5;
const PLATE = { x: -152, y: -72, w: 304, d: 144, r: 8 };
const PLATE_H = 12, FOOT_H = 5;

const P = k.fitProjection([...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [X0, -YT, DZ + 7 * U + 4], [X0 + SPAN * U, YT, DZ + 7 * U + 4]], W, H, { pad: 14, azimuth: 45 });
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
  // the river
  const r = [[X0 + 6, PLATE.y + 4, 0.05], [X0 + SPAN * U - 6, PLATE.y + 4, 0.05], [X0 + SPAN * U - 6, PLATE.y + PLATE.d - 4, 0.05], [X0 + 6, PLATE.y + PLATE.d - 4, 0.05]];
  out.push(`<path class="river" d="${k.pathOf(r.map(at), true)}"/>`);
  const ripples = [];
  for (let i = 0; i < 9; i++) { const x = X0 + 20 + ((i * 47) % (SPAN * U - 40)), y = PLATE.y + 14 + ((i * 31) % (PLATE.d - 28)); ripples.push(k.segment([x, y, 0.1], [x + 10, y, 0.1], P)); }
  out.push(`<path class="ripple" d="${ripples.join("")}"/>`);
  out.push(`<g data-part="splash"></g>`);
  return out.join("");
}

// abutments and the approach roads, in two halves so the near one draws over the falling bridge
function abutment(side) {
  const x0 = side < 0 ? PLATE.x + 2 : X0 + SPAN * U, x1 = side < 0 ? X0 : PLATE.x + PLATE.w - 2;
  const out = [];
  out.push(S(slab({ x: x0, y: PLATE.y + 2, w: x1 - x0, d: PLATE.d - 4 }, 0, DZ, 1, 0.4), { tone: "mid", inner: L([12, 24, 36].map((z) => k.segment([x1, PLATE.y + 2, z], [x1, PLATE.y + PLATE.d - 2, z], P)).join(""), { tone: "faint" }) }));
  out.push(`<g class="road">${S(slab({ x: x0, y: -YT + 2, w: x1 - x0, d: 2 * YT - 4 }, DZ, 0.6, 0.3, 0.1), { tone: "lo", crease: "none" })}</g>`);
  out.push(L(k.segment([x0 + 2, 0, DZ + 0.7], [x1 - 2, 0, DZ + 0.7], P), { tone: "faint" }));
  return out.join("");
}

// one vehicle, front at x = 0 pointing +x, sitting on z = 0, centred on y = 0
const COL = { car: "#d94040", bus: "#e0a53a", bdouble: "#3d7bd9", roadtrain: "#5fbf86", haul: "#f2c230" };
function vehicleSvg(kind) {
  const m = U, out = [];
  const box = (x0, x1, w, z0, h, cls = "") => `<g class="${cls}">${S(slab({ x: x0 * m, y: (-w / 2) * m, w: (x1 - x0) * m, d: w * m }, z0 * m, h * m, 0.4, 0.2), { tone: "hi" })}</g>`;
  if (kind === "car") { out.push(box(-4.5, 0, 1.8, 0.3, 0.8, "paint")); out.push(box(-3.4, -1.2, 1.6, 1.1, 0.6, "glass")); }
  if (kind === "bus") { out.push(box(-12.5, 0, 2.5, 0.4, 2.8, "paint")); out.push(box(-12.3, -0.3, 2.52, 1.8, 0.8, "glass")); }
  if (kind === "bdouble" || kind === "roadtrain") {
    out.push(box(-6, 0, 2.5, 0.4, 3.2, "paint")); out.push(box(-1.6, -0.1, 2.52, 2.2, 0.9, "glass"));
    const trailers = kind === "bdouble" ? [[-19.6, -6.6], [-26, -19.8]] : [[-19, -6.8], [-31.5, -19.6], [-44, -32], [-53, -44.3]];
    for (const [a, b] of trailers) out.push(box(a, b, 2.5, 1.1, 2.9, "trailer"));
  }
  if (kind === "haul") {
    out.push(box(-15, 0, 9.4, 1.6, 2.4, "paint"));
    out.push(box(-15, -3.8, 9.6, 4, 3.2, "paint"));
    out.push(box(-3.6, -0.4, 3.4, 4, 2.2, "glass"));
    for (const x of [-12.8, -1.8]) for (const y of [-3.6, 3.6]) out.push(box(x - 1.9, x + 1.9, 1.7, 0, 3.6, "tyre").replace('class="tyre"', `class="tyre" transform="translate(${(k.iso([0, y * m, 0], P)[0] - k.iso([0, 0, 0], P)[0]).toFixed(1)} ${(k.iso([0, y * m, 0], P)[1] - k.iso([0, 0, 0], P)[1]).toFixed(1)})"`));
  }
  return `<g class="veh v-${kind}" style="--paint:${COL[kind]}">${out.join("")}</g>`;
}

function vclip() {
  const pts = [];
  for (const x of [PLATE.x, PLATE.x + PLATE.w]) for (const y of [-YT, YT]) for (const z of [0, DZ + 18]) pts.push(at([x, y, z]));
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of pts) { while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of pts.slice().reverse()) { while (hi.length > 1 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  const hull = [...lo.slice(0, -1), ...hi.slice(0, -1)];
  return `<defs><clipPath id="vclip"><path d="${k.pathOf(hull, true)}"/></clipPath></defs>`;
}
const svg = k.figureSvg({
  width: W, height: H,
  label: "A steel truss bridge across a river, 48 metres between abutments, with the deck between two trusses. Vehicles drive across on the deck. Each member is coloured by the force in it: red for tension, blue for compression.",
  body: [vclip(), plate(), abutment(-1), `<g data-part="bridge"></g>`, abutment(1)],
});

const DATA = { W, H, P, U, SPAN, X0, DZ, YT, LANE, APPROACH, templates: Object.fromEntries(Object.keys(COL).map((kk) => [kk, vehicleSvg(kk)])) };

const LIVE = `
${SOLVER}
const D = __DATA__;
const { P } = D;
const stage = document.querySelector(".fx-stage");
const q = (n) => stage.querySelector('[data-part="' + n + '"]');
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const DEFL = 120;
let u0 = null;

let kind = "pratt", g = trussGeom(kind), broken = new Set(), res = null, jam = false;
let cars = [], fallAt = null, breakX = 0, snapAt = -10, snapped = -1, lastShot = "", lastEvent = "", lastEventAt = -10, worst = { util: 0, i: -1 };
let frame = 0, last = 0, now = 0, visible = false, touring = true, slow = false, tourClock = 0, tourStep = -1, actions = [], stream = 0, streamAt = 0;
const event = (t) => { lastEvent = t; lastEventAt = now; };
const SPEED = 11;

// the bridge drawing, rebuilt when the truss type changes
const bridgeG = q("bridge"), splashG = q("splash");
let els = null;
function buildBridge() {
  const line = (cls, extra = "") => '<line class="' + cls + '"' + extra + '/>';
  let back = "", front = "", braces = "";
  g.M.forEach((m, i) => { back += line("mem back t-" + m.type, ' data-m="' + i + '"'); front += '<g data-fm="' + i + '">' + line("hit", "") + line("mem front t-" + m.type) + "</g>"; });
  for (let i = 0; i < g.J.length; i++) braces += line("brace");
  bridgeG.innerHTML = '<g class="backtruss">' + back + '</g><g class="braces">' + braces + '</g><path class="deck" d=""/><path class="deck-edge" d=""/><g class="cars"></g><g class="fronttruss">' + front + '</g><g class="snap"></g>';
  els = {
    back: [...bridgeG.querySelectorAll(".backtruss line")], front: [...bridgeG.querySelectorAll("[data-fm]")].map((gg) => ({ g: gg, hit: gg.querySelector(".hit"), mem: gg.querySelector(".mem") })),
    braces: [...bridgeG.querySelectorAll(".brace")], deck: bridgeG.querySelector(".deck"), edge: bridgeG.querySelector(".deck-edge"), cars: bridgeG.querySelector(".cars"), snap: bridgeG.querySelector(".snap"),
  };
  els.front.forEach((f, i) => f.g.addEventListener("pointerdown", (ev) => { ev.stopPropagation(); cut(i); }));
}
buildBridge();

// where a point of the bridge is now, in world units (deflection blown up, and the collapse)
function fallState() {
  if (fallAt === null) return null;
  const t = now - fallAt, k2 = clamp(t / 0.9, 0, 1), pr = k2 * k2;
  const drop = D.DZ / D.U - 0.6;
  const aMax = (len) => Math.asin(Math.min(0.97, drop / Math.max(len, 4)));
  const wob = t > 0.9 ? Math.exp(-(t - 0.9) * 5) * Math.sin((t - 0.9) * 22) * 0.03 : 0;
  return { t, aL: aMax(breakX) * pr * (1 + wob), aR: aMax(D.SPAN - breakX) * pr * (1 + wob) };
}
function world(xm, zm, y, ui) {
  let x = xm, z = zm;
  if (res && !res.mech && ui !== undefined && u0) { x += (res.u[2 * ui] - u0[2 * ui]) * DEFL; z += (res.u[2 * ui + 1] - u0[2 * ui + 1]) * DEFL; }
  const f = fallState();
  if (f) {
    if (xm <= breakX) { const a = f.aL, c = Math.cos(a), s = Math.sin(a); const dx = x, dz = z; x = dx * c + dz * s; z = -dx * s + dz * c; }
    else { const a = f.aR, c = Math.cos(a), s = Math.sin(a); const dx = x - D.SPAN, dz = z; x = D.SPAN + dx * c - dz * s; z = dx * s + dz * c; }
  }
  return [D.X0 + x * D.U, y, D.DZ + z * D.U];
}
const sp = (p) => { const a = iso(p, P); return [a[0].toFixed(1), a[1].toFixed(1)]; };
function deflAt(xm) {
  // vertical deflection along the deck, between bottom joints
  if (!res || res.mech || !u0) return 0;
  const i = clamp(Math.floor(xm / g.Lp), 0, g.N - 1), f = clamp(xm / g.Lp - i, 0, 1);
  return ((res.u[2 * i + 1] - u0[2 * i + 1]) * (1 - f) + (res.u[2 * (i + 1) + 1] - u0[2 * (i + 1) + 1]) * f) * DEFL;
}

function colourOf(fr, broke) {
  if (broke) return "transparent";
  const u = clamp(fr.util, 0, 1.2), mix = Math.round(clamp(u / 0.9, 0, 1) * 100);
  return "color-mix(in srgb, var(--rest) , " + (fr.N >= 0 ? "#ff4a3d" : "#3d8bff") + " " + mix + "%)";
}

function draw() {
  const f = fallState();
  const J = g.J.map(([x, z], i) => ({ f: world(x, z, D.YT, i), b: world(x, z, -D.YT, i), x, z }));
  g.M.forEach((m, i) => {
    const a = J[m.a], b = J[m.b], broke = broken.has(i);
    const fr = res && !res.mech ? res.forces[i] : { N: 0, util: 0 };
    const col = fallAt !== null ? "var(--rest)" : colourOf(fr, broke);
    const set = (el, p, q2) => { const A = sp(p), B = sp(q2); el.setAttribute("x1", A[0]); el.setAttribute("y1", A[1]); el.setAttribute("x2", B[0]); el.setAttribute("y2", B[1]); };
    // a broken member shows as two stubs
    if (broke) {
      const mid = (p, q2, t) => p.map((v, k2) => v + (q2[k2] - v) * t);
      set(els.back[i], a.b, mid(a.b, b.b, 0.42)); set(els.front[i].mem, a.f, mid(a.f, b.f, 0.42)); set(els.front[i].hit, a.f, a.f);
      els.front[i].mem.style.stroke = "var(--rest)"; els.back[i].style.stroke = "var(--rest)";
    } else {
      set(els.back[i], a.b, b.b); set(els.front[i].mem, a.f, b.f); set(els.front[i].hit, a.f, b.f);
      els.front[i].mem.style.stroke = col; els.back[i].style.stroke = col;
    }
    els.front[i].mem.dataset.hot = String(fallAt === null && fr.util > 0.9);
  });
  J.forEach((j, i) => { const A = sp(j.f), B = sp(j.b); els.braces[i].setAttribute("x1", A[0]); els.braces[i].setAttribute("y1", A[1]); els.braces[i].setAttribute("x2", B[0]); els.braces[i].setAttribute("y2", B[1]); els.braces[i].style.display = j.z === 0 || i >= g.N + 1 ? "" : "none"; });
  // the deck surface through the deflected bottom joints
  const bot = J.slice(0, g.N + 1);
  const deckPts = (zOff) => [...bot.map((j, i) => world(j.x, j.z + zOff, D.YT - 1, i)), ...bot.slice().reverse().map((j, i) => world(j.x, j.z + zOff, -D.YT + 1, g.N - i))];
  if (f) {
    // two pieces once it's broken
    const left = bot.filter((j) => j.x <= breakX), right = bot.filter((j) => j.x > breakX);
    const piece = (arr) => arr.length < 2 ? "" : "M" + [...arr.map((j) => world(j.x, 0.35, D.YT - 1, g.J.indexOf(g.J[bot.indexOf(j)]))), ...arr.slice().reverse().map((j) => world(j.x, 0.35, -D.YT + 1, bot.indexOf(j)))].map((p) => sp(p).join(" ")).join("L") + "Z";
    els.deck.setAttribute("d", piece(left) + piece(right)); els.edge.setAttribute("d", "");
  } else {
    els.deck.setAttribute("d", "M" + deckPts(0.35).map((p) => sp(p).join(" ")).join("L") + "Z");
    els.edge.setAttribute("d", "M" + bot.map((j, i) => sp(world(j.x, j.z, D.YT - 1, i)).join(" ")).join("L"));
  }
  // vehicles
  cars.forEach((c) => {
    if (!c.el) { const tmp = document.createElementNS("http://www.w3.org/2000/svg", "g"); tmp.innerHTML = D.templates[c.kind]; c.el = tmp.firstChild; if (c.kind !== "haul") tmp.setAttribute("clip-path", "url(#vclip)"); els.cars.appendChild(tmp); c.wrap = tmp; }
    const xm = c.x, zOff = xm > 0 && xm < D.SPAN ? deflAt(xm) : 0;
    let p = world(xm, zOff, D.LANE, undefined);
    let rot = 0;
    const onSpan = onSpanTons(c) > 0;
    if (f && (c.fell || onSpan)) {
      c.fell = true;
      const ang = (a, b) => { const A = iso(a, P), B = iso(b, P); return Math.atan2(B[1] - A[1], B[0] - A[0]); };
      const flat = (x) => [D.X0 + x * D.U, D.LANE, D.DZ];
      rot = (ang(world(xm - 2, 0, D.LANE), world(xm, 0, D.LANE)) - ang(flat(xm - 2), flat(xm))) * 180 / Math.PI;
      p = world(xm, 0.4, D.LANE);
      const drop = Math.max(0, f.t - 1.2);
      p[2] = Math.max(p[2] - 40 * drop * drop, 1);
    }
    const s = iso(p, P), o = iso([0, 0, 0], P);
    c.el.setAttribute("transform", "translate(" + (s[0] - o[0]).toFixed(1) + " " + (s[1] - o[1]).toFixed(1) + ")" + (rot ? " rotate(" + rot.toFixed(1) + " " + o[0].toFixed(1) + " " + o[1].toFixed(1) + ")" : ""));
    c.el.style.display = c.x < -D.APPROACH + 0.5 ? "none" : "";
    c.el.style.opacity = String(clamp((c.x + D.APPROACH - 0.5) / 2.5, 0, 1));
  });
  // splash and snap
  let sh = "";
  if (f && f.t > 0.6) {
    const r = Math.min(1, (f.t - 0.6) / 1.5);
    for (const xm of [breakX * 0.5, breakX + (D.SPAN - breakX) * 0.5]) { const c = sp([D.X0 + xm * D.U, 0, 0.2]); sh += '<ellipse class="splash" cx="' + c[0] + '" cy="' + c[1] + '" rx="' + (10 + 60 * r).toFixed(1) + '" ry="' + (4 + 24 * r).toFixed(1) + '" style="opacity:' + (1 - r).toFixed(2) + '"/>'; }
  }
  splashG.innerHTML = sh;
  if (now - snapAt < 0.5 && snapped >= 0) {
    const m = g.M[snapped], a = J[m.a], b = J[m.b], c = sp(a.f.map((v, k2) => v + (b.f[k2] - v) * 0.45)), r = (now - snapAt) * 40;
    els.snap.innerHTML = '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="' + (3 + r).toFixed(1) + '" class="snapring" style="opacity:' + (1 - (now - snapAt) * 2).toFixed(2) + '"/>';
  } else els.snap.innerHTML = "";
  const tons = cars.reduce((a, c) => a + onSpanTons(c), 0);
  const text = fallAt !== null ? "COLLAPSED" : (cars.length ? Math.round(tons) + " t on the span · " : "empty · ") + "worst member " + Math.round(worst.util * 100) + " %";
  if (readout.textContent !== text) readout.textContent = text;
}
function onSpanTons(c) { const s = VEH[c.kind]; let t = 0; for (const [off, fr] of s.axles) { const x = c.x - off; if (x >= 0 && x <= D.SPAN) t += s.t * fr; } return t; }

function solve() {
  if (!u0) { const r0 = solveTruss(g, loadsFor(g, []), new Set()); u0 = r0.u; }
  res = solveTruss(g, loadsFor(g, fallAt === null ? cars.filter((c) => !c.fell) : []), broken);
  worst = { util: 0, i: -1 };
  if (!res.mech) res.forces.forEach((fr, i) => { if (!broken.has(i) && fr.util > worst.util) worst = { util: fr.util, i }; });
}
const NAMES = { bottom: "bottom chord", top: "top chord", end: "end post", vert: "vertical", diag: "diagonal" };
function failMember(i, why) {
  broken.add(i); snapped = i; snapAt = now;
  const m = g.M[i], xm = (g.J[m.a][0] + g.J[m.b][0]) / 2;
  breakX = clamp(xm, 4, D.SPAN - 4);
  solve();
  if (res.mech) { fallAt = now + 0.15; event(why + " It's a statically determinate truss: no spare members, so losing one turns it into a mechanism. Down it goes."); }
}
function cut(i) {
  takeOver();
  if (fallAt !== null || broken.has(i)) return;
  failMember(i, "You cut a " + NAMES[g.M[i].type] + ".");
  run();
}

function step(dt) {
  if (fallAt !== null) {
    cars.forEach((c) => {
      if (!c.fell) return;
      // dragged down the slope towards the break
      const t = now - fallAt, v = 14 * Math.max(0, t - 0.3);
      const mid = c.x - VEH[c.kind].len / 2;
      if (mid <= breakX) c.x = Math.min(c.x + v * dt, breakX + VEH[c.kind].len * 0.6); else c.x = Math.max(c.x - v * dt, breakX + 2);
    });
    if (now - fallAt > 5.5) { fallAt = null; broken.clear(); cars.forEach((c) => c.wrap && c.wrap.remove()); cars = []; snapped = -1; buildBridge(); solve(); event("New bridge. Same design, same steel."); }
    return;
  }
  // traffic: everyone drives at the same speed, keeps a gap, and stops if there's a jam
  const sorted = cars.slice().sort((a, b) => b.x - a.x);
  sorted.forEach((c, i) => {
    let vx = SPEED;
    const lead = sorted[i - 1];
    const stopAt = jam ? D.SPAN - 2 : Infinity;
    let limit = i === 0 ? stopAt : lead.x - VEH[lead.kind].len - 4;
    if (i > 0 && jam === false && lead.x - VEH[lead.kind].len - 4 < c.x + vx * dt) limit = lead.x - VEH[lead.kind].len - 4;
    c.x = Math.min(c.x + vx * dt, Math.max(c.x, limit));
  });
  cars = cars.filter((c) => { if (c.x - VEH[c.kind].len > D.SPAN + D.APPROACH) { c.wrap && c.wrap.remove(); return false; } return true; });
  if (stream && now >= streamAt) { send("car"); streamAt = now + stream; }
  solve();
  if (res.mech) return;
  if (worst.util > 1) {
    const m = g.M[worst.i], fr = res.forces[worst.i];
    failMember(worst.i, "The " + NAMES[m.type] + " hit " + Math.round(worst.util * 100) + " % and " + (fr.N >= 0 ? "pulled apart" : "buckled") + ".");
  }
}
function send(kd) {
  const back = cars.reduce((a, c) => Math.min(a, c.x - VEH[c.kind].len - 4), -D.APPROACH + VEH[kd].len * 0 + 1e9);
  const x = Math.min(-D.APPROACH + 2, back);
  cars.push({ kind: kd, x, el: null, fell: false });
}

const ui = {
  send: [...document.querySelectorAll("[data-send]")], kind: [...document.querySelectorAll("[data-kind]")],
  jam: document.querySelector("#jam"), stream: document.querySelector("#stream"), fresh: document.querySelector("#fresh"), clear: document.querySelector("#clear"),
  uFill: document.querySelector("#u-fill"), uOut: document.querySelector("#u-out"), tFill: document.querySelector("#t-fill"), tOut: document.querySelector("#t-out"),
  stats: document.querySelector("#stats"), slow: document.querySelector("#slow"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"),
};
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };
function syncUi() {
  ui.kind.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.kind === kind)));
  ui.jam.setAttribute("aria-pressed", String(jam)); ui.jam.textContent = jam ? "Let them go" : "Jam on the bridge";
  ui.stream.setAttribute("aria-pressed", String(!!stream));
  const u = fallAt !== null ? 0 : worst.util;
  ui.uFill.style.width = (clamp(u / 1.2, 0, 1) * 100).toFixed(1) + "%"; ui.uFill.dataset.state = u > 1 ? "bad" : u > 0.85 ? "warn" : "ok";
  ui.uOut.textContent = fallAt !== null ? "—" : Math.round(u * 100) + " %";
  const tons = cars.reduce((a, c) => a + onSpanTons(c), 0);
  ui.tFill.style.width = (clamp(tons / 200, 0, 1) * 100).toFixed(1) + "%"; ui.tFill.dataset.state = tons > 130 ? "warn" : "ok";
  ui.tOut.textContent = Math.round(tons) + " t";
  const wm = worst.i >= 0 ? g.M[worst.i] : null, wf = worst.i >= 0 && res && !res.mech ? res.forces[worst.i] : null;
  ui.stats.innerHTML = fallAt !== null ? "<b>collapsed</b>" : wm ? "working hardest: the <b>" + NAMES[wm.type] + "</b>, " + (wf.N >= 0 ? "<b>tension</b> " : "<b>compression</b> ") + Math.round(Math.abs(wf.N)) + " kN · " + (kind === "pratt" ? "Pratt" : "Howe") + " truss" : "";
  ui.slow.setAttribute("aria-pressed", String(slow)); ui.tour.setAttribute("aria-pressed", String(touring));
}
function story() {
  if (now - lastEventAt < 5 && lastEvent) return say(lastEvent);
  if (fallAt !== null) return;
  const types = new Set(cars.map((c) => c.kind));
  if (touring && tourStep >= 0) return say(TOUR[tourStep].say + " Worst member " + Math.round(worst.util * 100) + " %.");
  if (!cars.length) return say("A 48 m steel truss, already carrying its own weight. Red members are in tension, blue in compression, and the brighter they are the closer they are to their limit. Send something over, or tap a member to cut it.");
  if (worst.util > 0.9) return say("That's " + Math.round(worst.util * 100) + " % in the " + NAMES[g.M[worst.i].type] + ". Not much left.");
  if (jam && cars.some((c) => c.x > 0 && c.x < D.SPAN + 5)) return say("Jammed: everything's stopped on the span, so its full weight sits there at once. Worst member " + Math.round(worst.util * 100) + " %.");
  if (kind === "howe" && types.size) return say("A Howe truss: same steel, but the long diagonals are in compression (blue), and long things in compression buckle. Worst member " + Math.round(worst.util * 100) + " %.");
  return say("Watch the colours move with the load: the bottom chord pulls, the top chord pushes, and the diagonals near the load light up. Worst member " + Math.round(worst.util * 100) + " %.");
}

const TOUR = [
  { say: "Cars. A car is 1.5 t on a bridge carrying about 100 t of its own steel and deck: the colours barely move.", kind: "pratt", acts: [[0.3, "stream"], [7, "nostream"], [10, "end"]] },
  { say: "A B-double (62.5 t), then a triple road train (about 120 t). Watch the bottom chord go red and the sag grow under the drive axles.", kind: "pratt", acts: [[0.3, "bdouble"], [3.2, "roadtrain"], [12, "end"]] },
  { say: "Now jam them. Traffic stopped on the span puts its whole weight there at once, which is what bridges are actually designed around.", kind: "pratt", acts: [[0.3, "jam"], [0.4, "bdouble"], [2.8, "bdouble"], [5.2, "bus"], [10, "unjam"], [15, "end"]] },
  { say: "Same span, Howe truss. Its long diagonals are in compression, and long, thin things in compression buckle. Here comes the road train.", kind: "howe", acts: [[0.3, "bdouble"], [5, "roadtrain"], [16, "end"]] },
  { say: "No overload this time. Somebody cuts one diagonal.", kind: "pratt", acts: [[0.3, "bus"], [2.6, "cut"], [9.5, "end"]] },
  { say: "And a 620 t mining haul truck, because why not.", kind: "pratt", acts: [[0.3, "haul"], [10, "end"]] },
];
function setKind(v) { kind = v; g = trussGeom(kind); u0 = null; broken.clear(); fallAt = null; buildBridge(); cars.forEach((c) => c.wrap && c.wrap.remove()); cars.forEach((c) => (c.el = c.wrap = null)); solve(); }
function tick(t) {
  const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
  last = t;
  const sdt = dt * (slow ? 0.15 : 1);
  now += sdt;
  if (touring && fallAt === null) {
    tourClock += sdt;
    if (tourStep < 0 || actions.length === 0) {
      tourStep = (tourStep + 1) % TOUR.length;
      cars.forEach((c) => c.wrap && c.wrap.remove()); cars = []; jam = false; stream = 0;
      setKind(TOUR[tourStep].kind);
      actions = TOUR[tourStep].acts.map(([w, a]) => [tourClock + w, a]);
    }
    while (actions.length && tourClock >= actions[0][0]) {
      const a = actions.shift()[1];
      if (VEH[a]) send(a); else if (a === "stream") { stream = 0.9; streamAt = now; } else if (a === "nostream") stream = 0;
      else if (a === "jam") jam = true; else if (a === "unjam") jam = false;
      else if (a === "cut") { const i = g.M.findIndex((m) => m.type === "diag"); failMember(i, "Someone cut a diagonal."); }
      else if (a === "end") actions = [];
    }
  }
  step(sdt); draw(); syncUi(); story();
  const idle = !touring && !cars.length && fallAt === null && now - snapAt > 1;
  frame = visible && !idle ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { if (touring) { touring = false; actions = []; stream = 0; } };
const guard = (fn) => (...a) => { takeOver(); if (fallAt !== null) return; fn(...a); solve(); draw(); syncUi(); story(); run(); };
const doSend = guard((kd) => send(kd));
const doKind = guard((v) => setKind(v));
const doJam = guard(() => { jam = !jam; });
const doStream = guard(() => { stream = stream ? 0 : 0.9; streamAt = now; });
const doFresh = guard(() => { cars.forEach((c) => c.wrap && c.wrap.remove()); cars = []; jam = false; stream = 0; setKind(kind); });
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;
ui.send.forEach((b) => b.addEventListener("click", () => doSend(b.dataset.send)));
ui.kind.forEach((b) => b.addEventListener("click", () => doKind(b.dataset.kind)));
ui.jam.addEventListener("click", doJam);
ui.stream.addEventListener("click", doStream);
ui.fresh.addEventListener("click", doFresh);
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; tourClock = 0; actions = []; } run(); });
stage.addEventListener("keydown", (ev) => {
  const map = { "1": () => doSend("car"), "2": () => doSend("bus"), "3": () => doSend("bdouble"), "4": () => doSend("roadtrain"), "5": () => doSend("haul"), j: doJam, h: () => doKind(kind === "pratt" ? "howe" : "pratt"), r: doFresh, s: () => { slow = !slow; run(); } };
  if (map[ev.key]) { ev.preventDefault(); map[ev.key](); }
});
window.__fig = { freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
solve(); draw(); syncUi(); story();
`;

const CSS = `.fx-stage{position:relative}
.iso-plate{overflow:hidden}
.fx-stage{--rest:var(--anatomy-mid)}
.river{fill:#2c5d8a;opacity:.55}body[data-theme="light"] .river{fill:#8fb8dc;opacity:.7}
.ripple{fill:none;stroke:#9cc4e8;stroke-width:.7;opacity:.5}
.road .iso-fill,.road .iso-shade,.road .iso-top{fill:#3a3a3a}body[data-theme="light"] .road .iso-fill,body[data-theme="light"] .road .iso-top{fill:#8a8a8a}
.mem{stroke-linecap:round;fill:none}
.mem.t-bottom,.mem.t-top,.mem.t-end{stroke-width:3.2}.mem.t-vert,.mem.t-diag{stroke-width:2.2}
.mem.back{opacity:.55}
.mem[data-hot="true"]{animation:hot .5s infinite alternate}
@keyframes hot{to{stroke-width:4.4}}
.hit{stroke:transparent;stroke-width:12;stroke-linecap:round;cursor:pointer;pointer-events:stroke}
.fronttruss [data-fm]:hover .mem{stroke-dasharray:4 2}
.brace{stroke:var(--anatomy-lo);stroke-width:1}
.deck{fill:var(--anatomy-face,#ddd);stroke:var(--anatomy-mid);stroke-width:.6;opacity:.9}
body[data-theme="dark"] .deck{fill:#4a4a4a}
.deck-edge{fill:none;stroke:var(--anatomy-mid);stroke-width:1}
.veh .iso-fill,.veh .iso-shade{fill:color-mix(in srgb,var(--paint),#000 25%)}.veh .iso-top{fill:var(--paint)}
.veh .glass .iso-fill,.veh .glass .iso-shade,.veh .glass .iso-top{fill:#9cc4e8}
.veh .trailer .iso-fill,.veh .trailer .iso-shade{fill:#b9bdc2}.veh .trailer .iso-top{fill:#dfe2e5}
.veh .tyre .iso-fill,.veh .tyre .iso-shade,.veh .tyre .iso-top{fill:#222}
.splash{fill:none;stroke:#cfe6ff;stroke-width:2}
.snapring{fill:none;stroke:#ffd36a;stroke-width:2}
.ctl{display:grid;gap:12px;margin:14px 0 6px;font-family:var(--anatomy-mono);font-size:12px;color:var(--anatomy-mid)}
.ctl-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ctl-label{min-width:72px;text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:var(--anatomy-lo)}
.ctl button{font:inherit;color:var(--anatomy-mid);background:transparent;border:1px solid var(--anatomy-lo);border-radius:6px;padding:7px 10px;cursor:pointer;line-height:1.15;text-align:left;min-height:36px}
.ctl button:hover{border-color:var(--anatomy-mid)}
.ctl button[aria-pressed="true"]{color:var(--anatomy-lit);border-color:var(--anatomy-lit)}
.ctl button small{display:block;font-size:10px;color:var(--anatomy-lo)}
.ctl [data-send="haul"],.ctl #fresh{border-color:#ff6a3d;color:#ff6a3d}
.ctl output{min-width:72px;text-align:right;color:var(--anatomy-hi,var(--anatomy-mid))}
.meter{position:relative;flex:1;min-width:110px;height:10px;margin-top:14px;border:1px solid var(--anatomy-lo);border-radius:5px}
.meter .fill{position:absolute;left:0;top:0;bottom:0;border-radius:4px;transition:width .1s;background:var(--anatomy-mid)}
.meter .fill[data-state="ok"]{background:#3ddc84}.meter .fill[data-state="warn"]{background:#ffb347}.meter .fill[data-state="bad"]{background:#ff5a2a}
.mark{position:absolute;top:-14px;bottom:-3px;width:0;border-left:1px dashed #ff6a3d;pointer-events:none}
.mark::after{content:attr(data-label);position:absolute;top:0;left:4px;font-size:10px;white-space:nowrap;color:#ff6a3d}
.key-t{display:inline-block;width:18px;height:3px;border-radius:2px;vertical-align:middle;margin:0 4px 0 8px}
#stats{font-size:12px;color:var(--anatomy-mid);line-height:1.5}#stats b{color:var(--anatomy-hi,var(--anatomy-mid));font-weight:600}
#shot{min-height:3.6em;font-size:12px;line-height:1.4}
@media (max-width:520px){.ctl-label{min-width:52px}.ctl button{padding:7px 8px}.ctl output{min-width:60px}.ctl button small{display:none}}`;

const stageHtml = `<div class="iso-stage fx-stage" tabindex="0" role="group" aria-label="Truss bridge: 1 to 5 send a car, bus, B-double, road train or haul truck; J jams the traffic; H swaps Pratt and Howe; tap a member to cut it">${svg}</div>`;

const CONTROLS = `<div class="ctl" role="group" aria-label="Controls">
  <div class="ctl-row"><span class="ctl-label">Send</span><button type="button" data-send="car">Car<small>1.5 t</small></button><button type="button" data-send="bus">Bus<small>18 t</small></button><button type="button" data-send="bdouble">B-double<small>62.5 t</small></button><button type="button" data-send="roadtrain">Road train<small>120 t</small></button><button type="button" data-send="haul">Haul truck<small>620 t</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Traffic</span><button type="button" id="stream" aria-pressed="false">Stream of cars</button><button type="button" id="jam" aria-pressed="false">Jam on the bridge</button></div>
  <div class="ctl-row"><span class="ctl-label">Truss</span><button type="button" data-kind="pratt" aria-pressed="true">Pratt<small>diagonals in tension</small></button><button type="button" data-kind="howe" aria-pressed="false">Howe<small>diagonals in compression</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Worst</span><div class="meter"><span id="u-fill" class="fill"></span><span class="mark" style="left:${(100 / 120 * 100).toFixed(1)}%" data-label="100 % = it goes"></span></div><output id="u-out">0 %</output></div>
  <div class="ctl-row"><span class="ctl-label">On span</span><div class="meter"><span id="t-fill" class="fill"></span></div><output id="t-out">0 t</output></div>
  <div class="ctl-row"><span class="ctl-label">Forces</span><span id="stats"></span></div>
  <div class="ctl-row"><span class="ctl-label">Key</span><span><span class="key-t" style="background:#ff4a3d"></span>tension<span class="key-t" style="background:#3d8bff"></span>compression · tap a member to cut it</span></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="fresh">New bridge</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
  <div id="shot" aria-live="polite"></div>
</div>`;

const card = k.plateHtml({
  fig: "Fig 19",
  title: "Truss bridge",
  hint: "Tap a member: cut it",
  readout: "",
  keys: [
    { mark: "lit", label: "Member force: red tension, blue compression, brighter = closer to its limit; sag drawn 120× bigger" },
    { mark: "raised", label: "48 m steel truss bridge, abutments, river, and whatever you send over it" },
  ],
  caption: "A truss carries load by turning it into pure push and pull along straight members. Put a load on the deck and the bottom chord stretches (tension), the top chord squashes (compression), and the diagonals near the load share it out to the supports. Steel is as strong in tension as in compression, but a long, thin member in compression buckles well before the steel itself gives up. That's the whole difference between these two: a Pratt truss puts its long diagonals in tension, a Howe puts them in compression, so the same steel carries less. And a simple truss like this has no spare members. Lose any one of them, by overload or by cutting it, and it's a mechanism.",
  body: stageHtml,
});

const other = theme === "light" ? ["index.html", "Dark version"] : ["light.html", "Light version"];
const FOOT = `<p style="font-family:var(--anatomy-mono);font-size:11px;color:var(--anatomy-lo);margin:28px 0 8px;line-height:1.6">A toy, not a bridge design. Real: the stiffness method for a pin-jointed truss, tension and compression, Euler buckling for compression members, Pratt against Howe, and a determinate truss becoming a mechanism. Typical: B-double 62.5 t, triple road train about 120 t, a big loaded mining haul truck about 620 t. Made up: the member sizes, the dead load, the speeds, no impact factor, and the sag drawn 120 times bigger (dead-load sag left out, as if the bridge were cambered).<br>Built with <a href="https://github.com/wheresryan22/anatomy" style="color:inherit">Anatomy</a> by Ryan (MIT). · <a href="${other[0]}" style="color:inherit">${other[1]}</a> · <a href="../" style="color:inherit">More figures</a> · <a href="https://github.com/Dizzyfer/Anatomy/tree/main/truss" style="color:inherit">Source</a></p>`;
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "Truss bridge", theme, body: `<style>${CSS}</style>${card.replace("<figcaption", CONTROLS + "<figcaption")}${FOOT}`, script: kitScript() + LIVE.replace("__DATA__", JSON.stringify(DATA)), width: 700 }));
console.log("wrote", name);
