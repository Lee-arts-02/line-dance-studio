"use client";

import {
  getActionChipStyle,
  type BeatSlot,
  getBeatSlotForGlobalBeat,
  beatFloatToBeatIndex,
  firstActionBeatOnOrAfter,
} from "@/lib/dance/sequence";

type PerformanceSequenceHudProps = {
  currentBeatFloat: number;
  sequence: readonly BeatSlot[];
};

const HUD_SHELL =
  "mx-auto max-w-3xl rounded-xl border border-cyan-400/25 bg-black/50 px-3 py-2.5 shadow-[0_0_32px_rgba(34,211,238,0.12),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md sm:px-4 sm:py-3";

const CURRENT_ACTION_TEXT =
  "text-4xl font-black uppercase tracking-[0.14em] text-transparent bg-clip-text bg-gradient-to-br from-cyan-200 via-sky-200 to-fuchsia-300 drop-shadow-[0_0_18px_rgba(34,211,238,0.75),0_2px_8px_rgba(0,0,0,0.85)] sm:text-[2.65rem]";

const NEXT_ACTION_TEXT =
  "text-2xl font-bold uppercase tracking-[0.12em] text-fuchsia-200/90 drop-shadow-[0_0_12px_rgba(232,121,249,0.45)]";

/**
 * Performance overlay: only **action** beats are shown; rest beats are skipped visually
 * (underlying timing / sync logic unchanged).
 */
export function PerformanceSequenceHud({ currentBeatFloat, sequence }: PerformanceSequenceHudProps) {
  const bf = currentBeatFloat;
  const curBeat = beatFloatToBeatIndex(bf);

  const b0 = firstActionBeatOnOrAfter(curBeat, sequence);
  const b1 = b0 != null ? firstActionBeatOnOrAfter(b0 + 1, sequence) : null;

  const currentSlot: BeatSlot | null =
    b0 != null ? getBeatSlotForGlobalBeat(b0, sequence) : null;
  const nextSlot: BeatSlot | null = b1 != null ? getBeatSlotForGlobalBeat(b1, sequence) : null;

  const currentAction = currentSlot?.kind === "action" ? currentSlot : null;
  const nextAction = nextSlot?.kind === "action" ? nextSlot : null;

  /** Further upcoming actions for the “Then” row (no rest / PREP / READY labels). */
  const thenActions: Array<Extract<BeatSlot, { kind: "action" }>> = [];
  let scan = b1 != null ? firstActionBeatOnOrAfter(b1 + 1, sequence) : null;
  for (let i = 0; i < 4 && scan != null; i++) {
    const s = getBeatSlotForGlobalBeat(scan, sequence);
    if (s.kind === "action") thenActions.push(s);
    scan = firstActionBeatOnOrAfter(scan + 1, sequence);
  }

  return (
    <div className="pointer-events-none w-full select-none px-2 pt-1">
      <div className={HUD_SHELL}>
        <p className="mb-2 text-center text-[9px] font-semibold uppercase tracking-[0.38em] text-cyan-300/55">
          Now · Next
        </p>

        <div className="flex flex-col items-stretch gap-2.5 sm:flex-row sm:items-end sm:justify-center sm:gap-5">
          <div className="flex min-w-0 flex-1 flex-col items-center">
            <span className="mb-1 text-[9px] uppercase tracking-[0.22em] text-amber-300/75">Current</span>
            {currentAction ? (
              <div
                className={[
                  "flex w-full max-w-sm flex-col items-center justify-center rounded-xl border px-4 py-3 text-center sm:px-5 sm:py-3.5",
                  getActionChipStyle(currentAction.action).chip,
                  "border-cyan-400/45 bg-gradient-to-b from-cyan-950/55 to-black/55",
                  "ring-2 ring-cyan-400/55 shadow-[0_0_36px_rgba(34,211,238,0.35)]",
                ].join(" ")}
              >
                <span className={CURRENT_ACTION_TEXT}>{currentAction.displayLabel}</span>
              </div>
            ) : (
              <div className="flex min-h-[4.5rem] w-full max-w-sm items-center justify-center rounded-xl border border-white/10 bg-black/30 px-4 text-[11px] text-white/35">
                —
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-center sm:pb-0.5">
            <span className="mb-1 text-[9px] uppercase tracking-[0.22em] text-fuchsia-300/65">Next</span>
            {nextAction ? (
              <div
                className={[
                  "flex min-w-[120px] flex-col items-center justify-center rounded-lg border border-fuchsia-400/35 bg-black/45 px-3 py-2 text-center sm:min-w-[132px]",
                  getActionChipStyle(nextAction.action).chip,
                  "ring-1 ring-fuchsia-400/25 shadow-[0_0_18px_rgba(217,70,239,0.2)]",
                ].join(" ")}
              >
                <span className={NEXT_ACTION_TEXT}>{nextAction.displayLabel}</span>
              </div>
            ) : (
              <div className="flex min-h-[3.5rem] min-w-[120px] items-center justify-center rounded-lg border border-white/10 bg-black/25 px-3 text-[11px] text-white/30 sm:min-w-[132px]">
                —
              </div>
            )}
          </div>
        </div>

        {thenActions.length > 0 ? (
          <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 border-t border-cyan-400/15 pt-2">
            <span className="text-[8px] uppercase tracking-wider text-amber-300/50">Then</span>
            {thenActions.map((s, i) => {
              const st = getActionChipStyle(s.action);
              return (
                <span
                  key={`then-${i}-${s.displayLabel}`}
                  className={[
                    "rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    "border-cyan-400/25 text-cyan-200/80 shadow-[0_0_10px_rgba(34,211,238,0.15)] opacity-80",
                    st.chip,
                  ].join(" ")}
                >
                  {s.displayLabel}
                </span>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
