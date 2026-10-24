/**
 * The graph scene: HTML nodes positioned in screen space, SVG edges drawn
 * between them. Node art scales with the camera, labels stay at a readable
 * pixel size, and node ids never change while animating.
 */
import { brainArt } from "./anatomy.js";
import { coreBrightness, daysSince, latestStepDate, EASE_TAU } from "./glow.js";
import { conclusionGlyph, ideaGlyph, sourceGlyph, stepGlyph } from "./glyphs.js";
import { nextLod } from "./lod.js";
import { hashString } from "./random.js";

/** Lower bounds so a node never collapses into an unclickable dot. */
const MIN_ART = {
  core: 112,
  "core-away": 46,
  theme: 54,
  "theme-active": 126,
  "theme-away": 34,
  idea: 58,
  "idea-active": 62,
  "idea-away": 34,
  step: 30,
  conclusion: 30,
  source: 24,
};

/** Art fills different fractions of its view box, so edges trim per type. */
const ANCHOR = {
  core: 0.78,
  theme: 0.78,
  idea: 0.56,
  step: 0.52,
  conclusion: 0.54,
  source: 0.52,
};

const GROW_STAGGER = 40;
const GROW_EDGE_MS = 300;
const GROW_NODE_MS = 200;

/**
 * 展开时新进来的子节点，按布局插入顺序同层错开。
 * 连线先描 GROW_EDGE_MS，节点再隔同样的时间长出。
 * 步骤主线的链条边（上一个新节点连过来的）也一并跟着描。
 * @param {Map<string, any>} previous
 * @param {Map<string, any>} next
 * @param {any[]} edges
 */
export function growPlan(previous, next, edges) {
  const nodes = [];
  for (const [id, placement] of next) {
    if (previous.has(id) || !placement.parentId || !previous.has(placement.parentId)) continue;
    const delay = nodes.length * GROW_STAGGER;
    nodes.push({ id, delay, edgeDelay: delay, nodeDelay: delay + GROW_EDGE_MS });
  }
  const byChild = new Map(nodes.map((item) => [item.id, item]));
  const grown = [];
  for (const edge of edges) {
    const child = byChild.get(edge.to);
    if (!child) continue;
    // 直连父节点的边照描；步骤主线是上一个新节点连过来的链条边，跟着一起长。
    if (edge.from !== next.get(edge.to).parentId && !byChild.has(edge.from)) continue;
    grown.push({ id: edge.id, to: edge.to, delay: child.delay });
  }
  return { nodes, edges: grown };
}
/**
 * 生长动画什么时候播：展开来源当帧就播；点进主题/问题是换层导航，要等
 * 收起/过渡动画放完、节点停稳之后再播；动效关闭（顶栏开关或系统减少
 * 动态）时不播，新节点直接出现。
 * @param {{ collapsing?: boolean, instant?: boolean, growInto?: boolean }} transition
 * @returns {"immediate" | "after-settle" | "none"}
 */
export function growMode({ collapsing = false, instant = false, growInto = false } = {}) {
  if (instant) return "none";
  if (collapsing) return growInto ? "after-settle" : "none";
  return "immediate";
}

/** 浅弧统一向行进方向左侧弯曲，扇出边不再随机相向挤压。 */
export function edgePath(a, b, kind) {
  const gap = kind === "connector" ? 0 : kind === "source" ? 5 : 7;
  const dx = b.screen.x - a.screen.x;
  const dy = b.screen.y - a.screen.y;
  const dist = Math.hypot(dx, dy);
  const ux = dist ? dx / dist : 1;
  const uy = dist ? dy / dist : 0;
  // 节点正在从父节点长出时，按比例收缩锚点，避免短边翻转。
  const trim = Math.min(1, dist / (a.radius + b.radius + 2 * gap + 1));
  const start = {
    x: a.screen.x + ux * (a.radius + gap) * trim,
    y: a.screen.y + uy * (a.radius + gap) * trim,
  };
  const end = {
    x: b.screen.x - ux * (b.radius + gap) * trim,
    y: b.screen.y - uy * (b.radius + gap) * trim,
  };
  const ratio = kind === "core-theme" ? 0.07 : kind === "source" ? 0.05 : 0.08;
  const bow = Math.hypot(end.x - start.x, end.y - start.y) * ratio;
  const control = {
    x: (start.x + end.x) / 2 - uy * bow,
    y: (start.y + end.y) / 2 + ux * bow,
  };
  return {
    path: `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} Q ${control.x.toFixed(1)} ${control.y.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`,
    start, end,
    mid: { x: (start.x + 2 * control.x + end.x) / 4, y: (start.y + 2 * control.y + end.y) / 4 },
  };
}

