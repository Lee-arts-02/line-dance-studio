"use client";

import { useMemo } from "react";
import type { RewardVisualState } from "@/lib/game/rewards";

type RewardOverlaysProps = {
  reward: RewardVisualState;
  /** Bump to replay confetti burst */
  confettiBurstKey: number;
  /** Optional: team-flow max / performance burst (independent of reward tier). */
  performanceConfettiKey?: number;
};

/** Lightweight CSS confetti — small divs, no canvas, pointer-events none */
function ConfettiBurst({ burstKey }: { burstKey: number }) {
  const pieces = useMemo(() => {
    return Array.from({ length: 28 }, (_, i) => ({
      id: `${burstKey}-${i}`,
      left: `${(i * 37) % 100}%`,
      delay: `${(i % 8) * 0.04}s`,
      hue: (i * 47) % 360,
      dur: `${1.2 + (i % 5) * 0.1}s`,
    }));
  }, [burstKey]);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[25] overflow-hidden"
      aria-hidden
    >
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-[-12%] h-2 w-2 rounded-[1px] opacity-90"
          style={{
            left: p.left,
            animationName: "reward-confetti-fall",
            animationDuration: p.dur,
            animationTimingFunction: "ease-in",
            animationDelay: p.delay,
            animationFillMode: "forwards",
            backgroundColor: `hsla(${p.hue}, 85%, 62%, 0.92)`,
            boxShadow: `0 0 6px hsla(${p.hue}, 90%, 55%, 0.5)`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * Stage-level reward FX: rim glow, optional confetti, optional banner (group sync).
 */
export function RewardOverlays({
  reward,
  confettiBurstKey,
  performanceConfettiKey = 0,
}: RewardOverlaysProps) {
  const showGlow = reward.tier === "glow" || reward.tier === "confetti";
  const showConfetti = reward.tier === "confetti";
  const showPerfConfetti = performanceConfettiKey > 0;

  return (
    <>
      {showGlow ? (
        <div
          className="pointer-events-none absolute inset-0 z-[22] rounded-xl ring-2 ring-emerald-400/55 shadow-[inset_0_0_40px_rgba(52,211,153,0.2)]"
          aria-hidden
        />
      ) : null}
      {showConfetti ? <ConfettiBurst burstKey={confettiBurstKey} /> : null}
      {showPerfConfetti ? (
        <div
          className="pointer-events-none absolute inset-0 z-[27] overflow-hidden [contain:paint]"
          aria-hidden
        >
          <ConfettiBurst burstKey={performanceConfettiKey} />
        </div>
      ) : null}
      {reward.banner ? (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-[26] max-w-[90%] -translate-x-1/2 text-center">
          <div className="rounded-full border border-white/20 bg-black/45 px-5 py-2 text-sm font-bold uppercase tracking-[0.2em] text-emerald-100 shadow-lg backdrop-blur-sm sm:text-base">
            {reward.banner}
            {reward.highSyncStreak >= 2 ? (
              <span className="ml-2 inline-block text-xs font-semibold tabular-nums text-amber-200/95">
                streak ×{reward.highSyncStreak}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
