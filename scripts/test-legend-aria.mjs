#!/usr/bin/env node
/** 连线图例无障碍不变量：只读 index.html，字符串/正则断言，零依赖。
 * html-chrome 未锁图例容器 div.legend——图例靠颜色与线型区分连线含义，
 * 这是纯视觉信息，屏幕阅读器读不出来，容器的 aria-label 是它唯一的
 * 可访问名称，改版时容易静默丢掉。这份测试锁住属性必须在且值非空白
 * （具体取值不锁）。
 * 运行：node scripts/test-legend-aria.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const html = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");

const legendTag = (html.match(/<div\b[^>]*>/g) ?? []).find((tag) =>
  (tag.match(/\bclass\s*=\s*(["'])(.*?)\1/)?.[2] ?? "").trim().split(/\s+/).includes("legend")
);

test("图例容器存在 class 含 legend 的 <div>", () => {
  assert.ok(legendTag, "未找到 class 含 legend 的 <div> 开标签");
});

test("图例容器带非空 aria-label（取值不锁，属性与非空白内容必须在）", () => {
  assert.ok(legendTag, "未找到 class 含 legend 的 <div> 开标签");
  const label = legendTag.match(/\baria-label\s*=\s*(["'])(.*?)\1/)?.[2] ?? "";
  assert.ok(label.trim().length > 0, "legend 容器的 aria-label 缺失或为空白");
});
