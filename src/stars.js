/**
 * 天秤座：铺在主画布背景里的经验层。
 *
 * 一颗主星 = private-data/lessons.js 里的一个行为模式；
 * 一颗小星 = 一条经验，散在它所属模式的主星附近。
 * 不属于任何模式的经验放在天秤外围，不进骨架。
 *
 * 位置全部由星表坐标换算出来，每帧只跟着视口大小重新铺开，
 * 不参与链条布局，也不跟相机平移缩放。刷新之后位置不变。
 * lessons.js 缺失或为空时这一层什么都不画，页面照常工作。
 *
 * ---------------------------------------------------------------------------
 * 坐标来源（J2000.0 赤经 / 赤纬，原文记于各星的维基百科条目）
 *
 * 主星五颗取天秤座最亮的五颗，按视星等从亮到暗：
 *   β 氏宿四（Zubeneschamali） 2.61  — 15h 17m 00.41382s, −09° 22′ 58.4919″
 *       van Leeuwen 2007，Hipparcos 新归算（https://en.wikipedia.org/wiki/Zubeneschamali）
 *   α² 氏宿一（Zubenelgenubi） 2.741 — 14h 50m 52.71309s, −16° 02′ 30.3955″
 *       van Leeuwen 2007（https://en.wikipedia.org/wiki/Zubenelgenubi）
 *   σ 折威七（Brachium）      3.20–3.46 — 15h 04m 04.21480s, −25° 16′ 55.0905″
 *       Gaia DR3，Vallenari 等 2023（https://en.wikipedia.org/wiki/Sigma_Librae）
 *   υ 氏宿南门（Upsilon Librae） 3.628 — 15h 37m 01.45020s, −28° 08′ 06.2926″
 *       van Leeuwen 2007（https://en.wikipedia.org/wiki/Upsilon_Librae）
 *   τ 氏宿南门（Tau Librae）    3.68  — 15h 38m 39.36950s, −29° 46′ 39.8956″
 *       van Leeuwen 2007（https://en.wikipedia.org/wiki/Tau_Librae）
 *
 * 辅星六颗用来把天秤的轮廓撑开，本身不挂经验，不可点：
 *   γ 氏宿三（Zubenelhakrabi） 3.91  — 15h 35m 31.57881s, −14° 47′ 22.3278″  van Leeuwen 2007
 *       https://en.wikipedia.org/wiki/Gamma_Librae
 *   θ 西上相九（Theta Librae）    4.136 — 15h 53m 49.53806s, −16° 43′ 45.4582″  Gaia DR2，Brown 等 2018
 *       https://en.wikipedia.org/wiki/Theta_Librae
 *   ι¹ 氏宿东门（Iota1 Librae）  4.54  — 15h 12m 13.29025s, −19° 47′ 30.1592″  van Leeuwen 2007
 *       https://en.wikipedia.org/wiki/Iota1_Librae
 *   δ 氏宿西门（Delta Librae）    4.93  — 15h 00m 58.34830s, −08° 31′ 08.2104″  Gaia DR3，Vallenari 等 2023
 *       https://en.wikipedia.org/wiki/Delta_Librae
 *   48 Librae                 4.95  — 15h 58m 11.36869s, −14° 16′ 45.6894″  van Leeuwen 2007
 *       https://en.wikipedia.org/wiki/48_Librae
 *   α¹ 氏宿增十六（Alpha1 Librae） 5.153 — 14h 50m 41.18097s, −15° 59′ 50.0482″  van Leeuwen 2007
 *       与 α² 同条目
 *
 * 投影：赤经先乘以赤纬范围中点的余弦，再以这些星的赤经、赤纬范围中点为原点，
 * 归一化到左右各一半的正方形。赤纬取反，让北边的星画在上方。
 * 星座线只连主星：β—α²—σ—υ—τ，是天秤从梁的北端走到西盘再到东盘的骨架。
 * 辅星不入线：γ 在梁东端，θ、48 在东盘上方，δ 在梁北端，ι¹ 在梁中。
 */

import { makeRng, range } from "./random.js";

