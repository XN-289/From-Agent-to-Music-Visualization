# PRD：Agent 音乐可视化创作工作台

版本：v1.3（已批准）
日期：2026-08-31
状态：已批准
需求地位：本文件批准后是项目唯一需求源头；实现、测试、文档和排期不得偏离本文件。若现实与本文冲突，先修订本文并记录决策，再改代码。
范围：`music-agent/` 产品主体 + `folia-major/` 舞台、渲染与导出必要改造。
审阅状态：v1.3 根据 v1.2 的四方对抗性审查修订，重点补齐批次门槛、状态机、schema、Folia 集成和验收证据。

## 1. 定位与核心决策

本项目是个人本地自用的音乐创作工作台。用户与“专业 AI 音乐制作人”对话，生成中/日文歌曲；歌曲进入 Folia 可视化播放器；用户在 Studio 中为每首歌保存视觉配方；最终导出可发布的横屏与竖屏视频。

一句话定位：**Agent 是导演，Folia 是舞台，用户是唯一制片人和最终审片人。**

不可协商的决策：

1. **先收口，再个性化。** R0 未退出前，不合并受约束 AI 视觉配置或积木式组合的产品代码。
2. **先做受约束配置，再做积木。** 第二层只允许生成白名单枚举和有界数值；第三层只能在 registry/tuning 规范下组合受控模块。
3. **AI 不生成可执行代码。** 运行时不执行 AI 生成的 JavaScript、React、HTML、shader 或动态模块。
4. **审美由用户拍板。** 机器测试只能证明链路正确，不能代替用户目视验收。
5. **临时预览不等于保存。** AI 候选默认不覆盖歌曲数据；采用也不等于保存。
6. **导出只吃已保存配置。** 导出前存在未保存修改或临时候选时必须阻断并让用户选择。
7. **遵循原 Folia 代码组织。** 小模块、共享类型、registry、tuning、独立测试；不做无关重构。

## 2. 术语

| 术语 | 含义 |
|---|---|
| R0 | 现有体验收口批次 |
| R1 | 第二层：受约束 AI 视觉配置批次 |
| R2 | 第二层增强：配方迭代、版本对比、偏好沉淀批次 |
| R3 | 第三层：积木式视觉组合批次 |
| 配方 | 一首歌曲当前持久化的视觉配置，存于歌曲数据 |
| AI 候选 | 一次生成得到的临时配方，不改变歌曲数据 |
| 采用 | 用户把候选复制到可编辑草稿；仍不保存 |
| 保存 | 把当前可编辑草稿写入歌曲数据，并追加版本历史 |
| 回滚 | 从服务端版本历史取上一份已保存配方，并作为一次新保存写入 |
| 真实试听 | 使用 Folia 主播放链路和真实音频分析确认效果 |
| 构图预览 | Studio 内嵌 iframe 预览；只用于构图和颜色，不代表音频反应 |

严重级别统一使用：Blocker 表示阻断批次退出；Major 表示必须修复但可与其他项并行；Minor 表示体验或维护问题。

## 3. 目标与成功判据

| 目标 | 判据 |
|---|---|
| G1 用户能独立完成全流程 | 冷启动服务后，用户只按用户文档完成生成、调视觉、播放、导出；无开发者协助 |
| G2 中日文链路可用 | 中文歌和日文歌均通过产物、字幕同步和播放检查 |
| G3 三套基础配方定稿 | 用户逐个确认 `livehouse`、`rain-window`、`neon-night` |
| G4 导出可发布 | 每首验收歌都有 1920x1080 和 1080x1920 的 H.264+AAC MP4，用户确认可发布 |
| G5 用户愿意继续使用 | US-009 验收时用户明确表达愿意继续用它做歌 |
| G6 技术债收口 | Mock 时间轴、prompt 分阶段加载、文档对齐均完成并留证据 |
| G7 第二层个性化成立 | 3 个不同真实 `songId` 连续通过生成、校验、真实试听、采用、保存、刷新、回滚和导出检查 |
| G8 第三层可安全启动 | R2 退出或用户明确延期，且 schema、性能基线和技术设计包齐全 |

## 4. 现状基线与已知风险

### 4.1 已有能力

- 对话生成中文歌，支持 musicproxy 与 mock。
- 日文歌带中文翻译副字幕，产物包含 `lyrics.t.lrc` 和 MP3 USLT 双帧。
- 封面优先使用 Provider URL，失败回退本地生成。
- 生成后可推送 Folia Stage；Stage 不可用时生成不失败，可手动重推。
- `/studio` 已是三栏结构：作品、对话、舞台与配方。
- 当前配方模型支持 `id + intensity + temperature + chorusImpact`，可保存到歌曲。
- Music Agent 能把配方转换为 Stage `visualConfig` 并推送到 Folia。
- Folia 支持主播放、全屏和 Electron 导出。

### 4.2 当前实现必须先修的风险

这些风险是 R0 或 R1 前置条件，不允许只靠文档解释放行：

1. **Studio iframe 是 OBS web source，没有本地音频分析。** 它不能作为能量、高潮反应等音频反应维度的权威预览。
2. **Stage `visualConfig` 当前会应用到全局偏好。** 下一首没有 `visualConfig` 时不会自动恢复，存在跨歌曲污染。
3. **视觉契约分散在 Music Agent 与 Folia 两套代码中。** 必须建立共享 fixture 和跨项目解码测试。
4. **Folia 导出能力探测可能回退 WebM。** 产品验收要求 H.264+AAC MP4，WebM 不能算通过。
5. **R0 验收记录不完整。** US-001 至 US-012 都必须有可复查证据。

