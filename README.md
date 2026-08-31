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

日常使用先完成用户手册的首次准备，然后双击根目录 `启动Studio.cmd`。脚本会启动 Music Agent（3003）、Folia web（3004）、Electron 开发服务（3000）与 Folia Stage（默认 32107），通过语义健康检查后自动打开 `/studio`；需要停止时双击 `停止Studio.cmd`。若端口被未知进程占用，脚本会列出占用者并拒绝接管。手动多终端启动只作为调试路径保留在用户手册中。

## 许可证

`folia-major/` 是 [chthollyphile/folia-major](https://github.com/chthollyphile/folia-major) 的本地副本，保留 AGPL-3.0 许可证。未来公开或分发本仓库时，必须继续满足该许可证要求。`music-agent/` 不包含真实密钥、数据库、生成媒体或缓存产物。
