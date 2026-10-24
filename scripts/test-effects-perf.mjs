#!/usr/bin/env node
/** 效果层性能及第五期视觉行为测试：stars / background / rain / glow。
 *
 * 思路：用零依赖的假 DOM 和假 Canvas 记录器驱动四个模块跑一段固定脚本，
 * 把全部可观察输出（绘制调用 + 快照状态）哈希成 golden digest。
 * 改动前后各跑一次，摘要必须一致 ⇒ 像素与行为没变。
 * 另外单独断言性能性质（视口没变时 stars 帧循环零写入）和 a11y 性质。
 * 运行：node scripts/test-effects-perf.mjs；打印摘要：node scripts/test-effects-perf.mjs --digest
 * 不读 private-data，不联网，不起浏览器。 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// --------------------------------------------------------------- 计数器

/** perf 断言用的写入计数：style.transform 与 path d。digest 不含这些数。 */
const counters = { styleTransform: 0, pathD: 0, getComputedStyle: 0 };
const resetCounters = () => {
  counters.styleTransform = 0;
  counters.pathD = 0;
  counters.getComputedStyle = 0;
};

// --------------------------------------------------------------- 假 DOM

class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.attrs = {};
    this.tokens = new Set();
    this.dataset = {};
    this.children = [];
    this.parentNode = null;
    this.listeners = {};
    this.type = "";
    this._html = "";
    const self = this;
    this.style = new Proxy(
      {},
      {
        set(target, key, value) {
          if (key === "transform") counters.styleTransform++;
          target[key] = value;
          return true;
        },
        get(target, key) {
          return target[key];
        },
      }
    );
    this.classList = makeClassList(this);
  }
  get className() {
    return this.attrs.class || "";
  }
  set className(value) {
    this.setClass(String(value));
  }
  setClass(value) {
    this.attrs.class = value;
    this.tokens = new Set(value.split(/\s+/).filter(Boolean));
  }
  setAttribute(key, value) {
    if (key === "d") counters.pathD++;
    this.attrs[key] = String(value);
    if (key === "class") this.setClass(String(value));
  }
  getAttribute(key) {
    return key in this.attrs ? this.attrs[key] : null;
  }
  set innerHTML(value) {
    this._html = String(value);
  }
  get innerHTML() {
    return this._html;
  }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }
  dispatch(type, event = {}) {
    event.stopPropagation ||= () => {};
    event.preventDefault ||= () => {};
    for (const fn of this.listeners[type] || []) fn(event);
  }
  closest(selector) {
    if (!selector.startsWith(".")) return null;
    const cls = selector.slice(1);
    for (let node = this; node; node = node.parentNode) {
      if (node.tokens?.has(cls)) return node;
    }
    return null;
  }
}

function makeClassList(el) {
  const sync = () => {
    el.attrs.class = [...el.tokens].join(" ");
  };
  return {
    add(...classes) {
      for (const c of classes) el.tokens.add(c);
      sync();
    },
    remove(...classes) {
      for (const c of classes) el.tokens.delete(c);
      sync();
    },
    contains: (c) => el.tokens.has(c),
    toggle(cls, force) {
      const on = force === undefined ? !el.tokens.has(cls) : Boolean(force);
      if (on) el.tokens.add(cls);
      else el.tokens.delete(cls);
      sync();
      return on;
    },
  };
}

/** 顶栏/底栏高度可变，模拟 measureInsets 只改 --inset-* 不触发 resize 的情形。 */
const insetState = { top: 56, bottom: 52 };

const windowListeners = [];
const documentListeners = [];

const fakeWindow = {
  innerWidth: 1440,
  innerHeight: 900,
  devicePixelRatio: 2,
  addEventListener(type) {
    windowListeners.push(type);
  },
};

const fakeDocumentElement = new FakeElement("html");
const fakeDocument = {
  createElement: (tag) => (tag.toLowerCase() === "canvas" ? new FakeCanvas() : new FakeElement(tag)),
  createElementNS: (_ns, tag) => new FakeElement(tag),
  documentElement: fakeDocumentElement,
  addEventListener(type) {
    documentListeners.push(type);
  },
};