## 5. 发布批次与唯一门槛

### 5.1 R0：现有体验收口

进入条件：本 PRD v1.3 获用户批准。

退出条件，全部满足：

1. US-001 至 US-012 全部通过。
2. US-008 三配方定稿先于 US-004 正式导出；导出后配方变更则重新导出。
3. US-012 用户文档更新先于 US-009 独立验收。
4. US-009 是 R0 最后一个验收项，必须从服务停止状态冷启动。
5. 每个用户故事在验收记录中登记证据位置。
6. R0 期间允许写 schema、Stage session、性能采集的技术设计，但不合并 R1/R3 产品代码。

### 5.2 R1：受约束 AI 视觉配置

进入条件：

1. R0 全部退出。
2. `VisualRecipe v2` schema 设计包获用户批准。
3. Folia session-scoped appearance 方案获用户批准。
4. 跨项目 schema/codec fixture 测试方案明确。

退出条件：

1. US-013、US-014 通过。
2. 三个不同真实 `songId` 组成 R1 验收集 T1，全部连续通过完整闭环。
3. T1 至少包含两首中文歌和一首日文歌；每首音频时长不少于 60 秒。
4. 每首闭环包含：自然语言生成、模型输出校验、候选摘要、构图预览、真实试听、A/B 对比、采用、手动微调、保存、刷新恢复、回滚、重新推送、横屏与竖屏导出检查。
5. 任一 Blocker/Major 缺陷出现后，连续计数清零；修复后重新跑完整 T1。
6. R1 期间不新增自由颜色输入、自由字体输入、任意 shader、动态代码或多版本 A/B 功能。

### 5.3 R2：配方迭代与偏好沉淀

进入条件：R1 退出。

最小范围：

1. 对当前草稿或候选做自然语言增量修改，例如“更暗一点”“副歌更炸”。
2. 查看同一首歌的保存历史，支持两版 A/B 真实试听。
3. 记录用户偏好为白名单标签，不生成新的渲染字段。

退出条件：

1. 三个 R1 已验收 `songId` 中至少两个完成增量修改和历史 A/B 验收。
2. 用户明确确认偏好建议有帮助且没有劫持最终决定权。
3. 偏好记录可导出、清空，且不包含敏感鉴权信息。

### 5.4 R3：积木式视觉组合

进入条件：

1. R2 退出，或用户书面明确延期 R2 并记录原因。
2. R3 技术设计包批准：模块 registry、tuning、类型、测试、性能基线、失败回退。
3. R1/R2 schema 冻结。
4. 基线报告已采集且可复跑。

退出条件：

1. US-015 通过。
2. 五类积木均独立注册、独立测试，并至少有三个差异明显的组合通过用户验收。
3. 预览、真实播放、横屏导出、竖屏导出符合预声明差异规则。
4. 性能同时满足平均 FPS 和低帧指标，不允许只看平均值。

## 6. R0 实施细则

执行顺序：

1. 先修生成产物完整性和任务失败态（US-001、US-002）。
2. 再修 Stage session 隔离、重推和自动播放（US-003、US-007）。
3. 再收口 Studio 布局、配方保存和 Provider 模式可见性（US-005、US-006）。
4. 再完成 Mock 时间轴与 prompt 优化（US-010、US-011）。
5. 更新文档和启动入口（US-012、US-009 前半）。
6. 用户定稿三配方（US-008）。
7. 正式导出横竖屏（US-004）。
8. 最后冷启动跑 US-009；失败则修复后重跑。

### US-001：对话生成中文歌

**实现契约**

- 生成任务状态必须是显式状态机：`draft -> submitted -> generating -> completed | failed | cancelled`。
- 提交后禁用重复提交；失败保留用户提示词和阶段结果。
- 成功只允许在音频、歌词、封面、数据库记录全部完成后判定。
- 音频缺失、歌词为空、封面缺失时任务必须标记为 `failed`，并保留已生成的部分产物；UI 可显示“不完整草稿”，但该状态不是任务状态机的第六个成功态，也不得进入可导出主流程。
- `SUNO_PROVIDER=mock` 必须不访问外部网络；真实模式必须记录 provider 请求 ID 或错误摘要。

**验收证据**

- 一个模糊输入用例：缺风格、情绪或结构时 Agent 先追问，不直接生成。
- 一个真实模式产物和一个 mock 产物。
- 产物检查包含目录、数据库记录、音频探针、歌词行数、封面尺寸格式。
- `music-agent` 执行 `pnpm test`、`pnpm lint`、`pnpm exec tsc --noEmit` 通过。

### US-002：日文歌中文翻译副字幕

**实现契约**

- 原文与翻译必须逐行配对，时间戳完全一致。
- MP3 写入原文 USLT 和 `chi/translation` USLT。
- Folia 副字幕显示读取翻译字段，不复制进主歌词。

**验收证据**

- 解析器断言每个日文行都有中文行且 timestamp 一致。
- 解析 MP3 USLT 两帧并比对内容。
- E2E 或人工检查至少三个时间点，原文与翻译同时出现，偏移不超过 300ms。
- Mock WAV 只验 `t.lrc` 与推送不报错，不判定 ID3。

### US-003：自动推送 Stage 与兜底

**实现契约**

- Stage 不可用时生成事务继续完成，UI 显示“稍后重推”。
- Stage 恢复后，手动重推 payload 必须包含音频、歌词、翻译、封面和当前已保存 `visualConfig`。
- Folia 收到 session 后自动播放；若浏览器策略阻止，显示需要用户点击的状态，不假报成功。
- Studio 有正在编辑的 `songId` 时，新歌生成完成不得静默抢占该编辑会话；只能显示“去查看新歌”，由用户显式切换。

