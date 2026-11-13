import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import { engineScript, stageHtml, pageMk2, footHtml } from "../../mk2/shell.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const W = 960, H = 640;

// Truth: the mechanics. A falling counterweight turns a pivoted arm, and a sling on the long end adds a second, faster swing, like a whip.
// The equations of motion for the arm and the sling are solved step by step, with the stone sliding along a trough until the sling lifts it.
// Lengthen the sling and it throws faster but lets go later; the pin on the end of the arm sets the angle at which the sling slips off.
// Toy: a rigid counterweight fixed to the arm (real ones usually hang), no air drag and no friction, so it throws further than a real one would.
// Also made up: the arm's 10 t limit, the weights of the ammunition, how the wall takes a hit, and the scale of the field.
const PHYS = { Ll: 9, Ls: 2.25, H: 7.5, zg: 0.4, mArm: 500, g: 9.81 };
const GEO = { S: 3.6, SF: 0.95, PX: -30, ZG: 1, DW: 200, WALL: { cols: 9, cw: 9, bh: 4.5, rows: 5, depth: 7, mh: 3 }, KEEP: { x0: 173, x1: 191, hw: 11, h: 36 }, CAMP: -74, LIMIT: 10 };
const AMMO = [{ name: "Stone", m: 100, rest: 1.6, lie: 1.6 }, { name: "Fire barrel", m: 60, rest: 1.7, lie: 1.45 }, { name: "Cow", m: 300, rest: 2.3, lie: 1.15 }];
const START = { M: 5, r: 7, rel: -10, ammo: 0 };
const TOUR = [
  { c: { M: 5, r: 7, rel: -10, ammo: 0 }, say: "Five tonnes of counterweight, a 7 m sling, a 100 kg stone." },
  { c: { M: 3, r: 7, rel: -10, ammo: 0 }, say: "Take two tonnes out of the box." },
  { c: { M: 5, r: 7, rel: 30, ammo: 0 }, say: "Back to five tonnes, but bend the pin so the sling lets go late." },
  { c: { M: 5, r: 7, rel: -65, ammo: 0 }, say: "Now bend it the other way, so it lets go early." },
  { c: { M: 5, r: 7, rel: -60, ammo: 0 }, say: "Not quite that early." },
  { c: { M: 5, r: 7, rel: -10, ammo: 2 }, say: "Back to the settings that worked, but load the cow." },
  { c: { M: 4, r: 7, rel: -10, ammo: 1 }, say: "A barrel of something flammable, on four tonnes." },
  { c: { M: 12, r: 7, rel: -10, ammo: 0 }, say: "Twelve tonnes in the box. The arm is good for ten." }
];
const PLATE = { x: -92, y: -58, w: 292, d: 116, r: 8 };
const P = k.fitProjection([...k.boxCorners(PLATE, -0.8, 0), [-92, -58, 0], [200, 58, 0], [-30, 0, 84], [70, 0, 100], [200, -58, 50]], W, H, { pad: 14, azimuth: 112, elevation: 22 });
const DATA = { W, H, P, PLATE };
Object.assign(DATA, { GEO, PHYS, AMMO, TOUR, start: START });
const LIVE = `
${engineScript()}
const D = __DATA__;
const stage = document.querySelector(".mk-stage");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lightTheme = document.body.dataset.theme === "light";
const E = mk2(stage, D.P, { W: D.W, H: D.H, pivot: [54, 0, 20], plate: { ...D.PLATE, h: 12, foot: 5 }, shadowBox: [-102, -68, -18, 210, 68, 130] });
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
const G3 = D.GEO, P = D.PHYS, AMMO = D.AMMO, TAU = Math.PI * 2, rn = () => Math.random();
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const q = (s) => document.querySelector(s), deg = (a) => (a * 180) / Math.PI;
const S = G3.S, SF = G3.SF, PX = G3.PX, ZG = G3.ZG, ZP = ZG + P.H * S, XW = PX + SF * G3.DW, W = G3.WALL, KP = G3.KEEP, PL = D.PLATE;
const mach = (x, z) => [PX - S * x, 0, ZG + S * z], field = (d, z, y) => [PX + SF * d, y || 0, ZG + SF * z];

// ---------------- the throw: arm and sling, solved step by step ----------------
function simulate(o) {
  const { Ll, Ls, H, zg, mArm, g } = P, M = o.M, m = o.m, r = o.r, del = o.rel;
  const dcm = (Ll - Ls) / 2, I = mArm * ((Ll + Ls) * (Ll + Ls) / 12 + dcm * dcm) + M * Ls * Ls, K = M * Ls - mArm * dcm;
  const th0 = Math.asin(-(H - 0.5) / Ll), dt = 0.0005, out = [];
  const px = (th) => Ll * Math.cos(th) - Math.sqrt(Math.max(0, r * r - (H + Ll * Math.sin(th) - zg) ** 2));
  const phiOf = (th) => Math.atan2(zg - (H + Ll * Math.sin(th)), px(th) - Ll * Math.cos(th));
  const e = 1e-4;
  // free accelerations
  const acc = (th, w, ph, pw) => { const c = Math.cos(th - ph), s = Math.sin(th - ph), A11 = I + m * Ll * Ll, A12 = m * Ll * r * c, A22 = m * r * r;
    const b1 = g * Math.cos(th) * (K - m * Ll) - m * Ll * r * s * pw * pw, b2 = -m * g * r * Math.cos(ph) + m * Ll * r * s * w * w, det = A11 * A22 - A12 * A12;
    return [(b1 * A22 - A12 * b2) / det, (A11 * b2 - A12 * b1) / det]; };
  let th = th0, w = 0, t = 0, phase = 0, ph = 0, pw = 0, psi = 0, rel = null, fail = null, lift = null;
  const samp = () => { const T = [Ll * Math.cos(th), H + Ll * Math.sin(th)], p = phase === 0 ? [px(th), zg] : [T[0] + r * Math.cos(ph), T[1] + r * Math.sin(ph)]; return p; };
  let n = 0;
  while (t < 8 && !rel && !fail) {
    if (phase === 0) {
      const dp = (px(th + e) - px(th - e)) / (2 * e), dpp = (px(th + e) - 2 * px(th) + px(th - e)) / (e * e), J = I + m * dp * dp, Jp = 2 * m * dp * dpp;
      const a = (g * Math.cos(th) * K - 0.5 * Jp * w * w) / J;
      // would it lift?
      const f = phiOf(th), fw = ((phiOf(th + e) - phiOf(th - e)) / (2 * e)) * w, [a1, a2] = acc(th, w, f, fw);
      const zdd = Ll * (a1 * Math.cos(th) - w * w * Math.sin(th)) + r * (a2 * Math.cos(f) - fw * fw * Math.sin(f));
      if (zdd > 0 && w > 0.05) { phase = 1; ph = f; pw = fw; psi = Math.atan2(Math.sin(ph - th), Math.cos(ph - th)); lift = { t, th }; continue; }
      w += a * dt; th += w * dt;
      if (H + Ll * Math.sin(th) - zg >= r * 0.999) { phase = 1; ph = phiOf(th); pw = w; psi = Math.atan2(Math.sin(ph - th), Math.cos(ph - th)); lift = { t, th }; }
    } else {
      const [a1, a2] = acc(th, w, ph, pw);
      w += a1 * dt; pw += a2 * dt; th += w * dt; ph += pw * dt; psi += (pw - w) * dt;
      const p = samp();
      if (p[1] < 0.25 && t > lift.t + 0.05) fail = { kind: "ground", d: -p[0], t };
      else if (psi >= del) { const T = [-Ll * Math.sin(th) * w, Ll * Math.cos(th) * w], v = [T[0] - r * Math.sin(ph) * pw, T[1] + r * Math.cos(ph) * pw]; rel = { t, d: -p[0], z: p[1], vd: -v[0], vz: v[1], th, ph }; }
    }
    t += dt;
    if (n++ % 20 === 0) { const p = samp(); out.push([th, p[0], p[1]]); }
  }
  if (!rel && !fail) fail = { kind: "hung", t };
  const res = { th0, samples: out, rel, fail, lift, tEnd: t };
  if (!fail || fail.kind === "ground") {
    // the arm carries on, with nothing on the end of it
    let a = th, aw = w; const arm = [];
    for (let i = 0; i < 12000; i++) { aw += ((g * Math.cos(a) * K) / I - 0.9 * aw) * dt; a += aw * dt; if (i % 20 === 0) arm.push(a); }
    res.arm = arm;
  }
  if (rel) {
    const v = Math.hypot(rel.vd, rel.vz), ang = Math.atan2(rel.vz, rel.vd), tf = (rel.vz + Math.sqrt(rel.vz * rel.vz + 2 * g * rel.z)) / g;
    Object.assign(res, { v, ang, tf, range: rel.d + rel.vd * tf, apex: rel.z + (rel.vz > 0 ? rel.vz * rel.vz / (2 * g) : 0),
      eff: (0.5 * m * v * v + m * g * (rel.z - zg)) / (M * g * Ls * (Math.sin(rel.th) - Math.sin(th0))) });
  }
  return res;
}

// ---------------- state ----------------
const cfg = { ...D.start };
let now = 0, last = 0, frame = 0, visible = true, touring = !still.matches, tourStep = -1, tourWait = 0;
let shot = null, smashAt = null, snapAt = null, lastText = "", trace = [], fx = [], deb = [], debRev = 0, litter = [], marks = [], fires = [];
let ghosts = [], ghostT = 0, wall = [], wallRev = 0, breached = false, campFlat = false, flagOff = null, recock = 0;
const FLY = 2.6, END = 3.8, TH0 = Math.asin(-(P.H - 0.5) / P.Ll);
function rebuild() { wall = Array.from({ length: W.cols }, (_, c) => ({ n: W.rows, merlon: c % 2 === 0, off: 0, vo: 0, fr: 0 })); wallRev++; breached = false; campFlat = false; flagOff = null; deb = []; debRev++; litter = []; marks = []; fires = []; trace = []; ghosts = []; }
rebuild();
const ui = { cw: q("#cw"), cwOut: q("#cw-out"), sling: q("#sling"), slingOut: q("#sling-out"), rel: q("#rel"), relOut: q("#rel-out"), ammo: [...document.querySelectorAll("[data-ammo]")], res: q("#res"), loose: q("#loose"), rebuild: q("#rebuild"), tour: q("#tour"), shot: q("#shot") };
const sliding = { cw: false, sling: false, rel: false };
let lastShot = "";
const say = (t) => { if (t !== lastShot) { ui.shot.textContent = t; lastShot = t; } };
const relText = (d) => (d === 0 ? "in line" : Math.abs(d) + "° " + (d < 0 ? "behind" : "ahead"));
function syncUi() {
  if (!sliding.cw) ui.cw.value = String(cfg.M); if (!sliding.sling) ui.sling.value = String(cfg.r); if (!sliding.rel) ui.rel.value = String(cfg.rel);
  ui.cwOut.textContent = cfg.M + " t"; ui.cwOut.dataset.bad = String(cfg.M > G3.LIMIT); ui.slingOut.textContent = cfg.r + " m"; ui.relOut.textContent = relText(cfg.rel);
  ui.ammo.forEach((b, i) => b.setAttribute("aria-pressed", String(i === cfg.ammo)));
  if (ui.res.textContent !== lastText) ui.res.textContent = lastText;
  ui.tour.setAttribute("aria-pressed", String(touring));
}

// ---------------- loosing it ----------------
function loose() {
  if (smashAt !== null || snapAt !== null) return;
  trace = []; ghosts = []; ghostT = 0; recock = 0; lastText = "";
  if (cfg.M > G3.LIMIT) { shot = null; snapAt = now; say("CRACK. " + cfg.M + " tonnes hanging off an arm that was good for " + G3.LIMIT + ". The counterweight has gone straight down and the stone has not gone anywhere."); lastText = "arm snapped"; return; }
  const a = AMMO[cfg.ammo], res = simulate({ M: cfg.M * 1000, m: a.m, r: cfg.r, rel: (cfg.rel * Math.PI) / 180 });
  shot = { res, a, k: cfg.ammo, phase: "swing", t: 0, tf: 0, armT: 0, y: (rn() - 0.5) * 52, spin: 0, plan: null, roll: 0 };
  if (res.rel) shot.plan = planFlight(shot);
  say(a.name + " away…");
}
function planFlight(s) {
  const r = s.res.rel, g = P.g, tf = s.res.tf, R = s.res.range;
  const at = (t) => [r.d + r.vd * t, r.z + r.vz * t - 0.5 * g * t * t], sp = (t) => Math.hypot(r.vd, r.vz - g * t);
  if (r.vd > 0) {
    const tw = (G3.DW - r.d) / r.vd;
    if (tw > 0 && tw < tf) {
      const c = clamp(Math.round((s.y + (W.cols - 1) * W.cw * 0.5) / W.cw), 0, W.cols - 1), col = wall[c], top = col.n * W.bh + (col.merlon && col.n > 0 ? W.mh : 0), z = at(tw)[1] * SF;
      if (z <= top) return { kind: "wall", T: tw, c, z, E: 0.5 * s.a.m * sp(tw) ** 2 / 1000 };
      const tk = ((KP.x0 - PX) / SF - r.d) / r.vd, zk = at(tk)[1] * SF;
      if (tk < tf && zk <= KP.h && Math.abs(s.y) <= KP.hw) return { kind: "keep", T: tk, z: zk };
      return { kind: "over", T: tf, R };
    }
  }
  const kind = R >= G3.DW - 26 ? "skip" : R > 9 ? "short" : R > -9 ? "self" : R > -22 ? "behind" : R > -54 ? "camp" : "baggage";
  if (kind !== "skip" && kind !== "short") s.y *= 0.25;
  return { kind, T: tf, R, E: 0.5 * s.a.m * sp(tf) ** 2 / 1000 };
}
function puff(p, n, col, sp, up) { for (let i = 0; i < n; i++) fx.push({ k: "dust", p: [p[0] + (rn() - 0.5) * 3, p[1] + (rn() - 0.5) * 3, p[2] + rn() * 2], v: [(rn() - 0.5) * sp, (rn() - 0.5) * sp, rn() * (up || sp * 0.6)], life: 0, max: 0.6 + rn() * 0.9, col, s: 0.7 + rn() * 0.8 }); }
function chips(p, n, col) { for (let i = 0; i < n; i++) fx.push({ k: "chip", p: [...p], v: [(rn() - 0.6) * 90, (rn() - 0.5) * 90, 20 + rn() * 90], life: 0, max: 0.6 + rn() * 0.7, col }); }
function hitWall(c0, y, z, E, fire) {
  const R = clamp(3.2 + 0.72 * Math.sqrt(E), 4.6, 15); let gone = 0;
  for (let c = 0; c < W.cols; c++) {
    const col = wall[c], yc = (c - (W.cols - 1) / 2) * W.cw; let rm = 0, low = 99;
    for (let r = 0; r < col.n; r++) if (Math.hypot(yc - y, (r + 0.5) * W.bh - z) < R) { rm++; low = Math.min(low, r); deb.push({ p: [XW + W.depth / 2, yc, ZG + (r + 0.5) * W.bh], v: [rn() < 0.3 ? -5 - rn() * 14 : 20 + rn() * 60, (rn() - 0.5) * 34, 15 + rn() * 55], sz: [W.depth, W.cw - 0.4, W.bh - 0.2], rest: false, col: (c + r) % 2 }); }
    if (rm) { if (col.merlon && (rm >= 2 || Math.hypot(yc - y, col.n * W.bh + 1.5 - z) < R)) { col.merlon = false; deb.push({ p: [XW + W.depth / 2, yc, ZG + col.n * W.bh + 1.5], v: [10 + rn() * 50, (rn() - 0.5) * 40, 30 + rn() * 40], sz: [W.depth, 5, W.mh], rest: false, col: 0 }); }
      col.n -= rm; col.fr = low; col.off = rm * W.bh; col.vo = 0; gone += rm; }
    else if (col.merlon && Math.hypot(yc - y, col.n * W.bh + 1.5 - z) < R * 0.7) { col.merlon = false; gone++; deb.push({ p: [XW + W.depth / 2, yc, ZG + col.n * W.bh + 1.5], v: [10 + rn() * 50, (rn() - 0.5) * 40, 30 + rn() * 40], sz: [W.depth, 5, W.mh], rest: false, col: 0 }); }
  }
  while (deb.length > 44) deb.shift();
  wallRev++; debRev++;
  const p = [XW - 1, y, ZG + z];
  puff(p, 14 + gone * 2, lightTheme ? "#a09a90" : "#cfc9be", 60, 50); chips(p, 10 + gone * 3, "#a9a39a");
  if (fire) fires.push({ p: [XW - 2, y, ZG + Math.max(1, z - 2)], until: now + 5 });
  setShake(0, 0); shakeAt = now; shakeA = clamp(2 + gone, 2, 8);
  const was = breached; breached = wall.some((c) => c.n === 0);
  return { gone, fresh: breached && !was };
}
let shakeAt = -9, shakeA = 0;
function land(s) {
  const pl = s.plan, a = s.a, k = pl.kind, dTxt = Math.abs(Math.round(pl.R || 0)) + " m", cow = s.k === 2, fire = s.k === 1;
  const v = "Left the sling at " + s.res.v.toFixed(0) + " m/s, " + (s.res.ang < 0 ? Math.round(-deg(s.res.ang)) + "° below level" : Math.round(deg(s.res.ang)) + "° up") + ". ";
  let msg = "", at = null, mark = null;
  if (k === "wall") {
    const h = hitWall(pl.c, s.y, Math.max(1, pl.z), pl.E, fire); at = [XW - 2.6, s.y];
    msg = h.fresh ? "Breach! That column is down to the ground. " + (cow ? "Demolition by cow." : "Send in whoever is paid to go first.") : h.gone ? "Hit: " + h.gone + (h.gone === 1 ? " block" : " blocks") + " gone, " + (pl.z > W.rows * W.bh * 0.7 ? "off the top of the wall." : "and what was above them has dropped.") + (cow ? " The cow has made its point." : "") : "Hit the wall and bounced off. Not enough behind it to shift a block.";
    lastText = "200 m · wall hit" + (h.fresh ? " · BREACH" : "");
  } else if (k === "keep") { at = null; puff([KP.x0 - 1, s.y, ZG + pl.z], 16, "#cfc9be", 60, 50); chips([KP.x0 - 1, s.y, ZG + pl.z], 14, "#a9a39a"); if (flagOff === null) flagOff = now; shakeAt = now; shakeA = 4; if (fire) fires.push({ p: [KP.x0 - 1.5, s.y, ZG + Math.max(1, pl.z - 2)], until: now + 5 });
    msg = "Over the wall and into the front of the keep. The flag has come down, which they will take personally. Ease off a touch to hit the wall."; lastText = "over the wall · hit the keep";
  } else if (k === "over") { msg = "Clean over the wall, the keep and everything else: it would have come down about " + dTxt + " out. Less counterweight, or let go later."; lastText = dTxt + " · over the lot"; }
  else if (k === "skip") { s.phase = "roll"; s.roll = 0; const p = field(pl.R, 0, s.y); puff(p, 10, lightTheme ? "#8a7a5a" : "#b7a78a", 40, 30); marks.push({ p, r: 2.4 }); return; }
  else if (k === "short") { at = field(pl.R + 3, 0, s.y); mark = field(pl.R, 0, s.y); msg = v + "Down at " + dTxt + ", " + Math.round(G3.DW - pl.R) + " m short of the wall. " + (s.res.ang < 0.2 ? "It left the sling too flat: let go earlier." : s.res.ang > 1.1 ? "It went up more than out: let go later." : cow ? "Cows need more counterweight than that." : "More counterweight, or a longer sling."); lastText = dTxt + " · " + Math.round(G3.DW - pl.R) + " m short"; }
  else if (k === "self") { smashAt = now; shakeAt = now; shakeA = 9; puff([PX, 0, ZG + 6], 26, lightTheme ? "#8a7a5a" : "#b7a78a", 90, 70); chips([PX, 0, ZG + 10], 24, "#8a6238"); at = [PX + 3, -3]; msg = "Straight up, and straight back down on your own machine. The sling let go far too early. " + (cow ? "Flattened by your own cow." : "That is the trebuchet's whole career, right there."); lastText = "0 m · hit your own trebuchet"; }
  else if (k === "behind") { at = field(pl.R, 0, s.y); mark = field(pl.R, 0, s.y); msg = "It went backwards: " + dTxt + " behind you. The sling let go too early, while the stone was still on its way up the back."; lastText = dTxt + " behind you"; }
  else if (k === "camp") { campFlat = true; debRev++; const p = [G3.CAMP, 0, ZG]; puff(p, 22, lightTheme ? "#8a7a5a" : "#c9b48a", 70, 50); chips(p, 12, "#c9b48a"); at = [G3.CAMP, s.y]; shakeAt = now; shakeA = 4; msg = "Backwards, " + dTxt + ", and through your own tent. Let go later. " + (cow ? "Nobody was expecting the cow to come back." : "At least nobody was in it. Probably."); lastText = dTxt + " behind you · hit your own camp"; }
  else if (k === "baggage") { msg = "Backwards, right over the camp and into the baggage train " + dTxt + " behind you. The cook would like a word."; lastText = dTxt + " behind you"; }
  if (k !== "wall" && k !== "keep") { const p = field(clamp(pl.R, -56, 240), 0, s.y); if (k === "short" || k === "behind") puff(p, 12, lightTheme ? "#8a7a5a" : "#b7a78a", 45, 35); if (fire && p[0] < PL.x + PL.w && k !== "over" && k !== "baggage") fires.push({ p: [p[0], p[1], ZG + 0.5], until: now + 5 }); }
  if (mark) marks.push({ p: mark, r: 2.4, text: dTxt });
  if (at) { litter.push({ k: s.k, x: at[0], y: at[1], a: rn() * 6 }); if (litter.length > 6) litter.shift(); }
  if (marks.length > 6) marks.shift();
  say(msg); s.phase = "done";
}
function step(dt) {
  for (const c of wall) if (c.off > 0) { c.vo += 150 * dt; c.off = Math.max(0, c.off - c.vo * dt); if (c.off === 0) { wallRev++; puff([XW - 1, (wall.indexOf(c) - (W.cols - 1) / 2) * W.cw, ZG + c.fr * W.bh], 4, "#cfc9be", 30, 20); } }
  let moving = false;
  for (const d of deb) if (!d.rest) { moving = true; d.v[2] -= 170 * dt; for (let i = 0; i < 3; i++) d.p[i] += d.v[i] * dt; if (d.p[0] > KP.x0 - 4) { d.p[0] = KP.x0 - 4; d.v[0] *= -0.2; } if (d.p[2] <= ZG + d.sz[2] / 2) { d.p[2] = ZG + d.sz[2] / 2; if (Math.abs(d.v[2]) < 30) { d.rest = true; debRev++; } else { d.v[2] *= -0.3; d.v[0] *= 0.5; d.v[1] *= 0.5; } } }
  if (smashAt !== null && now - smashAt > END) { smashAt = null; shot = null; say("New trebuchet. The old one is firewood."); }
  if (snapAt !== null && now - snapAt > END) { snapAt = null; if (!touring) cfg.M = G3.LIMIT; say("New arm fitted, and the counterweight is back to " + (touring ? "something sensible" : G3.LIMIT + " t") + ". The red mark on the slider is there for a reason."); }
  const s = shot; if (!s) return;
  if (s.phase === "swing") {
    s.t += dt; s.spin += dt * 3;
    if (s.t >= s.res.tEnd || (s.res.fail && s.res.fail.kind === "hung" && s.t > 4)) {
      if (s.res.rel) { s.phase = "fly"; s.tf = 0; s.armT = 0; }
      else { s.phase = "done"; s.armT = 0; const f = s.res.fail, sp = s.res.samples[s.res.samples.length - 1], p = mach(sp[1], sp[2]);
        if (f.kind === "ground") { puff(p, 16, lightTheme ? "#8a7a5a" : "#b7a78a", 60, 40); shakeAt = now; shakeA = 3; litter.push({ k: s.k, x: p[0], y: 3.5, a: 1 }); say("It never got off the ground properly: the " + s.a.name.toLowerCase() + " hit the dirt on its way round. " + (cfg.M < 2.5 ? "Not enough counterweight to swing it." : "The sling is too long for a frame this tall.")); lastText = "hit the ground on the way round"; }
        else { say("It went round and round and never let go. With the pin set that far ahead, the sling has to get right out in front of the arm, and this throw never had the speed."); lastText = "never let go"; } }
    }
  } else if (s.phase === "fly") { s.tf += dt * FLY; s.armT += dt; s.spin += dt * 5; if (s.tf >= s.plan.T) { s.tf = s.plan.T; land(s); } }
  else if (s.phase === "roll") { s.roll += dt * 2.4; s.armT += dt; s.spin += dt * 9;
    if (s.roll >= 1) { const c = clamp(Math.round((s.y + (W.cols - 1) * W.cw * 0.5) / W.cw), 0, W.cols - 1), dTxt = Math.round(s.plan.R) + " m";
      if (wall[c].n === 0) { say("Down at " + dTxt + ", bounced, and rolled straight in through the breach. Somebody inside has just met it."); lastText = dTxt + " · through the breach"; }
      else { const h = hitWall(c, s.y, 2, s.plan.E * 0.3, s.k === 1); litter.push({ k: s.k, x: XW - 2.6, y: s.y, a: rn() * 6 }); say("Down at " + dTxt + ", " + Math.round(G3.DW - s.plan.R) + " m short, but it bounced and ran on into the foot of the wall" + (h.fresh ? ". Breach!" : h.gone ? ": " + h.gone + (h.gone === 1 ? " block" : " blocks") + " out of the bottom." : " and stopped dead.")); lastText = dTxt + " · bounced into the wall" + (h.fresh ? " · BREACH" : ""); }
      s.phase = "done"; } }
  else { s.armT += dt; if (s.armT > (s.res.arm ? 2.6 : 1.2)) { recock += dt; if (recock >= 1.1) { shot = null; recock = 0; } } }
}

// ---------------- geometry ----------------
const WOOD = "#8a6238", WOOD2 = "#6f4d2b", IRON = "#3a3e44", ROPE = "#d8c49a", STONE = ["#a9a39a", "#9a948b"];
const mul = (A, B) => { const o = new Array(12); for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) o[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; o[9 + i] = A[i * 3] * B[9] + A[i * 3 + 1] * B[10] + A[i * 3 + 2] * B[11] + A[9 + i]; } return o; };
const tipM = (piv, ang, axis) => { const c = Math.cos(ang), s = Math.sin(ang), R = axis === "x" ? [1, 0, 0, 0, c, -s, 0, s, c] : axis === "z" ? [c, -s, 0, s, c, 0, 0, 0, 1] : [c, 0, s, 0, 1, 0, -s, 0, c]; return [...R, ...[0, 1, 2].map((i) => piv[i] - (R[i * 3] * piv[0] + R[i * 3 + 1] * piv[1] + R[i * 3 + 2] * piv[2]))]; };
const moveM = (v) => [1, 0, 0, 0, 1, 0, 0, 0, 1, v[0], v[1], v[2]];
// a timber between two points in the x-z plane
function beam(x0, z0, x1, z1, w, y0, y1, col, o) { const L = Math.hypot(x1 - x0, z1 - z0), nx = (-(z1 - z0) / L) * w * 0.5, nz = ((x1 - x0) / L) * w * 0.5; let ring = [[x0 + nx, z0 + nz], [x0 - nx, z0 - nz], [x1 - nx, z1 - nz], [x1 + nx, z1 + nz]], A = 0; for (let i = 0; i < 4; i++) { const a = ring[i], b = ring[(i + 1) % 4]; A += a[0] * b[1] - b[0] * a[1]; } if (A < 0) ring.reverse(); return prism(ring, "y", y0, y1, col, { mat: "matte", bevel: 0.25, ...(o || {}) }); }
function frameParts() {
  const o = [];
  for (const sy of [-1, 1]) { const y0 = sy > 0 ? 6.2 : -7.8, y1 = y0 + 1.6;
    o.push(box(PX - 30, PX + 25, y0 - 0.3, y1 + 0.3, ZG, ZG + 1.8, WOOD2, { mat: "matte", bevel: 0.3 }), beam(PX - 19, ZG + 1.8, PX, ZP + 0.6, 1.9, y0, y1, WOOD), beam(PX + 19, ZG + 1.8, PX, ZP + 0.6, 1.9, y0, y1, WOOD), beam(PX, ZG + 1.8, PX, ZP + 1.6, 2.2, y0 - 0.1, y1 + 0.1, WOOD2), beam(PX - 10.2, ZG + 13, PX + 10.2, ZG + 13, 1.3, y0 - 0.2, y1 + 0.2, WOOD2)); }
  o.push(box(PX - 30, PX - 28, -8.4, 8.4, ZG + 1.8, ZG + 3.4, WOOD, { mat: "matte", bevel: 0.3 }), box(PX + 23, PX + 25, -8.4, 8.4, ZG + 1.8, ZG + 3.4, WOOD, { mat: "matte", bevel: 0.3 }));
  o.push(tube([[PX, -9.4, ZP], [PX, 9.4, ZP]], 0.9, IRON, { seg: 12, mat: "iron" }), box(PX - 28, PX + 23, -1.5, 1.5, ZG, ZG + 0.45, "#b08a58", { mat: "matte", bevel: 0.1 }));
  // winch at the back
  o.push(tube([[PX - 26, -6.2, ZG + 6], [PX - 26, 6.2, ZG + 6]], 1.5, WOOD2, { seg: 12, mat: "matte" }), tube([[PX - 26, -7.6, ZG + 6], [PX - 26, -6.2, ZG + 6]], 2.6, IRON, { seg: 8, mat: "iron" }));
  return o;
}
const AX = S * P.Ll, AS = S * P.Ls, BRK = 10;
const armIn = () => [box(PX - BRK, PX + AS + 1, -1.15, 1.15, ZP - 1.3, ZP + 1.3, WOOD, { mat: "matte", bevel: 0.35 }), tube([[PX + AS, -3.4, ZP], [PX + AS, 3.4, ZP]], 0.5, IRON, { seg: 8, mat: "iron" }), box(PX - 3, PX + 3, -1.4, 1.4, ZP - 1.6, ZP + 1.6, IRON, { mat: "iron", bevel: 0.3 })];
const armOut = () => [box(PX - AX, PX - BRK, -0.85, 0.85, ZP - 0.95, ZP + 0.95, WOOD, { mat: "matte", bevel: 0.3 }), tube([[PX - AX - 1.6, 0, ZP + 0.4], [PX - AX, 0, ZP]], 0.28, IRON, { seg: 6, mat: "iron" })];
function cwParts() { const a = 4.6 * Math.cbrt(cfg.M / 3), o = [box(-a / 2, a / 2, -a / 2, a / 2, -2.6 - a, -2.6, "#5b5148", { mat: "matte", bevel: 0.4 })];
  for (const y of [-a / 2 - 0.25, a / 2 - 0.15]) o.push(box(-0.5, 0.5, y, y + 0.4, -2.6 - a * 0.5, 0.4, IRON, { mat: "iron", bevel: 0.1 }));
  for (const z of [-2.6 - a * 0.25, -2.6 - a * 0.75]) o.push(box(-a / 2 - 0.12, a / 2 + 0.12, -a / 2 - 0.12, a / 2 + 0.12, z - 0.35, z + 0.35, IRON, { mat: "iron", bevel: 0.1 }));
  return o; }
function ammoParts(k) {
  if (k === 0) return [sphere([0, 0, 0], 1.6, "#8f8a82", { mat: "concrete" })];
  if (k === 1) return [lathe([[0, -1.7], [1.15, -1.7], [1.45, -0.6], [1.45, 0.6], [1.15, 1.7], [0, 1.7]], "#6f4d2b", { c: [0, 0, 0], seg: 16, mat: "matte", emit: ["#ff7a1a", 0.12] }), cyl(0, 0, 1.5, -0.95, -0.7, IRON, 16, { mat: "iron" }), cyl(0, 0, 1.5, 0.7, 0.95, IRON, 16, { mat: "iron" })];
  const o = [box(-2.4, 2.2, -1.1, 1.1, -0.9, 1.1, "#f1ede4", { mat: "matte", bevel: 0.45 }), box(-3.6, -2.2, -0.75, 0.75, 0.1, 1.5, "#f1ede4", { mat: "matte", bevel: 0.35 }), box(-4.1, -3.5, -0.6, 0.6, 0.15, 0.85, "#e8a9a0", { mat: "matte", bevel: 0.2 })];
  o.push(box(-0.8, 1, -1.16, 1.16, -0.2, 1.16, "#2a2623", { mat: "matte", bevel: 0.3 }), box(-2.3, -1.6, -1.14, 0.2, 0.3, 1.14, "#2a2623", { mat: "matte", bevel: 0.2 }), box(-3.5, -3.1, -1.05, -0.7, 1.3, 1.9, "#d8cfbe", { mat: "matte", bevel: 0.1 }), box(-3.5, -3.1, 0.7, 1.05, 1.3, 1.9, "#d8cfbe", { mat: "matte", bevel: 0.1 }));
  for (const x of [-1.9, 1.6]) for (const y of [-0.75, 0.75]) o.push(box(x - 0.3, x + 0.3, y - 0.3, y + 0.3, -2.3, -0.9, "#e4dfd4", { mat: "matte", bevel: 0.1 }));
  o.push(box(2.2, 2.5, -0.15, 0.15, -0.8, 0.9, "#e4dfd4", { mat: "matte", bevel: 0.05 }), box(-0.5, 0.5, -0.5, 0.5, -1.25, -0.9, "#e8a9a0", { mat: "matte", bevel: 0.15 }));
  return o;
}
function fieldParts() {
  const o = [box(PL.x + 1.5, PL.x + PL.w - 1.5, PL.y + 1.5, PL.y + PL.d - 1.5, 0, ZG, lightTheme ? "#86a85e" : "#566f3c", { mat: "matte", bevel: 0.4 })];
  for (const d of [50, 100, 150]) { const x = PX + SF * d; o.push(tube([[x, -40, ZG], [x, -40, ZG + 8]], 0.3, "#d8d2c4", { seg: 6, mat: "matte" }), prism([[x, ZG + 8], [x, ZG + 5.4], [x + 3.4, ZG + 6.7]], "y", -40.15, -39.85, "#d84a3a", { mat: "matte", bevel: 0 })); }
  // castle: towers and a keep (the curtain wall is its own object)
  for (const sy of [-1, 1]) { const y = sy * (W.cols * W.cw * 0.5 + 6.5), x = XW + W.depth / 2;
    o.push(cyl(x, y, 7.5, ZG, ZG + 32, STONE[1], 28, { mat: "concrete" }), cyl(x, y, 8.4, ZG + 32, ZG + 34.6, STONE[0], 28, { mat: "concrete" }), lathe([[0, 34.6], [8.9, 34.6], [0, 48]], "#8a3b2e", { c: [x, y, ZG], seg: 28, mat: "matte" })); }
  o.push(box(KP.x0, KP.x1, -KP.hw, KP.hw, ZG, ZG + KP.h, STONE[1], { mat: "concrete", bevel: 0.4 }));
  for (const x of [KP.x0, KP.x1 - 4]) for (const y of [-KP.hw, -2, KP.hw - 4]) o.push(box(x, x + 4, y, y + 4, ZG + KP.h, ZG + KP.h + 3, STONE[0], { mat: "concrete", bevel: 0.3 }));
  o.push(box(KP.x0 - 0.15, KP.x0, -1.2, 1.2, ZG + 24, ZG + 30, "#1d1f22", { bevel: 0, flat: true }), tube([[(KP.x0 + KP.x1) / 2, 0, ZG + KP.h], [(KP.x0 + KP.x1) / 2, 0, ZG + KP.h + 3]], 0.9, STONE[0], { seg: 8, mat: "concrete" }));
  // camp: fire, ammunition, and the engineer
  o.push(sphere([PX - 9, -15, ZG + 1.4], 1.5, "#8f8a82", { mat: "concrete" }), sphere([PX - 6, -16.4, ZG + 1.4], 1.5, "#8f8a82", { mat: "concrete" }), sphere([PX - 7.6, -15.4, ZG + 3.6], 1.5, "#8f8a82", { mat: "concrete" }));
  o.push(tube([[G3.CAMP + 17, 15, ZG + 0.6], [G3.CAMP + 21, 18, ZG + 0.6]], 0.5, WOOD2, { seg: 6, mat: "matte" }), tube([[G3.CAMP + 21, 15, ZG + 0.6], [G3.CAMP + 17, 18, ZG + 0.6]], 0.5, WOOD2, { seg: 6, mat: "matte" }));
  o.push(lathe([[0, 0], [1.7, 0], [1.3, 4.3], [0.5, 4.9], [0, 4.9]], "#3f6a9a", { c: [PX - 15, 13, ZG], seg: 14, mat: "matte" }), sphere([PX - 15, 13, ZG + 5.9], 1.05, "#e2b891", { mat: "matte" }));
  return o;
}
function wallParts() {
  const o = [];
  for (let c = 0; c < W.cols; c++) { const col = wall[c], yc = (c - (W.cols - 1) / 2) * W.cw;
    for (let r = 0; r < col.n; r++) { const z = ZG + r * W.bh + (r >= col.fr ? col.off : 0); o.push(box(XW, XW + W.depth, yc - W.cw / 2 + 0.12, yc + W.cw / 2 - 0.12, z + 0.08, z + W.bh - 0.08, STONE[(c + r) % 2], { mat: "concrete", bevel: 0.3 })); }
    if (col.merlon && col.n > 0) { const z = ZG + col.n * W.bh + col.off; o.push(box(XW, XW + W.depth, yc - 2.6, yc + 2.6, z, z + W.mh, STONE[0], { mat: "concrete", bevel: 0.3 })); } }
  return o;
}
const debParts = () => deb.map((d) => box(d.p[0] - d.sz[0] / 2, d.p[0] + d.sz[0] / 2, d.p[1] - d.sz[1] / 2, d.p[1] + d.sz[1] / 2, d.p[2] - d.sz[2] / 2, d.p[2] + d.sz[2] / 2, STONE[d.col], { mat: "concrete", bevel: 0.3 }));
function campParts() { const x = G3.CAMP, h = campFlat ? 0.9 : 9.5, w = campFlat ? 11 : 8, o = [prism([[-w, ZG], [w, ZG], [campFlat ? 3 : 0, ZG + h]], "x", x - 9, x + 9, "#cdb78c", { mat: "matte", bevel: 0.2 })];
  if (!campFlat) o.push(prism([[-2.2, ZG], [2.2, ZG], [0, ZG + 6]], "x", x + 9, x + 9.15, "#3a3026", { bevel: 0, flat: true }), tube([[x - 9.6, 0, ZG], [x - 9.6, 0, ZG + 13]], 0.3, WOOD2, { seg: 6, mat: "matte" }), prism([[x - 9.6, ZG + 13], [x - 14, ZG + 11.5], [x - 9.6, ZG + 10]], "y", -0.15, 0.15, "#3f6a9a", { mat: "matte", bevel: 0 }));
  else o.push(tube([[x - 9.6, 0, ZG + 0.4], [x - 2, 9, ZG + 0.4]], 0.3, WOOD2, { seg: 6, mat: "matte" }));
  return o; }
const flagParts = () => { const x = (KP.x0 + KP.x1) / 2; return [tube([[x, 0, ZG + KP.h + 3], [x, 0, ZG + KP.h + 17]], 0.35, "#d8d2c4", { seg: 6, mat: "matte" }), prism([[x, ZG + KP.h + 17], [x - 8, ZG + KP.h + 14.5], [x, ZG + KP.h + 12]], "y", -0.15, 0.15, "#b8281e", { mat: "matte", bevel: 0 })]; };

// where the arm and the stone are right now
function pose() {
  const s = shot; let th = TH0, p = null, flying = false, slingTo = null;
  const r0 = mach(P.Ll * Math.cos(TH0) - Math.sqrt(cfg.r * cfg.r - (0.5 - P.zg) ** 2), P.zg);
  if (snapAt !== null || !s) return { th, p: r0, flying, ready: true };
  const sa = s.res.samples, at = (t) => { const f = clamp(t / 0.01 - 1, 0, sa.length - 1), i = Math.floor(f), j = Math.min(sa.length - 1, i + 1), u = f - i; return [sa[i][0] + (sa[j][0] - sa[i][0]) * u, sa[i][1] + (sa[j][1] - sa[i][1]) * u, sa[i][2] + (sa[j][2] - sa[i][2]) * u]; };
  if (s.phase === "swing") { const a = at(s.t); th = a[0]; p = mach(a[1], a[2]); }
  else {
    const arm = s.res.arm, e = at(9); th = arm ? arm[Math.min(arm.length - 1, Math.floor(s.armT / 0.01))] : e[0];
    if (s.res.rel) { const r = s.res.rel, pl = s.plan, T = pl.T, t = s.phase === "fly" ? s.tf : T, u = t / T, d = r.d + r.vd * t, z = r.z + r.vz * t - 0.5 * P.g * t * t;
      p = field(d, Math.max(0, z), s.y * u); p[0] += (S - SF) * r.d * (1 - u); p[2] += (S - SF) * r.z * (1 - u); flying = s.phase === "fly";
      if (s.phase === "roll") { p = field(pl.R + (G3.DW - 2.4 - pl.R) * s.roll, 0, s.y); p[2] = ZG + s.a.rest + 3 * Math.abs(Math.sin(s.roll * Math.PI * 2)) * (1 - s.roll); flying = true; }
      if (s.phase === "done") p = null;
      const k = sm(0, 1.3, s.armT); slingTo = [-Math.cos(r.ph) * (1 - k), Math.sin(r.ph) * (1 - k) - k]; }
    else if (s.phase === "done") { p = s.res.fail.kind === "hung" ? mach(e[1], e[2]) : null; slingTo = s.res.fail.kind === "hung" ? null : [0, -1]; }
    if (recock > 0) { const k = sm(0, 1.1, recock); th = th + (TH0 - th) * k; if (k > 0.85) { p = r0; slingTo = null; } }
  }
  return { th, p, flying, slingTo };
}
function draw(dt = 0) {
  const s = shot, ps = pose(), a = AMMO[cfg.ammo], K = smashAt !== null ? now - smashAt : -1, N = snapAt !== null ? now - snapAt : -1, piv = [PX, 0, ZP];
  let th = ps.th, base = null;
  if (K >= 0) base = tipM([PX, 8.2, ZG], -1.42 * sm(0, 0.55, K) * (1 - sm(END - 0.7, END - 0.1, K)), "x");
  const wrap = (m) => (base ? mul(base, m) : m);
  let mIn = tipM(piv, th, "y"), mOut = mIn, thIn = th;
  if (N >= 0) { const back = 1 - sm(END - 0.7, END - 0.1, N); thIn = TH0 + (Math.PI / 2 - TH0) * (1 - Math.exp(-2.2 * N) * Math.cos(5 * N)) * back; mIn = tipM(piv, thIn, "y");
    const tip = mach(P.Ll * Math.cos(TH0), P.H + P.Ll * Math.sin(TH0)); mOut = mul(tipM(tip, -TH0 * sm(0, 0.42, N) * back, "y"), tipM(piv, TH0, "y")); }
  const hinge = [PX + AS * Math.cos(thIn), 0, ZP - AS * Math.sin(thIn)], drop = N >= 0 ? -Math.min(hinge[2] - ZG - 2.6 - 4.6 * Math.cbrt(cfg.M / 3), 240 * Math.max(0, N - 0.25) ** 2) * (1 - sm(END - 0.7, END - 0.1, N)) : 0;
  const objs = [{ cache: "field", rev: lightTheme ? 1 : 0, parts: fieldParts }, { cache: "frame", rev: 0, m: base || undefined, parts: frameParts }, { cache: "armIn", rev: 0, m: wrap(mIn), parts: armIn }, { cache: "armOut", rev: 0, m: wrap(mOut), parts: armOut },
    { cache: "cw", rev: cfg.M, m: wrap(moveM([hinge[0], hinge[1], hinge[2] + drop])), parts: cwParts }, { cache: "camp", rev: campFlat ? 1 : 0, parts: campParts }];
  if (wall.some((c) => c.off > 0)) objs.push({ parts: wallParts() }); else objs.push({ cache: "wall", rev: wallRev, parts: wallParts });
  if (deb.length) { if (deb.some((d) => !d.rest)) objs.push({ parts: debParts() }); else objs.push({ cache: "deb", rev: debRev, parts: debParts }); }
  if (flagOff === null) objs.push({ cache: "flag", rev: 0, parts: flagParts });
  else { const c = now - flagOff; if (c < 2.2) objs.push({ cache: "flag", rev: 0, m: mul(moveM([30 * c, 26 * c, 50 * c - 80 * c * c]), tipM([(KP.x0 + KP.x1) / 2, 0, ZG + KP.h + 3], 3 * c, "x")), parts: flagParts }); }
  litter.forEach((l, i) => objs.push({ cache: "lit" + i, rev: l.k, m: mul(moveM([l.x, l.y, ZG + AMMO[l.k].lie]), l.k ? mul(tipM([0, 0, 0], l.a, "z"), tipM([0, 0, 0], Math.PI / 2, "x")) : moveM([0, 0, 0])), parts: () => ammoParts(l.k) }));
  const tipW = N >= 0 ? mach(P.Ll * Math.cos(TH0), P.H + P.Ll * Math.sin(TH0)) : [PX - AX * Math.cos(th), 0, ZP + AX * Math.sin(th)];
  if (ps.p && K < 0) { const k = s ? s.k : cfg.ammo, spin = s ? s.spin : 0; objs.push({ cache: "ammo" + k, rev: 0, m: mul(moveM([ps.p[0], ps.p[1], Math.max(ps.p[2], ZG + AMMO[k].rest * (ps.flying ? 0 : 1))]), tipM([0, 0, 0], spin, "y")), parts: () => ammoParts(k) }); }
  let svg = E.render(objs);
  // sling
  if (K < 0) { let end = null; if (ps.p && !ps.flying && (!s || s.phase === "swing" || recock > 0 || (s.res.fail && s.res.fail.kind === "hung"))) end = [ps.p[0], ps.p[1], Math.max(ps.p[2], ZG + 0.8)]; else if (ps.slingTo) { const L = Math.hypot(ps.slingTo[0], ps.slingTo[1]) || 1, r = cfg.r * S; end = [tipW[0] + (ps.slingTo[0] / L) * r, 0, Math.max(ZG + 0.4, tipW[2] + (ps.slingTo[1] / L) * r)]; }
    if (end) E.line(tipW, end, 0.55, ROPE, 0.95); }
  // tracer (x-ray): where the stone has been
  if (ps.p && dt > 0 && s && (s.phase === "swing" || ps.flying) && frameN % 2 === 0) trace.push([...ps.p]);
  if (trace.length > 420) trace.shift();
  // multiple exposure of the swing (x-ray): the arm and sling every tenth of a second
  if (s && s.phase === "swing" && ps.p && dt > 0 && s.t >= ghostT) { ghostT = s.t + 0.1; ghosts.push([[PX + AS * Math.cos(th), 0, ZP - AS * Math.sin(th)], [PX - AX * Math.cos(th), 0, ZP + AX * Math.sin(th)], [...ps.p]]); }
  if (E.xray > 0.05) { const gc = lightTheme ? "#c8501a" : "#ffd27a";
    for (const g of ghosts) { E.line(g[0], g[1], 0.5, gc, 0.2 * E.xray, !lightTheme); E.line(g[1], g[2], 0.3, gc, 0.3 * E.xray, !lightTheme); E.sprite(g[2], 0.9, gc, 0.6 * E.xray, !lightTheme, 1); }
    for (const t of trace) E.sprite(t, 0.55, gc, 0.75 * E.xray, !lightTheme, 1); }
  // fire, dust and chips
  if (dt > 0) { if (s && s.k === 1 && ps.p && (ps.flying || s.phase === "swing")) for (let j = 0; j < 2; j++) fx.push({ k: "fire", p: [ps.p[0] + (rn() - 0.5), ps.p[1] + (rn() - 0.5), ps.p[2] + 1], v: [(rn() - 0.5) * 8, (rn() - 0.5) * 8, 10 + rn() * 14], life: 0, max: 0.35 + rn() * 0.3 });
    fires = fires.filter((f) => now < f.until); for (const f of fires) for (let j = 0; j < 2; j++) fx.push({ k: "fire", p: [f.p[0] + (rn() - 0.5) * 6, f.p[1] + (rn() - 0.5) * 6, f.p[2]], v: [(rn() - 0.5) * 6, (rn() - 0.5) * 6, 14 + rn() * 22], life: 0, max: 0.4 + rn() * 0.5 });
    if (!campFlat && rn() < 0.5) fx.push({ k: "fire", p: [G3.CAMP + 19 + (rn() - 0.5) * 1.6, 16.5 + (rn() - 0.5) * 1.6, ZG + 1], v: [(rn() - 0.5) * 3, (rn() - 0.5) * 3, 7 + rn() * 9], life: 0, max: 0.3 + rn() * 0.4 }); }
  fx = fx.filter((p) => {
    p.life += dt; if (p.life > p.max) return false;
    const t = p.life / p.max;
    if (p.k === "chip") p.v[2] -= 220 * dt; else if (p.k === "dust") { p.v[0] *= 0.94; p.v[1] *= 0.94; p.v[2] *= 0.93; }
    for (let i = 0; i < 3; i++) p.p[i] += p.v[i] * dt;
    if (p.k === "chip") { if (p.p[2] < ZG) return false; E.sprite(p.p, 0.7, p.col, 0.95); }
    else if (p.k === "fire") E.sprite(p.p, 2.6 * (1 - t * 0.6), t < 0.4 ? "#ffd27a" : "#ff6a1a", 0.7 * (1 - t), true, 1);
    else E.sprite(p.p, (4 + 13 * t) * p.s, p.col, (lightTheme ? 0.5 : 0.32) * (1 - t));
    return true;
  });
  // lettering
  for (const d of [50, 100, 150]) { const p = E.project([PX + SF * d, -40, ZG + 11]); svg += '<text class="mk-lab fl" text-anchor="middle" x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '">' + d + " m</text>"; }
  { const p = E.project([XW + W.depth / 2, -(W.cols * W.cw * 0.5 + 6.5), ZG + 53]); svg += '<text class="mk-lab fl" text-anchor="middle" x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '">' + G3.DW + " m</text>"; }
  for (const m of marks) if (m.text) { const p = E.project([m.p[0], m.p[1], ZG + 5]); svg += '<text class="mk-lab gl" text-anchor="middle" x="' + p[0].toFixed(1) + '" y="' + p[1].toFixed(1) + '">' + m.text + "</text>"; }
  const m2 = E.faceMatrix([PL.x + 12, PL.y + PL.d - 13, 0.05], [1, 0, 0], [0, 1, 0]);
  if (m2) svg += '<g transform="' + m2 + '"><text class="pt bench" x="0" y="5" font-size="5">SIEGE WORKS</text></g>';
  if (sceneG.innerHTML !== svg) sceneG.innerHTML = svg;
  const sh = now - shakeAt; if (sh >= 0 && sh < 0.6) { const A = shakeA * Math.exp(-sh / 0.16); setShake(A * Math.sin(sh * 90), A * Math.cos(sh * 71)); } else setShake(0, 0);
  const text = N >= 0 ? "arm snapped · " + cfg.M + " t on a " + G3.LIMIT + " t arm" : K >= 0 ? "that was your own trebuchet"
    : !s ? "ready · " + cfg.M + " t · " + cfg.r + " m sling · " + a.name.toLowerCase() : s.phase === "swing" ? "loosed · counterweight falling" : s.phase === "fly" || s.phase === "roll" ? "airborne · " + s.res.v.toFixed(0) + " m/s at " + Math.round(deg(s.res.ang)) + "°" : lastText || "done";
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuetext", text);
}

// ---------------- running it ----------------
let frameN = 0;
const TOUR = D.TOUR;
function tick(t) {
  const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
  last = t; now += dt; frameN++;
  if (touring && !shot && smashAt === null && snapAt === null) {
    tourWait -= dt;
    if (tourWait <= 0) {
      const cur = TOUR[Math.max(0, tourStep)];
      if (tourStep >= 0 && !cur.done) { cur.done = true; loose(); tourWait = 1.4; }
      else { tourStep = (tourStep + 1) % TOUR.length; const st = TOUR[tourStep]; st.done = false; if (tourStep === 0 || breached) rebuild(); Object.assign(cfg, st.c); tourWait = 1.8; say(st.say); }
    }
  }
  step(dt);
  draw(dt); syncUi();
  frame = visible ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { touring = false; };
const set = (k, v) => { takeOver(); if (smashAt !== null || snapAt !== null) return; if (shot) { shot = null; recock = 0; } cfg[k] = v; say(k === "M" && v > G3.LIMIT ? v + " tonnes. The arm is only good for " + G3.LIMIT + ". Go on, then." : "Changed. Loose it."); run(); };
const go = () => { takeOver(); if (shot) { shot = null; recock = 0; } loose(); run(); };
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
for (const [k, key] of [["cw", "M"], ["sling", "r"], ["rel", "rel"]]) {
  ui[k].addEventListener("input", () => { sliding[k] = true; set(key, +ui[k].value); });
  ui[k].addEventListener("change", () => { sliding[k] = false; run(); });
}
ui.ammo.forEach((b, i) => b.addEventListener("click", () => set("ammo", i)));
ui.loose.addEventListener("click", go);
ui.rebuild.addEventListener("click", () => { takeOver(); rebuild(); shot = null; lastText = ""; say("Wall rebuilt, tent back up, field cleared. As you were."); run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { tourStep = -1; tourWait = 0; shot = null; } run(); });
onTap(go);
stage.addEventListener("keydown", (ev) => {
  const big = ev.shiftKey ? 4 : 1, map = { x: () => { setX(!E.xrayOn); run(); }, X: () => { setX(!E.xrayOn); run(); }, ArrowRight: () => set("M", clamp(cfg.M + 0.25 * big, 1, 14)), ArrowLeft: () => set("M", clamp(cfg.M - 0.25 * big, 1, 14)), ArrowUp: () => set("r", clamp(cfg.r + 0.5, 4, 11)), ArrowDown: () => set("r", clamp(cfg.r - 0.5, 4, 11)),
    q: () => set("rel", clamp(cfg.rel - 5, -90, 60)), e: () => set("rel", clamp(cfg.rel + 5, -90, 60)), 1: () => set("ammo", 0), 2: () => set("ammo", 1), 3: () => set("ammo", 2), r: () => ui.rebuild.click(), " ": go, Enter: go };
  if (map[ev.key]) { ev.preventDefault(); map[ev.key](); }
});
window.__fig = { E, x: setX, freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; }, set: (o) => { takeOver(); shot = null; recock = 0; Object.assign(cfg, o); }, loose: go, sim: simulate, state: () => ({ phase: shot && shot.phase, plan: shot && shot.plan, lastText, breached }) };
setX(true); say("Counterweight, sling length and when the sling lets go. The wall is 200 metres away. Knock it down."); syncUi(); draw();

`;

