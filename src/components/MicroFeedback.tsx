"use client";

import type { MicroFeedbackItem } from "@/hooks/usePerformanceMetrics";

type MicroFeedbackProps = {
  item: MicroFeedbackItem | null;
  /** Parent positions the bubble (e.g. centered overlay). */
  embedded?: boolean;
  /** Large DDR line under the combo stack — same top-left column as SYNC/CORRECT. */
  underCombo?: boolean;
};

/**
 * Short-lived callout (never mirrored: lives in unmirrored overlay siblings of `<video />`).
 */
export function MicroFeedback({ item, embedded = false, underCombo = false }: MicroFeedbackProps) {
  if (!item) return null;

  const bubble = underCombo ? (
    <span
      className="block w-full max-w-[18rem] rounded-xl border border-cyan-400/40 bg-black/60 px-2 py-2 text-left text-3xl font-black uppercase leading-[1.05] tracking-[0.05em] text-white shadow-[0_0_28px_rgba(34,211,238,0.18)] backdrop-blur-sm [animation:perf-micro-ddr_0.62s_cubic-bezier(0.22,1,0.36,1)_forwards] sm:max-w-[19rem] sm:px-3 sm:py-2.5 sm:text-4xl"
      style={{
        textShadow:
          "0 2px 0 rgba(0,0,0,0.9), 0 0 22px rgba(34,211,238,0.5), 0 0 36px rgba(250,204,21,0.12)",
      }}
    >
      {item.text}
    </span>
  ) : (
    <span
      className="max-w-[92%] rounded-full border border-white/25 bg-black/45 px-6 py-2.5 text-center text-lg font-black uppercase tracking-[0.12em] text-white shadow-xl backdrop-blur-md [animation:perf-micro-pop_0.72s_ease-out_forwards] sm:px-7 sm:py-3 sm:text-xl"
      style={{
        textShadow: "0 2px 14px rgba(0,0,0,0.92), 0 0 24px rgba(34,211,238,0.4)",
      }}
    >
      {item.text}
    </span>
  );

  if (underCombo) {
    return (
      <div key={item.id} className="relative z-[2] w-full min-h-[3.5rem]" role="status">
        {bubble}
      </div>
    );
  }

  if (embedded) {
    return (
      <div key={item.id} className="flex w-full justify-center" role="status">
        {bubble}
      </div>
    );
  }

  return (
    <div
      key={item.id}
      className="pointer-events-none absolute inset-x-0 top-[18%] z-[26] flex justify-center px-4"
      role="status"
    >
      {bubble}
    </div>
  );
}
