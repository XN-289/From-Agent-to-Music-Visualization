import type { VisualRecipe } from "./visual-recipe";

export type FoliaVisualizerMode = "classic" | "cadenza" | "partita" | "fume" | "monet";
export type FoliaVisualizerBackgroundMode = "common" | "monet" | "nomand" | "latent" | "url" | "sora";
export type FoliaAnimationIntensity = "calm" | "normal" | "chaotic";

export interface FoliaVisualTheme {
  name: string;
  backgroundColor: string;
  primaryColor: string;
  accentColor: string;
  secondaryColor: string;
  fontStyle: "sans" | "serif" | "mono";
  animationIntensity: FoliaAnimationIntensity;
}

export interface FoliaVisualConfig {
  theme: {
    light: FoliaVisualTheme;
    dark: FoliaVisualTheme;
  };
  visualizerMode: FoliaVisualizerMode;
  visualizerBackgroundMode: FoliaVisualizerBackgroundMode;
  backgroundOpacity: number;
  visualizerOpacity: number;
  useCoverColorBg: boolean;
  disableVisualizerGeometricBackground: boolean;
  disableVisualizerVignette: boolean;
}

interface RecipeFoliaTheme {
  name: string;
  mode: FoliaVisualizerMode;
  backgroundMode: FoliaVisualizerBackgroundMode;
  background: string;
  primary: string;
  accent: string;
  secondary: string;
  disableVignette: boolean;
}

