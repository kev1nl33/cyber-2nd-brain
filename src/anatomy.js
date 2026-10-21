/**
 * Procedural brain art.
 *
 * The shape is built from a front-to-back profile rather than a polar blob:
 * `y(v)` walks from the frontal pole (v = -1) to the back (v = 1) and
 * `w(v, side)` gives the half width there, with its own wobble per side. That
 * gives an ovoid silhouette with notches where the hemispheres separate, plus
 * longitudinal gyri and transverse sulci that follow the same profile — the
 * reason the brains read as brains and not as symmetrical ellipses.
 *
 * Detail density is the only difference between the core brain and a distant
 * theme brain, so every brain shares one drawing grammar.
 */
import { makeRng, range } from "./random.js";

const TAU = Math.PI * 2;

const DETAIL = {
  core: { gyri: [4, 5], sulci: [5, 6], fibres: 20, junctions: 13, sparks: 7, pulses: 4, depth: true },
  focus: { gyri: [3, 4], sulci: [4, 5], fibres: 15, junctions: 9, sparks: 5, pulses: 3, depth: true },
  theme: { gyri: [2, 3], sulci: [2, 3], fibres: 7, junctions: 5, sparks: 3, pulses: 1, depth: false },
  distant: { gyri: [1, 2], sulci: [1, 1], fibres: 3, junctions: 2, sparks: 1, pulses: 0, depth: false },
};

/**
 * @param {{ seed: string, detail?: keyof typeof DETAIL }} options
 * @returns {string} inner markup for an `<svg viewBox="-110 -110 220 220">`
 */
export function brainArt({ seed, detail = "theme" }) {
  const preset = DETAIL[detail] || DETAIL.theme;
  const rng = makeRng(`brain:${seed}`);
  const profile = makeProfile(rng);

  const shell = [path(toPath(outline(profile), true), "brain-contour")];
  for (const arc of fissureLines(rng, profile)) shell.push(path(toPath(arc), "brain-fissure"));

  const folds = [];
  [-1, 1].forEach((side, i) => {
    for (const curve of gyri(rng, profile, side, preset.gyri[i])) {
      folds.push(path(toPath(curve), "brain-gyrus"));
    }
    for (const curve of sulci(rng, profile, side, preset.sulci[i])) {
      folds.push(path(toPath(curve), "brain-sulcus"));
    }
  });

  const fibres = [];
  const pulseEvery = preset.pulses ? Math.max(1, Math.floor(preset.fibres / preset.pulses)) : 0;
  for (let i = 0; i < preset.fibres; i++) {
    const curve = fibre(rng, profile);
    const d = toPath(curve);
    fibres.push(path(d, "brain-fibre"));
    if (pulseEvery && i % pulseEvery === 0) {
      fibres.push(path(d, "brain-pulse", `pathLength="100" style="animation-delay:${(rng() * 3.5).toFixed(2)}s"`));
    }
  }

  const dots = [];
  for (let i = 0; i < preset.junctions; i++) {
    const p = inside(rng, profile, 0, { uMin: 0.12, uMax: 0.82 });
    dots.push(circle(p, range(rng, 0.7, 1.4), "brain-junction"));
  }
  for (let i = 0; i < preset.sparks; i++) {
    const side = rng() < 0.5 ? -1 : 1;
    const v = range(rng, -0.8, 0.84);
    const p = { x: profile.cx(v) + side * profile.w(v, side) * range(rng, 0.78, 0.97), y: profile.y(v) };
    dots.push(circle(p, range(rng, 1, 1.8), "brain-spark", `style="animation-delay:${(rng() * 2.5).toFixed(2)}s"`));
  }

  const layers = [];
  if (preset.depth) {
    const far = [];
    for (const curve of gyri(rng, profile, rng() < 0.5 ? -1 : 1, 2)) {
      far.push(path(toPath(shrink(curve, 0.74)), "brain-gyrus"));
    }
    layers.push(group("brain-layer brain-layer--far", far.join("")));
  }
  layers.push(group("brain-layer brain-layer--fibres", fibres.join("")));
  layers.push(group("brain-layer brain-layer--gyri", folds.join("")));
  layers.push(group("brain-layer brain-layer--shell", shell.join("")));
  layers.push(group("brain-layer brain-layer--dots", dots.join("")));
  return layers.join("");
}

