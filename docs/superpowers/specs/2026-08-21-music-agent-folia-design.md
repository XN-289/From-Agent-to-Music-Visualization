# 设计：Music Agent → Folia 本地音乐可视化管线（完整体验）

日期：2026-08-21
状态：已获批（用户确认「一次性验收」）
范围：`music-agent/` 为主、`folia-major/` 最小改动

## 1. 目标与验收标准

用户在本地完成一条闭环：**打开对话框 → 与「专业 AI 音乐制作人」聊天深挖需求 → Suno 真实生成歌曲 → 生成完成自动推送到 Folia → Folia 自动播放、原文+中文翻译副字幕、带封面 → 长时间全屏观看 → 导出横屏/竖屏纯净视频发布到视频网站**。

一次性验收清单（全部通过才算完成）：

1. 中文歌全链路：聊天 → 生成 → 自动推送 → Folia 自动播放 → 歌词+封面显示 → 导出横屏与竖屏视频。
2. 日文歌全链路：同上，且 Folia 中**中文翻译副字幕与原文字幕同步显示**。
3. 手动兜底：Folia 未开/Stage 未启用时生成不报错，详情页 `push-folia` 按钮可手动重推。
4. 测试期用 mock 验证链路不花钱；真实生成走用户 sunoapi key。

## 2. 已验证的技术事实（代码级侦察结论）

| # | 事实 | 出处 |
|---|---|---|
| F1 | Folia Stage `POST /stage/session` 原生支持 `coverFile`（multipart） | `electron/stageApi.cjs`、`test/manual/stage-client/API_SCHEMA.md:439` |
| F2 | 上传的 MP3 会解析内嵌 lyrics / translation / cover / title 等 metadata | `stageApi.cjs` `extractStageEmbeddedAudioMetadata` |
| F3 | 翻译标签判定：USLT 帧 `language='chi'/'zho'` 或 `descriptor` 含 `translation`/`trans`/`译`；带 `[mm:ss.cc]` 时间戳的文本被识别为有时间轴 | `stageApi.cjs:105-140`、`src/workers/metadataParser.worker.ts` |
| F4 | Stage media session 对象**当前丢弃翻译**：提取逻辑已算出 `translationLyrics`，但 `nextSession` 与 `StageMediaSession` 类型没有该字段 | `stageApi.cjs:1127` vs `1250-1266`、`src/types.ts:197` |
| F5 | 渲染端收到新 stage media session 时**已自动播放**（`autoplay: true`） | `src/hooks/useStagePlaybackController.ts:1195` |
| F6 | Folia 导出已内置竖屏预设 1080x1920（另有 1280x720、1920x1080） | `src/types/videoExport.ts:40-44` |
| F7 | music-agent 目前无任何翻译产出逻辑；封面只是 CSS 渐变（UI 层），无封面文件 | `grep translation → 仅提示词描述`、`src/lib/cover.ts` |
| F8 | lyricsFile 优先级高于内嵌歌词；两者不冲突 | `stageApi.cjs:1224-1226` |

## 3. 需求汇总（用户已确认的回答）

1. 风格选取：**纯对话里挖**（现状保留，不加风格卡片入口）。
2. 歌曲语言：**中日双语**；日文歌必须有中文翻译副字幕（修复 P0）。
3. 生成产物：**音频 + 歌词 + 封面**。
4. 推送时机：**自动为主，按钮兜底**。
5. 推送后：**自动播放**（F5 已内置）。
6. 发布平台：**横竖都要**（F6 已内置）。
7. 曲库主入口：**Folia 为主**（现状保留）。
8. 验收标准：**一次性验收**（§1 清单）。
9. 封面来源（我代拍板，可推翻）：**本地渐变+歌名**，AI 生图二期可选。

## 4. 设计方案

### 4.1 翻译副字幕全链路（P0，核心工程）

**翻译产出（music-agent 侧）**

