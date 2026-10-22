#!/usr/bin/env node
/** 展开生长动画：新子节点按同层顺序拿到错开序号，连线先描 300ms、节点再 200ms长出。
 * 点进主题/问题时同样生长：换层过渡稳定后由 scene 触发，动效关闭时不播。
 * 运行：node scripts/test-grow.mjs（数据全部来自测试内 fixture）。 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadGraph } from "../src/graph.js";
import { computeLayout } from "../src/layout.js";
import { growMode, growPlan } from "../src/scene.js";
import { divesIn } from "../src/route.js";

const DESKTOP = { width: 1440, height: 900 };

function makeGraph() {
  globalThis.window = {
    CYBER_THOUGHTS: {
      themes: [
        {
          id: "t",
          label: "测试主题",
          ideas: [
            {
              id: "i",
              title: "测试问题",
              nodes: [
                {
                  id: "s1",
                  date: "2026-01-01",
                  kind: "起点",
                  title: "第一步",
                  refs: [{ id: "src-c" }, { id: "src-a" }, { id: "src-b" }],
                },
                {
                  id: "s2",
                  date: "2026-01-02",
                  kind: "推进",
                  title: "第二步",
                  refs: [{ id: "src-d" }],
                },
              ],
            },
          ],
        },
      ],
      sources: [
        { id: "src-a", title: "来源甲", text: "原文甲" },
        { id: "src-b", title: "来源乙", text: "原文乙" },
        { id: "src-c", title: "来源丙", text: "原文丙" },
        { id: "src-d", title: "来源丁", text: "原文丁" },
      ],
    },
    BRAIN_DATA: { records: [] },
  };
  return loadGraph();
}

function ideaView(graph, expanded) {
  return computeLayout(
    graph,
    { level: "idea", themeId: "t", ideaId: "i", expanded },
    DESKTOP
  );
}

test("展开一步的来源：按布局顺序错开，连线先描、节点后长", () => {
  const graph = makeGraph();
  const step = graph.step("t", "i", "s1");
  const before = ideaView(graph, new Set());
  const after = ideaView(graph, new Set([step.id]));
  const plan = growPlan(before.placements, after.placements, graph.edges);

  const sources = graph.sources(step.id);
  assert.deepEqual(
    plan.nodes.map((item) => item.id),
    sources.map((source) => source.id)
  );
  assert.deepEqual(
    plan.nodes.map((item) => item.delay),
    [0, 40, 80]
  );
  assert.ok(plan.nodes.every((item) => item.edgeDelay === item.delay && item.nodeDelay === item.delay + 300));

  const edgeByTo = new Map(plan.edges.map((item) => [item.to, item]));
  for (const source of sources) {
    const edge = graph.edges.find((item) => item.from === step.id && item.to === source.id);
    assert.equal(edgeByTo.get(source.id).id, edge.id);
  }
  assert.deepEqual(
    plan.edges.map((item) => item.delay),
    [0, 40, 80]
  );
});

test("已在场的节点不再长一次：只给新进来的子节点排序", () => {
  const graph = makeGraph();
  const first = graph.step("t", "i", "s1");
  const second = graph.step("t", "i", "s2");
  const before = ideaView(graph, new Set([first.id]));
  const after = ideaView(graph, new Set([first.id, second.id]));
  const plan = growPlan(before.placements, after.placements, graph.edges);

  const added = graph.sources(second.id);
  assert.deepEqual(
    plan.nodes.map((item) => item.id),
    added.map((source) => source.id)
  );
  assert.equal(plan.nodes[0].delay, 0);
  assert.equal(plan.edges.length, 1);
  assert.equal(plan.edges[0].to, added[0].id);
});

test("没有新子节点时不排序", () => {
  const graph = makeGraph();
  const step = graph.step("t", "i", "s1");
  const same = ideaView(graph, new Set([step.id]));
  const plan = growPlan(same.placements, same.placements, graph.edges);
  assert.deepEqual(plan, { nodes: [], edges: [] });
});

test("样式：连线 300ms 描边，节点 200ms 从 0.6 长到 1，减少动效时直接出现", () => {
  const css = readFileSync(fileURLToPath(new URL("../src/styles.css", import.meta.url)), "utf8");
  const edge = css.match(/@keyframes edgeGrow\s*\{[\s\S]*?\n\}/);
  const node = css.match(/@keyframes nodeGrow\s*\{[\s\S]*?\n\}/);
  assert.ok(edge, "edgeGrow keyframes");
  assert.ok(node, "nodeGrow keyframes");
  assert.match(edge[0], /stroke-dashoffset:\s*0/);
  assert.match(css, /\.edge\.is-growing \.edge-line\s*\{[\s\S]*?animation:[^;]*edgeGrow\s+300ms/);
  assert.match(css, /\.node\.is-growing\s*\{[\s\S]*?animation:[^;]*nodeGrow\s+200ms/);
  assert.match(node[0], /scale\(0\.6\)/);
  assert.match(node[0], /scale\(1\)/);
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*\.edge\.is-growing \.edge-line[\s\S]*?animation:\s*none/
  );
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*\.node\.is-growing[\s\S]*?animation:\s*none/
  );
});


/** 点进主题/问题用的 fixture：两个主题、两个问题、带总结的主线。 */
function makeNavGraph() {
  globalThis.window = {
    CYBER_THOUGHTS: {
      themes: [
        {
          id: "t",
          label: "点进主题",
          ideas: [
            {
              id: "i",
              title: "点进问题",
              summary: "阶段理解一则",
              nodes: [
                { id: "s1", date: "2026-01-01", kind: "起点", title: "第一步" },
                { id: "s2", date: "2026-01-02", kind: "推进", title: "第二步" },
              ],
            },
            { id: "i2", title: "旁支问题", nodes: [] },
          ],
        },
        { id: "t2", label: "陪跑主题", ideas: [] },
      ],
      sources: [],
    },
    BRAIN_DATA: { records: [] },
  };
  return loadGraph();
}

