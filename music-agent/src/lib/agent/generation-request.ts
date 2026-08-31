import { detectLyricLanguage } from '@/lib/audio/lyric-language';
import { hasCompleteTranslationPairs } from '@/lib/audio/lrc';

export type GenerationRequestDimension = 'style' | 'mood' | 'structure';

export interface GenerationRequestInput {
  lyrics: string;
  styleTags: string[];
  prompt?: string;
  instrumental?: boolean;
}

const DIMENSION_LABELS: Record<GenerationRequestDimension, string> = {
  style: '风格',
  mood: '情绪',
  structure: '结构',
};

const STYLE_KEYWORDS = [
  'pop', 'rock', 'hip hop', 'hip-hop', 'r&b', 'folk', 'country', 'jazz',
  'blues', 'soul', 'funk', 'gospel', 'punk', 'metal', 'indie', 'ballad',
  'electronic', 'edm', 'house', 'techno', 'trance', 'lo-fi', 'lofi',
  'dream pop', 'synthwave', 'ambient', 'classical', 'acoustic', 'trap',
  'city pop', 'j-pop', 'k-pop', '流行', '摇滚', '民谣', '说唱', '嘻哈',
  '电子', '爵士', '蓝调', '古风', '国风',
];

const MOOD_KEYWORDS = [
  'upbeat', 'dreamy', 'melancholic', 'energetic', 'calm', 'romantic',
  'nostalgic', 'epic', 'dark', 'playful', 'bittersweet', 'euphoric',
  'chill', 'aggressive', 'tender', 'happy', 'sad', 'hopeful', 'lonely',
  'warm', '欢快', '悲伤', '忧郁', '梦幻', '安静', '浪漫', '怀旧', '黑暗',
  '治愈', '孤独', '温暖', '热烈',
];

const SECTION_PATTERN =
  /\[(intro|verse(?:\s+\d+)?|pre-chorus|chorus(?:\s+\d+)?|hook|bridge|outro|build(?:[- ]?up)?|drop|break)\]/gi;

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function containsKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(normalizeText(keyword)));
}

function findSectionKinds(lyrics: string): Set<string> {
  const sections = new Set<string>();
  for (const match of lyrics.matchAll(SECTION_PATTERN)) {
    const section = normalizeText(match[1] ?? '');
    if (section === 'pre-chorus') sections.add('pre-chorus');
    else if (section === 'build-up' || section === 'build up' || section === 'buildup') sections.add('build-up');
    else if (section === 'verse' || section.startsWith('verse ')) sections.add('verse');
    else if (section === 'chorus' || section.startsWith('chorus ')) sections.add('chorus');
    else sections.add(section);
  }
  return sections;
}

export function findMissingGenerationDimensions(
  input: GenerationRequestInput,
): GenerationRequestDimension[] {
  const description = [...input.styleTags, input.prompt ?? '']
    .map(normalizeText)
    .join('\n');
  const missing: GenerationRequestDimension[] = [];

  if (!containsKeyword(description, STYLE_KEYWORDS)) missing.push('style');
  if (!containsKeyword(description, MOOD_KEYWORDS)) missing.push('mood');

  const sections = findSectionKinds(input.lyrics);
  const hasStructure = input.instrumental
    ? sections.size >= 3
    : sections.has('verse') && (sections.has('chorus') || sections.has('hook'));
  if (!hasStructure) missing.push('structure');

  return missing;
}

export function assertGenerationRequestComplete(input: GenerationRequestInput): void {
  const missing = findMissingGenerationDimensions(input);
  if (missing.length === 0) return;

  const labels = missing.map((dimension) => DIMENSION_LABELS[dimension]).join('、');
  throw new Error(
    `创作需求不完整：缺${labels}。请先给用户 2-3 个方向选项并等待确认，不要直接调用 generate_music。`,
  );
}

export function assertJapaneseTranslationComplete(lyrics: string): void {
  if (detectLyricLanguage(lyrics) !== 'japanese') return;
  if (hasCompleteTranslationPairs(lyrics)) return;

  throw new Error(
    '日文歌词缺少逐行中文翻译。请为每一行日文歌词补充「// 中文翻译」，确认后再调用 generate_music。',
  );
}
