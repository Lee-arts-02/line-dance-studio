/**
 * Discrete dance action recognition from pose history.
 * Raw video coordinates + mirrored display: user's left = +x torso delta (see step detectors).
 *
 * Built-in vocabulary (main gameplay): `step_left`, `step_right`, `clap` only.
 *
 * Arbitration order:
 * 1. clap — overhead open→close (elbows/forearms; wrists optional)
 * 2. step_left / step_right — clear lateral torso travel
 *
 * Custom user-defined gestures are handled separately by the browser-trained model (`src/lib/ml/`).
 */

import type { DanceActionId } from "@/lib/dance/sequence";
import {
  type PoseHistoryFrame,
  MultiPlayerPoseHistory,
  torsoHorizontalDelta,
} from "./history";
import type { PoseKeypoint, StablePlayerId, TrackedPerson } from "./types";
import { KEYPOINT_CONFIDENCE_THRESHOLD } from "./types";

export type ActionEvent = {
  playerId: StablePlayerId;
  action: DanceActionId;
  /** Same clock as pose history (`performance.now()`). */
  t: number;
};

/** Min frames before action rules run (clap uses dynamic span over the buffer). */
const MIN_HISTORY = 7;
/** Default cooldown between two events of the same action (ms). */
const COOLDOWN_MS = 420;

/** How long the on-stage action label stays visible after an event. */
const DISPLAY_MS = 480;

/** Normalized horizontal step magnitude gate. */
const STEP_DELTA_NORM = 0.026;
/** Stronger displacement — no knee hint required. */
const STEP_STRONG_MULT = 1.38;
/** Weaker displacement allowed if knee hint agrees. */
const STEP_KNEE_MULT = 0.88;

/** Elbows + shoulders for clap (forearms tracked via elbow motion). */
const CLAP_ARM_MIN_SCORE = 0.28;

/** Wrists optional blend only. */
const WRIST_OPTIONAL_MIN = 0.28;

const KNEE_BEND_MIN_NORM = 0.012;

const IDX = {
  nose: 0,
  leftEye: 1,
  rightEye: 2,
  leftShoulder: 5,
  rightShoulder: 6,
  leftElbow: 7,
  rightElbow: 8,
  leftWrist: 9,
  rightWrist: 10,
  leftHip: 11,
  rightHip: 12,
  leftKnee: 13,
  rightKnee: 14,
} as const;

function minScore(kps: PoseKeypoint[], indices: readonly number[]): number {
  let m = 1;
  for (const i of indices) {
    const k = kps[i];
    if (!k) return 0;
    m = Math.min(m, k.score ?? 0);
  }
  return m;
}

/** Require stable shoulders, hips, and elbows for step inference. */
export function poseQualityForActions(
  kps: PoseKeypoint[],
  minS = Math.max(KEYPOINT_CONFIDENCE_THRESHOLD, 0.34)
): boolean {
  const core = [
    IDX.leftShoulder,
    IDX.rightShoulder,
    IDX.leftHip,
    IDX.rightHip,
    IDX.leftElbow,
    IDX.rightElbow,
  ];
  return minScore(kps, core) >= minS;
}

function clapArmGate(kps: PoseKeypoint[]): boolean {
  return (
    minScore(kps, [IDX.leftElbow, IDX.rightElbow, IDX.leftShoulder, IDX.rightShoulder]) >=
    CLAP_ARM_MIN_SCORE
  );
}

function elbowHorizontalSpan(kps: PoseKeypoint[]): number | null {
  const el = kps[IDX.leftElbow];
  const er = kps[IDX.rightElbow];
  if (!el || !er) return null;
  if ((el.score ?? 0) < CLAP_ARM_MIN_SCORE * 0.9 || (er.score ?? 0) < CLAP_ARM_MIN_SCORE * 0.9) {
    return null;
  }
  return Math.abs(el.x - er.x);
}

function wristHorizontalSpanOptional(kps: PoseKeypoint[]): number | null {
  const wL = kps[IDX.leftWrist];
  const wR = kps[IDX.rightWrist];
  if (!wL || !wR) return null;
  if ((wL.score ?? 0) < WRIST_OPTIONAL_MIN || (wR.score ?? 0) < WRIST_OPTIONAL_MIN) return null;
  return Math.abs(wL.x - wR.x);
}

/** Elbow-primary span; blend wrists when confident (forearms). */
function combinedArmSpan(kps: PoseKeypoint[]): number | null {
  const el = elbowHorizontalSpan(kps);
  if (el === null) return null;
  const w = wristHorizontalSpanOptional(kps);
  if (w === null) return el;
  return el * 0.68 + w * 0.32;
}

