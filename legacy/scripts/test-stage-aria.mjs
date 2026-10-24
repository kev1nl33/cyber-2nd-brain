#!/usr/bin/env node
/** 主画布 main 无障碍不变量：只读 index.html，字符串/正则断言，零依赖。
 * html-chrome 未锁主画布 main#stage——main 是页面主地标（landmark），
 * 缺了 aria-label 屏幕阅读器就读不出这是「思考图谱画布」，改版时容易静默丢掉。
 * 这份测试锁住属性必须在且值非空白（具体取值不锁）。
 * 运行：node scripts/test-stage-aria.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const html = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");

const mainTag = html.match(/<main\b[^>]*\bid\s*=\s*(["'])stage\1[^>]*>/)?.[0];

test("主画布存在 id=stage 的 <main>", () => {
  assert.ok(mainTag, "未找到 id=stage 的 <main> 开标签");
});

test("主画布 main 带非空 aria-label（取值不锁，属性与非空白内容必须在）", () => {
  assert.ok(mainTag, "未找到 id=stage 的 <main> 开标签");
  const label = mainTag.match(/\baria-label\s*=\s*(["'])(.*?)\1/)?.[2] ?? "";
  assert.ok(label.trim().length > 0, "id=stage 的 aria-label 缺失或为空白");
});
