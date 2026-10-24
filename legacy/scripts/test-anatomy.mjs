#!/usr/bin/env node
/** 脑图 SVG 生成测试：brainArt 的确定性、细节档位与输出结构。
 * 运行：node scripts/test-anatomy.mjs。不测未导出的内部函数。 */
import test from "node:test";
import assert from "node:assert/strict";
import { brainArt } from "../src/anatomy.js";

const DETAILS = ["core", "focus", "theme", "distant"];
const LAYER = /brain-layer--(far|fibres|gyri|shell|dots)/g;

function count(svg, re) {
  return svg.match(re)?.length ?? 0;
}

function layersOf(svg) {
  return [...svg.matchAll(LAYER)].map((m) => m[1]);
}

function numbersIn(svg) {
  return [...svg.matchAll(/-?\d+(?:\.\d+)?/g)].map(Number);
}

test("brainArt：同 seed 同 detail 完全确定，不同 seed 不同图，不同 detail 也不同图", () => {
  const a = brainArt({ seed: "dev-wish", detail: "core" });
  assert.equal(brainArt({ seed: "dev-wish", detail: "core" }), a);
  assert.notEqual(brainArt({ seed: "other", detail: "core" }), a);
  assert.notEqual(brainArt({ seed: "dev-wish", detail: "theme" }), a);
});

test("brainArt：默认 detail 是 theme，未知 detail 回退到 theme", () => {
  const theme = brainArt({ seed: "s" });
  assert.equal(brainArt({ seed: "s", detail: "theme" }), theme);
  assert.equal(brainArt({ seed: "s", detail: "nope" }), theme);
});

test("brainArt：四档都有轮廓、裂隙、回、沟、纤维与结点，且层次序固定", () => {
  for (const detail of DETAILS) {
    const svg = brainArt({ seed: `seed-${detail}`, detail });
    assert.ok(count(svg, /class="brain-contour"/g) === 1, `${detail} 应有且仅有一条轮廓`);
    assert.ok(count(svg, /class="brain-fissure"/g) >= 1, `${detail} 缺裂隙`);
    assert.ok(count(svg, /class="brain-gyrus"/g) >= 1, `${detail} 缺回`);
    assert.ok(count(svg, /class="brain-sulcus"/g) >= 1, `${detail} 缺沟`);
    assert.ok(count(svg, /class="brain-fibre"/g) >= 1, `${detail} 缺纤维`);
    assert.ok(count(svg, /class="brain-junction"/g) >= 1, `${detail} 缺结点`);
    assert.deepEqual(
      layersOf(svg).filter((name, i, all) => all.indexOf(name) === i),
      detail === "core" || detail === "focus"
        ? ["far", "fibres", "gyri", "shell", "dots"]
        : ["fibres", "gyri", "shell", "dots"],
      `${detail} 层次序不对`
    );
  }
});

test("brainArt：细节越密、纤维与脉冲越多，distant 没有脉冲也没有远景层", () => {
  const art = Object.fromEntries(DETAILS.map((d) => [d, brainArt({ seed: "density", detail: d })]));
  const fibres = (d) => count(art[d], /class="brain-fibre"/g);
  const pulses = (d) => count(art[d], /class="brain-pulse"/g);
  assert.ok(fibres("core") > fibres("focus"));
  assert.ok(fibres("focus") > fibres("theme"));
  assert.ok(fibres("theme") > fibres("distant"));
  assert.equal(fibres("core"), 20);
  assert.equal(fibres("focus"), 15);
  assert.equal(fibres("theme"), 7);
  assert.equal(fibres("distant"), 3);
  assert.ok(pulses("core") > pulses("focus") && pulses("focus") > pulses("theme"));
  assert.equal(pulses("distant"), 0);
  assert.equal(count(art.theme, /brain-layer--far/g), 0);
  assert.equal(count(art.distant, /brain-layer--far/g), 0);
  assert.ok(count(art.core, /brain-layer--far/g) === 1);
});

test("brainArt：轮廓是闭合路径，其余曲线不闭合，脉冲复用对应纤维的 d", () => {
  const svg = brainArt({ seed: "closed", detail: "core" });
  const contour = svg.match(/class="brain-contour" d="([^"]+)"/)[1];
  assert.ok(contour.startsWith("M ") && contour.endsWith(" Z"), contour.slice(-8));
  for (const cls of ["brain-fissure", "brain-gyrus", "brain-sulcus", "brain-fibre"]) {
    for (const d of svg.matchAll(new RegExp(`class="${cls}" d="([^"]+)"`, "g"))) {
      assert.ok(!d[1].endsWith(" Z"), `${cls} 不应闭合: ${d[1].slice(-12)}`);
    }
  }
  const fibreD = [...svg.matchAll(/class="brain-fibre" d="([^"]+)"/g)].map((m) => m[1]);
  for (const d of svg.matchAll(/class="brain-pulse" d="([^"]+)"/g)) {
    assert.ok(fibreD.includes(d[1]), "脉冲应复用某条纤维的路径");
  }
});

test("brainArt：坐标落在 viewBox 内，圆半径为正，脉冲带 pathLength 与动画延迟", () => {
  const svg = brainArt({ seed: "bounds", detail: "core" });
  for (const n of numbersIn(svg)) {
    assert.ok(Math.abs(n) <= 110, `坐标越出 viewBox: ${n}`);
  }
  for (const r of svg.matchAll(/\br="([^"]+)"/g)) {
    assert.ok(Number(r[1]) > 0, `半径应为正: ${r[1]}`);
  }
  const pulses = [...svg.matchAll(/class="brain-pulse"[^/]*\/>/g)].map((m) => m[0]);
  assert.ok(pulses.length > 0);
  for (const tag of pulses) {
    assert.match(tag, /pathLength="100"/);
    const delay = Number(tag.match(/animation-delay:([\d.]+)s/)[1]);
    assert.ok(delay >= 0 && delay <= 3.5, `delay ${delay} 越出 [0, 3.5]`);
  }
});

test("brainArt：空层不会产出空 <g>，输出只含 path、circle、g", () => {
  for (const seed of ["", "a", "中文种子", "x".repeat(200)]) {
    const svg = brainArt({ seed, detail: "core" });
    assert.equal(svg.includes("<g class="), true);
    assert.equal(/<g class="[^"]+"><\/g>/.test(svg), false, `空组: ${seed}`);
    assert.equal(/<(?!\/?(?:path|circle|g)\b)[a-z]/.test(svg), false);
  }
});
