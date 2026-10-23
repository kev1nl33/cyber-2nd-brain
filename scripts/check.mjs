#!/usr/bin/env node
/**
 * Pure checks that need no browser: hash routes, graph integrity, source refs
 * and layout sanity. Run: node scripts/check.mjs
 */
import { backOneLevel, buildHash, parseHash } from "../src/route.js";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

let failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log("ok:", msg);
  } else {
    console.error("FAIL:", msg);
    failed++;
  }
}

// ----------------------------------------------------------------- routes

const routeCases = [
  ["#/", { level: "overview" }],
  ["#/develop", { level: "theme", themeId: "develop" }],
  ["#/develop/develop-brain", { level: "idea", themeId: "develop", ideaId: "develop-brain" }],
  [
    "#/develop/develop-brain/wish",
    { level: "step", themeId: "develop", ideaId: "develop-brain", stepId: "wish" },
  ],
  [
    "#/develop/develop-brain/wish/source/chat-intent",
    {
      level: "step",
      themeId: "develop",
      ideaId: "develop-brain",
      stepId: "wish",
      sourceId: "chat-intent",
    },
  ],
];

for (const [hash, expected] of routeCases) {
  const parsed = parseHash(hash);
  for (const key of ["level", "themeId", "ideaId", "stepId", "sourceId"]) {
    assert(parsed[key] === expected[key], `parse ${hash} → ${key}`);
  }
  assert(buildHash(parsed) === hash, `roundtrip ${hash}`);
}

const back = backOneLevel(parseHash("#/develop/develop-brain/wish/source/chat-intent"));
assert(back.sourceId === undefined && back.stepId === "wish", "back from source keeps the step");
assert(backOneLevel(parseHash("#/develop/develop-brain/wish")).level === "idea", "back from step → idea");
assert(backOneLevel(parseHash("#/develop/develop-brain")).level === "theme", "back from idea → theme");
assert(backOneLevel(parseHash("#/develop")).level === "overview", "back from theme → overview");

// ------------------------------------------------------- graph and layout

globalThis.window = globalThis.window || {};
if (process.argv.includes("--private-data")) {
  try {
    await import("../private-data/thoughts.js");
    await import("../private-data/flomo.js");
  } catch (error) {
    console.warn("note: private-data 不可用，使用示例数据 —", error.message);
  }
}

const { loadGraph } = await import("../src/graph.js");
const { computeLayout, boundsOf } = await import("../src/layout.js");
const graph = loadGraph();

assert(graph.themes().length > 0, `themes loaded (${graph.themes().length})`);
assert(graph.missingRefs().length === 0, `every source ref resolves (${graph.missingRefs().length} missing)`);

const ids = [...graph.nodes.keys()];
assert(new Set(ids).size === ids.length, `node ids unique (${ids.length})`);
assert(
  graph.edges.every((e) => graph.nodes.has(e.from) && graph.nodes.has(e.to)),
  "every edge connects existing nodes"
);

const sourceNodes = [...graph.nodes.values()].filter((n) => n.type === "source");
assert(
  sourceNodes.every((n) => n.text && n.refId),
  `source nodes carry原文 (${sourceNodes.length})`
);

const stepNodes = [...graph.nodes.values()].filter((n) => n.type === "step");
const inferredEdges = graph.edges.filter((e) => e.kind === "inferred");
assert(
  inferredEdges.every((e) => graph.nodes.get(e.to)?.connection === "inferred"),
  `dashed edges only where the note did not confirm the link (${inferredEdges.length})`
);
assert(
  stepNodes.every((n) => ["thought", "action", "input", "experience"].includes(n.family)),
  "every step maps to a shape family"
);

const viewports = [
  { label: "1440x900", width: 1440, height: 900 },
  { label: "390x844", width: 390, height: 844 },
  { label: "408x543", width: 408, height: 543 },
];

const theme = graph.themes()[0];
const idea = graph.ideas(theme.themeId)[0];
const views = [
  { label: "overview", level: "overview" },
  { label: "theme", level: "theme", themeId: theme.themeId },
  {
    label: "idea",
    level: "idea",
    themeId: theme.themeId,
    ideaId: idea.ideaId,
    expanded: new Set(graph.steps(theme.themeId, idea.ideaId).map((s) => s.id)),
  },
];

for (const viewport of viewports) {
  for (const view of views) {
    const layout = computeLayout(graph, view, viewport);
    const placements = [...layout.placements.values()];
    assert(placements.length > 0, `${view.label} @ ${viewport.label}: nodes placed`);
    assert(
      placements.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.size > 0),
      `${view.label} @ ${viewport.label}: finite coordinates`
    );
    assert(layout.focus.length > 0, `${view.label} @ ${viewport.label}: focus set is not empty`);
    const box = boundsOf(layout.focus);
    assert(box.width > 0 && box.height > 0, `${view.label} @ ${viewport.label}: focus box has area`);
  }
}

// Every idea must be reachable from its theme, and every step from its idea.
for (const themeNode of graph.themes()) {
  for (const ideaNode of graph.ideas(themeNode.themeId)) {
    const hasEdge = graph.edges.some((e) => e.from === themeNode.id && e.to === ideaNode.id);
    assert(hasEdge, `${themeNode.label} → ${ideaNode.label} connected`);
    const steps = graph.steps(themeNode.themeId, ideaNode.ideaId);
    const chained = steps.every(
      (step, i) => i === 0 || graph.edges.some((e) => e.from === steps[i - 1].id && e.to === step.id)
    );
    assert(chained, `${ideaNode.label}: main line is a single chain (${steps.length} steps)`);
  }
}

// ------------------------------------------------- zero-dependency unit tests

for (const file of [
  "test-check-suite.mjs",
  "test-gitignore.mjs",
  "test-html-chrome.mjs",
  "test-motion-toggle-aria.mjs",
  "test-copy-link-live.mjs",
  "test-zoom-aria.mjs",
  "test-breadcrumb-aria.mjs",
  "test-popover-close-aria.mjs",
  "test-stage-aria.mjs",
  "test-stars-aria.mjs",
  "test-legend-aria.mjs",
  "test-nodes-aria.mjs",
  "test-styles-blog-chip.mjs",
  "test-no-private-data.mjs",
  "test-check-lessons-optin.mjs",
  "test-current-blog.mjs",
  "test-readme-tests.mjs",
  "test-route.mjs",
  "test-replay.mjs",
  "test-graph.mjs",
  "test-sample-data.mjs",
  "test-layout.mjs",
  "test-random.mjs",
  "test-sources-dedup.mjs",
  "test-two-hop.mjs",
  "test-daily-star.mjs",
  "test-grow.mjs",
  "test-curves.mjs",
  "test-core-breathe.mjs",
  "test-anatomy.mjs",
  "test-camera.mjs",
  "test-glyphs.mjs",
  "test-parallax.mjs",
  "test-lod.mjs",
  "test-perf-budget.mjs",
  "test-effects-perf.mjs",
]) {
  const script = fileURLToPath(new URL(file, import.meta.url));
  const run = spawnSync(process.execPath, [script], { encoding: "utf8" });
  if (run.status === 0) {
    console.log(`ok: ${file}`);
  } else {
    console.error(`FAIL: ${file} (exit ${run.status})`);
    console.error(run.stdout + run.stderr);
    failed++;
  }
}

process.exit(failed ? 1 : 0);
