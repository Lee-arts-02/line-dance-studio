"use client";

import { MicroFeedback } from "@/components/MicroFeedback";
import type { MicroFeedbackItem } from "@/hooks/usePerformanceMetrics";

/**
 * Cumulative session totals — SYNC / CORRECT counts (not streak-reset combo).
 * Optional micro line sits below both rows (top-left stack).
 */

function syncTierStyles(count: number): { label: string; glow: string } {
  if (count >= 20)
    return {
      label: "text-orange-200 drop-shadow-[0_0_14px_rgba(251,146,60,0.85)]",
      glow: "shadow-[0_0_28px_rgba(251,146,60,0.35)]",
    };
  if (count >= 12)
    return {
      label: "text-yellow-200 drop-shadow-[0_0_12px_rgba(250,204,21,0.75)]",
      glow: "shadow-[0_0_22px_rgba(250,204,21,0.28)]",
    };
  if (count >= 5)
    return {
      label: "text-cyan-200 drop-shadow-[0_0_10px_rgba(34,211,238,0.65)]",
      glow: "shadow-[0_0_18px_rgba(34,211,238,0.22)]",
    };
  return {
    label: "text-sky-300 drop-shadow-[0_0_8px_rgba(56,189,248,0.55)]",
    glow: "shadow-[0_0_14px_rgba(59,130,246,0.2)]",
  };
}

function correctTierStyles(count: number): { label: string } {
  if (count >= 16) return { label: "text-amber-200/95" };
  if (count >= 8) return { label: "text-cyan-100/95" };
  return { label: "text-blue-200/90" };
}

type ComboDisplayProps = {
  syncCount: number;
  correctCount: number;
  syncPulseTick: number;
  correctPulseTick: number;
  micro?: MicroFeedbackItem | null;
};

export function ComboDisplay({
  syncCount,
  correctCount,
  syncPulseTick,
  correctPulseTick,
  micro = null,
}: ComboDisplayProps) {
  const st = syncTierStyles(syncCount);
  const ct = correctTierStyles(correctCount);

  return (
    <div
      className={`pointer-events-none absolute left-3 top-3 z-[32] max-w-[min(94vw,21rem)] select-none rounded-xl border border-white/10 px-3 py-2.5 backdrop-blur-sm sm:left-4 sm:top-4 ${st.glow} bg-black/25`}
      aria-label={`Sync combo ${syncCount}, correct combo ${correctCount}`}
    >
      <div className="font-black uppercase tracking-tight text-white/90">
        <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="text-[11px] font-bold tracking-[0.2em] text-cyan-200/55 sm:text-xs">SYNC COMBO</span>
          <span
            key={`s-${syncPulseTick}`}
            className={`inline-block min-w-[5rem] origin-left text-5xl leading-none tabular-nums sm:min-w-[6rem] sm:text-6xl ${st.label} [animation:perf-combo-pulse_0.2s_ease-out]`}
          >
            {syncCount}
          </span>
        </p>
      </div>

      <div className="mt-2 border-t border-white/10 pt-2 font-black uppercase tracking-tight text-white/85">
        <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="text-[10px] font-bold tracking-[0.18em] text-amber-200/45 sm:text-[11px]">CORRECT COMBO</span>
          <span
            key={`c-${correctPulseTick}`}
            className={`inline-block min-w-[4rem] text-4xl leading-none tabular-nums sm:min-w-[5rem] sm:text-5xl ${ct.label} [animation:perf-combo-pulse_0.2s_ease-out]`}
          >
            {correctCount}
          </span>
        </p>
      </div>

      {micro ? (
        <div className="mt-2 border-t border-white/10 pt-2">
          <MicroFeedback item={micro} underCombo />
        </div>
      ) : null}
    </div>
  );
}
