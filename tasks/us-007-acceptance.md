# US-007 验收记录：配方驱动 Folia 原生舞台

| 字段 | 记录 |
|---|---|
| 故事编号 | US-007 |
| 验收日期 | 2026-08-31 |
| 基线提交 | `2978b22a2505b8c8d5cc0c797c147fabfc2720d7` + 当前工作区 |
| 环境 | Windows 11，Node v24.18.0，pnpm 11.7.0，npm 11.16.0，Music Agent `http://127.0.0.1:3006`，Folia web `http://127.0.0.1:3004`，Stage `http://127.0.0.1:32108` |
| 验收人 | 机器测试；审美结论明确留待 US-008 用户拍板 |
| 证据位置 | 本文件、`music-agent/data/us007-acceptance.db`、`music-agent/data/us007-media/`、`tasks/us-007-evidence/` |
| 结论 | 通过 |
| 备注 | Provider 为 `mock`，全程未调用真实 Provider，未消耗付费额度；Stage 使用隔离测试 token `us007-stage-token` |

## 1. 实现合同

- Music Agent 仅从数据库读取已保存的 `visual_recipe` 并转换为 Stage multipart `visualConfig`；未保存的临时编辑不会进入 Stage。
- Folia 以 Stage session 的 `id + updatedAt + light/dark` 作为外观决策键：有 `visualConfig` 时作为当前 session 覆盖，先缓存本地外观；`visualConfig: null`、Stage 清空、Stage 关闭或新 session 都会清除覆盖并恢复本地外观。
- Stage 外观覆盖不写入全局偏好；`theme_animation_intensity` 保持 `null`，公开 `setTheme` 仍保留用户主动保存动画强度的路径。
- 白天/夜间模式在配方覆盖期间切换时，本地外观缓存保留双主题，恢复时按当前模式取对应主题，避免用夜间主题污染白天偏好。
- Stage 服务丢失时，除了恢复本地外观，还会暂停并清空已选中的 Stage 音频资源，避免浏览器继续播放不可达 URL 的旧媒体。

主要实现与测试：

- `music-agent/src/lib/folia-stage.ts`
- `music-agent/src/lib/visual-recipe-to-folia.test.ts`
- `folia-major/src/services/stageAppearanceSession.ts`
- `folia-major/src/App.tsx`
- `folia-major/src/hooks/useThemeController.ts`
- `folia-major/src/stores/useSettingsUiStore.ts`
- `folia-major/src/utils/audioSourceTransition.ts`
- `folia-major/src/hooks/usePlaybackAudioBridge.ts`
- `folia-major/test/unit/stage/stageAppearanceSession.test.ts`
- `folia-major/test/unit/playback/audioSourceTransition.test.ts`
- `folia-major/test/manual/stage-client/disconnect-check.mjs`

## 2. 测试对象与数据库终态

Song A：

```text
songId: bbcae587-6a94-4492-9fb3-3c348a9224ae
jobId: 2b6e18f4-e7b3-451b-b4bf-a2677cb027b6
title: US007 Song A Recipe
provider: mock
status: completed
stage_delivery_status: pushed
visual_recipe: {"id":"neon-night","intensity":72,"temperature":4,"chorusImpact":76}
```

Song B：

```text
songId: 930ef4d1-b815-4594-b605-75ae66dc8009
jobId: 49c81f9e-2466-45c2-bff4-d3c9b16780b7
title: US007 Song B No Recipe
provider: mock
status: completed
stage_delivery_status: pushed
visual_recipe: null
```

两首歌各落盘两个 24 秒 WAV、封面、歌词与 metadata，位于 `music-agent/data/us007-media/`。数据库记录直接从 `us007-acceptance.db` 只读查询确认。

## 3. Stage session 隔离证据

| Stage session | updatedAt | 内容 |
|---|---:|---|
| `stage-1788154593386-3a3a7485-907b-4a45-9a4c-5f3f2fab352c` | `1788154593439` | Song A / Neon Night |
| `stage-1788154739178-e4002ec7-f532-4784-b8f5-3bc36af13892` | `1788154739215` | Song B / `null` |
| `stage-1788154883841-4caddf0c-6e89-46b9-a873-d851e73f48ec` | `1788154883866` | Song A / Neon Night |
| `stage-1788155025384-39d97b76-aa2b-496c-bb55-9c3bcbad7a88` | `1788155025406` | Song B / `null` |
| `stage-1788155094442-e4f76b89-8d64-4e3f-a27c-1af8302953b3` | `1788155095188` | Song A / Neon Night |
| `stage-1788156090147-6dadd358-cea8-4f3f-b98c-eec8510bf1ea` | `1788156090463` | Song A / Neon Night，服务断连测试 |

