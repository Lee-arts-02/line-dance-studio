"use client";

import type { DanceActionId } from "@/lib/dance/sequence";
import { normalizeLabel } from "@/lib/ml/training";

/** Visual accent for the pill — subtle, keeps text readable on any background. */
export type ActionLabelOverlayVariant = "neutral" | "custom" | "builtin" | "idle" | "target";

export type TrainerCameraOverlayModel = {
  text: string;
  variant: ActionLabelOverlayVariant;
};

/**
 * Derives the single-line action string for the trainer camera HUD.
 * - Built-in rule flash (`step_left`, `step_right`, `clap`) first whenever active,
 *   including while a custom model is inferring — so gameplay moves stay visible.
 * - Else trained model softmax: class name only (uppercase), no confidence.
 * - Else trained but no window: "NO ACTION".
 * - Else pre-training: selected record class as fallback context.
 */
export function resolveTrainerCameraOverlayLabel(opts: {
  /** Both TF model and metadata available (same gate as `predictCustomSequence`). */
  canInfer: boolean;
  /** Same-frame softmax result from the live buffer, or null. */
  liveCustomPred: { label: string; confidence: number } | null;
  /** Ephemeral built-in pose event for the primary player, if any. */
  previewBuiltin: DanceActionId | null;
  /** Current dropdown value (ref-synced for RAF loop). */
  recordLabel: string;
}): TrainerCameraOverlayModel {
  if (opts.previewBuiltin) {
    return { text: opts.previewBuiltin.toUpperCase(), variant: "builtin" };
  }
  if (opts.canInfer && opts.liveCustomPred) {
    const text = normalizeLabel(opts.liveCustomPred.label).toUpperCase();
    return { text, variant: text === "IDLE" ? "idle" : "custom" };
  }
  if (opts.canInfer) {
    return { text: "NO ACTION", variant: "neutral" };
  }
  const text = normalizeLabel(opts.recordLabel).toUpperCase();
  return { text, variant: text === "IDLE" ? "idle" : "target" };
}

type ActionLabelOverlayProps = {
  model: TrainerCameraOverlayModel;
};

const VARIANT_RING: Record<ActionLabelOverlayVariant, string> = {
  neutral: "ring-white/25",
  custom: "ring-fuchsia-400/50",
  builtin: "ring-cyan-300/45",
  idle: "ring-emerald-300/40",
  target: "ring-amber-300/45",
};

/**
 * Top-right HUD over the training camera. Kept as a DOM sibling of the mirrored
 * `<video>` so text is never horizontally flipped.
 */
export function ActionLabelOverlay({ model }: ActionLabelOverlayProps) {
  return (
    <div
      className="pointer-events-none absolute right-3 top-3 z-[15] max-w-[min(92%,420px)] select-none"
      aria-live="polite"
      aria-atomic="true"
    >
      <div
        key={`${model.text}-${model.variant}`}
        className={[
          "rounded-lg border border-white/10 px-3 py-2 font-mono text-xl font-bold leading-tight tracking-wide text-white sm:text-2xl",
          "bg-black/40 shadow-lg backdrop-blur-sm ring-1 drop-shadow-[0_2px_10px_rgba(0,0,0,0.75)] motion-safe:animate-[actionLabelPop_0.38s_ease-out_1]",
          VARIANT_RING[model.variant],
        ].join(" ")}
      >
        {model.text}
      </div>
    </div>
  );
}
