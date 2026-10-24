#!/usr/bin/env node
/** 守门测试：scripts/ 里每个 test-*.mjs 都必须在 README「检查与测试」的命令
 * 列表里以 `node scripts/<文件名>` 字面量出现——README 测试清单曾多次漏更，
 * 用静态断言锁住清单与磁盘一致。只读仓库根 README.md 与 scripts/ 目录列表。
 * 运行：node scripts/test-readme-tests.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SELF = "test-readme-tests.mjs";
const scriptsDir = fileURLToPath(new URL("./", import.meta.url));

const diskFiles = readdirSync(scriptsDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && /^test-.*\.mjs$/.test(entry.name))
  .map((entry) => entry.name)
  .sort();
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

test("scripts/ 下至少有一个 test-*.mjs", () => {
  assert.ok(diskFiles.length > 0, "scripts/ 里没有任何 test-*.mjs——扫描源可能失效");
});

test("README 命令列表覆盖磁盘上每个 test-*.mjs", () => {
  const missing = diskFiles.filter((file) => !readme.includes(`node scripts/${file}`));
  assert.deepEqual(
    missing,
    [],
    ["README「检查与测试」缺少命令，请补入列表：", ...missing.map((file) => `node scripts/${file}`)].join("\n")
  );
});

test("本测试自身也必须被 README 列出", () => {
  assert.ok(readme.includes(`node scripts/${SELF}`), `${SELF} 必须出现在 README 的命令列表`);
});
