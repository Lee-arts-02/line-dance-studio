"use client";

export type PerformanceSessionPhase = "idle" | "playing" | "ended";

type PerformanceControlsProps = {
  phase: PerformanceSessionPhase;
  onPlay: () => void;
  onEnd: () => void;
};

/**
 * Top-right performance session controls — compact arcade-style chips (PLAY / END).
 */
export function PerformanceControls({ phase, onPlay, onEnd }: PerformanceControlsProps) {
  const playDisabled = phase === "playing";
  const endDisabled = phase !== "playing";

  return (
    <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2">
      <button
        type="button"
        onClick={onPlay}
        disabled={playDisabled}
        title={playDisabled ? "Session in progress — use END to stop" : "Start performance session"}
        className="rounded-lg border border-cyan-400/45 bg-cyan-500/20 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-cyan-50 shadow-[0_0_12px_rgba(34,211,238,0.25)] backdrop-blur-sm transition hover:bg-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-35 sm:px-3 sm:text-[11px]"
      >
        Play
      </button>
      <button
        type="button"
        onClick={onEnd}
        disabled={endDisabled}
        title={endDisabled ? "Start a session with PLAY first" : "End session and view results"}
        className="rounded-lg border border-rose-400/40 bg-rose-600/25 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-rose-50 shadow-[0_0_12px_rgba(244,63,94,0.22)] backdrop-blur-sm transition hover:bg-rose-600/35 disabled:cursor-not-allowed disabled:opacity-35 sm:px-3 sm:text-[11px]"
      >
        End
      </button>
    </div>
  );
}