/**
 * Both elbows in the “high” overhead clap band (relaxed — easier to trigger than the old strict pose).
 * Not a standalone action; only used to qualify clap motion.
 */
function elbowsInHighClapRegion(kps: PoseKeypoint[], frameH: number): boolean {
  const sl = kps[IDX.leftShoulder];
  const sr = kps[IDX.rightShoulder];
  const el = kps[IDX.leftElbow];
  const er = kps[IDX.rightElbow];
  if (!sl || !sr || !el || !er) return false;
  const slack = 0.09 * frameH;
  return el.y < sl.y + slack && er.y < sr.y + slack;
}

/**
 * Overhead clap: high arm region + clear open→close on elbow/forearm span (wrists optional).
 */
function detectDynamicOverheadClap(
  frames: readonly PoseHistoryFrame[],
  frameH: number,
  frameW: number
): DanceActionId | null {
  if (frames.length < MIN_HISTORY) return null;

  const lastK = frames[frames.length - 1].keypoints;
  if (!clapArmGate(lastK) || !elbowsInHighClapRegion(lastK, frameH)) return null;

  const lastSpan = combinedArmSpan(lastK);
  if (lastSpan === null) return null;

  const priorSpans: number[] = [];
  for (let i = 0; i < frames.length - 1; i++) {
    const k = frames[i].keypoints;
    if (!clapArmGate(k) || !elbowsInHighClapRegion(k, frameH)) continue;
    const s = combinedArmSpan(k);
    if (s !== null) priorSpans.push(s);
  }
  if (priorSpans.length < 3) return null;

  const recentMax = Math.max(...priorSpans);
  const openEnough = recentMax >= Math.max(26, 0.034 * frameW);
  const drop = recentMax - lastSpan;
  const dropMin = Math.max(10, 0.01 * frameH);
  if (!openEnough) return null;
  if (drop < dropMin) return null;
  if (lastSpan > recentMax * 0.9) return null;

  const prevK = frames[frames.length - 2].keypoints;
  let prevSpan: number | null = null;
  if (clapArmGate(prevK) && elbowsInHighClapRegion(prevK, frameH)) {
    prevSpan = combinedArmSpan(prevK);
  }
  if (prevSpan !== null && lastSpan >= prevSpan * 0.995) return null;

  return "clap";
}

function kneeBendHintLeft(frames: readonly PoseHistoryFrame[]): boolean {
  if (frames.length < 4) return false;
  const first = frames[0].keypoints;
  const lastFrame = frames[frames.length - 1];
  const lastKp = lastFrame.keypoints;
  const lk0 = first[IDX.leftKnee];
  const lk1 = lastKp[IDX.leftKnee];
  if (!lk0 || !lk1) return false;
  if ((lk0.score ?? 0) < 0.25 || (lk1.score ?? 0) < 0.25) return false;
  const dy = lk1.y - lk0.y;
  const refY = Math.abs(lastKp[IDX.leftHip]?.y ?? lastFrame.torso.y);
  return dy > Math.max(KNEE_BEND_MIN_NORM * refY, 4);
}

function kneeBendHintRight(frames: readonly PoseHistoryFrame[]): boolean {
  if (frames.length < 4) return false;
  const first = frames[0].keypoints;
  const lastFrame = frames[frames.length - 1];
  const lastKp = lastFrame.keypoints;
  const rk0 = first[IDX.rightKnee];
  const rk1 = lastKp[IDX.rightKnee];
  if (!rk0 || !rk1) return false;
  if ((rk0.score ?? 0) < 0.25 || (rk1.score ?? 0) < 0.25) return false;
  const dy = rk1.y - rk0.y;
  const refY = Math.abs(lastKp[IDX.rightHip]?.y ?? lastFrame.torso.y);
  return dy > Math.max(KNEE_BEND_MIN_NORM * refY, 4);
}

/**
 * User-view STEP LEFT (mirrored display): torso moves toward the user’s left → +x in raw webcam space.
 */
function detectStepLeft(
  frames: readonly PoseHistoryFrame[],
  frameSize: number
): DanceActionId | null {
  const d = torsoHorizontalDelta(frames);
  if (d === null || frameSize <= 0) return null;
  const norm = d / frameSize;
  if (norm < STEP_DELTA_NORM) return null;
  const mag = Math.abs(norm);
  if (mag >= STEP_DELTA_NORM * STEP_STRONG_MULT) return "step_left";
  if (mag >= STEP_DELTA_NORM * STEP_KNEE_MULT && kneeBendHintLeft(frames)) return "step_left";
  return null;
}

/**
 * User-view STEP RIGHT: torso moves toward the user’s right → −x in raw webcam space.
 */
