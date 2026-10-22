#!/usr/bin/env node
/** 非脑节点字形测试：idea / step / conclusion / source 的 SVG 结构与确定性。
 * 运行：node scripts/test-glyphs.mjs。 */
import test from "node:test";
import assert from "node:assert/strict";
import { ideaGlyph, stepGlyph, conclusionGlyph, sourceGlyph } from "../src/glyphs.js";

function coords(svg) {
  return [...svg.matchAll(/-?\d+(?:\.\d+)?/g)].map(Number);
}

function classes(svg) {
  return [...svg.matchAll(/class="([^"]+)"/g)].map((m) => m[1]);
}

test("每个字形都以光晕开头，且只含 path 与 circle", () => {
  const svgs = [
    ideaGlyph(),
    stepGlyph("thought"),
    stepGlyph("action"),
    stepGlyph("input"),
    stepGlyph("experience"),
    conclusionGlyph(),
    sourceGlyph(),
  ];
  for (const svg of svgs) {
    assert.ok(svg.startsWith('<circle class="glyph-halo" cx="0" cy="0" r="86" />'), svg.slice(0, 60));
    assert.equal(/<(?!\/?(?:path|circle|rect)\b)[a-z]/.test(svg), false, svg);
    for (const n of coords(svg)) {
      assert.ok(Math.abs(n) <= 110, `越出共享 viewBox: ${n} in ${svg.slice(0, 40)}`);
    }
  }
});

test("ideaGlyph：默认 seed 0，同 seed 确定，seed 改变尖刺角度与长度", () => {
  assert.equal(ideaGlyph(), ideaGlyph(0));
  const a = ideaGlyph(0);
  const b = ideaGlyph(3);
  assert.notEqual(a, b);
  assert.equal([...a.matchAll(/class="glyph-spike"/g)].length, 7);
  assert.equal([...b.matchAll(/class="glyph-spike"/g)].length, 7);
  // 尖刺根部在半径 62 的圆上：首段 M 的坐标模长应为 62
  const start = a.match(/glyph-spike"[^d]*d="M (-?\d+\.?\d*) (-?\d+\.?\d*)/) ;
  const x = Number(start[1]);
  const y = Number(start[2]);
  assert.ok(Math.abs(Math.hypot(x, y) - 62) < 0.2, `尖刺根部半径 ${Math.hypot(x, y)}`);
  assert.ok(a.includes('class="glyph-core"') && a.includes('class="glyph-pupil"'));
  assert.equal([...a.matchAll(/class="glyph-ring"/g)].length, 2);
});

test("ideaGlyph：seed 按 7 取模，差 7 的种子尖刺角度相同但长度不同", () => {
  const angle = (svg) => {
    const m = svg.match(/d="M (-?\d+\.?\d*) (-?\d+\.?\d*)/);
    return Math.atan2(Number(m[2]), Number(m[1]));
  };
  const first = ideaGlyph(2);
  const shifted = ideaGlyph(9);
  assert.ok(Math.abs(angle(first) - angle(shifted)) < 1e-9);
  assert.notEqual(first, shifted);
});

test("stepGlyph：family 决定形状，未知 family 退回圆形", () => {
  const thought = stepGlyph("thought");
  assert.equal(stepGlyph("whatever"), thought);
  assert.match(thought, /<circle class="glyph-shape" cx="0" cy="0" r="56" \/>/);

  assert.match(stepGlyph("action"), /<rect class="glyph-shape" x="-52" y="-52" width="104" height="104" rx="18" \/>/);
  assert.match(stepGlyph("input"), /d="M0,-66 L66,0 L0,66 L-66,0 Z"/);

  const exp = stepGlyph("experience");
  const hex = exp.match(/d="(M[^"]+Z)"/)[1];
  const pts = hex.slice(1, -2).split(" L").map((p) => p.split(",").map(Number));
  assert.equal(pts.length, 6);
  for (const [x, y] of pts) {
    assert.ok(Math.abs(Math.hypot(x, y) - 62) < 0.2, `(${x},${y}) 不在半径 62`);
  }
  // 起始角 -90° → 第一个顶点在正上方
  assert.ok(Math.abs(pts[0][0]) < 0.2 && pts[0][1] < 0);

  for (const family of ["thought", "action", "input", "experience"]) {
    assert.equal([...stepGlyph(family).matchAll(/class="glyph-pupil"/g)].length, 1);
  }
});

test("conclusionGlyph：暖色菱形、两侧括号、暖色瞳孔，且完全确定", () => {
  const svg = conclusionGlyph();
  assert.equal(conclusionGlyph(), svg);
  assert.deepEqual(classes(svg), [
    "glyph-halo",
    "glyph-shape glyph-shape--warm",
    "glyph-bracket",
    "glyph-bracket",
    "glyph-pupil glyph-pupil--warm",
  ]);
  assert.match(svg, /d="M0,-58 L58,0 L0,58 L-58,0 Z"/);
  assert.match(svg, /d="M-78,-30 L-78,30"/);
  assert.match(svg, /d="M78,-30 L78,30"/);
});

test("sourceGlyph：冷色文档折角与两条不等长横线", () => {
  const svg = sourceGlyph();
  assert.equal(sourceGlyph(), svg);
  assert.ok(classes(svg).includes("glyph-shape glyph-shape--cool"));
  assert.match(svg, /d="M-44,-62 L22,-62 L48,-34 L48,62 L-44,62 Z"/);
  assert.match(svg, /class="glyph-fold" d="M22,-62 L22,-34 L48,-34"/);
  const rules = [...svg.matchAll(/class="glyph-rule" d="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(rules, ["M-26,-6 L30,-6", "M-26,20 L16,20"]);
});
