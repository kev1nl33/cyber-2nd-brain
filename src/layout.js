/**
 * Deterministic layouts in world coordinates. One function per level, so the
 * same state always produces the same picture: no force simulation, no drift.
 *
 * World units equal CSS pixels at camera scale 1. `focus` lists the nodes the
 * camera must always fit; everything else may sit outside the padded box and
 * is reachable with zoom out or reset.
 */

import { datedSteps } from "./replay.js";

const SIZE = {
  core: 300,
  coreAway: 150,
  theme: 132,
  themeActive: 240,
  themeAway: 96,
  idea: 126,
  ideaActive: 120,
  ideaAway: 72,
  step: 84,
  conclusion: 78,
  source: 58,
};

const RAD = Math.PI / 180;

/**
 * @param {ReturnType<import('./graph.js').loadGraph>} graph
 * @param {{ level: string, themeId?: string, ideaId?: string, expanded?: Set<string> }} view
 * @param {{ width: number, height: number }} viewport
 */
export function computeLayout(graph, view, viewport) {
  const portrait = viewport.height > viewport.width * 1.1;
  const compact = Math.min(viewport.width, viewport.height) < 560;
  const place = new Map();
  const focus = [];

  /** @param {any} node */
  const put = (node, entry) => {
    if (!node) return null;
    const full = {
      id: node.id,
      node,
      x: entry.x,
      y: entry.y,
      size: entry.size,
      role: entry.role,
      detail: entry.detail || null,
      dim: Boolean(entry.dim),
      labelSide: entry.labelSide || "bottom",
      parentId: entry.parentId || null,
      z: entry.z ?? 1,
      orbitAngle: entry.orbitAngle ?? null,
    };
    place.set(node.id, full);
    if (entry.focus) focus.push(full);
    return full;
  };

  if (view.level === "overview") {
    layoutOverview(graph, { portrait, compact, viewport }, put);
  } else if (view.level === "theme") {
    layoutTheme(graph, view, { portrait, compact, viewport }, put);
  } else {
    layoutIdea(graph, view, { portrait, compact }, put);
  }

  // The theme level keeps its brain near the middle of the canvas; other
  // levels centre on their focus box.
  const fit = {
    anchor: view.level === "theme" ? { x: 0, y: 0 } : null,
    anchorWeight: 0.45,
    minRatio: view.level === "overview" ? 0.82 : view.level === "idea" ? 0.76 : 0.78,
  };

  return { placements: place, focus, portrait, compact, fit };
}

function layoutOverview(graph, { portrait, compact }, put) {
  const rx = portrait ? 176 : compact ? 268 : 324;
  const ry = portrait ? 330 : compact ? 262 : 318;
  put(graph.core, {
    x: 0,
    y: 0,
    size: compact && !portrait ? 250 : SIZE.core,
    role: "core",
    detail: "core",
    focus: true,
    z: 3,
  });
  const themes = graph.themes();
  themes.forEach((theme, i) => {
    const angle = -90 + (360 / themes.length) * i;
    put(theme, {
      x: Math.cos(angle * RAD) * rx,
      y: Math.sin(angle * RAD) * ry,
      size: SIZE.theme,
      role: "theme",
      detail: "theme",
      parentId: graph.core.id,
      focus: true,
      z: 2,
    });
  });
}

function layoutTheme(graph, view, { portrait, compact, viewport = { width: 1440, height: 900 } }, put) {
  const active = graph.theme(view.themeId);
  if (!active) return layoutOverview(graph, { portrait, compact }, put);

  put(active, {
    x: 0,
    y: 0,
    size: portrait || compact ? 206 : SIZE.themeActive,
    role: "theme-active",
    detail: "focus",
    focus: true,
    z: 3,
  });

  const ideas = graph.ideas(view.themeId);
  const spread = ideas.length > 3 ? 360 / ideas.length : portrait ? 58 : 62;
  const base = portrait ? 90 : 0;
  const radius = portrait ? 266 : compact ? 268 : 330;
  ideas.forEach((idea, i) => {
    const offset = ideas.length > 3 ? i * spread : (i - (ideas.length - 1) / 2) * spread;
    const angle = (base + offset) * RAD;
    // Portrait staggers the questions so two long titles never sit side by side.
    const stagger = portrait ? (i % 2) * 104 : 0;
    put(idea, {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius * (portrait ? 1 : 0.92) + stagger,
      size: SIZE.idea,
      role: "idea",
      detail: null,
      parentId: active.id,
      labelSide: portrait ? "bottom" : i < ideas.length / 2 ? "top" : "bottom",
      focus: true,
      z: 2,
    });
  });

  // Peripheral entries share an ellipse; none enlarge the focus fit.
  const orbitRadius = Math.hypot(viewport.width, viewport.height) * 0.42;
  const others = graph.themes().filter((t) => t.themeId !== view.themeId);
  [graph.core, ...others].forEach((node, i, all) => {
    const angle = (-135 + i * 360 / all.length) * RAD;
    put(node, {
      x: Math.cos(angle) * orbitRadius,
      y: Math.sin(angle) * orbitRadius * viewport.height / viewport.width,
      size: node === graph.core ? 82 : SIZE.themeAway,
      role: node === graph.core ? "core-away" : "theme-away",
      detail: "distant",
      dim: true,
      parentId: active.id,
      orbitAngle: angle,
      z: 1,
    });
  });
}

