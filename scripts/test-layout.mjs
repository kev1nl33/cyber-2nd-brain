#!/usr/bin/env node
/** 布局纯函数测试：computeLayout 三层视图与回退、boundsOf 边界。
 * 运行：node scripts/test-layout.mjs。数据用 src/sample-data.js 或测试内 fixture。 */
import test from "node:test";
import assert from "node:assert/strict";
import { loadGraph } from "../src/graph.js";
import { peripheralScreen, nodeMarkup, nodeVisual, createScene } from "../src/scene.js";
import { createCamera } from "../src/camera.js";
import { computeLayout, boundsOf } from "../src/layout.js";

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 }; // portrait + compact
const SQUARE = { width: 500, height: 520 }; // compact 但非 portrait

function useSampleGraph() {
  delete globalThis.window;
  return loadGraph();
}

/** 两个问题的主题：用于兄弟问题与紧凑屏行为。 */
function fixtureGraph() {
  globalThis.window = {
    CYBER_THOUGHTS: {
      themes: [
        {
          id: "t",
          label: "L",
          ideas: [
            { id: "i1", title: "问题一", summary: "S", nodes: [{ id: "s", date: "2026-01-01", kind: "起点", title: "T" }] },
            { id: "i2", title: "问题二", nodes: [] },
          ],
        },
      ],
      sources: [],
    },
    BRAIN_DATA: { records: [] },
  };
  return loadGraph();
}

test("总览：core 居中，主题环绕且全部在焦点里", () => {
  const graph = useSampleGraph();
  const layout = computeLayout(graph, { level: "overview" }, DESKTOP);
  assert.equal(layout.portrait, false);
  assert.equal(layout.compact, false);
  assert.equal(layout.placements.size, 6); // core + 5 主题
  const core = layout.placements.get("core");
  assert.deepEqual([core.x, core.y], [0, 0]);
  assert.equal(core.role, "core");
  assert.equal(core.z, 3);
  const themes = [...layout.placements.values()].filter((p) => p.role === "theme");
  assert.equal(themes.length, 5);
  assert.ok(themes.every((p) => p.parentId === "core"));
  const focusIds = new Set(layout.focus.map((f) => f.id)); // focus 只体现在数组里，不在 placement 上
  assert.ok(focusIds.has("core"));
  assert.ok(themes.every((p) => focusIds.has(p.id)));
  assert.equal(layout.focus.length, 6);
  assert.equal(layout.fit.anchor, null);
});

test("视口判定：竖屏与紧凑屏各得其所", () => {
  const graph = useSampleGraph();
  const phone = computeLayout(graph, { level: "overview" }, PHONE);
  assert.equal(phone.portrait, true);
  assert.equal(phone.compact, true);
  assert.equal(phone.placements.get("core").size, 300); // 竖屏即使紧凑也用全尺寸
  const square = computeLayout(graph, { level: "overview" }, SQUARE);
  assert.equal(square.portrait, false);
  assert.equal(square.compact, true);
  assert.equal(square.placements.get("core").size, 250); // 横向紧凑缩小 core
});

test("同输入同输出：布局完全确定", () => {
  const graph = useSampleGraph();
  const view = {
    level: "idea",
    themeId: "develop",
    ideaId: "develop-brain",
    expanded: new Set(["step:develop/develop-brain/wish"]),
  };
  const snapshot = (l) => [...l.placements].map(([id, p]) => [id, p.x, p.y, p.size, p.z]);
  const a = computeLayout(graph, view, DESKTOP);
  const b = computeLayout(graph, view, DESKTOP);
  assert.deepEqual(snapshot(a), snapshot(b));
  assert.deepEqual(a.focus.map((f) => f.id), b.focus.map((f) => f.id));
});