**验收证据**

- 从 Stage 停止状态生成一首歌，生成完成且不中断。
- 启动 Stage 后手动重推成功，响应和 Folia 状态均确认。
- 有用户手势的自动播放检查记录。

### US-004：正式导出横竖屏视频

**实现契约**

- 导出入口必须从 Studio 或作品详情可见，不要求用户知道 Folia 内部菜单。
- 一个导出任务串行产出横屏和竖屏；显示阶段、进度、取消、失败原因。
- 任一段失败则整个任务失败；半成品文件不得标记为成功。
- 成功后展示文件名、时间、位置和打开文件夹入口。
- 只接受 H.264+AAC MP4。若 Electron recorder 不支持目标 MIME，任务失败或显式转码；WebM 回退不算成功。
- 导出前检查当前歌曲没有未保存配方或 AI 候选。

**验收证据**

- 使用 US-008 已定稿配方。
- ffprobe 记录编码、分辨率、fps、像素格式、音视频流、时长。
- 抽帧检查封面、歌词、无聊天 UI。
- 登记文件名、大小、SHA-256；文件缺失则验收失效。

### US-005：Studio 三栏工作台

**实现契约**

- 固定布局：左作品与状态，中音乐对话，右舞台与视觉配方。
- 桌面 1440x900 和移动 390x844 均无横向溢出，面板独立滚动。
- iframe 有 loading、失败、重试状态，不得停留在假加载。
- iframe 标注“构图预览”，并说明音频反应以真实试听为准。
- 顶部显示当前 Provider 模式：真实生成或 Mock。

**验收证据**

- Chrome 1440x900 与 390x844、100% 缩放截图。
- 断言 `document.documentElement.scrollWidth <= clientWidth`。
- 阻断 iframe 网络后能从 loading 进入可重试错误。

### US-006：当前配方保存

**实现契约**

- 数据库字段名统一为 `visual_recipe`；API/UI 属性名统一为 `visualRecipe`；文档必须说明两者是同一数据的存储名和序列化名。
- v1 数值规则：`intensity` 0-100，`temperature` -20 到 20，`chorusImpact` 0-100，均为整数。
- 保存中禁用保存按钮；保存失败恢复表单值并显示错误。
- 保存成功后，`editRecipe` 与 `savedRecipe` 相等，按钮禁用直到再次修改。

**验收证据**

- 状态矩阵：变脏、保存中、成功、再次变脏、失败、刷新恢复。
- 相关单测通过。

### US-007：配方驱动 Folia 原生舞台

**实现契约**

- Music Agent 只把已保存配方转换为 Stage `visualConfig`。
- Folia 必须把 Stage 配方作为当前 session 的外观覆盖，不写入全局偏好。
- session 无 `visualConfig` 时清除覆盖，恢复用户本地偏好。
- 切歌、关闭 Stage、新 session 均不得继承上一首歌曲配方。

**验收证据**

- 三预设合同测试列出期望 `visualConfig`。
- 播放歌曲 A 配方 X，切到无配方歌曲 B，确认 Folia 恢复；再回 A，确认配方 X 恢复。
- 真实音频下三配方画面成对可区分，用户验收前不判定审美通过。

### US-008：三配方用户定稿

**实现契约**

- 固定同一首真实歌、同一播放段落、同一 viewport、同一系统亮度。
- 顺序为 `livehouse -> rain-window -> neon-night`。
- 每个配方记录“通过”或“继续调整”；不使用“还行”等模糊结论。
- `neon-night` 若改值，必须更新映射测试、重新真实播放确认，再进入导出。

**验收证据**

- 用户结论、songId、配方 JSON、提交版本、时间。

### US-009：用户独立全流程验收

**前置**

- US-001 至 US-008、US-010 至 US-012 已完成。
- 用户文档已更新。
- 所有服务停止，浏览器无已打开产品页。

**执行规则**

- 用户只参考用户文档。
- 从启动服务开始，完成生成、配方保存、真实播放、横竖屏导出。
- 开发者不得口头指导、远程代操作或临时改文档。
- 任何卡点记为缺陷；修复后重跑完整 US-009。

**启动实现契约**

- 仓库提供 `启动Studio.cmd` 和 `scripts/start-studio.mjs`；用户双击或执行单条命令即可启动 Music Agent、Folia web、Folia Electron 和 Stage。
- `启动Studio.cmd` 只负责调用 `scripts/start-studio.mjs`，不得内嵌另一套启动逻辑。
- 启动脚本先做端口预检。端口空闲则启动；端口被占用时读取 `.runtime/studio-services.json`，若确认是本工作区的上次服务则提供“复用健康服务”或“停止后重启”，否则报错并显示占用进程信息，不得直接结束未知进程。
- 启动采用全有或全无：任一必需服务健康检查失败，就停止本次已启动的全部服务，写入失败状态和日志，不打开 Studio 页面。
- 健康检查必须校验服务语义响应，不能只判断进程存活；每个服务的健康地址、超时时间、重试间隔和通过条件写入脚本常量。
- 启动脚本写入 `.runtime/studio-services.json`，记录 runId、进程、端口、启动时间、健康检查地址和日志路径；停止脚本必须只结束本次或上次记录的、且命令行归属本仓库的进程。
- 启动过程中显示可读状态：Music Agent、Folia、Stage、Electron；失败时给出“重试”“打开日志”“停止全部”三个动作。
- 每次启动创建独立日志目录 `.runtime/logs/<runId>/`，保留最近 10 次启动日志；清理旧日志不得删除其他目录。
- 全部健康后自动打开 `http://localhost:3003/studio`。
- 脚本不得要求用户手工编辑 `.env.local`、手工选择端口或手工启动多个终端。

