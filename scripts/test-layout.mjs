#!/usr/bin/env node
/** 布局纯函数测试：computeLayout 三层视图与回退、boundsOf 边界。
 * 运行：node scripts/test-layout.mjs。数据用 src/sample-data.js 或测试内 fixture。 */
import test from "node:test";
import assert from "node:assert/strict";
import { loadGraph } from "../src/graph.js";
import { peripheralScreen } from "../src/scene.js";
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
