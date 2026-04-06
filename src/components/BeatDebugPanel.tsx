"use client";

/**
 * Temporary readout of the audio beat clock for verifying sync (Step 2).
 */
type BeatDebugPanelProps = {
  currentTime: number;
  bpm: number;
  currentBeatFloat: number;
};

export function BeatDebugPanel({ currentTime, bpm, currentBeatFloat }: BeatDebugPanelProps) {
  return (
    <div
      className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg)]/90 px-3 py-2 font-mono text-[11px] text-[var(--muted)] tabular-nums"
      aria-label="Beat clock debug"
    >
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <span>
          <span className="text-[var(--muted)]">time </span>
          <span className="text-cyan-200/90">{currentTime.toFixed(3)}s</span>
        </span>
        <span>
          <span className="text-[var(--muted)]">BPM </span>
          <span className="text-cyan-200/90">{bpm.toFixed(1)}</span>
        </span>
        <span>
          <span className="text-[var(--muted)]">beat </span>
          <span className="text-amber-200/95">{currentBeatFloat.toFixed(2)}</span>
        </span>
      </div>
    </div>
  );
}
