/** Deterministic pseudo-random helpers so generated art stays stable per node id. */

/** @param {string} str */
export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** @param {number} seed @returns {() => number} */
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** @param {string} seed */
export function makeRng(seed) {
  return mulberry32(hashString(String(seed)) || 1);
}

/** @param {() => number} rng @param {number} min @param {number} max */
export function range(rng, min, max) {
  return min + rng() * (max - min);
}

/** @param {() => number} rng @param {number} min @param {number} max */
export function intRange(rng, min, max) {
  return Math.floor(range(rng, min, max + 1 - 1e-9));
}
