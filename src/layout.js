/** @typedef {import('./route.js').RouteState} RouteState */
/** @typedef {import('./model.js').BrainGraph} BrainGraph */
/** @typedef {import('./model.js').GraphNode} GraphNode */

const TAU = Math.PI * 2;
const THEME_ANGLES = [ -Math.PI / 2, -Math.PI / 2 + TAU / 5, -Math.PI / 2 + (2 * TAU) / 5, -Math.PI / 2 + (3 * TAU) / 5, -Math.PI / 2 + (4 * TAU) / 5 ];

function polar(angle, radius) {
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

/**
 * Compute layout targets for visible nodes.
 * @param {BrainGraph} graph
 * @param {RouteState} route
 * @param {{ sourcesExpanded?: boolean, sourceStepId?: string, compact?: boolean }} ui
 * @returns {{ visibleIds: Set<string>, edges: import('./model.js').GraphEdge[], focusId: string }}
 */
export function computeLayout(graph, route, ui = {}) {
  const visibleIds = new Set(["core"]);
  const activeTheme = route.themeId;
  const activeIdea = route.ideaId;
  const level = route.level;
  const compact = !!ui.compact;

  /** @type {Record<string, {x:number,y:number,scale?:number, dim?:boolean, hidden?:boolean}>} */
  const targets = {};

  if (level === "overview") {
    targets.core = { x: 0, y: 0, scale: 1, dim: false, angle: Math.PI / 2, fit: true };
  } else {
    const corePos = polar(Math.PI / 2, compact ? 188 : 300);
    targets.core = { ...corePos, scale: 0.42, dim: true, angle: Math.PI / 2, fit: !compact };
  }

  graph.themes.forEach((theme, i) => {
    const id = `theme:${theme.id}`;
    const angle = THEME_ANGLES[i] ?? 0;
    const isActive = theme.id === activeTheme && level !== "overview";
    const overviewR = compact ? 158 : 268;

    if (level === "overview") {
      const pos = polar(angle, overviewR);
      targets[id] = { ...pos, scale: 0.78, dim: false, angle, fit: true };
      visibleIds.add(id);
    } else if (isActive) {
      targets[id] = { x: 0, y: 0, scale: 1, dim: false, angle: Math.PI / 2, fit: true };
      visibleIds.add(id);
    } else {
      const pos = polar(angle, compact ? 360 : 540);
      targets[id] = { ...pos, scale: 0.36, dim: true, angle, fit: false };
      visibleIds.add(id);
    }
  });

  if (level === "overview") {
    return pack(graph, visibleIds, targets, "core", route, ui);
  }

  const theme = graph.themes.find((t) => t.id === activeTheme);
  if (!theme) return pack(graph, visibleIds, targets, "core", route, ui);

  const ideas = theme.ideas || [];
  const ideaCount = ideas.length;
  ideas.forEach((idea, idx) => {
    const id = `idea:${theme.id}/${idea.id}`;
    const gap = 0.95;
    const usable = TAU - gap;
    const angle = -Math.PI / 2 + gap / 2 + ((idx + 0.5) * usable) / Math.max(ideaCount, 1);

    if (level === "theme") {
      const pos = polar(angle, compact ? 156 : 210);
      targets[id] = { ...pos, scale: 1, dim: false, angle, fit: true };
      visibleIds.add(id);
    } else if (idea.id === activeIdea) {
      const activeAngle = Math.PI;
      const pos = polar(activeAngle, compact ? 124 : 220);
      targets[id] = { ...pos, scale: 1, dim: false, angle: activeAngle, fit: true };
      visibleIds.add(id);
    } else {
      const park = Math.PI / 2 + (idx + 1) * 0.62;
      const pos = polar(park, compact ? 238 : 300);
      targets[id] = { ...pos, scale: 0.72, dim: true, angle: park, fit: false };
      visibleIds.add(id);
    }
  });

  if (level === "idea" || level === "step") {
    const idea = ideas.find((i) => i.id === activeIdea);
    if (idea) {
      const steps = idea.nodes || [];
      const gapA = steps.length > 4 ? 0.46 : 0.58;
      const radius = 228;
      const compactCount = steps.length + (graph.nodes.has(`conclusion:${theme.id}/${idea.id}`) ? 1 : 0);
      const compactRows = Math.ceil(compactCount / 5);
      const compactX = (index) => {
        const row = Math.floor(index / 5);
        const inRow = index % 5;
        const rowCount = Math.min(5, compactCount - row * 5);
        const slot = row % 2 ? rowCount - 1 - inRow : inRow;
        return rowCount < 2 ? 0 : -160 + slot * (320 / (rowCount - 1));
      };
      const compactY = (index) => -148 - (compactRows - 1 - Math.floor(index / 5)) * 82;

      steps.forEach((step, i) => {
        const sid = `step:${theme.id}/${idea.id}/${step.id}`;
        const ang = Math.PI + gapA * (i + 1);
        const pos = compact ? { x: compactX(i), y: compactY(i) } : polar(ang, radius);
        targets[sid] = { ...pos, scale: 1, angle: ang, fit: true };
        visibleIds.add(sid);
      });

      const conclId = `conclusion:${theme.id}/${idea.id}`;
      if (graph.nodes.has(conclId)) {
        const ang = Math.PI + gapA * (steps.length + 1);
        const pos = compact ? { x: compactX(steps.length), y: compactY(steps.length) } : polar(ang, radius + 16);
        targets[conclId] = { ...pos, scale: 1, angle: ang, fit: true };
        visibleIds.add(conclId);
      }

      if (level === "step" && route.stepId && route.stepId !== "conclusion") {
        const stepKey = `step:${theme.id}/${idea.id}/${route.stepId}`;
        const stepNode = graph.nodes.get(stepKey);
        if (stepNode && (ui.sourcesExpanded || route.sourcesExpanded)) {
          const refs = [...new Map((stepNode.refs || []).map((ref) => [ref.id, ref])).values()];
          const base = targets[stepKey] || { x: 0, y: 0, angle: 0 };
          const outward = base.angle ?? Math.atan2(base.y, base.x);
          refs.forEach((ref, ri) => {
            const srcId = `source:${theme.id}/${idea.id}/${route.stepId}/${ref.id}`;
            const spread = (ri - (refs.length - 1) / 2) * 0.5;
            const ang = outward + spread;
            const compactX = Math.max(-150, Math.min(150, base.x + (ri - (refs.length - 1) / 2) * 70));
            targets[srcId] = {
              x: compact ? compactX : base.x + Math.cos(ang) * 124,
              y: compact ? -52 + ri * 32 : base.y + Math.sin(ang) * 124,
              scale: 0.9,
              angle: compact ? -Math.PI / 2 : ang,
              fit: true,
            };
            visibleIds.add(srcId);
          });
        }
      }
    }
  }

  let focusId = "core";
  if (level === "theme" && activeTheme) focusId = `theme:${activeTheme}`;
  else if (level === "idea" && activeTheme) focusId = `theme:${activeTheme}`;
  else if (level === "step" && activeTheme) focusId = `theme:${activeTheme}`;

  return pack(graph, visibleIds, targets, focusId, route, ui);
}

function pack(graph, visibleIds, targets, focusId, route, ui) {
  const edges = graph.edges.filter((e) => visibleIds.has(e.from) && visibleIds.has(e.to));
  if (route.level === "theme") {
    return {
      visibleIds,
      targets,
      edges: edges.filter((e) => e.kind === "link" || e.kind === "theme-idea"),
      focusId,
    };
  }
  if (route.level === "idea") {
    return {
      visibleIds,
      targets,
      edges: edges.filter((e) => e.kind !== "source"),
      focusId,
    };
  }
  if (route.level === "step") {
    const showSourceEdges = route.sourcesExpanded || ui.sourcesExpanded;
    return {
      visibleIds,
      targets,
      edges: edges.filter((e) => e.kind !== "source" || showSourceEdges),
      focusId,
    };
  }
  return { visibleIds, targets, edges: edges.filter((e) => e.kind === "link"), focusId };
}

/** @param {BrainGraph} graph @param {string} nodeId @param {Record<string,{x:number,y:number}>} targets */
export function getNodeTarget(graph, nodeId, targets) {
  const t = targets[nodeId];
  const n = graph.nodes.get(nodeId);
  if (t) return { x: t.x, y: t.y, scale: t.scale ?? 1, dim: t.dim ?? false };
  return { x: n?.x ?? 0, y: n?.y ?? 0, scale: 1, dim: false };
}

export function kindShape(kind) {
  const k = kind || "";
  if (/想法|反思|感悟/.test(k)) return "thought";
  if (k === "行动") return "action";
  if (/输入|摘录/.test(k)) return "input";
  if (k === "起点") return "start";
  if (/反馈|结果|经历|观察/.test(k)) return "experience";
  if (k === "问题") return "question";
  return "thought";
}