/** 视星等映射到尺寸的上下限：再亮也不会比这个更大，再暗也不会比这个更小。 */
const MAG_BRIGHT = 2.61;
const MAG_FAINT = 5.15;

/** 小星离主星的散布半径，以星座宽度为单位。五片各自的范围互不重叠。 */
const SCATTER = 0.13;

/** 同一片里两颗小星至少隔开这么远，避免点上去分不清是哪一条。 */
const MIN_SEPARATION = 0.03;

/** 不属于任何模式的经验，沿天秤外围一圈放置。 */
const HALO_INNER = 0.62;
const HALO_OUTER = 0.74;

/**
 * @param {number} hours
 * @param {number} minutes
 * @param {number} seconds
 */
function rightAscension(hours, minutes, seconds) {
  return (hours + minutes / 60 + seconds / 3600) * 15;
}

/**
 * @param {number} degrees 带符号：天秤座全部在天球赤道以南
 * @param {number} minutes
 * @param {number} seconds
 */
function declination(degrees, minutes, seconds) {
  const sign = degrees < 0 ? -1 : 1;
  return sign * (Math.abs(degrees) + minutes / 60 + seconds / 3600);
}

/**
 * 天秤座的星。pattern 有值的是主星，按视星等从亮到暗排，依次对应数据里的五个模式。
 * @type {{ key: string, bayer: string, name: string, magnitude: number, ra: number, dec: number, pattern: boolean }[]}
 */
const LIBRA = [
  { key: "beta", bayer: "β", name: "氏宿四", magnitude: 2.61, ra: rightAscension(15, 17, 0.41382), dec: declination(-9, 22, 58.4919), pattern: true },
  { key: "alpha2", bayer: "α²", name: "氏宿一", magnitude: 2.741, ra: rightAscension(14, 50, 52.71309), dec: declination(-16, 2, 30.3955), pattern: true },
  { key: "sigma", bayer: "σ", name: "折威七", magnitude: 3.29, ra: rightAscension(15, 4, 4.2148), dec: declination(-25, 16, 55.0905), pattern: true },
  { key: "upsilon", bayer: "υ", name: "氏宿南门", magnitude: 3.628, ra: rightAscension(15, 37, 1.4502), dec: declination(-28, 8, 6.2926), pattern: true },
  { key: "tau", bayer: "τ", name: "氏宿南门", magnitude: 3.68, ra: rightAscension(15, 38, 39.3695), dec: declination(-29, 46, 39.8956), pattern: true },
  { key: "gamma", bayer: "γ", name: "氏宿三", magnitude: 3.91, ra: rightAscension(15, 35, 31.57881), dec: declination(-14, 47, 22.3278), pattern: false },
  { key: "theta", bayer: "θ", name: "西上相九", magnitude: 4.136, ra: rightAscension(15, 53, 49.53806), dec: declination(-16, 43, 45.4582), pattern: false },
  { key: "iota1", bayer: "ι¹", name: "氏宿东门", magnitude: 4.54, ra: rightAscension(15, 12, 13.29025), dec: declination(-19, 47, 30.1592), pattern: false },
  { key: "delta", bayer: "δ", name: "氏宿西门", magnitude: 4.93, ra: rightAscension(15, 0, 58.3483), dec: declination(-8, 31, 8.2104), pattern: false },
  { key: "48", bayer: "48", name: "氏宿增十九", magnitude: 4.95, ra: rightAscension(15, 58, 11.36869), dec: declination(-14, 16, 45.6894), pattern: false },
  { key: "alpha1", bayer: "α¹", name: "氏宿增十六", magnitude: 5.153, ra: rightAscension(14, 50, 41.18097), dec: declination(-15, 59, 50.0482), pattern: false },
];

/** 星座线只连这五颗主星，按天秤骨架的走向：梁的北端、梁的西端、西盘、东盘。 */
const FIGURE = ["beta", "alpha2", "sigma", "upsilon", "tau"];

const FIELD = project(LIBRA);

/**
 * 把赤经赤纬投到左右各一半的平面，保留相对位置。
 * @param {typeof LIBRA} stars
 */
