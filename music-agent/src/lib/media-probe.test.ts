import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isDecodableCoverFile } from './media-probe';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'media-probe-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('isDecodableCoverFile', () => {
  it('accepts a JPEG cover with dimensions', async () => {
    const bytes = Buffer.from([
      0xff, 0xd8,
      0xff, 0xc0, 0x00, 0x08, 0x08, 0x02, 0x00, 0x03, 0xe8, 0x01, 0x40, 0x03,
      0xff, 0xd9,
    ]);
    const filePath = path.join(dir, 'cover.jpg');
    await writeFile(filePath, bytes);

    await expect(isDecodableCoverFile(filePath)).resolves.toBe(true);
  });

  it('accepts a WebP cover with dimensions', async () => {
    const bytes = Buffer.alloc(25);
    bytes.write('RIFF', 0, 'ascii');
    bytes.writeUInt32LE(5, 4);
    bytes.write('WEBPVP8L', 8, 'ascii');
    bytes[20] = 0x2f;
    bytes.writeUInt32LE((1023 << 0) | (1023 << 14), 21);
    const filePath = path.join(dir, 'cover.webp');
    await writeFile(filePath, bytes);

    await expect(isDecodableCoverFile(filePath)).resolves.toBe(true);
  });
});
