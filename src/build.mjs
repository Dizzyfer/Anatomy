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

// Truth: reference-gas MESG (g0, mm) as tabled by IECEx ExTAG for the IEC 60079-20-1 reference gases.
const GASES = [
  { id: "CH4", group: "I", mesg: 1.14 },
  { id: "C3H8", group: "IIA", mesg: 0.92 },
  { id: "C2H4", group: "IIB", mesg: 0.65 },
  { id: "H2", group: "IIC", mesg: 0.29 },
];
const GAP_MAX = 1.3;
const VIS = 13; // world units of lift per mm of gap (enlarged)

const PLATE = { x: -150, y: -84, w: 290, d: 166, r: 8 };
const PLATE_H = 12;
const FOOT_H = 5;

const CUT = 6; // the cutaway removes x > CUT and y > CUT
const OUT = { x: -40, y: -36, w: 80, d: 72 }; // body outside
const WALL = 4;
const CAV = { x: -36, y: -32, w: 72, d: 64 }; // cavity
const FLOOR_TOP = 8;
const BODY_TOP = 52;
const FLANGE = { x: -46, y: -42, w: 92, d: 84 };
const FW = 12; // flamepath width, drawn: stands for 25 mm
const FLANGE_TOP = 60;
const LID_H = 8;
const BOSS = { x: -33, y: -29, w: 66, d: 58 };
const BOSS_H = 5;
const LID_TOP = FLANGE_TOP + LID_H + BOSS_H;
const SPARK = [-14, -10, 22];

const BOLTS = [[-39.5, -35.5], [39.5, -35.5], [-39.5, 35.5], [0, -35.5], [0, 35.5], [-39.5, 0], [39.5, 0]];
const FRONT_BOLT = ([x, y]) => x > CUT - 10 && y > -10 && (x > 30 || y > 30);

const BOTTLES = GASES.map((g, i) => ({ ...g, at: [-118, -4 + i * 24] }));
const BOTTLE_R = 8;
const BOTTLE_H = 46;

const TIP = [20, -18];
const POST = [84, -18];
const DIAL_R = 15;
const DIAL_Z = 116;
const DIAL_H = 9;
const DIAL_TOP = DIAL_Z + DIAL_H;
const SLEEVE_FROM = 88;
const PLUNGER_LEN = 22;

const P = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [TIP[0], TIP[1], DIAL_TOP + 2], [POST[0], POST[1], DIAL_TOP + 8], [-118, 70, 62]],
  W, H, { pad: 26, azimuth: 45 },
);

const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const depth2 = ([x, y]) => k.depthOf([x, y, 0], P);
const byDepth = (points) => [...points].sort((a, b) => depth2(a) - depth2(b));
const box = (plan, z, h, r = 1.2, bevel = 0.5) => k.slabOf({ ...plan, r }, z, h, P, 4, bevel);
// an L-shaped prism: the plan with the cut quadrant removed
const lRing = ({ x, y, w, d }) => [[x, y], [x + w, y], [x + w, CUT], [CUT, CUT], [CUT, y + d], [x, y + d]];
const lSolid = (plan, z, h) => k.extrude(lRing(plan), z, h, P, { convex: false });
const lOutline = (plan, z) => k.onTop(lRing(plan), z, P, true);

// ---------- back layer ----------
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
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  const strip = { x: -60, y: PLATE.y + PLATE.d - 15, w: 186, d: 7, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.8, 0.6, [2, 3.6], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(D([at([strip.x + 2, strip.y + 3.5, 0.6]), at([strip.x + strip.w - 2, strip.y + 3.5, 0.6])], { size: 0.45 }));
  const rack = { x: -132, y: -18, w: 28, d: 100, r: 3 };
  out.push(S(k.slabOf(rack, 0, 2, P, 4, 0.5), { tone: "lo" }));
  out.push(D(k.corners(rack, 4).map(([x, y]) => at([x, y, 2])), { size: 0.45 }));
  return out.join("");
}

function bottle(b) {
  const [x, y] = b.at;
  const out = [];
  out.push(S(k.cylinder(x, y, BOTTLE_R + 1.2, 2, 2.4, P, 32), { tone: "lo" }));
  out.push(S(k.cylinder(x, y, BOTTLE_R, 4.4, BOTTLE_H, P, 40, 0.8), { tone: "hi", inner: L(k.sideArc(x, y, BOTTLE_R, 4.4 + BOTTLE_H * 0.62, P, 32) + k.sideArc(x, y, BOTTLE_R, 4.4 + BOTTLE_H * 0.78, P, 32), { tone: "faint" }) }));
  const top = 4.4 + BOTTLE_H;
  out.push(S(k.cylinder(x, y, 5.6, top, 3, P, 32, 0.5), { tone: "hi" }));
  out.push(S(k.cylinder(x, y, 2.6, top + 3, 4, P, 20), { tone: "hi" }));
  out.push(S(k.cylinder(x, y, 4.4, top + 7, 1.6, P, 28), { tone: "hi" }));
  out.push(L(k.knurl(x, y, 4.4, top + 7, top + 8.6, 22, P), { tone: "lo" }));
  out.push(D([at([x, y, top + 8.6])], { size: 0.55, tone: "hi" }));
  return `<g data-bottle="${b.id}">${out.join("")}</g>`;
}

function tags() {
  return BOTTLES.map((b) => {
    const [x, y] = b.at;
    const tag = { x: x + 12, y: y - 7, w: 26, d: 14, r: 1.4 };
    return S(k.slabOf(tag, 0, 1, P, 3, 0.3), { tone: "lo" }) +
      `<g data-tag="${b.id}">` + k.faceTextSvg(k.topMatrix([tag.x + 2.4, y - 0.6], 1, P, "x"), b.id, { size: 4.2, tone: "mid" }) +
      k.faceTextSvg(k.topMatrix([tag.x + 2.4, y + 4.2], 1, P, "x"), b.group + "  " + b.mesg.toFixed(2), { size: 3, tone: "lo" }) + `</g>`;
  }).join("");
}

