# US-002 验收记录：日文歌中文翻译副字幕

| 字段 | 记录 |
|---|---|
| 故事编号 | US-002 |
| 验收日期 | 2026-08-31 |
| 基线提交 | `2978b22a2505b9c8d5cc0c797c147fabfc2720d7` + 当前工作区 |
| 环境 | Windows 11，Node v24.18.0，pnpm 11.7.0，npm 11.16.0，Music Agent `http://127.0.0.1:3006`，Folia Stage `http://127.0.0.1:32108` |
| 验收人 | 机器测试 |
| 证据位置 | 本文件、`music-agent/data/us002-acceptance.db`、`music-agent/data/us002-media/20e25d17-b339-421d-b835-96e4eedb0507/`、`tasks/us-002-evidence/` |
| 结论 | 通过 |
| 备注 | 本记录只覆盖 US-002；Stage 停止态兜底与恢复重推属于 US-003，不在此处登记 |

## 1. 实现合同

- `parseLyricPairs()` 要求每个日文主歌词行后都有非空 `// 中文翻译` 行；缺翻译返回 `false`。
- `buildTranslationLines()` 将翻译行映射为主歌词同一行的 `startMs/endMs`，产出独立 `lyrics.t.lrc`，不把中文复制进主歌词。
- `areTranslationTimestampsAligned()` 要求数量和每行起止时间完全一致；缺行或 301ms 级别错位均返回 `false`。
- `submitGeneration()` 在 `getProvider()` 和任何 DB 写入前执行 `assertJapaneseTranslationComplete()`。该门禁同样覆盖 `/api/dev/generate` 这类直接调用共享业务入口的路径。
- 日文歌持久化校验包含 `lyrics.t.lrc` 可读、时间轴同轴；不满足则任务不能进入 `completed`。
- MP3 写入原文 `USLT(eng)` 与 `USLT(chi, translation)` 两帧，测试用 `music-metadata` 读回后逐字比较。
- Music Agent 推送 Stage 时通过 multipart 的独立 `translationLyrics` 字段直传；Folia 显式字段优先，缺失时可从上传 MP3 内嵌翻译帧回填。

对应测试：

- `music-agent/src/lib/audio/lrc.test.ts`
- `music-agent/src/lib/agent/generation-request.test.ts`
- `music-agent/src/lib/agent/generate-song.test.ts`
- `music-agent/src/lib/media-output.test.ts`
- `music-agent/src/lib/mp3-metadata.test.ts`
- `music-agent/src/lib/folia-stage.test.ts`
- `folia-major/test/unit/stage/stageApi.test.ts`
- `folia-major/test/unit/stage/stageClientDemo.test.ts`

## 2. Mock 日文歌终态

- Provider：`mock`，未调用真实 Provider，未消耗付费额度。
- songId：`20e25d17-b339-421d-b835-96e4eedb0507`
- jobId：`f2eb570e-a7e0-4015-811f-5b473ae4360e`
- 标题：`晚风与夏天`
- 隔离 DB：`music-agent/data/us002-acceptance.db`
- DB 终态：`songs.status = completed`，`generation_jobs.status = completed`，`generation_jobs.provider_id = mock`
- 音频目录：`music-agent/data/us002-media/20e25d17-b339-421d-b835-96e4eedb0507/`
- 两个 WAV 均为 `pcm_s16le`、22050 Hz、mono、24.000000 秒、1,058,444 bytes。
- 封面为 PNG、1024x1024、RGBA、112,897 bytes。

SHA-256：

```text
audio-01-v0.wav C903E29A3BC7E6FA027306674EDCC109EAF712F95C7B9FAAA394F67741E69091
audio-02-v1.wav 42FB9599A7A80F767224A74A3A3427C53677BD3DC68DB35135CEA5030BDAA644
cover.png       7A1121AAAD966EBB6311DD15F24B629A642C053D4F18DC4E8BEF920CB3CC3920
lyrics.lrc      23D6417073C9981EACE8C85735B6F80337DA42FE820E52B628118002967CBAD5
lyrics.t.lrc    8041CCC9E8E8DAF9B39704E9D0E80E64F8F8BBD58AB6CB0DC2C073229CC6ADF0
lyrics.txt      E0AC89FC0FE68D0D5C974EB5E601786EC78820B26CE719277445997E86E6DDBD
meta.json       826AED71B5085D2A6111F7F8FDB966DCCBC3D475E057E0ED180158ACC604C30D
```

## 3. 主/翻时间轴

`lyrics.lrc`：

```text
[00:00.00]夜風が答えを運ぶ
[00:06.00]君の声を探してる
[00:12.00]夏はまだ続く
[00:18.00]光はここにある
```

`lyrics.t.lrc`：

```text
[00:00.00]晚风带来答案
[00:06.00]我在寻找你的声音
[00:12.00]夏天还在继续
[00:18.00]光就在这里
```

主/翻均为 4 行，`0/6/12/18` 秒起止区间完全一致。Mock WAV 按 PRD 只验 `t.lrc` 与 Stage 推送，不判定 ID3。

