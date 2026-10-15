// Metro on a viaduct — an isometric figure built with the `anatomy` kit.
// World units: 1 unit = 10 cm.  x runs along the track, y across it, z up.
// Deck top surface is z = 0.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "./kit/iso-kit.mjs";
import { kitScript } from "./scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";

const WIDTH = 1040;
const HEIGHT = 580;
const AZIMUTH = 58;
const ELEVATION = 26;

/* ---------------------------------------------------------------- levels */
const DECK = { x: -445, y: -42, w: 890, d: 84, r: 3 };
const DECK_H = 9;                         // deck slab, z -9 .. 0
const GIRDER_Y = [-28, 28];
const GIRDER_TOP = -9;
const GIRDER_BOT = -36;
const WATER_Z = -78;
const PIERS = [-270, -90, 90, 270];
const PIER_BOT = -92;

const SLEEPER_STEP = 30;
const SLEEPER_FROM = -435;
const SLEEPER_TO = 435;
const GAUGE = 7.2;                        // rail centre, 1.44 m gauge
const SLEEPER_TOP = 2.8;
const CHAIR_TOP = 3.8;
const RAIL_TOP = 7.0;

const PARAPET_Y = 36;                     // near parapet inner face
const PARAPET_H = 17;
const HANDRAIL_Z = 22;

const MASTS = [-500, -300, -100, 100, 300, 500];
const MAST_Y = -38;
const MAST_TOP = 81;
const ARM_Z = [74.5, 77];
const WIRE_Z = 72;

const HW = 14.5;                          // car half width
const CAR_LEN = 190;
const CAR_GAP = 16;
const CAR_X = [-(CAR_LEN + CAR_GAP), 0, CAR_LEN + CAR_GAP];
const NOSE = 24;
const TAPER = 0.2;
const RR = 3.5;
const UNDER_Z = [19.5, 21.5];
const BODY_Z = [21.5, 54];
const ROOF_Z = [54, 56.5];
const WIN_Z = [35, 48];
const DOORWIN_Z = [36, 46];
const WHEEL_R = 4.2;
const WHEEL_Z = RAIL_TOP + WHEEL_R;
const BOGIE_X = [-62, 62];
const BOGIE_Z = [11.4, 16.8];
const PAN_X = 55;                         // pantograph, middle car local x
const SPEED = 125;                        // world units per second (45 km/h)
const RUN = [-660, 660];

const P = k.fitProjection(
  [
    ...k.boxCorners({ x: -330, y: -42, w: 660, d: 84, r: 0 }, PIER_BOT, 0),
    [-330, MAST_Y, MAST_TOP], [330, MAST_Y, MAST_TOP],
    [-330, HW, BODY_Z[1]], [330, HW, BODY_Z[1]],
  ],
  WIDTH, HEIGHT, { pad: 0, azimuth: AZIMUTH, elevation: ELEVATION },
);

/* --------------------------------------------------------------- helpers */
const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const G = (children, extra) => k.groupSvg(Array.isArray(children) ? children.filter(Boolean) : children, extra);
const seg = (a, b) => k.segment(a, b, P);
const slab = (plan, z, h, steps = 6, bevel = 0) => k.slabOf(plan, z, h, P, steps, bevel);
const cyl = (x, y, r, z, h, steps = 24, bevel = 0) => k.cylinder(x, y, r, z, h, P, steps, bevel);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
const steps = (from, to, step) => {
  const out = [];
  for (let value = from; value <= to + 1e-6; value += step) out.push(Number(value.toFixed(3)));
  return out;
};
const rngOf = (seed) => {
  let s = (seed * 2654435761) % 2147483647;
  return () => ((s = (s * 48271) % 2147483647) / 2147483647);
};
const pick = (rng, list) => list[Math.floor(rng() * list.length) % list.length];

/* a disc standing in a plane of constant y (a wheel, a brake disc) */
function disc(x, y, z, r, { tone = "mid", shade = 1, bolts = 0, hub = 0, tread = 0 } = {}) {
  const out = [];
  const rim = k.sideRing([x, y, z], r, "y", P, 40);
  out.push(`<path class="iso-fill" d="${rim}"/>`);
  out.push(`<path class="iso-shade" data-shade="${shade}" d="${rim}"/>`);
  if (tread) out.push(L(k.sideRing([x, y, z], r * tread, "y", P, 32), { tone: "faint" }));
  if (hub) out.push(L(k.sideRing([x, y, z], r * hub, "y", P, 20), { tone: "lo" }));
  out.push(L(rim, { tone }));
  if (bolts) {
    const dots = [];
    for (let i = 0; i < bolts; i++) {
      const a = (i / bolts) * Math.PI * 2 + 0.3;
      dots.push(at([x + r * 0.52 * Math.cos(a), y, z + r * 0.52 * Math.sin(a)]));
    }
    out.push(D(dots, { size: 0.42, tone: "mid" }));
  }
  return out.join("");
}

/* the plan outline of a car body: straight sides with a parabolic nose taper */
function carRing(x0, x1, hw, { nose = 0, tail = 0, taper = TAPER, rr = RR } = {}) {
  const half = (x) => {
    let f = 1;
    if (nose > 0 && x > x1 - nose) { const u = (x - (x1 - nose)) / nose; f = Math.min(f, 1 - taper * u * u); }
    if (tail > 0 && x < x0 + tail) { const u = (x0 + tail - x) / tail; f = Math.min(f, 1 - taper * u * u); }
    return hw * f;
  };
  const a = x0 + rr;
  const b = x1 - rr;
  const marks = [a, b, Math.min(b, Math.max(a, x1 - nose)), Math.min(b, Math.max(a, x0 + tail))];
  if (nose) for (let i = 1; i <= 9; i++) marks.push(Math.min(b, x1 - nose + (nose * i) / 9));
  if (tail) for (let i = 1; i <= 9; i++) marks.push(Math.max(a, x0 + tail - (tail * i) / 9));
  const xs = [...new Set(marks.map((x) => Number(x.toFixed(3))))].filter((x) => x >= a - 1e-6 && x <= b + 1e-6).sort((p, q) => p - q);
  const cap = (xEnd, dir) => {
    const hwE = half(xEnd - dir * rr);
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const t = (Math.PI / 2) * (1 - i / 6);
      pts.push([xEnd - dir * rr + dir * rr * Math.cos(t), hwE - rr + rr * Math.sin(t)]);
    }
    for (let i = 0; i <= 6; i++) {
      const t = -(Math.PI / 2) * (i / 6);
      pts.push([xEnd - dir * rr + dir * rr * Math.cos(t), -(hwE - rr) + rr * Math.sin(t)]);
    }
    return pts;
  };
  return [
    ...xs.map((x) => [x, half(x)]),
    ...cap(x1, 1),
    ...[...xs].reverse().map((x) => [x, -half(x)]),
    ...cap(x0, -1).reverse(),
  ];
}
const capHalf = (x1, nose, hw, taper = TAPER, rr = RR) => {
  const u = (x1 - rr - (x1 - nose)) / nose;
  return hw * (1 - taper * u * u);
};

/* ============================================================ the river */
function water() {
  const out = [];
  const bank = (x) => -102 + 17 * Math.sin(x / 168 + 0.6) + 6.5 * Math.sin(x / 59 + 1.3);
  const far = steps(-900, 900, 26).map((x) => [x, bank(x)]);
  const ring = [...far, [900, 880], [-900, 880]];
  out.push(S(k.extrude(ring, WATER_Z - 2.4, 2.4, P, { convex: false }), { tone: "faint", crease: "none", className: "mt-water" }));
  // the wet line a little up the bank
  out.push(k.fadeLineSvg(steps(-900, 900, 26).map((x) => at([x, bank(x) + 7.5, WATER_Z])), { fade: [220, 220], tone: "faint" }));
  // the current runs across under the bridge, so the ripples do too
  const rip = [];
  for (const [i, x] of steps(-620, 620, 34).entries()) {
    const from = bank(x) + 16;
    const pts = steps(from, 430, 26).map((y) => at([x + Math.sin(y / 58 + i * 1.3) * 5.2 + Math.sin(y / 23 + i) * 1.6, y, WATER_Z]));
    rip.push(k.fadeLineSvg(pts, { fade: [64, 150], tone: "faint" }));
  }
  out.push(rip.join(""));
  return out.join("");
}

function waterline(px, plan) {
  const out = [];
  for (const grow of [-3.5, -8.5]) out.push(L(k.planOutline(k.insetPlan(plan, grow), WATER_Z, P, 6), { tone: "faint" }));
  // the pier's reflection, reaching toward the viewer and fading out
  for (const dx of [-9, -3, 3, 9]) {
    const pts = steps(18, 92, 9).map((y) => at([px + dx + Math.sin(y / 17 + dx) * 1.4, y, WATER_Z]));
    out.push(k.fadeLineSvg(pts, { fade: [10, 54], tone: "faint" }));
  }
  return out.join("");
}

