"use client";

import { useEffect, useState } from "react";
import type { PerformanceSessionResult } from "@/lib/game/performanceSessionResult";
import { stopResultSfx } from "@/lib/audio/resultSfx";

type PerformanceResultsPanelProps = {
  open: boolean;
  /** Increments each time a session ends — drives one-shot animation + SFX (Strict Mode–safe). */
  playbackId: number;
  result: PerformanceSessionResult | null;
  onClose: () => void;
};

/** Count-up duration (~2–3s) — aligned with audible result SFX window. */
const RESULT_ANIM_MS = 3000;
/** Short beat after bars land before the stage line appears. */
const MESSAGE_DELAY_MS = 160;

function easeOutQuart(t: number): number {
  return 1 - (1 - t) ** 4;
}

type DisplaySnapshot = {
  sync: number;
  correct: number;
  flow: number;
  peak: number;
  duration: number;
};

const ZERO: DisplaySnapshot = {
  sync: 0,
  correct: 0,
  flow: 0,
  peak: 0,
  duration: 0,
};

/**
 * Full-screen rhythm-game results: SFX + simultaneous ease-out build, then final message.
 */
export function PerformanceResultsPanel({
  open,
  playbackId,
  result,
  onClose,
}: PerformanceResultsPanelProps) {
  const [display, setDisplay] = useState<DisplaySnapshot>(ZERO);
  const [buildDone, setBuildDone] = useState(false);
  const [showMessage, setShowMessage] = useState(false);

  useEffect(() => {
    if (!open || !result) {
      setDisplay(ZERO);
      setBuildDone(false);
      setShowMessage(false);
      return;
    }

    const targets: DisplaySnapshot = {
      sync: result.syncTotal,
      correct: result.correctTotal,
      flow: result.teamFlowFinal,
      peak: result.peakTeamFlow,
      duration: result.durationSec,
    };

    let cancelled = false;
    setDisplay(ZERO);
    setBuildDone(false);
    setShowMessage(false);

    const t0 = performance.now();
    let raf = 0;

    const step = (now: number) => {
      if (cancelled) return;
      const u = Math.min(1, (now - t0) / RESULT_ANIM_MS);
      const e = easeOutQuart(u);
      setDisplay({
        sync: Math.round(targets.sync * e),
        correct: Math.round(targets.correct * e),
        flow: targets.flow * e,
        peak: targets.peak * e,
        duration: targets.duration * e,
      });
      if (u < 1) {
        raf = requestAnimationFrame(step);
      } else {
        setDisplay(targets);
        setBuildDone(true);
        window.setTimeout(() => {
          if (!cancelled) setShowMessage(true);
        }, MESSAGE_DELAY_MS);
      }
    };

    raf = requestAnimationFrame(step);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stopResultSfx();
    };
  }, [open, result, playbackId]);

  if (!open || !result) return null;

  const flowPct = Math.round(display.flow * 100);
  const peakPct = Math.round(display.peak * 100);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/72 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal
      aria-labelledby="perf-results-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close results backdrop"
        onClick={onClose}
      />
      <div
        className="perf-results-panel-in relative z-[61] w-full max-w-lg overflow-hidden rounded-2xl border border-fuchsia-500/35 bg-gradient-to-b from-slate-950/95 via-violet-950/90 to-black/95 px-6 py-8 shadow-[0_0_60px_rgba(217,70,239,0.35),inset_0_1px_0_rgba(255,255,255,0.12)] sm:px-10 sm:py-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pointer-events-none absolute -left-24 -top-24 h-56 w-56 rounded-full bg-fuchsia-600/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -right-16 h-48 w-48 rounded-full bg-cyan-500/15 blur-3xl" />

        <h2
          id="perf-results-title"
          className="relative text-center font-black uppercase tracking-[0.35em] text-white/90 drop-shadow-[0_0_18px_rgba(255,255,255,0.35)]"
          style={{ fontSize: "clamp(1.1rem, 3.5vw, 1.35rem)" }}
        >
          Session results
        </h2>
        <p className="relative mt-2 text-center text-[11px] font-medium uppercase tracking-[0.25em] text-white/40">
          Group performance · this run only
        </p>

        <div className="relative mt-8 grid gap-6 sm:grid-cols-2">
          <div
            className={`rounded-xl border border-cyan-500/30 bg-black/40 px-4 py-3 text-center shadow-inner transition-[box-shadow] duration-500 ${
              buildDone ? "shadow-[0_0_28px_rgba(34,211,238,0.28)]" : "shadow-none"
            }`}
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200/85">Sync combo total</div>
            <div className="mt-1 font-mono text-4xl font-black tabular-nums text-cyan-200 drop-shadow-[0_0_22px_rgba(34,211,238,0.65)] sm:text-5xl">
              {display.sync}
            </div>
          </div>
          <div
            className={`rounded-xl border border-amber-400/35 bg-black/40 px-4 py-3 text-center shadow-inner transition-[box-shadow] duration-500 ${
              buildDone ? "shadow-[0_0_26px_rgba(251,191,36,0.3)]" : "shadow-none"
            }`}
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200/85">Correct combo total</div>
            <div className="mt-1 font-mono text-4xl font-black tabular-nums text-amber-200 drop-shadow-[0_0_20px_rgba(250,204,21,0.55)] sm:text-5xl">
              {display.correct}
            </div>
          </div>
        </div>

        <div className="relative mt-6 rounded-xl border border-fuchsia-500/25 bg-black/40 px-4 py-3">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.18em] text-fuchsia-200/80">
            <span>Final team flow</span>
            <span className="font-mono tabular-nums text-fuchsia-100">{flowPct}%</span>
          </div>
          <div
            className="mt-2 h-3 overflow-hidden rounded-full bg-black/50 ring-1 ring-white/10"
            role="meter"
            aria-valuenow={flowPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={`h-full rounded-full bg-gradient-to-r from-fuchsia-600 via-pink-500 to-amber-400 ${
                buildDone ? "transition-[width] duration-300 ease-out" : ""
              }`}
              style={{ width: `${flowPct}%` }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">
            <span>Peak team flow</span>
            <span className="font-mono tabular-nums text-white/85">{peakPct}%</span>
          </div>
        </div>

        <div className="relative mt-4 flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">
          <span>Total time</span>
          <span className="font-mono tabular-nums text-sky-200/90">{display.duration.toFixed(1)}s</span>
        </div>

        <div
          className={`relative mt-8 min-h-[3rem] text-center transition duration-500 ${
            showMessage ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
          }`}
        >
          <p className="font-black uppercase tracking-[0.28em] text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-fuchsia-200 to-cyan-200 drop-shadow-[0_0_20px_rgba(250,232,255,0.45)] sm:text-lg">
            {showMessage ? result.message : "\u00a0"}
          </p>
        </div>

        <div className="relative mt-8 flex justify-center">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/20 bg-white/10 px-8 py-2.5 text-xs font-bold uppercase tracking-[0.2em] text-white/95 shadow-[0_0_20px_rgba(255,255,255,0.12)] backdrop-blur-sm transition hover:bg-white/18"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
