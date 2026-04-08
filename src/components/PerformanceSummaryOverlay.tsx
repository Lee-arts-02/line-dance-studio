"use client";

import { useEffect, useState } from "react";
import type { PerformanceSummaryStats } from "@/lib/game/performanceSummary";

const FADE_IN_MS = 300;
const HOLD_MS = 2500;
const FADE_OUT_MS = 400;

type Phase = "enter" | "visible" | "exit";

type PerformanceSummaryOverlayProps = {
  stats: PerformanceSummaryStats;
  onDismiss: () => void;
};

/**
 * Performance summary on the camera stack (not mirrored). Slogan is prominent in the upper third;
 * metrics stay readable below. pointer-events: none.
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
  const duration = phase === "exit" ? "duration-[400ms]" : "duration-300";

  return (
    <div
      className={`pointer-events-none absolute inset-x-0 top-[31%] z-[30] flex -translate-y-1/2 justify-center px-4 transition-opacity ease-out ${opacity} ${duration}`}
      role="status"
      aria-live="polite"
    >
      <div className="max-w-2xl rounded-2xl border border-white/15 bg-black/25 px-6 py-5 text-center shadow-lg backdrop-blur-sm sm:px-8 sm:py-6">
        <p
          className="text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl"
          style={{
            textShadow:
              "0 1px 2px rgba(0,0,0,0.9), 0 2px 16px rgba(0,0,0,0.55), 0 0 1px rgba(0,0,0,1)",
          }}
        >
          {stats.message}
        </p>

        <div className="mt-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/50 sm:text-[11px]">
          60s group performance
        </div>

        <div className="mt-3 flex flex-wrap items-baseline justify-center gap-x-8 gap-y-2 border-t border-white/10 pt-3 font-mono text-sm text-white/95 sm:text-base">
          <div>
            <span className="text-white/55">Group Accuracy</span>{" "}
            <span className="text-xl font-bold tabular-nums text-fuchsia-200 sm:text-2xl [text-shadow:0_1px_3px_rgba(0,0,0,0.85)]">
              {stats.accuracyPct}%
            </span>
          </div>
          <div>
            <span className="text-white/55">Group Sync</span>{" "}
            <span className="text-xl font-bold tabular-nums text-cyan-200 sm:text-2xl [text-shadow:0_1px_3px_rgba(0,0,0,0.85)]">
              {stats.syncPct}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
