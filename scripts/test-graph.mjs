#!/usr/bin/env node
/** loadGraph 数据解析测试：示例数据回退、节点/边映射、来源解析、缺失引用与边界。
 * 运行：node scripts/test-graph.mjs（数据全部来自测试内 fixture，不读 private-data/）。 */
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { loadGraph } from "../src/graph.js";

// loadGraph 每次调用都重新读 globalThis.window，测试之间互不污染。
const warnings = [];
const realWarn = console.warn;
console.warn = (...args) => warnings.push(args.map(String).join(" "));
after(() => {
  console.warn = realWarn;
});

function useSample() {
  delete globalThis.window;
  warnings.length = 0;
  return loadGraph();
}

/** @param {any} thoughts @param {any[]} records */
function makeGraph(thoughts, records = []) {
  globalThis.window = { CYBER_THOUGHTS: thoughts, BRAIN_DATA: { records } };
  warnings.length = 0;
  return loadGraph();
}

function fixtureTheme() {
  return {
    id: "t1",
    label: "测试主题",
    en: "TEST",
    code: "99",
    description: "主题描述",
    latest: "2026-01-02",
    ideas: [
      {
        id: "i1",
        title: "问题一",
        summary: "阶段结论",
        status: "进行中",
        updated: "2026-01-02",
        nodes: [
          {
            id: "s1", date: "2026-01-01", kind: "起点", title: "第一步", body: "说明一",
            refs: [{ id: "src-a", quote: "引用一" }], connection: "recorded", link: "然后",
          },
          { id: "s2", date: "2026-01-02", kind: "行动", title: "第二步", body: "说明二", refs: [], connection: "inferred", link: "推测" },
          {
            id: "s3", date: "2026-01-02", kind: "未知类型", title: "第三步", body: "说明三",
            refs: [{ id: "missing-x" }, { id: "rec-1" }], connection: "recorded", link: "于是",
          },
        ],
      },
      { id: "i2", title: "问题二", nodes: [] }, // 无摘要、无步骤
    ],
  };
}
const FIXTURE_SOURCES = [
  { id: "src-a", title: "来源甲", date: "2025-12-31", kind: "书", origin: "sample", text: "原文甲" },
];
const FIXTURE_RECORDS = [
  { id: "rec-1", title: "记录一", date: "2026-01-02T21:30:00", kind: "flomo", text: "记录原文" },
];
function fixtureGraph() {
  return makeGraph({ themes: [fixtureTheme()], sources: FIXTURE_SOURCES }, FIXTURE_RECORDS);
}

test("无 window 数据时回退到 src/sample-data.js", () => {
  const graph = useSample();
  assert.equal(graph.usingSample, true);
  assert.equal(graph.themes().length, 5);
  assert.equal(graph.core.type, "core");
  assert.equal(graph.core.label, "数字大脑");
  assert.equal(graph.latest, "2026-10-17"); // 主题 latest 的最大值
  assert.equal(graph.missingRefs().length, 0);
});

test("themes 为空数组也回退到示例数据", () => {
  const graph = makeGraph({ themes: [], sources: [] });
  assert.equal(graph.usingSample, true);
  assert.equal(graph.themes().length, 5);
});

test("主题 / 问题 / 步骤节点 id 稳定且携带原始 id", () => {
  const graph = fixtureGraph();
  const theme = graph.theme("t1");
  assert.equal(theme.id, "theme:t1");
  assert.equal(theme.label, "测试主题");
  assert.equal(theme.latin, "TEST");
  assert.equal(theme.code, "99");
  assert.equal(theme.ideaCount, 2);
  assert.equal(theme.latest, "2026-01-02");
  const idea = graph.idea("t1", "i1");
  assert.equal(idea.id, "idea:t1/i1");
  assert.equal(idea.label, "问题一");
  assert.equal(idea.stepCount, 3);
  assert.equal(idea.updated, "2026-01-02");
  const step = graph.step("t1", "i1", "s2");
  assert.equal(step.id, "step:t1/i1/s2");
  assert.equal(step.index, 2);
  assert.equal(step.total, 3);
  assert.deepEqual(
    graph.steps("t1", "i1").map((s) => s.id),
    ["step:t1/i1/s1", "step:t1/i1/s2", "step:t1/i1/s3"]
  );
});

test("步骤 kind 映射到形状家族，未知 kind 归为 thought", () => {
  const graph = fixtureGraph();
  assert.equal(graph.step("t1", "i1", "s1").family, "thought"); // 起点
  assert.equal(graph.step("t1", "i1", "s2").family, "action"); // 行动
  assert.equal(graph.step("t1", "i1", "s3").family, "thought"); // 未登记的 kind
  const other = makeGraph({
    themes: [
      {
        id: "t", label: "L", latest: "", ideas: [
          { id: "i", title: "Q", nodes: [{ id: "a", kind: "输入", title: "x" }, { id: "b", kind: "经历", title: "y" }] },
        ],
      },
    ],
    sources: [],
  });
  assert.equal(other.step("t", "i", "a").family, "input");
  assert.equal(other.step("t", "i", "b").family, "experience");
  assert.equal(other.latest, ""); // 主题缺 latest 时不崩
});