/* ============================================================== a pier */
function pier(px) {
  const shaft = { x: px - 15, y: -17, w: 30, d: 34, r: 5 };
  const plinth = { x: px - 18, y: -20, w: 36, d: 40, r: 4 };
  const foot = { x: px - 26, y: -28, w: 52, d: 56, r: 3 };
  const flare = { x: px - 21, y: -21, w: 42, d: 42, r: 3 };
  const cap = { x: px - 26, y: -26, w: 52, d: 52, r: 3 };
  const below = [];
  const above = [];
  const CAP_TOP = -41;

  // under the water: footing and plinth, hidden by the river surface
  below.push(`<path class="iso-halo" d="${k.haloOf(foot, PIER_BOT, 8, P)}"/>`);
  below.push(S(slab(foot, PIER_BOT, 8, 6, 1), { tone: "lo" }));
  below.push(S(slab(plinth, PIER_BOT + 8, 10, 5, 0.8), { tone: "lo" }));
  below.push(S(slab(shaft, PIER_BOT + 18, 14, 6, 1), { tone: "lo" }));

  // above the water
  above.push(S(slab(shaft, WATER_Z, WATER_Z * -1 - 53, 6, 1.2), { tone: "lo", crease: "faint" }));
  // lift joints wrapping the visible corners
  for (const z of [-70, -61]) above.push(L(k.sideSeam(shaft, z, P, 6), { tone: "faint" }));
  // panel joints running the full face, edge to edge
  for (const x of [px - 7, px + 7]) above.push(L(seg([x, 17, WATER_Z], [x, 17, -53]), { tone: "faint" }));
  above.push(S(slab(shaft, -53, 5, 6, 0.8), { tone: "lo" }));
  above.push(S(slab(flare, -48, 4, 5, 1), { tone: "lo" }));
  above.push(S(slab(cap, -44, 3, 5, 1.2), { tone: "lo" }));
  above.push(L(k.planOutline(k.insetPlan(cap, 5), CAP_TOP, P, 5), { tone: "faint" }));
  // pier number plate with three rule lines
  const plate = { x: px - 7, y: 24, w: 14, d: 1, r: 0.3 };
  above.push(S(slab(plate, -64, 5, 2), { tone: "lo", crease: "none" }));
  for (const [i, w] of [9, 6, 7.5].entries())
    above.push(L(seg([px - 4.5, 25.2, -60.4 - i * 1.4], [px - 4.5 + w, 25.2, -60.4 - i * 1.4]), { tone: "faint", free: true }));
  // bearings under each girder
  for (const [bx, by] of byDepth([[px - 16, -28], [px + 16, -28], [px - 16, 28], [px + 16, 28]])) {
    above.push(S(slab({ x: bx - 5, y: by - 5, w: 10, d: 10, r: 1 }, CAP_TOP, 1.4, 3), { tone: "mid" }));
    above.push(S(cyl(bx, by, 3.6, CAP_TOP + 1.4, GIRDER_BOT - CAP_TOP - 1.4, 24, 0.4), { tone: "mid" }));
    above.push(L(k.sideArc(bx, by, 3.6, GIRDER_BOT - 1.2, P, 14), { tone: "faint" }));
    above.push(D([at([bx, by, GIRDER_BOT])], { size: 0.45 }));
  }
  // anchor bolts on the cap
  above.push(D(k.corners(cap, 7).map(([x, y]) => at([x, y, CAP_TOP])), { size: 0.5 }));
  above.push(L(k.corners(cap, 7).map(([x, y]) => k.ring(x, y, 2, CAP_TOP, P, 14)).join(""), { tone: "faint" }));
  return { below: below.join(""), above: above.join(""), waterline: waterline(px, shaft) };
}

/* ========================================================= under the deck */
function girders() {
  const out = [];
  for (const cy of GIRDER_Y) {
    const plan = { x: -450, y: cy - 3, w: 900, d: 6, r: 0.8 };
    out.push(S(slab(plan, GIRDER_BOT, GIRDER_TOP - GIRDER_BOT, 3, 0.6), { tone: "mid", crease: "lo" }));
    const face = cy + 3;
    // web stiffeners: full height of the face, so both ends land on an edge
    for (const x of steps(-444, 444, 24)) out.push(L(seg([x, face, GIRDER_BOT + 0.4], [x, face, GIRDER_TOP - 0.4]), { tone: "faint" }));
    // rivet rows along the flanges
    out.push(D(steps(-444, 444, 12).map((x) => at([x, face, GIRDER_TOP - 2.2])), { size: 0.4, tone: "lo" }));
    out.push(D(steps(-444, 444, 12).map((x) => at([x, face, GIRDER_BOT + 2.2])), { size: 0.4, tone: "lo" }));
    out.push(L(k.sideSeam(plan, GIRDER_TOP - 4, P, 3), { tone: "faint" }));
    out.push(L(k.sideSeam(plan, GIRDER_BOT + 4, P, 3), { tone: "faint" }));
  }
  // cross girders over each pier, reaching between the two plate girders
  for (const px of PIERS) {
    out.push(S(slab({ x: px - 3, y: -31, w: 6, d: 62, r: 0.8 }, -28, 15, 3, 0.5), { tone: "lo" }));
  }
  return out.join("");
}

/* ============================================================== the deck */
function deck() {
  const out = [];
  out.push(S(slab(DECK, -DECK_H, DECK_H, 4, 1.4), { tone: "mid", crease: "faint" }));
  // soffit shadow line and edge nosing, wrapping the visible corners
  out.push(L(k.sideSeam(DECK, -2.4, P, 4), { tone: "faint" }));
  // expansion joints over the piers: a plate and a line across the full width
  for (const px of PIERS.concat([-430, 430])) {
    if (Math.abs(px) > 440) continue;
    out.push(S(slab({ x: px - 2, y: -42, w: 4, d: 84, r: 0 }, 0, 0.5, 2), { tone: "lo", crease: "none" }));
    out.push(L(k.lineOnTop([px, -42], [px, 42], 0.5, P), { tone: "faint" }));
    out.push(D([at([px, -40, 0.5]), at([px, 40, 0.5]), at([px, 0, 0.5])], { size: 0.4, tone: "lo" }));
  }
  return out.join("");
}

function walkway(side) {
  const sign = side === "near" ? 1 : -1;
  const out = [];
  const plan = { x: -445, y: sign > 0 ? 24 : -36, w: 890, d: 12, r: 1 };
  out.push(S(slab(plan, 0, 1.4, 3, 0.4), { tone: "lo", crease: "faint" }));
  // tread lines, edge to edge across the walkway
  for (const x of steps(-438, 438, 16)) out.push(L(k.lineOnTop([x, plan.y], [x, plan.y + plan.d], 1.4, P), { tone: "faint" }));
  out.push(L(k.lineOnTop([-445, sign > 0 ? 24 : -24], [445, sign > 0 ? 24 : -24], 1.4, P), { tone: "lo" }));
  // cable trough with bolted lids
  const trough = { x: -445, y: sign > 0 ? 26.5 : -33.5, w: 890, d: 7, r: 0.8 };
  out.push(S(slab(trough, 1.4, 4.4, 3, 0.5), { tone: "lo" }));
  for (const x of steps(-432, 432, 54)) {
    out.push(L(k.lineOnTop([x, trough.y], [x, trough.y + trough.d], 5.8, P), { tone: "faint" }));
    out.push(D([at([x + 30, trough.y + 1.4, 5.8]), at([x + 30, trough.y + trough.d - 1.4, 5.8])], { size: 0.42, tone: "lo" }));
  }
  // scuppers along the edge
  for (const x of steps(-416, 416, 76)) {
    out.push(L(k.ring(x, sign > 0 ? 33 : -33, 1.6, 0, P, 14), { tone: "faint" }));
    out.push(D([at([x, sign > 0 ? 33 : -33, 0])], { size: 0.4, tone: "lo" }));
  }
  return out.join("");
}

function parapet(side) {
  const sign = side === "near" ? 1 : -1;
  const out = [];
  const plan = { x: -445, y: sign > 0 ? PARAPET_Y : -PARAPET_Y - 5, w: 890, d: 5, r: 1 };
  out.push(S(slab(plan, 0, PARAPET_H, 3, 0.9), { tone: sign > 0 ? "lo" : "lo", crease: "faint" }));
  out.push(L(k.sideSeam(plan, PARAPET_H - 2.6, P, 3), { tone: "faint" }));
  const face = sign > 0 ? plan.y + plan.d : plan.y;
  for (const x of steps(-432, 432, 54)) out.push(L(seg([x, face, 0.3], [x, face, PARAPET_H - 0.3]), { tone: "faint" }));
  if (sign < 0) {
    for (const x of steps(-432, 432, 54)) {
      out.push(S(slab({ x: x - 1, y: -PARAPET_Y - 7.4, w: 2, d: 2, r: 0.4 }, PARAPET_H, 4.2, 2), { tone: "lo", crease: "none" }));
      out.push(D([at([x, -PARAPET_Y - 6.4, PARAPET_H + 0.6])], { size: 0.38, tone: "lo" }));
    }
    out.push(S(slab({ x: -445, y: -PARAPET_Y - 7.2, w: 890, d: 1.6, r: 0.5 }, PARAPET_H + 2.8, 1.4, 2, 0.3), { tone: "lo", crease: "none" }));
  }
  if (sign > 0) {
    // drain downpipes, dropping from the deck edge to a hopper on the girder
    for (const px of PIERS) {
      out.push(S(cyl(px + 18, PARAPET_Y + 3.6, 1.3, GIRDER_BOT + 3, -GIRDER_BOT - 3, 14), { tone: "lo", crease: "none" }));
      out.push(L([-6, -16, -26].map((z) => k.sideArc(px + 18, PARAPET_Y + 3.6, 1.3, z, P, 10)).join(""), { tone: "faint" }));
      out.push(S(slab({ x: px + 15.4, y: PARAPET_Y + 1, w: 5.2, d: 5.2, r: 0.8 }, GIRDER_BOT + 3, 2.6, 3, 0.3), { tone: "lo" }));
    }
    // steel handrail on stanchions
    for (const x of steps(-432, 432, 54)) {
      out.push(S(slab({ x: x - 1, y: PARAPET_Y + 1.4, w: 2, d: 2, r: 0.4 }, PARAPET_H, HANDRAIL_Z - PARAPET_H, 2), { tone: "mid", crease: "none" }));
      out.push(D([at([x, PARAPET_Y + 2.4, PARAPET_H + 0.6])], { size: 0.4, tone: "lo" }));
    }
    out.push(S(slab({ x: -445, y: PARAPET_Y + 1.6, w: 890, d: 1.6, r: 0.5 }, HANDRAIL_Z - 1.6, 1.6, 2, 0.3), { tone: "mid", crease: "none" }));
  }
  return out.join("");
}

