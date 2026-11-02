import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { kitScript } from "../../scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";

const W = 640;
const H = 420;

// The lock is cut in half down the middle of the plug, and the section faces you. Everything on the section
// is drawn in its own 2D coordinates: u runs along the lock (→ toward the keyway), v runs down.
const FACE = { x0: -60, z0: 62, len: 112 };
const SHEAR = 34, PLUG_BOT = 56, KEYWAY = [44, 56], REST = 53;
const PINS = [22, 38, 54, 70, 86];
const CH_TOP = 6, PIN_W = 6, DRIVER = 10;
const BLOCK = { x: FACE.x0, y: -26, w: FACE.len, d: 26 };
const PLATE = { x: -76, y: -46, w: 184, d: 66, r: 8 };
const PLATE_H = 12, FOOT_H = 5;

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [BLOCK.x, BLOCK.y, FACE.z0 + 4], [BLOCK.x + BLOCK.w, 0, FACE.z0 + 2]],
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

// the back half of the lock body, a little foot, and the plug face at the keyway end
function body() {
  const out = [];
  out.push(`<path class="iso-halo" d="${k.haloOf({ ...BLOCK, r: 2 }, 0, 0.1, P)}"/>`);
  out.push(S(slab({ x: BLOCK.x - 4, y: BLOCK.y - 4, w: BLOCK.w + 8, d: BLOCK.d + 4 }, 0, 4, 1.5, 0.4), { tone: "mid" }));
  out.push(S(slab({ ...BLOCK }, 4, FACE.z0 - 4, 2, 0.6), { tone: "hi" }));
  // the plug face on the keyway end (+x), turned by the tension
  const m = k.sideMatrix([BLOCK.x + BLOCK.w + 0.02, 0], FACE.z0, P, "right");
  const cy = (SHEAR + PLUG_BOT) / 2, r = (PLUG_BOT - SHEAR) / 2 + 1;
  out.push(`<g transform="${m}"><circle cx="${r + 1}" cy="${cy}" r="${r}" class="plug-face"/><g data-part="face-rot" style="transform-origin:${r + 1}px ${cy}px"><path d="M${r + 1 - 1.4} ${cy - 6}h2.8v9l1.6 2h-6l1.6-2z" class="keyway-face"/></g></g>`);
  return out.join("");
}

// the section itself: static housing and chambers, then the moving parts
function section() {
  const m = k.sideMatrix([FACE.x0, 0.02], FACE.z0, P, "left");
  const chambers = PINS.map((u) => `<rect x="${u - PIN_W / 2 - 0.6}" y="${CH_TOP}" width="${PIN_W + 1.2}" height="${SHEAR - CH_TOP}" class="chamber"/>`).join("");
  const plugCh = PINS.map((u) => `<rect x="${u - PIN_W / 2 - 0.6}" y="${SHEAR}" width="${PIN_W + 1.2}" height="${KEYWAY[0] - SHEAR}" class="chamber"/>`).join("");
  const pinsSvg = PINS.map((u, i) => `<g data-pin="${i}">
      <path data-part="spring${i}" class="spring" d=""/>
      <path data-part="drv${i}" class="driver" d=""/>
      <rect data-part="key${i}" class="keypin" x="${u - PIN_W / 2}" y="0" width="${PIN_W}" height="10" rx="1"/>
      <circle data-part="ping${i}" class="ping" cx="${u}" cy="${SHEAR}" r="0"/>
    </g>`).join("");
  return `<g transform="${m}">
    <rect x="0" y="0" width="${FACE.len}" height="${FACE.z0 - 4}" class="housing"/>
    ${chambers}
    <g data-part="plug"><rect x="0" y="${SHEAR}" width="${FACE.len}" height="${PLUG_BOT - SHEAR}" class="plug"/>${plugCh}<rect x="0" y="${KEYWAY[0]}" width="${FACE.len}" height="${KEYWAY[1] - KEYWAY[0]}" class="keyway"/></g>
    <path d="M0 ${SHEAR}H${FACE.len}" class="shear"/>
    <text x="2" y="${SHEAR - 1.5}" class="sec-t">shear line</text>
    ${pinsSvg}
    <path data-part="key" class="key" d="" style="display:none"/>
    <path data-part="pick" class="pick" d=""/>
    <path data-part="rake" class="pick" d="" style="display:none"/>
    <path data-part="wrench" class="wrench" d=""/>
    <text data-part="open-t" x="${FACE.len / 2}" y="${(SHEAR + PLUG_BOT) / 2 + 3}" class="open-t" text-anchor="middle" style="display:none">OPEN</text>
  </g>`;
}