- harness 写词规范新增双语规则：日文歌词每行下方紧跟一行中文翻译，翻译行带专用前缀 `//`（示例：`// 中文译文`）。中文歌不产出翻译行。
- 翻译行仅存在于 Agent 的歌词产出与 song 记录中；**调用 Suno 前剥离**（`generate_music` 工具边界处过滤 `//` 行），避免 Suno 把翻译唱出来。
- 歌词行模型 `LyricsLine { startMs, endMs, text, translation? }`；`lyricsToLrc()` 产出主歌词 `lyrics.lrc`；新增 `lyricsToTLrc()` 产出 `lyrics.t.lrc`（翻译行与主行共用同一时间轴）。
- 落盘：`data/media/<songId>/lyrics.t.lrc` 与现有 `lyrics.txt` / `meta.json` 并列。

**MP3 metadata 写入（music-agent 侧，新增 `src/lib/mp3-metadata.ts`）**

- 推送前把两轨歌词写入 MP3 的 ID3 USLT 帧（与 Folia 解析合同对齐，F3）：
  - 原文 USLT：`language` 取歌词语言（jpn/eng），`descriptor` 空，文本为带时间轴的主歌词；
  - 翻译 USLT：`language='chi'`，`descriptor='translation'`，文本为带时间轴的翻译；
  - 另写 `title` / `artist` / `album` 与封面 APIC（双保险，F2）。
- 写标签库选型（实现阶段定）：倾向 `node-id3`（纯 JS、支持 USLT+APIC、零原生依赖）；备选 `music-metadata`（读为主，写支持有限）。

**Folia 最小改动（翻译 plumbing，F4 修复）**

- `electron/stageApi.cjs`：`nextSession` 增加 `translationLyrics: embeddedMetadata?.translationLyrics ?? null`（提取已存在，只是没带上）。
- `src/types.ts`：`StageMediaSession` 增加 `translationLyrics?: string | null`。
- 渲染端：stage 播放入口处，若 `mediaSession.translationLyrics` 存在，按主歌词时间轴对齐后作为副字幕显示（复用 `parserCore.findTranslationsForSortedStartTimes` 的对齐逻辑）。
- `test/manual/stage-client/API_SCHEMA.md` 同步字段说明。

**推送内容调整**：保持 `audioFile` + `lyricsFile` + 新增 `coverFile`；翻译不单独传文件（走 MP3 内嵌通道）。

### 4.2 封面产物（music-agent 侧）

- 生成完成（job success）时产出封面 PNG：复用 `COVER_GRADIENTS` 按标题+标签散列取渐变底色，叠加歌名与风格标签文字，输出 `data/media/<songId>/cover.png`。
- 渲染选型（实现阶段定）：`@resvg/resvg-js`（SVG→PNG、系统字体支持中文）或纯 JS PNG 编码；目标零外部服务、无浏览器依赖。
- 推送：`coverFile` 传 Stage（F1）；同时嵌入 MP3 APIC（F2 双保险）。
- music-agent 曲库卡片与详情页优先显示封面文件，缺文件时回退现有 CSS 渐变。

### 4.3 自动推送 + 按钮兜底（music-agent 侧）

- 生成完成路径（job success 落库后）自动执行 `deliverSong(id, { pushToFolia: true })`。
- 幂等：song 记录新增推送状态字段（`foliaPushedAt` / `foliaPushError`）；已成功不重推。
- 失败静默：Folia 未运行、Stage 未启用（`checkFoliaStage()` 拒绝）或网络错误时，仅记录错误，不打断用户；详情页 `push-folia` 按钮可重试（现有入口复用）。
- 注意：自动推送在服务端 job 完成回调中触发，避免依赖用户页面停留。

### 4.4 推送即自动播放

零开发（F5 已内置）。验收时实测确认：Stage session 写入后 Folia 窗口开始播放。

### 4.5 横竖屏导出

零开发（F6 已内置）。验收时实测两种预设均能产出可上传的视频文件。

### 4.6 保持不变（明确不做）

