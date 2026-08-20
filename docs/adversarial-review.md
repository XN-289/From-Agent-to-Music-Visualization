# Adversarial Review

审查范围：`music-agent` + `folia-major` 的本地音乐可视化管线。

## 结论

可复制、可初始化、可提交。Music Agent 与 Folia 当前通过 Stage API 的基本链路成立：Agent 生成 -> 本地落盘 -> `POST /stage/session` 上传音频和 LRC -> Folia 播放。审查发现一个会直接影响“日语歌曲 + 中文翻译”交付的 P0 缺陷，以及若干需要在接入公司网关时确认的 P1/P2 项。

## Findings

### P0-1 Stage media session 不会接收翻译 sidecar

证据：

- `music-agent/src/lib/folia-stage.ts` 只 append `lyrics.lrc` 到 `lyricsFile`；
- `folia-major/test/manual/stage-client/API_SCHEMA.md` 的 `POST /stage/session` multipart 只定义 `lyricsFile`，没有 `tLrcFile` / `translationFile`；
- `POST /stage/lyrics` 会把 Stage 输入切换成 lyrics-only 并清空 `mediaSession`，无法用来给 media session 附加翻译；
- `music-agent/src/lib/media-output.ts` 只写 `lyrics.txt`、`lyrics.lrc`、`meta.json`，不生成 `.t.lrc`。

影响：当前“一键推给 Folia”后，Folia 大概率能显示日文主歌词，但不会把已有中文翻译作为副字幕显示。若验收要求同时显示原文和译文，这是阻断项。

建议：

1. 在 Music Agent 推送前，把 timed translation 写入 MP3 的 `translation`-tagged lyrics，再上传 `audioFile`；Folia `metadataParser.worker.ts` 已支持从音频 metadata 提取 translation。
2. 或评估扩展 Stage API，使 `POST /stage/session` 支持 `tLrcContent`，并确认播放端会按本地 `localTranslationLyricsContent` 消费。

### P1-1 `.env.example` 原本未覆盖公司网关和 Stage

原 `music-agent/.env.example` 只有 mock/sunoapi 和 DeepSeek，缺少 `MUSIC_PROXY_*`、`FOLIA_STAGE_*`。本仓库快照已补齐，避免新环境漏配。

### P1-2 公司代理鉴权 header 需再次对齐

- `musicproxy.ts` 使用 `Authorization: <MUSIC_PROXY_API_KEY>`，不带 `Bearer`；
- `sunoapi.ts` 使用 `Authorization: Bearer <SUNO_API_KEY>`。

公司文档应明确指出网关期望哪一种。若网关要求 `Bearer`，当前 `musicproxy.ts` 会在所有请求上失败；若网关要求原始 key，则当前写法正确。

### P1-3 动态文件系统访问触发 Turbopack 全项目 trace

`music-agent/src/lib/media-output.ts` 使用运行时 `node:fs/promises` 读取本地目录，Next/Turbopack 构建时出现动态文件系统访问相关 warning。本地开发不受阻，但若部署到 serverless/云构建，需要把本地媒体输出目录改为固定路径，或将 audio 下载、LRC 写入和 Stage 上传迁移到更明确的 service layer。

### P2-1 秘密材料已排除

复制时明确排除：

- `music-agent/.env.local`；
- `music-agent/data/`；
- `music-agent/exports/`；
- `node_modules`、`.next`、`dist`、`dev-dist`、`.git` 等生成目录。

复制后的工作树扫描未发现真实 API key 明文；`data/research/...` 中可能携带 URL 凭据的目录未进入新仓库。

### P2-2 Folia Stage 启用条件

`music-agent/src/lib/folia-stage.ts` 的 `checkFoliaStage()` 只有 `enabled === true && modeEnabled === true && source === 'stage-api'` 才认为可用。若用户在 Folia 设置中选择 Now Playing 或 PlayerCap，Stage health 可能返回不同 `source`，Music Agent 会正确拒绝推送，而不是误发到错误模式。

### P2-3 Folia Node 版本要求

Folia `package.json` 声明 `node >= 24.0.0`。运行 Folia 前需确认本机 Node 版本；Music Agent 使用 Next 16，也需要较新的 Node 环境。

## 已执行验证

在源工作区执行：

```text
music-agent: pnpm lint -> 0 errors / 6 unused-variable warnings
music-agent: pnpm build -> pass
folia-major: npm run typecheck -> pass
folia-major: npm test -> 212 files, 1615 tests passed, 1 skipped
folia-major: npm run build -> pass
```

复制后执行：

```text
扫描 .env.local / node_modules / data / exports / .git 等敏感或生成目录
扫描疑似 API key 明文
```

均未发现复制后的仓库包含真实密钥或生成数据。

## 仓库纪律

- 不要把真实 `MUSIC_PROXY_API_KEY`、`FOLIA_STAGE_TOKEN`、DeepSeek key 或 Suno key 写入任何提交文件。
- 不要把 `data/media/`、`exports/` 中的成品音频作为源码提交，除非另行建立明确的 `examples/` 目录并签署用途。
- 保持 `folia-major/LICENSE` 和上游归属信息。