globalThis.window = fakeWindow;
globalThis.document = fakeDocument;
globalThis.getComputedStyle = (_el) => ({
  getPropertyValue(name) {
    counters.getComputedStyle++;
    if (name === "--inset-top") return `${insetState.top}px`;
    if (name === "--inset-bottom") return `${insetState.bottom}px`;
    if (name === "--green") return "#7ef2b0";
    return "";
  },
});

// --------------------------------------------------------------- 假 Canvas

class Gradient {
  constructor(kind, args) {
    this.kind = kind;
    this.args = args;
    this.stops = [];
  }
  addColorStop(offset, color) {
    this.stops.push([offset, color]);
  }
  toJSON() {
    return { kind: this.kind, args: this.args, stops: this.stops };
  }
}

let canvasSeq = 0;

class FakeCanvas {
  constructor() {
    this.id = `canvas${++canvasSeq}`;
    this.width = 0;
    this.height = 0;
    this.clientWidth = 0;
    this.clientHeight = 0;
    this.ops = [];
    this._ctx = null;
  }
  getContext() {
    if (!this._ctx) this._ctx = new FakeCtx(this);
    return this._ctx;
  }
}

/** 状态只在绘制原语落地时快照，纯赋值不记录：冗余赋值不影响摘要。 */
class FakeCtx {
  constructor(canvas) {
    this.canvas = canvas;
    this.fillStyle = "#000";
    this.strokeStyle = "#000";
    this.lineWidth = 1;
    this.font = "10px sans-serif";
    this.globalAlpha = 1;
    this.lineCap = "butt";
    this.transform = [1, 0, 0, 1, 0, 0];
    this._stack = [];
  }
  _push(op) {
    this.canvas.ops.push(op);
  }
  _paintState() {
    return {
      fill: this.fillStyle instanceof Gradient ? this.fillStyle : this.fillStyle,
      alpha: this.globalAlpha,
      transform: this.transform,
    };
  }
  save() {
    this._stack.push({
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
      font: this.font,
      globalAlpha: this.globalAlpha,
      lineCap: this.lineCap,
      transform: [...this.transform],
    });
    this._push(["save"]);
  }
  restore() {
    Object.assign(this, this._stack.pop());
    this._push(["restore"]);
  }
  setTransform(a, b, c, d, e, f) {
    this.transform = [a, b, c, d, e, f];
    this._push(["setTransform", this.transform]);
  }
  clearRect(x, y, w, h) {
    this._push(["clearRect", [x, y, w, h], this.transform]);
  }
  fillRect(x, y, w, h) {
    this._push(["fillRect", [x, y, w, h], this._paintState()]);
  }
  beginPath() {
    this._push(["beginPath"]);
  }
  moveTo(x, y) {
    this._push(["moveTo", [x, y]]);
  }
  lineTo(x, y) {
    this._push(["lineTo", [x, y]]);
  }
  arc(x, y, r, from, to) {
    this._push(["arc", [x, y, r, from, to]]);
  }
  fill() {
    this._push(["fill", [], this._paintState()]);
  }
  stroke() {
    this._push([
      "stroke",
      [],
      {
        stroke: this.strokeStyle,
        width: this.lineWidth,
        cap: this.lineCap,
        alpha: this.globalAlpha,
        transform: this.transform,
      },
    ]);
  }
  fillText(text, x, y) {
    this._push(["fillText", [text, x, y], { font: this.font, ...this._paintState() }]);
  }
  drawImage(image, ...args) {
    this._push(["drawImage", [image.id, hash(image.ops), args], this._paintState()]);
  }
  createLinearGradient(...args) {
    return new Gradient("linear", args);
  }
  createRadialGradient(...args) {
    return new Gradient("radial", args);
  }
}

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

// --------------------------------------------------------------- 固定数据与场景

