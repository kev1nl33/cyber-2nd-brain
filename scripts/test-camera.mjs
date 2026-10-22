#!/usr/bin/env node
/** 相机纯函数测试：fit / zoom / pan、屏幕与世界坐标互逆、缓动与瞬间跳转。
 * 运行：node scripts/test-camera.mjs。 */
import test from "node:test";
import assert from "node:assert/strict";
import { createCamera } from "../src/camera.js";

const MIN_SCALE = 0.16;
const MAX_SCALE = 2.6;
const AREA = { width: 1000, height: 800, insets: { top: 40, right: 20, bottom: 60, left: 20 } };

function camera() {
  const cam = createCamera();
  cam.setArea(AREA);
  return cam;
}

const focus = { minX: -100, maxX: 100, minY: -80, maxY: 80, cx: 0, cy: 0 };
const full = { minX: -400, maxX: 400, minY: -300, maxY: 300, cx: 10, cy: -10 };

function approx(actual, expected, eps = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= eps, `${actual} ≉ ${expected}`);
}

test("初始状态：原点、单位缩放、未被用户改过", () => {
  const cam = createCamera();
  assert.deepEqual({ ...cam.current }, { x: 0, y: 0, scale: 1 });
  assert.equal(cam.userAdjusted, false);
});

test("setArea：扣除 insets 后的可用区，最小边长 80，中心落在剩余矩形正中", () => {
  const cam = camera();
  assert.deepEqual(cam.area, { width: 960, height: 700, ox: 500, oy: 390 });

  const tiny = createCamera();
  tiny.setArea({ width: 40, height: 30, insets: { top: 0, right: 0, bottom: 0, left: 0 } });
  assert.deepEqual(tiny.area, { width: 80, height: 80, ox: 20, oy: 15 });
});

test("fit：对准焦点中心，缩放夹在焦点与全图之间且不低于 minRatio", () => {
  const cam = camera();
  const target = cam.fit(focus, full);
  assert.deepEqual({ x: target.x, y: target.y }, { x: 0, y: 0 });
  // 与 scaleAround 同一公式：半宽半高至少为 1，取宽高两个方向里更紧的那个。
  const fitScale = (box, center) => {
    const hx = Math.max(box.maxX - center.x, center.x - box.minX, 1);
    const hy = Math.max(box.maxY - center.y, center.y - box.minY, 1);
    return Math.min(960 / (2 * hx), 700 / (2 * hy));
  };
  const center = { x: 0, y: 0 };
  const clamp = (s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
  const sFocus = clamp(fitScale(focus, center)); // 4.375 被夹到 MAX_SCALE
  const sFull = clamp(fitScale(full, center)); // 700/600 ≈ 1.1667
  // minRatio 作用在夹紧之后：sFull 低于 sFocus*0.72，结果被抬到 2.6*0.72
  assert.ok(sFull < sFocus * 0.72, "这组数据应落到 minRatio 抬升分支");
  approx(target.scale, clamp(Math.min(sFocus, Math.max(sFull, sFocus * 0.72))));
  assert.ok(target.scale >= MIN_SCALE && target.scale <= MAX_SCALE);
  assert.equal(cam.userAdjusted, false);
});

test("fit：anchor 按权重把中心从焦点拉向锚点", () => {
  const cam = camera();
  const target = cam.fit(focus, full, { anchor: { x: 200, y: -100 }, anchorWeight: 0.25 });
  approx(target.x, 50);
  approx(target.y, -25);
});

test("fit：盒子小到超出上限时夹在 MAX_SCALE，大到超出下限时夹在 MIN_SCALE", () => {
  const cam = camera();
  const tiny = { minX: -1, maxX: 1, minY: -1, maxY: 1, cx: 0, cy: 0 };
  assert.equal(cam.fit(tiny, tiny).scale, MAX_SCALE);

  const huge = { minX: -100000, maxX: 100000, minY: -100000, maxY: 100000, cx: 0, cy: 0 };
  assert.equal(cam.fit(huge, huge).scale, MIN_SCALE);
});

test("toScreen 与 toWorld 互为逆运算，且尊重传入的 from", () => {
  const cam = camera();
  cam.fit(focus, full);
  cam.snap();
  const world = { x: 37.5, y: -12 };
  const screen = cam.toScreen(world);
  const back = cam.toWorld(screen);
  approx(back.x, world.x);
  approx(back.y, world.y);

  const from = { x: 10, y: 20, scale: 2 };
  const via = cam.toWorld(cam.toScreen(world, from), from);
  approx(via.x, world.x);
  approx(via.y, world.y);
});

test("zoomBy：锚点下的世界坐标保持不动，并标记为用户调整", () => {
  const cam = camera();
  cam.snap();
  const anchor = { x: 620, y: 250 };
  const before = cam.toWorld(anchor);
  cam.zoomBy(2, anchor);
  cam.snap();
  const after = cam.toWorld(anchor);
  approx(after.x, before.x, 1e-6);
  approx(after.y, before.y, 1e-6);
  approx(cam.current.scale, 2);
  assert.equal(cam.userAdjusted, true);
});

test("zoomBy：无锚点只改缩放；连续放大缩小被夹在 [MIN_SCALE, MAX_SCALE]", () => {
  const cam = camera();
  const { x, y } = cam.current;
  cam.zoomBy(1.5);
  cam.snap();
  assert.equal(cam.current.x, x);
  assert.equal(cam.current.y, y);

  cam.zoomBy(1000);
  cam.snap();
  assert.equal(cam.current.scale, MAX_SCALE);
  cam.zoomBy(1e-9);
  cam.snap();
  assert.equal(cam.current.scale, MIN_SCALE);
});

test("panBy：屏幕位移换算成世界位移，current 与 target 一起动", () => {
  const cam = camera();
  cam.zoomBy(2);
  cam.snap();
  cam.panBy(40, -20);
  approx(cam.current.x, -20);
  approx(cam.current.y, 10);
  assert.equal(cam.userAdjusted, true);
  // 平移后仍在目标上，step 不应再报移动
  assert.equal(cam.step(1), false);
});

test("reset：只清用户调整标记，不改目标", () => {
  const cam = camera();
  cam.zoomBy(2);
  cam.reset();
  assert.equal(cam.userAdjusted, false);
  cam.snap();
  approx(cam.current.scale, 2);
});

test("step：指数缓动单调逼近目标，到位后咬合且返回 false", () => {
  const cam = camera();
  cam.fit(focus, full);
  let guard = 0;
  let moving = true;
  let prev = Infinity;
  while (moving && guard++ < 10000) {
    const gap = Math.hypot(cam.current.x, cam.current.y);
    assert.ok(gap <= prev + 1e-9, "缓动应单调接近");
    prev = gap;
    moving = cam.step(1 / 60);
  }
  assert.equal(moving, false);
  assert.equal(cam.current.x, 0);
  assert.equal(cam.current.scale, cam.fit(focus, full).scale);
});

test("setInstant：step 一次到位并不再移动；snap 同步当前值", () => {
  const cam = camera();
  cam.setInstant(1);
  cam.fit(focus, full);
  assert.equal(cam.step(0), false);
  assert.equal(cam.current.x, 0);
  assert.ok(cam.current.scale > 1);

  const other = camera();
  other.setInstant(0);
  other.zoomBy(2);
  assert.equal(other.current.scale, 1); // 尚未缓动
  other.snap();
  assert.equal(other.current.scale, 2);
});
