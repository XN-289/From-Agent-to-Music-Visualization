import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pushSongToFolia } from './folia-stage';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'ma-folia-stage-'));
  vi.stubEnv('FOLIA_STAGE_TOKEN', 'test-token');
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

describe('pushSongToFolia', () => {
  it('sends aligned Japanese lyrics and translation as separate Stage fields', async () => {
    const lyricsPath = path.join(dir, 'lyrics.lrc');
    const translationPath = path.join(dir, 'lyrics.t.lrc');
    const audioPath = path.join(dir, 'audio-01-mock.wav');
    const coverPath = path.join(dir, 'cover.png');
    const original = '[00:00.00]夜風が答えを運ぶ\n[00:04.00]君の声を探してる\n[00:08.00]夏はまだ続く';
    const translation = '[00:00.00]晚风带来答案\n[00:04.00]我在寻找你的声音\n[00:08.00]夏天还在继续';
    await writeFile(lyricsPath, original, 'utf8');
    await writeFile(translationPath, translation, 'utf8');
    await writeFile(audioPath, 'mock wav', 'utf8');
    await writeFile(coverPath, 'png bytes', 'utf8');

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ activeEntryKind: 'media' }), { status: 200 }),
    );

    const result = await pushSongToFolia({
      songId: 'song-jp',
      directory: dir,
      metaPath: path.join(dir, 'meta.json'),
      lyricsTxtPath: path.join(dir, 'lyrics.txt'),
      lyricsLrcPath: lyricsPath,
      lyricsTLrcPath: translationPath,
      coverPath,
      audioPaths: [{ variantId: 'v0', path: audioPath, url: 'mock://audio' }],
      title: '晚风与夏天',
      lyrics: original,
      styleTags: null,
      prompt: null,
      jobId: 'job-jp',
      providerId: 'mock',
      variants: [],
      lrc: [
        { startMs: 0, endMs: 4000, text: '夜風が答えを運ぶ' },
        { startMs: 4000, endMs: 8000, text: '君の声を探してる' },
        { startMs: 8000, endMs: 12000, text: '夏はまだ続く' },
      ],
      tLrc: [
        { startMs: 0, endMs: 4000, text: '晚风带来答案' },
        { startMs: 4000, endMs: 8000, text: '我在寻找你的声音' },
        { startMs: 8000, endMs: 12000, text: '夏天还在继续' },
      ],
    }, {
      id: 'rain-window',
      intensity: 40,
      temperature: -8,
      chorusImpact: 44,
    });

    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = fetchSpy.mock.calls[0]?.[1]?.body;
    expect(body).toBeInstanceOf(FormData);
    const form = body as FormData;
    expect(form.get('translationLyrics')).toBe(translation);
    expect(JSON.parse(form.get('visualConfig') as string)).toMatchObject({
      visualizerMode: 'monet',
      visualizerBackgroundMode: 'monet',
    });
    await expect((form.get('audioFile') as File).text()).resolves.toBe('mock wav');
    await expect((form.get('coverFile') as File).text()).resolves.toBe('png bytes');
    await expect((form.get('lyricsFile') as File).text()).resolves.toBe(original);
  });
});
