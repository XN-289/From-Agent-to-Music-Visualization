import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StagePreview } from "./stage-preview";
import {
  providerModeLabel,
  stagePreviewTransition as transition,
} from "./stage-preview-state";

describe("stagePreviewTransition", () => {
  it("probe failure and iframe watchdog both enter retryable error", () => {
    expect(transition("checking", { type: "probe-failed" })).toBe("error");
    expect(transition("loading", { type: "frame-failed" })).toBe("error");
    expect(transition("loading", { type: "load-timeout" })).toBe("error");
  });

  it("a successful probe mounts the frame and load event marks it ready", () => {
    expect(transition("checking", { type: "probe-succeeded" })).toBe("loading");
    expect(transition("loading", { type: "frame-loaded" })).toBe("ready");
  });

  it("stale success events cannot overwrite an error", () => {
    expect(transition("error", { type: "frame-loaded" })).toBe("error");
    expect(transition("ready", { type: "load-timeout" })).toBe("ready");
  });
});

describe("providerModeLabel", () => {
  it("keeps Mock explicit and treats every real provider as real generation", () => {
    expect(providerModeLabel("mock")).toBe("Mock 生成");
    expect(providerModeLabel("musicproxy")).toBe("真实生成");
    expect(providerModeLabel("sunoapi")).toBe("真实生成");
  });
});

describe("StagePreview", () => {
  it("renders the preview label, listening caveat, and initial checking state", () => {
    const html = renderToStaticMarkup(
      createElement(StagePreview, { src: "http://127.0.0.1:3004/?obs=1" }),
    );
    expect(html).toContain("构图预览");
    expect(html).toContain("仅判断构图、颜色与排版；音频反应以真实试听为准");
    expect(html).toContain("正在检查舞台连接");
  });
});
