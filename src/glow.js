/** 亮度区间：最近也不会暗到看不见，最亮不超过原色。 */
const BRIGHT_MAX = 1;
const BRIGHT_MIN = 0.55;
const FRESH_DAYS = 3;
const FADED_DAYS = 30;
const BREATH_PERIOD = 6;
const BREATH_AMPLITUDE = 0.06;
const DAY_MS = 86_400_000;

/** 日期字符串距今天的整天数（UTC 日历日）。缺失或无法解析返回 null，不读任何内容。 */
export function daysSince(date, now = new Date()) {
  const parsed = parseDay(date);
  if (parsed === null) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((today - parsed) / DAY_MS);
}

/**
 * 中心物体亮度。0-3 天为 1，30 天及以上为 0.55，中间线性插值。
 * elapsed 为秒数时叠加 6 秒一周的慢呼吸，结果始终夹在 [0.55, 1]。
 * @param {number|null|undefined} days 距今天数，或直接传入已算好的基础亮度（仅测试呼吸时使用天数）
 */
export function coreBrightness(days, elapsed = 0, { breathe = true } = {}) {
  let base;
  if (typeof days !== "number" || !Number.isFinite(days) || days < 0) {
    base = BRIGHT_MIN;
  } else if (days <= FRESH_DAYS) {
    base = BRIGHT_MAX;
  } else if (days >= FADED_DAYS) {
    base = BRIGHT_MIN;
  } else {
    const t = (days - FRESH_DAYS) / (FADED_DAYS - FRESH_DAYS);
    base = BRIGHT_MAX - t * (BRIGHT_MAX - BRIGHT_MIN);
  }
  if (!breathe) return base;
  const wave = Math.sin((2 * Math.PI * elapsed) / BREATH_PERIOD);
  return clamp(base + wave * BREATH_AMPLITUDE, BRIGHT_MIN, BRIGHT_MAX);
}

/** 只取步骤节点的日期字段，返回最晚的一天；没有可用日期时返回 null。 */
export function latestStepDate(nodes) {
  let latest = null;
  const list = nodes instanceof Map ? nodes.values() : nodes || [];
  for (const node of list) {
    if (!node || node.type !== "step") continue;
    const day = parseDay(node.date);
    if (day === null) continue;
    if (latest === null || day > latest) latest = day;
  }
  if (latest === null) return null;
  return new Date(latest).toISOString().slice(0, 10);
}

function parseDay(date) {
  if (typeof date !== "string" || !date) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = Date.UTC(year, month - 1, day);
  const check = new Date(utc);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null;
  }
  return utc;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** 屏幕中心的光环：缓存静态外晕，只推进亮弧角度。 */
export function createGlow(ctx) {
  const noop = { frame() {}, resize() {} };
  if (!ctx) return noop;
  const halo = document.createElement("canvas");
  const haloCtx = halo.getContext("2d");
  if (!haloCtx) return noop;

  const turn = Math.PI * 2;
  let angle = 0;
  let cx = 0;
  let cy = 0;
  let radius = 0;
  let segments = 48;
  let lineWidth = 1.5;
  let ring = null;
  /** 每段的起角、中角、止角。段数只在 resize 变，帧循环里不再逐段重乘。
   *  角度表达式与原先逐帧的 i * step / start + step / 2 / start + step 完全一致。 */
  let starts = [];
  let mids = [];
  let ends = [];

  function resize(width, height, dpr) {
    halo.width = ctx.canvas.width;
    halo.height = ctx.canvas.height;
    haloCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx = width / 2;
    cy = height / 2;
    const shortSide = Math.min(width, height);
    const mobile = shortSide < 560;
    radius = shortSide * 0.25 * (mobile ? 0.8 : 1);
    segments = mobile ? 24 : 48;
    lineWidth = mobile ? 2 : 1.5;
    ring = null;
    starts = [];
    mids = [];
    ends = [];
    const green = getComputedStyle(document.documentElement).getPropertyValue("--green").trim();
    if (!radius) return;

    const step = turn / segments;
    for (let i = 0; i < segments; i++) {
      const start = i * step;
      starts.push(start);
      mids.push(start + step / 2);
      ends.push(start + step);
    }

    const outer = haloCtx.createRadialGradient(cx, cy, radius * 0.75, cx, cy, radius * 1.25);
    outer.addColorStop(0, withAlpha(green, 0));
    outer.addColorStop(0.5, withAlpha(green, mobile ? 0.07 : 0.1));
    outer.addColorStop(1, withAlpha(green, 0));
    haloCtx.fillStyle = outer;
    haloCtx.fillRect(0, 0, width, height);

    ring = ctx.createRadialGradient(cx, cy, Math.max(0, radius - lineWidth), cx, cy, radius + lineWidth);
    ring.addColorStop(0, withAlpha(green, 0));
    ring.addColorStop(0.5, withAlpha(green, mobile ? 0.25 : 0.35));
    ring.addColorStop(1, withAlpha(green, 0));
  }

  function frame(dt, motion) {
    if (!ring) return;
    if (motion) angle = (angle + dt * 0.4) % turn;

    // 离屏图与主画布设备像素一致，用单位变换贴图，避免再次乘 DPR。
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(halo, 0, 0);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = ring;
    ctx.lineWidth = lineWidth;
    for (let i = 0; i < segments; i++) {
      const distance = Math.atan2(Math.sin(mids[i] - angle), Math.cos(mids[i] - angle));
      const brightness = Math.exp(-(distance * distance) / 0.5);
      ctx.globalAlpha = 0.18 + brightness * 0.82;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, starts[i], ends[i]);
      ctx.stroke();
    }
    ctx.restore();
  }

  return { frame, resize };
}

function withAlpha(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
