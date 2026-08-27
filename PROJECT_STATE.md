# PROJECT_STATE

Updated: 2026-08-27 17:00
Current phase: implementation / verification

## 一句话现状
项目方向已从“Music Agent + Folia 管线拼接”升级为“Agent 导演 + Folia 舞台 + 视觉配方”的统一个人创作产品。本轮已把 `/studio` 的视觉配方通过 Stage API 推送到 Folia 原生播放器，并在真实歌词+音频播放状态下复验三种配方；`neon-night` 已提亮，不再是黑屏。

## 已接受事实
- 2026-08-26 方向升级为用户确认的个人创作产品，而非单纯把两个项目拼起来；MVP 边界为 `/studio`，不引入账号、云同步、协作或自研渲染引擎。来源：用户确认与 `decisions.md`。
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
- `FOLIA_WEB_URL` 已从 `3001` 改为 `3004`，因为 `3001` 当前是目录索引服务而不是 Folia；本地 Music Agent 与 Folia dev 分别跑在 `3003`、`3004`。来源：本轮 `Invoke-WebRequest` 与浏览器验证。
- `http://127.0.0.1:32107` 的 Stage API 已启动并进入 `stage-api` 媒体会话模式；Music Agent 通过 multipart `visualConfig` 推送视觉配方，Folia `App.tsx` 在 `StageMediaSession.updatedAt` 变化时应用该配置。来源：本轮 `Invoke-WebRequest` 与端到端播放截图。
- `music-agent -> visualConfig -> StageMediaSession -> App useEffect` 已闭合，不是仅生成带 `cfg` 的 URL。来源：本轮代码与真实播放器复验。
- Folia web 舞台接受 `?obs=1&obsSource=now-playing` 与 `cfg`/`visualizer` 参数；`cfg` 使用与 `folia-major/src/utils/appearanceCodec.ts` 一致的 minified JSON + base64 shortcode。来源：本轮代码与 Folia 入口。

## 决策索引
- 2026-08-26 — 项目从“Music Agent + Folia 管线拼接”升级为“Agent 导演 + Folia 舞台 + 视觉配方”的统一个人创作产品；v2 先落地 `/studio`、可保存视觉配方与内嵌舞台预览，不做账号、云同步或自研渲染引擎。来源：用户确认，`decisions.md`。
- 2026-08-20 — 以个人工作台而非多租户产品推进；不做账号、权限、协作、运营后台。来源：用户本轮确认。
- 2026-08-20 — 保留 Folia 内置 Electron 视频导出作为纯净视频主路径，不另起浏览器截图录制。来源：`docs/pipeline.md`。
- 2026-08-20 — 对本地相对音频 URL 采用“先读本地 `public/` 文件，失败再按 `MUSIC_AGENT_ORIGIN` HTTP 下载”的兼容策略。来源：本轮修改 `music-agent/src/lib/media-output.ts`。
- 2026-08-21 — 同步 GitHub 最新基线 `d88a5e9`，接受《项目执行手册》《完整体验设计》《实现计划》作为后续执行入口。来源：本次 `git merge --ff-only origin/main`。
- 2026-08-21 — 真实生成改用公司统一音乐代理 `musicproxy`，不再默认 `sunoapi`；封面优先采用 Provider `image_url`。来源：用户明确要求，本轮落地。

## 已实现
- Studio Mode `/studio` 统一工作台 — `music-agent/src/app/studio/page.tsx`、`music-agent/src/components/studio/studio-workspace.tsx` — 验证：桌面与 390px 宽度浏览器几何检查无横向溢出，面板独立滚动，`Folia` iframe 冷启动后进入完整界面。
- 视觉配方数据模型与三个预设 — `music-agent/src/lib/visual-recipe.ts`、`music-agent/src/lib/visual-recipe.test.ts` — 验证：`pnpm exec vitest run src/lib/visual-recipe.test.ts` 4 tests 通过。
- 视觉配方到 Folia 原生舞台参数映射 — `music-agent/src/lib/visual-recipe-to-folia.ts`、`music-agent/src/lib/visual-recipe-to-folia.test.ts` — 验证：`pnpm exec vitest run src/lib/visual-recipe-to-folia.test.ts src/lib/visual-recipe.test.ts` 8 tests 通过。
- Studio iframe 从 CSS 滤镜预览切到 Folia 原生 `now-playing` OBS URL — `music-agent/src/components/studio/studio-workspace.tsx`、`music-agent/src/app/studio/page.tsx` — 验证：`pnpm build` 通过，`/studio` 路由保留。
- 视觉配方保存 API — `music-agent/src/app/api/songs/[id]/visual-recipe/route.ts` — 验证：浏览器点击“雨窗民谣”并保存，`PATCH .../visual-recipe` 返回 200，页面出现“视觉配方已保存”。
- 歌曲表 `visual_recipe` JSON 列 — `music-agent/src/lib/db/schema.ts` — 验证：`pnpm db:push` 提示 `Changes applied`。
- 导航入口 `Studio` — `music-agent/src/app/layout.tsx` — 验证：`pnpm build` 产物包含 `/studio` 动态路由。
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
- 本轮新增视觉配方映射后，`pnpm exec tsc --noEmit`、`pnpm lint`（0 error / 3 既有 warning）、`pnpm build`、新增 8 tests 均通过。来源：本轮命令结果。
- 本轮已通过 Task 9 的 mock 免费离线验收：中文/日文生成、封面与副字幕文件、Stage 自动推送、断 Stage 兜底与恢复重推均通过；临时验收产物已清理。
- 本轮已通过 `folia-major npm run typecheck`、`npx playwright test test/ui/bootPlaceholder.spec.ts`；`http://127.0.0.1:3001/` 1 秒内显示启动态，完整界面约 4 秒接管且 console error 为空。
- 本轮 Electron 导出产物 `exports/夏夜花火-export-test.mp4` 与 `exports/夏夜花火-export-portrait.mp4` 经 ffprobe 验证分别为 1920x1080、1080x1920，均约 30 秒且为 H.264+AAC；两段视频保留在本地，未纳入 Git。
- 尚未完成用户本人对 Folia 播放器画面和两段导出视频的目视验收。
- 本轮已用本地 Ollama `qwen2.5vl:3b` 对三个配方的 Folia now-playing OBS 空播放画面做视觉初检：`livehouse` 呈现暖橙、`rain-window` 呈现深蓝暗调、`neon-night` 近似黑屏；视觉模型判断与截图 RGB 统计一致。来源：本轮 Playwright 截图与 Ollama API。
- 本轮已完成真实播放状态下三配方视觉复验：`livehouse` 被判定“红蓝动态感强，像音乐可视化播放器”；`rain-window` 被判定“深蓝柔和、烟花/日文歌词可见”；`neon-night` 提亮后由本地模型判定“深蓝但歌词、线条、星星可见，像播放器”，RGB 均值由约 `[5,9,19]` 提升到 `[15.7,30.5,62.1]`。来源：`exports/stage-*-playing*.png` 与 `qwen2.5vl:3b`。

