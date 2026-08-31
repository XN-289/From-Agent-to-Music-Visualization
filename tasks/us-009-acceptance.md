# US-009 验收记录：独立全流程与一键启动

| 项 | 内容 |
|---|---|
| 日期 | 2026-08-31 |
| 当前结论 | 启动实现通过；机器冷启动通过；用户独立全流程验收未执行 |
| 验收边界 | US-009 整体保持未验收，直到用户只按文档完成生成、配方保存、真实播放、横竖屏导出并给出结论 |

## 启动实现

| PRD 合同 | 结果 | 证据 |
|---|---|---|
| 根目录提供 `启动Studio.cmd` 与 `scripts/start-studio.mjs` | 通过 | 双击入口只调用启动脚本；脚本直接启动 Music Agent、Folia web、Electron 开发服务与 Folia Electron |
| 端口预检与未知占用保护 | 通过 | 端口空闲时冷启动；无状态文件但端口被占时列出 PID / 进程 / 命令行并拒绝，不结束未知进程 |
| 健康服务复用 | 通过 | `node scripts/start-studio.mjs --reuse` 语义复查四个服务后复用并打开 `/studio` |
| 全有或全无 | 通过 | 失败启动会停止本次已拉起且仍归属本仓库的进程，写入失败状态与日志，不打开 Studio |
| 语义健康检查 | 通过 | HTML 服务要求 HTTP 200、doctype 与页面语义标记；Stage 要求 `enabled=true`、`modeEnabled=true`、`source=stage-api` |
| 状态与日志 | 通过 | `.runtime/studio-services.json` 记录 runId、进程、端口、健康检查与日志路径；`.runtime/logs/<runId>/` 每次独立，保留最近 10 次 |
| 安全停止 | 通过 | `停止Studio.cmd` 只结束状态记录中当前命令行 / 可执行路径仍归属本仓库的进程 |

## 机器冷启动证据

成功运行：

- Run ID：`20260831T122355-b101ccb6`
- 启动时间：`2026-08-31T12:23:55.307Z`
- 就绪时间：`2026-08-31T12:24:08.148Z`
- 运行状态：`running`
- 记录进程：10 个
- 日志目录：`.runtime/logs/20260831T122355-b101ccb6/`
- 端口：3000 Electron dev server、3003 Music Agent、3004 Folia web、32107 Stage
- 自动打开：`http://127.0.0.1:3003/studio`

对抗路径：

- 旧服务占用但缺少状态文件时，脚本列出 3000 / 3003 / 3004 / 32107 的占用者并拒绝接管。
- 失败运行 `20260831T121917-f1999056` 触发全有或全无清理，停止 PID `31864`、`25620`、`25408`、`11056`、`9988`，四个必需端口随后为空。
- 停止脚本成功停止 10 个已记录且归属本仓库的进程，四个必需端口随后为空。
- 复用路径通过四个服务的语义健康复查。

`.runtime/` 是本机运行态并被 Git 忽略；本记录保存可迁移的机器证据。另一台设备应按 `docs/使用与开发流程.md` 完成依赖与本地配置后重跑冷启动，不把本机 runId 当作该设备的运行态。

## 验证

在仓库根目录执行：

```powershell
node --test scripts/studio.test.mjs
node --check scripts/start-studio.mjs
node --check scripts/stop-studio.mjs
git diff --check
```

结果：

- `node --test scripts/studio.test.mjs`：12 tests 通过
- `node --check scripts/start-studio.mjs`：通过
- `node --check scripts/stop-studio.mjs`：通过
- `git diff --check`：通过

本轮只新增根目录启动脚本与文档，不修改 `music-agent/` 与 `folia-major/` 产品代码；因此未重复跑两个子项目的全量测试套件。最近一次相关全量结果见 `PROJECT_STATE.md`。

## 未完成

1. 用户尚未从停止状态双击启动后，只按文档完成生成、配方保存、真实播放、横竖屏导出。
2. 任何用户卡点都记为缺陷；修复后必须完整重跑 US-009，不能只补单点。
3. 本验收没有调用真实 LLM 或音乐 Provider，没有生成新歌，没有消耗付费额度。
