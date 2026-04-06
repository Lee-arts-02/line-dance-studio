/**
 * Timing judgment: one beat per action; rest beats are not judgeable.
 */

import {
  actionBeatCenterBeatFloat,
  beatFloatToBeatIndex,
  getBeatSlotForGlobalBeat,
  isDefaultDanceAction,
  normalizeSequenceAction,
  type BeatSlot,
} from "@/lib/dance/sequence";
import type { JudgmentResult, PlayerActionEvent } from "./types";

/** Half-width of perfect window (ms) vs beat center. */
export const PERFECT_WINDOW_MS = 100;
/** Half-width of good window (ms). */
export const GOOD_WINDOW_MS = 220;

const POINTS_PERFECT = 100;
const POINTS_GOOD = 60;
const POINTS_MISS = 0;

function pointsForKind(kind: JudgmentResult["kind"]): number {
  switch (kind) {
    case "perfect":
      return POINTS_PERFECT;
    case "good":
      return POINTS_GOOD;
    default:
      return POINTS_MISS;
  }
}

export function beatFloatFromAudio(audioTimeSec: number, bpm: number): number {
  return (audioTimeSec * bpm) / 60;
}

/** Wall-clock time at continuous beat position `beatFloat`. */
export function timeSecForBeatFloat(beatFloat: number, bpm: number): number {
  return (beatFloat * 60) / bpm;
}

function eventMatchesSlot(
  slot: Extract<BeatSlot, { kind: "action" }>,
  event: PlayerActionEvent
): boolean {
  const exp = normalizeSequenceAction(String(slot.action));
  const got = normalizeSequenceAction(event.action);
  if (exp !== got) return false;

  if (isDefaultDanceAction(slot.action)) {
    return event.detectionSource === "default_rules";
  }
  return event.detectionSource === "custom_model";
}

/**
 * Map an action event to the current integer beat; judge only on action beats.
 * Returns `null` on rest beats (no score, no combo change, not recorded on scoreboard).
 */
export function judgePlayerAction(
  event: PlayerActionEvent,
  bpm: number,
  sequence: readonly BeatSlot[]
): JudgmentResult | null {
  const { audioTimeSec } = event;
  const bf = beatFloatFromAudio(audioTimeSec, bpm);
  const beatIndex = beatFloatToBeatIndex(bf);

  const slot = getBeatSlotForGlobalBeat(beatIndex, sequence);
  if (slot.kind !== "action") {
    return null;
  }

  const centerBf = actionBeatCenterBeatFloat(beatIndex);
  const centerSec = timeSecForBeatFloat(centerBf, bpm);
  const deltaMs = (audioTimeSec - centerSec) * 1000;

  const expectedAction = slot.action;

  if (!eventMatchesSlot(slot, event)) {
    return {
      kind: "miss",
      targetBeatIndex: beatIndex,
      deltaMs,
      expectedAction,
      matchedAction: false,
      pointsAwarded: POINTS_MISS,
    };
  }

  const absMs = Math.abs(deltaMs);
  let kind: JudgmentResult["kind"];
  if (absMs <= PERFECT_WINDOW_MS) {
    kind = "perfect";
  } else if (absMs <= GOOD_WINDOW_MS) {
    kind = "good";
  } else {
    kind = "miss";
  }

  return {
    kind,
    targetBeatIndex: beatIndex,
    deltaMs,
    expectedAction,
    matchedAction: true,
    pointsAwarded: pointsForKind(kind),
  };
}

export { ACTION_BLOCK_BEATS } from "@/lib/dance/sequence";
