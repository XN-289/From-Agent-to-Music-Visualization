import { describe, expect, it } from 'vitest';
import {
  assertGenerationRequestComplete,
  assertJapaneseTranslationComplete,
  findMissingGenerationDimensions,
} from './generation-request';

describe('generation request completeness gate', () => {
  it('accepts a vocal request with style, mood, and song structure', () => {
    expect(
      findMissingGenerationDimensions({
        lyrics: '[Verse 1]\n夜色把街灯调暗\n\n[Chorus]\n我还记得那盏灯',
        styleTags: ['dreamy pop', 'melancholic', 'female vocals'],
      }),
    ).toEqual([]);
  });

  it('accepts an instrumental request with a structure description', () => {
    expect(
      findMissingGenerationDimensions({
        instrumental: true,
        lyrics: '[Intro]\nquiet piano\n\n[Build-up]\nstrings rise\n\n[Drop]\nfull band',
        styleTags: ['ambient', 'calm', 'cinematic'],
      }),
    ).toEqual([]);
  });

  it('reports missing style and mood separately from vocal tags', () => {
    expect(
      findMissingGenerationDimensions({
        lyrics: '[Verse 1]\n夜色把街灯调暗\n\n[Chorus]\n我还记得那盏灯',
        styleTags: ['female vocals', 'melancholic'],
      }),
    ).toEqual(['style']);
  });

  it('reports missing mood when only genre and vocal tags are provided', () => {
    expect(
      findMissingGenerationDimensions({
        lyrics: '[Verse 1]\n夜色把街灯调暗\n\n[Chorus]\n我还记得那盏灯',
        styleTags: ['pop', 'female vocals'],
      }),
    ).toEqual(['mood']);
  });

  it('requires verse and chorus structure for vocal songs', () => {
    expect(
      findMissingGenerationDimensions({
        lyrics: '[Verse 1]\n夜色把街灯调暗',
        styleTags: ['dreamy pop', 'melancholic', 'female vocals'],
      }),
    ).toEqual(['structure']);
  });

  it('asks for clarification when all three dimensions are missing', () => {
    expect(() =>
      assertGenerationRequestComplete({
        lyrics: '随便写一首好听的歌',
        styleTags: ['good', 'music'],
      }),
    ).toThrow(
      '创作需求不完整：缺风格、情绪、结构。请先给用户 2-3 个方向选项并等待确认，不要直接调用 generate_music。',
    );
  });

  it('accepts Japanese lyrics only when every line has a Chinese translation', () => {
    const complete = [
      '[Verse 1]',
      '夜風が答えを運ぶ',
      '// 晚风带来答案',
      '[Chorus]',
      '君の声を探してる',
      '// 我在寻找你的声音',
    ].join('\n');
    const incomplete = complete.replace('// 晚风带来答案\n', '');

    expect(() => assertJapaneseTranslationComplete(complete)).not.toThrow();
    expect(() => assertJapaneseTranslationComplete(incomplete)).toThrow(
      '日文歌词缺少逐行中文翻译。请为每一行日文歌词补充「// 中文翻译」，确认后再调用 generate_music。',
    );
  });
});
