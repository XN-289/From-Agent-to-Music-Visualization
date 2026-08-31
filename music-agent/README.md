# Music Agent

Music Agent 是「Agent 导演 + Folia 舞台 + 视觉配方」工作流的创作端。`/studio` 汇聚会话、作品、构图预览与视觉期待；生成完成后负责媒体落盘、数据库持久化与 Stage 推送。

完整用户流程见 [docs/使用与开发流程.md](../docs/使用与开发流程.md)，需求与验收合同见 [tasks/prd-agent-music-visual-studio.md](../tasks/prd-agent-music-visual-studio.md)。

## 技术栈

- Next.js 16 App Router + React 19 + TypeScript + Tailwind v4
- pi Agent 运行时，按需求挖掘、写词、生成、迭代分阶段装载 harness
- DeepSeek 或 OpenAI 兼容中转站
- 音乐 Provider 兼容层：`mock`、`musicproxy`、`sunoapi`
- SQLite + Drizzle，本地媒体写入 `data/media/`
- Vitest、ESLint、TypeScript

## 快速开始

```powershell
pnpm install
Copy-Item .env.example .env.local
pnpm db:push
pnpm dev --port 3003
```

打开 `http://127.0.0.1:3003/studio`。Folia web 默认 `3004`，Stage 默认 `32107`；实际地址以 `.env.local` 与 Folia 界面为准。

`.env.example` 的关键配置：

```env
DEEPSEEK_API_KEY=
SUNO_PROVIDER=musicproxy
MUSIC_PROXY_BASE_URL=http://127.0.0.1:8800
MUSIC_PROXY_API_KEY=
FOLIA_STAGE_BASE_URL=http://127.0.0.1:32107
FOLIA_STAGE_TOKEN=
FOLIA_WEB_URL=http://127.0.0.1:3004
MUSIC_AGENT_ORIGIN=http://127.0.0.1:3003
```

修改环境变量后必须重启 dev server。真实 Provider 会消耗额度；离线验收使用 `SUNO_PROVIDER=mock`。

## 核心模块

```text
src/app/studio/                        Studio 工作台
src/components/chat/                   对话与生成状态
src/components/studio/                 构图预览与视觉期待卡
src/lib/agent/                         pi Agent、阶段路由与生成门禁
src/lib/audio/lrc.ts                   歌词、翻译与时间轴
src/lib/providers/                     Mock 与真实音乐 Provider
src/lib/media-output.ts                音频、歌词、封面、meta 落盘
src/lib/song-delivery.ts               自动/手动 Stage 交付
src/lib/folia-stage.ts                 Stage health 与 multipart push
src/lib/visual-recipe*.ts              三预设、规范化与 Folia 映射
src/lib/db/schema.ts                   SQLite schema 与视觉配方字段
```

## 常用命令

```powershell
pnpm test
pnpm exec tsc --noEmit
pnpm lint
pnpm build
pnpm prompt:stats
```

## 运行边界

当前是单用户、单实例本地应用：Agent 会话、事件 hub、限流桶与 SQLite 写入方都在同一进程内，不做账号、云同步、协作或多租户。真实生成走公司统一音乐代理时不支持 Extend、Cover、替换段落等未开放能力，UI 会显式禁用。