/* ============================================================== the track */
function track() {
  const out = [];
  for (const sx of steps(SLEEPER_FROM, SLEEPER_TO, SLEEPER_STEP)) {
    out.push(S(slab({ x: sx - 5.5, y: -17, w: 11, d: 34, r: 0.8 }, 0, SLEEPER_TOP, 3, 0.4), { tone: "lo", crease: "faint" }));
    for (const cy of [-GAUGE, GAUGE]) {
      out.push(S(slab({ x: sx - 5, y: cy - 4, w: 10, d: 8, r: 0.8 }, SLEEPER_TOP, CHAIR_TOP - SLEEPER_TOP, 3, 0.3), { tone: "mid", crease: "none" }));
      out.push(D([at([sx - 3.4, cy - 2.6, CHAIR_TOP]), at([sx + 3.4, cy - 2.6, CHAIR_TOP]), at([sx - 3.4, cy + 2.6, CHAIR_TOP]), at([sx + 3.4, cy + 2.6, CHAIR_TOP])], { size: 0.4, tone: "mid" }));
    }
  }
  for (const cy of [-GAUGE, GAUGE]) {
    out.push(S(slab({ x: -450, y: cy - 2.6, w: 900, d: 5.2, r: 0.5 }, CHAIR_TOP, 0.7, 2), { tone: "mid", crease: "none" }));
    out.push(S(slab({ x: -450, y: cy - 1.4, w: 900, d: 2.8, r: 0.4 }, CHAIR_TOP + 0.7, RAIL_TOP - CHAIR_TOP - 0.7, 2, 0.35), { tone: "mid", crease: "lo" }));
    // rail joints: a fishplate with bolts, every 180
    for (const jx of steps(-396, 396, 180)) {
      out.push(S(slab({ x: jx - 9, y: cy + 1.4, w: 18, d: 1, r: 0.3 }, CHAIR_TOP + 0.6, 1.8, 2), { tone: "mid", crease: "none" }));
      out.push(D([at([jx - 5, cy + 2.4, CHAIR_TOP + 1.5]), at([jx + 5, cy + 2.4, CHAIR_TOP + 1.5])], { size: 0.4, tone: "mid" }));
      out.push(L(k.lineOnTop([jx, cy - 1.4], [jx, cy + 1.4], RAIL_TOP, P), { tone: "faint" }));
    }
  }
  return out.join("");
}

/* ============================================= catenary masts and the wire */
function mast(mx) {
  const out = [];
  const base = { x: mx - 7, y: MAST_Y - 7, w: 14, d: 14, r: 1.5 };
  out.push(`<path class="iso-halo" d="${k.haloOf(base, 0, 3, P)}" style="filter:blur(4px)"/>`);
  out.push(S(slab(base, 0, 3, 3, 0.5), { tone: "lo" }));
  out.push(D(k.corners(base, 3).map(([x, y]) => at([x, y, 3])), { size: 0.5 }));
  out.push(L(k.corners(base, 3).map(([x, y]) => k.ring(x, y, 1.8, 3, P, 12)).join(""), { tone: "faint" }));
  out.push(S(cyl(mx, MAST_Y, 3.4, 3, 37, 22, 0.5), { tone: "mid", crease: "faint" }));
  for (const z of [14, 26]) out.push(L(k.sideArc(mx, MAST_Y, 3.4, z, P, 14), { tone: "faint" }));
  out.push(S(cyl(mx, MAST_Y, 4.2, 39, 2.4, 22, 0.4), { tone: "mid" }));
  out.push(D([at([mx - 3, MAST_Y + 3.1, 40.2]), at([mx + 3, MAST_Y + 3.1, 40.2])], { size: 0.42, tone: "mid" }));
  out.push(S(cyl(mx, MAST_Y, 2.6, 41.4, MAST_TOP - 41.4, 20, 0.4), { tone: "mid", crease: "faint" }));
  for (const z of [52, 64]) out.push(L(k.sideArc(mx, MAST_Y, 2.6, z, P, 12), { tone: "faint" }));
  // mast number plate, bolted to the shaft
  const mp = { x: mx - 4.2, y: MAST_Y + 2.6, w: 8.4, d: 1, r: 0.3 };
  out.push(S(slab(mp, 27.4, 6.4, 2), { tone: "lo", crease: "none" }));
  for (const [i, w] of [5.6, 3.6, 4.6].entries())
    out.push(L(seg([mx - 2.8, MAST_Y + 3.6, 32 - i * 1.5], [mx - 2.8 + w, MAST_Y + 3.6, 32 - i * 1.5]), { tone: "faint", free: true }));
  out.push(D([at([mx - 3.2, MAST_Y + 3.6, 33.4]), at([mx + 3.2, MAST_Y + 3.6, 28.2])], { size: 0.4, tone: "lo" }));
  // cantilever arm reaching over the track
  out.push(S(slab({ x: mx - 1.3, y: MAST_Y, w: 2.6, d: 39, r: 0.7 }, ARM_Z[0], ARM_Z[1] - ARM_Z[0], 2, 0.4), { tone: "mid", crease: "lo" }));
  out.push(D(steps(MAST_Y + 6, -4, 8).map((y) => at([mx, y + 1.3, ARM_Z[1]])), { size: 0.4, tone: "lo" }));
  // diagonal stay from the mast top down to the arm end
  out.push(k.wireSvg(at([mx, MAST_Y + 1, MAST_TOP - 1]), at([mx, -2, ARM_Z[1]]), { tone: "lo", size: 0.9 }));
  // insulator and registration arm carrying the contact wire
  out.push(S(cyl(mx, -1.5, 1.6, ARM_Z[0] - 1.6, 1.6, 14), { tone: "mid", crease: "none" }));
  for (const z of [ARM_Z[0] - 1.2, ARM_Z[0] - 0.7]) out.push(L(k.sideArc(mx, -1.5, 1.9, z, P, 10), { tone: "faint" }));
  out.push(S(slab({ x: mx - 0.9, y: -2.4, w: 1.8, d: 4, r: 0.4 }, WIRE_Z, ARM_Z[0] - 1.6 - WIRE_Z, 2), { tone: "mid", crease: "none" }));
  out.push(D([at([mx, -1.5, WIRE_Z])], { size: 0.5, tone: "hi" }));
  return out.join("");
}

function contactWire() {
  const out = [];
  const sag = (x) => {
    let near = MASTS[0];
    for (const m of MASTS) if (Math.abs(m - x) < Math.abs(near - x)) near = m;
    const span = 200;
    const t = Math.max(-1, Math.min(1, (x - near) / span));
    return -1.1 * (1 - t * t) * (Math.abs(x - near) < span ? 1 : 0);
  };
  const pts = steps(-560, 560, 14).map((x) => at([x, -1.5, WIRE_Z + sag(x)]));
  out.push(k.fadeLineSvg(pts, { fade: [210, 210], tone: "hi" }));
  // the messenger wire above it, carried on the same arms
  const mpts = steps(-560, 560, 14).map((x) => at([x, -1.5, WIRE_Z + 5.4 + sag(x) * 0.35]));
  out.push(k.fadeLineSvg(mpts, { fade: [210, 210], tone: "lo" }));
  for (const mx of MASTS) {
    for (const dx of [-66, 0, 66]) {
      const x = mx + dx;
      if (Math.abs(x) > 552) continue;
      out.push(k.wireSvg(at([x, -1.5, WIRE_Z + 5.4 + sag(x) * 0.35]), at([x, -1.5, WIRE_Z + sag(x)]), { tone: "lo", size: 0.7 }));
    }
  }
  return out.join("");
}

