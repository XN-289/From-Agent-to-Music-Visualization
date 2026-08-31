import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { VisualRecipe } from "@/lib/visual-recipe";
import {
  VisualRecipeExpectation,
  getVisualRecipeSaveState,
  visualExpectationTraits,
  visualRecipeDeltas,
} from "./visual-recipe-expectation";

const saved: VisualRecipe = {
  id: "rain-window",
  intensity: 40,
  temperature: -8,
  chorusImpact: 50,
};

const draft: VisualRecipe = {
  id: "livehouse",
  intensity: 80,
  temperature: 10,
  chorusImpact: 90,
};

describe("visual recipe expectation", () => {
  it("turns recipe values into user-facing expectation traits", () => {
    expect(visualExpectationTraits(draft)).toEqual(["高能量", "暖色", "强副歌"]);
    expect(visualExpectationTraits(saved)).toEqual(["中能量", "冷色", "中副歌"]);
  });

  it("shows the exact difference from the saved expectation", () => {
    expect(visualRecipeDeltas(saved, draft)).toEqual([
      "预设：雨窗民谣 → Livehouse 现场",
      "能量 +40",
      "色温 +18",
      "高潮氛围 +40",
    ]);
  });

  it("covers the save state matrix", () => {
    expect(getVisualRecipeSaveState({ recipe: null, savedRecipe: null, saving: false, error: null })).toBe("empty");
    expect(getVisualRecipeSaveState({ recipe: draft, savedRecipe: saved, saving: false, error: null })).toBe("draft");
    expect(getVisualRecipeSaveState({ recipe: draft, savedRecipe: saved, saving: true, error: null })).toBe("saving");
    expect(getVisualRecipeSaveState({ recipe: draft, savedRecipe: draft, saving: false, error: null })).toBe("saved");
    expect(getVisualRecipeSaveState({ recipe: draft, savedRecipe: draft, saving: false, error: "保存失败" })).toBe("failed");
  });

  it("renders the draft state and its visible deltas", () => {
    const html = renderToStaticMarkup(
      createElement(VisualRecipeExpectation, {
        recipe: draft,
        savedRecipe: saved,
        saving: false,
        error: null,
      }),
    );
    expect(html).toContain("Livehouse 现场");
    expect(html).toContain("高能量 · 暖色 · 强副歌");
    expect(html).toContain("未保存");
    expect(html).toContain("能量 +40");
  });

  it("renders the saved state without draft deltas", () => {
    const html = renderToStaticMarkup(
      createElement(VisualRecipeExpectation, {
        recipe: draft,
        savedRecipe: draft,
        saving: false,
        error: null,
      }),
    );
    expect(html).toContain("已保存");
    expect(html).not.toContain("未保存");
    expect(html).not.toContain("能量 +");
  });
});
