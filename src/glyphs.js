/**
 * Non-brain node glyphs. Every glyph shares the brains' `-110 -110 220 220`
 * view box so one sizing rule covers all nodes. Shape carries the content
 * type, brightness carries selection: see styles.css.
 */

const HALO = '<circle class="glyph-halo" cx="0" cy="0" r="86" />';

/** 保留 6° 缺口；60 段及以上按每段一半收缩，保证每段都有可见弧长。 */
function ringGap(segments) {
  return segments < 60 ? 6 : 180 / segments;
}

/**
 * 问题指纹：外环按步骤数分段，末段暖金表示已有阶段理解（待确认为暖金虚线），
 * 圆心亮点表示 7 天内有更新，刺数等于去重来源数（上限 9）。全部由参数决定，纯函数。
 * @param {{ seed?: number, steps?: number, sources?: number, conclusion?: "confirmed"|"unconfirmed"|null, fresh?: boolean }} [fingerprint]
 */
export function ideaGlyph(fingerprint = 0) {
  const legacy = typeof fingerprint === "number";
  // 数字签名（旧测试/演示）保留 6 段 7 刺；对象缺字段时宁可少画，不伪造数据。
  const { seed = legacy ? fingerprint : 0, steps = legacy ? 6 : 0, sources = legacy ? 7 : 0, conclusion = null, fresh = false } =
    legacy ? {} : fingerprint;
  const count = Number.isFinite(steps) && steps > 0 ? Math.round(steps) : 0;
  const ringClass = conclusion === "confirmed" ? "glyph-ring--warm" : "glyph-ring--pending";
  const gap = count ? ringGap(count) : 0;
  const rings = [];
  for (let i = 0; i < count; i++) {
    const warm = conclusion && i === count - 1;
    rings.push(arc(58, -90 + gap / 2 + i * (360 / count), -90 + (i + 1) * (360 / count) - gap / 2, `glyph-ring${warm ? ` ${ringClass}` : ""}`));
  }
  const spikes = [];
  const spikeCount = Number.isFinite(sources) && sources > 0 ? Math.min(9, Math.round(sources)) : 0;
  for (let i = 0; i < spikeCount; i++) {
    const a = (i / spikeCount) * Math.PI * 2 + (seed % 7) * 0.21;
    const r0 = 62;
    const r1 = 62 + 20 + ((i * 7 + seed) % 11);
    spikes.push(
      line(Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * r1, Math.sin(a) * r1, "glyph-spike")
    );
  }
  return [
    HALO,
    rings.join(""),
    `<circle class="glyph-core" cx="0" cy="0" r="34" />`,
    `<circle class="glyph-pupil" cx="0" cy="0" r="13" />`,
    fresh ? `<circle class="glyph-fresh" cx="0" cy="0" r="22" />` : "",
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

/** 主题活跃弧：比例占整圈的比例，0 或非法值不画。同一种绿色，不给主题上色。 */
export function activityArc(ratio) {
  if (typeof ratio !== "number" || !Number.isFinite(ratio) || ratio <= 0) return "";
  const clamped = Math.min(1, ratio);
  // SVG 单个 A 的起终同点不会画整圈；满占比用两个半圆。
  if (clamped === 1) {
    return '<path class="glyph-arc" vector-effect="non-scaling-stroke" d="M 0 -94 A 94 94 0 1 1 0 94 A 94 94 0 1 1 0 -94" />';
  }
  return arc(94, -90, -90 + 360 * clamped, "glyph-arc");
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
  const round = (n) => Number(n.toPrecision(12));
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
