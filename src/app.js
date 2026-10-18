import { loadGraph, getIdea } from "./model.js";
import { computeLayout, kindShape } from "./layout.js";
import { parseHash, buildHash, backOneLevel } from "./route.js";
import { createBrainBackground, brainMarkup } from "./brain.js";

/** @typedef {import('./route.js').RouteState} RouteState */

export function createApp(root) {
  const viewport = root.querySelector("#viewport");
  const scene = root.querySelector("#scene");
  const nodesEl = root.querySelector("#nodes");
  const edgeGroup = root.querySelector("#edge-group");
  const popover = root.querySelector("#popover");
  const popoverTitle = root.querySelector("#popover-title");
  const popoverBody = root.querySelector("#popover-body");
  const popoverClose = root.querySelector("#popover-close");
  const popoverHandle = root.querySelector("#popover-drag-handle");
  const popoverConnector = root.querySelector("#popover-connector");
  const breadcrumb = root.querySelector("#breadcrumb");
  const backBtn = root.querySelector("#back-btn");
  const sampleHint = root.querySelector("#sample-hint");
  const motionToggle = root.querySelector("#motion-toggle");
  const introOverlay = root.querySelector("#intro-overlay");
  const introSkip = root.querySelector("#intro-skip");
  const introBrain = root.querySelector("#intro-brain");
  const bgCanvas = root.querySelector("#bg-canvas");
  const zoomIn = root.querySelector("#zoom-in");
  const zoomOut = root.querySelector("#zoom-out");
  const zoomReset = root.querySelector("#zoom-reset");

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let motionOn = !reducedMotion;
  let introDone = reducedMotion;

  const { graph, usingSample } = loadGraph();
  if (usingSample) sampleHint.hidden = false;
  introBrain.innerHTML = brainMarkup("full", "intro");

  /** @type {RouteState} */
  let route = parseHash(location.hash);
  let sourcesExpanded = !!route.sourcesExpanded;

  const camera = { x: 0, y: 0, zoom: 1 };
  let cameraManual = false;
  let layoutTargets = {};
  let visibleIds = new Set();
  let visibleEdges = [];
  let focusNodeId = "core";

  /** @type {Map<string, HTMLElement>} */
  const nodeEls = new Map();
  /** @type {Map<string, {x:number,y:number}>} */
  const displayPos = new Map();

  let popoverDragOffset = null;
  let popoverManualPos = null;
  let lastAnchorNodeId = null;

  let panning = false;
  let panStart = { x: 0, y: 0, camX: 0, camY: 0 };
  let pinch = null;

  const bg = createBrainBackground(bgCanvas, {
    motion: motionOn,
    reducedMotion,
    onIntroDone() {
      introDone = true;
      introOverlay.hidden = true;
      root.dataset.intro = "done";
    },
  });

  const deepLink = parseHash(location.hash).level !== "overview";
  if (!reducedMotion && !deepLink) introOverlay.hidden = false;
  else {
    introOverlay.hidden = true;
    if (deepLink) {
      introDone = true;
      bg.skipIntro();
    }
  }

  root.dataset.motion = motionOn ? "on" : "off";
  root.dataset.intro = introDone ? "done" : "play";
  if (reducedMotion) root.dataset.reducedMotion = "true";
  if (!motionOn) {
    motionToggle.textContent = "静态";
    motionToggle.setAttribute("aria-pressed", "true");
  }

  function applyRouteFromHash() {
    const next = parseHash(location.hash);
    const st = history.state;
    sourcesExpanded = !!(next.sourcesExpanded || st?.sourcesExpanded);
    route = { ...next };
    if (next.level !== "step" || !next.stepId) {
      popoverManualPos = null;
    }
    if (!cameraManual) scheduleFit();
    rebuild();
  }

  function navigateTo(next, { fromHistory = false, replace = false } = {}) {
    if (!fromHistory) {
      const full = buildHash(next);
      const state = { sourcesExpanded: !!next.sourcesExpanded || sourcesExpanded };
      if (replace) history.replaceState(state, "", full);
      else history.pushState(state, "", full);
    }
    const prev = route;
    route = { ...next };
    if (next.level !== "step" || next.stepId !== prev.stepId) {
      popoverManualPos = null;
      lastAnchorNodeId = null;
    }
    if (!cameraManual) scheduleFit();
    rebuild();
  }

  function scheduleFit() {
    requestAnimationFrame(() => fitCamera());
  }

  function isTightViewport() {
    const rect = viewport.getBoundingClientRect();
    return rect.width < 720 || rect.height < 640;
  }

  function fitCamera() {
    const rect = viewport.getBoundingClientRect();
    camera.x = 0;
    camera.y = 0;
    // Measure the rendered artwork and captions. Labels grow as the map shrinks,
    // so a second pass accounts for that boost before settling on the zoom.
    let zoom = 1;
    for (let pass = 0; pass < 3; pass++) {
      camera.zoom = zoom;
      applyCamera();
      let extentX = 110;
      let extentY = 100;
      for (const id of visibleIds) {
        const t = layoutTargets[id];
        const el = nodeEls.get(id);
        if (!t || t.fit === false || !el) continue;
        const p = displayPos.get(id) || t;
        const cx = rect.left + rect.width / 2 + p.x * zoom;
        const cy = rect.top + rect.height / 2 + p.y * zoom;
        for (const part of [el, el.querySelector('.node-caption')]) {
          if (!part) continue;
          const box = part.getBoundingClientRect();
          const left = t.x + (box.left - cx) / zoom;
          const right = t.x + (box.right - cx) / zoom;
          const top = t.y + (box.top - cy) / zoom;
          const bottom = t.y + (box.bottom - cy) / zoom;
          extentX = Math.max(extentX, Math.abs(left), Math.abs(right));
          extentY = Math.max(extentY, Math.abs(top), Math.abs(bottom));
        }
      }
      const fit = Math.min((rect.width - 32) / (2 * extentX), (rect.height - 30) / (2 * extentY));
      zoom = clamp(fit, 0.25, 1.08);
    }
    camera.zoom = zoom;
    applyCamera();
  }

  function rebuild() {
    const layout = computeLayout(graph, route, { sourcesExpanded, compact: isTightViewport() });
    layoutTargets = layout.targets;
    visibleIds = layout.visibleIds;
    visibleEdges = layout.edges;
    focusNodeId = layout.focusId;
    reconcileNodes();
    drawEdges();
    updateChrome();
    updatePopover();
    updateTabOrder();
  }

  function reconcileNodes() {
    const seen = new Set();
    for (const id of visibleIds) {
      seen.add(id);
      let el = nodeEls.get(id);
      if (!el) {
        el = createNodeElement(id);
        nodesEl.appendChild(el);
        nodeEls.set(id, el);
        const t = layoutTargets[id] || { x: 0, y: 0 };
        displayPos.set(id, { x: t.x, y: t.y });
      }
      updateNodeElement(el, id);
      const p = displayPos.get(id);
      el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) scale(var(--node-scale, 1))`;
    }
    for (const [id, el] of nodeEls) {
      if (!seen.has(id)) {
        el.remove();
        nodeEls.delete(id);
        displayPos.delete(id);
      }
    }
  }

  function createNodeElement(id) {
    const node = graph.nodes.get(id);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "node";
    btn.dataset.id = id;
    btn.dataset.type = node?.type || "unknown";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onNodeClick(id);
    });
    return btn;
  }

  function updateNodeElement(el, id) {
    const node = graph.nodes.get(id);
    if (!node) return;
    const t = layoutTargets[id] || { x: 0, y: 0, scale: 1, dim: false };
    el.dataset.dim = t.dim ? "1" : "0";
    el.classList.toggle("is-selected", isSelected(id));
    el.classList.toggle("is-path", isOnPath(id));
    el.classList.toggle("is-pulse", shouldPulse(id));
    el.style.setProperty("--node-scale", String(t.scale ?? 1));

    const angle = t.angle ?? Math.PI / 2;
    const compact = isTightViewport();
    const cap = node.type === "core" ? 124 : node.type === "theme" ? (compact && route.level === "overview" ? 64 : 96) : node.type === "idea" ? (compact ? 52 : 64) : (compact ? 46 : 52);
    const direction = compact && (node.type === "idea" || node.type === "conclusion") ? -1 : 1;
    const themeIdea = compact && route.level === "theme" && node.type === "idea";
    const compactChain = compact && (route.level === "idea" || route.level === "step");
    const chainNode = compactChain && (node.type === "step" || node.type === "conclusion");
    const chainIdea = compactChain && node.type === "idea" && node.ideaId === route.ideaId;
    el.style.setProperty("--cap-x", `${themeIdea || chainNode || chainIdea ? 0 : Math.cos(angle) * cap * direction}px`);
    el.style.setProperty("--cap-y", `${themeIdea ? -66 : chainNode ? -51 : chainIdea ? 69 : Math.sin(angle) * cap * direction}px`);

    const shape = node.type === "step" ? kindShape(node.kind) : node.type;
    el.dataset.shape = shape;

    let html = "";
    if (node.type === "core") {
      html = `<div class="brain-glyph" aria-hidden="true">${brainMarkup("full", id)}</div><span class="node-caption"><span class="node-core-label">我的大脑</span><span class="node-meta">PERSONAL NEURAL SPACE</span></span>`;
    } else if (node.type === "theme") {
      html = `<div class="brain-glyph" aria-hidden="true">${brainMarkup("sparse", id)}</div><span class="node-caption"><span class="node-theme-name">${escapeHtml(node.label)}</span>
        <span class="node-meta">${node.ideaCount} 条 · ${escapeHtml(node.latest || "")}</span></span>`;
    } else if (node.type === "idea") {
      html = `<span class="node-idea-orb" aria-hidden="true"></span><span class="node-caption"><span class="node-idea-title">${escapeHtml(compactChain ? shortText(node.label, 7) : node.label)}</span></span>`;
    } else if (node.type === "step") {
      html = `<span class="node-step-num">${node.index}</span>
        <span class="node-caption"><span class="node-step-title">${escapeHtml(compactChain ? shortText(node.label, 4) : node.label)}</span></span>`;
    } else if (node.type === "source") {
      html = `<span class="node-source-icon" aria-hidden="true">⎘</span>
        <span class="node-caption"><span class="node-source-title">${escapeHtml(shortText(node.label, 12))}</span></span>`;
    } else if (node.type === "conclusion") {
      const pending = node.pendingTitles?.length
        ? `<span class="node-conclusion-pending">有待确认</span>`
        : node.status
          ? `<span class="node-conclusion-pending">${escapeHtml(node.status)}</span>`
          : "";
      html = `<span class="node-conclusion-mark" aria-hidden="true"><span>结</span></span>
        <span class="node-caption"><span class="node-conclusion-tag">阶段理解</span>
        <span class="node-conclusion-text">${escapeHtml(compactChain ? shortText(node.summary || "", 4) : (node.summary || ""))}</span>${pending}</span>`;
    }
    if (el.innerHTML !== html) el.innerHTML = html;
    el.setAttribute("aria-label", nodeLabel(node));
  }

  function nodeLabel(node) {
    if (node.type === "theme") return `${node.label}，${node.ideaCount} 个问题`;
    return node.label;
  }

  function isSelected(id) {
    if (route.level !== "step") return false;
    if (route.stepId === "conclusion") return id === `conclusion:${route.themeId}/${route.ideaId}`;
    if (id.startsWith("source:")) return route.sourceId && id.endsWith(`/${route.sourceId}`);
    return id === `step:${route.themeId}/${route.ideaId}/${route.stepId}`;
  }

  function anchorId() {
    if (route.level !== "step" || !route.stepId) return null;
    if (route.stepId === "conclusion") return `conclusion:${route.themeId}/${route.ideaId}`;
    if (route.sourceId) {
      const src = `source:${route.themeId}/${route.ideaId}/${route.stepId}/${route.sourceId}`;
      if (graph.nodes.has(src)) return src;
    }
    return `step:${route.themeId}/${route.ideaId}/${route.stepId}`;
  }

  function isOnPath(id) {
    if (route.level !== "step" && route.level !== "idea") return false;
    if (!route.ideaId || !route.themeId) return false;
    if (id.startsWith(`step:${route.themeId}/${route.ideaId}/`)) return true;
    if (id === `conclusion:${route.themeId}/${route.ideaId}`) return true;
    if (id === `idea:${route.themeId}/${route.ideaId}`) return true;
    if (id === `theme:${route.themeId}`) return true;
    return false;
  }

  function shouldPulse(id) {
    if (!motionOn || reducedMotion) return false;
    if (route.level !== "step" && route.level !== "idea") return false;
    const node = graph.nodes.get(id);
    return node?.type === "step" && node.isNewestInIdea && isOnPath(id);
  }

  function onNodeClick(id) {
    const node = graph.nodes.get(id);
    if (!node) return;
    if (node.type === "core") {
      navigateTo({ level: "overview" });
      return;
    }
    if (node.type === "theme") {
      navigateTo({ level: "theme", themeId: node.themeId });
      return;
    }
    if (node.type === "idea") {
      navigateTo({ level: "idea", themeId: node.themeId, ideaId: node.ideaId });
      return;
    }
    if (node.type === "step") {
      sourcesExpanded = false;
      navigateTo({
        level: "step",
        themeId: node.themeId,
        ideaId: node.ideaId,
        stepId: node.stepId,
      });
      return;
    }
    if (node.type === "source") {
      navigateTo({
        level: "step",
        themeId: node.themeId,
        ideaId: node.ideaId,
        stepId: node.stepId,
        sourceId: node.refId,
        sourcesExpanded: true,
      });
      return;
    }
    if (node.type === "conclusion") {
      navigateTo({
        level: "step",
        themeId: node.themeId,
        ideaId: node.ideaId,
        stepId: "conclusion",
      });
    }
  }

  function nodeRadius(id) {
    const node = graph.nodes.get(id);
    const scale = layoutTargets[id]?.scale ?? 1;
    const width = nodeEls.get(id)?.offsetWidth || 36;
    return width * scale * (node?.type === 'core' || node?.type === 'theme' ? 0.4 : 0.5);
  }

  const edgeEls = new Map();
  const edgeSignalEls = new Map();

  function drawEdges() {
    const seen = new Set();
    for (const e of visibleEdges) {
      const a = displayPos.get(e.from);
      const b = displayPos.get(e.to);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const ra = nodeRadius(e.from);
      const rb = nodeRadius(e.to);
      const x1 = a.x + (dx / len) * ra;
      const y1 = a.y + (dy / len) * ra;
      const x2 = b.x - (dx / len) * rb;
      const y2 = b.y - (dy / len) * rb;
      const freeSpan = Math.max(0, len - ra - rb);
      const bend = ((e.id.charCodeAt(e.id.length - 1) % 2) * 2 - 1) * Math.min(18, freeSpan * 0.19);
      const cx = (x1 + x2) / 2 + (-dy / len) * bend;
      const cy = (y1 + y2) / 2 + (dx / len) * bend;
      const d = `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
      const hot = route.level === "step" && isOnPath(e.from) && isOnPath(e.to) && e.kind !== "source";
      const cls = [
        "edge",
        e.kind === "source" ? "edge-source" : e.kind === "inferred" ? "edge-inferred" : e.kind === "recorded" ? "edge-recorded" : "edge-link",
        hot ? "is-hot" : "",
      ].filter(Boolean).join(" ");
      const marker = e.kind === "recorded" ? "url(#arrow-recorded)" : e.kind === "inferred" ? "url(#arrow-inferred)" : "";
      let path = edgeEls.get(e.id);
      if (!path) {
        path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.dataset.id = e.id;
        edgeGroup.appendChild(path);
        edgeEls.set(e.id, path);
        const signal = document.createElementNS("http://www.w3.org/2000/svg", "path");
        signal.setAttribute("pathLength", "100");
        edgeGroup.appendChild(signal);
        edgeSignalEls.set(e.id, signal);
      }
      if (path.getAttribute("d") !== d) path.setAttribute("d", d);
      if (path.getAttribute("class") !== cls) path.setAttribute("class", cls);
      const signal = edgeSignalEls.get(e.id);
      if (signal.getAttribute("d") !== d) signal.setAttribute("d", d);
      signal.setAttribute("class", `edge-signal${hot ? " is-hot" : ""}${e.kind === "source" ? " is-source" : ""}`);
      if (marker) path.setAttribute("marker-end", marker);
      else path.removeAttribute("marker-end");
      seen.add(e.id);
    }
    for (const [id, path] of edgeEls) {
      if (!seen.has(id)) {
        path.remove();
        edgeEls.delete(id);
        edgeSignalEls.get(id)?.remove();
        edgeSignalEls.delete(id);
      }
    }
  }

  function applyCamera() {
    const boost = camera.zoom < 0.98 ? Math.min(1.65, 1 / camera.zoom) : 1;
    scene.style.setProperty("--label-boost", boost.toFixed(3));
    scene.style.transform = `translate(${viewport.clientWidth / 2 + camera.x}px, ${viewport.clientHeight / 2 + camera.y}px) scale(${camera.zoom})`;
  }

  function screenToWorld(sx, sy) {
    const rect = viewport.getBoundingClientRect();
    const cx = rect.left + rect.width / 2 + camera.x;
    const cy = rect.top + rect.height / 2 + camera.y;
    return {
      x: (sx - cx) / camera.zoom,
      y: (sy - cy) / camera.zoom,
    };
  }

  function worldToScreen(wx, wy) {
    const rect = viewport.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2 + camera.x + wx * camera.zoom,
      y: rect.top + rect.height / 2 + camera.y + wy * camera.zoom,
    };
  }

  function zoomAt(clientX, clientY, factor) {
    const rect = viewport.getBoundingClientRect();
    const lx = clientX - rect.left - rect.width / 2 - camera.x;
    const ly = clientY - rect.top - rect.height / 2 - camera.y;
    camera.zoom = clamp(camera.zoom * factor, 0.25, 2.5);
    const nx = clientX - rect.left - rect.width / 2;
    const ny = clientY - rect.top - rect.height / 2;
    camera.x = nx - lx * camera.zoom;
    camera.y = ny - ly * camera.zoom;
    applyCamera();
  }

  function updateChrome() {
    root.dataset.level = route.level;
    backBtn.hidden = route.level === "overview" && !route.sourceId;
    breadcrumb.innerHTML = "";
    const crumbs = [{ label: "概览", route: { level: "overview" } }];
    if (route.themeId) {
      const t = graph.nodes.get(`theme:${route.themeId}`);
      crumbs.push({ label: t?.label || route.themeId, route: { level: "theme", themeId: route.themeId } });
    }
    if (route.ideaId) {
      const i = graph.nodes.get(`idea:${route.themeId}/${route.ideaId}`);
      crumbs.push({
        label: i?.label?.slice(0, 12) + (i?.label?.length > 12 ? "…" : "") || route.ideaId,
        route: { level: "idea", themeId: route.themeId, ideaId: route.ideaId },
      });
    }
    if (route.stepId) {
      const label =
        route.stepId === "conclusion"
          ? "阶段理解"
          : (() => {
              const s = graph.nodes.get(`step:${route.themeId}/${route.ideaId}/${route.stepId}`);
              const text = s?.label || route.stepId;
              return text.length > 10 ? `${text.slice(0, 10)}…` : text;
            })();
      crumbs.push({
        label,
        route: {
          level: "step",
          themeId: route.themeId,
          ideaId: route.ideaId,
          stepId: route.stepId,
        },
      });
    }
    const shownCrumbs = isTightViewport() && crumbs.length > 2 ? [crumbs[1], crumbs.at(-1)] : crumbs;
    shownCrumbs.forEach((c, idx) => {
      if (idx) {
        const sep = document.createElement("span");
        sep.className = "crumb-sep";
        sep.textContent = "›";
        breadcrumb.appendChild(sep);
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "crumb";
      btn.textContent = c.label;
      btn.addEventListener("click", () => navigateTo(c.route));
      breadcrumb.appendChild(btn);
    });
  }

  function updatePopover() {
    const anchor = anchorId();
    if (!anchor) {
      popover.hidden = true;
      return;
    }

    if (route.stepId === "conclusion") {
      const node = graph.nodes.get(anchor);
      if (!node) {
        popover.hidden = true;
        return;
      }
      popover.hidden = false;
      const pending = node.pendingTitles || [];
      const evidence = (node.evidence || [])
        .map((item) => {
          const flag = item.connection === "inferred" ? " · 关联待确认" : "";
          return `<li>${escapeHtml(item.date || "")} ${escapeHtml(item.title || "")}${flag}</li>`;
        })
        .join("");
      popoverTitle.textContent = node.summary || "阶段理解";
      popoverBody.innerHTML = `
        <p class="popover-flag">整理用的阶段短句，不是已经确认的新结论。</p>
        ${node.status ? `<p class="popover-meta">${escapeHtml(node.status)}</p>` : ""}
        ${pending.length ? `<p class="popover-flag">待确认：${escapeHtml(pending.join("、"))}</p>` : ""}
        <p class="popover-sources-label">依据</p>
        <ul class="popover-evidence">${evidence}</ul>
      `;
      positionPopover(anchor);
      return;
    }

    const stepKey = `step:${route.themeId}/${route.ideaId}/${route.stepId}`;
    const step = graph.nodes.get(stepKey);
    if (!step) {
      popover.hidden = true;
      return;
    }

    popover.hidden = false;

    if (route.sourceId) {
      const srcId = `source:${route.themeId}/${route.ideaId}/${route.stepId}/${route.sourceId}`;
      const src = graph.nodes.get(srcId);
      popoverTitle.textContent = src?.label || "来源";
      popoverBody.innerHTML = `
        <button type="button" class="popover-back" id="popover-back-step">← 返回步骤说明</button>
        <p class="popover-lead">${escapeHtml(src?.text || "")}</p>
        <p class="popover-meta">${escapeHtml(src?.date || "")} · ${escapeHtml(src?.kind || "")}</p>
        <blockquote class="popover-quote">${escapeHtml(src?.quote || "")}</blockquote>
      `;
      popoverBody.querySelector("#popover-back-step")?.addEventListener("click", () => {
        navigateTo({
          level: "step",
          themeId: route.themeId,
          ideaId: route.ideaId,
          stepId: route.stepId,
          sourcesExpanded: true,
        });
      });
    } else {
      const inferred = step.connection === "inferred";
      popoverTitle.textContent = step.label;
      const refsHtml = [...new Map((step.refs || []).map((ref) => [ref.id, ref])).values()]
        .map((r) => {
          const srcId = `source:${route.themeId}/${route.ideaId}/${route.stepId}/${r.id}`;
          const src = graph.nodes.get(srcId);
          return `<button type="button" class="source-entry" data-ref="${escapeHtml(r.id)}">${escapeHtml(src?.label || r.id)}</button>`;
        })
        .join("");
      popoverBody.innerHTML = `
        ${inferred ? '<p class="popover-flag">关联待确认</p>' : ""}
        <p class="popover-lead">${escapeHtml(step.body || "")}</p>
        <p class="popover-meta">${escapeHtml(step.date || "")} · ${escapeHtml(step.kind || "")}</p>
        ${refsHtml ? `<div class="popover-sources"><span class="popover-sources-label">来源</span>${refsHtml}</div>` : ""}
        <button type="button" class="popover-expand-sources" ${sourcesExpanded ? "hidden" : ""}>展开来源节点</button>
      `;
      popoverBody.querySelector(".popover-expand-sources")?.addEventListener("click", () => {
        sourcesExpanded = true;
        history.pushState({ sourcesExpanded: true }, "", buildHash(route));
        rebuild();
      });
      popoverBody.querySelectorAll(".source-entry").forEach((btn) => {
        btn.addEventListener("click", () => {
          const refId = btn.getAttribute("data-ref");
          sourcesExpanded = true;
          navigateTo({
            level: "step",
            themeId: route.themeId,
            ideaId: route.ideaId,
            stepId: route.stepId,
            sourceId: refId,
            sourcesExpanded: true,
          });
        });
      });
    }

    positionPopover(anchor);
  }

  function positionPopover(anchorId) {
    const pos = displayPos.get(anchorId);
    if (!pos) return;
    if (lastAnchorNodeId !== anchorId) {
      popoverManualPos = null;
      lastAnchorNodeId = anchorId;
    }
    const screen = worldToScreen(pos.x, pos.y);
    const pw = Math.min(320, Math.max(260, viewport.clientWidth * 0.26));
    popover.style.width = `${pw}px`;

    if (popoverManualPos) {
      popover.style.left = `${popoverManualPos.x}px`;
      popover.style.top = `${popoverManualPos.y}px`;
    } else if (viewport.clientWidth < 650) {
      const rect = viewport.getBoundingClientRect();
      const panelHeight = rect.width < 380 ? 134 : Math.min(160, window.innerHeight * .31);
      popover.style.left = `${screen.x < rect.left + rect.width / 2 ? rect.left + 8 : rect.right - pw - 8}px`;
      popover.style.top = `${rect.bottom - panelHeight - 8}px`;
    } else {
      const rect = viewport.getBoundingClientRect();
      const maxH = Math.min(window.innerHeight * 0.55, 360);
      const cx = rect.left + rect.width / 2;
      const onLeft = screen.x < cx;
      const left = onLeft ? rect.left + 16 : rect.right - pw - 16;
      let top = screen.y - 36;
      const minTop = rect.top + 52;
      const maxTop = Math.max(minTop, rect.bottom - maxH - 12);
      top = Math.min(Math.max(top, minTop), maxTop);
      popover.style.left = `${left}px`;
      popover.style.top = `${top}px`;
    }

    popoverConnector.style.left = `${screen.x}px`;
    popoverConnector.style.top = `${screen.y}px`;
    const pr = popover.getBoundingClientRect();
    popoverConnector.style.width = `${Math.max(20, Math.hypot(pr.left + pr.width / 2 - screen.x, pr.top - screen.y))}px`;
    const ang = Math.atan2(pr.top - screen.y, pr.left + pr.width / 2 - screen.x);
    popoverConnector.style.transform = `rotate(${ang}rad)`;
  }

  function updateTabOrder() {
    const order = [];
    if (route.level === "overview") order.push("core", ...graph.themes.map((t) => `theme:${t.id}`));
    else if (route.level === "theme") {
      order.push(`theme:${route.themeId}`, ...graph.themes.filter((t) => t.id !== route.themeId).map((t) => `theme:${t.id}`));
      const theme = graph.themes.find((t) => t.id === route.themeId);
      for (const idea of theme?.ideas || []) order.push(`idea:${route.themeId}/${idea.id}`);
    } else if (route.level === "idea" || route.level === "step") {
      order.push(`theme:${route.themeId}`);
      const theme = graph.themes.find((t) => t.id === route.themeId);
      for (const idea of theme?.ideas || []) order.push(`idea:${route.themeId}/${idea.id}`);
      const active = getIdea(graph, route.themeId, route.ideaId);
      for (const st of active?.nodes || []) order.push(`step:${route.themeId}/${route.ideaId}/${st.id}`);
      order.push(`conclusion:${route.themeId}/${route.ideaId}`);
      if (sourcesExpanded && route.stepId) {
        const step = graph.nodes.get(`step:${route.themeId}/${route.ideaId}/${route.stepId}`);
        for (const r of step?.refs || []) order.push(`source:${route.themeId}/${route.ideaId}/${route.stepId}/${r.id}`);
      }
    }
    let tab = 1;
    for (const id of order) {
      const el = nodeEls.get(id);
      if (el && visibleIds.has(id)) el.tabIndex = tab++;
    }
  }

  function animatePositions() {
    const snap = !motionOn || reducedMotion;
    for (const id of visibleIds) {
      const t = layoutTargets[id] || { x: 0, y: 0 };
      let p = displayPos.get(id);
      if (!p) {
        p = { x: t.x, y: t.y };
        displayPos.set(id, p);
      }
      const dx = t.x - p.x;
      const dy = t.y - p.y;
      if (snap || Math.hypot(dx, dy) < 0.4) {
        p.x = t.x;
        p.y = t.y;
      } else {
        p.x += dx * 0.14;
        p.y += dy * 0.14;
      }
      const el = nodeEls.get(id);
      if (el) {
        el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) scale(var(--node-scale, 1))`;
      }
    }
    drawEdges();
    if (route.level === "step" && !popover.hidden) {
      const anchor = anchorId();
      if (anchor) positionPopover(anchor);
    }
    requestAnimationFrame(animatePositions);
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function shortText(s, n) {
    const text = String(s || "");
    return text.length > n ? `${text.slice(0, n)}…` : text;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function truncate(s, n) {
    if (s.length <= n) return s;
    return s.slice(0, n) + "…";
  }

  // Events
  viewport.addEventListener(
    "wheel",
    (e) => {
      if (popover.contains(e.target)) return;
      e.preventDefault();
      cameraManual = true;
      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      zoomAt(e.clientX, e.clientY, factor);
    },
    { passive: false }
  );

  viewport.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".node")) return;
    panning = true;
    cameraManual = true;
    panStart = { x: e.clientX, y: e.clientY, camX: camera.x, camY: camera.y };
    viewport.setPointerCapture(e.pointerId);
  });
  viewport.addEventListener("pointermove", (e) => {
    if (!panning) return;
    camera.x = panStart.camX + (e.clientX - panStart.x);
    camera.y = panStart.camY + (e.clientY - panStart.y);
    applyCamera();
      if (route.level === "step") {
        const anchor = anchorId();
        if (anchor) positionPopover(anchor);
      }
  });
  viewport.addEventListener("pointerup", () => {
    panning = false;
  });

  viewport.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) {
      const [a, b] = e.touches;
      pinch = {
        dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        zoom: camera.zoom,
        midX: (a.clientX + b.clientX) / 2,
        midY: (a.clientY + b.clientY) / 2,
      };
      cameraManual = true;
    }
  }, { passive: true });
  viewport.addEventListener("touchmove", (e) => {
    if (e.touches.length === 2 && pinch) {
      e.preventDefault();
      const [a, b] = e.touches;
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const factor = dist / pinch.dist;
      camera.zoom = clamp(pinch.zoom * factor, 0.25, 2.5);
      applyCamera();
    } else if (e.touches.length === 1 && !e.target.closest(".node")) {
      // single finger pan handled via pointer events on supported browsers
    }
  }, { passive: false });

  zoomIn.addEventListener("click", () => {
    cameraManual = true;
    const rect = viewport.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.15);
  });
  zoomOut.addEventListener("click", () => {
    cameraManual = true;
    const rect = viewport.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 0.87);
  });
  zoomReset.addEventListener("click", () => {
    cameraManual = false;
    fitCamera();
  });

  backBtn.addEventListener("click", () => {
    if (route.sourceId) {
      navigateTo({
        level: "step",
        themeId: route.themeId,
        ideaId: route.ideaId,
        stepId: route.stepId,
        sourcesExpanded: true,
      });
      return;
    }
    if (route.level === "step" && sourcesExpanded) {
      sourcesExpanded = false;
      history.pushState({ sourcesExpanded: false }, "", buildHash(route));
      rebuild();
      return;
    }
    const next = backOneLevel(route);
    sourcesExpanded = false;
    navigateTo(next);
  });

  popoverClose.addEventListener("click", closePopover);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !popover.hidden) {
      closePopover();
    }
  });

  function closePopover() {
    const id = anchorId();
    const el = id ? nodeEls.get(id) : null;
    navigateTo({ level: "idea", themeId: route.themeId, ideaId: route.ideaId });
    requestAnimationFrame(() => el?.focus());
  }

  ["pointerdown", "wheel", "touchstart"].forEach((ev) => {
    popover.addEventListener(ev, (e) => e.stopPropagation(), { passive: false });
  });

  let dragPopover = false;
  popoverHandle.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".popover-close")) return;
    dragPopover = true;
    const r = popover.getBoundingClientRect();
    popoverDragOffset = { x: e.clientX - r.left, y: e.clientY - r.top };
    popoverHandle.setPointerCapture(e.pointerId);
  });
  popoverHandle.addEventListener("pointermove", (e) => {
    if (!dragPopover) return;
    popoverManualPos = { x: e.clientX - popoverDragOffset.x, y: e.clientY - popoverDragOffset.y };
    popover.style.left = `${popoverManualPos.x}px`;
    popover.style.top = `${popoverManualPos.y}px`;
  });
  popoverHandle.addEventListener("pointerup", () => {
    dragPopover = false;
  });

  motionToggle.addEventListener("click", () => {
    motionOn = !motionOn;
    root.dataset.motion = motionOn ? "on" : "off";
    motionToggle.setAttribute("aria-pressed", motionOn ? "false" : "true");
    motionToggle.textContent = motionOn ? "动效" : "静态";
    bg.setMotion(motionOn);
  });

  introSkip.addEventListener("click", () => {
    bg.skipIntro();
    introOverlay.hidden = true;
    introDone = true;
  });

  window.addEventListener("hashchange", () => applyRouteFromHash());
  window.addEventListener("popstate", () => applyRouteFromHash());

  window.addEventListener("resize", () => {
    rebuild();
    applyCamera();
    if (!cameraManual) fitCamera();
  });

  // Initial hash sync without double push
  if (!location.hash) history.replaceState(null, "", "#/");
  route = parseHash(location.hash);
  sourcesExpanded = !!route.sourcesExpanded;
  rebuild();
  applyCamera();
  if (!cameraManual) fitCamera();
  requestAnimationFrame(animatePositions);

  return { graph, navigateTo, route: () => route };
}
