/**
 * Application shell: owns the explicit state (route level, selected node,
 * expanded source branches, camera, popover) and keeps the canvas as the only
 * surface. Nothing here ever scrolls the page.
 */
import { createBackground } from "./background.js";
import { createCamera } from "./camera.js";
import { loadGraph } from "./graph.js";
import { runIntro } from "./intro.js";
import { boundsOf, computeLayout } from "./layout.js";
import { createPopover } from "./popover.js";
import { backOneLevel, buildHash, parseHash } from "./route.js";
import { createScene } from "./scene.js";
import { createStars } from "./stars.js";
import { createReplay } from "./replay.js";

export function startApp() {
  const el = {
    app: document.getElementById("app"),
    stage: document.getElementById("stage"),
    nodes: document.getElementById("nodes"),
    stars: document.getElementById("stars"),
    edges: document.getElementById("edges"),
    tags: document.getElementById("edge-tags"),
    bg: document.getElementById("bg-canvas"),
    topBar: document.querySelector(".top-bar"),
    bottomBar: document.querySelector(".bottom-bar"),
    breadcrumb: document.getElementById("breadcrumb"),
    back: document.getElementById("back-btn"),
    motion: document.getElementById("motion-toggle"),
    sampleHint: document.getElementById("sample-hint"),
    status: document.getElementById("status-line"),
    popover: document.getElementById("popover"),
    intro: document.getElementById("intro-overlay"),
    introSvg: document.getElementById("intro-brain"),
    introSkip: document.getElementById("intro-skip"),
    zoomIn: document.getElementById("zoom-in"),
    zoomOut: document.getElementById("zoom-out"),
    zoomReset: document.getElementById("zoom-reset"),
  };

  const graph = loadGraph();
  if (graph.usingSample) el.sampleHint.hidden = false;

  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  const prefersReduced = motionPreference.matches;
  const state = {
    route: normalizeRoute(parseHash(location.hash), graph),
    selectedId: null,
    expanded: new Set(),
    popover: null,
    motion: !prefersReduced,
  };

  const camera = createCamera();
  const background = createBackground({ canvas: el.bg });
  const scene = createScene({
    nodesLayer: el.nodes,
    edgesSvg: el.edges,
    tagsLayer: el.tags,
    camera,
    onActivate: activateNode,
    onHoverChange: () => {},
  });
  // lessons.js 缺失时这里什么都不画，其余页面不受影响。
  // 天秤铺在画布背景上，不跟链条走；lessons.js 缺失时这里什么都不画。
  const stars = createStars({
    layer: el.stars,
    svg: el.edges,
    onOpen: openStar,
  });
  const lessons = globalThis.window?.LESSONS?.lessons || [];
  const patterns = globalThis.window?.LESSONS?.patterns || [];

  const popover = createPopover({
    el: el.popover,
    onClose: () => {
      state.popover = null;
      stars.setOpen(null);
      scene.setConnector(null);
      scene.setFlowing(false);
    },
    onAction: handlePopoverAction,
  });

  let layout = null;
  let pendingActivation = null;
  let replaySelection = false;
  const replay = createReplay({ host: el.bottomBar, onSelect: selectReplayStep });

  function selectReplayStep(step, played) {
    replaySelection = true;
    state.selectedId = step.id;
    if (state.popover && !state.popover.lessonId && !state.popover.patternId) {
      openInspector(step, { keepPosition: true });
    } else {
      applySelection();
    }
    const route = { level: "step", themeId: step.themeId, ideaId: step.ideaId, stepId: step.stepId };
    state.route = route;
    history.replaceState(null, "", buildHash(route));
    renderChrome();
    if (played) scene.flashEdges(graph.edgesInto(step.id).map((edge) => edge.id));
  }

  function pauseReplay() {
    replay.pause();
    scene.clearFlashes();
  }

  applyMotion(state.motion, { silent: true });
  measureInsets();
  render({ refit: true, instantCamera: true });

  const deepLinked = state.route.level !== "overview";
  runIntro({
    overlay: el.intro,
    svg: el.introSvg,
    skipBtn: el.introSkip,
    background,
    motion: state.motion && !deepLinked,
  });

  // ---------------------------------------------------------------- rendering

  function render({ refit = false, instantCamera = false, collapse = false } = {}) {
    const rect = el.stage.getBoundingClientRect();
    const { level, themeId, ideaId } = state.route;
    replay.setContext(
      level === "idea" || level === "step" ? `${themeId}/${ideaId}` : null,
      ideaId ? graph.steps(themeId, ideaId) : []
    );
    measureInsets();
    camera.setArea({
      width: rect.width,
      height: rect.height,
      insets: {
        top: el.topBar.offsetHeight + 14,
        bottom: el.bottomBar.offsetHeight + (replay.steps.length ? 24 : 0) + 14,
        left: 18,
        right: 18,
      },
    });

    layout = computeLayout(
      graph,
      {
        level: state.route.level === "step" ? "idea" : state.route.level,
        themeId: state.route.themeId,
        ideaId: state.route.ideaId,
        expanded: state.expanded,
      },
      { width: rect.width, height: rect.height }
    );

    scene.setLayout(layout, graph.edges, { collapse });
    // Only level changes, reset and resize refit: selecting a node or
    // expanding a source branch must leave the camera exactly where it is.
    if (refit) {
      fitCamera();
      if (instantCamera) camera.snap();
    }
    applySelection();
    renderChrome();
  }

  function fitCamera() {
    camera.fit(boundsOf(layout.focus), boundsOf(layout.placements.values()), layout.fit);
  }

  function applySelection() {
    scene.setFlowing(Boolean(state.popover) && !replaySelection);
    const selected = state.selectedId ? graph.nodes.get(state.selectedId) : null;
    if (replaySelection && selected?.type === "step") {
      const nodeIds = replay.steps.slice(0, replay.index + 1).map((step) => step.id);
      const idea = graph.idea(selected.themeId, selected.ideaId);
      if (idea) nodeIds.push(idea.id);
      const visited = new Set(nodeIds);
      scene.setSelection({
        selectedId: selected.id,
        nodeIds,
        edgeIds: graph.edges.filter((edge) => visited.has(edge.from) && visited.has(edge.to)).map((edge) => edge.id),
        focusChain: true,
        pulse: false,
      });
      return;
    }
    if (!selected) {
      scene.setSelection({ selectedId: null });
      return;
    }
    const nodeIds = new Set([selected.id]);
    const edgeIds = new Set();

    if (selected.type === "step" || selected.type === "source" || selected.type === "conclusion") {
      const themeId = selected.themeId;
      const ideaId = selected.ideaId;
      const idea = graph.idea(themeId, ideaId);
      const steps = graph.steps(themeId, ideaId);
      const stepNode =
        selected.type === "step"
          ? selected
          : selected.type === "source"
          ? graph.step(themeId, ideaId, selected.stepId)
          : steps[steps.length - 1];
      const limit = stepNode ? stepNode.index : steps.length;

      if (idea) nodeIds.add(idea.id);
      for (const step of steps) {
        if (step.index > limit) continue;
        nodeIds.add(step.id);
      }
      for (const edge of graph.edges) {
        if (nodeIds.has(edge.from) && nodeIds.has(edge.to)) edgeIds.add(edge.id);
      }
      if (selected.type === "source") {
        edgeIds.add(`e:${stepNode?.id}>${selected.refId}`);
      }
      if (selected.type === "conclusion") {
        const conclusionEdge = graph.edgesInto(selected.id)[0];
        if (conclusionEdge) edgeIds.add(conclusionEdge.id);
      }
    } else {
      for (const edge of graph.edgesFrom(selected.id)) edgeIds.add(edge.id);
      for (const edge of graph.edgesInto(selected.id)) edgeIds.add(edge.id);
    }

    scene.setSelection({
      selectedId: selected.id,
      nodeIds,
      edgeIds,
      focusChain: selected.type === "step" || selected.type === "source" || selected.type === "conclusion",
    });
  }

  function renderChrome() {
    const { level, themeId, ideaId, stepId } = state.route;
    const theme = themeId ? graph.theme(themeId) : null;
    const idea = ideaId ? graph.idea(themeId, ideaId) : null;
    const step = stepId ? graph.step(themeId, ideaId, stepId) : null;

    const crumbs = [{ label: "总览", route: { level: "overview" } }];
    if (theme) crumbs.push({ label: theme.label, route: { level: "theme", themeId } });
    if (idea) crumbs.push({ label: shorten(idea.label, 14), route: { level: "idea", themeId, ideaId } });
    if (step) crumbs.push({ label: `步骤 ${String(step.index).padStart(2, "0")}`, route: state.route });

    el.breadcrumb.innerHTML = crumbs
      .map((crumb, i) => {
        const last = i === crumbs.length - 1;
        return `<button type="button" class="crumb${last ? " is-current" : ""}" data-hash="${buildHash(
          crumb.route
        )}"${last ? ' aria-current="true"' : ""}>${escapeHtml(crumb.label)}</button>`;
      })
      .join('<span class="crumb-sep" aria-hidden="true">/</span>');

    el.back.hidden = level === "overview";
    el.status.textContent = statusLine(level, theme, idea, step);
  }

  function statusLine(level, theme, idea, step) {
    if (level === "overview") return `${graph.themes().length} 个主题 · 最近更新 ${graph.latest || "—"}`;
    if (level === "theme") return `${theme?.label || ""} · ${theme?.ideaCount || 0} 个问题`;
    if (!step) return `${idea?.label || ""} · ${idea?.stepCount || 0} 步`;
    return `${idea?.label || ""} · 第 ${step.index}/${step.total} 步`;
  }

  // -------------------------------------------------------------- interaction

  function activateNode(nodeId, element) {
    pauseReplay();
    replaySelection = false;
    if (scene.isCollapsing()) {
      pendingActivation = { nodeId, element };
      return;
    }
    pendingActivation = null;
    const node = graph.nodes.get(nodeId);
    if (!node) return;
    const route = state.route;
    const viaKeyboard = element?.matches(":focus-visible") ?? false;

    if (node.type === "core") {
      if (route.level === "overview") return openInspector(node, { element, viaKeyboard });
      return navigate({ level: "overview" });
    }
    if (node.type === "theme") {
      if (route.themeId === node.themeId && route.level === "theme") {
        return openInspector(node, { element, viaKeyboard });
      }
      return navigate({ level: "theme", themeId: node.themeId });
    }
    if (node.type === "idea") {
      if (route.ideaId === node.ideaId && route.themeId === node.themeId) {
        return openInspector(node, { element, viaKeyboard });
      }
      return navigate({ level: "idea", themeId: node.themeId, ideaId: node.ideaId });
    }
    if (node.type === "step") {
      return navigate({
        level: "step",
        themeId: node.themeId,
        ideaId: node.ideaId,
        stepId: node.stepId,
      });
    }
    if (node.type === "source") {
      return navigate({
        level: "step",
        themeId: node.themeId,
        ideaId: node.ideaId,
        stepId: node.stepId,
        sourceId: node.refId,
      });
    }
    return openInspector(node, { element, viaKeyboard });
  }

  /** 点一颗星：经验星开断语卡，主星开模式卡。两张卡都挂在星点上，不跟链条节点走。 */
  function openStar(target) {
    if (target.kind === "pattern") return openPattern(target.id);
    openLesson(target.id);
  }

  function openLesson(lessonId) {
    const lesson = lessons.find((item) => item.id === lessonId);
    if (!lesson) return;
    const idea = ideaOf(lesson.ideaId);
    if (!idea) return;
    state.selectedId = null;
    state.popover = { nodeId: idea.id, mode: "verdict", lessonId };
    applySelection();
    stars.setOpen(lessonId);
    scene.frame(0);
    popover.show({
      ...lessonContent(lesson, idea),
      anchor: stars.anchorOf(lessonId),
      avoid: [],
      returnFocus: stars.starElement(lessonId),
    });
  }

  function openPattern(patternId) {
    const pattern = patterns.find((item) => item.id === patternId);
    if (!pattern) return;
    state.selectedId = null;
    state.popover = { nodeId: null, mode: "pattern", patternId };
    applySelection();
    stars.setOpen(patternId);
    scene.frame(0);
    popover.show({
      ...patternContent(pattern),
      anchor: stars.anchorOf(patternId),
      avoid: [],
      returnFocus: stars.starElement(patternId),
    });
  }

  function ideaOf(ideaId) {
    for (const theme of graph.themes()) {
      const idea = graph.ideas(theme.themeId).find((item) => item.ideaId === ideaId);
      if (idea) return idea;
    }
    return null;
  }

  /** Open the popover for a node that is not part of the hash route. */
  function openInspector(node, { element, viaKeyboard, keepPosition } = {}) {
    state.selectedId = node.id;
    state.popover = { nodeId: node.id, mode: "node" };
    applySelection();
    const content = inspectorContent(node);
    popover.show({
      ...content,
      anchor: anchorOf(node.id),
      avoid: avoidPoints(node.id),
      viaKeyboard,
      keepPosition,
      returnFocus: element || scene.nodeElement(node.id),
    });
  }

  function handlePopoverAction(action, value) {
    const current = state.popover ? graph.nodes.get(state.popover.nodeId) : null;
    if (action === "expand-sources" && current?.type === "step") {
      state.expanded.add(current.id);
      render();
      openInspector(current, { keepPosition: true, element: scene.nodeElement(current.id) });
      return;
    }
    if (action === "collapse-sources" && current?.type === "step") {
      state.expanded.delete(current.id);
      render();
      openInspector(current, { keepPosition: true, element: scene.nodeElement(current.id) });
      return;
    }
    if (action === "open-source" && current) {
      const step = current.type === "step" ? current : graph.step(current.themeId, current.ideaId, current.stepId);
      state.expanded.add(step.id);
      navigate({
        level: "step",
        themeId: step.themeId,
        ideaId: step.ideaId,
        stepId: step.stepId,
        sourceId: value,
      });
      return;
    }
    if (action === "back-to-step" && current) {
      navigate({
        level: "step",
        themeId: current.themeId,
        ideaId: current.ideaId,
        stepId: current.stepId,
      });
      return;
    }
    if (action === "open-idea") {
      const [themeId, ideaId] = value.split("/");
      navigate({ level: "idea", themeId, ideaId });
      return;
    }
    if (action === "open-step") {
      const [themeId, ideaId, stepId] = value.split("/");
      navigate({ level: "step", themeId, ideaId, stepId });
    }
  }

  function navigate(route) {
    const hash = buildHash(route);
    if (hash === (location.hash || "#/")) {
      applyRoute(normalizeRoute(parseHash(hash), graph), { force: true });
      return;
    }
    location.hash = hash;
  }

  function applyRoute(next, { force = false } = {}) {
    pauseReplay();
    replaySelection = false;
    pendingActivation = null;
    const previous = state.route;
    const structuralChange =
      previous.themeId !== next.themeId ||
      previous.ideaId !== next.ideaId ||
      (previous.level === "overview") !== (next.level === "overview");
    state.route = next;

    if (structuralChange) state.expanded.clear();

    if (next.level === "step") {
      const step = graph.step(next.themeId, next.ideaId, next.stepId);
      if (!step) {
        state.route = { level: "idea", themeId: next.themeId, ideaId: next.ideaId };
      } else if (next.sourceId) {
        state.expanded.add(step.id);
      }
    }

    const route = state.route;
    if (route.level === "step") {
      const step = graph.step(route.themeId, route.ideaId, route.stepId);
      const source = route.sourceId
        ? graph.nodes.get(`source:${route.themeId}/${route.ideaId}/${route.stepId}/${route.sourceId}`)
        : null;
      const target = source || step;
      state.selectedId = target.id;
      state.popover = { nodeId: target.id, mode: source ? "source" : "node" };
    } else {
      state.selectedId = null;
      state.popover = null;
      popover.close();
    }

    render({ refit: structuralChange || force, collapse: structuralChange });
    replay.syncSelected(state.selectedId);

    if (state.popover) {
      const node = state.popover.nodeId ? graph.nodes.get(state.popover.nodeId) : null;
      const lesson = state.popover.lessonId ? lessons.find((item) => item.id === state.popover.lessonId) : null;
      const pattern = state.popover.patternId ? patterns.find((item) => item.id === state.popover.patternId) : null;
      const content = lesson ? lessonContent(lesson, node) : pattern ? patternContent(pattern) : inspectorContent(node);
      scene.frame(0); // refresh screen positions so the popover can place itself
      const starId = lesson?.id || pattern?.id || null;
      popover.show({
        ...content,
        anchor: starId ? stars.anchorOf(starId) : anchorOf(node.id),
        avoid: starId ? [] : avoidPoints(node.id),
        returnFocus: starId ? stars.starElement(starId) : scene.nodeElement(node.id),
      });
    }
  }

  /** Screen centres of the other visible nodes, so the popover can dodge them. */
  function avoidPoints(excludeId) {
    const points = [];
    for (const id of layout.placements.keys()) {
      if (id === excludeId) continue;
      const screen = scene.screenOf(id);
      if (screen) points.push(screen);
    }
    return points;
  }

  function anchorOf(nodeId) {
    const screen = scene.screenOf(nodeId);
    if (!screen) return null;
    return { x: screen.x, y: screen.y, r: scene.radiusOf(nodeId) };
  }

  // ----------------------------------------------------------- popover bodies

  /**
   * 断语卡：一句经验，下面一行出处。
   * 「含推想」只在核心结论本身是推想时出现。数据里没有单独的字段标这一层，
   * 只能从原文看：hasInference 几乎条条都是真，区分不了；改看句子里有没有
   * 把推想说破的收尾（「原文没说」「原文没写」「先只当」）。没有就不出这个标记。
   */
  function lessonContent(lesson, idea) {
    const own = patterns.filter((pattern) => lesson.patternIds.includes(pattern.id));
    const steps = lesson.stepIds
      .map((stepId) => graph.step(idea.themeId, idea.ideaId, stepId))
      .filter(Boolean);
    const provenance = steps
      .map(
        (step) =>
          `<button type="button" class="verdict-source" data-action="open-step" data-value="${escapeHtml(
            `${idea.themeId}/${idea.ideaId}/${step.stepId}`
          )}">步骤 ${escapeHtml(String(step.index).padStart(2, "0"))}</button>`
      )
      .join('<i aria-hidden="true">·</i>');
    const patternLine = own.map((pattern) => escapeHtml(pattern.name)).join(" · ");
    const flags = [
      lesson.status !== "confirmed" ? "待确认" : "",
      inferenceInConclusion(lesson.text) ? "含推想" : "",
    ].filter(Boolean);
    return {
      title: "",
      kicker: "",
      body:
        `<article class="verdict">` +
        `<p class="verdict-mark">太史公曰</p>` +
        `<p class="verdict-text">${escapeHtml(lesson.text)}</p>` +
        `<p class="verdict-line">${provenance}${patternLine ? `<i aria-hidden="true">·</i><span>${patternLine}</span>` : ""}</p>` +
        (flags.length ? `<p class="verdict-flag">${flags.map((flag) => `<span>${flag}</span>`).join("")}</p>` : "") +
        `</article>`,
      actions: "",
    };
  }

  /** 主星的卡：模式名、一句「或曰」的说明、属于它的经验。 */
  function patternContent(pattern) {
    const members = pattern.lessonIds
      .map((id) => lessons.find((lesson) => lesson.id === id))
      .filter(Boolean);
    return {
      title: "",
      kicker: "",
      body:
        `<article class="verdict verdict--pattern">` +
        `<p class="verdict-mark">或曰</p>` +
        `<p class="verdict-text">${escapeHtml(pattern.name)}</p>` +
        `<p class="verdict-note">${escapeHtml(pattern.description)}</p>` +
        `<ul class="verdict-members">${members
          .map(
            (lesson) =>
              `<li><button type="button" class="verdict-member" data-star="${escapeHtml(
                lesson.id
              )}">${escapeHtml(lesson.text)}</button></li>`
          )
          .join("")}</ul>` +
        `</article>`,
      actions: "",
    };
  }

  function inspectorContent(node) {
    if (node.type === "core") {
      return {
        title: "数字大脑",
        kicker: meta(["SECOND BRAIN", `${graph.themes().length} 个主题`]),
        body: paragraph(
          "这里是全部主题的汇聚点。点任意一个主题脑进入它的问题，再沿主线查看每一步的记录与来源。"
        ),
        actions: "",
      };
    }
    if (node.type === "theme") {
      const ideas = graph.ideas(node.themeId);
      return {
        title: node.label,
        kicker: meta([node.code, node.latin, node.latest ? `最近 ${node.latest}` : ""]),
        body:
          paragraph(node.description || "") +
          `<ul class="popover-list">${ideas
            .map(
              (idea) =>
                `<li><button type="button" class="popover-link" data-action="open-idea" data-value="${
                  node.themeId
                }/${idea.ideaId}"><span>${escapeHtml(idea.label)}</span><small>${escapeHtml(
                  `${idea.stepCount} 步 · ${idea.status || ""}`
                )}</small></button></li>`
            )
            .join("")}</ul>`,
        actions: "",
      };
    }
    if (node.type === "idea") {
      return {
        title: node.label,
        kicker: meta(["问题", node.status, node.updated]),
        body:
          paragraph(node.summary || "") +
          paragraph(`主线共 ${node.stepCount} 步，沿箭头方向从起点走到当前理解。`, "popover-hint"),
        actions: "",
      };
    }
    if (node.type === "conclusion") {
      const pending = node.unconfirmed?.length
        ? paragraph(
            `以下步骤的承接关系由整理得出，仍待确认：${node.unconfirmed.join("、")}。`,
            "popover-hint popover-hint--pending"
          )
        : paragraph("主线上的每一步都有记录支持。", "popover-hint");
      return {
        title: "阶段理解",
        kicker: meta([node.status]),
        body:
          paragraph(node.summary || "") +
          `<h3 class="popover-sub">依据</h3><ol class="popover-evidence">${node.evidence
            .map(
              (e) =>
                `<li><span>${escapeHtml(e.title)}</span><small>${escapeHtml(e.date || "")}${
                  e.connection === "inferred" ? " · 关联待确认" : ""
                }</small></li>`
            )
            .join("")}</ol>` +
          pending,
        actions: "",
      };
    }
    if (node.type === "source") {
      return {
        title: node.label,
        kicker: meta([originLabel(node.origin), node.kind, node.date]),
        body:
          (node.quote ? `<blockquote class="popover-quote">${escapeHtml(node.quote)}</blockquote>` : "") +
          `<div class="popover-raw">${escapeHtml(node.text || "")}</div>` +
          paragraph(node.resolved ? "以上为本地记录中的原文。" : "本地缺少这条原文。", "popover-hint"),
        actions: `<button type="button" class="popover-btn" data-action="back-to-step">返回节点说明</button>`,
      };
    }

    const sources = graph.sources(node.id);
    const expanded = state.expanded.has(node.id);
    const inferredNote =
      node.connection === "inferred"
        ? paragraph("与上一步之间是整理出的关联，时间先后不等于因果，关联待确认。", "popover-hint popover-hint--pending")
        : "";
    return {
      title: node.label,
      kicker: meta([`步骤 ${String(node.index).padStart(2, "0")}/${node.total}`, node.kind, node.date]),
      body:
        paragraph(node.body || "") +
        inferredNote +
        (sources.length
          ? `<h3 class="popover-sub">来源 ${sources.length}</h3><ul class="popover-list">${sources
              .map(
                (source) =>
                  `<li><button type="button" class="popover-link" data-action="open-source" data-value="${escapeHtml(
                    source.refId
                  )}"><span>${escapeHtml(source.quote || source.label)}</span><small>${escapeHtml(
                    `${originLabel(source.origin)} · ${source.date || ""}`
                  )}</small></button></li>`
              )
              .join("")}</ul>`
          : paragraph("这一步没有引用记录。", "popover-hint")),
      actions: sources.length
        ? `<button type="button" class="popover-btn" data-action="${
            expanded ? "collapse-sources" : "expand-sources"
          }">${expanded ? "收起来源节点" : `在画布展开来源 (${sources.length})`}</button>`
        : "",
    };
  }

  // ------------------------------------------------------------------ gestures

  const pointers = new Map();
  let panning = null;
  let pinch = null;

  el.stage.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".node")) return;
    pauseReplay();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      panning = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: 0 };
      try {
        el.stage.setPointerCapture(event.pointerId);
      } catch {
        /* synthetic pointers have nothing to capture */
      }
    } else if (pointers.size === 2) {
      panning = null;
      pinch = pinchState();
    }
  });

  el.stage.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch && pointers.size >= 2) {
      const next = pinchState();
      if (next.dist > 0 && pinch.dist > 0) {
        camera.zoomBy(next.dist / pinch.dist, next.center);
        camera.panBy(next.center.x - pinch.center.x, next.center.y - pinch.center.y);
      }
      pinch = next;
      return;
    }
    if (panning && panning.id === event.pointerId) {
      const dx = event.clientX - panning.x;
      const dy = event.clientY - panning.y;
      panning.moved += Math.abs(dx) + Math.abs(dy);
      panning.x = event.clientX;
      panning.y = event.clientY;
      camera.panBy(dx, dy);
    }
  });

  const releasePointer = (event) => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
    if (panning && panning.id === event.pointerId) {
      if (panning.moved < 6) {
        popover.close();
      }
      panning = null;
    }
  };
  el.stage.addEventListener("pointerup", releasePointer);
  el.stage.addEventListener("pointercancel", releasePointer);

  function pinchState() {
    const [a, b] = [...pointers.values()];
    return {
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  }

  el.stage.addEventListener(
    "wheel",
    (event) => {
      if (event.target.closest(".popover")) return;
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0016));
      camera.zoomBy(factor, { x: event.clientX, y: event.clientY });
    },
    { passive: false }
  );

  el.zoomIn.addEventListener("click", () => camera.zoomBy(1.22));
  el.zoomOut.addEventListener("click", () => camera.zoomBy(1 / 1.22));
  el.zoomReset.addEventListener("click", () => {
    camera.reset();
    fitCamera();
  });

  el.back.addEventListener("click", () => navigate(backOneLevel(state.route)));
  el.breadcrumb.addEventListener("click", (event) => {
    const crumb = event.target.closest(".crumb");
    if (!crumb) return;
    location.hash = crumb.dataset.hash;
  });

  el.motion.addEventListener("click", () => applyMotion(!state.motion));

  // 模式卡里点一条经验，换成那条经验的断语卡。
  el.popover.addEventListener("click", (event) => {
    const member = event.target.closest("[data-star]");
    if (member) openLesson(member.dataset.star);
  });

  el.popover.addEventListener("pointerdown", pauseReplay);
  el.popover.addEventListener("keydown", pauseReplay);
  el.stars.addEventListener("pointerdown", pauseReplay);
  el.stars.addEventListener("keydown", pauseReplay);
  motionPreference.addEventListener("change", () => {
    replay.setMotion(state.motion && !motionPreference.matches);
    if (motionPreference.matches) applyMotion(false);
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && replay.playing) {
      event.preventDefault();
      event.stopImmediatePropagation();
      pauseReplay();
    }
  }, true);

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (popover.isOpen) return popover.close();
      if (state.route.level !== "overview") navigate(backOneLevel(state.route));
      return;
    }
    if (event.target.closest("input, textarea")) return;
    if (event.key === "+" || event.key === "=") camera.zoomBy(1.2);
    if (event.key === "-" || event.key === "_") camera.zoomBy(1 / 1.2);
    if (event.key === "0") {
      camera.reset();
      fitCamera();
    }
  });

  window.addEventListener("hashchange", () => {
    applyRoute(normalizeRoute(parseHash(location.hash), graph));
  });

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    measureInsets();
    background.resize();
    if (!state.motion && !document.hidden) background.frame(0, camera.current, false);
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => render({ refit: !camera.userAdjusted }), 60);
  });

  function measureInsets() {
    document.documentElement.style.setProperty("--inset-top", `${el.topBar.offsetHeight}px`);
    document.documentElement.style.setProperty("--inset-bottom", `${el.bottomBar.offsetHeight + (replay.steps.length ? 24 : 0)}px`);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseReplay();
    if (!document.hidden && !state.motion) background.frame(0, camera.current, false);
  });

  function applyMotion(on, { silent = false } = {}) {
    const wasOn = state.motion;
    state.motion = on;
    replay.setMotion(on && !motionPreference.matches);
    if (!on) scene.clearFlashes();
    el.app.dataset.motion = on ? "on" : "off";
    el.motion.setAttribute("aria-pressed", on ? "false" : "true");
    el.motion.textContent = on ? "动效 开" : "动效 关";
    camera.setInstant(!on);
    scene.setInstant(!on);
    if (!on) camera.snap();
    if (!silent) render();
    if (wasOn && !on && !document.hidden) background.frame(0, camera.current, false);
  }

  // ---------------------------------------------------------------- main loop

  background.resize();
  if (!state.motion && !document.hidden) background.frame(0, camera.current, false);
  let last = performance.now();
  function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (state.motion && !document.hidden) background.frame(dt, camera.current, true);
    scene.frame(dt);
    if (pendingActivation && !scene.isCollapsing()) {
      const { nodeId, element } = pendingActivation;
      pendingActivation = null;
      activateNode(nodeId, element?.isConnected ? element : scene.nodeElement(nodeId));
    }
    stars.frame();
    syncPopoverAnchor();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  function syncPopoverAnchor() {
    if (!popover.isOpen || !state.popover) {
      scene.setConnector(null);
      return;
    }
    // 断语卡和模式卡挂在星点上，不需要连回链条节点的那条虚线。
    const starId = state.popover.lessonId || state.popover.patternId || null;
    if (starId) {
      scene.setConnector(null);
      const anchor = stars.anchorOf(starId);
      if (anchor) popover.reposition(anchor);
      return;
    }
    const anchor = anchorOf(state.popover.nodeId);
    if (!anchor) return;
    popover.reposition(anchor);
    const rect = popover.rect;
    const attach = {
      x: Math.min(Math.max(anchor.x, rect.left + 6), rect.right - 6),
      y: Math.min(Math.max(anchor.y, rect.top + 6), rect.bottom - 6),
    };
    const dx = attach.x - anchor.x;
    const dy = attach.y - anchor.y;
    const d = Math.hypot(dx, dy) || 1;
    scene.setConnector({
      from: { x: anchor.x + (dx / d) * (anchor.r + 4), y: anchor.y + (dy / d) * (anchor.r + 4) },
      to: attach,
    });
  }

  if (state.route.level !== "overview") applyRoute(state.route, { force: true });
}

