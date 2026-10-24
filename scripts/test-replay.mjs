#!/usr/bin/env node
/** 回放纯逻辑测试：日期排序与过滤、播放节奏和控制器状态。
 * 运行：node scripts/test-replay.mjs（零依赖，仅 node:test + node:assert）。 */
import test from "node:test";
import assert from "node:assert/strict";
import { createReplayController, datedSteps } from "../src/replay.js";

function makeSteps() {
  return [
    { id: "late", date: "2026-03-02" },
    { id: "early", date: "2026-03-01" },
    { id: "same", date: "2026-03-01" },
    { id: "missing" },
    { id: "invalid", date: "2026-02-30" },
  ];
}

test("datedSteps：按日期稳定排序，过滤缺失与无效日期，不改写原始步骤链", () => {
  const steps = makeSteps();
  const original = steps.slice();
  assert.deepEqual(datedSteps(steps).map((s) => s.id), ["early", "same", "late"]);
  assert.equal(steps[0].id, "late");
  assert.deepEqual(steps, original);
});

test("datedSteps：非法与空日期不进入回放", () => {
  assert.equal(datedSteps([{ date: "garbage" }, { date: "" }]).length, 0);
});

test("回放控制器：0.8s 节奏、暂停续播、末尾重播、seek、减少动态效果、切换与空链", () => {
  const visits = [];
  const replay = createReplayController({ onSelect: (step, played) => visits.push([step.id, played]) });
  replay.setContext("idea", makeSteps());
  assert.equal(replay.play(), true);
  assert.deepEqual(visits, [["early", true]]);
  replay.tick(0.79);
  assert.equal(visits.length, 1);
  replay.tick(0.01);
  assert.deepEqual(visits.at(-1), ["same", true]);
  replay.pause();
  replay.tick(2);
  assert.equal(visits.length, 2);
  replay.play();
  replay.tick(0.8);
  assert.deepEqual(visits.at(-1), ["late", true]);
  assert.equal(replay.playing, false);
  replay.tick(5);
  assert.equal(visits.length, 3);
  replay.play();
  assert.deepEqual(visits.at(-1), ["early", true]);
  replay.seek(2);
  assert.equal(replay.playing, false);
  assert.deepEqual(visits.at(-1), ["late", false]);
  replay.seek(-20);
  assert.equal(replay.index, 0);
  replay.seek(20);
  assert.equal(replay.index, 2);
  replay.setMotion(false);
  assert.equal(replay.play(), false);
  replay.seek(1);
  assert.deepEqual(visits.at(-1), ["same", false]);
  replay.setMotion(true);
  replay.play();
  replay.setContext("other", [{ id: "only", date: "2026-01-01" }]);
  assert.equal(replay.playing, false);
  assert.equal(replay.index, -1);
  replay.play();
  assert.equal(replay.playing, false);
  assert.deepEqual(visits.at(-1), ["only", true]);
  replay.setContext(null, []);
  assert.equal(replay.play(), false);
});

import "./check-replay.mjs";