**证据**

- 开始/结束时间、songId、导出文件与哈希、用户原话结论。

### US-010：Mock 结构感知时间轴

**实现契约**

- 有结构标记时按段落类型加权；无结构标记时走声明确认的 fallback。
- 时间必须单调、覆盖整首时长、不产生负数或重叠。
- 真实后端 `getTimestampedLyrics` 有效时优先使用；乱序、重叠、空数据时拒绝并回退。

**验收证据**

- golden 输入与完整期望时间轴。
- 带结构、无结构、真实优先、乱序、重叠、空数据测试。

### US-011：Prompt 分阶段加载

**实现契约**

- 阶段：需求挖掘、写词、生成、迭代。
- 每阶段有明确 harness 文件清单和加载测试。
- 提供统计命令，输出每阶段优化前后 system prompt token 数。
- 任一阶段 token 下降不低于 40%，或采用声明的加权平均，但不得只报最好项。

**验收证据**

- baseline commit、prompt 快照、统计命令、四阶段数据。
- 每阶段至少一个质量回归用例，按通过/失败 rubric 判定。

### US-012：文档与 PRD 对齐

**实现契约**

- 用户文档必须能让新会话完成启动、生成、调视觉、导出。
- 文档主体使用仓库相对路径；本机绝对路径只放环境附录。
- 明确 Music Agent 3003、Folia web 3004、Stage 32107，并说明实际端口以配置为准。
- `PROJECT_STATE.md` 与 `decisions.md` 记录 PRD 为唯一需求源。

**验收证据**

- stale 内容清单：旧日期、旧端口、旧路径、旧排期。
- 文本搜索确认无冲突口径。
- US-009 只按文档跑通。

## 7. R1 数据与 Schema 细则

实施顺序：

1. 冻结 v2 schema、palette、迁移和错误报告。
2. 修 Folia session-scoped appearance，确认不污染全局偏好。
3. 增加跨项目 cfg fixture。
4. 实现候选生成 API、审计和确定性摘要。
5. 实现 Studio 状态机与右侧 UI。
6. 实现保存版本和回滚。
7. 跑 T1 三首歌完整闭环。

### 7.1 `VisualRecipe v2`

单一事实源放在 Music Agent 的 schema 模块，并导出 TypeScript 类型、JSON Schema、默认值和 normalizer。Folia 侧只消费 `StageVisualConfig`，不复制 AI schema。

目标结构：

```ts
type VisualRecipeV2 = {
  schemaVersion: 2;
  basePreset: "neon-night" | "rain-window" | "livehouse";
  intensity: number;       // integer, 0-100
  temperature: number;     // integer, -20..20
  chorusImpact: number;    // integer, 0-100
  appearance: {
    paletteId: VisualPaletteId;
    visualizerMode: "classic" | "cadenza" | "partita" | "fume" | "monet";
    backgroundMode: "common" | "monet" | "nomand" | "latent";
    fontStyle: "sans" | "serif" | "mono";
    animationIntensity: "calm" | "normal" | "chaotic";
    backgroundOpacity: number;  // 0.42-0.80, step 0.01
    visualizerOpacity: number;  // 0.78-1.00, step 0.01
    useCoverColorBg: boolean;
    disableVisualizerGeometricBackground: boolean;
    disableVisualizerVignette: boolean;
  };
};
```

规则：

- R1/R2 不开放任意 hex 颜色输入。AI 只能选择 `paletteId`，完整颜色由本地 palette catalog 生成。
- R1/R2 不支持 `url`、`sora` 背景模式，避免外部资源和不可控依赖。
- light/dark theme 由 palette catalog 确定性生成；R1 中两者一致，避免半套主题造成误判。
- 未知字段忽略并列出警告；未知枚举回默认并列出警告。
- 数值非法或越界时 clamp 并四舍五入到声明 step，同时列出警告。
- 根对象非法、必需结构缺失、JSON 超过 16KB、嵌套超过 4 层时整体拒绝，不生成候选。
- 任何被修正或拒绝的请求必须在摘要中显示，不允许静默假装满足。

### 7.2 Palette catalog

| ID | 背景 | 主色 | 强调色 | 辅助色 |
|---|---|---|---|---|
| `neon-cyan` | `#13244a` | `#2ee6ff` | `#ff5fae` | `#d3e2ff` |
| `rain-glass` | `#071014` | `#67e8f9` | `#a5b4fc` | `#a8c0cc` |
| `live-ember` | `#100906` | `#f97316` | `#ef4444` | `#d5b39b` |
| `midnight-violet` | `#10102a` | `#a78bfa` | `#22d3ee` | `#e2e8f0` |
| `deep-ocean` | `#061a24` | `#38bdf8` | `#99f6e4` | `#e0f2fe` |
| `forest-lamp` | `#08130f` | `#34d399` | `#fbbf24` | `#d1fae5` |
| `sakura-dusk` | `#1a0f18` | `#f9a8d4` | `#c4b5fd` | `#fee2e2` |
| `mono-noir` | `#09090b` | `#e4e4e7` | `#a1a1aa` | `#f4f4f5` |

### 7.3 v1 迁移

读取无 `schemaVersion` 的旧数据时：