同一浏览器剖面内的 A -> B -> A 序列：

1. 本地外观：`local-before-recipe.png`。
2. Song A 使用 Livehouse 配方：`song-a-livehouse.png`。
3. Song B 无配方，Stage 发送 `visualConfig: null`，本地外观恢复：`song-b-no-recipe-restored.png`。
4. 回到 Song A，Livehouse 配方重新生效：`song-a-livehouse-returned.png`。
5. 清空 Stage 后本地外观恢复：`stage-cleared-restored.png`。
6. 新 session 先推 Song B，不继承上一首配方：`new-session-song-b-no-inherit.png`。

最终再用全新 Playwright 浏览器剖面复验，避免旧剖面状态影响结论：

- Song A / Neon Night 生效，真实 Stage 音频播放，`theme_animation_intensity` 为 `null`：`neon-night-fresh-profile.png`。
- 切到 Song B 后 Stage `visualConfig: null`，本地外观恢复，动画偏好仍为 `null`：`song-b-fresh-profile-restored.png`。

白天模式对抗项：

- 配方覆盖期间切到白天，背景为本地 Daylight `#f5f5f4`，前景仍为 Neon Night 配方色：`daylight-switch-under-recipe.png`。
- Song B 恢复后，Daylight 本地主色 `#1c1917`、辅色 `#44403c`、强调色 `#ea580c` 回来：`daylight-local-theme-restored.png`。
- 全程 `theme_animation_intensity` 均为 `null`。

## 4. Stage 服务断连对抗证据

最终通过记录为 `tasks/us-007-evidence/stage-disconnect.json`：

```text
stageSessionId: stage-1788156090147-6dadd358-cea8-4f3f-b98c-eec8510bf1ea
stageUpdatedAt: 1788156090463
restoreElapsedMs: 6198
```

配方生效时：

- Stage 音频 URL 为当前 session 音频，播放状态为 playing。
- 主色 `#2ee6ff`、辅色 `#d3e2ff`、强调色 `#ff5fae`，即 Neon Night。
- `default_theme_daylight = "true"`，`theme_animation_intensity = null`。

Stage 停止并等待连续轮询失败后：

- 背景 `#f5f5f4`，主色 `#1c1917`，辅色 `#44403c`，强调色 `#ea580c`，恢复 Daylight 本地外观。
- `attributeSrc = null`，`networkState = 0`，`paused = true`，`currentTime = 0`，`duration = null`，`stageAudioIsActive = false`。
- `theme_animation_intensity` 仍为 `null`。

说明：Chromium 可能在移除 `src` 并执行 `load()` 后仍保留旧的 `currentSrc` 字符串，因此验收以“活动状态清空”为准，不把 `currentSrc` 字符串本身当作失败。

对抗测试先抓到一个真实 bug：Stage 断开后外观恢复，但已选中的 `<audio>` 继续播放旧 URL。原因是旧逻辑只处理“旧 URL -> 新 URL”，没有处理“旧 URL -> null”。修复为 `pause() -> currentTime = 0 -> removeAttribute('src') -> load()`。`stage-disconnect-pre-fix-failure.json` 是修复前失败工件，仅用于解释该 bug，不作为当前验收结果；最终通过证据是 `stage-disconnect.json`。

## 5. 三预设真实音频区分

同一真实音频播放状态、同一 viewport 下采集：

| 配方 | Folia 模式 | 截图 | RGB 均值 R/G/B |
|---|---|---|---|
| Livehouse | `partita` | `livehouse-playing.png` | `41.691 / 54.116 / 71.128` |
| Rain Window | `monet` | `rain-window-playing.png` | `29.604 / 63.631 / 83.909` |
| Neon Night | `fume` | `neon-night-playing.png` | `9.678 / 21.981 / 27.632` |

合同测试固定三套完整 `visualConfig`：

| 配方 | 主题色 | 背景模式 | 背景/可视化透明度 |
|---|---|---|---|
| Livehouse | `#100906 / #f97316 / #ef4444 / #d5b39b` | `latent` | `0.77 / 0.96` |
| Rain Window | `#071014 / #67e8f9 / #a5b4fc / #a8c0cc` | `monet` | `0.59 / 0.86` |
| Neon Night | `#13244a / #2ee6ff / #ff5fae / #d3e2ff` | `common` | `0.71 / 0.94` |

