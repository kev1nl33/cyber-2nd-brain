#!/usr/bin/env node
/** 路由纯函数测试：parseHash / buildHash / backOneLevel / routeEquals。
 * 运行：node scripts/test-route.mjs（零依赖，仅 node:test + node:assert）。 */
import test from "node:test";
import assert from "node:assert/strict";
import { parseHash, buildHash, backOneLevel, routeEquals } from "../src/route.js";

test("parseHash：根路径与空输入都回到总览", () => {
  assert.deepEqual(parseHash("#/"), { level: "overview" });
  assert.deepEqual(parseHash("#"), { level: "overview" });
  assert.deepEqual(parseHash(""), { level: "overview" });
  assert.deepEqual(parseHash(null), { level: "overview" });
});

test("parseHash：主题 / 问题 / 步骤三级路径", () => {
  assert.deepEqual(parseHash("#/develop"), { level: "theme", themeId: "develop" });
  assert.deepEqual(parseHash("develop"), { level: "theme", themeId: "develop" }); // 无 # 也接受
  assert.deepEqual(parseHash("/develop"), { level: "theme", themeId: "develop" }); // 容忍前导 /
  assert.deepEqual(parseHash("#/develop/brain"), { level: "idea", themeId: "develop", ideaId: "brain" });
  assert.deepEqual(parseHash("#/develop/brain/wish"), {
    level: "step",
    themeId: "develop",
    ideaId: "brain",
    stepId: "wish",
    sourcesExpanded: false,
  });
});

test("parseHash：来源路径、残缺来源与多余片段", () => {
  assert.deepEqual(parseHash("#/t/i/s/source/r1"), {
    level: "step",
    themeId: "t",
    ideaId: "i",
    stepId: "s",
    sourceId: "r1",
    sourcesExpanded: true,
  });
  // source 后面没有 id：当作普通步骤，不展开来源
  assert.deepEqual(parseHash("#/t/i/s/source"), {
    level: "step",
    themeId: "t",
    ideaId: "i",
    stepId: "s",
    sourcesExpanded: false,
  });
  // 多余片段被忽略，仍定位到来源
  assert.equal(parseHash("#/t/i/s/source/r1/extra").sourceId, "r1");
  // 第 4 段不是 source：当作普通步骤
  assert.equal(parseHash("#/t/i/s/junk").sourcesExpanded, false);
});

test("parseHash：空片段被过滤", () => {
  assert.deepEqual(parseHash("#/t//i"), { level: "idea", themeId: "t", ideaId: "i" });
});

test("buildHash：各层级状态还原为 hash", () => {
  assert.equal(buildHash(null), "#/");
  assert.equal(buildHash({ level: "overview" }), "#/");
  assert.equal(buildHash({ level: "theme", themeId: "t" }), "#/t");
  assert.equal(buildHash({ level: "idea", themeId: "t", ideaId: "i" }), "#/t/i");
  assert.equal(buildHash({ level: "step", themeId: "t", ideaId: "i", stepId: "s" }), "#/t/i/s");
  assert.equal(
    buildHash({ level: "step", themeId: "t", ideaId: "i", stepId: "s", sourceId: "r" }),
    "#/t/i/s/source/r"
  );
});

test("buildHash：缺关键字段时回退到总览", () => {
  assert.equal(buildHash({ level: "step", themeId: "t", ideaId: "i" }), "#/"); // 无 stepId
  assert.equal(buildHash({ level: "unknown" }), "#/");
});

test("hash ⇄ 状态往返一致", () => {
  const hashes = ["#/", "#/develop", "#/develop/brain", "#/develop/brain/wish", "#/develop/brain/wish/source/r1"];
  for (const h of hashes) {
    assert.equal(buildHash(parseHash(h)), h, `roundtrip ${h}`);
  }
});

test("backOneLevel：来源 → 步骤 → 问题 → 主题 → 总览逐级返回", () => {
  const fromSource = backOneLevel(parseHash("#/t/i/s/source/r1"));
  assert.equal(fromSource.level, "step");
  assert.equal(fromSource.stepId, "s");
  assert.equal(fromSource.sourceId, undefined);
  assert.equal(backOneLevel(parseHash("#/t/i/s")).level, "idea");
  assert.equal(backOneLevel(parseHash("#/t/i")).level, "theme");
  assert.deepEqual(backOneLevel(parseHash("#/t")), { level: "overview" });
  assert.deepEqual(backOneLevel(parseHash("#/")), { level: "overview" });
  assert.deepEqual(backOneLevel({}), { level: "overview" }); // 空状态
});

test("routeEquals：五个定位键全同才相等", () => {
  const a = parseHash("#/t/i/s/source/r");
  assert.ok(routeEquals(a, parseHash("#/t/i/s/source/r")));
  assert.ok(!routeEquals(a, parseHash("#/t/i/s"))); // 少了来源
  assert.ok(!routeEquals(a, parseHash("#/t/i/s/source/r2"))); // 来源不同
  assert.ok(!routeEquals({ level: "theme", themeId: "t" }, { level: "idea", themeId: "t", ideaId: "i" }));
  assert.ok(routeEquals({ level: "overview" }, { level: "overview" })); // 两边都缺 id
});
