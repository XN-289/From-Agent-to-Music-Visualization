# From Agent to Music Visualization

把「音乐 Agent」与「Folia 音乐可视化播放器」串成一条本地闭环：

1. 在 Music Agent 中讨论并生成歌曲，歌词与时间轴随任务落盘；
2. 生成完成后自动或手动推送到本机 Folia Stage API；
3. 在 Folia 中直接得到已导入、可播放、可切全屏歌词可视化的一首歌；
4. 桌面端优先使用 Folia 内置视频导出，产出不含聊天 UI 的纯净视频。

## 仓库结构

```text
.
├── music-agent/   # Next.js + pi Agent + 公司音乐代理/Suno 兼容层
├── folia-major/   # Folia 播放器，AGPL-3.0
└── docs/          # 管线说明与对抗性检验报告
```

## 快速启动

### 1. Music Agent

```powershell
cd D:\从Agent到音乐可视化\music-agent
pnpm install
Copy-Item .env.example .env.local
pnpm db:push
pnpm dev
```

在 `.env.local` 中至少填好：

```env
DEEPSEEK_API_KEY=...

# 本机实际配置：sunoapi（真实）+ mock（免费演示）
SUNO_PROVIDER=sunoapi
MUSIC_PROXY_BASE_URL=http://114.132.214.9:8800
MUSIC_PROXY_API_KEY=...
MUSIC_PROXY_DEFAULT_PROVIDER=suno_openaihk
MUSIC_PROXY_MODEL=auto

# Folia Stage 一键导入
FOLIA_STAGE_BASE_URL=http://127.0.0.1:32107
FOLIA_STAGE_TOKEN=...
FOLIA_WEB_URL=http://127.0.0.1:3001
```

### 2. Folia

```powershell
cd D:\从Agent到音乐可视化\folia-major
npm install
Copy-Item .env.example .env.local
npm run dev
```

桌面端可运行：

```powershell
npm run dev:electron
```

然后在 Folia 设置里启用 `Stage Mode`，来源选择 `Stage API`，复制当前端口和 `Bearer token`。`FOLIA_STAGE_BASE_URL` 要以 Folia 界面实际显示的 Stage 端口为准，不一定总是 `32107`。

### 3. 串起来

Music Agent 歌曲详情页已有 `push-folia` 入口；生成完成后点击即可调用 `POST /stage/session`，把本地音频和 `.lrc` 文件推给 Folia。

更细的启动、双语翻译、Stage 打通与验收步骤见 [docs/使用与开发流程.md](docs/使用与开发流程.md)；接口契约与启动排错见 [docs/pipeline.md](docs/pipeline.md)。

## 许可证与上游

- `folia-major/` 是 [chthollyphile/folia-major](https://github.com/chthollyphile/folia-major) 的本地副本，保留 AGPL-3.0 许可证。
- `music-agent/` 是当前工作区项目代码，不包含真实密钥、数据库、生成音频或缓存目录。
- 如果未来要把本仓库公开，需要继续遵守 Folia 的 AGPL-3.0 条件。

## 验证

验证命令：

```powershell
cd music-agent
pnpm test
pnpm build

cd ..\folia-major
npm run typecheck
npm test
```

对抗性检验结果、测试命令和已知缺陷见 [docs/adversarial-review.md](docs/adversarial-review.md)。
