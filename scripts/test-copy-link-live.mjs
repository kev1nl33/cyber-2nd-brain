#!/usr/bin/env node
/** 复制链接无障碍不变量：只读 index.html，字符串/正则断言，零依赖。
 * html-chrome 只锁了 id=copy-link 与可见文案「复制链接」，改版时 aria-live 容易
 * 静默丢掉——复制成功后按钮文案换成「已复制」，没有 aria-live，屏幕阅读器
 * 不播报这个变化，视障用户不知道复制是否成功。这份测试锁住属性必须在且
 * 取值必须是 polite/assertive。
 * 运行：node scripts/test-copy-link-live.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const html = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");

const buttonTag = html.match(/<button\b[^>]*\bid\s*=\s*(["'])copy-link\1[^>]*>/)?.[0];

test("复制链接按钮 id=copy-link 存在，且是 <button>", () => {
  assert.ok(buttonTag, "未找到 id=copy-link 的 <button> 开标签");
});

test("复制链接按钮带 aria-live（polite/assertive 均可，属性必须在）", () => {
  assert.ok(buttonTag, "未找到 id=copy-link 的 <button> 开标签");
  assert.match(buttonTag, /\baria-live\s*=\s*(["'])(polite|assertive)\1/);
});
