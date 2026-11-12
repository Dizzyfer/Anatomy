import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { engineScript, stageHtml, pageMk2, footHtml } from "../../mk2/shell.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const W = 960, H = 600;

// The lock is cut in half down the middle of the plug, and the section faces you. Everything on the section
// is drawn in its own 2D coordinates: u runs along the lock (→ toward the keyway), v runs down.
const FACE = { x0: -60, z0: 62, len: 112 };
const SHEAR = 34, PLUG_BOT = 56, KEYWAY = [44, 56], REST = 53;
const PINS = [22, 38, 54, 70, 86];
const CH_TOP = 6, PIN_W = 6, DRIVER = 10;
const PLATE = { x: -76, y: -40, w: 200, d: 80, r: 8 };
const P = k.fitProjection([...k.boxCorners(PLATE, -0.8, 0), [-60, -18, 66], [52, 18, 66], [52, -18, 66], [120, 0, 30]], W, H, { pad: 40, azimuth: 45, elevation: 30 });
const DATA = { W, H, P, PLATE };
Object.assign(DATA, { PINS, SHEAR, REST, CH_TOP, DRIVER, PIN_W, KEYWAY, PLUG_BOT, LEN: FACE.len, X0: FACE.x0, Z0: FACE.z0 });
const LIVE = `
${engineScript()}
const D = __DATA__;
const stage = document.querySelector(".mk-stage");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lightTheme = document.body.dataset.theme === "light";
const E = mk2(stage, D.P, { W: D.W, H: D.H, pivot: [-4, 0, 30], plate: { ...D.PLATE, h: 10, foot: 5 }, shadowBox: [-84, -48, -16, 132, 48, 74] });
const { box, cyl, prism, circle, lathe, tube, sphere, loft, roundPoly, rrect, tris } = E;
E.bindTools(stage);
const xbtn = stage.querySelector('[data-mk="xray"]');
const setX = (on) => { E.setXray(on); if (xbtn) xbtn.setAttribute("aria-pressed", String(on)); };
const sceneG = stage.querySelector('[data-part="scene"]');
const iso = (p) => E.project(p), depthOf = (p) => E.depthOf(p);
const shakeEls = [stage.querySelector(".mk-gl"), stage.querySelector(".mk-over")];
// a tap on the stage that isn't a drag or a press on the toolbar
const onTap = (fn) => { let d0 = null; stage.addEventListener("pointerdown", (ev) => { d0 = ev.target.closest(".mk-tools,button,a") ? null : [ev.clientX, ev.clientY]; }); stage.addEventListener("pointerup", (ev) => { if (d0 && Math.hypot(ev.clientX - d0[0], ev.clientY - d0[1]) < 6) fn(ev); d0 = null; }); };
// 3x4 matrix for a cached object turning about a vertical axis through (cx, cy)
const rotZ = (cx, cy, a) => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1, cx - c * cx + s * cy, cy - s * cx - c * cy, 0]; };
const mixHex = (a, b, t) => { const h = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16)), A = h(a), B = h(b); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * Math.min(1, Math.max(0, t))).toString(16).padStart(2, "0")).join(""); };
const setShake = (x, y) => { const t = x || y ? "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px)" : ""; for (const e of shakeEls) if (e.style.transform !== t) e.style.transform = t; };
const N = D.PINS.length, TOL = 1.3, FAST = 26, MAXLIFT = 15;

let kind = "standard", tension = 0, sel = 2, pickLift = 0, tip = 0, raking = false, rakeT = 0, keyMode = "", open = false, openAt = -10;
let pins = [], order = [], lastShot = "", lastEvent = "", lastEventAt = -10;
let frame = 0, last = 0, now = 0, visible = false, touring = true, slow = false, tourClock = 0, tourStep = -1, actions = [], auto = null;
function newLock() {
  const ks = [7, 8, 9, 10, 11, 12, 13, 14].sort(() => Math.random() - 0.5);
  order = [...Array(N).keys()].sort(() => Math.random() - 0.5);
  pins = D.PINS.map((u, i) => ({ k: ks[i], set: false, over: false, fs: false, lift: 0, prev: 0, ping: -10 }));
  reset();
}
function reset() { pins.forEach((p) => { p.set = p.over = p.fs = false; p.lift = 0; p.prev = 0; }); open = false; keyMode = ""; raking = false; pickLift = 0; tip = 0; }
newLock();
const need = (p) => D.REST - p.k - D.SHEAR; // lift that puts the top of the key pin on the shear line
const event = (t) => { lastEvent = t; lastEventAt = now; };
const binding = () => { if (tension < 0.12 || open) return -1; for (const i of order) if (!pins[i].set) return i; return -1; };
const spool = () => kind === "security";

function step(dt) {
  // what's pushing each pin up: the pick on one, the rake on all, or the key
  // the pick moves like a hand, not a teleport
  tip += clamp(pickLift * MAXLIFT - tip, -40 * dt, 14 * dt);
  const target = pins.map((p, i) => {
    if (keyMode === "right") return need(p);
    if (keyMode === "wrong") return clamp(need(p) + [3, -2, 2.5, -3, 2][i], 0, MAXLIFT);
    if (raking) return clamp(5 + 5 * Math.sin(rakeT * 9 + i * 1.7) + 3 * Math.sin(rakeT * 23 + i * 0.6), 0, MAXLIFT);
    return i === sel ? tip : 0;
  });
  if (raking) rakeT += dt;
  if (tension < 0.12) {
    if (pins.some((p) => p.set || p.over) && !keyMode) event(tension < 0.02 ? "Tension off: every pin drops back down. Start again." : "Not enough tension: the set pins dropped back down.");
    pins.forEach((p) => { p.set = p.over = p.fs = false; });
  }
  const b = binding();
  pins.forEach((p, i) => {
    const want = target[i], n = need(p);
    p.prev = p.lift;
    if (keyMode) { p.over = false; p.lift = want; return; }
    if (p.over) { p.lift = n + 3.2; return; }
    if (p.set) {
      // keep shoving a pin after it's set and the key pin follows the driver up past the shear line
      if (!raking && i === sel && want > n + 3 && tension >= 0.12 && !open) { p.set = false; p.over = true; p.lift = n + 3.2; event("Overset. You kept pushing after the click: the key pin's followed the driver up past the shear line and jammed there. Lift until it clicks, then stop. Drop the tension to start again."); return; }
      p.lift = Math.min(want, n); return;
    }
    if (i === b) {
      if (tension > 0.72 && want > p.lift) { if (want > p.lift + 0.5) event("Too much tension: the binding pin's jammed so hard it won't lift. Ease off."); p.lift = Math.min(want, p.lift + 0.02); return; }
      // a spool driver catches early: a false set
      if (spool() && !p.fs && p.lift < n - 2 && want >= n - 2) {
        if (tension > 0.35) { p.fs = true; p.lift = n - 2; event("False set. The spool's waist caught on the shear line and the plug turned a bit further. It feels like progress and it isn't. Ease the tension so the plug counter-rotates, and lift that pin a touch more."); return; }
      }
      if (p.fs) {
        if (tension > 0.35) { p.lift = n - 2; return; }
        if (want >= n - 0.4) { p.fs = false; p.set = true; p.lift = n; p.ping = now; event("Got it: eased the tension, the plug counter-rotated past the spool, and it set properly."); return; }
        p.lift = Math.min(want, n - 0.5); return;
      }
      if (p.lift < n && want >= n) {
        if (raking && want > n + TOL && Math.random() < 0.2) { p.over = true; p.lift = n + 3.2; event("Overset: the rake shoved a binding pin straight past the shear line and it jammed. Drop the tension and start again."); return; }
        p.set = true; p.lift = n; p.ping = now; event("Click. Pin " + (i + 1) + " set: the driver pin's sitting on the plug's ledge above the shear line, and the plug turns a hair more. Find the next one that binds.");
        return;
      }
      p.lift = want;
    } else {
      // not binding: it just springs up and down
      p.lift = want;
    }
  });
  if (!open && tension >= 0.12 && pins.every((p) => p.set || (keyMode === "right" && Math.abs(p.lift - need(p)) < 0.5))) {
    open = true; openAt = now; pins.forEach((p) => (p.set = true));
    event(keyMode === "right" ? "The right key lifts every pin stack so its gap sits exactly on the shear line, and the plug turns. That's all a key is." : "Open. Every driver pin is above the shear line and every key pin below it, so nothing crosses the gap and the plug turns.");
  }
}
const ui = {
  kind: [...document.querySelectorAll("[data-kind]")], pin: [...document.querySelectorAll("[data-pinb]")],
  ten: document.querySelector("#ten"), tenOut: document.querySelector("#ten-out"), lift: document.querySelector("#lift"), liftOut: document.querySelector("#lift-out"),
  rake: document.querySelector("#rake"), key: document.querySelector("#keyb"), wkey: document.querySelector("#wkey"), fresh: document.querySelector("#fresh"),
  slow: document.querySelector("#slow"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"), stats: document.querySelector("#stats"),
};
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };

// ---------------- the lock, in real 3D ----------------
// Section coordinates from the model: u runs along the lock toward the keyway, v runs down from the top of the housing.
const TAU = Math.PI * 2, X = (u) => D.X0 + u, Z = (v) => D.Z0 - v;
const HY = 18, ZB = Z(58), ZC = Z((D.SHEAR + D.PLUG_BOT) / 2), RB = (D.PLUG_BOT - D.SHEAR) / 2, RP = RB - 0.3, SL = 3.6, KW = 1.7, KT = Z(D.KEYWAY[0]) - ZC;
const BRASS = "#c9a24a", BRASS2 = "#dcb963", STEEL = "#c9ced3", KEYPIN = "#e0b04c";
const arc = (r, n = 20) => Array.from({ length: n + 1 }, (_, i) => { const a = -Math.PI / 2 - (Math.PI * i) / n; return [r * Math.cos(a), r * Math.sin(a)]; }); // bottom, round the back, to the top
function bodyProfile(chamber, side) {
  const bore = arc(RB).map(([y, z]) => [y, ZC + z]);
  let pts = [[0, D.Z0], [-HY, D.Z0], [-HY, ZB], [0, ZB]];
  if (!chamber) pts.push(...bore);
  else { for (const p of bore) { if (p[1] > ZC && p[0] > -SL) break; pts.push(p); } pts.push([-SL, ZC + Math.sqrt(RB * RB - SL * SL)], [-SL, Z(D.CH_TOP)], [0, Z(D.CH_TOP)]); }
  return side < 0 ? pts : pts.map(([y, z]) => [-y, z]);
}
function plugProfile(hole, side) {
  const a = arc(RP).reverse(), pts = [], yk = -KW, zk = -Math.sqrt(RP * RP - KW * KW); // top, round the back, to the bottom
  for (const p of a) { if (hole && p[1] > 0 && p[0] > -SL) continue; if (p[1] < 0 && p[0] > yk) break; pts.push(p); }
  if (hole) pts.unshift([-SL, Math.sqrt(RP * RP - SL * SL)]);
  pts.push([yk, zk], [yk, KT]);
  if (hole) pts.push([-SL, KT]); else pts.push([0, KT]);
  return pts.map(([y, z]) => [side < 0 ? y : -y, ZC + z]);
}
// along the lock: webs between the pin chambers, and the chambers themselves
const SEGS = (() => { const s = []; let u = 0; for (const p of D.PINS) { s.push([u, p - SL, false], [p - SL, p + SL, true]); u = p + SL; } s.push([u, D.LEN, false]); return s; })();
function housingStatic() {
  const o = [];
  for (const [u0, u1, ch] of SEGS) o.push(prism(bodyProfile(ch, -1), "x", X(u0), X(u1), BRASS, { mat: "satin", bevel: 0 }));
  o.push(prism(bodyProfile(false, 1), "x", X(0), X(D.LEN), BRASS, { mat: "satin", bevel: 0, xhide: true }));
  // a foot under it
  o.push(prism(rrect(X(0) - 4, X(D.LEN) + 4, -HY - 4, HY + 4, 2), "z", 0, ZB, "#3a3d42", { mat: "paint" }));
  return o;
}
function plugStatic() {
  const o = [];
  for (const [u0, u1, ch] of SEGS) o.push(prism(plugProfile(ch, -1), "x", X(u0) + 0.02, X(u1) - 0.02, BRASS2, { mat: "satin", bevel: 0 }));
  o.push(prism(plugProfile(false, 1), "x", X(0) + 0.02, X(D.LEN) + 0.6, BRASS2, { mat: "satin", bevel: 0, xhide: true }));
  return o;
}
let plugA = 0, showLabels = true;
const rotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c, 0, ZC * s, ZC - c * ZC]; };
function draw(dt = 0) {
  // the plug turns a hair under tension, more at a false set, and all the way when it's open
  const fsAny = pins.some((p) => p.fs);
  const rot = open ? 1 : tension < 0.12 ? 0 : 0.06 + 0.03 * pins.filter((p) => p.set).length + (fsAny ? 0.22 : 0);
  const target = open ? Math.PI / 2 : (rot * 30 * Math.PI) / 180;
  plugA += (target - plugA) * Math.min(1, dt > 0 ? dt * (open ? 5 : 14) : 1);
  const c = Math.cos(plugA), s = Math.sin(plugA), turn = (p) => { const dy = p[1], dz = p[2] - ZC; return [p[0], dy * c - dz * s, ZC + dy * s + dz * c]; };
  const fixed = [], moving = [];
  D.PINS.forEach((u, i) => {
    const p = pins[i], keyTop = D.REST - p.k - p.lift, keyBot = D.REST - p.lift;
    // a set pin's driver rests on the plug's ledge; its key pin is free below the shear line
    const drvBot = p.set ? Math.min(D.SHEAR, keyTop) : p.over ? D.SHEAR - 3.2 : keyTop, drvTop = drvBot - D.DRIVER, w = D.PIN_W / 2 - 0.15;
    const kb = Z(keyBot), kt = Z(keyTop);
    (p.over ? fixed : moving).push(lathe([[0, kb], [0.9, kb], [w, kb + 2.2], [w, kt - 0.5], [w - 0.5, kt], [0, kt]], KEYPIN, { c: [X(u), 0, 0], seg: 16, mat: "metal", emit: i === sel && !keyMode && !raking ? ["#ffe9a8", 0.18] : undefined }));
    const b = Z(drvBot), t = Z(drvTop), state = p.set ? "#3ddc84" : p.fs ? "#ffb347" : p.over ? "#ff5a2a" : null;
    const prof = spool() ? [[0, b], [w, b], [w, b + 2.4], [w * 0.45, b + 2.4], [w * 0.45, t - 2.4], [w, t - 2.4], [w, t], [0, t]] : [[0, b], [w, b], [w, t - 0.8], [w - 0.8, t], [0, t]];
    fixed.push(lathe(prof, state ? mixHex(STEEL, state, 0.55) : STEEL, { c: [X(u), 0, 0], seg: 16, mat: "steel", emit: state ? [state, 0.22] : undefined, emitK: 1 }));
    // the spring above it
    const z0 = Z(D.CH_TOP), z1 = t, sp = [];
    for (let j = 0; j <= 56; j++) { const a = (j / 56) * 7 * TAU; sp.push([X(u) + 2.2 * Math.cos(a), 2.2 * Math.sin(a), z0 + ((z1 - z0) * j) / 56]); }
    fixed.push(tube(sp, 0.42, "#aeb4bb", { seg: 5, mat: "steel" }));
    const age = now - p.ping;
    if (age < 0.5) E.sprite([X(u), 1, Z(D.SHEAR)], 3 + age * 22, "#9ff0c0", 1 - age * 2, true, 1);
  });
  // tools
  const kw = D.KEYWAY, TOOL = "#8f959d", yT = 0;
  const P3 = (u, v) => [X(u), yT, Z(v)];
  if (!keyMode && !raking) {
    const u = D.PINS[sel], tipV = D.REST - pins[sel].lift, a = kw[1] - 1.4;
    fixed.push(tube([P3(D.LEN + 46, a), P3(u + 6, a), P3(u + 2.6, a - 0.5), P3(u + 0.7, (a + tipV) / 2 + 0.6), P3(u, tipV + 0.2)], 0.75, TOOL, { seg: 6, mat: "steel" }), tube([P3(D.LEN + 44, a), P3(D.LEN + 86, a)], 2.4, "#2b2e33", { seg: 8, mat: "plastic" }));
  }
  if (raking) {
    const off = Math.sin(rakeT * 9) * 6, a = kw[1] - 1.4, pts = [P3(D.LEN + 46, a), P3(D.PINS[N - 1] + 6 + off, a)];
    for (let j = N - 1; j >= 0; j--) { const u = D.PINS[j] + off; pts.push(P3(u + 3, a), P3(u, D.REST - pins[j].lift + 0.2), P3(u - 3, a)); }
    fixed.push(tube(pts, 0.7, TOOL, { seg: 5, mat: "steel" }), tube([P3(D.LEN + 44, a), P3(D.LEN + 86, a)], 2.4, "#2b2e33", { seg: 8, mat: "plastic" }));
  }
  if (keyMode) {
    const ring = [[X(D.LEN + 46), Z(kw[1] - 0.6)], [X(6), Z(kw[1] - 0.6)], [X(4), Z(kw[0] + 3)]];
    D.PINS.forEach((u, i) => { const z = Z(D.REST - pins[i].lift); ring.push([X(u - 4), z - 2.2], [X(u - 1), z], [X(u + 1), z], [X(u + 4), z - 2.2]); });
    ring.push([X(D.LEN + 46), Z(kw[0] + 2)]);
    moving.push(prism(ring, "y", -1.1, 1.1, "#d5d9de", { mat: "steel", bevel: 0 }), prism(rrect(X(D.LEN + 44), X(D.LEN + 78), Z(62), Z(36), 7), "y", -1.3, 1.3, "#d5d9de", { mat: "steel" }), prism(circle(X(D.LEN + 68), Z(49), 4, 14), "y", -1.5, 1.5, "#2a2d31", { mat: "matte" }));
  } else if (tension > 0.01) {
    const zk = Z(kw[1] - 0.8);
    moving.push(tube([[X(D.LEN - 8), 0, zk], [X(D.LEN + 2.6), 0, zk], [X(D.LEN + 2.6), 26, zk]], 0.95, "#aeb4bb", { seg: 6, mat: "steel" }));
  }
  const glow = open ? ["#3ddc84", 0.05] : undefined;
  let svg = E.render([{ cache: "house", rev: 0, parts: housingStatic }, { cache: "plug", rev: open ? 1 : 0, m: rotX(plugA), parts: () => plugStatic().map((p) => ({ ...p, emit: glow })) }, { parts: fixed }, { parts: moving, xf: turn }]);
  // the shear line: the gap between plug and housing that everything is about
  const k2 = 0.35 + 0.65 * E.xray;
  for (let u = 0; u < D.LEN; u += 6) E.line([X(u), 0.2, Z(D.SHEAR)], [X(Math.min(D.LEN, u + 3.4)), 0.2, Z(D.SHEAR)], 1.6, lightTheme ? "#d0342c" : "#ff6a5a", 0.9 * k2, !lightTheme);
  // where the front half was: just its outline
  if (E.xray > 0.02) { const a = [X(0), X(D.LEN)], b = [0, HY], c = [ZB, D.Z0], col = lightTheme ? "#2a6fd0" : "#7fd0ff", al = 0.5 * E.xray; for (const x of a) for (const z of c) E.line([x, 0, z], [x, HY, z], 1.2, col, al, !lightTheme); for (const x of a) { E.line([x, HY, c[0]], [x, HY, c[1]], 1.2, col, al, !lightTheme); } for (const z of c) E.line([a[0], HY, z], [a[1], HY, z], 1.2, col, al, !lightTheme); }
  if (showLabels && E.xray > 0.02) {
    const m = E.faceMatrix([X(1.5), 0.2, Z(D.SHEAR - 1.4)], [1, 0, 0], [0, 0, -1]);
    if (m) svg += '<g transform="' + m + '" opacity="' + E.xray.toFixed(2) + '"><text class="sec-t" x="0" y="0" font-size="3.4">shear line</text></g>';
    svg += E.callouts([{ p: [X(D.PINS[0]), 0, Z(D.CH_TOP + 6)], text: "Springs", sub: "push every stack down" }, { p: [X(D.PINS[1]), 2, Z(D.SHEAR - 6)], text: "Driver pins", sub: kind === "security" ? "spools: they catch" : "these block the turn" },
      { p: [X(D.PINS[3]), 2, Z(D.REST - 4)], text: "Key pins", sub: "all different lengths" }, { p: [X(D.LEN - 3), 4, ZC - 4], text: "Plug", sub: "the bit the key turns" }], E.xray, E.fs < 0.62 ? {} : { topL: 70, topR: 80 });
  }
  if (sceneG.innerHTML !== svg) sceneG.innerHTML = svg;
  const text = open ? "OPEN" : "tension " + Math.round(tension * 100) + " % · " + pins.filter((p) => p.set).length + " of " + N + " set" + (pins.some((p) => p.over) ? " · OVERSET" : "") + (fsAny ? " · false set" : "");
  if (readout.textContent !== text) readout.textContent = text;
}
// drag a pin up on the lock itself (anywhere else, a drag turns the view)
const overEl = stage.querySelector(".mk-over");
let drag = null;
function pinAt(ev) {
  const m0 = overEl.getScreenCTM(); if (!m0 || ev.target.closest(".mk-tools,button,a")) return null;
  const pt = overEl.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; const q2 = pt.matrixTransform(m0.inverse());
  let best = -1, bd = ev.pointerType === "touch" ? 22 : 13;
  D.PINS.forEach((u, i) => { const a = E.project([X(u), 0, Z(D.CH_TOP)]), b = E.project([X(u), 0, Z(D.PLUG_BOT)]), t = clamp((q2.y - a[1]) / ((b[1] - a[1]) || 1), 0, 1), d = Math.hypot(q2.x - (a[0] + (b[0] - a[0]) * t), q2.y - (a[1] + (b[1] - a[1]) * t)); if (d < bd) { bd = d; best = i; } });
  if (best < 0) return null;
  const o = E.project([0, 0, 0]), z1 = E.project([0, 0, 1]);
  return { i: best, px: Math.hypot(z1[0] - o[0], z1[1] - o[1]) * Math.hypot(m0.a, m0.b) };
}
stage.addEventListener("pointerdown", (ev) => {
  const hit = pinAt(ev); if (!hit) return;
  ev.stopPropagation();
  if (hit.i !== sel) setSel(hit.i); else takeOver();
  if (tension < 0.12 && !keyMode) { tension = 0.35; event("Added some tension on the wrench for you: without it nothing binds and nothing sets. Now lift that pin slowly until it clicks."); }
  drag = { y: ev.clientY, lift: pickLift, px: hit.px };
  stage.setPointerCapture(ev.pointerId); run();
}, true);
stage.addEventListener("pointermove", (ev) => { if (drag) { setLift(clamp(drag.lift + (drag.y - ev.clientY) / drag.px / MAXLIFT, 0, 1)); return; } if (ev.pointerType !== "touch" && !ev.buttons) stage.style.cursor = pinAt(ev) ? "ns-resize" : ""; });
const endDrag = () => { drag = null; };
stage.addEventListener("pointerup", endDrag); stage.addEventListener("pointercancel", endDrag);

function syncUi() {
  ui.kind.forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.kind === kind)));
  ui.pin.forEach((x) => { x.setAttribute("aria-pressed", String(+x.dataset.pinb === sel)); x.dataset.state = pins[+x.dataset.pinb].set ? "set" : pins[+x.dataset.pinb].over ? "over" : ""; });
  ui.ten.value = Math.round(tension * 100); ui.tenOut.textContent = Math.round(tension * 100) + " %";
  ui.lift.value = Math.round(pickLift * 100); ui.liftOut.textContent = pins[sel].lift.toFixed(1);
  ui.rake.setAttribute("aria-pressed", String(raking));
  ui.key.setAttribute("aria-pressed", String(keyMode === "right")); ui.wkey.setAttribute("aria-pressed", String(keyMode === "wrong"));
  const b = binding();
  ui.stats.innerHTML = "binding: <b>" + (b < 0 ? (open ? "nothing, it's open" : "none") : "pin " + (b + 1)) + "</b> · set <b>" + pins.filter((p) => p.set).length + " of " + N + "</b>" + (pins.some((p) => p.over) ? " · <b>overset</b>" : "") + (pins.some((p) => p.fs) ? " · <b>false set</b>" : "");
  ui.slow.setAttribute("aria-pressed", String(slow)); ui.tour.setAttribute("aria-pressed", String(touring));
}

function story() {
  if (now - lastEventAt < 4 && lastEvent) return say(lastEvent);
  if (open) return say("Open. Hit New lock for a fresh one with a different binding order.");
  if (keyMode === "wrong") return say("Wrong key: the cuts lift some stacks too high and some not high enough, so pins cross the shear line wherever you look. Turn all you like.");
  if (keyMode === "right") return say("The right key: each cut lifts its stack so the gap between key pin and driver pin sits exactly on the shear line. Add tension to turn it.");
  if (raking) return say("Raking: scrubbing the pins up and down with light tension and hoping each binding pin happens to set on the way past. Quick and dumb, and it works on cheap locks." + (kind === "security" ? " Spools make it much harder." : ""));
  const b = binding();
  if (tension < 0.12) return say("No tension: every pin springs up and down freely and nothing ever sets. Add a little tension with the wrench first.");
  return say("Light tension on. The holes are never perfectly in line, so one pin binds first: pin " + (b + 1) + " right now. Lift it slowly until it clicks, then stop. The others just spring back. Drag a pin up on the lock, or use the pin buttons and the Lift slider.");
}

// the demo: a hand that picks
function autoStep(dt) {
  if (!auto) return;
  auto.t += dt;
  if (auto.mode === "spp") {
    const b = binding();
    if (open || b < 0) { auto = null; return; }
    if (sel !== b) { sel = b; pickLift = 0; tip = 0; auto.t = 0; return; }
    if (pins[b].fs) { tension = Math.max(0.3, tension - dt * 0.5); pickLift = Math.min(1, pickLift + dt * 0.05); return; }
    if (spool() && tension < 0.42 && !pins[b].fs) tension = Math.min(0.45, tension + dt * 0.5);
    pickLift = Math.min(1, pickLift + dt * auto.speed / 15);
  }
}
const TOUR = [
  { kind: "standard", acts: [[0.8, "key"], [2.2, "ten"], [6, "end"]] },
  { kind: "standard", acts: [[0.6, "t40"], [2, "spp"], [16, "end"]] },
  { kind: "standard", acts: [[0.6, "t90"], [1.5, "lift"], [6, "end"]] },
  { kind: "standard", acts: [[0.6, "t40"], [1.5, "fast"], [6, "end"]] },
  { kind: "security", acts: [[0.6, "t45"], [2, "spp"], [22, "end"]] },
  { kind: "standard", acts: [[0.6, "t25"], [1, "rake"], [8, "end"]] },
];
function tick(t) {
  const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
  last = t;
  const sdt = dt * (slow ? 0.15 : 1);
  now += sdt;
  if (touring) {
    tourClock += sdt;
    if (tourStep < 0 || actions.length === 0) {
      tourStep = (tourStep + 1) % TOUR.length;
      const s = TOUR[tourStep];
      kind = s.kind; newLock(); tension = 0; auto = null; lastEvent = "";
      actions = s.acts.map(([w, a]) => [tourClock + w, a]);
    }
    while (actions.length && tourClock >= actions[0][0]) {
      const a = actions.shift()[1];
      if (a === "key") keyMode = "right"; else if (a === "ten") tension = 0.4;
      else if (a === "t40") tension = 0.4; else if (a === "t45") tension = 0.45; else if (a === "t90") tension = 0.9; else if (a === "t25") tension = 0.25;
      else if (a === "spp") auto = { mode: "spp", t: 0, speed: 3 };
      else if (a === "lift") { sel = binding(); pickLift = 0.9; }
      else if (a === "fast") { sel = binding(); pickLift = 1; }
      else if (a === "rake") raking = true;
      else if (a === "end") actions = [];
    }
  }
  autoStep(sdt);
  const n = 6;
  for (let i = 0; i < n; i++) step(sdt / n);
  draw(sdt); syncUi(); story();
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { touring = false; actions = []; auto = null; };
const guard = (fn) => (...a) => { takeOver(); fn(...a); run(); };
const setKind = guard((v) => { kind = v; newLock(); tension = 0; });
const setSel = guard((v) => { sel = v; pickLift = 0; tip = 0; keyMode = ""; raking = false; });
const setTen = guard((v) => { tension = v; });
const setLift = guard((v) => { pickLift = v; keyMode = ""; raking = false; });
const toggleRake = guard(() => { raking = !raking; keyMode = ""; pickLift = 0; });
const setKey = guard((v) => { reset(); lastEvent = ""; keyMode = keyMode === v ? "" : v; });
const fresh = guard(() => { newLock(); tension = 0; lastEvent = ""; });
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;

ui.kind.forEach((x) => x.addEventListener("click", () => setKind(x.dataset.kind)));
ui.pin.forEach((x) => x.addEventListener("click", () => setSel(+x.dataset.pinb)));
ui.ten.addEventListener("input", () => setTen(+ui.ten.value / 100));
ui.lift.addEventListener("input", () => setLift(+ui.lift.value / 100));
ui.rake.addEventListener("click", toggleRake);
ui.key.addEventListener("click", () => setKey("right"));
ui.wkey.addEventListener("click", () => setKey("wrong"));
ui.fresh.addEventListener("click", fresh);
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; tourClock = 0; actions = []; } run(); });
stage.addEventListener("keydown", (ev) => {
  const map = { x: () => { setX(!E.xrayOn); run(); }, ArrowLeft: () => setSel(Math.max(0, sel - 1)), ArrowRight: () => setSel(Math.min(N - 1, sel + 1)), ArrowUp: () => setLift(clamp(pickLift + 0.03, 0, 1)), ArrowDown: () => setLift(clamp(pickLift - 0.03, 0, 1)), t: () => setTen(clamp(tension + 0.1, 0, 1)), g: () => setTen(clamp(tension - 0.1, 0, 1)), r: toggleRake, k: () => setKey("right"), n: fresh, s: () => { slow = !slow; run(); } };
  if (map[ev.key]) { ev.preventDefault(); map[ev.key](); }
});
window.__fig = { E, freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
setX(true); draw(); syncUi(); story();
`;

