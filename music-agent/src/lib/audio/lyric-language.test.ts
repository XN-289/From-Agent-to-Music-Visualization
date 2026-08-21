import { describe, expect, it } from 'vitest';
import { detectLyricLanguage, withLyricLanguageGuard } from './lyric-language';

const JP_LYRICS = `[Verse 1]
半分のレモン まな板の上
// 半颗柠檬搁在案板上
木目に染み込んだ あなたの匂い
// 木纹里渗进了你的气息`;

const CN_LYRICS = `[Verse 1]
冰柜的灯比我诚实
凌晨三点的便利店
路灯下影子拉得老长`;

describe('detectLyricLanguage', () => {
  it('日文歌词（含假名+翻译行）识别为 japanese', () => {
    expect(detectLyricLanguage(JP_LYRICS)).toBe('japanese');
  });

  it('中文歌词识别为 chinese', () => {
    expect(detectLyricLanguage(CN_LYRICS)).toBe('chinese');
  });

  it('空歌词或纯结构标记为 other', () => {
    expect(detectLyricLanguage('[Verse]\n[Chorus]')).toBe('other');
    expect(detectLyricLanguage('')).toBe('other');
  });
});

describe('withLyricLanguageGuard', () => {
  it('日文歌词注入 japanese lyrics 标签与演唱语言', () => {
    const out = withLyricLanguageGuard(
      ['j-pop', 'sad pop', 'emotional', 'female vocals'],
      '米津玄师《Lemon》式克制深情',
      JP_LYRICS,
    );
    expect(out.styleTags).toContain('japanese lyrics');
    expect(out.prompt).toMatch(/Sung in Japanese/);
  });

  it('中文歌词不改动标签与 prompt', () => {
    const tags = ['dreamy pop', 'female vocals'];
    const out = withLyricLanguageGuard(tags, '夏夜散步', CN_LYRICS);
    expect(out.styleTags).toEqual(tags);
    expect(out.prompt).toBe('夏夜散步');
  });

  it('已有日语标签时不重复注入', () => {
    const out = withLyricLanguageGuard(['j-pop', 'japanese lyrics'], undefined, JP_LYRICS);
    expect(out.styleTags.filter((t) => t === 'japanese lyrics')).toHaveLength(1);
    expect(out.prompt).toBe('Sung in Japanese.');
  });

  it('标签已满 6 个时挤出最后一个空位给语言标签', () => {
    const tags = ['a', 'b', 'c', 'd', 'e', 'f'];
    const out = withLyricLanguageGuard(tags, undefined, JP_LYRICS);
    expect(out.styleTags).toHaveLength(6);
    expect(out.styleTags).toContain('japanese lyrics');
  });
});
