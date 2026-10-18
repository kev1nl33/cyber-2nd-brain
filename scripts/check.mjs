#!/usr/bin/env node
/**
 * Pure checks for hash routes. Run: node scripts/check.mjs
 * Optional ref validation: node scripts/check.mjs --refs (requires private-data via dynamic import path)
 */
import { parseHash, buildHash, backOneLevel } from "../src/route.js";

let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  } else {
    console.log("ok:", msg);
  }
}

const cases = [
  ["#/", { level: "overview" }],
  ["#/develop", { level: "theme", themeId: "develop" }],
  ["#/develop/develop-brain", { level: "idea", themeId: "develop", ideaId: "develop-brain" }],
  [
    "#/develop/develop-brain/wish",
    { level: "step", themeId: "develop", ideaId: "develop-brain", stepId: "wish", sourcesExpanded: false },
  ],
  [
    "#/develop/develop-brain/wish/source/chat-intent",
    {
      level: "step",
      themeId: "develop",
      ideaId: "develop-brain",
      stepId: "wish",
      sourceId: "chat-intent",
      sourcesExpanded: true,
    },
  ],
];

for (const [hash, expected] of cases) {
  const parsed = parseHash(hash);
  assert(parsed.level === expected.level, `parse ${hash} level`);
  assert(parsed.themeId === expected.themeId, `parse ${hash} themeId`);
  assert(parsed.ideaId === expected.ideaId, `parse ${hash} ideaId`);
  assert(parsed.stepId === expected.stepId, `parse ${hash} stepId`);
  assert(parsed.sourceId === expected.sourceId, `parse ${hash} sourceId`);
  const round = buildHash(parsed);
  assert(round === hash || hash === "#/", `roundtrip ${hash} -> ${round}`);
}

const back = backOneLevel(parseHash("#/develop/develop-brain/wish/source/x"));
assert(back.sourceId === undefined && back.stepId === "wish", "back from source drops sourceId");

if (process.argv.includes("--refs")) {
  try {
    global.window = {};
    await import("../private-data/thoughts.js");
    await import("../private-data/flomo.js");
    const { loadGraph } = await import("../src/model.js");
    const { validateRefs } = loadGraph().graph;
    const missing = validateRefs();
    assert(missing.length === 0, `all refs resolve (${missing.length} missing)`);
  } catch (e) {
    console.warn("Skip ref validation:", e.message);
  }
}

process.exit(failed ? 1 : 0);