const svg = k.figureSvg({
  width: W, height: H,
  label: "A pin tumbler lock cylinder cut in half lengthways, so you can see the five pin stacks: key pins at the bottom, driver pins above them, springs on top, and the shear line between the plug and the housing. A pick and a tension wrench sit in the keyway.",
  body: [plate(), body(), section()],
});

// for pointer dragging: where each pin is on screen, and how far one unit of lift is
const pinScreen = PINS.map((u) => at([FACE.x0 + u, 0, FACE.z0 - SHEAR])[0]);
const liftPx = (() => { const a = at([0, 0, 0]), b = at([0, 0, 1]); return Math.hypot(b[0] - a[0], b[1] - a[1]); })();
const DATA = { W, H, PINS, SHEAR, REST, CH_TOP, DRIVER, PIN_W, KEYWAY, PLUG_BOT, LEN: FACE.len, pinScreen, liftPx };

const LIVE = `
const D = __DATA__;
const stage = document.querySelector(".fx-stage");
const q = (n) => stage.querySelector('[data-part="' + n + '"]');
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const N = D.PINS.length, TOL = 1.3, FAST = 26, MAXLIFT = 15;

let kind = "standard", tension = 0, sel = 2, pickLift = 0, raking = false, rakeT = 0, keyMode = "", open = false, openAt = -10;
let pins = [], order = [], lastShot = "", lastEvent = "", lastEventAt = -10;
let frame = 0, last = 0, now = 0, visible = false, touring = true, slow = false, tourClock = 0, tourStep = -1, actions = [], auto = null;
function newLock() {
  const ks = [7, 8, 9, 10, 11, 12, 13, 14].sort(() => Math.random() - 0.5);
  order = [...Array(N).keys()].sort(() => Math.random() - 0.5);
  pins = D.PINS.map((u, i) => ({ k: ks[i], set: false, over: false, fs: false, lift: 0, prev: 0, ping: -10 }));
  reset();
}
function reset() { pins.forEach((p) => { p.set = p.over = p.fs = false; p.lift = 0; p.prev = 0; }); open = false; keyMode = ""; raking = false; pickLift = 0; }
newLock();
const need = (p) => D.REST - p.k - D.SHEAR; // lift that puts the top of the key pin on the shear line
const event = (t) => { lastEvent = t; lastEventAt = now; };
const binding = () => { if (tension < 0.12 || open) return -1; for (const i of order) if (!pins[i].set) return i; return -1; };
const spool = () => kind === "security";

function step(dt) {
  // what's pushing each pin up: the pick on one, the rake on all, or the key
  const target = pins.map((p, i) => {
    if (keyMode === "right") return need(p);
    if (keyMode === "wrong") return clamp(need(p) + [3, -2, 2.5, -3, 2][i], 0, MAXLIFT);
    if (raking) return clamp(5 + 5 * Math.sin(rakeT * 9 + i * 1.7) + 3 * Math.sin(rakeT * 23 + i * 0.6), 0, MAXLIFT);
    return i === sel ? pickLift * MAXLIFT : 0;
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
    if (p.set) { p.lift = Math.min(want, n); return; }
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
      const speed = (want - p.lift) / Math.max(dt, 1e-3);
      if (p.lift < n && want >= n) {
        if (want > n + TOL && speed > FAST) { p.over = true; p.lift = n + 3.2; event("Overset. Pushed too far, too fast: the key pin's gone up past the shear line and jammed there. The only fix is to drop the tension and start over."); return; }
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

const el = (n) => q(n);
const pinEls = D.PINS.map((u, i) => ({ spring: el("spring" + i), drv: el("drv" + i), key: el("key" + i), ping: el("ping" + i) }));
const plugG = el("plug"), keyEl = el("key"), pickEl = el("pick"), rakeEl = el("rake"), wrenchEl = el("wrench"), openT = el("open-t"), faceRot = el("face-rot");
const ui = {
  kind: [...document.querySelectorAll("[data-kind]")], pin: [...document.querySelectorAll("[data-pinb]")],
  ten: document.querySelector("#ten"), tenOut: document.querySelector("#ten-out"), lift: document.querySelector("#lift"), liftOut: document.querySelector("#lift-out"),
  rake: document.querySelector("#rake"), key: document.querySelector("#keyb"), wkey: document.querySelector("#wkey"), fresh: document.querySelector("#fresh"),
  slow: document.querySelector("#slow"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"), stats: document.querySelector("#stats"),
};
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };

function springPath(u, top, bot) {
  const n = 7, w = D.PIN_W / 2 - 0.4, h = (bot - top) / n;
  let d = "M" + u + " " + top;
  for (let j = 0; j < n; j++) d += "L" + (u + (j % 2 ? -w : w)).toFixed(2) + " " + (top + h * (j + 0.5)).toFixed(2);
  return d + "L" + u + " " + bot;
}
function driverPath(u, top, isSpool) {
  const w = D.PIN_W / 2, h = D.DRIVER;
  if (!isSpool) return "M" + (u - w) + " " + (top + 0.8) + "Q" + (u - w) + " " + top + " " + (u - w + 0.8) + " " + top + "H" + (u + w - 0.8) + "Q" + (u + w) + " " + top + " " + (u + w) + " " + (top + 0.8) + "V" + (top + h) + "H" + (u - w) + "Z";
  const nw = w * 0.45;
  return "M" + (u - w) + " " + top + "H" + (u + w) + "V" + (top + 2.4) + "H" + (u + nw) + "V" + (top + h - 2.4) + "H" + (u + w) + "V" + (top + h) + "H" + (u - w) + "V" + (top + h - 2.4) + "H" + (u - nw) + "V" + (top + 2.4) + "H" + (u - w) + "Z";
}

function draw() {
  // the plug turns a hair under tension, more at a false set, and all the way when it's open
  const fsAny = pins.some((p) => p.fs);
  const rot = open ? 1 : tension < 0.12 ? 0 : 0.06 + 0.03 * pins.filter((p) => p.set).length + (fsAny ? 0.22 : 0);
  const shift = open ? 0 : rot * 9;
  plugG.dataset.open = String(open);
  plugG.setAttribute("transform", "translate(" + (-shift).toFixed(2) + " 0)");
  faceRot.style.transform = "rotate(" + (open ? 90 : rot * 30).toFixed(1) + "deg)";
  D.PINS.forEach((u, i) => {
    const p = pins[i], e = pinEls[i];
    const keyTop = D.REST - p.k - p.lift, keyBot = D.REST - p.lift;
    // a set pin's driver rests on the plug's ledge; its key pin is free below the shear line
    const drvBot = p.set ? Math.min(D.SHEAR, keyTop) : p.over ? D.SHEAR - 3.2 - 0 : keyTop;
    const drvTop = drvBot - D.DRIVER;
    e.key.setAttribute("y", keyTop.toFixed(2)); e.key.setAttribute("height", p.k);
    e.key.style.transform = open ? "translateX(" + (-shift) + "px)" : "";

    e.drv.setAttribute("d", driverPath(u, drvTop, spool()));
    e.drv.dataset.state = p.set ? "set" : p.fs ? "fs" : p.over ? "over" : "";
    e.spring.setAttribute("d", springPath(u, D.CH_TOP, drvTop));
    const age = now - p.ping;
    e.ping.setAttribute("r", age < 0.5 ? (2 + age * 16).toFixed(1) : "0");
    e.ping.style.opacity = age < 0.5 ? (1 - age * 2).toFixed(2) : "0";
  });
  // tools
  const kw = D.KEYWAY;
  const showPick = !keyMode && !raking;
  pickEl.style.display = showPick ? "" : "none";
  if (showPick) {
    const u = D.PINS[sel], tip = D.REST - pins[sel].lift;
    pickEl.setAttribute("d", "M" + (D.LEN + 46) + " " + (kw[1] - 1.2) + "H" + (u + 4) + "Q" + (u + 1) + " " + (kw[1] - 1.2) + " " + u + " " + tip.toFixed(2));
  }
  rakeEl.style.display = raking ? "" : "none";
  if (raking) {
    const off = Math.sin(rakeT * 9) * 6;
    let d = "M" + (D.LEN + 46) + " " + (kw[1] - 1.2) + "H" + (D.PINS[N - 1] + 6 + off);
    for (let j = N - 1; j >= 0; j--) { const u = D.PINS[j] + off; d += "L" + (u + 3) + " " + (kw[1] - 1.2) + "L" + u + " " + (D.REST - pins[j].lift).toFixed(2) + "L" + (u - 3) + " " + (kw[1] - 1.2); }
    rakeEl.setAttribute("d", d);
  }
  keyEl.style.display = keyMode ? "" : "none";
  if (keyMode) {
    let d = "M" + (D.LEN + 46) + " " + (kw[1] - 0.6) + "H6L4 " + (kw[0] + 3);
    D.PINS.forEach((u, i) => { const y = (D.REST - pins[i].lift).toFixed(2); d += "L" + (u - 4) + " " + y + "L" + (u - 1) + " " + y + "L" + (u + 1) + " " + y + "L" + (u + 4) + " " + y; });
    d += "L" + (D.LEN + 46) + " " + (kw[0] + 2) + "Z";
    keyEl.setAttribute("d", d);
    keyEl.style.transform = open ? "translateX(" + (-shift) + "px)" : "";
  }
  const wt = tension;
  wrenchEl.style.display = wt > 0.01 || keyMode ? "" : "none";
  wrenchEl.setAttribute("d", "M" + (D.LEN + 1) + " " + (kw[1] - 0.6) + "H" + (D.LEN - 8) + "M" + (D.LEN + 1) + " " + (kw[1] - 0.6) + "L" + (D.LEN + 4 + 10 * wt).toFixed(1) + " " + (kw[1] + 18).toFixed(1));
  wrenchEl.style.display = keyMode ? "none" : wrenchEl.style.display;
  openT.style.display = open ? "" : "none";
  const b = binding();
  const text = open ? "OPEN" : "tension " + Math.round(tension * 100) + " % · " + pins.filter((p) => p.set).length + " of " + N + " set" + (pins.some((p) => p.over) ? " · OVERSET" : "") + (fsAny ? " · false set" : "");
  if (readout.textContent !== text) readout.textContent = text;
}

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
  return say("Light tension on. The holes are never perfectly in line, so one pin binds first: pin " + (b + 1) + " right now. Lift it slowly until it clicks. The others just spring back. Drag a pin on the lock, or use the pin buttons and lift.");
}

// the demo: a hand that picks
function autoStep(dt) {
  if (!auto) return;
  auto.t += dt;
  if (auto.mode === "spp") {
    const b = binding();
    if (open || b < 0) { auto = null; return; }
    if (sel !== b) { sel = b; pickLift = 0; auto.t = 0; return; }
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
  draw(); syncUi(); story();
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { touring = false; actions = []; auto = null; };
const guard = (fn) => (...a) => { takeOver(); fn(...a); run(); };
const setKind = guard((v) => { kind = v; newLock(); tension = 0; });
const setSel = guard((v) => { sel = v; pickLift = 0; keyMode = ""; raking = false; });
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
// drag a pin up on the lock itself
let drag = null;
stage.addEventListener("pointerdown", (ev) => {
  const r = stage.getBoundingClientRect(), sx = ((ev.clientX - r.left) / r.width) * D.W;
  let best = 0; D.pinScreen.forEach((x, i) => { if (Math.abs(x - sx) < Math.abs(D.pinScreen[best] - sx)) best = i; });
  if (best !== sel) setSel(best); else takeOver();
  drag = { y: ev.clientY, lift: pickLift, scale: r.height / D.H };
  stage.setPointerCapture(ev.pointerId); run();
});
stage.addEventListener("pointermove", (ev) => { if (!drag) return; const units = (drag.y - ev.clientY) / drag.scale / D.liftPx; setLift(clamp(drag.lift + units / MAXLIFT, 0, 1)); });
const endDrag = () => { drag = null; };
stage.addEventListener("pointerup", endDrag); stage.addEventListener("pointercancel", endDrag);
stage.addEventListener("keydown", (ev) => {
  const map = { ArrowLeft: () => setSel(Math.max(0, sel - 1)), ArrowRight: () => setSel(Math.min(N - 1, sel + 1)), ArrowUp: () => setLift(clamp(pickLift + 0.03, 0, 1)), ArrowDown: () => setLift(clamp(pickLift - 0.03, 0, 1)), t: () => setTen(clamp(tension + 0.1, 0, 1)), g: () => setTen(clamp(tension - 0.1, 0, 1)), r: toggleRake, k: () => setKey("right"), n: fresh, s: () => { slow = !slow; run(); } };
  if (map[ev.key]) { ev.preventDefault(); map[ev.key](); }
});
window.__fig = { freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; } };
draw(); syncUi(); story();
`;

