import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { getProvider } from '@/lib/providers';
import {
  buildTranslationLines,
  coaxAlignedLyrics,
  makeLrc,
  parseLyricLines,
  type LyricsLine,
} from '@/lib/audio/lrc';
import { persistValidatedGeneratedSong } from '@/lib/media-output';
import {
  isTerminalGenerationStatus,
  nextActiveGenerationStatus,
  providerJobState,
} from '@/lib/generation-state';
import { checkRateLimit, clientIp } from '@/lib/rate-limit';
import { queueAutoDelivery } from '@/lib/song-delivery';

export const dynamic = 'force-dynamic';

function failCompletion(jobId: string, songId: string, error: string): boolean {
  const now = new Date();
  return db.transaction((tx) => {
    const failedJobs = tx.update(schema.generationJobs)
      .set({ status: 'failed', updatedAt: now })
      .where(
        and(
          eq(schema.generationJobs.id, jobId),
          inArray(schema.generationJobs.status, ['submitted', 'generating']),
        ),
      )
      .returning({ id: schema.generationJobs.id })
      .all();
    if (failedJobs.length === 0) return false;

    tx.update(schema.songs)
      .set({ status: 'failed', error, updatedAt: now })
      .where(
        and(
          eq(schema.songs.id, songId),
          inArray(schema.songs.status, ['draft', 'submitted', 'generating']),
        ),
      )
      .run();
    return true;
  });
}

