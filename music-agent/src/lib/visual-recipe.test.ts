import { describe, expect, it } from "vitest";
import {
  VISUAL_RECIPE_PRESETS,
  normalizeVisualRecipe,
  recipeChanged,
  visualRecipeAmbience,
  visualRecipeFilter,
} from "./visual-recipe";

describe("visual recipe", () => {
  it("keeps the three v2 direction presets distinct", () => {
    expect(VISUAL_RECIPE_PRESETS.map((preset) => preset.id)).toEqual([
      "neon-night",
      "rain-window",
      "livehouse",
    ]);
  });

  it("normalizes and clamps user input", () => {
    expect(
      normalizeVisualRecipe({ id: "neon-night", intensity: 180, temperature: -80, chorusImpact: -12 }),
    ).toEqual({ id: "neon-night", intensity: 100, temperature: -20, chorusImpact: 0 });

    expect(normalizeVisualRecipe({ id: "unknown", intensity: 50, temperature: 0, chorusImpact: 50 })).toBeNull();
    expect(normalizeVisualRecipe("neon-night")).toBeNull();
  });

  it("builds bounded stage filter and ambience styles", () => {
    const recipe = normalizeVisualRecipe({ id: "livehouse", intensity: 80, temperature: 10, chorusImpact: 90 });
    expect(recipe).not.toBeNull();
    if (!recipe) return;

    expect(visualRecipeFilter(recipe)).toMatch(/^saturate\(\d+%\) contrast\(\d+%\) brightness\(\d+%\) hue-rotate\(-?\d+deg\)$/);
    expect(visualRecipeAmbience(recipe).opacity).toBeLessThanOrEqual(0.58);
  });

  it("detects meaningful recipe edits", () => {
    const base = { id: "rain-window" as const, intensity: 40, temperature: -8, chorusImpact: 50 };
    expect(recipeChanged(base, { ...base })).toBe(false);
    expect(recipeChanged(base, { ...base, chorusImpact: 51 })).toBe(true);
  });
});