function signal() {
  const out = [];
  const sx = -196;
  const sy = -31;
  out.push(S(slab({ x: sx - 4, y: sy - 4, w: 8, d: 8, r: 1 }, 5.8, 2.4, 3, 0.4), { tone: "lo" }));
  out.push(D(k.corners({ x: sx - 4, y: sy - 4, w: 8, d: 8 }, 2).map(([x, y]) => at([x, y, 8.2])), { size: 0.45 }));
  out.push(S(cyl(sx, sy, 1.7, 8.2, 20, 16, 0.3), { tone: "mid", crease: "faint" }));
  out.push(L(k.sideArc(sx, sy, 1.7, 17, P, 10), { tone: "faint" }));
  const head = { x: sx - 3.2, y: sy - 3.4, w: 6.4, d: 6.8, r: 1.6 };
  out.push(S(slab(head, 28.2, 13, 4, 0.5), { tone: "mid", crease: "lo" }));
  for (const z of [31.6, 37.2]) {
    out.push(L(k.sideRing([sx, sy + 3.4, z], 2, "y", P, 16), { tone: "lo" }));
    out.push(L(k.sideRing([sx, sy + 3.4, z], 1.2, "y", P, 14), { tone: "faint" }));
  }
  out.push(D([at([sx, sy + 3.4, 31.6])], { size: 0.55, tone: "hi" }));
  out.push(S(slab({ x: sx - 3.6, y: sy - 4.2, w: 7.2, d: 2, r: 0.4 }, 41.2, 1.2, 2), { tone: "mid", crease: "none" }));
  out.push(k.wireSvg(at([sx, sy + 2, 8.2]), at([sx, -33.5, 5.8]), { via: [at([sx, sy - 1, 6.6])], tone: "lo", size: 0.8 }));
  return out.join("");
}

/* =============================================================== the train */
const WIN_Z2 = [31, 43];
const DWIN_Z = [31.5, 42.5];
const CARS = [
  { tail: NOSE, nose: 0, cab: false, doors: [[-36, -16], [44, 64]], wins: [[-68, -52], [-48, -40], [-10, 10], [18, 38], [70, 90]] },
  { tail: 0, nose: 0, cab: false, doors: [[-64, -44], [44, 64]], wins: [[-90, -70], [-38, -18], [-10, 10], [18, 38], [70, 90]] },
  { tail: 0, nose: NOSE, cab: true, doors: [[-64, -44], [16, 36]], wins: [[-90, -70], [-38, -18], [-10, 10], [40, 48], [52, 68]] },
];
const WINDOWS = [];      // {id, x, z, w, h, name} — x is the world x at trainX = 0

const t1 = (v) => Number(v.toFixed(2));
function rrect(x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  const [X, Y, W, H, R] = [t1(x), t1(y), t1(w), t1(h), t1(rad)];
  return `M${t1(X + R)} ${Y}H${t1(X + W - R)}A${R} ${R} 0 0 1 ${t1(X + W)} ${t1(Y + R)}V${t1(Y + H - R)}A${R} ${R} 0 0 1 ${t1(X + W - R)} ${t1(Y + H)}H${t1(X + R)}A${R} ${R} 0 0 1 ${X} ${t1(Y + H - R)}V${t1(Y + R)}A${R} ${R} 0 0 1 ${t1(X + R)} ${Y}Z`;
}
const vline = (u, z0, z1) => `M${t1(u)} ${t1(-z1)}V${t1(-z0)}`;
const hline = (u0, u1, z) => `M${t1(u0)} ${t1(-z)}H${t1(u1)}`;

/* what you see through one window, in the plane of the body side */
function cabin(a, b, z0, z1, seed, kind) {
  const rng = rngOf(seed);
  const w = b - a;
  const h = z1 - z0;
  const id = `mtw${seed}`;
  const out = [];
  out.push(`<clipPath id="${id}"><path d="${rrect(a, -z1, w, h, 1.6)}"/></clipPath>`);
  const inner = [];
  inner.push(`<path class="mt-cabin" d="${rrect(a - 1, -z1 - 1, w + 2, h + 2, 0)}"/>`);
  // the far side of the car: its glazing band, offset to read as depth
  inner.push(`<path class="mt-far" d="${rrect(a - 3.4, -z1 + 0.6, w, h * 0.74, 1.2)}"/>`);
  inner.push(`<path class="mt-glass" d="${rrect(a - 2.6, -z1 + 2.2, w - 1.6, h * 0.52, 1)}"/>`);
  // ceiling light strip and the cant rail inside
  inner.push(`<path class="mt-pole" d="${hline(a - 1, b + 1, z1 - 1.1)}"/>`);
  // seat backs rising past the sill
  const seats = kind === "door" ? 0 : Math.max(1, Math.round(w / 11));
  for (let i = 0; i < seats; i++) {
    const su = a + 1.4 + i * ((w - 2.8) / seats);
    const sw = (w - 2.8) / seats - 1.4;
    if (sw < 2) continue;
    inner.push(`<path class="mt-seat" d="${rrect(su, -(z0 + 2.6), sw, 4.2, 0.9)}"/>`);
  }
  // passengers
  const count = kind === "door" ? (rng() < 0.6 ? 2 : 1) : Math.max(1, Math.round(w / 7.5));
  for (let i = 0; i < count; i++) {
    const u = a + (w * (i + 0.5)) / count + (rng() - 0.5) * 2.2;
    const standing = kind === "door" ? true : rng() < 0.38;
    const headZ = standing ? 37.6 + rng() * 1.2 : 34.4 + rng() * 0.8;
    const shoulder = standing ? 35.6 : 32.6;
    const hr = 1.45;
    const bw = standing ? 4.2 : 4.8;
    inner.push(`<path class="mt-pax" d="${rrect(u - bw / 2, -shoulder, bw, shoulder - z0 + 2, 1.5)}"/>`);
    inner.push(`<circle class="mt-pax" cx="${t1(u + (standing ? 0.2 : -0.2))}" cy="${t1(-headZ)}" r="${hr}"/>`);
    if (standing && rng() < 0.6) inner.push(`<path class="mt-pole" d="M${t1(u + bw / 2 - 0.3)} ${t1(-shoulder - 0.4)}L${t1(u + bw / 2 + 1.1)} ${t1(-(z1 - 1.4))}"/>`);
  }
  // grab poles, floor to ceiling
  const poles = kind === "door" ? [a + w * 0.2, b - w * 0.2] : [a + w * (0.26 + rng() * 0.1), b - w * (0.2 + rng() * 0.14)];
  for (const u of poles) inner.push(`<path class="mt-pole" d="${vline(u, z0 - 1, z1 + 1)}"/>`);
  out.push(`<g clip-path="url(#${id})" class="mt-in" data-win-in="${seed}">${inner.join("")}</g>`);
  return out.join("");
}

function windowAt(a, b, z0, z1, id, name, worldX, kind) {
  WINDOWS.push({ id, x: worldX + (a + b) / 2, z: (z0 + z1) / 2, w: b - a, h: z1 - z0, name });
  const out = [];
  out.push(`<path class="mt-glass" d="${rrect(a, -z1, b - a, z1 - z0, 1.6)}"/>`);
  out.push(cabin(a, b, z0, z1, id, kind));
  // gasket, then the frame; the frame is what lights up when the window has focus
  out.push(`<path class="iso-line" data-tone="faint" d="${rrect(a + 0.7, -z1 + 0.7, b - a - 1.4, z1 - z0 - 1.4, 1.1)}"/>`);
  out.push(`<path class="iso-line" data-tone="lo" data-win-frame="${id}" d="${rrect(a, -z1, b - a, z1 - z0, 1.6)}"/>`);
  // two reflection streaks, both ends on the frame
  const w = b - a;
  const h = z1 - z0;
  out.push(`<g clip-path="url(#mtw${id})"><path class="iso-line" data-tone="faint" d="M${t1(a + w * 0.12)} ${t1(-z0)}L${t1(a + w * 0.42)} ${t1(-z1)}"/><path class="iso-line" data-tone="faint" d="M${t1(a + w * 0.26)} ${t1(-z0)}L${t1(a + w * 0.56)} ${t1(-z1)}"/></g>`);
  out.push(`<rect class="mt-hit" data-win="${id}" x="${t1(a)}" y="${t1(-z1)}" width="${t1(w)}" height="${t1(h)}"/>`);
  return out.join("");
}

