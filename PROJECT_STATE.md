# PROJECT_STATE

Updated: 2026-08-31 20:01
Current phase: implementation / verification

## 一句话现状
项目已进入 PRD v1.3 的 R0“现有体验收口”批次。当前基线为 `01ac744` + 证据工作区，`US-001 对话生成中文歌`、`US-002 日文歌中文翻译副字幕`、`US-003 自动推送 Stage 与兜底`、`US-005 Studio 三栏工作台`、`US-006 当前配方保存`、`US-007 配方驱动 Folia 原生舞台`、`US-008 三配方用户定稿`、`US-010 Mock 结构感知时间轴`、`US-011 Prompt 分阶段加载`、`US-012 文档与 PRD 对齐` 已通过；`US-004` 已完成真实 Electron 横竖屏导出与机器证据，待用户看片确认后关闭，最后冷启动验收 `US-009`。

## 已接受事实
- PRD v1.3（`tasks/prd-agent-music-visual-studio.md`）是唯一需求源；实现、测试、文档与排期冲突时，先修订 PRD 并登记决策，再修改代码或文档。来源：US-012 与 `decisions.md`。
- 当前用户手册为 `docs/使用与开发流程.md`；Music Agent 3003、Folia web 3004、Stage 默认 32107，实际端口以配置和 Folia 界面为准。`启动Studio.cmd` 与 `scripts/start-studio.mjs` 尚未实现，当前只提供手动启动步骤。来源：`tasks/us-012-acceptance.md`。
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
- 2026-08-31 拉取 GitHub 后基线快进到 `2978b22`（`wip: harden generation pipeline for PRD R0`），新增 PRD v1.3、US-001 验收记录、生成请求门禁、生成状态、媒体探测与对应测试。来源：`git pull --ff-only` 与 `git log`。
- 2026-08-31 当前基线已推进到 `01ac744`（`feat: advance R0 studio and export pipeline`），R0 Studio、Stage、导出与多数验收记录已在提交内。来源：`git log` 与 `git status`。
- PRD v1.3 规定 R0 门槛为 `US-001` 至 `US-012` 全部通过；执行顺序是先修生成产物完整性与失败态，再修 Stage，再收口 Studio、Mock 时间轴、Prompt 与文档，用户定稿三配方后正式导出，最后冷启动跑 `US-009`。来源：`tasks/prd-agent-music-visual-studio.md`。
- `US-001` 已按 Mock 与真实 Provider 双链路验收：中文歌产物、歌词、封面、数据库终态、SHA-256 与离线无网络断言均有记录；`pnpm test` 12 files / 61 tests、`tsc --noEmit`、`pnpm lint`（0 error / 3 warning）通过。来源：`tasks/us-001-acceptance.md`。
- `US-002` 已按 Mock 日文歌、独立 `t.lrc`、MP3 双 USLT、Stage multipart 与真实浏览器 DOM 采样验收：songId `20e25d17-b339-421d-b835-96e4eedb0507`，四个主/译同屏时间点偏差均不超过 300ms；本轮还把日文翻译完整性门禁下沉到 `submitGeneration()` 付费/落库前。来源：`tasks/us-002-acceptance.md`。
- `US-003` 已按 Stage 停止态生成、异步 `needs_retry`、恢复后手动重推、完整 payload 与用户手势自动播放验收：songId `95b44b23-bdbd-427b-b392-efd86bede177`，Stage session 含 WAV、PNG、日文主 LRC、中文翻译 LRC 与 `rain-window(37,-7,43)` 映射，浏览器播放时钟连续递增。来源：`tasks/us-003-acceptance.md`。
- `US-007` 已按配方 session 覆盖、无配方恢复、切歌/清空/新 session 隔离、白天模式恢复、Stage 断连与三预设真实音频区分验收；对抗测试发现并修复 Stage 断连后旧音频继续播放的问题。来源：`tasks/us-007-acceptance.md`。
- `US-005` 已按 Mock Provider、隔离数据库与临时 Folia 完成桌面/移动布局、面板滚动、预览失败重试与 Provider 模式可见性验收；全程未调用真实 Provider、未生成新歌、未消耗付费额度。来源：`tasks/us-005-acceptance.md`。
- `US-006` 已按 Mock Provider 与隔离数据库完成视觉期待展示、保存状态矩阵、失败恢复、服务端规范化回填、再次变脏与刷新恢复验收；全程未调用真实 Provider、未生成新歌、未消耗付费额度。来源：`tasks/us-006-acceptance.md`。
- `US-011` 已按 baseline 快照、四阶段 prompt 快照、保守 token 统计、质量 rubric、阶段路由、空对话防误进 generation 与真实 `DefaultResourceLoader.reload()` 逐字装载测试验收；最低降幅 50.38%，全程未调用真实 LLM / 音乐 Provider。来源：`tasks/us-011-acceptance.md`。
- `US-008` 已按固定真实歌、固定段落、固定 viewport、固定亮度和严格顺序完成用户定稿；Livehouse、Rain Window、Neon Night 均由用户明确判定通过，当前最终配方为 `neon-night(72,4,76)`。来源：用户确认与 `tasks/us-008-acceptance.md`。
- `US-004` 已用定稿配方完成真实 Electron 串行横竖屏导出：job `stage-export-1788175429500-d9920797-6f51-407d-82e0-fc5210676ece` 成功，两个 MP4 均为 H.264 Baseline + AAC LC，帧数分别为 10,285 / 10,801，8 个抽帧哈希全部不同。来源：`tasks/us-004-acceptance.md` 与 ffprobe / Get-FileHash 命令结果。

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
- 日文歌中文翻译副字幕 — `music-agent/src/lib/audio/lrc.ts`、`media-output.ts`、`mp3-metadata.ts`、`folia-stage.ts`、`folia-major/electron/stageApi.cjs` — 主/翻逐行共轴、MP3 双 USLT、Stage 独立 `translationLyrics` 字段与付费前共享门禁均已有测试；`music-agent` 15 files / 68 tests、`folia-major` 212 files / 1616 tests 通过。来源：`tasks/us-002-acceptance.md`。
- Stage 推送兜底 — `music-agent/src/lib/song-delivery.ts`、`jobs/[id]/route.ts`、`push-folia/route.ts`、`visual-recipe/route.ts` 与 Studio/详情/聊天 UI — 生成终态与 Stage 交付解耦，交付状态持久化，配方竞态不会假报已推送，新歌不抢占 Studio 编辑会话。来源：`tasks/us-003-acceptance.md`。
- Folia dev 首屏启动占位与加载失败提示 — `folia-major/src/index.tsx`、`folia-major/src/bootPlaceholder.ts`、`folia-major/test/ui/bootPlaceholder.spec.ts` — 验证：3001 页面 1 秒内显示 `Folia / 正在启动...`，完整界面接管时无 console error；UI 回归覆盖启动态和失败态。
- Stage session 外观覆盖 — `folia-major/src/services/stageAppearanceSession.ts`、`App.tsx`、`useThemeController.ts`、`useSettingsUiStore.ts` — 验证：配方只覆盖当前 session，不写全局动画偏好；`visualConfig: null`、清空、关闭、新 session 与白天切换均恢复本地外观。
- Stage 音频源清空 — `folia-major/src/utils/audioSourceTransition.ts`、`usePlaybackAudioBridge.ts` — 验证：Stage 断连后旧音频暂停、复位并移除 `src`，不再继续播放不可达 URL。
- Studio Provider 模式与构图预览状态机 — `music-agent/src/components/studio/stage-preview.tsx`、`stage-preview-state.ts`、`studio-workspace.tsx`、`app/studio/page.tsx` — 验证：Mock/真实模式标签、预检、iframe watchdog、可重试失败态、滞后成功事件保护与 SSR 标题均有测试；`pnpm test` 17 files / 80 tests、`tsc --noEmit`、`pnpm lint`、`pnpm build` 通过。
- 视觉期待卡片与保存状态 — `music-agent/src/components/studio/visual-recipe-expectation.tsx`、`studio-workspace.tsx`、`api/songs/[id]/visual-recipe/route.ts` — 验证：色卡、预设名、语义特征、与已保存值差异、变脏/保存中/成功/失败/恢复状态、服务端规范化回填与 350ms 预览防抖均有测试或浏览器证据；`pnpm test` 18 files / 85 tests、`tsc --noEmit`、`pnpm lint`、`pnpm build` 通过。
- Mock 结构感知时间轴 — `music-agent/src/lib/audio/lrc.ts`、`jobs/[id]/route.ts` — 验证：结构加权、无结构均分 fallback、真实时间轴有效性校验与坏数据回退均有测试；`pnpm test` 18 files / 89 tests、`tsc --noEmit`、`pnpm lint`、`pnpm build` 通过。
- Prompt 四阶段加载 — `music-agent/src/lib/agent/prompt.ts`、`prompt-stage.ts`、`pi.ts`、`src/lib/harness/prompt-stages.json`、`stages/*.md`、`scripts/prompt-stats.mjs` — 验证：需求挖掘 / 写词 / 生成 / 迭代只装载本阶段 harness，阶段 session 复用同 chat 最新历史，失败可重试，空对话“生成吧 / 开始生成”不直接进入 generation；`pnpm test` 19 files / 105 tests、`pnpm exec tsc --noEmit`、`pnpm lint`、`pnpm build` 通过。
- R0 文档与 PRD 对齐 — `README.md`、`docs/使用与开发流程.md`、`docs/pipeline.md`、`docs/项目执行手册.md`、`music-agent/README.md`、`.env.example`、`folia-stage.ts`、`media-output.ts` — 验证：当前手册覆盖启动、生成、视觉期待、播放与手动导出；入口文档无旧端口 / 本机绝对路径 / 旧排期冲突；`pnpm test` 19 files / 105 tests、`tsc --noEmit`、`lint` 0 error / 3 既有 warning、`build` 通过。来源：`tasks/us-012-acceptance.md`。
- US-004 横竖屏导出实现 — `music-agent/src/app/api/songs/[id]/export-folia/route.ts`、`export-folia/open/route.ts`、`folia-export-panel.tsx` 与 Folia Stage `/stage/export/*` API、`electron/videoExportWindow.cjs`、`useElectronVideoExportController.ts` — 验证：真实 Electron 串行导出成功；横竖屏均为 H.264 + AAC MP4；窗口物理尺寸与缩放显式校验；本轮 Music Agent `pnpm test` 19 files / 105 tests、`tsc --noEmit`，Folia `npm run typecheck` 与导出 / Stage API 2 files / 19 tests 均通过。来源：`tasks/us-004-acceptance.md`。

