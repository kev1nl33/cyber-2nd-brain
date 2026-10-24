/** 流星：稀疏的亮点斜向划过，头部近白绿发光，尾迹渐变到透明。不画任何字符。
 * 画在自己的画布上，平移视差由调用方用 transform 叠加，这里只负责流星本身。 */
import { makeRng, range } from "./random.js";

const MOBILE_WIDTH = 860;

export function createRain(ctx) {
  const noop = { frame() {}, resize() {}, setDepth() {} };
  if (!ctx) return noop;
  const canvas = ctx.canvas;
  const rng = makeRng("rain");

  let width = 0;
  let height = 0;
  let baseRgb = [126, 242, 176];
  let headRgb = [229, 253, 239];
  /** 尾端全透明的渐变端色，只随主题色变化，readGreen 时一并算好。 */
  let tailColor = "rgba(126, 242, 176, 0.000)";
  let meteors = [];
  let frequency = 1;
  let brightness = 1;
  let frequencyTarget = 1;
  let brightnessTarget = 1;
  let paused = false;
  let deep = false;
  let fadeElapsed = 1;
  let fromFrequency = 1;
  let fromBrightness = 1;

  // 接口与 glow.js 一致；dpr 已由共享画布的 setTransform 处理。
  function resize(nextWidth, nextHeight, dpr) {
    width = nextWidth;
    height = nextHeight;
    const ratio = Math.min(dpr || window.devicePixelRatio || 1, 2);
    if (canvas) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    readGreen();
    const mobile = width <= MOBILE_WIDTH;
    const count = mobile ? 4 : 8;
    meteors = Array.from({ length: count }, () => {
      const m = spawn({});
      m.x = rng() * width;
      m.y = rng() * height;
      // Resizing while inspecting must not create new visible meteors.
      if (paused) m.delay = 1;
      return m;
    });
    if (deep) setDepth("idea", paused);
  }

  function frame(dt, motion) {
    if (!width || !height || !meteors.length) return;
    ctx.clearRect(0, 0, width, height);
    fadeElapsed = motion ? Math.min(1, fadeElapsed + dt) : 1;
    frequency = fromFrequency + (frequencyTarget - fromFrequency) * fadeElapsed;
    brightness = fromBrightness + (brightnessTarget - fromBrightness) * fadeElapsed;
    ctx.save();
    ctx.globalAlpha = brightness;
    ctx.lineCap = "round";
    for (const m of meteors) {
      if (m.delay > 0) {
        if (motion) {
          if (!paused) m.delay -= dt * frequency;
          const active = meteors.filter((other) => other !== m && other.delay <= 0).length;
          if (!paused && m.delay <= 0 && (!deep || active === 0)) spawn(m);
          else if (m.delay <= 0) m.delay = 0.1;
        }
        continue;
      }
      if (motion) {
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        if (m.y - m.len * m.dy > height || m.x - m.len * m.dx > width + 40) {
          m.delay = width <= MOBILE_WIDTH ? range(rng, 0.4, 2.5) : range(rng, 0.8, 4.5);
          continue;
        }
      }
      const tx = m.x - m.dx * m.len;
      const ty = m.y - m.dy * m.len;
      const grad = ctx.createLinearGradient(m.x, m.y, tx, ty);
      grad.addColorStop(0, m.headStop);
      grad.addColorStop(0.25, m.bodyStop);
      grad.addColorStop(1, tailColor);
      ctx.strokeStyle = grad;
      ctx.lineWidth = m.width;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      // 头部光晕 + 亮核
      ctx.fillStyle = m.haloFill;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.width * 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = m.coreFill;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.width * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** 从屏幕上方/左上方外侧重生，角度偏下斜（约 55°–80°）。 */
  function spawn(m) {
    const angle = range(rng, 55, 80) * (Math.PI / 180);
    const speed = range(rng, 160, 420);
    m.dx = Math.cos(angle);
    m.dy = Math.sin(angle);
    m.vx = m.dx * speed;
    m.vy = m.dy * speed;
    m.len = range(rng, 60, 180);
    m.width = range(rng, 1, 1.8);
    m.bright = range(rng, 0.6, 1);
    m.x = range(rng, -0.2, 0.9) * width;
    m.y = -range(rng, 10, 120);
    m.delay = 0;
    // 四个颜色串只随 bright 与主题色变化：重生时算一次，帧循环直接取。
    // 主题色只在 resize（先 readGreen 再整批重生）时变，不会出现旧串。
    m.headStop = rgba(headRgb, 0.75 * m.bright);
    m.bodyStop = rgba(baseRgb, 0.35 * m.bright);
    m.haloFill = rgba(baseRgb, 0.18 * m.bright);
    m.coreFill = rgba(headRgb, 0.95 * m.bright);
    return m;
  }

  function readGreen() {
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--green").trim();
    const n = raw.startsWith("#") ? parseInt(raw.slice(1), 16) : NaN;
    const value = Number.isNaN(n) ? 0x7ef2b0 : n;
    baseRgb = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
    headRgb = baseRgb.map((c) => Math.round(c + (255 - c) * 0.8));
    tailColor = rgba(baseRgb, 0);
  }

  function setDepth(level, popover = false) {
    const nextFrequency = level === "overview" ? 1 : level === "theme" ? 0.5 : 0.2;
    if (nextFrequency !== frequencyTarget) {
      fromFrequency = frequency;
      fromBrightness = brightness;
      fadeElapsed = 0;
    }
    deep = level !== "overview" && level !== "theme";
    frequencyTarget = level === "overview" ? 1 : level === "theme" ? 0.5 : 0.2;
    brightnessTarget = level === "overview" ? 1 : level === "theme" ? 0.7 : 0.5;
    paused = popover;
    if (deep) {
      let kept = false;
      for (const m of meteors) {
        if (m.delay > 0) continue;
        if (kept) m.delay = 1;
        kept = true;
      }
    }
  }
  return { frame, resize, setDepth };
}

function rgba(rgb, alpha) {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha.toFixed(3)})`;
}
