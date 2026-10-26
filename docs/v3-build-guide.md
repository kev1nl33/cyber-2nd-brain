# 赛博第二大脑 v3 · 实现指导文档

> 读者：负责写代码的 AI（ChatGPT、GLM、Grok 等）。
> 作者：产品与设计负责人。2026-10-24 定稿。
> 目标：任何一个 AI 只读这份文档和仓库，就能做出**同一个**产品。

---

## 第 0 章 · 给执行者的工作守则（先读完再动手）

1. **完整读完本文档再写第一行代码。** 文档里的每个数值、文案、规则都是决定，不是建议。
2. **一次只做一个阶段**（见第 13 章）。每个阶段结束时，所有测试通过、页面可运行，再进入下一阶段。
3. **不得新增任何运行时依赖。** 不用 React、Vue、Tailwind、D3、任何 npm 包。原生 HTML + CSS + ES Module。测试只用 Node 内置的 `node:test`。
4. **不得修改数据文件。** `private-data/` 下的任何文件只读，也不得把其中内容复制进仓库、截图、测试快照或日志。
5. **不得发明数据字段。** 只使用第 3 章列出的字段。需要的派生值按第 4 章的算法计算。
6. **文案逐字使用第 11 章的词表。** 不要自己换说法，不要加 emoji，不要加感叹号。
7. **遇到文档没覆盖的情况**：选最简单、与本文档其余部分最一致的做法，并在 `docs/decisions-log.md` 末尾追加一行：`日期 · 阶段 · 情况 · 你的选择 · 理由`。不要停下来等人回答。
8. **所有用户数据插入 DOM 前必须转义。** 只允许通过第 9 章的 `h()` / `text()` 写入，禁止把数据拼进 `innerHTML`。
9. **纯逻辑模块不得访问 DOM 或 `window`**（`src/data/`、`src/router.js` 下的文件），这样才能在 Node 里测试。
10. 每完成一个阶段，在 PR 描述或回复里附上：通过的测试列表、桌面 1440×900 与手机 390×844 两张截图（用示例数据）。

---

## 第 1 章 · 产品是什么

### 1.1 一句话

**一张每天打开 5 分钟的思考工作台。** 它帮你核对推断、回看依据、沉淀经验；读起来像一本排版考究的书；偶尔，它能把一年的思考在星空里重放一遍。

### 1.2 三个来源，各取所长

| 来源方案 | 贡献给 v3 的部分 |
| --- | --- |
| 判断台（工具） | **骨架**：侧栏导航、「今天」首页、「待核对」队列、键盘优先、命令面板、核对记录 |
| 年鉴（读物） | **阅读**：问题页的宋体排印、页边注式来源、「太史公曰」经验集、「年表」 |
| 星图（空间） | **仪式**：「回望」全屏星空，按日期重放一年的思考 |

### 1.3 产品价值（所有取舍的最终依据）

> 第二大脑的价值，不取决于它储存了多少知识，而取决于它帮助我形成了多少更好的理解、修正了多少错误判断，以及改善了多少实际决策。

对应到界面：**理解**靠问题页的阅读体验；**修正**靠待核对；**决策**靠经验卡上的「今天用上了」。

### 1.4 四条设计原则

1. **原始记录与我的核对永远分开显示。** 核对结果是叠加层，绝不改写原数据（PRD 原则六）。
2. **推断与记录一眼可分。** 任何地方出现关联，都必须用线型和文字区分 `recorded` 与 `inferred`（PRD 原则二）。
3. **字先于装饰。** 任何视觉效果如果让正文更难读，就不做。
4. **每个视觉编码对应一个数据事实。** 颜色、点、线、条，都要能说出它代表哪个字段。

---

## 第 2 章 · 技术约束与仓库结构

### 2.1 技术栈

- 原生 HTML5、CSS（自定义属性、Grid、Flex、`:has()` 可用）、ES2022 Module
- 无构建步骤：`python3 -m http.server 8765 --bind 127.0.0.1` 后打开 `http://127.0.0.1:8765/` 即可运行
- 渲染：DOM 为主；只有「回望」页使用 Canvas 2D
- 路由：hash 路由（`#/...`），见第 6 章
- 存储：`localStorage`（真实数据模式）/ `sessionStorage`（示例数据模式），见第 5 章
- 目标浏览器：Safari 17+、Chrome 120+、Firefox 120+，含 iOS Safari
- 部署：静态文件托管（Cloudflare），`private-data/` 永不部署

### 2.2 迁移旧版

在新分支 `v3` 上工作。第一步把旧应用整体移入 `legacy/`，保持可运行：

```bash
git checkout -b v3
mkdir legacy
git mv index.html legacy/index.html
git mv src legacy/src
git mv scripts legacy/scripts
```

然后把 `legacy/index.html` 中的 `./private-data/` 改为 `../private-data/`。`legacy/` 之后不再修改，仅供参考。`assets/readme/` 保留在原处。

### 2.3 新目录结构（必须完全一致）

```text
index.html
src/
  main.js                     启动：加载数据 → 建模型 → 挂外壳 → 启动路由
  router.js                   纯函数：parse / build / legacy 重定向
  data/
    load.js                   唯一读取 window 全局变量的地方
    model.js                  纯函数：原始数据 → 规范化模型
    taxonomy.js               纯函数：阶段与状态归并表
    derive.js                 纯函数：间隔、同源、今日、搁置、队列、统计
    overlay.js                纯函数核心 + 存储适配器：核对记录
    search.js                 纯函数：索引与匹配
    dates.js                  纯函数：日期解析、天数差、格式化
    sample-data.js            示例数据（从 legacy/src 复制后按 14.3 扩充）
  ui/
    dom.js                    h()、text()、clear()、escape
    shell.js                  侧栏、顶栏、底部标签栏
    prefs.js                  深浅主题与动效偏好
    components/
      phase-bar.js
      status-pill.js
      kind-tag.js
      step.js
      connector.js
      note.js
      lesson-card.js
      review-item.js
      palette.js
      toast.js
      empty.js
  pages/
    today.js
    review.js
    question.js
    theme.js
    lessons.js
    sources.js
    timeline.js
    atlas.js
  styles/
    tokens.css
    base.css
    shell.css
    components.css
    pages.css
    atlas.css
scripts/
  test-*.mjs                  单元测试，见第 12 章
  check-model.mjs             可选：用真实数据打印统计（需显式参数）
docs/
  v3-build-guide.md           本文档
  decisions-log.md            执行者记录自行决定的事项
legacy/                       旧版，只读
```

### 2.4 `index.html` 骨架

```html
<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark" data-motion="on">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>赛博第二大脑</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&family=Newsreader:opsz,wght@6..72,400;6..72,600&family=Noto+Serif+SC:wght@400;600&display=swap" />
  <link rel="stylesheet" href="./src/styles/tokens.css" />
  <link rel="stylesheet" href="./src/styles/base.css" />
  <link rel="stylesheet" href="./src/styles/shell.css" />
  <link rel="stylesheet" href="./src/styles/components.css" />
  <link rel="stylesheet" href="./src/styles/pages.css" />
  <link rel="stylesheet" href="./src/styles/atlas.css" />
</head>
<body>
  <a class="skip-link" href="#main">跳到正文</a>
  <div class="app" id="app">
    <nav class="sidebar" id="sidebar" aria-label="主导航"></nav>
    <div class="workspace">
      <header class="topbar" id="topbar" aria-label="顶栏"></header>
      <main class="main" id="main" tabindex="-1"></main>
    </div>
    <aside class="evidence" id="evidence" aria-label="证据"></aside>
    <nav class="tabbar" id="tabbar" aria-label="底部导航"></nav>
  </div>
  <div id="overlay-root"></div>
  <div class="toast-region" id="toasts" role="status" aria-live="polite"></div>

  <script src="./private-data/flomo.js"></script>
  <script src="./private-data/thoughts.js"></script>
  <script src="./private-data/lessons.js"></script>
  <script type="module" src="./src/main.js"></script>
</body>
</html>
```

`private-data/*.js` 在公开部署中不存在，会产生 404，这是预期行为，不要处理成报错。字体加载失败时必须回退到系统字体，界面仍然好看（见 8.3）。

---

## 第 3 章 · 输入数据契约（只读）

三个全局变量，任何一个都可能不存在。

### 3.1 `window.CYBER_THOUGHTS`

```js
{
  themes: [{
    id: "invest",              // string，主题 ID，全局唯一
    label: "投资",              // 中文名
    en: "INVESTMENT",          // 英文名，大写
    code: "01",                // 两位序号
    description: "……",         // 一句话说明
    latest: "2026-10-17",      // YYYY-MM-DD
    recordIds: ["f131", …],    // 本主题关联的记录 ID（展示统计用）
    ideas: [{
      id: "invest-company",    // 问题 ID，全局唯一
      title: "……",             // ≤ 22 字
      summary: "……",           // 当前理解，可能为空字符串
      status: "候选整理 · 待确认", // 自由文本，见 4.3 归并
      updated: "2025-11-15",   // YYYY-MM-DD，等于最后一步日期
      nodes: [{                // 步骤，数组顺序就是思考顺序，可能为空数组
        id: "metrics",         // 步骤 ID（真实数据全局唯一，但一律用 ideaId/stepId 组合键）
        date: "2025-11-01",    // YYYY-MM-DD
        kind: "行动",          // 15 种之一，见 4.2
        title: "……",           // ≤ 29 字
        body: "……",            // ≤ 106 字
        refs: [{ id: "f131", quote: "……" }], // 引用，id 指向记录或来源
        connection: "recorded",// "recorded" | "inferred"：与上一步（第一步时为与问题）的关联性质
        link: "然后"           // 与上一步之间的连接词，自由文本
      }]
    }]
  }],
  sources: [{ id, title, date, kind, origin, text }], // 对话类来源
  meta: { … }                  // 忽略
}
```

### 3.2 `window.BRAIN_DATA`

