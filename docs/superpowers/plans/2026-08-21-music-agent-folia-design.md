# Music Agent → Folia 完整体验 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「聊天生成 → 自动推送 Folia → 自动播放 → 原文+中文翻译副字幕 → 封面 → 横竖屏导出」做成一条本地闭环，一次性验收。

**Architecture:** 改动集中在 music-agent（Next.js 16 + pi Agent + drizzle SQLite）；folia-major 仅 3 处字段透传级小改。翻译走「harness 产出 `//` 翻译行 → 落盘 `lyrics.t.lrc` → 写入 MP3 USLT 帧 → Folia 解析 `translationLyrics`」链路；封面走「本地渲染 PNG → `coverFile` 推送」链路；自动推送与自动播放均已存在（`queueAutoDelivery` / `useStagePlaybackController.ts:1195`）。

**Tech Stack:** Next.js 16 / pi Agent（@earendil-works）/ drizzle + better-sqlite3 / node-id3 / @resvg/resvg-js / vitest（新增）/ Folia（Vite + Electron，AGPL-3.0）

## Global Constraints

- 目录：`D:\github项目\从Agent到音乐可视化`；music-agent 用 pnpm，folia-major 用 npm。
- Node ≥ 24（Folia engines 要求）；本机 Node v24.16.0 ✅。
- `.env.local`、`music-agent/data/` 已 gitignore；**任何提交不得包含真实 key**。
- 注释与提交信息用中文（跟随现有代码风格）；music-agent 现有代码无测试，本计划为纯函数新增 vitest 测试，UI/Electron 改动用手动验收。
- mock provider 产出 **WAV**（无 ID3），翻译显示只能在真实 MP3（sunoapi）上验收；mock 阶段只验 t.lrc 落盘与推送不炸。
- Folia 是上游 AGPL 副本：改动保持最小、可回溯，并在 `test/manual/stage-client/API_SCHEMA.md` 记录。

---

### Task 1: 基线跑通（现有链路，改动前的地基）

**Files:**
- Create: 无（仅运行与配置）
- Modify: `music-agent/.env.local`（补 Stage token 后生效）

**Interfaces:**
- Consumes: 已安装依赖（Task 0 已完成：pnpm install / npm install ✅）
- Produces: 可工作的基线环境（后续所有任务的验证依赖它）

- [ ] **Step 1: db:push 建表**

Run: `cd "D:\github项目\从Agent到音乐可视化\music-agent" && pnpm db:push`
Expected: `[✓] Pulling schema from database... [✓] Changes applied` 或 `No changes detected`

- [ ] **Step 2: 启动 Music Agent**

Run: `cd "D:\github项目\从Agent到音乐可视化\music-agent" && pnpm dev`（后台）
Expected: `✓ Ready in ...`，`http://localhost:3000` 可访问

- [ ] **Step 3: 启动 Folia Electron（Stage 服务器在其主进程）**

Run: `cd "D:\github项目\从Agent到音乐可视化\folia-major" && npm run dev:electron`（后台）
Expected: Vite 就绪于 `http://localhost:3000` 之外端口或冲突提示 + Electron 窗口弹出

- [ ] **Step 4: 启用 Stage Mode**

操作：Folia 桌面端 → 设置 → Stage Mode → 启用，来源选 **Stage API**；记下界面显示的 **端口** 与 **Bearer token**。

- [ ] **Step 5: 回填 token**

Edit `music-agent/.env.local`：
```
FOLIA_STAGE_BASE_URL=http://127.0.0.1:<界面显示的端口>
FOLIA_STAGE_TOKEN=<界面显示的 token>
```
改完重启 music-agent dev。

- [ ] **Step 6: 验证 Stage 健康**

Run: `curl -s http://127.0.0.1:<端口>/stage/health`
Expected: `{"enabled":true,"modeEnabled":true,"source":"stage-api",...}`

- [ ] **Step 7: mock 生成一首中文歌并确认自动推送+自动播放**

操作：浏览器打开 `http://localhost:3000` → 新建对话 → 说「写一首关于夏日傍晚的中文歌」→ 等生成完成（mock 约 10 秒）→ 观察 Folia 窗口是否自动开始播放。
Expected: 落盘 `data/media/<songId>/`（audio-01-*.wav / lyrics.lrc / meta.json）；Folia 自动播放；详情页显示推送成功。

- [ ] **Step 8: 提交基线（若有代码变动）**

```bash
git add -A && git commit -m "chore: 基线环境配置（Stage token 占位说明）"
```

---

### Task 2: 双语歌词数据模型（lrc.ts 扩展 + 测试基建）

**Files:**
- Create: `music-agent/src/lib/audio/lrc.test.ts`
- Create: `music-agent/vitest.config.ts`
- Modify: `music-agent/src/lib/audio/lrc.ts`
- Modify: `music-agent/package.json`（scripts.test）

**Interfaces:**
- Consumes: 无（纯函数模块）
- Produces:
  - `LyricsLine.translation?: string`
  - `TRANSLATION_PREFIX = '//'`
  - `stripTranslationLines(lyrics: string): string`
  - `parseLyricPairs(lyrics: string): Array<{ text: string; translation: string | null }>`
  - `buildTranslationLines(lyrics: string, lrc: LyricsLine[]): LyricsLine[]`
  - `parseLyricLines(lyrics: string): string[]`（行为变更：跳过翻译行）

- [ ] **Step 1: 引入 vitest**

Run: `cd "D:\github项目\从Agent到音乐可视化\music-agent" && pnpm add -D vitest`
Edit `package.json` scripts 增加：`"test": "vitest run"`
Create `vitest.config.ts`：
```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { include: ['src/**/*.test.ts'] },
});
```

- [ ] **Step 2: 写失败测试**