function carFace(spec, index, worldX) {
  const out = [];
  const world = [];
  const x0 = -CAR_LEN / 2;
  const x1 = CAR_LEN / 2;
  let id = index * 100;
  // livery: a pinstripe band that wraps the whole body, nose included
  const ring = carRing(worldX + x0, worldX + x1, HW, { nose: spec.nose, tail: spec.tail });
  for (const [z, tone] of [[45.6, "lo"], [47.4, "faint"], [25, "lo"], [23.4, "faint"]])
    world.push(L(k.ringSeam(ring, z, P), { tone }));
  // side windows
  for (const [a, b] of spec.wins) out.push(windowAt(worldX + a, worldX + b, WIN_Z2[0], WIN_Z2[1], ++id, `car ${index + 1} window ${spec.wins.findIndex(([p]) => p === a) + 1}`, 0, "side"));
  // doors: two leaves, each with its own glass, a threshold and a header
  for (const [da, db] of spec.doors) {
    const A = worldX + da;
    const B = worldX + db;
    out.push(`<path class="iso-line" data-tone="lo" d="${rrect(A, -47.4, B - A, 47.4 - BODY_Z[0] - 0.6, 1.2)}"/>`);
    out.push(`<path class="iso-line" data-tone="faint" d="${vline((A + B) / 2, BODY_Z[0] + 0.6, 47.4)}"/>`);
    for (const leaf of [0, 1]) {
      const la = A + 2 + leaf * ((B - A) / 2);
      out.push(windowAt(la, la + (B - A) / 2 - 4, DWIN_Z[0], DWIN_Z[1], ++id, `car ${index + 1} door ${leaf ? 2 : 1}`, 0, "door"));
    }
    // door furniture: a button panel, a threshold line, a status lamp
    out.push(`<path class="iso-line" data-tone="faint" d="${rrect(A + 1.6, -30.2, 3.2, 3.2, 0.7)}"/>`);
    world.push(D([at([A + 3.2, HW, 28.6])], { size: 0.5, tone: "hi" }));
    out.push(`<path class="iso-line" data-tone="faint" d="${hline(A, B, BODY_Z[0] + 0.6)}"/>`);
    world.push(D([at([(A + B) / 2 - 2.4, HW, 48.6]), at([(A + B) / 2 + 2.4, HW, 48.6])], { size: 0.45, tone: "mid" }));
  }
  // vents and a louvre panel on the lower body, closed slots so they have no ends
  for (const [vi, vx] of steps(worldX + x0 + 16, worldX + x1 - 16, 46).entries()) {
    if (spec.doors.some(([a, b]) => vx > worldX + a - 6 && vx < worldX + b + 6)) continue;
    for (let s = 0; s < 3; s++) out.push(`<path class="iso-line" data-tone="faint" d="${rrect(vx, -(23.4 - s * 1.5), 9, 0.9, 0.4)}"/>`);
  }
  // every blank bay of body side gets the structure a real car has there
  const feats = [...spec.wins, ...spec.doors].map(([a, b]) => [worldX + a, worldX + b]).sort((p, q) => p[0] - q[0]);
  const bays = [];
  let cursor = worldX + x0 + 2;
  for (const [a, b] of feats) { if (a - cursor > 4) bays.push([cursor, a]); cursor = Math.max(cursor, b); }
  if (worldX + x1 - 2 - cursor > 4) bays.push([cursor, worldX + x1 - 2]);
  for (const [i, [a, b]] of bays.entries()) {
    const w = b - a;
    const c = (a + b) / 2;
    out.push(`<path class="iso-line" data-tone="faint" d="${vline(c, BODY_Z[0] + 0.6, 47.4)}"/>`);
    if (w >= 15) {
      for (let r = 0; r < 3; r++) out.push(`<path class="iso-line" data-tone="faint" d="${rrect(c - 5.4, -(29.6 - r * 1.6), 10.8, 1, 0.45)}"/>`);
      out.push(`<path class="iso-line" data-tone="faint" d="${rrect(c - 6.4, -22.9, 12.8, 1.4, 0.5)}"/>`);
      world.push(D([at([c - 6.4, HW, 22.2]), at([c + 6.4, HW, 22.2])], { size: 0.4, tone: "lo" }));
    } else if (w >= 8) {
      out.push(`<path class="iso-line" data-tone="faint" d="${rrect(c - 2.6, -29.4, 5.2, 3.2, 0.7)}"/>`);
    }
  }
  // grab handles at every door edge
  for (const [da, db] of spec.doors)
    for (const edge of [worldX + da - 2.4, worldX + db + 0.8])
      out.push(`<path class="iso-line" data-tone="faint" d="${rrect(edge, -36.2, 1.6, 8.4, 0.7)}"/>`);
  // one engraved label on the train: the lead car's fleet number
  return { face: out.join(""), world: world.join("") };
}

function bogie(bx) {
  const out = [];
  const AX = [bx - 11.5, bx + 11.5];
  // An inboard-frame bogie: the frame and bearings live between the wheels, so
  // the wheel itself is the outermost part and stays in view.
  for (const ax of AX) out.push(disc(ax, -GAUGE, WHEEL_Z, WHEEL_R, { shade: 0, hub: 0.3, tread: 0.86 }));
  for (const cy of [-4.6, 4.6]) {
    if (cy > 0) {
      // between the two side frames: axles, bearings, motor, brake discs
      for (const ax of AX) {
        out.push(S(slab({ x: ax - 1.2, y: -GAUGE, w: 2.4, d: GAUGE * 2, r: 1.2 }, WHEEL_Z - 1.2, 2.4, 3), { tone: "lo", crease: "none" }));
        out.push(disc(ax, 3.2, WHEEL_Z, 3.1, { shade: 2, hub: 0.34, tone: "lo" }));
      }
      out.push(S(slab({ x: bx - 8, y: -4.4, w: 16, d: 8.8, r: 2 }, 8.4, 7.4, 4, 0.5), { tone: "mid", crease: "faint" }));
      out.push(L(k.sideSeam({ x: bx - 8, y: -4.4, w: 16, d: 8.8, r: 2 }, 12.4, P, 4), { tone: "faint" }));
      out.push(S(slab({ x: bx - 2.6, y: -6, w: 5.2, d: 3.4, r: 1.2 }, 7.8, 5.4, 3), { tone: "lo", crease: "none" }));
      out.push(S(slab({ x: bx - 9, y: -4.6, w: 18, d: 9.2, r: 1.4 }, BOGIE_Z[1], 1.6, 3, 0.3), { tone: "mid", crease: "faint" }));
      out.push(S(cyl(bx, 0, 3, BOGIE_Z[1] + 1.6, 2.4, 20, 0.3), { tone: "mid" }));
      out.push(L(k.ring(bx, 0, 1.9, BOGIE_Z[1] + 4, P, 16), { tone: "faint" }));
      out.push(D([at([bx, 0, BOGIE_Z[1] + 4])], { size: 0.5, tone: "mid" }));
    }
    out.push(S(slab({ x: bx - 17, y: cy - 1.8, w: 34, d: 3.6, r: 1 }, BOGIE_Z[0], BOGIE_Z[1] - BOGIE_Z[0], 3, 0.4), { tone: "mid", crease: cy > 0 ? "lo" : "faint" }));
    if (cy > 0) {
      out.push(L(k.sideSeam({ x: bx - 17, y: cy - 1.8, w: 34, d: 3.6, r: 1 }, BOGIE_Z[0] + 1.4, P, 3), { tone: "faint" }));
      out.push(D(steps(bx - 14, bx + 14, 4.7).map((x) => at([x, cy + 1.8, BOGIE_Z[1]])), { size: 0.4, tone: "mid" }));
    }
    // bearing housing and its chevron springs, inboard of each wheel
    for (const ax of AX) {
      out.push(S(slab({ x: ax - 2.8, y: cy + (cy > 0 ? 1.8 : -5.4), w: 5.6, d: 3.6, r: 1 }, 9.2, 3.6, 3, 0.3), { tone: "lo", crease: "none" }));
      for (const [i, z] of [12.8, 14.1].entries())
        out.push(S(slab({ x: ax - 2.2, y: cy + (cy > 0 ? 2 : -5), w: 4.4, d: 3.2, r: 0.6 }, z, 1.2, 2), { tone: i ? "mid" : "lo", crease: "none" }));
    }
  }
  // brake cylinder and a hose up to the body, both on the near side of the frame
  out.push(S(cyl(bx + 8, 5.6, 1.9, 14, 3.4, 16, 0.3), { tone: "lo" }));
  out.push(k.wireSvg(at([bx + 8, 5.6, 17.4]), at([bx + 4, 10.6, UNDER_Z[0]]), { tone: "lo", size: 0.8 }));
  // sand pipe aimed at the railhead
  out.push(k.wireSvg(at([bx - 15, 5.2, 12.2]), at([bx - 16.4, GAUGE, RAIL_TOP + 0.6]), { tone: "lo", size: 0.7 }));
  // the near wheels last: nothing is drawn over them
  for (const ax of AX) out.push(disc(ax, GAUGE, WHEEL_Z, WHEEL_R, { shade: 1, hub: 0.3, tread: 0.86, bolts: 6 }));
  return out.join("");
}