/**
 * Front-to-back profile of one brain. `v` runs -1 (front) to 1 (back).
 * @param {() => number} rng
 */
function makeProfile(rng) {
  const L = 84;
  const W = 68;
  const phase = [rng() * TAU, rng() * TAU, rng() * TAU, rng() * TAU];
  const bump = [range(rng, 0.022, 0.05), range(rng, 0.02, 0.046)];
  const bias = [range(rng, 1, 1.07), range(rng, 0.94, 1.01)];
  const lean = range(rng, 1.6, 3.4);

  return {
    L,
    W,
    y: (v) => v * L,
    /** @param {-1|1} side */
    w: (v, side) => {
      const s = side < 0 ? 0 : 1;
      const base = W * Math.pow(Math.max(0, 1 - v * v), 0.5);
      const front = 1 - 0.32 * Math.pow(Math.max(0, -v), 1.4);
      const back = 1 + 0.08 * Math.max(0, v);
      const wobble =
        1 + bump[s] * Math.sin(v * 7.5 + phase[s]) + bump[s] * 0.6 * Math.sin(v * 13 + phase[s + 2]);
      return Math.max(0, base * front * back * wobble * bias[s]);
    },
    cx: (v) => lean * Math.sin(v * 1.35 + phase[0]),
  };
}

/** Closed silhouette with an interhemispheric notch at each pole. */
function outline(p, steps = 30) {
  const pts = [{ x: p.cx(-0.9), y: p.y(-0.89) }];
  for (let i = 0; i <= steps; i++) {
    const v = lerp(-0.97, 0.98, i / steps);
    pts.push({ x: p.cx(v) + p.w(v, 1), y: p.y(v) });
  }
  pts.push({ x: p.cx(0.92), y: p.y(0.91) });
  for (let i = steps; i >= 0; i--) {
    const v = lerp(-0.97, 0.98, i / steps);
    pts.push({ x: p.cx(v) - p.w(v, -1), y: p.y(v) });
  }
  return pts;
}

/** The central fissure, broken into one or two segments. */
function fissureLines(rng, p) {
  const phase = rng() * TAU;
  const sway = range(rng, 1.6, 3.2);
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const v = lerp(-0.78, 0.82, i / 16);
    pts.push({
      x: p.cx(v) + Math.sin(v * Math.PI * 1.6 + phase) * sway,
      y: p.y(v),
    });
  }
  if (rng() < 0.55) return [pts];
  const cut = Math.floor(pts.length * range(rng, 0.42, 0.6));
  return [pts.slice(0, cut), pts.slice(cut + 2)];
}

/** Longitudinal folds running front to back inside one hemisphere. */
function gyri(rng, p, side, count) {
  const curves = [];
  for (let k = 0; k < count; k++) {
    const f = 0.24 + ((k + 0.5) * 0.68) / count + range(rng, -0.04, 0.04);
    // Some folds span the whole hemisphere, others only a stretch of it.
    const short = rng() < 0.4;
    const v0 = short ? range(rng, -0.86, 0.1) : range(rng, -0.9, -0.52);
    const v1 = short ? Math.min(0.9, v0 + range(rng, 0.5, 0.9)) : range(rng, 0.52, 0.9);
    const phase = rng() * TAU;
    const waves = range(rng, 2.6, 6.4);
    const amp = range(rng, 0.07, 0.17);
    const pts = [];
    for (let i = 0; i <= 18; i++) {
      const v = lerp(v0, v1, i / 18);
      const spread = f * (1 + amp * Math.sin(v * waves * Math.PI + phase));
      pts.push({
        x: p.cx(v) + side * p.w(v, side) * spread,
        y: p.y(v) + 2.2 * Math.sin(v * waves + phase),
      });
    }
    curves.push(pts);
  }
  return curves;
}