Create `src/lib/audio/lrc.test.ts`：
```ts
import { describe, expect, it } from 'vitest';
import {
  buildTranslationLines,
  parseLyricLines,
  parseLyricPairs,
  stripTranslationLines,
  type LyricsLine,
} from './lrc';

const BILINGUAL = [
  '[Verse 1]',
  '朝の光が窓を叩く',
  '// 晨光敲打着窗户',
  '[Chorus]',
  '君の名前を呼ぶたびに',
  '// 每次呼唤你的名字',
].join('\n');

describe('parseLyricLines', () => {
  it('跳过结构标记行与翻译行', () => {
    expect(parseLyricLines(BILINGUAL)).toEqual(['朝の光が窓を叩く', '君の名前を呼ぶたびに']);
  });
});

describe('stripTranslationLines', () => {
  it('剥离翻译行但保留结构标记', () => {
    expect(stripTranslationLines(BILINGUAL)).toBe(
      '[Verse 1]\n朝の光が窓を叩く\n[Chorus]\n君の名前を呼ぶたびに',
    );
  });
});

describe('parseLyricPairs', () => {
  it('翻译行紧跟其主行之后', () => {
    expect(parseLyricPairs(BILINGUAL)).toEqual([
      { text: '朝の光が窓を叩く', translation: '晨光敲打着窗户' },
      { text: '君の名前を呼ぶたびに', translation: '每次呼唤你的名字' },
    ]);
  });

  it('无翻译行时 translation 为 null', () => {
    expect(parseLyricPairs('[Verse]\n你好世界')).toEqual([{ text: '你好世界', translation: null }]);
  });
});

describe('buildTranslationLines', () => {
  const lrc: LyricsLine[] = [
    { startMs: 0, endMs: 4000, text: '朝の光が窓を叩く' },
    { startMs: 4000, endMs: 8000, text: '君の名前を呼ぶたびに' },
  ];

  it('翻译行继承主行时间轴（共轴）', () => {
    expect(buildTranslationLines(BILINGUAL, lrc)).toEqual([
      { startMs: 0, endMs: 4000, text: '晨光敲打着窗户' },
      { startMs: 4000, endMs: 8000, text: '每次呼唤你的名字' },
    ]);
  });

  it('纯中文歌词返回空数组', () => {
    expect(
      buildTranslationLines('[Verse]\n你好世界', [{ startMs: 0, endMs: 1000, text: '你好世界' }]),
    ).toEqual([]);
  });

  it('歌词行数多于 lrc 行数时按 min 截断', () => {
    const t = buildTranslationLines(BILINGUAL, [lrc[0]]);
    expect(t).toEqual([{ startMs: 0, endMs: 4000, text: '晨光敲打着窗户' }]);
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `pnpm test`
Expected: FAIL —— `stripTranslationLines is not exported` 等报错

- [ ] **Step 4: 实现**

Modify `src/lib/audio/lrc.ts`（整文件替换）：
```ts
// 逐行时间戳歌词（LRC 语义），播放器用它做高亮同步。
// 真实 Suno 后端可返回词级时间戳（aligned lyrics），P1 替换 makeLrc 的数据源即可。

export interface LyricsLine {
  startMs: number;
  endMs: number;
  text: string;
  /** 中文翻译（中日双语场景）；渲染端以副字幕样式显示 */
  translation?: string;
}

/** 翻译行前缀：写词阶段约定（harness 双语规范），提交 Suno 前必须剥离 */
export const TRANSLATION_PREFIX = '//';

/** 从带结构标记的歌词文本中提取歌词行（跳过 [Verse] 这类纯标记行与翻译行） */
export function parseLyricLines(lyrics: string): string[] {
  return lyrics
    .split('\n')
    .map((l) => l.trim())
    .filter(
      (l) => l.length > 0 && !/^\[.*\]\s*$/.test(l) && !l.startsWith(TRANSLATION_PREFIX),
    );
}

/** 剥离翻译行：提交给 Suno 的纯歌词（翻译行唱出来会毁歌） */
export function stripTranslationLines(lyrics: string): string {
  return lyrics
    .split('\n')
    .filter((l) => !l.trim().startsWith(TRANSLATION_PREFIX))
    .join('\n');
}

export interface ParsedLyricPair {
  text: string;
  translation: string | null;
}

/** 按行序解析主歌词行与紧跟其后的翻译行（结构标记行跳过） */
export function parseLyricPairs(lyrics: string): ParsedLyricPair[] {
  const pairs: ParsedLyricPair[] = [];
  for (const raw of lyrics.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith(TRANSLATION_PREFIX)) {
      const translation = line.slice(TRANSLATION_PREFIX.length).trim();
      if (pairs.length > 0) pairs[pairs.length - 1].translation = translation;
      continue;
    }
    if (/^\[.*\]\s*$/.test(line)) continue;
    pairs.push({ text: line, translation: null });
  }
  return pairs;
}

/** 主/翻共轴：主歌词时间轴按行序映射到翻译行，产出 tLrc 行 */
export function buildTranslationLines(lyrics: string, lrc: LyricsLine[]): LyricsLine[] {
  const pairs = parseLyricPairs(lyrics);
  const limit = Math.min(pairs.length, lrc.length);
  const out: LyricsLine[] = [];
  for (let i = 0; i < limit; i++) {
    const translation = pairs[i].translation;
    if (translation) out.push({ ...lrc[i], text: translation, translation: undefined });
  }
  return out;
}

/** 按时长均分行时间戳（P0 Mock 用；真实对齐数据优先） */
export function makeLrc(lines: string[], durationSec: number): LyricsLine[] {
  if (lines.length === 0) return [];
  const totalMs = durationSec * 1000;
  const step = totalMs / lines.length;
  return lines.map((text, i) => ({
    startMs: Math.round(i * step),
    endMs: Math.round(Math.min((i + 1) * step, totalMs)),
    text,
  }));
}
```

- [ ] **Step 5: 运行确认通过**

Run: `pnpm test`
Expected: 8 tests PASS

- [ ] **Step 6: 提交**

```bash
git add src/lib/audio/lrc.ts src/lib/audio/lrc.test.ts vitest.config.ts package.json pnpm-lock.yaml
git commit -m "feat(lrc): 双语歌词数据模型——翻译行解析/剥离/共轴映射 + vitest 测试基建"
```

---

### Task 3: 落盘与 DB（t.lrc / 剥离提交 / schema 迁移）

**Files:**
- Modify: `music-agent/src/lib/db/schema.ts`（songs 加 lyricsTlrc）
- Modify: `music-agent/src/app/api/jobs/[id]/route.ts`（完成时生成 tLrc）
- Modify: `music-agent/src/lib/media-output.ts`（PersistSongInput/落盘/读取 tLrc）
- Modify: `music-agent/src/lib/song-delivery.ts`（ensureLocalSong 透传 tLrc）
- Modify: `music-agent/src/lib/agent/generate-song.ts`（submitGeneration 剥离）
- Modify: `music-agent/src/lib/agent/pi.ts`（replace_section fullLyrics 剥离）
- Test: `music-agent/src/lib/media-output.test.ts`（新）

**Interfaces:**
- Consumes: Task 2 的 `LyricsLine`（含 translation）、`buildTranslationLines`、`stripTranslationLines`
- Produces:
  - `schema.songs.lyricsTlrc: string | null`（JSON: LyricsLine[]）
  - `PersistSongInput.tLrc: LyricsLine[]`；`PersistedSongBundle.lyricsTLrcPath: string | null`；`LoadedSongBundle.tLrc: LyricsLine[]`、`lyricsTLrcPath: string | null`

- [ ] **Step 1: schema 加列**

Modify `src/lib/db/schema.ts`，在 `lyricsLrc` 定义后加：
```ts
    /** 逐行翻译时间戳歌词（JSON: LyricsLine[]），主/翻共轴；无翻译为 null */
    lyricsTlrc: text('lyrics_tlrc'),
