import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseBuffer } from 'music-metadata';
import { embedSongMetadata } from './mp3-metadata';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'ma-mp3-metadata-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function makeMp3(frameCount = 16): Buffer {
  const frames = Array.from({ length: frameCount }, () => {
    const frame = Buffer.alloc(208);
    frame.writeUInt32BE(0xfffb9000, 0);
    return frame;
  });
  return Buffer.concat(frames);
}

describe('embedSongMetadata', () => {
  it('writes original and Chinese translation USLT frames', async () => {
    const mp3Path = path.join(dir, 'audio.mp3');
    await writeFile(mp3Path, makeMp3());
    const originalLrc = '[00:00.00]北風が窓を叩く\n[00:04.00]君の名前を呼ぶ';
    const translationLrc = '[00:00.00]北风敲打窗户\n[00:04.00]呼唤你的名字';

    await embedSongMetadata(mp3Path, {
      title: '北风と夏',
      artist: 'Music Agent',
      album: 'Music Agent',
      lrc: originalLrc,
      tLrc: translationLrc,
    });

    const parsed = await parseBuffer(await readFile(mp3Path), 'mp3');
    const lyrics = parsed.common.lyrics ?? [];
    expect(lyrics).toHaveLength(2);
    expect(lyrics[0]).toMatchObject({ language: 'eng', text: originalLrc });
    expect(lyrics[1]).toMatchObject({
      language: 'chi',
      descriptor: 'translation',
      text: translationLrc,
    });
  });
});
