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
