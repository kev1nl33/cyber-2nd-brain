#!/usr/bin/env node
/** current.md 不变量测试：锁住「已上线交互」的返回博客条目——顶栏
 * 「返回博客」chip 链到个人博客 https://aikevin.dpdns.org/，防止文档回退
 * 时悄悄丢掉。只读仓库根 current.md，不读 private-data、不改业务代码。
 * 运行：node scripts/test-current-blog.mjs（零依赖，仅 node:test + node:assert）。 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const currentPath = fileURLToPath(new URL("../current.md", import.meta.url));
// 文件不存在时顶层读取直接抛错，整个测试文件失败 —— 即「存在」断言。
const current = readFileSync(currentPath, "utf8");

test("current.md 存在且非空", () => {
  assert.ok(current.trim().length > 0, "current.md 没有任何正文");
});

test("正文含「返回博客」chip 说明", () => {
  assert.ok(current.includes("返回博客"), "current.md 丢失「返回博客」条目");
});

test("正文含博客首页 URL", () => {
  assert.ok(
    current.includes("https://aikevin.dpdns.org/"),
    "current.md 丢失博客首页链接 https://aikevin.dpdns.org/"
  );
});
