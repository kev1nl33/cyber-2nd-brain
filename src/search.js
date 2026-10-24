/**
 * Local, in-memory search over the graph. No network, no dependency and no
 * camera access: opening or closing the panel must never move the canvas.
 *
 * Pure helpers (`buildSearchIndex`, `matchSearch`) are exported for the
 * zero-dependency tests; `createSearchController` owns the overlay, keyboard
 * priority and focus return so the rest of the app only wires navigation.
 */

export const SEARCH_MAX_RESULTS = 8;
export const SEARCH_SNIPPET_RADIUS = 12;

/** Lower rank wins. Ideas lead, then steps, sources, and themes last. */
const TYPE_RANK = { idea: 0, step: 1, source: 2, theme: 3 };

const ICONS = { idea: "◇", step: "→", source: "▤", theme: "◉" };

/**
 * One searchable entry per graph object. Source entries index the title only;
 * the full source text is deliberately never searched or shown.
 *
 * @param {any} graph
 * @returns {{ id:string, type:string, title:string, extra:string, path:string, route:any, order:number }[]}
 */
export function buildSearchIndex(graph) {
  const index = [];
  const add = (node, title, extra, path, route) => {
    index.push({
      id: node.id,
      type: node.type,
      title: String(title || ""),
      extra: String(extra || ""),
      path,
      route,
      order: index.length,
    });
  };

  for (const theme of graph.themes()) {
    add(
      theme,
      theme.label,
      "",
      "主题",
      { level: "theme", themeId: theme.themeId }
    );
    for (const idea of graph.ideas(theme.themeId)) {
      add(
        idea,
        idea.label,
        idea.summary || "",
        theme.label,
        { level: "idea", themeId: theme.themeId, ideaId: idea.ideaId }
      );
      for (const step of graph.steps(theme.themeId, idea.ideaId)) {
        add(
          step,
          step.label,
          step.body || "",
          `${theme.label} / ${idea.label}`,
          {
            level: "step",
            themeId: theme.themeId,
            ideaId: idea.ideaId,
            stepId: step.stepId,
          }
        );
        for (const source of graph.sources(step.id)) {
          add(
            source,
            source.label,
            "",
            `${theme.label} / ${idea.label}`,
            {
              level: "step",
              themeId: theme.themeId,
              ideaId: idea.ideaId,
              stepId: step.stepId,
              sourceId: source.refId,
            }
          );
        }
      }
    }
  }

  return index;
}

/**
 * Case-insensitive substring match over title and the secondary field.
 * Chinese is matched character by character; no tokenisation or pinyin.
 *
 * @param {{type:string,title:string,extra:string,order:number}[]} index
 * @param {string} query
 * @param {{ limit?: number }} [options]
 */
export function matchSearch(index, query, { limit = SEARCH_MAX_RESULTS } = {}) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return [];
  const hits = [];
  for (const entry of index) {
    const title = entry.title || "";
    const extra = entry.extra || "";
    const titleAt = title.toLowerCase().indexOf(needle);
    const extraAt = extra.toLowerCase().indexOf(needle);
    if (titleAt < 0 && extraAt < 0) continue;
    hits.push({
      ...entry,
      icon: ICONS[entry.type] || "·",
      // A title hit needs no snippet: the title itself is the displayed result.
      snippet: extraAt >= 0 ? snippetAround(extra, extraAt, needle.length) : snippetAround(title, titleAt, needle.length),
      match: titleAt >= 0 ? "title" : "extra",
    });
  }
  hits.sort((a, b) => (TYPE_RANK[a.type] ?? 9) - (TYPE_RANK[b.type] ?? 9) || a.order - b.order);
  return hits.slice(0, Math.max(0, limit));
}

/**
 * At most 12 characters either side of the hit. Never returns the whole text,
 * so a long step body or source title cannot leak through the result list.
 *
 * @param {string} text
 * @param {number} at UTF-16 index of the match
 * @param {number} [length]
 */
export function snippetAround(text, at, length = 1) {
  const value = String(text || "");
  if (!value || at < 0) return "";
  const radius = SEARCH_SNIPPET_RADIUS;
  const start = Math.max(0, at - radius);
  const end = Math.min(value.length, at + Math.max(1, length) + radius);
  return `${start > 0 ? "…" : ""}${value.slice(start, end).trim()}${end < value.length ? "…" : ""}`;
}

