#!/usr/bin/env node
/** 节点层容器无障碍不变量：只读 index.html，字符串/正则断言，零依赖。
 * html-chrome 未锁节点层 div#nodes——节点标签由 scene.js 动态画进容器，
 * 容器自身没有静态文字内容，role="group" 与 aria-label 是它唯一的
 * 可访问名称，改版时容易静默丢掉。这份测试锁住 role=group 必须在、
 * aria-label 必须在且非空白（具体取值不锁）。
 * 运行：node scripts/test-nodes-aria.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const html = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");

const nodesTag = html.match(/<div\b[^>]*\bid\s*=\s*(["'])nodes\1[^>]*>/)?.[0];

test("节点层容器存在 id=nodes 的 <div>", () => {
  assert.ok(nodesTag, "未找到 id=nodes 的 <div> 开标签");
});

test("节点层容器带 role=group", () => {
  assert.ok(nodesTag, "未找到 id=nodes 的 <div> 开标签");
  const role = nodesTag.match(/\brole\s*=\s*(["'])(.*?)\1/)?.[2] ?? "";
  assert.equal(role.trim(), "group", "id=nodes 的 role 应为 group");
});

test("节点层容器带非空 aria-label（取值不锁，属性与非空白内容必须在）", () => {
  assert.ok(nodesTag, "未找到 id=nodes 的 <div> 开标签");
  const label = nodesTag.match(/\baria-label\s*=\s*(["'])(.*?)\1/)?.[2] ?? "";
  assert.ok(label.trim().length > 0, "id=nodes 的 aria-label 缺失或为空白");
});
