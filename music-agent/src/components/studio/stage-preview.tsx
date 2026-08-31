"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  stagePreviewTransition,
  type StagePreviewEvent,
  type StagePreviewPhase,
} from "./stage-preview-state";

const PROBE_TIMEOUT_MS = 5_000;
const FRAME_LOAD_TIMEOUT_MS = 15_000;

export function StagePreview({ src, reloadToken = 0 }: { src: string; reloadToken?: number }) {
  const [phase, dispatch] = useReducer(
    (state: StagePreviewPhase, event: StagePreviewEvent) => stagePreviewTransition(state, event),
    "checking",
  );
  const [attempt, setAttempt] = useState(0);
  const frameLoadedRef = useRef(false);

  useEffect(() => {
    frameLoadedRef.current = false;
    dispatch({ type: "probe-started" });

    const controller = new AbortController();
    let probeTimedOut = false;
    const probeTimeout = setTimeout(() => {
      probeTimedOut = true;
      controller.abort();
    }, PROBE_TIMEOUT_MS);
    let frameTimeout: ReturnType<typeof setTimeout> | undefined;

    void fetch(src, {
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(() => {
        if (controller.signal.aborted) return;
        dispatch({ type: "probe-succeeded" });
        frameTimeout = setTimeout(() => {
          if (!frameLoadedRef.current) dispatch({ type: "load-timeout" });
        }, FRAME_LOAD_TIMEOUT_MS);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted && !probeTimedOut) return;
        dispatch({ type: "probe-failed" });
        void error;
      })
      .finally(() => clearTimeout(probeTimeout));

    return () => {
      clearTimeout(probeTimeout);
      if (frameTimeout) clearTimeout(frameTimeout);
      controller.abort();
    };
  }, [attempt, reloadToken, src]);

  function retry() {
    setAttempt((current) => current + 1);
  }

  const showFrame = phase === "loading" || phase === "ready";

  return (
    <section aria-label="构图预览" className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">构图预览</h2>
          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
            仅判断构图、颜色与排版；音频反应以真实试听为准
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="重新加载构图预览"
          onClick={retry}
          disabled={phase === "checking" || phase === "loading"}
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="relative aspect-video bg-black">
        {showFrame ? (
          <iframe
            key={`${reloadToken}:${attempt}:${src}`}
            src={src}
            title="构图预览"
            className="absolute inset-0 h-full w-full border-0"
            allow="autoplay; clipboard-read; clipboard-write"
            onLoad={() => {
              frameLoadedRef.current = true;
              dispatch({ type: "frame-loaded" });
            }}
            onError={() => dispatch({ type: "frame-failed" })}
          />
        ) : null}
        {phase !== "ready" ? (
          <div
            role="status"
            className={cn(
              "absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/95 px-4 text-center",
              phase === "error" && "bg-destructive/5",
            )}
          >
            {phase === "error" ? (
              <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
            )}
            <div>
              <p className="text-sm font-medium">
                {phase === "error" ? "构图预览加载失败" : "正在连接舞台"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {phase === "error"
                  ? "请确认 Folia 已启动，或点击重试恢复预览"
                  : phase === "checking"
                    ? "正在检查舞台连接"
                    : "正在加载舞台画面"}
              </p>
            </div>
            {phase === "error" ? (
              <Button variant="outline" size="sm" onClick={retry}>
                <RotateCcw className="h-3.5 w-3.5" />
                重试
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