## 已验收
- `US-012 文档与 PRD 对齐` 机器验收通过：PRD 唯一需求源已登记；用户手册支持手动全流程；3003 / 3004 / 32107 端口口径统一；旧日期、旧端口、旧路径、旧排期与旧翻译结论已盘点并归档。来源：`tasks/us-012-acceptance.md` 与 `tasks/us-012-evidence/`。
- `US-002 日文歌中文翻译副字幕` 机器验收通过：Mock 任务终态 completed，两个 24 秒 WAV、封面、`lyrics.lrc`、`lyrics.t.lrc` 齐全；Stage 状态含独立主/翻歌词；0/6/12/18 秒浏览器 DOM 均同屏，最大偏差 259.792ms；MP3 原文与中文翻译双 USLT 逐字读回一致。来源：`tasks/us-002-acceptance.md`。
- `US-003 自动推送 Stage 与兜底` 机器验收通过：Stage 停止时生成仍 completed 且交付异步进入 needs_retry；恢复后手动重推 HTTP 200，音频/主翻歌词/封面/保存配方完整进入 Stage；有用户手势时自动播放，audio clock 从 0 单调走到 2.790817s。来源：`tasks/us-003-acceptance.md`。
- 本轮 US-003 验证通过：`music-agent pnpm test` 16 files / 74 tests、`pnpm lint` 0 error / 3 既有 warning、`pnpm exec tsc --noEmit`、`pnpm build`；`folia-major npm run typecheck`、`npm test` 212 files / 1616 tests passed、1 skipped。来源：本轮命令结果。
- 本轮最终验证通过：`music-agent pnpm test` 15 files / 68 tests、`pnpm lint` 0 error / 3 既有 warning、`pnpm exec tsc --noEmit`、`pnpm build`；`folia-major npm run typecheck`、`npm test` 212 files / 1616 tests passed、1 skipped。来源：本轮命令结果。
- 本轮已通过 `music-agent pnpm test`（3 files / 12 tests）、`pnpm exec tsc --noEmit`、`pnpm lint`（0 error / 3 既有 warning）；`folia-major` 的 Stage API 开发者冒烟与真实 Stage 推送已验证。
- 本轮新增视觉配方映射后，`pnpm exec tsc --noEmit`、`pnpm lint`（0 error / 3 既有 warning）、`pnpm build`、新增 8 tests 均通过。来源：本轮命令结果。
- 本轮已通过 Task 9 的 mock 免费离线验收：中文/日文生成、封面与副字幕文件、Stage 自动推送、断 Stage 兜底与恢复重推均通过；临时验收产物已清理。
- 本轮已通过 `folia-major npm run typecheck`、`npx playwright test test/ui/bootPlaceholder.spec.ts`；`http://127.0.0.1:3001/` 1 秒内显示启动态，完整界面约 4 秒接管且 console error 为空。
- 本轮 Electron 导出产物 `exports/夏夜花火-export-test.mp4` 与 `exports/夏夜花火-export-portrait.mp4` 经 ffprobe 验证分别为 1920x1080、1080x1920，均约 30 秒且为 H.264+AAC；两段视频保留在本地，未纳入 Git。
- 尚未完成用户本人对 Folia 播放器画面和两段导出视频的目视验收。
- 本轮已用本地 Ollama `qwen2.5vl:3b` 对三个配方的 Folia now-playing OBS 空播放画面做视觉初检：`livehouse` 呈现暖橙、`rain-window` 呈现深蓝暗调、`neon-night` 近似黑屏；视觉模型判断与截图 RGB 统计一致。来源：本轮 Playwright 截图与 Ollama API。
- 本轮已完成真实播放状态下三配方视觉复验：`livehouse` 被判定“红蓝动态感强，像音乐可视化播放器”；`rain-window` 被判定“深蓝柔和、烟花/日文歌词可见”；`neon-night` 提亮后由本地模型判定“深蓝但歌词、线条、星星可见，像播放器”，RGB 均值由约 `[5,9,19]` 提升到 `[15.7,30.5,62.1]`。来源：`exports/stage-*-playing*.png` 与 `qwen2.5vl:3b`。
- `US-007 配方驱动 Folia 原生舞台` 机器验收通过：Song A `bbcae587-6a94-4492-9fb3-3c348a9224ae` 携带 Neon Night，Song B `930ef4d1-b815-4594-b605-75ae66dc8009` 无配方；A/B/A、全新剖面、Daylight、清空、新 session 与断连恢复均有证据。来源：`tasks/us-007-acceptance.md`。
- `US-005 Studio 三栏工作台` 机器验收通过：1440x900 与 390x844 均 `scrollWidth = clientWidth` 且 `main` 不滚动；移动端左栏、对话、右栏可独立滚动；Folia 停止后 2753ms 出现可重试错误且 iframe 卸载，重启后重试 3414ms 恢复。来源：`tasks/us-005-acceptance.md` 与 `tasks/us-005-evidence/`。
- `US-006 当前配方保存` 机器验收通过：无配方歌曲设置 Livehouse 后展示 `高能量 · 暖色 · 强副歌` 与具体差异；停服保存失败但草稿保留且可重试，恢复服务后保存成功并禁用按钮；再改夏夜霓虹回到未保存，刷新后仍恢复已保存 Livehouse。来源：`tasks/us-006-acceptance.md` 与 `tasks/us-006-evidence/`。
- `US-010 Mock 结构感知时间轴` 机器验收通过：Mock 24 秒日文歌按 Intro/Verse/Chorus/Outro 权重生成 `0-2400-6400-10400-16000-21600-24000ms` 边界，主/翻完全共轴；空、乱序、重叠、负数、倒置、越界与纯标记真实时间轴均回退。来源：`tasks/us-010-acceptance.md` 与 `tasks/us-010-evidence/`。
- `US-011 Prompt 分阶段加载` 机器验收通过：baseline 17,674 字符 / 估算 12,022 tokens；discovery / lyric / generation / iteration 分别估算 2,082 / 5,965 / 4,035 / 3,926 tokens，降幅 82.68% / 50.38% / 66.44% / 67.34%，四阶段质量 rubric 与 DefaultResourceLoader 逐字装载测试均通过。来源：`tasks/us-011-acceptance.md` 与 `tasks/us-011-evidence/`。
- `US-008 三配方用户定稿` 用户验收通过：用户原话为 `Livehouse 通过，Rain Window 通过，Neon Night 通过`；九张播放截图 SHA-256 已复核，三个 Stage session 与 `machine-review.json` 一致。来源：`tasks/us-008-acceptance.md` 与 `tasks/us-008-evidence/`。
- `US-004 横竖屏导出` 机器证据通过：真实 Electron 主窗口导出、串行任务、MP4 编码、分辨率、帧数、动态抽帧、无聊天 UI 复核与最终测试均通过；用户尚未确认成片可发布。来源：`tasks/us-004-acceptance.md` 与 `tasks/us-004-evidence/final-20260831-*`。