/**
 * 主线时间轴刻度：与回放共用同一套严格日期排序，只取有效日期。
 * gapDays 是与前一个有效步骤的间隔天数（首个为 0），selected 标记回放/选中同步。
 * @param {any[]} steps
 * @param {string|null} selectedId
 */
export function timelineSteps(steps, selectedId = null) {
  const dated = datedSteps(steps || []);
  return dated.map((step, i) => ({
    id: step.id,
    date: step.date,
    gapDays: i
      ? Math.max(0, Math.round((Date.parse(step.date) - Date.parse(dated[i - 1].date)) / 86_400_000))
      : 0,
    selected: step.id === selectedId,
  }));
}

/** 横屏每步上行量：日期间隔越大概率越大，夹在 8～14px；无日期退回 10。 */
function riseFor(gapDays) {
  if (typeof gapDays !== "number" || !Number.isFinite(gapDays)) return 10;
  return Math.round(Math.min(14, 8 + gapDays * 0.35));
}

function layoutIdea(graph, view, { portrait, compact }, put) {
  const theme = graph.theme(view.themeId);
  const idea = graph.idea(view.themeId, view.ideaId);
  if (!idea) return layoutTheme(graph, view, { portrait, compact }, put);

  const steps = graph.steps(view.themeId, view.ideaId);
  const conclusion = graph.conclusion(view.themeId, view.ideaId);
  const expanded = view.expanded || new Set();
  const spacing = portrait ? (compact ? 152 : 170) : compact ? 196 : 218;

  const anchor = portrait
    ? compact
      ? { theme: { x: 0, y: -332 }, idea: { x: 0, y: -204 }, start: { x: 0, y: -54 } }
      : { theme: { x: 0, y: -448 }, idea: { x: 0, y: -286 }, start: { x: 0, y: -104 } }
    : { theme: { x: -220, y: -180 }, idea: { x: -186, y: 10 }, start: { x: 38, y: 0 } };

  put(theme, {
    ...anchor.theme,
    size: portrait ? (compact ? 98 : 118) : 148,
    role: "theme-away",
    detail: "distant",
    dim: true,
    z: 1,
  });

  put(idea, {
    ...anchor.idea,
    size: SIZE.ideaActive,
    role: "idea-active",
    parentId: theme?.id,
    labelSide: portrait ? "right-fixed" : "top",
    focus: true,
    z: 3,
  });

  // Sibling ideas stay as small entry points next to the theme brain; a small
  // screen gives that room to the main line instead.
  const siblings = compact ? [] : graph.ideas(view.themeId).filter((n) => n.ideaId !== view.ideaId);
  siblings.forEach((sibling, i) => {
    const angle = (-80 + (siblings.length === 1 ? 90 : i * 160 / (siblings.length - 1))) * RAD;
    put(sibling, {
      x: anchor.theme.x - 160 * Math.cos(angle),
      y: anchor.theme.y + Math.max(170, siblings.length * 52) * Math.sin(angle),
      size: 62,
      role: "idea-away",
      dim: true,
      parentId: theme?.id,
      z: 1,
    });
  });

  let last = null;
  const gaps = new Map(timelineSteps(steps).map((mark) => [mark.id, mark.gapDays]));
  let lineY = anchor.start.y;
  steps.forEach((step, i) => {
    if (i > 0) lineY -= riseFor(gaps.get(step.id));
    const pos = portrait
      ? { x: i % 2 === 0 ? -98 : 22, y: anchor.start.y + i * spacing }
      : { x: anchor.start.x + i * spacing, y: lineY };
    last = put(step, {
      ...pos,
      size: SIZE.step,
      role: "step",
      parentId: idea.id,
      labelSide: portrait ? "right-fixed" : pos.y <= 0 ? "top" : "bottom",
      focus: true,
      z: 2,
    });

    const sources = graph.sources(step.id);
    if (!sources.length || !expanded.has(step.id)) return;
    const side = portrait ? (pos.x <= 0 ? 1 : -1) : 1;
    sources.forEach((source, j) => {
      const fan = (j - (sources.length - 1) / 2) * (portrait ? 96 : 134);
      put(source, {
        x: portrait ? pos.x + side * 196 : pos.x + fan,
        y: portrait ? pos.y + fan * 0.5 : pos.y + 158 + (j % 2) * 40,
        size: SIZE.source,
        role: "source",
        parentId: step.id,
        labelSide: portrait ? "right-fixed" : "bottom",
        focus: true,
        z: 2,
      });
    });
  });

  if (conclusion && last) {
    const endY = portrait ? last.y + spacing * 0.96 : last.y - 8;
    put(conclusion, {
      x: portrait ? 0 : last.x + spacing * 0.92,
      y: endY,
      size: SIZE.conclusion,
      role: "conclusion",
      parentId: last.id,
      labelSide: portrait ? "bottom" : endY <= 0 ? "top" : "bottom",
      focus: true,
      z: 2,
    });
  }
}

/**
 * Bounding box of placements, padded by node size and label room.
 * @param {Iterable<any>} placements
 */
export function boundsOf(placements, labelRoom = 46) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let count = 0;
  for (const p of placements) {
    const r = p.size / 2;
    minX = Math.min(minX, p.x - r - labelRoom * 0.7);
    maxX = Math.max(maxX, p.x + r + labelRoom * 0.7);
    minY = Math.min(minY, p.y - r - labelRoom * 0.6);
    maxY = Math.max(maxY, p.y + r + labelRoom);
    count++;
  }
  if (!count) return { minX: -200, minY: -200, maxX: 200, maxY: 200, width: 400, height: 400, cx: 0, cy: 0 };
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}