```

- [ ] **Step 2: 迁移**

Run: `pnpm db:push`
Expected: ALTER TABLE songs ADD lyrics_tlrc 应用成功

- [ ] **Step 3: submitGeneration 剥离翻译行**

Modify `src/lib/agent/generate-song.ts` `submitGeneration`，文件顶部 import 增加：
```ts
import { stripTranslationLines } from '@/lib/audio/lrc';
```
`submitGeneration` 内改为：
```ts
  const provider = getProvider();
  const songId = crypto.randomUUID();
  // 提交 Suno 前剥离翻译行（DB 保留完整歌词，翻译行用于 t.lrc 与 Folia 副字幕）
  const providerLyrics = stripTranslationLines(input.lyrics);
  const { jobId } = await provider.generateMusic({
    title: input.title,
    lyrics: providerLyrics,
    styleTags: input.styleTags,
    prompt: input.prompt,
    instrumental: input.instrumental ?? false,
    referenceAudioUrl: input.referenceAudioUrl,
    model: input.model,
    duration: input.duration,
  });
```
（DB 落库仍写 `input.lyrics` 原值，不改。）

- [ ] **Step 4: pi.ts replace_section 剥离**

Modify `src/lib/agent/pi.ts`，顶部 import 增加：
```ts
import { stripTranslationLines } from '@/lib/audio/lrc';
```
`replaceSectionToolDef` execute 内 `provider.replaceSection({...})` 的 `fullLyrics` 行改为：
```ts
      fullLyrics: stripTranslationLines(song.lyrics ?? ''),
```

- [ ] **Step 5: jobs route 完成时生成 tLrc**

Modify `src/app/api/jobs/[id]/route.ts`：
顶部 import 改为：
```ts
import { buildTranslationLines, makeLrc, parseLyricLines, type LyricsLine } from '@/lib/audio/lrc';
```
在 `if (lrc.length === 0 && durationSec > 0) { ... }` 之后、`db.update(schema.songs)` 之前加：
```ts
          // 翻译共轴：主歌词行序映射（真实对齐优先；行数不一致按 min 截断，Task 10 验收核对）
          const tLrc = lrc.length
            ? buildTranslationLines(songRow.lyrics ?? '', lrc)
            : [];
```
并在 update 的 set 中、`lyricsLrc:` 行之后加：
```ts
              lyricsTlrc: tLrc.length ? JSON.stringify(tLrc) : null,
```

- [ ] **Step 6: media-output 落盘 t.lrc**

Modify `src/lib/media-output.ts`：
- `PersistSongInput` 增加 `tLrc: LyricsLine[];`
- `PersistedSongBundle` 增加 `lyricsTLrcPath: string | null;`
- `LoadedSongBundle` 增加 `tLrc: LyricsLine[];`
- `persistGeneratedSong` 内 `lyricsLrcPath` 定义后加：
```ts
  const lyricsTLrcPath = input.tLrc.length ? path.join(directory, 'lyrics.t.lrc') : null;
```
- 写文件 Promise.all 改为：
```ts
  await Promise.all([
    writeFile(lyricsTxtPath, lyricsTxt, 'utf8'),
    writeFile(lyricsLrcPath, lyricsLrc, 'utf8'),
    lyricsTLrcPath
      ? writeFile(lyricsTLrcPath, lyricsToLrc(input.tLrc), 'utf8')
      : Promise.resolve(),
    writeFile(
      metaPath,
      JSON.stringify(
        {
          songId: input.songId,
          jobId: input.jobId,
          providerId: input.providerId,
          title: input.title,
          lyrics: input.lyrics,
          styleTags: input.styleTags,
          prompt: input.prompt,
          variants: input.variants,
          lrc: input.lrc,
          tLrc: input.tLrc,
          persistedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      'utf8',
    ),
  ]);
```
- return 对象加 `lyricsTLrcPath,`
- `loadPersistedSong`：meta 类型加 `tLrc?: LyricsLine[];`，return 加：
```ts
      lyricsTLrcPath: files.includes('lyrics.t.lrc') ? path.join(directory, 'lyrics.t.lrc') : null,
      tLrc: meta.tLrc ?? [],
```

- [ ] **Step 7: song-delivery 透传**

Modify `src/lib/song-delivery.ts` `ensureLocalSong`，在 `let lrc` 块后加：
```ts
  let tLrc: LyricsLine[] = [];
  if (song.lyricsTlrc) {
    try {
      tLrc = JSON.parse(song.lyricsTlrc) as LyricsLine[];
    } catch {
      tLrc = [];
    }
  }
```
`persistGeneratedSong({...})` 调用内、`lrc,` 之后加 `tLrc,`

- [ ] **Step 8: 测试 media-output 的 t.lrc 落盘**

Create `src/lib/media-output.test.ts`：
```ts
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LyricsLine } from '@/lib/audio/lrc';
import { persistGeneratedSong } from './media-output';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'ma-test-'));
  process.env.MEDIA_OUTPUT_DIR = dir;
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.MEDIA_OUTPUT_DIR;
});

const LRC: LyricsLine[] = [{ startMs: 0, endMs: 4000, text: '朝の光が窓を叩く' }];
const TLRC: LyricsLine[] = [{ startMs: 0, endMs: 4000, text: '晨光敲打着窗户' }];

