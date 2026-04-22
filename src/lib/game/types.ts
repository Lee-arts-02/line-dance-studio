/**
 * Beat-matching types — sequence actions may be default (`DanceActionId`) or custom strings.
 */

import type { StablePlayerId } from "@/lib/pose/types";
import type { DanceActionId, SequenceActionId } from "@/lib/dance/sequence";

/** @deprecated Prefer SequenceActionId — default-only vocabulary */
export type GameActionId = DanceActionId;

/** How a player action was detected for judgment routing. */
export type ActionDetectionSource = "default_rules" | "custom_model";

/**
 * One detected player gesture tied to audio clock for beat alignment.
 * `action` is always a normalized string (`step_left`, or a custom label from TF.js).
 */
export type PlayerActionEvent = {
  playerId: StablePlayerId;
  action: string;
  detectionSource: ActionDetectionSource;
  /** `performance.now()` when the pose pipeline emitted the event (debug / UI). */
  tPerf: number;
  /** `HTMLAudioElement.currentTime` in seconds at that moment — source for beat float. */
  audioTimeSec: number;
};

/** Expected step for an action beat (legacy helper shape). */
export type SequenceTarget = {
  blockIndex: number;
  expectedAction: SequenceActionId;
};

/** Discrete rhythm-game judgment tiers. */
export type JudgmentKind = "perfect" | "good" | "miss";

/**
 * Result of comparing one action to an action beat’s expected step.
 * `targetBeatIndex` is the global integer beat index (floor) for that action beat.
 */
export type JudgmentResult = {
  kind: JudgmentKind;
  targetBeatIndex: number;
  deltaMs: number;
  expectedAction: SequenceActionId;
  matchedAction: boolean;
  pointsAwarded: number;
};

/** Per-player scoring + judgment display state (client-side Step 5). */
export type PlayerScoreState = {
  totalScore: number;
  combo: number;
  latestJudgment: JudgmentKind | null;
  latestExpectedAction: SequenceActionId | null;
  lastJudgedBeatIndex: number | null;
  judgmentVisibleUntilPerf: number;
};

/** Step 6: UI label for team cohesion (thresholds in `groupSync.ts`). */
export type GroupSyncStatusLabel = "tight" | "good" | "loose";

/**
 * One finalized team sync evaluation for one action+rest pair (after the pair’s window closes).
 */
export type GroupSyncBeatResult = {
  blockIndex: number;
  blockStartBeat: number;
  expectedAction: SequenceActionId;
  activePlayerCount: number;
  correctPlayerCount: number;
  groupAccuracy: number;
  timeSpreadMs: number | null;
  timeSpreadMeaningful: boolean;
  groupSyncRate: number;
  statusLabel: GroupSyncStatusLabel;
};

export type IndividualAccuracyReport = {
  playerId: StablePlayerId;
  judgedCount: number;
  correctCount: number;
  averageAccuracy: number;
};

export type GroupSyncIntervalReport = {
  intervalStartSec: number;
  intervalEndSec: number;
  /** Wall-clock span of this window (first → last finalized pair in the chunk). */
  intervalMs: number;
  /** Musical beats covered by this summary (one pair finalize = 2 beats). */
  intervalBeats: number;
  evaluatedBlockCount: number;
  individualAccuracies: IndividualAccuracyReport[];
  overallGroupSync: number;
  overallGroupAccuracy: number;
};
