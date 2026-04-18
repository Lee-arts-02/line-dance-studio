"use client";

import { MicroFeedback } from "@/components/MicroFeedback";
import type { MicroFeedbackItem } from "@/hooks/usePerformanceMetrics";

/**
 * Arcade-style combo stack — SYNC primary, CORRECT secondary.
 * Optional micro line sits below both combo rows (top-left stack).
 */

function syncTierStyles(combo: number): { label: string; glow: string } {
  if (combo >= 20)
    return {
      label: "text-orange-200 drop-shadow-[0_0_14px_rgba(251,146,60,0.85)]",
      glow: "shadow-[0_0_28px_rgba(251,146,60,0.35)]",
    };
  if (combo >= 12)
    return {
      label: "text-yellow-200 drop-shadow-[0_0_12px_rgba(250,204,21,0.75)]",
      glow: "shadow-[0_0_22px_rgba(250,204,21,0.28)]",
    };
  if (combo >= 5)
    return {
      label: "text-cyan-200 drop-shadow-[0_0_10px_rgba(34,211,238,0.65)]",
      glow: "shadow-[0_0_18px_rgba(34,211,238,0.22)]",
    };
  return {
    label: "text-sky-300 drop-shadow-[0_0_8px_rgba(56,189,248,0.55)]",
    glow: "shadow-[0_0_14px_rgba(59,130,246,0.2)]",
  };
}

function correctTierStyles(combo: number): { label: string } {
  if (combo >= 16) return { label: "text-amber-200/95" };
  if (combo >= 8) return { label: "text-cyan-100/95" };
  return { label: "text-blue-200/90" };
}

type ComboDisplayProps = {
  syncCombo: number;
  correctCombo: number;
  syncPulseTick: number;
  correctPulseTick: number;
  micro?: MicroFeedbackItem | null;
};

export function ComboDisplay({
  syncCombo,
  correctCombo,
  syncPulseTick,
  correctPulseTick,
  micro = null,
}: ComboDisplayProps) {
  const st = syncTierStyles(syncCombo);
  const ct = correctTierStyles(correctCombo);

  return (
    <div
      className={`pointer-events-none absolute left-3 top-3 z-[32] max-w-[min(94vw,21rem)] select-none rounded-xl border border-white/10 px-3 py-2.5 backdrop-blur-sm sm:left-4 sm:top-4 ${st.glow} bg-black/25`}
      aria-label={`Sync combo ${syncCombo}, correct combo ${correctCombo}`}
    >
      <div className="font-black uppercase tracking-tight text-white/90">
        <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="text-[11px] font-bold tracking-[0.2em] text-white/50 sm:text-xs">SYNC COMBO</span>
          <span
            key={`s-${syncPulseTick}`}
            className={`inline-block min-w-[5rem] origin-left text-5xl leading-none tabular-nums sm:min-w-[6rem] sm:text-6xl ${st.label} [animation:perf-combo-pulse_0.2s_ease-out]`}
          >
            ×{syncCombo}
          </span>
        </p>
      </div>

      <div className="mt-2 border-t border-white/10 pt-2 font-black uppercase tracking-tight text-white/85">
        <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="text-[10px] font-bold tracking-[0.18em] text-white/42 sm:text-[11px]">CORRECT COMBO</span>
          <span
            key={`c-${correctPulseTick}`}
            className={`inline-block min-w-[4rem] text-4xl leading-none tabular-nums sm:min-w-[5rem] sm:text-5xl ${ct.label} [animation:perf-combo-pulse_0.2s_ease-out]`}
          >
            ×{correctCombo}
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