function bodyBack() {
  const out = [`<path class="iso-halo" d="${k.haloOf({ ...k.insetPlan({ ...OUT, r: 2 }, -7) }, 0, 0.1, P)}"/>`];
  const lugs = [[OUT.x - 8, OUT.y + 8], [OUT.x - 8, OUT.y + OUT.d - 8], [OUT.x + OUT.w + 8, OUT.y + 8]];
  for (const [x, y] of byDepth(lugs)) {
    out.push(S(k.slabOf({ x: x - 7, y: y - 6, w: 14, d: 12, r: 3 }, 0, 4, P, 4, 0.4), { tone: "mid" }));
    out.push(S(k.cylinder(x, y, 3, 4, 1.4, P, 6), { tone: "mid" }));
    out.push(D([at([x, y, 5.4])], { size: 0.5 }));
  }
  // plinth and floor, cut
  const plinth = { x: OUT.x - 3, y: OUT.y - 3, w: OUT.w + 6, d: OUT.d + 6 };
  out.push(S(lSolid(plinth, 0, 4), { tone: "mid" }));
  out.push(S(lSolid(OUT, 4, FLOOR_TOP - 4), { tone: "mid" }));
  // back walls (their inner faces show through the cut)
  out.push(S(box({ x: OUT.x, y: OUT.y, w: OUT.w, d: WALL }, FLOOR_TOP, BODY_TOP - FLOOR_TOP, 0.6, 0.3), { tone: "mid" }));
  out.push(S(box({ x: OUT.x, y: OUT.y + WALL, w: WALL, d: OUT.d - WALL }, FLOOR_TOP, BODY_TOP - FLOOR_TOP, 0.6, 0.3), { tone: "mid" }));
  // casting draft lines on the inner walls
  out.push(L([16, 30, 44].map((z) => k.segment([CAV.x, CAV.y, z], [CAV.x + CAV.w, CAV.y, z], P) + k.segment([CAV.x, CAV.y, z], [CAV.x, CAV.y + CAV.d, z], P)).join(""), { tone: "faint" }));
  // igniter on the floor
  const [sx, sy] = SPARK;
  out.push(S(k.cylinder(sx, sy, 5, FLOOR_TOP, 2, P, 6), { tone: "mid" }));
  out.push(S(k.cylinder(sx, sy, 3, FLOOR_TOP + 2, 7, P, 24), { tone: "hi", inner: L(k.sideArc(sx, sy, 3, FLOOR_TOP + 5, P, 16) + k.sideArc(sx, sy, 3, FLOOR_TOP + 7, P, 16), { tone: "faint" }) }));
  out.push(S(k.cylinder(sx, sy, 1, FLOOR_TOP + 9, SPARK[2] - FLOOR_TOP - 10, P, 12), { tone: "mid", crease: "none" }));
  out.push(D([at([sx, sy, SPARK[2] - 1])], { size: 0.7, tone: "hi" }));
  // back flange bars
  out.push(S(box({ x: FLANGE.x, y: FLANGE.y, w: FLANGE.w, d: FW }, BODY_TOP, FLANGE_TOP - BODY_TOP), { tone: "mid" }));
  out.push(S(box({ x: FLANGE.x, y: FLANGE.y + FW, w: FW, d: FLANGE.d - FW }, BODY_TOP, FLANGE_TOP - BODY_TOP), { tone: "mid" }));
  out.push(L(BOLTS.filter((b) => !FRONT_BOLT(b)).map(([x, y]) => k.ring(x, y, 2.4, FLANGE_TOP, P, 16)).join(""), { tone: "lo" }));
  return out.join("");
}

