#!/usr/bin/env node
/** 面包屑 nav 无障碍不变量：只读 index.html，字符串/正则断言，零依赖。
 * html-chrome 未锁顶栏 nav#breadcrumb——nav 对屏幕阅读器是地标（landmark），
 * 缺了 aria-label 就读不出这是「层级」导航，改版时容易静默丢掉。
 * 这份测试锁住属性必须在且值非空白（具体取值不锁）。
 * 运行：node scripts/test-breadcrumb-aria.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const html = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");

const navTag = html.match(/<nav\b[^>]*\bid\s*=\s*(["'])breadcrumb\1[^>]*>/)?.[0];

test("顶栏面包屑存在 id=breadcrumb 的 <nav>", () => {
  assert.ok(navTag, "未找到 id=breadcrumb 的 <nav> 开标签");
});

test("面包屑 nav 带非空 aria-label（取值不锁，属性与非空白内容必须在）", () => {
  assert.ok(navTag, "未找到 id=breadcrumb 的 <nav> 开标签");
  const label = navTag.match(/\baria-label\s*=\s*(["'])(.*?)\1/)?.[2] ?? "";
  assert.ok(label.trim().length > 0, "id=breadcrumb 的 aria-label 缺失或为空白");
});
