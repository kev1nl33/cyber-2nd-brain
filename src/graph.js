/**
 * Turns the local `theme -> idea -> nodes -> refs` notes into graph nodes and
 * edges. Node ids are stable and carry the original record ids, so a step can
 * always be traced back to the note it came from.
 */
import { SAMPLE_CYBER_THOUGHTS, SAMPLE_BRAIN_DATA } from "./sample-data.js";

/** @typedef {'core'|'theme'|'idea'|'step'|'conclusion'|'source'} NodeType */
/** @typedef {'core-theme'|'theme-idea'|'recorded'|'inferred'|'source'|'conclusion'} EdgeKind */

/** Four shape families, so a glance tells thought from action from input. */
const STEP_FAMILY = {
  起点: "thought",
  想法: "thought",
  反思: "thought",
  感悟: "thought",
  问题: "thought",
  行动: "action",
  结果: "action",
  输入: "input",
  摘录: "input",
  观察: "input",
  反馈: "input",
  经历: "experience",
};

export function loadGraph() {
  const thoughts = globalThis.window?.CYBER_THOUGHTS;
  const usingSample = !thoughts?.themes?.length;
  const data = usingSample ? SAMPLE_CYBER_THOUGHTS : thoughts;
  const records = usingSample ? SAMPLE_BRAIN_DATA.records : globalThis.window?.BRAIN_DATA?.records || [];

  const recordMap = new Map(records.map((r) => [r.id, r]));
  const sourceMap = new Map((data.sources || []).map((s) => [s.id, s]));

  /** @type {Map<string, any>} */
  const nodes = new Map();
  /** @type {any[]} */
  const edges = [];
  /** @type {{ stepId: string, refId: string }[]} */
  const missingRefs = [];

  const core = {
    id: "core",
    type: "core",
    label: "数字大脑",
    latin: "SECOND BRAIN",
    themeCount: data.themes.length,
  };
  nodes.set(core.id, core);

  let latestOverall = "";

  for (const theme of data.themes) {
    const themeNode = {
      id: `theme:${theme.id}`,
      type: "theme",
      themeId: theme.id,
      label: theme.label,
      latin: theme.en,
      code: theme.code,
      description: theme.description,
      latest: theme.latest,
      ideaCount: (theme.ideas || []).length,
    };
    nodes.set(themeNode.id, themeNode);
    edges.push({ id: `e:core>${theme.id}`, from: core.id, to: themeNode.id, kind: "core-theme" });
    if ((theme.latest || "") > latestOverall) latestOverall = theme.latest || "";

    for (const idea of theme.ideas || []) {
      const ideaNode = {
        id: `idea:${theme.id}/${idea.id}`,
        type: "idea",
        themeId: theme.id,
        ideaId: idea.id,
        label: idea.title,
        summary: idea.summary,
        status: idea.status,
        updated: idea.updated,
        stepCount: (idea.nodes || []).length,
      };
      nodes.set(ideaNode.id, ideaNode);
      edges.push({
        id: `e:${theme.id}>${idea.id}`,
        from: themeNode.id,
        to: ideaNode.id,
        kind: "theme-idea",
      });

      const steps = idea.nodes || [];
      const newestDate = steps.reduce((acc, s) => (s.date > acc ? s.date : acc), "");
      let previousId = null;
      const unconfirmed = [];

      steps.forEach((step, index) => {
        const stepNode = {
          id: `step:${theme.id}/${idea.id}/${step.id}`,
          type: "step",
          themeId: theme.id,
          ideaId: idea.id,
          stepId: step.id,
          index: index + 1,
          total: steps.length,
          label: step.title,
          body: step.body,
          date: step.date,
          kind: step.kind,
          family: STEP_FAMILY[step.kind] || "thought",
          connection: step.connection === "inferred" ? "inferred" : "recorded",
          linkLabel: step.link,
          isNewest: Boolean(step.date) && step.date === newestDate,
          refIds: (step.refs || []).map((r) => r.id),
        };
        nodes.set(stepNode.id, stepNode);
        if (stepNode.connection === "inferred") unconfirmed.push(stepNode.label);

        if (previousId) {
          edges.push({
            id: `e:${previousId}>${stepNode.id}`,
            from: previousId,
            to: stepNode.id,
            kind: stepNode.connection,
            label: step.link,
          });
        }
        previousId = stepNode.id;

        for (const ref of step.refs || []) {
          const sourceNode = {
            id: `source:${theme.id}/${idea.id}/${step.id}/${ref.id}`,
            type: "source",
            themeId: theme.id,
            ideaId: idea.id,
            stepId: step.id,
            refId: ref.id,
            quote: ref.quote,
            ...resolveRef(ref.id, recordMap, sourceMap, missingRefs, stepNode.id),
          };
          if (nodes.has(sourceNode.id)) {
            const existing = nodes.get(sourceNode.id);
            if (ref.quote && existing.quote && !existing.quote.includes(ref.quote)) {
              existing.quote = `${existing.quote}\n${ref.quote}`;
            }
            continue;
          }
          nodes.set(sourceNode.id, sourceNode);
          edges.push({
            id: `e:${stepNode.id}>${ref.id}`,
            from: stepNode.id,
            to: sourceNode.id,
            kind: "source",
          });
        }
      });

      if (idea.summary) {
        const conclusionNode = {
          id: `conclusion:${theme.id}/${idea.id}`,
          type: "conclusion",
          themeId: theme.id,
          ideaId: idea.id,
          label: "阶段理解",
          summary: idea.summary,
          status: idea.status,
          unconfirmed,
          evidence: steps.map((s) => ({ title: s.title, date: s.date, connection: s.connection })),
        };
        nodes.set(conclusionNode.id, conclusionNode);
        if (previousId) {
          edges.push({
            id: `e:${previousId}>conclusion`,
            from: previousId,
            to: conclusionNode.id,
            kind: "conclusion",
          });
        }
      }
    }
  }

  const graph = {
    usingSample,
    latest: latestOverall,
    nodes,
    edges,
    core,
    themes: () => [...nodes.values()].filter((n) => n.type === "theme"),
    theme: (themeId) => nodes.get(`theme:${themeId}`),
    idea: (themeId, ideaId) => nodes.get(`idea:${themeId}/${ideaId}`),
    ideas: (themeId) => [...nodes.values()].filter((n) => n.type === "idea" && n.themeId === themeId),
    steps: (themeId, ideaId) =>
      [...nodes.values()]
        .filter((n) => n.type === "step" && n.themeId === themeId && n.ideaId === ideaId)
        .sort((a, b) => a.index - b.index),
    step: (themeId, ideaId, stepId) => nodes.get(`step:${themeId}/${ideaId}/${stepId}`),
    sources: (stepNodeId) => {
      const step = nodes.get(stepNodeId);
      if (!step) return [];
      return [...new Set(step.refIds)].map((refId) =>
        nodes.get(`source:${step.themeId}/${step.ideaId}/${step.stepId}/${refId}`)
      ).filter(Boolean);
    },
    conclusion: (themeId, ideaId) => nodes.get(`conclusion:${themeId}/${ideaId}`),
    edgesInto: (nodeId) => edges.filter((e) => e.to === nodeId),
    edgesFrom: (nodeId) => edges.filter((e) => e.from === nodeId),
    missingRefs: () => missingRefs,
  };

  if (missingRefs.length) {
    console.warn(
      "[Cyber 2nd Brain] 未能解析的来源引用：",
      missingRefs.map((m) => `${m.refId} @ ${m.stepId}`)
    );
  }

  return graph;
}

