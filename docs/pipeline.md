# Pipeline: Agent -> Folia

## 目标

用户在 Music Agent 内用自然语言描述想要的歌曲，Agent 生成歌词并调用公司音乐代理得到音频；歌曲完成后本地落盘，并推送到 Folia Stage API。Folia 负责播放、全屏歌词可视化和桌面端纯净视频导出。

## 数据流

```text
Music Agent
  /api/chat
    -> pi Agent
    -> generate_music / getJob
    -> 公司音乐代理 /api/v1/music/song
    -> /api/v1/music/tasks/{id}
    -> /api/v1/music/lyrics/timing
    -> SQLite songs + generation_jobs
    -> src/lib/song-delivery.ts
    -> src/lib/media-output.ts
       data/media/<songId>/audio-*.mp3
       data/media/<songId>/lyrics.lrc
       data/media/<songId>/lyrics.txt
       data/media/<songId>/meta.json
    -> src/lib/folia-stage.ts
       POST http://127.0.0.1:<stage-port>/stage/session

Folia Stage API
    -> mediaSession
    -> player / visualizer
```

## Folia Stage 合同

来源：`folia-major/test/manual/stage-client/API_SCHEMA.md` 与 `src/utils/stageClientDemo.ts`。

- `GET /stage/health`：无鉴权，返回服务状态。
- `POST /stage/session`：写入媒体会话；支持 JSON 和 multipart。
  - multipart 字段：`title`、`artist`、`album`、`audioUrl` 或 `audioFile`，`lyricsText` 或 `lyricsFile`，`lyricsFormat`。
  - `audioFile` 与 `audioUrl` 二选一；`lyricsText` 与 `lyricsFile` 二选一。
  - 当前 `lyricsFormat` 支持 `lrc`、`enhanced-lrc`、`vtt`、`yrc`。
- `POST /stage/lyrics`：写入独立歌词对象；会把当前 Stage 输入切到 `activeEntryKind: "lyrics"` 并清空 `mediaSession`。

Music Agent 当前使用：

```ts
form.append('lyricsFormat', 'lrc');
form.append('audioFile', mp3File);
form.append('lyricsFile', lrcFile);
```

这个组合满足 Stage media session 的合同，不会触发 `INVALID_AUDIO_SOURCE` 或 `INVALID_LYRICS_SOURCE`。

## 歌词格式

Music Agent 内 `LyricsLine` 是：

```ts
{ startMs: number; endMs: number; text: string }
```

`lyricsToLrc()` 将其转成标准 `.lrc`：

```text
[mm:ss.cc]text
```

真实公司音乐代理可通过 `/api/v1/music/lyrics/timing` 返回行级时间轴；缺失时调用层按总时长均分生成占位时间轴。

## 一键导入

Music Agent 路由：

```text
POST /api/songs/[id]/push-folia
```

该路由调用 `deliverSong(id, { pushToFolia: true })`：

1. `ensureLocalSong()`：确认歌曲完成并从 SQLite 生成/恢复本地音频和 LRC；
2. `checkFoliaStage()`：检查 Stage 是否启用且来源为 `stage-api`；
3. `pushSongToFolia()`：用 `FormData` 上传音频和 LRC。

前端详情页对应入口在：

```text
music-agent/src/components/song/song-detail-client.tsx
```

## 环境变量

### Music Agent

```env
LLM_PROVIDER=deepseek
LLM_MODEL=deepseek-v4-flash
DEEPSEEK_API_KEY=

SUNO_PROVIDER=musicproxy
MUSIC_PROXY_BASE_URL=http://114.132.214.9:8800
MUSIC_PROXY_API_KEY=
MUSIC_PROXY_DEFAULT_PROVIDER=suno_openaihk
MUSIC_PROXY_MODEL=auto

FOLIA_STAGE_BASE_URL=http://127.0.0.1:32107
FOLIA_STAGE_TOKEN=
FOLIA_WEB_URL=http://127.0.0.1:3001
```

### Folia

```env
VITE_NETEASE_API_BASE=http://localhost:3000
VITE_AI_PROVIDER=google
GEMINI_API_KEY=
```

Stage 的 token 不是写死在 `.env.example` 里的；它来自 Folia 桌面端设置页面。每次重新生成 token 后都要同步 Music Agent 的 `FOLIA_STAGE_TOKEN`。

## 视频导出

Folia 已有 Electron 桌面端录制/导出实现：

```text
folia-major/src/hooks/useElectronVideoExportController.ts
folia-major/src/services/electronVideoExport.ts
```

推荐继续用 Folia 内置能力做纯净视频，不把浏览器截图录制作为主路径，避免录进 Music Agent 的聊天 UI、提示条和浏览器边框。

## 已知边界

- `POST /stage/session` 只接受一个独立歌词文件；翻译 sidecar 不会随当前 media-session push 直接进入 Folia。
- `POST /stage/lyrics` 会清空 media session，因此不能简单地作为“附加翻译”使用。
- 生成路径当前只写 `lyrics.lrc`，不自动产出 `lyrics.t.lrc`。

推荐下一步：在推送前把带时间轴的翻译嵌入 MP3 metadata，让 Folia 从 `audioFile` 中解析 `translation`-tagged lyrics；或者扩展本地导入/Stage 方案前先验证 `/stage/lyrics` 与 media session 的并存关系。

