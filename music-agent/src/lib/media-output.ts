import { constants } from 'node:fs';
import { access, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { LyricsLine } from '@/lib/audio/lrc';
import { renderCoverPng } from '@/lib/cover';
import { isDecodableCoverFile, isPlayableAudioFile } from '@/lib/media-probe';
import { extensionForImageUrl } from '@/lib/media-mime';
import type { SongVariant } from '@/lib/providers/types';

export interface PersistSongInput {
  songId: string;
  title: string;
  lyrics: string | null;
  styleTags: string[] | null;
  prompt: string | null;
  jobId: string;
  providerId: string;
  variants: SongVariant[];
  lrc: LyricsLine[];
  tLrc: LyricsLine[];
}

export interface PersistedSongBundle {
  songId: string;
  directory: string;
  metaPath: string;
  lyricsTxtPath: string;
  lyricsLrcPath: string;
  lyricsTLrcPath: string | null;
  coverPath: string | null;
  audioPaths: Array<{ variantId: string; path: string; url: string }>;
}

export interface LoadedSongBundle extends PersistedSongBundle {
  title: string;
  lyrics: string | null;
  styleTags: string[] | null;
  prompt: string | null;
  jobId: string;
  providerId: string;
  variants: SongVariant[];
  lrc: LyricsLine[];
  tLrc: LyricsLine[];
}

export interface ValidatedPersistedSong {
  bundle: LoadedSongBundle | null;
  issues: string[];
}

function mediaRoot(): string {
  const configured = process.env.MEDIA_OUTPUT_DIR?.trim();
  return path.resolve(process.cwd(), configured || 'data/media');
}

function songDirectory(songId: string): string {
  return path.join(mediaRoot(), sanitizeSegment(songId));
}

function sanitizeSegment(value: string): string {
  const cleaned = value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim();
  return cleaned || 'song';
}

function lrcTimestamp(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centiseconds = Math.floor((ms % 1000) / 10);
  return `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}]`;
}

export function lyricsToLrc(lines: LyricsLine[]): string {
  return lines.map((line) => `${lrcTimestamp(line.startMs)}${line.text}`).join('\n');
}

async function downloadFile(url: string, destination: string): Promise<void> {
  const localPath = localPublicPathForUrl(url);
  if (localPath) {
    try {
      const bytes = await readFile(localPath);
      await writeFile(destination, bytes);
      return;
    } catch (error) {
      console.warn(
        `[media-output] 本地公开目录读取失败，改为 HTTP 下载 ${url}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (/^data:/i.test(url)) {
    const match = url.match(/^data:([^,]*),([\s\S]*)$/);
    if (!match) throw new Error('下载失败（data URL 无效）');
    const [, metadata, payload] = match;
    const bytes = /;base64/i.test(metadata)
      ? Buffer.from(payload, 'base64')
      : Buffer.from(decodeURIComponent(payload), 'utf8');
    await writeFile(destination, bytes);
    return;
  }

  const resolvedUrl = resolveAudioUrl(url);
  const res = await fetch(resolvedUrl);
  if (!res.ok) throw new Error(`下载失败（HTTP ${res.status}）`);
  const bytes = Buffer.from(await res.arrayBuffer());
  await writeFile(destination, bytes);
}

function extensionForUrl(url: string): string {
  const pathname = url.split(/[?#]/, 1)[0].toLowerCase();
  const match = pathname.match(/\.(mp3|wav|flac|m4a)$/);
  if (match) return match[1];
  return 'mp3';
}

const COVER_FILE_PATTERN = /^cover\.(png|jpe?g|webp)$/i;

async function clearExistingCover(directory: string): Promise<void> {
  const files = await readdir(directory).catch(() => [] as string[]);
  await Promise.all(
    files
      .filter((file) => COVER_FILE_PATTERN.test(file))
      .map((file) => rm(path.join(directory, file), { force: true })),
  );
}

async function downloadCoverFile(imageUrl: string, directory: string): Promise<string> {
  const resolvedUrl = resolveAudioUrl(imageUrl);
  const res = await fetch(resolvedUrl);
  if (!res.ok) throw new Error(`封面下载失败（HTTP ${res.status}）`);
  const contentType = res.headers.get('content-type');
  const ext = extensionForImageUrl(imageUrl, contentType);
  const destination = path.join(directory, `cover.${ext}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  await writeFile(destination, bytes);
  return destination;
}

function localPublicPathForUrl(url: string): string | null {
  if (!url.startsWith('/')) return null;
  const pathname = url.split(/[?#]/, 1)[0];
  return path.join(process.cwd(), 'public', pathname);
}

function resolveAudioUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const configuredOrigin = process.env.MUSIC_AGENT_ORIGIN?.trim().replace(/\/$/, '');
  if (configuredOrigin) return `${configuredOrigin}${url.startsWith('/') ? url : `/${url}`}`;
  const port = process.env.PORT?.trim() || '3000';
  return `http://127.0.0.1:${port}${url.startsWith('/') ? url : `/${url}`}`;
}

async function isReadableFile(filePath: string | null | undefined): Promise<boolean> {
  if (!filePath) return false;
  try {
    await access(filePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function validatePersistedSongBundle(bundle: LoadedSongBundle): Promise<string[]> {
  const audioFilesReadable = await Promise.all(
    bundle.audioPaths.map((audio) => isPlayableAudioFile(audio.path)),
  );
  const audioReadable = bundle.audioPaths.length > 0 && audioFilesReadable.every(Boolean);
  const lyricsReadable =
    Boolean(bundle.lyrics?.trim()) &&
    bundle.lrc.length > 0 &&
    (await isReadableFile(bundle.lyricsTxtPath)) &&
    (await isReadableFile(bundle.lyricsLrcPath));
  const coverReadable = await isDecodableCoverFile(bundle.coverPath);
  const metaReadable = await isReadableFile(bundle.metaPath);

  return [
    audioReadable ? null : '音频缺失或不可读',
    lyricsReadable ? null : '歌词缺失',
    coverReadable ? null : '封面缺失或不可读',
    metaReadable ? null : '元数据缺失或不可读',
  ].filter((issue): issue is string => issue !== null);
}

export async function persistValidatedGeneratedSong(input: PersistSongInput): Promise<ValidatedPersistedSong> {
  await persistGeneratedSong(input);
  const bundle = await loadPersistedSong(input.songId);
  return {
    bundle,
    issues: bundle ? await validatePersistedSongBundle(bundle) : ['产物落盘失败'],
  };
}

export async function persistGeneratedSong(input: PersistSongInput): Promise<PersistedSongBundle> {
  const directory = songDirectory(input.songId);
  await mkdir(directory, { recursive: true });

  const audioPaths: PersistedSongBundle['audioPaths'] = [];
  await Promise.all(
    input.variants.map(async (variant, index) => {
      if (!variant.audioUrl) return;
      const ext = extensionForUrl(variant.audioUrl);
      const fileName = `audio-${String(index + 1).padStart(2, '0')}-${sanitizeSegment(variant.id)}.${ext}`;
      const destination = path.join(directory, fileName);
      try {
        await downloadFile(variant.audioUrl, destination);
        audioPaths.push({ variantId: variant.id, path: destination, url: variant.audioUrl });
      } catch (e) {
        console.warn(`[media-output] 音频落盘跳过 ${variant.id}:`, e instanceof Error ? e.message : String(e));
      }
    }),
  );

  const lyricsTxt = input.lyrics ?? '';
  const lyricsLrc = lyricsToLrc(input.lrc);
  const lyricsTxtPath = path.join(directory, 'lyrics.txt');
  const lyricsLrcPath = path.join(directory, 'lyrics.lrc');
  const lyricsTLrcPath = input.tLrc.length ? path.join(directory, 'lyrics.t.lrc') : null;
  const metaPath = path.join(directory, 'meta.json');

  await Promise.all([
    writeFile(lyricsTxtPath, lyricsTxt, 'utf8'),
    writeFile(lyricsLrcPath, lyricsLrc, 'utf8'),
    lyricsTLrcPath
      ? writeFile(lyricsTLrcPath, lyricsToLrc(input.tLrc), 'utf8')
      : Promise.resolve(),
    writeFile(
      metaPath,
      JSON.stringify(
        {
          songId: input.songId,
          jobId: input.jobId,
          providerId: input.providerId,
          title: input.title,
          lyrics: input.lyrics,
          styleTags: input.styleTags,
          prompt: input.prompt,
          variants: input.variants,
          lrc: input.lrc,
          tLrc: input.tLrc,
          persistedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      'utf8',
    ),
  ]);

  // 封面：优先采用 Provider 返回的生成封面；下载失败或缺失时回退本地渐变渲染。
  await clearExistingCover(directory);
  let coverPath: string | null = null;
  const providerImageUrl = input.variants.find((variant) => variant.imageUrl)?.imageUrl;
  if (providerImageUrl) {
    try {
      coverPath = await downloadCoverFile(providerImageUrl, directory);
    } catch (e) {
      console.warn('[media-output] Provider 封面下载失败，回退本地封面:', e instanceof Error ? e.message : String(e));
    }
  }
  if (!coverPath) {
    const fallbackCoverPath = path.join(directory, 'cover.png');
    try {
      await renderCoverPng({
        title: input.title,
        styleTags: input.styleTags ?? [],
        outPath: fallbackCoverPath,
      });
      coverPath = fallbackCoverPath;
    } catch (e) {
      console.warn('[media-output] 封面渲染失败:', e instanceof Error ? e.message : String(e));
    }
  }

  return {
    songId: input.songId,
    directory,
    metaPath,
    lyricsTxtPath,
    lyricsLrcPath,
    lyricsTLrcPath,
    coverPath,
    audioPaths,
  };
}

export async function loadPersistedSong(songId: string): Promise<LoadedSongBundle | null> {
  const directory = songDirectory(songId);
  const metaPath = path.join(directory, 'meta.json');
  try {
    const raw = await readFile(metaPath, 'utf8');
    const meta = JSON.parse(raw) as {
      title?: string;
      lyrics?: string | null;
      styleTags?: string[] | null;
      prompt?: string | null;
      jobId?: string;
      providerId?: string;
      variants?: SongVariant[];
      lrc?: LyricsLine[];
      tLrc?: LyricsLine[];
    };
    const files = await readdir(directory);
    const audioPaths = files
      .filter((file) => /^audio-\d+-.+\.(mp3|wav|flac|m4a)$/i.test(file))
      .map((file, index) => ({
        variantId: meta.variants?.[index]?.id ?? String(index),
        path: path.join(directory, file),
        url: meta.variants?.[index]?.audioUrl ?? '',
      }));

    return {
      songId,
      directory,
      metaPath,
      lyricsTxtPath: path.join(directory, 'lyrics.txt'),
      lyricsLrcPath: path.join(directory, 'lyrics.lrc'),
      lyricsTLrcPath: files.includes('lyrics.t.lrc') ? path.join(directory, 'lyrics.t.lrc') : null,
      coverPath: files.some((file) => COVER_FILE_PATTERN.test(file))
        ? path.join(directory, files.find((file) => COVER_FILE_PATTERN.test(file))!)
        : null,
      audioPaths,
      title: meta.title ?? 'Untitled',
      lyrics: meta.lyrics ?? null,
      styleTags: meta.styleTags ?? null,
      prompt: meta.prompt ?? null,
      jobId: meta.jobId ?? '',
      providerId: meta.providerId ?? '',
      variants: meta.variants ?? [],
      lrc: meta.lrc ?? [],
      tLrc: meta.tLrc ?? [],
    };
  } catch {
    return null;
  }
}
