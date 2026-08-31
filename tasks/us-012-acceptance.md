# US-012 验收记录：文档与 PRD 对齐

结论：**通过**

时间：2026-08-31 17:37

## 合同核对

| PRD 合同 | 结果 | 证据 |
|---|---|---|
| 用户文档支持新会话完成启动、生成、调视觉、导出 | 通过 | `docs/使用与开发流程.md` 覆盖环境准备、手动启动、Stage 开启、生成、三预设与三滑杆、保存期待、推送播放、Mock 免费验收、Electron 横竖屏导出与故障排查 |
| 文档主体使用仓库相对路径 | 通过 | 当前入口文档命令均从仓库根目录进入 `music-agent/` 或 `folia-major/`；未再使用本机盘符作为操作依赖 |
| 明确 Music Agent 3003、Folia web 3004、Stage 32107，实际端口以配置为准 | 通过 | 端口表、启动命令、`.env.example`、`folia-stage.ts` 与 `media-output.ts` 均对齐 |
| `PROJECT_STATE.md` 与 `decisions.md` 记录 PRD 为唯一需求源 | 通过 | 两个文件均已登记 PRD v1.3 唯一需求源与冲突处理规则 |
| stale 内容清单 | 通过 | `tasks/us-012-evidence/stale-inventory.md` |
| 文本搜索确认无冲突口径 | 通过 | `tasks/us-012-evidence/text-search.md` |
| US-009 只按文档跑通 | 未执行，非 US-012 假报 | 当前手册明确一键启动尚未实现；US-009 仍在 PRD 验收矩阵中为未验收 |

## 变更范围

- 重写当前用户手册：`docs/使用与开发流程.md`
- 更新入口 README 与技术管线：`README.md`、`music-agent/README.md`、`docs/pipeline.md`
- 将 2026-08-21 执行手册降级为归档索引：`docs/项目执行手册.md`
- 标记 `docs/studio-mode-v2.md` 为历史设计快照
- 对齐默认配置：`FOLIA_WEB_URL=3004`、`MUSIC_AGENT_ORIGIN=3003`，以及对应代码 fallback
- 登记 PRD 唯一需求源：`PROJECT_STATE.md`、`decisions.md`

## 验证

在 `music-agent/` 执行：

```powershell
pnpm test
pnpm exec tsc --noEmit
pnpm lint
pnpm build
```

结果：

- `pnpm test`：19 files / 105 tests，全部通过
- `pnpm exec tsc --noEmit`：通过，无错误输出
- `pnpm lint`：0 errors / 3 warnings，三个 warning 均为既有未使用导入
- `pnpm build`：通过，`/studio` 与全部 API 路由生成
- `git diff --check`：通过

## 边界声明

1. 本验收没有调用真实 LLM 或音乐 Provider，没有生成新歌，没有消耗付费额度。
2. `启动Studio.cmd` 与 `scripts/start-studio.mjs` 当前不存在；手册只声明手动启动，不伪造 US-009。
3. Electron 手动导出步骤是现有能力说明；US-004 的单任务串行横竖屏导出、进度、失败处理与文件校验仍未验收。
4. `docs/superpowers/**` 与历史验收记录中的旧端口、旧路径、旧日期保留为事实证据，不作为当前执行口径。
