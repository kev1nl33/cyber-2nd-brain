#!/usr/bin/env node
/** 曲线几何与动画接线的离线回归测试，不读取私有数据。 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as curves from "../src/scene.js";

const a = { screen: { x: 30, y: 50 }, radius: 20 };
const b = { screen: { x: 430, y: 210 }, radius: 30 };
const scene = readFileSync(new URL("../src/scene.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

function curve(from = a, to = b, kind = "source") {
  assert.equal(typeof curves.edgePath, "function", "曲线几何应可独立测试");
  return curves.edgePath(from, to, kind);
}
function points(path) {
  return path.match(/-?\d+(?:\.\d+)?/g).map(Number);
}

test("所有图谱边类型使用真正弯曲的二次贝塞尔", () => {
  for (const kind of ["core-theme", "theme-idea", "recorded", "source", "inferred", "conclusion"]) {
    const d = curve(a, b, kind);
    assert.match(d.path, /^M .* Q /);
    assert.doesNotMatch(d.path, / L /);
    const [x0, y0, cx, cy, x1, y1] = points(d.path);
    assert.ok(Math.abs((cx - x0) * (y1 - y0) - (cy - y0) * (x1 - x0)) > 1);
  }
});
test("起止点贴合节点锚点半径并保留原有间距", () => {
  const [x0, y0, , , x1, y1] = points(curve().path);
  assert.ok(Math.abs(Math.hypot(x0 - a.screen.x, y0 - a.screen.y) - 25) < 0.1);
  assert.ok(Math.abs(Math.hypot(x1 - b.screen.x, y1 - b.screen.y) - 35) < 0.1);
});
test("同一输入反复计算得到一致路径，且不修改输入", () => {
  const before = structuredClone({ a, b });
  const first = curve();
  for (let i = 0; i < 100; i++) assert.deepEqual(curve(), first);
  assert.deepEqual({ a, b }, before);
});
test("标签中点位于曲线上，弯曲幅度不超过弦长的百分之四", () => {
  const d = curve();
  const [x0, y0, cx, cy, x1, y1] = points(d.path);
  assert.ok(Math.abs(d.mid.x - (x0 + 2 * cx + x1) / 4) < 0.1);
  assert.ok(Math.abs(d.mid.y - (y0 + 2 * cy + y1) / 4) < 0.1);
  assert.ok(Math.hypot(d.mid.x - (x0 + x1) / 2, d.mid.y - (y0 + y1) / 2) <= Math.hypot(x1 - x0, y1 - y0) * 0.041);
});
test("相邻扇出边同向弯曲，避免随机相向挤压", () => {
  for (const y of [150, 170, 190]) {
    const [x0, y0, cx, cy, x1, y1] = points(curve(a, { ...b, screen: { x: 430, y } }).path);
    assert.ok((x1 - x0) * (cy - y0) - (y1 - y0) * (cx - x0) > 0);
  }
});
test("节点重合或间距小于半径时路径有限、不反向", () => {
  for (const x of [30, 31, 50]) {
    const d = curve(a, { screen: { x, y: 50 }, radius: 30 });
    assert.doesNotMatch(d.path, /NaN|Infinity/);
    const [x0, , , , x1] = points(d.path);
    assert.ok(x1 >= x0);
  }
});
test("流光与生长遮罩共用曲线，每帧生长时重新测量实际长度", () => {
  assert.match(scene, /view\.flow\.setAttribute\("d", d\.path\)/);
  assert.match(scene, /view\.reveal\.setAttribute\("d", d\.path\)/);
  assert.doesNotMatch(scene, /is-growing"\) && !view\.line\.style\.getPropertyValue/);
  assert.match(scene, /getTotalLength/);
  assert.match(css, /\.edge\.is-growing \.edge-reveal\s*\{[^}]*stroke-dasharray:\s*var\(--edge-length/);
  assert.match(css, /\.edge-reveal\s*\{[^}]*stroke-linecap:\s*butt/);
  assert.match(css, /\.edge\.is-growing \.edge-strokes\s*\{[^}]*mask:\s*var\(--edge-mask\)/);
});