test("主题层：活动主题居中，core 退到角落变暗，其余主题在远处", () => {
  const graph = useSampleGraph();
  const layout = computeLayout(graph, { level: "theme", themeId: "develop" }, DESKTOP);
  const active = layout.placements.get("theme:develop");
  assert.deepEqual([active.x, active.y], [0, 0]);
  assert.equal(active.role, "theme-active");
  assert.deepEqual(layout.fit.anchor, { x: 0, y: 0 });
  const core = layout.placements.get("core");
  assert.equal(core.role, "core-away");
  assert.equal(core.dim, true);
  const away = [...layout.placements.values()].filter((p) => p.role === "theme-away");
  assert.equal(away.length, 4);
  assert.ok(away.every((p) => p.dim && p.z === 1));
  assert.ok(new Set(layout.focus.map((f) => f.id)).has("idea:develop/develop-brain")); // 问题在焦点里
});

test("主题层：未知主题回退到总览布局", () => {
  const graph = useSampleGraph();
  const layout = computeLayout(graph, { level: "theme", themeId: "nope" }, DESKTOP);
  assert.equal(layout.placements.get("core").role, "core"); // 不是 core-away
  assert.equal([...layout.placements.values()].filter((p) => p.role === "theme").length, 5);
});

test("问题层：步骤链横向推进，展开才放来源，结论收尾", () => {
  const graph = useSampleGraph();
  const stepIds = graph.steps("develop", "develop-brain").map((s) => s.id);
  const collapsed = computeLayout(graph, { level: "idea", themeId: "develop", ideaId: "develop-brain" }, DESKTOP);
  assert.equal(collapsed.placements.get("theme:develop").role, "theme-away");
  const idea = collapsed.placements.get("idea:develop/develop-brain");
  assert.equal(idea.role, "idea-active");
  assert.deepEqual([idea.x, idea.y], [-186, 10]); // 桌面锚点
  const steps = stepIds.map((id) => collapsed.placements.get(id));
  assert.ok(steps.every((p) => p.role === "step"));
  const focusIds = new Set(collapsed.focus.map((f) => f.id)); // 主线全程在焦点里
  assert.ok(stepIds.every((id) => focusIds.has(id)));
  assert.ok(steps[0].x < steps[1].x, "步骤横向推进");
  assert.equal([...collapsed.placements.values()].filter((p) => p.role === "source").length, 0);
  const expanded = computeLayout(
    graph,
    { level: "idea", themeId: "develop", ideaId: "develop-brain", expanded: new Set(stepIds) },
    DESKTOP
  );
  assert.equal([...expanded.placements.values()].filter((p) => p.role === "source").length, 2); // 每步一条来源
  const conclusion = expanded.placements.get("conclusion:develop/develop-brain");
  assert.ok(conclusion, "结论节点被摆放");
  assert.equal(conclusion.x, steps[1].x + 218 * 0.92); // 紧跟最后一步
});

test("问题层：宽屏放兄弟问题做入口，紧凑屏不放", () => {
  const graph = fixtureGraph();
  const view = { level: "idea", themeId: "t", ideaId: "i1" };
  const desktop = computeLayout(graph, view, DESKTOP);
  const sibling = desktop.placements.get("idea:t/i2");
  assert.equal(sibling.role, "idea-away");
  assert.deepEqual([sibling.x, sibling.y], [-220 - 160 * Math.cos(10 * Math.PI / 180), -180 + 170 * Math.sin(10 * Math.PI / 180)]);
  assert.equal(sibling.dim, true);
  const compact = computeLayout(graph, view, SQUARE);
  assert.equal(compact.placements.has("idea:t/i2"), false);
});

test("问题层：未知问题回退到主题层布局", () => {
  const graph = useSampleGraph();
  const layout = computeLayout(graph, { level: "idea", themeId: "develop", ideaId: "nope" }, DESKTOP);
  assert.equal(layout.placements.get("core").role, "core-away");
  assert.equal(layout.placements.get("theme:develop").role, "theme-active");
});

test("boundsOf：空集合回退到 400×400 默认框", () => {
  assert.deepEqual(boundsOf([]), { minX: -200, minY: -200, maxX: 200, maxY: 200, width: 400, height: 400, cx: 0, cy: 0 });
});