test("点进主题：新问题节点拿到生长计划，已在场的核心和别的主题不重播", () => {
  const graph = makeNavGraph();
  const before = computeLayout(graph, { level: "overview" }, DESKTOP);
  const after = computeLayout(graph, { level: "theme", themeId: "t" }, DESKTOP);
  const plan = growPlan(before.placements, after.placements, graph.edges);
  const ideas = graph.ideas("t");
  const theme = graph.theme("t");
  assert.deepEqual(
    plan.nodes.map((item) => item.id),
    ideas.map((idea) => idea.id)
  );
  assert.deepEqual(
    plan.nodes.map((item) => item.delay),
    [0, 40]
  );
  assert.ok(plan.nodes.every((item) => item.nodeDelay === item.delay + 300));
  const edgeByTo = new Map(plan.edges.map((item) => [item.to, item]));
  for (const idea of ideas) {
    const edge = graph.edges.find((item) => item.from === theme.id && item.to === idea.id);
    assert.equal(edgeByTo.get(idea.id).id, edge.id);
  }
});

test("点进问题：主线步骤拿到生长计划，链条边跟着描，阶段理解不长", () => {
  const graph = makeNavGraph();
  const before = computeLayout(graph, { level: "theme", themeId: "t" }, DESKTOP);
  const after = computeLayout(graph, { level: "idea", themeId: "t", ideaId: "i", expanded: new Set() }, DESKTOP);
  const plan = growPlan(before.placements, after.placements, graph.edges);
  const steps = graph.steps("t", "i");
  assert.deepEqual(
    plan.nodes.map((item) => item.id),
    steps.map((step) => step.id)
  );
  assert.deepEqual(
    plan.nodes.map((item) => item.delay),
    [0, 40]
  );
  const chain = graph.edges.filter((item) => item.from === steps[0].id && item.to === steps[1].id);
  assert.deepEqual(
    plan.edges.map((item) => item.id),
    chain.map((item) => item.id)
  );
  assert.equal(plan.edges[0].delay, 40);
  assert.ok(!plan.nodes.some((item) => item.id.startsWith("conclusion:")));
});

test("换层生长要等过渡收完：点进主题/问题是 after-settle，不是当帧就播", () => {
  assert.equal(growMode({ collapsing: true, instant: false, growInto: true }), "after-settle");
  assert.equal(growMode({ collapsing: false, instant: false, growInto: false }), "immediate");
  assert.equal(growMode({ collapsing: true, instant: false, growInto: false }), "none");
});

test("只有走进去的方向才长：点进与横跳算，退回上层不算", () => {
  assert.equal(divesIn({ level: "overview" }, { level: "theme", themeId: "t" }), true);
  assert.equal(divesIn({ level: "theme", themeId: "t" }, { level: "idea", themeId: "t", ideaId: "i" }), true);
  assert.equal(divesIn({ level: "theme", themeId: "t" }, { level: "theme", themeId: "t2" }), true);
  assert.equal(divesIn({ level: "idea", themeId: "t", ideaId: "i" }, { level: "theme", themeId: "t" }), false);
  assert.equal(divesIn({ level: "theme", themeId: "t" }, { level: "overview" }), false);
});

test("减少动态或动效关闭：不排生长计划，节点直接出现", () => {
  assert.equal(growMode({ collapsing: true, instant: true, growInto: true }), "none");
  assert.equal(growMode({ collapsing: false, instant: true, growInto: false }), "none");
  const css = readFileSync(fileURLToPath(new URL("../src/styles.css", import.meta.url)), "utf8");
  assert.match(
    css,
    /\.app\[data-motion="off"\][^{]*\.node\.is-growing[^{]*\{[^}]*animation:\s*none/
  );
});
