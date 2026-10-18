import { SAMPLE_CYBER_THOUGHTS, SAMPLE_BRAIN_DATA } from "./sample-data.js";

/** @typedef {'core'|'theme'|'idea'|'step'|'conclusion'|'source'} NodeType */

/**
 * @returns {{ graph: import('./model.js').BrainGraph, usingSample: boolean }}
 */
export function loadGraph() {
  const thoughts = window.CYBER_THOUGHTS;
  const brain = window.BRAIN_DATA;
  const usingSample = !thoughts?.themes?.length;
  const data = usingSample ? SAMPLE_CYBER_THOUGHTS : thoughts;
  const records = usingSample ? SAMPLE_BRAIN_DATA.records : brain?.records || [];

  const recordMap = new Map(records.map((r) => [r.id, r]));
  const sourceMap = new Map((data.sources || []).map((s) => [s.id, s]));

  /** @type {Map<string, GraphNode>} */
  const nodes = new Map();
  /** @type {GraphEdge[]} */
  const edges = [];

  nodes.set("core", {
    id: "core",
    type: "core",
    label: "数字大脑",
    x: 0,
    y: 0,
  });

  const missingRefs = [];

  for (const theme of data.themes) {
    const themeNodeId = `theme:${theme.id}`;
    nodes.set(themeNodeId, {
      id: themeNodeId,
      type: "theme",
      themeId: theme.id,
      label: theme.label,
      en: theme.en,
      code: theme.code,
      description: theme.description,
      ideaCount: theme.ideas?.length ?? 0,
      latest: theme.latest,
      x: 0,
      y: 0,
    });
    edges.push({ id: `e-core-${theme.id}`, from: "core", to: themeNodeId, kind: "link" });

    for (const idea of theme.ideas || []) {
      const ideaNodeId = `idea:${theme.id}/${idea.id}`;
      nodes.set(ideaNodeId, {
        id: ideaNodeId,
        type: "idea",
        themeId: theme.id,
        ideaId: idea.id,
        label: idea.title,
        summary: idea.summary,
        status: idea.status,
        updated: idea.updated,
        x: 0,
        y: 0,
      });
      edges.push({ id: `e-${theme.id}-idea-${idea.id}`, from: themeNodeId, to: ideaNodeId, kind: "theme-idea" });

      const stepNodes = idea.nodes || [];
      let newestIdx = 0;
      let newestDate = "";
      stepNodes.forEach((step, i) => {
        const date = step.date || "";
        if (date >= newestDate) {
          newestDate = date;
          newestIdx = i;
        }
      });
      let prevStepId = null;
      const pendingTitles = [];
      for (let i = 0; i < stepNodes.length; i++) {
        const step = stepNodes[i];
        const stepNodeId = `step:${theme.id}/${idea.id}/${step.id}`;
        nodes.set(stepNodeId, {
          id: stepNodeId,
          type: "step",
          themeId: theme.id,
          ideaId: idea.id,
          stepId: step.id,
          index: i + 1,
          label: step.title,
          body: step.body,
          date: step.date,
          kind: step.kind,
          connection: step.connection || "recorded",
          linkLabel: step.link,
          refs: step.refs || [],
          isNewestInIdea: i === newestIdx,
          x: 0,
          y: 0,
        });

        if (prevStepId) {
          const conn = step.connection === "inferred" ? "inferred" : "recorded";
          edges.push({
            id: `e-step-${prevStepId}-${stepNodeId}`,
            from: prevStepId,
            to: stepNodeId,
            kind: conn,
          });
        }
        prevStepId = stepNodeId;
        if (step.connection === "inferred") pendingTitles.push(step.title);

        for (const ref of step.refs || []) {
          const srcNodeId = `source:${theme.id}/${idea.id}/${step.id}/${ref.id}`;
          if (nodes.has(srcNodeId)) {
            const existing = nodes.get(srcNodeId);
            if (ref.quote && existing.quote && !existing.quote.includes(ref.quote)) {
              existing.quote = `${existing.quote}\n\n${ref.quote}`;
            }
          } else {
            const resolved = resolveRefText(ref.id, recordMap, sourceMap);
            if (!resolved.found) missingRefs.push({ stepNodeId, refId: ref.id });
            nodes.set(srcNodeId, {
              id: srcNodeId,
              type: "source",
              themeId: theme.id,
              ideaId: idea.id,
              stepId: step.id,
              refId: ref.id,
              label: resolved.title || ref.id,
              quote: ref.quote,
              text: resolved.text,
              date: resolved.date,
              kind: resolved.kind,
              origin: resolved.origin,
              x: 0,
              y: 0,
            });
          }
          const edgeId = `e-src-${stepNodeId}-${ref.id}`;
          if (!edges.some((e) => e.id === edgeId)) {
            edges.push({
              id: edgeId,
              from: stepNodeId,
              to: srcNodeId,
              kind: "source",
            });
          }
        }
      }

      if (idea.summary) {
        const conclId = `conclusion:${theme.id}/${idea.id}`;
        nodes.set(conclId, {
          id: conclId,
          type: "conclusion",
          themeId: theme.id,
          ideaId: idea.id,
          label: "阶段理解",
          summary: idea.summary,
          status: idea.status,
          pendingTitles,
          evidence: stepNodes.map((step) => ({
            title: step.title,
            date: step.date,
            connection: step.connection || "recorded",
          })),
          x: 0,
          y: 0,
        });
        if (prevStepId) {
          const curated =
            pendingTitles.length > 0 ||
            /待验证|待确认|探索|整理|开放|示例/.test(idea.status || "");
          edges.push({
            id: `e-concl-${prevStepId}`,
            from: prevStepId,
            to: conclId,
            kind: curated ? "inferred" : "recorded",
          });
        }
      }
    }
  }

  if (missingRefs.length) {
    console.warn(
      "[Cyber 2nd Brain] 以下来源 ID 未能解析:",
      missingRefs.map((m) => `${m.refId} @ ${m.stepNodeId}`)
    );
  }

  return {
    usingSample,
    graph: {
      themes: data.themes,
      nodes,
      edges,
      recordMap,
      sourceMap,
      validateRefs: () => missingRefs,
    },
  };
}