const PATTERNS = [
  { id: "p-system", name: "把重复的事自动化" },
  { id: "p-first", name: "第一性原理" },
  { id: "p-ship", name: "先交付再打磨" },
  { id: "p-focus", name: "一次只做一件事" },
  { id: "p-honest", name: "真实判断" },
  { id: "p-extra", name: "多出来的模式" },
];
const LESSONS = [
  { id: "l-1", text: "重复三遍的事写成脚本", status: "confirmed", patternIds: ["p-system"] },
  { id: "l-2", text: "回到问题本质再选方案", status: "confirmed", patternIds: ["p-first"] },
  { id: "l-3", text: "先跑起来再优化", status: "confirmed", patternIds: ["p-ship"] },
  { id: "l-4", text: "不开会，写文档", status: "confirmed", patternIds: [] },
  { id: "l-5", text: "改完立刻跑验证", status: "confirmed", patternIds: ["p-focus"] },
  { id: "l-6", text: "方案有问题直接说", status: "confirmed", patternIds: ["p-honest"] },
  { id: "l-7", text: "密钥不进代码", status: "pending", patternIds: ["p-system", "p-first"] },
  { id: "l-8", text: "结论先行", status: "confirmed", patternIds: ["p-ship"] },
  { id: "l-9", text: "没有规范不动手", status: "confirmed", patternIds: [] },
  { id: "l-10", text: "系统承担复杂性", status: "confirmed", patternIds: ["p-focus"] },
  { id: "l-11", text: "渐进式展示", status: "pending", patternIds: ["p-extra"] },
];

const digestMode = process.argv.includes("--digest");

const results = { failures: 0 };
function check(cond, msg) {
  if (cond) {
    console.log(`ok: ${msg}`);
  } else {
    console.error(`FAIL: ${msg}`);
    results.failures++;
  }
}

// --------------------------------------------------------------- 跑场景

const { createRain } = await import("../src/rain.js");
const { createBackground } = await import("../src/background.js");
const { createStars } = await import("../src/stars.js");

/** 相机轨迹固定：覆盖缩放夹取两段、正负平移（网格取模的正负分支）。 */
function camAt(i, camera) {
  camera.x = 1500 * Math.sin(i / 11);
  camera.y = 1200 * Math.cos(i / 5);
  camera.scale = 0.4 + 1.8 * (0.5 + 0.5 * Math.sin(i / 7));
  return camera;
}

// -- rain：桌面 → 静止 → 手机；600 帧覆盖多次出场与重生（rng 顺序进 digest）。
const rainCanvas = new FakeCanvas();
const rain = createRain(rainCanvas.getContext());
rain.resize(1440, 900, 2);
for (let i = 0; i < 600; i++) rain.frame(0.05, true);
for (let i = 0; i < 10; i++) rain.frame(0.05, false);
rain.resize(390, 844, 1);
for (let i = 0; i < 300; i++) rain.frame(0.05, true);

// -- background（内含 glow）：空闲 → intro 拉拽 → 空闲 → reduced-motion → 手机。
const bgCanvas = new FakeCanvas();
bgCanvas.clientWidth = 1440;
bgCanvas.clientHeight = 900;
const background = createBackground({ canvas: bgCanvas });
const camera = { x: 0, y: 0, scale: 1 };
background.resize();
for (let i = 0; i < 60; i++) background.frame(0.05, camAt(i, camera), true, { x: 500, y: 300, radius: 120, role: "core" });
background.setMode("intro");
for (let i = 0; i < 80; i++) background.frame(0.05, camAt(i, camera), true);
background.setMode("idle");
for (let i = 0; i < 40; i++) background.frame(0.05, camAt(i, camera), true);
for (let i = 0; i < 4; i++) background.frame(0, camAt(i, camera), false);
bgCanvas.clientWidth = 390;
bgCanvas.clientHeight = 844;
fakeWindow.devicePixelRatio = 1;
background.resize();
for (let i = 0; i < 40; i++) background.frame(0.05, camAt(i, camera), true);

// -- stars：帧循环 → 视口变化 → 顶栏高度变化 → 悬停/点击/打开/锚点。
fakeWindow.innerWidth = 1440;
fakeWindow.innerHeight = 900;
fakeWindow.LESSONS = { lessons: LESSONS, patterns: PATTERNS };

