#!/usr/bin/env node
/** 动效开关无障碍不变量：只读 index.html，字符串/正则断言，零依赖。
 * html-chrome 只锁了 id=motion-toggle 存在，改版时 aria-pressed 初值容易
 * 静默丢掉——缺了它，屏幕阅读器不把该按钮识别为开关，初始状态读不出来。
 * 这份测试锁住属性必须在且初值必须是布尔（true/false 具体是哪个不锁）。
 * 运行：node scripts/test-motion-toggle-aria.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const html = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");

const buttonTag = html.match(/<button\b[^>]*\bid\s*=\s*(["'])motion-toggle\1[^>]*>/)?.[0];

test("动效开关 id=motion-toggle 存在，且是 <button>", () => {
  assert.ok(buttonTag, "未找到 id=motion-toggle 的 <button> 开标签");
});

test("动效开关带 aria-pressed 初值（true/false 均可，属性必须在）", () => {
  assert.ok(buttonTag, "未找到 id=motion-toggle 的 <button> 开标签");
  assert.match(buttonTag, /\baria-pressed\s*=\s*(["'])(true|false)\1/);
});
