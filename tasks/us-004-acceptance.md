# US-004 正式导出横竖屏视频验收记录

| 项 | 内容 |
|---|---|
| 日期 | 2026-08-31 |
| 提交版本 | `01ac744` + 本证据工作区 |
| 验收歌 | `432cd78d-2026-4733-8da8-cd9d3e6bae66` / `神降・天火` |
| 配方 | US-008 定稿 `neon-night(72, 4, 76)` |
| 导出方式 | Folia Electron 主窗口真实录制，非浏览器截图或 WebM 替代 |
| 机器结论 | 视频规格、串行任务、动态画面与代码验证通过 |
| 用户结论 | 待用户查看横竖屏成片后确认；确认前 US-004 不关闭 |

## 结论

机器证据已完成，US-004 仍保持“待用户看片确认”。横屏与竖屏均为整曲 H.264 Baseline + AAC LC MP4，任务一次串行完成并成功；8 个抽帧哈希全部不同，画面为动态 Neon Night 风格且未发现聊天 UI。封面和成片观感在抽帧中无法由本地视觉模型稳定确认，必须留给用户目视，不用模型猜测补证。

## 窗口修复

早期竖屏导出曾出现后续帧重复和约 3.275 fps 的冻结现象，不能作为验收证据。根因是 `setContentSize(1080, 1920)` 超出 Windows 显示工作区，系统可能压缩或降级窗口内容，而编码轨道仍保持 1080x1920。

当前实现通过 `folia-major/electron/videoExportWindow.cjs` 选择缩放方案：保持目标 CSS 画布尺寸不变，把 Electron 物理内容缩放到显示区可容纳的大小；若最小缩放仍不可容纳则显式失败。`main.cjs` 会校验实际 `getContentSize()` 与 `getZoomFactor()`，不满足即失败。运行态证据显示横屏为 `1920x1080 / zoom 1`，竖屏为 `540x960 / zoom 0.5`，物理内容与缩放校验均通过。

## 导出任务

- Job ID：`stage-export-1788175429500-d9920797-6f51-407d-82e0-fc5210676ece`
- Stage session：`stage-1788175429156-b0fa1aa4-6c98-4151-9e2b-92f36f8b9daf`
- 状态：`succeeded`
- 歌曲时长：`189.528s`
- 导出耗时：`379.056s`
- 输出目录：`C:\Users\linma\Videos\Folia Exports\2026-08-31T11-23-49-498Z-神降・天火`

## 文件与编码

| 方向 | 文件 | 大小 | SHA-256 | 视频 | 音频 | 帧数 | 平均 FPS | 时长 |
|---|---|---:|---|---|---|---:|---:|---:|
| 横屏 | `神降・天火-1920x1080.mp4` | 447,210,739 | `E860FF8F32BB08F924C6526C9924962710796F59DD86C7476F044D98889F3853` | H.264 Baseline / `yuv420p` / 1920x1080 / 60fps | AAC LC / 48kHz / stereo | 10,285 | 54.0755 | 视频 190.410186s，音频 190.356083s |
| 竖屏 | `神降・天火-1080x1920.mp4` | 1,073,734,275 | `4F1A14CA3324684EF9BD3DEBF947437AB9336D00ADB974D739ED53C33E6BE58D` | H.264 Baseline / `yuv420p` / 1080x1920 / 60fps | AAC LC / 48kHz / stereo | 10,801 | 56.7989 | 视频 190.251725s，音频 190.206646s |

容器均为 MP4（`mov,mp4,m4a,3gp,3g2,mj2`），没有 WebM 替代或静默转码。

## 抽帧证据

横屏与竖屏均在 2s、60s、120s、180s 抽帧：

- 原始帧：`tasks/us-004-evidence/final-20260831-landscape/`、`tasks/us-004-evidence/final-20260831-portrait/`
- 拼图：`tasks/us-004-evidence/final-20260831-contact-sheet.jpg`
- 提亮复核图：`tasks/us-004-evidence/final-20260831-contact-sheet-bright.jpg`
- 提亮复核图 SHA-256：`C51DC439FE838362ACA38150F5836C7C9E35D6EA3F7AEB96F75039512AAD010D`

8 个帧 SHA-256 全部不同，证明导出不是冻结静帧：

| 方向 | 2s | 60s | 120s | 180s |
|---|---|---|---|---|
| 横屏 | `A246D3DD...CA05EDB4` | `4663F870...C0166B2FDA9` | `E19D79DA...60864CF4` | `9482F9C5...0CF20E3FA99` |
| 竖屏 | `9A474CF3...864B6314` | `A932EA3B...5A5E2DBBB1` | `045B3366...D34333AB0B9` | `56BE9276...F485F761EEC` |

像素亮度均值：横屏 5.64462 / 7.16380 / 9.20513 / 7.21890，竖屏 9.08724 / 12.67570 / 21.60250 / 9.88775。画面整体偏暗但随时间变化，不是黑屏。

本地 `qwen2.5vl:3b` 对提亮拼图的复核结果：可见日文歌词或中文翻译方向、深蓝/霓虹主视觉；未见网页聊天 UI、按钮或开发工具；无完全空白帧。另一轮单帧检查无法稳定确认封面/唱片视觉，因此封面项保留给用户成片目视，不写成机器通过。

## 最终验证

- `music-agent`：`pnpm test` 19 files / 105 tests 通过；`pnpm exec tsc --noEmit` 通过。
- `folia-major`：`npm run typecheck` 通过；`npx vitest run -c vitest.config.ts test/unit/electron/videoExportWindow.test.ts test/unit/stage/stageApi.test.ts` 2 files / 19 tests 通过。
- 本次验收未调用真实付费音乐 Provider，未生成新歌。

## 待确认

用户需要直接查看输出目录中的横竖屏 MP4，并分别给出“通过”或具体缺陷。若用户确认通过，US-004 才能登记为 R0 通过；若配方后续变化，本验收失效并需重新导出。
