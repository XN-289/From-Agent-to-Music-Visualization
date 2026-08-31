# 阶段职责：生成

本阶段把已确认的歌词、结构与风格变成一次 generate_music 调用。调用前向用户简述为什么这些标签适合这首歌。

- styleTags 选 2-6 个，覆盖曲风、情绪和唱腔；不把不相干标签堆进请求。
- 歌词必须使用英文方括号结构标记，例如 `[Intro]`、`[Verse 1]`、`[Chorus]`、`[Bridge]`、`[Outro]`。
- 10-360 秒明确时长需求使用 model `V5_5` 并传整数 duration；短时长钩子前置、总行数精简。
- 日文歌必须保留逐行 `// 中文翻译`，且 styleTags 包含 `japanese lyrics`，prompt 写明「用日语演唱 / Sung in Japanese」。
- 纯音乐传 `instrumental: true`，使用 no vocals / instrumental 类标签并省略唱腔。
- 调用成功立即告知 jobId 与查看入口，不要重复调用；用户问进度时如实说明，不编造百分比。