- 不加风格卡片入口（用户选纯对话）。
- 不改 harness 的深挖流程与质量门禁（现有体验已满足）。
- 不扩展 Stage API 新字段（`tLrcFile` 等）——除 4.1 的 plumbing 外不动 Folia。
- 不做 AI 生图封面（二期可选）。

## 5. 改动清单

### music-agent（主要）

| 模块 | 改动 | 类型 |
|---|---|---|
| `src/lib/harness/domain/lyric-writing.md` | 双语写词规范：翻译行 `//` 前缀规则、日文歌强制要求 | 修改 |
| `src/lib/agent/pi.ts` / `generate-song.ts` | `generate_music` 工具边界剥离 `//` 翻译行后再提交 provider；song 记录保留完整歌词 | 修改 |
| `src/lib/audio/lrc.ts` | 新增 `lyricsToTLrc()`；`LyricsLine` 增加 `translation?` | 修改 |
| `src/lib/media-output.ts` | 落盘 `lyrics.t.lrc` + `cover.png`；meta.json 记录翻译与封面 | 修改 |
| `src/lib/mp3-metadata.ts` | 新增：USLT 双帧 + APIC 写入 | 新增 |
| `src/lib/folia-stage.ts` | 推送加 `coverFile`；推送前调用 mp3-metadata 写入 | 修改 |
| `src/lib/song-delivery.ts` | 生成完成自动推送钩子 + 幂等状态 | 修改 |
| `src/lib/db/schema.ts` | songs 表增加 `foliaPushedAt` / `foliaPushError` | 修改 |
| `src/components/song/*` | 详情页封面显示、翻译行渲染（`//` 行以副字幕样式显示）与推送状态反馈 | 修改 |
| `src/lib/cover.ts` | 新增封面 PNG 渲染（保留原渐变函数） | 修改 |

### folia-major（最小）

| 模块 | 改动 | 类型 |
|---|---|---|
| `electron/stageApi.cjs` | `nextSession` 带出 `translationLyrics` | 1 行级 |
| `src/types.ts` | `StageMediaSession` 加字段 | 1 行级 |
| 渲染端 stage 播放入口 | 翻译文本按时间轴对齐显示副字幕 | 小改 |
| `test/manual/stage-client/API_SCHEMA.md` | 字段文档同步 | 文档 |

## 6. 风险与应对

| 风险 | 应对 |
|---|---|
| `node-id3` 对中文/UTF-16 的兼容性 | 写入后本地解析自测（用 Folia 同款 `music-metadata` 读回验证）；不满足则换库 |
| Stage 翻译 plumbing 改动与上游 AGPL 分叉 | 改动量极小且集中在字段透传；文档注明 diff 便于未来同步上游 |
| sunoapi 真实生成的歌词时间轴缺失 | 复用现有均分占位逻辑，主/翻同轴；日文歌验收时检查对齐质量 |
| 自动推送时机与 job 轮询的耦合 | 在已有 job 完成回调（`getJob` 落库处）挂钩子，不新增轮询 |
| 内存紧张（本机 16GB，空闲仅 1.5GB） | 验收前关闭无关应用；mock 验证时可不开 Electron，仅开 Vite |

## 7. 验收步骤（实现完成后执行）

1. `pnpm db:push` 迁移成功；两个服务启动无错。
2. mock 模式：聊天生成中文歌 → 落盘检查（audio / lyrics.lrc / cover.png / meta.json；中文歌无翻译行，不生成 t.lrc）→ 自动推送成功 → Folia 自动播放 → 封面与歌词显示 → 导出横屏与竖屏。
3. mock 模式：日文歌 → 翻译副字幕与原文同步显示。
4. 关闭 Folia 再生成 → 生成不报错、按钮可重推 → 开 Folia 后重推成功。
5. 切 `SUNO_PROVIDER=sunoapi` 真实生成一首日文歌（用户确认消耗余额）→ 全链路验收 + 副字幕对齐质量。
6. 中文真实歌一首 → 验收无翻译场景表现。