```js
{
  meta: { … },                 // 忽略
  records: [{
    id: "f131",
    date: "2025-10-02 10:13:30", // 可能带时间，只取前 10 位
    title: "……",
    text: "……",                // 原文
    tags: ["Area/财务基石", …],  // 层级标签，用 / 分隔
    domain: "invest",          // invest | ai | create | read | life | develop
    related: ["read"],         // 相关 domain
    origin: "flomo",           // flomo | obsidian
    kind: "个人记录",           // 自由文本
    attachments: 0, ordinal, sourceLine // 忽略
  }]
}
```

### 3.3 `window.LESSONS`

```js
{
  lessons: [{
    id: "…",
    ideaId: "invest-company",  // 所属问题
    text: "……",                // 经验原文，≤ 55 字
    stepIds: ["metrics", …],   // 证据步骤，属于 ideaId 那个问题
    status: "confirmed",       // "confirmed" | "待确认"
    hasInference: true,        // 是否含推想
    patternIds: ["…"]          // 0 到 2 个；24 条为空
  }],
  patterns: [{
    id: "…",
    name: "……",
    description: "……",
    level: "或曰",             // 原样显示
    lessonIds: ["…"]
  }]
}
```

### 3.4 真实数据的规模（用于设计校验，不得写进代码）

5 个主题、22 个问题、85 个步骤、116 处引用（112 指向记录、4 指向来源、0 缺失）、115 条记录、4 段来源、40 条经验（38 已确认、2 待确认）、5 个模式。步骤日期跨度 2025-10 至 2026-10。20 个步骤是 `inferred`。

### 3.5 数据模式判定

```js
const isPrivate = Array.isArray(window.CYBER_THOUGHTS?.themes) && window.CYBER_THOUGHTS.themes.length > 0;
```

- `isPrivate === true`：使用三个全局变量（`BRAIN_DATA`、`LESSONS` 缺失时视为空）
- 否则：**全部**改用 `src/data/sample-data.js` 的示例数据（包括示例记录、示例经验），并在侧栏底部显示「示例数据」徽标

---

## 第 4 章 · 规范化模型与派生算法

`model.js` 导出 `buildModel(raw, { today })`，返回下列结构。`today` 是 `YYYY-MM-DD` 字符串，由调用方传入（测试时可固定）。

### 4.1 模型结构

```js
Model = {
  mode: "private" | "sample",
  today: "2026-10-24",
  themes: Theme[],                 // 保持原顺序
  ideas: Idea[],                   // 按主题顺序展开
  steps: Step[],                   // 按问题顺序展开
  refs: Ref[],                     // 每个步骤的每个引用一条
  sources: SourceDoc[],            // 记录 + 来源合并
  lessons: Lesson[],
  patterns: Pattern[],
  byId: {                          // 全部用 Map
    theme, idea, step,             // step 键为 `${ideaId}/${stepId}`
    source, lesson, pattern
  }
}

Theme   = { id, label, en, code, description, latest, ideaIds[], stepCount, phaseCounts:{see,think,do,learn} }
Idea    = { id, themeId, title, summary, statusRaw, status:"pending"|"active"|"landed",
            updated, stepKeys[], phases:Set<phase>, firstDate, lastDate, lessonIds[] }
Step    = { key, id, ideaId, themeId, index /*1 起*/, total, date, kind, phase,
            title, body, connection, link, refIds[], gapDays /*与上一步相隔天数，第一步为 null*/ }
Ref     = { stepKey, sourceId, quote, missing:boolean }
SourceDoc = { id, type:"record"|"conversation", title, date /*YYYY-MM-DD*/, text, kind,
              origin /*flomo|obsidian|conversation*/, domain /*record 才有*/, tags[], citedBy: stepKey[] }
Lesson  = { id, ideaId, text, stepKeys[], pending:boolean, hasInference, patternIds[] }
Pattern = { id, name, description, level, lessonIds[] }
```

规则：

- `Ref.missing = true` 当 `refs[].id` 既不在记录也不在来源里
- `SourceDoc` 中对话来源的 `origin` 固定为 `"conversation"`
- `Lesson.stepKeys` = `stepIds.map(s => ideaId + "/" + s)`，不存在的步骤静默丢弃
- `Lesson.pending = status !== "confirmed"`
- `Pattern.lessonIds` 中不存在的经验静默丢弃

### 4.2 阶段归并（`taxonomy.js`）

```js
export const PHASES = ["see", "think", "do", "learn"];
export const PHASE_LABEL = { see: "看见", think: "想", do: "做", learn: "学到" };
export const KIND_PHASE = {
  起点: "see", 问题: "see", 输入: "see", 摘录: "see", 观察: "see", 经历: "see",
  想法: "think", 反思: "think", 判断: "think", 感悟: "think",
  行动: "do", 方法: "do",
  结果: "learn", 反馈: "learn", 规则: "learn",
};
export const phaseOf = (kind) => KIND_PHASE[kind] ?? "think";
```

### 4.3 问题状态归并

```js
export const STATUS_LABEL = { pending: "待确认", active: "进行中", landed: "已落地" };
const LANDED = new Set(["已发布过作品", "已有实际使用", "个人认识", "已有研究记录"]);
export function statusOf(raw = "") {
  if (raw.startsWith("候选整理") || raw.includes("待")) return "pending";
  if (LANDED.has(raw)) return "landed";
  return "active";
}
```

界面上同时显示归并后的标签（状态胶囊）和原文（小字副标题）。

### 4.4 日期（`dates.js`）

- `day(s)`：取字符串前 10 位，校验 `/^\d{4}-\d{2}-\d{2}$/`，失败返回 `null`
- `diffDays(a, b)`：`(Date.UTC(b) - Date.UTC(a)) / 86400000`，整数
- `todayKey(date = new Date())`：用**本地时区**的年月日拼成 `YYYY-MM-DD`
- 显示格式：
  - `fmtShort("2026-10-15")` → `10.15`
  - `fmtLong("2026-10-15")` → `2026.10.15`
  - `fmtToday("2026-10-24")` → `10 月 24 日 · 周六`
  - 相对时间 `fmtAgo(days)`：0 → `今天`，1 → `昨天`，2 到 29 → `N 天前`，30 到 364 → `N 个月前`（向下取整），≥365 → `一年多前`
- 同一列表中年份变化时，在第一条显示完整年份 `2026.01.03`，其余显示短格式

### 4.5 派生算法（`derive.js`）

**间隔断点**：`step.gapDays ≥ 14` 时，在问题页的该步之前显示「间隔 N 天」。

**同源问题** `sharedSourceIdeas(model, ideaId)`：
收集该问题所有步骤的 `sourceId`（排除 missing），找出其他问题中引用了其中任意一个的问题；按共享来源数降序、再按 `updated` 降序；最多 5 个；返回 `{ idea, shared: number }[]`。

**今日经验** `dailyLesson(model, todayKey)`：
```js
function fnv1a(str) { let h = 0x811c9dc5; for (const c of str) { h ^= c.codePointAt(0); h = Math.imul(h, 0x01000193); } return h >>> 0; }
const pool = model.lessons;               // 全部经验
return pool.length ? pool[fnv1a("lesson:" + todayKey) % pool.length] : null;
```
同一天结果相同，换一天可能不同。

**搁置最久** `staleIdea(model)`：
候选 = `stepKeys.length > 0` 且 `status !== "landed"` 的问题；取 `updated` 最早的一个；相同则按 `id` 字典序。返回 `{ idea, days: diffDays(updated, today), stoppedAt, missing }`：
- `stoppedAt` = 最后一步的阶段
- `missing` = 按 `PHASES` 顺序、排在 `stoppedAt` 之后、且该问题从未出现过的第一个阶段；没有则为 `null`

**待核对队列** `reviewQueue(model, overlay, today)`：三类条目，键格式固定：

| 类型 | 键 | 来源 | 数量（真实数据） |
| --- | --- | --- | --- |
| `lesson` | `lesson:{lessonId}` | `lesson.pending` | 2 |
| `conn` | `conn:{ideaId}/{stepId}` | `step.connection === "inferred"` | 20 |
| `idea` | `idea:{ideaId}` | `idea.status === "pending"` | 13 |

- 排除：overlay 中已有决定的键；`snoozed[key] > today` 的键
- 排序：`lesson` 全部在前（按 id），然后 `conn`（按步骤日期降序），然后 `idea`（按 `updated` 降序）
- 返回 `{ key, type, target }[]`

**主题统计**：`theme.stepCount`、`theme.phaseCounts` 在 `buildModel` 时算好。

**月度分布** `monthlyCounts(model)`：从最早步骤月份到最晚步骤月份，每月步骤数，空月为 0。返回 `{ month:"2026-03", count }[]`。

---

## 第 5 章 · 核对记录（叠加层）

### 5.1 存储

- 真实数据模式：`localStorage`，键 `c2b.overlay.v1`
- 示例数据模式：`sessionStorage`，键 `c2b.overlay.sample.v1`；待核对页顶部显示提示「示例模式 · 核对记录只保存在本次会话」
- 偏好设置（深浅、动效）单独存在 `localStorage` 键 `c2b.prefs.v1`，两种模式共用

### 5.2 结构

```js
Overlay = {
  version: 1,
  decisions: {
    [key]: { verdict: "confirmed" | "revised" | "rejected", note?: string, at: "ISO 时间" }
  },
  snoozed: { [key]: "YYYY-MM-DD" },          // 到这一天之前不出现在队列
  uses:    { [lessonId]: ["YYYY-MM-DD", …] } // 「今天用上了」的日期，去重、升序
}
```

### 5.3 操作（纯函数，返回新对象，不修改入参）

| 函数 | 行为 |
| --- | --- |
| `decide(o, key, verdict, note, now)` | 写入决定；`revised` 时 `note` 必填（去首尾空白后长度 ≥ 1），否则抛错 |
| `undo(o, key)` | 删除该键的决定 |
| `snooze(o, key, today)` | `snoozed[key] = today + 7 天` |
| `toggleUse(o, lessonId, today)` | 当天已有则移除，否则加入 |
| `exportOverlay(o, model)` | 返回 `{ app:"cyber-2nd-brain", version:1, exportedAt, mode, counts:{ideas,steps,lessons}, decisions, snoozed, uses }` |
| `importOverlay(o, json)` | 校验 `app` 与 `version`；按键合并，**同键以 `at` 较新者为准**；`uses` 取并集 |