export function peripheralScreen(screen, area, radius, role = "theme-away") {
  // Sibling ideas retain their semicircle spacing; offscreen navigation handles them.
  if (role === "idea-away") return screen;
  const pad = Math.max(64, radius + 18);
  return {
    x: Math.max(area.ox - area.width / 2 + pad, Math.min(area.ox + area.width / 2 - pad, screen.x)),
    y: Math.max(area.oy - area.height / 2 + pad, Math.min(area.oy + area.height / 2 - pad, screen.y)),
  };
}

function artMarkup(placement) {
  const { node, detail, role } = placement;
  if (node.type === "core" || node.type === "theme") {
    return brainArt({ seed: node.id, detail: detail || (role === "theme-away" ? "distant" : "theme") });
  }
  if (node.type === "idea") return ideaGlyph(hashString(node.id) % 97);
  if (node.type === "step") return stepGlyph(node.family);
  if (node.type === "conclusion") return conclusionGlyph();
  return sourceGlyph();
}

function labelMarkup(placement) {
  const { node } = placement;
  if (node.type === "core") {
    return field("node-kicker", node.latin) + field("node-title", node.label);
  }
  if (node.type === "theme") {
    return (
      field("node-kicker", `${node.code || ""} ${node.latin || ""}`.trim()) +
      field("node-title", node.label) +
      field("node-note", `${node.ideaCount} 个问题`)
    );
  }
  if (node.type === "idea") {
    return field("node-kicker", "问题") + field("node-title", node.label);
  }
  if (node.type === "step") {
    return (
      field("node-kicker", `${pad(node.index)} · ${node.kind || ""}`) +
      field("node-title", node.label) +
      field("node-note", node.date || "")
    );
  }
  if (node.type === "conclusion") {
    return field("node-kicker", "阶段理解") + field("node-title", node.shortTitle || node.label);
  }
  return field("node-kicker", "来源") + field("node-title", node.label);
}

export function nodeMarkup(placement) {
  return `<span class="node-art"><svg viewBox="-110 -110 220 220" aria-hidden="true">${artMarkup(
      placement
    )}</svg>${
      placement.node.type === "step" ? `<span class="node-index">${pad(placement.node.index)}</span>` : ""
    }${
      placement.node.type === "step" && placement.node.refIds?.length
        ? `<span class="node-sources" aria-hidden="true">${placement.node.refIds.length}</span>`
        : ""
    }</span>` + `<span class="node-label label--${placement.labelSide}">${labelMarkup(placement)}</span>`;
}

