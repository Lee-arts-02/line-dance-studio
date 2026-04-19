"use client";

import { teamFlowToLevel, type TeamFlowLevel } from "@/lib/game/performanceSummary";

type TeamFlowBarProps = {
  teamFlow: number;
  /** When set, HIGH/MAX bar subtly pulses at this tempo (BPM). */
  bpm?: number;
};

function levelVisual(level: TeamFlowLevel): {
  bar: string;
  fill: string;
  label: string;
  pulse: boolean;
  maxAura: boolean;
} {
  switch (level) {
    case "MAX":
      return {
        bar: "border-amber-400/50 bg-black/40",
        fill: "bg-gradient-to-r from-amber-400 via-orange-400 to-fuchsia-500",
        label: "text-amber-100",
        pulse: true,
        maxAura: true,
      };
    case "HIGH":
      return {
        bar: "border-amber-300/35 bg-black/35",
        fill: "bg-gradient-to-r from-yellow-400/95 to-orange-400/90",
        label: "text-amber-200/95",
        pulse: true,
        maxAura: false,
      };
    case "MID":
      return {
        bar: "border-cyan-400/35 bg-black/30",
        fill: "bg-gradient-to-r from-cyan-500 to-teal-400",
        label: "text-cyan-100/95",
        pulse: true,
        maxAura: false,
      };
    default:
      return {
        bar: "border-sky-600/40 bg-black/35",
        fill: "bg-gradient-to-r from-sky-700 to-sky-500",
        label: "text-sky-200/90",
        pulse: false,
        maxAura: false,
      };
  }
}

export function TeamFlowBar({ teamFlow, bpm }: TeamFlowBarProps) {
  const level = teamFlowToLevel(teamFlow);
  const v = levelVisual(level);
  const pct = Math.round(teamFlow * 100);
  const beatSec = bpm && bpm > 40 ? 60 / bpm : 0.5;

  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 z-[25] w-[88%] max-w-md -translate-x-1/2 select-none sm:bottom-5">
      <div
        className={`mb-1.5 text-center text-[10px] font-black uppercase tracking-[0.45em] sm:text-[11px] ${v.label}`}
        style={
          v.maxAura
            ? {
                textShadow:
                  "0 0 12px rgba(251,191,36,0.9), 0 0 28px rgba(249,115,22,0.55)",
              }
            : undefined
        }
      >
        Team flow
      </div>
      <div
        className={`relative h-4 overflow-hidden rounded-full border shadow-inner backdrop-blur-sm sm:h-5 ${v.bar} ${v.maxAura ? "ring-2 ring-amber-400/40 shadow-[0_0_24px_rgba(251,146,60,0.35)]" : ""}`}
        style={{
          animation:
            v.pulse && level !== "LOW"
              ? `perf-flow-glow-pulse ${beatSec}s ease-in-out infinite`
              : undefined,
        }}
      >
        <div
          className={`relative z-[1] h-full rounded-full transition-[width] duration-500 ease-out ${v.fill}`}
          style={{ width: `${pct}%` }}
        />
        {v.maxAura ? (
          <div
            className="pointer-events-none absolute inset-0 z-[2] rounded-full opacity-35"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)",
              animation: `perf-flow-glow-pulse ${beatSec * 2}s linear infinite`,
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
