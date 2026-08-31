import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { getFoliaExportStatus, openFoliaExportFolder, type FoliaStageExportResult } from '@/lib/folia-stage';

export const dynamic = 'force-dynamic';

function stageError<T>(result: FoliaStageExportResult<T>, fallback: string): Response {
  const status = result.status && result.status >= 400 && result.status <= 599 ? result.status : 502;
  return Response.json(
    { ok: false, error: result.error ?? fallback, code: result.code },
    { status },
  );
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const song = (
    await db.select({ id: schema.songs.id }).from(schema.songs).where(eq(schema.songs.id, id))
  )[0];
  if (!song) return Response.json({ ok: false, error: '歌曲不存在' }, { status: 404 });

  const current = await getFoliaExportStatus();
  if (!current.ok) return stageError(current, 'Folia Stage 导出状态不可用');
  if (current.data?.job && current.data.job.songId !== id) {
    return Response.json(
      { ok: false, error: '当前 Stage 导出属于另一首歌曲' },
      { status: 409 },
    );
  }

  const opened = await openFoliaExportFolder();
  if (!opened.ok) return stageError(opened, 'Folia 导出目录打开失败');
  return Response.json({ ok: true, opened: true, job: opened.data?.job });
}