存储适配器 `createStore(storage, key)` 提供 `load()`、`save(o)`；`load` 遇到损坏 JSON 时返回空 overlay 并在控制台警告一次。

### 5.4 导出与导入的界面

- 待核对页右上角两个按钮：「导出核对记录」「导入」
- 导出文件名：`c2b-review-YYYYMMDD.json`，通过 `Blob` + `<a download>` 下载
- 导入使用隐藏的 `<input type="file" accept="application/json">`；成功后 toast「已合并 N 条核对记录」；失败 toast「文件无法识别」

### 5.5 核对结果在其他页面的呈现

推断关联的原始性质**永远保留为虚线**，核对结果只改变旁边的文字：

| 状态 | 连接处文字 | 颜色 |
| --- | --- | --- |
| 未核对 | `推断 · 待确认` + 内联按钮 | `--doubt` |
| 已确认 | `推断 · 你已确认` | `--accent` |
| 已修改 | `推断 · 你的修正：{note}` | `--accent` |
| 不成立 | `推断 · 你认为不成立`，文字加删除线 | `--text-3` |

经验与问题同理：在原有状态胶囊旁增加一个小胶囊「已核对」或「你认为不成立」。

---

## 第 6 章 · 信息架构与路由

### 6.1 路由表（`router.js`）

| Hash | 页面 | 说明 |
| --- | --- | --- |
| `#/` 或空 | 今天 | 首页 |
| `#/review` | 待核对 | 默认选中队列第一条 |
| `#/review/{key}` | 待核对 | 选中指定条目；`key` 需 `encodeURIComponent` |
| `#/review/done` | 待核对 · 已处理 | |
| `#/q/{ideaId}` | 问题页 | |
| `#/q/{ideaId}/{stepId}` | 问题页 | 选中该步并滚动到它 |
| `#/q/{ideaId}/{stepId}/src/{sourceId}` | 问题页 | 同上，并展开该来源原文 |
| `#/t/{themeId}` | 主题页 | |
| `#/lessons` | 太史公曰 | |
| `#/lessons/{patternId}` | 太史公曰 | 滚动到该章；`unsorted` 表示未归类章 |
| `#/sources` | 来源 | |
| `#/sources/{sourceId}` | 来源 | 打开该来源详情 |
| `#/timeline` | 年表 | |
| `#/atlas` | 回望 | |
| `#/atlas/{YYYY-MM}` | 回望 | 播放头停在该月末 |

`parse(hash)` 返回 `{ page, params }`；`build({ page, params })` 返回 hash；二者互逆（测试覆盖）。无法识别的 hash 回到今天。

### 6.2 旧链接兼容

旧版链接形如 `#/{themeId}`、`#/{themeId}/{ideaId}`、`#/{themeId}/{ideaId}/{stepId}`、`…/source/{refId}`。规则：若第一段不是保留字（`review q t lessons sources timeline atlas`）且等于某个主题 ID，则用 `history.replaceState` 转换为：

- `#/{themeId}` → `#/t/{themeId}`
- `#/{themeId}/{ideaId}` → `#/q/{ideaId}`
- `#/{themeId}/{ideaId}/{stepId}` → `#/q/{ideaId}/{stepId}`
- `…/source/{refId}` → `#/q/{ideaId}/{stepId}/src/{refId}`

### 6.3 导航行为

- 页面切换：渲染新页面，`main` 滚动到顶部，焦点移到页面的 `h1`（`tabindex="-1"`）
- 同页内参数变化（如问题页换选中步骤）：**不重新渲染整页**，只更新选中态并平滑滚动；用 `replaceState`，不新增历史
- 跨页跳转：`pushState`（直接设 `location.hash`）
- 浏览器前进后退必须正确工作

---

## 第 7 章 · 页面规格

### 7.0 应用外壳（`shell.js`）

#### 布局断点

| 宽度 | 侧栏 | 主区 | 证据栏 | 底部标签栏 |
| --- | --- | --- | --- | --- |
| ≥ 1280px | 248px，完整 | 自适应 | 320px，常驻（仅问题页、来源页显示，其他页隐藏） | 无 |
| 960 到 1279px | 220px，完整 | 自适应 | 从右侧滑出的抽屉，宽 360px，顶栏有「证据」按钮开关 | 无 |
| 640 到 959px | 56px 图标轨，悬停或聚焦时展开为 220px 浮层 | 自适应 | 同上抽屉 | 无 |
| < 640px | 隐藏 | 全宽，左右内边距 20px | 证据以内联折叠区出现在每一步下方 | 有，高 56px + `env(safe-area-inset-bottom)` |

`.app` 用 CSS Grid：`grid-template-columns: var(--sidebar-w) 1fr var(--evidence-w)`。

#### 侧栏内容（自上而下）

```text
┌──────────────────────┐
│ ◐ 赛博第二大脑         │  品牌：16px 实心圆环 + 名称，点击回今天
│                      │
│ ○ 今天                │
│ ○ 待核对          35 │  计数徽标：>0 时用 --seal 底色
│ ○ 年表                │
│ ○ 回望                │
│                      │
│ 问题                  │  分组标题
│ ▸ 01 投资          7 │  可展开；展开状态存 sessionStorage
│ ▾ 03 开发          3 │
│    ▮▮▮▯ 第二大脑，怎…  │  迷你阶段条 + 单行标题（完整标题放 title 属性）
│    ▮▯▯▯ ……           │
│ ▸ 04 阅读          4 │
│                      │
│ 资料                  │
│ ○ 太史公曰         40 │
│ ○ 来源            119 │
│                      │
│ ─────────────────── │
│ ◑ 深色   ◎ 动效 开    │  两个切换按钮
│ 示例数据              │  仅示例模式显示
│ 返回博客 ↗            │  https://aikevin.dpdns.org/
└──────────────────────┘
```

- 当前页的导航项：背景 `--surface-2`，左侧 2px `--accent` 竖条，`aria-current="page"`
- 当前打开的问题在侧栏中自动展开其主题并高亮
- 侧栏宽度内，问题标题单行截断，不允许换行

#### 顶栏（主区上方，高 52px，`position: sticky`）

左：面包屑（例：`开发 / 第二大脑，怎样才能让我更清楚？`），每段可点。
右：「搜索」按钮（显示 `⌘K`，Windows 显示 `Ctrl K`）、「复制链接」按钮（成功后文字变「已复制」1.5 秒，`aria-live="polite"`；剪贴板不可用时弹出只读输入框）、`960 到 1279px` 时的「证据」按钮。
手机：左侧为页面标题，右侧只保留搜索图标。

#### 底部标签栏（< 640px）

五项：今天、待核对（带计数）、问题（打开主题列表浮层）、经验（太史公曰）、更多（浮层：年表、回望、来源、深色、动效、返回博客）。

### 7.1 今天（`#/`）

#### 桌面布局（主区内，最大宽 1080px，居中）

```text
┌──────────────────────────────────────────────────────────────┐
│ 10 月 24 日 · 周六                                     [今]  │  h1 + 朱砂方印
│ 你有 35 处待核对。最近一步：6 天前。                          │  一句话摘要
├────────────────────────────────────┬─────────────────────────┤
│ 今日经验                            │ 搁置最久                 │
│                                    │ 示例：注意力留给什么？   │
│ 「先写下当时为什么买。」            │ 个人成长 · 214 天前      │
│                                    │ ▮▮▯▯                     │
│ 模式 · ……   或曰                   │ 停在「想」，还没有「做」 │
│ 出自〈如何留下判断依据〉第 1 步     │                [ 继续 ]  │
│                                    ├─────────────────────────┤
│ [ 今天用上了 ]   已用 3 次          │ 待核对                   │
├────────────────────────────────────┤ · 推断：A → B            │
│ 最近在想                            │ · 推断：C → D            │
│ 10.18  ● 学到 · 规则  ……  〈问题〉 │ · 经验待确认             │
│ 10.17  ● 做 · 行动    ……  〈问题〉 │ 全部 35 条 →             │
│ 10.15  ● 看见 · 起点  ……  〈问题〉 ├─────────────────────────┤
│ 10.12  ● 想 · 反思    ……  〈问题〉 │ 一年回望                 │
│ 10.03  ● 做 · 行动    ……  〈问题〉 │ ▁▂▅▃▁▂▇▄▂▁▃▆▅            │
│                                    │ 85 步 · 13 个月  [ 播放 ]│
└────────────────────────────────────┴─────────────────────────┘
          左列 7/12                         右列 5/12
```

规格：

- **一句话摘要**：`你有 {N} 处待核对。最近一步：{fmtAgo}。`；N 为 0 时：`都核对过了。最近一步：{fmtAgo}。`（`{fmtAgo}` 直接拼接，中文句号前不留空格）
- **[今] 印章**：28×28px，`--seal` 底，`--bg` 字色，Noto Serif SC 600 16px，圆角 3px，`aria-hidden="true"`
- **今日经验卡**：经验原文用 Noto Serif SC 22px / 1.6，前后加「」；下方元信息 13px `--text-2`：所属模式名（无则不显示）、`level`、出处链接（`出自〈{问题标题}〉第 {i}、{j} 步`，点击跳到问题页第一个证据步骤）。按钮「今天用上了」：未用时为描边按钮，已用时为 `--accent-soft` 底 + `--accent` 字 + 文字「今天用上了 ✓」；右侧 `已用 {n} 次`（n=0 时不显示）。待确认经验在卡片右上角显示状态胶囊「待确认」
- **最近在想**：全部步骤按日期降序前 5 条。每行：日期（Geist Mono 12px）、阶段色点 6px、`{阶段} · {kind}`（12px `--text-2`）、步骤标题（15px，单行截断）、问题标题（13px `--text-3`，单行截断）。整行可点，跳到 `#/q/{ideaId}/{stepId}`
- **搁置最久**：问题标题 Noto Serif SC 18px；`{主题} · {fmtAgo}`；完整阶段条；文案 `停在「{stoppedAt}」，还没有「{missing}」`，`missing` 为 null 时文案为 `停在「{stoppedAt}」`；按钮「继续」跳问题页
- **待核对**：队列前 3 条的单行摘要（见 7.2 的摘要格式）；底部链接 `全部 {N} 条 →`；N 为 0 时显示 `都核对过了`
- **一年回望**：月度分布迷你柱状图（每月一根 6px 宽柱，间距 3px，最高 40px，颜色 `--text-3`，当月 `--accent`）；`{步骤数} 步 · {月数} 个月`；按钮「播放」跳 `#/atlas` 并自动播放
- **手机**：单列，顺序为 今日经验 → 待核对 → 搁置最久 → 最近在想 → 一年回望
- **示例模式且无经验**：今日经验卡替换为空状态（见 7.9）