/**
 * 二跳关联：和当前步骤引用过同一条来源的其他问题。
 *
 * 只认来源共享，不认关键词相似——同一条 refId 是记录里真实存在的依据，
 * 两个问题引用它，说明它们落在同一份材料上。当前问题本身永远不出现，
 * 同一问题里的其他步骤共享来源也不算出「其他问题」。
 *
 * 关于「同一经验」：lessons.js 里每条经验只归属一个 ideaId，证据步骤也必须
 * 属于该问题（scripts/check-lessons.mjs 有这条断言），所以两个不同问题不可能
 * 挂在同一条经验下。能被数据结构表达的二跳关系只有共享来源这一种，这里就只做它。
 *
 * 每个问题只出现一次，按共同来源条数、问题更新时间、标题排序，最多 5 条。
 * 返回值按问题去重，形状固定，方便浮框直接渲染。
 *
 * @param {ReturnType<typeof loadGraph>} graph
 * @param {string} stepId 节点 id（step:theme/idea/step），或裸步骤 id
 * @param {number} [limit]
 * @returns {{ themeId: string, ideaId: string, label: string, themeLabel: string, updated: string, sharedRefIds: string[], sharedCount: number }[]}
 */
export function relatedIdeas(graph, stepId, limit = 5) {
  const step = findStepNode(graph, stepId);
  if (!step || !step.refIds.length) return [];

  const ownRefs = new Set(step.refIds);
  /** @type {Map<string, { themeId: string, ideaId: string, shared: Set<string> }>} */
  const byIdea = new Map();

  for (const node of graph.nodes.values()) {
    if (node.type !== "step") continue;
    if (node.themeId === step.themeId && node.ideaId === step.ideaId) continue;
    const shared = node.refIds.filter((refId) => ownRefs.has(refId));
    if (!shared.length) continue;
    const key = `${node.themeId}/${node.ideaId}`;
    const entry = byIdea.get(key);
    if (entry) {
      for (const refId of shared) entry.shared.add(refId);
    } else {
      byIdea.set(key, { themeId: node.themeId, ideaId: node.ideaId, shared: new Set(shared) });
    }
  }

  const related = [...byIdea.values()].map((entry) => {
    const idea = graph.idea(entry.themeId, entry.ideaId);
    return {
      themeId: entry.themeId,
      ideaId: entry.ideaId,
      label: idea?.label || entry.ideaId,
      themeLabel: graph.theme(entry.themeId)?.label || entry.themeId,
      updated: idea?.updated || "",
      sharedRefIds: [...entry.shared].sort(),
      sharedCount: entry.shared.size,
    };
  });

  related.sort(
    (a, b) => b.sharedCount - a.sharedCount || compareText(b.updated, a.updated) || compareText(a.label, b.label)
  );

  return related.slice(0, Math.max(0, limit));
}

