#!/usr/bin/env node
/** gitignore 不变量测试：锁住 agent 产物（result.md / CLAUDE.md）的忽略规则，
 * 防止被悄悄删掉，同时防 private-data/ 回归。
 * 只读仓库根 .gitignore，不读 private-data、不改业务代码。
 * 运行：node scripts/test-gitignore.mjs（零依赖，仅 node:test + node:assert）。 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const gitignorePath = fileURLToPath(new URL("../.gitignore", import.meta.url));
// 文件不存在时顶层读取直接抛错，整个测试文件失败 —— 即「存在」断言。
const rules = readFileSync(gitignorePath, "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim());

/** pattern 是否以独立规则行出现（裸 pattern 或加 ** 目录通配前缀均可；注释行天然不匹配）。 */
function hasRule(...variants) {
  const accepted = variants.flatMap((v) => [v, `**/${v}`]);
  return rules.some((line) => accepted.includes(line));
}

test(".gitignore 存在且非空", () => {
  assert.ok(
    rules.some((line) => line !== "" && !line.startsWith("#")),
    ".gitignore 没有任何生效的忽略规则"
  );
});

test("忽略各级目录的 result.md", () => {
  assert.ok(hasRule("result.md"), "缺少独立规则 result.md / **/result.md");
});

test("忽略各级目录的 CLAUDE.md", () => {
  assert.ok(hasRule("CLAUDE.md"), "缺少独立规则 CLAUDE.md / **/CLAUDE.md");
});

test("仍忽略 private-data/", () => {
  assert.ok(hasRule("private-data/", "private-data"), "缺少独立规则 private-data/ —— 私密数据可能入库");
});
