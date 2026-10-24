#!/usr/bin/env node
/** 缩放分级（LOD）纯函数测试：三档阈值与滞回。
 * 运行：node scripts/test-lod.mjs（零依赖，仅 node:test + node:assert）。 */
import test from "node:test";
import assert from "node:assert/strict";
import { nextLod } from "../src/lod.js";

// 远 < 0.6 只留主题名；0.6–1.2 显示问题文字；> 1.2 显示步骤文字。
// 滞回带宽 ±0.05：正在用的档位要跨过阈值外侧 0.05 才切换。

test("无当前档位时按硬阈值分档", () => {
  assert.equal(nextLod(0.59), "far");
  assert.equal(nextLod(0.6), "mid");
  assert.equal(nextLod(1.2), "mid");
  assert.equal(nextLod(1.21), "near");
});

test("滞回：从 far 放大，跨过 0.6 仍停在 far，过 0.65 才进 mid", () => {
  assert.equal(nextLod(0.6, "far"), "far");
  assert.equal(nextLod(0.65, "far"), "far");
  assert.equal(nextLod(0.66, "far"), "mid");
});

test("滞回：从 mid 缩小，跨过 0.6 仍停在 mid，低过 0.55 才回 far", () => {
  assert.equal(nextLod(0.6, "mid"), "mid");
  assert.equal(nextLod(0.55, "mid"), "mid");
  assert.equal(nextLod(0.54, "mid"), "far");
});

test("滞回：从 mid 放大，跨过 1.2 仍停在 mid，过 1.25 才进 near", () => {
  assert.equal(nextLod(1.2, "mid"), "mid");
  assert.equal(nextLod(1.25, "mid"), "mid");
  assert.equal(nextLod(1.26, "mid"), "near");
});

test("滞回：从 near 缩小，跨过 1.2 仍停在 near，低过 1.15 才回 mid", () => {
  assert.equal(nextLod(1.2, "near"), "near");
  assert.equal(nextLod(1.15, "near"), "near");
  assert.equal(nextLod(1.14, "near"), "mid");
});

test("滞回不跨档：从 far 一次跨过两道阈值直接到 near", () => {
  assert.equal(nextLod(1.26, "far"), "near");
});

test("滞回不跨档：从 near 一次跨过两道阈值直接回 far", () => {
  assert.equal(nextLod(0.54, "near"), "far");
});

test("当前档位已是目标档位时保持不变", () => {
  assert.equal(nextLod(0.9, "mid"), "mid");
  assert.equal(nextLod(2, "near"), "near");
  assert.equal(nextLod(0.2, "far"), "far");
});

test("非法当前档位当作没有滞回", () => {
  assert.equal(nextLod(0.5, "bogus"), "far");
  assert.equal(nextLod(0.9, null), "mid");
});
