/**
 * Shared on-body action labels near the tracked torso (canvas 2D).
 * Used by `CameraStage` and `CustomActionTrainer` so default rules + custom TF predictions
 * share one layout: readable text, correct mirror alignment, stacked above the chest region.
 */

import type { DanceActionId } from "@/lib/dance/sequence";
import { CUSTOM_IDLE_LABEL } from "@/lib/ml/types";
import type { StablePlayerId } from "@/lib/pose/types";
import { formatActionLabel, type EphemeralActionDisplay } from "@/lib/pose/actions";

/** One line drawn above the torso (bottom of text anchored upward). */
export type TorsoLabelLine = {
  /** Main text (already human-readable). */
  text: string;
  /** Optional trailing detail on the same line, e.g. "86%" or "(0.86)". */
  detail?: string;
  /** Visual role — drives color. */
  role: "builtin" | "custom" | "status";
};

export type CustomBodyPrediction = {
  playerId: StablePlayerId;
  label: string;
  confidence: number;
};

/** Pretty-print a stored class name (snake_case → spaced caps). */
export function formatCustomClassBodyLabel(raw: string): string {
  return raw.replace(/_/g, " ").toUpperCase();
}

function lineColor(role: TorsoLabelLine["role"], playerStroke: string): string {
  switch (role) {
    case "builtin":
      return playerStroke;
    case "custom":
      return "rgba(232, 121, 249, 0.98)"; // fuchsia-300-ish, matches stage “Custom” HUD
    case "status":
      return "rgba(251, 191, 36, 0.98)"; // amber for RECORDING / prep
    default:
      return playerStroke;
  }
}

/** Vertical gap between stacked on-body action lines (export for stage layout). */
export const TORSO_ACTION_LABEL_LINE_GAP_PX = 17;
/** Innermost action line sits this far above torso center (screen Y up). */
const INNER_GAP_PX = 10;

/**
 * Whether to paint a custom softmax hit on the main stage body overlay.
 * Suppresses idle spam when the model is uncertain.
 */
export function shouldShowCustomOnMainStageBody(pred: CustomBodyPrediction): boolean {
  if (pred.label === CUSTOM_IDLE_LABEL && pred.confidence < 0.45) return false;
  return true;
}

/**
 * Build stacked torso lines for the main game stage: built-in discrete events stay primary;
 * live custom softmax is secondary when both apply.
 */
export function buildMainStageTorsoLines(
  ephemeral: EphemeralActionDisplay | undefined,
  custom: CustomBodyPrediction | null,
  playerId: StablePlayerId
): TorsoLabelLine[] {
  const lines: TorsoLabelLine[] = [];
  const builtinText =
    ephemeral?.playerId === playerId && ephemeral.action
      ? formatActionLabel(ephemeral.action)
      : null;

  const customOk =
    custom &&
    custom.playerId === playerId &&
    shouldShowCustomOnMainStageBody(custom);

  if (builtinText) {
    lines.push({ text: builtinText, role: "builtin" });
  }
  if (customOk) {
    const body = formatCustomClassBodyLabel(custom.label);
    const detail = `${Math.round(custom.confidence * 100)}%`;
    lines.push({ text: body, detail, role: "custom" });
  }
  return lines;
}

/**
 * Training view: optional built-in flash, live custom prediction, and capture state.
 */
export function buildTrainerTorsoLines(opts: {
  builtinAction: DanceActionId | null;
  custom: { label: string; confidence: number } | null;
  phase: "idle" | "countdown" | "recording";
  recordingLabel: string | null;
  /** Class about to be recorded after countdown (same ref as locked label). */
  countdownTargetLabel: string | null;
}): TorsoLabelLine[] {
  const lines: TorsoLabelLine[] = [];

  if (opts.phase === "recording" && opts.recordingLabel) {
    lines.push({
      text: "RECORDING",
      detail: formatCustomClassBodyLabel(opts.recordingLabel),
      role: "status",
    });
  } else if (opts.phase === "countdown") {
    lines.push({
      text: "GET READY",
      detail: opts.countdownTargetLabel
        ? formatCustomClassBodyLabel(opts.countdownTargetLabel)
        : undefined,
      role: "status",
    });
  }

  if (opts.builtinAction) {
    lines.push({ text: formatActionLabel(opts.builtinAction), role: "builtin" });
  }

  if (opts.custom) {
    const body = formatCustomClassBodyLabel(opts.custom.label);
    const detail = `${Math.round(opts.custom.confidence * 100)}%`;
    lines.push({ text: `PREDICTED · ${body}`, detail, role: "custom" });
  }

  return lines;
}

/**
 * Draw stacked labels upward from `torsoY - INNER_GAP_PX`. First entry is closest to the body.
 * Call in **CSS pixel** space (after `ctx.scale(dpr, dpr)`).
 */
export function drawTorsoActionLabels(
  ctx: CanvasRenderingContext2D,
  torsoX: number,
  torsoY: number,
  lines: readonly TorsoLabelLine[],
  playerStroke: string
): void {
  if (lines.length === 0) return;

  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  let y = torsoY - INNER_GAP_PX;
  for (const line of lines) {
    const fill = lineColor(line.role, playerStroke);
    const isStatus = line.role === "status";
    ctx.font = isStatus
      ? "700 11px system-ui, sans-serif"
      : line.role === "custom"
        ? "600 11px system-ui, sans-serif"
        : "600 12px system-ui, sans-serif";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.fillStyle = fill;

    const main = line.text;
    const full = line.detail ? `${main}  ${line.detail}` : main;
    ctx.strokeText(full, torsoX, y);
    ctx.fillText(full, torsoX, y);
    y -= TORSO_ACTION_LABEL_LINE_GAP_PX;
  }
}
