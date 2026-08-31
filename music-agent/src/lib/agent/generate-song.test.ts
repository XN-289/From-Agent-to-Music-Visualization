import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getProvider: vi.fn(),
  dbInsert: vi.fn(),
}));

vi.mock('@/lib/providers', () => ({
  getProvider: mocks.getProvider,
}));

vi.mock('@/lib/db', () => ({
  db: { insert: mocks.dbInsert },
  schema: { songs: {}, generationJobs: {} },
}));

import { submitGeneration } from './generate-song';

describe('submitGeneration Japanese translation gate', () => {
  it('rejects before provider selection or persistence when translation is incomplete', async () => {
    await expect(
      submitGeneration({
        title: '夜風',
        lyrics: '[Verse 1]\n夜風が答えを運ぶ\n\n[Chorus]\n君の声を探してる',
        styleTags: ['japanese lyrics', 'dreamy pop', 'melancholic'],
      }),
    ).rejects.toThrow(
      '日文歌词缺少逐行中文翻译。请为每一行日文歌词补充「// 中文翻译」，确认后再调用 generate_music。',
    );

    expect(mocks.getProvider).not.toHaveBeenCalled();
    expect(mocks.dbInsert).not.toHaveBeenCalled();
  });
});