function car(index) {
  const spec = CARS[index];
  const worldX = CAR_X[index];
  const x0 = worldX - CAR_LEN / 2;
  const x1 = worldX + CAR_LEN / 2;
  const ring = carRing(x0, x1, HW, { nose: spec.nose, tail: spec.tail });
  const roofRing = carRing(x0 + 1.4, x1 - 1.4, HW - 1.4, { nose: spec.nose, tail: spec.tail, rr: RR - 0.6 });
  const out = [];
  out.push(`<path class="iso-halo" d="${k.haloOf({ x: x0 + 4, y: -12, w: CAR_LEN - 8, d: 24, r: 6 }, RAIL_TOP, 0.1, P)}" style="filter:blur(6px)"/>`);
  for (const bx of BOGIE_X) out.push(bogie(worldX + bx));
  // underframe equipment between the bogies
  for (const ex of [-40, -12, 16]) {
    out.push(S(slab({ x: worldX + ex, y: -10.4, w: 24, d: 20.8, r: 1.6 }, 13.6, UNDER_Z[0] - 13.6, 4, 0.5), { tone: "lo", crease: "faint" }));
    out.push(L(k.sideSeam({ x: worldX + ex, y: -10.4, w: 24, d: 20.8, r: 1.6 }, 16.6, P, 4), { tone: "faint" }));
    for (let g = 0; g < 5; g++) out.push(L(seg([worldX + ex + 4 + g * 4, 10.4, 14.2], [worldX + ex + 4 + g * 4, 10.4, UNDER_Z[0] - 0.6]), { tone: "faint" }));
    out.push(D([at([worldX + ex + 2, 10.4, UNDER_Z[0] - 0.6]), at([worldX + ex + 22, 10.4, UNDER_Z[0] - 0.6])], { size: 0.42, tone: "lo" }));
  }
  const skirt = carRing(x0 + 2.2, x1 - 2.2, HW - 2, { nose: spec.nose, tail: spec.tail, rr: RR - 0.8 });
  out.push(S(k.extrude(skirt, UNDER_Z[0], UNDER_Z[1] - UNDER_Z[0], P, { convex: true, bevel: 0.5 }), { tone: "lo", crease: "faint" }));
  // the body
  out.push(S(k.extrude(ring, BODY_Z[0], BODY_Z[1] - BODY_Z[0], P, { convex: true, bevel: 0.9 }), { tone: "hi", crease: "lo" }));
  const side = carFace(spec, index, worldX);
  out.push(G(side.face, { transform: k.sideMatrix([0, HW], 0, P, "left") }));
  out.push(side.world);
  // the roof
  out.push(S(k.extrude(roofRing, BODY_Z[1], ROOF_Z[1] - BODY_Z[1], P, { convex: true, bevel: 0.6 }), { tone: "hi", crease: "lo" }));
  out.push(L(k.ringSeam(ring, BODY_Z[1] - 0.8, P), { tone: "faint" }));
  // roof walkway lines run the full roof and end on its outline
  for (const y of [-7, 7]) out.push(L(k.lineOnTop([x0 + 1.4, y], [x1 - 1.4, y], ROOF_Z[1], P), { tone: "faint" }));
  // air conditioning pack
  const ac = { x: worldX - 24, y: -9.4, w: 48, d: 18.8, r: 2 };
  out.push(S(slab(ac, ROOF_Z[1], 5, 4, 0.6), { tone: "mid", crease: "faint" }));
  out.push(L(k.planOutline(k.insetPlan(ac, 3), ROOF_Z[1] + 5, P, 4), { tone: "faint" }));
  out.push(D(k.dotGrid(ac.x + 6, ac.y + 5, 10, 4, 3.6, ROOF_Z[1] + 5, P), { size: 0.38, tone: "lo" }));
  for (let g = 0; g < 9; g++) out.push(L(seg([ac.x + 4 + g * 5, ac.y + ac.d, ROOF_Z[1] + 0.5], [ac.x + 4 + g * 5, ac.y + ac.d, ROOF_Z[1] + 4.5]), { tone: "faint" }));
  out.push(D(k.corners(ac, 3).map(([x, y]) => at([x, y, ROOF_Z[1] + 5])), { size: 0.45, tone: "mid" }));
  // cable ducts and roof hatches
  out.push(S(slab({ x: x0 + 10, y: -2.2, w: CAR_LEN - 20, d: 4.4, r: 1 }, ROOF_Z[1], 1.8, 3, 0.3), { tone: "lo", crease: "none" }));
  out.push(S(slab({ x: x0 + 14, y: 7.2, w: CAR_LEN - 28, d: 2.8, r: 0.8 }, ROOF_Z[1], 1.2, 3, 0.25), { tone: "lo", crease: "none" }));
  // a brake resistor grid: a long low box, finned on its visible face
  const grid = { x: worldX - 76, y: -8.6, w: 40, d: 17.2, r: 1.6 };
  out.push(S(slab(grid, ROOF_Z[1], 3.6, 4, 0.5), { tone: "mid", crease: "faint" }));
  for (let g = 0; g < 14; g++) out.push(L(seg([grid.x + 2.4 + g * 2.7, grid.y + grid.d, ROOF_Z[1] + 0.4], [grid.x + 2.4 + g * 2.7, grid.y + grid.d, ROOF_Z[1] + 3.2]), { tone: "faint" }));
  out.push(L(k.planOutline(k.insetPlan(grid, 2.4), ROOF_Z[1] + 3.6, P, 4), { tone: "faint" }));
  out.push(D(k.corners(grid, 2.6).map(([x, y]) => at([x, y, ROOF_Z[1] + 3.6])), { size: 0.42, tone: "mid" }));
  for (const hx of [worldX - 62, worldX + 62]) {
    out.push(S(slab({ x: hx - 7, y: -7, w: 14, d: 14, r: 1.6 }, ROOF_Z[1], 1, 3, 0.3), { tone: "mid", crease: "none" }));
    out.push(L(k.planOutline(k.insetPlan({ x: hx - 7, y: -7, w: 14, d: 14, r: 1.6 }, 2), ROOF_Z[1] + 1, P, 3), { tone: "faint" }));
    out.push(D([at([hx, -5, ROOF_Z[1] + 1])], { size: 0.45, tone: "mid" }));
  }
  if (spec.cab) {
    // antennas over the cab
    for (const [ax, r, h] of [[worldX + 74, 1, 5.4], [worldX + 82, 0.8, 3.6]]) {
      out.push(S(cyl(ax, 0, r + 0.8, ROOF_Z[1], 0.8, 14), { tone: "mid", crease: "none" }));
      out.push(S(cyl(ax, 0, r, ROOF_Z[1] + 0.8, h, 12), { tone: "mid", crease: "none" }));
      out.push(D([at([ax, 0, ROOF_Z[1] + 0.8 + h])], { size: 0.45, tone: "mid" }));
    }
    out.push(cab(worldX + CAR_LEN / 2, spec));
  }
  if (index === 1) {
    // lightning arrester beside the pantograph
    for (const [i, z] of [ROOF_Z[1], ROOF_Z[1] + 2.2, ROOF_Z[1] + 4.4].entries()) {
      out.push(S(cyl(worldX + PAN_X - 26, -9, i ? 1.5 : 2.2, z, 2.2, 16, 0.25), { tone: "mid", crease: "none" }));
    }
    out.push(D([at([worldX + PAN_X - 26, -9, ROOF_Z[1] + 6.6])], { size: 0.5, tone: "mid" }));
    out.push(pantograph(worldX + PAN_X));
  }
  return out.join("");
}

/* the cab front, drawn in the plane of the nose face */
function cab(noseX, spec) {
  const hwC = capHalf(noseX, spec.nose, HW);
  const flat = hwC - RR;
  const out = [];
  // coupler and anti-climber below the windscreen
  out.push(S(slab({ x: noseX - 1, y: -5.4, w: 8, d: 10.8, r: 1.8 }, 14.2, 5, 3, 0.5), { tone: "lo", crease: "faint" }));
  out.push(S(cyl(noseX + 7, 0, 2.6, 15.4, 2.6, 18, 0.3), { tone: "lo" }));
  out.push(D([at([noseX + 7, 0, 18])], { size: 0.5, tone: "mid" }));
  const face = [];
  const wsw = 12.8;
  const wsz = [35.2, 47];
  // windscreen with its interior: a cab desk and a driver
  const wid = 900;
  face.push(`<path class="mt-glass" d="${rrect(-wsw / 2, -wsz[1], wsw, wsz[1] - wsz[0], 2)}"/>`);
  face.push(`<clipPath id="mtw${wid}"><path d="${rrect(-wsw / 2, -wsz[1], wsw, wsz[1] - wsz[0], 2)}"/></clipPath>`);
  face.push(`<g clip-path="url(#mtw${wid})" class="mt-in" data-win-in="${wid}">`
    + `<path class="mt-cabin" d="${rrect(-wsw / 2 - 1, -wsz[1] - 1, wsw + 2, wsz[1] - wsz[0] + 2, 0)}"/>`
    + `<path class="mt-far" d="${rrect(-wsw / 2 + 1, -wsz[1] + 1.4, wsw - 2, 5.4, 1)}"/>`
    + `<path class="mt-seat" d="${rrect(-1.4, -39.8, 6.4, 5.6, 1.2)}"/>`
    + `<path class="mt-pax" d="${rrect(-0.2, -39.6, 4.2, 5.2, 1.4)}"/>`
    + `<circle class="mt-pax" cx="1.9" cy="-41" r="1.4"/>`
    + `<path class="mt-seat" d="${rrect(-wsw / 2 - 1, -36.4, wsw + 2, 2.6, 0.6)}"/>`
    + `<path class="mt-pole" d="${hline(-wsw / 2 - 1, wsw / 2 + 1, 36.6)}"/>`
    + `<path class="mt-pole" d="M-5.6 -37L-3.4 -39.2"/>`
    + `</g>`);
  face.push(`<path class="iso-line" data-tone="faint" d="${rrect(-wsw / 2 + 0.8, -wsz[1] + 0.8, wsw - 1.6, wsz[1] - wsz[0] - 1.6, 1.6)}"/>`);
  face.push(`<path class="iso-line" data-tone="lit" data-win-frame="${wid}" d="${rrect(-wsw / 2, -wsz[1], wsw, wsz[1] - wsz[0], 2)}"/>`);
  face.push(`<rect class="mt-hit" data-win="${wid}" x="${t1(-wsw / 2)}" y="${t1(-wsz[1])}" width="${wsw}" height="${t1(wsz[1] - wsz[0])}"/>`);
  WINDOWS.push({ id: wid, x: noseX - 1.2, z: (wsz[0] + wsz[1]) / 2, w: wsw, h: wsz[1] - wsz[0], name: "cab windscreen", nose: true });
  // destination display: text the machine shows, clipped to its window
  const dw = 11;
  const dz = [48.2, 51.4];
  face.push(`<path class="mt-disp" d="${rrect(-dw / 2, -dz[1], dw, dz[1] - dz[0], 0.6)}"/>`);
  face.push(`<clipPath id="mtdisp"><path d="${rrect(-dw / 2, -dz[1], dw, dz[1] - dz[0], 0.6)}"/></clipPath>`);
  face.push(`<path class="iso-line" data-tone="lo" d="${rrect(-dw / 2, -dz[1], dw, dz[1] - dz[0], 0.6)}"/>`);
  // lower front: a skirt panel, the coupler hatch, a horn grille and two steps
  face.push(`<path class="iso-line" data-tone="lo" d="${rrect(-flat, -30.2, flat * 2, 8, 1.4)}"/>`);
  face.push(`<path class="iso-line" data-tone="faint" d="${rrect(-3.6, -28.6, 7.2, 4.6, 0.8)}"/>`);
  face.push(`<path class="iso-line" data-tone="faint" d="${hline(-flat, flat, 30.6)}"/>`);
  for (let r = 0; r < 3; r++) face.push(`<path class="iso-line" data-tone="faint" d="${rrect(-flat + 1.2, -(28 - r * 1.5), 3.6, 0.8, 0.35)}"/>`);
  for (const sx2 of [-1, 1]) face.push(`<path class="iso-line" data-tone="faint" d="${rrect(sx2 * 4.6 - 1.6, -23.4, 3.2, 1.4, 0.4)}"/>`);
  // wiper
  face.push(`<path class="iso-line" data-tone="lo" d="M-3.2 -35.6L1.6 -42"/>`);
  face.push(`<path class="iso-line" data-tone="faint" d="M1.6 -42L2.4 -43.2"/>`);
  out.push(G(face, { transform: k.sideMatrix([noseX, 0], 0, P, "right") }));
  // headlights and tail lights, discs standing in the nose plane
  for (const dy of [-5.4, 5.4]) {
    const rimPath = k.sideRing([noseX, dy, 32.6], 1.9, "x", P, 22);
    out.push(`<path class="iso-fill" d="${rimPath}"/><path class="iso-shade" data-shade="3" d="${rimPath}"/>`);
    out.push(L(k.sideRing([noseX, dy, 32.6], 1.2, "x", P, 18), { tone: "faint" }));
    out.push(L(rimPath, { tone: "mid" }));
    out.push(D([at([noseX, dy, 32.6])], { size: 0.6, tone: "hi" }));
    const tail = k.sideRing([noseX, dy * 0.42, 32.6], 0.9, "x", P, 16);
    out.push(`<path class="iso-fill" d="${tail}"/><path class="iso-shade" data-shade="1" d="${tail}"/>`);
    out.push(L(tail, { tone: "lo" }));
  }
  return out.join("");
}

