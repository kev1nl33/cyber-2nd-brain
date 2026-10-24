#!/usr/bin/env node
/** 中心物体亮度映射测试：最近步骤日期距今天数 → [0.55, 1]，再叠加 6s 慢呼吸。
 * 运行：node scripts/test-core-breathe.mjs（只用日期，不读任何内容，不读 private-data/）。 */
import test from "node:test";
import assert from "node:assert/strict";
import { coreBrightness, daysSince, latestStepDate } from "../src/glow.js";

const DAY = 86_400_000;
const TODAY = new Date("2026-10-22T12:00:00Z");

function at(daysAgo) {
  return new Date(TODAY.getTime() - daysAgo * DAY);
}

function iso(daysAgo) {
  return at(daysAgo).toISOString().slice(0, 10);
}

test("daysSince：同一天是 0，跨天按 UTC 日期差整，未来日期为负数", () => {
  assert.equal(daysSince("2026-10-22", TODAY), 0);
  assert.equal(daysSince("2026-10-21T23:59:00", TODAY), 1);
  assert.equal(daysSince("2026-09-22", TODAY), 30);
  assert.equal(daysSince("2026-10-23", TODAY), -1);
});

test("daysSince：缺失或无法解析的日期返回 null，不报错", () => {
  for (const bad of [null, undefined, "", "not-a-date", "2026-13-40"]) {
    assert.equal(daysSince(bad, TODAY), null);
  }
});

test("coreBrightness：0-3 天最亮为 1，30 天及以上最暗为 0.55", () => {
  for (const days of [0, 1, 3]) assert.equal(coreBrightness(days), 1);
  assert.equal(coreBrightness(30), 0.55);
  assert.equal(coreBrightness(90), 0.55);
  assert.equal(coreBrightness(365), 0.55);
});

test("coreBrightness：3 到 30 天线性插值，结果始终落在 [0.55, 1]", () => {
  const mid = coreBrightness(3 + 27 / 2);
  assert.ok(Math.abs(mid - (1 + 0.55) / 2) < 1e-9, `中点应为 0.775，实际 ${mid}`);
  const at13 = coreBrightness(13); // (13-3)/27 的距离
  assert.ok(Math.abs(at13 - (1 - (10 / 27) * 0.45)) < 1e-9);
  let prev = 1;
  for (let days = 3; days <= 30; days += 0.5) {
    const value = coreBrightness(days);
    assert.ok(value <= prev + 1e-12, `${days} 天不应比更近的日期更亮`);
    assert.ok(value >= 0.55 && value <= 1, `${days} 天越出 [0.55, 1]: ${value}`);
    prev = value;
  }
});

test("coreBrightness：无日期、无法解析、未来日期都落在最暗端", () => {
  assert.equal(coreBrightness(null), 0.55);
  assert.equal(coreBrightness(undefined), 0.55);
  assert.equal(coreBrightness(Number.NaN), 0.55);
  assert.equal(coreBrightness(-1), 0.55);
  assert.equal(coreBrightness(Number.POSITIVE_INFINITY), 0.55);
});

test("coreBrightness：呼吸以基础亮度为中心、波幅 0.06、6 秒一周，夹住后不越出 [0.55, 1]", () => {
  const period = 6;
  const base = coreBrightness(16.5); // 区间中点，呼吸不会碰到两端
  assert.ok(Math.abs(coreBrightness(16.5, period / 4) - (base + 0.06)) < 1e-9);
  assert.ok(Math.abs(coreBrightness(16.5, (3 * period) / 4) - (base - 0.06)) < 1e-9);
  // 最亮端的波峰、最暗端的波谷被夹住，但仍不低于基础方向的另一侧。
  assert.equal(coreBrightness(0, period / 4), 1);
  assert.ok(coreBrightness(0, (3 * period) / 4) < 1);
  assert.equal(coreBrightness(30, (3 * period) / 4), 0.55);
  assert.ok(coreBrightness(30, period / 4) > 0.55);
  // 同一基础亮度下，t 与 t+6 完全一致，t=0 落在中线。
  assert.equal(coreBrightness(10, 0), coreBrightness(10, 6));
  assert.equal(coreBrightness(10, 0), coreBrightness(10));
});

test("coreBrightness：关闭呼吸时只返回基础亮度，不随时间变化", () => {
  assert.equal(coreBrightness(10, 1.5, { breathe: false }), coreBrightness(10));
  assert.equal(coreBrightness(0, 4.5, { breathe: false }), 1);
  assert.equal(coreBrightness(40, 4.5, { breathe: false }), 0.55);
});

test("latestStepDate：只看步骤的日期，取最晚的一天，忽略缺失和无法解析的", () => {
  const nodes = [
    { type: "theme", latest: "2099-01-01" },
    { type: "idea", updated: "2099-01-01" },
    { type: "step", date: iso(40), title: "不该被读到的标题" },
    { type: "step", date: iso(2) },
    { type: "step", date: "" },
    { type: "step" },
    { type: "step", date: "soon" },
    { type: "source", date: "2099-01-01", text: "不该被读到的正文" },
  ];
  assert.equal(latestStepDate(nodes), iso(2));
  assert.equal(latestStepDate([]), null);
  assert.equal(latestStepDate([{ type: "step", date: "nope" }]), null);
  assert.equal(latestStepDate(new Map(nodes.map((node, i) => [String(i), node]))), iso(2));
});