### 7.2 待核对（`#/review`）

#### 布局

```text
┌─────────────────────────────────────────────────────────────────┐
│ 待核对                              [ 导出核对记录 ] [ 导入 ]    │
│ 全部 35 · 推断关联 20 · 待确认经验 2 · 候选问题 13 · 已处理 0    │  标签页
├──────────────────────────┬──────────────────────────────────────┤
│ ▸ 经验 · ……              │ 这一步真的是从上一步来的吗？          │
│   推断 · 行动 → 反思     │                                      │
│   推断 · ……              │ ┌ 上一步 ───────────────────────┐    │
│   推断 · ……              │ │ 10.12 · 做 · 行动              │    │
│   问题 · ……              │ │ ……标题……                       │    │
│   ……                     │ │ ……正文……                       │    │
│                          │ │ ¹ 来源标题 「引文」             │    │
│                          │ └───────────────────────────────┘    │
│                          │            ┆  「于是」 推断          │
│                          │ ┌ 这一步 ───────────────────────┐    │
│                          │ │ ……                             │    │
│                          │ └───────────────────────────────┘    │
│                          │                                      │
│                          │ [Y 确认] [E 修改] [N 不成立] [S 稍后]│
└──────────────────────────┴──────────────────────────────────────┘
     列表 360px                   详情
```

#### 列表项摘要格式

- `lesson`：`经验 · {text 前 18 字}`
- `conn`：`推断 · {上一步 kind} → {本步 kind}`，第二行 13px `--text-3` 为问题标题
- `idea`：`问题 · {title}`，第二行为 `statusRaw`

#### 详情区的提问句（h2，Noto Serif SC 20px）

| 类型 | 提问句 | 展示内容 |
| --- | --- | --- |
| `conn` | 这一步真的是从上一步来的吗？ | 上一步卡片（第一步时为问题标题卡）、连接线（虚线 + 引号括起的 `link`）、这一步卡片；每张卡附带其引用的引文 |
| `lesson` | 这条经验说得准确吗？ | 经验原文大字；所属模式；证据步骤卡片列表 |
| `idea` | 这样整理这个问题，你认可吗？ | 问题标题、`statusRaw`、阶段条、全部步骤的标题列表（只标题） |

#### 操作

| 按钮 | 快捷键 | 行为 |
| --- | --- | --- |
| 确认 | `Y` | `decide(key, "confirmed")` |
| 修改 | `E` | 在按钮上方展开多行输入框，占位文字「写下你的修正」，`⌘/Ctrl + Enter` 提交，`Esc` 取消；空内容时提交按钮禁用 |
| 不成立 | `N` | `decide(key, "rejected")` |
| 稍后 | `S` | `snooze(key)`，7 天后再出现 |

每次操作后：保存 overlay；列表中该项以高度收起动画移除（200ms）；自动选中下一项；侧栏计数减一；toast `已记录 · 撤销`，5 秒内点「撤销」恢复。队列为空时详情区显示空状态「都核对过了」和「去看看今天」链接。

#### 已处理标签页

列出全部决定，按 `at` 降序：类型、摘要、结论（确认 / 修改 / 不成立）、修正内容、时间（`fmtLong` + `HH:mm`）、「撤销」按钮。

#### 键盘

`J` / `↓` 下一项，`K` / `↑` 上一项，`Y` `E` `N` `S` 如上。输入框聚焦时禁用单字母快捷键。

#### 手机

只显示列表；点条目进入全屏详情（路由 `#/review/{key}`）；详情底部固定操作栏（四个按钮等宽）。支持左滑「稍后」、右滑「确认」，滑动阈值 30% 宽度，未达阈值回弹。

### 7.3 问题页（`#/q/{ideaId}`）· 核心页面，完成度要求最高

#### 桌面布局（≥ 1280px）

```text
主区（阅读栏 max-width: 34em，居中）                          证据栏 320px
┌──────────────────────────────────────────────────┐ ┌────────────────────┐
│ 03 · 开发                                         │ │                    │
│ 第二大脑，怎样才能让我更清楚？                    │ │                    │  h1
│ [进行中] 整理中的联系 · 4 步 · 2026.10.15 至 10.17 │ │                    │
│ 看见 ━━━━━ 想 ━━━━━ 做 ━━━━━ 学到                │ │                    │  完整阶段条
│                                                  │ │                    │
│ 10.15 ●  看见 · 起点                              │ │ ¹ 示例对话         │  页边注与步骤顶部对齐
│       │  让自己的记录带来理解                     │ │   对话 · 10.15     │
│       │  示例：希望个人记录能形成更贴近            │ │   「更贴近生活」   │
│       │  生活的理解。¹                            │ │   查看原文         │
│       │                                          │ │                    │
│       │  然后                                    │ │                    │  recorded 连接
│       │                                          │ │                    │
│ 10.15 ●  做 · 行动                                │ │ ² 示例整理         │
│       ┆  先做出地图和候选卡片 ²                   │ │                    │
│       ┆                                          │ │                    │
│       ┆  「做成原型」 推断 · 待确认               │ │                    │  inferred 连接
│       ┆  [确认] [修改] [不成立]                   │ │                    │
│       ┆                                          │ │                    │
│    ── 间隔 37 天 ──                               │ │                    │  间隔断点
│                                                  │ │                    │
│ 11.21 ◉  学到 · 规则                              │ │                    │  最新一步用环形点
│          ……                                       │ │                    │
│                                                  │ │                    │
│ ┃ 当前理解                                        │ │                    │  金色左边框
│ ┃ 演示版思考路径。                                │ │                    │
│                                                  │ │                    │
│ 由此得出的经验 · 2                                │ │                    │
│ 「……」                                            │ │                    │
│ 共用来源的问题 · 1                                │ │                    │
│ ……                                                │ │                    │
│ ← 上一个问题                      下一个问题 →    │ │                    │
└──────────────────────────────────────────────────┘ └────────────────────┘
```

#### 头部

- 第一行：`{code} · {label}`，Geist Mono 12px `--text-3`，可点击进入主题页
- `h1`：Noto Serif SC 600，桌面 30px / 1.35，手机 24px；字间距 0.01em
- 元信息行：状态胶囊、`statusRaw`（13px `--text-3`）、`{n} 步`、日期区间（`firstDate` 至 `lastDate`，同年时第二个只写 `MM.DD`）
- 阶段条（完整版，见 9.3 组件）

#### 思考轨迹（`<ol class="trace">`）

每一步是一个 `<li>`，栅格为 `grid-template-columns: 64px 20px 1fr`：

- **日期列**（64px）：`MM.DD`，Geist Mono 12px `--text-3`，右对齐；年份与上一步不同或为第一步时上方加一行年份 `2026`
- **脊线列**（20px）：竖线 2px 居中；节点圆点 10px，填充阶段色；最新一步（日期等于 `lastDate` 的最后一个）改为 12px 空心环，2px 描边阶段色。上一段脊线为 `recorded` 时为实线 `--line-strong`，为 `inferred` 时为虚线（`4px 4px`）`--doubt`
- **内容列**：
  - kicker：阶段色点 + `{阶段} · {kind}`，12px，`--text-2`
  - 标题：Noto Serif SC 600 19px / 1.5，`--text`
  - 正文：Noto Serif SC 400 17px / 1.85，`--text`，最大 34em；手机 16px
  - 引用标记：正文末尾追加上标数字 `¹²³`（Newsreader，`font-feature-settings: "sups"`，不支持时用 `<sup>`），编号在**整页内**连续递增，点击时高亮对应页边注

**连接区**（位于两步之间，作为下一步 `<li>` 的第一部分）：

- `recorded`：只显示 `link` 文字，14px `--text-2`，Noto Serif SC
- `inferred`：`「{link}」` + `推断 · 待确认`（12px `--doubt`），下方三个小按钮「确认」「修改」「不成立」（高 28px）。已核对时按 5.5 节显示，不再有按钮
- 间隔断点：`gapDays ≥ 14` 时，在连接区之前插入一行，脊线断开 16px，中间文字 `间隔 {n} 天`，Geist Mono 12px `--text-3`

**选中态**：点击步骤任意位置或路由带 `stepId` 时，该 `<li>` 背景 `--surface-2`，左侧（内容列左缘）出现 2px `--accent` 竖条，圆角 6px；用 `scrollIntoView({ block: "center" })`（动效关闭时 `behavior: "auto"`）；URL 用 `replaceState` 更新为 `#/q/{ideaId}/{stepId}`。

**当前理解**：`summary` 非空时，轨迹末尾显示卡片：左边框 3px `--gold`，标签「当前理解」12px `--gold`，正文 Noto Serif SC 18px / 1.75。`summary` 为空时不显示。

**由此得出的经验**：`ideaId` 等于本问题的经验，用 `lesson-card` 紧凑样式列出，标题 `由此得出的经验 · {n}`；没有则整块不显示。

**共用来源的问题**：`sharedSourceIdeas` 结果，每行 `{问题标题}` + `共用 {n} 条来源` + 主题名；没有则整块不显示。

**上一个 / 下一个问题**：同一主题内按原顺序，首尾不循环；没有时该侧留空。

#### 证据栏（页边注）

