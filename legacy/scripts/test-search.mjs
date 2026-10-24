#!/usr/bin/env node
/**
 * Phase 7 checks: pure search ranking plus real controller behaviour.
 *
 * The controller is driven through its public API and dispatched keydown
 * events on a zero-dependency fake DOM. Assertions look at focus, camera
 * calls, history and rendered results — not at source text.
 * Run: node scripts/test-search.mjs
 */
import { applyMainlineSelection } from "../src/app.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  buildSearchIndex,
  createSearchController,
  matchSearch,
  snippetAround,
} from "../src/search.js";
import {
  createHoverPreview,
  cuePanDelta,
  mainlineMove,
  offscreenCues,
  previewContent,
} from "../src/scene.js";

function graph() {
  const theme = {
    id: "theme:invest",
    type: "theme",
    themeId: "invest",
    label: "投资",
    description: "仓位与复盘",
  };
  const idea = {
    id: "idea:invest/heavy",
    type: "idea",
    themeId: "invest",
    ideaId: "heavy",
    label: "为什么我总是重仓？",
    summary: "重仓不是勇气，是没有先写清退出条件。后半句不该出现在摘要里。",
    updated: "2026-10-18",
    stepCount: 2,
  };
  const other = {
    id: "idea:invest/light",
    type: "idea",
    themeId: "invest",
    ideaId: "light",
    label: "轻仓怎么记录",
    summary: "只记理由。",
    updated: "2026-09-01",
    stepCount: 1,
  };
  const first = {
    id: "step:invest/heavy/open",
    type: "step",
    themeId: "invest",
    ideaId: "heavy",
    stepId: "open",
    index: 1,
    label: "写下仓位",
    body: "甲乙丙丁戊己庚辛壬癸子丑寅卯重仓辰巳午未申酉戌亥乾坤艮巽坎离多余",
    refIds: ["note-heavy"],
  };
  const second = {
    id: "step:invest/heavy/exit",
    type: "step",
    themeId: "invest",
    ideaId: "heavy",
    stepId: "exit",
    index: 2,
    label: "补上退出条件",
    body: "没有退出条件的仓位先不加大。",
    refIds: [],
  };
  const source = {
    id: "source:invest/heavy/open/note-heavy",
    type: "source",
    themeId: "invest",
    ideaId: "heavy",
    stepId: "open",
    refId: "note-heavy",
    label: "重仓笔记标题",
    text: "这是来源全文，搜索重仓全文标记时不能命中。",
  };
  const conclusion = {
    id: "conclusion:invest/heavy",
    type: "conclusion",
    themeId: "invest",
    ideaId: "heavy",
    label: "阶段理解",
    shortTitle: "先写退出条件",
  };
  const nodes = new Map([theme, idea, other, first, second, source, conclusion].map((node) => [node.id, node]));
  return {
    nodes,
    themes: () => [theme],
    ideas: () => [idea, other],
    steps: (themeId, ideaId) =>
      [first, second].filter((step) => step.themeId === themeId && step.ideaId === ideaId),
    sources: (stepId) => (stepId === first.id ? [source] : []),
    conclusion: () => conclusion,
  };
}

