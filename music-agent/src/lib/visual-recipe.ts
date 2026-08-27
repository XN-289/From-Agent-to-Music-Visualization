export type VisualRecipeId = "neon-night" | "rain-window" | "livehouse";

export interface VisualRecipe {
  id: VisualRecipeId;
  /** 0-100：整体能量，影响亮度、对比与色彩饱和。 */
  intensity: number;
  /** -20 到 20：暖色向右，冷色向左。 */
  temperature: number;
  /** 0-100：副歌/高潮的氛围层强度。 */
  chorusImpact: number;
}

export interface VisualRecipePreset extends VisualRecipe {
  name: string;
  cue: string;
  colors: [string, string];
  hueShift: number;
  saturationBase: number;
  contrastBase: number;
}

export const VISUAL_RECIPE_PRESETS: VisualRecipePreset[] = [
  {
    id: "neon-night",
    name: "夏夜霓虹",
    cue: "霓虹、潮湿路面、副歌炸开",
    colors: ["#22d3ee", "#f472b6"],
    hueShift: 12,
    saturationBase: 112,
    contrastBase: 112,
    intensity: 72,
    temperature: 4,
    chorusImpact: 76,
  },
  {
    id: "rain-window",
    name: "雨窗民谣",
    cue: "低饱和、柔光、雨夜玻璃",
    colors: ["#67e8f9", "#a5b4fc"],
    hueShift: -16,
    saturationBase: 78,
    contrastBase: 96,
    intensity: 38,
    temperature: -8,
    chorusImpact: 44,
  },
  {
    id: "livehouse",
    name: "Livehouse 现场",
    cue: "舞台灯、颗粒感、人群能量",
    colors: ["#f97316", "#ef4444"],
    hueShift: -4,
    saturationBase: 122,
    contrastBase: 120,
    intensity: 84,
    temperature: 12,
    chorusImpact: 92,
  },
];

const RECIPE_IDS = new Set<string>(VISUAL_RECIPE_PRESETS.map((preset) => preset.id));

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getVisualRecipePreset(id: VisualRecipeId): VisualRecipePreset {
  return VISUAL_RECIPE_PRESETS.find((preset) => preset.id === id) ?? VISUAL_RECIPE_PRESETS[0];
}

export function normalizeVisualRecipe(input: unknown): VisualRecipe | null {
  if (input == null || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  if (typeof raw.id !== "string" || !RECIPE_IDS.has(raw.id)) return null;

  const intensity = Number(raw.intensity);
  const temperature = Number(raw.temperature);
  const chorusImpact = Number(raw.chorusImpact);
  if (!Number.isFinite(intensity) || !Number.isFinite(temperature) || !Number.isFinite(chorusImpact)) {
    return null;
  }

  return {
    id: raw.id as VisualRecipeId,
    intensity: Math.round(clamp(intensity, 0, 100)),
    temperature: Math.round(clamp(temperature, -20, 20)),
    chorusImpact: Math.round(clamp(chorusImpact, 0, 100)),
  };
}

export function recipeChanged(a: VisualRecipe | null, b: VisualRecipe | null): boolean {
  if (a == null || b == null) return a !== b;
  return a.id !== b.id || a.intensity !== b.intensity || a.temperature !== b.temperature || a.chorusImpact !== b.chorusImpact;
}

export function visualRecipeFilter(recipe: VisualRecipe): string {
  const preset = getVisualRecipePreset(recipe.id);
  const energy = recipe.intensity / 100;
  const saturate = Math.round(clamp(preset.saturationBase + energy * 18, 40, 180));
  const contrast = Math.round(clamp(preset.contrastBase + energy * 14, 70, 170));
  const brightness = Math.round(clamp(84 + energy * 26, 70, 120));
  const hue = Math.round(clamp(preset.hueShift + recipe.temperature * 1.4, -45, 45));
  return `saturate(${saturate}%) contrast(${contrast}%) brightness(${brightness}%) hue-rotate(${hue}deg)`;
}

export function visualRecipeAmbience(recipe: VisualRecipe): {
  background: string;
  opacity: number;
} {
  const preset = getVisualRecipePreset(recipe.id);
  const strength = clamp(recipe.chorusImpact / 100, 0, 1);
  return {
    background: `radial-gradient(circle at 50% 18%, ${preset.colors[0]}55 0%, transparent 58%), radial-gradient(circle at 50% 92%, ${preset.colors[1]}44 0%, transparent 62%)`,
    opacity: 0.16 + strength * 0.42,
  };
}
