// 歌词语言检测：把「用日语演唱」从模型自觉变成代码级保证。
// 根因（2026-08-22 用户实测）：模型写的日语歌词带着「日系曲风」标签提交，
// 但 Suno custom 模式的 prompt 不参与生成（只有歌词 + style 标签），
// 没有任何语言指令 → 唱出来是中文。修复：检测歌词语言并把语言标签强制注入 styleTags。
import { stripTranslationLines } from './lrc';

export type LyricLanguage = 'japanese' | 'chinese' | 'other';

export function detectLyricLanguage(lyrics: string): LyricLanguage {
  // 剥离翻译行与结构标记后统计字符构成
  const text = stripTranslationLines(lyrics)
    .split('\n')
    .filter((l) => !/^\s*\[[^\]]+\]\s*$/.test(l))
    .join('');

  let kana = 0;
  let hanzi = 0;
  let latin = 0;
  for (const ch of text) {
    if (/[぀-ヿ]/.test(ch)) kana += 1; // 平假名 + 片假名
    else if (/[一-鿿]/.test(ch)) hanzi += 1;
    else if (/[a-zA-Z]/.test(ch)) latin += 1;
  }

  // 日文歌词假名密度高（假名/汉字比通常 0.3 以上）；中文歌假名必为 0。
  if (kana >= 3 && kana >= hanzi * 0.2) return 'japanese';
  if (hanzi >= 3 && kana === 0) return 'chinese';
  if (latin >= 10 && hanzi + kana === 0) return 'other';
  return 'other';
}

/** 日文歌词的强制语言标签（Suno 官方风格标签，custom 模式下随 style 传给生成服务） */
export const JAPANESE_LYRICS_TAG = 'japanese lyrics';

/** 生成参数注入：日文歌词确保 styleTags 含语言标签，并给 prompt 加显式演唱语言 */
export function withLyricLanguageGuard(
  styleTags: string[],
  prompt: string | undefined,
  lyrics: string,
): { styleTags: string[]; prompt?: string } {
  const language = detectLyricLanguage(lyrics);
  if (language !== 'japanese') {
    return { styleTags, prompt };
  }

  const tags = [...styleTags];
  const hasJapaneseTag = tags.some((t) => /japan|日语|にほん|日本語/i.test(t));
  if (!hasJapaneseTag) {
    if (tags.length >= 6) tags.pop(); // 标签上限 6 个：保证语言标签有位置
    tags.push(JAPANESE_LYRICS_TAG);
  }

  const langHint = 'Sung in Japanese.';
  const nextPrompt =
    prompt && prompt.trim() && !/日语|japanese/i.test(prompt)
      ? `${langHint} ${prompt.trim()}`
      : (prompt ?? langHint);

  return { styleTags: tags, prompt: nextPrompt };
}
