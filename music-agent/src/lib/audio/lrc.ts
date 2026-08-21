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

const STRUCTURAL_MARKER = /\[(?!\d{1,2}:\d{2}(?:[.:]\d{1,3})?\])([^\]\n]+)\]/g;

function normalizeLyrics(lyrics: string): string {
  return lyrics
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(STRUCTURAL_MARKER, '\n$&\n');
}

/** 从带结构标记的歌词文本中提取歌词行（跳过 [Verse] 这类纯标记行与翻译行） */
export function parseLyricLines(lyrics: string): string[] {
  return normalizeLyrics(lyrics)
    .split('\n')
    .map((l) => l.trim())
    .filter(
      (l) =>
        l.length > 0 &&
        !/^\[.*\]\s*$/.test(l) &&
        !l.startsWith(TRANSLATION_PREFIX),
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
  for (const raw of normalizeLyrics(lyrics).split('\n')) {
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

/**
 * 上游对齐数据共轴到主歌词：上游 get-timestamped-lyrics 返回的是 ASR 级行
 * （文本与用户写的词有差异、混入 [Verse] 等结构标记行，甚至标记与歌词同行），
 * 直接展示会「歌词对不上」。行数接近时（差异 ≤ 20% 且至少差 1 行），
 * 保留上游真实时间戳，文本换回用户写的主歌词行。
 */
export function coaxAlignedLyrics(mainLyrics: string, aligned: LyricsLine[]): LyricsLine[] {
  // 剥掉行内标记前缀（"[Verse 1]\n浴衣の袖を…" → "浴衣の袖を…"），再过滤纯标记行
  const cleaned = aligned
    .map((l) => ({ ...l, text: l.text.replace(/^\[[^\]]+\]\s*/m, '').trim() }))
    .filter((l) => l.text.length > 0 && !/^\s*\[.*\]\s*$/.test(l.text));
  if (cleaned.length === 0) return aligned;
  const mainLines = parseLyricLines(mainLyrics);
  if (mainLines.length === 0) return cleaned;
  const tolerance = Math.max(1, Math.ceil(mainLines.length * 0.2));
  if (Math.abs(cleaned.length - mainLines.length) > tolerance) return cleaned;
  return cleaned.map((a, i) => ({
    startMs: a.startMs,
    endMs: a.endMs,
    text: mainLines[i] ?? a.text,
  }));
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

/** 把 tLrc 翻译按 startMs 就近贴回主歌词行 */
export function mergeTranslations(lrc: LyricsLine[], tLrc: LyricsLine[]): LyricsLine[] {
  if (tLrc.length === 0) return lrc;
  const translations = new Map(tLrc.map((t) => [t.startMs, t.text]));
  return lrc.map((line) => ({ ...line, translation: translations.get(line.startMs) }));
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
