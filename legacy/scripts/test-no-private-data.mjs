#!/usr/bin/env node
/** 守门测试：统一入口 check.mjs 与全部 test-*.mjs 的非注释代码里不得出现
 * private-data 路径字面量——防止将来有人把 readFileSync("private-data/…")
 * 这类私密数据读取路径写进统一入口。说明性文字请写整行注释（以 // 或 * 开头）。
 * 历史守卫（--private-data 开关、门卫 src 校验、gitignore 规则名）已按整行
 * 掩码登记在 EXEMPT 豁免表，动到对应行需同步更新表。
 * 只读 scripts/ 的源码文本，不读 private-data、不执行被扫描脚本。
 * 运行：node scripts/test-no-private-data.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const scriptsDir = new URL("./", import.meta.url);
const SELF = "test-no-private-data.mjs";
// 本测试代码里唯一允许出现该字面量的一行（自扫时的豁免入口）。
const PRIVATE_DIR = "private-data";
const MASK = "§";

// 扫描范围：统一入口 + 全部 test-*.mjs（含本测试），只读源码文本。
const TARGETS = [
  "check.mjs",
  ...readdirSync(fileURLToPath(scriptsDir), { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^test-.*\.mjs$/.test(entry.name))
    .map((entry) => entry.name)
    .sort(),
];

/** 既有守卫的整行豁免表：代码行去缩进、私密目录字面量替换为 MASK 后登记。
 * 登记外的任何代码行出现该字面量即红——新增豁免等于明示「我知道这行在引用私密目录」。 */
const EXEMPT = {
  // check.mjs 的显式开关：带 --private-data 才挂私密数据，失败回落示例数据。
  // 清单行是本测试文件名，文件名本身含该子串，不是路径引用。
  "check.mjs": [
    'if (process.argv.includes("--§")) {',
    'await import("../§/thoughts.js");',
    'await import("../§/flomo.js");',
    'console.warn("note: § 不可用，使用示例数据 —", error.message);',
    '"test-no-§.mjs",',
  ],
  // 既有守卫：index.html 的私密数据只能走门卫的 ./ 相对路径。
  "test-html-chrome.mjs": [
    'test("§ 只能经门卫的 ./ 相对路径加载，无未登录可直拉的 src", () => {',
    'const offenders = scriptSrcs.filter((src) => src.includes("§") && !src.startsWith("./"));',
    'assert.deepEqual(offenders, [], `§ src 必须以 ./ 开头走门卫：${offenders.join(", ")}`);',
    'for (const path of ["./§/flomo.js", "./§/thoughts.js", "./§/lessons.js"]) {',
  ],
  // 既有守卫：.gitignore 必须保留私密目录的忽略规则。
  "test-gitignore.mjs": [
    'test("仍忽略 §/", () => {',
    'assert.ok(hasRule("§/", "§"), "缺少独立规则 §/ —— 私密数据可能入库");',
  ],
  // 自身：字面量只出现在常量定义与文件名（文件名本身含该子串）两行。
  [SELF]: ['const SELF = "test-no-§.mjs";', 'const PRIVATE_DIR = "§";'],
};

const readScript = (file) => readFileSync(new URL(file, scriptsDir), "utf8");
const mask = (line) => line.split(PRIVATE_DIR).join(MASK);

/** 块注释在同一行结束后，后面是否还拖着代码。 */
function codeAfterBlockEnd(line) {
  const end = line.indexOf("*/");
  return end >= 0 && line.slice(end + 2).trim() !== "";
}

/** 按行分类：整行 //、块注释（含 * 续行）算注释行；注释结束后同一行还有
 * 代码的按代码行算（宁严勿漏）。字符串里的分隔符不在行首，天然不受影响。 */
function classifyLines(source) {
  let inBlock = false;
  return source.split(/\r?\n/).map((raw) => {
    const line = raw.trim();
    let isComment = false;
    if (inBlock) {
      isComment = !codeAfterBlockEnd(line);
      if (line.includes("*/")) inBlock = false;
    } else if (line.startsWith("//")) {
      isComment = true;
    } else if (line.startsWith("/*")) {
      isComment = !codeAfterBlockEnd(line);
      if (!line.includes("*/")) inBlock = true;
    } else if (line.startsWith("*")) {
      isComment = true; // 块注释续行
    }
    return { line, isComment };
  });
}

test("扫描范围覆盖 check.mjs 与全部 test-*.mjs（含自身）", () => {
  assert.ok(TARGETS.includes("check.mjs"), "统一入口 check.mjs 必须在扫描范围内");
  assert.ok(TARGETS.includes(SELF), "本测试必须扫描自身");
  assert.ok(TARGETS.slice(1).every((file) => /^test-.*\.mjs$/.test(file)), "除 check.mjs 外只能扫 test-*.mjs");
});

test("注释行分类：整行注释算注释，注释后带代码与字符串内分隔符不算", () => {
  const rows = classifyLines(
    [
      'const url = "https://example.com";',
      "// 说明：不读私密目录",
      "/* 头部说明",
      "块注释续行",
      "*/ const x = 1;",
      " * 续行",
      "/* note */ code();",
      'const a = "/* in string */";',
    ].join("\n")
  );
  assert.deepEqual(
    rows.map((row) => row.isComment),
    [false, true, true, true, false, true, false, false]
  );
});

test("非注释代码不得出现私密目录路径字面量", () => {
  const offenders = [];
  for (const file of TARGETS) {
    classifyLines(readScript(file)).forEach(({ line, isComment }, index) => {
      if (!isComment && line.includes(PRIVATE_DIR) && !EXEMPT[file]?.includes(mask(line))) {
        offenders.push(`${file}:${index + 1} ${line}`);
      }
    });
  }
  assert.deepEqual(
    offenders,
    [],
    ["出现未豁免的私密目录引用（说明请写整行注释，豁免请登记 EXEMPT）：", ...offenders].join("\n")
  );
});

test("豁免表逐行仍然有效，无过期条目", () => {
  const stale = [];
  for (const [file, entries] of Object.entries(EXEMPT)) {
    const present = new Set(
      classifyLines(readScript(file))
        .filter(({ line, isComment }) => !isComment && line.includes(PRIVATE_DIR))
        .map(({ line }) => mask(line))
    );
    for (const entry of entries) {
      if (!present.has(entry)) stale.push(`${file}: ${entry}`);
    }
  }
  assert.deepEqual(stale, [], ["豁免表里有当前源码已不存在的行，请清理：", ...stale].join("\n"));
});
