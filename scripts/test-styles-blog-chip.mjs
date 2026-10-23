#!/usr/bin/env node
/** styles.css 顶栏「返回博客」样式不变量：只读 src/styles.css，正则断言，零依赖。
 * 锚点元素本身由 test-html-chrome 锁在 index.html，但 .chip--blog 类名和
 * 窄屏换行护栏只活在样式表里，改版时容易整体静默消失——这测试一丢就红。
 * 运行：node scripts/test-styles-blog-chip.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const css = readFileSync(fileURLToPath(new URL("../src/styles.css", import.meta.url)), "utf8");

/** 选择器规则（含随后的 `{`）首次出现位置；允许空格差异，兼防仅出现在注释里。 */
function ruleIndex(css, re) {
  const m = re.exec(css);
  assert.ok(m, `styles.css 未找到选择器规则：${re.source}`);
  return m.index;
}

/** 扫出所有 @media … max-width 顶层块的 [开括号, 闭括号] 区间。
 *  styles.css 的 content 值不含字面花括号，朴素计数即可。 */
function maxWidthBlocks(css) {
  const spans = [];
  let depth = 0;
  let open = -1;
  let isNarrow = false;
  let preludeStart = 0;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === "{") {
      if (++depth === 1) {
        isNarrow = /@media\b[^\n{]*\bmax-width\b/.test(css.slice(preludeStart, i));
        open = i;
      }
    } else if (ch === "}") {
      if (depth === 1 && isNarrow) spans.push([open, i]);
      if (depth > 0 && --depth === 0) preludeStart = i + 1;
    }
  }
  return spans;
}

test(".chip--blog 有独立样式规则（锚点作为 chip 变体的基础样式）", () => {
  assert.match(css, /\.chip--blog\s*\{/);
});

test("窄屏护栏 .top-actions:has(> .chip--blog) 规则存在（顶栏窄屏换行）", () => {
  // 若窄屏规则将来改名/重构，可放宽本条，但上一条 .chip--blog 必须保留——
  // 它是 index.html 锚点唯一依赖的类名，丢了「返回博客」就没有样式兜底。
  assert.match(css, /\.top-actions\s*:\s*has\s*\(\s*>\s*\.chip--blog\s*\)\s*\{/);
});

test("护栏规则位于 max-width 媒体查询内（确实只作用于窄屏）", () => {
  const idx = ruleIndex(css, /\.top-actions\s*:\s*has\s*\(\s*>\s*\.chip--blog\s*\)\s*\{/);
  const inside = maxWidthBlocks(css).some(([a, b]) => idx > a && idx < b);
  assert.ok(inside, "选择器必须落在某个 @media (max-width: …) 块内");
});