const CSS = `.sec-t{font-family:var(--anatomy-mono);fill:#ff8a7a;font-weight:600}body[data-theme="light"] .sec-t{fill:#c0281e}
.ctl button[data-pinb]{min-width:40px;text-align:center}.ctl button[data-state="set"]{border-color:#3ddc84;color:#3ddc84}.ctl button[data-state="over"]{border-color:#ff5a2a;color:#ff5a2a}`;

const stage = stageHtml({
  W, H, fig: "Fig 14", title: "How a lock gets picked", xray: true,
  label: "A pin tumbler lock: a brass housing with five spring-loaded pin stacks over a plug that turns. An x-ray mode turns the front half to glass so you can see the springs, driver pins, key pins and the shear line, with a pick, a tension wrench or a key in the keyway.",
  keysHelp: "Lock: drag a pin up to lift it, drag anywhere else to rotate, X for x-ray, drag a pin up to lift it; left and right pick a pin, up and down lift, T and G more or less tension, R rakes, K uses the key, N new lock",
  extra: ``,
});

const CONTROLS = `<div class="ctl" role="group" aria-label="Test controls">
  <div class="ctl-row"><span class="ctl-label">Pins</span><button type="button" data-kind="standard" aria-pressed="true">Standard</button><button type="button" data-kind="security" aria-pressed="false">Security<small>spool drivers</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Tension</span><div class="slide"><input id="ten" type="range" min="0" max="100" step="1" value="0" aria-label="Tension on the wrench"></div><output id="ten-out">0 %</output></div>
  <div class="ctl-row"><span class="ctl-label">Pick under</span>${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-pinb="${n - 1}" aria-pressed="${n === 3}">${n}</button>`).join("")}</div>
  <div class="ctl-row"><span class="ctl-label">Lift</span><div class="slide"><input id="lift" type="range" min="0" max="100" step="1" value="0" aria-label="How hard the pick pushes up"></div><output id="lift-out">0.0</output></div>
  <div class="ctl-row wide"><span class="ctl-label">Lock</span><span id="stats"></span></div>
  <div class="ctl-row"><span class="ctl-label">Try</span><button type="button" id="rake" aria-pressed="false">Rake it</button><button type="button" id="keyb" aria-pressed="false">The key</button><button type="button" id="wkey" aria-pressed="false">Wrong key</button><button type="button" id="fresh">New lock</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
</div>`;


const foot = footHtml({
  theme, slug: "lock",
  real: "pin stacks across a shear line, binding from machining tolerance, setting, oversetting, spool pins and false sets, raking.",
  made: "every dimension, the tolerances, how much tension is too much, and how easy it is. Only pick locks you own.",
});
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), pageMk2({
  k, title: "How a lock gets picked", fig: "Fig 14", hint: "Drag a pin up", theme, W, H, stage, controls: CONTROLS, css: CSS, foot,
  caption: "A pin tumbler lock is a plug that can't turn because pin stacks cross the gap between it and the housing: the shear line. The right key lifts each stack so the gap between its key pin and driver pin sits exactly on that line. Picking works because nothing's machined perfectly. Put a little turning force on the plug and one pin binds before the others; lift it until the gap reaches the shear line and the driver catches on the plug's ledge. That's a set pin, and the next one binds. Too much tension and the pin won't lift; too fast and you push it past (an overset). Security pins with a narrow waist catch early and give a false set, and you beat them by easing the tension.",
  script: LIVE.replace("__DATA__", JSON.stringify(DATA)),
}));
console.log("wrote", name);
