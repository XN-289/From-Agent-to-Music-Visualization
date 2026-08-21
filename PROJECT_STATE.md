# PROJECT_STATE

Updated: 2026-08-21 13:10
Current phase: implementation / verification

## 一句话现状
仓库已经具备 Music Agent + Folia 的本地闭环骨架；代码任务 2-8 已完成，真实生成 provider 已切到公司音乐代理（musicproxy），Provider 封面已接入。本轮把真实公司网关歌曲推送到 Stage 验证通过，修复了本地音频文件名读取 bug，并用 mock provider 完成了 Task 9 的免费离线验收。

## 已接受事实
- 项目定位是个人、非商业、自用工作流；核心链路为“AI 生成音乐 -> Folia 播放器/可视化 -> 导出视频”。来源：本轮用户确认。
- `music-agent/` 是 Next.js + pi Agent + Provider 兼容层，`folia-major/` 是 Folia AGPL-3.0 上游副本。来源：README.md 与 initial commit `a47ade8`。
- `music-agent` 的 `pnpm install --frozen-lockfile`、`pnpm db:push`、`pnpm lint`、`pnpm build` 均已完成；本轮 lint 为 0 error，build 通过但保留既有动态文件系统 tracing warnings。来源：本轮命令结果。
- `folia-major` 的 `npm ci`、`npm run typecheck` 已通过；测试 1614 passed、1 skipped，唯一失败是 `test/unit/lyrics/architecture.test.ts` 冷启动超时，单跑通过。来源：上一轮验证记录。
- Stage 上传的 `audioFile` 会写入当前 session working directory，`cleanupInactiveStageSessions()` 会把 `stageActiveSessionId` 加入保留集合，因此活动媒体文件在会话切换前不会被提前删除。来源：`folia-major/electron/stageApi.cjs`。
- 本轮 mock 验收使用 `http://127.0.0.1:3002` 的隔离 Music Agent 与 `http://127.0.0.1:32107` 的临时 Stage；验收结束后这些临时服务均已停止，正式使用需按手册重新启动。来源：本轮 mock 验收与进程清理。
- 真实生成走公司统一音乐代理 `musicproxy`，`.env.local` 已配置 `SUNO_PROVIDER=musicproxy`；公司网关鉴权头为 `Authorization: <MUSIC_PROXY_API_KEY>`，不带 `Bearer`。来源：本轮验证与 `musicproxy.ts`。
- 封面优先下载公司网关返回的 `image_url`，失败或缺失时回退本地渐变 PNG。来源：本轮 `media-output.ts` 修改。

## 决策索引
- 2026-08-20 — 以个人工作台而非多租户产品推进；不做账号、权限、协作、运营后台。来源：用户本轮确认。
- 2026-08-20 — 保留 Folia 内置 Electron 视频导出作为纯净视频主路径，不另起浏览器截图录制。来源：`docs/pipeline.md`。
- 2026-08-20 — 对本地相对音频 URL 采用“先读本地 `public/` 文件，失败再按 `MUSIC_AGENT_ORIGIN` HTTP 下载”的兼容策略。来源：本轮修改 `music-agent/src/lib/media-output.ts`。
- 2026-08-21 — 同步 GitHub 最新基线 `d88a5e9`，接受《项目执行手册》《完整体验设计》《实现计划》作为后续执行入口。来源：本次 `git merge --ff-only origin/main`。
- 2026-08-21 — 真实生成改用公司统一音乐代理 `musicproxy`，不再默认 `sunoapi`；封面优先采用 Provider `image_url`。来源：用户明确要求，本轮落地。