function detectStepRight(
  frames: readonly PoseHistoryFrame[],
  frameSize: number
): DanceActionId | null {
  const d = torsoHorizontalDelta(frames);
  if (d === null || frameSize <= 0) return null;
  const norm = d / frameSize;
  if (norm > -STEP_DELTA_NORM) return null;
  const mag = Math.abs(norm);
  if (mag >= STEP_DELTA_NORM * STEP_STRONG_MULT) return "step_right";
  if (mag >= STEP_DELTA_NORM * STEP_KNEE_MULT && kneeBendHintRight(frames)) return "step_right";
  return null;
}

function cooldownKey(playerId: StablePlayerId, action: DanceActionId): string {
  return `${playerId}:${action}`;
}

export function formatActionLabel(action: DanceActionId): string {
  switch (action) {
    case "step_left":
      return "STEP LEFT";
    case "step_right":
      return "STEP RIGHT";
    case "clap":
      return "CLAP";
    default:
      return action;
  }
}

/** Last discrete event (for debug — does not expire). */
export type PlayerActionSnapshot = {
  playerId: StablePlayerId;
  lastAction: DanceActionId | null;
  lastActionTime: number | null;
};

/** Short-lived label for canvas (expires automatically). */
export type EphemeralActionDisplay = {
  playerId: StablePlayerId;
  action: DanceActionId | null;
};

/**
 * Rolling history + per-action cooldowns; emits at most one discrete event per player per frame.
 */
export class ActionRecognitionEngine {
  private readonly history: MultiPlayerPoseHistory;
  private readonly lastFire = new Map<string, number>();
  private readonly lastSnapshot = new Map<StablePlayerId, PlayerActionSnapshot>();
  private readonly ephemeral = new Map<StablePlayerId, { action: DanceActionId; until: number }>();

  constructor(historyFrames = 14) {
    this.history = new MultiPlayerPoseHistory(historyFrames);
  }

  process(
    people: TrackedPerson[],
    now: number,
    frameMaxDimension: number,
    frameHeight: number
  ): ActionEvent[] {
    const ids = new Set(people.map((p) => p.playerId));
    this.history.pruneMissing(ids);

    for (const p of people) {
      this.history.push({
        t: now,
        playerId: p.playerId,
        torso: p.torso,
        keypoints: p.keypoints,
      });
    }

    const events: ActionEvent[] = [];

    for (const p of people) {
      if (!poseQualityForActions(p.keypoints)) continue;

      const h = this.history.historyFor(p.playerId);
      const frames = h?.all;
      if (!frames || frames.length < MIN_HISTORY) continue;

      const clapCandidate = detectDynamicOverheadClap(
        frames,
        frameHeight,
        frameMaxDimension
      );
      const stepLeftCandidate = detectStepLeft(frames, frameMaxDimension);
      const stepRightCandidate = detectStepRight(frames, frameMaxDimension);

      let chosen: DanceActionId | null = clapCandidate;
      if (!chosen) chosen = stepLeftCandidate;
      if (!chosen) chosen = stepRightCandidate;

      if (!chosen) continue;
      if (!this.canFire(p.playerId, chosen, now)) continue;

      this.lastFire.set(cooldownKey(p.playerId, chosen), now);
      events.push({ playerId: p.playerId, action: chosen, t: now });
      this.lastSnapshot.set(p.playerId, {
        playerId: p.playerId,
        lastAction: chosen,
        lastActionTime: now,
      });
      this.ephemeral.set(p.playerId, { action: chosen, until: now + DISPLAY_MS });
    }

    return events;
  }

  private canFire(playerId: StablePlayerId, action: DanceActionId, now: number): boolean {
    const prev = this.lastFire.get(cooldownKey(playerId, action));
    if (prev === undefined) return true;
    return now - prev >= COOLDOWN_MS;
  }

  /** Short-lived action text for the stage (expires ~DISPLAY_MS after the event). */
  getEphemeralForCanvas(now: number, activeIds: readonly StablePlayerId[]): EphemeralActionDisplay[] {
    return activeIds.map((id) => {
      const e = this.ephemeral.get(id);
      if (!e || now >= e.until) {
        return { playerId: id, action: null };
      }
      return { playerId: id, action: e.action };
    });
  }

  getSnapshotsForPlayers(activeIds: readonly StablePlayerId[]): PlayerActionSnapshot[] {
    return activeIds.map((id) => {
      return (
        this.lastSnapshot.get(id) ?? {
          playerId: id,
          lastAction: null,
          lastActionTime: null,
        }
      );
    });
  }

  reset(): void {
    this.history.clear();
    this.lastFire.clear();
    this.lastSnapshot.clear();
    this.ephemeral.clear();
  }
}