// 轮询端点：前端 GenerationCard / 歌曲详情页轮询 job 进度；
// 任务完成或失败时把结果落库（幂等），返回 { job, song }。
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // 轮询也会打上游 record-info：限流防滥用（对抗性检验 M6）
  const rl = checkRateLimit(`jobs:${clientIp(req)}`, { limit: 120, windowMs: 60_000 });
  if (!rl.ok) {
    return Response.json({ error: '请求太频繁' }, { status: 429 });
  }
  const jobRow = (
    await db.select().from(schema.generationJobs).where(eq(schema.generationJobs.id, id))
  )[0];

  if (jobRow && isTerminalGenerationStatus(jobRow.status)) {
    const song = (
      await db.select().from(schema.songs).where(eq(schema.songs.id, jobRow.songId))
    )[0];
    return Response.json({
      job: {
        id: jobRow.id,
        status: jobRow.status,
        progress: song?.progress ?? 100,
        stage: song?.stage ?? '',
        error: song?.error,
      },
      song: song ?? null,
    });
  }

  const provider = getProvider();
  const job = await provider.getJob(id);

  if (jobRow) {
    const now = new Date();
    const lifecycleStatus = providerJobState(job.status);

    if (lifecycleStatus === 'completed') {
      if (!job.result || job.result.length === 0) {
        // 成功但无结果（上游形状异常等）：标记失败，避免歌曲永远卡在生成中
        failCompletion(id, jobRow.songId, '生成完成但未返回音频');
      } else {
        const songRow = (
          await db.select().from(schema.songs).where(eq(schema.songs.id, jobRow.songId))
        )[0];
        if (songRow && (songRow.status === 'submitted' || songRow.status === 'generating')) {
          const generatingStatus = nextActiveGenerationStatus(songRow.status, 'processing');
          await db
            .update(schema.songs)
            .set({ status: generatingStatus, updatedAt: now })
            .where(
              and(
                eq(schema.songs.id, jobRow.songId),
                inArray(schema.songs.status, ['submitted', 'generating']),
              ),
            );
          await db
            .update(schema.generationJobs)
            .set({ status: 'generating', updatedAt: now })
            .where(
              and(
                eq(schema.generationJobs.id, jobRow.id),
                inArray(schema.generationJobs.status, ['submitted', 'generating']),
              ),
            );
          const durationSec = job.result[0].durationSec;
          // 词级对齐优先（真实后端），失败/不支持时回退均分行
          let lrc: LyricsLine[] = [];
          try {
            const aligned = await provider.getTimestampedLyrics?.(
              jobRow.id,
              job.result[0].audioId ?? '',
            );
            // 共轴：上游 ASR 行（文本漂移/混入结构标记）→ 用户写的主歌词文本 + 真实时间戳
            if (aligned && aligned.length > 0) {
              lrc = coaxAlignedLyrics(songRow.lyrics ?? '', aligned);
            }
          } catch {
            // 回退
          }
          if (lrc.length === 0 && durationSec > 0) {
            lrc = makeLrc(parseLyricLines(songRow.lyrics ?? ''), durationSec);
          }
          // 翻译共轴：主歌词行序映射（真实对齐优先；行数不一致按 min 截断，Task 10 验收核对）
          const tLrc = lrc.length
            ? buildTranslationLines(songRow.lyrics ?? '', lrc)
            : [];
          let issues: string[] = [];
          let bundleReady = false;
          try {
            const persisted = await persistValidatedGeneratedSong({
              songId: jobRow.songId,
              title: songRow.title,
              lyrics: songRow.lyrics,
              styleTags: songRow.styleTags,
              prompt: songRow.prompt,
              jobId: jobRow.id,
              providerId: jobRow.providerId,
              variants: job.result,
              lrc,
              tLrc,
            });
            issues = persisted.issues;
            bundleReady = Boolean(persisted.bundle);
          } catch (e) {
            issues = ['产物落盘失败', e instanceof Error ? e.message : String(e)];
          }

          if (!bundleReady || issues.length > 0) {
            failCompletion(id, jobRow.songId, `生成产物不完整：${issues.join('；')}`);
          } else {
            // 守卫更新：歌曲与任务同事务进入终态，晚到/并发轮询不能改写结果。
            const completed = db.transaction((tx) => {
              const completedSongs = tx.update(schema.songs)
                .set({
                  status: 'completed',
                  progress: 100,
                  stage: job.stage,
                  variants: job.result,
                  lyricsLrc: lrc.length ? JSON.stringify(lrc) : null,
                  lyricsTlrc: tLrc.length ? JSON.stringify(tLrc) : null,
                  error: null,
                  updatedAt: now,
                })
                .where(
                  and(
                    eq(schema.songs.id, jobRow.songId),
                    inArray(schema.songs.status, ['submitted', 'generating']),
                  ),
                )
                .returning({ id: schema.songs.id })
                .all();
              if (completedSongs.length === 0) return false;

              tx.update(schema.generationJobs)
                .set({ status: 'completed', updatedAt: now })
                .where(
                  and(
                    eq(schema.generationJobs.id, jobRow.id),
                    inArray(schema.generationJobs.status, ['submitted', 'generating']),
                  ),
                )
                .run();
              return true;
            });

            if (completed) {
              // 自动交付只在生成完成时触发一次，避免阻塞 job 轮询响应。
              queueAutoDelivery(jobRow.songId);
            }
          }
        }
      }
    } else if (lifecycleStatus === 'failed') {
      failCompletion(id, jobRow.songId, job.error ?? '生成失败');
    } else {
      await db
        .update(schema.generationJobs)
        .set({ status: lifecycleStatus, updatedAt: now })
        .where(eq(schema.generationJobs.id, id));
      // 处理中：同步进度（进度只增不减，避免瞬时网络错误回退进度条）
      const songRow = (
        await db.select().from(schema.songs).where(eq(schema.songs.id, jobRow.songId))
      )[0];
      if (songRow && (songRow.status === 'submitted' || songRow.status === 'generating')) {
        const nextStatus = nextActiveGenerationStatus(songRow.status, job.status);
        const nextProgress = Math.max(songRow.progress, job.progress);
        await db
          .update(schema.songs)
          .set({
            status: nextStatus,
            progress: nextProgress,
            stage: job.stage,
            updatedAt: now,
          })
          .where(
            and(
              eq(schema.songs.id, jobRow.songId),
              inArray(schema.songs.status, ['submitted', 'generating']),
            ),
          );
      }
    }
  }

  const finalJobRow = jobRow
    ? (await db.select().from(schema.generationJobs).where(eq(schema.generationJobs.id, id)))[0]
    : null;
  const song = jobRow
    ? (await db.select().from(schema.songs).where(eq(schema.songs.id, jobRow.songId)))[0] ?? null
    : null;

  return Response.json({
    job: {
      id: finalJobRow?.id ?? job.id,
      status: finalJobRow?.status ?? providerJobState(job.status),
      progress: song?.progress ?? job.progress,
      stage: song?.stage ?? job.stage,
      error: song?.error ?? job.error,
    },
    song,
  });
}
