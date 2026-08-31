"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChatView } from "@/components/chat/chat-view";
import { ProcessingRefresher } from "@/components/song/processing-refresher";
import {
  VISUAL_RECIPE_PRESETS,
  getVisualRecipePreset,
  normalizeVisualRecipe,
  recipeChanged,
  type VisualRecipe,
} from "@/lib/visual-recipe";
import { buildFoliaVisualRecipeUrl } from "@/lib/visual-recipe-to-folia";
import type { GenerationStatus } from "@/lib/generation-state";
import { cn } from "@/lib/utils";
import { ExternalLink, Loader2, RefreshCw, Save } from "lucide-react";

export interface StudioSong {
  id: string;
  title: string;
  status: GenerationStatus;
  progress: number;
  visualRecipe: VisualRecipe | null;
  createdAt: number;
}

export function StudioWorkspace({
  songs,
  foliaBaseUrl,
  hasProcessing,
}: {
  songs: StudioSong[];
  foliaBaseUrl: string;
  hasProcessing: boolean;
}) {
  const initialSong = songs.find((song) => song.status === "completed") ?? songs[0] ?? null;
  const [selectedId, setSelectedId] = useState(initialSong?.id ?? "");
  const selected = songs.find((song) => song.id === selectedId) ?? initialSong;
  const [recipe, setRecipe] = useState<VisualRecipe | null>(initialSong?.visualRecipe ?? null);
  const [savedRecipe, setSavedRecipe] = useState<VisualRecipe | null>(initialSong?.visualRecipe ?? null);
  const [saving, setSaving] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [stageKey, setStageKey] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const doneSongs = useMemo(
    () => songs.filter((song) => song.status === "completed"),
    [songs],
  );
  const activePreset = recipe ? getVisualRecipePreset(recipe.id) : null;
  const stageUrl = useMemo(() => {
    if (!recipe) {
      return `${foliaBaseUrl.replace(/\/$/, "")}?${new URLSearchParams({
        obs: "1",
        obsSource: "now-playing",
        obsTheme: "static",
      }).toString()}`;
    }
    return buildFoliaVisualRecipeUrl(foliaBaseUrl, recipe);
  }, [foliaBaseUrl, recipe]);

  function selectSong(song: StudioSong) {
    setSelectedId(song.id);
    setRecipe(song.visualRecipe);
    setSavedRecipe(song.visualRecipe);
    setMessage(null);
    setError(null);
  }

  function applyPreset(nextId: VisualRecipe["id"]) {
    const preset = getVisualRecipePreset(nextId);
    setRecipe({
      id: preset.id,
      intensity: preset.intensity,
      temperature: preset.temperature,
      chorusImpact: preset.chorusImpact,
    });
  }

  async function saveRecipe() {
    if (!selected || !recipe || saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/songs/${selected.id}/visual-recipe`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? `保存失败（${res.status}）`);
      setSavedRecipe(recipe);
      setMessage("视觉配方已保存");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function pushStage() {
    if (!selected || selected.status !== "completed" || pushing) return;
    setPushing(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/songs/${selected.id}/push-folia`, { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? `推送失败（${res.status}）`);
      setStageKey((key) => key + 1);
      setMessage("已推送到舞台");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPushing(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-8.5rem)] max-w-[1800px] flex-col gap-4 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Studio</h1>
          <p className="text-xs text-muted-foreground">创作、舞台与视觉配方同屏</p>
        </div>
        <div className="flex items-center gap-2">
          {selected && <span className="text-xs text-muted-foreground">{selected.title}</span>}
          <Button variant="outline" size="sm" disabled={!selected || selected.status !== "completed" || pushing} onClick={() => void pushStage()}>
            {pushing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
            推送舞台
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[240px_minmax(0,1fr)_400px]">
        <aside className="min-h-0 overflow-y-auto rounded-lg border bg-card">
          <div className="sticky top-0 border-b bg-card/95 px-4 py-3 text-xs font-medium text-muted-foreground backdrop-blur">
            作品
          </div>
          <div className="divide-y">
            {songs.length === 0 && (
              <p className="px-4 py-6 text-sm text-muted-foreground">先生成一首歌</p>
            )}
            {songs.map((song) => (
              <button
                key={song.id}
                type="button"
                onClick={() => selectSong(song)}
                className={cn(
                  "block w-full px-4 py-3 text-left transition-colors hover:bg-accent",
                  song.id === selected?.id && "bg-accent",
                )}
              >
                <span className="block truncate text-sm font-medium">{song.title}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {song.status === "submitted" || song.status === "generating"
                    ? `生成中 ${song.progress}%`
                    : new Date(song.createdAt).toLocaleDateString()}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="min-h-0 overflow-hidden rounded-lg border bg-card">
          <ChatView recentSongs={doneSongs.length ? doneSongs.slice(0, 8).map((song) => ({
            id: song.id,
            title: song.title,
            styleTags: null,
            status: song.status,
            progress: song.progress,
            variants: null,
            createdAt: song.createdAt,
          })) : undefined} />
        </section>

        <aside className="min-h-0 space-y-4 overflow-y-auto pb-2">
          <section className="overflow-hidden rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="text-sm font-medium">舞台</h2>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="刷新舞台"
                onClick={() => setStageKey((key) => key + 1)}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="relative aspect-video bg-black">
              <iframe
                key={stageKey}
                src={stageUrl}
                title="Folia Stage"
                className="absolute inset-0 h-full w-full border-0"
                allow="autoplay; clipboard-read; clipboard-write"
              />
            </div>
          </section>

          <section className="rounded-lg border bg-card p-4">
            <h2 className="text-sm font-medium">视觉配方</h2>
            <div className="mt-3 grid gap-2">
              {VISUAL_RECIPE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  className={cn(
                    "flex min-h-16 items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-accent",
                    recipe?.id === preset.id && "border-primary/60 bg-accent",
                  )}
                >
                  <span className="flex h-9 w-9 shrink-0 rounded-md" style={{ background: `linear-gradient(135deg, ${preset.colors[0]}, ${preset.colors[1]})` }} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{preset.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{preset.cue}</span>
                  </span>
                </button>
              ))}
            </div>

            {recipe && activePreset && (
              <div className="mt-4 space-y-3">
                {[
                  { label: "能量", value: recipe.intensity, min: 0, max: 100 },
                  { label: "色温", value: recipe.temperature, min: -20, max: 20 },
                  { label: "高潮氛围", value: recipe.chorusImpact, min: 0, max: 100 },
                ].map((field) => (
                  <label key={field.label} className="block">
                    <span className="flex items-center justify-between text-xs text-muted-foreground">
                      {field.label}
                      <span className="tabular-nums text-foreground">{field.value}</span>
                    </span>
                    <input
                      type="range"
                      min={field.min}
                      max={field.max}
                      value={field.value}
                      onChange={(e) =>
                        setRecipe(normalizeVisualRecipe({
                          ...recipe,
                          [field.label === "能量" ? "intensity" : field.label === "色温" ? "temperature" : "chorusImpact"]: Number(e.target.value),
                        }))
                      }
                      className="mt-1 h-2 w-full accent-primary"
                    />
                  </label>
                ))}
              </div>
            )}

            <div className="mt-4 flex items-center justify-between gap-2">
              <span className="truncate text-xs text-muted-foreground">
                {selected ? selected.title : "没有可选歌曲"}
              </span>
              <Button size="sm" disabled={!selected || !recipe || saving || !recipeChanged(savedRecipe, recipe)} onClick={() => void saveRecipe()}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                保存
              </Button>
            </div>
          </section>
        </aside>
      </div>

      {message && <p className="text-xs text-primary">{message}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <ProcessingRefresher hasProcessing={hasProcessing} />
    </div>
  );
}