test("boundsOf：单节点 = 半径 + 标签空间，标签空间可调", () => {
  const p = [{ x: 0, y: 0, size: 100 }];
  const box = boundsOf(p); // 默认 labelRoom 46
  assert.equal(box.minX, -50 - 46 * 0.7);
  assert.equal(box.maxX, 50 + 46 * 0.7);
  assert.equal(box.minY, -50 - 46 * 0.6);
  assert.equal(box.maxY, 50 + 46);
  assert.equal(box.width, box.maxX - box.minX);
  assert.equal(box.cy, (box.minY + box.maxY) / 2);
  const tight = boundsOf(p, 0);
  assert.deepEqual([tight.minX, tight.maxX, tight.minY, tight.maxY], [-50, 50, -50, 50]);
});

test("boundsOf：多节点取联合框，宽高与中心一致", () => {
  const box = boundsOf(
    [
      { x: -100, y: 0, size: 40 },
      { x: 100, y: 200, size: 60 },
    ],
    0
  );
  assert.deepEqual([box.minX, box.maxX, box.minY, box.maxY], [-120, 130, -20, 230]);
  assert.equal(box.width, 250);
  assert.equal(box.height, 250);
  assert.equal(box.cx, 5);
});


test("第五期：外围沿对角线大椭圆均分，总脑在左上且不进focus", () => {
  const graph = useSampleGraph();
  for (const viewport of [DESKTOP, PHONE, { width: 408, height: 543 }]) {
    const layout = computeLayout(graph, { level: "theme", themeId: "develop" }, viewport);
    const core = layout.placements.get("core");
    assert.ok(core.x < 0 && core.y < 0);
    const peripheral = [...layout.placements.values()].filter((p) => p.orbitAngle !== null);
    assert.equal(peripheral.length, 5);
    const radius = Math.hypot(viewport.width, viewport.height) * 0.42;
    for (const p of peripheral) {
      assert.ok(Math.abs(Math.hypot(p.x, p.y * viewport.width / viewport.height) - radius) < 1e-8);
      assert.equal(p.detail, "distant");
      assert.ok(!layout.focus.includes(p));
    }
  }
});

test("第五期：1440桌面问题主题脑完整入屏，fit不包含外围", () => {
  const graph = useSampleGraph();
  for (const theme of graph.themes()) for (const idea of graph.ideas(theme.themeId)) {
    const layout = computeLayout(graph, { level: "idea", themeId: theme.themeId, ideaId: idea.ideaId }, DESKTOP);
    const camera = createCamera();
    camera.setArea({ ...DESKTOP, insets: { top: 70, bottom: 90, left: 18, right: 18 } });
    camera.fit(boundsOf(layout.focus), boundsOf(layout.focus), layout.fit);
    camera.snap();
    const p = layout.placements.get(theme.id);
    const radius = p.size * camera.current.scale / 2;
    const screen = peripheralScreen(camera.toScreen(p), camera.area, radius);
    assert.ok(screen.x - radius >= 0 && screen.x + radius <= DESKTOP.width);
    assert.ok(screen.y - radius >= 0 && screen.y + radius <= DESKTOP.height);
  }
});


test("节点实际markup：每种示例节点均返回SVG图形和中文标签", () => {
  const graph = useSampleGraph();
  const seen = new Set();
  const views = [
    { level: "overview" },
    { level: "theme", themeId: "develop" },
    { level: "idea", themeId: "develop", ideaId: "develop-brain", expanded: new Set(graph.steps("develop", "develop-brain").map((step) => step.id)) },
  ];
  for (const view of views) {
    for (const p of computeLayout(graph, view, DESKTOP).placements.values()) {
      const html = nodeMarkup(p);
      assert.equal(typeof html, "string", `${p.role} must return actual HTML`);
      assert.match(html, /<svg[^>]*>[\s\S]+<\/svg>/, `${p.role} has real SVG art`);
      assert.match(html, /class="node-title">[^<]+<\/span>/, `${p.role} has visible title`);
      assert.ok(html.includes(p.node.shortTitle || p.node.label), `${p.role} preserves its title`);
      assert.doesNotMatch(html, /undefined|NaN/);
      seen.add(p.node.type);
    }
  }
  assert.deepEqual([...seen].sort(), ["conclusion", "core", "idea", "source", "step", "theme"]);
});


