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
    const green = getComputedStyle(document.documentElement).getPropertyValue("--green").trim();
    if (!radius) return;

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
    const step = turn / segments;
    for (let i = 0; i < segments; i++) {
      const start = i * step;
      const distance = Math.atan2(Math.sin(start + step / 2 - angle), Math.cos(start + step / 2 - angle));
      const brightness = Math.exp(-(distance * distance) / 0.5);
      ctx.globalAlpha = 0.18 + brightness * 0.82;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, start, start + step);
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