- 每个引用一条注释卡（`note` 组件），与其所属步骤的顶部**垂直对齐**；若与上一张卡重叠，向下推移，卡间距最小 12px。实现：渲染后测量每个 `<li>` 的 `offsetTop`，绝对定位注释卡；窗口尺寸变化和字体加载完成（`document.fonts.ready`）后重新计算
- 注释卡内容：编号、来源标题（14px 500）、`{类型} · {MM.DD}`（类型：flomo、Obsidian、对话）、引文 `「{quote}」`（Noto Serif SC 14px / 1.7 `--text-2`）、「查看原文」按钮
- 「查看原文」：在卡内展开原文全文（最大高度 50vh，内部滚动），按钮变「收起」；URL 更新为 `…/src/{sourceId}`；同时只展开一张
- 缺失来源：卡片边框 `--seal`，文字「来源缺失」
- 960 到 1279px：证据栏变抽屉，内容改为按步骤分组的列表，选中步骤时抽屉内滚动到对应组
- < 640px：每一步正文下方显示折叠行 `来源 {n} ▾`，展开后为注释卡列表

#### 键盘

`J` / `K` 下一步 / 上一步；`[` / `]` 上一个 / 下一个问题；`O` 展开或收起当前选中步骤的第一个来源原文；`Y` `E` `N` 在选中步骤为未核对的推断时生效。

### 7.4 主题页（`#/t/{themeId}`）

```text
03 · DEV                                    Geist Mono 12px --text-3
开发                                         Noto Serif SC 600 40px
把……一句话描述                               Noto Serif SC 17px --text-2
3 个问题 · 12 步 · 最近 2026.10.17
[ 看见 ▮▮▮ 想 ▮▮▮▮ 做 ▮▮▮▮▮ 学到 ▮▮ ]        阶段分布条：按 phaseCounts 比例的堆叠条，高 6px，下方图例

问题                                         按 updated 降序
┌──────────────────────────────────────────────────────┐
│ ▮▮▮▯  第二大脑，怎样才能让我更清楚？      [进行中]   │
│       4 步 · 3 天前 · 整理中的联系                   │
├──────────────────────────────────────────────────────┤
│ ……                                                   │
└──────────────────────────────────────────────────────┘
```

每行可点击进入问题页；行高最小 64px；标题 Noto Serif SC 17px，允许两行。

### 7.5 太史公曰（`#/lessons`）

- 页头：`h1` 「太史公曰」Noto Serif SC 600 34px；副标题「{n} 条经验，归入 {m} 种行为模式。每一条都能回到当时的思考。」
- 若**所有**经验 `hasInference` 相同且为 true，在副标题下加一行 13px `--text-3`：「以下经验均含推想成分，请对照出处阅读。」；否则改为在每条含推想的经验后显示胶囊「含推想」
- 筛选胶囊：全部 · 待确认 · 用过的 · 已核对
- 章节：每个模式一章，章序号用中文 `其一` `其二` …；章标题 = 模式名（Noto Serif SC 600 24px）+ `level` 胶囊；描述（Noto Serif SC 16px `--text-2`）；然后是该章经验列表
- 最后一章「未归类」（id 为 `unsorted`），收录 `patternIds` 为空的经验，按所属问题的主题分小节（小节标题为主题名）
- 一条经验属于多个模式时，在每一章都出现
- 经验条目（`lesson-card` 完整样式）：原文 `「…」` Noto Serif SC 19px / 1.7；下一行 13px：`出自〈{问题标题}〉第 {i}、{j} 步`（链接）、`已用 {n} 次`（n>0 时）、状态胶囊（待确认时）、核对胶囊（有决定时）
- 右侧悬浮目录（≥ 1280px，放在证据栏位置）：各章名称，滚动时高亮当前章

### 7.6 来源（`#/sources`）

- 顶部：搜索框（只匹配标题与标签，**不匹配原文**）、筛选胶囊：全部 · flomo · Obsidian · 对话；第二行领域胶囊：投资 invest · AI ai · 创作 create · 阅读 read · 生活 life · 开发 develop；第三行开关「只看被引用的」
- 列表：按日期降序；每行：日期、标题、类型、领域、被引用次数（`被 {n} 步引用`，0 时不显示）
- 选中（`#/sources/{id}`）：≥ 1280px 时详情显示在证据栏；其余宽度为全屏详情页。详情：标题（Noto Serif SC 22px）、元信息、标签（以 `/` 分层显示为面包屑样式）、原文（Noto Serif SC 16px / 1.85，保留换行 `white-space: pre-wrap`）、「被这些步骤引用」列表（每条跳问题页对应步骤）

### 7.7 年表（`#/timeline`）

#### 桌面（≥ 960px）

- 栅格：左侧月份列 72px + 5 个主题列等宽
- 列头：`{code} {label}` + `{n} 步`，`position: sticky; top: 52px`
- 纵轴：从最早步骤所在月 1 日到最晚步骤所在月末，自上而下时间递增。**每天 3px 是无碰撞时的基线，碰撞时按下述规则扩展纵轴**。旧版「一律每天 3px、无例外」口径废止；扩展后不能用点间像素距离直接换算日期间隔，步骤的原始日期不变。
- 每个步骤：一个 8px 阶段色圆点，居中于独立的 **44×44px 命中区**，每步一个 `<a>`，所有命中区面积交集为零，边缘可相接。点击直接跳对应步骤，不合并共同入口。
- 横坐标：同一问题的所有步骤固定在其主题列内的同一水平位置，碰撞时只向下避让。主题内有步骤的问题按 id 排序，水平槽位数 `count = min(7, 问题数)`，第 `index` 个问题取 `offset = (index % count + 0.5) / count`。列宽为 `W` 时，列内圆心为 `22 + offset × max(0, W - 44)` px，左右各预留 22px 命中空间；超过 7 个问题时循环共用槽位。
- 月份横线：每月 1 日一条 1px `--line`，月份列写 `2026.03`（每年 1 月和第一个月写年份，其余只写 `03 月`）。横线与月份标签的定位基准共用下述扩展日期坐标 `dayY`；标签保留原有向上 6px 的视觉偏移。
- 同一问题的相邻步骤用 1.5px 线连接：`recorded` 实线 `--line-strong`，`inferred` 虚线 `--doubt`；连接线两端使用圆点扩展后的实际纵坐标。
- 悬停或聚焦圆点：浮出提示（`{fmtLong} · {阶段} · {kind}` / 步骤标题 / 问题标题）；点击跳问题页对应步骤
- 圆点必须可键盘聚焦（`<a>` 元素，`aria-label` 为「{日期} {问题标题}：{步骤标题}」）

#### 碰撞扩展规则（桌面）

以下规则对应基准实现 `3c35aac` 的 `src/pages/timeline.js` 中 `layoutTimelinePoints` 与 `updateHits`，以实际列宽下的所有主题列圆点共同计算，窗口尺寸变化时重新计算。

1. 以起始月 1 日为第 0 天，步骤日期距起点的天数记为 `day`。步骤先按 `day` 升序，同日再按步骤 `key.localeCompare` 排序；初始累计偏移 `shift = 22` px，为顶部命中区留空间。
2. 当前步骤先取 `y = day × 3 + shift`。逐个检查所有已放置步骤：若两点水平中心距离 **小于 44px**，则令 `y = max(y, 前点 y + 44)`。水平距离等于或大于 44px 的点不要求纵向避让；比较不限于同一问题或同一天。
3. 放置后更新 `shift = y - day × 3`，并保存该步骤的 `{day, shift}`。增加的偏移由后续所有步骤继承，包含同日余下步骤及其他主题列，不会在隔天或月首归零；后续碰撞继续累加。因此同一天多个点可以位于不同高度。同一横坐标上第 0、1 天各有一步时，圆心分别为 22、66px；第 2 天无点时，其日期坐标为 69px。
4. 日期坐标 `dayY(d)` 的偏移默认取 22px。按上述放置顺序扫描记录：遇到日期大于 `d` 的记录就停止；每条不晚于 `d` 的记录更新偏移，遇到日期恰等于 `d` 的第一条记录就立即停止。最终 `dayY(d) = d × 3 + 偏移`。所以有点的当天取当天**第一个点**的偏移，无点的日期取此前**最后一个点**的偏移；同日后续碰撞产生的增量由后面的日期继承，不反向移动当天首点或此前日期。
5. 月首横线按 `dayY(月首 day)` 定位；若月首当天有多步，横线对应当天首点的日期坐标，其余点可在下方。设 `totalDays` 为起止月份所含天数，图表高度为 `dayY(totalDays) + 22` px，即末日之后一天的扩展坐标再留 22px，保证底部命中空间。

#### 手机与 640 到 959px

按月分组的列表，组标题 `2026.03 · {n} 步`；每行：`MM.DD`、阶段色点、步骤标题、问题标题（小字）。

### 7.8 回望（`#/atlas`）

全屏沉浸页：隐藏侧栏、顶栏、证据栏、标签栏；**始终使用深色星空配色**，与用户的深浅主题无关；左上角「← 返回」（`Esc` 同效）回到进入前的页面（无历史则回今天）。

#### 布局算法（确定性，同样的数据每次画面一致）

- 画布中心 `(cx, cy)`，基准尺寸 `S = min(width, height)`
- 5 个主题天区中心：`angle_i = -90° + i × 72°`（按主题原顺序），半径 `0.30 × S`
- 天区内的问题：按 `updated` 升序编号 k = 0,1,2…，位置用黄金角螺旋：`θ = k × 137.508°`，`r = 0.045 × S × √(k + 0.6)`
- 天区雾：以天区中心为圆心、半径 `0.14 × S` 的径向渐变，中心 `rgba(255,255,255,0.035)` 到透明
- 背景星：用 `fnv1a("bg")` 为种子的 mulberry32 随机数生成 260 颗，半径 0.3 到 1.1px，透明度 0.15 到 0.5，静止
- 问题星半径：`2 + 1.1 × stepCount` px（DPR 已换算）

#### 时间播放

