/**
 * The node popover: a thin inspector attached to the selected node.
 * Nodes in the upper half of the canvas open it upwards; nodes in the lower
 * half open it downwards. Its height follows the content and is capped at the
 * usable canvas height (viewport minus the bars and margins); only past that
 * cap does the body scroll, with the header and actions staying in place. It
 * can be dragged by its header, and it never pans, zooms or scrolls anything
 * behind it.
 */

const MARGIN = 10;
const NODE_GAP = 16;
const MIN_BODY_HEIGHT = 16;
/** 叠放阅读：前一张浮框缩成的窄卡最多保留几张。 */
const STACK_LIMIT = 3;

export function createPopover({ el, onClose, onAction, onBack }) {
  const titleEl = el.querySelector("#popover-title");
  const kickerEl = el.querySelector("#popover-kicker");
  const bodyEl = el.querySelector("#popover-body");
  const actionsEl = el.querySelector("#popover-actions");
  const handle = el.querySelector("#popover-handle");
  const closeBtn = el.querySelector("#popover-close");

  let open = false;
  let direction = "down";
  let manual = null;
  let placed = { x: 0, y: 0 };
  let naturalHeight = 0;
  let measuredWidth = 0;
  let returnFocusTo = null;
  let drag = null;
  /** 当前面板是不是断语卡/模式卡（.verdict）；断语卡按内容自适应高度。 */
  let verdictCard = false;
  /** 叠放阅读：被压成窄卡的前序浮框，从旧到新，最多 STACK_LIMIT 张。 */
  const stack = [];

  closeBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    close();
  });

  el.addEventListener("pointerdown", (event) => event.stopPropagation());
  el.addEventListener("click", (event) => event.stopPropagation());
  el.addEventListener("wheel", (event) => event.stopPropagation(), { passive: true });
  el.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      if (stack.length) {
        onBack?.();
        return;
      }
      close();
    }
  });

  // 窄卡在浮框左侧的叠放栏里，点击其中一张即回退到那一层。
  const rail = document.createElement("div");
  rail.className = "popover-stack";
  rail.hidden = true;
  el.parentElement?.insertBefore(rail, el);
  rail.addEventListener("click", (event) => {
    const card = event.target.closest("[data-stack-index]");
    if (!card) return;
    event.stopPropagation();
    onBack?.(Number(card.dataset.stackIndex));
  });

  actionsEl.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-action]");
    if (!btn) return;
    event.stopPropagation();
    onAction?.(btn.dataset.action, btn.dataset.value);
  });
  bodyEl.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-action]");
    if (!btn) return;
    event.stopPropagation();
    onAction?.(btn.dataset.action, btn.dataset.value);
  });

  handle.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".popover-close")) return;
    drag = {
      pointerId: event.pointerId,
      dx: event.clientX - placed.x,
      dy: event.clientY - placed.y,
    };
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      /* synthetic pointers have nothing to capture */
    }
    el.classList.add("is-dragging");
    event.preventDefault();
  });

  handle.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    manual = clampToViewport({ x: event.clientX - drag.dx, y: event.clientY - drag.dy });
    applyPosition(manual);
  });

  const endDrag = (event) => {
    if (!drag || (event && drag.pointerId !== event.pointerId)) return;
    drag = null;
    el.classList.remove("is-dragging");
  };
  handle.addEventListener("pointerup", endDrag);
  handle.addEventListener("pointercancel", endDrag);

  function clampToViewport(pos, size = currentSize()) {
    const bounds = bodyBounds();
    return {
      x: Math.min(Math.max(pos.x, bounds.left), Math.max(bounds.left, bounds.right - size.width)),
      y: Math.min(Math.max(pos.y, bounds.top), Math.max(bounds.top, bounds.bottom - size.height)),
    };
  }

  function bodyBounds() {
    const style = getComputedStyle(document.documentElement);
    const top = parseFloat(style.getPropertyValue("--inset-top")) || 56;
    const bottom = parseFloat(style.getPropertyValue("--inset-bottom")) || 52;
    return {
      left: MARGIN,
      top: top + MARGIN,
      right: window.innerWidth - MARGIN,
      bottom: window.innerHeight - bottom - MARGIN,
    };
  }

  function applyPosition(pos) {
    placed = pos;
    el.style.transform = `translate3d(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px, 0)`;
    placeStack();
  }

  /** 窄卡贴在当前浮框左侧，高度跟浮框走，不单独占一条轨道。 */
  function placeStack() {
    if (!stack.length) return;
    const rect = el.getBoundingClientRect();
    rail.style.setProperty("--stack-top", `${rect.top.toFixed(1)}px`);
    rail.style.setProperty("--stack-left", `${Math.max(MARGIN, rect.left - rail.offsetWidth - 6).toFixed(1)}px`);
    rail.style.setProperty("--stack-height", `${rect.height.toFixed(1)}px`);
  }

  /**
   * @param {{ title: string, kicker?: string, body: string, actions?: string, anchor: {x:number,y:number,r:number}, viaKeyboard?: boolean, returnFocus?: HTMLElement|null, keepPosition?: boolean, stack?: boolean }} options
   */
  function show(options) {
    const wasOpen = open;
    // 叠放阅读：从当前浮框再进一层时，先把当前内容压成左侧窄卡。
    if (options.stack && wasOpen) pushStack();
    titleEl.textContent = options.title;
    kickerEl.innerHTML = options.kicker || "";
    kickerEl.hidden = !options.kicker;
    bodyEl.innerHTML = options.body;
    actionsEl.innerHTML = options.actions || "";
    actionsEl.hidden = !options.actions;
    el.hidden = false;
    open = true;
    returnFocusTo = options.returnFocus ?? returnFocusTo;
    if (!options.keepPosition) {
      manual = null;
      bodyEl.scrollTop = 0;
    }
    naturalHeight = measureNaturalHeight();
    measuredWidth = window.innerWidth;
    verdictCard = el.querySelector(".verdict") !== null;
    if (!options.keepPosition) direction = chooseDirection(options.anchor);
    reposition(options.anchor);
    el.classList.toggle("is-open", true);
    if (!wasOpen) {
      el.classList.remove("is-open");
      requestAnimationFrame(() => el.classList.add("is-open"));
    }
    if (options.viaKeyboard) el.focus({ preventScroll: true });
  }

  /** 把当前浮框的内容压进叠放栏，最旧的一张超出上限时丢掉。 */
  function pushStack() {
    stack.push({
      title: titleEl.textContent,
      kicker: kickerEl.innerHTML,
      kickerHidden: kickerEl.hidden,
      body: bodyEl.innerHTML,
      actions: actionsEl.innerHTML,
      actionsHidden: actionsEl.hidden,
    });
    if (stack.length > STACK_LIMIT) stack.shift();
    renderStack();
  }

  /** 回退到某一张窄卡：它成为当前浮框，比它新的窄卡一并丢弃。 */
  function restoreStack(index) {
    const entry = stack[index];
    if (!entry) return false;
    stack.splice(index);
    renderStack();
    titleEl.textContent = entry.title;
    kickerEl.innerHTML = entry.kicker;
    kickerEl.hidden = entry.kickerHidden;
    bodyEl.innerHTML = entry.body;
    bodyEl.scrollTop = 0;
    actionsEl.innerHTML = entry.actions;
    actionsEl.hidden = entry.actionsHidden;
    naturalHeight = measureNaturalHeight();
    verdictCard = el.querySelector(".verdict") !== null;
    return true;
  }

  function renderStack() {
    rail.replaceChildren(
      ...stack.map((entry, index) => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "popover-stack-card";
        card.dataset.stackIndex = String(index);
        card.setAttribute("aria-label", `返回「${entry.title}」`);
        const label = document.createElement("span");
        label.className = "popover-stack-title";
        label.textContent = entry.title;
        card.append(label);
        return card;
      })
    );
    rail.hidden = stack.length === 0;
  }

  function clearStack() {
    if (!stack.length) return;
    stack.length = 0;
    renderStack();
  }

  /** Measure the panel without a viewport cap, so the open direction can be chosen. */
  function measureNaturalHeight() {
    const previous = el.style.maxHeight;
    el.style.maxHeight = "none";
    const height = el.getBoundingClientRect().height;
    el.style.maxHeight = previous;
    return height;
  }

  function spaceFor(dir, anchor, bounds) {
    const gap = anchor.r + NODE_GAP;
    return dir === "up"
      ? anchor.y - gap - bounds.top
      : bounds.bottom - (anchor.y + gap);
  }

  /**
   * The panel needs room for its header and whatever secondary rows are
   * currently rendered, plus a line or two of body. Estimate that from the
   * real state instead of using one fixed threshold for every popover.
   */
  function minimumUsableHeight() {
    const chrome = 40 + (kickerEl.hidden ? 0 : 20) + (actionsEl.hidden ? 0 : 46);
    return chrome + MIN_BODY_HEIGHT;
  }

  /**
   * Upper-half nodes open upwards and lower-half nodes downwards. When that
   * side cannot hold even the panel chrome, fall back to the roomier side so
   * the panel is never clipped by a viewport edge.
   *
   * 断语卡不连链条，优先放到能完整容纳它的一侧；两侧都放不下时选空间大的一侧，
   * 再由 reposition 把卡片收回画布内。
   * @param {{x:number,y:number,r:number}} anchor
   */
  function chooseDirection(anchor) {
    if (!anchor) return direction;
    const bounds = bodyBounds();
    if (verdictCard) {
      const up = spaceFor("up", anchor, bounds);
      const down = spaceFor("down", anchor, bounds);
      if (up >= naturalHeight) return "up";
      if (down >= naturalHeight) return "down";
      return up >= down ? "up" : "down";
    }
    const mid = (bounds.top + bounds.bottom) / 2;
    let preferred = anchor.y <= mid ? "up" : "down";
    const other = preferred === "up" ? "down" : "up";
    const minimum = minimumUsableHeight();
    const needed = naturalHeight ? Math.min(naturalHeight, minimum) : minimum;
    if (
      spaceFor(preferred, anchor, bounds) < needed &&
      spaceFor(other, anchor, bounds) > spaceFor(preferred, anchor, bounds)
    ) {
      preferred = other;
    }
    return preferred;
  }

  function currentSize() {
    const rect = el.getBoundingClientRect();
    return { width: rect.width || 320, height: rect.height || 260 };
  }

  /** @param {{x:number,y:number,r:number}|null} anchor */
  function reposition(anchor) {
    if (!open) return;
    if (manual) return applyPosition(clampToViewport(manual));
    if (!anchor) return;

    // Width changes rebuild the text, so the natural height must be remeasured.
    if (window.innerWidth !== measuredWidth) {
      naturalHeight = measureNaturalHeight();
      measuredWidth = window.innerWidth;
    }

    const bounds = bodyBounds();
    const size = currentSize();
    const x = Math.min(
      Math.max(anchor.x - size.width / 2, bounds.left),
      Math.max(bounds.left, bounds.right - size.width)
    );

    const gap = anchor.r + NODE_GAP;

    // 高度随内容走：上限是画布可用高度（视口减上下栏和边距），装得下就完整显示，
    // 装不下才限高到可用空间，由 .popover-body 自己滚动，头部和按钮固定。页面本身不滚。
    const available = Math.max(1, Math.floor(bounds.bottom - bounds.top));
    if (el.style.maxHeight !== `${available}px`) el.style.maxHeight = `${available}px`;
    // Read the settled height so late font swaps or wrapping changes cannot
    // push the panel outside the canvas.
    const height = Math.min(el.getBoundingClientRect().height || naturalHeight, available);
    const y = direction === "up" ? anchor.y - gap - height : anchor.y + gap;
    applyPosition({
      x,
      y: Math.max(bounds.top, Math.min(y, bounds.bottom - height)),
    });
  }

  function close() {
    if (!open) return;
    open = false;
    manual = null;
    verdictCard = false;
    clearStack();
    el.classList.remove("is-open");
    el.hidden = true;
    const target = returnFocusTo;
    returnFocusTo = null;
    onClose?.();
    if (target && document.contains(target)) target.focus({ preventScroll: true });
  }

  return {
    show,
    reposition,
    close,
    restoreStack,
    clearStack,
    get stackDepth() {
      return stack.length;
    },
    get isOpen() {
      return open;
    },
    get rect() {
      return el.getBoundingClientRect();
    },
    get element() {
      return el;
    },
    setReturnFocus(node) {
      returnFocusTo = node;
    },
  };
}
