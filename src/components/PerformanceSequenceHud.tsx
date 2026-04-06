"use client";

import {
  getActionChipStyle,
  REST_CHIP_CLASS,
  type BeatSlot,
  getBeatSlotForGlobalBeat,
  beatFloatToBeatIndex,
} from "@/lib/dance/sequence";

type PerformanceSequenceHudProps = {
  currentBeatFloat: number;
  sequence: readonly BeatSlot[];
};

/** Upcoming rest beat — short, readable prompts (not “REST”). */
function prepHintForNextRest(beatIndex: number): "PREP" | "READY" {
  return beatIndex % 2 === 0 ? "PREP" : "READY";
}

/**
 * Compact performance overlay: readable prompts, minimal obstruction of the camera view.
 */
export function PerformanceSequenceHud({ currentBeatFloat, sequence }: PerformanceSequenceHudProps) {
  const bf = currentBeatFloat;
  const curBeat = beatFloatToBeatIndex(bf);
  const curSlot = getBeatSlotForGlobalBeat(curBeat, sequence);
  const nextSlot = getBeatSlotForGlobalBeat(curBeat + 1, sequence);
  const laterSlots = [2, 3].map((d) => getBeatSlotForGlobalBeat(curBeat + d, sequence));

  const nextPrepLabel = nextSlot.kind === "rest" ? prepHintForNextRest(curBeat + 1) : null;

  return (
    <div className="pointer-events-none w-full select-none px-2 pt-1">
      <div className="mx-auto max-w-3xl rounded-xl border border-white/10 bg-black/18 px-3 py-2.5 shadow-sm backdrop-blur-sm sm:px-4 sm:py-3">
        <p className="mb-2 text-center text-[9px] font-semibold uppercase tracking-[0.35em] text-white/40">
          Now · Next
        </p>

        <div className="flex flex-col items-stretch gap-2.5 sm:flex-row sm:items-end sm:justify-center sm:gap-5">
          <div className="flex min-w-0 flex-1 flex-col items-center">
            <span className="mb-1 text-[9px] uppercase tracking-[0.2em] text-emerald-200/65">
              {curSlot.kind === "action" ? "Current" : "Now"}
            </span>
            {curSlot.kind === "action" ? (
              <div
                className={[
                  "flex w-full max-w-sm flex-col items-center justify-center rounded-xl border px-4 py-3 text-center sm:px-5 sm:py-3.5",
                  getActionChipStyle(curSlot.action).chip,
                  getActionChipStyle(curSlot.action).glow,
                  "ring-1 ring-cyan-400/50 shadow-[0_0_24px_rgba(34,211,238,0.22)]",
                ].join(" ")}
              >
                <span className="text-4xl font-black uppercase tracking-[0.12em] text-white sm:text-4xl">
                  {curSlot.displayLabel}
                </span>
              </div>
            ) : (
              <div
                className={[
                  "flex w-full max-w-sm flex-col items-center justify-center rounded-xl border px-4 py-2.5 text-center",
                  REST_CHIP_CLASS,
                  "ring-1 ring-white/15",
                ].join(" ")}
              >
                <span className="text-2xl font-semibold uppercase tracking-[0.3em] text-white/45">
                  {prepHintForNextRest(curBeat)}
                </span>
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-center sm:pb-0.5">
            <span className="mb-1 text-[9px] uppercase tracking-[0.2em] text-amber-200/55">
              Next
            </span>
            {nextSlot.kind === "action" ? (
              <div
                className={[
                  "flex min-w-[120px] flex-col items-center justify-center rounded-lg border px-3 py-2 text-center sm:min-w-[132px]",
                  getActionChipStyle(nextSlot.action).chip,
                  "ring-1 ring-white/15",
                ].join(" ")}
              >
                <span className="text-2xl font-bold uppercase tracking-[0.1em] text-white/95">
                  {nextSlot.displayLabel}
                </span>
              </div>
            ) : (
              <div
                className={[
                  "flex min-w-[120px] flex-col items-center justify-center rounded-lg border px-3 py-2 text-center sm:min-w-[132px]",
                  REST_CHIP_CLASS,
                  "ring-1 ring-white/12",
                ].join(" ")}
              >
                <span className="text-lg font-medium uppercase tracking-[0.28em] text-white/40">
                  {nextPrepLabel ?? "PREP"}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 border-t border-white/8 pt-2">
          <span className="text-[8px] uppercase tracking-wider text-white/28">Then</span>
          {laterSlots.map((s, i) => {
            if (s.kind === "action") {
              const st = getActionChipStyle(s.action);
              return (
                <span
                  key={`later-${i}-${s.displayLabel}`}
                  className={[
                    "rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-45",
                    st.chip,
                  ].join(" ")}
                >
                  {s.displayLabel}
                </span>
              );
            }
            return (
              <span
                key={`later-rest-${i}`}
                className="rounded border border-white/12 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.15em] text-white/28 opacity-40"
              >
                {prepHintForNextRest(curBeat + 2 + i)}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