像素均值与截图仅证明三配方在真实音频下成对可区分。本地视觉模型描述只作辅助证据，不作为唯一验收依据；“效果是否满意、Neon Night 是否继续提亮”仍留给 US-008 用户定稿，本验收不声明审美通过。

## 6. 机器验证

Music Agent：

```text
pnpm test                         16 files / 75 tests passed
pnpm exec tsc --noEmit            passed
pnpm lint                         0 errors, 3 pre-existing warnings
pnpm build                        passed
```

既有 lint warning：

- `src/app/api/credits/route.ts` unused `and`
- `src/components/chat/params-panel.tsx` unused `PANEL_GROUPS`
- `src/lib/providers/mock.ts` unused `readFile`

Folia：

```text
npm run typecheck                                             passed
npm test -- --testTimeout=15000                               214 files / 1625 tests passed, 1 timeout-only failure
npm test -- --testTimeout=60000                               215 files / 1626 tests passed, 1 skipped file/test
npm test -- audioSourceTransition stageAppearanceSession appStageHelpers
                                                               3 files / 10 tests passed
```

15 秒全量运行中唯一失败是 `omniArchitecture` 源边界扫描在本机并发转换下超时；该测试单跑通过，60 秒超时的最终全量运行也通过。最终结论采用 60 秒全量结果。

## 7. 证据清单

| 文件 | 大小 | SHA-256 |
|---|---:|---|
| `daylight-local-theme-restored.png` | 773,264 | `CDA9F906E287342E788B014D2A6E1449CD60F4ABB38A6220741EBBCA067AEE53` |
| `daylight-switch-under-recipe.png` | 224,724 | `741CF2B655F97AF41C625F6948274D69CE6E64F593D5182B562194A6DB356AB4` |
| `livehouse-playing.png` | 79,959 | `FB2214522E097CF9C0FD60122BFBF25B3122D2083D8D6734C9336EFC47689195` |
| `local-before-recipe.png` | 38,580 | `B27F3A23282E73DA53D61100D6416989C04D3CB929A9F4939CBCE0D3219F9E15` |
| `neon-night-fresh-profile.png` | 194,619 | `0CB379F5BE3700B2A24787F972CD8E425AEDAD994DC19C3C7CE935A57A58D46C` |
| `neon-night-playing.png` | 38,501 | `E5AA0747AA792EB9C5B1E57B791E8F5194878741B47CF39006786783292337D8` |
| `new-session-song-b-no-inherit.png` | 42,645 | `E4EFEB8EF28974103403EBB371F5577EDC57F997ADCB9A79F1F020A6A8FFFF72` |
| `rain-window-playing.png` | 43,737 | `21E274F6D3B9115F462A7D2DF737EB9099AEC51A05A094A12ADED7C37CCA8F57` |
| `song-a-livehouse-returned.png` | 80,520 | `99B01424834FE2B08F211C174BDDB82B3083867D6ED203D9BE0F235F4F35E93B` |
| `song-a-livehouse.png` | 73,998 | `B081028230C5C786CE6F4D5516DF4E2C799E4BB9887A98C11AAF98C3E19CEBCB` |
| `song-b-fresh-profile-restored.png` | 603,117 | `90983E31DC668B5EA743A03B6021E76AFAD376D8504DCFC26BB13B50CE97D504` |
| `song-b-no-recipe-restored.png` | 44,029 | `A78A9C6E1ADE6ABCC6F977F23A2D685AE9C9A46C52F4167FDEE1A8BD87F89088` |
| `stage-cleared-restored.png` | 24,101 | `C278BFF977C8C0669939E74005542AA8593D4D09299E663C57AE50B6753B0C2A` |
| `stage-disconnect-pre-fix-failure.json` | 29,894 | `00E86039C614763E0CF86A8E8BF5E162AA6A426135410D242A5F6E0737250FE1` |
| `stage-disconnect-recipe-active.png` | 195,555 | `6DB9A497E40B869196C835C5C00C050DA4C23111CAF90F97E0D326481DE1DA9F` |
| `stage-disconnect-restored.png` | 316,355 | `C88618A2228A9FA679FC1F699CFEF96F43C4FBA6A4A30D4247DB237D6CA59BFB` |
| `stage-disconnect.json` | 21,949 | `8501DA69404C73EF5CF09FF2F1ECC40960DE1F98176C07501A369E00336DB4E7` |

验收后 Music Agent、Folia web 与临时 Stage 服务均已停止；`disconnect-check.mjs` 复跑前需先按原端口与 token 重新启动两个 web 服务。