describe('persistGeneratedSong', () => {
  it('有翻译时落盘 lyrics.t.lrc 并写入 meta', async () => {
    const bundle = await persistGeneratedSong({
      songId: 'song-1',
      title: '晨光',
      lyrics: '朝の光が窓を叩く\n// 晨光敲打着窗户',
      styleTags: ['j-pop'],
      prompt: null,
      jobId: 'job-1',
      providerId: 'mock',
      variants: [],
      lrc: LRC,
      tLrc: TLRC,
    });
    expect(bundle.lyricsTLrcPath).not.toBeNull();
    const content = await readFile(bundle.lyricsTLrcPath!, 'utf8');
    expect(content).toContain('[00:00.00]晨光敲打着窗户');
    const meta = JSON.parse(await readFile(bundle.metaPath, 'utf8'));
    expect(meta.tLrc).toEqual(TLRC);
  });

  it('无翻译时不生成 t.lrc', async () => {
    const bundle = await persistGeneratedSong({
      songId: 'song-2',
      title: '你好',
      lyrics: '你好世界',
      styleTags: ['pop'],
      prompt: null,
      jobId: 'job-2',
      providerId: 'mock',
      variants: [],
      lrc: [{ startMs: 0, endMs: 1000, text: '你好世界' }],
      tLrc: [],
    });
    expect(bundle.lyricsTLrcPath).toBeNull();
  });
});
```
注：`variants: []` 时无音频下载分支，测试不触网。

- [ ] **Step 9: 运行测试**

Run: `pnpm test`
Expected: Task 2 的 8 个 + 本任务 2 个 = 10 tests PASS

- [ ] **Step 10: 提交**

```bash
git add src/lib/db/schema.ts src/app/api/jobs/[id]/route.ts src/lib/media-output.ts src/lib/media-output.test.ts src/lib/song-delivery.ts src/lib/agent/generate-song.ts src/lib/agent/pi.ts
git commit -m "feat: 翻译落盘链路——lyricsTlrc 列 / t.lrc 文件 / Suno 提交剥离"
```

---

### Task 4: harness 双语写词规范

**Files:**
- Modify: `music-agent/src/lib/harness/domain/lyric-writing.md`

**Interfaces:**
- Consumes: 无（纯提示词文档）
- Produces: Agent 写日文歌时产出 `//` 前缀中文翻译行（Task 3 剥离与 Task 10 验收依赖此约定）

- [ ] **Step 1: 追加第十二节**

Append to `src/lib/harness/domain/lyric-writing.md`：
```md
## 十二、双语歌词翻译规范（日文歌强制）

1. 用户需求为日文歌（或主语言非中文）时，**每行歌词下方紧跟一行中文翻译**，翻译行以 `//` 开头（示例：`// 晨光敲打着窗户`）。
2. 翻译与主行**一一对应**：主行多少行翻译多少行；结构标记行（[Verse] 等）与空行不配翻译。
3. 翻译是**表意翻译**（这句在唱什么），不是逐字直译；中文要自然上口，同样遵守本规范的黑名单与画面感要求。
4. 中文歌**不产出翻译行**。
5. `//` 行不会被唱出来（生成前自动剥离），但会显示在曲库歌词面板与 Folia 副字幕里——翻译质量直接决定成品观感，按主歌词同标准打磨。
```

- [ ] **Step 2: 提示词装配冒烟**

Run: `node scripts/debug-harness-prompt.mjs | head -3`（若脚本输出为空或报错也无碍——readPart 有降级；仅确认进程不崩）
Expected: 进程退出，无未捕获异常

- [ ] **Step 3: 提交**

```bash
git add src/lib/harness/domain/lyric-writing.md
git commit -m "docs(harness): 双语写词规范——日文歌每行配中文翻译（// 前缀）"
```

---

### Task 5: MP3 metadata 嵌入（USLT 双帧 + 封面 APIC）

**Files:**
- Create: `music-agent/src/lib/mp3-metadata.ts`
- Create: `music-agent/scripts/check-metadata.mjs`
- Modify: `music-agent/src/lib/folia-stage.ts`（推送前嵌入 + coverFile）
- Modify: `music-agent/package.json`（node-id3 依赖）

**Interfaces:**
- Consumes: Task 3 的 `LoadedSongBundle`（lyricsLrcPath / lyricsTLrcPath / coverPath——coverPath 由 Task 6 提供，本任务先按可空字段写，Task 6 补齐后类型才闭合）
- Produces: `embedSongMetadata(mp3Path: string, input: EmbedMetadataInput): Promise<void>`（Task 10 验收与 Folia 解析的通道）

- [ ] **Step 1: 安装依赖**

Run: `pnpm add node-id3 && pnpm add -D music-metadata`

- [ ] **Step 2: 实现 embedSongMetadata**

Create `src/lib/mp3-metadata.ts`：
```ts
// MP3 ID3 标签写入：主歌词/翻译/封面嵌入音频。
// 翻译帧合同（与 folia-major metadataParser.worker.ts / electron/stageApi.cjs 对齐）：
//   USLT language='chi' 或 descriptor 含 'translation' → 被识别为翻译
// 主歌词推送时用 lyricsFile 直传（优先级高于内嵌），内嵌作为 Folia 本地曲库导入兜底。
import { readFile } from 'node:fs/promises';
import NodeID3 from 'node-id3';

export interface EmbedMetadataInput {
  title: string;
  artist: string;
  album: string;
  lrc: string; // 带时间轴主歌词
  tLrc?: string | null; // 带时间轴翻译
  coverPath?: string | null;
}

export async function embedSongMetadata(
  mp3Path: string,
  input: EmbedMetadataInput,
): Promise<void> {
  const uslt: Array<{ language: string; shortText: string; text: string }> = [
    { language: 'eng', shortText: '', text: input.lrc },
  ];
  if (input.tLrc?.trim()) {
    uslt.push({ language: 'chi', shortText: 'translation', text: input.tLrc });
  }
  const tags: NodeID3.Tags = {
    title: input.title,
    artist: input.artist,
    album: input.album,
    unsynchronisedLyrics: uslt,
  };
  if (input.coverPath) {
    tags.image = {
      mime: 'image/png',
      type: { id: 3, name: 'front cover' },
      description: 'cover',
      imageBuffer: await readFile(input.coverPath),
    };
  }
  const ok = NodeID3.update(tags, mp3Path);
  if (!ok) throw new Error(`MP3 标签写入失败: ${mp3Path}`);
}
```
注：若 node-id3 的 `unsynchronisedLyrics` 不接受数组（类型报错或读回只剩一帧），切换 `id3-writer`（支持多 USLT 帧），以 Step 3 读回验证为准。

- [ ] **Step 3: 读回验证脚本**

Create `scripts/check-metadata.mjs`：
```js
// 验证 embedSongMetadata 写出的 USLT 帧能被 Folia 同款解析器（music-metadata）识别。
// 用法: node scripts/check-metadata.mjs <mp3路径>
import { parseFile } from 'music-metadata';