const starsLayer = new FakeElement("div");
starsLayer.setClass("stars");
const starsSvg = new FakeElement("svg");
const opened = [];
const stars = createStars({
  layer: starsLayer,
  svg: starsSvg,
  onOpen: (payload) => opened.push(payload),
});

const perf = {};
resetCounters();
stars.frame(); // 第一帧：全部写入
perf.firstFrameWrites = counters.styleTransform;
perf.firstFrameD = counters.pathD;
resetCounters();
stars.frame(); // 视口没变：应当零写入
perf.idleWrites = counters.styleTransform;
perf.idleD = counters.pathD;
perf.idleGetCS = counters.getComputedStyle;
stars.frame();
fakeWindow.innerWidth = 1200;
fakeWindow.innerHeight = 800;
resetCounters();
stars.frame(); // 视口变了：全部重写
perf.resizeWrites = counters.styleTransform;
perf.resizeGetCS = counters.getComputedStyle;
insetState.top = 72;
resetCounters();
stars.frame(); // 只改 --inset-top（不触发 window resize 的那条路径）
perf.insetWrites = counters.styleTransform;
insetState.top = 56;
stars.frame();

// 悬停点亮一片：主星 + 该片经验星 + 连到主星的线。
const patternEl = starsLayer.children.find((el) => el.dataset.pattern === "p-system");
starsLayer.dispatch("pointerover", { target: patternEl });
const hotPhase = snapshotStars();
starsLayer.dispatch("pointerout", { target: patternEl, relatedTarget: null });
const coldPhase = snapshotStars();

// 点击经验星 → onOpen；setOpen → is-open。
const lessonEl = starsLayer.children.find((el) => el.dataset.pattern === "p-system" && el !== patternEl);
lessonEl.dispatch("click", { target: lessonEl });
stars.setOpen("l-1");
const openPhase = snapshotStars();

const anchors = {
  pattern: stars.anchorOf("p-system"),
  lesson: stars.anchorOf("l-1"),
  missing: stars.anchorOf("nope"),
};
const returned = stars.starElement("l-1") === lessonEl;

// -- noop 分支：星表为空时页面照常工作，不建任何节点。
fakeWindow.LESSONS = { lessons: [], patterns: [] };
const emptyLayer = new FakeElement("div");
const emptyStars = createStars({ layer: emptyLayer, svg: new FakeElement("svg"), onOpen: () => {} });
emptyStars.frame();
const noopOk = emptyStars.enabled === false && emptyLayer.children.length === 0;

// --------------------------------------------------------------- 摘要与断言

function normalizeAria(label) {
  // 今日一星前缀随日期变，结构断言另行覆盖；摘要里归一掉保证跨天稳定。
  return label ? label.replace(/^今日一星：/, "经验：") : label;
}

function snapshotStars() {
  const marks = starsLayer.children.map((el) => ({
    tag: el.tagName,
    type: el.type || null,
    classes: [...el.tokens].filter((c) => c !== "is-daily").sort(),
    aria: normalizeAria(el.getAttribute("aria-label")),
    ariaHidden: el.getAttribute("aria-hidden"),
    pattern: el.dataset.pattern || null,
    pending: el.dataset.pending || null,
    magnitude: el.dataset.magnitude || null,
    transform: el.style.transform,
  }));
  const paths = starsSvg.children.flatMap((group) => group.children).map((path) => ({
    classes: [...path.tokens].sort(),
    d: path.getAttribute("d"),
  }));
  return { marks, paths };
}

const visualPayload = { rain: rainCanvas.ops, background: bgCanvas.ops };

