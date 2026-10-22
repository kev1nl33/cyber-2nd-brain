/** 日期只决定回放次序，不改写原始步骤链。 */
export function datedSteps(steps) {
  return steps.filter((step) => {
    if (typeof step.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(step.date)) return false;
    const time = Date.parse(step.date);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === step.date;
  }).sort((a, b) => a.date.localeCompare(b.date));
}

export function createReplayController({ onSelect, onChange = () => {} }) {
  let context = null;
  let steps = [];
  let index = -1;
  let playing = false;
  let motion = true;
  let elapsed = 0;

  function pause() {
    const wasPlaying = playing;
    playing = false;
    elapsed = 0;
    onChange();
    return wasPlaying;
  }

  function select(next, played) {
    index = Math.max(0, Math.min(next, steps.length - 1));
    if (index === steps.length - 1) playing = false;
    onSelect(steps[index], played);
    onChange();
  }

  return {
    setContext(key, next) {
      if (key === context) return;
      pause();
      context = key;
      steps = datedSteps(next);
      index = -1;
      onChange();
    },
    setMotion(on) {
      motion = Boolean(on);
      if (!motion) pause();
      else onChange();
    },
    play() {
      if (!motion || !steps.length) return false;
      playing = true;
      elapsed = 0;
      if (index < 0 || index === steps.length - 1) select(0, true);
      else onChange();
      return true;
    },
    pause,
    seek(next) {
      pause();
      if (steps.length && Number.isFinite(next)) select(Math.round(next), false);
    },
    syncSelected(id) {
      const next = steps.findIndex((step) => step.id === id);
      if (next === index) return;
      index = next;
      onChange();
    },
    tick(dt) {
      if (!playing) return;
      elapsed += dt;
      if (elapsed + 1e-9 < 0.8) return;
      elapsed %= 0.8;
      select(index + 1, true);
    },
    get steps() { return steps; },
    get index() { return index; },
    get playing() { return playing; },
    get motion() { return motion; },
  };
}

/** 原生 range 同时支持拖动、触屏和键盘定位。 */
export function createReplay({ host, onSelect }) {
  const el = document.createElement("div");
  el.className = "replay";
  el.hidden = true;
  el.setAttribute("role", "group");
  el.setAttribute("aria-label", "思考回放");
  el.innerHTML = `<button type="button" class="replay-play" aria-label="播放思考回放">播放</button>
    <input class="replay-range" type="range" min="0" max="0" value="0" step="1" aria-label="思考回放进度" />
    <output class="replay-date"></output>`;
  host.appendChild(el);
  const button = el.querySelector("button");
  const range = el.querySelector("input");
  const date = el.querySelector("output");
  let timer = null;
  const tick = () => { if (!document.hidden) controller.tick(0.05); };
  const stopTimer = () => { if (timer !== null) { clearInterval(timer); timer = null; } };
  const startTimer = () => { stopTimer(); timer = setInterval(tick, 50); };
  let controller = null;
  controller = createReplayController({
    onSelect,
    onChange() {
      update();
      if (controller.playing) startTimer();
      else stopTimer();
    },
  });

  function update() {
    const { steps, index, playing, motion } = controller;
    el.hidden = !steps.length;
    button.disabled = !motion;
    button.textContent = playing ? "暂停" : "播放";
    button.setAttribute("aria-label", playing ? "暂停思考回放" : "播放思考回放");
    button.setAttribute("aria-pressed", String(playing));
    button.title = motion ? "每 0.8 秒回看一步，Esc 暂停" : "已减少动态效果，请拖动时间条回看";
    range.max = String(Math.max(0, steps.length - 1));
    range.value = String(Math.max(0, index));
    const step = steps[Math.max(0, index)];
    range.setAttribute("aria-valuetext", step ? `${step.date}，${step.label || step.id}` : "");
    date.textContent = step ? `${step.date} · ${Math.max(0, index) + 1}/${steps.length}` : "";
  }

  button.addEventListener("click", () => { controller.playing ? controller.pause() : controller.play(); });
  range.addEventListener("pointerdown", () => controller.pause());
  range.addEventListener("pointerup", () => controller.seek(Number(range.value)));
  range.addEventListener("keydown", (event) => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
      controller.seek(Number(range.value));
    }
  });
  range.addEventListener("input", () => controller.seek(Number(range.value)));
  for (const type of ["pointerdown", "click", "wheel"]) {
    el.addEventListener(type, (event) => event.stopPropagation());
  }
  return controller;
}