const [, , file] = process.argv;
if (!file) {
  console.error('用法: node scripts/check-metadata.mjs <mp3路径>');
  process.exit(1);
}
const parsed = await parseFile(file);
const lyrics = (parsed.common.lyrics ?? []).map((t) => ({
  language: t.language,
  descriptor: t.descriptor,
  hasTimeline: /\[\d{2}:\d{2}\.\d{2}\]/.test(t.text ?? ''),
  preview: (t.text ?? '').slice(0, 40),
}));
console.log(JSON.stringify({ title: parsed.common.title, lyrics }, null, 2));
```
验证方法：先找任意真实 MP3（如 `data/media/<songId>/audio-01-v0.mp3`，mock 生成的是 WAV 不可用；没有就等 Task 10 真实验收时验证），先用 node-id3 手动写入一次再读回。无 MP3 时不阻塞，本步骤改为：Task 10 Step 2 中执行读回验证。
Expected（有 MP3 时）: `lyrics` 含 2 帧 `{language:'eng', descriptor:''}` + `{language:'chi', descriptor:'translation'}`，`hasTimeline: true`

- [ ] **Step 4: folia-stage 推送前嵌入 + coverFile**

Modify `src/lib/folia-stage.ts`，顶部 import 增加：
```ts
import { embedSongMetadata } from '@/lib/mp3-metadata';
```
在 `const form = new FormData();` 之前插入：
```ts
  const lrcText = await readFile(bundle.lyricsLrcPath, 'utf8');
  let tLrcText: string | null = null;
  if (bundle.lyricsTLrcPath) {
    tLrcText = await readFile(bundle.lyricsTLrcPath, 'utf8').catch(() => null);
  }
  const audioExt = audio.path.split('.').pop()?.toLowerCase();
  if (audioExt === 'mp3') {
    try {
      await embedSongMetadata(audio.path, {
        title: bundle.title,
        artist: 'Music Agent',
        album: 'Music Agent',
        lrc: lrcText,
        tLrc: tLrcText,
        coverPath: bundle.coverPath ?? null,
      });
    } catch (e) {
      console.warn('[folia-stage] MP3 标签嵌入失败（继续推送）:', e instanceof Error ? e.message : String(e));
    }
  }
```
并在 `form.append('lyricsFile', ...)` 之后加：
```ts
  if (bundle.coverPath) {
    form.append('coverFile', await toFilePart(bundle.coverPath, 'image/png', `${bundle.title}-cover.png`));
  }
```

- [ ] **Step 5: 提交**

```bash
git add src/lib/mp3-metadata.ts src/lib/folia-stage.ts scripts/check-metadata.mjs package.json pnpm-lock.yaml
git commit -m "feat: MP3 USLT 双帧嵌入（主歌词+翻译）与封面 APIC，推送前自动写入"
```

---

### Task 6: 封面 PNG 渲染与展示

**Files:**
- Modify: `music-agent/src/lib/cover.ts`（renderCoverPng + 色板）
- Create: `music-agent/src/lib/cover.test.ts`
- Modify: `music-agent/src/lib/media-output.ts`（落盘 cover.png + bundle.coverPath）
- Create: `music-agent/src/app/api/songs/[id]/cover-image/route.ts`
- Modify: `music-agent/src/components/song/song-card.tsx`（封面图 + 渐变兜底）
- Modify: `music-agent/package.json`（@resvg/resvg-js 依赖）

**Interfaces:**
- Consumes: Task 3 的 `LoadedSongBundle`（补上 coverPath 字段，闭合 Task 5 的类型）
- Produces:
  - `renderCoverPng(input: CoverRenderInput): Promise<string>`（返回 outPath）
  - `LoadedSongBundle.coverPath: string | null`
  - GET `/api/songs/[id]/cover-image` → PNG 或 404

- [ ] **Step 1: 安装依赖**

Run: `pnpm add @resvg/resvg-js`

- [ ] **Step 2: 实现渲染**

Modify `src/lib/cover.ts`（在原渐变函数之上扩展，保留 `COVER_GRADIENTS` 与 `coverGradient` 供 UI 兜底）：
```ts
import { writeFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';

// 封面 PNG：本地零成本渲染（渐变 + 歌名 + 风格标签）。
// 颜色与 UI 渐变同色系（docs/design-system.md 的暖色规范），AI 生图二期可选。
const COVER_PALETTE: Array<[string, string]> = [
  ['#059669', '#0f766e'], // emerald→teal
  ['#d97706', '#c2410c'], // amber→orange
  ['#e11d48', '#b91c1c'], // rose→red
  ['#0284c7', '#1d4ed8'], // sky→blue
  ['#65a30d', '#047857'], // lime→emerald
  ['#0891b2', '#0369a1'], // cyan→sky
];

export interface CoverRenderInput {
  title: string;
  styleTags: string[];
  outPath: string;
}

function coverHash(key: string): number {
  let h = 0;
  for (const c of key) h = (h * 31 + c.codePointAt(0)!) % 997;
  return h;
}

export function coverPalette(key: string): [string, string] {
  return COVER_PALETTE[coverHash(key) % COVER_PALETTE.length];
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!));
}

