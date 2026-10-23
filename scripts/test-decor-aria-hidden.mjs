#!/usr/bin/env node
/** 装饰层无障碍不变量：只读 index.html，字符串/正则断言，零依赖。
 * html-chrome 未锁装饰层 #bg-canvas / #meteor-canvas / .grain / .vignette——
 * 背景画布、流星、颗粒与暗角都是纯视觉层，没有文字内容，aria-hidden="true"
 * 让屏幕阅读器跳过它们，改版时容易静默丢掉。这份测试锁住四个装饰元素
 * 各自的开标签必须在，且各自带 aria-hidden="true"（空字符串等价写法
 * 也算 true，取值写法不锁死）。
 * 运行：node scripts/test-decor-aria-hidden.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const html = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");

const decorLayers = [
  { label: "背景画布 #bg-canvas", tag: "canvas", id: "bg-canvas" },
  { label: "流星画布 #meteor-canvas", tag: "canvas", id: "meteor-canvas" },
  { label: "颗粒层 .grain", tag: "div", cls: "grain" },
  { label: "暗角层 .vignette", tag: "div", cls: "vignette" },
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

test("四个装饰层齐备（#bg-canvas、#meteor-canvas、.grain、.vignette）", () => {
  const missing = decorLayers.filter((layer) => !openingTagOf(layer)).map((layer) => layer.label);
  assert.deepEqual(missing, [], `index.html 缺少装饰层：${missing.join("、")}`);
});

for (const layer of decorLayers) {
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
