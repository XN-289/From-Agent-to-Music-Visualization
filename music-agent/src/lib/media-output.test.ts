import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LyricsLine } from '@/lib/audio/lrc';
import { renderCoverPng } from '@/lib/cover';
import {
  persistGeneratedSong,
  persistValidatedGeneratedSong,
  validatePersistedSongBundle,
} from './media-output';

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

function makeWav(samples: number[] = [0, 0.25, -0.25, 0]): Buffer {
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(8000, 24);
  buf.writeUInt32LE(16000, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  samples.forEach((sample, index) => {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32767), 44 + index * 2);
  });
  return buf;
}

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

describe('validatePersistedSongBundle', () => {
  it('returns completion issues for missing audio, lyrics, cover, and metadata', async () => {
    const issues = await validatePersistedSongBundle({
      songId: 'song-3',
      directory: dir,
      metaPath: path.join(dir, 'missing-meta.json'),
      lyricsTxtPath: path.join(dir, 'lyrics.txt'),
      lyricsLrcPath: path.join(dir, 'lyrics.lrc'),
      lyricsTLrcPath: null,
      coverPath: path.join(dir, 'missing-cover.png'),
      audioPaths: [],
      title: '不完整',
      lyrics: '',
      styleTags: null,
      prompt: null,
      jobId: 'job-3',
      providerId: 'mock',
      variants: [],
      lrc: [],
      tLrc: [],
    });

    expect(issues).toEqual(
      expect.arrayContaining(['音频缺失或不可读', '歌词缺失', '封面缺失或不可读', '元数据缺失或不可读']),
    );
  });

  it('accepts a bundle with playable audio, valid lyrics, valid cover, and metadata', async () => {
    const audioPath = path.join(dir, 'audio-01-test.mp3');
    const coverPath = path.join(dir, 'cover.png');
    const metaPath = path.join(dir, 'meta.json');
    const lyricsTxtPath = path.join(dir, 'lyrics.txt');
    const lyricsLrcPath = path.join(dir, 'lyrics.lrc');
    await Promise.all([
      writeFile(audioPath, makeWav()),
      renderCoverPng({ title: '完整', styleTags: [], outPath: coverPath }),
      writeFile(metaPath, '{}'),
      writeFile(lyricsTxtPath, '你好世界'),
      writeFile(lyricsLrcPath, '[00:00.00]你好世界'),
    ]);

    await expect(
      validatePersistedSongBundle({
        songId: 'song-4',
        directory: dir,
        metaPath,
        lyricsTxtPath,
        lyricsLrcPath,
        lyricsTLrcPath: null,
        coverPath,
        audioPaths: [{ variantId: 'v1', path: audioPath, url: '/audio.mp3' }],
        title: '完整',
        lyrics: '你好世界',
        styleTags: null,
        prompt: null,
        jobId: 'job-4',
        providerId: 'mock',
        variants: [],
        lrc: [{ startMs: 0, endMs: 1000, text: '你好世界' }],
        tLrc: [],
      }),
    ).resolves.toEqual([]);
  });

  it('rejects Japanese lyrics without complete aligned translation subtitles', async () => {
    const metaPath = path.join(dir, 'meta.json');
    await writeFile(metaPath, '{}');

    const issues = await validatePersistedSongBundle({
      songId: 'song-jp',
      directory: dir,
      metaPath,
      lyricsTxtPath: path.join(dir, 'lyrics.txt'),
      lyricsLrcPath: path.join(dir, 'lyrics.lrc'),
      lyricsTLrcPath: null,
      coverPath: null,
      audioPaths: [],
      title: '日文歌',
      lyrics: '[Verse]\n夜風が答えを運ぶ\n// 晚风带来答案',
      styleTags: null,
      prompt: null,
      jobId: 'job-jp',
      providerId: 'mock',
      variants: [],
      lrc: [{ startMs: 0, endMs: 4000, text: '夜風が答えを運ぶ' }],
      tLrc: [],
    });

    expect(issues).toContain('日文翻译副字幕缺失或时间轴不一致');
  });

  it('rejects a bundle when any generated audio variant is unreadable', async () => {
    const audioPath = path.join(dir, 'audio-01-test.mp3');
    const missingAudioPath = path.join(dir, 'audio-02-missing.mp3');
    const coverPath = path.join(dir, 'cover.png');
    const metaPath = path.join(dir, 'meta.json');
    const lyricsTxtPath = path.join(dir, 'lyrics.txt');
    const lyricsLrcPath = path.join(dir, 'lyrics.lrc');
    await Promise.all([
      writeFile(audioPath, makeWav()),
      renderCoverPng({ title: '缺一个音频', styleTags: [], outPath: coverPath }),
      writeFile(metaPath, '{}'),
      writeFile(lyricsTxtPath, '你好世界'),
      writeFile(lyricsLrcPath, '[00:00.00]你好世界'),
    ]);

    const issues = await validatePersistedSongBundle({
      songId: 'song-6',
      directory: dir,
      metaPath,
      lyricsTxtPath,
      lyricsLrcPath,
      lyricsTLrcPath: null,
      coverPath,
      audioPaths: [
        { variantId: 'v1', path: audioPath, url: '/audio-1.mp3' },
        { variantId: 'v2', path: missingAudioPath, url: '/audio-2.mp3' },
      ],
      title: '缺一个音频',
      lyrics: '你好世界',
      styleTags: null,
      prompt: null,
      jobId: 'job-6',
      providerId: 'mock',
      variants: [],
      lrc: [{ startMs: 0, endMs: 1000, text: '你好世界' }],
      tLrc: [],
    });

    expect(issues).toContain('音频缺失或不可读');
  });

  it('rejects readable but invalid audio and cover payloads', async () => {
    const audioPath = path.join(dir, 'audio-01-invalid.mp3');
    const coverPath = path.join(dir, 'cover.png');
    const metaPath = path.join(dir, 'meta.json');
    const lyricsTxtPath = path.join(dir, 'lyrics.txt');
    const lyricsLrcPath = path.join(dir, 'lyrics.lrc');
    await Promise.all([
      writeFile(audioPath, 'not audio'),
      writeFile(coverPath, 'not an image'),
      writeFile(metaPath, '{}'),
      writeFile(lyricsTxtPath, '你好世界'),
      writeFile(lyricsLrcPath, '[00:00.00]你好世界'),
    ]);

    const issues = await validatePersistedSongBundle({
      songId: 'song-7',
      directory: dir,
      metaPath,
      lyricsTxtPath,
      lyricsLrcPath,
      lyricsTLrcPath: null,
      coverPath,
      audioPaths: [{ variantId: 'v1', path: audioPath, url: '/invalid.mp3' }],
      title: '非法媒体',
      lyrics: '你好世界',
      styleTags: null,
      prompt: null,
      jobId: 'job-7',
      providerId: 'mock',
      variants: [],
      lrc: [{ startMs: 0, endMs: 1000, text: '你好世界' }],
      tLrc: [],
    });

    expect(issues).toContain('音频缺失或不可读');
    expect(issues).toContain('封面缺失或不可读');
  });

  it('persists provider output and returns no issues when all deliverables are readable', async () => {
    const wav = makeWav();
    const result = await persistValidatedGeneratedSong({
      songId: 'song-5',
      title: '完整生成',
      lyrics: '你好世界',
      styleTags: ['pop'],
      prompt: null,
      jobId: 'job-5',
      providerId: 'mock',
      variants: [
        {
          id: 'variant-1',
          audioUrl: `data:audio/wav;base64,${wav.toString('base64')}`,
          title: '完整生成',
          durationSec: 1,
        },
      ],
      lrc: [{ startMs: 0, endMs: 1000, text: '你好世界' }],
      tLrc: [],
    });

    expect(result.issues).toEqual([]);
    expect(result.bundle?.audioPaths).toHaveLength(1);
    expect(result.bundle?.coverPath).not.toBeNull();
  });
});
