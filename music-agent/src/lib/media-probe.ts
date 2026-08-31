import { constants } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseBuffer } from 'music-metadata';

async function isReadableFile(filePath: string | null | undefined): Promise<boolean> {
  if (!filePath) return false;

  try {
    await access(filePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function isPlayableAudioFile(
  filePath: string | null | undefined,
): Promise<boolean> {
  if (!(await isReadableFile(filePath))) return false;

  try {
    const bytes = await readFile(filePath!);
    const metadata = await parseBuffer(
      bytes,
      path.extname(filePath!).slice(1).toLowerCase(),
    );
    const duration = metadata.format.duration;
    return typeof duration === 'number' && Number.isFinite(duration) && duration > 0;
  } catch {
    return false;
  }
}

function pngSize(bytes: Buffer): { width: number; height: number } | null {
  if (
    bytes.length < 24 ||
    bytes.readUInt32BE(0) !== 0x89504e47 ||
    bytes.toString('ascii', 4, 8) !== '\r\n\x1a\n' ||
    bytes.toString('ascii', 12, 16) !== 'IHDR'
  ) {
    return null;
  }

  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function jpegSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes.readUInt16BE(0) !== 0xffd8) return null;

  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }

    const segmentEnd = offset + 2 + bytes.readUInt16BE(offset + 2);
    const isStartOfFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isStartOfFrame) {
      if (segmentEnd > bytes.length) return null;
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    }
    if (segmentEnd <= offset + 4) return null;
    offset = segmentEnd;
  }

  return null;
}

function webpSize(bytes: Buffer): { width: number; height: number } | null {
  if (
    bytes.length < 12 ||
    bytes.toString('ascii', 0, 4) !== 'RIFF' ||
    bytes.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    return null;
  }

  const chunkName = bytes.toString('ascii', 12, 16);
  if (chunkName === 'VP8X' && bytes.length >= 30) {
    const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
    const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
    return { width, height };
  }
  if (chunkName === 'VP8 ' && bytes.length >= 27) {
    return {
      width: bytes.readUInt16LE(23) & 0x3fff,
      height: bytes.readUInt16LE(25) & 0x3fff,
    };
  }
  if (chunkName === 'VP8L' && bytes.length >= 25) {
    const bits = bytes.readUInt32LE(21);
    return {
      width: 1 + (bits & 0x3fff),
      height: 1 + ((bits >>> 14) & 0x3fff),
    };
  }

  return null;
}

export async function isDecodableCoverFile(
  filePath: string | null | undefined,
): Promise<boolean> {
  if (!(await isReadableFile(filePath))) return false;

  try {
    const bytes = await readFile(filePath!);
    const size = pngSize(bytes) ?? jpegSize(bytes) ?? webpSize(bytes);
    return Boolean(size && size.width > 0 && size.height > 0);
  } catch {
    return false;
  }
}
