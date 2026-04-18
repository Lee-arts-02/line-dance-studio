"use client";

import { useEffect, useState } from "react";
import type { PerformanceSummaryStats } from "@/lib/game/performanceSummary";

const FADE_IN_MS = 380;
const HOLD_MS = 2800;
const FADE_OUT_MS = 480;

type Phase = "enter" | "visible" | "exit";

type PerformanceSummaryOverlayProps = {
  stats: PerformanceSummaryStats;
  onDismiss: () => void;
};

function flowLabel(level: PerformanceSummaryStats["flowLevel"]): string {
  switch (level) {
    case "MAX":
      return "MAX";
    case "HIGH":
      return "HIGH";
    case "MID":
      return "MID";
    default:
      return "LOW";
  }
}

/**
 * 20s interval — centered “stage” card: large headline + metrics. High z-index above camera / flow bar.
 */
export function PerformanceSummaryOverlay({ stats, onDismiss }: PerformanceSummaryOverlayProps) {
  const [phase, setPhase] = useState<Phase>("enter");

  useEffect(() => {
    let innerRaf = 0;
    const outerRaf = requestAnimationFrame(() => {
      innerRaf = requestAnimationFrame(() => setPhase("visible"));
    });

    const exitTimer = window.setTimeout(() => setPhase("exit"), FADE_IN_MS + HOLD_MS);
    const dismissTimer = window.setTimeout(() => onDismiss(), FADE_IN_MS + HOLD_MS + FADE_OUT_MS);

    return () => {
      cancelAnimationFrame(outerRaf);
      cancelAnimationFrame(innerRaf);
      window.clearTimeout(exitTimer);
      window.clearTimeout(dismissTimer);
    };
  }, [onDismiss]);

  const opacity = phase === "visible" ? "opacity-100" : "opacity-0";
  const duration = phase === "exit" ? "duration-[480ms]" : "duration-300";
  const scale =
    phase === "visible" ? "scale-100" : phase === "enter" ? "scale-[0.88]" : "scale-[0.94]";

  const glowActive = phase === "visible";

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[40] flex items-center justify-center px-3 py-8 sm:px-6"
      role="status"
      aria-live="polite"
    >
      <div
        className={`w-full max-w-2xl transition-all ease-out ${opacity} ${duration} ${scale}`}
      >
        <div className="relative overflow-hidden rounded-3xl border-2 border-fuchsia-400/45 bg-gradient-to-b from-black/75 via-black/65 to-black/80 px-5 py-7 shadow-[0_0_48px_rgba(217,70,239,0.22),0_0_96px_rgba(34,211,238,0.08)] backdrop-blur-xl sm:px-10 sm:py-9">
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              background:
                "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(217,70,239,0.35), transparent 55%)",
            }}
          />

          <p
            className={`relative text-center text-4xl font-black uppercase leading-[1.05] tracking-tight text-white sm:text-5xl md:text-6xl ${
              glowActive ? "[animation:perf-summary-hero-glow_2.2s_ease-in-out_infinite]" : ""
            }`}
            style={{
              textShadow:
                "0 2px 4px rgba(0,0,0,1), 0 0 40px rgba(251,191,36,0.45), 0 0 80px rgba(34,211,238,0.2)",
            }}
          >
            {stats.headline}
          </p>

          <div className="relative mt-5 text-center text-[10px] font-bold uppercase tracking-[0.35em] text-white/50 sm:text-[11px]">
            20s set
          </div>

          <div className="relative mt-5 flex flex-wrap items-end justify-center gap-x-10 gap-y-4 border-t border-white/15 pt-5 font-mono text-white/95">
            <div className="text-center">
              <span className="block text-[9px] font-semibold uppercase tracking-widest text-fuchsia-300/80">
                Peak sync
              </span>
              <span className="text-2xl font-black tabular-nums text-fuchsia-200 sm:text-3xl [text-shadow:0_2px_10px_rgba(0,0,0,0.9)]">
                ×{stats.peakSyncCombo}
              </span>
            </div>
            <div className="text-center">
              <span className="block text-[9px] font-semibold uppercase tracking-widest text-cyan-300/80">
                Peak correct
              </span>
              <span className="text-2xl font-black tabular-nums text-cyan-200 sm:text-3xl [text-shadow:0_2px_10px_rgba(0,0,0,0.9)]">
                ×{stats.peakCorrectCombo}
              </span>
            </div>
            <div className="text-center">
              <span className="block text-[9px] font-semibold uppercase tracking-widest text-amber-300/80">
                Team flow
              </span>
              <span className="text-2xl font-black tabular-nums text-amber-200 sm:text-3xl [text-shadow:0_2px_10px_rgba(0,0,0,0.9)]">
                {flowLabel(stats.flowLevel)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
