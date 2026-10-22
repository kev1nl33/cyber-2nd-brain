#!/usr/bin/env node
/**
 * F2「二跳关联」的纯逻辑测试：不碰 DOM，也不读 private-data。
 * 自造一份最小图谱（两个主题、多个问题、共享与不共享的来源），
 * 直接验证 relatedIdeas 的去重、排除自身、排序与上限。
 * 运行：node scripts/test-two-hop.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

// graph.js 从 window 上读数据；测试里塞一份 fixture，走的仍是真实加载路径。
globalThis.window = {
  CYBER_THOUGHTS: {
    themes: [
      {
        id: "t1",
        label: "主题甲",
        en: "ALPHA",
        code: "01",
        description: "fixture",
        latest: "2025-01-01",
        ideas: [
          {
            id: "i1",
            title: "问题一",
            summary: "fixture",
            status: "确认",
            updated: "2025-01-01",
            nodes: [
              {
                id: "s1",
                date: "2025-01-01",
                kind: "起点",
                title: "步骤一",
                body: "",
                refs: [{ id: "r1", quote: "引用一" }, { id: "r2", quote: "引用二" }],
              },
              {
                id: "s2",
                date: "2025-01-02",
                kind: "行动",
                title: "步骤二",
                body: "",
                refs: [{ id: "r2", quote: "引用二" }],
                connection: "recorded",
                link: "然后",
              },
            ],
          },
          {
            id: "i2",
            title: "问题二",
            summary: "fixture",
            status: "确认",
            updated: "2025-01-01",
            nodes: [
              {
                id: "s3",
                date: "2025-01-03",
                kind: "想法",
                title: "步骤三",
                body: "",
                refs: [{ id: "r1", quote: "引用一" }],
              },
            ],
          },
          {
            id: "i3",
            title: "问题三",
            summary: "fixture",
            status: "确认",
            updated: "2025-01-05",
            nodes: [
              {
                id: "s4",
                date: "2025-01-04",
                kind: "观察",
                title: "步骤四",
                body: "",
                refs: [{ id: "r4", quote: "引用四" }],
              },
              {
                id: "s4b",
                date: "2025-01-05",
                kind: "反思",
                title: "无来源步骤",
                body: "",
                refs: [],
                connection: "recorded",
                link: "然后",
              },
            ],
          },
        ],
      },
      {
        id: "t2",
        label: "主题乙",
        en: "BETA",
        code: "02",
        description: "fixture",
        latest: "2025-07-01",
        ideas: [
          {
            // 同一个问题里的两步分别引用 r1、r2：应合并成一条，共同来源计 2。
            id: "j1",
            title: "问题四",
            summary: "fixture",
            status: "确认",
            updated: "2025-02-01",
            nodes: [
              {
                id: "s5",
                date: "2025-02-01",
                kind: "输入",
                title: "步骤五",
                body: "",
                refs: [{ id: "r1", quote: "引用一" }],
              },
              {
                id: "s6",
                date: "2025-02-02",
                kind: "行动",
                title: "步骤六",
                body: "",
                refs: [{ id: "r2", quote: "引用二" }],
                connection: "recorded",
                link: "然后",
              },
            ],
          },
          ...["问题五", "问题六", "问题七", "问题八", "问题九"].map((title, index) => {
            const month = String(index + 3).padStart(2, "0"); // 03..07，更新越晚越靠前
            return {
              id: `j${index + 2}`,
              title,
              summary: "fixture",
              status: "确认",
              updated: `2025-${month}-01`,
              nodes: [
                {
                  id: `js${index + 1}`,
                  date: `2025-${month}-01`,
                  kind: "想法",
                  title: `步骤${title}`,
                  body: "",
                  refs: [{ id: "r1", quote: "引用一" }],
                },
              ],
            };
          }),
          {
            // 只有 r3，和二跳无关。
            id: "j7",
            title: "问题十",
            summary: "fixture",
            status: "确认",
            updated: "2025-08-01",
            nodes: [
              {
                id: "s12",
                date: "2025-08-01",
                kind: "想法",
                title: "步骤十",
                body: "",
                refs: [{ id: "r3", quote: "引用三" }],
              },
            ],
          },
        ],
      },
    ],
    sources: [
      { id: "r1", title: "来源一", date: "2025-01-01", kind: "fixture", origin: "sample", text: "原文一" },
      { id: "r2", title: "来源二", date: "2025-01-02", kind: "fixture", origin: "sample", text: "原文二" },
      { id: "r3", title: "来源三", date: "2025-01-03", kind: "fixture", origin: "sample", text: "原文三" },
      { id: "r4", title: "来源四", date: "2025-01-04", kind: "fixture", origin: "sample", text: "原文四" },
    ],
    meta: {},
  },
  BRAIN_DATA: { meta: {}, records: [] },
};

const { loadGraph, relatedIdeas } = await import("../src/graph.js");

const graph = loadGraph();
const keyOf = (item) => `${item.themeId}/${item.ideaId}`;

test("共享同一来源的其他问题被列出，自己的问题不出现", () => {
  // 上面的 fixture 里 j2..j6 是「问题五」到「问题九」。
  const related = relatedIdeas(graph, "step:t1/i1/s1");
  assert.ok(related.length > 0, "应找到相关问题");
  assert.ok(!related.some((item) => item.themeId === "t1" && item.ideaId === "i1"), "不包含当前问题自身");
  assert.ok(
    related.every((item) => item.sharedRefIds.length > 0),
    "每条都有共享来源"
  );
});

test("同一问题里的多个步骤合并成一条，共同来源去重计数", () => {
  const related = relatedIdeas(graph, "step:t1/i1/s1");
  const sameIdea = related.filter((item) => item.themeId === "t2" && item.ideaId === "j1");
  assert.equal(sameIdea.length, 1, "同一个问题只出现一次");
  // 当前步骤引用 r1、r2；j1 的两步分别引用 r1 和 r2，所以共同来源是 2 条而不是 2 次。
  assert.deepEqual(sameIdea[0].sharedRefIds, ["r1", "r2"]);
  assert.equal(sameIdea[0].sharedCount, 2);
});

test("按共同来源条数、更新时间排序", () => {
  const related = relatedIdeas(graph, "step:t1/i1/s1");
  assert.equal(keyOf(related[0]), "t2/j1", "共同来源最多的排最前");
  const rest = related.slice(1).map((item) => item.ideaId);
  // 其余都只有 1 条共同来源（r1），按问题更新时间从新到旧：问题九(07) → 问题八(06) → …
  assert.deepEqual(rest, ["j6", "j5", "j4", "j3"], "同分时更新时间新的在前");
});

test("最多返回 5 条", () => {
  const related = relatedIdeas(graph, "step:t1/i1/s1");
  assert.equal(related.length, 5, "上限 5 条");
  assert.equal(relatedIdeas(graph, "step:t1/i1/s1", 2).length, 2, "limit 参数生效");
});

test("只有一条共同来源时也能列出，并带上问题与主题名", () => {
  const related = relatedIdeas(graph, "step:t1/i1/s2"); // 只引用 r2
  assert.equal(related.length, 1);
  assert.equal(keyOf(related[0]), "t2/j1");
  assert.deepEqual(related[0].sharedRefIds, ["r2"]);
  assert.equal(related[0].label, "问题四");
  assert.equal(related[0].themeLabel, "主题乙");
});

test("没有共享来源时整节为空", () => {
  assert.deepEqual(relatedIdeas(graph, "step:t1/i3/s4"), []);
});

test("步骤本身没有来源时为空", () => {
  assert.deepEqual(relatedIdeas(graph, "step:t1/i3/s4b"), []);
});

test("未知步骤返回空，不抛错", () => {
  assert.deepEqual(relatedIdeas(graph, "step:t9/i9/s9"), []);
  assert.deepEqual(relatedIdeas(graph, "nope"), []);
});

test("传裸步骤 id 也能解析", () => {
  const byNodeId = relatedIdeas(graph, "step:t1/i1/s1");
  const byStepId = relatedIdeas(graph, "s1");
  assert.deepEqual(byStepId, byNodeId);
});
