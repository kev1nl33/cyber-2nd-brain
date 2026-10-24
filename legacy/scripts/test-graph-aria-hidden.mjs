#!/usr/bin/env node
/** 图元装饰层无障碍不变量：只读 index.html，字符串/正则断言，零依赖。
 * html-chrome / decor-aria-hidden 未锁图元装饰层 #edges / #edge-tags /
 * .constellation-lines——连线、连线标签与星空连线都是纯视觉层，没有
 * 文字内容，aria-hidden="true" 让屏幕阅读器跳过它们，改版时容易静默
 * 丢掉。这份测试锁住三个图层各自的开标签必须在，且各自带
 * aria-hidden="true"（空字符串等价写法也算 true，取值写法不锁死）。
 * 运行：node scripts/test-graph-aria-hidden.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const html = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");

const graphLayers = [
  { label: "连线层 #edges", tag: "svg", id: "edges" },
  { label: "连线标签层 #edge-tags", tag: "div", id: "edge-tags" },
  { label: "星空连线 .constellation-lines", tag: "svg", cls: "constellation-lines" },
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

test("三个图元装饰层齐备（#edges、#edge-tags、.constellation-lines）", () => {
  const missing = graphLayers.filter((layer) => !openingTagOf(layer)).map((layer) => layer.label);
  assert.deepEqual(missing, [], `index.html 缺少图元装饰层：${missing.join("、")}`);
});

for (const layer of graphLayers) {
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
