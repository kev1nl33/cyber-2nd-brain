#!/usr/bin/env node
/** 浮框关闭钮无障碍不变量：只读 index.html，字符串/正则断言，零依赖。
 * html-chrome 未锁浮框关闭钮 #popover-close——按钮内容只有一个 aria-hidden 的
 * SVG 叉号，aria-label 是唯一的可访问名称，改版时容易静默丢掉。
 * 这份测试锁住属性必须在且值非空白（具体取值不锁）。
 * 运行：node scripts/test-popover-close-aria.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const html = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");

const buttonTag = html.match(/<button\b[^>]*\bid\s*=\s*(["'])popover-close\1[^>]*>/)?.[0];

test("浮框关闭钮存在 id=popover-close 的 <button>", () => {
  assert.ok(buttonTag, "未找到 id=popover-close 的 <button> 开标签");
});

test("关闭钮带非空 aria-label（取值不锁，属性与非空白内容必须在）", () => {
  assert.ok(buttonTag, "未找到 id=popover-close 的 <button> 开标签");
  const label = buttonTag.match(/\baria-label\s*=\s*(["'])(.*?)\1/)?.[2] ?? "";
  assert.ok(label.trim().length > 0, "id=popover-close 的 aria-label 缺失或为空白");
});