function project(stars) {
  const raMid = (Math.min(...stars.map((s) => s.ra)) + Math.max(...stars.map((s) => s.ra))) / 2;
  const decMid = (Math.min(...stars.map((s) => s.dec)) + Math.max(...stars.map((s) => s.dec))) / 2;
  const cosine = Math.cos((decMid * Math.PI) / 180);
  const points = stars.map((star) => ({
    ...star,
    x: (star.ra - raMid) * cosine,
    y: -(star.dec - decMid),
  }));
  const span = Math.max(...points.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y)))) || 1;
  return points.map((point) => ({ ...point, x: point.x / span, y: point.y / span }));
}

/**
 * 本地日期字符串，作为今日一星的种子。用本地时区而不是 UTC，
 * 免得东八区清晨刷新时还停在昨天。
 * @param {Date} [date]
 */
export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 今日一星：只按日期做种子，不碰 Date.now() 或随机数状态。
 * 同一份星表在同一天永远选出同一条经验，跨天才会换一颗。
 * 星表为空时返回 null，星空不做任何标记。
 * @param {any[]} lessons
 * @param {string} dateKey 本地日期，YYYY-MM-DD
 */
export function pickDailyLesson(lessons, dateKey) {
  if (!Array.isArray(lessons) || lessons.length === 0) return null;
  const rng = makeRng(`daily:${dateKey}`);
  return lessons[Math.floor(rng() * lessons.length)];
}

export function createStars({ layer, svg, onOpen }) {
  const data = globalThis.window?.LESSONS;
  const lessons = Array.isArray(data?.lessons) ? data.lessons : [];
  const patterns = Array.isArray(data?.patterns) ? data.patterns : [];
  if (!lessons.length) return noop();

  const principals = FIELD.filter((star) => star.pattern);
  const assigned = patterns.slice(0, principals.length).map((pattern, index) => ({
    pattern,
    star: principals[index],
  }));
  const patternOf = new Map(assigned.map((entry) => [entry.pattern.id, entry]));
  const daily = pickDailyLesson(lessons, localDateKey());

  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute("class", "constellations");
  svg.appendChild(group);

  /** @type {{ from: string, to: string, path: SVGPathElement }[]} */
  const lines = [];
  for (let i = 0; i < FIGURE.length - 1; i++) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", "constellation");
    group.appendChild(path);
    lines.push({ from: FIGURE[i], to: FIGURE[i + 1], path });
  }

  /** @type {Map<string, { kind: "pattern"|"lesson"|"field", patternId: string|null, lesson: any, star: any, el: HTMLButtonElement|HTMLSpanElement, nx: number, ny: number }>} */
  const marks = new Map();

  for (const entry of assigned) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "star star--pattern";
    el.dataset.pattern = entry.pattern.id;
    el.dataset.magnitude = magnitudeOf(entry.star.magnitude);
    el.setAttribute("aria-label", `行为模式：${entry.pattern.name}`);
    el.innerHTML = '<span class="star-glyph" aria-hidden="true"></span>';
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      onOpen({ kind: "pattern", id: entry.pattern.id });
    });
    el.addEventListener("pointerdown", (event) => event.stopPropagation());
    layer.appendChild(el);
    marks.set(entry.star.key, {
      kind: "pattern",
      patternId: entry.pattern.id,
      lesson: null,
      star: entry.star,
      el,
      nx: entry.star.x,
      ny: entry.star.y,
    });
  }

  const stray = [];
  /** @type {Map<string, { x: number, y: number }[]>} */
  const taken = new Map();
  for (const lesson of lessons) {
    const home = lesson.patternIds.map((id) => patternOf.get(id)).find(Boolean);
    if (!home) {
      stray.push(lesson);
      continue;
    }
    const rng = makeRng(`libra:${home.star.key}:${lesson.id}`);
    const spread = scatter(home.star, rng, taken.get(home.star.key) || []);
    const list = taken.get(home.star.key) || [];
    list.push(spread);
    taken.set(home.star.key, list);
    placeLesson(lesson, spread.x, spread.y, home.pattern.id);
  }
  stray.forEach((lesson, index) => {
    const rng = makeRng(`libra:halo:${lesson.id}`);
    const turn = ((index + 0.5) / stray.length) * Math.PI * 2 + range(rng, -0.05, 0.05);
    const radius = range(rng, HALO_INNER, HALO_OUTER);
    placeLesson(lesson, Math.cos(turn) * radius, Math.sin(turn) * radius * 0.84, null);
  });

