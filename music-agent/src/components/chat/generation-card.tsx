"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { pollJob, type JobPollResult } from "@/lib/client";
import type { StageDeliveryStatus } from "@/lib/db/schema";
import { usePlayerStore } from "@/components/player/player-store";
import { Progress } from "@/components/ui/progress";
import { ChevronDown, ChevronUp, Music2, Pause, Play, RefreshCw } from "lucide-react";

interface StageDeliverySnapshot {
  stageDeliveryStatus: StageDeliveryStatus;
  stageDeliveryError: string | null;
}

// 生成卡片：出现在聊天流中，轮询 /api/jobs/[id] 展示阶段化进度，
// 完成后提供两个变体的醒目试听卡片（Suno 惯例：一次生成 2 个变体做 A/B）。
export function GenerationCard({
  jobId,
  songId,
  title,
  autoPlay = false,
  trackStageDelivery = false,
}: {
  jobId: string;
  songId: string;
  title: string;
  autoPlay?: boolean;
  trackStageDelivery?: boolean;
}) {
  const [res, setRes] = useState<JobPollResult | null>(null);
  const [showLyrics, setShowLyrics] = useState(false);
  const [autoPlayBlocked, setAutoPlayBlocked] = useState(false);
  const [delivery, setDelivery] = useState<StageDeliverySnapshot | null>(null);
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const autoPlayedRef = useRef(false);
  const sawGeneratingRef = useRef(false);
  const current = usePlayerStore((s) => s.current);
  const playing = usePlayerStore((s) => s.playing);
  const play = usePlayerStore((s) => s.play);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    pollJob(
      jobId,
      (r) => {
        if (cancelled) return;
        setRes(r);
        if (r.job.status === "submitted" || r.job.status === "generating") {
          sawGeneratingRef.current = true;
        }
        if (r.job.status === "completed" && r.song) {
          setDelivery({
            stageDeliveryStatus: r.song.stageDeliveryStatus,
            stageDeliveryError: r.song.stageDeliveryError,
          });
        }
      },
      { signal: controller.signal },
    ).catch(() => {
      // 轮询失败时静默；卡片停留在最后状态（中止/超时不再产生请求）
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [jobId]);

  const variants = useMemo(() => res?.song?.variants ?? [], [res?.song?.variants]);
  const done = res?.job.status === "completed";
  const failed = res?.job.status === "failed";

  useEffect(() => {
    if (
      !done ||
      (!sawGeneratingRef.current && !trackStageDelivery) ||
      delivery?.stageDeliveryStatus !== "pending"
    ) {
      return;
    }
    let cancelled = false;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (attempts > 10) {
        clearInterval(timer);
        return;
      }
      void fetch(`/api/songs/${songId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: StageDeliverySnapshot | null) => {
          if (cancelled || !data) return;
          setDelivery({
            stageDeliveryStatus: data.stageDeliveryStatus,
            stageDeliveryError: data.stageDeliveryError,
          });
          if (data.stageDeliveryStatus !== "pending") clearInterval(timer);
        })
        .catch(() => {});
    }, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [delivery?.stageDeliveryStatus, done, songId, trackStageDelivery]);

  useEffect(() => {
    if (!autoPlay || autoPlayedRef.current || !done || variants.length === 0) return;
    autoPlayedRef.current = true;
    setAutoPlayBlocked(false);
    const first = variants[0];
    void play({
      songId,
      variantId: first.id,
      url: first.audioUrl,
      title: first.title,
    }).then((started) => {
      if (!started) setAutoPlayBlocked(true);
    });
  }, [autoPlay, done, play, songId, variants]);

  async function retryStageDelivery() {
    if (deliveryBusy) return;
    setDeliveryBusy(true);
    setDeliveryError(null);
    try {
      const res = await fetch(`/api/songs/${songId}/push-folia`, { method: "POST" });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !data?.ok) {
        const error = data?.error ?? `推送失败（${res.status}）`;
        setDelivery({ stageDeliveryStatus: "needs_retry", stageDeliveryError: error });
        setDeliveryError(error);
        return;
      }
      setDelivery({ stageDeliveryStatus: "pushed", stageDeliveryError: null });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      setDelivery({ stageDeliveryStatus: "needs_retry", stageDeliveryError: error });
      setDeliveryError(error);
    } finally {
      setDeliveryBusy(false);
    }
  }

  return (
    <div className="w-full max-w-xl rounded-lg border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
          <Music2 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">
            {done
              ? autoPlayBlocked
                ? "生成完成，点一下现在听"
                : "生成完成，试听两个变体"
              : failed
                ? "生成失败"
                : "正在制作中…"}
          </p>
        </div>
        {done && res?.song?.lyrics && (
          <button
            type="button"
            onClick={() => setShowLyrics((v) => !v)}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground"
          >
            {showLyrics ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            歌词
          </button>
        )}
      </div>

      {!done && !failed && (
        <div className="mt-3 space-y-2">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600" />
            </span>
            {res?.job.stage ?? "排队中…"} · {res?.job.progress ?? 0}%
          </p>
          <Progress value={res?.job.progress ?? 0} />
        </div>
      )}
      {failed && <p className="mt-3 text-sm text-destructive">{res?.job.error ?? "生成失败"}</p>}

      {done && (
        <div className="mt-3 space-y-3">
          {delivery?.stageDeliveryStatus === "pending" && (
            <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              舞台同步中…
            </p>
          )}
          {delivery?.stageDeliveryStatus === "pushed" && (
            <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
              已推送到 Folia 舞台
            </p>
          )}
          {delivery?.stageDeliveryStatus === "needs_retry" && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
              <p className="min-w-0 text-sm text-amber-700 dark:text-amber-300">
                {deliveryError ?? delivery.stageDeliveryError ?? "Stage 未就绪，稍后可重推"}
              </p>
              <button
                type="button"
                disabled={deliveryBusy}
                onClick={() => void retryStageDelivery()}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-amber-500/50 bg-background px-2.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-500/20 disabled:opacity-60 dark:text-amber-200"
              >
                <RefreshCw className={deliveryBusy ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
                重推舞台
              </button>
            </div>
          )}
          {autoPlayBlocked && variants[0] && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
              <p className="text-sm text-amber-700 dark:text-amber-300">
                浏览器拦截了自动播放，点击“现在听”即可在当前页开始。
              </p>
              <button
                type="button"
                onClick={() => {
                  setAutoPlayBlocked(false);
                  void play({
                    songId,
                    variantId: variants[0].id,
                    url: variants[0].audioUrl,
                    title: variants[0].title,
                  });
                }}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-amber-500 px-3 text-sm font-medium text-white transition-colors hover:bg-amber-600"
              >
                <Play className="h-4 w-4" />
                现在听
              </button>
            </div>
          )}
          {showLyrics && res?.song?.lyrics && (
            <p className="whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-3 text-sm leading-relaxed text-muted-foreground">
              {res.song.lyrics}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            {variants.map((v, i) => {
              const active = current?.variantId === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    setAutoPlayBlocked(false);
                    void play({ songId, variantId: v.id, url: v.audioUrl, title: v.title });
                  }}
                  className={
                    active
                      ? "flex flex-col gap-1.5 rounded-md border border-primary bg-primary/10 p-3 text-left transition-colors"
                      : "flex flex-col gap-1.5 rounded-md border bg-background p-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
                  }
                >
                  <span className="flex items-center justify-between">
                    <span className="text-xs font-semibold">变体 {i === 0 ? "A" : "B"}</span>
                    {active && playing ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {active ? "正在播放" : "点击试听"} · {Math.round(v.durationSec || 0)}s
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
