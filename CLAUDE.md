# 当前 worktree 工作约定

- `src/` 放原生浏览器 ES modules 和样式；几何计算使用不依赖 DOM 的纯函数，不新增依赖或构建步骤。
- `scripts/test-*.mjs` 放使用 `node:test` 的离线测试，新增测试接入 `scripts/check.mjs`；测试数据使用 fixture 或示例数据。
- 本次仅在 `feat/curved-links` worktree 修改；不读取 `private-data/`、`.env` 或凭据，不启动服务器或浏览器，不 push、部署或访问 R2。
- 连线使用克制且稳定的曲线；线条、流光、生长遮罩共用路径，描线长度随路径更新。保持已有视觉配色，不新增界面文字或图标。
- 完成时运行 `node scripts/check.mjs`，并逐个执行 `node --check src/*.js` 对应文件；全部完成后只提交一次。
