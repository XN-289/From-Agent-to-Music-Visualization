import { describe, expect, it } from 'vitest';
import {
  buildTranslationLines,
  mergeTranslations,
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

describe('mergeTranslations', () => {
  it('按序把翻译贴到主行', () => {
    const lrc = [
      { startMs: 0, endMs: 4000, text: '朝の光' },
      { startMs: 4000, endMs: 8000, text: '君の名前' },
    ];
    const tLrc = [{ startMs: 0, endMs: 4000, text: '晨光' }];

    expect(mergeTranslations(lrc, tLrc)).toEqual([
      { startMs: 0, endMs: 4000, text: '朝の光', translation: '晨光' },
      { startMs: 4000, endMs: 8000, text: '君の名前', translation: undefined },
    ]);
  });
});
