# US-005 验收记录：Studio 三栏工作台

| 字段 | 记录 |
|---|---|
| 故事编号 | US-005 |
| 验收日期 | 2026-08-31 |
| 基线提交 | `2978b22a2505b8c8d5cc0c797c147fabfc2720d7` + 当前工作区 |
| 环境 | Windows 11，Node v24.18.0，pnpm 11.7.0，npm 11.16.0，Music Agent `http://127.0.0.1:3006`，Folia web `http://127.0.0.1:3004`，Codex In-app Browser（Chromium），100% 缩放 |
| 验收人 | 机器测试 |
| 证据位置 | 本文件、`music-agent/data/us005-acceptance.db`、`tasks/us-005-evidence/` |
| 结论 | 通过 |
| 备注 | Provider 为 `mock`，全程未调用真实 Provider，未生成新歌，未消耗付费额度；隔离数据库复制自 US-007，仅用于展示已有作品 |

## 1. 实现合同

- Studio 保持固定三栏工作台：左栏作品与状态，中栏音乐对话，右栏舞台与视觉配方。
- 顶部显示当前 Provider 模式：`mock` 显示 `Mock 生成`，其他 Provider 显示 `真实生成`。
- 右栏标题为 `构图预览`，并明确“仅判断构图、颜色与排版；音频反应以真实试听为准”。
- 构图预览先做 `no-cors` 连接预检，再挂载 iframe；预检 5 秒超时，iframe 加载 15 秒看门狗超时，失败态提供手动重试。
- 失败态不保留假 iframe；重试会重新预检、重新挂载，加载事件到达后隐藏 loading 覆盖层。
- Studio 高度继承全局 `main` 的实际可用高度，移动端使用有界 grid 行高，避免页面级滚动与三栏内容互相牵引。

主要实现与测试：

- `music-agent/src/app/studio/page.tsx`
- `music-agent/src/components/studio/studio-workspace.tsx`
- `music-agent/src/components/studio/stage-preview.tsx`
- `music-agent/src/components/studio/stage-preview-state.ts`
- `music-agent/src/components/studio/stage-preview.test.ts`

## 2. 桌面 1440x900

截图：`tasks/us-005-evidence/studio-1440x900.jpg`

```text
viewport: 1440x900, devicePixelRatio 1
document: clientWidth 1440, scrollWidth 1440
main: clientWidth 1440, scrollWidth 1440, clientHeight 731, scrollHeight 731, scrollTop 0
provider: data-provider-mode="mock", text="Mock 生成"
构图预览: 存在
真实试听提示: 存在
iframe: 存在，title="构图预览"
```

三栏几何：

| 栏 | 宽度 | 高度 | 滚动策略 |
|---|---:|---:|---|
| 作品 | 238 | 637 | `overflow-y: auto` |
| 对话外框 | 734 | 637 | 外框 `hidden`，内部消息区独立滚动 |
| 舞台与配方 | 400 | 639 | `overflow-y: auto` |

桌面左栏当前只有两条作品记录，内容本身未溢出；滚动容器仍为 `auto`，内容由多时会进入栏内滚动。

## 3. 移动 390x844

截图：`tasks/us-005-evidence/studio-390x844.jpg`

```text
viewport: 390x844, devicePixelRatio 1
document: clientWidth 390, scrollWidth 390
main: clientWidth 390, scrollWidth 390, clientHeight 675, scrollHeight 675, scrollTop 0
provider: "Mock 生成"
构图预览: 存在
真实试听提示: 存在
iframe: 存在，title="构图预览"
```

面板滚动能力：

| 区域 | clientHeight | scrollHeight | 结论 |
|---|---:|---:|---|
| 左栏作品 | 126 | 170 | 可独立滚动 |
| 对话内部消息区 | 86 | 1334 | 可独立滚动 |
| 右栏舞台与配方 | 213 | 602 | 可独立滚动 |

手势证据见 `tasks/us-005-evidence/mobile-panel-scroll-proof.json`：

- 滚动左栏：`left 0 -> 44`，`main` 保持 0。
- 滚动对话：`chat 114 -> 234`，`main` 保持 0。
- 滚动右栏：`right 0 -> 300`，`main` 保持 0。
- 右栏滚动操作位于栏内滚动条位置；直接在 iframe 画面上滚动会被内嵌页面原生接管，这不等同于右栏失效。

## 4. 断网失败与重试

失败态截图：`tasks/us-005-evidence/studio-preview-network-error-1440x900.jpg`

停止 Folia 3004 后刷新 Studio：

```text
耗时: 2753ms
错误文案: 构图预览加载失败
重试按钮: 可见且可点击
iframe: 未挂载
真实试听提示: 仍可见
```

恢复态截图：`tasks/us-005-evidence/studio-preview-retry-recovered-1440x900.jpg`

重启 Folia 后点击 `重试`：

```text
耗时: 3414ms
错误文案: 消失
iframe: 重新挂载
src: http://127.0.0.1:3004?obs=1&obsSource=now-playing&obsTheme=static
title: 构图预览
```

状态机另由单元测试覆盖：预检失败、iframe 失败、加载超时均进入 `error`；成功预检进入 `loading`，load 事件进入 `ready`；滞后的 load 事件不能把 `error` 覆盖成假成功。

## 5. 截图登记

| 文件 | 尺寸 | 字节 | SHA-256 |
|---|---:|---:|---|
| `studio-1440x900.jpg` | 1440x900 | 77142 | `82dcce0d19a1e5c2e05a227bd99e8821488f4c7d692a679d8aec24e37f34d90b` |
| `studio-390x844.jpg` | 390x844 | 29145 | `6ccc9237ba72f523e74539f44b8b3ebe276eee163cb1e8aafa13d1a80ea4d445` |
| `studio-preview-network-error-1440x900.jpg` | 1440x900 | 79235 | `bb3f07d7674fdd0a8a919e509c257f69c973420da15e2718f16629960c3e42b9` |
| `studio-preview-retry-recovered-1440x900.jpg` | 1440x900 | 75552 | `a9199cb7f266e15082b7f508f99e2b1c8e4bc8698fc320c960a35bab66cbbd7f` |

机器可读指标：

- `tasks/us-005-evidence/desktop-1440x900-metrics.json`
- `tasks/us-005-evidence/mobile-390x844-metrics.json`
- `tasks/us-005-evidence/preview-network-error.json`
- `tasks/us-005-evidence/preview-retry-recovery.json`
- `tasks/us-005-evidence/mobile-panel-scroll-proof.json`
- `tasks/us-005-evidence/evidence-index.json`

## 6. 机器验证

在 `music-agent`：

```text
pnpm test
17 files / 80 tests passed

pnpm exec tsc --noEmit
passed

pnpm lint
0 errors, 3 pre-existing warnings

pnpm build
passed; /studio remains a dynamic route
```

本故事只验收布局、状态与信息显性；构图审美、真实音频反应与三配方最终效果分别属于 US-008 及用户本人真实试听，不在本记录内假报通过。
