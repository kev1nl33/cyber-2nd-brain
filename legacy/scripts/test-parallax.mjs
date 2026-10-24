#!/usr/bin/env node
/** 景深视差：平移时星空 0.3、流星 0.6、节点 1；缩放不进视差；
 * reduced-motion 下星空与流星固定。运行：node scripts/test-parallax.mjs。 */
import test from "node:test";
import assert from "node:assert/strict";
import { parallaxShift } from "../src/parallax.js";

const PAN = { dx: 100, dy: -40 };

test("平移时三层位移比例为 0.3 / 0.6 / 1", () => {
  const layers = parallaxShift(PAN, { reduced: false });
  assert.deepEqual(layers.stars, { x: 30, y: -12 });
  assert.deepEqual(layers.meteors, { x: 60, y: -24 });
  assert.deepEqual(layers.nodes, { x: 100, y: -40 });
});

test("缩放不改变视差：同一平移量在任意 scale 下位移一致", () => {
  const atOne = parallaxShift(PAN, { reduced: false, scale: 1 });
  const zoomed = parallaxShift(PAN, { reduced: false, scale: 2.4 });
  const shrunk = parallaxShift(PAN, { reduced: false, scale: 0.2 });
  assert.deepEqual(zoomed, atOne);
  assert.deepEqual(shrunk, atOne);
});

test("reduced-motion 下星空与流星固定，节点层仍跟平移", () => {
  const layers = parallaxShift(PAN, { reduced: true });
  assert.deepEqual(layers.stars, { x: 0, y: 0 });
  assert.deepEqual(layers.meteors, { x: 0, y: 0 });
  assert.deepEqual(layers.nodes, { x: 100, y: -40 });
});

test("零平移与缺失输入不产生位移", () => {
  const still = parallaxShift({ dx: 0, dy: 0 }, { reduced: false });
  assert.deepEqual(still.stars, { x: 0, y: 0 });
  assert.deepEqual(still.meteors, { x: 0, y: 0 });
  assert.deepEqual(still.nodes, { x: 0, y: 0 });
  assert.deepEqual(parallaxShift(null, { reduced: false }).nodes, { x: 0, y: 0 });
});