function pantograph(px) {
  const out = [];
  for (const [bx, by] of byDepth([[px - 15, -8], [px + 15, -8], [px - 15, 8], [px + 15, 8]])) {
    out.push(S(cyl(bx, by, 2.4, ROOF_Z[1], 4.6, 18, 0.3), { tone: "mid", crease: "none" }));
    for (const z of [ROOF_Z[1] + 1.4, ROOF_Z[1] + 2.6, ROOF_Z[1] + 3.8]) out.push(L(k.sideArc(bx, by, 2.9, z, P, 12), { tone: "faint" }));
  }
  const z0 = ROOF_Z[1] + 4.6;
  for (const by of [-8, 8]) out.push(S(slab({ x: px - 17, y: by - 1.2, w: 34, d: 2.4, r: 0.6 }, z0, 1.6, 2, 0.3), { tone: "mid", crease: "faint" }));
  out.push(S(slab({ x: px - 2, y: -8, w: 4, d: 16, r: 0.8 }, z0, 1.6, 2, 0.3), { tone: "mid", crease: "none" }));
  // single-arm frame: an A-shaped lower arm up to one knuckle, then the upper arm
  const foot = z0 + 1.6;
  const knee = [px + 2, 0, 67.8];
  const wrist = [px + 13, 0, WIRE_Z - 2.4];
  const tube = (a, b, tone) => L(k.pathOf([at(a), at(b)]) + k.pathOf([at([a[0], a[1], a[2] + 0.9]), at([b[0], b[1], b[2] + 0.9])]), { tone });
  for (const by of [-7, 7]) {
    out.push(tube([px - 14, by, foot], knee, "hi"));
    out.push(D([at([px - 14, by, foot])], { size: 0.8, tone: "mid" }));
  }
  out.push(tube([px - 8.5, -7, foot], [px - 1.5, -2.6, 64.4], "lo"));
  out.push(tube([px - 8.5, 7, foot], [px - 1.5, 2.6, 64.4], "lo"));
  out.push(tube(knee, wrist, "hi"));
  out.push(D([at(knee)], { size: 1.1, tone: "hi" }));
  // damper from the base frame to the lower arm
  out.push(k.wireSvg(at([px - 11, 8, foot]), at([px - 6, 7.2, 64]), { tone: "lo", size: 0.7 }));
  // collector head on its springs, bearing up against the wire
  out.push(S(slab({ x: wrist[0] - 3, y: -11, w: 6, d: 22, r: 1.2 }, wrist[2], 1.6, 3, 0.3), { tone: "hi", crease: "lo" }));
  out.push(S(slab({ x: wrist[0] - 1.6, y: -12.4, w: 3.2, d: 24.8, r: 1 }, wrist[2] + 1.6, 0.8, 3, 0.2), { tone: "hi", crease: "none" }));
  for (const by of [-12.4, 12.4]) {
    out.push(k.wireSvg(at([wrist[0], by, wrist[2] + 2.4]), at([wrist[0], by * 1.2, wrist[2] + 0.2]), { tone: "lo", size: 0.7 }));
  }
  out.push(D([at([wrist[0], -1.5, wrist[2] + 2.4])], { size: 0.6, tone: "hi" }));
  return out.join("");
}

function bellows(gx) {
  const out = [];
  const plan = { x: gx - 7, y: -9.5, w: 14, d: 19, r: 2 };
  out.push(S(slab(plan, 23, 21, 4, 0.4), { tone: "lo", crease: "faint" }));
  for (const x of steps(gx - 5.5, gx + 5.5, 1.8)) out.push(L(seg([x, 9.5, 23.4], [x, 9.5, 43.6]), { tone: "faint" }));
  out.push(L(k.sideSeam(plan, 43, P, 4), { tone: "faint" }));
  out.push(S(slab({ x: gx - 5, y: -6, w: 10, d: 12, r: 1.4 }, 18.6, 3, 3, 0.3), { tone: "lo", crease: "none" }));
  out.push(k.wireSvg(at([gx - 5, 6, 20.6]), at([gx + 5, 6, 20.6]), { via: [at([gx, 6, 18.4])], tone: "lo", size: 0.8 }));
  return out.join("");
}

function train() {
  const out = [];
  for (let index = 0; index < CARS.length; index++) {
    out.push(car(index));
    if (index < CARS.length - 1) out.push(bellows((CAR_X[index] + CAR_X[index + 1]) / 2));
  }
  return out.join("");
}

/* ================================================================ assemble */
const piersBuilt = PIERS.map(pier);
const body = [
  `<clipPath id="mtframe"><rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}"/></clipPath>`,
  `<g clip-path="url(#mtframe)">`,
  piersBuilt.map((p) => p.below).join(""),
  water(),
  piersBuilt.map((p) => p.waterline).join(""),
  piersBuilt.map((p) => p.above).join(""),
  girders(),
  deck(),
  parapet("far"),
  walkway("far"),
  signal(),
  MASTS.map(mast).join(""),
  contactWire(),
  track(),
  `<g data-part="train" transform="${k.translateAlong(P, [0, 0, 0])}">${train()}</g>`,
  walkway("near"),
  parapet("near"),
  `</g>`,
];

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  className: "mt-svg",
  label:
    "A three-car metro train running on a steel-girder viaduct over a river. Four concrete piers carry two plate girders and a deck; the track sits on timber baulks with chaired rails, a parapet and walkway run along each side, and cantilever masts hold the contact wire that the middle car's pantograph touches. Every window is glazed and lit, with seats, grab poles and passengers inside; the figure zooms into any of them.",
  body,
});