## 未决问题
- P1 — Studio 保存按钮已用 `recipeChanged(savedRecipe, recipe)` 在保存后禁用；本轮未再用浏览器复刷，但代码路径已闭合。来源：`studio-workspace.tsx`。
- P1 — 三种配方真实播放画面的本地视觉模型复验已通过，但最终“是否就是我们想要的效果”仍待用户本人目视确认。来源：本轮 `qwen2.5vl:3b` 复验。
- P1 — `neon-night` 已从近似黑屏提亮到“深蓝但元素可见”；是否继续提亮到更鲜明氛围，留给用户按个人审美拍板。来源：`visual-recipe-to-folia.ts` 与视觉复验。
- P2 — Folia 播放器画面和导出视频仍需用户本人目视确认 — 负责人：用户 — 阻塞：无 — 下一步：查看 3001 启动态、完整界面与 `exports/` 内两段视频。
- P1 — Mock 歌词短输入仍按均分时间轴，不是词级对齐；真实后端可优先使用 `getTimestampedLyrics`。来源：`music-agent/src/app/api/jobs/[id]/route.ts`。
- P1 — Agent 系统提示词在模块加载时一次性拼入全部 harness 文件，token 成本偏高；当前未做按阶段动态加载。来源：`music-agent/src/lib/agent/prompt.ts`。
- P2 — Next build 仍报告 `media-output.ts` 的动态文件系统 tracing warnings；当前不影响单机自用，但未来若部署需收窄路径或加 ignore 标记。

## 下一步
1. 让用户本人目视确认三种配方的真实播放画面，尤其是 `neon-night` 当前亮度是否符合预期。
2. 如继续提亮 `neon-night`，同步更新 `visual-recipe-to-folia.test.ts` 断言并重跑 `pnpm test`。
3. 若要做下一个体验增量，优先接词级时间轴（真实后端 `getTimestampedLyrics`）或按阶段动态加载 Agent prompt，降低 token 成本。

## 恢复上下文
- 仓库根目录：`D:\从Agent到音乐可视化`
- 启动 Music Agent：`cd music-agent; pnpm db:push; pnpm dev`
- 启动 Folia：`cd folia-major; npm run dev` 或 `npm run dev:electron`
- 验证命令：`music-agent` 内 `pnpm lint`、`pnpm build`；`folia-major` 内 `npm run typecheck`、`npm test`
- 已知坑：Windows 中文路径；Folia Stage token 来自 Electron 设置；Folia 使用 Node >= 24.0.0；SQLite 使用 WAL 且写入方唯一。

## 最近更新
- 2026-08-27 — 闭合真实 Stage 推送与视觉配方应用链路，完成三配方真实播放视觉复验；提亮 `neon-night` 并将单测断言对齐新色值，`music-agent` 36 tests、`folia-major` typecheck 与 Stage API 11 tests 全绿。影响 v2 视觉验收与交付状态。
- 2026-08-20 — 修复本地音频落盘、歌词解析，完成静态 Stage 生命周期核查并创建状态台账 — 影响 `music-agent` 本地闭环。
- 2026-08-21 — 拉取 GitHub 更新到 `d88a5e9`，同步设计/计划/执行手册，更新后续任务索引 — 影响项目执行入口。
- 2026-08-21 午间 — 真实公司网关歌曲推送 Stage 成功，修复本地音频文件名读取正则，复跑 music-agent 测试/类型检查/lint — 影响 `music-agent` 端到端链路。
- 2026-08-21 午后 — 完成 mock 免费离线链路验收并清理临时环境，更新使用/开发流程与执行手册 — 影响 Task 9、Task 11 状态。
- 2026-08-21 晚间 — 修复 Folia dev 冷启动空白首屏，完成 3001 浏览器验收、UI 回归、类型检查、Music Agent 12 测试与横竖屏导出探针 — 影响 Folia 启动体验与 Task 10 状态。
