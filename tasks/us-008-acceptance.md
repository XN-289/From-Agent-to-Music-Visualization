# US-008 验收记录：三配方用户定稿

| 字段 | 记录 |
|---|---|
| 故事编号 | US-008 |
| 验收日期 | 2026-08-31 |
| 基线提交 | `2978b22a2505b9b8d5cc0c797c147fabfc2720d7` + 当前工作区 |
| 环境 | Windows，Music Agent `http://127.0.0.1:3003`，Folia web `http://127.0.0.1:3004`，Stage `http://127.0.0.1:32107` |
| 验收人 | 用户本人；机器脚本仅提供播放与截图证据 |
| 证据位置 | 本文件、`tasks/us-008-evidence/machine-review.json`、`tasks/us-008-evidence/review.html`、`tasks/us-008-evidence/*.png` |
| 结论 | 通过 |
| 备注 | 审片过程复用既有歌曲与本地 Stage，未调用真实 LLM / 音乐 Provider，未新增付费额度消耗 |

## 1. 用户结论

用户于 2026-08-31 17:59（Asia/Shanghai）左右逐配方明确回复：

```text
Livehouse 通过，Rain Window 通过，Neon Night 通过
```

结论为“通过 / 继续调整”二选一中的“通过”。其中 `neon-night(72, 4, 76)` 不再继续提亮；OQ-1 关闭。

## 2. 统一审片条件

| 项目 | 记录 |
|---|---|
| 歌曲 | `神降・天火` |
| songId | `432cd78d-2026-4733-8da8-cd9d3e6bae66` |
| 音频时长 | 189.48s |
| 固定段落 | 53.218s - 61.218s |
| 严格顺序 | `livehouse -> rain-window -> neon-night` |
| viewport | 1280x720，dark，deviceScaleFactor 1 |
| 系统亮度 | 未修改 |
| 抽样时间 | 54.2s、56.2s、58.2s |

机器证据生成时间为 `2026-08-31T09:54:40.111Z`。脚本先通过 Music Agent 保存配方，再调用 `/api/songs/{songId}/push-folia` 推送 Stage；每个配方均在真实音频播放中截图。

## 3. 配方与证据

| 顺序 | 配方 JSON | 用户结论 | Stage session | 截图 |
|---|---|---|---|---|
| 1 | `{"id":"livehouse","intensity":84,"temperature":12,"chorusImpact":92}` | 通过 | `stage-1788170040023-ba85c16a-e96e-4e62-9b26-e0ef1b0bcae9` | `livehouse-054200ms.png`、`livehouse-056200ms.png`、`livehouse-058200ms.png` |
| 2 | `{"id":"rain-window","intensity":38,"temperature":-8,"chorusImpact":44}` | 通过 | `stage-1788170055135-9b2d03fe-6140-4c69-be5f-c811525fa7bc` | `rain-window-054200ms.png`、`rain-window-056200ms.png`、`rain-window-058200ms.png` |
| 3 | `{"id":"neon-night","intensity":72,"temperature":4,"chorusImpact":76}` | 通过 | `stage-1788170067049-daf7af01-d701-4f5c-bed1-329b01c69cf9` | `neon-night-054200ms.png`、`neon-night-056200ms.png`、`neon-night-058200ms.png` |

三组 Stage `visualConfig` 分别命中 `#f97316`、`#67e8f9`、`#2ee6ff` 主题主色；审片表见 `tasks/us-008-evidence/review.html`。审片完成后，歌曲数据库与 Stage 当前最终配置均为 `neon-night(72, 4, 76)`。

## 4. 截图哈希

| 文件 | SHA-256 |
|---|---|
| `livehouse-054200ms.png` | `258CF8FBAB29179535E6C3BC77C38C9ADD25E6209F72F25D39B0EC4E856BC193` |
| `livehouse-056200ms.png` | `945C0D0BFF35096DDDAB623506C86C7134D10A600B5CCEFF70A4FE99BE6D768D` |
| `livehouse-058200ms.png` | `EE10EC276718A1A40FA0F51204D0ACAAF1A1F2D31AE801C8E501AB6146D29791` |
| `rain-window-054200ms.png` | `A365BED18499AF879A969FC311066AEEA2C364AEBEDC476E1C14584ED71A523B` |
| `rain-window-056200ms.png` | `B791163DB3D4A887B4E3F853BAF1121E840EACBC4924522AE378D0CC218D9EF9` |
| `rain-window-058200ms.png` | `C625597017A96CFE1B43B510FEA3A04448919A5273B2D80D7743F142EE459F0C` |
| `neon-night-054200ms.png` | `6A9E5666C32FC053669E11666E79196467A31B9CDE99C650272B7175C69C2C8A` |
| `neon-night-056200ms.png` | `8032D741A057BC2919337491CE894C1D770F0413A0DFCF21CD2D8DD436B26747` |
| `neon-night-058200ms.png` | `92E8FEA651D49B3FF8E1757073783A4C7FBDEB5E9D7083B0C9649DA822AA2F4B` |

上述哈希已于验收登记时重新计算，与 `machine-review.json` 一致。

## 5. 采样精度

- `rain-window` 与 `neon-night` 的三帧实际音频采样误差约为 9-38ms。
- `livehouse` 的最大调度偏差约 1.5s，但三个采样点仍位于同一固定副歌段内，且截图包含播放中的真实音频画面。
- 该精度用于解释证据生成过程；US-008 的审美通过结论来自用户本人，不依赖本地视觉模型判定。

## 6. 验收结论

US-008 通过。R0 正式导出必须继续使用当前定稿配方 `neon-night(72, 4, 76)`；导出后若配方发生变更，须重新执行导出验收。
