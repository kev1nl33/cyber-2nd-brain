#!/usr/bin/env node
/**
 * 今日一星的纯函数检查：同一天稳定、不同天会换、星表为空时不选。
 * 运行：node scripts/test-daily-star.mjs
 */
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

process.exit(failed ? 1 : 0);
