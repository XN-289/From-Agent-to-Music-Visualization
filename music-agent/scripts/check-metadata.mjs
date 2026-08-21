// 验证 embedSongMetadata 写出的 USLT 帧能被 Folia 同款解析器（music-metadata）识别。
// 用法: node scripts/check-metadata.mjs <mp3路径>
import { parseFile } from 'music-metadata';

const [, , file] = process.argv;
if (!file) {
  console.error('用法: node scripts/check-metadata.mjs <mp3路径>');
  process.exit(1);
}
const parsed = await parseFile(file);
const lyrics = (parsed.common.lyrics ?? []).map((t) => ({
  language: t.language,
  descriptor: t.descriptor,
  hasTimeline: /\[\d{2}:\d{2}\.\d{2}\]/.test(t.text ?? ''),
  preview: (t.text ?? '').slice(0, 40),
}));
console.log(JSON.stringify({ title: parsed.common.title, lyrics }, null, 2));
