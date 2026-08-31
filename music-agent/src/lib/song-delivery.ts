import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import type { LyricsLine } from '@/lib/audio/lrc';
import {
  loadPersistedSong,
  persistGeneratedSong,
  type LoadedSongBundle,
} from '@/lib/media-output';
import {
  checkFoliaStage,
  pushSongToFolia,
  type FoliaStagePushResult,
} from '@/lib/folia-stage';
import { normalizeVisualRecipe, recipeChanged } from '@/lib/visual-recipe';
import type { StageDeliveryStatus } from '@/lib/db/schema';

export interface SongDeliveryResult {
  bundle: LoadedSongBundle | null;
  stage: FoliaStagePushResult | null;
  stageSkippedReason?: string;
  stageDeliveryStatus?: StageDeliveryStatus;
  stageDeliveryError?: string | null;
}

const deliveryQueues = new Map<string, Promise<SongDeliveryResult>>();

async function markStageDelivery(
  songId: string,
  status: StageDeliveryStatus,
  error: string | null,
  expectedRecipeUpdatedAt?: Date,
): Promise<boolean> {
  const rows = await db
    .update(schema.songs)
    .set({
      stageDeliveryStatus: status,
      stageDeliveryError: error,
      stageDeliveryUpdatedAt: new Date(),
    })
    .where(
      expectedRecipeUpdatedAt
        ? and(
            eq(schema.songs.id, songId),
            eq(schema.songs.updatedAt, expectedRecipeUpdatedAt),
          )
        : eq(schema.songs.id, songId),
    )
    .returning({ id: schema.songs.id })
    .all();
  return rows.length > 0;
}

export async function ensureLocalSong(songId: string): Promise<LoadedSongBundle | null> {
  const existing = await loadPersistedSong(songId);
  if (existing?.audioPaths.length) return existing;

  const song = (await db.select().from(schema.songs).where(eq(schema.songs.id, songId)))[0];
  if (!song || song.status !== 'completed' || !song.variants?.length) return null;

  let lrc: LyricsLine[] = [];
  if (song.lyricsLrc) {
    try {
      lrc = JSON.parse(song.lyricsLrc) as LyricsLine[];
    } catch {
      lrc = [];
    }
  }

  let tLrc: LyricsLine[] = [];
  if (song.lyricsTlrc) {
    try {
      tLrc = JSON.parse(song.lyricsTlrc) as LyricsLine[];
    } catch {
      tLrc = [];
    }
  }

  const job = (
    await db.select().from(schema.generationJobs).where(eq(schema.generationJobs.songId, songId))
  )[0];

  await persistGeneratedSong({
    songId,
    title: song.title,
    lyrics: song.lyrics,
    styleTags: song.styleTags,
    prompt: song.prompt,
    jobId: job?.id ?? '',
    providerId: job?.providerId ?? '',
    variants: song.variants,
    lrc,
    tLrc,
  });

  return loadPersistedSong(songId);
}

async function deliverSongLocked(
  songId: string,
  opts: { pushToFolia?: boolean },
): Promise<SongDeliveryResult> {
  const pushToFolia = opts.pushToFolia ?? true;
  const bundle = await ensureLocalSong(songId);
  if (!bundle) {
    const error = '歌曲尚未完成或没有可交付音频';
    await markStageDelivery(songId, 'needs_retry', error);
    return {
      bundle: null,
      stage: null,
      stageSkippedReason: error,
      stageDeliveryStatus: 'needs_retry',
      stageDeliveryError: error,
    };
  }

  if (!pushToFolia) return { bundle, stage: null, stageSkippedReason: '仅本地落盘' };

  const health = await checkFoliaStage();
  if (!health.available) {
    const error = health.error ?? 'Folia Stage 未启用或不可达';
    await markStageDelivery(songId, 'needs_retry', error);
    return {
      bundle,
      stage: null,
      stageSkippedReason: error,
      stageDeliveryStatus: 'needs_retry',
      stageDeliveryError: error,
    };
  }

  const song = (
    await db
      .select({ visualRecipe: schema.songs.visualRecipe, updatedAt: schema.songs.updatedAt })
      .from(schema.songs)
      .where(eq(schema.songs.id, songId))
  )[0];
  const recipe = normalizeVisualRecipe(song?.visualRecipe ?? null);
  let stage: FoliaStagePushResult;
  try {
    stage = await pushSongToFolia(bundle, recipe);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await markStageDelivery(songId, 'needs_retry', error);
    throw e;
  }

  if (!stage.ok) {
    const error = stage.error ?? 'Folia Stage 推送失败';
    await markStageDelivery(songId, 'needs_retry', error);
    return {
      bundle,
      stage,
      stageDeliveryStatus: 'needs_retry',
      stageDeliveryError: error,
    };
  }

  const latest = (
    await db
      .select({ visualRecipe: schema.songs.visualRecipe, updatedAt: schema.songs.updatedAt })
      .from(schema.songs)
      .where(eq(schema.songs.id, songId))
  )[0];
  const latestRecipe = normalizeVisualRecipe(latest?.visualRecipe ?? null);
  const staleRecipe =
    recipeChanged(recipe, latestRecipe) ||
    latest?.updatedAt?.getTime() !== song?.updatedAt?.getTime();
  if (staleRecipe) {
    const error = '视觉配方在推送期间更新，请重推当前配方';
    await markStageDelivery(songId, 'needs_retry', error);
    return {
      bundle,
      stage,
      stageDeliveryStatus: 'needs_retry',
      stageDeliveryError: error,
    };
  }

  const markedPushed = await markStageDelivery(songId, 'pushed', null, song?.updatedAt);
  if (!markedPushed) {
    const error = '视觉配方在推送期间更新，请重推当前配方';
    await markStageDelivery(songId, 'needs_retry', error);
    return {
      bundle,
      stage,
      stageDeliveryStatus: 'needs_retry',
      stageDeliveryError: error,
    };
  }
  return {
    bundle,
    stage,
    stageDeliveryStatus: 'pushed',
    stageDeliveryError: null,
  };
}

export async function deliverSong(
  songId: string,
  opts: { pushToFolia?: boolean } = {},
): Promise<SongDeliveryResult> {
  const previous = deliveryQueues.get(songId) ?? Promise.resolve(null);
  const pending = previous
    .catch(() => null)
    .then(() => deliverSongLocked(songId, opts));
  deliveryQueues.set(songId, pending);
  try {
    return await pending;
  } finally {
    if (deliveryQueues.get(songId) === pending) deliveryQueues.delete(songId);
  }
}

/** 生成完成后的非阻塞自动交付：进程内只跑一次，避免多个轮询请求重复上传。 */
export function queueAutoDelivery(songId: string): void {
  if (deliveryQueues.has(songId)) return;
  const pending = deliverSong(songId, { pushToFolia: true })
    .then((result) => {
      if (result.stage && !result.stage.ok) {
        console.warn(`[song-delivery] Folia 推送未完成: ${result.stage.error}`);
      } else if (result.stageSkippedReason) {
        console.warn(`[song-delivery] 跳过 Folia 推送: ${result.stageSkippedReason}`);
      }
      return result;
    })
    .catch((e) => {
      console.warn('[song-delivery] 自动交付失败:', e instanceof Error ? e.message : String(e));
      return { bundle: null, stage: null, stageSkippedReason: '自动交付异常' };
    })
    .finally(() => {
      if (deliveryQueues.get(songId) === pending) deliveryQueues.delete(songId);
    });
  deliveryQueues.set(songId, pending);
}
