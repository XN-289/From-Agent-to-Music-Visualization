"use client";

import {
  getVisualRecipePreset,
  recipeChanged,
  type VisualRecipe,
} from "@/lib/visual-recipe";
import { cn } from "@/lib/utils";

export type VisualRecipeSaveState = "empty" | "draft" | "saving" | "saved" | "failed";

export function getVisualRecipeSaveState({
  recipe,
  savedRecipe,
  saving,
  error,
}: {
  recipe: VisualRecipe | null;
  savedRecipe: VisualRecipe | null;
  saving: boolean;
  error: string | null;
}): VisualRecipeSaveState {
  if (!recipe) return "empty";
  if (saving) return "saving";
  if (error) return "failed";
  return recipeChanged(savedRecipe, recipe) ? "draft" : "saved";
}

export function visualExpectationTraits(recipe: VisualRecipe): string[] {
  return [
    recipe.intensity >= 67 ? "高能量" : recipe.intensity >= 34 ? "中能量" : "低能量",
    recipe.temperature > 7 ? "暖色" : recipe.temperature < -7 ? "冷色" : "自然色",
    recipe.chorusImpact >= 67 ? "强副歌" : recipe.chorusImpact >= 34 ? "中副歌" : "轻副歌",
  ];
}

export function visualRecipeDeltas(
  savedRecipe: VisualRecipe | null,
  recipe: VisualRecipe,
): string[] {
  const deltas: string[] = [];
  if (savedRecipe?.id !== recipe.id) {
    const from = savedRecipe ? getVisualRecipePreset(savedRecipe.id).name : "默认画面";
    deltas.push(`预设：${from} → ${getVisualRecipePreset(recipe.id).name}`);
  }
  if (savedRecipe) {
    const fields: Array<{ label: string; from: number; to: number }> = [
      { label: "能量", from: savedRecipe.intensity, to: recipe.intensity },
      { label: "色温", from: savedRecipe.temperature, to: recipe.temperature },
      { label: "高潮氛围", from: savedRecipe.chorusImpact, to: recipe.chorusImpact },
    ];
    for (const field of fields) {
      if (field.from === field.to) continue;
      const sign = field.to > field.from ? "+" : "";
      deltas.push(`${field.label} ${sign}${field.to - field.from}`);
    }
  }
  return deltas;
}

export function VisualRecipeExpectation({
  recipe,
  savedRecipe,
  saving,
  error,
}: {
  recipe: VisualRecipe | null;
  savedRecipe: VisualRecipe | null;
  saving: boolean;
  error: string | null;
}) {
  const preset = recipe ? getVisualRecipePreset(recipe.id) : null;
  const state = getVisualRecipeSaveState({ recipe, savedRecipe, saving, error });
  const deltas = recipe ? visualRecipeDeltas(savedRecipe, recipe) : [];

  return (
    <div data-recipe-save-state={state} className="mt-3 border-t pt-3" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className={cn("h-10 w-10 shrink-0 rounded-md", !preset && "border bg-muted")}
            style={
              preset
                ? { background: `linear-gradient(135deg, ${preset.colors[0]}, ${preset.colors[1]})` }
                : undefined
            }
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {preset ? preset.name : "等待歌曲生成"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {recipe ? visualExpectationTraits(recipe).join(" · ") : "暂无视觉期待"}
            </p>
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium",
            state === "draft" && "border-primary/40 text-primary",
            state === "saving" && "text-muted-foreground",
            state === "saved" && "border-emerald-500/40 text-emerald-600 dark:text-emerald-300",
            state === "failed" && "border-destructive/40 text-destructive",
          )}
        >
          {state === "empty" && "未设置"}
          {state === "draft" && "未保存"}
          {state === "saving" && "保存中"}
          {state === "saved" && "已保存"}
          {state === "failed" && "保存失败"}
        </span>
      </div>

      {deltas.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="与已保存配方的差异">
          {deltas.map((delta) => (
            <li
              key={delta}
              className="rounded border bg-background/70 px-2 py-1 text-[11px] text-muted-foreground"
            >
              {delta}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
