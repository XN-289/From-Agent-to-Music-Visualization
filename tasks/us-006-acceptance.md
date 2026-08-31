# US-006 验收记录：当前配方保存

| 字段 | 记录 |
|---|---|
| 故事编号 | US-006 |
| 验收日期 | 2026-08-31 |
| 基线提交 | `2978b22a2505b8c8d5cc0c797c147fabfc2720d7` + 当前工作区 |
| 环境 | Windows 11，Node v24.18.0，pnpm 11.7.0，Music Agent `http://127.0.0.1:3006`，Folia web `http://127.0.0.1:3004`，Codex In-app Browser（Chromium），1440x900、100% 缩放 |
| 验收对象 | `US007 Song B No Recipe`（`930ef4d1-b815-4594-b605-75ae66dc8009`），隔离库 `music-agent/data/us006-acceptance.db` |
| 验收人 | 机器测试 |
| 证据位置 | 本文件、`tasks/us-006-evidence/` |
| 结论 | 通过 |
| 备注 | Provider 为 `mock`，全程未调用真实 Provider，未生成新歌，未消耗付费额度 |

## 1. 实现合同

- 数据库字段名为 `visual_recipe`，API/UI 传输字段名为 `visualRecipe`；`docs/studio-mode-v2.md` 已说明二者是同一配方的存储名与序列化名。
- `normalizeVisualRecipe()` 将 `intensity` 与 `chorusImpact` 钳制到 `0-100`，`temperature` 钳制到 `-20-20`，三项均四舍五入为整数。
- 保存 API 返回服务端规范化后的 `recipe`；成功后客户端同时更新编辑值与已保存值，按钮在两者一致时禁用。
- 保存期间按钮禁用；失败时不清空草稿，保留与已保存配方的差异，并允许重试。
- 右栏从“视觉配方”升级为“视觉期待”：直接展示预设色卡、预设名、`高能量 · 暖色 · 强副歌` 这类用户语言，以及相对已保存值的具体差异。

主要实现与测试：

- `music-agent/src/components/studio/visual-recipe-expectation.tsx`
- `music-agent/src/components/studio/visual-recipe-expectation.test.ts`
- `music-agent/src/components/studio/studio-workspace.tsx`
- `music-agent/src/app/api/songs/[id]/visual-recipe/route.ts`
- `music-agent/src/lib/visual-recipe.ts`
- `docs/studio-mode-v2.md`

## 2. 浏览器状态矩阵

| 状态 | 操作与结果 |
|---|---|
| 变脏 | 无配方歌曲点击 `Livehouse 现场` 后，卡片显示 `Livehouse 现场`、`高能量 · 暖色 · 强副歌`、`未保存`、`预设：默认画面 → Livehouse 现场`；保存按钮可用。 |
| 保存中 | 点击保存后浏览器采样到 `data-recipe-save-state="saving"`，保存按钮禁用；该状态另由单元测试覆盖。 |
| 失败 | 停止 Music Agent 后保存，状态为 `failed`，草稿与差异保留，保存按钮恢复可用。指标见 `expectation-save-failed.json`。 |
| 成功 | 重启 Music Agent 后重试，服务端返回规范化配方，状态为 `saved`，差异消失，保存按钮禁用，iframe 使用 Livehouse 参数。指标见 `expectation-save-success.json`。 |
| 再次变脏 | 已保存 Livehouse 后点击 `夏夜霓虹`，状态回到 `draft`；显示 `预设：Livehouse 现场 → 夏夜霓虹`、`能量 -12`、`色温 -8`、`高潮氛围 -16`，保存按钮恢复可用。 |
| 刷新恢复 | 未保存夏夜霓虹的草稿被刷新丢弃，页面恢复已保存的 Livehouse；状态 `saved`，按钮禁用，iframe 仍为 Livehouse 参数。 |

所有浏览器采样点均满足：

```text
viewport: 1440x900
document: clientWidth 1440, scrollWidth 1440
main: clientHeight 731, scrollHeight 731, scrollTop 0
```

预览地址使用编辑草稿并做 350ms 防抖：切到夏夜霓虹后采样到的 iframe 已从 `partita` 切到 `fume`，说明用户调整期待时画面跟随变化，拖动滑杆不会连续重载 iframe。

## 3. 直观期待展示

右侧卡片同时给出三层信息：

- 视觉层：预设双色色卡，先让用户看到大致色彩方向。
- 语义层：`Livehouse 现场`、`高能量 · 暖色 · 强副歌`，避免只暴露数字。
- 变化层：`能量 +40`、`色温 +18`、`高潮氛围 +40`，让用户知道这次调整与已保存期待的差别。

截图：

| 状态 | 文件 |
|---|---|
| 变脏 | `tasks/us-006-evidence/expectation-draft-1440x900.jpg` |
| 失败 | `tasks/us-006-evidence/expectation-save-failed-1440x900.jpg` |
| 成功 | `tasks/us-006-evidence/expectation-save-success-1440x900.jpg` |
| 再次变脏 | `tasks/us-006-evidence/expectation-dirty-after-save-1440x900.jpg` |
| 刷新恢复 | `tasks/us-006-evidence/expectation-restored-1440x900.jpg` |

机器可读指标：

- `tasks/us-006-evidence/expectation-draft.json`
- `tasks/us-006-evidence/expectation-save-failed.json`
- `tasks/us-006-evidence/expectation-save-success.json`
- `tasks/us-006-evidence/expectation-dirty-after-save.json`
- `tasks/us-006-evidence/expectation-restored.json`

## 4. 截图登记

| 文件 | 尺寸 | 字节 | SHA-256 |
|---|---:|---:|---|
| `expectation-draft-1440x900.jpg` | 1440x900 | 34343 | `9cf4933a4efc83545ef208ae711cc839c482e56a5bab94d38aeb036cb83dedaa` |
| `expectation-save-failed-1440x900.jpg` | 1440x900 | 34655 | `4b9a09dad29ccc36b34b613700eeea0caa664949d200252fb9cce7b0b5ae6201` |
| `expectation-save-success-1440x900.jpg` | 1440x900 | 34263 | `564ed6e945d4a40356909e5aeaf2547a24df2bb43bb134bb6b995f015153fddd` |
| `expectation-dirty-after-save-1440x900.jpg` | 1440x900 | 33655 | `f7489eee80a991a7da49b6eef2c03743d78439ef5e2abd2c19bb31b309261bdd` |
| `expectation-restored-1440x900.jpg` | 1440x900 | 36413 | `bdf8729a031449c70fd5df99b53f38ada10f3f124568986524eb264ae8c3e9fd` |

## 5. 机器验证

在 `music-agent`：

```text
pnpm test
18 files / 85 tests passed

pnpm exec tsc --noEmit
passed

pnpm lint
0 errors, 3 pre-existing warnings

pnpm build
passed; /studio and /api/songs/[id]/visual-recipe remain dynamic routes
```

本故事只验收配方保存、状态恢复与期待的直观展示；三配方审美是否定稿属于 US-008，不在本记录内假报通过。
