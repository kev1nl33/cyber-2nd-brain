/**
 * Deterministic layouts in world coordinates. One function per level, so the
 * same state always produces the same picture: no force simulation, no drift.
 *
 * World units equal CSS pixels at camera scale 1. `focus` lists the nodes the
 * camera must always fit; everything else may sit outside the padded box and
 * is reachable with zoom out or reset.
 */

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
    };
    place.set(node.id, full);
    if (entry.focus) focus.push(full);
    return full;
  };

  if (view.level === "overview") {
    layoutOverview(graph, { portrait, compact }, put);
  } else if (view.level === "theme") {
    layoutTheme(graph, view, { portrait, compact }, put);
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

function layoutTheme(graph, view, { portrait, compact }, put) {
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

  // The rest of the network keeps its own side of the canvas: up on a phone,
  // left on a wide screen, with the core brain holding the way back.
  const awayBase = 180;
  const away = { rx: 524, ry: 382, step: 30 };
  put(graph.core, {
    x: portrait ? 0 : -452,
    y: portrait ? -272 : 0,
    size: SIZE.coreAway,
    role: "core-away",
    detail: "theme",
    dim: true,
    parentId: active.id,
    z: 1,
  });

  const others = graph.themes().filter((t) => t.themeId !== view.themeId);
  const offsets = others.map((_, i) => i - (others.length - 1) / 2);
  const shifted = offsets.some((o) => Math.abs(o) < 0.01) ? offsets.map((o) => o + 0.5) : offsets;
  others.forEach((theme, i) => {
    const angle = (awayBase + shifted[i] * away.step) * RAD;
    // Portrait has no room for a ring, so the rest of the network lines up above.
    const row = { x: (i - (others.length - 1) / 2) * 162, y: -424 };
    put(theme, {
      x: portrait ? row.x : Math.cos(angle) * away.rx,
      y: portrait ? row.y : Math.sin(angle) * away.ry,
      size: SIZE.themeAway,
      role: "theme-away",
      detail: "distant",
      dim: true,
      parentId: active.id,
      z: 1,
    });
  });
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
    : { theme: { x: -398, y: -42 }, idea: { x: -186, y: 10 }, start: { x: 38, y: 0 } };

  put(theme, {
    ...anchor.theme,
    size: portrait ? (compact ? 98 : 118) : 148,
    role: "theme-away",
    detail: "theme",
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
    const offset = (i - (siblings.length - 1) / 2) * 124;
    put(sibling, {
      x: portrait ? (i % 2 ? 1 : -1) * 148 : anchor.theme.x + offset,
      y: portrait ? anchor.theme.y + 52 + Math.floor(i / 2) * 96 : anchor.theme.y + 162,
      size: 62,
      role: "idea-away",
      dim: true,
      parentId: theme?.id,
      z: 1,
    });
  });

  let last = null;
  steps.forEach((step, i) => {
    const pos = portrait
      ? { x: i % 2 === 0 ? -98 : 22, y: anchor.start.y + i * spacing }
      : {
          x: anchor.start.x + i * spacing,
          y: Math.sin(i * 1.06 + 0.42) * 96 + i * 10,
        };
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
    put(conclusion, {
      x: portrait ? 0 : last.x + spacing * 0.92,
      y: portrait ? last.y + spacing * 0.96 : last.y * 0.35,
      size: SIZE.conclusion,
      role: "conclusion",
      parentId: last.id,
      labelSide: portrait ? "bottom" : last.y * 0.35 <= 0 ? "top" : "bottom",
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
