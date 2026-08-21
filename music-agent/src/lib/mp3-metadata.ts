// MP3 ID3 标签写入：主歌词/翻译/封面嵌入音频。
// 翻译帧合同（与 folia-major metadataParser.worker.ts / electron/stageApi.cjs 对齐）：
//   USLT language='chi' 或 descriptor 含 'translation' → 被识别为翻译
// 主歌词推送时用 lyricsFile 直传（优先级高于内嵌），内嵌作为 Folia 本地曲库导入兜底。
import { readFile } from 'node:fs/promises';
import NodeID3 from 'node-id3';

export interface EmbedMetadataInput {
  title: string;
  artist: string;
  album: string;
  lrc: string;
  tLrc?: string | null;
  coverPath?: string | null;
}

export async function embedSongMetadata(
  mp3Path: string,
  input: EmbedMetadataInput,
): Promise<void> {
  const uslt: Array<{ language: string; shortText: string; text: string }> = [
    { language: 'eng', shortText: '', text: input.lrc },
  ];
  if (input.tLrc?.trim()) {
    uslt.push({ language: 'chi', shortText: 'translation', text: input.tLrc });
  }
  const tags: NodeID3.Tags = {
    title: input.title,
    artist: input.artist,
    album: input.album,
    unsynchronisedLyrics: uslt as unknown as NodeID3.Tags['unsynchronisedLyrics'],
  };
  if (input.coverPath) {
    tags.image = {
      mime: 'image/png',
      type: { id: 3, name: 'front cover' },
      description: 'cover',
      imageBuffer: await readFile(input.coverPath),
    };
  }
  const ok = NodeID3.update(tags, mp3Path);
  if (!ok) throw new Error(`MP3 标签写入失败: ${mp3Path}`);
}