1. `id` 迁移为 `basePreset`。
2. 三个数值按 v1 规则 clamp 并取整。
3. 按旧预设推导默认 `paletteId`、`visualizerMode`、`backgroundMode` 和两个开关。
4. `backgroundOpacity = round((0.42 + chorusImpact / 100 * 0.38) * 100) / 100`。
5. `visualizerOpacity = round((0.78 + intensity / 100 * 0.22) * 100) / 100`。
6. `fontStyle = "sans"`；`animationIntensity` 按 `intensity >= 72 chaotic、>= 38 normal、否则 calm`。
7. 迁移结果写入前必须通过 v2 normalizer。

### 7.4 版本与回滚

新增 append-only 表 `visual_recipe_versions`：

| 字段 | 说明 |
|---|---|
| `id` | 版本 ID |
| `song_id` | 所属歌曲 |
| `version_number` | 歌曲内单调递增版本号，从 1 开始 |
| `recipe_json` | 完整 v2 配方 |
| `source` | `manual` / `ai` / `rollback` / `migration` |
| `summary` | 确定性摘要 |
| `created_at` | 保存时间 |

规则：

- 每次成功保存都追加一条版本。
- `visual_recipe_versions` 必须有 `unique(id)` 与 `unique(song_id, version_number)` 约束；不允许更新或删除历史版本。
- `songs` 除 `visual_recipe` 外还保存 `visual_recipe_version_id` 作为当前版本指针；两者必须在同一事务中更新。
- v1 数据一次性迁移到 v2 时，若该歌曲尚无版本记录，必须在同一数据库事务中写入当前配方和 `source = migration`、`version_number = 1` 的初始版本；重复迁移不得重复追加。
- `songs.visual_recipe` 始终是当前生效配方；`baseVersionId` 判定以 `songs.visual_recipe_version_id` 为准。
- 回滚接口由服务端读取当前版本号减一的历史版本，不接受客户端提交任意回滚目标。
- 回滚本身是一次新保存，`source = rollback`。
- 少于两条版本时禁用回滚。
- 回滚失败不改变当前配方，不清空表单，不允许 Stage 保持新配置而数据库回到旧配置。

### 7.5 AI 生成审计

生成请求不改变歌曲当前配方，但允许写入只读审计表 `visual_recipe_generation_events`：

| 字段 | 说明 |
|---|---|
| `event_id` | 事件 ID |
| `song_id` | 歌曲 |
| `prompt` | 用户自然语言输入 |
| `raw_model_output` | 模型原始输出 |
| `validation_report` | 未知字段、修正项、拒绝原因 |
| `candidate_recipe` | 校验后的候选，失败可为空 |
| `created_at` | 时间 |

规则：

- `candidateId` 直接使用成功审计事件的 `event_id`；失败事件没有可预览候选。
- 审计表不参与渲染，不放入 `StageVisualConfig`，不存鉴权信息。
- 失败生成也必须留审计，便于判断模型输出质量和 schema 设计问题。

## 8. R1 服务与状态机细则

### 8.1 API

新增候选生成接口：

`POST /api/songs/{songId}/visual-recipe-candidates`

请求：

```json
{
  "prompt": "赛博雨夜，副歌炸开，歌词像霓虹一样浮现",
  "includeCurrentRecipe": true
}
```

行为：

- 服务端读取歌名、歌词、当前配方和用户描述。
- 服务端用本地图片分析生成封面上下文：尺寸、平均明度、两个主色描述；模型只收到描述和 palette 名称，不收到任意 hex 输入权限。
- 模型只输出 v2 配方 JSON，不输出代码。
- 服务端 normalizer 校验并生成确定性摘要、diff、警告和不支持项。
- 响应包含 `candidateId`、`recipe`、`summary`、`diffFromCurrent`、`warnings`、`unsupportedRequests`。
- 请求不修改 `songs.visual_recipe`，不追加版本历史。
- `candidateId` 即审计事件 ID；刷新或切歌后 UI 不自动恢复候选，但审计记录仍可用于排查和测试。

新增候选真实预览代理：

`POST /api/songs/{songId}/visual-recipe-preview`

请求支持三种模式：

```json
{ "previewMode": "saved" }
```

```json
{ "previewMode": "candidate", "candidateId": "..." }
```

```json
{ "previewMode": "draft", "recipe": { "schemaVersion": 2, "...": "完整 VisualRecipe v2" } }
```

行为：

- `saved` 由服务端从数据库读取当前配方，不接受客户端提交配方。
- `candidate` 只接受 `candidateId`，服务端从审计事件读取已校验候选，并确认事件属于当前 `songId`；不接受客户端重写候选 JSON，防止绕过生成时校验。
- `draft` 接收完整 v2 配方，但必须先通过同一 normalizer；校验失败返回 422 和可定位错误，不得降级为已保存配方。
- 三种模式都只更新 Folia 当前 session 的外观，不写歌曲数据，不追加版本历史。
- 转换为 `StageVisualConfig` 必须在 Music Agent 服务端完成；Folia 不理解 AI schema，也不复制 normalizer。

保存沿用：

`PATCH /api/songs/{songId}/visual-recipe`

请求必须包含：

```json
{
  "recipe": { "schemaVersion": 2, "...": "完整 VisualRecipe v2" },
  "baseVersionId": "...",
  "origin": "manual | ai",
  "candidateId": "仅 origin=ai 时提供"
}
```

行为：

