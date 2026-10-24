#!/usr/bin/env node
/** 确定性伪随机工具测试：hashString(FNV-1a) / mulberry32 / makeRng / range / intRange。
 * 运行：node scripts/test-random.mjs。 */
import test from "node:test";
import assert from "node:assert/strict";
import { hashString, mulberry32, makeRng, range, intRange } from "../src/random.js";

test("hashString：FNV-1a 32-bit 标准测试向量", () => {
  assert.equal(hashString(""), 0x811c9dc5); // 偏移基底
  assert.equal(hashString("a"), 0xe40c292c);
  assert.equal(hashString("foobar"), 0xbf9cf968);
});

test("hashString：确定性、uint32 范围、区分不同输入", () => {
  assert.equal(hashString("step:develop/wish"), hashString("step:develop/wish"));
  assert.notEqual(hashString("a"), hashString("b"));
  for (const s of ["中文", "sample-chat-1", "\u0000\u001f", "x".repeat(1000)]) {
    const h = hashString(s);
    assert.ok(Number.isInteger(h) && h >= 0 && h < 2 ** 32, `${JSON.stringify(s)} → ${h} 应在 uint32 范围`);
  }
  assert.notEqual(hashString("中文"), hashString("中文2"));
});

test("mulberry32：同种子序列一致，输出落在 [0, 1)", () => {
  const seq = (seed, n) => Array.from({ length: n }, mulberry32(seed));
  assert.deepEqual(seq(42, 100), seq(42, 100));
  const rng = mulberry32(42);
  for (let i = 0; i < 1000; i++) {
    const v = rng();
    assert.ok(v >= 0 && v < 1, `第 ${i} 个输出越界: ${v}`);
  }
});

test("mulberry32：不同种子得到不同序列", () => {
  assert.notEqual(mulberry32(1)(), mulberry32(2)());
});

test("makeRng：等价于 mulberry32(hashString(seed))，种子强转字符串", () => {
  assert.equal(makeRng("dev-wish")(), mulberry32(hashString("dev-wish"))());
  assert.equal(makeRng(42)(), mulberry32(hashString("42"))());
  const a = makeRng("same");
  const b = makeRng("same");
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
});

test("range：端点、中点与退化区间", () => {
  assert.equal(range(() => 0, 10, 20), 10);
  assert.equal(range(() => 1, 10, 20), 20);
  assert.equal(range(() => 0.5, 10, 20), 15);
  assert.equal(range(() => 0.5, 7, 7), 7); // min === max
});

test("intRange：始终落在闭区间内，且两端都能取到", () => {
  assert.equal(intRange(() => 0, 2, 5), 2); // rng=0 → min
  assert.equal(intRange(() => 1, 2, 5), 5); // rng=1 → max（1-ε 截断后仍取到端点）
  assert.equal(intRange(() => 0.999, 2, 5), 5);
  const rng = mulberry32(7);
  for (let i = 0; i < 1000; i++) {
    const v = intRange(rng, -5, 5);
    assert.ok(Number.isInteger(v) && v >= -5 && v <= 5, `第 ${i} 次越界: ${v}`);
  }
  assert.equal(intRange(mulberry32(9), 3, 3), 3); // 退化区间恒为常数
});