const RECIPE_FOLIA_THEME: Record<VisualRecipe["id"], RecipeFoliaTheme> = {
  "neon-night": {
    name: "Music Agent / Neon Night",
    mode: "fume",
    backgroundMode: "common",
    background: "#13244a",
    primary: "#2ee6ff",
    accent: "#ff5fae",
    secondary: "#d3e2ff",
    disableVignette: false,
  },
  "rain-window": {
    name: "Music Agent / Rain Window",
    mode: "monet",
    backgroundMode: "monet",
    background: "#071014",
    primary: "#67e8f9",
    accent: "#a5b4fc",
    secondary: "#a8c0cc",
    disableVignette: true,
  },
  livehouse: {
    name: "Music Agent / Livehouse",
    mode: "partita",
    backgroundMode: "latent",
    background: "#100906",
    primary: "#f97316",
    accent: "#ef4444",
    secondary: "#d5b39b",
    disableVignette: false,
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function animationIntensityFor(recipe: VisualRecipe): FoliaAnimationIntensity {
  if (recipe.intensity >= 72) return "chaotic";
  if (recipe.intensity >= 38) return "normal";
  return "calm";
}

function themeFor(recipe: VisualRecipe): FoliaVisualTheme {
  const palette = RECIPE_FOLIA_THEME[recipe.id];
  return {
    name: palette.name,
    backgroundColor: palette.background,
    primaryColor: palette.primary,
    accentColor: palette.accent,
    secondaryColor: palette.secondary,
    fontStyle: "sans",
    animationIntensity: animationIntensityFor(recipe),
  };
}

export function buildFoliaVisualConfig(recipe: VisualRecipe): FoliaVisualConfig {
  const palette = RECIPE_FOLIA_THEME[recipe.id];
  const energy = recipe.intensity / 100;
  const chorus = recipe.chorusImpact / 100;

  return {
    theme: {
      light: themeFor(recipe),
      dark: themeFor(recipe),
    },
    visualizerMode: palette.mode,
    visualizerBackgroundMode: palette.backgroundMode,
    backgroundOpacity: Math.round(clamp(0.42 + chorus * 0.38, 0.42, 0.8) * 100) / 100,
    visualizerOpacity: Math.round(clamp(0.78 + energy * 0.22, 0.78, 1) * 100) / 100,
    useCoverColorBg: false,
    disableVisualizerGeometricBackground: palette.backgroundMode !== "common",
    disableVisualizerVignette: palette.disableVignette,
  };
}

function encodeBase64Json(value: unknown): string {
  const json = JSON.stringify(value);
  if (typeof globalThis.btoa === "function") {
    const bytes = new TextEncoder().encode(json);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return globalThis.btoa(binary);
  }

  const nodeBuffer = (globalThis as { Buffer?: { from(value: string, encoding: BufferEncoding): { toString(encoding: "base64"): string } } }).Buffer;
  if (!nodeBuffer) throw new Error("No base64 encoder available");
  return nodeBuffer.from(json, "utf8").toString("base64");
}

function decodeBase64Json<T>(base64: string): T {
  if (typeof globalThis.atob === "function") {
    const binary = globalThis.atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  }

  const nodeBuffer = (globalThis as { Buffer?: { from(value: string, encoding: "base64"): { toString(encoding: "utf8"): string } } }).Buffer;
  if (!nodeBuffer) throw new Error("No base64 decoder available");
  return JSON.parse(nodeBuffer.from(base64, "base64").toString("utf8")) as T;
}

interface MinifiedTheme {
  n: string;
  bg: string;
  pc: string;
  ac: string;
  sc: string;
  tfs: string;
  ai: string;
}

interface MinifiedFoliaVisualConfig {
  t?: {
    l?: MinifiedTheme;
    d?: MinifiedTheme;
  };
  vm?: FoliaVisualizerMode;
  vbm?: FoliaVisualizerBackgroundMode;
  bo?: number;
  vo?: number;
  ccb?: boolean;
  dvgb?: boolean;
  dvv?: boolean;
}

function compressTheme(theme: FoliaVisualTheme): MinifiedTheme {
  return {
    n: theme.name,
    bg: theme.backgroundColor,
    pc: theme.primaryColor,
    ac: theme.accentColor,
    sc: theme.secondaryColor,
    tfs: theme.fontStyle,
    ai: theme.animationIntensity,
  };
}

function decompressTheme(theme: MinifiedTheme): FoliaVisualTheme {
  return {
    name: theme.n,
    backgroundColor: theme.bg,
    primaryColor: theme.pc,
    accentColor: theme.ac,
    secondaryColor: theme.sc,
    fontStyle: (theme.tfs === "serif" || theme.tfs === "mono" ? theme.tfs : "sans") as FoliaVisualTheme["fontStyle"],
    animationIntensity: (theme.ai === "calm" || theme.ai === "chaotic" ? theme.ai : "normal") as FoliaAnimationIntensity,
  };
}

export function encodeFoliaThemeConfig(config: FoliaVisualConfig): string {
  const minified: MinifiedFoliaVisualConfig = {
    t: {
      l: compressTheme(config.theme.light),
      d: compressTheme(config.theme.dark),
    },
    vm: config.visualizerMode,
    vbm: config.visualizerBackgroundMode,
    bo: config.backgroundOpacity,
    vo: config.visualizerOpacity,
    ccb: config.useCoverColorBg,
    dvgb: config.disableVisualizerGeometricBackground,
    dvv: config.disableVisualizerVignette,
  };

  return `folia-theme://${encodeBase64Json(minified)}`;
}

export function decodeFoliaThemeConfig(shortcode: string): FoliaVisualConfig | null {
  const prefix = "folia-theme://";
  if (!shortcode.startsWith(prefix)) return null;

  try {
    const minified = decodeBase64Json<MinifiedFoliaVisualConfig>(shortcode.slice(prefix.length));
    if (!minified.t?.l || !minified.t.d) return null;

    return {
      theme: {
        light: decompressTheme(minified.t.l),
        dark: decompressTheme(minified.t.d),
      },
      visualizerMode: minified.vm ?? "classic",
      visualizerBackgroundMode: minified.vbm ?? "common",
      backgroundOpacity: minified.bo ?? 0.6,
      visualizerOpacity: minified.vo ?? 1,
      useCoverColorBg: minified.ccb ?? false,
      disableVisualizerGeometricBackground: minified.dvgb ?? false,
      disableVisualizerVignette: minified.dvv ?? false,
    };
  } catch {
    return null;
  }
}

export function buildFoliaVisualRecipeUrl(baseUrl: string, recipe: VisualRecipe): string {
  const config = buildFoliaVisualConfig(recipe);
  const cfg = encodeFoliaThemeConfig(config);
  const params = new URLSearchParams();
  params.set("obs", "1");
  params.set("obsSource", "now-playing");
  params.set("obsTheme", "static");
  params.set("visualizer", config.visualizerMode);
  params.set("cfg", cfg);
  return `${baseUrl.replace(/\/$/, "")}?${params.toString()}`;
}
