#!/usr/bin/env node
/** 开场装饰无障碍不变量：只读 index.html，字符串/正则断言，零依赖。
 * html-chrome 未锁开场装饰 #intro-brain / .intro-caption——开场脑图与
 * 开场字幕都是纯视觉层，屏幕阅读器只读跳过按钮（自带可见文案），
 * aria-hidden="true" 让屏幕阅读器跳过装饰本身，改版时容易静默丢掉。
 * 这份测试锁住两个开场元素各自的开标签必须在，且各自带
 * aria-hidden="true"（空字符串等价写法也算 true，取值写法不锁死）；
 * 跳过按钮有可见文案，不在锁定范围。
 * 运行：node scripts/test-intro-aria-hidden.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const html = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");

const introLayers = [
  { label: "开场脑图 #intro-brain", tag: "svg", id: "intro-brain" },
  { label: "开场字幕 .intro-caption", tag: "div", cls: "intro-caption" },
];

const openingTagOf = (layer) => {
  const byIdOrClass =
    layer.id !== undefined
      ? `id\\s*=\\s*(["'])${layer.id}\\1`
      : `class\\s*=\\s*(["'])[^"']*\\b${layer.cls}\\b[^"']*\\1`;
  return html.match(new RegExp(`<${layer.tag}\\b[^>]*\\b(?:${byIdOrClass})[^>]*>`, "i"))?.[0] ?? "";
};

const hiddenValueOf = (tag) => tag.match(/\baria-hidden\s*=\s*(["'])(.*?)\1/i)?.[2] ?? null;
const isHiddenTrue = (value) =>
  value !== null && (value.trim() === "" || value.trim().toLowerCase() === "true");

test("两个开场装饰齐备（#intro-brain、.intro-caption）", () => {
  const missing = introLayers.filter((layer) => !openingTagOf(layer)).map((layer) => layer.label);
  assert.deepEqual(missing, [], `index.html 缺少开场装饰：${missing.join("、")}`);
});

for (const layer of introLayers) {
  test(`${layer.label} 存在且带 aria-hidden="true"`, () => {
    const tag = openingTagOf(layer);
    assert.ok(tag, `未找到 ${layer.label} 的开标签`);
    const value = hiddenValueOf(tag);
    assert.ok(
      isHiddenTrue(value),
      `${layer.label} 的 aria-hidden 应为 true（当前：${value === null ? "缺失" : JSON.stringify(value)}）`
    );
  });
}