function resolveRefText(refId, recordMap, sourceMap) {
  if (sourceMap.has(refId)) {
    const s = sourceMap.get(refId);
    return {
      found: true,
      title: s.title,
      text: s.text,
      date: s.date,
      kind: s.kind,
      origin: s.origin || "conversation",
    };
  }
  if (recordMap.has(refId)) {
    const r = recordMap.get(refId);
    return {
      found: true,
      title: r.title || refId,
      text: r.text,
      date: r.date?.slice(0, 10),
      kind: r.kind,
      origin: r.origin || "flomo",
    };
  }
  return { found: false, title: refId, text: "（未找到原文）", date: "", kind: "", origin: "" };
}

/** @param {BrainGraph} graph @param {string} themeId */
export function getTheme(graph, themeId) {
  return graph.themes.find((t) => t.id === themeId);
}

/** @param {BrainGraph} graph @param {string} themeId @param {string} ideaId */
export function getIdea(graph, themeId, ideaId) {
  const theme = getTheme(graph, themeId);
  return theme?.ideas?.find((i) => i.id === ideaId);
}

/** @param {BrainGraph} graph @param {string} stepNodeId */
export function getStepNode(graph, stepNodeId) {
  return graph.nodes.get(stepNodeId);
}

/**
 * @typedef {Object} GraphNode
 * @property {string} id
 * @property {NodeType} type
 * @property {string} [themeId]
 * @property {string} [ideaId]
 * @property {string} [stepId]
 * @property {string} [refId]
 * @property {string} label
 * @property {number} [x]
 * @property {number} [y]
 * @property {number} [tx]
 * @property {number} [ty]
 */

/**
 * @typedef {Object} GraphEdge
 * @property {string} id
 * @property {string} from
 * @property {string} to
 * @property {'link'|'theme-idea'|'recorded'|'inferred'|'source'} kind
 */

/**
 * @typedef {Object} BrainGraph
 * @property {object[]} themes
 * @property {Map<string, GraphNode>} nodes
 * @property {GraphEdge[]} edges
 * @property {Map} recordMap
 * @property {Map} sourceMap
 * @property {() => object[]} validateRefs
 */
