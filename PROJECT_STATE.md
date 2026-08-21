# PROJECT_STATE

Updated: 2026-08-21 19:52
Current phase: implementation / verification

## 一句话现状
仓库已经具备 Music Agent + Folia 的本地闭环骨架；真实生成 provider 已切到公司音乐代理（musicproxy），Provider 封面已接入。本轮把真实公司网关歌曲推送到 Stage 验证通过，完成了 Folia 播放器渲染与横竖屏视频导出自动验收，并修复 Folia dev 冷启动期间空 `#root` 看似白屏的问题。

## 已接受事实
- 项目定位是个人、非商业、自用工作流；核心链路为“AI 生成音乐 -> Folia 播放器/可视化 -> 导出视频”。来源：本轮用户确认。
- `music-agent/` 是 Next.js + pi Agent + Provider 兼容层，`folia-major/` 是 Folia AGPL-3.0 上游副本。来源：README.md 与 initial commit `a47ade8`。
- `music-agent` 的 `pnpm install --frozen-lockfile`、`pnpm db:push`、`pnpm lint`、`pnpm build` 均已完成；本轮 lint 为 0 error，build 通过但保留既有动态文件系统 tracing warnings。来源：本轮命令结果。
- `folia-major` 的 `npm ci`、`npm run typecheck` 已通过；测试 1614 passed、1 skipped，唯一失败是 `test/unit/lyrics/architecture.test.ts` 冷启动超时，单跑通过。来源：上一轮验证记录。
- Stage 上传的 `audioFile` 会写入当前 session working directory，`cleanupInactiveStageSessions()` 会把 `stageActiveSessionId` 加入保留集合，因此活动媒体文件在会话切换前不会被提前删除。来源：`folia-major/electron/stageApi.cjs`。
- Task 9 mock 验收使用 `http://127.0.0.1:3002` 的隔离 Music Agent 与 `http://127.0.0.1:32107` 的临时 Stage，验收后已清理；本轮端到端复验时 3001 / 3002 / 32107 均可访问。来源：本轮命令结果。
- 真实生成走公司统一音乐代理 `musicproxy`，`.env.local` 已配置 `SUNO_PROVIDER=musicproxy`；公司网关鉴权头为 `Authorization: <MUSIC_PROXY_API_KEY>`，不带 `Bearer`。来源：本轮验证与 `musicproxy.ts`。
- 封面优先下载公司网关返回的 `image_url`，失败或缺失时回退本地渐变 PNG。来源：本轮 `media-output.ts` 修改。
- Folia dev 冷启动时，动态加载的 bootstrap 依赖图完成编译前 `#root` 会保持为空；用户看到的“没有东西”是该窗口内的空白状态。来源：本轮 `http://127.0.0.1:3001/` 浏览器实测与 `src/index.tsx` 动态 import 链路。
- 公司音乐代理当前不支持 Extend、Cover / Remix 与替换段落；Music Agent 详情页对应操作已显式禁用并说明原因。来源：本轮产品结论与 `song-detail-client.tsx`。

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
- Folia dev 首屏启动占位与加载失败提示 — `folia-major/src/index.tsx`、`folia-major/src/bootPlaceholder.ts`、`folia-major/test/ui/bootPlaceholder.spec.ts` — 验证：3001 页面 1 秒内显示 `Folia / 正在启动...`，完整界面接管时无 console error；UI 回归覆盖启动态和失败态。

## 已验收
- 本轮已通过 `music-agent pnpm test`（3 files / 12 tests）、`pnpm exec tsc --noEmit`、`pnpm lint`（0 error / 3 既有 warning）；`folia-major` 的 Stage API 开发者冒烟与真实 Stage 推送已验证。
- 本轮已通过 Task 9 的 mock 免费离线验收：中文/日文生成、封面与副字幕文件、Stage 自动推送、断 Stage 兜底与恢复重推均通过；临时验收产物已清理。
- 本轮已通过 `folia-major npm run typecheck`、`npx playwright test test/ui/bootPlaceholder.spec.ts`；`http://127.0.0.1:3001/` 1 秒内显示启动态，完整界面约 4 秒接管且 console error 为空。
- 本轮 Electron 导出产物 `exports/夏夜花火-export-test.mp4` 与 `exports/夏夜花火-export-portrait.mp4` 经 ffprobe 验证分别为 1920x1080、1080x1920，均约 30 秒且为 H.264+AAC；两段视频保留在本地，未纳入 Git。
- 尚未完成用户本人对 Folia 播放器画面和两段导出视频的目视验收。

## 未决问题
- P2 — Folia 播放器画面和导出视频仍需用户本人目视确认 — 负责人：用户 — 阻塞：无 — 下一步：查看 3001 启动态、完整界面与 `exports/` 内两段视频。
- P1 — Mock 歌词短输入仍按均分时间轴，不是词级对齐；真实后端可优先使用 `getTimestampedLyrics`。来源：`music-agent/src/app/api/jobs/[id]/route.ts`。
- P1 — Agent 系统提示词在模块加载时一次性拼入全部 harness 文件，token 成本偏高；当前未做按阶段动态加载。来源：`music-agent/src/lib/agent/prompt.ts`。
- P2 — Next build 仍报告 `media-output.ts` 的动态文件系统 tracing warnings；当前不影响单机自用，但未来若部署需收窄路径或加 ignore 标记。

## 下一步
1. 用户打开 `http://127.0.0.1:3001/`，确认冷启动首屏可见 `Folia / 正在启动...`，随后完整界面出现。
2. 用户查看两段本地导出视频，确认歌词、封面和横竖屏画面符合预期。
3. 如画面或视频需调整，基于用户目视反馈继续迭代；无需调整则本轮交付闭环。

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
- 2026-08-21 晚间 — 修复 Folia dev 冷启动空白首屏，完成 3001 浏览器验收、UI 回归、类型检查、Music Agent 12 测试与横竖屏导出探针 — 影响 Folia 启动体验与 Task 10 状态。