const CSS = `.fx-stage{position:relative;cursor:ns-resize;touch-action:none}
.iso-plate{overflow:hidden}
.housing{fill:#b9bdc2;stroke:var(--anatomy-mid);stroke-width:.3}
body[data-theme="dark"] .housing{fill:#5d6268}
.plug{fill:#d9b45a;stroke:var(--anatomy-mid);stroke-width:.3;transition:fill .3s}
body [data-open="true"] .plug{fill:#5fbf86}
body[data-theme="dark"] .plug{fill:#a8873a}
.chamber{fill:var(--anatomy-paper);stroke:none}
.keyway{fill:#1d1d1d;opacity:.85}
body[data-theme="light"] .keyway{fill:#3a3a3a;opacity:.75}
.shear{stroke:#ff6a3d;stroke-width:.45;stroke-dasharray:1.6 1.2;fill:none}
.sec-t{font-family:var(--anatomy-mono);font-size:2.4px;fill:#ff6a3d}
.spring{fill:none;stroke:var(--anatomy-mid);stroke-width:.5;stroke-linejoin:round}
.driver{fill:#c8ccd0;stroke:var(--anatomy-mid);stroke-width:.3}
.driver[data-state="set"]{fill:#3ddc84}.driver[data-state="fs"]{fill:#ffb347}.driver[data-state="over"]{fill:#ff5a2a}
.keypin{fill:#e0a64a;stroke:var(--anatomy-mid);stroke-width:.3}
.ping{fill:none;stroke:#3ddc84;stroke-width:.6}
.pick{fill:none;stroke:#3d7bd9;stroke-width:1.1;stroke-linecap:round;stroke-linejoin:round}
.wrench{fill:none;stroke:#cfd2d6;stroke-width:1.4;stroke-linecap:round}
body[data-theme="light"] .wrench{stroke:#6a6f75}
.key{fill:#d8dbe0;stroke:var(--anatomy-mid);stroke-width:.3;opacity:.95}
.open-t{font-family:var(--anatomy-mono);font-size:7px;font-weight:700;fill:#3ddc84;letter-spacing:.2em}
.plug-face{fill:#d9b45a;stroke:var(--anatomy-mid);stroke-width:.4}
body[data-theme="dark"] .plug-face{fill:#a8873a}
[data-part="face-rot"]{transition:transform .25s}
.keyway-face{fill:#1d1d1d}
.ctl{display:grid;gap:12px;margin:14px 0 6px;font-family:var(--anatomy-mono);font-size:12px;color:var(--anatomy-mid)}
.ctl-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ctl-label{min-width:72px;text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:var(--anatomy-lo)}
.ctl button{font:inherit;color:var(--anatomy-mid);background:transparent;border:1px solid var(--anatomy-lo);border-radius:6px;padding:7px 10px;cursor:pointer;line-height:1.15;text-align:left;min-height:36px}
.ctl button:hover{border-color:var(--anatomy-mid)}
.ctl button[aria-pressed="true"]{color:var(--anatomy-lit);border-color:var(--anatomy-lit)}
.ctl button small{display:block;font-size:10px;color:var(--anatomy-lo)}
.ctl [data-pinb]{min-width:40px;text-align:center}
.ctl [data-pinb][data-state="set"]{background:rgba(61,220,132,.18)}.ctl [data-pinb][data-state="over"]{background:rgba(255,90,42,.2)}
.ctl #fresh{border-color:#ff6a3d;color:#ff6a3d}
.slide{position:relative;flex:1;min-width:110px}
.slide input{width:100%;accent-color:var(--anatomy-lit);margin:0}
.ctl output{min-width:60px;text-align:right;color:var(--anatomy-hi,var(--anatomy-mid))}
#stats{font-size:12px;color:var(--anatomy-mid)}#stats b{color:var(--anatomy-hi,var(--anatomy-mid));font-weight:600}
#shot{min-height:3.6em;font-size:12px;line-height:1.4}
@media (max-width:520px){.ctl-label{min-width:52px}.ctl button{padding:7px 8px}.ctl output{min-width:48px}.ctl button small{display:none}}`;