export function createScene({ root, nodesLayer, edgesSvg, tagsLayer, camera, onActivate, onHoverChange }) {
  const edgeGroup = edgesSvg.querySelector("#edge-group");
  // 每帧都要用的连线锚，建场景时查一次，不在 frame() 里反复 querySelector。
  const orbit = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
  orbit.setAttribute("class", "network-orbit");
  orbit.setAttribute("aria-hidden", "true");
  edgesSvg.appendChild(orbit);
  const connectorEl = edgesSvg.querySelector("#popover-connector-path");
  /** @type {Map<string, any>} */
  const rendered = new Map();
  /** @type {Map<string, any>} */
  const edgeViews = new Map();
  /** @type {any[]} */
  let edges = [];
  let placements = new Map();
  let instant = false;
  let collapseUntil = 0;
/** 点进更深一层挂起的生长计划：等收起/过渡稳定后在 frame() 里触发。 */
let pendingGrow = null;
  let selection = { selectedId: null, nodeIds: new Set(), edgeIds: new Set(), focusChain: false };
  /** 聚焦模式下要保留原亮度的当前路径；null 表示没开聚焦。 */
  let focusPath = null;
  /** 弹窗开着才流动；弹窗关闭后链的高亮保留，光点停止。 */
  let flowing = false;
  /** 当前路径定位到的节点：键盘或 URL 落到这里时，它的文字不跟着缩放隐藏。 */
  let locatedId = null;
  /** 当前缩放档位，带滞回：相机在阈值附近来回漂时不重复切换。 */
  let lod = null;
  let hoverId = null;
  let hoverTimer = null;
  let hoverSuspended = false;
  const noHover = window.matchMedia("(hover: none)");
  const neighbors = new Map();
  let connector = null;
  /** 最近一次步骤日期距今天数。没有可用日期时为 null，亮度落在最暗端。 */
  let recencyDays = null;
  let breatheElapsed = 0;

  noHover.addEventListener("change", () => clearHover());

  function ariaLabel(placement) {
    const { node } = placement;
    if (node.type === "step") return `步骤 ${node.index}：${node.label}，${node.kind || ""}`;
    if (node.type === "theme") return `主题 ${node.label}，${node.ideaCount} 个问题`;
    if (node.type === "idea") return `问题 ${node.label}`;
    if (node.type === "conclusion") return `阶段理解：${node.summary || ""}`;
    if (node.type === "source") return `来源 ${node.label}`;
    return node.label;
  }

  function createNode(placement) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "node";
    el.dataset.id = placement.id;
    el.dataset.type = placement.node.type;
    el.dataset.role = placement.role;
    if (placement.node.family) el.dataset.family = placement.node.family;
    if (placement.node.connection) el.dataset.connection = placement.node.connection;
    if (placement.node.isNewest) el.dataset.newest = "true";
    el.setAttribute("aria-label", ariaLabel(placement));
    el.innerHTML = nodeMarkup(placement);

    el.addEventListener("click", (event) => {
      event.stopPropagation();
      onActivate(placement.id, el);
    });
    el.addEventListener("pointerenter", (event) => {
      clearHover();
      if (noHover.matches || event.pointerType === "touch" || event.buttons || hoverSuspended || selection.selectedId) return;
      hoverTimer = setTimeout(() => {
        hoverTimer = null;
        if (hoverSuspended || noHover.matches || selection.selectedId || !placements.has(placement.id)) return;
        setHover(placement.id);
      }, 120);
    });
    el.addEventListener("pointerleave", clearHover);
    nodesLayer.appendChild(el);
    return el;
  }

  function clearHover() {
    clearTimeout(hoverTimer);
    hoverTimer = null;
    setHover(null);
  }

  function setHoverSuspended(value) {
    hoverSuspended = Boolean(value);
    if (hoverSuspended) clearHover();
  }

  function setHover(id) {
    if (hoverId === id) return;
    hoverId = id;
    applyStates();
    if (onHoverChange) onHoverChange(id);
  }

  /**
   * @param {{ placements: Map<string, any> }} layout
   * @param {any[]} graphEdges
   */
  function setLayout(layout, graphEdges, { collapse = false, nodes = null, growInto = false } = {}) {
    if (nodes) {
      const latest = latestStepDate(nodes);
      recencyDays = latest ? daysSince(latest) : null;
      applyCoreBreath();
    }
    orbit.style.display = [...layout.placements.values()].some((p) => p.orbitAngle !== null) ? "" : "none";
    const previous = placements;
    const collapsing = collapse && !instant;
    const oldCenter = centerOf(previous);
    const newCenter = centerOf(layout.placements);
    if (collapsing) collapseUntil = performance.now() + 340;
    clearHover();
    placements = layout.placements;
    edges = graphEdges.filter((e) => placements.has(e.from) && placements.has(e.to));
    neighbors.clear();
    for (const id of placements.keys()) neighbors.set(id, new Set([id]));
    for (const edge of edges) {
      neighbors.get(edge.from).add(edge.to);
      neighbors.get(edge.to).add(edge.from);
    }

    for (const [id, placement] of placements) {
      let view = rendered.get(id);
      const entering = !previous.has(id);
      if (!view) {
        const parent = placement.parentId ? rendered.get(placement.parentId) : null;
        const origin = collapsing ? newCenter : parent ? parent.cur : placement;
        view = {
          id,
          el: createNode(placement),
          placement,
          cur: { x: origin.x, y: origin.y, size: collapsing || parent ? placement.size * 0.4 : placement.size },
          exiting: false,
          heldUntil: 0,
        };
        rendered.set(id, view);
        if (!collapsing && !instant) {
          view.el.classList.add("is-entering");
          view.enterRaf = requestAnimationFrame(() => view.el.classList.remove("is-entering"));
        }
      }
      if (view.exiting) {
        view.exiting = false;
        clearTimeout(view.removeTimer);
        view.el.classList.remove("is-exiting");
      }
      if (collapsing || instant) {
        view.heldUntil = collapsing && entering ? collapseUntil : 0;
        view.el.classList.remove("is-entering");
        view.el.classList.toggle("is-held", Boolean(view.heldUntil));
        if (view.heldUntil) {
          view.cur = { x: newCenter.x, y: newCenter.y, size: placement.size * 0.4 };
        }
      }
      if (view.placement.role !== placement.role || view.placement.detail !== placement.detail || view.placement.labelSide !== placement.labelSide) {
        view.el.innerHTML = nodeMarkup(placement);
        view.el.dataset.role = placement.role;
      }
      view.placement = placement;
      if (instant) view.cur = { x: placement.x, y: placement.y, size: placement.size };
    }

    for (const [id, view] of rendered) {
      if (placements.has(id)) continue;
      if (instant) {
        removeNode(id, view);
        continue;
      }
      if (view.exiting) continue;
      view.exiting = true;
      view.heldUntil = 0;
      view.el.classList.remove("is-held", "is-entering");
      view.el.classList.add("is-exiting");
      const parent = view.placement.parentId ? rendered.get(view.placement.parentId) : null;
      if (collapsing) view.placement = { ...view.placement, x: oldCenter.x, y: oldCenter.y };
      else if (parent) view.placement = { ...view.placement, x: parent.placement.x, y: parent.placement.y };
      view.removeTimer = setTimeout(() => removeNode(id, view), collapsing ? 420 : 280);
    }

    syncEdges();
    const mode = growMode({ collapsing, instant, growInto });
    pendingGrow = mode === "after-settle" ? { previous } : null;
    if (mode === "immediate") growIn(previous);
    applyStates();
  }

  /** 新子节点沿连线长出：连线先描，节点随后，同层错开。定时器挂在视图上，节点/连线被移除时一并清掉。 */
  function growIn(previous) {
    const plan = growPlan(previous, placements, edges);
    if (!plan.nodes.length) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const item of plan.edges) {
      const view = edgeViews.get(item.id);
      if (!view) continue;
      view.g.style.setProperty("--grow-delay", `${item.delay}ms`);
      view.g.classList.add("is-growing");
      if (reduce) view.g.classList.remove("is-growing");
      else (view.growTimers ??= []).push(window.setTimeout(() => view.g.classList.remove("is-growing"), item.delay + GROW_EDGE_MS));
    }
    for (const item of plan.nodes) {
      const view = rendered.get(item.id);
      if (!view) continue;
      view.el.style.setProperty("--grow-delay", `${item.nodeDelay}ms`);
      view.el.classList.add("is-growing");
      if (reduce) view.el.classList.remove("is-growing");
      else (view.el.growTimers ??= []).push(window.setTimeout(() => view.el.classList.remove("is-growing"), item.nodeDelay + GROW_NODE_MS));
    }
  }

  function centerOf(layer) {
    const values = [...layer.values()];
    return values.find((p) => p.role === "idea-active") || values.find((p) => p.role === "theme-active") || values.find((p) => p.role === "core") || { x: 0, y: 0 };
  }

  function removeNode(id, view) {
    clearTimeout(view.removeTimer);
    cancelAnimationFrame(view.enterRaf);
    for (const timer of view.el.growTimers || []) clearTimeout(timer);
    view.el.remove();
    rendered.delete(id);
  }

  function isCollapsing() {
    return !instant && performance.now() < collapseUntil;
  }

  function syncEdges() {
    const keep = new Set(edges.map((e) => e.id));
    for (const [id, view] of edgeViews) {
      if (keep.has(id)) continue;
      for (const timer of view.growTimers || []) clearTimeout(timer);
      view.g.remove();
      view.tag?.remove();
      edgeViews.delete(id);
    }
    for (const edge of edges) {
      if (edgeViews.has(edge.id)) continue;
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", `edge edge--${edge.kind}`);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
      line.setAttribute("class", "edge-line");
      const flow = document.createElementNS("http://www.w3.org/2000/svg", "path");
      flow.setAttribute("class", "edge-flow");
      flow.setAttribute("pathLength", "100");
      const mask = document.createElementNS("http://www.w3.org/2000/svg", "mask");
      const maskId = `edge-reveal-${edgeViews.size}-${hashString(edge.id)}`;
      mask.id = maskId;
      mask.setAttribute("maskUnits", "userSpaceOnUse");
      mask.style.maskType = "alpha";
      const reveal = document.createElementNS("http://www.w3.org/2000/svg", "path");
      reveal.setAttribute("class", "edge-reveal");
      mask.appendChild(reveal);
      const strokes = document.createElementNS("http://www.w3.org/2000/svg", "g");
      strokes.setAttribute("class", "edge-strokes");
      g.style.setProperty("--edge-mask", `url(#${maskId})`);
      strokes.append(line, flow);
      g.append(mask, strokes);
      edgeGroup.appendChild(g);
      let tag = null;
      if (edge.kind === "inferred") {
        tag = document.createElement("span");
        tag.className = "edge-tag";
        tag.textContent = "关联待确认";
        tagsLayer.appendChild(tag);
      }
      let gradient = null;
      if (edge.kind === "recorded" || edge.kind === "inferred") {
        gradient = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
        const gradientId = `edge-direction-${hashString(edge.id)}`;
        gradient.id = gradientId;
        gradient.setAttribute("gradientUnits", "userSpaceOnUse");
        for (const [offset, opacity] of [[0, 0.4], [1, 1]]) {
          const stop = document.createElementNS("http://www.w3.org/2000/svg", "stop");
          stop.setAttribute("offset", String(offset));
          stop.setAttribute("stop-color", "var(--edge-color)");
          stop.setAttribute("stop-opacity", String(opacity));
          gradient.appendChild(stop);
        }
        g.appendChild(gradient);
        line.style.stroke = `url(#${gradientId})`;
      }
      edgeViews.set(edge.id, { edge, g, line, flow, mask, reveal, tag, gradient });
    }
  }

  function artPx(placement, size) {
    const min = MIN_ART[placement.role] ?? 28;
    return Math.max(min, size * camera.current.scale);
  }

  function applyStates() {
    const { selectedId, nodeIds, edgeIds, focusChain } = selection;
    const neighborhood = !selectedId && hoverId ? neighbors.get(hoverId) : null;
    for (const [id, view] of rendered) {
      const el = view.el;
      const isSelected = id === selectedId;
      const inPath = nodeIds.has(id);
      el.dataset.state = isSelected
        ? "selected"
        : inPath
        ? "active"
        : focusChain || view.placement.dim
        ? "dim"
        : "idle";
      el.classList.toggle("is-hover-dim", Boolean(neighborhood && !neighborhood.has(id)));
      el.classList.toggle("is-off-path", Boolean(focusPath) && !focusPath.nodeIds.has(id));
      // 选中路径上的节点、浮框挂着的节点、键盘或 URL 定位到的节点始终留着文字。
      el.classList.toggle("is-lod-keep", inPath || id === locatedId);
      if (isSelected) el.setAttribute("aria-current", "true");
      else el.removeAttribute("aria-current");
    }
    for (const [id, view] of edgeViews) {
      const active = edgeIds.has(id);
      view.g.classList.toggle(
        "is-hover-dim",
        Boolean(neighborhood && !(neighborhood.has(view.edge.from) && neighborhood.has(view.edge.to)))
      );
      view.g.classList.toggle("is-active", Boolean(active));
      view.g.classList.toggle("is-flowing", Boolean(active) && flowing);
      if (!active || !flowing) view.g.classList.remove("is-pulsing");
      view.g.classList.toggle("is-dim", Boolean(focusChain && !active));
      view.g.classList.toggle("is-off-path", Boolean(focusPath) && !focusPath.edgeIds.has(id));
      view.tag?.classList.toggle("is-off-path", Boolean(focusPath) && !focusPath.edgeIds.has(id));
    }
  }

  /** @param {{ selectedId?: string|null, nodeIds?: Iterable<string>, edgeIds?: Iterable<string>, focusChain?: boolean }} next */
  function setSelection(next) {
    selection = {
      selectedId: next.selectedId ?? null,
      nodeIds: new Set(next.nodeIds || []),
      edgeIds: new Set(next.edgeIds || []),
      focusChain: Boolean(next.focusChain),
    };
    if (selection.selectedId) clearHover();
    applyStates();
    if (next.pulse !== false) pulse();
  }

  function clearFlashes() {
    for (const [, view] of edgeViews) view.g.classList.remove("is-replay-flash");
  }

  function flashEdges(ids) {
    clearFlashes();
    if (instant) return;
    for (const id of ids) {
      const view = edgeViews.get(id);
      if (!view) continue;
      void view.g.getBoundingClientRect();
      view.g.classList.add("is-replay-flash");
    }
  }

  function setFlowing(value) {
    flowing = Boolean(value);
    applyStates();
  }

  /**
   * 聚焦模式：路径内的节点和连线保持原亮度，其余由 CSS 压到 0.1。
   * @param {{ nodeIds: Set<string>, edgeIds: Set<string> }|null} next
   */
  function setFocusPath(next) {
    focusPath = next || null;
    applyStates();
  }

  /**
   * 键盘或 URL 定位到的节点。它未必在选中路径上（主题层、问题层不选中节点），
   * 但用户刚刚跳到它，文字必须可见。
   * @param {string|null} id
   */
  function setLocated(id) {
    locatedId = id || null;
    applyStates();
  }

  /** 按相机当前缩放切档，档位没变就不动 DOM。 */
  function syncLod() {
    const next = nextLod(camera.current.scale, lod);
    // 同档位切换主题也会创建新标签，按当前 placement 补偿，不依赖切档。
    for (const [id, placement] of placements) {
      if (placement.node.type !== "idea") continue;
      const el = rendered.get(id)?.el;
      const title = el?.querySelector(".node-title");
      if (!title) continue;
      const chars = Array.from(placement.node.label);
      const text = placement.role === "idea" && next === "far" && chars.length > 10
        ? `${chars.slice(0, 10).join("")}…` : placement.node.label;
      if (title.textContent !== text) title.textContent = text;
      el.setAttribute("aria-label", ariaLabel(placement));
    }
    if (next === lod) return;
    lod = next;
    if (!root) return;
    root.classList.toggle("lod-far", next === "far");
    root.classList.toggle("lod-mid", next === "mid");
    root.classList.toggle("lod-near", next === "near");
  }

  function pulse() {
    if (instant) return;
    for (const [id, view] of edgeViews) {
      if (!selection.edgeIds.has(id)) continue;
      view.g.classList.remove("is-pulsing");
      void view.g.getBoundingClientRect();
      view.g.classList.add("is-pulsing");
    }
  }

  /** @param {{ from:{x:number,y:number}, to:{x:number,y:number} }|null} link */
  function setConnector(link) {
    connector = link;
  }

  /** 只改 core 节点的亮度变量，不写任何日期或内容到画面上。字符串没变就不碰 style。 */
  function applyCoreBreath() {
    const level = coreBrightness(recencyDays, breatheElapsed, { breathe: !instant }).toFixed(3);
    for (const [, view] of rendered) {
      if (view.placement.node.type !== "core") continue;
      if (view.breatheLevel === level) continue;
      view.breatheLevel = level;
      view.el.style.setProperty("--breathe", level);
    }
  }

  function frame(dt) {
    let busy = camera.step(dt);
    syncLod();
    const k = instant ? 1 : 1 - Math.exp(-dt / EASE_TAU);
    const now = performance.now();
    if (!instant) {
      breatheElapsed += dt;
      applyCoreBreath();
    } else if (breatheElapsed !== 0) {
      breatheElapsed = 0;
      applyCoreBreath();
    }

    for (const [, view] of rendered) {
      const p = view.placement;
      if (view.heldUntil && now >= view.heldUntil) {
        view.heldUntil = 0;
        view.el.classList.remove("is-held");
      }
      const targetSize = view.exiting ? p.size * 0.5 : p.size;
      if (view.heldUntil) {
        busy = true;
      } else {
        view.cur.x += (p.x - view.cur.x) * k;
        view.cur.y += (p.y - view.cur.y) * k;
        view.cur.size += (targetSize - view.cur.size) * k;
        if (Math.abs(p.x - view.cur.x) > 0.2 || Math.abs(p.y - view.cur.y) > 0.2) busy = true;
        if (Math.abs(targetSize - view.cur.size) > 0.2) busy = true;
      }

      const screen = camera.toScreen(view.cur);
      if (p.orbitAngle !== null) {
        const area = camera.area;
        const radius = Math.hypot(area.width, area.height) * 0.42;
        const rx = Math.min(radius, area.width / 2 - 60);
        const ry = Math.min(radius * area.height / area.width, area.height / 2 - 64);
        screen.x = area.ox + Math.cos(p.orbitAngle) * rx;
        screen.y = area.oy + Math.sin(p.orbitAngle) * ry;
        orbit.setAttribute("cx", String(area.ox));
        orbit.setAttribute("cy", String(area.oy));
        orbit.setAttribute("rx", String(rx));
        orbit.setAttribute("ry", String(ry));
      } else if (p.role === "theme-away" || p.role === "idea-away") {
        // Keep at least half the peripheral label reachable without shrinking focus.
        Object.assign(screen, peripheralScreen(screen, camera.area, artPx(p, view.cur.size) / 2, p.role));
      }
      const px = artPx(p, view.cur.size);
      view.screen = screen;
      view.radius = (px / 2) * (ANCHOR[p.node.type] ?? 0.6);
      // 画布静止时同一帧反复写相同字符串没有意义，按值缓存跳过 style 写入。
      view.applied ??= { transform: null, art: null, z: null };
      const x = screen.x.toFixed(1);
      const y = screen.y.toFixed(1);
      const transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
      if (transform !== view.applied.transform) {
        view.applied.transform = transform;
        view.el.style.setProperty("--x", `${x}px`);
        view.el.style.setProperty("--y", `${y}px`);
        view.el.style.transform = transform;
      }
      const art = `${px.toFixed(1)}px`;
      if (art !== view.applied.art) {
        view.applied.art = art;
        view.el.style.setProperty("--art", art);
      }
      const z = String(10 + p.z * 10 + (view.id === selection.selectedId ? 20 : 0));
      if (z !== view.applied.z) {
        view.applied.z = z;
        view.el.style.zIndex = z;
      }
    }

    for (const [, view] of edgeViews) {
      const a = rendered.get(view.edge.from);
      const b = rendered.get(view.edge.to);
      if (!a?.screen || !b?.screen) continue;
      const d = edgePath(a, b, view.edge.kind);
      if (view.gradient) {
        view.gradient.setAttribute("x1", String(d.start.x));
        view.gradient.setAttribute("y1", String(d.start.y));
        view.gradient.setAttribute("x2", String(d.end.x));
        view.gradient.setAttribute("y2", String(d.end.y));
      }
      view.line.setAttribute("d", d.path);
      view.flow.setAttribute("d", d.path);
      view.reveal.setAttribute("d", d.path);
      // 遮罩以屏幕坐标覆盖整条曲线及箭头，避免默认边界裁掉浅弧。
      const pad = Math.hypot(b.screen.x - a.screen.x, b.screen.y - a.screen.y) * 0.1 + 20;
      view.mask.setAttribute("x", String(Math.min(a.screen.x, b.screen.x) - pad));
      view.mask.setAttribute("y", String(Math.min(a.screen.y, b.screen.y) - pad));
      view.mask.setAttribute("width", String(Math.abs(b.screen.x - a.screen.x) + pad * 2));
      view.mask.setAttribute("height", String(Math.abs(b.screen.y - a.screen.y) + pad * 2));
      if (view.g.classList.contains("is-growing")) {
        const length = view.line.getTotalLength();
        view.g.style.setProperty("--edge-length", String(Math.max(0.1, length)));
      }
      if (view.tag) {
        const visible = view.g.classList.contains("is-active");
        if (view.tagShown !== visible) {
          view.tagShown = visible;
          view.tag.classList.toggle("is-visible", visible);
        }
        view.tag.style.transform = `translate3d(${d.mid.x.toFixed(1)}px, ${d.mid.y.toFixed(1)}px, 0)`;
      }
    }

    if (connectorEl) {
      if (connector) {
        const { from, to } = connector;
        connectorEl.setAttribute(
          "d",
          edgePath({ screen: from, radius: 0 }, { screen: to, radius: 0 }, "connector").path
        );
        connectorEl.classList.add("is-visible");
      } else {
        connectorEl.classList.remove("is-visible");
      }
    }

    if (pendingGrow && !instant && !busy && now >= collapseUntil) {
      const settleGrow = pendingGrow;
      pendingGrow = null;
      growIn(settleGrow.previous);
    }
    return busy;
  }

  return {
    setLayout,
    isCollapsing,
    setSelection,
    setHoverSuspended,
    flashEdges,
    clearFlashes,
    setFlowing,
    setFocusPath,
    setLocated,
    setConnector,
    frame,
    setInstant(value) {
      instant = Boolean(value);
      if (!instant) return;
      collapseUntil = 0;
      pendingGrow = null;
      breatheElapsed = 0;
      applyCoreBreath();
      for (const [, view] of edgeViews) view.g.classList.remove("is-growing");
      for (const [id, view] of rendered) {
        if (view.exiting) {
          removeNode(id, view);
          continue;
        }
        view.heldUntil = 0;
        view.el.classList.remove("is-held", "is-entering", "is-growing");
        const p = view.placement;
        view.cur = { x: p.x, y: p.y, size: p.size };
      }
      frame(0);
    },
    nodeView: (id) => rendered.get(id),
    nodeElement: (id) => rendered.get(id)?.el || null,
    screenOf: (id) => rendered.get(id)?.screen || null,
    radiusOf: (id) => rendered.get(id)?.radius || 0,
    glowTarget() {
      const center = centerOf(placements);
      const view = rendered.get(center.id);
      return view?.screen ? { ...view.screen, radius: view.radius * 1.6, role: center.role } : null;
    },
    get hoverId() {
      return hoverId;
    },
  };
}

function field(className, value) {
  if (!value) return "";
  return `<span class="${className}">${escapeHtml(value)}</span>`;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