## 已实现
- 本地音频 URL 落盘修复 — `music-agent/src/lib/media-output.ts` — 验证：Mock 生成任务完成后，`data/media/<songId>/audio-01-v0.wav` 与 `audio-02-v1.wav` 均存在。
- 紧凑结构标记歌词解析 — `music-agent/src/lib/audio/lrc.ts` — 验证：`[Intro] 测试前奏 [Verse] ...` 被拆成 4 个 `LyricsLine`，`.lrc` 时间戳逐行分布。
- `.env.example` 增加 `MUSIC_AGENT_ORIGIN` — `music-agent/.env.example` — 作为本地相对 URL 的显式回退来源。
- Provider 生成封面下载与 MIME 自适应 — `music-agent/src/lib/media-output.ts`、`music-agent/src/lib/media-mime.ts`、`music-agent/src/lib/providers/musicproxy.ts` — 已验证 Stage 冒烟、单测、类型检查与构建通过。
- 真实 MP3 USLT 双帧写入改用自定义 ID3v2.3 writer — `music-agent/src/lib/mp3-metadata.ts` — 验证 `scripts/check-metadata.mjs` 读回原文与翻译两轨 `USLT`，`hasTimeline: true`。
- 真实公司网关歌曲推送 Stage 成功 — `music-agent/src/lib/folia-stage.ts` — `mediaSession.translationLyrics`、`lyricsText`、`coverUrl` 均返回；封面接口 200 `image/jpeg`。
- 音频文件加载正则修复 — `music-agent/src/lib/media-output.ts` — 原正则 `audio-\d+-\d+-` 无法匹配真实 `audio-01-<uuid>.mp3`，已改为 `audio-\d+-.+`；复跑后真实推送成功。
- 免费离线验收链路 — `SUNO_PROVIDER=mock` + 隔离 SQLite + 临时 Stage — 中文歌生成音频/歌词/封面齐全，日文歌 `lyrics.t.lrc` 与 `meta.json.tLrc` 正确；关闭 Stage 后生成仍成功，手动推送返回 503，重启 Stage 后重推返回 200。

## 已验收
- 本轮已通过 `music-agent pnpm test`（3 files / 12 tests）、`pnpm exec tsc --noEmit`、`pnpm lint`（0 error / 3 既有 warning）；`folia-major` 的 Stage API 开发者冒烟与真实 Stage 推送已验证。
- 本轮已通过 Task 9 的 mock 免费离线验收：中文/日文生成、封面与副字幕文件、Stage 自动推送、断 Stage 兜底与恢复重推均通过；临时验收产物已清理。
- 还未把“Folia 桌面端渲染 + Electron 视频导出”标记为已验收，因为尚未启动 Folia 桌面端进行播放器目视/导出验收。

## 未决问题
- P0 — Folia 桌面端播放器渲染与 Electron 视频导出尚未实测 — 负责人：当前会话 — 阻塞：需要启动 Folia 桌面端并开启 Stage Mode。
- P1 — Mock 歌词短输入仍按均分时间轴，不是词级对齐；真实后端可优先使用 `getTimestampedLyrics`。来源：`music-agent/src/app/api/jobs/[id]/route.ts`。
- P1 — Agent 系统提示词在模块加载时一次性拼入全部 harness 文件，token 成本偏高；当前未做按阶段动态加载。来源：`music-agent/src/lib/agent/prompt.ts`。
- P2 — Next build 仍报告 `media-output.ts` 的动态文件系统 tracing warnings；当前不影响单机自用，但未来若部署需收窄路径或加 ignore 标记。
- 注意 — `music-agent/drizzle.config.ts` 与 `music-agent/src/lib/db/index.ts` 有上一轮未提交修改，本轮未改动，也未提交。

## 下一步
1. 启动 Folia 桌面端并开启 Stage Mode，重新按 Folia UI 显示的端口/token 同步 Stage token，完成一次真实歌曲自动推送/自动播放目视验证。
2. 在 Folia 中核对日文副字幕、Provider 封面，并分别导出横屏与竖屏视频。
3. 完成 Task 10 用户目视测试，然后按 Task 11 复查流程文档，全部完成后合并回 `main`。

## 恢复上下文
- 仓库根目录：`D:\从Agent到音乐可视化`
- 启动 Music Agent：`cd music-agent; pnpm db:push; pnpm dev`
- 启动 Folia：`cd folia-major; npm run dev` 或 `npm run dev:electron`
- 验证命令：`music-agent` 内 `pnpm lint`、`pnpm build`；`folia-major` 内 `npm run typecheck`、`npm test`
- 已知坑：Windows 中文路径；Folia Stage token 来自 Electron 设置；Folia 使用 Node >= 24.0.0；SQLite 使用 WAL 且写入方唯一。

## 最近更新
- 2026-08-20 — 修复本地音频落盘、歌词解析，完成静态 Stage 生命周期核查并创建状态台账 — 影响 `music-agent` 本地闭环。
- 2026-08-21 — 拉取 GitHub 更新到 `d88a5e9`，同步设计/计划/执行手册，更新后续任务索引 — 影响项目执行入口。
- 2026-08-21 午间 — 真实公司网关歌曲推送 Stage 成功，修复本地音频文件名读取正则，复跑 music-agent 测试/类型检查/lint — 影响 `music-agent` 端到端链路。
- 2026-08-21 午后 — 完成 mock 免费离线链路验收并清理临时环境，更新使用/开发流程与执行手册 — 影响 Task 9、Task 11 状态。