/**
 * 小星只往主星远离其他主星的那一侧散，所以五片各自成团、互不交叉。
 * 落点太靠近已有的小星就换一个角度重抽，种子固定，刷新之后位置不变。
 * @param {{ x: number, y: number }} star
 * @param {() => number} rng
 * @param {{ x: number, y: number }[]} placed
 */
function scatter(star, rng, placed) {
  const others = FIELD.filter((item) => item.pattern && item !== star);
  const away = others.reduce(
    (sum, item) => {
      const dx = star.x - item.x;
      const dy = star.y - item.y;
      const dist = Math.hypot(dx, dy) || 1;
      return { x: sum.x + dx / dist, y: sum.y + dy / dist };
    },
    { x: 0, y: 0 }
  );
  const heading = Math.atan2(away.y, away.x);
  let best = null;
  let bestGap = -1;
  for (let attempt = 0; attempt < 8; attempt++) {
    const angle = heading + range(rng, -1.15, 1.15);
    const radius = SCATTER * (0.45 + rng() * 0.55);
    const point = { x: star.x + Math.cos(angle) * radius, y: star.y + Math.sin(angle) * radius };
    const gap = placed.reduce(
      (min, item) => Math.min(min, Math.hypot(point.x - item.x, point.y - item.y)),
      Infinity
    );
    if (gap > bestGap) {
      best = point;
      bestGap = gap;
    }
    if (gap >= MIN_SEPARATION) return point;
  }
  return best;
}

