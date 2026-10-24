/**
 * Camera over the world coordinate space. Holds a target and an eased current
 * value so level changes glide instead of cutting. Auto-fit only runs when the
 * app asks for it; hovering, selecting or opening a popover never moves it.
 */

const MIN_SCALE = 0.16;
const MAX_SCALE = 2.6;

/** Largest scale that keeps `box` inside `area` when centred on `center`. */
function scaleAround(box, center, area) {
  const hx = Math.max(box.maxX - center.x, center.x - box.minX, 1);
  const hy = Math.max(box.maxY - center.y, center.y - box.minY, 1);
  return Math.min(area.width / (2 * hx), area.height / (2 * hy));
}

export function createCamera() {
  const current = { x: 0, y: 0, scale: 1 };
  const target = { x: 0, y: 0, scale: 1 };
  /** Usable area: size of the canvas and the centre to align content on. */
  let area = { width: 1, height: 1, ox: 0.5, oy: 0.5 };
  let userAdjusted = false;
  let instant = false;

  const clampScale = (s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

  const api = {
    get current() {
      return current;
    },
    get userAdjusted() {
      return userAdjusted;
    },
    setInstant(value) {
      instant = Boolean(value);
    },
    /** @param {{ width:number, height:number, insets:{top:number,right:number,bottom:number,left:number} }} rect */
    setArea({ width, height, insets }) {
      area = {
        width: Math.max(80, width - insets.left - insets.right),
        height: Math.max(80, height - insets.top - insets.bottom),
        ox: insets.left + (width - insets.left - insets.right) / 2,
        oy: insets.top + (height - insets.top - insets.bottom) / 2,
      };
    },
    get area() {
      return area;
    },
    /**
     * Fit the focus box around a centre, then widen toward the full box only
     * as far as it does not shrink the focus below `minRatio`. Peripheral
     * nodes may fall outside; zoom out or reset brings them back.
     *
     * @param {{minX:number,maxX:number,minY:number,maxY:number,cx:number,cy:number}} focusBox
     * @param {{minX:number,maxX:number,minY:number,maxY:number,cx:number,cy:number}} fullBox
     * @param {{ minRatio?: number, anchor?: {x:number,y:number}|null, anchorWeight?: number }} [options]
     */
    fit(focusBox, fullBox, { minRatio = 0.72, anchor = null, anchorWeight = 0.5 } = {}) {
      const center = anchor
        ? {
            x: focusBox.cx * (1 - anchorWeight) + anchor.x * anchorWeight,
            y: focusBox.cy * (1 - anchorWeight) + anchor.y * anchorWeight,
          }
        : { x: focusBox.cx, y: focusBox.cy };
      const sFocus = clampScale(scaleAround(focusBox, center, area));
      const sFull = clampScale(scaleAround(fullBox, center, area));
      target.scale = clampScale(Math.min(sFocus, Math.max(sFull, sFocus * minRatio)));
      target.x = center.x;
      target.y = center.y;
      userAdjusted = false;
      return target;
    },
    reset() {
      userAdjusted = false;
    },
    /** @param {number} factor @param {{x:number,y:number}} [anchor] screen point */
    zoomBy(factor, anchor) {
      const next = clampScale(target.scale * factor);
      if (anchor) {
        const world = api.toWorld(anchor, target);
        target.x = world.x - (anchor.x - area.ox) / next;
        target.y = world.y - (anchor.y - area.oy) / next;
      }
      target.scale = next;
      userAdjusted = true;
    },
    /** Pan by a screen-space delta. */
    panBy(dx, dy) {
      target.x -= dx / target.scale;
      target.y -= dy / target.scale;
      current.x -= dx / current.scale;
      current.y -= dy / current.scale;
      userAdjusted = true;
    },
    toScreen(point, from = current) {
      return {
        x: (point.x - from.x) * from.scale + area.ox,
        y: (point.y - from.y) * from.scale + area.oy,
      };
    },
    toWorld(point, from = current) {
      return {
        x: (point.x - area.ox) / from.scale + from.x,
        y: (point.y - area.oy) / from.scale + from.y,
      };
    },
    /** @param {number} dt seconds @returns {boolean} still moving */
    step(dt) {
      if (instant) {
        current.x = target.x;
        current.y = target.y;
        current.scale = target.scale;
        return false;
      }
      const k = 1 - Math.exp(-dt / 0.14);
      current.x += (target.x - current.x) * k;
      current.y += (target.y - current.y) * k;
      current.scale += (target.scale - current.scale) * k;
      const moving =
        Math.abs(target.x - current.x) > 0.05 ||
        Math.abs(target.y - current.y) > 0.05 ||
        Math.abs(target.scale - current.scale) > 0.0004;
      if (!moving) {
        current.x = target.x;
        current.y = target.y;
        current.scale = target.scale;
      }
      return moving;
    },
    snap() {
      current.x = target.x;
      current.y = target.y;
      current.scale = target.scale;
    },
  };

  return api;
}
