export type StagePreviewPhase = "checking" | "loading" | "ready" | "error";

export type StagePreviewEvent =
  | { type: "probe-started" }
  | { type: "probe-succeeded" }
  | { type: "probe-failed" }
  | { type: "frame-loaded" }
  | { type: "frame-failed" }
  | { type: "load-timeout" };

export function stagePreviewTransition(
  phase: StagePreviewPhase,
  event: StagePreviewEvent,
): StagePreviewPhase {
  switch (event.type) {
    case "probe-started":
      return "checking";
    case "probe-succeeded":
      return "loading";
    case "probe-failed":
    case "frame-failed":
      return "error";
    case "frame-loaded":
      return phase === "loading" ? "ready" : phase;
    case "load-timeout":
      return phase === "loading" ? "error" : phase;
  }
}

export function providerModeLabel(providerId: string): string {
  return providerId === "mock" ? "Mock 生成" : "真实生成";
}