const stageHtml = `<div class="iso-stage fx-stage" tabindex="0" role="group" aria-label="Lock: drag a pin up to lift it; left and right pick a pin, up and down lift, T and G more or less tension, R rakes, K uses the key, N new lock">${svg}</div>`;

const CONTROLS = `<div class="ctl" role="group" aria-label="Test controls">
  <div class="ctl-row"><span class="ctl-label">Pins</span><button type="button" data-kind="standard" aria-pressed="true">Standard</button><button type="button" data-kind="security" aria-pressed="false">Security<small>spool drivers</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Tension</span><div class="slide"><input id="ten" type="range" min="0" max="100" step="1" value="0" aria-label="Tension on the wrench"></div><output id="ten-out">0 %</output></div>
  <div class="ctl-row"><span class="ctl-label">Pick under</span>${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-pinb="${n - 1}" aria-pressed="${n === 3}">${n}</button>`).join("")}</div>
  <div class="ctl-row"><span class="ctl-label">Lift</span><div class="slide"><input id="lift" type="range" min="0" max="100" step="1" value="0" aria-label="How hard the pick pushes up"></div><output id="lift-out">0.0</output></div>
  <div class="ctl-row"><span class="ctl-label">Lock</span><span id="stats"></span></div>
  <div class="ctl-row"><span class="ctl-label">Try</span><button type="button" id="rake" aria-pressed="false">Rake it</button><button type="button" id="keyb" aria-pressed="false">The key</button><button type="button" id="wkey" aria-pressed="false">Wrong key</button><button type="button" id="fresh">New lock</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
  <div id="shot" aria-live="polite"></div>