## 未决问题
- P2 — Next build 仍报告 `media-output.ts` 的动态文件系统 tracing warnings；当前不影响单机自用，但未来若部署需收窄路径或加 ignore 标记。

## 下一步
1. 用户查看并确认 `C:\Users\linma\Videos\Folia Exports\2026-08-31T11-23-49-498Z-神降・天火` 中横竖屏成片。
2. 实现 PRD 14.2 的 US-009 启动入口：`启动Studio.cmd`、`scripts/start-studio.mjs`、停止脚本、`.runtime/studio-services.json` 与日志目录约定。
3. 为启动脚本补端口预检、语义健康检查、全有或全无、未知端口拒绝、日志保留与进程归属测试。
4. 从服务停止状态冷启动执行 `US-009`；任何卡点修复后完整重跑。

## 恢复上下文
- 仓库根目录：`D:\从Agent到音乐可视化`
- 启动 Music Agent：`cd music-agent; pnpm db:push; pnpm dev --port 3003`
- 启动 Folia web：`cd folia-major; npm run dev -- --host 127.0.0.1 --port 3004 --strictPort`
- 启动 Folia Electron / Stage：`cd folia-major; npm run dev:electron`
- 验证命令：`music-agent` 内 `pnpm lint`、`pnpm build`；`folia-major` 内 `npm run typecheck`、`npm test`
- 已知坑：Windows 中文路径；Folia Stage token 来自 Electron 设置；Folia 使用 Node >= 24.0.0；SQLite 使用 WAL 且写入方唯一。

