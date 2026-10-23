#!/usr/bin/env node
/** 浮框 dialog 语义不变量：只读 index.html，字符串/正则断言，零依赖。
 * html-chrome 与 popover-close-aria 都未锁浮框 #popover 的 dialog 语义——
 * role="dialog" 给出浮框的可访问角色，aria-labelledby 把角色关联到标题
 * 元素，两者改版时容易静默丢掉。这份测试锁住 role 必须是 dialog、
 * aria-labelledby 必须在且非空白、且指向的每个 id 在文档中有对应元素
 * （labelledby 具体指向不锁）。
 * 运行：node scripts/test-popover-dialog.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const html = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");

// 开标签里属性顺序不固定（class 在 id 前），先收集全部开标签再按 id 找
const popoverTag = (html.match(/<[a-z]+\b[^>]*>/gi) ?? []).find((tag) =>
  tag.match(/\bid\s*=\s*(["'])popover\1/)
);

// 文档里全部 id 取值，用于校验 aria-labelledby 的指向
const allIds = new Set([...html.matchAll(/\bid\s*=\s*(["'])(.*?)\1/g)].map((m) => m[2]));

test("浮框存在 id=popover 的元素", () => {
  assert.ok(popoverTag, "未找到 id=popover 的开标签");
});

test("浮框带 role=dialog", () => {
  assert.ok(popoverTag, "未找到 id=popover 的开标签");
  const role = popoverTag.match(/\brole\s*=\s*(["'])(.*?)\1/)?.[2] ?? "";
  assert.equal(role.trim(), "dialog", "id=popover 的 role 缺失或不是 dialog");
});

test("浮框带非空 aria-labelledby，且指向的每个 id 在文档中有对应元素（指向取值不锁）", () => {
  assert.ok(popoverTag, "未找到 id=popover 的开标签");
  const refs = (popoverTag.match(/\baria-labelledby\s*=\s*(["'])(.*?)\1/)?.[2] ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  assert.ok(refs.length > 0, "id=popover 的 aria-labelledby 缺失或为空白");
  for (const ref of refs) {
    assert.ok(allIds.has(ref), `aria-labelledby 指向的 id=${ref} 在文档中没有对应元素`);
  }
});
