#!/usr/bin/env node
/** 图例装饰图标无障碍不变量：只读 index.html，字符串/正则断言，零依赖。
 * test-legend-aria 锁住图例容器的 aria-label，但 footer 图例里
 * .legend-item 的装饰图标只有 .legend-star 带了 aria-hidden——
 * legend-line / legend-dot 同样是纯视觉装饰，屏幕阅读器只读
 * 旁边的文字，改版时容易只补一类、漏掉其余。这份测试锁住每个
 * legend-item 内的 <i> 开标签都必须带 aria-hidden="true"（空
 * 字符串等价写法也算 true，取值写法不锁死），并覆盖 legend-line、
 * legend-dot、legend-star 三类图标。
 * 运行：node scripts/test-legend-icons-aria.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const html = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");

const legendItems = [
  ...html.matchAll(
    /<span\b[^>]*\bclass\s*=\s*(["'])[^"']*\blegend-item\b[^"']*\1[^>]*>[\s\S]*?<\/span>/gi
  ),
].map((match) => match[0]);

const iconsOf = (block) => [...block.matchAll(/<i\b[^>]*>/gi)].map((match) => match[0]);
const hasClass = (tag, cls) =>
  new RegExp(`\\bclass\\s*=\\s*(["'])[^"']*\\b${cls}\\b`, "i").test(tag);
const kindOf = (tag) =>
  ["legend-line", "legend-dot", "legend-star"].find((kind) => hasClass(tag, kind)) ?? "未知图标";

const hiddenValueOf = (tag) => tag.match(/\baria-hidden\s*=\s*(["'])(.*?)\1/i)?.[2] ?? null;
const isHiddenTrue = (value) =>
  value !== null && (value.trim() === "" || value.trim().toLowerCase() === "true");

test("footer 图例项不少于 5 个", () => {
  assert.ok(
    legendItems.length >= 5,
    `legend-item 应不少于 5 个（当前：${legendItems.length}）`
  );
});

for (const [itemIndex, block] of legendItems.entries()) {
  for (const [iconIndex, tag] of iconsOf(block).entries()) {
    test(`图例项 ${itemIndex + 1} 的 ${kindOf(tag)} 带 aria-hidden="true"`, () => {
      const value = hiddenValueOf(tag);
      assert.ok(
        isHiddenTrue(value),
        `第 ${itemIndex + 1} 个 legend-item 的第 ${iconIndex + 1} 个 <i>（${kindOf(tag)}）` +
          `的 aria-hidden 应为 true（当前：${value === null ? "缺失" : JSON.stringify(value)}）`
      );
    });
  }
}

test("图例覆盖 legend-line / legend-dot / legend-star 三类图标", () => {
  const tags = legendItems.flatMap(iconsOf);
  assert.ok(tags.length > 0, "图例里没有任何 <i> 图标——扫描源可能失效");
  for (const kind of ["legend-line", "legend-dot", "legend-star"]) {
    assert.ok(tags.some((tag) => hasClass(tag, kind)), `图例中未见 ${kind} 图标`);
  }
});
