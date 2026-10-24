#!/usr/bin/env node
/** 非脑节点字形测试：idea / step / conclusion / source 的 SVG 结构与确定性。
 * 运行：node scripts/test-glyphs.mjs。 */
import test from "node:test";
import assert from "node:assert/strict";
import { activityArc, ideaGlyph, stepGlyph, conclusionGlyph, sourceGlyph } from "../src/glyphs.js";

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

test("idea fingerprint encodes exact steps, sources and conclusion", () => {
  for (const n of [0, 1, 2, 5, 12]) {
    const svg = ideaGlyph({ seed: 3, steps: n, sources: 20, conclusion: "confirmed", fresh: true });
    assert.equal([...svg.matchAll(/class="glyph-ring(?: |")/g)].length, n);
    assert.equal([...svg.matchAll(/class="glyph-spike"/g)].length, 9);
    assert.equal(svg.includes("glyph-ring--warm"), n > 0);
    assert.equal(svg.includes("glyph-ring--pending"), false);
    const pending = ideaGlyph({ seed: 3, steps: n, sources: 20, conclusion: "unconfirmed" });
    assert.equal(pending.includes("glyph-ring--pending"), n > 0);
    assert.match(svg, /glyph-fresh/);
    assert.equal(/NaN|Infinity/.test(svg), false);
  }
  assert.match(ideaGlyph({ steps: 2, conclusion: "unconfirmed" }), /glyph-ring--pending/);
  assert.notEqual(ideaGlyph({ seed: 0, sources: 2 }), ideaGlyph({ seed: 3, sources: 2 }));
  for (const options of [{}, { steps: NaN, sources: NaN, seed: NaN }, { steps: -2 }]) {
    const svg = ideaGlyph(options);
    assert.equal(/NaN|Infinity/.test(svg), false);
    assert.equal(svg.includes('class="glyph-ring'), false);
  }
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

test("activityArc：比例转弧，0 或非法比例不画", () => {
  assert.equal(activityArc(0), "");
  assert.equal(activityArc(-0.5), "");
  assert.equal(activityArc(NaN), "");
  assert.equal(activityArc(2), activityArc(1));
  assert.match(activityArc(0.5), /class="glyph-arc"/);
  assert.match(activityArc(1), /A 94 94 0 1 1/); // ratio=1 画满整圈，large-arc=1
});
