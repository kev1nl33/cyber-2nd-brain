/**
 * The node popover: a thin inspector attached to the selected node.
 * Nodes in the upper half of the canvas open it upwards; nodes in the lower
 * half open it downwards. Its height is capped by the room between the node
 * and the viewport edge, and the body scrolls once the content outgrows that
 * room. It can be dragged by its header, and it never pans, zooms or scrolls
 * anything behind it.
 */

const MARGIN = 10;
const NODE_GAP = 16;
const MIN_BODY_HEIGHT = 16;

export function createPopover({ el, onClose, onAction }) {
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
      close();
    }
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
  }

  /**
   * @param {{ title: string, kicker?: string, body: string, actions?: string, anchor: {x:number,y:number,r:number}, viaKeyboard?: boolean, returnFocus?: HTMLElement|null, keepPosition?: boolean }} options
   */
  function show(options) {
    const wasOpen = open;
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

    // 断语卡（含主星模式卡）高度随内容走：只要装得下画布可用空间就完整显示，
    // 装不下才把面板限高到可用空间，由 .popover-body 自己滚动。页面本身不滚。
    if (verdictCard) {
      const available = Math.max(1, Math.floor(bounds.bottom - bounds.top));
      if (el.style.maxHeight !== `${available}px`) el.style.maxHeight = `${available}px`;
      const height = Math.min(el.getBoundingClientRect().height || naturalHeight, available);
      const y = direction === "up" ? anchor.y - gap - height : anchor.y + gap;
      applyPosition({
        x,
        y: Math.max(bounds.top, Math.min(y, bounds.bottom - height)),
      });
      return;
    }

    // 链条弹窗维持原逻辑：只用锚点朝向那一侧的余量，超出就滚动。
    const room = Math.max(0, spaceFor(direction, anchor, bounds));
    const maxHeight = Math.max(1, Math.floor(room));
    if (el.style.maxHeight !== `${maxHeight}px`) el.style.maxHeight = `${maxHeight}px`;
    // Read the settled height so late font swaps or wrapping changes cannot
    // push the panel into the node it belongs to.
    const height = Math.min(el.getBoundingClientRect().height || naturalHeight, maxHeight);
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
