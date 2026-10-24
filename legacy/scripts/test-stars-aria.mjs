#!/usr/bin/env node
/** 经验星空容器无障碍不变量：只读 index.html，字符串/正则断言，零依赖。
 * html-chrome 未锁星空容器 div#stars——星点由 stars.js 动态画进 SVG，
 * 容器自身没有文字内容，role="group" 与 aria-label 是它唯一的可访问名称，
 * 改版时容易静默丢掉。这份测试锁住 role=group 必须在、aria-label 必须在
 * 且非空白（具体取值不锁）。
 * 运行：node scripts/test-stars-aria.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const html = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");

const starsTag = html.match(/<div\b[^>]*\bid\s*=\s*(["'])stars\1[^>]*>/)?.[0];

test("星空容器存在 id=stars 的 <div>", () => {
  assert.ok(starsTag, "未找到 id=stars 的 <div> 开标签");
});

test("星空容器带 role=group", () => {
  assert.ok(starsTag, "未找到 id=stars 的 <div> 开标签");
  const role = starsTag.match(/\brole\s*=\s*(["'])(.*?)\1/)?.[2] ?? "";
  assert.equal(role.trim(), "group", "id=stars 的 role 应为 group");
});

test("星空容器带非空 aria-label（取值不锁，属性与非空白内容必须在）", () => {
  assert.ok(starsTag, "未找到 id=stars 的 <div> 开标签");
  const label = starsTag.match(/\baria-label\s*=\s*(["'])(.*?)\1/)?.[2] ?? "";
  assert.ok(label.trim().length > 0, "id=stars 的 aria-label 缺失或为空白");
});
