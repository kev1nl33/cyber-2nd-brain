#!/usr/bin/env node
/** 守门测试：check-lessons.mjs 是需要 private-data/ 的 opt-in 脚本，
 * 只能人工带数据时运行，绝不能被挂进 check.mjs 的默认测试列表——
 * 默认套件必须随时无私密数据可跑。与 test-no-private-data.mjs 分工：
 * 那个拦路径字面量，这个拦「顺手挂上」清单项。
 * 只读 check.mjs 源码文本与 scripts/ 目录列表，不读 private-data、
 * 不执行任何被检脚本。运行：node scripts/test-check-lessons-optin.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const scriptsDir = fileURLToPath(new URL("./", import.meta.url));
const OPTIN = "check-lessons.mjs";

const diskFiles = readdirSync(scriptsDir, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name);

const source = readFileSync(new URL("check.mjs", import.meta.url), "utf8");
const testList = source.match(/for\s*\(\s*const\s+file\s+of\s*\[([\s\S]*?)\]\s*\)/);
assert.ok(testList, "check.mjs 中必须存在测试文件数组");
// 抓列表里引号内的全部 .mjs 文件名，不限 test- 前缀——
// 若只认 test-*.mjs，挂入 opt-in 脚本时本测试会失明。
const listedFiles = [...testList[1].matchAll(/(["'])([^"'\r\n]*\.mjs)\1/g)].map((m) => m[2]);

test("check-lessons.mjs 入口存在，不得误删", () => {
  assert.ok(diskFiles.includes(OPTIN), `scripts/ 下缺少 ${OPTIN}——opt-in 检查的入口没了`);
});

test("默认测试列表不得包含 check-lessons.mjs", () => {
  assert.ok(
    !listedFiles.includes(OPTIN),
    `${OPTIN} 需要私密数据，只能人工运行，不得挂进 check.mjs 默认列表`
  );
});

test("默认列表每一项形如 test-*.mjs（与 suite 互补）", () => {
  const offenders = listedFiles.filter((file) => !/^test-.*\.mjs$/.test(file));
  assert.deepEqual(
    offenders,
    [],
    ["非 test-*.mjs 的脚本不得挂进默认列表（opt-in 脚本尤其禁止）：", ...offenders].join("\n")
  );
});