test("步骤链边：连接类型与 link 标签落到边上", () => {
  const graph = fixtureGraph();
  const s1 = graph.step("t1", "i1", "s1").id;
  const s2 = graph.step("t1", "i1", "s2").id;
  const s3 = graph.step("t1", "i1", "s3").id;
  const e12 = graph.edges.find((e) => e.from === s1 && e.to === s2);
  assert.equal(e12.kind, "inferred"); // 第二步未在笔记中确认
  assert.equal(e12.label, "推测");
  const e23 = graph.edges.find((e) => e.from === s2 && e.to === s3);
  assert.equal(e23.kind, "recorded");
  assert.equal(e23.label, "于是");
  assert.equal(graph.edgesInto(s1).length, 0); // 链首无入边
  assert.equal(graph.edgesInto(s2).length, 1);
  assert.equal(graph.edgesFrom(s1).length, 2); // 链边 + 来源边
});

test("结论节点：跟随最后一步，收集未确认步骤与证据", () => {
  const graph = fixtureGraph();
  const c = graph.conclusion("t1", "i1");
  assert.equal(c.id, "conclusion:t1/i1");
  assert.equal(c.summary, "阶段结论");
  assert.deepEqual(c.unconfirmed, ["第二步"]);
  assert.equal(c.evidence.length, 3);
  assert.deepEqual(c.evidence[1], { title: "第二步", date: "2026-01-02", connection: "inferred" });
  const into = graph.edgesInto(c.id);
  assert.equal(into.length, 1);
  assert.equal(into[0].from, graph.step("t1", "i1", "s3").id);
  assert.equal(into[0].kind, "conclusion");
});

test("无 summary 的问题不生成结论节点", () => {
  const graph = fixtureGraph();
  assert.equal(graph.conclusion("t1", "i2"), undefined);
});

test("来源解析：sources 优先，记录日期截到天，origin 有默认值", () => {
  const graph = fixtureGraph();
  const srcA = graph.sources(graph.step("t1", "i1", "s1").id)[0];
  assert.equal(srcA.label, "来源甲");
  assert.equal(srcA.text, "原文甲");
  assert.equal(srcA.resolved, true);
  assert.equal(srcA.origin, "sample");
  const rec1 = graph.sources(graph.step("t1", "i1", "s3").id).find((n) => n.refId === "rec-1");
  assert.equal(rec1.label, "记录一"); // flomo 记录
  assert.equal(rec1.date, "2026-01-02"); // ISO 时间截到天
  assert.equal(rec1.origin, "flomo"); // 记录缺 origin 时默认 flomo
  const noOrigin = makeGraph(
    { themes: [{ id: "t", label: "L", ideas: [{ id: "i", title: "Q", nodes: [{ id: "s", kind: "起点", title: "T", refs: [{ id: "x" }] }] }] }],
      sources: [{ id: "x", title: "X", date: "2026-01-01", kind: "k", text: "t" }] } // 缺 origin
  );
  assert.equal(noOrigin.sources(noOrigin.step("t", "i", "s").id)[0].origin, "conversation");
});

test("缺失引用：占位节点 + missingRefs + 警告一次", () => {
  const graph = fixtureGraph();
  const missing = graph.sources(graph.step("t1", "i1", "s3").id).find((n) => n.refId === "missing-x");
  assert.equal(missing.resolved, false);
  assert.equal(missing.kind, "缺失");
  assert.equal(missing.origin, "missing");
  assert.equal(missing.text, "本地没有找到这条来源的原文。");
  assert.deepEqual(graph.missingRefs(), [{ refId: "missing-x", stepId: "step:t1/i1/s3" }]);
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0].includes("未能解析的来源引用"), warnings[0]);
  assert.ok(warnings[0].includes("missing-x"));
});

test("同一来源在同一步骤里重复引用：节点去重，引文合并，只留一条边", () => {
  const graph = makeGraph({
    themes: [
      {
        id: "t", label: "L", ideas: [
          {
            id: "i", title: "Q", nodes: [
              { id: "s", date: "2026-01-01", kind: "起点", title: "T", refs: [{ id: "dup", quote: "第一段" }, { id: "dup", quote: "第二段" }] },
            ],
          },
        ],
      },
    ],
    sources: [{ id: "dup", title: "重复", text: "原文" }],
  });
  const stepId = graph.step("t", "i", "s").id;
  const sources = graph.sources(stepId);
  assert.equal(new Set(sources).size, 1); // refIds 未去重，重复引用返回同一节点
  assert.equal(sources[0].quote, "第一段\n第二段");
  assert.equal([...graph.nodes.values()].filter((n) => n.type === "source").length, 1);
  assert.equal(graph.edges.filter((e) => e.kind === "source").length, 1);
});