// ---------- mid layer (covers the interior fire) ----------
function bodyFront() {
  const out = [];
  // front walls, cut, with ribs on the outer faces ending on two seams
  const z0 = 14, z1 = 46;
  const wallX = { x: OUT.x + OUT.w - WALL, y: OUT.y + WALL, w: WALL, d: CUT - OUT.y - WALL };
  const wallY = { x: OUT.x + WALL, y: OUT.y + OUT.d - WALL, w: CUT - OUT.x - WALL, d: WALL };
  const ribsX = [], ribsY = [];
  for (let y = OUT.y + 8; y <= CUT - 4; y += 7) ribsX.push(k.rise([OUT.x + OUT.w, y], z0, z1, P));
  for (let x = OUT.x + 8; x <= CUT - 4; x += 7) ribsY.push(k.rise([x, OUT.y + OUT.d], z0, z1, P));
  const seam = (from, to) => [z0, z1].map((z) => k.segment([...from, z], [...to, z], P)).join("");
  out.push(S(box(wallX, FLOOR_TOP, BODY_TOP - FLOOR_TOP, 0.4, 0.3), { tone: "mid", inner: L(seam([OUT.x + OUT.w, OUT.y + 2], [OUT.x + OUT.w, CUT]), { tone: "lo" }) + L(ribsX.join(""), { tone: "faint" }) }));
  out.push(S(box(wallY, FLOOR_TOP, BODY_TOP - FLOOR_TOP, 0.4, 0.3), { tone: "mid", inner: L(seam([OUT.x + 2, OUT.y + OUT.d], [CUT, OUT.y + OUT.d]), { tone: "lo" }) + L(ribsY.join(""), { tone: "faint" }) }));
  // nameplate on the +y face
  const m = k.sideMatrix([-30, OUT.y + OUT.d + 0.01], 42, P, "left");
  out.push(`<g transform="${m}"><rect x="0" y="0" width="28" height="15" rx="1" style="fill:var(--anatomy-paper);stroke:var(--anatomy-mid);stroke-width:.35"/>` +
    `<text class="iso-face-text" data-tone="mid" x="2.4" y="4.6" font-size="3.2">Ex db</text>` +
    `<path class="iso-line" data-tone="faint" data-free="" d="M2.4 8h23M2.4 10.6h23M2.4 13h16"/>` +
    [[1.3, 1.3], [26.7, 1.3], [1.3, 13.7], [26.7, 13.7]].map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r=".45" style="fill:var(--anatomy-mid)"/>`).join("") + `</g>`);
  // front flange bars: the fixed half of the flamepath, sectioned at the cut
  const fx = { x: FLANGE.x + FLANGE.w - FW, y: FLANGE.y + FW, w: FW, d: CUT - FLANGE.y - FW };
  const fy = { x: FLANGE.x + FW, y: FLANGE.y + FLANGE.d - FW, w: CUT - FLANGE.x - FW, d: FW };
  const hatch = (face) => {
    const lines = [];
    for (let s = -8; s < FW + 8; s += 2.2) {
      const a = Math.max(0, s), b = Math.min(FW, s + 8);
      if (b - a < 0.3) continue;
      const za = BODY_TOP + (a - s), zb = BODY_TOP + (b - s);
      lines.push(face === "y" ? k.segment([fx.x + a, CUT, za], [fx.x + b, CUT, zb], P) : k.segment([CUT, fy.y + a, za], [CUT, fy.y + b, zb], P));
    }
    return L(lines.join(""), { tone: "faint" });
  };
  out.push(S(box(fx, BODY_TOP, FLANGE_TOP - BODY_TOP, 0.4, 0.3), { tone: "mid", inner: hatch("y") }));
  out.push(S(box(fy, BODY_TOP, FLANGE_TOP - BODY_TOP, 0.4, 0.3), { tone: "mid", inner: hatch("x") }));
  out.push(L(BOLTS.filter(FRONT_BOLT).map(([x, y]) => k.ring(x, y, 2.4, FLANGE_TOP, P, 16)).join(""), { tone: "lo" }));
  // earth stud on its own pad
  out.push(S(k.slabOf({ x: 44, y: -12, w: 10, d: 10, r: 2 }, 0, 3, P, 4, 0.3), { tone: "mid" }));
  out.push(S(k.cylinder(49, -7, 2.4, 3, 4, P, 6), { tone: "mid" }));
  out.push(S(k.cylinder(49, -7, 1.1, 7, 3, P, 12), { tone: "mid" }));
  return out.join("");
}

function lid() {
  const out = [];
  out.push(S(lSolid(FLANGE, FLANGE_TOP, LID_H), { tone: "hi" }));
  out.push(L(lOutline(k.insetPlan({ ...FLANGE, r: 0 }, 2.5), FLANGE_TOP + LID_H), { tone: "faint" }));
  const centre = depth2([0, 0]);
  const head = ([x, y]) => S(k.cylinder(x, y, 3.9, FLANGE_TOP + LID_H, 0.6, P, 24), { tone: "mid" }) + S(k.cylinder(x, y, 3.2, FLANGE_TOP + LID_H + 0.6, 2.8, P, 6), { tone: "mid" }) + L(k.ring(x, y, 1.4, FLANGE_TOP + LID_H + 3.4, P, 12), { tone: "lo" });
  const sorted = byDepth(BOLTS);
  sorted.filter((b) => depth2(b) < centre).forEach((b) => out.push(head(b)));
  out.push(S(lSolid(BOSS, FLANGE_TOP + LID_H, BOSS_H), { tone: "hi" }));
  out.push(L(k.ring(TIP[0], TIP[1], 4.2, LID_TOP, P, 24), { tone: "lo" }));
  out.push(k.faceTextSvg(k.topMatrix([-28, -6], LID_TOP, P, "x"), "FLAMEPATH 25", { size: 2.6, tone: "lo" }));
  sorted.filter((b) => depth2(b) >= centre).forEach((b) => out.push(head(b)));
  return out.join("");
}

const plunger = () => S(k.cylinder(TIP[0], TIP[1], 2.4, LID_TOP, 1.4, P, 18), { tone: "hi", lit: true }) + S(k.cylinder(TIP[0], TIP[1], 1.3, LID_TOP + 1.4, PLUNGER_LEN, P, 14), { tone: "hi", crease: "none", lit: true });

// ---------- front layer ----------
function stand() {
  const out = [];
  const mag = { x: POST[0] - 14, y: POST[1] - 15, w: 30, d: 30, r: 3 };
  out.push(`<path class="iso-halo" d="${k.haloOf(k.insetPlan(mag, -3), 0, 0.1, P)}"/>`);
  out.push(S(k.slabOf(mag, 0, 10, P, 6, 0.8), { tone: "mid" }));
  out.push(S(k.slabOf(k.insetPlan(mag, 0.8), 10, 10, P, 6, 0.8), { tone: "mid", inner: L(k.sideSeam(k.insetPlan(mag, 0.8), 13, P), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(mag, 3.5), 20, P), { tone: "faint" }));
  const knob = [mag.x + mag.w - 7, mag.y + mag.d - 7];
  out.push(S(k.cylinder(knob[0], knob[1], 5, 20, 4, P, 32), { tone: "mid" }));
  out.push(L(k.knurl(knob[0], knob[1], 5, 20, 24, 30, P), { tone: "lo" }));
  out.push(L(k.lineOnTop(knob, [knob[0] + 5, knob[1]], 24, P), { tone: "hi" }));
  out.push(S(k.cylinder(POST[0], POST[1], 4.5, 20, 3, P, 28), { tone: "mid" }));
  out.push(S(k.cylinder(POST[0], POST[1], 2.8, 23, DIAL_TOP + 8 - 23, P, 24), { tone: "mid", crease: "none" }));
  const clampZ = DIAL_Z + 2;
  out.push(S(k.slabOf({ x: POST[0] - 6, y: POST[1] - 6, w: 12, d: 12, r: 2.4 }, clampZ - 4, 11, P, 4, 0.5), { tone: "mid" }));
  out.push(S(k.cylinder(POST[0], POST[1] + 9, 2.4, clampZ - 2, 6, P, 18), { tone: "mid" }));
  out.push(L(k.knurl(POST[0], POST[1] + 9, 2.4, clampZ - 2, clampZ + 4, 16, P), { tone: "lo" }));
  out.push(S(k.cylinder(POST[0], POST[1], 3.3, DIAL_TOP + 8, 1.6, P, 24), { tone: "mid" }));
  const arm = { x: TIP[0] + DIAL_R + 2, y: POST[1] - 3, w: POST[0] - 6 - TIP[0] - DIAL_R - 2, d: 6, r: 1.6 };
  out.push(S(k.slabOf(arm, clampZ, 4, P, 4, 0.5), { tone: "mid" }));
  out.push(D([at([arm.x + 4, POST[1], clampZ + 4]), at([arm.x + arm.w - 4, POST[1], clampZ + 4])], { size: 0.45 }));
  return out.join("");
}

function dialHead() {
  const out = [];
  const [x, y] = TIP;
  out.push(S(k.cylinder(x, y, 2.6, SLEEVE_FROM, DIAL_Z - SLEEVE_FROM, P, 20), { tone: "mid", inner: L(k.sideArc(x, y, 2.6, SLEEVE_FROM + 6, P, 12), { tone: "lo" }) }));
  out.push(S(k.slabOf({ x: x + DIAL_R - 3, y: y - 3, w: 8, d: 6, r: 1.5 }, DIAL_Z + 1, 6, P, 3, 0.4), { tone: "mid" }));
  out.push(S(k.cylinder(x, y, DIAL_R, DIAL_Z, DIAL_H, P, 64, 0.8), { tone: "hi", crease: "lo" }));
  out.push(L(k.knurl(x, y, DIAL_R, DIAL_TOP - 3, DIAL_TOP, 72, P, 0.3), { tone: "lo" }));
  out.push(L(k.ring(x, y, DIAL_R - 2, DIAL_TOP, P, 64), { tone: "lo" }));
  const ticks = k.radialTicks(x, y, DIAL_R - 2.6, 100, 10, DIAL_TOP, [1, 2.4], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(k.faceTextSvg(k.topMatrix([x, y + 7], DIAL_TOP, P, "x"), "0.01 mm", { size: 2.1, tone: "lo", anchor: "middle" }));
  out.push(L(k.ring(x, y, 1.4, DIAL_TOP, P, 16), { tone: "mid" }));
  return out.join("");
}

const lineOnTop = k.lineOnTop;
const needleAt = (turn) => {
  const a = turn * Math.PI * 2;
  const [x, y] = TIP;
  return lineOnTop([x - Math.sin(a) * 3, y + Math.cos(a) * 3], [x + Math.sin(a) * (DIAL_R - 4), y - Math.cos(a) * (DIAL_R - 4)], DIAL_TOP + 0.2, P);
};

const START = { gas: 1, gap: 0.4 };
const lift0 = START.gap * VIS;
const backSvg = k.figureSvg({
  width: W, height: H,
  label: "A flanged flameproof enclosure on a bench, cut away at the front corner. A spark plug fires the gas inside; the flame front runs along the 25 mm flange joint, seen in section at the cut, and either dies in the gap or comes out of it. A dial indicator reads the gap; four reference-gas bottles stand beside it.",
  body: [plate(), tags(), byDepth(BOTTLES.map((b) => b.at)).map((p) => bottle(BOTTLES.find((b) => b.at === p))).join(""), bodyBack(), `<g data-part="shanks-back"></g>`],
});
const layer = (body, cls = "") => `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg fx-layer ${cls}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${body}</svg>`;
const midSvg = layer([
  bodyFront(),
  `<g data-part="shanks-front"></g>`,
  `<g data-part="lid" transform="${k.translateAlong(P, [0, 0, lift0])}">${lid()}</g>`,
  `<g data-part="plunger" transform="${k.translateAlong(P, [0, 0, lift0])}">${plunger()}</g>`,
].join(""));
const frontSvg = layer([
  `<g data-part="jets-svg"></g>`,
  `<g data-part="stand">`,
  stand(),
  dialHead(),
  `<path data-part="mesg-mark" class="iso-line" data-tone="lit" data-free="" d="" style="stroke-width:1.6"/>`,
  `<path data-part="needle" class="iso-line" data-tone="lit" data-free="start" d="${needleAt(START.gap)}" style="stroke-width:1"/>`,
  `</g>`,
].join(""));

const DATA = {
  W, H, camera: glCamera(P), P, GASES, BOLTS, FLANGE, TIP, VIS, GAP_MAX, FLANGE_TOP, DIAL_R, DIAL_TOP, CUT, CAV, FLOOR_TOP, FW, SPARK, OUT,
  front: BOLTS.filter(FRONT_BOLT), back: BOLTS.filter((b) => !FRONT_BOLT(b)), start: START,
  pivots: {
    bottles: Object.fromEntries(BOTTLES.map((b, i) => [b.id, { at: at([b.at[0], b.at[1] + BOTTLE_R + 1, 2]), order: i }])),
    stand: at([POST[0] + 16, POST[1] + 15, 0]),
    lid: at([0, 0, FLANGE_TOP + LID_H]),
  },
};

const SHARED_GLSL = `
float fbmLite(vec3 p){return .62*noise3(p)+.38*noise3(p*2.07+vec3(17.1,9.2,4.7));}
uniform float uAge;
uniform float uLift;
uniform float uThrough;
uniform float uQuench;
uniform float uFade;
uniform float uLight;
const vec3 HOT=vec3(1.,.66,.28);
const vec3 BODY=vec3(1.,.36,.08);
const vec3 DULL=vec3(.55,.16,.06);
vec4 inkFor(vec3 seen,float cover){vec3 ab=1.-seen;float a=max(max(ab.r,max(ab.g,ab.b)),cover);return vec4(vec3(a)-ab,a);}
vec4 finish(float e,float core){
  // e: energy, core: 0..1 how hot (hot core vs dull body)
  vec3 hue=mix(DULL,mix(BODY,HOT,smoothstep(.45,1.,core)),smoothstep(0.,.5,core));
  vec3 c=tonemap(hue*e,1.4);
  float a=max(c.r,max(c.g,c.b));
  vec4 dark=vec4(c,a);
  float la=1.-exp(-1.8*e);
  vec3 seen=mix(vec3(1.),mix(vec3(.82,.28,.06),vec3(1.,.78,.4),smoothstep(.6,1.,core)*smoothstep(.5,1.,la)),la);
  vec4 light=inkFor(seen,.9*smoothstep(.75,1.,la)*core)*la;
  vec4 o=mix(dark,light,uLight);
  o.rgb=min(o.rgb,vec3(o.a));
  float d=(hash12(gl_FragCoord.xy+uTime)-.5)/255.*smoothstep(0.,1.5/255.,o.a);
  return max(o+d,0.);
}`;

const INNER_FRAG = SHARED_GLSL + `
const vec3 C0=vec3(${DATA.CAV.x.toFixed(1)},${DATA.CAV.y.toFixed(1)},${FLOOR_TOP.toFixed(1)});
const vec3 SP=vec3(${SPARK.map((v) => v.toFixed(1)).join(",")});
void main(){
  vec2 vb=viewOf(gl_FragCoord.xy);
  vec3 V=towardViewer();
  vec3 p0=rayOf(vb);
  vec3 bmin=C0, bmax=vec3(${(CAV.x + CAV.w).toFixed(1)},${(CAV.y + CAV.d).toFixed(1)},${FLANGE_TOP.toFixed(1)}+uLift);
  vec3 ia=(bmin-p0)/V, ib=(bmax-p0)/V;
  vec3 lo=min(ia,ib), hi=max(ia,ib);
  float t0=max(max(lo.x,lo.y),lo.z), t1=min(min(hi.x,hi.y),hi.z);
  float e=0., heat=0.;
  float R=95.*(1.-exp(-uAge/.16));
  float burned=exp(-max(0.,uAge-.1)/.38);
  if(t1>t0){
    float dt=(t1-t0)/20.;
    for(int i=0;i<20;i++){
      float t=t0+(float(i)+hash12(gl_FragCoord.xy+float(i)))*dt;
      vec3 p=p0+t*V;
      float r=length(p-SP);
      float n=fbmLite(p*.07+vec3(0.,0.,-uTime*2.2));
      float shell=exp(-pow((r-R*(.85+.3*n))/7.,2.))*smoothstep(0.,.03,uAge)*exp(-max(0.,uAge-.18)/.12);
      float inside=(1.-smoothstep(R*.8,R*1.05,r))*burned*(.45+.55*n);
      // soft fade near the box faces so nothing ends on a hard cut
      float edge=smoothstep(0.,3.,min(min(p.x-bmin.x,bmax.x-p.x),min(min(p.y-bmin.y,bmax.y-p.y),min(p.z-bmin.z,bmax.z-p.z))));
      float kept=1.-smoothstep(-2.5,2.5,min(p.x,p.y)-${CUT.toFixed(1)});
      e+=(shell*1.2+inside*.4)*edge*kept*dt/22.;
      heat+=(shell*1.2+inside*.4*burned)*edge*kept*dt/22.;
    }
  }
  float fire=e*uFade;
  float core=clamp(heat*uFade/max(fire,1e-4),0.,1.);
  gl_FragColor=finish(fire*1.25,core);
}`;

const OUTER_FRAG = SHARED_GLSL + `
uniform float uJet;
uniform float uHaze;
uniform float uIgnite;
uniform float uBoom;
float fan(vec2 vb,float zg,float face,float a0,float a1,bool xFace,float reach){
  float sum=0.;
  float h0=zg-6., h1=zg+reach*.9+6.;
  float dh=(h1-h0)/16.;
  for(int i=0;i<16;i++){
    float h=h0+(float(i)+hash12(gl_FragCoord.xy+float(i)*3.1))*dh;
    vec3 p=onFloor(vb,h);
    float s=xFace?p.x-face:p.y-face;
    float along=xFace?p.y:p.x;
    if(s<-1.)continue;
    float rise=s*s/(reach*2.2);
    float th=.8+uLift*.35+s*.32;
    float n=noise3(vec3(p.xy*.11,h*.08)-vec3(0.,0.,uTime*3.));
    float d=exp(-s/(reach*.45))*smoothstep(-.5,1.5,s)*window(along,a0,a1,3.)*exp(-pow((h-zg-rise)/th,2.))*(.5+.9*n);
    sum+=d*dh/th;
  }
  return sum;
}
float gapFlame(vec2 vb,out float gc){
  float px=pixelOf()/uCam.w;
  float g=0.;gc=0.;
  for(int f=0;f<2;f++){
    vec3 q=f==0?onWallY(vb,${CUT.toFixed(1)}):onWallX(vb,${CUT.toFixed(1)});
    float along=f==0?q.x:q.y;
    float s=(along-${(FLANGE.x + FLANGE.w - FW).toFixed(1)}+(f==0?0.:${((FLANGE.x + FLANGE.w) - (FLANGE.y + FLANGE.d)).toFixed(1)}))/${FW.toFixed(1)};
    float inGap=window(s,0.,1.,.7*px/${FW.toFixed(1)})*window(q.z,${FLANGE_TOP.toFixed(1)},${FLANGE_TOP.toFixed(1)}+uLift,.7*px);
    float front=clamp((uAge-.1)/.28,0.,1.25);
    float sq=mix(uQuench,1.3,uThrough);
    float reach=1.-smoothstep(front-.08,front,s);
    float alive=1.-smoothstep(sq-.12,sq,s);
    float flick=.8+.4*noise2(vec2(s*9.-uTime*14.,q.z*.6+float(f)*7.));
    float hot=reach*alive*flick*(1.-.45*s*(1.-uThrough));
    float cool=reach*(1.-alive)*.28*exp(-(s-sq)*2.5);
    g+=inGap*(hot*1.5+cool);
    gc+=inGap*hot;
  }
  return g;
}
void main(){
  vec2 vb=viewOf(gl_FragCoord.xy);
  float gc;float gf=gapFlame(vb,gc)*uFade;gc*=uFade;
  float zg=${FLANGE_TOP.toFixed(1)}+uLift*.5;
  float reach=mix(9.,34.,uThrough);
  float j=(uJet+uHaze<.002)?0.:fan(vb,zg,${(FLANGE.x + FLANGE.w).toFixed(1)},${FLANGE.y.toFixed(1)},${CUT.toFixed(1)},true,reach)
         +fan(vb,zg,${(FLANGE.y + FLANGE.d).toFixed(1)},${FLANGE.x.toFixed(1)},${CUT.toFixed(1)},false,reach);
  float jet=j*uJet*uThrough*.9;
  float haze=j*uHaze*(1.-uThrough)*.35;
  // the outside atmosphere lighting up around the box
  vec2 c=project(vec3(0.,0.,zg));
  float d=length(vb-c)/uK;
  float gr=26.+22.*uIgnite;float glow=exp(-pow(d/gr,2.))*(1.-smoothstep(gr*1.6,gr*2.2,d))*uIgnite*uThrough*.3;
  // the box failed: the atmosphere outside goes up
  float boom=0., boomHot=0.;
  if(uBoom>0.){
    float c=uBoom;
    vec3 C=vec3(0.,0.,62.+26.*c);
    float d=length(vb-project(C))/uK;
    float R=20.+66.*(1.-exp(-c/.2));
    float n=fbm3(vec3((vb-project(C))/uK*.045,c*1.6));
    float shell=exp(-pow((d-R*(.84+.28*n))/(7.+R*.13),2.));
    float core=(1.-smoothstep(R*.35,R*(.8+.25*n),d))*(.5+.7*n);
    float life=smoothstep(0.,.05,c)*exp(-c/.6);
    vec3 fp=onFloor(vb,0.);
    float Rs=30.+420.*c;
    float ring=exp(-pow((length(fp.xy)-Rs)/6.,2.))*exp(-c/.32)*.7;
    float ef=smoothstep(0.,80.,min(min(vb.x,uView.x-vb.x),min(vb.y,uView.y-vb.y)));
    boom=(shell*1.4+core*1.1)*life*ef+ring*ef;
    boomHot=core*life*ef*exp(-c/.4)*1.4+ring*ef*.6;
  }
  float fire=jet+glow+gf*1.25+boom;
  vec4 hot=finish(fire,clamp((jet*.9+gc*1.5+boomHot+boom*.35)/max(fire,1e-4),0.,1.));
  // cooled exhaust: grey haze
  float ha=(1.-exp(-haze*1.6))*mix(.55,.45,uLight);
  vec4 smoke=vec4(mix(vec3(.62,.58,.55),vec3(.35,.33,.32),uLight)*ha,ha);
  gl_FragColor=hot+smoke*(1.-hot.a);
}`;

const LIVE = `
const D = __DATA__;
const { P, GASES, VIS, GAP_MAX, FLANGE_TOP, TIP, DIAL_R, DIAL_TOP } = D;
const stage = document.querySelector(".fx-stage");
const q = (n) => stage.querySelector('[data-part="' + n + '"]');
const lidG = q("lid"), plungerG = q("plunger"), needle = q("needle"), shB = q("shanks-back"), shF = q("shanks-front"), jetsSvg = q("jets-svg");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const LIGHT = document.body.dataset.theme === "light" ? 1 : 0;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const needleAt = ${needleAt.toString()};
const depth2 = ([x, y]) => depthOf([x, y, 0], P);
const sortB = (list) => [...list].sort((a, b) => depth2(a) - depth2(b));
const backB = sortB(D.back), frontB = sortB(D.front);
const view = [D.W, D.H];
const inner = glLayer({ canvas: stage.querySelector(".fx-inner"), fragment: ${JSON.stringify(INNER_FRAG)}, view, camera: D.camera, uniforms: ["uAge", "uLift", "uThrough", "uQuench", "uFade"], fixed: { uLight: LIGHT } });
const outer = glLayer({ canvas: stage.querySelector(".fx-outer"), fragment: ${JSON.stringify(OUTER_FRAG)}, view, camera: D.camera, uniforms: ["uAge", "uLift", "uThrough", "uQuench", "uFade", "uJet", "uHaze", "uIgnite", "uBoom"], fixed: { uLight: LIGHT } });
const GL = !!(inner && outer);
if (GL) stage.setAttribute("data-gl", "");

let gas = D.start.gas, gap = D.start.gap, target = gap;
let drag = null, sliding = false;
let frame = 0, last = 0, clock = 0, touring = true, visible = false, slow = false, auto = false, lastShot = null;
let bang = -10, now = 0, through = false, quench = 0.5, boomAt = null;
const PERIOD = 3.2;
const CYCLE = 12.8;

const shanks = (list, lift) => lift < 0.05 ? "" : list.map(([x, y]) => solidSvg(cylinder(x, y, 2.1, FLANGE_TOP, lift, P, 16), { tone: "lo", crease: "none" })).join("");
// SVG fallback jets when WebGL is missing
const hash = (i) => { const s = Math.sin(i * 127.1) * 43758.5453; return s - Math.floor(s); };
function svgJets(lift, env) {
  if (env < 0.02 || lift < 0.05) return "";
  const { x, y, w, d } = D.FLANGE, out = [], z = FLANGE_TOP + lift / 2, reach = (through ? 28 : 4) * env;
  const pts = [];
  for (let t = y + 4; t <= D.CUT - 2; t += 6) pts.push({ p: [x + w, t], n: [1, 0] });
  for (let t = x + 4; t <= D.CUT - 2; t += 6) pts.push({ p: [t, y + d], n: [0, 1] });
  pts.forEach((e, i) => { const len = reach * (0.6 + 0.6 * hash(i)); const seg = []; for (let s = 0; s <= 6; s++) { const u = s / 6; seg.push(iso([e.p[0] + e.n[0] * len * u, e.p[1] + e.n[1] * len * u, z + len * 0.5 * u * u], P)); } out.push(pathOf(seg)); });
  return lineSvg(out.join(""), { tone: through ? "lit" : "lo", free: "end" });
}

function frameAt() {
  const age = now - bang;
  const calm = still.matches;
  const fade = calm ? 0 : burst(age, 0.02, 0.9);
  const jet = calm ? 0 : burst(age - 0.36, 0.06, 0.55);
  const haze = calm ? 0 : burst(age - 0.36, 0.12, 0.9);
  const ignite = calm ? 0 : burst(age - 0.42, 0.15, 0.7);
  return { age, fade, jet, haze, ignite };
}
const BOOM_END = 4.2;
const booming = () => boomAt !== null && now - boomAt < BOOM_END;
const standG = q("stand"), flash = stage.querySelector(".fx-flash");
const bottleGs = [...stage.querySelectorAll("[data-bottle]")];
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// a part that tips over onto the bench: overshoots, bounces, settles
const tip = (c, delay, target) => { const u = Math.max(0, c - delay); return u <= 0 ? 0 : target * (1 - Math.exp(-u / 0.11) * Math.cos(u * 13)); };
function chaos() {
  if (boomAt === null) return { c: -1, back: 0 };
  const c = now - boomAt;
  if (c < 0 || c > BOOM_END) return { c: -1, back: 0 };
  return { c, back: 1 - sm(3.0, 3.9, c) };
}
function draw() {
  const lift = gap * VIS;
  const t = translateAlong(P, [0, 0, lift]);
  const K = chaos();
  let lidT = t;
  if (K.c >= 0) {
    const c = K.c, land = 0.97, cl = Math.min(c, land);
    const dx = 165 * cl, dy = c < land ? -620 * c + 700 * c * c : 60;
    const rot = 540 * cl;
    const [px, py] = D.pivots.lid;
    lidT = "translate(" + (dx * K.back).toFixed(1) + " " + (dy * K.back).toFixed(1) + ") rotate(" + (rot * K.back).toFixed(1) + " " + px.toFixed(1) + " " + py.toFixed(1) + ") " + t;
    bottleGs.forEach((g) => {
      const pv = D.pivots.bottles[g.dataset.bottle];
      const a = tip(c, 0.05 + 0.06 * pv.order, -86) * K.back;
      const slide = -18 * sm(0.05 + 0.06 * pv.order, 0.6, c) * K.back;
      g.setAttribute("transform", "translate(" + slide.toFixed(1) + " " + (-slide * 0.3).toFixed(1) + ") rotate(" + a.toFixed(1) + " " + pv.at[0].toFixed(1) + " " + pv.at[1].toFixed(1) + ")");
    });
    const sa = tip(c, 0.08, 80) * K.back;
    standG.setAttribute("transform", "rotate(" + sa.toFixed(1) + " " + D.pivots.stand[0].toFixed(1) + " " + D.pivots.stand[1].toFixed(1) + ")");
    const A = 7 * Math.exp(-c / 0.35);
    stage.style.transform = "translate(" + (A * Math.sin(c * 90)).toFixed(1) + "px," + (A * Math.cos(c * 71)).toFixed(1) + "px)";
    flash.style.opacity = (0.8 * burst(c, 0.03, 0.22)).toFixed(3);
  } else if (boomAt !== null && now - boomAt > BOOM_END) {
    boomAt = null;
    bottleGs.forEach((g) => g.removeAttribute("transform"));
    standG.removeAttribute("transform");
    stage.style.transform = "";
    flash.style.opacity = "0";
    ui.shot.textContent = "Reset. Close the gap under MESG and try again.";
  }
  lidG.setAttribute("transform", lidT);
  plungerG.setAttribute("transform", lidT);
  needle.setAttribute("d", needleAt(K.c >= 0 && K.c < 3.0 ? 0 : gap));
  const sheared = K.c >= 0 && K.c < 3.4;
  shB.innerHTML = sheared ? "" : shanks(backB, lift);
  shF.innerHTML = sheared ? "" : shanks(frontB, lift);
  const f = frameAt();
  const active = f.fade > 0.002 || f.haze > 0.002 || K.c >= 0;
  if (GL) {
    const u = { uAge: Math.max(0, f.age), uLift: lift, uThrough: through ? 1 : 0, uQuench: quench, uFade: f.fade, uJet: f.jet, uHaze: f.haze, uIgnite: f.ignite, uBoom: K.c };
    if (active) { inner.draw(u, now); outer.draw(u, now); } else { inner.clear(); outer.clear(); }
  } else jetsSvg.innerHTML = svgJets(lift, f.jet);
  stage.querySelectorAll("[data-bottle]").forEach((g) => g.querySelectorAll(".iso-solid").forEach((s) => s.toggleAttribute("data-lit", g.dataset.bottle === GASES[gas].id)));
  stage.querySelectorAll("[data-tag] text").forEach((tx) => tx.setAttribute("data-tone", tx.parentNode.dataset.tag === GASES[gas].id ? "hi" : +tx.getAttribute("font-size") > 3.5 ? "mid" : "lo"));
  const g = GASES[gas];
  const text = K.c >= 0 ? (K.c < 3.0 ? "BOOM · the box failed and lit the area" : "resetting…") : g.id + " MESG " + g.mesg.toFixed(2) + " · gap " + gap.toFixed(2) + " mm · " + (gap < g.mesg ? "quenched" : "flame through");
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuenow", gap.toFixed(2));
  stage.setAttribute("aria-valuetext", text);
}
const ui = {
  gap: document.querySelector("#gap"), gapOut: document.querySelector("#gap-out"), mark: document.querySelector("#mesg-mark"),
  gas: [...document.querySelectorAll("[data-gas]")], fire: document.querySelector("#fire"), slow: document.querySelector("#slow"),
  auto: document.querySelector("#auto"), tour: document.querySelector("#tour"), shot: document.querySelector("#shot"),
};
const mesgMark = q("mesg-mark");
function syncUi() {
  const g = GASES[gas];
  ui.gas.forEach((b, i) => b.setAttribute("aria-pressed", String(i === gas)));
  ui.mark.style.left = (g.mesg / GAP_MAX * 100) + "%";
  ui.mark.dataset.label = "MESG " + g.mesg.toFixed(2);
  if (!sliding) ui.gap.value = target.toFixed(2);
  ui.gapOut.textContent = target.toFixed(2) + " mm";
  ui.slow.setAttribute("aria-pressed", String(slow));
  ui.auto.setAttribute("aria-pressed", String(auto));
  ui.tour.setAttribute("aria-pressed", String(touring));
  const a = g.mesg * Math.PI * 2, [x, y] = TIP;
  mesgMark.setAttribute("d", lineOnTop([x + Math.sin(a) * (DIAL_R - 6.5), y - Math.cos(a) * (DIAL_R - 6.5)], [x + Math.sin(a) * (DIAL_R - 2.2), y - Math.cos(a) * (DIAL_R - 2.2)], DIAL_TOP + 0.2, P));
}
function fire() {
  if (booming()) return;
  bang = now;
  const m = GASES[gas].mesg;
  through = gap >= m;
  // illustrative: how far along the 25 mm joint the flame survives before heat loss to the walls wins
  quench = clamp(0.92 * Math.pow(gap / m, 2), 0.04, 0.92);
  const text = gap < 0.02
    ? "Shot: " + GASES[gas].id + " with the gap shut. The box held the pressure; nothing got out."
    : through
    ? "Shot: " + GASES[gas].id + " at " + gap.toFixed(2) + " mm, over MESG " + GASES[gas].mesg.toFixed(2) + ". Flame ran the full 25 mm, lit the area, and that's the plant gone."
    : "Shot: " + GASES[gas].id + " at " + gap.toFixed(2) + " mm. Quenched about " + Math.round(quench * 25) + " mm into the 25 mm joint; only cooled gas got out.";
  ui.shot.textContent = text;
  if (through && gap >= 0.02) boomAt = now + 0.42;
}
function tick(t) {
  const dt = last ? Math.min((t - last) / 1000, 1 / 30) : 1 / 60;
  last = t;
  now += dt * (slow ? 0.12 : 1);
  if (touring) {
    clock += dt;
    gas = Math.floor(clock / CYCLE) % GASES.length;
    const u = (clock % CYCLE) / CYCLE;
    target = clamp([0.45, 0.8, 1.15, 1.6][Math.floor(u * 4)] * GASES[gas].mesg, 0.05, GAP_MAX);
  }
  gap = still.matches ? target : gap + (target - gap) * (1 - Math.exp(-dt / 0.2));
  if (Math.abs(target - gap) < 0.0005) gap = target;
  const period = PERIOD * (slow ? 1 / 0.12 : 1);
  if (!still.matches && (touring || auto) && now - bang > PERIOD * (slow ? 1.2 : 1) && !booming() && (boomAt === null) && Math.abs(target - gap) < 0.01) fire();
  draw();
  syncUi();
  const busy = touring || auto || gap !== target || now - bang < 3.5 || boomAt !== null || (drag && drag.moved);
  frame = visible && busy ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const takeOver = () => { touring = false; };
const setGap = (v) => { takeOver(); target = clamp(Math.round(v * 100) / 100, 0, GAP_MAX); run(); };
const setGas = (i) => { takeOver(); gas = (i + GASES.length) % GASES.length; bang = now - 10; run(); };
const shoot = () => { takeOver(); gap = target; fire(); run(); };
new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
if (still.matches) touring = false;

// controls
ui.gap.addEventListener("input", () => { sliding = true; setGap(+ui.gap.value); });
ui.gap.addEventListener("change", () => { sliding = false; run(); });
ui.gas.forEach((b, i) => b.addEventListener("click", () => setGas(i)));
ui.fire.addEventListener("click", shoot);
ui.slow.addEventListener("click", () => { slow = !slow; run(); });
ui.auto.addEventListener("click", () => { takeOver(); auto = !auto; run(); });
ui.tour.addEventListener("click", () => { touring = !touring; if (touring) { auto = false; clock = gas * CYCLE; } run(); });

// on the figure: drag up/down to open the gap, tap to fire, tap a bottle to pick a gas
stage.addEventListener("pointerdown", (ev) => { drag = { y: ev.clientY, x: ev.clientX, from: target, moved: false, id: ev.pointerId }; stage.setPointerCapture(ev.pointerId); });
stage.addEventListener("pointermove", (ev) => {
  if (!drag) return;
  const dy = drag.y - ev.clientY;
  if (!drag.moved && Math.hypot(dy, ev.clientX - drag.x) < 5) return;
  drag.moved = true;
  setGap(drag.from + dy / (stage.getBoundingClientRect().height * 0.4) * GAP_MAX);
});
stage.addEventListener("pointerup", (ev) => {
  if (!drag) return;
  const was = drag; drag = null;
  if (was.moved) return;
  const hit = document.elementsFromPoint(ev.clientX, ev.clientY).map((e) => e.closest && e.closest("[data-bottle],[data-tag]")).find(Boolean);
  if (hit) setGas(GASES.findIndex((g) => g.id === (hit.dataset.bottle || hit.dataset.tag)));
  else shoot();
});
stage.addEventListener("pointercancel", () => { drag = null; });
stage.addEventListener("keydown", (ev) => {
  if (ev.key === "ArrowRight" || ev.key === "ArrowUp") { ev.preventDefault(); setGap(target + 0.01 * (ev.shiftKey ? 10 : 1)); }
  else if (ev.key === "ArrowLeft" || ev.key === "ArrowDown") { ev.preventDefault(); setGap(target - 0.01 * (ev.shiftKey ? 10 : 1)); }
  else if (ev.key === "g" || ev.key === "G") { ev.preventDefault(); setGas(gas + 1); }
  else if (ev.key === " " || ev.key === "Enter" || ev.key === "f") { ev.preventDefault(); shoot(); }
  else if (ev.key === "s") { slow = !slow; run(); }
});
window.__fig = { freeze: () => { visible = false; cancelAnimationFrame(frame); frame = 0; }, pose: (g, v, age) => { touring = false; visible = false; cancelAnimationFrame(frame); frame = 0; gas = g; gap = target = v; fire(); bang = now - age; draw(); syncUi(); } };
syncUi();
draw();
`;

const CSS = `.fx-stage{position:relative}.fx-layer{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}.fx-gl{display:block}
body[data-theme="dark"] .fx-gl{mix-blend-mode:screen}
.fx-flash{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(circle at 50% 45%,#fff8e8 0%,#ffd9a0 35%,rgba(255,170,90,0) 75%)}
.iso-plate{overflow:hidden}
.fx-stage{cursor:ns-resize;touch-action:none}
.ctl{display:grid;gap:12px;margin:14px 0 6px;font-family:var(--anatomy-mono);font-size:12px;color:var(--anatomy-mid)}
.ctl-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ctl-label{min-width:44px;text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:var(--anatomy-lo)}
.ctl button{font:inherit;color:var(--anatomy-mid);background:transparent;border:1px solid var(--anatomy-lo);border-radius:6px;padding:7px 10px;cursor:pointer;line-height:1.15;text-align:left;min-height:36px}
.ctl button:hover{border-color:var(--anatomy-mid)}
.ctl button[aria-pressed="true"]{color:var(--anatomy-lit);border-color:var(--anatomy-lit)}
.ctl button small{display:block;font-size:10px;color:var(--anatomy-lo)}
.ctl #fire{border-color:var(--anatomy-lit);color:var(--anatomy-lit);padding:7px 18px;font-weight:600;letter-spacing:.06em}
.gap-wrap{position:relative;flex:1;min-width:110px;padding-top:16px}
.gap-wrap input{width:100%;accent-color:var(--anatomy-lit);margin:0}
#mesg-mark{position:absolute;top:0;bottom:2px;width:0;border-left:1px dashed var(--anatomy-lit);pointer-events:none;transition:left .3s}
#mesg-mark::after{content:attr(data-label);position:absolute;top:0;left:4px;font-size:10px;white-space:nowrap;color:var(--anatomy-lit)}
#gap-out{min-width:58px;text-align:right;color:var(--anatomy-hi, var(--anatomy-mid))}
#shot{min-height:2.6em;color:var(--anatomy-mid);font-size:12px;line-height:1.4}
@media (max-width:520px){.ctl button small{display:none}.ctl-label{min-width:34px}.ctl button{padding:7px 8px}}`;

const stageHtml = `<div class="iso-stage fx-stage" tabindex="0" role="slider" aria-label="Flamepath gap: drag or arrow keys change the gap, G changes gas, space fires" aria-valuemin="0" aria-valuemax="${GAP_MAX}" aria-valuenow="${START.gap}">${backSvg}<canvas class="fx-layer fx-gl fx-inner" aria-hidden="true"></canvas>${midSvg}<canvas class="fx-layer fx-gl fx-outer" aria-hidden="true"></canvas>${frontSvg}<div class="fx-flash" aria-hidden="true"></div></div>`;

const CONTROLS = `<div class="ctl" role="group" aria-label="Test controls">
  <div class="ctl-row"><span class="ctl-label">Gas</span>${GASES.map((g, i) => `<button type="button" data-gas="${i}" aria-pressed="${i === START.gas}">${g.id}<small>${g.group} · ${g.mesg.toFixed(2)}</small></button>`).join("")}</div>
  <div class="ctl-row"><span class="ctl-label">Gap</span><div class="gap-wrap"><span id="mesg-mark" aria-hidden="true"></span><input id="gap" type="range" min="0" max="${GAP_MAX}" step="0.01" value="${START.gap}" aria-label="Flamepath gap in mm"></div><output id="gap-out">${START.gap.toFixed(2)} mm</output></div>
  <div class="ctl-row"><span class="ctl-label">Run</span><button type="button" id="fire">FIRE</button><button type="button" id="slow" aria-pressed="false">Slow-mo</button><button type="button" id="auto" aria-pressed="false">Auto-fire</button><button type="button" id="tour" aria-pressed="true">Demo tour</button></div>
  <div id="shot" aria-live="polite">Pick a gas, set the gap, hit FIRE. Or drag the box up and down and tap it to fire.</div>
</div>`;
const card = k.plateHtml({
  fig: "Fig 3",
  title: "Ex d flamepath, cutaway",
  hint: "Drag: gap · tap: fire",
  readout: `C3H8 MESG 0.92 · gap ${START.gap.toFixed(2)} mm · quenched`,
  keys: [
    { mark: "lit", label: "Selected reference gas, plunger and needle" },
    { mark: "raised", label: "Flange and lid, sectioned at the cut: the 25 mm flamepath" },
  ],
  caption:
    "The spark plug fires the gas inside. The flame front runs into the joint (watch the sectioned gap at the cut). Below the gas's MESG the walls pull heat out faster than the flame makes it, so it dies inside the 25 mm and only cooled gas leaves; at or above MESG it survives the full length and lights the outside. MESG (g0), IEC 60079-20-1 reference gases: methane 1.14, propane 0.92, ethylene 0.65, hydrogen 0.29 mm. Real Ex d joints are certified well below these to the IEC 60079-1 tables. How far the flame gets along the joint is illustrative; the gap is drawn heavily enlarged.",
  body: stageHtml,
});

const other = theme === "light" ? ["index.html", "Dark version"] : ["light.html", "Light version"];
const FOOT = `<p style="font-family:var(--anatomy-mono);font-size:11px;color:var(--anatomy-lo);margin:28px 0 8px;line-height:1.6">A toy, not a certified anything. MESG values are the real reference-gas numbers; the rest is for fun.<br>Built with <a href="https://github.com/wheresryan22/anatomy" style="color:inherit">Anatomy</a> by Ryan (MIT). · <a href="${other[0]}" style="color:inherit">${other[1]}</a> · <a href="https://github.com/Dizzyfer/Anatomy" style="color:inherit">Source</a></p>`;
const name = theme === "light" ? "light.html" : "index.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "Ex d flamepath", theme, body: `<style>${CSS}</style>${card.replace("<figcaption", CONTROLS + "<figcaption")}${FOOT}`, script: kitScript() + glScript() + LIVE.replace("__DATA__", JSON.stringify(DATA)), width: 700 }));
console.log("wrote", name);