test("兄弟问题随相机自然离屏，大幅平移仍保持半圆间距", () => {
  fixtureGraph();
  window.CYBER_THOUGHTS.themes[0].ideas.push(
    { id: "i3", title: "问题三", nodes: [] },
    { id: "i4", title: "问题四", nodes: [] }
  );
  const graph = loadGraph();
  const layout = computeLayout(graph, { level: "idea", themeId: "t", ideaId: "i1" }, DESKTOP);
  const siblings = [...layout.placements.values()].filter((p) => p.role === "idea-away");
  assert.equal(siblings.length, 3);
  const camera = createCamera();
  camera.setArea({ ...DESKTOP, insets: { top: 70, bottom: 90, left: 18, right: 18 } });
  camera.fit(boundsOf(layout.focus), boundsOf(layout.focus), layout.fit);
  camera.snap();
  const project = () => siblings.map((p) => peripheralScreen(camera.toScreen(p), camera.area, p.size * camera.current.scale / 2, p.role));
  const before = project();
  camera.panBy(-800, -800);
  const after = project();
  for (let i = 0; i < siblings.length; i++) {
    assert.deepEqual(after[i], camera.toScreen(siblings[i]), "sibling retains its world projection");
    for (let j = i + 1; j < siblings.length; j++) {
      const gap = (points) => Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
      assert.ok(gap(after) > 1, "sibling entries must not collapse together");
      assert.ok(Math.abs(gap(before) - gap(after)) < 1e-8, "panning preserves sibling spacing");
    }
  }
});

 test("phase6 statistics stay derived and use all questions", () => {
  const nodes = new Map([
    ["i", { id: "i", type: "idea", themeId: "t", ideaId: "a", stepCount: 2 }],
    ["j", { id: "j", type: "idea", themeId: "u", ideaId: "b" }],
    ["s", { type: "step", themeId: "t", ideaId: "a", date: "2026-10-23", refIds: ["r", "r", "z"] }],
    ["c", { type: "conclusion", themeId: "t", ideaId: "a", unconfirmed: ["needs evidence"] }],
  ]);
  const before = JSON.stringify([...nodes]);
  const v = nodeVisual(nodes.get("i"), nodes, new Date("2026-10-24"));
  assert.equal(v.sources, 2);
  assert.equal(v.conclusion, "unconfirmed");
  assert.equal(v.fresh, true);
  assert.equal(nodeVisual({ type: "theme", themeId: "t" }, nodes).ratio, 0.5);
  assert.equal(nodeVisual({ type: "theme", themeId: "t" }, nodes).latest, "2026-10-23");
  assert.equal(JSON.stringify([...nodes]), before);
  const markup = nodeMarkup({ node: { type: "step", index: 1, isNewest: true }, labelSide: "bottom" });
  assert.match(markup, /起点/);
  assert.match(markup, /glyph-newest/);
  assert.match(nodeMarkup({node: {type: "conclusion"}, labelSide: "bottom"}), /当前理解/);
});

test("landscape steps rise by dated intervals and conclusion follows last step", () => {
  const graph = useSampleGraph();
  for (const idea of graph.ideas()) {
    const steps = graph.steps(idea.themeId, idea.ideaId);
    const layout = computeLayout(graph, { level:"idea", themeId:idea.themeId, ideaId:idea.ideaId }, DESKTOP);
    for (let i=1;i<steps.length;i++) {
      const rise = layout.placements.get(steps[i-1].id).y - layout.placements.get(steps[i].id).y;
      assert.ok(rise >= 8 && rise <= 14, `rise ${rise}`);
    }
    const end = graph.conclusion(idea.themeId,idea.ideaId);
    if (end && steps.length) assert.ok(layout.placements.get(end.id).y <= layout.placements.get(steps.at(-1).id).y);
  }
});

