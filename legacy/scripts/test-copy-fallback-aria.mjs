#!/usr/bin/env node
/** 复制备用输入框无障碍不变量：只读 index.html，字符串/正则断言，零依赖。
 * html-chrome 未锁备用输入框 input#copy-fallback——剪贴板不可用时当前
 * 视角链接全靠这个只读输入框手动复制，它没有静态文字内容，aria-label
 * 是它唯一的可访问名称，改版时容易静默丢掉。这份测试锁住元素必须在、
 * aria-label 必须在且非空白（具体取值不锁）。
 * 运行：node scripts/test-copy-fallback-aria.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const html = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");

// 开标签里属性顺序不固定（class 在 id 前），先收集全部 <input> 再按 id 找
const fallbackTag = (html.match(/<input\b[^>]*>/g) ?? []).find((tag) =>
  tag.match(/\bid\s*=\s*(["'])copy-fallback\1/)
);

test("备用输入框存在 id=copy-fallback 的 <input>", () => {
  assert.ok(fallbackTag, "未找到 id=copy-fallback 的 <input> 开标签");
});

test("备用输入框带非空 aria-label（取值不锁，属性与非空白内容必须在）", () => {
  assert.ok(fallbackTag, "未找到 id=copy-fallback 的 <input> 开标签");
  const label = fallbackTag.match(/\baria-label\s*=\s*(["'])(.*?)\1/)?.[2] ?? "";
  assert.ok(label.trim().length > 0, "id=copy-fallback 的 aria-label 缺失或为空白");
});