- 服务端先用同一 normalizer 校验 `recipe`；失败返回 422，不写数据库。
- `baseVersionId` 必须等于该歌曲最新版本 ID；不一致返回 409，Studio 必须重新加载已保存配方并让用户选择是否覆盖，不允许静默覆盖并发修改。
- 更新 `songs.visual_recipe` 与追加 `visual_recipe_versions` 必须在同一数据库事务内完成；失败时当前配方和版本历史都不变。
- `origin = ai` 只允许在保存配方与审计候选规范化后完全一致时使用，且 `candidateId` 必须属于当前歌曲；只要用户手动改过任何字段，本次保存来源就是 `manual`。

新增回滚：

`POST /api/songs/{songId}/visual-recipe/rollback`

请求包含当前 `baseVersionId`。服务端在同一事务中读取当前版本的前一条已保存配方，追加 `source = rollback` 的新版本，并更新当前配方；`baseVersionId` 过期时返回 409，不执行回滚。

### 8.2 Studio 状态机

必须显式区分：

```text
savedRecipe        数据库已保存配方
editRecipe         当前手动/AI 采用后的可编辑草稿
candidate          服务端返回的临时候选
previewMode        saved | candidate | draft
generationState    idle | loading | failed
saveState          idle | saving | failed
rollbackState      idle | running | failed
```

合法主流程：

```text
已保存
  -> 用户改控件       => 手动未保存
  -> 生成成功         => AI 候选临时预览
  -> 用户采用候选     => AI 采用后未保存，candidate 清空
  -> 用户保存         => 已保存，并追加版本
  -> 用户回滚         => 服务端上一版成为新的已保存状态
```

约束：

- 生成中不能采用、保存、回滚或切换歌曲。
- 候选存在时，可一键在“已保存配方 / 候选”之间切换，播放进度不重置。
- 手动草稿不能伪装成 AI 候选；预览草稿时 `previewMode = draft`，并保持“未保存”警示。
- 放弃候选必须同时恢复表单和 Stage 到已保存配方。
- 采用候选只复制到 `editRecipe`，不清空版本历史，不写数据库。
- 刷新或切换歌曲会丢弃候选；执行前必须有确认提示。
- 导出入口看到 `candidate` 或 `editRecipe !== savedRecipe` 时必须阻断。
- 保存失败保留草稿并显示可重试错误。
- 所有失败状态必须有退出路径，不允许永久 loading。

### 8.3 Folia 真实预览

R1 必须提供两种预览：

1. **构图预览**：现有 Studio iframe，用 cfg 参数看构图、颜色、排版；标注“无音频反应”。
2. **真实试听**：把已保存配方、AI 候选或手动草稿发送到 Folia 当前 session，由主播放窗口使用真实音频分析渲染。

Folia 新增 session 外观更新能力：

`POST /stage/session/appearance`

请求包含 `songId`、`visualConfig`、`mode`、`nonce`。行为：

- 只更新当前 Stage session 的外观覆盖。
- 不写全局偏好，不持久化到本地配置。
- 只更新外观，不替换音频、歌词、封面或 session，不触发 seek；A/B 切换时播放进度必须保持。
- 请求的 `songId` 与当前 session 不一致时返回 409。
- `visualConfig` 结构非法时返回 422；`nonce` 早于当前 session 外观版本时返回 409，由调用方重新同步状态。
- 新 session 或无覆盖时恢复该 session 应有外观。
- `updatedAt` 或版本号防重复应用。

### 8.4 UI 细则

右侧视觉区从上到下：

1. 当前模式与未保存状态。
2. 已保存配方 / AI 候选 A/B 切换。
3. AI 输入框与生成、放弃按钮。
4. 候选摘要：改了什么、支持什么、不支持什么、被修正什么。
5. 手动安全控件：基础预设、palette 色板、视觉模式、背景模式、字体、动画强度、两个 opacity、开关项、三个既有滑杆。
6. 高级配置折叠面板：只读、格式化 JSON。
7. 保存、回滚、真实试听、推送按钮。

规则：

- 普通用户不需要理解 JSON。
- AI 能设置的用户可理解字段必须有等价手动控件。
- 候选摘要由本地代码根据 diff 生成，不直接信任模型自评。
- Stage 正在播放其他歌曲时，右侧显示醒目不一致警告，并禁用采用、保存、回滚和预览。

### US-013：AI 生成受约束视觉配方

**Acceptance Criteria**

- [ ] `VisualRecipe v2` schema、palette catalog、normalizer、迁移器和错误报告实现并通过单测。
- [ ] AI 输出只能成为 v2 配方；任何代码、HTML、shader、未注册模块、任意 hex 或未声明字段都不会进入渲染。
- [ ] v1 歌曲自动迁移或兼容读取，迁移后刷新、播放、保存、回滚均可用。
- [ ] 生成成功和失败均写入审计事件，但不修改当前歌曲配方。
- [ ] 候选摘要准确列出支持项、不支持项、被修正项和相对当前配方的差异。
- [ ] R1 验收集 T1 的三个不同真实 `songId` 全部连续通过生成、校验、候选摘要、构图预览、真实试听、A/B 对比、采用、手动微调、草稿预览、保存、刷新恢复、回滚、重新推送和实际横竖屏导出。
- [ ] Music Agent 与 Folia 相关测试、typecheck 通过。

**失败判定**

- 静默修正、静默丢弃、摘要夸大支持范围、候选污染数据库、跨歌曲污染 Stage、真实试听与导出使用不同配置，均判 Blocker。

### US-014：Studio AI 预览与确认

**Acceptance Criteria**