const CSS = `.pt{font-family:var(--anatomy-mono);fill:#23262b;font-weight:700}.pt.bench{fill:#e8f0dc;font-weight:600;letter-spacing:.08em;opacity:.55}
.gl{font-size:calc(12.5px*var(--mk-ts,1))}.fl{font-weight:500;font-size:calc(10.5px*var(--mk-ts,1));fill:var(--anatomy-muted)}
@media (min-width:561px){.mk-hint{top:46px}}
.ctl #loose{padding:7px 16px;font-weight:600;letter-spacing:.06em}
.slide{padding-top:12px}.notch{position:absolute;top:8px;bottom:0;width:0;border-left:2px solid var(--mk-danger);pointer-events:none}.notch::after{content:attr(data-label);position:absolute;bottom:100%;right:-2px;font-size:9.5px;white-space:nowrap;color:var(--mk-danger)}
#cw-out[data-bad="true"]{color:var(--mk-danger)}
.ctl .res{min-width:0;flex:1;text-align:left;font-weight:600;color:var(--anatomy-strong)}`;

const stage = stageHtml({
  W, H, fig: "Fig 30", title: "Trebuchet", xray: true,
  label: "A counterweight trebuchet on a grass field, with a tent and campfire behind it and a castle wall, two towers and a keep 200 metres downrange. Loosing it drops the counterweight, swings the arm over and whips a stone, a burning barrel or a cow out of the sling. Depending on the settings it knocks blocks out of the wall, falls short, flies over, goes backwards into the camp, comes down on the trebuchet itself, or the arm snaps. A tracer view shows the path the load took.",
  keysHelp: "Trebuchet: drag to rotate, X for the tracer, tap or space looses; left and right change the counterweight (shift for big steps), up and down the sling, Q and E the release, 1 to 3 the load, R rebuilds the wall",
  extra: ``,
});

