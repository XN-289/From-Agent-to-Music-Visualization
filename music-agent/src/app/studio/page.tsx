import { desc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { foliaWebUrl } from "@/lib/folia-stage";
import { normalizeVisualRecipe } from "@/lib/visual-recipe";
import { StudioWorkspace, type StudioSong } from "@/components/studio/studio-workspace";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const rows = await db.select().from(schema.songs).orderBy(desc(schema.songs.createdAt)).limit(50);
  const songs: StudioSong[] = rows.map((song) => ({
    id: song.id,
    title: song.title,
    status: song.status,
    progress: song.progress,
    visualRecipe: normalizeVisualRecipe(song.visualRecipe),
    createdAt: song.createdAt.getTime(),
  }));

  const hasProcessing = songs.some(
    (song) => song.status === "submitted" || song.status === "generating",
  );

  return <StudioWorkspace songs={songs} foliaBaseUrl={foliaWebUrl()} hasProcessing={hasProcessing} />;
}