function normalizeRoute(route, graph) {
  if (route.level === "overview") return route;
  if (!graph.theme(route.themeId)) return { level: "overview" };
  if (route.level === "theme") return route;
  if (!graph.idea(route.themeId, route.ideaId)) return { level: "theme", themeId: route.themeId };
  if (route.level === "idea") return route;
  const step = graph.step(route.themeId, route.ideaId, route.stepId);
  if (!step) return { level: "idea", themeId: route.themeId, ideaId: route.ideaId };
  return route;
}

function meta(parts) {
  return parts
    .filter(Boolean)
    .map((p) => `<span>${escapeHtml(p)}</span>`)
    .join('<i aria-hidden="true">·</i>');
}

function paragraph(text, className = "popover-text") {
  if (!text) return "";
  return `<p class="${className}">${escapeHtml(text)}</p>`;
}

/**
 * 核心结论本身是不是推想。
 * lessons.js 只有一个 hasInference，标的是整条经验里有没有推想成分，40 条全是真，
 * 分不出「结论是推想」和「只是某处带了推想」。这里只认原文里把推想说破的收尾：
 * 写明原文没说、原文没写，或明确先不当真。其余一律不标。
 * @param {string} text
 */
function inferenceInConclusion(text) {
  return /原文没说|原文没写|先只当/.test(text);
}

function originLabel(origin) {
  if (origin === "flomo") return "flomo 记录";
  if (origin === "conversation") return "产品讨论";
  if (origin === "sample") return "示例数据";
  if (origin === "missing") return "来源缺失";
  return origin || "";
}

function shorten(text, max) {
  const value = String(text || "");
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
