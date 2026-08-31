import { eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { deliverSong } from '@/lib/song-delivery';
import {
  cancelFoliaExport,
  getFoliaExportStatus,
  startFoliaExport,
  type FoliaStageExportResult,
} from '@/lib/folia-stage';
import { normalizeVisualRecipe, recipeChanged } from '@/lib/visual-recipe';

export const dynamic = 'force-dynamic';

type StageResult<T> = FoliaStageExportResult<T>;

function stageError<T>(
  result: StageResult<T>,
  fallback: string,
): Response {
  const status = result.status && result.status >= 400 && result.status <= 599 ? result.status : 502;
  return Response.json(
    { ok: false, error: result.error ?? fallback, code: result.code },
    { status },
  );
}

async function getExistingSong(id: string) {
  return (
    await db
      .select({
        id: schema.songs.id,
        status: schema.songs.status,
        visualRecipe: schema.songs.visualRecipe,
        updatedAt: schema.songs.updatedAt,
      })
      .from(schema.songs)
      .where(eq(schema.songs.id, id))
  )[0];
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { recipe?: unknown } | null;
  if (body?.recipe !== undefined) {
    if (!normalizeVisualRecipe(body.recipe)) {
      return Response.json({ ok: false, error: '导出配方不合法' }, { status: 400 });
    }
  }

  const song = await getExistingSong(id);
  if (!song) return Response.json({ ok: false, error: '歌曲不存在' }, { status: 404 });
  if (song.status !== 'completed') {
    return Response.json({ ok: false, error: '歌曲尚未完成，无法导出' }, { status: 409 });
  }

  const savedRecipe = normalizeVisualRecipe(song.visualRecipe);
  if (!savedRecipe) {
    return Response.json(
      { ok: false, error: '请先在 Studio 保存视觉配方，再导出视频' },
      { status: 409 },
    );
  }
  if (body?.recipe !== undefined && recipeChanged(normalizeVisualRecipe(body.recipe), savedRecipe)) {
    return Response.json(
      { ok: false, error: '视觉配方尚未保存，请先保存当前期待' },
      { status: 409 },
    );
  }

  const activeJob = (
    await db
      .select({ id: schema.generationJobs.id })
      .from(schema.generationJobs)
      .where(inArray(schema.generationJobs.status, ['submitted', 'generating']))
      .limit(1)
  )[0];
  if (activeJob) {
    return Response.json(
      { ok: false, error: '仍有歌曲在生成中，请等待生成完成后再导出' },
      { status: 409 },
    );
  }

  const currentExport = await getFoliaExportStatus();
  if (!currentExport.ok) return stageError(currentExport, 'Folia Stage 导出状态不可用');
  if (currentExport.data?.job?.status === 'running') {
    if (currentExport.data.job.songId === id) {
      return Response.json({ ok: true, job: currentExport.data.job, alreadyRunning: true });
    }
    return Response.json(
      { ok: false, error: '另一个 Folia 导出正在进行中' },
      { status: 409 },
    );
  }

  let delivery;
  try {
    delivery = await deliverSong(id, { pushToFolia: true });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
  if (!delivery.bundle) {
    return Response.json(
      { ok: false, error: delivery.stageSkippedReason ?? '歌曲尚未完成，无法导出' },
      { status: 409 },
    );
  }
  const mediaSession = delivery.stage?.stage?.mediaSession;
  if (!delivery.stage?.ok || !mediaSession?.id) {
    return Response.json(
      {
        ok: false,
        error: delivery.stageDeliveryError ?? delivery.stage?.error ?? 'Folia Stage 推送失败',
      },
      { status: delivery.stage ? 502 : 503 },
    );
  }

  const latest = await getExistingSong(id);
  if (
    !latest ||
    latest.status !== 'completed' ||
    recipeChanged(savedRecipe, normalizeVisualRecipe(latest.visualRecipe)) ||
    latest.updatedAt.getTime() !== song.updatedAt.getTime()
  ) {
    return Response.json(
      { ok: false, error: '视觉配方在导出前更新，请保存后再试' },
      { status: 409 },
    );
  }

  const started = await startFoliaExport(id, mediaSession.id);
  if (!started.ok || !started.data?.job) {
    return stageError(started, 'Folia Stage 导出启动失败');
  }
  return Response.json({ ok: true, job: started.data.job }, { status: 202 });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const song = await getExistingSong(id);
  if (!song) return Response.json({ ok: false, error: '歌曲不存在' }, { status: 404 });

  const status = await getFoliaExportStatus();
  if (!status.ok) return stageError(status, 'Folia Stage 导出状态不可用');
  if (status.data?.job && status.data.job.songId !== id) {
    return Response.json(
      { ok: false, error: '当前 Stage 导出属于另一首歌曲' },
      { status: 409 },
    );
  }
  return Response.json({ ok: true, job: status.data?.job ?? null });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const song = await getExistingSong(id);
  if (!song) return Response.json({ ok: false, error: '歌曲不存在' }, { status: 404 });

  const current = await getFoliaExportStatus();
  if (!current.ok) return stageError(current, 'Folia Stage 导出状态不可用');
  if (current.data?.job && current.data.job.songId !== id) {
    return Response.json(
      { ok: false, error: '当前 Stage 导出属于另一首歌曲' },
      { status: 409 },
    );
  }
  if (current.data?.job?.status !== 'running') {
    return Response.json({ ok: true, job: current.data?.job ?? null });
  }

  const cancelled = await cancelFoliaExport();
  if (!cancelled.ok) return stageError(cancelled, 'Folia Stage 导出取消失败');
  return Response.json({ ok: true, job: cancelled.data?.job ?? null });
}
