"use client";

import { useEffect, useRef } from "react";
import { getAudio, usePlayerStore } from "./player-store";

// 全局共享一份 Web Audio 图，避免重复 createMediaElementSource 抛出
// InvalidStateError。同一个 HTMLAudioElement 只能建立一次源节点，多个
// 可视化组件都复用这个 analyser。
let sharedContext: AudioContext | null = null;
let sharedAnalyser: AnalyserNode | null = null;

function ensureAudioGraph(audio: HTMLAudioElement): AnalyserNode | null {
  if (sharedAnalyser) return sharedAnalyser;

  const Ctor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;

  const context = new Ctor();
  const source = context.createMediaElementSource(audio);
  const analyser = context.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.82;
  source.connect(analyser);
  analyser.connect(context.destination);

  sharedContext = context;
  sharedAnalyser = analyser;
  return analyser;
}

export function AudioVisualizer({
  url,
  variantId,
  className,
}: {
  url: string;
  variantId: string;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const audio = getAudio();
    if (!canvas || !audio) return;

    const analyser = ensureAudioGraph(audio);
    if (sharedContext?.state === "suspended") {
      void sharedContext.resume();
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame = 0;
    const bars = 56;

    const draw = (now: number) => {
      frame = window.requestAnimationFrame(draw);

      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.floor(rect.width * dpr));
      const height = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      ctx.clearRect(0, 0, width, height);
      const playing = usePlayerStore.getState().playing;
      const progress = usePlayerStore.getState().progressSec;
      const duration = usePlayerStore.getState().durationSec;

      const data = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
      if (data && analyser) analyser.getByteFrequencyData(data);

      const usableBins = data ? Math.floor(data.length * 0.78) : 0;
      const gap = 2 * dpr;
      const barWidth = Math.max(2, (width - gap * (bars - 1)) / bars);
      const gradient = ctx.createLinearGradient(0, height, width, 0);
      gradient.addColorStop(0, "#10b981");
      gradient.addColorStop(0.42, "#14b8a6");
      gradient.addColorStop(0.75, "#f59e0b");
      gradient.addColorStop(1, "#ef4444");
      ctx.fillStyle = gradient;

      let hasRealSignal = false;
      for (let i = 0; i < bars; i++) {
        let level = 0;
        if (data && usableBins > 0) {
          const ratio = i / (bars - 1);
          const bin = Math.min(data.length - 1, Math.floor(Math.pow(ratio, 1.5) * usableBins));
          level = data[bin] / 255;
          if (level > 0.025) hasRealSignal = true;
        }

        if (!hasRealSignal || !playing) {
          const beat = Math.sin(now * 0.0028 + i * 0.43);
          const pulse = Math.sin(now * 0.0017 + i * 0.19);
          const energy = playing ? 0.24 + 0.14 * beat + 0.08 * pulse : 0.035 + 0.02 * pulse;
          level = Math.max(level, Math.abs(energy));
        }

        const eased = Math.pow(Math.min(1, level), 1.4);
        const minH = Math.max(2, height * 0.08);
        const barHeight = Math.min(height, Math.max(minH, height * eased));
        const x = i * (barWidth + gap);
        const y = height - barHeight;
        const radius = Math.min(barWidth / 2, 5 * dpr);

        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, radius);
        ctx.fill();
      }

      // 在真实信号很弱时保留播放位置感；不显示文字，只让最右侧两根短柱承担进度脉冲。
      if (!hasRealSignal && duration > 0) {
        const ratio = Math.min(1, progress / duration);
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        const markerWidth = Math.max(2, barWidth * 0.8);
        const markerX = gap + (bars - 1) * (barWidth + gap) * ratio;
        ctx.beginPath();
        ctx.roundRect(markerX, height - Math.max(6 * dpr, height * 0.2), markerWidth, Math.max(6 * dpr, height * 0.2), 2 * dpr);
        ctx.fill();
      }
    };

    frame = window.requestAnimationFrame(draw);
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [url, variantId]);

  return (
    <canvas
      ref={canvasRef}
      className={className ?? "h-16 w-full"}
      aria-label="音乐可视化"
    />
  );
}
