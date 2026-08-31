// 逐行时间戳歌词（LRC 语义），播放器用它做高亮同步。
// 真实 Suno 后端可返回词级时间戳（aligned lyrics），有效时优先于 Mock 分配。

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
const STRUCTURAL_MARKER_LINE = /^\[(?!\d{1,2}:\d{2}(?:[.:]\d{1,3})?\])([^\]\n]+)\]\s*$/;

const SECTION_WEIGHTS = {
  intro: 0.6,
  verse: 1,
  'pre-chorus': 1.1,
  chorus: 1.4,
  hook: 1.2,
  bridge: 1,
  outro: 0.6,
  unknown: 1,
} as const;

type LyricsSection = keyof typeof SECTION_WEIGHTS;

function normalizeLyrics(lyrics: string): string {
  return lyrics
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(STRUCTURAL_MARKER, '\n$&\n');
}

interface SectionedLyricLine {
  text: string;
  section: LyricsSection;
}

interface ParsedSectionedLyrics {
  lines: SectionedLyricLine[];
  hasStructureMarkers: boolean;
}

function parseSection(marker: string): LyricsSection {
  const normalized = marker.toLowerCase().replace(/[^a-z]/g, '');
  if (normalized.startsWith('intro')) return 'intro';
  if (normalized.startsWith('prechorus')) return 'pre-chorus';
  if (normalized.startsWith('chorus')) return 'chorus';
  if (normalized.startsWith('hook')) return 'hook';
  if (normalized.startsWith('verse')) return 'verse';
  if (normalized.startsWith('bridge')) return 'bridge';
  if (normalized.startsWith('outro')) return 'outro';
  return 'unknown';
}

function parseLyricsBySection(lyrics: string): ParsedSectionedLyrics {
  let section: LyricsSection = 'unknown';
  let hasStructureMarkers = false;
  const lines: SectionedLyricLine[] = [];

  for (const raw of normalizeLyrics(lyrics).split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    const marker = line.match(STRUCTURAL_MARKER_LINE)?.[1];
    if (marker !== undefined) {
      section = parseSection(marker);
      hasStructureMarkers = true;
      continue;
    }
    if (line.startsWith(TRANSLATION_PREFIX)) continue;
    lines.push({ text: line, section });
  }

  return { lines, hasStructureMarkers };
}

/** 从带结构标记的歌词文本中提取歌词行（跳过 [Verse] 这类纯标记行与翻译行） */
export function parseLyricLines(lyrics: string): string[] {
  return parseLyricsBySection(lyrics).lines.map((line) => line.text);
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

export function hasCompleteTranslationPairs(lyrics: string): boolean {
  const pairs = parseLyricPairs(lyrics);
  return pairs.length > 0 && pairs.every((pair) => Boolean(pair.translation?.trim()));
}

export function areTranslationTimestampsAligned(
  lrc: LyricsLine[],
  tLrc: LyricsLine[],
): boolean {
  if (tLrc.length === 0) return true;
  return (
    lrc.length === tLrc.length &&
    lrc.every((line, index) => line.startMs === tLrc[index].startMs && line.endMs === tLrc[index].endMs)
  );
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

/** 有结构标记时按段落权重分配；相邻边界取整后共用同一毫秒值。 */
export function makeStructureAwareLrc(
  lines: SectionedLyricLine[],
  durationSec: number,
): LyricsLine[] {
  if (lines.length === 0) return [];
  const totalMs = durationSec * 1000;
  const weights = lines.map((line) => SECTION_WEIGHTS[line.section]);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const cumulativeWeights = [0];
  weights.forEach((weight, index) => {
    cumulativeWeights.push(cumulativeWeights[index] + weight);
  });

  return lines.map((text, index) => ({
    startMs: Math.round((cumulativeWeights[index] / totalWeight) * totalMs),
    endMs: Math.round((cumulativeWeights[index + 1] / totalWeight) * totalMs),
    text: text.text,
  }));
}

/** 真实时间轴只有文本和时间都可信时，才允许覆盖 Mock fallback。 */
export function isValidTimestampedLyrics(
  lines: LyricsLine[],
  durationSec: number,
): boolean {
  if (lines.length === 0) return false;
  if (!Number.isFinite(durationSec) || durationSec <= 0) return false;

  const durationMs = durationSec * 1000;
  let previousStart = -Infinity;
  let previousEnd = -Infinity;

  return lines.every((line) => {
    const text = line.text.replace(/^\[[^\]]+\]\s*/m, '').trim();
    if (text.length === 0 || /^\s*\[.*\]\s*$/.test(text)) return false;
    if (!Number.isFinite(line.startMs) || !Number.isFinite(line.endMs)) return false;
    if (line.startMs < 0 || line.endMs < line.startMs) return false;
    if (line.startMs > durationMs || line.endMs > durationMs) return false;
    if (line.startMs < previousStart || line.startMs < previousEnd) return false;

    previousStart = line.startMs;
    previousEnd = line.endMs;
    return true;
  });
}

export interface LyricsTimelineInput {
  lyrics: string;
  durationSec: number;
  alignedLyrics?: LyricsLine[] | null;
}

export function resolveLyricsTimeline({
  lyrics,
  durationSec,
  alignedLyrics,
}: LyricsTimelineInput): LyricsLine[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return [];

  if (alignedLyrics && alignedLyrics.length > 0) {
    const coaxed = coaxAlignedLyrics(lyrics, alignedLyrics);
    if (isValidTimestampedLyrics(coaxed, durationSec)) return coaxed;
  }

  const parsed = parseLyricsBySection(lyrics);
  if (!parsed.hasStructureMarkers) {
    return makeLrc(parsed.lines.map((line) => line.text), durationSec);
  }
  return makeStructureAwareLrc(parsed.lines, durationSec);
}