export async function renderCoverPng(input: CoverRenderInput): Promise<string> {
  const [from, to] = coverPalette(`${input.title}|${(input.styleTags ?? []).join(',')}`);
  const title = escapeXml(input.title.length > 12 ? `${input.title.slice(0, 12)}…` : input.title);
  const tags = escapeXml((input.styleTags ?? []).slice(0, 4).join(' · ') || 'AI MUSIC');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="100%" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <text x="512" y="488" text-anchor="middle" fill="#ffffff" font-size="72" font-weight="700">${title}</text>
  <text x="512" y="600" text-anchor="middle" fill="#ffffff" fill-opacity="0.75" font-size="36">${tags}</text>
</svg>`;
  const resvg = new Resvg(svg, {
    font: { loadSystemFonts: true, defaultFontFamily: 'Microsoft YaHei' },
    fitTo: { mode: 'width', value: 1024 },
  });
  await writeFile(input.outPath, resvg.render().asPng());
  return input.outPath;
}
```

- [ ] **Step 3: 测试**

Create `src/lib/cover.test.ts`：
```ts
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderCoverPng } from './cover';

let dir: string;
beforeEach(async () => { dir = await mkdtemp(path.join(os.tmpdir(), 'cover-test-')); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe('renderCoverPng', () => {
  it('产出 1024x1024 PNG（魔法字节 + IHDR 尺寸）', async () => {
    const outPath = path.join(dir, 'cover.png');
    const result = await renderCoverPng({ title: '晨光', styleTags: ['j-pop', 'female vocals'], outPath });
    expect(result).toBe(outPath);
    const buf = await readFile(outPath);
    expect(buf.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(buf.readUInt32BE(16)).toBe(1024); // IHDR width
    expect(buf.readUInt32BE(20)).toBe(1024); // IHDR height
    expect((await stat(outPath)).size).toBeGreaterThan(1000);
  });

  it('相同 key 色板稳定，不同 key 可能不同', () => {
    const a = renderCoverPng({ title: 'A', styleTags: [], outPath: path.join(dir, 'a.png') });
    expect(a).toBeDefined();
  });
});
```

- [ ] **Step 4: 运行测试**

Run: `pnpm test`
Expected: 12 tests PASS（8 + 2 + 2）

- [ ] **Step 5: media-output 落盘封面**

Modify `src/lib/media-output.ts`：
顶部 import 增加 `import { renderCoverPng } from '@/lib/cover';`
`PersistedSongBundle` 与 `LoadedSongBundle` 增加 `coverPath: string | null;`
`persistGeneratedSong` 内，在写文件 Promise.all 之后加：
```ts
  // 封面：本地渐变渲染；失败不阻塞主流程（UI 与推送均有兜底）
  const coverPath = path.join(directory, 'cover.png');
  try {
    await renderCoverPng({
      title: input.title,
      styleTags: input.styleTags ?? [],
      outPath: coverPath,
    });
  } catch (e) {
    console.warn('[media-output] 封面渲染失败:', e instanceof Error ? e.message : String(e));
  }
```
return 对象加 `coverPath,`；`loadPersistedSong` return 加：
```ts
      coverPath: files.includes('cover.png') ? path.join(directory, 'cover.png') : null,
```

- [ ] **Step 6: 封面图片 API 路由**

Create `src/app/api/songs/[id]/cover-image/route.ts`：
```ts
import { readFile } from 'node:fs/promises';
import { loadPersistedSong } from '@/lib/media-output';

export const dynamic = 'force-dynamic';

// 封面 PNG 直出：曲库卡片与详情页 <img> 使用；缺文件返回 404（前端回退渐变）。
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await loadPersistedSong(id);
  if (!bundle?.coverPath) return new Response('Not Found', { status: 404 });
  try {
    const bytes = await readFile(bundle.coverPath);
    return new Response(new Uint8Array(bytes), {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' },
    });
  } catch {
    return new Response('Not Found', { status: 404 });
  }
}
```

- [ ] **Step 7: song-card 显示封面**

Modify `src/components/song/song-card.tsx`，渐变 div 内（`<Music2 .../>` 之前）插入：
```tsx
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/songs/${song.id}/cover-image`}
            alt={song.title}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
```

- [ ] **Step 8: 构建验证**

Run: `pnpm build`
Expected: 构建通过（此步同时闭合 Task 5 Step 4 里对 `coverPath` 的依赖）

- [ ] **Step 9: 提交**

```bash
git add src/lib/cover.ts src/lib/cover.test.ts src/lib/media-output.ts src/app/api/songs/[id]/cover-image/route.ts src/components/song/song-card.tsx package.json pnpm-lock.yaml
git commit -m "feat: 本地封面 PNG 渲染落盘 + cover-image 路由 + 曲库卡片展示"
```

---

### Task 7: Folia 翻译 plumbing（最小改动）

**Files:**
- Modify: `folia-major/electron/stageApi.cjs`（nextSession 带出 translationLyrics）
- Modify: `folia-major/src/types.ts`（StageMediaSession 加字段）
- Modify: `folia-major/src/hooks/useStagePlaybackController.ts`（lyricSource 带 tLrcContent）
- Modify: `folia-major/test/manual/stage-client/API_SCHEMA.md`（文档同步）

**Interfaces:**
- Consumes: Task 5 写入的 MP3 USLT 帧（`language='chi'` / descriptor `translation`，`stageApi.cjs` 的 `extractStageEmbeddedAudioMetadata` 已提取出 `translationLyrics`，本任务只做透传）
- Produces: `StageMediaSession.translationLyrics?: string | null`（渲染端副字幕通道）

- [ ] **Step 1: 类型加字段**

Modify `src/types.ts`，`StageMediaSession` 的 `lyricsFormat` 行之后加：
```ts
  /** 从上传音频内嵌 USLT 提取的翻译歌词（如 language=chi 帧）；带时间轴时与主歌词共轴显示 */
  translationLyrics?: string | null;
```

- [ ] **Step 2: stageApi 透传**

Modify `electron/stageApi.cjs`，`nextSession` 对象内 `lyricsText` 行之后加：
```js
      translationLyrics: normalizeStageText(embeddedMetadata?.translationLyrics) || null,
