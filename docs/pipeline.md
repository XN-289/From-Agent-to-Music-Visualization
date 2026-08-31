# Pipeline: Music Agent -> Folia

## 目标

用户在 Studio 用自然语言描述歌曲与画面期待；Music Agent 负责需求澄清、写词、生成门禁、媒体落盘与视觉配方保存；Folia Stage 接收音频、主歌词、中文翻译、封面和 session 级视觉配置，负责真实播放、可视化与 Electron 导出。

## 端口与环境

| 服务 | 默认地址 | 配置来源 |
|---|---|---|
| Music Agent | `http://127.0.0.1:3003` | dev 命令、`PORT` |
| Folia web | `http://127.0.0.1:3004` | `FOLIA_WEB_URL` |
| Folia Stage API | `http://127.0.0.1:32107` | Folia 界面、`FOLIA_STAGE_BASE_URL` |

实际端口以配置和 Folia Stage 设置页为准。Music Agent 的关键变量见 `music-agent/.env.example`。

## 数据流

```text
Studio / Chat
  -> pi Agent 阶段化 harness
  -> generate_music / getJob
  -> musicproxy / mock Provider
  -> SQLite songs + generation_jobs
  -> media-output
       data/media/<songId>/audio-*
       data/media/<songId>/lyrics.lrc
       data/media/<songId>/lyrics.t.lrc
       data/media/<songId>/cover.*
       data/media/<songId>/meta.json
  -> song-delivery
  -> folia-stage multipart POST /stage/session
  -> Folia mediaSession + session visualConfig
```

Stage 不可用时，生成事务仍会完成，交付状态持久化为 `needs_retry`；Stage 恢复后可通过 `POST /api/songs/[id]/push-folia` 重推。

## 歌词与翻译

1. 写词阶段为日文或非中文主语言生成逐行 `//` 中文翻译。
2. 提交给音乐 Provider 前，`stripTranslationLines` 剥离翻译，避免翻译被演唱。
3. 落盘时主歌词生成 `lyrics.lrc`，翻译按主歌词行序生成 `lyrics.t.lrc`。
4. 真实 MP3 推送前写入双 USLT：原文与翻译各一帧。
5. Stage push 显式携带 `translationLyrics`；未显式提供时，Folia 可从上传 MP3 的内嵌 USLT 回填。显式字段优先，内嵌元数据是回退。

这个结论已替代 2026-08-21 的旧判断。当前 media session 支持 `translationLyrics`，不再需要用 `POST /stage/lyrics` 附加翻译；后者会清空 media session，不能作为同一首歌的翻译补充通道。

## Stage multipart 合同

完整契约见 [folia-major/test/manual/stage-client/API_SCHEMA.md](../folia-major/test/manual/stage-client/API_SCHEMA.md)。Music Agent 当前提交：

```text
title
artist
audioFile
lyricsFormat=lrc
lyricsFile
translationLyrics
coverFile
visualConfig
```

`visualConfig` 由已保存的 `visualRecipe` 转换而来。Folia 将它作为当前 session 的外观覆盖；session 结束、清空或切到无配方歌曲时恢复本地外观，不写全局偏好。

## 视觉配方

R0 的 `VisualRecipe` 是四字段结构：

```ts
type VisualRecipe = {
  id: "neon-night" | "rain-window" | "livehouse";
  intensity: number;      // 0-100
  temperature: number;    // -20..20
  chorusImpact: number;   // 0-100
};
```

Studio 的视觉期待卡展示预设、色卡、语义特征和与已保存值的差异。点击保存后，Music Agent 只在推送时把已保存配方转换为 Stage `visualConfig`；构图预览只用于构图草稿，不代表最终音频反应。

## 导出

Folia 保留 Electron 主窗口采集与 `MediaRecorder` 导出能力，控件在遥控窗口。当前手册说明的是两次手动导出；US-004 的“一个任务串行产出横竖屏、统一进度与校验”尚未验收。

## 验证

```powershell
Push-Location music-agent
pnpm test
pnpm exec tsc --noEmit
pnpm lint
pnpm build
Pop-Location

Push-Location folia-major
npm run typecheck
npm test
Pop-Location
```