- [ ] AI 输入位于右侧视觉区，不新增第四栏，不打断中间音乐对话。
- [ ] 生成、采用、放弃、保存、回滚、失败、保存中、回滚中均有可见状态。
- [ ] 候选存在时可 A/B 切换已保存配方与候选，真实试听播放进度不重置。
- [ ] 采用后进入可编辑草稿；保存前刷新、切歌、导出均有明确阻断或确认。
- [ ] AI 可设置的字段在 UI 中有等价手动安全控件。
- [ ] 高级 JSON 面板只读、格式化、默认折叠。
- [ ] Chrome 1440x900 与 390x844 无横向溢出，核心按钮不重叠。
- [ ] 生成失败、schema 失败、保存失败、回滚失败、Stage 断开均可退出失败态并重试。

## 9. R1 测试矩阵

机器测试至少覆盖：

1. v1 -> v2 迁移、重复迁移、非法旧值。
2. 未知字段、非法 enum、越界数值、布尔错误、根结构错误。
3. 每个 palette 到 `StageVisualConfig` 的期望映射。
4. Music Agent cfg 编码后由 Folia `appearanceCodec` 解码的跨项目 fixture。
5. 候选生成成功、模型 JSON 解析失败、schema 失败、审计写入。
6. 预览接口的 saved、candidate、draft 三种模式；candidateId 不存在、跨 songId、draft schema 非法、nonce 过期均不得更新 Stage。
7. 生成中刷新、生成失败、放弃候选、采用候选、手动再修改、草稿预览、保存失败、保存成功、回滚失败、回滚成功。
8. songId 隔离：歌曲 A 候选不得影响歌曲 B。
9. 保存的 normalizer 失败、`baseVersionId` 过期、数据库事务失败和 `origin = ai` 来源判定。
10. Stage session 外观切换与清除，确认不污染全局偏好。
11. 导出前状态门禁。
12. 桌面与 390px 布局。

命令：

- Music Agent：`pnpm test`、`pnpm lint`、`pnpm exec tsc --noEmit`
- Folia：`pnpm test`、`pnpm typecheck`

## 10. R2 细则

R2 在 R1 之上增加：

1. `POST /api/songs/{songId}/visual-recipe-candidates` 支持 `baseVersion` 和 `instruction`，对当前草稿做增量修改。
2. 每次增量输出仍必须通过同一 v2 normalizer。
3. 历史列表支持选择任意两版做真实试听 A/B，但不改变当前配方。
4. 偏好只记录白名单标签，例如偏好暗背景、高能量副歌、冷色、少装饰；不存自由文本渲染指令。
5. 偏好只能作为生成上下文，不能绕过用户确认自动保存。

## 11. R3 细则

### US-015：积木式视觉组合

**Acceptance Criteria**

- [ ] R3 技术设计包先获批准，包含 registry、类型、tuning、测试、性能和回退方案。
- [ ] 至少实现 background、subject、lyricLayout、audioReaction、transition 五类受控积木。
- [ ] 每个积木有稳定 ID、输入 schema、默认 tuning、支持方向、失败回退和独立测试。
- [ ] AI 只能组合已注册积木与有界参数，不能生成代码、文件路径、未注册模块或动态 import。
- [ ] 同一配置在构图预览、真实播放、横屏导出、竖屏导出中一致，或仅出现预声明适配。
- [ ] 用户用同一首歌生成 3 个差异明显组合并逐个确认。
- [ ] 性能达到平均 FPS、1% low FPS、p99 frame time 和导出耗时阈值。
- [ ] Music Agent 与 Folia 相关测试、typecheck、lint 或等价检查通过。

**失败判定**

- 未注册模块进入渲染、运行时执行生成代码、配置无法回退、跨歌曲污染、预览与导出差异未声明、平均 FPS 达标但低帧严重不达标，均判 Blocker。

### 11.1 技术设计包

R3 代码前必须交付并批准：

1. 积木 registry 设计。
2. 每类积木的输入 schema、默认 tuning、支持方向和失败回退。
3. 组合规则和互斥规则。
4. 性能基线报告。
5. 与现有 Folia `visualizer` 目录的文件映射。
6. 测试清单和跨项目 fixture。

### 11.2 积木分类

最少五类：

| 类别 | 数量规则 | 说明 |
|---|---|---|
| background | 恰好 1 个 | 背景层 |
| subject | 恰好 1 个 | 主体形状或视觉核心 |
| lyricLayout | 恰好 1 个 | 歌词排版 |
| audioReaction | 1-2 个 | 音频反应方式 |
| transition | 0-1 个 | 段落或状态转场 |

每个积木必须有稳定 ID：`<kind>.<name>.v<n>`。AI 只能输出已注册 ID 和有界参数，不能生成组件名、文件路径、代码或动态 import。

### 11.3 性能基线

R3 开发前采集：

- 机器、CPU、GPU、系统版本。
- Node、Electron、浏览器版本。
- 固定 songId、配方、时长、分辨率。
- 平均 FPS、1% low FPS、p99 frame time。
- 横屏与竖屏导出耗时、成功数、失败数。

验收阈值：

- 平均 FPS 不低于基线 90%。
- 1% low FPS 不低于基线 85%。
- p99 frame time 不得高于基线 1.2 倍。
- 导出不新增失败；耗时不高于基线 1.3 倍。

## 12. 非目标

- 不做账号、权限、多租户、云同步、协作。
- 不做公网部署和运营后台。
- 不做音色克隆、热门歌曲仿写等玩法层功能。
- 不重写 Folia 渲染引擎，不自研替代渲染器。
- 不做通用视频剪辑器。
- 不做自动上传视频网站。
- 不做移动 App。
- R1 不做自由 hex 颜色、任意字体、任意 shader、动态代码、多版本 A/B。
- R3 不绕过 Folia registry、类型、tuning 和测试规范。

