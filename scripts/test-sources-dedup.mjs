#!/usr/bin/env node
/** graph.sources() 去重测试：同一 refId 在步骤里重复出现时，只返回一个来源节点，
 * 且保持首次出现顺序；没有重复时行为不变。
 * 运行：node scripts/test-sources-dedup.mjs（数据全部来自测试内 fixture）。 */
import test from "node:test";
import assert from "node:assert/strict";
import { loadGraph } from "../src/graph.js";

const SOURCES = [
  { id: "src-a", title: "来源甲", text: "原文甲", date: "2025-12-01", kind: "书" },
  { id: "src-b", title: "来源乙", text: "原文乙", date: "2025-12-02", kind: "文章" },
  { id: "src-c", title: "来源丙", text: "原文丙", date: "2025-12-03", kind: "对话" },
];

/** 用给定的 refs 造一张只有一步的图。 */
function makeGraph(refs) {
  globalThis.window = {
    CYBER_THOUGHTS: {
      themes: [
        {
          id: "t", label: "测试主题", latest: "2026-01-01",
          ideas: [
            {
              id: "i", title: "测试问题",
              nodes: [{ id: "s", date: "2026-01-01", kind: "起点", title: "唯一一步", refs }],
            },
          ],
        },
      ],
      sources: SOURCES,
    },
    BRAIN_DATA: { records: [] },
  };
  const graph = loadGraph();
  return { graph, stepId: graph.step("t", "i", "s").id };
}

test("重复 refId 去重：同一步骤引用两次只返回一个来源", () => {
  const { graph, stepId } = makeGraph([{ id: "src-a" }, { id: "src-a" }]);
  const sources = graph.sources(stepId);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].refId, "src-a");
  assert.equal(sources[0].label, "来源甲");
});

test("顺序保留：去重后按 refId 首次出现的顺序返回", () => {
  const { graph, stepId } = makeGraph([
    { id: "src-b" },
    { id: "src-a" },
    { id: "src-b" },
    { id: "src-c" },
    { id: "src-a" },
  ]);
  assert.deepEqual(
    graph.sources(stepId).map((n) => n.refId),
    ["src-b", "src-a", "src-c"]
  );
});

test("无重复时行为不变：数量、顺序与节点身份保持一致", () => {
  const { graph, stepId } = makeGraph([{ id: "src-a" }, { id: "src-b" }]);
  const sources = graph.sources(stepId);
  assert.equal(sources.length, 2);
  assert.deepEqual(sources.map((n) => n.refId), ["src-a", "src-b"]);
  for (const node of sources) {
    assert.equal(node, graph.nodes.get(node.id)); // 返回的是图里同一个节点对象
    assert.equal(node.resolved, true);
  }
  // 空 refs 与未知步骤仍返回空数组
  const { graph: emptyGraph, stepId: emptyStepId } = makeGraph([]);
  assert.deepEqual(emptyGraph.sources(emptyStepId), []);
  assert.deepEqual(emptyGraph.sources("nope"), []);
});