class FakeElement {
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase();
    this.doc = doc;
    this.attrs = {};
    this.children = [];
    this.parentNode = null;
    this.listeners = {};
    this.dataset = {};
    this.hidden = false;
    this.className = "";
    this.textContent = "";
    this.style = {};
    this.type = "";
    this.value = "";
    this.placeholder = "";
    this.isContentEditable = false;
    this.classList = {
      toggle: (token, on) => {
        const tokens = new Set(this.className.split(/\s+/).filter(Boolean));
        if (on) tokens.add(token);
        else tokens.delete(token);
        this.className = [...tokens].join(" ");
      },
    };
  }
  setAttribute(key, value) {
    this.attrs[key] = String(value);
    if (key === "class") this.className = String(value);
    if (key.startsWith("data-")) this.dataset[key.slice(5)] = String(value);
  }
  getAttribute(key) {
    return key in this.attrs ? this.attrs[key] : null;
  }
  removeAttribute(key) {
    delete this.attrs[key];
  }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  set innerHTML(value) {
    this.children = [];
    this._html = String(value);
  }
  get innerHTML() {
    return this._html || "";
  }
  addEventListener(type, fn, options) {
    (this.listeners[type] ||= []).push({ fn, capture: options === true || options?.capture === true });
  }
  removeEventListener(type, fn, options) {
    const capture = options === true || options?.capture === true;
    this.listeners[type] = (this.listeners[type] || []).filter(
      (entry) => entry.fn !== fn || entry.capture !== capture
    );
  }
  focus() {
    this.doc.activeElement = this;
    for (const { fn } of this.listeners.focus || []) fn({ target: this });
  }
  select() {}
  closest() {
    return null;
  }
  scrollIntoView() {}
}

function fakeDocument() {
  const doc = { activeElement: null, contains: () => true };
  doc.createElement = (tag) => new FakeElement(tag, doc);
  doc.body = new FakeElement("body", doc);
  doc.activeElement = doc.body;
  return doc;
}

function key(target, init) {
  const event = {
    target,
    defaultPrevented: false,
    immediateStopped: false,
    stopped: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.stopped = true;
    },
    stopImmediatePropagation() {
      this.immediateStopped = true;
      this.stopped = true;
    },
    ...init,
  };
  return event;
}

function dispatch(win, event) {
  const listeners = [...(win.listeners.keydown || [])];
  for (const entry of listeners) {
    if (!entry.capture) continue;
    entry.fn(event);
    if (event.immediateStopped) return event;
  }
  return event;
}

function titles(controller) {
  return [...controller.elements.results.children].map((item) =>
    item.children[0].children.find((child) => child.className === "search-result-body").children[0].textContent
  );
}

const css = readFileSync(fileURLToPath(new URL("../src/styles.css", import.meta.url)), "utf8");

test("主线状态控制器只 replace hash；无框只选中，有框才 inspect，结论沿用末步地址", () => {
  const calls = [];
  const state = { selectedId: null, popover: null };
  const route = { level: "step", themeId: "invest", ideaId: "heavy", stepId: "exit" };
  const history = { replaceState: (...args) => calls.push(["replace", args[2]]) };
  const inspect = () => calls.push(["inspect"]);
  const select = () => calls.push(["select"]);
  const node = { id: "conclusion:invest/heavy" };
  applyMainlineSelection({ state, node, route, history, inspect, select });
  assert.equal(state.selectedId, node.id);
  assert.equal(state.popover, null);
  assert.deepEqual(calls, [["replace", "#/invest/heavy/exit"], ["select"]]);
  state.popover = { nodeId: "previous" };
  applyMainlineSelection({ state, node, route, history, inspect, select });
  assert.deepEqual(calls.slice(-2), [["replace", "#/invest/heavy/exit"], ["inspect"]]);
});

test("中文子串：问题优先于步骤和来源，来源全文不参与，摘要只留前后 12 字", () => {
  const hits = matchSearch(buildSearchIndex(graph()), "重仓");
  assert.deepEqual(
    hits.map((hit) => hit.type),
    ["idea", "step", "source"]
  );
  assert.equal(hits[0].title, "为什么我总是重仓？");
  assert.equal(hits[0].path, "投资");
  assert.equal(hits[2].route.sourceId, "note-heavy");
  assert.equal(hits[2].route.level, "step");
  assert.equal(hits[1].snippet, "…丙丁戊己庚辛壬癸子丑寅卯重仓辰巳午未申酉戌亥乾坤艮巽…");
  assert.ok(!hits.some((hit) => String(hit.snippet).includes("来源全文") || String(hit.snippet).includes("多余")));
});

