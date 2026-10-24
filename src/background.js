/**
 * Far background layer: a faint spatial grid, slow motes and a few 0/1 glyphs.
 * Everything here stays dimmer than the graph, and it parallaxes slightly with
 * the camera so the scene feels like it sits inside a space.
 */
import { createGlow } from "./glow.js";
import { makeRng, range } from "./random.js";

export function createBackground({ canvas }) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { resize() {}, frame() {}, setMode() {}, setDepth() {} };
  const glow = createGlow(ctx);
  const rng = makeRng("background");
  let width = 0;
  let height = 0;
  let dpr = 1;
  let motes = [];
  let digits = [];
  let mode = "idle";
  let introT = 0;
  let depth = 1;
  let depthTarget = 1;
  let depthStart = 1;
  let depthElapsed = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
    glow.resize(width, height, dpr);
  }

  function seed() {
    const area = Math.max(width * height, 1);
    const moteCount = Math.round(Math.min(110, area / 11000));
    const digitCount = Math.round(Math.min(34, area / 34000));
    motes = Array.from({ length: moteCount }, () => ({
      x: rng() * width,
      y: rng() * height,
      r: range(rng, 0.4, 1.5),
      vx: range(rng, -5, 5),
      vy: range(rng, -9, -2),
      a: range(rng, 0.05, 0.22),
      depth: range(rng, 0.2, 1),
    }));
    digits = Array.from({ length: digitCount }, () => ({
      x: rng() * width,
      y: rng() * height,
      v: range(rng, -14, -4),
      a: range(rng, 0.03, 0.1),
      ch: rng() < 0.5 ? "0" : "1",
      flip: range(rng, 1.4, 5),
      t: rng() * 3,
      size: range(rng, 8, 12),
    }));
    // 稳态颜色与字号只随铺种结果变化，铺种后不变；这里算好，帧循环不再拼字符串。
    // intro 期间透明度逐帧变化，仍按帧现算，公式一字未动。
    for (const m of motes) m.fill = `rgba(150, 240, 190, ${m.a.toFixed(3)})`;
    for (const d of digits) {
      d.font = `500 ${d.size.toFixed(1)}px "DM Mono", ui-monospace, monospace`;
      d.fill = `rgba(126, 226, 172, ${d.a.toFixed(3)})`;
      d.introFill = `rgba(126, 226, 172, ${(d.a * 1.8).toFixed(3)})`;
    }
  }

  /**
   * @param {number} dt seconds
   * @param {{x:number,y:number,scale:number}} camera
   * @param {boolean} motion
   */
  function frame(dt, camera, motion, focus) {
    if (!width || !height) return;
    ctx.clearRect(0, 0, width, height);
    const cx = width / 2;
    const cy = height / 2;
    const intro = mode === "intro";

    depthElapsed = motion ? Math.min(1, depthElapsed + dt) : 1;
    depth = depthStart + (depthTarget - depthStart) * depthElapsed;
    ctx.save();
    ctx.globalAlpha = depth;
    drawGrid(camera);

    if (intro) introT += dt;

    ctx.save();
    for (const m of motes) {
      if (motion) {
        if (intro) {
          const dx = cx - m.x;
          const dy = cy - m.y;
          const d = Math.hypot(dx, dy) || 1;
          const pull = 40 + introT * 150;
          m.x += (dx / d) * pull * dt - (dy / d) * 70 * dt;
          m.y += (dy / d) * pull * dt + (dx / d) * 70 * dt;
        } else {
          m.x += m.vx * dt * m.depth;
          m.y += m.vy * dt * m.depth;
        }
        if (m.x < -10) m.x = width + 10;
        if (m.x > width + 10) m.x = -10;
        if (m.y < -10) m.y = height + 10;
        if (m.y > height + 10) m.y = -10;
      }
      ctx.fillStyle = intro
        ? `rgba(150, 240, 190, ${(m.a * Math.max(0, 1 - introT / 3.4)).toFixed(3)})`
        : m.fill;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.save();
    for (const d of digits) {
      if (motion) {
        d.y += d.v * dt;
        d.t += dt;
        if (d.t > d.flip) {
          d.t = 0;
          d.ch = d.ch === "0" ? "1" : "0";
        }
        if (d.y < -12) {
          d.y = height + 12;
          d.x = rng() * width;
        }
      }
      ctx.font = d.font;
      ctx.fillStyle = intro ? d.introFill : d.fill;
      ctx.fillText(d.ch, d.x, d.y);
    }
    ctx.restore();
    ctx.restore();
    glow.frame(dt, motion, focus);
  }

  function drawGrid(camera) {
    const step = 108 * Math.max(0.5, Math.min(camera.scale, 1.6));
    const offsetX = (-camera.x * camera.scale * 0.16) % step;
    const offsetY = (-camera.y * camera.scale * 0.16) % step;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(96, 188, 146, 0.045)";
    ctx.beginPath();
    for (let x = offsetX; x < width + step; x += step) {
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, height);
    }
    for (let y = offsetY; y < height + step; y += step) {
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(width, Math.round(y) + 0.5);
    }
    ctx.stroke();
    ctx.restore();
  }

  return {
    resize,
    frame,
    setDepth(level, popover = false) {
      const next = (level === "overview" ? 1 : level === "theme" ? 0.7 : 0.5) * (popover ? 0.5 : 1);
      if (next === depthTarget) return;
      depthStart = depth;
      depthTarget = next;
      depthElapsed = 0;
    },
    setMode(next) {
      if (mode === next) return;
      mode = next;
      introT = 0;
      if (next === "idle") seed();
    },
  };
}
