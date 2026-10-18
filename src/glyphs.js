/**
 * Non-brain node glyphs. Every glyph shares the brains' `-110 -110 220 220`
 * view box so one sizing rule covers all nodes. Shape carries the content
 * type, brightness carries selection: see styles.css.
 */

const HALO = '<circle class="glyph-halo" cx="0" cy="0" r="86" />';

export function ideaGlyph(seed = 0) {
  const spikes = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + (seed % 7) * 0.21;
    const r0 = 62;
    const r1 = 62 + 20 + ((i * 7 + seed) % 11);
    spikes.push(
      line(Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * r1, Math.sin(a) * r1, "glyph-spike")
    );
  }
  return [
    HALO,
    arc(58, -120, 110, "glyph-ring"),
    arc(58, 130, 335, "glyph-ring"),
    `<circle class="glyph-core" cx="0" cy="0" r="34" />`,
    `<circle class="glyph-pupil" cx="0" cy="0" r="13" />`,
    spikes.join(""),
  ].join("");
}

/** @param {'thought'|'action'|'input'|'experience'} family */
export function stepGlyph(family) {
  const shape =
    family === "action"
      ? `<rect class="glyph-shape" x="-52" y="-52" width="104" height="104" rx="18" />`
      : family === "input"
      ? `<path class="glyph-shape" d="M0,-66 L66,0 L0,66 L-66,0 Z" />`
      : family === "experience"
      ? `<path class="glyph-shape" d="${polygon(6, 62, -90)}" />`
      : `<circle class="glyph-shape" cx="0" cy="0" r="56" />`;
  return [HALO, shape, `<circle class="glyph-pupil" cx="0" cy="0" r="7" />`].join("");
}

export function conclusionGlyph() {
  return [
    HALO,
    `<path class="glyph-shape glyph-shape--warm" d="M0,-58 L58,0 L0,58 L-58,0 Z" />`,
    `<path class="glyph-bracket" d="M-78,-30 L-78,30" />`,
    `<path class="glyph-bracket" d="M78,-30 L78,30" />`,
    `<circle class="glyph-pupil glyph-pupil--warm" cx="0" cy="0" r="10" />`,
  ].join("");
}

export function sourceGlyph() {
  return [
    HALO,
    `<path class="glyph-shape glyph-shape--cool" d="M-44,-62 L22,-62 L48,-34 L48,62 L-44,62 Z" />`,
    `<path class="glyph-fold" d="M22,-62 L22,-34 L48,-34" />`,
    `<path class="glyph-rule" d="M-26,-6 L30,-6" />`,
    `<path class="glyph-rule" d="M-26,20 L16,20" />`,
  ].join("");
}

function polygon(sides, r, startDeg = 0) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = (startDeg + (360 / sides) * i) * (Math.PI / 180);
    pts.push(`${round(Math.cos(a) * r)},${round(Math.sin(a) * r)}`);
  }
  return `M${pts.join(" L")} Z`;
}

function arc(r, fromDeg, toDeg, className) {
  const a0 = fromDeg * (Math.PI / 180);
  const a1 = toDeg * (Math.PI / 180);
  const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
  return `<path class="${className}" vector-effect="non-scaling-stroke" d="M ${round(
    Math.cos(a0) * r
  )} ${round(Math.sin(a0) * r)} A ${r} ${r} 0 ${large} 1 ${round(Math.cos(a1) * r)} ${round(
    Math.sin(a1) * r
  )}" />`;
}

function line(x1, y1, x2, y2, className) {
  return `<path class="${className}" vector-effect="non-scaling-stroke" d="M ${round(x1)} ${round(
    y1
  )} L ${round(x2)} ${round(y2)}" />`;
}

function round(n) {
  return Math.round(n * 10) / 10;
}