## 最近更新
- 2026-08-31 — `US-004` 完成真实 Electron 横竖屏导出机器证据：修复竖屏窗口超出工作区导致的冻结，登记 job/session、编码、帧数、哈希、抽帧与测试结果；状态为待用户看片确认。影响 R0 收口与 US-009 启动时序。
- 2026-08-31 — `US-008 三配方用户定稿` 用户验收通过，三个配方均不再调整，当前定稿配方为 `neon-night(72,4,76)`；PRD 矩阵与 OQ-1 已关闭，状态台账切换到 `US-004`。影响 R0 验收进度与导出前置条件。
- 2026-08-31 — `US-012 文档与 PRD 对齐` 机器验收通过，重写用户手册，统一 3003 / 3004 / 32107 口径，修正翻译链路文档，归档旧执行手册，并登记 PRD 唯一需求源；状态台账切换到 `US-008`。影响 R0 验收进度与 US-009 前置边界。
- 2026-08-31 — `US-011 Prompt 分阶段加载` 机器验收通过，补齐四阶段 manifest、快照统计、阶段路由、空对话防误进 generation、stage-specific AgentSession 与 DefaultResourceLoader 装载证据；状态台账切换到 `US-012`。影响 R0 验收进度与下一步实现边界。
- 2026-08-31 — `US-010 Mock 结构感知时间轴` 机器验收通过，补齐段落权重分配、无结构 fallback、真实时间轴优先与坏数据回退测试，以及 Mock 24 秒运行态主/翻共轴证据；状态台账切换到 `US-011`。影响 R0 验收进度与下一步实现边界。
- 2026-08-31 — `US-006 当前配方保存` 机器验收通过，补齐视觉期待直观展示、字段命名说明、整数钳制、状态矩阵、失败恢复、服务端回填与刷新恢复证据；状态台账切换到 `US-010`。影响 R0 验收进度与下一步实现边界。
- 2026-08-31 — `US-005 Studio 三栏工作台` 机器验收通过，补齐桌面/移动几何与滚动、Provider 模式显性、构图预览 loading/error/retry 状态与断网恢复证据；状态台账切换到 `US-006`。影响 R0 验收进度与下一步实现边界。
- 2026-08-31 — `US-007 配方驱动 Folia 原生舞台` 机器验收通过，补齐 session 外观覆盖/恢复、全局偏好隔离、白天切换、清空/新 session 隔离、三预设真实音频区分与 Stage 断连对抗证据；状态台账切换到 `US-005`。影响 R0 验收进度与下一步实现边界。
- 2026-08-31 — `US-003 自动推送 Stage 与兜底` 机器验收通过，补齐 Stage 停止态非阻塞生成、持久化交付状态、配方竞态保护、恢复重推完整 payload 与用户手势自动播放证据；状态台账切换到 `US-007`。影响 R0 验收进度与下一步实现边界。
- 2026-08-31 — `US-002 日文歌中文翻译副字幕` 机器验收通过，补齐日文逐行翻译门禁、主/翻时间轴校验、MP3 双 USLT、Stage 独立翻译字段与浏览器四时间点证据；状态台账切换到 `US-003`。影响 R0 验收进度与下一步实现边界。
- 2026-08-31 — 同步 GitHub 基线到 `2978b22`，PRD v1.3 生效，`US-001` 机器验收通过；状态台账从 Studio 视觉链路阶段切换到 R0 收口阶段。影响 R0 执行顺序与后续验收登记。
- 2026-08-27 — 闭合真实 Stage 推送与视觉配方应用链路，完成三配方真实播放视觉复验；提亮 `neon-night` 并将单测断言对齐新色值，`music-agent` 36 tests、`folia-major` typecheck 与 Stage API 11 tests 全绿。影响 v2 视觉验收与交付状态。
- 2026-08-20 — 修复本地音频落盘、歌词解析，完成静态 Stage 生命周期核查并创建状态台账 — 影响 `music-agent` 本地闭环。
- 2026-08-21 — 拉取 GitHub 更新到 `d88a5e9`，同步设计/计划/执行手册，更新后续任务索引 — 影响项目执行入口。
- 2026-08-21 午间 — 真实公司网关歌曲推送 Stage 成功，修复本地音频文件名读取正则，复跑 music-agent 测试/类型检查/lint — 影响 `music-agent` 端到端链路。
- 2026-08-21 午后 — 完成 mock 免费离线链路验收并清理临时环境，更新使用/开发流程与执行手册 — 影响 Task 9、Task 11 状态。
- 2026-08-21 晚间 — 修复 Folia dev 冷启动空白首屏，完成 3001 浏览器验收、UI 回归、类型检查、Music Agent 12 测试与横竖屏导出探针 — 影响 Folia 启动体验与 Task 10 状态。
