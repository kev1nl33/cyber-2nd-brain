/**
 * Zoom level of detail. Three bands, switched with a hysteresis margin so the
 * label detail does not flicker while the camera eases across a threshold.
 *
 *   far  scale < 0.6   theme glows and theme names only
 *   mid  0.6 – 1.2     question text appears
 *   near scale > 1.2   step text appears
 */

export const LOD_LOW = 0.6;
export const LOD_HIGH = 1.2;
export const LOD_HYSTERESIS = 0.05;

const BANDS = ["far", "mid", "near"];

/** Band a scale falls in when there is no previous band to hold onto. */
function rawLod(scale) {
  if (scale < LOD_LOW) return "far";
  if (scale <= LOD_HIGH) return "mid";
  return "near";
}

/**
 * Next band for `scale`, keeping `current` until the scale clears its
 * threshold by `LOD_HYSTERESIS` on the way out.
 * @param {number} scale
 * @param {string|null} [current]
 * @returns {"far"|"mid"|"near"}
 */
export function nextLod(scale, current) {
  if (!BANDS.includes(current)) return rawLod(scale);
  if (current === "far") return scale > LOD_LOW + LOD_HYSTERESIS ? rawLod(scale) : "far";
  if (current === "near") return scale < LOD_HIGH - LOD_HYSTERESIS ? rawLod(scale) : "near";
  if (scale < LOD_LOW - LOD_HYSTERESIS) return "far";
  if (scale > LOD_HIGH + LOD_HYSTERESIS) return "near";
  return "mid";
}
