"use client";

import {
  getActionChipStyle,
  REST_CHIP_CLASS,
  type BeatSlot,
  getBeatSlotForGlobalBeat,
  loopBeatIndexFromGlobalBeat,
} from "@/lib/dance/sequence";

/** Horizontal scale: one beat = this many CSS pixels. */
export const PIXELS_PER_BEAT_DEFAULT = 80;
export const PIXELS_PER_BEAT_HUD = 100;

const HIT_WINDOW_BEATS = 0.2;

export type SequenceBarVariant = "default" | "hud";

type SequenceBarProps = {
  currentBeatFloat: number;
  sequence: readonly BeatSlot[];
  variant?: SequenceBarVariant;
  overlay?: boolean;
};

function classifyBeatState(
  beatIndex: number,
  currentBeatFloat: number
): "future" | "current" | "past" {
  const cur = Math.floor(currentBeatFloat);
  if (beatIndex < cur) return "past";
  if (beatIndex > cur) return "future";
  return "current";
}

function restDisplayLabel(slot: Extract<BeatSlot, { kind: "rest" }>): string {
  return slot.label === "prep" ? "PREP" : "REST";
}

/**
 * Scrolling lane: one column per beat (action or prep/rest).
 */
export function SequenceBar({
  currentBeatFloat,
  sequence,
  variant = "default",
  overlay = false,
}: SequenceBarProps) {
  const bf = currentBeatFloat;
  const pixelsPerBeat = variant === "hud" ? PIXELS_PER_BEAT_HUD : PIXELS_PER_BEAT_DEFAULT;
  const currentBeat = Math.floor(bf);
  const fromBeat = currentBeat - 2;
  const toBeat = currentBeat + (variant === "hud" ? 10 : 14);
  const beats: number[] = [];
  for (let k = fromBeat; k <= toBeat; k++) beats.push(k);

  const hitZoneHalfPx = HIT_WINDOW_BEATS * pixelsPerBeat;
  const loopLen = Math.max(1, sequence.length);
  const laneH = variant === "hud" ? "min-h-[148px] sm:min-h-[168px]" : "min-h-[132px] sm:min-h-[148px]";
  const labelClass =
    variant === "hud"
      ? "text-sm font-extrabold uppercase tracking-widest text-white sm:text-base"
      : "text-xs font-bold uppercase tracking-wider text-white/80 sm:text-sm";
  const restLabelClass =
    variant === "hud"
      ? "text-xs font-bold uppercase tracking-[0.2em] text-white/50 sm:text-sm"
      : "text-[10px] font-semibold uppercase tracking-wider text-white/45 sm:text-xs";

  const shell = overlay
    ? "rounded-2xl border border-white/15 bg-black/50 shadow-2xl shadow-black/40 backdrop-blur-md"
    : "rounded-2xl border border-[var(--border)] bg-[var(--panel)]/60 shadow-inner";

  return (
    <div className="w-full">
      {!overlay ? (
        <p className="mb-2 text-center text-xs font-medium uppercase tracking-[0.25em] text-[var(--muted)]">
          Sequence (1 beat move · 1 beat prep)
        </p>
      ) : (
        <p className="mb-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.35em] text-white/55">
          Sequence
        </p>
      )}

      <div className={`relative w-full overflow-hidden ${shell} ${laneH}`}>
        <div
          className={
            overlay
              ? "absolute inset-0 bg-gradient-to-b from-black/30 to-black/55"
              : "absolute inset-0 bg-gradient-to-b from-[var(--bg)]/50 to-[var(--panel)]/80"
          }
        />

        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[var(--border)]/80" />

        <div
          className={
            overlay
              ? "pointer-events-none absolute inset-y-4 left-1/2 z-[5] -translate-x-1/2 rounded-md bg-cyan-400/18 shadow-[inset_0_0_28px_rgba(34,211,238,0.22)]"
              : "pointer-events-none absolute inset-y-3 left-1/2 z-[5] -translate-x-1/2 rounded-md bg-cyan-400/10 shadow-[inset_0_0_24px_rgba(34,211,238,0.12)]"
          }
          style={{ width: `${hitZoneHalfPx * 2}px` }}
          aria-hidden
        />

        <div
          className={
            overlay
              ? "pointer-events-none absolute inset-y-0 left-1/2 z-[6] w-[4px] -translate-x-1/2 bg-gradient-to-b from-cyan-300/30 via-cyan-400 to-cyan-300/30 shadow-[0_0_20px_rgba(34,211,238,0.85)]"
              : "pointer-events-none absolute inset-y-0 left-1/2 z-[6] w-[3px] -translate-x-1/2 bg-gradient-to-b from-cyan-300/20 via-cyan-400 to-cyan-300/20 shadow-[0_0_16px_rgba(34,211,238,0.7)]"
          }
          aria-hidden
        />

        <div className="absolute inset-0">
          {beats.map((k) => {
            const slot = getBeatSlotForGlobalBeat(k, sequence);
            const centerBf = k + 0.5;
            const offsetPx = (centerBf - bf) * pixelsPerBeat;
            const state = classifyBeatState(k, bf);
            const loopIdx = loopBeatIndexFromGlobalBeat(k, loopLen);
            const isLoopStart = loopIdx === 0;

            const opacity =
              state === "future"
                ? overlay
                  ? "opacity-60"
                  : "opacity-50"
                : state === "past"
                  ? overlay
                    ? "opacity-40"
                    : "opacity-32"
                  : "opacity-100";
            const scale = state === "current" ? "scale-105 sm:scale-110" : "scale-100";

            const chipPad =
              variant === "hud" ? "px-3 py-2.5 sm:px-4 sm:py-3" : "px-2.5 py-2 sm:px-3 sm:py-2.5";

            if (slot.kind === "action") {
              const styles = getActionChipStyle(slot.action);
              const ring =
                state === "current"
                  ? overlay
                    ? `ring-2 ring-cyan-200/95 ${styles.glow} shadow-[0_0_28px_rgba(34,211,238,0.55)]`
                    : `ring-2 ring-cyan-300/80 ${styles.glow}`
                  : overlay
                    ? "ring-1 ring-white/25"
                    : "ring-1 ring-white/10";

              return (
                <div
                  key={k}
                  className="absolute top-1/2 z-[4] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center"
                  style={{ left: `calc(50% + ${offsetPx}px)` }}
                >
                  <div
                    className={[
                      "flex select-none flex-col items-center justify-center rounded-xl border text-center transition-[transform,opacity] duration-100",
                      chipPad,
                      styles.chip,
                      opacity,
                      scale,
                      ring,
                    ].join(" ")}
                    style={{ minWidth: `${pixelsPerBeat - 10}px` }}
                  >
                    <span className={labelClass}>{slot.displayLabel}</span>
                    {isLoopStart ? (
                      <span className="mt-1 text-[9px] font-medium uppercase tracking-wider text-white/35">
                        ↻
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            }

            const ringRest =
              state === "current"
                ? overlay
                  ? "ring-1 ring-white/30"
                  : "ring-1 ring-white/15"
                : "ring-1 ring-white/10";

            return (
              <div
                key={k}
                className="absolute top-1/2 z-[4] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center"
                style={{ left: `calc(50% + ${offsetPx}px)` }}
              >
                <div
                  className={[
                    "flex select-none flex-col items-center justify-center rounded-xl border text-center transition-[transform,opacity] duration-100",
                    chipPad,
                    REST_CHIP_CLASS,
                    opacity,
                    scale,
                    ringRest,
                  ].join(" ")}
                  style={{ minWidth: `${pixelsPerBeat - 10}px` }}
                >
                  <span className={restLabelClass}>{restDisplayLabel(slot)}</span>
                  <span className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-white/25">
                    {loopIdx + 1}/{loopLen}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
