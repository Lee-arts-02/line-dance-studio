"use client";

import { useEffect, useState, type RefObject } from "react";
import type { AudioEngine } from "@/lib/audio/audioEngine";
import type { BuiltInTrack } from "@/lib/audio/tracks";

type MusicPanelProps = {
  engineRef: RefObject<AudioEngine | null>;
  tracks: BuiltInTrack[];
  selectedBuiltInId: string;
  onSelectBuiltIn: (id: string) => void;
  customLabel: string | null;
  onLocalFile: (file: File) => void;
  bpm: number;
  onBpmChange: (bpm: number) => void;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  isPlaying: boolean;
  displayTitle: string;
};

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00.00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}

/**
 * Own animation frame loop for the time display only — avoids lifting time state to the page.
 */
export function MusicPanel({
  engineRef,
  tracks,
  selectedBuiltInId,
  onSelectBuiltIn,
  customLabel,
  onLocalFile,
  bpm,
  onBpmChange,
  onPlay,
  onPause,
  onReset,
  isPlaying,
  displayTitle,
}: MusicPanelProps) {
  const [displayTime, setDisplayTime] = useState(0);

  useEffect(() => {
    let frame = 0;
    const loop = () => {
      const e = engineRef.current;
      if (e) setDisplayTime(e.getCurrentTime());
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [engineRef]);

  return (
    <aside
      className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--panel)]/90 p-5 shadow-lg backdrop-blur-sm"
      style={{ boxShadow: "0 0 0 1px rgba(34,211,238,0.06)" }}
    >
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted)]">
          Track
        </h2>
        <p className="mt-1 truncate text-lg font-medium text-[var(--text)]" title={displayTitle}>
          {displayTitle}
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-[var(--muted)]">Built-in</span>
        <select
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] outline-none ring-cyan-400/30 focus:ring-2"
          value={selectedBuiltInId}
          onChange={(e) => onSelectBuiltIn(e.target.value)}
        >
          {tracks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-[var(--muted)]">Custom file (local)</span>
        <input
          type="file"
          accept="audio/*"
          className="text-xs file:mr-2 file:rounded-md file:border-0 file:bg-[var(--border)] file:px-2 file:py-1.5 file:text-[var(--text)]"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onLocalFile(f);
            e.target.value = "";
          }}
        />
        {customLabel ? (
          <span className="text-xs text-cyan-300/90">Loaded: {customLabel}</span>
        ) : null}
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-[var(--muted)]">BPM (manual)</span>
        <input
          type="number"
          min={40}
          max={240}
          step={1}
          value={Math.round(bpm)}
          onChange={(e) => onBpmChange(Number(e.target.value))}
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-sm text-[var(--text)] outline-none ring-cyan-400/30 focus:ring-2"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onPlay}
          disabled={isPlaying}
          className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 shadow hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Play
        </button>
        <button
          type="button"
          onClick={onPause}
          disabled={!isPlaying}
          className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--border)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Pause
        </button>
        <button
          type="button"
          onClick={onReset}
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-500/20"
        >
          Reset
        </button>
      </div>

      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-sm tabular-nums text-cyan-200/95">
        <span className="text-[var(--muted)]">Time </span>
        {formatTime(displayTime)}
      </div>
    </aside>
  );
}
