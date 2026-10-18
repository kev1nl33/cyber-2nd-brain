/**
 * The node popover: a thin inspector that sits next to the selected node.
 * It can be dragged by its header and scrolled inside, and it never pans,
 * zooms or scrolls anything behind it.
 */

const MARGIN = 10;

export function createPopover({ el, onClose, onAction }) {
  const titleEl = el.querySelector("#popover-title");
  const kickerEl = el.querySelector("#popover-kicker");
  const bodyEl = el.querySelector("#popover-body");
  const actionsEl = el.querySelector("#popover-actions");
  const handle = el.querySelector("#popover-handle");
  const closeBtn = el.querySelector("#popover-close");

  let open = false;
  let side = 0;
  let manual = null;
  let placed = { x: 0, y: 0 };
  let returnFocusTo = null;
  let drag = null;

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
   * @param {{ title: string, kicker?: string, body: string, actions?: string, anchor: {x:number,y:number,r:number}, avoid?: {x:number,y:number}[], viaKeyboard?: boolean, returnFocus?: HTMLElement|null, keepPosition?: boolean }} options
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
      side = chooseSide(options.anchor, options.avoid || []);
    }
    reposition(options.anchor, true);
    el.classList.toggle("is-open", true);
    if (!wasOpen) {
      el.classList.remove("is-open");
      requestAnimationFrame(() => el.classList.add("is-open"));
    }
    if (options.viaKeyboard) el.focus({ preventScroll: true });
  }

  /** Candidate offsets around the node: right, left, below, above. */
  function candidateFor(index, anchor, size) {
    const gap = anchor.r + 18;
    if (index === 0) return { x: anchor.x + gap, y: anchor.y - size.height * 0.3 };
    if (index === 1) return { x: anchor.x - gap - size.width, y: anchor.y - size.height * 0.3 };
    if (index === 2) return { x: anchor.x - size.width * 0.35, y: anchor.y + gap };
    return { x: anchor.x - size.width * 0.35, y: anchor.y - gap - size.height };
  }

  /**
   * Pick the side that hides the fewest other nodes and needs the least
   * nudging to stay on screen.
   * @param {{x:number,y:number,r:number}} anchor
   * @param {{x:number,y:number}[]} avoid
   */
  function chooseSide(anchor, avoid) {
    const size = currentSize();
    // Small windows have no room beside a node: dock below and keep the graph
    // visible above the panel.
    if (window.innerWidth < 560 || window.innerHeight < 620) return 2;
    let best = 0;
    let bestScore = Infinity;
    for (let i = 0; i < 4; i++) {
      const raw = candidateFor(i, anchor, size);
      const fitted = clampToViewport(raw, size);
      const covered = avoid.filter(
        (p) =>
          p.x > fitted.x - 6 &&
          p.x < fitted.x + size.width + 6 &&
          p.y > fitted.y - 6 &&
          p.y < fitted.y + size.height + 6
      ).length;
      const nudged = Math.hypot(fitted.x - raw.x, fitted.y - raw.y);
      const hidesNode =
        anchor.x > fitted.x - anchor.r &&
        anchor.x < fitted.x + size.width + anchor.r &&
        anchor.y > fitted.y - anchor.r &&
        anchor.y < fitted.y + size.height + anchor.r;
      const score = covered * 12 + nudged / 36 + (hidesNode ? 30 : 0) + i * 0.2;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  }

  function currentSize() {
    const rect = el.getBoundingClientRect();
    return { width: rect.width || 320, height: rect.height || 260 };
  }

  /** @param {{x:number,y:number,r:number}|null} anchor */
  function reposition(anchor, force = false) {
    if (!open || !anchor) return;
    if (manual && !force) return applyPosition(clampToViewport(manual));
    if (manual) return applyPosition(clampToViewport(manual));
    const size = currentSize();
    applyPosition(clampToViewport(candidateFor(side, anchor, size), size));
  }

  function close() {
    if (!open) return;
    open = false;
    manual = null;
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
