# From Agent to Music Visualization

本地个人创作闭环：在 Music Agent 里聊出歌曲，生成音频、歌词、翻译与封面；保存视觉期待后推送到 Folia Stage；再用 Folia Electron 播放和导出横竖屏视频。

## 当前入口

- 需求源与 R0 验收合同：[tasks/prd-agent-music-visual-studio.md](tasks/prd-agent-music-visual-studio.md)
- 用户手册：[docs/使用与开发流程.md](docs/使用与开发流程.md)
- 当前状态与下一步：[PROJECT_STATE.md](PROJECT_STATE.md)
- 决策记录：[decisions.md](decisions.md)
- 技术管线：[docs/pipeline.md](docs/pipeline.md)

PRD 是唯一需求源。实现、测试、文档或排期与它冲突时，先修订 PRD 并登记决策，再改代码或文档。

## 仓库结构

```text
music-agent/   Next.js + pi Agent + 音乐 Provider 兼容层
folia-major/   Folia 播放器、Stage API 与 Electron 导出
docs/          手册、技术说明与历史资料
tasks/         PRD 与用户故事验收记录
```

## 快速验证

```powershell
Push-Location music-agent
pnpm install
pnpm db:push
pnpm test
pnpm build
Pop-Location

Push-Location folia-major
npm install
npm run typecheck
npm test
Pop-Location
```

日常使用按用户手册手动启动：Music Agent 使用 `3003`，Folia web 使用 `3004`，Folia Stage 默认 `32107`；实际端口以配置和 Folia 界面为准。US-009 的一键启动脚本尚未实现，不要假设根目录已有 `启动Studio.cmd`。

## 许可证

`folia-major/` 是 [chthollyphile/folia-major](https://github.com/chthollyphile/folia-major) 的本地副本，保留 AGPL-3.0 许可证。未来公开或分发本仓库时，必须继续满足该许可证要求。`music-agent/` 不包含真实密钥、数据库、生成媒体或缓存产物。
