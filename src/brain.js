import { neuralBrainMarkup } from "./neural-art.js";

/** Canvas background: a quiet neural field behind the semantic graph. */

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ motion: boolean, reducedMotion: boolean, onIntroDone: () => void }} opts
 */
export function createBrainBackground(canvas, opts) {
  const ctx = canvas.getContext("2d");
  let w = 0;
  let h = 0;
  let dpr = 1;
  let raf = 0;
  let introT = 0;
  let introActive = !opts.reducedMotion;
  let motion = opts.motion && !opts.reducedMotion;
  let lastFrame = 0;
  const particles = [];
  const digits = [];
  const INTRO_MS = 3400;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    w = rect.width;
    h = rect.height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function seedParticles() {
    particles.length = 0;
    digits.length = 0;
    for (let i = 0; i < (motion ? 26 : 12); i++) {
      particles.push({
        a: Math.random() * Math.PI * 2,
        r: 80 + Math.random() * Math.max(w, h) * 0.6,
        sp: 0.002 + Math.random() * 0.004,
        size: 0.5 + Math.random() * 1.5,
      });
    }
    for (let i = 0; i < 7; i++) {
      digits.push({
        ch: Math.random() > 0.5 ? "1" : "0",
        a: Math.random() * Math.PI * 2,
        r: 100 + Math.random() * 400,
        sp: 0.001 + Math.random() * 0.003,
      });
    }
  }

  function frame(ts) {
    if (!introT) introT = ts;
    const elapsed = ts - introT;
    if (ts - lastFrame < 32 && raf) {
      raf = requestAnimationFrame(frame);
      return;
    }
    lastFrame = ts;
    ctx.fillStyle = "#030806";
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;

    if (introActive && elapsed >= INTRO_MS) {
      introActive = false;
      opts.onIntroDone();
    }

    const vortex = introActive ? 1 - Math.min(1, elapsed / INTRO_MS) : 0.15;

    ctx.save();
    for (const d of digits) {
      if (motion || introActive) d.a += d.sp * (1 + vortex * 4);
      const pull = introActive ? 1 - Math.min(1, elapsed / INTRO_MS) : 0.2;
      const r = d.r * (0.25 + pull * 0.75);
      const x = cx + Math.cos(d.a) * r;
      const y = cy + Math.sin(d.a) * r;
      ctx.fillStyle = `rgba(170, 220, 186, ${0.035 + pull * 0.16})`;
      ctx.font = "11px 'IBM Plex Mono', monospace";
      ctx.fillText(d.ch, x, y);
    }

    const positions = [];
    for (const p of particles) {
      if (motion || introActive) p.a += p.sp * (1 + vortex * 3);
      const r = p.r * (introActive ? 0.3 + (1 - Math.min(1, elapsed / INTRO_MS)) * 0.7 : 0.85);
      const x = cx + Math.cos(p.a) * r;
      const y = cy + Math.sin(p.a) * r;
      positions.push({ x, y });
      ctx.fillStyle = `rgba(150, 210, 170, ${0.04 + vortex * 0.12})`;
      ctx.beginPath();
      ctx.arc(x, y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineWidth = 0.6;
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i];
        const b = positions[j];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (distance > 130) continue;
        ctx.strokeStyle = `rgba(111, 213, 145, ${(0.036 * (1 - distance / 130)).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    ctx.restore();
    raf = motion || introActive ? requestAnimationFrame(frame) : 0;
  }

  function skipIntro() {
    introActive = false;
    opts.onIntroDone();
  }

  function setMotion(on) {
    motion = on && !opts.reducedMotion;
    if (!motion) seedParticles();
    if (motion && !raf) raf = requestAnimationFrame(frame);
  }

  function destroy() {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", handleResize);
  }

  function handleResize() {
    resize();
    seedParticles();
    if (!raf) frame(performance.now());
  }
  window.addEventListener("resize", handleResize);
  resize();
  seedParticles();
  raf = requestAnimationFrame(frame);

  return { skipIntro, setMotion, destroy };
}

/** @param {"full"|"sparse"} detail @param {string} variant */
export function brainMarkup(detail = "full", variant = "core") {
  return neuralBrainMarkup(detail, variant);
}
