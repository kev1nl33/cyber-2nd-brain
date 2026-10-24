#!/usr/bin/env node
/** 示例数据结构不变量：只使用公开 sample，不读取 private-data/。
 * 运行：node scripts/test-sample-data.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { SAMPLE_CYBER_THOUGHTS, SAMPLE_BRAIN_DATA } from "../src/sample-data.js";
import { loadGraph } from "../src/graph.js";

const { themes, sources } = SAMPLE_CYBER_THOUGHTS;
const ideas = themes.flatMap((theme) => theme.ideas.map((idea) => ({ theme, idea })));

function assertUniqueIds(items, label) {
  const ids = items.map((item) => item.id);
  for (const id of ids) {
    assert.equal(typeof id, "string", `${label}: id 必须为字符串`);
    assert.ok(id.length > 0, `${label}: id 不为空`);
  }
  assert.equal(new Set(ids).size, ids.length, `${label}: id 唯一`);
}

function sampleGraph() {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  try {
    globalThis.window = {};
    const graph = loadGraph();
    assert.equal(graph.usingSample, true, "无 window 数据时使用 sample");
    return graph;
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else delete globalThis.window;
  }
}

const graph = sampleGraph();

test("五个主题的 id 唯一，每个主题至少有一个问题", () => {
  assert.equal(themes.length, 5);
  assertUniqueIds(themes, "主题");
  for (const theme of themes) {
    assert.ok(Array.isArray(theme.ideas), `${theme.id}: ideas 为数组`);
    assert.ok(theme.ideas.length > 0, `${theme.id}: 至少一个问题`);
  }
});

test("问题 id 全局唯一", () => {
  assertUniqueIds(ideas.map(({ idea }) => idea), "问题");
});

test("每个问题内的步骤 id 唯一，装图后保持数组顺序和链边", () => {
  for (const { theme, idea } of ideas) {
    const steps = idea.nodes || [];
    assert.ok(Array.isArray(steps), `${idea.id}: nodes 为数组`);
    assertUniqueIds(steps, `${idea.id} 步骤`);
    const loaded = graph.steps(theme.id, idea.id);
    assert.deepEqual(loaded.map((step) => step.stepId), steps.map((step) => step.id), idea.id);
    assert.deepEqual(loaded.map((step) => step.index), steps.map((_, i) => i + 1), idea.id);
    for (let i = 1; i < loaded.length; i++) {
      assert.ok(
        graph.edges.some((edge) => edge.from === loaded[i - 1].id && edge.to === loaded[i].id),
        `${idea.id}: 第 ${i} 步连接下一步`
      );
    }
  }
});

test("带 date 的步骤使用 YYYY-MM-DD 且为真实日历日", () => {
  for (const { idea } of ideas) {
    for (const step of idea.nodes || []) {
      if (!("date" in step)) continue;
      const label = `${idea.id}/${step.id}: ${step.date}`;
      assert.equal(typeof step.date, "string", label);
      assert.match(step.date, /^\d{4}-\d{2}-\d{2}$/, label);
      const date = new Date(`${step.date}T00:00:00.000Z`);
      assert.ok(Number.isFinite(date.getTime()), label);
      assert.equal(date.toISOString().slice(0, 10), step.date, label);
    }
  }
});

test("sources 为数组且 id 唯一", () => {
  assert.ok(Array.isArray(sources));
  assertUniqueIds(sources, "来源");
});

test("原始步骤 refs 与装图后的 refIds 全部在 sources 中解析", () => {
  const sourceIds = new Set(sources.map((source) => source.id));
  for (const { theme, idea } of ideas) {
    for (const step of idea.nodes || []) {
      const refIds = (step.refs || []).map((ref) => ref.id);
      assert.deepEqual(graph.step(theme.id, idea.id, step.id).refIds, refIds);
      for (const refId of refIds) {
        assert.ok(sourceIds.has(refId), `${idea.id}/${step.id}: 来源 ${refId} 存在`);
      }
    }
  }
});

test("仅使用 sample 装图时没有缺失引用", () => {
  assert.equal(graph.missingRefs().length, 0);
});

test("sample 图谱的每条边两端节点均存在", () => {
  for (const edge of graph.edges) {
    assert.ok(graph.nodes.has(edge.from), `${edge.id}: 起点 ${edge.from} 存在`);
    assert.ok(graph.nodes.has(edge.to), `${edge.id}: 终点 ${edge.to} 存在`);
  }
});

test("sample 图谱节点 id 唯一，未因 Map 覆盖丢失节点", () => {
  const expectedIds = ["core"];
  for (const theme of themes) expectedIds.push(`theme:${theme.id}`);
  for (const { theme, idea } of ideas) {
    const prefix = `${theme.id}/${idea.id}`;
    expectedIds.push(`idea:${prefix}`);
    if (idea.summary) expectedIds.push(`conclusion:${prefix}`);
    for (const step of idea.nodes || []) {
      expectedIds.push(`step:${prefix}/${step.id}`);
      for (const refId of new Set((step.refs || []).map((ref) => ref.id))) {
        expectedIds.push(`source:${prefix}/${step.id}/${refId}`);
      }
    }
  }
  assert.equal(new Set(expectedIds).size, expectedIds.length, "原始数据生成的节点 id 唯一");
  assert.equal(graph.nodes.size, expectedIds.length, "节点未被覆盖");
  assertUniqueIds([...graph.nodes.values()], "图谱节点");
  assert.deepEqual([...graph.nodes.keys()].sort(), expectedIds.sort());
});

test("SAMPLE_BRAIN_DATA 可导入，records 为数组（允许为空）", () => {
  assert.ok(SAMPLE_BRAIN_DATA && typeof SAMPLE_BRAIN_DATA === "object");
  assert.ok(Array.isArray(SAMPLE_BRAIN_DATA.records));
});
