import { readFile } from 'node:fs/promises';
import { loadPersistedSong } from '@/lib/media-output';
import { coverMimeForPath } from '@/lib/media-mime';

export const dynamic = 'force-dynamic';

// 封面 PNG 直出：曲库卡片与详情页 <img> 使用；缺文件返回 404（前端回退渐变）。
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await loadPersistedSong(id);
  if (!bundle?.coverPath) return new Response('Not Found', { status: 404 });
  try {
    const bytes = await readFile(bundle.coverPath);
    return new Response(new Uint8Array(bytes), {
      headers: { 'Content-Type': coverMimeForPath(bundle.coverPath), 'Cache-Control': 'public, max-age=3600' },
    });
  } catch {
    return new Response('Not Found', { status: 404 });
  }
}