## 13. 代码组织要求

Music Agent 侧：

- schema、normalizer、palette、转换函数、AI parser 分离。
- API route 只做鉴权、请求解析和编排。
- Studio 状态逻辑抽成可测 hook，组件只负责展示。
- 不得在页面组件里堆置 AI 解析、迁移和 Stage 协议逻辑。

Folia 侧：

- session appearance 覆盖逻辑放在独立 hook/service。
- 不把 Stage 配方直接写入用户偏好。
- 新类型放共享类型层；新渲染能力通过 registry 注册。
- 保持原项目的 4 空格缩进、命名导出、小 hook、小 service 和独立测试风格。
- 所有行为变更配套单测或 fixture；UI 变更配浏览器验证证据。

## 14. 验收记录模板

每个用户故事必须登记：

| 字段 | 要求 |
|---|---|
| 故事编号 | US-xxx |
| 日期 | 实际验收日期 |
| 提交版本 | git commit 或工作区快照标识 |
| 环境 | 系统、Node、浏览器/Electron、端口 |
| 验收人 | 用户或机器测试 |
| 证据位置 | 日志、截图、ffprobe、测试输出、导出文件 |
| 结论 | 通过 / 失败 |
| 备注 | 缺陷编号或重跑原因 |

R1 T1 记录必须额外包含：

- songId、语言、音频时长。
- 用户自然语言输入。
- 模型原始输出摘要。
- 校验报告。
- 候选 JSON。
- 真实试听结论。
- A/B 对比结论。
- 采用、保存、刷新、回滚证据。
- 横竖屏导出文件与哈希。

### 14.1 当前验收登记

| 用户故事 | 结论 | 证据位置 |
|---|---|---|
| US-001 对话生成中文歌 | 通过 | `tasks/us-001-acceptance.md` |
| US-002 日文翻译副字幕 | 通过 | `tasks/us-002-acceptance.md` |
| US-003 Stage 推送与兜底 | 通过 | `tasks/us-003-acceptance.md` |
| US-004 横竖屏导出 | 待用户看片确认 | `tasks/us-004-acceptance.md` |
| US-005 Studio 工作台 | 通过 | `tasks/us-005-acceptance.md` |
| US-006 配方保存 | 通过 | `tasks/us-006-acceptance.md` |
| US-007 配方驱动舞台 | 通过 | `tasks/us-007-acceptance.md` |
| US-008 三配方定稿 | 通过 | `tasks/us-008-acceptance.md` |
| US-009 独立全流程 | 未验收 | 待补 |
| US-010 Mock 时间轴 | 通过 | `tasks/us-010-acceptance.md` |
| US-011 Prompt 分阶段加载 | 通过 | `tasks/us-011-acceptance.md` |
| US-012 文档对齐 | 通过 | `tasks/us-012-acceptance.md` |
| US-013 AI 受约束配方 | 未验收 | 待补 |
| US-014 Studio AI 预览确认 | 未验收 | 待补 |
| US-015 积木式组合 | 未验收 | 待补 |

### 14.2 当前执行 TODO

| 顺序 | 事项 | 完成标准 | 状态 |
|---|---|---|---|
| 1 | US-004 用户看片确认 | 用户分别确认横屏与竖屏成片可发布；若配方变化则本验收作废并重导 | 待确认 |
| 2 | 实现 US-009 启动入口 | 提交 `启动Studio.cmd`、`scripts/start-studio.mjs`、停止脚本、状态文件与日志目录约定，并有单元测试覆盖端口预检、服务健康、全有或全无和记录清理 | 已完成；证据见 `tasks/us-009-acceptance.md` |
| 3 | US-009 机器冷启动验收 | 从服务停止状态启动，四个必需服务健康并自动打开 `/studio`；失败路径能停止本次启动并写日志 | 已完成；成功、失败清理、停止与复用证据见 `tasks/us-009-acceptance.md` |
| 4 | US-009 用户独立验收 | 用户只按文档完成生成、配方保存、真实播放、横竖屏导出，并给出原话结论；任何卡点修复后完整重跑 | 待执行 |
| 5 | R0 收口复核 | US-001 至 US-012 全部登记通过；未进入 R1/R3 产品代码 | 待执行 |

US-009 完成前不得启动 R1 T1。若用户在另一台设备恢复，优先读取 `PROJECT_STATE.md`、本 TODO 与 `docs/使用与开发流程.md`，再继续当前步骤。

2026-08-31 说明：第 2、3 项通过只代表启动实现与机器冷启动证据完成，不关闭 US-009；第 4 项仍必须由用户独立执行完整链路。

## 15. 开放问题

| 编号 | 问题 | 默认处理 |
|---|---|---|
| OQ-2 | 整曲导出是否增加 30s/60s 预设 | 本期整曲导出，片段属未来 |
| OQ-3 | R1 真实试听是否默认打开 Folia Electron 窗口 | 是；构图预览不能替代真实试听 |
| OQ-4 | 导出 H.264 不支持时失败还是自动转码 | 默认任务失败并提示；自动转码需另行批准 |
| OQ-5 | R2 是否允许用户明确延期后进入 R3 | 允许，但必须在 `decisions.md` 记录原因和补验收时间 |

## 16. 批准

用户已于 2026-08-31 回复“批准”，满足以下生效条件：

1. 状态改为“已批准”。
2. R0 立即生效。
3. 后续实现不得超出本文范围。
4. 任何新增需求先修订 PRD 并更新版本号。
