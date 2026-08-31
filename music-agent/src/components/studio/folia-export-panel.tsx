"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { FoliaStageExportJob } from "@/lib/folia-stage";
import type { VisualRecipe } from "@/lib/visual-recipe";
import { Film, FolderOpen, Loader2, Square } from "lucide-react";
import { cn } from "@/lib/utils";

type ExportResponse = {
  ok?: boolean;
  error?: string;
  code?: string;
  job?: FoliaStageExportJob | null;
};

const phaseLabels: Record<FoliaStageExportJob["phase"], string> = {
  queued: "排队中",
  preparing: "准备画面",
  countdown: "倒计时",
  recording: "录制中",
  finalizing: "整理文件",
};

const orientationLabels: Record<NonNullable<FoliaStageExportJob["orientation"]>, string> = {
  landscape: "横屏",
  portrait: "竖屏",
};

function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes.toString().padStart(2, "0")}:${(safeSeconds % 60).toString().padStart(2, "0")}`;
}

function formatBytes(bytes: number | null): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return "--";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
}

export function FoliaExportPanel({
  songId,
  savedRecipe,
  disabled = false,
  disabledHint,
}: {
  songId: string;
  savedRecipe: VisualRecipe | null;
  disabled?: boolean;
  disabledHint?: string;
}) {
  const [job, setJob] = useState<FoliaStageExportJob | null>(null);
  const [polling, setPolling] = useState(true);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = job?.status === "running";
  const percent = job ? Math.round(Math.min(1, Math.max(0, job.progress)) * 100) : 0;

  useEffect(() => {
    if (!polling) return;
    const controller = new AbortController();
    let cancelled = false;

    const refresh = async () => {
      try {
        const res = await fetch(`/api/songs/${songId}/export-folia`, {
          signal: controller.signal,
        });
        const data = (await res.json().catch(() => null)) as ExportResponse | null;
        if (cancelled) return;
        if (!res.ok || !data?.ok) throw new Error(data?.error ?? `导出状态获取失败（${res.status}）`);
        setJob(data.job ?? null);
        if (!data.job || data.job.status !== "running") setPolling(false);
      } catch (e) {
        if (controller.signal.aborted || cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setPolling(false);
      }
    };

    void refresh();
    const timer = setInterval(() => void refresh(), 1000);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [polling, songId]);

  async function startExport() {
    if (disabled || !savedRecipe || starting || running) return;
    setStarting(true);
    setError(null);
    try {
      const res = await fetch(`/api/songs/${songId}/export-folia`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe: savedRecipe }),
      });
      const data = (await res.json().catch(() => null)) as ExportResponse | null;
      if (!res.ok || !data?.ok || !data.job) {
        throw new Error(data?.error ?? `导出启动失败（${res.status}）`);
      }
      setJob(data.job);
      setPolling(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  }

  async function cancelExport() {
    if (cancelling || !running) return;
    setCancelling(true);
    setError(null);
    try {
      const res = await fetch(`/api/songs/${songId}/export-folia`, { method: "DELETE" });
      const data = (await res.json().catch(() => null)) as ExportResponse | null;
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? `导出取消失败（${res.status}）`);
      setJob(data.job ?? null);
      setPolling(data.job?.status === "running");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCancelling(false);
    }
  }

  async function openFolder() {
    if (opening || job?.status !== "succeeded") return;
    setOpening(true);
    setError(null);
    try {
      const res = await fetch(`/api/songs/${songId}/export-folia/open`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as ExportResponse | null;
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? `目录打开失败（${res.status}）`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOpening(false);
    }
  }

  const startDisabled = disabled || !savedRecipe || starting || running;
  const statusLabel =
    job?.status === "succeeded"
      ? "导出完成"
      : job?.status === "failed"
        ? "导出失败"
        : job?.status === "cancelled"
          ? "已取消"
          : running
            ? `${phaseLabels[job.phase]}${job.orientation ? ` · ${orientationLabels[job.orientation]}` : ""}`
            : "未开始";

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Film className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">正式导出</h2>
        </div>
        <span
          className={cn(
            "text-[11px] tabular-nums",
            job?.status === "succeeded"
              ? "text-emerald-600 dark:text-emerald-300"
              : job?.status === "failed"
                ? "text-destructive"
                : "text-muted-foreground",
          )}
        >
          {statusLabel}
        </span>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>总进度</span>
          <span className="tabular-nums">
            {percent}%{job ? ` · ${formatDuration(job.elapsed)} / ${formatDuration(job.duration)}` : ""}
          </span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {job?.outputs.length ? (
        <div className="mt-3 space-y-1.5">
          {job.outputs.map((output) => (
            <div
              key={output.orientation}
              className="flex items-center justify-between gap-2 rounded-md border bg-background/60 px-2.5 py-2"
            >
              <span className="min-w-0 truncate text-xs font-medium">
                {orientationLabels[output.orientation]} · {output.width}×{output.height}
              </span>
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {formatBytes(output.sizeBytes)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">H.264 / AAC · 1920×1080 + 1080×1920</p>
      )}

      {job?.status === "succeeded" && (
        <p className="mt-2 truncate text-[11px] text-muted-foreground" title={job.outputDirectory}>
          {job.outputDirectory}
        </p>
      )}

      {job?.error && <p className="mt-2 text-xs text-destructive">{job.error}</p>}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      {disabledHint && !running && <p className="mt-2 text-xs text-amber-600 dark:text-amber-300">{disabledHint}</p>}

      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" disabled={startDisabled} onClick={() => void startExport()}>
          {starting || running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Film className="h-3.5 w-3.5" />}
          {running ? "导出中" : "导出横竖屏"}
        </Button>
        {running && (
          <Button variant="outline" size="sm" disabled={cancelling} onClick={() => void cancelExport()}>
            {cancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
            取消
          </Button>
        )}
        {job?.status === "succeeded" && (
          <Button variant="outline" size="sm" disabled={opening} onClick={() => void openFolder()}>
            {opening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FolderOpen className="h-3.5 w-3.5" />}
            打开目录
          </Button>
        )}
      </div>
    </section>
  );
}
