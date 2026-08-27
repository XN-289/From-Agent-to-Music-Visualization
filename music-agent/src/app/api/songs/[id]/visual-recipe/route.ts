import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { normalizeVisualRecipe } from '@/lib/visual-recipe';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const recipe = normalizeVisualRecipe(body?.recipe ?? body);
  if (!recipe) {
    return Response.json({ ok: false, error: '视觉配方不合法' }, { status: 400 });
  }

  const song = (await db.select({ id: schema.songs.id }).from(schema.songs).where(eq(schema.songs.id, id)))[0];
  if (!song) {
    return Response.json({ ok: false, error: '歌曲不存在' }, { status: 404 });
  }

  const now = new Date();
  await db
    .update(schema.songs)
    .set({ visualRecipe: recipe, updatedAt: now })
    .where(eq(schema.songs.id, id));

  return Response.json({ ok: true, recipe });
}
