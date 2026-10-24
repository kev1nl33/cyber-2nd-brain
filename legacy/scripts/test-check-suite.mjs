#!/usr/bin/env node
/** 测试清单不变量：只读 scripts/，不执行 check.mjs。
 * 运行：node scripts/test-check-suite.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const scriptsDir = new URL("./", import.meta.url);
// 包含本测试自身，确保清单校验也始终挂入统一入口。
const diskFiles = readdirSync(fileURLToPath(scriptsDir), { withFileTypes: true })
  .filter((entry) => entry.isFile() && /^test-.*\.mjs$/.test(entry.name))
  .map((entry) => entry.name);
const source = readFileSync(new URL("check.mjs", scriptsDir), "utf8");
const testList = source.match(/for\s*\(\s*const\s+file\s+of\s*\[([\s\S]*?)\]\s*\)/);
assert.ok(testList, "check.mjs 中必须存在测试文件数组");
const listedFiles = [...testList[1].matchAll(/(["'])(test-[^"'\r\n]*\.mjs)\1/g)]
  .map((match) => match[2]);

test("check.mjs 的测试文件列表非空", () => {
  assert.ok(listedFiles.length > 0, "测试文件列表不能为空");
});

test("清单校验自身已挂入 check.mjs", () => {
  assert.ok(listedFiles.includes("test-check-suite.mjs"), "未挂入 test-check-suite.mjs");
});

test("scripts/ 下每个 test-*.mjs 都已挂入 check.mjs", () => {
  const missing = diskFiles.filter((file) => !listedFiles.includes(file));
  assert.deepEqual(missing, [], `未挂入 check.mjs：${missing.join(", ")}`);
});

test("check.mjs 列表中的每个测试文件都存在", () => {
  const missing = listedFiles.filter((file) => !diskFiles.includes(file));
  assert.deepEqual(missing, [], `测试文件不存在：${missing.join(", ")}`);
});