// Phase 5 behavior checks are independent of the visual digest.
const { createGlow } = await import("../src/glow.js");
const haloCanvas = new FakeCanvas();
const halo = createGlow(haloCanvas.getContext());
halo.resize(1440, 900, 2);
halo.frame(0, false, { x: 200, y: 300, radius: 80, role: "idea-active" });
const haloArcs = haloCanvas.ops.filter((op) => op[0] === "arc");
check(haloArcs.length === 48 && haloArcs.every((op) => op[1][0] === 200 && op[1][1] === 300 && op[1][2] === 80), "static halo uses supplied screen center and radius");
halo.frame(0, false, { x: 420, y: 180, radius: 64, role: "idea-active" });
check(haloCanvas.ops.filter((op) => op[0] === "arc").at(-1)[1][0] === 420, "motion off follows camera immediately");
const blit = haloCanvas.ops.filter((op) => op[0] === "drawImage").at(-1);
check(blit[2].alpha === 0.6, "idea halo is attenuated to 0.6");
const textureHash = blit[1][1];
halo.resize(390, 844, 1);
halo.frame(0.05, true, { x: 520, y: 180, radius: 64, role: "core" });
const smoothX = haloCanvas.ops.filter((op) => op[0] === "arc").at(-1)[1][0];
check(Math.abs(smoothX - (420 + 100 * (1 - Math.exp(-0.05 / 0.17)))) < 1e-9, "halo low-pass uses EASE_TAU");
check(haloCanvas.ops.filter((op) => op[0] === "drawImage").at(-1)[1][1] === textureHash, "unit texture survives resize without rebuilding gradients");
background.setDepth("idea", true);
bgCanvas.ops = [];
background.frame(0, camera, false, null);
check(bgCanvas.ops.some((op) => op[0] === "fillText" && op[2].alpha === 0.25), "reduced motion depth snaps background to idea × popover 0.25");
stars.setDepth("theme");
check(starsLayer.style.opacity === "0.8", "theme stars use 0.8 brightness");
stars.setDepth("idea", true);
check(starsLayer.style.opacity === "0.3", "idea popover stars use 0.6 × 0.5");
rain.setDepth("idea");
let maxMeteors = 0;
for (let i = 0; i < 200; i++) {
  rainCanvas.ops = [];
  rain.frame(0.05, true);
  maxMeteors = Math.max(maxMeteors, rainCanvas.ops.filter((op) => op[0] === "lineTo").length);
}
check(maxMeteors <= 1, "idea layer has at most one meteor across ten simulated seconds");
rain.setDepth("idea", true);
for (let i = 0; i < 200; i++) rain.frame(0.05, true);
rainCanvas.ops = [];
rain.frame(0.05, true);
check(!rainCanvas.ops.some((op) => op[0] === "lineTo"), "popover stops new meteors after current one exits");

