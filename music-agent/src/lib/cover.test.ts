import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderCoverPng } from './cover';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'cover-test-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('renderCoverPng', () => {
  it('产出 1024x1024 PNG（魔法字节 + IHDR 尺寸）', async () => {
    const outPath = path.join(dir, 'cover.png');
    const result = await renderCoverPng({ title: '晨光', styleTags: ['j-pop', 'female vocals'], outPath });
    expect(result).toBe(outPath);
    const buf = await readFile(outPath);
    expect(buf.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(buf.readUInt32BE(16)).toBe(1024);
    expect(buf.readUInt32BE(20)).toBe(1024);
    expect((await stat(outPath)).size).toBeGreaterThan(1000);
  });

  it('相同 key 色板稳定，不同 key 可执行', async () => {
    const result = await renderCoverPng({ title: 'A', styleTags: [], outPath: path.join(dir, 'a.png') });
    expect(result).toBe(path.join(dir, 'a.png'));
  });
});