</div>`;

const card = k.plateHtml({
  fig: "Fig 14",
  title: "How a lock gets picked",
  hint: "Drag a pin up",
  readout: "",
  keys: [
    { mark: "lit", label: "The shear line, set pins (green), false set (amber), overset (red), the pick" },
    { mark: "raised", label: "Pin tumbler cylinder cut in half: housing, plug, key pins, driver pins, springs" },
  ],
  caption: "A pin tumbler lock is a plug that can't turn because pin stacks cross the gap between it and the housing: the shear line. The right key lifts each stack so the gap between its key pin and driver pin sits exactly on that line. Picking works because nothing's machined perfectly. Put a little turning force on the plug and one pin binds before the others; lift it until the gap reaches the shear line and the driver catches on the plug's ledge. That's a set pin, and the next one binds. Too much tension and the pin won't lift; too fast and you push it past (an overset). Security pins with a narrow waist catch early and give a false set, and you beat them by easing the tension.",
  body: stageHtml,
});

const other = theme === "light" ? ["index.html", "Dark version"] : ["light.html", "Light version"];
const FOOT = `<p style="font-family:var(--anatomy-mono);font-size:11px;color:var(--anatomy-lo);margin:28px 0 8px;line-height:1.6">A toy, simplified a lot. Real: pin stacks across a shear line, binding from machining tolerance, setting, oversetting, spool pins and false sets, raking. Made up: every dimension, the tolerances, how much tension is too much, and how easy it is. Only pick locks you own.<br>Built with <a href="https://github.com/wheresryan22/anatomy" style="color:inherit">Anatomy</a> by Ryan (MIT). · <a href="${other[0]}" style="color:inherit">${other[1]}</a> · <a href="../" style="color:inherit">More figures</a> · <a href="https://github.com/Dizzyfer/Anatomy/tree/main/lock" style="color:inherit">Source</a></p>`;
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "How a lock gets picked", theme, body: `<style>${CSS}</style>${card.replace("<figcaption", CONTROLS + "<figcaption")}${FOOT}`, script: kitScript() + LIVE.replace("__DATA__", JSON.stringify(DATA)), width: 700 }));
console.log("wrote", name);
