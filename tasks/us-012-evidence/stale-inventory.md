# US-012 stale 内容盘点

盘点时间：2026-08-31

对比对象：当前工作区与 Git 基线中的入口文档。历史验收记录、历史设计资料和隔离验收端口只作为事实保留，不改写。

| 类别 | 旧内容 / 位置 | 处理 | 保留原因 |
|---|---|---|---|
| 旧端口：Folia web `3001` | 原 `README.md`、`docs/使用与开发流程.md`、`docs/pipeline.md`、`music-agent/README.md`、`music-agent/.env.example`、`music-agent/src/lib/folia-stage.ts` | 当前口径统一为 `3004`；样例环境与未配置 fallback 同步 | `3001` 是当时目录索引/历史验收事实，不是当前 Folia web 约定 |
| 旧端口：Music Agent `3000` | 原 `music-agent/README.md` 快速开始、`music-agent/.env.example` 的 `MUSIC_AGENT_ORIGIN`、`music-agent/src/lib/media-output.ts` fallback | 当前口径统一为 `3003`；启动命令显式 `pnpm dev --port 3003` | 避免与本机其他 dev 服务冲突，并与 PRD 约定一致 |
| 旧端口：隔离验收 `3002` | 原 `docs/使用与开发流程.md` Mock 附录 | 当前 Mock 手册改用 `3003`，并保留隔离 DB 与 media 目录 | 原端口是当时隔离验收事实；日常手册不需要另起口径 |
| 历史端口：`3005`、`3006`、`32108` | `tasks/us-*-acceptance.md`、`tasks/us-*-evidence/`、`PROJECT_STATE.md` 历史事实 | 不修改 | 它们是当时隔离服务或真实验收的运行事实，不是当前配置口径 |
| 本机绝对路径 | 原 `README.md`、`docs/使用与开发流程.md` 多处 `D:\从Agent到音乐可视化\...` | 当前入口文档改为仓库相对路径与 `Push-Location` / `Pop-Location` | 新会话或新设备克隆位置可能不同；主体不应绑定本机盘符 |
| 历史绝对路径 | `docs/superpowers/**` 中 `D:\github项目\...` | 归档不改，当前入口文档声明其不是执行口径 | 历史计划的原始证据 |
| 旧日期与旧排期 | `music-agent/README.md` 2026-08-18 验证状态、P0-P3 路线；`docs/项目执行手册.md` 2026-08-21 任务 2-8 状态与下一步 | `music-agent/README.md` 改为当前 R0 模块与验证命令；执行手册降级为历史归档索引 | 避免旧市场路线和旧任务状态覆盖 PRD v1.3 的 R0/R1 顺序 |
| 旧技术结论 | `docs/pipeline.md` 曾写翻译 sidecar 不随 media session 进入、不自动产出 `lyrics.t.lrc`、只能考虑内嵌 metadata | 改为显式 `translationLyrics` 优先，内嵌 USLT 回退；落盘包含 `lyrics.t.lrc` | US-002/US-003 已验收 Stage multipart 翻译与完整 payload |
| 旧 Stage 合同描述 | 原 pipeline 只列音频与主歌词字段 | 补充 `translationLyrics`、`coverFile`、`visualConfig`，并说明 session 级外观覆盖 | 与 `folia-stage.ts`、`stageApi.cjs` 和 `API_SCHEMA.md` 当前合同一致 |
| 未实现的启动入口 | PRD US-009 要求 `启动Studio.cmd` 与 `scripts/start-studio.mjs`，仓库当前不存在 | 当前手册明确只能手动启动，README 声明一键脚本尚未实现 | US-012 不伪造 US-009 实现；后续按 PRD 补齐后再改手册 |
| 归档设计 | `docs/superpowers/**`、`docs/studio-mode-v2.md` | 入口文档显式声明为历史资料；`studio-mode-v2.md` 标记历史快照 | 保留设计演化证据，不作为当前需求或排期 |

## 处理后的入口文件

- `README.md`
- `docs/使用与开发流程.md`
- `docs/pipeline.md`
- `docs/项目执行手册.md`（归档索引）
- `docs/studio-mode-v2.md`（历史设计快照）
- `music-agent/README.md`
- `music-agent/.env.example`
- `music-agent/src/lib/folia-stage.ts`
- `music-agent/src/lib/media-output.ts`
- `PROJECT_STATE.md`
- `decisions.md`