## 4. Stage 与实际显示

- Stage：`http://127.0.0.1:32108`
- 测试 token：`us002-smoke-token`
- session：`stage-1788144499484-3e55fcfd-e50f-40bd-9b85-1ecefa954cab`
- `/stage/status` 返回 `activeEntryKind = media`、`durationMs = 24000`、`audioMimeType = audio/wav`、`coverMimeType = image/png`。
- 主歌词在 `lyricsText`，中文翻译在独立 `translationLyrics`；两者没有被合并。

浏览器采样使用 DOM mutation 记录主/译字幕实际进入 DOM 的时间，并对比 audio clock 与 app lyric clock：

| 目标时间 | audio 偏差 | app 偏差 | DOM 结果 | 截图 |
|---|---:|---:|---|---|
| 0s | +259.792ms | +213.760ms | 日文原文与中文翻译同屏 | `tasks/us-002-evidence/stage-00000ms-dom.png` |
| 6s | 0ms | 0ms | 日文原文与中文翻译同屏 | `tasks/us-002-evidence/stage-06000ms-dom.png` |
| 12s | 0ms | 0ms | 日文原文与中文翻译同屏 | `tasks/us-002-evidence/stage-12000ms-dom.png` |
| 18s | 0ms | 0ms | 日文原文与中文翻译同屏 | `tasks/us-002-evidence/stage-18000ms-dom.png` |

采样时 `playbackRate = 1`、`audio.duration = 24`，四个时间点均低于 PRD 的 300ms 阈值。

截图 SHA-256：

```text
stage-00000ms-dom.png 327F9070198982FDB28678D7A54B9C21E8510031CDBC01EC4F49605786E3B899
stage-06000ms-dom.png 87EC3BDCF9011F345E6895B12B6C567914C81FD91447146042C4911F8C5083BE
stage-12000ms-dom.png 6A1E5B5496E3DE4BBC064541E6C4992A1FDC7D768C84EB09BA84E1D1B7AEEC03
stage-18000ms-dom.png D568AC307C27038816395F7FA4450846B692F29187371029A1C6A9730C2DB1E4
```

## 5. MP3 双 USLT

`music-agent/src/lib/mp3-metadata.test.ts` 写入后用 `music-metadata` 读回：

- 帧数：2。
- 原文帧：`language = eng`，`text` 与原始 LRC 逐字相等。
- 翻译帧：`language = chi`，`descriptor = translation`，`text` 与翻译 LRC 逐字相等。

该测试覆盖真实 MP3 分支；Mock WAV 分支不做 ID3 判定。

## 6. 机器验证

在 `music-agent/` 执行：

```text
pnpm test
Test Files  15 passed (15)
Tests       68 passed (68)

pnpm lint
0 errors, 3 warnings

pnpm exec tsc --noEmit
exit code 0

pnpm build
Compiled successfully
TypeScript finished
3 static pages generated
exit code 0
```

lint 的 3 个 warning 是既有未使用 import：`src/app/api/credits/route.ts`、`src/components/chat/params-panel.tsx`、`src/lib/providers/mock.ts`。

在 `folia-major/` 执行：

```text
npm run typecheck
exit code 0

npm test
Test Files  212 passed, 1 skipped (213)
Tests       1616 passed, 1 skipped (1617)
exit code 0
```

## 7. 对抗性审查结论

主线程审查发现 1 个 P1：`assertJapaneseTranslationComplete()` 原先只在 Agent 工具层执行，`/api/dev/generate` 直接调用 `submitGeneration()` 时，缺翻译日文歌词可能先创建 DB 草稿并进入 Provider 提交路径，违反“付费前代码级保证”。

修复结果：

- 门禁下沉到 `submitGeneration()` 函数第一行，先于 `getProvider()`、`crypto.randomUUID()` 与 DB 写入。
- 保留 Agent 工具层断言作为第二道防线。
- 新增 `generate-song.test.ts`，断言缺翻译日文歌词时抛出标准错误，且 Provider 选择和 DB insert 均未被调用。

复审范围与结论：

- 中文误判：`detectLyricLanguage()` 对无假名中文返回 `chinese`，不会触发日文翻译门禁；未发现反向绕过。
- 翻译丢失：持久化文件、DB `lyricsTlrc`、Stage `translationLyrics` 三层均有数据和测试；未发现丢失路径。
- 时间轴错位：主/翻长度和起止时间完全相等才通过；缺行与错位测试覆盖；未发现通过条件放宽。
- MP3 兼容：双 USLT 采用 ID3v2.3 UTF-16 帧，`music-metadata` 读回逐字断言；未发现解析分歧。
- Stage 回退：显式 `translationLyrics` 优先，缺失时从内嵌翻译回填；JSON 与 multipart 均有测试；未发现覆盖冲突。
- Mock/真实分歧：Mock 只验 `t.lrc` 与 Stage，真实 MP3 才要求双 USLT，与 PRD 分支一致；未发现越界判定。

US-002 范围内未遗留 P0/P1。
