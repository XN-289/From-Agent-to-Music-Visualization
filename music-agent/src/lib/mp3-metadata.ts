// MP3 ID3 标签写入：主歌词/翻译/封面嵌入音频。
// 翻译帧合同（与 folia-major metadataParser.worker.ts / electron/stageApi.cjs 对齐）：
//   USLT language='chi' 或 descriptor 含 'translation' → 被识别为翻译
// 主歌词推送时用 lyricsFile 直传（优先级高于内嵌），内嵌作为 Folia 本地曲库导入兜底。
import { readFile, writeFile } from 'node:fs/promises';
import { coverMimeForPath } from '@/lib/media-mime';

export interface EmbedMetadataInput {
  title: string;
  artist: string;
  album: string;
  lrc: string;
  tLrc?: string | null;
  coverPath?: string | null;
}

function syncsafeSize(value: number): Buffer {
  return Buffer.from([
    (value >> 21) & 0x7f,
    (value >> 14) & 0x7f,
    (value >> 7) & 0x7f,
    value & 0x7f,
  ]);
}

function encodeUtf16(text: string): Buffer {
  return Buffer.from(`\uFEFF${text}`, 'utf16le');
}

function terminatedUtf16(text: string): Buffer {
  return Buffer.concat([encodeUtf16(text), Buffer.from([0x00, 0x00])]);
}

function frame(id: string, body: Buffer): Buffer {
  const header = Buffer.alloc(10);
  header.write(id, 0, 'ascii');
  header.writeUInt32BE(body.length, 4);
  return Buffer.concat([header, body]);
}

function textFrame(id: string, value: string): Buffer {
  return frame(id, Buffer.concat([Buffer.from([0x01]), encodeUtf16(value)]));
}

function usltFrame(language: string, descriptor: string, text: string): Buffer {
  return frame(
    'USLT',
    Buffer.concat([
      Buffer.from([0x01]),
      Buffer.from(language.slice(0, 3).padEnd(3, ' '), 'ascii'),
      terminatedUtf16(descriptor),
      encodeUtf16(text),
    ]),
  );
}

function pictureFrame(mime: string, imageBuffer: Buffer): Buffer {
  return frame(
    'APIC',
    Buffer.concat([
      Buffer.from([0x00]),
      Buffer.from(mime, 'ascii'),
      Buffer.from([0x00]),
      Buffer.from([0x03]),
      Buffer.from('cover', 'latin1'),
      Buffer.from([0x00]),
      imageBuffer,
    ]),
  );
}

function stripId3v2(buffer: Buffer): Buffer {
  if (buffer.length < 10 || buffer.toString('ascii', 0, 3) !== 'ID3') return buffer;

  const major = buffer[3];
  const size = major === 2
    ? (buffer[6] << 16) | (buffer[7] << 8) | buffer[8]
    : ((buffer[6] & 0x7f) << 21)
      | ((buffer[7] & 0x7f) << 14)
      | ((buffer[8] & 0x7f) << 7)
      | (buffer[9] & 0x7f);

  return buffer.subarray(10 + size);
}

export async function embedSongMetadata(
  mp3Path: string,
  input: EmbedMetadataInput,
): Promise<void> {
  const frames: Buffer[] = [
    textFrame('TIT2', input.title),
    textFrame('TPE1', input.artist),
    textFrame('TALB', input.album),
    usltFrame('eng', '', input.lrc),
  ];
  if (input.tLrc?.trim()) {
    frames.push(usltFrame('chi', 'translation', input.tLrc));
  }
  if (input.coverPath) {
    const imageBuffer = await readFile(input.coverPath);
    frames.push(pictureFrame(coverMimeForPath(input.coverPath), imageBuffer));
  }

  const frameBuffer = Buffer.concat(frames);
  const header = Buffer.alloc(10);
  header.write('ID3', 0, 'ascii');
  header[3] = 0x03;
  header[4] = 0x00;
  syncsafeSize(frameBuffer.length).copy(header, 6);

  const original = await readFile(mp3Path);
  await writeFile(mp3Path, Buffer.concat([header, frameBuffer, stripId3v2(original)]));
}
