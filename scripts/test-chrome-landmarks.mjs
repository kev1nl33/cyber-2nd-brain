#!/usr/bin/env node
/** 顶栏/底栏地标无障碍不变量：只读 index.html，字符串/正则断言，零依赖。
 * header.top-bar 与 footer.bottom-bar 虽是天然的 banner / contentinfo
 * 地标，但没补 aria-label 时屏幕阅读器只念笼统的角色名，改版时也容易
 * 静默抹掉。这份测试锁住两个地标的开标签必须在，且各自带指定的中文
 * aria-label（顶栏 / 底栏）；页内其余 header（如 popover-handle）不在
 * 锁定范围。
 * 运行：node scripts/test-chrome-landmarks.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const html = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");

const landmarks = [
  { label: "顶栏", tag: "header", cls: "top-bar" },
  { label: "底栏", tag: "footer", cls: "bottom-bar" },
];

const openingTagOf = (landmark) =>
  html.match(
    new RegExp(`<${landmark.tag}\\b[^>]*\\bclass\\s*=\\s*(["'])[^"']*\\b${landmark.cls}\\b[^"']*\\1[^>]*>`, "i")
  )?.[0] ?? "";

const labelValueOf = (tag) => tag.match(/\baria-label\s*=\s*(["'])(.*?)\1/i)?.[2] ?? null;

test("顶栏/底栏地标齐备（header.top-bar、footer.bottom-bar）", () => {
  const missing = landmarks
    .filter((landmark) => !openingTagOf(landmark))
    .map((landmark) => `${landmark.tag}.${landmark.cls}`);
  assert.deepEqual(missing, [], `index.html 缺少地标：${missing.join("、")}`);
});

for (const landmark of landmarks) {
  test(`${landmark.tag}.${landmark.cls} 带 aria-label「${landmark.label}」`, () => {
    const tag = openingTagOf(landmark);
    assert.ok(tag, `未找到 ${landmark.tag}.${landmark.cls} 的开标签`);
    const value = labelValueOf(tag);
    assert.equal(
      value,
      landmark.label,
      `${landmark.tag}.${landmark.cls} 的 aria-label 应为「${landmark.label}」` +
        `（当前：${value === null ? "缺失" : JSON.stringify(value)}）`
    );
  });
}
