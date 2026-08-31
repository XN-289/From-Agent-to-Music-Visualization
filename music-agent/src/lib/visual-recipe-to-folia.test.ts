import { describe, expect, it } from "vitest";
import { getVisualRecipePreset, type VisualRecipe } from "./visual-recipe";
import {
  buildFoliaVisualConfig,
  buildFoliaVisualRecipeUrl,
  decodeFoliaThemeConfig,
  encodeFoliaThemeConfig,
} from "./visual-recipe-to-folia";

function presetRecipe(id: VisualRecipe["id"]): VisualRecipe {
  const preset = getVisualRecipePreset(id);
  return {
    id: preset.id,
    intensity: preset.intensity,
    temperature: preset.temperature,
    chorusImpact: preset.chorusImpact,
  };
}

describe("visual recipe to Folia appearance", () => {
  it("builds the complete contract config for all three presets", () => {
    const theme = (
      name: string,
      background: string,
      primary: string,
      accent: string,
      secondary: string,
      animationIntensity: "calm" | "normal" | "chaotic",
    ) => ({
      name,
      backgroundColor: background,
      primaryColor: primary,
      accentColor: accent,
      secondaryColor: secondary,
      fontStyle: "sans",
      animationIntensity,
    });

    expect(buildFoliaVisualConfig(presetRecipe("livehouse"))).toStrictEqual({
      theme: {
        light: theme("Music Agent / Livehouse", "#100906", "#f97316", "#ef4444", "#d5b39b", "chaotic"),
        dark: theme("Music Agent / Livehouse", "#100906", "#f97316", "#ef4444", "#d5b39b", "chaotic"),
      },
      visualizerMode: "partita",
      visualizerBackgroundMode: "latent",
      backgroundOpacity: 0.77,
      visualizerOpacity: 0.96,
      useCoverColorBg: false,
      disableVisualizerGeometricBackground: true,
      disableVisualizerVignette: false,
    });

    expect(buildFoliaVisualConfig(presetRecipe("rain-window"))).toStrictEqual({
      theme: {
        light: theme("Music Agent / Rain Window", "#071014", "#67e8f9", "#a5b4fc", "#a8c0cc", "normal"),
        dark: theme("Music Agent / Rain Window", "#071014", "#67e8f9", "#a5b4fc", "#a8c0cc", "normal"),
      },
      visualizerMode: "monet",
      visualizerBackgroundMode: "monet",
      backgroundOpacity: 0.59,
      visualizerOpacity: 0.86,
      useCoverColorBg: false,
      disableVisualizerGeometricBackground: true,
      disableVisualizerVignette: true,
    });

    expect(buildFoliaVisualConfig(presetRecipe("neon-night"))).toStrictEqual({
      theme: {
        light: theme("Music Agent / Neon Night", "#13244a", "#2ee6ff", "#ff5fae", "#d3e2ff", "chaotic"),
        dark: theme("Music Agent / Neon Night", "#13244a", "#2ee6ff", "#ff5fae", "#d3e2ff", "chaotic"),
      },
      visualizerMode: "fume",
      visualizerBackgroundMode: "common",
      backgroundOpacity: 0.71,
      visualizerOpacity: 0.94,
      useCoverColorBg: false,
      disableVisualizerGeometricBackground: false,
      disableVisualizerVignette: false,
    });
  });

  it("maps each preset to a distinct native Folia mode", () => {
    expect(buildFoliaVisualConfig(presetRecipe("neon-night")).visualizerMode).toBe("fume");
    expect(buildFoliaVisualConfig(presetRecipe("rain-window")).visualizerMode).toBe("monet");
    expect(buildFoliaVisualConfig(presetRecipe("livehouse")).visualizerMode).toBe("partita");
  });

  it("encodes and decodes the Folia theme shortcode without losing recipe data", () => {
    const recipe = presetRecipe("neon-night");
    const encoded = encodeFoliaThemeConfig(buildFoliaVisualConfig(recipe));
    const decoded = decodeFoliaThemeConfig(encoded);

    expect(encoded.startsWith("folia-theme://")).toBe(true);
    expect(decoded).not.toBeNull();
    expect(decoded?.theme.dark.backgroundColor).toBe("#13244a");
    expect(decoded?.theme.dark.primaryColor).toBe("#2ee6ff");
    expect(decoded?.theme.dark.accentColor).toBe("#ff5fae");
    expect(decoded?.theme.dark.animationIntensity).toBe("chaotic");
  });

  it("builds a browser-ready now-playing OBS URL", () => {
    const url = buildFoliaVisualRecipeUrl("http://127.0.0.1:3004/", presetRecipe("rain-window"));
    const parsed = new URL(url);

    expect(parsed.origin).toBe("http://127.0.0.1:3004");
    expect(parsed.searchParams.get("obs")).toBe("1");
    expect(parsed.searchParams.get("obsSource")).toBe("now-playing");
    expect(parsed.searchParams.get("obsTheme")).toBe("static");
    expect(parsed.searchParams.get("visualizer")).toBe("monet");
    expect(parsed.searchParams.get("cfg")?.startsWith("folia-theme://")).toBe(true);
  });

  it("keeps user intensity edits readable in the native animation setting", () => {
    const calm = buildFoliaVisualConfig({
      ...presetRecipe("rain-window"),
      intensity: 20,
      chorusImpact: 20,
    });
    expect(calm.theme.dark.animationIntensity).toBe("calm");
    expect(calm.backgroundOpacity).toBeLessThanOrEqual(0.8);
  });
});
