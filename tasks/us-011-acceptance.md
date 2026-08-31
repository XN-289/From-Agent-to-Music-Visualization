# US-011 验收记录：Prompt 分阶段加载

| 字段 | 记录 |
|---|---|
| 故事编号 | US-011 |
| 验收日期 | 2026-08-31 |
| 基线提交 | `2978b22a2505b9c8d5cc0c797c147fabfc2720d7` + 当前工作区 |
| 环境 | Windows 11，Node v24.18.0，pnpm 11.7.0 |
| 验收对象 | Music Agent system prompt 分阶段组装、路由与 pi Agent 会话装载链路 |
| 验收人 | 机器测试 |
| 证据位置 | 本文件、`tasks/us-011-evidence/` |
| 结论 | 通过 |
| 备注 | 全程未调用真实 LLM / 音乐 Provider，未生成新歌，未消耗付费额度；token 数字为声明口径的保守估算，不冒充 Provider 计费值 |

## 1. 实现合同

- 阶段划分为 `discovery`（需求挖掘）、`lyric`（写词）、`generation`（生成）、`iteration`（迭代），清单唯一入口为 `music-agent/src/lib/harness/prompt-stages.json`。
- `buildSystemPrompt(stage)` 只读取当前阶段声明的 Markdown；旧全量提示词保留为 `buildBaselineSystemPrompt()` 的统计口径。
- `resolvePromptStage()` 覆盖模糊新歌、完整新歌、确认推进、既有歌曲反馈、显式新话题与迭代意图；空对话或信息不完整的“生成吧 / 开始生成”不得直接进入 generation，防止跳过需求与歌词阶段。
- `queuePrompt()` 在解析阶段后才创建 stage-specific `AgentSession`；阶段切换会重建 session 并复用同一 chat 目录下最新 JSONL 历史，session 创建失败会重置缓存以便重试。
- `DefaultResourceLoader` 显式 `reload({})` 后，`getSystemPrompt()` 必须与阶段组装结果逐字一致；该链路由真实 loader 单测覆盖。

主要实现与测试：

- `music-agent/src/lib/agent/prompt.ts`
- `music-agent/src/lib/agent/prompt-stage.ts`
- `music-agent/src/lib/agent/pi.ts`
- `music-agent/src/lib/agent/prompt.test.ts`
- `music-agent/src/lib/harness/prompt-stages.json`
- `music-agent/src/lib/harness/stages/`
- `music-agent/scripts/prompt-stats.mjs`

## 2. 统计结果

估算口径：ASCII 字符 `ceil(chars / 4)`，非 ASCII 字符每个记 1 token。这是 Unicode-aware 的保守估算，用于版本内对比，不作为真实 Provider 账单。

| Stage | 文件数 | 字符数 | 估算 tokens | 相对 baseline 降幅 | 质量回归 |
|---|---:|---:|---:|---:|---|
| baseline | 10 | 17,674 | 12,022 | - | - |
| discovery | 3 | 3,027 | 2,082 | 82.68% | 通过 |
| lyric | 7 | 8,096 | 5,965 | 50.38% | 通过 |
| generation | 6 | 6,543 | 4,035 | 66.44% | 通过 |
| iteration | 5 | 6,306 | 3,926 | 67.34% | 通过 |

最低降幅来自 `lyric`，为 50.38%，满足“任一阶段不低于 40%”的门禁；四个阶段质量 rubric 均通过。

## 3. 质量回归

| Stage | 回归目标 | 结果 |
|---|---|---|
| discovery | 模糊请求先给 2-3 个方向选项，只问一个问题，不得越过确认门禁 | 通过 |
| lyric | 保留具体画面、结构、双胞胎测试与日文逐行翻译规则 | 通过 |
| generation | 保留 2-6 个风格标签、结构标记、V5_5 时长规则、日文硬指令与一次调用纪律 | 通过 |
| iteration | 先定位歌曲问题，一次迭代只允许一次付费调用 | 通过 |

`prompt.test.ts` 另覆盖：manifest 与旧 baseline 文件清单一致、每个声明文件存在/非空且完整进入阶段 prompt、四阶段降幅、质量 rubric、阶段路由、空对话生成关键词防误进 generation，以及真实 `DefaultResourceLoader.reload()` 后的逐字装载结果。

## 4. 证据登记

生成命令：

```powershell
node scripts/prompt-stats.mjs --write-snapshots ..\tasks\us-011-evidence --write-stats ..\tasks\us-011-evidence\prompt-stats.json
```

| 文件 | SHA-256 |
|---|---|
| `baseline-system-prompt.md` | `89cbbe553ebadc4534743f313733c316c04c257f6e848923ff71d79b92994bdb` |
| `discovery-system-prompt.md` | `08b89de03cb00c2b820d76f69961078f5f46f89770e53f554ceec427ca8da5e6` |
| `lyric-system-prompt.md` | `c95e02706615578c5bbcf8667a9d02e3cddeaa1f515f6479158f311f89c26d0c` |
| `generation-system-prompt.md` | `3a3f7ed87c8bd428e9cd4a02006d7258efe35f635f8b68f61c53732a5e867347` |
| `iteration-system-prompt.md` | `856ce22e918a93d5326a695d26ed7ea1a08a5f8a2c225797c7655e7c471f0318` |
| `prompt-stats.json` | `065c7630d3eab512dc9ddb48146ea106c0508109ffd071dad9ee0e5e5809397d` |

`prompt-stats.json` 同时记录 baseline commit、估算口径、文件清单、阶段数据、rubric 结果和快照哈希。

## 5. 机器验证

在 `music-agent`：

```text
pnpm prompt:stats
passed; all stages reduce at least 40%, all quality regressions pass

pnpm vitest run src/lib/agent/prompt.test.ts
1 file / 16 tests passed

pnpm test
19 files / 105 tests passed

pnpm exec tsc --noEmit
passed

pnpm lint
0 errors, 3 pre-existing warnings

pnpm build
passed; chat and studio routes remain available
```

本故事只验收 prompt 分阶段加载；用户对视觉定制期待的直观呈现已由 US-006 验收，AI 生成受约束视觉配方与预览确认属于 R1 的 US-013 / US-014，不在此处提前宣称完成。