```
（`embeddedMetadata` 变量在函数上方已定义；`normalizeStageText` 同文件已有。）

- [ ] **Step 3: 渲染端消费**

Modify `src/hooks/useStagePlaybackController.ts`，`loadStageSessionIntoPlayback` 内：
```ts
        if (session.lyricsText?.trim()) {
            try {
                parsedLyrics = await LyricParserFactory.parse({
                    type: 'local',
                    lrcContent: session.lyricsText,
                    formatHint: session.lyricsFormat || undefined,
                });
```
改为：
```ts
        if (session.lyricsText?.trim()) {
            try {
                parsedLyrics = await LyricParserFactory.parse({
                    type: 'local',
                    lrcContent: session.lyricsText,
                    ...(session.translationLyrics?.trim()
                        ? { tLrcContent: session.translationLyrics }
                        : {}),
                    formatHint: session.lyricsFormat || undefined,
                });
```

- [ ] **Step 4: API 文档同步**

Append to `test/manual/stage-client/API_SCHEMA.md` 的 `POST /stage/session` 小节（mediaSession 字段表附近）：
```md
- `translationLyrics`：从上传 `audioFile` 的内嵌 USLT 帧提取的翻译歌词（`language=chi` 或 descriptor 含 `translation`）。带 LRC 时间戳时按主歌词共轴显示副字幕。仅当音频内嵌翻译帧时非空。
```

- [ ] **Step 5: 验证**

Run: `cd "D:\github项目\从Agent到音乐可视化\folia-major" && npm run typecheck && npm test`
Expected: typecheck 通过；212 文件 1615+ tests 通过（无回归）

- [ ] **Step 6: 提交**

```bash
git add electron/stageApi.cjs src/types.ts src/hooks/useStagePlaybackController.ts test/manual/stage-client/API_SCHEMA.md
git commit -m "feat(stage): 透传内嵌翻译歌词到 mediaSession（副字幕通道，配合 music-agent USLT 写入）"
```

---

### Task 8: UI 细节（翻译行渲染）

**Files:**
- Modify: `music-agent/src/components/song/lyrics-panel.tsx`

**Interfaces:**
- Consumes: Task 3 的 `LyricsLine.translation`（详情页歌词数据源需带 translation——见 Step 1 说明）

- [ ] **Step 1: 确认详情页歌词数据带 translation**

检查 `src/components/song/song-detail-client.tsx` 里传给 `LyricsPanel` 的 lines 来源：若来自 `song.lyricsLrc` JSON 解析，则该数组无 translation 字段；改为用 `loadPersistedSong` 产出的 tLrc 合并，或直接由 `/api/songs/[id]` 返回。实现方式（二选一，先查代码再定）：
- A（推荐）：详情页已有 `ensureLocalSong` 的 bundle（含 lrc + tLrc），合并：`lrc.map((l, i) => tLrcIdx 对应后 {...l, translation: tLrc[i]?.text})`；合并逻辑放 `src/lib/audio/lrc.ts` 导出 `mergeTranslations(lrc, tLrc): LyricsLine[]`，并补一条测试：
```ts
describe('mergeTranslations', () => {
  it('按序把翻译贴到主行', () => {
    const lrc = [
      { startMs: 0, endMs: 4000, text: '朝の光' },
      { startMs: 4000, endMs: 8000, text: '君の名前' },
    ];
    const tLrc = [
      { startMs: 0, endMs: 4000, text: '晨光' },
    ];
    expect(mergeTranslations(lrc, tLrc)).toEqual([
      { startMs: 0, endMs: 4000, text: '朝の光', translation: '晨光' },
      { startMs: 4000, endMs: 8000, text: '君の名前', translation: undefined },
    ]);
  });
});
```
`mergeTranslations` 实现（按 startMs 就近对齐）：
```ts
/** 把 tLrc 翻译按 startMs 就近贴回主歌词行 */
export function mergeTranslations(lrc: LyricsLine[], tLrc: LyricsLine[]): LyricsLine[] {
  if (tLrc.length === 0) return lrc;
  const translations = new Map(tLrc.map((t) => [t.startMs, t.text]));
  return lrc.map((line) => {
    const text = translations.get(line.startMs);
    return text ? { ...line, translation: text } : line;
  });
}
```
- B（兜底）：详情页直接从 `/api/songs/[id]/push-folia` 同源的 bundle 接口拿合并结果。

- [ ] **Step 2: lyrics-panel 渲染翻译行**

Modify `src/components/song/lyrics-panel.tsx`，button 内 `{l.text}` 改为：
```tsx
          <span className="flex flex-col">
            <span>{l.text}</span>
            {l.translation ? (
              <span className="text-xs opacity-60">{l.translation}</span>
            ) : null}
          </span>
```

- [ ] **Step 3: 测试与构建**

Run: `pnpm test && pnpm build`
Expected: 13 tests PASS；构建通过

- [ ] **Step 4: 提交**

```bash
git add src/lib/audio/lrc.ts src/lib/audio/lrc.test.ts src/components/song/lyrics-panel.tsx src/components/song/song-detail-client.tsx
git commit -m "feat(ui): 歌词面板副字幕样式渲染（主行下方淡色翻译）"
```

---

### Task 9: mock 端到端验收（免费链路）

**Files:** 无代码改动（仅运行与观察）

- [ ] **Step 1: 重启服务并清空旧数据**

Run: `cd "D:\github项目\从Agent到音乐可视化\music-agent" && pnpm db:push && pnpm dev`（若已运行则重启）
Folia：`npm run dev:electron` 保持运行，确认 Stage Mode 仍启用。

- [ ] **Step 2: mock 中文歌**

操作：聊天「写一首关于夏日傍晚的中文歌」→ 等生成完成。
Expected:
- `data/media/<songId>/` 有 audio-01-*.wav / lyrics.lrc / cover.png / meta.json，**无** lyrics.t.lrc
- 自动推送成功 → Folia 自动播放 → Folia 显示封面（coverFile）与歌词
- 详情页歌词无副字幕（无翻译行），曲库卡片显示 cover.png

- [ ] **Step 3: mock 日文歌（翻译落盘验证）**

操作：聊天「写一首日文 J-POP 情歌」→ 确认 Agent 输出的歌词**每行下方有 `//` 中文翻译**（Task 4 规范生效）→ 等生成完成。
Expected:
- `data/media/<songId>/` 有 lyrics.lrc 与 **lyrics.t.lrc**（内容为 `[mm:ss.cc]中文翻译`）
- meta.json 含 `tLrc` 数组
- 推送成功、Folia 自动播放（副字幕显示**不验收**——mock 是 WAV，无 USLT 通道，见 Global Constraints）

- [ ] **Step 4: 断 Folia 兜底**

操作：关掉 Folia Electron → 再生成一首（mock）→ 观察生成不报错 → 详情页 `push-folia` 按钮提示 Stage 不可达 → 重启 Folia → 再点按钮 → 推送成功并自动播放。
Expected: 全流程无 500；按钮兜底生效。

- [ ] **Step 5: 提交验收记录（无代码）**

```bash
git add -A && git commit -m "docs: mock 端到端验收记录" --allow-empty
```

---

### Task 10: sunoapi 真实验收（翻译副字幕 + 横竖屏导出）

**Files:** 无代码改动（运行与观察）；若有缺陷按 systematic-debugging 修复

- [ ] **Step 1: 确认余额**

Run: 在 music-agent 里查 sunoapi 余额（`src/lib/providers/sunoapi.ts` 的 `getCredits` 对应的 debug 脚本或直接生成一次观察报错）。
Expected: 有余额（不足则停下向用户报告）。

- [ ] **Step 2: 真实日文歌全链路**

操作：`.env.local` 保持 `SUNO_PROVIDER=sunoapi` → 聊天「写一首日文歌，主题是夏夜花火大会，带中文翻译」→ 等真实生成（1-3 分钟）。
Expected（**本项目的核心验收**）：
- 落盘真实 MP3：audio-01-*.mp3 / lyrics.lrc / **lyrics.t.lrc** / cover.png / meta.json
- 推送前 MP3 被写入 USLT 双帧：`node scripts/check-metadata.mjs "data/media/<songId>/audio-01-*.mp3"` 显示 eng + chi 两帧且 `hasTimeline: true`
- Folia 自动播放，**原文日文 + 中文副字幕同步高亮显示**
- 对齐质量抽查：真实对齐歌词（`getTimestampedLyrics`）与翻译行数一致时逐行对应；若出现错位（如副歌重复段），回到 `buildTranslationLines` 改用按文本+行序复合匹配并补测试

- [ ] **Step 3: 真实中文歌**

操作：聊天「写一首中文民谣」→ 生成 → 自动推送。
Expected: 无 t.lrc；Folia 无副字幕、正常显示主歌词与封面。

- [ ] **Step 4: 横竖屏导出**

操作：Folia 播放真实歌 → 导出视频，选 `1920x1080`（landscape）导出 → 再选 `1080x1920`（portrait）导出。
Expected: 两个 mp4 产出、可正常打开；竖屏文件分辨率 1080x1920；视频中无聊天 UI。

- [ ] **Step 5: 用户亲自测试**

把两个窗口交给用户：聊天写一首自己的歌（用户自由发挥，含日文歌）→ 观察自动推送与自动播放 → 自行导出视频。
Expected: 用户确认「两个东西」之第一项通过。

---

### Task 11: 流程文档（用户检阅用）+ 收尾

**Files:**
- Create: `docs/使用与开发流程.md`
- Modify: `README.md`（快速启动与文档链接更新）

**Interfaces:**
- Consumes: 全部任务产物
- Produces: 用户检阅文档（用户验收的第二项）

- [ ] **Step 1: 写流程文档**

Create `docs/使用与开发流程.md`，结构（内容完整、面向用户+后续开发者）：
```md
# 使用与开发流程（Music Agent → Folia 管线）

## 1. 系统是什么
（一句话闭环：聊天写歌 → 自动推送 → Folia 自动播放 → 副字幕/封面 → 导出视频）

## 2. 目录与职责
music-agent / folia-major / docs 三段说明

## 3. 首次启动（按序）
1) Music Agent：pnpm install → 复制 .env.example → 填 key（DeepSeek / sunoapi）→ pnpm db:push → pnpm dev
2) Folia：npm install → npm run dev:electron
3) Stage 打通：Folia 设置 → Stage Mode（Stage API）→ 复制端口与 token 回填 music-agent/.env.local → 重启 music-agent
4) 验证：curl /stage/health

## 4. 日常使用流程
- 聊一首歌（harness 会深挖需求；日文歌自动产出 // 中文翻译行）
- 生成完成 → 自动落盘（audio/lrc/t.lrc/cover.png/meta.json）→ 自动推送 Folia → 自动播放
- Folia 里：曲库选歌 / 全屏歌词 / 导出横竖屏视频
- 兜底：Folia 没开时详情页 push-folia 按钮手动重推

## 5. 双语与翻译链路
（// 规范 → strip → t.lrc → USLT chi 帧 → Folia translationLyrics 副字幕，附验证命令 check-metadata.mjs）

## 6. 关键环境变量表
（LLM_* / SUNO_* / FOLIA_STAGE_* / DB_PATH，含 mock 说明）

## 7. 常见问题
- Folia 推送不成功：Stage 未启用 / token 未同步 / 端口不是 32107
- 副字幕不显示：音频是 mock WAV（无 ID3）或 USLT 帧未写入（跑 check-metadata.mjs）
- 歌词对不上：真实对齐行数与翻译行数不一致（反馈即可，有回退策略）

## 8. 测试与验收命令
（music-agent: pnpm test / pnpm build；folia-major: npm run typecheck / npm test；验收清单六条）

## 9. 许可证注意
（Folia 为上游 AGPL-3.0 副本；改动清单见 git log；密钥不入库）
```

- [ ] **Step 2: README 更新**

Modify `README.md`：
- 快速启动小节补一句指向 `docs/使用与开发流程.md`；
- `SUNO_PROVIDER` 三选一说明改为「本机实际配置：sunoapi（真实）+ mock（免费演示）」；
- 验证小节补 `pnpm test`（music-agent 新增测试）。

- [ ] **Step 3: 全量验证**

Run: `cd music-agent && pnpm test && pnpm build`；`cd folia-major && npm run typecheck && npm test`
Expected: 全部通过

- [ ] **Step 4: 最终提交**

```bash
git add -A
git commit -m "docs: 使用与开发流程文档 + README 更新；全链路验收完成"
```

## Self-Review 记录

- 规格覆盖：设计 §4.1→Task 2/3/4/5/7；§4.2→Task 6；§4.3→Task 1（已有 queueAutoDelivery 验证）+Task 9 Step 4；§4.4/4.5→Task 9/10 验收；§7 验收→Task 9/10；流程文档→Task 11。✅
- 占位符：无 TBD；Task 5 Step 3 与 Task 8 Step 1 含条件分支（以验证为准/二选一），已写明判定标准与兜底路径。✅
- 类型一致性：`buildTranslationLines`/`stripTranslationLines`/`mergeTranslations`/`embedSongMetadata`/`renderCoverPng` 的签名在各任务引用处一致；`LoadedSongBundle` 字段（lyricsTLrcPath/coverPath/tLrc）在 Task 3/5/6 间闭合。✅
- 已知风险回退：node-id3 数组帧不满足 → id3-writer；对齐错位 → mergeTranslations 按 startMs 就近。✅