- 时间范围：最早步骤日期 → 最晚步骤日期；1× 速度下全程 24 秒，2× 为 12 秒
- 播放头经过一个步骤的日期时，触发该步骤「点亮」：所属问题星的亮度 = 已点亮步数 / 总步数（最低 0.25）；问题星出现前不绘制；点亮瞬间该星外圈闪光一次（半径扩到 3 倍、透明度 0.6 → 0，300ms）；同一天多步依次错开 120ms
- 每次点亮，在星旁显示问题标题 2 秒后淡出（同时最多 3 个标签，超出时最早的提前淡出）
- 星的颜色由「播放头日期 − 该问题最近点亮步骤日期」决定（色温，见 8.2 `--star-*`）：0 天为 `--star-new`，180 天为 `--star-mid`，≥365 天为 `--star-old`，之间线性插值
- 共用来源光桥：两个问题都已出现、且共享至少一条来源时，画一条二次贝塞尔弧（控制点为两点中点向画布中心偏移 15%），`rgba(240,230,210,0.16)`，1px
- 播放结束后停在终点，「播放」按钮变为「重播」

#### 控制条（底部居中，宽 min(720px, 92vw)）

```text
[▶ 播放]  2025.10 ━━━━━━━━━●━━━━━━━━━━━ 2026.10   2026.03.14   [1×]  [☆ 星座]  [⌁ 光桥]
```

- 进度条可拖动，可用 `←` `→` 每次移动一周，`Home` `End` 到起止
- `空格` 播放 / 暂停
- 「星座」开关：显示 5 个行为模式。每个模式的星座 = 其经验所属问题的星（去重），按围绕质心的角度排序后连成闭合折线（只有 2 颗星时为一条线，1 颗时画一个圆环），`--gold` 透明度 0.55，虚线 `3 4`；模式名写在质心，Noto Serif SC 13px
- 「光桥」开关：默认开

#### 交互

- 悬停问题星：显示问题标题与 `{主题} · {n} 步`；指针变手型
- 点击问题星：跳 `#/q/{ideaId}`
- 主题名始终显示在天区上方（Noto Serif SC 15px，`rgba(231,233,230,0.7)`），下方英文名 Geist Mono 10px 字距 0.2em
- 进入页面时：若从「今天」的「播放」进入则自动播放；直接打开则停在终点（完整星空）
- 减少动效或动效关闭：不自动播放、无闪光、无标签淡入淡出，拖动进度条即时更新

#### 渲染

Canvas 2D；`devicePixelRatio` 最大取 2；星的光晕用预渲染的径向渐变离屏 canvas 作为精灵图绘制；只在播放、拖动、悬停变化时重绘，静止时不跑 `requestAnimationFrame`。画布 `aria-hidden="true"`；另提供一个视觉隐藏的 `<ol>` 按日期列出全部问题链接，供屏幕阅读器使用。

### 7.9 空状态与异常

| 场景 | 显示 |
| --- | --- |
| 没有经验数据 | 今日经验卡：标题「今日经验」，正文「还没有经验数据。」13px `--text-3` |
| 待核对为空 | 「都核对过了。」+ 链接「去看看今天」 |
| 问题没有步骤 | 轨迹区显示「这个问题还没有记录步骤。」 |
| 路由中的 ID 不存在 | 主区显示「找不到这个内容。」+ 链接「回到今天」，不报错 |
| 来源搜索无结果 | 「没有匹配的来源。」 |

空状态统一组件 `empty.js`：居中，Noto Serif SC 17px `--text-2`，上下留白 64px，无插画。

---

## 第 8 章 · 视觉系统

### 8.1 风格定义

**「墨与纸」**：深色是夜里伏案的墨，浅色是白天摊开的纸。界面骨架用无衬线，精密克制（像 Linear）；**阅读内容用宋体**，从容舒展（像一本书）。全站只有一个强调色（松绿），金色只属于「学到 / 当前理解」，朱砂只用于「今」印和待核对计数。

### 8.2 颜色令牌（`tokens.css`，逐字复制）

```css
:root,
[data-theme="dark"] {
  --bg: #0d0f0e;
  --surface: #151817;
  --surface-2: #1b1f1d;
  --line: #242927;
  --line-strong: #353c39;
  --text: #e7e9e6;
  --text-2: #a3a9a5;
  --text-3: #7d847f;
  --accent: #4cc38a;
  --accent-ink: #0d0f0e;
  --accent-soft: rgba(76, 195, 138, 0.14);
  --gold: #e0b45c;
  --gold-soft: rgba(224, 180, 92, 0.14);
  --doubt: #8ea2c6;
  --doubt-soft: rgba(142, 162, 198, 0.14);
  --seal: #e0694f;
  --phase-see: #79a6dc;
  --phase-think: #b09cd8;
  --phase-do: #4cc38a;
  --phase-learn: #e0b45c;
  --focus: #9fe3c0;
  --shadow-pop: 0 12px 32px rgba(0, 0, 0, 0.45);
  color-scheme: dark;
}

[data-theme="light"] {
  --bg: #f7f4ee;
  --surface: #fffdf9;
  --surface-2: #f0ece4;
  --line: #e4ded3;
  --line-strong: #cfc7b9;
  --text: #1f1d1a;
  --text-2: #5f5a52;
  --text-3: #6f685d;
  --accent: #1b7a51;
  --accent-ink: #ffffff;
  --accent-soft: rgba(27, 122, 81, 0.1);
  --gold: #8a610b;
  --gold-soft: rgba(138, 97, 11, 0.1);
  --doubt: #4a6290;
  --doubt-soft: rgba(74, 98, 144, 0.1);
  --seal: #b23f2a;
  --phase-see: #33669f;
  --phase-think: #6e53a8;
  --phase-do: #1b7a51;
  --phase-learn: #8a610b;
  --focus: #1b7a51;
  --shadow-pop: 0 12px 32px rgba(60, 45, 20, 0.14);
  color-scheme: light;
}

/* 回望页固定配色，不随主题变化 */
.atlas {
  --sky: #06080f;
  --star-new: #cfe3ff;
  --star-mid: #f4ecd8;
  --star-old: #f0b46a;
  --sky-text: rgba(231, 233, 230, 0.7);
}

:root {
  --font-ui: "Geist", "PingFang SC", "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif;
  --font-read: "Newsreader", "Noto Serif SC", "Songti SC", "STSong", "SimSun", serif;
  --font-mono: "Geist Mono", ui-monospace, "SF Mono", Menlo, monospace;

  --fs-11: 11px; --fs-12: 12px; --fs-13: 13px; --fs-14: 14px; --fs-15: 15px;
  --fs-16: 16px; --fs-17: 17px; --fs-19: 19px; --fs-22: 22px; --fs-24: 24px;
  --fs-30: 30px; --fs-34: 34px; --fs-40: 40px;

  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px; --sp-5: 24px;
  --sp-6: 32px; --sp-7: 48px; --sp-8: 64px;

  --radius: 6px;
  --radius-lg: 10px;

  --dur-1: 120ms; --dur-2: 180ms; --dur-3: 260ms;
  --ease: cubic-bezier(0.2, 0.7, 0.2, 1);

  --sidebar-w: 248px;
  --evidence-w: 320px;
  --topbar-h: 52px;
  --tabbar-h: 56px;
  --read-measure: 34em;
}

[data-motion="off"] { --dur-1: 0ms; --dur-2: 0ms; --dur-3: 0ms; }
```

`data-motion` 与 `data-theme` 由 `prefs.js` 在启动时写到 `<html>` 上：偏好为「跟随系统」时，分别读取 `prefers-reduced-motion` 与 `prefers-color-scheme` 并监听其变化；用户手动切换后写入 `c2b.prefs.v1`，不再跟随系统。CSS 只认这两个属性，不另写媒体查询。

已验证的对比度（对 `--bg`）：深色 `--text` 15.8、`--text-2` 8.0、`--text-3` 5.0、`--accent` 8.7、`--gold` 9.9、`--doubt` 7.5、`--seal` 5.8；浅色 `--text` 15.3、`--text-2` 6.2、`--text-3` 5.0、`--accent` 4.8、`--gold` 5.0、`--doubt` 5.6、`--seal` 5.3。**不得为了「更好看」降低这些值。** `--text-3` 只用于 `--bg` 与 `--surface` 上的辅助信息，不放在 `--surface-2` 上。

**颜色使用规则：**

| 颜色 | 只能用于 |
| --- | --- |
| `--accent` | 当前导航项竖条、主按钮、选中步骤竖条、核对后的「你已确认」、链接悬停、焦点环 |
| `--gold` | 「学到」阶段、当前理解卡、星座线 |
| `--doubt` | 一切「推断」与「待确认」 |
| `--seal` | 「今」印、待核对计数徽标、来源缺失 |
| `--phase-*` | 阶段色点（6 到 10px）、阶段条、年表圆点。**禁止**用作大面积背景或正文色 |

### 8.3 字体

| 用途 | 令牌 | 字号 / 行高 / 字重 |
| --- | --- | --- |
| 界面文字（导航、按钮、标签） | `--font-ui` | 14px / 1.5 / 400，按钮 500 |
| 小号界面文字 | `--font-ui` | 12 到 13px / 1.45 |
| 页面标题 h1 | `--font-read` | 30px / 1.35 / 600（手机 24px） |
| 区块标题 h2 | `--font-ui` | 13px / 1.4 / 600，`--text-2`，字距 0.04em |
| 阅读正文 | `--font-read` | 17px / 1.85 / 400（手机 16px） |
| 步骤标题 | `--font-read` | 19px / 1.5 / 600 |
| 引文、经验 | `--font-read` | 见各页面 |
| 日期、计数、快捷键 | `--font-mono` | 12px，`font-variant-numeric: tabular-nums` |

- `--font-read` 中把 Newsreader 放在前面，是为了让拉丁字母和数字用 Newsreader，中文自动落到 Noto Serif SC
- 中文正文**禁止**两端对齐，使用 `text-align: start`；禁止 `letter-spacing` 大于 0.04em 的中文正文
- 系统回退检查：在 DevTools 里屏蔽 `fonts.googleapis.com` 后，界面必须仍然可读、层级不乱（宋体回退为 Songti SC，无衬线回退为 PingFang SC）