/**
 * @param {any} lesson
   * @param {number} nx
   * @param {number} ny
   * @param {string|null} patternId 散布时所属的那一片；一条经验可能同时属于几个模式
   */
  function placeLesson(lesson, nx, ny, patternId) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "star star--lesson";
    if (lesson.status !== "confirmed") el.dataset.pending = "true";
    if (patternId) el.dataset.pattern = patternId;
    el.setAttribute("aria-label", `经验：${lesson.text}`);
    el.innerHTML = '<span class="star-glyph" aria-hidden="true"></span>';
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      onOpen({ kind: "lesson", id: lesson.id });
    });
    el.addEventListener("pointerdown", (event) => event.stopPropagation());
    layer.appendChild(el);
    marks.set(lesson.id, { kind: "lesson", patternId, lesson, star: null, el, nx, ny });
  }

  for (const star of FIELD) {
    if (star.pattern) continue;
    const el = document.createElement("span");
    el.className = "star star--field";
    el.dataset.magnitude = magnitudeOf(star.magnitude);
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = '<span class="star-glyph"></span>';
    layer.appendChild(el);
    marks.set(star.key, { kind: "field", patternId: null, lesson: null, star, el, nx: star.x, ny: star.y });
  }

  let openId = null;
  let hoverPatternId = null;

  /** 今日一星：当天选中的那条经验加一点标记，让人一眼看到从哪开始看。 */
  let dailyKey = localDateKey();
  let dailyId = daily?.id || null;
  let dailyCheckedAt = 0;
  applyDaily();

  function applyDaily() {
    for (const [id, mark] of marks) {
      if (mark.kind !== "lesson") continue;
      const on = id === dailyId;
      mark.el.classList.toggle("is-daily", on);
      mark.el.setAttribute("aria-label", `${on ? "今日一星：" : "经验："}${mark.lesson.text}`);
    }
  }

  /** 页面一直开着跨过零点时，把标记挪到新一天的那颗星上；每分钟最多查一次。 */
  function syncDaily(now) {
    if (now - dailyCheckedAt < 60000) return;
    dailyCheckedAt = now;
    const key = localDateKey();
    if (key === dailyKey) return;
    dailyKey = key;
    dailyId = pickDailyLesson(lessons, key)?.id || null;
    applyDaily();
  }

  /** 天秤铺满链条上下之间的画布，留出顶栏、底栏，也给上下两颗主星留出星点本身的高度。 */
  function canvasBox() {
    const style = getComputedStyle(document.documentElement);
    const top = parseFloat(style.getPropertyValue("--inset-top")) || 56;
    const bottom = parseFloat(style.getPropertyValue("--inset-bottom")) || 52;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const padX = 120;
    const padY = 64;
    const innerW = width - padX * 2;
    const innerH = height - top - bottom - padY * 2;
    const side = Math.max(240, Math.min(innerW, innerH));
    return { cx: width / 2, cy: top + padY + innerH / 2, side };
  }

  /** @param {number} nx @param {number} ny */
  function screenOf(nx, ny) {
    const box = canvasBox();
    return { x: box.cx + nx * box.side * 0.5, y: box.cy + ny * box.side * 0.5 };
  }

  function frame() {
    syncDaily(Date.now());
    const positions = new Map();
    for (const [id, mark] of marks) {
      const point = screenOf(mark.nx, mark.ny);
      mark.el.style.transform = `translate3d(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px, 0)`;
      positions.set(id, point);
    }
    for (const line of lines) {
      const a = positions.get(line.from);
      const b = positions.get(line.to);
      if (!a || !b) continue;
      line.path.setAttribute("d", `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${b.x.toFixed(1)} ${b.y.toFixed(1)}`);
    }
  }

  /** 悬停某一颗星，只提亮它所在的那一片：主星、这一片的经验星、连到这颗主星的线。 */
  function applyHighlight() {
    const active = hoverPatternId;
    const starKey = active
      ? assigned.find((entry) => entry.pattern.id === active)?.star.key
      : null;
    for (const line of lines) {
      line.path.classList.toggle("is-hot", Boolean(starKey) && (line.from === starKey || line.to === starKey));
    }
    for (const [, mark] of marks) {
      const hot =
        Boolean(active) &&
        (mark.patternId === active || (mark.kind === "pattern" && mark.el.dataset.pattern === active));
      mark.el.classList.toggle("is-hot", hot);
      mark.el.classList.toggle("is-open", mark.kind !== "field" && markId(mark) === openId);
    }
  }

  layer.addEventListener("pointerover", (event) => {
    const star = event.target.closest?.(".star");
    const next = star?.dataset.pattern || null;
    if (next === hoverPatternId) return;
    hoverPatternId = next;
    applyHighlight();
  });
  layer.addEventListener("pointerout", (event) => {
    if (event.target.closest?.(".star") && !event.relatedTarget?.closest?.(".stars")) {
      hoverPatternId = null;
      applyHighlight();
    }
  });

  return {
    frame,
    /** @param {string|null} id 当前打开的经验或模式；null 表示已关闭。 */
    setOpen(id) {
      openId = id;
      applyHighlight();
    },
    /**
     * 断语卡的锚点：星点的屏幕位置。
     * @param {string} id
     */
    anchorOf(id) {
      const mark = findMark(id);
      if (!mark) return null;
      const point = screenOf(mark.nx, mark.ny);
      return { x: point.x, y: point.y, r: mark.kind === "pattern" ? 8 : 5 };
    },
    starElement: (id) => findMark(id)?.el || null,
    get enabled() {
      return true;
    },
  };

  /** @param {string} id */
  function findMark(id) {
    for (const [, mark] of marks) {
      if (mark.kind !== "field" && markId(mark) === id) return mark;
    }
    return null;
  }
}

/** @param {{ kind: string, patternId: string|null, lesson: any }} mark */
function markId(mark) {
  if (mark.kind === "pattern") return mark.patternId;
  return mark.lesson?.id || null;
}

/** 视星等分三档，交给样式决定尺寸。亮星大，暗星小。 */
function magnitudeOf(magnitude) {
  const t = (magnitude - MAG_BRIGHT) / (MAG_FAINT - MAG_BRIGHT);
  if (t < 0.34) return "1";
  if (t < 0.67) return "2";
  return "3";
}

function noop() {
  return {
    frame() {},
    setOpen() {},
    anchorOf() {
      return null;
    },
    starElement() {
      return null;
    },
    get enabled() {
      return false;
    },
  };
}
