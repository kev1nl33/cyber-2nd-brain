/**
 * The graph scene: HTML nodes positioned in screen space, SVG edges drawn
 * between them. Node art scales with the camera, labels stay at a readable
 * pixel size, and node ids never change while animating.
 */
import { brainArt } from "./anatomy.js";
import { coreBrightness, daysSince, latestStepDate } from "./glow.js";
import { conclusionGlyph, ideaGlyph, sourceGlyph, stepGlyph } from "./glyphs.js";
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

const EASE_TAU = 0.17;

export function createScene({ nodesLayer, edgesSvg, tagsLayer, camera, onActivate, onHoverChange }) {
  const edgeGroup = edgesSvg.querySelector("#edge-group");
  /** @type {Map<string, any>} */
  const rendered = new Map();
  /** @type {Map<string, any>} */
  const edgeViews = new Map();
  /** @type {any[]} */
  let edges = [];
  let placements = new Map();
  let instant = false;
  let collapseUntil = 0;
  let selection = { selectedId: null, nodeIds: new Set(), edgeIds: new Set(), focusChain: false };
  /** 聚焦模式下要保留原亮度的当前路径；null 表示没开聚焦。 */
  let focusPath = null;
  /** 弹窗开着才流动；弹窗关闭后链的高亮保留，光点停止。 */
  let flowing = false;
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
      return field("node-kicker", "阶段理解") + field("node-title", node.summary || node.label);
    }
    return field("node-kicker", "来源") + field("node-title", node.label);
  }

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
    el.innerHTML =
      `<span class="node-art"><svg viewBox="-110 -110 220 220" aria-hidden="true">${artMarkup(
        placement
      )}</svg>${
        placement.node.type === "step" ? `<span class="node-index">${pad(placement.node.index)}</span>` : ""
      }${
        placement.node.type === "step" && placement.node.refIds?.length
          ? `<span class="node-sources" aria-hidden="true">${placement.node.refIds.length}</span>`
          : ""
      }</span>` + `<span class="node-label label--${placement.labelSide}">${labelMarkup(placement)}</span>`;

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
  function setLayout(layout, graphEdges, { collapse = false, nodes = null } = {}) {
    if (nodes) {
      const latest = latestStepDate(nodes);
      recencyDays = latest ? daysSince(latest) : null;
      applyCoreBreath();
    }
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
          requestAnimationFrame(() => view.el.classList.remove("is-entering"));
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
    applyStates();
  }

  function centerOf(layer) {
    const values = [...layer.values()];
    return values.find((p) => p.role === "theme-active") || values.find((p) => p.role === "core") || { x: 0, y: 0 };
  }

  function removeNode(id, view) {
    clearTimeout(view.removeTimer);
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
      g.append(line, flow);
      edgeGroup.appendChild(g);
      let tag = null;
      if (edge.kind === "inferred") {
        tag = document.createElement("span");
        tag.className = "edge-tag";
        tag.textContent = "关联待确认";
        tagsLayer.appendChild(tag);
      }
      edgeViews.set(edge.id, { edge, g, line, flow, tag, bow: hashString(edge.id) % 2 ? 1 : -1 });
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

  /** 只改 core 节点的亮度变量，不写任何日期或内容到画面上。 */
  function applyCoreBreath() {
    const level = coreBrightness(recencyDays, breatheElapsed, { breathe: !instant }).toFixed(3);
    for (const [, view] of rendered) {
      if (view.placement.node.type !== "core") continue;
      view.el.style.setProperty("--breathe", level);
    }
  }

  function frame(dt) {
    let busy = camera.step(dt);
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
      const px = artPx(p, view.cur.size);
      view.screen = screen;
      view.radius = (px / 2) * (ANCHOR[p.node.type] ?? 0.6);
      view.el.style.transform = `translate3d(${screen.x.toFixed(1)}px, ${screen.y.toFixed(
        1
      )}px, 0) translate(-50%, -50%)`;
      view.el.style.setProperty("--art", `${px.toFixed(1)}px`);
      view.el.style.zIndex = String(10 + p.z * 10 + (view.id === selection.selectedId ? 20 : 0));
    }

    for (const [, view] of edgeViews) {
      const a = rendered.get(view.edge.from);
      const b = rendered.get(view.edge.to);
      if (!a?.screen || !b?.screen) continue;
      const d = edgePath(a, b, view);
      view.line.setAttribute("d", d.path);
      view.flow.setAttribute("d", d.path);
      if (view.tag) {
        const visible = view.g.classList.contains("is-active");
        view.tag.classList.toggle("is-visible", visible);
        view.tag.style.transform = `translate3d(${d.mid.x.toFixed(1)}px, ${d.mid.y.toFixed(1)}px, 0)`;
      }
    }

    const connectorEl = edgesSvg.querySelector("#popover-connector-path");
    if (connectorEl) {
      if (connector) {
        const { from, to } = connector;
        connectorEl.setAttribute(
          "d",
          `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} L ${to.x.toFixed(1)} ${to.y.toFixed(1)}`
        );
        connectorEl.classList.add("is-visible");
      } else {
        connectorEl.classList.remove("is-visible");
      }
    }

    return busy;
  }

  function edgePath(a, b, view) {
    const gap = view.edge.kind === "source" ? 5 : 7;
    const dx = b.screen.x - a.screen.x;
    const dy = b.screen.y - a.screen.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;
    const start = {
      x: a.screen.x + ux * (a.radius + gap),
      y: a.screen.y + uy * (a.radius + gap),
    };
    const end = {
      x: b.screen.x - ux * (b.radius + gap),
      y: b.screen.y - uy * (b.radius + gap),
    };
    const bowRatio = view.edge.kind === "core-theme" ? 0.07 : view.edge.kind === "source" ? 0.05 : 0.08;
    const bow = dist * bowRatio * view.bow;
    const mid = {
      x: (start.x + end.x) / 2 - uy * bow,
      y: (start.y + end.y) / 2 + ux * bow,
    };
    return {
      path: `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} Q ${mid.x.toFixed(1)} ${mid.y.toFixed(
        1
      )} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`,
      mid,
    };
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
    setConnector,
    frame,
    setInstant(value) {
      instant = Boolean(value);
      if (!instant) return;
      collapseUntil = 0;
      breatheElapsed = 0;
      applyCoreBreath();
      for (const [id, view] of rendered) {
        if (view.exiting) {
          removeNode(id, view);
          continue;
        }
        view.heldUntil = 0;
        view.el.classList.remove("is-held", "is-entering");
        const p = view.placement;
        view.cur = { x: p.x, y: p.y, size: p.size };
      }
      frame(0);
    },
    nodeView: (id) => rendered.get(id),
    nodeElement: (id) => rendered.get(id)?.el || null,
    screenOf: (id) => rendered.get(id)?.screen || null,
    radiusOf: (id) => rendered.get(id)?.radius || 0,
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