const live = `
const P = ${JSON.stringify(P)};
const WINDOWS = ${JSON.stringify(WINDOWS)};
const HW = ${HW}, SPEED = ${SPEED}, RUN = ${JSON.stringify(RUN)};
const W = ${WIDTH}, H = ${HEIGHT};
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const trainEl = svg.querySelector('[data-part="train"]');
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const frames = new Map(), cabins = new Map();
for (const el of svg.querySelectorAll("[data-win-frame]")) frames.set(Number(el.dataset.winFrame), el);
for (const el of svg.querySelectorAll("[data-win-in]")) cabins.set(Number(el.dataset.winIn), el);
const byId = new Map(WINDOWS.map((w) => [w.id, w]));
const CAB = WINDOWS[WINDOWS.length - 1].id;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const screenOf = (win, trainX) => iso([win.x + trainX, win.nose ? 0 : HW, win.z], P);

let trainX = -140, speed = SPEED, hold = false;
let zoom = 1, zoomT = 1, cx = W / 2, cy = H / 2, cxT = W / 2, cyT = H / 2, freeLook = false;
let focus = CAB, lit = CAB, frame = 0, last = 0, visible = false, idle = 0;

function markLit(id) {
  if (lit === id) return;
  const was = frames.get(lit);
  if (was) was.setAttribute("data-tone", was.dataset.win === undefined ? "lo" : "lo");
  const now = frames.get(id);
  if (now) now.setAttribute("data-tone", "lit");
  for (const [key, el] of cabins) el.classList.toggle("mt-on", key === id);
  lit = id;
}
function setFocus(id) {
  focus = id;
  hold = id !== null && id !== CAB;
  freeLook = false;
  zoomT = hold ? 5.6 : 1;
  markLit(id === null ? CAB : id);
  idle = 0;
  run();
}
function release() {
  focus = CAB;
  hold = false;
  freeLook = false;
  zoomT = 1;
  markLit(CAB);
  run();
}
function label() {
  const win = byId.get(focus);
  const kph = Math.abs(speed) * 0.36;
  const where = hold && win ? win.name : "overview";
  return kph.toFixed(0) + " km/h · " + where + (zoom > 1.04 ? " · " + zoom.toFixed(1) + "×" : "");
}
function camera() {
  const z = zoom;
  const hw = W / (2 * z), hh = H / (2 * z);
  const px = clamp(cx, hw, W - hw), py = clamp(cy, hh, H - hh);
  svg.setAttribute("viewBox", (px - hw).toFixed(2) + " " + (py - hh).toFixed(2) + " " + (W / z).toFixed(2) + " " + (H / z).toFixed(2));
  svg.style.setProperty("--anatomy-weight", (0.6 * Math.pow(z, 0.84)).toFixed(2) + "px");
}
function draw() {
  trainEl.setAttribute("transform", translateAlong(P, [trainX, 0, 0]));
  camera();
  const text = label();
  if (readout.textContent !== text) {
    readout.textContent = text;
    stage.setAttribute("aria-valuetext", text);
  }
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  const want = hold || calm ? 0 : SPEED;
  speed += (want - speed) * (1 - Math.exp(-dt / (want ? 1.4 : 1.9)));
  if (Math.abs(want - speed) < 0.4) speed = want;
  trainX += speed * dt;
  if (trainX > RUN[1]) { trainX = RUN[0]; if (hold) release(); }
  zoom += (zoomT - zoom) * (1 - Math.exp(-dt / 0.42));
  if (Math.abs(zoomT - zoom) < 0.004) zoom = zoomT;
  if (!freeLook) {
    const win = hold ? byId.get(focus) : null;
    if (win) { const p = screenOf(win, trainX); cxT = p[0]; cyT = p[1]; } else { cxT = W / 2; cyT = H / 2; }
    const tau = zoom > 1.6 ? 0.1 : 0.4;
    cx += (cxT - cx) * (1 - Math.exp(-dt / tau));
    cy += (cyT - cy) * (1 - Math.exp(-dt / tau));
  }
  draw();
  const settled = speed === 0 && zoom === zoomT && Math.abs(cxT - cx) < 0.05 && Math.abs(cyT - cy) < 0.05;
  frame = visible && !settled ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
new IntersectionObserver((e) => { visible = e[e.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "160px 0px" }).observe(stage);

svg.addEventListener("pointerover", (event) => {
  const hit = event.target.closest("[data-win]");
  if (hit && !hold) markLit(Number(hit.dataset.win));
});
svg.addEventListener("pointerout", (event) => {
  if (!hold && !event.relatedTarget?.closest?.("[data-win]")) markLit(CAB);
});
let drag = null;
svg.addEventListener("pointerdown", (event) => {
  // remember what was under the pointer now: once the drag captures, every later
  // pointer event retargets to the svg and the window under the cursor is lost.
  drag = { x: event.clientX, y: event.clientY, moved: false, id: event.pointerId, hit: event.target.closest("[data-win]") };
});
svg.addEventListener("pointermove", (event) => {
  if (!drag || event.pointerId !== drag.id) return;
  const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
  if (!drag.moved) {
    if (Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    try { svg.setPointerCapture(drag.id); } catch (error) { /* mouse needs no capture */ }
  }
  freeLook = true;
  const box = svg.getBoundingClientRect();
  cx -= (dx * W) / (box.width * zoom);
  cy -= (dy * H) / (box.height * zoom);
  drag.x = event.clientX;
  drag.y = event.clientY;
  run();
});
const letGo = (event) => {
  const was = drag;
  drag = null;
  if (!was) return;
  if (was.moved) { try { svg.releasePointerCapture(was.id); } catch (error) { /* already gone */ } return; }
  if (was.hit) setFocus(Number(was.hit.dataset.win));
  else release();
};
svg.addEventListener("pointerup", letGo);
svg.addEventListener("pointercancel", letGo);
svg.addEventListener("wheel", (event) => {
  event.preventDefault();
  const box = svg.getBoundingClientRect();
  const ux = cx + ((event.clientX - box.left) / box.width - 0.5) * (W / zoom);
  const uy = cy + ((event.clientY - box.top) / box.height - 0.5) * (H / zoom);
  const next = clamp(zoom * Math.exp(-event.deltaY / 420), 1, 11);
  if (!hold) { cx = ux + (cx - ux) * (zoom / next); cy = uy + (cy - uy) * (zoom / next); freeLook = next > 1.02; }
  zoom = zoomT = next;
  if (next <= 1.02) { freeLook = false; }
  run();
}, { passive: false });
stage.addEventListener("keydown", (event) => {
  const order = WINDOWS.map((w) => w.id);
  const here = order.indexOf(focus);
  if (event.key === "ArrowRight" || event.key === "ArrowDown") { setFocus(order[(here + 1 + order.length) % order.length]); }
  else if (event.key === "ArrowLeft" || event.key === "ArrowUp") { setFocus(order[(here - 1 + order.length) % order.length]); }
  else if (event.key === "Escape" || event.key === "0") { release(); }
  else if (event.key === "+" || event.key === "=") { zoomT = clamp(zoom * 1.5, 1, 11); }
  else if (event.key === "-") { zoomT = clamp(zoom / 1.5, 1, 11); if (zoomT <= 1.02) freeLook = false; }
  else if (event.key === " ") { hold = !hold; if (!hold) zoomT = zoom; }
  else return;
  event.preventDefault();
  run();
});
if (still.matches) { trainX = -40; speed = 0; }
markLit(CAB);
draw();
`;

const MT_CSS = `
.iso{--mt-river:#181c21;--mt-glass:#0c0f12;--mt-cabin:#241f17;--mt-cabin-on:#39301f;--mt-far:#1a1813;--mt-seat:#413627;--mt-pax:#6b5c42;--mt-pole:#8a7f68;--mt-disp:#17171a}
.iso[data-theme="light"]{--mt-river:#e4e9ed;--mt-glass:#dee3e7;--mt-cabin:#f4efe2;--mt-cabin-on:#fdf8e9;--mt-far:#e6e0cf;--mt-seat:#cfc5ad;--mt-pax:#a2977e;--mt-pole:#8a8270;--mt-disp:#eceade}
.mt-water>.iso-fill,.mt-water>.iso-top,.mt-water>.iso-shade{fill:var(--mt-river)}
.mt-cabin{fill:var(--mt-cabin);stroke:none}
.mt-on .mt-cabin{fill:var(--mt-cabin-on)}
.mt-far{fill:var(--mt-far);stroke:none}
.mt-glass{fill:var(--mt-glass);stroke:none}
.mt-seat{fill:var(--mt-seat);stroke:none}
.mt-pax{fill:var(--mt-pax);stroke:none}
.mt-pole{fill:none;stroke:var(--mt-pole);stroke-width:var(--anatomy-weight);stroke-linecap:round}
.mt-disp{fill:var(--mt-disp);stroke:none}
.mt-hit{fill:transparent;stroke:none;cursor:zoom-in}
html,body{margin:0;padding:0;background:var(--anatomy-card)}
.iso-page{width:100%;max-width:none;margin:0}
.iso-figure{margin:0}
.iso-plate{padding:0;box-shadow:none;border-radius:0;background:var(--anatomy-card)}
.iso-plate-corners,.iso-legend{display:none}
.iso-plate .iso-svg{display:block;width:100%;height:auto;margin:0}
.mt-svg{touch-action:none}
.iso-stage{cursor:grab}
.iso-stage:focus-visible{outline:1px solid var(--anatomy-mid);outline-offset:6px}
@media (max-width:560px){.iso-plate-corner[data-corner="hint"]{font-size:9px;letter-spacing:.06em}}
`;

const bodyHtml = k.plateHtml({
  fig: "",
  title: "",
  hint: "",
  readout: "",
  keys: [],
  caption: "",
  body: `<style>${MT_CSS}</style><div class="iso-stage" tabindex="0" role="application" aria-label="Metro on a viaduct: arrow keys move from window to window, Escape returns to the whole bridge" aria-valuetext="${(SPEED * 0.36).toFixed(0)} km/h, overview">${svg}</div>`,
});

const name = theme === "light" ? "metro-bridge-light.html" : "metro-bridge.html";
writeFileSync(join(HERE, name), k.pageHtml({ title: "Metro on the viaduct", theme, body: bodyHtml, script: kitScript() + live, width: 1120 }));
console.log("wrote", name, "·", WINDOWS.length, "glazed openings");
