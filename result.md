# integration/night-1022b 集成结果

基线：`main` @ `24f62f8`（Merge integration/night-1022）。全部合并在分支 `integration/night-1022b` 上完成，
未切换分支、未合并到 `main`、未推送、未部署、未触碰 R2 与 `private-data/`。

最终提交：`5523ee2`（`5523ee2481efff684120dbedde053d0a14ca1965`）

## 合并顺序

| 顺序 | 分支 | 合并提交 | 冲突 |
|---|---|---|---|
| 1 | feat/two-hop (`c2929e7`) | `7f03ba8` | 无，自动合并 |
| 2 | feat/daily-star (`efead4b`) | `6b865f2` | 无，自动合并 |
| 3 | feat/stacked-reading (`902d7d8`) | `d2d4b3a` | `src/app.js` 1 处 |
| 4 | feat/grow-expand (`9488ede`) | `0a85e20` | 无，自动合并 |
| 5 | feat/core-breathe (`01afe3c`) | `0d0b594` | `src/styles.css` 1 处 |
| 6 | feat/frosted-popover (`dc36407`) | `36deb22` | 无，自动合并 |
| 7 | test/more-tests (`b23600b`) | `a7f5852` | 无，自动合并 |
| 8 | feat/depth-parallax (`80fa232`) | `518c7ca` | 无，自动合并 |
| 9 | feat/zoom-lod (`f187186`) | `a3a75ba` | `src/app.js` 1 处 |

另有两个普通提交：`2ebd00d` 把全部新测试接入 `scripts/check.mjs` 并在 README 补上这批功能；`5523ee2` 记录本集成结果。

## 冲突解法

原则：每个功能都保留，双方改动取并集，不丢弃任何一方的功能代码。

### 1. `src/app.js` — 合并 feat/stacked-reading（约 973 行，Escape 键处理）

- **HEAD 改动**：按 Esc 时，如果「复制视角链接」的回退输入框（`el.copyFallback`）正在显示，先关掉它并把焦点还给复制按钮，直接返回，不再继续关浮框。
- **feat/stacked-reading 改动**：按 Esc 时，如果浮框打开且下面还压着窄卡（`popover.stackDepth`），调用 `retreatStack` 逐级回退一层，而不是直接关闭。
- **解法**：两段都保留。先判断复制链接回退框（它是临时输入态，应该最先退出），再判断叠放阅读的逐级回退，最后才是原有的关闭浮框与返回上层。两段逻辑互不排斥，只是命中了同一个 `if (event.key === "Escape")` 分支。

### 2. `src/styles.css` — 合并 feat/core-breathe（约 1943 行，`@media (prefers-reduced-motion: reduce)`）

- **HEAD 改动**（来自 feat/daily-star）：在减少动态效果时关掉每日一星的脉冲动画，`.star.is-daily::after` 设 `animation: none`、固定透明度与缩放。
- **feat/core-breathe 改动**：同一个媒体查询里关掉中心节点的呼吸过渡，`.node[data-type="core"] .node-art` 设 `transition: none`。
- **解法**：两条 CSS 规则都保留，各自成为完整的规则块，顺序为先每日一星、后中心呼吸。它们选择器不相交，没有覆盖关系。

### 3. `src/app.js` — 合并 feat/zoom-lod（约 571 行，函数定义）

- **HEAD 改动**（来自 feat/stacked-reading）：新增 `retreatStack(index)`，按窄卡层数把路由逐级退回并还原浮框内容。
- **feat/zoom-lod 改动**：新增 `locatedNodeId(route)`，返回当前路由定位到的节点，让键盘或链接跳到的节点在缩放分层下仍显示文字。
- **解法**：合并算法把两个相邻的新函数误判成同一处冲突。两个函数都完整保留，`retreatStack` 在前、`locatedNodeId` 在后。已确认两者在文件中各只定义一次，且 `scene.setLocated(locatedNodeId(route))` 的调用点已合入，没有重复定义。

## 测试接线

`scripts/check.mjs` 的测试列表现在覆盖 `scripts/` 下全部 14 个 `test-*.mjs`，一次 `node scripts/check.mjs` 全部跑完：

`test-route`、`test-graph`、`test-layout`、`test-random`、`test-sources-dedup`（原有），加上 `test-two-hop`、`test-daily-star`、`test-grow`、`test-core-breathe`、`test-anatomy`、`test-camera`、`test-glyphs`、`test-parallax`、`test-lod`。

## README

功能列表补上八条：两跳关联、叠读、每日一星、展开动画、中心呼吸、毛玻璃浮框、景深视差、缩放分层。
同步更新了单元测试的运行清单与目录结构中的新文件（`glow.js`、`lod.js`、`parallax.js`）。

## 回归结果

全部通过，退出码均为 0。

- `node scripts/check.mjs`：101 条全部 `ok`（其中 87 条为脚本内联断言，另 14 条为 14 个测试文件各自运行通过）。
- `scripts/test-*.mjs` 逐个单独运行：14 个文件、共 **168** 条断言全部通过。
  - test-anatomy 7、test-camera 12、test-core-breathe 8、test-daily-star 63、test-glyphs 6、test-graph 16、test-grow 4、test-layout 11、test-lod 9、test-parallax 4、test-random 7、test-route 9、test-sources-dedup 3、test-two-hop 9。
- `src/*.js` 逐个 `node --check`：20 个文件全部通过。

检查只使用示例数据，未传入 `--private-data`，未读取 `private-data/`、`.env`、`.wrangler/` 或任何密钥。
