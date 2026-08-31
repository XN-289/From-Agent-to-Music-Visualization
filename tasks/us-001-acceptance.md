# US-001 验收记录：对话生成中文歌

| 字段 | 记录 |
|---|---|
| 故事编号 | US-001 |
| 验收日期 | 2026-08-31 |
| 基线提交 | `8eb3df1ca9338a71edb4bf49e580420a5e0da840` + 当前工作区 |
| 环境 | Windows 11 26200，Node v24.16.0，pnpm 11.7.0，Music Agent `http://127.0.0.1:3005` |
| 验收人 | 机器测试 |
| 证据位置 | 本文件、`music-agent/data/music-agent.db`、`music-agent/data/media/` |
| 结论 | 通过 |
| 备注 | 本记录只覆盖 US-001，不代表 R0 其他用户故事已验收 |

## 1. 模糊输入门禁

证据：`music-agent/src/lib/agent/generation-request.test.ts`

- 完整请求必须同时识别风格、情绪、结构。
- 人声歌曲结构至少包含 verse 和 chorus/hook；纯音乐至少有 3 个结构段。
- 缺任一维度时，`generate_music` 在付费调用计数之前抛错，并要求 Agent 先给 2-3 个方向选项、等待用户确认。
- 测试覆盖：完整人声、完整纯音乐、缺风格、缺情绪、缺结构、三个维度全部缺失。

## 2. Mock 中文产物

- Provider：`mock`
- 请求任务 ID：`3bfc73ab-be22-4e47-b7f4-63b073c6775a`
- songId：`8367d4f7-e47d-458d-97a7-5c234d60c46f`
- 标题：`深夜便利店`
- 目录：`music-agent/data/media/8367d4f7-e47d-458d-97a7-5c234d60c46f`
- 数据库：`songs.status = completed`，`generation_jobs.status = completed`，`generation_jobs.provider_id = mock`
- 音频：2 个 WAV；每个 24 秒，PCM 16-bit，22050 Hz，单声道，1,058,444 bytes
- 歌词：`lyrics.lrc` 4 行，时间戳 0/6/12/18 秒
- 封面：PNG 1024x1024，RGBA，127,949 bytes
- 离线证据：`music-agent/src/lib/providers/mock.test.ts` 禁用全局 `fetch` 后仍成功生成，且断言没有任何网络请求

SHA-256：

```text
audio-01-v0.wav C04BE0416A9CBF15335C55BB7E44468B6E266C76B207CE5CC16C364706AE6932
audio-02-v1.wav FAEC39572518F3E541818A65E528F35F4E741FAB768FC4502B7F306066AC4885
cover.png       F024CE1C287D40D2ADB5197393EDC92A133073885377DAF7CAA6B5EF2E33B550
lyrics.lrc      4FCE99371316DF83D3B36EDB911B88BCDE09F95A66701E5738D4B4C83897A645
```

## 3. 真实 Provider 中文产物

- Provider：`sunoapi`
- Provider 请求 ID：`afdfff754997d4706121305de49c3182`，同时作为 `generation_jobs.id`
- songId：`cd39a459-2f9f-4376-8b54-19b8825e7f46`
- 标题：`北方的第五个夏天`
- 请求要点：中文流行 / dream pop / melancholic，歌词包含 `[Verse]` 与 `[Chorus]`
- 目录：`music-agent/data/media/cd39a459-2f9f-4376-8b54-19b8825e7f46`
- 数据库：`songs.status = completed`，`generation_jobs.status = completed`，`generation_jobs.provider_id = sunoapi`
- 任务终态：`completed`，无错误摘要
- 音频 v0：MP3，170.04 秒，48 kHz，双声道，4,071,597 bytes
- 音频 v1：MP3，177.432 秒，48 kHz，双声道，4,065,789 bytes
- 歌词：`lyrics.lrc` 4 行，时间戳 0/42.5/85/127.5 秒
- 封面：PNG 1024x1024，RGBA，133,120 bytes

SHA-256：

```text
audio-01-v0.mp3 E5677B3BFD3B230829299900275636F7D0C4662584C5CF52E597EF7F7B6E445C
audio-02-v1.mp3 409D9999D55917654DB2173AC576227D454FDEB2528431B890DCAB1B32C46C9E
cover.png       C04D280944DEC7DE8FD0513D5957340BE1E3FAAFB7EA0AD3AA8D5B58E5A53B30
lyrics.lrc      6D1216D3299A83A4010857498CED9AF1C87FA5B3D00B9BAEB7D31849C0472F16
```

## 4. 机器验证

在 `music-agent/` 执行。为避免包管理器在运行脚本前访问镜像源做依赖预检，本次会话设置了 `pnpm_config_verify_deps_before_run=false`；脚本本身仍分别执行 Vitest、ESLint 和 TypeScript。

```text
pnpm test
Test Files  12 passed (12)
Tests       61 passed (61)

pnpm exec tsc --noEmit
exit code 0

pnpm lint
0 errors, 3 warnings
```

lint warning 位置：`src/app/api/credits/route.ts`、`src/components/chat/params-panel.tsx`、`src/lib/providers/mock.ts`。它们不是 US-001 的失败项，但建议在 R0 债务清理时处理。
