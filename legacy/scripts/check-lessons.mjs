#!/usr/bin/env node
/**
 * 核对 private-data/lessons.js：每条经验的问题 id 与证据步骤 id 都必须在
 * private-data/thoughts.js 里真实存在，模式与经验的互相引用也必须闭合。
 * 运行：node scripts/check-lessons.mjs
 */
globalThis.window = globalThis.window || {};

await import("../private-data/thoughts.js");
await import("../private-data/lessons.js");

const data = globalThis.window.CYBER_THOUGHTS;
const lessons = globalThis.window.LESSONS;

let failed = 0;
function assert(cond, msg) {
  if (cond) console.log("ok:", msg);
  else {
    console.error("FAIL:", msg);
    failed++;
  }
}

const ideaSteps = new Map();
for (const theme of data.themes) {
  for (const idea of theme.ideas || []) {
    ideaSteps.set(
      idea.id,
      new Set((idea.nodes || []).map((n) => n.id))
    );
  }
}

assert(lessons?.lessons?.length > 0, `经验已加载（${lessons?.lessons?.length || 0}）`);
assert(lessons?.patterns?.length > 0, `模式已加载（${lessons?.patterns?.length || 0}）`);

const lessonIds = new Set();
const byIdea = new Map();
for (const lesson of lessons.lessons) {
  assert(!lessonIds.has(lesson.id), `经验 id 唯一：${lesson.id}`);
  lessonIds.add(lesson.id);
  byIdea.set(lesson.ideaId, (byIdea.get(lesson.ideaId) || 0) + 1);

  assert(ideaSteps.has(lesson.ideaId), `问题存在：${lesson.ideaId}（${lesson.id}）`);
  const steps = ideaSteps.get(lesson.ideaId) || new Set();
  for (const stepId of lesson.stepIds) {
    assert(steps.has(stepId), `步骤存在：${stepId} ∈ ${lesson.ideaId}（${lesson.id}）`);
  }
  assert(lesson.stepIds.length > 0, `经验至少有一个出处：${lesson.id}`);
  assert(lesson.status === "confirmed" || lesson.status === "待确认", `状态合法：${lesson.id}`);
  assert(typeof lesson.hasInference === "boolean", `hasInference 为布尔：${lesson.id}`);
  assert(typeof lesson.text === "string" && lesson.text.length > 0, `经验原文非空：${lesson.id}`);
}

const patternIds = new Set();
for (const pattern of lessons.patterns) {
  assert(!patternIds.has(pattern.id), `模式 id 唯一：${pattern.id}`);
  patternIds.add(pattern.id);
  assert(pattern.level === "或曰", `模式级别为「或曰」：${pattern.id}`);
  assert(pattern.lessonIds.length >= 2, `模式至少连两条经验：${pattern.id}`);
  for (const lessonId of pattern.lessonIds) {
    const lesson = lessons.lessons.find((l) => l.id === lessonId);
    assert(Boolean(lesson), `模式引用的经验存在：${lessonId}（${pattern.id}）`);
    assert(
      lesson?.patternIds.includes(pattern.id),
      `经验回指该模式：${lessonId} → ${pattern.id}`
    );
  }
}

for (const lesson of lessons.lessons) {
  for (const patternId of lesson.patternIds) {
    const pattern = lessons.patterns.find((p) => p.id === patternId);
    assert(Boolean(pattern), `经验引用的模式存在：${patternId}（${lesson.id}）`);
    assert(
      pattern?.lessonIds.includes(lesson.id),
      `模式回指该经验：${patternId} → ${lesson.id}`
    );
  }
}

const pending = lessons.lessons.filter((l) => l.status === "待确认");
assert(pending.length === 2, `待确认恰好 2 条（实际 ${pending.length}）`);
assert(
  pending.every((l) => l.stepIds.length === 1),
  "待确认的经验都只有一个出处步骤"
);

console.log(
  `\n合计：${lessons.lessons.length} 条经验，覆盖 ${byIdea.size} 个问题；${lessons.patterns.length} 个模式。`
);
process.exit(failed ? 1 : 0);