/**
 * Mirror the graph into a compact result list. The controller keeps the graph
 * index immutable for the page lifetime, so opening search is allocation-free
 * except for the query results.
 *
 * @param {{
 *   graph: any,
 *   document?: Document,
 *   window?: Window,
 *   root?: HTMLElement,
 *   onNavigate?: (route:any) => void,
 *   onOpen?: () => void,
 *   onClose?: () => void,
 *   isBlocked?: () => boolean
 * }} options
 */
export function createSearchController({
  graph,
  document: doc = globalThis.document,
  window: win = globalThis.window,
  root = doc?.body,
  onNavigate,
  onOpen,
  onClose,
  isBlocked,
} = {}) {
  const index = buildSearchIndex(graph);
  const layer = doc.createElement("div");
  layer.className = "search-layer";
  layer.hidden = true;

  const panel = doc.createElement("div");
  panel.className = "search-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "搜索");
  layer.appendChild(panel);

  const field = doc.createElement("div");
  field.className = "search-field";
  panel.appendChild(field);

  const icon = doc.createElement("span");
  icon.className = "search-field-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "⌕";
  field.appendChild(icon);

  const input = doc.createElement("input");
  input.type = "search";
  input.className = "search-input";
  input.id = "search-input";
  input.placeholder = "搜索主题、问题、步骤或来源";
  input.setAttribute("aria-label", "搜索");
  input.setAttribute("aria-controls", "search-results");
  input.setAttribute("aria-autocomplete", "list");
  field.appendChild(input);

  const hint = doc.createElement("kbd");
  hint.className = "search-esc";
  hint.setAttribute("aria-hidden", "true");
  hint.textContent = "Esc";
  field.appendChild(hint);

  const resultsEl = doc.createElement("ul");
  resultsEl.className = "search-results";
  resultsEl.id = "search-results";
  resultsEl.setAttribute("role", "listbox");
  resultsEl.setAttribute("aria-label", "搜索结果");
  panel.appendChild(resultsEl);

  const emptyEl = doc.createElement("p");
  emptyEl.className = "search-empty";
  panel.appendChild(emptyEl);

  const footer = doc.createElement("p");
  footer.className = "search-foot";
  footer.textContent = "↑↓ 选择 · ↵ 打开 · Esc 关闭";
  panel.appendChild(footer);

  if (root) root.appendChild(layer);

  let openState = false;
  let savedFocus = null;
  let resultEls = [];
  let results = [];
  let activeIndex = -1;

  function isOpen() {
    return openState;
  }

  function open() {
    if (openState || isBlocked?.()) return false;
    openState = true;
    savedFocus = doc.activeElement && doc.activeElement !== doc.body ? doc.activeElement : null;
    input.value = "";
    results = [];
    activeIndex = -1;
    render();
    layer.hidden = false;
    try {
      input.focus({ preventScroll: true });
      input.select?.();
    } catch {
      /* focus can fail while the panel is still entering; harmless */
    }
    onOpen?.();
    return true;
  }

  /**
   * @param {{ restoreFocus?: boolean }} [options]
   */
  function close({ restoreFocus = true } = {}) {
    if (!openState) return;
    openState = false;
    layer.hidden = true;
    input.value = "";
    results = [];
    activeIndex = -1;
    clearResults();
    const target = savedFocus;
    savedFocus = null;
    if (restoreFocus && target && doc.contains?.(target)) {
      try {
        target.focus({ preventScroll: true });
      } catch {
        /* the original element may have been removed by navigation */
      }
    } else if (doc.activeElement === input) {
      // Navigation takes the next focus. Leaving it on the now-hidden input
      // would swallow the canvas keyboard shortcuts.
      try {
        doc.body?.focus?.({ preventScroll: true });
      } catch {
        /* body focus is best-effort */
      }
    }
    onClose?.();
  }

  function choose(result) {
    if (!result) return;
    close({ restoreFocus: false });
    onNavigate?.(result.route);
  }

  function render() {
    const query = input.value;
    results = matchSearch(index, query);
    activeIndex = results.length ? 0 : -1;
    renderResults();
  }

  function renderResults() {
    clearResults();
    const query = input.value.trim();
    emptyEl.textContent = query ? "没有匹配结果" : "输入关键词开始搜索";
    emptyEl.hidden = results.length > 0;
    resultEls = results.map((result, i) => {
      const li = doc.createElement("li");
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", i === 0 ? "true" : "false");
      li.className = "search-result-item";
      li.id = `search-result-${i}`;

      const button = doc.createElement("button");
      button.type = "button";
      button.className = "search-result";
      button.dataset.index = String(i);
      button.dataset.type = result.type;
      button.addEventListener("click", () => choose(result));
      li.appendChild(button);

      const iconEl = doc.createElement("span");
      iconEl.className = "search-result-icon";
      iconEl.setAttribute("aria-hidden", "true");
      iconEl.textContent = result.icon;
      button.appendChild(iconEl);

      const body = doc.createElement("span");
      body.className = "search-result-body";
      button.appendChild(body);

      const title = doc.createElement("span");
      title.className = "search-result-title";
      title.textContent = result.title;
      body.appendChild(title);

      const path = doc.createElement("span");
      path.className = "search-result-path";
      path.textContent = result.path;
      body.appendChild(path);

      if (result.snippet) {
        const snippet = doc.createElement("span");
        snippet.className = "search-result-snippet";
        snippet.textContent = result.snippet;
        body.appendChild(snippet);
      }

      resultsEl.appendChild(li);
      return button;
    });
    updateActive();
  }

  function clearResults() {
    resultsEl.innerHTML = "";
    resultEls = [];
  }

  function updateActive() {
    resultEls.forEach((el, i) => {
      el.classList.toggle("is-active", i === activeIndex);
      el.parentNode?.setAttribute("aria-selected", i === activeIndex ? "true" : "false");
    });
    if (activeIndex >= 0) input.setAttribute("aria-activedescendant", `search-result-${activeIndex}`);
    else input.removeAttribute("aria-activedescendant");
  }

  function moveActive(delta) {
    if (!results.length) return;
    activeIndex = (activeIndex + delta + results.length) % results.length;
    updateActive();
    resultEls[activeIndex]?.scrollIntoView?.({ block: "nearest" });
  }

  function isEditable(target) {
    if (!target) return false;
    const tag = String(target.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable === true;
  }

  function trapTab(event) {
    const focusables = [input, ...resultEls];
    const current = focusables.indexOf(doc.activeElement);
    if (event.shiftKey) {
      if (current <= 0) {
        event.preventDefault();
        focusables[focusables.length - 1]?.focus({ preventScroll: true });
      }
    } else if (current === focusables.length - 1) {
      event.preventDefault();
      input.focus({ preventScroll: true });
    }
  }

  function onKeydown(event) {
    if (openState) {
      if (event.key === "Escape") {
        event.preventDefault();
        // Search is a modal layer above the popover: one Esc closes only this.
        event.stopImmediatePropagation();
        close();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        event.stopImmediatePropagation();
        moveActive(event.key === "ArrowDown" ? 1 : -1);
        return;
      }
      if (event.key === "Enter" && results.length) {
        event.preventDefault();
        event.stopPropagation();
        choose(results[Math.max(0, activeIndex)]);
        return;
      }
      if (event.key === "Tab") {
        trapTab(event);
        return;
      }
      return;
    }
    if (event.repeat || event.isComposing || isEditable(event.target)) return;
    const cmdK =
      (event.metaKey || event.ctrlKey) &&
      !event.altKey &&
      !event.shiftKey &&
      (event.key === "k" || event.key === "K");
    const slash = event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey;
    if (!cmdK && !slash) return;
    event.preventDefault();
    // Registered ahead of replay/focus/popover Esc handlers, so swallow the
    // same keystroke instead of letting it also act on the layer below.
    event.stopImmediatePropagation();
    open();
  }

  input.addEventListener("input", render);
  layer.addEventListener("pointerdown", (event) => event.stopPropagation());
  layer.addEventListener("wheel", (event) => {
    event.preventDefault?.();
    event.stopPropagation();
  }, { passive: false });
  layer.addEventListener("click", (event) => {
    if (event.target === layer) close();
  });

  return {
    attach() {
      win.addEventListener("keydown", onKeydown, true);
    },
    detach() {
      win.removeEventListener?.("keydown", onKeydown, true);
    },
    open,
    close,
    isOpen,
    elements: { layer, panel, input, results: resultsEl, empty: emptyEl },
  };
}
