#!/usr/bin/env node
/** 缩放三钮无障碍不变量：只读 index.html，字符串/正则断言，零依赖。
 * html-chrome 只锁了按钮 id 存在，改版时 aria-label 容易静默丢掉——
 * 三个按钮的可见内容只有符号 −/◎/＋，缺了 aria-label，屏幕阅读器读不出
 * 每个按钮是干什么的。这份测试锁住属性必须在且值非空白（具体取值不锁）。
 * 运行：node scripts/test-zoom-aria.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const html = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");

const controls = [
  ["zoom-out", "缩小"],
  ["zoom-reset", "复位"],
  ["zoom-in", "放大"],
];

for (const [id, name] of controls) {
  const buttonTag = html.match(new RegExp(`<button\\b[^>]*\\bid\\s*=\\s*(["'])${id}\\1[^>]*>`))?.[0];

  test(`${name}按钮 id=${id} 存在，且是 <button>`, () => {
    assert.ok(buttonTag, `未找到 id=${id} 的 <button> 开标签`);
  });

  test(`${name}按钮带非空 aria-label（取值不锁，属性与非空白内容必须在）`, () => {
    assert.ok(buttonTag, `未找到 id=${id} 的 <button> 开标签`);
    const label = buttonTag.match(/\baria-label\s*=\s*(["'])(.*?)\1/)?.[2] ?? "";
    assert.ok(label.trim().length > 0, `id=${id} 的 aria-label 缺失或为空白`);
  });
}