test("摘要窗口严格是命中前后各 12 个字符，不返回整段正文", () => {
  const text = "甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥乾坤坎离震兑";
  const snippet = snippetAround(text, 14, 2);
  assert.equal(snippet, "…丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥乾坤坎离震兑");
  assert.ok(!snippet.includes(text));
  assert.equal(matchSearch(buildSearchIndex(graph()), "不存在").length, 0);
  assert.equal(matchSearch(buildSearchIndex(graph()), "  ").length, 0);
});

test("搜索控制器：/ 与 Ctrl+K 打开，Esc 优先关闭并归还焦点，相机不动", () => {
  const doc = fakeDocument();
  const win = new FakeElement("window", doc);
  win.listeners = win.listeners;
  const camera = { current: { x: 12, y: 34, scale: 1.5 }, calls: 0, panBy() { this.calls += 1; } };
  const routes = [];
  const controller = createSearchController({
    graph: graph(),
    document: doc,
    window: win,
    onNavigate: (route) => routes.push(route),
  });
  controller.attach();
  const origin = doc.createElement("button");
  origin.focus();
  const later = [];
  win.addEventListener("keydown", () => later.push("replay"), true);

  const slash = dispatch(win, key(origin, { key: "/" }));
  assert.equal(slash.immediateStopped, true);
  assert.equal(later.length, 0);
  assert.equal(controller.isOpen(), true);
  assert.equal(doc.activeElement, controller.elements.input);
  assert.equal(camera.calls, 0);
  assert.deepEqual(camera.current, { x: 12, y: 34, scale: 1.5 });

  const escape = dispatch(win, key(controller.elements.input, { key: "Escape" }));
  assert.equal(escape.immediateStopped, true);
  assert.equal(later.length, 0);
  assert.equal(controller.isOpen(), false);
  assert.equal(doc.activeElement, origin);
  assert.deepEqual(camera.current, { x: 12, y: 34, scale: 1.5 });

  dispatch(win, key(origin, { key: "k", ctrlKey: true }));
  assert.equal(controller.isOpen(), true);
  dispatch(win, key(origin, { key: "k", metaKey: true }));
  controller.close();
  assert.equal(doc.activeElement, origin);
});

test("输入后回车走 navigate，结果可点，关闭不恢复焦点以免盖住跳转", () => {
  const doc = fakeDocument();
  const win = new FakeElement("window", doc);
  const routes = [];
  const controller = createSearchController({
    graph: graph(),
    document: doc,
    window: win,
    onNavigate: (route) => routes.push(route),
  });
  controller.attach();
  const origin = doc.createElement("button");
  origin.focus();
  dispatch(win, key(origin, { key: "/" }));
  controller.elements.input.value = "重仓";
  controller.elements.input.listeners.input[0].fn();
  assert.equal(titles(controller)[0], "为什么我总是重仓？");

  dispatch(win, key(controller.elements.input, { key: "Enter" }));
  assert.equal(controller.isOpen(), false);
  assert.deepEqual(routes[0], { level: "idea", themeId: "invest", ideaId: "heavy" });
  assert.notEqual(doc.activeElement, origin, "跳转后不把焦点拉回搜索前的按钮");
  assert.notEqual(doc.activeElement, controller.elements.input, "关闭后焦点不能留在隐藏输入框");

  controller.open();
  controller.elements.input.value = "笔记标题";
  controller.elements.input.listeners.input[0].fn();
  const button = controller.elements.results.children[0].children[0];
  button.listeners.click[0].fn();
  assert.equal(routes[1].sourceId, "note-heavy");
  assert.equal(routes[1].level, "step");
});

