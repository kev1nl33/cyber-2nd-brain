#!/usr/bin/env node
/** index.html 顶栏 chrome 不变量：只读 index.html，字符串/正则断言，零依赖。
 * 动效开关、复制链接、返回博客、返回上层这些标记靠人工记住容易在改版时静默丢掉，
 * 这份测试让它们一丢就红。
 * 运行：node scripts/test-html-chrome.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const html = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");

/** 提取全部 <script src="…"> 的地址，双/单引号都认。 */
const scriptSrcs = [...html.matchAll(/<script\b[^>]*?\bsrc\s*=\s*(["'])([^"']+)\1/g)].map((m) => m[2]);

test("顶栏存在 .top-actions 容器", () => {
  assert.match(html, /class="[^"]*\btop-actions\b/);
});

test("复制链接按钮 id=copy-link 存在，可见文案为「复制链接」", () => {
  const button = html.match(/<button\b[^>]*\bid\s*=\s*(["'])copy-link\1[^>]*>([\s\S]*?)<\/button>/);
  assert.ok(button, "未找到 id=copy-link 的 <button>");
  assert.match(button[2], /复制链接/);
});

test("存在指向博客首页的锚点，可见文案含「返回博客」", () => {
  const anchor = html.match(
    /<a\b[^>]*\bhref\s*=\s*(["'])https:\/\/aikevin\.dpdns\.org\/\1[^>]*>([\s\S]*?)<\/a>/
  );
  assert.ok(anchor, "未找到 href=https://aikevin.dpdns.org/ 的 <a>");
  assert.match(anchor[2], /返回博客/);
});

test("返回上层按钮 id=back-btn 存在", () => {
  assert.match(html, /<button\b[^>]*\bid\s*=\s*(["'])back-btn\1/);
});

test("动效开关 id=motion-toggle 存在", () => {
  assert.match(html, /<button\b[^>]*\bid\s*=\s*(["'])motion-toggle\1/);
});

test("private-data 只能经门卫的 ./ 相对路径加载，无未登录可直拉的 src", () => {
  const offenders = scriptSrcs.filter((src) => src.includes("private-data") && !src.startsWith("./"));
  assert.deepEqual(offenders, [], `private-data src 必须以 ./ 开头走门卫：${offenders.join(", ")}`);
});

test("门卫按原始路径取数的三个数据脚本路径原样保留", () => {
  for (const path of ["./private-data/flomo.js", "./private-data/thoughts.js", "./private-data/lessons.js"]) {
    assert.ok(scriptSrcs.includes(path), `${path} 必须原样保留在 script src 中`);
  }
});