test("conclusion uses the real unconfirmed array", () => {
  const idea = { type: "idea", themeId: "t", ideaId: "a" };
  for (const unconfirmed of [[], ["verify"]]) {
    const nodes = new Map([["c", { type: "conclusion", themeId: "t", ideaId: "a", unconfirmed }]]);
    assert.equal(nodeVisual(idea, nodes).conclusion, unconfirmed.length ? "unconfirmed" : "confirmed");
  }
});

test("scene initializes visual stats and keeps exactly one timeline selection", () => {
  class Element {
    constructor() {
      this.children = []; this.dataset = {}; this.attrs = {};
      this.style = { setProperty: (key, value) => { this.attrs[key] = value; } };
      this.classList = { add() {}, remove() {}, toggle() {} };
    }
    setAttribute(k, v) { this.attrs[k] = v; }
    removeAttribute(k) { delete this.attrs[k]; }
    addEventListener() {}
    appendChild(el) {
      el.parentNode = this;
      const index = this.children.indexOf(el);
      if (index >= 0) this.children.splice(index, 1);
      this.children.push(el);
    }
    remove() { this.parentNode?.children.splice(this.parentNode.children.indexOf(this), 1); }
    querySelector() { return null; }
    set innerHTML(value) {
      this.html = value;
      this.children = [...value.matchAll(/<(line|text|circle)\b[^>]*>/g)].map(() => new Element());
    }
    get innerHTML() { return this.html || ""; }
    get childElementCount() { return this.children.length; }
  }
  const saved = { window: globalThis.window, document: globalThis.document };
  globalThis.window = {
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    cancelAnimationFrame() {},
    requestAnimationFrame: (fn) => fn(),
  };
  globalThis.document = { createElement: () => new Element(), createElementNS: () => new Element() };
  try {
    const nodesLayer = new Element(), edgesSvg = new Element();
    const edgeGroup = new Element();
    edgesSvg.querySelector = (selector) => selector === "#edge-group" ? edgeGroup : new Element();
    const scene = createScene({root: new Element(), nodesLayer, edgesSvg, tagsLayer: new Element(),
      camera: {current: {scale: 1}, step: () => false, toScreen: p => p}, onActivate() {}});
    scene.setInstant(true);
    const idea = {id:"i", type:"idea", label:"I", themeId:"t", ideaId:"a", updated:"2020-01-01"};
    const theme = {id:"t", type:"theme", label:"T", themeId:"t"};
    const a = {id:"a", type:"step", index:1}, b = {id:"b", type:"step", index:2};
    const placements = new Map([idea, theme, a, b].map((node,i) => [node.id, {id:node.id,node,x:i*100,y:0,size:80,role:node.type,labelSide:"bottom",orbitAngle:null}]));
    scene.setLayout({placements}, [], {nodes: new Map([idea,theme,a,b].map(n => [n.id,n]))});
    assert.equal(nodesLayer.children[0].dataset.faded, "true");
    assert.equal(nodesLayer.children[1].attrs["--arc-bright"], "0.550");
    const axis = edgesSvg.children.find(el => el.attrs.class === "timeline-axis");
    scene.setTimeline([{id:"a",selected:true,gapDays:0},{id:"b",selected:false,gapDays:8}]);
    scene.setTimelineSelected("b");
    const marks = [...axis.innerHTML.matchAll(/class="timeline-dot([^"]*)"/g)].map(m => m[1]);
    assert.deepEqual(marks, ["", " is-selected"]);
    scene.setTimelineSelected(null);
    assert.equal(axis.innerHTML.includes("is-selected"), false);
    const reversed = new Map([["b", placements.get("b")], ["a", placements.get("a")]]);
    scene.setLayout({ placements: reversed }, []);
    assert.deepEqual(nodesLayer.children.map((el) => el.dataset.id), ["b", "a"]);
  } finally { Object.assign(globalThis, saved); }
});