### 8.4 间距、圆角、阴影

- 只使用 `--sp-*` 中的值。页面主区内边距：桌面 `48px 56px`，平板 `32px`，手机 `20px`
- 卡片：`--surface` 底、1px `--line` 边、`--radius-lg` 圆角、内边距 `24px`；**不加阴影**
- 只有浮层（命令面板、抽屉、提示框、toast）使用 `--shadow-pop`
- 层级靠背景明度区分：`--bg` < `--surface` < `--surface-2`

### 8.5 动效

| 场景 | 动效 |
| --- | --- |
| 页面切换 | 新内容 `opacity 0 → 1` + `translateY(4px → 0)`，`--dur-2` |
| 悬停 | 背景色过渡 `--dur-1` |
| 选中步骤 | 背景与竖条 `--dur-1` |
| 抽屉、命令面板 | `opacity` + `translateX(16px)` / `scale(0.98)`，`--dur-2` |
| 待核对条目移除 | 高度与透明度收起 `200ms`，计数数字直接替换 |
| toast | 从下方 8px 淡入 `--dur-2`，5 秒后淡出 |
| 回望 | 见 7.8 |

全部使用 `--ease`。动效关闭或 `prefers-reduced-motion` 时，所有时长为 0，回望不自动播放。禁止：弹跳、视差、无限循环动画（回望播放除外）、加载骨架闪烁。

### 8.6 图标

只使用内联 SVG，16×16 视框，1.5px 描边，`stroke="currentColor"`、`fill="none"`、圆角端点。需要的图标：今天（日出半圆）、待核对（对勾方框）、年表（竖线与点）、回望（四芒星）、太史公曰（书页）、来源（文档）、搜索、复制、深色/浅色（半圆）、动效（波形）、外链箭头、关闭、展开箭头。禁止使用图标字体与 emoji。

---

## 第 9 章 · 组件规格

### 9.1 `ui/dom.js`

```js
export function h(tag, props = {}, ...children) // 创建元素；props 支持 class、dataset、aria-*、on*（事件）；children 为字符串时用 textContent
export function text(str)                        // document.createTextNode
export function clear(el)                        // 移除全部子节点
```

**禁止在任何地方把数据字符串赋给 `innerHTML`。** 静态 SVG 图标可以用 `innerHTML`，但其字符串必须是源代码常量。

### 9.2 状态胶囊 `status-pill`

高 22px，内边距 `0 8px`，圆角 11px，12px 500。
- 待确认：`--doubt-soft` 底，`--doubt` 字
- 进行中：`--accent-soft` 底，`--accent` 字
- 已落地：`--gold-soft` 底，`--gold` 字
- 已核对：透明底，1px `--line-strong` 边，`--text-2` 字
- 你认为不成立：透明底，`--text-3` 字，删除线

### 9.3 阶段条 `phase-bar`

两种尺寸：

- **迷你**（侧栏、列表）：4 个格子，每格 10×4px，间距 2px；该问题出现过的阶段用阶段色填充，未出现的用 `--line-strong`；`role="img"`，`aria-label="已有：看见、想、做；还没有：学到"`
- **完整**（问题页、搁置最久）：4 段等宽，每段之间以 `━━━` 线连接；每段为「圆点 + 阶段名」，出现过的阶段圆点实心阶段色、文字 `--text`，未出现的圆点空心 `--line-strong`、文字 `--text-3`；高 24px

### 9.4 类型标签 `kind-tag`

`<span>`：阶段色点 6px + 间距 6px + `{阶段} · {kind}`，12px `--text-2`。

### 9.5 步骤 `step`

见 7.3。导出 `renderStep(step, { selected, refNumbers, overlayState, onSelect, onDecide })`。

### 9.6 连接 `connector`

见 7.3 与 5.5。导出 `renderConnector(step, overlayState, handlers)`。

### 9.7 注释卡 `note`

见 7.3 证据栏。导出 `renderNote(ref, sourceDoc, number, { expanded })`。

### 9.8 经验卡 `lesson-card`

两种样式：`full`（太史公曰、今日经验）与 `compact`（问题页、待核对）。compact：经验原文 Noto Serif SC 16px，一行元信息。

### 9.9 命令面板 `palette`

- 打开：`⌘K` / `Ctrl K` / `/`（输入框聚焦时 `/` 不触发）；关闭：`Esc` 或点击遮罩
- 尺寸：宽 `min(640px, 92vw)`，距顶 12vh；手机全屏
- 输入框占位：「搜索问题、步骤、经验、来源，或输入命令」
- 空输入时显示「前往」命令：今天、待核对、年表、回望、太史公曰、来源；以及「操作」：切换深色/浅色、切换动效、导出核对记录、复制当前链接
- 有输入时按组显示结果，每组最多 5 条，组顺序：问题、步骤、经验、主题、来源、命令
- 匹配规则（`search.js`）：不区分大小写的子串匹配；索引字段：问题（title、summary）、步骤（title、body）、经验（text）、模式（name，归入「经验」组）、主题（label、en）、来源（title、tags，**不含原文**）、命令（名称）
- 排序：标题以查询开头 > 标题包含 > 其他字段包含；同级按类型顺序，再按日期降序
- 摘要：匹配在非标题字段时，显示命中位置前后各 12 字，命中部分用 `<mark>`（通过 DOM 构造，不用 innerHTML）
- 键盘：`↑` `↓` 移动，`Enter` 执行，`Tab` 不离开面板；关闭后焦点回到打开前的元素
- `role="dialog"`、`aria-modal="true"`；输入框 `role="combobox"`，结果列表 `role="listbox"`

### 9.10 toast

右下角（手机为底部标签栏上方），最多同时 2 条，`--surface-2` 底、`--shadow-pop`、圆角 `--radius`；可含一个操作按钮（如「撤销」）。

### 9.11 按钮

| 类型 | 样式 |
| --- | --- |
| 主按钮 | `--accent` 底，`--accent-ink` 字，高 36px，内边距 `0 14px`，500 |
| 描边按钮 | 透明底，1px `--line-strong` 边，`--text` 字 |
| 文字按钮 | 无边框，`--text-2` 字，悬停 `--text` |
| 小按钮 | 高 28px，12px |

所有可交互元素：`:focus-visible` 时 2px `--focus` 外框，偏移 2px。触摸设备上最小点击区域 44×44px（可用透明扩展区域实现）。

---

## 第 10 章 · 全局键盘与无障碍

### 10.1 全局快捷键

| 键 | 行为 |
| --- | --- |
| `⌘K` / `Ctrl K` / `/` | 打开命令面板 |
| `G` 然后 `T` | 今天 |
| `G` 然后 `R` | 待核对 |
| `G` 然后 `L` | 太史公曰 |
| `G` 然后 `S` | 来源 |
| `G` 然后 `Y` | 年表 |
| `G` 然后 `A` | 回望 |
| `?` | 快捷键说明浮层 |
| `Esc` | 关闭最上层浮层；无浮层时在回望页返回 |

`G` 组合键：按下 `G` 后 1 秒内按第二个键有效。输入框、文本域、`contenteditable` 聚焦时，所有单字母快捷键失效。

### 10.2 无障碍要求

- 地标：`nav`（侧栏、标签栏）、`header`、`main`、`aside`；各带 `aria-label`
- 每页一个 `h1`；层级不跳级
- 思考轨迹是 `<ol>`；每步的 `<li>` 带 `aria-label="第 {i} 步，共 {n} 步，{阶段} · {kind}，{日期}"`
- 推断连接文字对屏幕阅读器可读（不能只靠虚线表达）
- 所有纯装饰元素（脊线、色点、印章）`aria-hidden="true"`
- 浮层打开时焦点陷阱，关闭后焦点归还
- 颜色从不单独承担信息：阶段同时有文字，推断同时有文字，状态同时有文字

---

## 第 11 章 · 文案词表（逐字使用）

| 位置 | 文案 |
| --- | --- |
| 品牌 | 赛博第二大脑 |
| 导航 | 今天 · 待核对 · 年表 · 回望 · 问题 · 资料 · 太史公曰 · 来源 |
| 阶段 | 看见 · 想 · 做 · 学到 |
| 状态 | 待确认 · 进行中 · 已落地 · 已核对 · 你认为不成立 |
| 连接 | 推断 · 待确认 / 推断 · 你已确认 / 推断 · 你的修正：/ 推断 · 你认为不成立 |
| 核对按钮 | 确认 · 修改 · 不成立 · 稍后 |
| 今天页区块 | 今日经验 · 最近在想 · 搁置最久 · 待核对 · 一年回望 |
| 问题页区块 | 当前理解 · 由此得出的经验 · 共用来源的问题 · 上一个问题 · 下一个问题 |
| 证据 | 来源 · 查看原文 · 收起 · 来源缺失 |
| 经验 | 今天用上了 · 已用 {n} 次 · 出自 · 含推想 · 未归类 |
| 顶栏 | 搜索 · 复制链接 · 已复制 · 证据 |
| 侧栏底部 | 深色 · 浅色 · 动效 开 · 动效 关 · 示例数据 · 返回博客 |
| 回望 | 返回 · 播放 · 暂停 · 重播 · 星座 · 光桥 |
| 导出导入 | 导出核对记录 · 导入 · 已合并 {n} 条核对记录 · 文件无法识别 |
| toast | 已记录 · 撤销 |

语气：平实、短句、第二人称「你」；不用感叹号、不用 emoji、不用「哦」「啦」；数字与中文之间留一个半角空格（`4 步`、`37 天`）；书名号〈〉用于问题标题引用，直角引号「」用于引文与经验。

---

## 第 12 章 · 测试

全部用 `node:test` + `node:assert/strict`，零依赖；测试中**只用示例数据或测试内构造的合成数据**，不得出现 `private-data` 字样（会被守门测试拦截）。

