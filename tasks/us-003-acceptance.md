# US-003 验收记录：自动推送 Stage 与兜底

| 字段 | 记录 |
|---|---|
| 故事编号 | US-003 |
| 验收日期 | 2026-08-31 |
| 基线提交 | `2978b22a2505b8c8d5cc0c797c147fabfc2720d7` + 当前工作区 |
| 环境 | Windows 11，Node v24.18.0，pnpm 11.7.0，npm 11.16.0，Music Agent `http://127.0.0.1:3006`，Folia web `http://127.0.0.1:3004`，Stage `http://127.0.0.1:32108` |
| 验收人 | 机器测试 |
| 证据位置 | 本文件、`music-agent/data/us003-acceptance.db`、`music-agent/data/us003-media/95b44b23-bdbd-427b-b392-efd86bede177/`、`tasks/us-003-evidence/studio-stage-down.png` |
| 结论 | 通过 |
| 备注 | Provider 为 `mock`，全程未调用真实 Provider，未消耗付费额度；Stage 使用隔离测试 token |

## 1. 实现合同

- 生成完成事务先把歌曲与任务置为 `completed`，交付状态置为 `pending`；自动 Stage 推送在事务提交后异步执行，Stage 不可达不改写生成终态。
- 交付结果持久化为 `pending / pushed / needs_retry`，并在聊天生成卡、作品详情、Studio 歌曲列表显示同步中、已推送或待重推。
- `push-folia` 重推读取数据库中已保存的 `visual_recipe`，并把配方变化竞态判为 `needs_retry`，避免把旧配方标记为已推送。
- 保存新配方会把交付状态重置为 `pending`，必须再次手动重推当前配方。
- Studio 通过已完成 songId 集合识别新完成任务；若用户正在编辑另一首歌，只显示“去查看新歌”，不自动切换选中的编辑会话。
- Folia 收到 Stage media session 后默认 `autoplay: true`；若浏览器返回 `NotAllowedError`，播放器会显示“点击播放开始”，不假报成功。

主要实现与测试：

- `music-agent/src/app/api/jobs/[id]/route.ts`
- `music-agent/src/lib/song-delivery.ts`
- `music-agent/src/lib/song-delivery.test.ts`
- `music-agent/src/app/api/songs/[id]/push-folia/route.ts`
- `music-agent/src/app/api/songs/[id]/visual-recipe/route.ts`
- `music-agent/src/components/chat/generation-card.tsx`
- `music-agent/src/components/song/song-detail-client.tsx`
- `music-agent/src/components/studio/studio-workspace.tsx`
- `folia-major/src/hooks/useStagePlaybackController.ts`
- `folia-major/src/hooks/usePlaybackAudioBridge.ts`

## 2. Stage 停止态生成

生成前停止 Stage，只保留 Music Agent 与 Mock Provider：

- songId：`95b44b23-bdbd-427b-b392-efd86bede177`
- jobId：`2b1e4f25-f4d8-4afe-88d6-5a587b7b0537`
- 标题：`US003 日文重推`
- Provider：`mock`
- 生成与轮询事务终态：`generation_jobs.status = completed`，`songs.status = completed`
- 异步交付终态：`songs.stage_delivery_status = needs_retry`
- 错误：`fetch failed`
- 生成事务没有被 Stage 失败阻塞，产物完整落盘。

Studio 停止态证据截图：

```text
tasks/us-003-evidence/studio-stage-down.png
SHA-256 E41F7F62243D3103F98EE382119CD526209E980F6E939BCDD564ACFC7385084C
```

## 3. 产物与保存配方

隔离媒体目录：

```text
music-agent/data/us003-media/95b44b23-bdbd-427b-b392-efd86bede177/
```

两个 WAV 均为 24 秒、22050 Hz、mono，另含 1024x1024 PNG 封面、主歌词、中文翻译与元数据。

SHA-256：

```text
audio-01-v0.wav 9EBE66661A7650D842CEC8B79784A9BCC9BA1967CD7F2EB5F96B4AE3F460CCA1
audio-02-v1.wav 5BA487B72A91C94BCC6B49E3A5CBFB64527C4C199A06E2B1CF70735E2D68CF38
cover.png       1B4FDD03D7D9AEDBE088105321099A2D350E85A462DD11A107A200BC3B1E39A5
lyrics.lrc      56F62B385C9EE0D8A97670FFA997FE332FD0633AE09474BF7AF884AC366F7FFC
lyrics.t.lrc    34E65FBA99F9213AE6B6F4829431EFDB4E296BE5AECFCE35742A674FBAE7714A
lyrics.txt      8458993405E3B40F4EDB50F7B8AEBA6B3C96DE6473903A9C938F0E3B6B4E0CE2
meta.json       D4779725FFB37A6A8CC17460E7FFEAAC822568792A12A50CAA3D01CBC74E81DC
```

