/** 黑客帝国式代码雨：稀疏下落的字符流星，头部近白绿，10–20 个字符内渐隐到透明。 */
import { makeRng, range, intRange } from "./random.js";

const KATAKANA = Array.from({ length: 0x30f6 - 0x30a1 + 1 }, (_, i) => String.fromCharCode(0x30a1 + i));
const DIGITS = Array.from({ length: 10 }, (_, i) => String(i));
const LATIN = ["A", "E", "K", "N", "R", "T", "Z"];
const MOBILE_WIDTH = 860;
const MIN_VISIBLE_ALPHA = 0.02;

export function createRain(ctx) {
  const noop = { frame() {}, resize() {} };
  if (!ctx) return noop;
  const rng = makeRng("rain");

  let width = 0;
  let height = 0;
  let font = "";
  let cell = 0;
  let flipRate = 0.3;
  let baseRgb = [126, 242, 176];
  let headRgb = [229, 253, 239];
  let drops = [];

  // 接口与 glow.js 一致；dpr 已由共享画布的 setTransform 处理，这里不单独使用。
  function resize(nextWidth, nextHeight, dpr) {
    width = nextWidth;
    height = nextHeight;
    const mobile = width <= MOBILE_WIDTH;
    const fontSize = mobile ? 12 : 13;
    cell = Math.round(fontSize * 1.3);
    font = `500 ${fontSize}px ui-monospace, monospace`;
    flipRate = mobile ? 0.15 : 0.3;
    readGreen();
    const count = mobile
      ? Math.min(8, Math.max(4, Math.round(width / 80)))
      : Math.min(28, Math.max(18, Math.round(width / 70)));
    drops = Array.from({ length: count }, () => spawn({}, rng() * height));
  }

  function frame(dt, motion) {
    if (!width || !height || !drops.length) return;
    ctx.save();
    ctx.font = font; // 每帧只设一次
    ctx.textAlign = "center";
    for (const drop of drops) {
      if (drop.delay > 0) {
        if (motion) {
          drop.delay -= dt;
          if (drop.delay <= 0) spawn(drop, -(cell + rng() * 60));
        }
        continue;
      }
      if (motion) {
        drop.y += drop.speed * dt;
        // 每列每帧最多变一个字符，避免对每个字符掷骰。
        if (rng() < drop.chars.length * flipRate * dt) {
          drop.chars[intRange(rng, 0, drop.chars.length - 1)] = pickChar();
        }
        if (drop.y - drop.chars.length * cell > height) {
          drop.delay = range(rng, 0.6, 4.2);
          continue;
        }
      }
      for (let i = 0; i < drop.chars.length; i++) {
        const y = drop.y - i * cell;
        if (y < -cell || y > height) continue;
        ctx.fillStyle = drop.colors[i];
        ctx.fillText(drop.chars[i], drop.x, y);
      }
    }
    ctx.restore();
  }

  /** 落完一屏后随机延迟，再在新 x 重生；颜色串与字符在这里预算好。 */
  function spawn(drop, y) {
    drop.x = rng() * width;
    drop.y = y;
    drop.speed = range(rng, 60, 140);
    drop.delay = 0;
    const tail = intRange(rng, 10, 20);
    const headAlpha = range(rng, 0.35, 0.45);
    const tailAlpha = range(rng, 0.12, 0.18);
    drop.colors = [rgba(headRgb, headAlpha)];
    for (let i = 1; i <= tail; i++) {
      const alpha = tailAlpha * Math.pow(1 - i / tail, 1.35);
      if (alpha < MIN_VISIBLE_ALPHA) break;
      drop.colors.push(rgba(baseRgb, alpha));
    }
    drop.chars = drop.colors.map(pickChar);
    return drop;
  }

  function pickChar() {
    const roll = rng();
    const pool = roll < 0.7 ? KATAKANA : roll < 0.9 ? DIGITS : LATIN;
    return pool[(rng() * pool.length) | 0];
  }

  function readGreen() {
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--green").trim();
    const n = raw.startsWith("#") ? parseInt(raw.slice(1), 16) : NaN;
    const value = Number.isNaN(n) ? 0x7ef2b0 : n;
    baseRgb = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
    // 头部向白色提亮八成，得到"接近白的绿"而不是纯白。
    headRgb = baseRgb.map((c) => Math.round(c + (255 - c) * 0.8));
  }

  return { frame, resize };
}

function rgba(rgb, alpha) {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha.toFixed(3)})`;
}