const CONTROLS = `<div class="ctl" role="group" aria-label="Trebuchet controls">
  <div class="ctl-row"><span class="ctl-label">Weight</span><div class="slide"><span class="notch" style="left:${((GEO.LIMIT - 1) / 13) * 100}%" data-label="arm limit"></span><input id="cw" type="range" min="1" max="14" step="0.25" value="${START.M}" aria-label="Counterweight in tonnes"></div><output id="cw-out"></output></div>
  <div class="ctl-row"><span class="ctl-label">Sling</span><div class="slide"><input id="sling" type="range" min="4" max="11" step="0.5" value="${START.r}" aria-label="Sling length in metres"></div><output id="sling-out"></output></div>
  <div class="ctl-row"><span class="ctl-label">Lets go</span><div class="slide"><input id="rel" type="range" min="-90" max="60" step="5" value="${START.rel}" aria-label="Release: angle of the sling to the arm when it lets go, negative is earlier"></div><output id="rel-out"></output></div>
  <div class="ctl-row"><span class="ctl-label">Load</span><button type="button" data-ammo="0" aria-pressed="true">Stone<small>100 kg</small></button><button type="button" data-ammo="1" aria-pressed="false">Fire barrel<small>60 kg</small></button><button type="button" data-ammo="2" aria-pressed="false">Cow<small>300 kg</small></button></div>
  <div class="ctl-row"><span class="ctl-label">Last shot</span><output id="res" class="res"></output></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="loose" class="danger">LOOSE</button><button type="button" id="rebuild">Rebuild</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
</div>`;