test("同一来源被两个步骤引用：各建一个节点，id 含步骤 id", () => {
  const graph = makeGraph({
    themes: [
      {
        id: "t", label: "L", ideas: [
          {
            id: "i", title: "Q", nodes: [
              { id: "s1", date: "2026-01-01", kind: "起点", title: "A", refs: [{ id: "shared" }] },
              { id: "s2", date: "2026-01-02", kind: "结果", title: "B", refs: [{ id: "shared" }] },
            ],
          },
        ],
      },
    ],
    sources: [{ id: "shared", title: "共用", text: "原文" }],
  });
  const first = graph.sources(graph.step("t", "i", "s1").id);
  const second = graph.sources(graph.step("t", "i", "s2").id);
  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  assert.notEqual(first[0].id, second[0].id); // source:t/i/s1/shared ≠ source:t/i/s2/shared
  assert.equal([...graph.nodes.values()].filter((n) => n.type === "source").length, 2);
  assert.equal(graph.edges.filter((e) => e.kind === "source").length, 2);
});

test("缺日期：无日期步骤不标记最新，日期并列时并列标记", () => {
  const graph = makeGraph({
    themes: [
      {
        id: "t", label: "L", ideas: [
          {
            id: "i", title: "Q", nodes: [
              { id: "a", date: "2026-01-01", kind: "起点", title: "A" },
              { id: "b", kind: "行动", title: "B" }, // 无日期
              { id: "c", date: "2026-01-03", kind: "结果", title: "C" },
            ],
          },
        ],
      },
    ],
    sources: [],
  });
  assert.equal(graph.step("t", "i", "a").isNewest, false);
  assert.equal(graph.step("t", "i", "b").isNewest, false);
  assert.equal(graph.step("t", "i", "c").isNewest, true);
  const tie = makeGraph({
    themes: [
      {
        id: "t", label: "L", ideas: [
          {
            id: "i", title: "Q", nodes: [
              { id: "a", date: "2026-02-01", kind: "起点", title: "A" },
              { id: "b", date: "2026-02-01", kind: "反思", title: "B" },
            ],
          },
        ],
      },
    ],
    sources: [],
  });
  assert.equal(tie.step("t", "i", "a").isNewest, true);
  assert.equal(tie.step("t", "i", "b").isNewest, true);
});

test("单节点：一步一结论的完整链", () => {
  const graph = makeGraph({
    themes: [
      {
        id: "t", label: "L", latest: "2026-05-05", ideas: [
          { id: "i", title: "Q", summary: "S", nodes: [{ id: "only", date: "2026-05-05", kind: "起点", title: "唯一" }] },
        ],
      },
    ],
    sources: [],
  });
  const steps = graph.steps("t", "i");
  assert.equal(steps.length, 1);
  assert.equal(steps[0].index, 1);
  assert.equal(steps[0].total, 1);
  assert.equal(steps[0].isNewest, true);
  const conclusion = graph.conclusion("t", "i");
  assert.equal(graph.edgesInto(conclusion.id).length, 1);
  assert.equal(graph.edgesInto(conclusion.id)[0].from, steps[0].id);
  assert.equal(graph.latest, "2026-05-05");
});

test("步骤为空但有摘要：结论节点存在，却没有任何入边", () => {
  const graph = makeGraph({
    themes: [{ id: "t", label: "L", ideas: [{ id: "i", title: "Q", summary: "S", nodes: [] }] }],
    sources: [],
  });
  const conclusion = graph.conclusion("t", "i");
  assert.ok(conclusion);
  assert.equal(graph.edgesInto(conclusion.id).length, 0);
});

test("访问器对未知 id 的行为", () => {
  const graph = fixtureGraph();
  assert.equal(graph.theme("nope"), undefined);
  assert.deepEqual(graph.ideas("nope"), []);
  assert.deepEqual(graph.steps("t1", "nope"), []);
  assert.equal(graph.step("t1", "i1", "nope"), undefined);
  assert.equal(graph.step("nope", "i", "s"), undefined);
  assert.deepEqual(graph.sources("nope"), []);
  assert.deepEqual(graph.sources(graph.step("t1", "i1", "s2").id), []); // 无 refs 的步骤
  assert.equal(graph.conclusion("nope", "x"), undefined);
});

test("从 core 出发沿边遍历：id 唯一、边都指向存在的节点、无环", () => {
  for (const graph of [useSample(), fixtureGraph()]) {
    const ids = [...graph.nodes.keys()];
    assert.equal(new Set(ids).size, ids.length, "节点 id 唯一");
    assert.ok(graph.edges.every((e) => graph.nodes.has(e.from) && graph.nodes.has(e.to)), "边都指向存在的节点");
    const adj = new Map();
    for (const e of graph.edges) adj.set(e.from, [...(adj.get(e.from) || []), e.to]);
    let hasCycle = false;
    const walk = (id, path) => {
      if (hasCycle) return;
      for (const next of adj.get(id) || []) {
        if (path.has(next)) {
          hasCycle = true;
          return;
        }
        path.add(next);
        walk(next, path);
        path.delete(next);
      }
    };
    walk("core", new Set(["core"]));
    assert.equal(hasCycle, false, "图谱无环");
  }
});
