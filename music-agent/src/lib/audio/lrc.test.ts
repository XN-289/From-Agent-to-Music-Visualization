import { describe, expect, it } from 'vitest';
import {
  buildTranslationLines,
  coaxAlignedLyrics,
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

describe('coaxAlignedLyrics', () => {
  const MAIN = [
    '[Verse 1]',
    '半分のレモン まな板の上',
    '木目に染み込んだ あなたの匂い',
    '[Chorus]',
    '私を 育て直すんだ',
  ].join('\n');

  it('行数接近时：上游时间戳 + 用户主歌词文本，结构标记被过滤', () => {
    const aligned: LyricsLine[] = [
      { startMs: 13484, endMs: 16000, text: '[Verse 1]' },
      { startMs: 13484, endMs: 16516, text: '半分' },
      { startMs: 16516, endMs: 19787, text: 'まな板に置く' },
      { startMs: 19787, endMs: 23000, text: '木目に染み込む' },
    ];
    const out = coaxAlignedLyrics(MAIN, aligned);
    expect(out).toEqual([
      { startMs: 13484, endMs: 16516, text: '半分のレモン まな板の上' },
      { startMs: 16516, endMs: 19787, text: '木目に染み込んだ あなたの匂い' },
      { startMs: 19787, endMs: 23000, text: '私を 育て直すんだ' },
    ]);
  });

  it('行数差异过大时保留上游文本（行序映射会错位）', () => {
    const aligned: LyricsLine[] = [
      { startMs: 0, endMs: 1000, text: 'a' },
      { startMs: 1000, endMs: 2000, text: 'b' },
      { startMs: 2000, endMs: 3000, text: 'c' },
      { startMs: 3000, endMs: 4000, text: 'd' },
      { startMs: 4000, endMs: 5000, text: 'e' },
      { startMs: 5000, endMs: 6000, text: 'f' },
      { startMs: 6000, endMs: 7000, text: 'g' },
    ];
    const out = coaxAlignedLyrics(MAIN, aligned);
    expect(out.map((l) => l.text)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  });

  it('全部是结构标记行时保持原样', () => {
    const aligned: LyricsLine[] = [
      { startMs: 1000, endMs: 2000, text: '[Intro]' },
      { startMs: 2000, endMs: 3000, text: '[Verse 1]' },
    ];
    expect(coaxAlignedLyrics(MAIN, aligned)).toEqual(aligned);
  });

  it('标记与歌词同行的上游数据也能共轴（剥行内标记前缀）', () => {
    const aligned: LyricsLine[] = [
      { startMs: 15600, endMs: 20000, text: '[Verse 1]\n浴衣の袖を風が抜けてく' },
      { startMs: 22900, endMs: 26000, text: '君は空だけ見てた' },
      { startMs: 29800, endMs: 33000, text: '打ち上がる音に紛れて' },
    ];
    const out = coaxAlignedLyrics(MAIN, aligned);
    expect(out.map((l) => l.text)).toEqual([
      '半分のレモン まな板の上',
      '木目に染み込んだ あなたの匂い',
      '私を 育て直すんだ',
    ]);
  });
});
