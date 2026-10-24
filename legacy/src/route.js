/** @typedef {{ level: 'overview'|'theme'|'idea'|'step', themeId?: string, ideaId?: string, stepId?: string, sourceId?: string, sourcesExpanded?: boolean }} RouteState */

/**
 * Parse location hash into route state.
 * #/ | #/develop | #/develop/idea | #/develop/idea/step | .../source/refId
 * @param {string} hash
 * @returns {RouteState}
 */
export function parseHash(hash) {
  const raw = (hash || "#/").replace(/^#/, "").replace(/^\/?/, "");
  const parts = raw.split("/").filter(Boolean);
  if (parts.length === 0) return { level: "overview" };

  const themeId = parts[0];
  if (parts.length === 1) return { level: "theme", themeId };

  const ideaId = parts[1];
  if (parts.length === 2) return { level: "idea", themeId, ideaId };

  const stepId = parts[2];
  if (parts.length === 3) return { level: "step", themeId, ideaId, stepId, sourcesExpanded: false };

  if (parts[3] === "source" && parts[4]) {
    return {
      level: "step",
      themeId,
      ideaId,
      stepId,
      sourceId: parts[4],
      sourcesExpanded: true,
    };
  }

  return { level: "step", themeId, ideaId, stepId, sourcesExpanded: false };
}

/**
 * @param {RouteState} state
 * @returns {string}
 */
export function buildHash(state) {
  if (!state || state.level === "overview") return "#/";
  const { themeId, ideaId, stepId, sourceId } = state;
  if (state.level === "theme") return `#/${themeId}`;
  if (state.level === "idea") return `#/${themeId}/${ideaId}`;
  if (state.level === "step" && stepId) {
    let h = `#/${themeId}/${ideaId}/${stepId}`;
    if (sourceId) h += `/source/${sourceId}`;
    return h;
  }
  return "#/";
}

/**
 * Collapse one navigation level (back button / breadcrumb).
 * @param {RouteState} state
 * @returns {RouteState}
 */
export function backOneLevel(state) {
  if (state.sourceId) {
    const next = { ...state, sourceId: undefined };
    return next;
  }
  if (state.level === "step") {
    return { level: "idea", themeId: state.themeId, ideaId: state.ideaId };
  }
  if (state.level === "idea") {
    return { level: "theme", themeId: state.themeId };
  }
  if (state.level === "theme") {
    return { level: "overview" };
  }
  return { level: "overview" };
}

/** @param {RouteState} a @param {RouteState} b */
export function routeEquals(a, b) {
  return (
    a.level === b.level &&
    a.themeId === b.themeId &&
    a.ideaId === b.ideaId &&
    a.stepId === b.stepId &&
    a.sourceId === b.sourceId
  );
}


const LEVEL_DEPTH = { overview: 0, theme: 1, idea: 2, step: 3 };
/**
 * Whether a level change dives into a view instead of backing out. Diving
 * into a theme / question — sideways jumps included — lets the new children
 * grow in; backing out to an outer level never replays the grow animation.
 * @param {RouteState} previous
 * @param {RouteState} next
 * @returns {boolean}
 */
export function divesIn(previous, next) {
  return (LEVEL_DEPTH[next.level] ?? 0) >= (LEVEL_DEPTH[previous.level] ?? 0);
}