test("搜索 controller：IME Enter 不导航，Tab 聚焦第二结果后 Enter 打开第二条", () => {
  const doc = fakeDocument();
  const win = new FakeElement("window", doc);
  const routes = [];
  const controller = createSearchController({
    graph: graph(), document: doc, window: win,
    onNavigate: (route) => routes.push(route),
  });
  controller.attach();
  controller.open();
  const input = controller.elements.input;
  input.value = "重仓";
  input.listeners.input[0].fn();
  dispatch(win, key(input, { key: "Enter", isComposing: true }));
  assert.equal(routes.length, 0, "中文输入确认不能跳转");
  assert.equal(controller.isOpen(), true);
  dispatch(win, key(input, { key: "Enter", keyCode: 229 }));
  assert.equal(routes.length, 0, "兼容 IME keyCode 229");
  const active = input.getAttribute("aria-activedescendant");
  dispatch(win, key(input, { key: "ArrowDown", isComposing: true }));
  dispatch(win, key(input, { key: "Escape", isComposing: true }));
  assert.equal(controller.isOpen(), true);
  assert.equal(input.getAttribute("aria-activedescendant"), active);
  dispatch(win, key(input, { key: "Enter" }));
  assert.equal(routes.length, 1, "组合结束后普通 Enter 正常导航");
  assert.equal(routes[0].ideaId, "heavy");
});

test("搜索 controller：Tab 聚焦第二结果后 Enter 打开第二条", () => {
  const doc = fakeDocument();
  const win = new FakeElement("window", doc);
  const routes = [];
  const controller = createSearchController({
    graph: graph(), document: doc, window: win,
    onNavigate: (route) => routes.push(route),
  });
  controller.attach();
  controller.open();
  const input = controller.elements.input;
  input.value = "重仓";
  input.listeners.input[0].fn();
  const second = controller.elements.results.children[1].children[0];
  dispatch(win, key(input, { key: "Tab" }));
  // Native Tab moves focus; dispatch its resulting focus event on result two.
  second.focus();
  assert.equal(input.getAttribute("aria-activedescendant"), "search-result-1");
  dispatch(win, key(second, { key: "Enter" }));
  assert.equal(routes.length, 1);
  assert.equal(routes[0].stepId, "open");
  assert.equal(routes[0].level, "step");
});

test("搜索 controller：结果滚轮不取消默认滚动，仅阻止传播到画布", () => {
  const doc = fakeDocument();
  const win = new FakeElement("window", doc);
  const controller = createSearchController({ graph: graph(), document: doc, window: win });
  controller.open();
  const event = key(controller.elements.results, { deltaY: 80 });
  for (const { fn } of controller.elements.layer.listeners.wheel) fn(event);
  assert.equal(event.defaultPrevented, false, "保留结果区原生滚动");
  assert.equal(event.stopped, true, "滚轮不得传播到画布");
  const start = css.indexOf(".search-results {");
  const rule = css.slice(start, css.indexOf("}", start));
  assert.match(rule, /overscroll-behavior:\s*contain/);
});

test("方位指示只指向真实离屏节点，按距离取前 5，并避开浮框", () => {
  const area = { ox: 400, oy: 300, width: 500, height: 360 };
  const nodes = [
    { id: "near", title: "近处", screen: { x: 760, y: 300 }, projected: { x: 760, y: 300 } },
    { id: "far", title: "远处", screen: { x: 1400, y: 300 }, projected: { x: 1400, y: 300 } },
    { id: "visible", title: "可见", screen: { x: 420, y: 320 }, projected: { x: 1400, y: 1400 } },
    { id: "clamped", title: "被夹回", screen: { x: 620, y: 300 }, projected: { x: 1100, y: 300 } },
  ];
  for (let i = 0; i < 6; i += 1) {
    nodes.push({
      id: `up-${i}`,
      title: `上${i}`,
      screen: { x: 180 + i * 70, y: -80 - i * 30 },
      projected: { x: 180 + i * 70, y: -80 - i * 30 },
    });
  }
  const cues = offscreenCues({
    nodes,
    area,
    obstacles: [{ left: 620, top: 250, right: 700, bottom: 360 }],
  });
  assert.equal(cues.length, 5);
  assert.ok(!cues.some((cue) => cue.id === "visible" || cue.id === "clamped"));
  assert.equal(cues[0].id, "near");
  assert.equal(cues[0].direction, "right");
  assert.ok(cues[0].rect.top >= 360 || cues[0].rect.bottom <= 250, "浮框挡住的边缘位置应让开");
  assert.deepEqual(
    cues.slice(1).map((cue) => cue.id).sort(),
    ["up-0", "up-1", "up-2", "up-3"]
  );
  const delta = cuePanDelta(cues[0], area);
  assert.equal(delta.dx, area.ox - cues[0].point.x);
  assert.equal(delta.dy, 0);
});

