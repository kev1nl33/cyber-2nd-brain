#!/usr/bin/env node
/**
 * 今日一星的纯函数检查：同一天稳定、不同天会换、星表为空时不选。
 * 另外核对样式：今日一星要比普通经验星更大、带柔和光晕与慢脉动，
 * 减少动效时只留静态光晕，并且不使用任何字符符号。
 * 运行：node scripts/test-daily-star.mjs
 */
import { readFileSync } from "node:fs";
import { localDateKey, pickDailyLesson } from "../src/stars.js";

let failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log("ok:", msg);
  } else {
    console.error("FAIL:", msg);
    failed++;
  }
}

const lessons = [
  { id: "a", text: "先写下当时为什么买" },
  { id: "b", text: "把判断依据留到以后能复查" },
  { id: "c", text: "不确定的关联先标成待确认" },
  { id: "d", text: "一周后回看哪些判断错了" },
  { id: "e", text: "把重复三次的动作交给脚本" },
];

// ------------------------------------------------------------ 本地日期字符串

assert(localDateKey(new Date(2026, 0, 5)) === "2026-01-05", "本地日期补零到 YYYY-MM-DD");
assert(localDateKey(new Date(2026, 11, 31, 23, 59)) === "2026-12-31", "当天最后一分钟仍算当天");

// ------------------------------------------------------------------ 同日稳定

const day = "2026-10-22";
const first = pickDailyLesson(lessons, day);
assert(Boolean(first) && lessons.includes(first), "选中的是星表里的一条经验");
for (let i = 0; i < 50; i++) {
  const again = pickDailyLesson(lessons, day);
  assert(again === first, `同一天第 ${i + 1} 次选择结果一致：${again?.id}`);
  if (again !== first) break;
}

const copy = lessons.map((lesson) => ({ ...lesson }));
assert(
  pickDailyLesson(copy, day)?.id === first.id,
  "相同内容的星表在同一天选出同一条"
);
assert(
  lessons.every((lesson, i) => lesson === lessons[i]) && lessons.length === 5,
  "选择过程不改动星表"
);

// ------------------------------------------------------------------ 不同天可变

const month = Array.from({ length: 30 }, (_, i) =>
  localDateKey(new Date(2026, 9, i + 1))
);
const picks = month.map((dateKey) => pickDailyLesson(lessons, dateKey).id);
assert(new Set(picks).size >= 2, `30 天里至少换过一次（${new Set(picks).size} 种结果）`);
assert(
  month.every((dateKey, i) => pickDailyLesson(lessons, dateKey).id === picks[i]),
  "每一天各自可复现"
);

let differs = 0;
for (let i = 1; i < month.length; i++) {
  if (picks[i] !== picks[i - 1]) differs++;
}
assert(differs > 0, `相邻两天也会换星（换了 ${differs} 次）`);
assert(picks.includes(first.id), "今日的结果同样出现在连续日期的分布里");

// -------------------------------------------------------------------- 空集合

assert(pickDailyLesson([], "2026-10-22") === null, "空星表返回 null");
assert(pickDailyLesson(undefined, "2026-10-22") === null, "星表缺失返回 null");
assert(pickDailyLesson(null, "2026-10-22") === null, "星表为 null 返回 null");

const single = [lessons[0]];
assert(pickDailyLesson(single, "2026-10-22") === single[0], "只有一条经验时每天都选它");

// ------------------------------------------------ 可见度：更大的核心 + 光晕 + 慢脉动

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

/** 取某个选择器的规则块正文，只看声明本身，不把后面的规则算进去。 */
function ruleBody(selector, { painted = false } = {}) {
  let from = 0;
  while (from < css.length) {
    const at = css.indexOf(selector, from);
    if (at === -1) break;
    const open = css.indexOf("{", at + selector.length);
    const between = css.slice(at + selector.length, open);
    from = at + selector.length;
    if (!/^\s*$/.test(between)) continue;
    const close = css.indexOf("}", open);
    const body = css.slice(open + 1, close);
    // 同一个选择器会在「动效关闭」里再出现一次，那里只负责停动画。
    if (painted && !/content:/.test(body)) continue;
    return body;
  }
  assert(false, `样式里有选择器 ${selector}`);
  return "";
}

/** @param {string} body @param {string} prop */
function pxOf(body, prop) {
  const match = body.match(new RegExp(`${prop}:\\s*([\\d.]+)px`));
  return match ? Number(match[1]) : NaN;
}

const lessonCore = pxOf(ruleBody(".star--lesson .star-glyph"), "width");
const daily = ruleBody(".star.is-daily .star-glyph");
const dailyCore = pxOf(daily, "width");
assert(dailyCore > lessonCore, `今日一星核心 ${dailyCore}px 大于普通经验星 ${lessonCore}px`);
assert(
  /#7ef2b0|var\(--green\)/.test(daily),
  "今日一星核心用品牌绿 #7ef2b0"
);

const halo = ruleBody(".star.is-daily::after", { painted: true });
assert(/border-radius:\s*50%/.test(halo), "光晕是一圈圆，不是字符");
assert(/content:\s*""/.test(halo), "光晕不写入任何文字符号");
const haloSize = pxOf(halo, "width");
assert(haloSize > dailyCore && haloSize >= 22, `光晕 ${haloSize}px 明显大于核心 ${dailyCore}px`);
assert(
  /#7ef2b0|rgba\(\s*126\s*,\s*242\s*,\s*176|rgba\(\s*255\s*,\s*255\s*,\s*255/.test(halo),
  "光晕用 #7ef2b0 或接近白色"
);
assert(/box-shadow:[^;}]*rgba\(\s*126\s*,\s*242\s*,\s*176/.test(halo), "光晕带柔和的绿色散开");
assert(/animation:[^;}]*infinite/.test(halo), "光晕持续脉动");
const period = halo.match(/animation:[^;}]*?([\d.]+)s/);
assert(period && Number(period[1]) >= 4, `脉动周期 ${period?.[1]}s，慢而不闪`);

const breathe = css.slice(css.indexOf("@keyframes dailyBreathe"));
assert(breathe.startsWith("@keyframes dailyBreathe"), "脉动关键帧仍叫 dailyBreathe");
assert(/opacity:\s*0\.[6-9]/.test(breathe) || /opacity:\s*1\b/.test(breathe), "脉动最亮时仍然看得见");
assert(/opacity:\s*0\.[3-9]/.test(breathe), "脉动最暗时也不会消失");

for (const marker of ['.app[data-motion="off"] .star.is-daily::after', ".star.is-daily::after"]) {
  const still = marker.startsWith(".app")
    ? ruleBody(marker)
    : css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
  const body = marker.startsWith(".app")
    ? still
    : still.slice(still.indexOf(marker), still.indexOf("}", still.indexOf(marker)));
  assert(/animation:\s*none/.test(body), `${marker.startsWith(".app") ? "动效关闭" : "prefers-reduced-motion"} 时不再脉动`);
  assert(!/opacity:\s*0\s*[;}]/.test(body) && !/display:\s*none/.test(body), "停止脉动后仍留下静态光晕");
}

const stars = readFileSync(new URL("../src/stars.js", import.meta.url), "utf8");
const dailyMark = stars.slice(stars.indexOf("function applyDaily"), stars.indexOf("function syncDaily"));
assert(/classList\.toggle\("is-daily"/.test(dailyMark), "今日一星仍然只靠 is-daily 标记，不加字符");
assert(!/textContent\s*=/.test(dailyMark) && !/[★☆✦✧✱✳]/.test(dailyMark), "标记今日一星不写入任何字符符号");

process.exit(failed ? 1 : 0);