const sceneSource = readFileSync(new URL("../src/scene.js", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
check(sceneSource.includes('gradient.setAttribute("gradientUnits", "userSpaceOnUse")') && sceneSource.includes('[[0, 0.4], [1, 1]]'), "main-line gradient uses user-space 0.4-to-1 opacity");
check(sceneSource.includes('edge.kind === "recorded" || edge.kind === "inferred"') && sceneSource.includes('line.style.stroke = `url(#${gradientId})`'), "only main-line kinds get gradients, inline stroke survives CSS selection rules");
check(["x1", "y1", "x2", "y2"].every((attr) => sceneSource.includes(`view.gradient.setAttribute("${attr}"`)), "gradient endpoints update with curve endpoints");
check(/\.edge\.is-dim\s*\{\s*opacity: 0\.35/.test(cssSource) && appSource.includes("const path = focusPath(limit)"), "selection reuses focusPath prefix and dims future edges to 0.35");

const digestPayload = {
  rain: visualPayload.rain,
  background: visualPayload.background,
  stars: { hot: hotPhase, cold: coldPhase, open: openPhase, opened, anchors },
};
const digest = createHash("sha256").update(JSON.stringify(digestPayload)).digest("hex");

if (digestMode) {
  console.log(digest);
  process.exit(0);
}

/** 改动前用 --digest 生成并固化：效果层任何像素、时序、随机数顺序的变化都会让它失配。 */
const GOLDEN_DIGEST = "af8ab15a4d499ef7ad551c8c8e21942830d0e5ae1b6034c70e9b3aa1a6037fc1";

check(digest === GOLDEN_DIGEST, `phase 5 golden digest（${digest.slice(0, 12)}…）`);

// —— 性质：视口未变时帧循环不做重复布局写入 ——
// 注：计数器在 getPropertyValue 里，一次 canvasBox() 读 --inset-top/bottom 共 2 次。
// 改动前每帧是「星点数 × 2」次（本场景 44 次）。
check(perf.firstFrameWrites === 22, `首帧写满 ${perf.firstFrameWrites} 个 transform（应 22）`);
check(perf.firstFrameD === 4, `首帧写 ${perf.firstFrameD} 条星座线（应 4）`);
check(perf.idleWrites === 0, `视口未变的帧零 transform 写入（实际 ${perf.idleWrites}）`);
check(perf.idleD === 0, `视口未变的帧零 d 写入（实际 ${perf.idleD}）`);
check(perf.idleGetCS <= 2, `视口未变的帧只算一次盒（≤2 次属性读取，实际 ${perf.idleGetCS}）`);
check(perf.resizeWrites === 22, `视口变化后整批重写（实际 ${perf.resizeWrites}）`);
check(perf.resizeGetCS <= 2, `重排帧只算一次盒（≤2 次属性读取，实际 ${perf.resizeGetCS}）`);
check(perf.insetWrites === 22, `--inset-* 变化被检测到并整批重写（实际 ${perf.insetWrites}）`);

// —— a11y：可点星是带 aria-label 的真按钮，装饰星对辅助技术不可见 ——
const buttons = starsLayer.children.filter((el) => el.tagName === "BUTTON");
check(buttons.length === 16, `主星+经验星共 ${buttons.length} 个 button（应 16）`);
check(
  buttons.every((el) => el.type === "button" && Boolean(el.getAttribute("aria-label"))),
  "每个可点星都是 type=button 且有 aria-label"
);
check(
  buttons.every((el) => el.innerHTML.includes('aria-hidden="true"')),
  "按钮内的星形 glyph 标了 aria-hidden"
);
const fields = starsLayer.children.filter((el) => el.tagName === "SPAN");
check(fields.length === 6, `辅星共 ${fields.length} 个 span（应 6）`);
check(fields.every((el) => el.getAttribute("aria-hidden") === "true"), "辅星全部 aria-hidden");
const daily = starsLayer.children.filter(
  (el) => (el.getAttribute("aria-label") || "").startsWith("今日一星：")
);
check(daily.length === 1 && daily[0].classList.contains("is-daily"), "恰好一颗今日一星，且带 is-daily");
check(
  starsLayer.children.every((el) => el.getAttribute("aria-label") === null || !/undefined|null/.test(el.getAttribute("aria-label"))),
  "aria-label 里没有 undefined/null 字样"
);

// —— 交互行为 ——
check(
  opened.length === 1 && opened[0].kind === "lesson" && opened[0].id === "l-1",
  "点击经验星触发 onOpen({kind:'lesson', id:'l-1'})"
);
check(
  openPhase.marks.filter((m) => m.classes.includes("is-open")).length === 1,
  "setOpen 后恰好一颗 is-open"
);
const hotCount = hotPhase.marks.filter((m) => m.classes.includes("is-hot")).length;
check(hotCount === 3, `悬停点亮整片（主星+2 颗经验星），实际 ${hotCount}`);
check(
  hotPhase.paths.filter((p) => p.classes.includes("is-hot")).length === 1 &&
    coldPhase.paths.every((p) => !p.classes.includes("is-hot")),
  "悬停点亮连到主星的 1 条线，移出后全灭"
);
check(
  coldPhase.marks.every((m) => !m.classes.includes("is-hot")),
  "pointerout 后 is-hot 清空"
);
check(
  Number.isFinite(anchors.pattern?.x) && anchors.pattern.r === 8 && anchors.lesson.r === 5 && anchors.missing === null,
  "anchorOf 返回有限坐标与正确半径，未知 id 返回 null"
);
check(returned, "starElement 返回同一个 DOM 节点");
check(noopOk, "星表为空时走 noop 分支，不建节点");
check(
  windowListeners.length === 0 && documentListeners.length === 0,
  "效果层不往 window/document 挂监听器"
);
check(
  starsSvg.children.length === 1 && starsSvg.children[0].children.length === 4,
  "星座线组里 4 条 path，无游离节点"
);

if (results.failures) {
  console.error(`\n${results.failures} 项失败`);
  process.exit(1);
}
console.log("\neffects-perf: 全部通过");