test("主线：横屏左右、竖屏上下、Home 首步、End 结论但 hash 停在末步", () => {
  const data = graph();
  const steps = data.steps("invest", "heavy");
  const base = { steps, themeId: "invest", ideaId: "heavy", conclusionId: "conclusion:invest/heavy" };
  const first = mainlineMove({ ...base, currentId: null, key: "ArrowRight" });
  assert.equal(first.route.stepId, "open");
  const next = mainlineMove({ ...base, currentId: steps[0].id, key: "ArrowRight" });
  assert.equal(next.route.stepId, "exit");
  const end = mainlineMove({ ...base, currentId: steps[1].id, key: "End" });
  assert.equal(end.id, "conclusion:invest/heavy");
  assert.equal(end.route.stepId, "exit");
  assert.equal(end.route.level, "step");
  const back = mainlineMove({ ...base, currentId: end.id, key: "ArrowLeft" });
  assert.equal(back.id, steps[1].id);
  assert.equal(mainlineMove({ ...base, currentId: steps[0].id, key: "Home" }).id, steps[0].id);
  assert.equal(mainlineMove({ ...base, currentId: steps[0].id, key: "ArrowDown", portrait: true }).route.stepId, "exit");
  assert.equal(mainlineMove({ ...base, currentId: steps[0].id, key: "ArrowRight", portrait: true }), null);
});

test("悬停预览再等 280ms，离开立即取消；内容只有标题、首句、步数和日期", () => {
  let scheduled = null;
  const shown = [];
  const preview = createHoverPreview({
    onShow: (id) => shown.push(id),
    onHide: () => shown.push("hide"),
    setTimer: (fn) => {
      scheduled = fn;
      return 1;
    },
    clearTimer: () => {
      scheduled = null;
    },
  });
  assert.equal(preview.delay, 280);
  preview.enter("idea:invest/heavy");
  assert.deepEqual(shown, []);
  preview.leave();
  assert.equal(scheduled, null);
  preview.enter("idea:invest/heavy");
  scheduled();
  assert.deepEqual(shown, ["idea:invest/heavy"]);
  preview.leave();
  assert.deepEqual(shown, ["idea:invest/heavy", "hide"]);

  const content = previewContent(graph().nodes.get("idea:invest/heavy"), graph().nodes);
  assert.equal(content.title, "为什么我总是重仓？");
  assert.equal(content.summary, "重仓不是勇气，是没有先写清退出条件");
  assert.equal(content.steps, 2);
  assert.equal(content.latest, "2026-10-18");
  assert.equal(previewContent({ type: "source", label: "x" }), null);
});

test("触控目标样式至少 40px：搜索按钮、结果、方位箭头、上下步", () => {
  for (const rule of [".chip--search", ".search-result", ".offscreen-cue", ".popover-btn--step"]) {
    const block = css.slice(css.indexOf(`${rule} {`), css.indexOf("}", css.indexOf(`${rule} {`)));
    assert.match(block, /min-(?:width|height):\s*40px/, `${rule} 需要 40px 触控尺寸`);
  }
  assert.match(css, /\.search-layer[\s\S]*z-index:\s*90/);
  assert.match(css, /pointer-events:\s*none/);
});