const foot = footHtml({
  theme, slug: "trebuchet",
  real: "the swing. The arm and sling are solved as a proper two-part pendulum driven by the falling counterweight, with the stone sliding along a trough until the sling lifts it, so the way range changes with counterweight, sling length and release point is how a trebuchet behaves.",
  made: "the numbers. The counterweight is fixed to the arm (real ones usually hang), there is no air drag or friction so it out-throws a real machine, and the arm's 10 t limit, the weights, the wall and the cow are invented. The field is squashed: the wall is 200 m away but drawn about four times closer than the machine's scale.",
});
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), pageMk2({
  k, title: "Trebuchet", fig: "Fig 30", hint: "Tap: loose", theme, W, H, stage, controls: CONTROLS, css: CSS, foot,
  caption: "A trebuchet is a see-saw with a grudge. A heavy box on the short end of the arm drops a few metres, and the long end, four times longer, comes round four times faster. The sling on the end is the clever part: it swings out as the arm comes over and whips the stone round faster again, and it lets go when its ring slips off a pin on the tip of the arm. Bend that pin one way and it lets go early, and the stone goes up, or back over your own head. Bend it the other way and it lets go late, and the stone goes into the ground in front of you. A longer sling throws harder but lets go later, so the two have to be tuned together. No engineering value here. Just siege warfare.",
  script: LIVE.replace("__DATA__", JSON.stringify(DATA)),
}));
console.log("wrote", name);