保存配方：

```json
{
  "id": "rain-window",
  "intensity": 37,
  "temperature": -7,
  "chorusImpact": 43
}
```

主/翻歌词均覆盖 `0 / 4.8 / 9.6 / 14.4 / 19.2` 秒，各自行起止时间完全一致。

## 4. Stage 恢复后重推

启动 Stage 与 Folia web 后，手动执行：

```text
POST /api/songs/95b44b23-bdbd-427b-b392-efd86bede177/push-folia
```

响应 `HTTP 200`，`ok = true`。重推后 Music Agent DB：

```text
songs.status = completed
songs.visual_recipe = {"id":"rain-window","intensity":37,"temperature":-7,"chorusImpact":43}
songs.stage_delivery_status = pushed
songs.stage_delivery_error = null
```

Stage `/stage/status` 返回 session：

```text
stage-1788151019616-7c882254-bcb7-4750-99a9-93bcb77811bb
activeEntryKind = media
durationMs = 24000
audioMimeType = audio/wav
coverMimeType = image/png
lyricsText = 日文主歌词 LRC
translationLyrics = 中文翻译 LRC
visualConfig = Music Agent / Rain Window 映射结果
```

其中 `visualConfig` 包含 `visualizerMode = monet`、`backgroundOpacity = 0.58`、`visualizerOpacity = 0.86`，并关闭几何背景与暗角，与 `rain-window` 映射一致。

## 5. 用户手势自动播放

先在 Folia 页面点击“舞台”建立用户手势，再触发同一 songId 的手动重推。浏览器 DOM 连续采样如下，`paused = false` 且播放时钟单调递增：

| 距 Stage session 写入 | audio.currentTime | 播放器状态 | UI 时间 |
|---:|---:|---|---|
| 0.933s | 0.000s | `paused=false, readyState=0` | 00:00 |
| 2.410s | 1.159562s | `paused=false, readyState=4` | 00:01 |
| 2.925s | 1.671837s | `paused=false, readyState=4` | 00:01 |
| 3.306s | 2.055500s | `paused=false, readyState=4` | 00:02 |
| 3.736s | 2.485264s | `paused=false, readyState=4` | 00:02 |
| 4.040s | 2.790817s | `paused=false, readyState=4` | 00:02 |

同屏歌词为日文原文与中文翻译，页面显示 `MUSIC AGENT / RAIN WINDOW`。因此本案例实际自动播放成功，不依赖“需要点击”的兜底分支。

说明：`/stage/player/status` 是播放端向 Stage 发布的 inside-out 快照；本次 Folia 以纯 web Stage API 模式运行，没有 Electron 播放桥发布该快照，所以它会保持 fallback `IDLE`。US-003 的接收态以 `/stage/status` 的 media session 与浏览器真实 audio/DOM 采样为准，不把 fallback 快照当播放证据。

## 6. 机器验证

在 `music-agent/` 执行：

```text
pnpm test
Test Files 16 passed
Tests       74 passed

pnpm exec tsc --noEmit
exit code 0

pnpm lint
0 errors, 3 warnings

pnpm build
Compiled successfully
exit code 0
```

lint 的 3 个 warning 仍是既有未使用 import：`src/app/api/credits/route.ts`、`src/components/chat/params-panel.tsx`、`src/lib/providers/mock.ts`。

在 `folia-major/` 执行：

```text
npm run typecheck
exit code 0

npm test
Test Files 212 passed, 1 skipped
Tests       1616 passed, 1 skipped
exit code 0
```

## 7. 主线程对抗性复核

- Stage 阻塞：生成完成事务先落库，自动交付后置异步；Stage down 只写 `needs_retry`，未发现生成终态被改写。
- 重推完整性：音频、主 LRC、翻译 LRC、PNG 封面和保存配方均进入 Stage session；未发现缺字段路径。
- 配方竞态：上传前后重新读取配方与 `updatedAt`，配方变化时不标记 `pushed`；已有单测覆盖。
- UI 假成功：只有数据库状态为 `pushed` 才显示已推送；Stage down 与请求失败均进入 `needs_retry`。
- 浏览器策略：自动播放成功路径有连续时钟证据；`NotAllowedError` 分支会显示“点击播放开始”，不会置为播放中。
- Studio 抢占：新完成歌曲只生成“去查看新歌”入口，未发现自动改变当前选中 `songId`。

US-003 范围内未发现 P0/P1。
