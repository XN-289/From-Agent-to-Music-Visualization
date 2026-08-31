# US-010 验收记录：Mock 结构感知时间轴

| 字段 | 记录 |
|---|---|
| 故事编号 | US-010 |
| 验收日期 | 2026-08-31 |
| 基线提交 | `2978b22a2505b8c8d5cc0c797c147fabfc2720d7` + 当前工作区 |
| 环境 | Windows 11，Node v24.18.0，pnpm 11.7.0，Music Agent `http://127.0.0.1:3006`，隔离库 `music-agent/data/us010-acceptance.db` |
| 验收对象 | `US-010 Mock 结构感知时间轴`（song `1b919ff0-a129-476e-b50e-06db2d462953`，job `042ca68c-18b9-4522-9bc0-731f8e1849a3`） |
| 验收人 | 机器测试 |
| 证据位置 | 本文件、`tasks/us-010-evidence/`、`music-agent/data/media/1b919ff0-a129-476e-b50e-06db2d462953/` |
| 结论 | 通过 |
| 备注 | Provider 为 `mock`，全程未调用真实 Provider，未消耗付费额度；Folia Stage 未启动，自动推送按 US-003 设计非阻塞跳过 |

## 1. 实现合同

- 新增结构感知解析：跳过翻译行与纯结构标记行，并记录当前行所属段落。
- 段落权重：`intro 0.6`、`verse 1`、`pre-chorus 1.1`、`chorus 1.4`、`hook 1.2`、`bridge 1`、`outro 0.6`、未知段落 `1`。
- 有结构标记时按行权重分配整首时长；无结构标记仍使用此前确认的 `makeLrc()` 均分 fallback。
- 分配边界使用累计权重并逐端取整：首行从 `0ms` 开始，相邻行共享同一毫秒边界，末行精确落在歌曲时长，不产生负数或重叠。
- 真实 `getTimestampedLyrics()` 先经过文本清洗与共轴，再由 `isValidTimestampedLyrics()` 校验；空数据、纯结构标记、负数、倒置、乱序、重叠、非有限值或越界数据都会回退。
- Provider 方法不存在或抛错时仍会生成结构感知/均分 fallback，生成终态不因对齐歌词不可用而失败。

主要实现与测试：

- `music-agent/src/lib/audio/lrc.ts`
- `music-agent/src/lib/audio/lrc.test.ts`
- `music-agent/src/app/api/jobs/[id]/route.ts`

## 2. 单元与对抗测试

`lrc.test.ts` 覆盖：

- golden：带结构歌词输出完整期望时间轴。
- 无结构：四行 12 秒保持 `0-3000 / 3000-6000 / 6000-9000 / 9000-12000ms`。
- 真实优先：有效 aligned lyrics 覆盖结构感知 fallback。
- 回退：空、乱序、重叠、负数、`end < start`、越界、纯结构标记数据均回退。
- 不变量：非负、起点单调、无重叠、首行 0ms、末行覆盖完整时长。

定向测试：`src/lib/audio/lrc.test.ts` 18 tests passed。

## 3. Mock 运行态验收

输入为 6 行日文主歌词，段落与行权重为：

| 行 | 段落 | 权重 |
|---|---|---:|
| 夜明けのつぶやき | Intro | 0.6 |
| 街の灯りが揺れる | Verse | 1 |
| 君の声を思い出す | Verse | 1 |
| 夏の花火が上がる | Chorus | 1.4 |
| この瞬間を忘れない | Chorus | 1.4 |
| また明日 | Outro | 0.6 |

Mock 两个变体均声明 `24s`；落盘 WAV 头解析也为 `24s`（22050Hz、byte rate 44100）。总权重为 6，因此期望边界为：

```text
0-2400
2400-6400
6400-10400
10400-16000
16000-21600
21600-24000
```

数据库终态：

```text
job.status = completed
song.status = completed
progress = 100
stage = 完成
error = null
lyrics_lrc = 上述完整期望时间轴
lyrics_tlrc = 6 行中文翻译，且每行 start/end 与主歌词完全一致
```

机器审计结论全部为 true：时间轴精确相等、首行从 0 开始、末行到 24000、起点单调、无重叠、无负数、主/翻完全共轴。完整审计见 `tasks/us-010-evidence/timeline-audit.json`。

## 4. 证据登记

| 文件 | 内容 |
|---|---|
| `tasks/us-010-evidence/provider-health.json` | Provider 为 `mock`，unlimited，未触发真实额度 |
| `tasks/us-010-evidence/submit-response.json` | songId 与 jobId |
| `tasks/us-010-evidence/job-final.json` | job/song 终态、完整主/翻时间轴与 24s 变体 |
| `tasks/us-010-evidence/timeline-audit.json` | DB、WAV 头、期望时间轴、不变量与产物 SHA-256 |
| `tasks/us-010-evidence/evidence-index.json` | 证据文件哈希索引 |

## 5. 机器验证

在 `music-agent`：

```text
pnpm test
18 files / 89 tests passed

pnpm exec tsc --noEmit
passed

pnpm lint
0 errors, 3 pre-existing warnings

pnpm build
passed; /api/dev/generate, /api/jobs/[id], /songs/[id] and /studio remain available
```
