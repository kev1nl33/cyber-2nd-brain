/**
 * 性能预算：300 个节点的合成图上计时布局与 LOD 计算。
 * 预算取得宽（防慢机器上抖动），只用来拦数量级的回归，不追求微优化。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { computeLayout, boundsOf } from "../src/layout.js";
import { nextLod } from "../src/lod.js";

const TOTAL = 300;

/** 300 节点合成图：1 核心 + 5 主题 + 10 问题 + 283 步骤 + 1 阶段理解。
 * idea 层会放置其中 295 个：核心与其余 4 个主题不进该层。 */
const PLACED = 295;
function syntheticGraph() {
  const themes = Array.from({ length: 5 }, (_, t) => ({
    id: `theme:${t}`,
    type: "theme",
    themeId: `t${t}`,
    label: `主题 ${t}`,
  }));
  const ideas = Array.from({ length: 10 }, (_, i) => ({
    id: `idea:t0/${i}`,
    type: "idea",
    themeId: "t0",
    ideaId: `i${i}`,
    label: `问题 ${i}`,
  }));
  const steps = Array.from({ length: 283 }, (_, s) => ({
    id: `step:t0/i0/${s}`,
    type: "step",
    themeId: "t0",
    ideaId: "i0",
    stepId: `s${s}`,
    index: s + 1,
    label: `步骤 ${s}`,
    date: `2026-01-${String((s % 28) + 1).padStart(2, "0")}`,
  }));
  const conclusion = {
    id: "conclusion:t0/i0",
    type: "conclusion",
    themeId: "t0",
    ideaId: "i0",
    summary: "阶段理解",
  };
  const byThemeId = new Map(themes.map((t) => [t.themeId, t]));
  const core = { id: "core", type: "core", label: "数字大脑" };
  return {
    core,
    nodes: new Map(
      [[core], themes, ideas, steps, [conclusion]].flat().map((n) => [n.id, n])
    ),
    themes: () => themes,
    theme: (themeId) => byThemeId.get(themeId) || null,
    ideas: (themeId) => (themeId === "t0" ? ideas : []),
    idea: (themeId, ideaId) => ideas.find((i) => i.themeId === themeId && i.ideaId === ideaId) || null,
    steps: (themeId, ideaId) => (themeId === "t0" && ideaId === "i0" ? steps : []),
    sources: () => [],
    conclusion: (themeId, ideaId) => (themeId === "t0" && ideaId === "i0" ? conclusion : null),
  };
}

const graph = syntheticGraph();
const viewports = [
  { label: "1440x900", width: 1440, height: 900 },
  { label: "390x844", width: 390, height: 844 },
];
const view = { level: "idea", themeId: "t0", ideaId: "i0", expanded: new Set() };

// 先证明合成图确实铺满 300 个节点，计时才有意义。
{
  const layout = computeLayout(graph, view, viewports[0]);
  assert.equal(graph.nodes.size, TOTAL, `合成图正好 ${TOTAL} 个节点`);
  assert.equal(layout.placements.size, PLACED, `idea 层放置 ${PLACED} 个节点`);
}

test(`computeLayout ${TOTAL} 节点（idea 层 ${PLACED} 个）在预算内`, () => {
  for (const viewport of viewports) {
    // 小屏（compact）不给兄弟问题留位置，少放 9 个节点。
    const expected = Math.min(viewport.width, viewport.height) < 560 ? PLACED - 9 : PLACED;
    const runs = [];
    for (let i = 0; i < 5; i++) {
      const start = process.hrtime.bigint();
      const layout = computeLayout(graph, view, viewport);
      runs.push(Number(process.hrtime.bigint() - start) / 1e6);
      assert.equal(layout.placements.size, expected);
      assert.ok(boundsOf(layout.focus).width > 0);
    }
    const best = Math.min(...runs);
    console.log(`  ${viewport.label}: 最快 ${best.toFixed(2)}ms（5 次）`);
    assert.ok(best < 25, `${viewport.label} 布局最快一次 ${best.toFixed(2)}ms，超出 25ms 预算`);
  }
});

test("nextLod 3000 次在预算内", () => {
  const start = process.hrtime.bigint();
  let band = null;
  for (let i = 0; i < 3000; i++) {
    band = nextLod(0.2 + (i % 200) / 100, band);
  }
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  console.log(`  3000 次 nextLod: ${ms.toFixed(2)}ms`);
  assert.ok(band, "LOD 计算有返回值");
  assert.ok(ms < 10, `3000 次 nextLod ${ms.toFixed(2)}ms，超出 10ms 预算`);
});
