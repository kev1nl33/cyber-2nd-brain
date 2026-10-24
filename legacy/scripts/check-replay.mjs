#!/usr/bin/env node
/** Timeline and replay share real date ordering, including invalid and same-day dates. */
import test from "node:test";
import assert from "node:assert/strict";
import { datedSteps, createReplayController } from "../src/replay.js";
import * as layout from "../src/layout.js";
test("timeline shares replay dates, gaps and selection", () => {
  assert.equal(typeof layout.timelineSteps, "function");
  const steps = [{id:"b",date:"2026-10-20"},{id:"bad",date:"2026-02-30"},{id:"a",date:"2026-10-01"},{id:"c",date:"2026-10-20"}];
  const marks = layout.timelineSteps(steps, "b");
  assert.deepEqual(marks.map(m => m.id), datedSteps(steps).map(s => s.id));
  assert.deepEqual(marks.map(m => m.gapDays), [0,19,0]);
  assert.deepEqual(marks.map(m => m.selected), [false,true,false]);
  const replay = createReplayController({onSelect() {}});
  replay.setContext("test", steps);
  replay.seek(1);
  assert.equal(marks.find(m => m.selected).id, replay.steps[replay.index].id);
  assert.deepEqual(layout.timelineSteps([]), []);
});