| 文件 | 必须覆盖 |
| --- | --- |
| `test-taxonomy.mjs` | 15 种 kind 全部映射正确；未知 kind 归「想」；状态归并的三类各至少 3 个样例，包括「候选整理 · 隐私待确认」「规则待验证」归 pending |
| `test-dates.mjs` | `day` 截取带时间的字符串；`diffDays` 跨月跨年；`fmtAgo` 各区间边界（0、1、2、29、30、364、365）；`fmtToday` 的星期 |
| `test-model.mjs` | 示例数据建模后各计数正确；`Ref.missing` 检测；经验中不存在的步骤被丢弃；`gapDays` 计算；`phases` 集合 |
| `test-derive.mjs` | `sharedSourceIdeas` 排序与上限 5；`dailyLesson` 同一天稳定、不同天可变、空数组返回 null；`staleIdea` 的 `stoppedAt` / `missing`；`reviewQueue` 的排序、排除已决定、排除未到期的稍后 |
| `test-overlay.mjs` | `decide` 不修改入参；`revised` 无 note 抛错；`undo`；`snooze` 日期；`toggleUse` 去重；`importOverlay` 同键以新为准、`uses` 并集、错误文件抛错；损坏 JSON 时 `load` 返回空 |
| `test-search.mjs` | 排序规则；来源原文不被索引；摘要截取 ±12 字；中文子串匹配 |
| `test-router.mjs` | 第 6.1 表中每条路由 `parse` 与 `build` 互逆；旧链接四种形式的转换；未知 hash 回今天；`key` 含 `:` 与 `/` 时的编码 |
| `test-gitignore.mjs` | `.gitignore` 仍包含 `private-data/`（从 legacy 复制并调整路径） |
| `test-no-private-data.mjs` | 扫描 `scripts/*.mjs` 与 `src/**/*.js`，除 `src/data/load.js` 的注释外不得出现 `private-data` 字面量（`index.html` 的 script 标签除外，它不在扫描范围） |
| `test-no-innerhtml.mjs` | 扫描 `src/**/*.js`：`innerHTML =` 只允许出现在赋值右侧为模板常量的图标模块中（维护一个白名单文件列表） |
| `test-tokens.mjs` | 解析 `tokens.css`，按 8.2 的对比度规则验证两套主题 |

统一入口：`node --test scripts/` 运行全部测试。

`scripts/check-model.mjs`：仅当带 `--private` 参数时，用动态 `import` 加载本地真实数据并打印第 3.4 节的统计数字，用于人工核对；不带参数时用示例数据。此文件需加入 `test-no-private-data` 的豁免表，豁免行仅限加载语句。

---

## 第 13 章 · 分阶段实施计划

每一阶段结束都必须：`node --test scripts/` 全绿；本地服务器下用示例数据打开无控制台错误（`private-data` 的 404 除外）；提交截图。

### 阶段 1 · 地基

- 2.2 迁移旧版；建立 2.3 目录结构；2.4 `index.html`
- `tokens.css`、`base.css`（重置、排版基础、焦点样式、`.visually-hidden`、`.skip-link`）
- 扩充示例数据（14.3）
- `data/` 下全部纯模块 + `router.js` + 对应测试

**验收**：全部纯模块测试通过；`node scripts/check-model.mjs` 打印示例数据统计。

### 阶段 2 · 外壳与问题页

- `shell.js`（侧栏、顶栏、标签栏、四个断点）、`prefs.js`（深浅与动效，默认跟随系统，存储于 `c2b.prefs.v1`）
- 问题页完整实现（7.3），含页边注对齐、选中步骤、键盘、旧链接兼容
- 组件：phase-bar、status-pill、kind-tag、step、connector、note、lesson-card(compact)、empty

**验收**：从侧栏打开任意问题；`J` `K` 切换步骤，URL 同步；「查看原文」展开；1440、1100、800、390 四个宽度截图；浅色与深色各一组；屏蔽 Google Fonts 后截图一张。

### 阶段 3 · 今天与待核对

- `overlay.js` 接入界面；今天页（7.1）；待核对页（7.2）含导出导入、撤销、手机滑动
- 问题页的内联核对按钮接通 overlay；侧栏计数实时更新

**验收**：在示例模式下完成一轮核对（确认、修改、不成立、稍后各一次），刷新页面后（同一会话）状态保持；问题页的连接文字按 5.5 变化；导出文件再导入到新会话后状态一致。

### 阶段 4 · 资料页与命令面板

- 主题页（7.4）、太史公曰（7.5，含悬浮目录）、来源（7.6）、命令面板（9.9）、快捷键说明浮层、全局快捷键（10.1）

**验收**：命令面板能找到每种类型的对象并跳转；来源原文不出现在搜索结果里；`G` 组合键全部可用。

### 阶段 5 · 年表与回望

- 年表（7.7）、回望（7.8）

**验收**：回望在示例数据下播放完整、可拖动、可切换星座与光桥；关闭动效后不自动播放；1440×900 与 390×844 截图；播放时在 Chrome 性能面板中主线程无超过 50ms 的长任务。

### 阶段 6 · 打磨与交付

- 逐页对照第 7 到 11 章检查，修正偏差
- 无障碍检查：仅用键盘走完「今天 → 待核对处理一条 → 打开问题 → 查看原文 → 回到今天」
- 性能：首次渲染（示例数据，无缓存）在中端手机模拟（4× CPU 降速）下 1.5 秒内可交互
- 更新 `README.md`：介绍、截图（示例数据）、本地运行、测试命令、数据边界；`current.md` 顶部加一行说明「v3 起以 docs/v3-build-guide.md 为准」

**验收**：第 15 章清单全部打勾。

---

## 第 14 章 · 示例数据要求

### 14.1 原则

示例内容必须明显是虚构的（标题以「示例：」开头或内容自述为演示），不得改写或暗示真实笔记。

### 14.2 现状

`legacy/src/sample-data.js` 已有 5 个主题、5 个问题、3 个步骤、3 条来源，无经验、无记录。

### 14.3 扩充到以下规模（在 `src/data/sample-data.js` 中）

- 每个主题至少 2 个问题，共 ≥ 10 个问题
- 共 ≥ 28 个步骤，覆盖全部 15 种 kind，四个阶段都有
- 步骤日期分布在 2025-10 至 2026-10，至少 8 个不同月份；至少 2 处相邻步骤间隔 ≥ 14 天
- ≥ 5 个步骤为 `inferred`
- 问题状态覆盖三类归并结果，`statusRaw` 至少包含：「候选整理 · 待确认」「正在探索」「已有实际使用」「规则待验证」
- 至少 1 个问题没有步骤；至少 1 个问题 `summary` 为空
- 导出 `SAMPLE_BRAIN_DATA.records` ≥ 8 条，覆盖 flomo 与 obsidian、至少 4 个 domain、带层级标签
- 至少 1 处引用指向不存在的 ID（用于演示「来源缺失」）
- 至少 2 个问题共享同一条来源（用于演示「共用来源的问题」与光桥）
- 新增导出 `SAMPLE_LESSONS = { lessons, patterns }`：≥ 8 条经验（≥ 1 条待确认、≥ 2 条不属于任何模式、≥ 1 条属于两个模式），2 个模式，`level` 为「或曰」

---

## 第 15 章 · 交付清单

- [ ] `node --test scripts/` 全部通过
- [ ] 示例模式与真实数据模式都能运行（真实数据由仓库所有者本地验证）
- [ ] 1440×900、1100×800、800×1000、390×844 四个视口，深浅两套主题，无横向滚动条、无文字溢出、无遮挡
- [ ] 屏蔽 Google Fonts 后界面仍然美观可读
- [ ] 动效关闭与 `prefers-reduced-motion` 下所有功能可用
- [ ] 仅用键盘可完成全部主流程
- [ ] 所有用户数据经 `h()` / `textContent` 写入
- [ ] 没有新增任何依赖，没有构建步骤
- [ ] `private-data/` 未被提交、未出现在测试与截图中
- [ ] 旧版链接（`#/{themeId}/{ideaId}/{stepId}`）能正确跳到新页面
- [ ] `docs/decisions-log.md` 记录了所有自行决定的事项
- [ ] README 已更新

---

## 附录 A · 交给 AI 时使用的提示词模板

每个阶段开一次新对话，粘贴下面这段（替换方括号）：

```text
你是这个仓库的实现者。请先完整阅读 docs/v3-build-guide.md，然后只实现「第 13 章 · 阶段 [N]」的内容。

要求：
1. 严格遵守第 0 章的工作守则，尤其是：不加依赖、不改数据文件、不用 innerHTML 写入数据、文案逐字使用第 11 章。
2. 只修改本阶段需要的文件；前面阶段已完成的代码，除非本文档要求，不要重构。
3. 完成后运行 node --test scripts/，把结果贴出来。
4. 列出本阶段验收条目，逐条说明是否满足；不满足的写明原因。
5. 文档没覆盖的情况，按第 0 章第 7 条处理，并告诉我你记录了什么。

上一阶段的状态：[简述，或写「这是第一个阶段」]
```

## 附录 B · 设计意图速查（执行者拿不准时看这里）

- **为什么阅读内容用宋体？** 思考过程是叙事，宋体让它读起来像文章而不是数据库字段。界面骨架用无衬线，两种字体的分工就是「工具」与「读物」的分工。
- **为什么推断永远是虚线，即使核对过？** 原始记录说它是推断，这个事实不能被后来的核对抹掉。核对是你的新判断，叠加在旁边。
- **为什么只有一个强调色？** 颜色越少，每个颜色的含义越清楚。绿色是「可操作 / 已确认」，金色是「学到」，蓝灰是「推断」，朱砂是「今天与待办」，再多就是装饰了。
- **为什么回望页固定深色？** 它是一个仪式性的时刻，星空只在夜里成立。
- **为什么卡片没有阴影？** 层级靠明度差就够了，阴影会让界面变成一堆浮起来的盒子。
- **为什么「今天」只放这几块？** 每天打开 5 分钟，一屏之内看完：一条经验提醒你怎么做，一个搁置的问题提醒你想什么，几条待核对让你修正什么。
