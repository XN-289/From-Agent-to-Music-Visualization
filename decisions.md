# Decisions

- 2026-08-31 — US-009 一键启动直接拉起可长期存活的 Node / Vite / Electron 进程，不嵌套 `npm` / `pnpm` / `concurrently` 包装进程；启动状态只记录本仓库拥有的进程树，停止与失败清理前必须重新校验命令行或可执行路径归属，未知端口占用者只展示不结束。来源：`tasks/us-009-acceptance.md`。

- 2026-08-31 — `tasks/prd-agent-music-visual-studio.md`（PRD v1.3）是本项目唯一需求源；实现、测试、文档与排期冲突时，先修订 PRD 并登记决策，再修改代码或文档。来源：US-012 文档对齐。

- 2026-08-26 — 项目从“Music Agent + Folia 管线拼接”升级为“Agent 导演 + Folia 舞台 + 视觉配方”的统一个人创作产品；v2 先落地 `/studio`、可保存视觉配方与内嵌舞台预览，不做账号、云同步或自研渲染引擎。来源：用户确认 v2 方向。
