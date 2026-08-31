# US-012 文本搜索自检

时间：2026-08-31

## 旧端口、旧路径与旧执行口径

命令：

```powershell
rg -n "3000|3001|3002|3005|3006|32108|D:\\|C:\\|2026-08-18|2026-08-21|唯一执行入口" README.md docs music-agent/README.md music-agent/.env.example --glob '!docs/superpowers/**'
```

结果只命中三类说明性内容：

1. `docs/项目执行手册.md` 和 `docs/pipeline.md` 说明 2026-08-21 是历史资料或被替代结论。
2. `docs/使用与开发流程.md` 说明 2026-08-21 执行手册不是当前排期。
3. 未命中 `3000`、`3001`、`3002`、`3005`、`3006`、`32108`、本机盘符路径或“唯一执行入口”作为当前口径。

## 一键启动入口

命令：

```powershell
rg -n "启动Studio.cmd|scripts/start-studio.mjs" README.md docs tasks music-agent folia-major --glob '!node_modules/**' --glob '!.next/**' --glob '!dist/**'
```

结果只命中 PRD US-009 合同，以及 README 中“一键启动脚本尚未实现”的声明；未发现文档声称仓库当前已有这两个启动文件。

## 当前端口口径

命令：

```powershell
rg -n "3003|3004|32107" README.md docs/使用与开发流程.md docs/pipeline.md music-agent/README.md music-agent/.env.example music-agent/src/lib/folia-stage.ts music-agent/src/lib/media-output.ts
```

结果确认 Music Agent 为 `3003`、Folia web 为 `3004`、Stage 默认为 `32107`，并均说明实际端口以配置或 Folia 界面为准。