/** Short transverse sulci cutting outward from the fissure. */
function sulci(rng, p, side, count) {
  const curves = [];
  for (let k = 0; k < count; k++) {
    const v = range(rng, -0.74, 0.82);
    const drift = range(rng, -0.14, 0.14);
    const u0 = range(rng, 0.14, 0.42);
    const u1 = Math.min(0.94, u0 + range(rng, 0.2, 0.46));
    const bow = range(rng, -5, 5);
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const vv = v + drift * t;
      const u = lerp(u0, u1, t);
      pts.push({
        x: p.cx(vv) + side * p.w(vv, side) * u,
        y: p.y(vv) + Math.sin(t * Math.PI) * bow,
      });
    }
    curves.push(pts);
  }
  return curves;
}

/** A short inner fibre; some arc across the midline. */
function fibre(rng, p) {
  const crossing = rng() < 0.32;
  if (crossing) {
    const v = range(rng, -0.5, 0.62);
    const dv = range(rng, -0.16, 0.16);
    const a = inside(rng, p, -1, { v, uMin: 0.18, uMax: 0.62 });
    const b = inside(rng, p, 1, { v: v + dv, uMin: 0.18, uMax: 0.62 });
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + range(rng, -9, 9) };
    return [a, mid, b];
  }
  const side = rng() < 0.5 ? -1 : 1;
  const v = range(rng, -0.76, 0.8);
  const a = inside(rng, p, side, { v, uMin: 0.12, uMax: 0.86 });
  const b = inside(rng, p, side, { v: v + range(rng, -0.3, 0.3), uMin: 0.12, uMax: 0.86 });
  const mid = {
    x: (a.x + b.x) / 2 + range(rng, -7, 7),
    y: (a.y + b.y) / 2 + range(rng, -7, 7),
  };
  return [a, mid, b];
}

function inside(rng, p, side, { v, uMin = 0.1, uMax = 0.9 } = {}) {
  const vv = clamp(v ?? range(rng, -0.82, 0.86), -0.9, 0.9);
  const s = side || (rng() < 0.5 ? -1 : 1);
  const u = range(rng, uMin, uMax);
  return { x: p.cx(vv) + s * p.w(vv, s) * u, y: p.y(vv) };
}

function shrink(points, k) {
  return points.map((pt) => ({ x: pt.x * k, y: pt.y * k }));
}

/** Catmull-Rom through the points, emitted as cubic beziers. */
function toPath(points, closed = false) {
  const p = points;
  const n = p.length;
  if (n < 2) return "";
  const at = (i) => (closed ? p[(i + n) % n] : p[Math.min(Math.max(i, 0), n - 1)]);
  let d = `M ${fmt(p[0].x)} ${fmt(p[0].y)}`;
  const segments = closed ? n : n - 1;
  for (let i = 0; i < segments; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    d +=
      ` C ${fmt(p1.x + (p2.x - p0.x) / 6)} ${fmt(p1.y + (p2.y - p0.y) / 6)},` +
      ` ${fmt(p2.x - (p3.x - p1.x) / 6)} ${fmt(p2.y - (p3.y - p1.y) / 6)},` +
      ` ${fmt(p2.x)} ${fmt(p2.y)}`;
  }
  return closed ? `${d} Z` : d;
}

function path(d, className, extra = "") {
  return d ? `<path class="${className}" d="${d}" ${extra}/>` : "";
}

function circle(p, r, className, extra = "") {
  return `<circle class="${className}" cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="${fmt(r)}" ${extra}/>`;
}

function group(className, inner) {
  return inner ? `<g class="${className}">${inner}</g>` : "";
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function fmt(n) {
  return Math.round(n * 100) / 100;
}