/** 步骤 id 可能带节点前缀，也可能只是一个 idea 内的步骤 id。 */
function findStepNode(graph, stepId) {
  const direct = graph.nodes.get(stepId);
  if (direct) return direct.type === "step" ? direct : null;
  for (const node of graph.nodes.values()) {
    if (node.type === "step" && node.stepId === stepId) return node;
  }
  return null;
}

/** 与 locale 无关的字符串比较，保证排序在任何环境一致。 */
function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function resolveRef(refId, recordMap, sourceMap, missingRefs, stepId) {
  if (sourceMap.has(refId)) {
    const s = sourceMap.get(refId);
    return {
      label: s.title || refId,
      text: s.text,
      date: s.date,
      kind: s.kind,
      origin: s.origin || "conversation",
      resolved: true,
    };
  }
  if (recordMap.has(refId)) {
    const r = recordMap.get(refId);
    return {
      label: r.title || refId,
      text: r.text,
      date: (r.date || "").slice(0, 10),
      kind: r.kind,
      origin: r.origin || "flomo",
      resolved: true,
    };
  }
  missingRefs.push({ refId, stepId });
  return {
    label: refId,
    text: "本地没有找到这条来源的原文。",
    date: "",
    kind: "缺失",
    origin: "missing",
    resolved: false,
  };
}
